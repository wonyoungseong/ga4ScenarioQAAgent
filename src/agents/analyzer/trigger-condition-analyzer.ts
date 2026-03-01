/**
 * Trigger Condition Analyzer
 *
 * GTM 태그 -> 트리거 -> 필터 -> 변수 체인을 추적하여
 * As-Is / To-Be 텍스트를 자동 생성합니다.
 *
 * @version 1.0
 */

import type {
  GTMContainer,
  GTMTag,
  GTMTrigger,
  GTMVariable,
  GTMCondition,
} from '../../types/gtm-container';
import type {
  TriggerConditionTrace,
  FilterConditionDetail,
  VariableResolutionStep,
} from '../../types/qa-report';
import type { EventValidationStatus } from '../../types/event-validation-result';

// ─────────────────────────────────────────────────────────────────────
// GTM Variable Reference Pattern
// ─────────────────────────────────────────────────────────────────────

const VARIABLE_REF_PATTERN = /\{\{([^}]+)\}\}/g;

// ─────────────────────────────────────────────────────────────────────
// Main Analysis Functions
// ─────────────────────────────────────────────────────────────────────

/**
 * 이벤트의 GTM 트리거 조건을 분석합니다.
 *
 * @param eventName GA4 이벤트명
 * @param container GTM Container JSON
 * @returns TriggerConditionTrace
 */
export function analyzeTriggerCondition(
  eventName: string,
  container: GTMContainer,
): TriggerConditionTrace | null {
  const tags = container.containerVersion.tag ?? [];
  const triggers = container.containerVersion.trigger ?? [];
  const variables = container.containerVersion.variable ?? [];

  // 1. 해당 이벤트의 GA4 태그 찾기
  const ga4Tag = findGA4TagForEvent(eventName, tags);
  if (!ga4Tag) return null;

  // 2. 발화 트리거 찾기
  const firingTriggerIds = ga4Tag.firingTriggerId ?? [];
  const firingTriggers = firingTriggerIds
    .map(id => triggers.find(t => t.triggerId === id))
    .filter((t): t is GTMTrigger => t !== undefined);

  if (firingTriggers.length === 0) return null;

  const primaryTrigger = firingTriggers[0];

  // 3. 필터 조건 분석
  const filterConditions: FilterConditionDetail[] = [];
  const variableChain: VariableResolutionStep[] = [];

  // Custom Event Filter
  let customEventFilter: string | undefined;
  if (primaryTrigger.customEventFilter) {
    for (const cef of primaryTrigger.customEventFilter) {
      const detail = parseCondition(cef);
      if (detail) {
        filterConditions.push(detail);
        customEventFilter = detail.value;
      }
    }
  }

  // General Filters
  if (primaryTrigger.filter) {
    for (const f of primaryTrigger.filter) {
      const detail = parseCondition(f);
      if (detail) {
        filterConditions.push(detail);
        // Resolve variable chain for each filter variable
        const varRefs = extractVariableReferences(detail.variable);
        for (const varName of varRefs) {
          const chain = resolveVariableChain(varName, variables);
          variableChain.push(...chain);
        }
      }
    }
  }

  // Content Group filter: extract from filter conditions
  let contentGroupFilter: string | undefined;
  for (const fc of filterConditions) {
    if (fc.variable.includes('Content Group') || fc.variable.includes('content_group')) {
      contentGroupFilter = fc.value;
      break;
    }
  }

  return {
    event_name: eventName,
    tag_name: ga4Tag.name,
    tag_id: ga4Tag.tagId,
    trigger_type: primaryTrigger.type,
    filter_conditions: filterConditions,
    custom_event_filter: customEventFilter,
    content_group_filter: contentGroupFilter,
    variable_chain: variableChain,
  };
}

/**
 * GTM 변수 체인을 해석합니다.
 *
 * @param variableName GTM 변수명 ({{}} 없이)
 * @param variables GTM 변수 목록
 * @param visited 순환 참조 방지용
 * @returns VariableResolutionStep[]
 */
export function resolveVariableChain(
  variableName: string,
  variables: GTMVariable[],
  visited: Set<string> = new Set(),
): VariableResolutionStep[] {
  if (visited.has(variableName)) return [];
  visited.add(variableName);

  const variable = variables.find(v => v.name === variableName);
  if (!variable) {
    // Built-in variable (Event, Page URL, etc.)
    return [{
      variable_name: variableName,
      variable_type: 'built-in',
      resolves_to: variableName,
      final_source: variableName,
    }];
  }

  const steps: VariableResolutionStep[] = [];
  const varType = variable.type;

  switch (varType) {
    case 'v': {
      // Data Layer Variable
      const nameParam = variable.parameter?.find(p => p.key === 'name');
      const dlKey = nameParam?.value ?? variableName;
      steps.push({
        variable_name: variableName,
        variable_type: 'v',
        resolves_to: `dataLayer.${dlKey}`,
        final_source: `dataLayer.${dlKey}`,
      });
      break;
    }
    case 'j': {
      // JavaScript Variable (window.*)
      const nameParam = variable.parameter?.find(p => p.key === 'name');
      const jsPath = nameParam?.value ?? variableName;
      steps.push({
        variable_name: variableName,
        variable_type: 'j',
        resolves_to: `window.${jsPath}`,
        final_source: `window.${jsPath}`,
      });
      break;
    }
    case 'jsm': {
      // Custom JavaScript
      const jsCode = variable.parameter?.find(p => p.key === 'javascript')?.value ?? '';
      // Extract {{variable}} references from JS code
      const refs = extractVariableReferences(jsCode);
      const resolvedRefs = refs.map(ref => `{{${ref}}}`).join(', ');

      steps.push({
        variable_name: variableName,
        variable_type: 'jsm',
        resolves_to: refs.length > 0 ? `Custom JS using ${resolvedRefs}` : 'Custom JS function',
      });

      // Recursively resolve referenced variables
      for (const ref of refs) {
        const childSteps = resolveVariableChain(ref, variables, visited);
        steps.push(...childSteps);
      }
      break;
    }
    case 'smm': {
      // Lookup Table
      const inputVar = variable.parameter?.find(p => p.key === 'input')?.value ?? '';
      const inputRefs = extractVariableReferences(inputVar);
      const inputVarName = inputRefs[0] ?? inputVar;

      steps.push({
        variable_name: variableName,
        variable_type: 'smm',
        resolves_to: `Lookup Table (input: {{${inputVarName}}})`,
      });

      if (inputRefs.length > 0) {
        const childSteps = resolveVariableChain(inputRefs[0], variables, visited);
        steps.push(...childSteps);
      }
      break;
    }
    case 'c': {
      // Constant
      const constValue = variable.parameter?.find(p => p.key === 'value')?.value ?? '';
      steps.push({
        variable_name: variableName,
        variable_type: 'c',
        resolves_to: `"${constValue}"`,
        final_source: `constant: "${constValue}"`,
      });
      break;
    }
    case 'remm': {
      // Regex Table
      const inputVar = variable.parameter?.find(p => p.key === 'input')?.value ?? '';
      const inputRefs = extractVariableReferences(inputVar);
      steps.push({
        variable_name: variableName,
        variable_type: 'remm',
        resolves_to: `Regex Table (input: ${inputVar})`,
      });
      for (const ref of inputRefs) {
        const childSteps = resolveVariableChain(ref, variables, visited);
        steps.push(...childSteps);
      }
      break;
    }
    default: {
      steps.push({
        variable_name: variableName,
        variable_type: varType,
        resolves_to: `GTM Variable (${varType})`,
      });
    }
  }

  return steps;
}

/**
 * As-Is 텍스트를 생성합니다 (이슈 이벤트용).
 */
export function generateAsIs(
  trace: TriggerConditionTrace | null,
  status: EventValidationStatus,
  pageType: string,
  symptom: string,
): string {
  if (!trace) {
    return status === 'MISSING'
      ? `해당 페이지(${pageType})에서 이벤트 미발생`
      : `이벤트 검증 상태: ${status}`;
  }

  const lines: string[] = [];
  lines.push(`GTM 태그: "${trace.tag_name}" (Tag ID: ${trace.tag_id})`);
  lines.push(`트리거 타입: ${trace.trigger_type}`);

  if (trace.custom_event_filter) {
    lines.push(`Custom Event 필터: {{_event}} = "${trace.custom_event_filter}"`);
  }

  for (const fc of trace.filter_conditions) {
    lines.push(`필터 조건: ${fc.human_readable}`);
  }

  // Variable chain summary
  const finalSources = trace.variable_chain
    .filter(s => s.final_source)
    .map(s => `${s.variable_name} -> ${s.final_source}`);
  if (finalSources.length > 0) {
    lines.push(`변수 체인: ${finalSources.join(', ')}`);
  }

  if (status === 'MISSING') {
    // negate + "undefined" 조건이면 구체적인 현상 설명
    const negatedUndefinedFilter = trace.filter_conditions
      .find(fc => fc.negate && fc.value === 'undefined' && !fc.variable.includes('_event'));
    if (negatedUndefinedFilter) {
      // dataLayer 변수(v) 우선, 없으면 마지막 final_source 사용
      const dataLayerSource = trace.variable_chain.find(s => s.variable_type === 'v' && s.final_source);
      const anySource = [...trace.variable_chain].reverse().find(s => s.final_source);
      const sourceDesc = dataLayerSource?.final_source ?? anySource?.final_source ?? negatedUndefinedFilter.variable;
      lines.push(`현상: ${pageType} 페이지에서 ${sourceDesc} 값이 undefined를 반환하여 트리거 조건(≠ undefined) 미충족으로 이벤트 미발생`);
    } else {
      lines.push(`현상: ${pageType} 페이지에서 트리거 조건 미충족으로 이벤트 미발생`);
    }
  } else if (status === 'EXTRA') {
    lines.push(`현상: ${pageType} 페이지에서 이벤트가 발생하면 안 되는데 발생함`);
  } else if (status === 'FAIL') {
    lines.push(`현상: ${symptom}`);
  }

  return lines.join('\n');
}

/**
 * To-Be 텍스트를 생성합니다 (이슈 이벤트용).
 */
export function generateToBe(
  trace: TriggerConditionTrace | null,
  status: EventValidationStatus,
  pageType: string,
): string {
  if (!trace) {
    return status === 'MISSING'
      ? `해당 페이지 타입(${pageType})에서 이벤트가 정상 발생하도록 dataLayer push 구현 필요`
      : `이벤트 발생 조건 확인 필요`;
  }

  const lines: string[] = [];

  if (status === 'MISSING') {
    if (trace.custom_event_filter) {
      // Custom Event 기반 트리거
      const finalSources = trace.variable_chain.filter(s => s.final_source);
      const nonEventFilter = trace.filter_conditions
        .find(fc => !fc.variable.includes('_event'));

      if (nonEventFilter && finalSources.length > 0) {
        const src = finalSources[finalSources.length - 1];
        if (src.final_source) {
          if (nonEventFilter.negate && nonEventFilter.value === 'undefined') {
            // negate + "undefined" → 변수가 유효한 값을 반환해야 함
            lines.push(`${src.final_source}에 유효한 데이터가 push되어야 함 (현재 해당 변수가 undefined를 반환하여 트리거 조건 미충족)`);
          } else if (nonEventFilter.negate) {
            // negate + 다른 값 → 해당 값이 아닌 값이어야 함
            lines.push(`${src.final_source} 변수가 "${nonEventFilter.value}"가 아닌 값을 반환하도록 수정 필요`);
          } else {
            // 정방향 조건 → 해당 값이 포함되어야 함
            lines.push(`${src.final_source} 변수에 "${nonEventFilter.value}" 값이 포함되도록 dataLayer push 구현 필요`);
          }
        }
      }
      lines.push(`또는: 해당 페이지 타입(${pageType})에서 "${trace.custom_event_filter}" Custom Event가 dataLayer에 push되도록 수정 필요`);
    } else {
      // DOM_READY / PAGEVIEW 기반 트리거
      lines.push(`해당 페이지 타입(${pageType})에서 트리거 조건이 충족되도록 구현 필요`);
      for (const fc of trace.filter_conditions) {
        lines.push(`- ${fc.human_readable} 조건 확인`);
      }
    }
  } else if (status === 'EXTRA') {
    lines.push(`해당 페이지 타입(${pageType})에서 이벤트가 발생하지 않도록 트리거 조건 수정 필요`);
    if (trace.content_group_filter) {
      lines.push(`Content Group 필터에서 ${pageType} 페이지를 제외하도록 수정`);
    }
  } else if (status === 'FAIL') {
    lines.push(`이벤트 발생 조건(타이밍, 순서, 파라미터)을 개발가이드 기준으로 수정 필요`);
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────────────

/** GA4 이벤트 태그 찾기 */
function findGA4TagForEvent(eventName: string, tags: GTMTag[]): GTMTag | null {
  for (const tag of tags) {
    if (tag.type !== 'gaawe') continue;
    const eventNameParam = tag.parameter?.find(p => p.key === 'eventName');
    if (!eventNameParam) continue;

    const tagEventName = eventNameParam.value ?? '';
    // Handle variable references in event name (e.g. {{DLV - event_name}})
    const cleanName = tagEventName.replace(/\{\{[^}]+\}\}/g, '').trim();

    if (cleanName === eventName || tagEventName === eventName) {
      return tag;
    }
  }
  return null;
}

/** GTM 조건을 사람이 읽을 수 있는 형태로 파싱 */
function parseCondition(condition: GTMCondition): FilterConditionDetail | null {
  const params = condition.parameter;
  if (!params || params.length < 2) return null;

  const arg0 = params.find(p => p.key === 'arg0');
  const arg1 = params.find(p => p.key === 'arg1');

  if (!arg0 || !arg1) return null;

  const variable = arg0.value ?? '';
  const value = arg1.value ?? '';
  const type = condition.type;
  // GTM은 negate를 parameter 배열 내 { key: "negate", value: "true" }로 저장
  const negate = params.find(p => p.key === 'negate')?.value === 'true';

  const typeLabel = getConditionTypeLabel(type, negate);
  const humanReadable = `${variable} ${typeLabel} "${value}"`;

  return {
    type,
    variable,
    value,
    negate,
    human_readable: humanReadable,
  };
}

/** 조건 타입 → 사람이 읽을 수 있는 레이블 */
function getConditionTypeLabel(type: string, negate: boolean = false): string {
  if (negate) {
    switch (type) {
      case 'EQUALS': return '≠';
      case 'CONTAINS': return 'does not contain';
      case 'STARTS_WITH': return 'does not start with';
      case 'ENDS_WITH': return 'does not end with';
      case 'MATCH_REGEX': return 'does not match regex';
      case 'CSS_SELECTOR': return 'does not match CSS';
      case 'URL_MATCHES': return 'URL does not match';
      default: return `NOT ${type}`;
    }
  }
  switch (type) {
    case 'EQUALS': return '=';
    case 'CONTAINS': return 'contains';
    case 'STARTS_WITH': return 'starts with';
    case 'ENDS_WITH': return 'ends with';
    case 'MATCH_REGEX': return 'matches regex';
    case 'GREATER': return '>';
    case 'GREATER_OR_EQUALS': return '>=';
    case 'LESS': return '<';
    case 'LESS_OR_EQUALS': return '<=';
    case 'CSS_SELECTOR': return 'matches CSS';
    case 'URL_MATCHES': return 'URL matches';
    default: return type;
  }
}

/** 문자열에서 {{variable}} 참조 추출 */
function extractVariableReferences(text: string): string[] {
  const refs: string[] = [];
  let match: RegExpExecArray | null;
  const pattern = new RegExp(VARIABLE_REF_PATTERN.source, 'g');
  while ((match = pattern.exec(text)) !== null) {
    refs.push(match[1]);
  }
  return refs;
}
