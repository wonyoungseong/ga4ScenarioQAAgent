/**
 * Custom Event Observer
 *
 * Collector가 이미 캡처한 수집 데이터에서 custom_event를 필터링하여
 * 관측 보고서를 생성합니다.
 *
 * custom_event는 pass/fail 검수 대상이 아니므로 Validator를 거치지 않고,
 * Observer가 직접 관측 데이터를 구성합니다.
 */

import type { ScenarioCollectedData, CapturedGA4Event } from '../../types/collected-data';
import type {
  CustomEventInstance,
  CustomEventPageSummary,
  CustomEventObservationReport,
} from '../../types/custom-event-observation';

/**
 * 수집된 데이터에서 custom_event를 필터링하여 관측 보고서를 생성합니다.
 */
export function observeCustomEvents(
  collectedData: ScenarioCollectedData[],
): CustomEventObservationReport {
  const observations: CustomEventInstance[] = [];

  for (const scenario of collectedData) {
    // auto_fire_events에서 custom_event 필터링
    for (const evt of scenario.auto_fire_events) {
      if (evt.event_name === 'custom_event') {
        observations.push(buildInstance(scenario, evt, 'auto_fire'));
      }
    }

    // action_results에서 custom_event 필터링
    for (const actionResult of scenario.action_results) {
      for (const evt of actionResult.events_captured) {
        if (evt.event_name === 'custom_event') {
          observations.push(buildInstance(scenario, evt, 'action'));
        }
      }
    }
  }

  // 페이지별 요약
  const pageSummaries = buildPageSummaries(observations);

  // action_frequency 집계
  const actionFrequency = buildActionFrequency(observations);

  return {
    total_observations: observations.length,
    observations,
    page_summaries: pageSummaries,
    action_frequency: actionFrequency,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────

function buildInstance(
  scenario: ScenarioCollectedData,
  evt: CapturedGA4Event,
  capturePhase: 'auto_fire' | 'action',
): CustomEventInstance {
  return {
    scenario_id: scenario.scenario_id,
    timestamp: evt.timestamp,
    page_url: scenario.url,
    page_type: scenario.page_type,
    capture_phase: capturePhase,
    event_action: evt.raw_params['ep.event_action'] ?? undefined,
    event_category: evt.raw_params['ep.event_category'] ?? undefined,
    event_label: evt.raw_params['ep.event_label'] ?? undefined,
    raw_params: evt.raw_params,
    parameter_count: Object.keys(evt.raw_params).length,
  };
}

function buildPageSummaries(observations: CustomEventInstance[]): CustomEventPageSummary[] {
  const pageMap = new Map<string, {
    page_type: CustomEventInstance['page_type'];
    count: number;
    actions: Set<string>;
  }>();

  for (const obs of observations) {
    const existing = pageMap.get(obs.page_url);
    if (existing) {
      existing.count++;
      if (obs.event_action) existing.actions.add(obs.event_action);
    } else {
      const actions = new Set<string>();
      if (obs.event_action) actions.add(obs.event_action);
      pageMap.set(obs.page_url, {
        page_type: obs.page_type,
        count: 1,
        actions,
      });
    }
  }

  return Array.from(pageMap.entries()).map(([page_url, data]) => ({
    page_url,
    page_type: data.page_type,
    count: data.count,
    unique_event_actions: Array.from(data.actions).sort(),
  }));
}

function buildActionFrequency(observations: CustomEventInstance[]): Record<string, number> {
  const freq: Record<string, number> = {};
  for (const obs of observations) {
    const action = obs.event_action ?? '(no_action)';
    freq[action] = (freq[action] ?? 0) + 1;
  }
  return freq;
}
