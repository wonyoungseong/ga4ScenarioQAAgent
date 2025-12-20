/**
 * 이벤트 파라미터 시나리오 생성기
 *
 * GTM에서 이벤트/파라미터를 추출하고,
 * GA4 API로 대표 페이지를 선정하여 예측 시나리오를 생성합니다.
 */

import * as fs from 'fs';
import * as path from 'path';
import { GA4Client, GA4PageEvent, GA4QueryOptions } from '../ga4/ga4Client';
import { getGlobalGTMConfig } from '../config/gtmConfigLoader';
import { UnifiedParameterStore, ParameterDefinition, EventParameterConfig } from '../parsers/paramMappingParser';

/**
 * 대표 페이지 정보
 */
export interface RepresentativePage {
  url: string;
  pagePath: string;
  contentGroup: string;
  eventCount: number;
  proportion: number;
  selectedReason: string;
}

/**
 * 이벤트별 시나리오
 */
export interface EventScenario {
  eventName: string;
  description: string;
  parameters: {
    common: ParameterDefinition[];
    eventSpecific: ParameterDefinition[];
    items: ParameterDefinition[];
    userProperties: ParameterDefinition[];
  };
  representativePages: RepresentativePage[];
  allowedPageTypes: string[];
  createdAt: Date;
}

/**
 * 전체 시나리오 결과
 */
export interface ScenarioGenerationResult {
  generatedAt: Date;
  propertyId: string;
  totalEvents: number;
  scenarios: EventScenario[];
  errors: Array<{ eventName: string; error: string }>;
}

/**
 * Content Group별 페이지 URL 패턴 (실제 작동하는 페이지)
 */
const CONTENT_GROUP_URL_PATTERNS: Record<string, string> = {
  'MAIN': '/display/main',
  'PRODUCT_DETAIL': '/product/detail?onlineProdSn=91736',
  'PRODUCT_LIST': '/display/category/100000001',
  'SEARCH_RESULT': '/search?keyword=설화수',
  'CART': '/cart/cartList',
  'ORDER': '/cart/cartList',  // ORDER 페이지는 로그인 필요, CART로 대체
  'ORDER_COMPLETE': '/cart/cartList',  // 로그인 필요, CART로 대체
  'EVENT_DETAIL': '/display/event_detail',
  'BRAND_MAIN': '/brand/SULWHASOO',
  'MY': '/mypage',
};

/**
 * 이벤트-페이지 타입 매핑 (GTM 트리거 기반)
 */
const EVENT_PAGE_TYPE_MAP: Record<string, string[]> = {
  'page_view': ['ALL'],
  'view_item': ['PRODUCT_DETAIL'],
  'view_item_list': ['PRODUCT_LIST', 'SEARCH_RESULT', 'BRAND_MAIN'],
  'select_item': ['PRODUCT_LIST', 'SEARCH_RESULT'],
  'add_to_cart': ['PRODUCT_DETAIL', 'PRODUCT_LIST'],
  'remove_from_cart': ['CART'],
  'view_cart': ['CART'],
  'begin_checkout': ['CART', 'ORDER'],
  'purchase': ['ORDER_COMPLETE'],
  'view_promotion': ['MAIN', 'PRODUCT_LIST', 'PRODUCT_DETAIL'],
  'select_promotion': ['MAIN', 'PRODUCT_LIST'],
  'login': ['ALL'],
  'sign_up': ['SIGNUP_COMPLETE'],
  'scroll': ['ALL'],
  'ap_click': ['ALL'],
};

/**
 * 이벤트 파라미터 시나리오 생성기
 */
export class EventParameterScenarioGenerator {
  private ga4Client: GA4Client;
  private parameterStore: UnifiedParameterStore | null = null;
  private baseUrl: string;

  constructor(
    ga4Client: GA4Client,
    options: { baseUrl?: string } = {}
  ) {
    this.ga4Client = ga4Client;
    this.baseUrl = options.baseUrl || 'https://www.amoremall.com';
  }

  /**
   * 파라미터 스토어 로드
   */
  async loadParameterStore(): Promise<void> {
    const config = await getGlobalGTMConfig();
    this.parameterStore = config.unifiedParameterStore;
  }

  /**
   * GTM에서 정의된 모든 이벤트 목록 추출
   */
  async getGTMEvents(): Promise<string[]> {
    if (!this.parameterStore) {
      await this.loadParameterStore();
    }

    const events: string[] = [];
    this.parameterStore!.events.forEach((config, eventName) => {
      events.push(eventName);
    });

    return events;
  }

  /**
   * 이벤트별 파라미터 정보 조회
   */
  getEventParameters(eventName: string): {
    common: ParameterDefinition[];
    eventSpecific: ParameterDefinition[];
    items: ParameterDefinition[];
    userProperties: ParameterDefinition[];
  } {
    if (!this.parameterStore) {
      throw new Error('Parameter store not loaded. Call loadParameterStore() first.');
    }

    const eventConfig = this.parameterStore.events.get(eventName);

    return {
      common: this.parameterStore.commonEventParams,
      eventSpecific: eventConfig?.parameters || [],
      items: this.parameterStore.itemParams,
      userProperties: this.parameterStore.userProperties,
    };
  }

  /**
   * 이벤트별 대표 페이지 5개 선정 (content_group 다양성 우선)
   */
  async selectRepresentativePages(
    eventName: string,
    options: GA4QueryOptions = {}
  ): Promise<RepresentativePage[]> {
    const { startDate = '7daysAgo', endDate = 'today' } = options;

    // 이벤트가 발생 가능한 페이지 타입
    const allowedPageTypes = EVENT_PAGE_TYPE_MAP[eventName] || ['ALL'];

    // GA4에서 이벤트가 발생한 페이지 조회
    let pageEvents: GA4PageEvent[] = [];

    try {
      // content_group dimension으로 조회
      pageEvents = await this.getEventPagesByContentGroup(eventName, { startDate, endDate });
    } catch (error) {
      console.warn(`GA4 API 조회 실패, 기본 페이지 사용: ${eventName}`);
      // 폴백: 기본 페이지 반환
      return this.getDefaultRepresentativePages(eventName, allowedPageTypes);
    }

    if (pageEvents.length === 0) {
      return this.getDefaultRepresentativePages(eventName, allowedPageTypes);
    }

    // content_group별로 그룹화
    const byContentGroup = new Map<string, GA4PageEvent[]>();
    for (const pe of pageEvents) {
      const contentGroup = this.inferContentGroup(pe.pagePath);
      if (!byContentGroup.has(contentGroup)) {
        byContentGroup.set(contentGroup, []);
      }
      byContentGroup.get(contentGroup)!.push(pe);
    }

    // 전체 이벤트 수 계산
    const totalCount = pageEvents.reduce((sum, pe) => sum + pe.eventCount, 0);

    // 각 content_group에서 가장 많은 이벤트가 발생한 페이지 선택
    const selectedPages: RepresentativePage[] = [];

    // content_group 우선순위 정렬 (이벤트 수 기준)
    const sortedGroups = Array.from(byContentGroup.entries())
      .map(([cg, pages]) => ({
        contentGroup: cg,
        totalEvents: pages.reduce((sum, p) => sum + p.eventCount, 0),
        topPage: pages.sort((a, b) => b.eventCount - a.eventCount)[0],
      }))
      .sort((a, b) => b.totalEvents - a.totalEvents);

    // 최대 5개 선정
    for (const group of sortedGroups.slice(0, 5)) {
      selectedPages.push({
        url: this.buildFullUrl(group.topPage.pagePath),
        pagePath: group.topPage.pagePath,
        contentGroup: group.contentGroup,
        eventCount: group.topPage.eventCount,
        proportion: group.topPage.eventCount / totalCount,
        selectedReason: `${group.contentGroup}에서 가장 높은 이벤트 발생률`,
      });
    }

    return selectedPages;
  }

  /**
   * GA4에서 이벤트별 페이지-content_group 조회
   */
  private async getEventPagesByContentGroup(
    eventName: string,
    options: GA4QueryOptions
  ): Promise<GA4PageEvent[]> {
    // GA4 API로 이벤트가 발생한 페이지 조회
    const allPageEvents = await this.ga4Client.getEventsByPage(undefined, {
      ...options,
      limit: 1000,
    });

    // 해당 이벤트만 필터링 + (not set) 페이지 제외
    return allPageEvents.filter(pe =>
      pe.eventName === eventName &&
      pe.pagePath !== '(not set)' &&
      !pe.pagePath.includes('(not set)') &&
      pe.pagePath.length > 1
    );
  }

  /**
   * pagePath에서 content_group 추론
   */
  private inferContentGroup(pagePath: string): string {
    const path = pagePath.toLowerCase();

    if (path.includes('/product/detail') || path.includes('onlineprod')) {
      return 'PRODUCT_DETAIL';
    }
    if (path.includes('/display/category') || path.includes('/category/')) {
      return 'PRODUCT_LIST';
    }
    if (path.includes('/search')) {
      return 'SEARCH_RESULT';
    }
    if (path.includes('/cart')) {
      return 'CART';
    }
    if (path.includes('/order/complete') || path.includes('ordercomplete')) {
      return 'ORDER_COMPLETE';
    }
    if (path.includes('/order')) {
      return 'ORDER';
    }
    if (path.includes('/event/')) {
      return 'EVENT_DETAIL';
    }
    if (path.includes('/brand/')) {
      return 'BRAND_MAIN';
    }
    if (path.includes('/mypage') || path.includes('/my/')) {
      return 'MY';
    }
    if (path.includes('/display/main') || path === '/' || path === '/kr/ko/' || path === '/kr/ko') {
      return 'MAIN';
    }

    return 'OTHERS';
  }

  /**
   * 기본 대표 페이지 생성 (GA4 데이터 없을 때)
   */
  private getDefaultRepresentativePages(
    eventName: string,
    allowedPageTypes: string[]
  ): RepresentativePage[] {
    const pages: RepresentativePage[] = [];

    for (const pageType of allowedPageTypes.slice(0, 5)) {
      if (pageType === 'ALL') {
        // ALL인 경우 MAIN 페이지 사용
        pages.push({
          url: `${this.baseUrl}/kr/ko/display/main`,
          pagePath: '/kr/ko/display/main',
          contentGroup: 'MAIN',
          eventCount: 0,
          proportion: 0,
          selectedReason: '기본 페이지 (GA4 데이터 없음)',
        });
      } else {
        const pattern = CONTENT_GROUP_URL_PATTERNS[pageType];
        if (pattern) {
          pages.push({
            url: `${this.baseUrl}/kr/ko${pattern}`,
            pagePath: `/kr/ko${pattern}`,
            contentGroup: pageType,
            eventCount: 0,
            proportion: 0,
            selectedReason: '기본 페이지 (GA4 데이터 없음)',
          });
        }
      }
    }

    return pages;
  }

  /**
   * 전체 URL 생성
   */
  private buildFullUrl(pagePath: string): string {
    if (pagePath.startsWith('http')) {
      return pagePath;
    }
    return `${this.baseUrl}${pagePath.startsWith('/') ? '' : '/'}${pagePath}`;
  }

  /**
   * 전체 이벤트에 대한 시나리오 생성
   */
  async generateAllScenarios(
    options: {
      events?: string[];
      ga4Options?: GA4QueryOptions;
    } = {}
  ): Promise<ScenarioGenerationResult> {
    await this.loadParameterStore();

    const events = options.events || await this.getGTMEvents();
    const scenarios: EventScenario[] = [];
    const errors: Array<{ eventName: string; error: string }> = [];

    console.log(`\n📋 ${events.length}개 이벤트에 대한 시나리오 생성 시작...\n`);

    for (const eventName of events) {
      try {
        console.log(`[${eventName}] 시나리오 생성 중...`);

        const parameters = this.getEventParameters(eventName);
        const representativePages = await this.selectRepresentativePages(
          eventName,
          options.ga4Options
        );

        const scenario: EventScenario = {
          eventName,
          description: this.getEventDescription(eventName),
          parameters,
          representativePages,
          allowedPageTypes: EVENT_PAGE_TYPE_MAP[eventName] || ['ALL'],
          createdAt: new Date(),
        };

        scenarios.push(scenario);

        console.log(`   ✓ 대표 페이지 ${representativePages.length}개 선정`);
        console.log(`   ✓ 파라미터: 공통 ${parameters.common.length}, 이벤트 ${parameters.eventSpecific.length}, 아이템 ${parameters.items.length}`);

      } catch (error: any) {
        console.error(`   ❌ 오류: ${error.message}`);
        errors.push({ eventName, error: error.message });
      }

      // API 속도 제한 방지
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const result: ScenarioGenerationResult = {
      generatedAt: new Date(),
      propertyId: (this.ga4Client as any).propertyId || 'unknown',
      totalEvents: events.length,
      scenarios,
      errors,
    };

    return result;
  }

  /**
   * 이벤트 설명 반환
   */
  private getEventDescription(eventName: string): string {
    const descriptions: Record<string, string> = {
      'page_view': '페이지 조회',
      'view_item': '상품 상세 조회',
      'view_item_list': '상품 목록 조회',
      'select_item': '상품 선택',
      'add_to_cart': '장바구니 추가',
      'remove_from_cart': '장바구니 제거',
      'view_cart': '장바구니 조회',
      'begin_checkout': '결제 시작',
      'purchase': '구매 완료',
      'view_promotion': '프로모션 노출',
      'select_promotion': '프로모션 선택',
      'login': '로그인',
      'sign_up': '회원가입',
      'scroll': '스크롤',
      'ap_click': '클릭',
    };
    return descriptions[eventName] || eventName;
  }

  /**
   * 시나리오 결과를 파일로 저장
   */
  async saveScenarios(
    result: ScenarioGenerationResult,
    outputPath?: string
  ): Promise<string> {
    const filePath = outputPath || path.join(
      process.cwd(),
      'output',
      'event-scenarios.json'
    );

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Map을 객체로 변환하여 저장
    const serializable = {
      ...result,
      scenarios: result.scenarios.map(s => ({
        ...s,
        parameters: {
          common: s.parameters.common,
          eventSpecific: s.parameters.eventSpecific,
          items: s.parameters.items,
          userProperties: s.parameters.userProperties,
        },
      })),
    };

    fs.writeFileSync(filePath, JSON.stringify(serializable, null, 2));
    console.log(`\n💾 시나리오 저장: ${filePath}`);

    return filePath;
  }
}

/**
 * 시나리오 생성 헬퍼 함수
 */
export async function generateEventScenarios(
  propertyId: string,
  accessToken: string,
  options: {
    events?: string[];
    baseUrl?: string;
    outputPath?: string;
  } = {}
): Promise<ScenarioGenerationResult> {
  const ga4Client = new GA4Client({
    propertyId,
    accessToken,
  });
  await ga4Client.initialize();

  const generator = new EventParameterScenarioGenerator(ga4Client, {
    baseUrl: options.baseUrl,
  });

  const result = await generator.generateAllScenarios({
    events: options.events,
  });

  if (options.outputPath !== null) {
    await generator.saveScenarios(result, options.outputPath);
  }

  return result;
}
