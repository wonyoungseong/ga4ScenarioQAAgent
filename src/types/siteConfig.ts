/**
 * 사이트 설정 타입 정의
 *
 * 개발가이드 PDF에서 추출하여 각 사이트별로 구성합니다.
 * 위치: sites/{site-name}/site-config.json
 */

/**
 * 사이트 기본 정보
 */
export interface SiteInfo {
  /** 사이트 표시명 (예: "아모레몰 KR") */
  name: string;

  /** 도메인 (예: "amoremall.com") */
  domain: string;

  /** 플랫폼 타입 */
  platform: 'custom' | 'shopify' | 'cafe24' | 'magento' | 'other';

  /** 국가 코드 (예: "KR", "US") */
  country: string;

  /** 언어 코드 (예: "ko", "en") */
  language: string;
}

/**
 * GA4 표준 이벤트 → 사이트 dataLayer 이벤트명 매핑
 *
 * GA4에서 정의한 표준 이벤트명과 실제 사이트에서 사용하는
 * dataLayer.push({ event: "xxx" })의 이벤트명을 매핑합니다.
 */
export interface EventMapping {
  /** 장바구니 담기 - "addcart" or "cart" */
  add_to_cart: string | string[];

  /** 장바구니 삭제 - "removecart" */
  remove_from_cart: string | string[];

  /** 상품 상세 조회 - "product" */
  view_item: string | string[];

  /** 상품 목록 조회 - "view_item_list" or "ap_search" */
  view_item_list: string | string[];

  /** 결제 시작 - "checkout" or ["cart", "purchasecartbtn", "order"] */
  begin_checkout: string | string[];

  /** 구매 완료 - "purchase" */
  purchase: string | string[];

  /** 로그인 - "login" or "login_complete" */
  login: string | string[];

  /** 회원가입 - "sign_up" or "sign_up_complete" */
  sign_up: string | string[];

  /** 검색 결과 조회 - "view_search_results" */
  view_search_results: string | string[];

  /** 리뷰 작성 - "write_review" or "review" */
  write_review: string | string[];

  /** 프로모션 조회 - "view_promotion" */
  view_promotion: string | string[];

  /** 장바구니 조회 - "view_cart" */
  view_cart: string | string[];

  /** 페이지 조회 - "page_view" or "ap_page_view" */
  page_view: string | string[];

  /** 스크롤 - "scroll" */
  scroll: string | string[];
}

/**
 * DOM 속성명 정의
 *
 * GTM이 클릭 이벤트에서 데이터를 추출하기 위해 사용하는
 * HTML 요소의 data 속성명을 정의합니다.
 */
export interface DOMAttributes {
  /** 프로모션 데이터 속성 - "ap-data-promotion" */
  promotion: string;

  /** 상품 데이터 속성 - "ap-data-item" */
  item: string;

  /** 일반 클릭 데이터 속성 - "ap-data-click" */
  click: string;

  /** 클릭 영역 속성 - "ap-click-area" */
  clickArea?: string;

  /** 클릭 이름 속성 - "ap-click-name" */
  clickName?: string;
}

/**
 * 변수 네이밍 규칙
 *
 * 사이트에서 사용하는 JavaScript 변수의 네이밍 패턴을 정의합니다.
 */
export interface VariableNaming {
  /** 공통 접두사 (예: "AP_") */
  prefix: string;

  /** 상품 관련 (예: "PRD" → AP_PRD_CODE) */
  product: string;

  /** 장바구니 관련 (예: "CART" → AP_CART_TOTAL) */
  cart: string;

  /** 구매 관련 (예: "PURCHASE" → AP_PURCHASE_TOTAL) */
  purchase: string;

  /** 공통 데이터 관련 (예: "DATA" → AP_DATA_SITENAME) */
  data: string;
}

/**
 * 페이지 타입 매핑
 *
 * 사이트에서 정의한 페이지 타입 코드를 매핑합니다.
 * 배열로 정의하여 여러 값을 허용합니다.
 */
export interface PageTypes {
  /** 메인 페이지 */
  main: string[];

  /** 카테고리/상품 목록 */
  category: string[];

  /** 상품 상세 */
  product: string[];

  /** 장바구니 */
  cart: string[];

  /** 결제/주문 */
  checkout: string[];

  /** 검색 결과 */
  search: string[];

  /** 마이페이지 */
  mypage: string[];

  /** 주문 완료 */
  orderComplete: string[];

  /** 로그인 */
  login: string[];

  /** 회원가입 */
  signup: string[];
}

/**
 * 트리거 타입 정의
 */
export type TriggerType =
  | 'LINK_CLICK'      // 링크(a 태그) 클릭
  | 'CLICK'           // 모든 요소 클릭
  | 'CUSTOM_EVENT'    // dataLayer.push 커스텀 이벤트
  | 'PAGEVIEW'        // 페이지 로드
  | 'DOM_READY'       // DOM Ready
  | 'HISTORY_CHANGE'  // SPA 히스토리 변경
  | 'SCROLL_DEPTH'    // 스크롤 깊이
  | 'VISIBILITY'      // 요소 노출
  | 'TIMER';          // 타이머

/**
 * GA4 이벤트별 트리거 정보
 *
 * 각 GA4 이벤트가 어떤 방식으로 발생하는지 정의합니다.
 */
export interface EventTriggerInfo {
  /** GA4 이벤트명 */
  ga4EventName: string;

  /** 트리거 타입 */
  triggerType: TriggerType;

  /** LINK_CLICK/CLICK인 경우 CSS Selector */
  cssSelector?: string;

  /** CUSTOM_EVENT인 경우 dataLayer 이벤트명 (정규식 가능) */
  customEventName?: string;

  /** 추가 설명 */
  description?: string;
}

/**
 * 전체 사이트 설정
 */
export interface SiteConfig {
  /** 사이트 기본 정보 */
  siteInfo: SiteInfo;

  /** 이벤트 매핑 */
  eventMapping: EventMapping;

  /** DOM 속성명 */
  domAttributes: DOMAttributes;

  /** 변수 네이밍 규칙 */
  variableNaming: VariableNaming;

  /** 페이지 타입 매핑 */
  pageTypes: PageTypes;

  /** 이벤트별 트리거 정보 (GTM에서 추출) */
  eventTriggers?: Record<string, EventTriggerInfo>;

  /** 추가 사이트별 설정 */
  customSettings?: Record<string, any>;
}

/**
 * 사이트 설정 파일 경로 헬퍼
 */
export function getSiteConfigPath(siteName: string): string {
  return `specs/sites/${siteName}/site_config.yaml`;
}

/**
 * GTM 설정 파일 경로 헬퍼
 */
export function getGTMConfigPath(siteName: string): string {
  return `specs/sites/${siteName}/gtm-config.json`;
}

/**
 * 이벤트 스펙 폴더 경로 헬퍼
 */
export function getEventSpecsPath(siteName: string): string {
  return `specs/sites/${siteName}/events`;
}

/**
 * 파라미터 매핑 파일 경로 헬퍼
 */
export function getParamMappingPath(siteName: string): string {
  return `specs/sites/${siteName}/mapping/param-mapping.yaml`;
}

/**
 * GA4 표준 이벤트 파일 경로 헬퍼
 */
export function getGA4StandardsPath(): string {
  return `specs/common/ga4_standard_events.yaml`;
}
