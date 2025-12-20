/**
 * GA4 API로 모든 content_group 분석 및 대표 페이지 조회
 *
 * 실제 GA4에서 수집된 데이터를 기반으로 분석합니다.
 */

import { GA4Client } from './ga4/ga4Client';
import { GA4AdminClient } from './ga4/ga4AdminClient';
import { ValuePredictor, PredictionContext } from './predictors/valuePredictor';
import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// Account ID
const ACCOUNT_ID = '293457213';

// Property ID → 도메인 매핑
const PROPERTY_DOMAIN_MAP: Record<string, string> = {
  '416629733': 'www.amoremall.com',      // AMOREMALL
  '416571110': 'www.laboh.co.kr',         // LABOH
  '416602402': 'www.osulloc.com',         // OSULLOC
  '416705262': 'www.ayunchepro.com',      // AYUNCHEPRO
  '416696665': 'www.espoir.com',          // ESPOIR
  '416714189': 'www.illiyoon.com',        // ILLIYOON
  '416612114': 'www.aritaum.com',         // ARITAUM
  '416706974': 'www.brdy.co.kr',          // BRDY
  '416680783': 'www.aestura.com',         // AESTURA
  '416711867': 'www.innisfree.com',       // INNISFREE
  '416624566': 'www.aditshop.com',        // ADITSHOP
  '416672048': 'www.ayunche.com',         // AYUNCHE
  '462679065': 'www.amospro.com',         // AMOSPRO
  '479578062': 'www.makeonshop.co.kr',    // MAKEON
};

/**
 * 토큰 로드
 */
function loadAccessToken(): string | null {
  const tokenPath = './credentials/ga4_tokens.json';
  try {
    if (fs.existsSync(tokenPath)) {
      const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
      return tokens.access_token;
    }
  } catch (error) {
    console.error('토큰 로드 실패:', error);
  }
  return null;
}

/**
 * content_group별 page_view 및 파라미터 조회
 */
async function getContentGroupStats(
  ga4Client: any,
  propertyId: string,
  domain: string
): Promise<Array<{
  contentGroup: string;
  pagePath: string;
  pageViewCount: number;
  params: Record<string, string>;
}>> {
  console.log('\n📊 content_group별 통계 조회 중...');

  const results: Array<{
    contentGroup: string;
    pagePath: string;
    pageViewCount: number;
    params: Record<string, string>;
  }> = [];

  try {
    // 단계 1: pagePath별 page_view 수 조회 (간단한 쿼리)
    const [pageResponse] = await ga4Client.client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [
        { name: 'pagePath' },
      ],
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [
        { metric: { metricName: 'screenPageViews' }, desc: true },
      ],
      limit: 200,
    });

    if (!pageResponse.rows) {
      console.log('   페이지 데이터 없음');
      return results;
    }

    // pagePath에서 content_group 추론
    const contentGroupPatterns: Array<{ pattern: RegExp; group: string }> = [
      { pattern: /\/(display\/)?main/i, group: 'MAIN' },
      { pattern: /\/product\/[^/]+/i, group: 'PRODUCT_DETAIL' },
      { pattern: /\/(goods|item)\/\d+/i, group: 'PRODUCT_DETAIL' },
      { pattern: /\/display\/category/i, group: 'PRODUCT_LIST' },
      { pattern: /\/category\//i, group: 'PRODUCT_LIST' },
      { pattern: /\/search/i, group: 'SEARCH_RESULT' },
      { pattern: /\/brand\/[^/]+/i, group: 'BRAND_MAIN' },
      { pattern: /\/cart/i, group: 'CART' },
      { pattern: /\/order\/complete/i, group: 'ORDER_COMPLETE' },
      { pattern: /\/order/i, group: 'ORDER' },
      { pattern: /\/mypage/i, group: 'MY' },
      { pattern: /\/my\//i, group: 'MY' },
      { pattern: /\/event\/[^/]+/i, group: 'EVENT_DETAIL' },
      { pattern: /\/event\/?$/i, group: 'EVENT_LIST' },
      { pattern: /\/live\/[^/]+/i, group: 'LIVE_DETAIL' },
    ];

    function inferContentGroup(pagePath: string): string {
      for (const { pattern, group } of contentGroupPatterns) {
        if (pattern.test(pagePath)) {
          return group;
        }
      }
      return 'OTHERS';
    }

    // content_group별로 그룹화
    const groupMap = new Map<string, {
      pagePath: string;
      pageViewCount: number;
    }>();

    for (const row of pageResponse.rows) {
      const pagePath = row.dimensionValues?.[0]?.value || '';
      const count = parseInt(row.metricValues?.[0]?.value || '0', 10);

      if (!pagePath || pagePath === '/' || pagePath === '(not set)') continue;

      const contentGroup = inferContentGroup(pagePath);

      const existing = groupMap.get(contentGroup);
      if (!existing || count > existing.pageViewCount) {
        groupMap.set(contentGroup, {
          pagePath,
          pageViewCount: count,
        });
      }
    }

    // 결과 생성
    for (const [contentGroup, data] of groupMap.entries()) {
      // URL에서 site 정보 추론
      const fullUrl = `https://${domain}${data.pagePath}`;
      const predictor = new ValuePredictor();
      const predictions = predictor.predictAll({ url: fullUrl });

      results.push({
        contentGroup,
        pagePath: data.pagePath,
        pageViewCount: data.pageViewCount,
        params: {
          site_name: predictions.find(p => p.key === 'site_name')?.predictedValue || '',
          site_country: predictions.find(p => p.key === 'site_country')?.predictedValue || '',
          site_language: predictions.find(p => p.key === 'site_language')?.predictedValue || '',
          content_group: contentGroup,
          channel: 'PC',
        },
      });
    }

    // page_view 수 기준 정렬
    results.sort((a, b) => b.pageViewCount - a.pageViewCount);

    console.log(`   발견된 페이지: ${pageResponse.rows.length}개`);

  } catch (error: any) {
    console.error('조회 실패:', error.message);

    // 에러 상세 정보 출력
    if (error.details) {
      console.error('상세:', JSON.stringify(error.details, null, 2));
    }
  }

  return results;
}

/**
 * 예측값과 GA4 실제값 비교
 */
function compareWithGA4(
  predictions: any[],
  ga4Params: Record<string, string>
): Array<{
  key: string;
  predicted: string | null;
  actual: string | null;
  match: boolean;
}> {
  const comparisons: Array<{
    key: string;
    predicted: string | null;
    actual: string | null;
    match: boolean;
  }> = [];

  const keysToCompare = [
    'site_name', 'site_country', 'site_language',
    'channel', 'content_group',
  ];

  for (const key of keysToCompare) {
    const pred = predictions.find(p => p.key === key);
    const predicted = pred?.predictedValue || null;
    const actual = ga4Params[key] || null;

    comparisons.push({
      key,
      predicted,
      actual,
      match: predicted === actual,
    });
  }

  return comparisons;
}

/**
 * 메인 분석 실행
 */
async function main() {
  console.log('═'.repeat(80));
  console.log(' GA4 content_group 전체 분석 및 예측 검증');
  console.log('═'.repeat(80));

  const accessToken = loadAccessToken();
  if (!accessToken) {
    console.error('❌ Access Token 없음');
    process.exit(1);
  }

  // GA4 Admin Client로 Property 목록 조회
  const adminClient = new GA4AdminClient(accessToken);
  await adminClient.initialize();

  console.log('\n📋 Property 목록 조회 중...');
  const properties = await adminClient.listProperties(ACCOUNT_ID);
  console.log(`   발견된 Property: ${properties.length}개`);

  for (const prop of properties) {
    console.log(`   - ${prop.displayName} (${prop.propertyId})`);
  }

  // Value Predictor 초기화
  const predictor = new ValuePredictor();

  // 결과 저장용
  const allResults: Array<{
    property: string;
    contentGroup: string;
    pagePath: string;
    pageViewCount: number;
    comparisons: Array<{ key: string; predicted: string | null; actual: string | null; match: boolean }>;
    accuracy: number;
  }> = [];

  // 각 Property 분석
  for (const prop of properties) {
    const domain = PROPERTY_DOMAIN_MAP[prop.propertyId];
    if (!domain) {
      console.log(`\n⚠️ ${prop.displayName} - 도메인 매핑 없음`);
      continue;
    }

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`🏢 ${prop.displayName} (${prop.propertyId})`);
    console.log(`${'═'.repeat(70)}`);

    // GA4 Client 초기화
    const ga4Client = new GA4Client({
      propertyId: prop.propertyId,
      accessToken,
    });
    await ga4Client.initialize();

    // content_group별 통계 조회
    const stats = await getContentGroupStats(ga4Client as any, prop.propertyId, domain);

    console.log(`\n발견된 content_group: ${stats.length}개`);

    for (const stat of stats) {
      console.log(`\n${'─'.repeat(50)}`);
      console.log(`📄 ${stat.contentGroup}`);
      console.log(`   경로: ${stat.pagePath}`);
      console.log(`   page_view: ${stat.pageViewCount.toLocaleString()}건`);

      // 예측 실행
      const pageUrl = `https://${domain}${stat.pagePath}`;
      const context: PredictionContext = {
        url: pageUrl,
        visionPageType: stat.contentGroup, // GA4에서 실제 값을 Vision AI 결과로 사용
      };
      const predictions = predictor.predictAll(context);

      // GA4 실제값과 비교
      const comparisons = compareWithGA4(predictions, stat.params);

      // 결과 출력
      console.log('\n   [예측 vs GA4 비교]');
      let matchCount = 0;
      for (const comp of comparisons) {
        const icon = comp.match ? '✅' : '❌';
        console.log(`   ${icon} ${comp.key}: 예측=${comp.predicted}, GA4=${comp.actual}`);
        if (comp.match) matchCount++;
      }

      const accuracy = comparisons.length > 0 ? (matchCount / comparisons.length) * 100 : 0;
      console.log(`\n   📊 정확도: ${accuracy.toFixed(0)}% (${matchCount}/${comparisons.length})`);

      allResults.push({
        property: prop.displayName,
        contentGroup: stat.contentGroup,
        pagePath: stat.pagePath,
        pageViewCount: stat.pageViewCount,
        comparisons,
        accuracy,
      });
    }
  }

  // 전체 요약
  console.log('\n' + '█'.repeat(80));
  console.log(' 전체 분석 요약');
  console.log('█'.repeat(80));

  const totalComparisons = allResults.reduce((sum, r) => sum + r.comparisons.length, 0);
  const totalMatches = allResults.reduce(
    (sum, r) => sum + r.comparisons.filter(c => c.match).length, 0
  );
  const overallAccuracy = totalComparisons > 0 ? (totalMatches / totalComparisons) * 100 : 0;

  console.log(`\n📊 전체 정확도: ${overallAccuracy.toFixed(1)}%`);
  console.log(`📋 분석된 content_group: ${allResults.length}개`);

  // 불일치 패턴 분석
  const mismatchPatterns = new Map<string, Array<{ predicted: string | null; actual: string | null; context: string }>>();

  for (const result of allResults) {
    for (const comp of result.comparisons) {
      if (!comp.match) {
        const patterns = mismatchPatterns.get(comp.key) || [];
        patterns.push({
          predicted: comp.predicted,
          actual: comp.actual,
          context: `${result.property}/${result.contentGroup}`,
        });
        mismatchPatterns.set(comp.key, patterns);
      }
    }
  }

  if (mismatchPatterns.size > 0) {
    console.log('\n[불일치 패턴 분석]');
    for (const [key, patterns] of mismatchPatterns.entries()) {
      console.log(`\n  ${key} (${patterns.length}건 불일치):`);
      for (const p of patterns.slice(0, 3)) {
        console.log(`    - 예측=${p.predicted}, 실제=${p.actual} @ ${p.context}`);
      }
    }
  }

  // 결과 저장
  const outputPath = path.join(process.cwd(), 'output/validation/content_group_analysis.json');
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify({
    analysisDate: new Date().toISOString(),
    accountId: ACCOUNT_ID,
    overallAccuracy,
    results: allResults,
    mismatchPatterns: Object.fromEntries(mismatchPatterns),
  }, null, 2));

  console.log(`\n💾 결과 저장됨: ${outputPath}`);

  // 규칙 업데이트 제안 생성
  if (mismatchPatterns.size > 0) {
    console.log('\n' + '─'.repeat(50));
    console.log('📝 규칙 업데이트 제안:');

    for (const [key, patterns] of mismatchPatterns.entries()) {
      // 실제 값들의 패턴 분석
      const actualValues = patterns.map(p => p.actual).filter(v => v);
      const uniqueActuals = [...new Set(actualValues)];

      if (uniqueActuals.length === 1) {
        console.log(`\n  [${key}] 모든 실제값이 "${uniqueActuals[0]}"로 동일`);
        console.log(`  → 고정값 "${uniqueActuals[0]}"로 업데이트 고려`);
      } else if (uniqueActuals.length <= 3) {
        console.log(`\n  [${key}] 실제값 종류: ${uniqueActuals.join(', ')}`);
        console.log(`  → 조건부 규칙 추가 고려`);
      }
    }
  }

  console.log('\n✅ 분석 완료!');
}

main().catch(console.error);
