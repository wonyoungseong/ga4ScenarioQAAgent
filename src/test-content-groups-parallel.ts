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

// GA4 Property ID (Edge Case 적용용)
const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID || '416629733';

// GA4 컨텐츠 그룹별 테스트 대상 페이지 (SKINNOTE_*, OTHERS 제외)
const CONTENT_GROUP_PAGES: ContentGroupConfig[] = [
  // === 기존 테스트 ===
  {
    contentGroup: 'MAIN',
    pagePath: '/kr/ko/display/main',
    url: 'https://www.amoremall.com/kr/ko/display/main',
    ga4TopEvents: ['ap_click', 'screen_view', 'view_promotion', 'page_view', 'scroll', 'select_promotion', 'click_with_duration', 'qualified_visit', 'login']
  },
  {
    contentGroup: 'PRODUCT_DETAIL',
    pagePath: '/kr/ko/product/detail',
    url: 'https://www.amoremall.com/kr/ko/product/detail?onlineProdSn=67657&onlineProdCode=111070002290',
    ga4TopEvents: ['scroll', 'ap_click', 'view_item', 'screen_view', 'page_view', 'add_to_cart', 'click_with_duration', 'begin_checkout', 'qualified_visit']
  },
  {
    contentGroup: 'EVENT_DETAIL',
    pagePath: '/kr/ko/display/event_detail',
    url: 'https://www.amoremall.com/kr/ko/display/event_detail?planDisplaySn=13681',
    ga4TopEvents: ['scroll', 'view_promotion_detail', 'video_progress', 'page_view', 'ap_click', 'screen_view', 'video_start', 'qualified_visit', 'click_with_duration']
  },
  {
    contentGroup: 'SEARCH_RESULT',
    pagePath: '/kr/ko/search',
    url: 'https://www.amoremall.com/kr/ko/search?searchKeyword=%EC%84%A4%ED%99%94%EC%88%98',
    ga4TopEvents: ['ap_click', 'view_search_results', 'view_item_list', 'screen_view', 'select_item', 'page_view', 'qualified_visit']
  },
  {
    contentGroup: 'BRAND_MAIN',
    pagePath: '/kr/ko/display/brand/detail',
    url: 'https://www.amoremall.com/kr/ko/display/brand/detail?brandSn=15',
    ga4TopEvents: ['scroll', 'ap_click', 'screen_view', 'page_view', 'brand_product_click', 'qualified_visit', 'click_with_duration']
  },
  {
    contentGroup: 'PRODUCT_LIST',
    pagePath: '/kr/ko/display/category',
    url: 'https://www.amoremall.com/kr/ko/display/category?categoryId=10001',
    ga4TopEvents: ['ap_click', 'screen_view', 'page_view', 'qualified_visit']
  },
  {
    contentGroup: 'MY',
    pagePath: '/kr/ko/my/page/info/myPouch',
    url: 'https://www.amoremall.com/kr/ko/my/page/info/myPouch',
    ga4TopEvents: ['ap_click', 'screen_view', 'page_view', 'qualified_visit', 'view_promotion', 'add_to_cart']
  },
  {
    contentGroup: 'HISTORY',
    pagePath: '/kr/ko/display/history',
    url: 'https://www.amoremall.com/kr/ko/display/history',
    ga4TopEvents: ['ap_click', 'screen_view', 'custom_event', 'page_view', 'view_promotion', 'qualified_visit', 'login', 'click_with_duration']
  },
  {
    contentGroup: 'BRAND_PRODUCT_LIST',
    pagePath: '/kr/ko/display/brand/detail/all',
    url: 'https://www.amoremall.com/kr/ko/display/brand/detail/all?brandSn=18',
    ga4TopEvents: ['ap_click', 'brand_product_click', 'page_view', 'screen_view', 'click_with_duration', 'qualified_visit']
  },

  // === 새로 추가된 테스트 ===
  {
    contentGroup: 'CART',
    pagePath: '/kr/ko/cart/cartList',
    url: 'https://www.amoremall.com/kr/ko/cart/cartList',
    ga4TopEvents: ['ap_click', 'begin_checkout', 'screen_view', 'page_view', 'qualified_visit']
  },
  {
    contentGroup: 'LIVE_DETAIL',
    pagePath: '/kr/ko/display/live/player',
    url: 'https://www.amoremall.com/kr/ko/display/live/player?sy_id=691d716b1ccf98049b711174',
    ga4TopEvents: ['ap_click', 'live', 'page_view', 'screen_view', 'qualified_visit']
  },
  {
    contentGroup: 'LIVE_LIST',
    pagePath: '/kr/ko/display/live',
    url: 'https://www.amoremall.com/kr/ko/display/live',
    ga4TopEvents: ['ap_click', 'screen_view', 'page_view', 'qualified_visit', 'view_promotion']
  },
  {
    contentGroup: 'CATEGORY_LIST',
    pagePath: '/kr/ko/display/category/main',
    url: 'https://www.amoremall.com/kr/ko/display/category/main',
    ga4TopEvents: ['ap_click', 'screen_view', 'view_promotion', 'select_promotion']
  },
  {
    contentGroup: 'MEMBERSHIP',
    pagePath: '/kr/ko/membershipPlus/join',
    url: 'https://www.amoremall.com/kr/ko/membershipPlus/join',
    ga4TopEvents: ['ap_click', 'page_view', 'screen_view', 'qualified_visit']
  },
  {
    contentGroup: 'EVENT_LIST',
    pagePath: '/kr/ko/display/event',
    url: 'https://www.amoremall.com/kr/ko/display/event',
    ga4TopEvents: ['ap_click', 'screen_view', 'page_view', 'qualified_visit', 'view_promotion']
  },
  {
    contentGroup: 'BRAND_LIST',
    pagePath: '/kr/ko/display/brand',
    url: 'https://www.amoremall.com/kr/ko/display/brand',
    ga4TopEvents: ['ap_click', 'screen_view', 'view_promotion']
  },
  {
    contentGroup: 'AMORESTORE',
    pagePath: '/kr/ko/store/foreigner',
    url: 'https://www.amoremall.com/kr/ko/store/foreigner',
    ga4TopEvents: ['page_view', 'ap_click', 'screen_view', 'qualified_visit', 'view_promotion']
  },
  {
    contentGroup: 'BEAUTYFEED',
    pagePath: '/kr/ko/community/display/main',
    url: 'https://www.amoremall.com/kr/ko/community/display/main',
    ga4TopEvents: ['ap_click', 'screen_view', 'page_view', 'qualified_visit', 'view_search_results']
  },
  {
    contentGroup: 'CUSTOMER',
    pagePath: '/kr/ko/cs/faq',
    url: 'https://www.amoremall.com/kr/ko/cs/faq',
    ga4TopEvents: ['ap_click', 'page_view', 'screen_view', 'qualified_visit']
  },
  {
    contentGroup: 'BRAND_EVENT_LIST',
    pagePath: '/kr/ko/display/brand/detail/event',
    url: 'https://www.amoremall.com/kr/ko/display/brand/detail/event?brandSn=11',
    ga4TopEvents: ['ap_click', 'page_view', 'screen_view', 'qualified_visit']
  },
  {
    contentGroup: 'BRAND_CUSTOM_ETC',
    pagePath: '/kr/ko/display/brand/detail',
    url: 'https://www.amoremall.com/kr/ko/display/brand/detail?brandSn=15&menuNo=630',
    ga4TopEvents: ['ap_click', 'page_view', 'screen_view', 'click_with_duration', 'qualified_visit']
  },
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
    if (r.sessionOnceSkipped.length > 0) {
      console.log(`   🔄 SESSION_ONCE (정확도 제외): ${r.sessionOnceSkipped.join(', ')}`);
    }
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
      sessionOnceSkipped: r.sessionOnceSkipped,
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
    ga4PropertyId: GA4_PROPERTY_ID,  // Edge Case 적용
  });

  console.log(`🔧 GA4 Property ID: ${GA4_PROPERTY_ID}`);

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
