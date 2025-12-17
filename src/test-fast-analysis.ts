/**
 * 빠른 시나리오 생성 테스트
 *
 * 처음 한 번 설정을 로드하면 이후 분석이 매우 빨라집니다.
 */

import { chromium } from 'playwright';
import * as dotenv from 'dotenv';
import { createDefaultGTMConfigLoader, GTMConfigLoader } from './config/gtmConfigLoader';
import { IntegratedEventAnalyzer } from './analyzers/integratedEventAnalyzer';

dotenv.config();

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not set');
    process.exit(1);
  }

  console.log('=== 빠른 시나리오 생성 테스트 ===\n');

  // 1. 처음 한 번: 모든 설정 미리 로드 (약 4초)
  console.log('【1. 설정 미리 로드 (처음 한 번만 실행)】');
  console.log('-'.repeat(60));

  const configLoader = createDefaultGTMConfigLoader();
  const preloadStart = Date.now();
  await configLoader.preload();
  const preloadTime = Date.now() - preloadStart;

  console.log(`\n⏱️  설정 로드 시간: ${preloadTime}ms`);
  configLoader.printSummary();

  // 2. 분석기 생성 (미리 로드된 설정 사용 - 즉시)
  console.log('\n\n【2. 분석기 생성 (미리 로드된 설정 사용)】');
  console.log('-'.repeat(60));

  const analyzerStart = Date.now();
  const analyzer = IntegratedEventAnalyzer.fromConfigLoader(apiKey, configLoader);
  const analyzerTime = Date.now() - analyzerStart;

  console.log(`⏱️  분석기 생성 시간: ${analyzerTime}ms (기존: ~4초)`);

  // 3. 이벤트-페이지 허용 조회 테스트 (빠름)
  console.log('\n\n【3. 이벤트-페이지 조회 테스트 (빠른 조회)】');
  console.log('-'.repeat(60));

  const testCases = [
    { event: 'select_item', page: 'PRODUCT_LIST' },
    { event: 'select_item', page: 'BRAND_MAIN' },
    { event: 'view_item', page: 'PRODUCT_DETAIL' },
    { event: 'scroll', page: 'MAIN' },
    { event: 'brand_product_click', page: 'OTHERS' },
  ] as const;

  const queryStart = Date.now();
  for (const tc of testCases) {
    const result = analyzer.isEventAllowedOnPage(tc.event, tc.page as any);
    const icon = result.allowed ? '✅' : '❌';
    console.log(`${icon} ${tc.event} @ ${tc.page}: ${result.reason?.substring(0, 50)}...`);
  }
  const queryTime = Date.now() - queryStart;

  console.log(`\n⏱️  ${testCases.length}건 조회 시간: ${queryTime}ms`);

  // 4. 실제 페이지 분석 테스트
  console.log('\n\n【4. 실제 페이지 분석 테스트】');
  console.log('-'.repeat(60));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const testUrl = 'https://www.amoremall.com/kr/ko/display/main';

  console.log(`URL: ${testUrl}`);
  console.log('페이지 로드 중...');

  const pageLoadStart = Date.now();
  await page.goto(testUrl, { waitUntil: 'networkidle', timeout: 60000 });

  // 팝업 닫기
  try { await page.click('[class*="close"]', { timeout: 2000 }); } catch {}
  await page.waitForTimeout(2000);

  const screenshotPath = './output/fast_test.png';
  await page.screenshot({ path: screenshotPath, fullPage: false });
  const pageLoadTime = Date.now() - pageLoadStart;

  console.log(`⏱️  페이지 로드 시간: ${pageLoadTime}ms`);

  // 분석 실행
  console.log('\n분석 실행 중...');
  const analysisStart = Date.now();
  const result = await analyzer.analyzeEventsForPage(testUrl, screenshotPath, page);
  const analysisTime = Date.now() - analysisStart;

  console.log(`⏱️  분석 시간: ${analysisTime}ms`);

  // 결과 요약
  console.log('\n【분석 결과 요약】');
  console.log(`페이지 타입: ${result.pageType}`);
  console.log(`발생 가능 이벤트: ${result.actuallyCanFire.length}개`);
  console.log(`UI 없음: ${result.noUIEvents.length}개`);
  console.log(`GTM 차단: ${result.gtmBlockedEvents.length}개`);

  // 주요 이벤트만 출력
  console.log('\n【발생 가능 주요 이벤트 (상위 5개)】');
  for (const e of result.actuallyCanFire.slice(0, 5)) {
    console.log(`  ✅ ${e.eventName}: ${e.description.substring(0, 40)}...`);
  }

  await browser.close();

  // 전체 시간 요약
  console.log('\n\n=== 시간 요약 ===');
  console.log('='.repeat(60));
  console.log(`설정 로드 (처음 1회): ${preloadTime}ms`);
  console.log(`분석기 생성: ${analyzerTime}ms`);
  console.log(`이벤트 조회 (${testCases.length}건): ${queryTime}ms`);
  console.log(`페이지 로드: ${pageLoadTime}ms`);
  console.log(`이벤트 분석: ${analysisTime}ms`);
  console.log('');
  console.log(`총 시간 (설정 로드 제외): ${analyzerTime + queryTime + pageLoadTime + analysisTime}ms`);
  console.log(`\n💡 설정을 한 번 로드하면 이후 분석은 빠르게 진행됩니다.`);

  console.log('\n=== 테스트 완료 ===');
}

main().catch(console.error);
