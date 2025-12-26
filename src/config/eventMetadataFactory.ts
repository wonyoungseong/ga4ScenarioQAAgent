/**
 * 이벤트 메타데이터 팩토리
 *
 * 새 이벤트 추가 시 자동으로 GTM 의존성 체인 분석을 수행하여
 * 누락된 제약조건을 방지합니다.
 *
 * 사용법:
 *   const factory = new EventMetadataFactory(gtmPath);
 *   const metadata = factory.createEventMetadata('click_with_duration', {...});
 *
 * 자동 수행 항목:
 * 1. CUSTOM_EVENT 트리거 감지 → 의존성 체인 분석
 * 2. 페이지 타입 제한 자동 추출 (발견된 경우)
 * 3. 누락 경고 및 권장사항 생성
 */

import { GTMAnalyzer, DependencyChainAnalysis, ConstraintValidationSummary } from '../analyzers/gtmAnalyzer';
import { EventMetadata, DependencyChain, PrerequisiteTag } from '../types/eventMetadata';

export interface EventMetadataInput {
  eventName: string;
  displayName: string;
  description: string;
  fireType: 'autoFire' | 'userAction';
  pageTypes?: string[]; // 수동 지정 (자동 감지된 값으로 덮어쓸 수 있음)
  trigger?: any;
  requiredVariables?: any[];
  dataLayerValidation?: any;
  visionHints?: any[];
  scenarioTemplate?: any[];
  prerequisiteEvents?: string[];
  followUpEvents?: string[];
  gtmInfo?: any;
  campaignInfo?: any;
}

export interface CreateEventResult {
  metadata: EventMetadata;
  validation: ValidationResult;
  warnings: string[];
  autoDetectedConstraints: AutoDetectedConstraint[];
}

export interface ValidationResult {
  isValid: boolean;
  hasCustomEventTrigger: boolean;
  dependencyChainAnalyzed: boolean;
  pageTypesAutoDetected: boolean;
  manualReviewRequired: boolean;
  reviewItems: string[];
}

export interface AutoDetectedConstraint {
  type: 'PAGE_TYPE' | 'WINDOW_VARIABLE' | 'COOKIE' | 'URL_PATTERN';
  source: string;
  value: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export class EventMetadataFactory {
  private analyzer: GTMAnalyzer;

  constructor(gtmJsonPath: string) {
    this.analyzer = new GTMAnalyzer(gtmJsonPath);
  }

  /**
   * 이벤트 메타데이터를 생성합니다.
   * CUSTOM_EVENT 트리거인 경우 자동으로 의존성 체인을 분석합니다.
   */
  createEventMetadata(input: EventMetadataInput): CreateEventResult {
    const warnings: string[] = [];
    const autoDetectedConstraints: AutoDetectedConstraint[] = [];

    // 1. GTM에서 이벤트 정보 조회
    const gtmResult = this.analyzer.analyze();
    const gtmTag = gtmResult.tags.find(t => t.eventName === input.eventName);

    // 2. CUSTOM_EVENT 트리거 확인
    const hasCustomEventTrigger = gtmTag?.triggers.some(t => t.type === 'CUSTOM_EVENT') ?? false;

    // 3. 의존성 체인 분석 (CUSTOM_EVENT인 경우)
    let depChainAnalysis: DependencyChainAnalysis | null = null;
    let dependencyChain: DependencyChain | undefined = undefined;
    let autoDetectedPageTypes: string[] = [];

    if (hasCustomEventTrigger) {
      console.log(`\n🔍 [${input.eventName}] CUSTOM_EVENT 트리거 감지 → 의존성 체인 분석 시작...`);

      depChainAnalysis = this.analyzer.analyzeDependencyChain(input.eventName);

      if (depChainAnalysis.hasDependencyChain) {
        console.log(`   ✅ 의존성 체인 발견`);

        // 페이지 타입 자동 추출
        if (depChainAnalysis.detectedPageTypes.length > 0) {
          autoDetectedPageTypes = depChainAnalysis.detectedPageTypes;
          console.log(`   📍 자동 감지된 페이지 타입: ${autoDetectedPageTypes.join(', ')}`);

          autoDetectedConstraints.push({
            type: 'PAGE_TYPE',
            source: 'dependency_chain_analysis',
            value: autoDetectedPageTypes.join('|'),
            confidence: 'HIGH',
          });
        }

        // window 변수 의존성
        if (depChainAnalysis.windowVariableDependency) {
          console.log(`   🔧 window 변수 의존: ${depChainAnalysis.windowVariableDependency.variableName}`);

          autoDetectedConstraints.push({
            type: 'WINDOW_VARIABLE',
            source: `Tag ${depChainAnalysis.windowVariableDependency.creatorTagId}`,
            value: depChainAnalysis.windowVariableDependency.variableName,
            confidence: 'HIGH',
          });
        }

        // DependencyChain 객체 생성
        dependencyChain = this.buildDependencyChain(depChainAnalysis);
      } else {
        console.log(`   ⚠️ 의존성 체인 없음 (개발 코드에서 직접 push)`);
        warnings.push(`CUSTOM_EVENT '${input.eventName}'의 dataLayer.push 소스를 GTM에서 찾을 수 없습니다. 개발 코드 확인 필요.`);
      }
    }

    // 4. 페이지 타입 결정
    let finalPageTypes: string[];
    let pageTypesAutoDetected = false;

    if (autoDetectedPageTypes.length > 0 && !input.pageTypes) {
      // 자동 감지된 값 사용
      finalPageTypes = autoDetectedPageTypes;
      pageTypesAutoDetected = true;
      console.log(`   ✨ pageTypes 자동 설정: ${finalPageTypes.join(', ')}`);
    } else if (input.pageTypes) {
      // 수동 지정 값 사용
      finalPageTypes = input.pageTypes;

      // 수동 값과 자동 감지 값이 다르면 경고
      if (autoDetectedPageTypes.length > 0) {
        const manualSet = new Set(input.pageTypes);
        const autoSet = new Set(autoDetectedPageTypes);
        const diff = autoDetectedPageTypes.filter(pt => !manualSet.has(pt));

        if (diff.length > 0) {
          warnings.push(`수동 지정된 pageTypes와 자동 감지된 값이 다릅니다. 자동 감지: ${autoDetectedPageTypes.join(', ')}, 수동: ${input.pageTypes.join(', ')}`);
        }
      }
    } else {
      // 기본값
      finalPageTypes = ['ALL'];
      if (hasCustomEventTrigger) {
        warnings.push(`CUSTOM_EVENT 트리거이지만 pageTypes가 지정되지 않았습니다. 'ALL'로 설정됨.`);
      }
    }

    // 5. 검증 결과 생성
    const validation: ValidationResult = {
      isValid: warnings.length === 0,
      hasCustomEventTrigger,
      dependencyChainAnalyzed: depChainAnalysis !== null,
      pageTypesAutoDetected,
      manualReviewRequired: hasCustomEventTrigger && !depChainAnalysis?.hasDependencyChain,
      reviewItems: [],
    };

    if (validation.manualReviewRequired) {
      validation.reviewItems.push('CUSTOM_EVENT의 dataLayer.push 소스 확인 필요');
      validation.reviewItems.push('개발 코드에서 어떤 페이지에서 push되는지 확인');
    }

    // 6. 최종 메타데이터 생성
    const metadata: EventMetadata = {
      eventName: input.eventName,
      displayName: input.displayName,
      description: input.description,
      fireType: input.fireType,
      pageTypes: finalPageTypes,
      trigger: input.trigger,
      requiredVariables: input.requiredVariables || [],
      dataLayerValidation: input.dataLayerValidation || { eventName: input.eventName },
      visionHints: input.visionHints,
      scenarioTemplate: input.scenarioTemplate,
      prerequisiteEvents: input.prerequisiteEvents,
      followUpEvents: input.followUpEvents,
      gtmInfo: input.gtmInfo,
      campaignInfo: input.campaignInfo,
      dependencyChain,
    };

    // 7. 결과 출력
    if (warnings.length > 0) {
      console.log(`\n⚠️ 경고 (${warnings.length}개):`);
      warnings.forEach(w => console.log(`   - ${w}`));
    }

    return {
      metadata,
      validation,
      warnings,
      autoDetectedConstraints,
    };
  }

  /**
   * DependencyChainAnalysis를 DependencyChain으로 변환
   */
  private buildDependencyChain(analysis: DependencyChainAnalysis): DependencyChain {
    const prerequisiteTags: PrerequisiteTag[] = [];

    for (const sourceTag of analysis.sourceTags) {
      for (const trigger of sourceTag.triggerConditions) {
        const conditions = trigger.conditions.map(c => `${c.variable} ${c.type} "${c.value}"`).join(' AND ');

        prerequisiteTags.push({
          tagId: sourceTag.tagId,
          tagName: sourceTag.tagName,
          triggerId: trigger.triggerId,
          triggerCondition: conditions || trigger.triggerType,
        });
      }
    }

    // window 변수 생성 태그 추가
    if (analysis.windowVariableDependency?.creatorTagId) {
      const creatorConditions = analysis.windowVariableDependency.creatorConditions
        .map(c => c.condition)
        .join(' AND ');

      prerequisiteTags.push({
        tagId: analysis.windowVariableDependency.creatorTagId,
        tagName: analysis.windowVariableDependency.creatorTagName || 'Unknown',
        triggerId: analysis.windowVariableDependency.creatorConditions[0]?.triggerId || '',
        triggerCondition: creatorConditions,
      });
    }

    let description = '';
    if (analysis.windowVariableDependency) {
      description = `window.${analysis.windowVariableDependency.variableName}가 존재해야 dataLayer.push 발생`;
    } else {
      description = `${analysis.sourceTags.length}개의 HTML 태그에서 dataLayer.push 발생`;
    }

    return {
      description,
      prerequisiteTags,
    };
  }

  /**
   * 여러 이벤트를 일괄 생성하고 검증 리포트를 출력합니다.
   */
  createMultipleEvents(inputs: EventMetadataInput[]): {
    results: CreateEventResult[];
    summary: {
      total: number;
      valid: number;
      warnings: number;
      manualReviewRequired: number;
    };
  } {
    const results: CreateEventResult[] = [];
    let validCount = 0;
    let warningCount = 0;
    let manualReviewCount = 0;

    console.log('\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║       이벤트 메타데이터 일괄 생성 및 검증                           ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝');

    for (const input of inputs) {
      console.log(`\n${'─'.repeat(60)}`);
      const result = this.createEventMetadata(input);
      results.push(result);

      if (result.validation.isValid) validCount++;
      if (result.warnings.length > 0) warningCount++;
      if (result.validation.manualReviewRequired) manualReviewCount++;
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log('📊 요약');
    console.log(`   총 이벤트: ${inputs.length}개`);
    console.log(`   유효: ${validCount}개`);
    console.log(`   경고 있음: ${warningCount}개`);
    console.log(`   수동 검토 필요: ${manualReviewCount}개`);

    return {
      results,
      summary: {
        total: inputs.length,
        valid: validCount,
        warnings: warningCount,
        manualReviewRequired: manualReviewCount,
      },
    };
  }
}

// CLI 테스트
if (require.main === module) {
  const factory = new EventMetadataFactory('./GTM-5FK5X5C4_workspace112.json');

  // 테스트 이벤트
  const testEvents: EventMetadataInput[] = [
    {
      eventName: 'click_with_duration',
      displayName: '클릭 체류시간',
      description: '클릭 후 체류시간 측정',
      fireType: 'userAction',
      // pageTypes를 지정하지 않음 → 자동 감지 테스트
    },
    {
      eventName: 'login',
      displayName: '로그인',
      description: '로그인 완료',
      fireType: 'userAction',
      // pageTypes를 지정하지 않음 → 자동 감지 실패 시 경고
    },
    {
      eventName: 'qualified_visit',
      displayName: '조건부 방문',
      description: '캠페인 조건 충족',
      fireType: 'autoFire',
      pageTypes: ['ALL'], // 수동 지정
    },
  ];

  factory.createMultipleEvents(testEvents);
}
