/**
 * EVENT_LIST 페이지 분석 디버그
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

  console.log('=== EVENT_LIST 페이지 분석 디버그 ===\n');

  // 1. 설정 로드
  const configLoader = createDefaultGTMConfigLoader();
  await configLoader.preload();
  const analyzer = IntegratedEventAnalyzer.fromConfigLoader(apiKey, configLoader);

  // 2. 브라우저 실행
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  // EVENT_LIST 페이지
  const url = 'https://www.amoremall.com/kr/ko/display/event';
  console.log('URL:', url);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

  // 팝업 닫기
  try { await page.click('[class*="close"]', { timeout: 2000 }); } catch {}
  await page.waitForTimeout(2000);

  await page.screenshot({ path: './output/event_list_debug.png', fullPage: false });
  console.log('스크린샷 저장: ./output/event_list_debug.png\n');

  const result = await analyzer.analyzeEventsForPage(url, './output/event_list_debug.png', page);

  console.log('\n=== 분석 결과 ===');
  console.log('페이지 타입:', result.pageType);

  console.log('\n✅ 발생 가능 이벤트 (' + result.actuallyCanFire.length + '개):');
  for (const e of result.actuallyCanFire) {
    console.log(`  - ${e.eventName}`);
    console.log(`    이유: ${e.uiVerification.reason}`);
    if (e.uiVerification.foundUIElements) {
      console.log(`    UI: ${e.uiVerification.foundUIElements}`);
    }
  }

  console.log('\n❌ UI 없어서 발생 불가 (' + result.noUIEvents.length + '개):');
  for (const e of result.noUIEvents) {
    console.log(`  - ${e.eventName}: ${e.uiVerification.reason}`);
  }

  console.log('\n🚫 GTM/조건부 차단 (상위 20개):');
  for (const e of result.gtmBlockedEvents.slice(0, 20)) {
    console.log(`  - ${e.eventName}: ${e.summary.substring(0, 100)}`);
  }

  // GA4 실제 이벤트 목록 (비교용)
  console.log('\n========================================');
  console.log('📊 GA4 실제 발생 이벤트 (/kr/ko/display/event):');
  console.log('  1. view_promotion_detail: 2,119,913');
  console.log('  2. video_progress: 1,909,865');
  console.log('  3. ap_click: 958,118');
  console.log('  4. video_start: 707,259');
  console.log('  5. click_with_duration: 591,946');
  console.log('  ... 외 3개 (custom_event, qualified_visit, view_promotion 추정)');

  console.log('\n📋 예측 vs 실제 비교:');
  const predicted = result.actuallyCanFire.map(e => e.eventName);
  const actual = ['view_promotion_detail', 'video_progress', 'ap_click', 'video_start', 'click_with_duration', 'custom_event', 'qualified_visit', 'view_promotion'];

  const correct = predicted.filter(p => actual.includes(p));
  const wrong = predicted.filter(p => !actual.includes(p));
  const missing = actual.filter(a => !predicted.includes(a));

  console.log('  ✅ 정확:', correct.join(', ') || '없음');
  console.log('  ❌ 잘못 예측:', wrong.join(', ') || '없음');
  console.log('  ⚠️ 누락:', missing.join(', ') || '없음');

  await browser.close();
  console.log('\n=== 완료 ===');
}

main().catch(console.error);
