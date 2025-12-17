/**
 * GA4 컨텐츠 그룹별 상위 페이지 이벤트 예측 테스트
 *
 * 각 컨텐츠 그룹의 대표 페이지를 방문하고 이벤트를 예측합니다.
 */

import { chromium, Browser, Page } from 'playwright';
import * as dotenv from 'dotenv';
import { createDefaultGTMConfigLoader } from './config/gtmConfigLoader';
import { IntegratedEventAnalyzer } from './analyzers/integratedEventAnalyzer';

dotenv.config();

// GA4 컨텐츠 그룹별 테스트 대상 페이지
const CONTENT_GROUP_PAGES = [
  {
    contentGroup: 'MAIN',
    pagePath: '/kr/ko/display/main',
    url: 'https://www.amoremall.com/kr/ko/display/main',
    ga4TopEvents: ['screen_view', 'ap_click', 'view_promotion', 'page_view', 'scroll', 'click_with_duration', 'select_promotion', 'qualified_visit', 'login']
  },
  {
    contentGroup: 'PRODUCT_DETAIL',
    pagePath: '/kr/ko/display/goodsDetail',
    url: 'https://www.amoremall.com/kr/ko/display/goodsDetail?goodsId=0010102730001',
    ga4TopEvents: ['scroll', 'ap_click', 'view_item', 'page_view', 'add_to_cart', 'click_with_duration', 'qualified_visit']
  },
  {
    contentGroup: 'EVENT_DETAIL',
    pagePath: '/kr/ko/display/event_detail',
    url: 'https://www.amoremall.com/kr/ko/display/event_detail?eventId=2412_apsesta',
    ga4TopEvents: ['scroll', 'view_promotion_detail', 'page_view', 'video_progress', 'screen_view', 'ap_click', 'click_with_duration', 'video_start', 'qualified_visit']
  },
  {
    contentGroup: 'SEARCH_RESULT',
    pagePath: '/kr/ko/display/search',
    url: 'https://www.amoremall.com/kr/ko/search?searchKeyword=%EC%84%A4%ED%99%94%EC%88%98',
    ga4TopEvents: ['page_view', 'ap_click', 'view_search_results', 'view_item_list', 'select_item', 'qualified_visit']
  },
  {
    contentGroup: 'BRAND_MAIN',
    pagePath: '/kr/ko/display/brand/detail',
    url: 'https://www.amoremall.com/kr/ko/display/brand/detail?brandNo=20001',
    ga4TopEvents: ['scroll', 'ap_click', 'screen_view', 'page_view', 'brand_product_click', 'click_with_duration', 'qualified_visit']
  },
  {
    contentGroup: 'PRODUCT_LIST',
    pagePath: '/kr/ko/display/category',
    url: 'https://www.amoremall.com/kr/ko/display/category?categoryId=10001',
    ga4TopEvents: ['ap_click', 'page_view', 'qualified_visit', 'screen_view']
  },
  {
    contentGroup: 'MY',
    pagePath: '/kr/ko/my/page/info/myPouch',
    url: 'https://www.amoremall.com/kr/ko/my/page/info/myPouch',
    ga4TopEvents: ['ap_click', 'screen_view', 'page_view', 'custom_event', 'view_promotion', 'qualified_visit']
  },
  {
    contentGroup: 'HISTORY',
    pagePath: '/kr/ko/display/history',
    url: 'https://www.amoremall.com/kr/ko/display/history',
    ga4TopEvents: ['screen_view', 'ap_click', 'page_view', 'custom_event', 'view_promotion', 'qualified_visit', 'login', 'click_with_duration']
  }
];

interface AnalysisResult {
  contentGroup: string;
  url: string;
  pageType: string;
  predicted: string[];
  ga4Actual: string[];
  correct: string[];
  missed: string[];
  wrong: string[];
  accuracy: number;
}

async function analyzeContentGroup(
  browser: Browser,
  analyzer: IntegratedEventAnalyzer,
  config: typeof CONTENT_GROUP_PAGES[0]
): Promise<AnalysisResult> {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 [${config.contentGroup}] ${config.pagePath}`);
  console.log(`   URL: ${config.url}`);

  try {
    await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // 팝업 닫기 시도
    try { await page.click('[class*="close"]', { timeout: 2000 }); } catch {}
    await page.waitForTimeout(1000);

    // 스크린샷 저장
    const screenshotPath = `./output/content_group_${config.contentGroup.toLowerCase()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });

    // 이벤트 분석
    const result = await analyzer.analyzeEventsForPage(config.url, screenshotPath, page);

    // 예측된 이벤트 (자동 수집 제외)
    const predicted = result.actuallyCanFire.map(e => e.eventName);

    // GA4 실제 이벤트에서 자동 수집 이벤트 제외
    const autoCollected = ['page_view', 'screen_view', 'session_start', 'first_visit', 'user_engagement'];
    const ga4Actual = config.ga4TopEvents.filter(e => !autoCollected.includes(e));
    const predictedFiltered = predicted.filter(e => !autoCollected.includes(e));

    // 정확도 계산
    const correct = predictedFiltered.filter(p => ga4Actual.includes(p));
    const missed = ga4Actual.filter(a => !predictedFiltered.includes(a));
    const wrong = predictedFiltered.filter(p => !ga4Actual.includes(p));

    const accuracy = correct.length / (correct.length + wrong.length) * 100 || 0;

    console.log(`   페이지 타입: ${result.pageType}`);
    console.log(`\n   ✅ 정확히 예측: ${correct.join(', ') || '없음'}`);
    console.log(`   ⚠️ 누락 (GA4에는 있음): ${missed.join(', ') || '없음'}`);
    console.log(`   ❌ 잘못 예측: ${wrong.join(', ') || '없음'}`);
    console.log(`   📈 정확도: ${accuracy.toFixed(1)}%`);

    await context.close();

    return {
      contentGroup: config.contentGroup,
      url: config.url,
      pageType: result.pageType,
      predicted: predictedFiltered,
      ga4Actual,
      correct,
      missed,
      wrong,
      accuracy
    };
  } catch (error: any) {
    console.error(`   ❌ 오류: ${error.message}`);
    await context.close();

    return {
      contentGroup: config.contentGroup,
      url: config.url,
      pageType: 'ERROR',
      predicted: [],
      ga4Actual: config.ga4TopEvents,
      correct: [],
      missed: config.ga4TopEvents,
      wrong: [],
      accuracy: 0
    };
  }
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not set');
    process.exit(1);
  }

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     GA4 컨텐츠 그룹별 이벤트 예측 분석                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // 설정 로드
  console.log('📦 GTM 설정 로드 중...');
  const configLoader = createDefaultGTMConfigLoader();
  await configLoader.preload();
  const analyzer = IntegratedEventAnalyzer.fromConfigLoader(apiKey, configLoader);

  // 브라우저 실행
  const browser = await chromium.launch({ headless: true });

  const results: AnalysisResult[] = [];

  for (const config of CONTENT_GROUP_PAGES) {
    const result = await analyzeContentGroup(browser, analyzer, config);
    results.push(result);
  }

  await browser.close();

  // 최종 요약
  console.log('\n\n' + '═'.repeat(70));
  console.log('📊 최종 분석 결과 요약');
  console.log('═'.repeat(70));

  console.log('\n컨텐츠 그룹별 정확도:\n');
  console.log('┌────────────────────┬────────────────┬────────────┬────────────┬──────────┐');
  console.log('│ 컨텐츠 그룹        │ 페이지 타입    │ 정확 예측  │ 누락       │ 정확도   │');
  console.log('├────────────────────┼────────────────┼────────────┼────────────┼──────────┤');

  for (const r of results) {
    const cg = r.contentGroup.padEnd(18);
    const pt = r.pageType.padEnd(14);
    const correct = r.correct.length.toString().padEnd(10);
    const missed = r.missed.length.toString().padEnd(10);
    const acc = `${r.accuracy.toFixed(1)}%`.padEnd(8);
    console.log(`│ ${cg} │ ${pt} │ ${correct} │ ${missed} │ ${acc} │`);
  }

  console.log('└────────────────────┴────────────────┴────────────┴────────────┴──────────┘');

  // 전체 정확도
  const totalCorrect = results.reduce((sum, r) => sum + r.correct.length, 0);
  const totalWrong = results.reduce((sum, r) => sum + r.wrong.length, 0);
  const overallAccuracy = totalCorrect / (totalCorrect + totalWrong) * 100 || 0;

  console.log(`\n📈 전체 정확도: ${overallAccuracy.toFixed(1)}% (${totalCorrect}개 정확 / ${totalCorrect + totalWrong}개 예측)`);

  // 누락된 이벤트 분석
  console.log('\n\n⚠️ 주요 누락 이벤트 분석:');
  const missedEventCounts: Record<string, number> = {};
  for (const r of results) {
    for (const e of r.missed) {
      missedEventCounts[e] = (missedEventCounts[e] || 0) + 1;
    }
  }

  const sortedMissed = Object.entries(missedEventCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  for (const [event, count] of sortedMissed) {
    console.log(`   - ${event}: ${count}개 컨텐츠 그룹에서 누락`);
  }

  // 결과 저장
  const outputPath = './output/content_group_prediction_results.json';
  const fs = await import('fs');
  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    results,
    summary: {
      totalContentGroups: results.length,
      overallAccuracy,
      totalCorrect,
      totalWrong,
      missedEventCounts
    }
  }, null, 2));

  console.log(`\n✅ 결과 저장됨: ${outputPath}`);
  console.log('\n=== 완료 ===');
}

main().catch(console.error);
