import * as fs from 'fs';
import {
  EventCategory,
  TriggerType,
  EVENT_CATEGORY_MAP,
  ANALYSIS_STRATEGIES
} from '../types/scenarioTypes';

/**
 * GTM 이벤트 문서 - Vision AI가 읽고 이해할 수 있는 형태
 */
export interface GTMEventDocument {
  eventName: string;
  eventDescription: string;
  eventCategory: EventCategory;

  trigger: {
    type: TriggerType;
    typeDescription: string;
    conditions: {
      type: string;
      target?: string;       // 비교 대상 ({{Click Element}} 등)
      selector?: string;
      customEvent?: string;
      regex?: string;
      contains?: string;
      explanation: string;
    }[];
    /**
     * 트리거 타입별 파라미터 (GTM trigger.parameter에서 추출)
     * 예: SCROLL_DEPTH의 verticalThresholdsPercent, ELEMENT_VISIBILITY의 elementSelector 등
     */
    triggerParams?: Record<string, string>;
  };

  parameters: {
    name: string;
    source: string;
    extractionLogic?: string;
    example?: string;
    required?: boolean;
  }[];

  domElements: {
    selector: string;
    attributes: string[];
    explanation: string;
    parentContext?: string;
  };

  relatedEvents: {
    eventName: string;
    difference: string;
  }[];

  // Vision AI 분석 전략
  analysisStrategy: {
    primaryFocus: string;
    domRequirements: string[];
    visualCues: string[];
    parameterSources: string[];
  };

  // 원본 JavaScript 코드 (AI가 직접 분석 가능)
  rawVariableCode?: {
    name: string;
    code: string;
    purpose?: string;
  }[];
}

/**
 * GTM JSON을 Vision AI가 읽을 수 있는 문서로 변환
 */
export class GTMDocumentGenerator {
  private gtmData: any;
  private tags: any[];
  private triggers: any[];
  private variables: any[];

  constructor(gtmJsonPath: string) {
    const content = fs.readFileSync(gtmJsonPath, 'utf-8');
    this.gtmData = JSON.parse(content);

    const cv = this.gtmData.containerVersion;
    this.tags = cv.tag || [];
    this.triggers = cv.trigger || [];
    this.variables = cv.variable || [];
  }

  /**
   * 특정 이벤트에 대한 문서 생성
   */
  generateEventDocument(eventName: string): GTMEventDocument | null {
    // 1. 해당 이벤트의 태그 찾기
    const tag = this.findTagByEventName(eventName);
    if (!tag) return null;

    // 2. 트리거 정보 추출
    const triggerIds = tag.firingTriggerId || [];
    const triggerInfos = triggerIds.map((id: string) => this.getTriggerInfo(id)).filter(Boolean);

    // 3. 사용된 변수 추출
    const usedVariables = this.extractUsedVariables(tag);
    const variableInfos = usedVariables.map(name => this.getVariableInfo(name)).filter(Boolean);

    // 4. 파라미터 정보 추출
    const parameters = this.extractParameters(tag, variableInfos);

    // 5. DOM 요소 정보 추출
    const domElements = this.extractDomElements(triggerInfos, variableInfos);

    // 6. 관련 이벤트 찾기
    const relatedEvents = this.findRelatedEvents(eventName, domElements.selector);

    // 7. 이벤트 카테고리 결정
    const eventCategory = this.determineEventCategory(eventName, triggerInfos);

    // 8. 분석 전략 가져오기
    const analysisStrategy = ANALYSIS_STRATEGIES[eventCategory];

    // 9. 트리거 조건 상세 추출
    const triggerConditions = this.extractDetailedTriggerConditions(triggerInfos);

    // 트리거 파라미터 병합 (모든 트리거의 파라미터를 수집)
    const mergedTriggerParams: Record<string, string> = {};
    for (const triggerInfo of triggerInfos) {
      if (triggerInfo.triggerParams) {
        for (const [key, value] of Object.entries(triggerInfo.triggerParams)) {
          if (!mergedTriggerParams[key]) {
            mergedTriggerParams[key] = value as string;
          }
        }
      }
    }

    return {
      eventName,
      eventDescription: this.getEventDescription(eventName, tag),
      eventCategory,
      trigger: {
        type: (triggerInfos[0]?.type as TriggerType) || 'CUSTOM_EVENT',
        typeDescription: this.getTriggerTypeDescription(triggerInfos[0]?.type),
        conditions: triggerConditions,
        triggerParams: Object.keys(mergedTriggerParams).length > 0 ? mergedTriggerParams : undefined
      },
      parameters,
      domElements,
      relatedEvents,
      analysisStrategy: {
        primaryFocus: analysisStrategy.primaryFocus,
        domRequirements: analysisStrategy.domRequirements,
        visualCues: analysisStrategy.visualCues,
        parameterSources: analysisStrategy.parameterSources
      },
      rawVariableCode: variableInfos.map((v: any) => ({
        name: v.name,
        code: v.code,
        purpose: this.summarizeJsCode(v.code)
      })).filter((v: any) => v.code)
    };
  }

  /**
   * 이벤트 카테고리 결정
   */
  private determineEventCategory(eventName: string, triggerInfos: any[]): EventCategory {
    // 먼저 미리 정의된 매핑 확인
    if (EVENT_CATEGORY_MAP[eventName]) {
      return EVENT_CATEGORY_MAP[eventName];
    }

    // 트리거 타입 기반으로 추론
    const triggerType = triggerInfos[0]?.type;

    switch (triggerType) {
      case 'LINK_CLICK':
      case 'CLICK':
        return 'CLICK_BASED';
      case 'VISIBILITY':
        return 'VIEW_BASED';
      case 'PAGEVIEW':
      case 'DOM_READY':
      case 'WINDOW_LOADED':
        return 'PAGE_BASED';
      case 'SCROLL':
        return 'SCROLL_BASED';
      case 'YOUTUBE_VIDEO':
        return 'VIDEO_BASED';
      case 'CUSTOM_EVENT':
      default:
        // custom_event는 이벤트명으로 추가 판단
        if (eventName.includes('view') || eventName.includes('impression')) {
          return 'VIEW_BASED';
        }
        if (eventName.includes('click') || eventName.includes('select')) {
          return 'CLICK_BASED';
        }
        return 'ACTION_BASED';
    }
  }

  /**
   * 상세 트리거 조건 추출
   */
  private extractDetailedTriggerConditions(triggerInfos: any[]): GTMEventDocument['trigger']['conditions'] {
    const conditions: GTMEventDocument['trigger']['conditions'] = [];

    for (const trigger of triggerInfos) {
      // CSS Selector 조건
      if (trigger.cssSelector) {
        conditions.push({
          type: 'CSS_SELECTOR',
          target: '{{Click Element}}',
          selector: trigger.cssSelector,
          explanation: `클릭한 요소가 "${trigger.cssSelector}" 선택자와 일치할 때`
        });
      }

      // Custom Event 조건
      if (trigger.customEvent) {
        conditions.push({
          type: 'CUSTOM_EVENT',
          customEvent: trigger.customEvent,
          explanation: `dataLayer에 "${trigger.customEvent}" 이벤트가 push될 때`
        });
      }

      // 추가 필터 조건들
      if (trigger.filters) {
        for (const filter of trigger.filters) {
          if (filter.type === 'CONTAINS') {
            conditions.push({
              type: 'CONTAINS',
              target: filter.variable,
              contains: filter.value,
              explanation: `${filter.variable}에 "${filter.value}"가 포함될 때`
            });
          } else if (filter.type === 'REGEX') {
            conditions.push({
              type: 'REGEX',
              target: filter.variable,
              regex: filter.value,
              explanation: `${filter.variable}가 정규식 "${filter.value}"와 일치할 때`
            });
          }
        }
      }

      // 트리거 파라미터 기반 조건 추가
      if (trigger.triggerParams) {
        // SCROLL_DEPTH: verticalThresholdsPercent
        if (trigger.type === 'SCROLL_DEPTH' && trigger.triggerParams.verticalThresholdsPercent) {
          conditions.push({
            type: 'SCROLL_DEPTH',
            explanation: `스크롤 깊이가 ${trigger.triggerParams.verticalThresholdsPercent}% 에 도달할 때 각각 발생`,
          });
        }

        // ELEMENT_VISIBILITY: elementSelector
        if (trigger.type === 'ELEMENT_VISIBILITY' && trigger.triggerParams.elementSelector) {
          conditions.push({
            type: 'ELEMENT_VISIBILITY',
            selector: trigger.triggerParams.elementSelector,
            explanation: `요소 "${trigger.triggerParams.elementSelector}"가 화면에 노출될 때 발생`,
          });
        }

        // YOUTUBE_VIDEO: 비디오 이벤트
        if (trigger.type === 'YOUTUBE_VIDEO') {
          const videoEvents = [];
          if (trigger.triggerParams.captureStart === 'true') videoEvents.push('시작');
          if (trigger.triggerParams.captureComplete === 'true') videoEvents.push('완료');
          if (trigger.triggerParams.capturePause === 'true') videoEvents.push('일시정지');
          if (trigger.triggerParams.captureProgress === 'true') videoEvents.push('진행');
          if (videoEvents.length > 0) {
            conditions.push({
              type: 'YOUTUBE_VIDEO',
              explanation: `YouTube 비디오 ${videoEvents.join(', ')} 시 발생`,
            });
          }
        }
      }

      // 조건이 없는 경우
      if (conditions.length === 0 && trigger.name) {
        conditions.push({
          type: trigger.type || 'UNKNOWN',
          explanation: trigger.name
        });
      }
    }

    return conditions;
  }

  /**
   * 이벤트 문서를 사람/AI가 읽을 수 있는 텍스트로 변환
   */
  formatAsReadableDocument(doc: GTMEventDocument): string {
    const lines: string[] = [];

    lines.push('═'.repeat(70));
    lines.push(`📊 ${doc.eventName.toUpperCase()} 이벤트 분석 문서`);
    lines.push('═'.repeat(70));
    lines.push('');

    // 이벤트 설명
    lines.push('## 1. 이벤트 개요');
    lines.push(doc.eventDescription);
    lines.push(`- 카테고리: ${this.getCategoryDescription(doc.eventCategory)}`);
    lines.push('');

    // 트리거 조건
    lines.push('## 2. 트리거 조건 (언제 이벤트가 발생하는가?)');
    lines.push(`- 트리거 타입: ${doc.trigger.typeDescription}`);

    // 트리거 파라미터가 있는 경우 표시
    if (doc.trigger.triggerParams && Object.keys(doc.trigger.triggerParams).length > 0) {
      lines.push('');
      lines.push('### ⚠️ 중요: GTM 트리거 파라미터 설정');

      // SCROLL_DEPTH 특수 처리
      if (doc.trigger.type === 'SCROLL_DEPTH' && doc.trigger.triggerParams.verticalThresholdsPercent) {
        const thresholds = doc.trigger.triggerParams.verticalThresholdsPercent.split(',').map(v => v.trim());
        lines.push(`**GTM에서 설정된 스크롤 depth 임계값: ${thresholds.join(', ')}%**`);
        lines.push(`총 ${thresholds.length}개의 스크롤 이벤트가 각 임계값에서 발생합니다.`);
        lines.push('');
        lines.push('시나리오 생성 시 반드시 위 임계값을 사용하세요. 일반적인 25%, 50%, 75%, 100%가 아닙니다!');
      } else {
        // 기타 트리거 파라미터 표시
        lines.push('**GTM에서 설정된 트리거 파라미터:**');
        for (const [key, value] of Object.entries(doc.trigger.triggerParams)) {
          lines.push(`  - ${key}: ${value}`);
        }
      }
    }

    lines.push('');
    lines.push('### 조건 상세:');
    doc.trigger.conditions.forEach((c, i) => {
      lines.push(`[조건 ${i + 1}] ${c.explanation}`);
      if (c.target) {
        lines.push(`  - 비교 대상: ${c.target}`);
      }
      if (c.selector) {
        lines.push(`  - CSS Selector: \`${c.selector}\``);
      }
      if (c.customEvent) {
        lines.push(`  - Custom Event: \`${c.customEvent}\``);
      }
      if (c.regex) {
        lines.push(`  - Regex: \`${c.regex}\``);
      }
      if (c.contains) {
        lines.push(`  - Contains: "${c.contains}"`);
      }
    });
    lines.push('');

    // Vision AI 분석 전략
    lines.push('## 3. Vision AI 분석 가이드');
    lines.push(`**핵심 분석 포인트:** ${doc.analysisStrategy.primaryFocus}`);
    lines.push('');
    lines.push('### DOM에서 확인할 것:');
    doc.analysisStrategy.domRequirements.forEach(req => {
      lines.push(`  - ${req}`);
    });
    lines.push('');
    lines.push('### 시각적으로 찾을 것:');
    doc.analysisStrategy.visualCues.forEach(cue => {
      lines.push(`  - ${cue}`);
    });
    lines.push('');
    lines.push('### 파라미터 추출 위치:');
    doc.analysisStrategy.parameterSources.forEach(src => {
      lines.push(`  - ${src}`);
    });
    lines.push('');

    // 수집 파라미터
    lines.push('## 4. 수집되는 파라미터');
    if (doc.parameters.length === 0) {
      lines.push('(파라미터 없음)');
    } else {
      doc.parameters.forEach(p => {
        const required = p.required ? ' [필수]' : '';
        lines.push(`- **${p.name}**${required}`);
        lines.push(`  출처: ${p.source}`);
        if (p.extractionLogic) {
          lines.push(`  추출 방식: ${p.extractionLogic}`);
        }
        if (p.example) {
          lines.push(`  예시: "${p.example}"`);
        }
      });
    }
    lines.push('');

    // DOM 요소
    lines.push('## 5. 대상 DOM 요소');
    if (doc.domElements.selector) {
      lines.push(`- 선택자: \`${doc.domElements.selector}\``);
      lines.push(`- 필요 속성: ${doc.domElements.attributes.length > 0 ? doc.domElements.attributes.join(', ') : '(없음)'}`);
      lines.push(`- 설명: ${doc.domElements.explanation}`);
      if (doc.domElements.parentContext) {
        lines.push(`- 상위 컨텍스트: ${doc.domElements.parentContext}`);
      }
    } else {
      lines.push('(DOM 선택자 없음 - dataLayer 기반 이벤트)');
    }
    lines.push('');

    // 관련 이벤트
    if (doc.relatedEvents.length > 0) {
      lines.push('## 6. 혼동하기 쉬운 이벤트');
      doc.relatedEvents.forEach(r => {
        lines.push(`- **${r.eventName}**: ${r.difference}`);
      });
      lines.push('');
    }

    // 원본 코드
    if (doc.rawVariableCode && doc.rawVariableCode.length > 0) {
      lines.push('## 7. 데이터 추출 로직 (JavaScript)');
      doc.rawVariableCode.forEach(v => {
        lines.push(`### ${v.name}`);
        if (v.purpose) {
          lines.push(`목적: ${v.purpose}`);
        }
        lines.push('```javascript');
        lines.push(v.code);
        lines.push('```');
        lines.push('');
      });
    }

    lines.push('═'.repeat(70));

    return lines.join('\n');
  }

  /**
   * 이벤트 카테고리 설명
   */
  private getCategoryDescription(category: EventCategory): string {
    const descriptions: Record<EventCategory, string> = {
      'CLICK_BASED': '클릭 기반 - 사용자가 특정 요소를 클릭할 때 발생',
      'VIEW_BASED': '노출 기반 - 특정 요소가 화면에 보일 때 발생',
      'PAGE_BASED': '페이지 기반 - 페이지 로드/이동 시 발생',
      'ACTION_BASED': '액션 기반 - 사용자 행동(장바구니 담기 등) 시 발생',
      'SCROLL_BASED': '스크롤 기반 - 스크롤 동작 시 발생',
      'VIDEO_BASED': '비디오 기반 - 비디오 재생 관련 이벤트'
    };
    return descriptions[category] || category;
  }

  /**
   * 사용 가능한 모든 이벤트 목록 반환
   */
  getAvailableEvents(): string[] {
    const events = new Set<string>();

    this.tags.forEach(tag => {
      const eventName = this.extractEventName(tag);
      if (eventName && !eventName.startsWith('{{')) {
        events.add(eventName);
      }
    });

    return Array.from(events).sort();
  }

  /**
   * 모든 이벤트에 대한 문서 생성
   */
  generateAllEventDocuments(): Map<string, GTMEventDocument> {
    const documents = new Map<string, GTMEventDocument>();
    const events = this.getAvailableEvents();

    for (const eventName of events) {
      const doc = this.generateEventDocument(eventName);
      if (doc) {
        documents.set(eventName, doc);
      }
    }

    return documents;
  }

  /**
   * 이벤트 요약 보고서 생성
   */
  generateEventSummary(): string {
    const events = this.getAvailableEvents();
    const lines: string[] = [];

    lines.push('═'.repeat(70));
    lines.push('📋 GTM 이벤트 요약 보고서');
    lines.push('═'.repeat(70));
    lines.push('');
    lines.push(`총 ${events.length}개의 이벤트가 발견되었습니다.`);
    lines.push('');

    // 카테고리별 그룹화
    const categorized: Record<EventCategory, string[]> = {
      'CLICK_BASED': [],
      'VIEW_BASED': [],
      'PAGE_BASED': [],
      'ACTION_BASED': [],
      'SCROLL_BASED': [],
      'VIDEO_BASED': []
    };

    for (const eventName of events) {
      const doc = this.generateEventDocument(eventName);
      if (doc) {
        categorized[doc.eventCategory].push(eventName);
      }
    }

    // 카테고리별 출력
    const categoryOrder: EventCategory[] = [
      'CLICK_BASED', 'VIEW_BASED', 'PAGE_BASED',
      'ACTION_BASED', 'SCROLL_BASED', 'VIDEO_BASED'
    ];

    for (const category of categoryOrder) {
      const eventList = categorized[category];
      if (eventList.length > 0) {
        lines.push(`### ${this.getCategoryDescription(category)}`);
        eventList.forEach(e => {
          const doc = this.generateEventDocument(e);
          const triggerType = doc?.trigger.typeDescription || '';
          const selector = doc?.domElements.selector || '(없음)';
          lines.push(`  - ${e}`);
          lines.push(`    트리거: ${triggerType}`);
          if (selector !== '(없음)') {
            lines.push(`    선택자: ${selector}`);
          }
        });
        lines.push('');
      }
    }

    lines.push('═'.repeat(70));

    return lines.join('\n');
  }

  /**
   * 특정 이벤트의 Vision AI 분석용 프롬프트 생성
   */
  generateVisionPrompt(eventName: string, pageUrl: string): string | null {
    const doc = this.generateEventDocument(eventName);
    if (!doc) return null;

    const lines: string[] = [];

    lines.push(`당신은 QA 자동화를 위한 ${eventName} 이벤트 시나리오 분석 전문가입니다.`);
    lines.push('');
    lines.push('## 분석 대상 이벤트');
    lines.push(this.formatAsReadableDocument(doc));
    lines.push('');
    lines.push('## 분석 방법');
    lines.push(`이 이벤트는 "${doc.eventCategory}" 카테고리입니다.`);
    lines.push(`핵심 분석 포인트: ${doc.analysisStrategy.primaryFocus}`);
    lines.push('');

    if (doc.trigger.conditions.length > 0) {
      lines.push('## 이벤트 발생 조건');
      doc.trigger.conditions.forEach((c, i) => {
        lines.push(`${i + 1}. ${c.explanation}`);
        if (c.selector) {
          lines.push(`   CSS Selector: \`${c.selector}\``);
        }
      });
      lines.push('');
    }

    lines.push('## 분석할 페이지');
    lines.push(`URL: ${pageUrl}`);
    lines.push('');

    lines.push('## 요청');
    lines.push('위의 GTM 트리거 조건을 바탕으로, 스크린샷을 분석하세요.');
    lines.push('');

    // 카테고리별 분석 지침
    switch (doc.eventCategory) {
      case 'CLICK_BASED':
        lines.push('### 분석 지침 (클릭 기반 이벤트)');
        lines.push('1. CSS Selector 조건에 해당하는 요소를 DOM에서 찾으세요');
        lines.push('2. 해당 요소가 스크린샷에서 어디에 위치하는지 식별하세요');
        lines.push('3. 클릭 시 이벤트가 발생해야 하는 요소와 아닌 요소를 구분하세요');
        break;
      case 'VIEW_BASED':
        lines.push('### 분석 지침 (노출 기반 이벤트)');
        lines.push('1. 화면에 노출된 요소 중 이벤트 조건에 맞는 것을 찾으세요');
        lines.push('2. viewport 내에 보이는 요소만 이벤트가 발생합니다');
        lines.push('3. 스크롤해야 보이는 요소는 현재 발생하지 않습니다');
        break;
      case 'ACTION_BASED':
        lines.push('### 분석 지침 (액션 기반 이벤트)');
        lines.push('1. 사용자 액션을 트리거하는 버튼/요소를 찾으세요');
        lines.push('2. dataLayer.push를 호출하는 요소를 식별하세요');
        lines.push('3. CTA 버튼, 폼 제출 버튼 등을 주의 깊게 분석하세요');
        break;
      default:
        lines.push('### 분석 지침');
        lines.push('1. 이벤트 트리거 조건을 주의 깊게 분석하세요');
        lines.push('2. 화면에서 해당 조건에 맞는 요소를 찾으세요');
    }

    return lines.join('\n');
  }

  // ─────────────────────────────────────────────────────────────
  // Private Helper Methods
  // ─────────────────────────────────────────────────────────────

  private findTagByEventName(eventName: string): any {
    return this.tags.find(tag => {
      const name = this.extractEventName(tag);
      return name === eventName;
    });
  }

  private extractEventName(tag: any): string | null {
    if (!tag.parameter) return null;

    const eventParam = tag.parameter.find((p: any) => p.key === 'eventName');
    return eventParam?.value || null;
  }

  private getTriggerInfo(triggerId: string): any {
    const trigger = this.triggers.find(t => t.triggerId === triggerId);
    if (!trigger) return null;

    let cssSelector: string | undefined;
    let filterType: string | undefined;
    let customEvent: string | undefined;
    const filters: { type: string; variable: string; value: string; }[] = [];

    // Filter에서 조건 추출
    if (trigger.filter) {
      trigger.filter.forEach((f: any) => {
        filterType = f.type;

        // 파라미터 추출
        let variable = '';
        let value = '';

        if (f.parameter) {
          const arg0 = f.parameter.find((p: any) => p.key === 'arg0');
          const arg1 = f.parameter.find((p: any) => p.key === 'arg1');
          if (arg0) variable = arg0.value;
          if (arg1) value = arg1.value;
        }

        // CSS Selector 조건
        if (f.type === 'CSS_SELECTOR') {
          cssSelector = value;
        }

        // 다른 필터 조건들 저장
        if (variable && value) {
          filters.push({
            type: f.type,
            variable,
            value
          });
        }
      });
    }

    // Custom Event 추출
    if (trigger.customEventFilter) {
      trigger.customEventFilter.forEach((f: any) => {
        if (f.parameter) {
          const arg1 = f.parameter.find((p: any) => p.key === 'arg1');
          if (arg1) customEvent = arg1.value;
        }
      });
    }

    // Auto-Event Variables 조건 추출 (Visibility 등)
    if (trigger.autoEventFilter) {
      trigger.autoEventFilter.forEach((f: any) => {
        if (f.parameter) {
          const arg0 = f.parameter.find((p: any) => p.key === 'arg0');
          const arg1 = f.parameter.find((p: any) => p.key === 'arg1');
          if (arg0 && arg1) {
            filters.push({
              type: f.type,
              variable: arg0.value,
              value: arg1.value
            });
          }
        }
      });
    }

    // 트리거 타입별 파라미터 추출 (SCROLL_DEPTH 등)
    let triggerParams: Record<string, string> = {};
    if (trigger.parameter) {
      trigger.parameter.forEach((p: any) => {
        if (p.key && p.value !== undefined) {
          triggerParams[p.key] = p.value;
        }
      });
    }

    // SCROLL_DEPTH 특수 처리
    let scrollThresholds: number[] | undefined;
    if (trigger.type === 'SCROLL_DEPTH' && triggerParams.verticalThresholdsPercent) {
      scrollThresholds = triggerParams.verticalThresholdsPercent
        .split(',')
        .map((v: string) => parseInt(v.trim(), 10))
        .filter((v: number) => !isNaN(v));
    }

    return {
      id: triggerId,
      name: trigger.name,
      type: trigger.type,
      filterType,
      cssSelector,
      customEvent,
      filters,
      triggerParams,
      scrollThresholds
    };
  }

  private getVariableInfo(variableName: string): any {
    // {{Variable Name}} 형식에서 이름 추출
    const name = variableName.replace(/^\{\{|\}\}$/g, '');

    const variable = this.variables.find(v => v.name === name);
    if (!variable) return null;

    let code: string | undefined;
    if (variable.type === 'jsm' && variable.parameter) {
      const jsParam = variable.parameter.find((p: any) => p.key === 'javascript');
      if (jsParam) code = jsParam.value;
    }

    return {
      id: variable.variableId,
      name: variable.name,
      type: variable.type,
      code
    };
  }

  private extractUsedVariables(tag: any): string[] {
    const variables: string[] = [];
    const regex = /\{\{([^}]+)\}\}/g;

    const searchInObject = (obj: any) => {
      if (typeof obj === 'string') {
        let match;
        while ((match = regex.exec(obj)) !== null) {
          variables.push(`{{${match[1]}}}`);
        }
      } else if (Array.isArray(obj)) {
        obj.forEach(searchInObject);
      } else if (obj && typeof obj === 'object') {
        Object.values(obj).forEach(searchInObject);
      }
    };

    searchInObject(tag);
    return [...new Set(variables)];
  }

  private extractParameters(tag: any, variableInfos: any[]): GTMEventDocument['parameters'] {
    const params: GTMEventDocument['parameters'] = [];

    // eventSettingsTable 또는 eventData에서 파라미터 추출
    if (tag.parameter) {
      const settingsTable = tag.parameter.find((p: any) =>
        p.key === 'eventSettingsTable' || p.key === 'eventData'
      );

      if (settingsTable?.list) {
        settingsTable.list.forEach((item: any) => {
          const map = item.map || [];
          const nameParam = map.find((m: any) =>
            m.key === 'parameter' || m.key === 'eventParam'
          );
          const valueParam = map.find((m: any) =>
            m.key === 'parameterValue' || m.key === 'eventValue'
          );

          if (nameParam && valueParam) {
            const paramName = nameParam.value;
            const paramValue = valueParam.value;

            // 변수인 경우 코드에서 추출 로직 파악
            let source = paramValue;
            let extractionLogic: string | undefined;

            if (paramValue.match(/^\{\{.*\}\}$/)) {
              const varName = paramValue.replace(/^\{\{|\}\}$/g, '');
              const varInfo = variableInfos.find(v => v.name === varName);

              if (varInfo?.code) {
                source = `${varName} 변수`;
                extractionLogic = this.summarizeJsCode(varInfo.code);
              }
            }

            params.push({
              name: paramName,
              source,
              extractionLogic
            });
          }
        });
      }
    }

    return params;
  }

  private extractDomElements(triggerInfos: any[], variableInfos: any[]): GTMEventDocument['domElements'] {
    // 트리거의 CSS Selector 사용
    const selector = triggerInfos
      .map(t => t.cssSelector)
      .filter(Boolean)[0] || '';

    // 변수 코드에서 사용된 속성 추출
    const attributes: string[] = [];
    const parentContexts: string[] = [];

    variableInfos.forEach(v => {
      if (v.code) {
        // getAttribute 호출 찾기
        const attrMatch = v.code.match(/getAttribute\(['"]([^'"]+)['"]\)/g);
        if (attrMatch) {
          attrMatch.forEach((m: string) => {
            const attr = m.match(/getAttribute\(['"]([^'"]+)['"]\)/)?.[1];
            if (attr) attributes.push(attr);
          });
        }

        // closest 호출 찾기
        const closestMatch = v.code.match(/closest\(['"]([^'"]+)['"]\)/);
        if (closestMatch) {
          parentContexts.push(closestMatch[1]);
        }
      }
    });

    return {
      selector,
      attributes: [...new Set(attributes)],
      explanation: this.explainSelector(selector, attributes),
      parentContext: parentContexts.length > 0
        ? parentContexts.join(', ')
        : undefined
    };
  }

  private findRelatedEvents(currentEvent: string, selector: string): GTMEventDocument['relatedEvents'] {
    const related: GTMEventDocument['relatedEvents'] = [];

    // 비슷한 이벤트 매핑
    const eventRelations: Record<string, { events: string[], differences: Record<string, string> }> = {
      'select_promotion': {
        events: ['select_item', 'view_promotion'],
        differences: {
          'select_item': '상품 클릭은 ap-data-item 또는 상품 관련 속성 사용',
          'view_promotion': '프로모션 노출은 클릭 없이 화면에 보이는 것만으로 발생'
        }
      },
      'select_item': {
        events: ['select_promotion', 'view_item'],
        differences: {
          'select_promotion': '프로모션 클릭은 ap-data-promotion 속성 사용',
          'view_item': '상품 상세 페이지 진입 시 발생 (클릭이 아닌 페이지 로드)'
        }
      },
      'add_to_cart': {
        events: ['select_item', 'begin_checkout'],
        differences: {
          'select_item': '상품 클릭과 장바구니 담기는 별개의 행동',
          'begin_checkout': '결제 시작은 장바구니에서 결제 버튼 클릭 시'
        }
      }
    };

    const relations = eventRelations[currentEvent];
    if (relations) {
      relations.events.forEach(eventName => {
        related.push({
          eventName,
          difference: relations.differences[eventName]
        });
      });
    }

    return related;
  }

  private getTriggerTypeDescription(type: string): string {
    const descriptions: Record<string, string> = {
      'LINK_CLICK': '링크(<a> 태그) 클릭 시 발생',
      'CLICK': '모든 요소 클릭 시 발생',
      'PAGEVIEW': '페이지 로드 시 발생',
      'CUSTOM_EVENT': 'dataLayer.push로 커스텀 이벤트 전송 시 발생',
      'DOM_READY': 'DOM이 준비되었을 때 발생',
      'WINDOW_LOADED': '페이지가 완전히 로드되었을 때 발생',
      'FORM_SUBMIT': '폼 제출 시 발생',
      'SCROLL': '스크롤 시 발생',
      'VISIBILITY': '특정 요소가 화면에 보일 때 발생'
    };

    return descriptions[type] || type;
  }

  private explainTriggerCondition(trigger: any): string {
    if (trigger.cssSelector) {
      return `${trigger.cssSelector} 조건에 맞는 요소 클릭 시`;
    }
    if (trigger.customEvent) {
      return `dataLayer에 "${trigger.customEvent}" 이벤트가 push될 때`;
    }
    return trigger.name || '알 수 없는 조건';
  }

  private explainSelector(selector: string, attributes: string[]): string {
    if (!selector) return '선택자 없음';

    // 선택자 해석
    const parts: string[] = [];

    if (selector.startsWith('a[')) {
      parts.push('<a> 태그(링크)');
    } else if (selector.startsWith('button[')) {
      parts.push('<button> 태그');
    }

    const attrMatch = selector.match(/\[([^\]]+)\]/g);
    if (attrMatch) {
      attrMatch.forEach(m => {
        const attr = m.replace(/[\[\]]/g, '');
        parts.push(`"${attr}" 속성이 있는`);
      });
    }

    if (attributes.length > 0) {
      parts.push(`(${attributes.join(', ')} 속성에서 데이터 추출)`);
    }

    return parts.join(' ') || selector;
  }

  private summarizeJsCode(code: string | undefined): string {
    if (!code) return '';

    const summaries: string[] = [];

    if (code.includes('getAttribute')) {
      const attrs = code.match(/getAttribute\(['"]([^'"]+)['"]\)/g);
      if (attrs) {
        attrs.forEach(a => {
          const attr = a.match(/getAttribute\(['"]([^'"]+)['"]\)/)?.[1];
          if (attr) summaries.push(`${attr} 속성에서 값 추출`);
        });
      }
    }

    if (code.includes('JSON.parse')) {
      summaries.push('JSON 파싱');
    }

    if (code.includes('closest')) {
      summaries.push('부모 요소에서 추가 정보 추출');
    }

    return summaries.join(' → ') || '복잡한 로직';
  }

  private getEventDescription(eventName: string, tag: any): string {
    const descriptions: Record<string, string> = {
      'select_promotion': '프로모션 배너를 클릭할 때 발생하는 이벤트입니다.',
      'view_promotion': '프로모션 배너가 화면에 노출될 때 발생하는 이벤트입니다.',
      'select_item': '상품을 클릭할 때 발생하는 이벤트입니다.',
      'view_item': '상품 상세 페이지를 조회할 때 발생하는 이벤트입니다.',
      'view_item_list': '상품 목록이 화면에 표시될 때 발생하는 이벤트입니다.',
      'add_to_cart': '상품을 장바구니에 담을 때 발생하는 이벤트입니다.',
      'begin_checkout': '결제 프로세스를 시작할 때 발생하는 이벤트입니다.',
      'purchase': '구매가 완료될 때 발생하는 이벤트입니다.',
      'login': '로그인할 때 발생하는 이벤트입니다.',
      'sign_up': '회원가입할 때 발생하는 이벤트입니다.'
    };

    // 태그의 notes 필드가 있으면 사용
    if (tag.notes) {
      return tag.notes;
    }

    return descriptions[eventName] || `${eventName} 이벤트`;
  }
}
