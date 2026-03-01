/**
 * Tester Interaction - CLI 기반 가설 확인 인터페이스
 *
 * AI가 생성한 가설을 테스터에게 제시하고, 확인/수정/거부를 받습니다.
 * Knowledge Store에 이미 축적된 지식은 자동 확인합니다.
 *
 * @version 1.0
 */

import * as readline from 'readline';
import type { EventHypothesis, TesterResponse, KnowledgeStore } from '../../types/knowledge-state';
import { shouldAutoConfirm } from '../../knowledge/knowledge-store';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface TesterInteractionOptions {
  /** 자동 확인 모드 (모든 가설 자동 승인) */
  autoConfirm: boolean;
  /** Knowledge Store (자동 확인 판단용) */
  knowledgeStore?: KnowledgeStore | null;
}

// ─────────────────────────────────────────────────────────────────────
// Main Function
// ─────────────────────────────────────────────────────────────────────

/**
 * 가설을 테스터에게 제시하고 확인을 받습니다.
 *
 * - Knowledge Store에서 자동 확인 가능한 가설은 자동 승인
 * - autoConfirm=true이면 모든 가설을 자동 승인
 * - 나머지는 CLI에서 테스터에게 질문
 *
 * @returns 확인된 가설 목록 (mutation: hypothesis.confirmation_status 업데이트)
 */
export async function presentHypothesesForConfirmation(
  hypotheses: EventHypothesis[],
  options: TesterInteractionOptions,
): Promise<TesterResponse[]> {
  const responses: TesterResponse[] = [];

  if (hypotheses.length === 0) {
    console.log('\n  ── Phase 5: 가설 확인 (0개) ──');
    return responses;
  }

  // 자동 확인 가능한 가설 분류
  const autoConfirmable: EventHypothesis[] = [];
  const needsConfirmation: EventHypothesis[] = [];

  for (const h of hypotheses) {
    if (options.autoConfirm) {
      autoConfirmable.push(h);
    } else if (
      options.knowledgeStore &&
      shouldAutoConfirm(options.knowledgeStore, h.event_name, h.page_type)
    ) {
      autoConfirmable.push(h);
    } else {
      needsConfirmation.push(h);
    }
  }

  console.log(`\n  ── Phase 5: 가설 확인 (${hypotheses.length}개, ${autoConfirmable.length}개 자동확인) ──`);

  // 자동 확인 처리
  for (const h of autoConfirmable) {
    h.confirmation_status = 'confirmed';
    responses.push({
      hypothesis_id: h.hypothesis_id,
      response: 'confirmed',
    });
    console.log(`  ✅ [${h.event_name}] ${h.page_type} (자동확인 - Knowledge Store)`);
  }

  // 테스터 확인 필요한 가설 처리
  if (needsConfirmation.length > 0) {
    if (options.autoConfirm) {
      // autoConfirm 모드에서는 이미 전부 처리됨
      return responses;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      for (let i = 0; i < needsConfirmation.length; i++) {
        const h = needsConfirmation[i];
        const testerResponse = await askTesterAboutHypothesis(rl, h, i + 1, needsConfirmation.length);
        responses.push(testerResponse);

        // 가설 상태 업데이트
        switch (testerResponse.response) {
          case 'confirmed':
            h.confirmation_status = 'confirmed';
            break;
          case 'rejected':
            h.confirmation_status = 'rejected';
            break;
          case 'corrected':
            h.confirmation_status = 'corrected';
            if (testerResponse.correction) {
              h.trigger.suggested_selector = testerResponse.correction;
            }
            break;
          case 'skipped':
            // confirmation_status remains 'pending'
            break;
        }
      }
    } finally {
      rl.close();
    }
  }

  // 요약 출력
  const confirmed = responses.filter(r => r.response === 'confirmed').length;
  const corrected = responses.filter(r => r.response === 'corrected').length;
  const rejected = responses.filter(r => r.response === 'rejected').length;
  const skipped = responses.filter(r => r.response === 'skipped').length;

  console.log(`\n  가설 확인 요약: ✅ ${confirmed} 확인 | 🔄 ${corrected} 수정 | ❌ ${rejected} 거부 | ⏭️ ${skipped} 스킵`);

  return responses;
}

// ─────────────────────────────────────────────────────────────────────
// Individual Hypothesis Question
// ─────────────────────────────────────────────────────────────────────

function askTesterAboutHypothesis(
  rl: readline.Interface,
  hypothesis: EventHypothesis,
  index: number,
  total: number,
): Promise<TesterResponse> {
  return new Promise((resolve) => {
    const stars = getConfidenceStars(hypothesis.confidence);

    console.log(`\n  ❓ [${index}/${total}] ${hypothesis.event_name} @ ${hypothesis.page_type}`);
    console.log(`     가설: ${hypothesis.statement}`);
    if (hypothesis.trigger.suggested_selector) {
      console.log(`     셀렉터: ${hypothesis.trigger.suggested_selector}`);
    }
    if (hypothesis.trigger.trigger_text) {
      console.log(`     트리거 텍스트: "${hypothesis.trigger.trigger_text}"`);
    }
    if (hypothesis.prerequisites.length > 0) {
      console.log(`     전제조건: ${hypothesis.prerequisites.join(', ')}`);
    }
    console.log(`     신뢰도: ${stars} (${(hypothesis.confidence * 100).toFixed(0)}%)`);
    console.log(`     소스: [${hypothesis.sources.join(', ')}]`);
    console.log('');
    console.log('     [Y] 맞습니다  [N] 아닙니다  [E] 수정  [S] 스킵');

    const askInput = (): void => {
      rl.question('     > ', (answer) => {
        const trimmed = answer.trim().toUpperCase();

        switch (trimmed) {
          case 'Y':
          case 'YES':
            console.log('     ✅ 확인 완료');
            resolve({
              hypothesis_id: hypothesis.hypothesis_id,
              response: 'confirmed',
            });
            break;

          case 'N':
          case 'NO':
            console.log('     ❌ 거부됨');
            resolve({
              hypothesis_id: hypothesis.hypothesis_id,
              response: 'rejected',
              note: '테스터가 거부',
            });
            break;

          case 'E':
          case 'EDIT':
            rl.question('     수정된 셀렉터: ', (selector) => {
              const correctedValue = selector.trim();
              if (correctedValue) {
                console.log(`     🔄 수정 완료: ${correctedValue}`);
                resolve({
                  hypothesis_id: hypothesis.hypothesis_id,
                  response: 'corrected',
                  correction: correctedValue,
                });
              } else {
                console.log('     빈 입력. 다시 선택해주세요.');
                askInput();
              }
            });
            break;

          case 'S':
          case 'SKIP':
            console.log('     ⏭️ 스킵');
            resolve({
              hypothesis_id: hypothesis.hypothesis_id,
              response: 'skipped',
            });
            break;

          default:
            console.log('     유효하지 않은 입력. [Y/N/E/S] 중 선택해주세요.');
            askInput();
            break;
        }
      });
    };

    askInput();
  });
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function getConfidenceStars(confidence: number): string {
  const filled = Math.round(confidence * 3);
  const empty = 3 - filled;
  return '★'.repeat(filled) + '☆'.repeat(empty);
}
