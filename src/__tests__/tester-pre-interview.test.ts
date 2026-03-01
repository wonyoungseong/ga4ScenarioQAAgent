/**
 * Tester Pre-Interview 테스트
 *
 * 1. 질문 생성 로직 (이벤트별 적절한 질문)
 * 2. 답변 컴파일 (TesterInsight 변환)
 * 3. Knowledge Store 연동 (자동 스킵, 재질문 판정)
 * 4. Knowledge Store Tester Insight CRUD
 */

import {
  EVENT_INTERVIEW_QUESTIONS,
  generateInterviewQuestions,
  compileInsights,
  shouldSkipInterview,
  shouldReInterview,
} from '../agents/recon/tester-pre-interview';
import {
  createEmptyStore,
  mergeEventKnowledge,
  saveTesterInsight,
  loadTesterInsight,
  recordSelectorResult,
} from '../knowledge/knowledge-store';
import type { PreInterviewAnswer, TesterInsight } from '../types/knowledge-state';
import type { PageTypeEnum } from '../types/common';

// ─────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────

function makeAnswer(questionId: string, value: string): PreInterviewAnswer {
  return {
    question_id: questionId,
    value,
    answered_at: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────
// 1. 질문 뱅크 구조 검증
// ─────────────────────────────────────────────────────────────────────

describe('EVENT_INTERVIEW_QUESTIONS (질문 뱅크)', () => {
  it('add_to_cart 질문이 정의되어야 함', () => {
    const questions = EVENT_INTERVIEW_QUESTIONS['add_to_cart'];
    expect(questions).toBeDefined();
    expect(questions.length).toBeGreaterThanOrEqual(5);

    // 핵심 질문 존재 확인
    const ids = questions.map(q => q.question_id);
    expect(ids).toContain('atc_visual_1');  // 버튼 텍스트
    expect(ids).toContain('atc_visual_2');  // 버튼 위치
    expect(ids).toContain('atc_tech_1');    // CSS 셀렉터
    expect(ids).toContain('atc_post_1');    // 카트 추가 후 동작
  });

  it('begin_checkout 질문이 정의되어야 함', () => {
    const questions = EVENT_INTERVIEW_QUESTIONS['begin_checkout'];
    expect(questions).toBeDefined();

    const ids = questions.map(q => q.question_id);
    expect(ids).toContain('bc_flow_1');   // 발생 단계
    expect(ids).toContain('bc_multi_1');  // 멀티스텝
    expect(ids).toContain('bc_visual_1'); // 버튼 텍스트
  });

  it('select_item, write_review, remove_from_cart 질문이 정의되어야 함', () => {
    expect(EVENT_INTERVIEW_QUESTIONS['select_item']).toBeDefined();
    expect(EVENT_INTERVIEW_QUESTIONS['write_review']).toBeDefined();
    expect(EVENT_INTERVIEW_QUESTIONS['remove_from_cart']).toBeDefined();
  });

  it('모든 질문에 필수 필드가 있어야 함', () => {
    for (const [eventName, questions] of Object.entries(EVENT_INTERVIEW_QUESTIONS)) {
      for (const q of questions) {
        expect(q.question_id).toBeTruthy();
        expect(q.event_name).toBe(eventName);
        expect(q.category).toBeTruthy();
        expect(q.question).toBeTruthy();
        expect(q.purpose).toBeTruthy();
        expect(typeof q.priority).toBe('number');
      }
    }
  });

  it('질문 뱅크에 없는 이벤트는 undefined', () => {
    expect(EVENT_INTERVIEW_QUESTIONS['nonexistent_event']).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. 질문 생성 로직 (generateInterviewQuestions)
// ─────────────────────────────────────────────────────────────────────

describe('generateInterviewQuestions', () => {
  it('등록된 이벤트에 대해 질문을 생성해야 함', () => {
    const { questions, skippedEvents } = generateInterviewQuestions(
      ['add_to_cart', 'begin_checkout'],
      { add_to_cart: ['PRODUCT_DETAIL' as PageTypeEnum], begin_checkout: ['CART' as PageTypeEnum] },
      null,
    );

    expect(questions.length).toBeGreaterThan(0);
    expect(skippedEvents).toHaveLength(0);

    const eventNames = [...new Set(questions.map(q => q.event_name))];
    expect(eventNames).toContain('add_to_cart');
    expect(eventNames).toContain('begin_checkout');
  });

  it('질문 뱅크에 없는 이벤트는 무시', () => {
    const { questions } = generateInterviewQuestions(
      ['page_view', 'view_item'],
      { page_view: ['TOP' as PageTypeEnum], view_item: ['PRODUCT_DETAIL' as PageTypeEnum] },
      null,
    );

    // page_view, view_item은 질문 뱅크에 없음
    expect(questions).toHaveLength(0);
  });

  it('Knowledge Store에 고신뢰도 셀렉터가 있으면 이벤트를 스킵해야 함', () => {
    const store = createEmptyStore('test', 'https://example.com');

    // add_to_cart: 고신뢰도 셀렉터 + tester_insights 있음
    mergeEventKnowledge(store, 'add_to_cart', {
      event_name: 'add_to_cart',
      selectors: {
        PRODUCT_DETAIL: {
          selector: '.cart-btn',
          discovery_method: 'semantic',
          success_count: 5,
          failure_count: 0,
          confidence: 0.9,
        },
      },
    });
    saveTesterInsight(store, 'add_to_cart', 'PRODUCT_DETAIL', {
      event_name: 'add_to_cart',
      page_type: 'PRODUCT_DETAIL',
      is_multi_step: false,
      prerequisite_actions: [],
      raw_answers: [],
      compiled_at: new Date().toISOString(),
    });

    const { questions, skippedEvents } = generateInterviewQuestions(
      ['add_to_cart', 'begin_checkout'],
      {
        add_to_cart: ['PRODUCT_DETAIL' as PageTypeEnum],
        begin_checkout: ['CART' as PageTypeEnum],
      },
      store,
    );

    expect(skippedEvents).toContain('add_to_cart');
    // begin_checkout은 질문이 생성되어야 함
    const bcQuestions = questions.filter(q => q.event_name === 'begin_checkout');
    expect(bcQuestions.length).toBeGreaterThan(0);
  });

  it('질문이 우선순위순으로 정렬되어야 함', () => {
    const { questions } = generateInterviewQuestions(
      ['add_to_cart'],
      { add_to_cart: ['PRODUCT_DETAIL' as PageTypeEnum] },
      null,
    );

    for (let i = 1; i < questions.length; i++) {
      if (questions[i - 1].event_name === questions[i].event_name) {
        expect(questions[i - 1].priority).toBeLessThanOrEqual(questions[i].priority);
      }
    }
  });

  it('재인터뷰 시 우선순위 높은 질문만 생성', () => {
    const store = createEmptyStore('test', 'https://example.com');

    // 셀렉터 있지만 실패 기록 있음 → 재인터뷰 대상
    mergeEventKnowledge(store, 'add_to_cart', {
      event_name: 'add_to_cart',
      selectors: {
        PRODUCT_DETAIL: {
          selector: '.wrong-btn',
          discovery_method: 'semantic',
          success_count: 0,
          failure_count: 2,
          confidence: 0.3,
        },
      },
    });

    const { questions } = generateInterviewQuestions(
      ['add_to_cart'],
      { add_to_cart: ['PRODUCT_DETAIL' as PageTypeEnum] },
      store,
    );

    // priority > 2인 질문이 제외되어야 함
    const highPriorityOnly = questions.every(q => q.priority <= 2);
    expect(highPriorityOnly).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. shouldSkipInterview / shouldReInterview
// ─────────────────────────────────────────────────────────────────────

describe('shouldSkipInterview', () => {
  it('store가 null이면 false', () => {
    expect(shouldSkipInterview(null, 'add_to_cart', 'PRODUCT_DETAIL')).toBe(false);
  });

  it('인사이트와 셀렉터가 없으면 false', () => {
    const store = createEmptyStore('test', 'https://example.com');
    expect(shouldSkipInterview(store, 'add_to_cart', 'PRODUCT_DETAIL')).toBe(false);
  });

  it('인사이트만 있고 셀렉터가 없으면 false', () => {
    const store = createEmptyStore('test', 'https://example.com');
    saveTesterInsight(store, 'add_to_cart', 'PRODUCT_DETAIL', {
      event_name: 'add_to_cart',
      page_type: 'PRODUCT_DETAIL',
      is_multi_step: false,
      prerequisite_actions: [],
      raw_answers: [],
      compiled_at: new Date().toISOString(),
    });

    expect(shouldSkipInterview(store, 'add_to_cart', 'PRODUCT_DETAIL')).toBe(false);
  });

  it('셀렉터 성공 3회 + 실패 0 → true', () => {
    const store = createEmptyStore('test', 'https://example.com');
    saveTesterInsight(store, 'add_to_cart', 'PRODUCT_DETAIL', {
      event_name: 'add_to_cart',
      page_type: 'PRODUCT_DETAIL',
      is_multi_step: false,
      prerequisite_actions: [],
      raw_answers: [],
      compiled_at: new Date().toISOString(),
    });
    mergeEventKnowledge(store, 'add_to_cart', {
      event_name: 'add_to_cart',
      selectors: {
        PRODUCT_DETAIL: {
          selector: '.cart-btn',
          discovery_method: 'semantic',
          success_count: 3,
          failure_count: 0,
          confidence: 0.85,
        },
      },
    });

    expect(shouldSkipInterview(store, 'add_to_cart', 'PRODUCT_DETAIL')).toBe(true);
  });

  it('confidence >= 0.85 + 실패 0 → true', () => {
    const store = createEmptyStore('test', 'https://example.com');
    saveTesterInsight(store, 'add_to_cart', 'PRODUCT_DETAIL', {
      event_name: 'add_to_cart',
      page_type: 'PRODUCT_DETAIL',
      is_multi_step: false,
      prerequisite_actions: [],
      raw_answers: [],
      compiled_at: new Date().toISOString(),
    });
    mergeEventKnowledge(store, 'add_to_cart', {
      event_name: 'add_to_cart',
      selectors: {
        PRODUCT_DETAIL: {
          selector: '.cart-btn',
          discovery_method: 'tester_confirmed',
          success_count: 1,
          failure_count: 0,
          confidence: 0.90,
        },
      },
    });

    expect(shouldSkipInterview(store, 'add_to_cart', 'PRODUCT_DETAIL')).toBe(true);
  });

  it('실패가 있으면 false', () => {
    const store = createEmptyStore('test', 'https://example.com');
    saveTesterInsight(store, 'add_to_cart', 'PRODUCT_DETAIL', {
      event_name: 'add_to_cart',
      page_type: 'PRODUCT_DETAIL',
      is_multi_step: false,
      prerequisite_actions: [],
      raw_answers: [],
      compiled_at: new Date().toISOString(),
    });
    mergeEventKnowledge(store, 'add_to_cart', {
      event_name: 'add_to_cart',
      selectors: {
        PRODUCT_DETAIL: {
          selector: '.wrong-btn',
          discovery_method: 'semantic',
          success_count: 5,
          failure_count: 1,
          confidence: 0.5,
        },
      },
    });

    expect(shouldSkipInterview(store, 'add_to_cart', 'PRODUCT_DETAIL')).toBe(false);
  });
});

describe('shouldReInterview', () => {
  it('store가 null이면 false', () => {
    expect(shouldReInterview(null, 'add_to_cart', 'PRODUCT_DETAIL')).toBe(false);
  });

  it('셀렉터가 없으면 false', () => {
    const store = createEmptyStore('test', 'https://example.com');
    expect(shouldReInterview(store, 'add_to_cart', 'PRODUCT_DETAIL')).toBe(false);
  });

  it('실패 기록이 있으면 true', () => {
    const store = createEmptyStore('test', 'https://example.com');
    mergeEventKnowledge(store, 'add_to_cart', {
      event_name: 'add_to_cart',
      selectors: {
        PRODUCT_DETAIL: {
          selector: '.wrong-btn',
          discovery_method: 'semantic',
          success_count: 0,
          failure_count: 1,
          confidence: 0.3,
        },
      },
    });

    expect(shouldReInterview(store, 'add_to_cart', 'PRODUCT_DETAIL')).toBe(true);
  });

  it('실패 없으면 false', () => {
    const store = createEmptyStore('test', 'https://example.com');
    mergeEventKnowledge(store, 'add_to_cart', {
      event_name: 'add_to_cart',
      selectors: {
        PRODUCT_DETAIL: {
          selector: '.cart-btn',
          discovery_method: 'semantic',
          success_count: 3,
          failure_count: 0,
          confidence: 0.85,
        },
      },
    });

    expect(shouldReInterview(store, 'add_to_cart', 'PRODUCT_DETAIL')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. 답변 컴파일 (compileInsights)
// ─────────────────────────────────────────────────────────────────────

describe('compileInsights', () => {
  it('add_to_cart 답변을 TesterInsight로 컴파일해야 함', () => {
    const answers: PreInterviewAnswer[] = [
      makeAnswer('atc_flow_1', 'PDP'),
      makeAnswer('atc_visual_1', 'カートに入れる'),
      makeAnswer('atc_visual_2', '상품 폼 내부'),
      makeAnswer('atc_tech_2', '예'),
      makeAnswer('atc_post_1', '카트 드로어 열림'),
    ];

    const insights = compileInsights(answers, {
      add_to_cart: ['PRODUCT_DETAIL' as PageTypeEnum],
    });

    const key = 'add_to_cart:PRODUCT_DETAIL';
    expect(insights[key]).toBeDefined();

    const insight = insights[key];
    expect(insight.event_name).toBe('add_to_cart');
    expect(insight.page_type).toBe('PRODUCT_DETAIL');
    expect(insight.trigger_text).toBe('カートに入れる');
    expect(insight.element_location).toBe('product_form');
    expect(insight.uses_standard_form).toBe(true);
    expect(insight.post_add_to_cart_behavior).toBe('cart_drawer_opens');
    expect(insight.is_multi_step).toBe(false);
  });

  it('add_to_cart CSS 셀렉터를 직접 입력하면 known_selector에 설정', () => {
    const answers: PreInterviewAnswer[] = [
      makeAnswer('atc_tech_1', '#ProductSubmitButton'),
    ];

    const insights = compileInsights(answers, {
      add_to_cart: ['PRODUCT_DETAIL' as PageTypeEnum],
    });

    expect(insights['add_to_cart:PRODUCT_DETAIL'].known_selector).toBe('#ProductSubmitButton');
  });

  it('begin_checkout 멀티스텝 답변 → 전제조건 액션 생성', () => {
    const answers: PreInterviewAnswer[] = [
      makeAnswer('bc_flow_1', '카트 드로어 내 버튼 클릭'),
      makeAnswer('bc_multi_1', '카트 드로어 먼저 열기'),
      makeAnswer('bc_visual_1', '購入手続きに進む'),
      makeAnswer('bc_visual_2', '카트 드로어 내'),
    ];

    const insights = compileInsights(answers, {
      begin_checkout: ['PRODUCT_DETAIL' as PageTypeEnum],
    });

    const insight = insights['begin_checkout:PRODUCT_DETAIL'];
    expect(insight).toBeDefined();
    expect(insight.is_multi_step).toBe(true);
    expect(insight.prerequisite_actions.length).toBeGreaterThan(0);
    expect(insight.trigger_text).toBe('購入手続きに進む');
    expect(insight.element_location).toBe('cart_drawer');

    // 전제조건: 카트 아이콘 클릭 → 대기
    const clickAction = insight.prerequisite_actions.find(a => a.action_type === 'click');
    expect(clickAction).toBeDefined();
    const waitAction = insight.prerequisite_actions.find(a => a.action_type === 'wait');
    expect(waitAction).toBeDefined();
  });

  it('begin_checkout "카트 페이지로 이동" → navigate 전제조건', () => {
    const answers: PreInterviewAnswer[] = [
      makeAnswer('bc_multi_1', '카트 페이지로 이동'),
    ];

    const insights = compileInsights(answers, {
      begin_checkout: ['CART' as PageTypeEnum],
    });

    const insight = insights['begin_checkout:CART'];
    expect(insight.is_multi_step).toBe(true);
    const navAction = insight.prerequisite_actions.find(a => a.action_type === 'navigate');
    expect(navAction).toBeDefined();
    expect(navAction!.url).toBe('/cart');
  });

  it('select_item CSS 셀렉터 입력 시 known_selector 설정', () => {
    const answers: PreInterviewAnswer[] = [
      makeAnswer('si_flow_1', '예'),
      makeAnswer('si_visual_1', '카드 전체'),
      makeAnswer('si_tech_1', '.product-card a'),
    ];

    const insights = compileInsights(answers, {
      select_item: ['PRODUCT_LIST' as PageTypeEnum],
    });

    const insight = insights['select_item:PRODUCT_LIST'];
    expect(insight.known_selector).toBe('.product-card a');
    expect(insight.element_location).toBe('main_content');
  });

  it('write_review 서드파티(Loox) 답변 → third_party_tool 설정', () => {
    const answers: PreInterviewAnswer[] = [
      makeAnswer('wr_flow_1', '서드파티 위젯'),
      makeAnswer('wr_flow_2', 'Loox'),
      makeAnswer('wr_prereq_1', '구매자만'),
    ];

    const insights = compileInsights(answers, {
      write_review: ['PRODUCT_DETAIL' as PageTypeEnum],
    });

    const insight = insights['write_review:PRODUCT_DETAIL'];
    expect(insight.third_party_tool).toBe('Loox');
    expect(insight.element_location).toBe('third_party_widget');
  });

  it('write_review 모달 UI → 멀티스텝 전제조건', () => {
    const answers: PreInterviewAnswer[] = [
      makeAnswer('wr_flow_1', '모달 팝업'),
      makeAnswer('wr_flow_2', 'Shopify 기본'),
    ];

    const insights = compileInsights(answers, {
      write_review: ['PRODUCT_DETAIL' as PageTypeEnum],
    });

    const insight = insights['write_review:PRODUCT_DETAIL'];
    expect(insight.is_multi_step).toBe(true);
    expect(insight.prerequisite_actions.length).toBeGreaterThan(0);
  });

  it('remove_from_cart 드로어만 → 멀티스텝 + cart_drawer 위치', () => {
    const answers: PreInterviewAnswer[] = [
      makeAnswer('rfc_flow_1', 'X 버튼/휴지통 아이콘'),
      makeAnswer('rfc_multi_1', '드로어만'),
    ];

    const insights = compileInsights(answers, {
      remove_from_cart: ['CART' as PageTypeEnum],
    });

    const insight = insights['remove_from_cart:CART'];
    expect(insight.element_location).toBe('cart_drawer');
    expect(insight.is_multi_step).toBe(true);
    const clickAction = insight.prerequisite_actions.find(a => a.action_type === 'click');
    expect(clickAction).toBeDefined();
  });

  it('remove_from_cart "カート ページ만" → navigate 전제조건', () => {
    const answers: PreInterviewAnswer[] = [
      makeAnswer('rfc_flow_1', '"削除" 링크'),
      makeAnswer('rfc_multi_1', '카트 페이지만'),
    ];

    const insights = compileInsights(answers, {
      remove_from_cart: ['PRODUCT_DETAIL' as PageTypeEnum],
    });

    const insight = insights['remove_from_cart:PRODUCT_DETAIL'];
    expect(insight.element_location).toBe('cart_page');
    expect(insight.is_multi_step).toBe(true);
    expect(insight.trigger_text).toBe('削除');
  });

  it('여러 페이지 타입에 대해 각각 인사이트 생성', () => {
    const answers: PreInterviewAnswer[] = [
      makeAnswer('atc_visual_1', 'カートに入れる'),
      makeAnswer('atc_visual_2', '상품 폼 내부'),
    ];

    const insights = compileInsights(answers, {
      add_to_cart: ['PRODUCT_DETAIL' as PageTypeEnum, 'PRODUCT_LIST' as PageTypeEnum],
    });

    expect(insights['add_to_cart:PRODUCT_DETAIL']).toBeDefined();
    expect(insights['add_to_cart:PRODUCT_LIST']).toBeDefined();
    expect(insights['add_to_cart:PRODUCT_DETAIL'].trigger_text).toBe('カートに入れる');
    expect(insights['add_to_cart:PRODUCT_LIST'].trigger_text).toBe('カートに入れる');
  });

  it('답변이 없는 이벤트는 인사이트 생성 안 함', () => {
    const insights = compileInsights([], {
      add_to_cart: ['PRODUCT_DETAIL' as PageTypeEnum],
    });

    expect(Object.keys(insights)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. Knowledge Store Tester Insight CRUD
// ─────────────────────────────────────────────────────────────────────

describe('Knowledge Store - TesterInsight CRUD', () => {
  const sampleInsight: TesterInsight = {
    event_name: 'add_to_cart',
    page_type: 'PRODUCT_DETAIL',
    trigger_text: 'カートに入れる',
    element_location: 'product_form',
    is_multi_step: false,
    prerequisite_actions: [],
    uses_standard_form: true,
    post_add_to_cart_behavior: 'cart_drawer_opens',
    raw_answers: [],
    compiled_at: new Date().toISOString(),
  };

  it('saveTesterInsight()로 인사이트 저장 후 loadTesterInsight()로 조회', () => {
    const store = createEmptyStore('test', 'https://example.com');

    saveTesterInsight(store, 'add_to_cart', 'PRODUCT_DETAIL', sampleInsight);

    const loaded = loadTesterInsight(store, 'add_to_cart', 'PRODUCT_DETAIL');
    expect(loaded).toBeDefined();
    expect(loaded!.trigger_text).toBe('カートに入れる');
    expect(loaded!.element_location).toBe('product_form');
    expect(loaded!.uses_standard_form).toBe(true);
  });

  it('이벤트 항목이 없어도 자동 생성', () => {
    const store = createEmptyStore('test', 'https://example.com');
    expect(store.events['new_event']).toBeUndefined();

    saveTesterInsight(store, 'new_event', 'TOP', {
      ...sampleInsight,
      event_name: 'new_event',
      page_type: 'TOP',
    });

    expect(store.events['new_event']).toBeDefined();
    expect(store.events['new_event'].tester_insights).toBeDefined();
    expect(store.events['new_event'].tester_insights!['TOP']).toBeDefined();
  });

  it('같은 이벤트+페이지타입에 덮어쓰기', () => {
    const store = createEmptyStore('test', 'https://example.com');

    saveTesterInsight(store, 'add_to_cart', 'PRODUCT_DETAIL', sampleInsight);
    saveTesterInsight(store, 'add_to_cart', 'PRODUCT_DETAIL', {
      ...sampleInsight,
      trigger_text: '新しいテキスト',
    });

    const loaded = loadTesterInsight(store, 'add_to_cart', 'PRODUCT_DETAIL');
    expect(loaded!.trigger_text).toBe('新しいテキスト');
  });

  it('다른 페이지타입에 별도 저장', () => {
    const store = createEmptyStore('test', 'https://example.com');

    saveTesterInsight(store, 'add_to_cart', 'PRODUCT_DETAIL', sampleInsight);
    saveTesterInsight(store, 'add_to_cart', 'PRODUCT_LIST', {
      ...sampleInsight,
      page_type: 'PRODUCT_LIST',
      trigger_text: 'クイック追加',
    });

    const pdp = loadTesterInsight(store, 'add_to_cart', 'PRODUCT_DETAIL');
    const plp = loadTesterInsight(store, 'add_to_cart', 'PRODUCT_LIST');
    expect(pdp!.trigger_text).toBe('カートに入れる');
    expect(plp!.trigger_text).toBe('クイック追加');
  });

  it('존재하지 않는 인사이트 조회 시 undefined', () => {
    const store = createEmptyStore('test', 'https://example.com');
    expect(loadTesterInsight(store, 'nonexistent', 'TOP')).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 6. 지식 축적 루프 시뮬레이션
// ─────────────────────────────────────────────────────────────────────

describe('지식 축적 루프 (Knowledge Accumulation Loop)', () => {
  it('Run 1: 전체 질문 → Run 2: 자동 스킵 시뮬레이션', () => {
    const store = createEmptyStore('test', 'https://example.com');
    const eventNames = ['add_to_cart'];
    const pageTypes: Record<string, PageTypeEnum[]> = {
      add_to_cart: ['PRODUCT_DETAIL' as PageTypeEnum],
    };

    // ── Run 1: 모든 질문이 생성됨 ──
    const run1 = generateInterviewQuestions(eventNames, pageTypes, store);
    expect(run1.questions.length).toBeGreaterThan(0);
    expect(run1.skippedEvents).toHaveLength(0);

    // 답변 컴파일 + 저장
    const answers: PreInterviewAnswer[] = [
      makeAnswer('atc_visual_1', 'カートに入れる'),
      makeAnswer('atc_visual_2', '상품 폼 내부'),
      makeAnswer('atc_tech_1', ''),
      makeAnswer('atc_tech_2', '예'),
    ];
    const insights = compileInsights(answers, pageTypes);
    const insightKey = 'add_to_cart:PRODUCT_DETAIL';
    saveTesterInsight(store, 'add_to_cart', 'PRODUCT_DETAIL', insights[insightKey]);

    // 셀렉터도 저장 (성공 3회)
    mergeEventKnowledge(store, 'add_to_cart', {
      event_name: 'add_to_cart',
      selectors: {
        PRODUCT_DETAIL: {
          selector: '.product-form__submit',
          discovery_method: 'form_role',
          success_count: 3,
          failure_count: 0,
          confidence: 0.85,
        },
      },
    });

    // ── Run 2: 자동 스킵 ──
    const run2 = generateInterviewQuestions(eventNames, pageTypes, store);
    expect(run2.skippedEvents).toContain('add_to_cart');
    expect(run2.questions.filter(q => q.event_name === 'add_to_cart')).toHaveLength(0);
  });

  it('Run 2에서 셀렉터 실패 → Run 3에서 재인터뷰', () => {
    const store = createEmptyStore('test', 'https://example.com');
    const pageTypes: Record<string, PageTypeEnum[]> = {
      add_to_cart: ['PRODUCT_DETAIL' as PageTypeEnum],
    };

    // 인사이트 + 셀렉터 저장
    saveTesterInsight(store, 'add_to_cart', 'PRODUCT_DETAIL', {
      event_name: 'add_to_cart',
      page_type: 'PRODUCT_DETAIL',
      is_multi_step: false,
      prerequisite_actions: [],
      raw_answers: [],
      compiled_at: new Date().toISOString(),
    });
    mergeEventKnowledge(store, 'add_to_cart', {
      event_name: 'add_to_cart',
      selectors: {
        PRODUCT_DETAIL: {
          selector: '.wrong-btn',
          discovery_method: 'semantic',
          success_count: 0,
          failure_count: 0,
          confidence: 0.7,
        },
      },
    });

    // 실패 기록
    recordSelectorResult(store, 'add_to_cart', 'PRODUCT_DETAIL', false);

    // ── Run 3: 재인터뷰 ──
    const run3 = generateInterviewQuestions(['add_to_cart'], pageTypes, store);

    // 스킵되지 않고 질문이 생성되어야 함
    expect(run3.skippedEvents).not.toContain('add_to_cart');
    expect(run3.questions.length).toBeGreaterThan(0);

    // 재인터뷰 시 우선순위 > 2 질문은 제외
    const highPriority = run3.questions.filter(q => q.priority > 2);
    expect(highPriority).toHaveLength(0);
  });
});
