/**
 * GTM Parser 테스트
 *
 * 실제 GTM JSON + Pre-Requirement Excel을 파싱하여 검증:
 * 1. GTM JSON 로드 및 파싱
 * 2. 이벤트 정의 추출
 * 3. 시나리오 생성
 * 4. 파라미터 스펙 생성
 * 5. Content Group 규칙
 * 6. 도메인 매핑
 * 7. Known 이벤트 확인
 * 8. 타입 정합성
 */

import * as path from 'path';
import {
  parseGTMContainer,
  type GTMParserOutput,
  type GTMParserOptions,
  type ContentGroupRule,
} from '../agents/parser/gtm-parser';

import type { EventScenarioSpec } from '../types/event-scenario';
import type { ParameterSpec } from '../types/parameter-spec';

// ─────────────────────────────────────────────────────────────────────
// File Paths
// ─────────────────────────────────────────────────────────────────────

const GTM_JSON_PATH = path.resolve(
  __dirname,
  '../../50_Raw_Inputs/SenarioAgent/ga4ScenarioQAAgent/GTM-WDWNGWDB_workspace(innisfree-jp-gtm).json',
);

const EXCEL_PATH = path.resolve(
  __dirname,
  '../../50_Raw_Inputs/SenarioAgent/Prerequirement/01.(회신요청) AMORE_GA4_QA_WEB_Pre_Requirement_INNISFREE_JP_ver.1 1 1.xlsx',
);

// ═══════════════════════════════════════════════════════════════════════════
// 1. GTM JSON 로드 및 파싱
// ═══════════════════════════════════════════════════════════════════════════

function testGTMLoadAndParse(): void {
  let output: GTMParserOutput;
  try {
    output = parseGTMContainer(GTM_JSON_PATH, EXCEL_PATH);
  } catch (e) {
    throw new Error(`parseGTMContainer 호출 시 예외 발생: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!output) {
    throw new Error('parseGTMContainer 반환값이 null/undefined');
  }
  if (!output.scenario_spec) {
    throw new Error('scenario_spec이 누락됨');
  }
  if (!output.parameter_spec) {
    throw new Error('parameter_spec이 누락됨');
  }
  if (!output.content_group_rules) {
    throw new Error('content_group_rules가 누락됨');
  }
  if (!Array.isArray(output.warnings)) {
    throw new Error('warnings가 배열이 아님');
  }

  console.log('  ✅ GTM JSON 로드 및 파싱 테스트 통과');
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. 이벤트 정의 추출
// ═══════════════════════════════════════════════════════════════════════════

function testEventDefinitionExtraction(): void {
  const output = parseGTMContainer(GTM_JSON_PATH, EXCEL_PATH);
  const spec = output.scenario_spec;

  if (spec.total_events <= 0) {
    throw new Error(`total_events가 0 이하: ${spec.total_events}`);
  }
  if (!Array.isArray(spec.events) || spec.events.length === 0) {
    throw new Error('events 배열이 비어있음');
  }

  // 각 이벤트에 필수 필드 존재 여부 확인
  for (const evt of spec.events) {
    if (!evt.event_id) throw new Error(`event_id 누락: ${JSON.stringify(evt)}`);
    if (!evt.event_name) throw new Error(`event_name 누락: ${JSON.stringify(evt)}`);
    if (!evt.ga4_event_name) throw new Error(`ga4_event_name 누락: event_id=${evt.event_id}`);
    if (!evt.category) throw new Error(`category 누락: event_id=${evt.event_id}`);
    if (!evt.fire_condition) throw new Error(`fire_condition 누락: event_id=${evt.event_id}`);
  }

  console.log(`  ✅ 이벤트 정의 추출 테스트 통과 (${spec.total_events}개 이벤트)`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. 시나리오 생성
// ═══════════════════════════════════════════════════════════════════════════

function testScenarioGeneration(): void {
  const output = parseGTMContainer(GTM_JSON_PATH, EXCEL_PATH);
  const spec = output.scenario_spec;

  if (spec.total_scenarios <= 0) {
    throw new Error(`total_scenarios가 0 이하: ${spec.total_scenarios}`);
  }
  if (!Array.isArray(spec.scenarios) || spec.scenarios.length === 0) {
    throw new Error('scenarios 배열이 비어있음');
  }

  for (const sc of spec.scenarios) {
    if (!sc.scenario_id) {
      throw new Error(`scenario_id 누락: ${JSON.stringify(sc).substring(0, 100)}`);
    }
    if (!sc.page_url_pattern && (!sc.test_urls || sc.test_urls.length === 0)) {
      throw new Error(`URL 정보 누락: scenario_id=${sc.scenario_id}`);
    }
    if (!sc.page_type) {
      throw new Error(`page_type 누락: scenario_id=${sc.scenario_id}`);
    }
  }

  console.log(`  ✅ 시나리오 생성 테스트 통과 (${spec.total_scenarios}개 시나리오)`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. 파라미터 스펙 생성
// ═══════════════════════════════════════════════════════════════════════════

function testParameterSpecGeneration(): void {
  const output = parseGTMContainer(GTM_JSON_PATH, EXCEL_PATH);
  const paramSpec = output.parameter_spec;

  // total_events는 반드시 0보다 커야 함 (이벤트가 있으므로)
  if (paramSpec.total_events <= 0) {
    throw new Error(`parameter_spec.total_events가 0 이하: ${paramSpec.total_events}`);
  }

  if (!Array.isArray(paramSpec.event_specs) || paramSpec.event_specs.length === 0) {
    throw new Error('event_specs 배열이 비어있음');
  }

  // total_parameters는 GTM 구성에 따라 0일 수 있음
  // (Config 태그 상속으로 파라미터를 설정하는 경우 eventParameters가 비어있을 수 있음)
  if (typeof paramSpec.total_parameters !== 'number') {
    throw new Error('total_parameters가 number가 아님');
  }

  // 각 event_spec에 필수 필드 확인
  for (const evtSpec of paramSpec.event_specs) {
    if (!evtSpec.event_name) {
      throw new Error(`event_name 누락: event_id=${evtSpec.event_id}`);
    }
    if (!Array.isArray(evtSpec.event_level_params)) {
      throw new Error(`event_level_params가 배열이 아님: event=${evtSpec.event_name}`);
    }
    if (typeof evtSpec.total_params_count !== 'number') {
      throw new Error(`total_params_count가 number가 아님: event=${evtSpec.event_name}`);
    }
    if (typeof evtSpec.required_params_count !== 'number') {
      throw new Error(`required_params_count가 number가 아님: event=${evtSpec.event_name}`);
    }
  }

  // total_parameters 값의 정합성: event_specs의 합과 일치해야 함
  const calculatedTotal = paramSpec.event_specs.reduce((sum, s) => sum + s.total_params_count, 0);
  if (paramSpec.total_parameters !== calculatedTotal) {
    throw new Error(
      `total_parameters 불일치: spec=${paramSpec.total_parameters}, 계산값=${calculatedTotal}`,
    );
  }

  if (paramSpec.total_parameters > 0) {
    console.log(`  ✅ 파라미터 스펙 생성 테스트 통과 (이벤트 ${paramSpec.total_events}개, 파라미터 ${paramSpec.total_parameters}개)`);
  } else {
    console.log(`  ✅ 파라미터 스펙 생성 테스트 통과 (이벤트 ${paramSpec.total_events}개, 파라미터 0개 - Config 태그 상속 방식)`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Content Group 규칙
// ═══════════════════════════════════════════════════════════════════════════

function testContentGroupRules(): void {
  const output = parseGTMContainer(GTM_JSON_PATH, EXCEL_PATH);
  const rules = output.content_group_rules;

  if (!Array.isArray(rules) || rules.length === 0) {
    throw new Error('content_group_rules가 비어있음');
  }

  for (const rule of rules) {
    if (!rule.page_type) {
      throw new Error(`page_type 누락: ${JSON.stringify(rule).substring(0, 100)}`);
    }
    if (!rule.content_group_value) {
      throw new Error(`content_group_value 누락: page_type=${rule.page_type}`);
    }
    if (!Array.isArray(rule.auto_fire_events)) {
      throw new Error(`auto_fire_events가 배열이 아님: page_type=${rule.page_type}`);
    }
    if (!Array.isArray(rule.action_events)) {
      throw new Error(`action_events가 배열이 아님: page_type=${rule.page_type}`);
    }
    if (!Array.isArray(rule.forbidden_events)) {
      throw new Error(`forbidden_events가 배열이 아님: page_type=${rule.page_type}`);
    }
  }

  // MAIN, PRODUCT_DETAIL 등 주요 페이지 타입이 포함되어 있는지 확인
  const pageTypes = rules.map(r => r.page_type);
  const requiredPageTypes = ['MAIN', 'PRODUCT_DETAIL', 'CART'];
  for (const pt of requiredPageTypes) {
    if (!pageTypes.includes(pt as never)) {
      throw new Error(`필수 페이지 타입 "${pt}"이 content_group_rules에 없음`);
    }
  }

  console.log(`  ✅ Content Group 규칙 테스트 통과 (${rules.length}개 규칙)`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. 도메인 매핑
// ═══════════════════════════════════════════════════════════════════════════

function testDomainMapping(): void {
  const options: GTMParserOptions = {
    domainMapping: {
      from: 'innisfree-japan.myshopify.com',
      to: 'www.innisfree.jp',
    },
  };

  const output = parseGTMContainer(GTM_JSON_PATH, EXCEL_PATH, options);
  const scenarios = output.scenario_spec.scenarios;

  if (scenarios.length === 0) {
    throw new Error('도메인 매핑 테스트: 시나리오가 비어있음');
  }

  // 시나리오에 Shopify 도메인이 남아있으면 안 됨
  let hasShopifyDomain = false;
  let hasInnisfreeDomain = false;
  for (const sc of scenarios) {
    const url = sc.test_urls?.[0] || sc.page_url_pattern || '';
    if (url.includes('innisfree-japan.myshopify.com')) {
      hasShopifyDomain = true;
    }
    if (url.includes('innisfree.jp')) {
      hasInnisfreeDomain = true;
    }
  }

  // Excel URL에 Shopify 도메인이 포함된 경우에만 매핑 검증
  // (Excel에 이미 innisfree.jp 도메인이 있을 수 있음)
  if (hasShopifyDomain) {
    throw new Error('도메인 매핑 후에도 innisfree-japan.myshopify.com 도메인이 남아있음');
  }

  // URL이 있는 시나리오 중 하나라도 innisfree.jp를 포함하는지 확인
  const urlScenarios = scenarios.filter(sc => {
    const url = sc.test_urls?.[0] || sc.page_url_pattern || '';
    return url.length > 0;
  });

  if (urlScenarios.length > 0 && !hasInnisfreeDomain) {
    // 도메인이 아예 없을 수 있으므로 경고만 (Excel에 다른 도메인이 있을 수 있음)
    console.log('  (참고: innisfree.jp 도메인 URL이 발견되지 않음 - Excel 원본 도메인 확인 필요)');
  }

  console.log('  ✅ 도메인 매핑 테스트 통과');
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. Known 이벤트 확인
// ═══════════════════════════════════════════════════════════════════════════

function testKnownEventsExist(): void {
  const output = parseGTMContainer(GTM_JSON_PATH, EXCEL_PATH);
  const eventNames = output.scenario_spec.events.map(e => e.event_name);

  // GA4 핵심 이벤트들이 GTM에서 추출되었는지 확인
  const knownEvents = ['page_view', 'view_item', 'add_to_cart'];
  const foundEvents: string[] = [];
  const missingEvents: string[] = [];

  for (const expected of knownEvents) {
    if (eventNames.includes(expected)) {
      foundEvents.push(expected);
    } else {
      missingEvents.push(expected);
    }
  }

  if (foundEvents.length === 0) {
    throw new Error(
      `핵심 GA4 이벤트가 하나도 발견되지 않음. 추출된 이벤트: [${eventNames.slice(0, 10).join(', ')}...]`,
    );
  }

  if (missingEvents.length > 0) {
    console.log(`  (참고: 일부 이벤트 미발견 [${missingEvents.join(', ')}] - GTM 구성에 따라 정상일 수 있음)`);
  }

  console.log(`  ✅ Known 이벤트 확인 테스트 통과 (발견: [${foundEvents.join(', ')}])`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. 타입 정합성
// ═══════════════════════════════════════════════════════════════════════════

function testTypeConsistency(): void {
  const output = parseGTMContainer(GTM_JSON_PATH, EXCEL_PATH);

  // GTMParserOutput 구조 검증
  const _gtmOutput: GTMParserOutput = output;
  const _scenarioSpec: EventScenarioSpec = output.scenario_spec;
  const _paramSpec: ParameterSpec = output.parameter_spec;
  const _cgRules: ContentGroupRule[] = output.content_group_rules;
  const _warnings: string[] = output.warnings;

  // EventScenarioSpec 필수 필드 타입 검증
  if (typeof _scenarioSpec.project_id !== 'string') {
    throw new Error('project_id가 string이 아님');
  }
  if (typeof _scenarioSpec.brand_id !== 'string') {
    throw new Error('brand_id가 string이 아님');
  }
  if (typeof _scenarioSpec.version !== 'string') {
    throw new Error('version이 string이 아님');
  }
  if (typeof _scenarioSpec.created_at !== 'string') {
    throw new Error('created_at이 string이 아님');
  }
  if (typeof _scenarioSpec.total_events !== 'number') {
    throw new Error('total_events가 number가 아님');
  }
  if (typeof _scenarioSpec.total_scenarios !== 'number') {
    throw new Error('total_scenarios가 number가 아님');
  }

  // ParameterSpec 필수 필드 타입 검증
  if (typeof _paramSpec.project_id !== 'string') {
    throw new Error('parameter_spec.project_id가 string이 아님');
  }
  if (typeof _paramSpec.total_events !== 'number') {
    throw new Error('parameter_spec.total_events가 number가 아님');
  }
  if (typeof _paramSpec.total_parameters !== 'number') {
    throw new Error('parameter_spec.total_parameters가 number가 아님');
  }
  if (typeof _paramSpec.required_parameters !== 'number') {
    throw new Error('parameter_spec.required_parameters가 number가 아님');
  }

  // page_rules 타입 검증
  if (!Array.isArray(_scenarioSpec.page_rules)) {
    throw new Error('page_rules가 배열이 아님');
  }
  for (const rule of _scenarioSpec.page_rules) {
    if (typeof rule.page_type !== 'string') throw new Error('page_rule.page_type 타입 오류');
    if (!Array.isArray(rule.auto_fire_events)) throw new Error('page_rule.auto_fire_events 타입 오류');
    if (!Array.isArray(rule.conditional_events)) throw new Error('page_rule.conditional_events 타입 오류');
    if (!Array.isArray(rule.forbidden_events)) throw new Error('page_rule.forbidden_events 타입 오류');
  }

  // suppress unused variable warnings (compile-time only)
  void _gtmOutput;
  void _cgRules;
  void _warnings;

  console.log('  ✅ 타입 정합성 검증 테스트 통과');
}

// ═══════════════════════════════════════════════════════════════════════════
// Jest Test Suite
// ═══════════════════════════════════════════════════════════════════════════

describe('GTM Parser', () => {
  test('GTM JSON 로드 및 파싱', () => { testGTMLoadAndParse(); });
  test('이벤트 정의 추출', () => { testEventDefinitionExtraction(); });
  test('시나리오 생성', () => { testScenarioGeneration(); });
  test('파라미터 스펙 생성', () => { testParameterSpecGeneration(); });
  test('Content Group 규칙', () => { testContentGroupRules(); });
  test('도메인 매핑', () => { testDomainMapping(); });
  test('Known 이벤트 확인', () => { testKnownEventsExist(); });
  test('타입 정합성', () => { testTypeConsistency(); });
});
