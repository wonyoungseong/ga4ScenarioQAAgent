/**
 * 통합 QA 자동화 예측 시스템 타입 정의
 *
 * URL 입력 시:
 * 1. 페이지 타입 감지
 * 2. 발생 이벤트 예측 (autoFire/userAction)
 * 3. 각 이벤트의 파라미터 및 값 예측
 * 4. 실제 dataLayer/개발변수와 비교 검증
 */

import { EventFireType, TriggerCondition, RequiredVariable } from './eventMetadata';

/**
 * 예측 신뢰도
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'skip';

/**
 * 예측값 소스
 */
export type PredictionSource =
  | 'url'           // URL 패턴에서 추출 (site_name, site_country, product_id 등)
  | 'url_pattern'   // URL 패턴 매칭 (site_env, content_group)
  | 'devVar'        // 개발 변수 (AP_DATA_*) 수집
  | 'vision'        // Vision AI 화면 분석 (item_name, price 등)
  | 'constant'      // 고정값 (currency: KRW)
  | 'computed'      // 계산된 값 (value = price * quantity)
  | 'dataLayer'     // dataLayer에서 추출
  | 'gtm'           // GTM 내부 로직
  | 'unknown';      // 예측 불가

/**
 * 파라미터 예측 결과
 */
export interface ParameterPrediction {
  /** 파라미터 키 (GA4 파라미터명) */
  key: string;

  /** 파라미터 표시명 */
  displayName?: string;

  /** 예측값 */
  predictedValue: string | number | boolean | null;

  /** 예측 소스 */
  source: PredictionSource;

  /** 신뢰도 */
  confidence: ConfidenceLevel;

  /** 필수 파라미터 여부 */
  required: boolean;

  /** 예측 근거 */
  notes?: string;

  /** 관련 개발 변수 (AP_*) */
  devVariable?: string;

  /** 검증 규칙 */
  validationRule?: {
    type: 'exact' | 'contains' | 'regex' | 'numeric' | 'notEmpty';
    pattern?: string;
    allowedValues?: (string | number)[];
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
  };
}

/**
 * 트리거 정보 (userAction 이벤트용)
 */
export interface TriggerInfo {
  /** 트리거 타입 */
  type: 'pageLoad' | 'click' | 'scroll' | 'input' | 'custom' | 'dataLayer';

  /** CSS 셀렉터 (click 트리거용) */
  selector?: string;

  /** dataLayer 이벤트명 (custom/dataLayer 트리거용) */
  dataLayerEvent?: string;

  /** 트리거 설명 */
  description?: string;
}

/**
 * 이벤트 예측 결과
 */
export interface EventPrediction {
  /** 이벤트명 (GA4 이벤트명) */
  eventName: string;

  /** 이벤트 표시명 (한글) */
  displayName: string;

  /** 이벤트 설명 */
  description?: string;

  /** 발생 타입 */
  fireType: EventFireType;

  /** 이 페이지에서 발생해야 하는지 */
  shouldFire: boolean;

  /** shouldFire 판단 근거 */
  shouldFireReason: string;

  /** 트리거 정보 (userAction인 경우) */
  trigger?: TriggerInfo;

  /** 파라미터 예측 목록 */
  parameters: ParameterPrediction[];

  /** 전체 신뢰도 */
  confidence: ConfidenceLevel;

  /** 선행 이벤트 */
  prerequisiteEvents?: string[];

  /** 후행 이벤트 */
  followUpEvents?: string[];
}

/**
 * 페이지 컨텍스트 정보
 */
export interface PageContextResult {
  /** 페이지 타입 (MAIN, PRODUCT_DETAIL 등) */
  pageType: string;

  /** 페이지 타입 감지 신뢰도 (0~1) */
  pageTypeConfidence: number;

  /** 페이지 타입 감지 소스 */
  pageTypeSource: 'url_pattern' | 'devVar' | 'dataLayer' | 'vision' | 'dom';

  /** 수집된 개발 변수 */
  devVariables: Record<string, string | null>;

  /** dataLayer 스냅샷 */
  dataLayerSnapshot?: DataLayerEvent[];

  /** 페이지 URL */
  url: string;

  /** 호스트명 */
  hostname: string;

  /** 경로 */
  pathname: string;

  /** 쿼리 파라미터 */
  queryParams: Record<string, string>;
}

/**
 * dataLayer 이벤트 구조
 */
export interface DataLayerEvent {
  event?: string;
  [key: string]: unknown;
}

/**
 * 통합 예측 결과
 */
export interface UnifiedPrediction {
  /** 분석 대상 URL */
  url: string;

  /** 분석 시간 */
  timestamp: Date;

  /** 페이지 컨텍스트 */
  pageContext: PageContextResult;

  /** 이벤트 예측 목록 */
  events: EventPrediction[];

  /** 검증 결과 (--validate 옵션 사용 시) */
  validation?: ValidationSummary;

  /** 분석 메타데이터 */
  metadata?: {
    /** 분석에 사용된 Vision AI 여부 */
    usedVisionAI: boolean;
    /** 분석 소요 시간 (ms) */
    analysisTime: number;
    /** 사용된 GTM 컨테이너 ID */
    gtmContainerId?: string;
    /** 에러/경고 */
    warnings?: string[];
  };
}

/**
 * 검증 요약
 */
export interface ValidationSummary {
  /** 전체 파라미터 수 */
  totalParameters: number;

  /** 일치한 파라미터 수 */
  matchedParameters: number;

  /** 불일치 파라미터 수 */
  mismatchedParameters: number;

  /** 누락 파라미터 수 (예측했으나 실제 없음) */
  missingParameters: number;

  /** 전체 정확도 (%) */
  accuracy: number;

  /** 불일치 상세 */
  discrepancies: ParameterDiscrepancy[];

  /** 이벤트별 검증 결과 */
  eventResults?: EventValidationResult[];
}

/**
 * 이벤트별 검증 결과
 */
export interface EventValidationResult {
  /** 이벤트명 */
  eventName: string;

  /** 이벤트 발생 여부 */
  fired: boolean;

  /** 예측 발생 여부 */
  predictedToFire: boolean;

  /** 발생 verdict */
  firingVerdict: 'correct' | 'false_positive' | 'false_negative';

  /** 파라미터 정확도 (%) */
  parameterAccuracy: number;

  /** 파라미터 불일치 목록 */
  parameterDiscrepancies: ParameterDiscrepancy[];
}

/**
 * 파라미터 불일치 상세
 */
export interface ParameterDiscrepancy {
  /** 이벤트명 */
  eventName: string;

  /** 파라미터 키 */
  paramKey: string;

  /** 예측값 */
  predicted: string | number | boolean | null;

  /** 실제값 */
  actual: string | number | boolean | null;

  /** 불일치 유형 */
  verdict: 'match' | 'mismatch' | 'missing_actual' | 'missing_prediction' | 'type_mismatch';

  /** 심각도 */
  severity: 'critical' | 'warning' | 'info';

  /** 불일치 설명 */
  message?: string;
}

/**
 * QA 예측 옵션
 */
export interface QAPredictOptions {
  /** 대상 URL */
  url: string;

  /** 실제 dataLayer 검증 포함 */
  validate?: boolean;

  /** Vision AI 사용 여부 */
  useVisionAI?: boolean;

  /** 출력 형식 */
  outputFormat?: 'console' | 'json' | 'markdown';

  /** 특정 이벤트만 분석 */
  filterEvents?: string[];

  /** 사이트 ID */
  siteId?: string;

  /** GA4 Property ID */
  propertyId?: string;

  /** 상세 출력 */
  verbose?: boolean;
}

/**
 * 이벤트 표시명 매핑
 */
export const EVENT_DISPLAY_NAMES: Record<string, string> = {
  'page_view': '페이지 조회',
  'view_item': '상품 조회',
  'view_item_list': '상품 목록 조회',
  'view_search_results': '검색 결과 조회',
  'view_promotion': '프로모션 노출',
  'select_promotion': '프로모션 클릭',
  'select_item': '상품 클릭',
  'add_to_cart': '장바구니 담기',
  'remove_from_cart': '장바구니 제거',
  'view_cart': '장바구니 조회',
  'begin_checkout': '결제 시작',
  'purchase': '구매 완료',
  'login': '로그인',
  'sign_up': '회원가입',
  'scroll': '스크롤',
  'ap_click': '클릭',
  'click_with_duration': '클릭 체류시간',
  'custom_event': '커스텀 이벤트',
  'qualified_visit': '유효 방문',
};

/**
 * 페이지 타입 표시명 매핑
 */
export const PAGE_TYPE_DISPLAY_NAMES: Record<string, string> = {
  'MAIN': '메인',
  'PRODUCT_DETAIL': '상품 상세',
  'PRODUCT_LIST': '상품 목록',
  'BRAND_MAIN': '브랜드 메인',
  'SEARCH_RESULT': '검색 결과',
  'CART': '장바구니',
  'ORDER': '주문',
  'ORDER_COMPLETE': '주문 완료',
  'EVENT_DETAIL': '이벤트 상세',
  'EVENT_LIST': '이벤트 목록',
  'MY': '마이페이지',
  'LOGIN': '로그인',
  'SIGNUP': '회원가입',
  'SIGNUP_COMPLETE': '회원가입 완료',
  'MEMBERSHIP': '멤버십',
  'LIVE_LIST': '라이브 목록',
  'OTHERS': '기타',
};
