/**
 * 아모레몰 이벤트 메타데이터 설정
 *
 * 하이브리드 방식:
 * - 시나리오 에이전트: 사전 지식 기반으로 시나리오 생성
 * - Vision AI: 보조 검증 (요소 가시성, 상태 확인)
 */

import {
  EventMetadata,
  SiteEventConfig,
  EventFireType,
  TriggerCondition,
  RequiredVariable,
  VisionHint,
  ScenarioStep,
} from '../types/eventMetadata';

/**
 * 페이지 타입별 자동 발생 이벤트 정의
 *
 * 참고: GTM에서 CUSTOM_EVENT 타입이라도 페이지 로드 시 자동으로
 * dataLayer.push가 발생하면 autoFire로 분류
 */
export const AUTO_FIRE_EVENTS_BY_PAGE: Record<string, string[]> = {
  'MAIN': ['view_promotion', 'page_view', 'qualified_visit'],
  'PRODUCT_DETAIL': ['view_item', 'view_promotion', 'page_view'],
  'PRODUCT_LIST': ['view_item_list', 'page_view'],
  'BRAND_MAIN': ['view_item_list', 'page_view'],
  'SEARCH_RESULT': ['view_search_results', 'view_item_list', 'page_view'],
  'CART': ['view_cart', 'page_view'],
  'ORDER': ['begin_checkout', 'page_view'],
  'ORDER_COMPLETE': ['purchase', 'page_view'],
  'EVENT_DETAIL': ['view_promotion', 'page_view'],
  'EVENT_LIST': ['view_promotion', 'view_item_list', 'page_view'],
  'MY': ['page_view'],
  'LOGIN': ['page_view'],
  'SIGNUP': ['page_view'],
  'SIGNUP_COMPLETE': ['sign_up', 'page_view'],
};

/**
 * 페이지 타입별 사용자 액션 이벤트 정의
 */
export const USER_ACTION_EVENTS_BY_PAGE: Record<string, string[]> = {
  'MAIN': ['select_promotion', 'ap_click', 'scroll', 'click_with_duration', 'login', 'custom_event'],
  'PRODUCT_DETAIL': ['add_to_cart', 'select_promotion', 'ap_click', 'scroll'],
  'PRODUCT_LIST': ['select_item', 'ap_click'],
  'BRAND_MAIN': ['select_item', 'ap_click'],
  'SEARCH_RESULT': ['select_item', 'ap_click'],
  'CART': ['remove_from_cart', 'begin_checkout', 'ap_click'],
  'ORDER': ['ap_click'],
  'EVENT_DETAIL': ['select_item', 'select_promotion', 'ap_click', 'scroll'],
  'EVENT_LIST': ['select_promotion', 'ap_click'],
  'LOGIN': ['login', 'ap_click'],
  'SIGNUP': ['ap_click'],
};

/**
 * 이벤트별 dataLayer 트리거 이벤트명 매핑
 */
export const DATALAYER_EVENT_MAPPING: Record<string, string[]> = {
  'view_item': ['product'],
  'view_item_list': ['search'],
  'view_search_results': ['search'],
  'add_to_cart': ['addcart'],
  'remove_from_cart': ['Remove'],
  'begin_checkout': ['cart', 'purchasecartbtn', 'purchaseprdbtn', 'purchaseplpbtn', 'order', 'orderbtn'],
  'purchase': ['purchase'],
  'select_item': ['select_item'],
  'select_promotion': [], // CSS selector trigger
  'view_promotion': [], // DOM_READY trigger
  'login': ['login_complete'],
  'sign_up': ['sign_up_complete'],
  'ap_click': ['commonEvent'],
  'scroll': [], // SCROLL_DEPTH trigger
  // 추가된 이벤트
  'click_with_duration': ['click_with_duration'], // 클릭 후 체류시간 측정
  'custom_event': ['customEvent'], // 범용 커스텀 이벤트
  'qualified_visit': ['qualified_visit'], // 캠페인 한정 이벤트 (쿠키 조건부)
};

/**
 * 이벤트별 CSS 셀렉터 트리거
 */
export const CSS_SELECTOR_TRIGGERS: Record<string, string[]> = {
  'select_promotion': ['a[ap-data-promotion]', '[ap-data-promotion]'],
  'select_item': ['a[ap-prd-id]', '[ap-prd-id]', '.prd-item a', '.product-item a'],
  'ap_click': ['[ap-click-area]', '[ap-click-area] *'],
  'add_to_cart': ['button.btn-cart', '.btn-add-cart', '[ap-click-name*="cart"]', '.add-to-cart'],
  'remove_from_cart': ['button.btn-delete', '.cart-delete', '[ap-click-name*="삭제"]'],
  'begin_checkout': ['button.btn-order', '.btn-checkout', '[ap-click-name*="주문"]', '.order-btn'],
  'brand_product_click': ['[ap-prd-id]'],
};

/**
 * 이벤트별 필요 AP_ 변수 정의
 */
export const REQUIRED_VARIABLES: Record<string, RequiredVariable[]> = {
  'view_item': [
    { paramName: 'currency', apVariables: ['AP_CURRENCY'], required: true, description: '통화 코드' },
    { paramName: 'value', apVariables: ['AP_PRD_PRICE'], required: true, description: '상품 가격' },
    { paramName: 'product_id', apVariables: ['AP_PRD_ID'], required: true, description: '상품 ID' },
    { paramName: 'product_name', apVariables: ['AP_PRD_NAME'], required: true, description: '상품명' },
    { paramName: 'product_brandname', apVariables: ['AP_PRD_BRANDNAME'], required: true, description: '브랜드명' },
    { paramName: 'product_brandcode', apVariables: ['AP_PRD_APGBRCODE'], required: false, description: '브랜드 코드' },
    { paramName: 'product_category', apVariables: ['AP_PRD_CATENAME', 'AP_PRD_CATEGORY'], required: false, description: '카테고리' },
  ],
  'view_item_list': [
    { paramName: 'item_list_id', apVariables: ['AP_ITEM_LIST_ID', 'AP_LIST_ID'], required: false, description: '목록 ID' },
    { paramName: 'item_list_name', apVariables: ['AP_ITEM_LIST_NAME', 'AP_LIST_NAME'], required: false, description: '목록 이름' },
    { paramName: 'brand_name', apVariables: ['AP_DATA_BRANDNAME'], required: false, description: '브랜드명' },
    { paramName: 'search_term', apVariables: ['AP_SEARCH_KEYWORD', 'AP_DATA_SEARCHKEYWORD'], required: false, description: '검색어' },
    { paramName: 'search_result', apVariables: ['AP_SEARCH_NUM', 'AP_DATA_SEARCHCOUNT'], required: false, description: '검색 결과 수' },
  ],
  'view_search_results': [
    { paramName: 'search_term', apVariables: ['AP_SEARCH_KEYWORD', 'AP_DATA_SEARCHKEYWORD'], required: true, description: '검색어' },
    { paramName: 'search_result', apVariables: ['AP_SEARCH_NUM', 'AP_DATA_SEARCHCOUNT'], required: true, description: '검색 결과 수' },
    { paramName: 'search_type', apVariables: ['AP_SEARCH_TYPE'], required: false, description: '검색 유형' },
  ],
  'add_to_cart': [
    { paramName: 'currency', apVariables: ['AP_CURRENCY'], required: true, description: '통화 코드' },
    { paramName: 'value', apVariables: ['AP_PRD_PRICE'], required: true, description: '상품 가격' },
    { paramName: 'items', apVariables: ['AP_CART_ITEMS'], required: true, description: '장바구니 상품 목록' },
  ],
  'begin_checkout': [
    { paramName: 'currency', apVariables: ['AP_CURRENCY'], required: true, description: '통화 코드' },
    { paramName: 'value', apVariables: ['AP_CHECKOUT_TOTAL', 'AP_CART_TOTAL'], required: true, description: '결제 금액' },
    { paramName: 'checkout_step', apVariables: ['AP_CHECKOUT_STEP'], required: false, description: '결제 단계' },
    { paramName: 'items', apVariables: ['AP_CHECKOUT_ITEMS'], required: true, description: '결제 상품 목록' },
  ],
  'view_cart': [
    { paramName: 'currency', apVariables: ['AP_CURRENCY'], required: true, description: '통화 코드' },
    { paramName: 'value', apVariables: ['AP_CART_TOTAL'], required: true, description: '장바구니 총액' },
    { paramName: 'items', apVariables: ['AP_CART_ITEMS'], required: true, description: '장바구니 상품 목록' },
  ],
  'purchase': [
    { paramName: 'transaction_id', apVariables: ['AP_ORDER_ID', 'AP_TRANSACTION_ID'], required: true, description: '주문 번호' },
    { paramName: 'value', apVariables: ['AP_ORDER_TOTAL', 'AP_PURCHASE_VALUE'], required: true, description: '결제 금액' },
    { paramName: 'currency', apVariables: ['AP_CURRENCY'], required: true, description: '통화 코드' },
    { paramName: 'items', apVariables: ['AP_ORDER_ITEMS'], required: true, description: '주문 상품 목록' },
  ],
  'select_item': [
    { paramName: 'item_id', apVariables: ['AP_SELECT_PRD_ID'], required: true, description: '선택 상품 ID' },
    { paramName: 'item_name', apVariables: ['AP_SELECT_PRD_NAME'], required: false, description: '선택 상품명' },
    { paramName: 'item_list_name', apVariables: ['AP_LIST_NAME', 'AP_ITEM_LIST_NAME'], required: false, description: '목록 이름' },
  ],
  'select_promotion': [
    { paramName: 'promotion_id', apVariables: ['AP_PROMO_ID'], required: true, description: '프로모션 ID', fallbackSource: 'DOM', fallbackExtractor: { type: 'selector', value: 'a[ap-data-promotion]' } },
    { paramName: 'promotion_name', apVariables: ['AP_PROMO_NAME'], required: false, description: '프로모션명' },
    { paramName: 'creative_name', apVariables: ['AP_PROMO_CREATIVE'], required: false, description: '크리에이티브명' },
  ],
  'view_promotion': [
    { paramName: 'items', apVariables: ['AP_VIEW_PROMO_ITEMS'], required: true, description: '프로모션 목록', fallbackSource: 'DOM', fallbackExtractor: { type: 'selector', value: '[ap-data-promotion]' } },
  ],
  'login': [
    { paramName: 'method', apVariables: ['AP_LOGIN_METHOD'], required: false, description: '로그인 방법' },
    { paramName: 'event_category', apVariables: [], required: true, description: '이벤트 카테고리', defaultValue: 'login' },
    { paramName: 'event_action', apVariables: [], required: true, description: '이벤트 액션', defaultValue: 'login complete' },
    { paramName: 'event_label', apVariables: ['DL_EVENT_LABEL'], required: false, description: '이벤트 레이블', dataLayerKey: 'event_label' },
    { paramName: 'event_time_kst', apVariables: ['JS_EVENT_TIME_KST'], required: false, description: '이벤트 발생 시간 (KST)' },
  ],
  'sign_up': [
    { paramName: 'method', apVariables: ['AP_SIGNUP_METHOD'], required: false, description: '가입 방법' },
  ],
  // 추가된 이벤트 파라미터 정의
  'click_with_duration': [
    { paramName: 'click_duration_0', apVariables: ['DL_DURATION_0'], required: false, description: '0% 도달 시 체류시간', dataLayerKey: 'duration.depth_0' },
    { paramName: 'click_duration_10', apVariables: ['DL_DURATION_10'], required: false, description: '10% 도달 시 체류시간', dataLayerKey: 'duration.depth_10' },
    { paramName: 'click_duration_20', apVariables: ['DL_DURATION_20'], required: false, description: '20% 도달 시 체류시간', dataLayerKey: 'duration.depth_20' },
    { paramName: 'click_duration_30', apVariables: ['DL_DURATION_30'], required: false, description: '30% 도달 시 체류시간', dataLayerKey: 'duration.depth_30' },
    { paramName: 'click_duration_40', apVariables: ['DL_DURATION_40'], required: false, description: '40% 도달 시 체류시간', dataLayerKey: 'duration.depth_40' },
    { paramName: 'click_duration_50', apVariables: ['DL_DURATION_50'], required: false, description: '50% 도달 시 체류시간', dataLayerKey: 'duration.depth_50' },
    { paramName: 'click_duration_60', apVariables: ['DL_DURATION_60'], required: false, description: '60% 도달 시 체류시간', dataLayerKey: 'duration.depth_60' },
    { paramName: 'click_duration_70', apVariables: ['DL_DURATION_70'], required: false, description: '70% 도달 시 체류시간', dataLayerKey: 'duration.depth_70' },
    { paramName: 'click_duration_80', apVariables: ['DL_DURATION_80'], required: false, description: '80% 도달 시 체류시간', dataLayerKey: 'duration.depth_80' },
    { paramName: 'click_duration_90', apVariables: ['DL_DURATION_90'], required: false, description: '90% 도달 시 체류시간', dataLayerKey: 'duration.depth_90' },
    { paramName: 'click_duration_100', apVariables: ['DL_DURATION_100'], required: false, description: '100% 도달 시 체류시간', dataLayerKey: 'duration.depth_100' },
  ],
  'custom_event': [
    { paramName: 'event_category', apVariables: ['DL_EVENT_CATEGORY'], required: true, description: '이벤트 카테고리', dataLayerKey: 'event_category' },
    { paramName: 'event_action', apVariables: ['DL_EVENT_ACTION'], required: true, description: '이벤트 액션', dataLayerKey: 'event_action' },
    { paramName: 'event_label', apVariables: ['DL_EVENT_LABEL'], required: false, description: '이벤트 레이블', dataLayerKey: 'event_label' },
    { paramName: 'event_param1', apVariables: ['DL_EVENT_PARAM1'], required: false, description: '커스텀 파라미터 1', dataLayerKey: 'event_param1' },
    { paramName: 'event_param2', apVariables: ['DL_EVENT_PARAM2'], required: false, description: '커스텀 파라미터 2', dataLayerKey: 'event_param2' },
    { paramName: 'event_param3', apVariables: ['DL_EVENT_PARAM3'], required: false, description: '커스텀 파라미터 3', dataLayerKey: 'event_param3' },
  ],
  'qualified_visit': [
    { paramName: 'event_category', apVariables: [], required: true, description: '이벤트 카테고리', defaultValue: 'qualified_visit' },
    { paramName: 'event_action', apVariables: ['DL_EVENT_ACTION'], required: false, description: '이벤트 액션', dataLayerKey: 'event_action' },
    { paramName: 'event_label', apVariables: ['DL_EVENT_LABEL'], required: false, description: '이벤트 레이블', dataLayerKey: 'event_label' },
  ],
};

/**
 * Vision AI 검증 힌트
 */
export const VISION_HINTS: Record<string, VisionHint[]> = {
  'add_to_cart': [
    {
      elementDescription: '장바구니 담기 버튼',
      expectedLocation: 'main',
      checkState: { checkEnabled: true, checkVisible: true },
      disabledConditions: ['품절', '일시품절', 'SOLD OUT'],
    },
    {
      elementDescription: '수량 선택 옵션',
      expectedLocation: 'main',
      checkState: { checkVisible: true },
    },
  ],
  'select_promotion': [
    {
      elementDescription: '프로모션 배너',
      expectedLocation: 'main',
      checkState: { checkVisible: true },
    },
  ],
  'begin_checkout': [
    {
      elementDescription: '주문하기 버튼',
      expectedLocation: 'main',
      checkState: { checkEnabled: true, checkVisible: true },
    },
    {
      elementDescription: '상품 체크박스 선택 상태',
      expectedLocation: 'main',
      checkState: { checkEnabled: true },
    },
  ],
  'login': [
    {
      elementDescription: '로그인 버튼',
      expectedLocation: 'main',
      checkState: { checkEnabled: true, checkVisible: true },
    },
    {
      elementDescription: '아이디/비밀번호 입력 필드',
      expectedLocation: 'main',
      checkState: { checkVisible: true },
    },
  ],
};

/**
 * 시나리오 템플릿 정의
 */
export const SCENARIO_TEMPLATES: Record<string, ScenarioStep[]> = {
  'add_to_cart': [
    { order: 1, action: 'navigate', target: 'PRODUCT_DETAIL_URL', description: '상품 상세 페이지로 이동' },
    { order: 2, action: 'wait', waitTime: 2000, description: '페이지 로딩 대기' },
    { order: 3, action: 'capture', captureVariables: ['AP_PRD_ID', 'AP_PRD_NAME', 'AP_PRD_PRICE'], description: '상품 정보 캡처' },
    { order: 4, action: 'click', target: 'button.btn-cart, .add-to-cart, [ap-click-name*="cart"]', description: '장바구니 버튼 클릭' },
    { order: 5, action: 'wait', waitTime: 1000, description: '이벤트 발생 대기' },
    { order: 6, action: 'assert', description: 'dataLayer에서 addcart 이벤트 확인' },
  ],
  'select_item': [
    { order: 1, action: 'navigate', target: 'LIST_PAGE_URL', description: '목록 페이지로 이동' },
    { order: 2, action: 'wait', waitTime: 2000, description: '페이지 로딩 대기' },
    { order: 3, action: 'scroll', description: '상품 목록이 보이도록 스크롤' },
    { order: 4, action: 'click', target: 'a[ap-prd-id], .product-item a', description: '상품 클릭' },
    { order: 5, action: 'wait', waitTime: 1000, description: '이벤트 발생 대기' },
    { order: 6, action: 'assert', description: 'dataLayer에서 select_item 이벤트 확인' },
  ],
  'select_promotion': [
    { order: 1, action: 'navigate', target: 'PAGE_WITH_PROMOTION', description: '프로모션이 있는 페이지로 이동' },
    { order: 2, action: 'wait', waitTime: 2000, description: '페이지 로딩 대기' },
    { order: 3, action: 'scroll', description: '프로모션 배너가 보이도록 스크롤' },
    { order: 4, action: 'click', target: 'a[ap-data-promotion]', description: '프로모션 배너 클릭' },
    { order: 5, action: 'wait', waitTime: 1000, description: '이벤트 발생 대기' },
    { order: 6, action: 'assert', description: 'dataLayer에서 이벤트 확인 (CSS selector 기반)' },
  ],
  'begin_checkout': [
    { order: 1, action: 'navigate', target: 'CART_PAGE_URL', description: '장바구니 페이지로 이동' },
    { order: 2, action: 'wait', waitTime: 2000, description: '페이지 로딩 대기' },
    { order: 3, action: 'click', target: 'button.btn-order, .btn-checkout', description: '주문하기 버튼 클릭' },
    { order: 4, action: 'wait', waitTime: 1000, description: '이벤트 발생 대기' },
    { order: 5, action: 'assert', description: 'dataLayer에서 begin_checkout 관련 이벤트 확인' },
  ],
};

/**
 * 전체 이벤트 메타데이터 목록 생성
 */
export function createEventMetadataList(): EventMetadata[] {
  const events: EventMetadata[] = [];

  // view_item
  events.push({
    eventName: 'view_item',
    displayName: '상품 상세 조회',
    description: '상품 상세 페이지에서 자동 발생',
    fireType: 'autoFire',
    pageTypes: ['PRODUCT_DETAIL'],
    requiredVariables: REQUIRED_VARIABLES['view_item'],
    dataLayerValidation: {
      eventName: 'view_item',
      requiredFields: ['currency', 'value'],
      requiresEcommerce: true,
      requiresItems: true,
    },
  });

  // view_item_list
  events.push({
    eventName: 'view_item_list',
    displayName: '상품 목록 조회',
    description: '상품 목록 페이지에서 자동 발생',
    fireType: 'autoFire',
    pageTypes: ['PRODUCT_LIST', 'BRAND_MAIN', 'SEARCH_RESULT', 'EVENT_LIST'],
    requiredVariables: REQUIRED_VARIABLES['view_item_list'],
    dataLayerValidation: {
      eventName: 'view_item_list',
      requiresEcommerce: true,
      requiresItems: true,
    },
  });

  // view_search_results
  events.push({
    eventName: 'view_search_results',
    displayName: '검색 결과 조회',
    description: '검색 결과 페이지에서 자동 발생',
    fireType: 'autoFire',
    pageTypes: ['SEARCH_RESULT'],
    requiredVariables: REQUIRED_VARIABLES['view_search_results'],
    dataLayerValidation: {
      eventName: 'view_search_results',
      requiredFields: ['search_term'],
    },
  });

  // view_promotion
  events.push({
    eventName: 'view_promotion',
    displayName: '프로모션 노출',
    description: '프로모션이 있는 페이지에서 DOM Ready 시 자동 발생',
    fireType: 'autoFire',
    pageTypes: ['MAIN', 'PRODUCT_DETAIL', 'EVENT_DETAIL', 'EVENT_LIST'],
    requiredVariables: REQUIRED_VARIABLES['view_promotion'],
    dataLayerValidation: {
      eventName: 'view_promotion',
      requiresEcommerce: true,
      requiresItems: true,
    },
    visionHints: VISION_HINTS['select_promotion'],
  });

  // select_promotion
  events.push({
    eventName: 'select_promotion',
    displayName: '프로모션 클릭',
    description: '프로모션 배너 클릭 시 발생',
    fireType: 'userAction',
    pageTypes: ['MAIN', 'PRODUCT_DETAIL', 'EVENT_DETAIL', 'EVENT_LIST'],
    trigger: {
      selectors: CSS_SELECTOR_TRIGGERS['select_promotion'],
      actionType: 'click',
      description: '프로모션 배너 클릭',
    },
    requiredVariables: REQUIRED_VARIABLES['select_promotion'],
    dataLayerValidation: {
      eventName: 'select_promotion',
      requiresEcommerce: true,
      requiresItems: true,
    },
    visionHints: VISION_HINTS['select_promotion'],
    scenarioTemplate: SCENARIO_TEMPLATES['select_promotion'],
  });

  // select_item
  events.push({
    eventName: 'select_item',
    displayName: '상품 클릭',
    description: '상품 목록에서 상품 클릭 시 발생',
    fireType: 'userAction',
    pageTypes: ['PRODUCT_LIST', 'BRAND_MAIN', 'SEARCH_RESULT', 'EVENT_DETAIL'],
    trigger: {
      selectors: CSS_SELECTOR_TRIGGERS['select_item'],
      actionType: 'click',
      description: '상품 클릭',
    },
    requiredVariables: REQUIRED_VARIABLES['select_item'],
    dataLayerValidation: {
      eventName: 'select_item',
      requiresEcommerce: true,
      requiresItems: true,
    },
    scenarioTemplate: SCENARIO_TEMPLATES['select_item'],
  });

  // add_to_cart
  events.push({
    eventName: 'add_to_cart',
    displayName: '장바구니 담기',
    description: '장바구니 담기 버튼 클릭 시 발생',
    fireType: 'userAction',
    pageTypes: ['PRODUCT_DETAIL'],
    trigger: {
      selectors: CSS_SELECTOR_TRIGGERS['add_to_cart'],
      actionType: 'click',
      description: '장바구니 버튼 클릭',
    },
    requiredVariables: REQUIRED_VARIABLES['add_to_cart'],
    dataLayerValidation: {
      eventName: 'add_to_cart',
      requiresEcommerce: true,
      requiresItems: true,
    },
    visionHints: VISION_HINTS['add_to_cart'],
    scenarioTemplate: SCENARIO_TEMPLATES['add_to_cart'],
    prerequisiteEvents: ['view_item'],
  });

  // view_cart
  events.push({
    eventName: 'view_cart',
    displayName: '장바구니 조회',
    description: '장바구니 페이지에서 자동 발생',
    fireType: 'autoFire',
    pageTypes: ['CART'],
    requiredVariables: REQUIRED_VARIABLES['view_cart'],
    dataLayerValidation: {
      eventName: 'view_cart',
      requiresEcommerce: true,
      requiresItems: true,
    },
  });

  // begin_checkout
  events.push({
    eventName: 'begin_checkout',
    displayName: '결제 시작',
    description: '주문하기 버튼 클릭 시 발생 (CART) 또는 주문서 페이지 로드 시 자동 발생 (ORDER)',
    fireType: 'userAction', // CART에서는 userAction, ORDER에서는 autoFire
    pageTypes: ['CART', 'ORDER'],
    trigger: {
      selectors: CSS_SELECTOR_TRIGGERS['begin_checkout'],
      actionType: 'click',
      description: '주문하기 버튼 클릭',
      pageTypes: ['CART'],
    },
    requiredVariables: REQUIRED_VARIABLES['begin_checkout'],
    dataLayerValidation: {
      eventName: 'begin_checkout',
      requiresEcommerce: true,
      requiresItems: true,
    },
    visionHints: VISION_HINTS['begin_checkout'],
    scenarioTemplate: SCENARIO_TEMPLATES['begin_checkout'],
    prerequisiteEvents: ['view_cart'],
    followUpEvents: ['purchase'],
  });

  // purchase
  events.push({
    eventName: 'purchase',
    displayName: '구매 완료',
    description: '주문 완료 페이지에서 자동 발생',
    fireType: 'autoFire',
    pageTypes: ['ORDER_COMPLETE'],
    requiredVariables: REQUIRED_VARIABLES['purchase'],
    dataLayerValidation: {
      eventName: 'purchase',
      requiredFields: ['transaction_id', 'value', 'currency'],
      requiresEcommerce: true,
      requiresItems: true,
    },
    prerequisiteEvents: ['begin_checkout'],
  });

  // login
  events.push({
    eventName: 'login',
    displayName: '로그인',
    description: '로그인 완료 시 발생',
    fireType: 'userAction',
    pageTypes: ['LOGIN', 'ALL'],
    trigger: {
      selectors: [],
      actionType: 'submit',
      description: '로그인 폼 제출 후 리다이렉트',
    },
    requiredVariables: REQUIRED_VARIABLES['login'],
    dataLayerValidation: {
      eventName: 'login',
    },
    visionHints: VISION_HINTS['login'],
  });

  // sign_up
  events.push({
    eventName: 'sign_up',
    displayName: '회원가입',
    description: '회원가입 완료 시 발생',
    fireType: 'autoFire',
    pageTypes: ['SIGNUP_COMPLETE'],
    requiredVariables: REQUIRED_VARIABLES['sign_up'],
    dataLayerValidation: {
      eventName: 'sign_up',
    },
  });

  // scroll
  events.push({
    eventName: 'scroll',
    displayName: '스크롤',
    description: '스크롤 깊이 트리거 발생 시',
    fireType: 'userAction',
    pageTypes: ['MAIN', 'PRODUCT_DETAIL', 'EVENT_DETAIL'],
    trigger: {
      selectors: [],
      actionType: 'scroll',
      description: '스크롤 깊이 도달 (10%, 20%, ... 100%)',
      pageTypes: ['MAIN', 'PRODUCT_DETAIL', 'EVENT_DETAIL'],
    },
    requiredVariables: [],
    dataLayerValidation: {
      eventName: 'scroll',
    },
  });

  // ap_click
  events.push({
    eventName: 'ap_click',
    displayName: '클릭 이벤트',
    description: 'ap-click-area 속성이 있는 요소 클릭 시 발생',
    fireType: 'userAction',
    pageTypes: ['ALL'],
    trigger: {
      selectors: CSS_SELECTOR_TRIGGERS['ap_click'],
      actionType: 'click',
      description: 'ap-click-area 요소 클릭',
    },
    requiredVariables: [],
    dataLayerValidation: {
      eventName: 'ap_click',
    },
  });

  // click_with_duration (클릭 후 체류시간 측정)
  events.push({
    eventName: 'click_with_duration',
    displayName: '클릭 체류시간',
    description: '사용자가 클릭한 후 페이지에서의 체류시간을 스크롤 깊이별로 측정',
    fireType: 'userAction',
    pageTypes: ['ALL'],
    trigger: {
      selectors: [],
      actionType: 'custom',
      dataLayerEvent: 'click_with_duration',
      description: 'dataLayer.push({event: "click_with_duration"}) 발생 시',
    },
    requiredVariables: REQUIRED_VARIABLES['click_with_duration'],
    dataLayerValidation: {
      eventName: 'click_with_duration',
      requiredFields: [],
    },
    gtmInfo: {
      tagId: '338',
      tagName: 'GA4 - Basic Event - Click with Duration',
      triggerId: '212',
      triggerName: 'CE - Click with Duration Trigger',
      triggerType: 'CUSTOM_EVENT',
      customEventFilter: '_event = "click_with_duration"',
    },
  });

  // custom_event (범용 커스텀 이벤트)
  events.push({
    eventName: 'custom_event',
    displayName: '커스텀 이벤트',
    description: '범용 커스텀 이벤트. event_category, event_action, event_label로 분류',
    fireType: 'userAction',
    pageTypes: ['ALL'],
    trigger: {
      selectors: [],
      actionType: 'custom',
      dataLayerEvent: 'customEvent',
      description: 'dataLayer.push({event: "customEvent"}) 발생 시',
    },
    requiredVariables: REQUIRED_VARIABLES['custom_event'],
    dataLayerValidation: {
      eventName: 'custom_event',
      requiredFields: ['event_category', 'event_action'],
    },
    gtmInfo: {
      tagId: '347',
      tagName: 'GA4 - Basic Event - Custom Event',
      triggerId: '253',
      triggerName: 'CE - Custom Event Trigger',
      triggerType: 'CUSTOM_EVENT',
      customEventFilter: '_event = "customEvent"',
    },
  });

  // qualified_visit (캠페인 한정 이벤트)
  events.push({
    eventName: 'qualified_visit',
    displayName: '조건부 방문 (캠페인)',
    description: '특정 캠페인 기간에만 발생하는 조건부 방문 이벤트. 쿠키 조건으로 중복 발생 방지',
    fireType: 'autoFire',
    pageTypes: ['MAIN', 'ALL'],
    trigger: {
      selectors: [],
      actionType: 'custom',
      dataLayerEvent: 'qualified_visit',
      description: 'dataLayer.push({event: "qualified_visit"}) + 쿠키 조건 충족 시',
      additionalConditions: [
        'Cookie "BDP Qualified Visit Event Fired" = "N"',
      ],
    },
    requiredVariables: REQUIRED_VARIABLES['qualified_visit'],
    dataLayerValidation: {
      eventName: 'qualified_visit',
      requiredFields: ['event_category'],
    },
    gtmInfo: {
      tagId: '599',
      tagName: 'GA4 - ETC - Qualified Visit Event',
      triggerId: '589',
      triggerName: 'CE - Qualified Visit',
      triggerType: 'CUSTOM_EVENT',
      customEventFilter: '_event = "qualified_visit"',
      additionalFilter: 'Cookie - BDP Qualified Visit Event Fired = "N"',
    },
    campaignInfo: {
      isCampaignSpecific: true,
      description: '특정 캠페인 기간에만 활성화되는 이벤트',
      cookieCondition: 'BDP Qualified Visit Event Fired = "N" (중복 방지)',
      note: '캠페인 종료 시 수집량이 0이 될 수 있음',
    },
  });

  return events;
}

/**
 * 아모레몰 사이트 설정
 */
export const AMOREMALL_CONFIG: SiteEventConfig = {
  domain: 'amoremall.com',
  propertyId: '416629733',
  gtmContainerId: 'GTM-5FK5X5C4',
  events: createEventMetadataList(),
  commonVariables: [
    { paramName: 'user_id', apVariables: ['AP_USER_ID', 'AP_DATA_USERID'], required: false, description: '사용자 ID' },
    { paramName: 'user_type', apVariables: ['AP_USER_TYPE', 'AP_DATA_MEMBERTYPE'], required: false, description: '회원 유형' },
    { paramName: 'country', apVariables: ['AP_DATA_COUNTRY'], required: false, description: '국가 코드' },
    { paramName: 'page_type', apVariables: ['AP_DATA_PAGETYPE'], required: false, description: '페이지 타입' },
  ],
  pageTypeDefaults: {
    'MAIN': {
      autoFireEvents: ['view_promotion', 'page_view', 'qualified_visit'],
      possibleUserActionEvents: ['select_promotion', 'ap_click', 'scroll', 'click_with_duration', 'login', 'custom_event'],
    },
    'PRODUCT_DETAIL': {
      autoFireEvents: ['view_item', 'view_promotion', 'page_view'],
      possibleUserActionEvents: ['add_to_cart', 'select_promotion', 'ap_click', 'scroll'],
    },
    'PRODUCT_LIST': {
      autoFireEvents: ['view_item_list', 'page_view'],
      possibleUserActionEvents: ['select_item', 'ap_click'],
    },
    'SEARCH_RESULT': {
      autoFireEvents: ['view_search_results', 'view_item_list', 'page_view'],
      possibleUserActionEvents: ['select_item', 'ap_click'],
    },
    'CART': {
      autoFireEvents: ['view_cart', 'page_view'],
      possibleUserActionEvents: ['remove_from_cart', 'begin_checkout', 'ap_click'],
    },
    'ORDER': {
      autoFireEvents: ['begin_checkout', 'page_view'],
      possibleUserActionEvents: ['ap_click'],
    },
    'ORDER_COMPLETE': {
      autoFireEvents: ['purchase', 'page_view'],
      possibleUserActionEvents: [],
    },
  },
};

/**
 * 이벤트 메타데이터 조회 헬퍼 함수
 */
export function getEventMetadata(eventName: string): EventMetadata | undefined {
  return AMOREMALL_CONFIG.events.find(e => e.eventName === eventName);
}

/**
 * 페이지 타입에서 발생 가능한 이벤트 조회
 */
export function getEventsForPageType(pageType: string): { autoFire: string[]; userAction: string[] } {
  const defaults = AMOREMALL_CONFIG.pageTypeDefaults?.[pageType];
  if (defaults) {
    return {
      autoFire: defaults.autoFireEvents,
      userAction: defaults.possibleUserActionEvents,
    };
  }
  return { autoFire: [], userAction: [] };
}

/**
 * 이벤트가 특정 페이지에서 자동 발생인지 확인
 */
export function isAutoFireEventOnPage(eventName: string, pageType: string): boolean {
  const events = AUTO_FIRE_EVENTS_BY_PAGE[pageType] || [];
  return events.includes(eventName);
}
