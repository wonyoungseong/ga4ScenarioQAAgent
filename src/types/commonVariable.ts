/**
 * GTM 공통 변수 정의
 *
 * 모든 이벤트에서 공통으로 수집되는 변수들을 관리합니다.
 * GTM 태그에서 사용하는 변수 이름과 실제 값 소스를 매핑합니다.
 */

// ═══════════════════════════════════════════════════════════════════════════
// 공통 이벤트 파라미터 (대부분의 이벤트에서 사용)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 공통 이벤트 레벨 파라미터
 * 거의 모든 GA4 이벤트에서 수집되는 기본 파라미터
 */
export interface CommonEventParameters {
  // 필수 공통 파라미터
  event_category: string;      // 이벤트 카테고리 (예: "ecommerce", "login", "search")
  event_action: string;        // 이벤트 액션 (예: "view item", "add to cart")
  event_label?: string;        // 이벤트 라벨 (선택적 추가 정보)

  // 통화 관련 (이커머스 이벤트)
  currency?: string;           // 통화 코드 (예: "KRW", "USD")
  value?: number;              // 총 금액
}

/**
 * 공통 아이템 레벨 파라미터
 * 이커머스 이벤트의 items[] 배열에서 사용
 */
export interface CommonItemParameters {
  // GA4 표준 아이템 파라미터
  item_id: string;             // 상품 고유 ID
  item_name: string;           // 상품명
  item_brand?: string;         // 브랜드명
  item_category?: string;      // 카테고리 (1차)
  item_category2?: string;     // 카테고리 (2차)
  item_category3?: string;     // 카테고리 (3차)
  item_category4?: string;     // 카테고리 (4차)
  item_category5?: string;     // 카테고리 (5차)
  item_variant?: string;       // 상품 변형 (옵션)
  price?: number;              // 상품 가격
  quantity?: number;           // 수량
  discount?: number;           // 할인 금액
  index?: number;              // 리스트 내 위치
  item_list_name?: string;     // 상품 리스트 이름
  item_list_id?: string;       // 상품 리스트 ID
  coupon?: string;             // 적용된 쿠폰

  // 아모레몰 커스텀 아이템 파라미터
  apg_brand_code?: string;     // APG 브랜드 코드
  internal_brand_code?: string; // 내부 브랜드 코드
  original_price?: number;     // 정가 (할인 전)
}

// ═══════════════════════════════════════════════════════════════════════════
// GTM 변수 매핑
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GTM 변수 타입
 */
export type GTMVariableType =
  | 'jsm'   // JavaScript Macro - 커스텀 JS 함수
  | 'v'     // Data Layer Variable - dataLayer에서 직접 읽기
  | 'k'     // Cookie Variable - 쿠키에서 읽기
  | 'u'     // URL Variable - URL 파라미터에서 읽기
  | 'smm'   // Lookup Table
  | 'remm'  // Regex Table
  | 'gtes'  // Google Tag Event Settings
  | 'cvt';  // Custom Variable Template

/**
 * GTM 변수 정의
 */
export interface GTMVariableDefinition {
  name: string;                // 변수 이름 (예: "JS - Currency")
  type: GTMVariableType;       // 변수 타입
  valueSource?: string;        // 값 소스 설명
  usedInEvents: string[];      // 사용되는 이벤트 목록
  isCommon: boolean;           // 공통 변수 여부
}

/**
 * 공통 GTM 변수 목록
 * 여러 이벤트에서 공유되는 변수들
 */
export const COMMON_GTM_VARIABLES: GTMVariableDefinition[] = [
  // ─────────────────────────────────────────────────────────────────────
  // 통화/가격 관련
  // ─────────────────────────────────────────────────────────────────────
  {
    name: 'JS - Currency',
    type: 'jsm',
    valueSource: '사이트 언어/국가 설정 기반 통화 코드 반환',
    usedInEvents: ['view_item', 'add_to_cart', 'begin_checkout', 'purchase', 'select_item', 'view_item_list'],
    isCommon: true,
  },

  // ─────────────────────────────────────────────────────────────────────
  // 이벤트 메타데이터 (dataLayer에서 읽음)
  // ─────────────────────────────────────────────────────────────────────
  {
    name: 'DL - Event Category with customEvent',
    type: 'v',
    valueSource: 'dataLayer.eventCategory',
    usedInEvents: ['custom_event', 'qualified_visit'],
    isCommon: true,
  },
  {
    name: 'DL - Event Action with customEvent',
    type: 'v',
    valueSource: 'dataLayer.eventAction',
    usedInEvents: ['custom_event', 'qualified_visit'],
    isCommon: true,
  },
  {
    name: 'DL - Event Label with customEvent',
    type: 'v',
    valueSource: 'dataLayer.eventLabel',
    usedInEvents: ['custom_event', 'login', 'sign_up', 'withdrawal', 'qualified_visit'],
    isCommon: true,
  },

  // ─────────────────────────────────────────────────────────────────────
  // 페이지/사이트 정보
  // ─────────────────────────────────────────────────────────────────────
  {
    name: 'JS - Content Group',
    type: 'jsm',
    valueSource: '페이지 타입/콘텐츠 그룹 반환',
    usedInEvents: ['scroll', 'page_view'],
    isCommon: true,
  },
  {
    name: 'LT - Content Group',
    type: 'smm',
    valueSource: 'URL 패턴 기반 콘텐츠 그룹 룩업',
    usedInEvents: ['scroll'],
    isCommon: true,
  },
  {
    name: 'JS - Page Title',
    type: 'jsm',
    valueSource: 'document.title',
    usedInEvents: ['live'],
    isCommon: true,
  },
  {
    name: 'JS - Page Referrer',
    type: 'jsm',
    valueSource: 'document.referrer',
    usedInEvents: ['custom_event'],
    isCommon: true,
  },

  // ─────────────────────────────────────────────────────────────────────
  // 사용자 정보
  // ─────────────────────────────────────────────────────────────────────
  {
    name: 'JS - Login Is Login',
    type: 'jsm',
    valueSource: '로그인 여부',
    usedInEvents: ['*'], // 모든 이벤트에서 사용자 속성으로 전송
    isCommon: true,
  },
  {
    name: 'JS - Login Gender',
    type: 'jsm',
    valueSource: '사용자 성별',
    usedInEvents: ['*'],
    isCommon: true,
  },
  {
    name: 'JS - Login Age',
    type: 'jsm',
    valueSource: '사용자 나이대',
    usedInEvents: ['*'],
    isCommon: true,
  },
  {
    name: 'JS - Login Beauty Level',
    type: 'jsm',
    valueSource: '뷰티 포인트 등급',
    usedInEvents: ['*'],
    isCommon: true,
  },

  // ─────────────────────────────────────────────────────────────────────
  // 사이트/채널 정보
  // ─────────────────────────────────────────────────────────────────────
  {
    name: 'JS - Site Country',
    type: 'jsm',
    valueSource: '사이트 국가 코드 (kr, us 등)',
    usedInEvents: ['*'],
    isCommon: true,
  },
  {
    name: 'JS - Site Language',
    type: 'jsm',
    valueSource: '사이트 언어 (ko, en 등)',
    usedInEvents: ['*'],
    isCommon: true,
  },
  {
    name: 'JS - Channel',
    type: 'jsm',
    valueSource: '접속 채널 (PCWeb, MobileWeb, App)',
    usedInEvents: ['*'],
    isCommon: true,
  },

  // ─────────────────────────────────────────────────────────────────────
  // UTM 파라미터
  // ─────────────────────────────────────────────────────────────────────
  {
    name: 'URL - utm_source',
    type: 'u',
    valueSource: 'URL의 utm_source 파라미터',
    usedInEvents: ['campaign_details'],
    isCommon: true,
  },
  {
    name: 'URL - utm_medium',
    type: 'u',
    valueSource: 'URL의 utm_medium 파라미터',
    usedInEvents: ['campaign_details'],
    isCommon: true,
  },
  {
    name: 'URL - utm_campaign',
    type: 'u',
    valueSource: 'URL의 utm_campaign 파라미터',
    usedInEvents: ['campaign_details'],
    isCommon: true,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// 이벤트별 파라미터 변수 매핑
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 이벤트별 파라미터와 GTM 변수 매핑
 */
export interface EventParameterMapping {
  eventName: string;
  eventParameters: {
    key: string;                 // 파라미터 키
    gtmVariable: string;         // GTM 변수 이름 (예: "{{JS - Currency}}")
    isStandard: boolean;         // GA4 표준 파라미터 여부
    canExtractFromScreen: boolean; // 화면에서 추출 가능 여부
    extractionHint?: string;     // Vision AI 추출 힌트
  }[];
  itemParameters: {
    key: string;
    isStandard: boolean;
    canExtractFromScreen: boolean;
    extractionHint?: string;
  }[];
}

/**
 * view_item 이벤트 파라미터 매핑
 */
export const VIEW_ITEM_PARAMETERS: EventParameterMapping = {
  eventName: 'view_item',
  eventParameters: [
    { key: 'event_category', gtmVariable: 'ecommerce', isStandard: false, canExtractFromScreen: false },
    { key: 'event_action', gtmVariable: 'view item', isStandard: false, canExtractFromScreen: false },
    { key: 'items', gtmVariable: '{{JS - View Item DataLayer}}', isStandard: true, canExtractFromScreen: true, extractionHint: '상품 정보 배열' },
    { key: 'currency', gtmVariable: '{{JS - Currency}}', isStandard: true, canExtractFromScreen: true, extractionHint: '통화 기호(₩) 또는 사이트 언어로 추론' },
    { key: 'product_id', gtmVariable: '{{JS - Product Id with View Item}}', isStandard: false, canExtractFromScreen: true, extractionHint: 'URL의 onlineProdCode 파라미터' },
    { key: 'product_name', gtmVariable: '{{JS - Product Name with View Item}}', isStandard: false, canExtractFromScreen: true, extractionHint: '상품명 영역의 텍스트' },
    { key: 'product_category', gtmVariable: '{{JS - Product Category with View Item}}', isStandard: false, canExtractFromScreen: false, extractionHint: '브레드크럼 또는 카테고리 영역' },
    { key: 'product_brandname', gtmVariable: '{{JS - Product Brandname with View Item}}', isStandard: false, canExtractFromScreen: true, extractionHint: '브랜드명 링크/텍스트' },
    { key: 'product_brandcode', gtmVariable: '{{JS - Product Brandcode with View Item}}', isStandard: false, canExtractFromScreen: false },
    { key: 'product_pagecode', gtmVariable: '{{JS - Product Pagecode with View Item}}', isStandard: false, canExtractFromScreen: false },
    { key: 'product_is_stock', gtmVariable: '{{JS - Product Is Stock with View Item}}', isStandard: false, canExtractFromScreen: true, extractionHint: '품절 여부 표시' },
    { key: 'product_is_pacific', gtmVariable: '{{JS - Product Is Pacific with View Item}}', isStandard: false, canExtractFromScreen: false },
    { key: 'product_sn', gtmVariable: '{{JS - Product Sn with View Item}}', isStandard: false, canExtractFromScreen: true, extractionHint: 'URL의 onlineProdSn 파라미터' },
    { key: 'event_label', gtmVariable: '{{JS - Item Name}}', isStandard: false, canExtractFromScreen: true, extractionHint: '상품명' },
  ],
  itemParameters: [
    { key: 'item_id', isStandard: true, canExtractFromScreen: true, extractionHint: 'URL의 onlineProdCode' },
    { key: 'item_name', isStandard: true, canExtractFromScreen: true, extractionHint: '상품명 영역 텍스트' },
    { key: 'item_brand', isStandard: true, canExtractFromScreen: true, extractionHint: '브랜드명 링크/로고' },
    { key: 'item_category', isStandard: true, canExtractFromScreen: false, extractionHint: '1차 카테고리' },
    { key: 'item_category2', isStandard: true, canExtractFromScreen: false, extractionHint: '2차 카테고리' },
    { key: 'item_category3', isStandard: true, canExtractFromScreen: false, extractionHint: '3차 카테고리' },
    { key: 'item_category4', isStandard: true, canExtractFromScreen: false, extractionHint: '4차 카테고리' },
    { key: 'item_category5', isStandard: true, canExtractFromScreen: false, extractionHint: '5차 카테고리' },
    { key: 'apg_brand_code', isStandard: false, canExtractFromScreen: false },
    { key: 'price', isStandard: true, canExtractFromScreen: true, extractionHint: '판매가/혜택가 영역의 숫자' },
    { key: 'discount', isStandard: true, canExtractFromScreen: true, extractionHint: '정가 - 판매가' },
    { key: 'original_price', isStandard: false, canExtractFromScreen: true, extractionHint: '취소선이 있는 정가' },
    { key: 'internal_brand_code', isStandard: false, canExtractFromScreen: false },
  ],
};

/**
 * add_to_cart 이벤트 파라미터 매핑
 */
export const ADD_TO_CART_PARAMETERS: EventParameterMapping = {
  eventName: 'add_to_cart',
  eventParameters: [
    { key: 'event_category', gtmVariable: 'ecommerce', isStandard: false, canExtractFromScreen: false },
    { key: 'event_action', gtmVariable: 'add to cart', isStandard: false, canExtractFromScreen: false },
    { key: 'items', gtmVariable: '{{JS - Add to Cart DataLayer}}', isStandard: true, canExtractFromScreen: true },
    { key: 'currency', gtmVariable: '{{JS - Currency}}', isStandard: true, canExtractFromScreen: true },
  ],
  itemParameters: [
    { key: 'item_id', isStandard: true, canExtractFromScreen: true },
    { key: 'item_name', isStandard: true, canExtractFromScreen: true },
    { key: 'item_brand', isStandard: true, canExtractFromScreen: true },
    { key: 'item_category', isStandard: true, canExtractFromScreen: false },
    { key: 'item_category2', isStandard: true, canExtractFromScreen: false },
    { key: 'item_category3', isStandard: true, canExtractFromScreen: false },
    { key: 'item_category4', isStandard: true, canExtractFromScreen: false },
    { key: 'item_category5', isStandard: true, canExtractFromScreen: false },
    { key: 'item_variant', isStandard: true, canExtractFromScreen: true, extractionHint: '선택한 옵션' },
    { key: 'apg_brand_code', isStandard: false, canExtractFromScreen: false },
    { key: 'quantity', isStandard: true, canExtractFromScreen: true, extractionHint: '수량 선택 영역' },
    { key: 'price', isStandard: true, canExtractFromScreen: true },
    { key: 'discount', isStandard: true, canExtractFromScreen: true },
    { key: 'original_price', isStandard: false, canExtractFromScreen: true },
    { key: 'internal_brand_code', isStandard: false, canExtractFromScreen: false },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// 전체 이벤트 파라미터 매핑 레지스트리
// ═══════════════════════════════════════════════════════════════════════════

export const EVENT_PARAMETER_MAPPINGS: Record<string, EventParameterMapping> = {
  view_item: VIEW_ITEM_PARAMETERS,
  add_to_cart: ADD_TO_CART_PARAMETERS,
  // 추가 이벤트는 여기에 등록
};

// ═══════════════════════════════════════════════════════════════════════════
// 헬퍼 함수
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 이벤트의 화면 추출 가능한 파라미터 목록 반환
 */
export function getScreenExtractableParameters(eventName: string): string[] {
  const mapping = EVENT_PARAMETER_MAPPINGS[eventName];
  if (!mapping) return [];

  const extractable: string[] = [];

  // 이벤트 레벨 파라미터
  for (const param of mapping.eventParameters) {
    if (param.canExtractFromScreen) {
      extractable.push(param.key);
    }
  }

  // 아이템 레벨 파라미터
  for (const param of mapping.itemParameters) {
    if (param.canExtractFromScreen) {
      extractable.push(`items[].${param.key}`);
    }
  }

  return extractable;
}

/**
 * 이벤트의 화면 추출 불가능한 파라미터 목록 반환
 */
export function getHiddenParameters(eventName: string): string[] {
  const mapping = EVENT_PARAMETER_MAPPINGS[eventName];
  if (!mapping) return [];

  const hidden: string[] = [];

  for (const param of mapping.eventParameters) {
    if (!param.canExtractFromScreen) {
      hidden.push(param.key);
    }
  }

  for (const param of mapping.itemParameters) {
    if (!param.canExtractFromScreen) {
      hidden.push(`items[].${param.key}`);
    }
  }

  return hidden;
}

/**
 * 파라미터의 GTM 변수 소스 반환
 */
export function getParameterSource(eventName: string, parameterKey: string): string | undefined {
  const mapping = EVENT_PARAMETER_MAPPINGS[eventName];
  if (!mapping) return undefined;

  const eventParam = mapping.eventParameters.find(p => p.key === parameterKey);
  if (eventParam) return eventParam.gtmVariable;

  return undefined;
}

/**
 * Vision AI 추출 힌트 생성
 */
export function generateExtractionPrompt(eventName: string): string {
  const mapping = EVENT_PARAMETER_MAPPINGS[eventName];
  if (!mapping) return '';

  const lines: string[] = [
    `## ${eventName} 이벤트 파라미터 추출 가이드`,
    '',
    '### 화면에서 추출 가능한 파라미터:',
  ];

  for (const param of mapping.eventParameters) {
    if (param.canExtractFromScreen && param.extractionHint) {
      lines.push(`- **${param.key}**: ${param.extractionHint}`);
    }
  }

  lines.push('', '### 아이템 파라미터:');
  for (const param of mapping.itemParameters) {
    if (param.canExtractFromScreen && param.extractionHint) {
      lines.push(`- **${param.key}**: ${param.extractionHint}`);
    }
  }

  lines.push('', '### 화면에서 추출 불가 (dataLayer/전역변수에서만 확인 가능):');
  for (const param of mapping.eventParameters) {
    if (!param.canExtractFromScreen) {
      lines.push(`- ${param.key}`);
    }
  }

  return lines.join('\n');
}

/**
 * 공통 변수 중 특정 이벤트에서 사용되는 것만 필터링
 */
export function getCommonVariablesForEvent(eventName: string): GTMVariableDefinition[] {
  return COMMON_GTM_VARIABLES.filter(v =>
    v.usedInEvents.includes('*') || v.usedInEvents.includes(eventName)
  );
}
