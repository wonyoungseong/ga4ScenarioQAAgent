/**
 * GA4 컨텐츠 그룹별 이벤트 예측 테스트 (병렬 처리 버전)
 *
 * 기존 test-content-groups.ts의 병렬 처리 버전
 * - 브라우저 풀링으로 페이지 캡처 병렬화
 * - Vision AI 배치 처리
 * - 약 70% 시간 단축 목표
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import {
  ParallelContentGroupAnalyzer,
  ContentGroupConfig,
  ParallelAnalysisResult,
} from './parallel';

dotenv.config();

// GA4 컨텐츠 그룹별 테스트 대상 페이지
const CONTENT_GROUP_PAGES: ContentGroupConfig[] = [
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

/**
 * 결과 출력
 */
function printResults(results: ParallelAnalysisResult[]): void {
  console.log('\n' + '═'.repeat(70));
  console.log('📊 최종 분석 결과 요약');
  console.log('═'.repeat(70));

  console.log('\n컨텐츠 그룹별 정확도:\n');
  console.log('┌────────────────────┬────────────────┬────────────┬────────────┬──────────┐');
  console.log('│ 컨텐츠 그룹        │ 페이지 타입    │ 정확 예측  │ 누락       │ 정확도   │');
  console.log('├────────────────────┼────────────────┼────────────┼────────────┼──────────┤');

  for (const r of results) {
    const cg = r.contentGroup.padEnd(18);
    const pt = r.pageType.padEnd(14);
    const correct = String(r.correct.length).padEnd(10);
    const missed = String(r.missed.length).padEnd(10);
    const acc = `${r.accuracy.toFixed(1)}%`.padEnd(8);
    console.log(`│ ${cg} │ ${pt} │ ${correct} │ ${missed} │ ${acc} │`);
  }

  console.log('└────────────────────┴────────────────┴────────────┴────────────┴──────────┘');

  // 전체 정확도 계산
  const totalCorrect = results.reduce((sum, r) => sum + r.correct.length, 0);
  const totalPredicted = results.reduce((sum, r) => sum + r.predicted.length, 0);
  const totalWrong = results.reduce((sum, r) => sum + r.wrong.length, 0);
  const overallAccuracy = totalCorrect / (totalCorrect + totalWrong) * 100 || 0;

  console.log(`\n📈 전체 정확도: ${overallAccuracy.toFixed(1)}% (${totalCorrect}개 정확 / ${totalPredicted}개 예측)\n`);

  // 누락 이벤트 분석
  const missedCounts = new Map<string, number>();
  for (const r of results) {
    for (const event of r.missed) {
      missedCounts.set(event, (missedCounts.get(event) || 0) + 1);
    }
  }

  if (missedCounts.size > 0) {
    console.log('⚠️ 주요 누락 이벤트 분석:');
    for (const [event, count] of missedCounts) {
      console.log(`   - ${event}: ${count}개 컨텐츠 그룹에서 누락`);
    }
  }

  // 처리 시간 분석
  const totalTime = results.reduce((sum, r) => sum + r.processingTimeMs, 0);
  const avgTime = totalTime / results.length;
  console.log(`\n⏱️ 처리 시간 분석:`);
  console.log(`   - 평균: ${(avgTime / 1000).toFixed(1)}s/페이지`);
  console.log(`   - 총합: ${(totalTime / 1000).toFixed(1)}s (병렬 처리)`);
}

/**
 * 개별 결과 출력
 */
function printIndividualResults(results: ParallelAnalysisResult[]): void {
  for (const r of results) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 [${r.contentGroup}] ${r.url}`);
    console.log(`   📍 페이지 타입: ${r.pageType} (신뢰도: ${r.pageTypeConfidence}%)`);

    console.log(`\n   ✅ 정확히 예측: ${r.correct.join(', ') || '없음'}`);
    console.log(`   ⚠️ 누락 (GA4에는 있음): ${r.missed.join(', ') || '없음'}`);
    console.log(`   ❌ 잘못 예측: ${r.wrong.join(', ') || '없음'}`);
    console.log(`   📈 정확도: ${r.accuracy.toFixed(1)}%`);
  }
}

/**
 * 결과 JSON 저장
 */
function saveResults(results: ParallelAnalysisResult[]): void {
  const totalCorrect = results.reduce((sum, r) => sum + r.correct.length, 0);
  const totalWrong = results.reduce((sum, r) => sum + r.wrong.length, 0);
  const overallAccuracy = totalCorrect / (totalCorrect + totalWrong) * 100 || 0;

  const missedCounts: Record<string, number> = {};
  for (const r of results) {
    for (const event of r.missed) {
      missedCounts[event] = (missedCounts[event] || 0) + 1;
    }
  }

  const output = {
    timestamp: new Date().toISOString(),
    mode: 'parallel',
    results: results.map(r => ({
      contentGroup: r.contentGroup,
      url: r.url,
      pageType: r.pageType,
      predicted: r.predicted,
      ga4Actual: r.ga4Actual,
      correct: r.correct,
      missed: r.missed,
      wrong: r.wrong,
      accuracy: r.accuracy,
      processingTimeMs: r.processingTimeMs,
    })),
    summary: {
      totalContentGroups: results.length,
      overallAccuracy,
      totalCorrect,
      totalWrong,
      missedEventCounts: missedCounts,
    },
  };

  fs.writeFileSync(
    './output/content_group_prediction_results_parallel.json',
    JSON.stringify(output, null, 2)
  );
  console.log('\n✅ 결과 저장됨: ./output/content_group_prediction_results_parallel.json');
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY not set');
    process.exit(1);
  }

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     GA4 컨텐츠 그룹별 이벤트 예측 분석 (병렬 버전)         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const startTime = Date.now();

  // 병렬 분석기 생성 및 초기화
  const analyzer = new ParallelContentGroupAnalyzer(apiKey, {
    maxBrowserConcurrency: 4,
    maxVisionConcurrency: 4,
    skipVision: false,  // true로 변경하면 Vision AI 스킵 (빠른 테스트)
    pageWaitTime: 3000,
  });

  try {
    await analyzer.initialize();

    // 병렬 분석 실행
    const results = await analyzer.analyzeAll(CONTENT_GROUP_PAGES);

    // 개별 결과 출력
    printIndividualResults(results);

    // 최종 요약 출력
    printResults(results);

    // 결과 저장
    saveResults(results);

    const totalTime = Date.now() - startTime;
    console.log(`\n🏁 전체 실행 시간: ${(totalTime / 1000).toFixed(1)}초`);

  } catch (error: any) {
    console.error('❌ 오류 발생:', error.message);
    throw error;
  } finally {
    await analyzer.cleanup();
    console.log('\n=== 완료 ===');
  }
}

main().catch(console.error);
