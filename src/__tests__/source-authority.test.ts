/**
 * Source Authority Module Tests
 *
 * 교차 검증 정확성 및 이벤트 분류 로직을 테스트합니다.
 */

import {
  crossValidateEvent,
  classifyEvent,
  buildDevGuideFactsMap,
  type GTMEventFacts,
  type DevGuideEventFacts,
  type CrossReferenceResult,
} from '../knowledge/source-authority';
import type { DevGuideEventHint } from '../types/devguide';

// ─────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────

function makeGTMFacts(overrides: Partial<GTMEventFacts> = {}): GTMEventFacts {
  return {
    event_name: 'page_view',
    tag_id: '1',
    tag_name: 'GA4 - page_view',
    gtm_trigger_type: 'CUSTOM_EVENT',
    additional_filters: [],
    gtm_param_keys: [],
    ...overrides,
  };
}

function makeDevGuideFacts(overrides: Partial<DevGuideEventFacts> = {}): DevGuideEventFacts {
  return {
    ga4_event_name: 'page_view',
    fire_timing: 'DOM Ready 시점',
    practical_fire: 'auto_fire',
    inferred_page_types: ['MAIN', 'PRODUCT_LIST', 'PRODUCT_DETAIL', 'EVENT_LIST', 'EVENT_DETAIL', 'SEARCH', 'CART', 'CHECKOUT', 'ORDER_COMPLETE', 'MY_PAGE', 'OTHERS'],
    action_type: 'page_load',
    testability: 'auto',
    dataLayer_event_names: ['ap_page_view'],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────
// crossValidateEvent Tests
// ─────────────────────────────────────────────────────────────────────

describe('crossValidateEvent', () => {
  test('page_view: CUSTOM_EVENT ap_page_view ↔ DevGuide ap_page_view → 매칭 성공', () => {
    const gtm = makeGTMFacts({
      event_name: 'page_view',
      gtm_trigger_type: 'CUSTOM_EVENT',
      custom_event_name: 'ap_page_view',
    });
    const dg = makeDevGuideFacts({
      ga4_event_name: 'page_view',
      dataLayer_event_names: ['ap_page_view'],
    });

    const result = crossValidateEvent('page_view', gtm, dg);

    // Check 1 should pass (DL names match)
    expect(result.checks_passed).toBeGreaterThanOrEqual(3);
    // Should have INFO about CUSTOM_EVENT compatibility, not WARNING
    const criticals = result.warnings.filter(w => w.severity === 'CRITICAL');
    expect(criticals).toHaveLength(0);
  });

  test('Check 1: GTM custom_event_name 불일치 시 CRITICAL 경고', () => {
    const gtm = makeGTMFacts({
      gtm_trigger_type: 'CUSTOM_EVENT',
      custom_event_name: 'wrong_event',
    });
    const dg = makeDevGuideFacts({
      dataLayer_event_names: ['ap_page_view'],
    });

    const result = crossValidateEvent('page_view', gtm, dg);

    const critical = result.warnings.find(
      w => w.check_id === 'CHECK_1_DL_MAPPING' && w.severity === 'CRITICAL',
    );
    expect(critical).toBeDefined();
    expect(critical!.message).toContain('wrong_event');
  });

  test('Check 2: CUSTOM_EVENT + auto_fire → 호환 (INFO)', () => {
    const gtm = makeGTMFacts({
      gtm_trigger_type: 'CUSTOM_EVENT',
      custom_event_name: 'ap_page_view',
    });
    const dg = makeDevGuideFacts({
      practical_fire: 'auto_fire',
      fire_timing: 'DOM Ready 시점',
    });

    const result = crossValidateEvent('page_view', gtm, dg);

    // CUSTOM_EVENT is always compatible with fire_timing (different layers)
    const check2Warnings = result.warnings.filter(
      w => w.check_id === 'CHECK_2_TIMING_COMPAT' && w.severity === 'WARNING',
    );
    expect(check2Warnings).toHaveLength(0);
  });

  test('Check 2: CLICK 트리거 + auto_fire → 충돌 WARNING', () => {
    const gtm = makeGTMFacts({
      gtm_trigger_type: 'CLICK',
    });
    const dg = makeDevGuideFacts({
      practical_fire: 'auto_fire',
    });

    const result = crossValidateEvent('some_event', gtm, dg);

    const check2Warning = result.warnings.find(
      w => w.check_id === 'CHECK_2_TIMING_COMPAT' && w.severity === 'WARNING',
    );
    expect(check2Warning).toBeDefined();
    expect(check2Warning!.message).toContain('Conflict');
  });

  test('Check 3: 페이지 타입 부분 겹침 시 WARNING', () => {
    const gtm = makeGTMFacts({
      content_group_filter: 'PRODUCT_DETAIL|PRODUCT_LIST',
    });
    const dg = makeDevGuideFacts({
      inferred_page_types: ['PRODUCT_DETAIL', 'CART'],
    });

    const result = crossValidateEvent('some_event', gtm, dg);

    const check3Warning = result.warnings.find(
      w => w.check_id === 'CHECK_3_PAGE_TYPE' && w.severity === 'WARNING',
    );
    expect(check3Warning).toBeDefined();
    expect(check3Warning!.message).toContain('Partial page type overlap');
  });

  test('Check 4: 필수 파라미터 누락 시 WARNING', () => {
    const gtm = makeGTMFacts({
      gtm_param_keys: ['item_id', 'item_name'],
    });
    const dg = makeDevGuideFacts({
      required_params: ['item_id', 'item_name', 'price', 'quantity'],
    });

    const result = crossValidateEvent('add_to_cart', gtm, dg);

    const check4Warning = result.warnings.find(
      w => w.check_id === 'CHECK_4_REQUIRED_PARAMS',
    );
    expect(check4Warning).toBeDefined();
    expect(check4Warning!.message).toContain('price');
    expect(check4Warning!.message).toContain('quantity');
  });

  test('DevGuide가 없을 때 경고 없이 반환', () => {
    const gtm = makeGTMFacts();
    const result = crossValidateEvent('page_view', gtm, undefined);

    expect(result.warnings).toHaveLength(0);
    expect(result.checks_passed).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// classifyEvent Tests
// ─────────────────────────────────────────────────────────────────────

describe('classifyEvent', () => {
  test('page_view: CUSTOM_EVENT(ap_page_view) + DevGuide → 올바른 분류', () => {
    const gtm = makeGTMFacts({
      event_name: 'page_view',
      gtm_trigger_type: 'CUSTOM_EVENT',
      custom_event_name: 'ap_page_view',
    });
    const dg = makeDevGuideFacts({
      ga4_event_name: 'page_view',
      fire_timing: 'DOM Ready 시점',
      practical_fire: 'auto_fire',
      testability: 'auto',
      action_type: 'page_load',
      dataLayer_event_names: ['ap_page_view'],
    });
    const crossRef: CrossReferenceResult = {
      event_name: 'page_view',
      checks_passed: 4,
      checks_warned: 0,
      warnings: [],
    };

    const classified = classifyEvent(gtm, dg, crossRef);

    // GTM 권위: trigger type
    expect(classified.gtm_trigger_type).toBe('CUSTOM_EVENT');
    // DevGuide 권위: fire_condition, testability, action_type
    expect(classified.fire_condition).toBe('auto_fire');
    expect(classified.testability).toBe('auto');
    expect(classified.action_type).toBe('page_load');
    // DevGuide 데이터
    expect(classified.devguide_fire_timing).toBe('DOM Ready 시점');
    expect(classified.dataLayer_event_names).toEqual(['ap_page_view']);
    // 출처 추적
    expect(classified._source_provenance.gtm_trigger_type).toBe('gtm_json');
    expect(classified._source_provenance.fire_condition).toBe('devguide_pdf');
    expect(classified._source_provenance.testability).toBe('devguide_pdf');
  });

  test('add_to_cart: CUSTOM_EVENT(addcart) + DevGuide → user_action으로 분류', () => {
    const gtm = makeGTMFacts({
      event_name: 'add_to_cart',
      gtm_trigger_type: 'CUSTOM_EVENT',
      custom_event_name: 'addcart',
    });
    const dg = makeDevGuideFacts({
      ga4_event_name: 'add_to_cart',
      fire_timing: '장바구니 담기 버튼 클릭 시',
      practical_fire: 'user_action',
      testability: 'action',
      action_type: 'click',
      inferred_page_types: ['PRODUCT_DETAIL', 'PRODUCT_LIST'],
      dataLayer_event_names: ['addcart'],
    });
    const crossRef: CrossReferenceResult = {
      event_name: 'add_to_cart',
      checks_passed: 4,
      checks_warned: 0,
      warnings: [],
    };

    const classified = classifyEvent(gtm, dg, crossRef);

    expect(classified.gtm_trigger_type).toBe('CUSTOM_EVENT');
    expect(classified.fire_condition).toBe('user_action');
    expect(classified.testability).toBe('action');
    expect(classified.action_type).toBe('click');
    expect(classified.inferred_page_types).toEqual(['PRODUCT_DETAIL', 'PRODUCT_LIST']);
  });

  test('DevGuide 없을 때 → FALLBACK_CUSTOM_EVENT_HINTS 사용', () => {
    const gtm = makeGTMFacts({
      event_name: 'add_to_cart',
      gtm_trigger_type: 'CUSTOM_EVENT',
      custom_event_name: 'addcart',
    });
    const crossRef: CrossReferenceResult = {
      event_name: 'add_to_cart',
      checks_passed: 0,
      checks_warned: 0,
      warnings: [],
    };

    const classified = classifyEvent(gtm, undefined, crossRef);

    expect(classified.fire_condition).toBe('user_action');
    expect(classified.testability).toBe('action');
    expect(classified.action_type).toBe('click');
    expect(classified._source_provenance.fire_condition).toBe('fallback_hint');
  });

  test('DevGuide 없고 힌트도 없는 CUSTOM_EVENT → inferred', () => {
    const gtm = makeGTMFacts({
      event_name: 'unknown_event',
      gtm_trigger_type: 'CUSTOM_EVENT',
      custom_event_name: 'unknown_dl_event',
    });
    const crossRef: CrossReferenceResult = {
      event_name: 'unknown_event',
      checks_passed: 0,
      checks_warned: 0,
      warnings: [],
    };

    const classified = classifyEvent(gtm, undefined, crossRef);

    expect(classified.fire_condition).toBe('user_action');
    expect(classified.testability).toBe('conditional');
    expect(classified._source_provenance.fire_condition).toBe('inferred');
  });

  test('DOM_READY 트리거 → DevGuide 없어도 auto_fire로 분류', () => {
    const gtm = makeGTMFacts({
      event_name: 'some_auto_event',
      gtm_trigger_type: 'DOM_READY',
    });
    const crossRef: CrossReferenceResult = {
      event_name: 'some_auto_event',
      checks_passed: 0,
      checks_warned: 0,
      warnings: [],
    };

    const classified = classifyEvent(gtm, undefined, crossRef);

    expect(classified.fire_condition).toBe('auto_fire');
    expect(classified.testability).toBe('auto');
    expect(classified.action_type).toBe('page_load');
  });

  test('CLICK 트리거 + CSS 셀렉터 → action 테스트 가능', () => {
    const gtm = makeGTMFacts({
      event_name: 'some_click_event',
      gtm_trigger_type: 'CLICK',
      css_selector: '.btn-submit',
    });
    const crossRef: CrossReferenceResult = {
      event_name: 'some_click_event',
      checks_passed: 0,
      checks_warned: 0,
      warnings: [],
    };

    const classified = classifyEvent(gtm, undefined, crossRef);

    expect(classified.fire_condition).toBe('user_action');
    expect(classified.testability).toBe('action');
    expect(classified.action_type).toBe('click');
    expect(classified.target_selector).toBe('.btn-submit');
  });

  test('Content Group 필터 + DevGuide → 페이지 타입 교차 적용', () => {
    const gtm = makeGTMFacts({
      event_name: 'view_item',
      gtm_trigger_type: 'CUSTOM_EVENT',
      custom_event_name: 'product',
      content_group_filter: 'PRODUCT_DETAIL',
    });
    const dg = makeDevGuideFacts({
      ga4_event_name: 'view_item',
      inferred_page_types: ['PRODUCT_DETAIL', 'PRODUCT_LIST'],
      practical_fire: 'auto_fire',
      testability: 'auto',
      action_type: 'page_load',
      dataLayer_event_names: ['product'],
    });
    const crossRef: CrossReferenceResult = {
      event_name: 'view_item',
      checks_passed: 4,
      checks_warned: 0,
      warnings: [],
    };

    const classified = classifyEvent(gtm, dg, crossRef);

    // DevGuide says [PDP, PLP], GTM CG filter says [PDP] → intersection = [PDP]
    expect(classified.inferred_page_types).toEqual(['PRODUCT_DETAIL']);
  });
});

// ─────────────────────────────────────────────────────────────────────
// buildDevGuideFactsMap Tests
// ─────────────────────────────────────────────────────────────────────

describe('buildDevGuideFactsMap', () => {
  test('dataLayer event name과 GA4 event name 모두로 조회 가능', () => {
    const hints: DevGuideEventHint[] = [
      {
        ga4_event_name: 'page_view',
        required: true,
        fire_timing: 'DOM Ready 시점',
        dataLayer_event_names: ['ap_page_view'],
        inferred_page_types: ['MAIN'],
        action_type: 'page_load',
        testability: 'auto',
        practical_fire: 'auto_fire',
      },
    ];

    const map = buildDevGuideFactsMap(hints, { 'ap_page_view': 'page_view' });

    // By dataLayer event name
    expect(map.get('ap_page_view')).toBeDefined();
    expect(map.get('ap_page_view')!.ga4_event_name).toBe('page_view');

    // By GA4 event name
    expect(map.get('page_view')).toBeDefined();
    expect(map.get('page_view')!.ga4_event_name).toBe('page_view');
  });

  test('dataLayerToGA4Map의 역매핑도 등록', () => {
    const hints: DevGuideEventHint[] = [
      {
        ga4_event_name: 'add_to_cart',
        required: true,
        fire_timing: '장바구니 담기 클릭 시',
        dataLayer_event_names: ['addcart'],
        inferred_page_types: ['PRODUCT_DETAIL'],
        action_type: 'click',
        testability: 'action',
        practical_fire: 'user_action',
      },
    ];

    const map = buildDevGuideFactsMap(hints, {
      'addcart': 'add_to_cart',
      'another_dl': 'add_to_cart',
    });

    // 'another_dl' should resolve via reverse mapping
    expect(map.get('another_dl')).toBeDefined();
    expect(map.get('another_dl')!.ga4_event_name).toBe('add_to_cart');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Integration: page_view 시나리오 (핵심 Anti-pattern 방지)
// ─────────────────────────────────────────────────────────────────────

describe('Integration: page_view anti-pattern prevention', () => {
  test('page_view를 DOM_READY로 잘못 분류하지 않음 (CUSTOM_EVENT로 올바르게 분류)', () => {
    // 이 테스트는 실제 발생했던 버그를 방지합니다:
    // "DOM Ready 시점에서 발생"이라는 DevGuide 설명을 보고
    // GTM 트리거를 DOM_READY로 잘못 분류한 사례

    const gtm = makeGTMFacts({
      event_name: 'page_view',
      gtm_trigger_type: 'CUSTOM_EVENT', // GTM JSON의 실제 트리거
      custom_event_name: 'ap_page_view', // GTM JSON의 실제 필터
    });
    const dg = makeDevGuideFacts({
      ga4_event_name: 'page_view',
      fire_timing: 'DOM Ready 시점', // 이것은 dataLayer push 타이밍!
      practical_fire: 'auto_fire',
      dataLayer_event_names: ['ap_page_view'],
    });
    const crossRef = crossValidateEvent('page_view', gtm, dg);
    const classified = classifyEvent(gtm, dg, crossRef);

    // GTM 트리거 타입은 반드시 CUSTOM_EVENT (GTM JSON 권위)
    expect(classified.gtm_trigger_type).toBe('CUSTOM_EVENT');
    // DevGuide의 "DOM Ready 시점"은 fire_timing에만 기록
    expect(classified.devguide_fire_timing).toBe('DOM Ready 시점');
    // fire_condition은 DevGuide의 practical_fire에서 (auto_fire)
    expect(classified.fire_condition).toBe('auto_fire');
    // custom_event_name은 GTM에서
    expect(classified.custom_event_name).toBe('ap_page_view');
    // 출처 추적 확인
    expect(classified._source_provenance.gtm_trigger_type).toBe('gtm_json');
    expect(classified._source_provenance.fire_condition).toBe('devguide_pdf');
  });
});
