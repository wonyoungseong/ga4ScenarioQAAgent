/**
 * 실제 페이지 방문하여 개발가이드 변수 수집 및 예측값 비교
 *
 * 각 Property의 content_group별 대표 페이지를 방문하여
 * 실제 AP_DATA_* 변수를 수집하고 예측값과 비교합니다.
 */

import { chromium, Browser, Page } from 'playwright';
import { ValuePredictor, PredictionContext, PredictionResult } from './predictors/valuePredictor';
import * as fs from 'fs';
import * as path from 'path';

// 테스트할 페이지 목록 (GA4 분석 결과에서 추출)
const TEST_PAGES: Array<{
  site: string;
  contentGroup: string;
  url: string;
  pageViews: number;
}> = [
  // AMOREMALL - 가장 트래픽이 많은 사이트
  { site: 'AMOREMALL', contentGroup: 'MAIN', url: 'https://www.amoremall.com/kr/ko/display/main', pageViews: 1697970 },
  { site: 'AMOREMALL', contentGroup: 'PRODUCT_DETAIL', url: 'https://www.amoremall.com/kr/ko/product/detail', pageViews: 1639243 },
  { site: 'AMOREMALL', contentGroup: 'CART', url: 'https://www.amoremall.com/kr/ko/cart/cartList', pageViews: 655459 },
  { site: 'AMOREMALL', contentGroup: 'SEARCH_RESULT', url: 'https://www.amoremall.com/kr/ko/display/search', pageViews: 167885 },
  { site: 'AMOREMALL', contentGroup: 'BRAND_MAIN', url: 'https://www.amoremall.com/kr/ko/display/brand/detail', pageViews: 190398 },

  // INNISFREE
  { site: 'INNISFREE', contentGroup: 'MAIN', url: 'https://www.innisfree.com/kr/ko/', pageViews: 474796 },
  { site: 'INNISFREE', contentGroup: 'EVENT_DETAIL', url: 'https://www.innisfree.com/kr/ko/ca/event/102359', pageViews: 522256 },
  // INNISFREE MY 페이지는 edge case (옴니회원플랫폼으로 리다이렉트)

  // OSULLOC - 메인 URL 수정
  { site: 'OSULLOC', contentGroup: 'MAIN', url: 'https://www.osulloc.com/kr/ko/main', pageViews: 9487 },
  { site: 'OSULLOC', contentGroup: 'CART', url: 'https://www.osulloc.com/kr/ko/shop/cart', pageViews: 11958 },
  { site: 'OSULLOC', contentGroup: 'PRODUCT_LIST', url: 'https://www.osulloc.com/kr/ko/shop/category/ALL', pageViews: 5000 },

  // ILLIYOON
  { site: 'ILLIYOON', contentGroup: 'MAIN', url: 'https://www.illiyoon.com/', pageViews: 15131 },
  { site: 'ILLIYOON', contentGroup: 'PRODUCT_LIST', url: 'https://www.illiyoon.com/category/BEST/25/', pageViews: 6237 },

  // ARITAUM
  { site: 'ARITAUM', contentGroup: 'MAIN', url: 'https://www.aritaum.com/mweb/content/main.do', pageViews: 9873 },

  // ESPOIR
  { site: 'ESPOIR', contentGroup: 'MAIN', url: 'https://www.espoir.com/kr/ko/', pageViews: 5000 },

  // LABOH
  { site: 'LABOH', contentGroup: 'MAIN', url: 'https://www.laboh.co.kr/', pageViews: 3000 },

  // AESTURA
  { site: 'AESTURA', contentGroup: 'MAIN', url: 'https://www.aestura.com/', pageViews: 3000 },

  // BRDY
  { site: 'BRDY', contentGroup: 'MAIN', url: 'https://www.brdy.co.kr/', pageViews: 2000 },

  // AYUNCHE
  { site: 'AYUNCHE', contentGroup: 'MAIN', url: 'https://www.ayunche.com/', pageViews: 2000 },

  // AMOSPRO
  { site: 'AMOSPRO', contentGroup: 'MAIN', url: 'https://www.amospro.com/', pageViews: 1500 },
];

/**
 * 개발가이드 변수 수집 결과
 */
interface DevVariableResult {
  site: string;
  contentGroup: string;
  url: string;
  collectedAt: Date;
  devVariables: Record<string, string>;
  htmlLang: string | null;
  predictions: Array<{
    key: string;
    predicted: string | null;
    actual: string | null;
    match: boolean;
  }>;
  accuracy: number;
  errors: string[];
}

/**
 * 페이지에서 개발가이드 변수 수집
 */
async function collectDevVariables(page: Page, url: string): Promise<{
  variables: Record<string, string>;
  htmlLang: string | null;
  errors: string[];
}> {
  const variables: Record<string, string> = {};
  let htmlLang: string | null = null;
  const errors: string[] = [];

  try {
    // dataLayer 캡처 스크립트 주입
    await page.addInitScript(() => {
      (window as any).__capturedEvents = [];
      (window as any).dataLayer = (window as any).dataLayer || [];

      const originalPush = (window as any).dataLayer.push;
      (window as any).dataLayer.push = function(...args: any[]) {
        for (const arg of args) {
          (window as any).__capturedEvents.push(arg);
        }
        return originalPush ? originalPush.apply(this, args) : args.length;
      };
    });

    // 페이지 이동
    await page.goto(url, { timeout: 60000, waitUntil: 'domcontentloaded' });

    // 페이지 로딩 대기
    await page.waitForTimeout(5000);

    // AP_DATA 변수가 설정될 때까지 대기
    try {
      await page.waitForFunction(
        () => (window as any).AP_DATA_SITENAME || (window as any).AP_DATA_PAGETYPE,
        { timeout: 15000 }
      );
    } catch {
      errors.push('AP_DATA 변수 대기 타임아웃');
    }

    // 추가 대기
    await page.waitForTimeout(3000);

    // 0. html lang 속성 수집
    htmlLang = await page.evaluate(() => {
      const html = document.documentElement;
      return html.getAttribute('lang') || null;
    });

    // 1. window 전역 변수 수집 (전체 50개+)
    const windowVars = await page.evaluate(() => {
      const vars: Record<string, string> = {};
      const varNames = [
        // 기본 페이지 정보 (8개)
        'AP_DATA_SITENAME', 'AP_DATA_COUNTRY', 'AP_DATA_LANG', 'AP_DATA_ENV',
        'AP_DATA_CHANNEL', 'AP_DATA_PAGETYPE', 'AP_DATA_ISLOGIN', 'AP_DATA_BREAD',
        // 페이지 위치 변수 (5개)
        'AP_DATA_BREAD_1', 'AP_DATA_BREAD_2', 'AP_DATA_BREAD_3',
        'AP_DATA_BREAD_4', 'AP_DATA_BREAD_5',
        // 로그인 ID (6개)
        'AP_DATA_GCID', 'AP_DATA_CID', 'AP_DATA_GCID_1', 'AP_DATA_GCID_2',
        'AP_DATA_CID_1', 'AP_DATA_CID_2',
        // User Properties (11개)
        'AP_DATA_ISSSO', 'AP_DATA_CG', 'AP_DATA_CD', 'AP_DATA_AGE',
        'AP_DATA_CT', 'AP_DATA_BEAUTYCT', 'AP_DATA_ISEMPLOYEE', 'AP_DATA_ISMEMBER',
        'AP_DATA_LOGINTYPE', 'AP_DATA_ISSUBSCRIPTION',
        // 상품 정보 (PRODUCT_DETAIL) (8개)
        'AP_PRD_CODE', 'AP_PRD_NAME', 'AP_PRD_BRAND', 'AP_PRD_CATEGORY',
        'AP_PRD_BRANDCODE', 'AP_PRD_ISTOCK', 'AP_PRD_PRICE', 'AP_PRD_DISCOUNT',
        'AP_PRD_PRDPRICE', 'AP_PRD_APGBRCODE',
        // 이벤트/프로모션 (EVENT_DETAIL) (2개)
        'AP_PROMO_ID', 'AP_PROMO_NAME',
        // 브랜드 (BRAND_MAIN) (2개)
        'AP_BRAND_CODE', 'AP_BRAND_NAME',
        // 검색 (SEARCH_RESULT) (5개)
        'AP_SEARCH_BRAND_CODE', 'AP_SEARCH_BRAND', 'AP_SEARCH_TERM',
        'AP_SEARCH_RESULT', 'AP_SEARCH_NUM', 'AP_SEARCH_TYPE', 'AP_SEARCH_ITEMS_NUM',
        // 매장 관련 (2개)
        'AP_STORE_CODE', 'AP_STORE_NAME',
        // 통화 정보
        'AP_ECOMM_CURRENCY',
      ];

      for (const name of varNames) {
        const value = (window as any)[name];
        if (value !== undefined && value !== null && value !== '') {
          vars[name] = String(value);
        }
      }
      return vars;
    });
    Object.assign(variables, windowVars);

    // 2. dataLayer에서 추출
    const dataLayerVars = await page.evaluate(() => {
      const vars: Record<string, string> = {};
      const captured = (window as any).__capturedEvents || [];
      const dl = (window as any).dataLayer || [];
      const allItems = [...captured, ...dl];

      for (const item of allItems) {
        if (item && typeof item === 'object') {
          // AP_DATA_ 변수
          for (const [key, value] of Object.entries(item)) {
            if (key.startsWith('AP_DATA_') && value != null && value !== '') {
              vars[key] = String(value);
            }
          }

          // page_view 이벤트 파라미터
          if (item.event === 'page_view') {
            const mappings: Record<string, string> = {
              'site_name': 'AP_DATA_SITENAME',
              'site_country': 'AP_DATA_COUNTRY',
              'site_language': 'AP_DATA_LANG',
              'site_env': 'AP_DATA_ENV',
              'channel': 'AP_DATA_CHANNEL',
              'content_group': 'AP_DATA_PAGETYPE',
              'login_is_login': 'AP_DATA_ISLOGIN',
            };

            for (const [dlKey, apKey] of Object.entries(mappings)) {
              if (item[dlKey] && !vars[apKey]) {
                vars[apKey] = String(item[dlKey]);
              }
            }
          }
        }
      }
      return vars;
    });

    // dataLayer 값으로 보충
    for (const [key, value] of Object.entries(dataLayerVars)) {
      if (!variables[key]) {
        variables[key] = value;
      }
    }

    // 3. GTM 내부 변수 확인
    const gtmVars = await page.evaluate(() => {
      const vars: Record<string, string> = {};
      const gtm = (window as any).google_tag_manager;
      if (!gtm) return vars;

      for (const containerId of Object.keys(gtm)) {
        if (containerId.startsWith('GTM-')) {
          const container = gtm[containerId];
          if (container?.dataLayer?.get) {
            const dl = container.dataLayer;
            const gtmMappings: Record<string, string> = {
              'JS - Site Name': 'AP_DATA_SITENAME',
              'JS - Site Country': 'AP_DATA_COUNTRY',
              'JS - Site Language': 'AP_DATA_LANG',
              'JS - Site Env': 'AP_DATA_ENV',
              'JS - Channel': 'AP_DATA_CHANNEL',
              'JS - Content Group': 'AP_DATA_PAGETYPE',
              'JS - Login Is Login': 'AP_DATA_ISLOGIN',
            };

            for (const [gtmVar, apKey] of Object.entries(gtmMappings)) {
              try {
                const value = dl.get(gtmVar);
                if (value && !vars[apKey]) {
                  vars[apKey] = String(value);
                }
              } catch {
                // 무시
              }
            }
          }
        }
      }
      return vars;
    });

    for (const [key, value] of Object.entries(gtmVars)) {
      if (!variables[key]) {
        variables[key] = value;
      }
    }

  } catch (error: any) {
    errors.push(`페이지 로딩 오류: ${error.message}`);
  }

  return { variables, htmlLang, errors };
}

/**
 * 이벤트별 파라미터 정의
 *
 * 핵심: 파라미터가 어떤 이벤트에 속하는지 정확히 구분해야 함
 * - page_view: 모든 페이지에서 발생, 기본 페이지 정보 + 조건부 파라미터
 * - view_item: PRODUCT_DETAIL에서만 발생, 상품 가격 정보
 * - view_search_results: SEARCH_RESULT에서만 발생, 검색 결과 정보
 */

/**
 * page_view 이벤트 파라미터
 * 개발가이드 참조: PARAM_MAPPING_TABLE.md - page_view (333-348)
 */
const PAGE_VIEW_PARAMS: Record<string, { apDataKey: string; category: string; condition?: string; browserGenerated?: boolean }> = {
  // === 기본 페이지 정보 (8개) - 모든 페이지에서 수집 ===
  'site_name': { apDataKey: 'AP_DATA_SITENAME', category: 'basic' },
  'site_country': { apDataKey: 'AP_DATA_COUNTRY', category: 'basic' },
  'site_language': { apDataKey: 'AP_DATA_LANG', category: 'basic' },
  'site_env': { apDataKey: 'AP_DATA_ENV', category: 'basic' },
  'channel': { apDataKey: 'AP_DATA_CHANNEL', category: 'basic' },
  'content_group': { apDataKey: 'AP_DATA_PAGETYPE', category: 'basic' },
  'login_is_login': { apDataKey: 'AP_DATA_ISLOGIN', category: 'basic' },
  'breadcrumb': { apDataKey: 'AP_DATA_BREAD', category: 'basic' },

  // === 브라우저/내부 생성 파라미터 (3개) - GTM에서 자동 수집 ===
  'user_agent': { apDataKey: 'USER_AGENT', category: 'browser', browserGenerated: true },
  'traffic_type': { apDataKey: 'TRAFFIC_TYPE', category: 'browser', browserGenerated: true },
  'page_referrer': { apDataKey: 'PAGE_REFERRER', category: 'browser', browserGenerated: true },

  // === 페이지 위치 변수 (5개) - GTM 내부에서 breadcrumb 분할 ===
  'page_location_1': { apDataKey: 'AP_DATA_BREAD_1', category: 'page_location' },
  'page_location_2': { apDataKey: 'AP_DATA_BREAD_2', category: 'page_location' },
  'page_location_3': { apDataKey: 'AP_DATA_BREAD_3', category: 'page_location' },
  'page_location_4': { apDataKey: 'AP_DATA_BREAD_4', category: 'page_location' },
  'page_location_5': { apDataKey: 'AP_DATA_BREAD_5', category: 'page_location' },

  // === 로그인 ID 관련 (6개) - 로그인 시에만 값 존재 ===
  'login_id_gcid': { apDataKey: 'AP_DATA_GCID', category: 'login_id' },
  'login_id_cid': { apDataKey: 'AP_DATA_CID', category: 'login_id' },
  'login_id_gcid_1': { apDataKey: 'AP_DATA_GCID_1', category: 'login_id' },
  'login_id_gcid_2': { apDataKey: 'AP_DATA_GCID_2', category: 'login_id' },
  'login_id_cid_1': { apDataKey: 'AP_DATA_CID_1', category: 'login_id' },
  'login_id_cid_2': { apDataKey: 'AP_DATA_CID_2', category: 'login_id' },

  // === User Properties (11개) - 로그인 시에만 값 존재 ===
  'user_id': { apDataKey: 'AP_DATA_GCID', category: 'user_property' },
  'login_is_sso': { apDataKey: 'AP_DATA_ISSSO', category: 'user_property' },
  'login_gender': { apDataKey: 'AP_DATA_CG', category: 'user_property' },
  'login_birth': { apDataKey: 'AP_DATA_CD', category: 'user_property' },
  'login_age': { apDataKey: 'AP_DATA_AGE', category: 'user_property' },
  'login_level': { apDataKey: 'AP_DATA_CT', category: 'user_property' },
  'login_beauty_level': { apDataKey: 'AP_DATA_BEAUTYCT', category: 'user_property' },
  'login_is_member': { apDataKey: 'AP_DATA_ISMEMBER', category: 'user_property' },
  'login_is_employee': { apDataKey: 'AP_DATA_ISEMPLOYEE', category: 'user_property' },
  'login_method': { apDataKey: 'AP_DATA_LOGINTYPE', category: 'user_property' },
  'login_is_subscription': { apDataKey: 'AP_DATA_ISSUBSCRIPTION', category: 'user_property' },

  // === PRODUCT_DETAIL 조건부 (6개) - page_view에서 전송되는 상품 식별 정보만 ===
  // 참조: PARAM_MAPPING_TABLE.md 100-109라인
  // 주의: product_price, product_discount는 view_item 이벤트 파라미터임!
  'product_id': { apDataKey: 'AP_PRD_CODE', category: 'product', condition: 'PRODUCT_DETAIL' },
  'product_name': { apDataKey: 'AP_PRD_NAME', category: 'product', condition: 'PRODUCT_DETAIL' },
  'product_category': { apDataKey: 'AP_PRD_CATEGORY', category: 'product', condition: 'PRODUCT_DETAIL' },
  'product_brandname': { apDataKey: 'AP_PRD_BRAND', category: 'product', condition: 'PRODUCT_DETAIL' },
  'product_brandcode': { apDataKey: 'AP_PRD_BRANDCODE', category: 'product', condition: 'PRODUCT_DETAIL' },
  'product_is_stock': { apDataKey: 'AP_PRD_ISTOCK', category: 'product', condition: 'PRODUCT_DETAIL' },

  // === EVENT_DETAIL 조건부 (2개) ===
  // 참조: PARAM_MAPPING_TABLE.md 111-116라인
  'view_event_code': { apDataKey: 'AP_PROMO_ID', category: 'event', condition: 'EVENT_DETAIL' },
  'view_event_name': { apDataKey: 'AP_PROMO_NAME', category: 'event', condition: 'EVENT_DETAIL' },

  // === BRAND_MAIN 조건부 (2개) ===
  // 참조: PARAM_MAPPING_TABLE.md 118-123라인
  'brandshop_code': { apDataKey: 'AP_BRAND_CODE', category: 'brand', condition: 'BRAND_MAIN' },
  'brandshop_name': { apDataKey: 'AP_BRAND_NAME', category: 'brand', condition: 'BRAND_MAIN' },

  // === SEARCH_RESULT 조건부 (2개) - page_view에서 전송되는 검색 브랜드 정보만 ===
  // 참조: PARAM_MAPPING_TABLE.md 132-137라인
  // 주의: search_term, search_result, search_result_count는 view_search_results 이벤트 파라미터임!
  'search_brand_code': { apDataKey: 'AP_SEARCH_BRAND_CODE', category: 'search', condition: 'SEARCH_RESULT' },
  'search_brand': { apDataKey: 'AP_SEARCH_BRAND', category: 'search', condition: 'SEARCH_RESULT' },

  // === 매장 관련 조건부 (2개) ===
  // 참조: PARAM_MAPPING_TABLE.md 125-130라인
  'page_store_code': { apDataKey: 'AP_STORE_CODE', category: 'store', condition: 'STORE' },
  'page_store_name': { apDataKey: 'AP_STORE_NAME', category: 'store', condition: 'STORE' },
};

/**
 * view_item 이벤트 파라미터 (PRODUCT_DETAIL에서만 발생)
 * 개발가이드 참조: PARAM_MAPPING_TABLE.md - view_item (143-159)
 */
const VIEW_ITEM_PARAMS: Record<string, { apDataKey: string; category: string }> = {
  'price': { apDataKey: 'AP_PRD_PRICE', category: 'view_item' },
  'discount': { apDataKey: 'AP_PRD_DISCOUNT', category: 'view_item' },
  'prdprice': { apDataKey: 'AP_PRD_PRDPRICE', category: 'view_item' },
  'currency': { apDataKey: 'AP_ECOMM_CURRENCY', category: 'view_item' },
};

/**
 * view_search_results 이벤트 파라미터 (SEARCH_RESULT에서만 발생)
 * 개발가이드 참조: PARAM_MAPPING_TABLE.md - view_search_results (419-428)
 */
const VIEW_SEARCH_RESULTS_PARAMS: Record<string, { apDataKey: string; category: string }> = {
  'search_term': { apDataKey: 'AP_SEARCH_TERM', category: 'view_search_results' },
  'search_result': { apDataKey: 'AP_SEARCH_RESULT', category: 'view_search_results' },
  'search_result_count': { apDataKey: 'AP_SEARCH_NUM', category: 'view_search_results' },
};

// 현재 테스트는 page_view 이벤트 파라미터만 검증
const FULL_PARAM_MAPPING = PAGE_VIEW_PARAMS;

/**
 * 기본값으로 간주할 값들 (비적용 페이지에서 설정됨)
 */
const DEFAULT_VALUES = ['0', '', 'null', 'undefined'];

/**
 * 예측값과 실제값 비교 (전체 파라미터)
 */
function comparePredictions(
  predictions: PredictionResult[],
  actual: Record<string, string>,
  contentGroup: string
): Array<{
  key: string;
  predicted: string | null;
  actual: string | null;
  match: boolean;
  category: string;
  applicable: boolean;
  skipped?: boolean;
  skipReason?: string;
}> {
  const comparisons: Array<{
    key: string;
    predicted: string | null;
    actual: string | null;
    match: boolean;
    category: string;
    applicable: boolean;
    skipped?: boolean;
    skipReason?: string;
  }> = [];

  for (const [key, mapping] of Object.entries(FULL_PARAM_MAPPING)) {
    // 브라우저 생성 파라미터는 스킵
    if (mapping.browserGenerated) {
      comparisons.push({
        key,
        predicted: null,
        actual: null,
        match: true,
        category: mapping.category,
        applicable: false,
        skipped: true,
        skipReason: '브라우저/GTM 내부 생성 파라미터',
      });
      continue;
    }

    // 예측 결과 확인
    const pred = predictions.find(p => p.key === key);

    // 예측기에서 skip으로 마킹된 파라미터 (page_location, breadcrumb 등)
    if (pred?.confidence === 'skip') {
      comparisons.push({
        key,
        predicted: null,
        actual: actual[mapping.apDataKey] || null,
        match: true,
        category: mapping.category,
        applicable: false,
        skipped: true,
        skipReason: pred.notes || 'GTM/페이지 변수에서 수집',
      });
      continue;
    }

    // 조건부 파라미터 체크
    const applicable = !mapping.condition || mapping.condition === contentGroup;

    const actualValue = actual[mapping.apDataKey] || null;
    const predictedValue = pred?.predictedValue || null;

    // 비적용 페이지에서 기본값(0 등)이 수집된 경우 무시
    if (!applicable && actualValue !== null && DEFAULT_VALUES.includes(actualValue)) {
      comparisons.push({
        key,
        predicted: predictedValue,
        actual: actualValue,
        match: true,
        category: mapping.category,
        applicable: false,
        skipped: true,
        skipReason: '비적용 페이지의 기본값',
      });
      continue;
    }

    // 로그인 관련 파라미터는 로그인 상태에서만 비교
    const isLoginParam = mapping.category === 'login_id' || mapping.category === 'user_property';
    const isLoggedIn = actual['AP_DATA_ISLOGIN'] === 'Y';
    const loginApplicable = isLoginParam ? isLoggedIn : true;

    // 비로그인 상태에서 로그인 파라미터가 수집된 경우 → 데이터 품질 이슈 (SPA 잘못된 수집)
    // 이건 edge case가 아니라 버그임 - 비로그인 상태에서는 login 파라미터가 수집되면 안 됨
    if (isLoginParam && !isLoggedIn && actualValue !== null && actualValue !== '0' && actualValue !== '') {
      comparisons.push({
        key,
        predicted: predictedValue,
        actual: actualValue,
        match: false,  // 데이터 품질 이슈로 mismatch 처리
        category: mapping.category,
        applicable: true,  // 문제 있는 데이터로 플래그
        skipped: false,
        skipReason: undefined,
        dataQualityIssue: 'SPA 잘못된 수집 - 비로그인 상태에서 로그인 파라미터 수집됨',
      } as any);
      continue;
    }

    comparisons.push({
      key,
      predicted: predictedValue,
      actual: actualValue,
      match: predictedValue === actualValue || (!applicable && actualValue === null),
      category: mapping.category,
      applicable: applicable && loginApplicable,
    });
  }

  return comparisons;
}

/**
 * 단일 페이지 테스트 실행
 */
async function testSinglePage(
  browser: Browser,
  testPage: { site: string; contentGroup: string; url: string; pageViews: number },
  predictor: ValuePredictor,
  mismatchPatterns: Map<string, Array<{ site: string; predicted: string | null; actual: string | null; category: string; dataQualityIssue?: string }>>
): Promise<DevVariableResult> {
  const page = await browser.newPage();

  try {
    // 개발가이드 변수 수집
    const { variables, htmlLang, errors } = await collectDevVariables(page, testPage.url);

    // 예측 실행 (htmlLang 포함)
    const context: PredictionContext = {
      url: testPage.url,
      visionPageType: testPage.contentGroup,
      htmlLang: htmlLang || undefined,
    };
    const predictions = predictor.predictAll(context);

    // 비교 (전체 파라미터)
    const comparisons = comparePredictions(predictions, variables, testPage.contentGroup);

    // 불일치 패턴 기록 (applicable한 것만)
    for (const comp of comparisons) {
      if (comp.applicable && !comp.match && comp.actual !== null) {
        const patterns = mismatchPatterns.get(comp.key) || [];
        patterns.push({
          site: testPage.site,
          predicted: comp.predicted,
          actual: comp.actual,
          category: comp.category,
          dataQualityIssue: (comp as any).dataQualityIssue || undefined,
        });
        mismatchPatterns.set(comp.key, patterns);
      }
    }

    // applicable한 것들만 정확도 계산
    const applicableComps = comparisons.filter(c => c.applicable && c.actual !== null);
    const accuracy = applicableComps.length > 0
      ? (applicableComps.filter(c => c.match).length / applicableComps.length) * 100
      : 0;

    return {
      site: testPage.site,
      contentGroup: testPage.contentGroup,
      url: testPage.url,
      collectedAt: new Date(),
      devVariables: variables,
      htmlLang,
      predictions: comparisons.map(c => ({
        key: c.key,
        predicted: c.predicted,
        actual: c.actual,
        match: c.match,
      })),
      accuracy,
      errors,
    };

  } catch (error: any) {
    return {
      site: testPage.site,
      contentGroup: testPage.contentGroup,
      url: testPage.url,
      collectedAt: new Date(),
      devVariables: {},
      htmlLang: null,
      predictions: [],
      accuracy: 0,
      errors: [error.message],
    };
  } finally {
    await page.close();
  }
}

/**
 * 결과 출력
 */
function printResult(result: DevVariableResult): void {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📄 ${result.site} - ${result.contentGroup}`);
  console.log(`   URL: ${result.url}`);
  console.log(`   ✅ 수집된 변수: ${Object.keys(result.devVariables).length}개`);

  if (result.htmlLang) {
    console.log(`   🌐 HTML lang: ${result.htmlLang}`);
  }

  if (Object.keys(result.devVariables).length > 0) {
    // 주요 변수만 출력 (basic category)
    const basicVars = ['AP_DATA_SITENAME', 'AP_DATA_COUNTRY', 'AP_DATA_LANG', 'AP_DATA_PAGETYPE', 'AP_DATA_ISLOGIN'];
    for (const key of basicVars) {
      if (result.devVariables[key]) {
        console.log(`      ${key}: ${result.devVariables[key]}`);
      }
    }
    const otherVarsCount = Object.keys(result.devVariables).length - basicVars.filter(k => result.devVariables[k]).length;
    if (otherVarsCount > 0) {
      console.log(`      ... +${otherVarsCount}개 추가 변수`);
    }
  } else {
    console.log('   ⚠️ 변수 수집 실패');
    if (result.errors.length > 0) {
      for (const err of result.errors) {
        console.log(`      - ${err}`);
      }
    }
  }

  console.log('\n   [예측 vs 실제 비교 (applicable만)]');
  let matchCount = 0;
  let mismatchCount = 0;
  let skipCount = 0;
  let dataQualityIssueCount = 0;

  for (const comp of result.predictions) {
    // 스킵된 파라미터는 카운트만
    if ((comp as any).skipped) {
      skipCount++;
      continue;
    }

    // 데이터 품질 이슈 (SPA 잘못된 수집)
    if ((comp as any).dataQualityIssue) {
      console.log(`   ⚠️ ${comp.key}: 예측=${comp.predicted}, 실제=${comp.actual}`);
      console.log(`      └─ 🐛 ${(comp as any).dataQualityIssue}`);
      dataQualityIssueCount++;
      mismatchCount++;
      continue;
    }

    // applicable한 파라미터만 상세 출력
    if ((comp as any).applicable === false) {
      continue;
    }

    const icon = comp.match ? '✅' : '❌';
    console.log(`   ${icon} ${comp.key}: 예측=${comp.predicted}, 실제=${comp.actual}`);
    if (comp.match) matchCount++;
    else mismatchCount++;
  }

  if (skipCount > 0) {
    console.log(`   ⏭️ 스킵: ${skipCount}개 (GTM/페이지 변수, 비적용)`);
  }
  if (dataQualityIssueCount > 0) {
    console.log(`   🐛 데이터 품질 이슈: ${dataQualityIssueCount}개 (SPA 잘못된 수집)`);
  }

  console.log(`\n   📊 정확도: ${result.accuracy.toFixed(0)}% (적용 파라미터 기준)`);
}

/**
 * 메인 실행 (병렬 처리)
 */
async function main() {
  console.log('═'.repeat(80));
  console.log(' 개발가이드 변수 수집 및 예측 검증 (전체 파라미터, 병렬 4개)');
  console.log('═'.repeat(80));
  console.log(` 검증 대상: ${Object.keys(FULL_PARAM_MAPPING).length}개 파라미터`);

  const browser = await chromium.launch({ headless: true });
  const predictor = new ValuePredictor();
  const results: DevVariableResult[] = [];
  const mismatchPatterns: Map<string, Array<{
    site: string;
    predicted: string | null;
    actual: string | null;
    category: string;
    dataQualityIssue?: string;
  }>> = new Map();

  const PARALLEL_COUNT = 4;

  try {
    // 페이지를 4개씩 병렬로 처리
    for (let i = 0; i < TEST_PAGES.length; i += PARALLEL_COUNT) {
      const batch = TEST_PAGES.slice(i, i + PARALLEL_COUNT);
      console.log(`\n🚀 배치 ${Math.floor(i / PARALLEL_COUNT) + 1} 시작 (${batch.length}개 페이지 병렬 처리)`);

      // 병렬 실행
      const batchResults = await Promise.all(
        batch.map(testPage => testSinglePage(browser, testPage, predictor, mismatchPatterns))
      );

      // 결과 출력 및 저장
      for (const result of batchResults) {
        printResult(result);
        results.push(result);
      }
    }

  } finally {
    await browser.close();
  }

  // 전체 요약
  console.log('\n' + '█'.repeat(80));
  console.log(' 전체 분석 요약');
  console.log('█'.repeat(80));

  const successResults = results.filter(r => Object.keys(r.devVariables).length > 0);
  const avgAccuracy = successResults.length > 0
    ? successResults.reduce((sum, r) => sum + r.accuracy, 0) / successResults.length
    : 0;

  console.log(`\n📊 평균 정확도: ${avgAccuracy.toFixed(1)}%`);
  console.log(`📋 테스트한 페이지: ${results.length}개`);
  console.log(`✅ 성공: ${successResults.length}개`);
  console.log(`❌ 실패: ${results.length - successResults.length}개`);

  // 불일치 패턴을 데이터 품질 이슈와 일반 불일치로 분리
  const dataQualityIssues: Map<string, typeof mismatchPatterns extends Map<string, infer V> ? V : never> = new Map();
  const regularMismatches: Map<string, typeof mismatchPatterns extends Map<string, infer V> ? V : never> = new Map();

  for (const [key, patterns] of mismatchPatterns.entries()) {
    const qualityIssues = patterns.filter(p => p.dataQualityIssue);
    const regularOnes = patterns.filter(p => !p.dataQualityIssue);

    if (qualityIssues.length > 0) {
      dataQualityIssues.set(key, qualityIssues);
    }
    if (regularOnes.length > 0) {
      regularMismatches.set(key, regularOnes);
    }
  }

  // 데이터 품질 이슈 출력
  if (dataQualityIssues.size > 0) {
    console.log('\n[🐛 데이터 품질 이슈 (SPA 잘못된 수집)]');
    for (const [key, patterns] of dataQualityIssues.entries()) {
      console.log(`\n  ${key} (${patterns.length}건):`);
      for (const p of patterns) {
        console.log(`    - ${p.site}: 비로그인 상태에서 "${p.actual}" 수집됨`);
        console.log(`      └─ 원인: ${p.dataQualityIssue}`);
      }
    }
    console.log('\n  📋 권장 조치: GTM 트리거 타이밍 또는 SPA 페이지 전환 시 변수 초기화 로직 검토');
  }

  // 일반 불일치 패턴 분석
  if (regularMismatches.size > 0) {
    console.log('\n[불일치 패턴 분석]');
    for (const [key, patterns] of regularMismatches.entries()) {
      console.log(`\n  ${key} (${patterns.length}건 불일치):`);
      for (const p of patterns) {
        console.log(`    - ${p.site}: 예측=${p.predicted}, 실제=${p.actual}`);
      }
    }

    // 규칙 업데이트 제안
    console.log('\n[규칙 업데이트 제안]');
    for (const [key, patterns] of regularMismatches.entries()) {
      const actualValues = patterns.map(p => p.actual).filter(v => v);
      const uniqueActuals = [...new Set(actualValues)];

      if (uniqueActuals.length === 1) {
        console.log(`  [${key}] 모든 실제값이 "${uniqueActuals[0]}"로 동일`);
        console.log(`  → 해당 사이트들에 대해 고정값 "${uniqueActuals[0]}" 설정 고려`);
      } else {
        console.log(`  [${key}] 실제값 종류: ${uniqueActuals.join(', ')}`);
        console.log(`  → 사이트별 조건부 규칙 추가 고려`);
      }
    }
  } else if (dataQualityIssues.size === 0) {
    console.log('\n✨ 모든 예측이 정확합니다! 불일치 패턴 없음.');
  } else {
    console.log('\n✨ 예측 로직은 정확합니다! (데이터 품질 이슈만 발견됨)');
  }

  // 결과 저장
  const outputPath = path.join(process.cwd(), 'output/validation/dev_variables_analysis.json');
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify({
    analysisDate: new Date().toISOString(),
    totalPages: results.length,
    successfulPages: successResults.length,
    averageAccuracy: avgAccuracy,
    results,
    regularMismatches: Object.fromEntries(regularMismatches),
    dataQualityIssues: Object.fromEntries(dataQualityIssues),
  }, null, 2));

  console.log(`\n💾 결과 저장됨: ${outputPath}`);
  console.log('\n✅ 분석 완료!');
}

main().catch(console.error);
