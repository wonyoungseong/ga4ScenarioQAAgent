/**
 * 이벤트 메타데이터 타입 정의
 *
 * 하이브리드 방식:
 * - 시나리오 에이전트: 사전 지식 (트리거, 변수, 검증 조건)
 * - Vision AI: 보조 검증 (요소 가시성, 상태 확인)
 */

/**
 * 이벤트 발생 타입
 */
export type EventFireType = 'autoFire' | 'userAction';

/**
 * 사용자 액션 타입
 */
export type UserActionType = 'click' | 'scroll' | 'input' | 'submit' | 'hover' | 'change' | 'custom';

/**
 * 트리거 조건 정의
 */
export interface TriggerCondition {
  /** CSS 셀렉터 목록 (OR 조건) */
  selectors: string[];

  /** 사용자 액션 타입 */
  actionType: UserActionType;

  /** 트리거 설명 */
  description: string;

  /** dataLayer 이벤트명 (custom 액션 타입용) */
  dataLayerEvent?: string;

  /** 트리거가 발생하는 페이지 타입 (없으면 모든 페이지) */
  pageTypes?: string[];

  /** 제외되는 페이지 타입 */
  excludePageTypes?: string[];

  /** 추가 조건 (예: 버튼 텍스트 포함) */
  additionalConditions?: string[] | {
    textContains?: string[];
    attributeContains?: { attr: string; value: string }[];
  };
}

/**
 * 필요한 변수 정의
 */
export interface RequiredVariable {
  /** GA4 파라미터명 */
  paramName: string;

  /** 매핑되는 AP_ 변수명 목록 */
  apVariables: string[];

  /** 필수 여부 */
  required: boolean;

  /** 변수 설명 */
  description: string;

  /** dataLayer 키 경로 (예: "duration.depth_10") */
  dataLayerKey?: string;

  /** 기본값 (상수) */
  defaultValue?: string;

  /** 폴백 소스 (DOM, URL 등) */
  fallbackSource?: 'DOM' | 'URL' | 'dataLayer' | 'constant';

  /** 폴백 추출 방법 */
  fallbackExtractor?: {
    type: 'selector' | 'urlParam' | 'regex' | 'constant';
    value: string;
  };
}

/**
 * dataLayer 검증 조건
 */
export interface DataLayerValidation {
  /** 기대하는 이벤트명 */
  eventName: string;

  /** 필수 필드 */
  requiredFields?: string[];

  /** ecommerce 객체 필수 여부 */
  requiresEcommerce?: boolean;

  /** items 배열 필수 여부 */
  requiresItems?: boolean;
}

/**
 * Vision AI 검증 힌트
 */
export interface VisionHint {
  /** 확인해야 할 요소 설명 */
  elementDescription: string;

  /** 예상 위치 (대략적) */
  expectedLocation?: 'header' | 'footer' | 'sidebar' | 'main' | 'modal' | 'floating';

  /** 확인할 상태 */
  checkState?: {
    /** 활성화 여부 확인 */
    checkEnabled?: boolean;
    /** 가시성 확인 */
    checkVisible?: boolean;
    /** 특정 텍스트 포함 확인 */
    checkText?: string;
  };

  /** 비활성화 조건 (예: 품절) */
  disabledConditions?: string[];
}

/**
 * 시나리오 템플릿 단계
 */
export interface ScenarioStep {
  /** 단계 번호 */
  order: number;

  /** 액션 타입 */
  action: 'navigate' | 'wait' | 'click' | 'scroll' | 'input' | 'assert' | 'capture';

  /** 타겟 (셀렉터 또는 URL) */
  target?: string;

  /** 입력값 (input 액션용) */
  value?: string;

  /** 대기 시간 (ms) */
  waitTime?: number;

  /** 단계 설명 */
  description: string;

  /** 이 단계에서 캡처할 변수 */
  captureVariables?: string[];
}

/**
 * GTM 태그/트리거 정보
 */
export interface GTMInfo {
  /** 태그 ID */
  tagId: string;

  /** 태그 이름 */
  tagName: string;

  /** 트리거 ID */
  triggerId: string;

  /** 트리거 이름 */
  triggerName: string;

  /** 트리거 타입 */
  triggerType: string;

  /** Custom Event 필터 조건 */
  customEventFilter?: string;

  /** 추가 필터 조건 */
  additionalFilter?: string;
}

/**
 * 캠페인 한정 이벤트 정보
 */
export interface CampaignInfo {
  /** 캠페인 특정 이벤트 여부 */
  isCampaignSpecific: boolean;

  /** 캠페인 설명 */
  description: string;

  /** 쿠키 조건 */
  cookieCondition?: string;

  /** 참고 사항 */
  note?: string;

  /** 활성화 기간 (있는 경우) */
  activePeriod?: {
    startDate?: string;
    endDate?: string;
  };
}

/**
 * 이벤트 메타데이터 전체 구조
 */
export interface EventMetadata {
  /** 이벤트명 (GA4 이벤트명) */
  eventName: string;

  /** 이벤트 표시명 (한글) */
  displayName: string;

  /** 이벤트 설명 */
  description: string;

  /** 발생 타입 */
  fireType: EventFireType;

  /** 발생하는 페이지 타입 */
  pageTypes: string[];

  /** 트리거 조건 (userAction인 경우) */
  trigger?: TriggerCondition;

  /** 필요한 변수 목록 */
  requiredVariables: RequiredVariable[];

  /** dataLayer 검증 조건 */
  dataLayerValidation: DataLayerValidation;

  /** Vision AI 힌트 */
  visionHints?: VisionHint[];

  /** 시나리오 템플릿 */
  scenarioTemplate?: ScenarioStep[];

  /** 선행 이벤트 (이 이벤트 전에 발생해야 하는 이벤트) */
  prerequisiteEvents?: string[];

  /** 후행 이벤트 (이 이벤트 후에 발생할 수 있는 이벤트) */
  followUpEvents?: string[];

  /** GTM 태그/트리거 정보 */
  gtmInfo?: GTMInfo;

  /** 캠페인 한정 정보 (캠페인 특정 이벤트인 경우) */
  campaignInfo?: CampaignInfo;
}

/**
 * 사이트별 이벤트 설정
 */
export interface SiteEventConfig {
  /** 사이트 도메인 */
  domain: string;

  /** GA4 Property ID */
  propertyId: string;

  /** GTM Container ID */
  gtmContainerId: string;

  /** 이벤트 메타데이터 목록 */
  events: EventMetadata[];

  /** 공통 변수 (모든 이벤트에 적용) */
  commonVariables?: RequiredVariable[];

  /** 페이지 타입별 기본 설정 */
  pageTypeDefaults?: Record<string, {
    autoFireEvents: string[];
    possibleUserActionEvents: string[];
  }>;
}
