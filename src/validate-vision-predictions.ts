/**
 * Vision AI 예측 검증 스크립트
 *
 * GA4 Account의 모든 Property를 대상으로:
 * 1. 각 content_group별 대표 페이지 (page_view 최다) 조회
 * 2. 페이지 방문 → 스크린샷 캡처
 * 3. Vision AI로 페이지 타입/변수 예측
 * 4. 실제 AP_DATA_* 변수 수집
 * 5. 예측값 vs 실제값 비교
 */

import { chromium, Browser, Page } from 'playwright';
import { GA4Client } from './ga4/ga4Client';
import { GA4AdminClient } from './ga4/ga4AdminClient';
import { GeminiVisionAnalyzer, PageVariablePrediction } from './analyzers/visionAnalyzer';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

// Account ID
const ACCOUNT_ID = '293457213';

// Property ID → 도메인 매핑
const PROPERTY_DOMAIN_MAP: Record<string, string> = {
  '416629733': 'www.amoremall.com',
  '416571110': 'www.laboh.co.kr',
  '416602402': 'www.osulloc.com',
  '416705262': 'www.ayunchepro.com',
  '416696665': 'www.espoir.com',
  '416714189': 'www.illiyoon.com',
  '416612114': 'www.aritaum.com',
  '416706974': 'www.brdy.co.kr',
  '416680783': 'www.aestura.com',
  '416711867': 'www.innisfree.com',
  '416624566': 'www.aditshop.com',
  '416672048': 'www.ayunche.com',
  '462679065': 'www.amospro.com',
  '479578062': 'www.makeonshop.co.kr',
};

// content_group 추론 패턴
const CONTENT_GROUP_PATTERNS: Array<{ pattern: RegExp; group: string }> = [
  { pattern: /\/(display\/)?main/i, group: 'MAIN' },
  { pattern: /^\/$/i, group: 'MAIN' },
  { pattern: /\/product\/[^/]+/i, group: 'PRODUCT_DETAIL' },
  { pattern: /\/(goods|item)\/\d+/i, group: 'PRODUCT_DETAIL' },
  { pattern: /\/display\/category/i, group: 'PRODUCT_LIST' },
  { pattern: /\/category\//i, group: 'PRODUCT_LIST' },
  { pattern: /\/shop\/category/i, group: 'PRODUCT_LIST' },
  { pattern: /\/search/i, group: 'SEARCH_RESULT' },
  { pattern: /\/brand\/[^/]+/i, group: 'BRAND_MAIN' },
  { pattern: /\/cart/i, group: 'CART' },
  { pattern: /\/order\/complete/i, group: 'ORDER_COMPLETE' },
  { pattern: /\/order/i, group: 'ORDER' },
  { pattern: /\/mypage/i, group: 'MY' },
  { pattern: /\/my\//i, group: 'MY' },
  { pattern: /\/event\/[^/]+/i, group: 'EVENT_DETAIL' },
  { pattern: /\/event\/?$/i, group: 'EVENT_LIST' },
  { pattern: /\/live\/[^/]+/i, group: 'LIVE_DETAIL' },
];

function inferContentGroup(pagePath: string): string {
  for (const { pattern, group } of CONTENT_GROUP_PATTERNS) {
    if (pattern.test(pagePath)) {
      return group;
    }
  }
  return 'OTHERS';
}

/**
 * 토큰 로드
 */
function loadAccessToken(): string | null {
  const tokenPath = './credentials/ga4_tokens.json';
  try {
    if (fs.existsSync(tokenPath)) {
      const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
      return tokens.access_token;
    }
  } catch (error) {
    console.error('토큰 로드 실패:', error);
  }
  return null;
}

/**
 * Property별 content_group 대표 페이지 조회
 */
async function getTopPagesByContentGroup(
  ga4Client: any,
  propertyId: string,
  domain: string
): Promise<Map<string, { pagePath: string; pageViews: number; fullUrl: string }>> {
  const groupMap = new Map<string, { pagePath: string; pageViews: number; fullUrl: string }>();

  try {
    const [response] = await ga4Client.client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 500,
    });

    if (!response.rows) return groupMap;

    for (const row of response.rows) {
      const pagePath = row.dimensionValues?.[0]?.value || '';
      const pageViews = parseInt(row.metricValues?.[0]?.value || '0', 10);

      if (!pagePath || pagePath === '(not set)') continue;

      const contentGroup = inferContentGroup(pagePath);
      const existing = groupMap.get(contentGroup);

      if (!existing || pageViews > existing.pageViews) {
        groupMap.set(contentGroup, {
          pagePath,
          pageViews,
          fullUrl: `https://${domain}${pagePath}`,
        });
      }
    }
  } catch (error: any) {
    console.error(`   GA4 조회 실패: ${error.message}`);
  }

  return groupMap;
}

/**
 * 페이지 방문 및 변수 수집
 */
async function visitAndCollect(
  page: Page,
  url: string,
  screenshotDir: string,
  siteName: string,
  contentGroup: string
): Promise<{
  screenshotPath: string;
  actualVariables: Record<string, string>;
  htmlLang: string | null;
  errors: string[];
}> {
  const errors: string[] = [];
  const actualVariables: Record<string, string> = {};
  let htmlLang: string | null = null;

  const screenshotPath = path.join(
    screenshotDir,
    `${siteName}_${contentGroup}.png`
  );

  try {
    // dataLayer 캡처 스크립트 주입
    await page.addInitScript(() => {
      (window as any).__capturedEvents = [];
      (window as any).dataLayer = (window as any).dataLayer || [];
      const originalPush = (window as any).dataLayer.push;
      (window as any).dataLayer.push = function (...args: any[]) {
        for (const arg of args) {
          (window as any).__capturedEvents.push(arg);
        }
        return originalPush ? originalPush.apply(this, args) : args.length;
      };
    });

    await page.goto(url, { timeout: 60000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    // AP_DATA 변수 대기
    try {
      await page.waitForFunction(
        () => (window as any).AP_DATA_SITENAME || (window as any).AP_DATA_PAGETYPE,
        { timeout: 15000 }
      );
    } catch {
      errors.push('AP_DATA 변수 대기 타임아웃');
    }

    await page.waitForTimeout(2000);

    // 스크린샷 캡처
    await page.screenshot({ path: screenshotPath, fullPage: false });

    // html lang 속성
    htmlLang = await page.evaluate(() => {
      return document.documentElement.getAttribute('lang') || null;
    });

    // 전역 변수 수집
    const windowVars = await page.evaluate(() => {
      const vars: Record<string, string> = {};
      const varNames = [
        'AP_DATA_SITENAME', 'AP_DATA_COUNTRY', 'AP_DATA_LANG', 'AP_DATA_ENV',
        'AP_DATA_CHANNEL', 'AP_DATA_PAGETYPE', 'AP_DATA_ISLOGIN', 'AP_DATA_BREAD',
        'AP_DATA_GCID', 'AP_DATA_CID', 'AP_DATA_ISSSO', 'AP_DATA_CG', 'AP_DATA_CD',
        'AP_DATA_AGE', 'AP_DATA_CT', 'AP_DATA_BEAUTYCT', 'AP_DATA_ISEMPLOYEE',
        'AP_DATA_ISMEMBER', 'AP_DATA_LOGINTYPE', 'AP_DATA_ISSUBSCRIPTION',
        'AP_PRD_CODE', 'AP_PRD_NAME', 'AP_PRD_BRAND', 'AP_PRD_CATEGORY',
        'AP_PROMO_ID', 'AP_PROMO_NAME', 'AP_BRAND_CODE', 'AP_BRAND_NAME',
        'AP_SEARCH_TERM', 'AP_SEARCH_RESULT', 'AP_SEARCH_NUM',
      ];

      for (const name of varNames) {
        const value = (window as any)[name];
        if (value !== undefined && value !== null && value !== '') {
          vars[name] = String(value);
        }
      }
      return vars;
    });

    Object.assign(actualVariables, windowVars);

  } catch (error: any) {
    errors.push(`페이지 로딩 오류: ${error.message}`);
  }

  return { screenshotPath, actualVariables, htmlLang, errors };
}

/**
 * 예측값과 실제값 비교
 */
function comparePredictionWithActual(
  prediction: PageVariablePrediction,
  actual: Record<string, string>,
  htmlLang: string | null
): Array<{
  variable: string;
  predicted: string | null;
  actual: string | null;
  match: boolean;
  source: string;
}> {
  const comparisons: Array<{
    variable: string;
    predicted: string | null;
    actual: string | null;
    match: boolean;
    source: string;
  }> = [];

  // 기본 변수 비교
  const variableMapping: Array<{ key: keyof PageVariablePrediction['variables']; apKey: string; source: string }> = [
    { key: 'site_name', apKey: 'AP_DATA_SITENAME', source: 'domain' },
    { key: 'site_country', apKey: 'AP_DATA_COUNTRY', source: 'url_path' },
    { key: 'site_language', apKey: 'AP_DATA_LANG', source: 'url_path/html_lang' },
    { key: 'channel', apKey: 'AP_DATA_CHANNEL', source: 'visual' },
    { key: 'content_group', apKey: 'AP_DATA_PAGETYPE', source: 'visual' },
    { key: 'login_is_login', apKey: 'AP_DATA_ISLOGIN', source: 'visual' },
  ];

  for (const { key, apKey, source } of variableMapping) {
    let predicted = prediction.variables[key] as string;
    let actualValue = actual[apKey] || null;

    // site_language 특수 처리 (ko-KR vs ko)
    if (key === 'site_language' && predicted && actualValue) {
      // ko-KR → ko로 정규화해서 비교
      const normalizedPredicted = predicted.split('-')[0].toLowerCase();
      const normalizedActual = actualValue.split('-')[0].toLowerCase();
      comparisons.push({
        variable: key,
        predicted,
        actual: actualValue,
        match: normalizedPredicted === normalizedActual,
        source,
      });
      continue;
    }

    // 일반 비교
    comparisons.push({
      variable: key,
      predicted: predicted || null,
      actual: actualValue,
      match: predicted === actualValue ||
             (predicted?.toUpperCase() === actualValue?.toUpperCase()),
      source,
    });
  }

  return comparisons;
}

/**
 * 메인 검증 실행
 */
async function main() {
  console.log('═'.repeat(80));
  console.log(' Vision AI 예측 검증 - 전체 Property 대상');
  console.log('═'.repeat(80));

  // 토큰 확인
  const accessToken = loadAccessToken();
  if (!accessToken) {
    console.error('❌ GA4 Access Token이 없습니다. ga4 login을 먼저 실행하세요.');
    process.exit(1);
  }

  // Gemini API 키 확인
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error('❌ GEMINI_API_KEY가 설정되지 않았습니다.');
    process.exit(1);
  }

  // 출력 디렉토리
  const outputDir = path.join(process.cwd(), 'output', 'vision-validation');
  const screenshotDir = path.join(outputDir, 'screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  // 클라이언트 초기화
  const adminClient = new GA4AdminClient(accessToken);
  await adminClient.initialize();
  const visionAnalyzer = new GeminiVisionAnalyzer(geminiApiKey);

  // Property 목록 조회
  console.log('\n📋 Property 목록 조회 중...');
  const properties = await adminClient.listProperties(ACCOUNT_ID);
  console.log(`   발견된 Property: ${properties.length}개`);

  // 브라우저 시작
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  });

  // 전체 결과 저장
  const allResults: Array<{
    property: string;
    propertyId: string;
    domain: string;
    contentGroup: string;
    pageUrl: string;
    pageViews: number;
    prediction: PageVariablePrediction | null;
    actualVariables: Record<string, string>;
    comparisons: Array<{ variable: string; predicted: string | null; actual: string | null; match: boolean; source: string }>;
    accuracy: number;
    errors: string[];
  }> = [];

  let totalComparisons = 0;
  let totalMatches = 0;

  // 각 Property 처리
  for (const prop of properties) {
    const domain = PROPERTY_DOMAIN_MAP[prop.propertyId];
    if (!domain) {
      console.log(`\n⚠️ ${prop.displayName} - 도메인 매핑 없음, 스킵`);
      continue;
    }

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`🏢 ${prop.displayName} (${prop.propertyId})`);
    console.log(`   도메인: ${domain}`);
    console.log(`${'═'.repeat(70)}`);

    // GA4 클라이언트 초기화
    const ga4Client = new GA4Client({
      propertyId: prop.propertyId,
      accessToken,
    });
    await ga4Client.initialize();

    // content_group별 대표 페이지 조회
    const topPages = await getTopPagesByContentGroup(ga4Client as any, prop.propertyId, domain);
    console.log(`   발견된 content_group: ${topPages.size}개`);

    // 각 content_group 처리
    for (const [contentGroup, pageInfo] of topPages.entries()) {
      // OTHERS, 에러 페이지 등 스킵
      if (contentGroup === 'OTHERS' || pageInfo.pageViews < 100) {
        continue;
      }

      console.log(`\n   ${'─'.repeat(50)}`);
      console.log(`   📄 ${contentGroup}`);
      console.log(`      URL: ${pageInfo.fullUrl}`);
      console.log(`      Page Views: ${pageInfo.pageViews.toLocaleString()}`);

      const page = await context.newPage();

      try {
        // 1. 페이지 방문 및 변수 수집
        console.log(`      📷 페이지 방문 및 스크린샷 캡처 중...`);
        const { screenshotPath, actualVariables, htmlLang, errors } = await visitAndCollect(
          page,
          pageInfo.fullUrl,
          screenshotDir,
          prop.displayName.replace(/\s+/g, '_'),
          contentGroup
        );

        if (errors.length > 0) {
          console.log(`      ⚠️ 수집 오류: ${errors.join(', ')}`);
        }

        // 2. Vision AI 예측
        console.log(`      🔍 Vision AI 예측 중...`);
        let prediction: PageVariablePrediction | null = null;
        try {
          prediction = await visionAnalyzer.predictPageVariables(screenshotPath, pageInfo.fullUrl);
          console.log(`      ✓ 예측 완료: ${prediction.pageType} (${prediction.confidence})`);
        } catch (error: any) {
          console.log(`      ❌ Vision AI 오류: ${error.message}`);
          errors.push(`Vision AI: ${error.message}`);
        }

        // 3. 비교
        let comparisons: Array<{ variable: string; predicted: string | null; actual: string | null; match: boolean; source: string }> = [];
        let accuracy = 0;

        if (prediction) {
          comparisons = comparePredictionWithActual(prediction, actualVariables, htmlLang);
          const matchCount = comparisons.filter(c => c.match).length;
          accuracy = comparisons.length > 0 ? (matchCount / comparisons.length) * 100 : 0;

          totalComparisons += comparisons.length;
          totalMatches += matchCount;

          // 비교 결과 출력
          console.log(`      📊 비교 결과 (${accuracy.toFixed(0)}%):`);
          for (const comp of comparisons) {
            const icon = comp.match ? '✅' : '❌';
            console.log(`         ${icon} ${comp.variable}: 예측="${comp.predicted}" vs 실제="${comp.actual}"`);
          }
        }

        // 결과 저장
        allResults.push({
          property: prop.displayName,
          propertyId: prop.propertyId,
          domain,
          contentGroup,
          pageUrl: pageInfo.fullUrl,
          pageViews: pageInfo.pageViews,
          prediction,
          actualVariables,
          comparisons,
          accuracy,
          errors,
        });

      } catch (error: any) {
        console.log(`      ❌ 처리 오류: ${error.message}`);
        allResults.push({
          property: prop.displayName,
          propertyId: prop.propertyId,
          domain,
          contentGroup,
          pageUrl: pageInfo.fullUrl,
          pageViews: pageInfo.pageViews,
          prediction: null,
          actualVariables: {},
          comparisons: [],
          accuracy: 0,
          errors: [error.message],
        });
      } finally {
        await page.close();
      }

      // API 속도 제한 방지
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  await browser.close();

  // 전체 결과 요약
  console.log('\n' + '█'.repeat(80));
  console.log(' 전체 검증 결과 요약');
  console.log('█'.repeat(80));

  const overallAccuracy = totalComparisons > 0 ? (totalMatches / totalComparisons) * 100 : 0;

  console.log(`\n📊 전체 정확도: ${overallAccuracy.toFixed(1)}% (${totalMatches}/${totalComparisons})`);
  console.log(`📋 검증된 페이지: ${allResults.length}개`);

  // Property별 정확도
  console.log('\n[Property별 정확도]');
  const propertyStats = new Map<string, { total: number; matches: number }>();
  for (const result of allResults) {
    const stat = propertyStats.get(result.property) || { total: 0, matches: 0 };
    stat.total += result.comparisons.length;
    stat.matches += result.comparisons.filter(c => c.match).length;
    propertyStats.set(result.property, stat);
  }

  for (const [property, stat] of propertyStats.entries()) {
    const acc = stat.total > 0 ? (stat.matches / stat.total) * 100 : 0;
    const icon = acc >= 90 ? '✅' : acc >= 70 ? '⚠️' : '❌';
    console.log(`   ${icon} ${property}: ${acc.toFixed(0)}% (${stat.matches}/${stat.total})`);
  }

  // 변수별 정확도
  console.log('\n[변수별 정확도]');
  const variableStats = new Map<string, { total: number; matches: number }>();
  for (const result of allResults) {
    for (const comp of result.comparisons) {
      const stat = variableStats.get(comp.variable) || { total: 0, matches: 0 };
      stat.total++;
      if (comp.match) stat.matches++;
      variableStats.set(comp.variable, stat);
    }
  }

  for (const [variable, stat] of variableStats.entries()) {
    const acc = stat.total > 0 ? (stat.matches / stat.total) * 100 : 0;
    const icon = acc >= 90 ? '✅' : acc >= 70 ? '⚠️' : '❌';
    console.log(`   ${icon} ${variable}: ${acc.toFixed(0)}% (${stat.matches}/${stat.total})`);
  }

  // 불일치 패턴 분석
  const mismatches = allResults.flatMap(r =>
    r.comparisons.filter(c => !c.match).map(c => ({
      property: r.property,
      contentGroup: r.contentGroup,
      ...c,
    }))
  );

  if (mismatches.length > 0) {
    console.log('\n[주요 불일치 패턴]');
    const mismatchByVariable = new Map<string, typeof mismatches>();
    for (const m of mismatches) {
      const list = mismatchByVariable.get(m.variable) || [];
      list.push(m);
      mismatchByVariable.set(m.variable, list);
    }

    for (const [variable, list] of mismatchByVariable.entries()) {
      console.log(`\n   ${variable} (${list.length}건 불일치):`);
      for (const m of list.slice(0, 3)) {
        console.log(`      - ${m.property}/${m.contentGroup}: 예측="${m.predicted}" vs 실제="${m.actual}"`);
      }
    }
  }

  // 결과 저장
  const resultPath = path.join(outputDir, 'validation-results.json');
  fs.writeFileSync(resultPath, JSON.stringify({
    validationDate: new Date().toISOString(),
    accountId: ACCOUNT_ID,
    overallAccuracy,
    totalComparisons,
    totalMatches,
    propertyStats: Object.fromEntries(propertyStats),
    variableStats: Object.fromEntries(variableStats),
    results: allResults,
    mismatches,
  }, null, 2));

  console.log(`\n💾 결과 저장: ${resultPath}`);
  console.log('\n✅ 검증 완료!');
}

main().catch(console.error);
