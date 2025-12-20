/**
 * GA4 파라미터 조회 가능성 테스트
 */
import { extractParamsFromGTM } from './parsers/paramMappingParser';
import { validateGTMtoGA4Mapping, getQueryabilitySummary } from './config/ga4DimensionRegistry';

async function main() {
  console.log('='.repeat(80));
  console.log(' GA4 파라미터 조회 가능성 분석');
  console.log('='.repeat(80));

  const gtmParams = extractParamsFromGTM('./GTM-5FK5X5C4_workspace112.json');

  console.log(`\nGTM 파라미터: Event ${gtmParams.eventParams.length}개 + User ${gtmParams.userProperties.length}개\n`);

  const result = await validateGTMtoGA4Mapping({
    propertyId: '416629733',
    gtmEventParams: gtmParams.eventParams,
    gtmUserProps: gtmParams.userProperties,
  });

  if (!result.success) {
    console.log('❌ 실패:', result.report);
    return;
  }

  const allMappings = [...result.eventMappings, ...result.userMappings];
  const summary = getQueryabilitySummary(allMappings);

  console.log('📊 조회 가능성 요약:');
  console.log(`   총 파라미터: ${summary.total}개`);
  console.log(`   ✅ 조회 가능: ${summary.queryable}개 (${summary.queryableRate.toFixed(1)}%)`);
  console.log(`      - Custom Dimension: ${summary.customDimension}개`);
  console.log(`      - 표준 Dimension 대체: ${summary.standardAlternative}개`);
  console.log(`   ❌ 조회 불가: ${summary.notQueryable}개`);

  console.log('\n' + '='.repeat(80));
  console.log(' 파라미터별 조회 설정');
  console.log('='.repeat(80));

  console.log('\n| # | 파라미터 | 조회 Dimension | 소스 |');
  console.log('|---|----------|----------------|------|');

  let idx = 1;
  for (const c of summary.queryConfig) {
    const dim = c.dimension || '(조회 불가)';
    const src = c.source === 'custom' ? '✅ Custom' : (c.source === 'standard' ? '🔄 표준' : '❌ 없음');
    console.log(`| ${String(idx).padStart(2)} | ${c.param.padEnd(25)} | ${dim.padEnd(30)} | ${src} |`);
    idx++;
  }

  // 조회 불가 목록
  const notQueryable = summary.queryConfig.filter(c => c.source === 'none');
  if (notQueryable.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log(' ❌ GA4 API 조회 불가 파라미터 (등록 필요)');
    console.log('='.repeat(80));
    for (const c of notQueryable) {
      console.log(`   - ${c.param}`);
    }
  }
}

main().catch(console.error);
