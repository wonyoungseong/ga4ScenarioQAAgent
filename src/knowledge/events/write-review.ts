/**
 * write_review 이벤트 지식
 * @source 20251028_INNM-JP_IssueList_2차QA_Ver1.xlsx
 */

import type { EventScenarioKnowledge } from '../../types/event-scenario-knowledge';

export const WRITE_REVIEW_KNOWLEDGE: EventScenarioKnowledge = {
  event_name: 'write_review',
  should_fire_rules: [
    '리뷰 작성 후 유효성 검사를 통과하고 실제 리뷰 등록이 완료된 시점',
    '성공적으로 서버에 리뷰가 등록된 확정 시점',
  ],
  should_not_fire_rules: [
    '리뷰 작성 양식을 열었을 때 (작성 전 상태)',
    '리뷰 내용이 검증 실패(길이 부족, 금지어 포함 등)로 등록되지 않은 경우',
    '리뷰 작성 취소(뒤로가기, 닫기 등) 시',
  ],
  test_scenarios: [],
  check_points: [
    '이중 호출: 리뷰 작성 화면에서 작성 버튼 클릭 시 실제 서버 등록 전과 후 두 번 발생',
    '실패 케이스에서도 발생: 유효성 검사에 실패했는데 이벤트가 발생',
    'iOS/Android: 네트워크 요청/응답 처리 타이밍에 따라 중복 전송',
  ],
};
