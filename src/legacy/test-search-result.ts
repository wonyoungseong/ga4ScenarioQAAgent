/**
 * SEARCH_RESULT 페이지 분석 테스트
 */

import { chromium } from 'playwright';
import * as dotenv from 'dotenv';
import { createDefaultGTMConfigLoader } from './config/gtmConfigLoader';
import { IntegratedEventAnalyzer } from './analyzers/integratedEventAnalyzer';

dotenv.config();

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not set');
    process.exit(1);
  }

  console.log('=== SEARCH_RESULT 페이지 분석 ===\n');

  // 1. 설정 로드
  const configLoader = createDefaultGTMConfigLoader();
  await configLoader.preload();
  const analyzer = IntegratedEventAnalyzer.fromConfigLoader(apiKey, configLoader);

  // 2. 브라우저 실행
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  // SEARCH_RESULT 페이지 - 실제 검색어로 테스트
  const url = 'https://www.amoremall.com/kr/ko/search?searchKeyword=%EC%84%A4%ED%99%94%EC%88%98';
  console.log('URL:', url);

  try {
    // domcontentloaded로 변경하여 타임아웃 방지
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000); // 추가 대기

    // 팝업 닫기
    try { await page.click('[class*="close"]', { timeout: 2000 }); } catch {}
    await page.waitForTimeout(2000);

    await page.screenshot({ path: './output/search_result_debug.png', fullPage: false });
    console.log('스크린샷 저장: ./output/search_result_debug.png\n');

    const result = await analyzer.analyzeEventsForPage(url, './output/search_result_debug.png', page);

    console.log('\n=== 분석 결과 ===');
    console.log('페이지 타입:', result.pageType);

    console.log('\n✅ 발생 가능 이벤트 (' + result.actuallyCanFire.length + '개):');
    for (const e of result.actuallyCanFire) {
      console.log(`  - ${e.eventName}`);
      if (e.uiVerification?.reason) {
        console.log(`    이유: ${e.uiVerification.reason.substring(0, 100)}...`);
      }
    }

    console.log('\n❌ UI 없어서 발생 불가 (' + result.noUIEvents.length + '개):');
    for (const e of result.noUIEvents) {
      console.log(`  - ${e.eventName}: ${e.uiVerification?.reason?.substring(0, 80)}...`);
    }

    console.log('\n🚫 GTM/조건부 차단 (상위 15개):');
    for (const e of result.gtmBlockedEvents.slice(0, 15)) {
      console.log(`  - ${e.eventName}: ${e.summary.substring(0, 70)}...`);
    }

    // GA4 실제 이벤트 (SEARCH에서 발생하는 이벤트)
    console.log('\n========================================');
    console.log('📊 GA4 실제 발생 이벤트 (SEARCH/SEARCH_RESULT):');
    console.log('  - ap_click (45.1%)');
    console.log('  - view_search_results (1.9%)');
    console.log('  - view_item_list (1.8%)');
    console.log('  - select_item (1.3%)');
    console.log('  - select_promotion (1.0%)');

    console.log('\n📋 예측 vs 실제 비교:');
    const predicted = result.actuallyCanFire.map(e => e.eventName);
    const actual = ['ap_click', 'view_search_results', 'view_item_list', 'select_item', 'select_promotion', 'click_with_duration', 'screen_view', 'page_view'];

    const correct = predicted.filter(p => actual.includes(p));
    const wrong = predicted.filter(p => !actual.includes(p));
    const missing = actual.filter(a => !predicted.includes(a));

    console.log('  ✅ 정확:', correct.join(', ') || '없음');
    console.log('  ❌ 잘못 예측:', wrong.join(', ') || '없음');
    console.log('  ⚠️ 누락:', missing.join(', ') || '없음');

  } catch (error: any) {
    console.error('오류:', error.message);
  }

  await browser.close();
  console.log('\n=== 완료 ===');
}

main().catch(console.error);
