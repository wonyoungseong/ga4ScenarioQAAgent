/**
 * GTMConfigLoader 통합 테스트
 *
 * PARAM_MAPPING_TABLE.md 파서가 GTMConfigLoader와 통합되었는지 확인
 */

import { createDefaultGTMConfigLoader } from './config/gtmConfigLoader';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     GTMConfigLoader 통합 테스트                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const loader = createDefaultGTMConfigLoader();
  await loader.preload();

  // 요약 출력
  loader.printSummary();

  // 1. getEventParamsFromMapping 테스트
  console.log('\n' + '='.repeat(70));
  console.log('🎯 loader.getEventParamsFromMapping("page_view") 테스트');
  console.log('='.repeat(70));

  const pageViewParams = loader.getEventParamsFromMapping('page_view');

  if (pageViewParams) {
    console.log('\n✅ page_view 파라미터 조회 성공');
    console.log(`   - 공통 파라미터: ${pageViewParams.commonParams.length}개`);
    console.log(`   - 이벤트 전용: ${pageViewParams.eventParams.length}개`);
    console.log(`   - 사용자 파라미터: ${pageViewParams.userParams.length}개`);
    console.log(`   - items 포함: ${pageViewParams.hasItems ? '예' : '아니오'}`);

    console.log('\n   GA4 파라미터 키 목록:');
    const allKeys = [
      ...pageViewParams.commonParams.map(p => p.ga4Key),
      ...pageViewParams.eventParams.map(p => p.ga4Key),
    ];
    console.log(`   ${allKeys.join(', ')}`);
  } else {
    console.log('\n❌ page_view 이벤트를 찾을 수 없습니다.');
  }

  // 2. view_item 테스트 (items 배열 포함)
  console.log('\n' + '='.repeat(70));
  console.log('🎯 loader.getEventParamsFromMapping("view_item") 테스트');
  console.log('='.repeat(70));

  const viewItemParams = loader.getEventParamsFromMapping('view_item');

  if (viewItemParams) {
    console.log('\n✅ view_item 파라미터 조회 성공');
    console.log(`   - items 포함: ${viewItemParams.hasItems ? '예' : '아니오'}`);

    if (viewItemParams.itemParams) {
      console.log(`   - item 파라미터: ${viewItemParams.itemParams.length}개`);
      console.log(`   - item 파라미터 키: ${viewItemParams.itemParams.map(p => p.ga4Key).join(', ')}`);
    }
  }

  // 3. findParameterByKey 테스트
  console.log('\n' + '='.repeat(70));
  console.log('🔍 loader.findParameterByKey() 테스트');
  console.log('='.repeat(70));

  const testKeys = ['site_name', 'login_id_gcid', 'item_id', 'currency'];
  for (const key of testKeys) {
    const result = loader.findParameterByKey(key);
    if (result) {
      console.log(`\n   "${key}" 찾음`);
      console.log(`     - 소스: ${result.source}`);
      console.log(`     - 개발가이드 변수: ${result.parameter.devGuideVar}`);
    } else {
      console.log(`\n   "${key}" 못찾음`);
    }
  }

  // 4. findParameterByDevGuideVar 테스트
  console.log('\n' + '='.repeat(70));
  console.log('🔍 loader.findParameterByDevGuideVar() 테스트');
  console.log('='.repeat(70));

  const testDevGuideVars = ['AP_DATA_SITENAME', 'AP_DATA_GCID', 'AP_PRD_CODE'];
  for (const devVar of testDevGuideVars) {
    const result = loader.findParameterByDevGuideVar(devVar);
    if (result) {
      console.log(`\n   "${devVar}" → GA4: ${result.ga4Key}`);
    } else {
      console.log(`\n   "${devVar}" 못찾음`);
    }
  }

  console.log('\n✅ 통합 테스트 완료');
}

main().catch(console.error);
