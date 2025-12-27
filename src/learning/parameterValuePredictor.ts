/**
 * Parameter Value Predictor
 *
 * GA4에서 학습한 패턴을 기반으로 파라미터 값을 예측합니다.
 * Level 3 값 정확도 향상을 위한 핵심 모듈입니다.
 */

import * as fs from 'fs';
import * as path from 'path';
import { PredictedParameter, ContentGroup } from '../branch/types';

/**
 * 파라미터 값 유형
 */
export type ParameterValueType =
  | 'CONSTANT'         // 사이트 전체에서 동일 (예: site_name="APMALL")
  | 'EVENT_FIXED'      // 이벤트별 고정값 (예: event_category="ecommerce")
  | 'CONTENT_GROUP'    // 컨텐츠 그룹 기반 (예: scroll의 event_label=contentGroup)
  | 'PAGE_CONTEXT'     // 페이지에서 추출 필요 (예: product_name, product_id)
  | 'URL_PARAM'        // URL에서 추출 (예: view_event_code from query)
  | 'USER_ACTION'      // 사용자 액션에 따라 다름 (예: event_label for click)
  | 'UNKNOWN';

/**
 * 파라미터 값 예측 규칙
 */
export interface ParameterValueRule {
  parameterName: string;
  eventName: string;
  valueType: ParameterValueType;
  fixedValue?: string;                    // CONSTANT, EVENT_FIXED인 경우
  contentGroupValues?: Record<string, string>;  // CONTENT_GROUP인 경우 컨텐츠 그룹별 값
  extractionSource?: string;              // PAGE_CONTEXT, URL_PARAM인 경우 추출 소스
  sampleValues?: string[];                // 참고용 샘플 값
  confidence: number;                     // 예측 신뢰도 (0-1)
}

/**
 * 학습된 사이트 데이터
 */
interface SiteLearningData {
  propertyId: string;
  eventParameterPatterns: Record<string, Array<{
    eventName: string;
    parameterName: string;
    valuePattern: string;
    sampleValues: string[];
  }>>;
}

/**
 * 파라미터 값 예측기
 */
export class ParameterValuePredictor {
  private rules: Map<string, ParameterValueRule> = new Map();
  private siteData: SiteLearningData | null = null;
  private propertyId: string;

  // 이벤트별 고정 파라미터 (이벤트 타입에 따라 항상 동일한 값)
  // GA4 URL별 분석 결과 (2025-12-28): event_category는 대부분 이벤트에서 100% 일관
  private static EVENT_FIXED_PARAMS: Record<string, Record<string, string>> = {
    // ecommerce 이벤트들 - event_category: 'ecommerce' (100% 일관)
    'view_item': { 'event_category': 'ecommerce' },
    'view_item_list': { 'event_category': 'ecommerce' },
    'select_item': { 'event_category': 'ecommerce' },
    'add_to_cart': { 'event_category': 'ecommerce' },
    'remove_from_cart': { 'event_category': 'ecommerce' },
    'begin_checkout': { 'event_category': 'ecommerce' },
    'purchase': { 'event_category': 'ecommerce' },
    'view_promotion': { 'event_category': 'ecommerce' },
    'select_promotion': { 'event_category': 'ecommerce' },

    // 기타 이벤트들 - URL별 분석 결과 100% 일관
    'scroll': { 'event_category': 'scroll' },
    'qualified_visit': { 'event_category': 'qualified_visit' },
    'view_search_results': { 'event_category': 'search' },
    'view_promotion_detail': { 'event_category': 'promotion' },
    'live': { 'event_category': 'live' },
    'brand_product_click': { 'event_category': 'PRDS' },
    'custom_event': { 'event_category': 'history_like_scroll' },
    'click_with_duration': { 'event_category': 'click_with_duration' },
    // ap_click은 URL별로 event_category가 변동 (45% 일관) - URL_VARIABLE_PARAMS에서 처리
  };

  // 컨텐츠 그룹 기반 파라미터 (컨텐츠 그룹에 따라 값이 결정됨)
  // GA4 실제 데이터 분석 결과 기반
  // ⚠️ 2025-12-28 CRITICAL 이슈 수정: 동적 값들은 URL_VARIABLE_PARAMS로 이동
  private static CONTENT_GROUP_BASED_PARAMS: Record<string, Record<string, Record<string, string>>> = {
    // ⚠️ scroll.event_label: URL_VARIABLE_PARAMS로 이동 (dataLayer 페이지 타입과 URL 기반 타입 불일치 가능)
    // 참고용으로 남겨둠 (예측에는 사용하지 않음)
    '_scroll_reference': {
      'event_label': {
        // GA4 학습 데이터: 소문자 + underscore 형식 (참고용)
        'MAIN': 'main',
        'PRODUCT_DETAIL': 'product_detail',
        'PRODUCT_LIST': 'product_list',
        'SEARCH_RESULT': 'search_result',
        'CART': 'cart',
        'MY': 'my',
        'EVENT_DETAIL': 'event_detail',
        'BRAND_MAIN': 'brand_main',
        'BRAND_PRODUCT_LIST': 'brand_product_list',
        'LIVE_DETAIL': 'live_detail',
        'LIVE_LIST': 'live_list',
        'CATEGORY_LIST': 'category_list',
        'MEMBERSHIP': 'membership',
        'EVENT_LIST': 'event_list',
        'BRAND_LIST': 'brand_list',
        'AMORESTORE': 'amorestore',
        'BEAUTYFEED': 'beautyfeed',
        'CUSTOMER': 'customer',
        'BRAND_EVENT_LIST': 'brand_event_list',
        'BRAND_CUSTOM_ETC': 'brand_custom_etc',
        'HISTORY': 'history',
      },
    },
    'begin_checkout': {
      // GA4 학습 데이터: 대부분 cartpage에서 발생
      // ⚠️ checkout_step, event_label은 URL_VARIABLE_PARAMS로 이동
      'checkout_seq': {
        'CART': '1',
        'ORDER': '2',
        '_default': '1',
      },
    },
    // ⚠️ qualified_visit.event_label: URL_VARIABLE_PARAMS로 이동 (10_second, 20_second... 변동)
    // ⚠️ custom_event.event_label: 동적 값 (좋아요, 등 다양한 액션)
    // ⚠️ live.event_label: URL_VARIABLE_PARAMS로 이동 (라이브 제목이 들어감)
    // ⚠️ view_promotion_detail.event_label: URL_VARIABLE_PARAMS로 이동 (프로모션 제목이 들어감)
  };

  // 페이지 컨텍스트에서 추출해야 하는 파라미터
  // ⚠️ 2025-12-28: URL_FIXED 파라미터는 동일 page_location에서 일관된 값
  //    → GA4 비교 시 동일 pageLocation 기준으로 비교 가능 (VERIFIABLE)
  // ⚠️ DYNAMIC은 동일 URL에서도 변동하는 값 (ap_click.event_label 등)
  private static PAGE_CONTEXT_PARAMS = new Set([
    // 프로모션/라이브 관련 - 사용자 선택에 따라 변동 (DYNAMIC)
    // ⚠️ 상품 파라미터(product_*)는 URL_FIXED로 이동 (동일 page_location에서 일관)
    // 프로모션 관련 - 실제 프로모션에 따라 변동
    'promotion_id', 'promotion_name', 'creative_name', 'creative_slot',
    // 검색 관련
    'search_term',
    // 라이브 관련
    'live_name', 'live_id',
    // 이벤트 관련
    'view_event_code', 'view_event_name',
    // ⚠️ event_label은 URL_VARIABLE_PARAMS에서 이벤트별로 관리
  ]);

  // URL에서 추출하는 파라미터
  // ⚠️ 아모레몰: onlineProdCode가 product_id의 최우선 소스
  private static URL_PARAM_MAPPING: Record<string, string> = {
    'product_id': 'onlineProdCode',      // 최우선: URL의 onlineProdCode
    'view_event_code': 'planDisplaySn',
    'search_term': 'keyword',
  };

  // 상수 파라미터 (사이트 전체에서 동일)
  private static CONSTANT_PARAMS: Record<string, string> = {
    'site_name': 'APMALL',
  };

  // 사용자 액션에 따라 달라지는 파라미터 (검증 제외 대상)
  private static USER_ACTION_PARAMS: Record<string, Set<string>> = {
    'ap_click': new Set(['event_label', 'event_action', 'link_text', 'link_url']),
    'select_item': new Set(['item_name', 'item_id', 'index']),
    'select_promotion': new Set(['promotion_name', 'creative_name', 'creative_slot']),
    'brand_product_click': new Set(['product_name', 'product_id']),
  };

  // URL-FIXED 파라미터: 동일 page_location에서 일관된 값 (VERIFIABLE)
  // GA4 API 분석 결과 (2025-12-28): pageLocation 기준 80% 이상의 URL에서 일관성 확인
  // pageLocation은 쿼리 파라미터를 포함하므로, 상품/이벤트/검색어별로 정확히 구분됨
  // ⚠️ GA4 비교 시 반드시 동일 pageLocation 기준으로 비교해야 함
  //    (GA4 전체 데이터와 비교하면 당연히 다른 상품들의 ID가 섞여서 불일치)
  private static URL_FIXED_PARAMS: Record<string, Set<string>> = {
    // view_item: 동일 page_location에서 상품 파라미터 일관 (URL_FIXED)
    // GA4 비교 시 동일 pageLocation 기준으로 비교 가능
    'view_item': new Set([
      'product_id', 'product_name', 'product_category', 'product_price', 'product_brand',
      'item_id', 'item_name', 'item_category', 'item_price', 'item_brand',
    ]),
    // add_to_cart: 동일 page_location에서 상품 파라미터 일관
    'add_to_cart': new Set([
      'product_id', 'product_name', 'product_category', 'product_price', 'product_brand',
      'item_id', 'item_name', 'item_category', 'item_price', 'item_brand',
    ]),
    // scroll: event_label은 dataLayer의 페이지 타입에 의존
    // ⚠️ URL 기반 페이지 타입과 dataLayer 페이지 타입이 다를 수 있음
    'scroll': new Set([]),  // CONTENT_GROUP 기반으로 처리
    // view_promotion: event_label 100% 일관
    'view_promotion': new Set(['event_label']),
    // view_promotion_detail: 동일 이벤트 페이지에서 일관
    // ⚠️ event_label은 프로모션 제목이므로 동적 (CRITICAL 이슈 수정)
    'view_promotion_detail': new Set(['view_event_code', 'view_event_name']),
    // view_search_results: 동일 검색어 URL에서 95% 일관
    'view_search_results': new Set(['search_term', 'event_label']),
    // live: 동일 라이브 URL에서 일관
    // ⚠️ live_name, event_label은 라이브 제목이므로 동적 (CRITICAL 이슈 수정)
    'live': new Set(['live_id']),
  };

  // URL-VARIABLE 파라미터: 동일 전체 URL(pageLocation)에서도 값이 변동
  // GA4 API 분석 결과 (2025-12-28): pageLocation 기준 80% 미만의 URL에서 일관성
  private static URL_VARIABLE_PARAMS: Record<string, Set<string>> = {
    // view_item: event_label만 변동 (product_*는 URL_FIXED - 동일 page_location에서 일관)
    'view_item': new Set(['event_label']),
    // add_to_cart: event_label만 변동 (product_*는 URL_FIXED)
    'add_to_cart': new Set(['event_label']),
    // begin_checkout: checkout_step, event_label (5% 일관) - cartpage vs prdbtn
    'begin_checkout': new Set(['checkout_step', 'event_label']),
    // scroll: event_action은 10%, 20%, 30%... 스크롤 깊이에 따라 변동
    // ⚠️ event_label은 dataLayer 페이지 타입 의존 (URL과 다를 수 있음)
    'scroll': new Set(['event_action', 'event_label']),
    // ap_click: 클릭 위치/대상에 따라 모든 파라미터 변동 (0-35% 일관)
    'ap_click': new Set(['event_category', 'event_label', 'event_action']),
    // qualified_visit: event_label (70% 일관) - 10_second, 20_second...
    'qualified_visit': new Set(['event_label']),
    // select_promotion: event_label (15% 일관) - 클릭한 프로모션별 변동
    'select_promotion': new Set(['event_label']),
    // view_promotion_detail: event_label은 프로모션 제목 (CRITICAL 이슈 수정)
    'view_promotion_detail': new Set(['event_label']),
    // live: event_label, live_name은 라이브 제목 (CRITICAL 이슈 수정)
    'live': new Set(['event_label', 'live_name']),
  };

  /**
   * 파라미터 값 유형을 정적으로 분류 (검증기에서 사용)
   * @returns
   *   - 'VERIFIABLE': GA4 집계 데이터와 비교 가능 (CONSTANT, EVENT_FIXED, URL_FIXED)
   *   - 'CONTENT_GROUP': 컨텐츠 그룹별로 비교해야 함
   *   - 'DYNAMIC': 동적 값으로 GA4 비교 제외 (존재 여부만 확인)
   *
   * GA4 URL별 분석 결과 (2025-12-28, pageLocation 기준) 기반:
   * - URL-FIXED: product_id, search_term, live_id 등 (동일 전체 URL에서 일관)
   * - URL-VARIABLE: scroll.event_action, ap_click 모든 파라미터 (동일 URL에서도 변동)
   */
  static classifyParameterType(
    eventName: string,
    parameterName: string
  ): 'VERIFIABLE' | 'CONTENT_GROUP' | 'DYNAMIC' {
    // 1. URL-VARIABLE 파라미터 - 최우선 체크 (GA4 API 분석 결과)
    // 동일 전체 URL(pageLocation)에서도 값이 변동하므로 GA4 비교 불가
    const urlVariableParams = this.URL_VARIABLE_PARAMS[eventName];
    if (urlVariableParams && urlVariableParams.has(parameterName)) {
      return 'DYNAMIC';
    }

    // 2. 상수 파라미터 - 항상 비교 가능
    if (this.CONSTANT_PARAMS[parameterName]) {
      return 'VERIFIABLE';
    }

    // 3. 이벤트 고정 파라미터 - 비교 가능
    // URL 분석 결과: event_category는 대부분 이벤트에서 URL과 무관하게 고정
    const eventFixed = this.EVENT_FIXED_PARAMS[eventName];
    if (eventFixed && eventFixed[parameterName]) {
      return 'VERIFIABLE';
    }

    // 4. URL-FIXED 파라미터 - 동일 전체 URL에서 일관된 값
    // pageLocation 기준 80% 이상 일관 → GA4 비교 가능 (URL 기준)
    const urlFixedParams = this.URL_FIXED_PARAMS[eventName];
    if (urlFixedParams && urlFixedParams.has(parameterName)) {
      return 'VERIFIABLE';  // 동일 URL에서는 비교 가능
    }

    // 5. 사용자 액션 파라미터 - 동적 (비교 제외)
    const userActionParams = this.USER_ACTION_PARAMS[eventName];
    if (userActionParams && userActionParams.has(parameterName)) {
      return 'DYNAMIC';
    }

    // 6. 컨텐츠 그룹 기반 파라미터
    // scroll.event_label 등은 CONTENT_GROUP으로 비교 가능
    // 단, URL_FIXED에 이미 포함된 경우는 위에서 처리됨
    const cgBased = this.CONTENT_GROUP_BASED_PARAMS[eventName];
    if (cgBased && cgBased[parameterName]) {
      return 'CONTENT_GROUP';
    }

    // 7. 페이지 컨텍스트 파라미터 - 동적
    if (this.PAGE_CONTEXT_PARAMS.has(parameterName)) {
      return 'DYNAMIC';
    }

    // 8. 기본값 - 동적으로 간주
    // 이유: 명시적으로 분류되지 않은 파라미터는 GA4 비교가 불가능합니다.
    return 'DYNAMIC';
  }

  /**
   * 이벤트의 모든 파라미터 유형 분류
   */
  static classifyEventParameters(
    eventName: string,
    parameterNames: string[]
  ): Map<string, 'VERIFIABLE' | 'CONTENT_GROUP' | 'DYNAMIC'> {
    const result = new Map<string, 'VERIFIABLE' | 'CONTENT_GROUP' | 'DYNAMIC'>();
    for (const paramName of parameterNames) {
      result.set(paramName, this.classifyParameterType(eventName, paramName));
    }
    return result;
  }

  constructor(propertyId: string) {
    this.propertyId = propertyId;
    this.loadSiteData();
    this.buildRules();
  }

  /**
   * 사이트 학습 데이터 로드
   */
  private loadSiteData(): void {
    const sitePath = path.join(
      process.cwd(),
      'config',
      'learning',
      `site_${this.propertyId}.json`
    );

    if (fs.existsSync(sitePath)) {
      this.siteData = JSON.parse(fs.readFileSync(sitePath, 'utf-8'));
      console.log(`   📚 사이트 학습 데이터 로드됨: ${this.propertyId}`);
    }
  }

  /**
   * 예측 규칙 빌드
   */
  private buildRules(): void {
    if (!this.siteData?.eventParameterPatterns) return;

    for (const [eventName, patterns] of Object.entries(this.siteData.eventParameterPatterns)) {
      for (const pattern of patterns) {
        const key = `${eventName}:${pattern.parameterName}`;
        const valueType = this.determineValueType(eventName, pattern.parameterName, pattern);

        this.rules.set(key, {
          parameterName: pattern.parameterName,
          eventName,
          valueType,
          fixedValue: valueType === 'CONSTANT' || valueType === 'EVENT_FIXED'
            ? pattern.valuePattern
            : undefined,
          sampleValues: pattern.sampleValues,
          confidence: this.calculateConfidence(valueType, pattern),
        });
      }
    }

    console.log(`   📐 파라미터 예측 규칙 ${this.rules.size}개 생성됨`);
  }

  /**
   * 파라미터 값 유형 결정
   */
  private determineValueType(
    eventName: string,
    paramName: string,
    pattern: { valuePattern: string; sampleValues: string[] }
  ): ParameterValueType {
    // 1. 상수 파라미터 체크
    if (ParameterValuePredictor.CONSTANT_PARAMS[paramName]) {
      return 'CONSTANT';
    }

    // 2. 이벤트 고정 파라미터 체크
    const eventFixed = ParameterValuePredictor.EVENT_FIXED_PARAMS[eventName];
    if (eventFixed && eventFixed[paramName]) {
      return 'EVENT_FIXED';
    }

    // 3. 컨텐츠 그룹 기반 파라미터 체크
    const cgBased = ParameterValuePredictor.CONTENT_GROUP_BASED_PARAMS[eventName];
    if (cgBased && cgBased[paramName]) {
      return 'CONTENT_GROUP';
    }

    // 4. URL 파라미터 체크
    if (ParameterValuePredictor.URL_PARAM_MAPPING[paramName]) {
      return 'URL_PARAM';
    }

    // 5. 페이지 컨텍스트 파라미터 체크
    if (ParameterValuePredictor.PAGE_CONTEXT_PARAMS.has(paramName)) {
      return 'PAGE_CONTEXT';
    }

    // 6. 샘플 값 분석으로 유형 추론
    if (pattern.sampleValues.length > 0) {
      const uniqueValues = new Set(pattern.sampleValues);

      // 하나의 값만 있으면 고정값으로 간주
      if (uniqueValues.size === 1) {
        return 'EVENT_FIXED';
      }
    }

    return 'UNKNOWN';
  }

  /**
   * 신뢰도 계산
   */
  private calculateConfidence(
    valueType: ParameterValueType,
    pattern: { sampleValues: string[] }
  ): number {
    switch (valueType) {
      case 'CONSTANT':
        return 1.0;
      case 'EVENT_FIXED':
        return 0.95;
      case 'CONTENT_GROUP':
        return 0.9;
      case 'URL_PARAM':
        return 0.85;
      case 'PAGE_CONTEXT':
        return 0.7;
      case 'USER_ACTION':
        return 0.5;
      default:
        return 0.3;
    }
  }

  /**
   * 이벤트 파라미터 값 예측
   */
  predictParameterValues(
    eventName: string,
    contentGroup: ContentGroup,
    pageUrl: string,
    pageContext?: {
      productId?: string;
      productName?: string;
      promotionName?: string;
      searchTerm?: string;
      liveTitle?: string;
      actualPageType?: string;  // dataLayer에서 추출한 실제 페이지 타입
    }
  ): PredictedParameter[] {
    const predictions: PredictedParameter[] = [];

    // 1. 상수 파라미터
    for (const [paramName, value] of Object.entries(ParameterValuePredictor.CONSTANT_PARAMS)) {
      predictions.push({
        name: paramName,
        value,
        source: 'CONSTANT',
        confidence: 'high',
        extractionReason: '사이트 전역 상수값',
      });
    }

    // 2. 이벤트 고정 파라미터
    const eventFixed = ParameterValuePredictor.EVENT_FIXED_PARAMS[eventName];
    if (eventFixed) {
      for (const [paramName, value] of Object.entries(eventFixed)) {
        predictions.push({
          name: paramName,
          value,
          source: 'CONSTANT',
          confidence: 'high',
          extractionReason: `${eventName} 이벤트 고정값`,
        });
      }
    }

    // 3. 컨텐츠 그룹 기반 파라미터
    // actualPageType이 있으면 그것을 우선 사용 (SPA 페이지 전환 문제 해결)
    const effectiveContentGroup = pageContext?.actualPageType || contentGroup;
    const cgBased = ParameterValuePredictor.CONTENT_GROUP_BASED_PARAMS[eventName];
    if (cgBased) {
      for (const [paramName, cgValues] of Object.entries(cgBased)) {
        const value = cgValues[effectiveContentGroup] || cgValues[contentGroup] || cgValues['_default'];
        if (value) {
          predictions.push({
            name: paramName,
            value,
            source: 'COMPUTED',
            confidence: 'high',
            extractionReason: pageContext?.actualPageType
              ? `실제 페이지 타입 ${effectiveContentGroup} 기반 (dataLayer)`
              : `컨텐츠 그룹 ${contentGroup} 기반`,
          });
        }
      }
    }

    // 4. URL에서 추출
    for (const [paramName, urlParam] of Object.entries(ParameterValuePredictor.URL_PARAM_MAPPING)) {
      const url = new URL(pageUrl);
      const value = url.searchParams.get(urlParam);
      if (value) {
        predictions.push({
          name: paramName,
          value,
          source: 'URL',
          confidence: 'high',
          extractionReason: `URL 파라미터 ${urlParam}에서 추출`,
        });
      }
    }

    // 5. 페이지 컨텍스트에서 추출
    if (pageContext) {
      if (pageContext.productId) {
        predictions.push({
          name: 'product_id',
          value: pageContext.productId,
          source: 'DATALAYER',
          confidence: 'high',
          extractionReason: '페이지 컨텍스트에서 추출',
        });
      }
      if (pageContext.productName) {
        predictions.push({
          name: 'product_name',
          value: pageContext.productName,
          source: 'DATALAYER',
          confidence: 'high',
          extractionReason: '페이지 컨텍스트에서 추출',
        });
      }
      if (pageContext.promotionName) {
        predictions.push({
          name: 'promotion_name',
          value: pageContext.promotionName,
          source: 'DATALAYER',
          confidence: 'medium',
          extractionReason: '페이지 컨텍스트에서 추출',
        });
        // view_promotion_detail 이벤트의 event_label에도 프로모션명 사용
        if (eventName === 'view_promotion_detail') {
          predictions.push({
            name: 'event_label',
            value: pageContext.promotionName,
            source: 'DATALAYER',
            confidence: 'high',
            extractionReason: '프로모션 상세 페이지 제목',
          });
        }
      }
      if (pageContext.searchTerm) {
        predictions.push({
          name: 'search_term',
          value: pageContext.searchTerm,
          source: 'URL',
          confidence: 'high',
          extractionReason: '검색어에서 추출',
        });
      }
      // 라이브 제목 (live 이벤트의 event_label)
      if (pageContext.liveTitle && eventName === 'live') {
        predictions.push({
          name: 'event_label',
          value: pageContext.liveTitle,
          source: 'DATALAYER',
          confidence: 'high',
          extractionReason: '라이브 상세 페이지 제목',
        });
      }
    }

    // 6. 학습된 규칙에서 추가 예측
    for (const [key, rule] of this.rules.entries()) {
      if (!key.startsWith(`${eventName}:`)) continue;

      // 이미 예측된 파라미터는 스킵
      if (predictions.some(p => p.name === rule.parameterName)) continue;

      // 고정값이 있는 경우 (학습된 패턴 사용)
      if (rule.fixedValue) {
        // PAGE_CONTEXT, USER_ACTION 유형은 동적이므로 스킵
        if (rule.valueType === 'PAGE_CONTEXT' || rule.valueType === 'USER_ACTION') {
          continue;
        }

        predictions.push({
          name: rule.parameterName,
          value: rule.fixedValue,
          source: 'CONSTANT',
          confidence: rule.confidence >= 0.9 ? 'high' : rule.confidence >= 0.7 ? 'medium' : 'low',
          extractionReason: `GA4 학습 패턴: ${rule.valueType}`,
        });
      } else if (rule.sampleValues && rule.sampleValues.length > 0) {
        // 샘플 값이 있으면 가장 빈번한 값 사용
        predictions.push({
          name: rule.parameterName,
          value: rule.sampleValues[0],
          source: 'COMPUTED',
          confidence: 'medium',
          extractionReason: `GA4 샘플 데이터 기반 (${rule.sampleValues.length}개 샘플)`,
        });
      }
    }

    return predictions;
  }

  /**
   * 예측 결과를 기존 파라미터에 병합
   */
  enhanceParameters(
    existingParams: PredictedParameter[],
    eventName: string,
    contentGroup: ContentGroup,
    pageUrl: string,
    pageContext?: {
      productId?: string;
      productName?: string;
      promotionName?: string;
      searchTerm?: string;
      liveTitle?: string;
      actualPageType?: string;
    }
  ): PredictedParameter[] {
    const predictions = this.predictParameterValues(eventName, contentGroup, pageUrl, pageContext);
    const enhanced = [...existingParams];

    for (const prediction of predictions) {
      const existingIndex = enhanced.findIndex(p => p.name === prediction.name);

      if (existingIndex >= 0) {
        const existing = enhanced[existingIndex];
        // 기존 값이 null이거나 신뢰도가 낮으면 예측값으로 대체
        if (existing.value === null || existing.confidence === 'low') {
          enhanced[existingIndex] = prediction;
        }
      } else {
        enhanced.push(prediction);
      }
    }

    return enhanced;
  }

  /**
   * 파라미터 값 유형 조회
   */
  getParameterValueType(eventName: string, paramName: string): ParameterValueType {
    const key = `${eventName}:${paramName}`;
    const rule = this.rules.get(key);
    return rule?.valueType || 'UNKNOWN';
  }

  /**
   * 학습된 규칙 통계
   */
  getStats(): {
    totalRules: number;
    byType: Record<ParameterValueType, number>;
  } {
    const byType: Record<ParameterValueType, number> = {
      'CONSTANT': 0,
      'EVENT_FIXED': 0,
      'CONTENT_GROUP': 0,
      'PAGE_CONTEXT': 0,
      'URL_PARAM': 0,
      'USER_ACTION': 0,
      'UNKNOWN': 0,
    };

    for (const rule of this.rules.values()) {
      byType[rule.valueType]++;
    }

    return {
      totalRules: this.rules.size,
      byType,
    };
  }
}

/**
 * 기본 ParameterValuePredictor 생성
 */
export function createParameterValuePredictor(): ParameterValuePredictor | null {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) {
    console.error('❌ GA4_PROPERTY_ID 환경변수가 설정되지 않았습니다.');
    return null;
  }
  return new ParameterValuePredictor(propertyId);
}
