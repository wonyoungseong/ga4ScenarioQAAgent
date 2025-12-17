import * as fs from 'fs';
import {
  PageType,
  detectPageTypeFromUrl,
  getPageTypeDescription,
  ALL_PAGE_TYPES
} from '../types/pageContext';
import {
  FilterEvaluator,
  EventEvaluationResult,
  TriggerEvaluationResult
} from './filterEvaluator';

export interface GTMTrigger {
  triggerId: string;
  name: string;
  type: string;  // LINK_CLICK, CLICK, PAGEVIEW, CUSTOM_EVENT, SCROLL_DEPTH 등
  cssSelector?: string;
  customEventName?: string;
  filters: GTMFilter[];
  /**
   * 트리거 타입별 파라미터 (GTM trigger.parameter에서 추출)
   *
   * 예시:
   * - SCROLL_DEPTH: { verticalThresholdsPercent: "10,20,30,40,50,60,70,80,90,100", ... }
   * - ELEMENT_VISIBILITY: { selectorType: "CSS_SELECTOR", elementSelector: "...", ... }
   * - YOUTUBE_VIDEO: { captureStart: "true", captureComplete: "true", ... }
   */
  triggerParams?: Record<string, string>;
}

export interface GTMFilter {
  type: string;  // CSS_SELECTOR, CONTAINS, EQUALS, REGEX 등
  variable: string;
  value: string;
}

/**
 * 이벤트 플랫폼 타입
 */
export type EventPlatform = 'web' | 'app' | 'both' | 'unknown';

/**
 * GA4 자동 수집 이벤트 목록 (Enhanced Measurement)
 * 이 이벤트들은 GTM에 명시적 태그 없이 GA4 Config에서 자동 수집됨
 */
export const GA4_AUTO_COLLECTED_EVENTS = [
  'page_view',      // 웹 페이지 조회 (자동)
  'first_visit',    // 첫 방문 (자동)
  'session_start',  // 세션 시작 (자동)
  'user_engagement', // 사용자 참여 (자동)
  // Enhanced Measurement (설정에 따라)
  'scroll',         // 스크롤 90% (Enhanced)
  'click',          // 아웃바운드 클릭 (Enhanced)
  'file_download',  // 파일 다운로드 (Enhanced)
  'video_start',    // 비디오 시작 (Enhanced)
  'video_progress', // 비디오 진행 (Enhanced)
  'video_complete', // 비디오 완료 (Enhanced)
  'form_start',     // 폼 시작 (Enhanced)
  'form_submit',    // 폼 제출 (Enhanced)
] as const;

export interface GTMTag {
  tagId: string;
  name: string;
  eventName: string;  // GA4 이벤트명 (select_promotion, select_item 등)
  triggerIds: string[];
  triggers: GTMTrigger[];
  /**
   * 이벤트 플랫폼
   * - web: 웹 전용
   * - app: 앱 전용 (Firebase)
   * - both: 웹/앱 공통
   * - unknown: 판단 불가
   */
  platform: EventPlatform;
  /**
   * 태그 타입
   * - googtag: GA4 Configuration (page_view 자동 수집)
   * - gaawe: GA4 Event (커스텀 이벤트)
   */
  tagType: string;
  /**
   * GA4 자동 수집 이벤트 여부
   */
  isAutoCollected?: boolean;
}

export interface GTMAnalysisResult {
  tags: GTMTag[];
  eventTriggerMap: Map<string, GTMTrigger[]>;
  /**
   * 이벤트별 플랫폼 맵
   * 동일 이벤트명이 App/Web 각각 있을 수 있음
   */
  eventPlatformMap: Map<string, EventPlatform>;
  /**
   * GA4 Configuration 태그 존재 여부 (page_view 자동 수집)
   */
  hasGA4Config: boolean;
  /**
   * 웹 전용 이벤트 목록
   */
  webEvents: string[];
  /**
   * 앱 전용 이벤트 목록
   */
  appEvents: string[];
}

export class GTMAnalyzer {
  private gtmData: any;
  private filterEvaluator: FilterEvaluator;

  constructor(gtmJsonPath: string) {
    const content = fs.readFileSync(gtmJsonPath, 'utf-8');
    this.gtmData = JSON.parse(content);
    this.filterEvaluator = new FilterEvaluator();
  }

  /**
   * GTM JSON을 분석하여 이벤트별 트리거 조건을 추출합니다.
   */
  analyze(): GTMAnalysisResult {
    const containerVersion = this.gtmData.containerVersion;
    const tags = containerVersion.tag || [];
    const triggers = containerVersion.trigger || [];
    const variables = containerVersion.variable || [];

    // 트리거 ID -> 트리거 정보 맵
    const triggerMap = new Map<string, GTMTrigger>();
    for (const trigger of triggers) {
      const parsedTrigger = this.parseTrigger(trigger);
      if (parsedTrigger) {
        triggerMap.set(trigger.triggerId, parsedTrigger);
      }
    }

    // GA4 이벤트 태그 파싱
    const parsedTags: GTMTag[] = [];
    const eventTriggerMap = new Map<string, GTMTrigger[]>();
    const eventPlatformMap = new Map<string, EventPlatform>();
    let hasGA4Config = false;
    const webEvents: string[] = [];
    const appEvents: string[] = [];

    for (const tag of tags) {
      const parsedTag = this.parseTag(tag, triggerMap);

      // GA4 Configuration 태그 확인
      if (tag.type === 'googtag') {
        hasGA4Config = true;
      }

      if (parsedTag && parsedTag.eventName) {
        parsedTags.push(parsedTag);

        // 이벤트명 -> 트리거 맵핑
        const existing = eventTriggerMap.get(parsedTag.eventName) || [];
        existing.push(...parsedTag.triggers);
        eventTriggerMap.set(parsedTag.eventName, existing);

        // 플랫폼 맵핑
        const existingPlatform = eventPlatformMap.get(parsedTag.eventName);
        if (!existingPlatform) {
          eventPlatformMap.set(parsedTag.eventName, parsedTag.platform);
        } else if (existingPlatform !== parsedTag.platform) {
          // 같은 이벤트가 web과 app 모두에 있으면 'both'
          eventPlatformMap.set(parsedTag.eventName, 'both');
        }

        // 플랫폼별 이벤트 분류
        if (parsedTag.platform === 'web' && !webEvents.includes(parsedTag.eventName)) {
          webEvents.push(parsedTag.eventName);
        } else if (parsedTag.platform === 'app' && !appEvents.includes(parsedTag.eventName)) {
          appEvents.push(parsedTag.eventName);
        }
      }
    }

    return {
      tags: parsedTags,
      eventTriggerMap,
      eventPlatformMap,
      hasGA4Config,
      webEvents,
      appEvents
    };
  }

  /**
   * 특정 이벤트의 트리거 조건을 추출합니다.
   */
  getEventTriggers(eventName: string): GTMTrigger[] {
    const result = this.analyze();
    return result.eventTriggerMap.get(eventName) || [];
  }

  /**
   * 웹 전용 이벤트 목록을 반환합니다.
   * GA4 자동 수집 이벤트(page_view 등)도 포함됩니다.
   */
  getWebEvents(): { events: string[]; autoCollected: string[]; hasPageView: boolean } {
    const result = this.analyze();

    // 웹 이벤트 필터링 (app 제외)
    const webEvents = result.tags
      .filter(tag => tag.platform !== 'app')
      .map(tag => tag.eventName)
      .filter((name, index, arr) => arr.indexOf(name) === index);  // 중복 제거

    // GA4 Config가 있으면 page_view 자동 수집
    const autoCollected: string[] = [];
    if (result.hasGA4Config) {
      autoCollected.push('page_view');  // 필수 자동 수집
      // Enhanced Measurement는 GA4 설정에 따라 다르므로 별도 표시
    }

    return {
      events: webEvents,
      autoCollected,
      hasPageView: result.hasGA4Config
    };
  }

  /**
   * 앱 전용 이벤트 목록을 반환합니다.
   */
  getAppEvents(): string[] {
    const result = this.analyze();
    return result.tags
      .filter(tag => tag.platform === 'app')
      .map(tag => tag.eventName)
      .filter((name, index, arr) => arr.indexOf(name) === index);
  }

  /**
   * 이벤트의 플랫폼을 반환합니다.
   */
  getEventPlatform(eventName: string): EventPlatform {
    const result = this.analyze();
    return result.eventPlatformMap.get(eventName) || 'unknown';
  }

  /**
   * 트리거 조건을 사람이 읽을 수 있는 형태로 설명합니다.
   */
  describeTrigger(trigger: GTMTrigger): string {
    const lines: string[] = [];
    lines.push(`트리거: ${trigger.name}`);
    lines.push(`타입: ${this.getTriggerTypeDescription(trigger.type)}`);

    if (trigger.cssSelector) {
      lines.push(`CSS Selector: ${trigger.cssSelector}`);
    }

    if (trigger.customEventName) {
      lines.push(`Custom Event: ${trigger.customEventName}`);
    }

    if (trigger.filters.length > 0) {
      lines.push('필터 조건:');
      for (const filter of trigger.filters) {
        lines.push(`  - ${filter.variable} ${filter.type} "${filter.value}"`);
      }
    }

    // 트리거 파라미터 표시
    if (trigger.triggerParams && Object.keys(trigger.triggerParams).length > 0) {
      lines.push('트리거 파라미터:');
      for (const [key, value] of Object.entries(trigger.triggerParams)) {
        lines.push(`  - ${key}: ${value}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 이벤트의 트리거 조건을 AI가 이해할 수 있는 형태로 변환합니다.
   */
  getEventTriggerDescription(eventName: string): string {
    const triggers = this.getEventTriggers(eventName);

    if (triggers.length === 0) {
      return `${eventName} 이벤트에 대한 트리거 조건을 찾을 수 없습니다.`;
    }

    const lines: string[] = [];
    lines.push(`## ${eventName} 이벤트 GTM 트리거 조건\n`);

    for (const trigger of triggers) {
      lines.push(this.describeTrigger(trigger));
      lines.push('');
    }

    // CSS Selector 요약
    const selectors = triggers
      .filter(t => t.cssSelector)
      .map(t => t.cssSelector);

    if (selectors.length > 0) {
      lines.push('### 이벤트 발생 조건 (CSS Selector)');
      lines.push('다음 조건에 해당하는 요소를 클릭할 때 이벤트가 발생합니다:');
      for (const selector of selectors) {
        lines.push(`- \`${selector}\``);
      }
    }

    return lines.join('\n');
  }

  private parseTrigger(trigger: any): GTMTrigger | null {
    const filters: GTMFilter[] = [];

    // 필터 파싱
    if (trigger.filter) {
      for (const filter of trigger.filter) {
        const parsedFilter = this.parseFilter(filter);
        if (parsedFilter) {
          filters.push(parsedFilter);
        }
      }
    }

    // CSS Selector 추출
    let cssSelector: string | undefined;
    for (const filter of filters) {
      if (filter.type === 'CSS_SELECTOR') {
        cssSelector = filter.value;
        break;
      }
    }

    // Custom Event 이름 추출
    let customEventName: string | undefined;
    if (trigger.customEventFilter) {
      for (const filter of trigger.customEventFilter) {
        if (filter.parameter) {
          for (const param of filter.parameter) {
            if (param.key === 'arg1') {
              customEventName = param.value;
            }
          }
        }
      }
    }

    // 트리거 파라미터 추출 (모든 trigger.parameter를 일반적으로 추출)
    let triggerParams: Record<string, string> | undefined;
    if (trigger.parameter && Array.isArray(trigger.parameter)) {
      triggerParams = {};
      for (const param of trigger.parameter) {
        if (param.key && param.value !== undefined) {
          triggerParams[param.key] = param.value;
        }
      }
      // 빈 객체면 undefined로
      if (Object.keys(triggerParams).length === 0) {
        triggerParams = undefined;
      }
    }

    return {
      triggerId: trigger.triggerId,
      name: trigger.name || '',
      type: trigger.type || '',
      cssSelector,
      customEventName,
      filters,
      triggerParams
    };
  }

  private parseFilter(filter: any): GTMFilter | null {
    if (!filter.parameter) return null;

    let variable = '';
    let value = '';

    for (const param of filter.parameter) {
      if (param.key === 'arg0') {
        variable = param.value;
      } else if (param.key === 'arg1') {
        value = param.value;
      }
    }

    return {
      type: filter.type || '',
      variable,
      value
    };
  }

  private parseTag(tag: any, triggerMap: Map<string, GTMTrigger>): GTMTag | null {
    // GA4 이벤트 태그인지 확인
    if (tag.type !== 'gaawe' && !tag.type?.includes('cvt_')) {
      return null;
    }

    // 이벤트 이름 추출
    let eventName = '';
    if (tag.parameter) {
      for (const param of tag.parameter) {
        if (param.key === 'eventName') {
          eventName = param.value;
          break;
        }
      }
    }

    if (!eventName) return null;

    // 트리거 정보 수집
    const triggerIds = tag.firingTriggerId || [];
    const triggers: GTMTrigger[] = [];

    for (const triggerId of triggerIds) {
      const trigger = triggerMap.get(triggerId);
      if (trigger) {
        triggers.push(trigger);
      }
    }

    // 플랫폼 감지 (태그명에서 힌트 추출)
    const platform = this.detectPlatform(tag.name || '');

    // 자동 수집 이벤트 여부
    const isAutoCollected = GA4_AUTO_COLLECTED_EVENTS.includes(eventName as any);

    return {
      tagId: tag.tagId,
      name: tag.name || '',
      eventName,
      triggerIds,
      triggers,
      platform,
      tagType: tag.type,
      isAutoCollected
    };
  }

  /**
   * 태그명에서 플랫폼 감지
   * 예: "(for App)", "(Web)", "App -", "- Web" 등의 힌트 파싱
   */
  private detectPlatform(tagName: string): EventPlatform {
    const lowerName = tagName.toLowerCase();

    // App 전용 키워드
    const appKeywords = [
      'for app', '(app)', '- app', 'app -', 'app only',
      'firebase', 'mobile app', 'ios', 'android'
    ];

    // Web 전용 키워드
    const webKeywords = [
      'for web', '(web)', '- web', 'web -', 'web only',
      'website', 'browser'
    ];

    // App 키워드 체크
    for (const keyword of appKeywords) {
      if (lowerName.includes(keyword)) {
        return 'app';
      }
    }

    // Web 키워드 체크
    for (const keyword of webKeywords) {
      if (lowerName.includes(keyword)) {
        return 'web';
      }
    }

    // 힌트가 없으면 기본적으로 web으로 간주 (GTM은 주로 웹용)
    // 단, screen_view는 app 전용
    if (lowerName.includes('screen_view') || lowerName.includes('screen view')) {
      return 'app';
    }

    return 'web';  // GTM 기본은 웹
  }

  private getTriggerTypeDescription(type: string): string {
    const typeMap: Record<string, string> = {
      'LINK_CLICK': '링크 클릭 (a 태그)',
      'CLICK': '모든 요소 클릭',
      'PAGEVIEW': '페이지 로드',
      'CUSTOM_EVENT': '커스텀 이벤트 (dataLayer.push)',
      'DOM_READY': 'DOM Ready',
      'WINDOW_LOADED': '페이지 완전 로드',
      'SCROLL': '스크롤',
      'FORM_SUBMIT': '폼 제출',
      'VISIBILITY': '요소 노출',
    };

    return typeMap[type] || type;
  }

  // ========================================
  // 페이지 컨텍스트 인식 메서드
  // ========================================

  /**
   * URL에서 페이지 타입을 감지합니다.
   */
  detectPageType(url: string): PageType {
    return detectPageTypeFromUrl(url);
  }

  /**
   * 특정 페이지에서 발생할 수 있는 이벤트 목록을 반환합니다.
   * 변수 선언 여부를 고려하여 실제로 발동 가능한 이벤트만 반환합니다.
   *
   * @param pageType 페이지 타입
   * @param options 옵션
   */
  getEventsForPage(pageType: PageType, options?: {
    includeAutoCollected?: boolean;
    webOnly?: boolean;
  }): PageEventAnalysisResult {
    const result = this.analyze();
    const canFireEvents: EventEvaluationResult[] = [];
    const cannotFireEvents: EventEvaluationResult[] = [];
    const autoCollectedEvents: string[] = [];

    // GA4 자동 수집 이벤트
    if (options?.includeAutoCollected !== false && result.hasGA4Config) {
      autoCollectedEvents.push('page_view');
    }

    // 각 이벤트별 평가
    for (const tag of result.tags) {
      // 웹 전용 필터링
      if (options?.webOnly && tag.platform === 'app') {
        continue;
      }

      // 이벤트 평가
      const evaluation = this.filterEvaluator.evaluateEvent(
        tag.eventName,
        tag.triggers,
        pageType
      );

      if (evaluation.canFire) {
        canFireEvents.push(evaluation);
      } else {
        cannotFireEvents.push(evaluation);
      }
    }

    // 이벤트명 중복 제거
    const uniqueCanFire = this.deduplicateEventResults(canFireEvents);
    const uniqueCannotFire = this.deduplicateEventResults(cannotFireEvents);

    return {
      pageType,
      pageTypeDescription: getPageTypeDescription(pageType),
      canFireEvents: uniqueCanFire,
      cannotFireEvents: uniqueCannotFire,
      autoCollectedEvents,
      summary: this.generatePageEventSummary(pageType, uniqueCanFire, uniqueCannotFire, autoCollectedEvents)
    };
  }

  /**
   * URL 기반으로 해당 페이지에서 발생할 수 있는 이벤트를 분석합니다.
   */
  analyzeEventsForUrl(url: string, options?: {
    includeAutoCollected?: boolean;
    webOnly?: boolean;
  }): PageEventAnalysisResult {
    const pageType = this.detectPageType(url);
    return this.getEventsForPage(pageType, options);
  }

  /**
   * 특정 이벤트가 특정 페이지에서 발생할 수 있는지 평가합니다.
   */
  evaluateEventOnPage(eventName: string, pageType: PageType): EventEvaluationResult {
    const triggers = this.getEventTriggers(eventName);
    return this.filterEvaluator.evaluateEvent(eventName, triggers, pageType);
  }

  /**
   * 모든 페이지 타입별로 이벤트 발생 가능 여부를 분석합니다.
   */
  analyzeEventsByPageType(): Map<PageType, PageEventAnalysisResult> {
    const resultMap = new Map<PageType, PageEventAnalysisResult>();

    for (const pageType of ALL_PAGE_TYPES) {
      resultMap.set(pageType, this.getEventsForPage(pageType, { webOnly: true }));
    }

    return resultMap;
  }

  /**
   * 이벤트 결과 중복 제거
   */
  private deduplicateEventResults(results: EventEvaluationResult[]): EventEvaluationResult[] {
    const seen = new Set<string>();
    return results.filter(r => {
      if (seen.has(r.eventName)) {
        return false;
      }
      seen.add(r.eventName);
      return true;
    });
  }

  /**
   * 페이지 이벤트 요약 생성
   */
  private generatePageEventSummary(
    pageType: PageType,
    canFire: EventEvaluationResult[],
    cannotFire: EventEvaluationResult[],
    autoCollected: string[]
  ): string {
    const lines: string[] = [];
    const pageDesc = getPageTypeDescription(pageType);

    lines.push(`## ${pageDesc} (${pageType}) 이벤트 분석 결과\n`);

    // 자동 수집 이벤트
    if (autoCollected.length > 0) {
      lines.push(`### 자동 수집 이벤트 (${autoCollected.length}개)`);
      for (const event of autoCollected) {
        lines.push(`- ${event}`);
      }
      lines.push('');
    }

    // 발생 가능 이벤트
    lines.push(`### 발생 가능 이벤트 (${canFire.length}개)`);
    if (canFire.length === 0) {
      lines.push('- 없음');
    } else {
      for (const event of canFire) {
        const triggerNames = event.triggerResults
          .filter(t => t.canFire)
          .map(t => t.triggerName)
          .join(', ');
        lines.push(`- **${event.eventName}**`);
        lines.push(`  - 트리거: ${triggerNames}`);
      }
    }
    lines.push('');

    // 발생 불가 이벤트 (변수 선언 문제)
    const blockedByVariable = cannotFire.filter(e => e.blockedByVariableDeclaration);
    if (blockedByVariable.length > 0) {
      lines.push(`### 변수 미선언으로 발생 불가 이벤트 (${blockedByVariable.length}개)`);
      for (const event of blockedByVariable) {
        lines.push(`- **${event.eventName}**`);
        lines.push(`  - 이유: ${event.summary}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

/**
 * 페이지별 이벤트 분석 결과
 */
export interface PageEventAnalysisResult {
  pageType: PageType;
  pageTypeDescription: string;
  /** 발생 가능한 이벤트 목록 */
  canFireEvents: EventEvaluationResult[];
  /** 발생 불가능한 이벤트 목록 (필터 조건 미충족 또는 변수 미선언) */
  cannotFireEvents: EventEvaluationResult[];
  /** GA4 자동 수집 이벤트 */
  autoCollectedEvents: string[];
  /** 요약 */
  summary: string;
}
