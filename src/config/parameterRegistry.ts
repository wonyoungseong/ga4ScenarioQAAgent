/**
 * Parameter Registry - Agent의 단일 파라미터 참조 포인트
 *
 * 모든 Agent는 이 레지스트리를 통해 파라미터 정보를 조회합니다.
 * PARAM_MAPPING_TABLE.md가 업데이트되면 reload()를 호출하여 갱신합니다.
 *
 * 데이터 흐름:
 * 1. GTM JSON에서 실제 파라미터 목록 추출 (Ground Truth)
 * 2. PARAM_MAPPING_TABLE.md 파싱
 * 3. 두 결과 비교 검증
 * 4. Agent에서 조회
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  loadParameterStore,
  getParameterQueryService,
  ParameterQueryService,
  UnifiedParameterStore,
  getGA4ApiDimension,
  validateParameters,
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
 * 파라미터 레지스트리 초기화 (검증 포함)
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

  // 파라미터 스토어 로드 (GTM 검증 포함)
  state.store = loadParameterStore(true); // force reload
  state.queryService = getParameterQueryService();
  state.lastLoaded = new Date();
  state.initialized = true;

  // 검증 결과 출력
  console.log(`✅ Parameter Registry 초기화 완료`);
  console.log(`   소스: ${state.sourceFilePath}`);
  console.log(`   이벤트: ${state.store.events.size}개`);
  console.log(`   Event Parameters: ${state.store.commonEventParams.length}개`);
  console.log(`   User Properties: ${state.store.userProperties.length}개`);
  console.log(`   ${state.store.validation.message}`);

  // 검증 실패 시 경고
  if (!state.store.validation.isValid) {
    console.error('\n❌ 파라미터 파싱 검증 실패!');
    console.error(`   GTM: ${state.store.gtmParamCount.eventParams}개`);
    console.error(`   파서: ${state.store.commonEventParams.length}개`);
    if (state.store.validation.missingParams.length > 0) {
      console.error(`   누락: ${state.store.validation.missingParams.join(', ')}`);
    }
  }
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
 * 파라미터 검증 실행
 * Agent가 분석 전에 호출하여 파라미터가 누락되지 않았는지 확인
 */
export function runParameterValidation(): {
  isValid: boolean;
  gtmCount: number;
  parserCount: number;
  missing: string[];
  extra: string[];
  message: string;
} {
  const result = validateParameters();
  return {
    ...result,
    message: result.isValid
      ? `✅ 검증 통과: GTM(${result.gtmCount}) = 파서(${result.parserCount})`
      : `❌ 검증 실패: GTM(${result.gtmCount}) ≠ 파서(${result.parserCount})`,
  };
}

/**
 * 레지스트리 상태 조회 (검증 결과 포함)
 */
export function getRegistryStatus(): {
  initialized: boolean;
  sourceFile: string;
  lastModified: Date | null;
  lastLoaded: Date | null;
  eventCount: number;
  eventParamCount: number;
  userPropertyCount: number;
  gtmParamCount: number;
  isValid: boolean;
} {
  return {
    initialized: state.initialized,
    sourceFile: state.sourceFilePath,
    lastModified: state.lastModified,
    lastLoaded: state.lastLoaded,
    eventCount: state.store?.events.size || 0,
    eventParamCount: state.store?.commonEventParams.length || 0,
    userPropertyCount: state.store?.userProperties.length || 0,
    gtmParamCount: state.store?.gtmParamCount.eventParams || 0,
    isValid: state.store?.validation.isValid || false,
  };
}

/**
 * 초기화 확인 (자동 초기화 + 검증)
 */
function ensureInitialized(): void {
  if (!state.initialized || !state.queryService) {
    // 자동 초기화 시도
    const store = loadParameterStore();
    state.store = store;
    state.queryService = getParameterQueryService();
    state.initialized = true;

    // 검증 실패 시 경고
    if (!store.validation.isValid) {
      console.warn(`\n⚠️ 파라미터 검증 실패: ${store.validation.message}`);
    }
  }
}

/**
 * 요약 출력 (검증 결과 포함)
 */
export function printRegistrySummary(): void {
  ensureInitialized();
  state.queryService!.printSummary();
}

/**
 * page_view 파라미터 전체 조회 (Agent용)
 *
 * @returns 45개 파라미터 (Event: 35개 + User Properties: 10개)
 */
export function getPageViewParameters() {
  return getEventParameters('page_view');
}
