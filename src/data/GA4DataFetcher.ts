/**
 * GA4 Data Fetcher
 *
 * GA4 API에서 Content Group별 이벤트 및 파라미터 데이터를 가져옵니다.
 */

import { GA4Client, GA4ClientConfig, GA4QueryOptions } from '../ga4/ga4Client';
import { ContentGroup, GA4Parameter } from '../branch/types';
import {
  GA4EventData,
  GA4ParameterData,
  GA4ContentGroupEvents,
  GA4FetchOptions,
  DataLoadResult,
  DateRange
} from './types';

/**
 * GA4 Data Fetcher 설정
 */
export interface GA4DataFetcherConfig {
  propertyId: string;
  serviceAccountKeyPath?: string;
  useCache?: boolean;
  cacheTtlMs?: number;
}

/**
 * 캐시 엔트리
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * GA4 Data Fetcher 클래스
 */
export class GA4DataFetcher {
  private ga4Client: GA4Client | null = null;
  private config: GA4DataFetcherConfig;
  private cache: Map<string, CacheEntry<any>> = new Map();
  private cacheTtlMs: number;

  constructor(config: GA4DataFetcherConfig) {
    this.config = config;
    this.cacheTtlMs = config.cacheTtlMs || 5 * 60 * 1000; // 기본 5분
  }

  /**
   * GA4 클라이언트 초기화
   */
  async initialize(): Promise<void> {
    const clientConfig: GA4ClientConfig = {
      propertyId: this.config.propertyId,
      authType: 'service_account',
      serviceAccountConfig: {
        keyFilePath: this.config.serviceAccountKeyPath || './credentials/service-account.json'
      }
    };

    this.ga4Client = new GA4Client(clientConfig);
    await this.ga4Client.initialize();
  }

  /**
   * 초기화 확인
   */
  private ensureInitialized(): void {
    if (!this.ga4Client) {
      throw new Error('GA4DataFetcher가 초기화되지 않았습니다. initialize()를 먼저 호출하세요.');
    }
  }

  /**
   * 캐시 키 생성
   */
  private getCacheKey(method: string, params: any): string {
    return `${method}:${JSON.stringify(params)}`;
  }

  /**
   * 캐시에서 데이터 조회
   */
  private getFromCache<T>(key: string): T | null {
    if (!this.config.useCache) return null;

    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.cacheTtlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * 캐시에 데이터 저장
   */
  private setCache<T>(key: string, data: T): void {
    if (!this.config.useCache) return;

    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Content Group별 이벤트 조회
   */
  async getEventsByContentGroup(
    contentGroup: ContentGroup,
    options: GA4FetchOptions
  ): Promise<DataLoadResult<GA4ContentGroupEvents>> {
    this.ensureInitialized();

    const cacheKey = this.getCacheKey('getEventsByContentGroup', { contentGroup, options });
    const cached = this.getFromCache<GA4ContentGroupEvents>(cacheKey);
    if (cached) {
      return {
        success: true,
        data: cached,
        source: 'ga4_api',
        loadedAt: new Date(),
        cacheHit: true
      };
    }

    try {
      // contentGroup 차원으로 필터링하여 이벤트 조회
      const queryOptions: GA4QueryOptions = {
        startDate: options.dateRange.startDate,
        endDate: options.dateRange.endDate,
        limit: options.limit || 500
      };

      // 모든 이벤트 중 해당 contentGroup에서 발생한 것들 조회
      const events = await this.ga4Client!.getEvents(queryOptions);

      // content_group 필터링이 필요 - 별도 쿼리로 처리
      const contentGroupEvents = await this.fetchEventsForContentGroup(contentGroup, queryOptions);

      const result: GA4ContentGroupEvents = {
        contentGroup,
        totalEventCount: contentGroupEvents.reduce((sum, e) => sum + e.eventCount, 0),
        events: contentGroupEvents,
        sampleUrls: await this.getSampleUrlsForContentGroup(contentGroup, queryOptions)
      };

      this.setCache(cacheKey, result);

      return {
        success: true,
        data: result,
        source: 'ga4_api',
        loadedAt: new Date()
      };
    } catch (error: any) {
      return {
        success: false,
        error: `GA4 API 호출 실패: ${error.message}`,
        source: 'ga4_api',
        loadedAt: new Date()
      };
    }
  }

  /**
   * Content Group에서 발생한 이벤트 조회 (내부)
   */
  private async fetchEventsForContentGroup(
    contentGroup: ContentGroup,
    options: GA4QueryOptions
  ): Promise<GA4EventData[]> {
    // page_view 이벤트를 기준으로 content_group별 페이지 조회
    const pageEvents = await this.ga4Client!.getEventPagesByContentGroup('page_view', options);

    // 해당 content_group의 이벤트들 필터링
    const filtered = pageEvents.filter(p => p.contentGroup === contentGroup);

    // 이벤트별로 집계
    const eventMap: Map<string, GA4EventData> = new Map();

    // 해당 content_group의 페이지들에서 발생한 이벤트 조회
    for (const page of filtered.slice(0, 5)) { // 상위 5개 페이지 샘플링
      try {
        const pageEventsData = await this.ga4Client!.getEventsByPage(page.pagePath, options);

        for (const evt of pageEventsData) {
          const existing = eventMap.get(evt.eventName);
          if (existing) {
            existing.eventCount += evt.eventCount;
          } else {
            eventMap.set(evt.eventName, {
              eventName: evt.eventName,
              eventCount: evt.eventCount,
              contentGroup,
              parameters: []
            });
          }
        }
      } catch (error) {
        console.warn(`페이지 이벤트 조회 실패: ${page.pagePath}`);
      }
    }

    return Array.from(eventMap.values());
  }

  /**
   * Content Group의 샘플 URL 조회
   */
  private async getSampleUrlsForContentGroup(
    contentGroup: ContentGroup,
    options: GA4QueryOptions
  ): Promise<string[]> {
    const pageEvents = await this.ga4Client!.getEventPagesByContentGroup('page_view', options);
    const filtered = pageEvents.filter(p => p.contentGroup === contentGroup);

    return filtered.slice(0, 10).map(p => p.pagePath);
  }

  /**
   * 이벤트의 파라미터 값 조회
   */
  async getEventParameterValues(
    eventName: string,
    parameterName: string,
    options: GA4FetchOptions
  ): Promise<DataLoadResult<GA4ParameterData[]>> {
    this.ensureInitialized();

    const cacheKey = this.getCacheKey('getEventParameterValues', { eventName, parameterName, options });
    const cached = this.getFromCache<GA4ParameterData[]>(cacheKey);
    if (cached) {
      return {
        success: true,
        data: cached,
        source: 'ga4_api',
        loadedAt: new Date(),
        cacheHit: true
      };
    }

    try {
      const queryOptions: GA4QueryOptions = {
        startDate: options.dateRange.startDate,
        endDate: options.dateRange.endDate,
        limit: options.limit || 100
      };

      const values = await this.ga4Client!.getEventParameterValues(
        eventName,
        parameterName,
        queryOptions
      );

      const result: GA4ParameterData[] = values.map(v => ({
        name: parameterName,
        value: v.value,
        count: v.eventCount,
        percentage: v.proportion * 100
      }));

      this.setCache(cacheKey, result);

      return {
        success: true,
        data: result,
        source: 'ga4_api',
        loadedAt: new Date()
      };
    } catch (error: any) {
      return {
        success: false,
        error: `파라미터 값 조회 실패: ${error.message}`,
        source: 'ga4_api',
        loadedAt: new Date()
      };
    }
  }

  /**
   * 모든 Content Group의 대표 URL 조회
   */
  async getAllContentGroupUrls(
    options: GA4FetchOptions
  ): Promise<DataLoadResult<Map<ContentGroup, string[]>>> {
    this.ensureInitialized();

    try {
      const queryOptions: GA4QueryOptions = {
        startDate: options.dateRange.startDate,
        endDate: options.dateRange.endDate,
        limit: 500
      };

      // page_view 이벤트 기준으로 content_group별 페이지 조회
      const pageEvents = await this.ga4Client!.getEventPagesByContentGroup('page_view', queryOptions);

      const urlMap: Map<ContentGroup, string[]> = new Map();

      for (const page of pageEvents) {
        const cg = page.contentGroup as ContentGroup;
        if (!urlMap.has(cg)) {
          urlMap.set(cg, []);
        }
        urlMap.get(cg)!.push(page.pagePath);
      }

      return {
        success: true,
        data: urlMap,
        source: 'ga4_api',
        loadedAt: new Date()
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Content Group URL 조회 실패: ${error.message}`,
        source: 'ga4_api',
        loadedAt: new Date()
      };
    }
  }

  /**
   * 이벤트별 파라미터 목록 조회 (실제 수집된 것)
   */
  async getActualEventParameters(
    eventName: string,
    contentGroup: ContentGroup,
    options: GA4FetchOptions
  ): Promise<DataLoadResult<GA4Parameter[]>> {
    this.ensureInitialized();

    const cacheKey = this.getCacheKey('getActualEventParameters', { eventName, contentGroup, options });
    const cached = this.getFromCache<GA4Parameter[]>(cacheKey);
    if (cached) {
      return {
        success: true,
        data: cached,
        source: 'ga4_api',
        loadedAt: new Date(),
        cacheHit: true
      };
    }

    try {
      const queryOptions: GA4QueryOptions = {
        startDate: options.dateRange.startDate,
        endDate: options.dateRange.endDate,
        limit: options.limit || 100
      };

      const params = await this.ga4Client!.getEventParameters(eventName, queryOptions);

      const result: GA4Parameter[] = params.map(p => ({
        name: p.parameterName,
        value: null, // 값은 별도 조회 필요
        eventCount: p.parameterCount,
        lastSeen: new Date()
      }));

      this.setCache(cacheKey, result);

      return {
        success: true,
        data: result,
        source: 'ga4_api',
        loadedAt: new Date()
      };
    } catch (error: any) {
      return {
        success: false,
        error: `파라미터 조회 실패: ${error.message}`,
        source: 'ga4_api',
        loadedAt: new Date()
      };
    }
  }

  /**
   * 페이지 경로 기반 이벤트 발생 조회 (파라미터 값 없이 발생 여부만)
   *
   * 파라미터 값은 커스텀 디멘션 등록이 필요하므로,
   * 이벤트 발생 여부와 횟수만 반환합니다.
   */
  async getEventOccurrences(
    pagePath: string,
    options: GA4FetchOptions
  ): Promise<DataLoadResult<Map<string, number>>> {
    this.ensureInitialized();

    const cacheKey = this.getCacheKey('getEventOccurrences', { pagePath, options });
    const cached = this.getFromCache<Map<string, number>>(cacheKey);
    if (cached) {
      return {
        success: true,
        data: cached,
        source: 'ga4_api',
        loadedAt: new Date(),
        cacheHit: true
      };
    }

    try {
      const queryOptions = {
        startDate: options.dateRange.startDate,
        endDate: options.dateRange.endDate,
        limit: options.limit || 50
      };

      const events = await this.ga4Client!.getEventsByPage(pagePath, queryOptions);

      const result = new Map<string, number>();
      for (const evt of events) {
        result.set(evt.eventName, evt.eventCount);
      }

      this.setCache(cacheKey, result);

      return {
        success: true,
        data: result,
        source: 'ga4_api',
        loadedAt: new Date()
      };
    } catch (error: any) {
      return {
        success: false,
        error: `이벤트 발생 조회 실패: ${error.message}`,
        source: 'ga4_api',
        loadedAt: new Date()
      };
    }
  }

  /**
   * 캐시 초기화
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 연결 테스트
   */
  async testConnection(): Promise<boolean> {
    try {
      this.ensureInitialized();
      const events = await this.ga4Client!.getEvents({ limit: 1 });
      return events.length >= 0;
    } catch {
      return false;
    }
  }

  /**
   * Property ID 반환
   */
  getPropertyId(): string {
    return this.config.propertyId;
  }
}

/**
 * 편의 함수: GA4DataFetcher 생성 및 초기화
 */
export async function createGA4DataFetcher(
  propertyId: string,
  serviceAccountKeyPath?: string
): Promise<GA4DataFetcher> {
  const fetcher = new GA4DataFetcher({
    propertyId,
    serviceAccountKeyPath,
    useCache: true
  });

  await fetcher.initialize();
  return fetcher;
}
