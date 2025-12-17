/**
 * GA4 맞춤 측정기준(Custom Dimensions) 등록 현황 조회
 *
 * GA4 Admin API를 사용하여 등록된 맞춤 측정기준을 확인합니다.
 * - 이벤트 범위 (event scope)
 * - 항목 범위 (item scope)
 * - 사용자 범위 (user scope)
 *
 * 사용법: npx ts-node src/check-ga4-custom-dimensions.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { AnalyticsAdminServiceClient } from '@google-analytics/admin';
import { OAuth2Client } from 'google-auth-library';

dotenv.config();

const GA4_PROPERTY_ID = '416629733';
const TOKEN_PATH = './credentials/ga4_tokens.json';

interface CustomDimension {
  name: string;
  parameterName: string;
  displayName: string;
  description: string;
  scope: string;
  disallowAdsPersonalization: boolean;
}

interface CustomMetric {
  name: string;
  parameterName: string;
  displayName: string;
  description: string;
  scope: string;
  measurementUnit: string;
}

async function createAdminClient(): Promise<AnalyticsAdminServiceClient> {
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

  return new AnalyticsAdminServiceClient({
    authClient: oauth2Client,
  });
}

/**
 * 맞춤 측정기준 목록 조회
 */
async function listCustomDimensions(client: AnalyticsAdminServiceClient): Promise<CustomDimension[]> {
  const dimensions: CustomDimension[] = [];

  try {
    const [response] = await client.listCustomDimensions({
      parent: `properties/${GA4_PROPERTY_ID}`,
    });

    for (const dimension of response || []) {
      dimensions.push({
        name: dimension.name || '',
        parameterName: dimension.parameterName || '',
        displayName: dimension.displayName || '',
        description: dimension.description || '',
        scope: String(dimension.scope || ''),
        disallowAdsPersonalization: dimension.disallowAdsPersonalization || false,
      });
    }
  } catch (error: any) {
    console.error('❌ 맞춤 측정기준 조회 실패:', error.message);
  }

  return dimensions;
}

/**
 * 맞춤 측정항목 목록 조회
 */
async function listCustomMetrics(client: AnalyticsAdminServiceClient): Promise<CustomMetric[]> {
  const metrics: CustomMetric[] = [];

  try {
    const [response] = await client.listCustomMetrics({
      parent: `properties/${GA4_PROPERTY_ID}`,
    });

    for (const metric of response || []) {
      metrics.push({
        name: metric.name || '',
        parameterName: metric.parameterName || '',
        displayName: metric.displayName || '',
        description: metric.description || '',
        scope: String(metric.scope || ''),
        measurementUnit: String(metric.measurementUnit || ''),
      });
    }
  } catch (error: any) {
    console.error('❌ 맞춤 측정항목 조회 실패:', error.message);
  }

  return metrics;
}

/**
 * 결과 출력
 */
function printResults(dimensions: CustomDimension[], metrics: CustomMetric[]): void {
  console.log('\n' + '═'.repeat(100));
  console.log('📊 GA4 맞춤 측정기준 등록 현황');
  console.log('═'.repeat(100));

  // 범위별 분류
  const eventScopeDimensions = dimensions.filter(d => d.scope === 'EVENT');
  const itemScopeDimensions = dimensions.filter(d => d.scope === 'ITEM');
  const userScopeDimensions = dimensions.filter(d => d.scope === 'USER');

  // 이벤트 범위 측정기준
  console.log(`\n📌 이벤트 범위 맞춤 측정기준 (${eventScopeDimensions.length}개)`);
  if (eventScopeDimensions.length > 0) {
    console.log('┌────────────────────────────┬────────────────────────────┬────────────────────────────┐');
    console.log('│ Parameter Name             │ Display Name               │ Description                │');
    console.log('├────────────────────────────┼────────────────────────────┼────────────────────────────┤');
    for (const d of eventScopeDimensions) {
      const param = d.parameterName.padEnd(26);
      const display = d.displayName.substring(0, 26).padEnd(26);
      const desc = (d.description || '-').substring(0, 26).padEnd(26);
      console.log(`│ ${param} │ ${display} │ ${desc} │`);
    }
    console.log('└────────────────────────────┴────────────────────────────┴────────────────────────────┘');
  } else {
    console.log('   (등록된 측정기준 없음)');
  }

  // 항목 범위 측정기준
  console.log(`\n📌 항목 범위 맞춤 측정기준 (${itemScopeDimensions.length}개)`);
  if (itemScopeDimensions.length > 0) {
    console.log('┌────────────────────────────┬────────────────────────────┬────────────────────────────┐');
    console.log('│ Parameter Name             │ Display Name               │ Description                │');
    console.log('├────────────────────────────┼────────────────────────────┼────────────────────────────┤');
    for (const d of itemScopeDimensions) {
      const param = d.parameterName.padEnd(26);
      const display = d.displayName.substring(0, 26).padEnd(26);
      const desc = (d.description || '-').substring(0, 26).padEnd(26);
      console.log(`│ ${param} │ ${display} │ ${desc} │`);
    }
    console.log('└────────────────────────────┴────────────────────────────┴────────────────────────────┘');
  } else {
    console.log('   (등록된 측정기준 없음)');
  }

  // 사용자 범위 측정기준
  console.log(`\n📌 사용자 범위 맞춤 측정기준 (${userScopeDimensions.length}개)`);
  if (userScopeDimensions.length > 0) {
    console.log('┌────────────────────────────┬────────────────────────────┬────────────────────────────┐');
    console.log('│ Parameter Name             │ Display Name               │ Description                │');
    console.log('├────────────────────────────┼────────────────────────────┼────────────────────────────┤');
    for (const d of userScopeDimensions) {
      const param = d.parameterName.padEnd(26);
      const display = d.displayName.substring(0, 26).padEnd(26);
      const desc = (d.description || '-').substring(0, 26).padEnd(26);
      console.log(`│ ${param} │ ${display} │ ${desc} │`);
    }
    console.log('└────────────────────────────┴────────────────────────────┴────────────────────────────┘');
  } else {
    console.log('   (등록된 측정기준 없음)');
  }

  // 맞춤 측정항목
  console.log(`\n📌 맞춤 측정항목 (${metrics.length}개)`);
  if (metrics.length > 0) {
    console.log('┌────────────────────────────┬────────────────────────────┬──────────────┬──────────────┐');
    console.log('│ Parameter Name             │ Display Name               │ Scope        │ Unit         │');
    console.log('├────────────────────────────┼────────────────────────────┼──────────────┼──────────────┤');
    for (const m of metrics) {
      const param = m.parameterName.padEnd(26);
      const display = m.displayName.substring(0, 26).padEnd(26);
      const scope = m.scope.padEnd(12);
      const unit = (m.measurementUnit || '-').padEnd(12);
      console.log(`│ ${param} │ ${display} │ ${scope} │ ${unit} │`);
    }
    console.log('└────────────────────────────┴────────────────────────────┴──────────────┴──────────────┘');
  } else {
    console.log('   (등록된 측정항목 없음)');
  }
}

/**
 * 결과 저장
 */
function saveResults(dimensions: CustomDimension[], metrics: CustomMetric[]): void {
  const output = {
    checkedAt: new Date().toISOString(),
    propertyId: GA4_PROPERTY_ID,
    customDimensions: {
      total: dimensions.length,
      eventScope: dimensions.filter(d => d.scope === 'EVENT'),
      itemScope: dimensions.filter(d => d.scope === 'ITEM'),
      userScope: dimensions.filter(d => d.scope === 'USER'),
    },
    customMetrics: metrics,
  };

  fs.writeFileSync(
    './output/ga4_custom_definitions.json',
    JSON.stringify(output, null, 2)
  );
  console.log('\n✅ 결과 저장됨: ./output/ga4_custom_definitions.json');
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     GA4 맞춤 측정기준 등록 현황 조회                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n속성 ID: ${GA4_PROPERTY_ID}`);

  const client = await createAdminClient();

  console.log('\n조회 중...');
  const dimensions = await listCustomDimensions(client);
  const metrics = await listCustomMetrics(client);

  printResults(dimensions, metrics);
  saveResults(dimensions, metrics);
}

main().catch(console.error);
