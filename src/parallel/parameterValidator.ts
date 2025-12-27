/**
 * Parameter Validator
 *
 * Level 2 (키 존재 여부) + Level 3 (값 정확성) 파라미터 검증
 * 검증 결과를 기반으로 시스템 프롬프트 피드백 생성
 */

import { ComparisonEngine } from '../comparison/ComparisonEngine';
import {
  PredictedParameter,
  GA4Parameter,
  SpecParameter,
  ParameterComparison,
  EventComparison,
  ComparisonVerdict,
  ContentGroup
} from '../branch/types';
import { ComparisonInput } from '../comparison/types';
import { ParameterValuePredictor } from '../learning/parameterValuePredictor';

/**
 * 파라미터 검증 레벨
 */
export enum ValidationLevel {
  LEVEL1_EVENT_ONLY = 1,      // 이벤트명만 비교
  LEVEL2_PARAM_KEYS = 2,      // 파라미터 키 존재 여부
  LEVEL3_PARAM_VALUES = 3,    // 파라미터 값 정확성
}

/**
 * 파라미터 검증 결과
 */
export interface ParameterValidationResult {
  eventName: string;
  contentGroup: string;
  pageUrl: string;

  /** Level 2: 파라미터 키 검증 */
  keyValidation: {
    totalExpectedKeys: number;
    presentKeys: string[];
    missingKeys: string[];
    extraKeys: string[];
    keyAccuracy: number;  // presentKeys / totalExpectedKeys * 100
  };

  /** Level 3: 파라미터 값 검증 */
  valueValidation: {
    totalParams: number;
    matchedValues: number;
    mismatchedValues: number;
    partialMatches: number;
    valueAccuracy: number;  // matchedValues / totalParams * 100
    details: ParameterComparison[];
  };

  /** 종합 점수 */
  overallScore: number;

  /** 시스템 프롬프트 피드백 */
  feedback: PromptFeedback[];
}

/**
 * 시스템 프롬프트 피드백
 */
export interface PromptFeedback {
  type: 'RULE_ADD' | 'RULE_UPDATE' | 'RULE_REMOVE' | 'HINT_ADD' | 'WARNING';
  priority: 'critical' | 'high' | 'medium' | 'low';
  target: 'vision_prompt' | 'prediction_rules' | 'edge_cases';
  parameterName?: string;
  eventName?: string;
  currentBehavior: string;
  expectedBehavior: string;
  suggestedFix: string;
  occurrenceCount?: number;
}

/**
 * 집계된 검증 결과
 */
export interface AggregatedValidationResult {
  /** 전체 통계 */
  summary: {
    totalEvents: number;
    avgKeyAccuracy: number;
    avgValueAccuracy: number;
    avgOverallScore: number;
  };

  /** 이벤트별 결과 */
  eventResults: ParameterValidationResult[];

  /** 집계된 피드백 (중복 제거 및 우선순위 정렬) */
  aggregatedFeedback: PromptFeedback[];

  /** 파라미터별 이슈 통계 */
  parameterIssueStats: Map<string, {
    missingCount: number;
    mismatchCount: number;
    affectedEvents: string[];
  }>;
}

/**
 * 파라미터 검증기 클래스
 */
export class ParameterValidator {
  private comparisonEngine: ComparisonEngine;
  private validationLevel: ValidationLevel;

  constructor(validationLevel: ValidationLevel = ValidationLevel.LEVEL3_PARAM_VALUES) {
    this.comparisonEngine = new ComparisonEngine({
      allowPartialMatch: true,
      normalizeStrings: true,
      caseInsensitive: true
    });
    this.validationLevel = validationLevel;
  }

  /**
   * 단일 이벤트 파라미터 검증
   */
  validateEventParameters(
    eventName: string,
    contentGroup: ContentGroup,
    pageUrl: string,
    predictedParams: PredictedParameter[],
    actualParams: GA4Parameter[],
    specParams: SpecParameter[]
  ): ParameterValidationResult {
    // 메타 파라미터 제외
    const filteredPredicted = predictedParams.filter(p => !p.name.startsWith('_'));
    const filteredActual = actualParams.filter(p => !p.name.startsWith('_'));

    // Level 2: 키 검증
    const keyValidation = this.validateKeys(filteredPredicted, filteredActual, specParams);

    // Level 3: 값 검증
    const valueValidation = this.validateValues(
      eventName,
      contentGroup,
      pageUrl,
      filteredPredicted,
      filteredActual,
      specParams
    );

    // 종합 점수 계산 (키 30%, 값 70%)
    const overallScore = keyValidation.keyAccuracy * 0.3 + valueValidation.valueAccuracy * 0.7;

    // 피드백 생성
    const feedback = this.generateFeedback(eventName, keyValidation, valueValidation);

    return {
      eventName,
      contentGroup,
      pageUrl,
      keyValidation,
      valueValidation,
      overallScore,
      feedback
    };
  }

  /**
   * Level 2: 파라미터 키 검증
   */
  private validateKeys(
    predicted: PredictedParameter[],
    actual: GA4Parameter[],
    spec: SpecParameter[]
  ): ParameterValidationResult['keyValidation'] {
    // 예상되는 키 = 스펙에 정의된 키
    const expectedKeys = new Set(spec.map(s => s.ga4Key));
    const predictedKeys = new Set(predicted.map(p => p.name));
    const actualKeys = new Set(actual.map(a => a.name));

    // 존재하는 키 (예측 또는 실제에 있는 키 중 스펙에도 있는 것)
    const presentKeys = [...expectedKeys].filter(k => predictedKeys.has(k) || actualKeys.has(k));

    // 누락된 키 (스펙에 있지만 예측도 실제도 없는 것)
    const missingKeys = [...expectedKeys].filter(k => !predictedKeys.has(k) && !actualKeys.has(k));

    // 추가 키 (스펙에 없지만 수집된 것)
    const extraKeys = [...actualKeys].filter(k => !expectedKeys.has(k));

    const totalExpectedKeys = expectedKeys.size;
    const keyAccuracy = totalExpectedKeys > 0
      ? (presentKeys.length / totalExpectedKeys) * 100
      : 100;

    return {
      totalExpectedKeys,
      presentKeys,
      missingKeys,
      extraKeys,
      keyAccuracy
    };
  }

  /**
   * Level 3: 파라미터 값 검증
   * - VERIFIABLE: GA4 집계 데이터와 비교 (CONSTANT, EVENT_FIXED)
   * - CONTENT_GROUP: 컨텐츠 그룹 기반 - GA4 집계 데이터와 비교 불가 (제외)
   * - DYNAMIC: 동적 값 - GA4 집계 데이터와 비교 불가 (제외)
   *
   * GA4 API는 사이트 전체 집계 데이터를 반환하므로,
   * 페이지별로 달라지는 CONTENT_GROUP/DYNAMIC 파라미터는 정확도 계산에서 제외합니다.
   */
  private validateValues(
    eventName: string,
    contentGroup: ContentGroup,
    pageUrl: string,
    predicted: PredictedParameter[],
    actual: GA4Parameter[],
    spec: SpecParameter[]
  ): ParameterValidationResult['valueValidation'] {
    // ComparisonEngine 사용
    const input: ComparisonInput = {
      eventName,
      contentGroup,
      pageUrl,
      predicted,
      actual,
      spec
    };

    const eventComparison = this.comparisonEngine.compareEvent(input);

    // 파라미터 유형별 분류
    const paramTypes = ParameterValuePredictor.classifyEventParameters(
      eventName,
      eventComparison.parameters.map(p => p.parameterName)
    );

    // 통계 계산
    // - VERIFIABLE만 정확도 계산에 포함
    // - CONTENT_GROUP, DYNAMIC은 GA4 집계 데이터와 비교 불가하므로 제외
    let matchedValues = 0;
    let mismatchedValues = 0;
    let partialMatches = 0;
    let skippedCount = 0;  // 정확도 계산에서 제외된 파라미터 수

    for (const param of eventComparison.parameters) {
      const paramType = paramTypes.get(param.parameterName);

      // DYNAMIC 또는 CONTENT_GROUP 파라미터는 정확도 계산에서 제외
      // 이유: GA4 API는 사이트 전체 집계 데이터를 반환하므로 페이지별 비교 불가
      if (paramType === 'DYNAMIC' || paramType === 'CONTENT_GROUP') {
        skippedCount++;
        continue;
      }

      // VERIFIABLE 파라미터만 정확도 계산에 포함
      if (param.verdict === 'MATCH' || param.verdict === 'PREDICTED_CORRECT') {
        if (param.details.matchType === 'partial') {
          partialMatches++;
        } else {
          matchedValues++;
        }
      } else if (param.verdict === 'PREDICTION_WRONG' || param.verdict === 'SPEC_VIOLATION') {
        mismatchedValues++;
      }
    }

    // 검증 대상 파라미터 수 (VERIFIABLE만)
    const verifiableParams = eventComparison.parameters.length - skippedCount;
    const valueAccuracy = verifiableParams > 0
      ? ((matchedValues + partialMatches * 0.5) / verifiableParams) * 100
      : 100;

    return {
      totalParams: eventComparison.parameters.length,
      matchedValues,
      mismatchedValues,
      partialMatches,
      valueAccuracy,
      details: eventComparison.parameters
    };
  }

  /**
   * 시스템 프롬프트 피드백 생성
   */
  private generateFeedback(
    eventName: string,
    keyValidation: ParameterValidationResult['keyValidation'],
    valueValidation: ParameterValidationResult['valueValidation']
  ): PromptFeedback[] {
    const feedback: PromptFeedback[] = [];

    // 누락된 키에 대한 피드백
    for (const missingKey of keyValidation.missingKeys) {
      feedback.push({
        type: 'RULE_ADD',
        priority: 'high',
        target: 'vision_prompt',
        parameterName: missingKey,
        eventName,
        currentBehavior: `파라미터 "${missingKey}"가 예측되지 않음`,
        expectedBehavior: `파라미터 "${missingKey}"가 추출되어야 함`,
        suggestedFix: `Vision AI 프롬프트에 "${missingKey}" 추출 규칙 추가 필요`
      });
    }

    // 값 불일치에 대한 피드백
    // ⚠️ DYNAMIC 파라미터는 값 비교 대상이 아니므로 피드백에서 제외
    for (const param of valueValidation.details) {
      if (param.verdict === 'PREDICTION_WRONG') {
        // DYNAMIC 파라미터는 피드백 생성 제외 (2025-12-28 CRITICAL 이슈 수정)
        const valueType = ParameterValuePredictor.classifyParameterType(eventName, param.parameterName);
        if (valueType === 'DYNAMIC') {
          continue;  // DYNAMIC 파라미터는 값 불일치 리포팅 제외
        }

        feedback.push({
          type: 'RULE_UPDATE',
          priority: param.confidence === 'high' ? 'critical' : 'high',
          target: 'prediction_rules',
          parameterName: param.parameterName,
          eventName,
          currentBehavior: `예측값: "${param.predicted}"`,
          expectedBehavior: `실제값: "${param.actual}"`,
          suggestedFix: `예측 규칙 수정 필요: ${param.details.discrepancyReason || '값 정규화 또는 추출 로직 검토'}`
        });
      }

      if (param.verdict === 'ACTUAL_MISSING') {
        feedback.push({
          type: 'WARNING',
          priority: 'medium',
          target: 'edge_cases',
          parameterName: param.parameterName,
          eventName,
          currentBehavior: `예측값 "${param.predicted}"이 GA4에서 수집되지 않음`,
          expectedBehavior: `GA4에서 해당 파라미터가 수집되어야 함`,
          suggestedFix: `GTM 트리거 또는 dataLayer 구현 확인 필요`
        });
      }

      if (param.verdict === 'SPEC_VIOLATION') {
        feedback.push({
          type: 'RULE_UPDATE',
          priority: 'critical',
          target: 'prediction_rules',
          parameterName: param.parameterName,
          eventName,
          currentBehavior: `실제값 "${param.actual}"이 스펙 위반`,
          expectedBehavior: `스펙에 정의된 값이어야 함`,
          suggestedFix: `스펙 정의 또는 실제 구현 검토 필요`
        });
      }
    }

    return feedback;
  }

  /**
   * 여러 이벤트의 검증 결과 집계
   */
  aggregateResults(results: ParameterValidationResult[]): AggregatedValidationResult {
    if (results.length === 0) {
      return {
        summary: {
          totalEvents: 0,
          avgKeyAccuracy: 0,
          avgValueAccuracy: 0,
          avgOverallScore: 0
        },
        eventResults: [],
        aggregatedFeedback: [],
        parameterIssueStats: new Map()
      };
    }

    // 통계 계산
    let totalKeyAccuracy = 0;
    let totalValueAccuracy = 0;
    let totalOverallScore = 0;

    for (const result of results) {
      totalKeyAccuracy += result.keyValidation.keyAccuracy;
      totalValueAccuracy += result.valueValidation.valueAccuracy;
      totalOverallScore += result.overallScore;
    }

    const count = results.length;

    // 파라미터별 이슈 집계
    const parameterIssueStats = new Map<string, {
      missingCount: number;
      mismatchCount: number;
      affectedEvents: string[];
    }>();

    for (const result of results) {
      // 누락된 키 집계
      for (const key of result.keyValidation.missingKeys) {
        const stats = parameterIssueStats.get(key) || {
          missingCount: 0,
          mismatchCount: 0,
          affectedEvents: []
        };
        stats.missingCount++;
        stats.affectedEvents.push(result.eventName);
        parameterIssueStats.set(key, stats);
      }

      // 불일치 값 집계
      for (const param of result.valueValidation.details) {
        if (param.verdict === 'PREDICTION_WRONG' || param.verdict === 'SPEC_VIOLATION') {
          const stats = parameterIssueStats.get(param.parameterName) || {
            missingCount: 0,
            mismatchCount: 0,
            affectedEvents: []
          };
          stats.mismatchCount++;
          if (!stats.affectedEvents.includes(result.eventName)) {
            stats.affectedEvents.push(result.eventName);
          }
          parameterIssueStats.set(param.parameterName, stats);
        }
      }
    }

    // 피드백 집계 및 중복 제거
    const feedbackMap = new Map<string, PromptFeedback>();
    for (const result of results) {
      for (const fb of result.feedback) {
        const key = `${fb.type}:${fb.parameterName}:${fb.target}`;
        const existing = feedbackMap.get(key);
        if (existing) {
          existing.occurrenceCount = (existing.occurrenceCount || 1) + 1;
          // 더 높은 우선순위로 업그레이드
          if (fb.priority === 'critical' ||
              (fb.priority === 'high' && existing.priority !== 'critical')) {
            existing.priority = fb.priority;
          }
        } else {
          feedbackMap.set(key, { ...fb, occurrenceCount: 1 });
        }
      }
    }

    // 우선순위 정렬
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const aggregatedFeedback = [...feedbackMap.values()]
      .sort((a, b) => {
        const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (pDiff !== 0) return pDiff;
        return (b.occurrenceCount || 1) - (a.occurrenceCount || 1);
      });

    return {
      summary: {
        totalEvents: count,
        avgKeyAccuracy: totalKeyAccuracy / count,
        avgValueAccuracy: totalValueAccuracy / count,
        avgOverallScore: totalOverallScore / count
      },
      eventResults: results,
      aggregatedFeedback,
      parameterIssueStats
    };
  }

  /**
   * 시스템 프롬프트 업데이트 제안 생성
   */
  generatePromptUpdateSuggestions(aggregated: AggregatedValidationResult): string {
    const lines: string[] = [];

    lines.push('# Vision AI 시스템 프롬프트 업데이트 제안\n');
    lines.push(`분석 기준: ${aggregated.summary.totalEvents}개 이벤트\n`);
    lines.push(`- 파라미터 키 정확도: ${aggregated.summary.avgKeyAccuracy.toFixed(1)}%`);
    lines.push(`- 파라미터 값 정확도: ${aggregated.summary.avgValueAccuracy.toFixed(1)}%`);
    lines.push(`- 종합 점수: ${aggregated.summary.avgOverallScore.toFixed(1)}%\n`);

    // 심각한 이슈
    const criticalFeedback = aggregated.aggregatedFeedback.filter(f => f.priority === 'critical');
    if (criticalFeedback.length > 0) {
      lines.push('## 🚨 Critical Issues (즉시 수정 필요)\n');
      for (const fb of criticalFeedback) {
        lines.push(`### ${fb.parameterName || fb.eventName}`);
        lines.push(`- 현재: ${fb.currentBehavior}`);
        lines.push(`- 예상: ${fb.expectedBehavior}`);
        lines.push(`- 수정: ${fb.suggestedFix}`);
        lines.push(`- 발생 횟수: ${fb.occurrenceCount}회\n`);
      }
    }

    // 높은 우선순위 이슈
    const highFeedback = aggregated.aggregatedFeedback.filter(f => f.priority === 'high');
    if (highFeedback.length > 0) {
      lines.push('## ⚠️ High Priority Issues\n');
      for (const fb of highFeedback.slice(0, 10)) {
        lines.push(`- **${fb.parameterName}** (${fb.eventName}): ${fb.suggestedFix} [${fb.occurrenceCount}회]`);
      }
      lines.push('');
    }

    // 파라미터별 이슈 통계
    const sortedParams = [...aggregated.parameterIssueStats.entries()]
      .sort((a, b) => (b[1].missingCount + b[1].mismatchCount) - (a[1].missingCount + a[1].mismatchCount))
      .slice(0, 15);

    if (sortedParams.length > 0) {
      lines.push('## 📊 파라미터별 이슈 통계\n');
      lines.push('| 파라미터 | 누락 | 불일치 | 영향 이벤트 |');
      lines.push('|----------|------|--------|-------------|');
      for (const [param, stats] of sortedParams) {
        const events = stats.affectedEvents.slice(0, 3).join(', ');
        lines.push(`| ${param} | ${stats.missingCount} | ${stats.mismatchCount} | ${events} |`);
      }
      lines.push('');
    }

    // 권장 조치
    lines.push('## 📝 권장 조치\n');

    // Vision 프롬프트 수정 필요한 것들
    const visionUpdates = aggregated.aggregatedFeedback.filter(f => f.target === 'vision_prompt');
    if (visionUpdates.length > 0) {
      lines.push('### Vision AI 프롬프트 수정');
      lines.push('`config/vision-prediction-rules.json` 또는 `visionAnalyzer.ts` 수정 필요:');
      for (const fb of visionUpdates.slice(0, 5)) {
        lines.push(`- ${fb.suggestedFix}`);
      }
      lines.push('');
    }

    // Edge Case 추가 필요한 것들
    const edgeCaseUpdates = aggregated.aggregatedFeedback.filter(f => f.target === 'edge_cases');
    if (edgeCaseUpdates.length > 0) {
      lines.push('### Edge Case 추가');
      lines.push('`config/edge-cases.json` 수정 필요:');
      for (const fb of edgeCaseUpdates.slice(0, 5)) {
        lines.push(`- ${fb.parameterName}: ${fb.suggestedFix}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

/**
 * 기본 ParameterValidator 인스턴스 생성
 */
export function createParameterValidator(
  level: ValidationLevel = ValidationLevel.LEVEL3_PARAM_VALUES
): ParameterValidator {
  return new ParameterValidator(level);
}
