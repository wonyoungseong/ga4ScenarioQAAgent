/**
 * 페이지 로딩 검증 시스템 테스트
 */

import { chromium } from 'playwright';
import { PageLoadingValidator } from './validators/pageLoadingValidator';
import { getPageRequirements } from './validators/pageRequirementsConfig';

async function testPageValidation() {
  console.log('='.repeat(60));
  console.log('📋 페이지 로딩 검증 시스템 테스트');
  console.log('='.repeat(60));

  // 1. URL 패턴 인식 테스트
  console.log('\n🔍 1. URL 패턴 인식 테스트\n');

  const validator = new PageLoadingValidator({
    useVisionAI: false, // 테스트에서는 Vision AI 비활성화
    visionMode: 'never',
    verbose: true,
  });

  const testUrls = [
    { url: 'https://www.amoremall.com/', expected: 'MAIN' },
    { url: 'https://www.amoremall.com/kr/ko/', expected: 'MAIN' },
    { url: 'https://www.amoremall.com/kr/ko/product/detail?onlineProdCode=142560', expected: 'PRODUCT_DETAIL' },
    { url: 'https://example.com/prd/detail/12345', expected: 'PRODUCT_DETAIL' },
    { url: 'https://example.com/goods/12345', expected: 'PRODUCT_DETAIL' },
    { url: 'https://example.com/category/cosmetics', expected: 'PRODUCT_LIST' },
    { url: 'https://example.com/display/category/best', expected: 'PRODUCT_LIST' },
    { url: 'https://example.com/search?keyword=립스틱', expected: 'SEARCH_RESULT' },
    { url: 'https://example.com/cart', expected: 'CART' },
    { url: 'https://example.com/order/checkout', expected: 'ORDER' },
    { url: 'https://example.com/order/complete', expected: 'ORDER_COMPLETE' },
    { url: 'https://example.com/event/promo/123', expected: 'EVENT_DETAIL' },
    { url: 'https://example.com/mypage', expected: 'MY' },
    { url: 'https://example.com/brand/sulwhasoo/main', expected: 'BRAND_MAIN' },
    { url: 'https://example.com/live/12345', expected: 'LIVE_DETAIL' },
    { url: 'https://example.com/unknown/path', expected: 'OTHERS' },
  ];

  let urlPassCount = 0;
  for (const { url, expected } of testUrls) {
    const detected = validator.detectPageTypeFromUrl(url);
    const passed = detected === expected;
    if (passed) urlPassCount++;
    console.log(`   ${passed ? '✅' : '❌'} ${url.substring(0, 50).padEnd(50)} → ${detected} (기대: ${expected})`);
  }
  console.log(`\n   결과: ${urlPassCount}/${testUrls.length} 통과`);

  // 2. 페이지 요구사항 조회 테스트
  console.log('\n📦 2. 페이지 타입별 필수 컴포넌트 확인\n');

  const pageTypes = ['PRODUCT_DETAIL', 'PRODUCT_LIST', 'CART', 'ORDER', 'MAIN'];
  for (const pageType of pageTypes) {
    const requirements = getPageRequirements(pageType);
    const componentNames = requirements.required.map((r) => r.name).join(', ');
    console.log(`   ${pageType}:`);
    console.log(`      필수: ${componentNames || '없음'}`);
    const optionalNames = (requirements.optional || []).map((r) => r.name).join(', ');
    if (optionalNames) {
      console.log(`      선택: ${optionalNames}`);
    }
  }

  // 3. 실제 페이지 검증 테스트 (선택적)
  console.log('\n🌐 3. 실제 페이지 검증 테스트\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const liveTestUrls = [
    'https://www.amoremall.com/kr/ko/',
    'https://www.amoremall.com/kr/ko/product/detail?onlineProdCode=142560',
  ];

  for (const testUrl of liveTestUrls) {
    console.log(`\n   🔗 테스트 URL: ${testUrl}`);

    try {
      // 페이지 이동
      await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      // 검증 수행
      const result = await validator.validate(page, testUrl);

      // 결과 출력
      const statusEmoji: Record<string, string> = {
        VALID: '✅',
        PARTIAL: '⚠️',
        ERROR_PAGE: '❌',
        WRONG_TYPE: '🔄',
        EMPTY: '📭',
      };
      console.log(`   ${statusEmoji[result.status] || '❓'} 상태: ${result.status}`);
      console.log(`   📊 신뢰도: ${result.confidence}%`);
      console.log(`   📄 예상 페이지 타입: ${result.expectedPageType}`);
      console.log(`   🌐 HTTP 상태: ${result.httpStatus}`);

      if (result.requiredComponents.length > 0) {
        console.log(`   📦 컴포넌트 체크:`);
        for (const comp of result.requiredComponents) {
          console.log(`      ${comp.found ? '✅' : '❌'} ${comp.name}`);
        }
      }

      if (result.missingComponents.length > 0) {
        console.log(`   ⚠️ 누락된 컴포넌트: ${result.missingComponents.join(', ')}`);
      }

      if (result.warnings.length > 0) {
        console.log(`   ⚠️ 경고:`);
        for (const warning of result.warnings) {
          console.log(`      - ${warning}`);
        }
      }
    } catch (error: any) {
      console.log(`   ❌ 오류: ${error.message}`);
    }
  }

  await browser.close();

  console.log('\n' + '='.repeat(60));
  console.log('✅ 테스트 완료');
  console.log('='.repeat(60));
}

testPageValidation().catch(console.error);
