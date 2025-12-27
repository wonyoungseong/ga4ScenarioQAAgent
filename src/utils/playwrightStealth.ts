/**
 * Playwright Stealth Mode
 *
 * 봇 감지를 우회하기 위한 브라우저 설정
 */

import { BrowserContext, Page } from 'playwright';

/**
 * Stealth 스크립트 - navigator.webdriver 숨기기 및 기타 봇 감지 우회
 */
const STEALTH_SCRIPTS = `
// navigator.webdriver 숨기기
Object.defineProperty(navigator, 'webdriver', {
  get: () => undefined,
});

// Chrome 관련 속성 추가
window.chrome = {
  runtime: {},
  loadTimes: function() {},
  csi: function() {},
  app: {}
};

// permissions.query 오버라이드
const originalQuery = window.navigator.permissions.query;
window.navigator.permissions.query = (parameters) => (
  parameters.name === 'notifications' ?
    Promise.resolve({ state: Notification.permission }) :
    originalQuery(parameters)
);

// plugins 배열 설정
Object.defineProperty(navigator, 'plugins', {
  get: () => [
    {
      0: { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' },
      description: 'Portable Document Format',
      filename: 'internal-pdf-viewer',
      length: 1,
      name: 'Chrome PDF Plugin'
    },
    {
      0: { type: 'application/pdf', suffixes: 'pdf', description: '' },
      description: '',
      filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
      length: 1,
      name: 'Chrome PDF Viewer'
    }
  ],
});

// languages 설정
Object.defineProperty(navigator, 'languages', {
  get: () => ['ko-KR', 'ko', 'en-US', 'en'],
});

// platform 설정
Object.defineProperty(navigator, 'platform', {
  get: () => 'Win32',
});

// hardwareConcurrency 설정
Object.defineProperty(navigator, 'hardwareConcurrency', {
  get: () => 8,
});

// deviceMemory 설정
Object.defineProperty(navigator, 'deviceMemory', {
  get: () => 8,
});

// WebGL vendor/renderer 설정
const getParameter = WebGLRenderingContext.prototype.getParameter;
WebGLRenderingContext.prototype.getParameter = function(parameter) {
  if (parameter === 37445) {
    return 'Intel Inc.';
  }
  if (parameter === 37446) {
    return 'Intel Iris OpenGL Engine';
  }
  return getParameter.apply(this, arguments);
};

// Connection 정보 설정
Object.defineProperty(navigator, 'connection', {
  get: () => ({
    effectiveType: '4g',
    rtt: 50,
    downlink: 10,
    saveData: false
  }),
});

// 콘솔 디버그 모드 숨기기
const consoleDebug = console.debug;
console.debug = function(...args) {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('puppeteer')) {
    return;
  }
  return consoleDebug.apply(this, args);
};
`;

/**
 * 페이지에 Stealth 스크립트 적용
 */
export async function applyStealthToPage(page: Page): Promise<void> {
  await page.addInitScript(STEALTH_SCRIPTS);
}

/**
 * 컨텍스트에 Stealth 설정 적용
 */
export async function applyStealthToContext(context: BrowserContext): Promise<void> {
  await context.addInitScript(STEALTH_SCRIPTS);
}

/**
 * Stealth 브라우저 실행 옵션
 */
export const STEALTH_LAUNCH_OPTIONS = {
  headless: true,
  args: [
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-accelerated-2d-canvas',
    '--disable-gpu',
    '--window-size=1920,1080',
    '--start-maximized',
    '--disable-infobars',
    '--disable-extensions',
    '--disable-plugins-discovery',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-breakpad',
    '--disable-component-extensions-with-background-pages',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-hang-monitor',
    '--disable-ipc-flooding-protection',
    '--disable-popup-blocking',
    '--disable-prompt-on-repost',
    '--disable-renderer-backgrounding',
    '--disable-sync',
    '--enable-features=NetworkService,NetworkServiceInProcess',
    '--force-color-profile=srgb',
    '--metrics-recording-only',
    '--no-first-run',
    '--password-store=basic',
    '--use-mock-keychain',
    '--lang=ko-KR'
  ]
};

/**
 * 아모레몰 Content Group별 접근 가능한 URL 패턴
 * WAF가 특정 URL 패턴을 차단하므로 대체 URL 사용
 *
 * 차단되는 패턴: /prd/detail/, /display/gnb/category/
 * 허용되는 패턴: /product/detail?, /display/category?, /display/main 등
 */
export const AMOREMALL_URL_PATTERNS: Record<string, string> = {
  'MAIN': 'https://www.amoremall.com/kr/ko/display/main',
  'PRODUCT_DETAIL': 'https://www.amoremall.com/kr/ko/product/detail?onlineProdSn=67282&onlineProdCode=111650001115',
  'PRODUCT_LIST': 'https://www.amoremall.com/kr/ko/display/category?displayCategorySn=126',
  'SEARCH_RESULT': 'https://www.amoremall.com/kr/ko/display/search/main?keyword=설화수',
  'BRAND_MAIN': 'https://www.amoremall.com/kr/ko/display/brand',
  'EVENT_LIST': 'https://www.amoremall.com/kr/ko/display/event',
  'EVENT_DETAIL': 'https://www.amoremall.com/kr/ko/display/event',
  'LIVE_LIST': 'https://www.amoremall.com/kr/ko/display/live',
  'LIVE_DETAIL': 'https://www.amoremall.com/kr/ko/display/live/player?sy_id=691d716b1ccf98049b711174',
};

/**
 * URL이 아모레몰인지 확인
 */
export function isAmoremallUrl(url: string): boolean {
  return url.includes('amoremall.com');
}

/**
 * 아모레몰 Content Group에 대한 접근 가능한 URL 반환
 */
export function getAccessibleAmoremallUrl(contentGroup: string): string | null {
  return AMOREMALL_URL_PATTERNS[contentGroup] || null;
}

/**
 * Stealth 컨텍스트 옵션
 */
export const STEALTH_CONTEXT_OPTIONS = {
  viewport: { width: 1920, height: 1080 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
  geolocation: { latitude: 37.5665, longitude: 126.9780 },  // Seoul
  permissions: ['geolocation'],
  extraHTTPHeaders: {
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'max-age=0',
    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
  }
};
