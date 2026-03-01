/**
 * page_view 이벤트 지식
 * @source 20251028_INNM-JP_IssueList_2차QA_Ver1.xlsx
 */

import type { EventScenarioKnowledge } from '../../types/event-scenario-knowledge';

export const PAGE_VIEW_KNOWLEDGE: EventScenarioKnowledge = {
  event_name: 'page_view',
  should_fire_rules: [
    '페이지(화면) 이동 시 최초 1회만 발생해야 함',
    'DOM Ready(또는 화면 로드 완료) 시점에서만 발생',
    'SPA에서 URL 변화와 함께 페이지 전환 시',
    '리다이렉션 후 로딩 시',
    '브라우저 뒤로가기/앞으로가기 사용 시',
  ],
  should_not_fire_rules: [
    '같은 페이지(화면)에서 2회 이상 발생',
    'SPA에서 리소스만 변경되었는데 이벤트가 재발생',
    '특정 버튼/영역 클릭 시 page_view가 추가 발생',
    '뒤로가기로 돌아온 뒤 page_view가 중복 발생',
    '팝업이나 모달 창 로딩 시',
    'AJAX로 부분적 콘텐츠만 로딩 시',
    '자동 슬라이드쇼나 카루셀 전환 시',
  ],
  test_scenarios: [
    {
      index: 1,
      scenario: '페이지 첫 로딩 시',
      procedure: 'URL 입력',
      should_fire: '새 페이지로 이동했을 때',
      should_not_fire: '페이지를 새로 고치지 않고 내용만 변경할 때',
      check_points: '이벤트 발생 타이밍과 중복 발생 검사',
      automation: {
        automatable: false,
        skip_reason: 'auto_fire 시나리오와 중복 (페이지 로드 시 자동 캡처)',
      },
    },
    {
      index: 2,
      scenario: '내부 링크 클릭 시',
      procedure: '링크 클릭',
      should_fire: '사이트 내 다른 페이지로의 링크를 클릭하여 이동',
      should_not_fire: 'AJAX를 통해 부분적 콘텐츠만 로딩하는 경우',
      check_points: '플랫폼별 동작 확인',
      automation: {
        automatable: true,
        action_type: 'click',
        target_selector: 'a[href^="/"]:not([href="#"]):not([href*="javascript"])',
        scope: 'all_urls',
      },
    },
    {
      index: 3,
      scenario: '리다이렉션 후 로딩 시',
      procedure: '로그인',
      should_fire: '자동 리다이렉션된 경우',
      should_not_fire: '팝업이나 모달 창 로딩 시',
      check_points: '데이터 레이어 적용 오류 검사',
      automation: {
        automatable: false,
        skip_reason: '로그인 후 리다이렉션 필요 (수동 테스트)',
      },
    },
    {
      index: 4,
      scenario: '브라우저 뒤로가기/앞으로가기',
      procedure: '앞/뒤 확인',
      should_fire: '뒤로가기/앞으로가기로 페이지 돌아갔을 때',
      should_not_fire: '자동 슬라이드쇼나 카루셀 전환 시',
      check_points: '이벤트 태깅 오류 및 세션 유지 중 오류 검사',
      automation: {
        automatable: true,
        action_type: 'navigate_back',
        scope: 'all_urls',
      },
    },
    {
      index: 5,
      scenario: 'SPA에서의 페이지 전환',
      procedure: '탭 이동 및 상품 상세 이동',
      should_fire: 'SPA에서 URL 변화와 함께 페이지 전환 시',
      should_not_fire: '동적 콘텐츠 로딩 시',
      check_points: '캐시된 페이지 로드와 프로그래밍 방식의 페이지 이동 검사',
      automation: {
        automatable: true,
        action_type: 'click',
        target_selector: 'a[href*="/products/"], a[href*="/collections/"]',
        scope: 'page_type_specific',
        applicable_page_types: ['PRODUCT_LIST', 'SEARCH'],
      },
    },
    {
      index: 6,
      scenario: '팝업 또는 모달에서의 링크 클릭',
      procedure: '팝업 링크',
      should_fire: '팝업 내 링크 클릭하여 새 페이지 이동',
      should_not_fire: '동일 페이지 내 앵커(#) 이동 시',
      check_points: '페이지 로드 실패 시',
      automation: {
        automatable: false,
        skip_reason: '팝업 오픈 상태 전제조건 필요 (수동 테스트)',
      },
    },
  ],
  check_points: [
    'iOS/Android: 앱에서 화면 전환 시 lifecycle 처리 문제로 이벤트가 2번씩 찍히는 경우',
    'Web PC/Mobile Web: SPA 라우팅 시점과 실제 페이지 로드 시점 구분이 안 되어 중복 발생',
    '중복 태그 삽입(GTM 또는 직접 스크립트)으로 이벤트가 2회 이상 전송되는 경우',
  ],
};
