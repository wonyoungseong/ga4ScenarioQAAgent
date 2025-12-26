/**
 * 통합 이벤트 분석기
 *
 * GTM 분석 + Vision AI 분석 + 개발가이드 파싱 + CSS Selector 검증을 결합하여
 * 특정 페이지에서 실제로 발생 가능한 이벤트를 정확하게 판단합니다.
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import { Page } from 'playwright';
import { GTMAnalyzer, PageEventAnalysisResult, GTMTrigger } from './gtmAnalyzer';
import {
  PageType,
  detectPageTypeFromUrl,
  detectPageTypeComprehensive,
  getPageTypeDescription,
  ComprehensivePageTypeResult
} from '../types/pageContext';
import {
  EVENT_UI_REQUIREMENTS,
  EventUIRequirement,
  getEventUIRequirement,
} from '../types/eventUIRequirements';
import { EventEvaluationResult } from './filterEvaluator';
import {
  DevelopmentGuideParser,
  ParsedEventDefinition,
  DevelopmentGuideParseResult
} from '../parsers/developmentGuideParser';
import { GTMPageMappingExtractor, EventPageMapping } from './gtmPageMappingExtractor';
import { PreloadedGTMConfig, GTMConfigLoader } from '../config/gtmConfigLoader';
import {
  getEventParameters,
  getApiDimension,
  reloadIfChanged,
} from '../config/parameterRegistry';
import { ParameterDefinition } from '../parsers/paramMappingParser';

/**
 * 이벤트 필터링 설정
 *
 * GTM에서 파싱된 이벤트 중 실제 이벤트가 아닌 것들을 필터링합니다.
 */
const EVENT_FILTERING_CONFIG = {
  /**
   * GTM 변수 패턴 필터링
   * {{...}} 형태는 GTM 내부 변수이므로 이벤트가 아님
   */
  gtmVariablePattern: /^\{\{.*\}\}$/,

  /**
   * 조건부 이벤트 목록
   * 특정 조건에서만 발생하는 이벤트들
   */
  conditionalEvents: {
    // 페이지 로드 성능 측정 - 특정 성능 임계값 초과 시에만 발생
    'page_load_time': {
      condition: 'performance_threshold',
      description: '페이지 로드 시간이 특정 임계값을 초과할 때만 발생',
      requiredElement: null,
      allowedPageTypes: null,
      allowedUrlPatterns: null,
    },
    // YouTube 관련 이벤트 - 영상이 있는 페이지에서만 발생
    'youtube_video_start': {
      condition: 'youtube_embed',
      description: 'YouTube 영상이 페이지에 있을 때만 발생',
      requiredElement: 'iframe[src*="youtube"]',
      allowedPageTypes: null,
      allowedUrlPatterns: null,
    },
    'youtube_video_progress': {
      condition: 'youtube_embed',
      description: 'YouTube 영상이 페이지에 있을 때만 발생',
      requiredElement: 'iframe[src*="youtube"]',
      allowedPageTypes: null,
      allowedUrlPatterns: null,
    },
    'youtube_video_complete': {
      condition: 'youtube_embed',
      description: 'YouTube 영상이 페이지에 있을 때만 발생',
      requiredElement: 'iframe[src*="youtube"]',
      allowedPageTypes: null,
      allowedUrlPatterns: null,
    },
    // 일반 비디오 이벤트 - video 요소가 있는 페이지에서만 발생
    'video_start': {
      condition: 'video_element',
      description: '비디오 요소가 페이지에 있을 때만 발생',
      requiredElement: 'video, iframe[src*="youtube"], iframe[src*="vimeo"], [class*="video"], [id*="video"]',
      allowedPageTypes: null,
      allowedUrlPatterns: null,
    },
    'video_progress': {
      condition: 'video_element',
      description: '비디오 요소가 페이지에 있을 때만 발생',
      requiredElement: 'video, iframe[src*="youtube"], iframe[src*="vimeo"], [class*="video"], [id*="video"]',
      allowedPageTypes: null,
      allowedUrlPatterns: null,
    },
    'video_complete': {
      condition: 'video_element',
      description: '비디오 요소가 페이지에 있을 때만 발생',
      requiredElement: 'video, iframe[src*="youtube"], iframe[src*="vimeo"], [class*="video"], [id*="video"]',
      allowedPageTypes: null,
      allowedUrlPatterns: null,
    },
    // view_item_list - 개발가이드에 따르면 SEARCH 타입에서만 발생
    // GA4 실제 데이터: SEARCH_RESULT에서만 발생, BRAND_PRODUCT_LIST에서는 미발생
    'view_item_list': {
      condition: 'page_type_restriction',
      description: '검색 결과 페이지에서만 발생 (GA4 실제 데이터 기준)',
      requiredElement: null,
      allowedPageTypes: ['SEARCH_RESULT', 'SEARCH'],
      allowedUrlPatterns: [/\/search/i, /searchKeyword=/i, /query=/i],
    },
    // brand_store - 아모레몰 EDGE CASE: 개별 브랜드 홈페이지에서만 발생
    // GA4 데이터 기준: /display/brand/detail 페이지에서는 발생하지 않음
    // /primera, /sulwhasoo 등 개별 브랜드 전용 홈페이지에서만 발생
    'brand_store': {
      condition: 'url_pattern_restriction',
      description: '개별 브랜드 홈페이지에서만 발생 (아모레몰 EDGE CASE - /display/brand/detail 제외)',
      requiredElement: null,
      allowedPageTypes: [],  // BRAND_MAIN 제외 - GA4 데이터에서 발생하지 않음
      allowedUrlPatterns: [/\/primera$/i, /\/sulwhasoo$/i, /\/hera$/i, /\/iope$/i, /\/laneige$/i],  // 개별 브랜드 홈만
    },
    // brand_product_click - 브랜드 페이지에서만 발생
    'brand_product_click': {
      condition: 'url_pattern_restriction',
      description: '브랜드 페이지에서만 발생 (아모레몰 EDGE CASE)',
      requiredElement: null,
      allowedPageTypes: ['BRAND_MAIN', 'BRAND_PRODUCT_LIST', 'BRAND_EVENT_LIST', 'BRAND_CUSTOM_ETC'],
      allowedUrlPatterns: [/\/display\/brand\/detail/i, /\/brand\//i, /\/brand$/i, /\/primera$/i, /\/sulwhasoo$/i, /\/hera$/i],
    },
    // sign_up - 아모레몰 EDGE CASE: 회원가입 완료 페이지에서만 발생
    // 일반 페이지에서는 로그인 버튼으로 진입하더라도 sign_up 이벤트는 회원가입 완료 시점에 발생
    'sign_up': {
      condition: 'url_pattern_restriction',
      description: '회원가입 완료 페이지에서만 발생 (아모레몰 EDGE CASE - 별도 회원가입 완료 페이지 존재)',
      requiredElement: null,
      allowedPageTypes: null,
      allowedUrlPatterns: [/\/join/i, /\/signup/i, /\/register/i, /signupComplete/i, /joinComplete/i],
    },
    // scroll - GTM에서 특정 Content Group에서만 발생하도록 설정됨
    // contentGroup == 'MAIN' || contentGroup == 'PRODUCT_DETAIL' || contentGroup == 'EVENT_DETAIL'
    // BRAND_MAIN, BRAND_PRODUCT_LIST 추가: GA4 실제 데이터에서 브랜드 페이지에서 scroll 발생
    'scroll': {
      condition: 'page_type_restriction',
      description: 'MAIN, PRODUCT_DETAIL, EVENT_DETAIL, BRAND_MAIN, BRAND_PRODUCT_LIST 페이지에서만 발생 (GTM 트리거 조건)',
      requiredElement: null,
      allowedPageTypes: ['MAIN', 'PRODUCT_DETAIL', 'EVENT_DETAIL', 'BRAND_MAIN', 'BRAND_PRODUCT_LIST'],
      allowedUrlPatterns: null,
    },
    // login - 아모레몰 EDGE CASE: 로그인 완료 시점에 발생
    // 로그인 버튼 클릭이 아닌, 로그인 완료 후 리다이렉트된 페이지에서 발생
    // GA4 실제 데이터 기준: MAIN, HISTORY에서 발생, PRODUCT_LIST/MY에서는 미발생
    'login': {
      condition: 'page_type_restriction',
      description: '로그인 완료 후 리다이렉트되는 주요 페이지에서만 발생 (아모레몰 EDGE CASE)',
      requiredElement: null,
      allowedPageTypes: ['MAIN', 'PRODUCT_DETAIL', 'CART', 'HISTORY', 'OTHERS'],
      allowedUrlPatterns: null,
    },
    // view_search_results - 검색 결과 페이지에서만 발생
    // 개발가이드 정의: SEARCH_RESULT 페이지에서만 발생
    // ⚠️ BEAUTYFEED에서 3.24% 수집되나 개발가이드 기준 SEARCH_RESULT만 허용
    'view_search_results': {
      condition: 'page_type_restriction',
      description: '검색 결과 페이지에서만 발생 (개발가이드 정의)',
      requiredElement: null,
      allowedPageTypes: ['SEARCH_RESULT', 'SEARCH'],
      allowedUrlPatterns: [/\/search/i, /searchKeyword=/i, /query=/i],
    },
    // view_promotion - 메인 페이지 Key Visual 영역에서만 발생
    // 개발가이드 정의: MAIN 페이지에서만 발생
    // ⚠️ 다른 페이지에서 수집되는 것은 SPA 오류 (MY: 5.73%, HISTORY: 5.36% 등은 노이즈)
    'view_promotion': {
      condition: 'page_type_restriction',
      description: '메인 페이지 Key Visual 영역에서만 발생 (개발가이드 정의, 다른 페이지는 SPA 오류)',
      requiredElement: null,
      allowedPageTypes: ['MAIN'],
      allowedUrlPatterns: null,
    },
    // withdrawal - 회원탈퇴 완료 페이지에서만 발생
    'withdrawal': {
      condition: 'page_type_restriction',
      description: '마이페이지 회원탈퇴 영역에서만 발생',
      requiredElement: null,
      allowedPageTypes: ['MY'],
      allowedUrlPatterns: [/\/my/i, /\/withdraw/i],
    },
    // write_review - 리뷰 작성 완료 시 발생 (상품 상세 또는 마이페이지)
    'write_review': {
      condition: 'page_type_restriction',
      description: '상품 상세 또는 마이페이지 리뷰 영역에서만 발생',
      requiredElement: null,
      allowedPageTypes: ['PRODUCT_DETAIL', 'MY'],
      allowedUrlPatterns: null,
    },
    // purchase - 주문 완료 페이지에서만 발생
    'purchase': {
      condition: 'url_pattern_restriction',
      description: '주문 완료 페이지에서만 발생 (preOrderValidation 등 사전 페이지 제외)',
      requiredElement: null,
      allowedPageTypes: ['ORDER'],
      allowedUrlPatterns: [/\/order\/complete/i, /\/orderComplete/i, /\/order\/success/i, /ordNo=/i],
    },
    // click_with_duration - 특정 페이지에서만 발생 (사용자 체류 시간 측정)
    // GA4 실제 데이터: MAIN, PRODUCT_DETAIL, EVENT_DETAIL, BRAND_MAIN, BRAND_PRODUCT_LIST, BRAND_CUSTOM_ETC, HISTORY에서 발생
    // 주의: BRAND_EVENT_LIST에서는 미발생
    'click_with_duration': {
      condition: 'page_type_restriction',
      description: '컨텐츠 페이지에서 발생 (GTM 조건, GA4 데이터 기준)',
      requiredElement: null,
      allowedPageTypes: ['MAIN', 'PRODUCT_DETAIL', 'EVENT_DETAIL', 'BRAND_MAIN', 'BRAND_PRODUCT_LIST', 'BRAND_CUSTOM_ETC', 'HISTORY'],
      allowedUrlPatterns: null,
    },
    // custom_event - 특정 페이지의 커스텀 인터랙션에서만 발생
    // GA4 실제 데이터: MY, HISTORY에서 발생, PRODUCT_LIST에서는 미발생
    'custom_event': {
      condition: 'page_type_restriction',
      description: 'MY, HISTORY 페이지에서만 발생 (커스텀 인터랙션 추적)',
      requiredElement: null,
      allowedPageTypes: ['MY', 'HISTORY', 'OTHERS'],
      allowedUrlPatterns: null,
    },
    // select_promotion - 프로모션 배너 클릭 시 발생
    // 개발가이드 정의: MAIN 페이지에서만 발생 (Key Visual 클릭)
    // ⚠️ 다른 페이지에서 수집되는 것은 SPA 오류 (MY: 0.28%, HISTORY: 0.50% 등은 노이즈)
    'select_promotion': {
      condition: 'page_type_restriction',
      description: '메인 페이지 프로모션 배너 클릭 시 발생 (개발가이드 정의)',
      requiredElement: null,
      allowedPageTypes: ['MAIN'],
      allowedUrlPatterns: null,
    },
    // qualified_visit - 일정 시간 이상 체류한 방문자 추적
    // 대부분의 페이지에서 발생하는 체류 시간 기반 이벤트
    // 제한 없음 (모든 페이지에서 발생 가능)
    'qualified_visit': {
      condition: 'no_restriction',
      description: '일정 시간 이상 체류한 방문자 추적 (모든 페이지)',
      requiredElement: null,
      allowedPageTypes: null,
      allowedUrlPatterns: null,
    },
  } as Record<string, {
    condition: string;
    description: string;
    requiredElement: string | null;
    allowedPageTypes: string[] | null;
    allowedUrlPatterns: RegExp[] | null;
  }>,

  /**
   * 낮은 비중 이벤트 임계값 (GA4 데이터 기반)
   */
  proportionThresholds: {
    /** 이 비율 미만은 노이즈로 간주 (0.01% = 0.0001) */
    noise: 0.0001,
    /** 이 비율 미만은 낮은 유의성 (0.1% = 0.001) */
    lowSignificance: 0.001,
  },
};

/**
 * GA4 실제 데이터 피드백 캐시
 *
 * 시스템 프롬프트 작성 시까지 GA4 실제 데이터를 참조하여 예측 정확도를 높입니다.
 * 이 캐시는 분석 세션 동안 유지됩니다.
 */
interface GA4FeedbackCache {
  /** 페이지 경로별 실제 발생 이벤트 */
  pageEvents: Map<string, Set<string>>;
  /** 이벤트별 전체 발생 횟수 */
  eventCounts: Map<string, number>;
  /** 마지막 업데이트 시간 */
  lastUpdated: Date | null;
}

/**
 * 아모레몰 Edge Case: 브랜드 페이지 이벤트 매핑
 *
 * 브랜드 페이지에서는 GA4 표준 select_item 대신 커스텀 brand_product_click 이벤트를 사용합니다.
 * 이는 아모레몰 한정 구현입니다.
 *
 * 관련 페이지 타입:
 * - BRAND_MAIN: 브랜드 메인 페이지
 * - BRAND_PRODUCT_LIST: 브랜드 상품 목록 페이지
 * - URL 패턴: /display/brand
 */
const AMOREMALL_BRAND_PAGE_EDGE_CASES = {
  /** 브랜드 페이지에서 차단할 이벤트 */
  blockedEvents: ['select_item'],
  /** 브랜드 페이지에서 대신 사용할 이벤트 */
  replacementEvent: 'brand_product_click',
  /** 브랜드 페이지 판별 조건 */
  isBrandPage: (pageType: PageType, url?: string): boolean => {
    // AP_DATA_PAGETYPE 기반 판별
    const brandPageTypes = ['BRAND_MAIN', 'BRAND_PRODUCT_LIST', 'BRAND_EVENT_LIST', 'BRAND_CUSTOM_ETC', 'BRAND_LIST'];
    if (brandPageTypes.includes(pageType)) {
      return true;
    }
    // URL 패턴 기반 판별
    if (url && /\/display\/brand/i.test(url)) {
      return true;
    }
    return false;
  },
  /** 차단 사유 메시지 */
  blockReason: '[아모레몰] 브랜드 페이지에서는 select_item 대신 brand_product_click 이벤트를 사용합니다',
};

/**
 * CSS Selector 검증 결과
 */
export interface SelectorVerificationResult {
  /** 이벤트명 */
  eventName: string;
  /** 트리거에서 요구하는 CSS Selector */
  requiredSelector: string;
  /** 해당 Selector가 페이지에 존재하는지 */
  exists: boolean;
  /** 발견된 요소 개수 */
  elementCount: number;
  /** 샘플 요소 정보 (디버깅용) */
  sampleElements?: string[];
}

/**
 * UI 검증 결과
 */
export interface UIVerificationResult {
  eventName: string;
  /** UI가 존재하는지 여부 */
  hasUI: boolean;
  /** Vision AI의 판단 이유 */
  reason: string;
  /** 확신도 */
  confidence: 'high' | 'medium' | 'low';
  /** 발견된 UI 요소 설명 */
  foundUIElements?: string;
}

/**
 * 통합 이벤트 분석 결과
 */
export interface IntegratedEventAnalysisResult {
  /** 분석한 URL */
  url: string;
  /** 페이지 타입 */
  pageType: PageType;
  /** 페이지 타입 설명 */
  pageTypeDescription: string;

  /** 실제로 발생 가능한 이벤트 (GTM 가능 + UI 존재) */
  actuallyCanFire: ActualEventResult[];
  /** GTM은 가능하지만 UI가 없어서 발생 불가능한 이벤트 */
  noUIEvents: ActualEventResult[];
  /** GTM 조건 미충족으로 발생 불가능한 이벤트 */
  gtmBlockedEvents: EventEvaluationResult[];
  /** 자동 수집 이벤트 */
  autoCollectedEvents: string[];

  /** 분석 요약 */
  summary: string;
  /** Vision AI의 전체 분석 */
  visionAnalysis?: string;
}

/**
 * 이벤트 파라미터 정보 (GA4 API 매핑 포함)
 */
export interface EventParameterInfo {
  /** 총 파라미터 수 */
  total: number;
  /** GA4 표준 파라미터 수 */
  standard: number;
  /** Custom 파라미터 수 (GA4 등록 필요) */
  custom: number;
  /** items 배열 포함 여부 */
  hasItems: boolean;
  /** 파라미터 상세 목록 */
  parameters: Array<{
    ga4Key: string;
    devGuideVar: string;
    ga4ApiDimension: string;
    isCustomDimension: boolean;
    category: 'common' | 'event' | 'user' | 'item';
    description: string;
  }>;
}

/**
 * 실제 이벤트 발생 가능 결과
 */
export interface ActualEventResult {
  eventName: string;
  description: string;
  /** GTM 트리거 정보 */
  triggerInfo: {
    triggerName: string;
    triggerType: string;
    /** CSS Selector 조건 (있는 경우) */
    cssSelector?: string;
  }[];
  /** UI 검증 결과 */
  uiVerification: UIVerificationResult;
  /** CSS Selector 검증 결과 (있는 경우) */
  selectorVerification?: SelectorVerificationResult;
  /** 이벤트 카테고리 */
  category: string;
  /** 사용자 액션 필요 여부 */
  requiresUserAction: boolean;
  /** 수집 파라미터 정보 (PARAM_MAPPING_TABLE.md 기반) */
  parameterInfo?: EventParameterInfo;
}

/**
 * 통합 이벤트 분석기
 */
export class IntegratedEventAnalyzer {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private gtmAnalyzer: GTMAnalyzer;
  private gtmPageMappingExtractor: GTMPageMappingExtractor;
  private devGuideParser?: DevelopmentGuideParser;
  private parsedDevGuide?: DevelopmentGuideParseResult;

  /** 미리 로드된 설정 (빠른 분석용) */
  private preloadedConfig?: PreloadedGTMConfig;

  /** GA4 실제 데이터 피드백 캐시 (시스템 프롬프트 작성 시까지 사용) */
  private ga4FeedbackCache: GA4FeedbackCache = {
    pageEvents: new Map(),
    eventCounts: new Map(),
    lastUpdated: null,
  };

  /** GA4 피드백 루프 활성화 여부 */
  private useGA4Feedback: boolean = true;

  constructor(apiKey: string, gtmJsonPath: string, devGuidePdfPath?: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
    });
    this.gtmAnalyzer = new GTMAnalyzer(gtmJsonPath);

    // GTM 페이지 매핑 추출기 초기화 (하드코딩 대신 동적 추출)
    this.gtmPageMappingExtractor = new GTMPageMappingExtractor(gtmJsonPath);

    // 개발가이드 PDF 경로가 주어지면 파서 초기화
    if (devGuidePdfPath) {
      this.devGuideParser = new DevelopmentGuideParser(devGuidePdfPath);
    }
  }

  /**
   * 미리 로드된 설정을 사용하여 IntegratedEventAnalyzer를 생성합니다.
   * 이 방법이 훨씬 빠릅니다 (PDF 파싱을 건너뜀).
   *
   * @param apiKey Gemini API 키
   * @param preloadedConfig 미리 로드된 GTM 설정
   */
  static fromPreloadedConfig(apiKey: string, preloadedConfig: PreloadedGTMConfig): IntegratedEventAnalyzer {
    const analyzer = new IntegratedEventAnalyzer(
      apiKey,
      preloadedConfig.sources.gtmJsonPath,
      preloadedConfig.sources.devGuidePdfPath
    );

    // 미리 로드된 설정 적용
    analyzer.preloadedConfig = preloadedConfig;

    // 개발가이드 파싱 결과도 적용
    if (preloadedConfig.eventDefinitions.length > 0) {
      analyzer.parsedDevGuide = {
        events: preloadedConfig.eventDefinitions,
        success: true,
        sourceFile: preloadedConfig.sources.devGuidePdfPath || ''
      };
    }

    return analyzer;
  }

  /**
   * 이벤트의 파라미터 정보를 조회합니다 (PARAM_MAPPING_TABLE.md 기반)
   */
  private getEventParameterInfo(eventName: string): EventParameterInfo | undefined {
    const params = getEventParameters(eventName);
    if (!params) {
      return undefined;
    }

    // summary에서 standard/custom 대신 eventParams/userProperties 사용
    const standardCount = params.parameters.filter(p => !p.isCustomDimension).length;
    const customCount = params.parameters.filter(p => p.isCustomDimension).length;

    // category 타입을 'common' | 'event' | 'user' | 'item'으로 매핑
    const mapCategory = (cat: string): 'common' | 'event' | 'user' | 'item' => {
      if (cat === 'event_common' || cat === 'page_location') return 'common';
      if (cat === 'event_specific' || cat === 'conditional') return 'event';
      if (cat === 'user_id' || cat === 'user_property') return 'user';
      return cat as 'common' | 'event' | 'user' | 'item';
    };

    return {
      total: params.summary.total,
      standard: standardCount,
      custom: customCount,
      hasItems: params.hasItems,
      parameters: params.parameters.map(p => ({
        ga4Key: p.ga4Key,
        devGuideVar: p.devGuideVar,
        ga4ApiDimension: p.ga4ApiDimension,
        isCustomDimension: p.isCustomDimension,
        category: mapCategory(p.category),
        description: p.description,
      })),
    };
  }

  /**
   * 설정 로더에서 직접 생성합니다.
   * 가장 권장되는 방법입니다.
   *
   * @param apiKey Gemini API 키
   * @param configLoader 이미 preload()를 호출한 GTMConfigLoader
   */
  static fromConfigLoader(apiKey: string, configLoader: GTMConfigLoader): IntegratedEventAnalyzer {
    if (!configLoader.isLoaded()) {
      throw new Error('GTMConfigLoader가 아직 로드되지 않았습니다. preload()를 먼저 호출하세요.');
    }
    return IntegratedEventAnalyzer.fromPreloadedConfig(apiKey, configLoader.getConfig());
  }

  /**
   * GA4 피드백 루프 비활성화 (시스템 프롬프트 작성 완료 후 호출)
   */
  disableGA4Feedback(): void {
    this.useGA4Feedback = false;
    console.log('   ℹ️ GA4 피드백 루프 비활성화됨');
  }

  /**
   * GA4 실제 데이터로 피드백 캐시 업데이트
   *
   * @param pagePath 페이지 경로
   * @param events 실제 발생한 이벤트 목록과 발생 횟수
   */
  updateGA4FeedbackCache(pagePath: string, events: { eventName: string; count: number }[]): void {
    const eventSet = new Set<string>();
    for (const e of events) {
      eventSet.add(e.eventName);
      const current = this.ga4FeedbackCache.eventCounts.get(e.eventName) || 0;
      this.ga4FeedbackCache.eventCounts.set(e.eventName, current + e.count);
    }
    this.ga4FeedbackCache.pageEvents.set(pagePath, eventSet);
    this.ga4FeedbackCache.lastUpdated = new Date();
  }

  /**
   * 이벤트가 GTM 변수 패턴인지 확인
   * {{...}} 형태는 이벤트가 아닌 GTM 변수
   */
  private isGTMVariable(eventName: string): boolean {
    return EVENT_FILTERING_CONFIG.gtmVariablePattern.test(eventName);
  }

  /**
   * 조건부 이벤트인지 확인하고, 조건을 만족하는지 검사
   *
   * @param eventName 이벤트명
   * @param page Playwright Page 객체 (조건 검사용)
   * @param pageType 현재 페이지 타입
   * @param url 현재 페이지 URL
   * @returns { isConditional, conditionMet, reason }
   */
  private async checkConditionalEvent(
    eventName: string,
    page?: Page,
    pageType?: PageType,
    url?: string
  ): Promise<{ isConditional: boolean; conditionMet: boolean; reason: string }> {
    const config = EVENT_FILTERING_CONFIG.conditionalEvents[eventName];

    if (!config) {
      return { isConditional: false, conditionMet: true, reason: '' };
    }

    // 0. 완전 비활성화된 이벤트 (빈 배열로 모든 페이지에서 차단)
    if (config.condition === 'disabled' || (config.allowedPageTypes && config.allowedPageTypes.length === 0)) {
      return {
        isConditional: true,
        conditionMet: false,
        reason: `[비활성화] ${config.description}`,
      };
    }

    // 1. 페이지 타입 제한 확인
    if (config.allowedPageTypes && config.allowedPageTypes.length > 0) {
      if (!pageType || !config.allowedPageTypes.includes(pageType)) {
        return {
          isConditional: true,
          conditionMet: false,
          reason: `[페이지 타입 제한] ${eventName}은(는) ${config.allowedPageTypes.join(', ')} 페이지에서만 발생 (현재: ${pageType || 'unknown'})`,
        };
      }
    }

    // 2. URL 패턴 제한 확인
    if (config.allowedUrlPatterns && config.allowedUrlPatterns.length > 0 && url) {
      const matchesPattern = config.allowedUrlPatterns.some(pattern => pattern.test(url));
      if (!matchesPattern) {
        return {
          isConditional: true,
          conditionMet: false,
          reason: `[URL 패턴 제한] ${eventName}은(는) 특정 URL 패턴에서만 발생`,
        };
      }
    }

    // 조건부 이벤트임
    if (!page) {
      // Playwright가 없으면 조건 검사 불가 - 페이지 타입/URL 통과했으면 허용
      if (config.allowedPageTypes || config.allowedUrlPatterns) {
        // 페이지 타입/URL 체크는 통과했으므로 허용
        return { isConditional: true, conditionMet: true, reason: '' };
      }
      return {
        isConditional: true,
        conditionMet: false,
        reason: `[조건부 이벤트] ${config.description} - 조건 검사 불가`,
      };
    }

    // 3. 필수 요소가 있는 경우 DOM에서 확인
    if (config.requiredElement) {
      try {
        const elements = await page.$$(config.requiredElement);
        const exists = elements.length > 0;
        return {
          isConditional: true,
          conditionMet: exists,
          reason: exists
            ? `[조건부 이벤트] ${config.requiredElement} 요소 발견 (${elements.length}개)`
            : `[조건부 이벤트] ${config.description} - 필요 요소 없음`,
        };
      } catch {
        return {
          isConditional: true,
          conditionMet: false,
          reason: `[조건부 이벤트] 요소 검사 실패`,
        };
      }
    }

    // 4. 특수 조건 (예: performance_threshold)
    if (config.condition === 'performance_threshold') {
      // 성능 임계값은 실시간으로 판단 어려움 - 기본적으로 차단
      return {
        isConditional: true,
        conditionMet: false,
        reason: `[조건부 이벤트] ${config.description} - 성능 조건 미충족 가정`,
      };
    }

    // 페이지 타입/URL 체크만 있는 경우 (필수 요소 없음) - 이미 통과했으므로 허용
    if (config.allowedPageTypes || config.allowedUrlPatterns) {
      return { isConditional: true, conditionMet: true, reason: '' };
    }

    return { isConditional: true, conditionMet: false, reason: config.description };
  }

  /**
   * GA4 피드백 캐시에서 이벤트가 실제로 발생했는지 확인
   *
   * @param eventName 이벤트명
   * @param pagePath 페이지 경로 (선택)
   * @returns 실제 발생 여부 및 발생 횟수
   */
  private checkGA4Feedback(eventName: string, pagePath?: string): { exists: boolean; count: number } {
    if (!this.useGA4Feedback || !this.ga4FeedbackCache.lastUpdated) {
      return { exists: true, count: 0 }; // 피드백 없으면 기본적으로 허용
    }

    // 특정 페이지에서 확인
    if (pagePath) {
      const pageEvents = this.ga4FeedbackCache.pageEvents.get(pagePath);
      if (pageEvents) {
        return {
          exists: pageEvents.has(eventName),
          count: this.ga4FeedbackCache.eventCounts.get(eventName) || 0,
        };
      }
    }

    // 전체 이벤트에서 확인
    const count = this.ga4FeedbackCache.eventCounts.get(eventName) || 0;
    return { exists: count > 0, count };
  }

  /**
   * 이벤트 필터링 (GTM 변수, 조건부, GA4 피드백 적용)
   *
   * @param events 필터링할 이벤트 목록
   * @param page Playwright Page 객체
   * @param pagePath 페이지 경로 (GA4 피드백용)
   * @param pageType 현재 페이지 타입 (조건부 이벤트 체크용)
   * @param url 현재 페이지 URL (조건부 이벤트 체크용)
   * @returns 필터링된 이벤트와 차단된 이벤트
   */
  private async filterEvents(
    events: { eventName: string; triggerResults: any[] }[],
    page?: Page,
    pagePath?: string,
    pageType?: PageType,
    url?: string
  ): Promise<{
    filtered: typeof events;
    blocked: EventEvaluationResult[];
  }> {
    const filtered: typeof events = [];
    const blocked: EventEvaluationResult[] = [];

    for (const event of events) {
      // 1. GTM 변수 패턴 필터링
      if (this.isGTMVariable(event.eventName)) {
        blocked.push({
          eventName: event.eventName,
          canFire: false,
          summary: `[GTM 변수] ${event.eventName}은 이벤트가 아닌 GTM 내부 변수입니다`,
          triggerResults: event.triggerResults,
          blockedByVariableDeclaration: false,
        });
        continue;
      }

      // 2. 조건부 이벤트 확인 (페이지 타입, URL 패턴, 필수 요소 체크)
      const conditionalCheck = await this.checkConditionalEvent(event.eventName, page, pageType, url);
      if (conditionalCheck.isConditional && !conditionalCheck.conditionMet) {
        blocked.push({
          eventName: event.eventName,
          canFire: false,
          summary: conditionalCheck.reason,
          triggerResults: event.triggerResults,
          blockedByVariableDeclaration: false,
        });
        continue;
      }

      // 3. GA4 피드백 확인 (피드백 활성화 시)
      if (this.useGA4Feedback && pagePath) {
        const ga4Check = this.checkGA4Feedback(event.eventName, pagePath);
        if (this.ga4FeedbackCache.lastUpdated && !ga4Check.exists) {
          // GA4에서 한 번도 수집되지 않은 이벤트는 낮은 우선순위로 처리
          // 완전히 차단하지 않고 경고만 추가 (나중에 발생할 수 있음)
          console.log(`   ⚠️ [GA4 피드백] ${event.eventName}: GA4에서 수집 기록 없음`);
        }
      }

      // 필터 통과
      filtered.push(event);
    }

    return { filtered, blocked };
  }

  /**
   * 개발가이드를 파싱합니다 (한 번만 수행)
   */
  async loadDevGuide(): Promise<DevelopmentGuideParseResult | null> {
    if (!this.devGuideParser) {
      return null;
    }
    if (!this.parsedDevGuide) {
      this.parsedDevGuide = await this.devGuideParser.parse();
    }
    return this.parsedDevGuide;
  }

  /**
   * 개발가이드에서 이벤트 정의를 가져옵니다.
   */
  getEventFromDevGuide(eventName: string): ParsedEventDefinition | undefined {
    if (!this.parsedDevGuide || !this.parsedDevGuide.success) {
      return undefined;
    }
    return this.parsedDevGuide.events.find(e => e.eventName === eventName);
  }

  /**
   * 이벤트가 해당 페이지에서 발생 가능한지 확인합니다.
   *
   * 다음 소스를 순서대로 확인합니다:
   * 1. GTM 트리거 조건 (동적 추출) - 가장 신뢰도 높음
   * 2. 개발가이드 PDF 파싱 결과 - 보조 정보
   * 3. GA4 E-commerce 표준 매핑 - 최종 fallback
   *
   * 하드코딩된 DATALAYER_EVENT_PAGE_MAPPING, VARIABLE_PAGE_MAPPING은 더 이상 사용하지 않습니다.
   */
  isEventAllowedOnPage(eventName: string, pageType: PageType): { allowed: boolean; reason?: string; confidence?: number } {
    // 미리 로드된 설정이 있으면 사용 (훨씬 빠름)
    if (this.preloadedConfig) {
      return this.isEventAllowedOnPageFast(eventName, pageType);
    }

    // 1. GTM 트리거 조건으로 확인 (동적 추출 - 가장 신뢰도 높음)
    const gtmCheck = this.gtmPageMappingExtractor.isEventAllowedOnPage(eventName, pageType);

    // GTM에서 명확히 차단된 경우 (높은 신뢰도)
    if (!gtmCheck.allowed && gtmCheck.confidence >= 75) {
      return {
        allowed: false,
        reason: `[GTM 동적 분석] ${gtmCheck.reason}`,
        confidence: gtmCheck.confidence
      };
    }

    // 2. 개발가이드에서 추가 확인 (보조 정보)
    const eventDef = this.getEventFromDevGuide(eventName);
    if (eventDef) {
      const allowedPages = eventDef.allowedPageTypes;

      // 개발가이드에서 모든 페이지 허용
      if (allowedPages.includes('ALL') || allowedPages.length === 0) {
        return { allowed: true, confidence: 80 };
      }

      // 개발가이드에서 해당 페이지 허용
      if (allowedPages.includes(pageType)) {
        return { allowed: true, confidence: 85 };
      }

      // 개발가이드에서 차단 (GTM에서는 허용이지만 개발가이드에서 차단)
      // GTM 신뢰도가 낮은 경우에만 개발가이드를 따름
      if (gtmCheck.confidence < 50) {
        return {
          allowed: false,
          reason: `[개발가이드] "${eventDef.firingCondition}" - 허용 페이지: ${allowedPages.join(', ')}`,
          confidence: 70
        };
      }
    }

    // 3. GA4 E-commerce 표준 매핑 확인 (최종 fallback)
    // GTM과 개발가이드에서 정보를 얻지 못한 경우
    if (gtmCheck.confidence < 50) {
      const ga4Mapping = DevelopmentGuideParser.getGA4StandardMapping(eventName);
      if (ga4Mapping) {
        const allowed = ga4Mapping.includes(pageType);
        return {
          allowed,
          reason: allowed
            ? `[GA4 표준] ${ga4Mapping.join(', ')} 페이지에서 허용`
            : `[GA4 표준] ${ga4Mapping.join(', ')} 페이지에서만 허용 (현재: ${pageType})`,
          confidence: 60
        };
      }
    }

    // GTM 결과 반환 (개발가이드에 없는 경우 또는 GTM 신뢰도가 높은 경우)
    return {
      allowed: gtmCheck.allowed,
      reason: gtmCheck.reason,
      confidence: gtmCheck.confidence
    };
  }

  /**
   * GTM 트리거 이름 기반 추론이 부정확한 이벤트 목록
   * 이 이벤트들은 dataLayer 커스텀 이벤트로 발생하므로
   * GTM 트리거 이름에서 페이지 타입을 추론하면 안 됨
   */
  private static GTM_INFERENCE_UNRELIABLE_EVENTS = new Set([
    'add_to_cart',      // 장바구니 담기 버튼 클릭 → 모든 상품 관련 페이지에서 가능
    'begin_checkout',   // 바로구매/결제하기 버튼 → PRODUCT_DETAIL, CART 등에서 가능
    'remove_from_cart', // 장바구니 삭제
  ]);

  /**
   * 미리 로드된 설정을 사용하여 이벤트 허용 여부를 빠르게 확인합니다.
   */
  private isEventAllowedOnPageFast(eventName: string, pageType: PageType): { allowed: boolean; reason?: string; confidence?: number } {
    const config = this.preloadedConfig!;

    // GTM 트리거 추론이 부정확한 이벤트는 개발가이드/GA4 표준 먼저 확인
    const isGtmInferenceUnreliable = IntegratedEventAnalyzer.GTM_INFERENCE_UNRELIABLE_EVENTS.has(eventName);

    // 0. [Edge Case] conditionalEvents 우선 확인 (아모레몰 등 특수 케이스)
    // conditionalEvents에 정의된 allowedPageTypes가 GTM 매핑보다 우선함
    const conditionalEvent = EVENT_FILTERING_CONFIG.conditionalEvents[eventName];
    if (conditionalEvent && conditionalEvent.allowedPageTypes) {
      if (conditionalEvent.allowedPageTypes.includes(pageType)) {
        return {
          allowed: true,
          reason: `[Edge Case] ${conditionalEvent.description}`,
          confidence: 95
        };
      }
      // Edge Case에서 명시적으로 허용하지 않으면 GTM 확인으로 계속 진행
    }

    // 1. GTM 이벤트 매핑 확인 (가장 높은 우선순위 - 단, 추론이 신뢰할 수 있는 경우만)
    const gtmMapping = config.eventPageMappings.get(eventName);
    if (!isGtmInferenceUnreliable && gtmMapping && gtmMapping.confidence >= 75) {
      if (gtmMapping.allowedPageTypes.includes(pageType)) {
        return {
          allowed: true,
          reason: `[GTM] ${gtmMapping.allowedPageTypes.join(', ')} 페이지에서 허용`,
          confidence: gtmMapping.confidence
        };
      } else {
        // conditionalEvents에서 허용하지 않고 GTM에서도 허용하지 않는 경우만 차단
        return {
          allowed: false,
          reason: `[GTM 동적 분석] ${gtmMapping.allowedPageTypes.join(', ')} 페이지에서만 허용 (현재: ${pageType})`,
          confidence: gtmMapping.confidence
        };
      }
    }

    // 2. 개발가이드 확인
    const devGuideEvent = config.eventDefinitions.find(e => e.eventName === eventName);
    if (devGuideEvent && devGuideEvent.allowedPageTypes.length > 0) {
      if (devGuideEvent.allowedPageTypes.includes(pageType) || devGuideEvent.allowedPageTypes.includes('ALL')) {
        return {
          allowed: true,
          reason: `[개발가이드] ${devGuideEvent.firingCondition}`,
          confidence: 80
        };
      } else {
        return {
          allowed: false,
          reason: `[개발가이드] "${devGuideEvent.firingCondition}" - 허용 페이지: ${devGuideEvent.allowedPageTypes.join(', ')}`,
          confidence: 70
        };
      }
    }

    // 3. GA4 표준 매핑 확인
    const ga4Mapping = config.ga4StandardMappings[eventName];
    if (ga4Mapping) {
      if (ga4Mapping.includes(pageType)) {
        return {
          allowed: true,
          reason: `[GA4 표준] ${ga4Mapping.join(', ')} 페이지에서 허용`,
          confidence: 70
        };
      } else {
        return {
          allowed: false,
          reason: `[GA4 표준] ${ga4Mapping.join(', ')} 페이지에서만 허용 (현재: ${pageType})`,
          confidence: 70
        };
      }
    }

    // 4. GTM 매핑 (낮은 신뢰도)
    if (gtmMapping) {
      return {
        allowed: gtmMapping.allowedPageTypes.includes(pageType),
        reason: gtmMapping.allowedPageTypes.includes(pageType)
          ? `[GTM] 허용`
          : `[GTM] ${gtmMapping.allowedPageTypes.join(', ')} (현재: ${pageType})`,
        confidence: gtmMapping.confidence
      };
    }

    // 기본: 허용
    return {
      allowed: true,
      reason: '매핑 정보 없음 - 기본 허용',
      confidence: 30
    };
  }

  /**
   * URL과 스크린샷을 기반으로 실제 발생 가능한 이벤트를 분석합니다.
   *
   * @param url 분석할 URL
   * @param screenshotPath 스크린샷 파일 경로
   * @param playwrightPage (선택) Playwright Page 객체 - CSS Selector 검증에 사용
   * @param options (선택) 분석 옵션
   * @param options.skipVision Vision AI UI 검증을 건너뜁니다 (토큰 절약, 병렬 처리용)
   */
  async analyzeEventsForPage(
    url: string,
    screenshotPath: string,
    playwrightPage?: Page,
    options?: { skipVision?: boolean }
  ): Promise<IntegratedEventAnalysisResult> {
    // 0. 개발가이드 로드
    await this.loadDevGuide();

    // 1. 페이지 타입 감지 (종합적으로 여러 신호를 분석)
    let pageType: PageType;
    let pageTypeResult: ComprehensivePageTypeResult | undefined;

    if (playwrightPage) {
      // 종합 페이지 타입 감지 (URL + Query Params + 전역변수 + dataLayer + DOM)
      pageTypeResult = await detectPageTypeComprehensive(playwrightPage, url);
      pageType = pageTypeResult.pageType;

      console.log(`   📍 페이지 타입: ${pageType} (신뢰도: ${pageTypeResult.confidence}%)`);
      if (pageTypeResult.hasConflict) {
        console.log(`   ⚠️ 신호 불일치 감지됨`);
      }
      // 상위 신호 출력
      const topSignals = pageTypeResult.signals
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3);
      for (const signal of topSignals) {
        console.log(`      - [${signal.source}] ${signal.pageType}: ${signal.detail}`);
      }
    } else {
      // Playwright가 없으면 URL 패턴으로만 감지
      pageType = detectPageTypeFromUrl(url);
      console.log(`   📍 페이지 타입 (URL 패턴만): ${pageType}`);
    }

    const pageTypeDescription = getPageTypeDescription(pageType);

    // 2. GTM 분석 - 기술적으로 가능한 이벤트 목록
    const gtmResult = this.gtmAnalyzer.getEventsForPage(pageType, { webOnly: true });

    // 3. 개발가이드 기준으로 필터링
    // GTM에서 가능하다고 해도 개발가이드에서 해당 페이지가 아니면 제외
    const devGuideBlockedEvents: EventEvaluationResult[] = [];
    let eventsAfterDevGuideFilter: typeof gtmResult.canFireEvents = [];

    for (const gtmEvent of gtmResult.canFireEvents) {
      const devGuideCheck = this.isEventAllowedOnPage(gtmEvent.eventName, pageType);
      if (devGuideCheck.allowed) {
        eventsAfterDevGuideFilter.push(gtmEvent);
      } else {
        // 개발가이드에서 허용하지 않는 이벤트
        devGuideBlockedEvents.push({
          eventName: gtmEvent.eventName,
          canFire: false,
          summary: devGuideCheck.reason || '개발가이드에서 이 페이지에서의 발생을 허용하지 않음',
          triggerResults: gtmEvent.triggerResults,
          blockedByVariableDeclaration: false,
        });
      }
    }

    // 3-1. [아모레몰 Edge Case] 브랜드 페이지에서 select_item → brand_product_click 대체
    const isBrandPage = AMOREMALL_BRAND_PAGE_EDGE_CASES.isBrandPage(pageType, url);
    if (isBrandPage) {
      console.log(`   🏷️ [아모레몰] 브랜드 페이지 감지 - select_item 차단, brand_product_click 사용`);

      // select_item을 차단 목록으로 이동
      const blockedByEdgeCase = eventsAfterDevGuideFilter.filter(
        e => AMOREMALL_BRAND_PAGE_EDGE_CASES.blockedEvents.includes(e.eventName)
      );

      for (const event of blockedByEdgeCase) {
        devGuideBlockedEvents.push({
          eventName: event.eventName,
          canFire: false,
          summary: AMOREMALL_BRAND_PAGE_EDGE_CASES.blockReason,
          triggerResults: event.triggerResults,
          blockedByVariableDeclaration: false,
        });
      }

      // 필터링된 목록에서 select_item 제거
      eventsAfterDevGuideFilter = eventsAfterDevGuideFilter.filter(
        e => !AMOREMALL_BRAND_PAGE_EDGE_CASES.blockedEvents.includes(e.eventName)
      );

      // brand_product_click 이벤트 처리
      // GTM에 있는 경우: CUSTOM_EVENT 트리거를 추가하여 CSS Selector 검증을 우회
      // GTM에 없는 경우: 직접 추가
      const existingBrandProductClick = eventsAfterDevGuideFilter.find(e => e.eventName === 'brand_product_click');
      if (existingBrandProductClick) {
        // GTM에서 온 brand_product_click에 CUSTOM_EVENT 트리거 추가
        // 이렇게 하면 CSS Selector 검증을 건너뛰게 됨
        existingBrandProductClick.triggerResults.push({
          canFire: true,
          triggerName: 'Brand Product Click Trigger (Edge Case)',
          triggerType: 'CUSTOM_EVENT',
          reason: '[아모레몰] 브랜드 페이지 Edge Case - CSS Selector 검증 우회',
          filterResults: [],
          hasVariableDeclarationIssue: false,
        });
      } else {
        // GTM에 없으면 직접 추가
        eventsAfterDevGuideFilter.push({
          eventName: 'brand_product_click',
          canFire: true,
          summary: '[아모레몰] 브랜드 페이지에서 상품 클릭 시 발생하는 커스텀 이벤트',
          triggerResults: [{
            canFire: true,
            triggerName: 'Brand Product Click Trigger (Edge Case)',
            triggerType: 'CUSTOM_EVENT',
            reason: '브랜드 페이지에서 상품 클릭 시 발생',
            filterResults: [],
            hasVariableDeclarationIssue: false,
          }],
          blockedByVariableDeclaration: false,
        });
      }
    }

    // 3-2. [Video Event] YouTube iframe 감지 시 video_start, video_progress 자동 추가
    // GA4 Enhanced Measurement는 YouTube 비디오만 자동 추적 (일반 video 태그, Shoppable Live 등은 미지원)
    if (playwrightPage) {
      const videoDetection = await this.detectVideoElements(playwrightPage);

      // YouTube가 있을 때만 video_start/video_progress 추가
      if (videoDetection.youtubeCount > 0) {
        console.log(`   🎬 YouTube 감지됨: ${videoDetection.youtubeCount}개`);

        // video_start가 목록에 없으면 추가
        const hasVideoStart = eventsAfterDevGuideFilter.some(e => e.eventName === 'video_start');
        if (!hasVideoStart) {
          eventsAfterDevGuideFilter.push({
            eventName: 'video_start',
            canFire: true,
            summary: `[YouTube 감지] ${videoDetection.youtubeCount}개 - 비디오 재생 시 발생`,
            triggerResults: [{
              canFire: true,
              triggerName: 'YouTube Video Trigger (Auto-detected)',
              triggerType: 'YOUTUBE_VIDEO',
              reason: `YouTube iframe ${videoDetection.youtubeCount}개 감지`,
              filterResults: [],
              hasVariableDeclarationIssue: false,
            }],
            blockedByVariableDeclaration: false,
          });
        }

        // video_progress가 목록에 없으면 추가
        const hasVideoProgress = eventsAfterDevGuideFilter.some(e => e.eventName === 'video_progress');
        if (!hasVideoProgress) {
          eventsAfterDevGuideFilter.push({
            eventName: 'video_progress',
            canFire: true,
            summary: `[YouTube 감지] ${videoDetection.youtubeCount}개 - 비디오 10%, 25%, 50%, 75% 진행 시 발생`,
            triggerResults: [{
              canFire: true,
              triggerName: 'YouTube Video Trigger (Auto-detected)',
              triggerType: 'YOUTUBE_VIDEO',
              reason: `YouTube iframe ${videoDetection.youtubeCount}개 감지`,
              filterResults: [],
              hasVariableDeclarationIssue: false,
            }],
            blockedByVariableDeclaration: false,
          });
        }
      } else if (videoDetection.hasVideo) {
        // YouTube 외 비디오는 로그만 출력 (video_start/video_progress 미추가)
        console.log(`   📹 비YouTube 비디오 감지됨: ${videoDetection.details} (GA4 video 이벤트 미지원)`);
      }
    }

    // 3-3. 이벤트 필터링 (GTM 변수 패턴, 조건부 이벤트, GA4 피드백)
    const pagePath = new URL(url).pathname;
    const filterResult = await this.filterEvents(eventsAfterDevGuideFilter, playwrightPage, pagePath, pageType, url);
    eventsAfterDevGuideFilter = filterResult.filtered as typeof eventsAfterDevGuideFilter;
    for (const blocked of filterResult.blocked) {
      devGuideBlockedEvents.push(blocked);
    }

    if (filterResult.blocked.length > 0) {
      console.log(`   🔍 필터링됨: ${filterResult.blocked.map(e => e.eventName).join(', ')}`);
    }

    // 3-4. [아모레몰 Edge Case] qualified_visit 모든 페이지에서 자동 추가
    // 조건: 10초 체류 OR 스크롤 50%/90% OR 영상 50% 시청 시 발생
    // 모든 페이지에서 발생 가능하므로 필터링 후 강제 추가
    const hasQualifiedVisit = eventsAfterDevGuideFilter.some(e => e.eventName === 'qualified_visit');
    if (!hasQualifiedVisit) {
      eventsAfterDevGuideFilter.push({
        eventName: 'qualified_visit',
        canFire: true,
        summary: '[아모레몰 Edge Case] 품질 방문 추적 - 10초 체류, 스크롤 50%/90%, 또는 영상 50% 시청 시 발생',
        triggerResults: [{
          canFire: true,
          triggerName: 'Qualified Visit Trigger (Edge Case)',
          triggerType: 'CUSTOM_EVENT',
          reason: '모든 페이지에서 조건 충족 시 발생',
          filterResults: [],
          hasVariableDeclarationIssue: false,
        }],
        blockedByVariableDeclaration: false,
      });
      console.log(`   📌 [Edge Case] qualified_visit 자동 추가 (모든 페이지 발생 가능)`);
    }

    // 4. CSS Selector 검증 (Playwright Page가 제공된 경우)
    // 중요: CUSTOM_EVENT 트리거가 있는 이벤트는 CSS Selector 검증을 건너뜀
    // 예: ap_click은 CLICK 트리거(CSS Selector 필요)와 CUSTOM_EVENT 트리거(commonEvent)를 모두 가짐
    //     CUSTOM_EVENT 트리거로 발생 가능하므로 CSS Selector가 없어도 이벤트 발생 가능
    const selectorVerifications: Map<string, SelectorVerificationResult> = new Map();
    const eventsWithCustomEventTrigger = new Set<string>(); // CUSTOM_EVENT 트리거가 있는 이벤트 추적

    if (playwrightPage) {
      for (const gtmEvent of eventsAfterDevGuideFilter) {
        // 먼저 이 이벤트에 CUSTOM_EVENT 트리거가 있는지 확인
        // 1) GTM에서 확인
        const hasCustomEventTriggerFromGTM = this.hasCustomEventTrigger(gtmEvent.eventName);
        // 2) Edge Case로 추가된 이벤트의 triggerResults에서 직접 확인
        const hasCustomEventTriggerFromEdgeCase = gtmEvent.triggerResults.some(
          t => t.triggerType === 'CUSTOM_EVENT'
        );

        if (hasCustomEventTriggerFromGTM || hasCustomEventTriggerFromEdgeCase) {
          eventsWithCustomEventTrigger.add(gtmEvent.eventName);
          // CUSTOM_EVENT 트리거가 있으면 CSS Selector 검증 건너뜀
          // (해당 이벤트는 dataLayer push로 발생 가능)
          continue;
        }

        // 트리거에서 CSS Selector 조건 추출
        for (const trigger of gtmEvent.triggerResults) {
          const cssSelector = this.extractCssSelectorFromTrigger(trigger.triggerName, gtmEvent.eventName);
          if (cssSelector) {
            const verification = await this.verifyCssSelector(playwrightPage, gtmEvent.eventName, cssSelector);
            selectorVerifications.set(gtmEvent.eventName, verification);
            break; // 첫 번째 CSS Selector만 검증
          }
        }
      }
    }

    // 5. 이벤트별 CSS Selector 조건 추출 (Vision AI 전달용)
    const eventSelectorMap = this.buildEventSelectorMap(eventsAfterDevGuideFilter);

    // 6. 개발가이드 정보를 Vision AI에 전달할 이벤트 목록 구성
    const eventsToVerify = eventsAfterDevGuideFilter.map(e => e.eventName);

    // 7. Vision AI로 UI 검증 (개발가이드 + CSS Selector 정보 포함)
    let uiVerificationResults: UIVerificationResult[];

    if (options?.skipVision) {
      // Vision AI 스킵 - 모든 이벤트를 UI 있음으로 처리 (GTM/개발가이드 필터링만 적용)
      // 병렬 처리에서 별도 Vision 배치 프로세서를 사용할 때 사용
      uiVerificationResults = eventsToVerify.map(eventName => ({
        eventName,
        hasUI: true,
        reason: '[skipVision] GTM/개발가이드 필터링만 적용됨 - Vision AI 검증 생략',
        confidence: 'medium' as const,
      }));
    } else {
      uiVerificationResults = await this.verifyUIWithVision(
        screenshotPath,
        eventsToVerify,
        pageType,
        eventSelectorMap,
        selectorVerifications
      );

      // 7-1. 연관 이벤트 로직 적용 (login ↔ sign_up 같은 진입점 공유)
      uiVerificationResults = this.applyLinkedEventLogic(uiVerificationResults, eventsToVerify);
    }

    // 8. 결과 분류
    const actuallyCanFire: ActualEventResult[] = [];
    const noUIEvents: ActualEventResult[] = [];
    const selectorBlockedEvents: EventEvaluationResult[] = [];

    for (const gtmEvent of eventsAfterDevGuideFilter) {
      const uiResult = uiVerificationResults.find(r => r.eventName === gtmEvent.eventName);
      const eventReq = getEventUIRequirement(gtmEvent.eventName);
      const devGuideDef = this.getEventFromDevGuide(gtmEvent.eventName);
      const selectorResult = selectorVerifications.get(gtmEvent.eventName);

      // 트리거 정보에 CSS Selector 포함
      const triggerInfo = gtmEvent.triggerResults
        .filter(t => t.canFire)
        .map(t => {
          const selectorInfo = eventSelectorMap.get(gtmEvent.eventName);
          return {
            triggerName: t.triggerName,
            triggerType: t.triggerType,
            cssSelector: selectorInfo?.cssSelector,
          };
        });

      // 개발가이드의 설명이 있으면 우선 사용
      const description = devGuideDef?.firingCondition || eventReq?.description || gtmEvent.eventName;
      const requiresUserAction = devGuideDef?.requiresUserAction ?? eventReq?.requiresUserAction ?? true;

      // CSS Selector 검증 결과 확인 - Selector가 있는데 존재하지 않으면 발생 불가
      if (selectorResult && !selectorResult.exists) {
        selectorBlockedEvents.push({
          eventName: gtmEvent.eventName,
          canFire: false,
          summary: `CSS Selector "${selectorResult.requiredSelector}" 조건의 요소가 페이지에 존재하지 않음 (Playwright 검증)`,
          triggerResults: gtmEvent.triggerResults,
          blockedByVariableDeclaration: false,
        });
        continue; // 이 이벤트는 발생 불가로 분류
      }

      const result: ActualEventResult = {
        eventName: gtmEvent.eventName,
        description,
        triggerInfo,
        uiVerification: uiResult || {
          eventName: gtmEvent.eventName,
          hasUI: true, // UI 검증 결과가 없으면 기본적으로 가능하다고 가정
          reason: 'UI 검증 미수행',
          confidence: 'low',
        },
        selectorVerification: selectorResult,
        category: eventReq?.category || 'unknown',
        requiresUserAction,
        parameterInfo: this.getEventParameterInfo(gtmEvent.eventName),
      };

      // 자동 발생 이벤트는 UI 검증 없이 바로 가능
      const isAutoFire = eventReq?.autoFire || (devGuideDef && !devGuideDef.requiresUserAction);

      if (isAutoFire) {
        actuallyCanFire.push(result);
      } else if (uiResult?.hasUI) {
        actuallyCanFire.push(result);
      } else if (uiResult && !uiResult.hasUI) {
        noUIEvents.push(result);
      } else {
        // UI 검증 결과가 없는 경우 기본적으로 가능하다고 분류
        actuallyCanFire.push(result);
      }
    }

    // 8-1. Vision AI 기반 add_to_cart 추론 적용 (PRODUCT_DETAIL 페이지 한정)
    // 조건: "구매하기" 버튼이 있지만 "장바구니 담기" 관련 UI가 없는 경우
    // → 구매하기 클릭 시 장바구니 담기 옵션이 노출될 수 있음
    const hasAddToCart = actuallyCanFire.some(e => e.eventName === 'add_to_cart');
    const hasBeginCheckout = actuallyCanFire.some(e => e.eventName === 'begin_checkout');

    // Vision AI가 add_to_cart를 hasUI: false로 판단했지만,
    // 구매하기 버튼이 있는 PRODUCT_DETAIL 페이지에서는 add_to_cart 발생 가능
    if (!hasAddToCart && hasBeginCheckout && pageType === 'PRODUCT_DETAIL') {
      // Vision AI가 장바구니 담기 버튼을 못 찾았지만, 구매하기 버튼이 있으면
      // → 구매하기 클릭 시 장바구니 담기 옵션이 노출될 수 있음
      const addToCartNoUI = noUIEvents.find(e => e.eventName === 'add_to_cart');
      if (addToCartNoUI) {
        // noUIEvents에서 제거하고 actuallyCanFire로 이동
        const idx = noUIEvents.indexOf(addToCartNoUI);
        if (idx > -1) {
          noUIEvents.splice(idx, 1);
        }
        actuallyCanFire.push({
          ...addToCartNoUI,
          uiVerification: {
            eventName: 'add_to_cart',
            hasUI: true,
            reason: '구매하기 버튼 클릭 시 장바구니 담기 옵션이 노출될 수 있음 (상품 상세 페이지 특성)',
            confidence: 'medium',
          },
        });
        console.log(`   ✅ [Vision AI 추론] 구매하기 버튼 존재 → add_to_cart 발생 가능 (클릭 후 장바구니 옵션 노출)`);
      } else if (!actuallyCanFire.some(e => e.eventName === 'add_to_cart')) {
        // GTM에서 add_to_cart가 가능으로 판단되었지만 Vision AI 결과에 없는 경우
        const addToCartReq = getEventUIRequirement('add_to_cart');
        actuallyCanFire.push({
          eventName: 'add_to_cart',
          description: addToCartReq?.description || '장바구니 추가 (구매하기 버튼 연계)',
          triggerInfo: [],
          uiVerification: {
            eventName: 'add_to_cart',
            hasUI: true,
            reason: '구매하기 버튼 클릭 시 장바구니 담기 옵션이 노출될 수 있음 (상품 상세 페이지 특성)',
            confidence: 'medium',
          },
          category: 'ecommerce',
          requiresUserAction: true,
          parameterInfo: this.getEventParameterInfo('add_to_cart'),
        });
        console.log(`   ✅ [Vision AI 추론] 구매하기 버튼 존재 → add_to_cart 발생 가능 (클릭 후 장바구니 옵션 노출)`);
      }
    }

    // 8-2. [아모레몰 Edge Case] 브랜드 페이지에서 brand_product_click 처리
    // Vision AI가 상품을 못 찾아도 브랜드 페이지에서는 brand_product_click 발생 가능
    const brandPageTypes = ['BRAND_MAIN', 'BRAND_PRODUCT_LIST', 'BRAND_EVENT_LIST', 'BRAND_CUSTOM_ETC'];
    if (brandPageTypes.includes(pageType)) {
      const brandClickInNoUI = noUIEvents.find(e => e.eventName === 'brand_product_click');
      if (brandClickInNoUI) {
        // noUIEvents에서 제거하고 actuallyCanFire로 이동
        const idx = noUIEvents.indexOf(brandClickInNoUI);
        if (idx > -1) {
          noUIEvents.splice(idx, 1);
        }
        actuallyCanFire.push({
          ...brandClickInNoUI,
          uiVerification: {
            eventName: 'brand_product_click',
            hasUI: true,
            reason: '[아모레몰] 브랜드 페이지에서는 스크롤/로드 후 상품이 노출되어 brand_product_click 발생 가능',
            confidence: 'medium',
          },
        });
        console.log(`   ✅ [Edge Case] ${pageType} 페이지 → brand_product_click 발생 가능`);
      }
    }

    // 9. GTM 차단 이벤트 + 개발가이드 차단 이벤트 + Selector 차단 이벤트 통합
    const allBlockedEvents = [
      ...gtmResult.cannotFireEvents,
      ...selectorBlockedEvents,
      ...devGuideBlockedEvents
    ];

    // 8. 요약 생성
    const summary = this.generateSummary(
      pageType,
      actuallyCanFire,
      noUIEvents,
      allBlockedEvents,
      gtmResult.autoCollectedEvents
    );

    return {
      url,
      pageType,
      pageTypeDescription,
      actuallyCanFire,
      noUIEvents,
      gtmBlockedEvents: allBlockedEvents,
      autoCollectedEvents: gtmResult.autoCollectedEvents,
      summary,
    };
  }

  /**
   * 연관 이벤트 정의
   * 같은 진입점을 공유하고, 페이지 이동 후 redirect로 돌아오는 이벤트들
   *
   * NOTE: sign_up은 아모레몰 edge case로 별도 회원가입 완료 페이지에서만 발생하므로
   * login ↔ sign_up 연관 관계는 제거됨 (conditionalEvents에서 URL 패턴으로 처리)
   */
  private static readonly LINKED_EVENTS: { primary: string; linked: string; reason: string }[] = [
    // 현재 아모레몰 기준으로 연관 이벤트 없음
    // 다른 사이트에서 필요 시 추가 가능
  ];

  /**
   * 연관 이벤트를 기반으로 UI 검증 결과를 보정합니다.
   * 예: login이 가능하면 sign_up도 가능 (같은 진입점 공유)
   */
  private applyLinkedEventLogic(
    uiResults: UIVerificationResult[],
    eventNames: string[]
  ): UIVerificationResult[] {
    const resultMap = new Map<string, UIVerificationResult>();
    for (const result of uiResults) {
      resultMap.set(result.eventName, result);
    }

    for (const link of IntegratedEventAnalyzer.LINKED_EVENTS) {
      const primaryResult = resultMap.get(link.primary);
      const linkedResult = resultMap.get(link.linked);

      // primary 이벤트가 UI 있음으로 확인되고, linked 이벤트가 UI 없음으로 판단된 경우
      if (primaryResult?.hasUI && linkedResult && !linkedResult.hasUI) {
        // linked 이벤트도 가능하다고 보정
        resultMap.set(link.linked, {
          eventName: link.linked,
          hasUI: true,
          reason: link.reason,
          confidence: 'medium',
          foundUIElements: primaryResult.foundUIElements
            ? `${primaryResult.foundUIElements} (${link.primary}와 동일한 진입점)`
            : `${link.primary}와 동일한 진입점 사용`
        });
      }
    }

    // eventNames에 있는 이벤트들만 반환
    return eventNames
      .map(name => resultMap.get(name))
      .filter((r): r is UIVerificationResult => r !== undefined);
  }

  /**
   * Vision AI를 사용하여 이벤트별 UI 존재 여부를 검증합니다.
   */
  private async verifyUIWithVision(
    screenshotPath: string,
    eventNames: string[],
    pageType: PageType,
    eventSelectorMap?: Map<string, { cssSelector: string; triggerName: string }>,
    selectorVerifications?: Map<string, SelectorVerificationResult>
  ): Promise<UIVerificationResult[]> {
    const imageBase64 = await this.imageToBase64(screenshotPath);
    const mimeType = this.getMimeType(screenshotPath);

    // 검증할 이벤트 목록 구성 (자동 발생 이벤트 제외)
    const eventsToCheck = eventNames.filter(name => {
      const req = EVENT_UI_REQUIREMENTS[name];
      return req && !req.autoFire;
    });

    if (eventsToCheck.length === 0) {
      return [];
    }

    const prompt = this.buildUIVerificationPrompt(eventsToCheck, pageType, eventSelectorMap, selectorVerifications);

    try {
      const result = await this.model.generateContent([
        {
          inlineData: {
            mimeType,
            data: imageBase64,
          },
        },
        { text: prompt },
      ]);

      const response = result.response;
      const text = response.text();

      return this.parseUIVerificationResponse(text, eventsToCheck);
    } catch (error: any) {
      console.error('Vision AI UI 검증 오류:', error.message);
      // 오류 시 이벤트 특성에 따라 다르게 처리
      // - autoFire 이벤트: UI 검증 없이도 발생 가능 → hasUI: true
      // - requiresUserAction 이벤트: UI 요소 필요 → 검증 불가 시 hasUI: false
      return eventsToCheck.map(name => {
        const eventReq = EVENT_UI_REQUIREMENTS[name];

        // autoFire 이벤트는 UI 검증 없이도 발생 가능
        if (eventReq?.autoFire) {
          return {
            eventName: name,
            hasUI: true,
            reason: `Vision AI 검증 실패 - 자동 발생 이벤트이므로 발생 가능`,
            confidence: 'medium' as const,
          };
        }

        // requiresUserAction 이벤트는 UI 요소가 필요하므로, 검증 불가 시 발생 불가로 처리
        if (eventReq?.requiresUserAction) {
          return {
            eventName: name,
            hasUI: false,
            reason: `Vision AI 검증 실패 (API 오류) - 사용자 액션 필요 이벤트로 UI 검증 불가 시 발생 불가 처리`,
            confidence: 'low' as const,
          };
        }

        // 정의되지 않은 이벤트는 보수적으로 불가 처리
        return {
          eventName: name,
          hasUI: false,
          reason: `Vision AI 검증 실패 (API 오류) - 이벤트 정의 없음으로 발생 불가 처리`,
          confidence: 'low' as const,
        };
      });
    }
  }

  /**
   * UI 검증 프롬프트 생성
   */
  private buildUIVerificationPrompt(
    eventNames: string[],
    pageType: PageType,
    eventSelectorMap?: Map<string, { cssSelector: string; triggerName: string }>,
    selectorVerifications?: Map<string, SelectorVerificationResult>
  ): string {
    const lines: string[] = [];

    lines.push(`# 페이지 UI 요소 검증 요청`);
    lines.push(`\n현재 페이지: ${getPageTypeDescription(pageType)} (${pageType})`);
    lines.push(`\n이 스크린샷을 분석하여 다음 이벤트들이 발생할 수 있는 UI 요소가 있는지 확인해주세요.`);
    lines.push(`각 이벤트별로 필요한 UI 요소가 화면에 실제로 존재하는지 판단해주세요.\n`);

    lines.push(`## 검증할 이벤트 목록\n`);

    for (const eventName of eventNames) {
      const req = EVENT_UI_REQUIREMENTS[eventName];
      const devGuideDef = this.getEventFromDevGuide(eventName);
      const selectorInfo = eventSelectorMap?.get(eventName);
      const selectorVerification = selectorVerifications?.get(eventName);

      lines.push(`### ${eventName}`);

      // GTM CSS Selector 조건이 있으면 표시 (중요!)
      if (selectorInfo) {
        lines.push(`- **⚠️ [GTM 트리거 조건] CSS Selector**: \`${selectorInfo.cssSelector}\``);
        lines.push(`  - 트리거명: ${selectorInfo.triggerName}`);
        lines.push(`  - 이 이벤트는 위 CSS Selector에 해당하는 HTML 요소가 있어야만 발생합니다.`);

        // Playwright 검증 결과가 있으면 표시
        if (selectorVerification) {
          if (selectorVerification.exists) {
            lines.push(`  - ✅ **HTML 검증 결과**: 해당 요소 ${selectorVerification.elementCount}개 발견됨`);
          } else {
            lines.push(`  - ❌ **HTML 검증 결과**: 해당 요소가 페이지에 존재하지 않음`);
            lines.push(`  - 따라서 이 이벤트는 **발생 불가**로 판단해주세요.`);
          }
        }
      }

      // 개발가이드에서 발화 조건이 있으면 표시
      if (devGuideDef) {
        lines.push(`- **[개발가이드] 이벤트 전송 시점**: ${devGuideDef.firingCondition}`);
        if (devGuideDef.requiredUIElements.length > 0) {
          lines.push(`- **[개발가이드] 필요 UI 요소**: ${devGuideDef.requiredUIElements.join(', ')}`);
        }
        if (devGuideDef.userActionType) {
          lines.push(`- **[개발가이드] 사용자 액션**: ${devGuideDef.userActionType}`);
        }
      }

      if (req) {
        lines.push(`- 설명: ${req.description}`);
        lines.push(`- 필요한 UI: ${req.requiredUI}`);
        lines.push(`- 확인 질문: ${req.visionQuestion}`);
      }
      lines.push('');
    }

    lines.push(`\n## 응답 형식`);
    lines.push(`다음 JSON 형식으로 응답해주세요:`);
    lines.push('```json');
    lines.push(`{
  "verificationResults": [
    {
      "eventName": "이벤트명",
      "hasUI": true/false,
      "reason": "판단 이유 (구체적으로)",
      "confidence": "high/medium/low",
      "foundUIElements": "발견된 UI 요소 설명 (hasUI가 true인 경우)"
    }
  ],
  "pageAnalysis": "페이지 전체 구조에 대한 간단한 설명"
}`);
    lines.push('```');

    lines.push(`\n## 중요 지침`);
    lines.push(`1. **실제로 화면에 보이는 요소만 판단하세요.** 추측하지 마세요.`);
    lines.push(`2. **[개발가이드] 이벤트 전송 시점**을 참고하여 해당 이벤트가 이 화면에서 발생 가능한지 판단하세요.`);
    lines.push(`3. 버튼이나 링크가 있더라도, 해당 이벤트를 발생시킬 수 있는 요소인지 판단하세요.`);
    lines.push(`4. 예를 들어 "장바구니 담기" 버튼이 없으면 add_to_cart는 hasUI: false입니다.`);
    lines.push(`5. 프로모션 배너가 있어도 클릭 가능한 링크가 아니면 select_promotion은 hasUI: false입니다.`);
    lines.push(`6. confidence는 확신도입니다:`);
    lines.push(`   - high: 확실히 보임/보이지 않음`);
    lines.push(`   - medium: 대체로 확실함`);
    lines.push(`   - low: 불확실함`);

    return lines.join('\n');
  }

  /**
   * Vision AI 응답 파싱
   */
  private parseUIVerificationResponse(
    responseText: string,
    eventNames: string[]
  ): UIVerificationResult[] {
    try {
      // JSON 추출
      const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/);
      let jsonStr: string;

      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      } else {
        const jsonStart = responseText.indexOf('{');
        const jsonEnd = responseText.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          jsonStr = responseText.substring(jsonStart, jsonEnd + 1);
        } else {
          throw new Error('JSON을 찾을 수 없습니다.');
        }
      }

      const parsed = JSON.parse(jsonStr);
      const results: UIVerificationResult[] = [];

      if (parsed.verificationResults && Array.isArray(parsed.verificationResults)) {
        for (const item of parsed.verificationResults) {
          results.push({
            eventName: item.eventName,
            hasUI: item.hasUI === true,
            reason: item.reason || '',
            confidence: item.confidence || 'medium',
            foundUIElements: item.foundUIElements,
          });
        }
      }

      // 응답에 없는 이벤트는 기본값으로 추가
      for (const eventName of eventNames) {
        if (!results.find(r => r.eventName === eventName)) {
          results.push({
            eventName,
            hasUI: false,
            reason: 'Vision AI 응답에서 누락됨',
            confidence: 'low',
          });
        }
      }

      return results;
    } catch (error: any) {
      console.error('UI 검증 응답 파싱 오류:', error.message);
      // 파싱 실패 시 모든 이벤트를 불확실로 처리
      return eventNames.map(name => ({
        eventName: name,
        hasUI: false,
        reason: `응답 파싱 오류: ${error.message}`,
        confidence: 'low' as const,
      }));
    }
  }

  /**
   * 분석 요약 생성
   */
  private generateSummary(
    pageType: PageType,
    actuallyCanFire: ActualEventResult[],
    noUIEvents: ActualEventResult[],
    gtmBlockedEvents: EventEvaluationResult[],
    autoCollectedEvents: string[]
  ): string {
    const lines: string[] = [];
    const pageDesc = getPageTypeDescription(pageType);

    lines.push(`## ${pageDesc} (${pageType}) 실제 발생 가능 이벤트 분석\n`);

    // 자동 수집 이벤트
    if (autoCollectedEvents.length > 0) {
      lines.push(`### 🔄 자동 수집 이벤트 (${autoCollectedEvents.length}개)`);
      for (const event of autoCollectedEvents) {
        lines.push(`- ${event}`);
      }
      lines.push('');
    }

    // 실제 발생 가능 이벤트 (자동 발생)
    const autoFireEvents = actuallyCanFire.filter(e => !e.requiresUserAction);
    if (autoFireEvents.length > 0) {
      lines.push(`### ⚡ 자동 발생 이벤트 (${autoFireEvents.length}개)`);
      for (const event of autoFireEvents) {
        lines.push(`- **${event.eventName}** (${event.description})`);
        if (event.uiVerification.foundUIElements) {
          lines.push(`  - UI: ${event.uiVerification.foundUIElements}`);
        }
      }
      lines.push('');
    }

    // 실제 발생 가능 이벤트 (사용자 액션 필요)
    const userActionEvents = actuallyCanFire.filter(e => e.requiresUserAction);
    if (userActionEvents.length > 0) {
      lines.push(`### 👆 사용자 액션 시 발생 가능 이벤트 (${userActionEvents.length}개)`);
      for (const event of userActionEvents) {
        const triggerTypes = [...new Set(event.triggerInfo.map(t => t.triggerType))].join(', ');
        lines.push(`- **${event.eventName}** (${event.description})`);
        lines.push(`  - 트리거: ${triggerTypes}`);
        if (event.uiVerification.foundUIElements) {
          lines.push(`  - UI: ${event.uiVerification.foundUIElements}`);
        }
      }
      lines.push('');
    }

    // UI 없어서 발생 불가능
    if (noUIEvents.length > 0) {
      lines.push(`### ❌ UI 없음으로 발생 불가 (${noUIEvents.length}개)`);
      for (const event of noUIEvents) {
        lines.push(`- **${event.eventName}** (${event.description})`);
        lines.push(`  - 이유: ${event.uiVerification.reason}`);
      }
      lines.push('');
    }

    // GTM 조건 미충족
    const varBlockedEvents = gtmBlockedEvents.filter(e => e.blockedByVariableDeclaration);
    if (varBlockedEvents.length > 0) {
      lines.push(`### 🚫 GTM 변수 미선언으로 발생 불가 (${varBlockedEvents.length}개)`);
      for (const event of varBlockedEvents) {
        lines.push(`- **${event.eventName}**`);
        lines.push(`  - 이유: ${event.summary}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 이미지를 Base64로 변환
   */
  private async imageToBase64(imagePath: string): Promise<string> {
    const imageBuffer = fs.readFileSync(imagePath);
    return imageBuffer.toString('base64');
  }

  /**
   * MIME 타입 추출
   */
  private getMimeType(imagePath: string): string {
    const ext = path.extname(imagePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };
    return mimeTypes[ext] || 'image/png';
  }

  /**
   * GTM 분석 결과에서 이벤트별 CSS Selector 맵을 생성합니다.
   *
   * 중요: CLICK, LINK_CLICK 트리거의 CSS Selector만 포함합니다.
   * CUSTOM_EVENT 트리거의 CSS Selector는 GTM 트리거 조건이 아니므로 제외합니다.
   */
  private buildEventSelectorMap(
    events: { eventName: string; triggerResults: any[] }[]
  ): Map<string, { cssSelector: string; triggerName: string }> {
    const selectorMap = new Map<string, { cssSelector: string; triggerName: string }>();
    const gtmResult = this.gtmAnalyzer.analyze();

    // CLICK 또는 LINK_CLICK 트리거 타입만 CSS Selector 맵에 포함
    const clickTriggerTypes = ['CLICK', 'LINK_CLICK', 'ALL_ELEMENTS', 'JUST_LINKS'];

    for (const event of events) {
      // CUSTOM_EVENT 트리거가 있는 이벤트는 CSS Selector 맵에서 제외
      // (dataLayer push로 발생 가능하므로 CSS Selector 필요 없음)
      if (this.hasCustomEventTrigger(event.eventName)) {
        continue;
      }

      // 해당 이벤트의 트리거에서 CSS Selector 추출
      const triggers = gtmResult.eventTriggerMap.get(event.eventName) || [];
      for (const trigger of triggers) {
        // CUSTOM_EVENT 등 비클릭 트리거는 제외
        if (!clickTriggerTypes.includes(trigger.type)) {
          continue;
        }

        if (trigger.cssSelector) {
          selectorMap.set(event.eventName, {
            cssSelector: trigger.cssSelector,
            triggerName: trigger.name,
          });
          break; // 첫 번째 CSS Selector만 사용
        }

        // 필터에서 CSS_SELECTOR 타입 찾기
        for (const filter of trigger.filters) {
          if (filter.type === 'CSS_SELECTOR' && filter.value) {
            selectorMap.set(event.eventName, {
              cssSelector: filter.value,
              triggerName: trigger.name,
            });
            break;
          }
        }
      }
    }

    return selectorMap;
  }

  /**
   * 이벤트에 CUSTOM_EVENT 트리거가 있는지 확인합니다.
   * CUSTOM_EVENT 트리거가 있으면 dataLayer push로 이벤트 발생이 가능하므로
   * CLICK 트리거의 CSS Selector가 없어도 이벤트가 발생할 수 있습니다.
   */
  private hasCustomEventTrigger(eventName: string): boolean {
    const gtmResult = this.gtmAnalyzer.analyze();
    const triggers = gtmResult.eventTriggerMap.get(eventName) || [];

    // CUSTOM_EVENT 타입 트리거가 있는지 확인
    const customEventTypes = ['CUSTOM_EVENT'];

    for (const trigger of triggers) {
      if (customEventTypes.includes(trigger.type)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 트리거 이름에서 CSS Selector를 추출합니다.
   *
   * 중요: CSS Selector 검증은 CLICK, LINK_CLICK 트리거에만 적용합니다.
   * CUSTOM_EVENT 트리거의 CSS Selector는 웹사이트 내부 로직에서 사용되며,
   * GTM 트리거 조건이 아니므로 검증에서 제외합니다.
   */
  private extractCssSelectorFromTrigger(triggerName: string, eventName: string): string | undefined {
    const gtmResult = this.gtmAnalyzer.analyze();
    const triggers = gtmResult.eventTriggerMap.get(eventName) || [];

    // CLICK 또는 LINK_CLICK 트리거 타입만 CSS Selector 검증 대상
    const clickTriggerTypes = ['CLICK', 'LINK_CLICK', 'ALL_ELEMENTS', 'JUST_LINKS'];

    for (const trigger of triggers) {
      // CUSTOM_EVENT 등 비클릭 트리거는 CSS Selector 검증에서 제외
      if (!clickTriggerTypes.includes(trigger.type)) {
        continue;
      }

      if (trigger.name === triggerName && trigger.cssSelector) {
        return trigger.cssSelector;
      }

      // 필터에서도 찾기
      for (const filter of trigger.filters) {
        if (filter.type === 'CSS_SELECTOR' && filter.value) {
          return filter.value;
        }
      }
    }

    return undefined;
  }

  /**
   * 페이지에서 YouTube iframe 또는 video 요소를 감지합니다.
   * 감지 시 video_start, video_progress 이벤트가 발생 가능함을 의미합니다.
   */
  private async detectVideoElements(page: Page): Promise<{
    hasVideo: boolean;
    details: string;
    youtubeCount: number;
    videoTagCount: number;
    vimeoCount: number;
  }> {
    try {
      // YouTube iframe 감지 (다양한 형식 지원)
      const youtubeSelectors = [
        'iframe[src*="youtube.com"]',
        'iframe[src*="youtube-nocookie.com"]',
        'iframe[src*="youtu.be"]',
        'iframe[data-src*="youtube"]',
        '[class*="youtube-player"]',
        '[id*="youtube"]',
      ];

      let youtubeCount = 0;
      for (const selector of youtubeSelectors) {
        try {
          const elements = await page.$$(selector);
          youtubeCount += elements.length;
        } catch {}
      }

      // HTML5 video 태그 감지
      const videoTags = await page.$$('video');
      const videoTagCount = videoTags.length;

      // Vimeo iframe 감지
      const vimeoElements = await page.$$('iframe[src*="vimeo.com"]');
      const vimeoCount = vimeoElements.length;

      // 기타 비디오 플레이어 감지 (class/id 기반)
      const otherVideoSelectors = [
        '[class*="video-player"]',
        '[class*="video-container"]',
        '[class*="player-wrapper"]',
        '[data-video]',
      ];

      let otherVideoCount = 0;
      for (const selector of otherVideoSelectors) {
        try {
          const elements = await page.$$(selector);
          otherVideoCount += elements.length;
        } catch {}
      }

      const hasVideo = youtubeCount > 0 || videoTagCount > 0 || vimeoCount > 0 || otherVideoCount > 0;

      const details: string[] = [];
      if (youtubeCount > 0) details.push(`YouTube ${youtubeCount}개`);
      if (videoTagCount > 0) details.push(`Video 태그 ${videoTagCount}개`);
      if (vimeoCount > 0) details.push(`Vimeo ${vimeoCount}개`);
      if (otherVideoCount > 0) details.push(`기타 비디오 플레이어 ${otherVideoCount}개`);

      return {
        hasVideo,
        details: details.length > 0 ? details.join(', ') : '비디오 없음',
        youtubeCount,
        videoTagCount,
        vimeoCount,
      };
    } catch (error) {
      return {
        hasVideo: false,
        details: '비디오 감지 실패',
        youtubeCount: 0,
        videoTagCount: 0,
        vimeoCount: 0,
      };
    }
  }

  /**
   * Playwright를 사용하여 CSS Selector가 페이지에 존재하는지 확인합니다.
   */
  private async verifyCssSelector(
    page: Page,
    eventName: string,
    cssSelector: string
  ): Promise<SelectorVerificationResult> {
    try {
      // 요소 찾기
      const elements = await page.$$(cssSelector);
      const elementCount = elements.length;
      const exists = elementCount > 0;

      // 샘플 요소 정보 추출 (최대 3개)
      const sampleElements: string[] = [];
      for (let i = 0; i < Math.min(3, elements.length); i++) {
        try {
          const tagName = await elements[i].evaluate(el => el.tagName.toLowerCase());
          const className = await elements[i].evaluate(el => el.className);
          const id = await elements[i].evaluate(el => el.id);
          const text = await elements[i].evaluate(el => (el.textContent || '').substring(0, 50).trim());

          let desc = `<${tagName}`;
          if (id) desc += ` id="${id}"`;
          if (className) desc += ` class="${className.toString().substring(0, 30)}"`;
          desc += `>`;
          if (text) desc += ` "${text}"`;

          sampleElements.push(desc);
        } catch {
          // 요소 정보 추출 실패 시 무시
        }
      }

      return {
        eventName,
        requiredSelector: cssSelector,
        exists,
        elementCount,
        sampleElements: sampleElements.length > 0 ? sampleElements : undefined,
      };
    } catch (error: any) {
      console.error(`CSS Selector 검증 오류 (${cssSelector}):`, error.message);
      return {
        eventName,
        requiredSelector: cssSelector,
        exists: false,
        elementCount: 0,
      };
    }
  }
}
