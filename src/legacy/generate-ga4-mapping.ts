/**
 * GTM → GA4 API 파라미터 맵핑 파일 생성
 *
 * AI가 이벤트 검증 시 바로 사용할 수 있는 1:1 맵핑 파일을 생성합니다.
 *
 * 사용법: npx ts-node src/generate-ga4-mapping.ts
 */

import * as fs from 'fs';
import { createGTMToGA4MappingGenerator } from './config/gtmToGa4ParameterMapping';

function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     GTM → GA4 API 파라미터 1:1 맵핑 생성                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const generator = createGTMToGA4MappingGenerator();

  // 1. 상세 맵핑 생성
  const detailedMappings = generator.generateAllMappings();
  console.log(`✅ ${detailedMappings.length}개 이벤트 맵핑 생성 완료\n`);

  // 2. AI용 간단 맵핑 생성
  const simpleMappings = generator.generateSimpleMappings();

  // 3. 파일 저장
  const output = {
    generatedAt: new Date().toISOString(),
    description: 'GTM 파라미터 → GA4 API Dimension 1:1 맵핑. AI가 GA4 데이터 검증 시 사용.',
    usage: {
      eventFilter: "GA4 Data API에서 dimensionFilter로 사용",
      eventParams: "이벤트 레벨 파라미터 → GA4 dimension 이름",
      itemParams: "아이템 레벨 파라미터 → GA4 dimension 이름",
    },
    totalEvents: detailedMappings.length,
    events: simpleMappings,
    detailedMappings,
  };

  fs.writeFileSync('./output/gtm_to_ga4_mapping.json', JSON.stringify(output, null, 2));
  console.log('✅ 저장됨: ./output/gtm_to_ga4_mapping.json\n');

  // 4. 샘플 출력
  console.log('═'.repeat(80));
  console.log('📋 샘플 맵핑 (view_promotion, add_to_cart, purchase)');
  console.log('═'.repeat(80));

  const sampleEvents = ['view_promotion', 'add_to_cart', 'purchase'];
  for (const eventName of sampleEvents) {
    const mapping = simpleMappings[eventName];
    if (!mapping) continue;

    console.log(`\n┌─ ${eventName} ─${'─'.repeat(60 - eventName.length)}┐`);
    console.log(`│ GA4 Filter: ${mapping.ga4Filter}`);

    if (Object.keys(mapping.eventParams).length > 0) {
      console.log('│');
      console.log('│ Event Parameters (GTM → GA4 Dimension):');
      for (const [gtmKey, ga4Dim] of Object.entries(mapping.eventParams)) {
        console.log(`│   ${gtmKey.padEnd(25)} → ${ga4Dim}`);
      }
    }

    if (Object.keys(mapping.itemParams).length > 0) {
      console.log('│');
      console.log('│ Item Parameters (GTM → GA4 Dimension):');
      for (const [gtmKey, ga4Dim] of Object.entries(mapping.itemParams)) {
        const isCustom = (ga4Dim as string).startsWith('customEvent:');
        const marker = isCustom ? ' [커스텀]' : '';
        console.log(`│   ${gtmKey.padEnd(25)} → ${ga4Dim}${marker}`);
      }
    }

    console.log(`└${'─'.repeat(65)}┘`);
  }

  // 5. AI 사용 예시
  console.log('\n' + '═'.repeat(80));
  console.log('🤖 AI 사용 예시 - GA4 Data API 쿼리');
  console.log('═'.repeat(80));

  console.log(`
예: view_promotion 이벤트의 promotion_id 값 조회

GA4 Data API Request:
{
  "dateRanges": [{ "startDate": "7daysAgo", "endDate": "today" }],
  "dimensions": [
    { "name": "eventName" },
    { "name": "promotionId" }        // GTM: promotion_id
  ],
  "metrics": [{ "name": "eventCount" }],
  "dimensionFilter": {
    "filter": {
      "fieldName": "eventName",
      "stringFilter": { "value": "view_promotion" }
    }
  }
}

커스텀 파라미터 조회 (event_category):
{
  "dimensions": [
    { "name": "eventName" },
    { "name": "customEvent:event_category" }  // 커스텀 → customEvent: 접두사
  ],
  ...
}
`);
}

main();
