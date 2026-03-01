/**
 * purchase 이벤트 지식
 * @source 20251028_INNM-JP_IssueList_2차QA_Ver1.xlsx
 */

import type { EventScenarioKnowledge } from '../../types/event-scenario-knowledge';

export const PURCHASE_KNOWLEDGE: EventScenarioKnowledge = {
  event_name: 'purchase',
  should_fire_rules: [
    '최종 결제 완료 후 주문 완료(결제 성공) 페이지가 로드된 시점',
    'PG사로부터 결제 성공 응답을 받은 뒤 주문이 정상적으로 생성되었다는 로직이 확인되는 순간',
  ],
  should_not_fire_rules: [
    '결제 승인 실패, 카드 승인 거절 등 실제로 결제가 완료되지 않은 경우',
    '주문 완료 페이지가 아닌 중간 로딩/에러 페이지에서 발생',
  ],
  test_scenarios: [],
  check_points: [
    '이중 호출: 결제 완료 페이지 로드 시 + 결제 완료 모달 표시 시 중복 발생',
    '결제 실패인데 이벤트 발생',
    '비동기 처리 문제: iOS/Android에서 결제 완료 콜백 & WebView 로딩이 각각 이벤트 호출',
  ],
};
