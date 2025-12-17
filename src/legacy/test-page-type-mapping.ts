/**
 * 페이지 타입 매핑 테스트
 *
 * 1. 공통 변수 appendix.pdf에서 페이지 타입 정의 파싱
 * 2. GTM Content Group lookup table 추출
 * 3. 두 정의 비교하여 불일치 감지
 */

import { GTMPageMappingExtractor } from './analyzers/gtmPageMappingExtractor';
import {
  parseDefaultAppendix,
  comparePageTypeMappings,
  PageTypeDefinition
} from './parsers/developmentGuideParser';

const GTM_JSON_PATH = './GTM-5FK5X5C4_workspace112.json';

async function main() {
  console.log('=== 페이지 타입 매핑 테스트 ===\n');

  // 1. 공통 변수 appendix.pdf에서 페이지 타입 정의 파싱
  console.log('【1. 공통 변수 appendix.pdf 파싱】');
  console.log('-'.repeat(60));

  const appendixResult = await parseDefaultAppendix();
  console.log(`파싱된 페이지 타입: ${appendixResult.pageTypes.length}개\n`);

  for (const pt of appendixResult.pageTypes) {
    const reqIcon = pt.note === 'required' ? '🔴' : '🟡';
    console.log(`${reqIcon} ${pt.pageType}: ${pt.description}`);
  }

  // 2. GTM Content Group lookup table 추출
  console.log('\n\n【2. GTM Content Group Lookup Table 추출】');
  console.log('-'.repeat(60));

  const extractor = new GTMPageMappingExtractor(GTM_JSON_PATH);
  const gtmLookupTable = extractor.extractContentGroupLookupTable();

  console.log(`GTM에 정의된 매핑: ${gtmLookupTable.size}개\n`);
  console.log('AP_DATA_PAGETYPE → Content Group:');

  for (const [key, value] of gtmLookupTable) {
    console.log(`  "${key}" → "${value}"`);
  }

  const gtmDefinedTypes = extractor.getDefinedPageTypesInGTM();
  console.log(`\nGTM에 정의된 페이지 타입: ${gtmDefinedTypes.join(', ')}`);

  // 3. appendix 정의와 GTM 매핑 비교
  console.log('\n\n【3. Appendix vs GTM 비교】');
  console.log('-'.repeat(60));

  const mismatches = comparePageTypeMappings(appendixResult.pageTypes, gtmLookupTable);

  if (mismatches.length === 0) {
    console.log('✅ Appendix와 GTM 매핑이 완전히 일치합니다!');
  } else {
    console.log(`⚠️  ${mismatches.length}개 불일치 발견:\n`);

    const appendixOnly = mismatches.filter(m => m.inAppendix && !m.inGTM);
    const gtmOnly = mismatches.filter(m => !m.inAppendix && m.inGTM);

    if (appendixOnly.length > 0) {
      console.log('📄 Appendix에만 있는 페이지 타입:');
      for (const m of appendixOnly) {
        console.log(`  - ${m.pageType}: ${m.appendixDescription || ''}`);
      }
      console.log('');
    }

    if (gtmOnly.length > 0) {
      console.log('🏷️  GTM에만 있는 페이지 타입:');
      for (const m of gtmOnly) {
        console.log(`  - ${m.pageType} (from: "${m.gtmMappedFrom}")`);
      }
    }
  }

  // 4. 실제 페이지 AP_DATA_PAGETYPE과 GTM 매핑 테스트
  console.log('\n\n【4. 실제 AP_DATA_PAGETYPE → GTM Content Group 매핑 테스트】');
  console.log('-'.repeat(60));

  const testValues = ['main', 'events', 'event', 'prds', 'prd', 'OTHERS', 'BRAND_MAIN', 'undefined'];

  for (const val of testValues) {
    const mapped = extractor.getMappedContentGroup(val);
    const icon = mapped ? '✅' : '❌';
    console.log(`${icon} "${val}" → ${mapped || '(매핑 없음 - default 사용)'}`);
  }

  // 5. 결론
  console.log('\n\n【결론】');
  console.log('='.repeat(60));

  const appendixTypes = new Set(appendixResult.pageTypes.map(p => p.pageType));
  const gtmTypes = new Set(gtmDefinedTypes);

  console.log(`\n공통 변수 appendix에 정의된 타입: ${appendixTypes.size}개`);
  console.log(`GTM에 매핑된 타입: ${gtmTypes.size}개`);

  const missingInGTM = [...appendixTypes].filter(t => !gtmTypes.has(t));
  if (missingInGTM.length > 0) {
    console.log(`\n⚠️  GTM에 매핑이 없는 타입들:`);
    for (const t of missingInGTM) {
      const def = appendixResult.pageTypes.find(p => p.pageType === t);
      console.log(`  - ${t}: ${def?.description || ''}`);
    }
    console.log('\n이 타입들은 GTM에서 Content Group으로 변환되지 않아서');
    console.log('트리거 조건에서 인식되지 않습니다.');
  }

  console.log('\n=== 테스트 완료 ===');
}

main().catch(console.error);
