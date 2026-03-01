/**
 * 파라미터 검증 결과 타입 정의 (Parameter Validation Result Types)
 *
 * Validator Agent가 Collector의 수집 데이터와 ParameterSpec을 비교하여
 * 생성하는 2차 QA(파라미터) 검수 결과입니다.
 *
 * @description
 * - 2차 QA: 파라미터 검수 결과 (Parameter QA Result)
 * - 입력: CollectedData (수집된 파라미터) + ParameterSpec (정답지)
 * - 출력: 파라미터별 O/△/-/X 상태와 불일치 상세
 *
 * @input CollectedData, ParameterSpec, AnswerSheet
 * @output Reporter Agent 입력
 * @version 1.0
 */

import type {
  DataType,
  PageTypeEnum,
  ParameterStatus,
  Severity,
  ChannelCombination,
} from './common';

import type {
  ParameterLevel,
  ParameterCategory,
  ValueTypeHint,
} from './parameter-spec';

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: Parameter Validation Status (파라미터 검증 상태)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 파라미터 검증 결과 상태 (ParameterStatus와 동일)
 * @description
 * - O: 정상 (기대값과 일치)
 * - △: 부분 일치 (타입은 맞지만 값 불일치 등)
 * - -: 해당없음 (N/A, 조건 미충족)
 * - X: 오류 (누락, 타입 오류, 심각한 불일치)
 */
export type ParamValidationStatus = ParameterStatus;

/**
 * 값 일치 유형
 */
export type ValueMatchType =
  | 'exact'           // 정확히 일치
  | 'pattern'         // 패턴 일치 (동적 값)
  | 'type_only'       // 타입만 일치
  | 'partial'         // 부분 일치
  | 'none';           // 불일치

/**
 * 파라미터 상태 설명
 */
export const PARAM_STATUS_DESCRIPTIONS: Record<ParameterStatus, string> = {
  O: '정상 - 기대값과 일치',
  '△': '부분 일치 - 타입은 맞지만 값 불일치 또는 경미한 이슈',
  '-': '해당없음 - 조건 미충족 또는 N/A',
  X: '오류 - 누락, 타입 오류, 심각한 불일치',
};

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: Parameter Result (개별 파라미터 결과)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 개별 파라미터 검증 결과
 */
export interface ParameterResult {
  /** 파라미터 ID */
  param_id: string;
  /** 파라미터명 */
  param_name: string;
  /** GA4 파라미터명 */
  ga4_param: string;

  /** 검증 상태 (O/△/-/X) */
  status: ParamValidationStatus;
  /** 값 일치 유형 */
  match_type: ValueMatchType;

  /** 파라미터 레벨 */
  level: ParameterLevel;
  /** 파라미터 카테고리 */
  category: ParameterCategory;
  /** 데이터 타입 (기대) */
  expected_data_type: DataType;

  /** 존재 여부 (실제) */
  exists: boolean;
  /** 필수 여부 */
  required: boolean;

  /** 기대 값 */
  expected_value?: unknown;
  /** 값 타입 힌트 */
  value_type_hint?: ValueTypeHint;
  /** 실제 값 */
  actual_value?: unknown;
  /** 실제 데이터 타입 */
  actual_data_type?: DataType | 'null' | 'undefined';

  /** 불일치 상세 */
  discrepancy?: ParameterDiscrepancy;
}

/**
 * 파라미터 불일치 상세
 */
export interface ParameterDiscrepancy {
  /** 불일치 유형 */
  type: ParamDiscrepancyType;
  /** 기대 값/상태 */
  expected: unknown;
  /** 실제 값/상태 */
  actual: unknown;
  /** 설명 */
  description: string;
  /** 심각도 */
  severity: Severity;
  /** 수정 권고사항 */
  fix_recommendation?: string;
}

/**
 * 파라미터 불일치 유형
 */
export type ParamDiscrepancyType =
  | 'missing'           // 파라미터 누락
  | 'type_mismatch'     // 데이터 타입 불일치
  | 'value_mismatch'    // 값 불일치
  | 'format_invalid'    // 형식 오류
  | 'range_exceeded'    // 범위 초과 (길이, 숫자)
  | 'pattern_mismatch'  // 패턴 불일치
  | 'null_not_allowed'  // null 허용 안 됨
  | 'empty_not_allowed' // 빈 값 허용 안 됨
  | 'extra_param';      // 불필요한 파라미터

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: Event Parameter Result (이벤트별 파라미터 결과)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 이벤트별 파라미터 검증 결과
 */
export interface EventParameterResult {
  /** 이벤트 ID */
  event_id: string;
  /** 이벤트명 */
  event_name: string;
  /** GA4 이벤트명 */
  ga4_event_name: string;

  /** 페이지 타입 */
  page_type: PageTypeEnum;
  /** 테스트 URL */
  test_url: string;
  /** 채널 */
  channel: ChannelCombination;

  /** 이벤트 레벨 파라미터 결과 */
  event_level_results: ParameterResult[];
  /** 아이템 레벨 파라미터 결과 */
  item_level_results?: ItemParameterResult[];
  /** 사용자 속성 결과 */
  user_property_results?: ParameterResult[];

  /** 전체 파라미터 수 */
  total_params: number;
  /** 정상 (O) 수 */
  pass_count: number;
  /** 부분 (△) 수 */
  partial_count: number;
  /** N/A (-) 수 */
  na_count: number;
  /** 오류 (X) 수 */
  fail_count: number;

  /** 필수 파라미터 통과율 (%) */
  required_pass_rate: number;
  /** 전체 파라미터 점수 (0-100) */
  score: number;

  /** 검증 시점 */
  validated_at: string;
  /** 오류 메시지 (검증 실패 시) */
  error_message?: string;
}

/**
 * 아이템 레벨 파라미터 결과
 * items 배열 내 개별 아이템의 파라미터 검증 결과
 */
export interface ItemParameterResult {
  /** 아이템 인덱스 (0부터 시작) */
  item_index: number;
  /** item_id (있는 경우) */
  item_id?: string;
  /** item_name (있는 경우) */
  item_name?: string;
  /** 파라미터 결과 */
  param_results: ParameterResult[];
  /** 정상 (O) 수 */
  pass_count: number;
  /** 오류 (X) 수 */
  fail_count: number;
}

/**
 * 이벤트 파라미터 결과 확장
 */
export interface EventParameterResultExtended extends EventParameterResult {
  /** 가장 심각한 이슈 */
  most_severe_issue?: ParameterDiscrepancy;
  /** 수정 필요 파라미터 목록 */
  params_to_fix: string[];
  /** 이전 라운드 결과와 비교 */
  comparison_with_previous?: {
    previous_score: number;
    score_change: number;
    fixed_params: string[];
    new_issues: string[];
  };
  /** 관련 GTM 변수 */
  related_gtm_variables?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: Channel Summary (채널별 요약)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 채널별 파라미터 검증 요약
 */
export interface ChannelParameterSummary {
  /** 채널 */
  channel: ChannelCombination;
  /** 검증된 이벤트 수 */
  total_events: number;
  /** 전체 파라미터 수 */
  total_params: number;
  /** 정상 (O) 수 */
  pass_count: number;
  /** 부분 (△) 수 */
  partial_count: number;
  /** N/A (-) 수 */
  na_count: number;
  /** 오류 (X) 수 */
  fail_count: number;
  /** 통과율 (%) */
  pass_rate: number;
  /** 필수 파라미터 통과율 (%) */
  required_pass_rate: number;
  /** 평균 점수 (0-100) */
  average_score: number;
}

/**
 * 페이지 타입별 파라미터 검증 요약
 */
export interface PageTypeParameterSummary {
  /** 페이지 타입 */
  page_type: PageTypeEnum;
  /** 검증된 이벤트 수 */
  total_events: number;
  /** 전체 파라미터 수 */
  total_params: number;
  /** 통과율 (%) */
  pass_rate: number;
  /** 평균 점수 (0-100) */
  average_score: number;
  /** 가장 많이 실패한 파라미터 */
  most_failed_params: string[];
}

/**
 * 파라미터 레벨별 요약
 */
export interface LevelParameterSummary {
  /** 파라미터 레벨 */
  level: ParameterLevel;
  /** 전체 파라미터 수 */
  total_params: number;
  /** 정상 (O) 수 */
  pass_count: number;
  /** 오류 (X) 수 */
  fail_count: number;
  /** 통과율 (%) */
  pass_rate: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: Critical Issues (심각한 이슈)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 파라미터 관련 심각한 이슈
 */
export interface ParameterCriticalIssue {
  /** 이슈 ID */
  issue_id: string;
  /** 파라미터 ID */
  param_id: string;
  /** 파라미터명 */
  param_name: string;
  /** 이벤트명 */
  event_name: string;
  /** 이슈 유형 */
  issue_type: ParamDiscrepancyType;
  /** 심각도 */
  severity: Severity;
  /** 영향받는 채널 */
  affected_channels: ChannelCombination[];
  /** 영향받는 페이지 타입 */
  affected_page_types: PageTypeEnum[];
  /** 이슈 설명 */
  description: string;
  /** 기대값 */
  expected_value: unknown;
  /** 실제값 */
  actual_value: unknown;
  /** 발견된 URL */
  found_at_url: string;
  /** 수정 권고사항 */
  fix_recommendation: string;
  /** 예상 영향도 */
  impact_assessment?: string;
  /** 관련 GTM 변수 */
  related_gtm_variable?: string;
}

/**
 * 파라미터별 이슈 집계
 */
export interface ParameterIssueSummary {
  /** 파라미터 ID */
  param_id: string;
  /** 파라미터명 */
  param_name: string;
  /** 발생 이슈 수 */
  issue_count: number;
  /** 영향받는 이벤트 수 */
  affected_events_count: number;
  /** 영향받는 채널 수 */
  affected_channels_count: number;
  /** 주요 이슈 유형 */
  primary_issue_type: ParamDiscrepancyType;
  /** 최고 심각도 */
  max_severity: Severity;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: Parameter Validation Result (최상위 결과)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 파라미터 검증 결과
 * 2차 QA(파라미터)의 최종 검증 결과
 *
 * @description
 * Validator Agent가 생성
 * Reporter Agent의 입력으로 사용
 */
export interface ParameterValidationResult {
  /** 프로젝트 ID */
  project_id: string;
  /** 브랜드 ID */
  brand_id: string;
  /** 버전 */
  version: string;
  /** 검증 시점 (ISO 8601) */
  validated_at: string;

  /** 사용된 ParameterSpec 버전 */
  spec_version: string;
  /** 사용된 AnswerSheet 버전 */
  answer_sheet_version?: string;

  /** 이벤트별 파라미터 결과 */
  event_results: EventParameterResult[];

  /** 전체 요약 */
  summary: ParameterValidationSummary;

  /** 채널별 요약 */
  summary_by_channel: ChannelParameterSummary[];

  /** 페이지 타입별 요약 */
  summary_by_page_type: PageTypeParameterSummary[];

  /** 파라미터 레벨별 요약 */
  summary_by_level: LevelParameterSummary[];

  /** 심각한 이슈 목록 */
  critical_issues: ParameterCriticalIssue[];
}

/**
 * 파라미터 검증 요약
 */
export interface ParameterValidationSummary {
  /** 검증된 이벤트 수 */
  total_events: number;
  /** 전체 파라미터 수 */
  total_params: number;
  /** 필수 파라미터 수 */
  required_params: number;

  /** 정상 (O) 수 */
  pass_count: number;
  /** 부분 (△) 수 */
  partial_count: number;
  /** N/A (-) 수 */
  na_count: number;
  /** 오류 (X) 수 */
  fail_count: number;

  /** 정상 (O) 비율 (%) */
  pass_rate: number;
  /** 필수 파라미터 통과율 (%) */
  required_pass_rate: number;

  /** 전체 점수 (0-100) */
  overall_score: number;

  /** 상태 분포 */
  status_distribution: Record<ParameterStatus, number>;
}

/**
 * 파라미터 검증 결과 확장
 */
export interface ParameterValidationResultExtended extends ParameterValidationResult {
  /** 카테고리별 요약 */
  summary_by_category?: Record<ParameterCategory, ParameterValidationSummary>;

  /** 검증에 사용된 CollectedData ID */
  collected_data_ids: string[];

  /** 검증 소요 시간 (ms) */
  validation_duration_ms: number;

  /** 검증 환경 */
  validation_environment: {
    base_url: string;
    environment: 'dev' | 'stg' | 'prd';
    validator_version: string;
  };

  /** 파라미터별 이슈 요약 */
  param_issue_summaries: ParameterIssueSummary[];

  /** 이전 검증 결과와 비교 */
  comparison_with_previous?: {
    previous_version: string;
    previous_validated_at: string;
    pass_rate_change: number;
    score_change: number;
    new_issues_count: number;
    fixed_issues_count: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7: Helper Types & Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 이벤트별 파라미터 결과 맵
 */
export type EventParameterResultMap = Map<string, EventParameterResult>;

/**
 * 파라미터별 결과 집계
 */
export type ResultsByParam = Map<string, ParameterResult[]>;

/**
 * 상태별 파라미터 그룹
 */
export type ParamsByStatus = Record<ParameterStatus, ParameterResult[]>;

/**
 * 채널별 실패 파라미터
 */
export type FailedParamsByChannel = Record<ChannelCombination, ParameterResult[]>;

/**
 * 이슈 유형별 그룹
 */
export type IssuesByType = Partial<Record<ParamDiscrepancyType, ParameterCriticalIssue[]>>;

/**
 * 검증 진행 상태
 */
export interface ParameterValidationProgress {
  /** 전체 이벤트 수 */
  total_events: number;
  /** 완료 이벤트 수 */
  completed_events: number;
  /** 현재 검증 중인 이벤트 */
  current_event?: string;
  /** 현재 채널 */
  current_channel?: ChannelCombination;
  /** 검증된 파라미터 수 */
  validated_params: number;
  /** 진행률 (%) */
  progress_percent: number;
  /** 예상 남은 시간 (초) */
  estimated_remaining_seconds?: number;
}

/**
 * 파라미터 비교 결과
 */
export interface ParameterComparisonResult {
  /** 파라미터 ID */
  param_id: string;
  /** 기대 값 */
  expected: unknown;
  /** 실제 값 */
  actual: unknown;
  /** 일치 여부 */
  matches: boolean;
  /** 일치 유형 */
  match_type: ValueMatchType;
  /** 불일치 사유 (있는 경우) */
  mismatch_reason?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 8: Export Formats (내보내기 형식)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Excel 내보내기용 파라미터 결과 행
 */
export interface ParameterResultExcelRow {
  /** 이벤트명 */
  event_name: string;
  /** 페이지 타입 */
  page_type: string;
  /** 채널 */
  channel: string;
  /** 파라미터명 */
  param_name: string;
  /** GA4 파라미터 */
  ga4_param: string;
  /** 레벨 */
  level: string;
  /** 상태 (O/△/-/X) */
  status: string;
  /** 기대값 */
  expected_value: string;
  /** 실제값 */
  actual_value: string;
  /** 불일치 사유 */
  discrepancy_reason: string;
  /** 비고 */
  notes: string;
}

/**
 * Excel 내보내기용 이벤트 요약 행
 */
export interface EventSummaryExcelRow {
  /** 이벤트명 */
  event_name: string;
  /** 페이지 타입 */
  page_type: string;
  /** 채널 */
  channel: string;
  /** URL */
  url: string;
  /** 전체 파라미터 */
  total_params: number;
  /** O (정상) */
  pass_count: number;
  /** △ (부분) */
  partial_count: number;
  /** - (N/A) */
  na_count: number;
  /** X (오류) */
  fail_count: number;
  /** 점수 */
  score: number;
}

/**
 * JSON 내보내기 형식
 */
export interface ParameterValidationExport {
  /** 내보내기 형식 버전 */
  export_version: string;
  /** 내보내기 시점 */
  exported_at: string;
  /** 검증 결과 */
  result: ParameterValidationResult;
  /** 메타데이터 */
  metadata: {
    project_name: string;
    brand_name: string;
    environment: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 9: Constants
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 파라미터 상태 우선순위 (낮을수록 나쁨)
 */
export const PARAM_STATUS_PRIORITY: Record<ParameterStatus, number> = {
  O: 4,
  '△': 3,
  '-': 2,
  X: 1,
};

/**
 * 값 일치 유형 우선순위 (높을수록 좋음)
 */
export const VALUE_MATCH_PRIORITY: Record<ValueMatchType, number> = {
  exact: 5,
  pattern: 4,
  type_only: 3,
  partial: 2,
  none: 1,
};

/**
 * 불일치 유형별 기본 심각도
 */
export const DEFAULT_SEVERITY_BY_DISCREPANCY_TYPE: Record<ParamDiscrepancyType, Severity> = {
  missing: 'CRITICAL',
  type_mismatch: 'HIGH',
  value_mismatch: 'MEDIUM',
  format_invalid: 'MEDIUM',
  range_exceeded: 'LOW',
  pattern_mismatch: 'MEDIUM',
  null_not_allowed: 'MEDIUM',
  empty_not_allowed: 'MEDIUM',
  extra_param: 'LOW',
};

/**
 * 통과율 기준
 */
export const PARAM_PASS_RATE_THRESHOLDS = {
  EXCELLENT: 95,
  GOOD: 85,
  ACCEPTABLE: 70,
  POOR: 0,
} as const;

/**
 * 점수 계산 가중치
 */
export const PARAM_SCORE_WEIGHTS: Record<ParameterStatus, number> = {
  O: 1.0,     // 100% 기여
  '△': 0.5,  // 50% 기여
  '-': 0.0,   // 계산 제외
  X: 0.0,     // 0% 기여
};

/**
 * 필수 파라미터 누락 시 감점
 */
export const REQUIRED_PARAM_MISSING_PENALTY = 10;

/**
 * 불일치 유형 설명
 */
export const DISCREPANCY_TYPE_DESCRIPTIONS: Record<ParamDiscrepancyType, string> = {
  missing: '필수 파라미터 누락',
  type_mismatch: '데이터 타입 불일치 (예: string 대신 number)',
  value_mismatch: '값 불일치 (기대값과 다름)',
  format_invalid: '형식 오류 (날짜, 통화 등)',
  range_exceeded: '범위 초과 (길이, 숫자 범위)',
  pattern_mismatch: '패턴 불일치 (정규식 매칭 실패)',
  null_not_allowed: 'null 값이 허용되지 않음',
  empty_not_allowed: '빈 값(빈 문자열)이 허용되지 않음',
  extra_param: '정의되지 않은 추가 파라미터',
};
