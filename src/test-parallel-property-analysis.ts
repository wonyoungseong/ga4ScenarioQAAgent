/**
 * GA4 계정 전체 Property 이벤트 파라미터 예측 - 병렬 처리 버전
 *
 * 성능 최적화:
 * - 여러 Property를 동시에 분석 (Promise.all)
 * - 각 Property 내 여러 페이지를 병렬로 방문
 * - Browser context 풀링
 */

import { GA4AdminClient, GA4Property } from './ga4/ga4AdminClient';
import { GA4Client } from './ga4/ga4Client';
import { GeminiVisionAnalyzer } from './analyzers/visionAnalyzer';
import { GTMEventParameterExtractor } from './config/gtmEventParameterExtractor';
import { getGlobalGTMConfig, PreloadedGTMConfig } from './config/gtmConfigLoader';
import { ECOMMERCE_ITEM_PARAMS, EVENT_ITEMS_SOURCES } from './config/ecommerceItemsMapping';
import { chromium, Browser, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const ACCOUNT_ID = '293457213';
const TOKEN_PATH = './credentials/ga4_tokens.json';
const MAX_CONCURRENT_PROPERTIES = 3;  // 동시 처리할 Property 수
const MAX_CONCURRENT_PAGES = 5;       // 동시 처리할 페이지 수

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

// Content Group별 기본 URL 패턴
const CONTENT_GROUP_URL_PATTERNS: Record<string, string> = {
  'MAIN': '/kr/ko/display/main',
  'PRODUCT_DETAIL': '/kr/ko/product/detail?onlineProdSn=91736',
  'PRODUCT_LIST': '/kr/ko/display/category/100000001',
  'SEARCH_RESULT': '/kr/ko/search?keyword=설화수',
  'CART': '/kr/ko/cart/cartList',
  'BRAND_MAIN': '/kr/ko/brand/SULWHASOO',
};

interface ContentGroupPage {
  contentGroup: string;
  pagePath: string;
  pageUrl: string;
  pageViewCount: number;
}

interface VariableComparison {
  key: string;
  predicted: string | null;
  actual: string | null;
  matched: boolean;
}

// Vision AI 예측 키 → AP_DATA 변수 매핑
const VISION_TO_AP_DATA_MAP: Record<string, string> = {
  'site_name': 'AP_DATA_SITENAME',
  'site_country': 'AP_DATA_COUNTRY',
  'site_language': 'AP_DATA_LANG',
  'site_env': 'AP_DATA_ENV',
  'channel': 'AP_DATA_CHANNEL',
  'content_group': 'AP_DATA_PAGETYPE',
  'login_is_login': 'AP_DATA_ISLOGIN',
  'product_id': 'AP_PRD_CODE',
  'product_name': 'AP_PRD_NAME',
  'product_brandname': 'AP_PRD_BRAND',
  'product_category': 'AP_PRD_CATEGORY',
  'product_price': 'AP_PRD_PRICE',
  'product_prdprice': 'AP_PRD_PRDPRICE',
  'search_term': 'AP_SEARCH_TERM',
  'search_result_count': 'AP_SEARCH_NUM',
};

// 값 정규화 함수
function normalizeValue(value: any): string {
  if (value === null || value === undefined || value === '') return '';
  let str = String(value).trim().toUpperCase();

  // 언어 코드 정규화 (ko-KR → KO)
  if (str.match(/^[A-Z]{2}-[A-Z]{2}$/)) {
    str = str.split('-')[0];
  }

  // 페이지 타입 alias 정규화
  const aliases: Record<string, string> = {
    'OTHERS': 'OTHER',
    'PRODUCT': 'PRODUCT_DETAIL',
    'PRODUCTS': 'PRODUCT_LIST',
    'LIST': 'PRODUCT_LIST',
    'DETAIL': 'PRODUCT_DETAIL',
    'BASKET': 'CART',
    'CHECKOUT': 'ORDER',
    'RESULT': 'SEARCH_RESULT',
  };

  return aliases[str] || str;
}

// Vision AI 예측과 실제 변수 비교
function compareVisionWithActual(
  visionVars: Record<string, any> | null,
  actualVars: Record<string, string>
): { comparisons: VariableComparison[]; accuracy: number; matchedCount: number; totalCount: number } {
  const comparisons: VariableComparison[] = [];
  let matchedCount = 0;
  let totalCount = 0;

  if (!visionVars) {
    return { comparisons, accuracy: 0, matchedCount: 0, totalCount: 0 };
  }

  for (const [visionKey, apDataKey] of Object.entries(VISION_TO_AP_DATA_MAP)) {
    const predicted = visionVars[visionKey];
    const actual = actualVars[apDataKey];

    // 실제 값이 있는 경우만 비교
    if (actual !== undefined && actual !== '') {
      totalCount++;
      const normalizedPredicted = normalizeValue(predicted);
      const normalizedActual = normalizeValue(actual);
      const matched = normalizedPredicted === normalizedActual;

      if (matched) {
        matchedCount++;
      }

      comparisons.push({
        key: visionKey,
        predicted: predicted ? String(predicted) : null,
        actual: actual || null,
        matched,
      });
    }
  }

  const accuracy = totalCount > 0 ? (matchedCount / totalCount) * 100 : 0;
  return { comparisons, accuracy, matchedCount, totalCount };
}

interface EventParameterComparison {
  paramKey: string;
  gtmVariable: string;
  predictedValue: string | null;
  developedValue: string | null;  // AP_DATA에서 수집된 값
  ga4Value: string | null;        // GA4 API에서 수집된 값
  matched: boolean;
  source: 'vision' | 'ap_data' | 'ga4' | 'none';
}

interface EventDetail {
  eventName: string;
  gtmDefinedParams: number;
  parameters: EventParameterComparison[];
  matchedCount: number;
  accuracy: number;
}

interface ContentGroupResult {
  contentGroup: string;
  pageUrl: string;
  pageLocation: string;  // 전체 URL
  pageViewCount: number;
  visionPrediction: any;
  actualVariables: Record<string, string>;
  ga4CollectedValues: Record<string, any>;  // GA4 API에서 수집된 값
  variableComparisons: VariableComparison[];
  events: EventDetail[];
  variableAccuracy: number;  // Vision AI 변수 예측 정확도
  eventAccuracy: number;     // 이벤트 파라미터 정확도
  overallAccuracy: number;   // 종합 정확도
  errors: string[];
}

interface PropertyResult {
  propertyId: string;
  propertyName: string;
  domain: string;
  contentGroups: ContentGroupResult[];
  overallAccuracy: number;
  processingTime: number;
}

/**
 * GA4 토큰 로드
 */
function loadAccessToken(): string {
  if (fs.existsSync(TOKEN_PATH)) {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    return tokens.access_token;
  }
  throw new Error(`토큰 파일이 없습니다: ${TOKEN_PATH}`);
}

/**
 * URL 패턴에서 content_group 추론
 */
function inferContentGroup(pagePath: string): string {
  const path = pagePath.toLowerCase();

  if (path.includes('/display/main') || path === '/' || path === '/kr/ko/') return 'MAIN';
  if (path.includes('/product/detail') || path.includes('onlineprod')) return 'PRODUCT_DETAIL';
  if (path.includes('/display/category') || path.includes('/category/')) return 'PRODUCT_LIST';
  if (path.includes('/search')) return 'SEARCH_RESULT';
  if (path.includes('/cart')) return 'CART';
  if (path.includes('/order/complete')) return 'ORDER_COMPLETE';
  if (path.includes('/order')) return 'ORDER';
  if (path.includes('/event/')) return 'EVENT_DETAIL';
  if (path.includes('/brand/')) return 'BRAND_MAIN';
  if (path.includes('/mypage') || path.includes('/my/')) return 'MY';

  return 'OTHERS';
}

/**
 * 기본 대표 페이지 반환
 */
function getDefaultPages(domain: string): ContentGroupPage[] {
  return Object.entries(CONTENT_GROUP_URL_PATTERNS).map(([cg, pattern]) => ({
    contentGroup: cg,
    pagePath: pattern,
    pageUrl: `https://${domain}${pattern}`,
    pageViewCount: 0,
  }));
}

// GTM 변수명 → AP_DATA 변수 매핑 (공통 변수)
const GTM_VARIABLE_TO_AP_DATA: Record<string, string> = {
  'site_name': 'AP_DATA_SITENAME',
  'site_country': 'AP_DATA_COUNTRY',
  'site_language': 'AP_DATA_LANG',
  'site_env': 'AP_DATA_ENV',
  'channel': 'AP_DATA_CHANNEL',
  'content_group': 'AP_DATA_PAGETYPE',
  'login_is_login': 'AP_DATA_ISLOGIN',
  'login_member_grade': 'AP_DATA_MEMBERGRADE',
  'user_id': 'AP_DATA_USERID',
  'search_term': 'AP_SEARCH_TERM',
  'search_result_count': 'AP_SEARCH_NUM',
  'currency': 'AP_ECOMM_CURRENCY',
};

/**
 * 이벤트별 파라미터 → AP_* 변수 매핑 생성
 * ecommerceItemsMapping.ts의 정의를 활용
 */
function getEventParamToApDataMapping(eventName: string): Record<string, string[]> {
  const mapping: Record<string, string[]> = {};

  // 공통 변수 매핑 추가
  for (const [paramKey, apVar] of Object.entries(GTM_VARIABLE_TO_AP_DATA)) {
    mapping[paramKey] = [apVar];
  }

  // 이커머스 items 파라미터 매핑 (이벤트별)
  for (const param of ECOMMERCE_ITEM_PARAMS) {
    const eventSource = param.sources.find(s => s.event === eventName);
    if (eventSource && eventSource.sourceType === 'global_variable') {
      // AP_PRD_CODE 형태의 전역 변수
      const varName = eventSource.sourcePath;
      if (!mapping[param.ga4Param]) {
        mapping[param.ga4Param] = [];
      }
      mapping[param.ga4Param].push(varName);
    }
  }

  // view_item 이벤트 전용 매핑
  if (eventName === 'view_item') {
    mapping['product_id'] = ['AP_PRD_CODE'];
    mapping['product_name'] = ['AP_PRD_NAME'];
    mapping['product_brandname'] = ['AP_PRD_BRAND'];
    mapping['product_category'] = ['AP_PRD_CATEGORY'];
    mapping['product_price'] = ['AP_PRD_PRICE'];
    mapping['product_prdprice'] = ['AP_PRD_PRDPRICE'];
    mapping['product_brandcode'] = ['AP_PRD_BRANDCODE'];
    mapping['product_pagecode'] = ['AP_PRD_PAGECODE'];
    mapping['product_is_stock'] = ['AP_PRD_ISSTOCK'];
    mapping['product_is_pacific'] = ['AP_PRD_ISPACIFIC'];
    mapping['product_sn'] = ['AP_PRD_SN'];
  }

  // view_item_list, view_search_results 이벤트 매핑
  if (eventName === 'view_item_list' || eventName === 'view_search_results') {
    mapping['search_term'] = ['AP_SEARCH_TERM'];
    mapping['search_type'] = ['AP_SEARCH_TYPE'];
    mapping['search_resultcount'] = ['AP_SEARCH_NUM'];
    mapping['search_result'] = ['AP_SEARCH_RESULT'];
    mapping['search_mod_term'] = ['AP_SEARCH_MODTERM'];
    mapping['search_mod_result'] = ['AP_SEARCH_MODRESULT'];
  }

  // view_promotion_detail, select_promotion 매핑
  if (eventName.includes('promotion')) {
    mapping['promotion_id'] = ['AP_PROMO_ID'];
    mapping['promotion_name'] = ['AP_PROMO_NAME'];
    mapping['creative_name'] = ['AP_PROMO_CREATIVENAME'];
    mapping['creative_slot'] = ['AP_PROMO_CREATIVESLOT'];
  }

  return mapping;
}

/**
 * 단일 페이지 분석 (병렬 처리용)
 */
async function analyzePageParallel(
  browser: Browser,
  pageInfo: ContentGroupPage,
  visionAnalyzer: GeminiVisionAnalyzer,
  gtmExtractor: GTMEventParameterExtractor,
  gtmConfig: PreloadedGTMConfig,
  screenshotDir: string,
  ga4CollectedData?: Map<string, Record<string, any>>
): Promise<ContentGroupResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let actualVariables: Record<string, string> = {};
  let visionPrediction: any = null;
  let ga4CollectedValues: Record<string, any> = {};

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  });

  const page = await context.newPage();
  const screenshotPath = path.join(screenshotDir, `${pageInfo.contentGroup}_${Date.now()}.png`);

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

    await page.goto(pageInfo.pageUrl, { timeout: 45000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // AP_DATA 변수 대기
    try {
      await page.waitForFunction(
        () => (window as any).AP_DATA_SITENAME || (window as any).AP_DATA_PAGETYPE,
        { timeout: 8000 }
      );
    } catch {
      errors.push('AP_DATA 타임아웃');
    }

    await page.waitForTimeout(1500);

    // 전역 변수 수집 (모든 AP_ 변수)
    actualVariables = await page.evaluate(() => {
      const vars: Record<string, string> = {};

      // 모든 AP_ 접두사 변수 수집
      for (const key of Object.keys(window)) {
        if (key.startsWith('AP_') || key.startsWith('ap_')) {
          const value = (window as any)[key];
          if (value !== undefined && value !== null && value !== '') {
            vars[key] = String(value);
          }
        }
      }

      // dataLayer에서 ecommerce 데이터 추출
      const dataLayer = (window as any).dataLayer || [];
      for (const item of dataLayer) {
        if (item && item.ecommerce) {
          if (item.ecommerce.items && item.ecommerce.items.length > 0) {
            const firstItem = item.ecommerce.items[0];
            if (firstItem.item_id) vars['DL_ITEM_ID'] = String(firstItem.item_id);
            if (firstItem.item_name) vars['DL_ITEM_NAME'] = String(firstItem.item_name);
            if (firstItem.item_brand) vars['DL_ITEM_BRAND'] = String(firstItem.item_brand);
            if (firstItem.price) vars['DL_PRICE'] = String(firstItem.price);
            if (firstItem.item_category) vars['DL_ITEM_CATEGORY'] = String(firstItem.item_category);
          }
          if (item.ecommerce.currency) vars['DL_CURRENCY'] = String(item.ecommerce.currency);
          if (item.ecommerce.value) vars['DL_VALUE'] = String(item.ecommerce.value);
        }
      }

      return vars;
    });

    // 스크린샷 캡처
    await page.screenshot({ path: screenshotPath, fullPage: false });

    // Vision AI 예측
    try {
      visionPrediction = await visionAnalyzer.predictPageVariables(screenshotPath, pageInfo.pageUrl, {
        viewport: { width: 1920, height: 1080 }
      });
    } catch (error: any) {
      errors.push(`Vision AI: ${error.message}`);
    }

  } catch (error: any) {
    errors.push(`페이지 로딩: ${error.message}`);
  } finally {
    await page.close();
    await context.close();
  }

  // GA4에서 수집된 데이터 가져오기
  if (ga4CollectedData) {
    const pagePath = new URL(pageInfo.pageUrl).pathname;
    const ga4Data = ga4CollectedData.get(pagePath);
    if (ga4Data) {
      ga4CollectedValues = ga4Data;
    }
  }

  // Vision AI 예측과 실제 변수 비교
  const visionVars = visionPrediction?.variables || null;
  const { comparisons: variableComparisons, accuracy: variableAccuracy, matchedCount: varMatched, totalCount: varTotal } =
    compareVisionWithActual(visionVars, actualVariables);

  // 이벤트 파라미터 상세 비교
  const eventDetails: EventDetail[] = [];
  const allowedEvents = gtmConfig.eventPageMappings;

  for (const [eventName, mapping] of allowedEvents) {
    if (mapping.allowedPageTypes.includes(pageInfo.contentGroup as any) ||
        mapping.allowedPageTypes.includes('ALL' as any)) {
      const gtmEvent = gtmExtractor.getEventDefinition(eventName);
      const gtmParamCount = gtmEvent?.eventParameters.length || 0;

      const parameters: EventParameterComparison[] = [];
      let matchedCount = 0;

      if (gtmEvent && gtmParamCount > 0) {
        // 이벤트별 파라미터 → AP_* 매핑 가져오기
        const eventParamMapping = getEventParamToApDataMapping(eventName);

        for (const param of gtmEvent.eventParameters) {
          const paramKey = param.key.toLowerCase();
          const gtmVariable = param.valueSource || '';

          // Vision AI 예측값
          const predictedValue = visionVars?.[paramKey] ||
                                visionVars?.[param.key] || null;

          // 이벤트별 매핑에서 AP_* 변수명 찾기
          let developedValue: string | null = null;
          let matchedApVar: string | null = null;

          const apVarCandidates = eventParamMapping[paramKey] ||
                                  eventParamMapping[param.key] || [];

          for (const apVar of apVarCandidates) {
            if (actualVariables[apVar]) {
              developedValue = actualVariables[apVar];
              matchedApVar = apVar;
              break;
            }
          }

          // 매핑에 없으면 일반적인 패턴 시도
          if (!developedValue) {
            const fallbackKeys = [
              `AP_DATA_${paramKey.toUpperCase()}`,
              `AP_PRD_${paramKey.toUpperCase()}`,
              `AP_SEARCH_${paramKey.toUpperCase()}`,
              `AP_PROMO_${paramKey.toUpperCase()}`,
              `AP_${paramKey.toUpperCase()}`,
            ];
            for (const key of fallbackKeys) {
              if (actualVariables[key]) {
                developedValue = actualVariables[key];
                matchedApVar = key;
                break;
              }
            }
          }

          // dataLayer에서 추가 확인
          if (!developedValue) {
            const dlMappings: Record<string, string> = {
              'item_id': 'DL_ITEM_ID',
              'item_name': 'DL_ITEM_NAME',
              'item_brand': 'DL_ITEM_BRAND',
              'price': 'DL_PRICE',
              'item_category': 'DL_ITEM_CATEGORY',
              'currency': 'DL_CURRENCY',
              'value': 'DL_VALUE',
            };
            const dlKey = dlMappings[paramKey];
            if (dlKey && actualVariables[dlKey]) {
              developedValue = actualVariables[dlKey];
              matchedApVar = dlKey;
            }
          }

          // GA4 수집값
          const ga4Value = ga4CollectedValues[paramKey] ||
                          ga4CollectedValues[param.key] || null;

          // 매칭 여부 확인
          let matched = false;
          let source: 'vision' | 'ap_data' | 'ga4' | 'none' = 'none';

          if (developedValue) {
            matched = true;
            source = 'ap_data';
          } else if (predictedValue) {
            source = 'vision';
          } else if (ga4Value) {
            source = 'ga4';
          }

          if (matched) matchedCount++;

          parameters.push({
            paramKey: param.key,
            gtmVariable: matchedApVar || gtmVariable,  // AP_* 변수명 표시
            predictedValue: predictedValue ? String(predictedValue) : null,
            developedValue: developedValue ? String(developedValue) : null,
            ga4Value: ga4Value ? String(ga4Value) : null,
            matched,
            source,
          });
        }
      }

      const accuracy = gtmParamCount > 0 ? (matchedCount / gtmParamCount) * 100 : 100;

      eventDetails.push({
        eventName,
        gtmDefinedParams: gtmParamCount,
        parameters,
        matchedCount,
        accuracy,
      });
    }
  }

  // 이벤트 정확도 계산 (파라미터가 있는 이벤트만)
  const eventsWithParams = eventDetails.filter(e => e.gtmDefinedParams > 0);
  const eventAccuracy = eventsWithParams.length > 0
    ? eventsWithParams.reduce((sum, e) => sum + e.accuracy, 0) / eventsWithParams.length
    : 0;

  // 종합 정확도: 변수 예측 정확도 (가중치 높음)
  const overallAccuracy = variableAccuracy;

  return {
    contentGroup: pageInfo.contentGroup,
    pageUrl: pageInfo.pageUrl,
    pageLocation: pageInfo.pageUrl,  // 전체 URL
    pageViewCount: pageInfo.pageViewCount,
    visionPrediction,
    actualVariables,
    ga4CollectedValues,
    variableComparisons,
    events: eventDetails,
    variableAccuracy,
    eventAccuracy,
    overallAccuracy,
    errors,
  };
}

/**
 * 단일 Property 분석 (병렬 처리용)
 */
async function analyzePropertyParallel(
  property: GA4Property,
  browser: Browser,
  accessToken: string,
  visionAnalyzer: GeminiVisionAnalyzer,
  gtmExtractor: GTMEventParameterExtractor,
  gtmConfig: PreloadedGTMConfig,
  screenshotDir: string
): Promise<PropertyResult> {
  const startTime = Date.now();
  const domain = PROPERTY_DOMAIN_MAP[property.propertyId];

  if (!domain) {
    return {
      propertyId: property.propertyId,
      propertyName: property.displayName,
      domain: '',
      contentGroups: [],
      overallAccuracy: 0,
      processingTime: Date.now() - startTime,
    };
  }

  console.log(`\n🏢 [${property.displayName}] 분석 시작...`);

  // GA4 Client로 대표 페이지 조회
  let pages: ContentGroupPage[] = [];

  try {
    const ga4Client = new GA4Client({ propertyId: property.propertyId, accessToken });
    await ga4Client.initialize();

    const pageEvents = await ga4Client.getEventsByPage(undefined, {
      startDate: '7daysAgo',
      endDate: 'today',
      limit: 100,
    });

    const pageViewEvents = pageEvents.filter(e => e.eventName === 'page_view');
    const groupMap = new Map<string, ContentGroupPage>();

    for (const event of pageViewEvents) {
      if (!event.pagePath || event.pagePath === '/' || event.pagePath === '(not set)') continue;

      const contentGroup = inferContentGroup(event.pagePath);
      const existing = groupMap.get(contentGroup);

      if (!existing || event.eventCount > existing.pageViewCount) {
        groupMap.set(contentGroup, {
          contentGroup,
          pagePath: event.pagePath,
          pageUrl: `https://${domain}${event.pagePath}`,
          pageViewCount: event.eventCount,
        });
      }
    }

    pages = Array.from(groupMap.values())
      .sort((a, b) => b.pageViewCount - a.pageViewCount)
      .slice(0, 4);  // 최대 4개 content_group

  } catch (error: any) {
    console.log(`   ⚠️ [${property.displayName}] GA4 조회 실패, 기본 페이지 사용`);
    pages = getDefaultPages(domain).slice(0, 4);
  }

  if (pages.length === 0) {
    pages = getDefaultPages(domain).slice(0, 4);
  }

  console.log(`   📄 [${property.displayName}] ${pages.length}개 페이지 분석 중...`);

  // 페이지들을 병렬로 분석 (최대 2개씩)
  const results: ContentGroupResult[] = [];
  const chunks = [];

  for (let i = 0; i < pages.length; i += 2) {
    chunks.push(pages.slice(i, i + 2));
  }

  for (const chunk of chunks) {
    const chunkResults = await Promise.all(
      chunk.map(page =>
        analyzePageParallel(browser, page, visionAnalyzer, gtmExtractor, gtmConfig, screenshotDir)
      )
    );
    results.push(...chunkResults);

    // Vision AI 속도 제한 방지
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 정확도 계산 (변수 예측 정확도 기준)
  const validResults = results.filter(r => r.variableAccuracy > 0 || r.variableComparisons.length > 0);
  const overallAccuracy = validResults.length > 0
    ? validResults.reduce((sum, r) => sum + r.variableAccuracy, 0) / validResults.length
    : 0;

  // 불일치 항목 로깅
  for (const result of results) {
    const mismatches = result.variableComparisons.filter(c => !c.matched);
    if (mismatches.length > 0) {
      console.log(`      ⚠️ [${result.contentGroup}] 불일치: ${mismatches.map(m => `${m.key}(${m.predicted}→${m.actual})`).join(', ')}`);
    }
  }

  const processingTime = Date.now() - startTime;
  const avgVarAccuracy = results.length > 0
    ? results.reduce((sum, r) => sum + r.variableAccuracy, 0) / results.length
    : 0;

  console.log(`   ✅ [${property.displayName}] 완료 (${(processingTime / 1000).toFixed(1)}s, 변수정확도: ${avgVarAccuracy.toFixed(0)}%)`);

  return {
    propertyId: property.propertyId,
    propertyName: property.displayName,
    domain,
    contentGroups: results,
    overallAccuracy,
    processingTime,
  };
}

/**
 * 메인 실행
 */
async function main() {
  const totalStartTime = Date.now();

  console.log('═'.repeat(80));
  console.log(` GA4 계정 ${ACCOUNT_ID} 전체 Property 이벤트 파라미터 예측 (병렬 처리)`);
  console.log('═'.repeat(80));

  // 환경 변수 확인
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error('❌ GEMINI_API_KEY가 설정되지 않았습니다.');
    process.exit(1);
  }

  const accessToken = loadAccessToken();
  console.log('✅ GA4 토큰 로드 완료');

  // 출력 디렉토리
  const outputDir = path.join(process.cwd(), 'output', 'parallel-property-analysis');
  const screenshotDir = path.join(outputDir, 'screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  // GTM 설정 로드
  console.log('\n📦 GTM 설정 로드 중...');
  const gtmExtractor = new GTMEventParameterExtractor('./GTM-5FK5X5C4_workspace112.json');
  const allGTMEvents = gtmExtractor.extractAllEvents();
  console.log(`   이벤트 ${allGTMEvents.length}개 로드됨`);

  const gtmConfig = await getGlobalGTMConfig();
  console.log('   GTM Config 로드 완료');

  // Vision Analyzer 초기화
  const visionAnalyzer = new GeminiVisionAnalyzer(geminiApiKey);
  console.log('✅ Vision Analyzer 초기화 완료');

  // GA4 Admin Client로 Property 목록 조회
  console.log('\n📋 Property 목록 조회 중...');
  const adminClient = new GA4AdminClient(accessToken);
  await adminClient.initialize();
  const properties = await adminClient.listProperties(ACCOUNT_ID);
  console.log(`   발견된 Property: ${properties.length}개`);

  // 도메인 매핑이 있는 Property만 필터링
  const validProperties = properties.filter(p => PROPERTY_DOMAIN_MAP[p.propertyId]);
  console.log(`   분석 대상 Property: ${validProperties.length}개`);

  // 브라우저 시작
  const browser = await chromium.launch({ headless: true });

  // Property를 청크로 나눠서 병렬 처리
  const allResults: PropertyResult[] = [];
  const propertyChunks = [];

  for (let i = 0; i < validProperties.length; i += MAX_CONCURRENT_PROPERTIES) {
    propertyChunks.push(validProperties.slice(i, i + MAX_CONCURRENT_PROPERTIES));
  }

  console.log(`\n🚀 ${validProperties.length}개 Property를 ${MAX_CONCURRENT_PROPERTIES}개씩 병렬 처리...`);

  for (let i = 0; i < propertyChunks.length; i++) {
    const chunk = propertyChunks[i];
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📊 처리 중: ${i * MAX_CONCURRENT_PROPERTIES + 1}-${Math.min((i + 1) * MAX_CONCURRENT_PROPERTIES, validProperties.length)} / ${validProperties.length}`);

    const chunkResults = await Promise.all(
      chunk.map(property =>
        analyzePropertyParallel(
          property, browser, accessToken,
          visionAnalyzer, gtmExtractor, gtmConfig, screenshotDir
        )
      )
    );

    allResults.push(...chunkResults);

    // API 속도 제한 방지
    if (i < propertyChunks.length - 1) {
      console.log('\n   ⏳ 다음 배치 대기 중...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  await browser.close();

  const totalTime = Date.now() - totalStartTime;

  // 결과 리포트
  console.log('\n\n' + '█'.repeat(80));
  console.log(' 전체 분석 결과');
  console.log('█'.repeat(80));

  console.log('\n[Property별 정확도]');
  for (const result of allResults) {
    if (!result.domain) {
      console.log(`   ⚪ ${result.propertyName}: 도메인 매핑 없음`);
      continue;
    }

    const icon = result.overallAccuracy >= 70 ? '✅' : result.overallAccuracy >= 40 ? '⚠️' : '❌';
    console.log(`   ${icon} ${result.propertyName}: ${result.overallAccuracy.toFixed(1)}% (${result.contentGroups.length} pages, ${(result.processingTime / 1000).toFixed(1)}s)`);
  }

  const validResults = allResults.filter(r => r.domain);
  const overallAccuracy = validResults.length > 0
    ? validResults.reduce((sum, r) => sum + r.overallAccuracy, 0) / validResults.length
    : 0;

  console.log(`\n📊 전체 평균 정확도: ${overallAccuracy.toFixed(1)}%`);
  console.log(`📋 분석된 Property: ${validResults.length}개`);
  console.log(`⏱️  총 소요 시간: ${(totalTime / 1000).toFixed(1)}초`);
  console.log(`📈 평균 처리 시간: ${(validResults.reduce((s, r) => s + r.processingTime, 0) / validResults.length / 1000).toFixed(1)}초/Property`);

  // 상세 비교 출력
  console.log('\n\n' + '═'.repeat(80));
  console.log(' 상세 비교 분석 (page_location, 이벤트, 파라미터, 예측값, 개발값, GA4값)');
  console.log('═'.repeat(80));

  for (const result of allResults) {
    if (!result.domain) continue;

    console.log(`\n${'─'.repeat(80)}`);
    console.log(`🏢 ${result.propertyName} (${result.domain})`);
    console.log(`${'─'.repeat(80)}`);

    for (const cg of result.contentGroups) {
      console.log(`\n  📍 page_location: ${cg.pageLocation}`);
      console.log(`     content_group: ${cg.contentGroup}`);
      console.log(`     page_views: ${cg.pageViewCount}`);

      // 수집된 변수 요약
      const collectedVarCount = Object.keys(cg.actualVariables).length;
      if (collectedVarCount > 0) {
        console.log(`     수집된 변수: ${collectedVarCount}개`);
        const varList = Object.entries(cg.actualVariables)
          .slice(0, 8)
          .map(([k, v]) => `${k}=${String(v).substring(0, 15)}`)
          .join(', ');
        console.log(`     [${varList}${collectedVarCount > 8 ? '...' : ''}]`);
      } else {
        console.log(`     ⚠️ 수집된 AP_DATA 변수 없음`);
      }

      // 변수 비교 테이블
      if (cg.variableComparisons.length > 0) {
        console.log(`\n     [공통 변수 비교]`);
        console.log(`     ${'─'.repeat(70)}`);
        console.log(`     ${'변수명'.padEnd(20)} | ${'예측값'.padEnd(18)} | ${'개발값(AP_DATA)'.padEnd(18)} | 매칭`);
        console.log(`     ${'─'.repeat(70)}`);

        for (const comp of cg.variableComparisons) {
          const predicted = (comp.predicted || '-').padEnd(18);
          const actual = (comp.actual || '-').padEnd(18);
          const matchIcon = comp.matched ? '✅' : '❌';
          console.log(`     ${comp.key.padEnd(20)} | ${predicted} | ${actual} | ${matchIcon}`);
        }
      }

      // 이벤트 목록 (파라미터가 있는 이벤트만 요약)
      if (cg.events.length > 0) {
        const eventsWithData = cg.events.filter(e => e.matchedCount > 0);
        const eventsWithoutData = cg.events.filter(e => e.matchedCount === 0 && e.gtmDefinedParams > 0);

        console.log(`\n     [예상 이벤트]`);
        console.log(`     발생 가능 이벤트: ${cg.events.map(e => e.eventName).join(', ')}`);

        if (eventsWithData.length > 0) {
          console.log(`\n     [파라미터 데이터 확인된 이벤트]`);
          for (const event of eventsWithData) {
            console.log(`     ✅ ${event.eventName}: ${event.matchedCount}/${event.gtmDefinedParams} 파라미터 확인`);

            // 실제 값이 있는 파라미터만 표시
            const paramsWithData = event.parameters.filter(p => p.developedValue || p.predictedValue || p.ga4Value);
            if (paramsWithData.length > 0) {
              console.log(`     ${'─'.repeat(70)}`);
              console.log(`     ${'파라미터'.padEnd(18)} | ${'예측값'.padEnd(16)} | ${'개발값'.padEnd(16)} | 매칭`);
              console.log(`     ${'─'.repeat(70)}`);
              for (const param of paramsWithData.slice(0, 10)) {
                const predicted = (param.predictedValue || '-').substring(0, 16).padEnd(16);
                const developed = (param.developedValue || '-').substring(0, 16).padEnd(16);
                const matchIcon = param.matched ? '✅' : '❌';
                console.log(`     ${param.paramKey.padEnd(18)} | ${predicted} | ${developed} | ${matchIcon}`);
              }
            }
          }
        }

        if (eventsWithoutData.length > 0) {
          console.log(`\n     ⚠️ 파라미터 확인 불가: ${eventsWithoutData.map(e => e.eventName).join(', ')}`);
          console.log(`        (이벤트 파라미터는 dataLayer push 시점에만 확인 가능)`);
        }
      }

      // 오류 표시
      if (cg.errors.length > 0) {
        console.log(`\n     ⚠️ 오류: ${cg.errors.join(', ')}`);
      }
    }
  }

  // 불일치 패턴 분석
  console.log('\n\n' + '═'.repeat(80));
  console.log(' 불일치 패턴 분석');
  console.log('═'.repeat(80));

  const mismatchPatterns = new Map<string, { predicted: string; actual: string; count: number }[]>();

  for (const result of allResults) {
    for (const cg of result.contentGroups) {
      for (const comp of cg.variableComparisons) {
        if (!comp.matched && comp.predicted && comp.actual) {
          const patterns = mismatchPatterns.get(comp.key) || [];
          const existing = patterns.find(p => p.predicted === comp.predicted && p.actual === comp.actual);
          if (existing) {
            existing.count++;
          } else {
            patterns.push({ predicted: comp.predicted, actual: comp.actual, count: 1 });
          }
          mismatchPatterns.set(comp.key, patterns);
        }
      }
    }
  }

  for (const [key, patterns] of mismatchPatterns.entries()) {
    console.log(`\n   ${key}:`);
    for (const p of patterns.slice(0, 5)) {
      console.log(`      예측="${p.predicted}" → 실제="${p.actual}" (${p.count}건)`);
    }
  }

  // GTM 이벤트 파라미터 요약
  console.log('\n[GTM 이벤트 파라미터 요약]');
  for (const event of allGTMEvents.slice(0, 10)) {
    console.log(`   ${event.eventName}: event ${event.eventParameters.length}개, item ${event.itemParameters.length}개`);
  }

  // 결과 저장 (JSON)
  const reportPath = path.join(outputDir, 'parallel-analysis-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    analysisDate: new Date().toISOString(),
    accountId: ACCOUNT_ID,
    totalTime: totalTime,
    overallAccuracy,
    propertyCount: validResults.length,
    gtmEvents: allGTMEvents.map(e => ({
      eventName: e.eventName,
      eventParamCount: e.eventParameters.length,
      itemParamCount: e.itemParameters.length,
    })),
    results: allResults,
  }, null, 2));
  console.log(`\n💾 JSON 리포트 저장: ${reportPath}`);

  // 상세 비교 리포트 저장 (Markdown)
  const mdReportPath = path.join(outputDir, 'detailed-comparison-report.md');
  let mdContent = `# GA4 Property 상세 비교 분석 리포트\n\n`;
  mdContent += `- **분석 일시**: ${new Date().toLocaleString('ko-KR')}\n`;
  mdContent += `- **계정 ID**: ${ACCOUNT_ID}\n`;
  mdContent += `- **분석된 Property**: ${validResults.length}개\n`;
  mdContent += `- **전체 평균 정확도**: ${overallAccuracy.toFixed(1)}%\n`;
  mdContent += `- **총 소요 시간**: ${(totalTime / 1000).toFixed(1)}초\n\n`;

  mdContent += `## Property별 요약\n\n`;
  mdContent += `| Property | Domain | 페이지 수 | 정확도 | 처리 시간 |\n`;
  mdContent += `|----------|--------|----------|--------|----------|\n`;

  for (const result of allResults) {
    if (!result.domain) continue;
    mdContent += `| ${result.propertyName} | ${result.domain} | ${result.contentGroups.length} | ${result.overallAccuracy.toFixed(1)}% | ${(result.processingTime / 1000).toFixed(1)}s |\n`;
  }

  mdContent += `\n## 상세 비교 분석\n\n`;

  for (const result of allResults) {
    if (!result.domain) continue;

    mdContent += `### ${result.propertyName} (${result.domain})\n\n`;

    for (const cg of result.contentGroups) {
      mdContent += `#### ${cg.contentGroup}\n\n`;
      mdContent += `- **page_location**: \`${cg.pageLocation}\`\n`;
      mdContent += `- **page_views**: ${cg.pageViewCount}\n`;
      mdContent += `- **정확도**: ${cg.variableAccuracy.toFixed(1)}%\n\n`;

      // 변수 비교 테이블
      if (cg.variableComparisons.length > 0) {
        mdContent += `**공통 변수 비교**\n\n`;
        mdContent += `| 변수명 | 예측값 | 개발값(AP_DATA) | 매칭 |\n`;
        mdContent += `|--------|--------|-----------------|------|\n`;

        for (const comp of cg.variableComparisons) {
          const matchIcon = comp.matched ? '✅' : '❌';
          mdContent += `| ${comp.key} | ${comp.predicted || '-'} | ${comp.actual || '-'} | ${matchIcon} |\n`;
        }
        mdContent += `\n`;
      }

      // 이벤트 목록
      if (cg.events.length > 0) {
        mdContent += `**예상 발생 이벤트**\n\n`;
        mdContent += `${cg.events.map(e => `\`${e.eventName}\``).join(', ')}\n\n`;

        const eventsWithData = cg.events.filter(e => e.matchedCount > 0);
        if (eventsWithData.length > 0) {
          mdContent += `**파라미터 데이터 확인된 이벤트**\n\n`;

          for (const event of eventsWithData) {
            mdContent += `##### ${event.eventName}\n\n`;
            mdContent += `- 확인된 파라미터: ${event.matchedCount}/${event.gtmDefinedParams}개\n\n`;

            const paramsWithData = event.parameters.filter(p => p.developedValue || p.predictedValue);
            if (paramsWithData.length > 0) {
              mdContent += `| 파라미터 | 예측값 | 개발값 | 매칭 |\n`;
              mdContent += `|----------|--------|--------|------|\n`;

              for (const param of paramsWithData.slice(0, 15)) {
                const matchIcon = param.matched ? '✅' : '❌';
                mdContent += `| ${param.paramKey} | ${(param.predictedValue || '-').substring(0, 20)} | ${(param.developedValue || '-').substring(0, 20)} | ${matchIcon} |\n`;
              }
              mdContent += `\n`;
            }
          }
        }

        const eventsWithoutData = cg.events.filter(e => e.matchedCount === 0 && e.gtmDefinedParams > 0);
        if (eventsWithoutData.length > 0) {
          mdContent += `**파라미터 확인 불가 이벤트**: ${eventsWithoutData.map(e => `\`${e.eventName}\``).join(', ')}\n\n`;
          mdContent += `> 이벤트 파라미터는 dataLayer push 시점에만 확인 가능합니다.\n\n`;
        }
      }

      // 오류 표시
      if (cg.errors.length > 0) {
        mdContent += `**오류**: ${cg.errors.join(', ')}\n\n`;
      }
    }
  }

  // 불일치 패턴
  mdContent += `## 불일치 패턴 분석\n\n`;

  for (const [key, patterns] of mismatchPatterns.entries()) {
    mdContent += `### ${key}\n\n`;
    mdContent += `| 예측값 | 실제값 | 건수 |\n`;
    mdContent += `|--------|--------|------|\n`;
    for (const p of patterns.slice(0, 5)) {
      mdContent += `| ${p.predicted} | ${p.actual} | ${p.count} |\n`;
    }
    mdContent += `\n`;
  }

  fs.writeFileSync(mdReportPath, mdContent);
  console.log(`💾 상세 비교 리포트 저장: ${mdReportPath}`);

  console.log('\n✅ 병렬 분석 완료!');
}

main().catch(console.error);
