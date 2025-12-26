/**
 * GTM 제약조건 검증기
 *
 * GTM 태그/트리거 분석 시 누락될 수 있는 제약조건을 자동으로 감지하고 검증합니다.
 *
 * 검증 항목:
 * 1. 페이지 타입 제한 (page_type filter)
 * 2. URL 패턴 제한 (URL contains/matches)
 * 3. 쿠키 조건 (Cookie filter)
 * 4. 사용자 상태 조건 (로그인 여부 등)
 * 5. 시간/캠페인 제한 (특정 기간만 활성)
 */

import * as fs from 'fs';

export interface ConstraintValidationResult {
  eventName: string;
  tagId: string;
  triggerId: string;
  constraints: DetectedConstraint[];
  missingConstraints: PotentialMissingConstraint[];
  validationNotes: string[];
}

export interface DetectedConstraint {
  type: 'PAGE_TYPE' | 'URL_PATTERN' | 'COOKIE' | 'USER_STATE' | 'CAMPAIGN' | 'CUSTOM';
  condition: string;
  value: string;
  source: 'trigger_filter' | 'trigger_custom_event' | 'tag_condition' | 'variable';
}

export interface PotentialMissingConstraint {
  type: string;
  reason: string;
  recommendation: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

export class GTMConstraintValidator {
  private gtm: any;
  private variableMap: Map<string, any> = new Map();
  private triggerMap: Map<string, any> = new Map();
  private tagMap: Map<string, any> = new Map();

  constructor(gtmFilePath: string) {
    this.gtm = JSON.parse(fs.readFileSync(gtmFilePath, 'utf-8'));
    this.buildMaps();
  }

  private buildMaps(): void {
    // 변수 맵
    for (const variable of this.gtm.containerVersion.variable || []) {
      this.variableMap.set(variable.name, variable);
    }

    // 트리거 맵
    for (const trigger of this.gtm.containerVersion.trigger || []) {
      this.triggerMap.set(trigger.triggerId, trigger);
    }

    // 태그 맵
    for (const tag of this.gtm.containerVersion.tag || []) {
      this.tagMap.set(tag.tagId, tag);
    }
  }

  /**
   * 특정 이벤트의 제약조건을 검증합니다.
   */
  validateEventConstraints(eventName: string): ConstraintValidationResult[] {
    const results: ConstraintValidationResult[] = [];

    for (const [tagId, tag] of this.tagMap) {
      const eventParam = tag.parameter?.find((p: any) => p.key === 'eventName');
      if (eventParam?.value !== eventName) continue;

      const triggerIds = tag.firingTriggerId || [];
      for (const triggerId of triggerIds) {
        const trigger = this.triggerMap.get(triggerId);
        if (!trigger) continue;

        const result = this.analyzeTagTriggerConstraints(tag, trigger, eventName);
        results.push(result);
      }
    }

    return results;
  }

  /**
   * 태그와 트리거의 제약조건을 분석합니다.
   */
  private analyzeTagTriggerConstraints(tag: any, trigger: any, eventName: string): ConstraintValidationResult {
    const constraints: DetectedConstraint[] = [];
    const missingConstraints: PotentialMissingConstraint[] = [];
    const validationNotes: string[] = [];

    // 1. 트리거의 Custom Event Filter 분석
    if (trigger.customEventFilter) {
      for (const filter of trigger.customEventFilter) {
        const constraint = this.parseFilter(filter, 'trigger_custom_event');
        if (constraint) constraints.push(constraint);
      }
    }

    // 2. 트리거의 일반 Filter 분석
    if (trigger.filter) {
      for (const filter of trigger.filter) {
        const constraint = this.parseFilter(filter, 'trigger_filter');
        if (constraint) constraints.push(constraint);
      }
    }

    // 3. 트리거의 Auto Event Filter 분석 (클릭 트리거 등)
    if (trigger.autoEventFilter) {
      for (const filter of trigger.autoEventFilter) {
        const constraint = this.parseFilter(filter, 'trigger_filter');
        if (constraint) constraints.push(constraint);
      }
    }

    // 4. 누락된 제약조건 검사
    missingConstraints.push(...this.checkMissingConstraints(tag, trigger, constraints, eventName));

    // 5. 검증 노트 생성
    validationNotes.push(...this.generateValidationNotes(tag, trigger, constraints));

    return {
      eventName,
      tagId: tag.tagId,
      triggerId: trigger.triggerId,
      constraints,
      missingConstraints,
      validationNotes,
    };
  }

  /**
   * 필터를 파싱하여 제약조건으로 변환합니다.
   */
  private parseFilter(filter: any, source: DetectedConstraint['source']): DetectedConstraint | null {
    const type = filter.type; // EQUALS, CONTAINS, MATCHES_CSS_SELECTOR, etc.
    const arg0 = filter.parameter?.find((p: any) => p.key === 'arg0')?.value || '';
    const arg1 = filter.parameter?.find((p: any) => p.key === 'arg1')?.value || '';

    // 페이지 타입 관련
    if (arg0.includes('PAGETYPE') || arg0.includes('Page Type') || arg0.includes('pageType')) {
      return {
        type: 'PAGE_TYPE',
        condition: type,
        value: arg1,
        source,
      };
    }

    // URL 관련
    if (arg0.includes('URL') || arg0.includes('Page Path') || arg0.includes('pagePath')) {
      return {
        type: 'URL_PATTERN',
        condition: type,
        value: arg1,
        source,
      };
    }

    // 쿠키 관련
    if (arg0.includes('Cookie') || arg0.includes('cookie')) {
      return {
        type: 'COOKIE',
        condition: type,
        value: `${arg0} = ${arg1}`,
        source,
      };
    }

    // 로그인/사용자 상태 관련
    if (arg0.includes('LOGIN') || arg0.includes('isLogin') || arg0.includes('MEMBER') || arg0.includes('USER')) {
      return {
        type: 'USER_STATE',
        condition: type,
        value: `${arg0} = ${arg1}`,
        source,
      };
    }

    return null;
  }

  /**
   * 누락된 제약조건을 검사합니다.
   */
  private checkMissingConstraints(
    tag: any,
    trigger: any,
    existingConstraints: DetectedConstraint[],
    eventName: string
  ): PotentialMissingConstraint[] {
    const missing: PotentialMissingConstraint[] = [];

    // 1. 페이지 타입 제한 검사
    const hasPageTypeConstraint = existingConstraints.some(c => c.type === 'PAGE_TYPE');
    if (!hasPageTypeConstraint) {
      // 이벤트 유형에 따라 페이지 제한이 필요한지 판단
      const needsPageTypeConstraint = this.eventNeedsPageTypeConstraint(eventName);
      if (needsPageTypeConstraint) {
        missing.push({
          type: 'PAGE_TYPE',
          reason: `이벤트 '${eventName}'에 페이지 타입 제한이 없습니다. 모든 페이지에서 발생 가능합니다.`,
          recommendation: '특정 페이지에서만 발생해야 하는 이벤트라면 pageTypes 제한을 추가하세요.',
          severity: 'MEDIUM',
        });
      }
    }

    // 2. CUSTOM_EVENT 트리거인데 dataLayer 이벤트만 확인하는 경우
    if (trigger.type === 'CUSTOM_EVENT' && !existingConstraints.some(c => c.type === 'PAGE_TYPE' || c.type === 'URL_PATTERN')) {
      missing.push({
        type: 'SCOPE_LIMITATION',
        reason: `CUSTOM_EVENT 트리거가 dataLayer 이벤트만 확인하고 페이지/URL 제한이 없습니다.`,
        recommendation: '해당 dataLayer 이벤트가 어디서 push되는지 확인하고, 필요시 제한 조건을 추가하세요.',
        severity: 'LOW',
      });
    }

    // 3. 클릭 기반 이벤트인데 셀렉터 제한이 없는 경우
    if (trigger.type === 'CLICK' || trigger.type === 'LINK_CLICK') {
      const hasSelector = existingConstraints.some(c =>
        c.condition === 'MATCHES_CSS_SELECTOR' || c.condition === 'CSS_SELECTOR'
      );
      if (!hasSelector) {
        missing.push({
          type: 'SELECTOR',
          reason: '클릭 트리거에 CSS 셀렉터 제한이 없습니다.',
          recommendation: '특정 요소 클릭만 추적해야 한다면 CSS 셀렉터 조건을 추가하세요.',
          severity: 'MEDIUM',
        });
      }
    }

    // 4. Duration/시간 관련 이벤트에 대한 추가 검사
    if (eventName.includes('duration') || eventName.includes('time')) {
      missing.push({
        type: 'TIMING',
        reason: '시간 측정 관련 이벤트입니다. 발생 조건과 타이밍을 확인하세요.',
        recommendation: '어떤 액션 후에 측정이 시작되는지, 측정 완료 조건이 무엇인지 문서화하세요.',
        severity: 'LOW',
      });
    }

    return missing;
  }

  /**
   * 이벤트가 페이지 타입 제한이 필요한지 판단합니다.
   */
  private eventNeedsPageTypeConstraint(eventName: string): boolean {
    // 페이지 특정 이벤트
    const pageSpecificEvents = [
      'view_item', 'add_to_cart', 'view_cart', 'begin_checkout', 'purchase',
      'view_item_list', 'view_search_results', 'select_item',
    ];

    if (pageSpecificEvents.includes(eventName)) {
      return true;
    }

    // 범용 이벤트 (페이지 제한 불필요)
    const universalEvents = [
      'page_view', 'scroll', 'click', 'ap_click', 'login', 'sign_up',
    ];

    if (universalEvents.includes(eventName)) {
      return false;
    }

    // 그 외 커스텀 이벤트는 검토 필요
    return true;
  }

  /**
   * 검증 노트를 생성합니다.
   */
  private generateValidationNotes(
    tag: any,
    trigger: any,
    constraints: DetectedConstraint[]
  ): string[] {
    const notes: string[] = [];

    if (constraints.length === 0) {
      notes.push('⚠️ 감지된 제약조건이 없습니다. 모든 조건에서 이벤트가 발생할 수 있습니다.');
    }

    if (trigger.type === 'CUSTOM_EVENT') {
      const eventFilter = trigger.customEventFilter?.[0];
      const eventValue = eventFilter?.parameter?.find((p: any) => p.key === 'arg1')?.value;
      if (eventValue) {
        notes.push(`📍 dataLayer 이벤트 '${eventValue}' 발생 시 트리거됩니다.`);
        notes.push(`   → 이 이벤트가 어떤 페이지/조건에서 push되는지 개발 코드 확인이 필요합니다.`);
      }
    }

    return notes;
  }

  /**
   * 모든 이벤트의 제약조건을 검증하고 리포트를 생성합니다.
   */
  validateAllEvents(): Map<string, ConstraintValidationResult[]> {
    const allResults = new Map<string, ConstraintValidationResult[]>();

    // 모든 GA4 이벤트 태그 수집
    const eventNames = new Set<string>();
    for (const [, tag] of this.tagMap) {
      if (tag.type === 'gaawe' || tag.type?.includes('ga4')) {
        const eventParam = tag.parameter?.find((p: any) => p.key === 'eventName');
        if (eventParam?.value) {
          eventNames.add(eventParam.value);
        }
      }
    }

    // 각 이벤트 검증
    for (const eventName of eventNames) {
      const results = this.validateEventConstraints(eventName);
      if (results.length > 0) {
        allResults.set(eventName, results);
      }
    }

    return allResults;
  }

  /**
   * 검증 리포트를 출력합니다.
   */
  printValidationReport(results: Map<string, ConstraintValidationResult[]>): void {
    console.log('╔════════════════════════════════════════════════════════════════════╗');
    console.log('║       GTM 제약조건 검증 리포트                                      ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝\n');

    let totalMissing = 0;
    let highSeverity = 0;

    for (const [eventName, eventResults] of results) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`📌 이벤트: ${eventName}`);
      console.log('='.repeat(70));

      for (const result of eventResults) {
        console.log(`\n[Tag ${result.tagId}] → Trigger ${result.triggerId}`);

        // 감지된 제약조건
        if (result.constraints.length > 0) {
          console.log('\n✅ 감지된 제약조건:');
          for (const c of result.constraints) {
            console.log(`   - [${c.type}] ${c.condition}: ${c.value}`);
          }
        }

        // 누락 가능성 있는 제약조건
        if (result.missingConstraints.length > 0) {
          console.log('\n⚠️ 검토 필요 항목:');
          for (const m of result.missingConstraints) {
            const icon = m.severity === 'HIGH' ? '🔴' : m.severity === 'MEDIUM' ? '🟡' : '🟢';
            console.log(`   ${icon} [${m.severity}] ${m.type}`);
            console.log(`      사유: ${m.reason}`);
            console.log(`      권장: ${m.recommendation}`);
            totalMissing++;
            if (m.severity === 'HIGH') highSeverity++;
          }
        }

        // 검증 노트
        if (result.validationNotes.length > 0) {
          console.log('\n📝 검증 노트:');
          for (const note of result.validationNotes) {
            console.log(`   ${note}`);
          }
        }
      }
    }

    // 요약
    console.log(`\n\n${'='.repeat(70)}`);
    console.log('📊 검증 요약');
    console.log('='.repeat(70));
    console.log(`   검증된 이벤트: ${results.size}개`);
    console.log(`   검토 필요 항목: ${totalMissing}개`);
    console.log(`   높은 심각도: ${highSeverity}개`);
  }

  /**
   * CUSTOM_EVENT 트리거에 대해 dataLayer.push를 수행하는 HTML 태그를 찾습니다.
   * 이를 통해 의존성 체인과 실제 페이지 제한 조건을 파악합니다.
   */
  findDataLayerPushSource(eventName: string): DependencyChainResult | null {
    // 1. 해당 이벤트명으로 dataLayer.push하는 HTML 태그 찾기
    const htmlTags: any[] = [];

    for (const [, tag] of this.tagMap) {
      if (tag.type !== 'html') continue;

      const htmlParam = tag.parameter?.find((p: any) => p.key === 'html');
      if (!htmlParam?.value) continue;

      const html = htmlParam.value;
      // dataLayer.push와 이벤트명 확인
      if (html.includes('dataLayer.push') && html.includes(`'event': '${eventName}'`)) {
        htmlTags.push({
          tagId: tag.tagId,
          tagName: tag.name,
          firingTriggerId: tag.firingTriggerId,
          htmlSnippet: html.substring(0, 200),
        });
      }

      // 또는 event: "eventName" 형식
      if (html.includes('dataLayer.push') && html.includes(`"event": "${eventName}"`)) {
        htmlTags.push({
          tagId: tag.tagId,
          tagName: tag.name,
          firingTriggerId: tag.firingTriggerId,
          htmlSnippet: html.substring(0, 200),
        });
      }
    }

    if (htmlTags.length === 0) return null;

    // 2. 각 HTML 태그의 트리거 조건 분석
    const result: DependencyChainResult = {
      eventName,
      sourceType: 'HTML_TAG',
      sourceTags: [],
      pageTypeConstraints: [],
    };

    for (const htmlTag of htmlTags) {
      const sourceTag: SourceTagInfo = {
        tagId: htmlTag.tagId,
        tagName: htmlTag.tagName,
        triggers: [],
      };

      for (const triggerId of htmlTag.firingTriggerId || []) {
        const trigger = this.triggerMap.get(triggerId);
        if (!trigger) continue;

        const triggerInfo: TriggerInfo = {
          triggerId,
          triggerName: trigger.name,
          triggerType: trigger.type,
          conditions: [],
        };

        // 트리거 조건에서 페이지 제한 찾기
        if (trigger.filter) {
          for (const f of trigger.filter) {
            const arg0 = f.parameter?.find((p: any) => p.key === 'arg0')?.value || '';
            const arg1 = f.parameter?.find((p: any) => p.key === 'arg1')?.value || '';

            triggerInfo.conditions.push({
              type: f.type,
              variable: arg0,
              value: arg1,
            });

            // Content Group이나 Page Type 관련 조건 찾기
            if (arg0.includes('Content Group') || arg0.includes('PAGETYPE') || arg0.includes('Page Type')) {
              result.pageTypeConstraints.push({
                source: `Tag ${htmlTag.tagId} - Trigger ${triggerId}`,
                condition: `${arg0} ${f.type} "${arg1}"`,
                pageTypes: this.extractPageTypes(arg1),
              });
            }
          }
        }

        sourceTag.triggers.push(triggerInfo);
      }

      result.sourceTags.push(sourceTag);
    }

    // 3. HTML 태그가 다른 조건(예: window 변수)에 의존하는지 확인
    for (const htmlTag of htmlTags) {
      const htmlParam = this.tagMap.get(htmlTag.tagId)?.parameter?.find((p: any) => p.key === 'html');
      if (!htmlParam?.value) continue;

      const html = htmlParam.value;

      // window.xxx 변수 의존성 확인
      const windowVarMatch = html.match(/if\s*\(\s*typeof\s+window\.(\w+)\s*!==\s*'undefined'/);
      if (windowVarMatch) {
        result.windowVariableDependency = windowVarMatch[1];

        // 이 window 변수를 생성하는 태그 찾기
        const creatorTag = this.findWindowVariableCreator(windowVarMatch[1]);
        if (creatorTag) {
          result.variableCreatorTag = creatorTag;
        }
      }
    }

    return result;
  }

  /**
   * window.xxx 변수를 생성하는 태그를 찾습니다.
   */
  private findWindowVariableCreator(varName: string): WindowVariableCreatorInfo | null {
    for (const [, tag] of this.tagMap) {
      if (tag.type !== 'html') continue;

      const htmlParam = tag.parameter?.find((p: any) => p.key === 'html');
      if (!htmlParam?.value) continue;

      const html = htmlParam.value;

      // window.varName = 또는 window['varName'] = 패턴 확인
      if (html.includes(`window.${varName} =`) || html.includes(`window.${varName}=`) ||
          html.includes(`window['${varName}']`) || html.includes(`window["${varName}"]`)) {

        const creatorInfo: WindowVariableCreatorInfo = {
          tagId: tag.tagId,
          tagName: tag.name,
          variableName: varName,
          triggerConditions: [],
        };

        // 이 태그의 트리거 조건 확인
        for (const triggerId of tag.firingTriggerId || []) {
          const trigger = this.triggerMap.get(triggerId);
          if (!trigger) continue;

          if (trigger.filter) {
            for (const f of trigger.filter) {
              const arg0 = f.parameter?.find((p: any) => p.key === 'arg0')?.value || '';
              const arg1 = f.parameter?.find((p: any) => p.key === 'arg1')?.value || '';
              creatorInfo.triggerConditions.push({
                triggerId,
                triggerName: trigger.name,
                condition: `${arg0} ${f.type} "${arg1}"`,
              });
            }
          }
        }

        return creatorInfo;
      }
    }

    return null;
  }

  /**
   * 정규식 패턴에서 페이지 타입을 추출합니다.
   */
  private extractPageTypes(pattern: string): string[] {
    // MAIN|PRODUCT_DETAIL|EVENT_DETAIL 형식 파싱
    return pattern.split('|').map(p => p.trim()).filter(p => p.length > 0);
  }
} // end of GTMConstraintValidator class

// 의존성 체인 결과 타입
interface DependencyChainResult {
  eventName: string;
  sourceType: 'HTML_TAG' | 'DIRECT_PUSH' | 'UNKNOWN';
  sourceTags: SourceTagInfo[];
  pageTypeConstraints: PageTypeConstraint[];
  windowVariableDependency?: string;
  variableCreatorTag?: WindowVariableCreatorInfo;
}

interface SourceTagInfo {
  tagId: string;
  tagName: string;
  triggers: TriggerInfo[];
}

interface TriggerInfo {
  triggerId: string;
  triggerName: string;
  triggerType: string;
  conditions: { type: string; variable: string; value: string }[];
}

interface PageTypeConstraint {
  source: string;
  condition: string;
  pageTypes: string[];
}

interface WindowVariableCreatorInfo {
  tagId: string;
  tagName: string;
  variableName: string;
  triggerConditions: { triggerId: string; triggerName: string; condition: string }[];
}

// CLI 실행
if (require.main === module) {
  const gtmPath = './GTM-5FK5X5C4_workspace112.json';
  const validator = new GTMConstraintValidator(gtmPath);

  // 특정 이벤트 검증
  const targetEvents = ['click_with_duration', 'login', 'custom_event', 'qualified_visit'];

  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║       대상 이벤트 제약조건 검증                                      ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  for (const eventName of targetEvents) {
    const results = validator.validateEventConstraints(eventName);
    for (const result of results) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📌 ${eventName}`);
      console.log(`   Tag: ${result.tagId}, Trigger: ${result.triggerId}`);

      if (result.constraints.length > 0) {
        console.log('\n   ✅ 제약조건:');
        for (const c of result.constraints) {
          console.log(`      - [${c.type}] ${c.condition}: ${c.value}`);
        }
      } else {
        console.log('\n   ⚠️ 제약조건 없음 (모든 페이지에서 발생 가능)');
      }

      if (result.missingConstraints.length > 0) {
        console.log('\n   🔍 검토 필요:');
        for (const m of result.missingConstraints) {
          console.log(`      - [${m.severity}] ${m.reason}`);
        }
      }
    }

    // 의존성 체인 분석
    const depChain = validator.findDataLayerPushSource(eventName);
    if (depChain) {
      console.log('\n   🔗 의존성 체인 분석:');
      console.log(`      소스 타입: ${depChain.sourceType}`);

      for (const tag of depChain.sourceTags) {
        console.log(`      소스 태그: [${tag.tagId}] ${tag.tagName}`);
      }

      if (depChain.pageTypeConstraints.length > 0) {
        console.log('      📍 발견된 페이지 제한:');
        for (const constraint of depChain.pageTypeConstraints) {
          console.log(`         - ${constraint.condition}`);
          console.log(`           페이지 타입: ${constraint.pageTypes.join(', ')}`);
        }
      }

      if (depChain.windowVariableDependency) {
        console.log(`      🔧 window 변수 의존: ${depChain.windowVariableDependency}`);
        if (depChain.variableCreatorTag) {
          console.log(`         생성 태그: [${depChain.variableCreatorTag.tagId}] ${depChain.variableCreatorTag.tagName}`);
          for (const cond of depChain.variableCreatorTag.triggerConditions) {
            console.log(`         조건: ${cond.condition}`);
          }
        }
      }
    }
  }
}
