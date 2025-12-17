/**
 * 통합 이벤트 정의 스키마
 *
 * 개발가이드, GTM JSON, 공통변수 appendix를 통합하여
 * Agent가 이해할 수 있는 단일 이벤트 정의를 생성합니다.
 */

import { PageType } from './pageContext';

/**
 * GTM 트리거 정보
 */
export interface GTMTriggerInfo {
  /** 트리거 이름 */
  name: string;
  /** 트리거 타입 (CLICK, CUSTOM_EVENT, PAGE_VIEW 등) */
  type: string;
  /** CSS Selector 조건 (있는 경우) */
  cssSelector?: string;
  /** dataLayer 이벤트명 (CUSTOM_EVENT인 경우) */
  customEventName?: string;
  /** 트리거 필터 조건 */
  filters: {
    variable: string;
    operator: string;
    value: string;
  }[];
}

/**
 * 필수 변수 정보
 */
export interface RequiredVariable {
  /** 변수명 */
  name: string;
  /** 변수 설명 */
  description: string;
  /** 데이터 타입 */
  dataType: 'string' | 'number' | 'array' | 'object' | 'boolean';
  /** 필수 여부 */
  required: boolean;
  /** 예시 값 */
  example?: string;
  /** GA4 파라미터 매핑 */
  ga4Parameter?: string;
}

/**
 * 페이지 타입 제한 정보
 */
export interface PageTypeRestriction {
  /** 허용된 페이지 타입 */
  allowedPageTypes: PageType[];
  /** 허용된 URL 패턴 */
  allowedUrlPatterns?: string[];
  /** 제한 이유/설명 */
  reason: string;
  /** 소스 (개발가이드, GTM, Edge Case) */
  source: 'dev_guide' | 'gtm' | 'ga4_standard' | 'edge_case';
}

/**
 * UI 요구사항
 */
export interface UIRequirement {
  /** 필요한 UI 요소 설명 */
  description: string;
  /** Vision AI 확인 질문 */
  visionQuestion: string;
  /** CSS Selector 힌트 */
  selectorHints?: string[];
  /** UI 요소 예시 */
  examples?: string[];
}

/**
 * 이벤트 발생 조건
 */
export interface FiringCondition {
  /** 조건 설명 (개발가이드 원문) */
  description: string;
  /** 사용자 액션 필요 여부 */
  requiresUserAction: boolean;
  /** 사용자 액션 타입 */
  userActionType?: 'click' | 'scroll' | 'submit' | 'input' | 'view' | 'load';
  /** 자동 발생 여부 (페이지 로드 시) */
  autoFire: boolean;
  /** 선행 조건 (다른 이벤트나 상태) */
  prerequisites?: string[];
}

/**
 * 통합 이벤트 정의
 */
export interface UnifiedEventDefinition {
  /** 이벤트명 */
  eventName: string;
  /** 이벤트 설명 (한글) */
  description: string;
  /** 이벤트 카테고리 */
  category: 'ecommerce' | 'engagement' | 'video' | 'custom' | 'auto';

  /** 개발 필수 여부 */
  required: boolean;

  /** 발생 조건 */
  firingCondition: FiringCondition;

  /** 페이지 타입 제한 */
  pageTypeRestriction: PageTypeRestriction;

  /** UI 요구사항 */
  uiRequirement: UIRequirement;

  /** GTM 트리거 정보 */
  gtmTriggers: GTMTriggerInfo[];

  /** 필수 변수 목록 */
  requiredVariables: RequiredVariable[];

  /** Edge Case 정보 (사이트별 특이 사항) */
  edgeCases?: {
    site: string;
    description: string;
    modification: string;
  }[];

  /** 메타 정보 */
  meta: {
    /** 정의 소스 */
    sources: ('dev_guide' | 'gtm' | 'ga4_standard' | 'manual')[];
    /** 마지막 업데이트 */
    lastUpdated?: string;
    /** 신뢰도 점수 (0-100) */
    confidence: number;
  };
}

/**
 * 이벤트 정의 생성 결과
 */
export interface EventDefinitionBuildResult {
  /** 생성된 이벤트 정의 목록 */
  events: UnifiedEventDefinition[];
  /** 성공 여부 */
  success: boolean;
  /** 경고 메시지 */
  warnings: string[];
  /** 에러 메시지 */
  errors: string[];
  /** 소스 정보 */
  sources: {
    devGuidePath?: string;
    gtmJsonPath?: string;
    appendixPath?: string;
  };
}

/**
 * 시스템 프롬프트 생성 옵션
 */
export interface SystemPromptOptions {
  /** 포함할 이벤트 목록 (없으면 전체) */
  eventNames?: string[];
  /** 현재 페이지 타입 */
  pageType?: PageType;
  /** 상세 수준 */
  detailLevel: 'minimal' | 'standard' | 'detailed';
  /** GTM 트리거 정보 포함 여부 */
  includeGTMTriggers: boolean;
  /** 변수 정보 포함 여부 */
  includeVariables: boolean;
  /** Edge Case 포함 여부 */
  includeEdgeCases: boolean;
}

/**
 * Agent간 데이터 교환을 위한 이벤트 예측 결과
 */
export interface EventPredictionResult {
  /** 이벤트명 */
  eventName: string;
  /** 발생 가능 여부 */
  canFire: boolean;
  /** 예측 신뢰도 (0-100) */
  confidence: number;
  /** 판단 이유 */
  reason: string;
  /** 필요한 사용자 액션 (canFire가 true인 경우) */
  requiredAction?: string;
  /** 관련 UI 요소 위치 설명 */
  uiLocation?: string;
  /** 검증 방법 제안 */
  verificationSuggestion?: string;
}

/**
 * 페이지 분석 결과 (Agent간 교환용)
 */
export interface PageAnalysisResult {
  /** 분석한 URL */
  url: string;
  /** 감지된 페이지 타입 */
  pageType: PageType;
  /** 페이지 타입 감지 신뢰도 */
  pageTypeConfidence: number;
  /** 발생 가능한 이벤트 예측 */
  predictions: EventPredictionResult[];
  /** 페이지 컨텍스트 정보 */
  context: {
    /** 감지된 주요 UI 요소 */
    detectedUIElements: string[];
    /** dataLayer 상태 */
    dataLayerState?: Record<string, any>;
    /** AP_DATA_PAGETYPE 값 */
    apDataPageType?: string;
  };
  /** 분석 메타데이터 */
  meta: {
    analysisTimestamp: string;
    screenshotPath?: string;
    analyzerVersion: string;
  };
}
