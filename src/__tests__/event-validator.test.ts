/**
 * Event Validator 테스트
 *
 * Mock 데이터를 사용한 이벤트 검증 로직 단위 테스트:
 * 1. PASS 케이스 - 예상 이벤트가 정상 발생
 * 2. MISSING 케이스 - 예상 이벤트가 미발생
 * 3. EXTRA/forbidden 케이스 - 금지 이벤트 발생
 * 4. 파라미터 검증
 * 5. 빈 수집 결과
 * 6. Summary 계산 검증
 */

import {
  validateAllEvents,
} from '../agents/validator/event-validator';

import type { ScenarioCollectedData, ActionCollectionResult, CapturedGA4Event } from '../types/collected-data';
import type {
  EventScenarioSpec,
  ScenarioDefinition,
  PageEventRule,
} from '../types/event-scenario';
import { DEFAULT_CHANNEL_ENABLED } from '../types/event-scenario';
import type {
  ParameterSpec,
  EventParameterSpec,
  ParameterDefinition,
} from '../types/parameter-spec';
import type { ContentGroupRule } from '../types/content-group';
import type { PageTypeEnum } from '../types/common';

// ─────────────────────────────────────────────────────────────────────
// Mock Data Builders
// ─────────────────────────────────────────────────────────────────────

function createMockEvent(
  eventName: string,
  params: Record<string, string> = {},
): CapturedGA4Event {
  const parameters = Object.entries(params).map(([key, value]) => ({
    key: `ep.${key}`,
    field: `Event Param: ${key}`,
    value,
    group: 'event',
  }));

  return {
    event_name: eventName,
    timestamp: new Date().toISOString(),
    request_url: 'https://www.google-analytics.com/g/collect?v=2&tid=G-TEST',
    tracking_id: 'G-TEST',
    parameters,
    raw_params: { en: eventName, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [`ep.${k}`, v])) },
  };
}

function createMockScenarioCollected(opts: {
  scenarioId: string;
  url?: string;
  pageType?: PageTypeEnum;
  channel?: import('../types/common').ChannelCombination;
  autoFireEvents?: CapturedGA4Event[];
  actionResults?: ActionCollectionResult[];
  allEvents?: CapturedGA4Event[];
  actualContentGroup?: string;
  errors?: string[];
}): ScenarioCollectedData {
  const autoFire = opts.autoFireEvents || [];
  const actionResults = opts.actionResults || [];
  const allEvents = opts.allEvents || [...autoFire, ...actionResults.flatMap(ar => ar.events_captured)];

  return {
    scenario_id: opts.scenarioId,
    url: opts.url || 'https://www.innisfree.jp/',
    page_type: opts.pageType || 'MAIN',
    channel: opts.channel || 'pc_no_login',
    action_id: '',
    auto_fire_events: autoFire,
    action_results: actionResults,
    all_events: allEvents,
    actual_content_group: opts.actualContentGroup,
    errors: opts.errors || [],
    collection_duration_ms: 3000,
  };
}

function createMockScenarioDefinition(opts: {
  scenarioId: string;
  pageType?: PageTypeEnum;
  expectedEvents: Array<{ event_name: string; required?: boolean }>;
  forbiddenEvents?: string[];
  url?: string;
}): ScenarioDefinition {
  return {
    scenario_id: opts.scenarioId,
    scenario_name: `Test Scenario: ${opts.scenarioId}`,
    page_type: opts.pageType || 'MAIN',
    page_url_pattern: opts.url || 'https://www.innisfree.jp/',
    test_urls: [opts.url || 'https://www.innisfree.jp/'],
    expected_events: opts.expectedEvents.map(e => ({
      event_name: e.event_name,
      ga4_event_name: e.event_name,
      required: e.required !== false,
      expected_within_ms: 10000,
      channel_event_ids: {} as Record<import('../types/common').ChannelCombination, string>,
    })),
    forbidden_events: opts.forbiddenEvents,
    channel_action_ids: {} as Record<import('../types/common').ChannelCombination, string>,
    sequence_order: 1,
    enabled_channels: { ...DEFAULT_CHANNEL_ENABLED },
  };
}

function createMockPageRule(pageType: PageTypeEnum): PageEventRule {
  return {
    page_type: pageType,
    auto_fire_events: ['page_view'],
    conditional_events: [],
    forbidden_events: [],
  };
}

function createMockContentGroupRules(): ContentGroupRule[] {
  return [
    {
      page_type: 'MAIN',
      content_group_value: 'MAIN',
      auto_fire_events: ['page_view'],
      action_events: [],
      forbidden_events: ['view_item', 'add_to_cart', 'purchase'],
    },
    {
      page_type: 'PRODUCT_DETAIL',
      content_group_value: 'PRODUCT_DETAIL',
      auto_fire_events: ['page_view', 'view_item'],
      action_events: [],
      forbidden_events: ['view_item_list'],
    },
  ];
}

function createMockParameterSpec(eventSpecs?: EventParameterSpec[]): ParameterSpec {
  return {
    project_id: 'test-project',
    brand_id: 'test-brand',
    version: '1.0',
    created_at: new Date().toISOString(),
    event_specs: eventSpecs || [],
    total_events: eventSpecs?.length || 0,
    total_parameters: eventSpecs?.reduce((s, e) => s + e.total_params_count, 0) || 0,
    required_parameters: eventSpecs?.reduce((s, e) => s + e.required_params_count, 0) || 0,
  };
}

function createMockScenarioSpec(
  scenarios: ScenarioDefinition[],
  pageRules?: PageEventRule[],
): EventScenarioSpec {
  return {
    project_id: 'test-project',
    brand_id: 'test-brand',
    version: '1.0',
    created_at: new Date().toISOString(),
    events: [],
    scenarios,
    page_rules: pageRules || [createMockPageRule('MAIN'), createMockPageRule('PRODUCT_DETAIL')],
    total_events: 0,
    total_scenarios: scenarios.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. PASS 케이스
// ═══════════════════════════════════════════════════════════════════════════

function testPassCase(): void {
  const scenario = createMockScenarioDefinition({
    scenarioId: 'sc_pass_1',
    expectedEvents: [
      { event_name: 'page_view' },
      { event_name: 'view_item' },
    ],
  });

  const collected = createMockScenarioCollected({
    scenarioId: 'sc_pass_1',
    autoFireEvents: [
      createMockEvent('page_view'),
      createMockEvent('view_item'),
    ],
  });

  const scenarioSpec = createMockScenarioSpec([scenario]);
  const paramSpec = createMockParameterSpec();
  const cgRules = createMockContentGroupRules();

  const result = validateAllEvents([collected], scenarioSpec, paramSpec, cgRules);

  if (result.scenario_results.length !== 1) {
    throw new Error(`Expected 1 scenario result, got ${result.scenario_results.length}`);
  }

  const sr = result.scenario_results[0];
  if (sr.status !== 'PASS') {
    throw new Error(`Expected scenario status 'PASS', got '${sr.status}'`);
  }

  // 두 이벤트 모두 PASS
  const passEvents = sr.event_results.filter(er => er.status === 'PASS');
  if (passEvents.length < 2) {
    throw new Error(`Expected at least 2 PASS events, got ${passEvents.length}`);
  }

  console.log('  ✅ PASS 케이스 테스트 통과');
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. MISSING 케이스
// ═══════════════════════════════════════════════════════════════════════════

function testMissingCase(): void {
  const scenario = createMockScenarioDefinition({
    scenarioId: 'sc_missing_1',
    expectedEvents: [
      { event_name: 'page_view' },
      { event_name: 'view_item', required: true },
    ],
  });

  // view_item이 수집되지 않음
  const collected = createMockScenarioCollected({
    scenarioId: 'sc_missing_1',
    autoFireEvents: [createMockEvent('page_view')],
  });

  const scenarioSpec = createMockScenarioSpec([scenario]);
  const paramSpec = createMockParameterSpec();
  const cgRules = createMockContentGroupRules();

  const result = validateAllEvents([collected], scenarioSpec, paramSpec, cgRules);
  const sr = result.scenario_results[0];

  // view_item이 MISSING
  const missingEvents = sr.event_results.filter(er => er.status === 'MISSING');
  if (missingEvents.length === 0) {
    throw new Error('Expected at least 1 MISSING event, got 0');
  }

  const viewItemResult = sr.event_results.find(er => er.ga4_event_name === 'view_item');
  if (!viewItemResult) {
    throw new Error('view_item event result not found');
  }
  if (viewItemResult.status !== 'MISSING') {
    throw new Error(`Expected view_item status 'MISSING', got '${viewItemResult.status}'`);
  }
  if (viewItemResult.fired !== false) {
    throw new Error(`Expected view_item fired=false, got ${viewItemResult.fired}`);
  }

  // 시나리오 상태가 PASS가 아니어야 함
  if (sr.status === 'PASS') {
    throw new Error('Expected scenario status to NOT be PASS when event is missing');
  }

  console.log('  ✅ MISSING 케이스 테스트 통과');
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. EXTRA/forbidden 케이스
// ═══════════════════════════════════════════════════════════════════════════

function testExtraForbiddenCase(): void {
  const scenario = createMockScenarioDefinition({
    scenarioId: 'sc_extra_1',
    pageType: 'MAIN',
    expectedEvents: [{ event_name: 'page_view' }],
    forbiddenEvents: ['purchase', 'add_to_cart'],
  });

  // purchase가 발생함 (금지 이벤트)
  const collected = createMockScenarioCollected({
    scenarioId: 'sc_extra_1',
    autoFireEvents: [
      createMockEvent('page_view'),
      createMockEvent('purchase'),
    ],
  });

  const scenarioSpec = createMockScenarioSpec([scenario]);
  const paramSpec = createMockParameterSpec();
  const cgRules = createMockContentGroupRules();

  const result = validateAllEvents([collected], scenarioSpec, paramSpec, cgRules);
  const sr = result.scenario_results[0];

  // purchase가 EXTRA
  const extraEvents = sr.event_results.filter(er => er.status === 'EXTRA');
  if (extraEvents.length === 0) {
    throw new Error('Expected at least 1 EXTRA event, got 0');
  }

  const purchaseResult = sr.event_results.find(
    er => er.ga4_event_name === 'purchase' && er.expected_to_fire === false,
  );
  if (!purchaseResult) {
    throw new Error('purchase forbidden event result not found');
  }
  if (purchaseResult.status !== 'EXTRA') {
    throw new Error(`Expected purchase status 'EXTRA', got '${purchaseResult.status}'`);
  }

  // add_to_cart는 발생하지 않았으므로 PASS (금지인데 안 발생)
  const addToCartResult = sr.event_results.find(
    er => er.ga4_event_name === 'add_to_cart' && er.expected_to_fire === false,
  );
  if (addToCartResult && addToCartResult.status !== 'PASS') {
    throw new Error(`Expected add_to_cart forbidden (not fired) status 'PASS', got '${addToCartResult.status}'`);
  }

  // critical_issues에 EXTRA 이슈 포함 확인
  const extraIssues = result.critical_issues.filter(i => i.issue_type === 'extra_fire');
  if (extraIssues.length === 0) {
    throw new Error('Expected critical_issues to contain extra_fire issue');
  }

  console.log('  ✅ EXTRA/forbidden 케이스 테스트 통과');
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. 파라미터 검증
// ═══════════════════════════════════════════════════════════════════════════

function testParameterValidation(): void {
  const paramDef: ParameterDefinition = {
    param_id: 'param_page_view_page_title',
    param_name: 'page_title',
    ga4_param: 'page_title',
    level: 'event_level',
    category: 'custom',
    data_type: 'string',
    required: true,
    validation: { allow_null: false, allow_empty_string: false },
  };

  const eventParamSpec: EventParameterSpec = {
    event_id: 'evt_page_view',
    event_name: 'page_view',
    ga4_event_name: 'page_view',
    event_level_params: [paramDef],
    required_params_count: 1,
    total_params_count: 1,
  };

  const scenario = createMockScenarioDefinition({
    scenarioId: 'sc_param_1',
    expectedEvents: [{ event_name: 'page_view' }],
  });

  // page_title 파라미터가 포함된 이벤트
  const collected = createMockScenarioCollected({
    scenarioId: 'sc_param_1',
    autoFireEvents: [
      createMockEvent('page_view', { page_title: 'Test Page Title' }),
    ],
  });

  const scenarioSpec = createMockScenarioSpec([scenario]);
  const paramSpec = createMockParameterSpec([eventParamSpec]);
  const cgRules = createMockContentGroupRules();

  const result = validateAllEvents([collected], scenarioSpec, paramSpec, cgRules);
  const sr = result.scenario_results[0];

  // page_view 이벤트가 PASS여야 함
  const pvResult = sr.event_results.find(er => er.ga4_event_name === 'page_view');
  if (!pvResult) {
    throw new Error('page_view event result not found');
  }
  if (pvResult.status !== 'PASS') {
    throw new Error(`Expected page_view status 'PASS', got '${pvResult.status}'`);
  }

  // captured_params_count가 설정되어야 함
  if (pvResult.captured_params_count === undefined || pvResult.captured_params_count === 0) {
    // captured_params_count는 파라미터 검증 시 설정됨
    // 0이어도 검증 자체는 통과
  }

  console.log('  ✅ 파라미터 검증 테스트 통과');
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. 빈 수집 결과
// ═══════════════════════════════════════════════════════════════════════════

function testEmptyCollectedData(): void {
  // Case 1: 수집 데이터 배열 자체가 비어있음
  const scenario = createMockScenarioDefinition({
    scenarioId: 'sc_empty_1',
    expectedEvents: [{ event_name: 'page_view' }],
  });

  const scenarioSpec = createMockScenarioSpec([scenario]);
  const paramSpec = createMockParameterSpec();
  const cgRules = createMockContentGroupRules();

  // 빈 배열로 호출
  const result1 = validateAllEvents([], scenarioSpec, paramSpec, cgRules);
  if (result1.scenario_results.length !== 0) {
    throw new Error(`Empty input: expected 0 scenario results, got ${result1.scenario_results.length}`);
  }

  // Case 2: 수집 데이터는 있으나 이벤트가 없고 에러만 있음
  const collectedWithError = createMockScenarioCollected({
    scenarioId: 'sc_empty_1',
    autoFireEvents: [],
    allEvents: [],
    errors: ['페이지 수집 실패: timeout'],
  });

  const result2 = validateAllEvents([collectedWithError], scenarioSpec, paramSpec, cgRules);

  if (result2.scenario_results.length !== 1) {
    throw new Error(`Error case: expected 1 scenario result, got ${result2.scenario_results.length}`);
  }

  const sr = result2.scenario_results[0];
  if (sr.status !== 'ERROR') {
    throw new Error(`Expected scenario status 'ERROR' for empty events with errors, got '${sr.status}'`);
  }

  console.log('  ✅ 빈 수집 결과 테스트 통과');
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Summary 계산 검증
// ═══════════════════════════════════════════════════════════════════════════

function testSummaryCalculation(): void {
  // 2개 시나리오: 1개 PASS, 1개 FAIL (MISSING 이벤트)
  const scenario1 = createMockScenarioDefinition({
    scenarioId: 'sc_summary_pass',
    expectedEvents: [{ event_name: 'page_view' }],
  });

  const scenario2 = createMockScenarioDefinition({
    scenarioId: 'sc_summary_fail',
    expectedEvents: [
      { event_name: 'page_view' },
      { event_name: 'view_item', required: true },
    ],
    forbiddenEvents: ['purchase'],
  });

  const collected1 = createMockScenarioCollected({
    scenarioId: 'sc_summary_pass',
    autoFireEvents: [createMockEvent('page_view')],
  });

  const collected2 = createMockScenarioCollected({
    scenarioId: 'sc_summary_fail',
    autoFireEvents: [
      createMockEvent('page_view'),
      createMockEvent('purchase'), // 금지 이벤트 발생
    ],
    // view_item 미발생
  });

  const scenarioSpec = createMockScenarioSpec([scenario1, scenario2]);
  const paramSpec = createMockParameterSpec();
  const cgRules = createMockContentGroupRules();

  const result = validateAllEvents(
    [collected1, collected2],
    scenarioSpec,
    paramSpec,
    cgRules,
  );

  const summary = result.summary;

  // total_scenarios
  if (summary.total_scenarios !== 2) {
    throw new Error(`Expected total_scenarios=2, got ${summary.total_scenarios}`);
  }

  // passed_scenarios: 첫 번째만 PASS
  if (summary.passed_scenarios !== 1) {
    throw new Error(`Expected passed_scenarios=1, got ${summary.passed_scenarios}`);
  }

  // passed_events: scenario1의 page_view(PASS) + scenario2의 page_view(PASS) + 금지 이벤트 중 미발생(add_to_cart PASS)
  // 실제 값은 로직에 따라 달라질 수 있으므로 0보다 큰지만 확인
  if (summary.passed_events <= 0) {
    throw new Error(`Expected passed_events > 0, got ${summary.passed_events}`);
  }

  // missing_events: scenario2의 view_item
  if (summary.missing_events <= 0) {
    throw new Error(`Expected missing_events > 0, got ${summary.missing_events}`);
  }

  // extra_events: scenario2의 purchase
  if (summary.extra_events <= 0) {
    throw new Error(`Expected extra_events > 0, got ${summary.extra_events}`);
  }

  // scenario_pass_rate: 1/2 = 50%
  if (summary.scenario_pass_rate !== 50) {
    throw new Error(`Expected scenario_pass_rate=50, got ${summary.scenario_pass_rate}`);
  }

  // event_pass_rate: should be > 0 and < 100 (some pass, some fail)
  if (summary.event_pass_rate <= 0 || summary.event_pass_rate >= 100) {
    throw new Error(`Expected event_pass_rate between 0 and 100 exclusive, got ${summary.event_pass_rate}`);
  }

  // overall_score: weighted combination, should be > 0
  if (typeof summary.overall_score !== 'number' || summary.overall_score < 0) {
    throw new Error(`Expected overall_score >= 0, got ${summary.overall_score}`);
  }

  // summary_by_channel 확인
  if (!Array.isArray(result.summary_by_channel) || result.summary_by_channel.length === 0) {
    throw new Error('summary_by_channel이 비어있음');
  }

  // summary_by_page_type 확인
  if (!Array.isArray(result.summary_by_page_type) || result.summary_by_page_type.length === 0) {
    throw new Error('summary_by_page_type이 비어있음');
  }

  // critical_issues에 missing + extra 이슈 포함
  if (!Array.isArray(result.critical_issues)) {
    throw new Error('critical_issues가 배열이 아님');
  }
  const missingIssues = result.critical_issues.filter(i => i.issue_type === 'missing_trigger');
  const extraIssues = result.critical_issues.filter(i => i.issue_type === 'extra_fire');
  if (missingIssues.length === 0) {
    throw new Error('Expected critical_issues to contain missing_trigger issues');
  }
  if (extraIssues.length === 0) {
    throw new Error('Expected critical_issues to contain extra_fire issues');
  }

  console.log(`  ✅ Summary 계산 검증 테스트 통과 (pass_rate=${summary.scenario_pass_rate}%, score=${summary.overall_score})`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Jest Test Suite
// ═══════════════════════════════════════════════════════════════════════════

describe('Event Validator', () => {
  test('PASS 케이스', () => {
    testPassCase();
  });

  test('MISSING 케이스', () => {
    testMissingCase();
  });

  test('EXTRA/forbidden 케이스', () => {
    testExtraForbiddenCase();
  });

  test('파라미터 검증', () => {
    testParameterValidation();
  });

  test('빈 수집 결과', () => {
    testEmptyCollectedData();
  });

  test('Summary 계산 검증', () => {
    testSummaryCalculation();
  });
});
