/**
 * 이벤트 시나리오 타입 정의 (Event Scenario Types)
 *
 * Parser Agent가 2차 QA Excel(이벤트 검수)을 파싱하여
 * Collector/Validator Agent에게 전달하는 이벤트 시나리오 정의입니다.
 *
 * @description
 * - 2차 QA: 이벤트 검수 (Event QA)
 * - 대상: GA4 이벤트 발생 여부, 발생 타이밍, 페이지별 이벤트 규칙
 * - 검증: 이벤트 발생 유무, 발생 순서, 조건부 이벤트
 *
 * @input 2차 QA Excel (이벤트 시트), 개발가이드 PDF
 * @output Collector Agent (수집 시나리오), Validator Agent (검증 기준)
 * @version 1.0
 */

import type {
  PageTypeEnum,
  TriggerType,
  SourceTraceability,
  ChannelCombination,
} from './common';

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: Event Types (이벤트 타입)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 이벤트 발생 조건 타입
 */
export type EventFireCondition =
  | 'auto_fire'       // 페이지 로드 시 자동 발생
  | 'user_action'     // 사용자 액션 필요 (클릭 등)
  | 'conditional'     // 조건 충족 시 발생
  | 'forbidden';      // 발생하면 안 됨

/**
 * 사용자 액션 타입
 */
export type UserActionType =
  | 'page_load'       // 페이지 로드
  | 'click'           // 클릭
  | 'scroll'          // 스크롤
  | 'submit'          // 폼 제출
  | 'hover'           // 마우스 오버
  | 'input'           // 입력
  | 'select'          // 선택
  | 'view'            // 뷰포트 진입 (impression)
  | 'navigate_back'   // 브라우저 뒤로가기
  | 'custom';         // 커스텀

/**
 * 이벤트 카테고리
 */
export type EventCategory =
  | 'pageview'        // 페이지뷰 관련
  | 'ecommerce'       // 이커머스
  | 'engagement'      // 사용자 참여
  | 'conversion'      // 전환
  | 'custom';         // 커스텀

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: Event Definition (이벤트 정의)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 이벤트 정의
 * 검수 대상 개별 이벤트의 상세 정보
 */
export interface EventDefinition {
  /** 이벤트 ID (고유 식별자) */
  event_id: string;
  /** 이벤트명 (개발가이드 기준) */
  event_name: string;
  /** GA4 이벤트명 */
  ga4_event_name: string;
  /** dataLayer 이벤트명 (push 시 사용되는 event 값) */
  dataLayer_event?: string | string[];
  /** 이벤트 설명 */
  description?: string;
  /** 이벤트 카테고리 */
  category: EventCategory;
  /** 트리거 타입 */
  trigger_type: TriggerType;
  /** 발생 조건 타입 */
  fire_condition: EventFireCondition;

  /** 허용 페이지 타입 */
  allowed_page_types: PageTypeEnum[];
  /** 금지 페이지 타입 */
  forbidden_page_types?: PageTypeEnum[];

  /** 이 이벤트가 필요로 하는 선행 이벤트 */
  prerequisite_events?: string[];
  /** 이 이벤트 후 발생해야 하는 후속 이벤트 */
  followup_events?: string[];

  /** 채널별 활성화 여부 */
  enabled_channels: ChannelRequirementForEvent;

  /** 우선순위 (1=최우선) */
  priority?: number;
  /** 소스 추적 */
  _sources?: SourceTraceability;
}

/**
 * 채널별 이벤트 활성화 여부
 */
export interface ChannelRequirementForEvent {
  /** PC 로그인 시 검수 대상 */
  pc_login: boolean;
  /** PC 비로그인 시 검수 대상 */
  pc_no_login: boolean;
  /** 모바일 로그인 시 검수 대상 */
  mo_login: boolean;
  /** 모바일 비로그인 시 검수 대상 */
  mo_no_login: boolean;
}

/**
 * 기본 채널 활성화 (모든 채널)
 */
export const DEFAULT_CHANNEL_ENABLED: ChannelRequirementForEvent = {
  pc_login: true,
  pc_no_login: true,
  mo_login: true,
  mo_no_login: true,
};

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: User Action (사용자 액션)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 사용자 액션 정의
 * 이벤트를 트리거하기 위한 사용자 행동
 */
export interface UserAction {
  /** 액션 ID */
  action_id: string;
  /** 액션 타입 */
  action_type: UserActionType;
  /** 액션 설명 */
  description: string;
  /** 타겟 요소 CSS 선택자 */
  target_selector?: string;
  /** 타겟 요소 설명 (예: "장바구니 담기 버튼") */
  target_description?: string;
  /** 대기 시간 (ms) - 액션 후 이벤트 캡처까지 대기 */
  wait_after_ms?: number;
  /** 추가 데이터 (입력값 등) */
  action_data?: Record<string, unknown>;
  /** 전제조건 액션 목록 - 메인 액션 실행 전에 순서대로 수행 (TesterInsight에서 전달) */
  prerequisite_actions?: PrerequisiteActionStep[];
}

/** 전제조건 액션 단계 (멀티스텝 플로우에서 메인 액션 전에 실행) */
export interface PrerequisiteActionStep {
  /** 액션 타입 */
  action_type: 'click' | 'wait' | 'navigate' | 'scroll' | 'hover';
  /** 대상 셀렉터 (click 시) */
  selector?: string;
  /** 대기 시간 ms (wait 시) */
  wait_ms?: number;
  /** URL (navigate 시) */
  url?: string;
  /** 설명 */
  description: string;
}

/**
 * 조건부 액션
 * 특정 조건이 충족될 때만 수행하는 액션
 */
export interface ConditionalAction extends UserAction {
  /** 조건 */
  condition: ActionCondition;
  /** 조건 미충족 시 대체 액션 */
  fallback_action?: UserAction;
}

/**
 * 액션 조건
 */
export interface ActionCondition {
  /** 조건 타입 */
  type: 'element_exists' | 'element_visible' | 'value_equals' | 'custom';
  /** 조건 표현식/선택자 */
  expression: string;
  /** 기대 값 (value_equals 시) */
  expected_value?: unknown;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: Scenario Definition (시나리오 정의)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 시나리오 정의
 * 페이지 + 액션 + 예상 이벤트의 조합
 */
export interface ScenarioDefinition {
  /** 시나리오 ID */
  scenario_id: string;
  /** 시나리오명 */
  scenario_name: string;
  /** 시나리오 설명 */
  description?: string;

  /** 대상 페이지 타입 */
  page_type: PageTypeEnum;
  /** 대상 페이지 URL 패턴 (glob) */
  page_url_pattern?: string;
  /** 테스트 URL 목록 */
  test_urls?: string[];

  /** 사용자 액션 (없으면 auto-fire) */
  user_action?: UserAction;

  /** 예상 이벤트 목록 */
  expected_events: ExpectedEvent[];

  /** 발생하면 안 되는 이벤트 목록 */
  forbidden_events?: string[];

  /** 시나리오 순서 (실행 순서) */
  sequence_order: number;

  /** 채널별 활성화 */
  enabled_channels: ChannelRequirementForEvent;

  /** 의존 시나리오 (선행 시나리오) */
  depends_on?: string[];

  /** 시나리오 출처 */
  source?: 'excel_cg' | 'synthetic' | 'knowledge_base';

  /** Knowledge Base 참조 (source='knowledge_base'일 때) */
  knowledge_ref?: {
    event_name: string;
    sub_index: number;
    name: string;
    check_points: string;
  };

  /** 채널별 비즈니스 레벨 액션 ID (A001, A002, ...) — Parser에서 할당 */
  channel_action_ids: Record<ChannelCombination, string>;
}

/**
 * 예상 이벤트
 * 시나리오에서 발생해야 하는 이벤트
 */
export interface ExpectedEvent {
  /** 이벤트명 */
  event_name: string;
  /** GA4 이벤트명 */
  ga4_event_name: string;
  /** 필수 발생 여부 */
  required: boolean;
  /** 발생 타이밍 (ms) - 액션 후 이 시간 내에 발생해야 함 */
  expected_within_ms?: number;
  /** 발생 순서 (1부터 시작, 같은 값이면 순서 무관) */
  sequence?: number;
  /** 예상 파라미터 (간략 검증용) */
  expected_params?: ExpectedEventParam[];

  /** 채널별 비즈니스 레벨 이벤트 ID (E001-1, E001-2, ...) — Parser에서 할당 */
  channel_event_ids: Record<ChannelCombination, string>;
}

/**
 * 예상 이벤트 파라미터 (간략)
 */
export interface ExpectedEventParam {
  /** 파라미터명 */
  param_name: string;
  /** 기대 값 (정확한 값 또는 'DYNAMIC') */
  expected_value: unknown | 'DYNAMIC';
  /** 필수 여부 */
  required: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: Page Event Rules (페이지별 이벤트 규칙)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 페이지별 이벤트 규칙
 * 특정 페이지 타입에서의 이벤트 발생 규칙
 */
export interface PageEventRule {
  /** 페이지 타입 */
  page_type: PageTypeEnum;
  /** 자동 발생 이벤트 (페이지 로드 시) */
  auto_fire_events: string[];
  /** 조건부 이벤트 */
  conditional_events: ConditionalEventRule[];
  /** 금지 이벤트 */
  forbidden_events: string[];
}

/**
 * 조건부 이벤트 규칙
 */
export interface ConditionalEventRule {
  /** 이벤트명 */
  event_name: string;
  /** 조건 설명 */
  condition_description: string;
  /** 조건 표현식 */
  condition_expression?: string;
  /** 트리거 타입 */
  trigger_type: TriggerType;
  /** 타겟 선택자 (클릭 등의 경우) */
  target_selector?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: Event Sequence (이벤트 시퀀스)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 이벤트 시퀀스 정의
 * 특정 여정에서 이벤트 발생 순서 검증
 */
export interface EventSequenceDefinition {
  /** 시퀀스 ID */
  sequence_id: string;
  /** 시퀀스명 */
  sequence_name: string;
  /** 설명 */
  description?: string;
  /** 이벤트 순서 목록 */
  events: SequenceEvent[];
  /** 엄격 모드 (순서 완전 일치 필요) */
  strict_order: boolean;
}

/**
 * 시퀀스 내 이벤트
 */
export interface SequenceEvent {
  /** 순서 번호 */
  order: number;
  /** 이벤트명 */
  event_name: string;
  /** 예상 페이지 타입 */
  expected_page_type?: PageTypeEnum;
  /** 선택적 여부 (스킵 가능) */
  optional?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7: Event Scenario Spec (최상위 스펙)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 이벤트 시나리오 스펙
 * 2차 QA(이벤트)의 전체 검수 대상 정의
 *
 * @description
 * Parser Agent가 2차 QA Excel(이벤트 시트)을 파싱하여 생성
 * Collector Agent: 어떤 시나리오를 실행할지
 * Validator Agent: 어떤 기준으로 검증할지
 */
export interface EventScenarioSpec {
  /** 프로젝트 ID */
  project_id: string;
  /** 브랜드 ID */
  brand_id: string;
  /** 버전 */
  version: string;
  /** 생성 시점 (ISO 8601) */
  created_at: string;

  /** 이벤트 정의 목록 */
  events: EventDefinition[];

  /** 시나리오 정의 목록 */
  scenarios: ScenarioDefinition[];

  /** 페이지별 이벤트 규칙 */
  page_rules: PageEventRule[];

  /** 이벤트 시퀀스 정의 (여정 검증) */
  event_sequences?: EventSequenceDefinition[];

  /** 전체 이벤트 수 */
  total_events: number;

  /** 전체 시나리오 수 */
  total_scenarios: number;
}

/**
 * 이벤트 시나리오 스펙 확장
 */
export interface EventScenarioSpecExtended extends EventScenarioSpec {
  /** 소스 파일 정보 */
  source_file?: {
    file_name: string;
    file_path: string;
    sheet_name: string;
    parsed_at: string;
  };

  /** 카테고리별 이벤트 수 */
  count_by_category?: Record<EventCategory, number>;

  /** 페이지 타입별 시나리오 수 */
  count_by_page_type?: Partial<Record<PageTypeEnum, number>>;

  /** 검수 예상 소요 시간 (분) */
  estimated_validation_minutes?: number;

  /** 이벤트 의존성 그래프 */
  event_dependency_graph?: EventDependencyNode[];
}

/**
 * 이벤트 의존성 노드
 */
export interface EventDependencyNode {
  /** 이벤트명 */
  event_name: string;
  /** 의존하는 이벤트들 */
  depends_on: string[];
  /** 이 이벤트에 의존하는 이벤트들 */
  depended_by: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 8: Helper Types & Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 이벤트별 시나리오 맵
 */
export type ScenariosByEvent = Map<string, ScenarioDefinition[]>;

/**
 * 페이지 타입별 시나리오 맵
 */
export type ScenariosByPageType = Partial<Record<PageTypeEnum, ScenarioDefinition[]>>;

/**
 * 채널별 시나리오 맵
 */
export type ScenariosByChannel = Record<ChannelCombination, ScenarioDefinition[]>;

/**
 * 이벤트 시나리오 스펙 파싱 결과
 */
export interface EventScenarioSpecParseResult {
  /** 성공 여부 */
  success: boolean;
  /** 파싱된 스펙 */
  spec?: EventScenarioSpec;
  /** 오류 메시지 */
  errors?: string[];
  /** 경고 메시지 */
  warnings?: string[];
  /** 파싱 통계 */
  stats?: {
    total_rows_processed: number;
    events_parsed: number;
    scenarios_parsed: number;
    rules_parsed: number;
    parse_duration_ms: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 9: Constants
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GA4 표준 이커머스 이벤트 목록
 */
export const GA4_ECOMMERCE_EVENTS = [
  'view_item',
  'view_item_list',
  'select_item',
  'add_to_cart',
  'remove_from_cart',
  'view_cart',
  'begin_checkout',
  'add_shipping_info',
  'add_payment_info',
  'purchase',
  'refund',
] as const;

/**
 * 페이지뷰 관련 이벤트 목록
 */
export const PAGEVIEW_EVENTS = [
  'page_view',
  'virtual_page_view',
  'screen_view',
] as const;

/**
 * 이벤트 발생 조건 설명
 */
export const EVENT_FIRE_CONDITION_DESCRIPTIONS: Record<EventFireCondition, string> = {
  auto_fire: '페이지 로드 시 자동으로 발생해야 하는 이벤트',
  user_action: '사용자 액션(클릭, 스크롤 등)에 의해 발생하는 이벤트',
  conditional: '특정 조건이 충족될 때 발생하는 이벤트',
  forbidden: '해당 페이지에서 발생하면 안 되는 이벤트',
};

/**
 * 사용자 액션 타입 설명
 */
export const USER_ACTION_TYPE_DESCRIPTIONS: Record<UserActionType, string> = {
  page_load: '페이지 로드',
  click: '요소 클릭',
  scroll: '페이지 스크롤',
  submit: '폼 제출',
  hover: '마우스 오버',
  input: '텍스트 입력',
  select: '옵션 선택',
  view: '뷰포트 진입 (노출)',
  navigate_back: '브라우저 뒤로가기',
  custom: '커스텀 액션',
};

/**
 * 기본 이벤트 대기 시간 (ms)
 */
export const DEFAULT_EVENT_WAIT_MS = 3000;

/**
 * 이벤트 캡처 타임아웃 (ms)
 */
export const EVENT_CAPTURE_TIMEOUT_MS = 10000;
