/**
 * page_view 전체 파라미터 개수 확인
 */

import { getParameterQueryService, loadParameterStore } from './parsers/paramMappingParser';

function main() {
  const store = loadParameterStore(true);
  const service = getParameterQueryService();

  console.log('\n=== page_view 파라미터 분석 ===\n');

  // page_view 이벤트 파라미터 조회
  const pageViewParams = service.getEventParamsWithApiMapping('page_view');

  if (pageViewParams) {
    console.log(`총 파라미터: ${pageViewParams.summary.total}개`);
    console.log(`표준 파라미터: ${pageViewParams.summary.standard}개`);
    console.log(`커스텀 파라미터: ${pageViewParams.summary.custom}개`);
    console.log(`items 포함: ${pageViewParams.hasItems}`);

    console.log('\n--- 카테고리별 분류 ---');

    const categories = ['common', 'event', 'user', 'item'] as const;
    for (const cat of categories) {
      const params = pageViewParams.parameters.filter(p => p.category === cat);
      if (params.length > 0) {
        console.log(`\n[${cat}] ${params.length}개`);
        for (const p of params) {
          console.log(`  - ${p.ga4Key} <- ${p.devGuideVar}`);
        }
      }
    }
  }

  // 원본 스토어 확인
  console.log('\n\n=== 원본 스토어 정보 ===');
  console.log(`공통 페이지 파라미터: ${store.commonPageParams.length}개`);
  console.log(`공통 사용자 파라미터: ${store.commonUserParams.length}개`);
  console.log(`item 파라미터: ${store.itemParams.length}개`);
  console.log(`이벤트 수: ${store.events.size}개`);

  // page_view 전용 파라미터
  const pageViewEvent = store.events.get('page_view');
  if (pageViewEvent) {
    console.log(`\npage_view 전용 파라미터: ${pageViewEvent.parameters.length}개`);
    for (const p of pageViewEvent.parameters) {
      console.log(`  - ${p.ga4Key} <- ${p.devGuideVar}`);
    }
  }
}

main();
