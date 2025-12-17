/**
 * Edge Case 관리 CLI
 *
 * 사용법:
 *   npx ts-node src/manage-edge-cases.ts list [propertyId]
 *   npx ts-node src/manage-edge-cases.ts add <propertyId> <eventName> <type> <description>
 *   npx ts-node src/manage-edge-cases.ts check <propertyId> <eventName> <pageType>
 */

import { edgeCaseLoader, EdgeCaseType, EdgeCase, SiteEdgeCaseConfig } from './config/siteEdgeCases';

const args = process.argv.slice(2);
const command = args[0];

function printUsage() {
  console.log(`
Edge Case 관리 CLI

사용법:
  npx ts-node src/manage-edge-cases.ts <command> [options]

Commands:
  list [propertyId]                    모든 Edge Case 또는 특정 Property의 Edge Case 조회
  check <propertyId> <eventName> <pageType>  이벤트가 해당 페이지에서 허용되는지 확인
  init <propertyId> <siteName> <domain>      새 사이트 설정 초기화
  add <propertyId> <eventName>               대화형으로 Edge Case 추가

Examples:
  npx ts-node src/manage-edge-cases.ts list
  npx ts-node src/manage-edge-cases.ts list 416629733
  npx ts-node src/manage-edge-cases.ts check 416629733 sign_up MAIN
  npx ts-node src/manage-edge-cases.ts init 416629733 "아모레몰 KR" amoremall.com
`);
}

async function main() {
  switch (command) {
    case 'list':
      listEdgeCases(args[1]);
      break;

    case 'check':
      checkEventOnPage(args[1], args[2], args[3]);
      break;

    case 'init':
      initSiteConfig(args[1], args[2], args[3]);
      break;

    case 'add':
      await addEdgeCaseInteractive(args[1], args[2]);
      break;

    default:
      printUsage();
  }
}

function listEdgeCases(propertyId?: string) {
  edgeCaseLoader.printSummary(propertyId);
}

function checkEventOnPage(propertyId: string, eventName: string, pageType: string) {
  if (!propertyId || !eventName || !pageType) {
    console.error('❌ propertyId, eventName, pageType 모두 필요합니다.');
    return;
  }

  console.log(`\n🔍 이벤트 허용 여부 확인`);
  console.log(`   Property: ${propertyId}`);
  console.log(`   Event: ${eventName}`);
  console.log(`   Page Type: ${pageType}\n`);

  // Edge Case 확인
  const edgeCase = edgeCaseLoader.getEventEdgeCase(propertyId, eventName);

  if (edgeCase) {
    console.log(`📌 Edge Case 발견:`);
    console.log(`   Type: ${edgeCase.type}`);
    console.log(`   Description: ${edgeCase.description}`);
    if (edgeCase.allowedPageTypes) {
      console.log(`   Allowed Pages: ${edgeCase.allowedPageTypes.join(', ')}`);
    }
    if (edgeCase.excludedPageTypes) {
      console.log(`   Excluded Pages: ${edgeCase.excludedPageTypes.join(', ')}`);
    }
    console.log('');
  }

  // 허용 여부 확인
  const result = edgeCaseLoader.isEventAllowedOnPage(propertyId, eventName, pageType, true);
  console.log(`📋 결과: ${result.allowed ? '✅ 허용' : '❌ 비허용'}`);
  console.log(`   이유: ${result.reason}`);

  // 노이즈 예상 여부
  const noise = edgeCaseLoader.isNoiseExpected(propertyId, eventName, pageType);
  if (noise.expected) {
    console.log(`\n🔇 노이즈 예상:`);
    console.log(`   예상 비중: ${noise.maxPercent}% 이하`);
    console.log(`   이유: ${noise.reason}`);
  }
}

function initSiteConfig(propertyId: string, siteName: string, domain: string) {
  if (!propertyId || !siteName || !domain) {
    console.error('❌ propertyId, siteName, domain 모두 필요합니다.');
    return;
  }

  const config: SiteEdgeCaseConfig = {
    propertyId,
    siteName,
    domain,
    edgeCases: [],
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: '1.0.0',
    },
  };

  edgeCaseLoader.saveSiteConfig(config);
  console.log(`\n✅ 사이트 설정 초기화 완료: ${siteName} (${propertyId})`);
}

async function addEdgeCaseInteractive(propertyId: string, eventName: string) {
  if (!propertyId || !eventName) {
    console.error('❌ propertyId와 eventName이 필요합니다.');
    return;
  }

  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (question: string): Promise<string> => {
    return new Promise(resolve => {
      rl.question(question, resolve);
    });
  };

  console.log(`\n📝 Edge Case 추가: ${eventName} (Property: ${propertyId})\n`);

  const typeOptions = [
    'PAGE_RESTRICTION',
    'PAGE_EXCLUSION',
    'CONDITIONAL_FIRE',
    'CUSTOM_TRIGGER',
    'DATA_LAYER_ALIAS',
    'NOISE_EXPECTED',
    'NOT_IMPLEMENTED',
    'DEPRECATED',
  ];

  console.log('Edge Case 타입:');
  typeOptions.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));

  const typeIdx = parseInt(await ask('\n타입 번호 선택: ')) - 1;
  const type = typeOptions[typeIdx] as EdgeCaseType;

  const description = await ask('설명: ');

  let allowedPageTypes: string[] | undefined;
  let excludedPageTypes: string[] | undefined;
  let expectedNoisePercent: number | undefined;

  if (type === 'PAGE_RESTRICTION') {
    const pages = await ask('허용 페이지 타입 (쉼표 구분): ');
    allowedPageTypes = pages.split(',').map(p => p.trim().toUpperCase());
  } else if (type === 'PAGE_EXCLUSION') {
    const pages = await ask('제외 페이지 타입 (쉼표 구분): ');
    excludedPageTypes = pages.split(',').map(p => p.trim().toUpperCase());
  } else if (type === 'NOISE_EXPECTED') {
    const percent = await ask('예상 노이즈 비중 (%): ');
    expectedNoisePercent = parseFloat(percent);
  }

  const source = await ask('출처 (예: GA4 분석, 개발가이드 등): ');

  const edgeCase: EdgeCase = {
    eventName,
    type,
    description,
    allowedPageTypes,
    excludedPageTypes,
    expectedNoisePercent,
    createdAt: new Date().toISOString().split('T')[0],
    source,
  };

  edgeCaseLoader.addEdgeCase(propertyId, edgeCase);
  console.log(`\n✅ Edge Case 추가 완료!`);

  rl.close();
}

main().catch(console.error);
