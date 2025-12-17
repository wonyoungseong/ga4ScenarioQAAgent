/**
 * 페이지 컨텍스트 타입 정의
 * AP_DATA_PAGETYPE 변수에서 정의된 값들
 */
export type PageType =
  | 'MAIN'           // 메인 페이지
  | 'BRAND_MAIN'     // 브랜드 메인 페이지 (AP몰만 해당)
  | 'BRAND_PRODUCT_LIST'  // 브랜드 상품 목록 페이지 (AP몰)
  | 'BRAND_EVENT_LIST'    // 브랜드 이벤트 목록 페이지 (AP몰)
  | 'BRAND_CUSTOM_ETC'    // 브랜드 커스텀 기타 페이지 (AP몰)
  | 'BRAND_LIST'     // 브랜드 목록 페이지
  | 'PRODUCT_DETAIL' // 상품 상세 페이지
  | 'PRODUCT_LIST'   // 상품 리스트 페이지
  | 'CATEGORY_LIST'  // 카테고리 메인 페이지
  | 'SEARCH'         // 검색 레이어 페이지
  | 'SEARCH_RESULT'  // 검색 결과 페이지
  | 'CART'           // 장바구니 페이지
  | 'ORDER'          // 주문서 페이지
  | 'MY'             // 마이 페이지
  | 'MEMBERSHIP'     // 멤버십 페이지
  | 'CUSTOMER'       // 고객센터 페이지
  | 'EVENT_LIST'     // 이벤트 리스트 페이지
  | 'EVENT_DETAIL'   // 이벤트 상세 페이지
  | 'LIVE_LIST'      // 라이브 리스트 페이지
  | 'LIVE_DETAIL'    // 라이브 상세 페이지
  | 'HISTORY'        // 히스토리/연혁 페이지 (아모레몰)
  | 'AMORESTORE'     // 아모레스토어 페이지
  | 'BEAUTYFEED'     // 뷰티피드 페이지
  | 'OTHERS';        // 그 외 모두

/**
 * 페이지 컨텍스트 정보
 */
export interface PageContext {
  pageType: PageType;
  url?: string;
  /** 해당 페이지에서 선언되는 변수 목록 */
  declaredVariables: string[];
}

/**
 * URL 패턴으로 페이지 타입을 감지하기 위한 규칙
 */
export interface PageTypeDetectionRule {
  pageType: PageType;
  /** URL 패턴 (정규식) */
  urlPatterns: RegExp[];
  /** URL에 포함되어야 하는 키워드 */
  urlKeywords?: string[];
  /** 페이지 타입 설명 */
  description: string;
}

/**
 * 변수가 선언되는 페이지 타입 매핑
 *
 * @deprecated 이 하드코딩된 매핑은 사용하지 마세요!
 * 대신 GTMPageMappingExtractor를 사용하여 GTM JSON에서 동적으로 추출하세요.
 *
 * @example
 * ```typescript
 * import { GTMPageMappingExtractor } from './analyzers/gtmPageMappingExtractor';
 * const extractor = new GTMPageMappingExtractor('./GTM-xxx.json');
 * const variableMappings = extractor.extractVariablePageMappings();
 * ```
 *
 * 키: GTM 변수명 (예: "{{JS - Promotion Name on Detail Page}}")
 * 값: 해당 변수가 선언되는 페이지 타입 목록
 */
export const VARIABLE_PAGE_MAPPING: Record<string, PageType[]> = {
  // 프로모션/이벤트 관련 변수 - 이벤트 상세 페이지에서만 선언
  '{{JS - Promotion Name on Detail Page}}': ['EVENT_DETAIL'],
  '{{JS - Promotion ID on Detail Page}}': ['EVENT_DETAIL'],
  '{{JS - Promotion Creative on Detail Page}}': ['EVENT_DETAIL'],
  '{{DLV - ecommerce.promotion_name}}': ['EVENT_DETAIL', 'MAIN', 'EVENT_LIST'],
  '{{DLV - ecommerce.promotion_id}}': ['EVENT_DETAIL', 'MAIN', 'EVENT_LIST'],

  // 상품 관련 변수 - 상품 상세 페이지에서 선언
  '{{JS - Product ID on Detail Page}}': ['PRODUCT_DETAIL'],
  '{{JS - Product Name on Detail Page}}': ['PRODUCT_DETAIL'],
  '{{JS - Product Price on Detail Page}}': ['PRODUCT_DETAIL'],
  '{{JS - Product Brand on Detail Page}}': ['PRODUCT_DETAIL'],
  '{{JS - Product Category on Detail Page}}': ['PRODUCT_DETAIL'],
  '{{DLV - ecommerce.items}}': ['PRODUCT_DETAIL', 'PRODUCT_LIST', 'CART', 'ORDER', 'SEARCH_RESULT'],
  '{{DLV - ecommerce.item_id}}': ['PRODUCT_DETAIL'],
  '{{DLV - ecommerce.item_name}}': ['PRODUCT_DETAIL'],

  // 검색 관련 변수 - 검색 결과 페이지에서 선언
  '{{JS - Search Term}}': ['SEARCH_RESULT'],
  '{{DLV - search_term}}': ['SEARCH_RESULT'],
  '{{DLV - ecommerce.search_term}}': ['SEARCH_RESULT'],
  // SRP(Search Results Page) 전용 변수
  '{{JS - View Item List DataLayer}}': ['SEARCH_RESULT'],

  // 장바구니 관련 변수
  '{{JS - Cart Items}}': ['CART'],
  '{{DLV - ecommerce.cart_items}}': ['CART'],

  // 주문 관련 변수
  '{{JS - Order ID}}': ['ORDER'],
  '{{JS - Transaction ID}}': ['ORDER'],
  '{{DLV - ecommerce.transaction_id}}': ['ORDER'],
  '{{DLV - ecommerce.value}}': ['ORDER', 'CART'],

  // 라이브 관련 변수
  '{{JS - Live ID}}': ['LIVE_DETAIL'],
  '{{JS - Live Title}}': ['LIVE_DETAIL'],
  '{{DLV - live_id}}': ['LIVE_DETAIL'],

  // 공통 변수 - 모든 페이지에서 선언
  '{{Page URL}}': ['MAIN', 'BRAND_MAIN', 'PRODUCT_DETAIL', 'PRODUCT_LIST', 'SEARCH_RESULT', 'CART', 'ORDER', 'MY', 'EVENT_LIST', 'EVENT_DETAIL', 'LIVE_LIST', 'LIVE_DETAIL', 'OTHERS'],
  '{{Page Path}}': ['MAIN', 'BRAND_MAIN', 'PRODUCT_DETAIL', 'PRODUCT_LIST', 'SEARCH_RESULT', 'CART', 'ORDER', 'MY', 'EVENT_LIST', 'EVENT_DETAIL', 'LIVE_LIST', 'LIVE_DETAIL', 'OTHERS'],
  '{{Click Element}}': ['MAIN', 'BRAND_MAIN', 'PRODUCT_DETAIL', 'PRODUCT_LIST', 'SEARCH_RESULT', 'CART', 'ORDER', 'MY', 'EVENT_LIST', 'EVENT_DETAIL', 'LIVE_LIST', 'LIVE_DETAIL', 'OTHERS'],
  '{{Click URL}}': ['MAIN', 'BRAND_MAIN', 'PRODUCT_DETAIL', 'PRODUCT_LIST', 'SEARCH_RESULT', 'CART', 'ORDER', 'MY', 'EVENT_LIST', 'EVENT_DETAIL', 'LIVE_LIST', 'LIVE_DETAIL', 'OTHERS'],
  '{{Click Text}}': ['MAIN', 'BRAND_MAIN', 'PRODUCT_DETAIL', 'PRODUCT_LIST', 'SEARCH_RESULT', 'CART', 'ORDER', 'MY', 'EVENT_LIST', 'EVENT_DETAIL', 'LIVE_LIST', 'LIVE_DETAIL', 'OTHERS'],
};

/**
 * 트리거 이름에서 페이지 타입 힌트를 추출하는 매핑
 * 트리거 이름에 포함된 키워드 → 해당 페이지 타입
 *
 * @deprecated GTM 트리거 이름 분석용 fallback입니다.
 * 정확한 이벤트-페이지 매핑은 DevelopmentGuideParser를 사용하세요.
 */
export const TRIGGER_NAME_PAGE_HINTS: Record<string, PageType[]> = {
  'SRP': ['SEARCH_RESULT'],           // Search Results Page
  'Search Result': ['SEARCH_RESULT'],
  'on Detail Page': ['PRODUCT_DETAIL', 'EVENT_DETAIL', 'LIVE_DETAIL'],
  'Product Detail': ['PRODUCT_DETAIL'],
  'Event Detail': ['EVENT_DETAIL'],
  'Live Detail': ['LIVE_DETAIL'],
  // Cart 관련 힌트 - "Add to Cart"는 상품 관련 페이지에서 발생
  'Add to Cart': ['PRODUCT_DETAIL', 'PRODUCT_LIST', 'SEARCH_RESULT', 'CART'],  // 장바구니 담기
  'Remove from Cart': ['CART'],       // 장바구니에서 삭제
  'View Cart': ['CART'],              // 장바구니 조회
  'on Cart Page': ['CART'],           // 장바구니 페이지에서
  'on Cart': ['CART'],                // 장바구니에서
  // Checkout 관련 힌트 - 바로구매는 PRODUCT_DETAIL에서도 가능
  'Begin Checkout': ['CART', 'PRODUCT_DETAIL'],  // 결제 시작 (장바구니 + 바로구매)
  'Checkout': ['CART', 'ORDER', 'PRODUCT_DETAIL'],  // 결제 관련
  'Order': ['ORDER'],
  'My Page': ['MY'],
  'Main': ['MAIN'],
};

/**
 * dataLayer 이벤트명과 페이지 타입 매핑
 * 특정 dataLayer 이벤트가 어느 페이지에서만 push되는지
 *
 * @deprecated 이 하드코딩된 매핑은 사용하지 마세요!
 * 대신 GTMPageMappingExtractor를 사용하여 GTM JSON에서 동적으로 추출하세요.
 *
 * IntegratedEventAnalyzer는 이제 다음 순서로 이벤트-페이지 매핑을 확인합니다:
 * 1. GTMPageMappingExtractor (GTM 트리거 조건 동적 분석)
 * 2. DevelopmentGuideParser (개발가이드 PDF 파싱)
 *
 * @example
 * ```typescript
 * import { GTMPageMappingExtractor } from './analyzers/gtmPageMappingExtractor';
 * const extractor = new GTMPageMappingExtractor('./GTM-xxx.json');
 * const eventMappings = extractor.extractEventPageMappings();
 * // 또는 특정 이벤트 확인
 * const check = extractor.isEventAllowedOnPage('select_item', 'PRODUCT_LIST');
 * ```
 *
 * @see GTMPageMappingExtractor - GTM 트리거에서 페이지 조건 동적 추출
 * @see DevelopmentGuideParser - 개발가이드에서 "이벤트 전송 시점" 파싱
 */
export const DATALAYER_EVENT_PAGE_MAPPING: Record<string, PageType[]> = {
  'search': ['SEARCH_RESULT'],        // search 이벤트는 검색 결과 페이지에서만
  'view_item': ['PRODUCT_DETAIL'],    // view_item은 상품 상세에서만
  'purchase': ['ORDER'],              // purchase는 주문 완료에서만
  'add_to_cart': ['PRODUCT_DETAIL', 'PRODUCT_LIST', 'SEARCH_RESULT', 'CART'],  // 장바구니 추가
  'addcart': ['PRODUCT_DETAIL', 'PRODUCT_LIST', 'SEARCH_RESULT', 'CART'],  // 아모레몰 dataLayer 이벤트
  'begin_checkout': ['CART', 'PRODUCT_DETAIL'],  // 결제 시작: 장바구니 + 상품 상세(바로구매)
};

/**
 * URL 패턴 기반 페이지 타입 감지 규칙
 *
 * ⚠️ 중요: 규칙 순서가 매우 중요합니다!
 * 더 구체적인 규칙이 먼저 매칭되어야 합니다.
 * 예: /display/brand/detail/event는 /display/brand/detail보다 먼저 체크해야 함
 */
export const PAGE_TYPE_DETECTION_RULES: PageTypeDetectionRule[] = [
  // ===============================
  // 1. 가장 구체적인 규칙들 (먼저 체크)
  // ===============================

  // 브랜드 하위 페이지들 (BRAND_MAIN보다 먼저 체크해야 함)
  {
    pageType: 'BRAND_EVENT_LIST',
    urlPatterns: [
      /\/display\/brand\/detail\/event/i,  // 아모레몰 브랜드 이벤트 목록
    ],
    urlKeywords: ['brand', 'event'],
    description: '브랜드 이벤트 목록 페이지'
  },
  {
    pageType: 'BRAND_PRODUCT_LIST',
    urlPatterns: [
      /\/display\/brand\/detail\/all/i,  // 아모레몰 브랜드 전체 상품 목록
      /\/brand\/[^\/]+\/products/i,
      /\/brand\/[^\/]+\/all/i,
    ],
    urlKeywords: ['brand', 'all', 'products'],
    description: '브랜드 상품 목록 페이지'
  },
  {
    pageType: 'BRAND_CUSTOM_ETC',
    urlPatterns: [
      /\/display\/brand\/detail\?[^#]*menuNo=/i,  // 아모레몰 브랜드 커스텀 페이지 (menuNo 파라미터)
    ],
    urlKeywords: ['brand', 'menu'],
    description: '브랜드 커스텀 기타 페이지'
  },

  // 라이브 상세 (라이브 목록보다 먼저)
  {
    pageType: 'LIVE_DETAIL',
    urlPatterns: [
      /\/live\/player/i,         // 아모레몰 라이브 플레이어
      /\/display\/live\/player/i,
      /\/live\/\d+/i,
      /\/live\/[^\/]+\/detail/i,
      /liveNo=/i,
      /sy_id=/i,                 // 아모레몰 라이브 ID 파라미터
    ],
    urlKeywords: ['live', 'player'],
    description: '라이브 상세 페이지'
  },

  // 카테고리 메인 (PRODUCT_LIST보다 먼저)
  {
    pageType: 'CATEGORY_LIST',
    urlPatterns: [
      /\/display\/category\/main/i,  // 아모레몰 카테고리 메인
      /\/category\/main/i,
    ],
    urlKeywords: ['category', 'main'],
    description: '카테고리 메인 페이지'
  },

  // 뷰티피드 (MAIN보다 먼저 - /community/display/main 패턴)
  {
    pageType: 'BEAUTYFEED',
    urlPatterns: [
      /\/community\/display/i,   // 뷰티피드
      /\/beautyfeed/i,
    ],
    urlKeywords: ['community', 'beautyfeed'],
    description: '뷰티피드 페이지'
  },

  // 브랜드 목록 (PRODUCT_LIST보다 먼저 - /display/brand$ 정확히 매칭)
  {
    pageType: 'BRAND_LIST',
    urlPatterns: [
      /\/display\/brand$/i,      // 아모레몰 브랜드 목록 (정확히 /display/brand로 끝남)
      /\/brands$/i,
    ],
    urlKeywords: ['brand'],
    description: '브랜드 목록 페이지'
  },

  // 이벤트 상세 (이벤트 목록보다 먼저)
  {
    pageType: 'EVENT_DETAIL',
    urlPatterns: [
      /\/event\/\d+/i,
      /\/event\/[^\/]+\/detail/i,
      /\/event_detail/i,
      /\/promotion\/\d+/i,
      /\/display\/event_detail/i,
      /planDisplaySn=/i,              // 아모레몰 이벤트 상세 쿼리 파라미터
      /eventNo=/i,
      /promotionNo=/i,
    ],
    urlKeywords: [],
    description: '이벤트 상세 페이지'
  },

  // 멤버십 (MY보다 먼저)
  {
    pageType: 'MEMBERSHIP',
    urlPatterns: [
      /\/membershipPlus/i,       // 아모레몰 멤버십
      /\/membership/i,
    ],
    urlKeywords: ['membership'],
    description: '멤버십 페이지'
  },

  // 히스토리 (일반 규칙보다 먼저)
  {
    pageType: 'HISTORY',
    urlPatterns: [
      /\/display\/history/i,     // 아모레몰 히스토리/연혁 페이지
      /\/history$/i,
      /\/about\/history/i,
      /\/company\/history/i,
    ],
    urlKeywords: ['history'],
    description: '히스토리/연혁 페이지'
  },

  // 아모레스토어 (store 일반 규칙보다 먼저)
  {
    pageType: 'AMORESTORE',
    urlPatterns: [
      /\/store\/foreigner/i,     // 아모레스토어
    ],
    urlKeywords: ['store', 'foreigner'],
    description: '아모레스토어 페이지'
  },

  // 고객센터
  {
    pageType: 'CUSTOMER',
    urlPatterns: [
      /\/cs\//i,                 // 아모레몰 고객센터
      /\/customer/i,
      /\/faq/i,
      /\/help/i,
    ],
    urlKeywords: ['cs', 'customer', 'faq', 'help'],
    description: '고객센터 페이지'
  },

  // ===============================
  // 2. 중간 구체성 규칙들
  // ===============================

  // 브랜드 메인 (브랜드 하위 페이지들 이후에 체크)
  {
    pageType: 'BRAND_MAIN',
    urlPatterns: [
      /\/display\/brand\/detail(?!\/(all|event))/i,  // /all, /event 제외
      /\/brand\/[^\/]+\/main/i,
      /\/store\/display\?storeCode=/i,
      /\/primera$/i,
      /\/sulwhasoo$/i,
      /\/hera$/i,
      /\/iope$/i,
      /\/laneige$/i,
      /\/mamonde$/i,
      /\/innisfree$/i,
      /\/etude$/i,
      /\/espoir$/i,
      /\/aestura$/i,
    ],
    urlKeywords: ['brand', 'store'],
    description: '브랜드 메인 페이지'
  },

  // 상품 상세
  {
    pageType: 'PRODUCT_DETAIL',
    urlPatterns: [
      /\/product\/detail/i,
      /\/product\/\d+/i,
      /\/goods\/\d+/i,
      /\/item\/\d+/i,
      /\/display\/goods/i,
      /productCode=/i,
      /goodsNo=/i,
      /prdtCd=/i,
    ],
    urlKeywords: ['product', 'goods', 'item', 'detail'],
    description: '상품 상세 페이지'
  },

  // 검색 결과
  {
    pageType: 'SEARCH_RESULT',
    urlPatterns: [
      /\/search/i,
      /\/display\/search/i,
      /\?keyword=/i,
      /\?query=/i,
      /\?q=/i,
      /searchKeyword=/i,
    ],
    urlKeywords: ['search', 'keyword', 'query'],
    description: '검색 결과 페이지'
  },

  // 장바구니
  {
    pageType: 'CART',
    urlPatterns: [
      /\/cart/i,
      /\/basket/i,
      /\/bag/i,
    ],
    urlKeywords: ['cart', 'basket', 'bag'],
    description: '장바구니 페이지'
  },

  // 주문서
  {
    pageType: 'ORDER',
    urlPatterns: [
      /\/order/i,
      /\/checkout/i,
      /\/payment/i,
    ],
    urlKeywords: ['order', 'checkout', 'payment'],
    description: '주문서 페이지'
  },

  // 이벤트 리스트
  {
    pageType: 'EVENT_LIST',
    urlPatterns: [
      /\/display\/event$/i,
      /\/event$/i,
      /\/events$/i,
      /\/promotion$/i,
      /\/promotions$/i,
    ],
    urlKeywords: [],
    description: '이벤트 리스트 페이지'
  },

  // 라이브 리스트
  {
    pageType: 'LIVE_LIST',
    urlPatterns: [
      /\/display\/live$/i,
      /\/live$/i,
      /\/lives$/i,
    ],
    urlKeywords: [],
    description: '라이브 리스트 페이지'
  },

  // ===============================
  // 3. 일반적인 규칙들 (마지막에 체크)
  // ===============================

  // 상품 리스트 (가장 일반적인 카테고리/브랜드 패턴)
  {
    pageType: 'PRODUCT_LIST',
    urlPatterns: [
      /\/display\/category(?!\/main)/i,  // /main 제외
      /\/category\/(?!main)/i,           // /main 제외
      /\/products$/i,
      /\/list\.do/i,
      /brandCd=/i,
    ],
    urlKeywords: ['category', 'list', 'products'],
    description: '상품 리스트 페이지'
  },

  // 마이 페이지
  {
    pageType: 'MY',
    urlPatterns: [
      /\/my\//i,                 // /my/ 다음에 뭔가 있어야 함
      /\/mypage/i,
      /\/account/i,
    ],
    urlKeywords: ['my', 'mypage', 'account'],
    description: '마이 페이지'
  },

  // 메인 페이지 (가장 마지막에 체크)
  {
    pageType: 'MAIN',
    urlPatterns: [
      /\/kr\/ko\/display\/main$/i,  // 아모레몰 메인 (정확히 매칭)
      /\/display\/main$/i,
      /\/main\.do$/i,
      /\/Main\.do$/i,
      /^https?:\/\/[^\/]+\/?$/i,  // 루트 URL
    ],
    urlKeywords: ['main', 'index'],
    description: '메인 페이지'
  },
];

/**
 * URL에서 페이지 타입을 감지합니다.
 */
export function detectPageTypeFromUrl(url: string): PageType {
  for (const rule of PAGE_TYPE_DETECTION_RULES) {
    // URL 패턴 매칭
    for (const pattern of rule.urlPatterns) {
      if (pattern.test(url)) {
        return rule.pageType;
      }
    }
  }

  return 'OTHERS';
}

/**
 * 특정 페이지 타입에서 변수가 선언되어 있는지 확인합니다.
 *
 * @param variableName GTM 변수명 (예: "{{JS - Promotion Name on Detail Page}}")
 * @param pageType 현재 페이지 타입
 * @returns 변수가 선언되어 있으면 true, 아니면 false, 매핑에 없으면 undefined
 */
export function isVariableDeclaredOnPage(variableName: string, pageType: PageType): boolean | undefined {
  const allowedPages = VARIABLE_PAGE_MAPPING[variableName];

  if (!allowedPages) {
    // 매핑에 없는 변수는 알 수 없음 - undefined 반환
    return undefined;
  }

  return allowedPages.includes(pageType);
}

/**
 * 특정 페이지에서 선언되는 변수 목록을 반환합니다.
 */
export function getDeclaredVariablesForPage(pageType: PageType): string[] {
  const declaredVariables: string[] = [];

  for (const [variableName, allowedPages] of Object.entries(VARIABLE_PAGE_MAPPING)) {
    if (allowedPages.includes(pageType)) {
      declaredVariables.push(variableName);
    }
  }

  return declaredVariables;
}

/**
 * 페이지 타입에 대한 설명을 반환합니다.
 */
export function getPageTypeDescription(pageType: PageType): string {
  const descriptions: Record<PageType, string> = {
    'MAIN': '메인 페이지',
    'BRAND_MAIN': '브랜드 메인 페이지',
    'BRAND_PRODUCT_LIST': '브랜드 상품 목록 페이지',
    'BRAND_EVENT_LIST': '브랜드 이벤트 목록 페이지',
    'BRAND_CUSTOM_ETC': '브랜드 커스텀 기타 페이지',
    'BRAND_LIST': '브랜드 목록 페이지',
    'PRODUCT_DETAIL': '상품 상세 페이지',
    'PRODUCT_LIST': '상품 리스트 페이지',
    'CATEGORY_LIST': '카테고리 메인 페이지',
    'SEARCH': '검색 레이어 페이지',
    'SEARCH_RESULT': '검색 결과 페이지',
    'CART': '장바구니 페이지',
    'ORDER': '주문서 페이지',
    'MY': '마이 페이지',
    'MEMBERSHIP': '멤버십 페이지',
    'CUSTOMER': '고객센터 페이지',
    'EVENT_LIST': '이벤트 리스트 페이지',
    'EVENT_DETAIL': '이벤트 상세 페이지',
    'LIVE_LIST': '라이브 리스트 페이지',
    'LIVE_DETAIL': '라이브 상세 페이지',
    'HISTORY': '히스토리/연혁 페이지',
    'AMORESTORE': '아모레스토어 페이지',
    'BEAUTYFEED': '뷰티피드 페이지',
    'OTHERS': '기타 페이지',
  };

  return descriptions[pageType] || pageType;
}

/**
 * 페이지 타입 감지 신호 (Signal)
 */
export interface PageTypeSignal {
  source: 'url_pattern' | 'query_param' | 'global_variable' | 'dataLayer' | 'dom_element';
  pageType: PageType;
  confidence: number;  // 0-100
  detail: string;
}

/**
 * 종합 페이지 타입 감지 결과
 */
export interface ComprehensivePageTypeResult {
  pageType: PageType;
  confidence: number;
  signals: PageTypeSignal[];
  /** 신호들 간 불일치 여부 */
  hasConflict: boolean;
  /** 디버깅용 요약 */
  summary: string;
}

/**
 * 전역변수 값을 PageType으로 변환하는 헬퍼 함수
 */
function normalizePageTypeValue(value: string): PageType | undefined {
  const normalizedValue = value.toUpperCase().trim();

  // 직접 매핑
  const validPageTypes: PageType[] = [
    'MAIN', 'BRAND_MAIN', 'BRAND_PRODUCT_LIST', 'BRAND_EVENT_LIST', 'BRAND_CUSTOM_ETC', 'BRAND_LIST',
    'PRODUCT_DETAIL', 'PRODUCT_LIST', 'CATEGORY_LIST', 'SEARCH', 'SEARCH_RESULT',
    'CART', 'ORDER', 'MY', 'MEMBERSHIP', 'CUSTOMER',
    'EVENT_LIST', 'EVENT_DETAIL', 'LIVE_LIST', 'LIVE_DETAIL',
    'HISTORY', 'AMORESTORE', 'BEAUTYFEED', 'OTHERS'
  ];

  if (validPageTypes.includes(normalizedValue as PageType)) {
    return normalizedValue as PageType;
  }

  // 별칭 매핑 (사이트마다 다를 수 있음)
  const aliasMapping: Record<string, PageType> = {
    // 표준 별칭
    'PDP': 'PRODUCT_DETAIL',
    'PLP': 'PRODUCT_LIST',
    'SRP': 'SEARCH_RESULT',
    'SEARCH': 'SEARCH_RESULT',
    'CHECKOUT': 'ORDER',
    'MYPAGE': 'MY',
    'HOME': 'MAIN',
    'INDEX': 'MAIN',
    'PROMOTION': 'EVENT_DETAIL',
    'PROMOTION_DETAIL': 'EVENT_DETAIL',
    'PROMOTION_LIST': 'EVENT_LIST',
    'LIVE': 'LIVE_DETAIL',

    // 아모레몰 AP_DATA_PAGETYPE 값 매핑
    'PRD': 'PRODUCT_DETAIL',           // 상품 상세
    'PRDS': 'PRODUCT_LIST',            // 상품 리스트
    'EVENT': 'EVENT_DETAIL',           // 이벤트 상세
    'EVENTS': 'EVENT_LIST',            // 이벤트 리스트
    'BRAND_PRODUCT_LIST': 'PRODUCT_LIST', // 브랜드 상품 리스트
  };

  return aliasMapping[normalizedValue];
}

/**
 * Playwright Page에서 AP_PAGE_TYPE 전역변수를 읽어 페이지 타입을 감지합니다.
 * 아모레몰에서는 window.AP_PAGE_TYPE 또는 AP_DATA_PAGETYPE 변수로 페이지 타입을 정의합니다.
 *
 * @param page Playwright Page 객체
 * @returns 감지된 PageType 또는 undefined (변수가 없는 경우)
 */
export async function detectPageTypeFromGlobalVariable(page: any): Promise<PageType | undefined> {
  try {
    const pageTypeValue = await page.evaluate(() => {
      // @ts-ignore
      return window.AP_PAGE_TYPE || window.AP_DATA_PAGETYPE || undefined;
    });

    if (!pageTypeValue || typeof pageTypeValue !== 'string') {
      return undefined;
    }

    const result = normalizePageTypeValue(pageTypeValue);
    if (!result) {
      console.log(`[PageType] 알 수 없는 AP_PAGE_TYPE 값: "${pageTypeValue}"`);
    }
    return result;
  } catch (error) {
    // 전역변수 읽기 실패 시 무시
    return undefined;
  }
}

/**
 * Query Parameter 기반 페이지 타입 힌트
 */
const QUERY_PARAM_PAGE_HINTS: Record<string, { pageType: PageType; confidence: number }> = {
  'planDisplaySn': { pageType: 'EVENT_DETAIL', confidence: 90 },
  'eventNo': { pageType: 'EVENT_DETAIL', confidence: 90 },
  'promotionNo': { pageType: 'EVENT_DETAIL', confidence: 90 },
  'productCode': { pageType: 'PRODUCT_DETAIL', confidence: 90 },
  'goodsNo': { pageType: 'PRODUCT_DETAIL', confidence: 90 },
  'itemId': { pageType: 'PRODUCT_DETAIL', confidence: 85 },
  'keyword': { pageType: 'SEARCH_RESULT', confidence: 90 },
  'query': { pageType: 'SEARCH_RESULT', confidence: 90 },
  'q': { pageType: 'SEARCH_RESULT', confidence: 85 },
  'searchWord': { pageType: 'SEARCH_RESULT', confidence: 90 },
  'categoryCode': { pageType: 'PRODUCT_LIST', confidence: 85 },
  'cateCd': { pageType: 'PRODUCT_LIST', confidence: 85 },
  'liveNo': { pageType: 'LIVE_DETAIL', confidence: 90 },
  'orderId': { pageType: 'ORDER', confidence: 85 },
  'orderNo': { pageType: 'ORDER', confidence: 85 },
};

/**
 * URL에서 Query Parameter를 추출합니다.
 */
function extractQueryParams(url: string): Record<string, string> {
  try {
    const urlObj = new URL(url);
    const params: Record<string, string> = {};
    urlObj.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    return params;
  } catch {
    return {};
  }
}

/**
 * Query Parameter에서 페이지 타입 신호를 추출합니다.
 */
function detectPageTypeFromQueryParams(url: string): PageTypeSignal[] {
  const signals: PageTypeSignal[] = [];
  const params = extractQueryParams(url);

  for (const [paramName, hint] of Object.entries(QUERY_PARAM_PAGE_HINTS)) {
    if (params[paramName]) {
      signals.push({
        source: 'query_param',
        pageType: hint.pageType,
        confidence: hint.confidence,
        detail: `Query parameter "${paramName}=${params[paramName]}"`,
      });
    }
  }

  return signals;
}

/**
 * URL 패턴에서 페이지 타입 신호를 추출합니다.
 */
function detectPageTypeSignalFromUrl(url: string): PageTypeSignal | undefined {
  for (const rule of PAGE_TYPE_DETECTION_RULES) {
    for (const pattern of rule.urlPatterns) {
      if (pattern.test(url)) {
        return {
          source: 'url_pattern',
          pageType: rule.pageType,
          confidence: 70,  // URL 패턴만으로는 중간 신뢰도
          detail: `URL matches pattern: ${pattern}`,
        };
      }
    }
  }
  return undefined;
}

/**
 * Playwright Page에서 종합적으로 페이지 정보를 수집합니다.
 */
async function collectPageSignals(page: any, url: string): Promise<{
  globalVars: Record<string, any>;
  dataLayer: any[];
  domHints: Record<string, boolean>;
}> {
  try {
    return await page.evaluate(() => {
      const result: {
        globalVars: Record<string, any>;
        dataLayer: any[];
        domHints: Record<string, boolean>;
      } = {
        globalVars: {},
        dataLayer: [],
        domHints: {},
      };

      // 1. 전역변수 수집
      const globalVarNames = [
        'AP_PAGE_TYPE', 'AP_DATA_PAGETYPE', 'pageType', 'PAGE_TYPE',
        'AP_PRODUCT_ID', 'AP_PRODUCT_NAME', 'AP_CATEGORY_CODE',
        'AP_SEARCH_KEYWORD', 'AP_EVENT_ID', 'AP_PROMOTION_ID',
      ];

      for (const varName of globalVarNames) {
        // @ts-ignore
        if (window[varName] !== undefined) {
          // @ts-ignore
          result.globalVars[varName] = window[varName];
        }
      }

      // 2. dataLayer 수집
      // @ts-ignore
      if (window.dataLayer && Array.isArray(window.dataLayer)) {
        // @ts-ignore
        result.dataLayer = window.dataLayer.slice(-10);  // 최근 10개만
      }

      // 3. DOM 힌트 수집 (특정 페이지 타입에만 존재하는 요소)
      result.domHints = {
        hasProductDetail: !!document.querySelector('[class*="product-detail"], [class*="pdp-"], [data-product-id]'),
        hasProductList: !!document.querySelector('[class*="product-list"], [class*="plp-"], [class*="category-products"]'),
        hasSearchResults: !!document.querySelector('[class*="search-result"], [class*="srp-"], [data-search-term]'),
        hasCart: !!document.querySelector('[class*="cart-"], [class*="basket-"], [data-cart-items]'),
        hasCheckout: !!document.querySelector('[class*="checkout-"], [class*="order-"], [class*="payment-"]'),
        hasPromotion: !!document.querySelector('[class*="promotion-detail"], [class*="event-detail"], [data-promotion-id]'),
        hasLive: !!document.querySelector('[class*="live-detail"], [class*="live-player"], [data-live-id]'),
        hasMainBanner: !!document.querySelector('[class*="main-banner"], [class*="hero-banner"], [class*="key-visual"]'),
      };

      return result;
    });
  } catch (error) {
    return { globalVars: {}, dataLayer: [], domHints: {} };
  }
}

/**
 * 수집된 정보에서 페이지 타입 신호를 추출합니다.
 */
function extractSignalsFromPageData(
  globalVars: Record<string, any>,
  dataLayer: any[],
  domHints: Record<string, boolean>
): PageTypeSignal[] {
  const signals: PageTypeSignal[] = [];

  // 1. 전역변수에서 신호 추출
  for (const [varName, value] of Object.entries(globalVars)) {
    if (varName.includes('PAGE_TYPE') || varName === 'pageType') {
      const pageType = normalizePageTypeValue(String(value));
      if (pageType) {
        signals.push({
          source: 'global_variable',
          pageType,
          confidence: 95,  // 전역변수는 높은 신뢰도
          detail: `${varName} = "${value}"`,
        });
      }
    }

    // 특정 변수 존재 여부로 페이지 타입 추론
    if (varName.includes('PRODUCT_ID') && value) {
      signals.push({
        source: 'global_variable',
        pageType: 'PRODUCT_DETAIL',
        confidence: 80,
        detail: `${varName} 변수 존재`,
      });
    }
    if (varName.includes('SEARCH_KEYWORD') && value) {
      signals.push({
        source: 'global_variable',
        pageType: 'SEARCH_RESULT',
        confidence: 80,
        detail: `${varName} 변수 존재`,
      });
    }
    if ((varName.includes('EVENT_ID') || varName.includes('PROMOTION_ID')) && value) {
      signals.push({
        source: 'global_variable',
        pageType: 'EVENT_DETAIL',
        confidence: 80,
        detail: `${varName} 변수 존재`,
      });
    }
  }

  // 2. dataLayer에서 신호 추출
  for (const item of dataLayer) {
    if (item && typeof item === 'object') {
      // ecommerce 이벤트에서 페이지 타입 추론
      if (item.ecommerce) {
        if (item.ecommerce.detail || item.event === 'view_item') {
          signals.push({
            source: 'dataLayer',
            pageType: 'PRODUCT_DETAIL',
            confidence: 85,
            detail: 'dataLayer에 view_item/detail 이벤트 존재',
          });
        }
        if (item.ecommerce.impressions || item.event === 'view_item_list') {
          signals.push({
            source: 'dataLayer',
            pageType: 'PRODUCT_LIST',
            confidence: 75,
            detail: 'dataLayer에 view_item_list/impressions 이벤트 존재',
          });
        }
        if (item.event === 'view_promotion' && item.ecommerce?.promoView) {
          signals.push({
            source: 'dataLayer',
            pageType: 'MAIN',
            confidence: 70,
            detail: 'dataLayer에 view_promotion 이벤트 존재',
          });
        }
        if (item.event === 'purchase') {
          signals.push({
            source: 'dataLayer',
            pageType: 'ORDER',
            confidence: 90,
            detail: 'dataLayer에 purchase 이벤트 존재',
          });
        }
      }

      // pageType 필드가 직접 있는 경우
      if (item.pageType || item.page_type) {
        const pageType = normalizePageTypeValue(String(item.pageType || item.page_type));
        if (pageType) {
          signals.push({
            source: 'dataLayer',
            pageType,
            confidence: 90,
            detail: `dataLayer.pageType = "${item.pageType || item.page_type}"`,
          });
        }
      }
    }
  }

  // 3. DOM 힌트에서 신호 추출
  if (domHints.hasProductDetail) {
    signals.push({
      source: 'dom_element',
      pageType: 'PRODUCT_DETAIL',
      confidence: 60,
      detail: '상품 상세 DOM 요소 발견',
    });
  }
  if (domHints.hasProductList) {
    signals.push({
      source: 'dom_element',
      pageType: 'PRODUCT_LIST',
      confidence: 60,
      detail: '상품 리스트 DOM 요소 발견',
    });
  }
  if (domHints.hasSearchResults) {
    signals.push({
      source: 'dom_element',
      pageType: 'SEARCH_RESULT',
      confidence: 60,
      detail: '검색 결과 DOM 요소 발견',
    });
  }
  if (domHints.hasCart) {
    signals.push({
      source: 'dom_element',
      pageType: 'CART',
      confidence: 60,
      detail: '장바구니 DOM 요소 발견',
    });
  }
  if (domHints.hasCheckout) {
    signals.push({
      source: 'dom_element',
      pageType: 'ORDER',
      confidence: 60,
      detail: '주문/결제 DOM 요소 발견',
    });
  }
  if (domHints.hasPromotion) {
    signals.push({
      source: 'dom_element',
      pageType: 'EVENT_DETAIL',
      confidence: 60,
      detail: '프로모션/이벤트 DOM 요소 발견',
    });
  }
  if (domHints.hasLive) {
    signals.push({
      source: 'dom_element',
      pageType: 'LIVE_DETAIL',
      confidence: 60,
      detail: '라이브 DOM 요소 발견',
    });
  }
  if (domHints.hasMainBanner) {
    signals.push({
      source: 'dom_element',
      pageType: 'MAIN',
      confidence: 50,
      detail: '메인 배너 DOM 요소 발견',
    });
  }

  return signals;
}

/**
 * 신호들을 종합하여 최종 페이지 타입을 결정합니다.
 *
 * URL 기준과 전역변수 기준이 일치하면 높은 신뢰도를 부여합니다.
 * 이는 두 소스가 같은 값을 가리킬 때 더 확실한 판단이 가능하기 때문입니다.
 */
function determinePageType(signals: PageTypeSignal[]): { pageType: PageType; confidence: number; hasConflict: boolean } {
  if (signals.length === 0) {
    return { pageType: 'OTHERS', confidence: 0, hasConflict: false };
  }

  // URL과 전역변수 신호 분리
  const urlSignal = signals.find(s => s.source === 'url_pattern');
  const globalVarSignal = signals.find(s => s.source === 'global_variable');

  // URL과 전역변수가 일치하면 해당 타입을 높은 신뢰도로 반환
  if (urlSignal && globalVarSignal && urlSignal.pageType === globalVarSignal.pageType) {
    return {
      pageType: urlSignal.pageType,
      confidence: 95,  // 두 소스가 일치하면 매우 높은 신뢰도
      hasConflict: false,
    };
  }

  // 페이지 타입별 점수 계산
  const scores: Record<PageType, number> = {
    'MAIN': 0, 'BRAND_MAIN': 0, 'BRAND_PRODUCT_LIST': 0, 'BRAND_EVENT_LIST': 0, 'BRAND_CUSTOM_ETC': 0, 'BRAND_LIST': 0,
    'PRODUCT_DETAIL': 0, 'PRODUCT_LIST': 0, 'CATEGORY_LIST': 0, 'SEARCH': 0, 'SEARCH_RESULT': 0,
    'CART': 0, 'ORDER': 0, 'MY': 0, 'MEMBERSHIP': 0, 'CUSTOMER': 0,
    'EVENT_LIST': 0, 'EVENT_DETAIL': 0, 'LIVE_LIST': 0, 'LIVE_DETAIL': 0,
    'HISTORY': 0, 'AMORESTORE': 0, 'BEAUTYFEED': 0, 'OTHERS': 0,
  };

  for (const signal of signals) {
    // 전역변수는 가장 높은 가중치 (사이트에서 직접 정의한 값)
    const weight = signal.source === 'global_variable' ? 1.5 : 1.0;
    scores[signal.pageType] += signal.confidence * weight;
  }

  // 가장 높은 점수의 페이지 타입 선택
  let maxScore = 0;
  let bestPageType: PageType = 'OTHERS';
  let secondMaxScore = 0;

  for (const [pageType, score] of Object.entries(scores)) {
    if (score > maxScore) {
      secondMaxScore = maxScore;
      maxScore = score;
      bestPageType = pageType as PageType;
    } else if (score > secondMaxScore) {
      secondMaxScore = score;
    }
  }

  // 불일치 여부 판단
  // URL과 전역변수가 다르면 불일치로 표시 (디버깅용)
  const hasConflict = !!(urlSignal && globalVarSignal &&
    urlSignal.pageType !== globalVarSignal.pageType);

  // 신뢰도 계산 (0-100)
  const maxPossibleScore = signals.length * 100;
  const confidence = Math.min(100, Math.round((maxScore / Math.max(maxPossibleScore, 100)) * 100));

  return { pageType: bestPageType, confidence, hasConflict };
}

/**
 * Playwright Page와 URL을 사용하여 종합적으로 페이지 타입을 감지합니다.
 *
 * 여러 신호를 종합하여 판단:
 * 1. URL 패턴
 * 2. Query Parameters
 * 3. 전역변수 (AP_PAGE_TYPE 등)
 * 4. dataLayer 내용
 * 5. DOM 요소
 *
 * @param page Playwright Page 객체
 * @param url 페이지 URL
 * @returns 종합 페이지 타입 감지 결과
 */
export async function detectPageTypeComprehensive(page: any, url: string): Promise<ComprehensivePageTypeResult> {
  const signals: PageTypeSignal[] = [];

  // 1. URL 패턴에서 신호 수집
  const urlSignal = detectPageTypeSignalFromUrl(url);
  if (urlSignal) {
    signals.push(urlSignal);
  }

  // 2. Query Parameter에서 신호 수집
  const querySignals = detectPageTypeFromQueryParams(url);
  signals.push(...querySignals);

  // 3. Playwright로 페이지 정보 수집 (전역변수, dataLayer, DOM)
  if (page) {
    const pageData = await collectPageSignals(page, url);
    const pageSignals = extractSignalsFromPageData(
      pageData.globalVars,
      pageData.dataLayer,
      pageData.domHints
    );
    signals.push(...pageSignals);
  }

  // 4. 신호 종합하여 최종 결정
  const { pageType, confidence, hasConflict } = determinePageType(signals);

  // 5. 요약 생성
  const signalSummary = signals
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5)
    .map(s => `  - [${s.source}] ${s.pageType} (${s.confidence}%): ${s.detail}`)
    .join('\n');

  const summary = `페이지 타입: ${pageType} (신뢰도: ${confidence}%)${hasConflict ? ' ⚠️ 신호 불일치' : ''}\n신호 목록:\n${signalSummary}`;

  return {
    pageType,
    confidence,
    signals,
    hasConflict,
    summary,
  };
}

/**
 * 모든 페이지 타입 목록을 반환합니다.
 */
export const ALL_PAGE_TYPES: PageType[] = [
  'MAIN',
  'BRAND_MAIN',
  'BRAND_PRODUCT_LIST',
  'BRAND_EVENT_LIST',
  'BRAND_CUSTOM_ETC',
  'BRAND_LIST',
  'PRODUCT_DETAIL',
  'PRODUCT_LIST',
  'CATEGORY_LIST',
  'SEARCH',
  'SEARCH_RESULT',
  'CART',
  'ORDER',
  'MY',
  'MEMBERSHIP',
  'CUSTOMER',
  'EVENT_LIST',
  'EVENT_DETAIL',
  'LIVE_LIST',
  'LIVE_DETAIL',
  'HISTORY',
  'AMORESTORE',
  'BEAUTYFEED',
  'OTHERS',
];
