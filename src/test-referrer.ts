/**
 * product/detail 페이지 유입 경로 분석
 */
import { GA4Client } from './ga4/ga4Client';
import * as fs from 'fs';

async function main() {
  const tokenData = JSON.parse(fs.readFileSync('./credentials/ga4_tokens.json', 'utf8'));

  const client = new GA4Client({
    propertyId: '416629733',
    accessToken: tokenData.access_token
  });

  console.log('=== product/detail 페이지 유입 경로 분석 ===\n');

  // 페이지별 이벤트 조회하여 product/detail 관련 유입 경로 파악
  const pageEvents = await client.getEventsByPage(undefined, {
    startDate: '30daysAgo',
    endDate: 'today'
  });

  // product/detail 페이지 이벤트 필터링
  const productDetailEvents = pageEvents.filter(p =>
    p.pagePath.includes('product/detail')
  );

  console.log(`product/detail 페이지 이벤트 건수: ${productDetailEvents.length}개\n`);

  // 상위 페이지 이벤트 출력 (product/detail이 아닌 페이지들)
  const otherPages = pageEvents.filter(p =>
    !p.pagePath.includes('product/detail') &&
    p.pagePath !== '(not set)' &&
    p.pagePath !== ''
  ).slice(0, 20);

  console.log('【주요 페이지별 이벤트 현황】');
  console.log('-'.repeat(80));
  for (const page of otherPages) {
    const topEvents = Object.entries(page.events)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([e, c]) => `${e}:${c}`)
      .join(', ');
    console.log(`${page.pagePath.substring(0, 50).padEnd(50)} | ${topEvents}`);
  }

  // select_item 이벤트가 많은 페이지 찾기 (상품 클릭 → 상세 이동)
  console.log('\n【select_item 이벤트가 많은 페이지 (상품 상세로 이동 가능)】');
  console.log('-'.repeat(80));

  const pagesWithSelectItem = pageEvents
    .filter(p => p.events['select_item'] && p.events['select_item'] > 100)
    .sort((a, b) => (b.events['select_item'] || 0) - (a.events['select_item'] || 0))
    .slice(0, 10);

  for (const page of pagesWithSelectItem) {
    console.log(`${(page.events['select_item'] || 0).toString().padStart(10)} 클릭  ${page.pagePath.substring(0, 60)}`);
  }

  if (pagesWithSelectItem.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log(`\n🏆 product/detail로 가장 많이 유입되는 페이지: ${pagesWithSelectItem[0].pagePath}`);
    console.log(`   (select_item 이벤트 ${pagesWithSelectItem[0].events['select_item']}건)`);
  }
}

main().catch(console.error);
