/**
 * 단일 페이지 이벤트 예측 분석
 * Usage: npx ts-node src/analyze-single-page.ts <URL>
 */
import * as dotenv from 'dotenv';
import { chromium } from 'playwright';
import { IntegratedEventAnalyzer } from './analyzers/integratedEventAnalyzer';
import { createDefaultGTMConfigLoader } from './config/gtmConfigLoader';
import { edgeCaseLoader } from './config/siteEdgeCases';

dotenv.config();

const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID || '416629733';

async function analyzePage(url: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY not set');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 단일 페이지 이벤트 예측 분석');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('URL:', url);
  console.log('Property ID:', GA4_PROPERTY_ID);

  // Edge Cases 로드
  const edgeCases = edgeCaseLoader.getEdgeCasesForProperty(GA4_PROPERTY_ID);
  console.log('\n📌 로드된 Edge Cases:', edgeCases.length, '개');

  const configLoader = createDefaultGTMConfigLoader();
  console.log('\n⏳ GTM 설정 로드 중...');
  await configLoader.preload();
  console.log('✅ GTM 설정 로드 완료');

  const analyzer = IntegratedEventAnalyzer.fromConfigLoader(apiKey, configLoader);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  try {
    console.log('\n🌐 페이지 로딩...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // 팝업 닫기 시도
    try {
      await page.click('[class*="close"]', { timeout: 2000 });
      await page.waitForTimeout(1000);
    } catch {}

    const screenshotPath = './output/single_page_analysis.png';
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log('📸 스크린샷:', screenshotPath);

    console.log('\n🔍 통합 이벤트 분석 실행...');
    const result = await analyzer.analyzeEventsForPage(url, screenshotPath, page, { skipVision: false });

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('📊 분석 결과');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('\n📍 페이지 타입:', result.pageType);
    console.log('   설명:', result.pageTypeDescription);

    // Edge Case 적용
    const filteredEvents: any[] = [];
    const excludedByEdgeCase: { eventName: string; reason: string }[] = [];

    for (const event of result.actuallyCanFire) {
      const ec = edgeCases.find(e => e.eventName === event.eventName);
      let excluded = false;
      let note = '';

      if (ec) {
        if (ec.type === 'PAGE_RESTRICTION' && ec.allowedPageTypes) {
          if (!ec.allowedPageTypes.includes(result.pageType)) {
            excluded = true;
            note = `PAGE_RESTRICTION: ${ec.allowedPageTypes.join(', ')}에서만 허용`;
          }
        } else if (ec.type === 'PAGE_EXCLUSION' && ec.excludedPageTypes) {
          if (ec.excludedPageTypes.includes(result.pageType)) {
            excluded = true;
            note = `PAGE_EXCLUSION: ${result.pageType}에서 제외됨`;
          }
        } else if (ec.type === 'NOISE_EXPECTED' && ec.affectedPageTypes) {
          if (ec.affectedPageTypes.includes(result.pageType)) {
            note = `NOISE_EXPECTED: 노이즈 가능 (${ec.expectedNoisePercent}%)`;
          }
        }
      }

      if (excluded) {
        excludedByEdgeCase.push({ eventName: event.eventName, reason: note });
      } else {
        filteredEvents.push({ ...event, note });
      }
    }

    console.log('\n✅ 예측 이벤트 (Edge Case 적용 후):', filteredEvents.length, '개');
    console.log('───────────────────────────────────────────────────────────────');

    for (const event of filteredEvents) {
      console.log(`\n  🎯 ${event.eventName}`);
      console.log(`     설명: ${event.description}`);
      if (event.triggerInfo && event.triggerInfo.length > 0) {
        console.log(`     트리거: ${event.triggerInfo.map((t: any) => t.triggerName).join(', ')}`);
      }
      if (event.uiVerification) {
        console.log(`     UI 검증: ${event.uiVerification.hasUI ? '✅ UI 존재' : '❌ UI 없음'}`);
        if (event.uiVerification.reason) {
          console.log(`     Vision AI: ${event.uiVerification.reason}`);
        }
      }
      if (event.note) {
        console.log(`     ⚠️ Edge Case: ${event.note}`);
      }
    }

    if (excludedByEdgeCase.length > 0) {
      console.log('\n\n🔧 Edge Case로 제외된 이벤트:', excludedByEdgeCase.length, '개');
      console.log('───────────────────────────────────────────────────────────────');
      for (const ex of excludedByEdgeCase) {
        console.log(`  ❌ ${ex.eventName} - ${ex.reason}`);
      }
    }

    // UI 없어서 발생 불가능한 이벤트
    if (result.noUIEvents.length > 0) {
      console.log('\n\n⚠️ UI 없음 (GTM 가능하나 UI 부재):', result.noUIEvents.length, '개');
      console.log('───────────────────────────────────────────────────────────────');
      for (const event of result.noUIEvents.slice(0, 8)) {
        const reason = event.uiVerification?.reason || '알 수 없음';
        console.log(`  - ${event.eventName}: ${reason}`);
      }
      if (result.noUIEvents.length > 8) {
        console.log(`  ... 외 ${result.noUIEvents.length - 8}개`);
      }
    }

    // GTM 조건 미충족 이벤트
    if (result.gtmBlockedEvents.length > 0) {
      console.log('\n\n🚫 GTM 조건 미충족:', result.gtmBlockedEvents.length, '개');
      console.log('───────────────────────────────────────────────────────────────');
      for (const event of result.gtmBlockedEvents.slice(0, 8)) {
        console.log(`  - ${event.eventName}: ${event.summary}`);
      }
      if (result.gtmBlockedEvents.length > 8) {
        console.log(`  ... 외 ${result.gtmBlockedEvents.length - 8}개`);
      }
    }

    // 자동 수집 이벤트
    if (result.autoCollectedEvents.length > 0) {
      console.log('\n\n📊 자동 수집 이벤트:', result.autoCollectedEvents.join(', '));
    }

    console.log('\n═══════════════════════════════════════════════════════════════');

  } finally {
    await browser.close();
  }
}

const url = process.argv[2] || 'https://www.amoremall.com/kr/ko/display/event_detail?planDisplaySn=13681';
analyzePage(url).catch(console.error);
