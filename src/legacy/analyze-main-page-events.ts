/**
 * MAIN 페이지 이벤트 예측 vs 실제 GA4 데이터 비교 분석
 *
 * 1. 개발가이드 기반 예상 이벤트 정의
 * 2. GA4에서 실제 수집된 데이터 조회
 * 3. 예측 vs 실제 비교 분석
 * 4. 노이즈/오류 판단
 */

import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { GA4Client, createGA4ClientFromEnv } from './ga4/ga4Client';
import { ScenarioGuideRequirements } from './schemas/scenarioGuideRequirements';
import { edgeCaseLoader, EdgeCase } from './config/siteEdgeCases';

dotenv.config();

const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID || '416629733';

/**
 * 이벤트 예측 정의
 */
interface EventPrediction {
  eventName: string;
  expectedOnPage: boolean;
  confidence: 'high' | 'medium' | 'low';
  triggerCondition: string;
  expectedParameters: string[];
  source: 'devguide' | 'gtm' | 'ga4_standard' | 'inferred';
}

/**
 * 비교 분석 결과
 */
interface ComparisonResult {
  eventName: string;
  predicted: boolean;
  actuallyCollected: boolean;
  eventCount: number;
  proportion: number;
  isNoise: boolean;
  verdict: 'CORRECT' | 'FALSE_POSITIVE' | 'FALSE_NEGATIVE' | 'NOISE_COLLECTED' | 'EXPECTED_NOISE';
  analysis: string;
}

/**
 * Edge Case 적용하여 예측 수정
 */
function applyEdgeCases(predictions: EventPrediction[], pageType: string): EventPrediction[] {
  const edgeCases = edgeCaseLoader.getEdgeCasesForProperty(GA4_PROPERTY_ID);

  if (edgeCases.length === 0) {
    console.log('   ⚠️ Edge Case 설정 없음 - 기본 예측 사용');
    return predictions;
  }

  console.log(`   📌 Edge Case ${edgeCases.length}개 적용 중...`);

  return predictions.map(pred => {
    const edgeCase = edgeCases.find(ec => ec.eventName === pred.eventName);

    if (!edgeCase) {
      return pred;
    }

    // Edge Case 타입별 처리
    switch (edgeCase.type) {
      case 'PAGE_RESTRICTION':
        if (edgeCase.allowedPageTypes && !edgeCase.allowedPageTypes.includes(pageType) && !edgeCase.allowedPageTypes.includes('ALL')) {
          return {
            ...pred,
            expectedOnPage: false,
            triggerCondition: `[Edge Case] ${edgeCase.description}`,
            source: 'edge_case' as any,
          };
        }
        break;

      case 'PAGE_EXCLUSION':
        if (edgeCase.excludedPageTypes?.includes(pageType)) {
          return {
            ...pred,
            expectedOnPage: false,
            triggerCondition: `[Edge Case] ${edgeCase.description}`,
            source: 'edge_case' as any,
          };
        }
        break;

      case 'NOT_IMPLEMENTED':
      case 'DEPRECATED':
        return {
          ...pred,
          expectedOnPage: false,
          triggerCondition: `[Edge Case] ${edgeCase.description}`,
          source: 'edge_case' as any,
        };

      case 'NOISE_EXPECTED':
        // 노이즈 예상 정보 추가 (예측 자체는 변경 안함)
        return {
          ...pred,
          triggerCondition: `${pred.triggerCondition} [노이즈 예상: ${edgeCase.expectedNoisePercent}% 이하]`,
        };
    }

    return pred;
  });
}

/**
 * 개발가이드 기반 MAIN 페이지 예상 이벤트 정의
 */
function defineMainPagePredictions(): EventPrediction[] {
  // scenario_guide_requirements.json 로드
  const requirementsPath = './output/scenario_guide_requirements.json';
  let requirements: ScenarioGuideRequirements | null = null;

  if (fs.existsSync(requirementsPath)) {
    requirements = JSON.parse(fs.readFileSync(requirementsPath, 'utf8'));
  }

  let predictions: EventPrediction[] = [
    // ===== 필수 발생 이벤트 (High Confidence) =====
    {
      eventName: 'page_view',
      expectedOnPage: true,
      confidence: 'high',
      triggerCondition: '모든 페이지 HTML 파싱 완료 시 자동 발생',
      expectedParameters: ['page_location', 'page_title', 'page_referrer'],
      source: 'devguide',
    },
    {
      eventName: 'view_promotion',
      expectedOnPage: true,
      confidence: 'high',
      triggerCondition: '메인 페이지 로드 시 key visual 영역에 프로모션 노출',
      expectedParameters: ['promotion_id', 'promotion_name', 'creative_slot'],
      source: 'devguide',
    },
    {
      eventName: 'select_promotion',
      expectedOnPage: true,
      confidence: 'high',
      triggerCondition: '메인 key visual 영역의 프로모션 링크 클릭 시',
      expectedParameters: ['promotion_id', 'promotion_name', 'creative_slot'],
      source: 'devguide',
    },
    {
      eventName: 'view_item_list',
      expectedOnPage: true,
      confidence: 'high',
      triggerCondition: '메인 페이지에 상품 리스트 섹션이 노출될 때',
      expectedParameters: ['item_list_name', 'items[]'],
      source: 'gtm',
    },
    {
      eventName: 'scroll',
      expectedOnPage: true,
      confidence: 'high',
      triggerCondition: '사용자가 페이지를 90% 이상 스크롤할 때',
      expectedParameters: ['percent_scrolled'],
      source: 'gtm',
    },

    // ===== 조건부 발생 이벤트 (Medium Confidence) =====
    {
      eventName: 'select_item',
      expectedOnPage: false, // MAIN에서는 발생하지 않아야 함
      confidence: 'medium',
      triggerCondition: '상품 리스트/검색 결과 페이지에서만 발생 (MAIN 아님)',
      expectedParameters: ['item_id', 'item_name', 'item_list_name'],
      source: 'devguide',
    },
    {
      eventName: 'login',
      expectedOnPage: true,
      confidence: 'medium',
      triggerCondition: '로그인 완료 시 (모든 페이지에서 가능)',
      expectedParameters: ['method'],
      source: 'devguide',
    },
    {
      eventName: 'sign_up',
      expectedOnPage: true,
      confidence: 'medium',
      triggerCondition: '회원가입 완료 시 (모든 페이지에서 가능)',
      expectedParameters: ['method'],
      source: 'devguide',
    },

    // ===== 발생하면 안 되는 이벤트 (Should NOT fire) =====
    {
      eventName: 'view_item',
      expectedOnPage: false,
      confidence: 'high',
      triggerCondition: '상품 상세 페이지에서만 발생 (MAIN 아님)',
      expectedParameters: ['item_id', 'item_name', 'price'],
      source: 'devguide',
    },
    {
      eventName: 'add_to_cart',
      expectedOnPage: false,
      confidence: 'high',
      triggerCondition: '상품 상세/리스트 페이지에서 장바구니 추가 시 (MAIN 아님)',
      expectedParameters: ['item_id', 'item_name', 'quantity'],
      source: 'devguide',
    },
    {
      eventName: 'begin_checkout',
      expectedOnPage: false,
      confidence: 'high',
      triggerCondition: '주문서 페이지에서만 발생 (MAIN 아님)',
      expectedParameters: ['value', 'currency', 'items[]'],
      source: 'devguide',
    },
    {
      eventName: 'purchase',
      expectedOnPage: false,
      confidence: 'high',
      triggerCondition: '구매 완료 페이지에서만 발생 (MAIN 아님)',
      expectedParameters: ['transaction_id', 'value', 'items[]'],
      source: 'devguide',
    },

    // ===== 커스텀 이벤트 (Low Confidence - 상황에 따라) =====
    {
      eventName: 'ap_click',
      expectedOnPage: true,
      confidence: 'low',
      triggerCondition: '특정 영역 클릭 추적 (모든 페이지에서 가능)',
      expectedParameters: ['ap-click-area', 'ap-click-name', 'ap-click-data'],
      source: 'gtm',
    },
    {
      eventName: 'custom_event',
      expectedOnPage: true,
      confidence: 'low',
      triggerCondition: '다양한 커스텀 추적 (모든 페이지에서 가능)',
      expectedParameters: ['event_category', 'event_action', 'event_label'],
      source: 'gtm',
    },
  ];

  // Edge Case 적용
  predictions = applyEdgeCases(predictions, 'MAIN');

  return predictions;
}

/**
 * 이벤트 비교 분석 및 verdict 결정
 */
function analyzeEvent(
  prediction: EventPrediction | undefined,
  actualEvent: { eventName: string; eventCount: number; proportion: number; isNoise: boolean } | undefined
): ComparisonResult {
  const eventName = prediction?.eventName || actualEvent?.eventName || '';
  const predicted = prediction?.expectedOnPage ?? false;
  const actuallyCollected = actualEvent !== undefined && actualEvent.eventCount > 0;
  const eventCount = actualEvent?.eventCount ?? 0;
  const proportion = actualEvent?.proportion ?? 0;
  const isNoise = actualEvent?.isNoise ?? false;

  let verdict: ComparisonResult['verdict'];
  let analysis: string;

  if (predicted && actuallyCollected && !isNoise) {
    verdict = 'CORRECT';
    analysis = `✅ 정확한 예측: 예상대로 발생하며 유의미한 비중 (${(proportion * 100).toFixed(2)}%)`;
  } else if (predicted && actuallyCollected && isNoise) {
    verdict = 'EXPECTED_NOISE';
    analysis = `⚠️ 예측은 맞았으나 노이즈 수준: 발생 비중이 매우 낮음 (${(proportion * 100).toFixed(4)}%) - 트리거 조건 검토 필요`;
  } else if (predicted && !actuallyCollected) {
    verdict = 'FALSE_POSITIVE';
    analysis = `❌ 잘못된 예측: 발생할 것으로 예상했으나 실제로 수집되지 않음 - 트리거 구현 미비 가능성`;
  } else if (!predicted && actuallyCollected && !isNoise) {
    verdict = 'FALSE_NEGATIVE';
    analysis = `❌ 예측 누락: 발생하지 않을 것으로 예상했으나 유의미하게 수집됨 (${(proportion * 100).toFixed(2)}%) - 트리거 조건 재검토 필요`;
  } else if (!predicted && actuallyCollected && isNoise) {
    verdict = 'NOISE_COLLECTED';
    analysis = `🔇 노이즈 수집: 발생하지 않아야 하는데 노이즈 수준으로 수집됨 (${(proportion * 100).toFixed(4)}%) - 잘못된 트리거 또는 테스트 트래픽`;
  } else {
    verdict = 'CORRECT';
    analysis = `✅ 정확한 예측: 예상대로 발생하지 않음`;
  }

  return {
    eventName,
    predicted,
    actuallyCollected,
    eventCount,
    proportion,
    isNoise,
    verdict,
    analysis,
  };
}

/**
 * 노이즈 판단 로직 상세 설명
 */
function explainNoiseDetection(): string {
  return `
══════════════════════════════════════════════════════════════════════════════════
🔍 노이즈 판단 기준 및 원인 분석
══════════════════════════════════════════════════════════════════════════════════

1. 비중 기반 노이즈 판단:
   - 0.01% 미만: 확실한 노이즈 (테스트 트래픽, 봇, 오류)
   - 0.01% ~ 0.1%: 낮은 유의성 (주의 필요)
   - 0.1% 이상: 유의미한 이벤트

2. 노이즈 발생 원인:
   ┌─────────────────────────────────────────────────────────────────────┐
   │ 원인                    │ 설명                    │ 해결방안          │
   ├─────────────────────────────────────────────────────────────────────┤
   │ 잘못된 트리거 조건       │ GTM 트리거가 너무 넓게    │ 트리거 조건 수정  │
   │                         │ 설정됨                   │                   │
   ├─────────────────────────────────────────────────────────────────────┤
   │ 페이지 타입 미감지       │ AP_DATA_PAGETYPE 변수가   │ 변수 설정 확인    │
   │                         │ 올바르게 설정되지 않음    │                   │
   ├─────────────────────────────────────────────────────────────────────┤
   │ 테스트 트래픽            │ QA/개발 환경에서 발생한   │ 필터 적용         │
   │                         │ 데이터                   │                   │
   ├─────────────────────────────────────────────────────────────────────┤
   │ 크로스 페이지 이벤트     │ SPA에서 페이지 전환 시    │ 이벤트 타이밍     │
   │                         │ 이전 페이지 이벤트 수집   │ 조정              │
   └─────────────────────────────────────────────────────────────────────┘

3. 이벤트 관계 기반 검증:
   - view_item → add_to_cart: view_item 없이 add_to_cart만 발생하면 비정상
   - view_item_list → select_item: 리스트 조회 없이 선택만 발생하면 비정상
   - begin_checkout → purchase: checkout 없이 purchase만 발생하면 비정상

4. 페이지-이벤트 정합성 검증:
   - MAIN 페이지: view_promotion, select_promotion 허용
   - MAIN 페이지: view_item, add_to_cart, purchase 비허용
   - PRODUCT_DETAIL: view_item 필수, view_item_list 비허용
`;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║     MAIN 페이지 이벤트 예측 vs GA4 실제 데이터 비교 분석                       ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

  // 1. 예측 정의
  const predictions = defineMainPagePredictions();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 STEP 1: 개발가이드 기반 이벤트 예측');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const shouldFire = predictions.filter(p => p.expectedOnPage);
  const shouldNotFire = predictions.filter(p => !p.expectedOnPage);

  console.log('🟢 발생해야 하는 이벤트:');
  for (const p of shouldFire) {
    console.log(`   ${p.eventName.padEnd(20)} [${p.confidence.toUpperCase().padEnd(6)}] ${p.triggerCondition.substring(0, 50)}`);
  }

  console.log('\n🔴 발생하면 안 되는 이벤트:');
  for (const p of shouldNotFire) {
    console.log(`   ${p.eventName.padEnd(20)} [${p.confidence.toUpperCase().padEnd(6)}] ${p.triggerCondition.substring(0, 50)}`);
  }

  // 2. GA4 데이터 조회
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 STEP 2: GA4 실제 데이터 조회');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const ga4Client = createGA4ClientFromEnv();
  if (!ga4Client) {
    console.error('❌ GA4 클라이언트를 초기화할 수 없습니다. .env 파일을 확인하세요.');

    // 모의 데이터로 분석 계속
    console.log('\n⚠️ GA4 연결 없이 예측 분석만 진행합니다...\n');
    outputPredictionSummary(predictions);
    return;
  }

  try {
    await ga4Client.initialize();
    console.log('✅ GA4 연결 성공\n');

    // MAIN 페이지 이벤트 분석
    const mainPagePath = '/kr/ko/display/main';
    const analysis = await ga4Client.analyzePageEvents(mainPagePath, {
      startDate: '7daysAgo',
      endDate: 'today',
    });

    console.log(`📍 분석 페이지: ${mainPagePath}`);
    console.log(`📈 총 이벤트 수: ${analysis.totalEventCount.toLocaleString()}`);
    console.log(`✅ 유의미 이벤트: ${analysis.significantEvents.length}개`);
    console.log(`🔇 노이즈 이벤트: ${analysis.noiseEvents.length}개\n`);

    // 3. 비교 분석
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔬 STEP 3: 예측 vs 실제 비교 분석');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 이벤트를 Map으로 변환
    const actualEventsMap = new Map(
      analysis.events.map(e => [e.eventName, e])
    );
    const predictionsMap = new Map(
      predictions.map(p => [p.eventName, p])
    );

    // 모든 이벤트 이름 수집
    const allEventNames = new Set([
      ...predictions.map(p => p.eventName),
      ...analysis.events.map(e => e.eventName),
    ]);

    const results: ComparisonResult[] = [];
    for (const eventName of allEventNames) {
      const prediction = predictionsMap.get(eventName);
      const actualEvent = actualEventsMap.get(eventName);
      results.push(analyzeEvent(prediction, actualEvent));
    }

    // 결과 출력
    const correctResults = results.filter(r => r.verdict === 'CORRECT');
    const falsePositives = results.filter(r => r.verdict === 'FALSE_POSITIVE');
    const falseNegatives = results.filter(r => r.verdict === 'FALSE_NEGATIVE');
    const noiseCollected = results.filter(r => r.verdict === 'NOISE_COLLECTED');
    const expectedNoise = results.filter(r => r.verdict === 'EXPECTED_NOISE');

    console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
    console.log('│ 분석 결과 요약                                                              │');
    console.log('├─────────────────────────────────────────────────────────────────────────────┤');
    console.log(`│ ✅ 정확한 예측: ${correctResults.length}개                                                       │`);
    console.log(`│ ❌ 잘못된 예측 (발생 안함): ${falsePositives.length}개                                           │`);
    console.log(`│ ❌ 예측 누락 (예상외 발생): ${falseNegatives.length}개                                           │`);
    console.log(`│ 🔇 노이즈 수집됨: ${noiseCollected.length}개                                                      │`);
    console.log(`│ ⚠️ 예상했으나 노이즈 수준: ${expectedNoise.length}개                                            │`);
    console.log('└─────────────────────────────────────────────────────────────────────────────┘\n');

    // 상세 결과
    if (falseNegatives.length > 0) {
      console.log('❌ 예측 누락 - 에이전트 개선 필요:');
      for (const r of falseNegatives) {
        console.log(`   ${r.eventName}: ${r.analysis}`);
      }
      console.log('');
    }

    if (falsePositives.length > 0) {
      console.log('❌ 잘못된 예측 - 트리거 구현 확인 필요:');
      for (const r of falsePositives) {
        console.log(`   ${r.eventName}: ${r.analysis}`);
      }
      console.log('');
    }

    if (noiseCollected.length > 0) {
      console.log('🔇 노이즈 수집 - 데이터 품질 이슈:');
      for (const r of noiseCollected) {
        console.log(`   ${r.eventName}: ${r.analysis}`);
      }
      console.log('');
    }

    // 4. 노이즈 판단 설명
    console.log(explainNoiseDetection());

    // 5. 결과 저장
    const outputData = {
      analysisDate: new Date().toISOString(),
      pagePath: mainPagePath,
      predictions: predictions.map(p => ({
        eventName: p.eventName,
        expectedOnPage: p.expectedOnPage,
        confidence: p.confidence,
        triggerCondition: p.triggerCondition,
        source: p.source,
      })),
      actualGA4Data: {
        totalEventCount: analysis.totalEventCount,
        events: analysis.events.map(e => ({
          eventName: e.eventName,
          eventCount: e.eventCount,
          proportion: e.proportion,
          percentString: e.percentString,
          isNoise: e.isNoise,
        })),
      },
      comparisonResults: results,
      summary: {
        correctPredictions: correctResults.length,
        falsePositives: falsePositives.length,
        falseNegatives: falseNegatives.length,
        noiseCollected: noiseCollected.length,
        expectedNoise: expectedNoise.length,
        accuracy: (correctResults.length / predictions.length * 100).toFixed(2) + '%',
      },
    };

    fs.writeFileSync(
      './output/main_page_event_analysis.json',
      JSON.stringify(outputData, null, 2)
    );
    console.log('\n✅ 분석 결과 저장됨: ./output/main_page_event_analysis.json');

  } catch (error: any) {
    console.error('❌ GA4 조회 오류:', error.message);
    console.log('\n⚠️ GA4 연결 없이 예측 분석만 출력합니다...\n');
    outputPredictionSummary(predictions);
  }
}

function outputPredictionSummary(predictions: EventPrediction[]) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 MAIN 페이지 이벤트 예측 요약 (GA4 데이터 없음)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('┌─────────────────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ Event Name          │ Expected │ Confidence │ Trigger Condition                        │');
  console.log('├─────────────────────────────────────────────────────────────────────────────────────────┤');

  for (const p of predictions) {
    const name = p.eventName.padEnd(20);
    const expected = (p.expectedOnPage ? '✅ Yes' : '❌ No').padEnd(9);
    const conf = p.confidence.toUpperCase().padEnd(10);
    const trigger = p.triggerCondition.substring(0, 38).padEnd(38);
    console.log(`│ ${name}│ ${expected}│ ${conf}│ ${trigger}│`);
  }

  console.log('└─────────────────────────────────────────────────────────────────────────────────────────┘');

  console.log(explainNoiseDetection());

  // 예측만 저장
  const outputData = {
    analysisDate: new Date().toISOString(),
    pagePath: '/kr/ko/display/main',
    predictions: predictions,
    actualGA4Data: null,
    comparisonResults: null,
    note: 'GA4 데이터 없이 예측만 저장됨',
  };

  fs.writeFileSync(
    './output/main_page_event_analysis.json',
    JSON.stringify(outputData, null, 2)
  );
  console.log('\n✅ 예측 결과 저장됨: ./output/main_page_event_analysis.json');
}

main().catch(console.error);
