/**
 * Comparison Engine
 *
 * 예측값, 실제값, 스펙을 비교하고 분석합니다.
 */

import {
  ComparisonInput,
  ComparisonOptions,
  DEFAULT_COMPARISON_OPTIONS,
  MatchResult,
  ComparisonStats,
  ComparisonReport,
  ImprovementSuggestion,
  VERDICT_WEIGHTS,
  EventPredictionVerdict,
  EventPredictionResult
} from './types';
import {
  ParameterComparison,
  EventComparison,
  BranchComparisonResult,
  ComparisonVerdict,
  ComparisonIssue,
  PredictedParameter,
  GA4Parameter,
  SpecParameter,
  ContentGroup,
  BranchEventData
} from '../branch/types';

/**
 * Comparison Engine 클래스
 */
export class ComparisonEngine {
  private options: ComparisonOptions;

  constructor(options?: Partial<ComparisonOptions>) {
    this.options = { ...DEFAULT_COMPARISON_OPTIONS, ...options };
  }

  /**
   * 단일 파라미터 비교
   */
  compareParameter(
    parameterName: string,
    predicted: PredictedParameter | null,
    actual: GA4Parameter | null,
    spec: SpecParameter | null
  ): ParameterComparison {
    const predictedValue = predicted?.value ?? null;
    const actualValue = actual?.value ?? null;

    // 값 매칭
    const matchResult = this.matchValues(predictedValue, actualValue, parameterName);

    // Verdict 결정
    const verdict = this.determineVerdict(
      predicted,
      actual,
      spec,
      matchResult
    );

    // 신뢰도 결정
    const confidence = this.determineConfidence(verdict, matchResult, predicted);

    return {
      parameterName,
      predicted: predictedValue,
      actual: actualValue,
      spec,
      planned: null,
      verdict,
      confidence,
      details: {
        normalizedPredicted: matchResult.normalizedPredicted || undefined,
        normalizedActual: matchResult.normalizedActual || undefined,
        matchType: matchResult.matchType,
        discrepancyReason: this.getDiscrepancyReason(verdict, matchResult)
      }
    };
  }

  /**
   * 값 매칭
   */
  private matchValues(
    predicted: string | number | null,
    actual: string | number | null,
    parameterName: string
  ): MatchResult {
    // 둘 다 null
    if (predicted === null && actual === null) {
      return {
        matched: true,
        matchType: 'both_null',
        normalizedPredicted: null,
        normalizedActual: null
      };
    }

    // 하나만 null
    if (predicted === null || actual === null) {
      return {
        matched: false,
        matchType: 'one_null',
        normalizedPredicted: predicted !== null ? this.normalizeValue(predicted, parameterName) : null,
        normalizedActual: actual !== null ? this.normalizeValue(actual, parameterName) : null
      };
    }

    const normalizedPredicted = this.normalizeValue(predicted, parameterName);
    const normalizedActual = this.normalizeValue(actual, parameterName);

    // 정확한 매칭
    if (normalizedPredicted === normalizedActual) {
      return {
        matched: true,
        matchType: predicted.toString() === actual.toString() ? 'exact' : 'normalized',
        normalizedPredicted,
        normalizedActual
      };
    }

    // 부분 매칭
    if (this.options.allowPartialMatch) {
      const similarity = this.calculateSimilarity(normalizedPredicted, normalizedActual);
      if (similarity > 0.8) {
        return {
          matched: true,
          matchType: 'partial',
          normalizedPredicted,
          normalizedActual,
          similarity
        };
      }
    }

    return {
      matched: false,
      matchType: 'mismatch',
      normalizedPredicted,
      normalizedActual,
      similarity: this.calculateSimilarity(normalizedPredicted, normalizedActual)
    };
  }

  /**
   * 값 정규화
   */
  private normalizeValue(value: string | number | null, parameterName: string): string | null {
    if (value === null) return null;

    let str = String(value);

    if (this.options.normalizeStrings) {
      // 공백 정규화
      str = str.trim().replace(/\s+/g, ' ');

      // 특수문자 정규화
      str = str.replace(/[\u200B-\u200D\uFEFF]/g, '');
    }

    if (this.options.caseInsensitive) {
      str = str.toLowerCase();
    }

    // 가격 파라미터 정규화
    if (parameterName.includes('price') || parameterName.includes('discount')) {
      str = str.replace(/[,₩원\s]/g, '');
    }

    return str;
  }

  /**
   * 문자열 유사도 계산 (Levenshtein distance 기반)
   */
  private calculateSimilarity(a: string | null, b: string | null): number {
    if (a === null || b === null) return 0;
    if (a === b) return 1;

    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;

    if (longer.length === 0) return 1;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Levenshtein distance
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Verdict 결정
   */
  private determineVerdict(
    predicted: PredictedParameter | null,
    actual: GA4Parameter | null,
    spec: SpecParameter | null,
    matchResult: MatchResult
  ): ComparisonVerdict {
    // 예측도 없고 실제도 없음
    if (!predicted && !actual) {
      if (spec?.required) {
        return 'NOT_IMPLEMENTED';
      }
      return 'MATCH';
    }

    // 예측만 있음 (실제 수집 안됨)
    if (predicted && !actual) {
      return 'ACTUAL_MISSING';
    }

    // 실제만 있음 (예측 안함)
    if (!predicted && actual) {
      // 노이즈 확인
      if (actual.eventCount < 10) {
        return 'NOISE';
      }
      if (!spec) {
        return 'EXTRA_COLLECTED';
      }
      return 'PREDICTED_CORRECT'; // 예측 누락이지만 정상 수집
    }

    // 둘 다 있음
    if (matchResult.matched) {
      if (spec && this.checkSpecCompliance(actual!, spec)) {
        return 'MATCH';
      }
      return 'PREDICTED_CORRECT';
    }

    // 값 불일치
    if (spec && !this.checkSpecCompliance(actual!, spec)) {
      return 'SPEC_VIOLATION';
    }

    return 'PREDICTION_WRONG';
  }

  /**
   * 스펙 준수 확인
   */
  private checkSpecCompliance(actual: GA4Parameter, spec: SpecParameter): boolean {
    // 허용된 값 목록이 있는 경우
    if (spec.values && spec.values.length > 0) {
      const actualStr = String(actual.value);
      return spec.values.includes(actualStr);
    }

    // 필수 파라미터인데 값이 없는 경우
    if (spec.required && (actual.value === null || actual.value === '')) {
      return false;
    }

    return true;
  }

  /**
   * 신뢰도 결정
   */
  private determineConfidence(
    verdict: ComparisonVerdict,
    matchResult: MatchResult,
    predicted: PredictedParameter | null
  ): 'high' | 'medium' | 'low' {
    if (verdict === 'MATCH') return 'high';

    if (predicted?.confidence) {
      return predicted.confidence;
    }

    if (matchResult.matchType === 'partial') return 'medium';
    if (matchResult.matchType === 'normalized') return 'high';

    return 'low';
  }

  /**
   * 불일치 사유 반환
   */
  private getDiscrepancyReason(
    verdict: ComparisonVerdict,
    matchResult: MatchResult
  ): string | undefined {
    switch (verdict) {
      case 'ACTUAL_MISSING':
        return 'Predicted value was not collected in GA4';
      case 'PREDICTION_WRONG':
        return `Predicted "${matchResult.normalizedPredicted}" but actual was "${matchResult.normalizedActual}"`;
      case 'SPEC_VIOLATION':
        return 'Actual value does not comply with specification';
      case 'NOT_IMPLEMENTED':
        return 'Required parameter not implemented';
      case 'NOISE':
        return 'Low event count suggests noise data';
      case 'EXTRA_COLLECTED':
        return 'Parameter collected but not in specification';
      default:
        return undefined;
    }
  }

  /**
   * 이벤트 레벨 비교
   */
  compareEvent(input: ComparisonInput): EventComparison {
    const parameterComparisons: ParameterComparison[] = [];
    const issues: ComparisonIssue[] = [];

    // 이벤트 발생 예측 계산 (먼저 수행)
    const eventPrediction = this.calculateEventPrediction(
      input.predicted,
      input.actual,
      input.eventName
    );

    // 모든 파라미터 이름 수집 (메타 파라미터 제외)
    const allParamNames = new Set<string>();
    input.predicted.forEach(p => {
      if (!p.name.startsWith('_')) allParamNames.add(p.name);
    });
    input.actual.forEach(p => {
      if (!p.name.startsWith('_')) allParamNames.add(p.name);
    });
    input.spec.forEach(p => allParamNames.add(p.ga4Key));

    // 필수만 비교 옵션
    const specsToCompare = this.options.requiredOnly
      ? input.spec.filter(s => s.required)
      : input.spec;

    // 각 파라미터 비교
    for (const paramName of allParamNames) {
      const predicted = input.predicted.find(p => p.name === paramName) || null;
      const actual = input.actual.find(p => p.name === paramName) || null;
      const spec = input.spec.find(s => s.ga4Key === paramName) || null;

      const comparison = this.compareParameter(paramName, predicted, actual, spec);
      parameterComparisons.push(comparison);

      // 이슈 감지
      const issue = this.detectIssue(comparison, input.eventName);
      if (issue) {
        issues.push(issue);
      }
    }

    // 통계 계산 (이벤트 예측 포함)
    const stats = this.calculateStats(parameterComparisons, eventPrediction);

    return {
      eventName: input.eventName,
      contentGroup: input.contentGroup,
      url: input.pageUrl,
      parameters: parameterComparisons,
      summary: {
        totalParams: stats.totalParameters,
        matchedParams: stats.matchedParameters,
        predictionAccuracy: stats.eventPredictionAccuracy, // 이벤트 발생 예측 정확도 사용
        specCompliance: stats.specCompliance,
        coverageRate: stats.coverageRate
      },
      issues,
      // 이벤트 예측 상세 정보 추가
      eventPrediction: {
        prediction: eventPrediction.prediction,
        actualOccurred: eventPrediction.actualOccurred,
        actualCount: eventPrediction.actualCount,
        verdict: eventPrediction.verdict
      }
    };
  }

  /**
   * 이슈 감지
   */
  private detectIssue(
    comparison: ParameterComparison,
    eventName: string
  ): ComparisonIssue | null {
    switch (comparison.verdict) {
      case 'NOT_IMPLEMENTED':
        if (comparison.spec?.required) {
          return {
            severity: 'critical',
            type: 'missing_required',
            parameter: comparison.parameterName,
            eventName,
            message: `Required parameter "${comparison.parameterName}" is not implemented`,
            suggestion: `Implement "${comparison.parameterName}" in GTM or dataLayer`
          };
        }
        break;

      case 'SPEC_VIOLATION':
        return {
          severity: 'warning',
          type: 'spec_violation',
          parameter: comparison.parameterName,
          eventName,
          message: `Parameter "${comparison.parameterName}" violates specification`,
          suggestion: comparison.details.discrepancyReason
        };

      case 'PREDICTION_WRONG':
        return {
          severity: 'warning',
          type: 'wrong_value',
          parameter: comparison.parameterName,
          eventName,
          message: `Prediction mismatch for "${comparison.parameterName}"`,
          suggestion: 'Update prediction rules or vision hints'
        };

      case 'NOISE':
        return {
          severity: 'info',
          type: 'noise_collected',
          parameter: comparison.parameterName,
          eventName,
          message: `Noise detected for "${comparison.parameterName}"`,
          suggestion: 'Review trigger conditions'
        };
    }

    return null;
  }

  /**
   * 이벤트 발생 예측 정확도 계산
   *
   * Vision AI의 이벤트 발생 예측과 GA4 실제 발생 데이터를 비교합니다.
   * - AUTO_FIRE 예측 + 발생 → CORRECT
   * - AUTO_FIRE 예측 + 미발생 → FALSE_POSITIVE
   * - FORBIDDEN 예측 + 미발생 → CORRECT
   * - FORBIDDEN 예측 + 발생 → FORBIDDEN_VIOLATED
   * - 예측 없음 + 발생 → FALSE_NEGATIVE (조건부 이벤트일 수 있음)
   */
  calculateEventPrediction(
    predicted: PredictedParameter[],
    actual: GA4Parameter[],
    eventName: string
  ): EventPredictionResult {
    // _event_prediction 파라미터에서 예측 유형 추출
    const predictionParam = predicted.find(p => p.name === '_event_prediction');
    const prediction = predictionParam?.value as 'AUTO_FIRE' | 'CONDITIONAL' | 'FORBIDDEN' | null;

    // _event_occurred 파라미터에서 실제 발생 여부 추출
    const occurredParam = actual.find(p => p.name === '_event_occurred');
    const actualOccurred = occurredParam !== undefined;
    const actualCount = occurredParam?.eventCount || 0;

    // Verdict 결정
    let verdict: EventPredictionVerdict;

    if (prediction === 'AUTO_FIRE') {
      verdict = actualOccurred ? 'CORRECT' : 'FALSE_POSITIVE';
    } else if (prediction === 'FORBIDDEN') {
      verdict = actualOccurred ? 'FORBIDDEN_VIOLATED' : 'CORRECT';
    } else if (prediction === 'CONDITIONAL') {
      verdict = 'CONDITIONAL'; // 조건부는 정확/부정확 판단 안함
    } else {
      // 예측 없음
      verdict = actualOccurred ? 'FALSE_NEGATIVE' : 'NOT_PREDICTED';
    }

    return {
      eventName,
      prediction,
      actualOccurred,
      actualCount,
      verdict
    };
  }

  /**
   * 통계 계산
   */
  private calculateStats(
    comparisons: ParameterComparison[],
    eventPrediction?: EventPredictionResult
  ): ComparisonStats {
    const byVerdict: Record<ComparisonVerdict, number> = {
      MATCH: 0,
      PREDICTED_CORRECT: 0,
      ACTUAL_MISSING: 0,
      PREDICTION_WRONG: 0,
      SPEC_VIOLATION: 0,
      NOT_IMPLEMENTED: 0,
      NOISE: 0,
      EXTRA_COLLECTED: 0,
      UNKNOWN: 0
    };

    let matched = 0;
    let mismatched = 0;
    let missingPredictions = 0;
    let missingActual = 0;
    let noise = 0;
    let extra = 0;

    for (const c of comparisons) {
      byVerdict[c.verdict]++;

      if (c.verdict === 'MATCH' || c.verdict === 'PREDICTED_CORRECT') {
        matched++;
      } else if (c.verdict === 'PREDICTION_WRONG' || c.verdict === 'SPEC_VIOLATION') {
        mismatched++;
      }

      if (c.verdict === 'ACTUAL_MISSING') missingActual++;
      if (c.predicted === null && c.actual !== null) missingPredictions++;
      if (c.verdict === 'NOISE') noise++;
      if (c.verdict === 'EXTRA_COLLECTED') extra++;
    }

    const total = comparisons.length;

    // 이벤트 발생 예측 정확도 계산
    let eventPredictionAccuracy = 0;
    if (eventPrediction) {
      if (eventPrediction.verdict === 'CORRECT') {
        eventPredictionAccuracy = 100;
      } else if (eventPrediction.verdict === 'CONDITIONAL') {
        // 조건부는 발생 여부에 따라 부분 점수
        eventPredictionAccuracy = eventPrediction.actualOccurred ? 80 : 50;
      } else if (eventPrediction.verdict === 'FALSE_NEGATIVE') {
        // 예측 안했지만 발생 - 조건부 이벤트일 수 있음
        eventPredictionAccuracy = 30;
      } else {
        eventPredictionAccuracy = 0;
      }
    }

    return {
      totalParameters: total,
      matchedParameters: matched,
      mismatchedParameters: mismatched,
      missingPredictions,
      missingActual,
      noiseCount: noise,
      extraCollected: extra,
      predictionAccuracy: total > 0 ? (matched / total) * 100 : 0,
      specCompliance: total > 0 ? ((total - mismatched) / total) * 100 : 0,
      coverageRate: total > 0 ? ((total - missingActual) / total) * 100 : 0,
      eventPredictionAccuracy,
      eventPredictionStats: eventPrediction ? {
        total: 1,
        correct: eventPrediction.verdict === 'CORRECT' ? 1 : 0,
        falsePositive: eventPrediction.verdict === 'FALSE_POSITIVE' ? 1 : 0,
        falseNegative: eventPrediction.verdict === 'FALSE_NEGATIVE' ? 1 : 0,
        forbiddenViolated: eventPrediction.verdict === 'FORBIDDEN_VIOLATED' ? 1 : 0
      } : undefined,
      byVerdict
    };
  }

  /**
   * Branch 레벨 비교
   */
  compareBranch(
    branchId: string,
    contentGroup: ContentGroup,
    eventDataList: BranchEventData[]
  ): BranchComparisonResult {
    const eventComparisons: EventComparison[] = [];

    for (const eventData of eventDataList) {
      const input: ComparisonInput = {
        eventName: eventData.eventName,
        contentGroup: eventData.contentGroup,
        pageUrl: eventData.pageUrl,
        predicted: eventData.predictedParams,
        actual: eventData.actualParams,
        spec: eventData.specParams
      };

      eventComparisons.push(this.compareEvent(input));
    }

    // 전체 통계
    let totalAccuracy = 0;
    let totalCompliance = 0;
    let criticalCount = 0;
    let warningCount = 0;

    for (const ec of eventComparisons) {
      totalAccuracy += ec.summary.predictionAccuracy;
      totalCompliance += ec.summary.specCompliance;
      criticalCount += ec.issues.filter(i => i.severity === 'critical').length;
      warningCount += ec.issues.filter(i => i.severity === 'warning').length;
    }

    const eventCount = eventComparisons.length;

    return {
      branchId,
      contentGroup,
      events: eventComparisons,
      overall: {
        totalEvents: eventCount,
        avgPredictionAccuracy: eventCount > 0 ? totalAccuracy / eventCount : 0,
        avgSpecCompliance: eventCount > 0 ? totalCompliance / eventCount : 0,
        criticalIssues: criticalCount,
        warnings: warningCount
      }
    };
  }

  /**
   * 개선 제안 생성
   */
  generateSuggestions(comparison: BranchComparisonResult): ImprovementSuggestion[] {
    const suggestions: ImprovementSuggestion[] = [];
    const parameterIssueCount: Map<string, number> = new Map();

    // 파라미터별 이슈 집계
    for (const event of comparison.events) {
      for (const issue of event.issues) {
        const key = `${issue.parameter}:${issue.type}`;
        parameterIssueCount.set(key, (parameterIssueCount.get(key) || 0) + 1);
      }
    }

    // 빈번한 이슈에 대해 제안 생성
    for (const [key, count] of parameterIssueCount) {
      const [parameterName, issueType] = key.split(':');

      if (count >= 2) {
        suggestions.push({
          type: this.getSuggestionType(issueType),
          priority: count >= 5 ? 'high' : count >= 3 ? 'medium' : 'low',
          parameterName,
          eventName: comparison.events[0]?.eventName || '',
          reason: `Issue occurred ${count} times across events`,
          affectedCount: count
        });
      }
    }

    return suggestions.sort((a, b) =>
      a.priority === 'high' ? -1 : b.priority === 'high' ? 1 : 0
    );
  }

  /**
   * 제안 타입 결정
   */
  private getSuggestionType(issueType: string): ImprovementSuggestion['type'] {
    switch (issueType) {
      case 'missing_required':
        return 'SPEC_FIX';
      case 'wrong_value':
        return 'RULE_UPDATE';
      case 'noise_collected':
        return 'PATTERN_ADD';
      default:
        return 'VISION_HINT';
    }
  }
}
