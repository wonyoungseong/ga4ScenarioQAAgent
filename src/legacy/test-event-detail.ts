/**
 * EVENT_DETAIL 페이지 분석 - scroll 이벤트 검증
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

  console.log('=== EVENT_DETAIL 페이지 분석 (scroll 검증) ===\n');

  // 1. 설정 로드
  const configLoader = createDefaultGTMConfigLoader();
  await configLoader.preload();
  const analyzer = IntegratedEventAnalyzer.fromConfigLoader(apiKey, configLoader);

  // 2. 브라우저 실행
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  // EVENT_DETAIL 페이지
  const url = 'https://www.amoremall.com/kr/ko/display/event_detail?eventId=2412_apsesta';
  console.log('URL:', url);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    // 팝업 닫기
    try { await page.click('[class*="close"]', { timeout: 2000 }); } catch {}
    await page.waitForTimeout(2000);

    await page.screenshot({ path: './output/event_detail_scroll_test.png', fullPage: false });
    console.log('스크린샷 저장: ./output/event_detail_scroll_test.png\n');

    const result = await analyzer.analyzeEventsForPage(url, './output/event_detail_scroll_test.png', page);

    console.log('\n=== 분석 결과 ===');
    console.log('페이지 타입:', result.pageType);

    // scroll 이벤트 확인
    const scrollEvent = result.actuallyCanFire.find(e => e.eventName === 'scroll');
    const scrollBlocked = result.gtmBlockedEvents.find(e => e.eventName === 'scroll');

    console.log('\n🔍 scroll 이벤트 상태:');
    if (scrollEvent) {
      console.log('  ✅ scroll 발생 가능!');
      console.log('  이유:', scrollEvent.uiVerification?.reason?.substring(0, 150) || 'UI 검증 미수행');
    } else if (scrollBlocked) {
      console.log('  ❌ scroll 차단됨');
      console.log('  이유:', scrollBlocked.summary);
    } else {
      console.log('  ⚠️ scroll 이벤트를 찾을 수 없음');
    }

    console.log('\n✅ 발생 가능 이벤트 (' + result.actuallyCanFire.length + '개):');
    for (const e of result.actuallyCanFire) {
      const marker = e.eventName === 'scroll' ? '🎯 ' : '  ';
      console.log(`${marker}- ${e.eventName}`);
    }

    console.log('\n🚫 GTM/조건부 차단 (scroll 관련):');
    const scrollRelated = result.gtmBlockedEvents.filter(e =>
      e.eventName.toLowerCase().includes('scroll') ||
      e.summary.toLowerCase().includes('scroll')
    );

    if (scrollRelated.length === 0) {
      console.log('  scroll 관련 차단 없음 ✅');
    } else {
      for (const e of scrollRelated) {
        console.log(`  - ${e.eventName}: ${e.summary}`);
      }
    }

    // GA4 실제 이벤트
    console.log('\n========================================');
    console.log('📊 GA4 실제 발생 이벤트 (EVENT_DETAIL):');
    console.log('  1. scroll: 40.2% (6,849,268)');
    console.log('  2. view_promotion_detail: 12.7%');
    console.log('  3. page_view: 9.5%');
    console.log('  4. video_progress: 8.3%');
    console.log('  5. ap_click: 5.7%');

    console.log('\n📋 scroll 검증 결과:');
    if (scrollEvent) {
      console.log('  ✅ EVENT_DETAIL에서 scroll 정상 예측!');
    } else {
      console.log('  ❌ EVENT_DETAIL에서 scroll 예측 실패 - 수정 필요');
    }

  } catch (error: any) {
    console.error('오류:', error.message);
  }

  await browser.close();
  console.log('\n=== 완료 ===');
}

main().catch(console.error);
