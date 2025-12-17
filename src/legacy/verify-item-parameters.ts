/**
 * GA4 Item 파라미터 수집 검증 스크립트
 *
 * GTM에서 정의한 items 배열 내부 파라미터가 GA4에 제대로 수집되는지 검증합니다.
 * - GA4 표준 item 파라미터 (item_id, item_name, item_brand 등)
 * - 커스텀 item 파라미터 (apg_brand_code, original_price 등)
 *
 * 사용법: npx ts-node src/verify-item-parameters.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { OAuth2Client } from 'google-auth-library';
import { ITEM_PARAMETER_GA4_MAPPING } from './config/eventParameterConfig';

// 이벤트별 예상 item 파라미터 (eventParameterConfig에서 가져옴)
const EVENT_ITEM_PARAMS: Record<string, string[]> = {
  'view_item': [
    'item_id', 'item_name', 'item_brand',
    'item_category', 'item_category2', 'item_category3', 'item_category4', 'item_category5',
    'apg_brand_code', 'price', 'discount', 'original_price', 'internal_brand_code'
  ],
  'select_item': [
    'item_id', 'item_name', 'item_brand',
    'item_category', 'item_category2', 'item_category3', 'item_category4', 'item_category5',
    'apg_brand_code', 'index', 'item_list_name', 'price', 'discount', 'original_price', 'internal_brand_code'
  ],
  'view_item_list': [
    'item_id', 'item_name', 'item_brand',
    'item_category', 'item_category2', 'item_category3', 'item_category4', 'item_category5',
    'index', 'item_list_name', 'apg_brand_code', 'price', 'discount', 'original_price', 'internal_brand_code'
  ],
  'add_to_cart': [
    'item_id', 'item_name', 'item_brand',
    'item_category', 'item_category2', 'item_category3', 'item_category4', 'item_category5',
    'item_variant', 'apg_brand_code', 'quantity', 'price', 'discount', 'original_price', 'internal_brand_code'
  ],
  'begin_checkout': [
    'item_id', 'item_name', 'item_brand',
    'item_category', 'item_category2', 'item_category3', 'item_category4', 'item_category5',
    'item_variant', 'apg_brand_code', 'quantity', 'price', 'discount', 'original_price', 'internal_brand_code'
  ],
  'purchase': [
    'item_id', 'item_name', 'item_brand',
    'item_category', 'item_category2', 'item_category3', 'item_category4', 'item_category5',
    'item_variant', 'apg_brand_code', 'coupon', 'quantity', 'price', 'discount', 'original_price',
    'item_beauty_acc', 'is_giftprd', 'internal_brand_code'
  ],
  'view_promotion': [
    'promotion_id', 'promotion_name', 'creative_slot', 'index'
  ],
  'select_promotion': [
    'promotion_id', 'promotion_name', 'creative_slot', 'index'
  ],
};

dotenv.config();

const GA4_PROPERTY_ID = '416629733';
const TOKEN_PATH = './credentials/ga4_tokens.json';

// 검증할 이커머스 이벤트
const ECOMMERCE_EVENTS = [
  'view_item',
  'select_item',
  'view_item_list',
  'add_to_cart',
  'begin_checkout',
  'purchase',
  'view_promotion',
  'select_promotion',
];

// GA4 API에서 조회 가능한 item-scoped dimensions
const GA4_ITEM_DIMENSIONS = [
  'itemId',
  'itemName',
  'itemBrand',
  'itemCategory',
  'itemCategory2',
  'itemCategory3',
  'itemCategory4',
  'itemCategory5',
  'itemVariant',
  'itemListName',
  'itemListId',
  'itemPromotionId',
  'itemPromotionName',
  'itemPromotionCreativeName',
  'itemPromotionCreativeSlot',
];

// GA4 API에서 조회 가능한 item-scoped metrics
const GA4_ITEM_METRICS = [
  'itemsViewed',
  'itemsAddedToCart',
  'itemsPurchased',
  'itemRevenue',
  'itemsClickedInList',
  'itemsClickedInPromotion',
  'itemsViewedInList',
  'itemsViewedInPromotion',
];

interface ItemParameterResult {
  eventName: string;
  dimension: string;
  gtmKey: string;
  sampleValue: string | null;
  recordCount: number;
  status: 'collected' | 'empty' | 'not_found';
}

interface VerificationResult {
  eventName: string;
  totalRecords: number;
  collectedParams: ItemParameterResult[];
  missingParams: string[];
  emptyParams: string[];
  collectionRate: number;
}

async function createGA4Client(): Promise<BetaAnalyticsDataClient> {
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

  return new BetaAnalyticsDataClient({
    authClient: oauth2Client,
  });
}

// 이벤트별 적절한 item 메트릭 매핑
const EVENT_ITEM_METRICS: Record<string, string> = {
  'view_item': 'itemsViewed',
  'select_item': 'itemsClickedInList',
  'view_item_list': 'itemsViewedInList',
  'add_to_cart': 'itemsAddedToCart',
  'begin_checkout': 'itemsCheckedOut',
  'purchase': 'itemsPurchased',
  'view_promotion': 'itemsViewedInPromotion',
  'select_promotion': 'itemsClickedInPromotion',
};

/**
 * 특정 이벤트의 item 파라미터 수집 현황 조회
 */
async function verifyEventItemParameters(
  client: BetaAnalyticsDataClient,
  eventName: string
): Promise<VerificationResult> {
  const results: ItemParameterResult[] = [];
  const expectedParams = getExpectedItemParams(eventName);

  console.log(`\n🔍 ${eventName} 검증 중...`);

  // 이벤트에 맞는 item 메트릭 선택
  const itemMetric = EVENT_ITEM_METRICS[eventName] || 'itemsViewed';

  // 각 item dimension별로 조회
  for (const dimension of GA4_ITEM_DIMENSIONS) {
    const gtmKey = findGTMKeyByDimension(dimension);

    try {
      const [response] = await client.runReport({
        property: `properties/${GA4_PROPERTY_ID}`,
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [
          { name: dimension },
        ],
        metrics: [{ name: itemMetric }],
        orderBys: [{ metric: { metricName: itemMetric }, desc: true }],
        limit: 10,
      });

      if (response.rows && response.rows.length > 0) {
        // (not set) 제외한 실제 값 확인
        const validRows = response.rows.filter(
          (row: any) => row.dimensionValues?.[0]?.value !== '(not set)'
        );

        const sampleValue = validRows[0]?.dimensionValues?.[0]?.value || null;
        const validCount = validRows.reduce(
          (sum: number, row: any) => sum + parseInt(row.metricValues?.[0]?.value || '0', 10),
          0
        );

        results.push({
          eventName,
          dimension,
          gtmKey: gtmKey || '-',
          sampleValue,
          recordCount: validCount,
          status: validCount > 0 ? 'collected' : 'empty',
        });
      } else {
        results.push({
          eventName,
          dimension,
          gtmKey: gtmKey || '-',
          sampleValue: null,
          recordCount: 0,
          status: 'not_found',
        });
      }
    } catch (error: any) {
      // dimension을 지원하지 않는 경우 또는 호환되지 않는 경우
      if (error.message?.includes('not a valid dimension') || error.message?.includes('incompatible')) {
        results.push({
          eventName,
          dimension,
          gtmKey: gtmKey || '-',
          sampleValue: null,
          recordCount: 0,
          status: 'not_found',
        });
      } else {
        console.error(`   ⚠️ ${dimension} 조회 실패:`, error.message);
      }
    }
  }

  // 결과 분석
  const collectedParams = results.filter(r => r.status === 'collected');
  const emptyParams = results
    .filter(r => r.status === 'empty' && expectedParams.includes(r.gtmKey))
    .map(r => r.gtmKey);
  const missingParams = expectedParams.filter(
    p => !results.find(r => r.gtmKey === p && r.status === 'collected')
  );

  // 이벤트 전체 레코드 수 조회
  let totalRecords = 0;
  try {
    const [countResponse] = await client.runReport({
      property: `properties/${GA4_PROPERTY_ID}`,
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          stringFilter: { matchType: 'EXACT', value: eventName },
        },
      },
    });
    totalRecords = parseInt(countResponse.rows?.[0]?.metricValues?.[0]?.value || '0', 10);
  } catch {
    // ignore
  }

  const collectionRate = expectedParams.length > 0
    ? (collectedParams.filter(c => expectedParams.includes(c.gtmKey)).length / expectedParams.length) * 100
    : 0;

  return {
    eventName,
    totalRecords,
    collectedParams,
    missingParams,
    emptyParams,
    collectionRate,
  };
}

/**
 * GA4 dimension 이름으로 GTM 키 찾기
 */
function findGTMKeyByDimension(dimension: string): string | null {
  for (const [gtmKey, mapping] of Object.entries(ITEM_PARAMETER_GA4_MAPPING)) {
    if (mapping.ga4DimensionName === dimension) {
      return gtmKey;
    }
  }
  return null;
}

/**
 * 이벤트별 예상 item 파라미터 목록
 */
function getExpectedItemParams(eventName: string): string[] {
  return EVENT_ITEM_PARAMS[eventName] || [];
}

/**
 * 커스텀 item 파라미터 검증 (별도 쿼리 필요)
 */
async function verifyCustomItemParameters(
  client: BetaAnalyticsDataClient,
  eventName: string
): Promise<{ key: string; collected: boolean; sampleValue: string | null }[]> {
  const customParams = [
    'apg_brand_code',
    'original_price',
    'internal_brand_code',
    'item_beauty_acc',
    'is_giftprd',
  ];

  const results: { key: string; collected: boolean; sampleValue: string | null }[] = [];

  // 커스텀 item 파라미터는 GA4에서 customItem:파라미터명 으로 등록해야 조회 가능
  // 여기서는 등록 여부 안내만 제공
  for (const param of customParams) {
    results.push({
      key: param,
      collected: false, // GA4 커스텀 정의 필요
      sampleValue: null,
    });
  }

  return results;
}

/**
 * 결과 출력
 */
function printResults(results: VerificationResult[]): void {
  console.log('\n' + '═'.repeat(100));
  console.log('📊 GA4 Item 파라미터 수집 검증 결과');
  console.log('═'.repeat(100));

  for (const result of results) {
    console.log(`\n┌─ ${result.eventName} (총 ${result.totalRecords.toLocaleString()}건) ─┐`);
    console.log(`│ 수집률: ${result.collectionRate.toFixed(1)}%`);

    if (result.collectedParams.length > 0) {
      console.log('│');
      console.log('│ ✅ 수집 중인 파라미터:');
      console.log('│ ┌────────────────────┬──────────────────┬────────────────────┬──────────────┐');
      console.log('│ │ GTM Key            │ GA4 Dimension    │ Sample Value       │ Records      │');
      console.log('│ ├────────────────────┼──────────────────┼────────────────────┼──────────────┤');

      for (const param of result.collectedParams.filter(p => p.status === 'collected')) {
        const gtmKey = param.gtmKey.padEnd(18);
        const dimension = param.dimension.padEnd(16);
        const sample = (param.sampleValue || '-').substring(0, 18).padEnd(18);
        const count = param.recordCount.toLocaleString().padStart(12);
        console.log(`│ │ ${gtmKey} │ ${dimension} │ ${sample} │ ${count} │`);
      }
      console.log('│ └────────────────────┴──────────────────┴────────────────────┴──────────────┘');
    }

    if (result.missingParams.length > 0) {
      console.log('│');
      console.log('│ ❌ 미수집 파라미터 (GTM 설정 확인 필요):');
      console.log(`│    ${result.missingParams.join(', ')}`);
    }

    if (result.emptyParams.length > 0) {
      console.log('│');
      console.log('│ ⚠️ 값이 비어있는 파라미터:');
      console.log(`│    ${result.emptyParams.join(', ')}`);
    }

    console.log('└' + '─'.repeat(98) + '┘');
  }

  // 요약
  console.log('\n' + '═'.repeat(100));
  console.log('📋 요약');
  console.log('═'.repeat(100));

  const avgCollectionRate = results.reduce((sum, r) => sum + r.collectionRate, 0) / results.length;
  console.log(`\n평균 수집률: ${avgCollectionRate.toFixed(1)}%`);

  const allMissing = [...new Set(results.flatMap(r => r.missingParams))];
  if (allMissing.length > 0) {
    console.log(`\n전체 미수집 파라미터 (${allMissing.length}개):`);
    console.log(`  ${allMissing.join(', ')}`);
  }

  // 커스텀 파라미터 안내
  console.log('\n📌 커스텀 Item 파라미터 안내:');
  console.log('   GA4에서 커스텀 item 파라미터를 조회하려면 다음 설정이 필요합니다:');
  console.log('   1. GA4 관리 > 속성 설정 > 데이터 표시 > 맞춤 정의 > 맞춤 측정기준');
  console.log('   2. "새 맞춤 측정기준" 클릭');
  console.log('   3. 범위: "항목" 선택');
  console.log('   4. 다음 파라미터 등록:');
  console.log('      - apg_brand_code (APG 브랜드 코드)');
  console.log('      - original_price (원가)');
  console.log('      - internal_brand_code (내부 브랜드 코드)');
  console.log('      - item_beauty_acc (뷰티포인트 적립) - purchase 이벤트');
  console.log('      - is_giftprd (사은품 여부) - purchase 이벤트');
}

/**
 * JSON 결과 저장
 */
function saveResults(results: VerificationResult[]): void {
  const output = {
    verifiedAt: new Date().toISOString(),
    propertyId: GA4_PROPERTY_ID,
    dateRange: '30daysAgo ~ today',
    results: results.map(r => ({
      eventName: r.eventName,
      totalRecords: r.totalRecords,
      collectionRate: r.collectionRate,
      collectedParams: r.collectedParams.map(p => ({
        gtmKey: p.gtmKey,
        ga4Dimension: p.dimension,
        sampleValue: p.sampleValue,
        recordCount: p.recordCount,
      })),
      missingParams: r.missingParams,
      emptyParams: r.emptyParams,
    })),
  };

  fs.writeFileSync(
    './output/item_parameter_verification.json',
    JSON.stringify(output, null, 2)
  );
  console.log('\n✅ 결과 저장됨: ./output/item_parameter_verification.json');
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     GA4 Item 파라미터 수집 검증                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const client = await createGA4Client();
  const results: VerificationResult[] = [];

  for (const eventName of ECOMMERCE_EVENTS) {
    try {
      const result = await verifyEventItemParameters(client, eventName);
      results.push(result);
    } catch (error: any) {
      console.error(`❌ ${eventName} 검증 실패:`, error.message);
    }
  }

  printResults(results);
  saveResults(results);
}

main().catch(console.error);
