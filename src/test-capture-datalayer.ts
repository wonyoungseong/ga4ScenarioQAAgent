/**
 * dataLayer 캡처 테스트
 *
 * 페이지에서 실제로 수집되는 dataLayer 이벤트를 캡처하고 분석합니다.
 */

import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { DataLayerCapture, captureGlobalVariables } from './capture/dataLayerCapture';
import { DataLayerEvent } from './types/parameterPrediction';

// ═══════════════════════════════════════════════════════════════════════════
// 설정
// ═══════════════════════════════════════════════════════════════════════════

const TARGET_URL = 'https://www.amoremall.com/kr/ko/display/brand/detail/all?brandSn=18';
const OUTPUT_DIR = './output/datalayer-capture';

// ═══════════════════════════════════════════════════════════════════════════
// 메인 함수
// ═══════════════════════════════════════════════════════════════════════════

async function captureDataLayer(url: string) {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║        dataLayer 캡처 테스트                                    ║');
  console.log('║        실제 GA4 수집 데이터 확인                                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

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

    // 3. dataLayer 캡처
    console.log('\n═'.repeat(70));
    console.log('📍 3. dataLayer 이벤트 캡처');
    console.log('═'.repeat(70));

    const capturedEvents = await dataLayerCapture.getCapturedEvents();
    console.log(`   ✅ 캡처된 이벤트: ${capturedEvents.length}개`);

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

    // 4. 전역 변수 캡처
    console.log('\n═'.repeat(70));
    console.log('📍 4. 전역 변수 캡처 (GTM 참조 데이터)');
    console.log('═'.repeat(70));

    const globalVars = await captureGlobalVariables(page);

    if (Object.keys(globalVars.customVariables).length > 0) {
      console.log('\n   발견된 전역 변수:');
      for (const key of Object.keys(globalVars.customVariables)) {
        console.log(`   - ${key}`);
      }
    }

    // 5. ecommerce 이벤트 상세 분석
    console.log('\n═'.repeat(70));
    console.log('📍 5. ecommerce 이벤트 상세');
    console.log('═'.repeat(70));

    const ecommerceEvents = capturedEvents.filter(e => e.ecommerce);

    if (ecommerceEvents.length === 0) {
      console.log('\n   ⚠️ ecommerce 이벤트가 없습니다.');
    } else {
      for (const event of ecommerceEvents) {
        console.log(`\n   📦 ${event.event || '(no name)'}`);

        if (event.ecommerce?.currency) {
          console.log(`      currency: ${event.ecommerce.currency}`);
        }
        if (event.ecommerce?.value !== undefined) {
          console.log(`      value: ${event.ecommerce.value}`);
        }

        if (event.ecommerce?.items && event.ecommerce.items.length > 0) {
          console.log(`      items (${event.ecommerce.items.length}개):`);

          for (let i = 0; i < Math.min(event.ecommerce.items.length, 5); i++) {
            const item = event.ecommerce.items[i];
            console.log(`\n      [${i}] ${item.item_name || '(no name)'}`);
            if (item.item_id) console.log(`          item_id: ${item.item_id}`);
            if (item.item_brand) console.log(`          item_brand: ${item.item_brand}`);
            if (item.price !== undefined) console.log(`          price: ${item.price}`);
            if (item.item_category) console.log(`          item_category: ${item.item_category}`);
            if (item.index !== undefined) console.log(`          index: ${item.index}`);
          }

          if (event.ecommerce.items.length > 5) {
            console.log(`\n      ... 외 ${event.ecommerce.items.length - 5}개`);
          }
        }
      }
    }

    // 6. 상품 목록 페이지에서 상품 클릭 시뮬레이션
    console.log('\n═'.repeat(70));
    console.log('📍 6. 상품 클릭 시 이벤트 캡처');
    console.log('═'.repeat(70));

    // 첫 번째 상품 찾기
    const productSelector = '[data-gtm-click], .product-card, .item-card, [class*="product"]';
    const productElements = await page.$$(productSelector);

    if (productElements.length > 0) {
      console.log(`\n   발견된 상품 요소: ${productElements.length}개`);
      console.log('   첫 번째 상품 클릭 시도...');

      const beforeClickEvents = await dataLayerCapture.getCapturedEvents();
      const beforeCount = beforeClickEvents.length;

      try {
        await productElements[0].click();
        await page.waitForTimeout(2000);

        const afterClickEvents = await dataLayerCapture.getCapturedEvents();
        const newEvents = afterClickEvents.slice(beforeCount);

        if (newEvents.length > 0) {
          console.log(`\n   ✅ 클릭 후 새 이벤트 ${newEvents.length}개:`);
          for (const event of newEvents) {
            console.log(`      - ${event.event || '(no name)'}`);

            if (event.ecommerce?.items?.[0]) {
              const item = event.ecommerce.items[0];
              console.log(`        item_name: ${item.item_name}`);
              console.log(`        item_id: ${item.item_id}`);
              console.log(`        item_brand: ${item.item_brand}`);
              console.log(`        price: ${item.price}`);
            }
          }
        } else {
          console.log('\n   ⚠️ 클릭 후 새 이벤트가 발생하지 않았습니다.');
        }
      } catch (e: any) {
        console.log(`\n   ⚠️ 클릭 실패: ${e.message}`);
      }
    } else {
      console.log('\n   ⚠️ 상품 요소를 찾을 수 없습니다.');
    }

    // 7. 결과 저장
    console.log('\n═'.repeat(70));
    console.log('📍 7. 결과 저장');
    console.log('═'.repeat(70));

    const allEvents = await dataLayerCapture.getCapturedEvents();

    const result = {
      url,
      timestamp: new Date().toISOString(),
      totalEvents: allEvents.length,
      eventsByType: {} as Record<string, number>,
      events: allEvents,
      globalVariables: globalVars,
    };

    // 이벤트 타입별 카운트
    for (const event of allEvents) {
      const name = event.event || 'unknown';
      result.eventsByType[name] = (result.eventsByType[name] || 0) + 1;
    }

    const resultPath = path.join(OUTPUT_DIR, `datalayer_${Date.now()}.json`);
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
    console.log(`\n   💾 결과 저장: ${resultPath}`);

    // 8. 요약
    console.log('\n═'.repeat(70));
    console.log('📍 8. 요약');
    console.log('═'.repeat(70));

    console.log(`
┌─────────────────────────────────────────────────────────────────────────┐
│                         수집 결과 요약                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  URL: ${url.substring(0, 50)}...
│  총 이벤트: ${allEvents.length}개
│  ecommerce 이벤트: ${ecommerceEvents.length}개
│
│  이벤트별:
`);

    for (const [name, count] of Object.entries(result.eventsByType)) {
      console.log(`│    - ${name}: ${count}개`);
    }

    console.log('└─────────────────────────────────────────────────────────────────────────┘');

    // 브라우저 열어두기 (수동 확인용)
    console.log('\n🔍 브라우저를 열어두었습니다. 수동 확인 후 Enter 키를 누르세요...');
    await new Promise(resolve => {
      process.stdin.once('data', resolve);
    });

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 실행
// ═══════════════════════════════════════════════════════════════════════════

captureDataLayer(TARGET_URL).then(() => {
  console.log('\n=== 캡처 완료 ===');
}).catch(error => {
  console.error('❌ 오류:', error.message);
  process.exit(1);
});
