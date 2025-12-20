/**
 * page_view 이벤트 전체 파라미터 테스트
 *
 * GTM Event Settings에서 정의된 모든 파라미터를 실제 페이지에서 확인합니다.
 */

import { chromium } from 'playwright';
import { createDefaultGTMConfigLoader, GTMConfigLoader } from './config/gtmConfigLoader';

const TEST_URL = process.argv[2] || 'https://www.amoremall.com/kr/ko/';

async function main() {
  console.log('═'.repeat(80));
  console.log(' page_view 전체 파라미터 테스트');
  console.log('═'.repeat(80));
  console.log(`\n🌐 URL: ${TEST_URL}\n`);

  // 1. GTM 설정 로더 초기화
  console.log('📦 GTM 설정 로더 초기화 중...');
  const loader = createDefaultGTMConfigLoader();
  await loader.preload();
  const config = loader.getConfig();

  // GTM Event Settings에서 파라미터 목록 추출
  const eventParams = config.gtmVariableChains.eventSettings.filter(p => p.scope === 'event');
  const userProps = config.gtmVariableChains.eventSettings.filter(p => p.scope === 'user');

  console.log(`\n📊 GTM Event Settings 파라미터:`);
  console.log(`   - Event Parameters: ${eventParams.length}개`);
  console.log(`   - User Properties: ${userProps.length}개`);

  // 2. 브라우저 실행
  console.log('\n🌐 브라우저 시작 중...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // 3. 페이지 방문
    console.log('📄 페이지 로딩 중...');
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    console.log('✅ 페이지 로드 완료!\n');

    // 4. 모든 전역변수 추출
    console.log('─'.repeat(80));
    console.log('🌐 전역변수 값 추출');
    console.log('─'.repeat(80));

    const allGlobalVars = await page.evaluate(() => {
      const vars: Record<string, any> = {};

      // AP_ 로 시작하는 모든 전역변수
      for (const key of Object.keys(window)) {
        if (key.startsWith('AP_')) {
          try {
            vars[key] = (window as any)[key];
          } catch (e) {
            vars[key] = '[Error]';
          }
        }
      }

      return vars;
    });

    // 카테고리별로 그룹화
    const categories: Record<string, string[]> = {
      'AP_DATA_*': [],
      'AP_PRD_*': [],
      'AP_SEARCH_*': [],
      'AP_EVENT_*': [],
      'AP_CART_*': [],
      'AP_PURCHASE_*': [],
      'AP_REVIEW_*': [],
      '기타': [],
    };

    for (const key of Object.keys(allGlobalVars).sort()) {
      if (key.startsWith('AP_DATA_')) categories['AP_DATA_*'].push(key);
      else if (key.startsWith('AP_PRD_')) categories['AP_PRD_*'].push(key);
      else if (key.startsWith('AP_SEARCH_')) categories['AP_SEARCH_*'].push(key);
      else if (key.startsWith('AP_EVENT_')) categories['AP_EVENT_*'].push(key);
      else if (key.startsWith('AP_CART_')) categories['AP_CART_*'].push(key);
      else if (key.startsWith('AP_PURCHASE_')) categories['AP_PURCHASE_*'].push(key);
      else if (key.startsWith('AP_REVIEW_')) categories['AP_REVIEW_*'].push(key);
      else categories['기타'].push(key);
    }

    for (const [category, keys] of Object.entries(categories)) {
      if (keys.length === 0) continue;

      console.log(`\n### ${category} (${keys.length}개)`);
      for (const key of keys) {
        const value = allGlobalVars[key];
        const displayValue = value === undefined ? '(undefined)'
          : value === null ? '(null)'
          : value === '' ? '(empty)'
          : typeof value === 'object' ? JSON.stringify(value).slice(0, 50) + '...'
          : String(value).slice(0, 50);
        console.log(`   ${key.padEnd(30)}: ${displayValue}`);
      }
    }

    // 5. GTM 파라미터 → 전역변수 매핑 확인
    console.log('\n');
    console.log('─'.repeat(80));
    console.log('📊 Event Parameters → 전역변수 매핑');
    console.log('─'.repeat(80));

    // 파라미터를 조건별로 분류
    const commonParams: string[] = [];
    const productParams: string[] = [];
    const loginParams: string[] = [];
    const pageParams: string[] = [];
    const conditionalParams: string[] = [];

    for (const param of eventParams) {
      const name = param.ga4Param;
      if (name.startsWith('product_')) productParams.push(name);
      else if (name.startsWith('login_')) loginParams.push(name);
      else if (name.startsWith('page_')) pageParams.push(name);
      else if (name.startsWith('brandshop_') || name.startsWith('search_') || name.startsWith('view_event_')) {
        conditionalParams.push(name);
      }
      else commonParams.push(name);
    }

    // 공통 파라미터 출력
    console.log('\n### 공통 파라미터 (모든 페이지)');
    console.log('| GA4 파라미터 | GTM 소스 | 전역변수 | 실제 값 |');
    console.log('|-------------|----------|---------|---------|');

    for (const paramName of commonParams) {
      const gtmInfo = loader.getParameterGTMInfo(paramName);
      const sources = loader.getDataSources(paramName);

      let actualValue = '-';
      for (const source of sources) {
        if (source.type === 'global_variable') {
          const varName = source.name.split('.')[0];
          if (allGlobalVars[varName] !== undefined) {
            actualValue = String(allGlobalVars[varName]).slice(0, 20);
            break;
          }
        }
      }

      const gtmVar = gtmInfo?.gtmVariable || '-';
      const globalVar = sources.find(s => s.type === 'global_variable')?.name || '-';

      console.log(`| ${paramName.padEnd(20)} | ${gtmVar.slice(0, 25).padEnd(25)} | ${globalVar.slice(0, 20).padEnd(20)} | ${actualValue.padEnd(15)} |`);
    }

    // 로그인 관련 파라미터
    console.log('\n### 로그인 관련 파라미터');
    console.log('| GA4 파라미터 | GTM 소스 | 전역변수 | 실제 값 |');
    console.log('|-------------|----------|---------|---------|');

    for (const paramName of loginParams) {
      const gtmInfo = loader.getParameterGTMInfo(paramName);
      const sources = loader.getDataSources(paramName);

      let actualValue = '-';
      for (const source of sources) {
        if (source.type === 'global_variable') {
          const varName = source.name.split('.')[0];
          if (allGlobalVars[varName] !== undefined) {
            actualValue = String(allGlobalVars[varName]).slice(0, 20);
            break;
          }
        }
      }

      const gtmVar = gtmInfo?.gtmVariable || '-';
      const globalVar = sources.find(s => s.type === 'global_variable')?.name || '-';

      console.log(`| ${paramName.padEnd(20)} | ${gtmVar.slice(0, 25).padEnd(25)} | ${globalVar.slice(0, 20).padEnd(20)} | ${actualValue.padEnd(15)} |`);
    }

    // 페이지 관련 파라미터
    console.log('\n### 페이지 관련 파라미터');
    console.log('| GA4 파라미터 | GTM 소스 | 데이터 소스 |');
    console.log('|-------------|----------|------------|');

    for (const paramName of pageParams) {
      const gtmInfo = loader.getParameterGTMInfo(paramName);
      const sources = loader.getDataSources(paramName);

      const gtmVar = gtmInfo?.gtmVariable || '-';
      const sourceDesc = sources.map(s => `${s.type}:${s.name}`).join(', ').slice(0, 30) || '-';

      console.log(`| ${paramName.padEnd(20)} | ${gtmVar.slice(0, 25).padEnd(25)} | ${sourceDesc.padEnd(30)} |`);
    }

    // 조건부 파라미터
    console.log('\n### 조건부 파라미터 (특정 페이지에서만)');
    console.log('| GA4 파라미터 | 조건 (페이지 타입) | 전역변수 |');
    console.log('|-------------|------------------|---------|');

    const paramConditions: Record<string, string> = {
      'product_id': 'PRODUCT_DETAIL',
      'product_name': 'PRODUCT_DETAIL',
      'product_category': 'PRODUCT_DETAIL',
      'product_brandname': 'PRODUCT_DETAIL',
      'product_brandcode': 'PRODUCT_DETAIL',
      'product_is_stock': 'PRODUCT_DETAIL',
      'view_event_code': 'EVENT_DETAIL',
      'view_event_name': 'EVENT_DETAIL',
      'brandshop_code': 'BRAND_MAIN',
      'brandshop_name': 'BRAND_MAIN',
      'search_brand_code': 'SEARCH_RESULT',
      'search_brand': 'SEARCH_RESULT',
      'page_store_code': 'STORE_*',
      'page_store_name': 'STORE_*',
    };

    for (const paramName of [...productParams, ...conditionalParams]) {
      const sources = loader.getDataSources(paramName);
      const condition = paramConditions[paramName] || '(조건 미정)';
      const globalVar = sources.find(s => s.type === 'global_variable')?.name || '-';

      console.log(`| ${paramName.padEnd(20)} | ${condition.padEnd(18)} | ${globalVar.padEnd(25)} |`);
    }

    // 6. User Properties
    console.log('\n');
    console.log('─'.repeat(80));
    console.log('👤 User Properties');
    console.log('─'.repeat(80));
    console.log('\n| GA4 User Property | GTM 소스 | 전역변수 | 실제 값 |');
    console.log('|-------------------|----------|---------|---------|');

    for (const prop of userProps) {
      const gtmInfo = loader.getParameterGTMInfo(prop.ga4Param);
      const sources = loader.getDataSources(prop.ga4Param);

      let actualValue = '-';
      for (const source of sources) {
        if (source.type === 'global_variable') {
          const varName = source.name.split('.')[0];
          if (allGlobalVars[varName] !== undefined) {
            actualValue = String(allGlobalVars[varName]).slice(0, 15);
            break;
          }
        }
      }

      const gtmVar = gtmInfo?.gtmVariable?.slice(0, 25) || '-';
      const globalVar = sources.find(s => s.type === 'global_variable')?.name?.slice(0, 20) || '-';

      console.log(`| ${prop.ga4Param.padEnd(20)} | ${gtmVar.padEnd(25)} | ${globalVar.padEnd(20)} | ${actualValue.padEnd(15)} |`);
    }

    // 7. 현재 페이지 타입 확인
    const pageType = allGlobalVars['AP_DATA_PAGETYPE'] || '(unknown)';
    console.log('\n');
    console.log('─'.repeat(80));
    console.log(`📍 현재 페이지 타입: ${pageType}`);
    console.log('─'.repeat(80));

    // 해당 페이지에서 수집되어야 하는 파라미터 목록
    const expectedParams = new Set<string>();

    // 공통 파라미터는 항상 수집
    commonParams.forEach(p => expectedParams.add(p));
    loginParams.forEach(p => expectedParams.add(p));
    pageParams.forEach(p => expectedParams.add(p));

    // 페이지 타입별 조건부 파라미터
    if (pageType === 'PRODUCT_DETAIL') {
      productParams.forEach(p => expectedParams.add(p));
    }
    if (pageType === 'EVENT_DETAIL') {
      expectedParams.add('view_event_code');
      expectedParams.add('view_event_name');
    }
    if (pageType === 'BRAND_MAIN') {
      expectedParams.add('brandshop_code');
      expectedParams.add('brandshop_name');
    }
    if (pageType === 'SEARCH_RESULT') {
      expectedParams.add('search_brand_code');
      expectedParams.add('search_brand');
    }

    console.log(`\n예상 수집 파라미터 수: ${expectedParams.size}개`);
    console.log(`User Properties: ${userProps.length}개`);
    console.log(`총: ${expectedParams.size + userProps.length}개\n`);

    // 8. 요약
    console.log('═'.repeat(80));
    console.log(' 요약');
    console.log('═'.repeat(80));
    console.log(`
페이지: ${TEST_URL}
페이지 타입: ${pageType}

GTM Event Settings 정의:
  - Event Parameters: ${eventParams.length}개
  - User Properties: ${userProps.length}개

현재 페이지에서 수집 예상:
  - Event Parameters: ${expectedParams.size}개
  - User Properties: ${userProps.length}개 (로그인 시)

전역변수 설정 현황:
  - AP_DATA_* : ${categories['AP_DATA_*'].length}개
  - AP_PRD_*  : ${categories['AP_PRD_*'].length}개 ${pageType !== 'PRODUCT_DETAIL' ? '(PRODUCT_DETAIL에서만 사용)' : ''}
  - AP_SEARCH_*: ${categories['AP_SEARCH_*'].length}개 ${pageType !== 'SEARCH_RESULT' ? '(SEARCH_RESULT에서만 사용)' : ''}
`);

  } catch (error) {
    console.error('❌ 오류 발생:', error);
  } finally {
    await browser.close();
    console.log('🔚 브라우저 종료');
  }
}

main().catch(console.error);
