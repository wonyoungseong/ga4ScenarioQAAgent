/**
 * Amoremall PAGE_VIEW GA4 요청 상세 분석
 *
 * page_type이 content_group으로 전송되는지 확인
 */

import { chromium } from 'playwright';

const TARGET_URL = 'https://www.amoremall.com/kr/ko/display/main';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  PAGE_VIEW GA4 요청 상세 분석 (Content Group 포함)              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

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
        const params: Record<string, string> = {};
        for (const [key, value] of urlObj.searchParams.entries()) {
          params[key] = decodeURIComponent(value);
        }
        const eventName = params['en'] || '(unknown)';
        ga4Requests.push({ url, eventName, params });
      } catch (e) {
        // ignore
      }
    }
  });

  console.log(`📍 페이지 로드: ${TARGET_URL}\n`);
  await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  await browser.close();

  // page_view 요청 분석
  const pageViewReq = ga4Requests.find(r => r.eventName === 'page_view');

  if (!pageViewReq) {
    console.log('❌ page_view 이벤트를 찾을 수 없습니다.');
    return;
  }

  console.log('═'.repeat(70));
  console.log('【 page_view 요청 전체 파라미터 】');
  console.log('═'.repeat(70));

  // 파라미터 분류
  const categories: Record<string, Record<string, string>> = {
    'Content Group (cg)': {},
    'Event Parameters (ep.)': {},
    'User Properties (up.)': {},
    '표준 GA4 파라미터': {},
    '기타': {},
  };

  for (const [key, value] of Object.entries(pageViewReq.params)) {
    // Content Group
    if (key.startsWith('cg') || key === 'content_group') {
      categories['Content Group (cg)'][key] = value;
    }
    // Event Parameters
    else if (key.startsWith('ep.')) {
      categories['Event Parameters (ep.)'][key] = value;
    }
    // User Properties
    else if (key.startsWith('up.')) {
      categories['User Properties (up.)'][key] = value;
    }
    // 표준 파라미터
    else if (['dl', 'dr', 'dt', 'en', 'sid', 'cid', '_p', 'ul', 'sr'].includes(key)) {
      categories['표준 GA4 파라미터'][key] = value;
    }
    // 기타
    else {
      categories['기타'][key] = value;
    }
  }

  // 카테고리별 출력
  for (const [category, params] of Object.entries(categories)) {
    const keys = Object.keys(params);
    if (keys.length === 0) continue;

    console.log(`\n【 ${category} 】 (${keys.length}개)`);
    console.log('-'.repeat(50));

    for (const [key, value] of Object.entries(params)) {
      const displayValue = value.length > 60 ? value.substring(0, 60) + '...' : value;
      console.log(`  ${key.padEnd(25)} = ${displayValue}`);
    }
  }

  // page_type / content_group 확인
  console.log('\n' + '═'.repeat(70));
  console.log('【 page_type / content_group 매핑 확인 】');
  console.log('═'.repeat(70));

  const contentGroupKeys = Object.keys(pageViewReq.params).filter(k => k.startsWith('cg') || k.includes('content'));
  const pageTypeKeys = Object.keys(pageViewReq.params).filter(k => k.includes('page_type') || k.includes('pagetype'));

  console.log('\n▶ Content Group 관련 파라미터:');
  if (contentGroupKeys.length > 0) {
    for (const key of contentGroupKeys) {
      console.log(`   ${key} = ${pageViewReq.params[key]}`);
    }
  } else {
    console.log('   (없음)');
  }

  console.log('\n▶ page_type 관련 파라미터:');
  if (pageTypeKeys.length > 0) {
    for (const key of pageTypeKeys) {
      console.log(`   ${key} = ${pageViewReq.params[key]}`);
    }
  } else {
    console.log('   (없음 - content_group으로 전송되었을 수 있음)');
  }

  // 결론
  console.log('\n' + '═'.repeat(70));
  console.log('【 결론 】');
  console.log('═'.repeat(70));

  const epSiteName = pageViewReq.params['ep.site_name'];
  const epChannel = pageViewReq.params['ep.channel'];
  const epPageType = pageViewReq.params['ep.page_type'];
  const cg = Object.entries(pageViewReq.params).find(([k]) => k.startsWith('cg'));

  console.log('\n📊 주요 파라미터 전송 현황:');
  console.log(`   site_name:  ${epSiteName ? `✅ ep.site_name = ${epSiteName}` : '❌ 미전송'}`);
  console.log(`   channel:    ${epChannel ? `✅ ep.channel = ${epChannel}` : '❌ 미전송'}`);
  console.log(`   page_type:  ${epPageType ? `✅ ep.page_type = ${epPageType}` : cg ? `✅ ${cg[0]} = ${cg[1]} (Content Group)` : '❌ 미전송'}`);

  console.log('\n✅ 완료');
}

main().catch(console.error);
