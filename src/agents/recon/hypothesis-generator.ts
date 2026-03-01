/**
 * Hypothesis Generator - 소스 결합 → 가설 생성
 *
 * GTM 사실 + DevGuide + Visual Analysis + Knowledge Store를 결합하여
 * 이벤트별 가설을 생성합니다.
 *
 * 신뢰도 계산:
 * - GTM만: 0.4
 * - GTM + Visual: 0.6
 * - GTM + Visual + DOM: 0.75
 * - GTM + Visual + DOM + Trial Click 성공: 0.9
 * - Tester 확인: 1.0
 * - Knowledge Store (success_count >= 3): 0.95
 *
 * @version 1.0
 */

import type { PageTypeEnum } from '../../types/common';
import type { UserActionType } from '../../types/event-scenario';
import type {
  EventKnowledgeState,
  EventHypothesis,
  VisualPageAnalysis,
  KnowledgeStore,
  KnowledgeSourceType,
} from '../../types/knowledge-state';
import { shouldAutoConfirm } from '../../knowledge/knowledge-store';

// ─────────────────────────────────────────────────────────────────────
// Main Function
// ─────────────────────────────────────────────────────────────────────

let hypothesisCounter = 0;

/**
 * 이벤트별 가설을 생성합니다.
 *
 * @param eventStates - 이벤트별 지식 상태
 * @param visualAnalyses - Gemini 시각 분석 결과
 * @param knowledgeStore - 영구 저장소 (없으면 null)
 * @returns EventHypothesis[]
 */
export function generateHypotheses(
  eventStates: EventKnowledgeState[],
  visualAnalyses: VisualPageAnalysis[],
  knowledgeStore: KnowledgeStore | null,
): EventHypothesis[] {
  const hypotheses: EventHypothesis[] = [];

  // Visual Analysis 인덱스 (URL → VisualPageAnalysis)
  const visualByUrl = new Map<string, VisualPageAnalysis>();
  for (const va of visualAnalyses) {
    visualByUrl.set(va.url, va);
  }

  for (const state of eventStates) {
    // manual_only나 skip은 가설 생성 불필요
    if (state.readiness === 'manual_only' || state.readiness === 'skip') {
      continue;
    }

    // auto_fire는 selector 불필요
    if (state.fire_condition?.value === 'auto_fire') {
      continue;
    }

    const pageTypes = state.page_types?.value ?? [];
    const testUrls = state.test_urls?.value ?? {};

    for (const pageType of pageTypes as PageTypeEnum[]) {
      const urls = testUrls[pageType] ?? [];
      if (urls.length === 0) continue;

      const url = urls[0];
      const visualAnalysis = visualByUrl.get(url);

      const hypothesis = buildHypothesis(
        state,
        pageType,
        url,
        visualAnalysis,
        knowledgeStore,
      );

      if (hypothesis) {
        hypotheses.push(hypothesis);
      }
    }
  }

  // 신뢰도 높은 순 정렬
  hypotheses.sort((a, b) => b.confidence - a.confidence);

  return hypotheses;
}

// ─────────────────────────────────────────────────────────────────────
// Single Hypothesis Builder
// ─────────────────────────────────────────────────────────────────────

function buildHypothesis(
  state: EventKnowledgeState,
  pageType: PageTypeEnum,
  _url: string,
  visualAnalysis: VisualPageAnalysis | undefined,
  store: KnowledgeStore | null,
): EventHypothesis | null {
  hypothesisCounter++;

  const eventName = state.event_name;
  const actionType: UserActionType = state.action_type?.value ?? 'click';
  const sources: KnowledgeSourceType[] = [];
  let confidence = 0;
  let suggestedSelector: string | undefined;
  let triggerText: string | undefined;
  const prerequisites: string[] = [];

  // ── 1. GTM 사실 기반 ──
  if (state.fire_condition) {
    sources.push(state.fire_condition.source);
    confidence = 0.4;
  }

  // ── 2. Knowledge Store 기존 지식 ──
  if (store) {
    const storedEvent = store.events[eventName];
    if (storedEvent) {
      const storedSelector = storedEvent.selectors[pageType];
      if (storedSelector) {
        sources.push('knowledge_store');
        suggestedSelector = storedSelector.selector;
        triggerText = storedSelector.visible_text;

        if (shouldAutoConfirm(store, eventName, pageType)) {
          confidence = 0.95;
        } else if (storedSelector.success_count >= 1) {
          confidence = Math.max(confidence, 0.7);
        }
      }

      // 전제조건
      const storedPrereqs = storedEvent.prerequisites[pageType];
      if (storedPrereqs) {
        prerequisites.push(...storedPrereqs);
      }
    }
  }

  // ── 3. Visual Analysis 보강 ──
  if (visualAnalysis) {
    const matchingElements = visualAnalysis.interactive_elements.filter(
      el => el.likely_events.includes(eventName),
    );

    if (matchingElements.length > 0) {
      sources.push('recon_visual');
      const bestMatch = matchingElements.reduce((a, b) =>
        a.confidence > b.confidence ? a : b,
      );

      if (!suggestedSelector && bestMatch.suggested_identifier) {
        suggestedSelector = bestMatch.suggested_identifier;
      }
      if (!triggerText && bestMatch.visible_text) {
        triggerText = bestMatch.visible_text;
      }

      // Visual로 보강 시 confidence 상승
      if (confidence < 0.6) {
        confidence = 0.6;
      }
    }

    // 이커머스 컨텍스트에서 전제조건 추출
    if (visualAnalysis.ecommerce_context) {
      const ecom = visualAnalysis.ecommerce_context;
      if (ecom.observed_prerequisites.length > 0) {
        prerequisites.push(...ecom.observed_prerequisites);
      }
    }
  }

  // ── 4. 기존 타겟 셀렉터 사용 ──
  if (!suggestedSelector && state.target_selector) {
    suggestedSelector = state.target_selector.value;
    if (!sources.includes(state.target_selector.source)) {
      sources.push(state.target_selector.source);
    }
  }

  // ── 5. 암묵적 전제조건 추가 ──
  if (state.prerequisites?.value) {
    for (const prereq of state.prerequisites.value) {
      if (!prerequisites.includes(prereq)) {
        prerequisites.push(prereq);
      }
    }
  }

  // 가설 문장 생성
  const statement = buildStatement(eventName, pageType, actionType, triggerText, suggestedSelector);

  return {
    hypothesis_id: `HYP_${hypothesisCounter}`,
    event_name: eventName,
    page_type: pageType,
    statement,
    trigger: {
      action_type: actionType,
      suggested_selector: suggestedSelector,
      trigger_text: triggerText,
    },
    prerequisites,
    sources: [...new Set(sources)],
    confidence,
    confirmation_status: 'pending',
  };
}

// ─────────────────────────────────────────────────────────────────────
// Statement Builder
// ─────────────────────────────────────────────────────────────────────

function buildStatement(
  eventName: string,
  pageType: PageTypeEnum,
  actionType: UserActionType,
  triggerText: string | undefined,
  selector: string | undefined,
): string {
  const actionDescriptions: Record<UserActionType, string> = {
    page_load: '페이지 로드',
    click: '클릭',
    scroll: '스크롤',
    submit: '폼 제출',
    hover: '마우스 오버',
    input: '입력',
    select: '선택',
    view: '뷰포트 진입',
    navigate_back: '브라우저 뒤로가기',
    custom: '커스텀 액션',
  };

  const action = actionDescriptions[actionType] ?? actionType;
  const target = triggerText
    ? `"${triggerText}" ${action}`
    : selector
      ? `${selector} ${action}`
      : `${action} 액션`;

  return `[${pageType}] ${target} 시 ${eventName} 발생`;
}

// ─────────────────────────────────────────────────────────────────────
// Console Output
// ─────────────────────────────────────────────────────────────────────

/**
 * 생성된 가설을 콘솔에 출력합니다.
 */
export function printHypotheses(hypotheses: EventHypothesis[]): void {
  console.log(`\n  ── Phase 5: 가설 생성 (${hypotheses.length}개) ──`);

  for (const h of hypotheses) {
    const stars = '★'.repeat(Math.round(h.confidence * 3)) + '☆'.repeat(3 - Math.round(h.confidence * 3));
    const statusIcon = h.confirmation_status === 'confirmed' ? '✅'
      : h.confirmation_status === 'corrected' ? '🔄'
      : h.confirmation_status === 'rejected' ? '❌'
      : '❓';

    console.log(`  ${statusIcon} [${h.event_name}] ${h.page_type}`);
    console.log(`     가설: ${h.statement}`);
    if (h.trigger.suggested_selector) {
      console.log(`     셀렉터: ${h.trigger.suggested_selector}`);
    }
    if (h.prerequisites.length > 0) {
      console.log(`     전제조건: ${h.prerequisites.join(', ')}`);
    }
    console.log(`     신뢰도: ${stars} (${(h.confidence * 100).toFixed(0)}%)`);
    console.log(`     소스: [${h.sources.join(', ')}]`);
  }
}
