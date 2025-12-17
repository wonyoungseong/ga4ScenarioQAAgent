/**
 * 이벤트 정의 빌더
 *
 * 개발가이드 PDF, GTM JSON, 공통변수 appendix를 파싱하여
 * 통합 이벤트 정의를 생성합니다.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  UnifiedEventDefinition,
  EventDefinitionBuildResult,
  GTMTriggerInfo,
  RequiredVariable,
  PageTypeRestriction,
  UIRequirement,
  FiringCondition,
} from '../types/unifiedEventDefinition';
import { PageType } from '../types/pageContext';
import { DevelopmentGuideParser, ParsedEventDefinition } from '../parsers/developmentGuideParser';
import { GTMAnalyzer } from '../analyzers/gtmAnalyzer';

const pdfParse = require('pdf-parse');

/**
 * 아모레몰 Edge Case 정의
 */
const AMOREMALL_EDGE_CASES: Record<string, {
  description: string;
  modification: string;
  pageTypeOverride?: PageType[];
  urlPatternRestriction?: string[];
  disabled?: boolean;
}> = {
  'sign_up': {
    description: '회원가입 완료 페이지에서만 발생',
    modification: '별도 회원가입 완료 페이지가 있어 일반 페이지에서 sign_up 미발생',
    urlPatternRestriction: ['/join', '/signup', '/register'],
  },
  'scroll': {
    description: 'MAIN, PRODUCT_DETAIL, EVENT_DETAIL에서 발생 (GA4 데이터 검증됨)',
    modification: 'GTM Content Group 조건: EVENT_DETAIL에서 40.2%로 가장 높은 발생률',
    pageTypeOverride: ['MAIN', 'PRODUCT_DETAIL', 'EVENT_DETAIL'],
  },
  'login': {
    description: '로그인 완료 후 리다이렉트되는 주요 페이지에서만 발생',
    modification: '로그인 버튼 클릭이 아닌 로그인 완료 시점에 발생',
    pageTypeOverride: ['MAIN', 'PRODUCT_DETAIL', 'PRODUCT_LIST', 'CART', 'MY'],
  },
  'brand_product_click': {
    description: '브랜드 페이지에서만 발생',
    modification: 'select_item 대신 사용',
    pageTypeOverride: ['BRAND_MAIN'],
    urlPatternRestriction: ['/brand/'],
  },
  'brand_store': {
    description: '브랜드 페이지에서만 발생',
    modification: '브랜드 메인 페이지 진입 시 발생',
    pageTypeOverride: ['BRAND_MAIN'],
    urlPatternRestriction: ['/brand/'],
  },
  'view_item_list': {
    description: '검색 결과 페이지에서만 발생',
    modification: '개발가이드 정의에 따라 SEARCH 타입에서만 발생',
    pageTypeOverride: ['SEARCH_RESULT'],
  },
  'view_search_results': {
    description: '검색 결과 페이지에서만 발생',
    modification: 'GA4 표준 이벤트로 검색 수행 시 발생',
    pageTypeOverride: ['SEARCH_RESULT'],
  },
  // video 이벤트는 페이지 타입 제한 없음 - 비디오 요소가 있으면 어디서든 발생
  // pageTypeOverride 제거함
  'view_promotion': {
    description: 'MAIN 페이지에서만 발생 (Key Visual 영역)',
    modification: 'GTM 조건에 따라 메인 페이지 key visual에서만 발생',
    pageTypeOverride: ['MAIN'],
  },
  'withdrawal': {
    description: '회원탈퇴 완료 페이지에서만 발생',
    modification: '별도 회원탈퇴 완료 페이지에서 발생',
    pageTypeOverride: ['MY'],
    urlPatternRestriction: ['/my', '/withdraw'],
  },
  'write_review': {
    description: '리뷰 작성 완료 후 발생',
    modification: '상품 상세 또는 마이페이지 리뷰 영역에서 발생',
    pageTypeOverride: ['PRODUCT_DETAIL', 'MY'],
  },
  'purchase': {
    description: '주문 완료 페이지에서만 발생',
    modification: '주문 완료 페이지 로드 시 자동 발생. preOrderValidation 등 사전 페이지에서는 발생하지 않음',
    pageTypeOverride: ['ORDER'],
    urlPatternRestriction: ['/order/complete', '/orderComplete', '/order/success'],
  },
};

/**
 * 이벤트 카테고리 매핑
 */
const EVENT_CATEGORY_MAP: Record<string, 'ecommerce' | 'engagement' | 'video' | 'custom' | 'auto'> = {
  // E-commerce
  'view_item': 'ecommerce',
  'view_item_list': 'ecommerce',
  'select_item': 'ecommerce',
  'add_to_cart': 'ecommerce',
  'remove_from_cart': 'ecommerce',
  'view_cart': 'ecommerce',
  'begin_checkout': 'ecommerce',
  'add_shipping_info': 'ecommerce',
  'add_payment_info': 'ecommerce',
  'purchase': 'ecommerce',
  'refund': 'ecommerce',
  'add_to_wishlist': 'ecommerce',
  'view_promotion': 'ecommerce',
  'select_promotion': 'ecommerce',
  'view_promotion_detail': 'ecommerce',
  'naverpay': 'ecommerce',

  // Video
  'video_start': 'video',
  'video_progress': 'video',
  'video_complete': 'video',

  // Auto (page load)
  'page_view': 'auto',
  'qualified_visit': 'auto',
  'page_load_time': 'auto',

  // Engagement
  'login': 'engagement',
  'sign_up': 'engagement',
  'search': 'engagement',
  'view_search_results': 'engagement',
  'scroll': 'engagement',
  'ap_click': 'engagement',
  'click_with_duration': 'engagement',

  // Custom
  'custom_event': 'custom',
};

/**
 * UI 요구사항 기본 정의
 */
const UI_REQUIREMENT_DEFAULTS: Record<string, Partial<UIRequirement>> = {
  'add_to_cart': {
    description: '"장바구니 담기", "카트에 추가", "ADD TO CART" 버튼',
    visionQuestion: '장바구니 담기 버튼이 있나요? (장바구니, 카트, ADD TO CART 텍스트 또는 장바구니 아이콘)',
    selectorHints: ['[class*="cart"]', '[class*="basket"]', 'button:contains("장바구니")'],
    examples: ['장바구니 담기', '카트에 추가', 'ADD TO CART', '🛒'],
  },
  'begin_checkout': {
    description: '"구매하기", "결제하기", "주문하기", "바로구매" 버튼',
    visionQuestion: '구매하기 또는 결제하기 버튼이 있나요?',
    selectorHints: ['[class*="checkout"]', '[class*="buy"]', 'button:contains("구매")'],
    examples: ['구매하기', '바로구매', 'BUY NOW', '결제하기'],
  },
  'select_item': {
    description: '클릭 가능한 상품 카드, 상품 링크',
    visionQuestion: '클릭하면 상품 상세로 이동하는 상품 카드가 있나요?',
    selectorHints: ['[class*="product"]', '[class*="item"]', 'a[href*="product"]'],
    examples: ['상품 썸네일', '상품명 링크', '상품 카드'],
  },
  'select_promotion': {
    description: '클릭 가능한 프로모션 배너, 이벤트 배너',
    visionQuestion: '클릭 가능한 프로모션 배너가 있나요?',
    selectorHints: ['[class*="banner"]', '[class*="promotion"]', 'a[ap-data-promotion]'],
    examples: ['이벤트 배너', '프로모션 슬라이드', '기획전 배너'],
  },
  'view_item': {
    description: '상품 상세 정보 (상품명, 가격, 이미지, 옵션)',
    visionQuestion: '이 페이지가 상품 상세 페이지인가요? (상품명, 가격, 구매 버튼이 있는 페이지)',
    examples: ['상품 이미지', '상품 가격', '옵션 선택', '구매 버튼'],
  },
  'view_promotion': {
    description: '프로모션 배너 영역',
    visionQuestion: '프로모션 배너나 이벤트 배너가 노출되어 있나요?',
    examples: ['메인 배너', '이벤트 배너', '프로모션 슬라이드'],
  },
  'view_promotion_detail': {
    description: '프로모션/이벤트 상세 콘텐츠',
    visionQuestion: '이 페이지가 프로모션 또는 이벤트 상세 페이지인가요?',
    examples: ['이벤트 상세 내용', '프로모션 조건', '이벤트 기간'],
  },
  'login': {
    description: '로그인 버튼, 로그인 폼',
    visionQuestion: '로그인 버튼이나 로그인 폼이 있나요?',
    selectorHints: ['[class*="login"]', 'a[href*="login"]'],
    examples: ['로그인', 'LOGIN', 'Sign In'],
  },
  'sign_up': {
    description: '회원가입 버튼, 회원가입 폼',
    visionQuestion: '회원가입 버튼이나 회원가입 폼이 있나요?',
    selectorHints: ['[class*="signup"]', '[class*="register"]'],
    examples: ['회원가입', 'SIGN UP', '가입하기'],
  },
  'scroll': {
    description: '스크롤 가능한 콘텐츠',
    visionQuestion: '화면 아래로 더 많은 콘텐츠가 있나요?',
    examples: ['긴 페이지', '무한 스크롤', '더보기 콘텐츠'],
  },
  'video_start': {
    description: '비디오 플레이어 (재생 가능한 영상)',
    visionQuestion: '페이지에 재생 가능한 비디오 플레이어가 있나요?',
    selectorHints: ['video', 'iframe[src*="youtube"]', '[class*="video-player"]', '[class*="player"]'],
    examples: ['YouTube 영상', '상품 영상', '이벤트 영상', '라이브 영상'],
  },
  'video_progress': {
    description: '비디오 플레이어 (재생 진행 중)',
    visionQuestion: '비디오가 재생 중인 상태인가요?',
    examples: ['영상 재생 중', '진행률 표시'],
  },
  'video_complete': {
    description: '비디오 플레이어 (재생 완료)',
    visionQuestion: '비디오 재생이 완료된 상태인가요?',
    examples: ['영상 재생 완료', '다시보기 버튼'],
  },
  'view_search_results': {
    description: '검색 결과 목록',
    visionQuestion: '이 페이지가 검색 결과 페이지인가요? (검색 키워드와 결과 목록이 있음)',
    selectorHints: ['[class*="search"]', '[class*="result"]'],
    examples: ['검색어 표시', '검색 결과 목록', '검색 필터'],
  },
  'beauty_tester': {
    description: 'AR/가상 메이크업 기능 버튼 (실제 AR 체험 기능이 있는 버튼만 해당, "체험단" 탭은 해당 안됨)',
    visionQuestion: '실제로 AR 카메라를 실행하거나 가상 메이크업을 체험할 수 있는 버튼이 있나요? (단순 "체험단" 탭이나 링크는 해당하지 않습니다)',
    selectorHints: ['[class*="ar-try"]', '[class*="virtual-makeup"]', '[class*="try-on"]', 'button[class*="ar"]'],
    examples: ['AR로 체험하기', '가상 메이크업', 'TRY ON', '컬러 미리보기', '립 AR 체험'],
  },
  'live': {
    description: '라이브 방송 관련 기능',
    visionQuestion: '라이브 방송 또는 라이브 커머스 콘텐츠가 있나요?',
    selectorHints: ['[class*="live"]', '[class*="broadcast"]'],
    examples: ['라이브 방송', 'LIVE 태그', '실시간 방송'],
  },
  'screen_view': {
    description: '앱 내 화면 전환 (모바일 웹뷰)',
    visionQuestion: '모바일 앱 내 웹뷰 페이지인가요?',
    examples: ['앱 내 웹뷰', '화면 전환'],
  },
  'campaign_details': {
    description: '캠페인/이벤트 상세 정보',
    visionQuestion: '캠페인이나 이벤트의 상세 정보 페이지인가요?',
    selectorHints: ['[class*="campaign"]', '[class*="event-detail"]'],
    examples: ['이벤트 상세', '캠페인 정보', '참여 방법'],
  },
  'custom_event': {
    description: '사이트별 커스텀 이벤트',
    visionQuestion: '특별한 사용자 인터랙션이나 커스텀 기능이 있나요?',
    examples: ['특수 기능', '커스텀 버튼'],
  },
  'withdrawal': {
    description: '회원탈퇴 기능',
    visionQuestion: '회원탈퇴 버튼이나 탈퇴 폼이 있나요?',
    selectorHints: ['[class*="withdraw"]', '[class*="leave"]'],
    examples: ['회원탈퇴', '탈퇴하기', '계정 삭제'],
  },
  'write_review': {
    description: '리뷰 작성 기능',
    visionQuestion: '리뷰 작성 버튼이나 리뷰 작성 폼이 있나요?',
    selectorHints: ['[class*="review"]', 'button:contains("리뷰")'],
    examples: ['리뷰 작성', '후기 등록', '평점 선택'],
  },
  'remove_from_cart': {
    description: '장바구니에서 상품 삭제 버튼',
    visionQuestion: '장바구니에서 상품을 삭제할 수 있는 버튼이 있나요?',
    selectorHints: ['[class*="delete"]', '[class*="remove"]', 'button:contains("삭제")'],
    examples: ['삭제', 'X 버튼', '제거'],
  },
  'qualified_visit': {
    description: '페이지 체류 조건 충족',
    visionQuestion: '사용자가 의미있는 시간 동안 페이지에 체류했나요?',
    examples: ['30초 이상 체류', '스크롤 행동'],
  },
};

/**
 * 이벤트 정의 빌더
 */
export class EventDefinitionBuilder {
  private gtmJsonPath: string;
  private devGuidePath?: string;
  private appendixPath?: string;

  private gtmAnalyzer?: GTMAnalyzer;
  private devGuideParser?: DevelopmentGuideParser;
  private parsedDevGuide?: ParsedEventDefinition[];
  private appendixVariables?: Map<string, any>;

  constructor(options: {
    gtmJsonPath: string;
    devGuidePath?: string;
    appendixPath?: string;
  }) {
    this.gtmJsonPath = options.gtmJsonPath;
    this.devGuidePath = options.devGuidePath;
    this.appendixPath = options.appendixPath;
  }

  /**
   * 모든 소스를 파싱하여 통합 이벤트 정의를 생성합니다.
   */
  async build(): Promise<EventDefinitionBuildResult> {
    const warnings: string[] = [];
    const errors: string[] = [];
    const events: UnifiedEventDefinition[] = [];

    // 1. GTM JSON 파싱
    try {
      this.gtmAnalyzer = new GTMAnalyzer(this.gtmJsonPath);
    } catch (e) {
      errors.push(`GTM JSON 파싱 실패: ${e}`);
      return { events: [], success: false, warnings, errors, sources: {} };
    }

    // 2. 개발가이드 PDF 파싱
    if (this.devGuidePath) {
      try {
        this.devGuideParser = new DevelopmentGuideParser(this.devGuidePath);
        const result = await this.devGuideParser.parse();
        if (result.success) {
          this.parsedDevGuide = result.events;
        } else {
          warnings.push(`개발가이드 파싱 경고: ${result.error}`);
        }
      } catch (e) {
        warnings.push(`개발가이드 파싱 실패: ${e}`);
      }
    }

    // 3. 공통변수 appendix 파싱
    if (this.appendixPath) {
      try {
        this.appendixVariables = await this.parseAppendixVariables();
      } catch (e) {
        warnings.push(`공통변수 appendix 파싱 실패: ${e}`);
      }
    }

    // 4. GTM에서 이벤트 목록 추출
    const gtmResult = this.gtmAnalyzer.analyze();
    const allEventNames = new Set<string>();

    for (const [eventName] of gtmResult.eventTriggerMap) {
      // GTM 변수 패턴 제외
      if (!eventName.startsWith('{{') && !eventName.endsWith('}}')) {
        allEventNames.add(eventName);
      }
    }

    // 개발가이드에서 추가 이벤트 추출
    if (this.parsedDevGuide) {
      for (const event of this.parsedDevGuide) {
        allEventNames.add(event.eventName);
      }
    }

    // 5. 각 이벤트에 대한 통합 정의 생성
    for (const eventName of allEventNames) {
      try {
        const eventDef = this.buildEventDefinition(eventName);
        if (eventDef) {
          events.push(eventDef);
        }
      } catch (e) {
        warnings.push(`이벤트 "${eventName}" 정의 생성 실패: ${e}`);
      }
    }

    // 6. 이벤트 정렬 (카테고리별, 알파벳순)
    events.sort((a, b) => {
      if (a.category !== b.category) {
        const categoryOrder = ['ecommerce', 'engagement', 'video', 'auto', 'custom'];
        return categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
      }
      return a.eventName.localeCompare(b.eventName);
    });

    return {
      events,
      success: errors.length === 0,
      warnings,
      errors,
      sources: {
        gtmJsonPath: this.gtmJsonPath,
        devGuidePath: this.devGuidePath,
        appendixPath: this.appendixPath,
      },
    };
  }

  /**
   * 개별 이벤트의 통합 정의를 생성합니다.
   */
  private buildEventDefinition(eventName: string): UnifiedEventDefinition | null {
    const sources: ('dev_guide' | 'gtm' | 'ga4_standard' | 'manual')[] = [];

    // 1. 개발가이드에서 정보 가져오기
    const devGuideEvent = this.parsedDevGuide?.find(e => e.eventName === eventName);
    if (devGuideEvent) {
      sources.push('dev_guide');
    }

    // 2. GTM에서 트리거 정보 가져오기
    const gtmResult = this.gtmAnalyzer?.analyze();
    const gtmTriggers = gtmResult?.eventTriggerMap.get(eventName) || [];
    if (gtmTriggers.length > 0) {
      sources.push('gtm');
    }

    // 소스가 없으면 건너뛰기
    if (sources.length === 0) {
      return null;
    }

    // 3. GTM 트리거 정보 변환
    const triggerInfos: GTMTriggerInfo[] = gtmTriggers.map(trigger => ({
      name: trigger.name,
      type: trigger.type,
      cssSelector: trigger.cssSelector,
      customEventName: trigger.customEventName,
      filters: trigger.filters.map(f => ({
        variable: f.variable,
        operator: f.type, // GTMFilter의 type이 operator 역할
        value: f.value,
      })),
    }));

    // 4. 페이지 타입 제한 결정
    const pageTypeRestriction = this.determinePageTypeRestriction(eventName, devGuideEvent, gtmTriggers);

    // 5. 발생 조건 결정
    const firingCondition = this.determineFiringCondition(eventName, devGuideEvent);

    // 6. UI 요구사항 결정
    const uiRequirement = this.determineUIRequirement(eventName, devGuideEvent, triggerInfos);

    // 7. 필수 변수 추출
    const requiredVariables = this.extractRequiredVariables(eventName, gtmTriggers);

    // 8. Edge Case 적용
    const edgeCases = this.getEdgeCases(eventName);

    // 9. 신뢰도 계산
    const confidence = this.calculateConfidence(sources, devGuideEvent, gtmTriggers);

    return {
      eventName,
      description: this.getEventDescription(eventName, devGuideEvent),
      category: EVENT_CATEGORY_MAP[eventName] || 'custom',
      required: devGuideEvent?.required || false,
      firingCondition,
      pageTypeRestriction,
      uiRequirement,
      gtmTriggers: triggerInfos,
      requiredVariables,
      edgeCases,
      meta: {
        sources,
        lastUpdated: new Date().toISOString(),
        confidence,
      },
    };
  }

  /**
   * 페이지 타입 제한을 결정합니다.
   */
  private determinePageTypeRestriction(
    eventName: string,
    devGuideEvent?: ParsedEventDefinition,
    gtmTriggers?: any[]
  ): PageTypeRestriction {
    // Edge Case 우선 적용
    const edgeCase = AMOREMALL_EDGE_CASES[eventName];
    if (edgeCase?.pageTypeOverride) {
      return {
        allowedPageTypes: edgeCase.pageTypeOverride,
        allowedUrlPatterns: edgeCase.urlPatternRestriction,
        reason: edgeCase.description,
        source: 'edge_case',
      };
    }

    // 개발가이드에서 추출
    if (devGuideEvent && devGuideEvent.allowedPageTypes.length > 0) {
      if (devGuideEvent.allowedPageTypes.includes('ALL')) {
        return {
          allowedPageTypes: [],
          reason: '모든 페이지에서 발생 가능',
          source: 'dev_guide',
        };
      }
      return {
        allowedPageTypes: devGuideEvent.allowedPageTypes as PageType[],
        reason: devGuideEvent.firingCondition,
        source: 'dev_guide',
      };
    }

    // GTM 트리거에서 추출
    if (gtmTriggers && gtmTriggers.length > 0) {
      const pageTypesFromGTM = this.extractPageTypesFromTriggers(gtmTriggers);
      if (pageTypesFromGTM.length > 0) {
        return {
          allowedPageTypes: pageTypesFromGTM,
          reason: 'GTM 트리거 조건에서 추출',
          source: 'gtm',
        };
      }
    }

    // GA4 표준 매핑
    const ga4Mapping = DevelopmentGuideParser.getGA4StandardMapping(eventName);
    if (ga4Mapping) {
      return {
        allowedPageTypes: ga4Mapping as PageType[],
        reason: 'GA4 E-commerce 표준',
        source: 'ga4_standard',
      };
    }

    // 기본: 모든 페이지 허용
    return {
      allowedPageTypes: [],
      reason: '제한 없음',
      source: 'ga4_standard',
    };
  }

  /**
   * GTM 트리거에서 페이지 타입을 추출합니다.
   */
  private extractPageTypesFromTriggers(triggers: any[]): PageType[] {
    const pageTypes = new Set<PageType>();

    for (const trigger of triggers) {
      for (const filter of trigger.filters || []) {
        // AP_DATA_PAGETYPE 또는 Content Group 필터 확인
        if (filter.variable?.includes('PAGETYPE') || filter.variable?.includes('Content Group')) {
          const value = filter.value?.toUpperCase() || '';

          // MATCH_REGEX 패턴 처리 (예: MAIN|PRODUCT_DETAIL|EVENT_DETAIL)
          if (value.includes('|')) {
            const parts = value.split('|');
            for (const part of parts) {
              const cleanPart = part.replace(/[\^$]/g, '').trim(); // ^, $ 제거
              if (cleanPart && this.isValidPageType(cleanPart)) {
                pageTypes.add(cleanPart as PageType);
              }
            }
          } else if (this.isValidPageType(value)) {
            pageTypes.add(value as PageType);
          }
        }
      }
    }

    return Array.from(pageTypes);
  }

  /**
   * 유효한 페이지 타입인지 확인합니다.
   */
  private isValidPageType(value: string): boolean {
    const validTypes = [
      'MAIN', 'BRAND_MAIN', 'PRODUCT_DETAIL', 'PRODUCT_LIST',
      'SEARCH_RESULT', 'CART', 'ORDER', 'MY',
      'EVENT_LIST', 'EVENT_DETAIL', 'LIVE_LIST', 'LIVE_DETAIL', 'OTHERS'
    ];
    return validTypes.includes(value);
  }

  /**
   * 발생 조건을 결정합니다.
   */
  private determineFiringCondition(
    eventName: string,
    devGuideEvent?: ParsedEventDefinition
  ): FiringCondition {
    // 자동 발생 이벤트 목록
    const autoFireEvents = [
      'page_view', 'view_item', 'view_item_list', 'view_cart',
      'view_promotion', 'view_promotion_detail', 'view_search_results',
      'qualified_visit', 'page_load_time', 'purchase'
    ];

    const isAutoFire = autoFireEvents.includes(eventName);

    return {
      description: devGuideEvent?.firingCondition || this.getDefaultFiringCondition(eventName),
      requiresUserAction: devGuideEvent?.requiresUserAction ?? !isAutoFire,
      userActionType: devGuideEvent?.userActionType as any,
      autoFire: isAutoFire,
    };
  }

  /**
   * 기본 발생 조건을 반환합니다.
   */
  private getDefaultFiringCondition(eventName: string): string {
    const defaults: Record<string, string> = {
      'view_item': '상품 상세 페이지 로드 시',
      'view_item_list': '상품 목록 페이지 로드 시',
      'select_item': '상품 클릭 시',
      'add_to_cart': '장바구니 담기 버튼 클릭 시',
      'begin_checkout': '구매하기/결제하기 버튼 클릭 시',
      'purchase': '주문 완료 시',
      'view_promotion': '프로모션 배너 노출 시',
      'select_promotion': '프로모션 배너 클릭 시',
      'login': '로그인 완료 시',
      'sign_up': '회원가입 완료 시',
      'search': '검색 실행 시',
      'ap_click': '특정 요소 클릭 시',
      'scroll': '페이지 스크롤 시',
    };
    return defaults[eventName] || `${eventName} 이벤트 발생 시`;
  }

  /**
   * UI 요구사항을 결정합니다.
   */
  private determineUIRequirement(
    eventName: string,
    devGuideEvent?: ParsedEventDefinition,
    gtmTriggers?: GTMTriggerInfo[]
  ): UIRequirement {
    const defaultUI = UI_REQUIREMENT_DEFAULTS[eventName] || {};

    // CSS Selector 힌트 추가
    const selectorHints = [...(defaultUI.selectorHints || [])];
    if (gtmTriggers) {
      for (const trigger of gtmTriggers) {
        if (trigger.cssSelector && !selectorHints.includes(trigger.cssSelector)) {
          selectorHints.push(trigger.cssSelector);
        }
      }
    }

    return {
      description: defaultUI.description || devGuideEvent?.requiredUIElements?.join(', ') || '관련 UI 요소',
      visionQuestion: defaultUI.visionQuestion || `${eventName} 이벤트를 발생시킬 수 있는 UI 요소가 있나요?`,
      selectorHints: selectorHints.length > 0 ? selectorHints : undefined,
      examples: defaultUI.examples,
    };
  }

  /**
   * 필수 변수를 추출합니다.
   */
  private extractRequiredVariables(eventName: string, gtmTriggers: any[]): RequiredVariable[] {
    const variables: RequiredVariable[] = [];

    // GTM 태그에서 사용하는 변수 추출 (추후 구현)
    // 현재는 이벤트별 기본 변수 반환

    const eventVariables: Record<string, RequiredVariable[]> = {
      'view_item': [
        { name: 'item_id', description: '상품 ID', dataType: 'string', required: true, ga4Parameter: 'items[].item_id' },
        { name: 'item_name', description: '상품명', dataType: 'string', required: true, ga4Parameter: 'items[].item_name' },
        { name: 'price', description: '상품 가격', dataType: 'number', required: true, ga4Parameter: 'items[].price' },
      ],
      'add_to_cart': [
        { name: 'item_id', description: '상품 ID', dataType: 'string', required: true, ga4Parameter: 'items[].item_id' },
        { name: 'item_name', description: '상품명', dataType: 'string', required: true, ga4Parameter: 'items[].item_name' },
        { name: 'quantity', description: '수량', dataType: 'number', required: true, ga4Parameter: 'items[].quantity' },
        { name: 'price', description: '상품 가격', dataType: 'number', required: true, ga4Parameter: 'items[].price' },
      ],
      'purchase': [
        { name: 'transaction_id', description: '주문번호', dataType: 'string', required: true, ga4Parameter: 'transaction_id' },
        { name: 'value', description: '결제 금액', dataType: 'number', required: true, ga4Parameter: 'value' },
        { name: 'currency', description: '통화', dataType: 'string', required: true, ga4Parameter: 'currency', example: 'KRW' },
      ],
    };

    return eventVariables[eventName] || [];
  }

  /**
   * Edge Case 정보를 가져옵니다.
   */
  private getEdgeCases(eventName: string): UnifiedEventDefinition['edgeCases'] {
    const edgeCase = AMOREMALL_EDGE_CASES[eventName];
    if (!edgeCase) return undefined;

    return [{
      site: 'amoremall',
      description: edgeCase.description,
      modification: edgeCase.modification,
    }];
  }

  /**
   * 이벤트 설명을 가져옵니다.
   */
  private getEventDescription(eventName: string, devGuideEvent?: ParsedEventDefinition): string {
    if (devGuideEvent?.firingCondition) {
      return devGuideEvent.firingCondition;
    }

    const descriptions: Record<string, string> = {
      'view_item': '상품 상세 조회',
      'view_item_list': '상품 목록 조회',
      'select_item': '상품 선택/클릭',
      'add_to_cart': '장바구니 추가',
      'remove_from_cart': '장바구니 삭제',
      'view_cart': '장바구니 조회',
      'begin_checkout': '결제 시작',
      'purchase': '구매 완료',
      'view_promotion': '프로모션 노출 (메인 Key Visual)',
      'select_promotion': '프로모션 클릭',
      'view_promotion_detail': '프로모션/이벤트 상세 페이지 조회',
      'login': '로그인 완료',
      'sign_up': '회원가입 완료',
      'search': '검색 실행',
      'view_search_results': '검색 결과 페이지 조회',
      'ap_click': '특정 영역 클릭 추적',
      'click_with_duration': '클릭 지속 시간 측정',
      'scroll': '페이지 스크롤 (depth tracking)',
      'video_start': '비디오 재생 시작',
      'video_progress': '비디오 재생 진행 (10%, 25%, 50%, 75%, 90%)',
      'video_complete': '비디오 재생 완료',
      'qualified_visit': '적격 방문 (30초 이상 체류)',
      'custom_event': '사이트별 커스텀 이벤트',
      'beauty_tester': '뷰티 테스터/가상 메이크업 체험',
      'live': '라이브 방송 콘텐츠 조회/참여',
      'screen_view': '앱 내 화면 전환 (웹뷰)',
      'campaign_details': '캠페인/이벤트 상세 정보 조회',
      'withdrawal': '회원탈퇴 완료',
      'write_review': '리뷰 작성 완료',
      'brand_product_click': '브랜드 페이지 내 상품 클릭',
      'brand_store': '브랜드 스토어 진입',
      'page_view': '페이지 조회 (DOM 완료 시)',
      'page_load_time': '페이지 로드 시간 측정',
      'naverpay': '네이버페이 결제 버튼 클릭',
    };

    return descriptions[eventName] || eventName;
  }

  /**
   * 신뢰도를 계산합니다.
   */
  private calculateConfidence(
    sources: string[],
    devGuideEvent?: ParsedEventDefinition,
    gtmTriggers?: any[]
  ): number {
    let confidence = 50; // 기본값

    if (sources.includes('dev_guide')) confidence += 25;
    if (sources.includes('gtm')) confidence += 20;
    if (devGuideEvent?.firingCondition) confidence += 5;
    if (gtmTriggers && gtmTriggers.length > 0) confidence += 5;

    return Math.min(100, confidence);
  }

  /**
   * 공통변수 appendix에서 변수 정의를 파싱합니다.
   */
  private async parseAppendixVariables(): Promise<Map<string, any>> {
    if (!this.appendixPath) return new Map();

    const pdfBuffer = fs.readFileSync(this.appendixPath);
    const pdfData = await pdfParse(pdfBuffer);
    const text = pdfData.text;

    const variables = new Map<string, any>();

    // 변수 정의 패턴 매칭 (추후 개선)
    // 현재는 빈 맵 반환

    return variables;
  }
}

/**
 * 기본 경로로 이벤트 정의를 빌드합니다.
 */
export async function buildDefaultEventDefinitions(): Promise<EventDefinitionBuildResult> {
  const builder = new EventDefinitionBuilder({
    gtmJsonPath: path.join(process.cwd(), 'GTM-5FK5X5C4_workspace112.json'),
    devGuidePath: path.join(process.cwd(), '[EC]+WEB+개발+가이드_GTM코드추가(Shopify)1.1.pdf'),
    appendixPath: path.join(process.cwd(), '공통 변수 appendix.pdf'),
  });

  return builder.build();
}
