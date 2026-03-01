/**
 * 에이전트 간 수집 데이터 계약 타입 (Collected Data Contract Types)
 *
 * Collector → Validator 간 데이터 계약을 정의합니다.
 * 구현 파일(event-collector.ts, action-collector.ts)에서 추출하여
 * 에이전트 간 결합도를 낮춥니다.
 *
 * @version 1.0
 */

import type { PageTypeEnum, ChannelCombination } from './common';
import type { UserAction } from './event-scenario';

// ─────────────────────────────────────────────────────────────────────
// GA4 Event Types (from event-collector.ts)
// ─────────────────────────────────────────────────────────────────────

/** 파싱된 GA4 파라미터 */
export interface GA4Parameter {
  key: string;    // 원본 키 (예: "ep.page_title")
  field: string;  // 읽기 쉬운 이름 (예: "Event Param: page_title")
  value: string;  // 파라미터 값
  group: string;  // 그룹 (general/event/ecommerce/campaign)
}

/** 상품 파라미터 */
export interface GA4ProductParam {
  index: number;
  id?: string;       // pr[N]id
  name?: string;     // pr[N]nm
  brand?: string;    // pr[N]br
  category?: string; // pr[N]ca
  variant?: string;  // pr[N]va
  price?: string;    // pr[N]pr
  quantity?: string; // pr[N]qt
}

/** 캡처된 GA4 이벤트 */
export interface CapturedGA4Event {
  event_name: string;                    // en 파라미터 값
  timestamp: string;                     // 캡처 시점 ISO
  request_url: string;                   // 전체 요청 URL
  tracking_id: string;                   // tid 값
  parameters: GA4Parameter[];            // 모든 파싱된 파라미터
  raw_params: Record<string, string>;    // 원본 key-value
  // 주요 필드 직접 접근
  document_location?: string;            // dl
  document_title?: string;               // dt
  content_group?: string;                // cg
  user_id?: string;                      // uid
  client_id?: string;                    // cid
  // Ecommerce
  products?: GA4ProductParam[];          // pr[N] 파싱 결과
}

// ─────────────────────────────────────────────────────────────────────
// Scenario Collection Types (from action-collector.ts)
// ─────────────────────────────────────────────────────────────────────

/** 시나리오별 수집 결과 */
export interface ScenarioCollectedData {
  scenario_id: string;
  url: string;
  page_type: PageTypeEnum;
  /** RED 2 수정: string → ChannelCombination (타입 안전성 확보) */
  channel: ChannelCombination;
  /** 비즈니스 레벨 액션 ID (해당 채널의 값, Parser에서 할당) */
  action_id: string;
  /** 페이지 로드 시 캡처된 이벤트 */
  auto_fire_events: CapturedGA4Event[];
  /** 각 액션별 캡처된 이벤트 */
  action_results: ActionCollectionResult[];
  /** 모든 이벤트 (auto + action) */
  all_events: CapturedGA4Event[];
  /** 수집된 content_group 값 (실제) */
  actual_content_group?: string;
  /** 오류 */
  errors: string[];
  collection_duration_ms: number;
}

/** 개별 액션 수집 결과 */
export interface ActionCollectionResult {
  action: UserAction;
  success: boolean;
  events_captured: CapturedGA4Event[];
  error_message?: string;
  duration_ms: number;
}
