/**
 * 메인 페이지 이벤트 분석 테스트
 */
import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { IntegratedEventAnalyzer } from './analyzers/integratedEventAnalyzer';

dotenv.config();

const TEST_URL = 'https://www.amoremall.com/kr/ko/display/main';

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not set');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'ko-KR' });
  const page = await context.newPage();

  try {
    console.log('페이지 로드 중:', TEST_URL);
    await page.goto(TEST_URL, { waitUntil: 'networkidle', timeout: 60000 });

    // 팝업 닫기
    try { await page.click('[class*="close"]', { timeout: 2000 }); } catch {}
    await page.waitForTimeout(3000);

    const screenshotPath = './output/main_page_test.png';
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log('스크린샷 저장:', screenshotPath);

    const analyzer = new IntegratedEventAnalyzer(
      apiKey,
      './GTM-5FK5X5C4_workspace112.json',
      './[EC]+WEB+개발+가이드_GTM코드추가(Shopify)1.1.pdf'
    );

    const result = await analyzer.analyzeEventsForPage(TEST_URL, screenshotPath, page);

    console.log('\n========================================');
    console.log('메인 페이지 예상 이벤트 분석 결과');
    console.log('========================================\n');

    console.log('【발생 가능 이벤트】');
    console.log('-'.repeat(50));
    for (const e of result.actuallyCanFire) {
      const triggers = e.triggerInfo.map(t => t.triggerType).join(', ') || 'auto';
      console.log(`✅ ${e.eventName}`);
      console.log(`   트리거: ${triggers}`);
      console.log(`   설명: ${e.description.substring(0, 60)}`);
      if (e.uiVerification.foundUIElements) {
        console.log(`   UI: ${e.uiVerification.foundUIElements.substring(0, 60)}`);
      }
      console.log('');
    }

    console.log('\n【UI 없어서 발생 불가】');
    console.log('-'.repeat(50));
    for (const e of result.noUIEvents) {
      console.log(`❌ ${e.eventName}`);
      console.log(`   이유: ${e.uiVerification.reason.substring(0, 80)}`);
      console.log('');
    }

    console.log('\n【GTM/개발가이드 조건 미충족】');
    console.log('-'.repeat(50));
    for (const e of result.gtmBlockedEvents) {
      console.log(`🚫 ${e.eventName}`);
      console.log(`   이유: ${e.summary.substring(0, 80)}`);
      console.log('');
    }

    // 요약
    console.log('\n========================================');
    console.log('요약');
    console.log('========================================');
    console.log(`발생 가능: ${result.actuallyCanFire.length}개`);
    console.log(`UI 없음: ${result.noUIEvents.length}개`);
    console.log(`GTM 차단: ${result.gtmBlockedEvents.length}개`);

  } finally {
    await browser.close();
  }
}

main().catch(console.error);
