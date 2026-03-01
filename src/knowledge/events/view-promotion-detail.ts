/**
 * view_promotion_detail 이벤트 지식
 *
 * 프로모션/이벤트 상세 페이지 조회 시 발생.
 * GTM 자동 트리거 (페이지 로드 기반, AP_DATA_PAGETYPE = EVENT_DETAIL).
 *
 * 핵심 규칙:
 * - EVENT_DETAIL 페이지 타입에서만 발생 (auto_fire)
 * - AP_DATA_PAGETYPE이 EVENT_DETAIL인 경우에만 GTM 트리거 조건 충족
 * - AP_PROMO_ID, AP_PROMO_NAME 공통 변수에서 프로모션 정보 수집
 * - view_promotion(메인 배너 노출)과 구분: view_promotion_detail은 상세 페이지 조회
 * - select_promotion(배너 클릭) → view_promotion_detail(상세 페이지) 퍼널 관계
 *
 * ⚠️ page_type 판단 주의:
 * - EVENT_DETAIL은 현재 확인된 기본 대상 page_type
 * - 실제 대상 페이지는 GTM 트리거 조건(필터) + 개발가이드를 반드시 확인 후 확정
 * - page_type 소스: 전역변수(AP_DATA_PAGETYPE) 또는 dataLayer 변수 — GA4 property별로 다를 수 있음
 * - 특정 GA4 property는 EVENT_DETAIL 외 다른 page_type에서도 해당 이벤트를 수집할 수 있음
 *
 * @source view_promotion_detail.yaml 스펙
 * @source view_promotion/select_promotion 연계 분석
 * @source QA 도메인 지식 (2026-03-01)
 */

import type { EventScenarioKnowledge } from '../../types/event-scenario-knowledge';

export const VIEW_PROMOTION_DETAIL_KNOWLEDGE: EventScenarioKnowledge = {
  event_name: 'view_promotion_detail',
  should_fire_rules: [
    'EVENT_DETAIL 페이지 로드 시 자동 발생 (auto_fire)',
    'AP_DATA_PAGETYPE이 EVENT_DETAIL로 설정된 프로모션/이벤트 상세 페이지',
    '메인 배너에서 프로모션 클릭(select_promotion) 후 상세 페이지 진입 시',
    '직접 URL로 프로모션/이벤트 상세 페이지 진입 시',
    '검색/메뉴에서 프로모션/이벤트 상세 페이지로 이동 시',
  ],
  should_not_fire_rules: [
    'MAIN 페이지에서 프로모션 배너가 노출되는 시점 (그건 view_promotion)',
    'MAIN 페이지에서 프로모션 배너를 클릭하는 시점 (그건 select_promotion)',
    'AP_DATA_PAGETYPE이 EVENT_DETAIL이 아닌 페이지에서 발생',
    'PRODUCT_DETAIL, PRODUCT_LIST, CART 등 비 이벤트 페이지에서 발생',
    '프로모션/이벤트 목록 페이지에서 발생 (상세 페이지 진입 전)',
    '페이지 로드 완료 전 AP_PROMO_ID/AP_PROMO_NAME 변수 미설정 상태에서 발생',
  ],
  test_scenarios: [
    // ── 기본 진입 시나리오 ──
    {
      index: 1,
      scenario: '프로모션/이벤트 상세 페이지 직접 진입',
      procedure: '이벤트 상세 URL로 직접 진입 (EVENT_DETAIL 페이지 타입)',
      should_fire: '페이지 로드 완료 시 view_promotion_detail 1회 auto_fire',
      should_not_fire: '페이지 로드 전 또는 AP_DATA_PAGETYPE 미설정 상태',
      check_points: 'view_promotion_detail 이벤트 발생 확인, promotion_id(AP_PROMO_ID)와 promotion_name(AP_PROMO_NAME) 파라미터 정확성, page_type: EVENT_DETAIL',
      automation: {
        automatable: false,
        skip_reason: 'auto_fire 시나리오 (페이지 로드 시 자동 캡처)',
      },
    },
    // ── 메인 배너 → 상세 진입 퍼널 ──
    {
      index: 2,
      scenario: '메인 배너 클릭 → 프로모션 상세 진입 (퍼널 검증)',
      procedure: 'MAIN 진입 → 프로모션 배너 클릭(select_promotion) → EVENT_DETAIL 페이지 이동',
      should_fire: 'EVENT_DETAIL 진입 시 view_promotion_detail 발생',
      should_not_fire: 'MAIN에서 배너 클릭 시점에 view_promotion_detail 발생 (그건 select_promotion)',
      check_points: '퍼널 순서: view_promotion(배너 노출) → select_promotion(배너 클릭) → view_promotion_detail(상세 진입). 각 단계에서 올바른 이벤트만 발생하는지 확인',
      automation: {
        automatable: false,
        skip_reason: 'MAIN → EVENT_DETAIL 멀티스텝 퍼널 (수동 테스트)',
      },
    },
    // ── 프로모션 ID/Name 파라미터 검증 ──
    {
      index: 3,
      scenario: '프로모션 ID/Name 파라미터 정확성 검증',
      procedure: 'EVENT_DETAIL 페이지 진입 → view_promotion_detail 이벤트의 promotion_id, promotion_name 확인',
      should_fire: 'AP_PROMO_ID, AP_PROMO_NAME이 해당 프로모션과 일치하는 값으로 발생',
      should_not_fire: 'promotion_id 또는 promotion_name이 빈 값, undefined, 이전 페이지 값으로 발생',
      check_points: 'promotion_id: 해당 프로모션의 고유 ID (예: "3224"), promotion_name: 프로모션 제목과 일치, page_type: EVENT_DETAIL. 공통 변수(AP_PROMO_ID, AP_PROMO_NAME)가 페이지 로드 시 정확히 설정되었는지 확인',
      automation: {
        automatable: false,
        skip_reason: '파라미터 값 크로스체크 필요 (수동 테스트)',
      },
    },
    // ── 비대상 페이지 미발생 검증 ──
    {
      index: 4,
      scenario: 'MAIN/PRODUCT_DETAIL에서 미발생 확인',
      procedure: 'MAIN 페이지 또는 PRODUCT_DETAIL 페이지 진입',
      should_fire: '이 시나리오에서는 발생하면 안 됨',
      should_not_fire: 'EVENT_DETAIL이 아닌 페이지에서 view_promotion_detail 발생 시 → GTM 트리거 조건 오류',
      check_points: 'AP_DATA_PAGETYPE이 EVENT_DETAIL이 아닌 페이지에서 view_promotion_detail 미발생 확인. MAIN에서 프로모션 관련 이벤트는 view_promotion/select_promotion만 발생',
      automation: {
        automatable: false,
        skip_reason: 'forbidden_events 검증은 auto_fire 시나리오에서 처리',
      },
    },
    // ── 중복 발생 검증 ──
    {
      index: 5,
      scenario: '페이지 새로고침 시 중복 발생 체크',
      procedure: 'EVENT_DETAIL 페이지에서 새로고침(F5) 실행',
      should_fire: '새로고침 후 1회 발생 (새 페이지 로드로 간주)',
      should_not_fire: '새로고침 시 2회 이상 발생',
      check_points: '새로고침 시 view_promotion_detail 1회만 발생 확인. SPA 환경에서 라우팅만 변경되고 실제 리로드 안 되는 경우에도 1회 발생 확인',
      automation: {
        automatable: false,
        skip_reason: '새로고침 후 이벤트 횟수 정밀 확인 (수동 테스트)',
      },
    },
    // ── 프로모션 간 이동 ──
    {
      index: 6,
      scenario: '프로모션 상세 → 다른 프로모션 상세 이동',
      procedure: 'EVENT_DETAIL 페이지 A → 관련 프로모션 링크 클릭 → EVENT_DETAIL 페이지 B',
      should_fire: '페이지 B 진입 시 새로운 promotion_id로 view_promotion_detail 1회 발생',
      should_not_fire: '페이지 A의 promotion_id가 페이지 B에서 그대로 유지',
      check_points: '프로모션 간 이동 시 AP_PROMO_ID/AP_PROMO_NAME이 올바르게 갱신되는지 확인. 이전 프로모션 정보가 잔존하면 데이터 오염',
      automation: {
        automatable: false,
        skip_reason: '프로모션 간 이동 멀티스텝 + 파라미터 갱신 확인 (수동 테스트)',
      },
    },
  ],
  check_points: [
    // ── 대상 페이지 타입 규칙 (GTM 트리거 + 개발가이드 확인 필수) ──
    'EVENT_DETAIL 페이지 타입에서 auto_fire (기본 대상). 실제 대상은 GTM 트리거 조건 + 개발가이드 확인 후 확정',
    'page_type 소스: 전역변수(AP_DATA_PAGETYPE) 또는 dataLayer 변수 — GA4 property별 상이할 수 있음',
    '특정 GA4 property는 EVENT_DETAIL 외 다른 page_type에서도 수집할 수 있음',
    '비대상 페이지에서 미발생이 정상 (대상 여부는 GTM 트리거 조건 기준)',
    // ── 프로모션 이벤트 구분 ──
    'view_promotion: 메인 배너에서 프로모션 노출 시 (MAIN)',
    'select_promotion: 메인 배너에서 프로모션 클릭 시 (MAIN)',
    'view_promotion_detail: 프로모션 상세 페이지 조회 시 (EVENT_DETAIL)',
    '퍼널: view_promotion → select_promotion → view_promotion_detail',
    // ── 파라미터 검증 ──
    'promotion_id (AP_PROMO_ID): 해당 프로모션의 고유 ID, 빈 값이면 안 됨',
    'promotion_name (AP_PROMO_NAME): 프로모션 제목과 일치, 이전 페이지 값 잔존 주의',
    'page_type: EVENT_DETAIL 값 확인',
    // ── 공통 변수 의존성 ──
    'AP_PROMO_ID, AP_PROMO_NAME은 공통 변수에서 선언됨. 페이지 로드 시 정확히 설정되어야 함',
    '프로모션 간 이동 시 공통 변수 갱신 여부 반드시 확인 (이전 값 잔존 = 데이터 오염)',
  ],
};
