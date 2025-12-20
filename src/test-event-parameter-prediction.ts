/**
 * 이벤트 파라미터 예측 테스트
 *
 * GTM에서 이벤트 목록을 추출하고, 각 이벤트별 대표 페이지 5곳에서
 * Vision AI 예측과 실제 수집된 파라미터를 비교합니다.
 */

import { chromium, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { GA4Client } from './ga4/ga4Client';
import { GeminiVisionAnalyzer, PageVariablePrediction } from './analyzers/visionAnalyzer';
import { EventParameterScenarioGenerator, EventScenario } from './prediction/eventParameterScenarioGenerator';
import { EventParameterValidator, EventValidationResult, ValidationReport } from './validation/eventParameterValidator';

dotenv.config();

// 테스트할 이벤트 목록 (전체)
// 제외: purchase, remove_from_cart, sign_up, login (로그인/구매 필요)
const TARGET_EVENTS = [
  // 페이지 로드 시 자동 발생
  'page_view',
  'view_item',          // PRODUCT_DETAIL - 상품 정보 예측
  'view_item_list',     // PRODUCT_LIST/SEARCH - 검색 정보 예측
  'view_cart',          // CART - 장바구니 정보 예측
  'view_promotion',     // MAIN - 프로모션 정보 예측
  // 사용자 액션 필요
  'select_item',        // 상품 클릭
  'add_to_cart',        // 장바구니 추가 클릭
  'select_promotion',   // 프로모션 클릭
  'scroll',             // 스크롤 액션
  'ap_click',           // 일반 클릭
  // 제외 (로그인 필요): 'begin_checkout', 'purchase', 'remove_from_cart', 'login', 'sign_up'
];

// 이벤트별 테스트 페이지 URL (GA4 API 폴백용)
// AP_DATA 변수가 정상 로딩되는 페이지만 사용
const DEFAULT_TEST_PAGES: Record<string, string[]> = {
  'page_view': [
    'https://www.amoremall.com/kr/ko/display/main',
    'https://www.amoremall.com/kr/ko/product/detail?onlineProdSn=91736',
    'https://www.amoremall.com/kr/ko/cart/cartList',
  ],
  'view_item': [
    // PRODUCT_DETAIL 페이지 - 상품 정보 예측 가능
    'https://www.amoremall.com/kr/ko/product/detail?onlineProdSn=91736',
    'https://www.amoremall.com/kr/ko/product/detail?onlineProdSn=85851',
  ],
  'view_item_list': [
    // MAIN 페이지에서 상품 리스트 섹션 (상품 리스트 이벤트가 발생하는 다른 페이지)
    'https://www.amoremall.com/kr/ko/display/main',
  ],
  'view_cart': [
    // CART 페이지 - 장바구니 정보 예측 가능
    'https://www.amoremall.com/kr/ko/cart/cartList',
  ],
  'view_promotion': [
    // MAIN 페이지 - 프로모션 정보 예측 가능
    'https://www.amoremall.com/kr/ko/display/main',
    'https://www.amoremall.com/kr/ko/product/detail?onlineProdSn=91736',
  ],
  'select_item': [
    // 상품 목록에서 상품 클릭
    'https://www.amoremall.com/kr/ko/display/main',
  ],
  'add_to_cart': [
    // 상품 상세에서 장바구니 추가
    'https://www.amoremall.com/kr/ko/product/detail?onlineProdSn=91736',
  ],
  'select_promotion': [
    // 프로모션 배너 클릭
    'https://www.amoremall.com/kr/ko/display/main',
  ],
  'scroll': [
    // 스크롤 이벤트 발생 페이지
    'https://www.amoremall.com/kr/ko/display/main',
    'https://www.amoremall.com/kr/ko/product/detail?onlineProdSn=91736',
  ],
  'ap_click': [
    // 일반 클릭 이벤트
    'https://www.amoremall.com/kr/ko/display/main',
  ],
};

/**
 * 이벤트별 액션 정의
 */
interface EventAction {
  type: 'none' | 'click' | 'scroll' | 'hover';
  selector?: string;
  scrollAmount?: number;
  description: string;
}

const EVENT_ACTIONS: Record<string, EventAction> = {
  'page_view': { type: 'none', description: '페이지 로드 시 자동 발생' },
  'view_item': { type: 'none', description: '상품 상세 페이지 로드 시 자동 발생' },
  'view_item_list': { type: 'none', description: '상품 목록 노출 시 자동 발생' },
  'view_cart': { type: 'none', description: '장바구니 페이지 로드 시 자동 발생' },
  'view_promotion': { type: 'none', description: '프로모션 노출 시 자동 발생' },
  'select_item': {
    type: 'click',
    selector: '.product-card a, .prd-item a, [data-gtm-product] a, .swiper-slide a[href*="product"]',
    description: '상품 클릭'
  },
  'add_to_cart': {
    type: 'click',
    selector: '.btn-cart, .add-cart, [class*="cart"] button, button[class*="장바구니"]',
    description: '장바구니 추가 버튼 클릭'
  },
  'select_promotion': {
    type: 'click',
    selector: '.banner a, .promotion a, .swiper-slide a[href*="event"], [class*="banner"] a',
    description: '프로모션 배너 클릭'
  },
  'scroll': {
    type: 'scroll',
    scrollAmount: 1000,
    description: '페이지 스크롤'
  },
  'ap_click': {
    type: 'click',
    selector: 'a[href], button',
    description: '일반 요소 클릭'
  },
};

/**
 * 페이지 방문 및 변수 수집
 */
async function visitAndCollect(
  context: BrowserContext,
  url: string,
  screenshotDir: string,
  eventName: string,
  index: number
): Promise<{
  screenshotPath: string;
  actualVariables: Record<string, string>;
  dataLayerEvents: any[];
  errors: string[];
}> {
  const errors: string[] = [];
  const actualVariables: Record<string, string> = {};
  let dataLayerEvents: any[] = [];

  const screenshotPath = path.join(screenshotDir, `${eventName}_${index}.png`);

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
    await page.waitForTimeout(3000);

    // AP_DATA 변수 대기 (최대 3회 시도)
    let apDataFound = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await page.waitForFunction(
          () => {
            const w = window as any;
            return (w.AP_DATA_SITENAME && w.AP_DATA_SITENAME !== '') ||
                   (w.AP_DATA_PAGETYPE && w.AP_DATA_PAGETYPE !== '') ||
                   (w.dataLayer && w.dataLayer.length > 5);
          },
          { timeout: 8000 }
        );
        apDataFound = true;
        break;
      } catch {
        if (attempt < 2) {
          // 추가 대기 후 재시도
          await page.waitForTimeout(2000);
        }
      }
    }

    if (!apDataFound) {
      errors.push('AP_DATA 변수 대기 타임아웃 (3회 시도)');
    }

    await page.waitForTimeout(1500);

    // 전역 변수 수집 함수
    const collectWindowVars = async () => {
      return await page.evaluate(() => {
        const vars: Record<string, string> = {};
        const varNames = [
          'AP_DATA_SITENAME', 'AP_DATA_COUNTRY', 'AP_DATA_LANG', 'AP_DATA_ENV',
          'AP_DATA_CHANNEL', 'AP_DATA_PAGETYPE', 'AP_DATA_ISLOGIN',
          'AP_PRD_CODE', 'AP_PRD_NAME', 'AP_PRD_BRAND', 'AP_PRD_CATEGORY',
          'AP_PRD_PRICE', 'AP_PRD_PRDPRICE', 'AP_PRD_DISCOUNT',
          'AP_PROMO_ID', 'AP_PROMO_NAME',
          'AP_SEARCH_TERM', 'AP_SEARCH_RESULT', 'AP_SEARCH_NUM',
          'AP_CART_ITEMCOUNT', 'AP_CART_TOTALPRICE',
          'AP_ORDER_STEP', 'AP_ORDER_PAYTYPE',
          'AP_PURCHASE_ORDERNUM', 'AP_PURCHASE_PRICE',
        ];

        for (const name of varNames) {
          const value = (window as any)[name];
          if (value !== undefined && value !== null && value !== '') {
            vars[name] = String(value);
          }
        }
        return vars;
      });
    };

    // 이벤트별 액션 실행
    const action = EVENT_ACTIONS[eventName];
    if (action && action.type !== 'none') {
      try {
        if (action.type === 'scroll' && action.scrollAmount) {
          // 스크롤 액션
          await page.evaluate((amount) => {
            window.scrollBy(0, amount);
          }, action.scrollAmount);
          await page.waitForTimeout(1000);
          // 스크롤 후 변수 수집
          const windowVars = await collectWindowVars();
          Object.assign(actualVariables, windowVars);
        } else if (action.type === 'click' && action.selector) {
          // 클릭 이벤트: 클릭 전에 변수 수집 (dataLayer 이벤트는 클릭 시점에 발생)
          const windowVars = await collectWindowVars();
          Object.assign(actualVariables, windowVars);

          // 클릭 액션 - 요소 찾기
          const element = await page.$(action.selector);
          if (element) {
            // 요소로 스크롤 후 클릭
            await element.scrollIntoViewIfNeeded();
            await page.waitForTimeout(500);

            // 클릭 (이벤트만 발생, 네비게이션 방지)
            await element.dispatchEvent('click');
            await page.waitForTimeout(500);
          } else {
            errors.push(`액션 요소를 찾을 수 없음: ${action.selector}`);
          }
        }
      } catch (actionError: any) {
        errors.push(`액션 실행 오류: ${actionError.message}`);
      }
    } else {
      // 액션 없음: 페이지 로드 후 변수 수집
      const windowVars = await collectWindowVars();
      Object.assign(actualVariables, windowVars);
    }

    // 스크린샷 캡처
    await page.screenshot({ path: screenshotPath, fullPage: false });

    // dataLayer 이벤트 수집
    dataLayerEvents = await page.evaluate(() => {
      return (window as any).__capturedEvents || [];
    });

  } catch (error: any) {
    errors.push(`페이지 로딩 오류: ${error.message}`);
  } finally {
    await page.close();
  }

  return { screenshotPath, actualVariables, dataLayerEvents, errors };
}

/**
 * 예측값을 실제값 형식으로 변환
 */
function predictionToActualFormat(prediction: PageVariablePrediction | null): Record<string, string> {
  if (!prediction) return {};

  const result: Record<string, string> = {};

  // 공통 변수
  if (prediction.variables) {
    if (prediction.variables.site_name) result['AP_DATA_SITENAME'] = prediction.variables.site_name;
    if (prediction.variables.site_country) result['AP_DATA_COUNTRY'] = prediction.variables.site_country;
    if (prediction.variables.site_language) result['AP_DATA_LANG'] = prediction.variables.site_language;
    if (prediction.variables.site_env) result['AP_DATA_ENV'] = prediction.variables.site_env;
    if (prediction.variables.channel) result['AP_DATA_CHANNEL'] = prediction.variables.channel;
    if (prediction.variables.content_group) result['AP_DATA_PAGETYPE'] = prediction.variables.content_group;
    if (prediction.variables.login_is_login) result['AP_DATA_ISLOGIN'] = prediction.variables.login_is_login;
  }

  // 조건부 변수
  if (prediction.conditionalVariables) {
    const cv = prediction.conditionalVariables;
    // 상품 관련
    if (cv.product_id) result['AP_PRD_CODE'] = String(cv.product_id);
    if (cv.product_name) result['AP_PRD_NAME'] = cv.product_name;
    if (cv.product_brandname) result['AP_PRD_BRAND'] = cv.product_brandname;
    if (cv.product_brandcode) result['AP_PRD_BRANDCODE'] = cv.product_brandcode;
    if (cv.product_category) result['AP_PRD_CATEGORY'] = cv.product_category;
    if (cv.product_price) result['AP_PRD_PRICE'] = String(cv.product_price);
    if (cv.product_prdprice) result['AP_PRD_PRDPRICE'] = String(cv.product_prdprice);
    if (cv.product_discount) result['AP_PRD_DISCOUNT'] = String(cv.product_discount);
    if (cv.product_is_stock) result['AP_PRD_ISSTOCK'] = cv.product_is_stock;

    // 검색 관련
    if (cv.search_term) result['AP_SEARCH_TERM'] = cv.search_term;
    if (cv.search_result) result['AP_SEARCH_RESULT'] = cv.search_result;
    if (cv.search_result_count) result['AP_SEARCH_NUM'] = String(cv.search_result_count);

    // 장바구니 관련
    if (cv.cart_item_count) result['AP_CART_ITEMCOUNT'] = String(cv.cart_item_count);
    if (cv.cart_total_price) result['AP_CART_TOTALPRICE'] = String(cv.cart_total_price);

    // 주문 관련
    if (cv.checkout_step) result['AP_ORDER_STEP'] = String(cv.checkout_step);
    if (cv.payment_type) result['AP_ORDER_PAYTYPE'] = cv.payment_type;
    if (cv.transaction_id) result['AP_PURCHASE_ORDERNUM'] = cv.transaction_id;
    if (cv.transaction_value) result['AP_PURCHASE_PRICE'] = String(cv.transaction_value);

    // 이벤트/프로모션 관련
    if (cv.view_event_code) result['AP_PROMO_ID'] = cv.view_event_code;
    if (cv.view_event_name) result['AP_PROMO_NAME'] = cv.view_event_name;

    // 브랜드샵 관련
    if (cv.brandshop_code) result['AP_BRAND_CODE'] = cv.brandshop_code;
    if (cv.brandshop_name) result['AP_BRAND_NAME'] = cv.brandshop_name;
  }

  return result;
}

/**
 * 메인 테스트 함수
 */
async function main() {
  console.log('═'.repeat(80));
  console.log(' 이벤트 파라미터 예측 테스트');
  console.log('═'.repeat(80));

  // API 키 확인
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error('❌ GEMINI_API_KEY가 설정되지 않았습니다.');
    process.exit(1);
  }

  // GA4 토큰 확인
  const tokenPath = './credentials/ga4_tokens.json';
  let accessToken: string | undefined;
  if (fs.existsSync(tokenPath)) {
    const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
    accessToken = tokens.access_token;
  }

  const propertyId = process.env.GA4_PROPERTY_ID || '416629733';

  // 출력 디렉토리
  const outputDir = path.join(process.cwd(), 'output', 'event-prediction-test');
  const screenshotDir = path.join(outputDir, 'screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  // Vision Analyzer 초기화
  const visionAnalyzer = new GeminiVisionAnalyzer(geminiApiKey);

  // GA4 Client 초기화 (옵션)
  let ga4Client: GA4Client | null = null;
  let scenarioGenerator: EventParameterScenarioGenerator | null = null;

  if (accessToken) {
    try {
      ga4Client = new GA4Client({ propertyId, accessToken });
      await ga4Client.initialize();
      scenarioGenerator = new EventParameterScenarioGenerator(ga4Client);
      console.log('✅ GA4 클라이언트 초기화 성공');
    } catch (error: any) {
      console.warn(`⚠️ GA4 클라이언트 초기화 실패: ${error.message}`);
      console.warn('   기본 테스트 페이지를 사용합니다.');
    }
  } else {
    console.warn('⚠️ GA4 토큰이 없습니다. 기본 테스트 페이지를 사용합니다.');
  }

  // 검증기 초기화
  const validator = new EventParameterValidator(ga4Client!);

  // 브라우저 시작
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  });

  // 전체 결과 저장
  const allResults: EventValidationResult[] = [];

  console.log(`\n📋 테스트 대상 이벤트: ${TARGET_EVENTS.length}개\n`);

  // 각 이벤트 처리
  for (const eventName of TARGET_EVENTS) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🎯 ${eventName}`);
    console.log(`${'═'.repeat(60)}`);

    // 테스트 페이지 결정 - AP_DATA 로딩이 확인된 페이지만 사용
    const testPages: string[] = DEFAULT_TEST_PAGES[eventName] || [];
    console.log(`   📍 테스트 페이지 ${testPages.length}개 사용`);

    if (testPages.length === 0) {
      console.log(`   ⚠️ 테스트 페이지가 없습니다. 스킵합니다.`);
      continue;
    }

    for (let i = 0; i < testPages.length; i++) {
      const url = testPages[i];
      console.log(`\n   [${i + 1}/${testPages.length}] ${url}`);

      try {
        // 1. 페이지 방문 및 실제 변수 수집
        console.log(`      📷 페이지 방문 중...`);
        const { screenshotPath, actualVariables, dataLayerEvents, errors } = await visitAndCollect(
          context, url, screenshotDir, eventName, i
        );

        if (errors.length > 0) {
          console.log(`      ⚠️ 수집 오류: ${errors.join(', ')}`);
        }

        // 수집된 변수 개수
        const varCount = Object.keys(actualVariables).length;
        console.log(`      📥 수집된 변수: ${varCount}개`);

        // 2. Vision AI 예측
        console.log(`      🔍 Vision AI 예측 중...`);
        let prediction: PageVariablePrediction | null = null;

        try {
          prediction = await visionAnalyzer.predictPageVariables(screenshotPath, url, {
            viewport: { width: 1920, height: 1080 }
          });
          console.log(`      ✓ 예측 완료: ${prediction.pageType} (${prediction.confidence})`);
        } catch (error: any) {
          console.log(`      ❌ Vision AI 오류: ${error.message}`);
        }

        // 3. 예측값을 실제값 형식으로 변환
        const predictedVariables = predictionToActualFormat(prediction);

        // 4. 검증
        const contentGroup = prediction?.pageType || 'UNKNOWN';
        const validationResult = await validator.validateEvent(
          eventName,
          url,
          contentGroup,
          predictedVariables,
          actualVariables
        );

        // 결과 출력
        console.log(`      📊 정확도: ${validationResult.accuracy.toFixed(0)}% (${validationResult.matchedParams}/${validationResult.totalParams})`);

        if (validationResult.mismatchedParams > 0) {
          const mismatches = validationResult.parameters.filter(p => p.verdict === 'MISMATCH');
          for (const m of mismatches) {
            console.log(`         ❌ ${m.parameterName}: "${m.predictedValue}" vs "${m.actualValue}"`);
          }
        }

        allResults.push(validationResult);

      } catch (error: any) {
        console.log(`      ❌ 처리 오류: ${error.message}`);
      }

      // API 속도 제한 방지
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  await browser.close();

  // 전체 리포트 생성
  console.log('\n');
  const report = validator.generateReport(propertyId, allResults);
  validator.printReport(report);

  // 결과 저장
  const reportPath = path.join(outputDir, 'validation-report.json');
  const reportData = {
    ...report,
    parameterAccuracy: Object.fromEntries(report.parameterAccuracy),
    contentGroupAccuracy: Object.fromEntries(report.contentGroupAccuracy),
  };
  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
  console.log(`\n💾 리포트 저장: ${reportPath}`);

  console.log('\n✅ 테스트 완료!');
}

main().catch(console.error);
