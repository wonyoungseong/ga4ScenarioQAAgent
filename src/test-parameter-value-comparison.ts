/**
 * 파라미터 값 예측 vs 실제 값 비교 테스트
 *
 * 1. Vision AI로 이벤트 + 파라미터 값 예측
 * 2. dataLayer 캡처로 실제 파라미터 값 수집
 * 3. 예측 vs 실제 파라미터 값 비교
 */

import { config } from 'dotenv';
config();

import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { DataLayerCapture, captureGlobalVariables, extractProductFromDOM } from './capture/dataLayerCapture';
import {
  AMOREMALL_CONFIG,
  generateEventDescriptionForPrompt,
  generatePageTypeEventsPrompt,
} from './config/siteEventConfig';

// ═══════════════════════════════════════════════════════════════════════════
// 설정
// ═══════════════════════════════════════════════════════════════════════════

const TARGET_URL = 'https://www.amoremall.com/kr/ko/display/brand/detail/all?brandSn=18';
const OUTPUT_DIR = './output/parameter-comparison';
const PAGE_TYPE = 'BRAND_DETAIL';

interface PredictedParameter {
  key: string;
  predictedValue: string | number | null;
  valueSource: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface PredictedEvent {
  eventName: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  parameters: PredictedParameter[];
}

interface ParameterComparison {
  key: string;
  predictedValue: string | number | null;
  actualValue: string | number | null;
  match: boolean;
  matchType: 'EXACT' | 'NORMALIZED' | 'PARTIAL' | 'MISMATCH' | 'NOT_FOUND';
  notes?: string;
}

interface EventComparison {
  eventName: string;
  predicted: boolean;
  actualFound: boolean;
  parameterComparisons: ParameterComparison[];
  parameterAccuracy: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Vision AI 예측
// ═══════════════════════════════════════════════════════════════════════════

async function predictEventsWithVisionAI(
  screenshotPath: string,
  pageUrl: string,
  apiKey: string
): Promise<PredictedEvent[]> {
  console.log('\n═'.repeat(70));
  console.log('📍 Vision AI 이벤트 + 파라미터 예측');
  console.log('═'.repeat(70));

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const imageBuffer = fs.readFileSync(screenshotPath);
  const imageBase64 = imageBuffer.toString('base64');
  const mimeType = 'image/png';

  const siteConfig = AMOREMALL_CONFIG;
  const eventDescriptions = generateEventDescriptionForPrompt(siteConfig);
  const pageTypeEvents = generatePageTypeEventsPrompt(siteConfig, PAGE_TYPE);

  const prompt = `
당신은 GA4 이벤트 분석 전문가입니다.
이 스크린샷은 **아모레몰(amoremall.com)** 사이트의 ${PAGE_TYPE} 페이지입니다.

## 분석 대상 URL
${pageUrl}

${eventDescriptions}

${pageTypeEvents}

## 필수 추출 파라미터

### page_view
- page_title: 페이지 제목 (브라우저 탭 또는 헤더 텍스트)
- page_location: 전체 URL

### view_item_list
- item_list_id: 목록 ID (예: "brand_detail_sulwhasoo")
- item_list_name: 목록 이름 (화면에 표시된 카테고리명)
- items: 상품 배열 - 각 상품별로:
  - item_id: 상품 ID (URL에서 추출 또는 추론)
  - item_name: 정확한 상품명
  - item_brand: 브랜드명
  - price: 가격 (숫자만)
  - index: 순서 (0부터 시작)

### brand_product_click
- brand_name: 브랜드명 (페이지 상단 로고/텍스트)
- product_name: 상품명
- product_price: 가격 (숫자만)
- product_index: 순서

### ap_click
- click_element: 요소 타입
- click_text: 클릭 텍스트
- click_url: 이동 URL

## 중요: 화면에서 보이는 정확한 값을 추출하세요!
- 상품명: 화면에 보이는 그대로 (예: "자음2종 세트 (150ml+125ml)")
- 브랜드명: 화면 상단 로고 텍스트 (예: "Sulwhasoo" 또는 "설화수")
- 가격: 숫자만 추출 (135,000원 → 135000)
- 상품 목록의 각 상품 정보를 정확히 추출

## 출력 형식 (JSON)
\`\`\`json
{
  "pageType": "${PAGE_TYPE}",
  "predictedEvents": [
    {
      "eventName": "이벤트명",
      "confidence": "HIGH/MEDIUM/LOW",
      "reason": "발생 이유",
      "parameters": [
        {
          "key": "파라미터 키",
          "predictedValue": "화면에서 추출한 정확한 값",
          "valueSource": "값 추출 위치",
          "confidence": "HIGH/MEDIUM/LOW"
        }
      ]
    }
  ]
}
\`\`\`
`;

  try {
    const result = await model.generateContent([
      { inlineData: { mimeType, data: imageBase64 } },
      { text: prompt },
    ]);

    const responseText = result.response.text();
    const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      console.log(`   예측된 이벤트: ${parsed.predictedEvents?.length || 0}개`);
      return parsed.predictedEvents || [];
    }

    return [];
  } catch (error: any) {
    console.error('   ❌ Vision AI 오류:', error.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 파라미터 값 정규화 및 비교
// ═══════════════════════════════════════════════════════════════════════════

function normalizeValue(value: any): string {
  if (value === null || value === undefined) return '';

  const str = String(value);

  // 숫자 정규화: 쉼표, 원 등 제거
  if (/^[\d,\.]+$/.test(str.replace(/[원₩\s]/g, ''))) {
    return str.replace(/[^\d.]/g, '');
  }

  // 문자열 정규화: 공백 정리
  return str.trim().replace(/\s+/g, ' ');
}

function compareValues(predicted: any, actual: any): { match: boolean; matchType: ParameterComparison['matchType'] } {
  if (actual === null || actual === undefined) {
    return { match: false, matchType: 'NOT_FOUND' };
  }

  const normPredicted = normalizeValue(predicted);
  const normActual = normalizeValue(actual);

  // 완전 일치
  if (normPredicted === normActual) {
    return { match: true, matchType: 'EXACT' };
  }

  // 대소문자 무시 비교
  if (normPredicted.toLowerCase() === normActual.toLowerCase()) {
    return { match: true, matchType: 'NORMALIZED' };
  }

  // 부분 일치 (포함 관계)
  if (normPredicted.includes(normActual) || normActual.includes(normPredicted)) {
    return { match: true, matchType: 'PARTIAL' };
  }

  return { match: false, matchType: 'MISMATCH' };
}

// ═══════════════════════════════════════════════════════════════════════════
// dataLayer 이벤트에서 파라미터 추출
// ═══════════════════════════════════════════════════════════════════════════

function extractParameterFromDataLayer(event: any, paramKey: string): any {
  // 최상위 레벨 확인
  if (event[paramKey] !== undefined) {
    return event[paramKey];
  }

  // ecommerce 내부 확인
  if (event.ecommerce) {
    if (event.ecommerce[paramKey] !== undefined) {
      return event.ecommerce[paramKey];
    }

    // items 배열 확인
    if (paramKey === 'items' && event.ecommerce.items) {
      return event.ecommerce.items;
    }

    // 첫 번째 아이템의 속성 확인
    if (event.ecommerce.items?.[0]?.[paramKey] !== undefined) {
      return event.ecommerce.items[0][paramKey];
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 메인 실행
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     파라미터 값 예측 vs 실제 비교                               ║');
  console.log('║     Vision AI 예측 + dataLayer 캡처                            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error('❌ GEMINI_API_KEY 필요');
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let browser: Browser | null = null;

  try {
    // 1. 브라우저 시작
    console.log('═'.repeat(70));
    console.log('📍 1. 브라우저 시작 및 dataLayer 캡처 준비');
    console.log('═'.repeat(70));

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      locale: 'ko-KR',
    });
    const page = await context.newPage();

    // dataLayer 캡처 설정
    const dataLayerCapture = new DataLayerCapture();
    await dataLayerCapture.initialize(page);

    console.log(`   URL: ${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);

    // 2. 스크린샷 캡처
    console.log('\n═'.repeat(70));
    console.log('📍 2. 스크린샷 캡처');
    console.log('═'.repeat(70));

    const screenshotPath = path.join(OUTPUT_DIR, `screenshot_${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`   ✅ 스크린샷: ${screenshotPath}`);

    // 3. dataLayer 및 DOM에서 실제 데이터 추출
    console.log('\n═'.repeat(70));
    console.log('📍 3. 실제 데이터 추출 (dataLayer + DOM + 전역변수)');
    console.log('═'.repeat(70));

    // dataLayer 이벤트 캡처
    const capturedEvents = await dataLayerCapture.getCapturedEvents();
    console.log(`   dataLayer 이벤트: ${capturedEvents.length}개`);

    // 전역변수에서 데이터 추출
    const globalVars = await captureGlobalVariables(page);
    console.log(`   전역변수 키: ${Object.keys(globalVars.customVariables).join(', ') || '없음'}`);

    // DOM에서 상품 정보 추출
    const domProduct = await extractProductFromDOM(page);
    console.log(`   DOM 상품 정보: ${domProduct ? '있음' : '없음'}`);

    // 페이지에서 직접 상품 정보 추출
    const extractedProducts = await page.evaluate(() => {
      const products: any[] = [];

      // 상품 카드에서 정보 추출
      const productCards = document.querySelectorAll('[class*="product"], [class*="item"], [class*="goods"]');

      productCards.forEach((card, index) => {
        const nameEl = card.querySelector('[class*="name"], [class*="title"], h3, h4, .prd-name');
        const priceEl = card.querySelector('[class*="price"], .prd-price');
        const brandEl = card.querySelector('[class*="brand"]');

        if (nameEl) {
          const priceText = priceEl?.textContent || '';
          const priceMatch = priceText.replace(/[^\d]/g, '');

          products.push({
            item_name: nameEl.textContent?.trim(),
            price: priceMatch ? parseInt(priceMatch) : null,
            item_brand: brandEl?.textContent?.trim() || null,
            index: index,
          });
        }
      });

      // 페이지 제목
      const pageTitle = document.title || document.querySelector('h1')?.textContent?.trim();

      // 브랜드명 (로고 또는 헤더에서)
      const brandLogo = document.querySelector('[class*="brand-logo"], .brand-name, header [class*="brand"]');
      const brandName = brandLogo?.getAttribute('alt') || brandLogo?.textContent?.trim();

      return {
        pageTitle,
        brandName,
        products: products.slice(0, 10), // 처음 10개만
        url: window.location.href,
      };
    });

    console.log(`   추출된 상품: ${extractedProducts.products.length}개`);
    console.log(`   브랜드명: ${extractedProducts.brandName || '(추출 실패)'}`);
    console.log(`   페이지 제목: ${extractedProducts.pageTitle || '(추출 실패)'}`);

    // 이벤트별 분류
    const eventsByName = new Map<string, any[]>();
    for (const event of capturedEvents) {
      const name = event.event || 'unknown';
      if (!eventsByName.has(name)) {
        eventsByName.set(name, []);
      }
      eventsByName.get(name)!.push(event);
    }

    // 실제 데이터 객체 생성 (예측 비교용)
    const actualData = {
      page_view: {
        page_title: extractedProducts.pageTitle,
        page_location: extractedProducts.url,
      },
      view_item_list: {
        item_list_name: extractedProducts.pageTitle,
        items: extractedProducts.products,
      },
      brand_product_click: extractedProducts.products[0] ? {
        brand_name: extractedProducts.brandName,
        product_name: extractedProducts.products[0].item_name,
        product_price: extractedProducts.products[0].price,
        product_index: 0,
      } : null,
    };

    await browser.close();
    browser = null;

    // 4. Vision AI 예측
    const predictions = await predictEventsWithVisionAI(
      screenshotPath,
      TARGET_URL,
      geminiApiKey
    );

    // 5. 파라미터 비교 (DOM 추출 데이터 기준)
    console.log('\n═'.repeat(70));
    console.log('📍 4. 파라미터 값 비교 (DOM 추출 데이터 기준)');
    console.log('═'.repeat(70));

    const eventComparisons: EventComparison[] = [];

    // 실제 데이터에서 파라미터 값 추출 함수
    function getActualValue(eventName: string, paramKey: string): any {
      const eventData = (actualData as any)[eventName];
      if (!eventData) return null;

      // 직접 키 확인
      if (eventData[paramKey] !== undefined) {
        return eventData[paramKey];
      }

      // items 배열의 첫 번째 항목에서 확인
      if (eventData.items && Array.isArray(eventData.items) && eventData.items[0]) {
        if (eventData.items[0][paramKey] !== undefined) {
          return eventData.items[0][paramKey];
        }
      }

      return null;
    }

    for (const prediction of predictions) {
      const paramComparisons: ParameterComparison[] = [];
      let matchCount = 0;
      let hasActualData = false;

      for (const param of prediction.parameters) {
        let actualValue = getActualValue(prediction.eventName, param.key);

        // 특수 케이스: items 배열은 별도 처리
        if (param.key === 'items' && prediction.eventName === 'view_item_list') {
          actualValue = actualData.view_item_list?.items;
        }

        if (actualValue !== null) hasActualData = true;

        const comparison = compareValues(param.predictedValue, actualValue);

        paramComparisons.push({
          key: param.key,
          predictedValue: param.predictedValue,
          actualValue: actualValue,
          match: comparison.match,
          matchType: comparison.matchType,
        });

        if (comparison.match) matchCount++;
      }

      const paramAccuracy = prediction.parameters.length > 0
        ? (matchCount / prediction.parameters.length) * 100
        : 0;

      eventComparisons.push({
        eventName: prediction.eventName,
        predicted: true,
        actualFound: hasActualData,
        parameterComparisons: paramComparisons,
        parameterAccuracy: paramAccuracy,
      });
    }

    // 6. 결과 출력
    console.log('\n═'.repeat(70));
    console.log('📊 파라미터 비교 결과');
    console.log('═'.repeat(70));

    let totalParams = 0;
    let matchedParams = 0;

    for (const eventComp of eventComparisons) {
      const icon = eventComp.actualFound ? '✅' : '❌';
      console.log(`\n${icon} ${eventComp.eventName}`);
      console.log(`   파라미터 정확도: ${eventComp.parameterAccuracy.toFixed(1)}%`);

      for (const paramComp of eventComp.parameterComparisons) {
        totalParams++;
        if (paramComp.match) matchedParams++;

        const matchIcon = paramComp.match ? '✅' : '❌';
        const predictedStr = String(paramComp.predictedValue).substring(0, 50);
        const actualStr = paramComp.actualValue !== null
          ? String(paramComp.actualValue).substring(0, 50)
          : '(없음)';

        console.log(`   ${matchIcon} ${paramComp.key}:`);
        console.log(`      예측: ${predictedStr}${String(paramComp.predictedValue).length > 50 ? '...' : ''}`);
        console.log(`      실제: ${actualStr}${String(paramComp.actualValue || '').length > 50 ? '...' : ''}`);
        console.log(`      매칭: ${paramComp.matchType}`);
      }
    }

    // 7. 최종 요약
    const overallAccuracy = totalParams > 0 ? (matchedParams / totalParams) * 100 : 0;

    console.log('\n' + '═'.repeat(70));
    console.log('📊 최종 요약');
    console.log('═'.repeat(70));
    console.log(`
┌─────────────────────────────────────────────────────────────────────────┐
│                    파라미터 예측 정확도 결과                             │
├─────────────────────────────────────────────────────────────────────────┤
│  총 파라미터: ${totalParams}개
│  일치 파라미터: ${matchedParams}개
│  파라미터 정확도: ${overallAccuracy.toFixed(1)}%
└─────────────────────────────────────────────────────────────────────────┘
`);

    // 8. 결과 저장
    const result = {
      url: TARGET_URL,
      pageType: PAGE_TYPE,
      timestamp: new Date().toISOString(),
      predictions,
      extractedData: {
        pageTitle: extractedProducts.pageTitle,
        brandName: extractedProducts.brandName,
        productsCount: extractedProducts.products.length,
        products: extractedProducts.products,
      },
      actualData,
      eventComparisons,
      summary: {
        totalParameters: totalParams,
        matchedParameters: matchedParams,
        parameterAccuracy: overallAccuracy,
      },
    };

    const resultPath = path.join(OUTPUT_DIR, `param_comparison_${Date.now()}.json`);
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
    console.log(`💾 결과 저장: ${resultPath}`);

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
