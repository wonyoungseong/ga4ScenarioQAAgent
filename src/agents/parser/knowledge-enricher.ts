/**
 * Knowledge Enricher - KB sub-scenario → ScenarioDefinition 변환
 *
 * Knowledge Base의 automatable 테스트 시나리오를 Parser의 ScenarioDefinition으로
 * 변환하여 기존 시나리오에 추가합니다.
 *
 * 파이프라인 위치: Step 9.55 (buildScenarioDefinitions → appendSyntheticScenarios → enricher)
 */

import type {
  ScenarioDefinition,
  UserAction,
  ExpectedEvent,
} from '../../types/event-scenario';
import { DEFAULT_CHANNEL_ENABLED } from '../../types/event-scenario';
import type { ContentGroupRule } from '../../types/content-group';
import type { ChannelCombination, PageTypeEnum } from '../../types/common';
import { getAutomatableTestScenarios, type AutomatableScenario } from '../../knowledge/events/index';

// ─────────────────────────────────────────────────────────────────────
// Main Enricher
// ─────────────────────────────────────────────────────────────────────

/**
 * Knowledge Base의 automatable sub-scenario를 ScenarioDefinition으로 변환하여 추가합니다.
 *
 * 알고리즘:
 * 1. 기존 시나리오에서 (url, page_type) 쌍 수집
 * 2. 각 이벤트의 automatable test_scenarios 조회
 * 3. scope별 URL 대상 결정:
 *    - all_urls → 모든 URL
 *    - page_type_specific → 해당 page_type만
 * 4. 중복 감지 후 ScenarioDefinition 생성
 * 5. 비자동화 시나리오는 console.log로 안내
 */
export function enrichWithKnowledgeSubScenarios(
  scenarios: ScenarioDefinition[],
  _contentGroupRules: ContentGroupRule[],
): void {
  // 1. 기존 시나리오에서 (url, page_type) 쌍 수집
  const urlPageTypePairs = collectURLPageTypePairs(scenarios);
  if (urlPageTypePairs.length === 0) return;

  // 2. automatable 시나리오 조회
  const automatableScenarios = getAutomatableTestScenarios();
  if (automatableScenarios.length === 0) return;

  // 3. 기존 시나리오의 이벤트+액션 타입 조합 (중복 감지용)
  const existingKeys = new Set<string>();
  for (const s of scenarios) {
    const eventName = s.expected_events[0]?.event_name ?? '';
    const actionType = s.user_action?.action_type ?? 'page_load';
    for (const url of s.test_urls ?? []) {
      existingKeys.add(`${url}|${eventName}|${actionType}`);
    }
  }

  let seqOrder = scenarios.length > 0
    ? Math.max(...scenarios.map(s => s.sequence_order)) + 1
    : 1;

  const emptyChannelActionIds = {} as Record<ChannelCombination, string>;
  let addedCount = 0;
  const skippedManual: string[] = [];

  for (const auto of automatableScenarios) {
    // 4. scope별 URL 대상 결정
    const targetUrls = resolveTargetURLs(auto, urlPageTypePairs);

    for (const { url, page_type } of targetUrls) {
      // 중복 감지
      const key = `${url}|${auto.event_name}|${auto.automation.action_type}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);

      // ScenarioDefinition 생성
      const userAction: UserAction = {
        action_id: `act_kb_${seqOrder}_${auto.automation.action_type}`,
        action_type: auto.automation.action_type!,
        description: `[KB] ${auto.scenario_name}`,
        target_selector: auto.automation.target_selector,
        wait_after_ms: 5000,
      };

      const expectedEvent: ExpectedEvent = {
        event_name: auto.event_name,
        ga4_event_name: auto.event_name,
        required: true,
        expected_within_ms: 10000,
        channel_event_ids: {} as Record<ChannelCombination, string>,
      };

      scenarios.push({
        scenario_id: `sc_${seqOrder}_kb_${auto.event_name}_${auto.sub_index}`,
        scenario_name: `[${page_type}] KB:${auto.scenario_name} - ${url}`,
        description: `Knowledge Base sub-scenario: ${auto.scenario_name}`,
        page_type: page_type,
        page_url_pattern: url,
        test_urls: [url],
        user_action: userAction,
        expected_events: [expectedEvent],
        sequence_order: seqOrder++,
        enabled_channels: { ...DEFAULT_CHANNEL_ENABLED },
        channel_action_ids: { ...emptyChannelActionIds },
        source: 'knowledge_base',
        knowledge_ref: {
          event_name: auto.event_name,
          sub_index: auto.sub_index,
          name: auto.scenario_name,
          check_points: auto.check_points,
        },
      });

      addedCount++;
    }
  }

  // 비자동화 시나리오 안내
  collectManualScenarioInfo(skippedManual);

  if (addedCount > 0) {
    console.log(`  KB Enricher: ${addedCount}개 sub-scenario 추가 (source: knowledge_base)`);
  }
  if (skippedManual.length > 0) {
    console.log(`  KB Enricher: ${skippedManual.length}개 비자동화 시나리오 (수동 테스트 필요)`);
    for (const info of skippedManual) {
      console.log(`    - ${info}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

interface URLPageTypePair {
  url: string;
  page_type: PageTypeEnum;
}

function collectURLPageTypePairs(scenarios: ScenarioDefinition[]): URLPageTypePair[] {
  const seen = new Set<string>();
  const pairs: URLPageTypePair[] = [];

  for (const s of scenarios) {
    for (const url of s.test_urls ?? []) {
      const key = `${url}|${s.page_type}`;
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push({ url, page_type: s.page_type });
      }
    }
  }

  return pairs;
}

function resolveTargetURLs(
  auto: AutomatableScenario,
  allPairs: URLPageTypePair[],
): URLPageTypePair[] {
  const scope = auto.automation.scope ?? 'all_urls';

  if (scope === 'all_urls') {
    return allPairs;
  }

  // page_type_specific
  const applicableTypes = new Set(auto.automation.applicable_page_types ?? []);
  return allPairs.filter(p => applicableTypes.has(p.page_type));
}

/**
 * 비자동화 시나리오 정보 수집 (콘솔 안내용)
 */
function collectManualScenarioInfo(out: string[]): void {
  // getAllEventKnowledge import 없이 getAutomatableTestScenarios의 반대를 구현
  // 여기서는 hardcoded - 주요 manual 시나리오만 안내
  const manualInfo = [
    '[page_view #1] 페이지 첫 로딩 시 → auto_fire 중복',
    '[page_view #3] 리다이렉션 후 로딩 시 → 로그인 필요',
    '[page_view #6] 팝업/모달 링크 클릭 → 팝업 상태 필요',
  ];
  out.push(...manualInfo);
}
