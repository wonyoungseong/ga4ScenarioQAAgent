/**
 * 사이트별 이벤트 설정
 *
 * GA4 API에서 수집된 실제 이벤트를 기반으로
 * Vision AI 예측 정확도를 높이기 위한 설정
 */

export interface SiteEventConfig {
  siteId: string;
  siteName: string;
  domain: string;

  /** 표준 GA4 이벤트 */
  standardEvents: StandardEventConfig[];

  /** 사이트 커스텀 이벤트 */
  customEvents: CustomEventConfig[];

  /** 페이지 타입별 예상 이벤트 */
  pageTypeEvents: Record<string, string[]>;
}

export interface StandardEventConfig {
  eventName: string;
  description: string;
  triggers: string[];
  parameters: EventParameter[];
}

export interface CustomEventConfig {
  eventName: string;
  description: string;
  triggers: string[];
  parameters: EventParameter[];
  /** 어떤 페이지 타입에서 발생하는지 */
  pageTypes: string[];
}

export interface EventParameter {
  key: string;
  description: string;
  valueType: 'string' | 'number' | 'boolean' | 'array';
  required: boolean;
  extractionHint?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 아모레몰 사이트 설정
// ═══════════════════════════════════════════════════════════════════════════

export const AMOREMALL_CONFIG: SiteEventConfig = {
  siteId: 'amoremall',
  siteName: '아모레몰',
  domain: 'amoremall.com',

  standardEvents: [
    {
      eventName: 'page_view',
      description: '페이지 조회',
      triggers: ['페이지 로드'],
      parameters: [
        { key: 'page_title', description: '페이지 제목', valueType: 'string', required: true, extractionHint: '브라우저 탭 또는 페이지 헤더' },
        { key: 'page_location', description: '페이지 URL', valueType: 'string', required: true, extractionHint: 'URL 주소' },
      ],
    },
    {
      eventName: 'view_item_list',
      description: '상품 목록 조회',
      triggers: ['상품 목록이 화면에 노출'],
      parameters: [
        { key: 'item_list_id', description: '목록 ID', valueType: 'string', required: false, extractionHint: '페이지 타입 기반' },
        { key: 'item_list_name', description: '목록 이름', valueType: 'string', required: false, extractionHint: '카테고리명 또는 검색어' },
        { key: 'items', description: '상품 배열', valueType: 'array', required: true, extractionHint: '화면에 보이는 상품들' },
      ],
    },
    {
      eventName: 'view_item',
      description: '상품 상세 조회',
      triggers: ['상품 상세 페이지 로드'],
      parameters: [
        { key: 'currency', description: '통화', valueType: 'string', required: true, extractionHint: 'KRW' },
        { key: 'value', description: '가격', valueType: 'number', required: true, extractionHint: '상품 가격' },
        { key: 'items', description: '상품 배열', valueType: 'array', required: true, extractionHint: '상품 정보' },
      ],
    },
    {
      eventName: 'select_item',
      description: '상품 선택 (클릭)',
      triggers: ['상품 목록에서 상품 클릭'],
      parameters: [
        { key: 'item_list_id', description: '목록 ID', valueType: 'string', required: false },
        { key: 'item_list_name', description: '목록 이름', valueType: 'string', required: false },
        { key: 'items', description: '선택한 상품', valueType: 'array', required: true },
      ],
    },
    {
      eventName: 'add_to_cart',
      description: '장바구니 추가',
      triggers: ['장바구니 담기 버튼 클릭'],
      parameters: [
        { key: 'currency', description: '통화', valueType: 'string', required: true },
        { key: 'value', description: '금액', valueType: 'number', required: true },
        { key: 'items', description: '상품 배열', valueType: 'array', required: true },
      ],
    },
    {
      eventName: 'begin_checkout',
      description: '결제 시작',
      triggers: ['결제 페이지 진입'],
      parameters: [
        { key: 'currency', description: '통화', valueType: 'string', required: true },
        { key: 'value', description: '총 금액', valueType: 'number', required: true },
        { key: 'coupon', description: '쿠폰', valueType: 'string', required: false },
        { key: 'items', description: '상품 배열', valueType: 'array', required: true },
      ],
    },
    {
      eventName: 'purchase',
      description: '구매 완료',
      triggers: ['주문 완료'],
      parameters: [
        { key: 'transaction_id', description: '주문번호', valueType: 'string', required: true },
        { key: 'value', description: '총 금액', valueType: 'number', required: true },
        { key: 'currency', description: '통화', valueType: 'string', required: true },
        { key: 'items', description: '상품 배열', valueType: 'array', required: true },
      ],
    },
    {
      eventName: 'view_promotion',
      description: '프로모션 노출',
      triggers: ['프로모션 배너 화면 노출'],
      parameters: [
        { key: 'promotion_id', description: '프로모션 ID', valueType: 'string', required: false },
        { key: 'promotion_name', description: '프로모션명', valueType: 'string', required: false },
        { key: 'creative_name', description: '배너 이름', valueType: 'string', required: false },
      ],
    },
    {
      eventName: 'select_promotion',
      description: '프로모션 클릭',
      triggers: ['프로모션 배너 클릭'],
      parameters: [
        { key: 'promotion_id', description: '프로모션 ID', valueType: 'string', required: false },
        { key: 'promotion_name', description: '프로모션명', valueType: 'string', required: false },
      ],
    },
    {
      eventName: 'scroll',
      description: '스크롤',
      triggers: ['페이지 스크롤 25%, 50%, 75%, 90%'],
      parameters: [
        { key: 'percent_scrolled', description: '스크롤 비율', valueType: 'number', required: true },
      ],
    },
  ],

  customEvents: [
    // 아모레퍼시픽 커스텀 이벤트
    {
      eventName: 'ap_click',
      description: '아모레퍼시픽 클릭 추적',
      triggers: ['모든 클릭 요소 (버튼, 링크, 상품 등)'],
      parameters: [
        { key: 'click_element', description: '클릭 요소', valueType: 'string', required: false },
        { key: 'click_text', description: '클릭 텍스트', valueType: 'string', required: false },
        { key: 'click_url', description: '이동 URL', valueType: 'string', required: false },
      ],
      pageTypes: ['ALL'],
    },
    {
      eventName: 'brand_product_click',
      description: '브랜드관 상품 클릭',
      triggers: ['브랜드 페이지에서 상품 클릭'],
      parameters: [
        { key: 'brand_name', description: '브랜드명', valueType: 'string', required: true, extractionHint: '브랜드 로고 또는 페이지 헤더' },
        { key: 'product_name', description: '상품명', valueType: 'string', required: true, extractionHint: '클릭한 상품명' },
        { key: 'product_price', description: '상품가격', valueType: 'number', required: false },
        { key: 'product_index', description: '상품 순서', valueType: 'number', required: false },
      ],
      pageTypes: ['BRAND_DETAIL', 'BRAND_HOME'],
    },
    {
      eventName: 'click_with_duration',
      description: '체류시간 포함 클릭',
      triggers: ['일정 시간 체류 후 클릭'],
      parameters: [
        { key: 'duration_seconds', description: '체류시간(초)', valueType: 'number', required: false },
        { key: 'click_element', description: '클릭 요소', valueType: 'string', required: false },
      ],
      pageTypes: ['ALL'],
    },
    {
      eventName: 'qualified_visit',
      description: '품질 방문 (10초 이상 체류)',
      triggers: ['페이지에서 10초 이상 체류'],
      parameters: [
        { key: 'event_action', description: '액션', valueType: 'string', required: false },
        { key: 'event_label', description: '라벨', valueType: 'string', required: false },
      ],
      pageTypes: ['ALL'],
    },
    {
      eventName: 'ap_timer_10s',
      description: '10초 타이머',
      triggers: ['페이지 로드 후 10초 경과'],
      parameters: [
        { key: 'timer_duration_sec', description: '타이머 시간', valueType: 'number', required: true },
      ],
      pageTypes: ['ALL'],
    },
    {
      eventName: 'screen_view',
      description: '화면 조회 (앱/웹)',
      triggers: ['화면 전환'],
      parameters: [
        { key: 'screen_name', description: '화면명', valueType: 'string', required: false },
        { key: 'screen_class', description: '화면 클래스', valueType: 'string', required: false },
      ],
      pageTypes: ['ALL'],
    },
    {
      eventName: 'view_search_results',
      description: '검색 결과 조회',
      triggers: ['검색 결과 페이지 로드'],
      parameters: [
        { key: 'search_term', description: '검색어', valueType: 'string', required: true, extractionHint: '검색창 또는 검색 결과 헤더' },
      ],
      pageTypes: ['SEARCH_RESULT'],
    },
    {
      eventName: 'naverpay',
      description: '네이버페이 클릭',
      triggers: ['네이버페이 버튼 클릭'],
      parameters: [
        { key: 'payment_type', description: '결제 타입', valueType: 'string', required: false },
      ],
      pageTypes: ['PRODUCT_DETAIL', 'CART', 'CHECKOUT'],
    },
    {
      eventName: 'custom_event',
      description: '기타 커스텀 이벤트',
      triggers: ['다양한 사용자 상호작용'],
      parameters: [
        { key: 'event_category', description: '이벤트 카테고리', valueType: 'string', required: false },
        { key: 'event_action', description: '이벤트 액션', valueType: 'string', required: false },
        { key: 'event_label', description: '이벤트 라벨', valueType: 'string', required: false },
      ],
      pageTypes: ['ALL'],
    },
  ],

  pageTypeEvents: {
    'BRAND_DETAIL': [
      'page_view',
      'screen_view',
      'view_item_list',
      'view_promotion',
      'select_promotion',
      'scroll',
      'ap_click',
      'brand_product_click',
      'click_with_duration',
      'qualified_visit',
      'ap_timer_10s',
    ],
    'BRAND_HOME': [
      'page_view',
      'screen_view',
      'view_item_list',
      'view_promotion',
      'select_promotion',
      'scroll',
      'ap_click',
      'brand_product_click',
      'qualified_visit',
    ],
    'PRODUCT_DETAIL': [
      'page_view',
      'screen_view',
      'view_item',
      'add_to_cart',
      'scroll',
      'ap_click',
      'click_with_duration',
      'qualified_visit',
      'naverpay',
    ],
    'PRODUCT_LIST': [
      'page_view',
      'screen_view',
      'view_item_list',
      'select_item',
      'scroll',
      'ap_click',
      'qualified_visit',
    ],
    'CART': [
      'page_view',
      'screen_view',
      'view_cart',
      'remove_from_cart',
      'begin_checkout',
      'ap_click',
      'naverpay',
    ],
    'CHECKOUT': [
      'page_view',
      'screen_view',
      'begin_checkout',
      'add_shipping_info',
      'add_payment_info',
      'ap_click',
      'naverpay',
    ],
    'ORDER_COMPLETE': [
      'page_view',
      'screen_view',
      'purchase',
      'ap_click',
    ],
    'SEARCH_RESULT': [
      'page_view',
      'screen_view',
      'view_search_results',
      'view_item_list',
      'select_item',
      'scroll',
      'ap_click',
    ],
    'HOME': [
      'page_view',
      'screen_view',
      'view_item_list',
      'view_promotion',
      'select_promotion',
      'scroll',
      'ap_click',
      'qualified_visit',
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 설정 조회 함수
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 사이트 설정을 가져옵니다
 */
export function getSiteConfig(siteId: string): SiteEventConfig | null {
  if (siteId === 'amoremall' || siteId.includes('amoremall')) {
    return AMOREMALL_CONFIG;
  }
  return null;
}

/**
 * 페이지 타입에 따른 예상 이벤트 목록을 가져옵니다
 */
export function getExpectedEventsForPageType(
  siteConfig: SiteEventConfig,
  pageType: string
): string[] {
  return siteConfig.pageTypeEvents[pageType] || [];
}

/**
 * Vision AI 프롬프트용 이벤트 설명을 생성합니다
 */
export function generateEventDescriptionForPrompt(siteConfig: SiteEventConfig): string {
  let prompt = '## 이 사이트에서 수집되는 GA4 이벤트 목록\n\n';

  prompt += '### 표준 GA4 이벤트\n';
  for (const event of siteConfig.standardEvents) {
    prompt += `- **${event.eventName}**: ${event.description}\n`;
    prompt += `  트리거: ${event.triggers.join(', ')}\n`;
  }

  prompt += '\n### 사이트 커스텀 이벤트\n';
  for (const event of siteConfig.customEvents) {
    prompt += `- **${event.eventName}**: ${event.description}\n`;
    prompt += `  트리거: ${event.triggers.join(', ')}\n`;
  }

  return prompt;
}

/**
 * 페이지 타입별 예상 이벤트 프롬프트를 생성합니다
 */
export function generatePageTypeEventsPrompt(
  siteConfig: SiteEventConfig,
  pageType: string
): string {
  const events = siteConfig.pageTypeEvents[pageType] || [];

  if (events.length === 0) {
    return '';
  }

  let prompt = `## 이 페이지 타입(${pageType})에서 예상되는 이벤트\n`;
  prompt += events.map(e => `- ${e}`).join('\n');

  return prompt;
}

export default AMOREMALL_CONFIG;
