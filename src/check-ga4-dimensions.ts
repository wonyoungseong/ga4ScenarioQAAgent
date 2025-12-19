/**
 * GA4 API에서 사용 가능한 Custom Dimensions 조회
 */

import * as fs from 'fs';
import { GA4Client } from './ga4/ga4Client';

const PROPERTY_ID = '416629733';

async function main() {
  console.log('='.repeat(100));
  console.log(' GA4 API Metadata 조회 - Custom Dimensions 확인');
  console.log('='.repeat(100));

  const tokenPath = './credentials/ga4_tokens.json';
  if (!fs.existsSync(tokenPath)) {
    console.log('❌ GA4 토큰이 없습니다. 먼저 인증을 진행하세요.');
    return;
  }

  const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));

  try {
    const ga4 = new GA4Client({ propertyId: PROPERTY_ID, accessToken: tokens.access_token });
    await ga4.initialize();

    const client = (ga4 as any).client;

    // 1. Metadata API 호출 - 사용 가능한 모든 dimension/metric 조회
    console.log('\n📌 1. GA4 Metadata API 호출\n');

    const [metadata] = await client.getMetadata({
      name: `properties/${PROPERTY_ID}/metadata`,
    });

    console.log('✅ Metadata 조회 성공\n');

    // 2. Custom Dimensions 필터링
    console.log('='.repeat(100));
    console.log(' Custom Dimensions (Event-scoped)');
    console.log('='.repeat(100));

    const customEventDims = metadata.dimensions?.filter((d: any) =>
      d.apiName?.startsWith('customEvent:')
    ) || [];

    if (customEventDims.length === 0) {
      console.log('\n⚠️ Event-scoped Custom Dimensions가 없습니다.');
      console.log('   GA4 관리자 > 데이터 표시 > 맞춤 정의에서 등록이 필요합니다.\n');
    } else {
      console.log(`\n총 ${customEventDims.length}개 발견:\n`);
      for (const dim of customEventDims) {
        console.log(`  - ${dim.apiName}`);
        console.log(`    UI 이름: ${dim.uiName}`);
        console.log(`    설명: ${dim.description || '(없음)'}`);
        console.log('');
      }
    }

    // 3. Custom Dimensions (User-scoped)
    console.log('='.repeat(100));
    console.log(' Custom Dimensions (User-scoped)');
    console.log('='.repeat(100));

    const customUserDims = metadata.dimensions?.filter((d: any) =>
      d.apiName?.startsWith('customUser:')
    ) || [];

    if (customUserDims.length === 0) {
      console.log('\n⚠️ User-scoped Custom Dimensions가 없습니다.\n');
    } else {
      console.log(`\n총 ${customUserDims.length}개 발견:\n`);
      for (const dim of customUserDims) {
        console.log(`  - ${dim.apiName}`);
        console.log(`    UI 이름: ${dim.uiName}`);
        console.log('');
      }
    }

    // 4. 일반 Dimensions 중 관련된 것들
    console.log('='.repeat(100));
    console.log(' 표준 Dimensions (page/event 관련)');
    console.log('='.repeat(100));

    const standardDims = metadata.dimensions?.filter((d: any) => {
      const name = d.apiName || '';
      return name.includes('page') ||
             name.includes('event') ||
             name.includes('content') ||
             name === 'language' ||
             name === 'country' ||
             name === 'deviceCategory';
    }) || [];

    console.log(`\n주요 ${standardDims.length}개:\n`);
    for (const dim of standardDims.slice(0, 30)) {
      console.log(`  - ${dim.apiName}: ${dim.uiName}`);
    }

    // 5. 전체 Custom Dimension 목록
    console.log('\n\n='.repeat(100));
    console.log(' 전체 Custom Dimensions 목록');
    console.log('='.repeat(100));

    const allDims = metadata.dimensions || [];
    const allCustom = allDims.filter((d: any) => d.apiName?.startsWith('custom'));

    console.log(`\n전체 Dimension 수: ${allDims.length}개`);
    console.log(`Custom Dimension 수: ${allCustom.length}개\n`);

    if (allCustom.length > 0) {
      console.log('[Custom Dimensions 전체 목록]');
      for (const dim of allCustom) {
        console.log(`  ${dim.apiName} - ${dim.uiName}`);
      }
    } else {
      console.log('\n⚠️ Custom Dimension이 등록되지 않았습니다!');
      console.log('\n📌 Custom Dimension 등록 방법:');
      console.log('   1. GA4 관리자 페이지 접속');
      console.log('   2. 데이터 표시 > 맞춤 정의 > 맞춤 측정기준 클릭');
      console.log('   3. "맞춤 측정기준 만들기" 클릭');
      console.log('   4. 측정기준 이름, 범위(이벤트/사용자), 이벤트 매개변수 입력');
      console.log('\n   예: site_name, content_group, channel 등을 등록해야 API로 조회 가능');
    }

    // 6. 샘플 쿼리로 실제 값 확인
    console.log('\n\n='.repeat(100));
    console.log(' 샘플 데이터 조회 테스트');
    console.log('='.repeat(100));

    // 표준 dimension으로 조회
    console.log('\n[표준 Dimension 조회]');
    try {
      const [testResp] = await client.runReport({
        property: `properties/${PROPERTY_ID}`,
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        dimensions: [
          { name: 'eventName' },
          { name: 'pagePath' },
          { name: 'contentGroup' },
        ],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          filter: { fieldName: 'eventName', stringFilter: { value: 'page_view' } }
        },
        limit: 5,
        orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      });

      if (testResp.rows?.length > 0) {
        console.log('  eventName | pagePath | contentGroup | eventCount');
        console.log('  ' + '-'.repeat(80));
        for (const row of testResp.rows) {
          const eventName = row.dimensionValues?.[0]?.value || '';
          const pagePath = row.dimensionValues?.[1]?.value || '';
          const contentGroup = row.dimensionValues?.[2]?.value || '';
          const eventCount = row.metricValues?.[0]?.value || '';
          console.log(`  ${eventName} | ${pagePath.substring(0, 30)} | ${contentGroup} | ${eventCount}`);
        }
      }
    } catch (e: any) {
      console.log(`  조회 실패: ${e.message}`);
    }

    // Custom Event Dimension 조회 시도
    if (customEventDims.length > 0) {
      console.log('\n[Custom Event Dimension 조회]');
      const firstCustom = customEventDims[0].apiName;
      try {
        const [customResp] = await client.runReport({
          property: `properties/${PROPERTY_ID}`,
          dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
          dimensions: [{ name: firstCustom }],
          metrics: [{ name: 'eventCount' }],
          limit: 5,
          orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
        });

        console.log(`  ${firstCustom} 값 조회 결과:`);
        for (const row of (customResp.rows || [])) {
          console.log(`    - ${row.dimensionValues?.[0]?.value}: ${row.metricValues?.[0]?.value}건`);
        }
      } catch (e: any) {
        console.log(`  조회 실패: ${e.message}`);
      }
    }

  } catch (error: any) {
    console.error('\n❌ GA4 API 오류:', error.message);

    if (error.message.includes('PERMISSION_DENIED')) {
      console.log('\n⚠️ 권한이 부족합니다.');
      console.log('   필요한 권한: Google Analytics Data API 읽기 권한');
    }

    if (error.message.includes('UNAUTHENTICATED')) {
      console.log('\n⚠️ 인증이 만료되었습니다.');
      console.log('   OAuth Playground에서 새 토큰을 발급받으세요.');
    }
  }
}

main().catch(console.error);
