/**
 * Event Scenario Knowledge Types
 *
 * IssueList 2차 QA Excel에서 추출한 이벤트별 시나리오 지식.
 * should/shouldn't fire 규칙, 테스트 시나리오, 검수 포인트를 정의합니다.
 *
 * @version 1.1 - SubScenarioAutomation 추가
 */

import type { UserActionType } from './event-scenario';
import type { PageTypeEnum } from './common';

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: Event Scenario Knowledge
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 이벤트별 시나리오 지식
 *
 * IssueList Excel의 시나리오 시트에서 추출한 규칙.
 * Validator에서 이벤트 검증 시 참조합니다.
 */
export interface EventScenarioKnowledge {
  /** GA4 이벤트명 */
  event_name: string;
  /** 발생해야 하는 상황 규칙들 */
  should_fire_rules: string[];
  /** 발생하면 안 되는 상황 규칙들 */
  should_not_fire_rules: string[];
  /** 테스트 시나리오 목록 */
  test_scenarios: EventTestScenario[];
  /** 주요 검수 포인트 */
  check_points: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: Event Test Scenario
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 개별 테스트 시나리오
 */
export interface EventTestScenario {
  /** 시나리오 순번 */
  index: number;
  /** 시나리오 설명 */
  scenario: string;
  /** 진행방법 */
  procedure: string;
  /** 발생해야 하는 상황 */
  should_fire: string;
  /** 발생하면 안 되는 상황 */
  should_not_fire: string;
  /** 주요 검수 포인트 */
  check_points: string;
  /** 자동화 메타데이터 (Enricher 참조) */
  automation?: SubScenarioAutomation;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: Sub-Scenario Automation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 서브 시나리오 자동화 메타데이터
 *
 * Knowledge Base의 테스트 시나리오가 Playwright로 자동화 가능한지,
 * 어떤 액션 타입으로, 어떤 페이지에서 실행할지를 정의합니다.
 */
export interface SubScenarioAutomation {
  /** 자동화 가능 여부 */
  automatable: boolean;
  /** 자동화 액션 타입 (automatable=true일 때) */
  action_type?: UserActionType;
  /** 대상 CSS 선택자 (click 등) */
  target_selector?: string;
  /** 자동화 불가 사유 (automatable=false일 때) */
  skip_reason?: string;
  /** 적용 범위 */
  scope?: 'all_urls' | 'page_type_specific';
  /** 특정 페이지 타입에서만 적용 (scope=page_type_specific일 때) */
  applicable_page_types?: PageTypeEnum[];
}
