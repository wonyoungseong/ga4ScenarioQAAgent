/**
 * 파라미터 예측 vs 전역변수 비교 테스트
 *
 * GA4 수집 여부와 관계없이, 화면 분석 예측 값과 실제 전역변수 값을 비교합니다.
 * 이를 통해 예측 로직의 정확도를 검증합니다.
 */

import { chromium, Page, BrowserContext } from 'playwright';
import ParameterPredictor, {
  loadSiteConfig,
  extractGlobalVariables,
} from './predictors/parameterPredictor';

// 테스트할 페이지 목록
const TEST_PAGES = [
  {
    name: 'MAIN (메인)',
    url: 'https://www.amoremall.com/kr/ko/display/main',
    expectedPageType: 'MAIN',
  },
  {
    name: 'SEARCH (검색 결과)',
    url: 'https://www.amoremall.com/kr/ko/display/search?query=%ED%81%AC%EB%A6%BC',
    expectedPageType: 'SEARCH_RESULT',
  },
  {
    name: 'EVENT (이벤트)',
    url: 'https://www.amoremall.com/kr/ko/display/event/411?eventGnb=Y',
    expectedPageType: 'EVENT_DETAIL',
  },
  {
    name: 'CART (장바구니)',
    url: 'https://www.amoremall.com/kr/ko/cart',
    expectedPageType: 'CART',
  },
];

// page_view 파라미터와 전역변수 매핑
const PARAM_TO_GLOBALVAR: Record<string, string> = {
  'site_name': 'AP_DATA_SITENAME',
  'site_country': 'AP_DATA_COUNTRY',
  'site_language': 'AP_DATA_LANG',
  'site_env': 'AP_DATA_ENV',
  'content_group': 'AP_DATA_PAGETYPE',
  'breadcrumb': 'AP_DATA_BREAD',
  'login_is_login': 'AP_DATA_ISLOGIN',
  'channel': 'AP_DATA_CHANNEL',
};

interface TestResult {
  pageName: string;
  url: string;
  params: Array<{
    paramKey: string;
    globalVarName: string;
    globalVarValue: string | null;
    predictedValue: string | null;
    predictionSource: string;
    match: boolean;
  }>;
  accuracy: number;
}

async function testPage(
  context: BrowserContext,
  pageConfig: typeof TEST_PAGES[0]
): Promise<TestResult> {
  const page = await context.newPage();

  console.log(`\n📍 테스트: ${pageConfig.name}`);
  console.log(`   URL: ${pageConfig.url}`);

  await page.goto(pageConfig.url, {
    waitUntil: 'networkidle',
    timeout: 60000
  });

  // 전역변수가 설정될 때까지 대기 (SPA 환경 대응)
  await page.waitForFunction(
    () => typeof (window as any).AP_DATA_SITENAME !== 'undefined',
    { timeout: 10000 }
  ).catch(() => {
    console.log('   ⚠️ 전역변수 설정 대기 타임아웃');
  });

  await page.waitForTimeout(1000);

  // 전역변수 추출
  const globalVarNames = Object.values(PARAM_TO_GLOBALVAR);
  const globalVars = await extractGlobalVariables(page, globalVarNames);

  // 예측
  const siteConfig = loadSiteConfig(new URL(pageConfig.url).hostname);
  const predictor = new ParameterPredictor(pageConfig.url, siteConfig);
  const predictions = await predictor.predictPageViewParams(page);

  // 비교
  const params: TestResult['params'] = [];
  let matchCount = 0;

  for (const [paramKey, globalVarName] of Object.entries(PARAM_TO_GLOBALVAR)) {
    const globalVarValue = globalVars[globalVarName] || null;
    const prediction = predictions[paramKey];
    const predictedValue = prediction?.value || null;

    // 비교 (대소문자 무시, null 처리)
    let match = false;
    if (globalVarValue === null && predictedValue === null) {
      match = true;
    } else if (globalVarValue && predictedValue) {
      match = globalVarValue.toUpperCase() === predictedValue.toUpperCase();
    }

    if (match) matchCount++;

    params.push({
      paramKey,
      globalVarName,
      globalVarValue,
      predictedValue,
      predictionSource: prediction?.source || 'N/A',
      match,
    });
  }

  await page.close();

  const accuracy = (matchCount / params.length) * 100;

  return {
    pageName: pageConfig.name,
    url: pageConfig.url,
    params,
    accuracy,
  };
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║     파라미터 예측 vs 전역변수 비교 테스트                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'ko-KR',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const results: TestResult[] = [];

  for (const pageConfig of TEST_PAGES) {
    try {
      const result = await testPage(context, pageConfig);
      results.push(result);
    } catch (error) {
      console.error(`\n❌ 테스트 실패: ${pageConfig.name}`, error);
    }
  }

  await browser.close();

  // 결과 요약
  console.log('\n' + '═'.repeat(80));
  console.log('【 테스트 결과 요약 】');
  console.log('═'.repeat(80));

  console.log('\n┌──────────────────────────┬────────────┬────────────────────────────────────┐');
  console.log('│ 페이지                   │ 정확도     │ 상세                               │');
  console.log('├──────────────────────────┼────────────┼────────────────────────────────────┤');

  let totalMatch = 0;
  let totalParams = 0;

  for (const result of results) {
    const pageName = result.pageName.padEnd(24);
    const accuracy = `${result.accuracy.toFixed(1)}%`.padStart(10);
    const matchCount = result.params.filter(p => p.match).length;
    const detail = `${matchCount}/${result.params.length}개 일치`.padEnd(34);

    console.log(`│ ${pageName} │ ${accuracy} │ ${detail} │`);

    totalMatch += matchCount;
    totalParams += result.params.length;
  }

  console.log('└──────────────────────────┴────────────┴────────────────────────────────────┘');

  const overallAccuracy = (totalMatch / totalParams) * 100;
  console.log(`\n📊 전체 정확도: ${overallAccuracy.toFixed(1)}% (${totalMatch}/${totalParams})`);

  // 상세 결과
  console.log('\n' + '═'.repeat(80));
  console.log('【 페이지별 상세 결과 】');
  console.log('═'.repeat(80));

  for (const result of results) {
    console.log(`\n▸ ${result.pageName} (${result.accuracy.toFixed(1)}%)`);
    console.log(`  URL: ${result.url}`);

    console.log('\n  ┌─────────────────┬──────────────────┬──────────────────┬───────┐');
    console.log('  │ 파라미터        │ 전역변수 값      │ 예측 값          │ 일치  │');
    console.log('  ├─────────────────┼──────────────────┼──────────────────┼───────┤');

    for (const p of result.params) {
      const param = p.paramKey.padEnd(15);
      const globalVal = (p.globalVarValue || '-').substring(0, 16).padEnd(16);
      const predicted = (p.predictedValue || '-').substring(0, 16).padEnd(16);
      const matchIcon = p.match ? '✅' : '❌';

      console.log(`  │ ${param} │ ${globalVal} │ ${predicted} │ ${matchIcon}    │`);
    }

    console.log('  └─────────────────┴──────────────────┴──────────────────┴───────┘');

    // 불일치 항목 상세
    const mismatches = result.params.filter(p => !p.match);
    if (mismatches.length > 0) {
      console.log('\n  🔍 불일치 상세:');
      for (const m of mismatches) {
        console.log(`     ${m.paramKey}:`);
        console.log(`       전역변수(${m.globalVarName}): "${m.globalVarValue}"`);
        console.log(`       예측: "${m.predictedValue}" ← ${m.predictionSource}`);
      }
    }
  }

  // 예측 방법 요약
  console.log('\n' + '═'.repeat(80));
  console.log('【 예측 방법 요약 】');
  console.log('═'.repeat(80));

  const firstResult = results[0];
  if (firstResult) {
    for (const p of firstResult.params) {
      console.log(`\n  ${p.paramKey}:`);
      console.log(`    └─ ${p.predictionSource}`);
    }
  }

  console.log('\n✅ 테스트 완료\n');
}

main().catch(console.error);
