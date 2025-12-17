/**
 * 상품 상세 페이지 분석 테스트
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

  console.log('=== 상품 상세 페이지 분석 테스트 ===\n');

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

  // 실제 상품 상세 페이지 URL
  const testUrl = 'https://www.amoremall.com/kr/ko/product/detail?onlineProdSn=52683';

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
  const screenshotPath = './output/product_detail_test.png';
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
    const desc = e.description.length > 50 ? e.description.substring(0, 50) + '...' : e.description;
    console.log(`  - ${e.eventName}: ${desc}`);
  }

  // add_to_cart와 begin_checkout 확인
  const hasAddToCart = result.actuallyCanFire.some(e => e.eventName === 'add_to_cart');
  const hasBeginCheckout = result.actuallyCanFire.some(e => e.eventName === 'begin_checkout');

  console.log('\n📊 핵심 이벤트 확인:');
  console.log(`  - add_to_cart: ${hasAddToCart ? '✅ 예측됨' : '❌ 누락'}`);
  console.log(`  - begin_checkout: ${hasBeginCheckout ? '✅ 예측됨' : '❌ 누락'}`);

  await browser.close();
  console.log('\n=== 분석 완료 ===');
}

main().catch(console.error);
