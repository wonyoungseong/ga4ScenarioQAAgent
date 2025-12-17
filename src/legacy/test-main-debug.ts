/**
 * MAIN 페이지 분석 디버그
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

  console.log('=== MAIN 페이지 분석 디버그 ===\n');

  // 1. 설정 로드
  const configLoader = createDefaultGTMConfigLoader();
  await configLoader.preload();
  const analyzer = IntegratedEventAnalyzer.fromConfigLoader(apiKey, configLoader);

  // 2. 브라우저 실행
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  // MAIN 페이지
  const url = 'https://www.amoremall.com/kr/ko/display/main';
  console.log('URL:', url);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

  // 팝업 닫기
  try { await page.click('[class*="close"]', { timeout: 2000 }); } catch {}
  await page.waitForTimeout(2000);

  await page.screenshot({ path: './output/main_debug.png', fullPage: false });
  console.log('스크린샷 저장: ./output/main_debug.png\n');

  const result = await analyzer.analyzeEventsForPage(url, './output/main_debug.png', page);

  console.log('\n=== 분석 결과 ===');
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

  console.log('\n🚫 GTM/조건부 차단 (상위 15개):');
  for (const e of result.gtmBlockedEvents.slice(0, 15)) {
    console.log(`  - ${e.eventName}: ${e.summary.substring(0, 100)}`);
  }

  // GA4 실제 이벤트 목록 (비교용)
  console.log('\n📊 GA4 실제 발생 이벤트 (MAIN 페이지):');
  console.log('  - ap_click, view_promotion, click_with_duration, select_promotion, qualified_visit, login, custom_event');

  await browser.close();
  console.log('\n=== 완료 ===');
}

main().catch(console.error);
