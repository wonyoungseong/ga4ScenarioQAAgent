/**
 * 파라미터 값 검증 시스템
 *
 * Vision AI가 예측한 파라미터 값과 dataLayer에서 캡처한 실제 값을 비교하여
 * 정확도를 측정하고 불일치 패턴을 분석합니다.
 */

import {
  ParameterValuePrediction,
  PredictedParameterValue,
  DataLayerEvent,
  DataLayerItem,
  ParameterValidationResult,
  ItemValidationResult,
  ValidationReport,
  MatchType,
  MismatchPattern,
  GuideFeedback,
  FunnelTrackedItem,
  FunnelConsistencyResult,
  FunnelValidationReport,
  ECOMMERCE_FUNNEL_ORDER,
} from '../types/parameterPrediction';

// ═══════════════════════════════════════════════════════════════════════════
// 정규화 규칙
// ═══════════════════════════════════════════════════════════════════════════

interface NormalizationRule {
  /** 규칙 이름 */
  name: string;
  /** 적용 대상 파라미터 패턴 */
  parameterPattern: RegExp;
  /** 정규화 함수 */
  normalize: (value: unknown) => string;
}

const NORMALIZATION_RULES: NormalizationRule[] = [
  {
    name: '가격/금액 정규화',
    parameterPattern: /^(price|value|discount|shipping)$/i,
    normalize: (value) => {
      if (typeof value === 'number') {
        return String(Math.round(value * 100) / 100); // 소수점 2자리
      }
      if (typeof value === 'string') {
        // 숫자만 추출
        const num = parseFloat(value.replace(/[^\d.-]/g, ''));
        return isNaN(num) ? '' : String(Math.round(num * 100) / 100);
      }
      return '';
    }
  },
  {
    name: '수량 정규화',
    parameterPattern: /^(quantity|index)$/i,
    normalize: (value) => {
      if (typeof value === 'number') {
        return String(Math.floor(value));
      }
      if (typeof value === 'string') {
        const num = parseInt(value, 10);
        return isNaN(num) ? '' : String(num);
      }
      return '';
    }
  },
  {
    name: '상품명 정규화',
    parameterPattern: /^(item_name|product_name|name)$/i,
    normalize: (value) => {
      if (typeof value !== 'string') return String(value ?? '');
      let normalized = value
        .trim()
        // 사이트명 suffix 제거 (| 아모레몰, | Amoremall 등)
        .replace(/\s*\|\s*(아모레몰|아모레퍼시픽|Amore\s*Mall|AMOREPACIFIC).*$/i, '')
        // 브랜드명 prefix 제거 (첫 번째 대괄호만, 짧은 브랜드명: 설화수, 라네즈, 헤라 등)
        // ONLY, SET, 기획 등이 포함되지 않은 순수 브랜드명만 제거
        .replace(/^\[([가-힣A-Za-z]{2,10})\](?!\s*$)/, '')
        // 용량 suffix 정규화 (75ml, 50g 등 제거)
        .replace(/\s+\d+\s*(ml|g|oz|L|kg)$/i, '')
        .trim()
        .replace(/\s+/g, ' ')         // 연속 공백 단일화
        .replace(/\.{3,}/g, '...')    // 말줄임 정규화
        .toLowerCase();               // 대소문자 무시
      return normalized;
    }
  },
  {
    name: 'ID 정규화',
    parameterPattern: /^(item_id|product_id|promotion_id|coupon)$/i,
    normalize: (value) => {
      if (typeof value !== 'string') return String(value ?? '');
      return value.trim().toUpperCase();
    }
  },
  {
    name: '브랜드명 정규화',
    parameterPattern: /^(item_brand|brand)$/i,
    normalize: (value) => {
      if (typeof value !== 'string') return String(value ?? '');
      return value.trim().toLowerCase();
    }
  },
  {
    name: '통화 정규화',
    parameterPattern: /^currency$/i,
    normalize: (value) => {
      if (typeof value !== 'string') return String(value ?? '');
      return value.trim().toUpperCase();
    }
  },
  {
    name: '기본 문자열 정규화',
    parameterPattern: /.*/,
    normalize: (value) => {
      if (value === null || value === undefined) return '';
      if (typeof value === 'string') return value.trim();
      return String(value);
    }
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// 파라미터 검증기
// ═══════════════════════════════════════════════════════════════════════════

export class ParameterValidator {
  /**
   * Vision AI 예측값과 dataLayer 실제값을 비교합니다.
   */
  validate(
    predicted: ParameterValuePrediction,
    actual: DataLayerEvent
  ): ValidationReport {
    const eventParamsValidation: ParameterValidationResult[] = [];
    const itemsValidation: ItemValidationResult[] = [];

    // Event-level 파라미터 검증
    for (const [key, pred] of Object.entries(predicted.eventParams)) {
      if (pred === undefined) continue;

      const actualValue = this.extractActualValue(actual, key);
      eventParamsValidation.push(
        this.compareValues(key, pred, actualValue)
      );
    }

    // Item-level 파라미터 검증
    if (predicted.items && predicted.items.length > 0) {
      const actualItems = actual.ecommerce?.items || [];

      predicted.items.forEach((predItem, index) => {
        const actualItem = actualItems[index];
        const itemResult = this.validateItem(predItem, actualItem, index);
        itemsValidation.push(itemResult);
      });
    }

    // 전체 정확도 계산
    const allValidations = [
      ...eventParamsValidation,
      ...itemsValidation.flatMap(iv => iv.parameters)
    ];

    const totalParams = allValidations.length;
    const matchedParams = allValidations.filter(v => v.match).length;
    const accuracyPercent = totalParams > 0 ? (matchedParams / totalParams) * 100 : 100;

    const mismatches = allValidations
      .filter(v => !v.match)
      .map(v => ({
        param: v.parameterName,
        predicted: v.predicted,
        actual: v.actual,
        reason: v.matchType === 'PARTIAL' ? '부분 일치' : '불일치'
      }));

    return {
      eventName: predicted.eventName,
      url: '',  // 호출자가 설정
      timestamp: new Date().toISOString(),
      eventParamsValidation,
      itemsValidation,
      accuracy: {
        totalParams,
        matchedParams,
        accuracyPercent: Math.round(accuracyPercent * 10) / 10,
        mismatches
      }
    };
  }

  /**
   * 단일 아이템의 파라미터를 검증합니다.
   */
  private validateItem(
    predicted: Record<string, PredictedParameterValue | undefined>,
    actual: DataLayerItem | undefined,
    index: number
  ): ItemValidationResult {
    const parameters: ParameterValidationResult[] = [];

    for (const [key, pred] of Object.entries(predicted)) {
      if (pred === undefined) continue;

      const actualValue = actual ? (actual as Record<string, unknown>)[key] : undefined;
      parameters.push(this.compareValues(key, pred, actualValue));
    }

    const matchedCount = parameters.filter(p => p.match).length;
    const matchRate = parameters.length > 0 ? (matchedCount / parameters.length) * 100 : 100;

    return {
      itemIndex: index,
      parameters,
      matchRate: Math.round(matchRate * 10) / 10
    };
  }

  /** 퍼널 일관성 추적 대상 파라미터 (정확도 계산 제외) */
  private static FUNNEL_TRACKED_PARAMS = ['item_name', 'product_name', 'name'];

  /**
   * 두 값을 비교합니다.
   */
  private compareValues(
    parameterName: string,
    predicted: PredictedParameterValue,
    actual: unknown
  ): ParameterValidationResult {
    const predictedValue = predicted.value;
    const actualValue = actual;

    // item_name은 퍼널 일관성 추적 대상 - 정확도 계산에서 제외
    // (브랜드, 사이트명 prefix/suffix 등 포맷이 다를 수 있으므로 퍼널 간 일관성이 핵심)
    if (ParameterValidator.FUNNEL_TRACKED_PARAMS.some(p =>
        parameterName.toLowerCase().includes(p.toLowerCase()))) {
      return {
        parameterName,
        predicted: predictedValue,
        actual: actualValue as string | number | boolean | null,
        match: true,  // 퍼널 추적 대상은 항상 match로 처리 (정확도 계산용)
        matchType: 'FUNNEL_TRACKED',
        normalizationApplied: '퍼널 일관성 추적 (포맷 차이 무시)',
        confidence: predicted.confidence
      };
    }

    // 정확히 일치하는 경우
    if (predictedValue === actualValue) {
      return {
        parameterName,
        predicted: predictedValue,
        actual: actualValue as string | number | boolean | null,
        match: true,
        matchType: 'EXACT',
        confidence: predicted.confidence
      };
    }

    // 정규화 후 비교
    const rule = this.findNormalizationRule(parameterName);
    const normalizedPredicted = rule.normalize(predictedValue);
    const normalizedActual = rule.normalize(actualValue);

    if (normalizedPredicted === normalizedActual) {
      return {
        parameterName,
        predicted: predictedValue,
        actual: actualValue as string | number | boolean | null,
        match: true,
        matchType: 'NORMALIZED',
        normalizationApplied: rule.name,
        confidence: predicted.confidence
      };
    }

    // 부분 일치 확인 (문자열인 경우)
    if (typeof normalizedPredicted === 'string' && typeof normalizedActual === 'string') {
      if (normalizedPredicted.includes(normalizedActual) ||
          normalizedActual.includes(normalizedPredicted)) {
        return {
          parameterName,
          predicted: predictedValue,
          actual: actualValue as string | number | boolean | null,
          match: false,  // 부분 일치는 불일치로 처리
          matchType: 'PARTIAL',
          normalizationApplied: rule.name,
          confidence: predicted.confidence
        };
      }
    }

    // 불일치
    return {
      parameterName,
      predicted: predictedValue,
      actual: actualValue as string | number | boolean | null,
      match: false,
      matchType: 'MISMATCH',
      confidence: predicted.confidence
    };
  }

  /**
   * 파라미터에 맞는 정규화 규칙을 찾습니다.
   */
  private findNormalizationRule(parameterName: string): NormalizationRule {
    for (const rule of NORMALIZATION_RULES) {
      if (rule.parameterPattern.test(parameterName)) {
        return rule;
      }
    }
    // 마지막 규칙 (기본 문자열 정규화)을 반환
    return NORMALIZATION_RULES[NORMALIZATION_RULES.length - 1];
  }

  /**
   * dataLayer 이벤트에서 파라미터 값을 추출합니다.
   */
  private extractActualValue(event: DataLayerEvent, parameterName: string): unknown {
    // 최상위 레벨
    if (parameterName in event.data) {
      return event.data[parameterName];
    }

    // ecommerce 레벨
    if (event.ecommerce) {
      const ecom = event.ecommerce as Record<string, unknown>;
      if (parameterName in ecom) {
        return ecom[parameterName];
      }
    }

    return undefined;
  }

  /**
   * 검증 결과를 콘솔에 출력합니다.
   */
  printValidationReport(report: ValidationReport): void {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`📊 Parameter Validation Report: ${report.eventName}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Event-level 파라미터
    if (report.eventParamsValidation.length > 0) {
      console.log('📌 Event Parameters:');
      console.log('┌────────────────────┬────────────────────┬────────────────────┬────────┐');
      console.log('│ Parameter          │ Predicted          │ Actual             │ Match  │');
      console.log('├────────────────────┼────────────────────┼────────────────────┼────────┤');

      for (const v of report.eventParamsValidation) {
        const param = String(v.parameterName).padEnd(18);
        const pred = String(v.predicted ?? '(null)').substring(0, 18).padEnd(18);
        const actual = String(v.actual ?? '(null)').substring(0, 18).padEnd(18);
        const match = v.matchType === 'FUNNEL_TRACKED' ? '🔄' : (v.match ? '✅' : '❌');
        console.log(`│ ${param} │ ${pred} │ ${actual} │   ${match}   │`);
      }
      console.log('└────────────────────┴────────────────────┴────────────────────┴────────┘\n');
    }

    // Item-level 파라미터
    if (report.itemsValidation.length > 0) {
      console.log('📦 Item Parameters:');

      for (const item of report.itemsValidation) {
        console.log(`\n  Item[${item.itemIndex}] - Match Rate: ${item.matchRate}%`);
        console.log('  ┌────────────────────┬────────────────────┬────────────────────┬────────┐');
        console.log('  │ Parameter          │ Predicted          │ Actual             │ Match  │');
        console.log('  ├────────────────────┼────────────────────┼────────────────────┼────────┤');

        for (const v of item.parameters) {
          const param = String(v.parameterName).padEnd(18);
          const pred = String(v.predicted ?? '(null)').substring(0, 18).padEnd(18);
          const actual = String(v.actual ?? '(null)').substring(0, 18).padEnd(18);
          const match = v.matchType === 'FUNNEL_TRACKED' ? '🔄' : (v.match ? '✅' : '❌');
          console.log(`  │ ${param} │ ${pred} │ ${actual} │   ${match}   │`);
        }
        console.log('  └────────────────────┴────────────────────┴────────────────────┴────────┘');
      }
    }

    // 범례
    console.log('\n📋 범례: ✅ 일치 | ❌ 불일치 | 🔄 퍼널 추적 (포맷 차이 무시, 퍼널 간 일관성 체크)');

    // 전체 정확도
    console.log(`\n📈 Overall Accuracy: ${report.accuracy.accuracyPercent}%`);
    console.log(`   (${report.accuracy.matchedParams}/${report.accuracy.totalParams} parameters matched)`);

    if (report.accuracy.mismatches.length > 0) {
      console.log('\n⚠️ Mismatches:');
      for (const m of report.accuracy.mismatches) {
        console.log(`   - ${m.param}: predicted "${m.predicted}" but got "${m.actual}"`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 피드백 분석기
// ═══════════════════════════════════════════════════════════════════════════

export class FeedbackAnalyzer {
  private mismatchHistory: Array<{
    eventName: string;
    page: string;
    param: string;
    predicted: unknown;
    actual: unknown;
  }> = [];

  /**
   * 검증 결과를 분석하여 가이드 개선 제안을 생성합니다.
   */
  addValidationResult(report: ValidationReport, pageUrl: string): void {
    for (const mismatch of report.accuracy.mismatches) {
      this.mismatchHistory.push({
        eventName: report.eventName,
        page: pageUrl,
        param: mismatch.param,
        predicted: mismatch.predicted,
        actual: mismatch.actual
      });
    }
  }

  /**
   * 불일치 패턴을 분석합니다.
   */
  analyzePatterns(): MismatchPattern[] {
    const patterns = new Map<string, MismatchPattern>();

    for (const m of this.mismatchHistory) {
      const patternKey = this.identifyPattern(m.param, m.predicted, m.actual);

      if (!patterns.has(patternKey)) {
        patterns.set(patternKey, {
          pattern: patternKey,
          occurrences: 0,
          examples: [],
          suggestedFix: this.suggestFix(patternKey)
        });
      }

      const pattern = patterns.get(patternKey)!;
      pattern.occurrences++;
      if (pattern.examples.length < 3) {
        pattern.examples.push({
          predicted: m.predicted,
          actual: m.actual,
          event: m.eventName,
          page: m.page
        });
      }
    }

    return Array.from(patterns.values())
      .sort((a, b) => b.occurrences - a.occurrences);
  }

  /**
   * 불일치 패턴을 식별합니다.
   */
  private identifyPattern(param: string, predicted: unknown, actual: unknown): string {
    // 브랜드명 영문/한글 차이
    if (param.includes('brand')) {
      if (this.isKorean(String(predicted)) !== this.isKorean(String(actual))) {
        return 'BRAND_LANGUAGE_MISMATCH';
      }
    }

    // 가격 형식 차이
    if (param.includes('price') || param === 'value') {
      const predNum = Number(predicted);
      const actualNum = Number(actual);
      if (!isNaN(predNum) && !isNaN(actualNum)) {
        if (Math.abs(predNum - actualNum) < 1) {
          return 'PRICE_DECIMAL_MISMATCH';
        }
      }
    }

    // 상품명 말줄임
    if (param.includes('name')) {
      const predStr = String(predicted);
      const actualStr = String(actual);
      if (predStr.includes('...') || actualStr.includes('...')) {
        return 'NAME_TRUNCATION_MISMATCH';
      }
    }

    // ID 형식 차이
    if (param.includes('id')) {
      return 'ID_FORMAT_MISMATCH';
    }

    // 기본 불일치
    return 'GENERAL_MISMATCH';
  }

  /**
   * 패턴별 가이드 개선 제안을 생성합니다.
   */
  private suggestFix(pattern: string): string {
    const suggestions: Record<string, string> = {
      'BRAND_LANGUAGE_MISMATCH': '브랜드명 추출 시 dataLayer에서 사용하는 언어(영문/한글)를 확인하여 해당 언어로 추출하도록 가이드 수정',
      'PRICE_DECIMAL_MISMATCH': '가격 추출 시 소수점 처리 규칙 명시 (정수로 반환 또는 소수점 N자리)',
      'NAME_TRUNCATION_MISMATCH': '상품명 추출 시 말줄임 처리 규칙 명시 (전체 텍스트 추출 또는 표시된 그대로)',
      'ID_FORMAT_MISMATCH': 'ID 추출 위치 명시 (URL 파라미터, data 속성, 또는 페이지 내 텍스트)',
      'GENERAL_MISMATCH': '해당 파라미터의 추출 규칙을 더 구체적으로 명시'
    };

    return suggestions[pattern] || suggestions['GENERAL_MISMATCH'];
  }

  /**
   * 문자열이 한글을 포함하는지 확인합니다.
   */
  private isKorean(str: string): boolean {
    return /[가-힣]/.test(str);
  }

  /**
   * 특정 이벤트에 대한 가이드 피드백을 생성합니다.
   */
  generateFeedback(eventName: string): GuideFeedback {
    const eventMismatches = this.mismatchHistory.filter(
      m => m.eventName === eventName
    );

    const totalForEvent = eventMismatches.length;
    const patterns = this.analyzePatterns().filter(
      p => p.examples.some(e => e.event === eventName)
    );

    // 정확도는 별도로 계산해야 함 (여기서는 간단히 처리)
    const currentAccuracy = totalForEvent === 0 ? 100 : 0; // 실제로는 ValidationReport에서 가져와야 함

    const suggestedPromptUpdates: string[] = [];
    for (const pattern of patterns) {
      suggestedPromptUpdates.push(pattern.suggestedFix);
    }

    return {
      eventName,
      currentAccuracy,
      mismatchPatterns: patterns,
      suggestedPromptUpdates: [...new Set(suggestedPromptUpdates)] // 중복 제거
    };
  }

  /**
   * 피드백을 콘솔에 출력합니다.
   */
  printFeedback(feedback: GuideFeedback): void {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`📝 Guide Feedback: ${feedback.eventName}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log(`📈 Current Accuracy: ${feedback.currentAccuracy}%\n`);

    if (feedback.mismatchPatterns.length > 0) {
      console.log('🔍 Detected Patterns:');
      for (const pattern of feedback.mismatchPatterns) {
        console.log(`\n  [${pattern.pattern}] (${pattern.occurrences}회 발생)`);
        console.log(`    제안: ${pattern.suggestedFix}`);
        if (pattern.examples.length > 0) {
          console.log('    예시:');
          for (const ex of pattern.examples) {
            console.log(`      - predicted: "${ex.predicted}" → actual: "${ex.actual}"`);
          }
        }
      }
    }

    if (feedback.suggestedPromptUpdates.length > 0) {
      console.log('\n✏️ Suggested Prompt Updates:');
      feedback.suggestedPromptUpdates.forEach((update, i) => {
        console.log(`  ${i + 1}. ${update}`);
      });
    }
  }

  /**
   * 기록을 초기화합니다.
   */
  clear(): void {
    this.mismatchHistory = [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 퍼널 일관성 검증기
// ═══════════════════════════════════════════════════════════════════════════

/** 퍼널에서 추적되는 전체 아이템 파라미터 */
interface FunnelItemSnapshot {
  event: string;
  timestamp: number;
  funnelOrder: number;
  params: Record<string, unknown>;
}

/** 확장된 퍼널 추적 아이템 */
interface ExtendedFunnelTrackedItem {
  identifier: string;
  snapshots: FunnelItemSnapshot[];
}

export class FunnelConsistencyValidator {
  private trackedItems: Map<string, FunnelTrackedItem> = new Map();
  private extendedTrackedItems: Map<string, ExtendedFunnelTrackedItem> = new Map();
  private trackedEvents: string[] = [];

  /** 비교할 item 파라미터 목록 */
  private static ITEM_PARAMS_TO_COMPARE = [
    'item_id',
    'item_name',
    'item_brand',
    'item_category',
    'item_category2',
    'item_category3',
    'item_category4',
    'item_category5',
    'price',
    'quantity',
    'discount',
    'coupon',
    'item_variant',
    'item_list_id',
    'item_list_name',
    'index',
    'affiliation',
    'location_id',
  ];

  /**
   * dataLayer 이벤트를 추가하여 아이템을 추적합니다.
   * 퍼널 순서대로 아이템의 모든 파라미터를 추적합니다.
   */
  addEvent(event: DataLayerEvent): void {
    const eventName = event.event;
    if (!eventName) return;

    // 퍼널 순서 확인
    const funnelOrder = ECOMMERCE_FUNNEL_ORDER.indexOf(eventName as any);

    // 이벤트 기록
    if (!this.trackedEvents.includes(eventName)) {
      this.trackedEvents.push(eventName);
    }

    // ecommerce items 추적
    const items = event.ecommerce?.items || event.data.items as DataLayerItem[] || [];
    const timestamp = event.timestamp;

    for (const item of items) {
      // 아이템 식별자 생성 (item_id 우선, 없으면 item_name 사용)
      const identifier = item.item_id || item.item_name || 'unknown';

      // 기존 방식 (하위 호환성)
      if (!this.trackedItems.has(identifier)) {
        this.trackedItems.set(identifier, {
          identifier,
          item_id: item.item_id,
          namesByEvent: [],
          pricesByEvent: [],
        });
      }

      const tracked = this.trackedItems.get(identifier)!;

      if (item.item_name) {
        tracked.namesByEvent.push({
          event: eventName,
          item_name: item.item_name,
          timestamp,
        });
      }

      if (item.price !== undefined) {
        tracked.pricesByEvent.push({
          event: eventName,
          price: item.price,
          timestamp,
        });
      }

      // 확장된 추적 (모든 파라미터)
      if (!this.extendedTrackedItems.has(identifier)) {
        this.extendedTrackedItems.set(identifier, {
          identifier,
          snapshots: [],
        });
      }

      const extendedTracked = this.extendedTrackedItems.get(identifier)!;

      // 모든 파라미터 스냅샷 저장
      const params: Record<string, unknown> = {};
      for (const key of FunnelConsistencyValidator.ITEM_PARAMS_TO_COMPARE) {
        if (item[key] !== undefined) {
          params[key] = item[key];
        }
      }

      extendedTracked.snapshots.push({
        event: eventName,
        timestamp,
        funnelOrder: funnelOrder >= 0 ? funnelOrder : 999,
        params,
      });
    }
  }

  /**
   * 퍼널 순서대로 모든 item 파라미터의 일관성을 검증합니다.
   * 각 아이템이 퍼널을 따라 이동할 때 파라미터가 동일하게 유지되는지 확인합니다.
   */
  validateAllParams(): {
    items: Array<{
      identifier: string;
      funnelPath: string[];
      isConsistent: boolean;
      parameterDiffs: Array<{
        fromEvent: string;
        toEvent: string;
        changedParams: Array<{
          param: string;
          fromValue: unknown;
          toValue: unknown;
        }>;
      }>;
      snapshots: FunnelItemSnapshot[];
    }>;
    summary: {
      totalItems: number;
      consistentItems: number;
      inconsistentItems: number;
      consistencyPercent: number;
      commonIssues: Array<{
        param: string;
        occurrences: number;
      }>;
    };
  } {
    const results: Array<{
      identifier: string;
      funnelPath: string[];
      isConsistent: boolean;
      parameterDiffs: Array<{
        fromEvent: string;
        toEvent: string;
        changedParams: Array<{
          param: string;
          fromValue: unknown;
          toValue: unknown;
        }>;
      }>;
      snapshots: FunnelItemSnapshot[];
    }> = [];

    const paramIssueCount = new Map<string, number>();

    for (const [identifier, item] of this.extendedTrackedItems) {
      // 퍼널 순서대로 정렬
      const sortedSnapshots = [...item.snapshots].sort((a, b) => {
        if (a.funnelOrder !== b.funnelOrder) {
          return a.funnelOrder - b.funnelOrder;
        }
        return a.timestamp - b.timestamp;
      });

      const funnelPath = sortedSnapshots.map(s => s.event);
      const parameterDiffs: Array<{
        fromEvent: string;
        toEvent: string;
        changedParams: Array<{
          param: string;
          fromValue: unknown;
          toValue: unknown;
        }>;
      }> = [];

      // 연속된 이벤트 간 파라미터 비교
      for (let i = 1; i < sortedSnapshots.length; i++) {
        const prev = sortedSnapshots[i - 1];
        const curr = sortedSnapshots[i];

        const changedParams: Array<{
          param: string;
          fromValue: unknown;
          toValue: unknown;
        }> = [];

        // 모든 파라미터 비교
        const allKeys = new Set([
          ...Object.keys(prev.params),
          ...Object.keys(curr.params)
        ]);

        for (const key of allKeys) {
          const prevVal = prev.params[key];
          const currVal = curr.params[key];

          // 값이 다른 경우 (undefined도 고려)
          if (JSON.stringify(prevVal) !== JSON.stringify(currVal)) {
            changedParams.push({
              param: key,
              fromValue: prevVal,
              toValue: currVal,
            });

            // 이슈 카운트
            paramIssueCount.set(key, (paramIssueCount.get(key) || 0) + 1);
          }
        }

        if (changedParams.length > 0) {
          parameterDiffs.push({
            fromEvent: prev.event,
            toEvent: curr.event,
            changedParams,
          });
        }
      }

      const isConsistent = parameterDiffs.length === 0;

      results.push({
        identifier,
        funnelPath,
        isConsistent,
        parameterDiffs,
        snapshots: sortedSnapshots,
      });
    }

    // 요약 통계
    const totalItems = results.length;
    const consistentItems = results.filter(r => r.isConsistent).length;
    const inconsistentItems = totalItems - consistentItems;
    const consistencyPercent = totalItems > 0
      ? Math.round((consistentItems / totalItems) * 100 * 10) / 10
      : 100;

    // 가장 흔한 이슈 파라미터
    const commonIssues = Array.from(paramIssueCount.entries())
      .map(([param, occurrences]) => ({ param, occurrences }))
      .sort((a, b) => b.occurrences - a.occurrences);

    return {
      items: results,
      summary: {
        totalItems,
        consistentItems,
        inconsistentItems,
        consistencyPercent,
        commonIssues,
      },
    };
  }

  /**
   * 확장된 검증 결과를 콘솔에 출력합니다.
   */
  printExtendedReport(result: ReturnType<typeof this.validateAllParams>): void {
    console.log('\n' + '═'.repeat(70));
    console.log('🔄 Extended Funnel Consistency Report (All Item Parameters)');
    console.log('═'.repeat(70));

    console.log(`\n📊 추적된 이벤트: ${this.trackedEvents.join(' → ')}`);
    console.log(`📦 추적된 아이템: ${result.summary.totalItems}개`);
    console.log(`✅ 일관된 아이템: ${result.summary.consistentItems}개`);
    console.log(`❌ 불일치 아이템: ${result.summary.inconsistentItems}개`);
    console.log(`📈 일관성 점수: ${result.summary.consistencyPercent}%`);

    if (result.summary.commonIssues.length > 0) {
      console.log('\n⚠️ 가장 빈번한 불일치 파라미터:');
      for (const issue of result.summary.commonIssues.slice(0, 5)) {
        console.log(`   - ${issue.param}: ${issue.occurrences}회`);
      }
    }

    // 불일치 아이템 상세
    const inconsistentItems = result.items.filter(i => !i.isConsistent);
    if (inconsistentItems.length > 0) {
      console.log('\n' + '─'.repeat(70));
      console.log('📋 불일치 아이템 상세');
      console.log('─'.repeat(70));

      for (const item of inconsistentItems.slice(0, 5)) {
        console.log(`\n🔴 [${item.identifier}]`);
        console.log(`   퍼널 경로: ${item.funnelPath.join(' → ')}`);

        for (const diff of item.parameterDiffs) {
          console.log(`\n   📍 ${diff.fromEvent} → ${diff.toEvent}:`);
          for (const change of diff.changedParams) {
            const fromStr = JSON.stringify(change.fromValue) ?? '(undefined)';
            const toStr = JSON.stringify(change.toValue) ?? '(undefined)';
            console.log(`      ❌ ${change.param}:`);
            console.log(`         이전: ${fromStr.substring(0, 50)}${fromStr.length > 50 ? '...' : ''}`);
            console.log(`         이후: ${toStr.substring(0, 50)}${toStr.length > 50 ? '...' : ''}`);
          }
        }
      }

      if (inconsistentItems.length > 5) {
        console.log(`\n   ... 외 ${inconsistentItems.length - 5}개 아이템`);
      }
    } else {
      console.log('\n✅ 모든 아이템이 퍼널 전체에서 일관성을 유지합니다.');
    }

    // 일관된 아이템 샘플
    const consistentSamples = result.items.filter(i => i.isConsistent).slice(0, 3);
    if (consistentSamples.length > 0) {
      console.log('\n' + '─'.repeat(70));
      console.log('✅ 일관된 아이템 샘플');
      console.log('─'.repeat(70));

      for (const item of consistentSamples) {
        console.log(`\n🟢 [${item.identifier}]`);
        console.log(`   퍼널 경로: ${item.funnelPath.join(' → ')}`);
        if (item.snapshots.length > 0) {
          const firstSnapshot = item.snapshots[0];
          console.log(`   파라미터 (${Object.keys(firstSnapshot.params).length}개):`);
          for (const [key, value] of Object.entries(firstSnapshot.params).slice(0, 5)) {
            const valStr = JSON.stringify(value);
            console.log(`      ${key}: ${valStr.substring(0, 40)}${valStr.length > 40 ? '...' : ''}`);
          }
          if (Object.keys(firstSnapshot.params).length > 5) {
            console.log(`      ... 외 ${Object.keys(firstSnapshot.params).length - 5}개`);
          }
        }
      }
    }
  }

  /**
   * 모든 추적된 아이템의 퍼널 일관성을 검증합니다.
   */
  validate(): FunnelValidationReport {
    const itemResults: FunnelConsistencyResult[] = [];
    const issues: FunnelValidationReport['issues'] = [];

    for (const item of this.trackedItems.values()) {
      const result = this.validateItem(item);
      itemResults.push(result);

      // 문제점 수집
      if (!result.nameConsistency.isConsistent) {
        issues.push({
          severity: 'HIGH',
          type: 'NAME_MISMATCH',
          description: `item_name이 퍼널 이벤트 간에 변경됨: ${result.nameConsistency.uniqueNames.join(' → ')}`,
          affectedEvents: result.nameConsistency.changes?.map(c => `${c.fromEvent} → ${c.toEvent}`) || [],
          item_id: item.item_id,
        });
      }

      if (!result.priceConsistency.isConsistent) {
        issues.push({
          severity: 'MEDIUM',
          type: 'PRICE_MISMATCH',
          description: `price가 퍼널 이벤트 간에 변경됨: ${result.priceConsistency.uniquePrices.join(' → ')}`,
          affectedEvents: result.priceConsistency.changes?.map(c => `${c.fromEvent} → ${c.toEvent}`) || [],
          item_id: item.item_id,
        });
      }
    }

    const totalItems = itemResults.length;
    const consistentItems = itemResults.filter(
      r => r.nameConsistency.isConsistent && r.priceConsistency.isConsistent
    ).length;

    return {
      timestamp: new Date().toISOString(),
      trackedEvents: this.trackedEvents,
      itemResults,
      overallConsistency: {
        totalItems,
        consistentItems,
        consistencyPercent: totalItems > 0 ? Math.round((consistentItems / totalItems) * 100 * 10) / 10 : 100,
      },
      issues,
    };
  }

  /**
   * 단일 아이템의 퍼널 일관성을 검증합니다.
   */
  private validateItem(item: FunnelTrackedItem): FunnelConsistencyResult {
    // item_name 일관성 검증
    const uniqueNames = [...new Set(item.namesByEvent.map(n => n.item_name))];
    const nameChanges: FunnelConsistencyResult['nameConsistency']['changes'] = [];

    if (uniqueNames.length > 1) {
      // 이벤트 순서대로 정렬
      const sortedNames = [...item.namesByEvent].sort((a, b) => {
        const aIndex = ECOMMERCE_FUNNEL_ORDER.indexOf(a.event as any);
        const bIndex = ECOMMERCE_FUNNEL_ORDER.indexOf(b.event as any);
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      });

      for (let i = 1; i < sortedNames.length; i++) {
        if (sortedNames[i].item_name !== sortedNames[i - 1].item_name) {
          nameChanges.push({
            fromEvent: sortedNames[i - 1].event,
            toEvent: sortedNames[i].event,
            fromName: sortedNames[i - 1].item_name,
            toName: sortedNames[i].item_name,
          });
        }
      }
    }

    // price 일관성 검증
    const uniquePrices = [...new Set(item.pricesByEvent.map(p => p.price))];
    const priceChanges: FunnelConsistencyResult['priceConsistency']['changes'] = [];

    if (uniquePrices.length > 1) {
      const sortedPrices = [...item.pricesByEvent].sort((a, b) => {
        const aIndex = ECOMMERCE_FUNNEL_ORDER.indexOf(a.event as any);
        const bIndex = ECOMMERCE_FUNNEL_ORDER.indexOf(b.event as any);
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      });

      for (let i = 1; i < sortedPrices.length; i++) {
        if (sortedPrices[i].price !== sortedPrices[i - 1].price) {
          priceChanges.push({
            fromEvent: sortedPrices[i - 1].event,
            toEvent: sortedPrices[i].event,
            fromPrice: sortedPrices[i - 1].price,
            toPrice: sortedPrices[i].price,
          });
        }
      }
    }

    return {
      item,
      nameConsistency: {
        isConsistent: uniqueNames.length <= 1,
        uniqueNames,
        changes: nameChanges.length > 0 ? nameChanges : undefined,
      },
      priceConsistency: {
        isConsistent: uniquePrices.length <= 1,
        uniquePrices,
        changes: priceChanges.length > 0 ? priceChanges : undefined,
      },
    };
  }

  /**
   * 퍼널 검증 결과를 콘솔에 출력합니다.
   */
  printReport(report: FunnelValidationReport): void {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('🔄 Funnel Consistency Report');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log(`📊 추적된 이벤트: ${report.trackedEvents.join(' → ')}`);
    console.log(`📦 추적된 아이템: ${report.overallConsistency.totalItems}개`);
    console.log(`✅ 일관성 점수: ${report.overallConsistency.consistencyPercent}%\n`);

    if (report.issues.length > 0) {
      console.log('⚠️ 발견된 문제점:');
      for (const issue of report.issues) {
        const severity = issue.severity === 'HIGH' ? '🔴' : issue.severity === 'MEDIUM' ? '🟡' : '🟢';
        console.log(`\n  ${severity} [${issue.type}] ${issue.description}`);
        if (issue.item_id) {
          console.log(`     item_id: ${issue.item_id}`);
        }
        console.log(`     영향 이벤트: ${issue.affectedEvents.join(', ')}`);
      }
    } else {
      console.log('✅ 모든 아이템이 퍼널 전체에서 일관성을 유지합니다.');
    }

    // 아이템별 상세 정보
    if (report.itemResults.length > 0) {
      console.log('\n📋 아이템별 상세:');
      for (const result of report.itemResults) {
        console.log(`\n  [${result.item.identifier}]`);
        console.log(`    이름 일관성: ${result.nameConsistency.isConsistent ? '✅' : '❌'}`);
        if (result.nameConsistency.uniqueNames.length > 0) {
          console.log(`      이름: ${result.nameConsistency.uniqueNames[0].substring(0, 40)}${result.nameConsistency.uniqueNames[0].length > 40 ? '...' : ''}`);
        }
        if (!result.nameConsistency.isConsistent && result.nameConsistency.changes) {
          for (const change of result.nameConsistency.changes) {
            console.log(`      ⚠️ ${change.fromEvent} → ${change.toEvent}:`);
            console.log(`         "${change.fromName.substring(0, 30)}..." → "${change.toName.substring(0, 30)}..."`);
          }
        }
        console.log(`    가격 일관성: ${result.priceConsistency.isConsistent ? '✅' : '❌'}`);
        if (result.priceConsistency.uniquePrices.length > 0) {
          console.log(`      가격: ${result.priceConsistency.uniquePrices.join(', ')}`);
        }
      }
    }
  }

  /**
   * 추적 데이터를 초기화합니다.
   */
  clear(): void {
    this.trackedItems.clear();
    this.extendedTrackedItems.clear();
    this.trackedEvents = [];
  }
}

// 기본 인스턴스 export
export const parameterValidator = new ParameterValidator();
export const feedbackAnalyzer = new FeedbackAnalyzer();
export const funnelConsistencyValidator = new FunnelConsistencyValidator();
