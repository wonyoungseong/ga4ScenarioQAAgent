/**
 * Event Scenario Knowledge Base - Aggregator
 *
 * 이벤트별 분리된 지식 파일을 통합하여 기존 API를 유지합니다.
 * 새 이벤트 추가 시 해당 파일만 추가하고 이 파일에 import하면 자동 반영.
 *
 * @version 2.0 - 이벤트별 파일 분리 + automation 지원
 */

import type { EventScenarioKnowledge, EventTestScenario } from '../../types/event-scenario-knowledge';

// ─── 이벤트별 지식 import ───
import { PAGE_VIEW_KNOWLEDGE } from './page-view';
import { WRITE_REVIEW_KNOWLEDGE } from './write-review';
import { LOGIN_KNOWLEDGE } from './login';
import { SIGN_UP_KNOWLEDGE } from './sign-up';
import { WITHDRAWAL_KNOWLEDGE } from './withdrawal';
import { VIEW_PROMOTION_KNOWLEDGE } from './view-promotion';
import { SELECT_PROMOTION_KNOWLEDGE } from './select-promotion';
import { VIEW_ITEM_LIST_KNOWLEDGE } from './view-item-list';
import { SELECT_ITEM_KNOWLEDGE } from './select-item';
import { VIEW_ITEM_KNOWLEDGE } from './view-item';
import { ADD_TO_CART_KNOWLEDGE } from './add-to-cart';
import { BEGIN_CHECKOUT_KNOWLEDGE } from './begin-checkout';
import { PURCHASE_KNOWLEDGE } from './purchase';
import { VIEW_SEARCH_RESULTS_KNOWLEDGE } from './view-search-results';
import { AP_CLICK_KNOWLEDGE } from './ap-click';
import { REMOVE_FROM_CART_KNOWLEDGE } from './remove-from-cart';
import { SCROLL_KNOWLEDGE } from './scroll';
import { VIEW_PROMOTION_DETAIL_KNOWLEDGE } from './view-promotion-detail';

// ─── Knowledge Registry ───

const EVENT_KNOWLEDGE: Record<string, EventScenarioKnowledge> = {
  page_view: PAGE_VIEW_KNOWLEDGE,
  write_review: WRITE_REVIEW_KNOWLEDGE,
  login: LOGIN_KNOWLEDGE,
  sign_up: SIGN_UP_KNOWLEDGE,
  withdrawal: WITHDRAWAL_KNOWLEDGE,
  view_promotion: VIEW_PROMOTION_KNOWLEDGE,
  select_promotion: SELECT_PROMOTION_KNOWLEDGE,
  view_item_list: VIEW_ITEM_LIST_KNOWLEDGE,
  select_item: SELECT_ITEM_KNOWLEDGE,
  view_item: VIEW_ITEM_KNOWLEDGE,
  add_to_cart: ADD_TO_CART_KNOWLEDGE,
  begin_checkout: BEGIN_CHECKOUT_KNOWLEDGE,
  purchase: PURCHASE_KNOWLEDGE,
  view_search_results: VIEW_SEARCH_RESULTS_KNOWLEDGE,
  ap_click: AP_CLICK_KNOWLEDGE,
  remove_from_cart: REMOVE_FROM_CART_KNOWLEDGE,
  scroll: SCROLL_KNOWLEDGE,
  view_promotion_detail: VIEW_PROMOTION_DETAIL_KNOWLEDGE,
};

// ─── 기존 API (하위 호환) ───

export function getEventKnowledge(eventName: string): EventScenarioKnowledge | undefined {
  return EVENT_KNOWLEDGE[eventName];
}

export function getKnownEventNames(): string[] {
  return Object.keys(EVENT_KNOWLEDGE);
}

export function getAllEventKnowledge(): Record<string, EventScenarioKnowledge> {
  return { ...EVENT_KNOWLEDGE };
}

export function getShouldNotFireRules(eventName: string): string[] {
  return EVENT_KNOWLEDGE[eventName]?.should_not_fire_rules || [];
}

export function getCheckPoints(eventName: string): string[] {
  return EVENT_KNOWLEDGE[eventName]?.check_points || [];
}

// ─── 신규 API: Automation 지원 ───

export interface AutomatableScenario {
  event_name: string;
  sub_index: number;
  scenario_name: string;
  check_points: string;
  automation: NonNullable<EventTestScenario['automation']>;
}

/**
 * automatable=true인 테스트 시나리오만 반환합니다.
 * Enricher에서 KB sub-scenario를 ScenarioDefinition으로 변환할 때 사용.
 */
export function getAutomatableTestScenarios(eventName?: string): AutomatableScenario[] {
  const results: AutomatableScenario[] = [];
  const entries = eventName
    ? (EVENT_KNOWLEDGE[eventName] ? [[eventName, EVENT_KNOWLEDGE[eventName]] as const] : [])
    : Object.entries(EVENT_KNOWLEDGE);

  for (const [evName, knowledge] of entries) {
    for (const ts of knowledge.test_scenarios) {
      if (ts.automation?.automatable) {
        results.push({
          event_name: evName,
          sub_index: ts.index,
          scenario_name: ts.scenario,
          check_points: ts.check_points,
          automation: ts.automation,
        });
      }
    }
  }

  return results;
}
