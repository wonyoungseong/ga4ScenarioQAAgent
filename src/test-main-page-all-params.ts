/**
 * 메인 페이지 전체 파라미터 수집 분석
 *
 * 모든 공통변수, 이벤트 파라미터, 사용자 속성 등을 확인
 */

import { config } from 'dotenv';
config();

import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const TARGET_URL = 'https://www.amoremall.com/kr/ko/display/main';
const OUTPUT_DIR = './output/main-page-all-params';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     메인 페이지 전체 파라미터 수집 분석                          ║');
  console.log('║     dataLayer + gtag + 전역변수 전체 확인                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: false }); // 실제 화면 확인
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      locale: 'ko-KR',
    });
    const page = await context.newPage();

    // dataLayer 캡처 설정 (페이지 로드 전)
    await page.addInitScript(() => {
      (window as any).__allDataLayerPushes = [];
      (window as any).__allGtagCalls = [];
      (window as any).__allNetworkRequests = [];

      // dataLayer.push 캡처
      const originalDataLayerPush = Array.prototype.push;
      Object.defineProperty(window, 'dataLayer', {
        set: function(val) {
          this._dataLayer = val;
          if (Array.isArray(val)) {
            val.push = function(...args: any[]) {
              (window as any).__allDataLayerPushes.push({
                timestamp: Date.now(),
                data: JSON.parse(JSON.stringify(args))
              });
              return originalDataLayerPush.apply(this, args);
            };
          }
        },
        get: function() {
          return this._dataLayer;
        }
      });

      // gtag 함수 캡처
      const originalGtag = (window as any).gtag;
      (window as any).gtag = function(...args: any[]) {
        (window as any).__allGtagCalls.push({
          timestamp: Date.now(),
          args: JSON.parse(JSON.stringify(args))
        });
        if (originalGtag) {
          return originalGtag.apply(this, args);
        }
      };
    });

    // 네트워크 요청 모니터링 (GA4 수집 요청)
    const ga4Requests: any[] = [];
    page.on('request', request => {
      const url = request.url();
      if (url.includes('google-analytics.com/g/collect') ||
          url.includes('analytics.google.com') ||
          url.includes('gtm.js') ||
          url.includes('gtag/js')) {
        ga4Requests.push({
          url: url,
          method: request.method(),
          timestamp: Date.now(),
        });
      }
    });

    console.log('═'.repeat(70));
    console.log('📍 1. 페이지 로드 및 데이터 수집');
    console.log('═'.repeat(70));

    console.log(`\n   URL: ${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(5000); // 충분한 대기

    // 스크린샷
    const screenshotPath = path.join(OUTPUT_DIR, `screenshot_${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`   ✅ 스크린샷: ${screenshotPath}`);

    // ═══════════════════════════════════════════════════════════════════════
    // 2. dataLayer 전체 내용 추출
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═'.repeat(70));
    console.log('📍 2. dataLayer 전체 내용');
    console.log('═'.repeat(70));

    const dataLayerContent = await page.evaluate(() => {
      return (window as any).dataLayer ?
        JSON.parse(JSON.stringify((window as any).dataLayer)) : [];
    });

    console.log(`\n   dataLayer 항목 수: ${dataLayerContent.length}개`);
    console.log('\n   📋 dataLayer 전체 내용:');

    for (let i = 0; i < dataLayerContent.length; i++) {
      const item = dataLayerContent[i];
      console.log(`\n   [${i}] ${item.event || '(no event)'}`);

      // 주요 키들 출력
      const keys = Object.keys(item).filter(k => k !== 'event');
      for (const key of keys.slice(0, 10)) {
        const value = item[key];
        const valueStr = typeof value === 'object' ?
          JSON.stringify(value).substring(0, 60) + '...' :
          String(value).substring(0, 60);
        console.log(`       ${key}: ${valueStr}`);
      }
      if (keys.length > 10) {
        console.log(`       ... 외 ${keys.length - 10}개 키`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3. 전역변수 확인
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═'.repeat(70));
    console.log('📍 3. 전역변수 확인 (GA4/GTM 관련)');
    console.log('═'.repeat(70));

    const globalVars = await page.evaluate(() => {
      const win = window as any;
      const result: Record<string, any> = {};

      // GA4/GTM 관련 변수
      const keysToCheck = [
        'google_tag_manager',
        'google_tag_data',
        'gaData',
        'ga',
        'gtag',
        'dataLayer',
        '__NUXT__',
        '__NEXT_DATA__',
        'AP',
        'AP_PRODUCT',
        'AP_PAGE',
        'AP_USER',
        'AP_LOGIN',
        'apUserInfo',
        'userInfo',
        'memberInfo',
        'digitalData',
        'utag',
        'utag_data',
      ];

      for (const key of keysToCheck) {
        if (win[key] !== undefined) {
          try {
            if (key === 'dataLayer') {
              result[key] = `Array(${win[key].length} items)`;
            } else if (typeof win[key] === 'function') {
              result[key] = '[Function]';
            } else {
              result[key] = JSON.parse(JSON.stringify(win[key]));
            }
          } catch {
            result[key] = `[${typeof win[key]}]`;
          }
        }
      }

      return result;
    });

    console.log('\n   발견된 전역변수:');
    for (const [key, value] of Object.entries(globalVars)) {
      if (typeof value === 'object' && value !== null) {
        console.log(`\n   📌 ${key}:`);
        const subKeys = Object.keys(value).slice(0, 15);
        for (const subKey of subKeys) {
          const subValue = (value as any)[subKey];
          const subValueStr = typeof subValue === 'object' ?
            JSON.stringify(subValue).substring(0, 50) + '...' :
            String(subValue).substring(0, 50);
          console.log(`      ${subKey}: ${subValueStr}`);
        }
      } else {
        console.log(`   - ${key}: ${value}`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. 공통 파라미터 추출 (page_view 이벤트)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═'.repeat(70));
    console.log('📍 4. page_view 관련 공통 파라미터');
    console.log('═'.repeat(70));

    const pageViewParams = await page.evaluate(() => {
      const params: Record<string, any> = {};

      // 기본 페이지 정보
      params['page_title'] = document.title;
      params['page_location'] = window.location.href;
      params['page_path'] = window.location.pathname;
      params['page_referrer'] = document.referrer || '(direct)';
      params['hostname'] = window.location.hostname;

      // 언어/지역
      params['language'] = navigator.language;
      params['country'] = 'KR'; // URL에서 추론

      // 화면 정보
      params['screen_resolution'] = `${window.screen.width}x${window.screen.height}`;
      params['viewport_size'] = `${window.innerWidth}x${window.innerHeight}`;

      // 사용자 에이전트
      params['user_agent'] = navigator.userAgent;

      // 메타 태그
      const metaTags = document.querySelectorAll('meta');
      metaTags.forEach(meta => {
        const name = meta.getAttribute('name') || meta.getAttribute('property');
        const content = meta.getAttribute('content');
        if (name && content && (
          name.includes('og:') ||
          name.includes('description') ||
          name.includes('keywords') ||
          name.includes('author')
        )) {
          params[`meta_${name.replace(/:/g, '_')}`] = content.substring(0, 100);
        }
      });

      // dataLayer에서 사용자 정보 찾기
      if ((window as any).dataLayer) {
        for (const item of (window as any).dataLayer) {
          // 사용자 관련 키
          if (item.user_id) params['user_id'] = item.user_id;
          if (item.userId) params['userId'] = item.userId;
          if (item.member_id) params['member_id'] = item.member_id;
          if (item.login_status) params['login_status'] = item.login_status;
          if (item.isLogin) params['isLogin'] = item.isLogin;
          if (item.memberGrade) params['memberGrade'] = item.memberGrade;
          if (item.customer_type) params['customer_type'] = item.customer_type;

          // 커스텀 차원
          if (item.customDimensions) {
            params['customDimensions'] = item.customDimensions;
          }

          // ecommerce 관련
          if (item.ecommerce) {
            params['has_ecommerce'] = true;
          }
        }
      }

      // AP 객체에서 사용자 정보
      if ((window as any).AP) {
        const AP = (window as any).AP;
        if (AP.user) params['AP_user'] = JSON.stringify(AP.user).substring(0, 200);
        if (AP.member) params['AP_member'] = JSON.stringify(AP.member).substring(0, 200);
        if (AP.page) params['AP_page'] = JSON.stringify(AP.page).substring(0, 200);
      }

      return params;
    });

    console.log('\n   📋 공통 파라미터:');
    console.log('   ┌─────────────────────────────────────────────────────────────────');

    const importantParams = ['page_title', 'page_location', 'page_path', 'page_referrer',
                            'language', 'hostname', 'screen_resolution', 'viewport_size'];
    for (const key of importantParams) {
      if (pageViewParams[key]) {
        console.log(`   │ ${key}: "${pageViewParams[key]}"`);
      }
    }
    console.log('   └─────────────────────────────────────────────────────────────────');

    // 사용자 관련 파라미터
    console.log('\n   📋 사용자 관련 파라미터:');
    console.log('   ┌─────────────────────────────────────────────────────────────────');
    const userParams = ['user_id', 'userId', 'member_id', 'login_status', 'isLogin',
                        'memberGrade', 'customer_type', 'AP_user', 'AP_member'];
    let hasUserParam = false;
    for (const key of userParams) {
      if (pageViewParams[key]) {
        console.log(`   │ ${key}: "${pageViewParams[key]}"`);
        hasUserParam = true;
      }
    }
    if (!hasUserParam) {
      console.log('   │ (로그인 필요 - 현재 비로그인 상태)');
    }
    console.log('   └─────────────────────────────────────────────────────────────────');

    // 메타 태그
    console.log('\n   📋 메타 태그 정보:');
    console.log('   ┌─────────────────────────────────────────────────────────────────');
    for (const [key, value] of Object.entries(pageViewParams)) {
      if (key.startsWith('meta_')) {
        console.log(`   │ ${key}: "${value}"`);
      }
    }
    console.log('   └─────────────────────────────────────────────────────────────────');

    // ═══════════════════════════════════════════════════════════════════════
    // 5. GA4 네트워크 요청 분석
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═'.repeat(70));
    console.log('📍 5. GA4 수집 요청 분석');
    console.log('═'.repeat(70));

    console.log(`\n   GA4 관련 네트워크 요청: ${ga4Requests.length}개`);

    for (const req of ga4Requests.slice(0, 10)) {
      const urlObj = new URL(req.url);
      console.log(`\n   📌 ${urlObj.pathname}`);

      // 쿼리 파라미터 파싱
      const params = urlObj.searchParams;
      const importantKeys = ['v', 'tid', 'cid', 'en', 'ep.page_title', 'ep.page_location',
                            'dl', 'dt', 'ul', 'sr', 'uid', 'up.'];

      for (const [key, value] of params.entries()) {
        if (importantKeys.some(k => key.startsWith(k) || key === k)) {
          console.log(`      ${key}: ${value.substring(0, 50)}`);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 6. GTM 컨테이너 정보
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═'.repeat(70));
    console.log('📍 6. GTM 컨테이너 정보');
    console.log('═'.repeat(70));

    const gtmInfo = await page.evaluate(() => {
      const info: any = {};

      // GTM 컨테이너 ID 찾기
      const scripts = document.querySelectorAll('script');
      scripts.forEach(script => {
        const src = script.src || '';
        const text = script.textContent || '';

        if (src.includes('gtm.js')) {
          const match = src.match(/id=([A-Z0-9-]+)/);
          if (match) info.gtmContainerId = match[1];
        }

        if (text.includes('GTM-')) {
          const match = text.match(/GTM-[A-Z0-9]+/);
          if (match) info.gtmContainerIdFromScript = match[0];
        }

        if (src.includes('gtag/js')) {
          const match = src.match(/id=([A-Z0-9-]+)/);
          if (match) info.gtagId = match[1];
        }
      });

      // google_tag_manager 객체
      if ((window as any).google_tag_manager) {
        info.gtmContainers = Object.keys((window as any).google_tag_manager);
      }

      return info;
    });

    console.log('\n   GTM/GA4 설정:');
    for (const [key, value] of Object.entries(gtmInfo)) {
      console.log(`   - ${key}: ${JSON.stringify(value)}`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 7. 결과 저장
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═'.repeat(70));
    console.log('📍 7. 결과 저장');
    console.log('═'.repeat(70));

    const result = {
      url: TARGET_URL,
      timestamp: new Date().toISOString(),
      dataLayer: dataLayerContent,
      globalVars,
      pageViewParams,
      ga4Requests: ga4Requests.slice(0, 20),
      gtmInfo,
    };

    const resultPath = path.join(OUTPUT_DIR, `all_params_${Date.now()}.json`);
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
    console.log(`\n   💾 결과 저장: ${resultPath}`);

    // 브라우저 열어두기
    console.log('\n🔍 브라우저를 열어두었습니다. 확인 후 Enter 키를 누르세요...');
    await new Promise(resolve => process.stdin.once('data', resolve));

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
