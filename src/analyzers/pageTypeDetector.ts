/**
 * 페이지 타입 감지 및 설정 관리
 */
import * as fs from 'fs';
import * as path from 'path';

export interface PageTypeConfig {
  pageType: string;
  contentGroup: string;
  requiredParams: string[];
  optionalParams: string[];
  extractionRules: Array<{
    param: string;
    source: 'url' | 'screen' | 'both';
    instruction: string;
  }>;
}

export interface SiteConfig {
  domain: string;
  siteName: string;
  contentGroupMapping: Record<string, string>;
  urlPatterns: Array<{ pattern: string; pageType: string }>;
  parameterRules?: Record<string, any>;
}

export interface UrlExtractedParams {
  site_country?: string;
  site_language?: string;
  site_env?: string;
  product_id?: string;
  search_term?: string;
  view_event_code?: string;
  [key: string]: string | undefined;
}

export class PageTypeDetector {
  private pageTypePrompts: any;
  private siteParamConfig: any;
  private siteNameMap: Record<string, string> = {
    'amoremall.com': 'APMALL',
    'innisfree.com': 'INNISFREE',
    'osulloc.com': 'OSULLOC',
    'illiyoon.com': 'ILLIYOON',
    'aritaum.com': 'ARITAUM',
    'espoir.com': 'ESPOIR',
    'etude.com': 'ETUDE',
    'laboh.co.kr': 'LABOH',
    'aestura.com': 'AESTURA',
    'brdy.co.kr': 'BRDY',
    'ayunche.com': 'AYUNCHE',
    'amospro.com': 'AMOSPRO',
    'makeonshop.co.kr': 'MAKEON',
    'hera.com': 'HERA',
    'sulwhasoo.com': 'SULWHASOO',
    'laneige.com': 'LANEIGE',
    'iope.com': 'IOPE',
    'mamonde.com': 'MAMONDE',
    'primera.com': 'PRIMERA',
    'vitalbeautie.com': 'VITALBEAUTIE',
  };

  constructor() {
    this.loadConfigs();
  }

  private loadConfigs(): void {
    const configDir = path.join(process.cwd(), 'config');

    try {
      const promptsPath = path.join(configDir, 'page-type-prompts.json');
      if (fs.existsSync(promptsPath)) {
        this.pageTypePrompts = JSON.parse(fs.readFileSync(promptsPath, 'utf-8'));
      }
    } catch (e) {
      console.warn('page-type-prompts.json 로드 실패');
      this.pageTypePrompts = {};
    }

    try {
      const paramConfigPath = path.join(configDir, 'site-param-config.json');
      if (fs.existsSync(paramConfigPath)) {
        this.siteParamConfig = JSON.parse(fs.readFileSync(paramConfigPath, 'utf-8'));
      }
    } catch (e) {
      console.warn('site-param-config.json 로드 실패');
      this.siteParamConfig = {};
    }
  }

  /**
   * URL에서 사이트명 추출
   */
  getSiteName(pageUrl: string): string | null {
    try {
      const domain = new URL(pageUrl).hostname.replace('www.', '');
      return this.siteNameMap[domain] || null;
    } catch {
      return null;
    }
  }

  /**
   * URL 패턴으로 페이지 타입 감지
   */
  detectPageType(pageUrl: string, siteName?: string): string {
    const urlLower = pageUrl.toLowerCase();

    // 사이트별 패턴 우선 적용
    if (siteName && this.siteParamConfig?.sites?.[siteName]?.urlPatterns) {
      for (const rule of this.siteParamConfig.sites[siteName].urlPatterns) {
        if (new RegExp(rule.pattern, 'i').test(urlLower)) {
          return rule.pageType;
        }
      }
    }

    // 범용 패턴 적용
    const patterns = this.pageTypePrompts?.urlPatterns?.patterns || [];
    for (const rule of patterns) {
      if (new RegExp(rule.pattern, 'i').test(urlLower)) {
        return rule.pageType;
      }
    }

    // 기본 패턴 (하드코딩된 폴백) - 순서 중요!
    if (/\/display\/main|\/main$|^\/$/.test(urlLower)) return 'MAIN';
    if (/\/search|\?.*(?:keyword|query|q|searchKeyword)=/.test(urlLower)) return 'SEARCH_RESULT';
    if (/\/cart|\/basket/.test(urlLower)) return 'CART';
    if (/\/order\/complete|order_complete/.test(urlLower)) return 'ORDER_COMPLETE';
    if (/\/order|\/checkout/.test(urlLower)) return 'ORDER';
    if (/\/prd\/detail\/|\/product\/detail|\/ProductView|\/goods\/\d/.test(urlLower)) return 'PRODUCT_DETAIL';
    if (/\/prd\/cate\/list\/|\/category\/|\/shop\/list|\/display\/category/.test(urlLower)) return 'PRODUCT_LIST';

    // EVENT_LIST vs EVENT_DETAIL 구분 (숫자 ID 유무로 판단)
    if (/\/display\/event$|\/display\/event\?|\/event\/list|\/events$/.test(urlLower)) return 'EVENT_LIST';
    if (/\/event\/\d+|\/promotion\/\d+|\/article\/event\/\d+/.test(urlLower)) return 'EVENT_DETAIL';

    // LIVE_LIST vs LIVE_DETAIL 구분
    if (/\/display\/live$|\/display\/live\?|\/live\/list/.test(urlLower)) return 'LIVE_LIST';
    if (/\/live\/playerweb|\/live\/detail|sy_id=/.test(urlLower)) return 'LIVE_DETAIL';

    // BRAND_MAIN
    if (/\/display\/brand$|\/display\/brand\?|\/brandshop\//.test(urlLower)) return 'BRAND_MAIN';

    if (/\/mypage|\/my\/|\/login/.test(urlLower)) return 'MY';

    return 'OTHERS';
  }

  /**
   * 페이지 타입에 따른 content_group 반환
   */
  getContentGroup(pageType: string, siteName?: string): string {
    // 사이트별 매핑
    if (siteName) {
      const siteConfig = this.siteParamConfig?.sites?.[siteName];
      if (siteConfig?.contentGroupMapping?.[pageType]) {
        return siteConfig.contentGroupMapping[pageType];
      }
    }

    // 기본 매핑 (페이지 타입과 동일)
    return pageType;
  }

  /**
   * URL에서 추출 가능한 파라미터 추출
   */
  extractParamsFromUrl(pageUrl: string): UrlExtractedParams {
    const params: UrlExtractedParams = {};

    // site_country, site_language (URL 패턴)
    const localeMatch = pageUrl.match(/\/([a-z]{2})\/([a-z]{2})\//i);
    if (localeMatch) {
      params.site_country = localeMatch[1].toUpperCase();
      params.site_language = localeMatch[2].toUpperCase();
    }

    // site_env
    if (/\b(dev|develop)\b/i.test(pageUrl)) {
      params.site_env = 'DEV';
    } else if (/\b(stg|staging)\b/i.test(pageUrl)) {
      params.site_env = 'STG';
    } else if (/\blocalhost\b/i.test(pageUrl)) {
      params.site_env = 'LOCAL';
    } else {
      params.site_env = 'PRD';
    }

    // product_id (다양한 패턴)
    const productIdPatterns = [
      /\/prd\/detail\/(\d+)/i,
      /\/product\/(\d+)/i,
      /product_no=(\d+)/i,
      /onlineProdSn=(\d+)/i,
      /\/goods\/(\d+)/i,
    ];
    for (const pattern of productIdPatterns) {
      const match = pageUrl.match(pattern);
      if (match) {
        params.product_id = match[1];
        break;
      }
    }

    // search_term (쿼리 파라미터)
    const searchTermPatterns = [
      /searchKeyword=([^&]+)/i,
      /keyword=([^&]+)/i,
      /query=([^&]+)/i,
      /[?&]q=([^&]+)/i,
    ];
    for (const pattern of searchTermPatterns) {
      const match = pageUrl.match(pattern);
      if (match) {
        try {
          params.search_term = decodeURIComponent(match[1]);
        } catch {
          params.search_term = match[1];
        }
        break;
      }
    }

    // view_event_code
    const eventCodePatterns = [
      /\/event\/(\d+)/i,
      /\/promotion\/(\w+)/i,
      /eventId=(\w+)/i,
    ];
    for (const pattern of eventCodePatterns) {
      const match = pageUrl.match(pattern);
      if (match) {
        params.view_event_code = match[1];
        break;
      }
    }

    return params;
  }

  /**
   * 페이지 타입별 설정 가져오기
   */
  getPageTypeConfig(pageType: string): PageTypeConfig | null {
    const config = this.pageTypePrompts?.pageTypes?.[pageType];
    if (!config) return null;

    return {
      pageType,
      contentGroup: pageType,
      requiredParams: config.requiredParams || [],
      optionalParams: config.optionalParams || [],
      extractionRules: config.extractionRules || [],
    };
  }

  /**
   * 종합 검토 체크리스트 가져오기 (사이트명 모를 때)
   */
  getComprehensiveCheckList(): string[] {
    const checkList = this.siteParamConfig?.comprehensiveCheckList?.categories;
    if (!checkList) {
      return [
        '페이지 레이아웃 분석: 헤더/GNB/메인콘텐츠/푸터 구조',
        '로그인 상태: 헤더에 로그인 버튼 vs 사용자 프로필',
        '상품 정보: 상품명, 가격, 브랜드명, 재고 상태',
        '검색 정보: 검색창, 검색어, 검색 결과 수',
        '프로모션: 배너 문구, 이벤트 정보',
        'breadcrumb: 페이지 위치 경로',
        'URL 패턴 분석: /product/, /search, /cart 키워드',
      ];
    }

    const items: string[] = [];
    for (const category of Object.values(checkList) as any[]) {
      if (category.checks) {
        items.push(...category.checks);
      }
    }
    return items;
  }

  /**
   * 파라미터 추출 규칙 가져오기
   */
  getParameterExtractionRules(): any {
    return this.siteParamConfig?.parameterExtractionSource || {};
  }
}
