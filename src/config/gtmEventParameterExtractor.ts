/**
 * GTM에서 이벤트별 파라미터를 동적으로 추출하는 Parser
 *
 * GTM JSON 파일을 분석하여:
 * 1. 이벤트별 event-level 파라미터 추출
 * 2. items 배열 내부 파라미터 추출 (JavaScript 변수 분석)
 * 3. GA4 표준 파라미터 vs 커스텀 파라미터 구분
 */

import * as fs from 'fs';

// GA4 표준 item 파라미터 (예약어)
const GA4_STANDARD_ITEM_PARAMS = new Set([
  'item_id', 'item_name', 'item_brand', 'affiliation',
  'item_category', 'item_category2', 'item_category3', 'item_category4', 'item_category5',
  'item_variant', 'item_list_name', 'item_list_id',
  'index', 'quantity', 'price', 'discount', 'coupon',
  'promotion_id', 'promotion_name', 'creative_name', 'creative_slot', 'location_id',
]);

// GA4 표준 event 파라미터 (예약어)
const GA4_STANDARD_EVENT_PARAMS = new Set([
  'currency', 'value', 'transaction_id', 'affiliation', 'coupon', 'shipping', 'tax',
  'items', 'search_term', 'method', 'content_type', 'content_id',
  'screen_name', 'page_location', 'page_referrer', 'page_title',
]);

export interface ExtractedEventParameter {
  key: string;
  valueSource: string;
  isStandard: boolean;
  scope: 'event' | 'item';
}

export interface ExtractedItemParameter {
  key: string;
  isStandard: boolean;
  description?: string;
}

export interface GTMEventDefinition {
  eventName: string;
  tagNames: string[];
  eventParameters: ExtractedEventParameter[];
  itemParameters: ExtractedItemParameter[];
}

export class GTMEventParameterExtractor {
  private gtmData: any;
  private variables: Map<string, any> = new Map();
  private tags: any[] = [];

  constructor(gtmJsonPath: string) {
    const jsonContent = fs.readFileSync(gtmJsonPath, 'utf-8');
    this.gtmData = JSON.parse(jsonContent);
    this.parseGTMData();
  }

  private parseGTMData(): void {
    const container = this.gtmData.containerVersion || this.gtmData;
    this.tags = container.tag || [];

    // 변수들을 Map으로 저장
    const variables = container.variable || [];
    for (const variable of variables) {
      this.variables.set(variable.name, variable);
    }
  }

  /**
   * 모든 GA4 이벤트의 파라미터를 추출
   */
  extractAllEvents(): GTMEventDefinition[] {
    const eventMap = new Map<string, GTMEventDefinition>();

    for (const tag of this.tags) {
      if (!this.isGA4EventTag(tag)) continue;

      const eventName = this.extractEventName(tag);
      if (!eventName || eventName.startsWith('{{')) continue;

      const eventParams = this.extractEventParameters(tag);
      const itemParams = this.extractItemParametersFromTag(tag);

      const existing = eventMap.get(eventName);
      if (existing) {
        if (!existing.tagNames.includes(tag.name)) {
          existing.tagNames.push(tag.name);
        }
        // 파라미터 병합
        for (const param of eventParams) {
          if (!existing.eventParameters.find(p => p.key === param.key)) {
            existing.eventParameters.push(param);
          }
        }
        for (const param of itemParams) {
          if (!existing.itemParameters.find(p => p.key === param.key)) {
            existing.itemParameters.push(param);
          }
        }
      } else {
        eventMap.set(eventName, {
          eventName,
          tagNames: [tag.name],
          eventParameters: eventParams,
          itemParameters: itemParams,
        });
      }
    }

    return Array.from(eventMap.values())
      .sort((a, b) => a.eventName.localeCompare(b.eventName));
  }

  /**
   * 특정 이벤트의 파라미터 정의 조회
   */
  getEventDefinition(eventName: string): GTMEventDefinition | undefined {
    const allEvents = this.extractAllEvents();
    return allEvents.find(e => e.eventName === eventName);
  }

  /**
   * 모든 커스텀 event 파라미터 추출
   */
  getAllCustomEventParameters(): string[] {
    const allEvents = this.extractAllEvents();
    const customParams = new Set<string>();

    for (const event of allEvents) {
      for (const param of event.eventParameters) {
        if (!param.isStandard) {
          customParams.add(param.key);
        }
      }
    }

    return Array.from(customParams).sort();
  }

  /**
   * 모든 커스텀 item 파라미터 추출
   */
  getAllCustomItemParameters(): string[] {
    const allEvents = this.extractAllEvents();
    const customParams = new Set<string>();

    for (const event of allEvents) {
      for (const param of event.itemParameters) {
        if (!param.isStandard) {
          customParams.add(param.key);
        }
      }
    }

    return Array.from(customParams).sort();
  }

  private isGA4EventTag(tag: any): boolean {
    if (tag.type === 'gaawe') return true;
    if (tag.type?.startsWith('cvt_')) {
      return tag.parameter?.some((p: any) => p.key === 'eventName');
    }
    return false;
  }

  private extractEventName(tag: any): string | null {
    for (const param of tag.parameter || []) {
      if (param.key === 'eventName') {
        return param.value;
      }
    }
    return null;
  }

  /**
   * 태그에서 event-level 파라미터 추출
   */
  private extractEventParameters(tag: any): ExtractedEventParameter[] {
    const parameters: ExtractedEventParameter[] = [];

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
                isStandard: GA4_STANDARD_EVENT_PARAMS.has(keyParam.value),
                scope: 'event',
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
                isStandard: GA4_STANDARD_EVENT_PARAMS.has(keyParam.value),
                scope: 'event',
              });
            }
          }
        }
      }
    }

    return parameters;
  }

  /**
   * 태그에서 items 배열 내부 파라미터 추출
   * JavaScript 변수 코드를 분석하여 itemObj.xxx 패턴 찾기
   */
  private extractItemParametersFromTag(tag: any): ExtractedItemParameter[] {
    const parameters: ExtractedItemParameter[] = [];

    // items 파라미터의 valueSource 찾기
    for (const param of tag.parameter || []) {
      if (param.key === 'eventSettingsTable' && param.list) {
        for (const item of param.list) {
          if (item.type === 'MAP' && item.map) {
            const keyParam = item.map.find((m: any) => m.key === 'parameter');
            const valueParam = item.map.find((m: any) => m.key === 'parameterValue');
            if (keyParam?.value === 'items' && valueParam?.value) {
              // {{변수명}} 형태에서 변수명 추출
              const varMatch = valueParam.value.match(/\{\{(.+?)\}\}/);
              if (varMatch) {
                const varName = varMatch[1];
                const itemParams = this.extractItemParamsFromVariable(varName);
                parameters.push(...itemParams);
              }
            }
          }
        }
      }

      if (param.key === 'eventData' && param.list) {
        for (const item of param.list) {
          if (item.type === 'MAP' && item.map) {
            const keyParam = item.map.find((m: any) => m.key === 'eventParam');
            const valueParam = item.map.find((m: any) => m.key === 'eventValue');
            if (keyParam?.value === 'items' && valueParam?.value) {
              const varMatch = valueParam.value.match(/\{\{(.+?)\}\}/);
              if (varMatch) {
                const varName = varMatch[1];
                const itemParams = this.extractItemParamsFromVariable(varName);
                parameters.push(...itemParams);
              }
            }
          }
        }
      }
    }

    return parameters;
  }

  /**
   * JavaScript 변수에서 item 파라미터 추출
   * itemObj.xxx = 또는 item.xxx = 패턴 분석
   */
  private extractItemParamsFromVariable(varName: string): ExtractedItemParameter[] {
    const variable = this.variables.get(varName);
    if (!variable) return [];

    // jsm (Custom JavaScript) 타입만 분석
    if (variable.type !== 'jsm') return [];

    const jsCode = variable.parameter?.find((p: any) => p.key === 'javascript')?.value;
    if (!jsCode) return [];

    const parameters: ExtractedItemParameter[] = [];

    // itemObj.xxx = 또는 item.xxx = 패턴 찾기
    const patterns = [
      /(?:itemObj|item|promoObj|uniqueObj)\.(\w+)\s*=/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(jsCode)) !== null) {
        const paramName = match[1];
        if (!parameters.find(p => p.key === paramName)) {
          parameters.push({
            key: paramName,
            isStandard: GA4_STANDARD_ITEM_PARAMS.has(paramName),
          });
        }
      }
    }

    return parameters;
  }

  /**
   * 결과를 JSON 파일로 저장
   */
  saveToFile(outputPath: string): void {
    const allEvents = this.extractAllEvents();
    const output = {
      extractedAt: new Date().toISOString(),
      totalEvents: allEvents.length,
      customEventParams: this.getAllCustomEventParameters(),
      customItemParams: this.getAllCustomItemParameters(),
      events: allEvents,
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`✅ GTM event parameters saved to: ${outputPath}`);
  }

  /**
   * 요약 출력
   */
  printSummary(): void {
    const allEvents = this.extractAllEvents();
    const customEventParams = this.getAllCustomEventParameters();
    const customItemParams = this.getAllCustomItemParameters();

    console.log('\n=== GTM 이벤트 파라미터 분석 ===\n');
    console.log(`총 이벤트: ${allEvents.length}개`);
    console.log(`커스텀 Event 파라미터: ${customEventParams.length}개`);
    console.log(`커스텀 Item 파라미터: ${customItemParams.length}개`);

    console.log('\n📌 커스텀 Event 파라미터:');
    for (const param of customEventParams) {
      console.log(`   - ${param}`);
    }

    console.log('\n📌 커스텀 Item 파라미터:');
    for (const param of customItemParams) {
      console.log(`   - ${param}`);
    }
  }
}

/**
 * 기본 GTM JSON 경로로 추출기 생성
 */
export function createDefaultGTMEventParameterExtractor(): GTMEventParameterExtractor {
  return new GTMEventParameterExtractor('./GTM-5FK5X5C4_workspace112.json');
}
