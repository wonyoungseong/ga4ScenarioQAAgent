/**
 * 파라미터 값 불일치 이슈 리포터
 *
 * 예측값과 실제값의 불일치를 감지하고 이슈를 리포팅합니다.
 * Level 3 정확도 향상을 위한 핵심 피드백 시스템입니다.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ParamValidationRule } from '../types/scenario';

/**
 * 불일치 이슈 심각도
 */
export type IssueSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

/**
 * 불일치 이슈 타입
 */
export type IssueType =
  | 'VALUE_MISMATCH'      // 예측값과 실제값 불일치
  | 'MISSING_VALUE'       // 예측했으나 실제 값 없음
  | 'UNEXPECTED_VALUE'    // 예측 안했으나 값 존재
  | 'TYPE_MISMATCH'       // 타입 불일치
  | 'FORMAT_MISMATCH';    // 포맷 불일치 (대소문자 등)

/**
 * 파라미터 불일치 이슈
 */
export interface ParameterMismatchIssue {
  id: string;
  timestamp: string;

  // 컨텍스트
  eventName: string;
  parameterName: string;
  pageUrl: string;
  pageType: string;

  // 불일치 정보
  issueType: IssueType;
  severity: IssueSeverity;

  // 값 비교
  predictedValue: string | number | null;
  actualValue: string | number | null;
  valueType: 'VERIFIABLE' | 'CONTENT_GROUP' | 'DYNAMIC';
  confidence: number;

  // 분석
  possibleCauses: string[];
  suggestedFix: string;

  // 메타데이터
  propertyId?: string;
  sessionId?: string;
}

/**
 * 이슈 리포트 요약
 */
export interface MismatchReportSummary {
  totalIssues: number;
  bySeverity: Record<IssueSeverity, number>;
  byIssueType: Record<IssueType, number>;
  byEvent: Record<string, number>;
  byParameter: Record<string, number>;

  // 정확도 영향
  level3AccuracyImpact: number;  // 예상 정확도 감소량

  // 권장 조치
  topRecommendations: string[];
}

/**
 * 이슈 리포트
 */
export interface ParameterMismatchReport {
  generatedAt: string;
  propertyId: string;
  summary: MismatchReportSummary;
  issues: ParameterMismatchIssue[];

  // 분석 결과
  patternAnalysis: {
    recurringIssues: Array<{
      pattern: string;
      count: number;
      events: string[];
    }>;
    highRiskParameters: string[];
    suggestedRuleUpdates: Array<{
      parameter: string;
      currentRule: string;
      suggestedRule: string;
    }>;
  };
}

/**
 * 파라미터 불일치 리포터
 */
export class ParameterMismatchReporter {
  private issues: ParameterMismatchIssue[] = [];
  private outputDir: string;
  private propertyId: string;

  constructor(outputDir: string = './output/issues', propertyId: string = 'unknown') {
    this.outputDir = outputDir;
    this.propertyId = propertyId;

    // 출력 디렉토리 생성
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * 파라미터 검증 결과와 실제 값 비교
   */
  compareAndReport(
    eventName: string,
    pageUrl: string,
    pageType: string,
    parameterValidations: ParamValidationRule[],
    actualValues: Record<string, string | number | null>,
    sessionId?: string
  ): ParameterMismatchIssue[] {
    const newIssues: ParameterMismatchIssue[] = [];

    for (const param of parameterValidations) {
      const prediction = param.valuePrediction;

      // 값 예측이 없거나 리포팅 비활성화면 스킵
      if (!prediction || !prediction.shouldReportMismatch) {
        continue;
      }

      const actualValue = actualValues[param.name];
      const predictedValue = prediction.predictedValue;

      // 불일치 감지
      const issue = this.detectMismatch(
        eventName,
        param.name,
        pageUrl,
        pageType,
        predictedValue,
        actualValue,
        prediction.valueType,
        prediction.confidence,
        sessionId
      );

      if (issue) {
        this.issues.push(issue);
        newIssues.push(issue);
      }
    }

    return newIssues;
  }

  /**
   * 불일치 감지
   */
  private detectMismatch(
    eventName: string,
    parameterName: string,
    pageUrl: string,
    pageType: string,
    predictedValue: string | number | null,
    actualValue: string | number | null,
    valueType: 'VERIFIABLE' | 'CONTENT_GROUP' | 'DYNAMIC',
    confidence: number,
    sessionId?: string
  ): ParameterMismatchIssue | null {
    // DYNAMIC 타입은 불일치 체크 안 함
    if (valueType === 'DYNAMIC') {
      return null;
    }

    // 둘 다 없으면 정상
    if (predictedValue === null && actualValue === null) {
      return null;
    }

    // 문자열 정규화
    const normalizedPredicted = this.normalizeValue(predictedValue);
    const normalizedActual = this.normalizeValue(actualValue);

    // 일치하면 정상
    if (normalizedPredicted === normalizedActual) {
      return null;
    }

    // 불일치 타입 결정
    let issueType: IssueType;
    if (predictedValue !== null && actualValue === null) {
      issueType = 'MISSING_VALUE';
    } else if (predictedValue === null && actualValue !== null) {
      issueType = 'UNEXPECTED_VALUE';
    } else if (typeof predictedValue !== typeof actualValue) {
      issueType = 'TYPE_MISMATCH';
    } else if (
      typeof predictedValue === 'string' &&
      typeof actualValue === 'string' &&
      predictedValue.toLowerCase() === actualValue.toLowerCase()
    ) {
      issueType = 'FORMAT_MISMATCH';
    } else {
      issueType = 'VALUE_MISMATCH';
    }

    // 심각도 결정
    const severity = this.determineSeverity(issueType, valueType, confidence);

    // 원인 분석
    const possibleCauses = this.analyzePossibleCauses(
      issueType,
      eventName,
      parameterName,
      predictedValue,
      actualValue,
      pageType
    );

    // 수정 제안
    const suggestedFix = this.suggestFix(
      issueType,
      parameterName,
      predictedValue,
      actualValue
    );

    return {
      id: `${eventName}_${parameterName}_${Date.now()}`,
      timestamp: new Date().toISOString(),
      eventName,
      parameterName,
      pageUrl,
      pageType,
      issueType,
      severity,
      predictedValue,
      actualValue,
      valueType,
      confidence,
      possibleCauses,
      suggestedFix,
      propertyId: this.propertyId,
      sessionId
    };
  }

  /**
   * 값 정규화
   */
  private normalizeValue(value: string | number | null): string {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value).trim().toLowerCase();
  }

  /**
   * 심각도 결정
   */
  private determineSeverity(
    issueType: IssueType,
    valueType: 'VERIFIABLE' | 'CONTENT_GROUP' | 'DYNAMIC',
    confidence: number
  ): IssueSeverity {
    // VERIFIABLE + 높은 신뢰도 = 심각한 문제
    if (valueType === 'VERIFIABLE' && confidence >= 90) {
      if (issueType === 'VALUE_MISMATCH' || issueType === 'MISSING_VALUE') {
        return 'CRITICAL';
      }
      return 'HIGH';
    }

    // VERIFIABLE + 중간 신뢰도
    if (valueType === 'VERIFIABLE' && confidence >= 70) {
      return 'HIGH';
    }

    // CONTENT_GROUP
    if (valueType === 'CONTENT_GROUP') {
      if (issueType === 'VALUE_MISMATCH') {
        return 'HIGH';
      }
      return 'MEDIUM';
    }

    // 포맷 불일치는 낮은 심각도
    if (issueType === 'FORMAT_MISMATCH') {
      return 'LOW';
    }

    return 'MEDIUM';
  }

  /**
   * 가능한 원인 분석
   */
  private analyzePossibleCauses(
    issueType: IssueType,
    eventName: string,
    parameterName: string,
    predictedValue: string | number | null,
    actualValue: string | number | null,
    pageType: string
  ): string[] {
    const causes: string[] = [];

    switch (issueType) {
      case 'VALUE_MISMATCH':
        causes.push(`예측 규칙이 ${pageType} 페이지 타입에 맞지 않을 수 있음`);
        causes.push(`${parameterName} 파라미터의 데이터 소스가 변경되었을 수 있음`);
        if (eventName.includes('view_') || eventName.includes('select_')) {
          causes.push('SPA 페이지 전환으로 인한 이전 데이터 잔존 가능성');
        }
        break;

      case 'MISSING_VALUE':
        causes.push(`${parameterName} 파라미터가 수집되지 않음`);
        causes.push('GTM 트리거 조건이 변경되었을 수 있음');
        causes.push('dataLayer push 타이밍 이슈 가능성');
        break;

      case 'UNEXPECTED_VALUE':
        causes.push(`예상하지 못한 ${parameterName} 값이 수집됨`);
        causes.push('새로운 파라미터 수집 로직이 추가되었을 수 있음');
        break;

      case 'TYPE_MISMATCH':
        causes.push('파라미터 타입이 변경됨 (문자열 ↔ 숫자)');
        causes.push('GTM 변수 설정 변경 가능성');
        break;

      case 'FORMAT_MISMATCH':
        causes.push('대소문자 처리 규칙 차이');
        causes.push('공백 또는 특수문자 처리 차이');
        break;
    }

    return causes;
  }

  /**
   * 수정 제안 생성
   */
  private suggestFix(
    issueType: IssueType,
    parameterName: string,
    predictedValue: string | number | null,
    actualValue: string | number | null
  ): string {
    switch (issueType) {
      case 'VALUE_MISMATCH':
        return `예측 규칙 수정 필요: Predicted "${predictedValue}" but actual was "${actualValue}"`;

      case 'MISSING_VALUE':
        return `${parameterName} 파라미터 수집 로직 확인 필요 (예상값: ${predictedValue})`;

      case 'UNEXPECTED_VALUE':
        return `${parameterName} 파라미터에 대한 예측 규칙 추가 필요 (실제값: ${actualValue})`;

      case 'TYPE_MISMATCH':
        return `타입 정규화 필요: ${typeof predictedValue} → ${typeof actualValue}`;

      case 'FORMAT_MISMATCH':
        return `대소문자 정규화 적용 권장: "${predictedValue}" → "${actualValue}"`;

      default:
        return '수동 검토 필요';
    }
  }

  /**
   * 리포트 생성
   */
  generateReport(): ParameterMismatchReport {
    const summary = this.generateSummary();
    const patternAnalysis = this.analyzePatterns();

    return {
      generatedAt: new Date().toISOString(),
      propertyId: this.propertyId,
      summary,
      issues: this.issues,
      patternAnalysis
    };
  }

  /**
   * 요약 생성
   */
  private generateSummary(): MismatchReportSummary {
    const bySeverity: Record<IssueSeverity, number> = {
      'CRITICAL': 0,
      'HIGH': 0,
      'MEDIUM': 0,
      'LOW': 0,
      'INFO': 0
    };

    const byIssueType: Record<IssueType, number> = {
      'VALUE_MISMATCH': 0,
      'MISSING_VALUE': 0,
      'UNEXPECTED_VALUE': 0,
      'TYPE_MISMATCH': 0,
      'FORMAT_MISMATCH': 0
    };

    const byEvent: Record<string, number> = {};
    const byParameter: Record<string, number> = {};

    for (const issue of this.issues) {
      bySeverity[issue.severity]++;
      byIssueType[issue.issueType]++;
      byEvent[issue.eventName] = (byEvent[issue.eventName] || 0) + 1;
      byParameter[issue.parameterName] = (byParameter[issue.parameterName] || 0) + 1;
    }

    // Level 3 정확도 영향 추정
    const verifiableIssues = this.issues.filter(i => i.valueType === 'VERIFIABLE');
    const level3AccuracyImpact = verifiableIssues.length > 0
      ? (verifiableIssues.length / this.issues.length) * 100
      : 0;

    // 상위 권장 조치
    const topRecommendations: string[] = [];

    if (bySeverity['CRITICAL'] > 0) {
      topRecommendations.push(`🚨 ${bySeverity['CRITICAL']}개의 Critical 이슈 즉시 확인 필요`);
    }

    const topParameter = Object.entries(byParameter)
      .sort((a, b) => b[1] - a[1])[0];
    if (topParameter && topParameter[1] > 2) {
      topRecommendations.push(`📝 ${topParameter[0]} 파라미터 예측 규칙 검토 필요 (${topParameter[1]}건)`);
    }

    const topEvent = Object.entries(byEvent)
      .sort((a, b) => b[1] - a[1])[0];
    if (topEvent && topEvent[1] > 2) {
      topRecommendations.push(`📊 ${topEvent[0]} 이벤트 전체 검토 권장 (${topEvent[1]}건)`);
    }

    return {
      totalIssues: this.issues.length,
      bySeverity,
      byIssueType,
      byEvent,
      byParameter,
      level3AccuracyImpact,
      topRecommendations
    };
  }

  /**
   * 패턴 분석
   */
  private analyzePatterns(): ParameterMismatchReport['patternAnalysis'] {
    const recurringPatterns = new Map<string, { count: number; events: Set<string> }>();
    const highRiskParams = new Set<string>();

    for (const issue of this.issues) {
      // 반복 패턴 찾기
      const patternKey = `${issue.parameterName}:${issue.issueType}`;
      if (!recurringPatterns.has(patternKey)) {
        recurringPatterns.set(patternKey, { count: 0, events: new Set() });
      }
      const pattern = recurringPatterns.get(patternKey)!;
      pattern.count++;
      pattern.events.add(issue.eventName);

      // 고위험 파라미터 식별
      if (issue.severity === 'CRITICAL' || issue.severity === 'HIGH') {
        highRiskParams.add(issue.parameterName);
      }
    }

    // 반복 이슈 정리
    const recurringIssues = Array.from(recurringPatterns.entries())
      .filter(([_, data]) => data.count >= 2)
      .map(([pattern, data]) => ({
        pattern,
        count: data.count,
        events: Array.from(data.events)
      }))
      .sort((a, b) => b.count - a.count);

    // 규칙 업데이트 제안
    const suggestedRuleUpdates = this.issues
      .filter(i => i.issueType === 'VALUE_MISMATCH' && i.valueType === 'VERIFIABLE')
      .map(i => ({
        parameter: i.parameterName,
        currentRule: `Predicted: ${i.predictedValue}`,
        suggestedRule: `Actual pattern: ${i.actualValue}`
      }));

    return {
      recurringIssues,
      highRiskParameters: Array.from(highRiskParams),
      suggestedRuleUpdates
    };
  }

  /**
   * 리포트 저장 (Markdown)
   */
  saveAsMarkdown(filename?: string): string {
    const report = this.generateReport();
    const filePath = path.join(
      this.outputDir,
      filename || `parameter_issues_${Date.now()}.md`
    );

    const lines: string[] = [];
    lines.push('# 파라미터 불일치 이슈 리포트\n');
    lines.push(`생성 시간: ${report.generatedAt}\n`);
    lines.push(`Property ID: ${report.propertyId}\n`);

    // 요약
    lines.push('## 요약\n');
    lines.push(`- **총 이슈 수**: ${report.summary.totalIssues}개`);
    lines.push(`- **Critical**: ${report.summary.bySeverity['CRITICAL']}개`);
    lines.push(`- **High**: ${report.summary.bySeverity['HIGH']}개`);
    lines.push(`- **Medium**: ${report.summary.bySeverity['MEDIUM']}개`);
    lines.push(`- **Low**: ${report.summary.bySeverity['LOW']}개`);
    lines.push(`- **Level 3 정확도 영향**: ${report.summary.level3AccuracyImpact.toFixed(1)}%\n`);

    // 권장 조치
    if (report.summary.topRecommendations.length > 0) {
      lines.push('## 권장 조치\n');
      for (const rec of report.summary.topRecommendations) {
        lines.push(`- ${rec}`);
      }
      lines.push('');
    }

    // Critical/High 이슈 상세
    const criticalIssues = report.issues.filter(
      i => i.severity === 'CRITICAL' || i.severity === 'HIGH'
    );
    if (criticalIssues.length > 0) {
      lines.push('## Critical/High 이슈 상세\n');
      for (const issue of criticalIssues) {
        lines.push(`### ${issue.eventName} - ${issue.parameterName}\n`);
        lines.push(`- **타입**: ${issue.issueType}`);
        lines.push(`- **심각도**: ${issue.severity}`);
        lines.push(`- **예측값**: \`${issue.predictedValue}\``);
        lines.push(`- **실제값**: \`${issue.actualValue}\``);
        lines.push(`- **페이지 타입**: ${issue.pageType}`);
        lines.push(`- **수정 제안**: ${issue.suggestedFix}`);
        lines.push('');
      }
    }

    // 패턴 분석
    if (report.patternAnalysis.recurringIssues.length > 0) {
      lines.push('## 반복 패턴\n');
      lines.push('| 패턴 | 발생 횟수 | 관련 이벤트 |');
      lines.push('|------|----------|------------|');
      for (const pattern of report.patternAnalysis.recurringIssues) {
        lines.push(`| ${pattern.pattern} | ${pattern.count} | ${pattern.events.join(', ')} |`);
      }
      lines.push('');
    }

    const content = lines.join('\n');
    fs.writeFileSync(filePath, content, 'utf-8');

    return filePath;
  }

  /**
   * 리포트 저장 (JSON)
   */
  saveAsJson(filename?: string): string {
    const report = this.generateReport();
    const filePath = path.join(
      this.outputDir,
      filename || `parameter_issues_${Date.now()}.json`
    );

    fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');

    return filePath;
  }

  /**
   * 이슈 목록 반환
   */
  getIssues(): ParameterMismatchIssue[] {
    return this.issues;
  }

  /**
   * 이슈 초기화
   */
  clearIssues(): void {
    this.issues = [];
  }

  /**
   * 콘솔에 요약 출력
   */
  printSummary(): void {
    const report = this.generateReport();

    console.log('\n' + '='.repeat(60));
    console.log('📊 파라미터 불일치 이슈 요약');
    console.log('='.repeat(60));
    console.log(`총 이슈: ${report.summary.totalIssues}개`);
    console.log(`  🚨 Critical: ${report.summary.bySeverity['CRITICAL']}개`);
    console.log(`  ⚠️  High: ${report.summary.bySeverity['HIGH']}개`);
    console.log(`  📝 Medium: ${report.summary.bySeverity['MEDIUM']}개`);
    console.log(`  ℹ️  Low: ${report.summary.bySeverity['LOW']}개`);

    if (report.summary.topRecommendations.length > 0) {
      console.log('\n📌 권장 조치:');
      for (const rec of report.summary.topRecommendations) {
        console.log(`   ${rec}`);
      }
    }

    console.log('='.repeat(60) + '\n');
  }
}
