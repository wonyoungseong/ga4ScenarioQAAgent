/**
 * 입력 문서 파싱 결과 타입 정의 (Parsed Input Types)
 *
 * QA Agent 파이프라인의 3개 입력 문서 파싱 결과를 정의합니다:
 * 1. Pre-Requirement Excel: URL 목록, 채널/로그인 조건
 * 2. PDF (개발가이드): 공통변수 정의, 이벤트 발생 조건, 파라미터 기대값
 * 3. GTM JSON: 구현된 이벤트명, 파라미터 키값
 *
 * @description
 * 입력 문서별로 파싱 결과를 명확히 분리하여 각 QA 단계에서 필요한 데이터를 제공합니다.
 *
 * @version 1.0
 */

import type {
  PageTypeEnum,
  DeviceChannel,
  DataType,
  SourceReference,
  GlobalVariableDefinition,
} from './common';

import type {
  GTMExtractedGA4Config,
  GTMExtractedParameter,
} from './gtm-container';

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: Pre-Requirement Excel Parsing (Pre-Requirement 파싱 결과)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pre-Requirement 파싱 데이터
 * Pre-Requirement Excel에서 추출한 URL 목록 및 채널 조건
 */
export interface PreRequirementParsedData {
  /** 프로젝트 ID */
  project_id: string;
  /** 브랜드 ID */
  brand_id: string;
  /** 파싱 버전 */
  version: string;
  /** 파싱 시점 */
  parsed_at: string;

  /** URL 항목 목록 */
  urls: URLEntry[];

  /** 채널 조건 목록 */
  channel_conditions: ChannelCondition[];

  /** 로그인 계정 정보 */
  login_credentials?: LoginCredential[];

  /** 전체 URL 수 */
  total_urls: number;

  /** 채널별 URL 수 */
  urls_by_channel: Record<ChannelCombinationKey, number>;

  /** 소스 파일 정보 */
  source_file: {
    file_name: string;
    file_path: string;
    sheet_names: string[];
    parsed_at: string;
  };
}

/**
 * URL 항목
 * Pre-Requirement에서 정의된 개별 테스트 URL
 */
export interface URLEntry {
  /** URL 항목 ID */
  url_id: string;
  /** 테스트 URL */
  url: string;
  /** 페이지 타입 */
  page_type: PageTypeEnum;
  /** 페이지 설명 */
  page_description?: string;
  /** 활성화 채널 조합 */
  enabled_channels: ChannelCombinationKey[];
  /** 우선순위 (1=최우선) */
  priority?: number;
  /** 선행 URL ID (의존성) */
  prerequisite_url_id?: string;
  /** 비고 */
  notes?: string;
  /** 소스 추적 */
  _source?: SourceReference;
}

/**
 * 채널 조건
 * PC/MO, 로그인/비로그인 조합별 조건
 */
export interface ChannelCondition {
  /** 채널 조합 키 */
  channel: ChannelCombinationKey;
  /** 디바이스 채널 */
  device: DeviceChannel;
  /** 로그인 필요 여부 */
  login_required: boolean;
  /** User-Agent 문자열 */
  user_agent?: string;
  /** 뷰포트 크기 */
  viewport?: ViewportSize;
  /** 추가 헤더 */
  headers?: Record<string, string>;
  /** 쿠키 설정 */
  cookies?: CookieSetting[];
}

/**
 * 채널 조합 키
 */
export type ChannelCombinationKey =
  | 'pc_login'
  | 'pc_no_login'
  | 'mo_login'
  | 'mo_no_login';

/**
 * 뷰포트 크기
 */
export interface ViewportSize {
  /** 너비 (px) */
  width: number;
  /** 높이 (px) */
  height: number;
}

/**
 * 쿠키 설정
 */
export interface CookieSetting {
  /** 쿠키 이름 */
  name: string;
  /** 쿠키 값 */
  value: string;
  /** 도메인 */
  domain?: string;
  /** 경로 */
  path?: string;
  /** Secure 플래그 */
  secure?: boolean;
  /** HttpOnly 플래그 */
  httpOnly?: boolean;
  /** SameSite 속성 */
  sameSite?: 'Strict' | 'Lax' | 'None';
}

/**
 * 로그인 자격 증명
 */
export interface LoginCredential {
  /** 자격 증명 ID */
  credential_id: string;
  /** 채널 조합 */
  channel: ChannelCombinationKey;
  /** 로그인 타입 */
  login_type: 'member' | 'non_member' | 'admin';
  /** 로그인 URL */
  login_url: string;
  /** 아이디 */
  username: string;
  /** 비밀번호 (암호화 필요) */
  password: string;
  /** 아이디 입력 셀렉터 */
  username_selector?: string;
  /** 비밀번호 입력 셀렉터 */
  password_selector?: string;
  /** 로그인 버튼 셀렉터 */
  submit_selector?: string;
  /** 로그인 성공 확인 셀렉터 */
  success_selector?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: PDF (개발가이드) Parsing (PDF 파싱 결과)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * PDF 파싱 데이터
 * 개발가이드 PDF에서 추출한 공통변수, 이벤트 정의, 파라미터 기대값
 */
export interface PDFParsedData {
  /** 프로젝트 ID */
  project_id: string;
  /** 브랜드 ID */
  brand_id: string;
  /** 파싱 버전 */
  version: string;
  /** 파싱 시점 */
  parsed_at: string;

  /** 전역 변수 정의 목록 (1차 QA용) */
  global_variables: GlobalVariableDefinition[];

  /** 이벤트 정의 목록 (2차 QA 이벤트용) */
  event_definitions: PDFEventDefinition[];

  /** 파라미터 기대값 목록 (2차 QA 파라미터용) */
  parameter_expectations: ParameterExpectation[];

  /** 페이지 타입별 이벤트 규칙 */
  page_event_rules?: PageEventRuleFromPDF[];

  /** 이벤트 시퀀스 정의 (여정 검증) */
  event_sequences?: EventSequenceFromPDF[];

  /** 전체 변수 수 */
  total_global_variables: number;

  /** 전체 이벤트 수 */
  total_events: number;

  /** 전체 파라미터 수 */
  total_parameters: number;

  /** 소스 파일 정보 */
  source_file: {
    file_name: string;
    file_path: string;
    total_pages: number;
    parsed_at: string;
  };
}

// GlobalVariableDefinition은 common.ts에서 import
// re-export for convenience
export type { GlobalVariableDefinition } from './common';

/**
 * PDF 이벤트 정의 (정적 정의)
 * 개발가이드에서 정의된 이벤트의 발생 조건
 */
export interface PDFEventDefinition {
  /** 이벤트 ID */
  event_id: string;
  /** 이벤트명 (개발가이드 기준) */
  event_name: string;
  /** GA4 이벤트명 */
  ga4_event_name: string;
  /** dataLayer 이벤트명 (push 시 사용되는 event 값) */
  datalayer_event?: string | string[];
  /** 이벤트 설명 */
  description?: string;
  /** 이벤트 카테고리 */
  category: EventCategoryType;
  /** 발생 조건 타입 */
  fire_condition: FireConditionType;
  /** 발생 조건 상세 설명 */
  fire_condition_description?: string;
  /** 트리거 타입 */
  trigger_type: TriggerTypeFromPDF;
  /** 트리거 상세 (클릭 대상 셀렉터 등) */
  trigger_detail?: string;
  /** 허용 페이지 타입 */
  allowed_page_types: PageTypeEnum[];
  /** 금지 페이지 타입 */
  forbidden_page_types?: PageTypeEnum[];
  /** 채널별 활성화 여부 */
  enabled_channels: Record<ChannelCombinationKey, boolean>;
  /** 선행 이벤트 */
  prerequisite_events?: string[];
  /** 후속 이벤트 */
  followup_events?: string[];
  /** 예상 파라미터 (간략) */
  expected_parameters?: string[];
  /** 우선순위 (1=최우선) */
  priority?: number;
  /** 비고 */
  notes?: string;
  /** 소스 추적 */
  _source?: SourceReference;
}

/**
 * 이벤트 카테고리 타입
 */
export type EventCategoryType =
  | 'pageview'        // 페이지뷰 관련
  | 'ecommerce'       // 이커머스
  | 'engagement'      // 사용자 참여
  | 'conversion'      // 전환
  | 'custom';         // 커스텀

/**
 * 이벤트 발생 조건 타입
 */
export type FireConditionType =
  | 'auto_fire'       // 페이지 로드 시 자동 발생
  | 'user_action'     // 사용자 액션 필요 (클릭 등)
  | 'conditional'     // 조건 충족 시 발생
  | 'forbidden';      // 발생하면 안 됨

/**
 * PDF에서 추출한 트리거 타입
 */
export type TriggerTypeFromPDF =
  | 'page_load'       // 페이지 로드
  | 'dom_ready'       // DOM Ready
  | 'window_load'     // Window Load
  | 'click'           // 클릭
  | 'scroll'          // 스크롤
  | 'form_submit'     // 폼 제출
  | 'visibility'      // 요소 노출
  | 'timer'           // 타이머
  | 'custom_event';   // 커스텀 이벤트

/**
 * 파라미터 기대값 (정답지)
 * PDF에서 추출한 파라미터 기대값
 */
export interface ParameterExpectation {
  /** 기대값 ID */
  expectation_id: string;
  /** 이벤트명 */
  event_name: string;
  /** GA4 이벤트명 */
  ga4_event_name: string;
  /** 파라미터명 */
  param_name: string;
  /** GA4 파라미터명 */
  ga4_param: string;
  /** 파라미터 레벨 */
  param_level: 'event_level' | 'item_level' | 'user_property';
  /** 데이터 타입 */
  data_type: DataType;
  /** 필수 여부 */
  required: boolean;
  /** 기대값 (정적) */
  expected_value?: unknown;
  /** 기대값 타입 힌트 */
  value_type: ExpectedValueType;
  /** 동적 값 패턴 (정규식) */
  dynamic_pattern?: string;
  /** 허용 값 목록 */
  allowed_values?: (string | number | boolean)[];
  /** 값 범위 (숫자) */
  value_range?: {
    min?: number;
    max?: number;
  };
  /** 채널별 기대값 */
  expected_by_channel?: Partial<Record<ChannelCombinationKey, unknown>>;
  /** 페이지 타입별 기대값 */
  expected_by_page_type?: Partial<Record<PageTypeEnum, unknown>>;
  /** 조건부 기대값 */
  conditional_expectations?: ConditionalExpectation[];
  /** 검증 규칙 */
  validation_rules?: ValidationRuleSet;
  /** 비고 */
  notes?: string;
  /** 소스 추적 */
  _source?: SourceReference;
}

/**
 * 기대값 타입
 */
export type ExpectedValueType =
  | 'static'          // 정적 값 (항상 동일)
  | 'dynamic'         // 동적 값 (매번 다름)
  | 'conditional'     // 조건부 값 (상황에 따라 다름)
  | 'computed'        // 계산된 값
  | 'any_non_empty';  // 비어있지 않은 값이면 OK

/**
 * 조건부 기대값
 */
export interface ConditionalExpectation {
  /** 조건 설명 */
  condition_description: string;
  /** 조건 타입 */
  condition_type: 'channel' | 'page_type' | 'login_state' | 'custom';
  /** 조건 값 */
  condition_value: string;
  /** 기대값 */
  expected_value: unknown;
}

/**
 * 검증 규칙 세트
 */
export interface ValidationRuleSet {
  /** 패턴 (정규식) */
  pattern?: string;
  /** 최소 길이 */
  min_length?: number;
  /** 최대 길이 */
  max_length?: number;
  /** 최소 값 */
  min_value?: number;
  /** 최대 값 */
  max_value?: number;
  /** null 허용 */
  allow_null?: boolean;
  /** undefined 허용 */
  allow_undefined?: boolean;
  /** 빈 문자열 허용 */
  allow_empty_string?: boolean;
  /** 배열 최소 항목 수 */
  min_items?: number;
  /** 배열 최대 항목 수 */
  max_items?: number;
  /** 커스텀 검증 함수 이름 */
  custom_validator?: string;
}

/**
 * PDF에서 추출한 페이지별 이벤트 규칙
 */
export interface PageEventRuleFromPDF {
  /** 페이지 타입 */
  page_type: PageTypeEnum;
  /** 자동 발생 이벤트 목록 */
  auto_fire_events: string[];
  /** 조건부 이벤트 목록 */
  conditional_events: {
    event_name: string;
    condition: string;
    trigger_type: TriggerTypeFromPDF;
  }[];
  /** 금지 이벤트 목록 */
  forbidden_events: string[];
  /** 소스 추적 */
  _source?: SourceReference;
}

/**
 * PDF에서 추출한 이벤트 시퀀스
 */
export interface EventSequenceFromPDF {
  /** 시퀀스 ID */
  sequence_id: string;
  /** 시퀀스명 */
  sequence_name: string;
  /** 설명 */
  description?: string;
  /** 이벤트 순서 목록 */
  events: {
    order: number;
    event_name: string;
    optional?: boolean;
  }[];
  /** 엄격 모드 (순서 완전 일치 필요) */
  strict_order: boolean;
  /** 소스 추적 */
  _source?: SourceReference;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: GTM JSON Parsing (GTM 파싱 결과)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GTM 파싱 데이터
 * GTM Container Export JSON에서 추출한 이벤트/파라미터 목록
 */
export interface GTMParsedData {
  /** 프로젝트 ID */
  project_id: string;
  /** 브랜드 ID */
  brand_id: string;
  /** 파싱 버전 */
  version: string;
  /** 파싱 시점 */
  parsed_at: string;

  /** 컨테이너 정보 */
  container_info: GTMContainerInfo;

  /** GA4 이벤트 목록 */
  events: GTMEventInfo[];

  /** GA4 파라미터 목록 (모든 이벤트의 파라미터 통합) */
  parameters: GTMParameterInfo[];

  /** GA4 설정 태그 목록 */
  configs: GTMExtractedGA4Config[];

  /** 전체 이벤트 수 */
  total_events: number;

  /** 전체 파라미터 수 (고유) */
  total_unique_parameters: number;

  /** 소스 파일 정보 */
  source_file: {
    file_name: string;
    file_path: string;
    container_version: string;
    parsed_at: string;
  };
}

/**
 * GTM 컨테이너 정보
 */
export interface GTMContainerInfo {
  /** 컨테이너 ID */
  container_id: string;
  /** 컨테이너 공개 ID (GTM-XXXXXX) */
  public_id: string;
  /** 컨테이너 이름 */
  name: string;
  /** 컨테이너 버전 ID */
  version_id: string;
  /** Export 시간 */
  export_time: string;
  /** 총 태그 수 */
  total_tags: number;
  /** 총 트리거 수 */
  total_triggers: number;
  /** 총 변수 수 */
  total_variables: number;
}

/**
 * GTM 이벤트 정보
 * GTM에서 추출한 GA4 이벤트
 */
export interface GTMEventInfo {
  /** 태그 ID */
  tag_id: string;
  /** 태그 이름 */
  tag_name: string;
  /** 이벤트명 */
  event_name: string;
  /** 이벤트명 소스 (리터럴 vs 변수) */
  event_name_source: 'literal' | 'variable';
  /** 참조 변수명 (변수인 경우) */
  event_name_variable?: string;
  /** 설정 태그 참조 */
  config_tag_name?: string;
  /** Measurement ID */
  measurement_id?: string;
  /** 파라미터 목록 */
  parameters: GTMExtractedParameter[];
  /** User Properties */
  user_properties?: GTMExtractedParameter[];
  /** 발화 트리거 이름 목록 */
  firing_triggers: string[];
  /** 차단 트리거 이름 목록 */
  blocking_triggers?: string[];
  /** 태그 발화 옵션 */
  firing_option?: 'UNLIMITED' | 'ONCE_PER_EVENT' | 'ONCE_PER_LOAD';
  /** 일시 중지 여부 */
  paused?: boolean;
  /** 노트 */
  notes?: string;
}

/**
 * GTM 파라미터 정보
 * GTM에서 추출한 파라미터 (이벤트 무관하게 고유 목록)
 */
export interface GTMParameterInfo {
  /** 파라미터 키 (GA4 파라미터명) */
  param_key: string;
  /** 이 파라미터를 사용하는 이벤트 목록 */
  used_by_events: string[];
  /** 파라미터 레벨 */
  param_level: 'event_level' | 'item_level' | 'user_property';
  /** 값 소스 타입들 */
  value_sources: ParameterValueSource[];
  /** 사용 횟수 */
  usage_count: number;
}

/**
 * 파라미터 값 소스
 */
export interface ParameterValueSource {
  /** 이벤트명 */
  event_name: string;
  /** 값 (리터럴 또는 변수 참조) */
  value: string;
  /** 변수 참조 여부 */
  is_variable: boolean;
  /** 참조 변수명 */
  variable_name?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: Combined Parsed Data (통합 파싱 결과)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parser Agent 통합 출력
 * 3개 입력 문서의 파싱 결과를 통합
 */
export interface ParserAgentOutput {
  /** 프로젝트 ID */
  project_id: string;
  /** 브랜드 ID */
  brand_id: string;
  /** 버전 */
  version: string;
  /** 생성 시점 */
  created_at: string;

  /** Pre-Requirement 파싱 결과 */
  pre_requirement: PreRequirementParsedData;

  /** PDF 파싱 결과 */
  pdf: PDFParsedData;

  /** GTM 파싱 결과 */
  gtm: GTMParsedData;

  /** 크로스 레퍼런스 (문서 간 매핑) */
  cross_reference: CrossReference;

  /** 파싱 메타데이터 */
  parsing_metadata: ParsingMetadata;
}

/**
 * 크로스 레퍼런스 (문서 간 매핑)
 */
export interface CrossReference {
  /** 이벤트 매핑 (PDF 정의 → GTM 구현) */
  event_mapping: EventMappingEntry[];
  /** 파라미터 매핑 (PDF 기대값 → GTM 변수) */
  parameter_mapping: ParameterMappingEntry[];
  /** 누락 이벤트 (PDF에 있지만 GTM에 없음) */
  missing_events: string[];
  /** 추가 이벤트 (GTM에 있지만 PDF에 없음) */
  extra_events: string[];
  /** 누락 파라미터 */
  missing_parameters: MissingParameterEntry[];
}

/**
 * 이벤트 매핑 항목
 */
export interface EventMappingEntry {
  /** 이벤트명 */
  event_name: string;
  /** PDF 이벤트 ID */
  pdf_event_id?: string;
  /** GTM 태그 ID */
  gtm_tag_id?: string;
  /** 매핑 상태 */
  status: 'matched' | 'pdf_only' | 'gtm_only';
  /** 불일치 항목 */
  discrepancies?: string[];
}

/**
 * 파라미터 매핑 항목
 */
export interface ParameterMappingEntry {
  /** 이벤트명 */
  event_name: string;
  /** 파라미터명 */
  param_name: string;
  /** PDF 기대값 ID */
  pdf_expectation_id?: string;
  /** GTM 변수 참조 */
  gtm_variable_ref?: string;
  /** 매핑 상태 */
  status: 'matched' | 'pdf_only' | 'gtm_only';
}

/**
 * 누락 파라미터 항목
 */
export interface MissingParameterEntry {
  /** 이벤트명 */
  event_name: string;
  /** 파라미터명 */
  param_name: string;
  /** 필수 여부 */
  required: boolean;
  /** 누락 위치 */
  missing_in: 'pdf' | 'gtm';
}

/**
 * 파싱 메타데이터
 */
export interface ParsingMetadata {
  /** 전체 파싱 시간 (ms) */
  total_parse_duration_ms: number;
  /** 개별 파싱 시간 */
  parse_durations: {
    pre_requirement_ms: number;
    pdf_ms: number;
    gtm_ms: number;
  };
  /** 경고 메시지 */
  warnings: string[];
  /** 오류 메시지 */
  errors: string[];
  /** 파싱 통계 */
  stats: {
    total_urls: number;
    total_global_variables: number;
    total_events_pdf: number;
    total_events_gtm: number;
    total_parameters: number;
    matched_events: number;
    matched_parameters: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: Parse Result Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pre-Requirement 파싱 결과
 */
export interface PreRequirementParseResult {
  /** 성공 여부 */
  success: boolean;
  /** 파싱된 데이터 */
  data?: PreRequirementParsedData;
  /** 오류 메시지 */
  errors?: string[];
  /** 경고 메시지 */
  warnings?: string[];
  /** 파싱 통계 */
  stats?: {
    total_rows_processed: number;
    urls_parsed: number;
    channels_parsed: number;
    parse_duration_ms: number;
  };
}

/**
 * PDF 파싱 결과
 */
export interface PDFParseResult {
  /** 성공 여부 */
  success: boolean;
  /** 파싱된 데이터 */
  data?: PDFParsedData;
  /** 오류 메시지 */
  errors?: string[];
  /** 경고 메시지 */
  warnings?: string[];
  /** 파싱 통계 */
  stats?: {
    total_pages_processed: number;
    global_variables_parsed: number;
    events_parsed: number;
    parameters_parsed: number;
    parse_duration_ms: number;
  };
}

/**
 * GTM 파싱 결과
 */
export interface GTMParseResultExtended {
  /** 성공 여부 */
  success: boolean;
  /** 파싱된 데이터 */
  data?: GTMParsedData;
  /** 오류 메시지 */
  errors?: string[];
  /** 경고 메시지 */
  warnings?: string[];
  /** 파싱 통계 */
  stats?: {
    total_tags: number;
    ga4_event_tags: number;
    ga4_config_tags: number;
    total_triggers: number;
    total_variables: number;
    unique_parameters: number;
    parse_duration_ms: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: Helper Types & Constants
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 채널 조합 키 목록
 */
export const CHANNEL_COMBINATION_KEYS: readonly ChannelCombinationKey[] = [
  'pc_login',
  'pc_no_login',
  'mo_login',
  'mo_no_login',
] as const;

/**
 * 기본 채널 조건
 */
export const DEFAULT_CHANNEL_CONDITIONS: Record<ChannelCombinationKey, ChannelCondition> = {
  pc_login: {
    channel: 'pc_login',
    device: 'PC',
    login_required: true,
    viewport: { width: 1920, height: 1080 },
  },
  pc_no_login: {
    channel: 'pc_no_login',
    device: 'PC',
    login_required: false,
    viewport: { width: 1920, height: 1080 },
  },
  mo_login: {
    channel: 'mo_login',
    device: 'MO',
    login_required: true,
    viewport: { width: 375, height: 812 },
  },
  mo_no_login: {
    channel: 'mo_no_login',
    device: 'MO',
    login_required: false,
    viewport: { width: 375, height: 812 },
  },
};

/**
 * 기대값 타입 설명
 */
export const EXPECTED_VALUE_TYPE_DESCRIPTIONS: Record<ExpectedValueType, string> = {
  static: '정적 값 - 항상 동일한 값',
  dynamic: '동적 값 - 매번 다른 값 (ID, 타임스탬프 등)',
  conditional: '조건부 값 - 상황에 따라 다른 값',
  computed: '계산된 값 - 다른 값들로부터 계산',
  any_non_empty: '비어있지 않은 값이면 OK',
};

/**
 * URL 항목별 맵
 */
export type URLEntryMap = Map<string, URLEntry>;

/**
 * 이벤트명별 PDF 정의 맵
 */
export type PDFEventDefinitionMap = Map<string, PDFEventDefinition>;

/**
 * 이벤트명별 GTM 정보 맵
 */
export type GTMEventInfoMap = Map<string, GTMEventInfo>;

/**
 * 파라미터명별 기대값 맵
 */
export type ParameterExpectationMap = Map<string, ParameterExpectation[]>;
