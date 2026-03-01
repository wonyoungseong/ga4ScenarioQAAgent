/**
 * Day 3 타입 검증 테스트 (재설계 버전)
 *
 * 목적:
 * 1. TypeScript 컴파일 검증 (타입 정합성)
 * 2. 3-입력 문서 기반 파싱 결과 타입 검증
 * 3. GTM Container 타입 검증
 * 4. Agent 파이프라인 흐름에 맞는 타입 연결 검증
 *
 * @test Day 3 재설계 타입 파일들
 * - gtm-container.ts: GTM Container Export JSON 타입
 * - parsed-inputs.ts: 3개 입력 문서 파싱 결과 타입
 * - event-scenario.ts: 이벤트 시나리오 타입
 * - event-validation-result.ts: 이벤트 검증 결과 타입
 * - parameter-spec.ts: 파라미터 스펙 타입
 * - parameter-validation-result.ts: 파라미터 검증 결과 타입
 */

// ═══════════════════════════════════════════════════════════════════════════
// IMPORTS - GTM Container Types (신규)
// ═══════════════════════════════════════════════════════════════════════════

import type {
  GTMContainer,
  GTMTag,
  GTMParameter,
  GTMTrigger,
  GTMVariable,
  GTMExtractedGA4Event,
  GTMParseResult,
} from '../types/gtm-container';

import {
  GA4_EVENT_TAG_TYPE,
  GA4_CONFIG_TAG_TYPE,
  GA4_EVENT_NAME_PARAM_KEY,
} from '../types/gtm-container';

// ═══════════════════════════════════════════════════════════════════════════
// IMPORTS - Parsed Inputs Types (신규)
// ═══════════════════════════════════════════════════════════════════════════

import type {
  PreRequirementParsedData,
  URLEntry,
  ChannelCondition,
  PDFParsedData,
  GlobalVariableDefinition,
  PDFEventDefinition,
  ParameterExpectation,
  GTMParsedData,
  GTMEventInfo,
  GTMParameterInfo,
  ParserAgentOutput,
  CrossReference,
} from '../types/parsed-inputs';

import {
  CHANNEL_COMBINATION_KEYS,
  DEFAULT_CHANNEL_CONDITIONS,
  EXPECTED_VALUE_TYPE_DESCRIPTIONS,
} from '../types/parsed-inputs';

import {
  DEFAULT_CHANNEL_REQUIREMENT,
  DEFAULT_VALIDATION_RULE,
} from '../types/common';

// ═══════════════════════════════════════════════════════════════════════════
// IMPORTS - Event Types
// ═══════════════════════════════════════════════════════════════════════════

import type {
  EventDefinition,
  ScenarioDefinition,
  EventScenarioSpec,
  PageEventRule,
} from '../types/event-scenario';

import type {
  EventResult,
  ScenarioResult,
  EventValidationResult,
} from '../types/event-validation-result';

// ═══════════════════════════════════════════════════════════════════════════
// IMPORTS - Parameter Types
// ═══════════════════════════════════════════════════════════════════════════

import type {
  ParameterDefinition,
  EventParameterSpec,
  ParameterSpec,
} from '../types/parameter-spec';

import type {
  ParameterResult,
  EventParameterResult,
  ParameterValidationResult,
} from '../types/parameter-validation-result';

// ═══════════════════════════════════════════════════════════════════════════
// IMPORTS - Constants
// ═══════════════════════════════════════════════════════════════════════════

import {
  USER_ACTION_TYPE_DESCRIPTIONS,
  EVENT_FIRE_CONDITION_DESCRIPTIONS,
  DEFAULT_CHANNEL_ENABLED,
} from '../types/event-scenario';

import {
  EVENT_STATUS_DESCRIPTIONS,
  SCENARIO_STATUS_PRIORITY,
  EVENT_STATUS_PRIORITY,
} from '../types/event-validation-result';

import {
  GA4_STANDARD_ITEM_PARAMS,
  DEFAULT_CHANNEL_PARAM_REQUIRED,
} from '../types/parameter-spec';

import {
  PARAM_STATUS_PRIORITY,
  DEFAULT_SEVERITY_BY_DISCREPANCY_TYPE,
} from '../types/parameter-validation-result';

// ═══════════════════════════════════════════════════════════════════════════
// TEST 1: GTM Container 타입 검증 (신규)
// 시나리오: GTM Container Export JSON 파싱
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 샘플 GTM Parameter 생성
 */
const sampleGTMParameter: GTMParameter = {
  type: 'TEMPLATE',
  key: 'eventName',
  value: 'view_item',
};

/**
 * 샘플 GTM Tag 생성 (GA4 Event)
 */
const sampleGTMTag: GTMTag = {
  accountId: '123456789',
  containerId: '987654321',
  tagId: '1',
  name: 'GA4 - view_item',
  type: 'gaawe',
  parameter: [
    sampleGTMParameter,
    {
      type: 'LIST',
      key: 'eventParameters',
      list: [
        {
          type: 'MAP',
          key: 'eventParameter',
          map: [
            { type: 'TEMPLATE', key: 'name', value: 'item_id' },
            { type: 'TEMPLATE', key: 'value', value: '{{DL - item_id}}' },
          ],
        },
      ],
    },
  ],
  fingerprint: '1704067200000',
  firingTriggerId: ['2'],
  tagManagerUrl: 'https://tagmanager.google.com/#/container/accounts/123/containers/456',
};

/**
 * 샘플 GTM Trigger 생성
 */
const sampleGTMTrigger: GTMTrigger = {
  accountId: '123456789',
  containerId: '987654321',
  triggerId: '2',
  name: 'Product Detail Page',
  type: 'PAGEVIEW',
  filter: [
    {
      type: 'CONTAINS',
      parameter: [
        { type: 'TEMPLATE', key: 'arg0', value: '{{Page Path}}' },
        { type: 'TEMPLATE', key: 'arg1', value: '/products/' },
      ],
    },
  ],
  fingerprint: '1704067200000',
  tagManagerUrl: 'https://tagmanager.google.com/#/container/accounts/123/containers/456',
};

/**
 * 샘플 GTM Variable 생성
 */
const sampleGTMVariable: GTMVariable = {
  accountId: '123456789',
  containerId: '987654321',
  variableId: '3',
  name: 'DL - item_id',
  type: 'v',
  parameter: [
    { type: 'INTEGER', key: 'dataLayerVersion', value: '2' },
    { type: 'BOOLEAN', key: 'setDefaultValue', value: 'false' },
    { type: 'TEMPLATE', key: 'name', value: 'ecommerce.items.0.item_id' },
  ],
  fingerprint: '1704067200000',
  tagManagerUrl: 'https://tagmanager.google.com/#/container/accounts/123/containers/456',
};

/**
 * 샘플 GTM Container 생성
 */
const sampleGTMContainer: GTMContainer = {
  exportFormatVersion: 2,
  exportTime: '2026-01-14T10:00:00.000Z',
  containerVersion: {
    accountId: '123456789',
    containerId: '987654321',
    containerVersionId: '1',
    container: {
      accountId: '123456789',
      containerId: '987654321',
      name: 'Test Container',
      publicId: 'GTM-XXXXXX',
      usageContext: ['WEB'],
      fingerprint: '1704067200000',
      tagManagerUrl: 'https://tagmanager.google.com/#/container/accounts/123/containers/456',
    },
    tag: [sampleGTMTag],
    trigger: [sampleGTMTrigger],
    variable: [sampleGTMVariable],
    fingerprint: '1704067200000',
    tagManagerUrl: 'https://tagmanager.google.com/#/container/accounts/123/containers/456',
  },
};

/**
 * 샘플 GTM Extracted GA4 Event 생성
 */
const sampleExtractedGA4Event: GTMExtractedGA4Event = {
  tag_id: '1',
  tag_name: 'GA4 - view_item',
  event_name: 'view_item',
  parameters: [
    {
      key: 'item_id',
      value: '{{DL - item_id}}',
      is_variable_reference: true,
      referenced_variable: 'DL - item_id',
    },
  ],
  firing_triggers: ['Product Detail Page'],
};

/**
 * 샘플 GTM Parse Result 생성
 */
const sampleGTMParseResult: GTMParseResult = {
  success: true,
  container: sampleGTMContainer,
  ga4_events: [sampleExtractedGA4Event],
  stats: {
    total_tags: 1,
    ga4_event_tags: 1,
    ga4_config_tags: 0,
    total_triggers: 1,
    total_variables: 1,
    parse_duration_ms: 50,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// TEST 2: Parsed Inputs 타입 검증 (신규)
// 시나리오: 3개 입력 문서 파싱 결과
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 샘플 URL Entry 생성
 */
const sampleURLEntry: URLEntry = {
  url_id: 'URL-001',
  url: 'https://www.example.com/products/12345',
  page_type: 'PRODUCT_DETAIL',
  page_description: '상품 상세 페이지',
  enabled_channels: ['pc_login', 'pc_no_login', 'mo_login', 'mo_no_login'],
  priority: 1,
};

/**
 * 샘플 Channel Condition 생성
 */
const sampleChannelCondition: ChannelCondition = {
  channel: 'pc_login',
  device: 'PC',
  login_required: true,
  viewport: { width: 1920, height: 1080 },
};

/**
 * 샘플 Pre-Requirement Parsed Data 생성
 */
const samplePreRequirementParsedData: PreRequirementParsedData = {
  project_id: 'PRJ-2026-001',
  brand_id: 'BRAND-ABC',
  version: '1.0.0',
  parsed_at: '2026-01-14T10:00:00Z',
  urls: [sampleURLEntry],
  channel_conditions: [sampleChannelCondition],
  total_urls: 1,
  urls_by_channel: {
    pc_login: 1,
    pc_no_login: 1,
    mo_login: 1,
    mo_no_login: 1,
  },
  source_file: {
    file_name: 'pre_requirement.xlsx',
    file_path: '/inputs/pre_requirement.xlsx',
    sheet_names: ['URLs', 'Channels'],
    parsed_at: '2026-01-14T10:00:00Z',
  },
};

/**
 * 샘플 Global Variable Definition 생성
 * global-variable-spec.ts의 타입 사용
 */
const sampleGlobalVariableDefinition: GlobalVariableDefinition = {
  variable_id: 'GV-001',
  variable_name: 'AP_DATA_SITETYPE',
  description: '사이트 유형',
  data_type: 'string',
  scope: 'GLOBAL',
  source: {
    type: 'both',
    window_path: 'AP_DATA_SITETYPE',
    dataLayer_key: 'site_type',
  },
  required_channels: DEFAULT_CHANNEL_REQUIREMENT,
  validation: DEFAULT_VALIDATION_RULE,
  example_value: 'ecommerce',
};

/**
 * 샘플 PDF Event Definition 생성
 */
const samplePDFEventDefinition: PDFEventDefinition = {
  event_id: 'EVT-001',
  event_name: 'view_item',
  ga4_event_name: 'view_item',
  description: '상품 상세 페이지 조회',
  category: 'ecommerce',
  fire_condition: 'auto_fire',
  trigger_type: 'page_load',
  allowed_page_types: ['PRODUCT_DETAIL'],
  enabled_channels: {
    pc_login: true,
    pc_no_login: true,
    mo_login: true,
    mo_no_login: true,
  },
  expected_parameters: ['item_id', 'item_name', 'price', 'currency'],
  priority: 1,
};

/**
 * 샘플 Parameter Expectation 생성
 */
const sampleParameterExpectation: ParameterExpectation = {
  expectation_id: 'EXP-001',
  event_name: 'view_item',
  ga4_event_name: 'view_item',
  param_name: 'item_id',
  ga4_param: 'item_id',
  param_level: 'item_level',
  data_type: 'string',
  required: true,
  value_type: 'dynamic',
  dynamic_pattern: '^[A-Z0-9]{5,20}$',
};

/**
 * 샘플 PDF Parsed Data 생성
 */
const samplePDFParsedData: PDFParsedData = {
  project_id: 'PRJ-2026-001',
  brand_id: 'BRAND-ABC',
  version: '1.0.0',
  parsed_at: '2026-01-14T10:00:00Z',
  global_variables: [sampleGlobalVariableDefinition],
  event_definitions: [samplePDFEventDefinition],
  parameter_expectations: [sampleParameterExpectation],
  total_global_variables: 1,
  total_events: 1,
  total_parameters: 1,
  source_file: {
    file_name: 'dev_guide.pdf',
    file_path: '/inputs/dev_guide.pdf',
    total_pages: 50,
    parsed_at: '2026-01-14T10:00:00Z',
  },
};

/**
 * 샘플 GTM Event Info 생성
 */
const sampleGTMEventInfo: GTMEventInfo = {
  tag_id: '1',
  tag_name: 'GA4 - view_item',
  event_name: 'view_item',
  event_name_source: 'literal',
  parameters: [
    {
      key: 'item_id',
      value: '{{DL - item_id}}',
      is_variable_reference: true,
      referenced_variable: 'DL - item_id',
    },
  ],
  firing_triggers: ['Product Detail Page'],
};

/**
 * 샘플 GTM Parameter Info 생성
 */
const sampleGTMParameterInfo: GTMParameterInfo = {
  param_key: 'item_id',
  used_by_events: ['view_item', 'add_to_cart'],
  param_level: 'item_level',
  value_sources: [
    {
      event_name: 'view_item',
      value: '{{DL - item_id}}',
      is_variable: true,
      variable_name: 'DL - item_id',
    },
  ],
  usage_count: 2,
};

/**
 * 샘플 GTM Parsed Data 생성
 */
const sampleGTMParsedData: GTMParsedData = {
  project_id: 'PRJ-2026-001',
  brand_id: 'BRAND-ABC',
  version: '1.0.0',
  parsed_at: '2026-01-14T10:00:00Z',
  container_info: {
    container_id: '987654321',
    public_id: 'GTM-XXXXXX',
    name: 'Test Container',
    version_id: '1',
    export_time: '2026-01-14T10:00:00Z',
    total_tags: 1,
    total_triggers: 1,
    total_variables: 1,
  },
  events: [sampleGTMEventInfo],
  parameters: [sampleGTMParameterInfo],
  configs: [],
  total_events: 1,
  total_unique_parameters: 1,
  source_file: {
    file_name: 'GTM-Export.json',
    file_path: '/inputs/GTM-Export.json',
    container_version: '1',
    parsed_at: '2026-01-14T10:00:00Z',
  },
};

/**
 * 샘플 Cross Reference 생성
 */
const sampleCrossReference: CrossReference = {
  event_mapping: [
    {
      event_name: 'view_item',
      pdf_event_id: 'EVT-001',
      gtm_tag_id: '1',
      status: 'matched',
    },
  ],
  parameter_mapping: [
    {
      event_name: 'view_item',
      param_name: 'item_id',
      pdf_expectation_id: 'EXP-001',
      gtm_variable_ref: 'DL - item_id',
      status: 'matched',
    },
  ],
  missing_events: [],
  extra_events: [],
  missing_parameters: [],
};

/**
 * 샘플 Parser Agent Output 생성
 */
const sampleParserAgentOutput: ParserAgentOutput = {
  project_id: 'PRJ-2026-001',
  brand_id: 'BRAND-ABC',
  version: '1.0.0',
  created_at: '2026-01-14T10:00:00Z',
  pre_requirement: samplePreRequirementParsedData,
  pdf: samplePDFParsedData,
  gtm: sampleGTMParsedData,
  cross_reference: sampleCrossReference,
  parsing_metadata: {
    total_parse_duration_ms: 1500,
    parse_durations: {
      pre_requirement_ms: 200,
      pdf_ms: 1000,
      gtm_ms: 300,
    },
    warnings: [],
    errors: [],
    stats: {
      total_urls: 1,
      total_global_variables: 1,
      total_events_pdf: 1,
      total_events_gtm: 1,
      total_parameters: 1,
      matched_events: 1,
      matched_parameters: 1,
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// TEST 3: EventScenarioSpec 타입 검증
// 시나리오: 2차 QA Excel (이벤트 시트) 파싱 결과
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 샘플 EventDefinition 생성
 */
const sampleEventDefinition: EventDefinition = {
  event_id: 'EVT-001',
  event_name: 'view_item',
  ga4_event_name: 'view_item',
  description: '상품 상세 페이지 조회',
  category: 'ecommerce',
  trigger_type: 'pageLoad',
  fire_condition: 'auto_fire',
  allowed_page_types: ['PRODUCT_DETAIL'],
  enabled_channels: DEFAULT_CHANNEL_ENABLED,
  priority: 1,
};

/**
 * 샘플 ScenarioDefinition 생성
 */
const sampleScenarioDefinition: ScenarioDefinition = {
  scenario_id: 'SCN-001',
  scenario_name: '상품 상세 페이지 진입 시나리오',
  description: '상품 상세 페이지 진입 시 view_item 이벤트 발생 확인',
  page_type: 'PRODUCT_DETAIL',
  user_action: {
    action_id: 'ACT-001',
    action_type: 'page_load',
    description: '상품 상세 페이지로 이동',
  },
  expected_events: [
    {
      event_name: 'view_item',
      ga4_event_name: 'view_item',
      required: true,
      expected_within_ms: 3000,
      sequence: 1,
      channel_event_ids: {} as Record<import('../types/common').ChannelCombination, string>,
    },
  ],
  channel_action_ids: {} as Record<import('../types/common').ChannelCombination, string>,
  sequence_order: 1,
  enabled_channels: DEFAULT_CHANNEL_ENABLED,
};

/**
 * 샘플 PageEventRule 생성
 */
const samplePageEventRule: PageEventRule = {
  page_type: 'PRODUCT_DETAIL',
  auto_fire_events: ['view_item'],
  conditional_events: [],
  forbidden_events: [],
};

/**
 * 샘플 EventScenarioSpec 생성
 */
const sampleEventScenarioSpec: EventScenarioSpec = {
  project_id: 'PRJ-2026-001',
  brand_id: 'BRAND-ABC',
  version: '1.0.0',
  created_at: '2026-01-14T10:00:00Z',
  events: [sampleEventDefinition],
  scenarios: [sampleScenarioDefinition],
  page_rules: [samplePageEventRule],
  total_events: 1,
  total_scenarios: 1,
};

// ═══════════════════════════════════════════════════════════════════════════
// TEST 4: EventValidationResult 타입 검증
// 시나리오: Validator Agent가 생성하는 2차 QA (이벤트) 검수 결과
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 샘플 EventResult 생성
 */
const sampleEventResult: EventResult = {
  event_name: 'view_item',
  ga4_event_name: 'view_item',
  status: 'PASS',
  fired: true,
  expected_to_fire: true,
  fired_at_ms: 250,
  expected_within_ms: 500,
  actual_sequence: 1,
  expected_sequence: 1,
  captured_params_count: 4,
};

/**
 * 샘플 ScenarioResult 생성
 */
const sampleScenarioResult: ScenarioResult = {
  scenario_id: 'SCN-001',
  scenario_name: '상품 상세 페이지 진입 시나리오',
  status: 'PASS',
  page_type: 'PRODUCT_DETAIL',
  validated_url: 'https://www.example.com/products/12345',
  channel: 'pc_login',
  action_id: 'A001',
  event_results: [sampleEventResult],
  passed_count: 1,
  failed_count: 0,
  missing_count: 0,
  extra_count: 0,
  score: 100,
  started_at: '2026-01-14T11:00:00Z',
  ended_at: '2026-01-14T11:00:05Z',
  duration_ms: 5000,
};

/**
 * 샘플 EventValidationResult 생성
 */
const sampleEventValidationResult: EventValidationResult = {
  project_id: 'PRJ-2026-001',
  brand_id: 'BRAND-ABC',
  version: '1.0.0',
  validated_at: '2026-01-14T12:00:00Z',
  spec_version: '1.0.0',
  scenario_results: [sampleScenarioResult],
  summary: {
    total_scenarios: 1,
    passed_scenarios: 1,
    failed_scenarios: 0,
    error_scenarios: 0,
    total_events: 1,
    passed_events: 1,
    failed_events: 0,
    missing_events: 0,
    extra_events: 0,
    scenario_pass_rate: 100,
    event_pass_rate: 100,
    overall_score: 100,
  },
  summary_by_channel: [
    {
      channel: 'pc_login',
      total_scenarios: 1,
      passed_scenarios: 1,
      failed_scenarios: 0,
      total_events: 1,
      passed_events: 1,
      failed_events: 0,
      missing_events: 0,
      extra_events: 0,
      pass_rate: 100,
    },
  ],
  summary_by_page_type: [
    {
      page_type: 'PRODUCT_DETAIL',
      total_scenarios: 1,
      passed_scenarios: 1,
      pass_rate: 100,
      most_failed_events: [],
    },
  ],
  critical_issues: [],
};

// ═══════════════════════════════════════════════════════════════════════════
// TEST 5: ParameterSpec 타입 검증
// 시나리오: 2차 QA Excel (파라미터 시트) 파싱 결과
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 샘플 ParameterDefinition 생성
 */
const sampleParameterDefinition: ParameterDefinition = {
  param_id: 'PARAM-001',
  param_name: 'item_id',
  ga4_param: 'item_id',
  gtm_variable: '{{DL - item_id}}',
  description: '상품 ID',
  level: 'item_level',
  category: 'ecommerce',
  data_type: 'string',
  required: true,
  required_by_channel: DEFAULT_CHANNEL_PARAM_REQUIRED,
  validation: {
    pattern: '^[A-Z0-9]{5,20}$',
    allow_null: false,
    allow_empty_string: false,
  },
};

/**
 * 샘플 EventParameterSpec 생성
 */
const sampleEventParameterSpec: EventParameterSpec = {
  event_id: 'EVT-001',
  event_name: 'view_item',
  ga4_event_name: 'view_item',
  event_level_params: [
    {
      param_id: 'PARAM-002',
      param_name: 'currency',
      ga4_param: 'currency',
      description: '통화 코드',
      level: 'event_level',
      category: 'ecommerce',
      data_type: 'string',
      required: true,
      validation: {
        allowed_values: ['KRW', 'USD', 'JPY'],
        allow_null: false,
      },
    },
  ],
  item_level_params: [sampleParameterDefinition],
  required_params_count: 2,
  total_params_count: 2,
};

/**
 * 샘플 ParameterSpec 생성
 */
const sampleParameterSpec: ParameterSpec = {
  project_id: 'PRJ-2026-001',
  brand_id: 'BRAND-ABC',
  version: '1.0.0',
  created_at: '2026-01-14T10:00:00Z',
  event_specs: [sampleEventParameterSpec],
  total_events: 1,
  total_parameters: 2,
  required_parameters: 2,
};

// ═══════════════════════════════════════════════════════════════════════════
// TEST 6: ParameterValidationResult 타입 검증
// 시나리오: Validator Agent가 생성하는 2차 QA (파라미터) 검수 결과
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 샘플 ParameterResult 생성
 */
const sampleParameterResult: ParameterResult = {
  param_id: 'PARAM-001',
  param_name: 'item_id',
  ga4_param: 'item_id',
  status: 'O',
  match_type: 'exact',
  level: 'item_level',
  category: 'ecommerce',
  expected_data_type: 'string',
  exists: true,
  required: true,
  expected_value: 'PROD12345',
  value_type_hint: 'dynamic',
  actual_value: 'PROD12345',
  actual_data_type: 'string',
};

/**
 * 샘플 ParameterResult (실패 케이스)
 */
const sampleFailedParameterResult: ParameterResult = {
  param_id: 'PARAM-002',
  param_name: 'currency',
  ga4_param: 'currency',
  status: 'X',
  match_type: 'none',
  level: 'event_level',
  category: 'ecommerce',
  expected_data_type: 'string',
  exists: true,
  required: true,
  expected_value: 'KRW',
  actual_value: 'krw',  // 대소문자 불일치
  actual_data_type: 'string',
  discrepancy: {
    type: 'value_mismatch',
    expected: 'KRW',
    actual: 'krw',
    description: '값 불일치: 기대값 "KRW", 실제값 "krw"',
    severity: 'MEDIUM',
    fix_recommendation: 'currency 파라미터 값을 대문자로 전송하도록 GTM 변수 수정',
  },
};

/**
 * 샘플 EventParameterResult 생성
 */
const sampleEventParameterResult: EventParameterResult = {
  event_id: 'EVT-001',
  event_name: 'view_item',
  ga4_event_name: 'view_item',
  page_type: 'PRODUCT_DETAIL',
  test_url: 'https://www.example.com/products/12345',
  channel: 'pc_login',
  event_level_results: [sampleFailedParameterResult],
  item_level_results: [
    {
      item_index: 0,
      item_id: 'PROD12345',
      item_name: '테스트 상품',
      param_results: [sampleParameterResult],
      pass_count: 1,
      fail_count: 0,
    },
  ],
  total_params: 2,
  pass_count: 1,
  partial_count: 0,
  na_count: 0,
  fail_count: 1,
  required_pass_rate: 50,
  score: 50,
  validated_at: '2026-01-14T12:00:00Z',
};

/**
 * 샘플 ParameterValidationResult 생성
 */
const sampleParameterValidationResult: ParameterValidationResult = {
  project_id: 'PRJ-2026-001',
  brand_id: 'BRAND-ABC',
  version: '1.0.0',
  validated_at: '2026-01-14T12:00:00Z',
  spec_version: '1.0.0',
  event_results: [sampleEventParameterResult],
  summary: {
    total_events: 1,
    total_params: 2,
    required_params: 2,
    pass_count: 1,
    partial_count: 0,
    na_count: 0,
    fail_count: 1,
    pass_rate: 50,
    required_pass_rate: 50,
    overall_score: 50,
    status_distribution: {
      O: 1,
      '△': 0,
      '-': 0,
      X: 1,
    },
  },
  summary_by_channel: [
    {
      channel: 'pc_login',
      total_events: 1,
      total_params: 2,
      pass_count: 1,
      partial_count: 0,
      na_count: 0,
      fail_count: 1,
      pass_rate: 50,
      required_pass_rate: 50,
      average_score: 50,
    },
  ],
  summary_by_page_type: [
    {
      page_type: 'PRODUCT_DETAIL',
      total_events: 1,
      total_params: 2,
      pass_rate: 50,
      average_score: 50,
      most_failed_params: ['currency'],
    },
  ],
  summary_by_level: [
    {
      level: 'event_level',
      total_params: 1,
      pass_count: 0,
      fail_count: 1,
      pass_rate: 0,
    },
    {
      level: 'item_level',
      total_params: 1,
      pass_count: 1,
      fail_count: 0,
      pass_rate: 100,
    },
  ],
  critical_issues: [
    {
      issue_id: 'ISS-001',
      param_id: 'PARAM-002',
      param_name: 'currency',
      event_name: 'view_item',
      issue_type: 'value_mismatch',
      severity: 'MEDIUM',
      affected_channels: ['pc_login', 'pc_no_login', 'mo_login', 'mo_no_login'],
      affected_page_types: ['PRODUCT_DETAIL'],
      description: 'currency 파라미터 값이 소문자로 전송됨',
      expected_value: 'KRW',
      actual_value: 'krw',
      found_at_url: 'https://www.example.com/products/12345',
      fix_recommendation: 'GTM 변수에서 currency 값을 대문자로 변환하도록 수정',
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// TEST 7: 타입 연결 검증
// 시나리오: Spec → ValidationResult 연결 검증
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GTM → PDF → ValidationResult 타입 연결 검증
 */
function validateGTMToPDFConnection(
  gtm: GTMParsedData,
  pdf: PDFParsedData
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // GTM 이벤트가 PDF 정의에 있는지
  const pdfEventNames = new Set(pdf.event_definitions.map(e => e.ga4_event_name));

  gtm.events.forEach(event => {
    if (!pdfEventNames.has(event.event_name)) {
      errors.push(`GTM 이벤트 ${event.event_name}이 PDF 정의에 없음`);
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Event 타입 연결 검증
 */
function validateEventTypeConnection(
  spec: EventScenarioSpec,
  result: EventValidationResult
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // project_id 일치
  if (spec.project_id !== result.project_id) {
    errors.push(`project_id 불일치: Spec(${spec.project_id}) vs Result(${result.project_id})`);
  }

  // spec의 이벤트가 result에 있는지
  const resultEventNames = new Set(
    result.scenario_results.flatMap(s => s.event_results.map(e => e.event_name))
  );

  spec.events.forEach(event => {
    if (!resultEventNames.has(event.event_name)) {
      errors.push(`Spec의 이벤트 ${event.event_name}이 Result에 없음`);
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Parameter 타입 연결 검증
 */
function validateParameterTypeConnection(
  spec: ParameterSpec,
  result: ParameterValidationResult
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // project_id 일치
  if (spec.project_id !== result.project_id) {
    errors.push(`project_id 불일치: Spec(${spec.project_id}) vs Result(${result.project_id})`);
  }

  // spec의 이벤트가 result에 있는지
  const specEventIds = new Set(spec.event_specs.map(e => e.event_id));
  const resultEventIds = new Set(result.event_results.map(e => e.event_id));

  specEventIds.forEach(id => {
    if (!resultEventIds.has(id)) {
      errors.push(`Spec의 이벤트 ${id}가 Result에 없음`);
    }
  });

  return { valid: errors.length === 0, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 8: Constants 검증
// ═══════════════════════════════════════════════════════════════════════════

function validateDay3Constants(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // GTM Constants 검증
  if (GA4_EVENT_TAG_TYPE !== 'gaawe') {
    errors.push('GA4_EVENT_TAG_TYPE 값 오류');
  }
  if (GA4_CONFIG_TAG_TYPE !== 'gaawc') {
    errors.push('GA4_CONFIG_TAG_TYPE 값 오류');
  }
  if (GA4_EVENT_NAME_PARAM_KEY !== 'eventName') {
    errors.push('GA4_EVENT_NAME_PARAM_KEY 값 오류');
  }

  // Parsed Inputs Constants 검증
  if (CHANNEL_COMBINATION_KEYS.length !== 4) {
    errors.push('CHANNEL_COMBINATION_KEYS 개수 오류');
  }
  if (!DEFAULT_CHANNEL_CONDITIONS.pc_login) {
    errors.push('DEFAULT_CHANNEL_CONDITIONS 누락');
  }
  if (!EXPECTED_VALUE_TYPE_DESCRIPTIONS.static) {
    errors.push('EXPECTED_VALUE_TYPE_DESCRIPTIONS 누락');
  }

  // USER_ACTION_TYPE_DESCRIPTIONS 검증
  const expectedActionTypes = ['page_load', 'click', 'scroll', 'submit'];
  expectedActionTypes.forEach(type => {
    if (!USER_ACTION_TYPE_DESCRIPTIONS[type as keyof typeof USER_ACTION_TYPE_DESCRIPTIONS]) {
      errors.push(`USER_ACTION_TYPE_DESCRIPTIONS에 ${type} 없음`);
    }
  });

  // EVENT_FIRE_CONDITION_DESCRIPTIONS 검증
  const expectedConditions = ['auto_fire', 'user_action', 'conditional', 'forbidden'];
  expectedConditions.forEach(cond => {
    if (!EVENT_FIRE_CONDITION_DESCRIPTIONS[cond as keyof typeof EVENT_FIRE_CONDITION_DESCRIPTIONS]) {
      errors.push(`EVENT_FIRE_CONDITION_DESCRIPTIONS에 ${cond} 없음`);
    }
  });

  // PARAM_STATUS_PRIORITY 검증
  const expectedStatuses: Array<'O' | '△' | '-' | 'X'> = ['O', '△', '-', 'X'];
  expectedStatuses.forEach(status => {
    if (PARAM_STATUS_PRIORITY[status] === undefined) {
      errors.push(`PARAM_STATUS_PRIORITY에 ${status} 없음`);
    }
  });

  // GA4_STANDARD_ITEM_PARAMS 검증
  if (GA4_STANDARD_ITEM_PARAMS.length < 10) {
    errors.push(`GA4_STANDARD_ITEM_PARAMS가 너무 적음: ${GA4_STANDARD_ITEM_PARAMS.length}`);
  }

  // DEFAULT_SEVERITY_BY_DISCREPANCY_TYPE 검증
  const expectedDiscrepancyTypes = ['missing', 'type_mismatch', 'value_mismatch'];
  expectedDiscrepancyTypes.forEach(type => {
    if (!DEFAULT_SEVERITY_BY_DISCREPANCY_TYPE[type as keyof typeof DEFAULT_SEVERITY_BY_DISCREPANCY_TYPE]) {
      errors.push(`DEFAULT_SEVERITY_BY_DISCREPANCY_TYPE에 ${type} 없음`);
    }
  });

  // EVENT_STATUS_DESCRIPTIONS 검증 (unused import 방지)
  if (Object.keys(EVENT_STATUS_DESCRIPTIONS).length < 4) {
    errors.push('EVENT_STATUS_DESCRIPTIONS 항목 부족');
  }

  // SCENARIO_STATUS_PRIORITY 검증 (unused import 방지)
  if (Object.keys(SCENARIO_STATUS_PRIORITY).length < 3) {
    errors.push('SCENARIO_STATUS_PRIORITY 항목 부족');
  }

  // EVENT_STATUS_PRIORITY 검증 (unused import 방지)
  if (Object.keys(EVENT_STATUS_PRIORITY).length < 4) {
    errors.push('EVENT_STATUS_PRIORITY 항목 부족');
  }

  return { valid: errors.length === 0, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// 실행
// ═══════════════════════════════════════════════════════════════════════════

console.log('=== Day 3 타입 검증 테스트 (재설계 버전) ===\n');

// Test 1: GTM Container 타입 검증 (신규)
console.log('1. GTM Container 타입 검증 (신규)');
console.log(`   - 컨테이너 ID: ${sampleGTMContainer.containerVersion.containerId}`);
console.log(`   - 태그 수: ${sampleGTMContainer.containerVersion.tag?.length ?? 0}`);
console.log(`   - 추출된 GA4 이벤트: ${sampleGTMParseResult.ga4_events?.length ?? 0}`);
console.log('   - 결과: ✅ 타입 컴파일 통과\n');

// Test 2: Parsed Inputs 타입 검증 (신규)
console.log('2. Parsed Inputs 타입 검증 (신규)');
console.log(`   - Pre-Requirement URL 수: ${samplePreRequirementParsedData.total_urls}`);
console.log(`   - PDF 이벤트 정의 수: ${samplePDFParsedData.total_events}`);
console.log(`   - GTM 이벤트 수: ${sampleGTMParsedData.total_events}`);
console.log(`   - Cross Reference 매칭 이벤트: ${sampleCrossReference.event_mapping.filter(e => e.status === 'matched').length}`);
console.log('   - 결과: ✅ 타입 컴파일 통과\n');

// Test 3: EventScenarioSpec 타입 검증
console.log('3. EventScenarioSpec 타입 검증');
console.log(`   - 이벤트 수: ${sampleEventScenarioSpec.total_events}`);
console.log(`   - 시나리오 수: ${sampleEventScenarioSpec.total_scenarios}`);
console.log(`   - 페이지 규칙 수: ${sampleEventScenarioSpec.page_rules.length}`);
console.log('   - 결과: ✅ 타입 컴파일 통과\n');

// Test 4: EventValidationResult 타입 검증
console.log('4. EventValidationResult 타입 검증');
console.log(`   - 시나리오 결과 수: ${sampleEventValidationResult.scenario_results.length}`);
console.log(`   - 시나리오 통과율: ${sampleEventValidationResult.summary.scenario_pass_rate}%`);
console.log(`   - 이벤트 통과율: ${sampleEventValidationResult.summary.event_pass_rate}%`);
console.log('   - 결과: ✅ 타입 컴파일 통과\n');

// Test 5: ParameterSpec 타입 검증
console.log('5. ParameterSpec 타입 검증');
console.log(`   - 이벤트 스펙 수: ${sampleParameterSpec.event_specs.length}`);
console.log(`   - 전체 파라미터 수: ${sampleParameterSpec.total_parameters}`);
console.log(`   - 필수 파라미터 수: ${sampleParameterSpec.required_parameters}`);
console.log('   - 결과: ✅ 타입 컴파일 통과\n');

// Test 6: ParameterValidationResult 타입 검증
console.log('6. ParameterValidationResult 타입 검증');
console.log(`   - 이벤트 결과 수: ${sampleParameterValidationResult.event_results.length}`);
console.log(`   - 정상(O): ${sampleParameterValidationResult.summary.pass_count}`);
console.log(`   - 오류(X): ${sampleParameterValidationResult.summary.fail_count}`);
console.log(`   - 통과율: ${sampleParameterValidationResult.summary.pass_rate}%`);
console.log(`   - 심각한 이슈: ${sampleParameterValidationResult.critical_issues.length}`);
console.log('   - 결과: ✅ 타입 컴파일 통과\n');

// Test 7: 타입 연결 검증
console.log('7. 타입 연결 검증');

const gtmToPdfResult = validateGTMToPDFConnection(
  sampleGTMParsedData,
  samplePDFParsedData
);
console.log(`   - GTM → PDF 연결: ${gtmToPdfResult.valid ? '✅ 연결 정상' : '❌ 연결 오류'}`);
if (!gtmToPdfResult.valid) {
  gtmToPdfResult.errors.forEach(err => console.log(`     - ${err}`));
}

const eventConnectionResult = validateEventTypeConnection(
  sampleEventScenarioSpec,
  sampleEventValidationResult
);
console.log(`   - Event Spec → Result: ${eventConnectionResult.valid ? '✅ 연결 정상' : '❌ 연결 오류'}`);
if (!eventConnectionResult.valid) {
  eventConnectionResult.errors.forEach(err => console.log(`     - ${err}`));
}

const paramConnectionResult = validateParameterTypeConnection(
  sampleParameterSpec,
  sampleParameterValidationResult
);
console.log(`   - Parameter Spec → Result: ${paramConnectionResult.valid ? '✅ 연결 정상' : '❌ 연결 오류'}`);
if (!paramConnectionResult.valid) {
  paramConnectionResult.errors.forEach(err => console.log(`     - ${err}`));
}
console.log('');

// Test 8: Constants 검증
console.log('8. Constants 검증');
const constantsResult = validateDay3Constants();
if (constantsResult.valid) {
  console.log('   - 결과: ✅ 모든 상수 정상\n');
} else {
  console.log('   - 결과: ❌ 상수 오류');
  constantsResult.errors.forEach(err => console.log(`     - ${err}`));
  console.log('');
}

// Parser Agent Output 검증
console.log('9. Parser Agent Output 통합 검증');
console.log(`   - 프로젝트 ID: ${sampleParserAgentOutput.project_id}`);
console.log(`   - Pre-Requirement URL 수: ${sampleParserAgentOutput.pre_requirement.total_urls}`);
console.log(`   - PDF 이벤트 수: ${sampleParserAgentOutput.pdf.total_events}`);
console.log(`   - GTM 이벤트 수: ${sampleParserAgentOutput.gtm.total_events}`);
console.log(`   - 매칭 이벤트 수: ${sampleParserAgentOutput.parsing_metadata.stats.matched_events}`);
console.log('   - 결과: ✅ 타입 컴파일 통과\n');

console.log('=== 테스트 완료 ===');
