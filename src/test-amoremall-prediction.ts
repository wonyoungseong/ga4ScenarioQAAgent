/**
 * 아모레몰 페이지 예측 테스트
 *
 * 실제 페이지를 방문하여 파라미터 예측 및 전역변수 값을 비교합니다.
 */

import { chromium, Page } from 'playwright';
import { createDefaultGTMConfigLoader } from './config/gtmConfigLoader';
import { ParameterPredictor, extractGlobalVariables } from './predictors/parameterPredictor';

const TEST_URL = 'https://www.amoremall.com/kr/ko/';

async function main() {
  console.log('═'.repeat(80));
  console.log(' 아모레몰 페이지 파라미터 예측 테스트');
  console.log('═'.repeat(80));
  console.log(`\n🌐 URL: ${TEST_URL}\n`);

  // 1. GTM 설정 로더 초기화
  console.log('📦 GTM 설정 로더 초기화 중...');
  const loader = createDefaultGTMConfigLoader();
  await loader.preload();
  console.log('✅ GTM 설정 로드 완료!\n');

  // 2. 브라우저 실행
  console.log('🌐 브라우저 시작 중...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // 3. 페이지 방문
    console.log('📄 페이지 로딩 중...');
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // 전역변수가 설정될 때까지 대기
    await page.waitForTimeout(3000);
    console.log('✅ 페이지 로드 완료!\n');

    // 4. 예측 수행
    console.log('─'.repeat(80));
    console.log('🔮 파라미터 예측 결과');
    console.log('─'.repeat(80));

    const predictor = new ParameterPredictor(TEST_URL, null, loader);
    const predictions = await predictor.predictPageViewParams(page);

    // 5. 실제 전역변수 값 추출
    console.log('\n📊 실제 전역변수 값 추출 중...');
    const globalVarNames = [
      'AP_DATA_SITENAME',
      'AP_DATA_COUNTRY',
      'AP_DATA_LANG',
      'AP_DATA_ENV',
      'AP_DATA_PAGETYPE',
      'AP_DATA_CHANNEL',
      'AP_DATA_ISLOGIN',
      'AP_DATA_GCID',
      'AP_DATA_CID',
      'AP_DATA_BREAD',
    ];

    const actualValues = await extractGlobalVariables(page, globalVarNames);

    // 6. 결과 비교 출력
    console.log('\n');
    console.log('─'.repeat(80));
    console.log('📊 예측 vs 실제 비교');
    console.log('─'.repeat(80));
    console.log();

    const paramToGlobalVar: Record<string, string> = {
      'site_name': 'AP_DATA_SITENAME',
      'site_country': 'AP_DATA_COUNTRY',
      'site_language': 'AP_DATA_LANG',
      'site_env': 'AP_DATA_ENV',
      'content_group': 'AP_DATA_PAGETYPE',
      'channel': 'AP_DATA_CHANNEL',
      'login_is_login': 'AP_DATA_ISLOGIN',
    };

    let matchCount = 0;
    let totalCount = 0;

    for (const [paramKey, prediction] of Object.entries(predictions)) {
      const globalVar = paramToGlobalVar[paramKey];
      const actualValue = globalVar ? actualValues[globalVar] : null;

      totalCount++;

      console.log(`📌 ${paramKey}`);
      console.log(`   예측값: ${prediction.value || '(없음)'}`);
      console.log(`   소스: ${prediction.source}`);
      console.log(`   신뢰도: ${prediction.confidence}`);

      if (globalVar) {
        console.log(`   실제값 (${globalVar}): ${actualValue || '(없음)'}`);

        // 일치 여부 확인
        const predictedUpper = (prediction.value || '').toUpperCase();
        const actualUpper = (actualValue || '').toUpperCase();

        if (predictedUpper === actualUpper) {
          console.log(`   ✅ 일치`);
          matchCount++;
        } else if (actualUpper.includes(predictedUpper) || predictedUpper.includes(actualUpper)) {
          console.log(`   ⚠️  부분 일치`);
          matchCount += 0.5;
        } else {
          console.log(`   ❌ 불일치`);
        }
      }

      if (prediction.gtmInfo) {
        console.log(`   📌 GTM: ${prediction.gtmInfo.description}`);
      }

      console.log();
    }

    // 7. 전체 전역변수 값 출력
    console.log('─'.repeat(80));
    console.log('🌐 전체 전역변수 값');
    console.log('─'.repeat(80));
    console.log();

    for (const [varName, value] of Object.entries(actualValues)) {
      console.log(`${varName.padEnd(25)}: ${value || '(undefined)'}`);
    }

    // 8. DataLayer 내용 확인
    console.log('\n');
    console.log('─'.repeat(80));
    console.log('📥 DataLayer 내용 (최근 이벤트)');
    console.log('─'.repeat(80));

    const dataLayerEvents = await page.evaluate(() => {
      const dl = (window as any).dataLayer || [];
      return dl
        .filter((item: any) => item.event)
        .slice(-10)
        .map((item: any) => ({
          event: item.event,
          keys: Object.keys(item).filter(k => k !== 'event').slice(0, 5)
        }));
    });

    console.log();
    for (const item of dataLayerEvents) {
      console.log(`event: "${item.event}"`);
      if (item.keys.length > 0) {
        console.log(`  keys: ${item.keys.join(', ')}`);
      }
    }

    // 9. 요약
    console.log('\n');
    console.log('═'.repeat(80));
    console.log(' 테스트 요약');
    console.log('═'.repeat(80));
    console.log(`\n일치율: ${matchCount}/${totalCount} (${((matchCount / totalCount) * 100).toFixed(1)}%)`);
    console.log();

  } catch (error) {
    console.error('❌ 오류 발생:', error);
  } finally {
    await browser.close();
    console.log('🔚 브라우저 종료');
  }
}

main().catch(console.error);
