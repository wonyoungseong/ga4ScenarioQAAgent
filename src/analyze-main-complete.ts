/**
 * MAIN 페이지 page_view 파라미터 완전 분석
 *
 * 컬럼: page_url | event_name | parameter.key | 예상한 값 | 개발된 값 | GA4 API 호출된 값
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import { GA4Client } from './ga4/ga4Client';
import { getPageViewParameters, runParameterValidation } from './config/parameterRegistry';

const TARGET_URL = 'https://www.amoremall.com/kr/ko/display/main';
const PROPERTY_ID = '416629733';

// 파라미터별 예상 값 (GTM 변수 기반)
const EXPECTED_VALUES: Record<string, { source: string; expected: string }> = {
  'site_name': { source: 'AP_DATA_SITENAME', expected: 'APMALL' },
  'site_country': { source: 'AP_DATA_COUNTRY', expected: 'KR' },
  'site_language': { source: 'AP_DATA_LANG', expected: 'KO' },
  'site_env': { source: 'AP_DATA_ENV', expected: 'PRD' },
  'channel': { source: 'AP_DATA_CHANNEL', expected: 'PC 또는 MOBILE' },
  'content_group': { source: 'AP_DATA_PAGETYPE', expected: 'MAIN' },
  'login_is_login': { source: 'AP_DATA_ISLOGIN', expected: 'Y 또는 N' },
  'user_agent': { source: 'navigator.userAgent', expected: '브라우저 UA 문자열' },
  'traffic_type': { source: '내부 IP 체크', expected: 'internal 또는 external' },
  'page_referrer': { source: 'document.referrer', expected: '이전 페이지 URL' },
  'page_location_1': { source: 'URL.substr(0,100)', expected: 'https://www.amoremall.com/...' },
  'page_location_2': { source: 'URL.substr(100,100)', expected: 'URL 100자 이후' },
  'page_location_3': { source: 'URL.substr(200,100)', expected: 'URL 200자 이후' },
  'page_location_4': { source: 'URL.substr(300,100)', expected: 'URL 300자 이후' },
  'page_location_5': { source: 'URL.substr(400,100)', expected: 'URL 400자 이후' },
  'login_id_gcid': { source: 'AP_DATA_GCID', expected: '회원ID SHA512 (128자)' },
  'login_id_cid': { source: 'AP_DATA_CID', expected: '통합회원번호 SHA512 (128자)' },
  'login_id_gcid_1': { source: 'GCID.substr(0,64)', expected: 'GCID 전반부 64자' },
  'login_id_gcid_2': { source: 'GCID.substr(64,64)', expected: 'GCID 후반부 64자' },
  'login_id_cid_1': { source: 'CID.substr(0,64)', expected: 'CID 전반부 64자' },
  'login_id_cid_2': { source: 'CID.substr(64,64)', expected: 'CID 후반부 64자' },
  'product_id': { source: 'AP_PRD_CODE', expected: '(PRODUCT_DETAIL 전용)' },
  'product_name': { source: 'AP_PRD_NAME', expected: '(PRODUCT_DETAIL 전용)' },
  'product_category': { source: 'AP_PRD_CATEGORY', expected: '(PRODUCT_DETAIL 전용)' },
  'product_brandname': { source: 'AP_PRD_BRAND', expected: '(PRODUCT_DETAIL 전용)' },
  'product_brandcode': { source: 'AP_PRD_APGBRCODE', expected: '(PRODUCT_DETAIL 전용)' },
  'product_is_stock': { source: 'AP_PRD_ISTOCK', expected: '(PRODUCT_DETAIL 전용)' },
  'view_event_code': { source: 'AP_DATA_VIEW_EVENT_CODE', expected: '(EVENT_DETAIL 전용)' },
  'view_event_name': { source: 'AP_DATA_VIEW_EVENT_NAME', expected: '(EVENT_DETAIL 전용)' },
  'brandshop_code': { source: 'AP_DATA_BRANDSHOP_CODE', expected: '(BRAND_MAIN 전용)' },
  'brandshop_name': { source: 'AP_DATA_BRANDSHOP_NAME', expected: '(BRAND_MAIN 전용)' },
  'page_store_code': { source: 'AP_DATA_PAGE_STORE_CODE', expected: '(매장 페이지 전용)' },
  'page_store_name': { source: 'AP_DATA_PAGE_STORE_NAME', expected: '(매장 페이지 전용)' },
  'search_brand_code': { source: 'AP_DATA_SEARCH_BRAND_CODE', expected: '(SEARCH_RESULT 전용)' },
  'search_brand': { source: 'AP_DATA_SEARCH_BRAND', expected: '(SEARCH_RESULT 전용)' },
  'user_id': { source: 'AP_DATA_GCID', expected: '회원ID (로그인 시)' },
  'login_is_sso': { source: 'AP_DATA_ISSSO', expected: 'Y 또는 N' },
  'login_gender': { source: 'AP_DATA_CG', expected: 'M 또는 F' },
  'login_birth': { source: 'AP_DATA_CD', expected: '생년 (YYYY)' },
  'login_age': { source: 'AP_DATA_AGE', expected: '연령대 (10대, 20대...)' },
  'login_level': { source: 'AP_DATA_CT', expected: '회원등급' },
  'login_beauty_level': { source: 'AP_DATA_BEAUTYCT', expected: '뷰티포인트 등급' },
  'login_is_member': { source: 'AP_DATA_ISEMPLOYEE', expected: 'Y 또는 N' },
  'login_method': { source: 'AP_DATA_LOGINTYPE', expected: '로그인 방법' },
  'login_is_subscription': { source: 'AP_DATA_ISSUBSCRIPTION', expected: 'Y 또는 N' },
  'breadcrumb': { source: 'AP_DATA_BREAD', expected: '브레드크럼 문자열' },
};

// 개발 변수 → GA4 파라미터 매핑
const DEV_VAR_TO_GA4: Record<string, string> = {
  'AP_DATA_SITENAME': 'site_name',
  'AP_DATA_COUNTRY': 'site_country',
  'AP_DATA_LANG': 'site_language',
  'AP_DATA_ENV': 'site_env',
  'AP_DATA_CHANNEL': 'channel',
  'AP_DATA_PAGETYPE': 'content_group',
  'AP_DATA_ISLOGIN': 'login_is_login',
  'AP_DATA_GCID': 'login_id_gcid',
  'AP_DATA_CID': 'login_id_cid',
  'AP_DATA_ISSSO': 'login_is_sso',
  'AP_DATA_CG': 'login_gender',
  'AP_DATA_CD': 'login_birth',
  'AP_DATA_AGE': 'login_age',
  'AP_DATA_CT': 'login_level',
  'AP_DATA_BEAUTYCT': 'login_beauty_level',
  'AP_DATA_ISEMPLOYEE': 'login_is_member',
  'AP_DATA_LOGINTYPE': 'login_method',
  'AP_DATA_ISSUBSCRIPTION': 'login_is_subscription',
  'AP_PRD_CODE': 'product_id',
  'AP_PRD_NAME': 'product_name',
  'AP_PRD_BRAND': 'product_brandname',
  'AP_PRD_APGBRCODE': 'product_brandcode',
  'AP_PRD_CATEGORY': 'product_category',
  'AP_PRD_ISTOCK': 'product_is_stock',
  'AP_DATA_BREAD': 'breadcrumb',
};

async function main() {
  console.log('='.repeat(160));
  console.log(' MAIN 페이지 page_view 파라미터 완전 분석');
  console.log('='.repeat(160));

  // 검증
  const validation = runParameterValidation();
  console.log(`\n📋 검증: ${validation.message}`);

  // 레지스트리에서 파라미터 가져오기
  const pageViewResult = getPageViewParameters();
  if (!pageViewResult) {
    console.error('❌ page_view 파라미터를 가져올 수 없습니다.');
    return;
  }

  const allParams = pageViewResult.parameters;

  // ============================================================================
  // 1단계: Playwright로 개발된 값 추출
  // ============================================================================
  console.log('\n📌 1단계: 개발된 값 추출 (Playwright)');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  const page = await context.newPage();

  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  const devValues = await page.evaluate(() => {
    const vars: Record<string, any> = {};
    const allVars = [
      'AP_DATA_SITENAME', 'AP_DATA_COUNTRY', 'AP_DATA_LANG', 'AP_DATA_ENV',
      'AP_DATA_PAGETYPE', 'AP_DATA_CHANNEL', 'AP_DATA_ISLOGIN', 'AP_DATA_BREAD',
      'AP_DATA_GCID', 'AP_DATA_CID', 'AP_DATA_ISSSO', 'AP_DATA_CG', 'AP_DATA_CD',
      'AP_DATA_AGE', 'AP_DATA_CT', 'AP_DATA_BEAUTYCT', 'AP_DATA_LOGINTYPE',
      'AP_DATA_ISEMPLOYEE', 'AP_DATA_ISSUBSCRIPTION',
      'AP_PRD_CODE', 'AP_PRD_NAME', 'AP_PRD_BRAND', 'AP_PRD_CATEGORY',
      'AP_PRD_APGBRCODE', 'AP_PRD_ISTOCK',
      'AP_DATA_VIEW_EVENT_CODE', 'AP_DATA_VIEW_EVENT_NAME',
      'AP_DATA_BRANDSHOP_CODE', 'AP_DATA_BRANDSHOP_NAME',
      'AP_DATA_PAGE_STORE_CODE', 'AP_DATA_PAGE_STORE_NAME',
      'AP_DATA_SEARCH_BRAND_CODE', 'AP_DATA_SEARCH_BRAND'
    ];
    for (const name of allVars) {
      vars[name] = (window as any)[name];
    }
    vars['_referrer'] = document.referrer || '';
    vars['_userAgent'] = navigator.userAgent;
    vars['_pageURL'] = window.location.href;
    return vars;
  });

  await browser.close();
  console.log('  ✅ 완료');

  // ============================================================================
  // 2단계: GA4 API로 수집된 값 조회
  // ============================================================================
  console.log('\n📌 2단계: GA4 API 수집 값 조회');

  const ga4Values: Record<string, string> = {};

  const tokenPath = './credentials/ga4_tokens.json';
  if (fs.existsSync(tokenPath)) {
    try {
      const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
      const client = new GA4Client({ propertyId: PROPERTY_ID, accessToken: tokens.access_token });
      await client.initialize();

      // 주요 dimension 조회
      const dimensionsToQuery = [
        'contentGroup', 'language', 'deviceCategory', 'country'
      ];

      for (const dim of dimensionsToQuery) {
        try {
          const [response] = await (client as any).client.runReport({
            property: `properties/${PROPERTY_ID}`,
            dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
            dimensions: [{ name: dim }],
            metrics: [{ name: 'eventCount' }],
            dimensionFilter: {
              andGroup: {
                expressions: [
                  { filter: { fieldName: 'eventName', stringFilter: { value: 'page_view' } } },
                  { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'CONTAINS', value: '/display/main' } } },
                ],
              },
            },
            limit: 1,
            orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
          });

          if (response.rows?.length > 0) {
            ga4Values[dim] = response.rows[0].dimensionValues?.[0]?.value || '';
          }
        } catch (e) {
          // 개별 dimension 조회 실패 무시
        }
      }

      // Custom dimensions 조회 시도
      const customDims = ['customEvent:site_name', 'customEvent:channel', 'customEvent:site_env'];
      for (const dim of customDims) {
        try {
          const [response] = await (client as any).client.runReport({
            property: `properties/${PROPERTY_ID}`,
            dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
            dimensions: [{ name: dim }],
            metrics: [{ name: 'eventCount' }],
            dimensionFilter: {
              filter: { fieldName: 'eventName', stringFilter: { value: 'page_view' } }
            },
            limit: 1,
            orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
          });

          if (response.rows?.length > 0) {
            const key = dim.replace('customEvent:', '');
            ga4Values[key] = response.rows[0].dimensionValues?.[0]?.value || '';
          }
        } catch (e) {
          // Custom dimension 조회 실패 무시
        }
      }

      console.log('  ✅ GA4 조회 완료');
    } catch (e: any) {
      console.log(`  ⚠️ GA4 조회 실패: ${e.message}`);
    }
  } else {
    console.log('  ⚠️ GA4 토큰 없음');
  }

  // ============================================================================
  // 3단계: 테이블 출력
  // ============================================================================
  console.log('\n');
  console.log('='.repeat(160));
  console.log(' page_view 파라미터 분석 결과');
  console.log('='.repeat(160));

  console.log('\n| page_url | event_name | parameter.key | 예상한 값 | 개발된 값 | GA4 API 값 |');
  console.log('|----------|------------|---------------|-----------|-----------|------------|');

  const pageUrl = TARGET_URL.length > 35 ? TARGET_URL.substring(0, 32) + '...' : TARGET_URL;

  // 개발 값 가져오기 함수
  const getDevValue = (ga4Key: string): string => {
    if (ga4Key === 'user_agent') return devValues['_userAgent']?.substring(0, 30) + '...' || '';
    if (ga4Key === 'page_referrer') return devValues['_referrer'] || '(직접 접속)';
    if (ga4Key === 'traffic_type') return 'external';
    if (ga4Key.match(/login_id_(g?cid)_[12]$/)) return '(로그인 필요)';

    if (ga4Key.startsWith('page_location_')) {
      const idx = parseInt(ga4Key.replace('page_location_', '')) - 1;
      const url = devValues['_pageURL'] || '';
      const val = url.substring(idx * 100, (idx + 1) * 100);
      return val || '(없음)';
    }

    // 개발 변수에서 찾기
    for (const [devVar, mappedKey] of Object.entries(DEV_VAR_TO_GA4)) {
      if (mappedKey === ga4Key) {
        const val = devValues[devVar];
        if (val === undefined || val === null || val === '') return '(없음)';
        return String(val);
      }
    }

    // user_id 특수 처리
    if (ga4Key === 'user_id') {
      return devValues['AP_DATA_GCID'] || '(로그인 필요)';
    }

    return '(없음)';
  };

  // GA4 값 가져오기
  const getGa4Value = (ga4Key: string): string => {
    // 직접 매핑
    if (ga4Key === 'content_group' && ga4Values['contentGroup']) return ga4Values['contentGroup'];
    if (ga4Key === 'site_language' && ga4Values['language']) return ga4Values['language'];
    if (ga4Key === 'channel' && ga4Values['deviceCategory']) return ga4Values['deviceCategory'];
    if (ga4Key === 'site_country' && ga4Values['country']) return ga4Values['country'];

    // Custom dimension
    if (ga4Values[ga4Key]) return ga4Values[ga4Key];

    return '(조회 필요)';
  };

  for (const param of allParams) {
    const expected = EXPECTED_VALUES[param.ga4Key] || { source: '(unknown)', expected: '(unknown)' };
    const devVal = getDevValue(param.ga4Key);
    const ga4Val = getGa4Value(param.ga4Key);

    // 값 표시 (길이 제한)
    const displayExpected = expected.expected.length > 25 ? expected.expected.substring(0, 22) + '...' : expected.expected;
    const displayDev = devVal.length > 25 ? devVal.substring(0, 22) + '...' : devVal;
    const displayGa4 = ga4Val.length > 25 ? ga4Val.substring(0, 22) + '...' : ga4Val;

    console.log(`| ${pageUrl.padEnd(35)} | page_view  | ${param.ga4Key.padEnd(22)} | ${displayExpected.padEnd(25)} | ${displayDev.padEnd(25)} | ${displayGa4.padEnd(25)} |`);
  }

  // ============================================================================
  // 4단계: 요약
  // ============================================================================
  console.log('\n');
  console.log('='.repeat(160));
  console.log(' 요약');
  console.log('='.repeat(160));

  let collected = 0;
  let notCollected = 0;

  for (const param of allParams) {
    const devVal = getDevValue(param.ga4Key);
    if (devVal && devVal !== '(없음)' && devVal !== '(로그인 필요)' && !devVal.startsWith('(')) {
      collected++;
    } else {
      notCollected++;
    }
  }

  console.log(`
페이지: ${TARGET_URL}
이벤트: page_view
페이지 타입: ${devValues['AP_DATA_PAGETYPE']}

📊 파라미터 현황:
   - 전체: ${allParams.length}개
   - ✅ 수집됨: ${collected}개
   - ⬜ 미수집: ${notCollected}개

✅ 주요 수집 값:
   - site_name: ${devValues['AP_DATA_SITENAME']}
   - site_country: ${devValues['AP_DATA_COUNTRY']}
   - site_language: ${devValues['AP_DATA_LANG']}
   - site_env: ${devValues['AP_DATA_ENV']}
   - channel: ${devValues['AP_DATA_CHANNEL']}
   - content_group: ${devValues['AP_DATA_PAGETYPE']}
   - login_is_login: ${devValues['AP_DATA_ISLOGIN']}

🔍 GA4 API 조회 결과:
   - contentGroup: ${ga4Values['contentGroup'] || '(미조회)'}
   - language: ${ga4Values['language'] || '(미조회)'}
   - deviceCategory: ${ga4Values['deviceCategory'] || '(미조회)'}
   - country: ${ga4Values['country'] || '(미조회)'}
`);
}

main().catch(console.error);
