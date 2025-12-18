/**
 * Vision Analyzer + Scenario Designer Integration Test
 *
 * VisionAnalyzer와 FunnelScenarioDesigner의 통합 테스트
 * Mock 데이터로 시나리오 기반 분석 흐름을 검증합니다.
 */

import {
  GeminiVisionAnalyzer,
  FunnelStepAnalysisResult,
  FunnelAnalysisResult,
  ExtractedFunnelItem,
} from './analyzers/visionAnalyzer';
import {
  FunnelScenarioDesigner,
  FunnelScenario,
  SCENARIO_TEMPLATES,
} from './scenario/funnelScenarioDesigner';

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║    Vision Analyzer + Scenario Designer Integration Test        ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ═══════════════════════════════════════════════════════════════════════════
// 1. 시나리오 프롬프트 생성 테스트
// ═══════════════════════════════════════════════════════════════════════════

console.log('═'.repeat(70));
console.log('📋 1. 시나리오 기반 프롬프트 생성');
console.log('═'.repeat(70));

// API 키 없이 프롬프트 생성 테스트 (Vision AI 호출 없음)
const scenario = FunnelScenarioDesigner.enrichScenarioWithGA4Config(
  FunnelScenarioDesigner.createDefaultEcommerceFunnel()
);

console.log('\n📍 시나리오 정보:');
console.log(`   이름: ${scenario.name}`);
console.log(`   설명: ${scenario.description}`);
console.log(`   단계 수: ${scenario.steps.length}`);

// 각 단계별 프롬프트 생성
console.log('\n📍 단계별 Vision AI 프롬프트 미리보기:\n');

for (let i = 0; i < scenario.steps.length; i++) {
  const step = scenario.steps[i];
  console.log(`\n--- Step ${i + 1}: ${step.eventName} ---`);
  console.log(`페이지: ${step.pageType}`);
  console.log(`액션: ${step.action}`);
  console.log(`추출 파라미터 (${step.visionExtractParams.length}개):`);

  for (const param of step.visionExtractParams.slice(0, 5)) {
    console.log(`  - ${param.key}: ${param.extractionHint.substring(0, 40)}...`);
  }

  if (step.visionExtractParams.length > 5) {
    console.log(`  ... 외 ${step.visionExtractParams.length - 5}개`);
  }

  if (step.mustMatchPreviousStep.length > 0) {
    console.log(`⚠️ 이전 단계와 일치 필요: ${step.mustMatchPreviousStep.join(', ')}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Mock 퍼널 분석 결과 생성
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n\n' + '═'.repeat(70));
console.log('📋 2. Mock 퍼널 분석 결과 (일관된 데이터)');
console.log('═'.repeat(70));

// 일관된 Mock 데이터
const consistentMockResults: FunnelStepAnalysisResult[] = [
  {
    eventName: 'view_item',
    pageType: 'PRODUCT_DETAIL',
    timestamp: new Date().toISOString(),
    extractedItems: [{
      params: {
        item_id: { value: 'PROD001', confidence: 'HIGH', sourceLocation: 'URL 파라미터' },
        item_name: { value: '[설화수] 자음생크림 60ml', confidence: 'HIGH', sourceLocation: '상품명 영역' },
        item_brand: { value: '설화수', confidence: 'HIGH', sourceLocation: '브랜드 로고' },
        price: { value: 180000, confidence: 'HIGH', sourceLocation: '가격 영역' },
        item_category: { value: '스킨케어', confidence: 'MEDIUM', sourceLocation: '브레드크럼' },
      },
      extractionSuccess: true,
      missingRequired: [],
    }],
    reasoning: 'view_item 이벤트의 상품 정보 추출 완료',
  },
  {
    eventName: 'add_to_cart',
    pageType: 'PRODUCT_DETAIL',
    timestamp: new Date().toISOString(),
    extractedItems: [{
      params: {
        item_id: { value: 'PROD001', confidence: 'HIGH', sourceLocation: 'data 속성' },
        item_name: { value: '[설화수] 자음생크림 60ml', confidence: 'HIGH', sourceLocation: '팝업 상품명' },
        item_brand: { value: '설화수', confidence: 'HIGH', sourceLocation: '브랜드 텍스트' },
        price: { value: 180000, confidence: 'HIGH', sourceLocation: '가격 영역' },
        item_category: { value: '스킨케어', confidence: 'MEDIUM', sourceLocation: '카테고리 표시' },
        quantity: { value: 1, confidence: 'HIGH', sourceLocation: '수량 입력' },
      },
      extractionSuccess: true,
      missingRequired: [],
    }],
    reasoning: 'add_to_cart 이벤트의 상품 정보 추출 완료',
  },
  {
    eventName: 'begin_checkout',
    pageType: 'CHECKOUT',
    timestamp: new Date().toISOString(),
    extractedItems: [{
      params: {
        item_id: { value: 'PROD001', confidence: 'HIGH', sourceLocation: '주문 상품 목록' },
        item_name: { value: '[설화수] 자음생크림 60ml', confidence: 'HIGH', sourceLocation: '상품명' },
        item_brand: { value: '설화수', confidence: 'HIGH', sourceLocation: '브랜드' },
        price: { value: 180000, confidence: 'HIGH', sourceLocation: '상품 가격' },
        item_category: { value: '스킨케어', confidence: 'MEDIUM', sourceLocation: '카테고리' },
        quantity: { value: 1, confidence: 'HIGH', sourceLocation: '주문 수량' },
      },
      extractionSuccess: true,
      missingRequired: [],
    }],
    reasoning: 'begin_checkout 이벤트의 주문 정보 추출 완료',
  },
  {
    eventName: 'purchase',
    pageType: 'ORDER_COMPLETE',
    timestamp: new Date().toISOString(),
    extractedItems: [{
      params: {
        item_id: { value: 'PROD001', confidence: 'HIGH', sourceLocation: '주문 완료 페이지' },
        item_name: { value: '[설화수] 자음생크림 60ml', confidence: 'HIGH', sourceLocation: '구매 상품명' },
        item_brand: { value: '설화수', confidence: 'HIGH', sourceLocation: '브랜드' },
        price: { value: 180000, confidence: 'HIGH', sourceLocation: '결제 금액' },
        item_category: { value: '스킨케어', confidence: 'MEDIUM', sourceLocation: '카테고리' },
        quantity: { value: 1, confidence: 'HIGH', sourceLocation: '구매 수량' },
        transaction_id: { value: 'ORD-2024-001234', confidence: 'HIGH', sourceLocation: '주문번호 영역' },
      },
      extractionSuccess: true,
      missingRequired: [],
    }],
    reasoning: 'purchase 이벤트의 주문 완료 정보 추출 완료',
  },
];

// 결과 출력
console.log('\n✅ 일관된 데이터 시나리오 결과:');
for (const result of consistentMockResults) {
  console.log(`\n   [${result.eventName}]`);
  const item = result.extractedItems[0];
  console.log(`   - item_id: ${item.params.item_id?.value}`);
  console.log(`   - item_name: ${item.params.item_name?.value}`);
  console.log(`   - item_brand: ${item.params.item_brand?.value}`);
  console.log(`   - price: ${item.params.price?.value}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Mock 퍼널 분석 결과 (불일치 데이터)
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n\n' + '═'.repeat(70));
console.log('📋 3. Mock 퍼널 분석 결과 (불일치 데이터)');
console.log('═'.repeat(70));

// 불일치 Mock 데이터
const inconsistentMockResults: FunnelStepAnalysisResult[] = [
  {
    eventName: 'view_item',
    pageType: 'PRODUCT_DETAIL',
    timestamp: new Date().toISOString(),
    extractedItems: [{
      params: {
        item_id: { value: 'PROD002', confidence: 'HIGH', sourceLocation: 'URL' },
        item_name: { value: '[라네즈] 워터뱅크 크림', confidence: 'HIGH', sourceLocation: '상품명' },
        item_brand: { value: '라네즈', confidence: 'HIGH', sourceLocation: '브랜드' },
        price: { value: 45000, confidence: 'HIGH', sourceLocation: '가격' },
      },
      extractionSuccess: true,
      missingRequired: [],
    }],
    reasoning: 'view_item 분석',
  },
  {
    eventName: 'add_to_cart',
    pageType: 'PRODUCT_DETAIL',
    timestamp: new Date().toISOString(),
    extractedItems: [{
      params: {
        item_id: { value: 'PROD002', confidence: 'HIGH', sourceLocation: 'data 속성' },
        item_name: { value: '라네즈 워터뱅크 크림', confidence: 'HIGH', sourceLocation: '팝업' }, // 괄호 누락
        item_brand: { value: 'LANEIGE', confidence: 'HIGH', sourceLocation: '브랜드' }, // 영문으로 변경
        price: { value: 45000, confidence: 'HIGH', sourceLocation: '가격' },
        quantity: { value: 1, confidence: 'HIGH', sourceLocation: '수량' },
      },
      extractionSuccess: true,
      missingRequired: [],
    }],
    reasoning: 'add_to_cart 분석 - item_name과 item_brand 변경됨',
  },
  {
    eventName: 'begin_checkout',
    pageType: 'CHECKOUT',
    timestamp: new Date().toISOString(),
    extractedItems: [{
      params: {
        item_id: { value: 'PROD002', confidence: 'HIGH', sourceLocation: '주문 목록' },
        item_name: { value: '라네즈 워터뱅크 크림', confidence: 'HIGH', sourceLocation: '상품명' },
        item_brand: { value: 'LANEIGE', confidence: 'HIGH', sourceLocation: '브랜드' },
        price: { value: 45000, confidence: 'HIGH', sourceLocation: '가격' },
        quantity: { value: 2, confidence: 'HIGH', sourceLocation: '수량' }, // 수량 변경 (허용)
      },
      extractionSuccess: true,
      missingRequired: [],
    }],
    reasoning: 'begin_checkout 분석',
  },
  {
    eventName: 'purchase',
    pageType: 'ORDER_COMPLETE',
    timestamp: new Date().toISOString(),
    extractedItems: [{
      params: {
        item_id: { value: 'PROD002', confidence: 'HIGH', sourceLocation: '주문 완료' },
        item_name: { value: 'LANEIGE Water Bank Cream | 아모레몰', confidence: 'HIGH', sourceLocation: '상품명' }, // 완전히 다름
        item_brand: { value: 'LANEIGE', confidence: 'HIGH', sourceLocation: '브랜드' },
        price: { value: 40500, confidence: 'HIGH', sourceLocation: '결제 금액' }, // 할인 적용
        quantity: { value: 2, confidence: 'HIGH', sourceLocation: '수량' },
      },
      extractionSuccess: true,
      missingRequired: [],
    }],
    reasoning: 'purchase 분석 - item_name 완전히 변경, price 할인 적용',
  },
];

console.log('\n❌ 불일치 데이터 시나리오 결과:');
for (const result of inconsistentMockResults) {
  console.log(`\n   [${result.eventName}]`);
  const item = result.extractedItems[0];
  console.log(`   - item_id: ${item.params.item_id?.value}`);
  console.log(`   - item_name: ${item.params.item_name?.value}`);
  console.log(`   - item_brand: ${item.params.item_brand?.value}`);
  console.log(`   - price: ${item.params.price?.value}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. 일관성 검증 로직 테스트 (수동)
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n\n' + '═'.repeat(70));
console.log('📋 4. 일관성 검증 결과');
console.log('═'.repeat(70));

function checkConsistency(
  results: FunnelStepAnalysisResult[],
  consistencyRules: FunnelScenario['consistencyRules']
): { passed: boolean; issues: string[] } {
  const issues: string[] = [];
  let criticalCount = 0;

  for (let i = 1; i < results.length; i++) {
    const prev = results[i - 1].extractedItems[0];
    const curr = results[i].extractedItems[0];
    const eventName = results[i].eventName;

    if (!prev || !curr) continue;

    // CRITICAL 파라미터 체크
    for (const param of consistencyRules.immutable) {
      const prevVal = prev.params[param]?.value;
      const currVal = curr.params[param]?.value;

      if (prevVal !== currVal) {
        issues.push(`🔴 CRITICAL [${eventName}]: ${param} 변경 "${prevVal}" → "${currVal}"`);
        criticalCount++;
      }
    }

    // WARNING 파라미터 체크
    for (const param of consistencyRules.recommended) {
      const prevVal = prev.params[param]?.value;
      const currVal = curr.params[param]?.value;

      if (prevVal !== undefined && currVal !== undefined && prevVal !== currVal) {
        issues.push(`🟡 WARNING [${eventName}]: ${param} 변경 "${prevVal}" → "${currVal}"`);
      }
    }
  }

  return {
    passed: criticalCount === 0,
    issues,
  };
}

// 일관된 데이터 검증
console.log('\n✅ 일관된 데이터 검증:');
const consistentCheck = checkConsistency(consistentMockResults, scenario.consistencyRules);
if (consistentCheck.passed) {
  console.log('   퍼널 일관성 검증 통과! ✅');
} else {
  console.log('   퍼널 일관성 검증 실패:');
  for (const issue of consistentCheck.issues) {
    console.log(`   ${issue}`);
  }
}

// 불일치 데이터 검증
console.log('\n❌ 불일치 데이터 검증:');
const inconsistentCheck = checkConsistency(inconsistentMockResults, scenario.consistencyRules);
if (inconsistentCheck.passed) {
  console.log('   퍼널 일관성 검증 통과! ✅');
} else {
  console.log('   퍼널 일관성 검증 실패:');
  for (const issue of inconsistentCheck.issues) {
    console.log(`   ${issue}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. 통합 사용 예시
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n\n' + '═'.repeat(70));
console.log('📋 5. VisionAnalyzer 통합 사용 예시 (코드)');
console.log('═'.repeat(70));

console.log(`
// VisionAnalyzer와 FunnelScenarioDesigner 통합 사용 예시:

const analyzer = new GeminiVisionAnalyzer(process.env.GEMINI_API_KEY);

// 1. 기본 시나리오 가져오기
const scenario = analyzer.getDefaultFunnelScenario();

// 2. 시나리오 프롬프트 생성
const prompt = analyzer.generateScenarioPrompt(scenario);

// 3. 검증 체크리스트 생성
const checklist = analyzer.generateScenarioChecklist(scenario);

// 4. 전체 퍼널 분석 (스크린샷 배열 전달)
const screenshots = [
  { path: 'view_item.png', pageUrl: 'https://example.com/product/123' },
  { path: 'add_to_cart.png', pageUrl: 'https://example.com/product/123' },
  { path: 'checkout.png', pageUrl: 'https://example.com/checkout' },
  { path: 'complete.png', pageUrl: 'https://example.com/order/complete' },
];

const result = await analyzer.analyzeFunnelScenario(screenshots, scenario);

// 5. 결과 출력
analyzer.printFunnelAnalysisResult(result);

// 결과 구조:
// {
//   scenarioName: 'Standard Ecommerce Funnel',
//   stepResults: [...],
//   overallConsistency: {
//     passed: true/false,
//     criticalIssues: 0,
//     warningIssues: 0,
//     summary: '✅ 퍼널 일관성 검증 통과'
//   },
//   trackedItems: Map<item_id, 각 단계별 값>
// }
`);

// ═══════════════════════════════════════════════════════════════════════════
// 6. 시나리오 템플릿 확인
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(70));
console.log('📋 6. 사용 가능한 시나리오 템플릿');
console.log('═'.repeat(70));

console.log('\n📍 STANDARD_PURCHASE:');
console.log(`   ${SCENARIO_TEMPLATES.STANDARD_PURCHASE.description}`);
console.log(`   단계: ${SCENARIO_TEMPLATES.STANDARD_PURCHASE.steps.map(s => s.eventName).join(' → ')}`);

console.log('\n📍 LIST_TO_PURCHASE:');
console.log(`   ${SCENARIO_TEMPLATES.LIST_TO_PURCHASE.description}`);
console.log(`   단계: ${SCENARIO_TEMPLATES.LIST_TO_PURCHASE.steps.map(s => s.eventName).join(' → ')}`);

console.log('\n=== 통합 테스트 완료 ===');
