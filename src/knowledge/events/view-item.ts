/**
 * view_item 이벤트 지식
 * @source 20251028_INNM-JP_IssueList_2차QA_Ver1.xlsx
 */

import type { EventScenarioKnowledge } from '../../types/event-scenario-knowledge';

export const VIEW_ITEM_KNOWLEDGE: EventScenarioKnowledge = {
  event_name: 'view_item',
  should_fire_rules: [
    '상품 상세 페이지가 실제로 로드되었을 때',
    'DOM Ready나 앱 화면이 진입하는 시점에 해당 상품 정보를 가진 페이지가 표시될 때',
  ],
  should_not_fire_rules: [
    '미리보기나 팝업 등으로 잠깐만 볼 때',
    '상품 정보가 로드되지 않았거나 오류로 인해 데이터가 표시되지 않은 경우',
  ],
  test_scenarios: [
    {
      index: 1,
      scenario: '상품 상세 페이지 로드',
      procedure: '클릭해서 이동',
      should_fire: '상품 목록에서 특정 상품을 선택하여 상세 페이지로 넘어갔을 때',
      should_not_fire: '상품 상세 페이지가 아직 로드되지 않았거나 로딩 중일 때',
      check_points: '페이지 로드 완료 후 이벤트 발생 확인',
      automation: {
        automatable: false,
        skip_reason: 'auto_fire 시나리오와 중복 (PDP 로드 시 자동 캡처)',
      },
    },
    {
      index: 2,
      scenario: '상품 상세 페이지 로드',
      procedure: '직접 이동',
      should_fire: '상품 상세 페이지 URL 직접 입력하여 이동',
      should_not_fire: '상품 상세 페이지가 아직 로드되지 않았거나 로딩 중일 때',
      check_points: '페이지 로드 완료 후 이벤트 발생 확인',
      automation: {
        automatable: false,
        skip_reason: 'auto_fire 시나리오와 중복 (URL 직접 입력)',
      },
    },
  ],
  check_points: [
    'SPA 환경: URL만 바뀌고 실제 상품 정보 페이지가 로딩되지 않았는데 이벤트 발생',
    '데이터 미완료 상태에서 발생하여 실제 상품명을 수집 못하거나 잘못된 상품ID로 태깅',
  ],
};
