/**
 * GA4 QA 종합 리포트 타입 정의 (Comprehensive QA Report Types)
 *
 * 멀티채널 병합 리포트 생성을 위한 타입 계약.
 * GTM Parser 출력 + 채널별 EventValidationResult → 종합 Excel 리포트
 *
 * @version 1.0
 */

import type { ChannelCombination } from './common';
import type { EventValidationResult } from './event-validation-result';
import type { GTMParserOutput } from './content-group';

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: Multi-Channel Merge Data
// ═══════════════════════════════════════════════════════════════════════════

/** 멀티채널 병합 데이터 */
export interface MultiChannelEventResult {
  /** 채널별 검증 결과 */
  channel_results: Partial<Record<ChannelCombination, EventValidationResult>>;
  /** GTM Parser 출력 (정답지) */
  parser_output: GTMParserOutput;
  /** scenario_spec.events에서 동적 추출된 전체 이벤트 리스트 */
  all_event_names: string[];
  /** 각 채널별 테스트 대상 이벤트 (채널마다 다를 수 있음) */
  events_by_channel: Partial<Record<ChannelCombination, string[]>>;
  /** 각 채널별 테스트 URL 목록 */
  urls_by_channel: Partial<Record<ChannelCombination, string[]>>;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: Overview Tab Types
// ═══════════════════════════════════════════════════════════════════════════

/** Overview 탭 셀 상태 */
export type OverviewCellStatus = 'O' | '△' | 'X' | '';

/** Overview 탭 행 */
export interface OverviewEventRow {
  /** 이벤트명 */
  event_name: string;
  /** 채널별 상태 (동적 키) */
  channel_statuses: Partial<Record<ChannelCombination, OverviewCellStatus>>;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: Review Tab Types
// ═══════════════════════════════════════════════════════════════════════════

/** Review 탭 행 */
export interface ReviewRow {
  /** 이벤트명 */
  event_name: string;
  /** PM용 현황 요약 */
  status_summary: string;
  /** 개발자용 현재 상태 (GTM 트리거 조건 분석) */
  as_is: string;
  /** 개발자용 수정 가이드 */
  to_be: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: Event Detail Tab Types (14 columns)
// ═══════════════════════════════════════════════════════════════════════════

/** 이벤트 상세 탭 행 (14컬럼) */
export interface EventDetailRow {
  /** 검증일 */
  date: string;
  /** 시나리오 액션 ID (A001, A002, ...) */
  scenario_action_id: string;
  /** 시나리오 이벤트 ID (E001-1, E001-2, ...) */
  scenario_event_id: string;
  /** 시나리오명 */
  scenario: string;
  /** 페이지 경로 */
  page_path: string;
  /** 디바이스 */
  device: string;
  /** 로그인 조건 */
  login_condition: string;
  /** 시나리오 상세 (액션 설명) */
  scenario_detail: string;
  /** 기대 발생 여부 */
  expected_fire: '발생' | '미발생';
  /** 실제 발생 여부 */
  actual_fire: '발생' | '미발생';
  /** 정상/이슈 판정 */
  normal_or_issue: '정상' | '이슈';
  /** 이슈 증상 (이슈일 때만) */
  symptom: string;
  /** As-Is (이슈일 때만) */
  as_is: string;
  /** To-Be (이슈일 때만) */
  to_be: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: Trigger Condition Trace (As-Is/To-Be 생성용)
// ═══════════════════════════════════════════════════════════════════════════

/** 트리거 조건 추적 */
export interface TriggerConditionTrace {
  /** 이벤트명 */
  event_name: string;
  /** GTM 태그명 */
  tag_name: string;
  /** GTM 태그 ID */
  tag_id: string;
  /** 트리거 타입 */
  trigger_type: string;
  /** 필터 조건 목록 */
  filter_conditions: FilterConditionDetail[];
  /** Custom Event 필터 (있는 경우) */
  custom_event_filter?: string;
  /** Content Group 필터 (있는 경우) */
  content_group_filter?: string;
  /** 변수 체인 해석 결과 */
  variable_chain: VariableResolutionStep[];
}

/** 필터 조건 상세 */
export interface FilterConditionDetail {
  /** 조건 타입 (CONTAINS, EQUALS, MATCH_REGEX 등) */
  type: string;
  /** 변수 참조 ({{Content Group}} 등) */
  variable: string;
  /** 비교 값 */
  value: string;
  /** 부정 조건 여부 (GTM parameter 내 negate=true) */
  negate: boolean;
  /** 사람이 읽을 수 있는 설명 */
  human_readable: string;
}

/** 변수 해석 단계 */
export interface VariableResolutionStep {
  /** GTM 변수명 */
  variable_name: string;
  /** 변수 타입 (jsm, v, j, c 등) */
  variable_type: string;
  /** 해석 결과 */
  resolves_to: string;
  /** 최종 소스 (예: dataLayer.AP_DATA_PAGETYPE) */
  final_source?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: Channel × URL Matrix Tab Types
// ═══════════════════════════════════════════════════════════════════════════

/** 채널 탭 셀 상태 */
export type ChannelTabCellStatus = 'O' | 'X' | '-';

/** 채널 탭 행 */
export interface ChannelTabRow {
  /** 페이지 경로 */
  page_path: string;
  /** 이벤트별 상태 (동적 키) */
  event_statuses: Record<string, ChannelTabCellStatus>;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7: Helper Types
// ═══════════════════════════════════════════════════════════════════════════

/** 채널 정보 파싱 결과 */
export interface ParsedChannel {
  device: string;
  login_condition: string;
  display_name: string;
}

/** 이슈 증상 그룹핑 결과 (Review 탭 현황 생성용) */
export interface SymptomGroup {
  /** 그룹 패턴 설명 */
  pattern: string;
  /** 해당 행 수 */
  count: number;
  /** 대표 URL 목록 */
  urls: string[];
}

/** Scenario ID 생성 결과 */
export interface ScenarioIds {
  action_id: string;
  event_id: string;
}
