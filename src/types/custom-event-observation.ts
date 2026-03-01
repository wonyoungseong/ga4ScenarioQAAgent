/**
 * Custom Event Observation Types
 *
 * custom_event는 검수(pass/fail) 대상이 아니지만,
 * 네트워크에 발생했을 때 "언제, 어디서, 어떤 데이터를 보내는지" 관측/기록합니다.
 *
 * @version 1.0
 */

import type { PageTypeEnum } from './common';

// ─────────────────────────────────────────────────────────────────────
// 개별 관측 레코드
// ─────────────────────────────────────────────────────────────────────

/** custom_event 개별 관측 인스턴스 */
export interface CustomEventInstance {
  /** 시나리오 ID (어떤 시나리오 수행 중 관측되었는지) */
  scenario_id: string;
  /** 관측 시점 (ISO 8601) */
  timestamp: string;
  /** 발생한 페이지 URL */
  page_url: string;
  /** 페이지 타입 */
  page_type: PageTypeEnum;
  /** 수집 단계: auto_fire(페이지 로드) vs action(액션 수행 후) */
  capture_phase: 'auto_fire' | 'action';
  /** ep.event_action 값 */
  event_action?: string;
  /** ep.event_category 값 */
  event_category?: string;
  /** ep.event_label 값 */
  event_label?: string;
  /** 전체 파라미터 (raw_params) */
  raw_params: Record<string, string>;
  /** 파라미터 수 */
  parameter_count: number;
}

// ─────────────────────────────────────────────────────────────────────
// 페이지별 집계
// ─────────────────────────────────────────────────────────────────────

/** 페이지별 custom_event 요약 */
export interface CustomEventPageSummary {
  /** 페이지 URL */
  page_url: string;
  /** 페이지 타입 */
  page_type: PageTypeEnum;
  /** 해당 페이지에서 관측된 custom_event 수 */
  count: number;
  /** 고유한 event_action 값 목록 */
  unique_event_actions: string[];
}

// ─────────────────────────────────────────────────────────────────────
// 전체 관측 보고서
// ─────────────────────────────────────────────────────────────────────

/** custom_event 관측 보고서 */
export interface CustomEventObservationReport {
  /** 전체 관측된 custom_event 수 */
  total_observations: number;
  /** 개별 관측 레코드 목록 */
  observations: CustomEventInstance[];
  /** 페이지별 요약 */
  page_summaries: CustomEventPageSummary[];
  /** event_action별 빈도 (action → count) */
  action_frequency: Record<string, number>;
}
