/**
 * 시스템 프롬프트 생성기
 *
 * Agent가 이벤트를 정확히 이해하고 예측할 수 있도록
 * 구조화된 시스템 프롬프트를 생성합니다.
 */

import {
  UnifiedEventDefinition,
  SystemPromptOptions,
  PageAnalysisResult,
} from '../types/unifiedEventDefinition';
import { PageType, getPageTypeDescription } from '../types/pageContext';

/**
 * Vision AI Agent용 시스템 프롬프트 생성기
 */
export class SystemPromptGenerator {
  private eventDefinitions: UnifiedEventDefinition[];

  constructor(eventDefinitions: UnifiedEventDefinition[]) {
    this.eventDefinitions = eventDefinitions;
  }

  /**
   * 페이지 분석용 시스템 프롬프트를 생성합니다.
   */
  generatePageAnalysisPrompt(options: SystemPromptOptions): string {
    const lines: string[] = [];

    // 1. 역할 정의
    lines.push('# 역할: GA4 이벤트 분석 전문가');
    lines.push('');
    lines.push('당신은 웹 페이지 스크린샷을 분석하여 GA4 이벤트 발생 가능 여부를 판단하는 전문가입니다.');
    lines.push('개발가이드와 GTM 설정을 기반으로 정확한 이벤트 예측을 제공합니다.');
    lines.push('');

    // 2. 분석 원칙
    lines.push('## 분석 원칙');
    lines.push('');
    lines.push('1. **실제 화면 기반 판단**: 화면에 실제로 보이는 UI 요소만 기준으로 판단');
    lines.push('2. **개발가이드 준수**: 이벤트 전송 시점 정의를 엄격히 따름');
    lines.push('3. **페이지 타입 인식**: 현재 페이지 타입에서만 발생하는 이벤트 구분');
    lines.push('4. **사용자 액션 구분**: 자동 발생 vs 사용자 액션 필요 이벤트 구분');
    lines.push('');

    // 3. 페이지 타입별 컨텍스트
    if (options.pageType) {
      lines.push(`## 현재 페이지: ${getPageTypeDescription(options.pageType)} (${options.pageType})`);
      lines.push('');

      const eventsForPage = this.getEventsForPageType(options.pageType);
      lines.push(`이 페이지에서 발생 가능한 이벤트: ${eventsForPage.length}개`);
      lines.push('');
    }

    // 4. 이벤트 정의
    lines.push('## 이벤트 정의');
    lines.push('');

    const eventsToInclude = this.getEventsToInclude(options);

    for (const event of eventsToInclude) {
      lines.push(this.formatEventDefinition(event, options));
      lines.push('');
    }

    // 5. 응답 형식
    lines.push('## 응답 형식');
    lines.push('');
    lines.push('다음 JSON 형식으로 응답해주세요:');
    lines.push('');
    lines.push('```json');
    lines.push('{');
    lines.push('  "pageType": "감지된 페이지 타입",');
    lines.push('  "pageTypeConfidence": 0-100,');
    lines.push('  "predictions": [');
    lines.push('    {');
    lines.push('      "eventName": "이벤트명",');
    lines.push('      "canFire": true/false,');
    lines.push('      "confidence": 0-100,');
    lines.push('      "reason": "판단 이유 (구체적으로)",');
    lines.push('      "uiLocation": "관련 UI 요소 위치 (canFire가 true인 경우)"');
    lines.push('    }');
    lines.push('  ],');
    lines.push('  "detectedUIElements": ["발견된 주요 UI 요소 목록"]');
    lines.push('}');
    lines.push('```');
    lines.push('');

    // 6. 주의사항
    lines.push('## 주의사항');
    lines.push('');
    lines.push('1. **canFire: true** → 화면에 해당 이벤트를 발생시킬 UI가 명확히 존재');
    lines.push('2. **canFire: false** → UI가 없거나 페이지 타입이 맞지 않음');
    lines.push('3. **confidence**: 판단의 확신도');
    lines.push('   - 90-100: 확실함 (UI가 명확히 보임/안보임)');
    lines.push('   - 70-89: 높음 (대부분 확실)');
    lines.push('   - 50-69: 보통 (추정)');
    lines.push('   - 0-49: 낮음 (불확실)');

    return lines.join('\n');
  }

  /**
   * 이벤트 검증용 시스템 프롬프트를 생성합니다.
   */
  generateValidationPrompt(predictions: PageAnalysisResult): string {
    const lines: string[] = [];

    lines.push('# 역할: 이벤트 예측 검증 전문가');
    lines.push('');
    lines.push('이전 분석 결과를 검증하고 실제 이벤트 발생을 확인합니다.');
    lines.push('');

    lines.push('## 이전 분석 결과');
    lines.push('');
    lines.push(`- URL: ${predictions.url}`);
    lines.push(`- 페이지 타입: ${predictions.pageType} (신뢰도: ${predictions.pageTypeConfidence}%)`);
    lines.push('');

    lines.push('### 예측된 이벤트');
    lines.push('');

    for (const pred of predictions.predictions) {
      const status = pred.canFire ? '✅ 발생 가능' : '❌ 발생 불가';
      lines.push(`- **${pred.eventName}**: ${status}`);
      lines.push(`  - 이유: ${pred.reason}`);
      if (pred.uiLocation) {
        lines.push(`  - 위치: ${pred.uiLocation}`);
      }
    }

    lines.push('');
    lines.push('## 검증 방법');
    lines.push('');
    lines.push('1. 각 "발생 가능" 이벤트에 대해 실제 사용자 액션 수행');
    lines.push('2. dataLayer에서 이벤트 발생 확인');
    lines.push('3. 이벤트 파라미터 검증');
    lines.push('4. 결과 보고');

    return lines.join('\n');
  }

  /**
   * 시나리오 생성용 시스템 프롬프트를 생성합니다.
   */
  generateScenarioPrompt(pageType: PageType, targetEvents: string[]): string {
    const lines: string[] = [];

    lines.push('# 역할: QA 테스트 시나리오 생성 전문가');
    lines.push('');
    lines.push('GA4 이벤트 발생을 검증하기 위한 테스트 시나리오를 생성합니다.');
    lines.push('');

    lines.push(`## 대상 페이지: ${getPageTypeDescription(pageType)}`);
    lines.push('');

    lines.push('## 검증 대상 이벤트');
    lines.push('');

    for (const eventName of targetEvents) {
      const eventDef = this.eventDefinitions.find(e => e.eventName === eventName);
      if (eventDef) {
        lines.push(`### ${eventName}`);
        lines.push(`- 설명: ${eventDef.description}`);
        lines.push(`- 발생 조건: ${eventDef.firingCondition.description}`);
        if (eventDef.uiRequirement.examples) {
          lines.push(`- 관련 UI: ${eventDef.uiRequirement.examples.join(', ')}`);
        }
        lines.push('');
      }
    }

    lines.push('## 시나리오 형식');
    lines.push('');
    lines.push('```');
    lines.push('시나리오: [시나리오 이름]');
    lines.push('목적: [검증 목적]');
    lines.push('');
    lines.push('사전 조건:');
    lines.push('- [필요한 조건]');
    lines.push('');
    lines.push('테스트 단계:');
    lines.push('1. [액션]');
    lines.push('2. [액션]');
    lines.push('');
    lines.push('예상 결과:');
    lines.push('- 이벤트: [발생해야 할 이벤트]');
    lines.push('- 파라미터: [검증할 파라미터]');
    lines.push('```');

    return lines.join('\n');
  }

  /**
   * 개별 이벤트 정의를 포맷팅합니다.
   */
  private formatEventDefinition(event: UnifiedEventDefinition, options: SystemPromptOptions): string {
    const lines: string[] = [];

    // 이벤트 헤더
    const required = event.required ? '(필수)' : '(선택)';
    lines.push(`### ${event.eventName} ${required}`);

    // 설명
    lines.push(`- **설명**: ${event.description}`);

    // 발생 조건
    lines.push(`- **발생 조건**: ${event.firingCondition.description}`);

    // 자동 발생 여부
    if (event.firingCondition.autoFire) {
      lines.push(`- **발생 방식**: 🔄 자동 (페이지 로드 시)`);
    } else {
      const actionType = event.firingCondition.userActionType || 'click';
      lines.push(`- **발생 방식**: 👆 사용자 액션 필요 (${actionType})`);
    }

    // 페이지 타입 제한
    if (event.pageTypeRestriction.allowedPageTypes.length > 0) {
      lines.push(`- **허용 페이지**: ${event.pageTypeRestriction.allowedPageTypes.join(', ')}`);
    } else {
      lines.push(`- **허용 페이지**: 모든 페이지`);
    }

    // UI 요구사항
    lines.push(`- **필요 UI**: ${event.uiRequirement.description}`);
    lines.push(`- **확인 질문**: ${event.uiRequirement.visionQuestion}`);

    // GTM 트리거 (옵션)
    if (options.includeGTMTriggers && event.gtmTriggers.length > 0) {
      lines.push(`- **GTM 트리거**:`);
      for (const trigger of event.gtmTriggers.slice(0, 2)) {
        lines.push(`  - ${trigger.name} (${trigger.type})`);
        if (trigger.cssSelector) {
          lines.push(`    - CSS: \`${trigger.cssSelector}\``);
        }
      }
    }

    // Edge Case (옵션)
    if (options.includeEdgeCases && event.edgeCases) {
      lines.push(`- **⚠️ Edge Case**:`);
      for (const edgeCase of event.edgeCases) {
        lines.push(`  - [${edgeCase.site}] ${edgeCase.description}`);
      }
    }

    // UI 예시
    if (event.uiRequirement.examples && event.uiRequirement.examples.length > 0) {
      lines.push(`- **UI 예시**: ${event.uiRequirement.examples.join(', ')}`);
    }

    return lines.join('\n');
  }

  /**
   * 포함할 이벤트 목록을 결정합니다.
   */
  private getEventsToInclude(options: SystemPromptOptions): UnifiedEventDefinition[] {
    let events = [...this.eventDefinitions];

    // 특정 이벤트만 포함
    if (options.eventNames && options.eventNames.length > 0) {
      events = events.filter(e => options.eventNames!.includes(e.eventName));
    }

    // 페이지 타입으로 필터링
    if (options.pageType) {
      events = events.filter(e => {
        if (e.pageTypeRestriction.allowedPageTypes.length === 0) return true;
        return e.pageTypeRestriction.allowedPageTypes.includes(options.pageType!);
      });
    }

    // 상세 수준에 따라 필터링
    if (options.detailLevel === 'minimal') {
      // 필수 이벤트와 주요 이벤트만
      events = events.filter(e =>
        e.required ||
        ['view_item', 'add_to_cart', 'begin_checkout', 'purchase'].includes(e.eventName)
      );
    }

    return events;
  }

  /**
   * 특정 페이지 타입에서 발생 가능한 이벤트를 가져옵니다.
   */
  private getEventsForPageType(pageType: PageType): UnifiedEventDefinition[] {
    return this.eventDefinitions.filter(e => {
      if (e.pageTypeRestriction.allowedPageTypes.length === 0) return true;
      return e.pageTypeRestriction.allowedPageTypes.includes(pageType);
    });
  }

  /**
   * 이벤트 정의 요약을 생성합니다 (Agent간 데이터 교환용).
   */
  generateEventSummary(): string {
    const lines: string[] = [];

    lines.push('# 이벤트 정의 요약');
    lines.push('');

    // 카테고리별 그룹화
    const categories = new Map<string, UnifiedEventDefinition[]>();
    for (const event of this.eventDefinitions) {
      const cat = event.category;
      if (!categories.has(cat)) {
        categories.set(cat, []);
      }
      categories.get(cat)!.push(event);
    }

    const categoryNames: Record<string, string> = {
      'ecommerce': '이커머스',
      'engagement': '인게이지먼트',
      'video': '비디오',
      'auto': '자동 수집',
      'custom': '커스텀',
    };

    for (const [category, events] of categories) {
      lines.push(`## ${categoryNames[category] || category} (${events.length}개)`);
      lines.push('');

      for (const event of events) {
        const pages = event.pageTypeRestriction.allowedPageTypes.length > 0
          ? event.pageTypeRestriction.allowedPageTypes.join(', ')
          : '전체';
        const action = event.firingCondition.autoFire ? '자동' : '액션필요';

        lines.push(`| ${event.eventName} | ${event.description} | ${pages} | ${action} |`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

/**
 * 이벤트 정의 JSON을 Markdown 문서로 변환합니다.
 */
export function eventDefinitionsToMarkdown(events: UnifiedEventDefinition[]): string {
  const lines: string[] = [];

  lines.push('# GA4 이벤트 정의 문서');
  lines.push('');
  lines.push('> 자동 생성된 문서입니다. 개발가이드, GTM JSON, 공통변수 appendix를 기반으로 생성되었습니다.');
  lines.push('');

  lines.push('## 이벤트 목록');
  lines.push('');
  lines.push('| 이벤트명 | 카테고리 | 필수 | 발생 조건 | 허용 페이지 |');
  lines.push('|---------|---------|------|----------|-----------|');

  for (const event of events) {
    const required = event.required ? '✅' : '';
    const pages = event.pageTypeRestriction.allowedPageTypes.length > 0
      ? event.pageTypeRestriction.allowedPageTypes.join(', ')
      : '전체';
    const condition = event.firingCondition.autoFire ? '자동' : '사용자 액션';

    lines.push(`| ${event.eventName} | ${event.category} | ${required} | ${condition} | ${pages} |`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');

  // 상세 정의
  lines.push('## 상세 정의');
  lines.push('');

  for (const event of events) {
    lines.push(`### ${event.eventName}`);
    lines.push('');
    lines.push(`**설명**: ${event.description}`);
    lines.push('');
    lines.push(`**카테고리**: ${event.category}`);
    lines.push('');
    lines.push(`**개발 필수**: ${event.required ? '예' : '아니오'}`);
    lines.push('');

    lines.push('#### 발생 조건');
    lines.push('');
    lines.push(`- 조건: ${event.firingCondition.description}`);
    lines.push(`- 자동 발생: ${event.firingCondition.autoFire ? '예' : '아니오'}`);
    lines.push(`- 사용자 액션 필요: ${event.firingCondition.requiresUserAction ? '예' : '아니오'}`);
    if (event.firingCondition.userActionType) {
      lines.push(`- 액션 타입: ${event.firingCondition.userActionType}`);
    }
    lines.push('');

    lines.push('#### 페이지 제한');
    lines.push('');
    if (event.pageTypeRestriction.allowedPageTypes.length > 0) {
      lines.push(`- 허용 페이지: ${event.pageTypeRestriction.allowedPageTypes.join(', ')}`);
    } else {
      lines.push('- 허용 페이지: 전체');
    }
    lines.push(`- 소스: ${event.pageTypeRestriction.source}`);
    lines.push(`- 이유: ${event.pageTypeRestriction.reason}`);
    lines.push('');

    lines.push('#### UI 요구사항');
    lines.push('');
    lines.push(`- 설명: ${event.uiRequirement.description}`);
    lines.push(`- 확인 질문: ${event.uiRequirement.visionQuestion}`);
    if (event.uiRequirement.examples) {
      lines.push(`- 예시: ${event.uiRequirement.examples.join(', ')}`);
    }
    if (event.uiRequirement.selectorHints) {
      lines.push(`- CSS 힌트: \`${event.uiRequirement.selectorHints.join('`, `')}\``);
    }
    lines.push('');

    if (event.gtmTriggers.length > 0) {
      lines.push('#### GTM 트리거');
      lines.push('');
      for (const trigger of event.gtmTriggers) {
        lines.push(`- **${trigger.name}** (${trigger.type})`);
        if (trigger.cssSelector) {
          lines.push(`  - CSS: \`${trigger.cssSelector}\``);
        }
        if (trigger.customEventName) {
          lines.push(`  - dataLayer 이벤트: ${trigger.customEventName}`);
        }
      }
      lines.push('');
    }

    if (event.requiredVariables.length > 0) {
      lines.push('#### 필수 변수');
      lines.push('');
      lines.push('| 변수명 | 설명 | 타입 | 필수 | GA4 파라미터 |');
      lines.push('|-------|------|-----|------|-------------|');
      for (const v of event.requiredVariables) {
        lines.push(`| ${v.name} | ${v.description} | ${v.dataType} | ${v.required ? '✅' : ''} | ${v.ga4Parameter || ''} |`);
      }
      lines.push('');
    }

    if (event.edgeCases) {
      lines.push('#### Edge Cases');
      lines.push('');
      for (const ec of event.edgeCases) {
        lines.push(`- **[${ec.site}]** ${ec.description}`);
        lines.push(`  - 변경: ${ec.modification}`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}
