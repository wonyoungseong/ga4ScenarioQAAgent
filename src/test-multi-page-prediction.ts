/**
 * 다양한 페이지 타입에서 파라미터 예측 테스트
 *
 * 아모레몰의 여러 페이지에서 page_view 파라미터 예측 정확도를 검증합니다.
 */

import { chromium, Page, BrowserContext } from 'playwright';
import ParameterPredictor, {
  loadSiteConfig,
  extractGlobalVariables,
  extractGA4EventParams,
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
    url: 'https://www.amoremall.com/kr/ko/search?searchWord=%EC%84%A4%ED%99%94%EC%88%98',
    expectedPageType: 'SEARCH_RESULT',
  },
  {
    name: 'CATEGORY (카테고리)',
    url: 'https://www.amoremall.com/kr/ko/display/ctg?ctgNo=100000000000026',
    expectedPageType: 'PRODUCT_LIST',
  },
];

// page_view 파라미터 정의
const PAGE_VIEW_PARAMS = {
  site_name: { devGuideVar: 'AP_DATA_SITENAME', description: '사이트 이름' },
  site_country: { devGuideVar: 'AP_DATA_COUNTRY', description: '국가코드' },
  site_language: { devGuideVar: 'AP_DATA_LANG', description: '페이지 언어' },
  site_env: { devGuideVar: 'AP_DATA_ENV', description: '개발환경' },
  content_group: { devGuideVar: 'AP_DATA_PAGETYPE', description: '페이지 타입' },
  breadcrumb: { devGuideVar: 'AP_DATA_BREAD', description: 'Breadcrumb' },
  login_is_login: { devGuideVar: 'AP_DATA_ISLOGIN', description: '로그인 여부' },
  channel: { devGuideVar: 'AP_DATA_CHANNEL', description: '접속 채널' },
};

interface PageTestResult {
  pageName: string;
  url: string;
  expectedPageType: string;
  actualPageType: string | null;
  totalParams: number;
  exactMatches: number;
  partialMatches: number;
  mismatches: number;
  notCollected: number;
  accuracy: number;
  details: Array<{
    param: string;
    predicted: string | null;
    actual: string | null;
    globalVar: string | null;
    match: string;
    source: string;
  }>;
}

async function testPage(
  context: BrowserContext,
  pageConfig: typeof TEST_PAGES[0]
): Promise<PageTestResult> {
  const page = await context.newPage();

  // GA4 요청 캡처
  const ga4Requests: { url: string; postData?: string }[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('google-analytics.com/g/collect') ||
        url.includes('analytics.google.com/g/collect')) {
      ga4Requests.push({ url, postData: request.postData() || undefined });
    }
  });

  console.log(`\n📍 테스트: ${pageConfig.name}`);
  console.log(`   URL: ${pageConfig.url}`);

  await page.goto(pageConfig.url, {
    waitUntil: 'networkidle',
    timeout: 60000
  });

  await page.waitForTimeout(3000);

  // 전역변수 추출
  const globalVars = await extractGlobalVariables(page, [
    'AP_DATA_SITENAME', 'AP_DATA_COUNTRY', 'AP_DATA_LANG', 'AP_DATA_ENV',
    'AP_DATA_PAGETYPE', 'AP_DATA_BREAD', 'AP_DATA_ISLOGIN', 'AP_DATA_CHANNEL'
  ]);

  // 예측
  const siteConfig = loadSiteConfig(new URL(pageConfig.url).hostname);
  const predictor = new ParameterPredictor(pageConfig.url, siteConfig);
  const predictions = await predictor.predictPageViewParams(page);

  // GA4 수집 값
  const ga4Params = extractGA4EventParams(ga4Requests, 'page_view');

  // 결과 분석
  const details: PageTestResult['details'] = [];
  let exactMatches = 0;
  let partialMatches = 0;
  let mismatches = 0;
  let notCollected = 0;

  for (const [paramKey, paramInfo] of Object.entries(PAGE_VIEW_PARAMS)) {
    const predicted = predictions[paramKey]?.value || null;
    const actual = ga4Params[paramKey] || null;
    const globalVar = globalVars[paramInfo.devGuideVar] || null;
    const source = predictions[paramKey]?.source || 'N/A';

    const match = predictor.comparePrediction(predicted, actual);

    if (match === 'EXACT') exactMatches++;
    else if (match === 'PARTIAL') partialMatches++;
    else if (match === 'MISMATCH') mismatches++;
    else if (match === 'NOT_COLLECTED') notCollected++;

    details.push({
      param: paramKey,
      predicted,
      actual,
      globalVar,
      match,
      source,
    });
  }

  await page.close();

  const collectedCount = Object.keys(PAGE_VIEW_PARAMS).length - notCollected;
  const accuracy = collectedCount > 0 ? (exactMatches / collectedCount) * 100 : 0;

  return {
    pageName: pageConfig.name,
    url: pageConfig.url,
    expectedPageType: pageConfig.expectedPageType,
    actualPageType: ga4Params['content_group'] || globalVars['AP_DATA_PAGETYPE'] || null,
    totalParams: Object.keys(PAGE_VIEW_PARAMS).length,
    exactMatches,
    partialMatches,
    mismatches,
    notCollected,
    accuracy,
    details,
  };
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║     다양한 페이지 타입 파라미터 예측 테스트                                ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'ko-KR',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const results: PageTestResult[] = [];

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

  console.log('\n┌──────────────────────┬────────────┬────────────┬────────────┬────────────┐');
  console.log('│ 페이지               │ 정확도     │ 정확       │ 불일치     │ 미수집     │');
  console.log('├──────────────────────┼────────────┼────────────┼────────────┼────────────┤');

  let totalExact = 0;
  let totalMismatch = 0;
  let totalNotCollected = 0;
  let totalCollected = 0;

  for (const result of results) {
    const pageName = result.pageName.padEnd(20);
    const accuracy = `${result.accuracy.toFixed(1)}%`.padStart(10);
    const exact = `${result.exactMatches}개`.padStart(10);
    const mismatch = `${result.mismatches}개`.padStart(10);
    const notColl = `${result.notCollected}개`.padStart(10);

    console.log(`│ ${pageName} │ ${accuracy} │ ${exact} │ ${mismatch} │ ${notColl} │`);

    totalExact += result.exactMatches;
    totalMismatch += result.mismatches;
    totalNotCollected += result.notCollected;
    totalCollected += (result.totalParams - result.notCollected);
  }

  console.log('└──────────────────────┴────────────┴────────────┴────────────┴────────────┘');

  const overallAccuracy = totalCollected > 0 ? (totalExact / totalCollected) * 100 : 0;
  console.log(`\n📊 전체 정확도: ${overallAccuracy.toFixed(1)}% (${totalExact}/${totalCollected})`);

  // 상세 결과 (불일치 항목만)
  const allMismatches = results.flatMap(r =>
    r.details
      .filter(d => d.match === 'MISMATCH' || d.match === 'PARTIAL')
      .map(d => ({ ...d, pageName: r.pageName }))
  );

  if (allMismatches.length > 0) {
    console.log('\n' + '═'.repeat(80));
    console.log('【 불일치/부분일치 상세 】');
    console.log('═'.repeat(80));

    for (const m of allMismatches) {
      console.log(`\n  [${m.pageName}] ${m.param}`);
      console.log(`    예측: "${m.predicted}" ← ${m.source}`);
      console.log(`    실제: "${m.actual}"`);
      console.log(`    전역변수: "${m.globalVar}"`);
    }
  } else {
    console.log('\n🎉 모든 페이지에서 예측이 정확합니다!');
  }

  // 페이지 타입별 상세
  console.log('\n' + '═'.repeat(80));
  console.log('【 페이지별 상세 결과 】');
  console.log('═'.repeat(80));

  for (const result of results) {
    console.log(`\n▸ ${result.pageName}`);
    console.log(`  URL: ${result.url}`);
    console.log(`  예상 페이지 타입: ${result.expectedPageType}`);
    console.log(`  실제 페이지 타입: ${result.actualPageType}`);
    console.log(`  정확도: ${result.accuracy.toFixed(1)}%`);

    console.log('\n  파라미터 상세:');
    for (const d of result.details) {
      const icon = d.match === 'EXACT' ? '✅' :
                   d.match === 'PARTIAL' ? '🟡' :
                   d.match === 'MISMATCH' ? '❌' :
                   d.match === 'NOT_COLLECTED' ? '⚪' : '❓';
      console.log(`    ${icon} ${d.param}: "${d.predicted}" → "${d.actual || '(미수집)'}"`);
    }
  }

  console.log('\n✅ 테스트 완료\n');
}

main().catch(console.error);
