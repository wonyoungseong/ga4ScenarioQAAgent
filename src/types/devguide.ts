/**
 * Dev Guide PDF Parse Types
 *
 * 개발가이드 PDF에서 추출한 이벤트별 힌트 데이터.
 * GTM JSON만으로는 알 수 없는 dataLayer event → GA4 event 매핑,
 * 발생 시점, 페이지 타입 추론 등을 제공합니다.
 *
 * @version 1.0
 */

import type { PageTypeEnum } from './common';
import type { UserActionType } from './event-scenario';

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: Dev Guide Event Hint
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 개발가이드 PDF에서 추출한 이벤트 힌트
 *
 * GTM Parser의 CUSTOM_EVENT_PAGE_HINTS를 동적으로 대체/보완합니다.
 */
export interface DevGuideEventHint {
  /** GA4 이벤트명 (page_view, view_item, add_to_cart 등) */
  ga4_event_name: string;
  /** 필수 여부 (Required / Optional) */
  required: boolean;
  /** 이벤트 전송 시점 설명 ("DOM Ready 시점", "상품 상세 페이지 로드 시" 등) */
  fire_timing: string;
  /** dataLayer push 이벤트명 (['product'], ['addcart'], ['ap_page_view']) */
  dataLayer_event_names: string[];
  /** 추론된 페이지 타입 */
  inferred_page_types: PageTypeEnum[];
  /** 사용자 액션 타입 */
  action_type: UserActionType;
  /** 테스트 가능성 */
  testability: 'auto' | 'action' | 'conditional' | 'manual_only';
  /** 실질적 발생 조건 */
  practical_fire: 'auto_fire' | 'user_action' | 'manual_only';
  /** 필수 파라미터 목록 */
  required_params?: string[];
  /** 선택 파라미터 목록 */
  optional_params?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: Parse Output
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 개발가이드 PDF 파싱 결과
 */
export interface DevGuideParseOutput {
  /** 추출된 이벤트 힌트 목록 */
  events: DevGuideEventHint[];
  /** dataLayer event name → GA4 event name 매핑 */
  dataLayer_to_ga4_map: Record<string, string>;
  /** 파싱 경고 */
  warnings: string[];
}
