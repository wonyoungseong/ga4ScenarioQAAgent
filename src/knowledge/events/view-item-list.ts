/**
 * view_item_list 이벤트 지식
 *
 * 상품 목록 노출 시 발생. PRODUCT_LIST + SEARCH 페이지 타입 전용.
 * dataLayer event: ap_search
 *
 * 핵심 규칙:
 * - PRODUCT_LIST, SEARCH 페이지 타입에서만 발생
 * - MAIN 페이지에 상품 리스트 UI가 있어도 view_item_list 미발생
 * - SEARCH에서 제품 리스트 미노출(결과 없음)이면 미발생
 * - 개발자 오선언 주의: page_type이 PRODUCT_LIST가 아닌데 상품 리스트 UI가 있으면
 *   dataLayer push가 잘못 발생할 수 있음 → 화면 구성요소 기반 교차 검증 필요
 *
 * @source 20251028_INNM-JP_IssueList_2차QA_Ver1.xlsx
 * @source innisfree.jp 검색 모달 동작 분석
 * @source QA 도메인 지식 (2026-02-20)
 */

import type { EventScenarioKnowledge } from '../../types/event-scenario-knowledge';

export const VIEW_ITEM_LIST_KNOWLEDGE: EventScenarioKnowledge = {
  event_name: 'view_item_list',
  should_fire_rules: [
    'PRODUCT_LIST 페이지 타입: 카테고리/브랜드 목록 페이지에 상품 리스트가 노출되는 순간',
    'SEARCH 페이지 타입: 검색 결과에 상품 리스트가 노출될 때 (view_search_results와 동시 발생)',
    '상품 목록(리스트)을 최초로 볼 때 1회 발생',
    '핫딜, 상품 카테고리 등 상품 리스트가 있는 페이지에서도 개발자가 ap_search를 선언했다면 발생 가능 (오개발 검증 대상)',
  ],
  should_not_fire_rules: [
    'MAIN 페이지: 상품 리스트 UI가 있더라도 view_item_list 미발생 (MAIN은 대상 page_type 아님)',
    'SEARCH 페이지에서 제품 리스트가 미노출(검색 결과 0건)이면 미발생',
    '빈 검색어(q=) URL 직접 진입 시 미발생',
    '스크롤 리스팅으로 추가 상품 로딩 시 매번 이벤트가 중복 발생하면 안 됨',
    'PRODUCT_DETAIL, EVENT_DETAIL 등 단일 상품/이벤트 페이지에서 발생하면 안 됨',
  ],
  test_scenarios: [
    // ── PRODUCT_LIST 시나리오 ──
    {
      index: 1,
      scenario: '카테고리/브랜드 목록 페이지 진입',
      procedure: '/collections/* URL로 직접 진입',
      should_fire: 'PRODUCT_LIST 페이지에 상품 리스트가 노출될 때 auto_fire',
      should_not_fire: '상품 리스트가 로딩되지 않았거나 0건일 때',
      check_points: '페이지 로드 시 ap_search dataLayer push 발생 여부, 상품 리스트 실제 렌더링 확인',
      automation: {
        automatable: false,
        skip_reason: 'auto_fire 시나리오와 중복 (페이지 로드 시 자동 캡처)',
      },
    },
    // ── SEARCH 시나리오 ──
    {
      index: 2,
      scenario: '검색 모달에서 키워드 검색 (결과 있음)',
      procedure: '검색 아이콘 클릭 → 모달 열림 → 키워드 입력 → 검색 실행',
      should_fire: '검색 결과에 상품 리스트가 노출될 때',
      should_not_fire: '검색 모달만 열고 키워드 미입력 시',
      check_points: 'view_item_list + view_search_results 동시 발생 확인, 상품 리스트 실제 노출 여부',
      automation: {
        automatable: true,
        action_type: 'submit',
        target_selector: 'predictive-search input[type="search"], #Search-In-Modal, input[name="q"]',
        scope: 'page_type_specific',
        applicable_page_types: ['MAIN', 'PRODUCT_LIST', 'OTHERS'],
      },
    },
    {
      index: 3,
      scenario: '검색 모달에서 키워드 검색 (결과 없음)',
      procedure: '검색 아이콘 클릭 → 모달 열림 → 존재하지 않는 키워드 입력 → 검색 실행',
      should_fire: '이 시나리오에서는 발생하면 안 됨',
      should_not_fire: '검색 결과 0건이면 view_item_list 미발생 (view_search_results만 발생)',
      check_points: 'view_item_list 미발생 + view_search_results만 발생 확인',
      automation: {
        automatable: true,
        action_type: 'submit',
        target_selector: 'predictive-search input[type="search"], #Search-In-Modal, input[name="q"]',
        scope: 'page_type_specific',
        applicable_page_types: ['MAIN', 'PRODUCT_LIST', 'OTHERS'],
      },
    },
    {
      index: 4,
      scenario: '인기검색어/최근검색어 클릭으로 검색',
      procedure: '검색 모달 열림 → 인기검색어 또는 최근검색어 항목 클릭',
      should_fire: '추천 검색어 클릭 후 상품 리스트 노출 시',
      should_not_fire: '검색어 추천 영역만 노출되고 클릭하지 않은 상태',
      check_points: '추천 검색어 클릭 시 상품 리스트 유무에 따른 발생/미발생',
      automation: {
        automatable: false,
        skip_reason: '인기검색어/최근검색어 UI 동적 생성 (수동 테스트)',
      },
    },
    {
      index: 5,
      scenario: '검색 페이지 내 2차/3차 재검색',
      procedure: 'SEARCH 페이지에서 검색 모달 재오픈 → 다른 키워드 입력 → 검색',
      should_fire: '재검색 시 상품 리스트 노출되면 1회 재발생',
      should_not_fire: '동일 검색어 재검색 시 중복 발생',
      check_points: '연속 검색 시 이벤트 중복 발생 여부 확인',
      automation: {
        automatable: false,
        skip_reason: 'SEARCH 페이지에서 재검색 멀티스텝 (수동 테스트)',
      },
    },
    {
      index: 6,
      scenario: '검색 결과에서 필터 적용',
      procedure: 'SEARCH 페이지에서 필터/정렬 옵션 적용',
      should_fire: '필터 적용 후 변경된 상품 리스트 노출 시',
      should_not_fire: '필터 적용 결과가 반영되기 전에 이벤트가 발생',
      check_points: '필터링 후 변경된 리스트에 대한 이벤트 재발생 및 파라미터 확인',
      automation: {
        automatable: false,
        skip_reason: '필터 UI 동적 구조 (수동 테스트)',
      },
    },
    // ── 오개발 검증 시나리오 ──
    {
      index: 7,
      scenario: 'MAIN 페이지에서 미발생 확인',
      procedure: 'MAIN 페이지 진입 후 상품 리스트 UI 유무와 관계없이 view_item_list 미발생 검증',
      should_fire: '이 시나리오에서는 발생하면 안 됨',
      should_not_fire: 'MAIN 페이지는 view_item_list 대상 page_type이 아님. 상품 리스트 UI가 있어도 미발생이 정상',
      check_points: 'MAIN에서 view_item_list 발생 시 → 개발자 오선언(ap_search dataLayer push 잘못 삽입) 의심',
      automation: {
        automatable: false,
        skip_reason: 'forbidden_events 검증은 auto_fire 시나리오에서 처리',
      },
    },
    {
      index: 8,
      scenario: '상품 리스트 UI가 있는 비 PRODUCT_LIST 페이지 교차 검증',
      procedure: '핫딜, 특별전, 기획전 등 상품 리스트가 노출되는 페이지에서 view_item_list 발생 여부 확인',
      should_fire: '개발자가 ap_search를 선언한 경우 발생할 수 있음 (오개발)',
      should_not_fire: 'page_type이 PRODUCT_LIST/SEARCH가 아닌 페이지에서는 발생하면 안 됨',
      check_points: '화면 구성요소(상품 카드, 가격, 썸네일 등)로 상품 리스트 페이지 여부 판단. 발생 시 page_type 분류 오류 또는 개발자 oap_search 오선언 가능성 리포트',
      automation: {
        automatable: false,
        skip_reason: '시각적 화면 구성요소 판단 필요 (Recon + 수동 검증)',
      },
    },
  ],
  check_points: [
    // ── 대상 페이지 타입 규칙 ──
    'PRODUCT_LIST + SEARCH 페이지 타입에서만 발생. MAIN은 상품 리스트 UI가 있어도 미발생이 정상',
    'SEARCH에서 제품 리스트가 미노출(검색 결과 없음)이면 미발생',
    // ── 오개발 검증 ──
    '개발자 오선언 주의: page_type이 PRODUCT_LIST가 아닌데 상품 리스트 UI(상품 카드, 가격, 썸네일)가 있는 페이지에서 발생하면 → page_type 분류 오류 또는 ap_search 오선언',
    '화면 구성요소 기반 교차 검증: 상품 카테고리, 핫딜, 기획전 등 리스트형 페이지에서 view_item_list 발생 여부를 시각적으로 확인',
    // ── 중복/타이밍 ──
    '상품 리스트가 로드되지 않았는데 이벤트 발생: 로딩 실패 시 발생해선 안 됨',
    '무한 스크롤 구현: 목록 로딩이 여러 번 이뤄져 이벤트가 중복 발생하면 오류',
    'iOS/Android: RecyclerView, CollectionView 등의 onBind 시점에서 계속 이벤트가 호출되면 오류',
    // ── 동시 발생 규칙 ──
    'SEARCH + 결과 있음 → view_item_list + view_search_results 동시 발생',
    'SEARCH + 결과 없음 → view_item_list 미발생, view_search_results만 발생',
    '빈 검색어(q=) URL 진입 시 두 이벤트 모두 미발생 (LESSON-3)',
  ],
};
