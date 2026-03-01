/**
 * Event Validator - 이벤트 발생 + 파라미터 2중 검증
 *
 * Layer 1: 이벤트 발생 여부 검증 (expected vs actual)
 * Layer 2: 이벤트 파라미터 검증 (expected params vs captured params)
 * + Content Group 검증
 */

import type {
  ScenarioDefinition,
  PageEventRule,
  EventScenarioSpec,
} from '../../types/event-scenario';

import type {
  EventValidationResult,
  ScenarioResult,
  EventResult,
  EventValidationStatus,
  ScenarioValidationStatus,
  EventValidationSummary,
  ChannelEventSummary,
  PageTypeEventSummary,
  EventCriticalIssue,
  ContentGroupValidation,
} from '../../types/event-validation-result';

import type {
  ParameterSpec,
  EventParameterSpec,
} from '../../types/parameter-spec';

import type { PageTypeEnum, ChannelCombination } from '../../types/common';
import type { CapturedGA4Event, ScenarioCollectedData } from '../../types/collected-data';
import type { ContentGroupRule } from '../../types/content-group';
import type { GTMContainer } from '../../types/gtm-container';
import { getCheckPoints, getShouldNotFireRules } from '../../knowledge/events/index';
import {
  analyzeTriggerCondition,
  generateAsIs,
  generateToBe,
} from '../analyzer/trigger-condition-analyzer';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface ParameterValidationResult {
  event_name: string;
  status: 'PASS' | 'PARTIAL' | 'FAIL';
  param_results: ParamResult[];
  score: number;
}

export interface ParamResult {
  param_name: string;
  ga4_param: string;
  status: 'PASS' | 'FAIL' | 'MISSING' | 'EXTRA';
  expected_value?: unknown;
  actual_value?: unknown;
  reason?: string;
}

export interface ContentGroupValidationResult {
  status: 'MATCH' | 'MISMATCH' | 'MISSING';
  expected_content_group: string;
  actual_content_group?: string;
  impact: string;
}

// ─────────────────────────────────────────────────────────────────────
// Layer 1: Event Occurrence Validation
// ─────────────────────────────────────────────────────────────────────

function validateEventOccurrence(
  collected: ScenarioCollectedData,
  scenario: ScenarioDefinition,
  _pageRule?: PageEventRule,
): EventResult[] {
  const results: EventResult[] = [];
  const capturedEventNames = new Set<string>();

  // Collect all event names from collected data
  const allEvents = collected.all_events;
  for (const evt of allEvents) {
    capturedEventNames.add(evt.event_name);
  }

  // Also check action results
  for (const ar of collected.action_results) {
    for (const evt of ar.events_captured) {
      capturedEventNames.add(evt.event_name);
    }
  }

  // Resolve channel for event_id lookup
  const channel = collected.channel;

  // Check expected events
  for (const expected of scenario.expected_events) {
    const fired = capturedEventNames.has(expected.ga4_event_name);
    const capturedEvent = allEvents.find(e => e.event_name === expected.ga4_event_name);
    // Also check in action results
    const actionEvent = collected.action_results
      .flatMap(ar => ar.events_captured)
      .find(e => e.event_name === expected.ga4_event_name);

    const matchedEvent = capturedEvent || actionEvent;

    let status: EventValidationStatus;
    if (fired) {
      status = 'PASS';
    } else if (expected.required) {
      status = 'MISSING';
    } else {
      status = 'SKIP';
    }

    // Add knowledge base check points as notes
    const checkPoints = getCheckPoints(expected.ga4_event_name);
    const notes: string[] = [];

    if (status === 'MISSING' && checkPoints.length > 0) {
      notes.push(...checkPoints.slice(0, 2));
    }

    // Check should_not_fire rules for context
    if (status === 'PASS' && fired) {
      const shouldNotFire = getShouldNotFireRules(expected.ga4_event_name);
      if (shouldNotFire.length > 0) {
        notes.push(`주의: ${shouldNotFire[0]}`);
      }
    }

    results.push({
      event_name: expected.event_name,
      ga4_event_name: expected.ga4_event_name,
      event_id: expected.channel_event_ids?.[channel],
      status,
      fired,
      expected_to_fire: true,
      captured_params_count: matchedEvent?.parameters.length,
      notes: notes.length > 0 ? notes : undefined,
    });
  }

  // Check forbidden events
  if (scenario.forbidden_events) {
    for (const forbidden of scenario.forbidden_events) {
      const fired = capturedEventNames.has(forbidden);
      const shouldNotFireRules = getShouldNotFireRules(forbidden);

      if (fired) {
        results.push({
          event_name: forbidden,
          ga4_event_name: forbidden,
          status: 'EXTRA',
          fired: true,
          expected_to_fire: false,
          notes: shouldNotFireRules.length > 0
            ? [`should_not_fire: ${shouldNotFireRules[0]}`]
            : undefined,
        });
      } else {
        results.push({
          event_name: forbidden,
          ga4_event_name: forbidden,
          status: 'PASS',
          fired: false,
          expected_to_fire: false,
        });
      }
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────
// Layer 2: Parameter Validation
// ─────────────────────────────────────────────────────────────────────

function validateEventParameters(
  capturedEvent: CapturedGA4Event,
  paramSpec?: EventParameterSpec,
): ParameterValidationResult {
  if (!paramSpec) {
    return {
      event_name: capturedEvent.event_name,
      status: 'PASS',
      param_results: [],
      score: 100,
    };
  }

  const paramResults: ParamResult[] = [];
  const capturedParams = new Map<string, string>();

  // Build map of captured parameters
  for (const p of capturedEvent.parameters) {
    // Extract clean param name from key (ep.page_title → page_title)
    const cleanKey = p.key.replace(/^epn?\./, '').replace(/^up\./, '');
    capturedParams.set(cleanKey, p.value);
    capturedParams.set(p.key, p.value);
  }

  // Also check raw_params
  for (const [k, v] of Object.entries(capturedEvent.raw_params)) {
    capturedParams.set(k, v);
  }

  // Check expected event-level params
  for (const expectedParam of paramSpec.event_level_params) {
    const actualValue = capturedParams.get(expectedParam.ga4_param)
      || capturedParams.get(expectedParam.param_name)
      || capturedParams.get(`ep.${expectedParam.ga4_param}`);

    if (actualValue !== undefined) {
      paramResults.push({
        param_name: expectedParam.param_name,
        ga4_param: expectedParam.ga4_param,
        status: 'PASS',
        actual_value: actualValue,
      });
    } else if (expectedParam.required) {
      paramResults.push({
        param_name: expectedParam.param_name,
        ga4_param: expectedParam.ga4_param,
        status: 'MISSING',
        reason: '필수 파라미터 누락',
      });
    }
  }

  const totalChecked = paramResults.length;
  const passed = paramResults.filter(r => r.status === 'PASS').length;
  const score = totalChecked > 0 ? Math.round((passed / totalChecked) * 100) : 100;

  let status: 'PASS' | 'PARTIAL' | 'FAIL';
  if (score === 100) status = 'PASS';
  else if (score >= 50) status = 'PARTIAL';
  else status = 'FAIL';

  return {
    event_name: capturedEvent.event_name,
    status,
    param_results: paramResults,
    score,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Content Group Validation
// ─────────────────────────────────────────────────────────────────────

function validateContentGroup(
  actualContentGroup: string | undefined,
  expectedPageType: PageTypeEnum,
  contentGroupRules: ContentGroupRule[],
): ContentGroupValidationResult {
  const rule = contentGroupRules.find(r => r.page_type === expectedPageType);
  const expectedCG = rule?.content_group_value || expectedPageType;

  if (!actualContentGroup) {
    return {
      status: 'MISSING',
      expected_content_group: expectedCG,
      actual_content_group: undefined,
      impact: 'Content Group 수집 불가 - 이벤트 예측 신뢰도에 영향',
    };
  }

  if (actualContentGroup.toUpperCase() === expectedCG.toUpperCase()) {
    return {
      status: 'MATCH',
      expected_content_group: expectedCG,
      actual_content_group: actualContentGroup,
      impact: '',
    };
  }

  return {
    status: 'MISMATCH',
    expected_content_group: expectedCG,
    actual_content_group: actualContentGroup,
    impact: `Content Group 불일치: 기대 "${expectedCG}" vs 실제 "${actualContentGroup}"`,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Scenario Validation (combining Layer 1 + Layer 2)
// ─────────────────────────────────────────────────────────────────────

function validateScenario(
  collected: ScenarioCollectedData,
  scenario: ScenarioDefinition,
  parameterSpec: ParameterSpec,
  contentGroupRules: ContentGroupRule[],
  pageRule?: PageEventRule,
): ScenarioResult {
  const startedAt = new Date().toISOString();

  // Layer 1: Event occurrence
  const eventResults = validateEventOccurrence(collected, scenario, pageRule);

  // Layer 2: Parameter validation for each PASS event
  for (const er of eventResults) {
    if (er.status === 'PASS' && er.fired) {
      const capturedEvent = collected.all_events.find(e => e.event_name === er.ga4_event_name)
        || collected.action_results.flatMap(ar => ar.events_captured).find(e => e.event_name === er.ga4_event_name);

      if (capturedEvent) {
        const paramSpec = parameterSpec.event_specs.find(s => s.ga4_event_name === er.ga4_event_name);
        const paramResult = validateEventParameters(capturedEvent, paramSpec);
        er.captured_params_count = paramResult.param_results.length;
      }
    }
  }

  // Content Group validation (YELLOW 4: Collector 데이터 mutation 제거)
  const cgResult = validateContentGroup(
    collected.actual_content_group,
    scenario.page_type,
    contentGroupRules,
  );
  const cgValidation: ContentGroupValidation | undefined =
    cgResult.status !== 'MATCH'
      ? {
          status: cgResult.status,
          expected: cgResult.expected_content_group,
          actual: cgResult.actual_content_group,
          impact: cgResult.impact,
        }
      : undefined;

  const passedCount = eventResults.filter(r => r.status === 'PASS').length;
  const failedCount = eventResults.filter(r => r.status === 'FAIL').length;
  const missingCount = eventResults.filter(r => r.status === 'MISSING').length;
  const extraCount = eventResults.filter(r => r.status === 'EXTRA').length;

  const totalExpected = eventResults.filter(r => r.expected_to_fire).length;
  const score = totalExpected > 0 ? Math.round((passedCount / (passedCount + failedCount + missingCount + extraCount)) * 100) : 100;

  let status: ScenarioValidationStatus;
  if (collected.errors.length > 0 && collected.all_events.length === 0) {
    status = 'ERROR';
  } else if (failedCount === 0 && missingCount === 0 && extraCount === 0) {
    status = 'PASS';
  } else if (passedCount > 0) {
    status = 'PARTIAL';
  } else {
    status = 'FAIL';
  }

  const endedAt = new Date().toISOString();

  return {
    scenario_id: scenario.scenario_id,
    scenario_name: scenario.scenario_name,
    status,
    page_type: scenario.page_type,
    validated_url: collected.url,
    channel: collected.channel,
    action_id: collected.action_id,
    user_action_performed: scenario.user_action ? {
      action_type: scenario.user_action.action_type,
      target_selector: scenario.user_action.target_selector,
      success: collected.action_results.length > 0 ? collected.action_results[0].success : false,
      error_message: collected.action_results.length > 0 ? collected.action_results[0].error_message : undefined,
      duration_ms: collected.action_results.length > 0 ? collected.action_results[0].duration_ms : 0,
    } : undefined,
    event_results: eventResults,
    passed_count: passedCount,
    failed_count: failedCount,
    missing_count: missingCount,
    extra_count: extraCount,
    score,
    content_group_validation: cgValidation,
    started_at: startedAt,
    ended_at: endedAt,
    duration_ms: collected.collection_duration_ms,
    error_message: collected.errors.length > 0 ? collected.errors.join('; ') : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Full Validation
// ─────────────────────────────────────────────────────────────────────

export function validateAllEvents(
  collectedData: ScenarioCollectedData[],
  scenarioSpec: EventScenarioSpec,
  parameterSpec: ParameterSpec,
  contentGroupRules: ContentGroupRule[],
  rawContainer?: GTMContainer,
): EventValidationResult {
  const scenarioResults: ScenarioResult[] = [];

  // Build scenario lookup
  const scenarioMap = new Map<string, ScenarioDefinition>();
  for (const s of scenarioSpec.scenarios) {
    scenarioMap.set(s.scenario_id, s);
  }

  // Build page rule lookup
  const pageRuleMap = new Map<string, PageEventRule>();
  for (const r of scenarioSpec.page_rules) {
    pageRuleMap.set(r.page_type, r);
  }

  // Validate each collected scenario
  for (const collected of collectedData) {
    const scenario = scenarioMap.get(collected.scenario_id);
    if (!scenario) continue;

    const pageRule = pageRuleMap.get(scenario.page_type);
    const result = validateScenario(collected, scenario, parameterSpec, contentGroupRules, pageRule);
    scenarioResults.push(result);
  }

  // Enrich issue events with As-Is/To-Be from trigger analysis
  if (rawContainer) {
    for (const sr of scenarioResults) {
      for (const er of sr.event_results) {
        if (er.status !== 'PASS' && er.status !== 'SKIP') {
          const trace = analyzeTriggerCondition(er.event_name, rawContainer);

          // Build symptom for As-Is context
          const scenarioDesc = sr.scenario_name || sr.validated_url;
          let symptom = '';
          if (er.status === 'MISSING') {
            symptom = `${scenarioDesc}에서 ${er.event_name} 미발생 (기대: 발생)`;
          } else if (er.status === 'EXTRA') {
            symptom = `${scenarioDesc}에서 ${er.event_name} 발생 (기대: 미발생)`;
          } else if (er.status === 'FAIL') {
            symptom = er.discrepancy?.description ?? '기대값과 불일치';
          }

          er.as_is = generateAsIs(trace, er.status, sr.page_type, symptom);
          er.to_be = generateToBe(trace, er.status, sr.page_type);
        }
      }
    }
  }

  // Build summary
  const summary = buildSummary(scenarioResults);
  const summaryByChannel = buildChannelSummary(scenarioResults);
  const summaryByPageType = buildPageTypeSummary(scenarioResults);
  const criticalIssues = extractCriticalIssues(scenarioResults);

  return {
    project_id: scenarioSpec.project_id,
    brand_id: scenarioSpec.brand_id,
    version: scenarioSpec.version,
    validated_at: new Date().toISOString(),
    spec_version: scenarioSpec.version,
    scenario_results: scenarioResults,
    summary,
    summary_by_channel: summaryByChannel,
    summary_by_page_type: summaryByPageType,
    critical_issues: criticalIssues,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Summary Builders
// ─────────────────────────────────────────────────────────────────────

function buildSummary(results: ScenarioResult[]): EventValidationSummary {
  const totalScenarios = results.length;
  const passedScenarios = results.filter(r => r.status === 'PASS').length;
  const failedScenarios = results.filter(r => r.status === 'FAIL').length;
  const errorScenarios = results.filter(r => r.status === 'ERROR').length;

  let totalEvents = 0;
  let passedEvents = 0;
  let failedEvents = 0;
  let missingEvents = 0;
  let extraEvents = 0;

  for (const r of results) {
    totalEvents += r.event_results.length;
    passedEvents += r.passed_count;
    failedEvents += r.failed_count;
    missingEvents += r.missing_count;
    extraEvents += r.extra_count;
  }

  const scenarioPassRate = totalScenarios > 0 ? Math.round((passedScenarios / totalScenarios) * 100) : 0;
  const eventPassRate = totalEvents > 0 ? Math.round((passedEvents / totalEvents) * 100) : 0;
  const overallScore = Math.round((scenarioPassRate * 0.6) + (eventPassRate * 0.4));

  return {
    total_scenarios: totalScenarios,
    passed_scenarios: passedScenarios,
    failed_scenarios: failedScenarios,
    error_scenarios: errorScenarios,
    total_events: totalEvents,
    passed_events: passedEvents,
    failed_events: failedEvents,
    missing_events: missingEvents,
    extra_events: extraEvents,
    scenario_pass_rate: scenarioPassRate,
    event_pass_rate: eventPassRate,
    overall_score: overallScore,
  };
}

function buildChannelSummary(results: ScenarioResult[]): ChannelEventSummary[] {
  const channelMap = new Map<string, ScenarioResult[]>();
  for (const r of results) {
    const ch = r.channel;
    if (!channelMap.has(ch)) channelMap.set(ch, []);
    channelMap.get(ch)!.push(r);
  }

  return Array.from(channelMap.entries()).map(([channel, rs]) => ({
    channel: channel as ChannelCombination,
    total_scenarios: rs.length,
    passed_scenarios: rs.filter(r => r.status === 'PASS').length,
    failed_scenarios: rs.filter(r => r.status === 'FAIL').length,
    total_events: rs.reduce((sum, r) => sum + r.event_results.length, 0),
    passed_events: rs.reduce((sum, r) => sum + r.passed_count, 0),
    failed_events: rs.reduce((sum, r) => sum + r.failed_count, 0),
    missing_events: rs.reduce((sum, r) => sum + r.missing_count, 0),
    extra_events: rs.reduce((sum, r) => sum + r.extra_count, 0),
    pass_rate: rs.length > 0 ? Math.round((rs.filter(r => r.status === 'PASS').length / rs.length) * 100) : 0,
  }));
}

function buildPageTypeSummary(results: ScenarioResult[]): PageTypeEventSummary[] {
  const ptMap = new Map<string, ScenarioResult[]>();
  for (const r of results) {
    if (!ptMap.has(r.page_type)) ptMap.set(r.page_type, []);
    ptMap.get(r.page_type)!.push(r);
  }

  return Array.from(ptMap.entries()).map(([pt, rs]) => {
    // Find most failed events
    const failedEventCounts = new Map<string, number>();
    for (const r of rs) {
      for (const er of r.event_results) {
        if (er.status === 'FAIL' || er.status === 'MISSING') {
          failedEventCounts.set(er.event_name, (failedEventCounts.get(er.event_name) || 0) + 1);
        }
      }
    }
    const sortedFailed = Array.from(failedEventCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);

    return {
      page_type: pt as PageTypeEnum,
      total_scenarios: rs.length,
      passed_scenarios: rs.filter(r => r.status === 'PASS').length,
      pass_rate: rs.length > 0 ? Math.round((rs.filter(r => r.status === 'PASS').length / rs.length) * 100) : 0,
      most_failed_events: sortedFailed,
    };
  });
}

function extractCriticalIssues(results: ScenarioResult[]): EventCriticalIssue[] {
  const issues: EventCriticalIssue[] = [];
  let issueId = 1;

  for (const r of results) {
    for (const er of r.event_results) {
      if (er.status === 'MISSING') {
        issues.push({
          issue_id: `issue_${issueId++}`,
          event_name: er.event_name,
          scenario_id: r.scenario_id,
          issue_type: 'missing_trigger',
          severity: 'HIGH',
          affected_channels: [r.channel],
          affected_page_types: [r.page_type],
          description: `이벤트 "${er.event_name}"가 발생하지 않았습니다`,
          found_at_url: r.validated_url,
          fix_recommendation: `GTM 태그/트리거 확인 필요: ${er.event_name}`,
        });
      } else if (er.status === 'EXTRA') {
        issues.push({
          issue_id: `issue_${issueId++}`,
          event_name: er.event_name,
          scenario_id: r.scenario_id,
          issue_type: 'extra_fire',
          severity: 'MEDIUM',
          affected_channels: [r.channel],
          affected_page_types: [r.page_type],
          description: `금지 이벤트 "${er.event_name}"가 발생했습니다`,
          found_at_url: r.validated_url,
          fix_recommendation: `GTM 차단 트리거 확인 필요: ${er.event_name}`,
        });
      }
    }
  }

  return issues;
}
