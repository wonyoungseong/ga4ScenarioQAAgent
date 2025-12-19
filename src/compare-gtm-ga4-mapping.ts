/**
 * GTM 파라미터 vs GA4 Custom Dimension 매핑 비교
 */

import * as fs from 'fs';
import { GA4Client } from './ga4/ga4Client';
import { extractParamsFromGTM } from './parsers/paramMappingParser';

const PROPERTY_ID = '416629733';
const GTM_PATH = './GTM-5FK5X5C4_workspace112.json';

async function main() {
  console.log('='.repeat(120));
  console.log(' GTM 파라미터 vs GA4 Custom Dimension 매핑 비교');
  console.log('='.repeat(120));

  // 1. GTM에서 파라미터 추출
  console.log('\n📌 1. GTM JSON에서 파라미터 추출\n');
  const gtmParams = extractParamsFromGTM(GTM_PATH);

  console.log(`  Event Parameters: ${gtmParams.eventParams.length}개`);
  console.log(`  User Properties: ${gtmParams.userProperties.length}개`);
  console.log(`  총합: ${gtmParams.eventParams.length + gtmParams.userProperties.length}개`);

  // 2. GA4에서 Custom Dimensions 조회
  console.log('\n📌 2. GA4 Custom Dimensions 조회\n');

  const tokenPath = './credentials/ga4_tokens.json';
  if (!fs.existsSync(tokenPath)) {
    console.log('❌ GA4 토큰이 없습니다.');
    return;
  }

  const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
  const ga4 = new GA4Client({ propertyId: PROPERTY_ID, accessToken: tokens.access_token });
  await ga4.initialize();

  const client = (ga4 as any).client;
  const [metadata] = await client.getMetadata({
    name: `properties/${PROPERTY_ID}/metadata`,
  });

  // Custom Dimensions 추출
  const customEventDims: Set<string> = new Set(
    (metadata.dimensions || [])
      .filter((d: any) => d.apiName?.startsWith('customEvent:'))
      .map((d: any) => d.apiName.replace('customEvent:', ''))
  );

  const customUserDims: Set<string> = new Set(
    (metadata.dimensions || [])
      .filter((d: any) => d.apiName?.startsWith('customUser:'))
      .map((d: any) => d.apiName.replace('customUser:', ''))
  );

  console.log(`  Event-scoped Custom Dimensions: ${customEventDims.size}개`);
  console.log(`  User-scoped Custom Dimensions: ${customUserDims.size}개`);

  // 3. 매핑 비교 - Event Parameters
  console.log('\n\n' + '='.repeat(120));
  console.log(' Event Parameters 매핑 상태');
  console.log('='.repeat(120));

  const eventMapped: string[] = [];
  const eventNotMapped: string[] = [];

  console.log('\n| # | GTM 파라미터 | GA4 등록 | API Dimension Name |');
  console.log('|---|--------------|----------|-------------------|');

  let idx = 1;
  for (const param of gtmParams.eventParams) {
    const isMapped = customEventDims.has(param.name);
    const status = isMapped ? '✅' : '❌';
    const apiName = isMapped ? `customEvent:${param.name}` : '(미등록)';

    if (isMapped) {
      eventMapped.push(param.name);
    } else {
      eventNotMapped.push(param.name);
    }

    console.log(`| ${idx.toString().padStart(2)} | ${param.name.padEnd(25)} | ${status}       | ${apiName.padEnd(35)} |`);
    idx++;
  }

  // 4. 매핑 비교 - User Properties
  console.log('\n\n' + '='.repeat(120));
  console.log(' User Properties 매핑 상태');
  console.log('='.repeat(120));

  const userMapped: string[] = [];
  const userNotMapped: string[] = [];

  console.log('\n| # | GTM 파라미터 | GA4 등록 | API Dimension Name |');
  console.log('|---|--------------|----------|-------------------|');

  idx = 1;
  for (const param of gtmParams.userProperties) {
    const isMapped = customUserDims.has(param.name);
    const status = isMapped ? '✅' : '❌';
    const apiName = isMapped ? `customUser:${param.name}` : '(미등록)';

    if (isMapped) {
      userMapped.push(param.name);
    } else {
      userNotMapped.push(param.name);
    }

    console.log(`| ${idx.toString().padStart(2)} | ${param.name.padEnd(25)} | ${status}       | ${apiName.padEnd(35)} |`);
    idx++;
  }

  // 5. 요약
  console.log('\n\n' + '='.repeat(120));
  console.log(' 요약');
  console.log('='.repeat(120));

  const totalGtm = gtmParams.eventParams.length + gtmParams.userProperties.length;
  const totalMapped = eventMapped.length + userMapped.length;
  const totalNotMapped = eventNotMapped.length + userNotMapped.length;

  console.log(`
📊 전체 현황:
   - GTM 파라미터 총 개수: ${totalGtm}개
   - GA4에 등록됨 (API 조회 가능): ${totalMapped}개
   - GA4에 미등록 (API 조회 불가): ${totalNotMapped}개
   - 매핑률: ${((totalMapped / totalGtm) * 100).toFixed(1)}%
`);

  if (eventNotMapped.length > 0) {
    console.log('❌ Event Parameters 미등록 목록:');
    for (const p of eventNotMapped) {
      console.log(`   - ${p}`);
    }
  }

  if (userNotMapped.length > 0) {
    console.log('\n❌ User Properties 미등록 목록:');
    for (const p of userNotMapped) {
      console.log(`   - ${p}`);
    }
  }

  // GA4에는 있지만 GTM에 없는 것들
  console.log('\n\n' + '='.repeat(120));
  console.log(' GA4에만 등록된 Custom Dimensions (GTM에서 미사용)');
  console.log('='.repeat(120));

  const gtmEventParamNames = new Set(gtmParams.eventParams.map(p => p.name));
  const gtmUserPropNames = new Set(gtmParams.userProperties.map(p => p.name));

  const ga4OnlyEvent = Array.from(customEventDims).filter((d: string) => !gtmEventParamNames.has(d));
  const ga4OnlyUser = Array.from(customUserDims).filter((d: string) => !gtmUserPropNames.has(d));

  if (ga4OnlyEvent.length > 0) {
    console.log(`\nEvent-scoped (${ga4OnlyEvent.length}개):`);
    for (const p of ga4OnlyEvent.slice(0, 20)) {
      console.log(`   - customEvent:${p}`);
    }
    if (ga4OnlyEvent.length > 20) {
      console.log(`   ... 외 ${ga4OnlyEvent.length - 20}개`);
    }
  }

  if (ga4OnlyUser.length > 0) {
    console.log(`\nUser-scoped (${ga4OnlyUser.length}개):`);
    for (const p of ga4OnlyUser) {
      console.log(`   - customUser:${p}`);
    }
  }

  // 표준 Dimension으로 대체 가능한 것들
  console.log('\n\n' + '='.repeat(120));
  console.log(' 참고: 표준 Dimension으로 조회 가능한 파라미터');
  console.log('='.repeat(120));

  console.log(`
다음 파라미터들은 표준 Dimension으로도 조회 가능합니다:

| GTM 파라미터 | 표준 GA4 Dimension | Custom Dimension |
|-------------|-------------------|------------------|
| content_group | contentGroup | customEvent:content_group (미등록) |
| page_referrer | pageReferrer | - |
| page_location_* | pageLocation | - |

⚠️ content_group은 GA4 기본 설정에서 Content Group으로 자동 매핑됩니다.
   따라서 customEvent:content_group 등록 없이도 contentGroup으로 조회 가능합니다.
`);
}

main().catch(console.error);
