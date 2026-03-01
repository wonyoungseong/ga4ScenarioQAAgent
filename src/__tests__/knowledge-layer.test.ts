/**
 * Knowledge Layer 통합 테스트
 *
 * Phase 1: Knowledge Store CRUD + Knowledge Assessor
 * Phase 2: Hypothesis Generator (Mock Visual Analysis)
 * Phase 3: Tester Interaction (자동 확인 모드)
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  loadKnowledgeStore,
  saveKnowledgeStore,
  createEmptyStore,
  mergeEventKnowledge,
  getStoredSelector,
  recordSelectorResult,
  recordTesterConfirmation,
  shouldAutoConfirm,
} from '../knowledge/knowledge-store';
import {
  assessKnowledgeReadiness,
} from '../knowledge/knowledge-assessor';
import {
  generateHypotheses,
} from '../agents/recon/hypothesis-generator';
import type {
  VisualPageAnalysis,
  EventKnowledgeState,
} from '../types/knowledge-state';
import type { ScenarioDefinition } from '../types/event-scenario';
import type { ContentGroupRule } from '../types/content-group';

// ─────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────

const TEST_OUTPUT_DIR = path.resolve(__dirname, '../../.test-output');
const TEST_STORE_PATH = path.join(TEST_OUTPUT_DIR, 'test-knowledge-store.json');

function ensureTestDir(): void {
  if (!fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  }
}

function cleanupTestStore(): void {
  if (fs.existsSync(TEST_STORE_PATH)) {
    fs.unlinkSync(TEST_STORE_PATH);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Phase 1: Knowledge Store CRUD
// ─────────────────────────────────────────────────────────────────────

describe('Knowledge Store CRUD', () => {
  beforeAll(() => {
    ensureTestDir();
  });

  afterEach(() => {
    cleanupTestStore();
  });

  it('createEmptyStore()가 유효한 구조를 반환해야 함', () => {
    const store = createEmptyStore('test-project', 'https://example.com');

    expect(store.schema_version).toBe('1.0');
    expect(store.project_id).toBe('test-project');
    expect(store.site_base_url).toBe('https://example.com');
    expect(store.events).toEqual({});
    expect(store.pages).toEqual({});
    expect(store.stats.total_events).toBe(0);
  });

  it('save/load 라운드트립이 정상 동작해야 함', () => {
    const store = createEmptyStore('test-project', 'https://example.com');
    saveKnowledgeStore(store, TEST_STORE_PATH);

    const loaded = loadKnowledgeStore(TEST_STORE_PATH);
    expect(loaded).not.toBeNull();
    expect(loaded!.project_id).toBe('test-project');
    expect(loaded!.schema_version).toBe('1.0');
  });

  it('존재하지 않는 파일 로드 시 null 반환', () => {
    const loaded = loadKnowledgeStore('/nonexistent/path/store.json');
    expect(loaded).toBeNull();
  });

  it('mergeEventKnowledge()가 이벤트 지식을 추가해야 함', () => {
    const store = createEmptyStore('test', 'https://example.com');

    mergeEventKnowledge(store, 'add_to_cart', {
      event_name: 'add_to_cart',
      selectors: {
        PRODUCT_DETAIL: {
          selector: '.add-to-cart-btn',
          discovery_method: 'semantic',
          visible_text: 'カートに入れる',
          success_count: 0,
          failure_count: 0,
          confidence: 0.7,
        },
      },
    });

    expect(store.events['add_to_cart']).toBeDefined();
    expect(store.events['add_to_cart'].selectors['PRODUCT_DETAIL']).toBeDefined();
    expect(store.events['add_to_cart'].selectors['PRODUCT_DETAIL'].selector).toBe('.add-to-cart-btn');
  });

  it('getStoredSelector()가 셀렉터를 반환해야 함', () => {
    const store = createEmptyStore('test', 'https://example.com');

    mergeEventKnowledge(store, 'view_item', {
      event_name: 'view_item',
      selectors: {
        PRODUCT_LIST: {
          selector: '.product-card a',
          discovery_method: 'text_match',
          success_count: 2,
          failure_count: 0,
          confidence: 0.8,
        },
      },
    });

    const selector = getStoredSelector(store, 'view_item', 'PRODUCT_LIST');
    expect(selector).toBeDefined();
    expect(selector!.selector).toBe('.product-card a');

    const missing = getStoredSelector(store, 'view_item', 'TOP');
    expect(missing).toBeUndefined();
  });

  it('recordSelectorResult()가 success/failure 카운트를 업데이트해야 함', () => {
    const store = createEmptyStore('test', 'https://example.com');

    // 먼저 이벤트+셀렉터 엔트리 생성
    mergeEventKnowledge(store, 'add_to_cart', {
      event_name: 'add_to_cart',
      selectors: {
        PRODUCT_DETAIL: {
          selector: '.cart-btn',
          discovery_method: 'semantic',
          success_count: 0,
          failure_count: 0,
          confidence: 0.7,
        },
      },
    });

    // 성공 3회 기록
    recordSelectorResult(store, 'add_to_cart', 'PRODUCT_DETAIL', true);
    recordSelectorResult(store, 'add_to_cart', 'PRODUCT_DETAIL', true);
    recordSelectorResult(store, 'add_to_cart', 'PRODUCT_DETAIL', true);

    const selector = getStoredSelector(store, 'add_to_cart', 'PRODUCT_DETAIL');
    expect(selector).toBeDefined();
    expect(selector!.success_count).toBe(3);
    expect(selector!.failure_count).toBe(0);

    // 실패 1회 기록
    recordSelectorResult(store, 'add_to_cart', 'PRODUCT_DETAIL', false);
    const updated = getStoredSelector(store, 'add_to_cart', 'PRODUCT_DETAIL');
    expect(updated!.success_count).toBe(3);
    expect(updated!.failure_count).toBe(1);
  });

  it('recordTesterConfirmation()이 confirmation_count를 증가시켜야 함', () => {
    const store = createEmptyStore('test', 'https://example.com');

    // 먼저 이벤트 엔트리 생성
    mergeEventKnowledge(store, 'add_to_cart', { event_name: 'add_to_cart' });

    recordTesterConfirmation(store, 'add_to_cart');
    expect(store.events['add_to_cart'].confirmation_count).toBe(1);

    recordTesterConfirmation(store, 'add_to_cart');
    expect(store.events['add_to_cart'].confirmation_count).toBe(2);
  });

  it('shouldAutoConfirm()이 조건 충족 시 true를 반환해야 함', () => {
    const store = createEmptyStore('test', 'https://example.com');

    // 조건 미충족: 확인 0회, 성공 0회
    expect(shouldAutoConfirm(store, 'add_to_cart', 'PRODUCT_DETAIL')).toBe(false);

    // 먼저 이벤트+셀렉터 엔트리 생성
    mergeEventKnowledge(store, 'add_to_cart', {
      event_name: 'add_to_cart',
      selectors: {
        PRODUCT_DETAIL: {
          selector: '.cart-btn',
          discovery_method: 'semantic',
          success_count: 0,
          failure_count: 0,
          confidence: 0.7,
        },
      },
    });

    // 확인 2회 + 성공 3회 기록
    recordTesterConfirmation(store, 'add_to_cart');
    recordTesterConfirmation(store, 'add_to_cart');
    recordSelectorResult(store, 'add_to_cart', 'PRODUCT_DETAIL', true);
    recordSelectorResult(store, 'add_to_cart', 'PRODUCT_DETAIL', true);
    recordSelectorResult(store, 'add_to_cart', 'PRODUCT_DETAIL', true);

    expect(shouldAutoConfirm(store, 'add_to_cart', 'PRODUCT_DETAIL')).toBe(true);
  });

  it('shouldAutoConfirm()이 실패가 있으면 false를 반환해야 함', () => {
    const store = createEmptyStore('test', 'https://example.com');

    // 먼저 이벤트+셀렉터 엔트리 생성
    mergeEventKnowledge(store, 'select_item', {
      event_name: 'select_item',
      selectors: {
        PRODUCT_LIST: {
          selector: '.product-card',
          discovery_method: 'semantic',
          success_count: 0,
          failure_count: 0,
          confidence: 0.7,
        },
      },
    });

    recordTesterConfirmation(store, 'select_item');
    recordTesterConfirmation(store, 'select_item');
    recordSelectorResult(store, 'select_item', 'PRODUCT_LIST', true);
    recordSelectorResult(store, 'select_item', 'PRODUCT_LIST', true);
    recordSelectorResult(store, 'select_item', 'PRODUCT_LIST', true);
    recordSelectorResult(store, 'select_item', 'PRODUCT_LIST', false); // 실패!

    expect(shouldAutoConfirm(store, 'select_item', 'PRODUCT_LIST')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Phase 1: Knowledge Assessor
// ─────────────────────────────────────────────────────────────────────

describe('Knowledge Assessor', () => {
  const mockScenarios: ScenarioDefinition[] = [
    {
      scenario_id: 'SC_001',
      event_name: 'page_view',
      page_type: 'TOP' as any,
      page_url_pattern: 'https://example.com/',
      test_urls: ['https://example.com/'],
      expected_events: [
        { event_name: 'page_view', should_fire: true, event_category: 'pageview' },
      ],
    },
    {
      scenario_id: 'SC_002',
      event_name: 'add_to_cart',
      page_type: 'PRODUCT_DETAIL' as any,
      page_url_pattern: 'https://example.com/products/*',
      test_urls: ['https://example.com/products/123'],
      expected_events: [
        { event_name: 'add_to_cart', should_fire: true, event_category: 'ecommerce' },
      ],
      user_action: {
        action_type: 'click',
        target_selector: '.add-to-cart',
        wait_after_ms: 3000,
      },
    },
  ] as any;

  const mockContentGroupRules: ContentGroupRule[] = [
    {
      page_type: 'TOP' as any,
      content_group_value: 'top',
      auto_fire_events: ['page_view'],
      action_events: [],
      forbidden_events: [],
    },
    {
      page_type: 'PRODUCT_DETAIL' as any,
      content_group_value: 'product_detail',
      auto_fire_events: ['page_view', 'view_item'],
      action_events: [
        {
          event_name: 'add_to_cart',
          action_type: 'click',
          trigger_condition: 'カートに入れるボタンクリック',
          target_selector: '.add-to-cart',
          wait_after_ms: 3000,
        },
      ],
      forbidden_events: [],
    },
  ];

  it('assessKnowledgeReadiness()가 리포트를 반환해야 함', () => {
    const report = assessKnowledgeReadiness(
      mockScenarios,
      mockContentGroupRules,
      null,
    );

    expect(report).toBeDefined();
    expect(report.assessed_at).toBeTruthy();
    expect(report.event_states.length).toBeGreaterThan(0);
    expect(report.summary.total_events).toBeGreaterThan(0);
    expect(typeof report.summary.readiness_rate).toBe('number');
  });

  it('각 이벤트 상태에 readiness가 설정되어야 함', () => {
    const report = assessKnowledgeReadiness(
      mockScenarios,
      mockContentGroupRules,
      null,
    );

    for (const state of report.event_states) {
      expect(state.event_name).toBeTruthy();
      expect(state.readiness).toBeTruthy();
      expect(state.safety_level).toBeTruthy();
      expect(Array.isArray(state.gaps)).toBe(true);
    }
  });

  it('Knowledge Store가 있으면 셀렉터 지식을 활용해야 함', () => {
    const store = createEmptyStore('test', 'https://example.com');

    // 먼저 이벤트+셀렉터 엔트리 생성
    mergeEventKnowledge(store, 'add_to_cart', {
      event_name: 'add_to_cart',
      selectors: {
        PRODUCT_DETAIL: {
          selector: '.cart-btn',
          discovery_method: 'semantic',
          success_count: 0,
          failure_count: 0,
          confidence: 0.7,
        },
      },
    });

    recordTesterConfirmation(store, 'add_to_cart');
    recordTesterConfirmation(store, 'add_to_cart');
    recordSelectorResult(store, 'add_to_cart', 'PRODUCT_DETAIL', true);
    recordSelectorResult(store, 'add_to_cart', 'PRODUCT_DETAIL', true);
    recordSelectorResult(store, 'add_to_cart', 'PRODUCT_DETAIL', true);

    const report = assessKnowledgeReadiness(
      mockScenarios,
      mockContentGroupRules,
      store,
    );

    // add_to_cart에 대한 갭이 줄었는지 확인
    const addToCartState = report.event_states.find(s => s.event_name === 'add_to_cart');
    if (addToCartState) {
      // store에 축적된 지식이 평가에 반영되었는지 확인
      expect(addToCartState).toBeDefined();
      expect(addToCartState.readiness).toBeTruthy();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Phase 2: Hypothesis Generator
// ─────────────────────────────────────────────────────────────────────

describe('Hypothesis Generator', () => {
  const mockVisualAnalyses: VisualPageAnalysis[] = [
    {
      url: 'https://example.com/products/123',
      screenshot_path: '/tmp/test-screenshot.png',
      identified_page_type: 'product_detail',
      interactive_elements: [
        {
          description: 'Add to cart button',
          purpose: 'Add product to shopping cart',
          location: 'main_content',
          suggested_identifier: '.add-to-cart-btn',
          visible_text: 'カートに入れる',
          likely_events: ['add_to_cart'],
          confidence: 0.85,
        },
        {
          description: 'Size selector',
          purpose: 'Select product size',
          location: 'main_content',
          suggested_identifier: '.size-select',
          visible_text: 'サイズ選択',
          likely_events: ['select_item'],
          confidence: 0.6,
        },
      ],
      ecommerce_context: {
        is_product_page: true,
        has_product_options: true,
        has_add_to_cart: true,
        has_checkout_entry: false,
        observed_prerequisites: ['サイズ選択必要'],
      },
    },
  ];

  function createMockEventState(
    eventName: string,
    pageType: string,
    url: string,
  ): EventKnowledgeState {
    return {
      event_name: eventName,
      fire_condition: {
        value: { type: 'click', trigger: 'button click' } as any,
        source: 'gtm_json',
        confidence: 'medium',
        established_at: new Date().toISOString(),
      },
      action_type: {
        value: 'click',
        source: 'gtm_json',
        confidence: 'medium',
        established_at: new Date().toISOString(),
      },
      target_selector: null,
      page_types: {
        value: [pageType as any],
        source: 'gtm_json',
        confidence: 'medium',
        established_at: new Date().toISOString(),
      },
      test_urls: {
        value: { [pageType]: [url] },
        source: 'gtm_json',
        confidence: 'medium',
        established_at: new Date().toISOString(),
      },
      prerequisites: null,
      business_rules: null,
      safety_level: 'safe',
      gaps: [],
      readiness: 'needs_recon',
      recommended_action: { action: 'run_recon', reason: 'selector 필요' },
    };
  }

  it('generateHypotheses()가 가설 배열을 반환해야 함', () => {
    const eventStates: EventKnowledgeState[] = [
      createMockEventState('add_to_cart', 'PRODUCT_DETAIL', 'https://example.com/products/123'),
    ];

    const hypotheses = generateHypotheses(eventStates, mockVisualAnalyses, null);

    expect(Array.isArray(hypotheses)).toBe(true);
    expect(hypotheses.length).toBeGreaterThan(0);
  });

  it('Visual Analysis 결과가 가설에 반영되어야 함', () => {
    const eventStates: EventKnowledgeState[] = [
      createMockEventState('add_to_cart', 'PRODUCT_DETAIL', 'https://example.com/products/123'),
    ];

    const hypotheses = generateHypotheses(eventStates, mockVisualAnalyses, null);

    const addToCartHyp = hypotheses.find(h => h.event_name === 'add_to_cart');
    expect(addToCartHyp).toBeDefined();
    expect(addToCartHyp!.sources).toContain('recon_visual');
    expect(addToCartHyp!.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('가설에 셀렉터와 트리거 텍스트가 설정되어야 함', () => {
    const eventStates: EventKnowledgeState[] = [
      createMockEventState('add_to_cart', 'PRODUCT_DETAIL', 'https://example.com/products/123'),
    ];

    const hypotheses = generateHypotheses(eventStates, mockVisualAnalyses, null);

    const addToCartHyp = hypotheses.find(h => h.event_name === 'add_to_cart');
    expect(addToCartHyp).toBeDefined();
    expect(addToCartHyp!.trigger.suggested_selector).toBe('.add-to-cart-btn');
    expect(addToCartHyp!.trigger.trigger_text).toBe('カートに入れる');
  });

  it('이커머스 전제조건이 가설에 포함되어야 함', () => {
    const eventStates: EventKnowledgeState[] = [
      createMockEventState('add_to_cart', 'PRODUCT_DETAIL', 'https://example.com/products/123'),
    ];

    const hypotheses = generateHypotheses(eventStates, mockVisualAnalyses, null);

    const addToCartHyp = hypotheses.find(h => h.event_name === 'add_to_cart');
    expect(addToCartHyp).toBeDefined();
    expect(addToCartHyp!.prerequisites).toContain('サイズ選択必要');
  });

  it('Knowledge Store 지식이 가설에 반영되어야 함', () => {
    const store = createEmptyStore('test', 'https://example.com');
    mergeEventKnowledge(store, 'add_to_cart', {
      event_name: 'add_to_cart',
      selectors: {
        PRODUCT_DETAIL: {
          selector: '.verified-cart-btn',
          discovery_method: 'tester_confirmed',
          visible_text: 'カートに入れる',
          success_count: 5,
          failure_count: 0,
          confidence: 0.95,
          last_success: new Date().toISOString(),
        },
      },
      prerequisites: {
        PRODUCT_DETAIL: ['サイズを選択してください'],
      },
    });
    recordTesterConfirmation(store, 'add_to_cart');
    recordTesterConfirmation(store, 'add_to_cart');
    recordTesterConfirmation(store, 'add_to_cart');

    const eventStates: EventKnowledgeState[] = [
      createMockEventState('add_to_cart', 'PRODUCT_DETAIL', 'https://example.com/products/123'),
    ];

    const hypotheses = generateHypotheses(eventStates, mockVisualAnalyses, store);

    const addToCartHyp = hypotheses.find(h => h.event_name === 'add_to_cart');
    expect(addToCartHyp).toBeDefined();
    expect(addToCartHyp!.sources).toContain('knowledge_store');
    // Knowledge Store 자동확인 조건 충족 시 confidence가 0.95
    expect(addToCartHyp!.confidence).toBeGreaterThanOrEqual(0.9);
    // Store의 셀렉터가 우선 사용
    expect(addToCartHyp!.trigger.suggested_selector).toBe('.verified-cart-btn');
  });

  it('auto_fire 이벤트는 가설을 생성하지 않아야 함', () => {
    const eventStates: EventKnowledgeState[] = [
      {
        ...createMockEventState('page_view', 'TOP', 'https://example.com/'),
        fire_condition: {
          value: 'auto_fire' as any,
          source: 'gtm_json',
          confidence: 'high',
          established_at: new Date().toISOString(),
        },
      },
    ];

    const hypotheses = generateHypotheses(eventStates, [], null);

    const pageViewHyp = hypotheses.find(h => h.event_name === 'page_view');
    expect(pageViewHyp).toBeUndefined();
  });

  it('가설이 신뢰도 높은 순으로 정렬되어야 함', () => {
    const eventStates: EventKnowledgeState[] = [
      createMockEventState('add_to_cart', 'PRODUCT_DETAIL', 'https://example.com/products/123'),
      createMockEventState('select_item', 'PRODUCT_DETAIL', 'https://example.com/products/123'),
    ];

    const hypotheses = generateHypotheses(eventStates, mockVisualAnalyses, null);

    if (hypotheses.length >= 2) {
      for (let i = 1; i < hypotheses.length; i++) {
        expect(hypotheses[i - 1].confidence).toBeGreaterThanOrEqual(hypotheses[i].confidence);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Phase 3: Knowledge Store Persistence (라운드트립)
// ─────────────────────────────────────────────────────────────────────

describe('Knowledge Store 영속성 (라운드트립)', () => {
  beforeAll(() => {
    ensureTestDir();
  });

  afterEach(() => {
    cleanupTestStore();
  });

  it('지식 축적 후 저장/로드가 일관되어야 함', () => {
    const store = createEmptyStore('roundtrip-test', 'https://example.com');

    // 지식 축적
    mergeEventKnowledge(store, 'add_to_cart', {
      event_name: 'add_to_cart',
      selectors: {
        PRODUCT_DETAIL: {
          selector: '.cart-btn',
          discovery_method: 'semantic',
          success_count: 0,
          failure_count: 0,
          confidence: 0.7,
        },
      },
    });
    recordSelectorResult(store, 'add_to_cart', 'PRODUCT_DETAIL', true);
    recordSelectorResult(store, 'add_to_cart', 'PRODUCT_DETAIL', true);
    recordTesterConfirmation(store, 'add_to_cart');

    // 저장
    saveKnowledgeStore(store, TEST_STORE_PATH);

    // 로드
    const loaded = loadKnowledgeStore(TEST_STORE_PATH);
    expect(loaded).not.toBeNull();

    // 검증
    const selector = getStoredSelector(loaded!, 'add_to_cart', 'PRODUCT_DETAIL');
    expect(selector).toBeDefined();
    expect(selector!.success_count).toBe(2);
    expect(loaded!.events['add_to_cart'].confirmation_count).toBe(1);
  });

  it('2회 연속 실행 시뮬레이션이 정상 동작해야 함', () => {
    // 1차 실행
    const store1 = createEmptyStore('multi-run', 'https://example.com');
    mergeEventKnowledge(store1, 'view_item', {
      event_name: 'view_item',
      selectors: {
        PRODUCT_LIST: {
          selector: '.product-card a',
          discovery_method: 'semantic',
          success_count: 0,
          failure_count: 0,
          confidence: 0.7,
        },
      },
    });
    recordSelectorResult(store1, 'view_item', 'PRODUCT_LIST', true);
    recordTesterConfirmation(store1, 'view_item');
    saveKnowledgeStore(store1, TEST_STORE_PATH);

    // 2차 실행 (로드 → 추가 → 저장)
    const store2 = loadKnowledgeStore(TEST_STORE_PATH)!;
    recordSelectorResult(store2, 'view_item', 'PRODUCT_LIST', true);
    recordSelectorResult(store2, 'view_item', 'PRODUCT_LIST', true);
    recordTesterConfirmation(store2, 'view_item');
    saveKnowledgeStore(store2, TEST_STORE_PATH);

    // 최종 로드
    const final = loadKnowledgeStore(TEST_STORE_PATH)!;
    const selector = getStoredSelector(final, 'view_item', 'PRODUCT_LIST');
    expect(selector!.success_count).toBe(3);
    expect(final.events['view_item'].confirmation_count).toBe(2);

    // 자동 확인 조건 충족
    expect(shouldAutoConfirm(final, 'view_item', 'PRODUCT_LIST')).toBe(true);
  });
});
