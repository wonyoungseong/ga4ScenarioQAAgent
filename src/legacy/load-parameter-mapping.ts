/**
 * GTM + GA4 파라미터 맵핑 병렬 로더 실행
 *
 * GTM JSON 파싱과 GA4 API 조회를 병렬로 수행하여
 * 파라미터 맵핑 사전 자료를 생성합니다.
 *
 * 사용법: npx ts-node src/load-parameter-mapping.ts
 *
 * 옵션:
 *   --no-cache : GA4 캐시 사용하지 않고 API 직접 호출
 */

import { createGTMGa4ParallelLoader } from './parallel/gtmGa4ParallelLoader';

async function main() {
  const useCache = !process.argv.includes('--no-cache');

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     GTM + GA4 파라미터 맵핑 병렬 로더                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n캐시 사용: ${useCache ? '예' : '아니오 (API 직접 호출)'}`);

  const loader = createGTMGa4ParallelLoader({ useCache });

  try {
    const result = await loader.loadAll();

    loader.printSummary(result);
    loader.saveResult(result);

    // 맵핑 테이블 일부 출력
    console.log('\n' + '═'.repeat(80));
    console.log('📋 파라미터 맵핑 테이블 (상위 20개)');
    console.log('═'.repeat(80));

    console.log('\n┌─────────────────────────────┬───────┬─────────┬─────────────────────────────┐');
    console.log('│ Parameter Name              │ Scope │ Status  │ GA4 Display Name            │');
    console.log('├─────────────────────────────┼───────┼─────────┼─────────────────────────────┤');

    for (const mapping of result.parameterMappings.slice(0, 20)) {
      const name = mapping.parameterName.substring(0, 27).padEnd(27);
      const scope = mapping.scope.padEnd(5);
      const status = mapping.gtmUsed && mapping.ga4Registered ? '✅ OK  '
        : mapping.gtmUsed && !mapping.ga4Registered ? '❌ MISS'
        : !mapping.gtmUsed && mapping.ga4Registered ? '⚠️ EXTRA'
        : '❓ ???  ';
      const displayName = (mapping.ga4DisplayName || '-').substring(0, 27).padEnd(27);
      console.log(`│ ${name} │ ${scope} │ ${status} │ ${displayName} │`);
    }

    console.log('└─────────────────────────────┴───────┴─────────┴─────────────────────────────┘');

    if (result.parameterMappings.length > 20) {
      console.log(`\n... 외 ${result.parameterMappings.length - 20}개 더 (전체는 output/parameter_mapping.json 참조)`);
    }

  } catch (error: any) {
    console.error('❌ 오류 발생:', error.message);
    process.exit(1);
  }
}

main();
