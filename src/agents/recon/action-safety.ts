/**
 * Action Safety - 이벤트별 안전 레벨 정의
 *
 * Trial click 실행 가능 여부를 결정합니다:
 * - safe: 자동 trial click 허용, 이벤트 발생 확인 후 뒤로가기
 * - cautious: 사용자 승인 시에만 trial click (상태 변경 가능)
 * - destructive: trial click 절대 금지, 셀렉터만 발견
 */

import type { ActionSafetyLevel } from '../../types/recon';

// ─────────────────────────────────────────────────────────────────────
// 이벤트별 안전 레벨 매핑
// ─────────────────────────────────────────────────────────────────────

/**
 * 이벤트별 안전 레벨.
 *
 * safe: trial click 가능, 부작용 없거나 뒤로가기로 복구 가능
 * cautious: trial click 시 주의, 상태 변경 가능 (장바구니 추가/삭제 등)
 * destructive: trial click 금지, 비가역적 (결제, 회원가입 등)
 */
export const ACTION_SAFETY_LEVELS: Record<string, ActionSafetyLevel> = {
  // ── Safe: trial click 가능, 부작용 없음 ──
  select_item: 'safe',         // 상품 상세 이동 (뒤로가기 가능)
  select_promotion: 'safe',    // 배너 클릭 (뒤로가기 가능)
  view_promotion: 'safe',      // 스크롤로 노출 (부작용 없음)
  view_item: 'safe',           // 상품 노출 (부작용 없음)
  view_item_list: 'safe',      // 상품 리스트 노출
  view_search_results: 'safe', // 검색 결과 노출
  search: 'safe',              // 검색 실행

  // ── Cautious: trial click 시 주의, 상태 변경 가능 ──
  add_to_cart: 'cautious',         // 장바구니에 추가됨
  remove_from_cart: 'cautious',    // 장바구니에서 제거됨
  add_to_wishlist: 'cautious',     // 위시리스트에 추가됨
  add_shipping_info: 'cautious',   // 배송 정보 입력
  add_payment_info: 'cautious',    // 결제 정보 입력

  // ── Destructive: trial click 금지, 비가역적 ──
  begin_checkout: 'destructive',   // 결제 프로세스 시작
  purchase: 'destructive',         // 결제 완료
  sign_up: 'destructive',          // 회원가입
  login: 'destructive',            // 로그인
  refund: 'destructive',           // 환불
  write_review: 'destructive',     // 리뷰 작성 (데이터 생성)
};

/**
 * 이벤트의 안전 레벨을 반환합니다.
 * 알 수 없는 이벤트는 cautious (보수적)으로 분류합니다.
 */
export function getActionSafetyLevel(eventName: string): ActionSafetyLevel {
  return ACTION_SAFETY_LEVELS[eventName] ?? 'cautious';
}

/**
 * Trial click 가능 여부를 반환합니다.
 *
 * @param eventName - GA4 이벤트명
 * @param userApproved - 사용자가 cautious 이벤트의 trial click을 승인했는지
 * @returns trial click 가능하면 true
 */
export function canTrialClick(eventName: string, userApproved: boolean = false): boolean {
  const level = getActionSafetyLevel(eventName);

  switch (level) {
    case 'safe':
      return true;
    case 'cautious':
      return userApproved;
    case 'destructive':
      return false;
  }
}

/**
 * 안전 레벨별 설명 텍스트를 반환합니다.
 */
export function getSafetyDescription(level: ActionSafetyLevel): string {
  switch (level) {
    case 'safe':
      return '자동 trial click 허용 (부작용 없음, 뒤로가기로 복구 가능)';
    case 'cautious':
      return '사용자 승인 필요 (상태 변경 가능: 장바구니 추가/삭제 등)';
    case 'destructive':
      return 'trial click 금지 (비가역적: 결제, 회원가입 등)';
  }
}

/**
 * 안전 레벨별 아이콘을 반환합니다.
 */
export function getSafetyIcon(level: ActionSafetyLevel): string {
  switch (level) {
    case 'safe':
      return '✅';
    case 'cautious':
      return '⚠️';
    case 'destructive':
      return '🚫';
  }
}
