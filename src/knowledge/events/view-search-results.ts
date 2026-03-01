/**
 * view_search_results 이벤트 지식
 *
 * 검색 모달에서 키워드 입력 후 검색 시 발생.
 * dataLayer event: ap_search (view_item_list과 공유)
 * Content Group = SEARCH_RESULT 조건으로 SEARCH 페이지에서만 발생.
 *
 * @source 20251028_INNM-JP_IssueList_2차QA_Ver1.xlsx
 * @source innisfree.jp 검색 모달 동작 분석
 */

import type { EventScenarioKnowledge } from '../../types/event-scenario-knowledge';

export const VIEW_SEARCH_RESULTS_KNOWLEDGE: EventScenarioKnowledge = {
  event_name: 'view_search_results',
  should_fire_rules: [
    '검색 모달에서 키워드 입력 후 검색 실행 시 (검색 결과 유무 관계없이)',
    'SEARCH 페이지에서 검색 결과가 노출될 때',
    '인기검색어/최근검색어 클릭으로 검색 실행 시',
    '검색 페이지 내 2차/3차 재검색 시 1회 발생',
  ],
  should_not_fire_rules: [
    '검색 모달만 열고 키워드를 입력하지 않은 상태',
    '빈 검색어(q=)로 SEARCH 페이지 진입 시 (검색 실행 없음)',
    'PRODUCT_LIST(카테고리) 페이지에서는 미발생 (view_item_list만 발생)',
    '동일 검색어로 페이지 새로고침 없이 중복 발생',
  ],
  test_scenarios: [
    {
      index: 1,
      scenario: '검색 모달에서 키워드 입력 후 검색 (결과 있음)',
      procedure: '검색 아이콘 클릭 → 모달 열림 → 키워드 입력 → 검색 실행',
      should_fire: '검색 결과가 있는 키워드로 검색 시 view_search_results 발생',
      should_not_fire: '검색 모달만 열고 키워드 미입력 시',
      check_points: 'view_search_results와 view_item_list 동시 발생 확인, dataLayer ap_search 이벤트 1회',
      automation: {
        automatable: true,
        action_type: 'submit',
        target_selector: 'predictive-search input[type="search"], #Search-In-Modal, input[name="q"]',
        scope: 'page_type_specific',
        applicable_page_types: ['MAIN', 'PRODUCT_LIST', 'OTHERS'],
      },
    },
    {
      index: 2,
      scenario: '검색 모달에서 키워드 입력 후 검색 (결과 없음)',
      procedure: '검색 아이콘 클릭 → 모달 열림 → 존재하지 않는 키워드 입력 → 검색 실행',
      should_fire: '검색 결과가 없어도 view_search_results는 발생',
      should_not_fire: '검색 결과 없으면 view_item_list는 미발생',
      check_points: 'view_search_results만 발생하고 view_item_list 미발생 확인',
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
      scenario: '인기검색어/최근검색어 클릭으로 검색',
      procedure: '검색 모달 열림 → 인기검색어 또는 최근검색어 항목 클릭',
      should_fire: '추천 검색어 클릭으로 검색 결과 페이지 진입 시',
      should_not_fire: '검색어 추천 영역만 노출되고 클릭하지 않은 상태',
      check_points: '추천 검색어 클릭 시 view_search_results 발생 + 결과 있으면 view_item_list 동시 발생',
      automation: {
        automatable: false,
        skip_reason: '인기검색어/최근검색어 UI 동적 생성 (수동 테스트)',
      },
    },
    {
      index: 4,
      scenario: '검색 페이지 내 2차/3차 재검색',
      procedure: 'SEARCH 페이지에서 검색 모달 재오픈 → 다른 키워드 입력 → 검색',
      should_fire: '재검색 시 view_search_results 1회 재발생',
      should_not_fire: '동일 검색어 재검색 시 중복 발생',
      check_points: '연속 검색 시 이벤트 중복 발생 여부, 검색어별 1회 발생 원칙',
      automation: {
        automatable: false,
        skip_reason: 'SEARCH 페이지에서 재검색 멀티스텝 (수동 테스트)',
      },
    },
    {
      index: 5,
      scenario: '검색 결과에서 필터 적용',
      procedure: 'SEARCH 페이지에서 필터/정렬 옵션 적용',
      should_fire: '필터 적용 후 변경된 결과 노출 시 재발생 여부 확인',
      should_not_fire: '필터 UI만 열고 적용하지 않은 상태',
      check_points: '필터링 후 이벤트 재발생 여부 및 파라미터 변경 확인',
      automation: {
        automatable: false,
        skip_reason: '필터 UI 동적 구조 (수동 테스트)',
      },
    },
  ],
  check_points: [
    'view_search_results와 view_item_list 동시 발생 조건: 검색 결과 있음 → 둘 다 발생',
    'view_search_results만 발생 조건: 검색 결과 없음 → view_search_results만 발생, view_item_list 미발생',
    '빈 검색어(q=) URL 직접 진입 시 두 이벤트 모두 미발생 (LESSON-3)',
    'dataLayer event는 ap_search로 동일하나, Content Group 필터로 SEARCH 페이지에서만 view_search_results 발생',
    'PRODUCT_LIST 페이지에서는 view_item_list만 발생 (view_search_results 미발생)',
  ],
};
