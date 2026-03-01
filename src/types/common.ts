/**
 * 공통 타입 정의 (Common Types)
 *
 * QA Agent 파이프라인 전반에서 사용되는 기본 타입들.
 * 기존 parser-output.ts, crawl-plan.ts, global-variable-spec.ts에서
 * 여러 모듈이 공유하는 타입을 추출하여 통합한 파일입니다.
 *
 * @version 1.0
 */

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: Basic Types (기본 타입)
// ═══════════════════════════════════════════════════════════════════════════

/** 데이터 타입 */
export type DataType = 'string' | 'number' | 'boolean' | 'array' | 'object';

/** 심각도 */
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

/** QA 상태 */
export type QAStatus = 'PASS' | 'FAIL' | 'WARN' | 'MISSING' | 'NOT_APPLICABLE';

/** 파라미터 상태 (O/△/-/X) */
export type ParameterStatus = 'O' | '△' | '-' | 'X';

/** 디바이스 채널 */
export type DeviceChannel = 'PC' | 'MO';

/** 변수 스코프 */
export type VariableScope = 'GLOBAL' | 'PAGE' | 'EVENT';

/** 트리거 타입 */
export type TriggerType = 'pageLoad' | 'click' | 'scroll' | 'submit' | 'custom' | 'timer';

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: Page & Channel Types (페이지/채널 타입)
// ═══════════════════════════════════════════════════════════════════════════

/** 페이지 타입 enum */
export type PageTypeEnum =
  | 'MAIN'
  | 'PRODUCT_LIST'
  | 'PRODUCT_DETAIL'
  | 'EVENT_LIST'
  | 'EVENT_DETAIL'
  | 'CART'
  | 'CHECKOUT'
  | 'ORDER_COMPLETE'
  | 'MY_PAGE'
  | 'SEARCH'
  | 'OTHERS'
  | 'ERROR';

/** 채널 조합 (PC/MO × 로그인/비로그인) */
export type ChannelCombination =
  | 'pc_login'
  | 'pc_no_login'
  | 'mo_login'
  | 'mo_no_login';

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: Source Traceability (소스 추적)
// ═══════════════════════════════════════════════════════════════════════════

/** 소스 참조 */
export interface SourceReference {
  /** 소스 타입 */
  type: 'pdf' | 'gtm_json' | 'excel';
  /** 파일명 */
  file_name: string;
  /** 위치 ("page 15" or "Sheet1!A1:D10" or "tags[0].parameter") */
  location: string;
  /** 추출 시점 */
  extracted_at: string;
}

/** 충돌 해결 */
export interface ConflictResolution {
  /** 충돌 필드 */
  field: string;
  /** 충돌 소스들 */
  sources: SourceReference[];
  /** 해결된 값 */
  resolved_value: unknown;
  /** 해결 사유 */
  resolution_reason: string;
}

/** 소스 추적성 */
export interface SourceTraceability {
  /** 주요 소스 */
  primary_source: SourceReference;
  /** 보조 소스들 */
  secondary_sources?: SourceReference[];
  /** 충돌 해결 기록 */
  conflicts?: ConflictResolution[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: Global Variable Types (전역변수 타입)
// ═══════════════════════════════════════════════════════════════════════════

/** 변수 소스 타입 */
export type VariableSourceType = 'window' | 'dataLayer' | 'both';

/** 변수 소스 설정 */
export interface VariableSource {
  /** 소스 타입 */
  type: VariableSourceType;
  /** window 객체 경로 (예: "AP_DATA_SITENAME", "digitalData.page.pageInfo") */
  window_path?: string;
  /** dataLayer 키 (예: "siteName") */
  dataLayer_key?: string;
  /** dataLayer 이벤트명 (특정 이벤트에서만 존재하는 경우) */
  dataLayer_event?: string;
}

/** 채널별 필수 여부 */
export interface ChannelRequirement {
  /** PC 로그인 시 필수 */
  pc_login: boolean;
  /** PC 비로그인 시 필수 */
  pc_no_login: boolean;
  /** 모바일 로그인 시 필수 */
  mo_login: boolean;
  /** 모바일 비로그인 시 필수 */
  mo_no_login: boolean;
}

/** 기본 채널 요구사항 (모든 채널 필수) */
export const DEFAULT_CHANNEL_REQUIREMENT: ChannelRequirement = {
  pc_login: true,
  pc_no_login: true,
  mo_login: true,
  mo_no_login: true,
};

/** 변수 검증 규칙 */
export interface VariableValidationRule {
  /** 허용 값 목록 (enum-like) */
  allowed_values?: (string | number | boolean)[];
  /** 값 패턴 (정규식) */
  pattern?: string;
  /** 최소 길이 (문자열) */
  min_length?: number;
  /** 최대 길이 (문자열) */
  max_length?: number;
  /** 최소 값 (숫자) */
  min_value?: number;
  /** 최대 값 (숫자) */
  max_value?: number;
  /** null 허용 여부 */
  allow_null?: boolean;
  /** undefined 허용 여부 */
  allow_undefined?: boolean;
  /** 빈 문자열 허용 여부 */
  allow_empty_string?: boolean;
  /** 대소문자 구분 여부 (기본: true) */
  case_sensitive?: boolean;
  /** 공백 트림 여부 (기본: true) */
  trim_whitespace?: boolean;
}

/** 기본 검증 규칙 (문자열, 비어있지 않음) */
export const DEFAULT_VALIDATION_RULE: VariableValidationRule = {
  allow_null: false,
  allow_undefined: false,
  allow_empty_string: false,
  case_sensitive: true,
  trim_whitespace: true,
};

/** 전역변수 정의 */
export interface GlobalVariableDefinition {
  /** 변수 ID (고유 식별자) */
  variable_id: string;
  /** 변수명 (예: "AP_DATA_SITENAME") */
  variable_name: string;
  /** 한글 설명 */
  description?: string;
  /** 데이터 타입 */
  data_type: DataType;
  /** 변수 스코프 (GLOBAL/PAGE/EVENT) */
  scope: VariableScope;
  /** 변수 소스 설정 */
  source: VariableSource;
  /** 채널별 필수 여부 */
  required_channels: ChannelRequirement;
  /** 검증 규칙 */
  validation: VariableValidationRule;
  /** 기대값 예시 */
  example_value?: unknown;
  /** 관련 이벤트 (이 변수가 특정 이벤트에서만 사용되는 경우) */
  related_events?: string[];
  /** 카테고리/그룹 */
  category?: string;
  /** 우선순위 (1=최우선) */
  priority?: number;
}
