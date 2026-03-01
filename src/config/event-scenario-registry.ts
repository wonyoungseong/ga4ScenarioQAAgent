/**
 * Event Scenario Registry
 *
 * 2차 QA 이벤트 시나리오 관리 파일.
 * GTM Parser가 시나리오를 생성할 때 이 파일의 정보를 참조합니다.
 *
 * 수정 시 영향 범위:
 *   1. FALLBACK_CUSTOM_EVENT_HINTS (source-authority.ts) — 이벤트 분류/셀렉터
 *   2. GA4_EVENT_PAGE_TYPE_KNOWLEDGE (source-authority.ts) — 페이지 타입 교정
 *   3. EXCEL_PAGE_TYPE_NORMALIZATION (gtm-parser.ts) — Excel→CG 매핑
 *   4. FORBIDDEN_EVENTS_BY_PAGE (gtm-parser.ts) — 금지 이벤트
 *   5. 이 파일의 레지스트리 — 이벤트 메타데이터/문서화
 *
 * 새 이벤트 추가 시:
 *   1. 이 파일에 EventScenarioMeta 엔트리 추가
 *   2. source-authority.ts에 FALLBACK_CUSTOM_EVENT_HINTS 엔트리 추가 (dataLayer 이벤트명 키)
 *   3. 필요 시 GA4_EVENT_PAGE_TYPE_KNOWLEDGE 엔트리 추가
 *   4. npx ts-node scripts/pre-crawl-diagnostic.ts 실행하여 확인
 */

import type { PageTypeEnum } from '../types/common';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export type EventTestability =
  | 'auto'          // 페이지 로드 시 자동 발생 → 시나리오 자동 생성
  | 'action'        // 사용자 액션 필요 → 셀렉터 기반 시나리오 생성
  | 'conditional'   // 특정 조건 필요 (유튜브 영상, 앱 push 등) → 시나리오 제외
  | 'manual_only';  // 실제 유저 행동 필요 (로그인, 결제 등) → 시나리오 제외

export type ScenarioInclusionStatus =
  | 'included'       // 시나리오에 포함됨
  | 'no_excel_url'   // Excel에 해당 페이지 URL 없음
  | 'manual_only'    // 자동 테스트 불가 (실제 유저 행동 필요)
  | 'conditional';   // 특수 조건 필요 (유튜브, 앱 push 등)

export interface EventScenarioMeta {
  /** GA4 이벤트명 */
  event_name: string;
  /** GTM 태그명 */
  gtm_tag_name: string;
  /** dataLayer 이벤트명 (CUSTOM_EVENT 트리거 필터값) */
  dataLayer_event?: string;
  /** GTM 트리거 타입 */
  trigger_type: string;
  /** 발생 조건 설명 (한국어) */
  fire_description: string;
  /** 테스트 가능성 */
  testability: EventTestability;
  /** 시나리오 포함 상태 */
  scenario_status: ScenarioInclusionStatus;
  /** 시나리오 미포함 사유 (scenario_status !== 'included'일 때) */
  exclusion_reason?: string;
  /** 발생 페이지 타입 */
  page_types: PageTypeEnum[];
  /** 셀렉터 (action 이벤트) */
  target_selector?: string;
  /** 비고 */
  notes?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Event Scenario Registry (innisfree-jp)
// ─────────────────────────────────────────────────────────────────────

export const EVENT_SCENARIO_REGISTRY: EventScenarioMeta[] = [
  // ═══ AUTO_FIRE (페이지 로드 시 자동 발생) ═══
  {
    event_name: 'page_view',
    gtm_tag_name: 'GA4 - Basic Event - Page View (Config)',
    trigger_type: 'googtag (GA4 Config)',
    fire_description: 'GA4 Config 태그(googtag)가 존재하면 모든 페이지에서 자동 발생',
    testability: 'auto',
    scenario_status: 'included',
    page_types: ['MAIN', 'PRODUCT_LIST', 'PRODUCT_DETAIL', 'EVENT_LIST', 'EVENT_DETAIL', 'SEARCH', 'CART', 'CHECKOUT', 'ORDER_COMPLETE', 'MY_PAGE', 'OTHERS'],
    notes: 'GA4 기본 이벤트. gaawc 또는 googtag 태그 존재 시 자동 등록.',
  },
  {
    event_name: 'page_load_time',
    gtm_tag_name: 'GA4 - Basic Event - Page Load Time',
    trigger_type: 'WINDOW_LOADED',
    fire_description: '페이지 완전 로드(Window Loaded) 시 자동 발생',
    testability: 'auto',
    scenario_status: 'included',
    page_types: ['MAIN', 'PRODUCT_LIST', 'PRODUCT_DETAIL', 'EVENT_LIST', 'EVENT_DETAIL', 'SEARCH', 'CART', 'CHECKOUT', 'ORDER_COMPLETE', 'MY_PAGE', 'OTHERS'],
  },
  {
    event_name: 'view_promotion',
    gtm_tag_name: 'GA4 - Ecommerce - View Promotion',
    trigger_type: 'DOM_READY',
    fire_description: 'MAIN 페이지 DOM Ready 시 프로모션 배너 노출 이벤트',
    testability: 'auto',
    scenario_status: 'included',
    page_types: ['MAIN'],
  },
  {
    event_name: 'view_promotion_detail',
    gtm_tag_name: 'GA4 - Ecommerce - View Promotion Detail',
    trigger_type: 'DOM_READY',
    fire_description: 'EVENT_DETAIL 페이지 DOM Ready 시 이벤트 상세 노출',
    testability: 'auto',
    scenario_status: 'included',
    page_types: ['EVENT_DETAIL'],
  },
  {
    event_name: 'view_item',
    gtm_tag_name: 'GA4 - Ecommerce - View Item',
    dataLayer_event: 'product',
    trigger_type: 'CUSTOM_EVENT',
    fire_description: 'PRODUCT_DETAIL 페이지 로드 시 dataLayer.push({event:"product"}) 발생',
    testability: 'auto',
    scenario_status: 'included',
    page_types: ['PRODUCT_DETAIL'],
  },
  {
    event_name: 'view_item_list',
    gtm_tag_name: 'GA4 - Ecommerce - View Item List on SERP',
    dataLayer_event: 'ap_search',
    trigger_type: 'CUSTOM_EVENT',
    fire_description: 'PRODUCT_LIST, SEARCH 페이지 로드 시 dataLayer.push({event:"ap_search"}) 발생',
    testability: 'auto',
    scenario_status: 'included',
    page_types: ['PRODUCT_LIST', 'SEARCH'],
  },
  {
    event_name: 'view_search_results',
    gtm_tag_name: 'GA4 - Basic Event - View Search Results',
    dataLayer_event: 'ap_search',
    trigger_type: 'CUSTOM_EVENT',
    fire_description: 'SEARCH 페이지에서 검색 결과 노출 시 dataLayer.push({event:"ap_search"}) + Content Group=SEARCH_RESULT 조건',
    testability: 'auto',
    scenario_status: 'included',
    page_types: ['SEARCH'],
    notes: 'view_item_list과 같은 dataLayer event(ap_search)를 공유하나, Content Group 필터로 SEARCH_RESULT 페이지에서만 발생',
  },

  // ═══ ACTION (사용자 액션 필요) ═══
  {
    event_name: 'click_with_duration',
    gtm_tag_name: 'GA4 - Basic Event - Click with Duration',
    dataLayer_event: 'click_with_duration',
    trigger_type: 'CUSTOM_EVENT',
    fire_description: 'a태그 클릭 시 클릭 지속시간 측정. MAIN, PRODUCT_DETAIL, EVENT_DETAIL에서 발생',
    testability: 'conditional',
    scenario_status: 'conditional',
    exclusion_reason: 'GTM 커스텀 JS가 mousedown/mouseup 지속시간을 측정하여 dataLayer push. Playwright 합성 클릭으로는 트리거 불가.',
    page_types: ['MAIN', 'PRODUCT_DETAIL', 'EVENT_DETAIL'],
    target_selector: 'a[href]',
    notes: 'GTM 트리거에 Content Group 필터 없음. 실제로는 특정 페이지에서만 발생. 자동 테스트 불가 (클릭 지속시간 측정 필요).',
  },
  {
    event_name: 'scroll',
    gtm_tag_name: 'GA4 - Basic Event - Scroll',
    trigger_type: 'SCROLL_DEPTH',
    fire_description: '스크롤 깊이 임계값 도달 시 발생 (MAIN, PRODUCT_DETAIL, EVENT_DETAIL)',
    testability: 'action',
    scenario_status: 'included',
    page_types: ['MAIN', 'PRODUCT_DETAIL', 'EVENT_DETAIL'],
    notes: 'scroll 이벤트는 셀렉터 불필요. Action Collector가 window.scrollTo()로 트리거.',
  },
  {
    event_name: 'select_promotion',
    gtm_tag_name: 'GA4 - Ecommerce - Select Promotion',
    trigger_type: 'LINK_CLICK',
    fire_description: 'MAIN 페이지 프로모션 배너(a[ap-data-promotion]) 클릭 시',
    testability: 'action',
    scenario_status: 'included',
    page_types: ['MAIN'],
    target_selector: 'a[ap-data-promotion]',
  },
  {
    event_name: 'ap_click',
    gtm_tag_name: 'GA4 - Basic Event - AP Click',
    dataLayer_event: 'commonEvent',
    trigger_type: 'CUSTOM_EVENT',
    fire_description: '[ap-click-area] 속성이 있는 요소 클릭 시 dataLayer.push({event:"commonEvent"}) 발생',
    testability: 'action',
    scenario_status: 'included',
    page_types: ['MAIN', 'PRODUCT_LIST', 'PRODUCT_DETAIL', 'EVENT_LIST', 'EVENT_DETAIL', 'SEARCH', 'CART', 'CHECKOUT', 'ORDER_COMPLETE', 'MY_PAGE', 'OTHERS'],
    target_selector: '[ap-click-area]',
  },
  {
    event_name: 'add_to_cart',
    gtm_tag_name: 'GA4 - Ecommerce - Add to Cart',
    dataLayer_event: 'addcart',
    trigger_type: 'CUSTOM_EVENT',
    fire_description: '장바구니 담기 버튼 클릭 시 dataLayer.push({event:"addcart"}) 발생',
    testability: 'action',
    scenario_status: 'included',
    page_types: ['PRODUCT_LIST', 'PRODUCT_DETAIL'],
    target_selector: '[data-action="add-to-cart"], .add-to-cart, button[name="add"], #AddToCart, .product-form__submit',
  },
  {
    event_name: 'begin_checkout',
    gtm_tag_name: 'GA4 - Ecommerce - Begin Checkout',
    dataLayer_event: '^cart$|purchasecartbtn|purchaseprdbtn|purchaseplpbtn|order|orderbtn',
    trigger_type: 'CUSTOM_EVENT',
    fire_description: '결제/주문 버튼 클릭 시 발생 (PRODUCT_LIST, PRODUCT_DETAIL, CART)',
    testability: 'action',
    scenario_status: 'included',
    page_types: ['PRODUCT_LIST', 'PRODUCT_DETAIL', 'CART'],
    target_selector: '[name="checkout"], .checkout-button, a[href*="checkout"]',
  },
  {
    event_name: 'select_item',
    gtm_tag_name: 'GA4 - Ecommerce - Select Item',
    dataLayer_event: 'select_item',
    trigger_type: 'CUSTOM_EVENT',
    fire_description: '상품 카드 클릭 시 dataLayer.push({event:"select_item"}) 발생',
    testability: 'action',
    scenario_status: 'included',
    page_types: ['PRODUCT_LIST', 'SEARCH'],
    target_selector: '.product-card a, .product-item a, [data-product-id] a',
  },
  {
    event_name: 'write_review',
    gtm_tag_name: 'GA4 - Basic Event - Write Review',
    dataLayer_event: 'review',
    trigger_type: 'CUSTOM_EVENT',
    fire_description: 'PRODUCT_DETAIL 페이지 리뷰 작성 버튼 클릭 시',
    testability: 'conditional',
    scenario_status: 'conditional',
    exclusion_reason: '사이트에 리뷰 기능 미적용 상태. 리뷰 버튼이 존재하지 않음.',
    page_types: ['PRODUCT_DETAIL'],
    target_selector: '.review-button, [data-action="review"], .write-review',
  },

  // ═══ SYNTHETIC (합성 시나리오로 포함) ═══
  {
    event_name: 'remove_from_cart',
    gtm_tag_name: 'GA4 - Ecommerce - Remove from Cart',
    dataLayer_event: 'removeCart',
    trigger_type: 'CUSTOM_EVENT',
    fire_description: 'CART 페이지/슬라이드에서 X 버튼으로 상품 제거 시 dataLayer.push({event:"removeCart"}) 발생',
    testability: 'action',
    scenario_status: 'included',
    page_types: ['CART'],
    target_selector: '.cart-remove, [data-action="remove"], .remove-item',
    notes: 'Excel에 CART URL 없음 → SYNTHETIC_SCENARIO_CONFIGS로 합성 시나리오 자동 생성',
  },

  // ═══ MANUAL_ONLY (실제 유저 행동 필요) ═══
  {
    event_name: 'login',
    gtm_tag_name: 'GA4 - Basic Event - Login',
    dataLayer_event: 'login_complete',
    trigger_type: 'CUSTOM_EVENT',
    fire_description: '유저가 로그인을 완료했을 때 dataLayer.push({event:"login_complete"}) 발생',
    testability: 'manual_only',
    scenario_status: 'manual_only',
    exclusion_reason: '실제 로그인 완료 필요. 현재 테스트 사이트에서는 미발생.',
    page_types: ['MY_PAGE', 'OTHERS'],
  },
  {
    event_name: 'withdrawal',
    gtm_tag_name: 'GA4 - Basic Event - Withdrawal',
    dataLayer_event: 'withdrawal_complete',
    trigger_type: 'CUSTOM_EVENT',
    fire_description: '유저가 탈퇴했을 때 dataLayer.push({event:"withdrawal_complete"}) 발생',
    testability: 'manual_only',
    scenario_status: 'manual_only',
    exclusion_reason: '실제 회원탈퇴 완료 필요. 현재 테스트 사이트에서는 미발생.',
    page_types: ['MY_PAGE'],
  },
  {
    event_name: 'purchase',
    gtm_tag_name: 'GA4 - Ecommerce - Purchase',
    dataLayer_event: 'purchase',
    trigger_type: 'CUSTOM_EVENT',
    fire_description: '구매완료페이지 도달 시 dataLayer.push({event:"purchase"}) 발생',
    testability: 'manual_only',
    scenario_status: 'manual_only',
    exclusion_reason: '실제 구매 완료 필요. 현재는 액션을 전달하기 어려움.',
    page_types: ['ORDER_COMPLETE'],
  },
  {
    event_name: 'sign_up',
    gtm_tag_name: 'GA4 - Basic Event - Sign Up',
    dataLayer_event: 'sign_up_complete',
    trigger_type: 'CUSTOM_EVENT',
    fire_description: '유저가 회원가입을 완료했을 때 dataLayer.push({event:"sign_up_complete"}) 발생',
    testability: 'manual_only',
    scenario_status: 'manual_only',
    exclusion_reason: '실제 회원가입 완료 필요.',
    page_types: ['OTHERS'],
  },

  // ═══ CONDITIONAL (특수 조건 필요) ═══
  {
    event_name: 'custom_event',
    gtm_tag_name: 'GA4 - Basic Event - Custom Event',
    dataLayer_event: 'customEvent',
    trigger_type: 'CUSTOM_EVENT',
    fire_description: '앱 또는 외부에서 dataLayer.push({event:"customEvent"}) 시 발생',
    testability: 'conditional',
    scenario_status: 'conditional',
    exclusion_reason: '앱에서 push하는 커스텀 이벤트. 웹 크롤러로 트리거 불가.',
    page_types: ['MAIN', 'PRODUCT_LIST', 'PRODUCT_DETAIL', 'EVENT_LIST', 'EVENT_DETAIL', 'SEARCH', 'CART', 'CHECKOUT', 'ORDER_COMPLETE', 'MY_PAGE', 'OTHERS'],
  },
  {
    event_name: 'youtube_video',
    gtm_tag_name: 'GA4 - Basic Event - Video(YouTube)',
    trigger_type: 'YOU_TUBE_VIDEO',
    fire_description: '유저가 유튜브 영상을 시청했을 때 YouTube 트리거를 받아서 발생',
    testability: 'conditional',
    scenario_status: 'conditional',
    exclusion_reason: '페이지에 유튜브 영상이 임베드되어 있어야 하며, 영상 재생/일시정지 등 이벤트 필요.',
    page_types: ['MAIN', 'PRODUCT_LIST', 'PRODUCT_DETAIL', 'EVENT_LIST', 'EVENT_DETAIL', 'SEARCH', 'CART', 'CHECKOUT', 'ORDER_COMPLETE', 'MY_PAGE', 'OTHERS'],
    notes: 'GTM 변수 {{JS - YouTube Status for Event}}로 이벤트명 동적 결정. youtube_video로 정규화.',
  },
];

// ─────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────

/** 시나리오에 포함된 이벤트만 반환 */
export function getIncludedEvents(): EventScenarioMeta[] {
  return EVENT_SCENARIO_REGISTRY.filter(e => e.scenario_status === 'included');
}

/** 시나리오에서 제외된 이벤트와 사유 반환 */
export function getExcludedEvents(): EventScenarioMeta[] {
  return EVENT_SCENARIO_REGISTRY.filter(e => e.scenario_status !== 'included');
}

/** 특정 페이지 타입에서 테스트 가능한 이벤트 반환 */
export function getTestableEventsForPage(pageType: PageTypeEnum): EventScenarioMeta[] {
  return EVENT_SCENARIO_REGISTRY.filter(
    e => e.page_types.includes(pageType)
      && (e.testability === 'auto' || e.testability === 'action'),
  );
}

/** 레지스트리 요약 출력 */
export function printRegistrySummary(): void {
  const included = getIncludedEvents();
  const excluded = getExcludedEvents();

  console.log(`\n=== Event Scenario Registry ===`);
  console.log(`  총 이벤트: ${EVENT_SCENARIO_REGISTRY.length}개`);
  console.log(`  시나리오 포함: ${included.length}개 (auto: ${included.filter(e => e.testability === 'auto').length}, action: ${included.filter(e => e.testability === 'action').length})`);
  console.log(`  시나리오 미포함: ${excluded.length}개`);

  if (excluded.length > 0) {
    console.log(`\n  미포함 이벤트:`);
    for (const e of excluded) {
      console.log(`    [${e.scenario_status}] ${e.event_name}: ${e.exclusion_reason}`);
    }
  }
}
