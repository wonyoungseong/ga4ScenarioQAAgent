/**
 * page_view 파라미터 예측 vs 실제 수집 비교 테스트
 *
 * 목표:
 * 1. 페이지의 전역변수(AP_DATA_*) 값을 추출
 * 2. GA4 네트워크 요청에서 실제 수집된 값 추출
 * 3. 화면에서 예측 가능한 값 분석 (사이트별 매핑 활용)
 * 4. 예측 정확도 측정 및 개선점 도출
 */

import { chromium, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const TARGET_URL = 'https://www.amoremall.com/kr/ko/display/main';

// page_view 이벤트에서 수집하는 파라미터 (PARAM_MAPPING_TABLE.md 기준)
const PAGE_VIEW_PARAMS = {
  site_name: { devGuideVar: 'AP_DATA_SITENAME', description: '사이트 이름' },
  site_country: { devGuideVar: 'AP_DATA_COUNTRY', description: '국가코드 (ISO 3166-1)' },
  site_language: { devGuideVar: 'AP_DATA_LANG', description: '페이지 언어 (ISO 639-1)' },
  site_env: { devGuideVar: 'AP_DATA_ENV', description: '개발환경' },
  content_group: { devGuideVar: 'AP_DATA_PAGETYPE', description: '페이지 타입' },
  breadcrumb: { devGuideVar: 'AP_DATA_BREAD', description: 'Breadcrumb' },
  login_is_login: { devGuideVar: 'AP_DATA_ISLOGIN', description: '로그인 여부' },
  channel: { devGuideVar: 'AP_DATA_CHANNEL', description: '접속 채널' },
};

interface SiteConfig {
  domain: string;
  propertyId?: string;
  parameterMappings: Record<string, {
    value: string;
    description: string;
    globalVar?: string;
    predictionNote?: string;
  }>;
  pageTypePatterns?: Record<string, string[]>;
  channelDetection?: {
    mobileMaxWidth: number;
    tabletMaxWidth: number;
    mobileValue: string;
    tabletValue: string;
    pcValue: string;
  };
}

interface PredictionResult {
  paramKey: string;
  devGuideVar: string;
  description: string;
  globalVarValue: string | null;    // 전역변수에서 추출한 값
  ga4CollectedValue: string | null; // GA4에서 실제 수집된 값
  screenPrediction: string | null;  // 화면에서 예측한 값
  predictionSource: string;         // 예측 근거
  match: 'EXACT' | 'PARTIAL' | 'MISMATCH' | 'NOT_COLLECTED' | 'UNKNOWN';
}

/**
 * 사이트별 설정 로드
 */
function loadSiteConfig(domain: string): SiteConfig | null {
  const configPath = path.join(process.cwd(), 'config', 'site-parameter-mappings.json');

  if (!fs.existsSync(configPath)) {
    console.warn('⚠️ site-parameter-mappings.json not found');
    return null;
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  // 도메인 매칭 (서브도메인 포함)
  for (const [key, siteConfig] of Object.entries(config.sites)) {
    if (domain.includes(key)) {
      return siteConfig as SiteConfig;
    }
  }

  return null;
}

/**
 * 페이지에서 전역변수 추출
 */
async function extractGlobalVariables(page: Page): Promise<Record<string, string | null>> {
  return await page.evaluate(() => {
    const variables: Record<string, string | null> = {};

    // AP_DATA_* 전역변수 추출
    const varNames = [
      'AP_DATA_SITENAME',
      'AP_DATA_COUNTRY',
      'AP_DATA_LANG',
      'AP_DATA_ENV',
      'AP_DATA_PAGETYPE',
      'AP_DATA_BREAD',
      'AP_DATA_ISLOGIN',
      'AP_DATA_CHANNEL',
    ];

    for (const varName of varNames) {
      const value = (window as any)[varName];
      variables[varName] = value !== undefined ? String(value) : null;
    }

    return variables;
  });
}

/**
 * 화면에서 파라미터 값 예측 (개선된 버전)
 */
async function predictFromScreen(
  page: Page,
  siteConfig: SiteConfig | null
): Promise<Record<string, { value: string | null; source: string }>> {
  const url = page.url();
  const predictions: Record<string, { value: string | null; source: string }> = {};
  const urlObj = new URL(url);

  // 1. site_name: 사이트별 매핑 우선 사용
  if (siteConfig?.parameterMappings?.site_name) {
    predictions['site_name'] = {
      value: siteConfig.parameterMappings.site_name.value,
      source: `사이트 매핑 (${siteConfig.domain})`
    };
  } else {
    // Fallback: URL 도메인에서 추출
    const domainParts = urlObj.hostname.replace('www.', '').split('.');
    predictions['site_name'] = {
      value: domainParts[0].toUpperCase(),
      source: 'URL 도메인 (매핑 없음, 추측)'
    };
  }

  // 2. site_country: URL 경로에서 추출 (/kr/, /us/, etc)
  const countryMatch = url.match(/\/([a-z]{2})\//i);
  if (countryMatch) {
    predictions['site_country'] = {
      value: countryMatch[1].toUpperCase(),
      source: `URL 경로 (/${countryMatch[1]}/)`
    };
  } else {
    predictions['site_country'] = { value: null, source: 'URL에서 국가 코드 없음' };
  }

  // 3. site_language: URL 경로에서 추출 (/ko/, /en/, etc)
  const langMatch = url.match(/\/[a-z]{2}\/([a-z]{2})\//i);
  if (langMatch) {
    predictions['site_language'] = {
      value: langMatch[1].toUpperCase(),
      source: `URL 경로 (/kr/${langMatch[1]}/)`
    };
  } else {
    // HTML lang 속성 확인
    const htmlLang = await page.evaluate(() => document.documentElement.lang);
    if (htmlLang) {
      predictions['site_language'] = {
        value: htmlLang.split('-')[0].toUpperCase(),
        source: 'HTML lang 속성'
      };
    } else {
      predictions['site_language'] = { value: null, source: '언어 정보 없음' };
    }
  }

  // 4. site_env: URL에서 판단 (dev, stg, prd)
  if (urlObj.hostname.includes('dev.') || urlObj.hostname.includes('-dev')) {
    predictions['site_env'] = { value: 'DEV', source: 'URL 호스트명 (dev)' };
  } else if (urlObj.hostname.includes('stg.') || urlObj.hostname.includes('-stg')) {
    predictions['site_env'] = { value: 'STG', source: 'URL 호스트명 (stg)' };
  } else {
    predictions['site_env'] = { value: 'PRD', source: 'URL 호스트명 (프로덕션)' };
  }

  // 5. content_group (page_type): URL 경로 패턴 매칭
  const pathname = urlObj.pathname;

  if (siteConfig?.pageTypePatterns) {
    // 사이트별 패턴 매칭
    let matched = false;
    for (const [pageType, patterns] of Object.entries(siteConfig.pageTypePatterns)) {
      for (const pattern of patterns) {
        if (pathname.includes(pattern)) {
          predictions['content_group'] = {
            value: pageType,
            source: `사이트 패턴 매칭 (${pattern})`
          };
          matched = true;
          break;
        }
      }
      if (matched) break;
    }

    if (!matched) {
      predictions['content_group'] = { value: 'OTHER', source: 'URL 패턴 불명확' };
    }
  } else {
    // 기본 패턴 매칭
    const pathSegments = pathname.split('/').filter(s => s);
    if (pathSegments.includes('main') || (pathSegments.includes('display') && pathSegments.includes('main'))) {
      predictions['content_group'] = { value: 'MAIN', source: 'URL 경로 (/display/main)' };
    } else if (pathSegments.includes('product') || pathSegments.includes('prd')) {
      predictions['content_group'] = { value: 'PRODUCT_DETAIL', source: 'URL 경로 (product)' };
    } else if (pathSegments.includes('category') || pathSegments.includes('ctg')) {
      predictions['content_group'] = { value: 'PRODUCT_LIST', source: 'URL 경로 (category)' };
    } else if (pathSegments.includes('cart')) {
      predictions['content_group'] = { value: 'CART', source: 'URL 경로 (cart)' };
    } else if (pathSegments.includes('order')) {
      predictions['content_group'] = { value: 'ORDER', source: 'URL 경로 (order)' };
    } else if (pathSegments.includes('search')) {
      predictions['content_group'] = { value: 'SEARCH', source: 'URL 경로 (search)' };
    } else if (pathSegments.includes('my')) {
      predictions['content_group'] = { value: 'MY', source: 'URL 경로 (my)' };
    } else {
      predictions['content_group'] = { value: 'OTHER', source: 'URL 경로 패턴 불명확' };
    }
  }

  // 6. breadcrumb: 화면에서 breadcrumb 요소 확인
  const breadcrumb = await page.evaluate(() => {
    // 일반적인 breadcrumb 셀렉터들
    const selectors = [
      '.breadcrumb', '.breadcrumbs', '[class*="bread"]',
      'nav[aria-label="breadcrumb"]', '.gnb-path', '.location'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        return el.textContent?.trim().replace(/\s+/g, ' ') || null;
      }
    }
    return null;
  });

  if (breadcrumb) {
    predictions['breadcrumb'] = { value: breadcrumb, source: 'DOM breadcrumb 요소' };
  } else {
    // 메인 페이지는 breadcrumb이 없을 수 있음 - GA4에서도 수집 안함
    const pageType = predictions['content_group']?.value;
    if (pageType === 'MAIN') {
      predictions['breadcrumb'] = { value: null, source: '메인 페이지 (breadcrumb 미수집 예상)' };
    } else {
      predictions['breadcrumb'] = { value: null, source: 'breadcrumb 요소 없음' };
    }
  }

  // 7. login_is_login: 로그인 상태 확인
  const isLoggedIn = await page.evaluate(() => {
    // 일반적인 로그인 상태 판단 방법
    const loginIndicators = [
      document.querySelector('.logout-btn'),
      document.querySelector('[class*="logout"]'),
      document.querySelector('.my-info'),
      document.querySelector('[class*="user-name"]'),
    ];

    const logoutIndicators = [
      document.querySelector('.login-btn'),
      document.querySelector('[class*="login"]:not([class*="logout"])'),
    ];

    // 로그인 버튼이 있으면 비로그인
    if (logoutIndicators.some(el => el)) {
      return 'N';
    }
    // 로그아웃 버튼이나 사용자 정보가 있으면 로그인
    if (loginIndicators.some(el => el)) {
      return 'Y';
    }
    return null;
  });

  if (isLoggedIn) {
    predictions['login_is_login'] = { value: isLoggedIn, source: 'DOM 로그인 UI 분석' };
  } else {
    // 비로그인 상태로 가정 (새 브라우저)
    predictions['login_is_login'] = { value: 'N', source: '새 브라우저 세션 (비로그인 가정)' };
  }

  // 8. channel: viewport 크기로 판단 (사이트별 설정 활용)
  const viewport = await page.viewportSize();
  if (viewport) {
    const channelConfig = siteConfig?.channelDetection || {
      mobileMaxWidth: 767,
      tabletMaxWidth: 1023,
      mobileValue: 'MOBILE',
      tabletValue: 'TABLET',
      pcValue: 'PC'
    };

    if (viewport.width <= channelConfig.mobileMaxWidth) {
      predictions['channel'] = {
        value: channelConfig.mobileValue,
        source: `viewport 너비 (${viewport.width}px <= ${channelConfig.mobileMaxWidth})`
      };
    } else if (viewport.width <= channelConfig.tabletMaxWidth) {
      predictions['channel'] = {
        value: channelConfig.tabletValue,
        source: `viewport 너비 (${viewport.width}px)`
      };
    } else {
      predictions['channel'] = {
        value: channelConfig.pcValue,
        source: `viewport 너비 (${viewport.width}px > ${channelConfig.tabletMaxWidth})`
      };
    }
  } else {
    predictions['channel'] = { value: null, source: 'viewport 정보 없음' };
  }

  return predictions;
}

/**
 * GA4 요청에서 page_view 파라미터 추출
 */
function extractGA4PageViewParams(ga4Requests: Array<{ url: string; postData?: string }>): Record<string, string | null> {
  const params: Record<string, string | null> = {};

  for (const req of ga4Requests) {
    try {
      const urlObj = new URL(req.url);
      const eventName = urlObj.searchParams.get('en');

      if (eventName === 'page_view') {
        // URL 파라미터에서 ep.* (event parameter) 추출
        for (const [key, value] of urlObj.searchParams.entries()) {
          if (key.startsWith('ep.')) {
            const paramName = key.replace('ep.', '');
            params[paramName] = decodeURIComponent(value);
          }
        }
        break; // 첫 번째 page_view만 분석
      }
    } catch (e) {
      // URL 파싱 오류 무시
    }
  }

  return params;
}

/**
 * 결과 비교 및 분석
 */
function analyzeResults(
  globalVars: Record<string, string | null>,
  ga4Params: Record<string, string | null>,
  predictions: Record<string, { value: string | null; source: string }>
): PredictionResult[] {
  const results: PredictionResult[] = [];

  for (const [paramKey, paramInfo] of Object.entries(PAGE_VIEW_PARAMS)) {
    const globalVarValue = globalVars[paramInfo.devGuideVar] || null;
    const ga4CollectedValue = ga4Params[paramKey] || null;
    const prediction = predictions[paramKey];

    let match: PredictionResult['match'] = 'UNKNOWN';

    if (!ga4CollectedValue) {
      match = 'NOT_COLLECTED';
    } else if (prediction?.value === null) {
      match = 'UNKNOWN';
    } else if (prediction.value.toUpperCase() === ga4CollectedValue.toUpperCase()) {
      match = 'EXACT';
    } else if (ga4CollectedValue.toUpperCase().includes(prediction.value.toUpperCase()) ||
               prediction.value.toUpperCase().includes(ga4CollectedValue.toUpperCase())) {
      match = 'PARTIAL';
    } else {
      match = 'MISMATCH';
    }

    results.push({
      paramKey,
      devGuideVar: paramInfo.devGuideVar,
      description: paramInfo.description,
      globalVarValue,
      ga4CollectedValue,
      screenPrediction: prediction?.value || null,
      predictionSource: prediction?.source || 'N/A',
      match,
    });
  }

  return results;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║     page_view 파라미터 예측 vs 실제 수집 비교 테스트 (v2.0)               ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  // 사이트 설정 로드
  const urlObj = new URL(TARGET_URL);
  const siteConfig = loadSiteConfig(urlObj.hostname);

  if (siteConfig) {
    console.log(`🔧 사이트 설정 로드됨: ${siteConfig.domain}`);
  } else {
    console.log('⚠️ 사이트별 설정 없음 - 기본 예측 사용');
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'ko-KR',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  // GA4 요청 캡처
  const ga4Requests: { url: string; postData?: string }[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('google-analytics.com/g/collect') ||
        url.includes('analytics.google.com/g/collect')) {
      ga4Requests.push({
        url: url,
        postData: request.postData() || undefined,
      });
    }
  });

  console.log(`\n📍 대상 URL: ${TARGET_URL}\n`);
  console.log('⏳ 페이지 로드 중...\n');

  await page.goto(TARGET_URL, {
    waitUntil: 'networkidle',
    timeout: 60000
  });

  // 추가 요청 대기
  await page.waitForTimeout(3000);

  // 1. 전역변수 추출
  console.log('━'.repeat(80));
  console.log('【 1. 전역변수 (AP_DATA_*) 값 추출 】');
  console.log('━'.repeat(80));

  const globalVars = await extractGlobalVariables(page);
  for (const [key, value] of Object.entries(globalVars)) {
    console.log(`  ${key}: ${value === null ? '(없음)' : `"${value}"`}`);
  }

  // 2. 화면에서 예측
  console.log('\n' + '━'.repeat(80));
  console.log('【 2. 화면 분석 기반 예측 (사이트 매핑 활용) 】');
  console.log('━'.repeat(80));

  const predictions = await predictFromScreen(page, siteConfig);
  for (const [key, pred] of Object.entries(predictions)) {
    console.log(`  ${key}: "${pred.value}" ← ${pred.source}`);
  }

  // 3. GA4 실제 수집 값
  console.log('\n' + '━'.repeat(80));
  console.log('【 3. GA4 실제 수집 값 (page_view 이벤트) 】');
  console.log('━'.repeat(80));

  const ga4Params = extractGA4PageViewParams(ga4Requests);
  if (Object.keys(ga4Params).length === 0) {
    console.log('  ⚠️ page_view 이벤트가 감지되지 않았습니다.');
    console.log(`  총 ${ga4Requests.length}개의 GA4 요청 중 page_view 없음`);

    // 다른 이벤트 목록
    console.log('\n  감지된 이벤트:');
    for (const req of ga4Requests) {
      try {
        const eventUrl = new URL(req.url);
        const en = eventUrl.searchParams.get('en');
        console.log(`    - ${en || '(이벤트명 없음)'}`);
      } catch {}
    }
  } else {
    for (const [key, value] of Object.entries(ga4Params)) {
      console.log(`  ${key}: "${value}"`);
    }
  }

  // 4. 결과 분석
  console.log('\n' + '═'.repeat(80));
  console.log('【 4. 예측 vs 실제 비교 분석 】');
  console.log('═'.repeat(80));

  const results = analyzeResults(globalVars, ga4Params, predictions);

  // 결과 테이블 출력
  console.log('\n┌─────────────────┬──────────────────┬──────────────────┬──────────────────┬───────────┐');
  console.log('│ GA4 파라미터    │ 전역변수 값      │ 화면 예측        │ GA4 수집 값      │ 일치      │');
  console.log('├─────────────────┼──────────────────┼──────────────────┼──────────────────┼───────────┤');

  for (const r of results) {
    const paramKey = r.paramKey.padEnd(15);
    const globalVal = (r.globalVarValue || '-').substring(0, 16).padEnd(16);
    const prediction = (r.screenPrediction || '-').substring(0, 16).padEnd(16);
    const ga4Val = (r.ga4CollectedValue || '-').substring(0, 16).padEnd(16);
    const matchIcon = {
      'EXACT': '✅ 정확',
      'PARTIAL': '🟡 부분',
      'MISMATCH': '❌ 불일치',
      'NOT_COLLECTED': '⚪ 미수집',
      'UNKNOWN': '❓ 알수없음'
    }[r.match];

    console.log(`│ ${paramKey} │ ${globalVal} │ ${prediction} │ ${ga4Val} │ ${matchIcon.padEnd(9)} │`);
  }

  console.log('└─────────────────┴──────────────────┴──────────────────┴──────────────────┴───────────┘');

  // 5. 정확도 요약
  console.log('\n' + '═'.repeat(80));
  console.log('【 5. 예측 정확도 요약 】');
  console.log('═'.repeat(80));

  const exact = results.filter(r => r.match === 'EXACT').length;
  const partial = results.filter(r => r.match === 'PARTIAL').length;
  const mismatch = results.filter(r => r.match === 'MISMATCH').length;
  const notCollected = results.filter(r => r.match === 'NOT_COLLECTED').length;
  const collectedCount = results.length - notCollected;

  console.log(`\n📊 예측 정확도: ${exact}/${collectedCount} (${((exact / collectedCount) * 100).toFixed(1)}%)`);
  console.log(`   ✅ 정확 일치: ${exact}개`);
  console.log(`   🟡 부분 일치: ${partial}개`);
  console.log(`   ❌ 불일치: ${mismatch}개`);
  console.log(`   ⚪ 미수집: ${notCollected}개`);

  // 불일치 항목 상세 분석
  const mismatches = results.filter(r => r.match === 'MISMATCH' || r.match === 'PARTIAL');
  if (mismatches.length > 0) {
    console.log('\n🔍 불일치/부분일치 항목 상세:');
    for (const r of mismatches) {
      console.log(`\n  ▸ ${r.paramKey} (${r.description})`);
      console.log(`    전역변수(${r.devGuideVar}): "${r.globalVarValue}"`);
      console.log(`    화면 예측: "${r.screenPrediction}" ← ${r.predictionSource}`);
      console.log(`    GA4 수집: "${r.ga4CollectedValue}"`);
      console.log(`    💡 개선 방향: ${getSuggestion(r)}`);
    }
  } else {
    console.log('\n🎉 모든 예측이 정확합니다!');
  }

  // 6. 예측 근거 상세
  console.log('\n' + '═'.repeat(80));
  console.log('【 6. 예측 근거 상세 】');
  console.log('═'.repeat(80));

  for (const r of results) {
    if (r.match !== 'NOT_COLLECTED') {
      const icon = r.match === 'EXACT' ? '✅' : r.match === 'PARTIAL' ? '🟡' : '❌';
      console.log(`\n  ${icon} ${r.paramKey}: "${r.screenPrediction}"`);
      console.log(`     └─ ${r.predictionSource}`);
    }
  }

  await browser.close();
  console.log('\n✅ 테스트 완료\n');

  // 최종 결과 반환 (프로그래매틱 사용 시)
  return {
    accuracy: (exact / collectedCount) * 100,
    results,
    summary: { exact, partial, mismatch, notCollected }
  };
}

function getSuggestion(result: PredictionResult): string {
  switch (result.paramKey) {
    case 'site_name':
      return 'site-parameter-mappings.json에 사이트별 매핑 추가 필요';
    case 'content_group':
      return 'pageTypePatterns 설정 확인 또는 URL 패턴 추가';
    case 'channel':
      return 'channelDetection 설정 확인';
    case 'breadcrumb':
      return 'breadcrumb 셀렉터 패턴 추가 필요';
    default:
      return '예측 로직 검토 필요';
  }
}

main().catch(console.error);
