/**
 * GA4 이벤트 비율 분석
 *
 * page_view 대비 각 이벤트의 비율을 분석하여 노이즈 데이터 식별
 * - SPA에서 잘못 수집된 이벤트는 page_view 대비 비율이 매우 낮음
 * - 정상적인 이벤트는 해당 페이지의 page_view와 비슷하거나 일정 비율 유지
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { OAuth2Client } from 'google-auth-library';

dotenv.config();

const GA4_PROPERTY_ID = '416629733';
const TOKEN_PATH = './credentials/ga4_tokens.json';

// Content Group별로 분석할 페이지 타입
const CONTENT_GROUPS = [
  'MAIN', 'PRODUCT_DETAIL', 'EVENT_DETAIL', 'SEARCH_RESULT',
  'BRAND_MAIN', 'PRODUCT_LIST', 'MY', 'HISTORY',
  'BRAND_PRODUCT_LIST', 'CART', 'LIVE_DETAIL', 'LIVE_LIST',
  'CATEGORY_LIST', 'MEMBERSHIP', 'EVENT_LIST', 'BRAND_LIST',
  'AMORESTORE', 'BEAUTYFEED', 'CUSTOMER', 'BRAND_EVENT_LIST', 'BRAND_CUSTOM_ETC'
];

// 노이즈 판단 기준
const NOISE_THRESHOLD = 0.01;  // page_view 대비 1% 미만이면 노이즈
const LOW_RATIO_THRESHOLD = 0.05;  // 5% 미만이면 의심

interface EventRatioResult {
  contentGroup: string;
  pageViewCount: number;
  events: {
    eventName: string;
    eventCount: number;
    ratio: number;  // page_view 대비 비율
    status: 'normal' | 'low' | 'noise' | 'suspicious';
  }[];
}

async function analyzeEventRatios(): Promise<EventRatioResult[]> {
  // OAuth 토큰 로드
  if (!fs.existsSync(TOKEN_PATH)) {
    console.error('❌ GA4 토큰 파일이 없습니다:', TOKEN_PATH);
    console.log('💡 npx ts-node src/cli.ts ga4 auth 명령으로 인증하세요.');
    process.exit(1);
  }

  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  const oauth2Client = new OAuth2Client();
  oauth2Client.setCredentials({
    access_token: tokens.access_token,
  });

  const client = new BetaAnalyticsDataClient({
    authClient: oauth2Client,
  });

  const results: EventRatioResult[] = [];

  for (const contentGroup of CONTENT_GROUPS) {
    console.log(`\n분석 중: ${contentGroup}...`);

    try {
      // 해당 Content Group의 모든 이벤트 수집
      const [response] = await client.runReport({
        property: `properties/${GA4_PROPERTY_ID}`,
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          filter: {
            fieldName: 'contentGroup',
            stringFilter: { matchType: 'EXACT', value: contentGroup },
          },
        },
        orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
        limit: 50,
      });

      if (!response.rows || response.rows.length === 0) {
        console.log(`  ⚠️ ${contentGroup}: 데이터 없음`);
        continue;
      }

      // page_view 수 찾기
      const pageViewRow = response.rows.find(
        (row: any) => row.dimensionValues?.[0]?.value === 'page_view'
      );
      const pageViewCount = pageViewRow
        ? parseInt(pageViewRow.metricValues?.[0]?.value || '0', 10)
        : 0;

      if (pageViewCount === 0) {
        console.log(`  ⚠️ ${contentGroup}: page_view 없음`);
        continue;
      }

      // 각 이벤트의 비율 계산
      const events = response.rows
        .filter((row: any) => {
          const eventName = row.dimensionValues?.[0]?.value || '';
          // 자동 수집 이벤트 제외
          return !['session_start', 'first_visit', 'user_engagement'].includes(eventName);
        })
        .map((row: any) => {
          const eventName = row.dimensionValues?.[0]?.value || '';
          const eventCount = parseInt(row.metricValues?.[0]?.value || '0', 10);
          const ratio = eventCount / pageViewCount;

          let status: 'normal' | 'low' | 'noise' | 'suspicious' = 'normal';
          if (ratio < NOISE_THRESHOLD) {
            status = 'noise';
          } else if (ratio < LOW_RATIO_THRESHOLD) {
            status = 'low';
          }

          // 특정 이벤트는 비율이 낮아도 정상일 수 있음 (클릭 기반)
          const clickBasedEvents = ['add_to_cart', 'begin_checkout', 'purchase', 'select_item', 'select_promotion'];
          if (clickBasedEvents.includes(eventName) && status === 'noise') {
            status = 'low';  // 클릭 기반은 noise 대신 low로
          }

          return { eventName, eventCount, ratio, status };
        });

      results.push({
        contentGroup,
        pageViewCount,
        events,
      });

      // 간단한 요약 출력
      const noiseEvents = events.filter((e: any) => e.status === 'noise');
      const lowEvents = events.filter((e: any) => e.status === 'low');
      console.log(`  ✅ page_view: ${pageViewCount.toLocaleString()}`);
      if (noiseEvents.length > 0) {
        console.log(`  ⚠️ 노이즈 의심 (${noiseEvents.length}개): ${noiseEvents.map((e: any) => e.eventName).join(', ')}`);
      }
      if (lowEvents.length > 0) {
        console.log(`  📉 낮은 비율 (${lowEvents.length}개): ${lowEvents.map((e: any) => e.eventName).join(', ')}`);
      }

    } catch (error: any) {
      console.error(`  ❌ ${contentGroup} 분석 실패:`, error.message);
    }
  }

  return results;
}

function printDetailedReport(results: EventRatioResult[]): void {
  console.log('\n' + '═'.repeat(100));
  console.log('📊 상세 이벤트 비율 분석 리포트');
  console.log('═'.repeat(100));

  for (const result of results) {
    console.log(`\n┌─ ${result.contentGroup} (page_view: ${result.pageViewCount.toLocaleString()}) ─┐`);
    console.log('├────────────────────────┬────────────┬──────────┬──────────┤');
    console.log('│ 이벤트                 │ 이벤트수   │ 비율     │ 상태     │');
    console.log('├────────────────────────┼────────────┼──────────┼──────────┤');

    for (const event of result.events) {
      const name = event.eventName.padEnd(22);
      const count = event.eventCount.toLocaleString().padStart(10);
      const ratio = `${(event.ratio * 100).toFixed(2)}%`.padStart(8);
      let statusIcon = '✅';
      if (event.status === 'noise') statusIcon = '🚫';
      else if (event.status === 'low') statusIcon = '⚠️';
      console.log(`│ ${name} │ ${count} │ ${ratio} │ ${statusIcon}       │`);
    }
    console.log('└────────────────────────┴────────────┴──────────┴──────────┘');
  }
}

function identifyMiscollectedEvents(results: EventRatioResult[]): void {
  console.log('\n' + '═'.repeat(80));
  console.log('🔍 잘못 수집된 이벤트 분석 (개발가이드와 비교 필요)');
  console.log('═'.repeat(80));

  // 개발가이드 기준 이벤트 발생 시점 (주요 이벤트)
  const guideBasedEvents: Record<string, string[]> = {
    'view_item': ['PRODUCT_DETAIL'],  // 상품 상세 페이지에서만
    'view_item_list': ['SEARCH_RESULT'],  // 검색 결과에서만
    'view_search_results': ['SEARCH_RESULT'],  // 검색 결과에서만
    'add_to_cart': ['PRODUCT_DETAIL', 'CART'],  // 상품 상세, 장바구니
    'begin_checkout': ['CART', 'PRODUCT_DETAIL'],  // 장바구니, 바로구매
    'purchase': ['ORDER'],  // 주문 완료
    'view_promotion': ['MAIN'],  // 메인 페이지 Key Visual
    'select_promotion': ['MAIN'],  // 메인 페이지 배너 클릭
  };

  const suspiciousEvents: { contentGroup: string; eventName: string; ratio: number; reason: string }[] = [];

  for (const result of results) {
    for (const event of result.events) {
      const expectedPages = guideBasedEvents[event.eventName];

      if (expectedPages && !expectedPages.includes(result.contentGroup)) {
        // 개발가이드에서 이 페이지에서 발생하면 안 되는 이벤트가 수집됨
        if (event.ratio > 0.001) {  // 0.1% 이상이면 의심
          suspiciousEvents.push({
            contentGroup: result.contentGroup,
            eventName: event.eventName,
            ratio: event.ratio,
            reason: `개발가이드: ${expectedPages.join(', ')}에서만 발생해야 함`,
          });
        }
      }
    }
  }

  if (suspiciousEvents.length > 0) {
    console.log('\n⚠️ 개발가이드와 다르게 수집되는 이벤트:');
    for (const s of suspiciousEvents) {
      console.log(`  - [${s.contentGroup}] ${s.eventName}: ${(s.ratio * 100).toFixed(2)}%`);
      console.log(`    └─ ${s.reason}`);
    }
  } else {
    console.log('\n✅ 개발가이드와 크게 다른 수집 패턴 없음');
  }

  // view_promotion이 MAIN 외에서 수집되는 경우 분석
  console.log('\n📌 view_promotion 수집 현황 (개발가이드: MAIN에서만):');
  for (const result of results) {
    const vpEvent = result.events.find(e => e.eventName === 'view_promotion');
    if (vpEvent) {
      const isExpected = result.contentGroup === 'MAIN';
      const icon = isExpected ? '✅' : (vpEvent.ratio > 0.1 ? '❌' : '⚠️');
      console.log(`  ${icon} ${result.contentGroup}: ${vpEvent.eventCount.toLocaleString()} (${(vpEvent.ratio * 100).toFixed(2)}%)`);
    }
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     GA4 이벤트 비율 분석 (노이즈 데이터 식별)              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n노이즈 기준: page_view 대비 ${NOISE_THRESHOLD * 100}% 미만`);
  console.log(`낮은 비율 기준: page_view 대비 ${LOW_RATIO_THRESHOLD * 100}% 미만`);

  const results = await analyzeEventRatios();

  printDetailedReport(results);
  identifyMiscollectedEvents(results);

  // 결과 저장
  fs.writeFileSync(
    './output/event_ratio_analysis.json',
    JSON.stringify(results, null, 2)
  );
  console.log('\n✅ 결과 저장됨: ./output/event_ratio_analysis.json');
}

main().catch(console.error);
