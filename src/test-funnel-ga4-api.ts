/**
 * Funnel Consistency Test
 *
 * 퍼널 이벤트 간 item_name 일관성 검증
 * Mock 데이터 또는 JSON 파일로 테스트
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  FunnelConsistencyValidator,
} from './validation/parameterValidator';
import {
  DataLayerEvent,
  FunnelValidationReport,
  ECOMMERCE_FUNNEL_ORDER,
} from './types/parameterPrediction';

// ═══════════════════════════════════════════════════════════════════════════
// 설정
// ═══════════════════════════════════════════════════════════════════════════

const ECOMMERCE_EVENTS = [
  'view_item',
  'add_to_cart',
  'begin_checkout',
  'purchase'
];

// ═══════════════════════════════════════════════════════════════════════════
// Mock 데이터로 퍼널 일관성 테스트
// ═══════════════════════════════════════════════════════════════════════════

async function runMockTest(): Promise<void> {
  console.log('\n' + '═'.repeat(70));
  console.log('🧪 Mock 데이터로 퍼널 일관성 테스트');
  console.log('   (모든 item 파라미터 검증)');
  console.log('═'.repeat(70));

  const funnelValidator = new FunnelConsistencyValidator();

  // Mock 데이터: 일관된 모든 파라미터
  const consistentItem: DataLayerEvent[] = [
    {
      timestamp: Date.now(),
      event: 'view_item',
      data: {},
      ecommerce: {
        items: [{
          item_id: 'PROD001',
          item_name: '[설화수] 자음생크림 60ml',
          item_brand: '설화수',
          item_category: '스킨케어',
          item_category2: '크림',
          price: 180000,
          quantity: 1,
          discount: 0,
        }]
      }
    },
    {
      timestamp: Date.now() + 1000,
      event: 'add_to_cart',
      data: {},
      ecommerce: {
        items: [{
          item_id: 'PROD001',
          item_name: '[설화수] 자음생크림 60ml',
          item_brand: '설화수',
          item_category: '스킨케어',
          item_category2: '크림',
          price: 180000,
          quantity: 1,
          discount: 0,
        }]
      }
    },
    {
      timestamp: Date.now() + 2000,
      event: 'begin_checkout',
      data: {},
      ecommerce: {
        items: [{
          item_id: 'PROD001',
          item_name: '[설화수] 자음생크림 60ml',
          item_brand: '설화수',
          item_category: '스킨케어',
          item_category2: '크림',
          price: 180000,
          quantity: 1,
          discount: 0,
        }]
      }
    },
    {
      timestamp: Date.now() + 3000,
      event: 'purchase',
      data: {},
      ecommerce: {
        items: [{
          item_id: 'PROD001',
          item_name: '[설화수] 자음생크림 60ml',
          item_brand: '설화수',
          item_category: '스킨케어',
          item_category2: '크림',
          price: 180000,
          quantity: 1,
          discount: 0,
        }]
      }
    }
  ];

  // Mock 데이터: 여러 파라미터 불일치
  const inconsistentItem: DataLayerEvent[] = [
    {
      timestamp: Date.now(),
      event: 'view_item',
      data: {},
      ecommerce: {
        items: [{
          item_id: 'PROD002',
          item_name: '[라네즈] 워터뱅크 크림',
          item_brand: '라네즈',
          item_category: '스킨케어',
          item_category2: '수분크림',
          price: 45000,
          quantity: 1,
        }]
      }
    },
    {
      timestamp: Date.now() + 1000,
      event: 'add_to_cart',
      data: {},
      ecommerce: {
        items: [{
          item_id: 'PROD002',
          item_name: '라네즈 워터뱅크 크림',  // 변경: 괄호 제거
          item_brand: 'LANEIGE',               // 변경: 영문
          item_category: '스킨케어',
          item_category2: '수분크림',
          price: 45000,
          quantity: 1,
        }]
      }
    },
    {
      timestamp: Date.now() + 2000,
      event: 'begin_checkout',
      data: {},
      ecommerce: {
        items: [{
          item_id: 'PROD002',
          item_name: '라네즈 워터뱅크 크림',
          item_brand: 'LANEIGE',
          item_category: 'Skincare',            // 변경: 영문
          item_category2: 'Moisturizer',        // 변경: 영문
          price: 45000,
          quantity: 2,                          // 변경: 수량 증가
        }]
      }
    },
    {
      timestamp: Date.now() + 3000,
      event: 'purchase',
      data: {},
      ecommerce: {
        items: [{
          item_id: 'PROD002',
          item_name: 'LANEIGE Water Bank Cream | 아모레몰',  // 변경: 완전히 다른 형식
          item_brand: 'LANEIGE',
          item_category: 'Skincare',
          item_category2: 'Moisturizer',
          price: 40500,                         // 변경: 할인 적용
          quantity: 2,
          discount: 4500,                       // 추가: 할인금액
          coupon: 'SUMMER10',                   // 추가: 쿠폰
        }]
      }
    }
  ];

  // 이벤트 추가
  console.log('\n📥 Mock 이벤트 추가 중...');

  for (const event of consistentItem) {
    funnelValidator.addEvent(event);
  }
  console.log('   ✅ 일관된 상품 (PROD001) - 모든 파라미터 동일');

  for (const event of inconsistentItem) {
    funnelValidator.addEvent(event);
  }
  console.log('   ✅ 불일치 상품 (PROD002) - 여러 파라미터 변경');

  // 확장된 검증 실행 (모든 파라미터)
  console.log('\n🔍 모든 item 파라미터 검증 중...');
  const extendedResult = funnelValidator.validateAllParams();
  funnelValidator.printExtendedReport(extendedResult);

  // 결과 저장
  const outputDir = path.join(process.cwd(), 'output', 'funnel-ga4-api');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, `mock_test_extended_${Date.now()}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(extendedResult, null, 2));
  console.log(`\n💾 결과 저장: ${outputPath}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 메인 실행
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║          Funnel Consistency Test                               ║');
  console.log('║          퍼널 이벤트 간 item_name 일관성 검증                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  await runMockTest();

  console.log('\n=== 테스트 완료 ===');
}

main().catch(console.error);
