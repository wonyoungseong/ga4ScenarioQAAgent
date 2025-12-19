/**
 * MAIN 페이지 page_view 파라미터 분석 (수동 로그인 지원)
 *
 * 1. 브라우저를 열고 MAIN 페이지로 이동
 * 2. 사용자가 수동으로 로그인
 * 3. 로그인 완료 후 브라우저 팝업에서 "확인" 클릭
 * 4. 로그인 상태의 파라미터 수집
 */

import { chromium, Page } from 'playwright';
import { extractParamsFromGTM } from './parsers/paramMappingParser';
import {
  validateGTMtoGA4Mapping,
  queryGA4DimensionValue,
  getQueryabilitySummary,
} from './config/ga4DimensionRegistry';

const TARGET_URL = 'https://www.amoremall.com/kr/ko/display/main';
const PROPERTY_ID = '416629733';
const GTM_PATH = './GTM-5FK5X5C4_workspace112.json';

// HTML 모달 오버레이 표시 및 버튼 클릭 대기
async function showModalAndWait(page: Page, options: {
  title: string;
  message: string;
  buttonText: string;
  buttonColor?: string;
}): Promise<void> {
  const { title, message, buttonText, buttonColor = '#667eea' } = options;

  // 모달 삽입
  await page.evaluate(({ title, message, buttonText, buttonColor }) => {
    // 기존 모달 제거
    const existing = document.getElementById('qa-modal-overlay');
    if (existing) existing.remove();

    // 오버레이 생성
    const overlay = document.createElement('div');
    overlay.id = 'qa-modal-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // 모달 박스
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: white;
      padding: 30px 40px;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 400px;
      text-align: center;
      animation: modalIn 0.3s ease;
    `;

    // 스타일 애니메이션 추가
    const style = document.createElement('style');
    style.textContent = `
      @keyframes modalIn {
        from { transform: scale(0.8); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    // 제목
    const titleEl = document.createElement('h2');
    titleEl.innerText = title;
    titleEl.style.cssText = `
      margin: 0 0 15px 0;
      font-size: 22px;
      color: #333;
    `;

    // 메시지
    const messageEl = document.createElement('p');
    messageEl.innerHTML = message.replace(/\n/g, '<br>');
    messageEl.style.cssText = `
      margin: 0 0 25px 0;
      font-size: 15px;
      color: #666;
      line-height: 1.6;
    `;

    // 버튼
    const btn = document.createElement('button');
    btn.id = 'qa-modal-confirm-btn';
    btn.innerText = buttonText;
    btn.style.cssText = `
      background: linear-gradient(135deg, ${buttonColor} 0%, ${buttonColor}dd 100%);
      color: white;
      border: none;
      padding: 15px 40px;
      border-radius: 10px;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      box-shadow: 0 4px 15px ${buttonColor}66;
      transition: transform 0.2s, box-shadow 0.2s;
    `;
    btn.onmouseover = () => {
      btn.style.transform = 'scale(1.05)';
    };
    btn.onmouseout = () => {
      btn.style.transform = 'scale(1)';
    };

    modal.appendChild(titleEl);
    modal.appendChild(messageEl);
    modal.appendChild(btn);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }, { title, message, buttonText, buttonColor });

  // 버튼 클릭 대기
  await page.click('#qa-modal-confirm-btn', { timeout: 0 });

  // 모달 제거
  await page.evaluate(() => {
    const overlay = document.getElementById('qa-modal-overlay');
    if (overlay) overlay.remove();
  });
}

// 로그인 완료 모달 대기 함수
async function waitForLoginWithModal(page: Page): Promise<void> {
  // 초기 안내 모달
  await showModalAndWait(page, {
    title: '🔐 로그인 안내',
    message: '로그인을 진행해주세요.\n\n이 버튼을 클릭하면 로그인 페이지로\n이동할 수 있습니다.',
    buttonText: '확인 - 로그인 진행하기',
    buttonColor: '#667eea',
  });

  console.log('   📋 로그인을 진행해주세요...');
  console.log('   📋 로그인 완료 후 MAIN 페이지로 돌아오면 팝업이 나타납니다.\n');

  // MAIN 페이지에 올 때까지 대기
  let isLoginComplete = false;
  while (!isLoginComplete) {
    // 2초 대기
    await page.waitForTimeout(2000);

    // 현재 URL 확인
    let currentUrl = '';
    try {
      currentUrl = page.url();
    } catch (e) {
      continue;
    }

    const isOnMain = currentUrl.includes('/display/main');

    if (isOnMain) {
      // MAIN 페이지 로드 완료 대기
      try {
        await page.waitForLoadState('networkidle', { timeout: 10000 });
      } catch (e) {
        // 타임아웃 무시
      }
      await page.waitForTimeout(2000);

      // site_name이 APMALL인지 확인 (아모레몰 MAIN 페이지)
      const siteName = await page.evaluate(() => (window as any).AP_DATA_SITENAME);
      if (siteName !== 'APMALL') {
        console.log(`   ⏳ 페이지 로드 중... (site_name: ${siteName})`);
        continue;
      }

      // MAIN 페이지에서 로그인 완료 확인 모달
      await showModalAndWait(page, {
        title: '✅ 로그인 완료 확인',
        message: '로그인을 완료하셨나요?\n\n완료했다면 아래 버튼을 클릭해주세요.',
        buttonText: '로그인 완료!',
        buttonColor: '#11998e',
      });
      isLoginComplete = true;
    } else {
      console.log(`   ⏳ 로그인 중... (${currentUrl.substring(0, 40)}...)`);
    }
  }
}

// 분석 완료 버튼 추가하고 클릭 대기
async function waitForAnalysisCompleteButton(page: Page): Promise<void> {
  await page.evaluate(() => {
    const existing = document.getElementById('qa-analysis-complete-btn');
    if (existing) existing.remove();

    const btn = document.createElement('button');
    btn.id = 'qa-analysis-complete-btn';
    btn.innerText = '📊 분석 완료 - 브라우저 닫기';
    btn.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999999;
      background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
      color: white;
      border: none;
      padding: 15px 30px;
      border-radius: 10px;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(17, 153, 142, 0.4);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;
    document.body.appendChild(btn);
  });

  await page.click('#qa-analysis-complete-btn');
}

async function main() {
  console.log('='.repeat(100));
  console.log(' MAIN 페이지 page_view 파라미터 분석 (수동 로그인 지원)');
  console.log('='.repeat(100));

  // 1. GTM 파라미터 및 GA4 매핑 검증
  console.log('\n📌 1단계: GA4 매핑 검증\n');

  const gtmParams = extractParamsFromGTM(GTM_PATH);
  const mappingResult = await validateGTMtoGA4Mapping({
    propertyId: PROPERTY_ID,
    gtmEventParams: gtmParams.eventParams,
    gtmUserProps: gtmParams.userProperties,
  });

  if (!mappingResult.success) {
    console.log(`⚠️ GA4 매핑 검증 스킵 (토큰 만료)`);
    console.log('   → 로그인 테스트는 계속 진행합니다.\n');
  } else {
    const allMappings = [...mappingResult.eventMappings, ...mappingResult.userMappings];
    const summary = getQueryabilitySummary(allMappings);

    console.log(`   ✅ 조회 가능: ${summary.queryable}개 (${summary.queryableRate.toFixed(1)}%)`);
    console.log(`   ❌ 조회 불가: ${summary.notQueryable}개`);
  }

  // 2. 브라우저 실행 (headless: false로 화면 표시)
  console.log('\n📌 2단계: 브라우저 실행 (로그인 대기)\n');

  const browser = await chromium.launch({
    headless: false,  // 브라우저 화면 표시
    slowMo: 100,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  console.log('   🌐 브라우저를 열고 MAIN 페이지로 이동합니다...\n');
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);

  // AP_DATA_SITENAME이 로드될 때까지 대기
  let siteName = '';
  for (let i = 0; i < 10; i++) {
    siteName = await page.evaluate(() => (window as any).AP_DATA_SITENAME || '');
    if (siteName === 'APMALL') break;
    await page.waitForTimeout(1000);
  }
  console.log(`   ✅ 페이지 로드 완료 (site_name: ${siteName})\n`);

  // 3. 비로그인 상태 값 수집
  console.log('━'.repeat(100));
  console.log(' 📋 비로그인 상태 파라미터 수집');
  console.log('━'.repeat(100));

  const beforeLoginValues = await collectDevValues(page);
  printDevValues(beforeLoginValues, '비로그인');

  // 4. 사용자에게 로그인 요청 (브라우저 팝업)
  console.log('\n' + '━'.repeat(100));
  console.log(' 🔐 수동 로그인 요청');
  console.log('━'.repeat(100));
  console.log('\n   브라우저에 팝업이 표시됩니다.');
  console.log('   로그인 완료 후 MAIN 페이지에서 "확인"을 클릭해주세요.\n');

  // 로그인 완료 모달 대기
  await waitForLoginWithModal(page);

  console.log('   ✅ 로그인 완료 확인! (MAIN 페이지)');

  // 5. 페이지 로드 완료 대기
  console.log('\n   🔄 페이지 로드 완료 대기 중...');
  try {
    await page.waitForLoadState('networkidle', { timeout: 10000 });
  } catch (e) {
    // networkidle 타임아웃 시 무시
  }
  await page.waitForTimeout(3000);
  console.log('   ✅ 페이지 로드 완료');

  // 6. 로그인 상태 값 수집
  console.log('\n' + '━'.repeat(100));
  console.log(' 📋 로그인 상태 파라미터 수집');
  console.log('━'.repeat(100));

  const afterLoginValues = await collectDevValues(page);
  printDevValues(afterLoginValues, '로그인');

  // 7. 비교 테이블 출력
  console.log('\n' + '='.repeat(100));
  console.log(' 비로그인 vs 로그인 비교');
  console.log('='.repeat(100));

  printComparisonTable(beforeLoginValues, afterLoginValues);

  // 8. GA4 API 조회 (로그인 사용자 데이터) - 토큰 유효시에만
  if (mappingResult.success) {
    console.log('\n' + '='.repeat(100));
    console.log(' GA4 API 로그인 사용자 데이터 조회');
    console.log('='.repeat(100));

    const loginParams = [
      { param: 'login_is_login', dim: 'customEvent:login_is_login' },
      { param: 'login_id_gcid', dim: 'customEvent:login_id_gcid' },
      { param: 'login_id_cid', dim: 'customEvent:login_id_cid' },
    ];

    console.log('\n   [로그인 사용자 필터: login_is_login = Y]\n');

    for (const { param, dim } of loginParams) {
      const result = await queryGA4DimensionValue({
        propertyId: PROPERTY_ID,
        dimension: dim,
        filters: {
          eventName: 'page_view',
          pagePath: '/display/main',
        },
      });

      if (result.success && result.values.length > 0) {
        const yValue = result.values.find(v => v.value === 'Y' || v.value !== '(not set)');
        if (yValue) {
          console.log(`   ${param}: ${yValue.value} (${yValue.count.toLocaleString()}건)`);
        } else {
          console.log(`   ${param}: ${result.values[0].value} (${result.values[0].count.toLocaleString()}건)`);
        }
      } else {
        console.log(`   ${param}: (조회 실패)`);
      }
    }

    console.log('\n   [User Properties]\n');

    const userProps = [
      { param: 'login_is_sso', dim: 'customUser:login_is_sso' },
      { param: 'login_gender', dim: 'customUser:login_gender' },
      { param: 'login_birth', dim: 'customUser:login_birth' },
      { param: 'login_age', dim: 'customUser:login_age' },
      { param: 'login_level', dim: 'customUser:login_level' },
      { param: 'login_beauty_level', dim: 'customUser:login_beauty_level' },
      { param: 'login_is_member', dim: 'customUser:login_is_member' },
      { param: 'login_method', dim: 'customUser:login_method' },
    ];

    for (const { param, dim } of userProps) {
      const result = await queryGA4DimensionValue({
        propertyId: PROPERTY_ID,
        dimension: dim,
        filters: {
          eventName: 'page_view',
          pagePath: '/display/main',
        },
      });

      if (result.success && result.values.length > 0) {
        const topValues = result.values.slice(0, 3).map(v => `${v.value}(${v.count.toLocaleString()})`).join(', ');
        console.log(`   ${param}: ${topValues}`);
      } else {
        console.log(`   ${param}: (조회 실패)`);
      }
    }
  } else {
    console.log('\n   ⚠️ GA4 API 조회 스킵 (토큰 만료)');
  }

  // 9. 브라우저 종료
  console.log('\n\n   분석이 완료되었습니다.');
  await showModalAndWait(page, {
    title: '📊 분석 완료!',
    message: '모든 파라미터 수집이 완료되었습니다.\n\n버튼을 클릭하면 브라우저가 닫힙니다.',
    buttonText: '브라우저 닫기',
    buttonColor: '#e74c3c',
  });

  await browser.close();
  console.log('\n   ✅ 분석 완료!\n');
}

// 개발 변수 수집 함수
async function collectDevValues(page: any): Promise<Record<string, any>> {
  return await page.evaluate(() => {
    const vars: Record<string, any> = {};
    const allVars = [
      'AP_DATA_SITENAME', 'AP_DATA_COUNTRY', 'AP_DATA_LANG', 'AP_DATA_ENV',
      'AP_DATA_PAGETYPE', 'AP_DATA_CHANNEL', 'AP_DATA_ISLOGIN', 'AP_DATA_BREAD',
      'AP_DATA_GCID', 'AP_DATA_CID', 'AP_DATA_ISSSO', 'AP_DATA_CG', 'AP_DATA_CD',
      'AP_DATA_AGE', 'AP_DATA_CT', 'AP_DATA_BEAUTYCT', 'AP_DATA_LOGINTYPE',
      'AP_DATA_ISEMPLOYEE', 'AP_DATA_ISSUBSCRIPTION',
    ];
    for (const name of allVars) {
      vars[name] = (window as any)[name];
    }
    vars['_pageURL'] = window.location.href;
    vars['_referrer'] = document.referrer || '';
    return vars;
  });
}

// 개발 변수 출력 함수
function printDevValues(values: Record<string, any>, label: string) {
  const VAR_MAP: Record<string, string> = {
    'AP_DATA_SITENAME': 'site_name',
    'AP_DATA_COUNTRY': 'site_country',
    'AP_DATA_LANG': 'site_language',
    'AP_DATA_ENV': 'site_env',
    'AP_DATA_PAGETYPE': 'content_group',
    'AP_DATA_CHANNEL': 'channel',
    'AP_DATA_ISLOGIN': 'login_is_login',
    'AP_DATA_GCID': 'login_id_gcid',
    'AP_DATA_CID': 'login_id_cid',
    'AP_DATA_ISSSO': 'login_is_sso',
    'AP_DATA_CG': 'login_gender',
    'AP_DATA_CD': 'login_birth',
    'AP_DATA_AGE': 'login_age',
    'AP_DATA_CT': 'login_level',
    'AP_DATA_BEAUTYCT': 'login_beauty_level',
    'AP_DATA_ISEMPLOYEE': 'login_is_member',
    'AP_DATA_LOGINTYPE': 'login_method',
    'AP_DATA_ISSUBSCRIPTION': 'login_is_subscription',
  };

  console.log(`\n   [${label} 상태]\n`);

  for (const [devVar, param] of Object.entries(VAR_MAP)) {
    const val = values[devVar];
    const displayVal = val !== undefined && val !== null && val !== '' ? String(val) : '(없음)';
    console.log(`   ${param.padEnd(22)}: ${displayVal}`);
  }
}

// 비교 테이블 출력
function printComparisonTable(before: Record<string, any>, after: Record<string, any>) {
  const VAR_MAP: Record<string, string> = {
    'AP_DATA_ISLOGIN': 'login_is_login',
    'AP_DATA_GCID': 'login_id_gcid',
    'AP_DATA_CID': 'login_id_cid',
    'AP_DATA_ISSSO': 'login_is_sso',
    'AP_DATA_CG': 'login_gender',
    'AP_DATA_CD': 'login_birth',
    'AP_DATA_AGE': 'login_age',
    'AP_DATA_CT': 'login_level',
    'AP_DATA_BEAUTYCT': 'login_beauty_level',
    'AP_DATA_ISEMPLOYEE': 'login_is_member',
    'AP_DATA_LOGINTYPE': 'login_method',
    'AP_DATA_ISSUBSCRIPTION': 'login_is_subscription',
  };

  console.log('\n| 파라미터 | 비로그인 | 로그인 | 변경 |');
  console.log('|----------|----------|--------|------|');

  for (const [devVar, param] of Object.entries(VAR_MAP)) {
    const beforeVal = before[devVar] !== undefined && before[devVar] !== null && before[devVar] !== ''
      ? String(before[devVar]) : '(없음)';
    const afterVal = after[devVar] !== undefined && after[devVar] !== null && after[devVar] !== ''
      ? String(after[devVar]) : '(없음)';

    const changed = beforeVal !== afterVal ? '✅' : '-';

    const displayBefore = beforeVal.length > 15 ? beforeVal.substring(0, 12) + '...' : beforeVal;
    const displayAfter = afterVal.length > 15 ? afterVal.substring(0, 12) + '...' : afterVal;

    console.log(`| ${param.padEnd(22)} | ${displayBefore.padEnd(15)} | ${displayAfter.padEnd(15)} | ${changed} |`);
  }
}

main().catch(console.error);
