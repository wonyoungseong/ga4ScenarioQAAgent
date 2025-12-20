/**
 * GA4 API를 통해 페이지 타입별 URL 패턴 확인
 *
 * content_group (페이지 타입)과 page_location을 함께 조회하여
 * 각 페이지 타입별 URL 패턴을 파악합니다.
 */

import { createGA4ClientFromEnv, GA4Client, GA4ClientConfig } from './ga4/ga4Client';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║     GA4 API - 페이지 타입별 URL 패턴 분석                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  const client = createGA4ClientFromEnv();
  if (!client) {
    console.log('❌ GA4 클라이언트 생성 실패');
    return;
  }

  try {
    await client.initialize();
    console.log('✅ GA4 인증 성공\n');
  } catch (error) {
    console.log('❌ GA4 인증이 필요합니다. 먼저 로그인하세요:');
    console.log('   npx ts-node src/cli.ts ga4 login');
    return;
  }

  console.log('📊 페이지 타입별 이벤트 분석 중...\n');

  // 다양한 페이지 경로 패턴으로 조회
  const pagePatterns = [
    '/kr/ko/display/main',
    '/kr/ko/display/search',
    '/kr/ko/display/ctg',
    '/kr/ko/display/prd',
    '/kr/ko/display/event',
    '/kr/ko/order',
    '/kr/ko/cart',
    '/kr/ko/my',
  ];

  const results: Array<{
    pattern: string;
    events: Array<{ eventName: string; eventCount: number; percentage: number }>;
    totalCount: number;
  }> = [];

  for (const pattern of pagePatterns) {
    try {
      const analysis = await client.analyzePageEvents(pattern, {
        startDate: '7daysAgo',
        endDate: 'today',
        limit: 100,
      });

      const events = analysis.events.map(e => ({
        eventName: e.eventName,
        eventCount: e.eventCount,
        percentage: e.proportion * 100,
      }));

      results.push({
        pattern,
        events,
        totalCount: analysis.totalEventCount,
      });

      console.log(`✅ ${pattern} - ${analysis.totalEventCount.toLocaleString()} 이벤트`);
    } catch (error) {
      console.log(`⚠️ ${pattern} - 조회 실패`);
    }
  }

  // 결과 출력
  console.log('\n' + '═'.repeat(80));
  console.log('【 페이지 경로별 이벤트 분포 】');
  console.log('═'.repeat(80));

  for (const result of results) {
    console.log(`\n▸ ${result.pattern} (${result.totalCount.toLocaleString()} 이벤트)`);

    if (result.events.length === 0) {
      console.log('    (데이터 없음)');
      continue;
    }

    // 상위 10개 이벤트 출력
    const topEvents = result.events.slice(0, 10);
    for (const e of topEvents) {
      const bar = '█'.repeat(Math.min(Math.floor(e.percentage / 2), 20));
      console.log(`    ${e.eventName.padEnd(25)} ${e.percentage.toFixed(2).padStart(6)}% ${bar}`);
    }

    if (result.events.length > 10) {
      console.log(`    ... 외 ${result.events.length - 10}개 이벤트`);
    }
  }

  // page_view 이벤트의 content_group 값 확인
  console.log('\n' + '═'.repeat(80));
  console.log('【 page_view 이벤트의 content_group 분석 】');
  console.log('═'.repeat(80));

  // 이벤트 목록에서 커스텀 이벤트 확인
  const events = await client.getEvents({ startDate: '7daysAgo', endDate: 'today', limit: 50 });

  console.log('\n상위 20개 이벤트:');
  for (const e of events.slice(0, 20)) {
    console.log(`  ${e.eventName.padEnd(30)} ${e.eventCount.toLocaleString().padStart(12)} 건`);
  }

  console.log('\n✅ 완료');
}

main().catch(console.error);
