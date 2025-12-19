/**
 * MAIN 페이지 page_view 파라미터 분석 (정확한 GA4 API 사용)
 *
 * 컬럼: page_url | event_name | parameter.key | 예상한 값 | 개발된 값 | GA4 API 값
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import { GA4Client } from './ga4/ga4Client';
import { getPageViewParameters, runParameterValidation } from './config/parameterRegistry';
import {
  initializeGA4DimensionRegistry,
  checkParameterMapping,
  queryGA4DimensionValue,
  validateGTMtoGA4Mapping,
} from './config/ga4DimensionRegistry';
import { extractParamsFromGTM } from './parsers/paramMappingParser';

const TARGET_URL = 'https://www.amoremall.com/kr/ko/display/main';
const PROPERTY_ID = '416629733';
const GTM_PATH = './GTM-5FK5X5C4_workspace112.json';

async function main() {
  console.log('='.repeat(140));
  console.log(' MAIN 페이지 page_view 파라미터 분석 (정확한 GA4 API)');
  console.log('='.repeat(140));

  // ============================================================================
  // 0. 파서 검증
  // ============================================================================
  console.log('\n📋 파서 검증:');
  const validation = runParameterValidation();
  console.log(`   ${validation.message}`);

  // ============================================================================
  // 1. GA4 Dimension Registry 초기화 및 매핑 검증
  // ============================================================================
  console.log('\n📌 1단계: GA4 Custom Dimension 매핑 검증\n');

  const gtmParams = extractParamsFromGTM(GTM_PATH);
  const mappingResult = await validateGTMtoGA4Mapping({
    propertyId: PROPERTY_ID,
    gtmEventParams: gtmParams.eventParams,
    gtmUserProps: gtmParams.userProperties,
  });

  if (!mappingResult.success) {
    console.error(`❌ GA4 매핑 검증 실패: ${mappingResult.report}`);
    return;
  }

  console.log(`   ✅ GA4 매핑 검증 완료`);
  console.log(`   - 총 파라미터: ${mappingResult.summary.totalParams}개`);
  console.log(`   - GA4 등록: ${mappingResult.summary.registered}개`);
  console.log(`   - GA4 미등록: ${mappingResult.summary.notRegistered}개`);
  console.log(`   - 매핑률: ${mappingResult.summary.registrationRate.toFixed(1)}%`);

  // ============================================================================
  // 2. Playwright로 개발된 값 추출
  // ============================================================================
  console.log('\n📌 2단계: 개발된 값 추출 (Playwright)\n');

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
  console.log('   ✅ 개발 값 추출 완료');

  // ============================================================================
  // 3. GA4 API로 실제 값 조회
  // ============================================================================
  console.log('\n📌 3단계: GA4 API 실제 값 조회\n');

  const ga4Values: Record<string, string> = {};

  // 조회할 dimension 목록 (Custom + 표준 Dimension 대체 포함)
  const dimensionsToQuery = [
    // Custom Dimensions (등록된 것)
    { param: 'site_name', dim: 'customEvent:site_name' },
    { param: 'site_country', dim: 'customEvent:site_country' },
    { param: 'site_language', dim: 'customEvent:site_language' },
    { param: 'site_env', dim: 'customEvent:site_env' },
    { param: 'channel', dim: 'customEvent:channel' },
    { param: 'login_is_login', dim: 'customEvent:login_is_login' },
    { param: 'user_agent', dim: 'customEvent:user_agent' },
    { param: 'product_id', dim: 'customEvent:product_id' },
    { param: 'product_name', dim: 'customEvent:product_name' },
    { param: 'product_category', dim: 'customEvent:product_category' },
    { param: 'product_brandname', dim: 'customEvent:product_brandname' },
    { param: 'login_id_gcid', dim: 'customEvent:login_id_gcid' },
    { param: 'login_id_cid', dim: 'customEvent:login_id_cid' },
    // 표준 Dimension (대체 조회)
    { param: 'content_group', dim: 'contentGroup' },
    { param: 'page_referrer', dim: 'pageReferrer' },
    { param: 'page_location', dim: 'pageLocation' },
  ];

  for (const { param, dim } of dimensionsToQuery) {
    const result = await queryGA4DimensionValue({
      propertyId: PROPERTY_ID,
      dimension: dim,
      filters: {
        eventName: 'page_view',
        pagePath: '/display/main',
      },
    });

    if (result.success && result.values.length > 0) {
      ga4Values[param] = result.values[0].value;
      console.log(`   ${param}: ${result.values[0].value} (${result.values[0].count.toLocaleString()}건)`);
    } else {
      ga4Values[param] = result.error ? `(오류: ${result.error.substring(0, 20)})` : '(데이터 없음)';
    }
  }

  // ============================================================================
  // 4. 전체 테이블 출력
  // ============================================================================
  console.log('\n\n' + '='.repeat(140));
  console.log(' page_view 파라미터 분석 결과');
  console.log('='.repeat(140));

  // 개발 변수 → GA4 파라미터 매핑
  const DEV_VAR_MAP: Record<string, string> = {
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
  };

  // 예상값 정의
  const EXPECTED: Record<string, string> = {
    'site_name': 'APMALL',
    'site_country': 'KR',
    'site_language': 'KO',
    'site_env': 'PRD',
    'channel': 'PC/MOBILE',
    'content_group': 'MAIN',
    'login_is_login': 'Y/N',
    'user_agent': 'UA 문자열',
    'traffic_type': 'internal/external',
    'page_referrer': '이전 URL',
    'page_location_1': 'URL 0~100',
    'login_id_gcid': '회원ID 해시',
    'login_id_cid': '통합회원번호 해시',
    'product_id': '(PRODUCT_DETAIL)',
    'product_name': '(PRODUCT_DETAIL)',
    'login_is_sso': 'Y/N',
    'login_gender': 'M/F',
    'login_birth': 'YYYY',
    'login_age': '10/20/30...',
    'login_level': '등급',
    'login_beauty_level': '뷰티등급',
    'login_is_member': 'Y/N',
    'login_method': '로그인방법',
    'login_is_subscription': 'Y/N',
    'user_id': '회원ID',
  };

  // 개발값 추출 함수
  const getDevValue = (param: string): string => {
    if (param === 'user_agent') return devValues['_userAgent']?.substring(0, 30) + '...' || '';
    if (param === 'page_referrer') return devValues['_referrer'] || '(직접 접속)';
    if (param === 'traffic_type') return 'external';
    if (param.startsWith('page_location_')) {
      const idx = parseInt(param.replace('page_location_', '')) - 1;
      const url = devValues['_pageURL'] || '';
      return url.substring(idx * 100, (idx + 1) * 100) || '(없음)';
    }
    for (const [devVar, mappedParam] of Object.entries(DEV_VAR_MAP)) {
      if (mappedParam === param) {
        const val = devValues[devVar];
        return val !== undefined && val !== null && val !== '' ? String(val) : '(없음)';
      }
    }
    return '(없음)';
  };

  // 테이블 헤더
  console.log('\n| page_url | event_name | parameter.key | GA4 등록 | 예상한 값 | 개발된 값 | GA4 API 값 |');
  console.log('|----------|------------|---------------|----------|-----------|-----------|------------|');

  const pageUrl = '/display/main';

  // Event Parameters
  for (const mapping of mappingResult.eventMappings) {
    const param = mapping.gtmParam;
    const registered = mapping.isRegistered ? '✅' : (mapping.alternativeDimension ? '🔄' : '❌');
    const expected = EXPECTED[param] || '-';
    const devVal = getDevValue(param);

    // GA4 값 결정: 직접 조회 > 표준 Dimension 대체 > 미등록
    let ga4Val = ga4Values[param];
    if (!ga4Val && mapping.alternativeDimension) {
      // 표준 Dimension 대체값 사용
      if (param === 'content_group') ga4Val = ga4Values['content_group'];
      else if (param === 'page_referrer') ga4Val = ga4Values['page_referrer'];
      else if (param.startsWith('page_location_')) ga4Val = ga4Values['page_location'];
    }
    if (!ga4Val) {
      ga4Val = mapping.isRegistered ? '(조회 필요)' : (mapping.alternativeDimension ? '(표준 Dim)' : '(미등록)');
    }

    const displayDev = devVal.length > 20 ? devVal.substring(0, 17) + '...' : devVal;
    const displayGa4 = ga4Val.length > 20 ? ga4Val.substring(0, 17) + '...' : ga4Val;

    console.log(`| ${pageUrl.padEnd(15)} | page_view  | ${param.padEnd(20)} | ${registered.padEnd(8)} | ${expected.padEnd(15)} | ${displayDev.padEnd(20)} | ${displayGa4.padEnd(20)} |`);
  }

  // User Properties
  console.log('|----------|------------|---------------|----------|-----------|-----------|------------|');
  console.log('| (User Properties) |');
  console.log('|----------|------------|---------------|----------|-----------|-----------|------------|');

  for (const mapping of mappingResult.userMappings) {
    const param = mapping.gtmParam;
    const registered = mapping.isRegistered ? '✅' : '❌';
    const expected = EXPECTED[param] || '-';
    const devVal = getDevValue(param);
    const ga4Val = mapping.isRegistered ? '(조회 필요)' : '(미등록)';

    console.log(`| ${pageUrl.padEnd(15)} | page_view  | ${param.padEnd(20)} | ${registered.padEnd(8)} | ${expected.padEnd(15)} | ${devVal.padEnd(20)} | ${ga4Val.padEnd(20)} |`);
  }

  // ============================================================================
  // 5. 요약
  // ============================================================================
  console.log('\n\n' + '='.repeat(140));
  console.log(' 요약');
  console.log('='.repeat(140));

  console.log(`
📍 페이지: ${TARGET_URL}
📍 이벤트: page_view
📍 페이지 타입: ${devValues['AP_DATA_PAGETYPE']}

📊 GTM → GA4 매핑 현황:
   - GTM 파라미터: ${mappingResult.summary.totalParams}개
   - GA4 등록됨: ${mappingResult.summary.registered}개 (API 조회 가능)
   - GA4 미등록: ${mappingResult.summary.notRegistered}개 (API 조회 불가)
   - 매핑률: ${mappingResult.summary.registrationRate.toFixed(1)}%

✅ GA4 API 조회 결과 (page_view + /display/main):
   - site_name: ${ga4Values['site_name'] || '-'}
   - site_country: ${ga4Values['site_country'] || '-'}
   - site_language: ${ga4Values['site_language'] || '-'}
   - site_env: ${ga4Values['site_env'] || '-'}
   - channel: ${ga4Values['channel'] || '-'}
   - content_group: ${ga4Values['content_group'] || '-'}
   - login_is_login: ${ga4Values['login_is_login'] || '-'}

❌ GA4 미등록 파라미터 (API 조회 불가):
${mappingResult.notRegisteredList.map(p => `   - ${p}`).join('\n')}
`);
}

main().catch(console.error);
