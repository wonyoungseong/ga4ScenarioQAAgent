export interface ClickableElement {
  selector: string;
  tagName: string;
  text: string;
  href?: string;
  className: string;
  id: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  hasClickListener: boolean;
  elementType: 'product' | 'promotion' | 'navigation' | 'button' | 'link' | 'other';
}

export interface EventCondition {
  eventName: string;
  description: string;
  triggerCondition: string;
}

export interface Scenario {
  id: string;
  eventName: string;
  shouldFire: boolean;
  action: string;
  element: ClickableElement;
  reason: string;
}

export interface AnalysisResult {
  url: string;
  timestamp: string;
  screenshotPath: string;
  eventName: string;
  clickableElements: ClickableElement[];
  scenarios: {
    shouldFire: Scenario[];
    shouldNotFire: Scenario[];
  };
}

export interface EventConfig {
  name: string;
  description: string;
  keywords: string[];
  excludeKeywords: string[];
  elementTypes: string[];
}

export const EVENT_CONFIGS: Record<string, EventConfig> = {
  SELECT_ITEM: {
    name: 'SELECT_ITEM',
    description: '제품을 선택했을 때 발생',
    keywords: ['product', 'item', 'prd', '상품', '제품', 'goods', 'card'],
    excludeKeywords: ['promo', 'banner', 'promotion', 'campaign', 'nav', 'menu', 'filter', 'category'],
    elementTypes: ['product']
  },
  SELECT_PROMOTION: {
    name: 'SELECT_PROMOTION',
    description: '프로모션을 선택했을 때 발생',
    keywords: ['promo', 'banner', 'promotion', 'campaign', 'event', 'sale', '할인', '이벤트'],
    excludeKeywords: ['product', 'item', 'prd'],
    elementTypes: ['promotion']
  },
  VIEW_ITEM: {
    name: 'VIEW_ITEM',
    description: '제품 상세 페이지를 볼 때 발생',
    keywords: ['detail', 'view', 'product'],
    excludeKeywords: [],
    elementTypes: ['product']
  },
  ADD_TO_CART: {
    name: 'ADD_TO_CART',
    description: '장바구니에 담을 때 발생',
    keywords: ['cart', 'basket', 'bag', '장바구니', '담기', 'add'],
    excludeKeywords: [],
    elementTypes: ['button']
  }
};
