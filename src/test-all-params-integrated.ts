/**
 * 통합 파라미터 테스트
 *
 * GT - Event Settings 기준 전체 파라미터 (35 Event Params + 10 User Props)를
 * 실제 페이지에서 테스트합니다.
 */

import { chromium } from 'playwright';
import { createDefaultGTMConfigLoader } from './config/gtmConfigLoader';

const TEST_URL = process.argv[2] || 'https://www.amoremall.com/kr/ko/';

// 파라미터 정의 인터페이스
interface ParamDef {
  param: string;
  globalVar: string | null;
  source?: string;
  always?: boolean;
  condition?: string;
  requiresLogin?: boolean;  // 로그인 필수 파라미터
}

// GT - Event Settings 기준 파라미터 정의
const EVENT_PARAMETERS: Record<string, ParamDef[]> = {
  // 사이트 정보 (항상 수집)
  site: [
    { param: 'site_env', globalVar: 'AP_DATA_ENV', always: true },
    { param: 'site_name', globalVar: 'AP_DATA_SITENAME', always: true },
    { param: 'site_language', globalVar: 'AP_DATA_LANG', always: true },
    { param: 'site_country', globalVar: 'AP_DATA_COUNTRY', always: true },
    { param: 'content_group', globalVar: 'AP_DATA_PAGETYPE', always: true },
    { param: 'channel', globalVar: 'AP_DATA_CHANNEL', always: true },
    { param: 'user_agent', globalVar: null, source: 'navigator.userAgent', always: true },
    { param: 'traffic_type', globalVar: null, source: 'Page Hostname', always: true },
  ],

  // 로그인 정보 (항상 수집하려고 시도, 비로그인 시 빈값이 정상)
  login: [
    { param: 'login_is_login', globalVar: 'AP_DATA_ISLOGIN', always: true },
    { param: 'login_id_gcid', globalVar: 'AP_DATA_GCID', always: true, requiresLogin: true },
    { param: 'login_id_cid', globalVar: 'AP_DATA_CID', always: true, requiresLogin: true },
    { param: 'login_id_gcid_1', globalVar: 'AP_DATA_GCID', always: true, requiresLogin: true },
    { param: 'login_id_gcid_2', globalVar: 'AP_DATA_GCID', always: true, requiresLogin: true },
    { param: 'login_id_cid_1', globalVar: 'AP_DATA_CID', always: true, requiresLogin: true },
    { param: 'login_id_cid_2', globalVar: 'AP_DATA_CID', always: true, requiresLogin: true },
  ],

  // 페이지 정보 (항상 수집)
  page: [
    { param: 'page_location_1', globalVar: null, source: 'Page URL', always: true },
    { param: 'page_location_2', globalVar: null, source: 'Page URL', always: true },
    { param: 'page_location_3', globalVar: null, source: 'Page URL', always: true },
    { param: 'page_location_4', globalVar: null, source: 'Page URL', always: true },
    { param: 'page_location_5', globalVar: null, source: 'Page URL', always: true },
    { param: 'page_referrer', globalVar: null, source: 'Referrer', always: true },
    { param: 'page_store_code', globalVar: null, source: 'URL', condition: 'STORE_*' },
    { param: 'page_store_name', globalVar: null, source: 'URL', condition: 'STORE_*' },
  ],

  // 상품 정보 (PRODUCT_DETAIL에서만)
  product: [
    { param: 'product_id', globalVar: 'AP_PRD_CODE', condition: 'PRODUCT_DETAIL' },
    { param: 'product_name', globalVar: 'AP_PRD_NAME', condition: 'PRODUCT_DETAIL' },
    { param: 'product_category', globalVar: 'AP_PRD_CATEGORY', condition: 'PRODUCT_DETAIL' },
    { param: 'product_brandname', globalVar: 'AP_PRD_BRAND', condition: 'PRODUCT_DETAIL' },
    { param: 'product_brandcode', globalVar: 'AP_PRD_APGBRCODE', condition: 'PRODUCT_DETAIL' },
    { param: 'product_is_stock', globalVar: 'AP_PRD_ISSTOCK', condition: 'PRODUCT_DETAIL' },
  ],

  // 브랜드샵 정보 (BRAND_MAIN에서만)
  brandshop: [
    { param: 'brandshop_code', globalVar: null, source: 'URL', condition: 'BRAND_MAIN' },
    { param: 'brandshop_name', globalVar: 'AP_DATA_BRAND', condition: 'BRAND_MAIN' },
  ],

  // 검색 정보 (SEARCH_RESULT에서만)
  search: [
    { param: 'search_brand_code', globalVar: null, source: 'URL', condition: 'SEARCH_RESULT' },
    { param: 'search_brand', globalVar: 'AP_SEARCH_SHOPBRAND', condition: 'SEARCH_RESULT' },
  ],

  // 이벤트 정보 (EVENT_DETAIL에서만)
  event: [
    { param: 'view_event_code', globalVar: 'AP_EVENT_CODE', condition: 'EVENT_DETAIL' },
    { param: 'view_event_name', globalVar: 'AP_EVENT_NAME', condition: 'EVENT_DETAIL' },
  ],
};

interface UserPropDef {
  param: string;
  globalVar: string;
}

const USER_PROPERTIES: UserPropDef[] = [
  { param: 'user_id', globalVar: 'AP_DATA_GCID' },
  { param: 'login_is_sso', globalVar: 'AP_DATA_ISMEMBER' },
  { param: 'login_gender', globalVar: 'AP_DATA_CG' },
  { param: 'login_birth', globalVar: 'AP_DATA_CD' },
  { param: 'login_age', globalVar: 'AP_DATA_CA' },
  { param: 'login_level', globalVar: 'AP_DATA_CT' },
  { param: 'login_beauty_level', globalVar: 'AP_DATA_BEAUTYCT' },
  { param: 'login_is_member', globalVar: 'AP_DATA_ISEMPLOYEE' },
  { param: 'login_method', globalVar: 'AP_DATA_LOGINTYPE' },
  { param: 'login_is_subscription', globalVar: 'AP_DATA_MBRS_PLUS' },
];

async function main() {
  console.log('='.repeat(80));
  console.log(' GT - Event Settings 기준 통합 파라미터 테스트');
  console.log('='.repeat(80));
  console.log(`\nURL: ${TEST_URL}\n`);

  // GTM 설정 로더 초기화
  console.log('GTM 설정 로드 중...');
  const loader = createDefaultGTMConfigLoader();
  await loader.preload();

  // 브라우저 실행
  console.log('브라우저 시작 중...\n');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  const page = await context.newPage();

  try {
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    // 전역변수 추출
    const globalVars = await page.evaluate(() => {
      const vars: Record<string, any> = {};
      for (const key of Object.keys(window)) {
        if (key.startsWith('AP_')) {
          vars[key] = (window as any)[key];
        }
      }
      return vars;
    });

    // 페이지 타입 확인
    const pageType = globalVars['AP_DATA_PAGETYPE'] || 'UNKNOWN';
    const isLoggedIn = globalVars['AP_DATA_ISLOGIN'] === 'Y';

    console.log('-'.repeat(80));
    console.log(`페이지 타입: ${pageType}`);
    console.log(`로그인 상태: ${isLoggedIn ? 'Y (로그인)' : 'N (비로그인)'}`);
    console.log('-'.repeat(80));

    // 결과 카운터
    let totalParams = 0;
    let collectedParams = 0;
    let expectedEmpty = 0;

    // Event Parameters 테스트
    console.log('\n');
    console.log('='.repeat(80));
    console.log(' EVENT PARAMETERS (35개)');
    console.log('='.repeat(80));

    for (const [category, params] of Object.entries(EVENT_PARAMETERS)) {
      console.log(`\n### ${category.toUpperCase()}`);
      console.log('| GA4 파라미터 | 전역변수 | 예상값 | 실제값 | 상태 |');
      console.log('|-------------|---------|-------|-------|------|');

      for (const p of params) {
        totalParams++;

        // 조건 확인
        const shouldHaveValue = p.always || p.condition === pageType;
        let actualValue = '-';
        let expectedValue = '-';

        if (p.globalVar) {
          actualValue = globalVars[p.globalVar];
          if (actualValue === undefined) actualValue = '(undefined)';
          else if (actualValue === null) actualValue = '(null)';
          else if (actualValue === '') actualValue = '(empty)';
          else actualValue = String(actualValue).slice(0, 15);
        }

        // 예상값 결정
        if (shouldHaveValue) {
          if (p.globalVar) {
            expectedValue = `${p.globalVar}`;
          } else {
            expectedValue = p.source || '-';
          }
        } else {
          expectedValue = `(${p.condition}에서만)`;
          expectedEmpty++;
        }

        // 상태 판정
        let status = '';
        const isEmptyValue = actualValue === '(empty)' || actualValue === '(undefined)';
        const isGTMBuiltIn = !p.globalVar && p.source; // GTM 내장 변수 (Page URL, Referrer 등)

        if (!shouldHaveValue) {
          // 조건 미충족
          const isEmpty = isEmptyValue || (actualValue === '-' && isGTMBuiltIn);
          status = isEmpty ? '⬜ 정상(조건외)' : '⚠️ 예상외값';
        } else if (isGTMBuiltIn) {
          // GTM 내장 변수 (globalVar 없음) - GTM이 자체적으로 수집
          status = '✅ GTM수집';
          collectedParams++;
        } else if (isEmptyValue) {
          // 로그인 필수 파라미터인데 비로그인 상태면 정상
          if (p.requiresLogin && !isLoggedIn) {
            status = '⬜ 정상(비로그인)';
            expectedEmpty++;
          } else {
            status = '❌ 누락';
          }
        } else {
          status = '✅ 수집됨';
          collectedParams++;
        }

        const gv = p.globalVar || p.source || '-';
        console.log(`| ${p.param.padEnd(20)} | ${gv.slice(0, 20).padEnd(20)} | ${expectedValue.slice(0, 15).padEnd(15)} | ${actualValue.padEnd(13)} | ${status} |`);
      }
    }

    // User Properties 테스트
    console.log('\n');
    console.log('='.repeat(80));
    console.log(' USER PROPERTIES (10개)');
    console.log('='.repeat(80));
    console.log('\n| GA4 User Property | 전역변수 | 실제값 | 상태 |');
    console.log('|-------------------|---------|-------|------|');

    let userPropsCollected = 0;
    for (const p of USER_PROPERTIES) {
      totalParams++;

      let actualValue = globalVars[p.globalVar];
      if (actualValue === undefined) actualValue = '(undefined)';
      else if (actualValue === null) actualValue = '(null)';
      else if (actualValue === '') actualValue = '(empty)';
      else {
        actualValue = String(actualValue).slice(0, 15);
        userPropsCollected++;
      }

      // 로그인 상태에 따른 상태 판정
      let status = '';
      if (!isLoggedIn) {
        status = actualValue === '(undefined)' || actualValue === '(empty)' ? '⬜ 정상(비로그인)' : '⚠️ 예상외값';
      } else {
        status = actualValue === '(undefined)' || actualValue === '(empty)' ? '❌ 누락' : '✅ 수집됨';
      }

      console.log(`| ${p.param.padEnd(22)} | ${p.globalVar.padEnd(20)} | ${actualValue.padEnd(13)} | ${status} |`);
    }

    // 요약
    console.log('\n');
    console.log('='.repeat(80));
    console.log(' 테스트 요약');
    console.log('='.repeat(80));

    const eventParamTotal = Object.values(EVENT_PARAMETERS).flat().length;
    const userPropTotal = USER_PROPERTIES.length;

    console.log(`
페이지: ${TEST_URL}
페이지 타입: ${pageType}
로그인 상태: ${isLoggedIn ? 'Y' : 'N'}

GT - Event Settings 파라미터 정의:
  - Event Parameters: ${eventParamTotal}개
  - User Properties: ${userPropTotal}개
  - 총: ${eventParamTotal + userPropTotal}개

현재 페이지 수집 결과:
  - Event Parameters 수집: ${collectedParams}개 / ${eventParamTotal - expectedEmpty}개 (조건 충족 파라미터)
  - 조건 미충족 (빈값 정상): ${expectedEmpty}개
  - User Properties: ${isLoggedIn ? userPropsCollected : 0}개 / ${userPropTotal}개 ${!isLoggedIn ? '(비로그인)' : ''}
`);

    // 전역변수 전체 값 출력
    console.log('-'.repeat(80));
    console.log('전역변수 실제 값 (AP_DATA_*)');
    console.log('-'.repeat(80));

    const dataVars = Object.entries(globalVars)
      .filter(([k]) => k.startsWith('AP_DATA_'))
      .sort(([a], [b]) => a.localeCompare(b));

    for (const [key, value] of dataVars) {
      const displayValue = value === undefined ? '(undefined)'
        : value === null ? '(null)'
        : value === '' ? '(empty)'
        : typeof value === 'object' ? JSON.stringify(value).slice(0, 40)
        : String(value);
      console.log(`${key.padEnd(28)}: ${displayValue}`);
    }

  } catch (error) {
    console.error('오류:', error);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
