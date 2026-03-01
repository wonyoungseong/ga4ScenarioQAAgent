/**
 * Tester Pre-Interview - Gemini 분석 전 테스터 도메인 지식 수집
 *
 * Recon Agent가 발견한 셀렉터의 정확도를 향상시키기 위해,
 * DOM 분석 전에 테스터에게 이벤트별 도메인 지식을 수집합니다.
 *
 * 지식 축적 루프:
 * - Run 1: 전체 질문 → TesterInsight 생성 → Knowledge Store 저장
 * - Run 2: 고신뢰도 이벤트 자동 스킵 → 실패한 것만 재질문
 * - Run N: 대부분 자동 → 테스터에게 0~2개만 질문
 *
 * @version 1.0
 */

import * as readline from 'readline';
import type { PageTypeEnum } from '../../types/common';
import type {
  PreInterviewQuestion,
  PreInterviewAnswer,
  TesterInsight,
  PreInterviewResult,
  PrerequisiteAction,
  ElementLocation,
  KnowledgeStore,
} from '../../types/knowledge-state';

// ─────────────────────────────────────────────────────────────────────
// 이벤트별 질문 뱅크
// ─────────────────────────────────────────────────────────────────────

export const EVENT_INTERVIEW_QUESTIONS: Record<string, PreInterviewQuestion[]> = {
  add_to_cart: [
    {
      question_id: 'atc_flow_1',
      event_name: 'add_to_cart',
      category: 'flow',
      question: 'add_to_cart 이벤트가 발생하는 페이지는?',
      options: ['PDP', 'PLP', 'PDP+PLP 둘 다', '기타'],
      purpose: 'DOM 탐색 대상 페이지 결정',
      priority: 1,
    },
    {
      question_id: 'atc_flow_2',
      event_name: 'add_to_cart',
      category: 'flow',
      question: 'PLP에서 퀵 추가 버튼이 있나요? (상품 카드에서 직접 카트 추가)',
      options: ['있음', '없음(PDP로 이동해야 함)', '모름'],
      purpose: 'PLP 셀렉터 탐색 전략',
      priority: 2,
    },
    {
      question_id: 'atc_prereq_1',
      event_name: 'add_to_cart',
      category: 'prerequisite',
      question: '카트 담기 전 옵션(사이즈/색상) 선택이 필요한가요?',
      options: ['필수', '기본값 자동선택', '상품에 따라 다름'],
      purpose: '전제조건 - 셀렉터 발견 전 옵션 선택 액션 필요 여부',
      priority: 2,
    },
    {
      question_id: 'atc_prereq_2',
      event_name: 'add_to_cart',
      category: 'prerequisite',
      question: '옵션 미선택 시 카트 담기 버튼 동작은?',
      options: ['에러 표시', '옵션 선택 UI 열림', '비활성 상태', '기본값으로 추가'],
      purpose: '에러 핸들링 전략',
      priority: 3,
    },
    {
      question_id: 'atc_visual_1',
      event_name: 'add_to_cart',
      category: 'visual',
      question: '카트 담기 버튼 텍스트는? (자유입력, 기본값: "カートに入れる")',
      options: null,
      default_value: 'カートに入れる',
      purpose: 'DOM text_match 키워드 정확도 향상',
      priority: 1,
    },
    {
      question_id: 'atc_visual_2',
      event_name: 'add_to_cart',
      category: 'visual',
      question: '버튼 위치는?',
      options: ['상품 폼 내부', '하단 고정바', '카트 드로어', '헤더'],
      purpose: '핵심: 헤더 요소 필터링',
      priority: 1,
    },
    {
      question_id: 'atc_tech_1',
      event_name: 'add_to_cart',
      category: 'technical',
      question: 'CSS 셀렉터를 알고 있나요? (선택, 모르면 Enter)',
      options: null,
      purpose: '알면 바로 사용 (confidence 0.95)',
      priority: 1,
    },
    {
      question_id: 'atc_tech_2',
      event_name: 'add_to_cart',
      category: 'technical',
      question: 'Shopify 표준 product form submit 사용 여부?',
      options: ['예', '아니오(커스텀)', '모름'],
      purpose: 'form_role 전략 우선순위 결정',
      priority: 2,
    },
    {
      question_id: 'atc_post_1',
      event_name: 'add_to_cart',
      category: 'post_action',
      question: '카트 추가 후 무엇이 표시되나요?',
      options: ['카트 드로어 열림', '카트 페이지로 이동', '토스트 알림', '현재 페이지 유지'],
      purpose: 'begin_checkout 전제조건 파악',
      priority: 2,
    },
  ],

  begin_checkout: [
    {
      question_id: 'bc_flow_1',
      event_name: 'begin_checkout',
      category: 'flow',
      question: 'begin_checkout 이벤트가 발생하는 단계는?',
      options: ['카트 드로어 내 버튼 클릭', '카트 페이지 내 버튼 클릭', '주문 페이지 로드 시', '기타'],
      purpose: '핵심: 이벤트 발생 지점',
      priority: 1,
    },
    {
      question_id: 'bc_multi_1',
      event_name: 'begin_checkout',
      category: 'multi_step',
      question: '체크아웃 버튼을 보려면 사전 액션이 필요한가요?',
      options: ['카트 드로어 먼저 열기', '카트 페이지로 이동', '항상 보임', '카트에 상품 추가 필요'],
      purpose: '핵심: 멀티스텝 플로우 파악',
      priority: 1,
    },
    {
      question_id: 'bc_multi_2',
      event_name: 'begin_checkout',
      category: 'multi_step',
      question: '카트 드로어에서 직접 체크아웃 가능한가요?',
      options: ['가능', '불가(카트 페이지 경유)', '모름'],
      purpose: '네비게이션 전략',
      priority: 2,
    },
    {
      question_id: 'bc_visual_1',
      event_name: 'begin_checkout',
      category: 'visual',
      question: '체크아웃 버튼 텍스트는? (자유입력, 기본값: "購入手続きに進む")',
      options: null,
      default_value: '購入手続きに進む',
      purpose: 'text_match 키워드',
      priority: 1,
    },
    {
      question_id: 'bc_visual_2',
      event_name: 'begin_checkout',
      category: 'visual',
      question: '버튼 위치는?',
      options: ['카트 드로어 내', '카트 페이지 내', '상품 페이지', '하단 고정바'],
      purpose: '위치 필터링',
      priority: 2,
    },
    {
      question_id: 'bc_tech_1',
      event_name: 'begin_checkout',
      category: 'technical',
      question: 'CSS 셀렉터를 알고 있나요? (선택, 모르면 Enter)',
      options: null,
      purpose: '직접 사용',
      priority: 1,
    },
  ],

  select_item: [
    {
      question_id: 'si_flow_1',
      event_name: 'select_item',
      category: 'flow',
      question: 'select_item은 상품 카드 클릭 시 발생하나요?',
      options: ['예', '아니오', '모름'],
      purpose: '트리거 확인',
      priority: 1,
    },
    {
      question_id: 'si_visual_1',
      event_name: 'select_item',
      category: 'visual',
      question: '상품 카드의 클릭 가능 영역은?',
      options: ['카드 전체', '이미지만', '타이틀만', '이미지+타이틀(별도 링크)'],
      purpose: '셀렉터 대상',
      priority: 1,
    },
    {
      question_id: 'si_tech_1',
      event_name: 'select_item',
      category: 'technical',
      question: 'CSS 셀렉터 또는 data 속성을 알고 있나요? (선택, 모르면 Enter)',
      options: null,
      purpose: '직접 사용',
      priority: 1,
    },
  ],

  write_review: [
    {
      question_id: 'wr_flow_1',
      event_name: 'write_review',
      category: 'flow',
      question: '리뷰 작성 UI는?',
      options: ['PDP 내 폼', '별도 페이지', '모달 팝업', '서드파티 위젯', '없음'],
      purpose: '핵심: 서드파티 여부',
      priority: 1,
    },
    {
      question_id: 'wr_flow_2',
      event_name: 'write_review',
      category: 'flow',
      question: '서드파티 앱 사용 여부?',
      options: ['Loox', 'Judge.me', 'Yotpo', 'Shopify 기본', '기타', '모름'],
      purpose: '서드파티별 DOM 구조 대응',
      priority: 1,
    },
    {
      question_id: 'wr_prereq_1',
      event_name: 'write_review',
      category: 'prerequisite',
      question: '리뷰 작성에 로그인 필요?',
      options: ['필수', '게스트 가능', '구매자만', '모름'],
      purpose: '테스트 가능성 판단',
      priority: 2,
    },
  ],

  remove_from_cart: [
    {
      question_id: 'rfc_flow_1',
      event_name: 'remove_from_cart',
      category: 'flow',
      question: '카트 상품 삭제 UI는?',
      options: ['X 버튼/휴지통 아이콘', '스와이프', '수량 0', '"削除" 링크'],
      purpose: '셀렉터 전략',
      priority: 1,
    },
    {
      question_id: 'rfc_multi_1',
      event_name: 'remove_from_cart',
      category: 'multi_step',
      question: '삭제 버튼이 드로어/페이지 양쪽에 있나요?',
      options: ['양쪽', '카트 페이지만', '드로어만', '모름'],
      purpose: '탐색 대상',
      priority: 2,
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────
// 질문 필터링 (Knowledge Store 기반)
// ─────────────────────────────────────────────────────────────────────

/**
 * 인터뷰 스킵 판정.
 * Knowledge Store에 고신뢰도 셀렉터가 있으면 스킵.
 */
export function shouldSkipInterview(
  store: KnowledgeStore | null,
  eventName: string,
  pageType: string,
): boolean {
  if (!store) return false;

  const insight = store.events[eventName]?.tester_insights?.[pageType];
  if (!insight) return false;

  const selector = store.events[eventName]?.selectors[pageType];
  if (!selector) return false;

  // 조건 1: 이전 인터뷰 답변 있음 + 셀렉터 성공 3회 이상 + 실패 0
  if (selector.success_count >= 3 && selector.failure_count === 0) return true;

  // 조건 2: confidence >= 0.85 + 실패 0
  if (selector.confidence >= 0.85 && selector.failure_count === 0) return true;

  return false;
}

/**
 * 재인터뷰 판정.
 * 이전 셀렉터에 실패 기록이 있으면 재질문 필요.
 */
export function shouldReInterview(
  store: KnowledgeStore | null,
  eventName: string,
  pageType: string,
): boolean {
  if (!store) return false;

  const selector = store.events[eventName]?.selectors[pageType];
  if (!selector) return false;

  return selector.failure_count > 0;
}

/**
 * 이벤트별 질문 목록 생성.
 * Knowledge Store 상태에 따라 불필요한 질문을 필터링합니다.
 */
export function generateInterviewQuestions(
  eventNames: string[],
  pageTypes: Record<string, PageTypeEnum[]>,
  store: KnowledgeStore | null,
): { questions: PreInterviewQuestion[]; skippedEvents: string[] } {
  const questions: PreInterviewQuestion[] = [];
  const skippedEvents: string[] = [];

  for (const eventName of eventNames) {
    const eventPageTypes = pageTypes[eventName] ?? [];
    const eventQuestions = EVENT_INTERVIEW_QUESTIONS[eventName];
    if (!eventQuestions) continue;

    // 모든 페이지 타입에서 스킵 가능한지 확인
    const allSkippable = eventPageTypes.every(pt =>
      shouldSkipInterview(store, eventName, pt),
    );

    if (allSkippable && eventPageTypes.length > 0) {
      skippedEvents.push(eventName);
      continue;
    }

    // 재인터뷰 필요한 페이지 타입 표시
    const needsReInterview = eventPageTypes.some(pt =>
      shouldReInterview(store, eventName, pt),
    );

    for (const q of eventQuestions) {
      // 재인터뷰 시 우선순위 높은 질문만
      if (needsReInterview && q.priority > 2) continue;

      questions.push(q);
    }
  }

  // 우선순위 정렬 (이벤트명 → 우선순위)
  questions.sort((a, b) => {
    if (a.event_name !== b.event_name) {
      return a.event_name.localeCompare(b.event_name);
    }
    return a.priority - b.priority;
  });

  return { questions, skippedEvents };
}

// ─────────────────────────────────────────────────────────────────────
// CLI 인터뷰 실행
// ─────────────────────────────────────────────────────────────────────

/**
 * CLI에서 테스터에게 사전 인터뷰를 실행합니다.
 */
export async function runPreInterview(
  questions: PreInterviewQuestion[],
  store: KnowledgeStore | null,
): Promise<PreInterviewAnswer[]> {
  if (questions.length === 0) return [];

  const answers: PreInterviewAnswer[] = [];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    // 이벤트별 그룹화
    const grouped = new Map<string, PreInterviewQuestion[]>();
    for (const q of questions) {
      if (!grouped.has(q.event_name)) {
        grouped.set(q.event_name, []);
      }
      grouped.get(q.event_name)!.push(q);
    }

    for (const [eventName, eventQuestions] of grouped) {
      console.log(`\n  ── ${eventName} 관련 질문 ──`);

      // 이전 답변이 있으면 표시
      const previousInsight = store?.events[eventName]?.tester_insights;
      if (previousInsight) {
        const pageTypes = Object.keys(previousInsight);
        if (pageTypes.length > 0) {
          console.log('  (이전 인터뷰 답변이 있습니다. 변경이 필요한 부분만 수정해주세요.)');
        }
      }

      for (let i = 0; i < eventQuestions.length; i++) {
        const q = eventQuestions[i];
        const answer = await askQuestion(rl, q, i + 1, eventQuestions.length);
        answers.push(answer);
      }
    }
  } finally {
    rl.close();
  }

  return answers;
}

function askQuestion(
  rl: readline.Interface,
  question: PreInterviewQuestion,
  index: number,
  total: number,
): Promise<PreInterviewAnswer> {
  return new Promise((resolve) => {
    console.log(`\n  [${index}/${total}] ${question.question}`);
    console.log(`     (목적: ${question.purpose})`);

    if (question.options) {
      for (let i = 0; i < question.options.length; i++) {
        console.log(`     ${i + 1}. ${question.options[i]}`);
      }
      console.log(`     (번호를 입력하세요${question.default_value ? `, 기본값: ${question.default_value}` : ''})`);
    } else {
      if (question.default_value) {
        console.log(`     (자유입력, Enter = "${question.default_value}")`);
      } else {
        console.log('     (자유입력, 모르면 Enter)');
      }
    }

    const doAsk = (): void => {
      rl.question('     > ', (input) => {
        const trimmed = input.trim();

        if (question.options) {
          // 번호 선택
          if (!trimmed && question.default_value) {
            resolve({
              question_id: question.question_id,
              value: question.default_value,
              answered_at: new Date().toISOString(),
            });
            return;
          }

          const num = parseInt(trimmed, 10);
          if (num >= 1 && num <= question.options.length) {
            resolve({
              question_id: question.question_id,
              value: question.options[num - 1],
              answered_at: new Date().toISOString(),
            });
            return;
          }

          // 텍스트로 직접 입력 (선택지와 매칭)
          const matched = question.options.find(
            o => o.toLowerCase() === trimmed.toLowerCase(),
          );
          if (matched) {
            resolve({
              question_id: question.question_id,
              value: matched,
              answered_at: new Date().toISOString(),
            });
            return;
          }

          console.log(`     1~${question.options.length} 사이의 번호를 입력해주세요.`);
          doAsk();
        } else {
          // 자유입력
          const value = trimmed || question.default_value || '';
          resolve({
            question_id: question.question_id,
            value,
            answered_at: new Date().toISOString(),
          });
        }
      });
    };

    doAsk();
  });
}

// ─────────────────────────────────────────────────────────────────────
// 답변 → TesterInsight 컴파일
// ─────────────────────────────────────────────────────────────────────

/** 답변 맵 헬퍼 */
function getAnswer(answers: PreInterviewAnswer[], questionId: string): string | undefined {
  return answers.find(a => a.question_id === questionId)?.value;
}

/**
 * 답변을 이벤트+페이지타입별 TesterInsight로 컴파일합니다.
 */
export function compileInsights(
  answers: PreInterviewAnswer[],
  eventPageTypes: Record<string, PageTypeEnum[]>,
): Record<string, TesterInsight> {
  const insights: Record<string, TesterInsight> = {};

  for (const [eventName, pageTypes] of Object.entries(eventPageTypes)) {
    const eventAnswers = answers.filter(a =>
      EVENT_INTERVIEW_QUESTIONS[eventName]?.some(q => q.question_id === a.question_id),
    );

    if (eventAnswers.length === 0) continue;

    for (const pageType of pageTypes) {
      const key = `${eventName}:${pageType}`;
      const insight = compileEventInsight(eventName, pageType, eventAnswers);
      if (insight) {
        insights[key] = insight;
      }
    }
  }

  return insights;
}

function compileEventInsight(
  eventName: string,
  pageType: PageTypeEnum,
  answers: PreInterviewAnswer[],
): TesterInsight {
  const now = new Date().toISOString();

  const base: TesterInsight = {
    event_name: eventName,
    page_type: pageType,
    is_multi_step: false,
    prerequisite_actions: [],
    raw_answers: answers,
    compiled_at: now,
  };

  switch (eventName) {
    case 'add_to_cart':
      return compileAddToCartInsight(base, answers);
    case 'begin_checkout':
      return compileBeginCheckoutInsight(base, answers);
    case 'select_item':
      return compileSelectItemInsight(base, answers);
    case 'write_review':
      return compileWriteReviewInsight(base, answers);
    case 'remove_from_cart':
      return compileRemoveFromCartInsight(base, answers);
    default:
      return base;
  }
}

function compileAddToCartInsight(
  base: TesterInsight,
  answers: PreInterviewAnswer[],
): TesterInsight {
  const insight = { ...base };

  // 버튼 텍스트
  const buttonText = getAnswer(answers, 'atc_visual_1');
  if (buttonText) {
    insight.trigger_text = buttonText;
  }

  // 버튼 위치
  const location = getAnswer(answers, 'atc_visual_2');
  if (location) {
    insight.element_location = mapLocationAnswer(location);
  }

  // CSS 셀렉터
  const selector = getAnswer(answers, 'atc_tech_1');
  if (selector) {
    insight.known_selector = selector;
  }

  // Shopify 표준 form
  const standardForm = getAnswer(answers, 'atc_tech_2');
  if (standardForm === '예') {
    insight.uses_standard_form = true;
  } else if (standardForm === '아니오(커스텀)') {
    insight.uses_standard_form = false;
  }

  // 카트 추가 후 동작
  const postAction = getAnswer(answers, 'atc_post_1');
  if (postAction) {
    insight.post_add_to_cart_behavior = mapPostAddToCartBehavior(postAction);
  }

  return insight;
}

function compileBeginCheckoutInsight(
  base: TesterInsight,
  answers: PreInterviewAnswer[],
): TesterInsight {
  const insight = { ...base };

  // 버튼 텍스트
  const buttonText = getAnswer(answers, 'bc_visual_1');
  if (buttonText) {
    insight.trigger_text = buttonText;
  }

  // 버튼 위치
  const location = getAnswer(answers, 'bc_visual_2');
  if (location) {
    insight.element_location = mapLocationAnswer(location);
  }

  // CSS 셀렉터
  const selector = getAnswer(answers, 'bc_tech_1');
  if (selector) {
    insight.known_selector = selector;
  }

  // 멀티스텝
  const multiStep = getAnswer(answers, 'bc_multi_1');
  if (multiStep) {
    const actions = buildCheckoutPrerequisiteActions(multiStep);
    if (actions.length > 0) {
      insight.is_multi_step = true;
      insight.prerequisite_actions = actions;
    }
  }

  return insight;
}

function compileSelectItemInsight(
  base: TesterInsight,
  answers: PreInterviewAnswer[],
): TesterInsight {
  const insight = { ...base };

  // CSS 셀렉터
  const selector = getAnswer(answers, 'si_tech_1');
  if (selector) {
    insight.known_selector = selector;
  }

  insight.element_location = 'main_content';

  return insight;
}

function compileWriteReviewInsight(
  base: TesterInsight,
  answers: PreInterviewAnswer[],
): TesterInsight {
  const insight = { ...base };

  // 서드파티
  const thirdParty = getAnswer(answers, 'wr_flow_2');
  if (thirdParty && thirdParty !== 'Shopify 기본' && thirdParty !== '모름') {
    insight.third_party_tool = thirdParty;
    insight.element_location = 'third_party_widget';
  }

  // UI 타입
  const uiType = getAnswer(answers, 'wr_flow_1');
  if (uiType === '모달 팝업') {
    insight.is_multi_step = true;
    insight.prerequisite_actions = [{
      action_type: 'click',
      description: '리뷰 작성 버튼 클릭하여 모달 열기',
    }];
  }

  return insight;
}

function compileRemoveFromCartInsight(
  base: TesterInsight,
  answers: PreInterviewAnswer[],
): TesterInsight {
  const insight = { ...base };

  // 삭제 UI
  const deleteUI = getAnswer(answers, 'rfc_flow_1');
  if (deleteUI) {
    insight.trigger_text = deleteUI === '"削除" 링크' ? '削除' : undefined;
  }

  // 드로어/페이지
  const location = getAnswer(answers, 'rfc_multi_1');
  if (location === '드로어만') {
    insight.element_location = 'cart_drawer';
    insight.is_multi_step = true;
    insight.prerequisite_actions = [{
      action_type: 'click',
      selector: '[aria-label*="カート"], .cart-icon, a[href="/cart"]',
      wait_ms: 2000,
      description: '카트 드로어 열기',
    }];
  } else if (location === '카트 페이지만') {
    insight.element_location = 'cart_page';
    insight.is_multi_step = true;
    insight.prerequisite_actions = [{
      action_type: 'navigate',
      url: '/cart',
      description: '카트 페이지로 이동',
    }];
  }

  return insight;
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function mapLocationAnswer(answer: string): ElementLocation {
  const mapping: Record<string, ElementLocation> = {
    '상품 폼 내부': 'product_form',
    '하단 고정바': 'sticky_bar',
    '카트 드로어': 'cart_drawer',
    '카트 드로어 내': 'cart_drawer',
    '헤더': 'header',
    '카트 페이지 내': 'cart_page',
    '상품 페이지': 'main_content',
    '메인 콘텐츠': 'main_content',
  };
  return mapping[answer] ?? 'unknown';
}

function mapPostAddToCartBehavior(
  answer: string,
): TesterInsight['post_add_to_cart_behavior'] {
  const mapping: Record<string, TesterInsight['post_add_to_cart_behavior']> = {
    '카트 드로어 열림': 'cart_drawer_opens',
    '카트 페이지로 이동': 'navigate_to_cart',
    '토스트 알림': 'toast_notification',
    '현재 페이지 유지': 'stay_on_page',
  };
  return mapping[answer] ?? 'stay_on_page';
}

function buildCheckoutPrerequisiteActions(multiStepAnswer: string): PrerequisiteAction[] {
  switch (multiStepAnswer) {
    case '카트 드로어 먼저 열기':
      return [
        {
          action_type: 'click',
          selector: '[aria-label*="カート"], .cart-icon, a[href="/cart"], .cart-count',
          description: '카트 아이콘 클릭하여 드로어 열기',
        },
        {
          action_type: 'wait',
          wait_ms: 2000,
          description: '카트 드로어 열림 대기',
        },
      ];
    case '카트 페이지로 이동':
      return [
        {
          action_type: 'navigate',
          url: '/cart',
          description: '카트 페이지로 이동',
        },
        {
          action_type: 'wait',
          wait_ms: 2000,
          description: '페이지 로드 대기',
        },
      ];
    case '카트에 상품 추가 필요':
      return [
        {
          action_type: 'click',
          description: '상품을 카트에 추가해야 체크아웃 가능',
        },
      ];
    default:
      return [];
  }
}

// ─────────────────────────────────────────────────────────────────────
// 전체 인터뷰 오케스트레이션
// ─────────────────────────────────────────────────────────────────────

/**
 * 사전 인터뷰 전체 실행.
 *
 * 1. Knowledge Store에서 이전 인사이트 로드
 * 2. 질문 필터링 (자동 스킵 / 재질문 판정)
 * 3. CLI 인터뷰 실행
 * 4. 답변 → TesterInsight 컴파일
 * 5. Knowledge Store 업데이트
 *
 * @returns PreInterviewResult
 */
export async function executePreInterview(
  eventNames: string[],
  eventPageTypes: Record<string, PageTypeEnum[]>,
  store: KnowledgeStore | null,
): Promise<PreInterviewResult> {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║     Phase 2.5: 테스터 사전 인터뷰                              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  // 1. 질문 생성 (Knowledge Store 기반 필터링)
  const { questions, skippedEvents } = generateInterviewQuestions(
    eventNames,
    eventPageTypes,
    store,
  );

  if (skippedEvents.length > 0) {
    console.log(`\n  자동 스킵 이벤트 (이전 인사이트 재사용): ${skippedEvents.join(', ')}`);
  }

  if (questions.length === 0) {
    console.log('\n  모든 이벤트에 대해 충분한 인사이트가 축적되어 있습니다.');
    // 기존 인사이트 재사용
    const existingInsights: Record<string, TesterInsight> = {};
    if (store) {
      for (const eventName of eventNames) {
        const eventInsights = store.events[eventName]?.tester_insights;
        if (eventInsights) {
          for (const [pageType, insight] of Object.entries(eventInsights)) {
            existingInsights[`${eventName}:${pageType}`] = insight;
          }
        }
      }
    }

    return {
      interviewed_events: [],
      skipped_events: skippedEvents,
      insights: existingInsights,
      interviewed_at: new Date().toISOString(),
    };
  }

  // 질문할 이벤트 목록
  const interviewedEvents = [...new Set(questions.map(q => q.event_name))];
  console.log(`\n  인터뷰 대상 이벤트: ${interviewedEvents.join(', ')}`);
  console.log(`  질문 수: ${questions.length}개`);

  // 2. CLI 인터뷰 실행
  const answers = await runPreInterview(questions, store);

  // 3. 답변 컴파일
  const newInsights = compileInsights(answers, eventPageTypes);

  // 4. 기존 인사이트와 병합
  const allInsights: Record<string, TesterInsight> = {};
  if (store) {
    for (const eventName of eventNames) {
      const eventInsights = store.events[eventName]?.tester_insights;
      if (eventInsights) {
        for (const [pageType, insight] of Object.entries(eventInsights)) {
          allInsights[`${eventName}:${pageType}`] = insight;
        }
      }
    }
  }
  // 새 인사이트가 기존 것을 오버라이드
  Object.assign(allInsights, newInsights);

  console.log(`\n  인사이트 컴파일 완료: ${Object.keys(newInsights).length}개 생성/갱신`);

  return {
    interviewed_events: interviewedEvents,
    skipped_events: skippedEvents,
    insights: allInsights,
    interviewed_at: new Date().toISOString(),
  };
}
