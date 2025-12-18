/**
 * Vision AI 예측 → GA4 API 검증 테스트
 *
 * 1. Vision AI로 페이지의 모든 이벤트와 파라미터 예측
 * 2. GA4 Data API로 실제 수집된 이벤트/파라미터 조회
 * 3. 예측 vs 실제 비교 분석
 */

import { config } from 'dotenv';
config(); // .env 파일 로드

import { chromium, Browser } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GA4Client } from './ga4';
import {
  getSiteConfig,
  generateEventDescriptionForPrompt,
  generatePageTypeEventsPrompt,
  AMOREMALL_CONFIG,
} from './config/siteEventConfig';

// ═══════════════════════════════════════════════════════════════════════════
// 설정
// ═══════════════════════════════════════════════════════════════════════════

const TARGET_URL = 'https://www.amoremall.com/kr/ko/display/brand/detail/all?brandSn=18';
const OUTPUT_DIR = './output/predict-verify';

interface PredictedEvent {
  eventName: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  parameters: {
    key: string;
    predictedValue: string | number | null;
    valueSource: string; // 어디서 추출했는지
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  }[];
}

interface VerificationResult {
  url: string;
  pageType: string;
  timestamp: string;
  predictions: PredictedEvent[];
  ga4ActualEvents: {
    eventName: string;
    eventCount: number;
    parameters?: Record<string, any>;
  }[];
  comparison: {
    predictedCount: number;
    actualCount: number;
    matchedEvents: string[];
    missedEvents: string[];  // 예측했지만 실제 없음
    unexpectedEvents: string[];  // 예측 못했지만 실제 있음
    parameterAccuracy: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Vision AI 이벤트 예측
// ═══════════════════════════════════════════════════════════════════════════

async function predictEventsWithVisionAI(
  screenshotPath: string,
  pageUrl: string,
  apiKey: string,
  pageType: string = 'BRAND_DETAIL'
): Promise<PredictedEvent[]> {
  console.log('\n═'.repeat(70));
  console.log('📍 Vision AI 이벤트 예측 (사이트 커스텀 이벤트 포함)');
  console.log('═'.repeat(70));

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  // 이미지 로드
  const imageBuffer = fs.readFileSync(screenshotPath);
  const imageBase64 = imageBuffer.toString('base64');
  const mimeType = screenshotPath.endsWith('.png') ? 'image/png' : 'image/jpeg';

  // 사이트 설정 가져오기
  const siteConfig = AMOREMALL_CONFIG;
  const eventDescriptions = generateEventDescriptionForPrompt(siteConfig);
  const pageTypeEvents = generatePageTypeEventsPrompt(siteConfig, pageType);

  // Vision AI에게 페이지 분석 요청 (개선된 프롬프트)
  const prompt = `
당신은 GA4 이벤트 분석 전문가입니다.
이 스크린샷은 **아모레몰(amoremall.com)** 사이트의 페이지입니다.
이 사이트에서는 표준 GA4 이벤트뿐만 아니라 **아모레퍼시픽 커스텀 이벤트**도 수집합니다.

## 분석 대상 URL
${pageUrl}

## 페이지 타입
${pageType}

${eventDescriptions}

${pageTypeEvents}

## 중요: 아모레퍼시픽 커스텀 이벤트 상세 설명

### ap_click (모든 클릭 추적)
- **트리거**: 페이지 내 모든 클릭 가능한 요소 (버튼, 링크, 상품, 배너 등)
- **수집 빈도**: 매우 높음 (모든 클릭에서 발생)
- **파라미터**: click_element, click_text, click_url

### brand_product_click (브랜드관 상품 클릭)
- **트리거**: 브랜드 페이지에서 상품 클릭 시 발생
- **조건**: BRAND_DETAIL, BRAND_HOME 페이지에서만 발생
- **파라미터**: brand_name, product_name, product_price, product_index

### screen_view (화면 조회)
- **트리거**: 페이지 로드 시 자동 발생
- **수집 빈도**: 매우 높음
- **파라미터**: screen_name, screen_class

### click_with_duration (체류시간 포함 클릭)
- **트리거**: 일정 시간 체류 후 클릭 시 발생
- **파라미터**: duration_seconds, click_element

### qualified_visit (품질 방문)
- **트리거**: 페이지에서 10초 이상 체류 시 발생
- **수집 조건**: 단순 이탈이 아닌 실질적 방문

### ap_timer_10s (10초 타이머)
- **트리거**: 페이지 로드 후 10초 경과 시 자동 발생
- **파라미터**: timer_duration_sec

### scroll (스크롤)
- **트리거**: 페이지 스크롤 시 25%, 50%, 75%, 90% 지점에서 발생
- **수집 빈도**: 매우 높음 (가장 많이 수집되는 이벤트 중 하나)
- **파라미터**: percent_scrolled

### view_promotion (프로모션 노출)
- **트리거**: 프로모션 배너가 화면에 노출될 때 발생
- **파라미터**: promotion_id, promotion_name, creative_name

### custom_event (기타 커스텀 이벤트)
- **트리거**: 다양한 사용자 상호작용
- **파라미터**: event_category, event_action, event_label

## 요청사항
1. **이 페이지에서 수집되는 모든 GA4 이벤트를 예측** (표준 + 커스텀)
2. 위의 커스텀 이벤트 목록을 반드시 참고하여 누락 없이 예측
3. 각 이벤트의 파라미터와 예상 값을 추출
4. 클릭 가능한 요소가 있으면 ap_click 이벤트 반드시 포함
5. 브랜드 페이지면 brand_product_click 이벤트 반드시 포함
6. 페이지 로드 시 screen_view, qualified_visit, scroll 등 자동 이벤트 포함
7. **scroll 이벤트는 거의 모든 페이지에서 발생하므로 반드시 포함**
8. **각 이벤트는 중복 없이 한 번씩만 예측** (같은 이벤트를 여러 번 나열하지 말 것)
9. 프로모션 배너가 보이면 view_promotion 이벤트 포함

## 각 이벤트별 필수 파라미터 (반드시 추출해야 함)

### page_view
- page_title: 페이지 제목 (브라우저 탭 제목 또는 헤더)
- page_location: 전체 URL

### screen_view
- screen_name: 화면 이름 (페이지 타입 또는 제목)
- screen_class: 화면 클래스명

### view_item_list
- item_list_id: 목록 ID (페이지 타입 기반, 예: "brand_detail_all")
- item_list_name: 목록 이름 (화면에 표시된 카테고리명)
- items: 상품 배열 (최소 3개 상품의 item_name, item_id, price, index 포함)

### brand_product_click
- brand_name: 브랜드명 (화면 상단 로고/텍스트에서 추출)
- product_name: 상품명 (정확한 텍스트)
- product_price: 가격 (숫자만, 쉼표/원 제거)
- product_index: 상품 순서 (1부터 시작)

### ap_click
- click_element: 클릭 요소 타입 (button, link, product 등)
- click_text: 클릭한 텍스트
- click_url: 이동할 URL (추론)

### scroll
- percent_scrolled: 스크롤 비율 (25, 50, 75, 90 중 하나)

### qualified_visit
- event_action: "qualified" (고정값)
- event_label: 페이지 URL 또는 제목

### view_promotion
- promotion_id: 프로모션 ID (추론)
- promotion_name: 프로모션 이름/문구 (배너 텍스트)
- creative_name: 배너 이름

## 출력 형식 (JSON)
\`\`\`json
{
  "pageType": "페이지 타입",
  "predictedEvents": [
    {
      "eventName": "이벤트명",
      "confidence": "HIGH/MEDIUM/LOW",
      "reason": "이 이벤트가 발생해야 하는 이유",
      "parameters": [
        {
          "key": "파라미터 키",
          "predictedValue": "예측된 값 (화면에서 추출한 실제 값)",
          "valueSource": "값을 추출한 화면 위치 (구체적으로)",
          "confidence": "HIGH/MEDIUM/LOW"
        }
      ]
    }
  ]
}
\`\`\`

## 중요 주의사항
- **모든 이벤트에 대해 위에 정의된 필수 파라미터를 반드시 포함**
- **파라미터 값은 화면에서 직접 추출한 실제 텍스트/숫자 사용**
- **view_item_list의 items 파라미터에는 화면에 보이는 상품들의 상세 정보 포함**
- 가격은 숫자만 추출 (135,000원 → 135000)
- 브랜드명은 화면 상단 로고 또는 헤더에서 정확히 추출
- 상품명은 말줄임(...) 없이 보이는 그대로 추출
`;

  try {
    const result = await model.generateContent([
      { inlineData: { mimeType, data: imageBase64 } },
      { text: prompt },
    ]);

    const responseText = result.response.text();

    // JSON 파싱
    const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      console.log(`   페이지 타입: ${parsed.pageType}`);
      console.log(`   예측된 이벤트: ${parsed.predictedEvents?.length || 0}개`);
      return parsed.predictedEvents || [];
    }

    // JSON 블록 없으면 직접 파싱 시도
    const jsonStart = responseText.indexOf('{');
    const jsonEnd = responseText.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const parsed = JSON.parse(responseText.substring(jsonStart, jsonEnd + 1));
      return parsed.predictedEvents || [];
    }

    console.log('   ⚠️ JSON 파싱 실패, 원본 응답:', responseText.substring(0, 500));
    return [];
  } catch (error: any) {
    console.error('   ❌ Vision AI 오류:', error.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GA4 API로 실제 이벤트 조회
// ═══════════════════════════════════════════════════════════════════════════

async function getActualEventsFromGA4(
  pagePath: string,
  accessToken: string,
  propertyId: string
): Promise<{ eventName: string; eventCount: number }[]> {
  console.log('\n═'.repeat(70));
  console.log('📍 GA4 API 실제 이벤트 조회');
  console.log('═'.repeat(70));

  try {
    const client = new GA4Client({
      propertyId,
      accessToken,
    });

    await client.initialize();

    // 해당 페이지 경로의 이벤트 조회
    console.log(`   페이지 경로: ${pagePath}`);
    console.log(`   조회 기간: 7daysAgo ~ today`);

    const pageEvents = await client.getEventsByPage(pagePath, {
      startDate: '7daysAgo',
      endDate: 'today',
      limit: 100,
    });

    // 페이지별로 그룹화된 결과에서 해당 페이지만 추출
    const events: { eventName: string; eventCount: number }[] = [];

    for (const pe of pageEvents) {
      if (pe.pagePath.includes(pagePath) || pagePath.includes(pe.pagePath)) {
        events.push({
          eventName: pe.eventName,
          eventCount: pe.eventCount,
        });
      }
    }

    // 이벤트명으로 정렬
    events.sort((a, b) => b.eventCount - a.eventCount);

    console.log(`   조회된 이벤트: ${events.length}개`);
    return events;
  } catch (error: any) {
    console.error('   ❌ GA4 API 오류:', error.message);

    // 저장된 토큰 확인
    const tokenPath = './credentials/ga4_tokens.json';
    if (fs.existsSync(tokenPath)) {
      console.log('   💡 토큰 파일 존재함. 토큰 만료 여부 확인 필요');
    } else {
      console.log('   💡 토큰 파일 없음. 먼저 토큰 설정 필요:');
      console.log('      npx ts-node src/cli.ts ga4 set-token -t <TOKEN>');
    }

    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 예측 vs 실제 비교
// ═══════════════════════════════════════════════════════════════════════════

function compareResults(
  predictions: PredictedEvent[],
  actualEvents: { eventName: string; eventCount: number }[]
): VerificationResult['comparison'] {
  // 중복 제거하여 고유 이벤트명만 비교
  const predictedNames = new Set(predictions.map(p => p.eventName.toLowerCase()));
  const actualNames = new Set(actualEvents.map(e => e.eventName.toLowerCase()));

  console.log(`\n   📊 예측한 고유 이벤트: ${predictedNames.size}개`);
  console.log(`   📊 실제 고유 이벤트: ${actualNames.size}개`);

  const matchedEvents: string[] = [];
  const missedEvents: string[] = [];
  const unexpectedEvents: string[] = [];

  // 예측한 이벤트 중 실제 있는 것
  for (const name of predictedNames) {
    if (actualNames.has(name)) {
      matchedEvents.push(name);
    } else {
      missedEvents.push(name);
    }
  }

  // 실제 있지만 예측 못한 것 (GA4 자동 수집 이벤트만 제외)
  // 커스텀 이벤트는 예측해야 하므로 제외하지 않음
  const ga4AutoEvents = new Set([
    'session_start', 'first_visit', 'user_engagement',
    'click', 'file_download', 'video_start', 'video_progress',
    'video_complete', 'form_start', 'form_submit'
  ]);

  for (const name of actualNames) {
    if (!predictedNames.has(name) && !ga4AutoEvents.has(name)) {
      unexpectedEvents.push(name);
    }
  }

  // 정확도 계산: 예측한 이벤트 중 실제 수집된 비율 (고유 이벤트 기준)
  const predictionAccuracy = predictedNames.size > 0
    ? (matchedEvents.length / predictedNames.size) * 100
    : 0;

  // 커버리지 계산: 실제 이벤트 중 예측한 비율 (자동 이벤트 제외)
  const nonAutoActual = [...actualNames].filter(n => !ga4AutoEvents.has(n));
  const coverageAccuracy = nonAutoActual.length > 0
    ? (matchedEvents.length / nonAutoActual.length) * 100
    : 0;

  console.log(`\n   📈 예측 정확도: ${predictionAccuracy.toFixed(1)}% (예측 성공 / 고유 예측 이벤트)`);
  console.log(`   📈 커버리지: ${coverageAccuracy.toFixed(1)}% (예측 성공 / 실제 이벤트)`);

  return {
    predictedCount: predictedNames.size,  // 고유 이벤트 수로 변경
    actualCount: actualNames.size,        // 고유 이벤트 수로 변경
    matchedEvents,
    missedEvents,
    unexpectedEvents,
    parameterAccuracy: predictionAccuracy,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 결과 출력
// ═══════════════════════════════════════════════════════════════════════════

function printResults(result: VerificationResult): void {
  console.log('\n' + '═'.repeat(70));
  console.log('📊 예측 vs 실제 비교 결과');
  console.log('═'.repeat(70));

  console.log(`
┌─────────────────────────────────────────────────────────────────────────┐
│                         비교 결과 요약                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  URL: ${result.url.substring(0, 55)}...
│  페이지 타입: ${result.pageType}
│  분석 시간: ${result.timestamp}
├─────────────────────────────────────────────────────────────────────────┤
│  예측 이벤트: ${result.comparison.predictedCount}개
│  실제 이벤트: ${result.comparison.actualCount}개
│  일치 이벤트: ${result.comparison.matchedEvents.length}개
│  예측 정확도: ${result.comparison.parameterAccuracy.toFixed(1)}%
└─────────────────────────────────────────────────────────────────────────┘
`);

  // 예측된 이벤트 상세
  console.log('\n📋 예측된 이벤트 상세:');
  for (const pred of result.predictions) {
    const matched = result.comparison.matchedEvents.includes(pred.eventName.toLowerCase());
    const icon = matched ? '✅' : '❌';
    console.log(`\n   ${icon} ${pred.eventName} (${pred.confidence})`);
    console.log(`      이유: ${pred.reason}`);
    console.log(`      파라미터:`);
    for (const param of pred.parameters.slice(0, 5)) {
      console.log(`         - ${param.key}: "${param.predictedValue}" (${param.valueSource})`);
    }
    if (pred.parameters.length > 5) {
      console.log(`         ... 외 ${pred.parameters.length - 5}개`);
    }
  }

  // 실제 GA4 이벤트
  console.log('\n📋 GA4 실제 수집 이벤트 (상위 15개):');
  for (const actual of result.ga4ActualEvents.slice(0, 15)) {
    const predicted = result.predictions.some(
      p => p.eventName.toLowerCase() === actual.eventName.toLowerCase()
    );
    const icon = predicted ? '✅' : '🔵';
    console.log(`   ${icon} ${actual.eventName}: ${actual.eventCount.toLocaleString()}회`);
  }

  // 비교 결과
  if (result.comparison.matchedEvents.length > 0) {
    console.log('\n✅ 예측 성공 (일치):');
    for (const name of result.comparison.matchedEvents) {
      console.log(`   - ${name}`);
    }
  }

  if (result.comparison.missedEvents.length > 0) {
    console.log('\n❌ 예측 실패 (미수집):');
    for (const name of result.comparison.missedEvents) {
      console.log(`   - ${name} (예측했지만 GA4에 없음)`);
    }
  }

  if (result.comparison.unexpectedEvents.length > 0) {
    console.log('\n🔵 미예측 이벤트 (실제 수집됨):');
    for (const name of result.comparison.unexpectedEvents) {
      console.log(`   - ${name} (예측 못함)`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 메인 실행
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     Vision AI 예측 → GA4 API 검증                              ║');
  console.log('║     이벤트 및 파라미터 예측 정확도 측정                         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // 환경변수 확인
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const ga4PropertyId = process.env.GA4_PROPERTY_ID;

  if (!geminiApiKey) {
    console.error('❌ GEMINI_API_KEY 환경변수가 필요합니다.');
    process.exit(1);
  }

  // GA4 토큰 확인
  let ga4AccessToken: string | null = null;
  const tokenPath = './credentials/ga4_tokens.json';
  if (fs.existsSync(tokenPath)) {
    try {
      const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
      ga4AccessToken = tokens.access_token;
      console.log('✅ GA4 토큰 로드됨');
    } catch {
      console.log('⚠️ GA4 토큰 파일 읽기 실패');
    }
  }

  // 출력 디렉토리 생성
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let browser: Browser | null = null;

  try {
    // 1. 브라우저로 스크린샷 캡처
    console.log('═'.repeat(70));
    console.log('📍 1. 스크린샷 캡처');
    console.log('═'.repeat(70));

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      locale: 'ko-KR',
    });
    const page = await context.newPage();

    console.log(`   URL: ${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);

    const screenshotPath = path.join(OUTPUT_DIR, `screenshot_${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`   ✅ 스크린샷 저장: ${screenshotPath}`);

    await browser.close();
    browser = null;

    // 2. Vision AI 예측
    const predictions = await predictEventsWithVisionAI(
      screenshotPath,
      TARGET_URL,
      geminiApiKey
    );

    // 예측 결과 출력
    console.log('\n   예측된 이벤트 목록:');
    for (const pred of predictions) {
      console.log(`   - ${pred.eventName} (${pred.confidence}): ${pred.parameters.length}개 파라미터`);
    }

    // 3. GA4 API 조회
    let ga4Events: { eventName: string; eventCount: number }[] = [];

    if (ga4AccessToken && ga4PropertyId) {
      const pagePath = '/kr/ko/display/brand/detail';
      ga4Events = await getActualEventsFromGA4(
        pagePath,
        ga4AccessToken,
        ga4PropertyId
      );
    } else {
      console.log('\n⚠️ GA4 API 토큰 또는 Property ID가 없습니다.');
      console.log('   토큰 설정: npx ts-node src/cli.ts ga4 set-token -t <TOKEN> -p <PROPERTY_ID>');
      console.log('   또는 .env 파일에 GA4_PROPERTY_ID 추가');
    }

    // 4. 비교 분석
    const comparison = compareResults(predictions, ga4Events);

    // 5. 결과 생성
    const result: VerificationResult = {
      url: TARGET_URL,
      pageType: 'BRAND_DETAIL',
      timestamp: new Date().toISOString(),
      predictions,
      ga4ActualEvents: ga4Events,
      comparison,
    };

    // 6. 결과 출력
    printResults(result);

    // 7. 결과 저장
    const resultPath = path.join(OUTPUT_DIR, `verify_result_${Date.now()}.json`);
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
    console.log(`\n💾 결과 저장: ${resultPath}`);

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main().catch(error => {
  console.error('❌ 오류:', error.message);
  process.exit(1);
});
