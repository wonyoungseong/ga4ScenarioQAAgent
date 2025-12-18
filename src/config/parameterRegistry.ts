/**
 * Parameter Registry - Agent의 단일 파라미터 참조 포인트
 *
 * 모든 Agent는 이 레지스트리를 통해 파라미터 정보를 조회합니다.
 * PARAM_MAPPING_TABLE.md가 업데이트되면 reload()를 호출하여 갱신합니다.
 *
 * 데이터 흐름:
 * PARAM_MAPPING_TABLE.md (사람이 관리) → Parser → Registry (Agent 조회)
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  loadParameterStore,
  getParameterQueryService,
  ParameterQueryService,
  UnifiedParameterStore,
  getGA4ApiDimension,
} from '../parsers/paramMappingParser';

/**
 * 파라미터 레지스트리 상태
 */
interface RegistryState {
  initialized: boolean;
  store: UnifiedParameterStore | null;
  queryService: ParameterQueryService | null;
  sourceFilePath: string;
  lastModified: Date | null;
  lastLoaded: Date | null;
}

const state: RegistryState = {
  initialized: false,
  store: null,
  queryService: null,
  sourceFilePath: '',
  lastModified: null,
  lastLoaded: null,
};

/**
 * 파라미터 레지스트리 초기화
 *
 * Agent 시작 시 반드시 호출해야 합니다.
 * GTMConfigLoader.preload()에서 자동 호출됩니다.
 */
export async function initializeParameterRegistry(options?: {
  paramMappingPath?: string;
}): Promise<void> {
  const defaultPath = path.join(
    process.cwd(),
    'specs/sites/amorepacific_GTM-5FK5X5C4/mapping/PARAM_MAPPING_TABLE.md'
  );

  state.sourceFilePath = options?.paramMappingPath || defaultPath;

  if (!fs.existsSync(state.sourceFilePath)) {
    console.warn(`⚠️ PARAM_MAPPING_TABLE.md not found: ${state.sourceFilePath}`);
    return;
  }

  // 파일 수정 시간 확인
  const stats = fs.statSync(state.sourceFilePath);
  state.lastModified = stats.mtime;

  // 파라미터 스토어 로드
  state.store = loadParameterStore(true); // force reload
  state.queryService = getParameterQueryService();
  state.lastLoaded = new Date();
  state.initialized = true;

  console.log(`✅ Parameter Registry 초기화 완료`);
  console.log(`   소스: ${state.sourceFilePath}`);
  console.log(`   이벤트: ${state.store.events.size}개`);
  console.log(`   공통 파라미터: ${state.store.commonPageParams.length}개`);
}

/**
 * 소스 파일이 변경되었는지 확인
 */
export function isSourceFileChanged(): boolean {
  if (!state.sourceFilePath || !state.lastModified) return false;

  try {
    const stats = fs.statSync(state.sourceFilePath);
    return stats.mtime > state.lastModified;
  } catch {
    return false;
  }
}

/**
 * 레지스트리 리로드 (소스 파일 변경 시)
 */
export async function reloadIfChanged(): Promise<boolean> {
  if (!isSourceFileChanged()) {
    return false;
  }

  console.log(`🔄 PARAM_MAPPING_TABLE.md 변경 감지, 리로드 중...`);
  await initializeParameterRegistry({ paramMappingPath: state.sourceFilePath });
  return true;
}

/**
 * 강제 리로드
 */
export async function forceReload(): Promise<void> {
  await initializeParameterRegistry({ paramMappingPath: state.sourceFilePath });
}

/**
 * 이벤트 파라미터 조회 (GA4 API 매핑 포함)
 *
 * @example
 * const params = getEventParameters('page_view');
 * // params.parameters[0].ga4ApiDimension = 'customEvent:site_name'
 */
export function getEventParameters(eventName: string) {
  ensureInitialized();
  return state.queryService!.getEventParamsWithApiMapping(eventName);
}

/**
 * 이벤트 파라미터 조회 (기본)
 */
export function getEventParamsBasic(eventName: string) {
  ensureInitialized();
  return state.queryService!.getEventParams(eventName);
}

/**
 * 파라미터 키로 검색
 */
export function findParameterByKey(ga4Key: string) {
  ensureInitialized();
  return state.queryService!.findParameterByKey(ga4Key);
}

/**
 * 개발가이드 변수로 검색
 */
export function findParameterByDevGuideVar(devGuideVar: string) {
  ensureInitialized();
  return state.queryService!.findParameterByDevGuideVar(devGuideVar);
}

/**
 * 이벤트 목록 조회
 */
export function getEventList(): string[] {
  ensureInitialized();
  return state.queryService!.getEventList();
}

/**
 * 공통 파라미터 조회
 */
export function getCommonParameters() {
  ensureInitialized();
  return state.queryService!.getCommonParams();
}

/**
 * GA4 API dimension 이름 조회
 */
export function getApiDimension(ga4Key: string, scope: 'event' | 'item' | 'user' = 'event') {
  return getGA4ApiDimension(ga4Key, scope);
}

/**
 * 레지스트리 상태 조회
 */
export function getRegistryStatus(): {
  initialized: boolean;
  sourceFile: string;
  lastModified: Date | null;
  lastLoaded: Date | null;
  eventCount: number;
  commonParamCount: number;
} {
  return {
    initialized: state.initialized,
    sourceFile: state.sourceFilePath,
    lastModified: state.lastModified,
    lastLoaded: state.lastLoaded,
    eventCount: state.store?.events.size || 0,
    commonParamCount: state.store?.commonPageParams.length || 0,
  };
}

/**
 * 초기화 확인
 */
function ensureInitialized(): void {
  if (!state.initialized || !state.queryService) {
    // 자동 초기화 시도
    const store = loadParameterStore();
    state.store = store;
    state.queryService = getParameterQueryService();
    state.initialized = true;
  }
}

/**
 * 요약 출력
 */
export function printRegistrySummary(): void {
  ensureInitialized();
  console.log('\n=== Parameter Registry 상태 ===');
  console.log(`초기화: ${state.initialized ? '✅' : '❌'}`);
  console.log(`소스: ${state.sourceFilePath}`);
  console.log(`마지막 수정: ${state.lastModified?.toISOString() || 'N/A'}`);
  console.log(`마지막 로드: ${state.lastLoaded?.toISOString() || 'N/A'}`);

  if (state.store) {
    console.log(`\n이벤트: ${state.store.events.size}개`);
    console.log(`공통 페이지 파라미터: ${state.store.commonPageParams.length}개`);
    console.log(`공통 사용자 파라미터: ${state.store.commonUserParams.length}개`);
    console.log(`공통 item 파라미터: ${state.store.itemParams.length}개`);
  }
}
