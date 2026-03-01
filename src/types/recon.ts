/**
 * Site Recon Agent 타입 정의
 *
 * 실제 페이지를 방문하여:
 * 1. Content Group (AP_DATA_PAGETYPE) 개발 상태 확인
 * 2. 어떤 이벤트가 자동 발생하는지 관찰
 * 3. 액션 이벤트 트리거를 위한 DOM 셀렉터를 동적 발견
 * 4. 발견된 셀렉터를 기존 파이프라인의 target_selector로 주입
 *
 * @version 1.0
 */

import type { PageTypeEnum } from './common';
import type {
  ScreenshotResult,
  VisualPageAnalysis,
  EventHypothesis,
  KnowledgeReadinessReport,
} from './knowledge-state';

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: Phase 1 - Content Group 검증
// ═══════════════════════════════════════════════════════════════════════════

/** Content Group 검증 상태 */
export type ContentGroupStatus = 'match' | 'mismatch' | 'missing';

/** Content Group 검증 결과 */
export interface ContentGroupCheck {
  /** 방문한 URL */
  url: string;
  /** Parser가 예상한 페이지 타입 */
  expected_page_type: PageTypeEnum;
  /** 실제 AP_DATA_PAGETYPE 값 */
  actual_content_group: string | undefined;
  /** CG → PageType 변환 결과 */
  matched_page_type: PageTypeEnum | undefined;
  /** 검증 상태 */
  status: ContentGroupStatus;
  /** 사용자가 수동 지정한 경우 */
  user_override?: PageTypeEnum;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: Phase 2 - Auto-Fire 이벤트 발견
// ═══════════════════════════════════════════════════════════════════════════

/** Auto-Fire 이벤트 발견 결과 */
export interface AutoFireDiscovery {
  /** 방문한 URL */
  url: string;
  /** 페이지 타입 */
  page_type: PageTypeEnum;
  /** Parser가 예상한 auto-fire 이벤트 */
  expected_events: string[];
  /** 실제 발생한 이벤트 */
  actual_events: string[];
  /** 일치한 이벤트 */
  matched: string[];
  /** 예상했지만 미발생 */
  missing: string[];
  /** 예상 외 발생 */
  extra: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: Phase 3 - 셀렉터 발견
// ═══════════════════════════════════════════════════════════════════════════

/** 셀렉터 발견 방법 */
export type SelectorDiscoveryMethod =
  | 'semantic'             // 텍스트 매칭 (키워드 기반)
  | 'aria'                 // aria-label 매칭
  | 'data_attr'            // data-* 속성 매칭
  | 'text_match'           // 정확한 텍스트 매칭
  | 'form_role'            // form/button role 기반
  | 'heuristic'            // class/id 패턴 기반
  | 'manual'               // 사용자 수동 입력
  | 'tester_pre_interview'; // 테스터 사전 인터뷰 제공

/** 셀렉터 후보 */
export interface SelectorCandidate {
  /** CSS 셀렉터 */
  selector: string;
  /** 요소 텍스트 내용 */
  text_content: string;
  /** HTML 태그명 */
  tag_name: string;
  /** 매칭된 요소 수 */
  match_count: number;
  /** 신뢰도 (0~1) */
  confidence: number;
  /** 발견 방법 */
  discovery_method: SelectorDiscoveryMethod;
}

/** 액션 안전 레벨 */
export type ActionSafetyLevel = 'safe' | 'cautious' | 'destructive';

/** Trial click 결과 */
export interface TrialClickResult {
  /** 이벤트가 트리거되었는지 */
  triggered_event: boolean;
  /** 캡처된 이벤트명 목록 */
  events_captured: string[];
}

/** 액션 셀렉터 발견 결과 */
export interface ActionSelectorDiscovery {
  /** GA4 이벤트명 */
  event_name: string;
  /** 페이지 타입 */
  page_type: PageTypeEnum;
  /** 방문한 URL */
  url: string;
  /** 후보 셀렉터 목록 */
  candidates: SelectorCandidate[];
  /** Agent 추천 셀렉터 */
  selected: SelectorCandidate | null;
  /** 사용자가 확정한 셀렉터 */
  user_confirmed?: string;
  /** 안전 레벨 */
  safety_level: ActionSafetyLevel;
  /** Trial click 결과 (safe 이벤트만) */
  trial_click_result?: TrialClickResult;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: Phase 4 - 전체 Recon Report
// ═══════════════════════════════════════════════════════════════════════════

/** Recon 결과 요약 */
export interface ReconSummary {
  /** 방문한 페이지 수 */
  pages_visited: number;
  /** Content Group 일치율 (0~1) */
  cg_match_rate: number;
  /** Auto-fire 이벤트 일치율 (0~1) */
  auto_fire_match_rate: number;
  /** 자동 발견 셀렉터 수 */
  selectors_found: number;
  /** 수동 입력 셀렉터 수 */
  selectors_manual: number;
  /** 미발견 셀렉터 수 */
  selectors_missing: number;
}

/** 전체 Recon 리포트 */
export interface SiteReconReport {
  /** 프로젝트 ID */
  project_id: string;
  /** Recon 실행 시점 */
  recon_timestamp: string;
  /** Phase 1 결과 */
  content_group_checks: ContentGroupCheck[];
  /** Phase 2 결과 */
  auto_fire_discoveries: AutoFireDiscovery[];
  /** Phase 3 결과 (셀렉터 발견) */
  selector_discoveries: ActionSelectorDiscovery[];
  /** 요약 */
  summary: ReconSummary;
  /** Phase 3(new): 스크린샷 결과 */
  screenshots?: ScreenshotResult[];
  /** Phase 4(new): Gemini 시각 분석 결과 */
  visual_analyses?: VisualPageAnalysis[];
  /** Phase 5(new): AI 가설 */
  hypotheses?: EventHypothesis[];
  /** Knowledge Readiness Report */
  knowledge_readiness?: KnowledgeReadinessReport;
  /** 테스터 사전 인터뷰 인사이트 (eventName:pageType → TesterInsight) */
  pre_interview_insights?: Record<string, import('../types/knowledge-state').TesterInsight>;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: Recon → Pipeline 연동
// ═══════════════════════════════════════════════════════════════════════════

/** 셀렉터 출처 */
export type SelectorSource =
  | 'recon_auto'       // Recon이 자동 발견
  | 'recon_manual'     // 사용자가 Recon 중 수동 입력
  | 'parser_fallback'  // 기존 Parser 폴백 유지
  | 'none';            // 셀렉터 없음

/** Recon enriched 시나리오 (파이프라인 주입용) */
export interface ReconEnrichedScenario {
  /** 시나리오 ID */
  scenario_id: string;
  /** Recon이 발견한 셀렉터 */
  enriched_selector?: string;
  /** 셀렉터 출처 */
  selector_source: SelectorSource;
  /** Content Group 검증 여부 */
  content_group_verified: boolean;
  /** Auto-fire 검증 여부 */
  auto_fire_verified: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: Recon Options
// ═══════════════════════════════════════════════════════════════════════════

/** Recon 실행 옵션 */
export interface ReconOptions {
  /** 인터랙티브 모드 (사용자 확인 대기) */
  interactive: boolean;
  /** 추천 셀렉터 자동 승인 */
  autoConfirm?: boolean;
  /** 이전 Recon 캐시 경로 */
  cachePath?: string;
  /** 이벤트 대기 시간 (ms) */
  waitMs?: number;
  /** Knowledge Store 경로 */
  knowledgeStorePath?: string;
  /** 출력 디렉토리 (스크린샷 등) */
  outputDir?: string;
  /** Visual Analysis 활성화 (Gemini Vision) */
  enableVisualAnalysis?: boolean;
  /** Gemini API Key */
  geminiApiKey?: string;
  /** 테스터 사전 인터뷰 활성화 */
  enablePreInterview?: boolean;
}
