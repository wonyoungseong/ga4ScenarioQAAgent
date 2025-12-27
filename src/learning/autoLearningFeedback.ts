/**
 * Auto Learning Feedback System
 *
 * 검증 결과를 분석하여 시스템 설정을 자동으로 업데이트합니다.
 * - 사이트별 Edge Case 자동 추가
 * - 컨텐츠 그룹별 이벤트 규칙 업데이트
 * - Vision AI 프롬프트 힌트 생성
 */

import * as fs from 'fs';
import * as path from 'path';
import { PromptFeedback } from '../parallel/parameterValidator';
import { ParallelAnalysisResult } from '../parallel/parallelContentGroupAnalyzer';

/**
 * 학습된 규칙 타입
 */
export interface LearnedRule {
  id: string;
  type: 'EVENT_RULE' | 'PARAMETER_RULE' | 'PAGE_EXCLUSION' | 'VALUE_PATTERN' | 'VISION_HINT';
  propertyId: string;
  contentGroup: string;
  eventName: string;
  parameterName?: string;
  rule: {
    condition: string;
    action: string;
    confidence: number;
    evidence: string[];
  };
  learnedAt: Date;
  validatedAt?: Date;
  accuracy?: number;
}

/**
 * 사이트별 학습 설정
 */
export interface SiteLearningConfig {
  propertyId: string;
  siteName: string;
  lastUpdated: Date;

  /** 컨텐츠 그룹별 이벤트 규칙 */
  contentGroupRules: Map<string, ContentGroupRules>;

  /** 이벤트별 파라미터 패턴 */
  eventParameterPatterns: Map<string, ParameterPattern[]>;

  /** Vision AI 힌트 */
  visionHints: VisionHint[];

  /** 자동 학습된 Edge Cases */
  learnedEdgeCases: LearnedEdgeCase[];
}

export interface ContentGroupRules {
  contentGroup: string;
  /** 해당 컨텐츠 그룹에서 확실히 발생하는 이벤트 */
  confirmedEvents: string[];
  /** 해당 컨텐츠 그룹에서 확실히 발생하지 않는 이벤트 */
  excludedEvents: string[];
  /** 조건부 발생 이벤트 */
  conditionalEvents: {
    eventName: string;
    condition: string;
    probability: number;
  }[];
  /** 마지막 학습 기준 정확도 */
  lastAccuracy: number;
}

export interface ParameterPattern {
  eventName: string;
  parameterName: string;
  /** 값 패턴 (regex 또는 enum) */
  valuePattern: string;
  /** 샘플 값 */
  sampleValues: string[];
  /** 컨텐츠 그룹별 패턴 차이 */
  contentGroupVariations?: Map<string, string>;
}

export interface VisionHint {
  eventName: string;
  contentGroup?: string;
  hint: string;
  uiElements: string[];
  priority: number;
}

export interface LearnedEdgeCase {
  eventName: string;
  type: string;
  description: string;
  affectedContentGroups: string[];
  confidence: number;
  evidence: string[];
  learnedAt: Date;
}

/**
 * 자동 학습 피드백 시스템
 */
export class AutoLearningFeedback {
  private configDir: string;
  private propertyId: string;
  private siteConfig: SiteLearningConfig;

  constructor(propertyId: string, configDir: string = './config/learning') {
    this.propertyId = propertyId;
    this.configDir = configDir;

    // 설정 디렉토리 생성
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // 기존 설정 로드 또는 새로 생성
    this.siteConfig = this.loadOrCreateConfig();
  }

  /**
   * 설정 로드 또는 생성
   */
  private loadOrCreateConfig(): SiteLearningConfig {
    const configPath = this.getConfigPath();

    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return {
        ...data,
        lastUpdated: new Date(data.lastUpdated),
        contentGroupRules: new Map(Object.entries(data.contentGroupRules || {})),
        eventParameterPatterns: new Map(Object.entries(data.eventParameterPatterns || {})),
      };
    }

    return {
      propertyId: this.propertyId,
      siteName: '',
      lastUpdated: new Date(),
      contentGroupRules: new Map(),
      eventParameterPatterns: new Map(),
      visionHints: [],
      learnedEdgeCases: [],
    };
  }

  /**
   * 설정 파일 경로
   */
  private getConfigPath(): string {
    return path.join(this.configDir, `site_${this.propertyId}.json`);
  }

  /**
   * 분석 결과에서 학습
   */
  learnFromResults(results: ParallelAnalysisResult[]): {
    newRules: LearnedRule[];
    updatedRules: LearnedRule[];
    suggestions: string[];
  } {
    const newRules: LearnedRule[] = [];
    const updatedRules: LearnedRule[] = [];
    const suggestions: string[] = [];

    console.log('\n📚 자동 학습 시작...');

    for (const result of results) {
      // 1. 컨텐츠 그룹별 이벤트 규칙 학습
      const eventRules = this.learnEventRules(result);
      newRules.push(...eventRules.new);
      updatedRules.push(...eventRules.updated);

      // 2. 누락 이벤트 분석 → Edge Case 생성
      const edgeCases = this.learnFromMissedEvents(result);
      newRules.push(...edgeCases);

      // 3. 잘못된 예측 분석 → 제외 규칙 생성
      const exclusionRules = this.learnFromWrongPredictions(result);
      newRules.push(...exclusionRules);

      // 4. 파라미터 검증 결과에서 패턴 학습
      if (result.parameterValidation) {
        const paramRules = this.learnParameterPatterns(result);
        newRules.push(...paramRules);
      }
    }

    // 5. 전체 결과에서 패턴 분석
    const globalPatterns = this.analyzeGlobalPatterns(results);
    suggestions.push(...globalPatterns);

    // 설정 저장
    this.saveConfig();

    console.log(`   ✅ 학습 완료: ${newRules.length}개 신규, ${updatedRules.length}개 업데이트`);

    return { newRules, updatedRules, suggestions };
  }

  /**
   * 이벤트 규칙 학습
   */
  private learnEventRules(result: ParallelAnalysisResult): {
    new: LearnedRule[];
    updated: LearnedRule[];
  } {
    const newRules: LearnedRule[] = [];
    const updatedRules: LearnedRule[] = [];

    const contentGroup = result.contentGroup;
    let rules = this.siteConfig.contentGroupRules.get(contentGroup);

    if (!rules) {
      rules = {
        contentGroup,
        confirmedEvents: [],
        excludedEvents: [],
        conditionalEvents: [],
        lastAccuracy: 0,
      };
      this.siteConfig.contentGroupRules.set(contentGroup, rules);
    }

    // 정확히 예측된 이벤트 → 확정 이벤트에 추가
    for (const event of result.correct) {
      if (!rules.confirmedEvents.includes(event)) {
        rules.confirmedEvents.push(event);
        newRules.push({
          id: `${contentGroup}_${event}_confirmed`,
          type: 'EVENT_RULE',
          propertyId: this.propertyId,
          contentGroup,
          eventName: event,
          rule: {
            condition: `pageType === '${result.pageType}'`,
            action: 'PREDICT_EVENT',
            confidence: result.accuracy / 100,
            evidence: [`정확도 ${result.accuracy.toFixed(1)}%에서 정확히 예측됨`],
          },
          learnedAt: new Date(),
          accuracy: result.accuracy,
        });
      }
    }

    // 잘못 예측된 이벤트 → 제외 이벤트에 추가
    for (const event of result.wrong) {
      if (!rules.excludedEvents.includes(event)) {
        rules.excludedEvents.push(event);
        newRules.push({
          id: `${contentGroup}_${event}_excluded`,
          type: 'PAGE_EXCLUSION',
          propertyId: this.propertyId,
          contentGroup,
          eventName: event,
          rule: {
            condition: `pageType === '${result.pageType}'`,
            action: 'EXCLUDE_EVENT',
            confidence: 0.9,
            evidence: [`${contentGroup}에서 잘못 예측되어 제외됨`],
          },
          learnedAt: new Date(),
        });
      }
    }

    rules.lastAccuracy = result.accuracy;

    return { new: newRules, updated: updatedRules };
  }

  /**
   * 누락 이벤트에서 학습
   */
  private learnFromMissedEvents(result: ParallelAnalysisResult): LearnedRule[] {
    const rules: LearnedRule[] = [];

    for (const event of result.missed) {
      // 누락된 이벤트가 있으면 조건부 발생 규칙 생성
      const existingEdgeCase = this.siteConfig.learnedEdgeCases.find(
        ec => ec.eventName === event && ec.affectedContentGroups.includes(result.contentGroup)
      );

      if (!existingEdgeCase) {
        const edgeCase: LearnedEdgeCase = {
          eventName: event,
          type: 'CONDITIONAL_FIRE',
          description: `${result.contentGroup}에서 조건부로 발생 (현재 예측 누락)`,
          affectedContentGroups: [result.contentGroup],
          confidence: 0.7,
          evidence: [`GA4에서 수집되었으나 예측하지 못함`],
          learnedAt: new Date(),
        };
        this.siteConfig.learnedEdgeCases.push(edgeCase);

        rules.push({
          id: `${result.contentGroup}_${event}_conditional`,
          type: 'EVENT_RULE',
          propertyId: this.propertyId,
          contentGroup: result.contentGroup,
          eventName: event,
          rule: {
            condition: 'needs_investigation',
            action: 'ADD_TO_PREDICTION',
            confidence: 0.7,
            evidence: [`${result.contentGroup}에서 GA4 수집됨 (예측 누락)`],
          },
          learnedAt: new Date(),
        });
      }
    }

    return rules;
  }

  /**
   * 잘못된 예측에서 제외 규칙 학습
   */
  private learnFromWrongPredictions(result: ParallelAnalysisResult): LearnedRule[] {
    const rules: LearnedRule[] = [];

    for (const event of result.wrong) {
      const existingEdgeCase = this.siteConfig.learnedEdgeCases.find(
        ec => ec.eventName === event && ec.type === 'PAGE_EXCLUSION'
      );

      if (!existingEdgeCase) {
        const edgeCase: LearnedEdgeCase = {
          eventName: event,
          type: 'PAGE_EXCLUSION',
          description: `${result.contentGroup}에서 발생하지 않음 (잘못된 예측)`,
          affectedContentGroups: [result.contentGroup],
          confidence: 0.9,
          evidence: [`예측했으나 GA4에서 수집되지 않음`],
          learnedAt: new Date(),
        };
        this.siteConfig.learnedEdgeCases.push(edgeCase);

        // Vision AI 힌트도 추가
        this.siteConfig.visionHints.push({
          eventName: event,
          contentGroup: result.contentGroup,
          hint: `${event}는 ${result.contentGroup}에서 발생하지 않음. 예측에서 제외 필요.`,
          uiElements: [],
          priority: 8,
        });
      } else {
        // 기존 Edge Case에 컨텐츠 그룹 추가
        if (!existingEdgeCase.affectedContentGroups.includes(result.contentGroup)) {
          existingEdgeCase.affectedContentGroups.push(result.contentGroup);
        }
      }
    }

    return rules;
  }

  /**
   * 파라미터 패턴 학습
   */
  private learnParameterPatterns(result: ParallelAnalysisResult): LearnedRule[] {
    const rules: LearnedRule[] = [];

    if (!result.parameterValidation?.eventResults) return rules;

    for (const eventResult of result.parameterValidation.eventResults) {
      // 누락된 키에 대한 규칙 생성
      for (const missingKey of eventResult.keyValidation.missingKeys) {
        rules.push({
          id: `${result.contentGroup}_${eventResult.eventName}_${missingKey}_missing`,
          type: 'PARAMETER_RULE',
          propertyId: this.propertyId,
          contentGroup: result.contentGroup,
          eventName: eventResult.eventName,
          parameterName: missingKey,
          rule: {
            condition: 'parameter_missing',
            action: 'ADD_PARAMETER_EXTRACTION',
            confidence: 0.8,
            evidence: [`파라미터 ${missingKey}가 예측에서 누락됨`],
          },
          learnedAt: new Date(),
        });
      }

      // 값 불일치에 대한 패턴 학습
      for (const paramDetail of eventResult.valueValidation.details) {
        if (paramDetail.verdict === 'PREDICTION_WRONG' && paramDetail.actual) {
          let patterns = this.siteConfig.eventParameterPatterns.get(eventResult.eventName);
          if (!patterns) {
            patterns = [];
            this.siteConfig.eventParameterPatterns.set(eventResult.eventName, patterns);
          }

          const existingPattern = patterns.find(p => p.parameterName === paramDetail.parameterName);
          if (!existingPattern) {
            patterns.push({
              eventName: eventResult.eventName,
              parameterName: paramDetail.parameterName,
              valuePattern: typeof paramDetail.actual === 'string' ? paramDetail.actual : String(paramDetail.actual),
              sampleValues: [String(paramDetail.actual)],
            });
          } else if (!existingPattern.sampleValues.includes(String(paramDetail.actual))) {
            existingPattern.sampleValues.push(String(paramDetail.actual));
          }

          rules.push({
            id: `${result.contentGroup}_${eventResult.eventName}_${paramDetail.parameterName}_pattern`,
            type: 'VALUE_PATTERN',
            propertyId: this.propertyId,
            contentGroup: result.contentGroup,
            eventName: eventResult.eventName,
            parameterName: paramDetail.parameterName,
            rule: {
              condition: 'value_mismatch',
              action: 'UPDATE_VALUE_PATTERN',
              confidence: 0.75,
              evidence: [`예측: ${paramDetail.predicted}, 실제: ${paramDetail.actual}`],
            },
            learnedAt: new Date(),
          });
        }
      }
    }

    return rules;
  }

  /**
   * 전체 결과에서 글로벌 패턴 분석
   */
  private analyzeGlobalPatterns(results: ParallelAnalysisResult[]): string[] {
    const suggestions: string[] = [];

    // 1. 자주 누락되는 이벤트 분석
    const missedCounts = new Map<string, number>();
    for (const r of results) {
      for (const event of r.missed) {
        missedCounts.set(event, (missedCounts.get(event) || 0) + 1);
      }
    }

    const frequentlyMissed = [...missedCounts.entries()]
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1]);

    if (frequentlyMissed.length > 0) {
      suggestions.push(`\n## 자주 누락되는 이벤트 (여러 컨텐츠 그룹에서 반복)`);
      for (const [event, count] of frequentlyMissed) {
        suggestions.push(`- **${event}**: ${count}개 컨텐츠 그룹에서 누락`);

        // Vision AI 힌트 추가
        const existingHint = this.siteConfig.visionHints.find(h => h.eventName === event && !h.contentGroup);
        if (!existingHint) {
          this.siteConfig.visionHints.push({
            eventName: event,
            hint: `${event}는 ${count}개 이상의 컨텐츠 그룹에서 누락됨. UI 요소 감지 로직 강화 필요.`,
            uiElements: [],
            priority: 9,
          });
        }
      }
    }

    // 2. 자주 잘못 예측되는 이벤트 분석
    const wrongCounts = new Map<string, string[]>();
    for (const r of results) {
      for (const event of r.wrong) {
        const groups = wrongCounts.get(event) || [];
        groups.push(r.contentGroup);
        wrongCounts.set(event, groups);
      }
    }

    const frequentlyWrong = [...wrongCounts.entries()]
      .filter(([_, groups]) => groups.length >= 1)
      .sort((a, b) => b[1].length - a[1].length);

    if (frequentlyWrong.length > 0) {
      suggestions.push(`\n## 잘못 예측된 이벤트 (제외 규칙 필요)`);
      for (const [event, groups] of frequentlyWrong) {
        suggestions.push(`- **${event}**: ${groups.join(', ')}에서 제외 필요`);
      }
    }

    // 3. 정확도가 낮은 컨텐츠 그룹 분석
    const lowAccuracyGroups = results
      .filter(r => r.accuracy < 90)
      .sort((a, b) => a.accuracy - b.accuracy);

    if (lowAccuracyGroups.length > 0) {
      suggestions.push(`\n## 정확도 개선 필요 컨텐츠 그룹`);
      for (const r of lowAccuracyGroups) {
        suggestions.push(`- **${r.contentGroup}** (${r.pageType}): ${r.accuracy.toFixed(1)}%`);
        if (r.wrong.length > 0) {
          suggestions.push(`  - 잘못된 예측: ${r.wrong.join(', ')}`);
        }
        if (r.missed.length > 0) {
          suggestions.push(`  - 누락: ${r.missed.join(', ')}`);
        }
      }
    }

    return suggestions;
  }

  /**
   * 설정 저장
   */
  saveConfig(): void {
    const configPath = this.getConfigPath();
    const data = {
      ...this.siteConfig,
      lastUpdated: new Date().toISOString(),
      contentGroupRules: Object.fromEntries(this.siteConfig.contentGroupRules),
      eventParameterPatterns: Object.fromEntries(this.siteConfig.eventParameterPatterns),
    };
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
    console.log(`   💾 학습 설정 저장됨: ${configPath}`);
  }

  /**
   * Edge Case JSON 파일 업데이트
   */
  updateEdgeCasesJson(): void {
    const edgeCasesPath = './config/edge-cases.json';
    let edgeCasesData: any = { schemaVersion: '1.0.0', sites: {} };

    if (fs.existsSync(edgeCasesPath)) {
      edgeCasesData = JSON.parse(fs.readFileSync(edgeCasesPath, 'utf-8'));
    }

    // 사이트 설정 가져오기 또는 생성
    if (!edgeCasesData.sites[this.propertyId]) {
      edgeCasesData.sites[this.propertyId] = {
        propertyId: this.propertyId,
        siteName: this.siteConfig.siteName || `Site ${this.propertyId}`,
        domain: '',
        edgeCases: [],
      };
    }

    const site = edgeCasesData.sites[this.propertyId];

    // 학습된 Edge Case 병합
    for (const learned of this.siteConfig.learnedEdgeCases) {
      const existing = site.edgeCases.find(
        (ec: any) => ec.eventName === learned.eventName && ec.type === learned.type
      );

      if (!existing) {
        site.edgeCases.push({
          eventName: learned.eventName,
          type: learned.type,
          description: learned.description,
          affectedPageTypes: learned.affectedContentGroups,
          confidence: learned.confidence,
          source: 'auto_learning',
          createdAt: learned.learnedAt.toISOString(),
        });
      }
    }

    fs.writeFileSync(edgeCasesPath, JSON.stringify(edgeCasesData, null, 2));
    console.log(`   📝 Edge Cases 업데이트됨: ${edgeCasesPath}`);
  }

  /**
   * Vision AI 힌트 마크다운 생성
   */
  generateVisionHintsMarkdown(): string {
    const lines: string[] = [];

    lines.push('# Vision AI 힌트 (자동 학습)\n');
    lines.push(`생성 시간: ${new Date().toISOString()}\n`);
    lines.push(`Property ID: ${this.propertyId}\n`);

    // 우선순위별 정렬
    const sortedHints = [...this.siteConfig.visionHints].sort((a, b) => b.priority - a.priority);

    // 전역 힌트
    const globalHints = sortedHints.filter(h => !h.contentGroup);
    if (globalHints.length > 0) {
      lines.push('## 🌐 전역 힌트\n');
      for (const hint of globalHints) {
        lines.push(`### ${hint.eventName} (우선순위: ${hint.priority})`);
        lines.push(`- ${hint.hint}`);
        if (hint.uiElements.length > 0) {
          lines.push(`- UI 요소: ${hint.uiElements.join(', ')}`);
        }
        lines.push('');
      }
    }

    // 컨텐츠 그룹별 힌트
    const groupedHints = new Map<string, VisionHint[]>();
    for (const hint of sortedHints.filter(h => h.contentGroup)) {
      const group = groupedHints.get(hint.contentGroup!) || [];
      group.push(hint);
      groupedHints.set(hint.contentGroup!, group);
    }

    if (groupedHints.size > 0) {
      lines.push('## 📂 컨텐츠 그룹별 힌트\n');
      for (const [contentGroup, hints] of groupedHints) {
        lines.push(`### ${contentGroup}\n`);
        for (const hint of hints) {
          lines.push(`#### ${hint.eventName}`);
          lines.push(`- ${hint.hint}`);
          lines.push('');
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * 컨텐츠 그룹별 상세 규칙 마크다운 생성
   */
  generateContentGroupRulesMarkdown(): string {
    const lines: string[] = [];

    lines.push('# 컨텐츠 그룹별 이벤트 규칙 (자동 학습)\n');
    lines.push(`생성 시간: ${new Date().toISOString()}\n`);

    for (const [contentGroup, rules] of this.siteConfig.contentGroupRules) {
      lines.push(`## ${contentGroup}\n`);
      lines.push(`정확도: ${rules.lastAccuracy.toFixed(1)}%\n`);

      if (rules.confirmedEvents.length > 0) {
        lines.push('### ✅ 확정 이벤트 (항상 예측)');
        for (const event of rules.confirmedEvents) {
          lines.push(`- ${event}`);
        }
        lines.push('');
      }

      if (rules.excludedEvents.length > 0) {
        lines.push('### ❌ 제외 이벤트 (예측 안 함)');
        for (const event of rules.excludedEvents) {
          lines.push(`- ${event}`);
        }
        lines.push('');
      }

      if (rules.conditionalEvents.length > 0) {
        lines.push('### ⚡ 조건부 이벤트');
        for (const cond of rules.conditionalEvents) {
          lines.push(`- ${cond.eventName}: ${cond.condition} (확률: ${(cond.probability * 100).toFixed(0)}%)`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * 학습 결과 전체 저장
   */
  saveAllLearningResults(): void {
    // 1. 학습 설정 저장
    this.saveConfig();

    // 2. Edge Cases JSON 업데이트
    this.updateEdgeCasesJson();

    // 3. Vision 힌트 마크다운 저장
    const hintsPath = path.join(this.configDir, `vision_hints_${this.propertyId}.md`);
    fs.writeFileSync(hintsPath, this.generateVisionHintsMarkdown());
    console.log(`   📝 Vision 힌트 저장됨: ${hintsPath}`);

    // 4. 컨텐츠 그룹 규칙 마크다운 저장
    const rulesPath = path.join(this.configDir, `content_group_rules_${this.propertyId}.md`);
    fs.writeFileSync(rulesPath, this.generateContentGroupRulesMarkdown());
    console.log(`   📝 컨텐츠 그룹 규칙 저장됨: ${rulesPath}`);
  }

  /**
   * 현재 설정 반환
   */
  getConfig(): SiteLearningConfig {
    return this.siteConfig;
  }
}

/**
 * 기본 AutoLearningFeedback 생성
 */
export function createAutoLearningFeedback(): AutoLearningFeedback | null {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) {
    console.error('❌ GA4_PROPERTY_ID 환경변수가 설정되지 않았습니다.');
    return null;
  }
  return new AutoLearningFeedback(propertyId);
}
