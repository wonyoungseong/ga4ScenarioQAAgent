/**
 * GTM 동적 매핑 추출 테스트
 *
 * 하드코딩된 매핑 대신 GTM JSON에서 동적으로 추출된 매핑을 검증합니다.
 */

import { GTMPageMappingExtractor } from './analyzers/gtmPageMappingExtractor';
import { IntegratedEventAnalyzer } from './analyzers/integratedEventAnalyzer';
import { DevelopmentGuideParser } from './parsers/developmentGuideParser';
import { PageType } from './types/pageContext';
import * as dotenv from 'dotenv';

dotenv.config();

const GTM_JSON_PATH = './GTM-5FK5X5C4_workspace112.json';
const DEV_GUIDE_PATH = './[EC]+WEB+개발+가이드_GTM코드추가(Shopify)1.1.pdf';

async function main() {
  console.log('=== GTM 동적 매핑 추출 테스트 ===\n');

  const extractor = new GTMPageMappingExtractor(GTM_JSON_PATH);

  // 1. 이벤트-페이지 매핑 추출
  console.log('【이벤트-페이지 매핑】');
  console.log('-'.repeat(60));
  const eventMappings = extractor.extractEventPageMappings();

  // 주요 이벤트만 출력
  const importantEvents = [
    'select_item',
    'view_item',
    'view_item_list',
    'add_to_cart',
    'begin_checkout',
    'purchase',
    'select_promotion',
    'view_promotion',
    'search',
    'scroll',
    'ap_click',
    'login',
    'sign_up'
  ];

  for (const eventName of importantEvents) {
    const mapping = eventMappings.get(eventName);
    if (mapping) {
      console.log(`\n${eventName}:`);
      console.log(`  허용 페이지: ${mapping.allowedPageTypes.join(', ')}`);
      console.log(`  소스: ${mapping.source} (신뢰도: ${mapping.confidence}%)`);
      if (mapping.triggerPageConditions.length > 0) {
        console.log(`  트리거 조건:`);
        for (const tc of mapping.triggerPageConditions) {
          console.log(`    - ${tc.triggerName}: ${tc.pageTypes.join(', ')}`);
        }
      }
    } else {
      console.log(`\n${eventName}: GTM에서 찾을 수 없음`);
    }
  }

  // 2. 특정 이벤트가 특정 페이지에서 발생 가능한지 테스트
  console.log('\n\n【이벤트-페이지 허용 여부 테스트】');
  console.log('-'.repeat(60));

  const testCases: { eventName: string; pageType: PageType; expectedAllowed: boolean }[] = [
    // select_item은 PRODUCT_LIST, SEARCH_RESULT에서만 발생해야 함
    { eventName: 'select_item', pageType: 'PRODUCT_LIST', expectedAllowed: true },
    { eventName: 'select_item', pageType: 'SEARCH_RESULT', expectedAllowed: true },
    { eventName: 'select_item', pageType: 'MAIN', expectedAllowed: false },

    // view_item은 PRODUCT_DETAIL에서만 발생
    { eventName: 'view_item', pageType: 'PRODUCT_DETAIL', expectedAllowed: true },
    { eventName: 'view_item', pageType: 'MAIN', expectedAllowed: false },

    // begin_checkout은 CART에서 발생
    { eventName: 'begin_checkout', pageType: 'CART', expectedAllowed: true },
    { eventName: 'begin_checkout', pageType: 'PRODUCT_DETAIL', expectedAllowed: true }, // purchaseprdbtn 트리거

    // scroll은 특정 페이지에서만 (MAIN, PRODUCT_DETAIL, EVENT_DETAIL)
    { eventName: 'scroll', pageType: 'MAIN', expectedAllowed: true },
    { eventName: 'scroll', pageType: 'PRODUCT_DETAIL', expectedAllowed: true },
    { eventName: 'scroll', pageType: 'CART', expectedAllowed: false },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const result = extractor.isEventAllowedOnPage(tc.eventName, tc.pageType);
    const status = result.allowed === tc.expectedAllowed;

    if (status) {
      passed++;
      console.log(`✅ ${tc.eventName} on ${tc.pageType}: ${result.allowed ? '허용' : '차단'} (신뢰도: ${result.confidence}%)`);
    } else {
      failed++;
      console.log(`❌ ${tc.eventName} on ${tc.pageType}: ${result.allowed ? '허용' : '차단'} (기대: ${tc.expectedAllowed ? '허용' : '차단'})`);
      console.log(`   이유: ${result.reason}`);
    }
  }

  console.log(`\nGTM 직접 테스트 결과: ${passed} 통과, ${failed} 실패`);

  // 3. IntegratedEventAnalyzer 통합 테스트 (GTM + 개발가이드 + GA4 표준)
  console.log('\n\n【IntegratedEventAnalyzer 통합 테스트 (GTM + 개발가이드 + GA4 표준)】');
  console.log('-'.repeat(60));

  const apiKey = process.env.GEMINI_API_KEY || 'dummy-key';
  const analyzer = new IntegratedEventAnalyzer(apiKey, GTM_JSON_PATH, DEV_GUIDE_PATH);
  await analyzer.loadDevGuide();

  const integratedTestCases: { eventName: string; pageType: PageType; expectedAllowed: boolean }[] = [
    // select_item은 GA4 표준에서 PRODUCT_LIST, SEARCH_RESULT에서만 발생
    { eventName: 'select_item', pageType: 'PRODUCT_LIST', expectedAllowed: true },
    { eventName: 'select_item', pageType: 'SEARCH_RESULT', expectedAllowed: true },
    { eventName: 'select_item', pageType: 'MAIN', expectedAllowed: false },

    // view_item은 GA4 표준에서 PRODUCT_DETAIL에서만 발생
    { eventName: 'view_item', pageType: 'PRODUCT_DETAIL', expectedAllowed: true },
    { eventName: 'view_item', pageType: 'MAIN', expectedAllowed: false },

    // begin_checkout은 GTM에서 CART, ORDER
    { eventName: 'begin_checkout', pageType: 'CART', expectedAllowed: true },

    // scroll은 GTM에서 MAIN, PRODUCT_DETAIL, EVENT_DETAIL
    { eventName: 'scroll', pageType: 'MAIN', expectedAllowed: true },
    { eventName: 'scroll', pageType: 'CART', expectedAllowed: false },

    // select_promotion은 GA4 표준에서 MAIN, EVENT_DETAIL 등
    { eventName: 'select_promotion', pageType: 'MAIN', expectedAllowed: true },
    { eventName: 'select_promotion', pageType: 'CART', expectedAllowed: false },
  ];

  let integratedPassed = 0;
  let integratedFailed = 0;

  for (const tc of integratedTestCases) {
    const result = analyzer.isEventAllowedOnPage(tc.eventName, tc.pageType);
    const status = result.allowed === tc.expectedAllowed;

    if (status) {
      integratedPassed++;
      console.log(`✅ ${tc.eventName} on ${tc.pageType}: ${result.allowed ? '허용' : '차단'} (신뢰도: ${result.confidence}%)`);
    } else {
      integratedFailed++;
      console.log(`❌ ${tc.eventName} on ${tc.pageType}: ${result.allowed ? '허용' : '차단'} (기대: ${tc.expectedAllowed ? '허용' : '차단'})`);
      console.log(`   이유: ${result.reason}`);
    }
  }

  console.log(`\n통합 테스트 결과: ${integratedPassed} 통과, ${integratedFailed} 실패`);

  // 4. GA4 표준 매핑 확인
  console.log('\n\n【GA4 E-commerce 표준 매핑】');
  console.log('-'.repeat(60));

  const ga4Mappings = DevelopmentGuideParser.getAllGA4StandardMappings();
  for (const [eventName, pageTypes] of Object.entries(ga4Mappings)) {
    console.log(`${eventName}: ${pageTypes.join(', ')}`);
  }

  // 5. 변수-페이지 매핑 추출 (요약)
  console.log('\n\n【변수-페이지 매핑 (상위 10개)】');
  console.log('-'.repeat(60));

  const variableMappings = extractor.extractVariablePageMappings();
  let count = 0;
  for (const [varName, mapping] of variableMappings) {
    if (count >= 10) break;
    if (mapping.allowedPageTypes.length < 13) { // 모든 페이지가 아닌 것만
      console.log(`${varName}:`);
      console.log(`  허용 페이지: ${mapping.allowedPageTypes.join(', ')}`);
      console.log(`  소스: ${mapping.source} (신뢰도: ${mapping.confidence}%)`);
      count++;
    }
  }

  console.log('\n=== 테스트 완료 ===');
}

main().catch(console.error);
