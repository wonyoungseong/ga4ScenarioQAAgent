/**
 * GTM JSON에서 사이트 설정을 자동 추출하는 모듈
 *
 * GTM export JSON 파일을 분석하여 gtm-config.json을 생성합니다.
 */

import * as fs from 'fs';
import { TriggerType, EventTriggerInfo } from '../types/siteConfig';

/**
 * GTM JSON 구조 타입
 */
interface GTMContainer {
  containerVersion: {
    container: {
      containerId: string;
      name: string;
    };
    tag: GTMTag[];
    trigger: GTMTrigger[];
    variable: GTMVariable[];
  };
}

interface GTMTag {
  tagId: string;
  name: string;
  type: string;
  parameter?: GTMParameter[];
  firingTriggerId?: string[];
}

interface GTMTrigger {
  triggerId: string;
  name: string;
  type: string;
  filter?: GTMFilter[];
  customEventFilter?: GTMFilter[];
}

interface GTMVariable {
  variableId: string;
  name: string;
  type: string;
  parameter?: GTMParameter[];
}

interface GTMParameter {
  type: string;
  key: string;
  value?: string;
  list?: GTMParameter[];
  map?: GTMParameter[];
}

interface GTMFilter {
  type: string;
  parameter: GTMParameter[];
}

/**
 * 추출된 GTM 설정
 */
export interface ExtractedGTMConfig {
  containerId: string;
  containerName: string;
  eventTriggers: Record<string, EventTriggerInfo>;
  customEventNames: Record<string, string>;
  cssSelectors: Record<string, string>;
  variables: Record<string, { type: string; source?: string }>;
}

/**
 * GTM JSON에서 설정을 추출하는 클래스
 */
export class GTMConfigExtractor {
  private gtmData: GTMContainer;
  private triggerMap: Map<string, GTMTrigger> = new Map();

  constructor(gtmJsonPath: string) {
    const content = fs.readFileSync(gtmJsonPath, 'utf-8');
    this.gtmData = JSON.parse(content);
    this.buildTriggerMap();
  }

  private buildTriggerMap(): void {
    const triggers = this.gtmData.containerVersion.trigger || [];
    for (const trigger of triggers) {
      this.triggerMap.set(trigger.triggerId, trigger);
    }
  }

  /**
   * GTM 설정을 추출합니다.
   */
  extract(): ExtractedGTMConfig {
    const container = this.gtmData.containerVersion.container;
    const tags = this.gtmData.containerVersion.tag || [];

    const eventTriggers: Record<string, EventTriggerInfo> = {};
    const customEventNames: Record<string, string> = {};
    const cssSelectors: Record<string, string> = {};

    // GA4 이벤트 태그 분석
    for (const tag of tags) {
      if (tag.type !== 'gaawe') continue;

      const eventName = this.extractEventName(tag);
      if (!eventName) continue;

      const triggerIds = tag.firingTriggerId || [];
      for (const triggerId of triggerIds) {
        const trigger = this.triggerMap.get(triggerId);
        if (!trigger) continue;

        const triggerInfo = this.parseTriggerInfo(trigger, eventName);
        if (triggerInfo) {
          eventTriggers[eventName] = triggerInfo;

          // CSS Selector 수집
          if (triggerInfo.cssSelector) {
            cssSelectors[eventName] = triggerInfo.cssSelector;
          }

          // Custom Event 이름 수집
          if (triggerInfo.customEventName) {
            customEventNames[eventName] = triggerInfo.customEventName;
          }
        }
      }
    }

    // 변수 정보 추출
    const variables = this.extractVariables();

    return {
      containerId: container.containerId,
      containerName: container.name,
      eventTriggers,
      customEventNames,
      cssSelectors,
      variables
    };
  }

  /**
   * 태그에서 GA4 이벤트명을 추출합니다.
   */
  private extractEventName(tag: GTMTag): string | null {
    if (!tag.parameter) return null;

    for (const param of tag.parameter) {
      if (param.key === 'eventName' && param.value) {
        return param.value;
      }
    }
    return null;
  }

  /**
   * 트리거 정보를 파싱합니다.
   */
  private parseTriggerInfo(trigger: GTMTrigger, ga4EventName: string): EventTriggerInfo | null {
    const triggerType = this.mapTriggerType(trigger.type);

    const info: EventTriggerInfo = {
      ga4EventName,
      triggerType,
      description: `트리거: ${trigger.name}`
    };

    // CSS Selector 추출 (LINK_CLICK, CLICK)
    if (trigger.filter) {
      for (const filter of trigger.filter) {
        if (filter.type === 'CSS_SELECTOR') {
          info.cssSelector = this.extractFilterValue(filter);
        }
      }
    }

    // Custom Event 이름 추출
    if (trigger.customEventFilter) {
      for (const filter of trigger.customEventFilter) {
        const value = this.extractFilterValue(filter);
        if (value) {
          info.customEventName = value;
        }
      }
    }

    return info;
  }

  /**
   * 필터에서 값을 추출합니다.
   */
  private extractFilterValue(filter: GTMFilter): string | undefined {
    if (!filter.parameter) return undefined;

    for (const param of filter.parameter) {
      if (param.key === 'arg1' && param.value) {
        return param.value;
      }
    }
    return undefined;
  }

  /**
   * GTM 트리거 타입을 매핑합니다.
   */
  private mapTriggerType(gtmType: string): TriggerType {
    const typeMap: Record<string, TriggerType> = {
      'LINK_CLICK': 'LINK_CLICK',
      'CLICK': 'CLICK',
      'CUSTOM_EVENT': 'CUSTOM_EVENT',
      'PAGEVIEW': 'PAGEVIEW',
      'DOM_READY': 'DOM_READY',
      'HISTORY_CHANGE': 'HISTORY_CHANGE',
      'SCROLL_DEPTH': 'SCROLL_DEPTH',
      'VISIBILITY': 'VISIBILITY',
      'TIMER': 'TIMER'
    };

    return typeMap[gtmType] || 'CUSTOM_EVENT';
  }

  /**
   * 변수 정보를 추출합니다.
   */
  private extractVariables(): Record<string, { type: string; source?: string }> {
    const variables = this.gtmData.containerVersion.variable || [];
    const result: Record<string, { type: string; source?: string }> = {};

    for (const variable of variables) {
      result[variable.name] = {
        type: variable.type
      };
    }

    return result;
  }

  /**
   * 추출된 설정을 JSON 파일로 저장합니다.
   */
  saveConfig(outputPath: string): void {
    const config = this.extract();
    fs.writeFileSync(outputPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * 이벤트별 트리거 요약을 출력합니다.
   */
  printSummary(): void {
    const config = this.extract();

    console.log('='.repeat(60));
    console.log(`GTM Container: ${config.containerName} (${config.containerId})`);
    console.log('='.repeat(60));
    console.log('\n## 이벤트별 트리거 정보\n');

    for (const [eventName, info] of Object.entries(config.eventTriggers)) {
      console.log(`### ${eventName}`);
      console.log(`  트리거 타입: ${info.triggerType}`);
      if (info.cssSelector) {
        console.log(`  CSS Selector: ${info.cssSelector}`);
      }
      if (info.customEventName) {
        console.log(`  dataLayer Event: ${info.customEventName}`);
      }
      console.log('');
    }

    console.log('\n## Custom Event 매핑\n');
    for (const [ga4Event, dlEvent] of Object.entries(config.customEventNames)) {
      console.log(`  ${ga4Event} <- dataLayer.push({ event: "${dlEvent}" })`);
    }

    console.log('\n## CSS Selector 매핑\n');
    for (const [ga4Event, selector] of Object.entries(config.cssSelectors)) {
      console.log(`  ${ga4Event} <- ${selector}`);
    }
  }
}

/**
 * CLI에서 직접 실행 시
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log('Usage: ts-node gtmConfigExtractor.ts <gtm-json-path> [output-path]');
    process.exit(1);
  }

  const gtmPath = args[0];
  const outputPath = args[1];

  const extractor = new GTMConfigExtractor(gtmPath);
  extractor.printSummary();

  if (outputPath) {
    extractor.saveConfig(outputPath);
    console.log(`\nConfig saved to: ${outputPath}`);
  }
}
