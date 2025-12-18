/**
 * 이커머스 items[] 파라미터 매핑
 *
 * GTM에서 이커머스 이벤트의 items 배열 내 파라미터가
 * 어떤 데이터 소스에서 오는지 정의합니다.
 */

// ============================================================================
// 인터페이스 정의
// ============================================================================

/** 아이템 파라미터 소스 타입 */
export type ItemSourceType =
  | 'global_variable'     // window.AP_* 전역변수
  | 'global_array'        // window.AP_*_RESULT 배열
  | 'datalayer'           // dataLayer.ecommerce.items
  | 'html_attribute'      // HTML data 속성
  | 'computed';           // GTM JS에서 계산

/** 아이템 파라미터 매핑 */
export interface ItemParamMapping {
  ga4Param: string;           // GA4 items[] 내 파라미터명
  description: string;        // 설명
  sources: {
    event: string;            // 이벤트명
    sourceType: ItemSourceType;
    sourcePath: string;       // 소스 경로 (예: AP_PRD_CODE, items[].code)
    gtmVariable?: string;     // GTM 변수명 (있는 경우)
    transform?: string;       // 변환 로직 설명
  }[];
}

/** 이벤트별 items 소스 */
export interface EventItemsSource {
  eventName: string;
  gtmVariable: string;        // items 배열을 생성하는 GTM 변수
  sourceType: 'global_variable' | 'global_array' | 'datalayer' | 'html_attribute';
  globalVariable?: string;    // 전역변수명 (배열인 경우)
  maxItems?: number;          // 최대 아이템 수 (기본 10)
  description: string;
}

// ============================================================================
// 이커머스 items[] 파라미터 정의
// ============================================================================

/**
 * GA4 표준 items[] 파라미터와 아모레몰 커스텀 파라미터
 */
export const ECOMMERCE_ITEM_PARAMS: ItemParamMapping[] = [
  // === GA4 표준 상품 파라미터 ===
  {
    ga4Param: 'item_id',
    description: '상품 ID (SKU)',
    sources: [
      { event: 'view_item', sourceType: 'global_variable', sourcePath: 'AP_PRD_CODE', gtmVariable: '{{JS - View Item DataLayer}}' },
      { event: 'view_item_list', sourceType: 'global_array', sourcePath: 'AP_SEARCH_PRDRESULT[].code', gtmVariable: '{{JS - View Item List DataLayer}}' },
      { event: 'select_item', sourceType: 'datalayer', sourcePath: 'productInfo.code', gtmVariable: '{{JS - Select Item DataLayer}}' },
      { event: 'add_to_cart', sourceType: 'datalayer', sourcePath: 'ecommerce.items[].item_id', gtmVariable: '{{JS - Add to Cart DataLayer}}' },
      { event: 'remove_from_cart', sourceType: 'datalayer', sourcePath: 'ecommerce.items[].item_id', gtmVariable: '{{JS - Remove From Cart DataLayer}}' },
      { event: 'begin_checkout', sourceType: 'global_array', sourcePath: 'AP_CART_PRDS[].code | AP_ORDER_PRDS[].code', gtmVariable: '{{JS - Begin Checkout DataLayer}}' },
      { event: 'purchase', sourceType: 'global_array', sourcePath: 'AP_PURCHASE_PRDS[].code', gtmVariable: '{{JS - Purchase DataLayer}}' },
    ]
  },
  {
    ga4Param: 'item_name',
    description: '상품명',
    sources: [
      { event: 'view_item', sourceType: 'global_variable', sourcePath: 'AP_PRD_NAME', gtmVariable: '{{JS - View Item DataLayer}}' },
      { event: 'view_item_list', sourceType: 'global_array', sourcePath: 'AP_SEARCH_PRDRESULT[].name', gtmVariable: '{{JS - View Item List DataLayer}}' },
      { event: 'select_item', sourceType: 'datalayer', sourcePath: 'productInfo.name', gtmVariable: '{{JS - Select Item DataLayer}}' },
      { event: 'add_to_cart', sourceType: 'datalayer', sourcePath: 'ecommerce.items[].item_name', gtmVariable: '{{JS - Add to Cart DataLayer}}' },
      { event: 'purchase', sourceType: 'global_array', sourcePath: 'AP_PURCHASE_PRDS[].name', gtmVariable: '{{JS - Purchase DataLayer}}' },
    ]
  },
  {
    ga4Param: 'item_brand',
    description: '상품 브랜드',
    sources: [
      { event: 'view_item', sourceType: 'global_variable', sourcePath: 'AP_PRD_BRAND', gtmVariable: '{{JS - View Item DataLayer}}' },
      { event: 'view_item_list', sourceType: 'global_array', sourcePath: 'AP_SEARCH_PRDRESULT[].brand', gtmVariable: '{{JS - View Item List DataLayer}}' },
      { event: 'select_item', sourceType: 'datalayer', sourcePath: 'productInfo.brand', gtmVariable: '{{JS - Select Item DataLayer}}' },
      { event: 'add_to_cart', sourceType: 'datalayer', sourcePath: 'ecommerce.items[].item_brand', gtmVariable: '{{JS - Add to Cart DataLayer}}' },
      { event: 'purchase', sourceType: 'global_array', sourcePath: 'AP_PURCHASE_PRDS[].brand', gtmVariable: '{{JS - Purchase DataLayer}}' },
    ]
  },
  {
    ga4Param: 'item_category',
    description: '상품 카테고리 1뎁스',
    sources: [
      { event: 'view_item', sourceType: 'global_variable', sourcePath: 'AP_PRD_CATEGORY', gtmVariable: '{{JS - View Item DataLayer}}', transform: 'split("/")[0]' },
      { event: 'view_item_list', sourceType: 'global_array', sourcePath: 'AP_SEARCH_PRDRESULT[].cate', gtmVariable: '{{JS - View Item List DataLayer}}', transform: 'split("/")[0]' },
      { event: 'select_item', sourceType: 'datalayer', sourcePath: 'productInfo.cate', gtmVariable: '{{JS - Select Item DataLayer}}', transform: 'split("/")[0]' },
    ]
  },
  {
    ga4Param: 'item_category2',
    description: '상품 카테고리 2뎁스',
    sources: [
      { event: 'view_item', sourceType: 'global_variable', sourcePath: 'AP_PRD_CATEGORY', gtmVariable: '{{JS - View Item DataLayer}}', transform: 'split("/")[1]' },
      { event: 'view_item_list', sourceType: 'global_array', sourcePath: 'AP_SEARCH_PRDRESULT[].cate', gtmVariable: '{{JS - View Item List DataLayer}}', transform: 'split("/")[1]' },
    ]
  },
  {
    ga4Param: 'item_category3',
    description: '상품 카테고리 3뎁스',
    sources: [
      { event: 'view_item', sourceType: 'global_variable', sourcePath: 'AP_PRD_CATEGORY', gtmVariable: '{{JS - View Item DataLayer}}', transform: 'split("/")[2]' },
      { event: 'view_item_list', sourceType: 'global_array', sourcePath: 'AP_SEARCH_PRDRESULT[].cate', gtmVariable: '{{JS - View Item List DataLayer}}', transform: 'split("/")[2]' },
    ]
  },
  {
    ga4Param: 'item_category4',
    description: '상품 카테고리 4뎁스',
    sources: [
      { event: 'view_item', sourceType: 'global_variable', sourcePath: 'AP_PRD_CATEGORY', gtmVariable: '{{JS - View Item DataLayer}}', transform: 'split("/")[3]' },
      { event: 'view_item_list', sourceType: 'global_array', sourcePath: 'AP_SEARCH_PRDRESULT[].cate', gtmVariable: '{{JS - View Item List DataLayer}}', transform: 'split("/")[3]' },
    ]
  },
  {
    ga4Param: 'item_category5',
    description: '상품 카테고리 5뎁스',
    sources: [
      { event: 'view_item', sourceType: 'global_variable', sourcePath: 'AP_PRD_CATEGORY', gtmVariable: '{{JS - View Item DataLayer}}', transform: 'split("/")[4]' },
      { event: 'view_item_list', sourceType: 'global_array', sourcePath: 'AP_SEARCH_PRDRESULT[].cate', gtmVariable: '{{JS - View Item List DataLayer}}', transform: 'split("/")[4]' },
    ]
  },
  {
    ga4Param: 'item_variant',
    description: '상품 옵션 (색상, 사이즈 등)',
    sources: [
      { event: 'add_to_cart', sourceType: 'datalayer', sourcePath: 'ecommerce.items[].item_variant', gtmVariable: '{{JS - Add to Cart DataLayer}}' },
      { event: 'purchase', sourceType: 'global_array', sourcePath: 'AP_PURCHASE_PRDS[].variant', gtmVariable: '{{JS - Purchase DataLayer}}' },
    ]
  },
  {
    ga4Param: 'price',
    description: '상품 가격 (할인 적용)',
    sources: [
      { event: 'view_item', sourceType: 'global_variable', sourcePath: 'AP_PRD_PRICE', gtmVariable: '{{JS - View Item DataLayer}}', transform: 'parseInt()' },
      { event: 'view_item_list', sourceType: 'global_array', sourcePath: 'AP_SEARCH_PRDRESULT[].price', gtmVariable: '{{JS - View Item List DataLayer}}' },
      { event: 'select_item', sourceType: 'datalayer', sourcePath: 'productInfo.price', gtmVariable: '{{JS - Select Item DataLayer}}' },
      { event: 'add_to_cart', sourceType: 'datalayer', sourcePath: 'ecommerce.items[].price', gtmVariable: '{{JS - Add to Cart DataLayer}}' },
      { event: 'purchase', sourceType: 'global_array', sourcePath: 'AP_PURCHASE_PRDS[].price', gtmVariable: '{{JS - Purchase DataLayer}}' },
    ]
  },
  {
    ga4Param: 'quantity',
    description: '상품 수량',
    sources: [
      { event: 'view_item', sourceType: 'computed', sourcePath: '1', gtmVariable: '{{JS - View Item DataLayer}}' },
      { event: 'add_to_cart', sourceType: 'datalayer', sourcePath: 'ecommerce.items[].quantity', gtmVariable: '{{JS - Add to Cart DataLayer}}' },
      { event: 'purchase', sourceType: 'global_array', sourcePath: 'AP_PURCHASE_PRDS[].quantity', gtmVariable: '{{JS - Purchase DataLayer}}' },
    ]
  },
  {
    ga4Param: 'coupon',
    description: '상품 쿠폰명',
    sources: [
      { event: 'purchase', sourceType: 'global_array', sourcePath: 'AP_PURCHASE_PRDS[].coupon_name', gtmVariable: '{{JS - Purchase DataLayer}}' },
    ]
  },
  {
    ga4Param: 'discount',
    description: '할인 금액',
    sources: [
      { event: 'view_item', sourceType: 'computed', sourcePath: 'AP_PRD_PRDPRICE - AP_PRD_PRICE', gtmVariable: '{{JS - View Item DataLayer}}', transform: 'prdprice - price' },
      { event: 'view_item_list', sourceType: 'computed', sourcePath: 'prdprice - price', gtmVariable: '{{JS - View Item List DataLayer}}' },
      { event: 'select_item', sourceType: 'computed', sourcePath: 'prdprice - price', gtmVariable: '{{JS - Select Item DataLayer}}' },
    ]
  },
  {
    ga4Param: 'index',
    description: '리스트 내 위치 (1-based)',
    sources: [
      { event: 'view_item_list', sourceType: 'computed', sourcePath: 'array index + 1', gtmVariable: '{{JS - View Item List DataLayer}}' },
      { event: 'select_item', sourceType: 'datalayer', sourcePath: 'productInfo.index', gtmVariable: '{{JS - Select Item DataLayer}}' },
    ]
  },
  {
    ga4Param: 'item_list_name',
    description: '상품 리스트 이름',
    sources: [
      { event: 'view_item_list', sourceType: 'computed', sourcePath: '"SEARCH" | 페이지 타입', gtmVariable: '{{JS - View Item List DataLayer}}' },
      { event: 'select_item', sourceType: 'datalayer', sourcePath: 'productInfo.item_list_name', gtmVariable: '{{JS - Select Item DataLayer}}' },
    ]
  },
  {
    ga4Param: 'item_list_id',
    description: '상품 리스트 ID',
    sources: [
      { event: 'view_item_list', sourceType: 'computed', sourcePath: '페이지 URL 기반', gtmVariable: '{{JS - View Item List DataLayer}}' },
    ]
  },

  // === 프로모션 관련 파라미터 ===
  {
    ga4Param: 'promotion_id',
    description: '프로모션 ID',
    sources: [
      { event: 'view_promotion', sourceType: 'html_attribute', sourcePath: 'data-ap-promotion', gtmVariable: '{{DL - Promotion ID}}' },
      { event: 'select_promotion', sourceType: 'html_attribute', sourcePath: 'data-ap-promotion', gtmVariable: '{{DL - Promotion ID}}' },
    ]
  },
  {
    ga4Param: 'promotion_name',
    description: '프로모션 이름',
    sources: [
      { event: 'view_promotion', sourceType: 'html_attribute', sourcePath: 'data-ap-promotion-nm', gtmVariable: '{{DL - Promotion Name}}' },
      { event: 'select_promotion', sourceType: 'html_attribute', sourcePath: 'data-ap-promotion-nm', gtmVariable: '{{DL - Promotion Name}}' },
    ]
  },
  {
    ga4Param: 'creative_name',
    description: '광고 소재 이름',
    sources: [
      { event: 'view_promotion', sourceType: 'html_attribute', sourcePath: 'data-ap-creative', gtmVariable: '{{DL - Creative Name}}' },
      { event: 'select_promotion', sourceType: 'html_attribute', sourcePath: 'data-ap-creative', gtmVariable: '{{DL - Creative Name}}' },
    ]
  },
  {
    ga4Param: 'creative_slot',
    description: '광고 게재 위치',
    sources: [
      { event: 'view_promotion', sourceType: 'html_attribute', sourcePath: 'data-ap-cslot', gtmVariable: '{{DL - Creative Slot}}' },
      { event: 'select_promotion', sourceType: 'html_attribute', sourcePath: 'data-ap-cslot', gtmVariable: '{{DL - Creative Slot}}' },
    ]
  },
  {
    ga4Param: 'location_id',
    description: '광고 위치 ID',
    sources: [
      { event: 'view_promotion', sourceType: 'html_attribute', sourcePath: 'data-ap-location', gtmVariable: '{{DL - Location ID}}' },
    ]
  },

  // === 아모레몰 커스텀 파라미터 ===
  {
    ga4Param: 'apg_brand_code',
    description: 'APG 브랜드 코드',
    sources: [
      { event: 'view_item', sourceType: 'global_variable', sourcePath: 'AP_PRD_APGBRCODE', gtmVariable: '{{JS - View Item DataLayer}}' },
      { event: 'view_item_list', sourceType: 'global_array', sourcePath: 'AP_SEARCH_PRDRESULT[].apg_brand_code', gtmVariable: '{{JS - View Item List DataLayer}}' },
      { event: 'select_item', sourceType: 'datalayer', sourcePath: 'productInfo.apg_brand_code', gtmVariable: '{{JS - Select Item DataLayer}}' },
    ]
  },
  {
    ga4Param: 'internal_brand_code',
    description: '내부 브랜드 코드',
    sources: [
      { event: 'view_item', sourceType: 'global_variable', sourcePath: 'AP_PRD_INTERBRCODE', gtmVariable: '{{JS - View Item DataLayer}}' },
      { event: 'view_item_list', sourceType: 'global_array', sourcePath: 'AP_SEARCH_PRDRESULT[].internal_brand_code', gtmVariable: '{{JS - View Item List DataLayer}}' },
      { event: 'select_item', sourceType: 'datalayer', sourcePath: 'productInfo.internal_brand_code', gtmVariable: '{{JS - Select Item DataLayer}}' },
    ]
  },
  {
    ga4Param: 'original_price',
    description: '정가 (할인 전)',
    sources: [
      { event: 'view_item', sourceType: 'global_variable', sourcePath: 'AP_PRD_PRDPRICE', gtmVariable: '{{JS - View Item DataLayer}}', transform: 'parseInt()' },
      { event: 'view_item_list', sourceType: 'global_array', sourcePath: 'AP_SEARCH_PRDRESULT[].prdprice', gtmVariable: '{{JS - View Item List DataLayer}}' },
      { event: 'select_item', sourceType: 'datalayer', sourcePath: 'productInfo.prdprice', gtmVariable: '{{JS - Select Item DataLayer}}' },
    ]
  },
];

// ============================================================================
// 이벤트별 items 배열 소스
// ============================================================================

/**
 * 이벤트별로 items 배열이 어디서 오는지 정의
 */
export const EVENT_ITEMS_SOURCES: EventItemsSource[] = [
  {
    eventName: 'view_item',
    gtmVariable: '{{JS - View Item DataLayer}}',
    sourceType: 'global_variable',
    globalVariable: 'AP_PRD_*',
    maxItems: 1,
    description: '상품 상세 페이지의 전역변수에서 단일 상품 정보 생성'
  },
  {
    eventName: 'view_item_list',
    gtmVariable: '{{JS - View Item List DataLayer}}',
    sourceType: 'global_array',
    globalVariable: 'AP_SEARCH_PRDRESULT',
    maxItems: 10,
    description: '검색/리스트 결과 배열에서 상위 10개 상품 추출'
  },
  {
    eventName: 'select_item',
    gtmVariable: '{{JS - Select Item DataLayer}}',
    sourceType: 'datalayer',
    globalVariable: 'DL - Product Info',
    maxItems: 1,
    description: 'dataLayer.push로 전달된 클릭 상품 정보'
  },
  {
    eventName: 'add_to_cart',
    gtmVariable: '{{JS - Add to Cart DataLayer}}',
    sourceType: 'datalayer',
    maxItems: 10,
    description: 'dataLayer.ecommerce.items에서 추가된 상품 정보'
  },
  {
    eventName: 'remove_from_cart',
    gtmVariable: '{{JS - Remove From Cart DataLayer}}',
    sourceType: 'datalayer',
    maxItems: 10,
    description: 'dataLayer.ecommerce.items에서 삭제된 상품 정보'
  },
  {
    eventName: 'view_cart',
    gtmVariable: '{{JS - View Cart DataLayer}}',
    sourceType: 'global_array',
    globalVariable: 'AP_CART_PRDS',
    maxItems: 50,
    description: '장바구니 전역변수에서 상품 목록'
  },
  {
    eventName: 'begin_checkout',
    gtmVariable: '{{JS - Begin Checkout DataLayer}}',
    sourceType: 'global_array',
    globalVariable: 'AP_CART_PRDS | AP_ORDER_PRDS',
    maxItems: 50,
    description: '장바구니/주문서 전역변수에서 상품 목록'
  },
  {
    eventName: 'add_shipping_info',
    gtmVariable: '{{JS - Checkout DataLayer}}',
    sourceType: 'global_array',
    globalVariable: 'AP_ORDER_PRDS',
    maxItems: 50,
    description: '주문서 전역변수에서 상품 목록'
  },
  {
    eventName: 'add_payment_info',
    gtmVariable: '{{JS - Checkout DataLayer}}',
    sourceType: 'global_array',
    globalVariable: 'AP_ORDER_PRDS',
    maxItems: 50,
    description: '주문서 전역변수에서 상품 목록'
  },
  {
    eventName: 'purchase',
    gtmVariable: '{{JS - Purchase DataLayer}}',
    sourceType: 'global_array',
    globalVariable: 'AP_PURCHASE_PRDS',
    maxItems: 100,
    description: '구매 완료 전역변수에서 상품 목록'
  },
  {
    eventName: 'refund',
    gtmVariable: '{{JS - Refund DataLayer}}',
    sourceType: 'global_array',
    globalVariable: 'AP_REFUND_PRDS',
    maxItems: 100,
    description: '환불 전역변수에서 상품 목록'
  },
  {
    eventName: 'view_promotion',
    gtmVariable: '{{JS - View Promotion DataLayer}}',
    sourceType: 'html_attribute',
    maxItems: 10,
    description: 'HTML data 속성에서 프로모션 정보 추출'
  },
  {
    eventName: 'select_promotion',
    gtmVariable: '{{JS - Select Promotion DataLayer}}',
    sourceType: 'html_attribute',
    maxItems: 1,
    description: '클릭된 프로모션 요소의 data 속성'
  },
];

// ============================================================================
// 이벤트별 개별 파라미터 (items 외)
// ============================================================================

export interface EventSpecificParam {
  ga4Param: string;
  description: string;
  gtmVariable: string;
  sourceType: ItemSourceType;
  sourcePath: string;
}

/**
 * 이벤트별 개별 파라미터 (공통 파라미터 + items 외)
 *
 * GTM 태그에서 직접 추출한 실제 파라미터 목록 (2024-12 기준)
 */
export const EVENT_SPECIFIC_PARAMS: Record<string, EventSpecificParam[]> = {
  // ============================================================================
  // 이커머스 이벤트
  // ============================================================================
  'view_item': [
    { ga4Param: 'event_category', description: '이벤트 카테고리', gtmVariable: '{{DL - Event Category}}', sourceType: 'datalayer', sourcePath: 'event_category' },
    { ga4Param: 'event_action', description: '이벤트 액션', gtmVariable: '{{DL - Event Action}}', sourceType: 'datalayer', sourcePath: 'event_action' },
    { ga4Param: 'currency', description: '통화 코드', gtmVariable: '{{JS - Currency}}', sourceType: 'global_variable', sourcePath: 'AP_ECOMM_CURRENCY' },
    { ga4Param: 'product_id', description: '상품 ID', gtmVariable: '{{JS - Product Id}}', sourceType: 'global_variable', sourcePath: 'AP_PRD_CODE' },
    { ga4Param: 'product_name', description: '상품명', gtmVariable: '{{JS - Product Name}}', sourceType: 'global_variable', sourcePath: 'AP_PRD_NAME' },
    { ga4Param: 'product_brandcode', description: '브랜드 코드', gtmVariable: '{{JS - Product Brandcode}}', sourceType: 'global_variable', sourcePath: 'AP_PRD_APGBRCODE' },
    { ga4Param: 'product_brandname', description: '브랜드명', gtmVariable: '{{JS - Product Brandname}}', sourceType: 'global_variable', sourcePath: 'AP_PRD_BRAND' },
    { ga4Param: 'product_category', description: '상품 카테고리', gtmVariable: '{{JS - Product Category}}', sourceType: 'global_variable', sourcePath: 'AP_PRD_CATEGORY' },
    { ga4Param: 'product_is_stock', description: '재고 여부', gtmVariable: '{{JS - Product Is Stock}}', sourceType: 'global_variable', sourcePath: 'AP_PRD_ISSTOCK' },
    { ga4Param: 'product_is_pacific', description: '퍼시픽 상품 여부', gtmVariable: '{{JS - Product Is Pacific}}', sourceType: 'global_variable', sourcePath: 'AP_PRD_ISPAC' },
    { ga4Param: 'product_pagecode', description: '페이지 코드', gtmVariable: '{{JS - Product Pagecode}}', sourceType: 'global_variable', sourcePath: 'AP_PRD_PAGECODE' },
    { ga4Param: 'product_sn', description: '상품 시리얼', gtmVariable: '{{JS - Product Sn}}', sourceType: 'global_variable', sourcePath: 'AP_PRD_SN' },
  ],
  'view_item_list': [
    { ga4Param: 'event_category', description: '이벤트 카테고리', gtmVariable: '{{DL - Event Category}}', sourceType: 'datalayer', sourcePath: 'event_category' },
    { ga4Param: 'event_action', description: '이벤트 액션', gtmVariable: '{{DL - Event Action}}', sourceType: 'datalayer', sourcePath: 'event_action' },
    { ga4Param: 'item_list_name', description: '리스트 이름', gtmVariable: '{{JS - Item List Name}}', sourceType: 'computed', sourcePath: '페이지 타입 기반' },
    { ga4Param: 'currency', description: '통화 코드', gtmVariable: '{{JS - Currency}}', sourceType: 'global_variable', sourcePath: 'AP_ECOMM_CURRENCY' },
    { ga4Param: 'search_term', description: '검색어', gtmVariable: '{{JS - Search Term}}', sourceType: 'global_variable', sourcePath: 'AP_SEARCH_TERM' },
    { ga4Param: 'search_mod_term', description: '수정된 검색어', gtmVariable: '{{JS - Search Mod Term}}', sourceType: 'global_variable', sourcePath: 'AP_SEARCH_MODTERM' },
    { ga4Param: 'search_result', description: '검색 성공 여부', gtmVariable: '{{JS - Search Result}}', sourceType: 'global_variable', sourcePath: 'AP_SEARCH_RESULT' },
    { ga4Param: 'search_mod_result', description: '수정 검색 성공 여부', gtmVariable: '{{JS - Search Mod Result}}', sourceType: 'global_variable', sourcePath: 'AP_SEARCH_MODRESULT' },
    { ga4Param: 'search_resultcount', description: '검색 결과 수', gtmVariable: '{{JS - Search Total Count}}', sourceType: 'global_variable', sourcePath: 'AP_SEARCH_NUM' },
    { ga4Param: 'search_type', description: '검색 유형', gtmVariable: '{{JS - Search Type}}', sourceType: 'global_variable', sourcePath: 'AP_SEARCH_TYPE' },
  ],
  'select_item': [
    { ga4Param: 'event_category', description: '이벤트 카테고리', gtmVariable: '{{DL - Event Category}}', sourceType: 'datalayer', sourcePath: 'event_category' },
    { ga4Param: 'event_action', description: '이벤트 액션', gtmVariable: '{{DL - Event Action}}', sourceType: 'datalayer', sourcePath: 'event_action' },
    { ga4Param: 'event_label', description: '이벤트 라벨', gtmVariable: '{{DL - Event Label}}', sourceType: 'datalayer', sourcePath: 'event_label' },
    { ga4Param: 'currency', description: '통화 코드', gtmVariable: '{{JS - Currency}}', sourceType: 'global_variable', sourcePath: 'AP_ECOMM_CURRENCY' },
    { ga4Param: 'bt_note_date', description: '뷰티 테스터 노트 날짜', gtmVariable: '{{DL - BT Note Date}}', sourceType: 'datalayer', sourcePath: 'bt_note_date' },
  ],
  'add_to_cart': [
    { ga4Param: 'event_category', description: '이벤트 카테고리', gtmVariable: '{{DL - Event Category}}', sourceType: 'datalayer', sourcePath: 'event_category' },
    { ga4Param: 'event_action', description: '이벤트 액션', gtmVariable: '{{DL - Event Action}}', sourceType: 'datalayer', sourcePath: 'event_action' },
    { ga4Param: 'currency', description: '통화 코드', gtmVariable: '{{JS - Currency}}', sourceType: 'global_variable', sourcePath: 'AP_ECOMM_CURRENCY' },
  ],
  'begin_checkout': [
    { ga4Param: 'event_category', description: '이벤트 카테고리', gtmVariable: '{{DL - Event Category}}', sourceType: 'datalayer', sourcePath: 'event_category' },
    { ga4Param: 'event_action', description: '이벤트 액션', gtmVariable: '{{DL - Event Action}}', sourceType: 'datalayer', sourcePath: 'event_action' },
    { ga4Param: 'event_label', description: '이벤트 라벨', gtmVariable: '{{DL - Event Label}}', sourceType: 'datalayer', sourcePath: 'event_label' },
    { ga4Param: 'currency', description: '통화 코드', gtmVariable: '{{JS - Currency}}', sourceType: 'global_variable', sourcePath: 'AP_ECOMM_CURRENCY' },
    { ga4Param: 'checkout_step', description: '체크아웃 단계', gtmVariable: '{{DL - Checkout Step}}', sourceType: 'datalayer', sourcePath: 'checkout_step' },
    { ga4Param: 'checkout_seq', description: '체크아웃 순서', gtmVariable: '{{DL - Checkout Seq}}', sourceType: 'datalayer', sourcePath: 'checkout_seq' },
  ],
  'purchase': [
    { ga4Param: 'event_category', description: '이벤트 카테고리', gtmVariable: '{{DL - Event Category}}', sourceType: 'datalayer', sourcePath: 'event_category' },
    { ga4Param: 'event_action', description: '이벤트 액션', gtmVariable: '{{DL - Event Action}}', sourceType: 'datalayer', sourcePath: 'event_action' },
    { ga4Param: 'transaction_id', description: '주문번호', gtmVariable: '{{JS - Purchase Order Number}}', sourceType: 'global_variable', sourcePath: 'AP_PURCHASE_ORDERNUM' },
    { ga4Param: 'value', description: '주문 금액', gtmVariable: '{{JS - Purchase Value}}', sourceType: 'global_variable', sourcePath: 'AP_PURCHASE_PRICE' },
    { ga4Param: 'currency', description: '통화 코드', gtmVariable: '{{JS - Currency}}', sourceType: 'global_variable', sourcePath: 'AP_ECOMM_CURRENCY' },
    { ga4Param: 'tax', description: '세금', gtmVariable: '{{JS - Purchase Tax}}', sourceType: 'global_variable', sourcePath: 'AP_PURCHASE_TAX' },
    { ga4Param: 'shipping', description: '배송비', gtmVariable: '{{JS - Purchase Shipping}}', sourceType: 'global_variable', sourcePath: 'AP_PURCHASE_SHIPPING' },
    { ga4Param: 'coupon', description: '주문 쿠폰', gtmVariable: '{{JS - Purchase Coupon Name}}', sourceType: 'global_variable', sourcePath: 'AP_PURCHASE_COUPONNAME' },
    { ga4Param: 'order_method', description: '결제 방법', gtmVariable: '{{JS - Order Method}}', sourceType: 'global_variable', sourcePath: 'AP_ORDER_PAYMETHOD' },
    { ga4Param: 'order_total_amount', description: '총 결제금액', gtmVariable: '{{JS - Order Total Amount}}', sourceType: 'global_variable', sourcePath: 'AP_ORDER_TOTALAMT' },
    { ga4Param: 'order_total_discount', description: '총 할인금액', gtmVariable: '{{JS - Order Total Discount}}', sourceType: 'global_variable', sourcePath: 'AP_ORDER_TOTALDIS' },
    { ga4Param: 'order_coupon_code', description: '쿠폰 코드', gtmVariable: '{{JS - Order Coupon Code}}', sourceType: 'global_variable', sourcePath: 'AP_ORDER_COUPONCODE' },
    { ga4Param: 'order_coupon_discount', description: '쿠폰 할인액', gtmVariable: '{{JS - Order Coupon Discount}}', sourceType: 'global_variable', sourcePath: 'AP_ORDER_COUPONDIS' },
    { ga4Param: 'order_member_discount', description: '회원 할인액', gtmVariable: '{{JS - Order Member Discount}}', sourceType: 'global_variable', sourcePath: 'AP_ORDER_MEMBERDIS' },
    { ga4Param: 'order_mobile_discount', description: '모바일 할인액', gtmVariable: '{{JS - Order Mobile Discount}}', sourceType: 'global_variable', sourcePath: 'AP_ORDER_MOBILEDIS' },
    { ga4Param: 'order_beauty_discount', description: '뷰티포인트 사용액', gtmVariable: '{{JS - Order Beauty Discount}}', sourceType: 'global_variable', sourcePath: 'AP_ORDER_BEAUTYDIS' },
    { ga4Param: 'order_beauty_accumulated', description: '뷰티포인트 적립액', gtmVariable: '{{JS - Order Beauty Accumulated}}', sourceType: 'global_variable', sourcePath: 'AP_ORDER_BEAUTYACC' },
    { ga4Param: 'order_giftcard_amount', description: '상품권 사용액', gtmVariable: '{{JS - Order Giftcard Amount}}', sourceType: 'global_variable', sourcePath: 'AP_ORDER_GIFTCARD' },
  ],
  'view_promotion': [
    { ga4Param: 'event_category', description: '이벤트 카테고리', gtmVariable: '{{DL - Event Category}}', sourceType: 'datalayer', sourcePath: 'event_category' },
    { ga4Param: 'event_action', description: '이벤트 액션', gtmVariable: '{{DL - Event Action}}', sourceType: 'datalayer', sourcePath: 'event_action' },
  ],
  'select_promotion': [
    { ga4Param: 'event_category', description: '이벤트 카테고리', gtmVariable: '{{DL - Event Category}}', sourceType: 'datalayer', sourcePath: 'event_category' },
    { ga4Param: 'event_action', description: '이벤트 액션', gtmVariable: '{{DL - Event Action}}', sourceType: 'datalayer', sourcePath: 'event_action' },
    { ga4Param: 'event_label', description: '이벤트 라벨', gtmVariable: '{{DL - Event Label}}', sourceType: 'datalayer', sourcePath: 'event_label' },
  ],

  // ============================================================================
  // 기본 이벤트
  // ============================================================================
  'login': [
    { ga4Param: 'event_category', description: '이벤트 카테고리', gtmVariable: '{{DL - Event Category}}', sourceType: 'datalayer', sourcePath: 'event_category' },
    { ga4Param: 'event_action', description: '이벤트 액션', gtmVariable: '{{DL - Event Action}}', sourceType: 'datalayer', sourcePath: 'event_action' },
    { ga4Param: 'event_label', description: '이벤트 라벨', gtmVariable: '{{DL - Event Label}}', sourceType: 'datalayer', sourcePath: 'event_label' },
    { ga4Param: 'method', description: '로그인 방법', gtmVariable: '{{DL - Event Label with customEvent}}', sourceType: 'datalayer', sourcePath: 'event_label' },
  ],
  'sign_up': [
    { ga4Param: 'event_category', description: '이벤트 카테고리', gtmVariable: '{{DL - Event Category}}', sourceType: 'datalayer', sourcePath: 'event_category' },
    { ga4Param: 'event_action', description: '이벤트 액션', gtmVariable: '{{DL - Event Action}}', sourceType: 'datalayer', sourcePath: 'event_action' },
    { ga4Param: 'event_label', description: '이벤트 라벨', gtmVariable: '{{DL - Event Label}}', sourceType: 'datalayer', sourcePath: 'event_label' },
    { ga4Param: 'method', description: '가입 방법', gtmVariable: '{{DL - Event Label with customEvent}}', sourceType: 'datalayer', sourcePath: 'event_label' },
  ],
  'withdrawal': [
    { ga4Param: 'event_category', description: '이벤트 카테고리', gtmVariable: '{{DL - Event Category}}', sourceType: 'datalayer', sourcePath: 'event_category' },
    { ga4Param: 'event_action', description: '이벤트 액션', gtmVariable: '{{DL - Event Action}}', sourceType: 'datalayer', sourcePath: 'event_action' },
    { ga4Param: 'event_label', description: '이벤트 라벨', gtmVariable: '{{DL - Event Label}}', sourceType: 'datalayer', sourcePath: 'event_label' },
    { ga4Param: 'reason', description: '탈퇴 사유', gtmVariable: '{{DL - Event Label with customEvent}}', sourceType: 'datalayer', sourcePath: 'event_label' },
  ],
  'view_search_results': [
    { ga4Param: 'event_category', description: '이벤트 카테고리', gtmVariable: '{{DL - Event Category}}', sourceType: 'datalayer', sourcePath: 'event_category' },
    { ga4Param: 'event_action', description: '이벤트 액션', gtmVariable: '{{DL - Event Action}}', sourceType: 'datalayer', sourcePath: 'event_action' },
    { ga4Param: 'event_label', description: '이벤트 라벨', gtmVariable: '{{DL - Event Label}}', sourceType: 'datalayer', sourcePath: 'event_label' },
    { ga4Param: 'search_term', description: '검색어', gtmVariable: '{{JS - Search Term}}', sourceType: 'global_variable', sourcePath: 'AP_SEARCH_TERM' },
    { ga4Param: 'search_mod_term', description: '수정된 검색어', gtmVariable: '{{JS - Search Mod Term}}', sourceType: 'global_variable', sourcePath: 'AP_SEARCH_MODTERM' },
    { ga4Param: 'search_result', description: '검색 성공 여부', gtmVariable: '{{JS - Search Result}}', sourceType: 'global_variable', sourcePath: 'AP_SEARCH_RESULT' },
    { ga4Param: 'search_mod_result', description: '수정 검색 성공 여부', gtmVariable: '{{JS - Search Mod Result}}', sourceType: 'global_variable', sourcePath: 'AP_SEARCH_MODRESULT' },
    { ga4Param: 'search_resultcount', description: '검색 결과 수', gtmVariable: '{{JS - Search Total Count}}', sourceType: 'global_variable', sourcePath: 'AP_SEARCH_NUM' },
    { ga4Param: 'search_type', description: '검색 유형', gtmVariable: '{{JS - Search Type}}', sourceType: 'global_variable', sourcePath: 'AP_SEARCH_TYPE' },
  ],
  'scroll': [
    { ga4Param: 'event_category', description: '이벤트 카테고리', gtmVariable: '{{DL - Event Category}}', sourceType: 'datalayer', sourcePath: 'event_category' },
    { ga4Param: 'event_action', description: '이벤트 액션', gtmVariable: '{{DL - Event Action}}', sourceType: 'datalayer', sourcePath: 'event_action' },
    { ga4Param: 'event_label', description: '이벤트 라벨', gtmVariable: '{{DL - Event Label}}', sourceType: 'datalayer', sourcePath: 'event_label' },
    { ga4Param: 'percent_scrolled', description: '스크롤 비율', gtmVariable: '{{Scroll Depth Threshold}}', sourceType: 'computed', sourcePath: 'GTM 내장' },
  ],

  // ============================================================================
  // 커스텀 이벤트 (클릭/액션)
  // ============================================================================
  'ap_click': [
    { ga4Param: 'event_category', description: '이벤트 카테고리', gtmVariable: '{{DL - Event Category}}', sourceType: 'datalayer', sourcePath: 'event_category' },
    { ga4Param: 'event_action', description: '이벤트 액션', gtmVariable: '{{DL - Event Action}}', sourceType: 'datalayer', sourcePath: 'event_action' },
    { ga4Param: 'event_label', description: '이벤트 라벨', gtmVariable: '{{DL - Event Label}}', sourceType: 'datalayer', sourcePath: 'event_label' },
    { ga4Param: 'click_text', description: '클릭 텍스트', gtmVariable: '{{DL - Click Text}}', sourceType: 'html_attribute', sourcePath: 'ap-click-text' },
    { ga4Param: 'click_url', description: '클릭 URL', gtmVariable: '{{DL - Click URL}}', sourceType: 'html_attribute', sourcePath: 'ap-click-url' },
    { ga4Param: 'click_area', description: '클릭 영역', gtmVariable: '{{DL - Click Area}}', sourceType: 'html_attribute', sourcePath: 'ap-click-area' },
    { ga4Param: 'click_name', description: '클릭 이름', gtmVariable: '{{DL - Click Name}}', sourceType: 'html_attribute', sourcePath: 'ap-click-name' },
    { ga4Param: 'event_param1', description: '커스텀 파라미터 1', gtmVariable: '{{DL - Event Param1}}', sourceType: 'datalayer', sourcePath: 'event_param1' },
    { ga4Param: 'event_param2', description: '커스텀 파라미터 2', gtmVariable: '{{DL - Event Param2}}', sourceType: 'datalayer', sourcePath: 'event_param2' },
    { ga4Param: 'event_param3', description: '커스텀 파라미터 3', gtmVariable: '{{DL - Event Param3}}', sourceType: 'datalayer', sourcePath: 'event_param3' },
  ],
  // ============================================================================
  // custom_event (기본 파라미터만 - 상세 파라미터는 customEventRegistry.ts에서 관리)
  // GTM에서 custom_event는 39개 태그로 분리되어 있으며, event_action에 따라 파라미터가 다름
  // 상세 파라미터 조회: import { getCustomEventParams } from './customEventRegistry'
  // ============================================================================
  'custom_event': [
    { ga4Param: 'event_category', description: '이벤트 카테고리', gtmVariable: '{{DL - Event Category}}', sourceType: 'datalayer', sourcePath: 'event_category' },
    { ga4Param: 'event_action', description: '이벤트 액션', gtmVariable: '{{DL - Event Action}}', sourceType: 'datalayer', sourcePath: 'event_action' },
    { ga4Param: 'event_label', description: '이벤트 라벨', gtmVariable: '{{DL - Event Label}}', sourceType: 'datalayer', sourcePath: 'event_label' },
  ],
  'write_review': [
    { ga4Param: 'event_category', description: '이벤트 카테고리', gtmVariable: '{{DL - Event Category}}', sourceType: 'datalayer', sourcePath: 'event_category' },
    { ga4Param: 'event_action', description: '이벤트 액션', gtmVariable: '{{DL - Event Action}}', sourceType: 'datalayer', sourcePath: 'event_action' },
    { ga4Param: 'event_label', description: '이벤트 라벨', gtmVariable: '{{DL - Event Label}}', sourceType: 'datalayer', sourcePath: 'event_label' },
    { ga4Param: 'review_type', description: '리뷰 유형', gtmVariable: '{{DL - Review Type}}', sourceType: 'datalayer', sourcePath: 'review_type' },
    { ga4Param: 'review_product_code', description: '리뷰 상품 코드', gtmVariable: '{{DL - Review Product Code}}', sourceType: 'datalayer', sourcePath: 'review_product_code' },
    { ga4Param: 'review_product_name', description: '리뷰 상품명', gtmVariable: '{{DL - Review Product Name}}', sourceType: 'datalayer', sourcePath: 'review_product_name' },
    { ga4Param: 'review_product_content', description: '리뷰 내용', gtmVariable: '{{DL - Review Product Content}}', sourceType: 'datalayer', sourcePath: 'review_product_content' },
    { ga4Param: 'review_product_picture', description: '리뷰 사진 유무', gtmVariable: '{{DL - Review Product Picture}}', sourceType: 'datalayer', sourcePath: 'review_product_picture' },
    { ga4Param: 'review_product_rating', description: '리뷰 평점', gtmVariable: '{{DL - Review Product Rating}}', sourceType: 'datalayer', sourcePath: 'review_product_rating' },
  ],
  'view_promotion_detail': [
    { ga4Param: 'event_category', description: '이벤트 카테고리', gtmVariable: '{{DL - Event Category}}', sourceType: 'datalayer', sourcePath: 'event_category' },
    { ga4Param: 'event_action', description: '이벤트 액션', gtmVariable: '{{DL - Event Action}}', sourceType: 'datalayer', sourcePath: 'event_action' },
    { ga4Param: 'event_label', description: '이벤트 라벨', gtmVariable: '{{DL - Event Label}}', sourceType: 'datalayer', sourcePath: 'event_label' },
    { ga4Param: 'view_event_code', description: '이벤트 코드', gtmVariable: '{{JS - Event Code}}', sourceType: 'global_variable', sourcePath: 'AP_EVENT_CODE' },
    { ga4Param: 'view_event_name', description: '이벤트명', gtmVariable: '{{JS - Event Name}}', sourceType: 'global_variable', sourcePath: 'AP_EVENT_NAME' },
    { ga4Param: 'view_event_brand', description: '이벤트 브랜드', gtmVariable: '{{JS - Event Brand}}', sourceType: 'global_variable', sourcePath: 'AP_EVENT_BRAND' },
  ],

  // ============================================================================
  // 신규 커스텀 이벤트
  // ============================================================================
  'naverpay': [
    { ga4Param: 'event_category', description: '이벤트 카테고리', gtmVariable: '{{DL - Event Category}}', sourceType: 'datalayer', sourcePath: 'event_category' },
    { ga4Param: 'event_action', description: '이벤트 액션', gtmVariable: '{{DL - Event Action}}', sourceType: 'datalayer', sourcePath: 'event_action' },
    { ga4Param: 'event_label', description: '이벤트 라벨', gtmVariable: '{{DL - Event Label}}', sourceType: 'datalayer', sourcePath: 'event_label' },
    { ga4Param: 'naverpay_option', description: '네이버페이 옵션', gtmVariable: '{{DL - Naverpay Option}}', sourceType: 'datalayer', sourcePath: 'naverpay_option' },
    { ga4Param: 'naverpay_quantity', description: '네이버페이 수량', gtmVariable: '{{DL - Naverpay Quantity}}', sourceType: 'datalayer', sourcePath: 'naverpay_quantity' },
    { ga4Param: 'naverpay_revenue', description: '네이버페이 매출', gtmVariable: '{{DL - Naverpay Revenue}}', sourceType: 'datalayer', sourcePath: 'naverpay_revenue' },
    { ga4Param: 'order_method', description: '결제 방법', gtmVariable: '{{JS - Order Method}}', sourceType: 'global_variable', sourcePath: 'AP_ORDER_PAYMETHOD' },
  ],
  'live': [
    { ga4Param: 'event_category', description: '이벤트 카테고리', gtmVariable: '{{DL - Event Category}}', sourceType: 'datalayer', sourcePath: 'event_category' },
    { ga4Param: 'event_action', description: '이벤트 액션', gtmVariable: '{{DL - Event Action}}', sourceType: 'datalayer', sourcePath: 'event_action' },
    { ga4Param: 'event_label', description: '이벤트 라벨', gtmVariable: '{{DL - Event Label}}', sourceType: 'datalayer', sourcePath: 'event_label' },
    { ga4Param: 'live_id', description: '라이브 ID', gtmVariable: '{{DL - Live Id}}', sourceType: 'datalayer', sourcePath: 'live_id' },
    { ga4Param: 'live_name', description: '라이브명', gtmVariable: '{{DL - Live Name}}', sourceType: 'datalayer', sourcePath: 'live_name' },
    { ga4Param: 'live_type', description: '라이브 유형', gtmVariable: '{{DL - Live Type}}', sourceType: 'datalayer', sourcePath: 'live_type' },
  ],
  'beauty_tester': [
    { ga4Param: 'event_category', description: '이벤트 카테고리', gtmVariable: '{{DL - Event Category}}', sourceType: 'datalayer', sourcePath: 'event_category' },
    { ga4Param: 'event_action', description: '이벤트 액션', gtmVariable: '{{DL - Event Action}}', sourceType: 'datalayer', sourcePath: 'event_action' },
    { ga4Param: 'event_label', description: '이벤트 라벨', gtmVariable: '{{DL - Event Label}}', sourceType: 'datalayer', sourcePath: 'event_label' },
  ],
  'brand_store': [
    { ga4Param: 'event_category', description: '이벤트 카테고리', gtmVariable: '{{DL - Event Category}}', sourceType: 'datalayer', sourcePath: 'event_category' },
    { ga4Param: 'event_action', description: '이벤트 액션', gtmVariable: '{{DL - Event Action}}', sourceType: 'datalayer', sourcePath: 'event_action' },
    { ga4Param: 'event_label', description: '이벤트 라벨', gtmVariable: '{{DL - Event Label}}', sourceType: 'datalayer', sourcePath: 'event_label' },
  ],
  'brand_product_click': [
    { ga4Param: 'event_category', description: '이벤트 카테고리', gtmVariable: '{{DL - Event Category}}', sourceType: 'datalayer', sourcePath: 'event_category' },
    { ga4Param: 'event_action', description: '이벤트 액션', gtmVariable: '{{DL - Event Action}}', sourceType: 'datalayer', sourcePath: 'event_action' },
    { ga4Param: 'event_label', description: '이벤트 라벨', gtmVariable: '{{DL - Event Label}}', sourceType: 'datalayer', sourcePath: 'event_label' },
    { ga4Param: 'product_id', description: '상품 ID', gtmVariable: '{{DL - Product Id}}', sourceType: 'datalayer', sourcePath: 'product_id' },
    { ga4Param: 'product_name', description: '상품명', gtmVariable: '{{DL - Product Name}}', sourceType: 'datalayer', sourcePath: 'product_name' },
    { ga4Param: 'product_brandname', description: '브랜드명', gtmVariable: '{{DL - Product Brandname}}', sourceType: 'datalayer', sourcePath: 'product_brandname' },
  ],
  'click_with_duration': [
    { ga4Param: 'click_duration_0', description: '0% 스크롤 체류시간', gtmVariable: '{{JS - Duration Array 0}}', sourceType: 'global_variable', sourcePath: 'window.durationArray[0]' },
    { ga4Param: 'click_duration_10', description: '10% 스크롤 체류시간', gtmVariable: '{{JS - Duration Array 1}}', sourceType: 'global_variable', sourcePath: 'window.durationArray[1]' },
    { ga4Param: 'click_duration_20', description: '20% 스크롤 체류시간', gtmVariable: '{{JS - Duration Array 2}}', sourceType: 'global_variable', sourcePath: 'window.durationArray[2]' },
    { ga4Param: 'click_duration_30', description: '30% 스크롤 체류시간', gtmVariable: '{{JS - Duration Array 3}}', sourceType: 'global_variable', sourcePath: 'window.durationArray[3]' },
    { ga4Param: 'click_duration_40', description: '40% 스크롤 체류시간', gtmVariable: '{{JS - Duration Array 4}}', sourceType: 'global_variable', sourcePath: 'window.durationArray[4]' },
    { ga4Param: 'click_duration_50', description: '50% 스크롤 체류시간', gtmVariable: '{{JS - Duration Array 5}}', sourceType: 'global_variable', sourcePath: 'window.durationArray[5]' },
    { ga4Param: 'click_duration_60', description: '60% 스크롤 체류시간', gtmVariable: '{{JS - Duration Array 6}}', sourceType: 'global_variable', sourcePath: 'window.durationArray[6]' },
    { ga4Param: 'click_duration_70', description: '70% 스크롤 체류시간', gtmVariable: '{{JS - Duration Array 7}}', sourceType: 'global_variable', sourcePath: 'window.durationArray[7]' },
    { ga4Param: 'click_duration_80', description: '80% 스크롤 체류시간', gtmVariable: '{{JS - Duration Array 8}}', sourceType: 'global_variable', sourcePath: 'window.durationArray[8]' },
    { ga4Param: 'click_duration_90', description: '90% 스크롤 체류시간', gtmVariable: '{{JS - Duration Array 9}}', sourceType: 'global_variable', sourcePath: 'window.durationArray[9]' },
    { ga4Param: 'click_duration_100', description: '100% 스크롤 체류시간', gtmVariable: '{{JS - Duration Array 10}}', sourceType: 'global_variable', sourcePath: 'window.durationArray[10]' },
  ],
  'page_load_time': [
    { ga4Param: 'loading_time_sec', description: '페이지 로딩 시간(초)', gtmVariable: '{{JS - Page Load Time}}', sourceType: 'computed', sourcePath: 'performance.timing 기반' },
  ],
  'campaign_details': [
    { ga4Param: 'campaign', description: '캠페인명', gtmVariable: '{{URL - utm_campaign}}', sourceType: 'computed', sourcePath: 'URL 파라미터' },
    { ga4Param: 'campaign_id', description: '캠페인 ID', gtmVariable: '{{URL - utm_id}}', sourceType: 'computed', sourcePath: 'URL 파라미터' },
    { ga4Param: 'source', description: '소스', gtmVariable: '{{URL - utm_source}}', sourceType: 'computed', sourcePath: 'URL 파라미터' },
    { ga4Param: 'medium', description: '매체', gtmVariable: '{{URL - utm_medium}}', sourceType: 'computed', sourcePath: 'URL 파라미터' },
    { ga4Param: 'term', description: '검색어', gtmVariable: '{{URL - utm_term}}', sourceType: 'computed', sourcePath: 'URL 파라미터' },
    { ga4Param: 'content', description: '콘텐츠', gtmVariable: '{{URL - utm_content}}', sourceType: 'computed', sourcePath: 'URL 파라미터' },
  ],
  'qualified_visit': [
    { ga4Param: 'event_category', description: '이벤트 카테고리', gtmVariable: '{{DL - Event Category}}', sourceType: 'datalayer', sourcePath: 'event_category' },
    { ga4Param: 'event_action', description: '이벤트 액션', gtmVariable: '{{DL - Event Action}}', sourceType: 'datalayer', sourcePath: 'event_action' },
    { ga4Param: 'event_label', description: '이벤트 라벨', gtmVariable: '{{DL - Event Label}}', sourceType: 'datalayer', sourcePath: 'event_label' },
  ],
};

// ============================================================================
// 유틸리티 함수
// ============================================================================

/**
 * 특정 이벤트에서 사용되는 items[] 파라미터 목록 반환
 */
export function getItemParamsForEvent(eventName: string): ItemParamMapping[] {
  return ECOMMERCE_ITEM_PARAMS.filter(param =>
    param.sources.some(s => s.event === eventName)
  );
}

/**
 * 특정 이벤트의 items 소스 정보 반환
 */
export function getEventItemsSource(eventName: string): EventItemsSource | undefined {
  return EVENT_ITEMS_SOURCES.find(s => s.eventName === eventName);
}

/**
 * 특정 이벤트의 개별 파라미터 목록 반환
 */
export function getEventSpecificParams(eventName: string): EventSpecificParam[] {
  return EVENT_SPECIFIC_PARAMS[eventName] || [];
}

/**
 * 이커머스 이벤트 여부 확인
 */
export function isEcommerceEvent(eventName: string): boolean {
  return EVENT_ITEMS_SOURCES.some(s => s.eventName === eventName);
}

/**
 * 모든 이벤트의 items[] 파라미터 목록
 */
export function getAllItemParams(): string[] {
  return [...new Set(ECOMMERCE_ITEM_PARAMS.map(p => p.ga4Param))];
}

/**
 * 모든 이벤트별 개별 파라미터 목록
 */
export function getAllEventSpecificParams(): { event: string; param: string }[] {
  const result: { event: string; param: string }[] = [];
  for (const [event, params] of Object.entries(EVENT_SPECIFIC_PARAMS)) {
    for (const param of params) {
      result.push({ event, param: param.ga4Param });
    }
  }
  return result;
}
