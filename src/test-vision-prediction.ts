/**
 * Vision AI 변수 예측 테스트
 *
 * 스크린샷을 캡처하고 Vision AI로 페이지 타입/변수를 예측합니다.
 */

import { chromium } from 'playwright';
import { GeminiVisionAnalyzer, PageVariablePrediction } from './analyzers/visionAnalyzer';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

// 테스트할 페이지 목록
const TEST_PAGES = [
  { name: 'AMOREMALL 메인', url: 'https://www.amoremall.com/kr/ko/display/main', expectedType: 'MAIN' },
  { name: 'INNISFREE 메인', url: 'https://www.innisfree.com/kr/ko/', expectedType: 'MAIN' },
  { name: 'OSULLOC 상품목록', url: 'https://www.osulloc.com/kr/ko/shop/category/ALL', expectedType: 'PRODUCT_LIST' },
];

async function captureAndPredict(
  analyzer: GeminiVisionAnalyzer,
  url: string,
  name: string
): Promise<{ prediction: PageVariablePrediction | null; screenshotPath: string; error?: string }> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  });
  const page = await context.newPage();

  // 스크린샷 경로
  const outputDir = path.join(process.cwd(), 'output', 'vision-test');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const screenshotPath = path.join(outputDir, `${name.replace(/\s+/g, '_')}.png`);

  try {
    console.log(`\n📷 ${name} 캡처 중...`);
    await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`   스크린샷 저장: ${screenshotPath}`);

    console.log(`🔍 Vision AI 분석 중...`);
    const prediction = await analyzer.predictPageVariables(screenshotPath, url);

    return { prediction, screenshotPath };
  } catch (error: any) {
    console.error(`   ❌ 오류: ${error.message}`);
    return { prediction: null, screenshotPath, error: error.message };
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('═'.repeat(70));
  console.log(' Vision AI 변수 예측 테스트');
  console.log('═'.repeat(70));

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY가 설정되지 않았습니다.');
    process.exit(1);
  }

  const analyzer = new GeminiVisionAnalyzer(apiKey);

  const results: Array<{
    name: string;
    url: string;
    expectedType: string;
    actualType: string | null;
    match: boolean;
    prediction: PageVariablePrediction | null;
  }> = [];

  for (const testPage of TEST_PAGES) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`📄 ${testPage.name}`);
    console.log(`   URL: ${testPage.url}`);
    console.log(`   기대 타입: ${testPage.expectedType}`);

    const { prediction, error } = await captureAndPredict(analyzer, testPage.url, testPage.name);

    if (prediction) {
      const match = prediction.pageType === testPage.expectedType;
      const icon = match ? '✅' : '❌';

      console.log(`\n   ${icon} 예측 타입: ${prediction.pageType} (확신도: ${prediction.confidence})`);
      console.log(`   📊 변수 예측:`);
      console.log(`      - site_name: ${prediction.variables.site_name}`);
      console.log(`      - site_country: ${prediction.variables.site_country}`);
      console.log(`      - channel: ${prediction.variables.channel}`);
      console.log(`      - login_is_login: ${prediction.variables.login_is_login}`);

      if (prediction.conditionalVariables && Object.keys(prediction.conditionalVariables).length > 0) {
        console.log(`   📋 조건부 변수:`);
        for (const [key, value] of Object.entries(prediction.conditionalVariables)) {
          console.log(`      - ${key}: ${value}`);
        }
      }

      console.log(`   🎯 이벤트:`);
      console.log(`      - 자동 발생: ${prediction.events.autoFire.join(', ')}`);
      if (prediction.events.conditional.length > 0) {
        console.log(`      - 조건부: ${prediction.events.conditional.join(', ')}`);
      }

      console.log(`   💭 판단 근거: ${prediction.reasoning.substring(0, 100)}...`);

      results.push({
        name: testPage.name,
        url: testPage.url,
        expectedType: testPage.expectedType,
        actualType: prediction.pageType,
        match,
        prediction,
      });
    } else {
      results.push({
        name: testPage.name,
        url: testPage.url,
        expectedType: testPage.expectedType,
        actualType: null,
        match: false,
        prediction: null,
      });
    }
  }

  // 결과 요약
  console.log('\n' + '═'.repeat(70));
  console.log(' 테스트 결과 요약');
  console.log('═'.repeat(70));

  const successCount = results.filter(r => r.match).length;
  const totalCount = results.length;

  console.log(`\n📊 정확도: ${successCount}/${totalCount} (${((successCount / totalCount) * 100).toFixed(0)}%)`);

  for (const r of results) {
    const icon = r.match ? '✅' : '❌';
    console.log(`${icon} ${r.name}: 기대=${r.expectedType}, 예측=${r.actualType || 'ERROR'}`);
  }

  // 결과 저장
  const outputPath = path.join(process.cwd(), 'output', 'vision-test', 'results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 결과 저장: ${outputPath}`);
}

main().catch(console.error);
