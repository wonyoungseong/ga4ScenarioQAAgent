/**
 * GTM 파라미터 → GA4 API Dimension 1:1 맵핑
 *
 * AI가 이벤트 검증 시 GA4 API를 직접 조회할 수 있도록
 * GTM에서 전송하는 파라미터명과 GA4 API에서 조회해야 하는 dimension명을 맵핑합니다.
 */

/**
 * GA4 표준 이벤트 파라미터 → GA4 API Dimension 맵핑
 * https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema
 */
export const GA4_STANDARD_PARAM_TO_DIMENSION: Record<string, string> = {
  // Ecommerce - Item 파라미터 (표준)
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
  'affiliation': 'affiliation',
  'coupon': 'coupon',
  'discount': 'discount',
  'index': 'index',
  'price': 'price',
  'quantity': 'quantity',

  // Ecommerce - Promotion 파라미터 (표준)
  'promotion_id': 'promotionId',
  'promotion_name': 'promotionName',
  'creative_name': 'creativeName',
  'creative_slot': 'creativeSlot',
  'location_id': 'locationId',

  // Ecommerce - Transaction 파라미터 (표준)
  'transaction_id': 'transactionId',
  'currency': 'currency',
  'value': 'value',
  'shipping': 'shipping',
  'tax': 'tax',

  // 기타 표준 파라미터
  'search_term': 'searchTerm',
  'method': 'method',
  'content_type': 'contentType',
  'content_id': 'contentId',
  'page_location': 'pageLocation',
  'page_referrer': 'pageReferrer',
  'page_title': 'pageTitle',
};

/**
 * GA4 표준 이벤트 파라미터 → GA4 API Metric 맵핑
 */
export const GA4_STANDARD_PARAM_TO_METRIC: Record<string, string> = {
  'value': 'purchaseRevenue',
  'quantity': 'itemQuantity',
};

/**
 * 커스텀 파라미터는 customEvent: 접두사로 조회
 * 예: event_category → customEvent:event_category
 */
export function getGa4DimensionName(gtmParamKey: string): string {
  // 표준 파라미터면 맵핑된 dimension 반환
  if (GA4_STANDARD_PARAM_TO_DIMENSION[gtmParamKey]) {
    return GA4_STANDARD_PARAM_TO_DIMENSION[gtmParamKey];
  }
  // 커스텀 파라미터면 customEvent: 접두사 추가
  return `customEvent:${gtmParamKey}`;
}

/**
 * 이벤트별 파라미터 맵핑 정의
 */
export interface EventParameterMapping {
  eventName: string;
  ga4EventFilter: string;  // GA4 API 필터 조건
  parameters: {
    gtmKey: string;
    ga4Dimension: string;
    isStandard: boolean;
    scope: 'event' | 'item';
    description?: string;
  }[];
}

/**
 * GTM JSON에서 추출한 이벤트 정보를 GA4 API 조회 가능한 형태로 변환
 */
import { GTMEventParameterExtractor, GTMEventDefinition } from './gtmEventParameterExtractor';

export class GTMToGA4MappingGenerator {
  private extractor: GTMEventParameterExtractor;

  constructor(gtmJsonPath: string = './GTM-5FK5X5C4_workspace112.json') {
    this.extractor = new GTMEventParameterExtractor(gtmJsonPath);
  }

  /**
   * 모든 이벤트에 대한 GA4 조회 맵핑 생성
   */
  generateAllMappings(): EventParameterMapping[] {
    const events = this.extractor.extractAllEvents();
    return events.map(event => this.convertToMapping(event));
  }

  /**
   * 특정 이벤트의 GA4 조회 맵핑 생성
   */
  getMappingForEvent(eventName: string): EventParameterMapping | null {
    const event = this.extractor.getEventDefinition(eventName);
    if (!event) return null;
    return this.convertToMapping(event);
  }

  /**
   * GTMEventDefinition → EventParameterMapping 변환
   */
  private convertToMapping(event: GTMEventDefinition): EventParameterMapping {
    const parameters: EventParameterMapping['parameters'] = [];

    // Event-level 파라미터
    for (const param of event.eventParameters) {
      if (param.key === 'items' || param.key === 'currency' || param.key === 'value') {
        continue; // 표준 필드는 별도 처리
      }
      parameters.push({
        gtmKey: param.key,
        ga4Dimension: getGa4DimensionName(param.key),
        isStandard: param.isStandard,
        scope: 'event',
      });
    }

    // Item-level 파라미터
    for (const param of event.itemParameters) {
      parameters.push({
        gtmKey: param.key,
        ga4Dimension: getGa4DimensionName(param.key),
        isStandard: param.isStandard,
        scope: 'item',
      });
    }

    return {
      eventName: event.eventName,
      ga4EventFilter: `eventName == '${event.eventName}'`,
      parameters,
    };
  }

  /**
   * AI가 바로 사용할 수 있는 간단한 맵핑 형태로 출력
   */
  generateSimpleMappings(): Record<string, {
    ga4Filter: string;
    eventParams: Record<string, string>;
    itemParams: Record<string, string>;
  }> {
    const events = this.extractor.extractAllEvents();
    const result: Record<string, any> = {};

    for (const event of events) {
      const eventParams: Record<string, string> = {};
      const itemParams: Record<string, string> = {};

      for (const param of event.eventParameters) {
        if (param.key !== 'items' && param.key !== 'currency' && param.key !== 'value') {
          eventParams[param.key] = getGa4DimensionName(param.key);
        }
      }

      for (const param of event.itemParameters) {
        itemParams[param.key] = getGa4DimensionName(param.key);
      }

      result[event.eventName] = {
        ga4Filter: `eventName == '${event.eventName}'`,
        eventParams,
        itemParams,
      };
    }

    return result;
  }
}

/**
 * 기본 인스턴스 생성 헬퍼
 */
export function createGTMToGA4MappingGenerator(): GTMToGA4MappingGenerator {
  return new GTMToGA4MappingGenerator();
}
