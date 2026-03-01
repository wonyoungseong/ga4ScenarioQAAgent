/**
 * add_to_cart 이벤트 지식
 *
 * 장바구니 담기 버튼 클릭 시 발생.
 * dataLayer event: addcart
 *
 * 핵심 규칙:
 * - PRODUCT_DETAIL: 반드시 장바구니 버튼 존재 (기본 시나리오)
 * - PRODUCT_LIST / MAIN: 마우스 호버 → 퀵추가 탭 또는 Quick mode 모달로 장바구니 추가 가능
 * - 상품이 설명되어 있는 페이지라면 장바구니 담기 이벤트 존재 확률 매우 높음
 * - Quick mode 모달: 상품 카드 아래 모달이 열려서 장바구니 추가
 * - 바로구매하기: add_to_cart 옆에 존재, begin_checkout (event_action: begin_checkout2) 발생
 * - 중복 발생 반드시 체크
 *
 * @source 20251028_INNM-JP_IssueList_2차QA_Ver1.xlsx
 * @source innisfree.jp 크롤링 결과 + QA 도메인 지식 (2026-02-20)
 */

import type { EventScenarioKnowledge } from '../../types/event-scenario-knowledge';

export const ADD_TO_CART_KNOWLEDGE: EventScenarioKnowledge = {
  event_name: 'add_to_cart',
  should_fire_rules: [
    '장바구니에 상품을 담는 요청이 성공적으로 처리된 직후 1회 발생',
    'PRODUCT_DETAIL: 상품 상세 페이지의 장바구니 담기 버튼 클릭 시 (필수 존재)',
    'PRODUCT_LIST: 상품 리스트에서 마우스 호버 → 퀵추가 탭 클릭 시',
    'PRODUCT_LIST: Quick mode 모달 → 모달 내 장바구니 담기 버튼 클릭 시',
    'MAIN/기타: 상품이 설명되어 있는 페이지라면 장바구니 담기 이벤트 존재 확률 높음 (호버/퀵모달)',
    '유효성 검사(재고, 옵션 선택 등) 통과 후 실제 장바구니에 추가된 시점',
  ],
  should_not_fire_rules: [
    '장바구니 담기를 시도했으나 옵션 미선택, 재고 부족 등으로 실패한 경우',
    '장바구니 페이지에 단순 진입했을 때 (장바구니 조회 ≠ 장바구니 담기)',
    '동일 상품 장바구니 담기 시 중복 발생 (1회만 발생이 정상)',
    '바로구매하기 버튼 클릭 시 → add_to_cart가 아닌 begin_checkout 이벤트 발생',
  ],
  test_scenarios: [
    // ── PRODUCT_DETAIL 시나리오 ──
    {
      index: 1,
      scenario: '상품 상세 페이지에서 장바구니 담기',
      procedure: 'PDP 진입 → 옵션 선택 → 장바구니 담기 버튼 클릭',
      should_fire: '장바구니 담기 성공 시 add_to_cart 1회 발생',
      should_not_fire: '옵션 미선택 또는 재고 부족으로 실패 시',
      check_points: 'addcart dataLayer push 1회 확인, 중복 발생 여부 체크, 상품 정보 파라미터 정확성',
      automation: {
        automatable: true,
        action_type: 'click',
        target_selector: '[id^="ProductSubmitButton-template--"][id*="product-template"], .product-form__submit, #AddToCart, button[name="add"]',
        scope: 'page_type_specific',
        applicable_page_types: ['PRODUCT_DETAIL'],
      },
    },
    {
      index: 2,
      scenario: '상품 상세 페이지에서 중복 클릭 시 중복 발생 체크',
      procedure: 'PDP 진입 → 장바구니 담기 버튼 빠르게 2회 연속 클릭',
      should_fire: '첫 번째 클릭에서 1회만 발생',
      should_not_fire: '2회 이상 중복 발생',
      check_points: '빠른 연속 클릭 시 addcart dataLayer push 횟수 확인 (1회만 정상)',
      automation: {
        automatable: false,
        skip_reason: '더블클릭 타이밍 제어 필요 (수동 테스트)',
      },
    },
    // ── PRODUCT_LIST 시나리오 ──
    {
      index: 3,
      scenario: '상품 리스트에서 호버 → 퀵추가 탭으로 장바구니 담기',
      procedure: 'PLP 진입 → 상품 카드 마우스 호버 → 퀵추가 탭/버튼 클릭',
      should_fire: '호버 후 퀵추가 버튼 클릭으로 장바구니 담기 성공 시',
      should_not_fire: '호버만 하고 클릭하지 않은 상태',
      check_points: '호버 → 퀵추가 동작에서 add_to_cart 1회 발생, PLP에서도 상품 파라미터 정확성',
      automation: {
        automatable: true,
        action_type: 'click',
        target_selector: '[id^="ProductSubmitButton-quickadd-template--"], quick-add-modal [name="add"], .quick-add__submit',
        scope: 'page_type_specific',
        applicable_page_types: ['PRODUCT_LIST'],
      },
    },
    {
      index: 4,
      scenario: 'Quick mode 모달에서 장바구니 담기',
      procedure: 'PLP 진입 → 상품 카드 클릭 → Quick mode 모달 열림 → 모달 내 장바구니 담기 버튼 클릭',
      should_fire: '모달 내 장바구니 담기 버튼 클릭 후 성공 시',
      should_not_fire: '모달만 열고 장바구니 담기를 클릭하지 않은 상태',
      check_points: '모달 내 add_to_cart 이벤트 발생 확인, 모달 열기 자체로는 미발생, 중복 발생 체크',
      automation: {
        automatable: false,
        skip_reason: '모달 오픈 → 모달 내 버튼 클릭 멀티스텝 (수동 테스트)',
      },
    },
    // ── MAIN / 기타 페이지 시나리오 ──
    {
      index: 5,
      scenario: 'MAIN 또는 기타 페이지에서 상품 영역 퀵추가',
      procedure: 'MAIN 페이지 → 상품 추천/베스트 영역 → 호버 또는 퀵추가 버튼 클릭',
      should_fire: '상품이 노출되는 영역에서 퀵추가 성공 시',
      should_not_fire: '상품 영역이 없는 페이지에서 발생',
      check_points: 'MAIN에서도 상품 설명이 있으면 장바구니 담기 가능. 개발자가 addcart push를 삽입했는지 확인',
      automation: {
        automatable: false,
        skip_reason: 'MAIN 상품 영역 위치가 사이트마다 다름 (Recon + 수동 검증)',
      },
    },
    // ── 바로구매하기 연계 시나리오 ──
    {
      index: 6,
      scenario: '바로구매하기 버튼 클릭 시 이벤트 구분 확인',
      procedure: 'PDP 진입 → 바로구매하기 버튼 클릭 (장바구니 담기 옆에 위치)',
      should_fire: '바로구매하기는 add_to_cart가 아닌 begin_checkout 이벤트 발생 (event_action: begin_checkout2)',
      should_not_fire: '바로구매하기 클릭 시 add_to_cart가 발생하면 오류',
      check_points: '바로구매하기 → begin_checkout(begin_checkout2) 발생 확인, add_to_cart 미발생 확인. 두 이벤트 혼선 주의',
      automation: {
        automatable: false,
        skip_reason: '바로구매하기 버튼 셀렉터 사이트별 상이 (수동 테스트)',
      },
    },
    // ── 실패 케이스 ──
    {
      index: 7,
      scenario: '옵션 미선택 시 장바구니 담기 실패',
      procedure: 'PDP 진입 → 옵션 선택 안 함 → 장바구니 담기 클릭',
      should_fire: '이 시나리오에서는 발생하면 안 됨',
      should_not_fire: '유효성 검사 실패(옵션 미선택, 재고 부족) 시 add_to_cart 미발생이 정상',
      check_points: '유효성 검사 실패인데 add_to_cart 발생 시 → 개발 오류. 버튼 클릭 시점이 아닌 API 응답 성공 시점에 이벤트 발생해야 함',
      automation: {
        automatable: false,
        skip_reason: '옵션 미선택 상태 조건 제어 필요 (수동 테스트)',
      },
    },
  ],
  check_points: [
    // ── 발생 위치 ──
    'PRODUCT_DETAIL: 장바구니 담기 버튼 반드시 존재 (기본 시나리오)',
    'PRODUCT_LIST / MAIN: 호버 → 퀵추가 탭, Quick mode 모달로 장바구니 담기 가능',
    '상품이 설명되어 있는 페이지라면 장바구니 담기 이벤트 존재 확률 매우 높음',
    // ── 중복 발생 체크 ──
    '중복 발생 반드시 체크: 장바구니 담기 1회 클릭에 addcart dataLayer push 1회만 발생해야 함',
    '빠른 연속 클릭, 네트워크 지연 등으로 중복 전송되는지 확인',
    'iOS/Android: 비동기 API 호출 처리 시 버튼 탭 → 응답 시점 구분 못해 중복 전송',
    // ── 바로구매하기 연계 ──
    '바로구매하기 버튼: add_to_cart가 아닌 begin_checkout (event_action: begin_checkout2) 발생. 혼선 주의',
    '장바구니 담기 버튼과 바로구매하기 버튼이 나란히 있는 추세 → 각각 올바른 이벤트 발생 확인',
    // ── 실패 케이스 ──
    '유효성 검사 실패(옵션 미선택, 재고 부족)에서도 이벤트 발생하면 개발 오류',
    '장바구니 페이지 단순 진입 시 add_to_cart 발생하면 오류 (장바구니 조회 ≠ 장바구니 담기)',
  ],
};
