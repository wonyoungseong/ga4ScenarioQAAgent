/**
 * 파라미터 값 예측기
 *
 * 화면(URL, DOM, viewport 등)을 분석하여 GA4 파라미터 값을 예측합니다.
 * 사이트별 매핑 설정 및 GTM 변수 체인 정보를 활용하여 정확도를 높입니다.
 */

import { Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { DataSourceType } from '../parsers/gtmVariableChainParser';
import { GTMConfigLoader, getGlobalGTMConfigLoader } from '../config/gtmConfigLoader';

export interface SiteConfig {
  domain: string;
  propertyId?: string;
  parameterMappings: Record<string, {
    value: string;
    description: string;
    globalVar?: string;
    predictionNote?: string;
  }>;
  pageTypePatterns?: Record<string, string[]>;
  breadcrumbPatterns?: Record<string, string>;
  channelDetection?: {
    mobileMaxWidth: number;
    tabletMaxWidth: number;
    mobileValue: string;
    tabletValue: string;
    pcValue: string;
  };
}

export interface PredictionResult {
  value: string | null;
  source: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  /** GTM에서 이 파라미터의 데이터 소스 정보 */
  gtmInfo?: {
    gtmVariable?: string;
    variableType?: string;
    dataSources: {
      type: DataSourceType;
      name: string;
      fallback?: string;
    }[];
    description: string;
  };
}

export interface ParameterPrediction {
  paramKey: string;
  prediction: PredictionResult;
  globalVarValue?: string | null;
  ga4CollectedValue?: string | null;
}

/**
 * 사이트별 설정 로드
 */
export function loadSiteConfig(domain: string): SiteConfig | null {
  const configPath = path.join(process.cwd(), 'config', 'site-parameter-mappings.json');

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    // 도메인 매칭 (서브도메인 포함)
    for (const [key, siteConfig] of Object.entries(config.sites)) {
      if (domain.includes(key)) {
        return siteConfig as SiteConfig;
      }
    }
  } catch (e) {
    console.error('사이트 설정 로드 실패:', e);
  }

  return null;
}

/**
 * 페이지 전역변수 추출
 */
export async function extractGlobalVariables(
  page: Page,
  varNames: string[]
): Promise<Record<string, string | null>> {
  return await page.evaluate((names) => {
    const variables: Record<string, string | null> = {};

    for (const varName of names) {
      const value = (window as any)[varName];
      variables[varName] = value !== undefined ? String(value) : null;
    }

    return variables;
  }, varNames);
}

/**
 * 파라미터 예측기 클래스
 */
export class ParameterPredictor {
  private siteConfig: SiteConfig | null = null;
  private url: string = '';
  private urlObj: URL | null = null;
  private gtmLoader: GTMConfigLoader | null = null;

  constructor(url: string, siteConfig?: SiteConfig | null, gtmLoader?: GTMConfigLoader | null) {
    this.url = url;
    this.urlObj = new URL(url);
    this.siteConfig = siteConfig ?? loadSiteConfig(this.urlObj.hostname);
    this.gtmLoader = gtmLoader ?? getGlobalGTMConfigLoader();
  }

  /**
   * 예측 결과에 GTM 소스 정보를 추가합니다.
   */
  private enrichWithGTMInfo(paramKey: string, result: PredictionResult): PredictionResult {
    if (!this.gtmLoader || !this.gtmLoader.isLoaded()) {
      return result;
    }

    const gtmInfo = this.gtmLoader.getParameterGTMInfo(paramKey);
    if (gtmInfo) {
      result.gtmInfo = gtmInfo;
    }

    return result;
  }

  /**
   * site_name 예측
   *
   * GTM 소스: AP_DATA_SITENAME (전역변수)
   */
  predictSiteName(): PredictionResult {
    let result: PredictionResult;

    if (this.siteConfig?.parameterMappings?.site_name) {
      result = {
        value: this.siteConfig.parameterMappings.site_name.value,
        source: `사이트 매핑 (${this.siteConfig.domain})`,
        confidence: 'HIGH'
      };
    } else if (this.urlObj) {
      // Fallback: URL 도메인에서 추출
      const domainParts = this.urlObj.hostname.replace('www.', '').split('.');
      result = {
        value: domainParts[0].toUpperCase(),
        source: 'URL 도메인 (매핑 없음, 추측)',
        confidence: 'LOW'
      };
    } else {
      result = { value: null, source: '예측 불가', confidence: 'LOW' };
    }

    return this.enrichWithGTMInfo('site_name', result);
  }

  /**
   * site_country 예측 (URL 경로에서 추출)
   *
   * GTM 소스: AP_DATA_COUNTRY (전역변수)
   */
  predictSiteCountry(): PredictionResult {
    let result: PredictionResult;

    const countryMatch = this.url.match(/\/([a-z]{2})\//i);
    if (countryMatch) {
      result = {
        value: countryMatch[1].toUpperCase(),
        source: `URL 경로 (/${countryMatch[1]}/)`,
        confidence: 'HIGH'
      };
    } else {
      result = { value: null, source: 'URL에서 국가 코드 없음', confidence: 'LOW' };
    }

    return this.enrichWithGTMInfo('site_country', result);
  }

  /**
   * site_language 예측
   *
   * GTM 소스: AP_DATA_LANG (전역변수)
   */
  async predictSiteLanguage(page?: Page): Promise<PredictionResult> {
    let result: PredictionResult;

    // URL 경로에서 추출
    const langMatch = this.url.match(/\/[a-z]{2}\/([a-z]{2})\//i);
    if (langMatch) {
      result = {
        value: langMatch[1].toUpperCase(),
        source: `URL 경로 (/${langMatch[1]}/)`,
        confidence: 'HIGH'
      };
    } else if (page) {
      // HTML lang 속성 확인
      const htmlLang = await page.evaluate(() => document.documentElement.lang);
      if (htmlLang) {
        result = {
          value: htmlLang.split('-')[0].toUpperCase(),
          source: 'HTML lang 속성',
          confidence: 'MEDIUM'
        };
      } else {
        result = { value: null, source: '언어 정보 없음', confidence: 'LOW' };
      }
    } else {
      result = { value: null, source: '언어 정보 없음', confidence: 'LOW' };
    }

    return this.enrichWithGTMInfo('site_language', result);
  }

  /**
   * site_env 예측 (URL 호스트명으로 판단)
   *
   * GTM 소스: AP_DATA_ENV (전역변수), fallback: Page Hostname
   */
  predictSiteEnv(): PredictionResult {
    let result: PredictionResult;

    if (!this.urlObj) {
      result = { value: null, source: 'URL 파싱 실패', confidence: 'LOW' };
    } else {
      const hostname = this.urlObj.hostname;

      if (hostname.includes('dev.') || hostname.includes('-dev') || hostname.includes('dev-')) {
        result = { value: 'DEV', source: 'URL 호스트명 (dev)', confidence: 'HIGH' };
      } else if (hostname.includes('stg.') || hostname.includes('-stg') || hostname.includes('staging')) {
        result = { value: 'STG', source: 'URL 호스트명 (stg)', confidence: 'HIGH' };
      } else if (hostname.includes('qa.') || hostname.includes('-qa')) {
        result = { value: 'QA', source: 'URL 호스트명 (qa)', confidence: 'HIGH' };
      } else {
        result = { value: 'PRD', source: 'URL 호스트명 (프로덕션)', confidence: 'HIGH' };
      }
    }

    return this.enrichWithGTMInfo('site_env', result);
  }

  /**
   * content_group (page_type) 예측
   *
   * GTM 소스: LT - Content Group (Lookup Table)
   *   - Input: {{JS - Content Group}} → AP_DATA_PAGETYPE (전역변수)
   *
   * 주의: 정확한 예측을 위해서는 URL별 content_group 매핑 기획서가 필요합니다.
   * pageTypePatterns이 설정된 경우에만 신뢰도 MEDIUM, 그 외에는 LOW입니다.
   */
  predictContentGroup(): PredictionResult {
    let result: PredictionResult;

    if (!this.urlObj) {
      result = { value: null, source: 'URL 파싱 실패', confidence: 'LOW' };
    } else {
      const pathname = this.urlObj.pathname;

      // 사이트별 패턴 매칭 (기획서 기반 설정이 있는 경우)
      if (this.siteConfig?.pageTypePatterns) {
        for (const [pageType, patterns] of Object.entries(this.siteConfig.pageTypePatterns)) {
          for (const pattern of patterns) {
            if (pathname.includes(pattern)) {
              result = {
                value: pageType,
                source: `사이트 패턴 매핑 (${pattern}) - 기획서 확인 필요`,
                confidence: 'MEDIUM'
              };
              return this.enrichWithGTMInfo('content_group', result);
            }
          }
        }
      }

      // 기본 패턴 매칭 (기획서 없이 URL 추측 - 낮은 신뢰도)
      const pathSegments = pathname.toLowerCase().split('/').filter(s => s);

      const patterns: [string[], string, string][] = [
        [['main', 'home'], 'MAIN', 'URL 경로 추측 (main/home)'],
        [['product', 'prd', 'p'], 'PRODUCT_DETAIL', 'URL 경로 추측 (product)'],
        [['category', 'ctg', 'c', 'list'], 'PRODUCT_LIST', 'URL 경로 추측 (category/list)'],
        [['cart', 'basket'], 'CART', 'URL 경로 추측 (cart)'],
        [['order', 'checkout'], 'ORDER', 'URL 경로 추측 (order)'],
        [['search'], 'SEARCH_RESULT', 'URL 경로 추측 (search)'],
        [['my', 'mypage', 'account'], 'MY', 'URL 경로 추측 (my)'],
        [['login', 'signin'], 'LOGIN', 'URL 경로 추측 (login)'],
        [['join', 'signup', 'register'], 'JOIN', 'URL 경로 추측 (join)'],
        [['event', 'promotion'], 'EVENT_DETAIL', 'URL 경로 추측 (event)'],
      ];

      for (const [keywords, pageType, source] of patterns) {
        if (keywords.some(kw => pathSegments.includes(kw))) {
          result = {
            value: pageType,
            source: `${source} - ⚠️ URL별 content_group 매핑 기획서 필요`,
            confidence: 'LOW'
          };
          return this.enrichWithGTMInfo('content_group', result);
        }
      }

      // 루트 경로
      if (pathname === '/' || pathSegments.length === 0) {
        result = {
          value: 'MAIN',
          source: 'URL 루트 경로 추측 - ⚠️ URL별 content_group 매핑 기획서 필요',
          confidence: 'LOW'
        };
      } else {
        result = {
          value: null,
          source: '⚠️ URL별 content_group 매핑 기획서 필요 (예측 불가)',
          confidence: 'LOW'
        };
      }
    }

    return this.enrichWithGTMInfo('content_group', result);
  }

  /**
   * breadcrumb 예측 (page_location_1~5로 대체됨)
   *
   * GTM 소스: JS - Page Location 1~5 → Page URL에서 추출
   *
   * 주의: 정확한 예측을 위해서는 URL별 breadcrumb 매핑 기획서가 필요합니다.
   * breadcrumbPatterns이 설정된 경우에만 신뢰도 MEDIUM, 그 외에는 LOW입니다.
   */
  async predictBreadcrumb(page: Page): Promise<PredictionResult> {
    let result: PredictionResult;

    // 1. 사이트별 breadcrumb 패턴 매핑 (기획서 기반 설정이 있는 경우)
    const pageType = this.predictContentGroup();
    if (this.siteConfig?.breadcrumbPatterns && pageType.value) {
      const mappedBreadcrumb = this.siteConfig.breadcrumbPatterns[pageType.value];
      if (mappedBreadcrumb) {
        result = {
          value: mappedBreadcrumb,
          source: `사이트 breadcrumb 매핑 (${pageType.value}) - 기획서 확인 필요`,
          confidence: 'MEDIUM'
        };
        return this.enrichWithGTMInfo('page_location_1', result);
      }
    }

    // 2. DOM에서 breadcrumb 요소 검색 (Fallback - 낮은 신뢰도)
    const breadcrumb = await page.evaluate(() => {
      const selectors = [
        '.breadcrumb', '.breadcrumbs', '[class*="bread"]',
        'nav[aria-label="breadcrumb"]', '.gnb-path', '.location',
        '[class*="path"]', '[class*="navigation"]'
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
      result = {
        value: breadcrumb,
        source: 'DOM breadcrumb 요소 - ⚠️ URL별 breadcrumb 매핑 기획서 필요',
        confidence: 'LOW'
      };
    } else {
      result = {
        value: null,
        source: '⚠️ URL별 breadcrumb 매핑 기획서 필요 (예측 불가)',
        confidence: 'LOW'
      };
    }

    return this.enrichWithGTMInfo('page_location_1', result);
  }

  /**
   * login_is_login 예측 (DOM 분석 - 개선된 버전)
   *
   * GTM 소스: AP_DATA_ISLOGIN (전역변수)
   *
   * 아모레몰의 경우 헤더에 "로그인" 텍스트가 있으면 비로그인,
   * "마이페이지" 또는 사용자 이름이 있으면 로그인 상태
   */
  async predictLoginStatus(page: Page): Promise<PredictionResult> {
    let result: PredictionResult;

    const loginStatus = await page.evaluate(() => {
      // 1. 헤더 영역에서 텍스트로 판단 (가장 신뢰도 높음)
      const headerText = document.querySelector('header')?.textContent || '';

      // "로그인" 텍스트가 있으면 비로그인 (로그인 버튼이 노출됨)
      if (headerText.includes('로그인') && !headerText.includes('로그아웃')) {
        return { status: 'N', source: 'header-login-text' };
      }

      // "로그아웃" 텍스트가 있으면 로그인
      if (headerText.includes('로그아웃')) {
        return { status: 'Y', source: 'header-logout-text' };
      }

      // 2. 쿠키 기반 판단 (보조 수단)
      const cookies = document.cookie;
      if (cookies.includes('login=') || cookies.includes('auth=') || cookies.includes('member=')) {
        return { status: 'Y', source: 'cookie-check' };
      }

      // 3. 특정 DOM 요소로 판단 (Fallback)
      // 명확한 로그아웃 버튼 (aria-label 등 사용)
      const logoutBtn = document.querySelector('[aria-label*="로그아웃"]') ||
                        document.querySelector('button[class*="logout"]') ||
                        document.querySelector('a[href*="logout"]');
      if (logoutBtn) {
        return { status: 'Y', source: 'logout-button' };
      }

      // 명확한 로그인 버튼/링크
      const loginBtn = document.querySelector('[aria-label*="로그인"]') ||
                       document.querySelector('a[href*="/login"]') ||
                       document.querySelector('button[class*="login"]:not([class*="logout"])');
      if (loginBtn) {
        return { status: 'N', source: 'login-button' };
      }

      return null;
    });

    if (loginStatus) {
      const sourceMap: Record<string, string> = {
        'header-login-text': '헤더 "로그인" 텍스트 확인',
        'header-logout-text': '헤더 "로그아웃" 텍스트 확인',
        'cookie-check': '로그인 쿠키 감지',
        'logout-button': '로그아웃 버튼 감지',
        'login-button': '로그인 버튼 감지',
      };

      result = {
        value: loginStatus.status,
        source: sourceMap[loginStatus.source] || loginStatus.source,
        confidence: loginStatus.source.includes('header') ? 'HIGH' : 'MEDIUM'
      };
    } else {
      // 기본값: 새 브라우저 세션은 비로그인
      result = {
        value: 'N',
        source: '새 브라우저 세션 (비로그인 가정)',
        confidence: 'MEDIUM'
      };
    }

    return this.enrichWithGTMInfo('login_is_login', result);
  }

  /**
   * channel 예측 (User-Agent 기반)
   *
   * GTM 소스: AP_DATA_CHANNEL (전역변수)
   */
  async predictChannel(page: Page): Promise<PredictionResult> {
    let result: PredictionResult;

    const userAgent = await page.evaluate(() => navigator.userAgent);

    if (!userAgent) {
      result = { value: null, source: 'User-Agent 정보 없음', confidence: 'LOW' };
    } else {
      const config = this.siteConfig?.channelDetection || {
        mobileValue: 'MOBILE',
        tabletValue: 'TABLET',
        pcValue: 'PC'
      };

      // 모바일 기기 감지 (스마트폰)
      const mobilePatterns = [
        /iphone/i,
        /android.*mobile/i,
        /windows phone/i,
        /blackberry/i,
        /opera mini/i,
        /mobile safari/i
      ];

      // 태블릿 기기 감지
      const tabletPatterns = [
        /ipad/i,
        /android(?!.*mobile)/i,  // Android but not mobile
        /tablet/i,
        /kindle/i,
        /silk/i,
        /playbook/i
      ];

      let matched = false;
      for (const pattern of mobilePatterns) {
        if (pattern.test(userAgent)) {
          result = {
            value: config.mobileValue,
            source: `User-Agent 모바일 감지 (${pattern.source})`,
            confidence: 'HIGH'
          };
          matched = true;
          break;
        }
      }

      if (!matched) {
        for (const pattern of tabletPatterns) {
          if (pattern.test(userAgent)) {
            result = {
              value: config.tabletValue,
              source: `User-Agent 태블릿 감지 (${pattern.source})`,
              confidence: 'HIGH'
            };
            matched = true;
            break;
          }
        }
      }

      if (!matched) {
        result = {
          value: config.pcValue,
          source: `User-Agent PC 판단 (데스크톱 브라우저)`,
          confidence: 'HIGH'
        };
      }
    }

    return this.enrichWithGTMInfo('channel', result!);
  }

  /**
   * page_view 이벤트의 모든 파라미터 예측
   */
  async predictPageViewParams(page: Page): Promise<Record<string, PredictionResult>> {
    const predictions: Record<string, PredictionResult> = {};

    predictions['site_name'] = this.predictSiteName();
    predictions['site_country'] = this.predictSiteCountry();
    predictions['site_language'] = await this.predictSiteLanguage(page);
    predictions['site_env'] = this.predictSiteEnv();
    predictions['content_group'] = this.predictContentGroup();
    predictions['breadcrumb'] = await this.predictBreadcrumb(page);
    predictions['login_is_login'] = await this.predictLoginStatus(page);
    predictions['channel'] = await this.predictChannel(page);

    return predictions;
  }

  /**
   * 예측 vs 실제 값 비교
   */
  comparePrediction(
    predicted: string | null,
    actual: string | null
  ): 'EXACT' | 'PARTIAL' | 'MISMATCH' | 'NOT_COLLECTED' | 'UNKNOWN' {
    if (!actual) return 'NOT_COLLECTED';
    if (predicted === null) return 'UNKNOWN';

    if (predicted.toUpperCase() === actual.toUpperCase()) {
      return 'EXACT';
    }

    if (actual.toUpperCase().includes(predicted.toUpperCase()) ||
        predicted.toUpperCase().includes(actual.toUpperCase())) {
      return 'PARTIAL';
    }

    return 'MISMATCH';
  }
}

/**
 * GA4 요청에서 이벤트 파라미터 추출
 */
export function extractGA4EventParams(
  ga4Requests: Array<{ url: string; postData?: string }>,
  eventName: string
): Record<string, string | null> {
  const params: Record<string, string | null> = {};

  for (const req of ga4Requests) {
    try {
      const urlObj = new URL(req.url);
      const en = urlObj.searchParams.get('en');

      if (en === eventName) {
        // ep.* (event parameter) 추출
        for (const [key, value] of urlObj.searchParams.entries()) {
          if (key.startsWith('ep.')) {
            const paramName = key.replace('ep.', '');
            params[paramName] = decodeURIComponent(value);
          }
        }
        break;
      }
    } catch (e) {
      // URL 파싱 오류 무시
    }
  }

  return params;
}

export default ParameterPredictor;
