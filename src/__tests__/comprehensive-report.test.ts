/**
 * GA4 QA 종합 리포트 테스트
 *
 * 3개 신규 모듈 단위 테스트:
 * 1. ScenarioIdGenerator - Action/Event ID 생성 로직
 * 2. TriggerConditionAnalyzer - 변수 체인 해석, As-Is/To-Be 생성
 * 3. generateComprehensiveEventExcelReport - Excel 탭 구조, 데이터 매핑
 */

import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';

import { ScenarioIdGenerator } from '../agents/analyzer/scenario-id-generator';
import {
  analyzeTriggerCondition,
  resolveVariableChain,
  generateAsIs,
  generateToBe,
} from '../agents/analyzer/trigger-condition-analyzer';
import { generateComprehensiveEventExcelReport } from '../agents/reporter/comprehensive-event-reporter';

import type { GTMContainer, GTMVariable, GTMTrigger, GTMTag } from '../types/gtm-container';
import type {
  EventValidationResult,
  EventValidationSummary,
  ScenarioResult,
  EventResult,
} from '../types/event-validation-result';
import type { MultiChannelEventResult } from '../types/qa-report';
import type { ChannelCombination } from '../types/common';
import type { EventScenarioSpec } from '../types/event-scenario';
import type { GTMParserOutput } from '../types/content-group';
import type { TriggerConditionTrace } from '../types/qa-report';

// ─────────────────────────────────────────────────────────────────────
// Test Output Directory
// ─────────────────────────────────────────────────────────────────────

const TEMP_DIR = `/tmp/comprehensive-report-test-${Date.now()}`;

// ─────────────────────────────────────────────────────────────────────
// Mock Data Builders
// ─────────────────────────────────────────────────────────────────────

function createMockEventResult(opts: {
  event_name: string;
  status: 'PASS' | 'FAIL' | 'MISSING' | 'EXTRA' | 'SKIP';
  fired?: boolean;
  expected_to_fire?: boolean;
}): EventResult {
  return {
    event_name: opts.event_name,
    ga4_event_name: opts.event_name,
    status: opts.status,
    fired: opts.fired ?? (opts.status === 'PASS' || opts.status === 'EXTRA'),
    expected_to_fire: opts.expected_to_fire ?? (opts.status !== 'EXTRA'),
  };
}

function createMockScenarioResult(opts: {
  scenario_id: string;
  scenario_name: string;
  page_type: string;
  url: string;
  channel: ChannelCombination;
  event_results: EventResult[];
  action_type?: string;
}): ScenarioResult {
  const passed = opts.event_results.filter(e => e.status === 'PASS').length;
  const failed = opts.event_results.filter(e => e.status === 'FAIL').length;
  const missing = opts.event_results.filter(e => e.status === 'MISSING').length;
  const extra = opts.event_results.filter(e => e.status === 'EXTRA').length;
  const total = opts.event_results.length;
  const allPass = failed === 0 && missing === 0 && extra === 0;

  const result: ScenarioResult = {
    scenario_id: opts.scenario_id,
    scenario_name: opts.scenario_name,
    status: allPass ? 'PASS' : 'FAIL',
    page_type: opts.page_type as any,
    validated_url: opts.url,
    channel: opts.channel,
    action_id: '',
    event_results: opts.event_results,
    passed_count: passed,
    failed_count: failed,
    missing_count: missing,
    extra_count: extra,
    score: total > 0 ? Math.round((passed / total) * 100) : 0,
    started_at: new Date().toISOString(),
    ended_at: new Date().toISOString(),
    duration_ms: 2000,
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

function createMockSummary(scenarios: ScenarioResult[]): EventValidationSummary {
  const allEvents = scenarios.flatMap(s => s.event_results);
  const total = allEvents.length;
  const passed = allEvents.filter(e => e.status === 'PASS').length;

  return {
    total_scenarios: scenarios.length,
    passed_scenarios: scenarios.filter(s => s.status === 'PASS').length,
    failed_scenarios: scenarios.filter(s => s.status === 'FAIL').length,
    error_scenarios: 0,
    total_events: total,
    passed_events: passed,
    failed_events: allEvents.filter(e => e.status === 'FAIL').length,
    missing_events: allEvents.filter(e => e.status === 'MISSING').length,
    extra_events: allEvents.filter(e => e.status === 'EXTRA').length,
    scenario_pass_rate: scenarios.length > 0 ? Math.round((scenarios.filter(s => s.status === 'PASS').length / scenarios.length) * 100) : 0,
    event_pass_rate: total > 0 ? Math.round((passed / total) * 100) : 0,
    overall_score: total > 0 ? Math.round((passed / total) * 100) : 0,
  };
}

function createMockValidationResult(
  _channel: ChannelCombination,
  scenarios: ScenarioResult[],
): EventValidationResult {
  return {
    project_id: 'test-project',
    brand_id: 'test-brand',
    version: '1.0',
    validated_at: new Date().toISOString(),
    spec_version: '1.0',
    scenario_results: scenarios,
    summary: createMockSummary(scenarios),
    summary_by_channel: [],
    summary_by_page_type: [],
    critical_issues: [],
  };
}

function createMockGTMContainer(): GTMContainer {
  const triggers: GTMTrigger[] = [
    {
      accountId: '1',
      containerId: '1',
      triggerId: '100',
      name: 'CE - ap_page_view',
      type: 'CUSTOM_EVENT',
      customEventFilter: [
        {
          type: 'EQUALS',
          parameter: [
            { type: 'TEMPLATE', key: 'arg0', value: '{{_event}}' },
            { type: 'TEMPLATE', key: 'arg1', value: 'ap_page_view' },
          ],
        },
      ],
      filter: [
        {
          type: 'CONTAINS',
          parameter: [
            { type: 'TEMPLATE', key: 'arg0', value: '{{Content Group}}' },
            { type: 'TEMPLATE', key: 'arg1', value: 'MAIN' },
          ],
        },
      ],
      fingerprint: '1',
      tagManagerUrl: '',
    },
  ];

  const tags: GTMTag[] = [
    {
      accountId: '1',
      containerId: '1',
      tagId: '200',
      name: 'GA4 - page_view',
      type: 'gaawe',
      parameter: [
        { type: 'TEMPLATE', key: 'eventName', value: 'page_view' },
      ],
      firingTriggerId: ['100'],
      fingerprint: '1',
      tagManagerUrl: '',
    },
  ];

  const variables: GTMVariable[] = [
    {
      accountId: '1',
      containerId: '1',
      variableId: '300',
      name: 'Content Group',
      type: 'jsm',
      parameter: [
        { type: 'TEMPLATE', key: 'javascript', value: 'function(){return {{DLV - AP_DATA_PAGETYPE}} || "OTHERS"}' },
      ],
      fingerprint: '1',
      tagManagerUrl: '',
    },
    {
      accountId: '1',
      containerId: '1',
      variableId: '301',
      name: 'DLV - AP_DATA_PAGETYPE',
      type: 'v',
      parameter: [
        { type: 'TEMPLATE', key: 'name', value: 'AP_DATA_PAGETYPE' },
      ],
      fingerprint: '1',
      tagManagerUrl: '',
    },
  ];

  return {
    exportFormatVersion: 2,
    exportTime: new Date().toISOString(),
    containerVersion: {
      accountId: '1',
      containerId: '1',
      containerVersionId: '1',
      container: {
        accountId: '1',
        containerId: '1',
        name: 'Test Container',
        publicId: 'GTM-TEST',
        usageContext: ['WEB'],
        fingerprint: '1',
        tagManagerUrl: '',
      },
      tag: tags,
      trigger: triggers,
      variable: variables,
      fingerprint: '1',
      tagManagerUrl: '',
    },
  };
}

function createMinimalParserOutput(): GTMParserOutput {
  return {
    scenario_spec: {
      project_id: 'test',
      brand_id: 'test',
      version: '1.0',
      created_at: new Date().toISOString(),
      events: [
        {
          event_id: 'e1',
          event_name: 'page_view',
          ga4_event_name: 'page_view',
          fire_condition: 'auto_fire',
          trigger_type: 'pageLoad',
          category: 'pageview',
          priority: 1,
          allowed_page_types: [],
          enabled_channels: { pc_login: true, pc_no_login: true, mo_login: true, mo_no_login: true },
        },
        {
          event_id: 'e2',
          event_name: 'view_item',
          ga4_event_name: 'view_item',
          fire_condition: 'auto_fire',
          trigger_type: 'pageLoad',
          category: 'ecommerce',
          priority: 2,
          allowed_page_types: [],
          enabled_channels: { pc_login: true, pc_no_login: true, mo_login: true, mo_no_login: true },
        },
        {
          event_id: 'e3',
          event_name: 'add_to_cart',
          ga4_event_name: 'add_to_cart',
          fire_condition: 'user_action',
          trigger_type: 'click',
          category: 'ecommerce',
          priority: 3,
          allowed_page_types: [],
          enabled_channels: { pc_login: true, pc_no_login: true, mo_login: true, mo_no_login: true },
        },
      ],
      scenarios: [],
      page_rules: [],
      total_events: 3,
      total_scenarios: 0,
    } as EventScenarioSpec,
    parameter_spec: {
      project_id: 'test',
      brand_id: 'test',
      version: '1.0',
      created_at: new Date().toISOString(),
      event_specs: [],
      total_events: 0,
      total_parameters: 0,
      required_parameters: 0,
    },
    content_group_rules: [],
    warnings: [],
    raw_container: createMockGTMContainer(),
  };
}

function createMultiChannelTestData(): MultiChannelEventResult {
  const parserOutput = createMinimalParserOutput();

  // PC No Login scenarios
  const pcNoLoginScenarios: ScenarioResult[] = [
    createMockScenarioResult({
      scenario_id: 'sc_main_auto',
      scenario_name: 'MAIN 자동 발생',
      page_type: 'MAIN',
      url: 'https://example.com/',
      channel: 'pc_no_login',
      event_results: [
        createMockEventResult({ event_name: 'page_view', status: 'PASS' }),
      ],
    }),
    createMockScenarioResult({
      scenario_id: 'sc_pdp_auto',
      scenario_name: 'PDP 자동 발생',
      page_type: 'PRODUCT_DETAIL',
      url: 'https://example.com/product/1',
      channel: 'pc_no_login',
      event_results: [
        createMockEventResult({ event_name: 'page_view', status: 'PASS' }),
        createMockEventResult({ event_name: 'view_item', status: 'MISSING', fired: false }),
      ],
    }),
    createMockScenarioResult({
      scenario_id: 'sc_pdp_click',
      scenario_name: 'PDP 장바구니 클릭',
      page_type: 'PRODUCT_DETAIL',
      url: 'https://example.com/product/1',
      channel: 'pc_no_login',
      action_type: 'click',
      event_results: [
        createMockEventResult({ event_name: 'add_to_cart', status: 'PASS' }),
      ],
    }),
  ];

  // MO No Login scenarios
  const moNoLoginScenarios: ScenarioResult[] = [
    createMockScenarioResult({
      scenario_id: 'sc_main_auto_mo',
      scenario_name: 'MAIN 자동 발생 (MO)',
      page_type: 'MAIN',
      url: 'https://example.com/',
      channel: 'mo_no_login',
      event_results: [
        createMockEventResult({ event_name: 'page_view', status: 'PASS' }),
      ],
    }),
    createMockScenarioResult({
      scenario_id: 'sc_pdp_auto_mo',
      scenario_name: 'PDP 자동 발생 (MO)',
      page_type: 'PRODUCT_DETAIL',
      url: 'https://example.com/product/1',
      channel: 'mo_no_login',
      event_results: [
        createMockEventResult({ event_name: 'page_view', status: 'PASS' }),
        createMockEventResult({ event_name: 'view_item', status: 'PASS' }),
      ],
    }),
  ];

  return {
    channel_results: {
      pc_no_login: createMockValidationResult('pc_no_login', pcNoLoginScenarios),
      mo_no_login: createMockValidationResult('mo_no_login', moNoLoginScenarios),
    },
    parser_output: parserOutput,
    all_event_names: ['page_view', 'view_item', 'add_to_cart'],
    events_by_channel: {
      pc_no_login: ['page_view', 'view_item', 'add_to_cart'],
      mo_no_login: ['page_view', 'view_item'],
    },
    urls_by_channel: {
      pc_no_login: ['https://example.com/', 'https://example.com/product/1'],
      mo_no_login: ['https://example.com/', 'https://example.com/product/1'],
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Test Suite 1: ScenarioIdGenerator
// ═══════════════════════════════════════════════════════════════════════════

describe('ScenarioIdGenerator', () => {
  test('같은 채널+URL+action은 같은 Action ID를 반환', () => {
    const gen = new ScenarioIdGenerator();
    const id1 = gen.generate('pc_no_login', 'https://example.com/', 'auto_fire');
    const id2 = gen.generate('pc_no_login', 'https://example.com/', 'auto_fire');

    expect(id1.action_id).toBe('A001');
    expect(id2.action_id).toBe('A001');
    expect(id1.event_id).toBe('E001-1');
    expect(id2.event_id).toBe('E001-2');
  });

  test('다른 URL은 다른 Action ID를 반환', () => {
    const gen = new ScenarioIdGenerator();
    const id1 = gen.generate('pc_no_login', 'https://example.com/', 'auto_fire');
    const id2 = gen.generate('pc_no_login', 'https://example.com/product', 'auto_fire');

    expect(id1.action_id).toBe('A001');
    expect(id2.action_id).toBe('A002');
  });

  test('같은 URL + 다른 action은 다른 Action ID', () => {
    const gen = new ScenarioIdGenerator();
    const id1 = gen.generate('pc_no_login', 'https://example.com/', 'auto_fire');
    const id2 = gen.generate('pc_no_login', 'https://example.com/', 'click:.btn');

    expect(id1.action_id).toBe('A001');
    expect(id2.action_id).toBe('A002');
  });

  test('같은 URL+action이라도 다른 채널이면 다른 Action ID', () => {
    const gen = new ScenarioIdGenerator();
    const id1 = gen.generate('pc_no_login', 'https://example.com/', 'auto_fire');
    const id2 = gen.generate('mo_no_login', 'https://example.com/', 'auto_fire');

    expect(id1.action_id).toBe('A001');
    expect(id2.action_id).toBe('A002');
    expect(id1.event_id).toBe('E001-1');
    expect(id2.event_id).toBe('E002-1');
  });

  test('reset()이 상태를 초기화', () => {
    const gen = new ScenarioIdGenerator();
    gen.generate('pc_no_login', 'https://example.com/', 'auto_fire');
    gen.reset();
    const id = gen.generate('pc_no_login', 'https://example.com/', 'auto_fire');

    expect(id.action_id).toBe('A001');
    expect(id.event_id).toBe('E001-1');
  });

  test('ID 형식이 올바름 (A001, E001-1)', () => {
    const gen = new ScenarioIdGenerator();
    const id = gen.generate('pc_no_login', 'url', 'action');

    expect(id.action_id).toMatch(/^A\d{3}$/);
    expect(id.event_id).toMatch(/^E\d{3}-\d+$/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Test Suite 2: TriggerConditionAnalyzer
// ═══════════════════════════════════════════════════════════════════════════

describe('TriggerConditionAnalyzer', () => {
  const container = createMockGTMContainer();

  describe('resolveVariableChain', () => {
    test('Data Layer Variable (v) 해석', () => {
      const variables = container.containerVersion.variable!;
      const chain = resolveVariableChain('DLV - AP_DATA_PAGETYPE', variables);

      expect(chain.length).toBe(1);
      expect(chain[0].variable_type).toBe('v');
      expect(chain[0].resolves_to).toBe('dataLayer.AP_DATA_PAGETYPE');
      expect(chain[0].final_source).toBe('dataLayer.AP_DATA_PAGETYPE');
    });

    test('Custom JavaScript (jsm) 변수 재귀 해석', () => {
      const variables = container.containerVersion.variable!;
      const chain = resolveVariableChain('Content Group', variables);

      // jsm → references {{DLV - AP_DATA_PAGETYPE}} → v type
      expect(chain.length).toBeGreaterThanOrEqual(2);
      expect(chain[0].variable_type).toBe('jsm');
      expect(chain[0].resolves_to).toContain('DLV - AP_DATA_PAGETYPE');

      // Second step should be the data layer variable
      const dlvStep = chain.find(s => s.variable_type === 'v');
      expect(dlvStep).toBeDefined();
      expect(dlvStep!.final_source).toBe('dataLayer.AP_DATA_PAGETYPE');
    });

    test('존재하지 않는 변수 → built-in으로 처리', () => {
      const variables = container.containerVersion.variable!;
      const chain = resolveVariableChain('_event', variables);

      expect(chain.length).toBe(1);
      expect(chain[0].variable_type).toBe('built-in');
    });

    test('순환 참조 방지', () => {
      const circularVars: GTMVariable[] = [
        {
          accountId: '1', containerId: '1', variableId: '1',
          name: 'VarA', type: 'jsm',
          parameter: [{ type: 'TEMPLATE', key: 'javascript', value: '{{VarB}}' }],
          fingerprint: '1', tagManagerUrl: '',
        },
        {
          accountId: '1', containerId: '1', variableId: '2',
          name: 'VarB', type: 'jsm',
          parameter: [{ type: 'TEMPLATE', key: 'javascript', value: '{{VarA}}' }],
          fingerprint: '1', tagManagerUrl: '',
        },
      ];

      // Should not throw or infinite loop
      const chain = resolveVariableChain('VarA', circularVars);
      expect(chain.length).toBeGreaterThan(0);
    });
  });

  describe('analyzeTriggerCondition', () => {
    test('page_view 이벤트의 트리거 조건 분석', () => {
      const trace = analyzeTriggerCondition('page_view', container);

      expect(trace).not.toBeNull();
      expect(trace!.event_name).toBe('page_view');
      expect(trace!.tag_name).toBe('GA4 - page_view');
      expect(trace!.tag_id).toBe('200');
      expect(trace!.trigger_type).toBe('CUSTOM_EVENT');
      expect(trace!.custom_event_filter).toBe('ap_page_view');
      expect(trace!.filter_conditions.length).toBeGreaterThan(0);
    });

    test('존재하지 않는 이벤트 → null 반환', () => {
      const trace = analyzeTriggerCondition('nonexistent_event', container);
      expect(trace).toBeNull();
    });

    test('filter_conditions에 human_readable 포함', () => {
      const trace = analyzeTriggerCondition('page_view', container);

      expect(trace).not.toBeNull();
      for (const fc of trace!.filter_conditions) {
        expect(fc.human_readable).toBeTruthy();
        expect(typeof fc.human_readable).toBe('string');
      }
    });
  });

  describe('generateAsIs / generateToBe', () => {
    test('MISSING 상태의 As-Is 생성', () => {
      const trace: TriggerConditionTrace = {
        event_name: 'view_item',
        tag_name: 'GA4 - view_item',
        tag_id: '201',
        trigger_type: 'CUSTOM_EVENT',
        filter_conditions: [
          { type: 'CONTAINS', variable: '{{Content Group}}', value: 'PRODUCT_DETAIL', negate: false, human_readable: '{{Content Group}} contains "PRODUCT_DETAIL"' },
        ],
        custom_event_filter: 'product',
        variable_chain: [
          { variable_name: 'Content Group', variable_type: 'jsm', resolves_to: 'Custom JS using {{DLV - AP_DATA_PAGETYPE}}' },
          { variable_name: 'DLV - AP_DATA_PAGETYPE', variable_type: 'v', resolves_to: 'dataLayer.AP_DATA_PAGETYPE', final_source: 'dataLayer.AP_DATA_PAGETYPE' },
        ],
      };

      const asIs = generateAsIs(trace, 'MISSING', 'PRODUCT_LIST', 'PLP에서 view_item 미발생');
      expect(asIs).toContain('GA4 - view_item');
      expect(asIs).toContain('CUSTOM_EVENT');
      expect(asIs).toContain('product');
      expect(asIs).toContain('트리거 조건 미충족');
    });

    test('MISSING 상태의 To-Be 생성', () => {
      const trace: TriggerConditionTrace = {
        event_name: 'view_item',
        tag_name: 'GA4 - view_item',
        tag_id: '201',
        trigger_type: 'CUSTOM_EVENT',
        filter_conditions: [
          { type: 'CONTAINS', variable: '{{Content Group}}', value: 'PRODUCT_DETAIL', negate: false, human_readable: '{{Content Group}} contains "PRODUCT_DETAIL"' },
        ],
        custom_event_filter: 'product',
        variable_chain: [
          { variable_name: 'Content Group', variable_type: 'jsm', resolves_to: 'Custom JS' },
          { variable_name: 'DLV - AP_DATA_PAGETYPE', variable_type: 'v', resolves_to: 'dataLayer.AP_DATA_PAGETYPE', final_source: 'dataLayer.AP_DATA_PAGETYPE' },
        ],
      };

      const toBe = generateToBe(trace, 'MISSING', 'PRODUCT_LIST');
      expect(toBe).toContain('dataLayer');
      expect(toBe).toContain('product');
    });

    test('trace가 null일 때 기본 As-Is/To-Be', () => {
      const asIs = generateAsIs(null, 'MISSING', 'MAIN', '');
      expect(asIs).toContain('이벤트 미발생');

      const toBe = generateToBe(null, 'MISSING', 'MAIN');
      expect(toBe).toContain('dataLayer push 구현 필요');
    });

    test('EXTRA 상태의 To-Be 생성', () => {
      const trace: TriggerConditionTrace = {
        event_name: 'test',
        tag_name: 'GA4 - test',
        tag_id: '999',
        trigger_type: 'CUSTOM_EVENT',
        filter_conditions: [],
        content_group_filter: 'MAIN',
        variable_chain: [],
      };

      const toBe = generateToBe(trace, 'EXTRA', 'CART');
      expect(toBe).toContain('발생하지 않도록');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Test Suite 3: Comprehensive Event Excel Report
// ═══════════════════════════════════════════════════════════════════════════

describe('Comprehensive Event Excel Report', () => {
  afterAll(() => {
    try {
      if (fs.existsSync(TEMP_DIR)) {
        fs.rmSync(TEMP_DIR, { recursive: true, force: true });
      }
    } catch { /* ignore */ }
  });

  test('종합 Excel 리포트 파일 생성', async () => {
    const data = createMultiChannelTestData();
    const filePath = await generateComprehensiveEventExcelReport(data, TEMP_DIR);

    expect(typeof filePath).toBe('string');
    expect(filePath.endsWith('.xlsx')).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);

    const stats = fs.statSync(filePath);
    expect(stats.size).toBeGreaterThan(0);
  });

  test('생성된 Excel에 올바른 탭이 존재', async () => {
    const data = createMultiChannelTestData();
    const outDir = path.join(TEMP_DIR, 'tabs-test');
    const filePath = await generateComprehensiveEventExcelReport(data, outDir);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const sheetNames = workbook.worksheets.map(ws => ws.name);

    // Overview + Review 탭 필수
    expect(sheetNames).toContain('Overview');
    expect(sheetNames).toContain('Review');

    // 채널 탭 (PC_NoLogin, MO_NoLogin)
    expect(sheetNames).toContain('PC_NoLogin');
    expect(sheetNames).toContain('MO_NoLogin');

    // 이벤트 탭 (page_view, view_item 등 - 데이터가 있는 이벤트만)
    expect(sheetNames).toContain('page_view');
    expect(sheetNames).toContain('view_item');
    expect(sheetNames).toContain('add_to_cart');
  });

  test('Overview 탭에 채널별 상태가 올바르게 표시', async () => {
    const data = createMultiChannelTestData();
    const outDir = path.join(TEMP_DIR, 'overview-test');
    const filePath = await generateComprehensiveEventExcelReport(data, outDir);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const overview = workbook.getWorksheet('Overview');
    expect(overview).toBeDefined();

    // Header row check
    const headerRow = overview!.getRow(1);
    expect(headerRow.getCell(1).value).toBe('No');
    expect(headerRow.getCell(2).value).toBe('이벤트명');

    // Data should have 3 event rows (page_view, view_item, add_to_cart)
    const rowCount = overview!.rowCount;
    expect(rowCount).toBeGreaterThanOrEqual(4); // header + 3 events
  });

  test('Review 탭에 이벤트별 현황 요약이 존재', async () => {
    const data = createMultiChannelTestData();
    const outDir = path.join(TEMP_DIR, 'review-test');
    const filePath = await generateComprehensiveEventExcelReport(data, outDir);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const review = workbook.getWorksheet('Review');
    expect(review).toBeDefined();

    // Header row
    const headerRow = review!.getRow(1);
    expect(headerRow.getCell(2).value).toBe('이벤트명');
    expect(headerRow.getCell(3).value).toBe('현황');
    expect(headerRow.getCell(4).value).toBe('As-Is');
    expect(headerRow.getCell(5).value).toBe('To-Be');

    // Check that view_item has issue (MISSING in pc_no_login)
    let viewItemRow: ExcelJS.Row | undefined;
    review!.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && row.getCell(2).value === 'view_item') {
        viewItemRow = row;
      }
    });
    expect(viewItemRow).toBeDefined();
    // status_summary should mention "이슈" or issue
    const statusSummary = String(viewItemRow!.getCell(3).value ?? '');
    expect(statusSummary.length).toBeGreaterThan(0);
  });

  test('채널 탭에 URL×이벤트 매트릭스가 올바름', async () => {
    const data = createMultiChannelTestData();
    const outDir = path.join(TEMP_DIR, 'channel-test');
    const filePath = await generateComprehensiveEventExcelReport(data, outDir);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const pcSheet = workbook.getWorksheet('PC_NoLogin');
    expect(pcSheet).toBeDefined();

    // Header: pagePath | page_view | view_item | add_to_cart
    const header = pcSheet!.getRow(1);
    expect(header.getCell(1).value).toBe('pagePath');

    // Should have 2 URL rows
    expect(pcSheet!.rowCount).toBeGreaterThanOrEqual(3); // header + 2 URLs
  });

  test('이벤트 상세 탭에 14컬럼이 존재', async () => {
    const data = createMultiChannelTestData();
    const outDir = path.join(TEMP_DIR, 'detail-test');
    const filePath = await generateComprehensiveEventExcelReport(data, outDir);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const pageViewSheet = workbook.getWorksheet('page_view');
    expect(pageViewSheet).toBeDefined();

    // 14 columns check
    const header = pageViewSheet!.getRow(1);
    expect(header.getCell(1).value).toBe('검증일');
    expect(header.getCell(2).value).toBe('Action ID');
    expect(header.getCell(3).value).toBe('Event ID');
    expect(header.getCell(4).value).toBe('시나리오');
    expect(header.getCell(5).value).toBe('pagePath');
    expect(header.getCell(6).value).toBe('디바이스');
    expect(header.getCell(7).value).toBe('로그인 조건');
    expect(header.getCell(8).value).toBe('시나리오 상세');
    expect(header.getCell(9).value).toBe('기대 발생');
    expect(header.getCell(10).value).toBe('실제 발생');
    expect(header.getCell(11).value).toBe('정상/이슈');
    expect(header.getCell(12).value).toBe('증상');
    expect(header.getCell(13).value).toBe('As-Is');
    expect(header.getCell(14).value).toBe('To-Be');
  });

  test('이슈 이벤트(view_item)의 상세 탭에 이슈 행이 있음', async () => {
    const data = createMultiChannelTestData();
    const outDir = path.join(TEMP_DIR, 'issue-test');
    const filePath = await generateComprehensiveEventExcelReport(data, outDir);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const viewItemSheet = workbook.getWorksheet('view_item');
    expect(viewItemSheet).toBeDefined();

    let hasIssueRow = false;
    viewItemSheet!.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && row.getCell(11).value === '이슈') {
        hasIssueRow = true;
      }
    });

    expect(hasIssueRow).toBe(true);
  });

  test('단일 채널만 제공해도 정상 생성', async () => {
    const parserOutput = createMinimalParserOutput();

    const singleChannelScenarios: ScenarioResult[] = [
      createMockScenarioResult({
        scenario_id: 'sc1',
        scenario_name: 'MAIN auto',
        page_type: 'MAIN',
        url: 'https://example.com/',
        channel: 'pc_no_login',
        event_results: [
          createMockEventResult({ event_name: 'page_view', status: 'PASS' }),
        ],
      }),
    ];

    const singleData: MultiChannelEventResult = {
      channel_results: {
        pc_no_login: createMockValidationResult('pc_no_login', singleChannelScenarios),
      },
      parser_output: parserOutput,
      all_event_names: ['page_view'],
      events_by_channel: { pc_no_login: ['page_view'] },
      urls_by_channel: { pc_no_login: ['https://example.com/'] },
    };

    const outDir = path.join(TEMP_DIR, 'single-channel');
    const filePath = await generateComprehensiveEventExcelReport(singleData, outDir);

    expect(fs.existsSync(filePath)).toBe(true);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheetNames = workbook.worksheets.map(ws => ws.name);

    expect(sheetNames).toContain('Overview');
    expect(sheetNames).toContain('Review');
    expect(sheetNames).toContain('PC_NoLogin');
    expect(sheetNames).not.toContain('MO_NoLogin');
  });

  test('빈 결과로도 예외 없이 생성', async () => {
    const parserOutput = createMinimalParserOutput();

    const emptyData: MultiChannelEventResult = {
      channel_results: {},
      parser_output: parserOutput,
      all_event_names: ['page_view'],
      events_by_channel: {},
      urls_by_channel: {},
    };

    const outDir = path.join(TEMP_DIR, 'empty');
    const filePath = await generateComprehensiveEventExcelReport(emptyData, outDir);

    expect(fs.existsSync(filePath)).toBe(true);
  });
});
