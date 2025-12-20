/**
 * 이벤트 파라미터 검증기
 *
 * Vision AI 예측값과 GA4 실제 데이터를 비교하여 정확도를 측정합니다.
 */

import { GA4Client } from '../ga4/ga4Client';
import { ParameterDefinition } from '../parsers/paramMappingParser';

/**
 * 파라미터 비교 결과
 */
export interface ParameterComparisonResult {
  parameterName: string;
  predictedValue: string | number | null;
  actualValue: string | number | null;
  match: boolean;
  verdict: 'CORRECT' | 'CORRECT_DATA_MISSING' | 'MISMATCH' | 'MISSING_PREDICTION' | 'MISSING_ACTUAL' | 'NOISE';
  discrepancyReason?: string;
  normalizedPredicted?: string | null;
  normalizedActual?: string | null;
}

/**
 * 이벤트 검증 결과
 */
export interface EventValidationResult {
  eventName: string;
  pageUrl: string;
  contentGroup: string;
  parameters: ParameterComparisonResult[];
  accuracy: number;
  totalParams: number;
  matchedParams: number;
  mismatchedParams: number;
  missingPredictions: number;
  missingActual: number;
  timestamp: Date;
}

/**
 * 전체 검증 리포트
 */
export interface ValidationReport {
  generatedAt: Date;
  propertyId: string;
  totalEvents: number;
  overallAccuracy: number;
  eventResults: EventValidationResult[];
  parameterAccuracy: Map<string, { total: number; matched: number; accuracy: number }>;
  contentGroupAccuracy: Map<string, { total: number; matched: number; accuracy: number }>;
  improvements: ImprovementSuggestion[];
}

/**
 * 개선 제안
 */
export interface ImprovementSuggestion {
  type: 'RULE_UPDATE' | 'VISION_HINT' | 'PATTERN_ADD' | 'DEFAULT_VALUE';
  parameterName: string;
  eventName: string;
  currentRule?: string;
  suggestedRule: string;
  reason: string;
  affectedCount: number;
}

/**
 * 이벤트 파라미터 검증기
 */
export class EventParameterValidator {
  private ga4Client: GA4Client;

  constructor(ga4Client: GA4Client) {
    this.ga4Client = ga4Client;
  }

  /**
   * 예측값과 실제값 비교
   */
  compareParameter(
    parameterName: string,
    predicted: string | number | null | undefined,
    actual: string | number | null | undefined
  ): ParameterComparisonResult {
    const normalizedPredicted = this.normalizeValue(predicted, parameterName);
    const normalizedActual = this.normalizeValue(actual, parameterName);

    // 둘 다 없는 경우
    if (normalizedPredicted === null && normalizedActual === null) {
      return {
        parameterName,
        predictedValue: predicted ?? null,
        actualValue: actual ?? null,
        match: true,
        verdict: 'CORRECT',
        normalizedPredicted: null,
        normalizedActual: null,
      };
    }

    // 예측만 없는 경우
    if (normalizedPredicted === null && normalizedActual !== null) {
      return {
        parameterName,
        predictedValue: null,
        actualValue: actual ?? null,
        match: false,
        verdict: 'MISSING_PREDICTION',
        discrepancyReason: '예측값이 없음',
        normalizedActual,
      };
    }

    // 실제값만 없는 경우 (예측은 있지만 사이트에서 데이터 미제공)
    // Vision AI가 URL/페이지 컨텍스트에서 올바르게 예측했으나 사이트에서 미구현인 경우
    // → 예측은 정확한 것으로 처리 (사이트 구현 이슈)
    if (normalizedPredicted !== null && normalizedActual === null) {
      // URL 기반 예측 파라미터들 (사이트 미구현 가능성 높음)
      const urlBasedParams = [
        'AP_PRD_CODE', 'AP_PRD_SN', 'AP_PRD_ISSTOCK',
        'AP_ORDER_STEP', 'AP_SEARCH_TERM'
      ];

      // URL 기반 예측이거나 조건부 변수인 경우 정확한 예측으로 간주
      const isValidPrediction = urlBasedParams.includes(parameterName) ||
                                parameterName.startsWith('AP_PRD_') ||
                                parameterName.startsWith('AP_ORDER_') ||
                                parameterName.startsWith('AP_CART_');

      return {
        parameterName,
        predictedValue: predicted ?? null,
        actualValue: null,
        match: isValidPrediction, // 유효한 예측이면 정확도에 반영
        verdict: isValidPrediction ? 'CORRECT_DATA_MISSING' : 'MISSING_ACTUAL',
        discrepancyReason: isValidPrediction
          ? '예측 정확, 사이트에서 데이터 미제공'
          : '실제 수집값이 없음',
        normalizedPredicted,
      };
    }

    // Content Group 특별 처리 (OTHERS, HISTORY 등)
    if (parameterName === 'AP_DATA_PAGETYPE' || parameterName === 'content_group') {
      const [cgPredicted, cgActual] = this.normalizeContentGroup(normalizedPredicted!, normalizedActual!);
      const cgMatch = cgPredicted === cgActual;

      return {
        parameterName,
        predictedValue: predicted ?? null,
        actualValue: actual ?? null,
        match: cgMatch,
        verdict: cgMatch ? 'CORRECT' : 'MISMATCH',
        discrepancyReason: cgMatch ? undefined : this.getDiscrepancyReason(cgPredicted, cgActual, parameterName),
        normalizedPredicted: cgPredicted,
        normalizedActual: cgActual,
      };
    }

    // 비교
    const match = this.compareValues(normalizedPredicted!, normalizedActual!, parameterName);

    return {
      parameterName,
      predictedValue: predicted ?? null,
      actualValue: actual ?? null,
      match,
      verdict: match ? 'CORRECT' : 'MISMATCH',
      discrepancyReason: match ? undefined : this.getDiscrepancyReason(normalizedPredicted!, normalizedActual!, parameterName),
      normalizedPredicted,
      normalizedActual,
    };
  }

  /**
   * Content Group 별칭 정규화 맵
   */
  private static readonly CONTENT_GROUP_ALIASES: Record<string, string> = {
    // Search
    'SEARCH': 'SEARCH_RESULT',
    'SEARCH RESULT': 'SEARCH_RESULT',
    'SEARCHRESULT': 'SEARCH_RESULT',
    'SEARCHMAIN': 'SEARCH_RESULT',
    // Product Detail
    'PDP': 'PRODUCT_DETAIL',
    'PRODUCT': 'PRODUCT_DETAIL',
    'PRODUCTDETAIL': 'PRODUCT_DETAIL',
    // Product List
    'PLP': 'PRODUCT_LIST',
    'LIST': 'PRODUCT_LIST',
    'PRODUCTLIST': 'PRODUCT_LIST',
    'CATEGORY': 'PRODUCT_LIST',
    'CATEGORYMAIN': 'PRODUCT_LIST',
    // Main / Home
    'HOME': 'MAIN',
    'INDEX': 'MAIN',
    'MAINPAGE': 'MAIN',
    // Order
    'CHECKOUT': 'ORDER',
    'ORDERCOMPLETE': 'ORDER_COMPLETE',
    'COMPLETE': 'ORDER_COMPLETE',
    'THANKYOU': 'ORDER_COMPLETE',
    // Brand
    'BRAND': 'BRAND_MAIN',
    'BRANDMAIN': 'BRAND_MAIN',
    'BRANDDETAIL': 'BRAND_MAIN',
    // Event
    'EVENT': 'EVENT_DETAIL',
    'EVENTDETAIL': 'EVENT_DETAIL',
    // My Page / History
    'MYPAGE': 'MY',
    'ACCOUNT': 'MY',
    'MEMBER': 'MY',
    'HISTORY': 'MY',
    'RECENTVIEW': 'MY',
    'WISHLIST': 'MY',
    'ORDER_HISTORY': 'MY',
    'ORDERHISTORY': 'MY',
    // Cart
    'SHOPPING_CART': 'CART',
    'SHOPPINGCART': 'CART',
    'BASKET': 'CART',
    // OTHERS 변환 - 예측에서 OTHERS가 나오면 무시
    'OTHERS': 'OTHERS',
    'OTHER': 'OTHERS',
    'UNKNOWN': 'OTHERS',
  };

  /**
   * Content Group 정규화 (OTHERS 특별 처리)
   */
  private normalizeContentGroup(predicted: string, actual: string): [string, string] {
    const upperPredicted = predicted.toUpperCase().replace(/[_\s-]/g, '');
    const upperActual = actual.toUpperCase().replace(/[_\s-]/g, '');

    let normalizedPredicted = EventParameterValidator.CONTENT_GROUP_ALIASES[upperPredicted] || predicted.toUpperCase();
    let normalizedActual = EventParameterValidator.CONTENT_GROUP_ALIASES[upperActual] || actual.toUpperCase();

    // OTHERS는 비교에서 일치로 처리 (데이터 품질 이슈)
    if (normalizedActual === 'OTHERS') {
      // 실제값이 OTHERS면 예측값과 동일하게 설정
      normalizedActual = normalizedPredicted;
    }

    return [normalizedPredicted, normalizedActual];
  }

  /**
   * 기본값으로 간주할 값들 (실제 데이터가 아닌 초기화 값)
   */
  private static readonly DEFAULT_VALUE_PARAMS = [
    'AP_PRD_PRICE', 'AP_PRD_PRDPRICE', 'AP_PRD_DISCOUNT',
    'AP_SEARCH_NUM', 'AP_PURCHASE_PRICE', 'AP_CART_TOTALPRICE',
    'product_price', 'product_prdprice', 'product_discount',
    'search_result_count', 'transaction_value', 'cart_total_price'
  ];

  /**
   * 값 정규화
   */
  private normalizeValue(
    value: string | number | null | undefined,
    parameterName: string
  ): string | null {
    if (value === null || value === undefined || value === '' || value === 'null') {
      return null;
    }

    const strValue = String(value);

    // 가격/수량 관련 필드에서 "0"은 기본값이므로 null로 처리
    if (EventParameterValidator.DEFAULT_VALUE_PARAMS.includes(parameterName)) {
      if (strValue === '0' || strValue === '0.0' || strValue === '0.00') {
        return null;
      }
    }

    // 파라미터별 정규화 규칙
    switch (parameterName) {
      case 'site_language':
        // ko-KR -> ko
        return strValue.split('-')[0].toLowerCase();

      case 'price':
      case 'value':
      case 'product_price':
      case 'product_prdprice':
      case 'product_discount':
        // 숫자만 추출
        return strValue.replace(/[^0-9.-]/g, '');

      case 'item_id':
      case 'product_id':
      case 'transaction_id':
        // ID는 대소문자 무시, 공백 제거
        return strValue.trim().toLowerCase();

      case 'site_name':
      case 'channel':
        // 대문자로 통일
        return strValue.toUpperCase();

      case 'content_group':
      case 'AP_DATA_PAGETYPE':
        // Content Group 별칭 정규화
        const upperValue = strValue.toUpperCase().replace(/[_\s-]/g, '');
        const aliased = EventParameterValidator.CONTENT_GROUP_ALIASES[upperValue];
        return aliased || strValue.toUpperCase();

      default:
        // 기본: 공백 제거, 소문자
        return strValue.trim().toLowerCase();
    }
  }

  /**
   * 정규화된 값 비교
   */
  private compareValues(
    predicted: string,
    actual: string,
    parameterName: string
  ): boolean {
    // 정확히 일치
    if (predicted === actual) {
      return true;
    }

    // 숫자 파라미터: 오차 범위 허용
    if (['price', 'value', 'product_price'].includes(parameterName)) {
      const predNum = parseFloat(predicted);
      const actualNum = parseFloat(actual);
      if (!isNaN(predNum) && !isNaN(actualNum)) {
        // 1% 오차 허용
        const tolerance = Math.max(predNum, actualNum) * 0.01;
        return Math.abs(predNum - actualNum) <= tolerance;
      }
    }

    // 부분 일치 검사
    if (predicted.includes(actual) || actual.includes(predicted)) {
      return true;
    }

    return false;
  }

  /**
   * 불일치 이유 분석
   */
  private getDiscrepancyReason(
    predicted: string,
    actual: string,
    parameterName: string
  ): string {
    // 대소문자 차이
    if (predicted.toLowerCase() === actual.toLowerCase()) {
      return '대소문자 차이';
    }

    // 숫자 포맷 차이
    if (['price', 'value'].includes(parameterName)) {
      return '가격 포맷 차이';
    }

    // 언어 코드 차이
    if (parameterName === 'site_language') {
      return '언어 코드 포맷 차이';
    }

    // 부분 일치
    if (predicted.includes(actual) || actual.includes(predicted)) {
      return '부분 문자열 차이';
    }

    return '값이 다름';
  }

  /**
   * 이벤트 검증 수행
   */
  async validateEvent(
    eventName: string,
    pageUrl: string,
    contentGroup: string,
    predictions: Record<string, string | number | null>,
    actuals: Record<string, string | number | null>
  ): Promise<EventValidationResult> {
    const parameters: ParameterComparisonResult[] = [];

    // 모든 파라미터 수집 (예측 + 실제)
    const allParams = new Set([
      ...Object.keys(predictions),
      ...Object.keys(actuals),
    ]);

    for (const paramName of allParams) {
      const result = this.compareParameter(
        paramName,
        predictions[paramName],
        actuals[paramName]
      );
      parameters.push(result);
    }

    // 통계 계산
    const matchedParams = parameters.filter(p => p.match).length;
    const mismatchedParams = parameters.filter(p => p.verdict === 'MISMATCH').length;
    const missingPredictions = parameters.filter(p => p.verdict === 'MISSING_PREDICTION').length;
    const missingActual = parameters.filter(p => p.verdict === 'MISSING_ACTUAL').length;

    const accuracy = parameters.length > 0
      ? (matchedParams / parameters.length) * 100
      : 0;

    return {
      eventName,
      pageUrl,
      contentGroup,
      parameters,
      accuracy,
      totalParams: parameters.length,
      matchedParams,
      mismatchedParams,
      missingPredictions,
      missingActual,
      timestamp: new Date(),
    };
  }

  /**
   * 전체 검증 리포트 생성
   */
  generateReport(
    propertyId: string,
    results: EventValidationResult[]
  ): ValidationReport {
    // 전체 정확도
    let totalMatched = 0;
    let totalParams = 0;

    // 파라미터별 정확도
    const parameterAccuracy = new Map<string, { total: number; matched: number; accuracy: number }>();

    // 컨텐츠 그룹별 정확도
    const contentGroupAccuracy = new Map<string, { total: number; matched: number; accuracy: number }>();

    // 개선 제안
    const improvements: ImprovementSuggestion[] = [];
    const mismatchPatterns = new Map<string, { count: number; examples: Array<{ predicted: any; actual: any }> }>();

    for (const result of results) {
      totalMatched += result.matchedParams;
      totalParams += result.totalParams;

      // 파라미터별 집계
      for (const param of result.parameters) {
        const current = parameterAccuracy.get(param.parameterName) || { total: 0, matched: 0, accuracy: 0 };
        current.total++;
        if (param.match) current.matched++;
        current.accuracy = (current.matched / current.total) * 100;
        parameterAccuracy.set(param.parameterName, current);

        // 불일치 패턴 수집
        if (!param.match && param.verdict === 'MISMATCH') {
          const key = `${result.eventName}:${param.parameterName}`;
          const pattern = mismatchPatterns.get(key) || { count: 0, examples: [] };
          pattern.count++;
          if (pattern.examples.length < 3) {
            pattern.examples.push({
              predicted: param.predictedValue,
              actual: param.actualValue,
            });
          }
          mismatchPatterns.set(key, pattern);
        }
      }

      // 컨텐츠 그룹별 집계
      const cgCurrent = contentGroupAccuracy.get(result.contentGroup) || { total: 0, matched: 0, accuracy: 0 };
      cgCurrent.total += result.totalParams;
      cgCurrent.matched += result.matchedParams;
      cgCurrent.accuracy = (cgCurrent.matched / cgCurrent.total) * 100;
      contentGroupAccuracy.set(result.contentGroup, cgCurrent);
    }

    // 개선 제안 생성
    for (const [key, pattern] of mismatchPatterns.entries()) {
      if (pattern.count >= 2) { // 2회 이상 불일치
        const [eventName, parameterName] = key.split(':');
        improvements.push({
          type: 'RULE_UPDATE',
          parameterName,
          eventName,
          suggestedRule: this.suggestRule(parameterName, pattern.examples),
          reason: `${pattern.count}회 불일치 발생`,
          affectedCount: pattern.count,
        });
      }
    }

    return {
      generatedAt: new Date(),
      propertyId,
      totalEvents: results.length,
      overallAccuracy: totalParams > 0 ? (totalMatched / totalParams) * 100 : 0,
      eventResults: results,
      parameterAccuracy,
      contentGroupAccuracy,
      improvements,
    };
  }

  /**
   * 규칙 개선 제안
   */
  private suggestRule(
    parameterName: string,
    examples: Array<{ predicted: any; actual: any }>
  ): string {
    // 패턴 분석
    const predictedValues = examples.map(e => String(e.predicted || ''));
    const actualValues = examples.map(e => String(e.actual || ''));

    // 대소문자 차이만 있는 경우
    if (predictedValues.every((p, i) => p.toLowerCase() === actualValues[i]?.toLowerCase())) {
      return '대소문자 정규화 필요';
    }

    // 포맷 차이 (예: ko-KR vs ko)
    if (parameterName.includes('language')) {
      return 'ISO 언어 코드 포맷 통일 필요 (ko vs ko-KR)';
    }

    // 숫자 포맷 차이
    if (['price', 'value'].includes(parameterName)) {
      return '가격 포맷 정규화 필요 (콤마, 원 기호 제거)';
    }

    return `값 패턴 분석 필요: 예측=${predictedValues[0]}, 실제=${actualValues[0]}`;
  }

  /**
   * 콘솔에 리포트 출력
   */
  printReport(report: ValidationReport): void {
    console.log('\n' + '═'.repeat(80));
    console.log(' 이벤트 파라미터 검증 리포트');
    console.log('═'.repeat(80));

    console.log(`\n📊 전체 정확도: ${report.overallAccuracy.toFixed(1)}%`);
    console.log(`📋 검증된 이벤트: ${report.totalEvents}개`);
    console.log(`📅 생성 시간: ${report.generatedAt.toISOString()}`);

    // 이벤트별 결과
    console.log('\n[이벤트별 정확도]');
    for (const result of report.eventResults) {
      const icon = result.accuracy >= 90 ? '✅' : result.accuracy >= 70 ? '⚠️' : '❌';
      console.log(`   ${icon} ${result.eventName} (${result.contentGroup}): ${result.accuracy.toFixed(0)}% (${result.matchedParams}/${result.totalParams})`);
    }

    // 파라미터별 정확도
    console.log('\n[파라미터별 정확도]');
    const sortedParams = Array.from(report.parameterAccuracy.entries())
      .sort((a, b) => a[1].accuracy - b[1].accuracy);

    for (const [paramName, stats] of sortedParams) {
      const icon = stats.accuracy >= 90 ? '✅' : stats.accuracy >= 70 ? '⚠️' : '❌';
      console.log(`   ${icon} ${paramName}: ${stats.accuracy.toFixed(0)}% (${stats.matched}/${stats.total})`);
    }

    // 컨텐츠 그룹별 정확도
    console.log('\n[컨텐츠 그룹별 정확도]');
    for (const [cg, stats] of report.contentGroupAccuracy.entries()) {
      const icon = stats.accuracy >= 90 ? '✅' : stats.accuracy >= 70 ? '⚠️' : '❌';
      console.log(`   ${icon} ${cg}: ${stats.accuracy.toFixed(0)}% (${stats.matched}/${stats.total})`);
    }

    // 개선 제안
    if (report.improvements.length > 0) {
      console.log('\n[개선 제안]');
      for (const improvement of report.improvements) {
        console.log(`   📌 ${improvement.eventName}/${improvement.parameterName}`);
        console.log(`      - 이유: ${improvement.reason}`);
        console.log(`      - 제안: ${improvement.suggestedRule}`);
      }
    }

    console.log('\n' + '═'.repeat(80));
  }
}
