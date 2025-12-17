/**
 * scroll 이벤트 디버깅
 */

import { GTMAnalyzer } from './analyzers/gtmAnalyzer';
import { FilterEvaluator } from './analyzers/filterEvaluator';

const GTM_PATH = './GTM-5FK5X5C4_workspace112.json';

async function main() {
  console.log('=== scroll 이벤트 디버깅 ===\n');

  const gtmAnalyzer = new GTMAnalyzer(GTM_PATH);
  const filterEvaluator = new FilterEvaluator();

  // 1. GTM에서 scroll 트리거 가져오기
  const scrollTriggers = gtmAnalyzer.getEventTriggers('scroll');
  console.log('1. scroll 이벤트 트리거 수:', scrollTriggers.length);

  for (const trigger of scrollTriggers) {
    console.log(`\n   트리거: ${trigger.name}`);
    console.log(`   타입: ${trigger.type}`);
    console.log(`   필터 수: ${trigger.filters.length}`);
    for (const filter of trigger.filters) {
      console.log(`     - ${filter.variable} ${filter.type} "${filter.value}"`);
    }
  }

  // 2. EVENT_DETAIL 페이지에서 필터 평가
  console.log('\n\n2. EVENT_DETAIL 페이지에서 트리거 평가:');
  for (const trigger of scrollTriggers) {
    const result = filterEvaluator.evaluateTrigger(trigger, 'EVENT_DETAIL');
    console.log(`\n   트리거: ${trigger.name}`);
    console.log(`   canFire: ${result.canFire}`);
    console.log(`   reason: ${result.reason}`);
    console.log(`   필터 결과:`);
    for (const fr of result.filterResults) {
      console.log(`     - canPass: ${fr.canPass}, reason: ${fr.reason.substring(0, 100)}...`);
    }
  }

  // 3. GTM 분석 결과에서 scroll 확인
  console.log('\n\n3. GTM 분석 결과:');
  const gtmResult = gtmAnalyzer.getEventsForPage('EVENT_DETAIL', { webOnly: true });

  const scrollCanFire = gtmResult.canFireEvents.find(e => e.eventName === 'scroll');
  const scrollCannotFire = gtmResult.cannotFireEvents.find(e => e.eventName === 'scroll');

  if (scrollCanFire) {
    console.log('   ✅ scroll이 canFireEvents에 있음!');
    console.log(`   summary: ${scrollCanFire.summary}`);
  } else if (scrollCannotFire) {
    console.log('   ❌ scroll이 cannotFireEvents에 있음');
    console.log(`   summary: ${scrollCannotFire.summary}`);
    console.log(`   blockedByVariableDeclaration: ${scrollCannotFire.blockedByVariableDeclaration}`);
  } else {
    console.log('   ⚠️ scroll이 분석 결과에 전혀 없음!');
  }

  // 4. 전체 이벤트 목록
  console.log('\n\n4. EVENT_DETAIL에서 발생 가능 이벤트:');
  for (const event of gtmResult.canFireEvents.slice(0, 10)) {
    console.log(`   - ${event.eventName}`);
  }

  console.log(`\n   총 ${gtmResult.canFireEvents.length}개`);

  // 5. IntegratedEventAnalyzer 테스트
  console.log('\n\n5. IntegratedEventAnalyzer 테스트:');
  const { createDefaultGTMConfigLoader } = await import('./config/gtmConfigLoader');
  const { IntegratedEventAnalyzer } = await import('./analyzers/integratedEventAnalyzer');

  const configLoader = createDefaultGTMConfigLoader();
  await configLoader.preload();
  const config = configLoader.getConfig();

  // scroll 매핑 확인
  const scrollMapping = config.eventPageMappings.get('scroll');
  console.log('\n   scroll 이벤트 매핑:');
  if (scrollMapping) {
    console.log(`     allowedPageTypes: ${scrollMapping.allowedPageTypes.join(', ')}`);
    console.log(`     confidence: ${scrollMapping.confidence}`);
    console.log(`     source: ${scrollMapping.source}`);
  } else {
    console.log('     ⚠️ scroll 매핑 없음!');
  }

  // isEventAllowedOnPage 확인
  const analyzer = IntegratedEventAnalyzer.fromPreloadedConfig(
    process.env.GEMINI_API_KEY || 'dummy',
    config
  );

  const scrollAllowed = (analyzer as any).isEventAllowedOnPage('scroll', 'EVENT_DETAIL');
  console.log('\n   isEventAllowedOnPage("scroll", "EVENT_DETAIL"):');
  console.log(`     allowed: ${scrollAllowed.allowed}`);
  console.log(`     reason: ${scrollAllowed.reason}`);
  console.log(`     confidence: ${scrollAllowed.confidence}`);

  // 6. conditionalEvents에서 scroll 확인
  console.log('\n\n6. checkConditionalEvent 테스트:');
  const conditionalCheck = await (analyzer as any).checkConditionalEvent(
    'scroll',
    undefined,  // page
    'EVENT_DETAIL',  // pageType
    'https://www.amoremall.com/kr/ko/display/event_detail?eventId=test'  // url
  );
  console.log('   scroll on EVENT_DETAIL:');
  console.log(`     isConditional: ${conditionalCheck.isConditional}`);
  console.log(`     conditionMet: ${conditionalCheck.conditionMet}`);
  console.log(`     reason: ${conditionalCheck.reason}`);

  // 7. filterEvents 디버깅
  console.log('\n\n7. filterEvents 디버깅:');
  const mockEvents = [
    { eventName: 'scroll', triggerResults: [] },
    { eventName: 'ap_click', triggerResults: [] },
  ];
  const filterResult = await (analyzer as any).filterEvents(
    mockEvents,
    undefined,  // page
    '/kr/ko/display/event_detail',  // pagePath
    'EVENT_DETAIL',  // pageType
    'https://www.amoremall.com/kr/ko/display/event_detail?eventId=test'  // url
  );
  console.log(`   filtered events: ${filterResult.filtered.map((e: any) => e.eventName).join(', ')}`);
  console.log(`   blocked events: ${filterResult.blocked.map((e: any) => `${e.eventName}: ${e.summary}`).join('\n     ')}`);

  console.log('\n=== 완료 ===');
}

main().catch(console.error);
