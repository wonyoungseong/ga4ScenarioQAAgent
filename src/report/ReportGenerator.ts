/**
 * Report Generator
 *
 * 테스트 결과를 다양한 형식으로 출력합니다.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  ReportGeneratorConfig,
  GeneratedReport,
  GeneratedReports,
  ConsoleStyle,
  MarkdownOptions,
  JsonOptions,
  HtmlOptions,
  DEFAULT_CONSOLE_STYLE,
  DEFAULT_MARKDOWN_OPTIONS,
  DEFAULT_JSON_OPTIONS,
  DEFAULT_HTML_OPTIONS,
  ProgressBarData,
  CONSOLE_COLORS,
  ICONS
} from './types';
import {
  TestReport,
  ReportFormat,
  BranchTestResult,
  ContentGroup,
  ComparisonIssue
} from '../branch/types';
import { OrchestratorProgress, ProgressEvent } from '../orchestrator/types';

/**
 * Report Generator 클래스
 */
export class ReportGenerator {
  private config: ReportGeneratorConfig;
  private consoleStyle: ConsoleStyle;
  private markdownOptions: MarkdownOptions;
  private jsonOptions: JsonOptions;
  private htmlOptions: HtmlOptions;

  constructor(config: ReportGeneratorConfig) {
    this.config = config;
    this.consoleStyle = { ...DEFAULT_CONSOLE_STYLE, ...config.consoleStyle };
    this.markdownOptions = { ...DEFAULT_MARKDOWN_OPTIONS, ...config.markdownOptions };
    this.jsonOptions = { ...DEFAULT_JSON_OPTIONS, ...config.jsonOptions };
    this.htmlOptions = { ...DEFAULT_HTML_OPTIONS, ...config.htmlOptions };

    // 출력 디렉토리 생성
    if (!fs.existsSync(config.outputDir)) {
      fs.mkdirSync(config.outputDir, { recursive: true });
    }
  }

  /**
   * 모든 형식으로 리포트 생성
   */
  async generateReports(report: TestReport): Promise<GeneratedReports> {
    const results: GeneratedReport[] = [];

    for (const format of this.config.formats) {
      const result = await this.generateReport(report, format);
      results.push(result);
    }

    return {
      reports: results,
      outputDir: this.config.outputDir,
      totalFiles: results.length
    };
  }

  /**
   * 특정 형식으로 리포트 생성
   */
  async generateReport(report: TestReport, format: ReportFormat): Promise<GeneratedReport> {
    let content: string;
    let extension: string;

    switch (format) {
      case 'markdown':
        content = this.generateMarkdown(report);
        extension = 'md';
        break;
      case 'json':
        content = this.generateJson(report);
        extension = 'json';
        break;
      case 'html':
        content = this.generateHtml(report);
        extension = 'html';
        break;
      case 'console':
        content = this.generateConsoleOutput(report);
        console.log(content);
        extension = 'txt';
        break;
      default:
        throw new Error(`Unknown format: ${format}`);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `report_${timestamp}.${extension}`;
    const filePath = path.join(this.config.outputDir, fileName);

    fs.writeFileSync(filePath, content);

    return {
      format,
      filePath,
      content,
      generatedAt: new Date(),
      sizeBytes: Buffer.byteLength(content)
    };
  }

  /**
   * 실시간 진행 상황 출력
   */
  streamProgress(progress: OrchestratorProgress): void {
    if (!this.consoleStyle.showProgressBar) return;

    const bar = this.createProgressBar({
      label: progress.currentPhase,
      current: progress.completedTasks,
      total: progress.totalTasks,
      percent: progress.progressPercent,
      elapsed: this.formatTime(progress.elapsedTime),
      remaining: this.formatTime(progress.estimatedRemainingTime)
    });

    // 커서를 줄 시작으로 이동하고 덮어쓰기
    process.stdout.write(`\r${bar}`);
  }

  /**
   * 진행 이벤트 출력
   */
  logProgressEvent(event: ProgressEvent): void {
    const timestamp = this.consoleStyle.showTimestamps
      ? `[${event.timestamp.toLocaleTimeString()}] `
      : '';

    let icon = '';
    let color = '';

    switch (event.type) {
      case 'started':
        icon = ICONS.progress;
        color = CONSOLE_COLORS.cyan;
        break;
      case 'branch_completed':
        icon = ICONS.success;
        color = CONSOLE_COLORS.green;
        break;
      case 'branch_failed':
        icon = ICONS.error;
        color = CONSOLE_COLORS.red;
        break;
      case 'task_completed':
        icon = ICONS.success;
        color = CONSOLE_COLORS.green;
        break;
      case 'task_failed':
        icon = ICONS.error;
        color = CONSOLE_COLORS.red;
        break;
      default:
        icon = ICONS.info;
        color = CONSOLE_COLORS.white;
    }

    const message = this.consoleStyle.useColors
      ? `${color}${icon} ${timestamp}${event.message}${CONSOLE_COLORS.reset}`
      : `${icon} ${timestamp}${event.message}`;

    console.log(message);
  }

  /**
   * Markdown 리포트 생성
   */
  private generateMarkdown(report: TestReport): string {
    const lines: string[] = [];

    // 헤더
    lines.push('# Multi-Branch Test Report');
    lines.push('');
    lines.push(`Generated: ${report.metadata.generatedAt.toLocaleString()}`);
    lines.push(`GA4 Property: ${report.metadata.ga4PropertyId}`);
    lines.push(`Date Range: ${report.metadata.dateRange.startDate} ~ ${report.metadata.dateRange.endDate}`);
    lines.push(`Duration: ${this.formatTime(report.metadata.totalDurationMs / 1000)}`);
    lines.push('');

    // 목차
    if (this.markdownOptions.includeTableOfContents) {
      lines.push('## Table of Contents');
      lines.push('');
      lines.push('- [Summary](#summary)');
      lines.push('- [Branch Results](#branch-results)');
      lines.push('- [Issues](#issues)');
      lines.push('');
    }

    // 요약
    lines.push('## Summary');
    lines.push('');
    lines.push(`- **Overall Accuracy**: ${report.summary.overallAccuracy.toFixed(1)}%`);
    lines.push(`- **Total Events**: ${report.summary.totalEvents}`);
    lines.push(`- **Completed Branches**: ${report.summary.byStatus.completed}/${report.metadata.branchCount}`);
    lines.push(`- **Failed Branches**: ${report.summary.byStatus.failed}`);
    lines.push('');

    // 요약 테이블
    if (this.markdownOptions.includeSummaryTable) {
      lines.push('### Accuracy by Branch');
      lines.push('');
      lines.push('| Content Group | Accuracy | Status |');
      lines.push('|---------------|----------|--------|');

      for (const branch of report.branches) {
        const accuracy = report.summary.branchAccuracies[branch.contentGroup] || 0;
        const statusIcon = branch.status === 'completed' ? ICONS.success :
                          branch.status === 'failed' ? ICONS.error : '⏳';
        lines.push(`| ${branch.contentGroup} | ${accuracy.toFixed(1)}% | ${statusIcon} ${branch.status} |`);
      }
      lines.push('');
    }

    // Branch 상세 결과
    if (this.markdownOptions.includeDetailedResults) {
      lines.push('## Branch Results');
      lines.push('');

      for (const branch of report.branches) {
        lines.push(`### ${branch.contentGroup}`);
        lines.push('');
        lines.push(`- Status: ${branch.status}`);
        lines.push(`- URLs Tested: ${branch.testedUrls.length}`);
        lines.push(`- Events: ${branch.events.length}`);
        lines.push(`- Duration: ${branch.durationMs ? this.formatTime(branch.durationMs / 1000) : 'N/A'}`);
        lines.push('');

        if (branch.events.length > 0) {
          lines.push('#### Events');
          lines.push('');
          for (const event of branch.events) {
            lines.push(`- **${event.eventName}**`);
            lines.push(`  - Predicted: ${event.predictedParams.length} params`);
            lines.push(`  - Actual: ${event.actualParams.length} params`);
            lines.push(`  - Spec: ${event.specParams.length} params`);
          }
          lines.push('');
        }
      }
    }

    // 이슈 목록
    if (this.markdownOptions.includeIssuesList && report.summary.topIssues.length > 0) {
      lines.push('## Issues');
      lines.push('');

      const grouped = this.groupIssuesBySeverity(report.summary.topIssues);

      if (grouped.critical.length > 0) {
        lines.push('### Critical');
        for (const issue of grouped.critical.slice(0, this.markdownOptions.maxIssuesPerEvent)) {
          lines.push(`- ${ICONS.error} **${issue.parameter}** (${issue.eventName}): ${issue.message}`);
        }
        lines.push('');
      }

      if (grouped.warning.length > 0) {
        lines.push('### Warnings');
        for (const issue of grouped.warning.slice(0, this.markdownOptions.maxIssuesPerEvent)) {
          lines.push(`- ${ICONS.warning} **${issue.parameter}** (${issue.eventName}): ${issue.message}`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * JSON 리포트 생성
   */
  private generateJson(report: TestReport): string {
    const output: any = {
      metadata: report.metadata,
      summary: {
        ...report.summary,
        branchAccuracies: Object.fromEntries(
          Object.entries(report.summary.branchAccuracies)
        )
      }
    };

    if (this.jsonOptions.includeRawData) {
      output.branches = report.branches;
    } else {
      // 간소화된 버전
      output.branches = report.branches.map(b => ({
        branchId: b.branchId,
        contentGroup: b.contentGroup,
        status: b.status,
        testedUrls: b.testedUrls.length,
        events: b.events.length,
        errors: b.errors.length
      }));
    }

    return this.jsonOptions.prettyPrint
      ? JSON.stringify(output, null, 2)
      : JSON.stringify(output);
  }

  /**
   * HTML 대시보드 생성
   */
  private generateHtml(report: TestReport): string {
    const chartScripts = this.htmlOptions.includeCharts
      ? '<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>'
      : '';

    const styles = this.htmlOptions.embedStyles
      ? this.getEmbeddedStyles()
      : '<link rel="stylesheet" href="styles.css">';

    const accuracyData = Object.entries(report.summary.branchAccuracies)
      .map(([k, v]) => ({ label: k, value: v }));

    const chartScript = this.htmlOptions.includeCharts
      ? this.generateChartScript(accuracyData)
      : '';

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Report - ${report.metadata.generatedAt.toLocaleDateString()}</title>
  ${chartScripts}
  ${styles}
</head>
<body>
  <div class="container">
    <header>
      <h1>Multi-Branch Test Report</h1>
      <p class="subtitle">Generated: ${report.metadata.generatedAt.toLocaleString()}</p>
    </header>

    <section class="summary">
      <h2>Summary</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${report.summary.overallAccuracy.toFixed(1)}%</div>
          <div class="stat-label">Overall Accuracy</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${report.metadata.branchCount}</div>
          <div class="stat-label">Branches Tested</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${report.summary.totalEvents}</div>
          <div class="stat-label">Events Analyzed</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${this.formatTime(report.metadata.totalDurationMs / 1000)}</div>
          <div class="stat-label">Duration</div>
        </div>
      </div>
    </section>

    ${this.htmlOptions.includeCharts ? `
    <section class="charts">
      <h2>Accuracy by Branch</h2>
      <canvas id="accuracyChart" width="400" height="200"></canvas>
    </section>
    ` : ''}

    <section class="branches">
      <h2>Branch Results</h2>
      <table>
        <thead>
          <tr>
            <th>Content Group</th>
            <th>Status</th>
            <th>URLs</th>
            <th>Events</th>
            <th>Accuracy</th>
          </tr>
        </thead>
        <tbody>
          ${report.branches.map(b => `
          <tr class="status-${b.status}">
            <td>${b.contentGroup}</td>
            <td><span class="status-badge">${b.status}</span></td>
            <td>${b.testedUrls.length}</td>
            <td>${b.events.length}</td>
            <td>${(report.summary.branchAccuracies[b.contentGroup] || 0).toFixed(1)}%</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </section>

    <footer>
      <p>GA4 Property: ${report.metadata.ga4PropertyId}</p>
      <p>Date Range: ${report.metadata.dateRange.startDate} ~ ${report.metadata.dateRange.endDate}</p>
    </footer>
  </div>

  ${chartScript}
</body>
</html>`;
  }

  /**
   * 콘솔 출력 생성
   */
  private generateConsoleOutput(report: TestReport): string {
    const lines: string[] = [];
    const c = this.consoleStyle.useColors ? CONSOLE_COLORS : { reset: '', bright: '', green: '', red: '', yellow: '', cyan: '' };

    lines.push('');
    lines.push(`${c.bright}${'='.repeat(60)}${c.reset}`);
    lines.push(`${c.bright}${c.cyan}  Multi-Branch Test Report${c.reset}`);
    lines.push(`${c.bright}${'='.repeat(60)}${c.reset}`);
    lines.push('');

    lines.push(`${ICONS.time} Generated: ${report.metadata.generatedAt.toLocaleString()}`);
    lines.push(`${ICONS.chart} Property: ${report.metadata.ga4PropertyId}`);
    lines.push('');

    lines.push(`${c.bright}Summary:${c.reset}`);
    lines.push(`  Overall Accuracy: ${c.bright}${report.summary.overallAccuracy.toFixed(1)}%${c.reset}`);
    lines.push(`  Branches: ${report.summary.byStatus.completed}/${report.metadata.branchCount} completed`);
    lines.push(`  Events: ${report.summary.totalEvents}`);
    lines.push(`  Duration: ${this.formatTime(report.metadata.totalDurationMs / 1000)}`);
    lines.push('');

    lines.push(`${c.bright}Branch Results:${c.reset}`);
    for (const branch of report.branches) {
      const accuracy = report.summary.branchAccuracies[branch.contentGroup] || 0;
      const icon = branch.status === 'completed' ? ICONS.success :
                   branch.status === 'failed' ? ICONS.error : '⏳';
      const color = branch.status === 'completed' ? c.green :
                    branch.status === 'failed' ? c.red : c.yellow;

      lines.push(`  ${icon} ${color}${branch.contentGroup}${c.reset}: ${accuracy.toFixed(1)}% (${branch.events.length} events)`);
    }
    lines.push('');

    lines.push(`${'='.repeat(60)}`);

    return lines.join('\n');
  }

  /**
   * 진행 바 생성
   */
  private createProgressBar(data: ProgressBarData): string {
    const width = 30;
    const filled = Math.round((data.percent / 100) * width);
    const empty = width - filled;

    const bar = `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
    const percent = `${data.percent.toString().padStart(3)}%`;
    const counts = `${data.current}/${data.total}`;

    return `${data.label} ${bar} ${percent} (${counts}) [${data.elapsed} / ~${data.remaining}]`;
  }

  /**
   * 시간 포맷
   */
  private formatTime(seconds: number): string {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  }

  /**
   * 이슈 심각도별 그룹화
   */
  private groupIssuesBySeverity(issues: ComparisonIssue[]): {
    critical: ComparisonIssue[];
    warning: ComparisonIssue[];
    info: ComparisonIssue[];
  } {
    return {
      critical: issues.filter(i => i.severity === 'critical'),
      warning: issues.filter(i => i.severity === 'warning'),
      info: issues.filter(i => i.severity === 'info')
    };
  }

  /**
   * 임베디드 스타일
   */
  private getEmbeddedStyles(): string {
    return `<style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
      .container { max-width: 1200px; margin: 0 auto; }
      header { background: #1a1a2e; color: white; padding: 30px; border-radius: 8px; margin-bottom: 20px; }
      header h1 { margin: 0 0 10px 0; }
      .subtitle { opacity: 0.8; }
      section { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
      h2 { color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px; }
      .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
      .stat-card { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
      .stat-value { font-size: 2em; font-weight: bold; color: #1a1a2e; }
      .stat-label { color: #666; margin-top: 5px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
      th { background: #f8f9fa; font-weight: 600; }
      .status-badge { padding: 4px 8px; border-radius: 4px; font-size: 0.85em; }
      .status-completed .status-badge { background: #d4edda; color: #155724; }
      .status-failed .status-badge { background: #f8d7da; color: #721c24; }
      .status-pending .status-badge { background: #fff3cd; color: #856404; }
      footer { text-align: center; color: #666; padding: 20px; }
    </style>`;
  }

  /**
   * Chart.js 스크립트 생성
   */
  private generateChartScript(data: { label: string; value: number }[]): string {
    return `<script>
      document.addEventListener('DOMContentLoaded', function() {
        const ctx = document.getElementById('accuracyChart').getContext('2d');
        new Chart(ctx, {
          type: 'bar',
          data: {
            labels: ${JSON.stringify(data.map(d => d.label))},
            datasets: [{
              label: 'Accuracy (%)',
              data: ${JSON.stringify(data.map(d => d.value))},
              backgroundColor: 'rgba(54, 162, 235, 0.5)',
              borderColor: 'rgba(54, 162, 235, 1)',
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            scales: {
              y: { beginAtZero: true, max: 100 }
            }
          }
        });
      });
    </script>`;
  }
}
