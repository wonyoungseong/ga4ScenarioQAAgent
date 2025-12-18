/**
 * 로그인 후 쿠키 저장 및 사용자 파라미터 확인
 *
 * 1. 브라우저를 열어 수동 로그인
 * 2. 로그인 완료 후 쿠키/스토리지 저장
 * 3. 저장된 쿠키로 이후 테스트 자동 실행 가능
 */

import { chromium, Browser, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const TARGET_URL = 'https://www.amoremall.com/kr/ko/display/main';
const LOGIN_URL = 'https://www.amoremall.com/kr/ko/my/signin';
const COOKIES_PATH = './credentials/amoremall_cookies.json';
const OUTPUT_DIR = './output/login-test';

// ═══════════════════════════════════════════════════════════════════════════
// 유틸 함수
// ═══════════════════════════════════════════════════════════════════════════

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 메인 함수
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'login'; // 'login' or 'test'

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     로그인 쿠키 관리 및 사용자 파라미터 확인                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // 출력 디렉토리 생성
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  if (!fs.existsSync(path.dirname(COOKIES_PATH))) {
    fs.mkdirSync(path.dirname(COOKIES_PATH), { recursive: true });
  }

  if (mode === 'login') {
    await loginAndSaveCookies();
  } else if (mode === 'test') {
    await testWithSavedCookies();
  } else {
    console.log('사용법:');
    console.log('  npx ts-node src/test-login-and-save-cookies.ts login  # 로그인 후 쿠키 저장');
    console.log('  npx ts-node src/test-login-and-save-cookies.ts test   # 저장된 쿠키로 테스트');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 로그인 후 쿠키 저장
// ═══════════════════════════════════════════════════════════════════════════

async function loginAndSaveCookies() {
  console.log('═'.repeat(70));
  console.log('📍 1. 로그인 페이지 열기 (수동 로그인 필요)');
  console.log('═'.repeat(70));

  const browser = await chromium.launch({
    headless: false, // 화면 표시
    slowMo: 100,
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'ko-KR',
  });

  const page = await context.newPage();

  console.log(`\n   로그인 페이지로 이동: ${LOGIN_URL}`);
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 60000 });

  console.log('\n' + '═'.repeat(70));
  console.log('⏳ 브라우저에서 로그인을 완료해주세요.');
  console.log('');
  console.log('   👉 로그인 완료 시 자동으로 감지됩니다. (최대 3분 대기)');
  console.log('   👉 로그인 후 URL이 변경되면 자동 진행됩니다.');
  console.log('═'.repeat(70));

  // 로그인 완료 자동 감지 (URL 변경, 쿠키, DOM 확인)
  const startTime = Date.now();
  const maxWaitTime = 180000; // 3분
  let loginDetected = false;
  let lastStatus = '';

  while (Date.now() - startTime < maxWaitTime) {
    const currentUrl = page.url();

    // 1. 로그인 페이지를 벗어났는지 확인 (단, 에러/maintenance 페이지 제외)
    const isOnSigninPage = currentUrl.includes('/signin') || currentUrl.includes('/login');
    const isOnErrorPage = currentUrl.includes('maintenance') || currentUrl.includes('error') || currentUrl.includes('not-found');

    // 2. 로그인 성공 후 리다이렉트된 페이지에서 로그인 상태 확인
    if (!isOnSigninPage && !isOnErrorPage) {
      // DOM에서 로그인 상태 확인
      const loginStatus = await page.evaluate(() => {
        // 로그아웃 버튼 확인
        const logoutBtn = document.querySelector('a[href*="signout"], button[class*="logout"], [data-action="logout"]');
        if (logoutBtn) return 'logout_btn_found';

        // 마이페이지 버튼 확인 (로그인된 상태에서만 표시)
        const mypageBtn = document.querySelector('a[href*="/my/"][href*="mypage"], [class*="my-page"], [class*="mypage"]');
        if (mypageBtn) return 'mypage_btn_found';

        // 로그인 버튼 확인 (로그인 안 된 상태)
        const loginBtn = document.querySelector('a[href*="signin"], button[class*="login"]');
        if (loginBtn) return 'login_btn_found';

        // 텍스트로 확인
        const bodyText = document.body.innerText;
        if (bodyText.includes('로그아웃') || bodyText.includes('마이페이지')) return 'logged_in_text';

        return 'unknown';
      });

      if (loginStatus === 'logout_btn_found' || loginStatus === 'mypage_btn_found' || loginStatus === 'logged_in_text') {
        console.log(`\n   ✅ 로그인 완료 감지! (${loginStatus})`);
        loginDetected = true;
        break;
      }

      if (loginStatus !== lastStatus) {
        lastStatus = loginStatus;
        console.log(`\n   📍 현재 상태: ${loginStatus} (URL: ${currentUrl})`);
      }
    }

    // 3. 로그인 쿠키 확인 (아모레몰 특정 쿠키)
    const cookies = await context.cookies();
    const authCookie = cookies.find(c =>
      c.name === 'accessToken' ||
      c.name === 'refreshToken' ||
      c.name === 'apAccessToken' ||
      c.name === 'memberNo' ||
      c.name === 'AP_TOKEN'
    );

    if (authCookie) {
      console.log(`\n   ✅ 인증 쿠키 감지! (${authCookie.name})`);
      loginDetected = true;
      break;
    }

    // 1초마다 체크
    await page.waitForTimeout(1000);
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    process.stdout.write(`\r   ⏳ 로그인 대기 중... (${elapsed}초 / 최대 180초)     `);
  }

  if (!loginDetected) {
    console.log('\n   ⚠️ 로그인 감지 타임아웃. 현재 상태로 진행합니다.');
  }
  console.log('');

  // 메인 페이지로 이동
  console.log('\n   메인 페이지로 이동...');
  await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  // 로그인 상태 확인
  const isLoggedIn = await page.evaluate(() => {
    // 로그인 상태 확인 방법들
    const win = window as any;

    // 1. dataLayer에서 확인
    if (win.dataLayer) {
      for (const item of win.dataLayer) {
        if (item.isLogin || item.login_status || item.user_id || item.member_id) {
          return true;
        }
      }
    }

    // 2. DOM에서 확인
    const loginBtn = document.querySelector('[class*="login"], [href*="signin"]');
    const logoutBtn = document.querySelector('[class*="logout"], [href*="signout"]');
    const mypageBtn = document.querySelector('[class*="mypage"], [href*="/my/"]');

    if (logoutBtn || mypageBtn) return true;
    if (loginBtn && !logoutBtn) return false;

    // 3. 쿠키에서 확인
    if (document.cookie.includes('accessToken') || document.cookie.includes('refreshToken')) {
      return true;
    }

    return null; // 확인 불가
  });

  console.log(`\n   로그인 상태: ${isLoggedIn === true ? '✅ 로그인됨' : isLoggedIn === false ? '❌ 비로그인' : '❓ 확인 불가'}`);

  // 쿠키 및 스토리지 저장
  console.log('\n═'.repeat(70));
  console.log('📍 2. 쿠키 및 스토리지 저장');
  console.log('═'.repeat(70));

  const storageState = await context.storageState();

  fs.writeFileSync(COOKIES_PATH, JSON.stringify(storageState, null, 2));
  console.log(`\n   ✅ 쿠키 저장 완료: ${COOKIES_PATH}`);
  console.log(`   - 쿠키 수: ${storageState.cookies.length}개`);
  console.log(`   - 오리진 수: ${storageState.origins.length}개`);

  // 저장된 쿠키 목록
  console.log('\n   📋 저장된 쿠키:');
  for (const cookie of storageState.cookies.slice(0, 10)) {
    console.log(`   - ${cookie.name}: ${cookie.value.substring(0, 30)}...`);
  }
  if (storageState.cookies.length > 10) {
    console.log(`   ... 외 ${storageState.cookies.length - 10}개`);
  }

  // 사용자 파라미터 확인
  await checkUserParameters(page);

  await browser.close();

  console.log('\n═'.repeat(70));
  console.log('✅ 완료! 이제 다음 명령으로 테스트할 수 있습니다:');
  console.log('   npx ts-node src/test-login-and-save-cookies.ts test');
  console.log('═'.repeat(70));
}

// ═══════════════════════════════════════════════════════════════════════════
// 저장된 쿠키로 테스트
// ═══════════════════════════════════════════════════════════════════════════

async function testWithSavedCookies() {
  console.log('═'.repeat(70));
  console.log('📍 저장된 쿠키로 테스트');
  console.log('═'.repeat(70));

  // 쿠키 파일 확인
  if (!fs.existsSync(COOKIES_PATH)) {
    console.error(`\n   ❌ 쿠키 파일이 없습니다: ${COOKIES_PATH}`);
    console.log('   먼저 로그인을 진행해주세요:');
    console.log('   npx ts-node src/test-login-and-save-cookies.ts login');
    return;
  }

  const storageState = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
  console.log(`\n   쿠키 파일 로드: ${storageState.cookies.length}개 쿠키`);

  const browser = await chromium.launch({
    headless: false,
  });

  // 저장된 쿠키로 컨텍스트 생성
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'ko-KR',
    storageState: COOKIES_PATH, // 저장된 쿠키 사용
  });

  const page = await context.newPage();

  console.log(`\n   메인 페이지 접속: ${TARGET_URL}`);
  await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  // 스크린샷
  const screenshotPath = path.join(OUTPUT_DIR, `logged_in_${Date.now()}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`   ✅ 스크린샷: ${screenshotPath}`);

  // 사용자 파라미터 확인
  await checkUserParameters(page);

  // 브라우저 열어두기 (10초 후 자동 종료)
  console.log('\n🔍 브라우저를 10초간 열어둡니다...');
  await page.waitForTimeout(10000);

  await browser.close();
  console.log('\n✅ 브라우저 종료 완료');
}

// ═══════════════════════════════════════════════════════════════════════════
// 사용자 파라미터 확인
// ═══════════════════════════════════════════════════════════════════════════

async function checkUserParameters(page: any) {
  console.log('\n═'.repeat(70));
  console.log('📍 3. 사용자 관련 파라미터 확인');
  console.log('═'.repeat(70));

  const userParams = await page.evaluate(() => {
    const win = window as any;
    const params: Record<string, any> = {};

    // 1. dataLayer 전체 내용 추출
    if (win.dataLayer) {
      params['dataLayer_items'] = win.dataLayer.length;
      params['dataLayer_full'] = [];

      for (let i = 0; i < win.dataLayer.length; i++) {
        const item = win.dataLayer[i];
        const eventName = item.event || item[0] || '(no event)';

        // 전체 내용 저장 (디버깅용)
        params['dataLayer_full'].push({
          index: i,
          event: eventName,
          data: JSON.parse(JSON.stringify(item))
        });

        // 사용자 ID 관련
        if (item.user_id) params['user_id'] = item.user_id;
        if (item.userId) params['userId'] = item.userId;
        if (item.member_id) params['member_id'] = item.member_id;
        if (item.memberId) params['memberId'] = item.memberId;
        if (item.customer_id) params['customer_id'] = item.customer_id;
        if (item.custNo) params['custNo'] = item.custNo;
        if (item.memberNo) params['memberNo'] = item.memberNo;

        // 로그인 상태
        if (item.isLogin !== undefined) params['isLogin'] = item.isLogin;
        if (item.login_status !== undefined) params['login_status'] = item.login_status;
        if (item.logged_in !== undefined) params['logged_in'] = item.logged_in;
        if (item.loginYn !== undefined) params['loginYn'] = item.loginYn;

        // 회원 정보
        if (item.memberGrade) params['memberGrade'] = item.memberGrade;
        if (item.member_grade) params['member_grade'] = item.member_grade;
        if (item.customer_type) params['customer_type'] = item.customer_type;
        if (item.userType) params['userType'] = item.userType;
        if (item.memberGradeNm) params['memberGradeNm'] = item.memberGradeNm;
        if (item.memberGradeCd) params['memberGradeCd'] = item.memberGradeCd;

        // 기타 사용자 속성
        if (item.gender) params['gender'] = item.gender;
        if (item.age) params['age'] = item.age;
        if (item.age_group) params['age_group'] = item.age_group;
        if (item.birthYyyy) params['birthYyyy'] = item.birthYyyy;

        // ecommerce 관련 사용자 속성
        if (item.ecommerce?.user) params['ecommerce_user'] = item.ecommerce.user;
      }
    }

    // 2. AP 객체에서 사용자 정보 추출 (아모레퍼시픽 전용)
    if (win.AP) {
      if (win.AP.user) {
        params['AP_user'] = win.AP.user;
      }
      if (win.AP.member) {
        params['AP_member'] = win.AP.member;
      }
      if (win.AP.login) {
        params['AP_login'] = win.AP.login;
      }
    }

    // 3. 전역 사용자 정보 객체
    if (win.userInfo) params['userInfo'] = win.userInfo;
    if (win.memberInfo) params['memberInfo'] = win.memberInfo;
    if (win.apUserInfo) params['apUserInfo'] = win.apUserInfo;

    // 4. __NEXT_DATA__에서 사용자 정보
    if (win.__NEXT_DATA__?.props?.pageProps) {
      const pageProps = win.__NEXT_DATA__.props.pageProps;
      if (pageProps.user) params['NEXT_user'] = pageProps.user;
      if (pageProps.member) params['NEXT_member'] = pageProps.member;
      if (pageProps.isLogin !== undefined) params['NEXT_isLogin'] = pageProps.isLogin;
    }

    // 5. 쿠키에서 토큰 확인
    const cookies = document.cookie.split(';').map(c => c.trim());
    for (const cookie of cookies) {
      const [name] = cookie.split('=');
      if (name.includes('token') || name.includes('Token') ||
          name.includes('auth') || name.includes('Auth') ||
          name.includes('user') || name.includes('User') ||
          name.includes('member') || name.includes('Member')) {
        params[`cookie_${name}`] = '(있음)';
      }
    }

    // 6. LocalStorage 확인
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('user') || key.includes('User') ||
                    key.includes('member') || key.includes('Member') ||
                    key.includes('auth') || key.includes('Auth') ||
                    key.includes('token') || key.includes('Token') ||
                    key.includes('login') || key.includes('Login'))) {
          const value = localStorage.getItem(key);
          params[`localStorage_${key}`] = value ? value.substring(0, 50) + '...' : null;
        }
      }
    } catch (e) {
      // localStorage 접근 실패 무시
    }

    return params;
  });

  // 결과 출력
  console.log('\n   📋 사용자 관련 파라미터:');
  console.log('   ┌─────────────────────────────────────────────────────────────────');

  const groupedParams: Record<string, Record<string, any>> = {
    '사용자 ID': {},
    '로그인 상태': {},
    '회원 정보': {},
    'AP 객체': {},
    '쿠키/스토리지': {},
    '기타': {},
  };

  for (const [key, value] of Object.entries(userParams)) {
    if (key.includes('user_id') || key.includes('userId') || key.includes('member_id') || key.includes('customer_id')) {
      groupedParams['사용자 ID'][key] = value;
    } else if (key.includes('login') || key.includes('Login') || key.includes('logged')) {
      groupedParams['로그인 상태'][key] = value;
    } else if (key.includes('member') || key.includes('Member') || key.includes('grade') || key.includes('type')) {
      groupedParams['회원 정보'][key] = value;
    } else if (key.startsWith('AP_')) {
      groupedParams['AP 객체'][key] = value;
    } else if (key.startsWith('cookie_') || key.startsWith('localStorage_')) {
      groupedParams['쿠키/스토리지'][key] = value;
    } else {
      groupedParams['기타'][key] = value;
    }
  }

  for (const [group, params] of Object.entries(groupedParams)) {
    const keys = Object.keys(params);
    if (keys.length > 0) {
      console.log(`   │`);
      console.log(`   │ 【${group}】`);
      for (const [key, value] of Object.entries(params)) {
        const valueStr = typeof value === 'object' ?
          JSON.stringify(value).substring(0, 50) + '...' :
          String(value).substring(0, 50);
        console.log(`   │   ${key}: ${valueStr}`);
      }
    }
  }

  console.log('   └─────────────────────────────────────────────────────────────────');

  // 결과 저장
  const resultPath = path.join(OUTPUT_DIR, `user_params_${Date.now()}.json`);
  fs.writeFileSync(resultPath, JSON.stringify(userParams, null, 2));
  console.log(`\n   💾 결과 저장: ${resultPath}`);

  return userParams;
}

// 실행
main().catch(error => {
  console.error('❌ 오류:', error.message);
  process.exit(1);
});
