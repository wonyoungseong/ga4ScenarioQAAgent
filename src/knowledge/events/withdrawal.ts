/**
 * withdrawal 이벤트 지식
 * @source 20251028_INNM-JP_IssueList_2차QA_Ver1.xlsx
 */

import type { EventScenarioKnowledge } from '../../types/event-scenario-knowledge';

export const WITHDRAWAL_KNOWLEDGE: EventScenarioKnowledge = {
  event_name: 'withdrawal',
  should_fire_rules: [
    '회원탈퇴 요청 후 실제 탈퇴 처리가 완료된 시점 (DB에서 회원 상태 변경 등)',
  ],
  should_not_fire_rules: [
    '탈퇴 화면에 진입했을 때',
    '비밀번호 재확인 등으로 탈퇴가 실패했을 때',
  ],
  test_scenarios: [],
  check_points: [
    '탈퇴 시도만 해도 이벤트 발생: 탈퇴 실패해도 이벤트가 발생하는 경우',
    '중복 호출: 탈퇴 요청-응답 사이에 여러 번 호출되는 경우',
  ],
};
