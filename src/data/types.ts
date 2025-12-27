/**
 * Data Layer Types
 *
 * 데이터 로드 및 페칭 관련 타입 정의
 */

import { ContentGroup, SpecParameter } from '../branch/types';

/**
 * ga4-event-parameters.json 스키마
 */
export interface EventParameterSpec {
  schemaVersion: string;
  description: string;
  lastUpdated: string;
  gtmAnalysisDate?: string;
  source: {
    gtmContainer: string;
    documents: string[];
  };

  commonParameters: {
    description: string;
    parameters: Record<string, SpecParameterDefinition>;
    loginOnlyParameters?: Record<string, SpecParameterDefinition>;
  };

  events: Record<string, EventDefinition>;

  pageTypeParameterMapping?: Record<string, PageTypeMapping>;
}

/**
 * 스펙 파라미터 정의 (ga4-event-parameters.json 원본)
 */
export interface SpecParameterDefinition {
  ga4Key: string;
  displayName: string;
  dataLayerVar?: string;
  description?: string;
  required: boolean;
  values?: string[];
  example?: string;
  value?: string;  // 상수값
}

/**
 * 이벤트 정의
 */
export interface EventDefinition {
  ga4EventName: string;
  displayName: string;
  dataLayerEvent?: string;
  triggerType: 'pageLoad' | 'click' | 'scroll' | 'submit' | 'custom';
  allowedPageTypes: (ContentGroup | 'ALL')[];
  parameters: {
    event: EventParameter[];
    item: ItemParameter[];
  };
  gtmParamCount?: {
    event: number;
    item: number;
  };
  notes?: string;
}

/**
 * 이벤트 레벨 파라미터
 */
export interface EventParameter {
  ga4Key: string;
  displayName?: string;
  dataLayerVar?: string;
  description?: string;
  required: boolean;
  values?: string[];
  example?: string;
  value?: string;  // 상수값
}

/**
 * Item 레벨 파라미터
 */
export interface ItemParameter {
  ga4Key: string;
  dataLayerVar?: string;
  required: boolean;
  description?: string;
}

/**
 * 페이지 타입별 파라미터 매핑
 */
export interface PageTypeMapping {
  events: string[];
  requiredParams: string[];
  optionalParams: string[];
}

/**
 * GA4 API 응답: 이벤트 데이터
 */
export interface GA4EventData {
  eventName: string;
  eventCount: number;
  contentGroup: ContentGroup | string;
  parameters: GA4ParameterData[];
}

/**
 * GA4 API 응답: 파라미터 데이터
 */
export interface GA4ParameterData {
  name: string;
  value: string | number | null;
  count: number;
  percentage: number;
}

/**
 * GA4 API 응답: Content Group별 이벤트
 */
export interface GA4ContentGroupEvents {
  contentGroup: ContentGroup;
  totalEventCount: number;
  events: GA4EventData[];
  sampleUrls: string[];
}

/**
 * 데이터 소스 타입
 */
export type DataSourceType = 'spec' | 'ga4_api' | 'vision' | 'gtm' | 'pdf';

/**
 * 데이터 로드 결과
 */
export interface DataLoadResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  source: DataSourceType;
  loadedAt: Date;
  cacheHit?: boolean;
}

/**
 * 캐시 설정
 */
export interface CacheConfig {
  enabled: boolean;
  ttlMs: number;
  maxEntries: number;
}

/**
 * 날짜 범위
 */
export interface DateRange {
  startDate: string;  // 'YYYY-MM-DD' or '7daysAgo'
  endDate: string;    // 'YYYY-MM-DD' or 'today'
}

/**
 * GA4 Fetcher 옵션
 */
export interface GA4FetchOptions {
  propertyId: string;
  dateRange: DateRange;
  contentGroups?: ContentGroup[];
  events?: string[];
  limit?: number;
  useCache?: boolean;
}

/**
 * Spec Loader 옵션
 */
export interface SpecLoadOptions {
  specPath: string;
  validateSchema?: boolean;
  includeDeprecated?: boolean;
}
