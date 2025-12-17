/**
 * GA4 메인 페이지 이벤트 분석
 */
import { GA4Client } from './ga4/ga4Client';
import * as fs from 'fs';

async function main() {
  const tokenData = JSON.parse(fs.readFileSync('./credentials/ga4_tokens.json', 'utf8'));
  const client = new GA4Client({
    propertyId: '416629733',
    accessToken: tokenData.access_token
  });

  await client.initialize();

  // 메인 페이지 이벤트 분석
  const analysis = await client.analyzePageEvents('/kr/ko/display/main', {
    startDate: '30daysAgo',
    endDate: 'today'
  });

  console.log('=== GA4 메인 페이지 실제 이벤트 ===');
  console.log('페이지:', analysis.pagePath);
  console.log('총 이벤트:', analysis.totalEventCount);
  console.log('');
  console.log('【주요 이벤트 (상위 15개)】');

  for (const e of analysis.events.slice(0, 15)) {
    const icon = e.isNoise ? '⚪' : (e.isLowSignificance ? '🔵' : '🟢');
    console.log(`${icon} ${e.eventName}: ${e.eventCount} (${e.percentString})`);
  }

  console.log('');
  console.log('유의미 이벤트:', analysis.significantEvents.length + '개');
  console.log('노이즈 이벤트:', analysis.noiseEvents.length + '개');
}

main().catch(console.error);
