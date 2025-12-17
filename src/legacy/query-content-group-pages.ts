/**
 * GA4에서 각 Content Group별 대표 PAGE_LOCATION 조회
 */

import * as dotenv from 'dotenv';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';

dotenv.config();

const TOKEN_PATH = './credentials/ga4_tokens.json';
const PROPERTY_ID = '416629733';

// 테스트할 Content Group 목록 (SKINNOTE_*, OTHERS 제외)
const TARGET_CONTENT_GROUPS = [
  'MAIN',
  'PRODUCT_DETAIL',
  'EVENT_DETAIL',
  'SEARCH_RESULT',
  'BRAND_MAIN',
  'PRODUCT_LIST',
  'MY',
  'HISTORY',
  'BRAND_PRODUCT_LIST',
  'CART',
  'SEARCH',
  'LIVE_DETAIL',
  'LIVE_LIST',
  'CATEGORY_LIST',
  'MEMBERSHIP',
  'EVENT_LIST',
  'BRAND_LIST',
  'AMORESTORE',
  'BEAUTYFEED',
  'ORDER',
  'CUSTOMER',
  'BRAND_EVENT_LIST',
  'BRAND_CUSTOM_ETC',
];

interface ContentGroupAnalysis {
  contentGroup: string;
  topPageLocation: string;
  pageViews: number;
  topEvents: { eventName: string; eventCount: number; proportion: string }[];
}

async function queryContentGroupPages() {
  // 저장된 토큰 로드
  let tokens;
  try {
    tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
  } catch (error) {
    console.error('❌ 토큰 파일을 읽을 수 없습니다:', TOKEN_PATH);
    process.exit(1);
  }

  const oauth2Client = new OAuth2Client();
  oauth2Client.setCredentials({
    access_token: tokens.access_token,
  });

  const client = new BetaAnalyticsDataClient({
    authClient: oauth2Client,
  });

  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║         GA4 Content Group별 대표 PAGE_LOCATION 및 이벤트 조회              ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  const results: ContentGroupAnalysis[] = [];

  for (const contentGroup of TARGET_CONTENT_GROUPS) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📍 [${contentGroup}]`);
    console.log('='.repeat(80));

    try {
      // 1. Content Group의 대표 PAGE_LOCATION 조회 (page_view 기준)
      const [pageResponse] = await client.runReport({
        property: `properties/${PROPERTY_ID}`,
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [
          { name: 'contentGroup' },
          { name: 'pageLocation' },
        ],
        metrics: [{ name: 'screenPageViews' }],
        dimensionFilter: {
          filter: {
            fieldName: 'contentGroup',
            stringFilter: { value: contentGroup },
          },
        },
        orderBys: [
          { metric: { metricName: 'screenPageViews' }, desc: true },
        ],
        limit: 1,
      });

      if (!pageResponse.rows || pageResponse.rows.length === 0) {
        console.log(`   ⚠️ 데이터 없음`);
        continue;
      }

      const topPageLocation = pageResponse.rows[0].dimensionValues?.[1]?.value || '';
      const pageViews = parseInt(pageResponse.rows[0].metricValues?.[0]?.value || '0', 10);

      console.log(`\n📄 대표 PAGE_LOCATION: ${topPageLocation}`);
      console.log(`   Page Views: ${pageViews.toLocaleString()}`);

      // 2. 해당 Content Group의 상위 이벤트 조회
      const [eventResponse] = await client.runReport({
        property: `properties/${PROPERTY_ID}`,
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [
          { name: 'contentGroup' },
          { name: 'eventName' },
        ],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          filter: {
            fieldName: 'contentGroup',
            stringFilter: { value: contentGroup },
          },
        },
        orderBys: [
          { metric: { metricName: 'eventCount' }, desc: true },
        ],
        limit: 15,
      });

      const topEvents: { eventName: string; eventCount: number; proportion: string }[] = [];
      let totalEvents = 0;

      if (eventResponse.rows) {
        for (const row of eventResponse.rows) {
          totalEvents += parseInt(row.metricValues?.[0]?.value || '0', 10);
        }

        console.log(`\n📊 상위 이벤트 (총 ${totalEvents.toLocaleString()}개):`);

        for (const row of eventResponse.rows) {
          const eventName = row.dimensionValues?.[1]?.value || '';
          const eventCount = parseInt(row.metricValues?.[0]?.value || '0', 10);
          const proportion = ((eventCount / totalEvents) * 100).toFixed(1);

          topEvents.push({ eventName, eventCount, proportion: `${proportion}%` });
          console.log(`   - ${eventName}: ${eventCount.toLocaleString()} (${proportion}%)`);
        }
      }

      results.push({
        contentGroup,
        topPageLocation,
        pageViews,
        topEvents,
      });

    } catch (error: any) {
      console.error(`   ❌ 오류: ${error.message}`);
    }
  }

  // 결과 JSON 저장
  const output = {
    timestamp: new Date().toISOString(),
    propertyId: PROPERTY_ID,
    dateRange: { startDate: '30daysAgo', endDate: 'today' },
    contentGroups: results,
  };

  fs.writeFileSync(
    './output/ga4_content_group_pages.json',
    JSON.stringify(output, null, 2)
  );
  console.log('\n\n✅ 결과 저장됨: ./output/ga4_content_group_pages.json');

  // 테스트 케이스 생성을 위한 요약 출력
  console.log('\n\n' + '='.repeat(80));
  console.log('📋 테스트 케이스 생성용 요약');
  console.log('='.repeat(80));

  for (const r of results) {
    // 자동 수집 이벤트 제외
    const autoEvents = ['page_view', 'screen_view', 'session_start', 'first_visit', 'user_engagement'];
    const significantEvents = r.topEvents
      .filter(e => !autoEvents.includes(e.eventName))
      .slice(0, 10)
      .map(e => e.eventName);

    console.log(`\n// ${r.contentGroup}`);
    console.log(`{`);
    console.log(`  contentGroup: '${r.contentGroup}',`);
    console.log(`  pagePath: '${new URL(r.topPageLocation).pathname}',`);
    console.log(`  url: '${r.topPageLocation}',`);
    console.log(`  ga4TopEvents: [${['screen_view', 'page_view', ...significantEvents].map(e => `'${e}'`).join(', ')}]`);
    console.log(`},`);
  }
}

queryContentGroupPages().catch(console.error);
