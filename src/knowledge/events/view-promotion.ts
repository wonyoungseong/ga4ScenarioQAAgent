/**
 * view_promotion 이벤트 지식
 * @source 20251028_INNM-JP_IssueList_2차QA_Ver1.xlsx
 */

import type { EventScenarioKnowledge } from '../../types/event-scenario-knowledge';

export const VIEW_PROMOTION_KNOWLEDGE: EventScenarioKnowledge = {
  event_name: 'view_promotion',
  should_fire_rules: [
    '메인 페이지 또는 특정 페이지에서 프로모션(배너, Key Visual)이 실제로 노출되는 순간',
    '화면 초기 로드 시 노출 대상 프로모션이 보여졌다면 1회 발생',
  ],
  should_not_fire_rules: [
    '화면에 프로모션 영역이 존재하지 않을 때',
    '프로모션 배너가 로딩되지 않거나 조건에 따라 표시되지 않았는데 이벤트 발생',
    '스크롤 다운으로 프로모션 배너가 보이는 시점에 중복 호출',
  ],
  test_scenarios: [],
  check_points: [
    '중복 이벤트: 메인 페이지에서 배너가 슬라이드로 돌아가며 여러 배너가 노출될 때 중복 발생',
    '웹뷰(iOS/Android)에서 배너 로딩 시점 처리: 실제 노출 전 또는 재로딩 시 이벤트 발생',
  ],
};
