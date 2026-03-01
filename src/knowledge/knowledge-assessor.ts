/**
 * Knowledge Assessor - 이벤트별 준비도 평가 엔진
 *
 * 이벤트별 지식 재고를 파악하고, 갭을 판별하고, 준비도를 판정합니다.
 * Step 1.5 (Knowledge Readiness Assessment)의 핵심 로직.
 *
 * @version 1.0
 */

import type { ScenarioDefinition, UserActionType, EventFireCondition } from '../types/event-scenario';
import type { ContentGroupRule } from '../types/content-group';
import type { PageTypeEnum } from '../types/common';
import type { ActionSafetyLevel } from '../types/recon';
import type {
  EventKnowledgeState,
  KnowledgeClaim,
  KnowledgeGap,
  GapType,
  GapResolutionMethod,
  EventReadiness,
  RecommendedAction,
  TesterQuestion,
  KnowledgeReadinessReport,
  KnowledgeStore,
  KnowledgeSourceType,
} from '../types/knowledge-state';
import type { ClassifiedEvent } from './source-authority';
import { getStoredSelector, getStoredPrerequisites, shouldAutoConfirm } from './knowledge-store';
import { getEventKnowledge } from './events/index';
import { getActionSafetyLevel } from '../agents/recon/action-safety';

// ─────────────────────────────────────────────────────────────────────
// Main Assessment Function
// ─────────────────────────────────────────────────────────────────────

/**
 * 이벤트별 지식 재고 + 갭 판별 + 준비도 판정.
 *
 * @param scenarios - Parser가 생성한 시나리오 목록
 * @param contentGroupRules - Content Group 규칙
 * @param knowledgeStore - 영구 저장소 (없으면 null)
 * @returns KnowledgeReadinessReport
 */
export function assessKnowledgeReadiness(
  scenarios: ScenarioDefinition[],
  contentGroupRules: ContentGroupRule[],
  knowledgeStore: KnowledgeStore | null,
): KnowledgeReadinessReport {
  // 이벤트명 → 시나리오들 매핑
  const scenariosByEvent = new Map<string, ScenarioDefinition[]>();
  for (const scenario of scenarios) {
    for (const expected of scenario.expected_events) {
      if (!scenariosByEvent.has(expected.event_name)) {
        scenariosByEvent.set(expected.event_name, []);
      }
      scenariosByEvent.get(expected.event_name)!.push(scenario);
    }
  }

  // 개별 이벤트 평가
  const eventStates: EventKnowledgeState[] = [];
  const allGaps: KnowledgeGap[] = [];
  const allQuestions: TesterQuestion[] = [];

  const uniqueEventNames = new Set<string>();
  for (const scenario of scenarios) {
    for (const expected of scenario.expected_events) {
      uniqueEventNames.add(expected.event_name);
    }
  }

  for (const eventName of uniqueEventNames) {
    const eventScenarios = scenariosByEvent.get(eventName) ?? [];

    const state = assessSingleEvent(
      eventName,
      undefined,
      eventScenarios,
      contentGroupRules,
      knowledgeStore,
    );

    eventStates.push(state);
    allGaps.push(...state.gaps);

    // 테스터 질문 생성
    for (const gap of state.gaps) {
      if (gap.resolution_method === 'ask_tester') {
        allQuestions.push(generateTesterQuestion(eventName, gap));
      }
    }
  }

  // 갭 우선순위 정렬
  const prioritizedGaps = allGaps.sort((a, b) => a.priority - b.priority);

  // 질문 우선순위 정렬
  const sortedQuestions = allQuestions.sort((a, b) => a.priority - b.priority);

  // 요약 계산
  const summary = computeSummary(eventStates);

  return {
    assessed_at: new Date().toISOString(),
    event_states: eventStates,
    summary,
    prioritized_gaps: prioritizedGaps,
    tester_questions: sortedQuestions,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Single Event Assessment
// ─────────────────────────────────────────────────────────────────────

/**
 * 단일 이벤트의 지식 상태를 평가합니다.
 */
function assessSingleEvent(
  eventName: string,
  classified: ClassifiedEvent | undefined,
  scenarios: ScenarioDefinition[],
  _contentGroupRules: ContentGroupRule[],
  store: KnowledgeStore | null,
): EventKnowledgeState {
  const gaps: KnowledgeGap[] = [];
  const now = new Date().toISOString();

  // ── fire_condition 평가 ──
  let fireConditionClaim: KnowledgeClaim<EventFireCondition> | null = null;
  if (classified) {
    fireConditionClaim = {
      value: classified.fire_condition,
      source: classified._source_provenance['fire_condition'] as KnowledgeSourceType,
      confidence: classified._source_provenance['fire_condition'] === 'devguide_pdf' ? 'high' : 'medium',
      established_at: now,
    };
  } else {
    gaps.push({
      event_name: eventName,
      gap_type: 'fire_condition_unknown',
      resolution_method: 'needs_document',
      description: `${eventName}: 발생 조건 불명 (분류 정보 없음)`,
      priority: 2,
    });
  }

  // ── action_type 평가 ──
  let actionTypeClaim: KnowledgeClaim<UserActionType> | null = null;
  if (classified) {
    actionTypeClaim = {
      value: classified.action_type,
      source: classified._source_provenance['action_type'] as KnowledgeSourceType,
      confidence: classified._source_provenance['action_type'] === 'devguide_pdf' ? 'high' : 'medium',
      established_at: now,
    };
  } else {
    gaps.push({
      event_name: eventName,
      gap_type: 'action_type_unknown',
      resolution_method: 'needs_document',
      description: `${eventName}: 액션 타입 불명`,
      priority: 3,
    });
  }

  // ── target_selector 평가 ──
  let selectorClaim: KnowledgeClaim<string> | null = null;
  const needsSelector = classified && classified.fire_condition === 'user_action';

  if (needsSelector) {
    // Knowledge Store에서 먼저 조회
    const pageTypes = classified!.inferred_page_types;
    let foundInStore = false;

    for (const pt of pageTypes) {
      if (store) {
        const storedSelector = getStoredSelector(store, eventName, pt);
        if (storedSelector && storedSelector.confidence >= 0.5) {
          selectorClaim = {
            value: storedSelector.selector,
            source: 'knowledge_store',
            confidence: storedSelector.confidence >= 0.85 ? 'high' : 'medium',
            established_at: storedSelector.last_success ?? now,
          };
          foundInStore = true;
          break;
        }
      }
    }

    if (!foundInStore) {
      // GTM CSS 셀렉터 체크
      if (classified!.css_selector || classified!.target_selector) {
        selectorClaim = {
          value: classified!.target_selector ?? classified!.css_selector!,
          source: 'gtm_json',
          confidence: 'medium',
          established_at: now,
        };
      } else {
        // 셀렉터가 없음 → 갭
        const resolutionMethod = resolveGapMethod(classified!.action_type, eventName);
        gaps.push({
          event_name: eventName,
          gap_type: 'selector_missing',
          resolution_method: resolutionMethod,
          description: `${eventName}: 타겟 셀렉터 없음 (${classified!.action_type} 액션)`,
          priority: 1,
        });
      }
    }
  }

  // ── page_types 평가 ──
  let pageTypesClaim: KnowledgeClaim<PageTypeEnum[]> | null = null;
  if (classified && classified.inferred_page_types.length > 0) {
    pageTypesClaim = {
      value: classified.inferred_page_types,
      source: classified._source_provenance['inferred_page_types'] as KnowledgeSourceType,
      confidence: classified._source_provenance['inferred_page_types'] === 'devguide_pdf' ? 'high' : 'medium',
      established_at: now,
    };
  } else {
    gaps.push({
      event_name: eventName,
      gap_type: 'page_type_unknown',
      resolution_method: 'ask_tester',
      description: `${eventName}: 대상 페이지 타입 불명`,
      priority: 3,
    });
  }

  // ── test_urls 평가 ──
  let testUrlsClaim: KnowledgeClaim<Record<string, string[]>> | null = null;
  const urlsByPageType: Record<string, string[]> = {};
  let hasUrls = false;

  for (const scenario of scenarios) {
    const urls = scenario.test_urls ?? [];
    if (urls.length > 0) {
      if (!urlsByPageType[scenario.page_type]) {
        urlsByPageType[scenario.page_type] = [];
      }
      urlsByPageType[scenario.page_type].push(...urls);
      hasUrls = true;
    }
  }

  if (hasUrls) {
    testUrlsClaim = {
      value: urlsByPageType,
      source: 'gtm_json', // Pre-Requirement Excel 경유
      confidence: 'high',
      established_at: now,
    };
  } else {
    gaps.push({
      event_name: eventName,
      gap_type: 'url_missing',
      resolution_method: 'ask_tester',
      description: `${eventName}: 테스트 URL 없음`,
      priority: 2,
    });
  }

  // ── prerequisites 평가 ──
  let prerequisitesClaim: KnowledgeClaim<string[]> | null = null;
  if (store) {
    const pageTypes = classified?.inferred_page_types ?? [];
    const allPrereqs: string[] = [];
    for (const pt of pageTypes) {
      allPrereqs.push(...getStoredPrerequisites(store, eventName, pt));
    }
    if (allPrereqs.length > 0) {
      prerequisitesClaim = {
        value: [...new Set(allPrereqs)],
        source: 'knowledge_store',
        confidence: 'medium',
        established_at: now,
      };
    }
  }

  // 특정 이벤트의 암묵적 전제조건 체크
  if (!prerequisitesClaim) {
    const implicitPrereqs = getImplicitPrerequisites(eventName);
    if (implicitPrereqs.length > 0) {
      prerequisitesClaim = {
        value: implicitPrereqs,
        source: 'knowledge_base',
        confidence: 'medium',
        established_at: now,
      };
    }
  }

  // ── business_rules 평가 ──
  let businessRulesClaim: KnowledgeClaim<{ should_fire: string[]; should_not_fire: string[] }> | null = null;
  const knowledge = getEventKnowledge(eventName);
  if (knowledge) {
    businessRulesClaim = {
      value: {
        should_fire: knowledge.should_fire_rules,
        should_not_fire: knowledge.should_not_fire_rules,
      },
      source: 'knowledge_base',
      confidence: 'high',
      established_at: now,
    };
  } else {
    gaps.push({
      event_name: eventName,
      gap_type: 'business_rule_missing',
      resolution_method: 'needs_document',
      description: `${eventName}: 비즈니스 규칙 없음 (Knowledge Base에 미등록)`,
      priority: 4,
    });
  }

  // ── safety_level ──
  const safetyLevel: ActionSafetyLevel = getActionSafetyLevel(eventName);

  // ── readiness 판정 ──
  const readiness = determineReadiness(
    eventName,
    fireConditionClaim,
    selectorClaim,
    testUrlsClaim,
    gaps,
    classified?.testability,
    store,
  );

  // ── recommended_action ──
  const recommendedAction = determineRecommendedAction(readiness, gaps);

  return {
    event_name: eventName,
    fire_condition: fireConditionClaim,
    action_type: actionTypeClaim,
    target_selector: selectorClaim,
    page_types: pageTypesClaim,
    test_urls: testUrlsClaim,
    prerequisites: prerequisitesClaim,
    business_rules: businessRulesClaim,
    safety_level: safetyLevel,
    gaps,
    readiness,
    recommended_action: recommendedAction,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Gap Resolution Logic
// ─────────────────────────────────────────────────────────────────────

/**
 * 갭 해결 방법을 결정합니다.
 */
function resolveGapMethod(actionType: UserActionType, _eventName: string): GapResolutionMethod {
  switch (actionType) {
    case 'click':
      return 'crawlable'; // Recon DOM 분석으로 해결 가능
    case 'scroll':
    case 'view':
      return 'crawlable';
    case 'submit':
    case 'input':
    case 'select':
      return 'visual_analysis'; // 폼 요소 → 시각 분석 우선
    case 'custom':
      return 'ask_tester'; // 커스텀 → 테스터 필요
    default:
      return 'visual_analysis';
  }
}

// ─────────────────────────────────────────────────────────────────────
// Readiness Determination
// ─────────────────────────────────────────────────────────────────────

/**
 * 이벤트 준비도를 판정합니다.
 */
function determineReadiness(
  eventName: string,
  fireCondition: KnowledgeClaim<EventFireCondition> | null,
  selector: KnowledgeClaim<string> | null,
  testUrls: KnowledgeClaim<Record<string, string[]>> | null,
  gaps: KnowledgeGap[],
  testability: string | undefined,
  store: KnowledgeStore | null,
): EventReadiness {
  // manual_only 이벤트
  if (testability === 'manual_only') {
    return 'manual_only';
  }

  // 발생 조건이 불명
  if (!fireCondition) {
    return 'needs_document';
  }

  // auto_fire 이벤트: URL만 있으면 ready
  if (fireCondition.value === 'auto_fire') {
    if (testUrls) {
      return 'ready';
    }
    return 'needs_tester'; // URL만 없으면 테스터에게 물어봄
  }

  // user_action 이벤트
  if (fireCondition.value === 'user_action') {
    if (!testUrls) {
      return 'needs_tester';
    }

    // 셀렉터 체크
    if (selector) {
      if (selector.confidence === 'high') {
        return 'ready';
      }
      // Knowledge Store에서 자동 확인 가능한지 체크
      if (store && selector.source === 'knowledge_store') {
        // 하나라도 auto-confirm 가능하면 ready
        const pageTypes = Object.keys(testUrls.value);
        const anyAutoConfirmable = pageTypes.some(pt => shouldAutoConfirm(store, eventName, pt));
        if (anyAutoConfirmable) {
          return 'ready';
        }
      }
      return 'ready_partial';
    }

    // 셀렉터 없음 → 갭 해결 방법에 따라 분기
    const selectorGap = gaps.find(g => g.gap_type === 'selector_missing');
    if (selectorGap) {
      if (selectorGap.resolution_method === 'crawlable' || selectorGap.resolution_method === 'visual_analysis') {
        return 'needs_recon';
      }
      return 'needs_tester';
    }

    return 'needs_recon';
  }

  // conditional 이벤트
  if (fireCondition.value === 'conditional') {
    if (testUrls && selector) {
      return 'ready_partial';
    }
    return 'needs_tester';
  }

  // forbidden 이벤트: 항상 ready (발생하지 않음을 검증)
  if (fireCondition.value === 'forbidden') {
    return testUrls ? 'ready' : 'needs_tester';
  }

  return 'needs_document';
}

/**
 * 추천 액션을 결정합니다.
 */
function determineRecommendedAction(
  readiness: EventReadiness,
  gaps: KnowledgeGap[],
): RecommendedAction {
  switch (readiness) {
    case 'ready':
      return { action: 'proceed', reason: '모든 지식이 갖춰짐. 바로 수집 가능.' };
    case 'ready_partial':
      return { action: 'proceed', reason: '일부 페이지에서 테스트 가능. 중간 신뢰도 셀렉터 사용.' };
    case 'needs_recon':
      return { action: 'run_recon', reason: '셀렉터 미발견. Site Recon으로 DOM 탐색 필요.' };
    case 'needs_tester': {
      const topGap = gaps.find(g => g.resolution_method === 'ask_tester');
      return {
        action: 'ask_tester',
        reason: topGap ? topGap.description : '테스터 확인 필요.',
      };
    }
    case 'needs_document':
      return { action: 'request_document', reason: '추가 문서(DevGuide 등) 필요.' };
    case 'manual_only':
      return { action: 'skip', reason: '수동 테스트만 가능 (purchase, login 등).' };
    case 'skip':
      return { action: 'skip', reason: '테스트 불필요/불가.' };
    default:
      return { action: 'skip', reason: '알 수 없는 상태.' };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Tester Question Generation
// ─────────────────────────────────────────────────────────────────────

let questionCounter = 0;

/**
 * 갭에서 테스터 질문을 생성합니다.
 */
function generateTesterQuestion(eventName: string, gap: KnowledgeGap): TesterQuestion {
  questionCounter++;

  const questionTemplates: Record<GapType, string> = {
    selector_missing: `[${eventName}] 이 이벤트를 트리거하는 요소의 CSS 셀렉터를 알려주세요.`,
    url_missing: `[${eventName}] 이 이벤트를 테스트할 URL을 알려주세요.`,
    precondition_unknown: `[${eventName}] 이 이벤트 발생에 필요한 전제조건이 있나요? (예: 옵션 선택, 로그인 필요 등)`,
    fire_condition_unknown: `[${eventName}] 이 이벤트는 어떤 조건에서 발생하나요?`,
    page_type_unknown: `[${eventName}] 이 이벤트가 발생하는 페이지 타입을 알려주세요.`,
    business_rule_missing: `[${eventName}] 이 이벤트가 발생해야 하는/하지 않아야 하는 규칙이 있나요?`,
    action_type_unknown: `[${eventName}] 이 이벤트를 발생시키려면 어떤 액션이 필요한가요?`,
  };

  return {
    question_id: `TQ_${questionCounter}`,
    event_name: eventName,
    gap_type: gap.gap_type,
    question: questionTemplates[gap.gap_type],
    priority: gap.priority,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Implicit Prerequisites
// ─────────────────────────────────────────────────────────────────────

/**
 * 이벤트의 암묵적 전제조건을 반환합니다.
 */
function getImplicitPrerequisites(eventName: string): string[] {
  const implicitMap: Record<string, string[]> = {
    add_to_cart: ['상품 옵션(사이즈/색상) 선택이 필요할 수 있음'],
    begin_checkout: ['장바구니에 상품이 있어야 함'],
    purchase: ['결제 프로세스 완료 필요 (수동 테스트)'],
    remove_from_cart: ['장바구니에 상품이 있어야 함'],
    add_shipping_info: ['체크아웃 진행 중이어야 함'],
    add_payment_info: ['체크아웃 진행 중이어야 함'],
    login: ['로그인 페이지 접근 + 유효한 계정 필요 (수동 테스트)'],
    sign_up: ['회원가입 프로세스 필요 (수동 테스트)'],
    write_review: ['리뷰 작성 양식 진입 + 리뷰 제출'],
  };

  return implicitMap[eventName] ?? [];
}

// ─────────────────────────────────────────────────────────────────────
// Summary Computation
// ─────────────────────────────────────────────────────────────────────

/**
 * 요약 통계를 계산합니다.
 */
function computeSummary(eventStates: EventKnowledgeState[]): KnowledgeReadinessReport['summary'] {
  const total = eventStates.length;
  const readyCount = eventStates.filter(s => s.readiness === 'ready' || s.readiness === 'ready_partial').length;
  const needsReconCount = eventStates.filter(s => s.readiness === 'needs_recon').length;
  const needsTesterCount = eventStates.filter(s => s.readiness === 'needs_tester').length;
  const manualOnlyCount = eventStates.filter(s => s.readiness === 'manual_only').length;

  return {
    total_events: total,
    ready_count: readyCount,
    needs_recon_count: needsReconCount,
    needs_tester_count: needsTesterCount,
    manual_only_count: manualOnlyCount,
    readiness_rate: total > 0 ? readyCount / total : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Console Output
// ─────────────────────────────────────────────────────────────────────

/**
 * Knowledge Readiness Report를 콘솔에 출력합니다.
 */
export function printKnowledgeReadinessReport(report: KnowledgeReadinessReport): void {
  console.log('\n  ┌──────────────────────────────────────────────────────────┐');
  console.log('  │  Knowledge Readiness Assessment                         │');
  console.log('  └──────────────────────────────────────────────────────────┘');

  const s = report.summary;
  console.log(`\n  전체 이벤트: ${s.total_events}개`);
  console.log(`  ✅ 테스트 가능:    ${s.ready_count}개 (${(s.readiness_rate * 100).toFixed(0)}%)`);
  console.log(`  🔍 Recon 필요:     ${s.needs_recon_count}개`);
  console.log(`  ❓ 테스터 필요:    ${s.needs_tester_count}개`);
  console.log(`  🔒 수동 테스트:    ${s.manual_only_count}개`);

  // 이벤트별 상태
  const readinessIcons: Record<EventReadiness, string> = {
    ready: '✅',
    ready_partial: '⚠️',
    needs_recon: '🔍',
    needs_tester: '❓',
    needs_document: '📄',
    manual_only: '🔒',
    skip: '⏭️',
  };

  console.log('\n  이벤트별 상태:');
  for (const state of report.event_states) {
    const icon = readinessIcons[state.readiness];
    const gapCount = state.gaps.length;
    const gapInfo = gapCount > 0 ? ` (갭: ${gapCount}개)` : '';
    console.log(`    ${icon} ${state.event_name.padEnd(25)} ${state.readiness}${gapInfo}`);
  }

  // 우선 갭
  if (report.prioritized_gaps.length > 0) {
    console.log(`\n  주요 갭 (상위 5개):`);
    for (const gap of report.prioritized_gaps.slice(0, 5)) {
      console.log(`    [P${gap.priority}] ${gap.description}`);
      console.log(`         해결: ${gap.resolution_method}`);
    }
  }

  // 테스터 질문
  if (report.tester_questions.length > 0) {
    console.log(`\n  테스터 질문 (${report.tester_questions.length}개):`);
    for (const q of report.tester_questions.slice(0, 3)) {
      console.log(`    ❓ ${q.question}`);
    }
    if (report.tester_questions.length > 3) {
      console.log(`    ... 외 ${report.tester_questions.length - 3}개`);
    }
  }

  console.log('');
}
