/**
 * GA4 page_view 파라미터 조회 (MAIN 페이지)
 */

import * as fs from 'fs';
import { GA4Client } from './ga4/ga4Client';

const PROPERTY_ID = '416629733'; // 아모레몰

async function main() {
  // 토큰 확인
  const tokenPath = './credentials/ga4_tokens.json';
  let accessToken = '';

  if (fs.existsSync(tokenPath)) {
    try {
      const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
      accessToken = tokens.access_token || '';
    } catch {
      console.error('토큰 파일 읽기 실패');
      return;
    }
  } else {
    console.error('GA4 토큰이 없습니다. npx ts-node src/cli.ts ga4 login 실행 필요');
    return;
  }

  const client = new GA4Client({
    propertyId: PROPERTY_ID,
    accessToken,
  });

  await client.initialize();

  console.log('='.repeat(80));
  console.log(' GA4 page_view 분석 (MAIN 페이지)');
  console.log('='.repeat(80));

  // 1. 메인 페이지 page_view 이벤트 조회
  console.log('\n[1] 메인 페이지 (/kr/ko/) page_view 수집 현황');

  try {
    const pageEvents = await client.getEventsByPage('/kr/ko/', {
      startDate: '7daysAgo',
      endDate: 'today',
      limit: 50,
    });

    // page_view만 필터링
    const pageViewEvents = pageEvents.filter(e => e.eventName === 'page_view');

    if (pageViewEvents.length > 0) {
      console.log('\n  | 페이지 경로 | 이벤트 수 |');
      console.log('  |-------------|-----------|');
      for (const evt of pageViewEvents.slice(0, 10)) {
        console.log(`  | ${evt.pagePath.substring(0, 40).padEnd(40)} | ${evt.eventCount.toLocaleString().padStart(9)} |`);
      }
    } else {
      console.log('  page_view 데이터 없음');
    }

    // 전체 이벤트 목록
    console.log('\n  메인 페이지 전체 이벤트:');
    const eventCounts = new Map<string, number>();
    for (const evt of pageEvents) {
      eventCounts.set(evt.eventName, (eventCounts.get(evt.eventName) || 0) + evt.eventCount);
    }
    const sortedEvents = [...eventCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [eventName, count] of sortedEvents.slice(0, 15)) {
      console.log(`    - ${eventName}: ${count.toLocaleString()}`);
    }
  } catch (e: any) {
    console.log('  오류:', e.message);
  }

  // 2. 실시간 page_view
  console.log('\n[2] 실시간 이벤트 (최근 30분)');
  try {
    const realtimeEvents = await client.getRealtimeEvents();
    const pageView = realtimeEvents.find(e => e.eventName === 'page_view');
    if (pageView) {
      console.log(`  page_view: ${pageView.eventCount.toLocaleString()}건`);
    }
  } catch (e: any) {
    console.log('  오류:', e.message);
  }

  // 3. page_view 전체 통계
  console.log('\n[3] page_view 전체 통계 (최근 7일)');
  try {
    const allEvents = await client.getEvents({ limit: 50 });
    const pageViewEvent = allEvents.find(e => e.eventName === 'page_view');
    if (pageViewEvent) {
      console.log(`  총 page_view: ${pageViewEvent.eventCount.toLocaleString()}건`);
      console.log(`  사용자 수: ${pageViewEvent.totalUsers.toLocaleString()}명`);
    }
  } catch (e: any) {
    console.log('  오류:', e.message);
  }

  console.log('\n[완료]');
}

main().catch(console.error);
