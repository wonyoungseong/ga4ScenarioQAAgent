import {
  PageType,
  isVariableDeclaredOnPage,
  VARIABLE_PAGE_MAPPING,
  TRIGGER_NAME_PAGE_HINTS,
  DATALAYER_EVENT_PAGE_MAPPING,
  ALL_PAGE_TYPES
} from '../types/pageContext';
import { GTMFilter, GTMTrigger } from './gtmAnalyzer';

/**
 * Content Group 필터에서 페이지 타입을 추출하기 위한 정규화 함수
 */
function normalizeToPageType(value: string): PageType | null {
  const normalized = value.toUpperCase().replace(/[\s-_]/g, '_').replace(/[\^$]/g, '');

  // 직접 매핑
  const directMapping: Record<string, PageType> = {
    'MAIN': 'MAIN',
    'PRODUCT_DETAIL': 'PRODUCT_DETAIL',
    'PRODUCT_LIST': 'PRODUCT_LIST',
    'SEARCH_RESULT': 'SEARCH_RESULT',
    'CART': 'CART',
    'ORDER': 'ORDER',
    'MY': 'MY',
    'EVENT_LIST': 'EVENT_LIST',
    'EVENT_DETAIL': 'EVENT_DETAIL',
    'LIVE_LIST': 'LIVE_LIST',
    'LIVE_DETAIL': 'LIVE_DETAIL',
    'BRAND_MAIN': 'BRAND_MAIN',
    'OTHERS': 'OTHERS',
    // 별칭
    'PRD': 'PRODUCT_DETAIL',
    'PRDS': 'PRODUCT_LIST',
    'EVENT': 'EVENT_DETAIL',
    'EVENTS': 'EVENT_LIST',
  };

  return directMapping[normalized] || null;
}

/**
 * 필터 평가 결과
 */
export interface FilterEvaluationResult {
  /** 필터가 통과할 수 있는지 여부 */
  canPass: boolean;
  /** 평가 이유 */
  reason: string;
  /** 변수 선언 여부 관련 이슈 */
  variableIssue?: {
    variableName: string;
    isDeclared: boolean | undefined;
    message: string;
  };
}

/**
 * 트리거 평가 결과
 */
export interface TriggerEvaluationResult {
  /** 트리거가 해당 페이지에서 발동할 수 있는지 */
  canFire: boolean;
  /** 트리거 이름 */
  triggerName: string;
  /** 트리거 타입 */
  triggerType: string;
  /** 평가 이유 */
  reason: string;
  /** 개별 필터 평가 결과 */
  filterResults: FilterEvaluationResult[];
  /** 변수 선언 문제가 있는지 */
  hasVariableDeclarationIssue: boolean;
}

/**
 * 이벤트 평가 결과
 */
export interface EventEvaluationResult {
  /** 이벤트명 */
  eventName: string;
  /** 이벤트가 해당 페이지에서 발생할 수 있는지 */
  canFire: boolean;
  /** 평가 이유 요약 */
  summary: string;
  /** 개별 트리거 평가 결과 */
  triggerResults: TriggerEvaluationResult[];
  /** 변수 선언 문제로 인해 발생하지 않는 경우 */
  blockedByVariableDeclaration: boolean;
}

/**
 * GTM 필터 조건 평가기
 *
 * 페이지 컨텍스트를 고려하여 필터 조건이 통과할 수 있는지 평가합니다.
 * 특히 변수가 선언되지 않은 페이지에서는 필터가 통과하지 않음을 감지합니다.
 */
export class FilterEvaluator {
  /**
   * 단일 필터 조건을 평가합니다.
   *
   * @param filter GTM 필터
   * @param pageType 현재 페이지 타입
   */
  evaluateFilter(filter: GTMFilter, pageType: PageType): FilterEvaluationResult {
    const variableName = filter.variable;
    const filterType = filter.type;
    const filterValue = filter.value;

    // 0. Content Group / PageType 필터 특별 처리
    // {{LT - Content Group}} MATCH_REGEX MAIN|PRODUCT_DETAIL|EVENT_DETAIL 형태의 필터 처리
    const contentGroupCheck = this.evaluateContentGroupFilter(variableName, filterType, filterValue, pageType);
    if (contentGroupCheck) {
      return contentGroupCheck;
    }

    // 1. 변수가 해당 페이지에서 선언되는지 확인
    const isDeclared = isVariableDeclaredOnPage(variableName, pageType);

    // 변수 매핑에 있고 해당 페이지에서 선언되지 않는 경우
    if (isDeclared === false) {
      return {
        canPass: false,
        reason: `변수 "${variableName}"는 ${pageType} 페이지에서 선언되지 않습니다. 따라서 필터 조건(${filterType} "${filterValue}")을 평가할 수 없습니다.`,
        variableIssue: {
          variableName,
          isDeclared: false,
          message: `이 변수는 ${this.getVariableAllowedPages(variableName).join(', ')} 페이지에서만 선언됩니다.`
        }
      };
    }

    // 2. 특수 필터 타입 평가
    // DOES_NOT_MATCH "undefined|null" 패턴: 변수가 정의되어 있어야 통과
    if (filterType === 'DOES_NOT_MATCH' || filterType === 'DOES_NOT_EQUAL') {
      if (filterValue.includes('undefined') || filterValue.includes('null')) {
        // 변수 매핑에 없는 경우 (알 수 없음) - 변수명에서 힌트 추출 시도
        if (isDeclared === undefined) {
          // 변수명에서 페이지 힌트 추출 시도
          const pageHint = this.extractPageHintFromVariableName(variableName);
          if (pageHint && pageHint !== pageType) {
            return {
              canPass: false,
              reason: `변수 "${variableName}"는 "${pageHint}" 관련 변수로 보이며, ${pageType} 페이지에서는 선언되지 않을 가능성이 높습니다.`,
              variableIssue: {
                variableName,
                isDeclared: undefined,
                message: `변수명에서 "${pageHint}" 페이지 관련 힌트가 감지되었습니다.`
              }
            };
          }
        }
      }
    }

    // 3. CSS_SELECTOR 필터는 페이지와 무관하게 요소 존재 여부에 따름
    if (filterType === 'CSS_SELECTOR') {
      return {
        canPass: true, // 요소가 있으면 통과 가능
        reason: `CSS Selector 필터는 페이지에 해당 요소(${filterValue})가 존재하면 통과할 수 있습니다.`
      };
    }

    // 4. 기타 필터는 조건에 따라 통과 가능
    return {
      canPass: true,
      reason: `필터 조건 "${variableName} ${filterType} '${filterValue}'"는 조건이 맞으면 통과할 수 있습니다.`
    };
  }

  /**
   * 트리거의 모든 필터 조건을 평가합니다.
   *
   * @param trigger GTM 트리거
   * @param pageType 현재 페이지 타입
   */
  evaluateTrigger(trigger: GTMTrigger, pageType: PageType): TriggerEvaluationResult {
    const filterResults: FilterEvaluationResult[] = [];
    let hasVariableDeclarationIssue = false;
    let canFire = true;
    let blockingReason = '';

    // 1. 트리거 이름에서 페이지 타입 힌트 체크
    const triggerNameCheck = this.checkTriggerNamePageHint(trigger.name, pageType);
    if (triggerNameCheck && !triggerNameCheck.canPass) {
      filterResults.push(triggerNameCheck);
      canFire = false;
      hasVariableDeclarationIssue = true;
      blockingReason = triggerNameCheck.reason;
    }

    // 2. customEventName에서 dataLayer 이벤트 페이지 제한 체크
    if (trigger.customEventName) {
      const eventNameCheck = this.checkDataLayerEventPage(trigger.customEventName, pageType);
      if (eventNameCheck && !eventNameCheck.canPass) {
        filterResults.push(eventNameCheck);
        canFire = false;
        hasVariableDeclarationIssue = true;
        if (!blockingReason) {
          blockingReason = eventNameCheck.reason;
        }
      }
    }

    // 3. 모든 필터 평가
    for (const filter of trigger.filters) {
      const result = this.evaluateFilter(filter, pageType);
      filterResults.push(result);

      if (!result.canPass) {
        canFire = false;
        if (result.variableIssue) {
          hasVariableDeclarationIssue = true;
        }
        if (!blockingReason) {
          blockingReason = result.reason;
        }
      }
    }

    // 트리거 타입별 추가 검증
    const triggerTypeReason = this.evaluateTriggerType(trigger.type, pageType);
    if (triggerTypeReason) {
      filterResults.push({
        canPass: true,
        reason: triggerTypeReason
      });
    }

    const reason = canFire
      ? `트리거 "${trigger.name}"는 ${pageType} 페이지에서 발동할 수 있습니다.`
      : blockingReason || `트리거 "${trigger.name}"는 ${pageType} 페이지에서 발동할 수 없습니다.`;

    return {
      canFire,
      triggerName: trigger.name,
      triggerType: trigger.type,
      reason,
      filterResults,
      hasVariableDeclarationIssue
    };
  }

  /**
   * 트리거 이름에서 페이지 타입 힌트를 체크합니다.
   * 예: "CE - View Item List on SRP Trigger" → SRP(SEARCH_RESULT)에서만 가능
   */
  private checkTriggerNamePageHint(triggerName: string, pageType: PageType): FilterEvaluationResult | null {
    for (const [hint, allowedPages] of Object.entries(TRIGGER_NAME_PAGE_HINTS)) {
      if (triggerName.includes(hint)) {
        if (!allowedPages.includes(pageType)) {
          return {
            canPass: false,
            reason: `트리거 "${triggerName}"는 이름에 "${hint}"가 포함되어 ${allowedPages.join(', ')} 페이지에서만 발동합니다. 현재 페이지(${pageType})에서는 발동하지 않습니다.`,
            variableIssue: {
              variableName: `[트리거 이름 힌트: ${hint}]`,
              isDeclared: false,
              message: `이 트리거는 ${allowedPages.join(', ')} 페이지 전용입니다.`
            }
          };
        }
      }
    }
    return null;
  }

  /**
   * dataLayer 이벤트가 특정 페이지에서만 push되는지 체크합니다.
   */
  private checkDataLayerEventPage(eventName: string, pageType: PageType): FilterEvaluationResult | null {
    const allowedPages = DATALAYER_EVENT_PAGE_MAPPING[eventName];
    if (allowedPages && !allowedPages.includes(pageType)) {
      return {
        canPass: false,
        reason: `dataLayer 이벤트 "${eventName}"는 일반적으로 ${allowedPages.join(', ')} 페이지에서만 push됩니다. 현재 페이지(${pageType})에서는 발생하지 않습니다.`,
        variableIssue: {
          variableName: `[dataLayer event: ${eventName}]`,
          isDeclared: false,
          message: `이 이벤트는 ${allowedPages.join(', ')} 페이지에서만 push됩니다.`
        }
      };
    }
    return null;
  }

  /**
   * 이벤트가 특정 페이지에서 발생할 수 있는지 평가합니다.
   *
   * @param eventName 이벤트명
   * @param triggers 이벤트에 연결된 트리거 목록
   * @param pageType 현재 페이지 타입
   */
  evaluateEvent(eventName: string, triggers: GTMTrigger[], pageType: PageType): EventEvaluationResult {
    const triggerResults: TriggerEvaluationResult[] = [];
    let canFire = false;
    let blockedByVariableDeclaration = false;
    let firingTriggerName = '';

    for (const trigger of triggers) {
      const result = this.evaluateTrigger(trigger, pageType);
      triggerResults.push(result);

      if (result.canFire) {
        canFire = true;
        firingTriggerName = trigger.name;
      } else if (result.hasVariableDeclarationIssue) {
        blockedByVariableDeclaration = true;
      }
    }

    let summary: string;
    if (canFire) {
      summary = `이벤트 "${eventName}"는 ${pageType} 페이지에서 트리거 "${firingTriggerName}"를 통해 발생할 수 있습니다.`;
    } else if (blockedByVariableDeclaration) {
      summary = `이벤트 "${eventName}"는 ${pageType} 페이지에서 발생할 수 없습니다. 필요한 변수가 이 페이지에서 선언되지 않습니다.`;
    } else {
      summary = `이벤트 "${eventName}"는 ${pageType} 페이지에서 발생할 수 없습니다. 트리거 조건을 만족하지 않습니다.`;
    }

    return {
      eventName,
      canFire,
      summary,
      triggerResults,
      blockedByVariableDeclaration
    };
  }

  /**
   * 변수가 선언될 수 있는 페이지 목록을 반환합니다.
   */
  private getVariableAllowedPages(variableName: string): PageType[] {
    return VARIABLE_PAGE_MAPPING[variableName] || [];
  }

  /**
   * Content Group / PageType 필터를 평가합니다.
   *
   * GTM 트리거에서 {{LT - Content Group}} MATCH_REGEX MAIN|PRODUCT_DETAIL|EVENT_DETAIL 같은 필터가 있으면
   * 현재 페이지 타입이 허용된 값 중 하나인지 확인합니다.
   *
   * @returns 평가 결과 또는 null (Content Group 필터가 아닌 경우)
   */
  private evaluateContentGroupFilter(
    variableName: string,
    filterType: string,
    filterValue: string,
    pageType: PageType
  ): FilterEvaluationResult | null {
    // Content Group 또는 PageType 변수인지 확인
    const isContentGroupVariable =
      variableName.toLowerCase().includes('content group') ||
      variableName.toLowerCase().includes('pagetype') ||
      variableName.toLowerCase().includes('page_type');

    if (!isContentGroupVariable) {
      return null; // Content Group 필터가 아님
    }

    // MATCH_REGEX, EQUALS, CONTAINS 등의 필터에서 허용된 페이지 타입 추출
    const allowedPageTypes: PageType[] = [];

    if (filterType === 'MATCH_REGEX' || filterType === 'REGEX_MATCH') {
      // 정규식 패턴에서 페이지 타입 추출 (예: "MAIN|PRODUCT_DETAIL|EVENT_DETAIL|^prd$|^event$")
      const parts = filterValue.split(/[|,]/);
      for (const part of parts) {
        const cleanPart = part.trim().replace(/[\^$]/g, '');
        const normalizedPageType = normalizeToPageType(cleanPart);
        if (normalizedPageType) {
          allowedPageTypes.push(normalizedPageType);
        }
      }
    } else if (filterType === 'EQUALS' || filterType === 'CONTAINS') {
      // 단일 값에서 페이지 타입 추출
      const normalizedPageType = normalizeToPageType(filterValue);
      if (normalizedPageType) {
        allowedPageTypes.push(normalizedPageType);
      }
    } else {
      return null; // 처리할 수 없는 필터 타입
    }

    // 허용된 페이지 타입이 없으면 처리할 수 없음
    if (allowedPageTypes.length === 0) {
      return null;
    }

    // 현재 페이지 타입이 허용된 목록에 있는지 확인
    let isAllowed = allowedPageTypes.includes(pageType);

    // [아모레몰 Edge Case] BRAND_MAIN은 PRODUCT_DETAIL/PRODUCT_LIST와 유사하게 동작
    // GA4 데이터에서 BRAND_MAIN에서 scroll이 58.5%로 발생하지만,
    // GTM Content Group 필터에는 BRAND_MAIN이 명시적으로 없음
    // 실제로 BRAND_MAIN 페이지의 Content Group 값이 "prd" 등으로 설정되어 있을 가능성 있음
    if (!isAllowed && pageType === 'BRAND_MAIN') {
      // PRODUCT_DETAIL이나 PRODUCT_LIST가 허용되면 BRAND_MAIN도 허용
      if (allowedPageTypes.includes('PRODUCT_DETAIL') || allowedPageTypes.includes('PRODUCT_LIST')) {
        isAllowed = true;
      }
    }

    if (isAllowed) {
      return {
        canPass: true,
        reason: `[Content Group 필터] ${variableName}이(가) ${pageType}을 포함하는 패턴(${filterValue})과 일치합니다.`
      };
    } else {
      return {
        canPass: false,
        reason: `[Content Group 필터] ${variableName} 조건이 ${allowedPageTypes.join(', ')} 페이지에서만 만족됩니다. 현재 페이지(${pageType})에서는 발동하지 않습니다.`,
        variableIssue: {
          variableName: `[Content Group 필터: ${variableName}]`,
          isDeclared: true,
          message: `이 트리거는 ${allowedPageTypes.join(', ')} 페이지에서만 발동합니다.`
        }
      };
    }
  }

  /**
   * 변수명에서 페이지 타입 힌트를 추출합니다.
   * 예: "{{JS - Promotion Name on Detail Page}}" → "EVENT_DETAIL"
   */
  private extractPageHintFromVariableName(variableName: string): PageType | null {
    const lowerName = variableName.toLowerCase();

    if (lowerName.includes('detail page') || lowerName.includes('on detail')) {
      if (lowerName.includes('promotion') || lowerName.includes('event')) {
        return 'EVENT_DETAIL';
      }
      if (lowerName.includes('product') || lowerName.includes('item')) {
        return 'PRODUCT_DETAIL';
      }
      if (lowerName.includes('live')) {
        return 'LIVE_DETAIL';
      }
    }

    if (lowerName.includes('search')) {
      return 'SEARCH_RESULT';
    }

    if (lowerName.includes('cart') || lowerName.includes('basket')) {
      return 'CART';
    }

    if (lowerName.includes('order') || lowerName.includes('checkout')) {
      return 'ORDER';
    }

    if (lowerName.includes('main page')) {
      return 'MAIN';
    }

    return null;
  }

  /**
   * 트리거 타입에 따른 추가 설명을 반환합니다.
   */
  private evaluateTriggerType(triggerType: string, pageType: PageType): string | null {
    switch (triggerType) {
      case 'WINDOW_LOADED':
        return '페이지가 완전히 로드되면 자동으로 발동됩니다.';
      case 'DOM_READY':
        return 'DOM이 준비되면 자동으로 발동됩니다.';
      case 'PAGEVIEW':
        return '페이지뷰 시 자동으로 발동됩니다.';
      case 'CLICK':
      case 'LINK_CLICK':
        return '사용자가 해당 요소를 클릭하면 발동됩니다.';
      case 'CUSTOM_EVENT':
        return 'dataLayer.push로 커스텀 이벤트가 발생하면 발동됩니다.';
      case 'SCROLL':
      case 'SCROLL_DEPTH':
        return '사용자가 스크롤하면 발동됩니다.';
      case 'VISIBILITY':
      case 'ELEMENT_VISIBILITY':
        return '특정 요소가 화면에 보이면 발동됩니다.';
      default:
        return null;
    }
  }
}

// 싱글톤 인스턴스
export const filterEvaluator = new FilterEvaluator();
