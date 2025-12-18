/**
 * 메인 페이지 page_view 이벤트 분석
 *
 * 1. 메인 페이지 스크린샷 캡처
 * 2. Vision AI로 page_view 파라미터 예측
 * 3. DOM/전역변수에서 실제 값 추출
 * 4. GA4 API로 실제 수집 데이터 조회
 */

import { config } from 'dotenv';
config();

import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GA4Client } from './ga4';

// ═══════════════════════════════════════════════════════════════════════════
// 설정
// ═══════════════════════════════════════════════════════════════════════════

const TARGET_URL = 'https://www.amoremall.com';
const OUTPUT_DIR = './output/main-page-analysis';
const PAGE_TYPE = 'HOME';

// ═══════════════════════════════════════════════════════════════════════════
// 메인 실행
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     메인 페이지 page_view 이벤트 분석                           ║');
  console.log('║     예측 → 실제 추출 → GA4 API 검증                            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const geminiApiKey = process.env.GEMINI_API_KEY;
  const ga4PropertyId = process.env.GA4_PROPERTY_ID;

  if (!geminiApiKey) {
    console.error('❌ GEMINI_API_KEY 필요');
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let browser: Browser | null = null;

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // 1. 브라우저로 메인 페이지 접속
    // ═══════════════════════════════════════════════════════════════════════
    console.log('═'.repeat(70));
    console.log('📍 1. 메인 페이지 접속 및 데이터 수집');
    console.log('═'.repeat(70));

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      locale: 'ko-KR',
    });
    const page = await context.newPage();

    console.log(`\n   URL: ${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);

    // 스크린샷 캡처
    const screenshotPath = path.join(OUTPUT_DIR, `main_screenshot_${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`   ✅ 스크린샷: ${screenshotPath}`);

    // ═══════════════════════════════════════════════════════════════════════
    // 2. 페이지에서 실제 데이터 추출
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═'.repeat(70));
    console.log('📍 2. 페이지에서 실제 page_view 파라미터 값 추출');
    console.log('═'.repeat(70));

    const actualPageData = await page.evaluate(() => {
      // 표준 page_view 파라미터
      return {
        // 기본 페이지 정보
        page_title: document.title,
        page_location: window.location.href,
        page_path: window.location.pathname,
        page_referrer: document.referrer || '(direct)',

        // 추가 정보
        language: navigator.language,
        screen_resolution: `${window.screen.width}x${window.screen.height}`,
        viewport_size: `${window.innerWidth}x${window.innerHeight}`,

        // 메타 태그 정보
        meta_description: document.querySelector('meta[name="description"]')?.getAttribute('content') || null,
        meta_keywords: document.querySelector('meta[name="keywords"]')?.getAttribute('content') || null,
        og_title: document.querySelector('meta[property="og:title"]')?.getAttribute('content') || null,

        // dataLayer에서 추출 시도
        dataLayerPageView: (() => {
          if (typeof (window as any).dataLayer !== 'undefined') {
            const pageViewEvents = (window as any).dataLayer.filter((item: any) =>
              item.event === 'page_view' || item.event === 'gtm.js'
            );
            return pageViewEvents.length > 0 ? pageViewEvents : null;
          }
          return null;
        })(),
      };
    });

    console.log('\n   📋 추출된 실제 값:');
    console.log(`   ┌─────────────────────────────────────────────────────────────────`);
    console.log(`   │ page_title: "${actualPageData.page_title}"`);
    console.log(`   │ page_location: "${actualPageData.page_location}"`);
    console.log(`   │ page_path: "${actualPageData.page_path}"`);
    console.log(`   │ page_referrer: "${actualPageData.page_referrer}"`);
    console.log(`   │ language: "${actualPageData.language}"`);
    console.log(`   │ screen_resolution: "${actualPageData.screen_resolution}"`);
    console.log(`   └─────────────────────────────────────────────────────────────────`);

    await browser.close();
    browser = null;

    // ═══════════════════════════════════════════════════════════════════════
    // 3. Vision AI로 page_view 파라미터 예측
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═'.repeat(70));
    console.log('📍 3. Vision AI로 page_view 파라미터 예측');
    console.log('═'.repeat(70));

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const imageBuffer = fs.readFileSync(screenshotPath);
    const imageBase64 = imageBuffer.toString('base64');

    const prompt = `
이 스크린샷은 아모레몰(amoremall.com) 메인 페이지입니다.
이 페이지에서 발생하는 GA4 page_view 이벤트의 파라미터 값을 예측해주세요.

## page_view 이벤트 파라미터

GA4 page_view 이벤트에서 수집되는 표준 파라미터:
- page_title: 페이지 제목 (브라우저 탭에 표시되는 제목)
- page_location: 전체 URL
- page_path: URL 경로 부분만
- page_referrer: 이전 페이지 URL (첫 방문시 direct)

## 요청사항

1. 이 페이지의 page_title이 무엇일지 예측해주세요
2. page_location (URL)을 예측해주세요
3. page_path를 예측해주세요
4. 이 메인 페이지에서 추가로 발생할 수 있는 다른 이벤트들도 나열해주세요

## 출력 형식 (JSON)
\`\`\`json
{
  "pageType": "HOME",
  "page_view": {
    "page_title": "예측한 페이지 제목",
    "page_location": "예측한 전체 URL",
    "page_path": "예측한 경로"
  },
  "otherExpectedEvents": [
    {
      "eventName": "이벤트명",
      "reason": "발생 이유"
    }
  ]
}
\`\`\`

화면에 보이는 정보를 기반으로 정확하게 예측해주세요.
`;

    const result = await model.generateContent([
      { inlineData: { mimeType: 'image/png', data: imageBase64 } },
      { text: prompt },
    ]);

    const responseText = result.response.text();
    let prediction: any = null;

    const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      prediction = JSON.parse(jsonMatch[1]);
    }

    console.log('\n   📋 Vision AI 예측 결과:');
    if (prediction?.page_view) {
      console.log(`   ┌─────────────────────────────────────────────────────────────────`);
      console.log(`   │ page_title: "${prediction.page_view.page_title}"`);
      console.log(`   │ page_location: "${prediction.page_view.page_location}"`);
      console.log(`   │ page_path: "${prediction.page_view.page_path}"`);
      console.log(`   └─────────────────────────────────────────────────────────────────`);
    }

    if (prediction?.otherExpectedEvents) {
      console.log('\n   📋 추가 예상 이벤트:');
      for (const event of prediction.otherExpectedEvents) {
        console.log(`   - ${event.eventName}: ${event.reason}`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. 예측 vs 실제 비교
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═'.repeat(70));
    console.log('📍 4. 예측 vs 실제 비교');
    console.log('═'.repeat(70));

    const comparisons = [
      {
        param: 'page_title',
        predicted: prediction?.page_view?.page_title || '(예측 없음)',
        actual: actualPageData.page_title,
      },
      {
        param: 'page_location',
        predicted: prediction?.page_view?.page_location || '(예측 없음)',
        actual: actualPageData.page_location,
      },
      {
        param: 'page_path',
        predicted: prediction?.page_view?.page_path || '(예측 없음)',
        actual: actualPageData.page_path,
      },
    ];

    console.log('\n   ┌────────────────┬────────────────────────────────┬────────────────────────────────┬────────┐');
    console.log('   │ 파라미터       │ 예측값                         │ 실제값                         │ 일치   │');
    console.log('   ├────────────────┼────────────────────────────────┼────────────────────────────────┼────────┤');

    let matchCount = 0;
    for (const comp of comparisons) {
      const predStr = comp.predicted.substring(0, 28).padEnd(28);
      const actStr = comp.actual.substring(0, 28).padEnd(28);
      const match = comp.predicted === comp.actual ||
                    comp.predicted.includes(comp.actual) ||
                    comp.actual.includes(comp.predicted);
      const matchStr = match ? '✅' : '❌';
      if (match) matchCount++;

      console.log(`   │ ${comp.param.padEnd(14)} │ ${predStr} │ ${actStr} │ ${matchStr}     │`);
    }
    console.log('   └────────────────┴────────────────────────────────┴────────────────────────────────┴────────┘');
    console.log(`\n   파라미터 일치율: ${matchCount}/${comparisons.length} (${((matchCount/comparisons.length)*100).toFixed(1)}%)`);

    // ═══════════════════════════════════════════════════════════════════════
    // 5. GA4 API로 실제 수집 데이터 확인
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═'.repeat(70));
    console.log('📍 5. GA4 API로 메인 페이지 실제 수집 데이터 확인');
    console.log('═'.repeat(70));

    // GA4 토큰 확인
    let ga4AccessToken: string | null = null;
    const tokenPath = './credentials/ga4_tokens.json';
    if (fs.existsSync(tokenPath)) {
      try {
        const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
        ga4AccessToken = tokens.access_token;
      } catch {
        console.log('   ⚠️ GA4 토큰 파일 읽기 실패');
      }
    }

    if (ga4AccessToken && ga4PropertyId) {
      const client = new GA4Client({
        propertyId: ga4PropertyId,
        accessToken: ga4AccessToken,
      });

      await client.initialize();

      // 메인 페이지 이벤트 조회 (실제 경로: /kr/ko/display/main)
      const mainPagePath = actualPageData.page_path; // 실제 추출한 경로 사용
      console.log(`\n   메인 페이지 (${mainPagePath}) 이벤트 조회 중...`);

      const pageEvents = await client.getEventsByPage(mainPagePath, {
        startDate: '7daysAgo',
        endDate: 'today',
        limit: 100,
      });

      // 이벤트별 집계
      const eventCounts = new Map<string, number>();
      for (const pe of pageEvents) {
        // 메인 페이지 경로 포함 여부로 필터링
        if (pe.pagePath.includes('display/main') || pe.pagePath === mainPagePath) {
          const current = eventCounts.get(pe.eventName) || 0;
          eventCounts.set(pe.eventName, current + pe.eventCount);
        }
      }

      console.log('\n   📊 GA4 실제 수집 이벤트 (메인 페이지):');
      console.log('   ┌────────────────────────────┬──────────────┐');
      console.log('   │ 이벤트명                   │ 수집 횟수    │');
      console.log('   ├────────────────────────────┼──────────────┤');

      // 정렬해서 출력
      const sortedEvents = [...eventCounts.entries()].sort((a, b) => b[1] - a[1]);
      for (const [eventName, count] of sortedEvents.slice(0, 15)) {
        const isPageView = eventName === 'page_view' ? ' ⭐' : '';
        console.log(`   │ ${(eventName + isPageView).padEnd(26)} │ ${count.toLocaleString().padStart(12)} │`);
      }
      console.log('   └────────────────────────────┴──────────────┘');

      // page_view 세부 정보 조회
      const pageViewCount = eventCounts.get('page_view') || 0;
      console.log(`\n   📌 page_view 이벤트: ${pageViewCount.toLocaleString()}회 수집됨`);

    } else {
      console.log('\n   ⚠️ GA4 API 토큰 또는 Property ID가 없습니다.');
      console.log('   토큰 설정 방법:');
      console.log('   npx ts-node src/cli.ts ga4 set-token -t <TOKEN> -p <PROPERTY_ID>');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 6. 결과 저장
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═'.repeat(70));
    console.log('📍 6. 결과 저장');
    console.log('═'.repeat(70));

    const finalResult = {
      url: TARGET_URL,
      pageType: PAGE_TYPE,
      timestamp: new Date().toISOString(),
      actualData: actualPageData,
      prediction: prediction,
      comparisons: comparisons.map(c => ({
        ...c,
        match: c.predicted === c.actual ||
               c.predicted.includes(c.actual) ||
               c.actual.includes(c.predicted)
      })),
      matchRate: (matchCount / comparisons.length) * 100,
    };

    const resultPath = path.join(OUTPUT_DIR, `main_page_analysis_${Date.now()}.json`);
    fs.writeFileSync(resultPath, JSON.stringify(finalResult, null, 2));
    console.log(`\n   💾 결과 저장: ${resultPath}`);

    // 최종 요약
    console.log('\n═'.repeat(70));
    console.log('📊 최종 요약');
    console.log('═'.repeat(70));
    console.log(`
┌─────────────────────────────────────────────────────────────────────────┐
│                    메인 페이지 page_view 분석 결과                       │
├─────────────────────────────────────────────────────────────────────────┤
│  URL: ${TARGET_URL}
│
│  page_view 파라미터 예측 정확도: ${((matchCount/comparisons.length)*100).toFixed(1)}%
│
│  ✅ 실제 page_title: "${actualPageData.page_title}"
│  ✅ 실제 page_path: "${actualPageData.page_path}"
│  ✅ 실제 page_location: "${actualPageData.page_location}"
└─────────────────────────────────────────────────────────────────────────┘
`);

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
