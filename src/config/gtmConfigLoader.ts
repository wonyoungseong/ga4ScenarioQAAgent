/**
 * GTM 설정 로더
 *
 * 시나리오 작성 전에 모든 자료를 미리 파싱하여 준비합니다:
 * 1. 개발가이드 PDF - 이벤트 정의, 전송 시점
 * 2. 공통 변수 appendix PDF - 페이지 타입 정의
 * 3. GTM JSON - 트리거 조건, Content Group 매핑
 *
 * 이렇게 미리 준비된 데이터를 사용하면 시나리오 작성이 빨라집니다.
 */

import * as fs from 'fs';
import * as path from 'path';
import { GTMPageMappingExtractor, EventPageMapping, VariablePageMapping } from '../analyzers/gtmPageMappingExtractor';
import {
  DevelopmentGuideParser,
  ParsedEventDefinition,
  parsePageTypeDefinitionsFromAppendix,
  PageTypeDefinition,
  PageTypeDefinitions,
  comparePageTypeMappings,
  PageTypeMismatch
} from '../parsers/developmentGuideParser';
import { PageType } from '../types/pageContext';
import { EventParameterExtractor, EventParameterDefinition, EventParameterConfig } from './eventParameterConfig';
import {
  loadParameterStore,
  getParameterQueryService,
  getEventParams as getEventParamsFromStore,
  UnifiedParameterStore,
  ParameterQueryService
} from '../parsers/paramMappingParser';
import {
  initializeParameterRegistry,
  getEventParameters,
  reloadIfChanged,
} from './parameterRegistry';
import {
  parseGTMFile,
  ParsedGTMConfig,
  VariableChain,
  DataSource,
  extractUltimateDataSources,
  DataSourceType,
} from '../parsers/gtmVariableChainParser';
import {
  ECOMMERCE_ITEM_PARAMS,
  EVENT_ITEMS_SOURCES,
  EVENT_SPECIFIC_PARAMS,
  getItemParamsForEvent,
  getEventItemsSource,
  getEventSpecificParams,
  isEcommerceEvent,
  getAllItemParams,
  getAllEventSpecificParams,
  ItemParamMapping,
  EventItemsSource,
  EventSpecificParam,
} from './ecommerceItemsMapping';

/**
 * 미리 로드된 GTM 설정
 */
export interface PreloadedGTMConfig {
  // 소스 파일 경로
  sources: {
    gtmJsonPath: string;
    devGuidePdfPath?: string;
    appendixPdfPath?: string;
  };

  // 페이지 타입 정의 (appendix에서 파싱)
  pageTypeDefinitions: PageTypeDefinition[];

  // GTM Content Group lookup table
  contentGroupLookup: Map<string, string>;

  // GTM에 정의된 페이지 타입 목록
  gtmDefinedPageTypes: string[];

  // 이벤트-페이지 매핑 (GTM 트리거에서 추출)
  eventPageMappings: Map<string, EventPageMapping>;

  // 개발가이드에서 파싱한 이벤트 정의
  eventDefinitions: ParsedEventDefinition[];

  // GA4 표준 이벤트-페이지 매핑
  ga4StandardMappings: Record<string, string[]>;

  // appendix vs GTM 불일치 목록
  pageTypeMismatches: PageTypeMismatch[];

  // 이벤트별 파라미터 정의 (GTM 태그에서 추출)
  eventParameters: Map<string, EventParameterDefinition>;

  // 통합 파라미터 스토어 (PARAM_MAPPING_TABLE.md에서 파싱)
  unifiedParameterStore: UnifiedParameterStore;

  // 파라미터 쿼리 서비스
  parameterQueryService: ParameterQueryService;

  // GTM 변수 체인 파싱 결과 (새로 추가)
  gtmVariableChains: ParsedGTMConfig;

  // 로드 시간
  loadedAt: Date;
}

/**
 * GTM 설정 로더 옵션
 */
export interface GTMConfigLoaderOptions {
  gtmJsonPath: string;
  devGuidePdfPath?: string;
  appendixPdfPath?: string;
}

/**
 * GTM 설정을 미리 로드하는 클래스
 */
export class GTMConfigLoader {
  private config: PreloadedGTMConfig | null = null;
  private options: GTMConfigLoaderOptions;

  constructor(options: GTMConfigLoaderOptions) {
    this.options = options;
  }

  /**
   * 모든 설정을 미리 로드합니다.
   * 이 메소드는 시나리오 작성 전에 한 번만 호출하면 됩니다.
   */
  async preload(): Promise<PreloadedGTMConfig> {
    console.log('📦 GTM 설정 로드 시작...');
    const startTime = Date.now();

    // 1. GTM JSON 파싱
    console.log('  ├─ GTM JSON 파싱 중...');
    const gtmExtractor = new GTMPageMappingExtractor(this.options.gtmJsonPath);
    const contentGroupLookup = gtmExtractor.extractContentGroupLookupTable();
    const gtmDefinedPageTypes = gtmExtractor.getDefinedPageTypesInGTM();
    const eventPageMappings = gtmExtractor.extractEventPageMappings();

    // 2. 공통 변수 appendix PDF 파싱 (있는 경우)
    let pageTypeDefinitions: PageTypeDefinition[] = [];
    if (this.options.appendixPdfPath && fs.existsSync(this.options.appendixPdfPath)) {
      console.log('  ├─ 공통 변수 appendix PDF 파싱 중...');
      const appendixResult = await parsePageTypeDefinitionsFromAppendix(this.options.appendixPdfPath);
      pageTypeDefinitions = appendixResult.pageTypes;
    } else {
      // 기본 페이지 타입 정의 사용
      console.log('  ├─ 기본 페이지 타입 정의 사용');
      pageTypeDefinitions = this.getDefaultPageTypeDefinitions();
    }

    // 3. 개발가이드 PDF 파싱 (있는 경우)
    let eventDefinitions: ParsedEventDefinition[] = [];
    if (this.options.devGuidePdfPath && fs.existsSync(this.options.devGuidePdfPath)) {
      console.log('  ├─ 개발가이드 PDF 파싱 중...');
      const parser = new DevelopmentGuideParser(this.options.devGuidePdfPath);
      const result = await parser.parse();
      if (result.success) {
        eventDefinitions = result.events;
      }
    }

    // 4. GA4 표준 매핑 로드
    console.log('  ├─ GA4 표준 매핑 로드 중...');
    const ga4StandardMappings = DevelopmentGuideParser.getAllGA4StandardMappings();

    // 5. 이벤트 파라미터 추출
    console.log('  ├─ 이벤트 파라미터 추출 중...');
    const paramExtractor = new EventParameterExtractor(this.options.gtmJsonPath);
    const paramConfig = paramExtractor.extractAllEventParameters();
    const eventParameters = new Map<string, EventParameterDefinition>();
    for (const event of paramConfig.events) {
      eventParameters.set(event.eventName, event);
    }

    // 6. appendix vs GTM 불일치 감지
    console.log('  ├─ 불일치 감지 중...');
    const pageTypeMismatches = comparePageTypeMappings(pageTypeDefinitions, contentGroupLookup);

    // 7. 통합 파라미터 스토어 로드 (PARAM_MAPPING_TABLE.md)
    console.log('  ├─ 통합 파라미터 스토어 로드 중...');
    await initializeParameterRegistry();
    const unifiedParameterStore = loadParameterStore();
    const parameterQueryService = getParameterQueryService();

    // 8. GTM 변수 체인 파싱 (새로 추가)
    console.log('  ├─ GTM 변수 체인 파싱 중...');
    const gtmVariableChains = parseGTMFile(this.options.gtmJsonPath);
    console.log(`     - 변수 ${gtmVariableChains.variables.size}개`);
    console.log(`     - Event Parameters ${gtmVariableChains.eventSettings.filter(p => p.scope === 'event').length}개`);
    console.log(`     - User Properties ${gtmVariableChains.eventSettings.filter(p => p.scope === 'user').length}개`);

    const elapsed = Date.now() - startTime;
    console.log(`  └─ ✅ 로드 완료 (${elapsed}ms)`);

    // 불일치 경고 출력
    if (pageTypeMismatches.length > 0) {
      console.log(`\n⚠️  페이지 타입 불일치 ${pageTypeMismatches.length}개 감지:`);
      const appendixOnly = pageTypeMismatches.filter(m => m.inAppendix && !m.inGTM);
      if (appendixOnly.length > 0) {
        console.log(`   GTM에 매핑 없는 타입: ${appendixOnly.map(m => m.pageType).join(', ')}`);
      }
    }

    this.config = {
      sources: {
        gtmJsonPath: this.options.gtmJsonPath,
        devGuidePdfPath: this.options.devGuidePdfPath,
        appendixPdfPath: this.options.appendixPdfPath,
      },
      pageTypeDefinitions,
      contentGroupLookup,
      gtmDefinedPageTypes,
      eventPageMappings,
      eventDefinitions,
      ga4StandardMappings,
      pageTypeMismatches,
      eventParameters,
      unifiedParameterStore,
      parameterQueryService,
      gtmVariableChains,
      loadedAt: new Date(),
    };

    return this.config;
  }

  /**
   * 미리 로드된 설정을 반환합니다.
   * preload()를 먼저 호출해야 합니다.
   */
  getConfig(): PreloadedGTMConfig {
    if (!this.config) {
      throw new Error('설정이 로드되지 않았습니다. preload()를 먼저 호출하세요.');
    }
    return this.config;
  }

  /**
   * 설정이 로드되었는지 확인합니다.
   */
  isLoaded(): boolean {
    return this.config !== null;
  }

  /**
   * 특정 이벤트가 특정 페이지에서 발생 가능한지 확인합니다.
   * 미리 로드된 데이터를 사용하므로 빠릅니다.
   */
  isEventAllowedOnPage(eventName: string, pageType: PageType): {
    allowed: boolean;
    reason: string;
    confidence: number;
    source: 'gtm' | 'devguide' | 'ga4_standard' | 'default';
  } {
    const config = this.getConfig();

    // 1. GTM 트리거 조건 확인 (가장 높은 우선순위)
    const gtmMapping = config.eventPageMappings.get(eventName);
    if (gtmMapping && gtmMapping.confidence >= 75) {
      if (gtmMapping.allowedPageTypes.includes(pageType)) {
        return {
          allowed: true,
          reason: `GTM 트리거 조건: ${gtmMapping.allowedPageTypes.join(', ')}`,
          confidence: gtmMapping.confidence,
          source: 'gtm'
        };
      } else {
        return {
          allowed: false,
          reason: `GTM 트리거 조건: ${gtmMapping.allowedPageTypes.join(', ')} (현재: ${pageType})`,
          confidence: gtmMapping.confidence,
          source: 'gtm'
        };
      }
    }

    // 2. 개발가이드 확인
    const devGuideEvent = config.eventDefinitions.find(e => e.eventName === eventName);
    if (devGuideEvent && devGuideEvent.allowedPageTypes.length > 0) {
      if (devGuideEvent.allowedPageTypes.includes(pageType) || devGuideEvent.allowedPageTypes.includes('ALL')) {
        return {
          allowed: true,
          reason: `개발가이드: ${devGuideEvent.firingCondition}`,
          confidence: 80,
          source: 'devguide'
        };
      } else {
        return {
          allowed: false,
          reason: `개발가이드: ${devGuideEvent.allowedPageTypes.join(', ')} (현재: ${pageType})`,
          confidence: 80,
          source: 'devguide'
        };
      }
    }

    // 3. GA4 표준 매핑 확인
    const ga4Mapping = config.ga4StandardMappings[eventName];
    if (ga4Mapping) {
      if (ga4Mapping.includes(pageType)) {
        return {
          allowed: true,
          reason: `GA4 표준: ${ga4Mapping.join(', ')}`,
          confidence: 70,
          source: 'ga4_standard'
        };
      } else {
        return {
          allowed: false,
          reason: `GA4 표준: ${ga4Mapping.join(', ')} (현재: ${pageType})`,
          confidence: 70,
          source: 'ga4_standard'
        };
      }
    }

    // 4. 기본: 허용
    return {
      allowed: true,
      reason: '매핑 정보 없음 - 기본 허용',
      confidence: 30,
      source: 'default'
    };
  }

  /**
   * 특정 페이지 타입에서 발생 가능한 이벤트 목록을 반환합니다.
   *
   * D 복합 방식: GTM + 개발가이드 + GA4 표준을 통합하고,
   * isEventAllowedOnPage 로직으로 필터링하여 정확한 결과 반환
   */
  getEventsForPageType(pageType: PageType): {
    eventName: string;
    source: string;
    confidence: number;
    reason?: string;
  }[] {
    const config = this.getConfig();

    // 1. 모든 소스에서 이벤트 이름 수집 (중복 제거)
    const allEventNames = new Set<string>();

    // GTM 이벤트
    for (const [eventName] of config.eventPageMappings) {
      allEventNames.add(eventName);
    }

    // 개발가이드 이벤트
    for (const event of config.eventDefinitions) {
      allEventNames.add(event.eventName);
    }

    // GA4 표준 이벤트
    for (const eventName of Object.keys(config.ga4StandardMappings)) {
      allEventNames.add(eventName);
    }

    // 2. 각 이벤트에 대해 isEventAllowedOnPage로 필터링
    const events: { eventName: string; source: string; confidence: number; reason?: string }[] = [];

    for (const eventName of allEventNames) {
      const check = this.isEventAllowedOnPage(eventName, pageType);

      // 허용된 이벤트만 추가
      if (check.allowed) {
        events.push({
          eventName,
          source: check.source,
          confidence: check.confidence,
          reason: check.reason,
        });
      }
    }

    return events.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 페이지 타입 정의를 반환합니다.
   */
  getPageTypeDefinition(pageType: string): PageTypeDefinition | undefined {
    return this.getConfig().pageTypeDefinitions.find(p => p.pageType === pageType);
  }

  /**
   * AP_DATA_PAGETYPE 값이 GTM에서 어떻게 매핑되는지 확인합니다.
   */
  getMappedContentGroup(apDataPageType: string): string | undefined {
    return this.getConfig().contentGroupLookup.get(apDataPageType);
  }

  /**
   * 특정 이벤트의 파라미터 정의를 반환합니다. (GTM 태그 기반)
   */
  getEventParameters(eventName: string): EventParameterDefinition | undefined {
    return this.getConfig().eventParameters.get(eventName);
  }

  /**
   * 특정 이벤트의 파라미터 정의를 반환합니다. (PARAM_MAPPING_TABLE.md 기반)
   *
   * 이 메소드는 통합 파라미터 스토어를 사용합니다.
   * Agent가 이벤트별 파라미터를 조회할 때 이 메소드를 사용하세요.
   *
   * @example
   * const params = loader.getEventParamsFromMapping('page_view');
   * // → { commonParams, eventParams, userParams, itemParams, hasItems }
   */
  getEventParamsFromMapping(eventName: string) {
    return this.getConfig().parameterQueryService.getEventParams(eventName);
  }

  /**
   * 파라미터 키로 검색합니다.
   */
  findParameterByKey(ga4Key: string) {
    return this.getConfig().parameterQueryService.findParameterByKey(ga4Key);
  }

  /**
   * 개발가이드 변수명으로 파라미터를 검색합니다.
   */
  findParameterByDevGuideVar(devGuideVar: string) {
    return this.getConfig().parameterQueryService.findParameterByDevGuideVar(devGuideVar);
  }

  /**
   * 모든 이벤트의 파라미터 키 목록을 반환합니다.
   */
  getAllEventParameterKeys(): Map<string, string[]> {
    const result = new Map<string, string[]>();
    for (const [eventName, definition] of this.getConfig().eventParameters) {
      result.set(eventName, definition.parameters.map(p => p.key));
    }
    return result;
  }

  // ==========================================================================
  // GTM 변수 체인 조회 메소드 (새로 추가)
  // ==========================================================================

  /**
   * GA4 파라미터의 GTM 변수 체인을 반환합니다.
   *
   * @param ga4Param GA4 파라미터명 (예: "site_name", "login_id_gcid")
   * @returns VariableChain 또는 undefined
   */
  getVariableChain(ga4Param: string): VariableChain | undefined {
    return this.getConfig().gtmVariableChains.variableChains.get(ga4Param);
  }

  /**
   * GA4 파라미터의 최종 데이터 소스(들)를 반환합니다.
   *
   * @param ga4Param GA4 파라미터명
   * @returns DataSource 배열
   *
   * @example
   * const sources = loader.getDataSources('site_name');
   * // → [{ type: 'global_variable', name: 'AP_DATA_SITENAME' }]
   */
  getDataSources(ga4Param: string): DataSource[] {
    const chain = this.getVariableChain(ga4Param);
    if (!chain) return [];
    return extractUltimateDataSources(chain);
  }

  /**
   * GA4 파라미터가 전역변수를 사용하는지 확인합니다.
   *
   * @param ga4Param GA4 파라미터명
   * @returns 전역변수 사용 여부와 변수명 목록
   */
  usesGlobalVariable(ga4Param: string): { uses: boolean; variables: string[] } {
    const sources = this.getDataSources(ga4Param);
    const globalVars = sources
      .filter(s => s.type === 'global_variable')
      .map(s => s.name);
    return { uses: globalVars.length > 0, variables: globalVars };
  }

  /**
   * GA4 파라미터가 DataLayer를 사용하는지 확인합니다.
   *
   * @param ga4Param GA4 파라미터명
   * @returns DataLayer 사용 여부와 경로 목록
   */
  usesDataLayer(ga4Param: string): { uses: boolean; paths: string[] } {
    const sources = this.getDataSources(ga4Param);
    const dlPaths = sources
      .filter(s => s.type === 'datalayer')
      .map(s => s.path || s.name);
    return { uses: dlPaths.length > 0, paths: dlPaths };
  }

  /**
   * GA4 파라미터의 GTM 변수 정보를 요약해서 반환합니다.
   *
   * @param ga4Param GA4 파라미터명
   * @returns 요약 정보 (Agent가 예측 시 참조용)
   */
  getParameterGTMInfo(ga4Param: string): {
    gtmVariable?: string;
    variableType?: string;
    dataSources: {
      type: DataSourceType;
      name: string;
      fallback?: string;
    }[];
    description: string;
  } | undefined {
    const chain = this.getVariableChain(ga4Param);
    if (!chain) return undefined;

    const sources = extractUltimateDataSources(chain);
    const sourceDescriptions = sources.map(s => {
      if (s.type === 'global_variable') {
        return `전역변수 ${s.name}`;
      } else if (s.type === 'datalayer') {
        return `DataLayer ${s.path || s.name}`;
      } else if (s.type === 'gtm_builtin') {
        return `GTM 내장변수 ${s.name}`;
      } else if (s.type === 'url') {
        return 'URL';
      } else if (s.type === 'constant' && s.fallback) {
        return `상수 "${s.fallback}"`;
      }
      return s.name;
    });

    return {
      gtmVariable: chain.gtmVariable,
      variableType: chain.variableType,
      dataSources: sources.map(s => ({
        type: s.type,
        name: s.name,
        fallback: s.fallback,
      })),
      description: sourceDescriptions.length > 0
        ? `${sourceDescriptions.join(' 또는 ')}에서 값을 가져옴`
        : '알 수 없는 소스',
    };
  }

  /**
   * 전역변수명으로 관련 GA4 파라미터 목록을 찾습니다.
   *
   * @param globalVarName 전역변수명 (예: "AP_DATA_GCID")
   * @returns 해당 전역변수를 사용하는 GA4 파라미터 목록
   */
  findParamsByGlobalVar(globalVarName: string): string[] {
    const result: string[] = [];
    const config = this.getConfig();

    for (const [ga4Param] of config.gtmVariableChains.variableChains) {
      const sources = this.getDataSources(ga4Param);
      if (sources.some(s => s.type === 'global_variable' && s.name === globalVarName)) {
        result.push(ga4Param);
      }
    }

    return result;
  }

  /**
   * Measurement ID 설정 정보를 반환합니다.
   */
  getMeasurementIdConfig() {
    return this.getConfig().gtmVariableChains.measurementIdConfig;
  }

  // ==========================================================================
  // 이커머스 items[] 파라미터 조회 메소드
  // ==========================================================================

  /**
   * 이벤트가 이커머스 이벤트인지 확인합니다.
   *
   * @param eventName 이벤트명
   * @returns 이커머스 이벤트 여부
   */
  isEcommerceEvent(eventName: string): boolean {
    return isEcommerceEvent(eventName);
  }

  /**
   * 특정 이벤트의 items[] 파라미터 매핑을 반환합니다.
   *
   * @param eventName 이벤트명 (예: "view_item", "add_to_cart")
   * @returns items[] 내 파라미터 매핑 목록
   *
   * @example
   * const itemParams = loader.getItemParamsForEvent('view_item');
   * // → [{ ga4Param: 'item_id', sources: [...], ... }, ...]
   */
  getItemParamsForEvent(eventName: string): ItemParamMapping[] {
    return getItemParamsForEvent(eventName);
  }

  /**
   * 특정 이벤트의 items 배열 소스 정보를 반환합니다.
   *
   * @param eventName 이벤트명
   * @returns items 배열을 생성하는 GTM 변수와 소스 정보
   *
   * @example
   * const source = loader.getEventItemsSource('view_item');
   * // → { gtmVariable: '{{JS - View Item DataLayer}}', globalVariable: 'AP_PRD_*', ... }
   */
  getEventItemsSource(eventName: string): EventItemsSource | undefined {
    return getEventItemsSource(eventName);
  }

  /**
   * 특정 이벤트의 개별 파라미터(items 외)를 반환합니다.
   *
   * @param eventName 이벤트명
   * @returns 이벤트 고유 파라미터 목록
   *
   * @example
   * const params = loader.getEventSpecificParams('purchase');
   * // → [{ ga4Param: 'transaction_id', ... }, { ga4Param: 'value', ... }, ...]
   */
  getEventSpecificParams(eventName: string): EventSpecificParam[] {
    return getEventSpecificParams(eventName);
  }

  /**
   * 모든 items[] 파라미터 목록을 반환합니다.
   *
   * @returns items[] 내 파라미터명 배열
   */
  getAllItemParams(): string[] {
    return getAllItemParams();
  }

  /**
   * 모든 이벤트별 개별 파라미터 목록을 반환합니다.
   *
   * @returns 이벤트-파라미터 쌍 배열
   */
  getAllEventSpecificParams(): { event: string; param: string }[] {
    return getAllEventSpecificParams();
  }

  /**
   * items[] 파라미터의 GTM 소스 정보를 반환합니다.
   *
   * @param itemParam items[] 내 파라미터명 (예: "item_id", "item_name")
   * @param eventName 이벤트명 (선택, 지정 시 해당 이벤트의 소스만)
   * @returns 파라미터 매핑 정보
   */
  getItemParamInfo(itemParam: string, eventName?: string): ItemParamMapping | undefined {
    const mapping = ECOMMERCE_ITEM_PARAMS.find(p => p.ga4Param === itemParam);
    if (!mapping) return undefined;

    if (eventName) {
      // 특정 이벤트의 소스만 필터링
      const filteredSources = mapping.sources.filter(s => s.event === eventName);
      if (filteredSources.length === 0) return undefined;
      return { ...mapping, sources: filteredSources };
    }

    return mapping;
  }

  /**
   * 이벤트의 전체 파라미터 정보를 종합해서 반환합니다.
   * (공통 파라미터 + items[] + 개별 파라미터)
   *
   * @param eventName 이벤트명
   * @returns 종합 파라미터 정보
   */
  getFullEventParamInfo(eventName: string): {
    eventName: string;
    isEcommerce: boolean;
    commonParams: { count: number; scope: string };
    itemsParams: { count: number; gtmVariable?: string; globalVariable?: string } | null;
    specificParams: { count: number; params: string[] };
  } {
    const isEcom = isEcommerceEvent(eventName);
    const itemSource = getEventItemsSource(eventName);
    const itemParams = getItemParamsForEvent(eventName);
    const specificParams = getEventSpecificParams(eventName);

    // 공통 파라미터 수 (GT - Event Settings 기준)
    const commonParamCount = this.getConfig().gtmVariableChains.eventSettings.length;

    return {
      eventName,
      isEcommerce: isEcom,
      commonParams: {
        count: commonParamCount,
        scope: 'GT - Event Settings',
      },
      itemsParams: isEcom && itemSource ? {
        count: itemParams.length,
        gtmVariable: itemSource.gtmVariable,
        globalVariable: itemSource.globalVariable,
      } : null,
      specificParams: {
        count: specificParams.length,
        params: specificParams.map(p => p.ga4Param),
      },
    };
  }

  /**
   * 요약 정보를 출력합니다.
   */
  printSummary(): void {
    const config = this.getConfig();

    console.log('\n=== GTM 설정 요약 ===');
    console.log(`로드 시간: ${config.loadedAt.toISOString()}`);
    console.log(`\n📄 소스 파일:`);
    console.log(`  - GTM JSON: ${config.sources.gtmJsonPath}`);
    console.log(`  - 개발가이드: ${config.sources.devGuidePdfPath || '없음'}`);
    console.log(`  - Appendix: ${config.sources.appendixPdfPath || '없음'}`);

    console.log(`\n📊 로드된 데이터:`);
    console.log(`  - 페이지 타입 정의: ${config.pageTypeDefinitions.length}개`);
    console.log(`  - GTM Content Group 매핑: ${config.contentGroupLookup.size}개`);
    console.log(`  - GTM 이벤트-페이지 매핑: ${config.eventPageMappings.size}개`);
    console.log(`  - 개발가이드 이벤트 정의: ${config.eventDefinitions.length}개`);
    console.log(`  - GA4 표준 매핑: ${Object.keys(config.ga4StandardMappings).length}개`);
    console.log(`  - 이벤트 파라미터 정의: ${config.eventParameters.size}개`);

    console.log(`\n📦 통합 파라미터 스토어 (PARAM_MAPPING_TABLE.md):`);
    console.log(`  - 공통 페이지 파라미터: ${config.unifiedParameterStore.commonPageParams.length}개`);
    console.log(`  - 공통 사용자 파라미터: ${config.unifiedParameterStore.commonUserParams.length}개`);
    console.log(`  - 이벤트: ${config.unifiedParameterStore.events.size}개`);
    console.log(`  - 공통 item 파라미터: ${config.unifiedParameterStore.itemParams.length}개`);

    console.log(`\n🔗 GTM 변수 체인 (자동 파싱):`);
    console.log(`  - GTM 변수: ${config.gtmVariableChains.variables.size}개`);
    console.log(`  - Event Parameters: ${config.gtmVariableChains.eventSettings.filter(p => p.scope === 'event').length}개`);
    console.log(`  - User Properties: ${config.gtmVariableChains.eventSettings.filter(p => p.scope === 'user').length}개`);
    console.log(`  - 변수 체인: ${config.gtmVariableChains.variableChains.size}개`);
    if (config.gtmVariableChains.measurementIdConfig) {
      console.log(`  - Measurement ID 조건: ${config.gtmVariableChains.measurementIdConfig.conditions.length}개`);
    }

    if (config.pageTypeMismatches.length > 0) {
      console.log(`\n⚠️  불일치: ${config.pageTypeMismatches.length}개`);
      const appendixOnly = config.pageTypeMismatches.filter(m => m.inAppendix && !m.inGTM);
      if (appendixOnly.length > 0) {
        console.log(`  GTM에 매핑 없는 타입: ${appendixOnly.map(m => m.pageType).join(', ')}`);
      }
    }
  }

  /**
   * 기본 페이지 타입 정의
   */
  private getDefaultPageTypeDefinitions(): PageTypeDefinition[] {
    return [
      { pageType: 'MAIN', description: '메인 페이지', note: 'required' },
      { pageType: 'BRAND_MAIN', description: '브랜드 메인 페이지 (AP몰만 해당)', note: 'recommend' },
      { pageType: 'PRODUCT_DETAIL', description: '상품 상세 페이지', note: 'required' },
      { pageType: 'PRODUCT_LIST', description: '상품 리스트 페이지', note: 'recommend' },
      { pageType: 'SEARCH_RESULT', description: '검색 결과 페이지', note: 'required' },
      { pageType: 'CART', description: '장바구니 페이지', note: 'recommend' },
      { pageType: 'ORDER', description: '주문서 페이지', note: 'recommend' },
      { pageType: 'MY', description: '마이 페이지', note: 'recommend' },
      { pageType: 'EVENT_LIST', description: '이벤트 리스트 페이지', note: 'recommend' },
      { pageType: 'EVENT_DETAIL', description: '이벤트 상세 페이지', note: 'required' },
      { pageType: 'LIVE_LIST', description: '라이브 리스트', note: 'recommend' },
      { pageType: 'LIVE_DETAIL', description: '라이브 상세 페이지', note: 'required' },
      { pageType: 'OTHERS', description: '그 외 모두', note: 'recommend' },
    ];
  }
}

/**
 * 기본 경로로 GTM 설정 로더를 생성합니다.
 */
export function createDefaultGTMConfigLoader(): GTMConfigLoader {
  return new GTMConfigLoader({
    gtmJsonPath: path.join(process.cwd(), 'GTM-5FK5X5C4_workspace112.json'),
    devGuidePdfPath: path.join(process.cwd(), '[EC]+WEB+개발+가이드_GTM코드추가(Shopify)1.1.pdf'),
    appendixPdfPath: path.join(process.cwd(), '공통 변수 appendix.pdf'),
  });
}

// 싱글톤 인스턴스 (전역에서 공유)
let globalConfigLoader: GTMConfigLoader | null = null;

/**
 * 전역 GTM 설정 로더를 초기화하고 반환합니다.
 * 한 번만 초기화되며, 이후 호출에서는 캐시된 설정을 반환합니다.
 */
export async function getGlobalGTMConfig(): Promise<PreloadedGTMConfig> {
  if (!globalConfigLoader) {
    globalConfigLoader = createDefaultGTMConfigLoader();
    await globalConfigLoader.preload();
  }
  return globalConfigLoader.getConfig();
}

/**
 * 전역 GTM 설정 로더를 반환합니다.
 * 아직 초기화되지 않았으면 null을 반환합니다.
 */
export function getGlobalGTMConfigLoader(): GTMConfigLoader | null {
  return globalConfigLoader;
}
