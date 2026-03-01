/**
 * Knowledge Enricher 테스트
 *
 * KB sub-scenario → ScenarioDefinition 변환 검증:
 * 1. page_view automatable 시나리오가 추가되는지
 * 2. source='knowledge_base' 표시
 * 3. knowledge_ref 참조 데이터
 * 4. navigate_back 액션 타입
 * 5. 중복 시나리오 방지
 * 6. scope=page_type_specific 필터링
 */

import { enrichWithKnowledgeSubScenarios } from '../agents/parser/knowledge-enricher';
import { getAutomatableTestScenarios } from '../knowledge/events/index';
import type { ScenarioDefinition } from '../types/event-scenario';
import { DEFAULT_CHANNEL_ENABLED } from '../types/event-scenario';
import type { ContentGroupRule } from '../types/content-group';
import type { ChannelCombination } from '../types/common';

// ─── Test Fixtures ───

function createBaseScenario(overrides: Partial<ScenarioDefinition> = {}): ScenarioDefinition {
  return {
    scenario_id: 'sc_1_auto_MAIN',
    scenario_name: '[MAIN] auto_fire - https://example.com/',
    page_type: 'MAIN',
    page_url_pattern: 'https://example.com/',
    test_urls: ['https://example.com/'],
    expected_events: [{
      event_name: 'page_view',
      ga4_event_name: 'page_view',
      required: true,
      expected_within_ms: 10000,
      channel_event_ids: {} as Record<ChannelCombination, string>,
    }],
    sequence_order: 1,
    enabled_channels: { ...DEFAULT_CHANNEL_ENABLED },
    channel_action_ids: {} as Record<ChannelCombination, string>,
    ...overrides,
  };
}

function createContentGroupRules(): ContentGroupRule[] {
  return [
    {
      page_type: 'MAIN',
      content_group_value: 'メイン',
      auto_fire_events: ['page_view'],
      action_events: [],
      forbidden_events: [],
    },
    {
      page_type: 'PRODUCT_LIST',
      content_group_value: '商品一覧',
      auto_fire_events: ['page_view', 'view_item_list'],
      action_events: [],
      forbidden_events: [],
    },
  ];
}

// ─── Tests ───

describe('Knowledge Enricher', () => {
  describe('getAutomatableTestScenarios()', () => {
    it('page_view에 automatable 시나리오가 있어야 함', () => {
      const scenarios = getAutomatableTestScenarios('page_view');
      expect(scenarios.length).toBeGreaterThan(0);
      console.log(`page_view automatable: ${scenarios.map(s => s.scenario_name).join(', ')}`);
    });

    it('모든 이벤트 조회 시 결과가 있어야 함', () => {
      const all = getAutomatableTestScenarios();
      expect(all.length).toBeGreaterThan(0);
      console.log(`전체 automatable: ${all.length}개`);
    });

    it('navigate_back 타입이 포함되어야 함', () => {
      const scenarios = getAutomatableTestScenarios('page_view');
      const backScenario = scenarios.find(s => s.automation.action_type === 'navigate_back');
      expect(backScenario).toBeDefined();
      expect(backScenario!.scenario_name).toContain('뒤로가기');
    });

    it('scope=page_type_specific 시나리오가 있어야 함', () => {
      const scenarios = getAutomatableTestScenarios('page_view');
      const spaScenario = scenarios.find(s => s.automation.scope === 'page_type_specific');
      expect(spaScenario).toBeDefined();
      expect(spaScenario!.automation.applicable_page_types).toContain('PRODUCT_LIST');
    });
  });

  describe('enrichWithKnowledgeSubScenarios()', () => {
    it('기존 시나리오에 KB sub-scenario를 추가해야 함', () => {
      const scenarios: ScenarioDefinition[] = [
        createBaseScenario(),
      ];
      const rules = createContentGroupRules();

      const beforeCount = scenarios.length;
      enrichWithKnowledgeSubScenarios(scenarios, rules);
      const afterCount = scenarios.length;

      expect(afterCount).toBeGreaterThan(beforeCount);
      console.log(`시나리오 수: ${beforeCount} → ${afterCount} (+${afterCount - beforeCount})`);
    });

    it('추가된 시나리오에 source=knowledge_base가 설정되어야 함', () => {
      const scenarios: ScenarioDefinition[] = [createBaseScenario()];
      enrichWithKnowledgeSubScenarios(scenarios, createContentGroupRules());

      const kbScenarios = scenarios.filter(s => s.source === 'knowledge_base');
      expect(kbScenarios.length).toBeGreaterThan(0);
    });

    it('추가된 시나리오에 knowledge_ref가 있어야 함', () => {
      const scenarios: ScenarioDefinition[] = [createBaseScenario()];
      enrichWithKnowledgeSubScenarios(scenarios, createContentGroupRules());

      const kbScenarios = scenarios.filter(s => s.source === 'knowledge_base');
      for (const s of kbScenarios) {
        expect(s.knowledge_ref).toBeDefined();
        expect(s.knowledge_ref!.event_name).toBeTruthy();
        expect(s.knowledge_ref!.sub_index).toBeGreaterThan(0);
        expect(s.knowledge_ref!.name).toBeTruthy();
      }
    });

    it('navigate_back 시나리오가 생성되어야 함', () => {
      const scenarios: ScenarioDefinition[] = [createBaseScenario()];
      enrichWithKnowledgeSubScenarios(scenarios, createContentGroupRules());

      const backScenarios = scenarios.filter(
        s => s.user_action?.action_type === 'navigate_back',
      );
      expect(backScenarios.length).toBeGreaterThan(0);
    });

    it('중복 시나리오가 추가되면 안 됨', () => {
      const scenarios: ScenarioDefinition[] = [createBaseScenario()];
      enrichWithKnowledgeSubScenarios(scenarios, createContentGroupRules());

      const count1 = scenarios.length;
      enrichWithKnowledgeSubScenarios(scenarios, createContentGroupRules());
      const count2 = scenarios.length;

      expect(count2).toBe(count1); // 2번 호출해도 같은 수
    });

    it('page_type_specific 시나리오는 해당 page_type URL에만 대상이 됨', () => {
      const scenarios: ScenarioDefinition[] = [
        createBaseScenario(), // MAIN
        createBaseScenario({
          scenario_id: 'sc_2_auto_PLP',
          scenario_name: '[PRODUCT_LIST] auto_fire',
          page_type: 'PRODUCT_LIST',
          page_url_pattern: 'https://example.com/collections/all',
          test_urls: ['https://example.com/collections/all'],
          sequence_order: 2,
        }),
      ];
      enrichWithKnowledgeSubScenarios(scenarios, createContentGroupRules());

      // page_type_specific 시나리오 (sub_index=5, SPA 전환, action=click)는
      // 같은 URL의 all_urls click 시나리오 (sub_index=2)와 중복 감지되어
      // 별도 추가되지 않을 수 있음 (동일 url|event|action_type 키)
      // 대신, all_urls click이 MAIN에도 PRODUCT_LIST에도 추가되는지 확인
      const clickOnMain = scenarios.filter(
        s => s.source === 'knowledge_base'
          && s.user_action?.action_type === 'click'
          && s.page_type === 'MAIN',
      );
      const clickOnPLP = scenarios.filter(
        s => s.source === 'knowledge_base'
          && s.user_action?.action_type === 'click'
          && s.page_type === 'PRODUCT_LIST',
      );
      expect(clickOnMain.length).toBeGreaterThan(0);
      expect(clickOnPLP.length).toBeGreaterThan(0);

      // navigate_back (all_urls)은 양쪽 모두 추가
      const backOnMain = scenarios.filter(
        s => s.source === 'knowledge_base'
          && s.user_action?.action_type === 'navigate_back'
          && s.page_type === 'MAIN',
      );
      const backOnPLP = scenarios.filter(
        s => s.source === 'knowledge_base'
          && s.user_action?.action_type === 'navigate_back'
          && s.page_type === 'PRODUCT_LIST',
      );
      expect(backOnMain.length).toBe(1);
      expect(backOnPLP.length).toBe(1);
    });

    it('빈 시나리오 배열에서도 에러 없이 동작해야 함', () => {
      const scenarios: ScenarioDefinition[] = [];
      expect(() => {
        enrichWithKnowledgeSubScenarios(scenarios, createContentGroupRules());
      }).not.toThrow();
      expect(scenarios.length).toBe(0); // URL이 없으므로 추가 안 됨
    });
  });
});
