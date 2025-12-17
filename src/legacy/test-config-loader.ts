/**
 * GTM 설정 로더 테스트
 *
 * 시나리오 작성 전에 모든 자료가 미리 로드되는지 확인합니다.
 */

import { createDefaultGTMConfigLoader, getGlobalGTMConfig } from './config/gtmConfigLoader';

async function main() {
  console.log('=== GTM 설정 로더 테스트 ===\n');

  // 1. 설정 로더 생성 및 미리 로드
  const startTime = Date.now();
  const config = await getGlobalGTMConfig();
  const loadTime = Date.now() - startTime;

  console.log(`\n전체 로드 시간: ${loadTime}ms`);

  // 2. 설정 요약 출력
  const loader = createDefaultGTMConfigLoader();
  await loader.preload();
  loader.printSummary();

  // 3. 이벤트-페이지 허용 여부 테스트 (빠른 조회)
  console.log('\n\n=== 이벤트-페이지 허용 여부 테스트 (빠른 조회) ===');
  console.log('-'.repeat(60));

  const testCases = [
    { event: 'select_item', page: 'PRODUCT_LIST' },
    { event: 'select_item', page: 'MAIN' },
    { event: 'select_item', page: 'BRAND_MAIN' },
    { event: 'select_item', page: 'OTHERS' },
    { event: 'view_item', page: 'PRODUCT_DETAIL' },
    { event: 'view_item', page: 'MAIN' },
    { event: 'brand_product_click', page: 'OTHERS' },
    { event: 'brand_product_click', page: 'BRAND_MAIN' },
    { event: 'scroll', page: 'MAIN' },
    { event: 'scroll', page: 'PRODUCT_LIST' },
  ] as const;

  const queryStart = Date.now();
  for (const tc of testCases) {
    const result = loader.isEventAllowedOnPage(tc.event, tc.page as any);
    const icon = result.allowed ? '✅' : '❌';
    console.log(`${icon} ${tc.event} on ${tc.page}: ${result.allowed ? '허용' : '차단'}`);
    console.log(`   소스: ${result.source} (신뢰도: ${result.confidence}%)`);
    console.log(`   이유: ${result.reason}`);
    console.log('');
  }
  const queryTime = Date.now() - queryStart;
  console.log(`조회 시간: ${queryTime}ms (${testCases.length}건)`);

  // 4. 특정 페이지에서 발생 가능한 이벤트 목록
  console.log('\n\n=== 페이지별 발생 가능 이벤트 ===');
  console.log('-'.repeat(60));

  const pageTypes = ['MAIN', 'PRODUCT_LIST', 'PRODUCT_DETAIL', 'BRAND_MAIN', 'OTHERS'] as const;

  for (const pageType of pageTypes) {
    const events = loader.getEventsForPageType(pageType as any);
    console.log(`\n[${pageType}] (${events.length}개 이벤트)`);
    for (const e of events.slice(0, 5)) {
      console.log(`  - ${e.eventName} (${e.source}, ${e.confidence}%)`);
    }
    if (events.length > 5) {
      console.log(`  ... 외 ${events.length - 5}개`);
    }
  }

  // 5. 불일치 상세 정보
  console.log('\n\n=== GTM 페이지 타입 매핑 불일치 상세 ===');
  console.log('-'.repeat(60));

  const mismatches = config.pageTypeMismatches;
  const appendixOnly = mismatches.filter(m => m.inAppendix && !m.inGTM);

  if (appendixOnly.length > 0) {
    console.log('\n📄 Appendix에 정의되었지만 GTM에 매핑 없는 타입:');
    for (const m of appendixOnly) {
      const def = config.pageTypeDefinitions.find(p => p.pageType === m.pageType);
      console.log(`  - ${m.pageType}`);
      console.log(`    설명: ${def?.description || 'N/A'}`);
      console.log(`    영향: 이 페이지 타입에서는 Content Group 기반 트리거가 동작하지 않음`);
      console.log('');
    }
  }

  console.log('\n=== 테스트 완료 ===');
}

main().catch(console.error);
