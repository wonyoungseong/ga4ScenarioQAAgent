/**
 * 통합 이벤트 예측기
 *
 * URL 입력 시:
 * 1. 페이지 타입 감지 (URL 패턴)
 * 2. 발생 이벤트 예측 (autoFire/userAction)
 * 3. 각 이벤트의 파라미터 및 값 예측
 * 4. Vision AI로 화면에서만 알 수 있는 값 추출 (선택적)
 *
 * 기존 모듈 재사용:
 * - ValuePredictor: page_view 파라미터 예측
 * - AUTO_FIRE_EVENTS_BY_PAGE: 페이지별 자동 발생 이벤트
 * - USER_ACTION_EVENTS_BY_PAGE: 페이지별 사용자 액션 이벤트
 * - REQUIRED_VARIABLES: 이벤트별 필수 파라미터
 * - CSS_SELECTOR_TRIGGERS: 클릭 트리거 셀렉터
 * - PageAnalyzer: Playwright 기반 스크린샷 캡처
 * - GeminiVisionAnalyzer: Vision AI 분석
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  UnifiedPrediction,
  EventPrediction,
  ParameterPrediction,
  PageContextResult,
  TriggerInfo,
  ConfidenceLevel,
  PredictionSource,
  EVENT_DISPLAY_NAMES,
  PAGE_TYPE_DISPLAY_NAMES,
  QAPredictOptions,
} from '../types/unifiedPrediction';
import { EventFireType, RequiredVariable } from '../types/eventMetadata';
import { ValuePredictor, PredictionContext, PredictionResult } from './valuePredictor';
import {
  AUTO_FIRE_EVENTS_BY_PAGE,
  USER_ACTION_EVENTS_BY_PAGE,
  REQUIRED_VARIABLES,
  CSS_SELECTOR_TRIGGERS,
  DATALAYER_EVENT_MAPPING,
} from '../config/amoremallEventMetadata';
import { PageAnalyzer } from '../analyzers/pageAnalyzer';
import { GeminiVisionAnalyzer } from '../analyzers/visionAnalyzer';
import {
  ParameterExtractionContext,
  ParameterValuePrediction,
} from '../types/parameterPrediction';

/**
 * URL에서 content_group 추출을 위한 패턴
 * (ValuePredictor와 동일)
 */
const CONTENT_GROUP_PATTERNS: Array<{ pattern: RegExp; value: string; priority: number }> = [
  { pattern: /\/display\/main/i, value: 'MAIN', priority: 10 },
  { pattern: /\/main\.do/i, value: 'MAIN', priority: 10 },
  { pattern: /^\/[a-z]{2}\/[a-z]{2}\/?$/i, value: 'MAIN', priority: 5 },  // /kr/ko/
  { pattern: /\/index\.html?$/i, value: 'MAIN', priority: 5 },
  { pattern: /\/product\/detail/i, value: 'PRODUCT_DETAIL', priority: 10 },
  { pattern: /\/(goods|item)\/\d+/i, value: 'PRODUCT_DETAIL', priority: 10 },
  { pattern: /\/display\/category/i, value: 'PRODUCT_LIST', priority: 10 },
  { pattern: /\/category\//i, value: 'PRODUCT_LIST', priority: 8 },
  { pattern: /\/search/i, value: 'SEARCH_RESULT', priority: 10 },
  { pattern: /\/brand\/detail/i, value: 'BRAND_MAIN', priority: 10 },
  { pattern: /\/brand\/[^/]+/i, value: 'BRAND_MAIN', priority: 8 },
  { pattern: /\/cart/i, value: 'CART', priority: 10 },
  { pattern: /\/order\/complete/i, value: 'ORDER_COMPLETE', priority: 15 },
  { pattern: /\/order/i, value: 'ORDER', priority: 10 },
  { pattern: /\/mypage/i, value: 'MY', priority: 10 },
  { pattern: /\/my\//i, value: 'MY', priority: 8 },
  { pattern: /\/event\/view/i, value: 'EVENT_DETAIL', priority: 10 },
  { pattern: /\/event\/[^/]+/i, value: 'EVENT_DETAIL', priority: 8 },
  { pattern: /\/event\/?$/i, value: 'EVENT_LIST', priority: 7 },
  { pattern: /\/event_detail/i, value: 'EVENT_LIST', priority: 7 },
  { pattern: /\/live\/[^/]+/i, value: 'LIVE_DETAIL', priority: 10 },
  { pattern: /\/live\/?$/i, value: 'LIVE_LIST', priority: 8 },
  { pattern: /\/login/i, value: 'LOGIN', priority: 10 },
  { pattern: /\/signup|\/join/i, value: 'SIGNUP', priority: 10 },
  { pattern: /\/membershipPlus/i, value: 'MEMBERSHIP', priority: 10 },
];

/**
 * Vision AI로 추출할 파라미터 목록 (화면에서만 알 수 있는 값)
 * Vision AI가 이해하는 표준 GA4 이름 사용 (item_name, price 등)
 * 결과는 VISION_TO_INTERNAL_MAPPING으로 내부 이름에 매핑됨
 */
const VISION_EXTRACTABLE_PARAMS: Record<string, string[]> = {
  view_item: ['item_name', 'item_brand', 'price', 'item_category'],
  view_item_list: ['item_name', 'item_brand', 'price'],
  select_item: ['item_name', 'item_brand', 'price'],
  add_to_cart: ['item_name', 'item_brand', 'price', 'quantity'],
  view_promotion: ['promotion_name', 'creative_name', 'creative_slot'],
  select_promotion: ['promotion_name', 'creative_name', 'creative_slot'],
};

/**
 * 통합 이벤트 예측기 클래스
 */
export class UnifiedEventPredictor {
  private valuePredictor: ValuePredictor;
  private visionAnalyzer: GeminiVisionAnalyzer | null = null;
  private outputDir: string;

  constructor(outputDir?: string) {
    this.valuePredictor = new ValuePredictor();
    this.outputDir = outputDir || path.join(process.cwd(), 'output');

    // output 디렉토리 생성
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Vision Analyzer 초기화 (지연 초기화)
   */
  private getVisionAnalyzer(): GeminiVisionAnalyzer {
    if (!this.visionAnalyzer) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY 환경 변수가 설정되지 않았습니다. Vision AI를 사용하려면 .env 파일에 GEMINI_API_KEY를 설정하세요.');
      }
      this.visionAnalyzer = new GeminiVisionAnalyzer(apiKey);
    }
    return this.visionAnalyzer;
  }

  /**
   * 메인 예측 API
   */
  async predict(options: QAPredictOptions): Promise<UnifiedPrediction> {
    const startTime = Date.now();
    const { url, useVisionAI = false, verbose = false } = options;
    const warnings: string[] = [];
    let screenshotPath: string | null = null;

    // 1. 페이지 컨텍스트 분석
    const pageContext = this.detectPageContext(url);

    // 2. 발생 이벤트 예측
    const events = this.predictEvents(pageContext.pageType, url);

    // 3. 각 이벤트의 파라미터 예측 (URL 기반)
    for (const event of events) {
      event.parameters = await this.predictParameters(event.eventName, url, pageContext);
    }

    // 4. Vision AI로 화면 기반 값 추출 (선택적)
    if (useVisionAI) {
      if (verbose) console.log('🔍 Vision AI 분석 시작...');

      try {
        // Playwright로 스크린샷 캡처
        screenshotPath = await this.captureScreenshot(url, verbose);

        if (screenshotPath) {
          // Vision AI로 파라미터 값 추출 및 병합
          await this.enrichWithVisionAI(events, screenshotPath, url, pageContext, verbose);
        }
      } catch (error: any) {
        warnings.push(`Vision AI 오류: ${error.message}`);
        if (verbose) console.log(`⚠️ Vision AI 오류: ${error.message}`);
      }
    }

    const analysisTime = Date.now() - startTime;

    return {
      url,
      timestamp: new Date(),
      pageContext,
      events,
      metadata: {
        usedVisionAI: useVisionAI && screenshotPath !== null,
        analysisTime,
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    };
  }

  /**
   * Playwright로 페이지 스크린샷 캡처
   */
  private async captureScreenshot(url: string, verbose: boolean = false): Promise<string | null> {
    const pageAnalyzer = new PageAnalyzer();

    try {
      if (verbose) console.log('📸 브라우저 초기화...');
      await pageAnalyzer.init();

      if (verbose) console.log(`📸 페이지 방문: ${url}`);
      await pageAnalyzer.navigateTo(url);

      if (verbose) console.log('📸 스크린샷 캡처...');
      const screenshotPath = await pageAnalyzer.captureScreenshot(this.outputDir);

      if (verbose) console.log(`📸 스크린샷 저장: ${screenshotPath}`);
      return screenshotPath;
    } catch (error: any) {
      if (verbose) console.log(`⚠️ 스크린샷 캡처 실패: ${error.message}`);
      return null;
    } finally {
      await pageAnalyzer.close();
    }
  }

  /**
   * 내부 파라미터 이름 → Vision AI 표준 이름 역매핑
   */
  private readonly INTERNAL_TO_VISION_MAPPING: Record<string, string> = {
    product_name: 'item_name',
    product_brandname: 'item_brand',
    value: 'price',
    product_category: 'item_category',
    product_id: 'item_id',
  };

  /**
   * Vision AI로 파라미터 값 추출 및 병합
   */
  private async enrichWithVisionAI(
    events: EventPrediction[],
    screenshotPath: string,
    url: string,
    pageContext: PageContextResult,
    verbose: boolean = false
  ): Promise<void> {
    const visionAnalyzer = this.getVisionAnalyzer();

    for (const event of events) {
      const visionParams = VISION_EXTRACTABLE_PARAMS[event.eventName];
      if (!visionParams || visionParams.length === 0) continue;

      // 아직 값이 없는 파라미터 중 Vision AI로 추출 가능한 것 필터링
      // 내부 파라미터명을 Vision 표준명으로 변환하여 체크
      const paramsNeedingExtraction = event.parameters.filter(p => {
        if (p.predictedValue !== null) return false;
        const visionName = this.INTERNAL_TO_VISION_MAPPING[p.key] || p.key;
        return visionParams.includes(visionName) || visionParams.includes(p.key);
      });

      if (paramsNeedingExtraction.length === 0) continue;

      // Vision AI에 요청할 때는 표준 GA4 이름 사용
      const paramsToExtract = visionParams.filter(visionParam => {
        // 이 visionParam이 필요한 내부 파라미터가 있는지 확인
        return paramsNeedingExtraction.some(p => {
          const visionName = this.INTERNAL_TO_VISION_MAPPING[p.key] || p.key;
          return visionName === visionParam || p.key === visionParam;
        });
      });

      if (paramsToExtract.length === 0) continue;

      if (verbose) console.log(`🔍 ${event.eventName}: Vision AI로 ${paramsToExtract.join(', ')} 추출 시도`);

      try {
        const context: ParameterExtractionContext = {
          eventName: event.eventName,
          pageType: pageContext.pageType,
          parametersToExtract: paramsToExtract.map(name => ({
            name,
            description: this.getParamDescription(name),
            type: this.getParamType(name),
            required: true,
            extractionHint: this.getExtractionHint(name),
          })),
        };

        const visionResult = await visionAnalyzer.extractParameterValues(screenshotPath, context, url);

        if (verbose) {
          const eventParamCount = Object.keys(visionResult.eventParams || {}).filter(k => visionResult.eventParams[k]?.value !== null).length;
          const itemCount = visionResult.items?.length || 0;
          const itemsWithValues = visionResult.items?.filter(item => {
            return Object.values(item).some((v: any) => v?.value !== null && v?.value !== undefined);
          }).length || 0;
          console.log(`   📦 Vision 응답: eventParams ${eventParamCount}개, items ${itemsWithValues}/${itemCount}개 (값 있음)`);
        }

        // Vision AI 결과를 파라미터에 병합 (매핑 적용)
        this.mergeVisionResults(event.parameters, visionResult, verbose);
      } catch (error: any) {
        if (verbose) console.log(`⚠️ ${event.eventName} Vision 분석 실패: ${error.message}`);
      }
    }
  }

  /**
   * Vision AI 출력 → 내부 파라미터 이름 매핑
   * Vision AI는 표준 GA4 이름을 사용하지만, REQUIRED_VARIABLES는 커스텀 이름 사용
   */
  private readonly VISION_TO_INTERNAL_MAPPING: Record<string, string> = {
    item_name: 'product_name',
    item_brand: 'product_brandname',
    price: 'value',
    item_category: 'product_category',
    item_id: 'product_id',
  };

  /**
   * Vision AI 결과를 파라미터 예측에 병합
   */
  private mergeVisionResults(
    parameters: ParameterPrediction[],
    visionResult: ParameterValuePrediction,
    verbose: boolean = false
  ): void {
    // Event-level 파라미터 병합
    for (const [key, value] of Object.entries(visionResult.eventParams)) {
      if (!value) continue;

      // 매핑된 키 또는 원래 키로 찾기
      const mappedKey = this.VISION_TO_INTERNAL_MAPPING[key] || key;
      const param = parameters.find(p => p.key === mappedKey || p.key === key);

      if (param && param.predictedValue === null && value.value !== null) {
        param.predictedValue = value.value;
        param.source = 'vision';
        param.confidence = this.mapVisionConfidence(value.confidence);
        param.notes = `Vision AI (${value.sourceLocation || value.source})`;
        if (verbose) console.log(`   ✅ ${param.key}: ${value.value}`);
      }
    }

    // Item-level 파라미터 병합 (첫 번째 아이템 사용)
    if (visionResult.items && visionResult.items.length > 0) {
      const firstItem = visionResult.items[0];

      for (const [key, value] of Object.entries(firstItem)) {
        if (!value || typeof value !== 'object' || !('value' in value)) continue;

        // 매핑된 키 또는 원래 키로 찾기
        const mappedKey = this.VISION_TO_INTERNAL_MAPPING[key] || key;
        const param = parameters.find(p => p.key === mappedKey || p.key === key);

        if (param && param.predictedValue === null && value.value !== null) {
          param.predictedValue = value.value;
          param.source = 'vision';
          param.confidence = this.mapVisionConfidence(value.confidence);
          param.notes = `Vision AI (${value.sourceLocation || value.source})`;
          if (verbose) console.log(`   ✅ ${param.key}: ${value.value}`);
        }
      }
    }
  }

  /**
   * Vision 신뢰도를 내부 신뢰도로 매핑
   */
  private mapVisionConfidence(visionConfidence: string): ConfidenceLevel {
    const map: Record<string, ConfidenceLevel> = {
      HIGH: 'high',
      MEDIUM: 'medium',
      LOW: 'low',
    };
    return map[visionConfidence] || 'medium';
  }

  /**
   * 파라미터 설명 가져오기
   */
  private getParamDescription(paramName: string): string {
    const descriptions: Record<string, string> = {
      item_name: '상품명',
      item_brand: '브랜드명',
      price: '상품 가격',
      item_category: '상품 카테고리',
      item_variant: '상품 옵션/변형',
      quantity: '수량',
      promotion_name: '프로모션 이름',
      creative_name: '크리에이티브 이름',
      creative_slot: '크리에이티브 슬롯 위치',
    };
    return descriptions[paramName] || paramName;
  }

  /**
   * 파라미터 타입 가져오기
   */
  private getParamType(paramName: string): 'string' | 'number' | 'boolean' {
    const numberParams = ['price', 'quantity', 'discount', 'value', 'index'];
    return numberParams.includes(paramName) ? 'number' : 'string';
  }

  /**
   * 추출 힌트 가져오기
   */
  private getExtractionHint(paramName: string): string | undefined {
    const hints: Record<string, string> = {
      price: '가격에서 숫자만 추출 (₩, 원, 쉼표 제거)',
      item_name: '상품명 전체 텍스트 추출',
      item_brand: '브랜드 로고 또는 텍스트에서 추출',
      quantity: '수량 선택 영역에서 숫자 추출',
    };
    return hints[paramName];
  }

  /**
   * 페이지 컨텍스트 감지 (URL 패턴 기반)
   */
  detectPageContext(url: string): PageContextResult {
    const urlObj = new URL(url);

    // 페이지 타입 감지
    const pageTypeResult = this.detectPageType(urlObj.pathname);

    // 쿼리 파라미터 파싱
    const queryParams: Record<string, string> = {};
    urlObj.searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });

    return {
      pageType: pageTypeResult.pageType,
      pageTypeConfidence: pageTypeResult.confidence,
      pageTypeSource: 'url_pattern',
      devVariables: {},  // 실제 방문 시 수집됨
      url,
      hostname: urlObj.hostname,
      pathname: urlObj.pathname,
      queryParams,
    };
  }

  /**
   * URL 경로에서 페이지 타입 감지
   */
  private detectPageType(pathname: string): { pageType: string; confidence: number } {
    let bestMatch = { pageType: 'OTHERS', confidence: 0.3, priority: 0 };

    for (const rule of CONTENT_GROUP_PATTERNS) {
      if (rule.pattern.test(pathname)) {
        if (rule.priority > bestMatch.priority) {
          bestMatch = {
            pageType: rule.value,
            confidence: rule.priority >= 10 ? 0.9 : 0.7,
            priority: rule.priority,
          };
        }
      }
    }

    return { pageType: bestMatch.pageType, confidence: bestMatch.confidence };
  }

  /**
   * 페이지 타입별 발생 이벤트 예측
   */
  predictEvents(pageType: string, url: string): EventPrediction[] {
    const events: EventPrediction[] = [];

    // 1. autoFire 이벤트 (페이지 로드 시 자동 발생)
    const autoFireEvents = AUTO_FIRE_EVENTS_BY_PAGE[pageType] || [];
    for (const eventName of autoFireEvents) {
      events.push(this.createEventPrediction(eventName, 'autoFire', pageType, url));
    }

    // 2. userAction 이벤트 (사용자 액션으로 발생)
    const userActionEvents = USER_ACTION_EVENTS_BY_PAGE[pageType] || [];
    for (const eventName of userActionEvents) {
      events.push(this.createEventPrediction(eventName, 'userAction', pageType, url));
    }

    return events;
  }

  /**
   * 이벤트 예측 객체 생성
   */
  private createEventPrediction(
    eventName: string,
    fireType: EventFireType,
    pageType: string,
    url: string
  ): EventPrediction {
    const displayName = EVENT_DISPLAY_NAMES[eventName] || eventName;
    const trigger = this.getTriggerInfo(eventName, fireType);

    return {
      eventName,
      displayName,
      fireType,
      shouldFire: true,
      shouldFireReason: fireType === 'autoFire'
        ? `${PAGE_TYPE_DISPLAY_NAMES[pageType] || pageType} 페이지 로드 시 자동 발생`
        : `${PAGE_TYPE_DISPLAY_NAMES[pageType] || pageType} 페이지에서 사용자 액션으로 발생 가능`,
      trigger,
      parameters: [],
      confidence: 'high',
    };
  }

  /**
   * 이벤트 트리거 정보 가져오기
   */
  private getTriggerInfo(eventName: string, fireType: EventFireType): TriggerInfo | undefined {
    if (fireType === 'autoFire') {
      const dataLayerEvents = DATALAYER_EVENT_MAPPING[eventName];
      if (dataLayerEvents && dataLayerEvents.length > 0) {
        return {
          type: 'dataLayer',
          dataLayerEvent: dataLayerEvents[0],
          description: `dataLayer.push({event: "${dataLayerEvents[0]}"}) 발생 시`,
        };
      }
      return {
        type: 'pageLoad',
        description: '페이지 로드 시 자동 발생',
      };
    }

    // userAction 이벤트
    const selectors = CSS_SELECTOR_TRIGGERS[eventName];
    if (selectors && selectors.length > 0) {
      return {
        type: 'click',
        selector: selectors[0],
        description: `${selectors[0]} 요소 클릭 시`,
      };
    }

    const dataLayerEvents = DATALAYER_EVENT_MAPPING[eventName];
    if (dataLayerEvents && dataLayerEvents.length > 0) {
      return {
        type: 'custom',
        dataLayerEvent: dataLayerEvents[0],
        description: `dataLayer.push({event: "${dataLayerEvents[0]}"}) 발생 시`,
      };
    }

    return undefined;
  }

  /**
   * 이벤트별 파라미터 예측
   */
  async predictParameters(
    eventName: string,
    url: string,
    pageContext: PageContextResult
  ): Promise<ParameterPrediction[]> {
    // page_view는 기존 ValuePredictor 사용
    if (eventName === 'page_view') {
      return this.predictPageViewParameters(url, pageContext);
    }

    // 다른 이벤트는 REQUIRED_VARIABLES 기반으로 예측
    return this.predictEventParameters(eventName, url, pageContext);
  }

  /**
   * page_view 이벤트 파라미터 예측 (ValuePredictor 활용)
   */
  private predictPageViewParameters(
    url: string,
    pageContext: PageContextResult
  ): ParameterPrediction[] {
    const context: PredictionContext = {
      url,
      visionPageType: pageContext.pageType,
    };

    const results = this.valuePredictor.predictAll(context);
    return results.map(this.convertPredictionResult);
  }

  /**
   * PredictionResult를 ParameterPrediction으로 변환
   */
  private convertPredictionResult = (result: PredictionResult): ParameterPrediction => {
    return {
      key: result.key,
      predictedValue: result.predictedValue,
      source: this.mapPredictionType(result.predictionType),
      confidence: result.confidence as ConfidenceLevel,
      required: !result.notes?.includes('선택'),
      notes: result.notes,
    };
  };

  /**
   * 예측 타입을 PredictionSource로 매핑
   */
  private mapPredictionType(predictionType: string): PredictionSource {
    const typeMap: Record<string, PredictionSource> = {
      'url_domain_mapping': 'url',
      'url_extraction': 'url',
      'url_pattern': 'url_pattern',
      'url_pattern_and_vision': 'url_pattern',
      'user_agent': 'computed',
      'login_state': 'devVar',
      'browser_auto': 'gtm',
      'internal_logic': 'gtm',
      'url_split': 'url',
      'login_only': 'devVar',
      'page_conditional': 'devVar',
      'constant': 'constant',
    };
    return typeMap[predictionType] || 'unknown';
  }

  /**
   * 일반 이벤트 파라미터 예측 (REQUIRED_VARIABLES 기반)
   */
  private predictEventParameters(
    eventName: string,
    url: string,
    pageContext: PageContextResult
  ): ParameterPrediction[] {
    const requiredVars = REQUIRED_VARIABLES[eventName] || [];
    const predictions: ParameterPrediction[] = [];

    for (const varDef of requiredVars) {
      predictions.push(this.predictParameter(varDef, url, pageContext));
    }

    return predictions;
  }

  /**
   * 개별 파라미터 예측
   */
  private predictParameter(
    varDef: RequiredVariable,
    url: string,
    pageContext: PageContextResult
  ): ParameterPrediction {
    const { paramName, required, description, defaultValue, fallbackSource, fallbackExtractor } = varDef;

    // 1. 기본값이 있으면 사용
    if (defaultValue) {
      return {
        key: paramName,
        displayName: description,
        predictedValue: defaultValue,
        source: 'constant',
        confidence: 'high',
        required,
        notes: `고정값: ${defaultValue}`,
      };
    }

    // 2. URL에서 추출 가능한 파라미터
    const urlValue = this.extractFromUrl(paramName, url, pageContext.queryParams);
    if (urlValue !== null) {
      return {
        key: paramName,
        displayName: description,
        predictedValue: urlValue,
        source: 'url',
        confidence: 'high',
        required,
        notes: 'URL에서 추출',
        devVariable: varDef.apVariables[0],
      };
    }

    // 3. 고정값 파라미터 (currency 등)
    const constantValue = this.getConstantValue(paramName, pageContext);
    if (constantValue !== null) {
      return {
        key: paramName,
        displayName: description,
        predictedValue: constantValue,
        source: 'constant',
        confidence: 'high',
        required,
        notes: '상수값',
      };
    }

    // 4. 개발 변수에서 수집 필요
    return {
      key: paramName,
      displayName: description,
      predictedValue: null,
      source: 'devVar',
      confidence: 'low',
      required,
      notes: `개발변수(${varDef.apVariables.join(', ')})에서 수집 필요`,
      devVariable: varDef.apVariables[0],
    };
  }

  /**
   * URL에서 파라미터 값 추출
   */
  private extractFromUrl(
    paramName: string,
    url: string,
    queryParams: Record<string, string>
  ): string | number | null {
    // 상품 ID
    if (paramName === 'product_id' || paramName === 'item_id') {
      // 쿼리 파라미터에서
      if (queryParams.onlineProdCode) return queryParams.onlineProdCode;
      if (queryParams.prodCode) return queryParams.prodCode;
      if (queryParams.itemId) return queryParams.itemId;
      if (queryParams.productId) return queryParams.productId;

      // URL 경로에서
      const pathMatch = url.match(/\/(?:product|goods|item)\/(\d+)/i);
      if (pathMatch) return pathMatch[1];
    }

    // 이벤트 코드
    if (paramName === 'view_event_code' || paramName === 'promotion_id') {
      if (queryParams.eventCode) return queryParams.eventCode;
      if (queryParams.promoId) return queryParams.promoId;

      // URL 경로에서 이벤트 ID
      const eventMatch = url.match(/\/event\/(?:view\/)?(\d+)/i);
      if (eventMatch) return eventMatch[1];

      // URL 경로에서 이벤트 코드 (문자열)
      const eventCodeMatch = url.match(/\/event(?:View)?\/([A-Za-z0-9]+)\.do/i);
      if (eventCodeMatch) return eventCodeMatch[1];
    }

    // 검색어
    if (paramName === 'search_term') {
      if (queryParams.keyword) return decodeURIComponent(queryParams.keyword);
      if (queryParams.query) return decodeURIComponent(queryParams.query);
      if (queryParams.q) return decodeURIComponent(queryParams.q);
    }

    // 브랜드 코드
    if (paramName === 'brandshop_code' || paramName === 'brand_code') {
      const brandMatch = url.match(/\/brand\/([^/]+)/i);
      if (brandMatch) return brandMatch[1];
    }

    return null;
  }

  /**
   * 상수값 파라미터 가져오기
   */
  private getConstantValue(paramName: string, pageContext: PageContextResult): string | null {
    // 통화
    if (paramName === 'currency') {
      const hostname = pageContext.hostname;
      if (hostname.includes('.kr') || hostname.includes('/kr/')) return 'KRW';
      if (hostname.includes('.jp') || hostname.includes('/jp/')) return 'JPY';
      if (hostname.includes('.cn') || hostname.includes('/cn/')) return 'CNY';
      if (hostname.includes('.us') || hostname.includes('/us/')) return 'USD';
      return 'KRW';  // 기본값
    }

    return null;
  }

  /**
   * 콘솔 출력 포맷팅
   */
  formatOutput(prediction: UnifiedPrediction): string {
    const lines: string[] = [];

    lines.push('═'.repeat(70));
    lines.push(`📊 통합 QA 예측 결과`);
    lines.push('═'.repeat(70));
    lines.push('');

    // 페이지 정보
    lines.push(`📍 URL: ${prediction.url}`);
    lines.push(`📄 페이지 타입: ${PAGE_TYPE_DISPLAY_NAMES[prediction.pageContext.pageType] || prediction.pageContext.pageType} (신뢰도: ${Math.round(prediction.pageContext.pageTypeConfidence * 100)}%)`);
    lines.push('');

    // 이벤트 목록
    lines.push('─'.repeat(70));
    lines.push('🎯 발생 예상 이벤트');
    lines.push('─'.repeat(70));

    // autoFire 이벤트
    const autoFireEvents = prediction.events.filter(e => e.fireType === 'autoFire');
    if (autoFireEvents.length > 0) {
      lines.push('');
      lines.push('📌 자동 발생 (autoFire):');
      for (const event of autoFireEvents) {
        lines.push(`   • ${event.displayName} (${event.eventName})`);
      }
    }

    // userAction 이벤트
    const userActionEvents = prediction.events.filter(e => e.fireType === 'userAction');
    if (userActionEvents.length > 0) {
      lines.push('');
      lines.push('👆 사용자 액션 (userAction):');
      for (const event of userActionEvents) {
        const triggerDesc = event.trigger?.selector
          ? `클릭: ${event.trigger.selector}`
          : event.trigger?.dataLayerEvent
            ? `dataLayer: ${event.trigger.dataLayerEvent}`
            : '';
        lines.push(`   • ${event.displayName} (${event.eventName})${triggerDesc ? ` [${triggerDesc}]` : ''}`);
      }
    }

    // 주요 이벤트의 파라미터 상세
    lines.push('');
    lines.push('─'.repeat(70));
    lines.push('📊 주요 이벤트 파라미터 예측');
    lines.push('─'.repeat(70));

    const keyEvents = ['page_view', 'view_item', 'view_item_list', 'view_search_results', 'add_to_cart', 'purchase'];
    for (const event of prediction.events) {
      if (keyEvents.includes(event.eventName) && event.parameters.length > 0) {
        lines.push('');
        lines.push(`▸ ${event.displayName} (${event.eventName})`);

        // 예측값이 있는 파라미터만
        const predictedParams = event.parameters.filter(p => p.predictedValue !== null);
        const unpredictedParams = event.parameters.filter(p => p.predictedValue === null);

        if (predictedParams.length > 0) {
          lines.push('  예측 완료:');
          for (const param of predictedParams.slice(0, 10)) {  // 최대 10개
            const value = typeof param.predictedValue === 'string'
              ? param.predictedValue.length > 30
                ? param.predictedValue.substring(0, 30) + '...'
                : param.predictedValue
              : param.predictedValue;
            const confIcon = param.confidence === 'high' ? '✅' : param.confidence === 'medium' ? '🔶' : '⚪';
            lines.push(`    ${confIcon} ${param.key}: ${value}`);
          }
          if (predictedParams.length > 10) {
            lines.push(`    ... 외 ${predictedParams.length - 10}개`);
          }
        }

        if (unpredictedParams.length > 0) {
          lines.push(`  수집 필요: ${unpredictedParams.map(p => p.key).join(', ')}`);
        }
      }
    }

    // 메타데이터
    lines.push('');
    lines.push('─'.repeat(70));
    lines.push(`⏱️ 분석 시간: ${prediction.metadata?.analysisTime}ms`);
    if (prediction.metadata?.usedVisionAI) {
      lines.push('🔍 Vision AI: 사용됨');

      // Vision AI로 추출된 파라미터 요약
      const visionParams: string[] = [];
      for (const event of prediction.events) {
        for (const param of event.parameters) {
          if (param.source === 'vision') {
            visionParams.push(`${param.key}=${param.predictedValue}`);
          }
        }
      }
      if (visionParams.length > 0) {
        lines.push(`   추출된 값: ${visionParams.slice(0, 5).join(', ')}${visionParams.length > 5 ? ` 외 ${visionParams.length - 5}개` : ''}`);
      }
    }
    if (prediction.metadata?.warnings && prediction.metadata.warnings.length > 0) {
      lines.push(`⚠️ 경고: ${prediction.metadata.warnings.join(', ')}`);
    }
    lines.push('═'.repeat(70));

    return lines.join('\n');
  }
}

/**
 * 간편 사용을 위한 팩토리 함수
 */
export async function predictQA(url: string, options?: Partial<QAPredictOptions>): Promise<UnifiedPrediction> {
  const predictor = new UnifiedEventPredictor();
  return predictor.predict({ url, ...options });
}
