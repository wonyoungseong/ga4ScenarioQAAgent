/**
 * GA4 상품 리스트 페이지 이벤트 분석
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

  // 브랜드 페이지 (상품 리스트) 이벤트 분석
  const analysis = await client.analyzePageEvents('/kr/ko/display/brand', {
    startDate: '30daysAgo',
    endDate: 'today'
  });

  console.log('=== GA4 상품 리스트 페이지 실제 이벤트 ===');
  console.log('페이지:', analysis.pagePath);
  console.log('총 이벤트:', analysis.totalEventCount);
  console.log('');
  console.log('【주요 이벤트 (상위 20개)】');

  for (const e of analysis.events.slice(0, 20)) {
    const icon = e.isNoise ? '⚪' : (e.isLowSignificance ? '🔵' : '🟢');
    console.log(`${icon} ${e.eventName}: ${e.eventCount} (${e.percentString})`);
  }

  console.log('');
  console.log('유의미 이벤트:', analysis.significantEvents.length + '개');
  console.log('노이즈 이벤트:', analysis.noiseEvents.length + '개');

  // select_item, view_item_list 확인
  console.log('\n【핵심 이커머스 이벤트 확인】');
  const keyEvents = ['select_item', 'view_item_list', 'view_item', 'add_to_cart'];
  for (const eventName of keyEvents) {
    const event = analysis.events.find(e => e.eventName === eventName);
    if (event) {
      console.log(`✅ ${eventName}: ${event.eventCount} (${event.percentString})`);
    } else {
      console.log(`❌ ${eventName}: 발생 안함`);
    }
  }
}

main().catch(console.error);
