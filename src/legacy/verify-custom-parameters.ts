/**
 * GTM 커스텀 파라미터 vs GA4 맞춤 측정기준 검증
 *
 * 1. GTM JSON에서 커스텀 파라미터 동적 추출
 * 2. GA4 Admin API에서 등록된 맞춤 측정기준 조회
 * 3. 비교하여 누락된 파라미터 식별
 *
 * 사용법: npx ts-node src/verify-custom-parameters.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { AnalyticsAdminServiceClient } from '@google-analytics/admin';
import { OAuth2Client } from 'google-auth-library';
import { GTMEventParameterExtractor, createDefaultGTMEventParameterExtractor } from './config/gtmEventParameterExtractor';

dotenv.config();

const GA4_PROPERTY_ID = '416629733';
const TOKEN_PATH = './credentials/ga4_tokens.json';

interface GA4CustomDefinition {
  parameterName: string;
  displayName: string;
  scope: string;
}

interface VerificationResult {
  category: string;
  gtmParams: string[];
  ga4Registered: string[];
  missing: string[];
  registered: string[];
  extra: string[];  // GA4에는 있지만 GTM에 없는 것
}

async function createAdminClient(): Promise<AnalyticsAdminServiceClient> {
  if (!fs.existsSync(TOKEN_PATH)) {
    console.error('❌ GA4 토큰 파일이 없습니다:', TOKEN_PATH);
    process.exit(1);
  }

  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  const oauth2Client = new OAuth2Client();
  oauth2Client.setCredentials({ access_token: tokens.access_token });

  return new AnalyticsAdminServiceClient({ authClient: oauth2Client });
}

/**
 * GA4 맞춤 측정기준 조회
 */
async function getGA4CustomDimensions(client: AnalyticsAdminServiceClient): Promise<GA4CustomDefinition[]> {
  const dimensions: GA4CustomDefinition[] = [];

  try {
    const [response] = await client.listCustomDimensions({
      parent: `properties/${GA4_PROPERTY_ID}`,
    });

    for (const dim of response || []) {
      dimensions.push({
        parameterName: dim.parameterName || '',
        displayName: dim.displayName || '',
        scope: String(dim.scope || ''),
      });
    }
  } catch (error: any) {
    console.error('❌ GA4 맞춤 측정기준 조회 실패:', error.message);
  }

  return dimensions;
}

/**
 * GA4 맞춤 측정항목 조회
 */
async function getGA4CustomMetrics(client: AnalyticsAdminServiceClient): Promise<GA4CustomDefinition[]> {
  const metrics: GA4CustomDefinition[] = [];

  try {
    const [response] = await client.listCustomMetrics({
      parent: `properties/${GA4_PROPERTY_ID}`,
    });

    for (const metric of response || []) {
      metrics.push({
        parameterName: metric.parameterName || '',
        displayName: metric.displayName || '',
        scope: String(metric.scope || ''),
      });
    }
  } catch (error: any) {
    console.error('❌ GA4 맞춤 측정항목 조회 실패:', error.message);
  }

  return metrics;
}

/**
 * 검증 실행
 */
async function verify(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     GTM 커스텀 파라미터 vs GA4 맞춤 측정기준 검증          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  // 1. GTM에서 커스텀 파라미터 추출
  console.log('\n📦 GTM JSON 분석 중...');
  const gtmExtractor = createDefaultGTMEventParameterExtractor();
  const allEvents = gtmExtractor.extractAllEvents();
  const gtmCustomEventParams = gtmExtractor.getAllCustomEventParameters();
  const gtmCustomItemParams = gtmExtractor.getAllCustomItemParameters();

  console.log(`   - 총 이벤트: ${allEvents.length}개`);
  console.log(`   - 커스텀 Event 파라미터: ${gtmCustomEventParams.length}개`);
  console.log(`   - 커스텀 Item 파라미터: ${gtmCustomItemParams.length}개`);

  // 2. GA4에서 맞춤 측정기준/측정항목 조회
  console.log('\n🔍 GA4 맞춤 측정기준 조회 중...');
  const adminClient = await createAdminClient();
  const ga4Dimensions = await getGA4CustomDimensions(adminClient);
  const ga4Metrics = await getGA4CustomMetrics(adminClient);

  const ga4EventDimensions = ga4Dimensions.filter(d => d.scope === 'EVENT');
  const ga4ItemDimensions = ga4Dimensions.filter(d => d.scope === 'ITEM');
  const ga4EventMetrics = ga4Metrics.filter(m => m.scope === 'EVENT');

  console.log(`   - Event 범위 측정기준: ${ga4EventDimensions.length}개`);
  console.log(`   - Item 범위 측정기준: ${ga4ItemDimensions.length}개`);
  console.log(`   - Event 범위 측정항목: ${ga4EventMetrics.length}개`);

  // 3. 비교 분석
  console.log('\n' + '═'.repeat(100));
  console.log('📊 비교 분석 결과');
  console.log('═'.repeat(100));

  // Event 범위 커스텀 파라미터 비교
  const ga4EventParamNames = new Set([
    ...ga4EventDimensions.map(d => d.parameterName),
    ...ga4EventMetrics.map(m => m.parameterName),
  ]);

  const eventResult: VerificationResult = {
    category: 'Event 범위 커스텀 파라미터',
    gtmParams: gtmCustomEventParams,
    ga4Registered: Array.from(ga4EventParamNames),
    missing: gtmCustomEventParams.filter(p => !ga4EventParamNames.has(p)),
    registered: gtmCustomEventParams.filter(p => ga4EventParamNames.has(p)),
    extra: Array.from(ga4EventParamNames).filter(p => !gtmCustomEventParams.includes(p)),
  };

  // Item 범위 커스텀 파라미터 비교
  const ga4ItemParamNames = new Set(ga4ItemDimensions.map(d => d.parameterName));

  const itemResult: VerificationResult = {
    category: 'Item 범위 커스텀 파라미터',
    gtmParams: gtmCustomItemParams,
    ga4Registered: Array.from(ga4ItemParamNames),
    missing: gtmCustomItemParams.filter(p => !ga4ItemParamNames.has(p)),
    registered: gtmCustomItemParams.filter(p => ga4ItemParamNames.has(p)),
    extra: Array.from(ga4ItemParamNames).filter(p => !gtmCustomItemParams.includes(p)),
  };

  // 결과 출력
  printResult(eventResult);
  printResult(itemResult);

  // 이벤트별 상세 파라미터 출력
  console.log('\n' + '═'.repeat(100));
  console.log('📌 이벤트별 파라미터 상세');
  console.log('═'.repeat(100));

  for (const event of allEvents.slice(0, 10)) {  // 처음 10개만 출력
    if (event.eventParameters.length > 0 || event.itemParameters.length > 0) {
      console.log(`\n┌─ ${event.eventName} ─┐`);

      const customEventParams = event.eventParameters.filter(p => !p.isStandard);
      if (customEventParams.length > 0) {
        console.log('│ 커스텀 Event 파라미터:');
        for (const param of customEventParams) {
          const registered = ga4EventParamNames.has(param.key) ? '✅' : '❌';
          console.log(`│   ${registered} ${param.key}`);
        }
      }

      const customItemParams = event.itemParameters.filter(p => !p.isStandard);
      if (customItemParams.length > 0) {
        console.log('│ 커스텀 Item 파라미터:');
        for (const param of customItemParams) {
          const registered = ga4ItemParamNames.has(param.key) ? '✅' : '❌';
          console.log(`│   ${registered} ${param.key}`);
        }
      }

      console.log('└' + '─'.repeat(50) + '┘');
    }
  }

  // 요약
  console.log('\n' + '═'.repeat(100));
  console.log('📋 요약');
  console.log('═'.repeat(100));

  const totalMissing = eventResult.missing.length + itemResult.missing.length;
  const totalRegistered = eventResult.registered.length + itemResult.registered.length;

  console.log(`\n✅ 등록 완료: ${totalRegistered}개`);
  console.log(`❌ 미등록: ${totalMissing}개`);

  if (totalMissing > 0) {
    console.log('\n⚠️ GA4에 등록이 필요한 커스텀 파라미터:');

    if (eventResult.missing.length > 0) {
      console.log('\n  [Event 범위 측정기준/측정항목으로 등록]');
      for (const param of eventResult.missing) {
        console.log(`    - ${param}`);
      }
    }

    if (itemResult.missing.length > 0) {
      console.log('\n  [Item 범위 측정기준으로 등록]');
      for (const param of itemResult.missing) {
        console.log(`    - ${param}`);
      }
    }
  }

  // 결과 저장
  saveResults(eventResult, itemResult, allEvents);
}

function printResult(result: VerificationResult): void {
  console.log(`\n┌─ ${result.category} ─┐`);
  console.log(`│ GTM에서 추출: ${result.gtmParams.length}개`);
  console.log(`│ GA4에 등록: ${result.ga4Registered.length}개`);

  if (result.registered.length > 0) {
    console.log('│');
    console.log('│ ✅ 등록 완료:');
    console.log(`│    ${result.registered.join(', ')}`);
  }

  if (result.missing.length > 0) {
    console.log('│');
    console.log('│ ❌ 미등록 (GA4 등록 필요):');
    console.log(`│    ${result.missing.join(', ')}`);
  }

  if (result.extra.length > 0) {
    console.log('│');
    console.log('│ ⚠️ GA4에만 있음 (GTM에서 미사용):');
    console.log(`│    ${result.extra.join(', ')}`);
  }

  console.log('└' + '─'.repeat(60) + '┘');
}

function saveResults(
  eventResult: VerificationResult,
  itemResult: VerificationResult,
  allEvents: any[]
): void {
  const output = {
    verifiedAt: new Date().toISOString(),
    propertyId: GA4_PROPERTY_ID,
    summary: {
      eventParams: {
        gtmCount: eventResult.gtmParams.length,
        ga4Count: eventResult.ga4Registered.length,
        registered: eventResult.registered.length,
        missing: eventResult.missing.length,
      },
      itemParams: {
        gtmCount: itemResult.gtmParams.length,
        ga4Count: itemResult.ga4Registered.length,
        registered: itemResult.registered.length,
        missing: itemResult.missing.length,
      },
    },
    eventParamResult: eventResult,
    itemParamResult: itemResult,
    eventDetails: allEvents,
  };

  fs.writeFileSync(
    './output/custom_parameter_verification.json',
    JSON.stringify(output, null, 2)
  );
  console.log('\n✅ 결과 저장됨: ./output/custom_parameter_verification.json');
}

verify().catch(console.error);
