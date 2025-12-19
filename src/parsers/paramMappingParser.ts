/**
 * PARAM_MAPPING_TABLE.md 파서 + GTM JSON 검증
 *
 * 원본 문서(PARAM_MAPPING_TABLE.md)를 파싱하여 통합 파라미터 스토어를 생성합니다.
 * GTM JSON과 비교하여 파싱 결과가 정확한지 검증합니다.
 *
 * 데이터 흐름:
 * 1. GTM JSON에서 실제 파라미터 목록 추출 (Ground Truth)
 * 2. PARAM_MAPPING_TABLE.md 파싱
 * 3. 두 결과 비교 검증
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * GA4 Data API 표준 dimension 매핑
 */
const GA4_STANDARD_DIMENSION_MAP: Record<string, string> = {
  'page_location': 'pageLocation',
  'page_title': 'pageTitle',
  'page_referrer': 'pageReferrer',
  'page_path': 'pagePath',
  'country': 'country',
  'city': 'city',
  'region': 'region',
  'language': 'language',
  'platform': 'platform',
  'currency': 'currencyCode',
  'transaction_id': 'transactionId',
  'item_id': 'itemId',
  'item_name': 'itemName',
  'item_brand': 'itemBrand',
  'item_category': 'itemCategory',
  'item_variant': 'itemVariant',
  'item_list_name': 'itemListName',
  'index': 'itemListPosition',
  'promotion_id': 'itemPromotionId',
  'promotion_name': 'itemPromotionName',
  'creative_slot': 'itemPromotionCreativeSlot',
};

export function getGA4ApiDimension(ga4Key: string, scope: 'event' | 'item' | 'user' = 'event'): {
  dimension: string;
  isCustom: boolean;
} {
  const standardDimension = GA4_STANDARD_DIMENSION_MAP[ga4Key];
  if (standardDimension) {
    return { dimension: standardDimension, isCustom: false };
  }
  if (scope === 'user') {
    return { dimension: `customUser:${ga4Key}`, isCustom: true };
  }
  return { dimension: `customEvent:${ga4Key}`, isCustom: true };
}

/**
 * 파라미터 정의
 */
export interface ParameterDefinition {
  ga4Key: string;
  devGuideVar: string;
  gtmVariable?: string;
  description: string;
  example?: string;
  required?: boolean;
  condition?: string;
  isStandard?: boolean;
  scope: 'event' | 'item' | 'user';
  category?: 'event_common' | 'page_location' | 'user_id' | 'user_property' | 'conditional' | 'event_specific';
  ga4ApiDimension?: string;
  isCustomDimension?: boolean;
}

export interface EventParameterConfig {
  eventName: string;
  dataLayerEvent?: string;
  description?: string;
  parameters: ParameterDefinition[];
  hasItems: boolean;
  itemsVariable?: string;
}

export interface UnifiedParameterStore {
  parsedAt: Date;
  sourcePath: string;
  gtmPath?: string;
  /** 공통 Event Parameters (GT - Event Settings) */
  commonEventParams: ParameterDefinition[];
  /** User Properties */
  userProperties: ParameterDefinition[];
  /** 이벤트별 파라미터 */
  events: Map<string, EventParameterConfig>;
  /** item 배열 내 파라미터 */
  itemParams: ParameterDefinition[];
  /** GTM 기준 파라미터 개수 (검증용) */
  gtmParamCount: {
    eventParams: number;
    userProperties: number;
    total: number;
  };
  /** 검증 결과 */
  validation: {
    isValid: boolean;
    missingParams: string[];
    extraParams: string[];
    message: string;
  };
}

/**
 * GTM JSON에서 파라미터 추출
 */
export function extractParamsFromGTM(gtmPath: string): {
  eventParams: Array<{ name: string; variable: string }>;
  userProperties: Array<{ name: string; variable: string }>;
} {
  if (!fs.existsSync(gtmPath)) {
    return { eventParams: [], userProperties: [] };
  }

  const gtm = JSON.parse(fs.readFileSync(gtmPath, 'utf-8'));
  const container = gtm.containerVersion || gtm;
  const variables = container.variable || [];

  const eventParams: Array<{ name: string; variable: string }> = [];
  const userProperties: Array<{ name: string; variable: string }> = [];

  // GT - Event Settings 변수 찾기
  const eventSettings = variables.find((v: any) => v.name === 'GT - Event Settings');

  if (eventSettings) {
    const params = eventSettings.parameter || [];

    // Event Parameters
    const settingsTable = params.find((p: any) => p.key === 'eventSettingsTable');
    if (settingsTable && settingsTable.list) {
      for (const item of settingsTable.list) {
        const map = item.map || [];
        const paramName = map.find((m: any) => m.key === 'parameter')?.value || '';
        const paramValue = map.find((m: any) => m.key === 'parameterValue')?.value || '';
        if (paramName) {
          eventParams.push({ name: paramName, variable: paramValue });
        }
      }
    }

    // User Properties
    const userPropsTable = params.find((p: any) =>
      p.key === 'userPropertiesForThisEvent' ||
      p.key === 'setUserProperty' ||
      p.key === 'userProperties'
    );
    if (userPropsTable && userPropsTable.list) {
      for (const item of userPropsTable.list) {
        const map = item.map || [];
        const name = map.find((m: any) => m.key === 'name' || m.key === 'parameter')?.value || '';
        const value = map.find((m: any) => m.key === 'value' || m.key === 'parameterValue')?.value || '';
        if (name) {
          userProperties.push({ name, variable: value });
        }
      }
    }
  }

  return { eventParams, userProperties };
}

/**
 * PARAM_MAPPING_TABLE.md 파서 (개선된 버전)
 */
export class ParamMappingParser {
  private content: string = '';
  private sourcePath: string;
  private gtmPath: string;

  constructor(sourcePath?: string, gtmPath?: string) {
    this.sourcePath = sourcePath ||
      path.join(process.cwd(), 'specs/sites/amorepacific_GTM-5FK5X5C4/mapping/PARAM_MAPPING_TABLE.md');
    this.gtmPath = gtmPath ||
      path.join(process.cwd(), 'GTM-5FK5X5C4_workspace112.json');
  }

  /**
   * 파싱 + 검증 실행
   */
  parse(): UnifiedParameterStore {
    if (!fs.existsSync(this.sourcePath)) {
      throw new Error(`PARAM_MAPPING_TABLE.md not found: ${this.sourcePath}`);
    }

    this.content = fs.readFileSync(this.sourcePath, 'utf-8');

    // 1. GTM에서 실제 파라미터 목록 추출 (Ground Truth)
    const gtmParams = extractParamsFromGTM(this.gtmPath);

    // 2. PARAM_MAPPING_TABLE.md 파싱 (모든 섹션)
    const commonEventParams = this.parseAllCommonEventParams();
    const userProperties = this.parseUserProperties();
    const events = this.parseEventParams();
    const itemParams = this.parseCommonItemParams();

    // 3. 검증
    const parsedEventParamNames = new Set(commonEventParams.map(p => p.ga4Key));
    const gtmEventParamNames = new Set(gtmParams.eventParams.map(p => p.name));

    const missingParams = gtmParams.eventParams
      .filter(p => !parsedEventParamNames.has(p.name))
      .map(p => p.name);

    const extraParams = commonEventParams
      .filter(p => !gtmEventParamNames.has(p.ga4Key))
      .map(p => p.ga4Key);

    const isValid = missingParams.length === 0 && extraParams.length === 0;

    const store: UnifiedParameterStore = {
      parsedAt: new Date(),
      sourcePath: this.sourcePath,
      gtmPath: this.gtmPath,
      commonEventParams,
      userProperties,
      events,
      itemParams,
      gtmParamCount: {
        eventParams: gtmParams.eventParams.length,
        userProperties: gtmParams.userProperties.length,
        total: gtmParams.eventParams.length + gtmParams.userProperties.length,
      },
      validation: {
        isValid,
        missingParams,
        extraParams,
        message: isValid
          ? `✅ 검증 통과: GTM(${gtmParams.eventParams.length}) = 파서(${commonEventParams.length})`
          : `❌ 검증 실패: GTM(${gtmParams.eventParams.length}) ≠ 파서(${commonEventParams.length}), 누락: ${missingParams.join(', ')}`,
      },
    };

    // 검증 결과 출력
    if (!isValid) {
      console.warn('\n⚠️ 파라미터 파싱 검증 실패!');
      console.warn(`GTM Event Parameters: ${gtmParams.eventParams.length}개`);
      console.warn(`파서 결과: ${commonEventParams.length}개`);
      if (missingParams.length > 0) {
        console.warn(`누락된 파라미터: ${missingParams.join(', ')}`);
      }
      if (extraParams.length > 0) {
        console.warn(`추가된 파라미터: ${extraParams.join(', ')}`);
      }
    }

    return store;
  }

  /**
   * 모든 공통 Event Parameters 파싱 (5개 섹션)
   */
  private parseAllCommonEventParams(): ParameterDefinition[] {
    const params: ParameterDefinition[] = [];

    // 1. 페이지 정보 변수 (Event Parameters)
    const pageInfoParams = this.parseSection('페이지 정보 변수', 'event_common');
    params.push(...pageInfoParams);

    // 2. 페이지 위치 변수 (breadcrumb 대체)
    const pageLocationParams = this.parseSection('페이지 위치 변수', 'page_location');
    params.push(...pageLocationParams);

    // 3. 사용자 ID 변수 (Event Parameters)
    const userIdParams = this.parseSection('사용자 ID 변수', 'user_id');
    params.push(...userIdParams);

    // 4. 조건부 파라미터 (content_group 기반) - 여러 하위 섹션
    const conditionalSections = [
      'PRODUCT_DETAIL 페이지 전용',
      'EVENT_DETAIL 페이지 전용',
      'BRAND_MAIN 페이지 전용',
      '매장 관련 페이지 전용',
      'SEARCH_RESULT 페이지 전용',
    ];

    for (const sectionName of conditionalSections) {
      const conditionalParams = this.parseSection(sectionName, 'conditional');
      // 조건 추가
      for (const p of conditionalParams) {
        p.condition = sectionName.replace(' 페이지 전용', '').replace(' 관련', '');
      }
      params.push(...conditionalParams);
    }

    return params;
  }

  /**
   * User Properties 파싱
   */
  private parseUserProperties(): ParameterDefinition[] {
    const params: ParameterDefinition[] = [];

    // "### 사용자 속성 변수 (User Properties)" 섹션
    const section = this.extractSectionContent('사용자 속성 변수');
    if (!section) return params;

    const rows = this.parseTableRows(section);
    for (const row of rows) {
      if (row.length >= 4) {
        params.push({
          devGuideVar: row[0].replace(/`/g, ''),
          gtmVariable: row[1].replace(/`/g, ''),
          ga4Key: row[2].replace(/`/g, ''),
          description: row[3],
          example: row[4] || '',
          scope: 'user',
          category: 'user_property',
        });
      }
    }

    return params;
  }

  /**
   * 특정 섹션 파싱
   */
  private parseSection(sectionName: string, category: ParameterDefinition['category']): ParameterDefinition[] {
    const params: ParameterDefinition[] = [];

    const section = this.extractSectionContent(sectionName);
    if (!section) return params;

    const rows = this.parseTableRows(section);
    for (const row of rows) {
      if (row.length >= 3) {
        // 테이블 형식에 따라 파싱
        // 형식 1: | 개발 가이드 변수 | GTM Variable | GA4 파라미터 | 설명 | 예시 |
        // 형식 2: | GTM Variable | GA4 파라미터 | 설명 | 예시 |
        let devGuideVar = '';
        let gtmVariable = '';
        let ga4Key = '';
        let description = '';
        let example = '';

        if (row[0].includes('{{') || row[0].includes('JS -') || row[0].includes('LT -')) {
          // 형식 2: GTM Variable이 첫 번째
          gtmVariable = row[0].replace(/`/g, '');
          ga4Key = row[1].replace(/`/g, '');
          description = row[2] || '';
          example = row[3] || '';
          devGuideVar = this.extractDevGuideVarFromGtmVar(gtmVariable);
        } else {
          // 형식 1: 개발 가이드 변수가 첫 번째
          devGuideVar = row[0].replace(/`/g, '');
          gtmVariable = row[1].replace(/`/g, '');
          ga4Key = row[2].replace(/`/g, '');
          description = row[3] || '';
          example = row[4] || '';
        }

        // 유효한 GA4 파라미터인지 확인
        if (ga4Key && !ga4Key.includes('GA4') && !ga4Key.includes('파라미터')) {
          params.push({
            devGuideVar,
            gtmVariable,
            ga4Key,
            description,
            example,
            scope: 'event',
            category,
          });
        }
      }
    }

    return params;
  }

  /**
   * GTM 변수명에서 개발 가이드 변수 추론
   */
  private extractDevGuideVarFromGtmVar(gtmVar: string): string {
    // {{JS - Site Name}} -> AP_DATA_SITENAME
    const mapping: Record<string, string> = {
      'Site Name': 'AP_DATA_SITENAME',
      'Site Country': 'AP_DATA_COUNTRY',
      'Site Language': 'AP_DATA_LANG',
      'Site Env': 'AP_DATA_ENV',
      'Channel': 'AP_DATA_CHANNEL',
      'Content Group': 'AP_DATA_PAGETYPE',
      'Login Is Login': 'AP_DATA_ISLOGIN',
      'Login Id Gcid': 'AP_DATA_GCID',
      'Login Id Cid': 'AP_DATA_CID',
      'Page Referrer': '(browser)',
      'User Agent': '(browser)',
      'Internal Traffic Type': '(internal)',
    };

    for (const [key, val] of Object.entries(mapping)) {
      if (gtmVar.includes(key)) {
        return val;
      }
    }

    return gtmVar;
  }

  /**
   * 이벤트별 파라미터 파싱
   */
  private parseEventParams(): Map<string, EventParameterConfig> {
    const events = new Map<string, EventParameterConfig>();

    // 이벤트 섹션 패턴: ### event_name (설명)
    const eventSections = this.content.match(/### (\w+) \(([^)]+)\)[^#]*/g) || [];

    for (const section of eventSections) {
      const match = section.match(/### (\w+) \(([^)]+)\)/);
      if (!match) continue;

      const eventName = match[1];
      const description = match[2];

      const rows = this.parseTableRows(section);
      const parameters: ParameterDefinition[] = [];

      for (const row of rows) {
        if (row.length >= 4) {
          const devGuideVar = row[0].replace(/`/g, '');
          const gtmVariable = row[1].replace(/`/g, '');
          const ga4Key = row[2].replace(/`/g, '');
          const paramDescription = row[3];

          const isItemParam = gtmVariable.includes('items 배열 내');

          parameters.push({
            devGuideVar,
            gtmVariable: isItemParam ? undefined : gtmVariable,
            ga4Key,
            description: paramDescription,
            scope: isItemParam ? 'item' : 'event',
            category: 'event_specific',
          });
        }
      }

      const itemsMatch = section.match(/\*\*items 배열\*\*: `([^`]+)`/);
      const hasItems = parameters.some(p => p.scope === 'item') || !!itemsMatch;
      const dataLayerMatch = section.match(/\*\*dataLayer event\*\*: `([^`]+)`/);

      events.set(eventName, {
        eventName,
        description,
        parameters,
        hasItems,
        itemsVariable: itemsMatch?.[1],
        dataLayerEvent: dataLayerMatch?.[1],
      });
    }

    return events;
  }

  /**
   * 공통 item 파라미터 파싱
   */
  private parseCommonItemParams(): ParameterDefinition[] {
    const params: ParameterDefinition[] = [];
    const ecommerceEvents = ['select_item', 'add_to_cart', 'remove_from_cart', 'begin_checkout', 'purchase', 'view_item'];

    for (const eventName of ecommerceEvents) {
      const section = this.extractSectionContent(eventName);
      if (!section) continue;

      const rows = this.parseTableRows(section);
      for (const row of rows) {
        if (row.length >= 4) {
          const gtmVariable = row[1].replace(/`/g, '');
          if (!gtmVariable.includes('items 배열 내')) continue;

          const devGuideVar = row[0].replace(/`/g, '');
          const ga4Key = row[2].replace(/`/g, '');
          const description = row[3];

          if (!params.find(p => p.ga4Key === ga4Key)) {
            params.push({
              devGuideVar,
              ga4Key,
              description,
              scope: 'item',
            });
          }
        }
      }
    }

    return params;
  }

  /**
   * 섹션 내용 추출
   */
  private extractSectionContent(sectionName: string): string | null {
    // 더 정확한 섹션 추출
    const patterns = [
      new RegExp(`###+ [^\\n]*${sectionName}[^\\n]*\\n([\\s\\S]*?)(?=\\n###|\\n---\\n|$)`, 'i'),
      new RegExp(`####+ ${sectionName}[^\\n]*\\n([\\s\\S]*?)(?=\\n####|\\n###|$)`, 'i'),
    ];

    for (const regex of patterns) {
      const match = this.content.match(regex);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * 마크다운 테이블 행 파싱
   */
  private parseTableRows(content: string): string[][] {
    const rows: string[][] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      if (line.trim().startsWith('|') && !line.includes('---')) {
        const cells = line
          .split('|')
          .map(cell => cell.trim())
          .filter(cell => cell.length > 0);

        // 헤더 행 스킵
        if (cells[0]?.includes('개발 가이드') ||
            cells[0]?.includes('GA4 파라미터') ||
            cells[0]?.includes('GTM Variable')) {
          continue;
        }

        if (cells.length >= 3) {
          rows.push(cells);
        }
      }
    }

    return rows;
  }
}

/**
 * 통합 파라미터 쿼리 서비스 (개선된 버전)
 */
export class ParameterQueryService {
  private store: UnifiedParameterStore;

  constructor(store: UnifiedParameterStore) {
    this.store = store;
  }

  /**
   * page_view 등 특정 이벤트의 전체 파라미터 조회
   */
  getEventParams(eventName: string): {
    eventName: string;
    commonParams: ParameterDefinition[];
    eventParams: ParameterDefinition[];
    userParams: ParameterDefinition[];
    itemParams: ParameterDefinition[] | null;
    hasItems: boolean;
    totalCount: number;
  } | null {
    const eventConfig = this.store.events.get(eventName);

    // page_view의 경우 공통 파라미터만 사용
    const isPageView = eventName === 'page_view';

    return {
      eventName,
      commonParams: this.store.commonEventParams,
      eventParams: eventConfig?.parameters.filter(p => p.scope === 'event') || [],
      userParams: this.store.userProperties,
      itemParams: eventConfig?.hasItems ? this.store.itemParams : null,
      hasItems: eventConfig?.hasItems || false,
      totalCount: this.store.commonEventParams.length + this.store.userProperties.length +
        (eventConfig?.parameters.filter(p => p.scope === 'event').length || 0),
    };
  }

  /**
   * 이벤트별 파라미터 조회 (GA4 API dimension 포함)
   */
  getEventParamsWithApiMapping(eventName: string): {
    eventName: string;
    parameters: Array<ParameterDefinition & {
      ga4ApiDimension: string;
      isCustomDimension: boolean;
      category: string;
    }>;
    hasItems: boolean;
    summary: {
      total: number;
      eventParams: number;
      userProperties: number;
    };
  } | null {
    const parameters: Array<ParameterDefinition & {
      ga4ApiDimension: string;
      isCustomDimension: boolean;
      category: string;
    }> = [];

    // 공통 Event Parameters
    for (const p of this.store.commonEventParams) {
      const apiInfo = getGA4ApiDimension(p.ga4Key, 'event');
      parameters.push({
        ...p,
        ga4ApiDimension: apiInfo.dimension,
        isCustomDimension: apiInfo.isCustom,
        category: p.category || 'event_common',
      });
    }

    // User Properties
    for (const p of this.store.userProperties) {
      const apiInfo = getGA4ApiDimension(p.ga4Key, 'user');
      parameters.push({
        ...p,
        ga4ApiDimension: apiInfo.dimension,
        isCustomDimension: apiInfo.isCustom,
        category: 'user_property',
      });
    }

    // 이벤트 전용 파라미터
    const eventConfig = this.store.events.get(eventName);
    if (eventConfig) {
      for (const p of eventConfig.parameters.filter(p => p.scope === 'event')) {
        if (parameters.find(ep => ep.ga4Key === p.ga4Key)) continue;

        const apiInfo = getGA4ApiDimension(p.ga4Key, 'event');
        parameters.push({
          ...p,
          ga4ApiDimension: apiInfo.dimension,
          isCustomDimension: apiInfo.isCustom,
          category: 'event_specific',
        });
      }
    }

    return {
      eventName,
      parameters,
      hasItems: eventConfig?.hasItems || false,
      summary: {
        total: parameters.length,
        eventParams: this.store.commonEventParams.length,
        userProperties: this.store.userProperties.length,
      },
    };
  }

  getEventList(): string[] {
    return Array.from(this.store.events.keys());
  }

  getCommonParams(): {
    eventParams: ParameterDefinition[];
    userProperties: ParameterDefinition[];
  } {
    return {
      eventParams: this.store.commonEventParams,
      userProperties: this.store.userProperties,
    };
  }

  /**
   * 검증 결과 조회
   */
  getValidation(): UnifiedParameterStore['validation'] {
    return this.store.validation;
  }

  /**
   * GTM 기준 파라미터 개수 조회
   */
  getGtmParamCount(): UnifiedParameterStore['gtmParamCount'] {
    return this.store.gtmParamCount;
  }

  findParameterByKey(ga4Key: string): {
    parameter: ParameterDefinition;
    source: 'event_common' | 'user_property' | 'event_specific' | 'item';
    eventName?: string;
  } | null {
    const eventParam = this.store.commonEventParams.find(p => p.ga4Key === ga4Key);
    if (eventParam) {
      return { parameter: eventParam, source: 'event_common' };
    }

    const userProp = this.store.userProperties.find(p => p.ga4Key === ga4Key);
    if (userProp) {
      return { parameter: userProp, source: 'user_property' };
    }

    const itemParam = this.store.itemParams.find(p => p.ga4Key === ga4Key);
    if (itemParam) {
      return { parameter: itemParam, source: 'item' };
    }

    for (const [eventName, config] of this.store.events) {
      const eventParam = config.parameters.find(p => p.ga4Key === ga4Key);
      if (eventParam) {
        return { parameter: eventParam, source: 'event_specific', eventName };
      }
    }

    return null;
  }

  findParameterByDevGuideVar(devGuideVar: string): ParameterDefinition | null {
    const allParams = [
      ...this.store.commonEventParams,
      ...this.store.userProperties,
      ...this.store.itemParams,
      ...Array.from(this.store.events.values()).flatMap(e => e.parameters),
    ];
    return allParams.find(p => p.devGuideVar === devGuideVar) || null;
  }

  /**
   * 요약 출력 (검증 결과 포함)
   */
  printSummary(): void {
    console.log('\n=== 통합 파라미터 스토어 요약 ===');
    console.log(`파싱 시간: ${this.store.parsedAt.toISOString()}`);
    console.log(`소스: ${this.store.sourcePath}`);
    console.log(`\n[GTM 기준]`);
    console.log(`  Event Parameters: ${this.store.gtmParamCount.eventParams}개`);
    console.log(`  User Properties: ${this.store.gtmParamCount.userProperties}개`);
    console.log(`  총합: ${this.store.gtmParamCount.total}개`);
    console.log(`\n[파서 결과]`);
    console.log(`  공통 Event Parameters: ${this.store.commonEventParams.length}개`);
    console.log(`  User Properties: ${this.store.userProperties.length}개`);
    console.log(`  이벤트: ${this.store.events.size}개`);
    console.log(`  item 파라미터: ${this.store.itemParams.length}개`);
    console.log(`\n[검증 결과]`);
    console.log(`  ${this.store.validation.message}`);

    if (!this.store.validation.isValid) {
      if (this.store.validation.missingParams.length > 0) {
        console.log(`  누락: ${this.store.validation.missingParams.join(', ')}`);
      }
      if (this.store.validation.extraParams.length > 0) {
        console.log(`  추가: ${this.store.validation.extraParams.join(', ')}`);
      }
    }
  }
}

// 싱글톤 인스턴스
let cachedStore: UnifiedParameterStore | null = null;
let cachedQueryService: ParameterQueryService | null = null;

export function loadParameterStore(force = false): UnifiedParameterStore {
  if (cachedStore && !force) {
    return cachedStore;
  }

  const parser = new ParamMappingParser();
  cachedStore = parser.parse();
  cachedQueryService = new ParameterQueryService(cachedStore);

  return cachedStore;
}

export function getParameterQueryService(): ParameterQueryService {
  if (!cachedQueryService) {
    loadParameterStore();
  }
  return cachedQueryService!;
}

export function getEventParams(eventName: string) {
  return getParameterQueryService().getEventParams(eventName);
}

/**
 * 파라미터 검증 실행 (Agent가 호출)
 */
export function validateParameters(): {
  isValid: boolean;
  gtmCount: number;
  parserCount: number;
  missing: string[];
  extra: string[];
} {
  const store = loadParameterStore(true);
  return {
    isValid: store.validation.isValid,
    gtmCount: store.gtmParamCount.eventParams,
    parserCount: store.commonEventParams.length,
    missing: store.validation.missingParams,
    extra: store.validation.extraParams,
  };
}

// 하위 호환성을 위한 별칭
export { ParameterDefinition as ParamDefinition };
