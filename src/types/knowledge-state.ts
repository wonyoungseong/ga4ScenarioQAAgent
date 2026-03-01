/**
 * Knowledge State Types - Knowledge Readiness + Visual Intelligence Layer
 *
 * 이벤트별 "어떤 소스에서 무엇을 알고 있고, 무엇이 부족한지" 추적.
 * AI(Gemini Vision) 가설 생성, 테스터 확인, 지식 축적 구조.
 *
 * @version 1.0
 */

import type { PageTypeEnum } from './common';
import type { EventFireCondition, UserActionType } from './event-scenario';
import type { ActionSafetyLevel, SelectorDiscoveryMethod } from './recon';
import type { SourceProvenance } from '../knowledge/source-authority';

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: Knowledge Source & Confidence
// ═══════════════════════════════════════════════════════════════════════════

/** 지식 출처 추적 (기존 SourceProvenance 확장) */
export type KnowledgeSourceType =
  | SourceProvenance
  | 'recon_visual'
  | 'tester_confirmed'
  | 'knowledge_store';

/** 신뢰도 레벨 */
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unverified';

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: Knowledge Claim
// ═══════════════════════════════════════════════════════════════════════════

/** 단일 지식 클레임 */
export interface KnowledgeClaim<T = unknown> {
  /** 값 */
  value: T;
  /** 지식 출처 */
  source: KnowledgeSourceType;
  /** 신뢰도 */
  confidence: ConfidenceLevel;
  /** 확립 시점 (ISO 8601) */
  established_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: Knowledge Gap
// ═══════════════════════════════════════════════════════════════════════════

/** 갭 분류 */
export type GapType =
  | 'selector_missing'
  | 'url_missing'
  | 'precondition_unknown'
  | 'fire_condition_unknown'
  | 'page_type_unknown'
  | 'business_rule_missing'
  | 'action_type_unknown';

/** 갭 해결 방법 */
export type GapResolutionMethod =
  | 'crawlable'
  | 'visual_analysis'
  | 'ask_tester'
  | 'needs_document'
  | 'manual_only';

/** 지식 갭 */
export interface KnowledgeGap {
  /** 이벤트명 */
  event_name: string;
  /** 갭 종류 */
  gap_type: GapType;
  /** 해결 방법 */
  resolution_method: GapResolutionMethod;
  /** 설명 */
  description: string;
  /** 우선순위 (1=최우선) */
  priority: number;
  /** 해결을 위한 제안 액션 */
  suggested_action?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: Event Readiness
// ═══════════════════════════════════════════════════════════════════════════

/** 이벤트 준비도 */
export type EventReadiness =
  | 'ready'           // 즉시 테스트 가능
  | 'ready_partial'   // 일부 페이지에서만 테스트 가능
  | 'needs_recon'     // Recon으로 셀렉터 발견 필요
  | 'needs_tester'    // 테스터 확인 필요
  | 'needs_document'  // 추가 문서 필요
  | 'manual_only'     // 수동 테스트만 가능
  | 'skip';           // 스킵 (테스트 불필요/불가)

/** 추천 액션 */
export interface RecommendedAction {
  /** 액션 타입 */
  action: 'proceed' | 'run_recon' | 'ask_tester' | 'request_document' | 'skip';
  /** 사유 */
  reason: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: Event Knowledge State (핵심 타입)
// ═══════════════════════════════════════════════════════════════════════════

/** 이벤트별 지식 상태 */
export interface EventKnowledgeState {
  /** 이벤트명 */
  event_name: string;
  /** 발생 조건 */
  fire_condition: KnowledgeClaim<EventFireCondition> | null;
  /** 액션 타입 */
  action_type: KnowledgeClaim<UserActionType> | null;
  /** 타겟 셀렉터 */
  target_selector: KnowledgeClaim<string> | null;
  /** 페이지 타입 */
  page_types: KnowledgeClaim<PageTypeEnum[]> | null;
  /** 테스트 URL (pageType → url[]) */
  test_urls: KnowledgeClaim<Record<string, string[]>> | null;
  /** 전제조건 ("옵션 선택 필요" 등) */
  prerequisites: KnowledgeClaim<string[]> | null;
  /** 비즈니스 규칙 */
  business_rules: KnowledgeClaim<{ should_fire: string[]; should_not_fire: string[] }> | null;
  /** 안전 레벨 */
  safety_level: ActionSafetyLevel;
  /** 지식 갭 목록 */
  gaps: KnowledgeGap[];
  /** 이벤트 준비도 */
  readiness: EventReadiness;
  /** 추천 액션 */
  recommended_action: RecommendedAction;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: Tester Interaction
// ═══════════════════════════════════════════════════════════════════════════

/** 테스터 질문 */
export interface TesterQuestion {
  /** 질문 ID */
  question_id: string;
  /** 이벤트명 */
  event_name: string;
  /** 갭 타입 */
  gap_type: GapType;
  /** 질문 텍스트 */
  question: string;
  /** 제안 답변 (있으면) */
  suggested_answer?: string;
  /** 우선순위 */
  priority: number;
}

/** 테스터 응답 */
export interface TesterResponse {
  /** 가설 ID */
  hypothesis_id: string;
  /** 응답 타입 */
  response: 'confirmed' | 'corrected' | 'rejected' | 'skipped';
  /** 수정된 값 (corrected 시) */
  correction?: string;
  /** 메모 */
  note?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7: Hypothesis (가설)
// ═══════════════════════════════════════════════════════════════════════════

/** 이벤트 가설 */
export interface EventHypothesis {
  /** 가설 ID */
  hypothesis_id: string;
  /** 이벤트명 */
  event_name: string;
  /** 페이지 타입 */
  page_type: PageTypeEnum;
  /** 가설 문장 ("カートに入れる 버튼 클릭 시 add_to_cart 발생") */
  statement: string;
  /** 트리거 정보 */
  trigger: {
    action_type: UserActionType;
    suggested_selector?: string;
    trigger_text?: string;
  };
  /** 전제조건 */
  prerequisites: string[];
  /** 근거 소스 */
  sources: KnowledgeSourceType[];
  /** 신뢰도 (0.0~1.0) */
  confidence: number;
  /** 확인 상태 */
  confirmation_status: 'pending' | 'confirmed' | 'corrected' | 'rejected';
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 8: Visual Analysis (Gemini Vision)
// ═══════════════════════════════════════════════════════════════════════════

/** 시각적 요소 */
export interface VisualElement {
  /** 설명 */
  description: string;
  /** 목적 */
  purpose: string;
  /** 위치 */
  location: 'header' | 'main_content' | 'sidebar' | 'footer' | 'modal' | 'floating';
  /** 추정 식별자 */
  suggested_identifier?: string;
  /** 보이는 텍스트 */
  visible_text?: string;
  /** 추정 연관 이벤트 */
  likely_events: string[];
  /** 신뢰도 */
  confidence: number;
}

/** 이커머스 컨텍스트 */
export interface EcommerceContext {
  /** 상품 페이지 여부 */
  is_product_page: boolean;
  /** 상품 옵션 존재 여부 */
  has_product_options: boolean;
  /** 장바구니 담기 버튼 존재 */
  has_add_to_cart: boolean;
  /** 결제 진입점 존재 */
  has_checkout_entry: boolean;
  /** 관찰된 전제조건 ("사이즈 선택 필요" 등) */
  observed_prerequisites: string[];
}

/** Gemini 시각 분석 결과 */
export interface VisualPageAnalysis {
  /** 분석 대상 URL */
  url: string;
  /** 스크린샷 파일 경로 */
  screenshot_path: string;
  /** 식별된 페이지 타입 */
  identified_page_type?: string;
  /** 인터랙티브 요소 목록 */
  interactive_elements: VisualElement[];
  /** 이커머스 컨텍스트 */
  ecommerce_context?: EcommerceContext;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 9: Screenshot Result
// ═══════════════════════════════════════════════════════════════════════════

/** 스크린샷 캡처 결과 */
export interface ScreenshotResult {
  /** 페이지 타입 */
  page_type: PageTypeEnum;
  /** URL */
  url: string;
  /** 스크린샷 파일 경로 */
  screenshot_path: string;
  /** 채널 */
  channel: string;
  /** 캡처 시점 (ISO 8601) */
  captured_at: string;
  /** 성공 여부 */
  success: boolean;
  /** 에러 메시지 */
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 9.5: Pre-Interview (테스터 사전 인터뷰)
// ═══════════════════════════════════════════════════════════════════════════

/** 요소 위치 (인터뷰 답변에서 사용) */
export type ElementLocation =
  | 'product_form'       // 상품 폼 내부
  | 'sticky_bar'         // 하단 고정바
  | 'cart_drawer'        // 카트 드로어 내부
  | 'cart_page'          // 카트 페이지 내부
  | 'header'             // 헤더
  | 'main_content'       // 메인 콘텐츠
  | 'modal'              // 모달
  | 'third_party_widget' // 서드파티 위젯
  | 'unknown';

/** 사전 인터뷰 질문 */
export interface PreInterviewQuestion {
  /** 질문 ID (예: atc_flow_1) */
  question_id: string;
  /** 대상 이벤트명 */
  event_name: string;
  /** 질문 카테고리 */
  category: 'flow' | 'prerequisite' | 'visual' | 'technical' | 'post_action' | 'multi_step';
  /** 질문 텍스트 */
  question: string;
  /** 선택지 (null이면 자유입력) */
  options: string[] | null;
  /** 기본값 */
  default_value?: string;
  /** 이 질문의 목적 설명 */
  purpose: string;
  /** 우선순위 (1=최우선) */
  priority: number;
}

/** 사전 인터뷰 답변 */
export interface PreInterviewAnswer {
  /** 질문 ID */
  question_id: string;
  /** 선택된 값 또는 자유입력 */
  value: string;
  /** 답변 시점 (ISO 8601) */
  answered_at: string;
}

/** 컴파일된 테스터 인사이트 (DOM 분석에 전달) */
export interface TesterInsight {
  /** 대상 이벤트명 */
  event_name: string;
  /** 대상 페이지 타입 */
  page_type: string;
  /** 테스터가 직접 제공한 셀렉터 */
  known_selector?: string;
  /** 트리거 요소의 텍스트 */
  trigger_text?: string;
  /** 요소 위치 */
  element_location?: ElementLocation;
  /** 멀티스텝 여부 */
  is_multi_step: boolean;
  /** 전제조건 액션 목록 (순서대로 실행) */
  prerequisite_actions: PrerequisiteAction[];
  /** 서드파티 도구명 (Loox, Judge.me 등) */
  third_party_tool?: string;
  /** 카트 추가 후 동작 */
  post_add_to_cart_behavior?: 'cart_drawer_opens' | 'navigate_to_cart' | 'toast_notification' | 'stay_on_page';
  /** Shopify 표준 form submit 사용 여부 */
  uses_standard_form?: boolean;
  /** 원본 답변 배열 */
  raw_answers: PreInterviewAnswer[];
  /** 컴파일 시점 (ISO 8601) */
  compiled_at: string;
}

/** 전제조건 액션 (멀티스텝 플로우에서 실행) */
export interface PrerequisiteAction {
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

/** 전체 인터뷰 결과 */
export interface PreInterviewResult {
  /** 질문된 이벤트 목록 */
  interviewed_events: string[];
  /** 자동 스킵된 이벤트 목록 */
  skipped_events: string[];
  /** 이벤트+페이지타입별 인사이트 */
  insights: Record<string, TesterInsight>;  // key: `${eventName}:${pageType}`
  /** 인터뷰 시점 (ISO 8601) */
  interviewed_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 10: Knowledge Store (영구 저장)
// ═══════════════════════════════════════════════════════════════════════════

/** 저장된 셀렉터 */
export interface StoredSelector {
  /** CSS 셀렉터 */
  selector: string;
  /** 발견 방법 */
  discovery_method: SelectorDiscoveryMethod | 'visual_analysis' | 'tester_confirmed' | 'tester_pre_interview';
  /** 요소 텍스트 */
  visible_text?: string;
  /** 성공 횟수 */
  success_count: number;
  /** 실패 횟수 */
  failure_count: number;
  /** 마지막 성공 시점 */
  last_success?: string;
  /** 신뢰도 (0.0~1.0) */
  confidence: number;
}

/** 저장된 이벤트 지식 */
export interface StoredEventKnowledge {
  /** 이벤트명 */
  event_name: string;
  /** 마지막 검증 시점 */
  last_verified: string;
  /** 테스터 확인 횟수 */
  confirmation_count: number;
  /** 페이지타입별 셀렉터 */
  selectors: Record<string, StoredSelector>;
  /** 페이지타입별 전제조건 */
  prerequisites: Record<string, string[]>;
  /** 테스터 메모 */
  tester_notes: string[];
  /** 테스터 인터뷰 답변 (pageType → TesterInsight) */
  tester_insights?: Record<string, TesterInsight>;
}

/** 저장된 페이지 지식 */
export interface StoredPageKnowledge {
  /** 페이지 타입 */
  page_type: PageTypeEnum;
  /** 대표 URL */
  representative_url: string;
  /** 마지막 스크린샷 경로 */
  last_screenshot_path?: string;
  /** 마지막 시각 분석 시점 */
  last_visual_analysis?: string;
  /** Content Group 값 */
  content_group_value?: string;
}

/** Knowledge Store 통계 */
export interface KnowledgeStoreStats {
  /** 총 이벤트 수 */
  total_events: number;
  /** 검증된 셀렉터 수 */
  verified_selectors: number;
  /** 테스터 확인 횟수 */
  total_confirmations: number;
  /** 자동 확인 비율 (0.0~1.0) */
  auto_confirm_rate: number;
}

/** Knowledge Store (영구 저장) */
export interface KnowledgeStore {
  /** 스키마 버전 */
  schema_version: '1.0';
  /** 마지막 업데이트 시점 */
  last_updated: string;
  /** 프로젝트 ID */
  project_id: string;
  /** 사이트 기본 URL */
  site_base_url: string;
  /** 이벤트별 지식 */
  events: Record<string, StoredEventKnowledge>;
  /** 페이지별 지식 */
  pages: Record<string, StoredPageKnowledge>;
  /** 통계 */
  stats: KnowledgeStoreStats;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 11: Knowledge Readiness Report (Step 1.5 출력)
// ═══════════════════════════════════════════════════════════════════════════

/** Knowledge Readiness Report */
export interface KnowledgeReadinessReport {
  /** 평가 시점 (ISO 8601) */
  assessed_at: string;
  /** 이벤트별 지식 상태 */
  event_states: EventKnowledgeState[];
  /** 요약 */
  summary: {
    total_events: number;
    ready_count: number;
    needs_recon_count: number;
    needs_tester_count: number;
    manual_only_count: number;
    readiness_rate: number;
  };
  /** 우선순위 정렬된 갭 목록 */
  prioritized_gaps: KnowledgeGap[];
  /** 테스터에게 할 질문 목록 */
  tester_questions: TesterQuestion[];
}
