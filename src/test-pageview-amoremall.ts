/**
 * Amoremall 메인 페이지 PAGE_VIEW 파라미터 확인
 *
 * URL: https://www.amoremall.com/kr/ko/display/main
 */

import { chromium } from 'playwright';
import { getEventParameters, initializeParameterRegistry } from './config/parameterRegistry';

const TARGET_URL = 'https://www.amoremall.com/kr/ko/display/main';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Amoremall PAGE_VIEW 파라미터 수집 확인                          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // 1. Parameter Registry 초기화
  console.log('1️⃣ Parameter Registry 초기화...');
  await initializeParameterRegistry();

  // 2. page_view 파라미터 조회
  console.log('\n2️⃣ page_view 파라미터 조회 (PARAM_MAPPING_TABLE.md 기반)...\n');
  const params = getEventParameters('page_view');

  if (!params) {
    console.log('❌ page_view 이벤트 정보를 찾을 수 없습니다.');
    return;
  }

  console.log(`📊 page_view 파라미터 요약:`);
  console.log(`   - 총 파라미터: ${params.summary.total}개`);
  console.log(`   - GA4 표준: ${params.summary.standard}개`);
  console.log(`   - Custom: ${params.summary.custom}개`);
  console.log(`   - items 배열: ${params.hasItems ? '포함' : '미포함'}`);

  // 3. 실제 페이지 방문하여 dataLayer 확인
  console.log('\n3️⃣ 실제 페이지 방문하여 dataLayer 확인...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'ko-KR',
  });
  const page = await context.newPage();

  // GA4 네트워크 요청 캡처
  const ga4Requests: { url: string; eventName: string; params: Record<string, string> }[] = [];

  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('google-analytics.com/g/collect') ||
        url.includes('analytics.google.com/g/collect')) {
      try {
        const urlObj = new URL(url);
        const eventName = urlObj.searchParams.get('en') || '(unknown)';
        const params: Record<string, string> = {};
        for (const [key, value] of urlObj.searchParams.entries()) {
          params[key] = value;
        }
        ga4Requests.push({ url, eventName, params });
      } catch (e) {
        // ignore
      }
    }
  });

  console.log(`   페이지 로드: ${TARGET_URL}`);
  await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  // dataLayer에서 AP_DATA 변수 확인
  const globalVars = await page.evaluate(() => {
    const result: Record<string, any> = {};
    const apDataKeys = [
      'AP_DATA_SITENAME', 'AP_DATA_COUNTRY', 'AP_DATA_LANG', 'AP_DATA_ENV',
      'AP_DATA_CHANNEL', 'AP_DATA_BREAD', 'AP_DATA_PAGETYPE', 'AP_DATA_ISLOGIN',
      'AP_PROMO_ID', 'AP_PROMO_NAME',
      // 사용자 정보 (로그인 시)
      'AP_DATA_GCID', 'AP_DATA_CID', 'AP_DATA_ISMEMBER', 'AP_DATA_CG',
      'AP_DATA_CD', 'AP_DATA_LOGINTYPE', 'AP_DATA_CT', 'AP_DATA_BEAUTYCT', 'AP_DATA_ISEMPLOYEE',
    ];

    for (const key of apDataKeys) {
      const value = (window as any)[key];
      if (value !== undefined) {
        result[key] = typeof value === 'string' && value.length > 50
          ? value.substring(0, 50) + '...'
          : value;
      }
    }
    return result;
  });

  await browser.close();

  // 4. 결과 출력
  console.log('\n4️⃣ 결과 분석\n');
  console.log('═'.repeat(70));
  console.log('【 개발가이드 변수 (전역 변수) 확인 】');
  console.log('═'.repeat(70));

  const expectedParams = params.parameters.filter(p => p.category === 'common' || p.category === 'event');

  console.log('\n┌─────────────────────┬───────────────────┬──────────────────────┐');
  console.log('│ 개발가이드 변수          │ GA4 파라미터          │ 실제 값                 │');
  console.log('├─────────────────────┼───────────────────┼──────────────────────┤');

  for (const p of expectedParams) {
    const actualValue = globalVars[p.devGuideVar];
    const valueStr = actualValue !== undefined
      ? String(actualValue).substring(0, 20)
      : '❌ 없음';
    const status = actualValue !== undefined ? '✅' : '❌';

    console.log(`│ ${p.devGuideVar.padEnd(19)} │ ${p.ga4Key.padEnd(17)} │ ${status} ${valueStr.padEnd(18)} │`);
  }
  console.log('└─────────────────────┴───────────────────┴──────────────────────┘');

  // GA4 요청에서 page_view 확인
  console.log('\n═'.repeat(70));
  console.log('【 GA4 네트워크 요청 확인 】');
  console.log('═'.repeat(70));

  const pageViewRequests = ga4Requests.filter(r => r.eventName === 'page_view');
  console.log(`\n📊 GA4 요청: ${ga4Requests.length}개 (page_view: ${pageViewRequests.length}개)`);

  if (pageViewRequests.length > 0) {
    const pvReq = pageViewRequests[0];
    console.log('\n▶ page_view 요청 파라미터:');

    // 예상 파라미터와 비교
    const customParams = params.parameters.filter(p => p.isCustomDimension && p.category !== 'user');
    console.log('\n   Custom 파라미터 (ep.xxx):');
    for (const p of customParams.slice(0, 10)) {
      const epKey = `ep.${p.ga4Key}`;
      const value = pvReq.params[epKey];
      const status = value ? '✅' : '❌';
      console.log(`   ${status} ${p.ga4Key}: ${value || '(없음)'}`);
    }
  } else {
    console.log('\n⚠️ page_view 이벤트가 GA4 네트워크 요청에서 발견되지 않았습니다.');
    console.log('   (gtm.js 초기화 전이거나 다른 이벤트명으로 전송될 수 있음)');
  }

  // 5. 결론
  console.log('\n═'.repeat(70));
  console.log('【 결론 】');
  console.log('═'.repeat(70));

  const missingVars = expectedParams.filter(p => globalVars[p.devGuideVar] === undefined);
  const presentVars = expectedParams.filter(p => globalVars[p.devGuideVar] !== undefined);

  console.log(`\n✅ 수집 가능: ${presentVars.length}개 파라미터`);
  console.log(`❌ 누락: ${missingVars.length}개 파라미터`);

  if (missingVars.length > 0) {
    console.log('\n⚠️ 누락된 파라미터:');
    for (const p of missingVars) {
      console.log(`   - ${p.devGuideVar} → ${p.ga4Key}`);
    }
  }

  console.log('\n📌 GA4 API 조회 시 사용할 dimension:');
  console.log('   Standard: country, language');
  console.log('   Custom: customEvent:site_name, customEvent:page_type, ...');

  console.log('\n✅ 완료');
}

main().catch(console.error);
