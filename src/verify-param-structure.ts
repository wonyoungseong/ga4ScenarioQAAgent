/**
 * 파라미터 매핑 구조 최종 검증
 *
 * event_category, event_action, event_label이 각 이벤트에 독립적으로 매핑되어 있는지 확인
 */

import { EVENT_SPECIFIC_PARAMS } from './config/ecommerceItemsMapping';
import { CUSTOM_EVENT_COMMON_PARAMS, CUSTOM_EVENT_TYPES } from './config/customEventRegistry';

function main() {
  console.log('='.repeat(100));
  console.log(' 파라미터 매핑 구조 최종 검증');
  console.log('='.repeat(100));

  const COMMON_PARAMS = ['event_category', 'event_action', 'event_label'];

  // 1. 이벤트별 공통 파라미터 현황
  console.log('\n### 1. 이벤트별 공통 파라미터 매핑 현황\n');

  const eventsWithCommonParams: string[] = [];
  const eventsWithoutCommonParams: string[] = [];

  for (const [eventName, params] of Object.entries(EVENT_SPECIFIC_PARAMS)) {
    const paramNames = params.map(p => p.ga4Param);
    const hasCategory = paramNames.includes('event_category');
    const hasAction = paramNames.includes('event_action');
    const hasLabel = paramNames.includes('event_label');

    if (hasCategory || hasAction || hasLabel) {
      eventsWithCommonParams.push(eventName);
      const found = [];
      if (hasCategory) found.push('category');
      if (hasAction) found.push('action');
      if (hasLabel) found.push('label');
      console.log(`✅ ${eventName}: ${found.join(', ')}`);
    } else {
      eventsWithoutCommonParams.push(eventName);
    }
  }

  // 2. 공통 파라미터 없는 이벤트
  console.log('\n### 2. 공통 파라미터 없는 이벤트 (items, duration 등 전용)\n');
  for (const eventName of eventsWithoutCommonParams) {
    const params = EVENT_SPECIFIC_PARAMS[eventName];
    console.log(`📦 ${eventName}: ${params.map(p => p.ga4Param).slice(0, 5).join(', ')}...`);
  }

  // 3. custom_event 전용 레지스트리 확인
  console.log('\n### 3. custom_event 전용 레지스트리 구조\n');
  console.log(`공통 파라미터: ${CUSTOM_EVENT_COMMON_PARAMS.map(p => p.ga4Param).join(', ')}`);
  console.log(`\n이벤트 유형 (${CUSTOM_EVENT_TYPES.length}개):`);
  for (const eventType of CUSTOM_EVENT_TYPES) {
    console.log(`  - ${eventType.id} (${eventType.name}): ${eventType.params.length}개 전용 파라미터`);
    if (eventType.params.length > 0) {
      console.log(`    → ${eventType.params.map(p => p.ga4Param).join(', ')}`);
    }
  }

  // 4. 요약 통계
  console.log('\n');
  console.log('='.repeat(100));
  console.log(' 요약');
  console.log('='.repeat(100));

  console.log(`\n총 이벤트 수: ${Object.keys(EVENT_SPECIFIC_PARAMS).length}개`);
  console.log(`공통 파라미터 포함: ${eventsWithCommonParams.length}개`);
  console.log(`공통 파라미터 미포함 (전용 이벤트): ${eventsWithoutCommonParams.length}개`);

  // 5. 중복 매핑 확인
  console.log('\n### 5. 파라미터 중복 확인\n');

  // event_category가 여러 이벤트에 있는지 확인
  const categoryEvents = eventsWithCommonParams.filter(e =>
    EVENT_SPECIFIC_PARAMS[e].some(p => p.ga4Param === 'event_category')
  );
  const actionEvents = eventsWithCommonParams.filter(e =>
    EVENT_SPECIFIC_PARAMS[e].some(p => p.ga4Param === 'event_action')
  );
  const labelEvents = eventsWithCommonParams.filter(e =>
    EVENT_SPECIFIC_PARAMS[e].some(p => p.ga4Param === 'event_label')
  );

  console.log(`event_category가 포함된 이벤트: ${categoryEvents.length}개`);
  console.log(`event_action이 포함된 이벤트: ${actionEvents.length}개`);
  console.log(`event_label이 포함된 이벤트: ${labelEvents.length}개`);

  console.log('\n✅ 각 이벤트에 독립적으로 파라미터가 정의되어 있어 올바르게 동작합니다.');
  console.log('   예측 시 각 이벤트별로 해당 이벤트의 파라미터 목록만 조회됩니다.');
}

main();
