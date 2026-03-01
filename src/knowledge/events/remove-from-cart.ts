/**
 * remove_from_cart 이벤트 지식
 *
 * 장바구니에서 상품 삭제 시 발생.
 * dataLayer event: removeCart
 *
 * 핵심 규칙:
 * - CART 페이지에서만 발생 (장바구니 페이지)
 * - 삭제 방식: 개별 삭제(X 버튼), 선택 삭제, 전체 삭제
 * - 삭제 버튼 클릭 시점이 아닌 삭제 성공 후 발생
 * - 삭제 확인 팝업에서 취소하면 미발생
 * - removal_type: partial(부분) / all(전체)로 구분
 * - 퍼널 이탈 이벤트: add_to_cart → view_cart → remove_from_cart (이탈)
 * - 삭제 상품의 item 파라미터가 add_to_cart/view_cart과 일치해야 함
 *
 * @source 20251028_INNM-JP_IssueList_2차QA_Ver1.xlsx
 * @source remove_from_cart.yaml 스펙 + 가이드 문서
 * @source QA 도메인 지식 (2026-03-01)
 */

import type { EventScenarioKnowledge } from '../../types/event-scenario-knowledge';

export const REMOVE_FROM_CART_KNOWLEDGE: EventScenarioKnowledge = {
  event_name: 'remove_from_cart',
  should_fire_rules: [
    'CART 페이지: 개별 상품 삭제 버튼(X 아이콘, 휴지통 아이콘) 클릭 후 삭제 성공 시',
    'CART 페이지: 체크박스 선택 후 "선택 삭제" 버튼 클릭 → 삭제 성공 시',
    'CART 페이지: "전체 삭제" / "장바구니 비우기" 버튼 클릭 → 삭제 성공 시',
    '삭제 확인 팝업에서 "확인" 클릭 후 실제 삭제 완료 시점에 발생',
    '스와이프/슬라이드 삭제 UI 지원 시 삭제 성공 시에도 발생 (Mobile 스와이프, PC 슬라이드 모두 포함)',
    '비로그인 장바구니에서도 삭제 시 동일하게 발생',
  ],
  should_not_fire_rules: [
    '삭제 버튼 클릭 시점에 발생 (삭제 성공 전에 발생하면 오류)',
    '삭제 확인 팝업에서 "취소" 클릭 시 미발생',
    '삭제 실패 (서버 에러) 시 미발생',
    '수량 감소 (quantity 1→0 제외)는 삭제가 아님 → 미발생',
    '장바구니 페이지 단순 진입/조회 시 미발생 (그건 view_cart)',
    '장바구니 담기(add_to_cart), 결제하기(begin_checkout) 클릭 시 미발생',
    '동일 삭제 동작에서 removeCart dataLayer push가 2회 이상 중복 발생',
  ],
  test_scenarios: [
    // ── 개별 삭제 시나리오 ──
    {
      index: 1,
      scenario: '개별 상품 삭제 (X 버튼 클릭)',
      procedure: 'CART 페이지 진입 → 상품 행 우측 X/휴지통 아이콘 클릭 → 삭제 확인 → 완료',
      should_fire: '삭제 성공 후 remove_from_cart 1회 발생, items에 해당 상품 1건 포함',
      should_not_fire: '삭제 확인 팝업에서 취소 시, 삭제 실패(서버 에러) 시',
      check_points: 'removeCart dataLayer push 1회 확인, items 배열에 삭제 상품 정보(item_id, item_name, price, quantity) 정확성, removal_type: partial',
      automation: {
        automatable: true,
        action_type: 'click',
        target_selector: '.cart-item__remove, [data-cart-remove], button[aria-label*="remove"], .remove-btn, .btn-delete',
        scope: 'page_type_specific',
        applicable_page_types: ['CART'],
      },
    },
    {
      index: 2,
      scenario: '개별 삭제 후 중복 발생 체크',
      procedure: 'CART 페이지 → 상품 삭제 버튼 1회 클릭 → removeCart push 횟수 확인',
      should_fire: '1회 클릭에 1회만 발생',
      should_not_fire: '1회 삭제에 2회 이상 중복 발생',
      check_points: 'removeCart dataLayer push 횟수 정밀 확인. 비동기 API 호출 시 콜백 중복으로 2회 push되는 사례 주의',
      automation: {
        automatable: false,
        skip_reason: 'dataLayer push 횟수 정밀 확인 필요 (수동 테스트)',
      },
    },
    // ── 선택 삭제 시나리오 ──
    {
      index: 3,
      scenario: '선택 삭제 (체크박스 → 선택 삭제 버튼)',
      procedure: 'CART 페이지 → 상품 2~3개 체크박스 선택 → "선택 삭제" 버튼 클릭 → 확인',
      should_fire: '선택한 모든 상품이 items 배열에 포함된 remove_from_cart 1회 발생',
      should_not_fire: '선택하지 않은 상품이 items에 포함되는 경우, 선택 삭제를 상품 개수만큼 개별 이벤트로 발생',
      check_points: '선택 삭제 시 items 배열에 체크한 모든 상품 포함 여부 확인, removal_type: partial, 이벤트 1회 발생 (상품 수만큼 여러 번 아님)',
      automation: {
        automatable: false,
        skip_reason: '체크박스 다중 선택 → 선택 삭제 멀티스텝 (수동 테스트)',
      },
    },
    // ── 전체 삭제 시나리오 ──
    {
      index: 4,
      scenario: '전체 삭제 (장바구니 비우기)',
      procedure: 'CART 페이지 → "전체 삭제" 또는 "장바구니 비우기" 버튼 클릭 → 확인',
      should_fire: '장바구니 내 모든 상품이 items 배열에 포함된 remove_from_cart 1회 발생',
      should_not_fire: '일부 상품만 items에 포함 (전체 삭제인데 누락)',
      check_points: 'removal_type: all, items 배열에 장바구니 전체 상품 포함, 상품 수와 items 배열 길이 일치',
      automation: {
        automatable: false,
        skip_reason: '전체 삭제 후 장바구니 비어있는 상태 복구 필요 (수동 테스트)',
      },
    },
    // ── 삭제 취소 시나리오 ──
    {
      index: 5,
      scenario: '삭제 확인 팝업에서 취소',
      procedure: 'CART 페이지 → 삭제 버튼 클릭 → 확인 팝업에서 "취소" 클릭',
      should_fire: '이 시나리오에서는 발생하면 안 됨',
      should_not_fire: '삭제 취소 시 remove_from_cart 미발생이 정상. 버튼 클릭 시점에 이벤트가 먼저 발생하면 개발 오류',
      check_points: '취소 시 removeCart dataLayer push 미발생 확인. 버튼 클릭 → 이벤트 발생 → 팝업 표시 순서이면 오류 (성공 콜백에서 push 해야 함)',
      automation: {
        automatable: false,
        skip_reason: '확인 팝업 취소 시나리오 (수동 테스트)',
      },
    },
    // ── 퍼널 일관성 검증 ──
    {
      index: 6,
      scenario: '삭제 상품의 퍼널 데이터 일관성 검증',
      procedure: 'PDP → add_to_cart → CART → 해당 상품 삭제 → remove_from_cart items 비교',
      should_fire: 'remove_from_cart의 item_id, item_name, price가 add_to_cart/view_cart와 일치',
      should_not_fire: '삭제 상품의 파라미터가 장바구니 담기 시점과 불일치',
      check_points: 'item_id 일치, item_name 일치, price 일치. 수량 변경 후 삭제 시 quantity 반영 확인. 옵션 변경 후 삭제 시 item_variant 일치 확인',
      automation: {
        automatable: false,
        skip_reason: '전체 퍼널 플로우 멀티스텝 + 파라미터 크로스체크 (수동 테스트)',
      },
    },
    // ── 스와이프/슬라이드 삭제 ──
    {
      index: 7,
      scenario: '스와이프/슬라이드 삭제 (Mobile + PC)',
      procedure: 'CART 페이지 → 상품 행을 스와이프(Mobile) 또는 슬라이드(PC) → 삭제 버튼 노출 → 삭제 실행',
      should_fire: '스와이프/슬라이드 삭제 성공 시 remove_from_cart 발생 (플랫폼 무관)',
      should_not_fire: '스와이프/슬라이드만 하고 삭제 버튼을 클릭하지 않은 상태',
      check_points: '스와이프/슬라이드 UI 지원 시 Mobile/PC 모두에서 동일하게 removeCart dataLayer push 발생 확인',
      automation: {
        automatable: false,
        skip_reason: '스와이프/슬라이드 제스처 제어 필요 (수동 테스트)',
      },
    },
  ],
  check_points: [
    // ── 발생 시점 ──
    '삭제 버튼 클릭 시점이 아닌 삭제 성공(API 응답) 후 발생. 클릭 시 즉시 발생하면 오류',
    '삭제 확인 팝업에서 취소해도 이벤트가 발생하면 → 성공 콜백이 아닌 클릭 핸들러에서 push한 것',
    // ── 삭제 방식별 검증 ──
    '개별 삭제: 해당 상품 1건만 items에 포함, removal_type: partial',
    '선택 삭제: 체크한 모든 상품이 items에 포함, removal_type: partial',
    '전체 삭제: 장바구니 전체 상품이 items에 포함, removal_type: all',
    '모든 삭제 방식에서 일관된 데이터 수집 (개별만 되고 선택/전체 누락되면 구현 오류)',
    // ── 중복 발생 체크 ──
    '1회 삭제 동작에 removeCart dataLayer push 1회만 발생. 비동기 콜백 중복 주의',
    // ── 퍼널 일관성 ──
    '삭제 상품의 item_id, item_name, price가 add_to_cart/view_cart 시점과 일치해야 함',
    '수량 변경 후 삭제 시 변경된 quantity 반영 확인',
    // ── 환경별 ──
    '스와이프/슬라이드 삭제: Mobile 스와이프, PC 슬라이드 모두에서 이벤트 발생 확인 (플랫폼 무관)',
    'PC: 호버 시 나타나는 삭제 버튼 클릭 테스트',
    '비로그인 장바구니에서 삭제 시에도 이벤트 발생 확인',
  ],
};
