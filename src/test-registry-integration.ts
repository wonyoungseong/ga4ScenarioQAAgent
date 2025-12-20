/**
 * Parameter Registry 통합 테스트
 *
 * Agent가 PARAM_MAPPING_TABLE.md를 자동으로 참조하는지 확인
 */

import {
  initializeParameterRegistry,
  getEventParameters,
  getRegistryStatus,
  printRegistrySummary,
  reloadIfChanged,
} from './config/parameterRegistry';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Parameter Registry 통합 테스트                                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // 1. Registry 초기화 (Agent 시작 시 자동 호출)
  console.log('1️⃣ Parameter Registry 초기화...\n');
  await initializeParameterRegistry();

  // 2. 상태 확인
  console.log('\n2️⃣ Registry 상태 확인...');
  printRegistrySummary();

  // 3. page_view 파라미터 조회 (GA4 API 매핑 포함)
  console.log('\n3️⃣ getEventParameters("page_view") 호출...\n');
  const params = getEventParameters('page_view');

  if (params) {
    console.log(`   총 파라미터: ${params.summary.total}개`);
    console.log(`   - GA4 표준: ${params.summary.standard}개`);
    console.log(`   - Custom: ${params.summary.custom}개`);

    console.log('\n   파라미터 목록:');
    console.log('   ┌─────────────────┬────────────────────────────┬──────────┐');
    console.log('   │ GA4 파라미터        │ GA4 API Dimension          │ Type     │');
    console.log('   ├─────────────────┼────────────────────────────┼──────────┤');

    for (const p of params.parameters.slice(0, 10)) {
      const type = p.isCustomDimension ? 'Custom' : 'Standard';
      console.log(`   │ ${p.ga4Key.padEnd(15)} │ ${p.ga4ApiDimension.padEnd(26)} │ ${type.padEnd(8)} │`);
    }
    if (params.parameters.length > 10) {
      console.log(`   │ ... (${params.parameters.length - 10}개 더)      │                            │          │`);
    }
    console.log('   └─────────────────┴────────────────────────────┴──────────┘');
  }

  // 4. 소스 파일 변경 감지 테스트
  console.log('\n4️⃣ 소스 파일 변경 감지...');
  const changed = await reloadIfChanged();
  console.log(`   변경됨: ${changed ? '예 (리로드됨)' : '아니오'}`);

  // 5. 최종 상태
  console.log('\n5️⃣ 최종 Registry 상태:');
  const status = getRegistryStatus();
  console.log(`   초기화: ${status.initialized ? '✅' : '❌'}`);
  console.log(`   이벤트: ${status.eventCount}개`);
  console.log(`   공통 파라미터: ${status.commonParamCount}개`);
  console.log(`   소스: ${status.sourceFile}`);

  console.log('\n✅ 통합 테스트 완료');
  console.log('\n📌 Agent 사용법:');
  console.log('   import { getEventParameters } from "./config/parameterRegistry";');
  console.log('   const params = getEventParameters("page_view");');
}

main().catch(console.error);
