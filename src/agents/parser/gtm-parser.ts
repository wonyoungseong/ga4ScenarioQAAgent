/**
 * GTM Parser - GTM Container JSON → EventScenarioSpec + ParameterSpec
 *
 * GTM Export JSON을 파싱하여 2차 QA 이벤트 검수의 "정답지"를 생성합니다.
 *
 * 추출 대상:
 * 1. GA4 이벤트 태그 (gaawe) → EventDefinition[]
 * 2. 트리거 분석 → EventTriggerInfo[] (동적 추출)
 * 3. Content Group 규칙 → ContentGroupRule[]
 * 4. 파라미터 스펙 → ParameterSpec
 * 5. Pre-Requirement Excel → URL + page_type → ScenarioDefinition[]
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseExcel, type ExcelURLEntry } from './excel-parser';

import type {
  PageTypeEnum,
  TriggerType,
} from '../../types/common';

import type {
  EventScenarioSpec,
  EventDefinition,
  ScenarioDefinition,
  PageEventRule,
  UserAction,
  UserActionType,
  ExpectedEvent,
  EventFireCondition,
  ConditionalEventRule,
} from '../../types/event-scenario';
import { DEFAULT_CHANNEL_ENABLED } from '../../types/event-scenario';

import type { ChannelCombination } from '../../types/common';

import type { DevGuideEventHint } from '../../types/devguide';

import type {
  CrossReferenceWarning,
  CrossReferenceResult,
  GTMEventFacts,
  DevGuideEventFacts,
  SourceProvenance,
} from '../../knowledge/source-authority';
import {
  crossValidateEvent,
  classifyEvent,
  buildDevGuideFactsMap,
  PAGE_TYPE_TO_CONTENT_GROUP,
  SYNTHETIC_SCENARIO_CONFIGS,
} from '../../knowledge/source-authority';

import { enrichWithKnowledgeSubScenarios } from './knowledge-enricher';

import type {
  ParameterSpec,
  EventParameterSpec,
  ParameterDefinition,
} from '../../types/parameter-spec';

import type {
  GTMContainer,
  GTMTrigger,
  GTMParameter,
  GTMTriggerType,
  GTMExtractedGA4Event,
  GTMExtractedParameter,
} from '../../types/gtm-container';
import {
  GA4_EVENT_TAG_TYPE,
  GA4_CONFIG_TAG_TYPE,
  GOOGLE_TAG_TYPE,
  GA4_EVENT_NAME_PARAM_KEY,
  GA4_EVENT_PARAMS_KEY,
  GA4_USER_PROPERTIES_KEY,
} from '../../types/gtm-container';

// ─────────────────────────────────────────────────────────────────────
// Types (계약 타입은 src/types/content-group.ts에서 관리)
// ─────────────────────────────────────────────────────────────────────

// Re-export shared types for backward compatibility
export type {
  ContentGroupRule,
  ActionEventRule,
  GTMParserOutput,
} from '../../types/content-group';

import type {
  ContentGroupRule,
  ActionEventRule,
  GTMParserOutput,
} from '../../types/content-group';

export interface GTMParserOptions {
  domain?: string;
  domainMapping?: { from: string; to: string };
}

/** GTM 트리거 분석 결과 (이벤트별) */
export interface EventTriggerInfo {
  event_name: string;
  tag_id: string;
  tag_name: string;
  gtm_trigger_type: GTMTriggerType;
  fire_condition: EventFireCondition;

  /** dataLayer custom event name (CUSTOM_EVENT trigger) */
  custom_event_name?: string;
  /** Content Group 필터 regex (트리거 조건) */
  content_group_filter?: string;
  /** CSS 선택자 (CLICK/LINK_CLICK trigger) */
  css_selector?: string;
  /** 기타 필터 조건 설명 */
  additional_filters: string[];

  /** 테스트 가능성 */
  testability: 'auto' | 'action' | 'conditional' | 'manual_only';
  /** 추론된 페이지 타입 */
  inferred_page_types: PageTypeEnum[];
  /** 시뮬레이션 액션 타입 */
  action_type: UserActionType;
  /** 액션 시뮬레이션용 CSS 선택자 */
  target_selector?: string;
  /** 액션 후 대기 시간 */
  wait_after_ms: number;

  /** DevGuide 원문 발생 시점 ("DOM Ready 시점", "장바구니 담기 클릭 시" 등) */
  devguide_fire_timing?: string;
  /** dataLayer push 이벤트명 (DevGuide 권위) */
  dataLayer_event_names?: string[];
  /** 각 필드의 출처 추적 */
  _source_provenance?: Record<string, SourceProvenance>;
  /** 교차 검증 경고 */
  cross_reference_warnings?: CrossReferenceWarning[];
}

// ─────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────

/**
 * PAGE_TYPE_CONTENT_GROUP은 source-authority.ts의
 * PAGE_TYPE_TO_CONTENT_GROUP으로 통합되었습니다.
 */

/** 모든 QA 대상 페이지 타입 */
const ALL_PAGE_TYPES: PageTypeEnum[] = [
  'MAIN', 'PRODUCT_LIST', 'PRODUCT_DETAIL', 'EVENT_LIST', 'EVENT_DETAIL',
  'SEARCH', 'CART', 'CHECKOUT', 'ORDER_COMPLETE', 'MY_PAGE', 'OTHERS',
];

/**
 * CUSTOM_EVENT_PAGE_HINTS는 src/knowledge/source-authority.ts로 이동되었습니다.
 * FALLBACK_CUSTOM_EVENT_HINTS로 이름이 변경되었으며,
 * DevGuide PDF가 없을 때만 최하위 폴백으로 사용됩니다.
 */

/**
 * Content Group 값 → 페이지 타입 매핑은
 * src/knowledge/source-authority.ts로 이동되었습니다.
 */

/** 특정 페이지에서 발생하면 안 되는 이벤트 (비즈니스 규칙) */
const FORBIDDEN_EVENTS_BY_PAGE: Partial<Record<string, string[]>> = {
  MAIN: ['purchase', 'add_to_cart', 'view_item'],
  PRODUCT_LIST: ['purchase'],
  EVENT_LIST: ['purchase'],
  SEARCH: ['purchase'],
  PRODUCT_DETAIL: ['view_item_list'],
  EVENT_DETAIL: ['view_item'],
  ORDER_COMPLETE: ['add_to_cart'],
};

// ─────────────────────────────────────────────────────────────────────
// GTM JSON → Extracted Events
// ─────────────────────────────────────────────────────────────────────

function getParamValue(params: GTMParameter[] | undefined, key: string): string | undefined {
  if (!params) return undefined;
  const param = params.find(p => p.key === key);
  return param?.value;
}

function getParamList(params: GTMParameter[] | undefined, key: string): GTMParameter[] | undefined {
  if (!params) return undefined;
  const param = params.find(p => p.key === key);
  return param?.list;
}

function extractVariableRef(value: string): string | undefined {
  const match = value.match(/\{\{([^}]+)\}\}/);
  return match ? match[1] : undefined;
}

function extractGA4Events(container: GTMContainer): GTMExtractedGA4Event[] {
  const tags = container.containerVersion.tag || [];
  const triggers = container.containerVersion.trigger || [];
  const triggerMap = new Map<string, GTMTrigger>();
  for (const t of triggers) {
    triggerMap.set(t.triggerId, t);
  }

  const ga4Events: GTMExtractedGA4Event[] = [];

  for (const tag of tags) {
    if (tag.type !== GA4_EVENT_TAG_TYPE) continue;
    if (tag.paused) continue;

    const eventName = getParamValue(tag.parameter, GA4_EVENT_NAME_PARAM_KEY) || '';
    if (!eventName) continue;

    // Resolve event name (may be a variable reference)
    let resolvedEventName = eventName.replace(/\{\{[^}]+\}\}/g, '').trim() || eventName;

    // GTM 변수 참조 해석: {{JS - YouTube Status for Event}} → youtube_video
    if (eventName.toLowerCase().includes('youtube')) {
      resolvedEventName = 'youtube_video';
    }

    // Extract parameters
    const paramList = getParamList(tag.parameter, GA4_EVENT_PARAMS_KEY) || [];
    const parameters: GTMExtractedParameter[] = [];
    for (const p of paramList) {
      if (p.map) {
        let paramKey = '';
        let paramValue = '';
        for (const m of p.map) {
          if (m.key === 'name') paramKey = m.value || '';
          if (m.key === 'value') paramValue = m.value || '';
        }
        if (paramKey) {
          const varRef = extractVariableRef(paramValue);
          parameters.push({
            key: paramKey,
            value: paramValue,
            is_variable_reference: !!varRef,
            referenced_variable: varRef,
          });
        }
      }
    }

    // Extract user properties
    const upList = getParamList(tag.parameter, GA4_USER_PROPERTIES_KEY) || [];
    const userProperties: GTMExtractedParameter[] = [];
    for (const p of upList) {
      if (p.map) {
        let paramKey = '';
        let paramValue = '';
        for (const m of p.map) {
          if (m.key === 'name') paramKey = m.value || '';
          if (m.key === 'value') paramValue = m.value || '';
        }
        if (paramKey) {
          const varRef = extractVariableRef(paramValue);
          userProperties.push({
            key: paramKey,
            value: paramValue,
            is_variable_reference: !!varRef,
            referenced_variable: varRef,
          });
        }
      }
    }

    // Resolve trigger names
    const firingTriggers: string[] = [];
    for (const tid of (tag.firingTriggerId || [])) {
      const trigger = triggerMap.get(tid);
      firingTriggers.push(trigger?.name || `trigger_${tid}`);
    }

    const blockingTriggers: string[] = [];
    for (const tid of (tag.blockingTriggerId || [])) {
      const trigger = triggerMap.get(tid);
      blockingTriggers.push(trigger?.name || `trigger_${tid}`);
    }

    ga4Events.push({
      tag_id: tag.tagId,
      tag_name: tag.name,
      event_name: resolvedEventName,
      parameters,
      user_properties: userProperties.length > 0 ? userProperties : undefined,
      firing_triggers: firingTriggers,
      blocking_triggers: blockingTriggers.length > 0 ? blockingTriggers : undefined,
      paused: tag.paused,
    });
  }

  return ga4Events;
}

// ─────────────────────────────────────────────────────────────────────
// Trigger → fire_condition mapping
// ─────────────────────────────────────────────────────────────────────

function mapTriggerTypeToFireCondition(triggerType: GTMTriggerType): EventFireCondition {
  switch (triggerType) {
    case 'PAGEVIEW':
    case 'DOM_READY':
    case 'WINDOW_LOADED':
    case 'INIT':
    case 'CONSENT_INIT':
      return 'auto_fire';
    case 'CUSTOM_EVENT':
    case 'CLICK':
    case 'LINK_CLICK':
    case 'FORM_SUBMIT':
    case 'SCROLL_DEPTH':
    case 'ELEMENT_VISIBILITY':
    case 'HISTORY_CHANGE':
      return 'user_action';
    case 'TIMER':
      return 'conditional';
    default:
      return 'user_action';
  }
}

function mapTriggerTypeToTriggerType(triggerType: GTMTriggerType): TriggerType {
  switch (triggerType) {
    case 'PAGEVIEW':
    case 'DOM_READY':
    case 'WINDOW_LOADED':
    case 'INIT':
    case 'CONSENT_INIT':
      return 'pageLoad';
    case 'CLICK':
    case 'LINK_CLICK':
      return 'click';
    case 'SCROLL_DEPTH':
      return 'scroll';
    case 'FORM_SUBMIT':
      return 'submit';
    case 'TIMER':
      return 'timer';
    default:
      return 'custom';
  }
}

// ─────────────────────────────────────────────────────────────────────
// GTM Trigger Analysis (동적 추출)
// ─────────────────────────────────────────────────────────────────────

/**
 * STEP 1: GTM 사실 추출 (순수 GTM 데이터만)
 *
 * GTM JSON에서 트리거 타입, custom event filter, content group filter,
 * CSS 선택자 등을 동적으로 추출합니다.
 */
function extractGTMFacts(
  ga4Event: GTMExtractedGA4Event,
  triggerMap: Map<string, GTMTrigger>,
): GTMEventFacts {
  // Find the primary firing trigger
  let primaryTrigger: GTMTrigger | undefined;
  for (const triggerName of ga4Event.firing_triggers) {
    const trigger = triggerMap.get(triggerName);
    if (trigger) {
      primaryTrigger = trigger;
      break;
    }
  }

  if (!primaryTrigger) {
    return {
      event_name: ga4Event.event_name,
      tag_id: ga4Event.tag_id,
      tag_name: ga4Event.tag_name,
      gtm_trigger_type: 'CUSTOM_EVENT',
      additional_filters: [],
      gtm_param_keys: ga4Event.parameters.map(p => p.key),
    };
  }

  const triggerType = primaryTrigger.type as GTMTriggerType;

  let customEventName: string | undefined;
  let contentGroupFilter: string | undefined;
  let cssSelector: string | undefined;
  const additionalFilters: string[] = [];

  // Extract custom event name from customEventFilter
  if (primaryTrigger.customEventFilter) {
    for (const f of primaryTrigger.customEventFilter) {
      let arg1 = '';
      for (const p of f.parameter || []) {
        if (p.key === 'arg1') arg1 = p.value || '';
      }
      if (arg1) customEventName = arg1;
    }
  }

  // Extract filter conditions
  if (primaryTrigger.filter) {
    for (const f of primaryTrigger.filter) {
      let arg0 = '';
      let arg1 = '';
      for (const p of f.parameter || []) {
        if (p.key === 'arg0') arg0 = p.value || '';
        if (p.key === 'arg1') arg1 = p.value || '';
      }

      if (arg0.includes('Content Group') && arg1) {
        contentGroupFilter = arg1;
      } else if (f.type === 'CSS_SELECTOR' || arg0.includes('Click Element')) {
        cssSelector = arg1;
      } else if (arg0 && arg1) {
        additionalFilters.push(`${f.type || ''} ${arg0} = "${arg1}"`);
      }
    }
  }

  // Check secondary triggers for CSS selectors
  for (const triggerName of ga4Event.firing_triggers) {
    const trigger = triggerMap.get(triggerName);
    if (trigger && trigger !== primaryTrigger) {
      if (trigger.type === 'CLICK' || trigger.type === 'LINK_CLICK') {
        for (const f of trigger.filter || []) {
          if (f.type === 'CSS_SELECTOR') {
            let arg1 = '';
            for (const p of f.parameter || []) {
              if (p.key === 'arg1') arg1 = p.value || '';
            }
            if (arg1 && !cssSelector) cssSelector = arg1;
          }
        }
      }
    }
  }

  return {
    event_name: ga4Event.event_name,
    tag_id: ga4Event.tag_id,
    tag_name: ga4Event.tag_name,
    gtm_trigger_type: triggerType,
    custom_event_name: customEventName,
    content_group_filter: contentGroupFilter,
    css_selector: cssSelector,
    additional_filters: additionalFilters,
    gtm_param_keys: ga4Event.parameters.map(p => p.key),
  };
}

/**
 * STEP 2: DevGuide 매칭 - dataLayer 이벤트명으로 GTM 이벤트와 DevGuide 매칭
 */
function matchDevGuideFacts(
  gtmFacts: GTMEventFacts,
  devGuideFactsMap: Map<string, DevGuideEventFacts> | undefined,
): DevGuideEventFacts | undefined {
  if (!devGuideFactsMap) return undefined;

  // 1. custom_event_name으로 직접 매칭 (CUSTOM_EVENT 트리거)
  if (gtmFacts.custom_event_name) {
    const byDL = devGuideFactsMap.get(gtmFacts.custom_event_name);
    if (byDL) return byDL;
  }

  // 2. GA4 이벤트명으로 직접 매칭
  const byGA4 = devGuideFactsMap.get(gtmFacts.event_name);
  if (byGA4) return byGA4;

  return undefined;
}

/**
 * GA4 이벤트 태그의 트리거를 분석하여 EventTriggerInfo를 생성합니다.
 *
 * 4단계 프로세스 (Source Authority 기반):
 * 1. extractGTMFacts: GTM JSON에서 순수 사실 추출
 * 2. matchDevGuideFacts: dataLayer 이벤트명으로 DevGuide 매칭
 * 3. crossValidateEvent: 소스 간 일관성 교차 검증
 * 4. classifyEvent: Source Authority Matrix 적용하여 최종 분류
 */
function analyzeEventTriggers(
  ga4Events: GTMExtractedGA4Event[],
  container: GTMContainer,
  devGuideHints?: DevGuideEventHint[],
  dataLayerToGA4Map?: Record<string, string>,
): { triggerInfos: EventTriggerInfo[]; crossRefResults: CrossReferenceResult[] } {
  const triggers = container.containerVersion.trigger || [];
  const triggerMap = new Map<string, GTMTrigger>();
  for (const t of triggers) {
    triggerMap.set(t.name, t);
    triggerMap.set(t.triggerId, t);
  }

  // Build DevGuide facts map
  const devGuideFactsMap = devGuideHints
    ? buildDevGuideFactsMap(devGuideHints, dataLayerToGA4Map || {})
    : undefined;

  const triggerInfos: EventTriggerInfo[] = [];
  const crossRefResults: CrossReferenceResult[] = [];
  const seenEvents = new Set<string>();

  for (const ga4Event of ga4Events) {
    if (seenEvents.has(ga4Event.event_name)) continue;
    seenEvents.add(ga4Event.event_name);

    // STEP 1: GTM 사실 추출
    const gtmFacts = extractGTMFacts(ga4Event, triggerMap);

    // STEP 2: DevGuide 매칭
    const devGuideFacts = matchDevGuideFacts(gtmFacts, devGuideFactsMap);

    // STEP 3: 교차 검증
    const crossRefResult = crossValidateEvent(ga4Event.event_name, gtmFacts, devGuideFacts);
    if (crossRefResult.warnings.length > 0) {
      crossRefResults.push(crossRefResult);
    }

    // STEP 4: 권위자 기반 분류
    const classified = classifyEvent(gtmFacts, devGuideFacts, crossRefResult);

    triggerInfos.push({
      event_name: classified.event_name,
      tag_id: ga4Event.tag_id,
      tag_name: ga4Event.tag_name,
      gtm_trigger_type: classified.gtm_trigger_type,
      fire_condition: classified.fire_condition,
      custom_event_name: classified.custom_event_name,
      content_group_filter: classified.content_group_filter,
      css_selector: classified.css_selector,
      additional_filters: gtmFacts.additional_filters,
      testability: classified.testability,
      inferred_page_types: classified.inferred_page_types,
      action_type: classified.action_type,
      target_selector: classified.target_selector,
      wait_after_ms: classified.wait_after_ms,
      devguide_fire_timing: classified.devguide_fire_timing,
      dataLayer_event_names: classified.dataLayer_event_names,
      _source_provenance: classified._source_provenance,
      cross_reference_warnings: classified.cross_reference_warnings.length > 0
        ? classified.cross_reference_warnings
        : undefined,
    });
  }

  return { triggerInfos, crossRefResults };
}

// ─────────────────────────────────────────────────────────────────────
// Dynamic Page Event Map (replaces hardcoded PAGE_EVENT_MAP)
// ─────────────────────────────────────────────────────────────────────

interface PageEventMapping {
  auto_fire: string[];
  action_events: ActionEventRule[];
  forbidden: string[];
}

/**
 * 트리거 분석 결과로부터 페이지별 이벤트 매핑을 동적으로 구축합니다.
 */
function buildDynamicPageEventMap(
  triggerInfos: EventTriggerInfo[],
): Record<string, PageEventMapping> {
  const map: Record<string, PageEventMapping> = {};
  for (const pt of ALL_PAGE_TYPES) {
    map[pt] = { auto_fire: ['page_view'], action_events: [], forbidden: [] };
  }

  for (const info of triggerInfos) {
    // Skip manual_only events
    if (info.testability === 'manual_only') continue;

    // Skip conditional events with no specific page mapping
    if (info.testability === 'conditional' &&
        info.inferred_page_types.length === ALL_PAGE_TYPES.length) {
      continue;
    }

    for (const pageType of info.inferred_page_types) {
      if (!map[pageType]) continue;

      if (info.fire_condition === 'auto_fire' && info.testability === 'auto') {
        // Auto-fire: event fires on page load
        if (!map[pageType].auto_fire.includes(info.event_name)) {
          map[pageType].auto_fire.push(info.event_name);
        }
      } else if (info.testability === 'action') {
        // Action: requires user interaction to fire
        const existing = map[pageType].action_events.find(a => a.event_name === info.event_name);
        if (!existing) {
          map[pageType].action_events.push({
            event_name: info.event_name,
            action_type: info.action_type,
            trigger_condition: info.custom_event_name
              ? `CUSTOM_EVENT: ${info.custom_event_name}`
              : `${info.gtm_trigger_type}${info.css_selector ? ` (${info.css_selector})` : ''}`,
            target_selector: info.target_selector,
            wait_after_ms: info.wait_after_ms,
          });
        }
      }
    }
  }

  // Add forbidden events from business rules
  for (const [pageType, forbidden] of Object.entries(FORBIDDEN_EVENTS_BY_PAGE)) {
    if (map[pageType] && forbidden) {
      map[pageType].forbidden = forbidden;
    }
  }

  return map;
}

// ─────────────────────────────────────────────────────────────────────
// Event Definitions
// ─────────────────────────────────────────────────────────────────────

function categorizeEvent(eventName: string): 'pageview' | 'ecommerce' | 'engagement' | 'conversion' | 'custom' {
  const ecommerceEvents = [
    'view_item', 'view_item_list', 'select_item', 'add_to_cart',
    'remove_from_cart', 'view_cart', 'begin_checkout', 'add_shipping_info',
    'add_payment_info', 'purchase', 'refund', 'view_search_results',
    'select_promotion', 'view_promotion',
  ];
  if (eventName === 'page_view' || eventName === 'virtual_page_view') return 'pageview';
  if (ecommerceEvents.includes(eventName)) return 'ecommerce';
  if (eventName === 'purchase' || eventName === 'sign_up') return 'conversion';
  if (eventName === 'scroll' || eventName === 'ap_click' || eventName === 'page_load_time') return 'engagement';
  return 'custom';
}

function buildEventDefinitions(
  ga4Events: GTMExtractedGA4Event[],
  container: GTMContainer,
  pageEventMap: Record<string, PageEventMapping>,
): EventDefinition[] {
  const triggers = container.containerVersion.trigger || [];
  const triggerMap = new Map<string, GTMTrigger>();
  for (const t of triggers) {
    triggerMap.set(t.name, t);
  }

  const eventDefs: EventDefinition[] = [];
  const seenEvents = new Set<string>();

  // GA4 Config Tag (gaawc) 또는 Google Tag (googtag) 존재 시 page_view 추가
  const tags = container.containerVersion.tag || [];
  const hasGA4Config = tags.some(t => t.type === GA4_CONFIG_TAG_TYPE || t.type === GOOGLE_TAG_TYPE);
  if (hasGA4Config) {
    seenEvents.add('page_view');
    eventDefs.push({
      event_id: 'evt_config_page_view',
      event_name: 'page_view',
      ga4_event_name: 'page_view',
      category: 'pageview',
      trigger_type: 'pageLoad',
      fire_condition: 'auto_fire',
      allowed_page_types: [...ALL_PAGE_TYPES],
      enabled_channels: { ...DEFAULT_CHANNEL_ENABLED },
    });
  }

  for (const ga4Event of ga4Events) {
    if (seenEvents.has(ga4Event.event_name)) continue;
    seenEvents.add(ga4Event.event_name);

    // Determine fire condition from triggers
    let fireCondition: EventFireCondition = 'user_action';
    let triggerType: TriggerType = 'custom';

    for (const triggerName of ga4Event.firing_triggers) {
      const trigger = triggerMap.get(triggerName);
      if (trigger) {
        fireCondition = mapTriggerTypeToFireCondition(trigger.type as GTMTriggerType);
        triggerType = mapTriggerTypeToTriggerType(trigger.type as GTMTriggerType);
        break;
      }
    }

    // Determine allowed/forbidden page types from dynamic map
    const allowedPageTypes: PageTypeEnum[] = [];
    const forbiddenPageTypes: PageTypeEnum[] = [];
    for (const [pt, mapping] of Object.entries(pageEventMap)) {
      const allEvents = [...mapping.auto_fire, ...mapping.action_events.map(a => a.event_name)];
      if (allEvents.includes(ga4Event.event_name)) {
        allowedPageTypes.push(pt as PageTypeEnum);
      }
      if (mapping.forbidden.includes(ga4Event.event_name)) {
        forbiddenPageTypes.push(pt as PageTypeEnum);
      }
    }

    eventDefs.push({
      event_id: `evt_${ga4Event.tag_id}`,
      event_name: ga4Event.event_name,
      ga4_event_name: ga4Event.event_name,
      category: categorizeEvent(ga4Event.event_name),
      trigger_type: triggerType,
      fire_condition: fireCondition,
      allowed_page_types: allowedPageTypes.length > 0
        ? allowedPageTypes
        : [...ALL_PAGE_TYPES],
      forbidden_page_types: forbiddenPageTypes.length > 0 ? forbiddenPageTypes : undefined,
      enabled_channels: { ...DEFAULT_CHANNEL_ENABLED },
    });
  }

  return eventDefs;
}

// ─────────────────────────────────────────────────────────────────────
// Content Group Rules
// ─────────────────────────────────────────────────────────────────────

function buildContentGroupRules(
  pageEventMap: Record<string, PageEventMapping>,
): ContentGroupRule[] {
  const rules: ContentGroupRule[] = [];

  for (const [pageType, mapping] of Object.entries(pageEventMap)) {
    rules.push({
      page_type: pageType as PageTypeEnum,
      content_group_value: PAGE_TYPE_TO_CONTENT_GROUP[pageType as PageTypeEnum] || pageType,
      auto_fire_events: mapping.auto_fire,
      action_events: mapping.action_events,
      forbidden_events: mapping.forbidden,
    });
  }

  return rules;
}

// ─────────────────────────────────────────────────────────────────────
// Parameter Spec
// ─────────────────────────────────────────────────────────────────────

function buildParameterSpec(ga4Events: GTMExtractedGA4Event[]): ParameterSpec {
  const eventSpecs: EventParameterSpec[] = [];
  const seenEvents = new Set<string>();

  for (const ga4Event of ga4Events) {
    if (seenEvents.has(ga4Event.event_name)) continue;
    seenEvents.add(ga4Event.event_name);

    // Collect all parameters across all tags for this event name
    const allParams = ga4Events
      .filter(e => e.event_name === ga4Event.event_name)
      .flatMap(e => e.parameters);

    // Deduplicate by key
    const paramMap = new Map<string, GTMExtractedParameter>();
    for (const p of allParams) {
      if (!paramMap.has(p.key)) {
        paramMap.set(p.key, p);
      }
    }

    const eventLevelParams: ParameterDefinition[] = [];
    const itemLevelParams: ParameterDefinition[] = [];

    for (const [key, param] of Array.from(paramMap.entries())) {
      const isItemLevel = key.startsWith('items.') || key === 'items';
      const paramDef: ParameterDefinition = {
        param_id: `param_${ga4Event.event_name}_${key}`,
        param_name: key,
        ga4_param: key,
        gtm_variable: param.referenced_variable,
        level: isItemLevel ? 'item_level' : 'event_level',
        category: isStandardGA4Param(key) ? 'standard' : isEcommerceParam(key) ? 'ecommerce' : 'custom',
        data_type: 'string',
        required: true,
        validation: {
          allow_null: false,
          allow_empty_string: false,
        },
      };

      if (isItemLevel) {
        itemLevelParams.push(paramDef);
      } else {
        eventLevelParams.push(paramDef);
      }
    }

    eventSpecs.push({
      event_id: `evt_${ga4Event.tag_id}`,
      event_name: ga4Event.event_name,
      ga4_event_name: ga4Event.event_name,
      event_level_params: eventLevelParams,
      item_level_params: itemLevelParams.length > 0 ? itemLevelParams : undefined,
      required_params_count: eventLevelParams.filter(p => p.required).length,
      total_params_count: eventLevelParams.length + itemLevelParams.length,
    });
  }

  const totalParams = eventSpecs.reduce((sum, s) => sum + s.total_params_count, 0);
  const requiredParams = eventSpecs.reduce((sum, s) => sum + s.required_params_count, 0);

  return {
    project_id: 'innisfree-jp',
    brand_id: 'innisfree',
    version: '2.0',
    created_at: new Date().toISOString(),
    event_specs: eventSpecs,
    total_events: eventSpecs.length,
    total_parameters: totalParams,
    required_parameters: requiredParams,
  };
}

function isStandardGA4Param(key: string): boolean {
  const stdParams = ['currency', 'value', 'transaction_id', 'coupon', 'shipping', 'tax', 'payment_type', 'shipping_tier', 'item_list_id', 'item_list_name'];
  return stdParams.includes(key);
}

function isEcommerceParam(key: string): boolean {
  const ecomParams = ['item_id', 'item_name', 'item_brand', 'item_category', 'item_variant', 'price', 'quantity', 'index', 'affiliation', 'discount', 'creative_name', 'creative_slot', 'promotion_id', 'promotion_name'];
  return ecomParams.includes(key);
}

// ─────────────────────────────────────────────────────────────────────
// Scenario Definitions from Excel URLs
// ─────────────────────────────────────────────────────────────────────

/**
 * Excel page_type → CG 규칙 page_type 정규화
 *
 * Pre-Requirement Excel과 GTM Content Group 규칙의 페이지 타입명이
 * 다를 수 있으므로 통일합니다.
 */
const EXCEL_PAGE_TYPE_NORMALIZATION: Record<string, PageTypeEnum> = {
  'SEARCH_RESULT': 'SEARCH',
  'MY': 'MY_PAGE',
  // ORDER는 URL 기반으로 세분화 (CHECKOUT / ORDER_COMPLETE)
};

function normalizeExcelPageType(pageType: string, url: string): PageTypeEnum {
  // 직접 매핑이 있는 경우
  const mapped = EXCEL_PAGE_TYPE_NORMALIZATION[pageType];
  if (mapped) return mapped;

  // ORDER → URL 기반 세분화
  if (pageType === 'ORDER') {
    if (url.includes('thank-you') || url.includes('order_complete')) return 'ORDER_COMPLETE';
    if (url.includes('checkout')) return 'CHECKOUT';
    return 'MY_PAGE'; // /account/orders, /pages/order-list → MY_PAGE
  }

  return (pageType || 'OTHERS') as PageTypeEnum;
}

/** SEARCH URL의 검색어가 비어있는지 확인 */
function isEmptySearchQuery(url: string): boolean {
  try {
    const u = new URL(url);
    const q = u.searchParams.get('q');
    return q === null || q.trim() === '';
  } catch {
    // URL 파싱 실패 시 쿼리스트링 직접 확인
    const match = url.match(/[?&]q=([^&]*)/);
    return !match || match[1].trim() === '';
  }
}

function buildScenarioDefinitions(
  excelURLs: ExcelURLEntry[],
  contentGroupRules: ContentGroupRule[],
  options?: GTMParserOptions,
): ScenarioDefinition[] {
  const scenarios: ScenarioDefinition[] = [];
  let seqOrder = 1;

  for (const entry of excelURLs) {
    let url = entry.url;

    // Domain mapping
    if (options?.domainMapping) {
      url = url.replace(options.domainMapping.from, options.domainMapping.to);
    }

    const pageType = normalizeExcelPageType(entry.page_type, url);
    const rule = contentGroupRules.find(r => r.page_type === pageType);

    const emptyChannelActionIds = {} as Record<ChannelCombination, string>;

    // SEARCH 페이지 빈 검색어 감지: 검색 결과 없으므로 관련 이벤트 제외
    const isEmptySearch = pageType === 'SEARCH' && isEmptySearchQuery(url);
    const SEARCH_RESULT_EVENTS = ['view_item_list', 'view_search_results'];

    // Auto-fire scenario (page load)
    const autoFireEvents: ExpectedEvent[] = (rule?.auto_fire_events || ['page_view'])
      .filter(en => !(isEmptySearch && SEARCH_RESULT_EVENTS.includes(en)))
      .map(en => ({
        event_name: en,
        ga4_event_name: en,
        required: true,
        expected_within_ms: 10000,
        channel_event_ids: {} as Record<ChannelCombination, string>,
      }));

    scenarios.push({
      scenario_id: `sc_${seqOrder}_auto_${pageType}`,
      scenario_name: `[${pageType}] auto_fire - ${url}`,
      page_type: pageType,
      page_url_pattern: url,
      test_urls: [url],
      expected_events: autoFireEvents,
      forbidden_events: rule?.forbidden_events,
      sequence_order: seqOrder++,
      enabled_channels: { ...DEFAULT_CHANNEL_ENABLED },
      channel_action_ids: { ...emptyChannelActionIds },
    });

    // Action scenarios
    if (rule?.action_events) {
      for (const actionRule of rule.action_events) {
        // SEARCH 빈 검색어: 검색 결과 의존 액션 이벤트 제외 (select_item 등)
        if (isEmptySearch && ['select_item', ...SEARCH_RESULT_EVENTS].includes(actionRule.event_name)) {
          continue;
        }
        const userAction: UserAction = {
          action_id: `act_${seqOrder}_${actionRule.action_type}`,
          action_type: actionRule.action_type,
          description: actionRule.trigger_condition,
          target_selector: actionRule.target_selector,
          wait_after_ms: actionRule.wait_after_ms,
        };

        scenarios.push({
          scenario_id: `sc_${seqOrder}_action_${actionRule.event_name}`,
          scenario_name: `[${pageType}] ${actionRule.action_type}: ${actionRule.event_name} - ${url}`,
          page_type: pageType,
          page_url_pattern: url,
          test_urls: [url],
          user_action: userAction,
          expected_events: [{
            event_name: actionRule.event_name,
            ga4_event_name: actionRule.event_name,
            required: true,
            expected_within_ms: actionRule.wait_after_ms + 2000,
            channel_event_ids: {} as Record<ChannelCombination, string>,
          }],
          sequence_order: seqOrder++,
          enabled_channels: { ...DEFAULT_CHANNEL_ENABLED },
          channel_action_ids: { ...emptyChannelActionIds },
        });
      }
    }
  }

  return scenarios;
}

// ─────────────────────────────────────────────────────────────────────
// Synthetic Scenarios (Excel URL 누락 보완)
// ─────────────────────────────────────────────────────────────────────

/**
 * Excel URL에서 커버되지 않은 page_type에 대해 합성 시나리오를 추가합니다.
 *
 * SYNTHETIC_SCENARIO_CONFIGS에 정의된 page_type이 excelURLs에 없으면,
 * 해당 page_type의 CG 규칙(auto_fire + action_events)으로 시나리오를 생성합니다.
 */
function appendSyntheticScenarios(
  scenarios: ScenarioDefinition[],
  contentGroupRules: ContentGroupRule[],
  excelURLs: ExcelURLEntry[],
  options?: GTMParserOptions,
): void {
  // Excel에서 이미 커버된 page_type 수집
  const coveredPageTypes = new Set<string>();
  for (const entry of excelURLs) {
    coveredPageTypes.add(normalizeExcelPageType(entry.page_type, entry.url));
  }

  let seqOrder = scenarios.length > 0
    ? Math.max(...scenarios.map(s => s.sequence_order)) + 1
    : 1;

  for (const config of SYNTHETIC_SCENARIO_CONFIGS) {
    if (coveredPageTypes.has(config.page_type)) continue;

    const rule = contentGroupRules.find(r => r.page_type === config.page_type);
    if (!rule) continue;

    // 도메인 매핑 적용
    let testUrl = config.test_url;
    if (options?.domainMapping) {
      testUrl = testUrl.replace(options.domainMapping.from, options.domainMapping.to);
    }

    const emptyChannelActionIds = {} as Record<ChannelCombination, string>;

    // Auto-fire scenario
    const autoFireEvents: ExpectedEvent[] = (rule.auto_fire_events || ['page_view']).map(en => ({
      event_name: en,
      ga4_event_name: en,
      required: true,
      expected_within_ms: 10000,
      channel_event_ids: {} as Record<ChannelCombination, string>,
    }));

    scenarios.push({
      scenario_id: `sc_${seqOrder}_auto_${config.page_type}`,
      scenario_name: `[${config.page_type}] auto_fire - ${testUrl}`,
      description: config.description,
      page_type: config.page_type,
      page_url_pattern: testUrl,
      test_urls: [testUrl],
      expected_events: autoFireEvents,
      forbidden_events: rule.forbidden_events,
      sequence_order: seqOrder++,
      enabled_channels: { ...DEFAULT_CHANNEL_ENABLED },
      channel_action_ids: { ...emptyChannelActionIds },
    });

    // Action scenarios
    for (const actionRule of rule.action_events) {
      const userAction: UserAction = {
        action_id: `act_${seqOrder}_${actionRule.action_type}`,
        action_type: actionRule.action_type,
        description: actionRule.trigger_condition,
        target_selector: actionRule.target_selector,
        wait_after_ms: actionRule.wait_after_ms,
        prerequisite_actions: config.prerequisite_actions,
      };

      scenarios.push({
        scenario_id: `sc_${seqOrder}_action_${actionRule.event_name}`,
        scenario_name: `[${config.page_type}] ${actionRule.action_type}: ${actionRule.event_name} - ${testUrl}`,
        description: config.description,
        page_type: config.page_type,
        page_url_pattern: testUrl,
        test_urls: [testUrl],
        user_action: userAction,
        expected_events: [{
          event_name: actionRule.event_name,
          ga4_event_name: actionRule.event_name,
          required: true,
          expected_within_ms: actionRule.wait_after_ms + 2000,
          channel_event_ids: {} as Record<ChannelCombination, string>,
        }],
        sequence_order: seqOrder++,
        enabled_channels: { ...DEFAULT_CHANNEL_ENABLED },
        channel_action_ids: { ...emptyChannelActionIds },
      });
    }

    console.log(`  합성 시나리오 추가: [${config.page_type}] ${testUrl} (auto + ${rule.action_events.length} action)`);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Channel Action ID / Event ID Assignment (Parser-time)
// ─────────────────────────────────────────────────────────────────────

/** 채널 순서 (고정) — 모든 ID 할당에서 동일 순서 사용 */
const CHANNEL_ORDER: ChannelCombination[] = ['pc_login', 'pc_no_login', 'mo_login', 'mo_no_login'];

/**
 * 시나리오에 채널별 Action ID / Event ID를 할당합니다.
 *
 * 같은 시나리오도 채널별로 독립적인 ID를 가집니다:
 *   pc_login:    sc_1 → A001, sc_2 → A002, ...
 *   pc_no_login: sc_1 → A110, sc_2 → A111, ...
 *   mo_login:    sc_1 → A219, ...
 *   mo_no_login: sc_1 → A328, ...
 */
function assignChannelActionIds(scenarios: ScenarioDefinition[]): void {
  let actionNumber = 1;

  for (const channel of CHANNEL_ORDER) {
    for (const scenario of scenarios) {
      const actId = `A${String(actionNumber).padStart(3, '0')}`;
      scenario.channel_action_ids[channel] = actId;

      scenario.expected_events.forEach((ev, idx) => {
        ev.channel_event_ids[channel] = `E${String(actionNumber).padStart(3, '0')}-${idx + 1}`;
      });

      actionNumber++;
    }
  }

  console.log(`  채널별 ID 할당 완료: ${scenarios.length} 시나리오 × ${CHANNEL_ORDER.length} 채널 = ${(actionNumber - 1)} Action IDs`);
}

// ─────────────────────────────────────────────────────────────────────
// Page Event Rules
// ─────────────────────────────────────────────────────────────────────

function buildPageRules(
  contentGroupRules: ContentGroupRule[],
  _container: GTMContainer,
): PageEventRule[] {
  return contentGroupRules.map(rule => {
    const conditionalEvents: ConditionalEventRule[] = rule.action_events.map(ae => ({
      event_name: ae.event_name,
      condition_description: ae.trigger_condition,
      trigger_type: ae.action_type === 'click' ? 'click' as TriggerType : ae.action_type === 'scroll' ? 'scroll' as TriggerType : 'custom' as TriggerType,
      target_selector: ae.target_selector,
    }));

    return {
      page_type: rule.page_type,
      auto_fire_events: rule.auto_fire_events,
      conditional_events: conditionalEvents,
      forbidden_events: rule.forbidden_events,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────
// Main Parser Function
// ─────────────────────────────────────────────────────────────────────

export function parseGTMContainer(
  gtmJsonPath: string,
  preRequirementExcelPath: string,
  options?: GTMParserOptions,
  devGuideHints?: DevGuideEventHint[],
  dataLayerToGA4Map?: Record<string, string>,
): GTMParserOutput {
  const warnings: string[] = [];

  // 1. Load GTM JSON
  const absoluteGtmPath = path.resolve(gtmJsonPath);
  if (!fs.existsSync(absoluteGtmPath)) {
    throw new Error(`GTM JSON 파일을 찾을 수 없습니다: ${absoluteGtmPath}`);
  }

  const gtmRaw = fs.readFileSync(absoluteGtmPath, 'utf-8');
  const container: GTMContainer = JSON.parse(gtmRaw);

  // 2. Extract GA4 events from GTM
  const ga4Events = extractGA4Events(container);
  if (ga4Events.length === 0) {
    warnings.push('GTM에서 GA4 이벤트 태그를 찾지 못했습니다');
  } else {
    console.log(`  GTM에서 ${ga4Events.length}개 GA4 이벤트 태그 추출`);
  }

  // 3. Analyze triggers (Source Authority 기반 4단계 분석)
  const { triggerInfos, crossRefResults } = analyzeEventTriggers(
    ga4Events, container, devGuideHints, dataLayerToGA4Map,
  );
  if (devGuideHints && devGuideHints.length > 0) {
    console.log(`  DevGuide 힌트 적용: ${devGuideHints.length}개 이벤트`);
  }
  console.log(`  트리거 분석: ${triggerInfos.length}개 이벤트`);

  // Cross-reference results summary
  if (crossRefResults.length > 0) {
    const criticals = crossRefResults.flatMap(r => r.warnings).filter(w => w.severity === 'CRITICAL');
    const warnings = crossRefResults.flatMap(r => r.warnings).filter(w => w.severity === 'WARNING');
    if (criticals.length > 0) {
      console.log(`  [CRITICAL] 교차 검증 CRITICAL: ${criticals.length}건`);
      for (const c of criticals) {
        console.log(`    - [${c.event_name}] ${c.message}`);
      }
    }
    if (warnings.length > 0) {
      console.log(`  [WARNING] 교차 검증 WARNING: ${warnings.length}건`);
    }
  }

  const autoEvents = triggerInfos.filter(t => t.testability === 'auto').length;
  const actionEvents = triggerInfos.filter(t => t.testability === 'action').length;
  const manualEvents = triggerInfos.filter(t => t.testability === 'manual_only').length;
  const conditionalEvents = triggerInfos.filter(t => t.testability === 'conditional').length;
  console.log(`    auto: ${autoEvents}, action: ${actionEvents}, conditional: ${conditionalEvents}, manual_only: ${manualEvents}`);

  // 4. Build dynamic page event map from trigger analysis
  const pageEventMap = buildDynamicPageEventMap(triggerInfos);

  // 5. Build Content Group Rules
  const contentGroupRules = buildContentGroupRules(pageEventMap);

  // 6. Build Event Definitions
  const eventDefs = buildEventDefinitions(ga4Events, container, pageEventMap);

  // 7. Build Parameter Spec
  const parameterSpec = buildParameterSpec(ga4Events);

  // 8. Parse Pre-Requirement Excel for URLs
  const excelResult = parseExcel(preRequirementExcelPath);
  warnings.push(...excelResult.warnings);

  if (excelResult.urls.length === 0) {
    warnings.push('Pre-Requirement Excel에서 URL을 찾지 못했습니다');
  }

  // 9. Build Scenario Definitions
  const scenarios = buildScenarioDefinitions(excelResult.urls, contentGroupRules, options);

  // 9.5. Append Synthetic Scenarios (Excel에 URL 없는 페이지 타입 보완)
  appendSyntheticScenarios(scenarios, contentGroupRules, excelResult.urls, options);

  // 9.55. Enrich with Knowledge Base sub-scenarios
  enrichWithKnowledgeSubScenarios(scenarios, contentGroupRules);

  // 9.6. Assign Channel Action IDs / Event IDs (Parser-time)
  assignChannelActionIds(scenarios);

  // 10. Build Page Rules
  const pageRules = buildPageRules(contentGroupRules, container);

  // 11. Assemble EventScenarioSpec
  const scenarioSpec: EventScenarioSpec = {
    project_id: 'innisfree-jp',
    brand_id: 'innisfree',
    version: '2.0',
    created_at: new Date().toISOString(),
    events: eventDefs,
    scenarios,
    page_rules: pageRules,
    total_events: eventDefs.length,
    total_scenarios: scenarios.length,
  };

  return {
    scenario_spec: scenarioSpec,
    parameter_spec: parameterSpec,
    content_group_rules: contentGroupRules,
    warnings,
    cross_reference_results: crossRefResults.length > 0 ? crossRefResults : undefined,
    raw_container: container,
  };
}
