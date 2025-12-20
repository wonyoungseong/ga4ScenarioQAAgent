/**
 * GA4 API Dimension 매핑 확인
 *
 * page_view 이벤트의 파라미터가 GA4 Data API에서 어떤 dimension으로 조회되는지 확인
 */

import { initializeParameterRegistry, getEventParameters } from './config/parameterRegistry';

async function main() {
  await initializeParameterRegistry();

  const params = getEventParameters('page_view');

  if (!params) {
    console.log('❌ page_view 파라미터를 찾을 수 없습니다.');
    return;
  }

  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  page_view 파라미터 - GA4 API Dimension 매핑                                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

  console.log('┌─────────────────────┬───────────────────┬────────────────────────────────┬──────────┐');
  console.log('│ 개발가이드 변수          │ GA4 파라미터         │ GA4 API Dimension              │ Type     │');
  console.log('├─────────────────────┼───────────────────┼────────────────────────────────┼──────────┤');

  for (const p of params.parameters) {
    const devVar = (p.devGuideVar || '-').padEnd(19);
    const ga4Key = p.ga4Key.padEnd(17);
    const apiDim = p.ga4ApiDimension.padEnd(30);
    const type = (p.isCustomDimension ? 'Custom' : 'Standard').padEnd(8);
    console.log(`│ ${devVar} │ ${ga4Key} │ ${apiDim} │ ${type} │`);
  }

  console.log('└─────────────────────┴───────────────────┴────────────────────────────────┴──────────┘');

  // GA4 Data API 사용 예시
  console.log('\n═'.repeat(80));
  console.log('【 GA4 Data API 호출 예시 】');
  console.log('═'.repeat(80));

  const standardDims = params.parameters.filter(p => !p.isCustomDimension);
  const customDims = params.parameters.filter(p => p.isCustomDimension);

  console.log('\n▶ Standard Dimensions (GA4 기본 제공):');
  if (standardDims.length > 0) {
    for (const p of standardDims) {
      console.log(`   { name: "${p.ga4ApiDimension}" }  // ${p.ga4Key}`);
    }
  } else {
    console.log('   (없음 - 모두 Custom Dimension)');
  }

  console.log('\n▶ Custom Dimensions (사용자 정의):');
  for (const p of customDims.slice(0, 10)) {
    console.log(`   { name: "${p.ga4ApiDimension}" }  // ${p.ga4Key}`);
  }
  if (customDims.length > 10) {
    console.log(`   ... (${customDims.length - 10}개 더)`);
  }

  // 실제 API 호출 예시
  console.log('\n▶ API 호출 코드 예시:');
  console.log(`
const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const client = new BetaAnalyticsDataClient();

const [response] = await client.runReport({
  property: 'properties/YOUR_PROPERTY_ID',
  dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
  dimensions: [
    { name: 'customEvent:site_name' },
    { name: 'customEvent:content_group' },
    { name: 'customEvent:site_country' },
  ],
  metrics: [
    { name: 'eventCount' },
  ],
  dimensionFilter: {
    filter: {
      fieldName: 'eventName',
      stringFilter: { value: 'page_view' }
    }
  }
});
`);

  console.log('\n✅ 완료');
}

main().catch(console.error);
