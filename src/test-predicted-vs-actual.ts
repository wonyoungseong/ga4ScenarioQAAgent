/**
 * Predicted vs Actual Comparison Test
 *
 * Vision AI 예측값과 실제 GA4 dataLayer 수집값을 비교합니다.
 * 목표: 예측값과 실제값의 100% 일치
 */

import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { GeminiVisionAnalyzer } from './analyzers/visionAnalyzer';
import { DataLayerCapture } from './capture/dataLayerCapture';
import { ParameterValidator } from './validation/parameterValidator';
import {
  ParameterValuePrediction,
  DataLayerEvent,
} from './types/parameterPrediction';

// ═══════════════════════════════════════════════════════════════════════════
// 설정
// ═══════════════════════════════════════════════════════════════════════════

const TARGET_URL = 'https://www.amoremall.com/kr/ko/display/brand/detail/all?brandSn=18';
const OUTPUT_DIR = './output/predicted-vs-actual';

interface ComparisonResult {
  url: string;
  timestamp: string;
  events: EventComparison[];
  summary: {
    totalEvents: number;
    matchedEvents: number;
    totalParams: number;
    matchedParams: number;
    accuracy: number;
  };
  recommendations: string[];
}

interface EventComparison {
  eventName: string;
  predicted: {
    fired: boolean;
    params: Record<string, any>;
  };
  actual: {
    fired: boolean;
    params: Record<string, any>;
  };
  paramComparisons: ParamComparison[];
  match: boolean;
}

interface ParamComparison {
  paramName: string;
  predicted: any;
  actual: any;
  match: boolean;
  matchType: 'EXACT' | 'NORMALIZED' | 'PARTIAL' | 'MISMATCH' | 'MISSING_PREDICTED' | 'MISSING_ACTUAL';
  recommendation?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 메인 분석 함수
// ═══════════════════════════════════════════════════════════════════════════

async function analyzePagePredictedVsActual(url: string): Promise<ComparisonResult> {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║        Predicted vs Actual Comparison                          ║');
  console.log('║        Vision AI 예측 vs GA4 실제 수집 비교                     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY 환경변수가 필요합니다.');
  }

  // 출력 디렉토리 생성
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let browser: Browser | null = null;

  try {
    // 1. 브라우저 시작
    console.log('═'.repeat(70));
    console.log('📍 1. 브라우저 시작 및 페이지 로드');
    console.log('═'.repeat(70));

    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      locale: 'ko-KR',
    });
    const page = await context.newPage();

    // dataLayer 캡처 설정
    const dataLayerCapture = new DataLayerCapture();
    await dataLayerCapture.initialize(page);

    console.log(`\n   URL: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    console.log('   ✅ 페이지 로드 완료');

    // 페이지 안정화 대기
    await page.waitForTimeout(3000);

    // 2. 스크린샷 캡처
    console.log('\n═'.repeat(70));
    console.log('📍 2. 스크린샷 캡처');
    console.log('═'.repeat(70));

    const screenshotPath = path.join(OUTPUT_DIR, `screenshot_${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`   ✅ 스크린샷 저장: ${screenshotPath}`);

    // 3. 실제 dataLayer 수집
    console.log('\n═'.repeat(70));
    console.log('📍 3. 실제 dataLayer 이벤트 수집');
    console.log('═'.repeat(70));

    const capturedEvents = await dataLayerCapture.getCapturedEvents();
    console.log(`   ✅ 수집된 이벤트: ${capturedEvents.length}개`);

    // 이벤트 목록 출력
    const eventsByName = new Map<string, DataLayerEvent[]>();
    for (const event of capturedEvents) {
      const name = event.event || 'unknown';
      if (!eventsByName.has(name)) {
        eventsByName.set(name, []);
      }
      eventsByName.get(name)!.push(event);
    }

    console.log('\n   수집된 이벤트 목록:');
    for (const [name, events] of eventsByName) {
      console.log(`   - ${name}: ${events.length}개`);
    }

    // 4. Vision AI 예측
    console.log('\n═'.repeat(70));
    console.log('📍 4. Vision AI 이벤트/파라미터 예측');
    console.log('═'.repeat(70));

    const analyzer = new GeminiVisionAnalyzer(apiKey);

    // 페이지 타입 판단 - 브랜드 상세 페이지
    const pageType = 'BRAND_DETAIL';
    const possibleEvents = ['view_item_list', 'view_item', 'select_item', 'view_promotion'];

    console.log(`   페이지 타입: ${pageType}`);
    console.log(`   예상 가능 이벤트: ${possibleEvents.join(', ')}`);

    // Vision AI로 파라미터 값 예측
    const predictions: ParameterValuePrediction[] = [];

    for (const eventName of possibleEvents) {
      try {
        const context = analyzer.getDefaultExtractionContext(eventName, pageType);
        const prediction = await analyzer.extractParameterValues(
          screenshotPath,
          context,
          url
        );
        predictions.push(prediction);
        console.log(`   ✅ ${eventName} 예측 완료`);
      } catch (e: any) {
        console.log(`   ⚠️ ${eventName} 예측 실패: ${e.message}`);
      }
    }

    // 5. 비교 분석
    console.log('\n═'.repeat(70));
    console.log('📍 5. 예측 vs 실제 비교 분석');
    console.log('═'.repeat(70));

    const eventComparisons: EventComparison[] = [];
    const recommendations: string[] = [];

    // 각 예측에 대해 실제 데이터와 비교
    for (const prediction of predictions) {
      const eventName = prediction.eventName;
      const actualEvents = eventsByName.get(eventName) || [];

      const comparison: EventComparison = {
        eventName,
        predicted: {
          fired: true,
          params: {
            eventParams: prediction.eventParams,
            items: prediction.items,
          },
        },
        actual: {
          fired: actualEvents.length > 0,
          params: actualEvents.length > 0 ? extractParamsFromDataLayer(actualEvents[0]) : {},
        },
        paramComparisons: [],
        match: false,
      };

      // 파라미터별 비교
      if (actualEvents.length > 0) {
        const actualEvent = actualEvents[0];
        comparison.paramComparisons = compareParams(prediction, actualEvent);

        // 불일치 항목에 대한 권장사항
        for (const pc of comparison.paramComparisons) {
          if (!pc.match) {
            if (pc.matchType === 'MISSING_ACTUAL') {
              recommendations.push(
                `[${eventName}] ${pc.paramName}: 예측됨 "${pc.predicted}" but 실제 dataLayer에 없음`
              );
            } else if (pc.matchType === 'MISSING_PREDICTED') {
              recommendations.push(
                `[${eventName}] ${pc.paramName}: dataLayer에 "${pc.actual}" 있지만 예측 못함`
              );
            } else if (pc.matchType === 'MISMATCH') {
              recommendations.push(
                `[${eventName}] ${pc.paramName}: 예측 "${pc.predicted}" ≠ 실제 "${pc.actual}"`
              );
            }
          }
        }
      } else {
        recommendations.push(
          `[${eventName}] 이벤트가 예측되었지만 실제 dataLayer에서 수집되지 않음`
        );
      }

      comparison.match = comparison.paramComparisons.every(pc => pc.match);
      eventComparisons.push(comparison);
    }

    // 실제로 발생했지만 예측하지 못한 이벤트
    for (const [eventName, events] of eventsByName) {
      if (!predictions.some(p => p.eventName === eventName)) {
        // GA4 자동 수집 이벤트는 제외
        const autoEvents = ['page_view', 'session_start', 'first_visit', 'user_engagement', 'scroll'];
        if (!autoEvents.includes(eventName)) {
          recommendations.push(
            `[${eventName}] 실제 발생했지만 예측하지 못함 (수집 ${events.length}회)`
          );
        }
      }
    }

    // 6. 결과 요약
    console.log('\n═'.repeat(70));
    console.log('📍 6. 비교 결과 요약');
    console.log('═'.repeat(70));

    const totalParams = eventComparisons.reduce((sum, ec) => sum + ec.paramComparisons.length, 0);
    const matchedParams = eventComparisons.reduce(
      (sum, ec) => sum + ec.paramComparisons.filter(pc => pc.match).length,
      0
    );
    const accuracy = totalParams > 0 ? (matchedParams / totalParams) * 100 : 0;

    const result: ComparisonResult = {
      url,
      timestamp: new Date().toISOString(),
      events: eventComparisons,
      summary: {
        totalEvents: eventComparisons.length,
        matchedEvents: eventComparisons.filter(ec => ec.match).length,
        totalParams,
        matchedParams,
        accuracy,
      },
      recommendations,
    };

    // 결과 출력
    printComparisonResult(result);

    // 결과 저장
    const resultPath = path.join(OUTPUT_DIR, `comparison_${Date.now()}.json`);
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
    console.log(`\n💾 결과 저장: ${resultPath}`);

    return result;

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 헬퍼 함수
// ═══════════════════════════════════════════════════════════════════════════

function extractParamsFromDataLayer(event: DataLayerEvent): Record<string, any> {
  const params: Record<string, any> = { ...event.data };

  if (event.ecommerce) {
    params.ecommerce = event.ecommerce;
  }

  return params;
}

function compareParams(
  prediction: ParameterValuePrediction,
  actualEvent: DataLayerEvent
): ParamComparison[] {
  const comparisons: ParamComparison[] = [];

  // Event-level 파라미터 비교
  for (const [key, pred] of Object.entries(prediction.eventParams)) {
    if (!pred) continue;
    const actualValue = actualEvent.data?.[key];
    const predictedValue = pred.value;

    comparisons.push({
      paramName: key,
      predicted: predictedValue,
      actual: actualValue,
      match: compareValues(predictedValue, actualValue),
      matchType: getMatchType(predictedValue, actualValue),
    });
  }

  // Item-level 파라미터 비교
  if (prediction.items && prediction.items.length > 0) {
    const actualItems = actualEvent.ecommerce?.items || [];

    for (let i = 0; i < prediction.items.length; i++) {
      const predItem = prediction.items[i];
      const actualItem = (actualItems[i] || {}) as Record<string, any>;

      for (const [key, pred] of Object.entries(predItem)) {
        if (!pred) continue;
        const actualValue = actualItem[key];
        const predictedValue = pred.value;

        comparisons.push({
          paramName: `items[${i}].${key}`,
          predicted: predictedValue,
          actual: actualValue,
          match: compareValues(predictedValue, actualValue),
          matchType: getMatchType(predictedValue, actualValue),
        });
      }
    }
  }

  return comparisons;
}

function compareValues(predicted: any, actual: any): boolean {
  if (predicted === null || predicted === undefined) {
    return actual === null || actual === undefined;
  }
  if (actual === null || actual === undefined) {
    return false;
  }

  // 숫자 비교
  if (typeof predicted === 'number' && typeof actual === 'number') {
    return predicted === actual;
  }

  // 문자열 정규화 비교
  const normPred = String(predicted).trim().toLowerCase();
  const normActual = String(actual).trim().toLowerCase();

  return normPred === normActual;
}

function getMatchType(predicted: any, actual: any): ParamComparison['matchType'] {
  if (predicted === null || predicted === undefined) {
    if (actual === null || actual === undefined) {
      return 'EXACT';
    }
    return 'MISSING_PREDICTED';
  }

  if (actual === null || actual === undefined) {
    return 'MISSING_ACTUAL';
  }

  // 정확히 일치
  if (predicted === actual) {
    return 'EXACT';
  }

  // 정규화 후 일치
  const normPred = String(predicted).trim().toLowerCase();
  const normActual = String(actual).trim().toLowerCase();

  if (normPred === normActual) {
    return 'NORMALIZED';
  }

  // 부분 일치 (한쪽이 다른 쪽을 포함)
  if (normPred.includes(normActual) || normActual.includes(normPred)) {
    return 'PARTIAL';
  }

  return 'MISMATCH';
}

function printComparisonResult(result: ComparisonResult): void {
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│                         비교 결과 요약                                  │');
  console.log('├─────────────────────────────────────────────────────────────────────────┤');
  console.log(`│  URL: ${result.url.substring(0, 60)}...`);
  console.log(`│  분석 시간: ${result.timestamp}`);
  console.log('├─────────────────────────────────────────────────────────────────────────┤');
  console.log(`│  📊 이벤트: ${result.summary.matchedEvents}/${result.summary.totalEvents} 일치`);
  console.log(`│  📊 파라미터: ${result.summary.matchedParams}/${result.summary.totalParams} 일치`);
  console.log(`│  📊 정확도: ${result.summary.accuracy.toFixed(1)}%`);
  console.log('└─────────────────────────────────────────────────────────────────────────┘');

  // 이벤트별 상세
  console.log('\n📋 이벤트별 비교 상세:');
  for (const ec of result.events) {
    const icon = ec.match ? '✅' : '❌';
    const actualIcon = ec.actual.fired ? '🟢' : '🔴';
    console.log(`\n   ${icon} ${ec.eventName}`);
    console.log(`      예측: 발생 | 실제: ${actualIcon} ${ec.actual.fired ? '발생' : '미발생'}`);

    if (ec.paramComparisons.length > 0) {
      console.log('      파라미터:');
      for (const pc of ec.paramComparisons) {
        const matchIcon = pc.match ? '✓' : '✗';
        const color = pc.match ? '' : ' ← 불일치';
        console.log(`         ${matchIcon} ${pc.paramName}: "${pc.predicted}" vs "${pc.actual}"${color}`);
      }
    }
  }

  // 권장사항
  if (result.recommendations.length > 0) {
    console.log('\n⚠️ 개선 권장사항:');
    for (const rec of result.recommendations) {
      console.log(`   - ${rec}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 실행
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  try {
    await analyzePagePredictedVsActual(TARGET_URL);
    console.log('\n=== 분석 완료 ===');
  } catch (error: any) {
    console.error('❌ 오류:', error.message);
    process.exit(1);
  }
}

main();
