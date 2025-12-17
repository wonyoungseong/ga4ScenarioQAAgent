/**
 * 시나리오 가이드 생성에 필요한 정보 스키마
 *
 * 어떤 개발가이드 PDF가 오더라도 이 스키마에 맞게 정보를 추출하고,
 * 누락된 정보는 유저에게 확인합니다.
 */

/**
 * 이벤트 정의 - 시나리오 작성에 필수
 */
export interface EventDefinitionRequirement {
  /** 이벤트 이름 (필수) */
  eventName: string;

  /** 이벤트 설명/목적 (필수) */
  description: string;

  /** 이벤트 전송 시점 - 언제 발생하는지 (필수) */
  firingCondition: string;

  /** 발생 가능한 페이지 타입 (필수) */
  allowedPageTypes: string[];

  /** 사용자 액션 필요 여부 (선택) */
  requiresUserAction?: boolean;

  /** 필요한 UI 요소 (선택) */
  requiredUIElements?: string[];

  /** 개발 필수 여부 (선택) */
  required?: boolean;
}

/**
 * 이벤트 파라미터 정의 - 데이터 검증에 필수
 */
export interface EventParameterRequirement {
  /** 이벤트 이름 */
  eventName: string;

  /** Event-level 파라미터 */
  eventParameters: ParameterDefinition[];

  /** Item-level 파라미터 (items 배열 내부) */
  itemParameters: ParameterDefinition[];
}

export interface ParameterDefinition {
  /** 파라미터 키 (필수) */
  key: string;

  /** 파라미터 설명 (필수) */
  description: string;

  /** 데이터 타입 (선택) */
  dataType?: 'string' | 'number' | 'boolean' | 'array';

  /** 필수 여부 (선택) */
  required?: boolean;

  /** 예시 값 (선택) */
  example?: string;

  /** GA4 표준 파라미터 여부 */
  isStandard?: boolean;
}

/**
 * 페이지 타입 정의
 */
export interface PageTypeRequirement {
  /** 페이지 타입 코드 (필수) */
  pageType: string;

  /** 페이지 설명 (필수) */
  description: string;

  /** URL 패턴 (선택) */
  urlPatterns?: string[];

  /** AP_DATA_PAGETYPE 값 (선택) */
  apDataPageType?: string;
}

/**
 * 전체 시나리오 가이드 요구사항
 */
export interface ScenarioGuideRequirements {
  /** 문서 메타데이터 */
  metadata: {
    /** 문서 제목/출처 */
    source: string;
    /** 파싱 일시 */
    parsedAt: string;
    /** 파싱 성공 여부 */
    parseSuccess: boolean;
  };

  /** 이벤트 정의 목록 */
  events: EventDefinitionRequirement[];

  /** 이벤트별 파라미터 정의 */
  parameters: EventParameterRequirement[];

  /** 페이지 타입 정의 */
  pageTypes: PageTypeRequirement[];

  /** 누락된 정보 목록 */
  missingInfo: MissingInfoItem[];

  /** 검증 결과 */
  validation: ValidationResult;
}

/**
 * 누락된 정보 항목
 */
export interface MissingInfoItem {
  /** 항목 유형 */
  type: 'event' | 'parameter' | 'pageType' | 'firingCondition';

  /** 관련 이벤트/항목 이름 */
  relatedTo: string;

  /** 누락된 필드 */
  missingField: string;

  /** 심각도 */
  severity: 'critical' | 'warning' | 'info';

  /** 유저에게 보여줄 질문 */
  userQuestion: string;

  /** 기본값 제안 (있는 경우) */
  suggestedDefault?: string;
}

/**
 * 검증 결과
 */
export interface ValidationResult {
  /** 전체 유효성 */
  isValid: boolean;

  /** 필수 정보 완료율 (0-100) */
  completeness: number;

  /** 발견된 문제 */
  issues: {
    critical: string[];
    warnings: string[];
    info: string[];
  };

  /** 시나리오 작성 가능 여부 */
  canGenerateScenario: boolean;
}

/**
 * 필수 필드 정의 - 이 필드들이 없으면 시나리오 작성 불가
 */
export const REQUIRED_FIELDS = {
  event: ['eventName', 'firingCondition', 'allowedPageTypes'] as const,
  parameter: ['key', 'description'] as const,
  pageType: ['pageType', 'description'] as const,
};

/**
 * GA4 표준 이벤트 목록 - 이벤트가 표준인지 확인용
 */
export const GA4_STANDARD_EVENTS = [
  'page_view', 'screen_view', 'scroll', 'click', 'first_visit', 'session_start',
  'view_item', 'view_item_list', 'select_item', 'add_to_cart', 'remove_from_cart',
  'view_cart', 'begin_checkout', 'add_payment_info', 'add_shipping_info', 'purchase',
  'refund', 'view_promotion', 'select_promotion', 'add_to_wishlist',
  'search', 'share', 'sign_up', 'login', 'generate_lead',
];

/**
 * 기본 페이지 타입 목록
 */
export const DEFAULT_PAGE_TYPES = [
  'MAIN', 'PRODUCT_LIST', 'PRODUCT_DETAIL', 'CART', 'ORDER', 'SEARCH_RESULT',
  'EVENT_LIST', 'EVENT_DETAIL', 'MY', 'BRAND_MAIN', 'BRAND_LIST',
];
