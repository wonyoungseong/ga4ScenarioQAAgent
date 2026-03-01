/**
 * Comprehensive Event Reporter - GA4 QA 종합 리포트 생성기
 *
 * 샘플 템플릿 양식에 맞는 종합 Excel 리포트를 자동 생성합니다.
 *
 * 동적 탭 구성:
 * 1. Overview: 디바이스×로그인별 이벤트 진행률/완료율
 * 2. Review: 이벤트별 이슈 + As-Is/To-Be (개발자 가이드)
 * 3. {device}{loginCondition} N탭: 실제 테스트된 채널만 동적 생성
 * 4. {event} N탭: GTM Parser가 발견한 이벤트별 1탭씩 동적 생성
 *
 * 모든 탭과 이벤트 리스트는 하드코딩이 아닌 파이프라인 앞단의 동적 데이터 기반.
 *
 * @version 1.0
 */

import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';

import type { ChannelCombination } from '../../types/common';
import type {
  EventValidationResult,
  ScenarioResult,
  EventResult,
} from '../../types/event-validation-result';
import type {
  MultiChannelEventResult,
  OverviewCellStatus,
  EventDetailRow,
  ChannelTabCellStatus,
  ParsedChannel,
  SymptomGroup,
} from '../../types/qa-report';
// ScenarioIdGenerator removed — IDs are now pre-assigned by Parser at parse-time

// ─────────────────────────────────────────────────────────────────────
// Excel Styles (reused from event-reporter.ts pattern)
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

function applyDataRowStyle(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.border = THIN_BORDER;
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
}

// ─────────────────────────────────────────────────────────────────────
// Channel Helpers
// ─────────────────────────────────────────────────────────────────────

function parseChannel(channel: ChannelCombination): ParsedChannel {
  const parts = channel.split('_');
  const device = parts[0] === 'pc' ? 'PC' : 'MO';
  const loginCondition = channel.includes('no_login') ? '비로그인' : '로그인';
  const displayName = `${device}_${channel.includes('no_login') ? 'NoLogin' : 'Login'}`;
  return { device, login_condition: loginCondition, display_name: displayName };
}

function getChannelDisplayName(channel: ChannelCombination): string {
  return parseChannel(channel).display_name;
}

/** Extract page_path from URL */
function extractPagePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Event Status Aggregation
// ─────────────────────────────────────────────────────────────────────

/**
 * 채널별 이벤트 상태를 Overview 셀 값으로 판정합니다.
 *
 * O: 해당 채널에서 해당 이벤트 모든 시나리오 100% PASS
 * △: 검수 완료되었으나 FAIL/MISSING 존재
 * X: 미검수 (해당 채널 데이터 없음)
 * '': 해당 채널 scenario에 미포함 이벤트
 */
function determineOverviewStatus(
  eventName: string,
  channelResult: EventValidationResult | undefined,
  channelEvents: string[] | undefined,
): OverviewCellStatus {
  // 해당 채널 데이터 없음
  if (!channelResult) return 'X';

  // 해당 채널 시나리오에 이 이벤트가 포함되지 않음
  if (channelEvents && !channelEvents.includes(eventName)) return '';

  // 해당 이벤트의 결과 수집
  const eventResults: EventResult[] = [];
  for (const sr of channelResult.scenario_results) {
    for (const er of sr.event_results) {
      if (er.event_name === eventName) {
        eventResults.push(er);
      }
    }
  }

  if (eventResults.length === 0) return '';

  const allPass = eventResults.every(er => er.status === 'PASS');
  return allPass ? 'O' : '△';
}

/**
 * 채널 탭에서 특정 URL+이벤트의 셀 상태를 판정합니다.
 */
function determineChannelCellStatus(
  url: string,
  eventName: string,
  scenarioResults: ScenarioResult[],
): ChannelTabCellStatus {
  const matchingResults: EventResult[] = [];
  for (const sr of scenarioResults) {
    if (sr.validated_url !== url) continue;
    for (const er of sr.event_results) {
      if (er.event_name === eventName) {
        matchingResults.push(er);
      }
    }
  }

  if (matchingResults.length === 0) return '-';

  // Any pass with expected_to_fire=true AND status=PASS → O
  // Any fail → X
  const hasIssue = matchingResults.some(er => {
    if (er.expected_to_fire && er.status !== 'PASS') return true;
    if (!er.expected_to_fire && er.fired) return true;
    return false;
  });

  return hasIssue ? 'X' : 'O';
}

// ─────────────────────────────────────────────────────────────────────
// Symptom Grouping (for Review tab)
// ─────────────────────────────────────────────────────────────────────

function groupSymptoms(symptoms: Array<{ symptom: string; url: string }>): SymptomGroup[] {
  const groups = new Map<string, { count: number; urls: string[] }>();

  for (const { symptom, url } of symptoms) {
    if (!symptom) continue;
    // Simple grouping by symptom text similarity
    const key = symptom.replace(/https?:\/\/[^\s]+/g, '{URL}')
      .replace(/\/[^\s/]+\.[a-z]+/g, '/{path}');

    if (!groups.has(key)) {
      groups.set(key, { count: 0, urls: [] });
    }
    const g = groups.get(key)!;
    g.count++;
    if (!g.urls.includes(url)) g.urls.push(url);
  }

  return Array.from(groups.entries()).map(([pattern, data]) => ({
    pattern,
    count: data.count,
    urls: data.urls,
  }));
}

function generateStatusSummary(
  _eventName: string,
  eventDetailRows: EventDetailRow[],
): string {
  const issueRows = eventDetailRows.filter(r => r.normal_or_issue === '이슈');

  if (issueRows.length === 0) {
    const totalRows = eventDetailRows.length;
    return `이슈 없음 (전체 ${totalRows}개 시나리오 정상)`;
  }

  const symptoms = issueRows.map(r => ({ symptom: r.symptom, url: r.page_path }));
  const groups = groupSymptoms(symptoms);

  const summaryParts: string[] = [];
  for (const group of groups) {
    const urlSummary = group.urls.length <= 3
      ? group.urls.join(', ')
      : `${group.urls.slice(0, 2).join(', ')} 외 ${group.urls.length - 2}건`;
    summaryParts.push(`${urlSummary}에서 ${group.count}건: ${group.pattern}`);
  }

  return summaryParts.join('\n');
}

// ─────────────────────────────────────────────────────────────────────
// Dynamic Data Extraction
// ─────────────────────────────────────────────────────────────────────

/**
 * MultiChannelEventResult에서 모든 이벤트명 추출 (동적)
 */
function extractAllEventNames(data: MultiChannelEventResult): string[] {
  // 1. all_event_names 필드 (미리 준비된 경우)
  if (data.all_event_names.length > 0) {
    return [...data.all_event_names];
  }
  // 2. scenario_spec.events에서 추출
  return data.parser_output.scenario_spec.events.map(e => e.event_name);
}

/**
 * 채널별 이벤트 리스트 추출 (동적)
 */
function extractEventsForChannel(
  channel: ChannelCombination,
  data: MultiChannelEventResult,
): string[] {
  // 미리 준비된 데이터가 있으면 사용
  if (data.events_by_channel[channel]) {
    return data.events_by_channel[channel]!;
  }

  // scenario_results에서 동적 추출
  const channelResult = data.channel_results[channel];
  if (!channelResult) return [];

  const events = new Set<string>();
  for (const sr of channelResult.scenario_results) {
    for (const er of sr.event_results) {
      events.add(er.event_name);
    }
  }
  return Array.from(events);
}

/**
 * 채널별 URL 목록 추출 (동적)
 */
function extractUrlsForChannel(
  channel: ChannelCombination,
  data: MultiChannelEventResult,
): string[] {
  if (data.urls_by_channel[channel]) {
    return data.urls_by_channel[channel]!;
  }

  const channelResult = data.channel_results[channel];
  if (!channelResult) return [];

  const urls = new Set<string>();
  for (const sr of channelResult.scenario_results) {
    urls.add(sr.validated_url);
  }
  return Array.from(urls);
}

/**
 * 모든 채널의 ScenarioResult를 이벤트별로 모읍니다.
 */
function collectAllScenarioResultsByEvent(
  data: MultiChannelEventResult,
): Map<string, Array<{ sr: ScenarioResult; er: EventResult; channel: ChannelCombination }>> {
  const map = new Map<string, Array<{ sr: ScenarioResult; er: EventResult; channel: ChannelCombination }>>();

  for (const [channel, result] of Object.entries(data.channel_results)) {
    if (!result) continue;
    for (const sr of result.scenario_results) {
      for (const er of sr.event_results) {
        if (!map.has(er.event_name)) {
          map.set(er.event_name, []);
        }
        map.get(er.event_name)!.push({
          sr,
          er,
          channel: channel as ChannelCombination,
        });
      }
    }
  }

  return map;
}

/**
 * 채널 → URL → 액션 순으로 정렬하여 Action/Event ID가 채널별로 독립적으로 부여되도록 합니다.
 */
function sortEntriesByChannelAndAction(
  entries: Array<{ sr: ScenarioResult; er: EventResult; channel: ChannelCombination }>,
): typeof entries {
  return [...entries].sort((a, b) => {
    const chOrder = a.channel.localeCompare(b.channel);
    if (chOrder !== 0) return chOrder;
    const urlOrder = a.sr.validated_url.localeCompare(b.sr.validated_url);
    if (urlOrder !== 0) return urlOrder;
    const aAction = a.sr.user_action_performed ? 1 : 0;
    const bAction = b.sr.user_action_performed ? 1 : 0;
    return aAction - bAction;
  });
}

// ─────────────────────────────────────────────────────────────────────
// Sheet Builders
// ─────────────────────────────────────────────────────────────────────

/** 1. Overview Sheet */
function buildOverviewSheet(
  workbook: ExcelJS.Workbook,
  data: MultiChannelEventResult,
): void {
  const ws = workbook.addWorksheet('Overview');
  const allEvents = extractAllEventNames(data);
  const activeChannels = Object.keys(data.channel_results)
    .filter(ch => data.channel_results[ch as ChannelCombination] !== undefined) as ChannelCombination[];

  // Columns: No | 이벤트명 | {channel1} | {channel2} | ... | QA Progress | Completion Rate
  const columns: Partial<ExcelJS.Column>[] = [
    { header: 'No', key: 'no', width: 5 },
    { header: '이벤트명', key: 'event_name', width: 28 },
  ];

  for (const ch of activeChannels) {
    columns.push({ header: getChannelDisplayName(ch), key: ch, width: 12 });
  }
  columns.push(
    { header: 'QA Progress', key: 'qa_progress', width: 14 },
    { header: 'Completion Rate', key: 'completion_rate', width: 16 },
  );

  ws.columns = columns;
  applyHeaderStyle(ws.getRow(1));

  for (let i = 0; i < allEvents.length; i++) {
    const eventName = allEvents[i];
    const rowData: Record<string, unknown> = {
      no: i + 1,
      event_name: eventName,
    };

    let testedChannels = 0;
    let passedChannels = 0;

    for (const ch of activeChannels) {
      const channelEvents = extractEventsForChannel(ch, data);
      const status = determineOverviewStatus(
        eventName,
        data.channel_results[ch],
        channelEvents,
      );
      rowData[ch] = status;

      if (status !== '' && status !== 'X') {
        testedChannels++;
        if (status === 'O') passedChannels++;
      }
    }

    const totalApplicableChannels = activeChannels.filter(ch => {
      const channelEvents = extractEventsForChannel(ch, data);
      return channelEvents.includes(eventName);
    }).length;

    rowData['qa_progress'] = totalApplicableChannels > 0
      ? `${testedChannels}/${totalApplicableChannels}`
      : '-';
    rowData['completion_rate'] = testedChannels > 0
      ? `${Math.round((passedChannels / testedChannels) * 100)}%`
      : '-';

    const row = ws.addRow(rowData);
    applyDataRowStyle(row);

    // Color code channel status cells
    for (const ch of activeChannels) {
      const cellVal = String(row.getCell(ch).value ?? '');
      const fill = statusFill(cellVal);
      if (fill) {
        row.getCell(ch).fill = fill;
      }
      row.getCell(ch).alignment = { vertical: 'middle', horizontal: 'center' };
    }
  }
}

/** 2. Review Sheet */
function buildReviewSheet(
  workbook: ExcelJS.Workbook,
  data: MultiChannelEventResult,
  eventDetailRowsMap: Map<string, EventDetailRow[]>,
): void {
  const ws = workbook.addWorksheet('Review');
  const allEvents = extractAllEventNames(data);

  ws.columns = [
    { header: 'No', key: 'no', width: 5 },
    { header: '이벤트명', key: 'event_name', width: 25 },
    { header: '현황', key: 'status_summary', width: 50 },
    { header: 'As-Is', key: 'as_is', width: 60 },
    { header: 'To-Be', key: 'to_be', width: 60 },
  ];

  applyHeaderStyle(ws.getRow(1));

  for (let i = 0; i < allEvents.length; i++) {
    const eventName = allEvents[i];
    const detailRows = eventDetailRowsMap.get(eventName) ?? [];

    // Status summary from accumulated symptoms
    const statusSummary = generateStatusSummary(eventName, detailRows);

    // As-Is / To-Be from detail rows (already computed by Validator)
    let asIs = '';
    let toBe = '';

    const issueRows = detailRows.filter(r => r.normal_or_issue === '이슈');
    if (issueRows.length > 0) {
      asIs = issueRows[0].as_is;
      toBe = issueRows[0].to_be;
    }

    const row = ws.addRow({
      no: i + 1,
      event_name: eventName,
      status_summary: statusSummary,
      as_is: asIs,
      to_be: toBe,
    });

    applyDataRowStyle(row);

    // Highlight rows with issues
    if (issueRows.length > 0) {
      row.getCell('event_name').fill = PARTIAL_FILL;
    }
  }
}

/** 3. {device}{loginCondition} Channel Tab */
function buildChannelTab(
  workbook: ExcelJS.Workbook,
  channel: ChannelCombination,
  data: MultiChannelEventResult,
): void {
  const displayName = getChannelDisplayName(channel);
  const ws = workbook.addWorksheet(displayName);
  const channelResult = data.channel_results[channel];
  if (!channelResult) return;

  const channelEvents = extractEventsForChannel(channel, data);
  const channelUrls = extractUrlsForChannel(channel, data);

  // Columns: pagePath | event1 | event2 | ...
  const columns: Partial<ExcelJS.Column>[] = [
    { header: 'pagePath', key: 'page_path', width: 40 },
  ];
  for (const eventName of channelEvents) {
    columns.push({ header: eventName, key: eventName, width: 14 });
  }
  ws.columns = columns;
  applyHeaderStyle(ws.getRow(1));

  for (const url of channelUrls) {
    const pagePath = extractPagePath(url);
    const rowData: Record<string, string> = { page_path: pagePath };

    for (const eventName of channelEvents) {
      const status = determineChannelCellStatus(url, eventName, channelResult.scenario_results);
      rowData[eventName] = status;
    }

    const row = ws.addRow(rowData);
    applyDataRowStyle(row);

    // Color code event status cells
    for (let colIdx = 2; colIdx <= channelEvents.length + 1; colIdx++) {
      const cell = row.getCell(colIdx);
      const val = String(cell.value ?? '');
      const fill = statusFill(val === 'O' ? 'O' : val === 'X' ? 'X' : '');
      if (fill) cell.fill = fill;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }
  }
}

/** 4. {event} Detail Tab */
function buildEventDetailTab(
  workbook: ExcelJS.Workbook,
  eventName: string,
  detailRows: EventDetailRow[],
): void {
  // Sanitize event name for sheet name (max 31 chars, no special chars)
  let sheetName = eventName.replace(/[\/\\?*[\]:]/g, '_');
  if (sheetName.length > 31) sheetName = sheetName.substring(0, 31);

  const ws = workbook.addWorksheet(sheetName);

  ws.columns = [
    { header: '검증일', key: 'date', width: 12 },
    { header: 'Action ID', key: 'scenario_action_id', width: 10 },
    { header: 'Event ID', key: 'scenario_event_id', width: 12 },
    { header: '시나리오', key: 'scenario', width: 25 },
    { header: 'pagePath', key: 'page_path', width: 35 },
    { header: '디바이스', key: 'device', width: 10 },
    { header: '로그인 조건', key: 'login_condition', width: 12 },
    { header: '시나리오 상세', key: 'scenario_detail', width: 30 },
    { header: '기대 발생', key: 'expected_fire', width: 10 },
    { header: '실제 발생', key: 'actual_fire', width: 10 },
    { header: '정상/이슈', key: 'normal_or_issue', width: 10 },
    { header: '증상', key: 'symptom', width: 40 },
    { header: 'As-Is', key: 'as_is', width: 50 },
    { header: 'To-Be', key: 'to_be', width: 50 },
  ];

  applyHeaderStyle(ws.getRow(1));

  for (const detail of detailRows) {
    const row = ws.addRow(detail);
    applyDataRowStyle(row);

    // Color code 정상/이슈
    const statusCell = row.getCell('normal_or_issue');
    if (detail.normal_or_issue === '정상') {
      statusCell.fill = PASS_FILL;
    } else if (detail.normal_or_issue === '이슈') {
      statusCell.fill = FAIL_FILL;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// Event Detail Row Builder
// ─────────────────────────────────────────────────────────────────────

/**
 * 모든 채널의 ScenarioResult를 이벤트별 EventDetailRow[]로 변환합니다.
 */
function buildAllEventDetailRows(
  data: MultiChannelEventResult,
): Map<string, EventDetailRow[]> {
  const map = new Map<string, EventDetailRow[]>();
  const today = new Date().toISOString().substring(0, 10);

  const allByEvent = collectAllScenarioResultsByEvent(data);

  for (const [eventName, entries] of allByEvent) {
    const rows: EventDetailRow[] = [];
    const sorted = sortEntriesByChannelAndAction(entries);

    for (const { sr, er, channel } of sorted) {
      const parsed = parseChannel(channel);
      const pagePath = extractPagePath(sr.validated_url);

      const expectedFire = er.expected_to_fire ? '발생' as const : '미발생' as const;
      const actualFire = er.fired ? '발생' as const : '미발생' as const;

      // Determine normal vs issue
      const isNormal = (er.expected_to_fire && er.status === 'PASS')
        || (!er.expected_to_fire && !er.fired);
      const normalOrIssue = isNormal ? '정상' as const : '이슈' as const;

      // Symptom generation (only for issues)
      let symptom = '';
      let asIs = '';
      let toBe = '';

      if (!isNormal) {
        // Build symptom description
        const scenarioDesc = sr.scenario_name || pagePath;
        if (er.status === 'MISSING') {
          symptom = `${scenarioDesc}에서 ${eventName} 미발생 (기대: 발생)`;
        } else if (er.status === 'EXTRA') {
          symptom = `${scenarioDesc}에서 ${eventName} 발생 (기대: 미발생)`;
        } else if (er.status === 'FAIL') {
          const discrepancy = er.discrepancy?.description ?? '기대값과 불일치';
          symptom = `${scenarioDesc}에서 ${eventName}: ${discrepancy}`;
        }

        // As-Is / To-Be from EventResult (pre-computed by Validator)
        asIs = er.as_is ?? symptom;
        toBe = er.to_be ?? '';
      }

      // Scenario detail
      const scenarioDetail = sr.user_action_performed
        ? `${sr.user_action_performed.action_type}${sr.user_action_performed.target_selector ? ` (${sr.user_action_performed.target_selector.substring(0, 50)})` : ''}`
        : er.expected_to_fire ? '페이지 로드 시 자동 발생' : '페이지 로드 시 미발생 확인';

      rows.push({
        date: today,
        scenario_action_id: sr.action_id,
        scenario_event_id: er.event_id ?? '',
        scenario: sr.scenario_name,
        page_path: pagePath,
        device: parsed.device,
        login_condition: parsed.login_condition,
        scenario_detail: scenarioDetail,
        expected_fire: expectedFire,
        actual_fire: actualFire,
        normal_or_issue: normalOrIssue,
        symptom,
        as_is: asIs,
        to_be: toBe,
      });
    }

    map.set(eventName, rows);
  }

  return map;
}

// ─────────────────────────────────────────────────────────────────────
// Main Export Function
// ─────────────────────────────────────────────────────────────────────

/**
 * 종합 Excel 리포트를 생성합니다.
 *
 * @param data 멀티채널 병합 데이터
 * @param outputDir 출력 디렉토리
 * @returns 생성된 Excel 파일 경로
 */
export async function generateComprehensiveEventExcelReport(
  data: MultiChannelEventResult,
  outputDir: string,
): Promise<string> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const workbook = new ExcelJS.Workbook();

  // Pre-build all event detail rows (used by both Review and Event tabs)
  const eventDetailRowsMap = buildAllEventDetailRows(data);

  // ── Sheet 1: Overview ──
  console.log('  Overview 탭 생성...');
  buildOverviewSheet(workbook, data);

  // ── Sheet 2: Review ──
  console.log('  Review 탭 생성...');
  buildReviewSheet(workbook, data, eventDetailRowsMap);

  // ── Sheet 3~N: {device}{loginCondition} Channel Tabs ──
  const activeChannels = Object.keys(data.channel_results)
    .filter(ch => data.channel_results[ch as ChannelCombination] !== undefined) as ChannelCombination[];

  for (const channel of activeChannels) {
    const displayName = getChannelDisplayName(channel);
    console.log(`  ${displayName} 탭 생성...`);
    buildChannelTab(workbook, channel, data);
  }

  // ── Sheet N+1~M: {event} Detail Tabs ──
  const allEvents = extractAllEventNames(data);
  for (const eventName of allEvents) {
    const detailRows = eventDetailRowsMap.get(eventName) ?? [];
    if (detailRows.length === 0) continue;
    console.log(`  ${eventName} 탭 생성...`);
    buildEventDetailTab(workbook, eventName, detailRows);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const fileName = `comprehensive-event-qa-report_${timestamp}.xlsx`;
  const filePath = path.join(outputDir, fileName);

  await workbook.xlsx.writeFile(filePath);
  return filePath;
}
