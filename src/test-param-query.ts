/**
 * 파라미터 쿼리 테스트
 *
 * PARAM_MAPPING_TABLE.md를 파싱하여 getEventParams() 동작 확인
 */

import { getEventParams, loadParameterStore, getParameterQueryService } from './parsers/paramMappingParser';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     파라미터 쿼리 서비스 테스트                                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // 1. 파라미터 스토어 로드
  console.log('📦 PARAM_MAPPING_TABLE.md 파싱 중...\n');
  const store = loadParameterStore();
  const service = getParameterQueryService();

  // 2. 요약 출력
  service.printSummary();

  // 3. page_view 이벤트 파라미터 조회 테스트
  console.log('\n' + '='.repeat(70));
  console.log('🎯 getEventParams("page_view") 호출 결과');
  console.log('='.repeat(70));

  const pageViewParams = getEventParams('page_view');

  if (pageViewParams) {
    console.log('\n【 공통 파라미터 (모든 이벤트) 】');
    for (const param of pageViewParams.commonParams) {
      console.log(`  ${param.ga4Key}`);
      console.log(`    └─ 개발가이드: ${param.devGuideVar}`);
      console.log(`    └─ 설명: ${param.description}`);
    }

    console.log('\n【 이벤트 전용 파라미터 】');
    if (pageViewParams.eventParams.length > 0) {
      for (const param of pageViewParams.eventParams) {
        console.log(`  ${param.ga4Key}`);
        console.log(`    └─ 개발가이드: ${param.devGuideVar}`);
        console.log(`    └─ GTM: ${param.gtmVariable || '(없음)'}`);
      }
    } else {
      console.log('  (이벤트 전용 파라미터 없음)');
    }

    console.log('\n【 사용자 파라미터 (로그인 시) 】');
    for (const param of pageViewParams.userParams) {
      console.log(`  ${param.ga4Key}`);
      console.log(`    └─ 개발가이드: ${param.devGuideVar}`);
    }

    console.log(`\n📊 items 배열 포함: ${pageViewParams.hasItems ? '예' : '아니오'}`);
  } else {
    console.log('page_view 이벤트 정보를 찾을 수 없습니다.');
  }

  // 4. view_item 이벤트 테스트 (items 배열 포함)
  console.log('\n' + '='.repeat(70));
  console.log('🎯 getEventParams("view_item") 호출 결과');
  console.log('='.repeat(70));

  const viewItemParams = getEventParams('view_item');

  if (viewItemParams) {
    console.log(`\n📊 items 배열 포함: ${viewItemParams.hasItems ? '예' : '아니오'}`);

    console.log('\n【 이벤트 전용 파라미터 】');
    for (const param of viewItemParams.eventParams) {
      console.log(`  ${param.ga4Key}: ${param.description}`);
    }

    if (viewItemParams.itemParams) {
      console.log('\n【 items[] 배열 파라미터 】');
      for (const param of viewItemParams.itemParams) {
        console.log(`  ${param.ga4Key}: ${param.description}`);
      }
    }
  }

  // 5. 파라미터 키로 검색 테스트
  console.log('\n' + '='.repeat(70));
  console.log('🔍 파라미터 검색 테스트');
  console.log('='.repeat(70));

  const testKeys = ['site_name', 'login_id_gcid', 'item_id', 'currency'];
  for (const key of testKeys) {
    const result = service.findParameterByKey(key);
    if (result) {
      console.log(`\n"${key}" → ${result.source}${result.eventName ? ` (${result.eventName})` : ''}`);
      console.log(`   개발가이드: ${result.parameter.devGuideVar}`);
    }
  }

  console.log('\n✅ 테스트 완료');
}

main().catch(console.error);
