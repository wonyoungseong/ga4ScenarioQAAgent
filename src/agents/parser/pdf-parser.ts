/**
 * PDF Parser - 개발가이드 PDF + appendix PDF 파싱
 *
 * 1. 개발가이드 PDF: "공통 변수 선언" 섹션에서 변수명, Required/Optional, 예시값 추출
 * 2. appendix PDF: URL → site_name/country/language 매핑 테이블 추출
 *
 * 방법: pdftotext (poppler) → 텍스트 → 정규식/패턴 매칭
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

/** 개발가이드에서 추출한 변수 정의 */
export interface PDFVariableDefinition {
  variable_name: string;
  description: string;
  required: boolean;
  data_type: string;
  example_value?: string;
  allowed_values?: string[];
  category: 'site_info' | 'page_info' | 'user_info' | 'promo_info';
}

/** appendix에서 추출한 URL→사이트 매핑 */
export interface SiteMapping {
  domain: string;
  site_name: string;
  country: string;
  language: string;
}

/** PDF 파싱 결과 */
export interface PDFParseOutput {
  variables: PDFVariableDefinition[];
  site_mappings: SiteMapping[];
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────
// PDF → Text 변환
// ─────────────────────────────────────────────────────────────────────

function pdfToText(pdfPath: string): string {
  const absolutePath = path.resolve(pdfPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`PDF 파일이 존재하지 않습니다: ${absolutePath}`);
  }

  try {
    const result = execSync(`pdftotext -layout "${absolutePath}" -`, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return result;
  } catch {
    // pdftotext가 없으면 안내
    throw new Error(
      'pdftotext 명령어를 찾을 수 없습니다. poppler를 설치하세요: brew install poppler'
    );
  }
}

// ─────────────────────────────────────────────────────────────────────
// 개발가이드 PDF 파싱
// ─────────────────────────────────────────────────────────────────────

/**
 * 개발가이드 PDF에서 AP_DATA_* 변수 정의 추출
 */
export function parseGuidePDF(pdfPath: string): PDFVariableDefinition[] {
  const text = pdfToText(pdfPath);
  const variables: PDFVariableDefinition[] = [];
  const warnings: string[] = [];

  // AP_DATA_ 또는 AP_PROMO_ 패턴 매칭
  // 일반적 패턴: 변수명, 설명, Required/Optional, 예시값
  const lines = text.split('\n');

  // 변수명 패턴: AP_DATA_xxx 또는 AP_PROMO_xxx
  const varPattern = /\b(AP_DATA_[A-Z_]+|AP_PROMO_[A-Z_]+)\b/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(varPattern);
    if (!match) continue;

    const varName = match[1];

    // 이미 추출된 변수인지 확인
    if (variables.some(v => v.variable_name === varName)) continue;

    // 주변 컨텍스트에서 정보 추출 (현재 줄 + 다음 5줄)
    const context = lines.slice(i, Math.min(i + 6, lines.length)).join(' ');

    const required = /required|필수/i.test(context) && !/optional|선택/i.test(context);
    const description = extractDescription(varName, context);
    const category = categorizeVariable(varName);
    const exampleValue = extractExampleValue(context);
    const allowedValues = extractAllowedValues(context);

    variables.push({
      variable_name: varName,
      description,
      required,
      data_type: 'string',
      example_value: exampleValue,
      allowed_values: allowedValues.length > 0 ? allowedValues : undefined,
      category,
    });
  }

  // 표준 19개 변수 목록으로 보완 (PDF에서 못 찾은 경우 기본값)
  const standardVars = getStandardVariables();
  for (const sv of standardVars) {
    if (!variables.some(v => v.variable_name === sv.variable_name)) {
      warnings.push(`PDF에서 ${sv.variable_name}을(를) 찾지 못해 기본 정의 사용`);
      variables.push(sv);
    }
  }

  return variables;
}

function extractDescription(varName: string, context: string): string {
  const descMap: Record<string, string> = {
    'AP_DATA_SITENAME': '사이트명',
    'AP_DATA_COUNTRY': '국가 코드',
    'AP_DATA_LANG': '언어 코드',
    'AP_DATA_ENV': '환경 구분',
    'AP_DATA_CHANNEL': '채널 구분 (PC/MOBILE)',
    'AP_DATA_BREAD': '페이지 브레드크럼',
    'AP_DATA_PAGETYPE': '페이지 타입',
    'AP_PROMO_ID': '프로모션 ID',
    'AP_PROMO_NAME': '프로모션명',
    'AP_DATA_ISLOGIN': '로그인 여부',
    'AP_DATA_GCID': '통합회원 ID (SHA512)',
    'AP_DATA_CID': '고객 ID (SHA512)',
    'AP_DATA_ISMEMBER': '회원 여부',
    'AP_DATA_CG': '성별',
    'AP_DATA_CD': '생년',
    'AP_DATA_LOGINTYPE': '로그인 유형',
    'AP_DATA_CT': '회원 등급',
    'AP_DATA_BEAUTYCT': '뷰티 포인트 등급',
    'AP_DATA_ISEMPLOYEE': '임직원 여부',
  };
  return descMap[varName] || context.slice(0, 50).trim();
}

function categorizeVariable(varName: string): PDFVariableDefinition['category'] {
  if (/SITENAME|COUNTRY|LANG|ENV|CHANNEL/.test(varName)) return 'site_info';
  if (/BREAD|PAGETYPE/.test(varName)) return 'page_info';
  if (/PROMO/.test(varName)) return 'promo_info';
  return 'user_info';
}

function extractExampleValue(context: string): string | undefined {
  // "예: xxx" 또는 "example: xxx" 또는 따옴표 안의 값
  const exMatch = context.match(/(?:예[:\s]|example[:\s]*|e\.g\.[:\s]*)["']?([^"'\s,]+)["']?/i);
  return exMatch ? exMatch[1] : undefined;
}

function extractAllowedValues(context: string): string[] {
  // "허용값: A, B, C" 또는 "값: A / B / C" 패턴
  const avMatch = context.match(/(?:허용[값값]|allowed|값)[:\s]*(.+?)(?:\.|$)/i);
  if (avMatch) {
    return avMatch[1].split(/[,/|]/).map(v => v.trim()).filter(Boolean);
  }
  return [];
}

// ─────────────────────────────────────────────────────────────────────
// appendix PDF 파싱
// ─────────────────────────────────────────────────────────────────────

/**
 * appendix PDF에서 domain → site_name/country/language 매핑 추출
 *
 * 실제 PDF 테이블 형식:
 * https://www.innisfree.jp              INNISFREE          JP   JA
 */
export function parseAppendixPDF(pdfPath: string): SiteMapping[] {
  const text = pdfToText(pdfPath);
  const mappings: SiteMapping[] = [];

  const lines = text.split('\n');

  // 실제 appendix PDF 테이블 패턴:
  // URL(https://...)  SITE_NAME  COUNTRY  LANGUAGE
  // 공백으로 구분된 테이블 행
  const tableRowPattern = /(?:https?:\/\/)([\w.-]+(?:\/[\w/-]*)?)\s+([A-Z][A-Z0-9_-]+)\s+([A-Z]{2})\s+([A-Z]{2})/;

  for (const line of lines) {
    const match = line.match(tableRowPattern);
    if (!match) continue;

    const fullDomain = match[1].replace(/\/.*$/, '').replace(/^www\./, '');
    const siteName = match[2];
    const country = match[3];
    const language = match[4];

    // 중복 체크 (같은 domain + country + language)
    if (!mappings.some(m => m.domain === fullDomain && m.country === country && m.language === language)) {
      mappings.push({
        domain: fullDomain,
        site_name: siteName,
        country,
        language,
      });
    }
  }

  // 매핑이 없으면 fallback
  if (mappings.length === 0) {
    return extractMappingsFromText(text);
  }

  return mappings;
}

function extractMappingsFromText(text: string): SiteMapping[] {
  const mappings: SiteMapping[] = [];

  // 테이블 패턴 매칭: 여러 컬럼이 공백/탭으로 구분된 행
  const tableRowPattern = /([\w.-]+\.\w{2,})\s+([A-Z_]+)\s+([A-Z]{2})\s+([A-Z]{2})/g;
  let match;
  while ((match = tableRowPattern.exec(text)) !== null) {
    mappings.push({
      domain: match[1],
      site_name: match[2],
      country: match[3],
      language: match[4],
    });
  }

  return mappings;
}

// ─────────────────────────────────────────────────────────────────────
// 표준 변수 목록 (fallback)
// ─────────────────────────────────────────────────────────────────────

function getStandardVariables(): PDFVariableDefinition[] {
  return [
    { variable_name: 'AP_DATA_SITENAME', description: '사이트명', required: true, data_type: 'string', category: 'site_info' },
    { variable_name: 'AP_DATA_COUNTRY', description: '국가 코드', required: true, data_type: 'string', category: 'site_info' },
    { variable_name: 'AP_DATA_LANG', description: '언어 코드', required: true, data_type: 'string', category: 'site_info' },
    { variable_name: 'AP_DATA_ENV', description: '환경 구분', required: true, data_type: 'string', category: 'site_info' },
    { variable_name: 'AP_DATA_CHANNEL', description: '채널 구분', required: true, data_type: 'string', category: 'site_info' },
    { variable_name: 'AP_DATA_BREAD', description: '페이지 브레드크럼', required: true, data_type: 'string', category: 'page_info' },
    { variable_name: 'AP_DATA_PAGETYPE', description: '페이지 타입', required: true, data_type: 'string', category: 'page_info' },
    { variable_name: 'AP_PROMO_ID', description: '프로모션 ID', required: false, data_type: 'string', category: 'promo_info' },
    { variable_name: 'AP_PROMO_NAME', description: '프로모션명', required: false, data_type: 'string', category: 'promo_info' },
    { variable_name: 'AP_DATA_ISLOGIN', description: '로그인 여부', required: true, data_type: 'string', category: 'user_info' },
    { variable_name: 'AP_DATA_GCID', description: '통합회원 ID (SHA512)', required: false, data_type: 'string', category: 'user_info' },
    { variable_name: 'AP_DATA_CID', description: '고객 ID (SHA512)', required: false, data_type: 'string', category: 'user_info' },
    { variable_name: 'AP_DATA_ISMEMBER', description: '회원 여부', required: false, data_type: 'string', category: 'user_info' },
    { variable_name: 'AP_DATA_CG', description: '성별', required: false, data_type: 'string', category: 'user_info' },
    { variable_name: 'AP_DATA_CD', description: '생년', required: false, data_type: 'string', category: 'user_info' },
    { variable_name: 'AP_DATA_LOGINTYPE', description: '로그인 유형', required: false, data_type: 'string', category: 'user_info' },
    { variable_name: 'AP_DATA_CT', description: '회원 등급', required: false, data_type: 'string', category: 'user_info' },
    { variable_name: 'AP_DATA_BEAUTYCT', description: '뷰티 포인트 등급', required: false, data_type: 'string', category: 'user_info' },
    { variable_name: 'AP_DATA_ISEMPLOYEE', description: '임직원 여부', required: false, data_type: 'string', category: 'user_info' },
  ];
}

/** 전체 PDF 파싱 실행 */
export function parsePDFs(guidePath: string, appendixPath: string): PDFParseOutput {
  const warnings: string[] = [];

  let variables: PDFVariableDefinition[];
  try {
    variables = parseGuidePDF(guidePath);
  } catch (e) {
    warnings.push(`개발가이드 PDF 파싱 실패: ${e instanceof Error ? e.message : String(e)}`);
    variables = getStandardVariables();
    warnings.push('표준 변수 목록 사용 (fallback)');
  }

  let siteMappings: SiteMapping[];
  try {
    siteMappings = parseAppendixPDF(appendixPath);
  } catch (e) {
    warnings.push(`appendix PDF 파싱 실패: ${e instanceof Error ? e.message : String(e)}`);
    siteMappings = [];
  }

  return { variables, site_mappings: siteMappings, warnings };
}
