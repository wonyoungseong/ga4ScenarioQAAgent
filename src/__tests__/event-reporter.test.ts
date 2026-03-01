/**
 * Event Reporter 테스트
 *
 * Mock EventValidationResult 데이터를 사용한 리포트 기능 단위 테스트:
 * 1. printEventBasedReport - 이벤트 중심 콘솔 리포트 (예외 없이 실행)
 * 2. generateEventExcelReport - Excel 리포트 생성 (파일 생성 + 경로 반환)
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  printEventBasedReport,
  generateEventExcelReport,
} from '../agents/reporter/event-reporter';
import type {
  EventValidationResult,
  ScenarioResult,
  EventResult,
  EventValidationSummary,
  PageTypeEventSummary,
  ChannelEventSummary,
  EventCriticalIssue,
} from '../types/event-validation-result';
import type { EventValidationStatus, ScenarioValidationStatus } from '../types/event-validation-result';

// ─────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────

const TEMP_DIR = `/tmp/event-reporter-test-${Date.now()}`;

// ─────────────────────────────────────────────────────────────────────
// Mock Data Builders
// ─────────────────────────────────────────────────────────────────────

function createMockEventResult(opts: {
  event_name: string;
  status: EventValidationStatus;
  fired?: boolean;
  expected_to_fire?: boolean;
  fired_at_ms?: number;
  captured_params_count?: number;
}): EventResult {
  return {
    event_name: opts.event_name,
    ga4_event_name: opts.event_name,
    status: opts.status,
    fired: opts.fired ?? (opts.status === 'PASS' || opts.status === 'EXTRA'),
    expected_to_fire: opts.expected_to_fire ?? (opts.status !== 'EXTRA'),
    fired_at_ms: opts.fired_at_ms,
    captured_params_count: opts.captured_params_count,
  };
}

function createMockScenarioResult(opts: {
  scenario_id: string;
  page_type: 'MAIN' | 'PRODUCT_DETAIL' | 'CART';
  url: string;
  status: ScenarioValidationStatus;
  event_results: EventResult[];
  action_type?: string;
}): ScenarioResult {
  const passed = opts.event_results.filter(e => e.status === 'PASS').length;
  const failed = opts.event_results.filter(e => e.status === 'FAIL').length;
  const missing = opts.event_results.filter(e => e.status === 'MISSING').length;
  const extra = opts.event_results.filter(e => e.status === 'EXTRA').length;

  const total = opts.event_results.length;
  const score = total > 0 ? Math.round((passed / total) * 100) : 0;

  const result: ScenarioResult = {
    scenario_id: opts.scenario_id,
    scenario_name: `Test: ${opts.scenario_id}`,
    status: opts.status,
    page_type: opts.page_type,
    validated_url: opts.url,
    channel: 'pc_no_login',
    action_id: '',
    event_results: opts.event_results,
    passed_count: passed,
    failed_count: failed,
    missing_count: missing,
    extra_count: extra,
    score,
    started_at: new Date().toISOString(),
    ended_at: new Date().toISOString(),
    duration_ms: 2500,
  };

  if (opts.action_type) {
    result.user_action_performed = {
      action_type: opts.action_type as any,
      success: true,
      duration_ms: 300,
    };
  }

  return result;
}

function createMockValidationResult(): EventValidationResult {
  // Scenario 1: MAIN page - all PASS
  const scenario1 = createMockScenarioResult({
    scenario_id: 'sc_main_auto',
    page_type: 'MAIN',
    url: 'https://www.innisfree.jp/',
    status: 'PASS',
    event_results: [
      createMockEventResult({
        event_name: 'page_view',
        status: 'PASS',
        fired_at_ms: 120,
        captured_params_count: 5,
      }),
      createMockEventResult({
        event_name: 'view_promotion',
        status: 'PASS',
        fired_at_ms: 350,
        captured_params_count: 3,
      }),
    ],
  });

  // Scenario 2: PRODUCT_DETAIL page - one MISSING event
  const scenario2 = createMockScenarioResult({
    scenario_id: 'sc_pdp_auto',
    page_type: 'PRODUCT_DETAIL',
    url: 'https://www.innisfree.jp/products/green-tea-serum',
    status: 'PARTIAL',
    event_results: [
      createMockEventResult({
        event_name: 'page_view',
        status: 'PASS',
        fired_at_ms: 100,
        captured_params_count: 5,
      }),
      createMockEventResult({
        event_name: 'view_item',
        status: 'MISSING',
        fired: false,
        expected_to_fire: true,
      }),
      createMockEventResult({
        event_name: 'purchase',
        status: 'PASS',
        fired: false,
        expected_to_fire: false,
      }),
    ],
  });

  // Scenario 3: CART page with action - FAIL due to EXTRA event
  const scenario3 = createMockScenarioResult({
    scenario_id: 'sc_cart_click',
    page_type: 'CART',
    url: 'https://www.innisfree.jp/cart',
    status: 'FAIL',
    action_type: 'click',
    event_results: [
      createMockEventResult({
        event_name: 'page_view',
        status: 'PASS',
        fired_at_ms: 95,
        captured_params_count: 4,
      }),
      createMockEventResult({
        event_name: 'begin_checkout',
        status: 'FAIL',
        fired: true,
        expected_to_fire: true,
        fired_at_ms: 1200,
      }),
      createMockEventResult({
        event_name: 'add_to_cart',
        status: 'EXTRA',
        fired: true,
        expected_to_fire: false,
        fired_at_ms: 800,
      }),
    ],
  });

  // Summary computation
  const allEvents = [
    ...scenario1.event_results,
    ...scenario2.event_results,
    ...scenario3.event_results,
  ];
  const totalEvents = allEvents.length;
  const passedEvents = allEvents.filter(e => e.status === 'PASS').length;
  const failedEvents = allEvents.filter(e => e.status === 'FAIL').length;
  const missingEvents = allEvents.filter(e => e.status === 'MISSING').length;
  const extraEvents = allEvents.filter(e => e.status === 'EXTRA').length;

  const scenarios = [scenario1, scenario2, scenario3];
  const passedScenarios = scenarios.filter(s => s.status === 'PASS').length;
  const failedScenarios = scenarios.filter(s => s.status === 'FAIL').length;
  const errorScenarios = scenarios.filter(s => s.status === 'ERROR').length;

  const summary: EventValidationSummary = {
    total_scenarios: scenarios.length,
    passed_scenarios: passedScenarios,
    failed_scenarios: failedScenarios,
    error_scenarios: errorScenarios,
    total_events: totalEvents,
    passed_events: passedEvents,
    failed_events: failedEvents,
    missing_events: missingEvents,
    extra_events: extraEvents,
    scenario_pass_rate: Math.round((passedScenarios / scenarios.length) * 100),
    event_pass_rate: Math.round((passedEvents / totalEvents) * 100),
    overall_score: Math.round((passedEvents / totalEvents) * 100),
  };

  const summary_by_page_type: PageTypeEventSummary[] = [
    {
      page_type: 'MAIN',
      total_scenarios: 1,
      passed_scenarios: 1,
      pass_rate: 100,
      most_failed_events: [],
    },
    {
      page_type: 'PRODUCT_DETAIL',
      total_scenarios: 1,
      passed_scenarios: 0,
      pass_rate: 0,
      most_failed_events: ['view_item'],
    },
    {
      page_type: 'CART',
      total_scenarios: 1,
      passed_scenarios: 0,
      pass_rate: 0,
      most_failed_events: ['begin_checkout', 'add_to_cart'],
    },
  ];

  const summary_by_channel: ChannelEventSummary[] = [
    {
      channel: 'pc_no_login',
      total_scenarios: 3,
      passed_scenarios: 1,
      failed_scenarios: 2,
      total_events: totalEvents,
      passed_events: passedEvents,
      failed_events: failedEvents,
      missing_events: missingEvents,
      extra_events: extraEvents,
      pass_rate: Math.round((passedEvents / totalEvents) * 100),
    },
  ];

  const critical_issues: EventCriticalIssue[] = [];

  return {
    project_id: 'test-project',
    brand_id: 'test-brand',
    version: '1.0',
    validated_at: new Date().toISOString(),
    spec_version: '1.0',
    scenario_results: scenarios,
    summary,
    summary_by_channel,
    summary_by_page_type,
    critical_issues,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. printEventBasedReport - 예외 없이 실행되는지 확인
// ═══════════════════════════════════════════════════════════════════════════

function testPrintEventBasedReport(): void {
  const result = createMockValidationResult();

  // Should not throw
  printEventBasedReport(result);

  console.log('  [PASS] printEventBasedReport 예외 없이 실행');
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. printEventBasedReport - 빈 결과로도 예외 없이 실행
// ═══════════════════════════════════════════════════════════════════════════

function testPrintEventBasedReportEmpty(): void {
  const emptyResult: EventValidationResult = {
    project_id: 'test-project',
    brand_id: 'test-brand',
    version: '1.0',
    validated_at: new Date().toISOString(),
    spec_version: '1.0',
    scenario_results: [],
    summary: {
      total_scenarios: 0,
      passed_scenarios: 0,
      failed_scenarios: 0,
      error_scenarios: 0,
      total_events: 0,
      passed_events: 0,
      failed_events: 0,
      missing_events: 0,
      extra_events: 0,
      scenario_pass_rate: 0,
      event_pass_rate: 0,
      overall_score: 0,
    },
    summary_by_channel: [],
    summary_by_page_type: [],
    critical_issues: [],
  };

  // Should not throw even with empty data
  printEventBasedReport(emptyResult);

  console.log('  [PASS] printEventBasedReport 빈 결과 예외 없이 실행');
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. generateEventExcelReport - xlsx 파일 생성 + 경로 반환
// ═══════════════════════════════════════════════════════════════════════════

async function testGenerateEventExcelReport(): Promise<void> {
  const result = createMockValidationResult();

  const filePath = await generateEventExcelReport(result, TEMP_DIR);

  // 반환된 경로가 문자열인지 확인
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error(`Expected non-empty file path string, got: ${filePath}`);
  }

  // 파일이 .xlsx 확장자인지 확인
  if (!filePath.endsWith('.xlsx')) {
    throw new Error(`Expected .xlsx extension, got: ${path.extname(filePath)}`);
  }

  // 파일이 실제로 존재하는지 확인
  if (!fs.existsSync(filePath)) {
    throw new Error(`Excel file not found at: ${filePath}`);
  }

  // 파일 크기가 0보다 큰지 확인
  const stats = fs.statSync(filePath);
  if (stats.size <= 0) {
    throw new Error(`Excel file is empty (0 bytes) at: ${filePath}`);
  }

  // 반환된 경로가 outputDir 내에 있는지 확인
  if (!filePath.startsWith(TEMP_DIR)) {
    throw new Error(`File path not within output directory: ${filePath}`);
  }

  console.log(`  [PASS] generateEventExcelReport xlsx 파일 생성 완료 (${stats.size} bytes)`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. generateEventExcelReport - 출력 디렉토리 자동 생성
// ═══════════════════════════════════════════════════════════════════════════

async function testExcelReportCreatesDirectory(): Promise<void> {
  const result = createMockValidationResult();
  const nestedDir = path.join(TEMP_DIR, 'nested', 'sub');

  const filePath = await generateEventExcelReport(result, nestedDir);

  // 중첩 디렉토리가 생성되었는지 확인
  if (!fs.existsSync(nestedDir)) {
    throw new Error(`Nested directory was not created: ${nestedDir}`);
  }

  // 파일이 존재하는지 확인
  if (!fs.existsSync(filePath)) {
    throw new Error(`Excel file not found at: ${filePath}`);
  }

  console.log('  [PASS] generateEventExcelReport 중첩 디렉토리 자동 생성');
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. generateEventExcelReport - 빈 결과로도 정상 생성
// ═══════════════════════════════════════════════════════════════════════════

async function testExcelReportWithEmptyResult(): Promise<void> {
  const emptyResult: EventValidationResult = {
    project_id: 'test-project',
    brand_id: 'test-brand',
    version: '1.0',
    validated_at: new Date().toISOString(),
    spec_version: '1.0',
    scenario_results: [],
    summary: {
      total_scenarios: 0,
      passed_scenarios: 0,
      failed_scenarios: 0,
      error_scenarios: 0,
      total_events: 0,
      passed_events: 0,
      failed_events: 0,
      missing_events: 0,
      extra_events: 0,
      scenario_pass_rate: 0,
      event_pass_rate: 0,
      overall_score: 0,
    },
    summary_by_channel: [],
    summary_by_page_type: [],
    critical_issues: [],
  };

  const emptyDir = path.join(TEMP_DIR, 'empty');
  const filePath = await generateEventExcelReport(emptyResult, emptyDir);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Excel file not found for empty result at: ${filePath}`);
  }

  const stats = fs.statSync(filePath);
  if (stats.size <= 0) {
    throw new Error(`Excel file is empty for empty result`);
  }

  console.log(`  [PASS] generateEventExcelReport 빈 결과 정상 생성 (${stats.size} bytes)`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Cleanup
// ═══════════════════════════════════════════════════════════════════════════

function cleanup(): void {
  try {
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Jest Test Suite
// ═══════════════════════════════════════════════════════════════════════════

afterAll(() => {
  cleanup();
});

describe('Event Reporter', () => {
  test('printEventBasedReport 정상 실행', () => {
    testPrintEventBasedReport();
  });

  test('printEventBasedReport 빈 결과', () => {
    testPrintEventBasedReportEmpty();
  });

  test('generateEventExcelReport xlsx 생성', async () => {
    await testGenerateEventExcelReport();
  });

  test('generateEventExcelReport 디렉토리 생성', async () => {
    await testExcelReportCreatesDirectory();
  });

  test('generateEventExcelReport 빈 결과', async () => {
    await testExcelReportWithEmptyResult();
  });
});
