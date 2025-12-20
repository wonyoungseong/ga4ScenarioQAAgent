/**
 * PRODUCT_DETAIL 페이지 page_view 파라미터 분석
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import { GA4Client } from './ga4/ga4Client';
import { getPageViewParameters, runParameterValidation } from './config/parameterRegistry';

const PROPERTY_ID = '416629733';

// 전역변수 → GA4 파라미터 매핑
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
  console.log(' PRODUCT_DETAIL 페이지 page_view 파라미터 분석');
  console.log('='.repeat(140));

  // 검증
  console.log('\n📋 파서 검증:');
  const validation = runParameterValidation();
  console.log(`   ${validation.message}`);

  if (!validation.isValid) {
    console.error('❌ 파서 검증 실패!');
    return;
  }

  // 레지스트리에서 파라미터 가져오기
  const pageViewResult = getPageViewParameters();
  if (!pageViewResult) {
    console.error('❌ page_view 파라미터를 가져올 수 없습니다.');
    return;
  }

  const eventParams = pageViewResult.parameters.filter(p => p.category !== 'user_property');
  const userParams = pageViewResult.parameters.filter(p => p.category === 'user_property');

  // ============================================================================
  // 1단계: 메인 페이지에서 상품 상세 페이지 URL 찾기
  // ============================================================================
  console.log('\n━'.repeat(140));
  console.log('📌 1단계: 상품 상세 페이지 URL 찾기');
  console.log('━'.repeat(140));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  const page = await context.newPage();

  // 메인 페이지에서 상품 링크 찾기
  await page.goto('https://www.amoremall.com/kr/ko/display/main', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  let productUrl = '';

  // 상품 링크 찾기 시도
  const productLinks = await page.evaluate(() => {
    // 다양한 패턴으로 상품 링크 찾기
    const selectors = [
      'a[href*="/product/"]',
      'a[href*="/goods/"]',
      'a[href*="/item/"]',
      '.product-link',
      '[data-product-id]'
    ];

    for (const sel of selectors) {
      const links = Array.from(document.querySelectorAll(sel));
      if (links.length > 0) {
        return links.slice(0, 10).map(a => (a as HTMLAnchorElement).href).filter(h => h);
      }
    }
    return [];
  });

  if (productLinks.length > 0) {
    productUrl = productLinks[0];
    console.log(`\n  상품 상세 페이지 발견: ${productUrl}`);
  } else {
    // 직접 URL 사용 (아모레몰 상품 패턴)
    productUrl = 'https://www.amoremall.com/kr/ko/product/detail?onlineProdSn=91092';
    console.log(`\n  기본 상품 URL 사용: ${productUrl}`);
  }

  // ============================================================================
  // 2단계: 상품 상세 페이지에서 개발 값 추출
  // ============================================================================
  console.log('\n━'.repeat(140));
  console.log('📌 2단계: 개발된 값 추출 (Playwright)');
  console.log('━'.repeat(140));

  console.log(`\n  페이지 로딩 중: ${productUrl}`);
  await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  // 모든 전역변수 추출
  const devValues = await page.evaluate(() => {
    const vars: Record<string, any> = {};

    const allVars = [
      'AP_DATA_SITENAME', 'AP_DATA_COUNTRY', 'AP_DATA_LANG', 'AP_DATA_ENV',
      'AP_DATA_PAGETYPE', 'AP_DATA_CHANNEL', 'AP_DATA_ISLOGIN', 'AP_DATA_BREAD',
      'AP_DATA_GCID', 'AP_DATA_CID', 'AP_DATA_ISSSO', 'AP_DATA_CG', 'AP_DATA_CD',
      'AP_DATA_AGE', 'AP_DATA_CT', 'AP_DATA_BEAUTYCT', 'AP_DATA_LOGINTYPE',
      'AP_DATA_ISEMPLOYEE', 'AP_DATA_ISSUBSCRIPTION',
      // 상품 관련
      'AP_PRD_CODE', 'AP_PRD_NAME', 'AP_PRD_BRAND', 'AP_PRD_CATEGORY',
      'AP_PRD_APGBRCODE', 'AP_PRD_ISTOCK', 'AP_PRD_PRICE', 'AP_PRD_SALEPRICE',
      // 이벤트/브랜드샵
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

  console.log(`  ✅ 개발 값 추출 완료`);
  console.log(`  페이지 타입: ${devValues['AP_DATA_PAGETYPE']}`);

  // ============================================================================
  // 3단계: GA4 API로 수집 값 조회
  // ============================================================================
  console.log('\n━'.repeat(140));
  console.log('📌 3단계: GA4 수집 값 조회 (API)');
  console.log('━'.repeat(140));

  let ga4PageViewCount = 0;
  let ga4ContentGroup = '';

  const tokenPath = './credentials/ga4_tokens.json';
  if (fs.existsSync(tokenPath)) {
    try {
      const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
      const client = new GA4Client({ propertyId: PROPERTY_ID, accessToken: tokens.access_token });
      await client.initialize();

      // PRODUCT_DETAIL page_view 수집량 조회
      const [response] = await (client as any).client.runReport({
        property: `properties/${PROPERTY_ID}`,
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'contentGroup' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          andGroup: {
            expressions: [
              { filter: { fieldName: 'eventName', stringFilter: { value: 'page_view' } } },
              { filter: { fieldName: 'customEvent:content_group', stringFilter: { value: 'PRODUCT_DETAIL' } } },
            ],
          },
        },
        limit: 5,
      });

      if (response.rows?.length > 0) {
        ga4ContentGroup = response.rows[0].dimensionValues?.[0]?.value || '';
        ga4PageViewCount = parseInt(response.rows[0].metricValues?.[0]?.value || '0');
      }

      console.log(`\n  ✅ GA4 조회 완료`);
      console.log(`     - PRODUCT_DETAIL page_view: ${ga4PageViewCount.toLocaleString()}건 (최근 7일)`);
      console.log(`     - contentGroup: ${ga4ContentGroup}`);

    } catch (e: any) {
      console.log(`\n  ⚠️ GA4 조회 실패: ${e.message}`);
    }
  }

  // ============================================================================
  // 4단계: 파라미터 테이블 출력
  // ============================================================================
  console.log('\n━'.repeat(140));
  console.log(`📊 PRODUCT_DETAIL page_view 파라미터 (${pageViewResult.summary.total}개)`);
  console.log('━'.repeat(140));

  const getDevValueForParam = (ga4Key: string): { devVar: string; value: string; status: string } => {
    if (ga4Key === 'user_agent') return { devVar: 'navigator.userAgent', value: devValues['_userAgent'] || '', status: '✅' };
    if (ga4Key === 'page_referrer') return { devVar: 'document.referrer', value: devValues['_referrer'] || '', status: devValues['_referrer'] ? '✅' : '⬜' };
    if (ga4Key === 'traffic_type') return { devVar: '(내부 IP 체크)', value: 'external', status: '✅' };
    if (ga4Key.match(/login_id_(g?cid)_[12]$/)) return { devVar: '(ID 분할)', value: '(로그인 시 생성)', status: '🔒' };

    if (ga4Key.startsWith('page_location_')) {
      const idx = parseInt(ga4Key.replace('page_location_', '')) - 1;
      const pageUrl = devValues['_pageURL'] || '';
      const value = pageUrl.substring(idx * 100, (idx + 1) * 100);
      return { devVar: `URL.substr(${idx * 100}, 100)`, value: value || '', status: value ? '✅' : '⬜' };
    }

    for (const [devVar, ga4Keys] of Object.entries(DEV_VAR_MAPPING)) {
      if (ga4Keys.includes(ga4Key)) {
        const val = devValues[devVar];
        const hasValue = val !== undefined && val !== null && val !== '';
        return { devVar, value: hasValue ? String(val) : '', status: hasValue ? '✅' : '⬜' };
      }
    }

    return { devVar: '(unknown)', value: '', status: '❓' };
  };

  // 수집되는 파라미터
  console.log('\n### ✅ 수집되는 파라미터\n');
  console.log('| # | GA4 파라미터 | 개발 변수 | 개발 값 |');
  console.log('|---|--------------|-----------|---------|');

  let collectedIdx = 1;
  const collectedParams: any[] = [];
  const notCollectedParams: any[] = [];

  for (const param of [...eventParams, ...userParams]) {
    const { devVar, value, status } = getDevValueForParam(param.ga4Key);
    const displayVal = value.length > 40 ? value.substring(0, 37) + '...' : value || '(없음)';

    if (status === '✅') {
      collectedParams.push({ param, devVar, value, displayVal });
    } else {
      notCollectedParams.push({ param, devVar, value, displayVal, status });
    }
  }

  for (const item of collectedParams) {
    console.log(`| ${collectedIdx.toString().padStart(2)} | ${item.param.ga4Key.padEnd(22)} | ${item.devVar.padEnd(25)} | ${item.displayVal} |`);
    collectedIdx++;
  }

  // 미수집 파라미터
  console.log(`\n### ⬜ 미수집 파라미터 (${notCollectedParams.length}개)\n`);
  console.log('| # | GA4 파라미터 | 개발 변수 | 상태 | 사유 |');
  console.log('|---|--------------|-----------|------|------|');

  let notCollectedIdx = 1;
  for (const item of notCollectedParams) {
    let reason = '';
    if (item.status === '🔒') reason = '로그인 필요';
    else if (item.param.ga4Key.includes('login_')) reason = '비로그인 상태';
    else if (item.param.ga4Key.includes('product_')) reason = '상품 정보 없음';
    else if (item.param.ga4Key.includes('page_location_')) reason = 'URL 길이 초과';
    else reason = '조건 미충족';

    console.log(`| ${notCollectedIdx.toString().padStart(2)} | ${item.param.ga4Key.padEnd(22)} | ${item.devVar.padEnd(25)} | ${item.status} | ${reason} |`);
    notCollectedIdx++;
  }

  // ============================================================================
  // 5단계: 요약
  // ============================================================================
  console.log('\n━'.repeat(140));
  console.log('📋 요약');
  console.log('━'.repeat(140));

  console.log(`
페이지: ${productUrl}
페이지 타입: ${devValues['AP_DATA_PAGETYPE']}

📊 파라미터 현황:
   - 전체: ${pageViewResult.summary.total}개
   - ✅ 수집됨: ${collectedParams.length}개
   - ⬜ 미수집: ${notCollectedParams.length}개

🛍️ 상품 정보:
   - product_id: ${devValues['AP_PRD_CODE'] || '(없음)'}
   - product_name: ${devValues['AP_PRD_NAME'] || '(없음)'}
   - product_brandname: ${devValues['AP_PRD_BRAND'] || '(없음)'}
   - product_category: ${devValues['AP_PRD_CATEGORY'] || '(없음)'}

✅ GA4 수집 현황 (최근 7일):
   - PRODUCT_DETAIL page_view: ${ga4PageViewCount.toLocaleString()}건
`);
}

main().catch(console.error);
