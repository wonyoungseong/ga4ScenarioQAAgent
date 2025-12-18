/**
 * 파라미터 값 예측 시스템 타입 정의
 *
 * Vision AI가 스크린샷에서 추출한 파라미터 값을 예측하고
 * dataLayer 실제 값과 비교하여 정확도를 측정합니다.
 */

// ═══════════════════════════════════════════════════════════════════════════
// 신뢰도 레벨
// ═══════════════════════════════════════════════════════════════════════════

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type ValueSource =
  | 'OCR'              // 스크린샷에서 직접 추출
  | 'INFERENCE'        // 컨텍스트로 추론
  | 'DOM_STRUCTURE'    // DOM 구조에서 추출
  | 'URL_PARAMETER'    // URL 파라미터에서 추출
  | 'META_TAG';        // 메타 태그에서 추출

// ═══════════════════════════════════════════════════════════════════════════
// Vision AI 파라미터 값 예측
// ═══════════════════════════════════════════════════════════════════════════

export interface PredictedParameterValue {
  /** 예측된 값 */
  value: string | number | boolean | null;

  /** 신뢰도 */
  confidence: ConfidenceLevel;

  /** 값의 출처 */
  source: ValueSource;

  /** 추출 위치 설명 (예: "상품명 영역", "가격 표시 영역") */
  sourceLocation?: string;
}

export interface PredictedItemParameter {
  /** 상품명 */
  item_name?: PredictedParameterValue;

  /** 상품 ID */
  item_id?: PredictedParameterValue;

  /** 상품 브랜드 */
  item_brand?: PredictedParameterValue;

  /** 상품 카테고리 */
  item_category?: PredictedParameterValue;

  /** 상품 가격 */
  price?: PredictedParameterValue;

  /** 수량 */
  quantity?: PredictedParameterValue;

  /** 배리언트 */
  item_variant?: PredictedParameterValue;

  /** 쿠폰 */
  coupon?: PredictedParameterValue;

  /** 할인금액 */
  discount?: PredictedParameterValue;

  /** 인덱스 (목록에서의 위치) */
  index?: PredictedParameterValue;

  /** 목록 ID */
  item_list_id?: PredictedParameterValue;

  /** 목록 이름 */
  item_list_name?: PredictedParameterValue;

  /** 기타 커스텀 파라미터 */
  [key: string]: PredictedParameterValue | undefined;
}

export interface ParameterValuePrediction {
  /** 이벤트 이름 */
  eventName: string;

  /** 예측 타임스탬프 */
  timestamp: string;

  /** Event-level 파라미터 */
  eventParams: {
    /** 통화 */
    currency?: PredictedParameterValue;

    /** 총 금액 */
    value?: PredictedParameterValue;

    /** 프로모션 ID */
    promotion_id?: PredictedParameterValue;

    /** 프로모션 이름 */
    promotion_name?: PredictedParameterValue;

    /** 검색어 */
    search_term?: PredictedParameterValue;

    /** 기타 파라미터 */
    [key: string]: PredictedParameterValue | undefined;
  };

  /** Item-level 파라미터 (ecommerce) */
  items?: PredictedItemParameter[];
}

// ═══════════════════════════════════════════════════════════════════════════
// dataLayer 캡처 이벤트
// ═══════════════════════════════════════════════════════════════════════════

export interface DataLayerEvent {
  /** 캡처 타임스탬프 */
  timestamp: number;

  /** 이벤트 이름 */
  event?: string;

  /** 전체 데이터 */
  data: Record<string, unknown>;

  /** ecommerce 객체 (있는 경우) */
  ecommerce?: {
    items?: DataLayerItem[];
    currency?: string;
    value?: number;
    promotion_id?: string;
    promotion_name?: string;
    [key: string]: unknown;
  };
}

export interface DataLayerItem {
  item_name?: string;
  item_id?: string;
  item_brand?: string;
  item_category?: string;
  price?: number;
  quantity?: number;
  item_variant?: string;
  coupon?: string;
  discount?: number;
  index?: number;
  item_list_id?: string;
  item_list_name?: string;
  [key: string]: unknown;
}

// ═══════════════════════════════════════════════════════════════════════════
// 검증 결과
// ═══════════════════════════════════════════════════════════════════════════

export type MatchType =
  | 'EXACT'           // 정확히 일치
  | 'NORMALIZED'      // 정규화 후 일치
  | 'PARTIAL'         // 부분 일치
  | 'MISMATCH'        // 불일치
  | 'FUNNEL_TRACKED'; // 퍼널 일관성 추적 대상 (정확도 계산 제외, 퍼널 간 일관성이 핵심)

export interface ParameterValidationResult {
  /** 파라미터 이름 */
  parameterName: string;

  /** 예측값 */
  predicted: string | number | boolean | null;

  /** 실제값 (dataLayer) */
  actual: string | number | boolean | null;

  /** 일치 여부 */
  match: boolean;

  /** 일치 유형 */
  matchType: MatchType;

  /** 적용된 정규화 규칙 */
  normalizationApplied?: string;

  /** 신뢰도 (예측 시) */
  confidence?: ConfidenceLevel;
}

export interface ItemValidationResult {
  /** 아이템 인덱스 */
  itemIndex: number;

  /** 파라미터별 검증 결과 */
  parameters: ParameterValidationResult[];

  /** 아이템 전체 일치율 */
  matchRate: number;
}

export interface ValidationReport {
  /** 이벤트 이름 */
  eventName: string;

  /** 페이지 URL */
  url: string;

  /** 검증 타임스탬프 */
  timestamp: string;

  /** Event-level 파라미터 검증 결과 */
  eventParamsValidation: ParameterValidationResult[];

  /** Item-level 파라미터 검증 결과 */
  itemsValidation: ItemValidationResult[];

  /** 전체 정확도 */
  accuracy: {
    /** 전체 파라미터 수 */
    totalParams: number;

    /** 일치한 파라미터 수 */
    matchedParams: number;

    /** 정확도 (%) */
    accuracyPercent: number;

    /** 불일치 항목 */
    mismatches: {
      param: string;
      predicted: unknown;
      actual: unknown;
      reason?: string;
    }[];
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 시나리오 가이드 출력
// ═══════════════════════════════════════════════════════════════════════════

export interface ParameterScenarioGuide {
  /** 이벤트 이름 */
  eventName: string;

  /** 페이지 정보 */
  page: {
    type: string;
    url: string;
    contentGroup?: string;
  };

  /** 예상 파라미터 값 */
  expectedParameters: {
    /** Event-level 파라미터 테이블 */
    eventParams: {
      parameter: string;
      expectedValue: string | number;
      confidence: ConfidenceLevel;
    }[];

    /** Item-level 파라미터 테이블 */
    itemParams: {
      parameter: string;
      expectedValue: string | number;
      confidence: ConfidenceLevel;
      sourceLocation: string;
    }[];
  };

  /** 검증 결과 (실행 후) */
  validationResult?: {
    parameter: string;
    predicted: string | number;
    actual: string | number;
    match: boolean;
    note?: string;
  }[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Funnel 일관성 검증 (핵심 포인트: 이벤트 간 동일 제품명 유지 여부)
// ═══════════════════════════════════════════════════════════════════════════

/** Ecommerce 퍼널 이벤트 순서 */
export const ECOMMERCE_FUNNEL_ORDER = [
  'view_item',
  'select_item',
  'add_to_cart',
  'view_cart',
  'begin_checkout',
  'add_shipping_info',
  'add_payment_info',
  'purchase',
  'refund'
] as const;

export type EcommerceFunnelEvent = typeof ECOMMERCE_FUNNEL_ORDER[number];

/** 퍼널에서 추적할 아이템 */
export interface FunnelTrackedItem {
  /** 상품 식별자 (item_id 또는 item_name 기반) */
  identifier: string;

  /** 원본 item_id */
  item_id?: string;

  /** 이벤트별 item_name 기록 */
  namesByEvent: {
    event: string;
    item_name: string;
    timestamp: number;
  }[];

  /** 이벤트별 가격 기록 */
  pricesByEvent: {
    event: string;
    price: number;
    timestamp: number;
  }[];
}

/** 퍼널 일관성 검증 결과 */
export interface FunnelConsistencyResult {
  /** 검증 대상 아이템 */
  item: FunnelTrackedItem;

  /** item_name 일관성 */
  nameConsistency: {
    /** 일관성 여부 */
    isConsistent: boolean;

    /** 고유한 이름 목록 */
    uniqueNames: string[];

    /** 변경 이력 (일관성 없을 경우) */
    changes?: {
      fromEvent: string;
      toEvent: string;
      fromName: string;
      toName: string;
    }[];
  };

  /** 가격 일관성 (할인 제외, 동일 상품 기준) */
  priceConsistency: {
    isConsistent: boolean;
    uniquePrices: number[];
    changes?: {
      fromEvent: string;
      toEvent: string;
      fromPrice: number;
      toPrice: number;
    }[];
  };
}

/** 전체 퍼널 검증 리포트 */
export interface FunnelValidationReport {
  /** 검증 타임스탬프 */
  timestamp: string;

  /** 추적된 이벤트 목록 */
  trackedEvents: string[];

  /** 아이템별 일관성 결과 */
  itemResults: FunnelConsistencyResult[];

  /** 전체 일관성 점수 */
  overallConsistency: {
    /** 추적된 총 아이템 수 */
    totalItems: number;

    /** 일관성 있는 아이템 수 */
    consistentItems: number;

    /** 일관성 점수 (%) */
    consistencyPercent: number;
  };

  /** 발견된 문제점 */
  issues: {
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    type: 'NAME_MISMATCH' | 'PRICE_MISMATCH' | 'MISSING_ITEM';
    description: string;
    affectedEvents: string[];
    item_id?: string;
  }[];
}

// ═══════════════════════════════════════════════════════════════════════════
// 피드백 루프 (가이드 개선)
// ═══════════════════════════════════════════════════════════════════════════

export interface MismatchPattern {
  /** 패턴 이름 */
  pattern: string;

  /** 발생 빈도 */
  occurrences: number;

  /** 예시 */
  examples: {
    predicted: unknown;
    actual: unknown;
    event: string;
    page: string;
  }[];

  /** 개선 방향 제안 */
  suggestedFix: string;
}

export interface GuideFeedback {
  /** 대상 이벤트 */
  eventName: string;

  /** 현재 정확도 */
  currentAccuracy: number;

  /** 발견된 불일치 패턴 */
  mismatchPatterns: MismatchPattern[];

  /** 가이드 업데이트 제안 */
  suggestedPromptUpdates: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Vision AI 프롬프트 컨텍스트
// ═══════════════════════════════════════════════════════════════════════════

export interface ParameterExtractionContext {
  /** 이벤트 이름 */
  eventName: string;

  /** 페이지 타입 */
  pageType: string;

  /** 추출할 파라미터 목록 */
  parametersToExtract: {
    name: string;
    description: string;
    type: 'string' | 'number' | 'boolean';
    required: boolean;
    extractionHint?: string;  // 추출 힌트 (예: "가격에서 숫자만 추출")
  }[];

  /** 사이트별 특수 규칙 */
  siteSpecificRules?: {
    rule: string;
    description: string;
  }[];
}
