/**
 * sign_up 이벤트 지식
 * @source 20251028_INNM-JP_IssueList_2차QA_Ver1.xlsx
 */

import type { EventScenarioKnowledge } from '../../types/event-scenario-knowledge';

export const SIGN_UP_KNOWLEDGE: EventScenarioKnowledge = {
  event_name: 'sign_up',
  should_fire_rules: [
    '회원가입 폼 제출 후 유효성 검사 통과 및 회원 생성이 확정된 시점',
  ],
  should_not_fire_rules: [
    '회원가입 폼에 진입했을 때 (아직 가입 미완료)',
    '유효성 검사 실패, 가입 거절 등으로 최종 회원가입이 되지 않았을 때',
  ],
  test_scenarios: [],
  check_points: [
    '중간 단계에서 이벤트 발생: 비밀번호/이메일 검증(실패) 시점에서도 이벤트 발생',
    '다단계 가입 프로세스(인증번호, 본인인증 등)에서 단계별 중복 발생',
  ],
};
