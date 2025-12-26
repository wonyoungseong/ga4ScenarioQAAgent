/**
 * 이벤트 파라미터 예측 테스트 v2
 *
 * GA4 이벤트별 파라미터 정의(ga4-event-parameters.json)를 기반으로
 * 각 이벤트의 고유 파라미터를 예측하고 검증합니다.
 */

import { chromium, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { GeminiVisionAnalyzer } from './analyzers/visionAnalyzer';

dotenv.config();

// 사이트 매핑 설정 로드
interface SiteMappingConfig {
  commonPatterns: { patterns: Array<{ pattern: string; contentGroup: string }> };
  sites: Record<string, {
    propertyId: string;
    siteName: string;
    defaultLanguage: string;
    defaultCountry: string;
    patterns: Array<{ pattern: string; contentGroup: string }>;
  }>;
  contentGroupAliases: { aliases: Record<string, string> };
  languageNormalization: { rules: Record<string, string> };
}

function loadSiteMappings(): SiteMappingConfig | null {
  const mappingPath = path.join(process.cwd(), 'config', 'site-mappings.json');
  if (fs.existsSync(mappingPath)) {
    return JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
  }
  return null;
}

/**
 * URL과 사이트 매핑 설정을 기반으로 content_group 예측
 */
function predictContentGroupFromUrl(url: string, siteMappings: SiteMappingConfig | null): string | null {
  if (!siteMappings) return null;

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace('www.', '');
    const pathname = urlObj.pathname;

    // 사이트별 패턴 먼저 확인
    const siteConfig = siteMappings.sites[hostname];
    if (siteConfig && siteConfig.patterns) {
      for (const p of siteConfig.patterns) {
        if (pathname.includes(p.pattern)) {
          return p.contentGroup;
        }
      }
    }

    // 공통 패턴 확인
    for (const p of siteMappings.commonPatterns.patterns) {
      if (pathname.includes(p.pattern)) {
        return p.contentGroup;
      }
    }
  } catch (e) {
    // URL 파싱 실패
  }

  return null;
}

/**
 * content_group 별칭 정규화
 */
function normalizeContentGroup(value: string, siteMappings: SiteMappingConfig | null): string {
  if (!value) return value;

  const upper = value.toUpperCase();

  if (siteMappings?.contentGroupAliases?.aliases) {
    return siteMappings.contentGroupAliases.aliases[upper] || upper;
  }

  return upper;
}

// GA4 이벤트 파라미터 정의 로드
interface GA4EventDefinition {
  ga4EventName: string;
  displayName: string;
  dataLayerEvent: string;
  triggerType: string;
  allowedPageTypes: string[];
  parameters: {
    event: Array<{
      ga4Key: string;
      displayName?: string;
      dataLayerVar?: string;
      htmlAttribute?: string;
      required?: boolean;
      value?: string;
      values?: string[];
      example?: string;
      description?: string;
    }>;
    item: Array<{
      ga4Key: string;
      dataLayerVar?: string;
      htmlAttribute?: string;
      required?: boolean;
    }>;
  };
  notes?: string;
}

interface GA4ParameterConfig {
  schemaVersion: string;
  commonParameters: {
    parameters: Record<string, any>;
    loginOnlyParameters: Record<string, any>;
  };
  events: Record<string, GA4EventDefinition>;
  pageTypeParameterMapping: Record<string, any>;
}

// 테스트 대상 이벤트 (로그인/구매 필요 이벤트 제외)
const TARGET_EVENTS = [
  'page_view',
  'view_item',
  'view_item_list',
  'view_promotion',
  'view_promotion_detail',
  'select_item',
  'add_to_cart',
  'select_promotion',
  'scroll',
  'ap_click',
  'view_search_results',
  // 제외: purchase, remove_from_cart, sign_up, login, begin_checkout (로그인 필요)
];

// 이벤트별 테스트 페이지 및 액션
interface TestPageConfig {
  url: string;
  pageType: string;
  action?: {
    type: 'none' | 'click' | 'scroll';
    selector?: string;
    scrollAmount?: number;
  };
}

const EVENT_TEST_PAGES: Record<string, TestPageConfig[]> = {
  'page_view': [
    { url: 'https://www.amoremall.com/kr/ko/display/main', pageType: 'MAIN', action: { type: 'none' } },
    { url: 'https://www.amoremall.com/kr/ko/product/detail?onlineProdSn=91736', pageType: 'PRODUCT_DETAIL', action: { type: 'none' } },
    { url: 'https://www.amoremall.com/kr/ko/cart/cartList', pageType: 'CART', action: { type: 'none' } },
  ],
  'view_item': [
    { url: 'https://www.amoremall.com/kr/ko/product/detail?onlineProdSn=91736', pageType: 'PRODUCT_DETAIL', action: { type: 'none' } },
    { url: 'https://www.amoremall.com/kr/ko/product/detail?onlineProdSn=85851', pageType: 'PRODUCT_DETAIL', action: { type: 'none' } },
  ],
  'view_item_list': [
    { url: 'https://www.amoremall.com/kr/ko/display/search?query=%EC%84%A4%ED%99%94%EC%88%98', pageType: 'SEARCH_RESULT', action: { type: 'none' } },
    // 카테고리 페이지는 별도 앱 구조 사용, 브랜드 검색으로 대체
    { url: 'https://www.amoremall.com/kr/ko/display/search?query=%EC%84%A4%ED%99%94%EC%88%98&brandCode=13', pageType: 'SEARCH_RESULT', action: { type: 'none' } },
  ],
  'view_promotion': [
    { url: 'https://www.amoremall.com/kr/ko/display/main', pageType: 'MAIN', action: { type: 'none' } },
  ],
  'view_promotion_detail': [
    { url: 'https://www.amoremall.com/kr/ko/display/main', pageType: 'MAIN', action: { type: 'none' } },
  ],
  'select_item': [
    {
      url: 'https://www.amoremall.com/kr/ko/display/search?query=%EC%84%A4%ED%99%94%EC%88%98',
      pageType: 'SEARCH_RESULT',
      action: { type: 'click', selector: '[ap-click-area] a, .prd-item a, a[href*="product/detail"]' }
    },
  ],
  'add_to_cart': [
    {
      url: 'https://www.amoremall.com/kr/ko/product/detail?onlineProdSn=91736',
      pageType: 'PRODUCT_DETAIL',
      action: { type: 'click', selector: '.btn-cart, button[class*="cart"], .add-cart-btn' }
    },
  ],
  'select_promotion': [
    {
      url: 'https://www.amoremall.com/kr/ko/display/main',
      pageType: 'MAIN',
      action: { type: 'click', selector: '[ap-promo-id] a, .banner a, .swiper-slide a' }
    },
  ],
  'scroll': [
    {
      url: 'https://www.amoremall.com/kr/ko/display/main',
      pageType: 'MAIN',
      action: { type: 'scroll', scrollAmount: 1500 }
    },
  ],
  'ap_click': [
    {
      url: 'https://www.amoremall.com/kr/ko/display/main',
      pageType: 'MAIN',
      action: { type: 'click', selector: '[ap-click-area] a, [ap-click-name], a[href]' }
    },
  ],
  'view_search_results': [
    { url: 'https://www.amoremall.com/kr/ko/display/search?query=cream', pageType: 'SEARCH_RESULT', action: { type: 'none' } },
  ],
};

/**
 * GA4 파라미터 설정 로드
 */
function loadGA4Config(): GA4ParameterConfig {
  const configPath = path.join(process.cwd(), 'config', 'ga4-event-parameters.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`GA4 파라미터 설정 파일을 찾을 수 없습니다: ${configPath}`);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

/**
 * 페이지에서 전역 변수 및 dataLayer 수집
 */
async function collectPageData(page: Page): Promise<{
  windowVars: Record<string, any>;
  dataLayerEvents: any[];
  htmlAttributes: Record<string, string[]>;
  itemsArray: any[];  // items[] 배열
}> {
  const windowVars = await page.evaluate(() => {
    const vars: Record<string, any> = {};
    const w = window as any;

    // 공통 변수
    const commonVars = [
      'AP_DATA_SITENAME', 'AP_DATA_COUNTRY', 'AP_DATA_LANG', 'AP_DATA_ENV',
      'AP_DATA_CHANNEL', 'AP_DATA_PAGETYPE', 'AP_DATA_ISLOGIN', 'AP_DATA_BREADCRUMB'
    ];

    // 상품 변수
    const productVars = [
      'AP_PRD_CODE', 'AP_PRD_NAME', 'AP_PRD_BRAND', 'AP_PRD_BRANDCODE',
      'AP_PRD_CATEGORY', 'AP_PRD_CATEGORY1', 'AP_PRD_CATEGORY2', 'AP_PRD_CATEGORY3',
      'AP_PRD_PRICE', 'AP_PRD_PRDPRICE', 'AP_PRD_DISCOUNT', 'AP_PRD_ISSTOCK'
    ];

    // 검색 변수
    const searchVars = [
      'AP_SEARCH_TERM', 'AP_SEARCH_TYPE', 'AP_SEARCH_NUM', 'AP_SEARCH_RESULT',
      'AP_SEARCH_PRDRESULT', 'AP_SEARCH_LIST_NAME', 'AP_SEARCH_ITEM_NUM'
    ];

    // 장바구니 변수
    const cartVars = [
      'AP_CART_PRDS', 'AP_CART_ADDPRDS', 'AP_CART_TOTALPRICE', 'AP_CART_ITEMCOUNT'
    ];

    // 주문 변수
    const orderVars = [
      'AP_ORDER_PRDS', 'AP_ORDER_STEP', 'AP_ORDER_PAYTYPE'
    ];

    // 구매 변수
    const purchaseVars = [
      'AP_PURCHASE_ORDERNUM', 'AP_PURCHASE_PRICE', 'AP_PURCHASE_PRDS',
      'AP_PURCHASE_SHIPPING', 'AP_PURCHASE_COUPON', 'AP_PURCHASE_METHOD'
    ];

    // 리뷰 변수
    const reviewVars = [
      'AP_REVIEW_PRD', 'AP_REVIEW_PRDCODE', 'AP_REVIEW_RATING',
      'AP_REVIEW_PICTURE', 'AP_REVIEW_CONTENT'
    ];

    // 이벤트 변수
    const eventVars = [
      'AP_EVENT_CODE', 'AP_EVENT_NAME', 'AP_PROMO_ID', 'AP_PROMO_NAME'
    ];

    // 통화 변수
    const currencyVars = ['AP_CURRENCY'];

    const allVars = [
      ...commonVars, ...productVars, ...searchVars, ...cartVars,
      ...orderVars, ...purchaseVars, ...reviewVars, ...eventVars, ...currencyVars
    ];

    for (const name of allVars) {
      const value = w[name];
      if (value !== undefined && value !== null && value !== '') {
        vars[name] = value;
      }
    }

    return vars;
  });

  // dataLayer 이벤트 수집
  const dataLayerEvents = await page.evaluate(() => {
    return (window as any).__capturedEvents || (window as any).dataLayer || [];
  });

  // HTML 속성 수집 (ap_click, view_promotion 등)
  const htmlAttributes = await page.evaluate(() => {
    const attrs: Record<string, string[]> = {
      'ap-click-area': [],
      'ap-click-name': [],
      'ap-click-data': [],
      'ap-click-param1': [],
      'ap-click-param2': [],
      'ap-click-param3': [],
      'ap-promo-id': [],
      'ap-promo-name': [],
      'ap-promo-slot': []
    };

    for (const attrName of Object.keys(attrs)) {
      const elements = document.querySelectorAll(`[${attrName}]`);
      elements.forEach(el => {
        const value = el.getAttribute(attrName);
        if (value) attrs[attrName].push(value);
      });
    }

    return attrs;
  });

  // items[] 배열 수집 (상품 정보 배열)
  const itemsArray = await page.evaluate(() => {
    const w = window as any;
    const items: any[] = [];

    // view_item 페이지: 단일 상품 정보
    if (w.AP_PRD_CODE) {
      items.push({
        item_id: w.AP_PRD_CODE,
        item_name: w.AP_PRD_NAME,
        item_brand: w.AP_PRD_BRAND,
        item_category: w.AP_PRD_CATEGORY1,
        item_category2: w.AP_PRD_CATEGORY2,
        item_category3: w.AP_PRD_CATEGORY3,
        item_category4: w.AP_PRD_CATEGORY4,
        item_category5: w.AP_PRD_CATEGORY5,
        price: w.AP_PRD_PRICE || w.AP_PRD_PRDPRICE,
        discount: w.AP_PRD_DISCOUNT,
        quantity: 1
      });
    }

    // view_item_list/select_item: 검색 결과 상품 목록
    if (Array.isArray(w.AP_SEARCH_PRDRESULT)) {
      for (let i = 0; i < Math.min(w.AP_SEARCH_PRDRESULT.length, 10); i++) {
        const prd = w.AP_SEARCH_PRDRESULT[i];
        items.push({
          item_id: prd.code || prd.onlineProdCode,
          item_name: prd.name || prd.onlineProdName,
          item_brand: prd.brand || prd.brandName,
          item_category: prd.category1,
          item_category2: prd.category2,
          item_category3: prd.category3,
          item_category4: prd.category4,
          item_category5: prd.category5,
          index: prd.index || i + 1,
          item_list_name: w.AP_SEARCH_LIST_NAME,
          price: prd.price || prd.salePrice,
          discount: prd.discount
        });
      }
    }

    // add_to_cart: 장바구니 추가 상품
    if (Array.isArray(w.AP_CART_ADDPRDS)) {
      for (const prd of w.AP_CART_ADDPRDS) {
        items.push({
          item_id: prd.code,
          item_name: prd.name,
          item_brand: prd.brand,
          item_category: prd.category1,
          item_category2: prd.category2,
          item_category3: prd.category3,
          item_category4: prd.category4,
          item_category5: prd.category5,
          item_variant: prd.variant,
          quantity: prd.quantity,
          price: prd.price,
          discount: prd.discount
        });
      }
    }

    // begin_checkout/view_cart: 장바구니 상품 목록
    if (Array.isArray(w.AP_CART_PRDS)) {
      for (const prd of w.AP_CART_PRDS) {
        items.push({
          item_id: prd.code,
          item_name: prd.name,
          item_brand: prd.brand,
          item_category: prd.category1,
          item_variant: prd.variant,
          quantity: prd.quantity,
          price: prd.price,
          discount: prd.discount
        });
      }
    }

    return items;
  });

  return { windowVars, dataLayerEvents, htmlAttributes, itemsArray };
}

/**
 * 이벤트별 수집 파라미터 매핑
 */
function mapCollectedToEventParams(
  eventName: string,
  eventDef: GA4EventDefinition,
  collected: {
    windowVars: Record<string, any>;
    dataLayerEvents: any[];
    htmlAttributes: Record<string, string[]>;
    itemsArray?: any[];
  }
): { eventParams: Record<string, any>; itemParams: any[] } {
  const result: Record<string, any> = {};
  const { windowVars, htmlAttributes } = collected;

  // 공통 파라미터 매핑
  const commonMapping: Record<string, string> = {
    'content_group': 'AP_DATA_PAGETYPE',
    'site_name': 'AP_DATA_SITENAME',
    'site_country': 'AP_DATA_COUNTRY',
    'site_language': 'AP_DATA_LANG',
    'site_env': 'AP_DATA_ENV',
    'channel': 'AP_DATA_CHANNEL',
    'login_is_login': 'AP_DATA_ISLOGIN',
    'page_bread': 'AP_DATA_BREADCRUMB',
  };

  for (const [ga4Key, dataLayerVar] of Object.entries(commonMapping)) {
    if (windowVars[dataLayerVar]) {
      result[ga4Key] = windowVars[dataLayerVar];
    }
  }

  // 이벤트별 파라미터 매핑
  for (const param of eventDef.parameters.event) {
    if (param.dataLayerVar && windowVars[param.dataLayerVar]) {
      result[param.ga4Key] = windowVars[param.dataLayerVar];
    } else if (param.htmlAttribute && htmlAttributes[param.htmlAttribute]?.length > 0) {
      // HTML 속성 기반 파라미터
      result[param.ga4Key] = htmlAttributes[param.htmlAttribute][0];
    } else if (param.value) {
      // 고정값
      result[param.ga4Key] = param.value;
    }
  }

  // 특수 케이스 처리
  switch (eventName) {
    case 'view_item':
      // 상품 상세 페이지 변수
      if (windowVars['AP_PRD_CODE']) result['product_id'] = windowVars['AP_PRD_CODE'];
      if (windowVars['AP_PRD_NAME']) result['product_name'] = windowVars['AP_PRD_NAME'];
      if (windowVars['AP_PRD_BRAND']) result['product_brandname'] = windowVars['AP_PRD_BRAND'];
      if (windowVars['AP_PRD_BRANDCODE']) result['product_brandcode'] = windowVars['AP_PRD_BRANDCODE'];
      if (windowVars['AP_PRD_ISSTOCK']) result['product_is_stock'] = windowVars['AP_PRD_ISSTOCK'];
      if (windowVars['AP_CURRENCY']) result['currency'] = windowVars['AP_CURRENCY'];
      result['event_category'] = 'ecommerce';
      result['event_action'] = 'view item';
      break;

    case 'view_item_list':
    case 'view_search_results':
      if (windowVars['AP_SEARCH_TERM']) result['search_term'] = windowVars['AP_SEARCH_TERM'];
      if (windowVars['AP_SEARCH_TYPE']) result['search_type'] = windowVars['AP_SEARCH_TYPE'];
      if (windowVars['AP_SEARCH_NUM']) result['search_resultcount'] = windowVars['AP_SEARCH_NUM'];
      if (windowVars['AP_SEARCH_RESULT']) result['search_result'] = windowVars['AP_SEARCH_RESULT'];
      result['event_category'] = 'ecommerce';
      result['event_action'] = eventName === 'view_item_list' ? 'view item list' : 'search';
      break;

    case 'ap_click':
      if (htmlAttributes['ap-click-area']?.length > 0) {
        result['event_category'] = htmlAttributes['ap-click-area'][0];
      }
      if (htmlAttributes['ap-click-name']?.length > 0) {
        result['event_action'] = htmlAttributes['ap-click-name'][0];
      }
      if (htmlAttributes['ap-click-data']?.length > 0) {
        result['event_label'] = htmlAttributes['ap-click-data'][0];
      }
      break;

    case 'view_promotion':
    case 'select_promotion':
      if (htmlAttributes['ap-promo-id']?.length > 0) {
        result['promotion_id'] = htmlAttributes['ap-promo-id'][0];
      }
      if (htmlAttributes['ap-promo-name']?.length > 0) {
        result['promotion_name'] = htmlAttributes['ap-promo-name'][0];
      }
      if (htmlAttributes['ap-promo-slot']?.length > 0) {
        result['creative_slot'] = htmlAttributes['ap-promo-slot'][0];
      }
      result['event_category'] = 'ecommerce';
      result['event_action'] = eventName === 'view_promotion' ? 'view promotion' : 'select promotion';
      break;
  }

  // items 배열 처리
  const itemParams = collected.itemsArray || [];
  if (itemParams.length > 0) {
    result['items'] = `[${itemParams.length}개 상품]`;
  }

  return { eventParams: result, itemParams };
}

/**
 * Vision AI 예측 결과를 이벤트 파라미터로 변환
 */
function convertPredictionToParams(
  prediction: any,
  eventName: string,
  eventDef: GA4EventDefinition
): Record<string, any> {
  const result: Record<string, any> = {};

  if (!prediction) return result;

  // 공통 변수 매핑
  if (prediction.variables) {
    const v = prediction.variables;
    if (v.site_name) result['site_name'] = v.site_name;
    if (v.site_country) result['site_country'] = v.site_country;
    if (v.site_language) result['site_language'] = v.site_language;
    if (v.site_env) result['site_env'] = v.site_env;
    if (v.channel) result['channel'] = v.channel;
    if (v.content_group) result['content_group'] = v.content_group;
    if (v.login_is_login) result['login_is_login'] = v.login_is_login;
  }

  // 조건부 변수 매핑
  if (prediction.conditionalVariables) {
    const cv = prediction.conditionalVariables;

    switch (eventName) {
      case 'view_item':
        if (cv.product_id) result['product_id'] = cv.product_id;
        if (cv.product_name) result['product_name'] = cv.product_name;
        if (cv.product_brandname) result['product_brandname'] = cv.product_brandname;
        if (cv.product_brandcode) result['product_brandcode'] = cv.product_brandcode;
        if (cv.product_is_stock) result['product_is_stock'] = cv.product_is_stock;
        result['event_category'] = 'ecommerce';
        result['event_action'] = 'view item';
        break;

      case 'view_item_list':
      case 'view_search_results':
        if (cv.search_term) result['search_term'] = cv.search_term;
        if (cv.search_type) result['search_type'] = cv.search_type;
        if (cv.search_result_count) result['search_resultcount'] = cv.search_result_count;
        if (cv.search_result) result['search_result'] = cv.search_result;
        result['event_category'] = 'ecommerce';
        result['event_action'] = eventName === 'view_item_list' ? 'view item list' : 'search';
        break;

      case 'view_promotion':
      case 'select_promotion':
        if (cv.promotion_id) result['promotion_id'] = cv.promotion_id;
        if (cv.promotion_name) result['promotion_name'] = cv.promotion_name;
        if (cv.creative_slot) result['creative_slot'] = cv.creative_slot;
        result['event_category'] = 'ecommerce';
        result['event_action'] = eventName === 'view_promotion' ? 'view promotion' : 'select promotion';
        break;
    }
  }

  return result;
}

/**
 * 예측값 보강 (HTML 속성, URL 기반)
 */
function enhancePrediction(
  eventName: string,
  predicted: Record<string, any>,
  collected: {
    windowVars: Record<string, any>;
    dataLayerEvents: any[];
    htmlAttributes: Record<string, string[]>;
    itemsArray?: any[];
  },
  url: string
): Record<string, any> {
  const result = { ...predicted };
  const { htmlAttributes, windowVars } = collected;

  switch (eventName) {
    case 'ap_click':
      // HTML 속성에서 ap_click 파라미터 예측
      if (htmlAttributes['ap-click-area']?.length > 0) {
        result['event_category'] = htmlAttributes['ap-click-area'][0];
      }
      if (htmlAttributes['ap-click-name']?.length > 0) {
        result['event_action'] = htmlAttributes['ap-click-name'][0];
      }
      if (htmlAttributes['ap-click-data']?.length > 0) {
        result['event_label'] = htmlAttributes['ap-click-data'][0];
      }
      if (htmlAttributes['ap-click-param1']?.length > 0) {
        result['event_param1'] = htmlAttributes['ap-click-param1'][0];
      }
      if (htmlAttributes['ap-click-param2']?.length > 0) {
        result['event_param2'] = htmlAttributes['ap-click-param2'][0];
      }
      if (htmlAttributes['ap-click-param3']?.length > 0) {
        result['event_param3'] = htmlAttributes['ap-click-param3'][0];
      }
      break;

    case 'view_item_list':
    case 'view_search_results':
      // URL에서 search_type 예측
      const urlObj = new URL(url);
      if (urlObj.searchParams.has('query') || urlObj.searchParams.has('keyword')) {
        result['search_type'] = '직접입력';  // 검색어가 URL에 있으면 직접입력
      }
      // search_term에서 event_label 예측
      if (windowVars['AP_SEARCH_TERM']) {
        result['event_label'] = windowVars['AP_SEARCH_TERM'];
      }
      break;

    case 'select_promotion':
      // HTML 속성에서 프로모션 정보 예측
      if (htmlAttributes['ap-promo-id']?.length > 0) {
        result['promotion_id'] = htmlAttributes['ap-promo-id'][0];
      }
      if (htmlAttributes['ap-promo-name']?.length > 0) {
        result['promotion_name'] = htmlAttributes['ap-promo-name'][0];
      }
      if (htmlAttributes['ap-promo-slot']?.length > 0) {
        result['creative_slot'] = htmlAttributes['ap-promo-slot'][0];
      }
      break;

    case 'select_item':
      // 클릭 전 페이지의 content_group 유지 (이미 preClickData에서 수집됨)
      if (windowVars['AP_DATA_PAGETYPE']) {
        result['content_group'] = windowVars['AP_DATA_PAGETYPE'];
      }
      break;
  }

  return result;
}

/**
 * 파라미터 비교 및 검증
 */
interface ParamValidation {
  paramName: string;
  predicted: any;
  actual: any;
  verdict: 'CORRECT' | 'MISMATCH' | 'MISSING_PREDICTION' | 'MISSING_ACTUAL' | 'NOT_APPLICABLE';
}

/**
 * 값 정규화 (비교를 위해)
 */
function normalizeValue(param: string, value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();

  // site_language: ko-KR → KO, en-US → EN, ko → KO
  if (param === 'site_language') {
    const match = str.match(/^([a-z]{2})[-_]?([A-Z]{2})?$/i);
    if (match) {
      return match[1].toUpperCase();
    }
    return str.toUpperCase();
  }

  // content_group: 대소문자 통일 + 별칭 정규화
  if (param === 'content_group') {
    const upper = str.toUpperCase();
    // 별칭 정규화
    const aliases: Record<string, string> = {
      'OTHERS': 'OTHER',
      'PRODUCT': 'PRODUCT_DETAIL',
      'PRODUCTS': 'PRODUCT_LIST',
      'LIST': 'PRODUCT_LIST',
      'DETAIL': 'PRODUCT_DETAIL',
      'BASKET': 'CART',
      'CHECKOUT': 'ORDER',
      'PAYMENT': 'ORDER',
      'RESULT': 'SEARCH_RESULT',
      'PROMO': 'EVENT',
      'PROMOTION': 'EVENT',
      'EVENT_DETAIL': 'EVENT',
      'ACCOUNT': 'MY',
      'MYPAGE': 'MY',
      'SIGNIN': 'LOGIN',
      'REGISTER': 'SIGNUP',
      'JOIN': 'SIGNUP',
    };
    return aliases[upper] || upper;
  }

  // site_country: kr → KR, ko → KO
  if (param === 'site_country') {
    return str.toUpperCase();
  }

  return str.toUpperCase();
}

interface ItemValidation {
  itemIndex: number;
  paramResults: ParamValidation[];
  hasRequiredFields: boolean;
}

function validateParameters(
  eventName: string,
  eventDef: GA4EventDefinition,
  predicted: Record<string, any>,
  actual: Record<string, any>,
  actualItems: any[] = []
): { results: ParamValidation[]; itemResults: ItemValidation[]; accuracy: number; itemAccuracy: number; } {
  const results: ParamValidation[] = [];

  // 공통 파라미터 검증
  const commonParams = [
    'content_group', 'site_name', 'site_country', 'site_language',
    'site_env', 'channel', 'login_is_login'
  ];

  for (const param of commonParams) {
    const pVal = predicted[param];
    const aVal = actual[param];

    let verdict: ParamValidation['verdict'] = 'NOT_APPLICABLE';
    if (pVal && aVal) {
      const pNorm = normalizeValue(param, pVal);
      const aNorm = normalizeValue(param, aVal);
      verdict = pNorm === aNorm ? 'CORRECT' : 'MISMATCH';
    } else if (!pVal && aVal) {
      verdict = 'MISSING_PREDICTION';
    } else if (pVal && !aVal) {
      verdict = 'MISSING_ACTUAL';
    }

    results.push({ paramName: param, predicted: pVal, actual: aVal, verdict });
  }

  // 이벤트별 파라미터 검증
  for (const param of eventDef.parameters.event) {
    if (param.value) continue; // 고정값은 스킵
    if (param.ga4Key === 'items') continue; // items는 별도 검증

    const pVal = predicted[param.ga4Key];
    const aVal = actual[param.ga4Key];

    let verdict: ParamValidation['verdict'] = 'NOT_APPLICABLE';
    if (pVal !== undefined && aVal !== undefined) {
      const pStr = String(pVal).trim().toLowerCase();
      const aStr = String(aVal).trim().toLowerCase();
      verdict = pStr === aStr ? 'CORRECT' : 'MISMATCH';
    } else if (pVal === undefined && aVal !== undefined) {
      verdict = 'MISSING_PREDICTION';
    } else if (pVal !== undefined && aVal === undefined) {
      verdict = 'MISSING_ACTUAL';
    }

    results.push({ paramName: param.ga4Key, predicted: pVal, actual: aVal, verdict });
  }

  // items[] 배열 검증
  const itemResults: ItemValidation[] = [];
  const itemDef = eventDef.parameters.item || [];

  if (itemDef.length > 0 && actualItems.length > 0) {
    // 첫 번째 아이템만 검증 (대표 샘플)
    const firstItem = actualItems[0];
    const itemParamResults: ParamValidation[] = [];
    let hasRequired = true;

    for (const itemParam of itemDef) {
      const aVal = firstItem[itemParam.ga4Key];
      const hasValue = aVal !== undefined && aVal !== null && aVal !== '';

      if (itemParam.required && !hasValue) {
        hasRequired = false;
      }

      // items는 실제 수집만 확인 (예측은 하지 않음)
      itemParamResults.push({
        paramName: `item.${itemParam.ga4Key}`,
        predicted: null,
        actual: aVal,
        verdict: hasValue ? 'CORRECT' : (itemParam.required ? 'MISSING_ACTUAL' : 'NOT_APPLICABLE')
      });
    }

    itemResults.push({
      itemIndex: 0,
      paramResults: itemParamResults,
      hasRequiredFields: hasRequired
    });
  }

  // 정확도 계산 (event params)
  const applicableResults = results.filter(r => r.verdict !== 'NOT_APPLICABLE');
  const correctCount = applicableResults.filter(r => r.verdict === 'CORRECT' || r.verdict === 'MISSING_ACTUAL').length;
  const accuracy = applicableResults.length > 0 ? (correctCount / applicableResults.length) * 100 : 0;

  // items 정확도 계산
  let itemAccuracy = 100;
  if (itemResults.length > 0) {
    const itemParamResults = itemResults[0].paramResults;
    const applicableItemResults = itemParamResults.filter(r => r.verdict !== 'NOT_APPLICABLE');
    const correctItemCount = applicableItemResults.filter(r => r.verdict === 'CORRECT').length;
    itemAccuracy = applicableItemResults.length > 0 ? (correctItemCount / applicableItemResults.length) * 100 : 100;
  }

  return { results, itemResults, accuracy, itemAccuracy };
}

/**
 * 메인 테스트 함수
 */
async function main() {
  console.log('═'.repeat(80));
  console.log(' GA4 이벤트 파라미터 예측 테스트 v2');
  console.log('═'.repeat(80));

  // API 키 확인
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error('❌ GEMINI_API_KEY가 설정되지 않았습니다.');
    process.exit(1);
  }

  // GA4 설정 로드
  let ga4Config: GA4ParameterConfig;
  try {
    ga4Config = loadGA4Config();
    console.log(`✅ GA4 설정 로드 완료: ${Object.keys(ga4Config.events).length}개 이벤트 정의`);
  } catch (error: any) {
    console.error(`❌ GA4 설정 로드 실패: ${error.message}`);
    process.exit(1);
  }

  // 사이트 매핑 설정 로드
  const siteMappings = loadSiteMappings();
  if (siteMappings) {
    console.log(`✅ 사이트 매핑 로드 완료: ${Object.keys(siteMappings.sites).length}개 사이트`);
  }

  // 출력 디렉토리
  const outputDir = path.join(process.cwd(), 'output', 'event-params-test-v2');
  const screenshotDir = path.join(outputDir, 'screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  // Vision Analyzer 초기화
  const visionAnalyzer = new GeminiVisionAnalyzer(geminiApiKey);

  // 브라우저 시작
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  });

  // 결과 저장
  const allResults: Array<{
    eventName: string;
    pageUrl: string;
    pageType: string;
    accuracy: number;
    itemAccuracy?: number;
    totalParams: number;
    correctParams: number;
    validation: ParamValidation[];
    itemValidation?: ItemValidation[];
  }> = [];

  console.log(`\n📋 테스트 대상 이벤트: ${TARGET_EVENTS.length}개\n`);

  // 각 이벤트 테스트
  for (const eventName of TARGET_EVENTS) {
    const eventDef = ga4Config.events[eventName];
    if (!eventDef) {
      console.log(`⚠️ ${eventName}: GA4 설정에 정의되지 않음, 스킵`);
      continue;
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🎯 ${eventName} (${eventDef.displayName})`);
    console.log(`   트리거: ${eventDef.triggerType}, 페이지: ${eventDef.allowedPageTypes.join(', ')}`);
    console.log(`${'═'.repeat(60)}`);

    const testPages = EVENT_TEST_PAGES[eventName] || [];
    if (testPages.length === 0) {
      console.log(`   ⚠️ 테스트 페이지 없음, 스킵`);
      continue;
    }

    for (let i = 0; i < testPages.length; i++) {
      const testPage = testPages[i];
      console.log(`\n   [${i + 1}/${testPages.length}] ${testPage.url}`);
      console.log(`      페이지 타입: ${testPage.pageType}`);

      const page = await context.newPage();

      try {
        // dataLayer 캡처 스크립트 주입
        await page.addInitScript(() => {
          (window as any).__capturedEvents = [];
          const originalPush = Array.prototype.push;
          (window as any).dataLayer = (window as any).dataLayer || [];
          const dl = (window as any).dataLayer;
          dl.push = function(...args: any[]) {
            for (const arg of args) {
              (window as any).__capturedEvents.push(arg);
            }
            return originalPush.apply(this, args);
          };
        });

        // 페이지 로드
        await page.goto(testPage.url, { timeout: 60000, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);

        // AP_DATA 변수 대기 (재시도 로직)
        let apDataLoaded = false;
        for (let retry = 0; retry < 3; retry++) {
          try {
            await page.waitForFunction(
              () => (window as any).AP_DATA_SITENAME && (window as any).AP_DATA_PAGETYPE,
              { timeout: 15000 }
            );
            apDataLoaded = true;
            break;
          } catch {
            if (retry < 2) {
              console.log(`      ⏳ AP_DATA 대기 중... (${retry + 1}/3)`);
              await page.waitForTimeout(3000);
            }
          }
        }
        if (!apDataLoaded) {
          console.log(`      ⚠️ AP_DATA 변수 대기 타임아웃`);
        }

        // 클릭 이벤트의 경우: 클릭 전에 데이터 먼저 수집 (content_group 등)
        let preClickData: {
          windowVars: Record<string, any>;
          dataLayerEvents: any[];
          htmlAttributes: Record<string, string[]>;
          itemsArray: any[];
        } | null = null;
        let clickedElementAttrs: Record<string, string> = {};

        if (testPage.action?.type === 'click' && testPage.action.selector) {
          // 클릭 전 데이터 수집
          preClickData = await collectPageData(page);
          console.log(`      📥 클릭 전 수집: ${Object.keys(preClickData.windowVars).length}개 변수`);

          // 클릭할 요소 찾기 및 속성 수집
          const element = await page.$(testPage.action.selector);
          if (element) {
            // 클릭할 요소의 HTML 속성 수집
            clickedElementAttrs = await element.evaluate((el) => {
              const attrs: Record<string, string> = {};
              const attrNames = ['ap-click-area', 'ap-click-name', 'ap-click-data',
                                 'ap-click-param1', 'ap-click-param2', 'ap-click-param3',
                                 'ap-promo-id', 'ap-promo-name', 'ap-promo-slot'];

              // 요소 자체와 부모 요소에서 속성 찾기
              let current: Element | null = el;
              while (current) {
                for (const attrName of attrNames) {
                  if (!attrs[attrName]) {
                    const value = current.getAttribute(attrName);
                    if (value) attrs[attrName] = value;
                  }
                }
                current = current.parentElement;
              }
              return attrs;
            });

            if (Object.keys(clickedElementAttrs).length > 0) {
              console.log(`      🏷️ 클릭 요소 속성: ${Object.keys(clickedElementAttrs).join(', ')}`);
            }

            await element.scrollIntoViewIfNeeded();
            await page.waitForTimeout(500);
            await element.dispatchEvent('click');
            await page.waitForTimeout(500);
          } else {
            console.log(`      ⚠️ 클릭 요소 못찾음: ${testPage.action.selector}`);
          }
        } else if (testPage.action?.type === 'scroll') {
          await page.evaluate((amount) => window.scrollBy(0, amount), testPage.action.scrollAmount || 1000);
          await page.waitForTimeout(1000);
        }

        // 스크린샷 캡처
        const screenshotPath = path.join(screenshotDir, `${eventName}_${i}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });

        // 데이터 수집 (클릭 이벤트는 클릭 전 데이터 사용)
        const collected = preClickData || await collectPageData(page);

        // 클릭된 요소의 속성을 collected에 병합
        if (Object.keys(clickedElementAttrs).length > 0) {
          for (const [attr, value] of Object.entries(clickedElementAttrs)) {
            if (!collected.htmlAttributes[attr]) {
              collected.htmlAttributes[attr] = [];
            }
            // 클릭된 요소의 속성을 맨 앞에 추가 (우선순위)
            collected.htmlAttributes[attr].unshift(value);
          }
        }
        console.log(`      📥 수집된 변수: ${Object.keys(collected.windowVars).length}개`);
        if (collected.itemsArray && collected.itemsArray.length > 0) {
          console.log(`      📦 items 배열: ${collected.itemsArray.length}개 상품`);
        }

        // 실제 파라미터 매핑
        const { eventParams: actualParams, itemParams: actualItems } = mapCollectedToEventParams(eventName, eventDef, collected);
        console.log(`      📋 매핑된 파라미터: ${Object.keys(actualParams).length}개`);

        // Vision AI 예측
        let predictedParams: Record<string, any> = {};
        try {
          console.log(`      🔍 Vision AI 예측 중...`);
          const prediction = await visionAnalyzer.predictPageVariables(screenshotPath, testPage.url, {
            viewport: { width: 1920, height: 1080 }
          });
          predictedParams = convertPredictionToParams(prediction, eventName, eventDef);
          console.log(`      ✓ 예측 완료: ${prediction.pageType} (${prediction.confidence})`);
        } catch (error: any) {
          console.log(`      ❌ Vision AI 오류: ${error.message}`);
        }

        // 이벤트별 예측값 보강 (HTML 속성, URL 기반)
        predictedParams = enhancePrediction(eventName, predictedParams, collected, testPage.url);

        // 검증
        const { results, itemResults, accuracy, itemAccuracy } = validateParameters(
          eventName, eventDef, predictedParams, actualParams, actualItems
        );
        const applicableResults = results.filter(r => r.verdict !== 'NOT_APPLICABLE');
        const correctCount = applicableResults.filter(r => r.verdict === 'CORRECT' || r.verdict === 'MISSING_ACTUAL').length;

        console.log(`      📊 이벤트 파라미터 정확도: ${accuracy.toFixed(0)}% (${correctCount}/${applicableResults.length})`);

        // items 배열 검증 결과 출력
        if (itemResults.length > 0) {
          const itemValidation = itemResults[0];
          const itemCorrect = itemValidation.paramResults.filter(r => r.verdict === 'CORRECT').length;
          const itemTotal = itemValidation.paramResults.filter(r => r.verdict !== 'NOT_APPLICABLE').length;
          console.log(`      📦 items[] 수집률: ${itemAccuracy.toFixed(0)}% (${itemCorrect}/${itemTotal})`);

          // 필수 필드 누락 경고
          const missingRequired = itemValidation.paramResults.filter(r =>
            r.verdict === 'MISSING_ACTUAL' && eventDef.parameters.item.find(p => p.ga4Key === r.paramName.replace('item.', ''))?.required
          );
          if (missingRequired.length > 0) {
            console.log(`         ⚠️ 필수 item 필드 누락: ${missingRequired.map(r => r.paramName).join(', ')}`);
          }
        }

        // 불일치 항목 출력
        const mismatches = results.filter(r => r.verdict === 'MISMATCH');
        if (mismatches.length > 0) {
          for (const m of mismatches) {
            console.log(`         ❌ ${m.paramName}: 예측="${m.predicted}" vs 실제="${m.actual}"`);
          }
        }

        // 예측 누락 항목
        const missingPreds = results.filter(r => r.verdict === 'MISSING_PREDICTION' && r.actual);
        if (missingPreds.length > 0 && missingPreds.length <= 3) {
          for (const m of missingPreds) {
            console.log(`         📝 예측 누락: ${m.paramName}="${m.actual}"`);
          }
        }

        allResults.push({
          eventName,
          pageUrl: testPage.url,
          pageType: testPage.pageType,
          accuracy,
          itemAccuracy,
          totalParams: applicableResults.length,
          correctParams: correctCount,
          validation: results,
          itemValidation: itemResults
        });

      } catch (error: any) {
        console.log(`      ❌ 처리 오류: ${error.message}`);
      } finally {
        await page.close();
      }

      // API 속도 제한 방지
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  await browser.close();

  // 전체 리포트
  console.log('\n\n' + '═'.repeat(80));
  console.log(' 테스트 결과 요약');
  console.log('═'.repeat(80));

  // 이벤트별 정확도
  const eventAccuracy = new Map<string, {
    total: number; correct: number; count: number;
    itemTotal: number; itemCorrect: number; hasItems: boolean;
  }>();
  for (const r of allResults) {
    if (!eventAccuracy.has(r.eventName)) {
      eventAccuracy.set(r.eventName, { total: 0, correct: 0, count: 0, itemTotal: 0, itemCorrect: 0, hasItems: false });
    }
    const ea = eventAccuracy.get(r.eventName)!;
    ea.total += r.totalParams;
    ea.correct += r.correctParams;
    ea.count++;

    // items 배열 정확도
    if (r.itemValidation && r.itemValidation.length > 0) {
      ea.hasItems = true;
      const itemParamResults = r.itemValidation[0].paramResults;
      const applicable = itemParamResults.filter(p => p.verdict !== 'NOT_APPLICABLE');
      ea.itemTotal += applicable.length;
      ea.itemCorrect += applicable.filter(p => p.verdict === 'CORRECT').length;
    }
  }

  console.log('\n[이벤트별 정확도]');
  for (const [eventName, data] of Array.from(eventAccuracy.entries())) {
    const accuracy = data.total > 0 ? (data.correct / data.total) * 100 : 0;
    const icon = accuracy >= 80 ? '✅' : accuracy >= 50 ? '⚠️' : '❌';
    let itemsInfo = '';
    if (data.hasItems) {
      const itemAcc = data.itemTotal > 0 ? (data.itemCorrect / data.itemTotal) * 100 : 0;
      itemsInfo = ` | items: ${itemAcc.toFixed(0)}%`;
    }
    console.log(`   ${icon} ${eventName}: ${accuracy.toFixed(0)}% (${data.correct}/${data.total})${itemsInfo}`);
  }

  // 전체 정확도
  const totalCorrect = allResults.reduce((sum, r) => sum + r.correctParams, 0);
  const totalParams = allResults.reduce((sum, r) => sum + r.totalParams, 0);
  const overallAccuracy = totalParams > 0 ? (totalCorrect / totalParams) * 100 : 0;

  // items 전체 정확도
  let totalItemCorrect = 0, totalItemParams = 0;
  for (const [, data] of Array.from(eventAccuracy.entries())) {
    totalItemCorrect += data.itemCorrect;
    totalItemParams += data.itemTotal;
  }
  const itemOverallAccuracy = totalItemParams > 0 ? (totalItemCorrect / totalItemParams) * 100 : 100;

  console.log(`\n📊 이벤트 파라미터 정확도: ${overallAccuracy.toFixed(1)}% (${totalCorrect}/${totalParams})`);
  console.log(`📦 items[] 수집 정확도: ${itemOverallAccuracy.toFixed(1)}% (${totalItemCorrect}/${totalItemParams})`);
  console.log(`📋 테스트 케이스: ${allResults.length}개`);

  // 결과 저장
  const reportPath = path.join(outputDir, 'validation-report-v2.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    overallAccuracy,
    itemOverallAccuracy,
    totalTests: allResults.length,
    eventAccuracy: Object.fromEntries(eventAccuracy),
    results: allResults
  }, null, 2));
  console.log(`\n💾 리포트 저장: ${reportPath}`);

  console.log('\n✅ 테스트 완료!');
}

main().catch(console.error);
