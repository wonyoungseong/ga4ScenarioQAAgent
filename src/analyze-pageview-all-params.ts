/**
 * page_view 전체 파라미터 분석 (PARAM_MAPPING_TABLE.md 기반)
 *
 * URL: https://www.amoremall.com/kr/ko/display/main
 *
 * 총 파라미터: 45개
 * - Event Parameters (공통): 35개
 * - User Properties: 10개
 *
 * 검증: GTM JSON 파라미터 수와 파서 결과 일치 확인
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import { GA4Client } from './ga4/ga4Client';
import { getPageViewParameters, runParameterValidation } from './config/parameterRegistry';

const TARGET_URL = 'https://www.amoremall.com/kr/ko/display/main';
const PROPERTY_ID = '416629733';

// 전역변수 → GA4 파라미터 매핑
// ⚠️ page_location_1~5는 AP_DATA_BREAD가 아닌 Page URL을 100자씩 분할한 값
const DEV_VAR_MAPPING: Record<string, string[]> = {
  'AP_DATA_SITENAME': ['site_name'],
  'AP_DATA_COUNTRY': ['site_country'],
  'AP_DATA_LANG': ['site_language'],
  'AP_DATA_ENV': ['site_env'],
  'AP_DATA_CHANNEL': ['channel'],
  'AP_DATA_PAGETYPE': ['content_group'],
  'AP_DATA_ISLOGIN': ['login_is_login'],
  'AP_DATA_GCID': ['login_id_gcid', 'user_id'],
  'AP_DATA_CID': ['login_id_cid'],
  // page_location_1~5: Page URL을 100자씩 분할 (GTM 구현 확인됨)
  'PAGE_URL_SUBSTR': ['page_location_1', 'page_location_2', 'page_location_3', 'page_location_4', 'page_location_5'],
  'AP_DATA_ISSSO': ['login_is_sso'],
  'AP_DATA_CG': ['login_gender'],
  'AP_DATA_CD': ['login_birth'],
  'AP_DATA_AGE': ['login_age'],
  'AP_DATA_CT': ['login_level'],
  'AP_DATA_BEAUTYCT': ['login_beauty_level'],
  'AP_DATA_ISEMPLOYEE': ['login_is_member'],
  'AP_DATA_LOGINTYPE': ['login_method'],
  'AP_DATA_ISSUBSCRIPTION': ['login_is_subscription'],
  'AP_PRD_CODE': ['product_id'],
  'AP_PRD_NAME': ['product_name'],
  'AP_PRD_BRAND': ['product_brandname'],
  'AP_PRD_APGBRCODE': ['product_brandcode'],
  'AP_PRD_CATEGORY': ['product_category'],
  'AP_PRD_ISTOCK': ['product_is_stock'],
  'AP_DATA_VIEW_EVENT_CODE': ['view_event_code'],
  'AP_DATA_VIEW_EVENT_NAME': ['view_event_name'],
  'AP_DATA_BRANDSHOP_CODE': ['brandshop_code'],
  'AP_DATA_BRANDSHOP_NAME': ['brandshop_name'],
  'AP_DATA_PAGE_STORE_CODE': ['page_store_code'],
  'AP_DATA_PAGE_STORE_NAME': ['page_store_name'],
  'AP_DATA_SEARCH_BRAND_CODE': ['search_brand_code'],
  'AP_DATA_SEARCH_BRAND': ['search_brand'],
};

async function main() {
  console.log('='.repeat(140));
  console.log(' page_view 전체 파라미터 분석 (Registry 기반)');
  console.log(' URL:', TARGET_URL);
  console.log('='.repeat(140));

  // ============================================================================
  // 0단계: 파서 검증 (GTM JSON과 파서 결과 비교)
  // ============================================================================
  console.log('\n📋 파서 검증 (필수):');
  const validation = runParameterValidation();
  console.log(`   ${validation.message}`);

  if (!validation.isValid) {
    console.error('\n❌ 파서 검증 실패! 분석을 중단합니다.');
    console.error(`   GTM: ${validation.gtmCount}개, 파서: ${validation.parserCount}개`);
    if (validation.missing.length > 0) {
      console.error(`   누락: ${validation.missing.join(', ')}`);
    }
    return;
  }

  // 레지스트리에서 파라미터 가져오기
  const pageViewResult = getPageViewParameters();
  if (!pageViewResult) {
    console.error('\n❌ page_view 파라미터를 가져올 수 없습니다.');
    return;
  }

  // 파라미터 분류
  const eventParams = pageViewResult.parameters.filter(p => p.category !== 'user_property');
  const userParams = pageViewResult.parameters.filter(p => p.category === 'user_property');

  console.log('\n📊 파라미터 개수 요약:');
  console.log(`   - Event Parameters: ${eventParams.length}개`);
  console.log(`   - User Properties: ${userParams.length}개`);
  console.log(`   총합: ${pageViewResult.summary.total}개`);

  // ============================================================================
  // 1단계: Playwright로 개발된 값 추출
  // ============================================================================
  console.log('\n');
  console.log('━'.repeat(140));
  console.log('📌 1단계: 개발된 값 추출 (Playwright)');
  console.log('━'.repeat(140));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  console.log('\n  페이지 로딩 중...');
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  // 모든 전역변수 추출
  const devValues = await page.evaluate(() => {
    const vars: Record<string, any> = {};

    // AP_DATA_* 변수
    const allVars = [
      'AP_DATA_SITENAME', 'AP_DATA_COUNTRY', 'AP_DATA_LANG', 'AP_DATA_ENV',
      'AP_DATA_PAGETYPE', 'AP_DATA_CHANNEL', 'AP_DATA_ISLOGIN', 'AP_DATA_BREAD',
      'AP_DATA_GCID', 'AP_DATA_CID', 'AP_DATA_ISSSO', 'AP_DATA_CG', 'AP_DATA_CD',
      'AP_DATA_AGE', 'AP_DATA_CT', 'AP_DATA_BEAUTYCT', 'AP_DATA_LOGINTYPE',
      'AP_DATA_ISEMPLOYEE', 'AP_DATA_ISSUBSCRIPTION',
      'AP_DATA_PAGEURL', 'AP_DATA_DOMAIN', 'AP_DATA_FULLURL', 'AP_DATA_PAGETITLE',
      // 상품 관련 (조건부)
      'AP_PRD_CODE', 'AP_PRD_NAME', 'AP_PRD_BRAND', 'AP_PRD_CATEGORY',
      'AP_PRD_APGBRCODE', 'AP_PRD_ISTOCK'
    ];

    for (const name of allVars) {
      vars[name] = (window as any)[name];
    }

    // 브라우저 정보
    vars['_referrer'] = document.referrer || '';
    vars['_userAgent'] = navigator.userAgent;
    vars['_pageURL'] = window.location.href;

    return vars;
  });

  await browser.close();
  console.log('  ✅ 개발 값 추출 완료\n');

  // ============================================================================
  // 2단계: GA4 API로 수집 값 조회
  // ============================================================================
  console.log('━'.repeat(140));
  console.log('📌 2단계: GA4 수집 값 조회 (API)');
  console.log('━'.repeat(140));

  let ga4PageViewCount = 0;
  let ga4ContentGroup = '';
  let ga4Language = '';

  const tokenPath = './credentials/ga4_tokens.json';
  if (fs.existsSync(tokenPath)) {
    try {
      const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
      const client = new GA4Client({ propertyId: PROPERTY_ID, accessToken: tokens.access_token });
      await client.initialize();

      // page_view 수집량 조회
      const pageEvents = await client.getEventsByPage('/kr/ko/display/main', {
        startDate: '7daysAgo', endDate: 'today', limit: 100
      });
      ga4PageViewCount = pageEvents.filter(e => e.eventName === 'page_view').reduce((sum, e) => sum + e.eventCount, 0);

      // content_group 값 조회
      const [response] = await (client as any).client.runReport({
        property: `properties/${PROPERTY_ID}`,
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'contentGroup' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          andGroup: {
            expressions: [
              { filter: { fieldName: 'eventName', stringFilter: { value: 'page_view' } } },
              { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'CONTAINS', value: '/display/main' } } },
            ],
          },
        },
        limit: 5,
        orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      });

      if (response.rows?.length > 0) {
        ga4ContentGroup = response.rows[0].dimensionValues?.[0]?.value || '';
      }

      // language 조회
      const [langResp] = await (client as any).client.runReport({
        property: `properties/${PROPERTY_ID}`,
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'language' }],
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

      if (langResp.rows?.length > 0) {
        ga4Language = langResp.rows[0].dimensionValues?.[0]?.value || '';
      }

      console.log(`\n  ✅ GA4 조회 완료`);
      console.log(`     - page_view: ${ga4PageViewCount.toLocaleString()}건 (최근 7일)`);
      console.log(`     - contentGroup: ${ga4ContentGroup}`);
      console.log(`     - language: ${ga4Language}\n`);

    } catch (e: any) {
      console.log(`\n  ⚠️ GA4 조회 실패: ${e.message}\n`);
    }
  } else {
    console.log('\n  ⚠️ GA4 토큰 없음\n');
  }

  // ============================================================================
  // 3단계: 전체 파라미터 테이블 출력
  // ============================================================================
  console.log('━'.repeat(140));
  console.log(`📊 page_view 파라미터 비교 테이블 (${pageViewResult.summary.total}개)`);
  console.log('━'.repeat(140));

  // 개발 값 추출 함수 (GA4 파라미터 → 전역변수 역매핑)
  const getDevValueForParam = (ga4Key: string): { devVar: string; value: string } => {
    // 특수 파라미터 처리
    if (ga4Key === 'user_agent') return { devVar: 'navigator.userAgent', value: devValues['_userAgent'] || '' };
    if (ga4Key === 'page_referrer') return { devVar: 'document.referrer', value: devValues['_referrer'] || '' };
    if (ga4Key === 'traffic_type') return { devVar: '(내부 IP 체크)', value: 'external' };
    if (ga4Key.match(/login_id_(g?cid)_[12]$/)) return { devVar: '(ID 분할)', value: '(로그인 시 생성)' };

    // page_location_1~5: Page URL을 100자씩 분할 (GTM 구현 확인됨)
    if (ga4Key.startsWith('page_location_')) {
      const idx = parseInt(ga4Key.replace('page_location_', '')) - 1;
      const pageUrl = devValues['_pageURL'] || '';
      const value = pageUrl.substring(idx * 100, (idx + 1) * 100);
      return { devVar: `Page URL.substr(${idx * 100}, 100)`, value: value || '' };
    }

    // 매핑 테이블에서 찾기
    for (const [devVar, ga4Keys] of Object.entries(DEV_VAR_MAPPING)) {
      if (ga4Keys.includes(ga4Key)) {
        const val = devValues[devVar];
        return { devVar, value: val === undefined || val === null ? '' : String(val) };
      }
    }

    return { devVar: '(unknown)', value: '' };
  };

  // Event Parameters 출력
  console.log(`\n### Event Parameters (${eventParams.length}개)\n`);
  console.log('| # | GA4 파라미터 | 설명 | 개발 변수 | 개발 값 (실제) | GA4 수집 |');
  console.log('|---|--------------|------|-----------|----------------|----------|');

  let idx = 1;
  for (const param of eventParams) {
    const { devVar, value } = getDevValueForParam(param.ga4Key);
    const displayVal = value.length > 30 ? value.substring(0, 27) + '...' : value || '(없음)';
    const desc = param.description || '';

    let ga4Val = '';
    if (param.ga4Key === 'content_group') {
      ga4Val = ga4ContentGroup || '(조회 필요)';
    } else if (value && value !== '(없음)' && !value.startsWith('(')) {
      ga4Val = '✅ 수집됨';
    } else if ((param as any).condition) {
      ga4Val = `⏸️ ${(param as any).condition} 전용`;
    } else {
      ga4Val = devVar.startsWith('(') ? devVar : '(비로그인)';
    }

    console.log(`| ${idx.toString().padStart(2)} | ${param.ga4Key.padEnd(22)} | ${desc.padEnd(20).substring(0, 20)} | ${devVar.padEnd(22)} | ${displayVal.padEnd(20)} | ${ga4Val.padEnd(15)} |`);
    idx++;
  }

  // User Properties 출력
  console.log(`\n### User Properties (${userParams.length}개)\n`);
  console.log('| # | GA4 파라미터 | 설명 | 개발 변수 | 개발 값 (실제) | GA4 수집 |');
  console.log('|---|--------------|------|-----------|----------------|----------|');

  idx = 1;
  for (const param of userParams) {
    const { devVar, value } = getDevValueForParam(param.ga4Key);
    const displayVal = value.length > 30 ? value.substring(0, 27) + '...' : value || '(없음)';
    const desc = param.description || '';

    let ga4Val = '';
    if (value && value !== '(없음)' && !value.startsWith('(')) {
      ga4Val = '✅ 수집됨';
    } else {
      ga4Val = '(비로그인)';
    }

    console.log(`| ${idx.toString().padStart(2)} | ${param.ga4Key.padEnd(22)} | ${desc.padEnd(20).substring(0, 20)} | ${devVar.padEnd(22)} | ${displayVal.padEnd(20)} | ${ga4Val.padEnd(15)} |`);
    idx++;
  }

  // ============================================================================
  // 4단계: 요약
  // ============================================================================
  console.log('\n');
  console.log('━'.repeat(140));
  console.log('📋 요약');
  console.log('━'.repeat(140));

  // 값이 있는 파라미터 수 계산
  let filledCount = 0;
  for (const param of [...eventParams, ...userParams]) {
    const { value } = getDevValueForParam(param.ga4Key);
    if (value && value !== '(없음)' && !value.startsWith('(')) {
      filledCount++;
    }
  }

  console.log(`
페이지: ${TARGET_URL}
페이지 타입: ${devValues['AP_DATA_PAGETYPE'] || 'MAIN'}

📋 검증 결과: ${validation.message}

📊 파라미터 현황:
   - 전체 page_view 파라미터: ${pageViewResult.summary.total}개
     - Event Parameters: ${eventParams.length}개
     - User Properties: ${userParams.length}개
   - 값이 있는 파라미터: ${filledCount}개
   - 비로그인으로 미수집: User ID/속성 관련 파라미터

✅ 주요 개발 값:
   - site_name: ${devValues['AP_DATA_SITENAME']}
   - site_country: ${devValues['AP_DATA_COUNTRY']}
   - site_language: ${devValues['AP_DATA_LANG']}
   - site_env: ${devValues['AP_DATA_ENV']}
   - content_group: ${devValues['AP_DATA_PAGETYPE']}
   - channel: ${devValues['AP_DATA_CHANNEL']}
   - login_is_login: ${devValues['AP_DATA_ISLOGIN']}

✅ GA4 수집 현황 (최근 7일):
   - page_view 이벤트: ${ga4PageViewCount.toLocaleString()}건
   - contentGroup: ${ga4ContentGroup}
   - language: ${ga4Language}
`);
}

main().catch(console.error);
