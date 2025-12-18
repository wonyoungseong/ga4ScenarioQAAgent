/**
 * PARAM_MAPPING_TABLE.md 파서
 *
 * 원본 문서(PARAM_MAPPING_TABLE.md)를 파싱하여 통합 파라미터 스토어를 생성합니다.
 * 이 파서는 수동 중복 없이 원본 문서를 SSOT(Single Source of Truth)로 사용합니다.
 *
 * 데이터 흐름:
 * PARAM_MAPPING_TABLE.md → Parser → UnifiedParameterStore → getEventParams()
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * GA4 Data API 표준 dimension 매핑
 * https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema
 *
 * key: GA4 이벤트 파라미터 이름
 * value: GA4 Data API dimension 이름
 */
const GA4_STANDARD_DIMENSION_MAP: Record<string, string> = {
  // 페이지 관련
  'page_location': 'pageLocation',
  'page_title': 'pageTitle',
  'page_referrer': 'pageReferrer',
  'page_path': 'pagePath',

  // 지역
  'country': 'country',
  'city': 'city',
  'region': 'region',

  // 언어/플랫폼
  'language': 'language',
  'platform': 'platform',

  // 이커머스 표준
  'currency': 'currencyCode',
  'transaction_id': 'transactionId',
  'item_id': 'itemId',
  'item_name': 'itemName',
  'item_brand': 'itemBrand',
  'item_category': 'itemCategory',
  'item_category2': 'itemCategory2',
  'item_category3': 'itemCategory3',
  'item_category4': 'itemCategory4',
  'item_category5': 'itemCategory5',
  'item_variant': 'itemVariant',
  'item_list_name': 'itemListName',
  'item_list_id': 'itemListId',
  'index': 'itemListPosition',
  'promotion_id': 'itemPromotionId',
  'promotion_name': 'itemPromotionName',
  'creative_slot': 'itemPromotionCreativeSlot',
  'creative_name': 'itemPromotionCreativeName',

  // 캠페인
  'campaign': 'sessionCampaignName',
  'source': 'sessionSource',
  'medium': 'sessionMedium',
};

/**
 * GA4 파라미터를 GA4 Data API dimension으로 변환
 */
export function getGA4ApiDimension(ga4Key: string, scope: 'event' | 'item' | 'user' = 'event'): {
  dimension: string;
  isCustom: boolean;
} {
  // 표준 dimension 확인
  const standardDimension = GA4_STANDARD_DIMENSION_MAP[ga4Key];
  if (standardDimension) {
    return { dimension: standardDimension, isCustom: false };
  }

  // Custom dimension 생성
  if (scope === 'user') {
    return { dimension: `customUser:${ga4Key}`, isCustom: true };
  } else if (scope === 'item') {
    // item-level은 이커머스 리포트에서 별도 처리
    return { dimension: `customEvent:${ga4Key}`, isCustom: true };
  } else {
    return { dimension: `customEvent:${ga4Key}`, isCustom: true };
  }
}

/**
 * 파라미터 정의
 */
export interface ParameterDefinition {
  /** GA4 파라미터 키 */
  ga4Key: string;
  /** 개발 가이드 변수명 */
  devGuideVar: string;
  /** GTM 변수명 */
  gtmVariable?: string;
  /** 설명 */
  description: string;
  /** 예시 값 */
  example?: string;
  /** 필수 여부 */
  required?: boolean;
  /** 조건 (예: "로그인 시") */
  condition?: string;
  /** GA4 표준 파라미터 여부 */
  isStandard?: boolean;
  /** 스코프: event-level 또는 item-level */
  scope: 'event' | 'item';
  /** GA4 Data API dimension 이름 (표준 또는 customEvent:xxx) */
  ga4ApiDimension?: string;
  /** GA4 API에서 custom dimension 여부 */
  isCustomDimension?: boolean;
}

/**
 * 이벤트별 파라미터 설정
 */
export interface EventParameterConfig {
  /** 이벤트 이름 (GA4) */
  eventName: string;
  /** dataLayer 이벤트 이름 */
  dataLayerEvent?: string;
  /** 이벤트 설명 */
  description?: string;
  /** 이벤트 전용 파라미터 */
  parameters: ParameterDefinition[];
  /** items 배열 포함 여부 */
  hasItems: boolean;
  /** items 배열 변수명 */
  itemsVariable?: string;
}

/**
 * 통합 파라미터 스토어
 */
export interface UnifiedParameterStore {
  /** 파싱 시간 */
  parsedAt: Date;
  /** 소스 파일 경로 */
  sourcePath: string;
  /** 공통 파라미터 (페이지 정보) */
  commonPageParams: ParameterDefinition[];
  /** 공통 파라미터 (사용자 정보 - 로그인 시) */
  commonUserParams: ParameterDefinition[];
  /** 이벤트별 파라미터 */
  events: Map<string, EventParameterConfig>;
  /** item 배열 내 파라미터 (공통) */
  itemParams: ParameterDefinition[];
}

/**
 * PARAM_MAPPING_TABLE.md 파서
 */
export class ParamMappingParser {
  private content: string = '';
  private sourcePath: string;

  constructor(sourcePath?: string) {
    this.sourcePath = sourcePath ||
      path.join(process.cwd(), 'specs/sites/amorepacific_GTM-5FK5X5C4/mapping/PARAM_MAPPING_TABLE.md');
  }

  /**
   * 파싱 실행
   */
  parse(): UnifiedParameterStore {
    if (!fs.existsSync(this.sourcePath)) {
      throw new Error(`PARAM_MAPPING_TABLE.md not found: ${this.sourcePath}`);
    }

    this.content = fs.readFileSync(this.sourcePath, 'utf-8');

    const store: UnifiedParameterStore = {
      parsedAt: new Date(),
      sourcePath: this.sourcePath,
      commonPageParams: this.parseCommonPageParams(),
      commonUserParams: this.parseCommonUserParams(),
      events: this.parseEventParams(),
      itemParams: this.parseCommonItemParams(),
    };

    return store;
  }

  /**
   * 공통 페이지 정보 파라미터 파싱
   */
  private parseCommonPageParams(): ParameterDefinition[] {
    const params: ParameterDefinition[] = [];

    // "### 페이지 정보 변수" 섹션 찾기
    const section = this.extractSection('페이지 정보 변수');
    if (!section) return params;

    const rows = this.parseTableRows(section);
    for (const row of rows) {
      if (row.length >= 4) {
        params.push({
          devGuideVar: row[0].replace(/`/g, ''),
          ga4Key: row[1].replace(/`/g, ''),
          description: row[2],
          example: row[3],
          scope: 'event',
          required: true,
        });
      }
    }

    return params;
  }

  /**
   * 공통 사용자 정보 파라미터 파싱 (로그인 시)
   */
  private parseCommonUserParams(): ParameterDefinition[] {
    const params: ParameterDefinition[] = [];

    // "### 사용자 정보 변수 (로그인 시)" 섹션 찾기
    const section = this.extractSection('사용자 정보 변수');
    if (!section) return params;

    const rows = this.parseTableRows(section);
    for (const row of rows) {
      if (row.length >= 4) {
        params.push({
          devGuideVar: row[0].replace(/`/g, ''),
          ga4Key: row[1].replace(/`/g, ''),
          description: row[2],
          example: row[3],
          scope: 'event',
          condition: '로그인 시',
        });
      }
    }

    return params;
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

      // 테이블 파싱
      const rows = this.parseTableRows(section);
      const parameters: ParameterDefinition[] = [];

      for (const row of rows) {
        if (row.length >= 4) {
          const devGuideVar = row[0].replace(/`/g, '');
          const gtmVariable = row[1].replace(/`/g, '');
          const ga4Key = row[2].replace(/`/g, '');
          const paramDescription = row[3];

          // items 배열 내 파라미터인지 확인
          const isItemParam = gtmVariable.includes('items 배열 내');

          parameters.push({
            devGuideVar,
            gtmVariable: isItemParam ? undefined : gtmVariable,
            ga4Key,
            description: paramDescription,
            scope: isItemParam ? 'item' : 'event',
          });
        }
      }

      // items 배열 변수 찾기
      const itemsMatch = section.match(/\*\*items 배열\*\*: `([^`]+)`/);
      const hasItems = parameters.some(p => p.scope === 'item') || !!itemsMatch;

      // dataLayer event 찾기
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
   * 공통 item 파라미터 파싱 (이커머스 공통)
   * 모든 이벤트에서 "(items 배열 내)" 파라미터를 수집하여 중복 제거
   */
  private parseCommonItemParams(): ParameterDefinition[] {
    const params: ParameterDefinition[] = [];

    // 모든 이벤트 섹션에서 item 파라미터 수집
    const ecommerceEvents = [
      'select_item', 'add_to_cart', 'remove_from_cart',
      'begin_checkout', 'purchase', 'view_item'
    ];

    for (const eventName of ecommerceEvents) {
      const section = this.extractSection(eventName);
      if (!section) continue;

      const rows = this.parseTableRows(section);
      for (const row of rows) {
        if (row.length >= 4) {
          const gtmVariable = row[1].replace(/`/g, '');

          // items 배열 내 파라미터만 추출
          if (!gtmVariable.includes('items 배열 내')) continue;

          const devGuideVar = row[0].replace(/`/g, '');
          const ga4Key = row[2].replace(/`/g, '');
          const description = row[3];

          // 중복 체크
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
   * 섹션 추출
   */
  private extractSection(sectionName: string): string | null {
    const regex = new RegExp(`### [^\\n]*${sectionName}[^\\n]*\\n([\\s\\S]*?)(?=###|$)`, 'i');
    const match = this.content.match(regex);
    return match ? match[1] : null;
  }

  /**
   * 마크다운 테이블 행 파싱
   */
  private parseTableRows(content: string): string[][] {
    const rows: string[][] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      // 테이블 행: | col1 | col2 | ...
      if (line.trim().startsWith('|') && !line.includes('---')) {
        const cells = line
          .split('|')
          .map(cell => cell.trim())
          .filter(cell => cell.length > 0);

        // 헤더 행 스킵 (개발 가이드 변수, GTM Variable 등)
        if (cells[0]?.includes('개발 가이드') || cells[0]?.includes('GA4 파라미터')) {
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
 * 통합 파라미터 쿼리 서비스
 */
export class ParameterQueryService {
  private store: UnifiedParameterStore;

  constructor(store: UnifiedParameterStore) {
    this.store = store;
  }

  /**
   * 이벤트별 전체 파라미터 조회
   */
  getEventParams(eventName: string): {
    eventName: string;
    commonParams: ParameterDefinition[];
    eventParams: ParameterDefinition[];
    userParams: ParameterDefinition[];
    itemParams: ParameterDefinition[] | null;
    hasItems: boolean;
  } | null {
    const eventConfig = this.store.events.get(eventName);

    if (!eventConfig) {
      return null;
    }

    return {
      eventName,
      commonParams: this.store.commonPageParams,
      eventParams: eventConfig.parameters.filter(p => p.scope === 'event'),
      userParams: this.store.commonUserParams,
      itemParams: eventConfig.hasItems ? this.store.itemParams : null,
      hasItems: eventConfig.hasItems,
    };
  }

  /**
   * 이벤트별 파라미터 조회 (GA4 Data API dimension 포함)
   *
   * @example
   * const result = service.getEventParamsWithApiMapping('page_view');
   * // result.parameters[0].ga4ApiDimension = 'customEvent:site_name'
   */
  getEventParamsWithApiMapping(eventName: string): {
    eventName: string;
    parameters: Array<ParameterDefinition & {
      ga4ApiDimension: string;
      isCustomDimension: boolean;
      category: 'common' | 'event' | 'user' | 'item';
    }>;
    hasItems: boolean;
    summary: {
      total: number;
      standard: number;
      custom: number;
    };
  } | null {
    const eventConfig = this.store.events.get(eventName);

    if (!eventConfig) {
      return null;
    }

    const parameters: Array<ParameterDefinition & {
      ga4ApiDimension: string;
      isCustomDimension: boolean;
      category: 'common' | 'event' | 'user' | 'item';
    }> = [];

    // 공통 페이지 파라미터
    for (const p of this.store.commonPageParams) {
      const apiInfo = getGA4ApiDimension(p.ga4Key, 'event');
      parameters.push({
        ...p,
        ga4ApiDimension: apiInfo.dimension,
        isCustomDimension: apiInfo.isCustom,
        category: 'common',
      });
    }

    // 이벤트 전용 파라미터
    for (const p of eventConfig.parameters.filter(p => p.scope === 'event')) {
      // 공통 파라미터와 중복 체크
      if (parameters.find(ep => ep.ga4Key === p.ga4Key)) continue;

      const apiInfo = getGA4ApiDimension(p.ga4Key, 'event');
      parameters.push({
        ...p,
        ga4ApiDimension: apiInfo.dimension,
        isCustomDimension: apiInfo.isCustom,
        category: 'event',
      });
    }

    // 사용자 파라미터 (로그인 시)
    for (const p of this.store.commonUserParams) {
      const apiInfo = getGA4ApiDimension(p.ga4Key, 'user');
      parameters.push({
        ...p,
        ga4ApiDimension: apiInfo.dimension,
        isCustomDimension: apiInfo.isCustom,
        category: 'user',
      });
    }

    // item 파라미터 (해당 시)
    if (eventConfig.hasItems) {
      for (const p of this.store.itemParams) {
        const apiInfo = getGA4ApiDimension(p.ga4Key, 'item');
        parameters.push({
          ...p,
          ga4ApiDimension: apiInfo.dimension,
          isCustomDimension: apiInfo.isCustom,
          category: 'item',
        });
      }
    }

    const standardCount = parameters.filter(p => !p.isCustomDimension).length;
    const customCount = parameters.filter(p => p.isCustomDimension).length;

    return {
      eventName,
      parameters,
      hasItems: eventConfig.hasItems,
      summary: {
        total: parameters.length,
        standard: standardCount,
        custom: customCount,
      },
    };
  }

  /**
   * 이벤트 목록 조회
   */
  getEventList(): string[] {
    return Array.from(this.store.events.keys());
  }

  /**
   * 공통 파라미터 조회
   */
  getCommonParams(): {
    pageParams: ParameterDefinition[];
    userParams: ParameterDefinition[];
  } {
    return {
      pageParams: this.store.commonPageParams,
      userParams: this.store.commonUserParams,
    };
  }

  /**
   * 파라미터 키로 검색
   */
  findParameterByKey(ga4Key: string): {
    parameter: ParameterDefinition;
    source: 'common_page' | 'common_user' | 'event' | 'item';
    eventName?: string;
  } | null {
    // 공통 페이지 파라미터
    const pageParam = this.store.commonPageParams.find(p => p.ga4Key === ga4Key);
    if (pageParam) {
      return { parameter: pageParam, source: 'common_page' };
    }

    // 공통 사용자 파라미터
    const userParam = this.store.commonUserParams.find(p => p.ga4Key === ga4Key);
    if (userParam) {
      return { parameter: userParam, source: 'common_user' };
    }

    // item 파라미터
    const itemParam = this.store.itemParams.find(p => p.ga4Key === ga4Key);
    if (itemParam) {
      return { parameter: itemParam, source: 'item' };
    }

    // 이벤트별 파라미터
    for (const [eventName, config] of this.store.events) {
      const eventParam = config.parameters.find(p => p.ga4Key === ga4Key);
      if (eventParam) {
        return { parameter: eventParam, source: 'event', eventName };
      }
    }

    return null;
  }

  /**
   * 개발 가이드 변수명으로 검색
   */
  findParameterByDevGuideVar(devGuideVar: string): ParameterDefinition | null {
    // 모든 소스에서 검색
    const allParams = [
      ...this.store.commonPageParams,
      ...this.store.commonUserParams,
      ...this.store.itemParams,
      ...Array.from(this.store.events.values()).flatMap(e => e.parameters),
    ];

    return allParams.find(p => p.devGuideVar === devGuideVar) || null;
  }

  /**
   * 요약 출력
   */
  printSummary(): void {
    console.log('\n=== 통합 파라미터 스토어 요약 ===');
    console.log(`파싱 시간: ${this.store.parsedAt.toISOString()}`);
    console.log(`소스: ${this.store.sourcePath}`);
    console.log(`\n공통 페이지 파라미터: ${this.store.commonPageParams.length}개`);
    console.log(`공통 사용자 파라미터: ${this.store.commonUserParams.length}개`);
    console.log(`이벤트: ${this.store.events.size}개`);
    console.log(`공통 item 파라미터: ${this.store.itemParams.length}개`);

    console.log('\n📋 이벤트 목록:');
    for (const [eventName, config] of this.store.events) {
      const paramCount = config.parameters.length;
      const itemsTag = config.hasItems ? ' [items]' : '';
      console.log(`  - ${eventName}: ${paramCount}개 파라미터${itemsTag}`);
    }
  }
}

// 싱글톤 인스턴스
let cachedStore: UnifiedParameterStore | null = null;
let cachedQueryService: ParameterQueryService | null = null;

/**
 * 통합 파라미터 스토어 로드 (캐싱)
 */
export function loadParameterStore(force = false): UnifiedParameterStore {
  if (cachedStore && !force) {
    return cachedStore;
  }

  const parser = new ParamMappingParser();
  cachedStore = parser.parse();
  cachedQueryService = new ParameterQueryService(cachedStore);

  return cachedStore;
}

/**
 * 파라미터 쿼리 서비스 가져오기
 */
export function getParameterQueryService(): ParameterQueryService {
  if (!cachedQueryService) {
    loadParameterStore();
  }
  return cachedQueryService!;
}

/**
 * 간편 함수: 이벤트 파라미터 조회
 */
export function getEventParams(eventName: string) {
  return getParameterQueryService().getEventParams(eventName);
}
