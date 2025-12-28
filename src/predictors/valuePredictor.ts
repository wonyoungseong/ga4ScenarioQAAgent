/**
 * page_view 파라미터 Value 예측기
 *
 * YAML 규칙 기반으로 파라미터 값을 예측합니다.
 * Vision AI와 시나리오 에이전트가 사용합니다.
 *
 * 예측 유형:
 * - url_domain_mapping: URL 도메인으로 site_name 매핑
 * - url_extraction: URL에서 country, language 추출
 * - url_pattern: URL 패턴으로 site_env 결정
 * - user_agent: User-Agent로 channel 결정
 * - url_pattern_and_vision: URL + Vision AI로 content_group 결정
 * - login_state: 로그인 상태 감지
 * - browser_auto: 브라우저 자동 (예측 불필요)
 * - internal_logic: 내부 로직 (기본값 사용)
 * - url_split: Full URL을 100자씩 분할
 * - login_only: 로그인 시에만 값 존재
 * - page_conditional: 특정 페이지 타입에서만 값 존재
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

/**
 * 예측 컨텍스트 - 예측에 필요한 모든 정보
 */
export interface PredictionContext {
  /** 페이지 URL (필수) */
  url: string;
  /** User-Agent (선택, PC 기본) */
  userAgent?: string;
  /** 로그인 여부 (선택) */
  isLoggedIn?: boolean;
  /** Vision AI가 감지한 페이지 타입 (선택) */
  visionPageType?: string;
  /** Vision AI가 감지한 정보들 */
  visionData?: {
    productName?: string;
    productBrand?: string;
    productCategory?: string;
    eventName?: string;
    brandName?: string;
    storeName?: string;
    searchBrand?: string;
    isOutOfStock?: boolean;
  };
  /** 페이지 title (선택) */
  pageTitle?: string;
  /** html lang 속성 (선택) */
  htmlLang?: string;
}

/**
 * 예측 결과
 */
export interface PredictionResult {
  key: string;
  predictedValue: string | null;
  confidence: 'high' | 'medium' | 'low' | 'skip';
  predictionType: string;
  condition?: string;
  notes?: string;
}

/**
 * 사이트 도메인 → site_name 매핑
 * 2025-12-19 GA4 검증 완료 (100% 정확도)
 */
const SITE_NAME_MAP: Record<string, string> = {
  // 아모레퍼시픽 주요 브랜드
  'amoremall.com': 'APMALL',
  'innisfree.com': 'INNISFREE',
  'sulwhasoo.com': 'SULWHASOO',
  'etudehouse.com': 'ETUDE',
  'laneige.com': 'LANEIGE',
  'hera.com': 'HERA',
  'iope.com': 'IOPE',
  'mamonde.com': 'MAMONDE',
  'espoir.com': 'ESPOIR',
  'aritaum.com': 'ARITAUM',
  'osulloc.com': 'OSULLOC',
  // GA4 검증으로 추가된 사이트들
  'laboh.co.kr': 'LABOH',
  'ayunchepro.com': 'AYUNCHEPRO',
  'illiyoon.com': 'ILLIYOON',
  'brdy.co.kr': 'BRDY',
  'aestura.com': 'AESTURA',
  'aditshop.com': 'ADITSHOP',
  'ayunche.com': 'AYUNCHE',
  'amospro.com': 'AMOSPRO',
  'makeonshop.co.kr': 'MAKEON',
};

/**
 * URL에서 country 코드 추출
 */
const COUNTRY_PATTERNS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\/kr\//i, value: 'KR' },
  { pattern: /\/jp\//i, value: 'JP' },
  { pattern: /\/cn\//i, value: 'CN' },
  { pattern: /\/us\//i, value: 'US' },
  { pattern: /\/my\//i, value: 'MY' },
  { pattern: /\/sg\//i, value: 'SG' },
  { pattern: /\/th\//i, value: 'TH' },
  { pattern: /\/vn\//i, value: 'VN' },
  { pattern: /\/id\//i, value: 'ID' },
  { pattern: /\/tw\//i, value: 'TW' },
  { pattern: /\/hk\//i, value: 'HK' },
  { pattern: /\/au\//i, value: 'AU' },
  { pattern: /\.co\.kr/i, value: 'KR' },
  { pattern: /\.com\.cn/i, value: 'CN' },
  { pattern: /\.co\.jp/i, value: 'JP' },
];

/**
 * 언어 → 국가 추론 매핑
 * URL에 국가 코드가 없을 때, 언어로 국가를 추론
 * 2025-12-19 개발변수 검증으로 확인됨
 */
const LANGUAGE_TO_COUNTRY_MAP: Record<string, string> = {
  'KO': 'KR',  // 한국어 → 한국
  'JA': 'JP',  // 일본어 → 일본
  'ZH': 'CN',  // 중국어 → 중국 (기본)
  'EN': 'US',  // 영어 → 미국 (기본)
  'VI': 'VN',  // 베트남어 → 베트남
  'TH': 'TH',  // 태국어 → 태국
  'ID': 'ID',  // 인도네시아어 → 인도네시아
};

/**
 * URL에서 language 코드 추출
 * - /ko/ 패턴: 경로 중간
 * - /ko$ 패턴: 경로 끝 (예: osulloc.com/kr/ko)
 */
const LANGUAGE_PATTERNS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\/ko(?:\/|$|\?)/i, value: 'KO' },  // /ko/ 또는 /ko로 끝남 또는 /ko?로 쿼리 시작
  { pattern: /\/en(?:\/|$|\?)/i, value: 'EN' },
  { pattern: /\/ja(?:\/|$|\?)/i, value: 'JA' },
  { pattern: /\/zh(?:\/|$|\?)/i, value: 'ZH' },
  { pattern: /\/vi(?:\/|$|\?)/i, value: 'VI' },
  { pattern: /\/th(?:\/|$|\?)/i, value: 'TH' },
  { pattern: /\/id(?:\/|$|\?)/i, value: 'ID' },
];

/**
 * content_group URL 패턴
 */
const CONTENT_GROUP_PATTERNS: Array<{ pattern: RegExp; value: string; priority: number }> = [
  { pattern: /\/display\/main/i, value: 'MAIN', priority: 10 },
  { pattern: /\/main\.do/i, value: 'MAIN', priority: 10 },
  { pattern: /\/index\.html?$/i, value: 'MAIN', priority: 5 },
  { pattern: /\/product\/[^/]+/i, value: 'PRODUCT_DETAIL', priority: 10 },
  { pattern: /\/(goods|item)\/\d+/i, value: 'PRODUCT_DETAIL', priority: 10 },
  { pattern: /\/display\/category/i, value: 'PRODUCT_LIST', priority: 10 },
  { pattern: /\/category\//i, value: 'PRODUCT_LIST', priority: 8 },
  { pattern: /\/search/i, value: 'SEARCH_RESULT', priority: 10 },
  { pattern: /\/brand\/[^/]+/i, value: 'BRAND_MAIN', priority: 10 },
  { pattern: /\/cart/i, value: 'CART', priority: 10 },
  { pattern: /\/order\/complete/i, value: 'ORDER_COMPLETE', priority: 15 },
  { pattern: /\/order/i, value: 'ORDER', priority: 10 },
  { pattern: /\/mypage/i, value: 'MY', priority: 10 },
  { pattern: /\/my\//i, value: 'MY', priority: 8 },
  { pattern: /\/event\/[^/]+/i, value: 'EVENT_DETAIL', priority: 10 },
  { pattern: /\/event\/?$/i, value: 'EVENT_LIST', priority: 8 },
  { pattern: /\/live\/[^/]+/i, value: 'LIVE_DETAIL', priority: 10 },
  { pattern: /\/live\/?$/i, value: 'LIVE_LIST', priority: 8 },
];

/**
 * Value 예측기 클래스
 */
export class ValuePredictor {
  private rulesPath: string;
  private rules: any = null;

  constructor(rulesPath?: string) {
    this.rulesPath = rulesPath || path.join(
      process.cwd(),
      'specs/sites/amorepacific_GTM-5FK5X5C4/rules/value_prediction_rules.yaml'
    );
  }

  /**
   * 규칙 로드
   */
  private loadRules(): any {
    if (this.rules) return this.rules;

    if (!fs.existsSync(this.rulesPath)) {
      console.warn(`⚠️ 예측 규칙 파일 없음: ${this.rulesPath}`);
      return null;
    }

    const content = fs.readFileSync(this.rulesPath, 'utf-8');
    this.rules = yaml.load(content);
    return this.rules;
  }

  /**
   * 전체 파라미터 값 예측
   */
  predictAll(context: PredictionContext): PredictionResult[] {
    const results: PredictionResult[] = [];

    // Event Parameters (35개)
    results.push(this.predictSiteName(context));
    results.push(this.predictSiteCountry(context));
    results.push(this.predictSiteLanguage(context));
    results.push(this.predictSiteEnv(context));
    results.push(this.predictChannel(context));
    results.push(this.predictContentGroup(context));
    results.push(this.predictLoginIsLogin(context));
    results.push(this.predictUserAgent(context));
    results.push(this.predictTrafficType(context));
    results.push(this.predictPageReferrer(context));
    results.push(this.predictBreadcrumb(context));

    // page_location_1~5 - GTM 내부에서 breadcrumb 분할 처리됨
    const pageLocations = this.predictPageLocations(context);
    results.push(...pageLocations);

    // 로그인 ID 관련 (6개)
    results.push(this.predictLoginIdGcid(context));
    results.push(this.predictLoginIdCid(context));
    results.push(this.predictLoginIdGcid1(context));
    results.push(this.predictLoginIdGcid2(context));
    results.push(this.predictLoginIdCid1(context));
    results.push(this.predictLoginIdCid2(context));

    // 페이지 조건부 파라미터 (14개)
    const conditionalParams = this.predictConditionalParams(context);
    results.push(...conditionalParams);

    // User Properties (10개)
    const userProps = this.predictUserProperties(context);
    results.push(...userProps);

    return results;
  }

  // ============================================================================
  // 개별 예측 메서드들
  // ============================================================================

  /**
   * 1. site_name - URL 도메인 매핑
   */
  predictSiteName(context: PredictionContext): PredictionResult {
    try {
      const url = new URL(context.url);
      const hostname = url.hostname.replace('www.', '');

      for (const [domain, siteName] of Object.entries(SITE_NAME_MAP)) {
        if (hostname.includes(domain)) {
          return {
            key: 'site_name',
            predictedValue: siteName,
            confidence: 'high',
            predictionType: 'url_domain_mapping',
          };
        }
      }

      // 도메인에서 추론
      const parts = hostname.split('.');
      const name = parts[0].toUpperCase();
      return {
        key: 'site_name',
        predictedValue: name,
        confidence: 'low',
        predictionType: 'url_domain_mapping',
        notes: '도메인에서 추론됨',
      };
    } catch {
      return {
        key: 'site_name',
        predictedValue: null,
        confidence: 'low',
        predictionType: 'url_domain_mapping',
        notes: 'URL 파싱 실패',
      };
    }
  }

  /**
   * 2. site_country - URL에서 추출
   */
  predictSiteCountry(context: PredictionContext): PredictionResult {
    const url = context.url.toLowerCase();

    // INT + EN = GL 규칙
    if (url.includes('/int/')) {
      const lang = this.extractLanguageFromUrl(context.url);
      if (lang === 'EN') {
        return {
          key: 'site_country',
          predictedValue: 'GL',
          confidence: 'high',
          predictionType: 'url_extraction',
          notes: 'INT + EN = GL',
        };
      }
    }

    // URL 패턴 매칭
    for (const { pattern, value } of COUNTRY_PATTERNS) {
      if (pattern.test(context.url)) {
        return {
          key: 'site_country',
          predictedValue: value,
          confidence: 'high',
          predictionType: 'url_extraction',
        };
      }
    }

    // html lang에서 언어 확인 후 국가 추론 (2025-12-19 검증됨)
    if (context.htmlLang) {
      // html lang에서 직접 국가 코드 추출 (ko-KR, en-US 형식)
      const countryFromLang = context.htmlLang.split('-')[1]?.toUpperCase();
      if (countryFromLang) {
        return {
          key: 'site_country',
          predictedValue: countryFromLang,
          confidence: 'high',
          predictionType: 'url_extraction',
          notes: 'html lang에서 국가 코드 추출',
        };
      }

      // 언어만 있으면 언어로 국가 추론 (ko → KR)
      const langCode = context.htmlLang.split('-')[0]?.toUpperCase();
      const inferredCountry = LANGUAGE_TO_COUNTRY_MAP[langCode];
      if (inferredCountry) {
        return {
          key: 'site_country',
          predictedValue: inferredCountry,
          confidence: 'medium',
          predictionType: 'url_extraction',
          notes: `언어(${langCode})에서 국가 추론`,
        };
      }
    }

    return {
      key: 'site_country',
      predictedValue: null,
      confidence: 'low',
      predictionType: 'url_extraction',
      notes: 'URL에서 국가 코드를 찾을 수 없음',
    };
  }

  /**
   * URL에서 언어 코드 추출 (헬퍼)
   */
  private extractLanguageFromUrl(url: string): string | null {
    for (const { pattern, value } of LANGUAGE_PATTERNS) {
      if (pattern.test(url)) {
        return value;
      }
    }
    return null;
  }

  /**
   * 3. site_language - URL에서 추출
   */
  predictSiteLanguage(context: PredictionContext): PredictionResult {
    const lang = this.extractLanguageFromUrl(context.url);
    if (lang) {
      return {
        key: 'site_language',
        predictedValue: lang,
        confidence: 'high',
        predictionType: 'url_extraction',
      };
    }

    // html lang에서 언어 추출 (2025-12-19 검증됨)
    if (context.htmlLang) {
      const htmlLang = context.htmlLang.split('-')[0]?.toUpperCase();
      if (htmlLang) {
        return {
          key: 'site_language',
          predictedValue: htmlLang,
          confidence: 'high',
          predictionType: 'url_extraction',
          notes: 'html lang에서 추출',
        };
      }
    }

    return {
      key: 'site_language',
      predictedValue: null,
      confidence: 'low',
      predictionType: 'url_extraction',
      notes: 'URL에서 언어 코드를 찾을 수 없음',
    };
  }

  /**
   * 4. site_env - URL 패턴으로 환경 감지
   *
   * 호스트명 패턴 예시:
   * - stg1-fo.innisfree.com → STG
   * - stg1-m.innisfree.com → STG
   * - qa-www.amoremall.com → QA
   * - dev.amoremall.com → DEV
   * - www.amoremall.com → PRD
   */
  predictSiteEnv(context: PredictionContext): PredictionResult {
    const url = context.url.toLowerCase();

    // 호스트명에서 환경 감지 (우선순위 높음)
    try {
      const hostname = new URL(context.url).hostname.toLowerCase();

      // STG 패턴: stg, stg1-, stg2-, staging
      if (/^stg\d*[-.]|^staging[-.]|[-.]stg\d*[-.]|[-.]staging[-.]/.test(hostname)) {
        return {
          key: 'site_env',
          predictedValue: 'STG',
          confidence: 'high',
          predictionType: 'url_pattern',
          notes: `호스트명 패턴: ${hostname}`,
        };
      }

      // QA 패턴: qa, qa1-, qa2-
      if (/^qa\d*[-.]|[-.]qa\d*[-.]/.test(hostname)) {
        return {
          key: 'site_env',
          predictedValue: 'QA',
          confidence: 'high',
          predictionType: 'url_pattern',
          notes: `호스트명 패턴: ${hostname}`,
        };
      }

      // DEV 패턴: dev, dev1-, dev2-, develop
      if (/^dev\d*[-.]|^develop[-.]|[-.]dev\d*[-.]/.test(hostname)) {
        return {
          key: 'site_env',
          predictedValue: 'DEV',
          confidence: 'high',
          predictionType: 'url_pattern',
          notes: `호스트명 패턴: ${hostname}`,
        };
      }

      // LOCAL 패턴
      if (/^localhost|^127\.0\.0\.1|^local[-.]/.test(hostname)) {
        return {
          key: 'site_env',
          predictedValue: 'LOCAL',
          confidence: 'high',
          predictionType: 'url_pattern',
          notes: `로컬 환경: ${hostname}`,
        };
      }

      // BETA 패턴
      if (/^beta\d*[-.]|[-.]beta\d*[-.]/.test(hostname)) {
        return {
          key: 'site_env',
          predictedValue: 'BETA',
          confidence: 'high',
          predictionType: 'url_pattern',
          notes: `호스트명 패턴: ${hostname}`,
        };
      }

      // TEST 패턴 → DEV로 처리
      if (/^test\d*[-.]|[-.]test\d*[-.]/.test(hostname)) {
        return {
          key: 'site_env',
          predictedValue: 'DEV',
          confidence: 'high',
          predictionType: 'url_pattern',
          notes: `테스트 환경: ${hostname}`,
        };
      }
    } catch {
      // URL 파싱 실패 시 폴백
    }

    // 경로 패턴 폴백
    const pathPatterns = [
      { pattern: /\/dev\//i, value: 'DEV' },
      { pattern: /\/stg\//i, value: 'STG' },
      { pattern: /\/qa\//i, value: 'QA' },
      { pattern: /\/beta\//i, value: 'BETA' },
    ];

    for (const { pattern, value } of pathPatterns) {
      if (pattern.test(url)) {
        return {
          key: 'site_env',
          predictedValue: value,
          confidence: 'medium',
          predictionType: 'url_pattern',
          notes: '경로 패턴',
        };
      }
    }

    return {
      key: 'site_env',
      predictedValue: 'PRD',
      confidence: 'high',
      predictionType: 'url_pattern',
      notes: '기본값 (운영환경)',
    };
  }

  /**
   * 5. channel - User-Agent 기반
   */
  predictChannel(context: PredictionContext): PredictionResult {
    const ua = context.userAgent || '';
    const mobilePatterns = /Mobile|Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i;

    if (mobilePatterns.test(ua)) {
      return {
        key: 'channel',
        predictedValue: 'MOBILE',
        confidence: 'high',
        predictionType: 'user_agent',
      };
    }

    return {
      key: 'channel',
      predictedValue: 'PC',
      confidence: context.userAgent ? 'high' : 'medium',
      predictionType: 'user_agent',
      notes: context.userAgent ? undefined : 'User-Agent 없음, PC로 가정',
    };
  }

  /**
   * 6. content_group - URL 패턴 + Vision AI
   */
  predictContentGroup(context: PredictionContext): PredictionResult {
    // Vision AI 결과가 있으면 우선 사용
    if (context.visionPageType) {
      return {
        key: 'content_group',
        predictedValue: context.visionPageType,
        confidence: 'high',
        predictionType: 'url_pattern_and_vision',
        notes: 'Vision AI 감지',
      };
    }

    // URL 패턴 매칭
    let bestMatch: { value: string; priority: number } | null = null;

    for (const { pattern, value, priority } of CONTENT_GROUP_PATTERNS) {
      if (pattern.test(context.url)) {
        if (!bestMatch || priority > bestMatch.priority) {
          bestMatch = { value, priority };
        }
      }
    }

    if (bestMatch) {
      return {
        key: 'content_group',
        predictedValue: bestMatch.value,
        confidence: 'medium',
        predictionType: 'url_pattern_and_vision',
        notes: 'URL 패턴 매칭',
      };
    }

    return {
      key: 'content_group',
      predictedValue: 'OTHERS',
      confidence: 'low',
      predictionType: 'url_pattern_and_vision',
      notes: '매칭되는 패턴 없음',
    };
  }

  /**
   * 7. login_is_login - 로그인 상태
   */
  predictLoginIsLogin(context: PredictionContext): PredictionResult {
    if (context.isLoggedIn !== undefined) {
      return {
        key: 'login_is_login',
        predictedValue: context.isLoggedIn ? 'Y' : 'N',
        confidence: 'high',
        predictionType: 'login_state',
      };
    }

    return {
      key: 'login_is_login',
      predictedValue: 'N',
      confidence: 'low',
      predictionType: 'login_state',
      notes: '로그인 상태 불명, 비로그인 가정',
    };
  }

  /**
   * 8. user_agent - 브라우저 자동
   */
  predictUserAgent(context: PredictionContext): PredictionResult {
    return {
      key: 'user_agent',
      predictedValue: context.userAgent || null,
      confidence: 'skip',
      predictionType: 'browser_auto',
      notes: '브라우저 자동 수집',
    };
  }

  /**
   * 9. traffic_type - GTM 내부에서 결정 (예측 스킵)
   *
   * traffic_type은 GTM 내부 로직에서 다음 기준으로 결정:
   * - referrer, UTM 파라미터, 내부/외부 트래픽 등
   * - 예측 불가능하므로 스킵 처리
   */
  predictTrafficType(context: PredictionContext): PredictionResult {
    return {
      key: 'traffic_type',
      predictedValue: null,
      confidence: 'skip',
      predictionType: 'gtm_internal',
      notes: 'GTM 내부 로직에서 동적 결정 (referrer, UTM 등)',
    };
  }

  /**
   * 10. page_referrer - 브라우저 자동
   */
  predictPageReferrer(context: PredictionContext): PredictionResult {
    return {
      key: 'page_referrer',
      predictedValue: null,
      confidence: 'skip',
      predictionType: 'browser_auto',
      notes: '브라우저 자동 수집',
    };
  }

  /**
   * 11. breadcrumb - 페이지 경로
   * AP_DATA_BREAD 변수에서 수집됨
   * 사이트마다 형식이 다름 (예: "전시 > GNB 홈", "HOME > MAIN")
   */
  predictBreadcrumb(context: PredictionContext): PredictionResult {
    // breadcrumb은 페이지에서 동적으로 설정되므로 예측이 어려움
    // 페이지 내 AP_DATA_BREAD 변수에서 수집해야 함
    return {
      key: 'breadcrumb',
      predictedValue: null,
      confidence: 'skip',
      predictionType: 'page_variable',
      notes: 'AP_DATA_BREAD에서 수집 필요 (사이트별 형식 다름)',
    };
  }

  /**
   * 12-16. page_location_1~5 - GTM 내부에서 breadcrumb 분할
   * 참고: AP_DATA_BREAD_1~5 변수는 실제로 존재하지 않음
   * GTM 내부에서 JS - Page Location 1~5 변수로 처리됨
   */
  predictPageLocations(context: PredictionContext): PredictionResult[] {
    const results: PredictionResult[] = [];

    // 2025-12-19 검증: AP_DATA_BREAD_1~5 변수가 존재하지 않음
    // page_location_1~5는 GTM 내부에서 처리되므로 예측 불가
    for (let i = 1; i <= 5; i++) {
      results.push({
        key: `page_location_${i}`,
        predictedValue: null,
        confidence: 'skip',
        predictionType: 'gtm_internal',
        notes: 'GTM 내부에서 breadcrumb 분할 처리',
      });
    }

    return results;
  }

  /**
   * 16. login_id_gcid - 로그인 시에만
   */
  predictLoginIdGcid(context: PredictionContext): PredictionResult {
    return this.createLoginOnlyResult('login_id_gcid', context, 'SHA512 해시 128자');
  }

  /**
   * 17. login_id_cid - 로그인 시에만
   */
  predictLoginIdCid(context: PredictionContext): PredictionResult {
    return this.createLoginOnlyResult('login_id_cid', context, 'SHA512 해시 128자');
  }

  /**
   * 18. login_id_gcid_1 - gcid 전반부 100자
   */
  predictLoginIdGcid1(context: PredictionContext): PredictionResult {
    return this.createLoginOnlyResult('login_id_gcid_1', context, 'gcid 1-100자');
  }

  /**
   * 19. login_id_gcid_2 - gcid 후반부 101자 이후
   */
  predictLoginIdGcid2(context: PredictionContext): PredictionResult {
    return this.createLoginOnlyResult('login_id_gcid_2', context, 'gcid 101자 이후');
  }

  /**
   * 20. login_id_cid_1 - cid 전반부 100자
   */
  predictLoginIdCid1(context: PredictionContext): PredictionResult {
    return this.createLoginOnlyResult('login_id_cid_1', context, 'cid 1-100자');
  }

  /**
   * 21. login_id_cid_2 - cid 후반부 101자 이후
   */
  predictLoginIdCid2(context: PredictionContext): PredictionResult {
    return this.createLoginOnlyResult('login_id_cid_2', context, 'cid 101자 이후');
  }

  /**
   * 로그인 전용 파라미터 결과 생성 (헬퍼)
   */
  private createLoginOnlyResult(key: string, context: PredictionContext, format: string): PredictionResult {
    if (context.isLoggedIn) {
      return {
        key,
        predictedValue: `[${format}]`,
        confidence: 'medium',
        predictionType: 'login_only',
        condition: 'login_is_login == Y',
        notes: '로그인 상태 - 실제 값은 서버에서 결정',
      };
    }

    return {
      key,
      predictedValue: null,
      confidence: 'high',
      predictionType: 'login_only',
      condition: 'login_is_login == Y',
      notes: '비로그인 상태 - 값 없음',
    };
  }

  /**
   * 22-35. 페이지 조건부 파라미터 (14개)
   */
  predictConditionalParams(context: PredictionContext): PredictionResult[] {
    const results: PredictionResult[] = [];
    const contentGroup = context.visionPageType ||
      this.predictContentGroup(context).predictedValue;

    // PRODUCT_DETAIL 전용 (6개) - page_view 이벤트에서 전송되는 상품 식별 정보만
    // 주의: product_price, product_discount는 view_item 이벤트 파라미터이므로 제외!
    const productParams = [
      { key: 'product_id', condition: 'PRODUCT_DETAIL' },
      { key: 'product_name', condition: 'PRODUCT_DETAIL' },
      { key: 'product_category', condition: 'PRODUCT_DETAIL' },
      { key: 'product_brandname', condition: 'PRODUCT_DETAIL' },
      { key: 'product_brandcode', condition: 'PRODUCT_DETAIL' },
      { key: 'product_is_stock', condition: 'PRODUCT_DETAIL' },
    ];

    for (const { key, condition } of productParams) {
      results.push(this.predictProductParam(key, context, contentGroup === condition));
    }

    // EVENT_DETAIL 전용 (2개)
    results.push(this.predictEventParam('view_event_code', context, contentGroup === 'EVENT_DETAIL'));
    results.push(this.predictEventParam('view_event_name', context, contentGroup === 'EVENT_DETAIL'));

    // BRAND_MAIN 전용 (2개)
    results.push(this.predictBrandParam('brandshop_code', context, contentGroup === 'BRAND_MAIN'));
    results.push(this.predictBrandParam('brandshop_name', context, contentGroup === 'BRAND_MAIN'));

    // 매장 페이지 전용 (2개)
    const isStorePage = context.url.includes('/store/');
    results.push(this.predictStoreParam('page_store_code', context, isStorePage));
    results.push(this.predictStoreParam('page_store_name', context, isStorePage));

    // SEARCH_RESULT 전용 (2개) - page_view 이벤트에서 전송되는 검색 브랜드 정보만
    // 주의: search_term, search_result, search_result_count는 view_search_results 이벤트 파라미터이므로 제외!
    const isSearchPage = contentGroup === 'SEARCH_RESULT';
    results.push(this.predictSearchParam('search_brand_code', context, isSearchPage));
    results.push(this.predictSearchParam('search_brand', context, isSearchPage));

    return results;
  }

  /**
   * 상품 파라미터 예측 (헬퍼)
   */
  private predictProductParam(key: string, context: PredictionContext, isProductPage: boolean): PredictionResult {
    if (!isProductPage) {
      return {
        key,
        predictedValue: null,
        confidence: 'high',
        predictionType: 'page_conditional',
        condition: 'content_group == PRODUCT_DETAIL',
        notes: '상품 상세 페이지가 아님',
      };
    }

    // URL에서 상품 ID 추출 시도
    const productIdMatch = context.url.match(/[?&]onlineProdCode=([^&]+)/i) ||
      context.url.match(/[?&]onlineProdSn=([^&]+)/i) ||
      context.url.match(/\/product\/(\d+)/i) ||  // 숫자 ID만 매칭
      context.url.match(/\/goods\/(\d+)/i);
    const hasProductId = !!productIdMatch?.[1] && productIdMatch[1] !== 'detail';

    // Vision AI 데이터 활용
    let predictedValue: string | null = null;
    let notes = '';

    switch (key) {
      case 'product_id':
        if (hasProductId) {
          predictedValue = productIdMatch![1];
          notes = 'URL에서 추출';
        } else {
          // 상품 ID 없는 상품 상세 페이지 (예: /product/detail만 있는 경우)
          return {
            key,
            predictedValue: null,
            confidence: 'skip',
            predictionType: 'page_variable',
            condition: 'content_group == PRODUCT_DETAIL',
            notes: 'AP_PRD_CODE에서 수집 필요 (URL에 상품 ID 없음)',
          };
        }
        break;

      case 'product_name':
        predictedValue = context.visionData?.productName ||
          context.pageTitle?.replace(/ - .+$/, '') || null;
        notes = context.visionData?.productName ? 'Vision AI 감지' : 'page title에서 추론';
        break;

      case 'product_category':
        predictedValue = context.visionData?.productCategory || null;
        notes = predictedValue ? 'Vision AI 감지' : 'Vision AI 필요';
        break;

      case 'product_brandname':
        predictedValue = context.visionData?.productBrand || null;
        notes = predictedValue ? 'Vision AI 감지' : 'Vision AI 필요';
        break;

      case 'product_brandcode':
        const brandCodeMatch = context.url.match(/[?&]brandCode=([^&]+)/i);
        predictedValue = brandCodeMatch?.[1] || null;
        notes = brandCodeMatch ? 'URL에서 추출' : 'URL에서 찾을 수 없음';
        break;

      case 'product_is_stock':
        if (!hasProductId) {
          // 상품 ID 없으면 재고 상태도 알 수 없음
          return {
            key,
            predictedValue: null,
            confidence: 'skip',
            predictionType: 'page_variable',
            condition: 'content_group == PRODUCT_DETAIL',
            notes: 'AP_PRD_ISTOCK에서 수집 필요 (URL에 상품 ID 없음)',
          };
        }
        if (context.visionData?.isOutOfStock !== undefined) {
          predictedValue = context.visionData.isOutOfStock ? 'N' : 'Y';
          notes = 'Vision AI 감지';
        } else {
          predictedValue = 'Y';
          notes = '기본값 (재고 있음 가정)';
        }
        break;

      // product_price, product_discount는 view_item 이벤트 파라미터이므로 page_view에서 제외
    }

    return {
      key,
      predictedValue,
      confidence: predictedValue ? 'medium' : 'low',
      predictionType: 'page_conditional',
      condition: 'content_group == PRODUCT_DETAIL',
      notes,
    };
  }

  /**
   * 이벤트 파라미터 예측 (헬퍼)
   */
  private predictEventParam(key: string, context: PredictionContext, isEventPage: boolean): PredictionResult {
    if (!isEventPage) {
      return {
        key,
        predictedValue: null,
        confidence: 'high',
        predictionType: 'page_conditional',
        condition: 'content_group == EVENT_DETAIL',
        notes: '이벤트 상세 페이지가 아님',
      };
    }

    let predictedValue: string | null = null;
    let notes = '';

    if (key === 'view_event_code') {
      // view_event_code 추출 로직 개선
      // URL 패턴 예시:
      // - /event/view/12292 → 12292
      // - /event/eventView/EVT2301SKINCARE.do → EVT2301SKINCARE
      // - /event/102369 → 102369
      // - /kr/ko/ca/event/102369 → 102369
      // - ?eventCode=XXX → XXX

      // 우선순위 1: 쿼리 파라미터
      const queryMatch = context.url.match(/[?&]eventCode=([^&]+)/i);
      if (queryMatch) {
        predictedValue = queryMatch[1];
        notes = 'URL 쿼리 파라미터에서 추출';
      } else {
        // 우선순위 2: URL 경로에서 이벤트 코드 추출
        const pathAfterEvent = context.url.match(/\/event\/(.+?)(?:[?#]|$)/i)?.[1] || '';
        const segments = pathAfterEvent.split('/').filter(s => s && s !== '');

        // 스킵할 중간 경로 키워드
        const skipKeywords = ['view', 'detail', 'eventview', 'list', 'event', 'page'];

        // 마지막 세그먼트부터 역순으로 이벤트 코드 패턴 찾기
        for (let i = segments.length - 1; i >= 0; i--) {
          let segment = segments[i].replace(/\.do$/i, ''); // .do 제거
          if (skipKeywords.includes(segment.toLowerCase())) continue;

          // 유효한 이벤트 코드 패턴: 숫자, EVT 접두어, 또는 의미있는 코드
          if (/^\d+$/.test(segment) || /^EVT/i.test(segment) ||
              (segment.length > 3 && /^[A-Z0-9_-]+$/i.test(segment))) {
            predictedValue = segment;
            notes = 'URL 경로에서 추출';
            break;
          }
        }

        if (!predictedValue) {
          notes = 'URL에서 이벤트 코드를 찾을 수 없음';
        }
      }
    } else if (key === 'view_event_name') {
      // view_event_name은 페이지에서만 알 수 있음 (AP_PROMO_NAME)
      // Vision AI나 pageTitle이 없으면 예측 불가 → skip 처리
      if (!context.visionData?.eventName && !context.pageTitle) {
        return {
          key,
          predictedValue: null,
          confidence: 'skip',
          predictionType: 'page_variable',
          condition: 'content_group == EVENT_DETAIL',
          notes: 'AP_PROMO_NAME에서 수집 필요 (페이지 변수)',
        };
      }
      predictedValue = context.visionData?.eventName ||
        context.pageTitle?.replace(/ - .+$/, '') || null;
      notes = context.visionData?.eventName ? 'Vision AI 감지' : 'page title에서 추론';
    }

    return {
      key,
      predictedValue,
      confidence: predictedValue ? 'medium' : 'low',
      predictionType: 'page_conditional',
      condition: 'content_group == EVENT_DETAIL',
      notes,
    };
  }

  /**
   * 브랜드 파라미터 예측 (헬퍼)
   */
  private predictBrandParam(key: string, context: PredictionContext, isBrandPage: boolean): PredictionResult {
    if (!isBrandPage) {
      return {
        key,
        predictedValue: null,
        confidence: 'high',
        predictionType: 'page_conditional',
        condition: 'content_group == BRAND_MAIN',
        notes: '브랜드 메인 페이지가 아님',
      };
    }

    let predictedValue: string | null = null;
    let notes = '';

    if (key === 'brandshop_code') {
      const brandCodeMatch = context.url.match(/\/brand\/([^/?]+)/i) ||
        context.url.match(/[?&]brandCode=([^&]+)/i);
      predictedValue = brandCodeMatch?.[1] || null;
      notes = brandCodeMatch ? 'URL에서 추출' : 'URL에서 브랜드 코드를 찾을 수 없음';
    } else if (key === 'brandshop_name') {
      predictedValue = context.visionData?.brandName ||
        context.pageTitle?.split(' - ')[0] || null;
      notes = context.visionData?.brandName ? 'Vision AI 감지' : 'page title에서 추론';
    }

    return {
      key,
      predictedValue,
      confidence: predictedValue ? 'medium' : 'low',
      predictionType: 'page_conditional',
      condition: 'content_group == BRAND_MAIN',
      notes,
    };
  }

  /**
   * 매장 파라미터 예측 (헬퍼)
   */
  private predictStoreParam(key: string, context: PredictionContext, isStorePage: boolean): PredictionResult {
    if (!isStorePage) {
      return {
        key,
        predictedValue: null,
        confidence: 'high',
        predictionType: 'page_conditional',
        condition: '매장 관련 페이지',
        notes: '매장 페이지가 아님',
      };
    }

    let predictedValue: string | null = null;
    let notes = '';

    if (key === 'page_store_code') {
      const storeCodeMatch = context.url.match(/\/store\/([^/?]+)/i) ||
        context.url.match(/[?&]storeCode=([^&]+)/i);
      predictedValue = storeCodeMatch?.[1] || null;
      notes = storeCodeMatch ? 'URL에서 추출' : 'URL에서 매장 코드를 찾을 수 없음';
    } else if (key === 'page_store_name') {
      predictedValue = context.visionData?.storeName ||
        context.pageTitle?.split(' - ')[0] || null;
      notes = context.visionData?.storeName ? 'Vision AI 감지' : 'page title에서 추론';
    }

    return {
      key,
      predictedValue,
      confidence: predictedValue ? 'medium' : 'low',
      predictionType: 'page_conditional',
      condition: '매장 관련 페이지',
      notes,
    };
  }

  /**
   * 검색 파라미터 예측 (헬퍼)
   */
  private predictSearchParam(key: string, context: PredictionContext, isSearchPage: boolean): PredictionResult {
    if (!isSearchPage) {
      return {
        key,
        predictedValue: null,
        confidence: 'high',
        predictionType: 'page_conditional',
        condition: 'content_group == SEARCH_RESULT',
        notes: '검색 결과 페이지가 아님',
      };
    }

    let predictedValue: string | null = null;
    let notes = '';

    // URL에서 검색어 추출
    const searchTermMatch = context.url.match(/[?&](?:query|keyword|search|q|word)=([^&]+)/i);
    const searchTerm = searchTermMatch ? decodeURIComponent(searchTermMatch[1]) : null;
    const hasSearchTerm = !!searchTerm;

    if (key === 'search_brand_code') {
      const brandCodeMatch = context.url.match(/[?&]brand=([^&]+)/i) ||
        context.url.match(/[?&]brandCode=([^&]+)/i);
      predictedValue = brandCodeMatch?.[1] || null;
      notes = brandCodeMatch ? 'URL query에서 추출' : '브랜드 필터 없음';
    } else if (key === 'search_brand') {
      predictedValue = context.visionData?.searchBrand || null;
      notes = predictedValue ? 'Vision AI 감지' : '브랜드 필터 없거나 Vision AI 필요';
    }
    // search_term, search_result, search_result_count는 view_search_results 이벤트 파라미터이므로 page_view에서 제외

    return {
      key,
      predictedValue,
      confidence: predictedValue ? 'medium' : 'low',
      predictionType: 'page_conditional',
      condition: 'content_group == SEARCH_RESULT',
      notes,
    };
  }

  /**
   * User Properties 예측 (10개)
   */
  predictUserProperties(context: PredictionContext): PredictionResult[] {
    const results: PredictionResult[] = [];
    const isLoggedIn = context.isLoggedIn || false;

    // user_id (36)
    results.push(this.createLoginOnlyResult('user_id', context, 'SHA512 해시 128자'));

    // login_is_sso (37)
    results.push({
      key: 'login_is_sso',
      predictedValue: isLoggedIn ? '[Y/N]' : null,
      confidence: isLoggedIn ? 'low' : 'high',
      predictionType: 'login_only',
      condition: 'login_is_login == Y',
      notes: isLoggedIn ? '로그인 방법에 따라 결정' : '비로그인 상태',
    });

    // login_gender (38)
    results.push({
      key: 'login_gender',
      predictedValue: isLoggedIn ? '[M/F]' : null,
      confidence: isLoggedIn ? 'low' : 'high',
      predictionType: 'login_only',
      condition: 'login_is_login == Y',
      notes: isLoggedIn ? '회원 정보에서 결정' : '비로그인 상태',
    });

    // login_birth (39)
    results.push({
      key: 'login_birth',
      predictedValue: isLoggedIn ? '[YYYY]' : null,
      confidence: isLoggedIn ? 'low' : 'high',
      predictionType: 'login_only',
      condition: 'login_is_login == Y',
      notes: isLoggedIn ? '회원 생년' : '비로그인 상태',
    });

    // login_age (40)
    results.push({
      key: 'login_age',
      predictedValue: isLoggedIn ? '[숫자]' : null,
      confidence: isLoggedIn ? 'low' : 'high',
      predictionType: 'login_only',
      condition: 'login_is_login == Y',
      notes: isLoggedIn ? '연령대' : '비로그인 상태',
    });

    // login_level (41)
    results.push({
      key: 'login_level',
      predictedValue: isLoggedIn ? '[회원등급]' : null,
      confidence: isLoggedIn ? 'low' : 'high',
      predictionType: 'login_only',
      condition: 'login_is_login == Y',
      notes: isLoggedIn ? 'A 등급, E 등급, WELCOME 등' : '비로그인 상태',
    });

    // login_beauty_level (42)
    results.push({
      key: 'login_beauty_level',
      predictedValue: isLoggedIn ? '[뷰티포인트 등급]' : null,
      confidence: isLoggedIn ? 'low' : 'high',
      predictionType: 'login_only',
      condition: 'login_is_login == Y',
      notes: isLoggedIn ? 'FAMILY, PLATINUM 등' : '비로그인 상태',
    });

    // login_is_member (43)
    results.push({
      key: 'login_is_member',
      predictedValue: isLoggedIn ? '[Y/N]' : null,
      confidence: isLoggedIn ? 'low' : 'high',
      predictionType: 'login_only',
      condition: 'login_is_login == Y',
      notes: isLoggedIn ? '임직원 여부' : '비로그인 상태',
    });

    // login_method (44)
    results.push({
      key: 'login_method',
      predictedValue: isLoggedIn ? '[로그인 방법]' : null,
      confidence: isLoggedIn ? 'low' : 'high',
      predictionType: 'login_only',
      condition: 'login_is_login == Y',
      notes: isLoggedIn ? 'NORMAL, KAKAO, NAVER 등' : '비로그인 상태',
    });

    // login_is_subscription (45)
    results.push({
      key: 'login_is_subscription',
      predictedValue: isLoggedIn ? '[Y/N]' : null,
      confidence: isLoggedIn ? 'low' : 'high',
      predictionType: 'login_only',
      condition: 'login_is_login == Y',
      notes: isLoggedIn ? '정기배송 구독 여부' : '비로그인 상태',
    });

    return results;
  }

  /**
   * 예측 결과 요약 출력
   */
  printPredictionSummary(results: PredictionResult[]): void {
    console.log('\n' + '='.repeat(80));
    console.log(' page_view 파라미터 Value 예측 결과');
    console.log('='.repeat(80));

    const grouped: Record<string, PredictionResult[]> = {};
    for (const r of results) {
      const type = r.predictionType;
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(r);
    }

    for (const [type, params] of Object.entries(grouped)) {
      console.log(`\n[${type}]`);
      for (const p of params) {
        const value = p.predictedValue || '(null)';
        const conf = p.confidence === 'skip' ? '⏭️' :
          p.confidence === 'high' ? '🟢' :
            p.confidence === 'medium' ? '🟡' : '🔴';
        console.log(`  ${conf} ${p.key}: ${value}`);
        if (p.notes) console.log(`     └─ ${p.notes}`);
      }
    }

    // 통계
    const total = results.length;
    const high = results.filter(r => r.confidence === 'high').length;
    const medium = results.filter(r => r.confidence === 'medium').length;
    const low = results.filter(r => r.confidence === 'low').length;
    const skip = results.filter(r => r.confidence === 'skip').length;

    console.log('\n' + '-'.repeat(40));
    console.log(`총 ${total}개 파라미터`);
    console.log(`  🟢 High: ${high}개, 🟡 Medium: ${medium}개, 🔴 Low: ${low}개, ⏭️ Skip: ${skip}개`);
  }
}

// 싱글톤 인스턴스
let cachedPredictor: ValuePredictor | null = null;

/**
 * Value 예측기 인스턴스 가져오기
 */
export function getValuePredictor(): ValuePredictor {
  if (!cachedPredictor) {
    cachedPredictor = new ValuePredictor();
  }
  return cachedPredictor;
}

/**
 * 편의 함수: 전체 파라미터 예측
 */
export function predictPageViewValues(context: PredictionContext): PredictionResult[] {
  return getValuePredictor().predictAll(context);
}

/**
 * 편의 함수: 특정 파라미터 예측
 */
export function predictValue(key: string, context: PredictionContext): PredictionResult | null {
  const predictor = getValuePredictor();
  const results = predictor.predictAll(context);
  return results.find(r => r.key === key) || null;
}
