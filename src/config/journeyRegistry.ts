/**
 * Event Journey Registry (동적 생성)
 *
 * GTM JSON을 분석하여 사이트별 Journey를 동적으로 생성합니다.
 * 사이트마다 이벤트 흐름이 다를 수 있으므로, GTM 설정을 기반으로 Journey를 추론합니다.
 *
 * 사용 목적:
 * 1. Scenario Agent: 시나리오 생성 시 관련 Journey 정보 포함
 * 2. Crawler Agent: 어떤 이벤트를 함께 테스트해야 하는지 인지
 * 3. Validation Agent: 어떤 이벤트들의 일관성을 검증해야 하는지 인지
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Journey 정의
 */
export interface JourneyDefinition {
  /** Journey ID */
  journeyId: string;

  /** Journey 이름 */
  name: string;

  /** Journey 설명 */
  description: string;

  /**
   * 이벤트 시퀀스 (발생 순서)
   * 첫 번째 이벤트부터 마지막 이벤트까지 순서대로 정의
   */
  eventSequence: string[];

  /**
   * 진입점 이벤트 (Entry Point)
   * 이 이벤트를 테스트할 때 전체 Journey를 테스트해야 함
   */
  entryPointEvents: string[];

  /**
   * 필수 이벤트
   * Journey 내에서 반드시 발생해야 하는 이벤트
   */
  requiredEvents: string[];

  /**
   * 선택 이벤트
   * 조건에 따라 발생할 수도 있는 이벤트
   */
  optionalEvents: string[];

  /**
   * 일관성 검증 파라미터
   */
  consistencyParams: {
    exactMatch: string[];
    semanticMatch: string[];
  };

  /**
   * Journey 테스트 방법
   */
  testStrategy: {
    startPage: 'current' | 'list_page' | 'home_page';
    requiresNavigation: boolean;
    expectedNavigations: number;
  };

  /** GTM에서 추출된 추가 정보 */
  gtmMetadata?: {
    /** 관련 태그 이름들 */
    relatedTags: string[];
    /** 특수 파라미터 (예: checkout_step) */
    specialParams?: Record<string, string[]>;
  };
}

/**
 * 이벤트별 Journey 매핑
 */
export interface EventJourneyMapping {
  eventName: string;
  journeyId: string;
  orderInJourney: number;
  isEntryPoint: boolean;
  prerequisiteEvents: string[];
  subsequentEvents: string[];
}

/**
 * GTM에서 추출한 이벤트 정보
 */
interface GTMEventInfo {
  eventName: string;
  tagName: string;
  tagId: string;
  parameters: Map<string, string>;
  triggerId?: string[];
}

/**
 * Journey Registry
 * GTM JSON을 분석하여 동적으로 Journey를 생성
 */
class JourneyRegistry {
  private journeys: Map<string, JourneyDefinition> = new Map();
  private eventMappings: Map<string, EventJourneyMapping> = new Map();
  private gtmEvents: GTMEventInfo[] = [];
  private initialized: boolean = false;

  /**
   * GTM JSON 파일로 초기화
   */
  initializeFromGTM(gtmJsonPath: string): void {
    if (!fs.existsSync(gtmJsonPath)) {
      console.warn(`GTM JSON not found: ${gtmJsonPath}. Using default journeys.`);
      this.initializeDefaultJourneys();
      return;
    }

    try {
      const gtmJson = JSON.parse(fs.readFileSync(gtmJsonPath, 'utf-8'));
      this.extractEventsFromGTM(gtmJson);
      this.buildJourneysFromEvents();
      this.buildEventMappings();
      this.initialized = true;
    } catch (error) {
      console.error('Error parsing GTM JSON:', error);
      this.initializeDefaultJourneys();
    }
  }

  /**
   * GTM JSON에서 이벤트 정보 추출
   */
  private extractEventsFromGTM(gtmJson: any): void {
    const tags = gtmJson.containerVersion?.tag || [];

    for (const tag of tags) {
      const eventName = this.extractEventName(tag);
      if (eventName && !eventName.startsWith('{{')) {
        const eventInfo: GTMEventInfo = {
          eventName,
          tagName: tag.name || '',
          tagId: tag.tagId || '',
          parameters: this.extractParameters(tag),
          triggerId: tag.firingTriggerId
        };
        this.gtmEvents.push(eventInfo);
      }
    }
  }

  /**
   * 태그에서 이벤트명 추출
   */
  private extractEventName(tag: any): string | null {
    const params = tag.parameter || [];
    for (const param of params) {
      if (param.key === 'eventName' && param.value) {
        return param.value;
      }
    }
    return null;
  }

  /**
   * 태그에서 파라미터 추출
   */
  private extractParameters(tag: any): Map<string, string> {
    const params = new Map<string, string>();
    const eventData = tag.parameter?.find((p: any) => p.key === 'eventData');

    if (eventData?.list) {
      for (const item of eventData.list) {
        const map = item.map || [];
        let key = '';
        let value = '';
        for (const m of map) {
          if (m.key === 'eventParam') key = m.value;
          if (m.key === 'eventValue') value = m.value;
        }
        if (key) params.set(key, value);
      }
    }

    return params;
  }

  /**
   * 추출된 이벤트를 기반으로 Journey 생성
   */
  private buildJourneysFromEvents(): void {
    const eventNames = [...new Set(this.gtmEvents.map(e => e.eventName))];

    // 1. 프로모션 Journey 생성
    this.buildPromotionJourney(eventNames);

    // 2. E-commerce Full Journey 생성 (상품 선택 → 구매까지 통합)
    this.buildEcommerceFullJourney(eventNames);

    // 3. 검색 Journey 생성
    this.buildSearchJourney(eventNames);
  }

  /**
   * 프로모션 Journey 생성
   */
  private buildPromotionJourney(eventNames: string[]): void {
    const promotionEvents = eventNames.filter(e =>
      e.includes('promotion') || e === 'view_promotion' || e === 'select_promotion' || e === 'view_promotion_detail'
    );

    if (promotionEvents.length === 0) return;

    // 이벤트 순서 정의 (표준 GA4 순서)
    const sequence: string[] = [];
    if (promotionEvents.includes('view_promotion')) sequence.push('view_promotion');
    if (promotionEvents.includes('select_promotion')) sequence.push('select_promotion');
    if (promotionEvents.includes('view_promotion_detail')) sequence.push('view_promotion_detail');

    if (sequence.length < 2) return;

    const journey: JourneyDefinition = {
      journeyId: 'promotion_journey',
      name: '프로모션 클릭 Journey',
      description: `프로모션 배너 노출 → 클릭 → 상세페이지 흐름 (${sequence.join(' → ')})`,
      eventSequence: sequence,
      entryPointEvents: sequence.filter(e => e !== 'view_promotion_detail'),
      requiredEvents: sequence.filter(e => e !== 'view_promotion_detail'),
      optionalEvents: sequence.includes('view_promotion_detail') ? ['view_promotion_detail'] : [],
      consistencyParams: {
        exactMatch: ['promotion_id'],
        semanticMatch: ['promotion_name', 'creative_slot']
      },
      testStrategy: {
        startPage: 'current',
        requiresNavigation: sequence.includes('view_promotion_detail'),
        expectedNavigations: sequence.includes('view_promotion_detail') ? 1 : 0
      },
      gtmMetadata: {
        relatedTags: this.gtmEvents
          .filter(e => promotionEvents.includes(e.eventName))
          .map(e => e.tagName)
      }
    };

    this.journeys.set('promotion_journey', journey);
  }

  /**
   * E-commerce Full Journey 생성
   *
   * 상품 선택부터 구매까지 전체 흐름을 하나의 Journey로 통합
   * 핵심: items 배열 내 item 정보가 전체 Journey에서 일관되어야 함
   *
   * 표준 흐름:
   * view_item_list → select_item → view_item → add_to_cart → begin_checkout → purchase
   */
  private buildEcommerceFullJourney(eventNames: string[]): void {
    // E-commerce 관련 이벤트 확인
    const hasViewItemList = eventNames.includes('view_item_list');
    const hasSelectItem = eventNames.includes('select_item');
    const hasViewItem = eventNames.includes('view_item');
    const hasAddToCart = eventNames.includes('add_to_cart');
    const hasBeginCheckout = eventNames.includes('begin_checkout');
    const hasPurchase = eventNames.includes('purchase');
    const hasViewCart = eventNames.includes('view_cart');
    const hasAddShippingInfo = eventNames.includes('add_shipping_info');
    const hasAddPaymentInfo = eventNames.includes('add_payment_info');

    // 최소 2개 이상의 이벤트가 있어야 Journey 생성
    const ecommerceEvents = [
      hasViewItemList, hasSelectItem, hasViewItem, hasAddToCart,
      hasBeginCheckout, hasPurchase
    ].filter(Boolean).length;

    if (ecommerceEvents < 2) return;

    // GTM에서 checkout 관련 태그 분석 (AMORE 스타일 확인)
    const checkoutTags = this.gtmEvents.filter(e =>
      e.eventName === 'begin_checkout' || e.tagName.toLowerCase().includes('checkout')
    );
    const hasCheckoutStep = checkoutTags.some(tag => {
      const params = tag.parameters;
      return params.has('checkout_step') || params.has('checkout_seq');
    });

    // Full Journey 시퀀스 구성
    const sequence: string[] = [];
    if (hasViewItemList) sequence.push('view_item_list');
    if (hasSelectItem) sequence.push('select_item');
    if (hasViewItem) sequence.push('view_item');
    if (hasAddToCart) sequence.push('add_to_cart');
    if (hasViewCart) sequence.push('view_cart');
    if (hasBeginCheckout) sequence.push('begin_checkout');
    if (hasAddShippingInfo) sequence.push('add_shipping_info');
    if (hasAddPaymentInfo) sequence.push('add_payment_info');
    if (hasPurchase) sequence.push('purchase');

    // AMORE 스타일 checkout step 정보
    const checkoutStepInfo = hasCheckoutStep ? {
      checkout_step: ['cartpage', 'cartbtn', 'prdbtn', 'plpbtn', 'orderpage', 'orderbtn']
    } : undefined;

    const journey: JourneyDefinition = {
      journeyId: 'ecommerce_full_journey',
      name: 'E-commerce Full Journey',
      description: `상품 탐색부터 구매까지 전체 흐름 (${sequence.join(' → ')})

■ 핵심 검증 포인트: items 배열 내 item 정보 일관성
  - item_id: 전체 Journey에서 동일해야 함
  - item_name: 의미적으로 일치해야 함
  - item_brand: 동일해야 함
  - price: 동일해야 함 (할인 적용 시 일관되게)
  - quantity: add_to_cart부터 purchase까지 일관되어야 함

■ 테스트 시나리오:
  1. 상품 목록에서 특정 상품 확인 (view_item_list.items)
  2. 상품 클릭 (select_item.items) - 동일 item_id
  3. 상품 상세 확인 (view_item.items) - 동일 item_id, item_name
  4. 장바구니 담기 (add_to_cart.items) - 동일 item_id, price
  5. 결제 시작 (begin_checkout.items) - 동일 items 배열
  6. 구매 완료 (purchase.items) - 동일 items 배열, transaction_id 생성

${hasCheckoutStep ? `
■ AMORE 특화 (checkout_step 파라미터):
  - begin_checkout (cartpage): 장바구니 페이지 진입
  - begin_checkout (cartbtn/prdbtn/plpbtn): 구매하기 버튼 클릭
  - begin_checkout (orderpage): 주문서 페이지 진입
  - begin_checkout (orderbtn): 결제하기 버튼 클릭
` : ''}`,
      eventSequence: sequence,
      entryPointEvents: ['select_item', 'view_item', 'add_to_cart', 'begin_checkout'].filter(e => sequence.includes(e)),
      requiredEvents: sequence.filter(e =>
        ['select_item', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase'].includes(e)
      ),
      optionalEvents: sequence.filter(e =>
        ['view_item_list', 'view_cart', 'add_shipping_info', 'add_payment_info'].includes(e)
      ),
      consistencyParams: {
        exactMatch: ['item_id', 'item_brand', 'price', 'currency', 'transaction_id'],
        semanticMatch: ['item_name', 'item_category']
      },
      testStrategy: {
        startPage: 'list_page',
        requiresNavigation: true,
        expectedNavigations: sequence.length - 1
      },
      gtmMetadata: {
        relatedTags: this.gtmEvents
          .filter(e => sequence.includes(e.eventName))
          .map(e => e.tagName),
        specialParams: checkoutStepInfo
      }
    };

    this.journeys.set('ecommerce_full_journey', journey);

    // 개별 Journey도 생성 (부분 테스트용)
    this.buildItemOnlyJourney(eventNames);
    this.buildCheckoutOnlyJourney(eventNames, hasCheckoutStep, checkoutTags);
  }

  /**
   * 상품 전용 Journey (부분 테스트용)
   */
  private buildItemOnlyJourney(eventNames: string[]): void {
    const sequence: string[] = [];
    if (eventNames.includes('view_item_list')) sequence.push('view_item_list');
    if (eventNames.includes('select_item')) sequence.push('select_item');
    if (eventNames.includes('view_item')) sequence.push('view_item');
    if (eventNames.includes('add_to_cart')) sequence.push('add_to_cart');

    if (sequence.length < 2) return;

    const journey: JourneyDefinition = {
      journeyId: 'item_journey',
      name: '상품 Journey (부분)',
      description: `상품 탐색 흐름만 테스트 (${sequence.join(' → ')})`,
      eventSequence: sequence,
      entryPointEvents: ['select_item', 'view_item'].filter(e => sequence.includes(e)),
      requiredEvents: ['select_item', 'view_item'].filter(e => sequence.includes(e)),
      optionalEvents: ['view_item_list', 'add_to_cart'].filter(e => sequence.includes(e)),
      consistencyParams: {
        exactMatch: ['item_id', 'item_brand', 'price'],
        semanticMatch: ['item_name']
      },
      testStrategy: {
        startPage: 'list_page',
        requiresNavigation: true,
        expectedNavigations: 1
      },
      gtmMetadata: {
        relatedTags: this.gtmEvents
          .filter(e => sequence.includes(e.eventName))
          .map(e => e.tagName)
      }
    };

    this.journeys.set('item_journey', journey);
  }

  /**
   * 결제 전용 Journey (부분 테스트용)
   */
  private buildCheckoutOnlyJourney(
    eventNames: string[],
    hasCheckoutStep: boolean,
    checkoutTags: GTMEventInfo[]
  ): void {
    const sequence: string[] = [];
    if (eventNames.includes('view_cart')) sequence.push('view_cart');
    if (eventNames.includes('begin_checkout')) sequence.push('begin_checkout');
    if (eventNames.includes('add_shipping_info')) sequence.push('add_shipping_info');
    if (eventNames.includes('add_payment_info')) sequence.push('add_payment_info');
    if (eventNames.includes('purchase')) sequence.push('purchase');

    if (sequence.length < 2) return;

    const journey: JourneyDefinition = {
      journeyId: 'checkout_journey',
      name: hasCheckoutStep ? '결제 Journey (Step 기반)' : '결제 Journey (표준)',
      description: hasCheckoutStep
        ? `begin_checkout + checkout_step 파라미터로 단계 구분 (${sequence.join(' → ')})`
        : `결제 흐름 테스트 (${sequence.join(' → ')})`,
      eventSequence: sequence,
      entryPointEvents: ['begin_checkout', 'view_cart'].filter(e => sequence.includes(e)),
      requiredEvents: ['begin_checkout', 'purchase'].filter(e => sequence.includes(e)),
      optionalEvents: ['view_cart', 'add_shipping_info', 'add_payment_info'].filter(e => sequence.includes(e)),
      consistencyParams: {
        exactMatch: ['item_id', 'transaction_id', 'currency', 'value'],
        semanticMatch: ['item_name']
      },
      testStrategy: {
        startPage: 'current',
        requiresNavigation: true,
        expectedNavigations: sequence.length - 1
      },
      gtmMetadata: {
        relatedTags: checkoutTags.map(e => e.tagName),
        specialParams: hasCheckoutStep ? {
          checkout_step: ['cartpage', 'cartbtn', 'prdbtn', 'plpbtn', 'orderpage', 'orderbtn']
        } : undefined
      }
    };

    this.journeys.set('checkout_journey', journey);
  }

  /**
   * 검색 Journey 생성
   */
  private buildSearchJourney(eventNames: string[]): void {
    const hasSearch = eventNames.includes('search');
    const hasViewSearchResults = eventNames.includes('view_search_results');

    if (!hasSearch && !hasViewSearchResults) return;

    const sequence: string[] = [];
    if (hasSearch) sequence.push('search');
    if (hasViewSearchResults) sequence.push('view_search_results');

    if (sequence.length < 1) return;

    const journey: JourneyDefinition = {
      journeyId: 'search_journey',
      name: '검색 Journey',
      description: `검색어 입력 → 검색 결과 조회 흐름 (${sequence.join(' → ')})`,
      eventSequence: sequence,
      entryPointEvents: sequence,
      requiredEvents: sequence,
      optionalEvents: [],
      consistencyParams: {
        exactMatch: ['search_term'],
        semanticMatch: []
      },
      testStrategy: {
        startPage: 'current',
        requiresNavigation: false,
        expectedNavigations: 0
      },
      gtmMetadata: {
        relatedTags: this.gtmEvents
          .filter(e => sequence.includes(e.eventName))
          .map(e => e.tagName)
      }
    };

    this.journeys.set('search_journey', journey);
  }

  /**
   * 기본 Journey 초기화 (GTM JSON이 없을 때 사용)
   */
  private initializeDefaultJourneys(): void {
    // 프로모션 Journey
    this.journeys.set('promotion_journey', {
      journeyId: 'promotion_journey',
      name: '프로모션 클릭 Journey (기본)',
      description: '프로모션 배너 노출 → 클릭 → 상세페이지 흐름',
      eventSequence: ['view_promotion', 'select_promotion', 'view_promotion_detail'],
      entryPointEvents: ['select_promotion', 'view_promotion'],
      requiredEvents: ['view_promotion', 'select_promotion'],
      optionalEvents: ['view_promotion_detail'],
      consistencyParams: {
        exactMatch: ['promotion_id'],
        semanticMatch: ['promotion_name', 'creative_slot']
      },
      testStrategy: {
        startPage: 'current',
        requiresNavigation: true,
        expectedNavigations: 1
      }
    });

    // E-commerce Full Journey (기본)
    this.journeys.set('ecommerce_full_journey', {
      journeyId: 'ecommerce_full_journey',
      name: 'E-commerce Full Journey (기본)',
      description: `상품 탐색부터 구매까지 전체 흐름

■ 핵심 검증 포인트: items 배열 내 item 정보 일관성
  - item_id: 전체 Journey에서 동일해야 함
  - item_name: 의미적으로 일치해야 함
  - item_brand: 동일해야 함
  - price: 동일해야 함`,
      eventSequence: ['view_item_list', 'select_item', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase'],
      entryPointEvents: ['select_item', 'view_item', 'add_to_cart', 'begin_checkout'],
      requiredEvents: ['select_item', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase'],
      optionalEvents: ['view_item_list'],
      consistencyParams: {
        exactMatch: ['item_id', 'item_brand', 'price', 'currency', 'transaction_id'],
        semanticMatch: ['item_name', 'item_category']
      },
      testStrategy: {
        startPage: 'list_page',
        requiresNavigation: true,
        expectedNavigations: 5
      }
    });

    // 상품 Journey (부분 테스트용)
    this.journeys.set('item_journey', {
      journeyId: 'item_journey',
      name: '상품 Journey (부분)',
      description: '상품 목록 노출 → 클릭 → 상세 → 장바구니 흐름',
      eventSequence: ['view_item_list', 'select_item', 'view_item', 'add_to_cart'],
      entryPointEvents: ['select_item', 'view_item'],
      requiredEvents: ['select_item', 'view_item'],
      optionalEvents: ['view_item_list', 'add_to_cart'],
      consistencyParams: {
        exactMatch: ['item_id', 'item_brand', 'price'],
        semanticMatch: ['item_name']
      },
      testStrategy: {
        startPage: 'list_page',
        requiresNavigation: true,
        expectedNavigations: 1
      }
    });

    // 결제 Journey (부분 테스트용)
    this.journeys.set('checkout_journey', {
      journeyId: 'checkout_journey',
      name: '결제 Journey (부분)',
      description: '결제 시작 → 구매 완료 흐름',
      eventSequence: ['begin_checkout', 'purchase'],
      entryPointEvents: ['begin_checkout'],
      requiredEvents: ['begin_checkout', 'purchase'],
      optionalEvents: [],
      consistencyParams: {
        exactMatch: ['item_id', 'transaction_id', 'currency', 'value'],
        semanticMatch: ['item_name']
      },
      testStrategy: {
        startPage: 'current',
        requiresNavigation: true,
        expectedNavigations: 1
      }
    });

    this.buildEventMappings();
    this.initialized = true;
  }

  /**
   * 이벤트 → Journey 매핑 빌드
   *
   * E-commerce 이벤트는 Full Journey를 우선으로 매핑
   * (select_item → ecommerce_full_journey, 부분 테스트 시에는 item_journey 참조)
   */
  private buildEventMappings(): void {
    this.eventMappings.clear();

    // Journey 우선순위: ecommerce_full_journey > promotion_journey > item_journey > checkout_journey > search_journey
    const journeyPriority = [
      'ecommerce_full_journey',
      'promotion_journey',
      'item_journey',
      'checkout_journey',
      'search_journey'
    ];

    // 우선순위대로 매핑 (먼저 매핑된 이벤트는 덮어쓰지 않음, 단 Full Journey는 항상 우선)
    for (const journeyId of journeyPriority) {
      const journey = this.journeys.get(journeyId);
      if (!journey) continue;

      const sequence = journey.eventSequence;

      sequence.forEach((eventName, index) => {
        // ecommerce_full_journey는 항상 덮어씀 (최우선)
        // 그 외에는 이미 매핑된 이벤트는 건너뜀
        if (journeyId !== 'ecommerce_full_journey' && this.eventMappings.has(eventName)) {
          return;
        }

        const mapping: EventJourneyMapping = {
          eventName,
          journeyId: journey.journeyId,
          orderInJourney: index + 1,
          isEntryPoint: journey.entryPointEvents.includes(eventName),
          prerequisiteEvents: sequence.slice(0, index),
          subsequentEvents: sequence.slice(index + 1)
        };

        this.eventMappings.set(eventName, mapping);
      });
    }
  }

  /**
   * 이벤트가 속한 모든 Journey 목록 조회
   *
   * 예: select_item → [ecommerce_full_journey, item_journey]
   */
  getAllJourneysForEvent(eventName: string): JourneyDefinition[] {
    if (!this.initialized) {
      this.initializeDefaultJourneys();
    }

    const result: JourneyDefinition[] = [];
    for (const journey of this.journeys.values()) {
      if (journey.eventSequence.includes(eventName)) {
        result.push(journey);
      }
    }
    return result;
  }

  /**
   * 이벤트가 Journey에 속하는지 확인
   */
  hasJourney(eventName: string): boolean {
    if (!this.initialized) {
      this.initializeDefaultJourneys();
    }
    return this.eventMappings.has(eventName);
  }

  /**
   * 이벤트의 Journey 정보 조회
   */
  getEventMapping(eventName: string): EventJourneyMapping | undefined {
    if (!this.initialized) {
      this.initializeDefaultJourneys();
    }
    return this.eventMappings.get(eventName);
  }

  /**
   * Journey 정의 조회
   */
  getJourney(journeyId: string): JourneyDefinition | undefined {
    if (!this.initialized) {
      this.initializeDefaultJourneys();
    }
    return this.journeys.get(journeyId);
  }

  /**
   * 이벤트가 속한 Journey 조회
   */
  getJourneyForEvent(eventName: string): JourneyDefinition | undefined {
    const mapping = this.getEventMapping(eventName);
    if (!mapping) return undefined;
    return this.journeys.get(mapping.journeyId);
  }

  /**
   * 이벤트 테스트 시 필요한 관련 이벤트 목록 조회
   */
  getRelatedEventsForTest(eventName: string): string[] {
    const journey = this.getJourneyForEvent(eventName);
    if (!journey) return [eventName];
    return journey.eventSequence;
  }

  /**
   * 이벤트 전에 반드시 발생해야 하는 이벤트 목록
   */
  getPrerequisiteEvents(eventName: string): string[] {
    const mapping = this.eventMappings.get(eventName);
    if (!mapping) return [];

    const journey = this.journeys.get(mapping.journeyId);
    if (!journey) return [];

    return mapping.prerequisiteEvents.filter(e =>
      journey.requiredEvents.includes(e)
    );
  }

  /**
   * 모든 Journey 목록 조회
   */
  getAllJourneys(): JourneyDefinition[] {
    if (!this.initialized) {
      this.initializeDefaultJourneys();
    }
    return Array.from(this.journeys.values());
  }

  /**
   * Journey 요약 정보
   */
  getJourneySummary(eventName: string): string | undefined {
    const journey = this.getJourneyForEvent(eventName);
    if (!journey) return undefined;

    const mapping = this.eventMappings.get(eventName)!;
    const position = `${mapping.orderInJourney}/${journey.eventSequence.length}`;

    return `[${journey.name}] ${journey.eventSequence.join(' → ')} (현재: ${eventName}, 위치: ${position})`;
  }

  /**
   * GTM에서 추출한 이벤트 목록 조회
   */
  getGTMEvents(): GTMEventInfo[] {
    return this.gtmEvents;
  }

  /**
   * 초기화 상태 확인
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// 싱글톤 인스턴스
export const journeyRegistry = new JourneyRegistry();

// 편의 함수들
export function initializeJourneyRegistry(gtmJsonPath: string): void {
  journeyRegistry.initializeFromGTM(gtmJsonPath);
}

export function hasJourney(eventName: string): boolean {
  return journeyRegistry.hasJourney(eventName);
}

export function getJourneyForEvent(eventName: string): JourneyDefinition | undefined {
  return journeyRegistry.getJourneyForEvent(eventName);
}

export function getRelatedEventsForTest(eventName: string): string[] {
  return journeyRegistry.getRelatedEventsForTest(eventName);
}

export function getPrerequisiteEvents(eventName: string): string[] {
  return journeyRegistry.getPrerequisiteEvents(eventName);
}

export function getJourneySummary(eventName: string): string | undefined {
  return journeyRegistry.getJourneySummary(eventName);
}
