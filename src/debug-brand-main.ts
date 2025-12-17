/**
 * BRAND_MAIN 페이지 디버깅
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

  console.log('=== BRAND_MAIN 디버깅 ===\n');

  const configLoader = createDefaultGTMConfigLoader();
  await configLoader.preload();
  const analyzer = IntegratedEventAnalyzer.fromConfigLoader(apiKey, configLoader);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const url = 'https://www.amoremall.com/kr/ko/display/brand/detail?brandNo=20001';
  console.log('URL:', url);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    try { await page.click('[class*="close"]', { timeout: 2000 }); } catch {}

    await page.screenshot({ path: './output/brand_debug.png', fullPage: false });
    const result = await analyzer.analyzeEventsForPage(url, './output/brand_debug.png', page);

    console.log('\n페이지 타입:', result.pageType);

    console.log('\n✅ actuallyCanFire (' + result.actuallyCanFire.length + '개):');
    for (const e of result.actuallyCanFire) {
      console.log('  -', e.eventName);
    }

    console.log('\n❌ noUIEvents (' + result.noUIEvents.length + '개):');
    for (const e of result.noUIEvents) {
      const reason = e.uiVerification?.reason?.substring(0, 80) || 'no reason';
      console.log('  -', e.eventName + ':', reason);
    }

    // scroll과 brand_product_click 상태 확인
    const scrollInCanFire = result.actuallyCanFire.find(e => e.eventName === 'scroll');
    const scrollInNoUI = result.noUIEvents.find(e => e.eventName === 'scroll');
    const scrollInBlocked = result.gtmBlockedEvents.find(e => e.eventName === 'scroll');

    const brandClickInCanFire = result.actuallyCanFire.find(e => e.eventName === 'brand_product_click');
    const brandClickInNoUI = result.noUIEvents.find(e => e.eventName === 'brand_product_click');
    const brandClickInBlocked = result.gtmBlockedEvents.find(e => e.eventName === 'brand_product_click');

    console.log('\n🔍 scroll 위치:');
    console.log('  actuallyCanFire:', !!scrollInCanFire);
    console.log('  noUIEvents:', !!scrollInNoUI);
    console.log('  gtmBlockedEvents:', !!scrollInBlocked);
    if (scrollInBlocked) console.log('    이유:', scrollInBlocked.summary);

    console.log('\n🔍 brand_product_click 위치:');
    console.log('  actuallyCanFire:', !!brandClickInCanFire);
    console.log('  noUIEvents:', !!brandClickInNoUI);
    console.log('  gtmBlockedEvents:', !!brandClickInBlocked);
    if (brandClickInBlocked) console.log('    이유:', brandClickInBlocked.summary);

  } catch (error: any) {
    console.error('오류:', error.message);
  }

  await browser.close();
  console.log('\n=== 완료 ===');
}

main().catch(console.error);
