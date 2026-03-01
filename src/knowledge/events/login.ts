/**
 * login 이벤트 지식
 * @source 20251028_INNM-JP_IssueList_2차QA_Ver1.xlsx
 */

import type { EventScenarioKnowledge } from '../../types/event-scenario-knowledge';

export const LOGIN_KNOWLEDGE: EventScenarioKnowledge = {
  event_name: 'login',
  should_fire_rules: [
    '로그인 요청 후 서버에서 로그인 성공 응답을 받은 시점',
    '실제로 로그인 세션(토큰, 쿠키 등)이 생성된 뒤',
  ],
  should_not_fire_rules: [
    '로그인 화면 진입 시',
    '아이디/비밀번호 틀려서 로그인 실패 시',
    '로그인 만료나 세션 연장 시',
  ],
  test_scenarios: [],
  check_points: [
    '로그인 요청 시도마다 이벤트 발생: 비밀번호 틀려도 호출되면 안 됨',
    '자동 로그인(세션 유지) 시 반복 발생: 앱 재실행 시 세션이 자동 복원되었는데 이벤트 다시 발생',
  ],
};
