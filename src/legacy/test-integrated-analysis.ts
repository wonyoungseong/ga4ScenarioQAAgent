/**
 * 통합 이벤트 분석 테스트
 *
 * 실제 메인 페이지를 분석하여 발생 가능한 이벤트를 확인합니다.
 * CSS Selector 검증을 위해 Playwright Page 객체를 전달합니다.
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { IntegratedEventAnalyzer } from './analyzers/integratedEventAnalyzer';

dotenv.config();

const GTM_JSON_PATH = './GTM-5FK5X5C4_workspace112.json';
const DEV_GUIDE_PDF_PATH = './[EC]+WEB+개발+가이드_GTM코드추가(Shopify)1.1.pdf';
const TEST_URL = 'https://www.amoremall.com/kr/ko/cart/cartList';
const OUTPUT_DIR = './output';

interface PageSetup {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  screenshotPath: string;
}

async function setupPage(url: string): Promise<PageSetup> {
  console.log(`\n📸 페이지 로드 및 스크린샷 캡처 중: ${url}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'ko-KR',
  });
  const page = await context.newPage();

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

  // 팝업 닫기 시도
  try {
    await page.click('[class*="close"]', { timeout: 2000 });
  } catch { }

  // 잠시 대기
  await page.waitForTimeout(2000);

  // 스크린샷 저장
  const timestamp = Date.now();
  const screenshotPath = path.join(OUTPUT_DIR, `page_${timestamp}.png`);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`✅ 스크린샷 저장: ${screenshotPath}`);

  return { browser, context, page, screenshotPath };
}

async function main() {
  console.log('========================================');
  console.log('통합 이벤트 분석 테스트 (CSS Selector 검증 포함)');
  console.log('========================================\n');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY가 설정되지 않았습니다.');
    console.error('.env 파일에 GEMINI_API_KEY를 설정해주세요.');
    process.exit(1);
  }

  let pageSetup: PageSetup | null = null;

  try {
    // 1. 페이지 로드 및 스크린샷 캡처 (브라우저는 열어둠)
    pageSetup = await setupPage(TEST_URL);

    // 2. 통합 분석 실행 (개발가이드 + Playwright Page 전달)
    console.log('\n🔍 통합 이벤트 분석 중...');
    console.log(`   - GTM 설정: ${GTM_JSON_PATH}`);
    console.log(`   - 개발가이드: ${DEV_GUIDE_PDF_PATH}`);
    console.log(`   - CSS Selector 검증: Playwright 사용`);

    const analyzer = new IntegratedEventAnalyzer(apiKey, GTM_JSON_PATH, DEV_GUIDE_PDF_PATH);
    const result = await analyzer.analyzeEventsForPage(
      TEST_URL,
      pageSetup.screenshotPath,
      pageSetup.page  // Playwright Page 객체 전달
    );

    // 3. 결과 출력
    console.log('\n' + '='.repeat(60));
    console.log(result.summary);
    console.log('='.repeat(60));

    // 4. 상세 결과 출력
    console.log('\n\n📋 상세 분석 결과\n');

    console.log('【실제 발생 가능 이벤트】');
    console.log('-'.repeat(40));
    for (const event of result.actuallyCanFire) {
      const triggerTypes = event.triggerInfo.map(t => t.triggerType).join(', ');
      console.log(`✅ ${event.eventName} (${event.description})`);
      console.log(`   카테고리: ${event.category}`);
      console.log(`   트리거: ${triggerTypes || 'auto'}`);
      console.log(`   사용자액션: ${event.requiresUserAction ? '필요' : '자동'}`);

      // CSS Selector 정보 출력
      const selectorInfo = event.triggerInfo.find(t => t.cssSelector);
      if (selectorInfo?.cssSelector) {
        console.log(`   🎯 CSS Selector: ${selectorInfo.cssSelector}`);
      }

      // Selector 검증 결과 출력
      if (event.selectorVerification) {
        if (event.selectorVerification.exists) {
          console.log(`   ✓ HTML 검증: ${event.selectorVerification.elementCount}개 요소 발견`);
          if (event.selectorVerification.sampleElements) {
            console.log(`     샘플: ${event.selectorVerification.sampleElements.slice(0, 2).join(', ')}`);
          }
        } else {
          console.log(`   ✗ HTML 검증: 요소 없음`);
        }
      }

      if (event.uiVerification.foundUIElements) {
        console.log(`   UI요소: ${event.uiVerification.foundUIElements}`);
      }
      console.log('');
    }

    console.log('\n【UI 없어서 발생 불가】');
    console.log('-'.repeat(40));
    if (result.noUIEvents.length === 0) {
      console.log('(없음)');
    } else {
      for (const event of result.noUIEvents) {
        console.log(`❌ ${event.eventName} (${event.description})`);
        console.log(`   이유: ${event.uiVerification.reason}`);

        // CSS Selector 정보가 있으면 출력
        const selectorInfo = event.triggerInfo.find(t => t.cssSelector);
        if (selectorInfo?.cssSelector) {
          console.log(`   🎯 CSS Selector: ${selectorInfo.cssSelector}`);
        }
        console.log('');
      }
    }

    console.log('\n【GTM/개발가이드/Selector 조건 미충족으로 발생 불가】');
    console.log('-'.repeat(40));
    if (result.gtmBlockedEvents.length === 0) {
      console.log('(없음)');
    } else {
      for (const event of result.gtmBlockedEvents) {
        const isDevGuideBlocked = event.summary.includes('개발가이드');
        const isSelectorBlocked = event.summary.includes('CSS Selector');
        let icon = '🚫';
        if (isDevGuideBlocked) icon = '📕';
        if (isSelectorBlocked) icon = '🎯';

        console.log(`${icon} ${event.eventName}`);
        console.log(`   이유: ${event.summary}`);
        console.log('');
      }
    }

    // 5. 결과 저장
    const resultPath = path.join(OUTPUT_DIR, `integrated_analysis_${Date.now()}.json`);
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`\n💾 결과 저장: ${resultPath}`);

  } catch (error: any) {
    console.error('❌ 분석 오류:', error.message);
    process.exit(1);
  } finally {
    // 브라우저 닫기
    if (pageSetup) {
      await pageSetup.browser.close();
      console.log('\n🔒 브라우저 종료');
    }
  }
}

main().catch(console.error);
