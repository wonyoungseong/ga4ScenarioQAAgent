/**
 * select_item 이벤트 지식
 *
 * 상품 리스트에서 특정 상품을 클릭하여 상세 페이지로 이동할 때 발생.
 * dataLayer event: select_item
 *
 * 핵심 규칙:
 * - PRODUCT_LIST, SEARCH 페이지 타입에서만 발생 (퍼널: view_item_list → select_item → view_item)
 * - 무한 스크롤로 새로 로딩된 상품 클릭 시에도 발생
 * - 페이지네이션으로 다른 페이지 이동 후 상품 클릭 시에도 발생
 * - PDP 방문 후 뒤로가기로 돌아와서 다시 클릭해도 발생
 * - preventDefault()로 beacon 유실 방지 후 페이지 이동 (LESSON-2)
 * - MAIN, EVENT_DETAIL 등 비 PLP/SEARCH 페이지에서는 미발생
 *
 * @source 20251028_INNM-JP_IssueList_2차QA_Ver1.xlsx
 * @source QA 도메인 지식 (2026-02-20)
 */

import type { EventScenarioKnowledge } from '../../types/event-scenario-knowledge';

export const SELECT_ITEM_KNOWLEDGE: EventScenarioKnowledge = {
  event_name: 'select_item',
  should_fire_rules: [
    'PRODUCT_LIST 페이지: 카테고리/브랜드 목록에서 상품 카드 클릭 시',
    'SEARCH 페이지: 검색 결과 리스트에서 상품 카드 클릭 시',
    '무한 스크롤로 추가 로딩된 상품을 클릭해도 발생 (동적 로딩 후에도 이벤트 바인딩 유지)',
    '페이지네이션으로 다른 페이지 이동 후 상품 클릭 시에도 발생',
    'PDP 방문 후 뒤로가기(back)로 리스트 복귀 → 다른 상품 클릭 시에도 발생',
    '퍼널 순서: view_item_list → select_item → view_item (상품 리스트 노출 → 클릭 → 상세 진입)',
  ],
  should_not_fire_rules: [
    'MAIN 페이지: 상품 추천/베스트 영역에서 상품 클릭 시 미발생 (PLP/SEARCH만 대상)',
    'EVENT_DETAIL, PRODUCT_DETAIL 등 비 PLP/SEARCH 페이지에서 미발생',
    '상품 리스트 로드 시점에 자동 발생하면 안 됨 (그건 view_item_list)',
    '상품 영역이 아닌 필터, 정렬, 카테고리 탭 등 UI 요소 클릭 시 미발생',
    '한 번의 클릭으로 2회 이상 중복 발생하면 안 됨',
    '장바구니 담기(퀵추가) 버튼 클릭 시 미발생 (그건 add_to_cart)',
  ],
  test_scenarios: [
    // ── PRODUCT_LIST 기본 시나리오 ──
    {
      index: 1,
      scenario: '카테고리/브랜드 목록에서 상품 클릭',
      procedure: 'PRODUCT_LIST 페이지 진입 → 상품 카드(이미지/제목) 클릭',
      should_fire: '상품 클릭 시 select_item 1회 발생 후 PDP로 이동',
      should_not_fire: '상품 영역 외 클릭(필터, 정렬 등) 시 미발생',
      check_points: 'select_item 1회 발생 확인, preventDefault()로 beacon 유실 방지 후 이동, 상품 파라미터(item_id, item_name 등) 정확성',
      automation: {
        automatable: true,
        action_type: 'click',
        target_selector: '.product-card a, .product-item a, [data-product-id] a, .grid-product a',
        scope: 'page_type_specific',
        applicable_page_types: ['PRODUCT_LIST'],
      },
    },
    // ── SEARCH 시나리오 ──
    {
      index: 2,
      scenario: '검색 결과에서 상품 클릭',
      procedure: 'SEARCH 페이지 진입 (키워드 검색 후) → 검색 결과 상품 카드 클릭',
      should_fire: '검색 결과 상품 클릭 시 select_item 1회 발생',
      should_not_fire: '검색 결과 0건일 때, 검색어 추천 영역 클릭 시',
      check_points: 'SEARCH에서도 select_item 정상 발생 확인, view_item_list + select_item 퍼널 순서 준수',
      automation: {
        automatable: true,
        action_type: 'click',
        target_selector: '.product-card a, .product-item a, [data-product-id] a, .grid-product a',
        scope: 'page_type_specific',
        applicable_page_types: ['SEARCH'],
      },
    },
    // ── 무한 스크롤 시나리오 ──
    {
      index: 3,
      scenario: '무한 스크롤로 추가 로딩된 상품 클릭',
      procedure: 'PRODUCT_LIST 진입 → 스크롤 다운하여 추가 상품 로딩 → 새로 로딩된 상품 카드 클릭',
      should_fire: '무한 스크롤로 동적 로딩된 상품도 클릭 시 select_item 발생',
      should_not_fire: '스크롤 다운 자체로는 미발생 (추가 로딩 = view_item_list 재발생 여부는 별도 검증)',
      check_points: '동적 로딩 후 이벤트 바인딩 유지 여부 확인. lazy-load된 상품에서도 select_item 정상 발생하는지 검증',
      automation: {
        automatable: false,
        skip_reason: '무한 스크롤 트리거 후 동적 로딩 대기 필요 (수동 테스트)',
      },
    },
    // ── 페이지네이션 시나리오 ──
    {
      index: 4,
      scenario: '페이지네이션 이동 후 상품 클릭',
      procedure: 'PRODUCT_LIST 진입 → 2페이지 또는 다음 페이지 클릭 → 새 페이지의 상품 카드 클릭',
      should_fire: '페이지 이동 후 상품 클릭 시 select_item 발생',
      should_not_fire: '페이지네이션 버튼 클릭 자체로는 미발생',
      check_points: '페이지 전환 후에도 이벤트 바인딩 정상 유지, 새 페이지 상품의 item_list_id/item_list_name 파라미터 갱신 확인',
      automation: {
        automatable: false,
        skip_reason: '페이지네이션 클릭 → 로딩 대기 → 상품 클릭 멀티스텝 (수동 테스트)',
      },
    },
    // ── 뒤로가기 복귀 시나리오 ──
    {
      index: 5,
      scenario: 'PDP 방문 후 뒤로가기로 복귀 → 다시 상품 클릭',
      procedure: 'PRODUCT_LIST → 상품 A 클릭 (PDP 이동) → 뒤로가기(back) → 리스트 복귀 → 상품 B 클릭',
      should_fire: '뒤로가기로 리스트 복귀 후 다른 상품 클릭 시에도 select_item 재발생',
      should_not_fire: '뒤로가기 자체로 select_item 발생하면 안 됨 (뒤로가기는 page_view만 발생)',
      check_points: 'bfcache/SPA history back 후에도 이벤트 바인딩 유지 확인. 복귀 후 클릭 시 select_item 정상 1회 발생',
      automation: {
        automatable: false,
        skip_reason: 'PDP 이동 → 뒤로가기 → 재클릭 멀티스텝 (수동 테스트)',
      },
    },
    // ── 비대상 페이지 미발생 검증 ──
    {
      index: 6,
      scenario: 'MAIN 페이지에서 상품 클릭 시 미발생 확인',
      procedure: 'MAIN 페이지 진입 → 추천/베스트 상품 영역에서 상품 클릭',
      should_fire: '이 시나리오에서는 발생하면 안 됨',
      should_not_fire: 'MAIN은 select_item 대상 page_type이 아님. 상품 클릭으로 PDP 이동해도 select_item 미발생이 정상',
      check_points: 'MAIN에서 select_item 발생 시 → 개발자 오구현. 퍼널상 MAIN에는 view_item_list가 없으므로 select_item도 미발생',
      automation: {
        automatable: false,
        skip_reason: 'forbidden_events 검증은 auto_fire 시나리오에서 처리',
      },
    },
    // ── 중복 발생 검증 ──
    {
      index: 7,
      scenario: '상품 클릭 시 중복 발생 체크',
      procedure: 'PRODUCT_LIST → 상품 카드 클릭 1회',
      should_fire: '1회 클릭에 select_item 1회만 발생',
      should_not_fire: '1회 클릭에 2회 이상 select_item 발생',
      check_points: 'preventDefault() 후 beacon 전송 → location 이동 패턴에서 이벤트 중복 여부 확인. 부모-자식 요소 동시 바인딩으로 인한 버블링 중복도 체크',
      automation: {
        automatable: false,
        skip_reason: 'dataLayer push 횟수 정밀 확인 필요 (수동 테스트)',
      },
    },
  ],
  check_points: [
    // ── 대상 페이지 타입 규칙 ──
    'PRODUCT_LIST + SEARCH 페이지 타입에서만 발생. 퍼널: view_item_list → select_item → view_item',
    'MAIN, EVENT_DETAIL 등 비 PLP/SEARCH 페이지에서 상품 클릭 시 미발생이 정상',
    // ── 동적 로딩 / 네비게이션 ──
    '무한 스크롤: 추가 로딩된 상품 클릭 시에도 이벤트 바인딩 유지 → select_item 정상 발생',
    '페이지네이션: 다른 페이지 이동 후 상품 클릭 시에도 select_item 정상 발생',
    '뒤로가기 복귀: PDP → back → PLP 복귀 후 다시 클릭 시에도 select_item 발생 (bfcache/SPA history)',
    // ── beacon 유실 방지 ──
    'preventDefault()로 페이지 이동을 지연하고, beacon(dataLayer push) 전송 후 location 이동 (LESSON-2)',
    'beacon 전송 실패 시 타임아웃으로 강제 이동 (사용자 경험 보호)',
    // ── 중복 / 정확성 ──
    '1클릭 = 1회 select_item. 부모-자식 요소 버블링 중복 체크',
    '상품 영역 외 클릭(필터, 정렬, 퀵추가 버튼 등) 시 미발생 확인',
  ],
};
