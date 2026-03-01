/**
 * Source Authority Module
 *
 * 4개 데이터 소스(GTM JSON, DevGuide PDF, Knowledge Base, Excel)에 대해
 * "어떤 소스가 어떤 필드의 권위자인지" 규칙을 정의합니다.
 *
 * 핵심 구분:
 *   GTM JSON   → 메커니즘 (HOW: 트리거 타입, 셀렉터, 파라미터)
 *   DevGuide   → 행동 (WHAT/WHEN/WHERE: 발생 조건, 페이지 타입, dataLayer 이벤트명)
 *   Knowledge  → 규칙 (SHOULD/SHOULDN'T: 발생해야/안 되는 상황)
 *   Excel      → 대상 (WHERE: 테스트 URL)
 *
 * @version 1.0
 */

import type { PageTypeEnum } from '../types/common';
import type { UserActionType, EventFireCondition, PrerequisiteActionStep } from '../types/event-scenario';
import type { GTMTriggerType } from '../types/gtm-container';
import type { DevGuideEventHint } from '../types/devguide';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

/** 데이터 소스 출처 */
export type SourceProvenance =
  | 'gtm_json'
  | 'devguide_pdf'
  | 'knowledge_base'
  | 'fallback_hint'
  | 'inferred'
  | 'recon_visual'
  | 'tester_confirmed'
  | 'knowledge_store';

/** 교차 검증 경고 */
export interface CrossReferenceWarning {
  /** 검증 ID ('CHECK_1_DL_MAPPING', 'CHECK_2_TIMING_COMPAT' 등) */
  check_id: string;
  /** 심각도 */
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  /** 이벤트명 */
  event_name: string;
  /** 경고 메시지 */
  message: string;
  /** GTM 측 값 */
  gtm_value?: unknown;
  /** DevGuide 측 값 */
  devguide_value?: unknown;
  /** 해결 방법 */
  resolution?: string;
}

/** 교차 검증 결과 */
export interface CrossReferenceResult {
  event_name: string;
  checks_passed: number;
  checks_warned: number;
  warnings: CrossReferenceWarning[];
}

/** GTM에서 추출한 사실 (순수 GTM 데이터만) */
export interface GTMEventFacts {
  event_name: string;
  tag_id: string;
  tag_name: string;
  gtm_trigger_type: GTMTriggerType;
  custom_event_name?: string;
  content_group_filter?: string;
  css_selector?: string;
  additional_filters: string[];
  /** GTM 태그에 설정된 파라미터 키 목록 */
  gtm_param_keys: string[];
}

/** DevGuide에서 추출한 사실 */
export interface DevGuideEventFacts {
  ga4_event_name: string;
  fire_timing: string;
  practical_fire: 'auto_fire' | 'user_action' | 'manual_only';
  inferred_page_types: PageTypeEnum[];
  action_type: UserActionType;
  testability: 'auto' | 'action' | 'conditional' | 'manual_only';
  dataLayer_event_names: string[];
  required_params?: string[];
}

/** 분류된 이벤트 (강화된 EventTriggerInfo 데이터) */
export interface ClassifiedEvent {
  event_name: string;
  /** GTM 트리거 메커니즘 (GTM 권위) */
  gtm_trigger_type: GTMTriggerType;
  /** 발생 조건 (DevGuide 권위 → 폴백: GTM 추론) */
  fire_condition: EventFireCondition;
  /** 테스트 가능성 (DevGuide 권위 → 폴백: GTM 추론) */
  testability: 'auto' | 'action' | 'conditional' | 'manual_only';
  /** 사용자 액션 타입 (DevGuide 권위 → 폴백: GTM 추론) */
  action_type: UserActionType;
  /** 추론된 페이지 타입 (DevGuide 권위 → 폴백: Content Group → 힌트) */
  inferred_page_types: PageTypeEnum[];
  /** DevGuide 원문 발생 시점 */
  devguide_fire_timing?: string;
  /** dataLayer push 이벤트명 (DevGuide 권위) */
  dataLayer_event_names?: string[];
  /** CUSTOM_EVENT 필터값 */
  custom_event_name?: string;
  /** Content Group 필터 */
  content_group_filter?: string;
  /** CSS 선택자 */
  css_selector?: string;
  /** 타겟 셀렉터 */
  target_selector?: string;
  /** 대기 시간 */
  wait_after_ms: number;
  /** 각 필드의 출처 추적 */
  _source_provenance: Record<string, SourceProvenance>;
  /** 교차 검증 경고 */
  cross_reference_warnings: CrossReferenceWarning[];
}

/** 폴백 힌트 데이터 */
export interface FallbackHintData {
  page_types: PageTypeEnum[];
  action_type: UserActionType;
  testability: 'auto' | 'action' | 'conditional' | 'manual_only';
  practical_fire: 'auto_fire' | 'user_action' | 'manual_only';
  target_selector?: string;
  wait_after_ms?: number;
  description?: string;
}

/**
 * Excel에 URL이 없는 페이지 타입에 대한 합성 시나리오 설정
 *
 * CG 규칙에 action_events가 있지만 Excel에 해당 페이지 URL이 없을 때,
 * 이 설정의 test_url로 합성 시나리오를 생성합니다.
 */
export interface SyntheticScenarioConfig {
  /** 대상 페이지 타입 */
  page_type: PageTypeEnum;
  /** 합성 테스트 URL */
  test_url: string;
  /** 전제조건 액션 (모든 액션 시나리오의 메인 액션 전에 실행) */
  prerequisite_actions?: PrerequisiteActionStep[];
  /** 설명 */
  description: string;
}

// ─────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────

/**
 * Excel에 URL이 없는 페이지 타입에 대한 합성 시나리오 설정
 *
 * CG 규칙에 action_events가 정의되어 있지만 Excel에 해당 페이지 URL이 없을 때,
 * 이 설정의 test_url로 합성 시나리오를 생성합니다.
 */
export const SYNTHETIC_SCENARIO_CONFIGS: SyntheticScenarioConfig[] = [
  {
    page_type: 'CART',
    test_url: 'https://www.innisfree.jp/cart',
    description: '장바구니 페이지 (Excel에 URL 없음, 합성 시나리오)',
  },
];

const ALL_PAGE_TYPES: PageTypeEnum[] = [
  'MAIN', 'PRODUCT_LIST', 'PRODUCT_DETAIL', 'EVENT_LIST', 'EVENT_DETAIL',
  'SEARCH', 'CART', 'CHECKOUT', 'ORDER_COMPLETE', 'MY_PAGE', 'OTHERS',
];

/** Content Group 값 → 페이지 타입 매핑 (단일 진실 소스) */
export const CONTENT_GROUP_TO_PAGE_TYPE: Record<string, PageTypeEnum> = {
  'main': 'MAIN',
  'MAIN': 'MAIN',
  'PRODUCT_LIST': 'PRODUCT_LIST',
  'PRODUCT_DETAIL': 'PRODUCT_DETAIL',
  'EVENT_LIST': 'EVENT_LIST',
  'EVENT_DETAIL': 'EVENT_DETAIL',
  'SEARCH': 'SEARCH',
  'SEARCH_RESULT': 'SEARCH',
  'CART': 'CART',
  'CHECKOUT': 'CHECKOUT',
  'ORDER_COMPLETE': 'ORDER_COMPLETE',
  'MY_PAGE': 'MY_PAGE',
  'OTHERS': 'OTHERS',
};

/**
 * 페이지 타입 → Content Group 값 역매핑 (자동 생성)
 *
 * CONTENT_GROUP_TO_PAGE_TYPE에서 자동 생성됩니다.
 * 여러 CG 값이 같은 PageType으로 매핑되는 경우 대문자 키를 우선합니다.
 */
export const PAGE_TYPE_TO_CONTENT_GROUP: Record<PageTypeEnum, string> = (() => {
  const result = {} as Record<PageTypeEnum, string>;
  for (const [cg, pt] of Object.entries(CONTENT_GROUP_TO_PAGE_TYPE)) {
    // 대문자 키를 우선 (예: 'MAIN' > 'main')
    if (!result[pt] || cg === cg.toUpperCase()) {
      result[pt] = cg;
    }
  }
  return result;
})();

/**
 * 하드코딩 폴백 힌트
 *
 * DevGuide PDF가 없을 때만 사용됩니다.
 * DevGuide가 있으면 항상 DevGuide가 우선합니다.
 *
 * 이 데이터는 innisfree JP 프로젝트 기준으로 작성되었으며,
 * 다른 프로젝트에서는 DevGuide PDF 파싱 결과를 사용해야 합니다.
 */
export const FALLBACK_CUSTOM_EVENT_HINTS: Record<string, FallbackHintData> = {
  // page_view: dataLayer event "ap_page_view" → CUSTOM_EVENT 트리거
  'ap_page_view': {
    page_types: [...ALL_PAGE_TYPES],
    action_type: 'page_load',
    testability: 'auto',
    practical_fire: 'auto_fire',
    description: '모든 페이지 DOM Ready 시 dataLayer.push({event: "ap_page_view"})',
  },
  // view_item: dataLayer event "product" → PDP 로드 시 자동 push
  'product': {
    page_types: ['PRODUCT_DETAIL'],
    action_type: 'page_load',
    testability: 'auto',
    practical_fire: 'auto_fire',
    description: 'PDP 페이지 로드 시 dataLayer.push({event: "product"})',
  },
  // view_item_list / view_search_results: dataLayer event "ap_search"
  'ap_search': {
    page_types: ['SEARCH', 'PRODUCT_LIST'],
    action_type: 'page_load',
    testability: 'auto',
    practical_fire: 'auto_fire',
    description: '검색/리스트 페이지 로드 시 dataLayer.push({event: "ap_search"})',
  },
  // add_to_cart: dataLayer event "addcart"
  'addcart': {
    page_types: ['PRODUCT_DETAIL', 'PRODUCT_LIST'],
    action_type: 'click',
    testability: 'action',
    practical_fire: 'user_action',
    target_selector: '[data-action="add-to-cart"], .add-to-cart, button[name="add"], #AddToCart, .product-form__submit',
    wait_after_ms: 3000,
    description: '장바구니 담기 버튼 클릭',
  },
  // remove_from_cart: dataLayer event "removeCart"
  'removeCart': {
    page_types: ['CART'],
    action_type: 'click',
    testability: 'action',
    practical_fire: 'user_action',
    target_selector: '.cart-remove, [data-action="remove"], .remove-item',
    wait_after_ms: 2000,
    description: '장바구니 삭제 버튼 클릭',
  },
  // begin_checkout: dataLayer event regex
  '^cart$|purchasecartbtn|purchaseprdbtn|purchaseplpbtn|order|orderbtn': {
    page_types: ['CART', 'PRODUCT_DETAIL', 'PRODUCT_LIST'],
    action_type: 'click',
    testability: 'action',
    practical_fire: 'user_action',
    target_selector: '[name="checkout"], .checkout-button, a[href*="checkout"]',
    wait_after_ms: 3000,
    description: '결제 버튼 클릭',
  },
  // select_item: dataLayer event "select_item"
  'select_item': {
    page_types: ['PRODUCT_LIST', 'SEARCH'],
    action_type: 'click',
    testability: 'action',
    practical_fire: 'user_action',
    target_selector: '.product-card a, .product-item a, [data-product-id] a',
    wait_after_ms: 3000,
    description: '상품 클릭',
  },
  // purchase: dataLayer event "purchase"
  'purchase': {
    page_types: ['ORDER_COMPLETE'],
    action_type: 'page_load',
    testability: 'manual_only',
    practical_fire: 'manual_only',
    description: '실제 구매 완료 필요 (자동 테스트 불가)',
  },
  // login: dataLayer event "login_complete"
  'login_complete': {
    page_types: ['MY_PAGE', 'OTHERS'],
    action_type: 'page_load',
    testability: 'manual_only',
    practical_fire: 'manual_only',
    description: '실제 로그인 완료 필요',
  },
  // sign_up: dataLayer event "sign_up_complete"
  'sign_up_complete': {
    page_types: ['OTHERS'],
    action_type: 'page_load',
    testability: 'manual_only',
    practical_fire: 'manual_only',
    description: '실제 회원가입 완료 필요',
  },
  // withdrawal: dataLayer event "withdrawal_complete"
  'withdrawal_complete': {
    page_types: ['MY_PAGE'],
    action_type: 'page_load',
    testability: 'manual_only',
    practical_fire: 'manual_only',
    description: '실제 회원탈퇴 완료 필요',
  },
  // write_review: dataLayer event "review"
  // [2026-02-19] 사이트에 리뷰 기능 미적용 상태 → conditional로 변경
  'review': {
    page_types: ['PRODUCT_DETAIL'],
    action_type: 'click',
    testability: 'conditional',
    practical_fire: 'user_action',
    target_selector: '.review-button, [data-action="review"], .write-review',
    wait_after_ms: 2000,
    description: '리뷰 작성 (사이트 미적용)',
  },
  // ap_click: dataLayer event "commonEvent"
  'commonEvent': {
    page_types: [...ALL_PAGE_TYPES],
    action_type: 'click',
    testability: 'action',
    practical_fire: 'user_action',
    target_selector: '[ap-click-area]',
    wait_after_ms: 2000,
    description: 'AP Click 커스텀 이벤트',
  },
  // click_with_duration: dataLayer event "click_with_duration"
  // [2026-02-19] mousedown/mouseup 지속시간 측정 필요 → Playwright 합성 클릭으로 트리거 불가
  'click_with_duration': {
    page_types: ['MAIN', 'EVENT_DETAIL', 'PRODUCT_DETAIL'],
    action_type: 'click',
    testability: 'conditional',
    practical_fire: 'user_action',
    target_selector: 'a[href]',
    wait_after_ms: 2000,
    description: 'a태그 클릭 시 클릭 지속시간 측정 이벤트 (자동 테스트 불가)',
  },
  // custom_event: dataLayer event "customEvent"
  'customEvent': {
    page_types: [...ALL_PAGE_TYPES],
    action_type: 'custom',
    testability: 'conditional',
    practical_fire: 'user_action',
    description: '커스텀 이벤트 (앱에서 push)',
  },
  // youtube_video: YouTube 트리거로 발생 (유저가 유튜브 영상 시청 시)
  'youtube_video': {
    page_types: [...ALL_PAGE_TYPES],
    action_type: 'view',
    testability: 'conditional',
    practical_fire: 'user_action',
    description: '유튜브 영상 시청 시 YouTube 트리거를 받아서 발생',
  },
};

/**
 * GA4 이벤트명 → 페이지 타입 지식 맵
 *
 * FALLBACK_CUSTOM_EVENT_HINTS는 dataLayer 이벤트명 기준이므로,
 * 같은 dataLayer 이벤트를 공유하는 GA4 이벤트(예: view_item_list, view_search_results → ap_search)를
 * 개별적으로 제한할 수 없습니다.
 *
 * 이 맵은 GA4 이벤트명 기준으로 페이지 타입을 제한하여:
 * 1. DOM_READY/WINDOW_LOADED 트리거의 ALL_PAGE_TYPES 기본값을 교정
 * 2. 같은 custom_event를 공유하는 GA4 이벤트 간 페이지 타입 분리
 *
 * 도메인 지식 출처:
 * - view_promotion: MAIN 히어로 배너 영역의 [ap-data-promotion] 속성 기반
 * - view_promotion_detail: EVENT_DETAIL 페이지에서만 발화 (다른 곳 발화 = 오류)
 * - view_item_list: 제품 리스트가 있는 PRODUCT_LIST, SEARCH 페이지
 * - view_search_results: SEARCH 페이지에서만 발화
 */
export const GA4_EVENT_PAGE_TYPE_KNOWLEDGE: Partial<Record<string, PageTypeEnum[]>> = {
  // auto_fire: 프로모션 관련
  'view_promotion': ['MAIN'],
  'view_promotion_detail': ['EVENT_DETAIL'],
  // auto_fire: 상품 리스트/검색
  'view_item_list': ['PRODUCT_LIST', 'SEARCH'],
  'view_search_results': ['SEARCH'],
  // action: select_promotion은 프로모션 배너 클릭
  'select_promotion': ['MAIN'],
  // action: click_with_duration은 a태그 클릭 시 MAIN, EVENT_DETAIL, PRODUCT_DETAIL에서 발생
  'click_with_duration': ['MAIN', 'EVENT_DETAIL', 'PRODUCT_DETAIL'],
  // youtube_video: 유튜브 영상 시청 시 발생 (모든 페이지에서 가능)
  'youtube_video': [...ALL_PAGE_TYPES],
};

// ─────────────────────────────────────────────────────────────────────
// Cross-Reference Validation
// ─────────────────────────────────────────────────────────────────────

/**
 * GTM과 DevGuide 간 교차 검증을 실행합니다.
 *
 * Check 1: GTM CUSTOM_EVENT 필터값 ↔ DevGuide dataLayer 이벤트명
 * Check 2: DevGuide fire_timing ↔ GTM trigger_type 호환성
 * Check 3: DevGuide page_types ↔ GTM Content Group 필터
 * Check 4: DevGuide required_params ↔ GTM 태그 파라미터
 */
export function crossValidateEvent(
  eventName: string,
  gtmFacts: GTMEventFacts,
  devGuideFacts: DevGuideEventFacts | undefined,
): CrossReferenceResult {
  const warnings: CrossReferenceWarning[] = [];
  let passed = 0;

  if (!devGuideFacts) {
    return { event_name: eventName, checks_passed: 0, checks_warned: 0, warnings: [] };
  }

  // ── Check 1: GTM CUSTOM_EVENT filter ↔ DevGuide dataLayer event names ──
  if (gtmFacts.gtm_trigger_type === 'CUSTOM_EVENT' && gtmFacts.custom_event_name) {
    const dlNames = devGuideFacts.dataLayer_event_names;
    if (dlNames.length > 0) {
      const gtmCE = gtmFacts.custom_event_name;
      // Check if GTM custom event filter matches any DevGuide dataLayer event name
      const isMatch = dlNames.some(dl => {
        // Handle regex patterns in GTM custom event filter
        if (gtmCE.includes('|') || gtmCE.startsWith('^')) {
          try {
            return new RegExp(gtmCE).test(dl);
          } catch {
            return gtmCE === dl;
          }
        }
        return gtmCE === dl;
      });

      if (isMatch) {
        passed++;
      } else {
        warnings.push({
          check_id: 'CHECK_1_DL_MAPPING',
          severity: 'CRITICAL',
          event_name: eventName,
          message: `GTM customEventFilter '${gtmCE}' does not match DevGuide dataLayer events [${dlNames.join(', ')}]`,
          gtm_value: gtmCE,
          devguide_value: dlNames,
          resolution: 'Verify dataLayer event name mapping between GTM trigger and DevGuide specification',
        });
      }
    } else {
      passed++; // No DevGuide DL names to check against
    }
  } else {
    passed++; // Not a CUSTOM_EVENT trigger, skip this check
  }

  // ── Check 2: DevGuide fire_timing ↔ GTM trigger_type compatibility ──
  const compatibility = checkTimingCompatibility(
    gtmFacts.gtm_trigger_type,
    devGuideFacts.fire_timing,
    devGuideFacts.practical_fire,
  );

  if (compatibility.compatible) {
    passed++;
    if (compatibility.note) {
      warnings.push({
        check_id: 'CHECK_2_TIMING_COMPAT',
        severity: 'INFO',
        event_name: eventName,
        message: compatibility.note,
        gtm_value: gtmFacts.gtm_trigger_type,
        devguide_value: devGuideFacts.fire_timing,
      });
    }
  } else {
    warnings.push({
      check_id: 'CHECK_2_TIMING_COMPAT',
      severity: 'WARNING',
      event_name: eventName,
      message: compatibility.note || `GTM trigger type '${gtmFacts.gtm_trigger_type}' conflicts with DevGuide fire_timing '${devGuideFacts.fire_timing}'`,
      gtm_value: gtmFacts.gtm_trigger_type,
      devguide_value: devGuideFacts.fire_timing,
      resolution: 'DevGuide fire_timing describes dataLayer push timing, GTM trigger_type describes listening mechanism. Verify they are compatible.',
    });
  }

  // ── Check 3: DevGuide page_types ↔ GTM Content Group filter ──
  if (gtmFacts.content_group_filter) {
    const gtmPageTypes = parseContentGroupFilter(gtmFacts.content_group_filter);
    const dgPageTypes = new Set(devGuideFacts.inferred_page_types);

    if (gtmPageTypes.size > 0 && dgPageTypes.size > 0) {
      const intersection = new Set([...gtmPageTypes].filter(pt => dgPageTypes.has(pt)));
      if (intersection.size > 0) {
        passed++;
        if (intersection.size < gtmPageTypes.size || intersection.size < dgPageTypes.size) {
          warnings.push({
            check_id: 'CHECK_3_PAGE_TYPE',
            severity: 'WARNING',
            event_name: eventName,
            message: `Partial page type overlap: GTM [${[...gtmPageTypes].join(',')}] vs DevGuide [${[...dgPageTypes].join(',')}]. Using intersection: [${[...intersection].join(',')}]`,
            gtm_value: [...gtmPageTypes],
            devguide_value: [...dgPageTypes],
            resolution: 'Page types differ between sources. Using intersection as effective page types.',
          });
        }
      } else {
        warnings.push({
          check_id: 'CHECK_3_PAGE_TYPE',
          severity: 'WARNING',
          event_name: eventName,
          message: `No page type overlap: GTM [${[...gtmPageTypes].join(',')}] vs DevGuide [${[...dgPageTypes].join(',')}]`,
          gtm_value: [...gtmPageTypes],
          devguide_value: [...dgPageTypes],
          resolution: 'DevGuide page types take precedence as authoritative source for page type inference.',
        });
      }
    } else {
      passed++;
    }
  } else {
    passed++;
  }

  // ── Check 4: DevGuide required_params ↔ GTM tag parameters ──
  if (devGuideFacts.required_params && devGuideFacts.required_params.length > 0) {
    const gtmParams = new Set(gtmFacts.gtm_param_keys);
    const missingParams = devGuideFacts.required_params.filter(p => !gtmParams.has(p));

    if (missingParams.length === 0) {
      passed++;
    } else {
      warnings.push({
        check_id: 'CHECK_4_REQUIRED_PARAMS',
        severity: 'WARNING',
        event_name: eventName,
        message: `DevGuide requires params [${missingParams.join(', ')}] but they are missing from GTM tag configuration`,
        gtm_value: [...gtmParams],
        devguide_value: devGuideFacts.required_params,
        resolution: 'Parameters may be set via GTM variables or server-side. Verify actual dataLayer push.',
      });
    }
  } else {
    passed++;
  }

  const checksWarned = warnings.filter(w => w.severity !== 'INFO').length;
  return {
    event_name: eventName,
    checks_passed: passed,
    checks_warned: checksWarned,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Event Classification (Authority-based)
// ─────────────────────────────────────────────────────────────────────

/**
 * 권위자 기반 이벤트 분류.
 *
 * 우선순위:
 * 1. GTM JSON → gtm_trigger_type, custom_event_name (항상)
 * 2. DevGuide → fire_condition, testability, action_type, inferred_page_types (있을 때)
 * 3. Content Group → inferred_page_types (DevGuide 없을 때)
 * 4. FALLBACK_CUSTOM_EVENT_HINTS → 최하위 폴백 (DevGuide 없을 때만)
 */
export function classifyEvent(
  gtmFacts: GTMEventFacts,
  devGuideFacts: DevGuideEventFacts | undefined,
  crossRefResult: CrossReferenceResult,
): ClassifiedEvent {
  const provenance: Record<string, SourceProvenance> = {};

  // ── GTM 권위 필드 (항상 GTM이 권위자) ──
  provenance['gtm_trigger_type'] = 'gtm_json';
  provenance['custom_event_name'] = 'gtm_json';

  let fireCondition: EventFireCondition;
  let testability: ClassifiedEvent['testability'];
  let actionType: UserActionType;
  let inferredPageTypes: PageTypeEnum[];
  let devguideFireTiming: string | undefined;
  let dataLayerEventNames: string[] | undefined;
  let targetSelector: string | undefined = gtmFacts.css_selector;
  let waitAfterMs = 3000;

  if (devGuideFacts) {
    // ── DevGuide 권위 필드 ──
    fireCondition = devGuideFacts.practical_fire === 'auto_fire' ? 'auto_fire'
      : devGuideFacts.practical_fire === 'manual_only' ? 'conditional'
      : 'user_action';
    testability = devGuideFacts.testability;
    actionType = devGuideFacts.action_type;
    inferredPageTypes = [...devGuideFacts.inferred_page_types];
    devguideFireTiming = devGuideFacts.fire_timing;
    dataLayerEventNames = [...devGuideFacts.dataLayer_event_names];

    provenance['fire_condition'] = 'devguide_pdf';
    provenance['testability'] = 'devguide_pdf';
    provenance['action_type'] = 'devguide_pdf';
    provenance['inferred_page_types'] = 'devguide_pdf';

    // Content Group filter may narrow page types further
    if (gtmFacts.content_group_filter) {
      const gtmPageTypes = parseContentGroupFilter(gtmFacts.content_group_filter);
      if (gtmPageTypes.size > 0) {
        const intersection = inferredPageTypes.filter(pt => gtmPageTypes.has(pt));
        if (intersection.length > 0) {
          inferredPageTypes = intersection;
          // DevGuide remains provenance since we're narrowing, not replacing
        }
      }
    }
  } else {
    // ── 폴백: GTM 추론 + CUSTOM_EVENT_PAGE_HINTS ──
    const fallbackResult = applyFallbackClassification(gtmFacts);
    fireCondition = fallbackResult.fireCondition;
    testability = fallbackResult.testability;
    actionType = fallbackResult.actionType;
    inferredPageTypes = fallbackResult.inferredPageTypes;
    if (fallbackResult.targetSelector) targetSelector = fallbackResult.targetSelector;
    if (fallbackResult.waitAfterMs) waitAfterMs = fallbackResult.waitAfterMs;

    provenance['fire_condition'] = fallbackResult.source;
    provenance['testability'] = fallbackResult.source;
    provenance['action_type'] = fallbackResult.source;
    provenance['inferred_page_types'] = fallbackResult.source;
  }

  // ── GA4 이벤트명 기반 페이지 타입 교정 ──
  // ALL_PAGE_TYPES 또는 과도하게 넓은 추론을 도메인 지식으로 제한
  // DOM_READY/WINDOW_LOADED 트리거는 Content Group 필터가 없으면 ALL_PAGE_TYPES가 되므로,
  // 이벤트별 실제 발화 페이지 정보로 교정합니다.
  const knownPageTypes = GA4_EVENT_PAGE_TYPE_KNOWLEDGE[gtmFacts.event_name];
  if (knownPageTypes) {
    inferredPageTypes = [...knownPageTypes];
    provenance['inferred_page_types'] = 'knowledge_base';
  }

  return {
    event_name: gtmFacts.event_name,
    gtm_trigger_type: gtmFacts.gtm_trigger_type,
    fire_condition: fireCondition,
    testability,
    action_type: actionType,
    inferred_page_types: inferredPageTypes,
    devguide_fire_timing: devguideFireTiming,
    dataLayer_event_names: dataLayerEventNames,
    custom_event_name: gtmFacts.custom_event_name,
    content_group_filter: gtmFacts.content_group_filter,
    css_selector: gtmFacts.css_selector,
    target_selector: targetSelector,
    wait_after_ms: waitAfterMs,
    _source_provenance: provenance,
    cross_reference_warnings: crossRefResult.warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────────────

interface TimingCompatibility {
  compatible: boolean;
  note?: string;
}

/**
 * GTM trigger type과 DevGuide fire_timing의 호환성 확인.
 *
 * 핵심: DevGuide fire_timing은 "dataLayer push 타이밍"이고,
 * GTM trigger_type은 "GTM이 어떤 메커니즘으로 이벤트를 수신하는가".
 * 이 둘은 다른 레이어이므로 대부분 호환됩니다.
 */
function checkTimingCompatibility(
  gtmTriggerType: GTMTriggerType,
  _devGuideFireTiming: string,
  devGuidePracticalFire: 'auto_fire' | 'user_action' | 'manual_only',
): TimingCompatibility {
  // CUSTOM_EVENT는 dataLayer push를 리스닝하므로 대부분의 fire_timing과 호환
  if (gtmTriggerType === 'CUSTOM_EVENT') {
    return {
      compatible: true,
      note: `DevGuide fire_timing describes dataLayer push timing. GTM listens via CUSTOM_EVENT mechanism.`,
    };
  }

  // DOM_READY/WINDOW_LOADED + auto_fire → 호환
  if ((gtmTriggerType === 'DOM_READY' || gtmTriggerType === 'WINDOW_LOADED' || gtmTriggerType === 'PAGEVIEW')
    && devGuidePracticalFire === 'auto_fire') {
    return { compatible: true };
  }

  // CLICK/LINK_CLICK + user_action → 호환
  if ((gtmTriggerType === 'CLICK' || gtmTriggerType === 'LINK_CLICK')
    && devGuidePracticalFire === 'user_action') {
    return { compatible: true };
  }

  // CLICK/LINK_CLICK + auto_fire → 충돌
  if ((gtmTriggerType === 'CLICK' || gtmTriggerType === 'LINK_CLICK')
    && devGuidePracticalFire === 'auto_fire') {
    return {
      compatible: false,
      note: `Conflict: GTM uses ${gtmTriggerType} (requires user click) but DevGuide says auto_fire (no user action needed)`,
    };
  }

  // DOM_READY/PAGEVIEW + user_action → 충돌 (단, CUSTOM_EVENT는 위에서 처리)
  if ((gtmTriggerType === 'DOM_READY' || gtmTriggerType === 'WINDOW_LOADED' || gtmTriggerType === 'PAGEVIEW')
    && devGuidePracticalFire === 'user_action') {
    return {
      compatible: false,
      note: `Conflict: GTM uses ${gtmTriggerType} (fires on page load) but DevGuide says user_action required`,
    };
  }

  // Default: compatible (other combinations like SCROLL_DEPTH, FORM_SUBMIT, etc.)
  return { compatible: true };
}

/** Content Group 필터 문자열을 페이지 타입 Set으로 파싱 */
function parseContentGroupFilter(filter: string): Set<PageTypeEnum> {
  const parts = filter.split('|');
  const result = new Set<PageTypeEnum>();
  for (const part of parts) {
    const pt = CONTENT_GROUP_TO_PAGE_TYPE[part.trim()];
    if (pt) result.add(pt);
  }
  return result;
}

interface FallbackClassificationResult {
  fireCondition: EventFireCondition;
  testability: 'auto' | 'action' | 'conditional' | 'manual_only';
  actionType: UserActionType;
  inferredPageTypes: PageTypeEnum[];
  targetSelector?: string;
  waitAfterMs?: number;
  source: SourceProvenance;
}

/**
 * DevGuide가 없을 때 GTM 트리거 타입 + FALLBACK_CUSTOM_EVENT_HINTS로 분류
 */
function applyFallbackClassification(gtmFacts: GTMEventFacts): FallbackClassificationResult {
  const triggerType = gtmFacts.gtm_trigger_type;

  // 1. Content Group filter → page type inference
  let inferredPageTypes: PageTypeEnum[] = [...ALL_PAGE_TYPES];
  let pageTypeSource: SourceProvenance = 'inferred';

  if (gtmFacts.content_group_filter) {
    const cgPageTypes = parseContentGroupFilter(gtmFacts.content_group_filter);
    if (cgPageTypes.size > 0) {
      inferredPageTypes = [...cgPageTypes];
      pageTypeSource = 'gtm_json';
    }
  }

  // 2. CUSTOM_EVENT → look up fallback hints
  if (triggerType === 'CUSTOM_EVENT' && gtmFacts.custom_event_name) {
    const hint = FALLBACK_CUSTOM_EVENT_HINTS[gtmFacts.custom_event_name];
    if (hint) {
      return {
        fireCondition: hint.practical_fire === 'auto_fire' ? 'auto_fire'
          : hint.practical_fire === 'manual_only' ? 'conditional'
          : 'user_action',
        testability: hint.testability,
        actionType: hint.action_type,
        inferredPageTypes: [...hint.page_types],
        targetSelector: hint.target_selector,
        waitAfterMs: hint.wait_after_ms,
        source: 'fallback_hint',
      };
    }
  }

  // 3. Non-CUSTOM_EVENT trigger type → direct inference
  if (triggerType === 'DOM_READY' || triggerType === 'WINDOW_LOADED' || triggerType === 'PAGEVIEW') {
    return {
      fireCondition: 'auto_fire',
      testability: 'auto',
      actionType: 'page_load',
      inferredPageTypes,
      waitAfterMs: 5000,
      source: pageTypeSource === 'gtm_json' ? 'gtm_json' : 'inferred',
    };
  }

  if (triggerType === 'CLICK' || triggerType === 'LINK_CLICK') {
    return {
      fireCondition: 'user_action',
      testability: gtmFacts.css_selector ? 'action' : 'conditional',
      actionType: 'click',
      inferredPageTypes,
      targetSelector: gtmFacts.css_selector,
      waitAfterMs: 2000,
      source: pageTypeSource === 'gtm_json' ? 'gtm_json' : 'inferred',
    };
  }

  if (triggerType === 'SCROLL_DEPTH') {
    return {
      fireCondition: 'user_action',
      testability: 'action',
      actionType: 'scroll',
      inferredPageTypes,
      waitAfterMs: 2000,
      source: pageTypeSource === 'gtm_json' ? 'gtm_json' : 'inferred',
    };
  }

  if (triggerType === 'YOU_TUBE_VIDEO') {
    return {
      fireCondition: 'user_action',
      testability: 'conditional',
      actionType: 'view',
      inferredPageTypes,
      waitAfterMs: 5000,
      source: 'inferred',
    };
  }

  // 4. Default fallback
  return {
    fireCondition: 'user_action',
    testability: 'conditional',
    actionType: 'custom',
    inferredPageTypes,
    waitAfterMs: 3000,
    source: 'inferred',
  };
}

// ─────────────────────────────────────────────────────────────────────
// DevGuide Hint Map Builder (for use by gtm-parser)
// ─────────────────────────────────────────────────────────────────────

/**
 * DevGuideEventHint[] → dataLayer event name keyed Map
 */
export function buildDevGuideFactsMap(
  hints: DevGuideEventHint[],
  dataLayerToGA4Map: Record<string, string>,
): Map<string, DevGuideEventFacts> {
  const map = new Map<string, DevGuideEventFacts>();

  for (const hint of hints) {
    // Map by each dataLayer event name for quick lookup
    for (const dlEvent of hint.dataLayer_event_names) {
      if (!map.has(dlEvent)) {
        map.set(dlEvent, {
          ga4_event_name: hint.ga4_event_name,
          fire_timing: hint.fire_timing,
          practical_fire: hint.practical_fire,
          inferred_page_types: hint.inferred_page_types,
          action_type: hint.action_type,
          testability: hint.testability,
          dataLayer_event_names: hint.dataLayer_event_names,
          required_params: hint.required_params,
        });
      }
    }

    // Also map by GA4 event name for direct lookups
    if (!map.has(hint.ga4_event_name)) {
      map.set(hint.ga4_event_name, {
        ga4_event_name: hint.ga4_event_name,
        fire_timing: hint.fire_timing,
        practical_fire: hint.practical_fire,
        inferred_page_types: hint.inferred_page_types,
        action_type: hint.action_type,
        testability: hint.testability,
        dataLayer_event_names: hint.dataLayer_event_names,
        required_params: hint.required_params,
      });
    }
  }

  // Also add reverse mappings from dataLayerToGA4Map
  for (const [dlEvent, ga4Event] of Object.entries(dataLayerToGA4Map)) {
    if (!map.has(dlEvent)) {
      const ga4Facts = map.get(ga4Event);
      if (ga4Facts) {
        map.set(dlEvent, ga4Facts);
      }
    }
  }

  return map;
}

// ─────────────────────────────────────────────────────────────────────
// Crawling Lessons Learned (2026-02-19)
// ─────────────────────────────────────────────────────────────────────
//
// 이 섹션은 실제 크롤링 결과에서 학습한 내용을 기록합니다.
// 향후 동일 사이트 또는 유사 사이트 크롤링 시 참조합니다.
//
// [LESSON-1] 도메인 매핑 필수
//   - Excel/GTM URL이 Shopify 내부 도메인(*.myshopify.com)을 사용하는 경우,
//     실제 프로덕션 도메인으로 매핑하지 않으면 이벤트 발생 조건이 달라질 수 있음.
//   - --domain-from / --domain-to 옵션 또는 config.domain_map 설정 필수.
//   - SYNTHETIC_SCENARIO_CONFIGS의 test_url도 도메인 매핑 대상.
//
// [LESSON-2] 링크 클릭 이벤트의 네비게이션 인터셉트
//   - a[href] 클릭으로 트리거되는 이벤트(click_with_duration, select_item 등)는
//     클릭 즉시 페이지 네비게이션이 발생하여 GA4 beacon이 유실됨.
//   - 해결: preventDefault()로 네비게이션만 차단하고,
//     GA4 /g/collect 응답 대기 후 진행.
//   - stopPropagation은 하지 않음 (GTM 클릭 리스너가 이벤트를 감지해야 함).
//
// [LESSON-3] 빈 검색어 SEARCH 페이지
//   - q= (빈 쿼리) URL에서는 검색 결과가 없으므로:
//     view_item_list, view_search_results, select_item 이벤트가 발생하지 않음.
//   - 빈 검색어 감지 시 해당 이벤트를 기대 목록에서 제외해야 함.
//
// [LESSON-4] 사이트 미적용 기능
//   - write_review: innisfree JP 사이트에 리뷰 기능 미적용 상태.
//     event-scenario-registry.ts에서 conditional로 설정하여 시나리오 제외.
//   - 사이트 적용 상태가 변경되면 scenario_status를 'included'로 복원.
//
