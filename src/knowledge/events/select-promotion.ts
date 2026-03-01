/**
 * select_promotion 이벤트 지식
 * @source 20251028_INNM-JP_IssueList_2차QA_Ver1.xlsx
 */

import type { EventScenarioKnowledge } from '../../types/event-scenario-knowledge';

export const SELECT_PROMOTION_KNOWLEDGE: EventScenarioKnowledge = {
  event_name: 'select_promotion',
  should_fire_rules: [
    '노출된 프로모션(배너, Key Visual 등)을 사용자가 실제 클릭했을 때',
  ],
  should_not_fire_rules: [
    '페이지 로드만으로 클릭 이벤트 발생',
    '사용자가 클릭했지만 실제로 해당 영역이 프로모션이 아닌 경우',
  ],
  test_scenarios: [],
  check_points: [
    '클릭 이벤트 중복 호출: 클릭 한 번에 2번 이상 이벤트 전송',
    '프로모션 배너가 여러 영역으로 나뉘어 있는데 전부 같은 이벤트로 잡히거나 전혀 안 잡히는 경우',
  ],
};
