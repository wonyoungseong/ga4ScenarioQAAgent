/**
 * custom_event 레지스트리 테스트
 */

import {
  getCustomEventType,
  getCustomEventParams,
  getAllCustomEventParams,
  printCustomEventRegistry,
  CUSTOM_EVENT_TYPES,
  CUSTOM_EVENT_COMMON_PARAMS,
} from './config/customEventRegistry';

function main() {
  printCustomEventRegistry();

  console.log('\n');
  console.log('='.repeat(80));
  console.log(' 사용 예시');
  console.log('='.repeat(80));

  // event_action으로 유형 찾기
  const testActions = [
    'diagnosis_result',      // skinnote_diagnosis
    'diagnosis_paper',       // skinnote_diagnosis
    'skinnote_main',         // skinnote_main
    'skinnote_level',        // skinnote_main
    'diagnosis_result_pdclick', // skinnote_product
    'some_general_action',   // general
  ];

  for (const action of testActions) {
    const eventType = getCustomEventType(action);
    const params = getCustomEventParams(action);
    console.log(`\nevent_action: "${action}"`);
    console.log(`  → 유형: ${eventType.name} (${eventType.id})`);
    console.log(`  → 파라미터 (${params.length}개): ${params.map(p => p.ga4Param).join(', ')}`);
  }

  // 통계
  console.log('\n');
  console.log('='.repeat(80));
  console.log(' 통계');
  console.log('='.repeat(80));

  console.log(`\n공통 파라미터: ${CUSTOM_EVENT_COMMON_PARAMS.length}개`);
  console.log(`이벤트 유형: ${CUSTOM_EVENT_TYPES.length}개`);
  console.log(`전체 고유 파라미터: ${getAllCustomEventParams().length}개`);
}

main();
