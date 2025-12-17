/**
 * 이벤트 파라미터 설정
 *
 * GTM 태그에서 추출한 이벤트별 파라미터 키 정보를 관리합니다.
 * - 시나리오 가이드 작성 시 어떤 값을 확인해야 하는지 참조
 * - 초기 세팅값으로 보관
 */

import * as fs from 'fs';

/**
 * 이벤트 파라미터 정의
 */
export interface EventParameterDefinition {
  eventName: string;
  /** 파라미터 키 목록 */
  parameters: {
    key: string;
    /** 파라미터 값 소스 (GTM 변수명 또는 상수) */
    valueSource: string;
    /** 필수 여부 (있으면 항상 전송) */
    required: boolean;
    /** 설명 */
    description?: string;
  }[];
  /** items 배열 내부 파라미터 (ecommerce 이벤트용) */
  itemParameters?: {
    key: string;
    /** GA4 API dimension name (예: itemId, itemName 등) */
    ga4DimensionName?: string;
    /** 설명 */
    description?: string;
  }[];
  /** 태그 이름들 (동일 이벤트가 여러 태그에서 발생 가능) */
  tagNames: string[];
  /** 태그 타입 (gaawe = GA4 표준, cvt_* = 커스텀 템플릿) */
  tagTypes: string[];
}

/**
 * 전체 이벤트 파라미터 설정
 */
export interface EventParameterConfig {
  /** 추출 시간 */
  extractedAt: string;
  /** GTM 소스 파일 */
  sourceFile: string;
  /** 이벤트별 파라미터 정의 */
  events: EventParameterDefinition[];
}

/**
 * GTM JSON에서 이벤트 파라미터를 추출합니다.
 */
/**
 * Items 배열 내부 파라미터와 GA4 API dimension 매핑
 * GTM에서 전송하는 키 → GA4 API에서 조회할 때 사용하는 dimension name
 */
export const ITEM_PARAMETER_GA4_MAPPING: Record<string, { ga4DimensionName: string; description: string }> = {
  // GA4 표준 상품 파라미터
  'item_id': { ga4DimensionName: 'itemId', description: '상품 코드' },
  'item_name': { ga4DimensionName: 'itemName', description: '상품명' },
  'item_brand': { ga4DimensionName: 'itemBrand', description: '브랜드명' },
  'item_category': { ga4DimensionName: 'itemCategory', description: '카테고리 1' },
  'item_category2': { ga4DimensionName: 'itemCategory2', description: '카테고리 2' },
  'item_category3': { ga4DimensionName: 'itemCategory3', description: '카테고리 3' },
  'item_category4': { ga4DimensionName: 'itemCategory4', description: '카테고리 4' },
  'item_category5': { ga4DimensionName: 'itemCategory5', description: '카테고리 5' },
  'item_variant': { ga4DimensionName: 'itemVariant', description: '상품 옵션 (색상/용량)' },
  'item_list_name': { ga4DimensionName: 'itemListName', description: '상품 리스트명' },
  'item_list_id': { ga4DimensionName: 'itemListId', description: '상품 리스트 ID' },
  'index': { ga4DimensionName: 'index', description: '상품 순서' },
  'quantity': { ga4DimensionName: 'quantity', description: '수량' },
  'price': { ga4DimensionName: 'price', description: '판매가' },
  'discount': { ga4DimensionName: 'discount', description: '할인금액' },
  'coupon': { ga4DimensionName: 'coupon', description: '쿠폰/프로모션 코드' },
  'affiliation': { ga4DimensionName: 'affiliation', description: '제휴사' },
  'location_id': { ga4DimensionName: 'locationId', description: '위치 ID' },
  // GA4 표준 프로모션 파라미터
  'promotion_id': { ga4DimensionName: 'itemPromotionId', description: '프로모션 ID' },
  'promotion_name': { ga4DimensionName: 'itemPromotionName', description: '프로모션명' },
  'creative_name': { ga4DimensionName: 'itemPromotionCreativeName', description: '크리에이티브명' },
  'creative_slot': { ga4DimensionName: 'itemPromotionCreativeSlot', description: '크리에이티브 슬롯' },
  // 커스텀 상품 파라미터 (item_scope)
  'apg_brand_code': { ga4DimensionName: 'customItem:apg_brand_code', description: 'APG 브랜드 코드' },
  'internal_brand_code': { ga4DimensionName: 'customItem:internal_brand_code', description: '내부 브랜드 코드' },
  'original_price': { ga4DimensionName: 'customItem:original_price', description: '원가' },
  'item_beauty_acc': { ga4DimensionName: 'customItem:item_beauty_acc', description: '뷰티포인트 적립' },
  'is_giftprd': { ga4DimensionName: 'customItem:is_giftprd', description: '사은품 여부' },
};

/**
 * 이벤트별 items 내부 파라미터 정의 (GTM 변수에서 추출한 정보)
 */
export const EVENT_ITEM_PARAMETERS: Record<string, string[]> = {
  // 상품 이벤트
  'view_item': [
    'item_id', 'item_name', 'item_brand',
    'item_category', 'item_category2', 'item_category3', 'item_category4', 'item_category5',
    'apg_brand_code', 'price', 'discount', 'original_price', 'internal_brand_code'
  ],
  'select_item': [
    'item_id', 'item_name', 'item_brand',
    'item_category', 'item_category2', 'item_category3', 'item_category4', 'item_category5',
    'apg_brand_code', 'index', 'item_list_name', 'price', 'discount', 'original_price', 'internal_brand_code'
  ],
  'view_item_list': [
    'item_id', 'item_name', 'item_brand',
    'item_category', 'item_category2', 'item_category3', 'item_category4', 'item_category5',
    'index', 'item_list_name', 'apg_brand_code', 'price', 'discount', 'original_price', 'internal_brand_code'
  ],
  'add_to_cart': [
    'item_id', 'item_name', 'item_brand',
    'item_category', 'item_category2', 'item_category3', 'item_category4', 'item_category5',
    'item_variant', 'apg_brand_code', 'quantity', 'price', 'discount', 'original_price', 'internal_brand_code'
  ],
  'begin_checkout': [
    'item_id', 'item_name', 'item_brand',
    'item_category', 'item_category2', 'item_category3', 'item_category4', 'item_category5',
    'item_variant', 'apg_brand_code', 'quantity', 'price', 'discount', 'original_price', 'internal_brand_code'
  ],
  'purchase': [
    'item_id', 'item_name', 'item_brand',
    'item_category', 'item_category2', 'item_category3', 'item_category4', 'item_category5',
    'item_variant', 'apg_brand_code', 'coupon', 'quantity', 'price', 'discount', 'original_price',
    'item_beauty_acc', 'is_giftprd', 'internal_brand_code'
  ],
  // 프로모션 이벤트
  'view_promotion': [
    'promotion_id', 'promotion_name', 'creative_slot', 'index'
  ],
  'select_promotion': [
    'promotion_id', 'promotion_name', 'creative_slot', 'index'
  ],
};

export class EventParameterExtractor {
  private gtmData: any;

  constructor(gtmJsonPath: string) {
    const jsonContent = fs.readFileSync(gtmJsonPath, 'utf-8');
    this.gtmData = JSON.parse(jsonContent);
  }

  /**
   * 모든 GA4 이벤트 태그에서 파라미터를 추출합니다.
   */
  extractAllEventParameters(): EventParameterConfig {
    const container = this.gtmData.containerVersion || this.gtmData;
    const tags = container.tag || [];

    const eventMap = new Map<string, EventParameterDefinition>();

    for (const tag of tags) {
      // GA4 이벤트 태그 필터링
      if (!this.isGA4EventTag(tag)) continue;

      const eventName = this.extractEventName(tag);
      if (!eventName) continue;

      const parameters = this.extractParameters(tag);

      // items 내부 파라미터 가져오기
      const itemParameters = this.getItemParameters(eventName);

      // 기존 이벤트에 병합 또는 신규 추가
      const existing = eventMap.get(eventName);
      if (existing) {
        // 태그 정보 추가
        if (!existing.tagNames.includes(tag.name)) {
          existing.tagNames.push(tag.name);
        }
        if (!existing.tagTypes.includes(tag.type)) {
          existing.tagTypes.push(tag.type);
        }
        // 파라미터 병합 (중복 키 제외)
        for (const param of parameters) {
          if (!existing.parameters.find(p => p.key === param.key)) {
            existing.parameters.push(param);
          }
        }
      } else {
        eventMap.set(eventName, {
          eventName,
          parameters,
          itemParameters,
          tagNames: [tag.name],
          tagTypes: [tag.type],
        });
      }
    }

    // 파라미터 키 기준 정렬
    const events = Array.from(eventMap.values())
      .sort((a, b) => a.eventName.localeCompare(b.eventName))
      .map(e => ({
        ...e,
        parameters: e.parameters.sort((a, b) => a.key.localeCompare(b.key)),
      }));

    return {
      extractedAt: new Date().toISOString(),
      sourceFile: this.gtmData.exportTime || 'unknown',
      events,
    };
  }

  /**
   * GA4 이벤트 태그인지 확인
   */
  private isGA4EventTag(tag: any): boolean {
    // gaawe = GA4 Event 표준 태그
    if (tag.type === 'gaawe') return true;
    // cvt_로 시작하는 커스텀 템플릿 (GA4 이벤트용)
    if (tag.type?.startsWith('cvt_')) {
      // eventName 파라미터가 있으면 GA4 이벤트 태그
      const hasEventName = tag.parameter?.some(
        (p: any) => p.key === 'eventName'
      );
      return hasEventName;
    }
    return false;
  }

  /**
   * 태그에서 이벤트 이름 추출
   * 동적 이벤트 이름(변수 참조)인 경우 태그 이름에서 추론
   */
  private extractEventName(tag: any): string | null {
    for (const param of tag.parameter || []) {
      if (param.key === 'eventName') {
        const eventName = param.value;

        // 동적 이벤트 이름 처리 ({{변수}} 형태)
        if (eventName && eventName.startsWith('{{')) {
          // YouTube 비디오 이벤트 처리
          if (eventName.includes('YouTube Status')) {
            // video_start, video_progress, video_complete로 확장
            return 'video_start|video_progress|video_complete';
          }
          // 기타 동적 이벤트는 태그 이름에서 추론 시도
          return this.inferEventNameFromTagName(tag.name);
        }

        return eventName;
      }
    }
    return null;
  }

  /**
   * 태그 이름에서 이벤트 이름 추론
   */
  private inferEventNameFromTagName(tagName: string): string | null {
    if (!tagName) return null;

    // 일반적인 패턴: "GA4 - Basic Event - Event Name" or "GA4 - Ecommerce - Event Name"
    const patterns = [
      /GA4\s*-\s*(?:Basic Event|Ecommerce|ETC)\s*-\s*(.+?)(?:\s*\(for App\))?$/i,
    ];

    for (const pattern of patterns) {
      const match = tagName.match(pattern);
      if (match) {
        // 이벤트 이름을 snake_case로 변환
        return match[1].toLowerCase().replace(/\s+/g, '_');
      }
    }

    return null;
  }

  /**
   * 이벤트별 items 내부 파라미터 가져오기
   */
  private getItemParameters(eventName: string): EventParameterDefinition['itemParameters'] | undefined {
    const itemKeys = EVENT_ITEM_PARAMETERS[eventName];
    if (!itemKeys || itemKeys.length === 0) return undefined;

    return itemKeys.map(key => {
      const mapping = ITEM_PARAMETER_GA4_MAPPING[key];
      return {
        key,
        ga4DimensionName: mapping?.ga4DimensionName,
        description: mapping?.description,
      };
    });
  }

  /**
   * 태그에서 파라미터 목록 추출
   */
  private extractParameters(tag: any): EventParameterDefinition['parameters'] {
    const parameters: EventParameterDefinition['parameters'] = [];

    for (const param of tag.parameter || []) {
      // eventSettingsTable (gaawe 태그)
      if (param.key === 'eventSettingsTable' && param.list) {
        for (const item of param.list) {
          if (item.type === 'MAP' && item.map) {
            const keyParam = item.map.find((m: any) => m.key === 'parameter');
            const valueParam = item.map.find((m: any) => m.key === 'parameterValue');
            if (keyParam?.value) {
              parameters.push({
                key: keyParam.value,
                valueSource: valueParam?.value || '',
                required: true,
              });
            }
          }
        }
      }

      // eventData (커스텀 템플릿 태그)
      if (param.key === 'eventData' && param.list) {
        for (const item of param.list) {
          if (item.type === 'MAP' && item.map) {
            const keyParam = item.map.find((m: any) => m.key === 'eventParam');
            const valueParam = item.map.find((m: any) => m.key === 'eventValue');
            if (keyParam?.value) {
              parameters.push({
                key: keyParam.value,
                valueSource: valueParam?.value || '',
                required: true,
              });
            }
          }
        }
      }

      // userDataTable (사용자 데이터)
      if (param.key === 'userDataTable' && param.list) {
        for (const item of param.list) {
          if (item.type === 'MAP' && item.map) {
            const keyParam = item.map.find((m: any) => m.key === 'parameter');
            const valueParam = item.map.find((m: any) => m.key === 'parameterValue');
            if (keyParam?.value) {
              parameters.push({
                key: `user_data.${keyParam.value}`,
                valueSource: valueParam?.value || '',
                required: false,
              });
            }
          }
        }
      }
    }

    return parameters;
  }

  /**
   * 특정 이벤트의 파라미터 정의 조회
   */
  getEventParameters(eventName: string): EventParameterDefinition | undefined {
    const config = this.extractAllEventParameters();
    return config.events.find(e => e.eventName === eventName);
  }

  /**
   * 결과를 JSON 파일로 저장
   */
  saveToFile(outputPath: string): void {
    const config = this.extractAllEventParameters();
    fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));
    console.log(`✅ Event parameters saved to: ${outputPath}`);
  }

  /**
   * 결과를 Markdown 문서로 저장
   */
  saveToMarkdown(outputPath: string): void {
    const config = this.extractAllEventParameters();
    const lines: string[] = [];

    lines.push('# GTM 이벤트 파라미터 정의');
    lines.push('');
    lines.push(`> 추출일시: ${config.extractedAt}`);
    lines.push(`> GTM 소스: ${config.sourceFile}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    for (const event of config.events) {
      lines.push(`## ${event.eventName}`);
      lines.push('');
      lines.push(`**태그**: ${event.tagNames.join(', ')}`);
      lines.push('');
      lines.push('### Event Parameters');
      lines.push('');
      lines.push('| Parameter Key | Value Source | Required |');
      lines.push('|--------------|--------------|----------|');

      for (const param of event.parameters) {
        const source = param.valueSource.replace(/\|/g, '\\|');
        lines.push(`| ${param.key} | \`${source}\` | ${param.required ? '✅' : '-'} |`);
      }

      // Items 내부 파라미터 출력
      if (event.itemParameters && event.itemParameters.length > 0) {
        lines.push('');
        lines.push('### Items Array Parameters');
        lines.push('');
        lines.push('| GTM Key | GA4 API Dimension | 설명 |');
        lines.push('|---------|-------------------|------|');
        for (const item of event.itemParameters) {
          lines.push(`| ${item.key} | \`${item.ga4DimensionName || '-'}\` | ${item.description || '-'} |`);
        }
      }

      lines.push('');
    }

    fs.writeFileSync(outputPath, lines.join('\n'));
    console.log(`✅ Event parameters markdown saved to: ${outputPath}`);
  }

  /**
   * 콘솔에 요약 출력
   */
  printSummary(): void {
    const config = this.extractAllEventParameters();

    console.log('\n=== GTM 이벤트 파라미터 요약 ===\n');
    console.log(`총 이벤트 수: ${config.events.length}개`);
    console.log('');

    for (const event of config.events) {
      console.log(`📌 ${event.eventName}`);
      console.log(`   태그: ${event.tagNames.join(', ')}`);
      console.log(`   파라미터 (${event.parameters.length}개):`);
      for (const param of event.parameters.slice(0, 5)) {
        console.log(`     - ${param.key}`);
      }
      if (event.parameters.length > 5) {
        console.log(`     ... 외 ${event.parameters.length - 5}개`);
      }
      // Items 파라미터 출력
      if (event.itemParameters && event.itemParameters.length > 0) {
        console.log(`   items 내부 파라미터 (${event.itemParameters.length}개):`);
        for (const item of event.itemParameters.slice(0, 5)) {
          console.log(`     - ${item.key} → ${item.ga4DimensionName || '-'}`);
        }
        if (event.itemParameters.length > 5) {
          console.log(`     ... 외 ${event.itemParameters.length - 5}개`);
        }
      }
      console.log('');
    }
  }
}

/**
 * 기본 경로로 이벤트 파라미터 추출기 생성
 */
export function createDefaultEventParameterExtractor(): EventParameterExtractor {
  const gtmJsonPath = './GTM-5FK5X5C4_workspace112.json';
  return new EventParameterExtractor(gtmJsonPath);
}
