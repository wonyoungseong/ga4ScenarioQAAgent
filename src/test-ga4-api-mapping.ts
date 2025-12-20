/**
 * page_view 이벤트 GA4 Data API 매핑 확인
 *
 * URL: https://www.amoremall.com/kr/ko/display/main
 * GA4 API Schema: https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema
 */

import { loadParameterStore, getParameterQueryService } from './parsers/paramMappingParser';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  page_view 이벤트 - GA4 Data API 매핑                           ║');
  console.log('║  URL: https://www.amoremall.com/kr/ko/display/main             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  loadParameterStore();
  const service = getParameterQueryService();

  const result = service.getEventParamsWithApiMapping('page_view');

  if (!result) {
    console.log('❌ page_view 이벤트를 찾을 수 없습니다.');
    return;
  }

  // 요약
  console.log(`📊 요약: 총 ${result.summary.total}개 파라미터`);
  console.log(`   - GA4 표준: ${result.summary.standard}개`);
  console.log(`   - Custom: ${result.summary.custom}개 (GA4에서 커스텀 정의 등록 필요)`);
  console.log(`   - items 배열: ${result.hasItems ? '포함' : '미포함'}\n`);

  // 카테고리별 출력
  const categories = ['common', 'event', 'user', 'item'] as const;
  const categoryNames = {
    common: '공통 파라미터',
    event: '이벤트 전용 파라미터',
    user: '사용자 파라미터 (로그인 시)',
    item: 'items[] 배열 파라미터',
  };

  for (const category of categories) {
    const params = result.parameters.filter(p => p.category === category);
    if (params.length === 0) continue;

    console.log('═'.repeat(70));
    console.log(`【 ${categoryNames[category]} 】`);
    console.log('═'.repeat(70));
    console.log('');

    // 표준 파라미터
    const standard = params.filter(p => !p.isCustomDimension);
    if (standard.length > 0) {
      console.log('▶ GA4 표준 Dimension:');
      console.log('┌' + '─'.repeat(20) + '┬' + '─'.repeat(25) + '┬' + '─'.repeat(20) + '┐');
      console.log('│ ' + 'GA4 파라미터'.padEnd(18) + ' │ ' + 'GA4 API Dimension'.padEnd(23) + ' │ ' + '개발가이드 변수'.padEnd(18) + ' │');
      console.log('├' + '─'.repeat(20) + '┼' + '─'.repeat(25) + '┼' + '─'.repeat(20) + '┤');
      for (const p of standard) {
        console.log('│ ' + p.ga4Key.padEnd(18) + ' │ ' + p.ga4ApiDimension.padEnd(23) + ' │ ' + p.devGuideVar.padEnd(18) + ' │');
      }
      console.log('└' + '─'.repeat(20) + '┴' + '─'.repeat(25) + '┴' + '─'.repeat(20) + '┘');
      console.log('');
    }

    // 커스텀 파라미터
    const custom = params.filter(p => p.isCustomDimension);
    if (custom.length > 0) {
      console.log('▶ Custom Dimension (GA4 등록 필요):');
      console.log('┌' + '─'.repeat(20) + '┬' + '─'.repeat(30) + '┬' + '─'.repeat(15) + '┐');
      console.log('│ ' + 'GA4 파라미터'.padEnd(18) + ' │ ' + 'GA4 API Dimension'.padEnd(28) + ' │ ' + '개발가이드'.padEnd(13) + ' │');
      console.log('├' + '─'.repeat(20) + '┼' + '─'.repeat(30) + '┼' + '─'.repeat(15) + '┤');
      for (const p of custom) {
        console.log('│ ' + p.ga4Key.padEnd(18) + ' │ ' + p.ga4ApiDimension.padEnd(28) + ' │ ' + p.devGuideVar.substring(0, 13).padEnd(13) + ' │');
      }
      console.log('└' + '─'.repeat(20) + '┴' + '─'.repeat(30) + '┴' + '─'.repeat(15) + '┘');
      console.log('');
    }
  }

  // GA4 API 쿼리 예시
  console.log('═'.repeat(70));
  console.log('【 GA4 Data API 쿼리 예시 】');
  console.log('═'.repeat(70));
  console.log('');
  console.log('// 표준 dimension 조회');
  const standardDims = result.parameters.filter(p => !p.isCustomDimension).slice(0, 3);
  console.log(`dimensions: [`);
  for (const p of standardDims) {
    console.log(`  { name: '${p.ga4ApiDimension}' },`);
  }
  console.log(`]`);
  console.log('');
  console.log('// Custom dimension 조회 (GA4에서 먼저 등록 필요)');
  const customDims = result.parameters.filter(p => p.isCustomDimension).slice(0, 3);
  console.log(`dimensions: [`);
  for (const p of customDims) {
    console.log(`  { name: '${p.ga4ApiDimension}' },`);
  }
  console.log(`]`);
  console.log('');

  console.log('✅ 완료');
}

main().catch(console.error);
