/**
 * 파서 검증 테스트
 */

import { loadParameterStore, getParameterQueryService, validateParameters } from './parsers/paramMappingParser';

function main() {
  console.log('='.repeat(100));
  console.log(' 파라미터 파서 검증 테스트');
  console.log('='.repeat(100));

  // 파서 실행 + GTM 검증
  const store = loadParameterStore(true);
  const service = getParameterQueryService();

  // 요약 출력
  service.printSummary();

  // page_view 파라미터 조회
  console.log('\n\n=== page_view 파라미터 ===\n');
  const pageViewParams = service.getEventParams('page_view');

  if (pageViewParams) {
    console.log(`총 파라미터: ${pageViewParams.totalCount}개`);
    console.log(`  - 공통 Event Parameters: ${pageViewParams.commonParams.length}개`);
    console.log(`  - User Properties: ${pageViewParams.userParams.length}개`);

    console.log('\n[공통 Event Parameters]');
    for (let i = 0; i < pageViewParams.commonParams.length; i++) {
      const p = pageViewParams.commonParams[i];
      console.log(`  ${(i + 1).toString().padStart(2)}. ${p.ga4Key}`);
    }

    console.log('\n[User Properties]');
    for (let i = 0; i < pageViewParams.userParams.length; i++) {
      const p = pageViewParams.userParams[i];
      console.log(`  ${(i + 1).toString().padStart(2)}. ${p.ga4Key}`);
    }
  }

  // 검증 결과
  console.log('\n\n=== 검증 결과 ===\n');
  const validation = validateParameters();
  console.log(`GTM Event Parameters: ${validation.gtmCount}개`);
  console.log(`파서 결과: ${validation.parserCount}개`);
  console.log(`검증 통과: ${validation.isValid ? '✅ YES' : '❌ NO'}`);

  if (!validation.isValid) {
    if (validation.missing.length > 0) {
      console.log(`\n누락된 파라미터 (${validation.missing.length}개):`);
      for (const p of validation.missing) {
        console.log(`  - ${p}`);
      }
    }
    if (validation.extra.length > 0) {
      console.log(`\n추가된 파라미터 (${validation.extra.length}개):`);
      for (const p of validation.extra) {
        console.log(`  - ${p}`);
      }
    }
  }
}

main();
