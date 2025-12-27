/**
 * Report Generator Types
 */

import { TestReport, ReportFormat, ChartData, ContentGroup } from '../branch/types';
import { OrchestratorProgress } from '../orchestrator/types';

/**
 * 리포트 생성 결과
 */
export interface GeneratedReport {
  format: ReportFormat;
  filePath: string;
  content: string;
  generatedAt: Date;
  sizeBytes: number;
}

/**
 * 리포트 생성 결과 (전체)
 */
export interface GeneratedReports {
  reports: GeneratedReport[];
  outputDir: string;
  totalFiles: number;
}

/**
 * 콘솔 출력 스타일
 */
export interface ConsoleStyle {
  useColors: boolean;
  showProgressBar: boolean;
  showTimestamps: boolean;
  verbose: boolean;
}

/**
 * Markdown 리포트 옵션
 */
export interface MarkdownOptions {
  includeTableOfContents: boolean;
  includeSummaryTable: boolean;
  includeDetailedResults: boolean;
  includeIssuesList: boolean;
  maxIssuesPerEvent: number;
}

/**
 * JSON 리포트 옵션
 */
export interface JsonOptions {
  prettyPrint: boolean;
  includeMetadata: boolean;
  includeRawData: boolean;
}

/**
 * HTML 대시보드 옵션
 */
export interface HtmlOptions {
  includeCharts: boolean;
  includeInteractiveFilters: boolean;
  embedStyles: boolean;
  chartLibrary: 'chartjs' | 'plotly' | 'none';
}

/**
 * 리포트 생성기 설정
 */
export interface ReportGeneratorConfig {
  outputDir: string;
  formats: ReportFormat[];
  consoleStyle?: Partial<ConsoleStyle>;
  markdownOptions?: Partial<MarkdownOptions>;
  jsonOptions?: Partial<JsonOptions>;
  htmlOptions?: Partial<HtmlOptions>;
}

/**
 * 기본 설정
 */
export const DEFAULT_CONSOLE_STYLE: ConsoleStyle = {
  useColors: true,
  showProgressBar: true,
  showTimestamps: true,
  verbose: false
};

export const DEFAULT_MARKDOWN_OPTIONS: MarkdownOptions = {
  includeTableOfContents: true,
  includeSummaryTable: true,
  includeDetailedResults: true,
  includeIssuesList: true,
  maxIssuesPerEvent: 10
};

export const DEFAULT_JSON_OPTIONS: JsonOptions = {
  prettyPrint: true,
  includeMetadata: true,
  includeRawData: true  // 파라미터 값 포함
};

export const DEFAULT_HTML_OPTIONS: HtmlOptions = {
  includeCharts: true,
  includeInteractiveFilters: false,
  embedStyles: true,
  chartLibrary: 'chartjs'
};

/**
 * 진행 바 데이터
 */
export interface ProgressBarData {
  label: string;
  current: number;
  total: number;
  percent: number;
  elapsed: string;
  remaining: string;
}

/**
 * 색상 코드
 */
export const CONSOLE_COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  // 전경색
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  // 배경색
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m'
};

/**
 * 아이콘
 */
export const ICONS = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
  progress: '🔄',
  branch: '📂',
  event: '📊',
  parameter: '📝',
  time: '⏱️',
  chart: '📈'
};
