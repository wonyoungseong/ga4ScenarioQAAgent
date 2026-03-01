/**
 * Knowledge Store CRUD
 *
 * 영구 저장소 ({outputDir}/knowledge-store.json)에 대한
 * load/save/merge/query 오퍼레이션을 제공합니다.
 *
 * 기존 recon-cache.json 패턴을 재사용합니다.
 *
 * @version 1.0
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  KnowledgeStore,
  StoredEventKnowledge,
  StoredSelector,
  KnowledgeStoreStats,
  TesterInsight,
} from '../types/knowledge-state';

// ─────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────

const SCHEMA_VERSION = '1.0' as const;

/** 자동 확인 조건 임계값 */
const AUTO_CONFIRM_MIN_CONFIRMATIONS = 2;
const AUTO_CONFIRM_MIN_SUCCESSES = 3;
const AUTO_CONFIRM_MAX_DAYS_SINCE_SUCCESS = 7;
const AUTO_CONFIRM_MIN_CONFIDENCE = 0.85;

// ─────────────────────────────────────────────────────────────────────
// Load / Save
// ─────────────────────────────────────────────────────────────────────

/**
 * Knowledge Store를 파일에서 로드합니다.
 *
 * @param storePath - JSON 파일 경로
 * @returns 로드된 KnowledgeStore 또는 파일이 없으면 null
 */
export function loadKnowledgeStore(storePath: string): KnowledgeStore | null {
  try {
    if (!fs.existsSync(storePath)) {
      return null;
    }
    const content = fs.readFileSync(storePath, 'utf-8');
    const parsed = JSON.parse(content) as KnowledgeStore;

    // 스키마 버전 호환성 체크
    if (parsed.schema_version !== SCHEMA_VERSION) {
      console.warn(
        `Knowledge Store 스키마 버전 불일치: ${parsed.schema_version} (기대: ${SCHEMA_VERSION}). 새 스토어를 생성합니다.`,
      );
      return null;
    }

    return parsed;
  } catch (e) {
    console.warn(`Knowledge Store 로드 실패: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/**
 * Knowledge Store를 파일에 저장합니다.
 *
 * @param store - 저장할 KnowledgeStore
 * @param storePath - JSON 파일 경로
 */
export function saveKnowledgeStore(store: KnowledgeStore, storePath: string): void {
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 통계 재계산
  store.stats = computeStats(store);
  store.last_updated = new Date().toISOString();

  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8');
}

// ─────────────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────────────

/**
 * 빈 Knowledge Store를 생성합니다.
 *
 * @param projectId - 프로젝트 ID
 * @param siteBaseUrl - 사이트 기본 URL
 * @returns 새 KnowledgeStore
 */
export function createEmptyStore(projectId: string, siteBaseUrl: string): KnowledgeStore {
  return {
    schema_version: SCHEMA_VERSION,
    last_updated: new Date().toISOString(),
    project_id: projectId,
    site_base_url: siteBaseUrl,
    events: {},
    pages: {},
    stats: {
      total_events: 0,
      verified_selectors: 0,
      total_confirmations: 0,
      auto_confirm_rate: 0,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
// Merge / Update
// ─────────────────────────────────────────────────────────────────────

/**
 * 이벤트 지식을 병합합니다.
 * 기존 데이터가 있으면 부분 업데이트, 없으면 새로 생성합니다.
 *
 * @param store - Knowledge Store
 * @param eventName - 이벤트명
 * @param knowledge - 병합할 지식 (부분)
 */
export function mergeEventKnowledge(
  store: KnowledgeStore,
  eventName: string,
  knowledge: Partial<StoredEventKnowledge>,
): void {
  const existing = store.events[eventName];

  if (existing) {
    // 부분 업데이트
    if (knowledge.selectors) {
      for (const [pageType, selector] of Object.entries(knowledge.selectors)) {
        existing.selectors[pageType] = selector;
      }
    }
    if (knowledge.prerequisites) {
      for (const [pageType, prereqs] of Object.entries(knowledge.prerequisites)) {
        existing.prerequisites[pageType] = prereqs;
      }
    }
    if (knowledge.tester_notes) {
      // 중복 제거하며 추가
      const noteSet = new Set([...existing.tester_notes, ...knowledge.tester_notes]);
      existing.tester_notes = [...noteSet];
    }
    if (knowledge.confirmation_count !== undefined) {
      existing.confirmation_count = knowledge.confirmation_count;
    }
    existing.last_verified = knowledge.last_verified ?? new Date().toISOString();
  } else {
    // 새로 생성
    store.events[eventName] = {
      event_name: eventName,
      last_verified: new Date().toISOString(),
      confirmation_count: 0,
      selectors: {},
      prerequisites: {},
      tester_notes: [],
      ...knowledge,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Query
// ─────────────────────────────────────────────────────────────────────

/**
 * 저장된 셀렉터를 조회합니다.
 *
 * @param store - Knowledge Store
 * @param eventName - 이벤트명
 * @param pageType - 페이지 타입
 * @returns StoredSelector 또는 undefined
 */
export function getStoredSelector(
  store: KnowledgeStore,
  eventName: string,
  pageType: string,
): StoredSelector | undefined {
  return store.events[eventName]?.selectors[pageType];
}

/**
 * 저장된 전제조건을 조회합니다.
 *
 * @param store - Knowledge Store
 * @param eventName - 이벤트명
 * @param pageType - 페이지 타입
 * @returns 전제조건 배열 또는 빈 배열
 */
export function getStoredPrerequisites(
  store: KnowledgeStore,
  eventName: string,
  pageType: string,
): string[] {
  return store.events[eventName]?.prerequisites[pageType] ?? [];
}

// ─────────────────────────────────────────────────────────────────────
// Selector Result Recording
// ─────────────────────────────────────────────────────────────────────

/**
 * 셀렉터 사용 결과를 기록합니다.
 * Validator 실행 후 호출하여 성공/실패 카운트를 업데이트합니다.
 *
 * @param store - Knowledge Store
 * @param eventName - 이벤트명
 * @param pageType - 페이지 타입
 * @param success - 성공 여부
 */
export function recordSelectorResult(
  store: KnowledgeStore,
  eventName: string,
  pageType: string,
  success: boolean,
): void {
  const eventKnowledge = store.events[eventName];
  if (!eventKnowledge) return;

  const selector = eventKnowledge.selectors[pageType];
  if (!selector) return;

  if (success) {
    selector.success_count++;
    selector.last_success = new Date().toISOString();
    // 성공 시 confidence 상승 (최대 0.95)
    selector.confidence = Math.min(0.95, selector.confidence + 0.05);
  } else {
    selector.failure_count++;
    // 실패 시 confidence 하락 (최소 0.1)
    selector.confidence = Math.max(0.1, selector.confidence - 0.15);
  }
}

/**
 * 테스터 확인을 기록합니다.
 *
 * @param store - Knowledge Store
 * @param eventName - 이벤트명
 */
export function recordTesterConfirmation(
  store: KnowledgeStore,
  eventName: string,
): void {
  const eventKnowledge = store.events[eventName];
  if (!eventKnowledge) return;

  eventKnowledge.confirmation_count++;
  eventKnowledge.last_verified = new Date().toISOString();
}

// ─────────────────────────────────────────────────────────────────────
// Auto-Confirm Logic
// ─────────────────────────────────────────────────────────────────────

/**
 * 자동 확인 가능 여부를 판정합니다.
 *
 * 자동 확인 조건:
 * - confirmation_count >= 2 (2회 이상 테스터 확인)
 * - success_count >= 3 && failure_count === 0 (3회 이상 성공, 실패 0)
 * - last_success 7일 이내
 * - confidence >= 0.85
 *
 * @param store - Knowledge Store
 * @param eventName - 이벤트명
 * @param pageType - 페이지 타입
 * @returns 자동 확인 가능 여부
 */
export function shouldAutoConfirm(
  store: KnowledgeStore,
  eventName: string,
  pageType: string,
): boolean {
  const eventKnowledge = store.events[eventName];
  if (!eventKnowledge) return false;

  // 조건 1: 테스터 확인 횟수
  if (eventKnowledge.confirmation_count < AUTO_CONFIRM_MIN_CONFIRMATIONS) {
    return false;
  }

  const selector = eventKnowledge.selectors[pageType];
  if (!selector) return false;

  // 조건 2: 성공 횟수 & 실패 없음
  if (selector.success_count < AUTO_CONFIRM_MIN_SUCCESSES || selector.failure_count > 0) {
    return false;
  }

  // 조건 3: 최근 성공
  if (selector.last_success) {
    const daysSinceSuccess =
      (Date.now() - new Date(selector.last_success).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceSuccess > AUTO_CONFIRM_MAX_DAYS_SINCE_SUCCESS) {
      return false;
    }
  } else {
    return false;
  }

  // 조건 4: confidence 임계값
  if (selector.confidence < AUTO_CONFIRM_MIN_CONFIDENCE) {
    return false;
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────────
// Tester Insight CRUD
// ─────────────────────────────────────────────────────────────────────

/**
 * 테스터 인사이트를 Knowledge Store에 저장합니다.
 *
 * @param store - Knowledge Store
 * @param eventName - 이벤트명
 * @param pageType - 페이지 타입
 * @param insight - 테스터 인사이트
 */
export function saveTesterInsight(
  store: KnowledgeStore,
  eventName: string,
  pageType: string,
  insight: TesterInsight,
): void {
  // 이벤트 항목이 없으면 생성
  if (!store.events[eventName]) {
    store.events[eventName] = {
      event_name: eventName,
      last_verified: new Date().toISOString(),
      confirmation_count: 0,
      selectors: {},
      prerequisites: {},
      tester_notes: [],
    };
  }

  const eventKnowledge = store.events[eventName];

  // tester_insights 맵 초기화
  if (!eventKnowledge.tester_insights) {
    eventKnowledge.tester_insights = {};
  }

  eventKnowledge.tester_insights[pageType] = insight;
  eventKnowledge.last_verified = new Date().toISOString();
}

/**
 * 저장된 테스터 인사이트를 조회합니다.
 *
 * @param store - Knowledge Store
 * @param eventName - 이벤트명
 * @param pageType - 페이지 타입
 * @returns TesterInsight 또는 undefined
 */
export function loadTesterInsight(
  store: KnowledgeStore,
  eventName: string,
  pageType: string,
): TesterInsight | undefined {
  return store.events[eventName]?.tester_insights?.[pageType];
}

// ─────────────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Knowledge Store 통계를 계산합니다.
 */
function computeStats(store: KnowledgeStore): KnowledgeStoreStats {
  const events = Object.values(store.events);
  const totalEvents = events.length;

  let verifiedSelectors = 0;
  let totalConfirmations = 0;
  let autoConfirmable = 0;
  let totalSelectors = 0;

  for (const event of events) {
    totalConfirmations += event.confirmation_count;
    for (const [_pageType, selector] of Object.entries(event.selectors)) {
      totalSelectors++;
      if (selector.success_count >= AUTO_CONFIRM_MIN_SUCCESSES && selector.failure_count === 0) {
        verifiedSelectors++;
      }
      if (selector.confidence >= AUTO_CONFIRM_MIN_CONFIDENCE) {
        autoConfirmable++;
      }
    }
  }

  return {
    total_events: totalEvents,
    verified_selectors: verifiedSelectors,
    total_confirmations: totalConfirmations,
    auto_confirm_rate: totalSelectors > 0 ? autoConfirmable / totalSelectors : 0,
  };
}
