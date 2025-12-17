/**
 * 브랜드 페이지 분석 스크립트
 */

import { chromium } from 'playwright';
import * as dotenv from 'dotenv';
import { createDefaultGTMConfigLoader } from './config/gtmConfigLoader';
import { IntegratedEventAnalyzer } from './analyzers/integratedEventAnalyzer';
import { GA4Client } from './ga4/ga4Client';

dotenv.config();

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  const propertyId = process.env.GA4_PROPERTY_ID || '416629733';

  if (!apiKey) {
    console.error('GEMINI_API_KEY not set');
    process.exit(1);
  }

  console.log('=== 브랜드 페이지 분석 ===\n');

  // 1. 설정 미리 로드
  console.log('【1. 설정 로드】');
  const configLoader = createDefaultGTMConfigLoader();
  await configLoader.preload();
  console.log('✅ 설정 로드 완료\n');

  // 2. 분석기 생성
  const analyzer = IntegratedEventAnalyzer.fromConfigLoader(apiKey, configLoader);

  // 3. 브라우저 실행
  console.log('【2. 페이지 로드】');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const testUrl = 'https://www.amoremall.com/kr/ko/display/brand/detail?brandSn=18';

  console.log('URL:', testUrl);
  console.log('페이지 로드 중...');

  await page.goto(testUrl, { waitUntil: 'networkidle', timeout: 60000 });

  // 팝업 닫기
  try { await page.click('[class*="close"]', { timeout: 2000 }); } catch {}
  await page.waitForTimeout(2000);

  // AP_DATA_PAGETYPE 확인
  const apDataPageType = await page.evaluate(() => (window as any).AP_DATA_PAGETYPE);
  console.log('AP_DATA_PAGETYPE:', apDataPageType);

  // 스크린샷
  const screenshotPath = './output/brand_page_analysis.png';
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log('스크린샷 저장:', screenshotPath);

  // 4. Vision AI 분석 실행
  console.log('\n【3. Vision AI 분석】');
  console.log('분석 실행 중...');
  const startTime = Date.now();
  const result = await analyzer.analyzeEventsForPage(testUrl, screenshotPath, page);
  const analysisTime = Date.now() - startTime;

  console.log(`분석 시간: ${analysisTime}ms`);
  console.log('\n페이지 타입:', result.pageType);

  console.log('\n✅ 발생 가능 이벤트 (' + result.actuallyCanFire.length + '개):');
  for (const e of result.actuallyCanFire) {
    console.log(`  - ${e.eventName}: ${e.description.substring(0, 60)}...`);
  }

  console.log('\n❌ UI 없음 (' + result.noUIEvents.length + '개):');
  for (const e of result.noUIEvents.slice(0, 5)) {
    console.log(`  - ${e.eventName}: ${(e as any).reason?.substring(0, 60) || e.description?.substring(0, 60)}...`);
  }

  console.log('\n🚫 GTM 차단 (' + result.gtmBlockedEvents.length + '개):');
  for (const e of result.gtmBlockedEvents.slice(0, 5)) {
    console.log(`  - ${e.eventName}: ${(e as any).reason?.substring(0, 60) || (e as any).description?.substring(0, 60)}...`);
  }

  await browser.close();

  // 5. GA4 실제 데이터와 비교
  if (propertyId) {
    console.log('\n\n【4. GA4 실제 데이터 비교】');
    console.log('-'.repeat(60));

    const ga4Client = new GA4Client({ propertyId });

    try {
      await ga4Client.initialize();

      // 브랜드 페이지 경로로 GA4 데이터 조회
      const pagePath = '/kr/ko/display/brand/detail';
      const analysis = await ga4Client.analyzePageEvents(pagePath, {
        startDate: '7daysAgo',
        endDate: 'today',
      });

      console.log(`\nGA4 페이지 경로: ${pagePath}`);
      console.log(`총 이벤트 수: ${analysis.totalEventCount.toLocaleString()}`);
      console.log(`유의미 이벤트: ${analysis.significantEvents.length}개`);
      console.log(`노이즈 이벤트: ${analysis.noiseEvents.length}개`);

      console.log('\n📊 GA4 실제 이벤트 (비중 순):');
      for (const e of analysis.events.slice(0, 15)) {
        const icon = e.isNoise ? '🔇' : e.isLowSignificance ? '🔉' : '🔊';
        console.log(`  ${icon} ${e.eventName}: ${e.eventCount.toLocaleString()} (${e.percentString})`);
      }

      // 예측 vs 실제 비교
      const predictedEvents = result.actuallyCanFire.map(e => e.eventName);
      const comparison = await ga4Client.compareWithPredictions(pagePath, predictedEvents, {
        startDate: '7daysAgo',
        endDate: 'today',
      });

      console.log('\n\n【5. 예측 정확도 분석】');
      console.log('-'.repeat(60));

      console.log('\n✅ 정확히 예측 (' + comparison.correctPredictions.length + '개):');
      for (const e of comparison.correctPredictions) {
        console.log(`  - ${e}`);
      }

      console.log('\n⚠️ 예측 못한 유의미 이벤트 (' + comparison.missedEvents.length + '개):');
      for (const e of comparison.missedEvents) {
        const eventData = analysis.events.find(x => x.eventName === e);
        console.log(`  - ${e}: ${eventData?.eventCount.toLocaleString() || 'N/A'} (${eventData?.percentString || 'N/A'})`);
      }

      console.log('\n🔇 예측 못한 GA4 자동 수집 (' + comparison.missedAutoEvents.length + '개):');
      for (const e of comparison.missedAutoEvents.slice(0, 5)) {
        console.log(`  - ${e} (정상 - 자동 수집)`);
      }

      console.log('\n❌ 잘못 예측 (' + comparison.falsePredictions.length + '개):');
      for (const e of comparison.falsePredictions) {
        console.log(`  - ${e}`);
      }

      // 정확도 계산
      const totalPredicted = predictedEvents.length;
      const correct = comparison.correctPredictions.length;
      const accuracy = totalPredicted > 0 ? (correct / totalPredicted * 100).toFixed(1) : '0';

      console.log('\n\n【정확도 요약】');
      console.log(`예측: ${totalPredicted}개 | 정확: ${correct}개 | 정확도: ${accuracy}%`);
      console.log(`예측 못한 중요 이벤트: ${comparison.missedEvents.length}개`);

    } catch (error: any) {
      console.error('GA4 조회 실패:', error.message);
    }
  } else {
    console.log('\n\nGA4_PROPERTY_ID가 설정되지 않아 GA4 비교를 건너뜁니다.');
  }

  console.log('\n=== 분석 완료 ===');
}

main().catch(console.error);
