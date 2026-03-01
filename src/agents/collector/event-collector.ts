/**
 * Event Network Collector - GA4 네트워크 요청 인터셉트 + 파싱
 *
 * Playwright page.on('request')로 /g/collect 요청을 캡처하여
 * GA4 이벤트명 + 파라미터를 수집.
 *
 * 파싱 로직은 Omnibug GoogleAnalytics4.js를 TypeScript로 포팅.
 */

import type { Browser, Page, BrowserContext } from 'playwright';
import {
  launchStealthBrowser,
  createStealthContext,
  reorderURLsForSafety,
  pollForLogin,
  type CollectorConfig,
} from './browser-collector';

// ─────────────────────────────────────────────────────────────────────
// Types (계약 타입은 src/types/collected-data.ts에서 관리)
// ─────────────────────────────────────────────────────────────────────

// Re-export shared types for backward compatibility
export type {
  GA4Parameter,
  GA4ProductParam,
  CapturedGA4Event,
} from '../../types/collected-data';

import type {
  GA4Parameter,
  GA4ProductParam,
  CapturedGA4Event,
} from '../../types/collected-data';

/** URL별 이벤트 수집 결과 */
export interface EventCollectedData {
  channel: string;
  url: string;
  collected_at: string;
  captured_events: CapturedGA4Event[];
  page_title?: string;
  final_url?: string;
  errors: string[];
  collection_duration_ms: number;
}

// ─────────────────────────────────────────────────────────────────────
// GA4 파라미터 키 사전 (Omnibug 참조)
// ─────────────────────────────────────────────────────────────────────

const GA4_PARAM_KEYS: Record<string, { name: string; group: string }> = {
  v:     { name: 'Protocol Version', group: 'general' },
  tid:   { name: 'Tracking ID', group: 'general' },
  cid:   { name: 'Client ID', group: 'general' },
  uid:   { name: 'User ID', group: 'general' },
  sc:    { name: 'Session Control', group: 'general' },
  dr:    { name: 'Document Referrer', group: 'general' },
  dl:    { name: 'Document Location URL', group: 'general' },
  dh:    { name: 'Document Host Name', group: 'general' },
  dp:    { name: 'Document Path', group: 'general' },
  dt:    { name: 'Document Title', group: 'general' },
  sr:    { name: 'Screen Resolution', group: 'general' },
  vp:    { name: 'Viewport Size', group: 'general' },
  ul:    { name: 'User Language', group: 'general' },
  sd:    { name: 'Screen Colors', group: 'general' },
  de:    { name: 'Document Encoding', group: 'general' },
  ds:    { name: 'Data Source', group: 'general' },
  en:    { name: 'Event Name', group: 'event' },
  ni:    { name: 'Non-Interaction Hit', group: 'event' },
  _r:    { name: 'Display Features Enabled', group: 'general' },
  gcs:   { name: 'Consent Mode', group: 'general' },
  // Campaign
  cn:    { name: 'Campaign Name', group: 'campaign' },
  cs:    { name: 'Campaign Source', group: 'campaign' },
  cm:    { name: 'Campaign Medium', group: 'campaign' },
  ck:    { name: 'Campaign Keyword', group: 'campaign' },
  cc:    { name: 'Campaign Content', group: 'campaign' },
  ci:    { name: 'Campaign ID', group: 'campaign' },
  gclid: { name: 'Google AdWords ID', group: 'campaign' },
  dclid: { name: 'Google Display Ads ID', group: 'campaign' },
  // Ecommerce
  pa:    { name: 'Product Action', group: 'ecommerce' },
  cu:    { name: 'Currency Code', group: 'ecommerce' },
  ta:    { name: 'Transaction Affiliation', group: 'ecommerce' },
  tr:    { name: 'Transaction Revenue', group: 'ecommerce' },
  ts:    { name: 'Transaction Shipping', group: 'ecommerce' },
  tcc:   { name: 'Coupon Code', group: 'ecommerce' },
};

/** GA4 /g/collect 요청 URL 패턴 */
export const GA4_COLLECT_PATTERN = /\/g\/collect/;

// ─────────────────────────────────────────────────────────────────────
// GA4 Request Parser
// ─────────────────────────────────────────────────────────────────────

/** product 파라미터 필드 매핑 */
const PRODUCT_FIELD_MAP: Record<string, keyof Omit<GA4ProductParam, 'index'>> = {
  id: 'id',
  nm: 'name',
  br: 'brand',
  ca: 'category',
  va: 'variant',
  pr: 'price',
  qt: 'quantity',
};

/**
 * 단일 GA4 파라미터를 human-readable 형태로 변환
 * Omnibug handleQueryParam 로직 포팅
 */
function parseGA4Param(key: string, value: string): GA4Parameter {
  // ep.X / epn.X → Event Parameter
  const epMatch = key.match(/^epn?\.(.+)$/);
  if (epMatch) {
    const isNumeric = key.startsWith('epn.');
    return {
      key,
      field: `Event Param${isNumeric ? ' (numeric)' : ''}: ${epMatch[1]}`,
      value,
      group: 'event',
    };
  }

  // pr[N]XX → Product Parameter
  const prMatch = key.match(/^pr(\d+)([a-z]{2})$/i);
  if (prMatch) {
    const fieldLookup: Record<string, string> = {
      id: 'ID', nm: 'Name', br: 'Brand', ca: 'Category',
      va: 'Variant', pr: 'Price', qt: 'Quantity', cc: 'Coupon Code', ps: 'Position',
    };
    const fieldName = fieldLookup[prMatch[2]] || prMatch[2];
    return {
      key,
      field: `Product ${prMatch[1]} ${fieldName}`,
      value,
      group: 'ecommerce',
    };
  }

  // cg / cg[N] → Content Group
  const cgMatch = key.match(/^cg(\d*)$/i);
  if (cgMatch) {
    return {
      key,
      field: cgMatch[1] ? `Content Group ${cgMatch[1]}` : 'Content Group',
      value,
      group: 'general',
    };
  }

  // 사전에 있는 키
  const known = GA4_PARAM_KEYS[key];
  if (known) {
    return { key, field: known.name, value, group: known.group };
  }

  // 알 수 없는 키
  return { key, field: key, value, group: 'other' };
}

/**
 * key-value 쌍 목록에서 product 파라미터를 추출
 */
function extractProducts(params: Record<string, string>): GA4ProductParam[] {
  const productMap = new Map<number, GA4ProductParam>();

  for (const [key, value] of Object.entries(params)) {
    const match = key.match(/^pr(\d+)([a-z]{2})$/i);
    if (!match) continue;

    const index = parseInt(match[1], 10);
    const fieldCode = match[2].toLowerCase();
    const fieldKey = PRODUCT_FIELD_MAP[fieldCode];
    if (!fieldKey) continue;

    if (!productMap.has(index)) {
      productMap.set(index, { index });
    }
    const product = productMap.get(index)!;
    product[fieldKey] = value;
  }

  return Array.from(productMap.values()).sort((a, b) => a.index - b.index);
}

/**
 * query string 문자열을 key-value 쌍으로 파싱
 */
function parseQueryString(qs: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!qs) return params;

  for (const pair of qs.split('&')) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) {
      params[pair] = '';
    } else {
      const key = pair.substring(0, eqIdx);
      const value = decodeURIComponent(pair.substring(eqIdx + 1));
      params[key] = value;
    }
  }

  return params;
}

/**
 * raw_params에서 CapturedGA4Event를 생성
 */
function buildEvent(
  rawParams: Record<string, string>,
  requestUrl: string,
  timestamp: string,
): CapturedGA4Event {
  const parameters: GA4Parameter[] = [];
  for (const [key, value] of Object.entries(rawParams)) {
    parameters.push(parseGA4Param(key, value));
  }

  const products = extractProducts(rawParams);

  return {
    event_name: rawParams['en'] || 'unknown',
    timestamp,
    request_url: requestUrl,
    tracking_id: rawParams['tid'] || '',
    parameters,
    raw_params: rawParams,
    document_location: rawParams['dl'],
    document_title: rawParams['dt'],
    content_group: rawParams['cg'],
    user_id: rawParams['uid'],
    client_id: rawParams['cid'],
    products: products.length > 0 ? products : undefined,
  };
}

/**
 * GA4 요청 파싱 (URL query string + POST body)
 *
 * POST body 형식: 이벤트를 줄바꿸/공백으로 구분
 *   en=page_view&ep.page_title=Home
 *   en=scroll&epn.percent_scrolled=90
 *
 * URL query string에 공통 파라미터, POST body에 이벤트별 파라미터
 */
export function parseGA4Request(
  requestUrl: string,
  postData?: string | null,
): CapturedGA4Event[] {
  const timestamp = new Date().toISOString();

  // URL query string 파싱
  let queryString = '';
  try {
    const urlObj = new URL(requestUrl);
    queryString = urlObj.search.substring(1); // '?' 제거
  } catch {
    // URL 파싱 실패 시 '?' 이후 추출
    const qIdx = requestUrl.indexOf('?');
    if (qIdx !== -1) {
      queryString = requestUrl.substring(qIdx + 1);
    }
  }

  const baseParams = parseQueryString(queryString);

  // POST body가 없으면 URL query string만으로 이벤트 생성
  if (!postData || postData.trim() === '') {
    return [buildEvent(baseParams, requestUrl, timestamp)];
  }

  // POST body 파싱: 줄바꿈/공백으로 멀티 이벤트 분리
  const eventChunks = postData.trim().split(/\r?\n|\s+/).filter(Boolean);

  if (eventChunks.length === 0) {
    return [buildEvent(baseParams, requestUrl, timestamp)];
  }

  // 각 이벤트 chunk는 &로 구분된 key=value 쌍
  return eventChunks.map(chunk => {
    const eventParams = parseQueryString(chunk);
    // base params + event-specific params (event params override)
    const merged = { ...baseParams, ...eventParams };
    return buildEvent(merged, requestUrl, timestamp);
  });
}

// ─────────────────────────────────────────────────────────────────────
// Network Interceptor + Collector
// ─────────────────────────────────────────────────────────────────────

// setupGA4Interceptor는 ga4-interceptor.ts로 통합
import { setupGA4Interceptor } from './ga4-interceptor';

/**
 * 단일 URL 이벤트 수집
 */
export async function collectEventsFromURL(
  url: string,
  config: CollectorConfig,
  waitMs: number = 5000,
): Promise<EventCollectedData> {
  const errors: string[] = [];
  let browser: Browser | null = null;

  try {
    browser = await launchStealthBrowser({ headless: config.headless });
    const context = await createStealthContext(browser, config);
    const page: Page = await context.newPage();

    // 네트워크 인터셉터 설정
    const capturedEvents = setupGA4Interceptor(page);

    const startTime = Date.now();

    // 페이지 방문
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: config.timeout_ms,
    });

    // 추가 대기 (GA4 요청은 약간의 딜레이가 있을 수 있음)
    await page.waitForTimeout(waitMs);

    const pageTitle = await page.title();
    const finalUrl = page.url();
    const duration = Date.now() - startTime;

    await context.close();

    return {
      channel: config.channel,
      url,
      collected_at: new Date().toISOString(),
      captured_events: capturedEvents,
      page_title: pageTitle,
      final_url: finalUrl,
      errors,
      collection_duration_ms: duration,
    };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    errors.push(`이벤트 수집 실패: ${errMsg}`);

    return {
      channel: config.channel,
      url,
      collected_at: new Date().toISOString(),
      captured_events: [],
      errors,
      collection_duration_ms: 0,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * 단일 context에서 여러 URL의 이벤트를 수집
 */
async function collectEventsFromContext(
  context: BrowserContext,
  urls: string[],
  config: CollectorConfig,
  waitMs: number,
): Promise<EventCollectedData[]> {
  const results: EventCollectedData[] = [];
  const isLoginChannel = config.channel.includes('login') && !config.channel.includes('no_login');
  const { safe: safeUrls, dangerous: dangerousUrls } = reorderURLsForSafety(urls, isLoginChannel);

  if (dangerousUrls.length > 0) {
    console.log(`  ⚠️  로그아웃 URL ${dangerousUrls.length}개 감지 - 맨 마지막에 수집합니다`);
  }

  const orderedUrls = [...safeUrls, ...dangerousUrls];
  const totalUrls = orderedUrls.length;

  for (let i = 0; i < orderedUrls.length; i++) {
    const url = orderedUrls[i];
    const progress = Math.round(((i + 1) / totalUrls) * 100);
    const bar = '\u2588'.repeat(Math.floor(progress / 5)) + '\u2591'.repeat(20 - Math.floor(progress / 5));
    console.log(`  [${i + 1}/${totalUrls}] ${bar} ${progress}% | ${url}`);

    const errors: string[] = [];
    const page: Page = await context.newPage();

    try {
      const capturedEvents = setupGA4Interceptor(page);
      const startTime = Date.now();

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: config.timeout_ms,
      });

      await page.waitForTimeout(waitMs);

      const pageTitle = await page.title();
      const finalUrl = page.url();
      const duration = Date.now() - startTime;

      results.push({
        channel: config.channel,
        url,
        collected_at: new Date().toISOString(),
        captured_events: capturedEvents,
        page_title: pageTitle,
        final_url: finalUrl,
        errors,
        collection_duration_ms: duration,
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      errors.push(`이벤트 수집 실패: ${errMsg}`);

      results.push({
        channel: config.channel,
        url,
        collected_at: new Date().toISOString(),
        captured_events: [],
        errors,
        collection_duration_ms: 0,
      });
    } finally {
      await page.close();
    }
  }

  return results;
}

/**
 * 배치 이벤트 수집 (브라우저 1회 실행)
 */
export async function collectEventsFromURLsBatch(
  urls: string[],
  config: CollectorConfig,
  waitMs: number = 5000,
): Promise<EventCollectedData[]> {
  let browser: Browser | null = null;

  try {
    browser = await launchStealthBrowser({ headless: config.headless });
    const context = await createStealthContext(browser, config);
    const results = await collectEventsFromContext(context, urls, config, waitMs);
    await context.close();
    return results;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * 로그인 채널 이벤트 수집
 * Phase 1: Visible 브라우저 로그인 → 세션 저장
 * Phase 2: Headless System Chrome으로 이벤트 수집
 */
export async function collectEventsWithLogin(
  urls: string[],
  config: CollectorConfig,
  siteUrl: string,
  waitMs: number = 5000,
): Promise<EventCollectedData[]> {
  const channelLabel = config.channel.startsWith('pc') ? 'PC' : 'MO';

  // Phase 1: Visible 브라우저로 로그인
  let loginBrowser: Browser | null = null;
  let storageState: {
    cookies: Array<{
      name: string; value: string; domain: string; path: string;
      expires: number; httpOnly: boolean; secure: boolean; sameSite: 'Strict' | 'Lax' | 'None';
    }>;
    origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>;
  };

  try {
    loginBrowser = await launchStealthBrowser({ headless: false, useSystemChrome: true });
    const loginContext = await createStealthContext(loginBrowser, config);
    const page = await loginContext.newPage();

    const loginPageUrl = siteUrl.replace(/\/$/, '') + '/account/login';
    console.log(`  [${channelLabel}] 로그인 페이지로 이동: ${loginPageUrl}`);
    await page.goto(loginPageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log(`  🔐 ${channelLabel} 로그인 채널 - 브라우저에서 로그인해주세요.`);
    console.log(`     로그인 완료 시 자동 감지 → headless로 전환하여 이벤트 수집합니다.`);

    const loginDetected = await pollForLogin(page, loginContext, siteUrl, 300000);

    if (loginDetected) {
      console.log(`  ✅ 로그인 감지 완료 - 세션 저장 중...`);
    } else {
      console.log(`  ⚠️  로그인 대기 시간 초과 - 현재 상태로 수집을 진행합니다.`);
    }

    storageState = await loginContext.storageState();
    await page.close();
    await loginContext.close();
  } finally {
    if (loginBrowser) {
      await loginBrowser.close();
      loginBrowser = null;
    }
  }

  // Phase 2: Headless System Chrome으로 이벤트 수집
  console.log(`  [${channelLabel}] headless System Chrome으로 전환 - 이벤트 수집 시작`);

  let headlessBrowser: Browser | null = null;
  try {
    headlessBrowser = await launchStealthBrowser({ headless: true, useSystemChrome: true });
    const headlessContext = await createStealthContext(headlessBrowser, config);

    // 세션 복원
    await headlessContext.addCookies(storageState.cookies);
    for (const origin of storageState.origins) {
      const p = await headlessContext.newPage();
      await p.goto(origin.origin, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      for (const item of origin.localStorage) {
        await p.evaluate(({ k, v }) => localStorage.setItem(k, v), { k: item.name, v: item.value });
      }
      await p.close();
    }

    const results = await collectEventsFromContext(headlessContext, urls, config, waitMs);
    await headlessContext.close();
    return results;
  } finally {
    if (headlessBrowser) {
      await headlessBrowser.close();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// 콘솔 출력 (디버깅/탐색용)
// ─────────────────────────────────────────────────────────────────────

/**
 * 수집된 이벤트를 콘솔에 출력
 */
export function printCollectedEvents(data: EventCollectedData[]): void {
  for (const result of data) {
    console.log('');
    console.log(`${'─'.repeat(70)}`);
    console.log(`URL: ${result.url}`);
    if (result.final_url && result.final_url !== result.url) {
      console.log(`  -> Redirected to: ${result.final_url}`);
    }
    if (result.page_title) {
      console.log(`  Title: ${result.page_title}`);
    }
    console.log(`  Channel: ${result.channel} | Duration: ${result.collection_duration_ms}ms`);
    console.log(`  Events captured: ${result.captured_events.length}`);

    if (result.errors.length > 0) {
      for (const err of result.errors) {
        console.log(`  ❌ ${err}`);
      }
    }

    for (let i = 0; i < result.captured_events.length; i++) {
      const event = result.captured_events[i];
      console.log('');
      console.log(`  [${i + 1}] ${event.event_name}  (tid: ${event.tracking_id})`);

      // 주요 필드
      if (event.document_location) {
        console.log(`      dl: ${event.document_location}`);
      }
      if (event.document_title) {
        console.log(`      dt: ${event.document_title}`);
      }
      if (event.content_group) {
        console.log(`      cg: ${event.content_group}`);
      }

      // Event Parameters (ep.*, epn.*)
      const eventParams = event.parameters.filter(p => p.group === 'event' && p.key !== 'en');
      if (eventParams.length > 0) {
        for (const param of eventParams) {
          console.log(`      ${param.key}: ${param.value}`);
        }
      }

      // Products
      if (event.products && event.products.length > 0) {
        for (const product of event.products) {
          const parts: string[] = [];
          if (product.id) parts.push(`id=${product.id}`);
          if (product.name) parts.push(`nm=${product.name}`);
          if (product.price) parts.push(`pr=${product.price}`);
          if (product.quantity) parts.push(`qt=${product.quantity}`);
          if (product.brand) parts.push(`br=${product.brand}`);
          if (product.category) parts.push(`ca=${product.category}`);
          console.log(`      pr${product.index}: ${parts.join(', ')}`);
        }
      }
    }
  }
  console.log('');
  console.log(`${'─'.repeat(70)}`);

  // 요약
  const totalEvents = data.reduce((sum, d) => sum + d.captured_events.length, 0);
  const totalErrors = data.reduce((sum, d) => sum + d.errors.length, 0);
  console.log(`총 ${data.length}개 URL에서 ${totalEvents}개 이벤트 수집 (에러: ${totalErrors}개)`);
}
