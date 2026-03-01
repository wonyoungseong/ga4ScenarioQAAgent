/**
 * Event Reporter - 2차 QA 이벤트 검수 결과 리포트
 *
 * 콘솔 리포트 (시나리오 기반 + 이벤트 기반) + JSON 리포트 + Excel 리포트
 */

import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import type {
  EventValidationResult,
  EventValidationStatus,
  ScenarioResult,
} from '../../types/event-validation-result';
import type { KnowledgeReadinessReport } from '../../types/knowledge-state';
import type { CustomEventObservationReport } from '../../types/custom-event-observation';

// ─────────────────────────────────────────────────────────────────────
// Status Icons
// ─────────────────────────────────────────────────────────────────────

function statusIcon(status: string): string {
  switch (status) {
    case 'PASS': return '✅';
    case 'FAIL': return '❌';
    case 'MISSING': return '❌';
    case 'EXTRA': return '⚠️';
    case 'SKIP': return '⏭️';
    case 'PARTIAL': return '⚠️';
    case 'ERROR': return '💥';
    default: return '❓';
  }
}

// ─────────────────────────────────────────────────────────────────────
// Console Report
// ─────────────────────────────────────────────────────────────────────

export function printEventReport(result: EventValidationResult): void {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  2차 QA: 이벤트 검수 결과                                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Group scenarios by URL
  const urlMap = new Map<string, ScenarioResult[]>();
  for (const sr of result.scenario_results) {
    if (!urlMap.has(sr.validated_url)) urlMap.set(sr.validated_url, []);
    urlMap.get(sr.validated_url)!.push(sr);
  }

  for (const [url, scenarios] of urlMap) {
    const pageType = scenarios[0]?.page_type || 'UNKNOWN';
    console.log(`[${pageType}] ${url}`);

    for (const scenario of scenarios) {
      if (scenario.user_action_performed) {
        console.log(`  action: ${scenario.user_action_performed.action_type}${scenario.user_action_performed.target_selector ? ` (${scenario.user_action_performed.target_selector.substring(0, 40)})` : ''}`);
        if (!scenario.user_action_performed.success) {
          console.log(`    ${statusIcon('ERROR')} 액션 실패: ${scenario.user_action_performed.error_message || 'unknown'}`);
        }
      } else {
        console.log('  auto_fire:');
      }

      for (const er of scenario.event_results) {
        const icon = statusIcon(er.status);
        const timing = er.fired_at_ms ? `(${er.fired_at_ms}ms)` : '';
        const params = er.captured_params_count !== undefined ? `params: ${er.captured_params_count}` : '';
        const suffix = [timing, params].filter(Boolean).join('  ');

        if (er.expected_to_fire) {
          if (er.status === 'PASS') {
            console.log(`    ${icon} ${er.event_name.padEnd(25)} ${suffix}`);
          } else if (er.status === 'MISSING') {
            console.log(`    ${icon} ${er.event_name.padEnd(25)} MISSING`);
          } else {
            console.log(`    ${icon} ${er.event_name.padEnd(25)} ${er.status}`);
          }
        } else {
          // Forbidden event check
          if (er.fired) {
            console.log(`    ${icon} ${er.event_name.padEnd(25)} FORBIDDEN but fired!`);
          } else {
            console.log(`    ${icon} ${er.event_name.padEnd(25)} not fired (OK)`);
          }
        }
      }

      if (scenario.error_message) {
        console.log(`    💥 Error: ${scenario.error_message}`);
      }
    }

    console.log('');
  }

  // Summary
  const s = result.summary;
  console.log('─'.repeat(64));
  console.log(`Score: ${s.overall_score}/100 | PASS: ${s.passed_events} | FAIL: ${s.failed_events} | MISSING: ${s.missing_events} | EXTRA: ${s.extra_events}`);
  console.log(`시나리오: ${s.passed_scenarios}/${s.total_scenarios} 통과 (${s.scenario_pass_rate}%)`);
  console.log(`이벤트:   ${s.passed_events}/${s.total_events} 통과 (${s.event_pass_rate}%)`);
  console.log('');

  // Critical Issues
  if (result.critical_issues.length > 0) {
    console.log('⚠️  Critical Issues:');
    for (const issue of result.critical_issues) {
      console.log(`  [${issue.severity}] ${issue.description}`);
      console.log(`    → ${issue.fix_recommendation}`);
      console.log(`    URL: ${issue.found_at_url}`);
    }
    console.log('');
  }

  // Page Type Summary
  if (result.summary_by_page_type.length > 0) {
    console.log('페이지 타입별 요약:');
    for (const pt of result.summary_by_page_type) {
      const bar = pt.pass_rate >= 80 ? '✅' : pt.pass_rate >= 50 ? '⚠️' : '❌';
      console.log(`  ${bar} ${pt.page_type.padEnd(20)} ${pt.passed_scenarios}/${pt.total_scenarios} (${pt.pass_rate}%)`);
      if (pt.most_failed_events.length > 0) {
        console.log(`     실패 이벤트: ${pt.most_failed_events.join(', ')}`);
      }
    }
    console.log('');
  }
}

// ─────────────────────────────────────────────────────────────────────
// Knowledge Readiness Section
// ─────────────────────────────────────────────────────────────────────

/**
 * Knowledge Readiness 섹션을 콘솔에 출력합니다.
 */
export function printKnowledgeReadinessSection(report: KnowledgeReadinessReport): void {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Knowledge Readiness Summary                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  const s = report.summary;
  console.log(`  전체 이벤트:      ${s.total_events}개`);
  console.log(`  테스트 가능:      ${s.ready_count}개 (${s.total_events > 0 ? Math.round((s.ready_count / s.total_events) * 100) : 0}%)`);
  console.log(`  Recon 필요:       ${s.needs_recon_count}개`);
  console.log(`  테스터 확인 필요: ${s.needs_tester_count}개`);
  console.log(`  수동 검증 필요:   ${s.manual_only_count}개`);
  console.log(`  준비율:           ${s.readiness_rate.toFixed(1)}%`);
  console.log('');

  // 우선 갭 목록 (최대 5개)
  if (report.prioritized_gaps.length > 0) {
    console.log('  우선 해결 갭:');
    const topGaps = report.prioritized_gaps.slice(0, 5);
    for (const gap of topGaps) {
      const icon = gap.resolution_method === 'crawlable' ? '🔍'
        : gap.resolution_method === 'visual_analysis' ? '👁️'
        : gap.resolution_method === 'ask_tester' ? '❓'
        : 'ℹ️';
      console.log(`    ${icon} [${gap.event_name}] ${gap.gap_type} → ${gap.resolution_method}`);
      if (gap.suggested_action) {
        console.log(`       ${gap.suggested_action}`);
      }
    }
    console.log('');
  }

  // 테스터 질문 (있으면)
  if (report.tester_questions.length > 0) {
    console.log('  테스터에게 물어볼 질문:');
    for (const q of report.tester_questions.slice(0, 3)) {
      console.log(`    ❓ [${q.event_name}] ${q.question}`);
    }
    console.log('');
  }
}

// ─────────────────────────────────────────────────────────────────────
// JSON Report
// ─────────────────────────────────────────────────────────────────────

export function saveEventJsonReport(
  result: EventValidationResult,
  outputDir: string,
  customEventReport?: CustomEventObservationReport,
): string {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const fileName = `event-qa-result_${timestamp}.json`;
  const filePath = path.join(outputDir, fileName);

  const output = customEventReport
    ? { ...result, custom_event_observation: customEventReport }
    : result;
  fs.writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf-8');
  return filePath;
}

// ─────────────────────────────────────────────────────────────────────
// Event-Based Console Report (이벤트 중심 리포트)
// ─────────────────────────────────────────────────────────────────────

/** 이벤트별 집계 데이터 */
interface EventAggregation {
  event_name: string;
  total: number;
  pass: number;
  fail: number;
  missing: number;
  extra: number;
  skip: number;
  urls: Map<string, { status: EventValidationStatus; page_type: string }>;
}

function aggregateByEvent(result: EventValidationResult): EventAggregation[] {
  const eventMap = new Map<string, EventAggregation>();

  for (const sr of result.scenario_results) {
    for (const er of sr.event_results) {
      if (!eventMap.has(er.event_name)) {
        eventMap.set(er.event_name, {
          event_name: er.event_name,
          total: 0,
          pass: 0,
          fail: 0,
          missing: 0,
          extra: 0,
          skip: 0,
          urls: new Map(),
        });
      }
      const agg = eventMap.get(er.event_name)!;
      agg.total++;
      switch (er.status) {
        case 'PASS': agg.pass++; break;
        case 'FAIL': agg.fail++; break;
        case 'MISSING': agg.missing++; break;
        case 'EXTRA': agg.extra++; break;
        case 'SKIP': agg.skip++; break;
      }
      agg.urls.set(sr.validated_url, {
        status: er.status,
        page_type: sr.page_type,
      });
    }
  }

  // Sort: most failures first, then alphabetical
  return Array.from(eventMap.values()).sort((a, b) => {
    const aFails = a.fail + a.missing + a.extra;
    const bFails = b.fail + b.missing + b.extra;
    if (bFails !== aFails) return bFails - aFails;
    return a.event_name.localeCompare(b.event_name);
  });
}

function eventStatusMark(status: EventValidationStatus): string {
  switch (status) {
    case 'PASS': return 'O';
    case 'FAIL': return 'X';
    case 'MISSING': return 'X';
    case 'EXTRA': return 'X';
    case 'SKIP': return '-';
    default: return '?';
  }
}

export function printEventBasedReport(result: EventValidationResult): void {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  2차 QA: 이벤트별 검수 결과                                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  const aggregations = aggregateByEvent(result);

  if (aggregations.length === 0) {
    console.log('  검증된 이벤트 없음');
    return;
  }

  // Event summary table
  console.log('이벤트별 요약:');
  console.log('─'.repeat(80));
  console.log(
    '  ' +
    '이벤트명'.padEnd(28) +
    'Total'.padStart(6) +
    'PASS'.padStart(6) +
    'FAIL'.padStart(6) +
    'MISS'.padStart(6) +
    'EXTRA'.padStart(6) +
    '  상태'
  );
  console.log('─'.repeat(80));

  for (const agg of aggregations) {
    const passRate = agg.total > 0 ? Math.round((agg.pass / agg.total) * 100) : 0;
    const qaStatus = passRate === 100 ? 'O' : passRate >= 50 ? '△' : 'X';
    const icon = qaStatus === 'O' ? '✅' : qaStatus === '△' ? '⚠️' : '❌';

    console.log(
      `  ${icon} ${agg.event_name.padEnd(25)}` +
      `${agg.total}`.padStart(6) +
      `${agg.pass}`.padStart(6) +
      `${agg.fail}`.padStart(6) +
      `${agg.missing}`.padStart(6) +
      `${agg.extra}`.padStart(6) +
      `  ${qaStatus} (${passRate}%)`
    );
  }

  console.log('─'.repeat(80));
  console.log('');

  // Per-event URL breakdown (only for events with failures)
  const failedEvents = aggregations.filter(a => a.fail + a.missing + a.extra > 0);
  if (failedEvents.length > 0) {
    console.log('이슈 이벤트 상세:');
    console.log('');

    for (const agg of failedEvents) {
      console.log(`  ❌ ${agg.event_name} (PASS: ${agg.pass}/${agg.total})`);

      // Group URLs by page_type
      const pageGroups = new Map<string, Array<{ url: string; status: EventValidationStatus }>>();
      for (const [url, data] of agg.urls) {
        if (!pageGroups.has(data.page_type)) {
          pageGroups.set(data.page_type, []);
        }
        pageGroups.get(data.page_type)!.push({ url, status: data.status });
      }

      for (const [pageType, urls] of pageGroups) {
        const failedUrls = urls.filter(u => u.status !== 'PASS');
        if (failedUrls.length === 0) continue;
        console.log(`    [${pageType}]`);
        for (const { url, status } of failedUrls) {
          const shortUrl = url.length > 60 ? url.substring(0, 57) + '...' : url;
          console.log(`      ${statusIcon(status)} ${shortUrl} → ${status}`);
        }
      }
      console.log('');
    }
  }

  // Overall
  const s = result.summary;
  const totalEvents = aggregations.length;
  const passedEvents = aggregations.filter(a => a.fail + a.missing + a.extra === 0).length;
  console.log('─'.repeat(64));
  console.log(`이벤트 종류: ${passedEvents}/${totalEvents} 전체 통과`);
  console.log(`Score: ${s.overall_score}/100 | 이벤트 통과율: ${s.event_pass_rate}%`);
  console.log('');
}

// ─────────────────────────────────────────────────────────────────────
// Excel Report (이벤트 검수 Excel 리포트)
// ─────────────────────────────────────────────────────────────────────

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFD9D9D9' },
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  size: 10,
};

const PASS_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFC6EFCE' },
};

const FAIL_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFF9999' },
};

const PARTIAL_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFFF99' },
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

function applyHeaderStyle(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.border = THIN_BORDER;
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
}

function statusFill(status: string): ExcelJS.Fill | undefined {
  switch (status) {
    case 'O': return PASS_FILL;
    case 'X': return FAIL_FILL;
    case '△': return PARTIAL_FILL;
    default: return undefined;
  }
}

// ── Overview Sheet ──

function buildOverviewSheet(
  workbook: ExcelJS.Workbook,
  result: EventValidationResult,
  aggregations: EventAggregation[],
): void {
  const ws = workbook.addWorksheet('Overview');

  ws.columns = [
    { header: 'No', key: 'no', width: 5 },
    { header: '이벤트명', key: 'event_name', width: 28 },
    { header: '상태', key: 'status', width: 6 },
    { header: '검증 수', key: 'total', width: 8 },
    { header: 'PASS', key: 'pass', width: 8 },
    { header: 'FAIL', key: 'fail', width: 8 },
    { header: 'MISSING', key: 'missing', width: 8 },
    { header: 'EXTRA', key: 'extra', width: 8 },
    { header: '통과율(%)', key: 'pass_rate', width: 10 },
    { header: '이슈 페이지', key: 'issue_pages', width: 40 },
    { header: '비고', key: 'note', width: 30 },
  ];

  applyHeaderStyle(ws.getRow(1));

  for (let i = 0; i < aggregations.length; i++) {
    const agg = aggregations[i];
    const passRate = agg.total > 0 ? Math.round((agg.pass / agg.total) * 100) : 0;
    const qaStatus = passRate === 100 ? 'O' : passRate >= 50 ? '△' : 'X';

    // Collect failed URLs
    const issuePages: string[] = [];
    for (const [url, data] of agg.urls) {
      if (data.status !== 'PASS') {
        try {
          issuePages.push(new URL(url).pathname);
        } catch {
          issuePages.push(url);
        }
      }
    }

    const row = ws.addRow({
      no: i + 1,
      event_name: agg.event_name,
      status: qaStatus,
      total: agg.total,
      pass: agg.pass,
      fail: agg.fail,
      missing: agg.missing,
      extra: agg.extra,
      pass_rate: passRate,
      issue_pages: issuePages.join('\n'),
      note: '',
    });

    row.eachCell((cell) => {
      cell.border = THIN_BORDER;
      cell.alignment = { vertical: 'middle', wrapText: true };
    });

    // Status cell color
    const fill = statusFill(qaStatus);
    if (fill) {
      row.getCell('status').fill = fill;
    }
  }

  // Summary row
  const s = result.summary;
  ws.addRow({});
  const summaryRow = ws.addRow({
    no: '',
    event_name: '합계',
    status: s.overall_score >= 80 ? 'O' : s.overall_score >= 50 ? '△' : 'X',
    total: s.total_events,
    pass: s.passed_events,
    fail: s.failed_events,
    missing: s.missing_events,
    extra: s.extra_events,
    pass_rate: s.event_pass_rate,
    issue_pages: `Score: ${s.overall_score}/100`,
    note: '',
  });
  summaryRow.font = { bold: true };
  summaryRow.eachCell((cell) => {
    cell.border = THIN_BORDER;
  });
}

// ── Event × URL Matrix Sheet ──

function buildEventUrlMatrixSheet(
  workbook: ExcelJS.Workbook,
  result: EventValidationResult,
  aggregations: EventAggregation[],
): void {
  const ws = workbook.addWorksheet('이벤트_URL_매트릭스');

  // Collect unique URLs in order
  const urlSet = new Map<string, string>(); // url → page_type
  for (const sr of result.scenario_results) {
    if (!urlSet.has(sr.validated_url)) {
      urlSet.set(sr.validated_url, sr.page_type);
    }
  }
  const urls = Array.from(urlSet.keys());

  // Build header: page_type | page_path | event1 | event2 | ...
  const eventNames = aggregations.map(a => a.event_name);
  const columns: Partial<ExcelJS.Column>[] = [
    { header: 'page_type', key: 'page_type', width: 16 },
    { header: 'page_path', key: 'page_path', width: 35 },
  ];
  for (const en of eventNames) {
    columns.push({ header: en, key: en, width: 14 });
  }
  ws.columns = columns;
  applyHeaderStyle(ws.getRow(1));

  // Build event → url → status lookup
  const eventUrlStatus = new Map<string, Map<string, EventValidationStatus>>();
  for (const sr of result.scenario_results) {
    for (const er of sr.event_results) {
      if (!eventUrlStatus.has(er.event_name)) {
        eventUrlStatus.set(er.event_name, new Map());
      }
      const urlMap = eventUrlStatus.get(er.event_name)!;
      // Keep worst status if multiple scenarios for same URL+event
      const existing = urlMap.get(sr.validated_url);
      if (!existing || statusPriority(er.status) < statusPriority(existing)) {
        urlMap.set(sr.validated_url, er.status);
      }
    }
  }

  // Data rows
  for (const url of urls) {
    const pageType = urlSet.get(url) || '';
    let pagePath = '';
    try {
      pagePath = new URL(url).pathname;
    } catch {
      pagePath = url;
    }

    const rowData: Record<string, string> = {
      page_type: pageType,
      page_path: pagePath,
    };

    for (const en of eventNames) {
      const status = eventUrlStatus.get(en)?.get(url);
      rowData[en] = status ? eventStatusMark(status) : '-';
    }

    const row = ws.addRow(rowData);
    row.eachCell((cell, colNumber) => {
      cell.border = THIN_BORDER;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };

      // Color code event status cells
      if (colNumber > 2) {
        const val = String(cell.value);
        const fill = statusFill(val);
        if (fill) {
          cell.fill = fill;
        }
      }
    });

    // Left-align page_type and page_path
    row.getCell(1).alignment = { vertical: 'middle' };
    row.getCell(2).alignment = { vertical: 'middle' };
  }
}

function statusPriority(status: EventValidationStatus): number {
  switch (status) {
    case 'MISSING': return 1;
    case 'EXTRA': return 2;
    case 'FAIL': return 3;
    case 'SKIP': return 4;
    case 'PASS': return 5;
    default: return 0;
  }
}

// ── Page Type Summary Sheet ──

function buildPageTypeSummarySheet(
  workbook: ExcelJS.Workbook,
  result: EventValidationResult,
): void {
  const ws = workbook.addWorksheet('페이지타입별_요약');

  ws.columns = [
    { header: '페이지 타입', key: 'page_type', width: 20 },
    { header: '시나리오 수', key: 'total_scenarios', width: 12 },
    { header: '통과 시나리오', key: 'passed_scenarios', width: 14 },
    { header: '통과율(%)', key: 'pass_rate', width: 10 },
    { header: '주요 실패 이벤트', key: 'most_failed_events', width: 40 },
  ];

  applyHeaderStyle(ws.getRow(1));

  for (const pt of result.summary_by_page_type) {
    const qaStatus = pt.pass_rate >= 80 ? 'O' : pt.pass_rate >= 50 ? '△' : 'X';

    const row = ws.addRow({
      page_type: pt.page_type,
      total_scenarios: pt.total_scenarios,
      passed_scenarios: pt.passed_scenarios,
      pass_rate: pt.pass_rate,
      most_failed_events: pt.most_failed_events.join(', '),
    });

    row.eachCell((cell) => {
      cell.border = THIN_BORDER;
      cell.alignment = { vertical: 'middle' };
    });

    const fill = statusFill(qaStatus);
    if (fill) {
      row.getCell('pass_rate').fill = fill;
    }
  }
}

// ── Issue Detail Sheet ──

interface EventIssueRow {
  event_name: string;
  page_type: string;
  url: string;
  status: EventValidationStatus;
  expected_to_fire: boolean;
  fired: boolean;
  fired_at_ms?: number;
  action_type?: string;
  error_message?: string;
}

function buildIssueDetailSheet(
  workbook: ExcelJS.Workbook,
  result: EventValidationResult,
): void {
  const ws = workbook.addWorksheet('이슈_상세');

  ws.columns = [
    { header: '이벤트명', key: 'event_name', width: 25 },
    { header: '상태', key: 'status', width: 10 },
    { header: '페이지 타입', key: 'page_type', width: 16 },
    { header: 'Page Path', key: 'page_path', width: 35 },
    { header: 'URL', key: 'url', width: 50 },
    { header: '기대 발생', key: 'expected', width: 10 },
    { header: '실제 발생', key: 'fired', width: 10 },
    { header: '발생 시점(ms)', key: 'fired_at_ms', width: 12 },
    { header: '액션', key: 'action_type', width: 12 },
    { header: '오류 메시지', key: 'error_message', width: 40 },
  ];

  applyHeaderStyle(ws.getRow(1));

  // Collect all non-PASS events
  const issues: EventIssueRow[] = [];
  for (const sr of result.scenario_results) {
    for (const er of sr.event_results) {
      if (er.status === 'PASS') continue;
      issues.push({
        event_name: er.event_name,
        page_type: sr.page_type,
        url: sr.validated_url,
        status: er.status,
        expected_to_fire: er.expected_to_fire,
        fired: er.fired,
        fired_at_ms: er.fired_at_ms,
        action_type: sr.user_action_performed?.action_type,
        error_message: sr.error_message,
      });
    }
  }

  // Sort by event_name, then status severity
  issues.sort((a, b) => {
    const cmp = a.event_name.localeCompare(b.event_name);
    if (cmp !== 0) return cmp;
    return statusPriority(a.status) - statusPriority(b.status);
  });

  for (const issue of issues) {
    let pagePath = '';
    try {
      pagePath = new URL(issue.url).pathname;
    } catch {
      pagePath = issue.url;
    }

    const row = ws.addRow({
      event_name: issue.event_name,
      status: issue.status,
      page_type: issue.page_type,
      page_path: pagePath,
      url: issue.url,
      expected: issue.expected_to_fire ? 'Y' : 'N',
      fired: issue.fired ? 'Y' : 'N',
      fired_at_ms: issue.fired_at_ms ?? '',
      action_type: issue.action_type ?? '',
      error_message: issue.error_message ?? '',
    });

    row.eachCell((cell) => {
      cell.border = THIN_BORDER;
      cell.alignment = { vertical: 'middle' };
    });

    // Color status cell
    const statusCell = row.getCell('status');
    if (issue.status === 'MISSING' || issue.status === 'FAIL' || issue.status === 'EXTRA') {
      statusCell.fill = FAIL_FILL;
    } else if (issue.status === 'SKIP') {
      statusCell.fill = PARTIAL_FILL;
    }
  }
}

// ── Main Excel Report Function ──

export async function generateEventExcelReport(
  result: EventValidationResult,
  outputDir: string,
  customEventReport?: CustomEventObservationReport,
): Promise<string> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const workbook = new ExcelJS.Workbook();
  const aggregations = aggregateByEvent(result);

  // Sheet 1: Overview
  buildOverviewSheet(workbook, result, aggregations);

  // Sheet 2: Event × URL Matrix
  buildEventUrlMatrixSheet(workbook, result, aggregations);

  // Sheet 3: Page Type Summary
  buildPageTypeSummarySheet(workbook, result);

  // Sheet 4: Issue Detail
  buildIssueDetailSheet(workbook, result);

  // Sheet 5: Custom Event Observation (관측된 custom_event가 있을 때만)
  if (customEventReport && customEventReport.total_observations > 0) {
    buildCustomEventSheet(workbook, customEventReport);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const fileName = `event-qa-report_${timestamp}.xlsx`;
  const filePath = path.join(outputDir, fileName);

  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

// ─────────────────────────────────────────────────────────────────────
// Custom Event Observation Sheet
// ─────────────────────────────────────────────────────────────────────

function buildCustomEventSheet(
  workbook: ExcelJS.Workbook,
  report: CustomEventObservationReport,
): void {
  const ws = workbook.addWorksheet('custom_event_관측');

  ws.columns = [
    { header: 'No', key: 'no', width: 5 },
    { header: '시나리오ID', key: 'scenario_id', width: 20 },
    { header: '페이지타입', key: 'page_type', width: 14 },
    { header: '페이지경로', key: 'page_path', width: 35 },
    { header: '수집단계', key: 'capture_phase', width: 10 },
    { header: '발생시점', key: 'timestamp', width: 22 },
    { header: 'event_action', key: 'event_action', width: 22 },
    { header: 'event_category', key: 'event_category', width: 22 },
    { header: 'event_label', key: 'event_label', width: 22 },
    { header: '파라미터수', key: 'parameter_count', width: 10 },
    { header: '주요파라미터', key: 'key_params', width: 50 },
  ];

  applyHeaderStyle(ws.getRow(1));

  for (let i = 0; i < report.observations.length; i++) {
    const obs = report.observations[i];

    let pagePath = '';
    try {
      pagePath = new URL(obs.page_url).pathname;
    } catch {
      pagePath = obs.page_url;
    }

    // 주요 파라미터: ep.* 중 event_action/category/label 외의 것들
    const keyParams = Object.entries(obs.raw_params)
      .filter(([k]) =>
        k.startsWith('ep.') &&
        k !== 'ep.event_action' &&
        k !== 'ep.event_category' &&
        k !== 'ep.event_label',
      )
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');

    const row = ws.addRow({
      no: i + 1,
      scenario_id: obs.scenario_id,
      page_type: obs.page_type,
      page_path: pagePath,
      capture_phase: obs.capture_phase,
      timestamp: obs.timestamp,
      event_action: obs.event_action ?? '',
      event_category: obs.event_category ?? '',
      event_label: obs.event_label ?? '',
      parameter_count: obs.parameter_count,
      key_params: keyParams,
    });

    row.eachCell((cell) => {
      cell.border = THIN_BORDER;
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
  }
}

// ─────────────────────────────────────────────────────────────────────
// Custom Event Console Section
// ─────────────────────────────────────────────────────────────────────

export function printCustomEventSection(report: CustomEventObservationReport): void {
  if (report.total_observations === 0) {
    console.log('\n  custom_event: 관측 없음');
    return;
  }

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Custom Event 관측 보고서                                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  console.log(`  전체 관측 수: ${report.total_observations}개`);
  console.log('');

  // event_action별 빈도 테이블
  const actions = Object.entries(report.action_frequency)
    .sort(([, a], [, b]) => b - a);

  if (actions.length > 0) {
    console.log('  event_action별 빈도:');
    console.log('  ' + '─'.repeat(50));
    console.log('  ' + 'event_action'.padEnd(35) + '횟수'.padStart(6));
    console.log('  ' + '─'.repeat(50));
    for (const [action, count] of actions) {
      console.log('  ' + `${action}`.padEnd(35) + `${count}`.padStart(6));
    }
    console.log('  ' + '─'.repeat(50));
    console.log('');
  }

  // 페이지별 분포
  if (report.page_summaries.length > 0) {
    console.log('  페이지별 custom_event 분포:');
    for (const ps of report.page_summaries) {
      let pagePath = '';
      try {
        pagePath = new URL(ps.page_url).pathname;
      } catch {
        pagePath = ps.page_url;
      }
      console.log(`    [${ps.page_type}] ${pagePath}: ${ps.count}건`);
      if (ps.unique_event_actions.length > 0) {
        console.log(`      actions: ${ps.unique_event_actions.join(', ')}`);
      }
    }
    console.log('');
  }
}
