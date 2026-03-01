/**
 * scroll 이벤트 지식
 *
 * 페이지 스크롤 시 특정 깊이(%) 도달 시 발생.
 * GTM Scroll Depth 트리거로 자동 수집 (개발자 dataLayer.push 불필요).
 *
 * 핵심 규칙:
 * - GTM Scroll Depth 트리거 기반 자동 수집 이벤트
 * - 임계값: 25%, 50%, 75%, 90% (GTM 설정에 따라 상이)
 * - 각 임계값은 한 번만 발생 (중복 방지)
 * - 스크롤 불가능한 짧은 페이지에서는 미발생
 * - 픽셀이 아닌 % 기준으로 측정
 *
 * ⚠️ page_type 판단 주의:
 * - 아래 대상 페이지(MAIN, PRODUCT_DETAIL, EVENT_DETAIL)는 현재 확인된 기본값
 * - 실제 대상 페이지는 GTM 트리거 조건(필터) + 개발가이드를 반드시 확인 후 확정
 * - page_type 소스: 전역변수(AP_DATA_PAGETYPE) 또는 dataLayer 변수 — GA4 property별로 다를 수 있음
 * - 특정 GA4 property는 다른 page_type에서도 scroll을 수집할 수 있음
 *
 * @source scroll.yaml 스펙 + 가이드 문서
 * @source GTM Scroll Depth 트리거 설정
 * @source QA 도메인 지식 (2026-03-01)
 */

import type { EventScenarioKnowledge } from '../../types/event-scenario-knowledge';

export const SCROLL_KNOWLEDGE: EventScenarioKnowledge = {
  event_name: 'scroll',
  should_fire_rules: [
    '페이지를 아래로 스크롤하여 설정된 깊이(25%, 50%, 75%, 90%)에 도달할 때',
    'GTM 트리거 조건에 설정된 대상 페이지에서 스크롤 시 (대상 page_type은 GTM 트리거 + 개발가이드 확인 후 확정)',
    '기본 대상 예시: MAIN, PRODUCT_DETAIL, EVENT_DETAIL (GA4 property별 상이할 수 있음)',
    'PC: 마우스 휠, 스크롤바 드래그, 키보드(Page Down, Space) 스크롤 모두 측정',
    'Mobile: 터치 스크롤, 관성 스크롤 모두 측정',
  ],
  should_not_fire_rules: [
    '스크롤하지 않고 페이지 이탈 (어떤 깊이도 미도달)',
    '전체 콘텐츠가 한 화면(뷰포트)에 보이는 짧은 페이지 (스크롤 불가)',
    '이미 도달한 깊이를 재통과 시 중복 발생 안 함 (각 임계값 1회만)',
    '측정 대상이 아닌 페이지에서 발생 (대상 여부는 GTM 트리거 조건에 의존)',
    '가로 스크롤만 발생한 경우 (vertical 스크롤만 측정하는 GTM 설정일 때)',
    'SPA 페이지 전환 후 이전 페이지의 스크롤 이벤트가 현재 페이지로 기록',
  ],
  test_scenarios: [
    // ── 기본 스크롤 시나리오 ──
    {
      index: 1,
      scenario: '페이지 스크롤 25% 도달',
      procedure: '대상 페이지 진입 → 아래로 스크롤하여 전체의 약 25% 지점 도달',
      should_fire: '25% 임계값 최초 통과 시 scroll 1회 발생 (percent_scrolled: 25)',
      should_not_fire: '25% 미만에서 스크롤 멈춘 경우',
      check_points: 'scroll 이벤트 발생 확인, percent_scrolled 또는 scroll_depth 값 25 확인',
      automation: {
        automatable: true,
        action_type: 'scroll',
        target_selector: 'window',
        scope: 'page_type_specific',
        applicable_page_types: ['MAIN', 'PRODUCT_DETAIL', 'EVENT_DETAIL'], // 기본값. GTM 트리거 조건 확인 후 확정
      },
    },
    {
      index: 2,
      scenario: '페이지 스크롤 50% 도달',
      procedure: '대상 페이지 진입 → 아래로 스크롤하여 전체의 약 50% 지점 도달',
      should_fire: '50% 임계값 최초 통과 시 scroll 1회 발생 (percent_scrolled: 50)',
      should_not_fire: '25% ~ 49% 구간에서 스크롤 멈춘 경우 (25%에서만 발생)',
      check_points: 'scroll 이벤트 발생 확인, 25% + 50% 총 2회 누적 발생',
      automation: {
        automatable: true,
        action_type: 'scroll',
        target_selector: 'window',
        scope: 'page_type_specific',
        applicable_page_types: ['MAIN', 'PRODUCT_DETAIL', 'EVENT_DETAIL'], // 기본값. GTM 트리거 조건 확인 후 확정
      },
    },
    {
      index: 3,
      scenario: '페이지 최하단(90%) 스크롤',
      procedure: '대상 페이지 진입 → 최하단까지 스크롤',
      should_fire: '25%, 50%, 75%, 90% 각 임계값에서 총 4회 발생',
      should_not_fire: '동일 임계값에서 2회 이상 중복 발생',
      check_points: '최하단 스크롤 시 총 scroll 이벤트 횟수 확인 (4회: 25+50+75+90). 각 임계값별 정확한 percent_scrolled 값',
      automation: {
        automatable: true,
        action_type: 'scroll',
        target_selector: 'window',
        scope: 'page_type_specific',
        applicable_page_types: ['MAIN', 'PRODUCT_DETAIL', 'EVENT_DETAIL'], // 기본값. GTM 트리거 조건 확인 후 확정
      },
    },
    // ── 중복 방지 검증 ──
    {
      index: 4,
      scenario: '스크롤 업/다운 반복 시 중복 발생 체크',
      procedure: '페이지 최하단까지 스크롤 → 최상단으로 스크롤 업 → 다시 최하단 스크롤',
      should_fire: '최초 통과 시만 발생 (총 4회: 25+50+75+90)',
      should_not_fire: '스크롤 업 후 다시 다운할 때 이미 통과한 임계값에서 재발생',
      check_points: '업/다운 반복 후 총 scroll 이벤트 횟수 = 4회 (재통과 시 미발생 확인). GTM Scroll Depth 트리거의 once-per-page 동작 검증',
      automation: {
        automatable: false,
        skip_reason: '스크롤 업/다운 반복 + 이벤트 횟수 정밀 확인 (수동 테스트)',
      },
    },
    // ── 짧은 페이지 미발생 검증 ──
    {
      index: 5,
      scenario: '스크롤 불가능한 짧은 페이지',
      procedure: '콘텐츠가 한 화면에 모두 보이는 짧은 페이지 진입 (예: 로그인 페이지)',
      should_fire: '이 시나리오에서는 발생하면 안 됨',
      should_not_fire: '스크롤바가 없는 페이지에서 scroll 이벤트 발생 시 → GTM 설정 오류',
      check_points: '뷰포트 높이 >= 페이지 전체 높이인 경우 scroll 미발생 확인',
      automation: {
        automatable: false,
        skip_reason: '스크롤 불가 페이지 판별 + 미발생 확인 (수동 테스트)',
      },
    },
    // ── 무한 스크롤 페이지 ──
    {
      index: 6,
      scenario: '무한 스크롤 페이지에서 깊이 계산',
      procedure: 'PRODUCT_LIST 등 무한 스크롤 페이지 → 스크롤 다운 (콘텐츠 동적 추가)',
      should_fire: '무한 스크롤로 페이지 높이가 계속 늘어나는 경우에도 % 기준으로 발생',
      should_not_fire: '동적 콘텐츠 추가 전 기준의 % 에서 이미 발생한 후, 콘텐츠 추가로 % 가 줄어들어도 재발생하면 안 됨',
      check_points: '무한 스크롤 페이지에서 스크롤 깊이(%) 계산 정확도 확인. 동적 콘텐츠 로딩 시 임계값 재계산 동작 확인',
      automation: {
        automatable: false,
        skip_reason: '무한 스크롤 동적 콘텐츠 로딩 + 깊이 재계산 검증 (수동 테스트)',
      },
    },
    // ── 상품 상세 페이지 특화 ──
    {
      index: 7,
      scenario: 'PRODUCT_DETAIL에서 리뷰 섹션까지 스크롤',
      procedure: 'PDP 진입 → 상품 이미지/설명 영역 지나 리뷰 섹션까지 스크롤',
      should_fire: '리뷰 섹션까지 도달하는 동안 통과한 임계값마다 scroll 발생',
      should_not_fire: '페이지 로드만으로 scroll 이벤트 발생',
      check_points: 'PDP 콘텐츠 길이가 충분한지 확인 후 스크롤 테스트. 이미지 lazy-load로 인한 페이지 높이 변동이 % 계산에 영향 미치는지 확인',
      automation: {
        automatable: true,
        action_type: 'scroll',
        target_selector: 'window',
        scope: 'page_type_specific',
        applicable_page_types: ['PRODUCT_DETAIL'], // 기본값. GTM 트리거 조건 확인 후 확정
      },
    },
  ],
  check_points: [
    // ── 트리거 특성 ──
    'GTM Scroll Depth 트리거 기반 자동 수집. 개발자 dataLayer.push 불필요',
    '임계값: 25%, 50%, 75%, 90% (GTM 설정에 따라 상이할 수 있음)',
    '% 기준 측정 (픽셀 아님). 페이지 전체 높이 대비 현재 스크롤 위치',
    // ── 중복 방지 ──
    '각 임계값은 페이지 로드 후 최초 통과 시 1회만 발생 (once-per-page)',
    '스크롤 업 후 다시 다운해도 이미 통과한 임계값에서 재발생 안 함',
    // ── 대상 페이지 (GTM 트리거 + 개발가이드 확인 필수) ──
    '측정 대상 page_type: GTM 트리거 조건(필터) + 개발가이드 확인 후 확정. 기본 예시: MAIN, PRODUCT_DETAIL, EVENT_DETAIL',
    'page_type 소스: 전역변수(AP_DATA_PAGETYPE) 또는 dataLayer 변수 — GA4 property별 상이할 수 있음',
    '특정 GA4 property는 기본 대상 외 다른 page_type에서도 scroll을 수집할 수 있음',
    '비대상 페이지에서 발생하면 GTM 설정 오류 (대상 여부는 트리거 조건 기준)',
    '스크롤 불가능한 짧은 페이지에서는 미발생이 정상',
    // ── 환경별 ──
    'Mobile: 터치 스크롤 + 관성 스크롤에서 정확한 깊이 측정 확인',
    'PC: 마우스 휠, 스크롤바 드래그, 키보드 스크롤 모두 측정 확인',
    '무한 스크롤 페이지: 동적 콘텐츠 추가로 페이지 높이 변동 시 % 재계산 정확도',
    // ── SPA / 페이지 전환 ──
    'SPA 페이지 전환 후 이전 페이지의 스크롤 상태가 현재 페이지에 영향 미치지 않는지 확인',
  ],
};
