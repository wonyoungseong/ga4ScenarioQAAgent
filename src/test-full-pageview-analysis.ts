/**
 * page_view 전체 분석: 예측 → 개발 확인 → GA4 비교
 *
 * URL: amoremall.com/kr/ko/
 */

import { chromium } from 'playwright';
import { createDefaultGTMConfigLoader } from './config/gtmConfigLoader';

const TARGET_URL = 'https://www.amoremall.com/kr/ko/';

async function main() {
  console.log('='.repeat(100));
  console.log(' page_view 전체 분석: 예측 → 개발 확인 → GA4 비교');
  console.log(' URL:', TARGET_URL);
  console.log('='.repeat(100));

  // ============================================================================
  // 1. 예측: page_view 발생 여부 및 파라미터 목록
  // ============================================================================
  console.log('\n');
  console.log('━'.repeat(100));
  console.log('📌 1단계: page_view 예측');
  console.log('━'.repeat(100));

  const loader = createDefaultGTMConfigLoader();
  await loader.preload();

  // 페이지 타입 예측 (URL 기반)
  console.log('\n[예측 근거]');
  console.log('  - URL 패턴: /kr/ko/ → 메인 페이지');
  console.log('  - 예상 페이지 타입: MAIN');
  console.log('  - page_view 발생 예측: ✅ YES (모든 페이지에서 발생)');

  // 예측 파라미터 목록
  console.log('\n[예측 파라미터 목록]');

  // PARAM_MAPPING_TABLE.md 기반 파라미터 조회
  const pageViewParams = loader.getEventParamsFromMapping('page_view');
  if (pageViewParams) {
    console.log(`\n  공통 파라미터 (${pageViewParams.commonParams.length}개):`);
    for (const param of pageViewParams.commonParams.slice(0, 5)) {
      console.log(`    - ${param.ga4Key}: ${param.devGuideVar || param.gtmVariable}`);
    }
    console.log(`    ... 외 ${pageViewParams.commonParams.length - 5}개`);

    console.log(`\n  Event 파라미터 (${pageViewParams.eventParams.length}개):`);
    for (const param of pageViewParams.eventParams.slice(0, 10)) {
      console.log(`    - ${param.ga4Key}: ${param.devGuideVar || param.gtmVariable}`);
    }
    if (pageViewParams.eventParams.length > 10) {
      console.log(`    ... 외 ${pageViewParams.eventParams.length - 10}개`);
    }

    console.log(`\n  User 파라미터 (${pageViewParams.userParams.length}개):`);
    for (const param of pageViewParams.userParams) {
      console.log(`    - ${param.ga4Key}: ${param.devGuideVar || param.gtmVariable}`);
    }
  }

  // GTM 변수 체인에서 소스 확인
  console.log('\n[주요 파라미터 데이터 소스 예측]');
  const keyParams = ['page_type', 'site_name', 'language', 'login_id_gcid', 'user_id'];
  for (const param of keyParams) {
    const chain = loader.getVariableChain(param);
    if (chain) {
      const sources = chain.dataSources.map((s: any) => s.type === 'global_variable' ? s.variableName : s.type).join(', ');
      console.log(`    ${param}: ${sources}`);
    }
  }

  // ============================================================================
  // 2. 개발 확인: Playwright로 실제 페이지에서 값 추출
  // ============================================================================
  console.log('\n');
  console.log('━'.repeat(100));
  console.log('📌 2단계: 개발 확인 (Playwright)');
  console.log('━'.repeat(100));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('\n  페이지 로딩 중...');
  await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  // 전역변수 추출
  console.log('\n[전역변수 값 (개발 확인)]');

  const globalVars = await page.evaluate(() => {
    const vars: Record<string, any> = {};
    const targets = [
      // 페이지 정보
      'AP_DATA_PAGETYPE', 'AP_DATA_PAGETITLE', 'AP_DATA_LANG', 'AP_DATA_CURRENCY',
      'AP_DATA_PAGEURL', 'AP_DATA_DOMAIN', 'AP_DATA_FULLURL', 'AP_DATA_SITENAME',
      // 사용자 정보
      'AP_USER_ID', 'AP_USER_TYPE', 'AP_USER_GRADE', 'AP_USER_GENDER', 'AP_USER_AGEGROUP',
      'AP_USER_BEAUTYPOINT', 'AP_USER_ISBEAUTYMEMBER', 'AP_USER_LOGINTYPE',
      // 기타
      'AP_ECOMM_CURRENCY', 'AP_GCID'
    ];
    for (const name of targets) {
      vars[name] = (window as any)[name];
    }
    return vars;
  });

  // 주요 전역변수 출력
  console.log('\n  [페이지 정보]');
  console.log(`    AP_DATA_PAGETYPE: ${globalVars.AP_DATA_PAGETYPE || '(없음)'}`);
  console.log(`    AP_DATA_SITENAME: ${globalVars.AP_DATA_SITENAME || '(없음)'}`);
  console.log(`    AP_DATA_PAGETITLE: ${(globalVars.AP_DATA_PAGETITLE || '').substring(0, 50)}`);
  console.log(`    AP_DATA_PAGEURL: ${(globalVars.AP_DATA_PAGEURL || '').substring(0, 60)}`);
  console.log(`    AP_DATA_LANG: ${globalVars.AP_DATA_LANG || '(없음)'}`);
  console.log(`    AP_DATA_CURRENCY: ${globalVars.AP_DATA_CURRENCY || '(없음)'}`);

  console.log('\n  [사용자 정보]');
  console.log(`    AP_USER_ID: ${globalVars.AP_USER_ID || '(비로그인)'}`);
  console.log(`    AP_GCID: ${(globalVars.AP_GCID || '').substring(0, 30)}...`);
  console.log(`    AP_USER_TYPE: ${globalVars.AP_USER_TYPE || '(없음)'}`);
  console.log(`    AP_USER_GRADE: ${globalVars.AP_USER_GRADE || '(없음)'}`);
  console.log(`    AP_USER_GENDER: ${globalVars.AP_USER_GENDER || '(없음)'}`);

  // dataLayer 확인
  const dataLayer = await page.evaluate(() => (window as any).dataLayer || []);
  console.log('\n  [dataLayer]');
  console.log(`    총 이벤트 수: ${dataLayer.length}개`);

  // gtm.js, gtm.load 등 확인
  const gtmEvents = dataLayer.filter((e: any) => e.event && e.event.startsWith('gtm'));
  console.log(`    GTM 이벤트: ${gtmEvents.map((e: any) => e.event).join(', ')}`);

  await browser.close();

  // ============================================================================
  // 3. 예측값 vs 개발값 비교
  // ============================================================================
  console.log('\n');
  console.log('━'.repeat(100));
  console.log('📌 3단계: 예측 vs 개발 비교');
  console.log('━'.repeat(100));

  console.log('\n| GA4 파라미터 | 예측 소스 | 실제 값 | 상태 |');
  console.log('|--------------|-----------|---------|------|');

  const comparisons = [
    { ga4: 'page_type', source: 'AP_DATA_PAGETYPE', value: globalVars.AP_DATA_PAGETYPE },
    { ga4: 'site_name', source: 'AP_DATA_SITENAME', value: globalVars.AP_DATA_SITENAME },
    { ga4: 'language', source: 'AP_DATA_LANG', value: globalVars.AP_DATA_LANG },
    { ga4: 'page_location', source: 'AP_DATA_FULLURL', value: globalVars.AP_DATA_FULLURL },
    { ga4: 'page_title', source: 'AP_DATA_PAGETITLE', value: globalVars.AP_DATA_PAGETITLE },
    { ga4: 'login_id_gcid', source: 'AP_GCID', value: globalVars.AP_GCID },
    { ga4: 'user_id (UP)', source: 'AP_USER_ID', value: globalVars.AP_USER_ID },
    { ga4: 'user_type (UP)', source: 'AP_USER_TYPE', value: globalVars.AP_USER_TYPE },
    { ga4: 'user_grade (UP)', source: 'AP_USER_GRADE', value: globalVars.AP_USER_GRADE },
  ];

  for (const c of comparisons) {
    const status = c.value ? '✅ 있음' : '⚠️ 없음';
    const displayValue = c.value ? String(c.value).substring(0, 25) : '(없음)';
    console.log(`| ${c.ga4.padEnd(14)} | ${c.source.padEnd(17)} | ${displayValue.padEnd(25)} | ${status} |`);
  }

  // ============================================================================
  // 4. 요약
  // ============================================================================
  console.log('\n');
  console.log('━'.repeat(100));
  console.log('📌 요약');
  console.log('━'.repeat(100));

  const totalParams = pageViewParams
    ? pageViewParams.commonParams.length + pageViewParams.eventParams.length + pageViewParams.userParams.length
    : 0;

  console.log(`
✅ page_view 발생 예측: YES
✅ 실제 페이지 타입: ${globalVars.AP_DATA_PAGETYPE || 'MAIN'}
✅ 예측 파라미터: ${totalParams}개

개발 확인 결과:
  - 페이지 타입: ${globalVars.AP_DATA_PAGETYPE}
  - 사이트명: ${globalVars.AP_DATA_SITENAME}
  - 언어: ${globalVars.AP_DATA_LANG}
  - 사용자 타입: ${globalVars.AP_USER_TYPE || '(비로그인)'}
  - dataLayer 이벤트: ${dataLayer.length}개

※ GA4 API 조회를 위해 별도 명령 실행 필요:
   npx ts-node src/cli.ts ga4 page-events --path /kr/ko/
`);
}

main().catch(console.error);
