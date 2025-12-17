import * as fs from 'fs';
import * as path from 'path';

// pdf-parse 1.1.1 사용
const pdfParse = require('pdf-parse');

/**
 * 개발가이드에서 파싱한 이벤트 정의
 */
export interface ParsedEventDefinition {
  /** 이벤트 이름 (예: select_item, view_item) */
  eventName: string;
  /** 개발 필수 여부 */
  required: boolean;
  /** 이벤트 전송 시점 설명 */
  firingCondition: string;
  /** 발생 가능한 페이지 타입 (파싱된 정보에서 추출) */
  allowedPageTypes: string[];
  /** 필요한 사용자 액션 여부 */
  requiresUserAction: boolean;
  /** 사용자 액션 타입 (click, scroll, submit 등) */
  userActionType?: string;
  /** 필요한 UI 요소 설명 */
  requiredUIElements: string[];
  /** 원본 텍스트 (디버깅용) */
  rawText?: string;
}

/**
 * 파싱 결과
 */
export interface DevelopmentGuideParseResult {
  /** 파싱된 이벤트 목록 */
  events: ParsedEventDefinition[];
  /** 파싱 성공 여부 */
  success: boolean;
  /** 에러 메시지 (있는 경우) */
  error?: string;
  /** 파싱 소스 파일 */
  sourceFile: string;
}

/**
 * 페이지 타입 키워드 매핑
 */
const PAGE_TYPE_KEYWORDS: Record<string, string[]> = {
  'MAIN': ['메인', '홈', 'main', 'home', '메인 페이지'],
  'BRAND_MAIN': ['브랜드 메인', '브랜드메인', 'brand main', '브랜드 홈'],
  'PRODUCT_DETAIL': ['상품 상세', '상세 페이지', 'product detail', 'PDP', '상품상세'],
  'PRODUCT_LIST': ['상품 리스트', '카테고리 페이지', 'category', '상품 카테고리', 'PLP', '리스트 페이지'],
  'SEARCH_RESULT': ['검색 결과', '검색결과', 'search result', 'SRP', '검색 페이지'],
  'CART': ['장바구니', 'cart', 'basket', '카트'],
  'ORDER': ['주문', 'order', 'checkout', '결제', '주문서', '주문 완료'],
  'MY': ['마이페이지', '마이 페이지', 'my page', 'mypage', '내 정보'],
  'EVENT_DETAIL': ['이벤트 상세', '프로모션 상세', 'event detail', 'promotion detail'],
  'EVENT_LIST': ['이벤트 리스트', '프로모션 리스트', 'event list'],
  'LIVE_DETAIL': ['라이브 상세', '라이브상세', 'live detail'],
  'LIVE_LIST': ['라이브 리스트', '라이브리스트', 'live list'],
  'OTHERS': ['기타', '그 외', 'others', '그외'],
};

/**
 * 개발가이드에서 파싱한 AP_DATA_PAGETYPE 정의
 */
export interface PageTypeDefinition {
  pageType: string;
  description: string;
  note?: string;
}

/**
 * 개발가이드에서 파싱한 전체 페이지 타입 정의
 */
export interface PageTypeDefinitions {
  pageTypes: PageTypeDefinition[];
  rawText?: string;
}

/**
 * GA4 E-commerce 표준 이벤트-페이지 매핑
 *
 * GTM 트리거와 개발가이드 PDF에서 페이지 정보를 추출하지 못한 경우
 * GA4 E-commerce 표준에 따라 fallback으로 사용합니다.
 *
 * 이 매핑은 Google Analytics 4 E-commerce 문서에 기반합니다:
 * https://developers.google.com/analytics/devguides/collection/ga4/ecommerce
 */
const GA4_ECOMMERCE_EVENT_PAGE_MAPPING: Record<string, string[]> = {
  // 상품 관련 이벤트
  'select_item': ['PRODUCT_LIST', 'SEARCH_RESULT'],  // 상품 목록에서 상품 클릭
  'view_item': ['PRODUCT_DETAIL'],  // 상품 상세 페이지 조회
  'view_item_list': ['PRODUCT_LIST', 'SEARCH_RESULT'],  // 상품 목록 조회

  // 장바구니 관련 이벤트
  'add_to_cart': ['PRODUCT_DETAIL', 'PRODUCT_LIST', 'SEARCH_RESULT'],  // 장바구니 추가
  'remove_from_cart': ['CART'],  // 장바구니에서 제거
  'view_cart': ['CART'],  // 장바구니 조회

  // 결제 관련 이벤트
  'begin_checkout': ['CART', 'PRODUCT_DETAIL'],  // 결제 시작 (장바구니 + 바로구매)
  'add_payment_info': ['ORDER'],  // 결제 정보 입력
  'add_shipping_info': ['ORDER'],  // 배송 정보 입력
  'purchase': ['ORDER'],  // 구매 완료

  // 위시리스트
  'add_to_wishlist': ['PRODUCT_DETAIL'],  // 위시리스트 추가

  // 검색
  'search': ['SEARCH_RESULT'],  // 검색 실행

  // 프로모션 이벤트 (모든 페이지에서 가능하지만 주로 메인/이벤트 페이지)
  'select_promotion': ['MAIN', 'EVENT_DETAIL', 'EVENT_LIST', 'PRODUCT_LIST', 'SEARCH_RESULT'],
  'view_promotion': ['MAIN', 'EVENT_DETAIL', 'EVENT_LIST', 'PRODUCT_LIST', 'SEARCH_RESULT'],
};

/**
 * 사용자 액션 키워드 매핑
 */
const USER_ACTION_KEYWORDS: Record<string, string[]> = {
  'click': ['클릭', '선택', 'click', '눌렀을', '터치'],
  'scroll': ['스크롤', 'scroll', '노출'],
  'submit': ['제출', 'submit', '완료', '전송'],
  'input': ['입력', 'input', '작성'],
  'load': ['로드', 'load', '완료', 'DOM'],
};

/**
 * 개발가이드 PDF 파서
 */
export class DevelopmentGuideParser {
  private pdfPath: string;

  constructor(pdfPath: string) {
    this.pdfPath = pdfPath;
  }

  /**
   * PDF를 파싱하여 이벤트 정의를 추출합니다.
   */
  async parse(): Promise<DevelopmentGuideParseResult> {
    try {
      const pdfBuffer = fs.readFileSync(this.pdfPath);
      const pdfData = await pdfParse(pdfBuffer);

      const text = pdfData.text;
      const events = this.extractEvents(text);

      return {
        events,
        success: true,
        sourceFile: this.pdfPath
      };
    } catch (error) {
      return {
        events: [],
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sourceFile: this.pdfPath
      };
    }
  }

  /**
   * PDF 텍스트에서 이벤트 정의를 추출합니다.
   */
  private extractEvents(text: string): ParsedEventDefinition[] {
    const events: ParsedEventDefinition[] = [];

    // 이벤트 블록 패턴: "• 이벤트 이름:" 또는 "이벤트 이름:" 으로 시작하는 섹션
    // 두 패턴 모두 지원
    const eventBlockPattern = /(?:•\s*)?이벤트\s*이름\s*:\s*([a-z_]+)([\s\S]*?)(?=(?:•\s*)?이벤트\s*이름\s*:|$)/gi;

    let match;
    while ((match = eventBlockPattern.exec(text)) !== null) {
      const eventName = match[1].trim();
      const eventBlock = match[2];

      const eventDef = this.parseEventBlock(eventName, eventBlock);
      if (eventDef) {
        events.push(eventDef);
      }
    }

    // 패턴이 안 맞을 경우 대체 패턴 시도
    if (events.length === 0) {
      const altEvents = this.extractEventsAlternative(text);
      events.push(...altEvents);
    }

    // 중복 이벤트 병합
    return this.mergeEvents(events);
  }

  /**
   * 동일한 이벤트명의 정의를 병합합니다.
   * 여러 페이지에서 발생할 수 있는 이벤트의 경우 allowedPageTypes를 합칩니다.
   */
  private mergeEvents(events: ParsedEventDefinition[]): ParsedEventDefinition[] {
    const eventMap = new Map<string, ParsedEventDefinition>();

    for (const event of events) {
      const existing = eventMap.get(event.eventName);
      if (existing) {
        // 페이지 타입 병합
        for (const pageType of event.allowedPageTypes) {
          if (!existing.allowedPageTypes.includes(pageType)) {
            existing.allowedPageTypes.push(pageType);
          }
        }
        // 필수 여부는 하나라도 true면 true
        existing.required = existing.required || event.required;
        // UI 요소 병합
        for (const ui of event.requiredUIElements) {
          if (!existing.requiredUIElements.includes(ui)) {
            existing.requiredUIElements.push(ui);
          }
        }
        // 발화 조건은 첫 번째 것 유지 (보통 가장 상세함)
        if (!existing.firingCondition && event.firingCondition) {
          existing.firingCondition = event.firingCondition;
        }
      } else {
        eventMap.set(event.eventName, { ...event });
      }
    }

    return Array.from(eventMap.values());
  }

  /**
   * 개별 이벤트 블록을 파싱합니다.
   */
  private parseEventBlock(eventName: string, block: string): ParsedEventDefinition | null {
    // 필수 여부 추출
    const requiredMatch = block.match(/개발\s*필수\s*여부\s*:\s*(Required|Optional|필수|선택)/i);
    const required = requiredMatch
      ? (requiredMatch[1].toLowerCase() === 'required' || requiredMatch[1] === '필수')
      : false;

    // 이벤트 전송 시점 추출
    const firingMatch = block.match(/이벤트\s*전송\s*시점\s*:\s*([^\n•]+)/i);
    const firingCondition = firingMatch ? firingMatch[1].trim() : '';

    if (!firingCondition) {
      return null;
    }

    // 허용된 페이지 타입 추출
    let allowedPageTypes = this.extractPageTypes(firingCondition);

    // PDF에서 페이지 타입을 추출하지 못한 경우 GA4 표준 매핑으로 fallback
    if (allowedPageTypes.length === 0) {
      const ga4Fallback = GA4_ECOMMERCE_EVENT_PAGE_MAPPING[eventName];
      if (ga4Fallback) {
        allowedPageTypes = [...ga4Fallback];
      }
    }

    // 사용자 액션 여부 및 타입 추출
    const { requiresUserAction, userActionType } = this.extractUserAction(firingCondition);

    // 필요한 UI 요소 추출
    const requiredUIElements = this.extractUIElements(firingCondition, eventName);

    return {
      eventName,
      required,
      firingCondition,
      allowedPageTypes,
      requiresUserAction,
      userActionType,
      requiredUIElements,
      rawText: block.substring(0, 500) // 디버깅용 원본 텍스트 일부
    };
  }

  /**
   * 발화 조건에서 페이지 타입을 추출합니다.
   */
  private extractPageTypes(firingCondition: string): string[] {
    const pageTypes: string[] = [];
    const lowerCondition = firingCondition.toLowerCase();

    for (const [pageType, keywords] of Object.entries(PAGE_TYPE_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lowerCondition.includes(keyword.toLowerCase())) {
          if (!pageTypes.includes(pageType)) {
            pageTypes.push(pageType);
          }
          break;
        }
      }
    }

    // "모든 페이지" 패턴 감지
    if (lowerCondition.includes('모든 페이지') || lowerCondition.includes('all page')) {
      return ['ALL'];
    }

    return pageTypes;
  }

  /**
   * 발화 조건에서 사용자 액션을 추출합니다.
   */
  private extractUserAction(firingCondition: string): { requiresUserAction: boolean; userActionType?: string } {
    const lowerCondition = firingCondition.toLowerCase();

    for (const [actionType, keywords] of Object.entries(USER_ACTION_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lowerCondition.includes(keyword.toLowerCase())) {
          // 'load'는 사용자 액션이 아님
          if (actionType === 'load') {
            return { requiresUserAction: false };
          }
          return { requiresUserAction: true, userActionType: actionType };
        }
      }
    }

    return { requiresUserAction: false };
  }

  /**
   * 발화 조건에서 필요한 UI 요소를 추출합니다.
   */
  private extractUIElements(firingCondition: string, eventName: string): string[] {
    const elements: string[] = [];

    // 이벤트별 UI 요소 힌트
    const eventUIHints: Record<string, string[]> = {
      'add_to_cart': ['장바구니 추가 버튼', '장바구니 담기 버튼', 'Add to Cart 버튼'],
      'select_item': ['상품 카드', '상품 썸네일', '상품 목록 아이템'],
      'view_item': ['상품 상세 정보', '상품 이미지', '상품 가격'],
      'view_item_list': ['상품 리스트', '상품 그리드', '검색 결과 목록'],
      'begin_checkout': ['결제하기 버튼', '주문하기 버튼'],
      'purchase': ['주문 완료 메시지', '결제 완료 확인'],
      'add_to_wishlist': ['찜하기 버튼', '위시리스트 버튼', '하트 아이콘'],
      'select_promotion': ['프로모션 배너', '이벤트 배너', '할인 배너'],
      'view_promotion': ['프로모션 영역', '이벤트 영역'],
      'search': ['검색 입력창', '검색 버튼', '검색 결과'],
    };

    if (eventUIHints[eventName]) {
      elements.push(...eventUIHints[eventName]);
    }

    // 발화 조건에서 추가 요소 추출
    if (firingCondition.includes('상품')) {
      if (!elements.includes('상품 정보')) {
        elements.push('상품 정보');
      }
    }
    if (firingCondition.includes('버튼')) {
      if (!elements.includes('관련 버튼')) {
        elements.push('관련 버튼');
      }
    }

    return elements;
  }

  /**
   * 대체 패턴으로 이벤트 추출 (PDF 구조가 다른 경우)
   */
  private extractEventsAlternative(text: string): ParsedEventDefinition[] {
    const events: ParsedEventDefinition[] = [];

    // 줄 단위로 분석
    const lines = text.split('\n');
    let currentEvent: Partial<ParsedEventDefinition> | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // 이벤트 이름 감지
      const eventNameMatch = line.match(/^([a-z_]+)\s*$/i) ||
                             line.match(/이벤트\s*(?:이름|명)\s*[:\-]?\s*([a-z_]+)/i);

      if (eventNameMatch) {
        // 이전 이벤트 저장
        if (currentEvent && currentEvent.eventName && currentEvent.firingCondition) {
          events.push(currentEvent as ParsedEventDefinition);
        }

        currentEvent = {
          eventName: eventNameMatch[1].toLowerCase(),
          required: false,
          firingCondition: '',
          allowedPageTypes: [],
          requiresUserAction: false,
          requiredUIElements: []
        };
        continue;
      }

      // 현재 이벤트가 있으면 속성 추출
      if (currentEvent) {
        // 필수 여부
        if (line.match(/Required/i)) {
          currentEvent.required = true;
        }

        // 전송 시점
        const firingMatch = line.match(/(?:전송\s*시점|발생\s*시점|Trigger)\s*[:\-]?\s*(.+)/i);
        if (firingMatch) {
          currentEvent.firingCondition = firingMatch[1].trim();
          currentEvent.allowedPageTypes = this.extractPageTypes(currentEvent.firingCondition);
          const actionResult = this.extractUserAction(currentEvent.firingCondition);
          currentEvent.requiresUserAction = actionResult.requiresUserAction;
          currentEvent.userActionType = actionResult.userActionType;
          currentEvent.requiredUIElements = this.extractUIElements(
            currentEvent.firingCondition,
            currentEvent.eventName || ''
          );
        }
      }
    }

    // 마지막 이벤트 저장
    if (currentEvent && currentEvent.eventName && currentEvent.firingCondition) {
      events.push(currentEvent as ParsedEventDefinition);
    }

    return events;
  }

  /**
   * 특정 이벤트의 정의를 가져옵니다.
   * PDF에 정의가 없으면 GA4 표준 매핑을 사용합니다.
   */
  async getEventDefinition(eventName: string): Promise<ParsedEventDefinition | null> {
    const result = await this.parse();
    if (result.success) {
      const found = result.events.find(e => e.eventName === eventName);
      if (found) {
        return found;
      }
    }

    // PDF에 없으면 GA4 표준 매핑으로 기본 정의 생성
    const ga4PageTypes = GA4_ECOMMERCE_EVENT_PAGE_MAPPING[eventName];
    if (ga4PageTypes) {
      return {
        eventName,
        required: false,
        firingCondition: `GA4 E-commerce 표준: ${ga4PageTypes.join(', ')} 페이지에서 발생`,
        allowedPageTypes: [...ga4PageTypes],
        requiresUserAction: ['select_item', 'add_to_cart', 'select_promotion'].includes(eventName),
        requiredUIElements: [],
      };
    }

    return null;
  }

  /**
   * GA4 E-commerce 표준 이벤트-페이지 매핑을 반환합니다.
   * GTM과 개발가이드에서 정보를 얻지 못한 경우 fallback으로 사용합니다.
   */
  static getGA4StandardMapping(eventName: string): string[] | undefined {
    return GA4_ECOMMERCE_EVENT_PAGE_MAPPING[eventName];
  }

  /**
   * 모든 GA4 E-commerce 표준 이벤트-페이지 매핑을 반환합니다.
   */
  static getAllGA4StandardMappings(): Record<string, string[]> {
    return { ...GA4_ECOMMERCE_EVENT_PAGE_MAPPING };
  }
}

/**
 * 개발가이드에서 이벤트 정의를 파싱하는 헬퍼 함수
 */
export async function parseDevGuide(pdfPath: string): Promise<DevelopmentGuideParseResult> {
  const parser = new DevelopmentGuideParser(pdfPath);
  return parser.parse();
}

/**
 * 기본 개발가이드 경로로 파싱
 */
export async function parseDefaultDevGuide(): Promise<DevelopmentGuideParseResult> {
  const defaultPath = path.join(
    process.cwd(),
    '[EC]+WEB+개발+가이드_GTM코드추가(Shopify)1.1.pdf'
  );
  return parseDevGuide(defaultPath);
}

/**
 * 공통 변수 appendix PDF에서 페이지 타입 정의를 파싱합니다.
 */
export async function parsePageTypeDefinitionsFromAppendix(pdfPath: string): Promise<PageTypeDefinitions> {
  try {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfData = await pdfParse(pdfBuffer);
    const text = pdfData.text;

    const pageTypes: PageTypeDefinition[] = [];

    // AP_DATA_PAGETYPE 테이블 패턴 매칭
    // 패턴: NO required value 정의
    const pageTypePattern = /(\d+)\s+(required|recommend)\s+(MAIN|BRAND_MAIN|PRODUCT_DETAIL|PRODUCT_LIST|SEARCH_RESULT|CART|ORDER|MY|EVENT_LIST|EVENT_DETAIL|LIVE_LIST|LIVE_DETAIL|OTHERS)\s*([^\d\n]+)?/gi;

    let match;
    while ((match = pageTypePattern.exec(text)) !== null) {
      const pageType = match[3].trim();
      const description = match[4]?.trim() || '';
      const required = match[2].toLowerCase() === 'required';

      // 중복 체크
      if (!pageTypes.find(p => p.pageType === pageType)) {
        pageTypes.push({
          pageType,
          description,
          note: required ? 'required' : 'recommend'
        });
      }
    }

    // 패턴 매칭 실패 시 하드코딩된 기본값 사용
    if (pageTypes.length === 0) {
      return {
        pageTypes: getDefaultPageTypeDefinitions(),
        rawText: text.substring(0, 1000)
      };
    }

    return {
      pageTypes,
      rawText: text.substring(0, 1000)
    };
  } catch (error) {
    console.error('Failed to parse appendix PDF:', error);
    return {
      pageTypes: getDefaultPageTypeDefinitions()
    };
  }
}

/**
 * 기본 페이지 타입 정의 (appendix PDF 파싱 실패 시 사용)
 */
function getDefaultPageTypeDefinitions(): PageTypeDefinition[] {
  return [
    { pageType: 'MAIN', description: '메인 페이지', note: 'required' },
    { pageType: 'BRAND_MAIN', description: '브랜드 메인 페이지 (AP몰만 해당)', note: 'recommend' },
    { pageType: 'PRODUCT_DETAIL', description: '상품 상세 페이지', note: 'required' },
    { pageType: 'PRODUCT_LIST', description: '상품 리스트 페이지', note: 'recommend' },
    { pageType: 'SEARCH_RESULT', description: '검색 결과 페이지', note: 'required' },
    { pageType: 'CART', description: '장바구니 페이지', note: 'recommend' },
    { pageType: 'ORDER', description: '주문서 페이지', note: 'recommend' },
    { pageType: 'MY', description: '마이 페이지', note: 'recommend' },
    { pageType: 'EVENT_LIST', description: '이벤트 리스트 페이지', note: 'recommend' },
    { pageType: 'EVENT_DETAIL', description: '이벤트 상세 페이지', note: 'required' },
    { pageType: 'LIVE_LIST', description: '라이브 리스트', note: 'recommend' },
    { pageType: 'LIVE_DETAIL', description: '라이브 상세 페이지', note: 'required' },
    { pageType: 'OTHERS', description: '그 외 모두', note: 'recommend' },
  ];
}

/**
 * 기본 공통 변수 appendix 경로로 페이지 타입 정의 파싱
 */
export async function parseDefaultAppendix(): Promise<PageTypeDefinitions> {
  const defaultPath = path.join(process.cwd(), '공통 변수 appendix.pdf');
  return parsePageTypeDefinitionsFromAppendix(defaultPath);
}

/**
 * GTM Content Group lookup table과 appendix 정의를 비교하여 불일치 감지
 */
export interface PageTypeMismatch {
  pageType: string;
  inAppendix: boolean;
  inGTM: boolean;
  appendixDescription?: string;
  gtmMappedFrom?: string;
}

/**
 * GTM lookup table 매핑과 appendix 정의 비교
 */
export function comparePageTypeMappings(
  appendixDefinitions: PageTypeDefinition[],
  gtmLookupTable: Map<string, string>
): PageTypeMismatch[] {
  const mismatches: PageTypeMismatch[] = [];
  const appendixTypes = new Set(appendixDefinitions.map(d => d.pageType));
  const gtmTypes = new Set(gtmLookupTable.values());

  // appendix에는 있지만 GTM에 없는 타입
  for (const def of appendixDefinitions) {
    if (!gtmTypes.has(def.pageType)) {
      mismatches.push({
        pageType: def.pageType,
        inAppendix: true,
        inGTM: false,
        appendixDescription: def.description
      });
    }
  }

  // GTM에는 있지만 appendix에 없는 타입
  for (const [key, value] of gtmLookupTable) {
    if (!appendixTypes.has(value)) {
      mismatches.push({
        pageType: value,
        inAppendix: false,
        inGTM: true,
        gtmMappedFrom: key
      });
    }
  }

  return mismatches;
}
