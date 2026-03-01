/**
 * Excel Reporter - 멀티채널 QA 결과를 Excel 파일로 생성
 *
 * 6개 탭 구조:
 * 1. Overview - 집약된 이슈 리포트 (페이지 이슈 + 변수 이슈)
 * 2. PC_LOGIN - PC 로그인 채널 상세
 * 3. PC_NO_LOGIN - PC 비로그인 채널 상세
 * 4. MO_LOGIN - MO 로그인 채널 상세
 * 5. MO_NO_LOGIN - MO 비로그인 채널 상세
 * 6. 이슈_상세 - 개별 실패 항목 로우 데이터
 */

import * as path from 'path';
import * as fs from 'fs';
import ExcelJS from 'exceljs';
import type { GlobalVariableValidationOutput, VariableJudgment } from '../validator';
import type { GlobalVariableCollectedData } from '../collector';
import type { URLVariableSpec } from '../parser';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface ExcelReportInput {
  /** 채널별 validation 결과 (key: channel name) */
  results: Record<string, GlobalVariableValidationOutput | null>;
  /** 채널별 수집 데이터 */
  collectedData: Record<string, GlobalVariableCollectedData[]>;
  /** 채널별 URL 스펙 */
  urlSpecs: Record<string, URLVariableSpec[]>;
  /** 출력 디렉토리 */
  outputDir: string;
}

/** 개별 이슈 항목 (Raw Data) */
interface RawIssue {
  channel: string;        // "PC_LOGIN" 등
  url: string;
  pagePath: string;       // URL의 pathname
  variableName: string;   // "AP_DATA_BREAD"
  status: 'X' | '△';
  actualValue: string;    // 수집된 실제 값
  expectedValue: string;  // 기대값
  reason: string;         // 판정 사유
}

/** Overview 행 */
interface OverviewRow {
  type: '페이지' | '변수';
  issue: string;
  pagePaths: string[];
  channels: string[];
  note: string;           // 참고 (현재 상태)
  request: string;        // 요청사항 (기대값)
  hasXStatus: boolean;    // X 실패 포함 여부 (스타일링용)
}

// ─────────────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────────────

/** 채널 탭 컬럼 순서 (참조 Excel 기준) */
const CHANNEL_COLUMNS = [
  'page_path',
  'url',
  'AP_DATA_SITENAME',
  'AP_DATA_COUNTRY',
  'AP_DATA_LANG',
  'AP_DATA_ENV',
  'AP_DATA_CHANNEL',
  'AP_DATA_BREAD',
  'AP_DATA_BREAD(정답지)',
  'AP_DATA_PAGETYPE',
  'AP_DATA_PAGETYPE(정답지)',
  'AP_PROMO_ID',
  'AP_PROMO_NAME',
  'AP_DATA_ISLOGIN',
  'AP_DATA_GCID',
  'AP_DATA_CID',
  'AP_DATA_ISMEMBER',
  'AP_DATA_CG',
  'AP_DATA_CD',
  'AP_DATA_LOGINTYPE',
  'AP_DATA_CT',
  'AP_DATA_BEAUTYCT',
  'AP_DATA_ISEMPLOYEE',
  'note',
];

const CHANNEL_TAB_NAMES: Record<string, string> = {
  pc_login: 'PC_LOGIN',
  pc_no_login: 'PC_NO_LOGIN',
  mo_login: 'MO_LOGIN',
  mo_no_login: 'MO_NO_LOGIN',
};

const CHANNEL_ORDER = ['pc_login', 'pc_no_login', 'mo_login', 'mo_no_login'];

/** 페이지 이슈 판별에 사용할 핵심 변수 */
const CORE_VARIABLES = [
  'AP_DATA_SITENAME',
  'AP_DATA_COUNTRY',
  'AP_DATA_LANG',
  'AP_DATA_ENV',
  'AP_DATA_CHANNEL',
];

/** 로그인 채널 목록 */
const LOGIN_CHANNELS = ['PC_LOGIN', 'MO_LOGIN'];

/** 로그인 세션 관련 변수 */
const LOGIN_SESSION_VARIABLES = ['AP_DATA_ISLOGIN', 'AP_DATA_GCID'];

// ─────────────────────────────────────────────────────────────────────
// 스타일 헬퍼
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

// ─────────────────────────────────────────────────────────────────────
// Step 2: Raw Issue 수집
// ─────────────────────────────────────────────────────────────────────

function collectRawIssues(
  results: Record<string, GlobalVariableValidationOutput | null>,
): RawIssue[] {
  const rawIssues: RawIssue[] = [];

  for (const channel of CHANNEL_ORDER) {
    const validation = results[channel];
    if (!validation) continue;

    const tabName = CHANNEL_TAB_NAMES[channel] || channel;

    for (const urlResult of validation.url_results) {
      let pagePath = '';
      try {
        pagePath = new URL(urlResult.url).pathname;
      } catch {
        pagePath = urlResult.url;
      }

      for (const judgment of urlResult.judgments) {
        if (judgment.status !== 'X' && judgment.status !== '△') continue;

        rawIssues.push({
          channel: tabName,
          url: urlResult.url,
          pagePath,
          variableName: judgment.variable_name,
          status: judgment.status,
          actualValue: judgment.actual_value,
          expectedValue: judgment.expected_value,
          reason: judgment.reason || '값 불일치',
        });
      }
    }
  }

  return rawIssues;
}

// ─────────────────────────────────────────────────────────────────────
// Step 3: 이슈_상세 탭 (Raw Data)
// ─────────────────────────────────────────────────────────────────────

function buildRawIssueSheet(
  workbook: ExcelJS.Workbook,
  rawIssues: RawIssue[],
): void {
  const ws = workbook.addWorksheet('이슈_상세');

  ws.columns = [
    { header: '채널', key: 'channel', width: 15 },
    { header: 'Page Path', key: 'pagePath', width: 30 },
    { header: 'URL', key: 'url', width: 50 },
    { header: '변수명', key: 'variableName', width: 22 },
    { header: '상태', key: 'status', width: 8 },
    { header: '실제값', key: 'actualValue', width: 25 },
    { header: '기대값', key: 'expectedValue', width: 25 },
    { header: '사유', key: 'reason', width: 40 },
  ];

  applyHeaderStyle(ws.getRow(1));

  for (const issue of rawIssues) {
    const row = ws.addRow({
      channel: issue.channel,
      pagePath: issue.pagePath,
      url: issue.url,
      variableName: issue.variableName,
      status: issue.status,
      actualValue: issue.actualValue,
      expectedValue: issue.expectedValue,
      reason: issue.reason,
    });

    row.eachCell((cell) => {
      cell.border = THIN_BORDER;
    });

    if (issue.status === 'X') {
      row.eachCell((cell) => {
        cell.fill = FAIL_FILL;
      });
    } else {
      row.eachCell((cell) => {
        cell.fill = PARTIAL_FILL;
      });
    }
  }

  if (rawIssues.length === 0) {
    ws.addRow({
      channel: '-',
      pagePath: '-',
      url: '-',
      variableName: '-',
      status: '-',
      actualValue: '-',
      expectedValue: '-',
      reason: '이슈 없음',
    });
  }
}

/** 이슈가 로그인 채널에서만 발생하는지 판별 */
function isLoginChannelOnly(issues: RawIssue[]): boolean {
  return issues.length > 0 && issues.every(i => LOGIN_CHANNELS.includes(i.channel));
}

// ─────────────────────────────────────────────────────────────────────
// Step 4: Overview 탭 재설계 (2-Tier 분류)
// ─────────────────────────────────────────────────────────────────────

/**
 * 페이지 이슈 감지: 한 (url, channel) 조합에서 심각한 문제가 있는지 판별
 */
function detectPageIssueURLs(
  rawIssues: RawIssue[],
  collectedData: Record<string, GlobalVariableCollectedData[]>,
): Set<string> {
  const pageIssueKeys = new Set<string>(); // "url" 단위로 추적

  // 1) URL별 X 실패 수 집계
  const urlXCount = new Map<string, number>();
  // 2) URL별 핵심 변수 X 실패 수 집계
  const urlCoreXCount = new Map<string, number>();

  for (const issue of rawIssues) {
    if (issue.status !== 'X') continue;

    const count = urlXCount.get(issue.url) || 0;
    urlXCount.set(issue.url, count + 1);

    if (CORE_VARIABLES.includes(issue.variableName)) {
      const coreCount = urlCoreXCount.get(issue.url) || 0;
      urlCoreXCount.set(issue.url, coreCount + 1);
    }
  }

  // Tier 1-a: URL에서 X 실패가 5개 이상
  for (const [url, count] of urlXCount) {
    if (count >= 5) {
      pageIssueKeys.add(url);
    }
  }

  // Tier 1-b: 핵심 변수 중 3개 이상 X
  for (const [url, count] of urlCoreXCount) {
    if (count >= 3) {
      pageIssueKeys.add(url);
    }
  }

  // Tier 1-c: 수집 오류(errors 배열) 있는 페이지
  for (const channel of CHANNEL_ORDER) {
    const dataList = collectedData[channel] || [];
    for (const data of dataList) {
      if (data.errors.length > 0) {
        pageIssueKeys.add(data.url);
      }
    }
  }

  // Tier 1-d: 리다이렉트 감지된 페이지
  for (const channel of CHANNEL_ORDER) {
    const dataList = collectedData[channel] || [];
    for (const data of dataList) {
      if (data.final_url) {
        try {
          const origPath = new URL(data.url).pathname;
          const finalPath = new URL(data.final_url).pathname;
          if (origPath !== finalPath) {
            pageIssueKeys.add(data.url);
          }
        } catch { /* ignore */ }
      }
    }
  }

  return pageIssueKeys;
}

/**
 * 페이지 이슈 행 생성
 */
function buildPageIssueRows(
  rawIssues: RawIssue[],
  pageIssueURLs: Set<string>,
  collectedData: Record<string, GlobalVariableCollectedData[]>,
): OverviewRow[] {
  const rows: OverviewRow[] = [];

  // URL별로 그루핑
  const urlGrouped = new Map<string, {
    pagePaths: Set<string>;
    channels: Set<string>;
    failedVars: string[];
    coreFailedVars: string[];
    errors: string[];
    redirectInfo?: { from: string; to: string };
    xCount: number;
  }>();

  // 이슈 데이터 수집
  for (const issue of rawIssues) {
    if (!pageIssueURLs.has(issue.url)) continue;
    if (issue.status !== 'X') continue;

    if (!urlGrouped.has(issue.url)) {
      urlGrouped.set(issue.url, {
        pagePaths: new Set(),
        channels: new Set(),
        failedVars: [],
        coreFailedVars: [],
        errors: [],
        redirectInfo: undefined,
        xCount: 0,
      });
    }
    const group = urlGrouped.get(issue.url)!;
    group.pagePaths.add(issue.pagePath);
    group.channels.add(issue.channel);
    group.failedVars.push(issue.variableName);
    if (CORE_VARIABLES.includes(issue.variableName)) {
      group.coreFailedVars.push(issue.variableName);
    }
    group.xCount++;
  }

  // 수집 오류 페이지 추가
  for (const channel of CHANNEL_ORDER) {
    const dataList = collectedData[channel] || [];
    const tabName = CHANNEL_TAB_NAMES[channel] || channel;
    for (const data of dataList) {
      if (data.errors.length === 0) continue;
      if (!pageIssueURLs.has(data.url)) continue;

      let pagePath = '';
      try {
        pagePath = new URL(data.url).pathname;
      } catch {
        pagePath = data.url;
      }

      if (!urlGrouped.has(data.url)) {
        urlGrouped.set(data.url, {
          pagePaths: new Set(),
          channels: new Set(),
          failedVars: [],
          coreFailedVars: [],
          errors: [],
          redirectInfo: undefined,
          xCount: 0,
        });
      }
      const group = urlGrouped.get(data.url)!;
      group.pagePaths.add(pagePath);
      group.channels.add(tabName);
      group.errors.push(...data.errors);
    }
  }

  // 리다이렉트 페이지 추가
  for (const channel of CHANNEL_ORDER) {
    const dataList = collectedData[channel] || [];
    const tabName = CHANNEL_TAB_NAMES[channel] || channel;
    for (const data of dataList) {
      if (!data.final_url) continue;
      if (!pageIssueURLs.has(data.url)) continue;

      let origPath = '';
      let finalPath = '';
      try {
        origPath = new URL(data.url).pathname;
        finalPath = new URL(data.final_url).pathname;
        if (origPath === finalPath) continue;
      } catch { continue; }

      if (!urlGrouped.has(data.url)) {
        urlGrouped.set(data.url, {
          pagePaths: new Set(),
          channels: new Set(),
          failedVars: [],
          coreFailedVars: [],
          errors: [],
          redirectInfo: undefined,
          xCount: 0,
        });
      }
      const group = urlGrouped.get(data.url)!;
      group.pagePaths.add(origPath);
      group.channels.add(tabName);
      if (!group.redirectInfo) {
        group.redirectInfo = { from: origPath, to: finalPath };
      }
    }
  }

  // 행 생성
  for (const [url, group] of urlGrouped) {
    const uniqueFailedVars = [...new Set(group.failedVars)];
    const uniqueCoreVars = [...new Set(group.coreFailedVars)];
    const basePaths = [...group.pagePaths];
    const baseChannels = [...group.channels];

    if (group.redirectInfo) {
      rows.push({
        type: '페이지',
        issue: 'URL 리다이렉트',
        pagePaths: basePaths,
        channels: baseChannels,
        note: `리다이렉트: ${group.redirectInfo.from} → ${group.redirectInfo.to}`,
        request: '해당 URL 리다이렉트 여부 확인 및 재평가 필요',
        hasXStatus: true,
      });
    } else if (group.errors.length > 0) {
      rows.push({
        type: '페이지',
        issue: '수집 오류 페이지',
        pagePaths: basePaths,
        channels: baseChannels,
        note: `오류: ${group.errors[0]}`,
        request: '페이지 접근 가능 여부 확인 필요',
        hasXStatus: true,
      });
    } else if (uniqueCoreVars.length >= 3) {
      rows.push({
        type: '페이지',
        issue: '핵심 변수 미선언',
        pagePaths: basePaths,
        channels: baseChannels,
        note: `미선언 변수: ${uniqueCoreVars.join(', ')}`,
        request: '해당 페이지 GTM 태깅 전체 구현 필요',
        hasXStatus: true,
      });
    } else {
      // 근본 원인별 버킷 분류
      const urlXIssues = rawIssues.filter(i => i.url === url && i.status === 'X');

      // A: 브레드크럼 불일치 (값은 수집됐지만 기대값과 다름)
      const breadIssues = urlXIssues.filter(
        i => i.variableName === 'AP_DATA_BREAD' && i.actualValue !== 'undefined',
      );

      // B: 로그인 세션 미반영 (ISLOGIN/GCID가 로그인 채널에서만 실패)
      const loginSessionIssues = urlXIssues.filter(
        i => LOGIN_SESSION_VARIABLES.includes(i.variableName),
      );
      const loginOnlySession = isLoginChannelOnly(loginSessionIssues);

      // C: 나머지
      const otherIssues = urlXIssues.filter(i => {
        if (i.variableName === 'AP_DATA_BREAD' && i.actualValue !== 'undefined') return false;
        if (LOGIN_SESSION_VARIABLES.includes(i.variableName) && loginOnlySession) return false;
        return true;
      });

      let bucketGenerated = false;

      if (breadIssues.length > 0) {
        const first = breadIssues[0];
        rows.push({
          type: '페이지',
          issue: '브레드크럼 불일치',
          pagePaths: basePaths,
          channels: [...new Set(breadIssues.map(i => i.channel))],
          note: `기대: ${first.expectedValue}, 실제: ${first.actualValue}`,
          request: 'Excel 기대값 또는 실제 구현 확인 필요',
          hasXStatus: true,
        });
        bucketGenerated = true;
      }

      if (loginOnlySession && loginSessionIssues.length > 0) {
        rows.push({
          type: '페이지',
          issue: `로그인 세션 미반영 (${loginSessionIssues.length}건)`,
          pagePaths: basePaths,
          channels: [...new Set(loginSessionIssues.map(i => i.channel))],
          note: 'ISLOGIN=N, GCID 미수집 (로그인 채널)',
          request: '로그인 상태에서 해당 URL 세션 유지 확인 필요',
          hasXStatus: true,
        });
        bucketGenerated = true;
      }

      if (otherIssues.length > 0) {
        const otherVarNames = [...new Set(otherIssues.map(i => i.variableName))];
        rows.push({
          type: '페이지',
          issue: `다수 변수 실패 (${otherIssues.length}건)`,
          pagePaths: basePaths,
          channels: [...new Set(otherIssues.map(i => i.channel))],
          note: `실패 변수: ${otherVarNames.slice(0, 5).join(', ')}${otherVarNames.length > 5 ? ` 외 ${otherVarNames.length - 5}건` : ''}`,
          request: '해당 페이지 GTM 태깅 점검 필요',
          hasXStatus: true,
        });
        bucketGenerated = true;
      }

      // 모든 버킷이 비어있는 경우 (이론상 발생하지 않음)
      if (!bucketGenerated) {
        rows.push({
          type: '페이지',
          issue: `다수 변수 실패 (${group.xCount}건)`,
          pagePaths: basePaths,
          channels: baseChannels,
          note: `실패 변수: ${uniqueFailedVars.slice(0, 5).join(', ')}${uniqueFailedVars.length > 5 ? ` 외 ${uniqueFailedVars.length - 5}건` : ''}`,
          request: '해당 페이지 GTM 태깅 점검 필요',
          hasXStatus: true,
        });
      }
    }
  }

  return rows;
}

/**
 * 변수 이슈 행 생성 (페이지 이슈 제외 후)
 */
function buildVariableIssueRows(
  rawIssues: RawIssue[],
  pageIssueURLs: Set<string>,
  allRawIssues: RawIssue[],
): OverviewRow[] {
  const rows: OverviewRow[] = [];

  // 페이지 이슈 URL 제외한 이슈만 필터
  const filteredIssues = rawIssues.filter(i => !pageIssueURLs.has(i.url));

  // 변수명으로 그루핑
  const varGrouped = new Map<string, {
    pagePaths: Set<string>;
    channels: Set<string>;
    actualValues: string[];
    expectedValues: string[];
    issuePagePaths: string[];  // expectedValues와 1:1 대응되는 pagePath
    hasX: boolean;
    totalCount: number;
  }>();

  for (const issue of filteredIssues) {
    if (!varGrouped.has(issue.variableName)) {
      varGrouped.set(issue.variableName, {
        pagePaths: new Set(),
        channels: new Set(),
        actualValues: [],
        expectedValues: [],
        issuePagePaths: [],
        hasX: false,
        totalCount: 0,
      });
    }
    const group = varGrouped.get(issue.variableName)!;
    group.pagePaths.add(issue.pagePath);
    group.channels.add(issue.channel);
    group.actualValues.push(issue.actualValue);
    group.expectedValues.push(issue.expectedValue);
    group.issuePagePaths.push(issue.pagePath);
    if (issue.status === 'X') group.hasX = true;
    group.totalCount++;
  }

  // 행 생성
  for (const [varName, group] of varGrouped) {
    let note = buildNoteFromActualValues(group.actualValues, group.totalCount);
    let request = buildRequestFromExpectedValues(
      group.expectedValues,
      group.issuePagePaths,
      varName,
    );

    // 특수 케이스: ISLOGIN이 로그인 채널에서만 실패
    if (varName === 'AP_DATA_ISLOGIN') {
      const isloginIssues = filteredIssues.filter(i => i.variableName === 'AP_DATA_ISLOGIN');
      if (isLoginChannelOnly(isloginIssues)) {
        note = `로그인 채널 전용 실패 - 현재 값: N (${isloginIssues.length}건)`;
        request = '해당 URL 로그인 세션 유지 확인 필요';
      }
    }

    // 특수 케이스: GCID - 같은 URL에서 ISLOGIN도 실패하면 연쇄 실패
    if (varName === 'AP_DATA_GCID') {
      const gcidIssues = filteredIssues.filter(i => i.variableName === 'AP_DATA_GCID');
      const gcidURLs = new Set(gcidIssues.map(i => i.url));
      const isloginAlsoFails = gcidURLs.size > 0 && [...gcidURLs].every(url =>
        allRawIssues.some(i =>
          i.url === url && i.variableName === 'AP_DATA_ISLOGIN' &&
          (i.status === 'X' || i.status === '△'),
        ),
      );
      if (isloginAlsoFails) {
        note = `ISLOGIN=N에 따른 연쇄 실패 - ${gcidIssues.length}건`;
        request = 'ISLOGIN 문제 해결 시 함께 해결 예상';
      }
    }

    rows.push({
      type: '변수',
      issue: varName,
      pagePaths: [...group.pagePaths],
      channels: [...group.channels],
      note,
      request,
      hasXStatus: group.hasX,
    });
  }

  return rows;
}

/**
 * 참고 (현재 상태) 생성 규칙
 */
function buildNoteFromActualValues(actualValues: string[], _totalCount: number): string {
  // 값별 건수 집계
  const valueCounts = new Map<string, number>();
  for (const val of actualValues) {
    const displayVal = (!val || val === 'undefined' || val === '') ? '미선언 (undefined)' : val;
    valueCounts.set(displayVal, (valueCounts.get(displayVal) || 0) + 1);
  }

  if (valueCounts.size === 1) {
    // 전부 같은 값
    const [displayVal, count] = [...valueCounts.entries()][0];
    if (displayVal === '미선언 (undefined)') {
      return `미선언 (undefined) - ${count}건`;
    }
    return `현재 값: ${displayVal} - ${count}건`;
  }

  // 값이 다양: 값별 건수 표시
  const parts: string[] = [];
  for (const [displayVal, count] of valueCounts) {
    const shortened = displayVal.length > 20 ? displayVal.substring(0, 20) + '...' : displayVal;
    parts.push(`${shortened} (${count}건)`);
  }
  return parts.join(', ');
}

/**
 * 요청사항 생성 규칙
 */
function buildRequestFromExpectedValues(
  expectedValues: string[],
  pagePaths: string[],
  _varName: string,
): string {
  // 고유 기대값 추출
  const uniqueExpected = [...new Set(expectedValues)];

  if (uniqueExpected.length === 1) {
    const val = uniqueExpected[0];
    return `'${val}'으로 설정 필요`;
  }

  if (uniqueExpected.length <= 5) {
    // 페이지별 기대값 나열
    const lines: string[] = [];
    const pathExpectedMap = new Map<string, Set<string>>();
    for (let i = 0; i < expectedValues.length && i < pagePaths.length; i++) {
      if (!pathExpectedMap.has(pagePaths[i])) {
        pathExpectedMap.set(pagePaths[i], new Set());
      }
      pathExpectedMap.get(pagePaths[i])!.add(expectedValues[i]);
    }
    // 중복된 기대값에 대해 대표 매핑만
    for (const expected of uniqueExpected) {
      const matchingPaths = [...pathExpectedMap.entries()]
        .filter(([, vals]) => vals.has(expected))
        .map(([p]) => p);
      const pathDisplay = matchingPaths.length <= 2
        ? matchingPaths.join(', ')
        : `${matchingPaths[0]} 외 ${matchingPaths.length - 1}건`;
      lines.push(`${pathDisplay}: '${expected}'`);
    }
    return lines.join('\n');
  }

  // 5종 초과
  return `페이지별 기대값 상이 (${uniqueExpected.length}종) - 채널 탭 참조`;
}

/**
 * Overview 탭 생성 (재설계)
 */
function buildOverviewSheet(
  workbook: ExcelJS.Workbook,
  rawIssues: RawIssue[],
  collectedData: Record<string, GlobalVariableCollectedData[]>,
): void {
  const ws = workbook.addWorksheet('Overview');

  // 컬럼 정의
  ws.columns = [
    { header: '타입', key: 'type', width: 10 },
    { header: '이슈사항', key: 'issue', width: 30 },
    { header: 'Page Path', key: 'page_path', width: 40 },
    { header: '채널', key: 'channel', width: 20 },
    { header: '참고 (현재 상태)', key: 'note', width: 35 },
    { header: '요청사항', key: 'request', width: 40 },
    { header: '회신', key: 'reply', width: 25 },
  ];

  // 헤더 스타일
  applyHeaderStyle(ws.getRow(1));

  // 페이지 이슈 감지
  const pageIssueURLs = detectPageIssueURLs(rawIssues, collectedData);

  // Tier 1: 페이지 이슈
  const pageRows = buildPageIssueRows(rawIssues, pageIssueURLs, collectedData);

  // Tier 2: 변수 이슈
  const variableRows = buildVariableIssueRows(rawIssues, pageIssueURLs, rawIssues);

  const allRows = [...pageRows, ...variableRows];

  if (allRows.length === 0) {
    ws.addRow({
      type: '-',
      issue: '이슈 없음',
      page_path: '-',
      channel: '-',
      note: '모든 채널에서 검증 통과',
      request: '-',
      reply: '',
    });
    return;
  }

  // 데이터 행 추가
  for (const entry of allRows) {
    const row = ws.addRow({
      type: entry.type,
      issue: entry.issue,
      page_path: entry.pagePaths.join('\n'),
      channel: entry.channels.join(', '),
      note: entry.note,
      request: entry.request,
      reply: '',
    });

    // Page Path 셀 wrapText
    const pagePathCell = row.getCell('page_path');
    pagePathCell.alignment = { vertical: 'top', wrapText: true };

    // 요청사항 셀 wrapText
    const requestCell = row.getCell('request');
    requestCell.alignment = { vertical: 'top', wrapText: true };

    // 스타일링
    if (entry.hasXStatus) {
      row.eachCell((cell) => {
        cell.fill = FAIL_FILL;
        cell.border = THIN_BORDER;
      });
    } else {
      row.eachCell((cell) => {
        cell.fill = PARTIAL_FILL;
        cell.border = THIN_BORDER;
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// 채널 탭 생성
// ─────────────────────────────────────────────────────────────────────

function buildChannelSheet(
  workbook: ExcelJS.Workbook,
  channel: string,
  collected: GlobalVariableCollectedData[],
  urlSpecs: URLVariableSpec[],
  validation: GlobalVariableValidationOutput | null,
): void {
  const tabName = CHANNEL_TAB_NAMES[channel] || channel;
  const ws = workbook.addWorksheet(tabName);

  // 컬럼 설정
  ws.columns = CHANNEL_COLUMNS.map(col => ({
    header: col,
    key: col,
    width: col === 'url' ? 50 : col === 'note' ? 40 : col === 'page_path' ? 25 : 18,
  }));

  // 헤더 스타일
  applyHeaderStyle(ws.getRow(1));

  // 데이터 행
  for (const data of collected) {
    // URL에서 page_path 추출
    let pagePath = '';
    try {
      pagePath = new URL(data.url).pathname;
    } catch {
      pagePath = data.url;
    }

    // 매칭되는 URL 스펙 찾기
    const spec = urlSpecs.find(s => s.url === data.url);

    // validation 결과에서 해당 URL의 judgment 찾기
    const urlResult = validation?.url_results.find(r => r.url === data.url);
    const judgmentMap = new Map<string, VariableJudgment>();
    if (urlResult) {
      for (const j of urlResult.judgments) {
        judgmentMap.set(j.variable_name, j);
      }
    }

    // note 구성: 실패/부분 항목 표시
    const noteItems: string[] = [];
    if (data.errors.length > 0) {
      noteItems.push(`Error: ${data.errors.join('; ')}`);
    }

    // 각 변수별 실제 값 추출
    const rowData: Record<string, unknown> = {
      page_path: pagePath,
      url: data.url,
    };

    const AP_VARIABLES = [
      'AP_DATA_SITENAME', 'AP_DATA_COUNTRY', 'AP_DATA_LANG',
      'AP_DATA_ENV', 'AP_DATA_CHANNEL', 'AP_DATA_BREAD',
      'AP_DATA_PAGETYPE', 'AP_PROMO_ID', 'AP_PROMO_NAME',
      'AP_DATA_ISLOGIN', 'AP_DATA_GCID', 'AP_DATA_CID',
      'AP_DATA_ISMEMBER', 'AP_DATA_CG', 'AP_DATA_CD',
      'AP_DATA_LOGINTYPE', 'AP_DATA_CT', 'AP_DATA_BEAUTYCT',
      'AP_DATA_ISEMPLOYEE',
    ];

    for (const varName of AP_VARIABLES) {
      const cv = data.variables[varName];
      const actualVal = cv?.value !== undefined && cv?.value !== null ? String(cv.value) : '';
      rowData[varName] = actualVal;

      // 판정 결과 확인
      const judgment = judgmentMap.get(varName);
      if (judgment && (judgment.status === 'X' || judgment.status === '△')) {
        noteItems.push(`${varName}: ${judgment.reason || judgment.status}`);
      }
    }

    // 정답지 컬럼 (BREAD, PAGETYPE)
    rowData['AP_DATA_BREAD(정답지)'] = spec?.expected_values['AP_DATA_BREAD']?.value ?? '';
    rowData['AP_DATA_PAGETYPE(정답지)'] = spec?.expected_values['AP_DATA_PAGETYPE']?.value ?? '';

    rowData['note'] = noteItems.join(' | ');

    const row = ws.addRow(rowData);
    row.eachCell((cell) => {
      cell.border = THIN_BORDER;
    });

    // 실패/부분 셀 스타일링
    for (let colIdx = 0; colIdx < CHANNEL_COLUMNS.length; colIdx++) {
      const colName = CHANNEL_COLUMNS[colIdx];
      if (!AP_VARIABLES.includes(colName)) continue;

      const judgment = judgmentMap.get(colName);
      if (!judgment) continue;

      const cell = row.getCell(colIdx + 1);
      if (judgment.status === 'X') {
        cell.fill = FAIL_FILL;
      } else if (judgment.status === '△') {
        cell.fill = PARTIAL_FILL;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// 메인 Excel 생성 함수
// ─────────────────────────────────────────────────────────────────────

export async function generateExcelReport(input: ExcelReportInput): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'QA Pipeline v1.0';
  workbook.created = new Date();

  // 1. Raw Issues 수집
  const rawIssues = collectRawIssues(input.results);

  // 2. Overview 탭 (집약된 리포트)
  buildOverviewSheet(workbook, rawIssues, input.collectedData);

  // 3. 채널별 탭 (순서: PC_LOGIN, PC_NO_LOGIN, MO_LOGIN, MO_NO_LOGIN)
  for (const channel of CHANNEL_ORDER) {
    const collected = input.collectedData[channel] || [];
    const specs = input.urlSpecs[channel] || [];
    const validation = input.results[channel] || null;

    buildChannelSheet(workbook, channel, collected, specs, validation);
  }

  // 4. 이슈_상세 탭 (로우 데이터 - 마지막 탭)
  buildRawIssueSheet(workbook, rawIssues);

  // 출력 디렉토리 확인
  const absoluteDir = path.resolve(input.outputDir);
  if (!fs.existsSync(absoluteDir)) {
    fs.mkdirSync(absoluteDir, { recursive: true });
  }

  // 파일명 생성
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const fileName = `qa_global_multi_channel_${dateStr}.xlsx`;
  const filePath = path.join(absoluteDir, fileName);

  // 저장
  await workbook.xlsx.writeFile(filePath);

  return filePath;
}
