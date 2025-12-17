/**
 * 페이지 컨텍스트 인식 기능 테스트
 */
import { GTMAnalyzer } from './analyzers/gtmAnalyzer';
import { detectPageTypeFromUrl, getPageTypeDescription } from './types/pageContext';

const GTM_JSON_PATH = './GTM-5FK5X5C4_workspace112.json';

async function testPageContextAnalysis() {
  console.log('========================================');
  console.log('페이지 컨텍스트 인식 기능 테스트');
  console.log('========================================\n');

  const analyzer = new GTMAnalyzer(GTM_JSON_PATH);

  // 테스트할 URL 목록
  const testUrls = [
    'https://www.amoremall.com/kr/ko/display/main',
    'https://www.amoremall.com/kr/ko/display/goods?goodsNo=1234',
    'https://www.amoremall.com/kr/ko/display/search?keyword=립스틱',
    'https://www.amoremall.com/kr/ko/display/event/12345',
    'https://www.amoremall.com/kr/ko/display/cart',
  ];

  for (const url of testUrls) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`URL: ${url}`);
    console.log('='.repeat(60));

    const pageType = detectPageTypeFromUrl(url);
    console.log(`페이지 타입: ${pageType} (${getPageTypeDescription(pageType)})`);

    const result = analyzer.analyzeEventsForUrl(url, { webOnly: true });

    console.log(`\n[자동 수집 이벤트]`);
    if (result.autoCollectedEvents.length > 0) {
      result.autoCollectedEvents.forEach(e => console.log(`  - ${e}`));
    } else {
      console.log('  - 없음');
    }

    console.log(`\n[발생 가능 이벤트] (${result.canFireEvents.length}개)`);
    result.canFireEvents.slice(0, 10).forEach(event => {
      const triggers = event.triggerResults
        .filter(t => t.canFire)
        .map(t => `${t.triggerName} (${t.triggerType})`)
        .join(', ');
      console.log(`  - ${event.eventName}`);
      console.log(`    트리거: ${triggers || 'N/A'}`);
    });
    if (result.canFireEvents.length > 10) {
      console.log(`  ... 외 ${result.canFireEvents.length - 10}개`);
    }

    console.log(`\n[변수 미선언으로 발생 불가 이벤트]`);
    const blockedByVar = result.cannotFireEvents.filter(e => e.blockedByVariableDeclaration);
    if (blockedByVar.length > 0) {
      blockedByVar.slice(0, 5).forEach(event => {
        console.log(`  - ${event.eventName}`);
        console.log(`    이유: ${event.summary}`);
      });
      if (blockedByVar.length > 5) {
        console.log(`  ... 외 ${blockedByVar.length - 5}개`);
      }
    } else {
      console.log('  - 없음');
    }
  }

  // MAIN 페이지 상세 분석
  console.log('\n\n');
  console.log('========================================');
  console.log('MAIN 페이지 상세 분석');
  console.log('========================================\n');

  const mainResult = analyzer.getEventsForPage('MAIN', { webOnly: true });
  console.log(mainResult.summary);

  // view_promotion_detail 이벤트 특별 확인
  console.log('\n\n[view_promotion_detail 이벤트 평가]');
  const viewPromoDetailResult = analyzer.evaluateEventOnPage('view_promotion_detail', 'MAIN');
  console.log(`이벤트명: ${viewPromoDetailResult.eventName}`);
  console.log(`발생 가능 여부: ${viewPromoDetailResult.canFire}`);
  console.log(`변수 선언 문제: ${viewPromoDetailResult.blockedByVariableDeclaration}`);
  console.log(`요약: ${viewPromoDetailResult.summary}`);

  if (viewPromoDetailResult.triggerResults.length > 0) {
    console.log('\n트리거별 상세:');
    for (const tr of viewPromoDetailResult.triggerResults) {
      console.log(`  - ${tr.triggerName} (${tr.triggerType})`);
      console.log(`    발동 가능: ${tr.canFire}`);
      console.log(`    이유: ${tr.reason}`);
      if (tr.filterResults.length > 0) {
        console.log('    필터 결과:');
        for (const fr of tr.filterResults) {
          console.log(`      - 통과 가능: ${fr.canPass}`);
          console.log(`        ${fr.reason}`);
          if (fr.variableIssue) {
            console.log(`        변수 이슈: ${fr.variableIssue.message}`);
          }
        }
      }
    }
  }
}

testPageContextAnalysis().catch(console.error);
