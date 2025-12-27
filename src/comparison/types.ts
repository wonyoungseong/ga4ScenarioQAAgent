/**
 * Comparison Engine Types
 *
 * 예측 vs 실제 vs 스펙 비교 관련 타입 정의
 */

import {
  ContentGroup,
  SpecParameter,
  PredictedParameter,
  GA4Parameter,
  ParameterComparison,
  EventComparison,
  BranchComparisonResult,
  ComparisonVerdict,
  ComparisonIssue
} from '../branch/types';

// Re-export from branch types
export {
  ParameterComparison,
  EventComparison,
  BranchComparisonResult,
  ComparisonVerdict,
  ComparisonIssue
};

/**
 * 비교 입력 데이터
 */
export interface ComparisonInput {
  eventName: string;
  contentGroup: ContentGroup;
  pageUrl: string;

  predicted: PredictedParameter[];
  actual: GA4Parameter[];
  spec: SpecParameter[];
}

/**
 * 비교 옵션
 */
export interface ComparisonOptions {
  /** 문자열 정규화 여부 */
  normalizeStrings: boolean;

  /** 대소문자 무시 */
  caseInsensitive: boolean;

  /** 부분 일치 허용 */
  allowPartialMatch: boolean;

  /** 노이즈 임계값 (비중) */
  noiseThreshold: number;

  /** 필수 파라미터만 비교 */
  requiredOnly: boolean;
}

/**
 * 기본 비교 옵션
 */
export const DEFAULT_COMPARISON_OPTIONS: ComparisonOptions = {
  normalizeStrings: true,
  caseInsensitive: false,
  allowPartialMatch: true,
  noiseThreshold: 0.0001, // 0.01%
  requiredOnly: false
};

/**
 * 정규화 규칙
 */
export interface NormalizationRule {
  /** 규칙 이름 */
  name: string;

  /** 적용 대상 파라미터 패턴 */
  parameterPattern: RegExp;

  /** 정규화 함수 */
  normalize: (value: string | number | null) => string | null;
}

/**
 * 값 매칭 결과
 */
export interface MatchResult {
  matched: boolean;
  matchType: 'exact' | 'normalized' | 'partial' | 'mismatch' | 'both_null' | 'one_null';
  normalizedPredicted: string | null;
  normalizedActual: string | null;
  similarity?: number;
}

/**
 * 이슈 심각도 점수
 */
export const SEVERITY_SCORES: Record<ComparisonIssue['severity'], number> = {
  critical: 3,
  warning: 2,
  info: 1
};

/**
 * Verdict별 가중치
 */
export const VERDICT_WEIGHTS: Record<ComparisonVerdict, number> = {
  MATCH: 1.0,
  PREDICTED_CORRECT: 0.9,
  ACTUAL_MISSING: 0.3,
  PREDICTION_WRONG: 0.2,
  SPEC_VIOLATION: 0.1,
  NOT_IMPLEMENTED: 0.4,
  NOISE: 0.5,
  EXTRA_COLLECTED: 0.6,
  UNKNOWN: 0.0
};

/**
 * 이벤트 발생 예측 결과
 */
export type EventPredictionVerdict =
  | 'CORRECT'           // 예측 정확 (AUTO_FIRE 예측 + 발생, FORBIDDEN 예측 + 미발생)
  | 'FALSE_POSITIVE'    // 오탐 (AUTO_FIRE 예측 + 미발생)
  | 'FALSE_NEGATIVE'    // 미탐 (예측 없음 + 발생)
  | 'FORBIDDEN_VIOLATED' // 금지 위반 (FORBIDDEN 예측 + 발생)
  | 'CONDITIONAL'       // 조건부 (CONDITIONAL 예측)
  | 'NOT_PREDICTED';    // 예측 없음

/**
 * 이벤트 발생 예측 비교 결과
 */
export interface EventPredictionResult {
  eventName: string;
  prediction: 'AUTO_FIRE' | 'CONDITIONAL' | 'FORBIDDEN' | null;
  actualOccurred: boolean;
  actualCount: number;
  verdict: EventPredictionVerdict;
}

/**
 * 비교 통계
 */
export interface ComparisonStats {
  totalParameters: number;
  matchedParameters: number;
  mismatchedParameters: number;
  missingPredictions: number;
  missingActual: number;
  noiseCount: number;
  extraCollected: number;

  predictionAccuracy: number;
  specCompliance: number;
  coverageRate: number;

  /** 이벤트 발생 예측 정확도 (새로 추가) */
  eventPredictionAccuracy: number;
  /** 이벤트 발생 예측 상세 */
  eventPredictionStats?: {
    total: number;
    correct: number;
    falsePositive: number;
    falseNegative: number;
    forbiddenViolated: number;
  };

  byVerdict: Record<ComparisonVerdict, number>;
}

/**
 * 개선 제안
 */
export interface ImprovementSuggestion {
  type: 'RULE_UPDATE' | 'VISION_HINT' | 'PATTERN_ADD' | 'DEFAULT_VALUE' | 'SPEC_FIX';
  priority: 'high' | 'medium' | 'low';
  parameterName: string;
  eventName: string;
  currentValue?: string;
  suggestedValue?: string;
  reason: string;
  affectedCount: number;
}

/**
 * 비교 리포트
 */
export interface ComparisonReport {
  generatedAt: Date;
  contentGroup: ContentGroup;

  events: EventComparison[];

  stats: ComparisonStats;

  issues: ComparisonIssue[];

  suggestions: ImprovementSuggestion[];
}
