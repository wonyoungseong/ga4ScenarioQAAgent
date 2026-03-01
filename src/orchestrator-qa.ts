/**
 * Full QA Runner - Use Case Layer (상위 조정자)
 *
 * 1차 QA(전역변수) + 2차 QA(이벤트) 파이프라인을 통합 실행합니다.
 * 각 phase는 독립적인 Sub-Orchestrator가 담당합니다.
 *
 * Use Case Layer:
 *   orchestrator.ts (Full QA Runner)
 *     +-- orchestrator-global-variable.ts  (1차 QA)
 *     +-- orchestrator-event.ts            (2차 QA 이벤트)
 *     +-- orchestrator-event-parameter.ts  (2차 QA 파라미터, 향후)
 */

import { runQAPipeline, type QAConfig } from './orchestrator-global-variable';
import { runEventQAPipeline, type EventQAConfig } from './orchestrator-event';
import type { GlobalVariableValidationOutput } from './agents/validator';
import type { EventValidationResult } from './types/event-validation-result';

// ─────────────────────────────────────────────────────────────────────
// QA Phase Types
// ─────────────────────────────────────────────────────────────────────

export type QAPhase = 'global-variable' | 'event-occurrence' | 'event-parameter';

export interface FullQAConfig {
  phases: QAPhase[];
  globalVariable?: QAConfig;
  event?: EventQAConfig;
  // eventParameter?: EventParamQAConfig; // 향후
}

export interface FullQAResult {
  globalVariable?: GlobalVariableValidationOutput;
  event?: EventValidationResult;
  // eventParameter?: EventParamValidationResult; // 향후
}

// ─────────────────────────────────────────────────────────────────────
// Full QA Runner
// ─────────────────────────────────────────────────────────────────────

export async function runFullQA(config: FullQAConfig): Promise<FullQAResult> {
  const results: FullQAResult = {};

  for (const phase of config.phases) {
    switch (phase) {
      case 'global-variable':
        if (config.globalVariable) {
          results.globalVariable = await runQAPipeline(config.globalVariable);
        }
        break;
      case 'event-occurrence':
        if (config.event) {
          results.event = await runEventQAPipeline(config.event);
        }
        break;
      case 'event-parameter':
        // 향후 구현
        break;
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────
// 하위호환 Re-exports
// ─────────────────────────────────────────────────────────────────────

export {
  runQAPipeline,
  runMultiChannelQA,
  type QAConfig,
  type MultiChannelQAConfig,
  type MultiChannelQAResult,
} from './orchestrator-global-variable';

export {
  runEventQAPipeline,
  type EventQAConfig,
} from './orchestrator-event';
