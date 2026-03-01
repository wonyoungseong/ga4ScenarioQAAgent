/**
 * Content Group / Parser 출력 계약 타입 (Content Group Contract Types)
 *
 * GTM Parser → Validator/Recon 간 데이터 계약을 정의합니다.
 * 구현 파일(gtm-parser.ts)에서 추출하여
 * 에이전트 간 결합도를 낮춥니다.
 *
 * @version 1.0
 */

import type { PageTypeEnum } from './common';
import type {
  EventScenarioSpec,
  UserActionType,
} from './event-scenario';
import type { ParameterSpec } from './parameter-spec';
import type { CrossReferenceResult } from '../knowledge/source-authority';
import type { GTMContainer } from './gtm-container';

// ─────────────────────────────────────────────────────────────────────
// Content Group Rule Types
// ─────────────────────────────────────────────────────────────────────

export interface ContentGroupRule {
  page_type: PageTypeEnum;
  content_group_value: string;
  auto_fire_events: string[];
  action_events: ActionEventRule[];
  forbidden_events: string[];
}

export interface ActionEventRule {
  event_name: string;
  action_type: UserActionType;
  trigger_condition: string;
  target_selector?: string;
  wait_after_ms: number;
}

// ─────────────────────────────────────────────────────────────────────
// GTM Parser Output Type
// ─────────────────────────────────────────────────────────────────────

export interface GTMParserOutput {
  scenario_spec: EventScenarioSpec;
  parameter_spec: ParameterSpec;
  content_group_rules: ContentGroupRule[];
  warnings: string[];
  /** 교차 검증 결과 */
  cross_reference_results?: CrossReferenceResult[];
  /** Raw GTM container (종합 리포터의 트리거 분석용) */
  raw_container?: GTMContainer;
}
