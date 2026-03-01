/**
 * Browser Collector - Playwright로 전역변수 수집
 *
 * URL 방문 후 window.AP_DATA_* + dataLayer 배열에서 AP_DATA_* 수집
 * 각 변수의 source (window/dataLayer/both/not_found) 기록
 */

import { chromium, type Browser, type Page, type BrowserContext } from 'playwright';

// ─────────────────────────────────────────────────────────────────────
// Stealth (봇 탐지 우회 - 정당한 QA 테스트 용도)
// ─────────────────────────────────────────────────────────────────────

/** 봇 탐지를 회피하는 Chromium 실행 인자 */
export const STEALTH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-component-update',
  '--disable-infobars',
];

/** navigator.webdriver 등 자동화 지표를 은닉하는 스크립트 */
export const STEALTH_INIT_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'languages', { get: () => ['ja', 'en-US', 'en'] });
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  window.chrome = { runtime: {} };
  const originalQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = (parameters) =>
    parameters.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
      : originalQuery(parameters);
`;

export interface StealthBrowserOptions {
  headless: boolean;
  /** true이면 시스템 Chrome 사용 (CAPTCHA 우회에 효과적) */
  useSystemChrome?: boolean;
}

export async function launchStealthBrowser(options: StealthBrowserOptions): Promise<Browser> {
  const launchOptions: Record<string, unknown> = {
    headless: options.headless,
    args: STEALTH_ARGS,
  };

  // 로그인 등 봇 탐지가 민감한 경우 시스템 Chrome 사용
  if (options.useSystemChrome) {
    launchOptions['channel'] = 'chrome';
  }

  return chromium.launch(launchOptions);
}

export async function createStealthContext(
  browser: Browser,
  config: CollectorConfig,
): Promise<BrowserContext> {
  const channelConfig = CHANNEL_CONFIGS[config.channel] || {};

  const contextOptions: Record<string, unknown> = {
    viewport: config.viewport || channelConfig.viewport || { width: 1920, height: 1080 },
  };

  const userAgent = config.user_agent || channelConfig.user_agent;
  if (userAgent) {
    contextOptions['userAgent'] = userAgent;
  }

  const context = await browser.newContext(contextOptions);
  await context.addInitScript(STEALTH_INIT_SCRIPT);
  return context;
}

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export type VariableSourceStatus = 'window' | 'dataLayer' | 'both' | 'not_found';

/** 수집된 개별 변수 값 */
export interface CollectedVariableValue {
  value: unknown;
  source: VariableSourceStatus;
  window_value?: unknown;
  dataLayer_value?: unknown;
}

/** URL 하나에 대한 전역변수 수집 결과 */
export interface GlobalVariableCollectedData {
  channel: 'pc_login' | 'pc_no_login' | 'mo_login' | 'mo_no_login';
  url: string;
  collected_at: string;
  variables: Record<string, CollectedVariableValue>;
  errors: string[];
  page_title?: string;
  final_url?: string;
}

/** Collector 설정 */
export interface CollectorConfig {
  channel: 'pc_login' | 'pc_no_login' | 'mo_login' | 'mo_no_login';
  timeout_ms: number;
  headless: boolean;
  viewport: { width: number; height: number };
  user_agent?: string;
}

// ─────────────────────────────────────────────────────────────────────
// 기본 설정
// ─────────────────────────────────────────────────────────────────────

const DEFAULT_MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

export const CHANNEL_CONFIGS: Record<string, Partial<CollectorConfig>> = {
  pc_login: { viewport: { width: 1920, height: 1080 } },
  pc_no_login: { viewport: { width: 1920, height: 1080 } },
  mo_login: { viewport: { width: 375, height: 812 }, user_agent: DEFAULT_MOBILE_UA },
  mo_no_login: { viewport: { width: 375, height: 812 }, user_agent: DEFAULT_MOBILE_UA },
};

/** 수집 대상 변수 목록 (19개) */
const TARGET_VARIABLES = [
  'AP_DATA_SITENAME',
  'AP_DATA_COUNTRY',
  'AP_DATA_LANG',
  'AP_DATA_ENV',
  'AP_DATA_CHANNEL',
  'AP_DATA_BREAD',
  'AP_DATA_PAGETYPE',
  'AP_PROMO_ID',
  'AP_PROMO_NAME',
  'AP_DATA_ISLOGIN',
  'AP_DATA_GCID',
  'AP_DATA_CID',
  'AP_DATA_ISMEMBER',
  'AP_DATA_CG',
  'AP_DATA_CD',
  'AP_DATA_LOGINTYPE',
  'AP_DATA_CT',
  'AP_DATA_BEAUTYCT',
  'AP_DATA_ISEMPLOYEE',
];

// ─────────────────────────────────────────────────────────────────────
// 수집 로직
// ─────────────────────────────────────────────────────────────────────

/**
 * 페이지에서 window 객체의 AP_DATA_* / AP_PROMO_* 변수 수집
 * 대소문자 무시 매칭 (실제 사이트에서 소문자로 선언될 수 있음)
 */
async function collectFromWindow(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate((vars: string[]) => {
    const result: Record<string, unknown> = {};
    const w = window as unknown as Record<string, unknown>;
    const windowKeys = Object.keys(w);

    for (const varName of vars) {
      // 대문자 정확 매칭
      if (w[varName] !== undefined) {
        result[varName] = w[varName];
        continue;
      }
      // 소문자 매칭
      const lowerKey = varName.toLowerCase();
      const matched = windowKeys.find(k => k.toLowerCase() === lowerKey);
      if (matched && w[matched] !== undefined) {
        result[varName] = w[matched];
      }
    }
    return result;
  }, TARGET_VARIABLES);
}

/**
 * 페이지에서 dataLayer 배열의 AP_DATA_* / AP_PROMO_* 변수 수집
 * 대소문자 무시 매칭 (실제 사이트에서 소문자 키 사용: ap_data_sitename 등)
 */
async function collectFromDataLayer(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate((vars: string[]) => {
    const result: Record<string, unknown> = {};
    const dl = (window as unknown as Record<string, unknown>)['dataLayer'];
    if (!Array.isArray(dl)) return result;

    // 대소문자 무시를 위한 소문자 매핑
    const lowerToCanonical: Record<string, string> = {};
    for (const v of vars) {
      lowerToCanonical[v.toLowerCase()] = v;
    }

    // dataLayer 배열을 역순 순회 (최신 값 우선)
    for (let i = dl.length - 1; i >= 0; i--) {
      const entry = dl[i] as Record<string, unknown> | undefined;
      if (!entry || typeof entry !== 'object') continue;

      for (const key of Object.keys(entry)) {
        const canonical = lowerToCanonical[key.toLowerCase()];
        if (!canonical) continue;
        if (result[canonical] !== undefined) continue; // 이미 찾은 변수 스킵

        if (entry[key] !== undefined) {
          result[canonical] = entry[key];
        }
      }
    }

    return result;
  }, TARGET_VARIABLES);
}

/**
 * window와 dataLayer 수집 결과 병합
 */
function mergeCollectedData(
  windowData: Record<string, unknown>,
  dataLayerData: Record<string, unknown>,
): Record<string, CollectedVariableValue> {
  const merged: Record<string, CollectedVariableValue> = {};

  for (const varName of TARGET_VARIABLES) {
    const wVal = windowData[varName];
    const dlVal = dataLayerData[varName];

    const hasWindow = wVal !== undefined;
    const hasDataLayer = dlVal !== undefined;

    let source: VariableSourceStatus;
    let value: unknown;

    if (hasWindow && hasDataLayer) {
      source = 'both';
      value = wVal; // window 우선
    } else if (hasWindow) {
      source = 'window';
      value = wVal;
    } else if (hasDataLayer) {
      source = 'dataLayer';
      value = dlVal;
    } else {
      source = 'not_found';
      value = undefined;
    }

    merged[varName] = {
      value,
      source,
      ...(hasWindow ? { window_value: wVal } : {}),
      ...(hasDataLayer ? { dataLayer_value: dlVal } : {}),
    };
  }

  return merged;
}

// ─────────────────────────────────────────────────────────────────────
// 메인 수집 함수
// ─────────────────────────────────────────────────────────────────────

export async function collectFromURL(
  url: string,
  config: CollectorConfig,
): Promise<GlobalVariableCollectedData> {
  const errors: string[] = [];

  let browser: Browser | null = null;

  try {
    browser = await launchStealthBrowser({ headless: config.headless });
    const context = await createStealthContext(browser, config);
    const page: Page = await context.newPage();

    // 페이지 방문
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: config.timeout_ms,
    });

    // dataLayer 로드 대기 (최대 5초)
    try {
      await page.waitForFunction(
        () => Array.isArray((window as unknown as Record<string, unknown>)['dataLayer']),
        { timeout: 5000 },
      );
    } catch {
      errors.push('dataLayer 로드 타임아웃 (5초)');
    }

    // 추가 대기 (동적 변수 설정 완료)
    await page.waitForTimeout(2000);

    // 수집
    const windowData = await collectFromWindow(page);
    const dataLayerData = await collectFromDataLayer(page);
    const variables = mergeCollectedData(windowData, dataLayerData);

    const pageTitle = await page.title();
    const finalUrl = page.url();

    await context.close();

    return {
      channel: config.channel,
      url,
      collected_at: new Date().toISOString(),
      variables,
      errors,
      page_title: pageTitle,
      final_url: finalUrl,
    };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    errors.push(`수집 실패: ${errMsg}`);

    // 빈 결과 반환
    const emptyVars: Record<string, CollectedVariableValue> = {};
    for (const v of TARGET_VARIABLES) {
      emptyVars[v] = { value: undefined, source: 'not_found' };
    }

    return {
      channel: config.channel,
      url,
      collected_at: new Date().toISOString(),
      variables: emptyVars,
      errors,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * 여러 URL에 대해 순차 수집
 */
export async function collectFromURLs(
  urls: string[],
  config: CollectorConfig,
): Promise<GlobalVariableCollectedData[]> {
  const results: GlobalVariableCollectedData[] = [];

  for (const url of urls) {
    console.log(`  수집 중: ${url} (${config.channel})`);
    const result = await collectFromURL(url, config);
    results.push(result);
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────
// 배치 수집 (브라우저 1회 실행, 여러 URL 순차 방문)
// ─────────────────────────────────────────────────────────────────────

/** 방문 시 세션을 파괴하는 로그아웃/세션종료 URL 패턴 */
const LOGOUT_URL_PATTERNS = [
  '/account/logout',
  '/logout',
  '/signout',
  '/sign-out',
  '/session/destroy',
];

/**
 * URL이 로그아웃을 유발하는지 확인
 */
export function isLogoutURL(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return LOGOUT_URL_PATTERNS.some(p => pathname.includes(p));
  } catch {
    return LOGOUT_URL_PATTERNS.some(p => url.toLowerCase().includes(p));
  }
}

/**
 * URL 목록을 안전한 순서로 정렬
 * - 로그아웃 URL은 맨 뒤로 이동 (또는 경고 후 건너뜀)
 * - 로그인 채널에서만 적용
 */
export function reorderURLsForSafety(urls: string[], isLoginChannel: boolean): { safe: string[]; dangerous: string[] } {
  if (!isLoginChannel) {
    return { safe: urls, dangerous: [] };
  }

  const safe: string[] = [];
  const dangerous: string[] = [];

  for (const url of urls) {
    if (isLogoutURL(url)) {
      dangerous.push(url);
    } else {
      safe.push(url);
    }
  }

  return { safe, dangerous };
}

/**
 * 단일 context에서 여러 URL의 전역변수를 수집
 * 기존 collectFromURLs와 달리 브라우저를 1번만 실행하여 성능 최적화
 * 로그인 채널: 로그아웃 URL을 감지하여 맨 마지막에 수집 (세션 보호)
 */
async function collectFromContext(
  context: BrowserContext,
  urls: string[],
  config: CollectorConfig,
): Promise<GlobalVariableCollectedData[]> {
  const results: GlobalVariableCollectedData[] = [];
  const isLoginChannel = config.channel.includes('login') && !config.channel.includes('no_login');

  // 로그아웃 URL 분리 (로그인 채널에서만)
  const { safe: safeUrls, dangerous: dangerousUrls } = reorderURLsForSafety(urls, isLoginChannel);

  if (dangerousUrls.length > 0) {
    console.log(`  ⚠️  로그아웃 URL ${dangerousUrls.length}개 감지 - 맨 마지막에 수집합니다:`);
    for (const url of dangerousUrls) {
      console.log(`     - ${url}`);
    }
  }

  // 안전한 URL 먼저, 위험한 URL 나중에
  const orderedUrls = [...safeUrls, ...dangerousUrls];
  const totalUrls = orderedUrls.length;

  for (let i = 0; i < orderedUrls.length; i++) {
    const url = orderedUrls[i];
    const isDangerous = dangerousUrls.includes(url);
    const label = isDangerous ? `⚠️ ${url}` : url;
    const progress = Math.round(((i + 1) / totalUrls) * 100);
    const bar = '█'.repeat(Math.floor(progress / 5)) + '░'.repeat(20 - Math.floor(progress / 5));
    console.log(`  [${i + 1}/${totalUrls}] ${bar} ${progress}% | ${label} (${config.channel})`);
    const errors: string[] = [];

    const page: Page = await context.newPage();
    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: config.timeout_ms,
      });

      // dataLayer 로드 대기
      try {
        await page.waitForFunction(
          () => Array.isArray((window as unknown as Record<string, unknown>)['dataLayer']),
          { timeout: 5000 },
        );
      } catch {
        errors.push('dataLayer 로드 타임아웃 (5초)');
      }

      await page.waitForTimeout(2000);

      const windowData = await collectFromWindow(page);
      const dataLayerData = await collectFromDataLayer(page);
      const variables = mergeCollectedData(windowData, dataLayerData);
      const pageTitle = await page.title();
      const finalUrl = page.url();

      results.push({
        channel: config.channel,
        url,
        collected_at: new Date().toISOString(),
        variables,
        errors,
        page_title: pageTitle,
        final_url: finalUrl,
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      errors.push(`수집 실패: ${errMsg}`);

      const emptyVars: Record<string, CollectedVariableValue> = {};
      for (const v of TARGET_VARIABLES) {
        emptyVars[v] = { value: undefined, source: 'not_found' };
      }

      results.push({
        channel: config.channel,
        url,
        collected_at: new Date().toISOString(),
        variables: emptyVars,
        errors,
      });
    } finally {
      await page.close();
    }
  }

  return results;
}

/**
 * 배치 모드 수집 - 브라우저를 1번만 실행하여 모든 URL 순회
 */
export async function collectFromURLsBatch(
  urls: string[],
  config: CollectorConfig,
): Promise<GlobalVariableCollectedData[]> {
  let browser: Browser | null = null;

  try {
    browser = await launchStealthBrowser({ headless: config.headless });
    const context = await createStealthContext(browser, config);
    const results = await collectFromContext(context, urls, config);
    await context.close();

    return results;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Human-in-the-Loop 로그인 수집
 *
 * Phase 1: Visible System Chrome으로 로그인 → 세션(쿠키+localStorage) 저장
 * Phase 2: Headless System Chrome으로 세션 복원 → 백그라운드 수집
 *
 * 핵심: 두 Phase 모두 System Chrome(useSystemChrome: true)을 사용하여
 * 브라우저 fingerprint 일관성을 유지하고 세션 무효화를 방지.
 */
export async function collectWithLogin(
  urls: string[],
  config: CollectorConfig,
  siteUrl: string,
): Promise<GlobalVariableCollectedData[]> {
  const channelLabel = config.channel.startsWith('pc') ? 'PC' : 'MO';

  // ──────────────────────────────────────────────────
  // Phase 1: Visible 브라우저로 로그인 (사용자가 직접)
  // ──────────────────────────────────────────────────
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
    await page.goto(loginPageUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    console.log('');
    console.log(`  🔐 ${channelLabel} 로그인 채널 - 브라우저에서 로그인해주세요.`);
    console.log(`     로그인 완료 시 자동 감지 → headless로 전환하여 수집합니다.`);

    const loginDetected = await pollForLogin(page, loginContext, siteUrl, 300000);

    if (loginDetected) {
      console.log(`  ✅ 로그인 감지 완료 - 세션 저장 중...`);
    } else {
      console.log(`  ⚠️  로그인 대기 시간 초과 - 현재 상태로 수집을 진행합니다.`);
    }

    // 쿠키 + localStorage 저장
    storageState = await loginContext.storageState();

    await page.close();
    await loginContext.close();
  } finally {
    if (loginBrowser) {
      await loginBrowser.close();
      loginBrowser = null;
    }
  }

  // ──────────────────────────────────────────────────
  // Phase 2: Headless System Chrome으로 수집 (백그라운드)
  // ──────────────────────────────────────────────────
  console.log(`  [${channelLabel}] headless System Chrome으로 전환 - 백그라운드 수집 시작`);

  let headlessBrowser: Browser | null = null;
  try {
    headlessBrowser = await launchStealthBrowser({ headless: true, useSystemChrome: true });
    const headlessContext = await createStealthContext(headlessBrowser, config);

    // 저장된 쿠키 주입
    await headlessContext.addCookies(storageState.cookies);

    // localStorage 복원
    for (const origin of storageState.origins) {
      const p = await headlessContext.newPage();
      await p.goto(origin.origin, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      for (const item of origin.localStorage) {
        await p.evaluate(({ k, v }) => localStorage.setItem(k, v), { k: item.name, v: item.value });
      }
      await p.close();
    }

    // 세션 유효성 검증
    const verifyPage = await headlessContext.newPage();
    try {
      await verifyPage.goto(siteUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await verifyPage.waitForTimeout(2000);
      const sessionValid = await verifyPage.evaluate(() => {
        const w = window as unknown as Record<string, unknown>;
        if (w['AP_DATA_ISLOGIN'] === 'Y' || w['ap_data_islogin'] === 'Y') return true;
        const dl = w['dataLayer'];
        if (Array.isArray(dl)) {
          for (let i = dl.length - 1; i >= 0; i--) {
            const entry = dl[i] as Record<string, unknown> | undefined;
            if (!entry) continue;
            for (const key of Object.keys(entry)) {
              if (key.toLowerCase() === 'ap_data_islogin' && entry[key] === 'Y') return true;
            }
          }
        }
        return false;
      }).catch(() => false);

      if (sessionValid) {
        console.log(`  ✅ [${channelLabel}] headless 세션 검증 성공 - 로그인 유지 확인`);
      } else {
        console.log(`  ⚠️  [${channelLabel}] headless 세션 검증 실패 - 로그인이 유지되지 않을 수 있음`);
      }
    } finally {
      await verifyPage.close();
    }

    const results = await collectFromContext(headlessContext, urls, config);
    await headlessContext.close();

    return results;
  } finally {
    if (headlessBrowser) {
      await headlessBrowser.close();
    }
  }
}

/**
 * 로그인 완료를 polling으로 감지
 *
 * 3가지 방법으로 감지:
 * 1. 현재 페이지의 AP_DATA_ISLOGIN 값이 "Y"
 * 2. 현재 URL이 /account (마이페이지 리다이렉트)
 * 3. 메인 페이지로 이동 후 AP_DATA_ISLOGIN 확인
 */
export async function pollForLogin(
  page: Page,
  context: BrowserContext,
  siteUrl: string,
  maxWaitMs: number,
): Promise<boolean> {
  const pollInterval = 5000; // 5초마다 확인
  const startTime = Date.now();
  let lastLog = 0;

  while (Date.now() - startTime < maxWaitMs) {
    // 30초마다 대기중 메시지
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    if (elapsed - lastLog >= 30) {
      console.log(`     ... 로그인 대기 중 (${elapsed}초 경과)`);
      lastLog = elapsed;
    }

    try {
      // 현재 페이지 URL 확인 - 로그인 후 리다이렉트 감지
      const currentUrl = page.url();
      if (currentUrl.includes('/account') && !currentUrl.includes('/login') && !currentUrl.includes('/register')) {
        return true; // 마이페이지로 리다이렉트됨 = 로그인 완료
      }

      // 현재 페이지에서 AP_DATA_ISLOGIN 체크
      const isLoginOnPage = await page.evaluate(() => {
        // window 체크
        const w = window as unknown as Record<string, unknown>;
        if (w['AP_DATA_ISLOGIN'] === 'Y' || w['ap_data_islogin'] === 'Y') return true;
        // dataLayer 체크
        const dl = w['dataLayer'];
        if (Array.isArray(dl)) {
          for (let i = dl.length - 1; i >= 0; i--) {
            const entry = dl[i] as Record<string, unknown> | undefined;
            if (!entry) continue;
            for (const key of Object.keys(entry)) {
              if (key.toLowerCase() === 'ap_data_islogin' && entry[key] === 'Y') return true;
            }
          }
        }
        return false;
      }).catch(() => false);

      if (isLoginOnPage) return true;

      // 메인 페이지에서 확인 (현재 페이지가 login 페이지가 아닐 때만)
      if (!currentUrl.includes('/login')) {
        const checkPage = await context.newPage();
        try {
          await checkPage.goto(siteUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await checkPage.waitForTimeout(2000);

          const isLoggedIn = await checkPage.evaluate(() => {
            const w = window as unknown as Record<string, unknown>;
            if (w['AP_DATA_ISLOGIN'] === 'Y' || w['ap_data_islogin'] === 'Y') return true;
            const dl = w['dataLayer'];
            if (Array.isArray(dl)) {
              for (let i = dl.length - 1; i >= 0; i--) {
                const entry = dl[i] as Record<string, unknown> | undefined;
                if (!entry) continue;
                for (const key of Object.keys(entry)) {
                  if (key.toLowerCase() === 'ap_data_islogin' && entry[key] === 'Y') return true;
                }
              }
            }
            return false;
          }).catch(() => false);

          await checkPage.close();
          if (isLoggedIn) return true;
        } catch {
          await checkPage.close().catch(() => {});
        }
      }
    } catch {
      // polling 중 에러는 무시하고 계속 대기
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  return false;
}
