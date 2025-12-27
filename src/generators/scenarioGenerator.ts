/**
 * 시나리오 생성기 v2.0
 *
 * Vision AI 분석 + GTM 트리거 + DOM 분석을 결합하여
 * Crawler Agent와 Validation Agent가 사용할 수 있는 구조화된 시나리오를 생성합니다.
 *
 * 주요 기능:
 * 1. Whitelist 기반 이벤트 발생 요소 정의
 * 2. 시각적 콘텐츠 추출을 통한 데이터 정확성 검증 지원
 * 3. False Positive 감지 규칙 생성
 * 4. Crawler Agent를 위한 테스트 가이드 생성
 */

import {
  EventScenario,
  WhitelistElement,
  WhitelistBoundary,
  ExplicitExclusion,
  ParamValidationRule,
  ItemParamValidationRule,
  FalsePositiveRule,
  CrossEventConsistencyRule,
  ElementIdentifier,
  VisualContentExtraction,
  ExpectedDataValue,
  CrawlerGuide,
  ElementGroup,
  BubblingGuide,
  ValidationGuide,
  EventFiringValidation,
  DataAccuracyValidation,
  CrossEventValidation,
  ValidationChecklist,
  ParameterValidationDetail,
  EventJourney,
  EventJourneyStep,
  JourneyConsistencyRule,
  JourneyValidationCheck,
  JourneyContext,
  TestCaseKey
} from '../types/scenario';
import {
  journeyRegistry,
  hasJourney,
  getJourneyForEvent,
  getJourneySummary
} from '../config/journeyRegistry';
import { VisionAnalysisResult, VisionScenario, ExtractedVisualContent, ExpectedDataFromVision } from '../analyzers/visionAnalyzer';
import { MatchedElement } from '../analyzers/pageAnalyzer';
import { GTMTrigger } from '../analyzers/gtmAnalyzer';
import { SpecLoader, EventSpec } from '../loaders/specLoader';
import { ParameterValuePredictor } from '../learning/parameterValuePredictor';
import { PageType } from '../types/pageContext';

const AGENT_VERSION = '2.5.0';  // v2.5.0: ParameterValuePredictor 통합

/** 트리거 타입 -> 발생 방식 매핑 */
const TRIGGER_TYPE_TO_FIRING_METHOD: Record<string, 'click' | 'impression' | 'dataLayer' | 'page' | 'scroll' | 'form'> = {
  'CLICK': 'click',
  'LINK_CLICK': 'click',
  'CUSTOM_EVENT': 'dataLayer',
  'DOM_READY': 'impression',
  'WINDOW_LOADED': 'page',
  'PAGEVIEW': 'page',
  'ELEMENT_VISIBILITY': 'impression',
  'SCROLL': 'scroll',
  'SCROLL_DEPTH': 'scroll',
  'FORM_SUBMIT': 'form',
  'FORM_SUBMISSION': 'form',
};

/** 트리거 타입 설명 */
const TRIGGER_TYPE_DESCRIPTIONS: Record<string, string> = {
  'CLICK': '모든 요소 클릭 시 발생',
  'LINK_CLICK': '<a> 태그 클릭 시 발생',
  'CUSTOM_EVENT': 'dataLayer.push() 호출 시 발생',
  'DOM_READY': 'DOM 준비 완료 시 자동 발생 (페이지 로드)',
  'WINDOW_LOADED': '페이지 완전 로드 시 자동 발생',
  'PAGEVIEW': '페이지 뷰 시 자동 발생',
  'ELEMENT_VISIBILITY': '요소가 뷰포트에 노출될 때 자동 발생',
  'SCROLL': '스크롤 시 발생',
  'SCROLL_DEPTH': '특정 스크롤 깊이 도달 시 발생',
  'FORM_SUBMIT': '폼 제출 시 발생',
  'FORM_SUBMISSION': '폼 제출 시 발생',
};

export interface ScenarioGeneratorInput {
  /** 페이지 URL */
  pageUrl: string;

  /** 이벤트명 */
  eventName: string;

  /** 사이트 ID */
  siteId: string;

  /** 스크린샷 경로 */
  screenshotPath: string;

  /** Vision AI 분석 결과 */
  visionAnalysis: VisionAnalysisResult;

  /** GTM 트리거 정보 */
  gtmTriggers?: GTMTrigger[];

  /** DOM에서 찾은 매칭 요소들 */
  matchedElements?: MatchedElement[];

  /** 이벤트 스펙 */
  eventSpec?: EventSpec;

  /** dataLayer 이벤트명 */
  dataLayerEventName?: string;

  /** 페이지 타입 (파라미터 값 예측용) */
  pageType?: PageType;

  /** GA4 Property ID (파라미터 값 예측용) */
  propertyId?: string;
}

export class ScenarioGenerator {
  private specLoader: SpecLoader | null;
  private sessionId: string;
  private valuePredictor: ParameterValuePredictor | null = null;
  private propertyId: string | null = null;

  constructor(specLoader?: SpecLoader, propertyId?: string) {
    this.specLoader = specLoader || null;
    // 세션 ID는 시나리오 생성 시점의 timestamp 기반
    this.sessionId = `sess_${Date.now()}`;

    // ParameterValuePredictor 초기화 (propertyId가 있는 경우)
    if (propertyId) {
      this.propertyId = propertyId;
      this.valuePredictor = new ParameterValuePredictor(propertyId);
    }
  }

  /**
   * PropertyId 설정 및 ValuePredictor 초기화
   */
  setPropertyId(propertyId: string): void {
    if (this.propertyId !== propertyId) {
      this.propertyId = propertyId;
      this.valuePredictor = new ParameterValuePredictor(propertyId);
    }
  }

  /**
   * GTM 트리거 정보 생성
   *
   * GTM 트리거를 분석하여 triggerInfo 객체 생성
   * Crawler Agent가 이 정보를 보고 클릭/노출 테스트 방식 결정
   */
  private createTriggerInfo(gtmTriggers?: GTMTrigger[]): EventScenario['triggerInfo'] {
    if (!gtmTriggers || gtmTriggers.length === 0) {
      // 트리거 정보가 없으면 기본값 (클릭 기반)
      return {
        triggerType: 'CLICK',
        triggerTypeDescription: '트리거 정보 없음 - 기본 클릭 방식 사용',
        firingMethod: 'click',
        triggerNames: []
      };
    }

    // 첫 번째 트리거를 기준으로 (여러 트리거가 있을 경우 가장 우선적인 것)
    const primaryTrigger = gtmTriggers[0];
    const triggerType = (primaryTrigger.type || 'CLICK') as EventScenario['triggerInfo']['triggerType'];
    const firingMethod = TRIGGER_TYPE_TO_FIRING_METHOD[triggerType] || 'click';

    // CSS Selector 추출
    const cssSelectors = gtmTriggers
      .filter(t => t.cssSelector)
      .map(t => t.cssSelector as string);

    // Custom Event 이름 추출
    const customEventNames = gtmTriggers
      .filter(t => t.customEventName)
      .map(t => t.customEventName as string);

    // 필터 조건 추출
    const filters: Array<{ variable: string; condition: string; value: string }> = [];
    for (const trigger of gtmTriggers) {
      for (const filter of trigger.filters || []) {
        filters.push({
          variable: filter.variable,
          condition: filter.type,
          value: filter.value
        });
      }
    }

    // 트리거 파라미터 병합 (여러 트리거의 파라미터를 모두 수집)
    const mergedTriggerParams: Record<string, string> = {};
    for (const trigger of gtmTriggers) {
      if (trigger.triggerParams) {
        for (const [key, value] of Object.entries(trigger.triggerParams)) {
          // 동일 키가 있으면 첫 번째 값 유지 (또는 병합 로직 추가 가능)
          if (!mergedTriggerParams[key]) {
            mergedTriggerParams[key] = value;
          }
        }
      }
    }

    return {
      triggerType,
      triggerTypeDescription: TRIGGER_TYPE_DESCRIPTIONS[triggerType] || `${triggerType} 트리거`,
      firingMethod,
      triggerNames: gtmTriggers.map(t => t.name),
      cssSelector: cssSelectors.length > 0 ? cssSelectors.join(', ') : undefined,
      customEventName: customEventNames.length > 0 ? customEventNames.join(', ') : undefined,
      filters: filters.length > 0 ? filters : undefined,
      triggerParams: Object.keys(mergedTriggerParams).length > 0 ? mergedTriggerParams : undefined
    };
  }

  /**
   * 테스트 케이스 키 생성
   *
   * Scenario → Crawler → Validation 간 데이터 연결용 고유 식별자
   *
   * @param eventName - 이벤트명
   * @param expectedDataValues - 요소에서 추출한 expected data (promotion_id, item_id 등)
   * @param index - 요소 인덱스 (fallback용)
   * @param actionIndex - 동일 요소에 대한 액션 순서 (기본 1)
   */
  private createTestCaseKey(
    eventName: string,
    expectedDataValues?: ExpectedDataValue[],
    index: number = 0,
    actionIndex: number = 1
  ): TestCaseKey {
    let elementKey = `elem_${index}`;

    if (expectedDataValues && expectedDataValues.length > 0) {
      // promotion 이벤트: promotion_id 기반
      const promotionId = expectedDataValues.find(v => v.paramName === 'promotion_id');
      if (promotionId) {
        elementKey = `promo_${promotionId.expectedValue}`;
      }

      // item 이벤트: item_id 기반
      const itemId = expectedDataValues.find(v => v.paramName === 'item_id');
      if (itemId) {
        elementKey = `item_${itemId.expectedValue}`;
      }
    }

    const fullKey = `${this.sessionId}_${eventName}_${elementKey}_${actionIndex}`;

    return {
      sessionId: this.sessionId,
      eventName,
      elementKey,
      actionIndex,
      fullKey
    };
  }

  /**
   * 구조화된 시나리오 생성
   */
  generate(input: ScenarioGeneratorInput): EventScenario {
    const {
      pageUrl,
      eventName,
      siteId,
      screenshotPath,
      visionAnalysis,
      gtmTriggers,
      matchedElements,
      eventSpec,
      dataLayerEventName,
      pageType
    } = input;

    // Whitelist 경계 정의
    const boundary = this.createWhitelistBoundary(gtmTriggers, eventSpec);

    // Whitelist 요소 생성 (Vision 분석 + DOM 매칭 결합)
    const whitelistElements = this.createWhitelistElements(
      eventName,
      visionAnalysis.shouldFire,
      matchedElements,
      boundary.gtmTriggerSelector
    );

    // 명시적 제외 요소 생성
    const explicitExclusions = this.createExplicitExclusions(
      visionAnalysis.shouldNotFire
    );

    // 파라미터 검증 규칙 생성 (값 예측 포함)
    const parameterValidation = this.createParameterValidation(
      eventName,
      pageType,
      pageUrl,
      eventSpec
    );

    // False Positive 감지 규칙 생성
    const falsePositiveRules = this.createFalsePositiveRules(
      eventName,
      boundary.gtmTriggerSelector
    );

    // 크롤러 가이드 생성
    const crawlerGuide = this.createCrawlerGuide(
      whitelistElements,
      eventName,
      boundary.gtmTriggerSelector
    );

    // 정답지 가이드 생성 (Validation Agent용)
    const validationGuide = this.createValidationGuide(
      eventName,
      boundary.gtmTriggerSelector,
      parameterValidation,
      eventSpec
    );

    // Journey 컨텍스트 생성
    const journeyContext = this.createJourneyContext(eventName);

    // GTM 트리거 정보 생성
    const triggerInfo = this.createTriggerInfo(gtmTriggers);

    const scenario: EventScenario = {
      schemaVersion: '2.0.0',

      metadata: {
        generatedAt: new Date().toISOString(),
        pageUrl,
        eventName,
        siteId,
        screenshotPath,
        agentVersion: AGENT_VERSION
      },

      journeyContext,

      eventInfo: {
        ga4EventName: eventName,
        dataLayerEventName: dataLayerEventName || eventName,
        description: eventSpec?.description || `${eventName} 이벤트`
      },

      triggerInfo,

      whitelist: {
        boundary,
        elements: whitelistElements
      },

      explicitExclusions,

      parameterValidation,

      falsePositiveRules,

      analysisNotes: {
        summary: visionAnalysis.reasoning,
        gtmAnalysis: visionAnalysis.gtmAnalysis,
        pageStructure: this.analyzePageStructure(whitelistElements, explicitExclusions),
        warnings: this.generateWarnings(whitelistElements, explicitExclusions)
      },

      crawlerGuide,

      validationGuide
    };

    return scenario;
  }

  /**
   * Whitelist 경계 정의 생성
   */
  private createWhitelistBoundary(
    gtmTriggers?: GTMTrigger[],
    eventSpec?: EventSpec
  ): WhitelistBoundary {
    // GTM 트리거에서 CSS Selector 추출
    let gtmTriggerSelector = '*'; // 기본값 (모든 요소)

    if (gtmTriggers && gtmTriggers.length > 0) {
      const selectors = gtmTriggers
        .filter(t => t.cssSelector)
        .map(t => t.cssSelector as string);

      if (selectors.length > 0) {
        gtmTriggerSelector = selectors.join(', ');
      }
    }

    return {
      gtmTriggerSelector,
      additionalConditions: eventSpec?.trigger_timing ? {
        dataLayerCondition: eventSpec.trigger_timing
      } : undefined,
      description: `이 CSS Selector (${gtmTriggerSelector})에 매칭되는 요소만 ${eventSpec?.ga4_event_name || '해당'} 이벤트를 발생시켜야 합니다.`
    };
  }

  /**
   * Whitelist 요소 생성
   */
  private createWhitelistElements(
    eventName: string,
    shouldFire: VisionScenario[],
    matchedElements?: MatchedElement[],
    gtmSelector?: string
  ): WhitelistElement[] {
    const elements: WhitelistElement[] = [];

    // Vision 분석 결과를 기반으로 요소 생성
    shouldFire.forEach((scenario, index) => {
      // DOM에서 매칭된 요소 찾기 (위치 기반 근사 매칭)
      const matchedElement = this.findMatchingDOMElement(scenario, matchedElements);

      const identifier: ElementIdentifier = {
        cssSelector: matchedElement?.selector || gtmSelector || 'unknown',
        textContent: matchedElement?.text || undefined,
        dataAttributes: matchedElement?.attributes || undefined,
        boundingBox: matchedElement?.boundingBox || scenario.boundingBox,
        visualDescription: scenario.elementDescription,
        locationDescription: scenario.location
      };

      // Vision AI가 추출한 시각적 콘텐츠 변환
      const visualContent = this.convertVisualContent(scenario.visualContent);

      // Vision AI가 추출한 예상 데이터 값 변환
      const expectedDataValues = this.convertExpectedDataValues(scenario.expectedDataValues);

      // TestCaseKey 생성 (Scenario → Crawler → Validation 연결)
      const testCaseKey = this.createTestCaseKey(eventName, expectedDataValues, index);

      elements.push({
        id: `whitelist_${index + 1}`,
        testCaseKey,
        identifier,
        action: this.inferAction(scenario.action),
        expectedParams: undefined,
        visualContent,
        expectedDataValues,
        confidence: scenario.confidence,
        reason: scenario.reason,
        priority: this.calculatePriority(scenario)
      });
    });

    // DOM에서 찾았지만 Vision에서 언급되지 않은 요소도 추가
    if (matchedElements) {
      const domStartIndex = shouldFire.length;
      matchedElements.forEach((el, index) => {
        const alreadyIncluded = elements.some(
          e => e.identifier.cssSelector === el.selector
        );

        if (!alreadyIncluded) {
          // DOM 요소에 대한 TestCaseKey 생성 (index 기반)
          const testCaseKey = this.createTestCaseKey(eventName, undefined, domStartIndex + index);

          elements.push({
            id: `whitelist_dom_${index + 1}`,
            testCaseKey,
            identifier: {
              cssSelector: el.selector,
              textContent: el.text,
              dataAttributes: el.attributes,
              boundingBox: el.boundingBox,
              visualDescription: `[DOM] ${el.tagName} 요소 (${el.className || 'no class'})`,
              locationDescription: el.location
            },
            action: 'click',
            confidence: 'medium',
            reason: `GTM 트리거 조건 (${gtmSelector})에 매칭됨`,
            priority: 50
          });
        }
      });
    }

    // 우선순위로 정렬
    return elements.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Vision AI의 ExtractedVisualContent를 스키마의 VisualContentExtraction으로 변환
   */
  private convertVisualContent(
    visionContent?: ExtractedVisualContent
  ): VisualContentExtraction | undefined {
    if (!visionContent) return undefined;

    return {
      displayedName: visionContent.displayedName,
      displayedPrice: visionContent.displayedPrice,
      displayedOriginalPrice: visionContent.displayedOriginalPrice,
      displayedDiscountRate: visionContent.displayedDiscountRate,
      displayedBrand: visionContent.displayedBrand,
      displayedPromotionText: visionContent.displayedPromotionText,
      displayedPosition: visionContent.displayedPosition,
      extractionConfidence: visionContent.extractionConfidence
    };
  }

  /**
   * Vision AI의 ExpectedDataFromVision을 스키마의 ExpectedDataValue로 변환
   */
  private convertExpectedDataValues(
    visionValues?: ExpectedDataFromVision[]
  ): ExpectedDataValue[] | undefined {
    if (!visionValues || visionValues.length === 0) return undefined;

    return visionValues.map(v => ({
      paramName: v.paramName,
      expectedValue: v.expectedValue,
      extractionSource: v.extractionSource,
      matchRule: 'contains' as const,
      mustValidate: v.mustValidate
    }));
  }

  /**
   * Vision 시나리오와 매칭되는 DOM 요소 찾기
   */
  private findMatchingDOMElement(
    scenario: VisionScenario,
    matchedElements?: MatchedElement[]
  ): MatchedElement | undefined {
    if (!matchedElements || matchedElements.length === 0) {
      return undefined;
    }

    // Bounding Box가 있으면 위치 기반 매칭
    if (scenario.boundingBox) {
      const bb = scenario.boundingBox;
      return matchedElements.find(el => {
        const elBb = el.boundingBox;
        const dx = Math.abs((elBb.x + elBb.width / 2) - (bb.x + bb.width / 2));
        const dy = Math.abs((elBb.y + elBb.height / 2) - (bb.y + bb.height / 2));
        return dx < 100 && dy < 100;
      });
    }

    // 텍스트 기반 매칭
    const descWords = scenario.elementDescription.toLowerCase().split(/\s+/);
    return matchedElements.find(el => {
      const elText = (el.text || '').toLowerCase();
      return descWords.some(word => word.length > 3 && elText.includes(word));
    });
  }

  /**
   * 명시적 제외 요소 생성
   */
  private createExplicitExclusions(
    shouldNotFire: VisionScenario[]
  ): ExplicitExclusion[] {
    return shouldNotFire.map(scenario => ({
      identifier: {
        cssSelector: 'unknown',
        visualDescription: scenario.elementDescription,
        locationDescription: scenario.location
      },
      reason: scenario.reason,
      expectedAlternativeEvent: this.inferAlternativeEvent(scenario.reason),
      confidence: scenario.confidence
    }));
  }

  /**
   * 파라미터 검증 규칙 생성 (값 예측 포함)
   */
  private createParameterValidation(
    eventName: string,
    pageType: PageType | undefined,
    pageUrl: string,
    eventSpec?: EventSpec
  ): { eventParams: ParamValidationRule[]; itemParams?: ItemParamValidationRule[] } {
    const eventParams: ParamValidationRule[] = [];
    const itemParams: ItemParamValidationRule[] = [];

    if (!eventSpec?.parameters) {
      return { eventParams, itemParams };
    }

    // EventSpec.parameters는 EventParameter[] 타입
    for (const param of eventSpec.parameters) {
      // 값 예측 생성
      const valuePrediction = this.predictParameterValue(
        eventName,
        param.ga4_param,
        pageType,
        pageUrl
      );

      eventParams.push({
        name: param.ga4_param,
        required: param.required,
        type: this.inferParamType(param.data_type),
        devGuideVariable: param.dev_guide_var,
        gtmVariable: param.gtm_variable,
        validation: param.validation ? { pattern: param.validation } : undefined,
        valuePrediction,
        description: param.description
      });
    }

    // items_params가 별도 필드로 존재
    if (eventSpec.items_params) {
      for (const param of eventSpec.items_params) {
        itemParams.push({
          name: param.ga4_param,
          required: param.required,
          itemRequired: param.required, // 동일하게 사용
          type: this.inferParamType(param.data_type),
          devGuideVariable: param.dev_guide_var,
          gtmVariable: param.gtm_variable,
          validation: param.validation ? { pattern: param.validation } : undefined,
          description: param.description
        });
      }
    }

    return { eventParams, itemParams: itemParams.length > 0 ? itemParams : undefined };
  }

  /**
   * 파라미터 값 예측 생성
   *
   * ParameterValuePredictor를 사용하여 파라미터 값을 예측합니다.
   * Level 3 정확도 향상을 위한 핵심 로직입니다.
   */
  private predictParameterValue(
    eventName: string,
    paramName: string,
    pageType: PageType | undefined,
    pageUrl: string
  ): ParamValidationRule['valuePrediction'] {
    // 값 유형 분류 (static method 사용)
    const valueType = ParameterValuePredictor.classifyParameterType(eventName, paramName);

    // DYNAMIC 파라미터는 값 예측 불가 (존재 여부만 확인)
    if (valueType === 'DYNAMIC') {
      return {
        predictedValue: null,
        valueType: 'DYNAMIC',
        confidence: 0,
        source: undefined,
        shouldReportMismatch: false  // DYNAMIC은 불일치 리포팅 안 함
      };
    }

    // ValuePredictor가 없으면 기본값 반환
    if (!this.valuePredictor) {
      return {
        predictedValue: null,
        valueType,
        confidence: 50,
        shouldReportMismatch: valueType === 'VERIFIABLE'
      };
    }

    // VERIFIABLE/CONTENT_GROUP 파라미터 값 예측
    const contentGroup = pageType || 'UNKNOWN';

    // 전체 파라미터 예측 후 해당 파라미터 찾기
    const predictions = this.valuePredictor.predictParameterValues(
      eventName,
      contentGroup as any,
      pageUrl
    );

    const prediction = predictions.find(p => p.name === paramName);

    if (prediction) {
      // confidence 문자열을 숫자로 변환
      const confidenceMap: Record<string, number> = {
        'high': 90,
        'medium': 70,
        'low': 50
      };

      return {
        predictedValue: prediction.value,
        valueType,
        confidence: confidenceMap[prediction.confidence] || 50,
        source: prediction.source as any,
        shouldReportMismatch: valueType === 'VERIFIABLE'
      };
    }

    return {
      predictedValue: null,
      valueType,
      confidence: 50,
      shouldReportMismatch: valueType === 'VERIFIABLE'
    };
  }

  /**
   * False Positive 감지 규칙 생성
   */
  private createFalsePositiveRules(
    eventName: string,
    gtmSelector: string
  ): FalsePositiveRule[] {
    const rules: FalsePositiveRule[] = [];

    rules.push({
      id: 'fp_selector_mismatch',
      description: 'GTM 트리거 조건에 매칭되지 않는 요소에서 이벤트 발생',
      condition: {
        eventFired: eventName,
        elementNotMatching: gtmSelector
      },
      errorMessage: `${eventName} 이벤트가 GTM 트리거 조건(${gtmSelector})에 매칭되지 않는 요소에서 발생했습니다. False Positive입니다.`,
      severity: 'critical'
    });

    if (eventName === 'select_promotion') {
      rules.push({
        id: 'fp_product_element',
        description: '상품 요소에서 프로모션 이벤트 발생',
        condition: {
          eventFired: 'select_promotion',
          elementNotMatching: ':not([class*="product"]):not([class*="item"])'
        },
        errorMessage: '상품 요소에서 select_promotion이 발생했습니다. select_item이 발생해야 합니다.',
        severity: 'critical'
      });
    }

    if (eventName === 'select_item') {
      rules.push({
        id: 'fp_promotion_element',
        description: '프로모션 요소에서 상품 이벤트 발생',
        condition: {
          eventFired: 'select_item',
          elementNotMatching: ':not([class*="promo"]):not([class*="banner"])'
        },
        errorMessage: '프로모션 요소에서 select_item이 발생했습니다. select_promotion이 발생해야 합니다.',
        severity: 'warning'
      });
    }

    return rules;
  }

  /**
   * 크롤러 가이드 생성
   */
  private createCrawlerGuide(
    whitelistElements: WhitelistElement[],
    eventName: string,
    gtmTriggerSelector: string
  ): CrawlerGuide {
    const sortedElements = [...whitelistElements].sort((a, b) => b.priority - a.priority);
    const recommendedTestOrder = sortedElements.map(e => e.id);

    const mustTestElements = whitelistElements
      .filter(e => e.confidence === 'high')
      .map(e => e.id);

    const requiresScroll = whitelistElements.some(
      e => e.identifier.boundingBox && e.identifier.boundingBox.y > 1000
    );

    // 테스트 전략 결정
    const elementCount = whitelistElements.length;
    let testStrategy: CrawlerGuide['testStrategy'] = 'exhaustive';
    let sampleSize: number | undefined;

    if (elementCount > 20) {
      testStrategy = 'sampling';
      sampleSize = Math.min(10, Math.ceil(elementCount / 5));
    } else if (elementCount > 10) {
      testStrategy = 'priority_based';
      sampleSize = 10;
    }

    // 요소 그룹화 (같은 위치/유형끼리 묶기)
    const elementGroups = this.createElementGroups(whitelistElements);

    // 버블링 가이드 생성
    const bubbling = this.createBubblingGuide(eventName, gtmTriggerSelector);

    // 예상 소요 시간 (샘플링 고려)
    const testCount = testStrategy === 'exhaustive' ? elementCount : (sampleSize || elementCount);
    const estimatedDuration = testCount * 3;

    return {
      recommendedTestOrder,
      mustTestElements,
      requiresScroll,
      estimatedDuration,
      testStrategy,
      sampleSize,
      elementGroups: elementGroups.length > 0 ? elementGroups : undefined,
      bubbling
    };
  }

  /**
   * 요소 그룹화 (같은 유형의 요소들 묶기)
   */
  private createElementGroups(whitelistElements: WhitelistElement[]): ElementGroup[] {
    const groups: Map<string, WhitelistElement[]> = new Map();

    // 위치 기반 그룹화 (같은 boundingBox 좌표)
    whitelistElements.forEach(el => {
      const bb = el.identifier.boundingBox;
      if (bb) {
        // 비슷한 위치의 요소끼리 그룹화 (y 좌표 100px 범위)
        const yGroup = Math.floor(bb.y / 100) * 100;
        const groupKey = `area_${yGroup}`;

        if (!groups.has(groupKey)) {
          groups.set(groupKey, []);
        }
        groups.get(groupKey)!.push(el);
      }
    });

    // 그룹이 2개 이상인 것만 반환 (단일 요소 그룹은 의미 없음)
    const result: ElementGroup[] = [];
    let groupIndex = 1;

    groups.forEach((elements, key) => {
      if (elements.length >= 2) {
        // 가장 높은 우선순위의 요소를 대표로 선정
        const sorted = [...elements].sort((a, b) => b.priority - a.priority);
        const representative = sorted[0];

        result.push({
          groupId: `group_${groupIndex}`,
          description: this.inferGroupDescription(elements),
          elementIds: elements.map(e => e.id),
          representativeElementId: representative.id,
          commonSelector: this.findCommonSelector(elements)
        });
        groupIndex++;
      }
    });

    return result;
  }

  /**
   * 그룹 설명 추론
   */
  private inferGroupDescription(elements: WhitelistElement[]): string {
    const first = elements[0];
    const location = first.identifier.locationDescription;

    if (location.includes('캐러셀') || location.includes('배너')) {
      return '메인 캐러셀 배너 그룹';
    }
    if (location.includes('프로모션')) {
      return '프로모션 카드 그룹';
    }
    if (location.includes('상품')) {
      return '상품 카드 그룹';
    }

    return `요소 그룹 (${elements.length}개)`;
  }

  /**
   * 공통 셀렉터 찾기
   */
  private findCommonSelector(elements: WhitelistElement[]): string | undefined {
    if (elements.length === 0) return undefined;

    // 첫 번째 요소의 셀렉터에서 공통 부분 추출 시도
    const selectors = elements.map(e => e.identifier.cssSelector);
    const first = selectors[0];

    // 간단한 방법: 공통 접두사 찾기
    let common = first;
    for (const sel of selectors) {
      while (!sel.startsWith(common) && common.length > 0) {
        common = common.substring(0, common.lastIndexOf(' > '));
      }
    }

    return common.length > 10 ? common : undefined;
  }

  /**
   * 버블링 가이드 생성
   */
  private createBubblingGuide(eventName: string, gtmTriggerSelector: string): BubblingGuide {
    // select_promotion의 경우 a[ap-data-promotion]이 트리거
    // 자식 요소(이미지, 텍스트) 클릭 시 버블링으로 a 태그에서 이벤트 발생
    const isLinkClickEvent = gtmTriggerSelector.includes('a[');
    const attributeMatch = gtmTriggerSelector.match(/\[([^\]]+)\]/);
    const detectionAttribute = attributeMatch ? attributeMatch[1].split('=')[0] : undefined;

    return {
      hasBubblingRisk: isLinkClickEvent,
      eventSourceStrategy: isLinkClickEvent ? 'closest_with_attr' : 'click_target',
      bubbleDetectionAttribute: detectionAttribute,
      clickLocationAdvice: isLinkClickEvent
        ? `클릭한 요소에서 가장 가까운 ${gtmTriggerSelector} 요소를 찾아 데이터 추출. ` +
          `자식 요소(이미지, 텍스트)를 클릭해도 부모 <a> 태그의 ${detectionAttribute} 속성에서 데이터를 가져옴.`
        : '클릭한 요소 자체에서 데이터 추출'
    };
  }

  /**
   * 페이지 구조 분석
   */
  private analyzePageStructure(
    whitelistElements: WhitelistElement[],
    exclusions: ExplicitExclusion[]
  ): string {
    const sections = new Map<string, number>();

    [...whitelistElements.map(e => e.identifier.locationDescription),
     ...exclusions.map(e => e.identifier.locationDescription)]
      .forEach(loc => {
        const key = loc.split(' ')[0];
        sections.set(key, (sections.get(key) || 0) + 1);
      });

    const lines: string[] = [];
    lines.push('페이지 구조 분석:');
    sections.forEach((count, section) => {
      lines.push(`- ${section}: ${count}개 요소`);
    });
    lines.push(`- Whitelist 요소: ${whitelistElements.length}개`);
    lines.push(`- 제외 요소: ${exclusions.length}개`);

    return lines.join('\n');
  }

  /**
   * 경고 메시지 생성
   */
  private generateWarnings(
    whitelistElements: WhitelistElement[],
    exclusions: ExplicitExclusion[]
  ): string[] {
    const warnings: string[] = [];

    if (whitelistElements.length === 0) {
      warnings.push('주의: Whitelist 요소가 없습니다. GTM 트리거 조건을 확인하세요.');
    }

    const lowConfidenceCount = whitelistElements.filter(e => e.confidence === 'low').length;
    if (lowConfidenceCount > whitelistElements.length / 2) {
      warnings.push('주의: 확신도가 낮은 요소가 많습니다. 수동 검토가 필요합니다.');
    }

    const unknownSelectorCount = whitelistElements.filter(
      e => e.identifier.cssSelector === 'unknown'
    ).length;
    if (unknownSelectorCount > 0) {
      warnings.push(`주의: ${unknownSelectorCount}개 요소의 CSS Selector를 확인할 수 없습니다.`);
    }

    const noVisualContentCount = whitelistElements.filter(
      e => !e.visualContent
    ).length;
    if (noVisualContentCount > 0) {
      warnings.push(`주의: ${noVisualContentCount}개 요소에 시각적 콘텐츠 정보가 없습니다. 데이터 정확성 검증이 제한됩니다.`);
    }

    return warnings;
  }

  /**
   * 액션 유형 추론
   */
  private inferAction(actionDesc: string): 'click' | 'hover' | 'scroll_into_view' | 'form_submit' {
    const lower = actionDesc.toLowerCase();
    if (lower.includes('hover') || lower.includes('마우스')) return 'hover';
    if (lower.includes('scroll') || lower.includes('스크롤')) return 'scroll_into_view';
    if (lower.includes('submit') || lower.includes('제출')) return 'form_submit';
    return 'click';
  }

  /**
   * 대체 이벤트 추론
   */
  private inferAlternativeEvent(reason: string): string | undefined {
    const lower = reason.toLowerCase();
    if (lower.includes('select_item') || lower.includes('상품')) return 'select_item';
    if (lower.includes('select_promotion') || lower.includes('프로모션')) return 'select_promotion';
    if (lower.includes('navigation') || lower.includes('메뉴')) return 'navigation_click';
    if (lower.includes('search') || lower.includes('검색')) return 'search';
    return undefined;
  }

  /**
   * 파라미터 타입 추론
   */
  private inferParamType(typeStr?: string): 'string' | 'number' | 'boolean' | 'array' | 'object' {
    if (!typeStr) return 'string';
    const lower = typeStr.toLowerCase();
    if (lower.includes('number') || lower.includes('int') || lower.includes('float')) return 'number';
    if (lower.includes('bool')) return 'boolean';
    if (lower.includes('array') || lower.includes('[]')) return 'array';
    if (lower.includes('object') || lower.includes('{}')) return 'object';
    return 'string';
  }

  /**
   * 우선순위 계산
   */
  private calculatePriority(scenario: VisionScenario): number {
    let priority = 50;

    if (scenario.confidence === 'high') priority += 30;
    else if (scenario.confidence === 'medium') priority += 15;

    if (scenario.location.includes('상단')) priority += 10;
    if (scenario.location.includes('메인') || scenario.location.includes('히어로')) priority += 10;

    return priority;
  }

  /**
   * 정답지 가이드 생성 (Validation Agent용)
   */
  private createValidationGuide(
    eventName: string,
    gtmTriggerSelector: string,
    parameterValidation: { eventParams: ParamValidationRule[]; itemParams?: any[] },
    eventSpec?: EventSpec
  ): ValidationGuide {
    // 이벤트 발생 검증 규칙
    const eventFiringValidation = this.createEventFiringValidation(eventName, gtmTriggerSelector);

    // 데이터 정확성 검증 규칙
    const dataAccuracyValidation = this.createDataAccuracyValidation(eventName, parameterValidation);

    // 이벤트 간 일관성 검증 (프로모션/아이템 이벤트의 경우)
    const crossEventValidation = this.createCrossEventValidation(eventName);

    // 이벤트 여정 생성 (연관 이벤트 시퀀스)
    const eventJourney = this.createEventJourney(eventName, gtmTriggerSelector);

    // 검증 체크리스트
    const checklist = this.createValidationChecklist(eventName, gtmTriggerSelector, parameterValidation);

    return {
      eventFiringValidation,
      dataAccuracyValidation,
      crossEventValidation,
      eventJourney,
      checklist
    };
  }

  /**
   * 이벤트 발생 검증 규칙 생성
   */
  private createEventFiringValidation(eventName: string, gtmTriggerSelector: string): EventFiringValidation {
    const isLinkClick = gtmTriggerSelector.startsWith('a[');
    const attributeMatch = gtmTriggerSelector.match(/\[([^\]]+)\]/);
    const attribute = attributeMatch ? attributeMatch[1].split('=')[0] : '';

    return {
      shouldFireWhen: {
        elementMatches: gtmTriggerSelector,
        additionalConditions: isLinkClick
          ? `클릭된 요소 또는 그 조상 중 ${gtmTriggerSelector}에 매칭되는 요소가 있을 때`
          : undefined
      },
      shouldNotFireWhen: {
        elementNotMatches: `:not(${gtmTriggerSelector})`,
        exceptions: [
          '버블링으로 인해 자식 요소 클릭 시에도 발생 가능 (closest() 확인 필요)'
        ]
      },
      validationMethod: isLinkClick ? 'attribute_check' : 'selector_match',
      validationAttribute: attribute || undefined
    };
  }

  /**
   * 데이터 정확성 검증 규칙 생성
   */
  private createDataAccuracyValidation(
    eventName: string,
    parameterValidation: { eventParams: ParamValidationRule[]; itemParams?: any[] }
  ): DataAccuracyValidation {
    const parameterRules: ParameterValidationDetail[] = [];

    // 이벤트별 검증 수준 결정
    let validationLevel: DataAccuracyValidation['validationLevel'] = 'semantic';

    // 프로모션 이벤트의 경우
    if (eventName.includes('promotion')) {
      validationLevel = 'keyword';  // 키워드 수준 검증 (브랜드, 카테고리)

      parameterRules.push(
        {
          paramName: 'promotion_id',
          required: true,
          valueSource: '<a> 태그의 href 속성에서 추출 (planDisplaySn 등)',
          matchMethod: 'exact',
          expectedPattern: '/display/event_detail?planDisplaySn=XXXXX',
          failureSeverity: 'critical',
          description: 'URL에서 추출한 프로모션 ID가 정확히 일치해야 함'
        },
        {
          paramName: 'promotion_name',
          required: true,
          valueSource: 'ap-data-promotion JSON 속성의 promotion_name 필드',
          matchMethod: 'semantic',
          expectedPattern: '화면에 보이는 프로모션 텍스트와 의미적으로 유사해야 함',
          failureSeverity: 'warning',
          description: '화면에 "설화수 세일"이 보이면 "라네즈 파우더팩"이면 안 됨'
        },
        {
          paramName: 'creative_slot',
          required: true,
          valueSource: 'ap-data-promotion JSON 속성의 creative_slot 필드',
          matchMethod: 'contains',
          expectedPattern: '메인배너, 서브배너 등 위치 정보',
          failureSeverity: 'warning',
          description: '프로모션이 노출된 위치 정보'
        },
        {
          paramName: 'index',
          required: false,
          valueSource: 'data-swiper-slide-index 속성 + 1',
          matchMethod: 'numeric',
          expectedPattern: '1 이상의 정수',
          failureSeverity: 'info',
          description: '캐러셀 내 순서 (선택사항)'
        }
      );
    }

    // 아이템 이벤트의 경우
    if (eventName.includes('item')) {
      validationLevel = 'keyword';  // 상품명, 브랜드 등 키워드 확인

      parameterRules.push(
        {
          paramName: 'item_id',
          required: true,
          valueSource: 'ap-data-item JSON 속성 또는 dataLayer',
          matchMethod: 'exact',
          expectedPattern: '상품 고유 ID',
          failureSeverity: 'critical',
          description: '상품 ID는 정확히 일치해야 함'
        },
        {
          paramName: 'item_name',
          required: true,
          valueSource: 'ap-data-item JSON 속성 또는 dataLayer',
          matchMethod: 'semantic',
          expectedPattern: '화면에 보이는 상품명과 유사해야 함',
          failureSeverity: 'warning',
          description: '화면에 "설화수 윤조에센스"가 보이면 완전히 다른 상품명이면 안 됨'
        }
      );
    }

    // 기타 파라미터 추가
    for (const param of parameterValidation.eventParams) {
      const exists = parameterRules.find(p => p.paramName === param.name);
      if (!exists) {
        parameterRules.push({
          paramName: param.name,
          required: param.required,
          valueSource: param.devGuideVariable || param.gtmVariable || 'dataLayer',
          matchMethod: 'contains',
          failureSeverity: param.required ? 'warning' : 'info',
          description: param.description
        });
      }
    }

    return {
      validationLevel,
      parameterRules,
      visualComparisonGuide: this.getVisualComparisonGuide(eventName)
    };
  }

  /**
   * 화면 vs 데이터 비교 가이드 생성
   */
  private getVisualComparisonGuide(eventName: string): string {
    if (eventName.includes('promotion')) {
      return `[프로모션 데이터 검증]
1. promotion_name 검증:
   - 화면에 보이는 프로모션 텍스트와 수집된 promotion_name을 비교
   - 정확한 일치는 불필요, 핵심 키워드(브랜드명, 이벤트명)가 포함되어야 함
   - 예: 화면 "설화수 윤조에센스 세일" → 수집 "설화수 윤조에센스 기획전" ✅
   - 예: 화면 "설화수 립스틱" → 수집 "라네즈 파우더팩" ❌ (브랜드 불일치)

2. creative_slot 검증:
   - 실제 클릭한 위치와 creative_slot 값이 논리적으로 일치해야 함
   - 메인 배너 클릭 → "메인배너" ✅
   - 메인 배너 클릭 → "푸터배너" ❌

3. 이미지 기반 검증:
   - 배너 이미지에 보이는 브랜드 로고, 상품 이미지와 수집 데이터 비교
   - 완전히 다른 브랜드/상품이면 오류`;
    }

    if (eventName.includes('item')) {
      return `[상품 데이터 검증]
1. item_name 검증:
   - 화면에 보이는 상품명과 수집된 item_name 비교
   - 브랜드명 + 상품명 핵심어가 포함되어야 함

2. price 검증:
   - 화면에 보이는 가격과 수집된 price 비교
   - 숫자 오차 허용 범위: ±1% (반올림 오차)

3. brand 검증:
   - 화면에 보이는 브랜드와 수집된 brand 비교
   - 정확히 일치해야 함`;
    }

    return '화면에 표시된 정보와 수집된 데이터가 논리적으로 일치하는지 확인';
  }

  /**
   * 이벤트 간 일관성 검증 규칙 생성
   */
  private createCrossEventValidation(eventName: string): CrossEventValidation | undefined {
    // 프로모션 이벤트 그룹
    if (eventName.includes('promotion')) {
      return {
        relatedEvents: ['view_promotion', 'select_promotion', 'view_promotion_detail'],
        mustMatchParams: ['promotion_id', 'promotion_name', 'creative_slot'],
        description: '같은 프로모션에 대한 view → select → detail 이벤트는 동일한 값을 가져야 함',
        examples: [
          'view_promotion.promotion_id === select_promotion.promotion_id',
          'select_promotion.promotion_name === view_promotion_detail.promotion_name',
          '동일 배너 클릭 시 모든 이벤트의 creative_slot이 일치해야 함'
        ]
      };
    }

    // 상품 이벤트 그룹
    if (eventName.includes('item') || eventName === 'add_to_cart' || eventName === 'view_item') {
      return {
        relatedEvents: ['view_item_list', 'select_item', 'view_item', 'add_to_cart'],
        mustMatchParams: ['item_id', 'item_name', 'item_brand'],
        description: '같은 상품에 대한 목록조회 → 선택 → 상세 → 장바구니 이벤트는 동일한 상품 정보를 가져야 함',
        examples: [
          'select_item.item_id === view_item.item_id',
          'view_item.item_name === add_to_cart.items[0].item_name',
          '동일 상품 클릭 시 모든 이벤트의 item_brand가 일치해야 함'
        ]
      };
    }

    return undefined;
  }

  /**
   * 검증 체크리스트 생성
   */
  private createValidationChecklist(
    eventName: string,
    gtmTriggerSelector: string,
    parameterValidation: { eventParams: ParamValidationRule[]; itemParams?: any[] }
  ): ValidationChecklist[] {
    const checklist: ValidationChecklist[] = [];

    // 1. 이벤트 발생 체크
    checklist.push({
      checkId: 'event_firing_01',
      category: 'event_firing',
      description: `${gtmTriggerSelector} 요소 클릭 시 ${eventName} 이벤트 발생 확인`,
      condition: `clickedElement.matches('${gtmTriggerSelector}') || clickedElement.closest('${gtmTriggerSelector}')`,
      expectedResult: `${eventName} 이벤트가 dataLayer 또는 network에서 감지됨`,
      failureMessage: `${gtmTriggerSelector} 요소를 클릭했으나 ${eventName} 이벤트가 발생하지 않음`,
      severity: 'critical'
    });

    // 2. False Positive 체크
    checklist.push({
      checkId: 'false_positive_01',
      category: 'false_positive',
      description: `${gtmTriggerSelector}가 아닌 요소 클릭 시 ${eventName} 미발생 확인`,
      condition: `!clickedElement.matches('${gtmTriggerSelector}') && !clickedElement.closest('${gtmTriggerSelector}')`,
      expectedResult: `${eventName} 이벤트가 발생하지 않음`,
      failureMessage: `${gtmTriggerSelector}가 아닌 요소에서 ${eventName} 이벤트가 발생함 (False Positive)`,
      severity: 'critical'
    });

    // 3. 필수 파라미터 체크
    const requiredParams = parameterValidation.eventParams.filter(p => p.required);
    for (const param of requiredParams) {
      checklist.push({
        checkId: `param_required_${param.name}`,
        category: 'data_accuracy',
        description: `필수 파라미터 ${param.name} 존재 확인`,
        condition: `event.${param.name} !== undefined && event.${param.name} !== null && event.${param.name} !== ''`,
        expectedResult: `${param.name} 파라미터가 유효한 값을 가짐`,
        failureMessage: `필수 파라미터 ${param.name}가 누락되었거나 빈 값임`,
        severity: 'critical'
      });
    }

    // 4. 프로모션 이벤트 특화 체크
    if (eventName.includes('promotion')) {
      checklist.push({
        checkId: 'data_semantic_brand',
        category: 'data_accuracy',
        description: '화면에 보이는 브랜드와 수집된 promotion_name의 브랜드 일치 확인',
        condition: 'extractBrand(visualContent) ∈ event.promotion_name',
        expectedResult: '화면의 브랜드명이 promotion_name에 포함됨',
        failureMessage: '화면에 보이는 브랜드와 수집된 데이터의 브랜드가 불일치함',
        severity: 'warning'
      });

      checklist.push({
        checkId: 'cross_event_promotion',
        category: 'cross_event',
        description: 'view_promotion과 select_promotion의 promotion_id 일치 확인',
        condition: 'view_promotion.promotion_id === select_promotion.promotion_id',
        expectedResult: '동일 프로모션에 대한 이벤트들의 ID가 일치함',
        failureMessage: 'view_promotion과 select_promotion의 promotion_id가 불일치함',
        severity: 'warning'
      });
    }

    // 5. 아이템 이벤트 특화 체크
    if (eventName.includes('item')) {
      checklist.push({
        checkId: 'data_semantic_product',
        category: 'data_accuracy',
        description: '화면에 보이는 상품명과 수집된 item_name의 유사성 확인',
        condition: 'similarity(visualContent.productName, event.item_name) > 0.7',
        expectedResult: '화면의 상품명과 수집된 item_name이 의미적으로 유사함',
        failureMessage: '화면에 보이는 상품과 수집된 데이터가 완전히 다름',
        severity: 'warning'
      });
    }

    return checklist;
  }

  /**
   * 이벤트 여정 (Event Journey) 생성
   *
   * 단일 이벤트가 아닌 연관된 이벤트 시퀀스 전체를 정의합니다.
   * Validation Agent는 이 Journey를 따라 테스트하고 검증해야 합니다.
   */
  private createEventJourney(eventName: string, gtmTriggerSelector: string): EventJourney | undefined {
    // 프로모션 이벤트 Journey
    if (eventName.includes('promotion')) {
      return this.createPromotionJourney(gtmTriggerSelector);
    }

    // 상품 이벤트 Journey
    if (eventName.includes('item') || eventName === 'add_to_cart' || eventName === 'view_item') {
      return this.createItemJourney(gtmTriggerSelector);
    }

    return undefined;
  }

  /**
   * 프로모션 이벤트 Journey 생성
   *
   * view_promotion → select_promotion → view_promotion_detail 시퀀스
   */
  private createPromotionJourney(gtmTriggerSelector: string): EventJourney {
    const steps: EventJourneyStep[] = [
      {
        stepNumber: 1,
        eventName: 'view_promotion',
        description: '프로모션 배너가 화면에 노출될 때 발생',
        triggerAction: 'scroll_into_view',
        triggerTarget: {
          selector: gtmTriggerSelector,
          visualDescription: '프로모션 배너 영역이 뷰포트에 진입'
        },
        captureParams: ['promotion_id', 'promotion_name', 'creative_slot', 'index'],
        requirement: 'required'
      },
      {
        stepNumber: 2,
        eventName: 'select_promotion',
        description: '사용자가 프로모션 배너를 클릭할 때 발생',
        triggerAction: 'click',
        triggerTarget: {
          selector: gtmTriggerSelector,
          visualDescription: '프로모션 배너 클릭'
        },
        captureParams: ['promotion_id', 'promotion_name', 'creative_slot', 'index'],
        mustMatchPreviousStep: {
          stepNumber: 1,
          params: ['promotion_id', 'promotion_name', 'creative_slot']
        },
        requirement: 'required'
      },
      {
        stepNumber: 3,
        eventName: 'view_promotion_detail',
        description: '프로모션 상세 페이지 로드 시 발생',
        triggerAction: 'navigation',
        triggerTarget: {
          visualDescription: '프로모션 상세 페이지 (event_detail 페이지)'
        },
        captureParams: ['promotion_id', 'promotion_name'],
        mustMatchPreviousStep: {
          stepNumber: 2,
          params: ['promotion_id', 'promotion_name']
        },
        requirement: 'conditional',
        conditionDescription: '프로모션 클릭 후 상세 페이지로 이동하는 경우에만 발생. 외부 링크나 다른 페이지로 이동 시 미발생.'
      }
    ];

    const consistencyRules: JourneyConsistencyRule[] = [
      {
        ruleId: 'promo_id_consistency',
        description: '동일 프로모션에 대한 모든 이벤트의 promotion_id가 일치해야 함',
        compareSteps: [1, 2, 3],
        params: ['promotion_id'],
        matchMethod: 'exact',
        severity: 'critical',
        failureMessage: 'view_promotion, select_promotion, view_promotion_detail의 promotion_id가 서로 다릅니다.'
      },
      {
        ruleId: 'promo_name_consistency',
        description: '동일 프로모션에 대한 모든 이벤트의 promotion_name이 의미적으로 일치해야 함',
        compareSteps: [1, 2, 3],
        params: ['promotion_name'],
        matchMethod: 'semantic',
        severity: 'warning',
        failureMessage: 'view_promotion, select_promotion, view_promotion_detail의 promotion_name이 의미적으로 다릅니다.'
      },
      {
        ruleId: 'creative_slot_consistency',
        description: 'view_promotion과 select_promotion의 creative_slot이 일치해야 함',
        compareSteps: [1, 2],
        params: ['creative_slot'],
        matchMethod: 'exact',
        severity: 'warning',
        failureMessage: '노출 시점(view)과 클릭 시점(select)의 creative_slot이 다릅니다.'
      }
    ];

    const validationChecklist: JourneyValidationCheck[] = [
      {
        checkId: 'journey_sequence_01',
        checkType: 'event_sequence',
        description: 'view_promotion이 select_promotion보다 먼저 발생해야 함',
        relatedSteps: [1, 2],
        expectedResult: 'view_promotion.timestamp < select_promotion.timestamp',
        failureMessage: 'select_promotion이 view_promotion보다 먼저 발생했습니다. 노출 이벤트가 누락되었을 수 있습니다.',
        severity: 'warning'
      },
      {
        checkId: 'journey_sequence_02',
        checkType: 'event_sequence',
        description: 'select_promotion 후 view_promotion_detail이 발생해야 함 (상세 페이지 이동 시)',
        relatedSteps: [2, 3],
        expectedResult: 'select_promotion.timestamp < view_promotion_detail.timestamp',
        failureMessage: '프로모션 클릭 후 상세 페이지 이벤트가 발생하지 않았습니다.',
        severity: 'info'
      },
      {
        checkId: 'journey_param_01',
        checkType: 'param_consistency',
        description: 'step1(view)과 step2(select)의 promotion_id 일치 확인',
        relatedSteps: [1, 2],
        expectedResult: 'step1.promotion_id === step2.promotion_id',
        failureMessage: '노출된 프로모션과 클릭된 프로모션의 ID가 다릅니다.',
        severity: 'critical'
      },
      {
        checkId: 'journey_param_02',
        checkType: 'param_consistency',
        description: 'step2(select)와 step3(detail)의 promotion_id 일치 확인',
        relatedSteps: [2, 3],
        expectedResult: 'step2.promotion_id === step3.promotion_id',
        failureMessage: '클릭한 프로모션과 상세 페이지의 프로모션 ID가 다릅니다.',
        severity: 'critical'
      },
      {
        checkId: 'journey_visual_01',
        checkType: 'data_accuracy',
        description: '화면에 보이는 프로모션 정보와 수집된 데이터 일치 확인',
        relatedSteps: [1, 2],
        expectedResult: '화면의 브랜드/프로모션명이 promotion_name에 포함됨',
        failureMessage: '화면에 보이는 프로모션과 수집된 데이터가 완전히 다릅니다 (예: 화면은 "설화수 세일", 데이터는 "라네즈 기획전").',
        severity: 'warning'
      }
    ];

    return {
      journeyId: 'promotion_journey',
      name: '프로모션 클릭 Journey',
      description: `프로모션 배너 노출(view_promotion) → 클릭(select_promotion) → 상세페이지(view_promotion_detail) 흐름을 검증합니다.

테스트 시나리오:
1. 프로모션 배너가 있는 페이지로 이동
2. 배너가 화면에 보이면 view_promotion 이벤트 확인
3. 배너 클릭 시 select_promotion 이벤트 확인 (view_promotion과 동일한 promotion_id)
4. 상세 페이지로 이동 후 view_promotion_detail 이벤트 확인 (동일한 promotion_id)

검증 포인트:
- 세 이벤트의 promotion_id가 모두 일치해야 함
- promotion_name은 화면에 보이는 텍스트와 의미적으로 일치해야 함
- creative_slot은 클릭한 위치와 논리적으로 맞아야 함`,
      steps,
      consistencyRules,
      validationChecklist
    };
  }

  /**
   * 상품 이벤트 Journey 생성
   *
   * view_item_list → select_item → view_item → add_to_cart 시퀀스
   */
  private createItemJourney(gtmTriggerSelector: string): EventJourney {
    const steps: EventJourneyStep[] = [
      {
        stepNumber: 1,
        eventName: 'view_item_list',
        description: '상품 목록이 화면에 노출될 때 발생',
        triggerAction: 'scroll_into_view',
        triggerTarget: {
          visualDescription: '상품 리스트 영역이 뷰포트에 진입'
        },
        captureParams: ['item_list_id', 'item_list_name', 'items'],
        requirement: 'optional',
        conditionDescription: '상품 목록 페이지에서만 발생. 상품 상세 직접 진입 시 미발생.'
      },
      {
        stepNumber: 2,
        eventName: 'select_item',
        description: '사용자가 상품을 클릭할 때 발생',
        triggerAction: 'click',
        triggerTarget: {
          selector: gtmTriggerSelector,
          visualDescription: '상품 카드/썸네일 클릭'
        },
        captureParams: ['item_id', 'item_name', 'item_brand', 'price', 'index'],
        mustMatchPreviousStep: {
          stepNumber: 1,
          params: ['item_id', 'item_name']
        },
        requirement: 'required'
      },
      {
        stepNumber: 3,
        eventName: 'view_item',
        description: '상품 상세 페이지 로드 시 발생',
        triggerAction: 'navigation',
        triggerTarget: {
          visualDescription: '상품 상세 페이지 (PDP)'
        },
        captureParams: ['item_id', 'item_name', 'item_brand', 'price'],
        mustMatchPreviousStep: {
          stepNumber: 2,
          params: ['item_id', 'item_name', 'item_brand']
        },
        requirement: 'required'
      },
      {
        stepNumber: 4,
        eventName: 'add_to_cart',
        description: '장바구니 담기 버튼 클릭 시 발생',
        triggerAction: 'click',
        triggerTarget: {
          visualDescription: '장바구니 담기 버튼'
        },
        captureParams: ['item_id', 'item_name', 'item_brand', 'price', 'quantity'],
        mustMatchPreviousStep: {
          stepNumber: 3,
          params: ['item_id', 'item_name', 'item_brand']
        },
        requirement: 'conditional',
        conditionDescription: '사용자가 장바구니 담기를 클릭한 경우에만 발생'
      }
    ];

    const consistencyRules: JourneyConsistencyRule[] = [
      {
        ruleId: 'item_id_consistency',
        description: '동일 상품에 대한 모든 이벤트의 item_id가 일치해야 함',
        compareSteps: [1, 2, 3, 4],
        params: ['item_id'],
        matchMethod: 'exact',
        severity: 'critical',
        failureMessage: '상품 Journey 전체에서 item_id가 일치하지 않습니다.'
      },
      {
        ruleId: 'item_name_consistency',
        description: '동일 상품에 대한 모든 이벤트의 item_name이 일치해야 함',
        compareSteps: [2, 3, 4],
        params: ['item_name'],
        matchMethod: 'semantic',
        severity: 'warning',
        failureMessage: 'select_item, view_item, add_to_cart의 item_name이 의미적으로 다릅니다.'
      },
      {
        ruleId: 'item_brand_consistency',
        description: '동일 상품에 대한 모든 이벤트의 item_brand가 일치해야 함',
        compareSteps: [2, 3, 4],
        params: ['item_brand'],
        matchMethod: 'exact',
        severity: 'warning',
        failureMessage: '상품 Journey 내 item_brand가 일치하지 않습니다.'
      },
      {
        ruleId: 'price_consistency',
        description: '상품 가격이 일관되게 수집되어야 함',
        compareSteps: [2, 3, 4],
        params: ['price'],
        matchMethod: 'exact',
        severity: 'info',
        failureMessage: '상품 Journey 내 price가 일치하지 않습니다. (할인 적용 여부 확인 필요)'
      }
    ];

    const validationChecklist: JourneyValidationCheck[] = [
      {
        checkId: 'item_journey_sequence_01',
        checkType: 'event_sequence',
        description: 'select_item이 view_item보다 먼저 발생해야 함',
        relatedSteps: [2, 3],
        expectedResult: 'select_item.timestamp < view_item.timestamp',
        failureMessage: 'view_item이 select_item보다 먼저 발생했습니다.',
        severity: 'warning'
      },
      {
        checkId: 'item_journey_sequence_02',
        checkType: 'event_sequence',
        description: 'view_item이 add_to_cart보다 먼저 발생해야 함',
        relatedSteps: [3, 4],
        expectedResult: 'view_item.timestamp < add_to_cart.timestamp',
        failureMessage: 'add_to_cart가 view_item보다 먼저 발생했습니다.',
        severity: 'warning'
      },
      {
        checkId: 'item_journey_param_01',
        checkType: 'param_consistency',
        description: 'select_item과 view_item의 item_id 일치 확인',
        relatedSteps: [2, 3],
        expectedResult: 'select_item.item_id === view_item.item_id',
        failureMessage: '클릭한 상품과 상세 페이지의 상품 ID가 다릅니다.',
        severity: 'critical'
      },
      {
        checkId: 'item_journey_visual_01',
        checkType: 'data_accuracy',
        description: '화면에 보이는 상품 정보와 수집된 데이터 일치 확인',
        relatedSteps: [2, 3],
        expectedResult: '화면의 상품명/브랜드가 item_name/item_brand와 일치함',
        failureMessage: '화면에 보이는 상품과 수집된 데이터가 완전히 다릅니다.',
        severity: 'warning'
      }
    ];

    return {
      journeyId: 'item_journey',
      name: '상품 클릭 Journey',
      description: `상품 목록 노출(view_item_list) → 클릭(select_item) → 상세(view_item) → 장바구니(add_to_cart) 흐름을 검증합니다.

테스트 시나리오:
1. 상품 목록 페이지에서 view_item_list 이벤트 확인 (선택적)
2. 상품 클릭 시 select_item 이벤트 확인
3. 상품 상세 페이지에서 view_item 이벤트 확인 (동일한 item_id)
4. 장바구니 담기 클릭 시 add_to_cart 이벤트 확인 (동일한 item_id)

검증 포인트:
- 모든 이벤트의 item_id가 일치해야 함
- item_name, item_brand는 화면에 보이는 정보와 일치해야 함
- price는 상품 상세와 장바구니에서 동일해야 함`,
      steps,
      consistencyRules,
      validationChecklist
    };
  }

  /**
   * Journey 컨텍스트 생성
   *
   * 이벤트가 어떤 Journey에 속하는지, 함께 테스트해야 하는 이벤트는 무엇인지 정보 생성
   */
  private createJourneyContext(eventName: string): JourneyContext {
    // Journey에 속하지 않는 이벤트
    if (!hasJourney(eventName)) {
      return {
        belongsToJourney: false,
        summary: `${eventName}은(는) 독립 이벤트입니다. 단일 이벤트로 테스트하세요.`
      };
    }

    const journey = getJourneyForEvent(eventName)!;
    const mapping = journeyRegistry.getEventMapping(eventName)!;

    return {
      belongsToJourney: true,
      journeyId: journey.journeyId,
      journeyName: journey.name,
      orderInJourney: mapping.orderInJourney,
      fullSequence: journey.eventSequence,
      isEntryPoint: mapping.isEntryPoint,
      prerequisiteEvents: mapping.prerequisiteEvents.filter(e =>
        journey.requiredEvents.includes(e)
      ),
      subsequentEvents: mapping.subsequentEvents,
      consistencyParams: journey.consistencyParams,
      summary: getJourneySummary(eventName)
    };
  }
}
