/**
 * Event Scenario Knowledge Base 테스트
 *
 * 지식 베이스 모듈의 API 및 데이터 정합성 검증:
 * 1. getEventKnowledge() 조회
 * 2. getKnownEventNames() 목록
 * 3. getShouldNotFireRules() 규칙 조회
 * 4. getCheckPoints() 검수 포인트 조회
 * 5. 주요 이벤트 데이터 정합성
 */

import {
  getEventKnowledge,
  getKnownEventNames,
  getAllEventKnowledge,
  getShouldNotFireRules,
  getCheckPoints,
} from '../knowledge/events/index';

describe('Event Scenario Knowledge Base', () => {
  describe('API 기본 동작', () => {
    it('getKnownEventNames()가 이벤트 목록을 반환해야 함', () => {
      const names = getKnownEventNames();
      expect(names.length).toBeGreaterThan(0);
      console.log(`등록된 이벤트: ${names.join(', ')}`);
    });

    it('getAllEventKnowledge()가 전체 지식을 반환해야 함', () => {
      const all = getAllEventKnowledge();
      expect(Object.keys(all).length).toBeGreaterThan(0);
      expect(Object.keys(all).length).toBe(getKnownEventNames().length);
    });

    it('존재하지 않는 이벤트는 undefined 반환', () => {
      const result = getEventKnowledge('nonexistent_event');
      expect(result).toBeUndefined();
    });
  });

  describe('page_view 지식 검증', () => {
    it('page_view 지식이 존재해야 함', () => {
      const knowledge = getEventKnowledge('page_view');
      expect(knowledge).toBeDefined();
      expect(knowledge!.event_name).toBe('page_view');
    });

    it('should_fire_rules가 있어야 함', () => {
      const knowledge = getEventKnowledge('page_view')!;
      expect(knowledge.should_fire_rules.length).toBeGreaterThan(0);
      expect(knowledge.should_fire_rules.some(r => r.includes('최초 1회'))).toBe(true);
    });

    it('should_not_fire_rules가 있어야 함', () => {
      const knowledge = getEventKnowledge('page_view')!;
      expect(knowledge.should_not_fire_rules.length).toBeGreaterThan(0);
      expect(knowledge.should_not_fire_rules.some(r => r.includes('2회 이상'))).toBe(true);
    });

    it('test_scenarios가 있어야 함', () => {
      const knowledge = getEventKnowledge('page_view')!;
      expect(knowledge.test_scenarios.length).toBeGreaterThan(0);
      expect(knowledge.test_scenarios[0].index).toBe(1);
      expect(knowledge.test_scenarios[0].scenario).toBeTruthy();
    });

    it('check_points가 있어야 함', () => {
      const knowledge = getEventKnowledge('page_view')!;
      expect(knowledge.check_points.length).toBeGreaterThan(0);
    });
  });

  describe('purchase 지식 검증', () => {
    it('purchase 지식이 존재해야 함', () => {
      const knowledge = getEventKnowledge('purchase');
      expect(knowledge).toBeDefined();
    });

    it('결제 실패 시 발생하면 안 됨이 포함되어야 함', () => {
      const rules = getShouldNotFireRules('purchase');
      expect(rules.length).toBeGreaterThan(0);
      expect(rules.some(r => r.includes('결제') && r.includes('실패'))).toBe(true);
    });
  });

  describe('add_to_cart 지식 검증', () => {
    it('add_to_cart 지식이 존재해야 함', () => {
      const knowledge = getEventKnowledge('add_to_cart');
      expect(knowledge).toBeDefined();
    });

    it('옵션 미선택/재고 부족 시 발생하면 안 됨', () => {
      const rules = getShouldNotFireRules('add_to_cart');
      expect(rules.some(r => r.includes('옵션') || r.includes('재고'))).toBe(true);
    });
  });

  describe('getShouldNotFireRules() 검증', () => {
    it('존재하는 이벤트는 규칙을 반환해야 함', () => {
      const rules = getShouldNotFireRules('page_view');
      expect(rules.length).toBeGreaterThan(0);
    });

    it('존재하지 않는 이벤트는 빈 배열 반환', () => {
      const rules = getShouldNotFireRules('nonexistent_event');
      expect(rules).toEqual([]);
    });
  });

  describe('getCheckPoints() 검증', () => {
    it('존재하는 이벤트는 체크포인트를 반환해야 함', () => {
      const points = getCheckPoints('page_view');
      expect(points.length).toBeGreaterThan(0);
    });

    it('존재하지 않는 이벤트는 빈 배열 반환', () => {
      const points = getCheckPoints('nonexistent_event');
      expect(points).toEqual([]);
    });
  });

  describe('주요 이벤트 존재 확인', () => {
    const requiredEvents = [
      'page_view', 'view_item', 'add_to_cart', 'begin_checkout',
      'purchase', 'login', 'sign_up', 'view_item_list', 'select_item',
    ];

    for (const eventName of requiredEvents) {
      it(`${eventName} 지식이 등록되어 있어야 함`, () => {
        const knowledge = getEventKnowledge(eventName);
        expect(knowledge).toBeDefined();
        expect(knowledge!.event_name).toBe(eventName);
      });
    }
  });
});
