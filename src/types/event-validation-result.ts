/**
 * 이벤트 검증 결과 타입 정의 (Event Validation Result Types)
 *
 * Validator Agent가 Collector의 수집 데이터와 EventScenarioSpec을 비교하여
 * 생성하는 2차 QA(이벤트) 검수 결과입니다.
 *
 * @description
 * - 2차 QA: 이벤트 검수 결과 (Event QA Result)
 * - 입력: CollectedData (수집된 이벤트) + EventScenarioSpec (시나리오)
 * - 출력: 시나리오별/이벤트별 PASS/FAIL/MISSING/EXTRA 상태
 *
 * @input CollectedData, EventScenarioSpec
 * @output Reporter Agent 입력
 * @version 1.0
 */

import type {
  PageTypeEnum,
  Severity,
  QAStatus,
  ChannelCombination,
} from './common';

import type {
  EventCategory,
  UserActionType,
} from './event-scenario';

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: Event Validation Status (이벤트 검증 상태)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 이벤트 검증 상태
 */
export type EventValidationStatus =
  | 'PASS'        // 정상 발생
  | 'FAIL'        // 잘못 발생 (타이밍, 순서 오류 등)
  | 'MISSING'     // 미발생 (발생해야 하는데 안 함)
  | 'EXTRA'       // 추가 발생 (발생하면 안 되는데 함)
  | 'SKIP';       // 검증 스킵 (조건 미충족)

/**
 * 시나리오 검증 상태
 */
export type ScenarioValidationStatus =
  | 'PASS'        // 시나리오 전체 통과
  | 'PARTIAL'     // 일부 이벤트만 통과
  | 'FAIL'        // 시나리오 실패
  | 'ERROR';      // 실행 오류

/**
 * 이벤트 상태 설명
 */
export const EVENT_STATUS_DESCRIPTIONS: Record<EventValidationStatus, string> = {
  PASS: '예상대로 정상 발생',
  FAIL: '발생했으나 기대와 다름 (타이밍, 순서, 조건 오류)',
  MISSING: '발생해야 하는데 발생하지 않음',
  EXTRA: '발생하면 안 되는데 발생함',
  SKIP: '검증 조건 미충족으로 스킵',
};

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: Event Result (개별 이벤트 결과)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 개별 이벤트 검증 결과
 */
export interface EventResult {
  /** 이벤트명 */
  event_name: string;
  /** GA4 이벤트명 */
  ga4_event_name: string;
  /** 비즈니스 레벨 이벤트 ID (Parser에서 할당) */
  event_id?: string;
  /** 검증 상태 */
  status: EventValidationStatus;
  /** 발생 여부 (실제) */
  fired: boolean;
  /** 기대 발생 여부 */
  expected_to_fire: boolean;

  /** 발생 시점 (ms, 시나리오 시작 기준) */
  fired_at_ms?: number;
  /** 기대 발생 시점 (ms) */
  expected_within_ms?: number;

  /** 발생 순서 (실제) */
  actual_sequence?: number;
  /** 기대 순서 */
  expected_sequence?: number;

  /** 불일치 상세 (FAIL 시) */
  discrepancy?: EventDiscrepancy;

  /** 수집된 파라미터 수 */
  captured_params_count?: number;

  /** 검증 참고 노트 (지식 베이스 check_points 등) */
  notes?: string[];

  /** 트리거 분석 기반 As-Is (이슈 시에만) */
  as_is?: string;
  /** 트리거 분석 기반 To-Be (이슈 시에만) */
  to_be?: string;
}

/**
 * 이벤트 불일치 상세
 */
export interface EventDiscrepancy {
  /** 불일치 유형 */
  type: EventDiscrepancyType;
  /** 기대 값/상태 */
  expected: unknown;
  /** 실제 값/상태 */
  actual: unknown;
  /** 설명 */
  description: string;
  /** 심각도 */
  severity: Severity;
}

/**
 * 이벤트 불일치 유형
 */
export type EventDiscrepancyType =
  | 'timing'          // 타이밍 오류 (너무 늦게 발생)
  | 'sequence'        // 순서 오류
  | 'duplicate'       // 중복 발생
  | 'wrong_page'      // 잘못된 페이지에서 발생
  | 'missing_trigger' // 트리거 누락
  | 'extra_fire';     // 불필요한 발생

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: Scenario Result (시나리오 결과)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 시나리오 검증 결과
 */
export interface ScenarioResult {
  /** 시나리오 ID */
  scenario_id: string;
  /** 시나리오명 */
  scenario_name: string;
  /** 검증 상태 */
  status: ScenarioValidationStatus;

  /** 대상 페이지 타입 */
  page_type: PageTypeEnum;
  /** 검증된 URL */
  validated_url: string;
  /** 채널 */
  channel: ChannelCombination;

  /** 비즈니스 레벨 액션 ID (Parser에서 할당, Collector에서 전달) */
  action_id: string;

  /** 수행된 사용자 액션 */
  user_action_performed?: UserActionResult;

  /** 이벤트별 결과 */
  event_results: EventResult[];

  /** 통과한 이벤트 수 */
  passed_count: number;
  /** 실패한 이벤트 수 */
  failed_count: number;
  /** 누락된 이벤트 수 */
  missing_count: number;
  /** 추가 발생한 이벤트 수 */
  extra_count: number;

  /** 시나리오 점수 (0-100) */
  score: number;

  /** 검증 시작 시점 */
  started_at: string;
  /** 검증 종료 시점 */
  ended_at: string;
  /** 소요 시간 (ms) */
  duration_ms: number;

  /** Content Group 검증 결과 (Validator 자체 판정, Collector 데이터와 분리) */
  content_group_validation?: ContentGroupValidation;

  /** 오류 발생 시 메시지 */
  error_message?: string;
  /** 스크린샷 경로 */
  screenshot_path?: string;
}

/**
 * Content Group 검증 결과
 * (YELLOW 4: Collector errors에 혼입하지 않고 별도 필드로 관리)
 */
export interface ContentGroupValidation {
  status: 'MATCH' | 'MISMATCH' | 'MISSING';
  expected: string;
  actual?: string;
  impact: string;
}

/**
 * 사용자 액션 수행 결과
 */
export interface UserActionResult {
  /** 액션 타입 */
  action_type: UserActionType;
  /** 타겟 선택자 */
  target_selector?: string;
  /** 수행 성공 여부 */
  success: boolean;
  /** 오류 메시지 (실패 시) */
  error_message?: string;
  /** 소요 시간 (ms) */
  duration_ms: number;
}

/**
 * 시나리오 결과 확장
 */
export interface ScenarioResultExtended extends ScenarioResult {
  /** 심각도 (가장 높은 이슈 기준) */
  severity?: Severity;
  /** 수정 권고사항 */
  fix_recommendations?: string[];
  /** 관련 GTM 태그 */
  related_gtm_tags?: string[];
  /** 이전 라운드 결과와 비교 */
  comparison_with_previous?: {
    previous_status: ScenarioValidationStatus;
    improved: boolean;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: Channel Summary (채널별 요약)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 채널별 이벤트 검증 요약
 */
export interface ChannelEventSummary {
  /** 채널 */
  channel: ChannelCombination;
  /** 전체 시나리오 수 */
  total_scenarios: number;
  /** 통과 시나리오 수 */
  passed_scenarios: number;
  /** 실패 시나리오 수 */
  failed_scenarios: number;
  /** 전체 이벤트 수 */
  total_events: number;
  /** 통과 이벤트 수 */
  passed_events: number;
  /** 실패 이벤트 수 */
  failed_events: number;
  /** 누락 이벤트 수 */
  missing_events: number;
  /** 추가 이벤트 수 */
  extra_events: number;
  /** 통과율 (%) */
  pass_rate: number;
}

/**
 * 페이지 타입별 이벤트 검증 요약
 */
export interface PageTypeEventSummary {
  /** 페이지 타입 */
  page_type: PageTypeEnum;
  /** 전체 시나리오 수 */
  total_scenarios: number;
  /** 통과 시나리오 수 */
  passed_scenarios: number;
  /** 통과율 (%) */
  pass_rate: number;
  /** 가장 많이 실패한 이벤트 */
  most_failed_events: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: Critical Issues (심각한 이슈)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 이벤트 관련 심각한 이슈
 */
export interface EventCriticalIssue {
  /** 이슈 ID */
  issue_id: string;
  /** 이벤트명 */
  event_name: string;
  /** 시나리오 ID */
  scenario_id: string;
  /** 이슈 유형 */
  issue_type: EventDiscrepancyType | 'execution_error';
  /** 심각도 */
  severity: Severity;
  /** 영향받는 채널 */
  affected_channels: ChannelCombination[];
  /** 영향받는 페이지 타입 */
  affected_page_types: PageTypeEnum[];
  /** 이슈 설명 */
  description: string;
  /** 발견된 URL */
  found_at_url: string;
  /** 수정 권고사항 */
  fix_recommendation: string;
  /** 예상 영향도 */
  impact_assessment?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: Event Validation Result (최상위 결과)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 이벤트 검증 결과
 * 2차 QA(이벤트)의 최종 검증 결과
 *
 * @description
 * Validator Agent가 생성
 * Reporter Agent의 입력으로 사용
 */
export interface EventValidationResult {
  /** 프로젝트 ID */
  project_id: string;
  /** 브랜드 ID */
  brand_id: string;
  /** 버전 */
  version: string;
  /** 검증 시점 (ISO 8601) */
  validated_at: string;

  /** 사용된 EventScenarioSpec 버전 */
  spec_version: string;

  /** 시나리오별 결과 */
  scenario_results: ScenarioResult[];

  /** 전체 요약 */
  summary: EventValidationSummary;

  /** 채널별 요약 */
  summary_by_channel: ChannelEventSummary[];

  /** 페이지 타입별 요약 */
  summary_by_page_type: PageTypeEventSummary[];

  /** 심각한 이슈 목록 */
  critical_issues: EventCriticalIssue[];
}

/**
 * 이벤트 검증 요약
 */
export interface EventValidationSummary {
  /** 전체 시나리오 수 */
  total_scenarios: number;
  /** 통과 시나리오 수 */
  passed_scenarios: number;
  /** 실패 시나리오 수 */
  failed_scenarios: number;
  /** 오류 시나리오 수 */
  error_scenarios: number;

  /** 전체 이벤트 수 */
  total_events: number;
  /** 통과 이벤트 수 */
  passed_events: number;
  /** 실패 이벤트 수 */
  failed_events: number;
  /** 누락 이벤트 수 */
  missing_events: number;
  /** 추가 발생 이벤트 수 */
  extra_events: number;

  /** 시나리오 통과율 (%) */
  scenario_pass_rate: number;
  /** 이벤트 통과율 (%) */
  event_pass_rate: number;

  /** 전체 점수 (0-100) */
  overall_score: number;
}

/**
 * 이벤트 검증 결과 확장
 */
export interface EventValidationResultExtended extends EventValidationResult {
  /** 카테고리별 요약 */
  summary_by_category?: Record<EventCategory, EventValidationSummary>;

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

  /** 이벤트 시퀀스 검증 결과 */
  sequence_validation_results?: SequenceValidationResult[];

  /** 이전 검증 결과와 비교 */
  comparison_with_previous?: {
    previous_version: string;
    previous_validated_at: string;
    pass_rate_change: number;
    new_issues_count: number;
    fixed_issues_count: number;
  };
}

/**
 * 이벤트 시퀀스 검증 결과
 */
export interface SequenceValidationResult {
  /** 시퀀스 ID */
  sequence_id: string;
  /** 시퀀스명 */
  sequence_name: string;
  /** 검증 상태 */
  status: QAStatus;
  /** 기대 순서 */
  expected_order: string[];
  /** 실제 순서 */
  actual_order: string[];
  /** 불일치 위치 */
  mismatch_positions?: number[];
  /** 설명 */
  description?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7: Helper Types & Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 시나리오 결과 맵
 */
export type ScenarioResultMap = Map<string, ScenarioResult>;

/**
 * 이벤트별 결과 집계
 */
export type EventResultsByName = Map<string, EventResult[]>;

/**
 * 채널별 실패 시나리오
 */
export type FailedScenariosByChannel = Record<ChannelCombination, ScenarioResult[]>;

/**
 * 이슈 유형별 그룹
 */
export type IssuesByDiscrepancyType = Partial<Record<EventDiscrepancyType, EventCriticalIssue[]>>;

/**
 * 검증 진행 상태
 */
export interface EventValidationProgress {
  /** 전체 시나리오 수 */
  total_scenarios: number;
  /** 완료 시나리오 수 */
  completed_scenarios: number;
  /** 현재 검증 중인 시나리오 */
  current_scenario?: string;
  /** 현재 채널 */
  current_channel?: ChannelCombination;
  /** 진행률 (%) */
  progress_percent: number;
  /** 예상 남은 시간 (초) */
  estimated_remaining_seconds?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 8: Export Formats (내보내기 형식)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Excel 내보내기용 시나리오 결과 행
 */
export interface ScenarioResultExcelRow {
  /** 시나리오명 */
  scenario_name: string;
  /** 페이지 타입 */
  page_type: string;
  /** 채널 */
  channel: string;
  /** 검증 URL */
  url: string;
  /** 상태 */
  status: string;
  /** 통과 이벤트 */
  passed_events: number;
  /** 실패 이벤트 */
  failed_events: number;
  /** 점수 */
  score: number;
  /** 비고 */
  notes: string;
}

/**
 * Excel 내보내기용 이벤트 결과 행
 */
export interface EventResultExcelRow {
  /** 시나리오명 */
  scenario_name: string;
  /** 이벤트명 */
  event_name: string;
  /** 상태 */
  status: string;
  /** 발생 여부 */
  fired: string;
  /** 기대 발생 */
  expected: string;
  /** 발생 시점 (ms) */
  fired_at_ms: string;
  /** 불일치 사유 */
  discrepancy_reason: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 9: Constants
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 시나리오 상태 우선순위 (낮을수록 나쁨)
 */
export const SCENARIO_STATUS_PRIORITY: Record<ScenarioValidationStatus, number> = {
  PASS: 4,
  PARTIAL: 3,
  FAIL: 2,
  ERROR: 1,
};

/**
 * 이벤트 상태 우선순위 (낮을수록 나쁨)
 */
export const EVENT_STATUS_PRIORITY: Record<EventValidationStatus, number> = {
  PASS: 5,
  SKIP: 4,
  FAIL: 3,
  EXTRA: 2,
  MISSING: 1,
};

/**
 * 불일치 유형별 기본 심각도
 */
export const DEFAULT_SEVERITY_BY_DISCREPANCY: Record<EventDiscrepancyType, Severity> = {
  timing: 'MEDIUM',
  sequence: 'MEDIUM',
  duplicate: 'LOW',
  wrong_page: 'HIGH',
  missing_trigger: 'CRITICAL',
  extra_fire: 'HIGH',
};

/**
 * 통과율 기준
 */
export const EVENT_PASS_RATE_THRESHOLDS = {
  EXCELLENT: 95,
  GOOD: 85,
  ACCEPTABLE: 70,
  POOR: 0,
} as const;

/**
 * 이벤트 타이밍 허용 오차 (ms)
 */
export const EVENT_TIMING_TOLERANCE_MS = 500;
