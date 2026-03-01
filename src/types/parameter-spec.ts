/**
 * 파라미터 정답지 타입 정의 (Parameter Spec Types)
 *
 * Parser Agent가 2차 QA Excel(파라미터 검수)을 파싱하여
 * Collector/Validator Agent에게 전달하는 파라미터 정답지입니다.
 *
 * @description
 * - 2차 QA: 파라미터 검수 (Parameter QA)
 * - 대상: GA4 이벤트 파라미터의 값 정확도
 * - 검증: 파라미터 존재 여부, 데이터 타입, 값 일치
 *
 * @input 2차 QA Excel (파라미터 시트), 개발가이드 PDF, 정답지 Excel
 * @output Collector Agent (수집 대상), Validator Agent (검증 기준)
 * @version 1.0
 */

import type {
  DataType,
  PageTypeEnum,
  SourceTraceability,
  ChannelCombination,
} from './common';

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: Parameter Types (파라미터 타입)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 파라미터 레벨
 */
export type ParameterLevel =
  | 'event_level'     // 이벤트 레벨 파라미터
  | 'item_level'      // 아이템 레벨 파라미터 (ecommerce)
  | 'user_property';  // 사용자 속성

/**
 * 파라미터 카테고리
 */
export type ParameterCategory =
  | 'standard'        // GA4 표준 파라미터
  | 'ecommerce'       // 이커머스 파라미터
  | 'custom';         // 커스텀 파라미터

/**
 * 값 타입 힌트
 */
export type ValueTypeHint =
  | 'static'          // 정적 값 (항상 동일)
  | 'dynamic'         // 동적 값 (매번 다름)
  | 'conditional'     // 조건부 값 (상황에 따라 다름)
  | 'computed';       // 계산된 값

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: Parameter Definition (파라미터 정의)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 파라미터 정의
 * 개별 파라미터의 상세 정보
 */
export interface ParameterDefinition {
  /** 파라미터 ID (고유 식별자) */
  param_id: string;
  /** 파라미터명 (개발가이드 기준) */
  param_name: string;
  /** GA4 파라미터명 */
  ga4_param: string;
  /** GTM 변수명 */
  gtm_variable?: string;
  /** 설명 */
  description?: string;

  /** 파라미터 레벨 */
  level: ParameterLevel;
  /** 파라미터 카테고리 */
  category: ParameterCategory;
  /** 데이터 타입 */
  data_type: DataType;

  /** 필수 여부 */
  required: boolean;

  /** 채널별 필수 여부 */
  required_by_channel?: ChannelParameterRequirement;

  /** 검증 규칙 */
  validation: ParameterValidationRule;

  /** 소스 추적 */
  _sources?: SourceTraceability;
}

/**
 * 채널별 파라미터 필수 여부
 */
export interface ChannelParameterRequirement {
  /** PC 로그인 시 필수 */
  pc_login: boolean;
  /** PC 비로그인 시 필수 */
  pc_no_login: boolean;
  /** 모바일 로그인 시 필수 */
  mo_login: boolean;
  /** 모바일 비로그인 시 필수 */
  mo_no_login: boolean;
}

/**
 * 기본 채널 필수 (모두 필수)
 */
export const DEFAULT_CHANNEL_PARAM_REQUIRED: ChannelParameterRequirement = {
  pc_login: true,
  pc_no_login: true,
  mo_login: true,
  mo_no_login: true,
};

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: Validation Rules (검증 규칙)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 파라미터 검증 규칙
 */
export interface ParameterValidationRule {
  /** 허용 값 목록 */
  allowed_values?: (string | number | boolean)[];
  /** 값 패턴 (정규식) */
  pattern?: string;
  /** 최소 길이 */
  min_length?: number;
  /** 최대 길이 */
  max_length?: number;
  /** 최소 값 (숫자) */
  min_value?: number;
  /** 최대 값 (숫자) */
  max_value?: number;
  /** null 허용 */
  allow_null?: boolean;
  /** undefined 허용 */
  allow_undefined?: boolean;
  /** 빈 문자열 허용 */
  allow_empty_string?: boolean;
  /** 배열 최소 길이 (item_level) */
  min_items?: number;
  /** 배열 최대 길이 (item_level) */
  max_items?: number;
  /** 커스텀 검증 함수 이름 */
  custom_validator?: string;
}

/**
 * 기본 검증 규칙
 */
export const DEFAULT_PARAM_VALIDATION: ParameterValidationRule = {
  allow_null: false,
  allow_undefined: false,
  allow_empty_string: false,
};

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: Expected Values (기대값 / 정답지)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 파라미터 기대값
 * 정답지에서 가져온 예상 값
 */
export interface ParameterExpectedValue {
  /** 파라미터 ID */
  param_id: string;
  /** 파라미터명 */
  param_name: string;
  /** 기대 값 */
  expected_value: unknown;
  /** 값 타입 힌트 */
  value_type_hint: ValueTypeHint;
  /** 동적 값 패턴 (dynamic인 경우) */
  dynamic_pattern?: string;
  /** 조건 (conditional인 경우) */
  condition?: string;
  /** 값 소스 */
  value_source: AnswerSource;
  /** 비고 */
  notes?: string;
}

/**
 * 정답 소스
 */
export type AnswerSource =
  | 'dev_guide'       // 개발가이드
  | 'answer_sheet'    // 정답지 Excel
  | 'gtm_export'      // GTM Export
  | 'vision_ai'       // Vision AI 추출
  | 'manual';         // 수동 입력

/**
 * 이벤트별 기대값 세트
 */
export interface EventExpectedValues {
  /** 이벤트명 */
  event_name: string;
  /** GA4 이벤트명 */
  ga4_event_name: string;
  /** 페이지 타입 */
  page_type: PageTypeEnum;
  /** 테스트 URL */
  test_url: string;
  /** 이벤트 레벨 파라미터 기대값 */
  event_params: ParameterExpectedValue[];
  /** 아이템 레벨 파라미터 기대값 */
  item_params?: ParameterExpectedValue[];
  /** 채널 */
  channel: ChannelCombination;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: Event Parameter Spec (이벤트별 파라미터 스펙)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 이벤트별 파라미터 스펙
 * 특정 이벤트에 대한 파라미터 검수 정의
 */
export interface EventParameterSpec {
  /** 이벤트 ID */
  event_id: string;
  /** 이벤트명 */
  event_name: string;
  /** GA4 이벤트명 */
  ga4_event_name: string;

  /** 이벤트 레벨 파라미터 */
  event_level_params: ParameterDefinition[];

  /** 아이템 레벨 파라미터 (이커머스) */
  item_level_params?: ParameterDefinition[];

  /** 사용자 속성 */
  user_properties?: ParameterDefinition[];

  /** 필수 파라미터 수 */
  required_params_count: number;

  /** 전체 파라미터 수 */
  total_params_count: number;

  /** 예상 기대값 세트 */
  expected_values_sets?: EventExpectedValues[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: Item Parameter Spec (아이템 파라미터 스펙)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 아이템 파라미터 스펙
 * 이커머스 items 배열 내 파라미터 정의
 */
export interface ItemParameterSpec {
  /** 필수 아이템 파라미터 */
  required_params: string[];
  /** 선택 아이템 파라미터 */
  optional_params: string[];
  /** 아이템 최소 개수 */
  min_items: number;
  /** 아이템 최대 개수 (검증 시) */
  max_items_to_validate: number;
  /** 파라미터 정의 */
  param_definitions: ParameterDefinition[];
}

/**
 * GA4 표준 아이템 파라미터
 */
export const GA4_STANDARD_ITEM_PARAMS = [
  'item_id',
  'item_name',
  'item_brand',
  'item_category',
  'item_category2',
  'item_category3',
  'item_category4',
  'item_category5',
  'item_variant',
  'price',
  'quantity',
  'index',
  'affiliation',
  'coupon',
  'discount',
  'location_id',
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7: Parameter Spec (최상위 스펙)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 파라미터 정답지 스펙
 * 2차 QA(파라미터)의 전체 검수 대상 정의
 *
 * @description
 * Parser Agent가 2차 QA Excel(파라미터 시트)을 파싱하여 생성
 * Collector Agent: 어떤 파라미터를 수집할지
 * Validator Agent: 어떤 기준으로 검증할지
 */
export interface ParameterSpec {
  /** 프로젝트 ID */
  project_id: string;
  /** 브랜드 ID */
  brand_id: string;
  /** 버전 */
  version: string;
  /** 생성 시점 (ISO 8601) */
  created_at: string;

  /** 이벤트별 파라미터 스펙 */
  event_specs: EventParameterSpec[];

  /** 아이템 파라미터 공통 스펙 */
  item_spec?: ItemParameterSpec;

  /** 전체 이벤트 수 */
  total_events: number;

  /** 전체 파라미터 수 */
  total_parameters: number;

  /** 필수 파라미터 수 */
  required_parameters: number;
}

/**
 * 파라미터 정답지 스펙 확장
 */
export interface ParameterSpecExtended extends ParameterSpec {
  /** 소스 파일 정보 */
  source_file?: {
    file_name: string;
    file_path: string;
    sheet_names: string[];
    parsed_at: string;
  };

  /** 레벨별 파라미터 수 */
  count_by_level?: Record<ParameterLevel, number>;

  /** 카테고리별 파라미터 수 */
  count_by_category?: Record<ParameterCategory, number>;

  /** 이벤트별 파라미터 수 */
  count_by_event?: Record<string, number>;

  /** 채널별 필수 파라미터 수 */
  required_by_channel?: Record<ChannelCombination, number>;

  /** 검수 예상 소요 시간 (분) */
  estimated_validation_minutes?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 8: Answer Sheet (정답지)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 정답지 항목
 * 특정 페이지/이벤트/파라미터의 기대값
 */
export interface AnswerSheetEntry {
  /** 테스트 케이스 ID */
  test_case_id: string;
  /** 페이지 타입 */
  page_type: PageTypeEnum;
  /** 테스트 URL */
  test_url: string;
  /** 채널 */
  channel: ChannelCombination;
  /** 이벤트명 */
  event_name: string;
  /** 파라미터명 */
  param_name: string;
  /** 기대값 */
  expected_value: unknown;
  /** 값 타입 힌트 */
  value_type_hint: ValueTypeHint;
  /** 비고 */
  notes?: string;
}

/**
 * 정답지
 */
export interface AnswerSheet {
  /** 프로젝트 ID */
  project_id: string;
  /** 브랜드 ID */
  brand_id: string;
  /** 버전 */
  version: string;
  /** 생성 시점 */
  created_at: string;
  /** 정답지 항목 */
  entries: AnswerSheetEntry[];
  /** 전체 항목 수 */
  total_entries: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 9: Helper Types & Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 이벤트별 파라미터 맵
 */
export type ParametersByEvent = Map<string, ParameterDefinition[]>;

/**
 * 레벨별 파라미터 맵
 */
export type ParametersByLevel = Record<ParameterLevel, ParameterDefinition[]>;

/**
 * 파라미터 ID → 정의 맵
 */
export type ParameterDefinitionMap = Map<string, ParameterDefinition>;

/**
 * 테스트 케이스별 정답
 */
export type AnswersByTestCase = Map<string, AnswerSheetEntry[]>;

/**
 * 파라미터 스펙 파싱 결과
 */
export interface ParameterSpecParseResult {
  /** 성공 여부 */
  success: boolean;
  /** 파싱된 스펙 */
  spec?: ParameterSpec;
  /** 오류 메시지 */
  errors?: string[];
  /** 경고 메시지 */
  warnings?: string[];
  /** 파싱 통계 */
  stats?: {
    total_rows_processed: number;
    events_parsed: number;
    parameters_parsed: number;
    expected_values_parsed: number;
    parse_duration_ms: number;
  };
}

/**
 * 정답지 파싱 결과
 */
export interface AnswerSheetParseResult {
  /** 성공 여부 */
  success: boolean;
  /** 파싱된 정답지 */
  answer_sheet?: AnswerSheet;
  /** 오류 메시지 */
  errors?: string[];
  /** 경고 메시지 */
  warnings?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 10: Constants
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GA4 표준 이벤트 레벨 파라미터
 */
export const GA4_STANDARD_EVENT_PARAMS = [
  'currency',
  'value',
  'transaction_id',
  'coupon',
  'shipping',
  'tax',
  'payment_type',
  'shipping_tier',
  'item_list_id',
  'item_list_name',
  'creative_name',
  'creative_slot',
  'promotion_id',
  'promotion_name',
] as const;

/**
 * 파라미터 레벨 설명
 */
export const PARAMETER_LEVEL_DESCRIPTIONS: Record<ParameterLevel, string> = {
  event_level: '이벤트 레벨 - 이벤트 전체에 적용되는 파라미터',
  item_level: '아이템 레벨 - items 배열 내 개별 아이템 파라미터',
  user_property: '사용자 속성 - 사용자에게 귀속되는 속성',
};

/**
 * 파라미터 카테고리 설명
 */
export const PARAMETER_CATEGORY_DESCRIPTIONS: Record<ParameterCategory, string> = {
  standard: 'GA4 표준 파라미터',
  ecommerce: '이커머스 파라미터',
  custom: '커스텀 파라미터',
};

/**
 * 값 타입 힌트 설명
 */
export const VALUE_TYPE_HINT_DESCRIPTIONS: Record<ValueTypeHint, string> = {
  static: '정적 값 - 항상 동일한 값',
  dynamic: '동적 값 - 매번 다른 값 (ID, 타임스탬프 등)',
  conditional: '조건부 값 - 상황에 따라 다른 값',
  computed: '계산된 값 - 다른 값들로부터 계산',
};

/**
 * 데이터 타입별 기본 검증 규칙
 */
export const DEFAULT_VALIDATION_BY_DATA_TYPE: Record<DataType, ParameterValidationRule> = {
  string: {
    allow_null: false,
    allow_empty_string: false,
  },
  number: {
    allow_null: false,
    min_value: 0,
  },
  boolean: {
    allow_null: false,
  },
  array: {
    allow_null: false,
    min_items: 1,
  },
  object: {
    allow_null: false,
  },
};
