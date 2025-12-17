/**
 * GA4 Content Group 분석 및 미테스트 페이지 분석
 *
 * GA4 API를 활용하여:
 * 1. 실제 수집되는 Content Group 목록 확인
 * 2. 각 Content Group의 상위 5개 페이지 조회
 * 3. 각 페이지에서 발생하는 이벤트 조회
 * 4. 미테스트 페이지 방문하여 이벤트 예측
 */

import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';
import * as dotenv from 'dotenv';
import { GA4Client } from './ga4/ga4Client';
import { createDefaultGTMConfigLoader } from './config/gtmConfigLoader';
import { IntegratedEventAnalyzer } from './analyzers/integratedEventAnalyzer';

dotenv.config();

const PROPERTY_ID = '416629733';

// 이미 테스트한 Content Group
const TESTED_CONTENT_GROUPS = ['MAIN', 'PRODUCT_DETAIL', 'EVENT_LIST'];

interface ContentGroupData {
  contentGroup: string;
  pageViews: number;
  topPages: {
    pagePath: string;
    pageViews: number;
    events: { eventName: string; count: number; percent: string }[];
  }[];
}

interface PredictionResult {
  contentGroup: string;
  pagePath: string;
  fullUrl: string;
  detectedPageType: string;
  canFire: string[];
  blocked: string[];
  actualEvents: string[];
  accuracy: {
    correct: string[];
    missed: string[];
    wrong: string[];
    rate: number;
  };
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not set');
    process.exit(1);
  }

  console.log('=== GA4 Content Group 분석 ===\n');

  // 1. GA4 클라이언트 초기화
  console.log('【1. GA4 연결】');
  const ga4Client = new GA4Client({ propertyId: PROPERTY_ID });

  try {
    await ga4Client.initialize();
    console.log('✅ GA4 연결 완료\n');
  } catch (error: any) {
    console.error('❌ GA4 연결 실패:', error.message);
    console.log('\n💡 GA4 인증이 필요합니다. credentials/ga4_tokens.json 파일을 확인하세요.');
    process.exit(1);
  }

  // 2. Content Group별 데이터 조회
  console.log('【2. Content Group별 데이터 조회】');
  console.log('-'.repeat(80));

  // @ts-ignore - private 접근
  const client = ga4Client['client'];
  if (!client) {
    console.error('GA4 클라이언트가 초기화되지 않았습니다.');
    process.exit(1);
  }

  // Content Group 목록과 페이지뷰 조회
  const contentGroups = await getContentGroups(client, PROPERTY_ID);

  console.log('\n📊 발견된 Content Group:\n');
  for (const cg of contentGroups) {
    const tested = TESTED_CONTENT_GROUPS.includes(cg.contentGroup) ? '✅' : '⏳';
    console.log(`  ${tested} ${cg.contentGroup}: ${cg.pageViews.toLocaleString()} views`);
  }

  // 미테스트 Content Group 필터링
  const untestedGroups = contentGroups.filter(cg =>
    !TESTED_CONTENT_GROUPS.includes(cg.contentGroup) &&
    cg.contentGroup !== '(not set)' &&
    cg.contentGroup !== ''
  );

  console.log(`\n⏳ 테스트 필요: ${untestedGroups.map(g => g.contentGroup).join(', ')}`);

  // 3. 각 Content Group별 상위 5개 페이지 조회
  console.log('\n\n【3. Content Group별 상위 5개 페이지】');
  console.log('-'.repeat(80));

  const contentGroupData: ContentGroupData[] = [];

  for (const cg of untestedGroups.slice(0, 8)) { // 상위 8개 그룹만
    console.log(`\n📄 [${cg.contentGroup}]`);

    const topPages = await getTopPagesByContentGroup(client, PROPERTY_ID, cg.contentGroup, 5);

    const cgData: ContentGroupData = {
      contentGroup: cg.contentGroup,
      pageViews: cg.pageViews,
      topPages: [],
    };

    for (const page of topPages) {
      console.log(`   ${page.pagePath}: ${page.pageViews.toLocaleString()} views`);

      // 해당 페이지의 이벤트 조회
      const events = await getPageEvents(client, PROPERTY_ID, page.pagePath);

      cgData.topPages.push({
        pagePath: page.pagePath,
        pageViews: page.pageViews,
        events: events.slice(0, 10),
      });
    }

    contentGroupData.push(cgData);
  }

  // 4. 각 Content Group별 이벤트 상세
  console.log('\n\n【4. Content Group별 주요 이벤트】');
  console.log('-'.repeat(80));

  for (const cgData of contentGroupData) {
    if (cgData.topPages.length === 0) continue;

    console.log(`\n📄 [${cgData.contentGroup}]`);

    // 첫 번째 페이지의 이벤트 출력
    const firstPage = cgData.topPages[0];
    if (firstPage && firstPage.events.length > 0) {
      console.log(`   📍 대표 페이지: ${firstPage.pagePath}`);
      console.log(`   주요 이벤트:`);
      for (const e of firstPage.events.slice(0, 8)) {
        console.log(`      - ${e.eventName}: ${e.count.toLocaleString()} (${e.percent})`);
      }
    }
  }

  // 5. 분석기 로드 및 미테스트 페이지 방문
  console.log('\n\n【5. 미테스트 페이지 방문 및 예측】');
  console.log('='.repeat(80));

  const configLoader = createDefaultGTMConfigLoader();
  await configLoader.preload();
  const analyzer = IntegratedEventAnalyzer.fromConfigLoader(apiKey, configLoader);
  console.log('✅ 분석기 준비 완료\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

  const predictions: PredictionResult[] = [];

  for (const cgData of contentGroupData) {
    // 유효한 페이지 찾기
    const validPage = cgData.topPages.find(p =>
      p.pagePath &&
      p.pagePath !== '(not set)' &&
      p.pagePath.startsWith('/')
    );

    if (!validPage) {
      console.log(`\n📄 [${cgData.contentGroup}] 유효한 페이지 없음`);
      continue;
    }

    const fullUrl = `https://www.amoremall.com${validPage.pagePath}`;
    console.log(`\n\n📄 [${cgData.contentGroup}]`);
    console.log(`   URL: ${fullUrl}`);

    try {
      const page = await context.newPage();
      await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 60000 });

      // 팝업 닫기
      try { await page.click('[class*="close"]', { timeout: 3000 }); } catch {}
      try { await page.click('[class*="popup"] [class*="close"]', { timeout: 2000 }); } catch {}
      await page.waitForTimeout(2000);

      // 스크린샷
      const screenshotPath = `./output/cg_${cgData.contentGroup.toLowerCase().replace(/[^a-z0-9]/g, '_')}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`   📸 스크린샷: ${screenshotPath}`);

      // 이벤트 예측
      const result = await analyzer.analyzeEventsForPage(fullUrl, screenshotPath, page);

      const predictedEvents = result.actuallyCanFire.map(e => e.eventName);
      const actualEvents = validPage.events.map(e => e.eventName);

      // 정확도 계산
      const actualSet = new Set(actualEvents);
      const predictedSet = new Set(predictedEvents);

      const correct = predictedEvents.filter(e => actualSet.has(e));
      const wrong = predictedEvents.filter(e => !actualSet.has(e));
      const missed = actualEvents.filter(e => !predictedSet.has(e));

      const prediction: PredictionResult = {
        contentGroup: cgData.contentGroup,
        pagePath: validPage.pagePath,
        fullUrl,
        detectedPageType: result.pageType,
        canFire: predictedEvents,
        blocked: result.gtmBlockedEvents.slice(0, 10).map(e => e.eventName),
        actualEvents,
        accuracy: {
          correct,
          missed,
          wrong,
          rate: predictedEvents.length > 0 ? (correct.length / predictedEvents.length) * 100 : 0,
        },
      };

      predictions.push(prediction);

      console.log(`\n   📍 감지된 페이지 타입: ${result.pageType}`);
      console.log(`\n   ✅ 발생 가능 예측 (${predictedEvents.length}개): ${predictedEvents.join(', ')}`);
      console.log(`   📊 GA4 실제 이벤트 (${actualEvents.length}개): ${actualEvents.slice(0, 8).join(', ')}...`);
      console.log(`\n   비교 결과:`);
      console.log(`      ✅ 정확: ${correct.join(', ') || '없음'}`);
      console.log(`      ❌ 잘못: ${wrong.join(', ') || '없음'}`);
      console.log(`      ⚠️ 누락: ${missed.slice(0, 5).join(', ') || '없음'}${missed.length > 5 ? '...' : ''}`);
      console.log(`      정확도: ${prediction.accuracy.rate.toFixed(1)}%`);

      await page.close();
    } catch (error: any) {
      console.log(`   ❌ 오류: ${error.message}`);
    }
  }

  await browser.close();

  // 6. 전체 결과 요약
  console.log('\n\n【6. 전체 결과 요약】');
  console.log('='.repeat(80));

  console.log('\n📊 Content Group별 예측 정확도:\n');

  let totalCorrect = 0;
  let totalPredicted = 0;

  for (const pred of predictions) {
    const bar = '█'.repeat(Math.round(pred.accuracy.rate / 10)) + '░'.repeat(10 - Math.round(pred.accuracy.rate / 10));
    console.log(`   ${pred.contentGroup.padEnd(20)} ${bar} ${pred.accuracy.rate.toFixed(1)}%`);
    console.log(`      예측: ${pred.canFire.join(', ')}`);
    console.log(`      실제: ${pred.actualEvents.slice(0, 5).join(', ')}...`);
    console.log('');

    totalCorrect += pred.accuracy.correct.length;
    totalPredicted += pred.canFire.length;
  }

  const overallAccuracy = totalPredicted > 0 ? (totalCorrect / totalPredicted) * 100 : 0;
  console.log(`\n   ${'전체'.padEnd(20)} ${'█'.repeat(Math.round(overallAccuracy / 10))}${'░'.repeat(10 - Math.round(overallAccuracy / 10))} ${overallAccuracy.toFixed(1)}%`);

  // JSON 저장
  const outputPath = path.join(process.cwd(), 'output', 'content_group_ga4_analysis.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    contentGroups: contentGroupData,
    predictions,
    summary: {
      totalPredicted,
      totalCorrect,
      overallAccuracy,
    }
  }, null, 2));
  console.log(`\n📁 결과 저장: ${outputPath}`);

  console.log('\n=== 분석 완료 ===');
}

/**
 * Content Group 목록 조회
 */
async function getContentGroups(client: any, propertyId: string): Promise<{ contentGroup: string; pageViews: number }[]> {
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'contentGroup' }],
    metrics: [{ name: 'screenPageViews' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 50,
  });

  const groups: { contentGroup: string; pageViews: number }[] = [];
  if (response.rows) {
    for (const row of response.rows) {
      groups.push({
        contentGroup: row.dimensionValues?.[0]?.value || '',
        pageViews: parseInt(row.metricValues?.[0]?.value || '0', 10),
      });
    }
  }
  return groups;
}

/**
 * Content Group별 상위 페이지 조회
 */
async function getTopPagesByContentGroup(
  client: any,
  propertyId: string,
  contentGroup: string,
  limit: number
): Promise<{ pagePath: string; pageViews: number }[]> {
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }],
    dimensionFilter: {
      filter: {
        fieldName: 'contentGroup',
        stringFilter: { matchType: 'EXACT', value: contentGroup },
      },
    },
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit,
  });

  const pages: { pagePath: string; pageViews: number }[] = [];
  if (response.rows) {
    for (const row of response.rows) {
      pages.push({
        pagePath: row.dimensionValues?.[0]?.value || '',
        pageViews: parseInt(row.metricValues?.[0]?.value || '0', 10),
      });
    }
  }
  return pages;
}

/**
 * 페이지별 이벤트 조회
 */
async function getPageEvents(
  client: any,
  propertyId: string,
  pagePath: string
): Promise<{ eventName: string; count: number; percent: string }[]> {
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: {
        fieldName: 'pagePath',
        stringFilter: { matchType: 'EXACT', value: pagePath },
      },
    },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 30,
  });

  const events: { eventName: string; count: number; percent: string }[] = [];
  let totalCount = 0;

  if (response.rows) {
    for (const row of response.rows) {
      totalCount += parseInt(row.metricValues?.[0]?.value || '0', 10);
    }

    for (const row of response.rows) {
      const count = parseInt(row.metricValues?.[0]?.value || '0', 10);
      events.push({
        eventName: row.dimensionValues?.[0]?.value || '',
        count,
        percent: totalCount > 0 ? `${((count / totalCount) * 100).toFixed(1)}%` : '0%',
      });
    }
  }

  // 자동 수집 이벤트 필터링
  const autoEvents = new Set(['first_visit', 'session_start', 'user_engagement']);
  return events.filter(e => !autoEvents.has(e.eventName));
}

main().catch(console.error);
