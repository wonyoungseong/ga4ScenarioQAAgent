/**
 * Vision AI 예측 검증 - 전체 사이트 (토큰 없이)
 *
 * 모든 아모레퍼시픽 사이트의 주요 페이지 타입을 방문하여:
 * 1. 스크린샷 캡처
 * 2. Vision AI로 페이지 타입/변수 예측
 * 3. 실제 AP_DATA_* 변수 수집
 * 4. 예측값 vs 실제값 비교
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { GeminiVisionAnalyzer, PageVariablePrediction } from './analyzers/visionAnalyzer';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

// 테스트할 페이지 목록 (사이트별 주요 content_group - 조건부 파라미터 포함)
const TEST_PAGES: Array<{
  site: string;
  contentGroup: string;
  url: string;
  expectedVariables: {
    site_name: string;
    site_country: string;
    channel: string;
  };
}> = [
  // AMOREMALL - 다양한 페이지 타입
  { site: 'AMOREMALL', contentGroup: 'MAIN', url: 'https://www.amoremall.com/kr/ko/display/main', expectedVariables: { site_name: 'APMALL', site_country: 'KR', channel: 'PC' } },
  { site: 'AMOREMALL', contentGroup: 'PRODUCT_DETAIL', url: 'https://www.amoremall.com/kr/ko/product/detail?onlineProdSn=91736', expectedVariables: { site_name: 'APMALL', site_country: 'KR', channel: 'PC' } },
  { site: 'AMOREMALL', contentGroup: 'PRODUCT_LIST', url: 'https://www.amoremall.com/kr/ko/display/category/100000001', expectedVariables: { site_name: 'APMALL', site_country: 'KR', channel: 'PC' } },
  { site: 'AMOREMALL', contentGroup: 'CART', url: 'https://www.amoremall.com/kr/ko/cart/cartList', expectedVariables: { site_name: 'APMALL', site_country: 'KR', channel: 'PC' } },
  { site: 'AMOREMALL', contentGroup: 'SEARCH_RESULT', url: 'https://www.amoremall.com/kr/ko/search?keyword=설화수', expectedVariables: { site_name: 'APMALL', site_country: 'KR', channel: 'PC' } },

  // INNISFREE
  { site: 'INNISFREE', contentGroup: 'MAIN', url: 'https://www.innisfree.com/kr/ko/', expectedVariables: { site_name: 'INNISFREE', site_country: 'KR', channel: 'PC' } },
  { site: 'INNISFREE', contentGroup: 'PRODUCT_DETAIL', url: 'https://www.innisfree.com/kr/ko/product/10010077', expectedVariables: { site_name: 'INNISFREE', site_country: 'KR', channel: 'PC' } },

  // OSULLOC
  { site: 'OSULLOC', contentGroup: 'MAIN', url: 'https://www.osulloc.com/kr/ko/main', expectedVariables: { site_name: 'OSULLOC', site_country: 'KR', channel: 'PC' } },

  // ILLIYOON
  { site: 'ILLIYOON', contentGroup: 'MAIN', url: 'https://www.illiyoon.com/', expectedVariables: { site_name: 'ILLIYOON', site_country: 'KR', channel: 'PC' } },
  { site: 'ILLIYOON', contentGroup: 'PRODUCT_LIST', url: 'https://www.illiyoon.com/category/BEST/25/', expectedVariables: { site_name: 'ILLIYOON', site_country: 'KR', channel: 'PC' } },
  { site: 'ILLIYOON', contentGroup: 'PRODUCT_DETAIL', url: 'https://www.illiyoon.com/product/0044/', expectedVariables: { site_name: 'ILLIYOON', site_country: 'KR', channel: 'PC' } },

  // ARITAUM
  { site: 'ARITAUM', contentGroup: 'MAIN', url: 'https://www.aritaum.com/mweb/content/main.do', expectedVariables: { site_name: 'ARITAUM', site_country: 'KR', channel: 'PC' } },

  // ESPOIR
  { site: 'ESPOIR', contentGroup: 'MAIN', url: 'https://www.espoir.com/kr/ko/', expectedVariables: { site_name: 'ESPOIR', site_country: 'KR', channel: 'PC' } },

  // LABOH
  { site: 'LABOH', contentGroup: 'MAIN', url: 'https://www.laboh.co.kr/', expectedVariables: { site_name: 'LABOH', site_country: 'KR', channel: 'PC' } },
  { site: 'LABOH', contentGroup: 'PRODUCT_DETAIL', url: 'https://www.laboh.co.kr/product/detail.html?product_no=114', expectedVariables: { site_name: 'LABOH', site_country: 'KR', channel: 'PC' } },

  // AESTURA
  { site: 'AESTURA', contentGroup: 'MAIN', url: 'https://www.aestura.com/', expectedVariables: { site_name: 'AESTURA', site_country: 'KR', channel: 'PC' } },

  // BRDY
  { site: 'BRDY', contentGroup: 'MAIN', url: 'https://www.brdy.co.kr/', expectedVariables: { site_name: 'BRDY', site_country: 'KR', channel: 'PC' } },

  // AYUNCHE
  { site: 'AYUNCHE', contentGroup: 'MAIN', url: 'https://www.ayunche.com/', expectedVariables: { site_name: 'AYUNCHE', site_country: 'KR', channel: 'PC' } },

  // AMOSPRO
  { site: 'AMOSPRO', contentGroup: 'MAIN', url: 'https://www.amospro.com/', expectedVariables: { site_name: 'AMOSPRO', site_country: 'KR', channel: 'PC' } },
];

/**
 * 페이지 방문 및 변수 수집
 */
async function visitAndCollect(
  context: BrowserContext,
  url: string,
  screenshotDir: string,
  site: string,
  contentGroup: string
): Promise<{
  screenshotPath: string;
  actualVariables: Record<string, string>;
  htmlLang: string | null;
  errors: string[];
}> {
  const errors: string[] = [];
  const actualVariables: Record<string, string> = {};
  let htmlLang: string | null = null;

  const screenshotPath = path.join(
    screenshotDir,
    `${site}_${contentGroup}.png`
  );

  const page = await context.newPage();

  try {
    // dataLayer 캡처 스크립트 주입
    await page.addInitScript(() => {
      (window as any).__capturedEvents = [];
      (window as any).dataLayer = (window as any).dataLayer || [];
      const originalPush = (window as any).dataLayer.push;
      (window as any).dataLayer.push = function (...args: any[]) {
        for (const arg of args) {
          (window as any).__capturedEvents.push(arg);
        }
        return originalPush ? originalPush.apply(this, args) : args.length;
      };
    });

    await page.goto(url, { timeout: 60000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    // AP_DATA 변수 대기
    try {
      await page.waitForFunction(
        () => (window as any).AP_DATA_SITENAME || (window as any).AP_DATA_PAGETYPE,
        { timeout: 15000 }
      );
    } catch {
      errors.push('AP_DATA 변수 대기 타임아웃');
    }

    await page.waitForTimeout(2000);

    // 스크린샷 캡처
    await page.screenshot({ path: screenshotPath, fullPage: false });

    // html lang 속성
    htmlLang = await page.evaluate(() => {
      return document.documentElement.getAttribute('lang') || null;
    });

    // 전역 변수 수집
    const windowVars = await page.evaluate(() => {
      const vars: Record<string, string> = {};
      const varNames = [
        'AP_DATA_SITENAME', 'AP_DATA_COUNTRY', 'AP_DATA_LANG', 'AP_DATA_ENV',
        'AP_DATA_CHANNEL', 'AP_DATA_PAGETYPE', 'AP_DATA_ISLOGIN', 'AP_DATA_BREAD',
        'AP_DATA_GCID', 'AP_DATA_CID', 'AP_DATA_ISSSO', 'AP_DATA_CG', 'AP_DATA_CD',
        'AP_DATA_AGE', 'AP_DATA_CT', 'AP_DATA_BEAUTYCT', 'AP_DATA_ISEMPLOYEE',
        'AP_DATA_ISMEMBER', 'AP_DATA_LOGINTYPE', 'AP_DATA_ISSUBSCRIPTION',
        'AP_PRD_CODE', 'AP_PRD_NAME', 'AP_PRD_BRAND', 'AP_PRD_CATEGORY',
        'AP_PROMO_ID', 'AP_PROMO_NAME', 'AP_BRAND_CODE', 'AP_BRAND_NAME',
        'AP_SEARCH_TERM', 'AP_SEARCH_RESULT', 'AP_SEARCH_NUM',
      ];

      for (const name of varNames) {
        const value = (window as any)[name];
        if (value !== undefined && value !== null && value !== '') {
          vars[name] = String(value);
        }
      }
      return vars;
    });

    Object.assign(actualVariables, windowVars);

  } catch (error: any) {
    errors.push(`페이지 로딩 오류: ${error.message}`);
  } finally {
    await page.close();
  }

  return { screenshotPath, actualVariables, htmlLang, errors };
}

/**
 * 값 비교 유틸리티
 */
function compareValues(predicted: string | number | null | undefined, actual: string | null, variableName: string): boolean {
  if (predicted === null || predicted === undefined) {
    return actual === null || actual === '';
  }
  if (actual === null || actual === '') {
    return false;
  }

  const predStr = String(predicted).toUpperCase().replace(/-/g, '').trim();
  const actualStr = actual.toUpperCase().replace(/-/g, '').trim();

  // site_language 특수 처리 (ko-KR vs ko)
  if (variableName === 'site_language') {
    const predLang = String(predicted).split('-')[0].toLowerCase();
    const actualLang = actual.split('-')[0].toLowerCase();
    return predLang === actualLang;
  }

  // 숫자 비교 (price, count 등)
  if (['product_price', 'product_discount', 'search_result_count'].includes(variableName)) {
    const predNum = parseFloat(String(predicted).replace(/[^0-9.-]/g, ''));
    const actualNum = parseFloat(actual.replace(/[^0-9.-]/g, ''));
    return !isNaN(predNum) && !isNaN(actualNum) && predNum === actualNum;
  }

  return predStr === actualStr || predStr.includes(actualStr) || actualStr.includes(predStr);
}

/**
 * 예측값과 실제값 비교 (전체 45개+ 파라미터 확장)
 */
function comparePredictionWithActual(
  prediction: PageVariablePrediction | null,
  actual: Record<string, string>,
  expectedContentGroup: string
): Array<{
  variable: string;
  predicted: string | number | null;
  actual: string | null;
  match: boolean;
  category: 'common' | 'pageLocation' | 'conditional' | 'skip';
}> {
  const comparisons: Array<{
    variable: string;
    predicted: string | number | null;
    actual: string | null;
    match: boolean;
    category: 'common' | 'pageLocation' | 'conditional' | 'skip';
  }> = [];

  if (!prediction) {
    return comparisons;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. 공통 변수 매핑 (7개) - 모든 페이지에서 수집
  // ═══════════════════════════════════════════════════════════════════════════
  const commonMappings: Array<{ key: keyof PageVariablePrediction['variables']; apKey: string }> = [
    { key: 'site_name', apKey: 'AP_DATA_SITENAME' },
    { key: 'site_country', apKey: 'AP_DATA_COUNTRY' },
    { key: 'site_language', apKey: 'AP_DATA_LANG' },
    { key: 'site_env', apKey: 'AP_DATA_ENV' },
    { key: 'channel', apKey: 'AP_DATA_CHANNEL' },
    { key: 'content_group', apKey: 'AP_DATA_PAGETYPE' },
    { key: 'login_is_login', apKey: 'AP_DATA_ISLOGIN' },
  ];

  for (const { key, apKey } of commonMappings) {
    const predicted = prediction.variables[key] as string;
    const actualValue = actual[apKey] || null;
    const match = compareValues(predicted, actualValue, key);

    comparisons.push({
      variable: key,
      predicted: predicted || null,
      actual: actualValue,
      match,
      category: 'common',
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. 페이지 위치 변수 (URL 100자 분할, 5개)
  // page_location_1~5는 breadcrumb이 아니라 full URL을 100자 단위로 분할한 값
  // ═══════════════════════════════════════════════════════════════════════════
  const pageLocationVars = prediction.pageLocationVariables || {};
  const pageLocationMappings = [
    { key: 'page_location_1', apKey: 'AP_DATA_PAGELOC_1' },
    { key: 'page_location_2', apKey: 'AP_DATA_PAGELOC_2' },
    { key: 'page_location_3', apKey: 'AP_DATA_PAGELOC_3' },
    { key: 'page_location_4', apKey: 'AP_DATA_PAGELOC_4' },
    { key: 'page_location_5', apKey: 'AP_DATA_PAGELOC_5' },
  ];

  for (const { key, apKey } of pageLocationMappings) {
    const predicted = pageLocationVars[key as keyof typeof pageLocationVars];
    const actualValue = actual[apKey] || null;
    // 둘 다 null/undefined면 match
    const match = (!predicted && !actualValue) || compareValues(predicted, actualValue, key);
    comparisons.push({
      variable: key,
      predicted: predicted ?? null,
      actual: actualValue,
      match,
      category: 'pageLocation',
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. 조건부 변수 (페이지 타입별)
  // ═══════════════════════════════════════════════════════════════════════════
  const pageType = prediction.pageType;
  const conditionalVars = prediction.conditionalVariables || {};

  // ───────────────────────────────────────────────────────────────────────────
  // PRODUCT_DETAIL 전용 (10개)
  // ───────────────────────────────────────────────────────────────────────────
  if (pageType === 'PRODUCT_DETAIL') {
    const productMappings = [
      { key: 'product_id', apKey: 'AP_PRD_CODE' },
      { key: 'product_name', apKey: 'AP_PRD_NAME' },
      { key: 'product_brandname', apKey: 'AP_PRD_BRAND' },
      { key: 'product_brandcode', apKey: 'AP_PRD_BRANDCODE' },
      { key: 'product_category', apKey: 'AP_PRD_CATEGORY' },
      { key: 'product_price', apKey: 'AP_PRD_PRICE' },
      { key: 'product_prdprice', apKey: 'AP_PRD_PRDPRICE' },
      { key: 'product_discount', apKey: 'AP_PRD_DISCOUNT' },
      { key: 'product_is_stock', apKey: 'AP_PRD_ISTOCK' },
      { key: 'product_apg_brand_code', apKey: 'AP_PRD_APGBRCODE' },
    ];
    for (const { key, apKey } of productMappings) {
      const predicted = conditionalVars[key];
      const actualValue = actual[apKey] || null;
      comparisons.push({
        variable: key,
        predicted: predicted ?? null,
        actual: actualValue,
        match: compareValues(predicted, actualValue, key),
        category: 'conditional',
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SEARCH_RESULT 전용 (6개)
  // ───────────────────────────────────────────────────────────────────────────
  if (pageType === 'SEARCH_RESULT') {
    const searchMappings = [
      { key: 'search_term', apKey: 'AP_SEARCH_TERM' },
      { key: 'search_result', apKey: 'AP_SEARCH_RESULT' },
      { key: 'search_result_count', apKey: 'AP_SEARCH_NUM' },
      { key: 'search_type', apKey: 'AP_SEARCH_TYPE' },
      { key: 'search_brand_code', apKey: 'AP_SEARCH_BRANDCODE' },
      { key: 'search_brand', apKey: 'AP_SEARCH_BRAND' },
    ];
    for (const { key, apKey } of searchMappings) {
      const predicted = conditionalVars[key];
      const actualValue = actual[apKey] || null;
      comparisons.push({
        variable: key,
        predicted: predicted ?? null,
        actual: actualValue,
        match: compareValues(predicted, actualValue, key),
        category: 'conditional',
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CART 전용 (3개) - checkout_step 추가 (1=장바구니랜딩, 2=바로구매)
  // ───────────────────────────────────────────────────────────────────────────
  if (pageType === 'CART') {
    const cartMappings = [
      { key: 'cart_item_count', apKey: 'AP_CART_ITEMCOUNT' },
      { key: 'cart_total_price', apKey: 'AP_CART_TOTALPRICE' },
      { key: 'checkout_step', apKey: 'AP_ORDER_STEP' },  // 1=장바구니랜딩, 2=바로구매
    ];
    for (const { key, apKey } of cartMappings) {
      const predicted = conditionalVars[key];
      const actualValue = actual[apKey] || null;
      comparisons.push({
        variable: key,
        predicted: predicted ?? null,
        actual: actualValue,
        match: compareValues(predicted, actualValue, key),
        category: 'conditional',
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ORDER 전용 (3개)
  // ───────────────────────────────────────────────────────────────────────────
  if (pageType === 'ORDER') {
    const orderMappings = [
      { key: 'checkout_step', apKey: 'AP_ORDER_STEP' },
      { key: 'payment_type', apKey: 'AP_ORDER_PAYTYPE' },
      { key: 'coupon_name', apKey: 'AP_ORDER_COUPON' },
    ];
    for (const { key, apKey } of orderMappings) {
      const predicted = conditionalVars[key];
      const actualValue = actual[apKey] || null;
      comparisons.push({
        variable: key,
        predicted: predicted ?? null,
        actual: actualValue,
        match: compareValues(predicted, actualValue, key),
        category: 'conditional',
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ORDER_COMPLETE 전용 (5개)
  // ───────────────────────────────────────────────────────────────────────────
  if (pageType === 'ORDER_COMPLETE') {
    const purchaseMappings = [
      { key: 'transaction_id', apKey: 'AP_PURCHASE_ORDERNUM' },
      { key: 'transaction_value', apKey: 'AP_PURCHASE_PRICE' },
      { key: 'transaction_shipping', apKey: 'AP_PURCHASE_SHIPPING' },
      { key: 'coupon_code', apKey: 'AP_PURCHASE_COUPONNO' },
      { key: 'payment_type', apKey: 'AP_PURCHASE_TYPE' },
    ];
    for (const { key, apKey } of purchaseMappings) {
      const predicted = conditionalVars[key];
      const actualValue = actual[apKey] || null;
      comparisons.push({
        variable: key,
        predicted: predicted ?? null,
        actual: actualValue,
        match: compareValues(predicted, actualValue, key),
        category: 'conditional',
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // EVENT_DETAIL 전용 (2개)
  // ───────────────────────────────────────────────────────────────────────────
  if (pageType === 'EVENT_DETAIL') {
    const eventMappings = [
      { key: 'view_event_code', apKey: 'AP_PROMO_ID' },
      { key: 'view_event_name', apKey: 'AP_PROMO_NAME' },
    ];
    for (const { key, apKey } of eventMappings) {
      const predicted = conditionalVars[key];
      const actualValue = actual[apKey] || null;
      comparisons.push({
        variable: key,
        predicted: predicted ?? null,
        actual: actualValue,
        match: compareValues(predicted, actualValue, key),
        category: 'conditional',
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // BRAND_MAIN 전용 (2개)
  // ───────────────────────────────────────────────────────────────────────────
  if (pageType === 'BRAND_MAIN') {
    const brandMappings = [
      { key: 'brandshop_code', apKey: 'AP_BRAND_CODE' },
      { key: 'brandshop_name', apKey: 'AP_BRAND_NAME' },
    ];
    for (const { key, apKey } of brandMappings) {
      const predicted = conditionalVars[key];
      const actualValue = actual[apKey] || null;
      comparisons.push({
        variable: key,
        predicted: predicted ?? null,
        actual: actualValue,
        match: compareValues(predicted, actualValue, key),
        category: 'conditional',
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STORE 전용 (2개)
  // ───────────────────────────────────────────────────────────────────────────
  if (pageType === 'STORE') {
    const storeMappings = [
      { key: 'page_store_code', apKey: 'AP_STORE_CODE' },
      { key: 'page_store_name', apKey: 'AP_STORE_NAME' },
    ];
    for (const { key, apKey } of storeMappings) {
      const predicted = conditionalVars[key];
      const actualValue = actual[apKey] || null;
      comparisons.push({
        variable: key,
        predicted: predicted ?? null,
        actual: actualValue,
        match: compareValues(predicted, actualValue, key),
        category: 'conditional',
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PRODUCT_LIST 전용 (카테고리 정보)
  // ───────────────────────────────────────────────────────────────────────────
  if (pageType === 'PRODUCT_LIST') {
    const listMappings = [
      { key: 'category_code', apKey: 'AP_CATEGORY_CODE' },
      { key: 'category_name', apKey: 'AP_CATEGORY_NAME' },
    ];
    for (const { key, apKey } of listMappings) {
      const predicted = conditionalVars[key];
      const actualValue = actual[apKey] || null;
      comparisons.push({
        variable: key,
        predicted: predicted ?? null,
        actual: actualValue,
        match: compareValues(predicted, actualValue, key),
        category: 'conditional',
      });
    }
  }

  return comparisons;
}

/**
 * 메인 검증 실행
 */
async function main() {
  console.log('═'.repeat(80));
  console.log(' Vision AI 예측 검증 - 전체 사이트');
  console.log('═'.repeat(80));

  // Gemini API 키 확인
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error('❌ GEMINI_API_KEY가 설정되지 않았습니다.');
    process.exit(1);
  }

  // 출력 디렉토리
  const outputDir = path.join(process.cwd(), 'output', 'vision-validation');
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

  console.log(`\n📋 테스트 대상: ${TEST_PAGES.length}개 페이지`);

  // 전체 결과 저장
  const allResults: Array<{
    site: string;
    contentGroup: string;
    url: string;
    prediction: PageVariablePrediction | null;
    actualVariables: Record<string, string>;
    comparisons: Array<{
      variable: string;
      predicted: string | number | null;
      actual: string | null;
      match: boolean;
      category: 'common' | 'pageLocation' | 'conditional' | 'skip';
    }>;
    accuracy: number;
    errors: string[];
  }> = [];

  let totalComparisons = 0;
  let totalMatches = 0;
  let currentSite = '';

  // 각 페이지 처리
  for (let i = 0; i < TEST_PAGES.length; i++) {
    const testPage = TEST_PAGES[i];

    // 사이트 변경 시 구분선
    if (testPage.site !== currentSite) {
      currentSite = testPage.site;
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`🏢 ${currentSite}`);
      console.log(`${'═'.repeat(60)}`);
    }

    console.log(`\n[${i + 1}/${TEST_PAGES.length}] ${testPage.contentGroup}`);
    console.log(`   URL: ${testPage.url}`);

    try {
      // 1. 페이지 방문 및 변수 수집
      console.log(`   📷 페이지 방문 중...`);
      const { screenshotPath, actualVariables, htmlLang, errors } = await visitAndCollect(
        context,
        testPage.url,
        screenshotDir,
        testPage.site,
        testPage.contentGroup
      );

      if (errors.length > 0) {
        console.log(`   ⚠️ 수집 오류: ${errors.join(', ')}`);
      }

      // 실제 수집된 변수 출력 (공통 + 조건부)
      const collectedCount = Object.keys(actualVariables).length;
      console.log(`   📥 수집된 변수 (${collectedCount}개):`);
      console.log(`      [공통] site=${actualVariables['AP_DATA_SITENAME'] || '-'}, country=${actualVariables['AP_DATA_COUNTRY'] || '-'}, channel=${actualVariables['AP_DATA_CHANNEL'] || '-'}, pageType=${actualVariables['AP_DATA_PAGETYPE'] || '-'}`);

      // 조건부 변수 출력
      if (actualVariables['AP_PRD_CODE'] || actualVariables['AP_PRD_NAME']) {
        console.log(`      [상품] code=${actualVariables['AP_PRD_CODE'] || '-'}, name=${actualVariables['AP_PRD_NAME'] || '-'}, brand=${actualVariables['AP_PRD_BRAND'] || '-'}`);
      }
      if (actualVariables['AP_SEARCH_TERM']) {
        console.log(`      [검색] term=${actualVariables['AP_SEARCH_TERM'] || '-'}, result=${actualVariables['AP_SEARCH_RESULT'] || '-'}, count=${actualVariables['AP_SEARCH_NUM'] || '-'}`);
      }
      if (actualVariables['AP_PROMO_ID'] || actualVariables['AP_PROMO_NAME']) {
        console.log(`      [이벤트] code=${actualVariables['AP_PROMO_ID'] || '-'}, name=${actualVariables['AP_PROMO_NAME'] || '-'}`);
      }
      if (actualVariables['AP_BRAND_CODE'] || actualVariables['AP_BRAND_NAME']) {
        console.log(`      [브랜드] code=${actualVariables['AP_BRAND_CODE'] || '-'}, name=${actualVariables['AP_BRAND_NAME'] || '-'}`);
      }

      // 2. Vision AI 예측
      console.log(`   🔍 Vision AI 예측 중...`);
      let prediction: PageVariablePrediction | null = null;
      try {
        prediction = await visionAnalyzer.predictPageVariables(screenshotPath, testPage.url, {
          viewport: { width: 1920, height: 1080 }
        });
        console.log(`   ✓ 예측 완료: ${prediction.pageType} (${prediction.confidence})`);

        // 조건부 변수 예측 결과
        if (prediction.conditionalVariables && Object.keys(prediction.conditionalVariables).length > 0) {
          const condVars = prediction.conditionalVariables;
          const condKeys = Object.keys(condVars).filter(k => !k.startsWith('//'));
          if (condKeys.length > 0) {
            console.log(`   📌 조건부 변수 예측: ${condKeys.map(k => `${k}=${condVars[k]}`).join(', ')}`);
          }
        }
      } catch (error: any) {
        console.log(`   ❌ Vision AI 오류: ${error.message}`);
        errors.push(`Vision AI: ${error.message}`);
      }

      // 3. 비교
      const comparisons = comparePredictionWithActual(prediction, actualVariables, testPage.contentGroup);
      const commonComps = comparisons.filter(c => c.category === 'common');
      const pageLocationComps = comparisons.filter(c => c.category === 'pageLocation');
      const conditionalComps = comparisons.filter(c => c.category === 'conditional');

      const commonMatches = commonComps.filter(c => c.match).length;
      const pageLocationMatches = pageLocationComps.filter(c => c.match).length;
      const conditionalMatches = conditionalComps.filter(c => c.match).length;
      const matchCount = commonMatches + pageLocationMatches + conditionalMatches;
      const accuracy = comparisons.length > 0 ? (matchCount / comparisons.length) * 100 : 0;

      totalComparisons += comparisons.length;
      totalMatches += matchCount;

      // 비교 결과 출력 (공통/위치/조건부 구분)
      const commonAcc = commonComps.length > 0 ? (commonMatches / commonComps.length * 100).toFixed(0) : '-';
      const locAcc = pageLocationComps.length > 0 ? (pageLocationMatches / pageLocationComps.length * 100).toFixed(0) : '-';
      const condAcc = conditionalComps.length > 0 ? (conditionalMatches / conditionalComps.length * 100).toFixed(0) : '-';
      console.log(`   📊 비교 결과 (전체 ${accuracy.toFixed(0)}% | 공통 ${commonAcc}% | 위치 ${locAcc}% | 조건부 ${condAcc}%):`);

      // 공통 변수
      console.log(`      [공통 변수 ${commonMatches}/${commonComps.length}]`);
      for (const comp of commonComps) {
        const icon = comp.match ? '✅' : '❌';
        console.log(`         ${icon} ${comp.variable}: "${comp.predicted}" vs "${comp.actual}"`);
      }

      // 페이지 위치 변수 (null이 아닌 것만 표시)
      const relevantLocationComps = pageLocationComps.filter(c => c.predicted || c.actual);
      if (relevantLocationComps.length > 0) {
        const locMatches = relevantLocationComps.filter(c => c.match).length;
        console.log(`      [위치 변수 ${locMatches}/${relevantLocationComps.length}]`);
        for (const comp of relevantLocationComps) {
          const icon = comp.match ? '✅' : '❌';
          console.log(`         ${icon} ${comp.variable}: "${comp.predicted}" vs "${comp.actual}"`);
        }
      }

      // 조건부 변수
      if (conditionalComps.length > 0) {
        console.log(`      [조건부 변수 ${conditionalMatches}/${conditionalComps.length}]`);
        for (const comp of conditionalComps) {
          const icon = comp.match ? '✅' : '❌';
          console.log(`         ${icon} ${comp.variable}: "${comp.predicted}" vs "${comp.actual}"`);
        }
      }

      // 결과 저장
      allResults.push({
        site: testPage.site,
        contentGroup: testPage.contentGroup,
        url: testPage.url,
        prediction,
        actualVariables,
        comparisons,
        accuracy,
        errors,
      });

    } catch (error: any) {
      console.log(`   ❌ 처리 오류: ${error.message}`);
      allResults.push({
        site: testPage.site,
        contentGroup: testPage.contentGroup,
        url: testPage.url,
        prediction: null,
        actualVariables: {},
        comparisons: [],
        accuracy: 0,
        errors: [error.message],
      });
    }

    // API 속도 제한 방지
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  await browser.close();

  // 전체 결과 요약
  console.log('\n' + '█'.repeat(80));
  console.log(' 전체 검증 결과 요약');
  console.log('█'.repeat(80));

  const overallAccuracy = totalComparisons > 0 ? (totalMatches / totalComparisons) * 100 : 0;

  console.log(`\n📊 전체 정확도: ${overallAccuracy.toFixed(1)}% (${totalMatches}/${totalComparisons})`);
  console.log(`📋 검증된 페이지: ${allResults.length}개`);

  // 사이트별 정확도
  console.log('\n[사이트별 정확도]');
  const siteStats = new Map<string, { total: number; matches: number }>();
  for (const result of allResults) {
    const stat = siteStats.get(result.site) || { total: 0, matches: 0 };
    stat.total += result.comparisons.length;
    stat.matches += result.comparisons.filter(c => c.match).length;
    siteStats.set(result.site, stat);
  }

  for (const [site, stat] of siteStats.entries()) {
    const acc = stat.total > 0 ? (stat.matches / stat.total) * 100 : 0;
    const icon = acc >= 90 ? '✅' : acc >= 70 ? '⚠️' : '❌';
    console.log(`   ${icon} ${site}: ${acc.toFixed(0)}% (${stat.matches}/${stat.total})`);
  }

  // 변수별 정확도 (공통/위치/조건부 구분)
  console.log('\n[공통 변수 정확도]');
  const commonVariableStats = new Map<string, { total: number; matches: number }>();
  const pageLocationVariableStats = new Map<string, { total: number; matches: number }>();
  const conditionalVariableStats = new Map<string, { total: number; matches: number }>();

  for (const result of allResults) {
    for (const comp of result.comparisons) {
      let statsMap: Map<string, { total: number; matches: number }>;
      if (comp.category === 'common') statsMap = commonVariableStats;
      else if (comp.category === 'pageLocation') statsMap = pageLocationVariableStats;
      else statsMap = conditionalVariableStats;

      const stat = statsMap.get(comp.variable) || { total: 0, matches: 0 };
      stat.total++;
      if (comp.match) stat.matches++;
      statsMap.set(comp.variable, stat);
    }
  }

  for (const [variable, stat] of commonVariableStats.entries()) {
    const acc = stat.total > 0 ? (stat.matches / stat.total) * 100 : 0;
    const icon = acc >= 90 ? '✅' : acc >= 70 ? '⚠️' : '❌';
    console.log(`   ${icon} ${variable}: ${acc.toFixed(0)}% (${stat.matches}/${stat.total})`);
  }

  if (pageLocationVariableStats.size > 0) {
    console.log('\n[위치 변수 정확도 (URL 100자 분할)]');
    for (const [variable, stat] of pageLocationVariableStats.entries()) {
      const acc = stat.total > 0 ? (stat.matches / stat.total) * 100 : 0;
      const icon = acc >= 90 ? '✅' : acc >= 70 ? '⚠️' : '❌';
      console.log(`   ${icon} ${variable}: ${acc.toFixed(0)}% (${stat.matches}/${stat.total})`);
    }
  }

  if (conditionalVariableStats.size > 0) {
    console.log('\n[조건부 변수 정확도]');
    for (const [variable, stat] of conditionalVariableStats.entries()) {
      const acc = stat.total > 0 ? (stat.matches / stat.total) * 100 : 0;
      const icon = acc >= 90 ? '✅' : acc >= 70 ? '⚠️' : '❌';
      console.log(`   ${icon} ${variable}: ${acc.toFixed(0)}% (${stat.matches}/${stat.total})`);
    }
  }

  // 전체 변수 통계
  const variableStats = new Map([...commonVariableStats, ...pageLocationVariableStats, ...conditionalVariableStats]);

  // 불일치 패턴 분석
  const mismatches = allResults.flatMap(r =>
    r.comparisons.filter(c => !c.match).map(c => ({
      site: r.site,
      contentGroup: r.contentGroup,
      ...c,
    }))
  );

  if (mismatches.length > 0) {
    console.log('\n[불일치 상세]');
    for (const m of mismatches) {
      console.log(`   ❌ ${m.site}/${m.contentGroup} - ${m.variable}: 예측="${m.predicted}" vs 실제="${m.actual}"`);
    }
  }

  // 결과 저장
  const resultPath = path.join(outputDir, 'validation-results.json');
  fs.writeFileSync(resultPath, JSON.stringify({
    validationDate: new Date().toISOString(),
    overallAccuracy,
    totalComparisons,
    totalMatches,
    siteStats: Object.fromEntries(siteStats),
    variableStats: Object.fromEntries(variableStats),
    results: allResults,
    mismatches,
  }, null, 2));

  console.log(`\n💾 결과 저장: ${resultPath}`);
  console.log('\n✅ 검증 완료!');
}

main().catch(console.error);
