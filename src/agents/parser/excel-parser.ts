/**
 * Excel Parser - Pre-Requirement Excel 파싱
 *
 * Pre-Requirement Excel에서 URL, page_type, page_bread, 채널 조건 추출
 */

import * as XLSX from 'xlsx';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

/** Excel에서 추출한 URL 항목 */
export interface ExcelURLEntry {
  url: string;
  page_type: string;
  page_bread: string;
  page_description?: string;
  channels: {
    pc_login: boolean;
    pc_no_login: boolean;
    mo_login: boolean;
    mo_no_login: boolean;
  };
}

/** Excel 파싱 결과 */
export interface ExcelParseOutput {
  urls: ExcelURLEntry[];
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────
// 컬럼 매핑 (다양한 헤더명 지원)
// ─────────────────────────────────────────────────────────────────────

const COLUMN_ALIASES: Record<string, string[]> = {
  url: ['url', 'URL', 'test_url', 'Test URL', 'test url', '테스트 URL', '테스트URL', 'link'],
  page_type: ['page_type', 'pageType', 'Page Type', '페이지타입', '페이지 타입', 'pagetype', 'page type', 'page_type(Required)', 'page_type(required)'],
  page_bread: ['page_bread', 'pageBread', 'Page Bread', '브레드크럼', '브레드', 'bread', 'breadcrumb', 'page_bread(Optional)', 'page_bread(optional)'],
  page_description: ['page_description', 'description', '설명', '페이지설명', '페이지 설명', 'page description', 'page_path'],
  // 4채널 직접 구분
  pc_login: ['pc_login', 'PC 로그인', 'PC_LOGIN', 'pc login', 'PC로그인'],
  pc_no_login: ['pc_no_login', 'PC 비로그인', 'PC_NO_LOGIN', 'pc no login', 'PC비로그인'],
  mo_login: ['mo_login', 'MO 로그인', 'MO_LOGIN', 'mo login', 'MO로그인', 'MOBILE 로그인'],
  mo_no_login: ['mo_no_login', 'MO 비로그인', 'MO_NO_LOGIN', 'mo no login', 'MO비로그인', 'MOBILE 비로그인'],
  // 분리형 채널 컬럼 (pc접근 + mobile접근 + login필수)
  login_required: ['login 필수 유무', 'login_required', 'login필수', '로그인필수', '로그인 필수', 'login 필수'],
  pc_access: ['pc 접근', 'pc_access', 'pc접근', 'PC 접근', 'PC접근'],
  mo_access: ['mobile 접근', 'mo_access', 'mo접근', 'MO 접근', 'MOBILE 접근', 'mobile접근'],
};

function findColumn(headers: string[], field: string): number {
  const aliases = COLUMN_ALIASES[field] || [field];
  for (const alias of aliases) {
    const idx = headers.findIndex(h => h?.trim() === alias);
    if (idx !== -1) return idx;
  }
  // partial match
  for (const alias of aliases) {
    const idx = headers.findIndex(h => h?.toLowerCase().includes(alias.toLowerCase()));
    if (idx !== -1) return idx;
  }
  return -1;
}

function isTruthy(val: unknown): boolean {
  if (val === undefined || val === null) return false;
  const s = String(val).trim().toLowerCase();
  return ['o', 'y', 'yes', 'true', '1', 'v', '✓', '○', '●'].includes(s);
}

// ─────────────────────────────────────────────────────────────────────
// Excel 파싱
// ─────────────────────────────────────────────────────────────────────

export function parseExcel(excelPath: string): ExcelParseOutput {
  const absolutePath = path.resolve(excelPath);
  const workbook = XLSX.readFile(absolutePath);
  const warnings: string[] = [];
  const urls: ExcelURLEntry[] = [];

  // 첫 번째 시트 또는 Pre-Requirement 관련 시트 찾기
  const sheetNames = workbook.SheetNames;
  let targetSheet = sheetNames[0];
  for (const name of sheetNames) {
    if (/pre.?req|url|페이지|page/i.test(name)) {
      targetSheet = name;
      break;
    }
  }

  const sheet = workbook.Sheets[targetSheet];
  if (!sheet) {
    throw new Error(`시트를 찾을 수 없습니다: ${targetSheet}`);
  }

  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { header: 1 }) as unknown as unknown[][];

  if (data.length < 2) {
    warnings.push('Excel 데이터가 2행 미만입니다');
    return { urls, warnings };
  }

  // 헤더 행 찾기 (URL 컬럼이 있는 첫 행)
  let headerRow = 0;
  const headers: string[] = [];
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    if (!row) continue;
    const rowStr = row.map(c => String(c || '')).join(' ').toLowerCase();
    if (rowStr.includes('url') || rowStr.includes('page_type') || rowStr.includes('페이지')) {
      headerRow = i;
      for (const cell of row) {
        headers.push(String(cell || '').trim());
      }
      break;
    }
  }

  if (headers.length === 0) {
    // 첫 행을 헤더로 사용
    const firstRow = data[0];
    if (firstRow) {
      for (const cell of firstRow) {
        headers.push(String(cell || '').trim());
      }
    }
  }

  // 컬럼 인덱스 매핑
  const colIdx = {
    url: findColumn(headers, 'url'),
    page_type: findColumn(headers, 'page_type'),
    page_bread: findColumn(headers, 'page_bread'),
    page_description: findColumn(headers, 'page_description'),
    // 4채널 직접 구분
    pc_login: findColumn(headers, 'pc_login'),
    pc_no_login: findColumn(headers, 'pc_no_login'),
    mo_login: findColumn(headers, 'mo_login'),
    mo_no_login: findColumn(headers, 'mo_no_login'),
    // 분리형 채널 컬럼
    login_required: findColumn(headers, 'login_required'),
    pc_access: findColumn(headers, 'pc_access'),
    mo_access: findColumn(headers, 'mo_access'),
  };

  // 채널 구분 방식 결정
  const hasFourChannels = colIdx.pc_login !== -1 || colIdx.pc_no_login !== -1;
  const hasSeparateChannels = colIdx.pc_access !== -1 || colIdx.mo_access !== -1;

  if (colIdx.url === -1) {
    throw new Error(`URL 컬럼을 찾을 수 없습니다. 헤더: [${headers.join(', ')}]`);
  }

  // 데이터 행 파싱
  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;

    const url = String(row[colIdx.url] || '').trim();
    if (!url || !url.startsWith('http')) continue;

    const pageType = colIdx.page_type !== -1 ? String(row[colIdx.page_type] || '').trim() : '';
    const pageBread = colIdx.page_bread !== -1 ? String(row[colIdx.page_bread] || '').trim() : '';
    const pageDesc = colIdx.page_description !== -1 ? String(row[colIdx.page_description] || '').trim() : undefined;

    let channels: ExcelURLEntry['channels'];

    if (hasFourChannels) {
      // 4채널 직접 구분 방식
      channels = {
        pc_login: colIdx.pc_login !== -1 ? isTruthy(row[colIdx.pc_login]) : true,
        pc_no_login: colIdx.pc_no_login !== -1 ? isTruthy(row[colIdx.pc_no_login]) : true,
        mo_login: colIdx.mo_login !== -1 ? isTruthy(row[colIdx.mo_login]) : true,
        mo_no_login: colIdx.mo_no_login !== -1 ? isTruthy(row[colIdx.mo_no_login]) : true,
      };
    } else if (hasSeparateChannels) {
      // 분리형: pc접근 + mobile접근 + login필수 조합
      const pcAccess = colIdx.pc_access !== -1 ? isTruthy(row[colIdx.pc_access]) : true;
      const moAccess = colIdx.mo_access !== -1 ? isTruthy(row[colIdx.mo_access]) : true;
      const loginReq = colIdx.login_required !== -1 ? isTruthy(row[colIdx.login_required]) : false;

      channels = {
        pc_login: pcAccess && loginReq,
        pc_no_login: pcAccess && !loginReq,
        mo_login: moAccess && loginReq,
        mo_no_login: moAccess && !loginReq,
      };
    } else {
      // 채널 컬럼 없음 → 모든 채널 활성
      channels = { pc_login: true, pc_no_login: true, mo_login: true, mo_no_login: true };
    }

    urls.push({
      url,
      page_type: pageType,
      page_bread: pageBread,
      page_description: pageDesc,
      channels,
    });
  }

  if (urls.length === 0) {
    warnings.push('Excel에서 유효한 URL을 찾지 못했습니다');
  }

  return { urls, warnings };
}
