/**
 * begin_checkout 이벤트 지식
 *
 * 결제/주문 프로세스 진입 시 발생.
 * dataLayer event: ^cart$|purchasecartbtn|purchaseprdbtn|purchaseplpbtn|order|orderbtn
 *
 * 핵심 규칙:
 * - CART 페이지: 결제하기/주문하기 버튼 클릭 시
 * - PRODUCT_DETAIL: 바로구매하기 버튼 클릭 시 (event_action: begin_checkout2)
 * - PRODUCT_LIST: 퀵모달에서 바로구매하기 클릭 시
 * - 바로구매하기는 add_to_cart가 아닌 begin_checkout 이벤트
 * - 중복 발생 반드시 체크 (장바구니 진입 + 주문서 로드 + 결제 클릭 = 3~5회 중복 가능)
 *
 * @source 20251028_INNM-JP_IssueList_2차QA_Ver1.xlsx
 * @source QA 도메인 지식 (2026-02-20)
 */

import type { EventScenarioKnowledge } from '../../types/event-scenario-knowledge';

export const BEGIN_CHECKOUT_KNOWLEDGE: EventScenarioKnowledge = {
  event_name: 'begin_checkout',
  should_fire_rules: [
    'CART 페이지: 결제하기/주문하기 버튼 클릭 시 (주문서 페이지로 이동)',
    'PRODUCT_DETAIL: 바로구매하기 버튼 클릭 시 (event_action: begin_checkout2)',
    'PRODUCT_LIST: 퀵모달 내 바로구매하기 버튼 클릭 시 (event_action: begin_checkout2)',
    '주문서 페이지 로드 시',
    '유효성 검사(재고, 배송지 등) 통과 후 실제 결제 프로세스 진입 시점',
  ],
  should_not_fire_rules: [
    '중복으로 여러 번 발생 (모든 과정에서 2~3회 호출)',
    '유효성 검사 실패로 페이지 이동이 무효화된 경우',
    '장바구니 페이지 단순 진입만으로 발생하면 안 됨 (결제하기 클릭이 트리거)',
    '바로구매하기가 아닌 장바구니 담기 버튼 클릭 시 (그건 add_to_cart)',
  ],
  test_scenarios: [
    // ── CART 시나리오 ──
    {
      index: 1,
      scenario: '장바구니 페이지에서 결제하기 버튼 클릭',
      procedure: 'CART 페이지 진입 → 결제하기/주문하기 버튼 클릭',
      should_fire: '결제하기 버튼 클릭 후 주문서 페이지로 이동 시 1회 발생',
      should_not_fire: '장바구니 페이지 단순 진입 시, 유효성 검사 실패 시',
      check_points: 'begin_checkout 1회만 발생 확인, 장바구니 진입 자체로는 미발생, 중복 발생 체크',
      automation: {
        automatable: true,
        action_type: 'click',
        target_selector: '#CartDrawer-Checkout, [id*="CartDrawer"] [name="checkout"], [name="checkout"], #cart-checkout-button',
        scope: 'page_type_specific',
        applicable_page_types: ['CART'],
      },
    },
    // ── PRODUCT_DETAIL 바로구매하기 ──
    {
      index: 2,
      scenario: '상품 상세 페이지에서 바로구매하기 클릭',
      procedure: 'PDP 진입 → 옵션 선택 → 바로구매하기 버튼 클릭 (장바구니 담기 옆에 위치)',
      should_fire: '바로구매하기 클릭 시 begin_checkout 발생 (event_action: begin_checkout2)',
      should_not_fire: '장바구니 담기 버튼 클릭 시 (그건 add_to_cart)',
      check_points: 'begin_checkout2 event_action 확인, add_to_cart와 혼선 없는지 확인, 중복 발생 체크',
      automation: {
        automatable: false,
        skip_reason: '바로구매하기 버튼 셀렉터 사이트별 상이 (수동 테스트)',
      },
    },
    // ── PRODUCT_LIST 바로구매하기 ──
    {
      index: 3,
      scenario: '상품 리스트 퀵모달에서 바로구매하기 클릭',
      procedure: 'PLP 진입 → 상품 카드 → Quick mode 모달 → 바로구매하기 클릭',
      should_fire: '퀵모달 내 바로구매하기 클릭 시 begin_checkout 발생',
      should_not_fire: '퀵모달 내 장바구니 담기 클릭 시 (그건 add_to_cart)',
      check_points: 'PLP 퀵모달에서도 begin_checkout / add_to_cart 구분 정확한지 확인',
      automation: {
        automatable: false,
        skip_reason: '퀵모달 오픈 → 바로구매하기 멀티스텝 (수동 테스트)',
      },
    },
    // ── 중복 발생 검증 ──
    {
      index: 4,
      scenario: '전체 결제 플로우 중복 발생 체크',
      procedure: 'PLP → 장바구니 담기 → CART 페이지 → 결제하기 → 주문서 → 결제 완료 전체 플로우',
      should_fire: '결제 프로세스 진입 시점에서만 발생',
      should_not_fire: '장바구니 진입 + 주문서 로드 + 결제 클릭에서 각각 중복 발생 (총 3~5회)',
      check_points: '전체 플로우에서 begin_checkout 총 발생 횟수 확인. 단계별 1회씩만 발생하는지 또는 한 단계에서 2회 이상 발생하는지',
      automation: {
        automatable: false,
        skip_reason: '전체 결제 플로우 멀티스텝 (수동 테스트)',
      },
    },
  ],
  check_points: [
    // ── 바로구매하기 연계 ──
    '바로구매하기 = begin_checkout (event_action: begin_checkout2). add_to_cart가 아님',
    '장바구니 담기 버튼과 바로구매하기 버튼이 나란히 있는 추세 → 각각 올바른 이벤트 발생 확인',
    'PDP, PLP 퀵모달 모두에서 바로구매하기 가능 → 모든 위치에서 begin_checkout 확인',
    // ── 중복 발생 체크 ──
    '한 단계에서 2회 이상 이벤트가 발생하면 오류',
    '장바구니 진입, 주문서 로드, 결제 클릭 모두 begin_checkout로 처리되어 총 3~5회 중복 발생 가능',
    '웹/앱 분기: iOS/Android WebView로 주문서 열 때 Web에서 또 한 번 이벤트 발생하는 이중 호출',
  ],
};
