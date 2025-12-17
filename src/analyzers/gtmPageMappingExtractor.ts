/**
 * GTM JSON에서 변수-페이지, 이벤트-페이지 매핑을 동적으로 추출합니다.
 *
 * 하드코딩된 매핑 대신 GTM 설정에서 직접 분석하여:
 * 1. 변수가 어느 페이지에서 선언되는지
 * 2. 이벤트가 어느 페이지에서 발생하는지
 * 를 자동으로 파악합니다.
 */

import * as fs from 'fs';
import { PageType, ALL_PAGE_TYPES } from '../types/pageContext';

/**
 * 변수-페이지 매핑 결과
 */
export interface VariablePageMapping {
  variableName: string;
  allowedPageTypes: PageType[];
  source: 'trigger_filter' | 'variable_name' | 'inferred';
  confidence: number;
}

/**
 * 이벤트-페이지 매핑 결과
 */
export interface EventPageMapping {
  eventName: string;
  allowedPageTypes: PageType[];
  source: 'trigger_filter' | 'trigger_name' | 'variable_dependency' | 'inferred';
  confidence: number;
  /** 이 이벤트를 발생시키는 트리거들의 페이지 조건 */
  triggerPageConditions: {
    triggerId: string;
    triggerName: string;
    pageTypes: PageType[];
  }[];
}

/**
 * 트리거 이름에서 페이지 타입 힌트를 추출하는 패턴
 */
const TRIGGER_NAME_PATTERNS: { pattern: RegExp; pageTypes: PageType[] }[] = [
  // 검색 결과 페이지
  { pattern: /\bSRP\b/i, pageTypes: ['SEARCH_RESULT'] },
  { pattern: /\bSearch\s*Result/i, pageTypes: ['SEARCH_RESULT'] },
  { pattern: /\bon\s*Search/i, pageTypes: ['SEARCH_RESULT'] },

  // 상품 상세 페이지
  { pattern: /\bPDP\b/i, pageTypes: ['PRODUCT_DETAIL'] },
  { pattern: /\bProduct\s*Detail/i, pageTypes: ['PRODUCT_DETAIL'] },
  { pattern: /\bon\s*Detail\s*Page/i, pageTypes: ['PRODUCT_DETAIL'] },

  // 상품 리스트 페이지
  { pattern: /\bPLP\b/i, pageTypes: ['PRODUCT_LIST'] },
  { pattern: /\bProduct\s*List/i, pageTypes: ['PRODUCT_LIST'] },
  { pattern: /\bCategory/i, pageTypes: ['PRODUCT_LIST'] },

  // 장바구니
  { pattern: /\bCart\b/i, pageTypes: ['CART'] },
  { pattern: /\b장바구니\b/, pageTypes: ['CART'] },

  // 주문/결제
  { pattern: /\bCheckout\b/i, pageTypes: ['CART', 'ORDER'] },
  { pattern: /\bOrder\b/i, pageTypes: ['ORDER'] },
  { pattern: /\bPurchase\b/i, pageTypes: ['ORDER'] },
  { pattern: /\b주문\b/, pageTypes: ['ORDER'] },
  { pattern: /\b결제\b/, pageTypes: ['ORDER'] },

  // 메인 페이지
  { pattern: /\bMain\s*Page\b/i, pageTypes: ['MAIN'] },
  { pattern: /\bon\s*Main\b/i, pageTypes: ['MAIN'] },
  { pattern: /\b메인\b/, pageTypes: ['MAIN'] },

  // 이벤트 페이지
  { pattern: /\bEvent\s*Detail/i, pageTypes: ['EVENT_DETAIL'] },
  { pattern: /\bPromotion\s*Detail/i, pageTypes: ['EVENT_DETAIL'] },

  // 라이브 페이지
  { pattern: /\bLive\s*Detail/i, pageTypes: ['LIVE_DETAIL'] },
  { pattern: /\bLive\s*Page/i, pageTypes: ['LIVE_DETAIL'] },

  // 마이페이지
  { pattern: /\bMy\s*Page/i, pageTypes: ['MY'] },
  { pattern: /\bMyPage/i, pageTypes: ['MY'] },
];

/**
 * 변수 이름에서 페이지 타입 힌트를 추출하는 패턴
 */
const VARIABLE_NAME_PATTERNS: { pattern: RegExp; pageTypes: PageType[] }[] = [
  // 상세 페이지 변수
  { pattern: /on\s*Detail\s*Page/i, pageTypes: ['PRODUCT_DETAIL'] },
  { pattern: /Product\s*Detail/i, pageTypes: ['PRODUCT_DETAIL'] },
  { pattern: /PDP/i, pageTypes: ['PRODUCT_DETAIL'] },

  // 검색 관련 변수
  { pattern: /Search\s*Term/i, pageTypes: ['SEARCH_RESULT'] },
  { pattern: /search_term/i, pageTypes: ['SEARCH_RESULT'] },
  { pattern: /SRP/i, pageTypes: ['SEARCH_RESULT'] },

  // 장바구니 변수
  { pattern: /Cart/i, pageTypes: ['CART'] },
  { pattern: /cart_items/i, pageTypes: ['CART'] },

  // 주문 변수
  { pattern: /Order\s*ID/i, pageTypes: ['ORDER'] },
  { pattern: /Transaction/i, pageTypes: ['ORDER'] },
  { pattern: /transaction_id/i, pageTypes: ['ORDER'] },
  { pattern: /PURCHASE/i, pageTypes: ['ORDER'] },

  // 라이브 변수
  { pattern: /Live\s*ID/i, pageTypes: ['LIVE_DETAIL'] },
  { pattern: /live_id/i, pageTypes: ['LIVE_DETAIL'] },

  // 프로모션 변수
  { pattern: /promotion_id/i, pageTypes: ['MAIN', 'EVENT_DETAIL', 'EVENT_LIST'] },
];

/**
 * 페이지 타입 문자열을 PageType으로 정규화
 */
function normalizePageType(value: string): PageType | null {
  const normalized = value.toUpperCase().replace(/[\s-_]/g, '_');

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
  };

  return directMapping[normalized] || null;
}

/**
 * GTM JSON에서 페이지 매핑을 추출하는 클래스
 */
export class GTMPageMappingExtractor {
  private gtmData: any;
  private triggers: Map<string, any> = new Map();
  private variables: Map<string, any> = new Map();
  private tags: Map<string, any> = new Map();

  // 캐시된 매핑 결과
  private cachedEventMappings: Map<string, EventPageMapping> | null = null;
  private cachedVariableMappings: Map<string, VariablePageMapping> | null = null;

  constructor(gtmJsonPath: string) {
    const jsonContent = fs.readFileSync(gtmJsonPath, 'utf-8');
    this.gtmData = JSON.parse(jsonContent);
    this.parseGTMData();
  }

  /**
   * GTM 데이터를 파싱하여 트리거, 변수, 태그 맵을 구성합니다.
   */
  private parseGTMData(): void {
    const container = this.gtmData.containerVersion || this.gtmData;

    // 트리거 파싱
    for (const trigger of container.trigger || []) {
      this.triggers.set(trigger.triggerId, trigger);
    }

    // 변수 파싱
    for (const variable of container.variable || []) {
      this.variables.set(variable.variableId, variable);
    }

    // 태그 파싱
    for (const tag of container.tag || []) {
      this.tags.set(tag.tagId, tag);
    }
  }

  /**
   * 트리거에서 페이지 타입 필터를 추출합니다.
   * GTM 트리거의 filter/customEventFilter에서 Content Group 조건을 분석합니다.
   */
  private extractPageTypesFromTrigger(trigger: any): PageType[] {
    const pageTypes: PageType[] = [];

    // 1. 트리거 이름에서 힌트 추출
    if (trigger.name) {
      for (const { pattern, pageTypes: types } of TRIGGER_NAME_PATTERNS) {
        if (pattern.test(trigger.name)) {
          pageTypes.push(...types);
        }
      }
    }

    // 2. 필터에서 페이지 조건 추출 (Content Group 변수 기반)
    const filters = [...(trigger.filter || []), ...(trigger.customEventFilter || [])];

    for (const filter of filters) {
      if (!filter.parameter) continue;

      // arg0이 Content Group 변수인지 확인
      const arg0Param = filter.parameter.find((p: any) => p.key === 'arg0');
      const arg1Param = filter.parameter.find((p: any) => p.key === 'arg1');

      if (!arg0Param || !arg1Param) continue;

      // Content Group 변수 체크 (LT - Content Group, JS - Content Group 등)
      const isContentGroupFilter =
        arg0Param.value?.includes('Content Group') ||
        arg0Param.value?.includes('PAGETYPE') ||
        arg0Param.value?.includes('PageType');

      if (isContentGroupFilter && arg1Param.value) {
        // 정규식 패턴에서 페이지 타입 추출 (예: "MAIN|PRODUCT_DETAIL|EVENT_DETAIL")
        const pageTypePattern = arg1Param.value;
        const possibleTypes = pageTypePattern.split(/[|,]/);

        for (const typeStr of possibleTypes) {
          const cleanType = typeStr.trim().replace(/[\^$]/g, ''); // 정규식 특수문자 제거
          const pageType = normalizePageType(cleanType);
          if (pageType && !pageTypes.includes(pageType)) {
            pageTypes.push(pageType);
          }
        }
      }
    }

    return [...new Set(pageTypes)] as PageType[];
  }

  /**
   * 이벤트별 페이지 매핑을 추출합니다.
   * GTM 태그의 트리거 연결을 분석하여 각 이벤트가 어느 페이지에서 발생 가능한지 파악합니다.
   */
  extractEventPageMappings(): Map<string, EventPageMapping> {
    if (this.cachedEventMappings) {
      return this.cachedEventMappings;
    }

    const mappings = new Map<string, EventPageMapping>();

    // GA4 이벤트 태그 분석
    for (const [_, tag] of this.tags) {
      // GA4 이벤트 태그 타입 확인 (gaawe = GA4 Event)
      if (tag.type !== 'gaawe' && !tag.type?.includes('ga4')) {
        // 커스텀 템플릿도 확인 (cvt_로 시작하는 타입)
        if (!tag.type?.startsWith('cvt_')) continue;
      }

      const eventName = this.extractEventNameFromTag(tag);
      if (!eventName) continue;

      // 이 태그에 연결된 트리거들의 페이지 조건 수집
      const triggerIds = tag.firingTriggerId || [];
      const triggerPageConditions: EventPageMapping['triggerPageConditions'] = [];
      let allAllowedPageTypes: PageType[] = [];
      let source: EventPageMapping['source'] = 'inferred';
      let confidence = 50;

      for (const triggerId of triggerIds) {
        const trigger = this.triggers.get(triggerId);
        if (!trigger) continue;

        const triggerPageTypes = this.extractPageTypesFromTrigger(trigger);

        if (triggerPageTypes.length > 0) {
          triggerPageConditions.push({
            triggerId,
            triggerName: trigger.name || triggerId,
            pageTypes: triggerPageTypes,
          });
          allAllowedPageTypes.push(...triggerPageTypes);
          source = 'trigger_filter';
          confidence = 90;
        } else {
          // 트리거에 페이지 필터가 없으면 트리거 이름에서 힌트 추출 시도
          const nameHintTypes = this.extractPageTypesFromTriggerName(trigger.name);
          if (nameHintTypes.length > 0) {
            triggerPageConditions.push({
              triggerId,
              triggerName: trigger.name || triggerId,
              pageTypes: nameHintTypes,
            });
            allAllowedPageTypes.push(...nameHintTypes);
            source = 'trigger_name';
            confidence = 75;
          }
        }
      }

      // 태그에서 사용하는 변수 분석 (보조 정보)
      const usedVariables = this.extractVariablesFromTag(tag);
      for (const varName of usedVariables) {
        const varPageTypes = this.inferPageTypesFromVariable(varName);
        if (varPageTypes.length > 0 && varPageTypes.length < ALL_PAGE_TYPES.length) {
          // 변수 의존성으로 페이지 타입 추론
          if (allAllowedPageTypes.length === 0) {
            allAllowedPageTypes.push(...varPageTypes);
            source = 'variable_dependency';
            confidence = 70;
          }
        }
      }

      allAllowedPageTypes = [...new Set(allAllowedPageTypes)] as PageType[];

      // 페이지 타입을 추출하지 못한 경우 모든 페이지에서 가능으로 설정
      if (allAllowedPageTypes.length === 0) {
        allAllowedPageTypes = [...ALL_PAGE_TYPES];
        confidence = 30;
      }

      // 기존 매핑이 있으면 병합
      const existing = mappings.get(eventName);
      if (existing) {
        // 페이지 타입 병합
        const mergedPageTypes = [...new Set([...existing.allowedPageTypes, ...allAllowedPageTypes])];
        existing.allowedPageTypes = mergedPageTypes as PageType[];
        existing.triggerPageConditions.push(...triggerPageConditions);
        // 더 높은 신뢰도 유지
        if (confidence > existing.confidence) {
          existing.confidence = confidence;
          existing.source = source;
        }
      } else {
        mappings.set(eventName, {
          eventName,
          allowedPageTypes: allAllowedPageTypes,
          source,
          confidence,
          triggerPageConditions,
        });
      }
    }

    this.cachedEventMappings = mappings;
    return mappings;
  }

  /**
   * 트리거 이름에서 페이지 타입 힌트를 추출합니다.
   */
  private extractPageTypesFromTriggerName(triggerName: string | undefined): PageType[] {
    if (!triggerName) return [];

    const pageTypes: PageType[] = [];
    for (const { pattern, pageTypes: types } of TRIGGER_NAME_PATTERNS) {
      if (pattern.test(triggerName)) {
        pageTypes.push(...types);
      }
    }
    return [...new Set(pageTypes)] as PageType[];
  }

  /**
   * 태그에서 이벤트 이름을 추출합니다.
   */
  private extractEventNameFromTag(tag: any): string | null {
    if (!tag.parameter) return null;

    for (const param of tag.parameter) {
      if (param.key === 'eventName') {
        return param.value;
      }
    }
    return null;
  }

  /**
   * 태그에서 사용하는 변수 목록을 추출합니다.
   */
  private extractVariablesFromTag(tag: any): string[] {
    const variables: string[] = [];
    const tagStr = JSON.stringify(tag);

    // {{변수명}} 패턴 추출
    const varPattern = /\{\{([^}]+)\}\}/g;
    let match;
    while ((match = varPattern.exec(tagStr)) !== null) {
      variables.push(`{{${match[1]}}}`);
    }

    return [...new Set(variables)];
  }

  /**
   * 변수 이름에서 페이지 타입을 추론합니다.
   */
  private inferPageTypesFromVariable(varName: string): PageType[] {
    for (const { pattern, pageTypes } of VARIABLE_NAME_PATTERNS) {
      if (pattern.test(varName)) {
        return pageTypes;
      }
    }
    return [];
  }

  /**
   * 모든 변수에 대한 페이지 매핑을 추출합니다.
   */
  extractVariablePageMappings(): Map<string, VariablePageMapping> {
    if (this.cachedVariableMappings) {
      return this.cachedVariableMappings;
    }

    const mappings = new Map<string, VariablePageMapping>();

    for (const [_, variable] of this.variables) {
      const varName = `{{${variable.name}}}`;
      const mapping = this.analyzeVariablePageContext(variable);

      if (mapping.allowedPageTypes.length > 0) {
        mappings.set(varName, mapping);
      }
    }

    this.cachedVariableMappings = mappings;
    return mappings;
  }

  /**
   * 변수의 페이지 컨텍스트를 분석합니다.
   */
  private analyzeVariablePageContext(variable: any): VariablePageMapping {
    const varName = `{{${variable.name}}}`;
    let allowedPageTypes: PageType[] = [];
    let source: 'trigger_filter' | 'variable_name' | 'inferred' = 'inferred';
    let confidence = 50;

    // 1. 변수 이름에서 페이지 힌트 추출
    for (const { pattern, pageTypes } of VARIABLE_NAME_PATTERNS) {
      if (pattern.test(variable.name)) {
        allowedPageTypes = [...new Set([...allowedPageTypes, ...pageTypes])];
        source = 'variable_name';
        confidence = 80;
      }
    }

    // 2. 이 변수를 사용하는 트리거 분석
    const usingTriggers = this.findTriggersUsingVariable(varName);
    for (const trigger of usingTriggers) {
      const triggerPageTypes = this.extractPageTypesFromTrigger(trigger);
      if (triggerPageTypes.length > 0) {
        allowedPageTypes = [...new Set([...allowedPageTypes, ...triggerPageTypes])];
        source = 'trigger_filter';
        confidence = 90;
      }
    }

    // 3. 공통 변수 판별 (Click, Page 관련)
    if (this.isCommonVariable(variable.name)) {
      allowedPageTypes = [...ALL_PAGE_TYPES];
      source = 'inferred';
      confidence = 100;
    }

    return {
      variableName: varName,
      allowedPageTypes: allowedPageTypes as PageType[],
      source,
      confidence
    };
  }

  /**
   * 공통 변수인지 확인합니다.
   */
  private isCommonVariable(varName: string): boolean {
    const commonPatterns = [
      /^Page\s*(URL|Path|Hostname|Title)/i,
      /^Click\s*(Element|URL|Text|ID|Classes|Target)/i,
      /^_event$/i,
      /^Event$/i,
      /^Container\s*ID/i,
      /^Debug\s*Mode/i,
      /^Random\s*Number/i,
    ];
    return commonPatterns.some(p => p.test(varName));
  }

  /**
   * 특정 변수를 사용하는 트리거 목록을 찾습니다.
   */
  private findTriggersUsingVariable(varName: string): any[] {
    const usingTriggers: any[] = [];

    for (const [_, trigger] of this.triggers) {
      const triggerStr = JSON.stringify(trigger);
      if (triggerStr.includes(varName)) {
        usingTriggers.push(trigger);
      }
    }

    return usingTriggers;
  }

  /**
   * 특정 이벤트가 특정 페이지에서 발생 가능한지 확인합니다.
   *
   * @param eventName 이벤트 이름
   * @param pageType 페이지 타입
   * @returns 발생 가능 여부와 이유
   */
  isEventAllowedOnPage(eventName: string, pageType: PageType): { allowed: boolean; reason?: string; confidence: number } {
    const mappings = this.extractEventPageMappings();
    const mapping = mappings.get(eventName);

    if (!mapping) {
      // 매핑 정보가 없으면 기본적으로 허용 (낮은 신뢰도)
      return {
        allowed: true,
        reason: `GTM에 ${eventName} 이벤트 매핑 정보 없음 - 기본 허용`,
        confidence: 30
      };
    }

    // 모든 페이지에서 허용
    if (mapping.allowedPageTypes.length === ALL_PAGE_TYPES.length) {
      return {
        allowed: true,
        reason: '모든 페이지에서 발생 가능',
        confidence: mapping.confidence
      };
    }

    // 특정 페이지만 허용
    if (mapping.allowedPageTypes.includes(pageType)) {
      return {
        allowed: true,
        reason: `GTM 트리거 조건: ${mapping.allowedPageTypes.join(', ')} 페이지에서 허용`,
        confidence: mapping.confidence
      };
    }

    return {
      allowed: false,
      reason: `GTM 트리거 조건: ${mapping.allowedPageTypes.join(', ')} 페이지에서만 허용 (현재: ${pageType})`,
      confidence: mapping.confidence
    };
  }

  /**
   * 전체 매핑 결과를 반환합니다.
   */
  extractAll(): {
    variableMappings: Map<string, VariablePageMapping>;
    eventMappings: Map<string, EventPageMapping>;
  } {
    return {
      variableMappings: this.extractVariablePageMappings(),
      eventMappings: this.extractEventPageMappings()
    };
  }

  /**
   * 디버깅용: 추출된 이벤트-페이지 매핑을 콘솔에 출력합니다.
   */
  printEventMappings(): void {
    const mappings = this.extractEventPageMappings();

    console.log('\n=== GTM 동적 이벤트-페이지 매핑 ===\n');

    for (const [eventName, mapping] of mappings) {
      console.log(`${eventName}:`);
      console.log(`  허용 페이지: ${mapping.allowedPageTypes.join(', ')}`);
      console.log(`  소스: ${mapping.source} (신뢰도: ${mapping.confidence}%)`);
      if (mapping.triggerPageConditions.length > 0) {
        console.log(`  트리거:`);
        for (const tc of mapping.triggerPageConditions) {
          console.log(`    - ${tc.triggerName}: ${tc.pageTypes.join(', ')}`);
        }
      }
      console.log('');
    }
  }

  /**
   * GTM에서 Content Group lookup table을 추출합니다.
   * "LT - Content Group" 변수에서 AP_DATA_PAGETYPE 값과 매핑된 Content Group 값을 추출합니다.
   *
   * @returns Map<입력값, 매핑된 페이지타입> (예: "main" -> "MAIN", "prd" -> "PRODUCT_DETAIL")
   */
  extractContentGroupLookupTable(): Map<string, string> {
    const lookupTable = new Map<string, string>();

    for (const [_, variable] of this.variables) {
      // Lookup Table (smm) 타입이면서 Content Group 관련 변수 찾기
      if (variable.type === 'smm' && variable.name?.toLowerCase().includes('content group')) {
        const mapParam = variable.parameter?.find((p: any) => p.key === 'map');
        if (mapParam && mapParam.list) {
          for (const item of mapParam.list) {
            if (item.type === 'MAP' && item.map) {
              const keyParam = item.map.find((m: any) => m.key === 'key');
              const valueParam = item.map.find((m: any) => m.key === 'value');

              if (keyParam?.value && valueParam?.value) {
                lookupTable.set(keyParam.value, valueParam.value);
              }
            }
          }
        }
      }
    }

    return lookupTable;
  }

  /**
   * GTM Content Group lookup table에 정의된 페이지 타입 목록을 반환합니다.
   *
   * @returns 정의된 페이지 타입 목록
   */
  getDefinedPageTypesInGTM(): string[] {
    const lookupTable = this.extractContentGroupLookupTable();
    return [...new Set(lookupTable.values())];
  }

  /**
   * 특정 AP_DATA_PAGETYPE 값이 GTM에서 어떻게 매핑되는지 확인합니다.
   *
   * @param apDataPageType AP_DATA_PAGETYPE 값 (예: "main", "prd", "prds")
   * @returns 매핑된 Content Group 값 또는 undefined
   */
  getMappedContentGroup(apDataPageType: string): string | undefined {
    const lookupTable = this.extractContentGroupLookupTable();
    return lookupTable.get(apDataPageType);
  }
}
