/**
 * GA4에서 현재 수집 중인 Content Group 목록 조회
 */

import * as dotenv from 'dotenv';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';

dotenv.config();

const TOKEN_PATH = './credentials/ga4_tokens.json';

async function queryContentGroups() {
  const propertyId = process.env.GA4_PROPERTY_ID || '416629733';

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

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         GA4 Content Group 조회                             ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n📊 Property ID: ${propertyId}`);
  console.log(`📅 조회 기간: 30일\n`);

  try {
    // Content Group 조회
    const [response] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'contentGroup' }],
      metrics: [
        { name: 'eventCount' },
        { name: 'totalUsers' },
        { name: 'sessions' },
      ],
      orderBys: [
        { metric: { metricName: 'eventCount' }, desc: true },
      ],
      limit: 50,
    });

    console.log('┌────────────────────────┬──────────────┬──────────────┬──────────────┐');
    console.log('│ Content Group          │ Event Count  │ Total Users  │ Sessions     │');
    console.log('├────────────────────────┼──────────────┼──────────────┼──────────────┤');

    const contentGroups: { name: string; eventCount: number; users: number; sessions: number }[] = [];

    if (response.rows) {
      for (const row of response.rows) {
        const contentGroup = row.dimensionValues?.[0]?.value || '(not set)';
        const eventCount = parseInt(row.metricValues?.[0]?.value || '0', 10);
        const totalUsers = parseInt(row.metricValues?.[1]?.value || '0', 10);
        const sessions = parseInt(row.metricValues?.[2]?.value || '0', 10);

        contentGroups.push({
          name: contentGroup,
          eventCount,
          users: totalUsers,
          sessions,
        });

        const cg = contentGroup.padEnd(22);
        const ec = eventCount.toLocaleString().padStart(12);
        const tu = totalUsers.toLocaleString().padStart(12);
        const ss = sessions.toLocaleString().padStart(12);
        console.log(`│ ${cg} │ ${ec} │ ${tu} │ ${ss} │`);
      }
    }

    console.log('└────────────────────────┴──────────────┴──────────────┴──────────────┘');

    // 요약
    const totalEvents = contentGroups.reduce((sum, cg) => sum + cg.eventCount, 0);
    console.log(`\n📈 총 ${contentGroups.length}개 Content Group, ${totalEvents.toLocaleString()}개 이벤트`);

    // Content Group별 상위 이벤트 조회
    console.log('\n\n=== Content Group별 상위 이벤트 ===\n');

    for (const cg of contentGroups.slice(0, 15)) {
      if (cg.name === '(not set)') continue;

      console.log(`\n📍 [${cg.name}] - ${cg.eventCount.toLocaleString()} events`);

      const [eventResponse] = await client.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [
          { name: 'contentGroup' },
          { name: 'eventName' },
        ],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          filter: {
            fieldName: 'contentGroup',
            stringFilter: { value: cg.name },
          },
        },
        orderBys: [
          { metric: { metricName: 'eventCount' }, desc: true },
        ],
        limit: 10,
      });

      if (eventResponse.rows) {
        for (const row of eventResponse.rows) {
          const eventName = row.dimensionValues?.[1]?.value || '';
          const eventCount = parseInt(row.metricValues?.[0]?.value || '0', 10);
          const proportion = (eventCount / cg.eventCount * 100).toFixed(1);
          console.log(`   - ${eventName}: ${eventCount.toLocaleString()} (${proportion}%)`);
        }
      }
    }

    // JSON 저장
    const output = {
      timestamp: new Date().toISOString(),
      propertyId,
      dateRange: { startDate: '30daysAgo', endDate: 'today' },
      contentGroups,
    };

    fs.writeFileSync(
      './output/ga4_content_groups.json',
      JSON.stringify(output, null, 2)
    );
    console.log('\n\n✅ 결과 저장됨: ./output/ga4_content_groups.json');

  } catch (error: any) {
    console.error('❌ 오류:', error.message);
    if (error.message.includes('UNAUTHENTICATED')) {
      console.log('\n토큰이 만료되었을 수 있습니다. 다시 인증해주세요.');
    }
  }
}

queryContentGroups();
