/**
 * Parser Agent - 통합 진입점
 *
 * 개발가이드 PDF + appendix PDF + Pre-Requirement Excel 파싱 후
 * GlobalVariableSpec JSON 출력
 */

import { parsePDFs, type PDFVariableDefinition, type SiteMapping } from './pdf-parser';
import { parseExcel, type ExcelURLEntry } from './excel-parser';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export type ValidationJudgmentType =
  | 'exact_match'           // 기대값과 정확히 일치
  | 'not_equal'             // 특정 값이 아닌지 체크 (예: ≠PRD)
  | 'channel_based'         // 채널 조건에 따라 결정
  | 'excel_match'           // Excel 기대값과 match
  | 'conditional_existence' // 조건부 값 존재 체크
  | 'pattern_match'         // 정규식 패턴 체크
  | 'allowed_values'        // 허용값 목록 체크
  | 'existence_check'       // 값 존재 여부만 체크
  | 'login_cross_check';    // 로그인 상태 연계 체크

/** 변수별 판정 규칙 */
export interface VariableJudgmentRule {
  variable_name: string;
  description: string;
  category: 'site_info' | 'page_info' | 'user_info' | 'promo_info';
  judgment_type: ValidationJudgmentType;
  /** 기대값 (정적) */
  expected_value?: unknown;
  /** 허용값 목록 */
  allowed_values?: string[];
  /** 패턴 (정규식) */
  pattern?: string;
  /** 비로그인 시 N/A 여부 */
  na_when_no_login: boolean;
  /** 조건부 규칙 설명 */
  condition_description?: string;
}

/** Parser Agent의 최종 출력 */
export interface GlobalVariableParserOutput {
  /** URL별 판정 규칙 + 기대값 */
  url_specs: URLVariableSpec[];
  /** 전체 변수 판정 규칙 */
  judgment_rules: VariableJudgmentRule[];
  /** 사이트 매핑 */
  site_mappings: SiteMapping[];
  /** 경고 */
  warnings: string[];
}

/** URL별 변수 기대값 */
export interface URLVariableSpec {
  url: string;
  page_type: string;
  page_bread: string;
  channel: 'pc_login' | 'pc_no_login' | 'mo_login' | 'mo_no_login';
  expected_values: Record<string, ExpectedValue>;
}

export interface ExpectedValue {
  value: unknown;
  source: string;  // 'pdf_appendix' | 'excel' | 'channel_rule' | 'env_rule' | 'conditional'
}

// ─────────────────────────────────────────────────────────────────────
// 판정 규칙 생성
// ─────────────────────────────────────────────────────────────────────

export function buildJudgmentRules(_pdfVars: PDFVariableDefinition[]): VariableJudgmentRule[] {
  return [
    // 1~5: 사이트 정보 변수
    {
      variable_name: 'AP_DATA_SITENAME',
      description: '사이트명',
      category: 'site_info',
      judgment_type: 'exact_match',
      na_when_no_login: false,
      condition_description: 'URL domain 기준 appendix PDF 매핑 exact match',
    },
    {
      variable_name: 'AP_DATA_COUNTRY',
      description: '국가 코드',
      category: 'site_info',
      judgment_type: 'exact_match',
      na_when_no_login: false,
      condition_description: 'URL path 기준 appendix PDF 매핑 exact match',
    },
    {
      variable_name: 'AP_DATA_LANG',
      description: '언어 코드',
      category: 'site_info',
      judgment_type: 'exact_match',
      na_when_no_login: false,
      condition_description: 'URL path 기준 appendix PDF 매핑 exact match',
    },
    {
      variable_name: 'AP_DATA_ENV',
      description: '환경 구분',
      category: 'site_info',
      judgment_type: 'not_equal',
      expected_value: 'PRD',
      na_when_no_login: false,
      condition_description: '테스트 환경에서 "PRD"이면 X',
    },
    {
      variable_name: 'AP_DATA_CHANNEL',
      description: '채널 구분',
      category: 'site_info',
      judgment_type: 'channel_based',
      allowed_values: ['PC', 'MOBILE'],
      na_when_no_login: false,
      condition_description: 'pc→"PC", mo→"MOBILE" exact match',
    },
    // 6~7: 페이지 정보 변수
    {
      variable_name: 'AP_DATA_BREAD',
      description: '페이지 브레드크럼',
      category: 'page_info',
      judgment_type: 'excel_match',
      na_when_no_login: false,
      condition_description: 'Pre-Requirement Excel page_bread 컬럼 값과 match',
    },
    {
      variable_name: 'AP_DATA_PAGETYPE',
      description: '페이지 타입',
      category: 'page_info',
      judgment_type: 'excel_match',
      na_when_no_login: false,
      condition_description: 'Pre-Requirement Excel page_type 컬럼 값과 match',
    },
    // 8~9: 프로모션 변수
    {
      variable_name: 'AP_PROMO_ID',
      description: '프로모션 ID',
      category: 'promo_info',
      judgment_type: 'conditional_existence',
      na_when_no_login: false,
      condition_description: 'page_type=EVENT_DETAIL → 값 존재 체크, 나머지 → undefined OK',
    },
    {
      variable_name: 'AP_PROMO_NAME',
      description: '프로모션명',
      category: 'promo_info',
      judgment_type: 'conditional_existence',
      na_when_no_login: false,
      condition_description: 'page_type=EVENT_DETAIL → 값 존재 체크, 나머지 → undefined OK',
    },
    // 10: 로그인 여부
    {
      variable_name: 'AP_DATA_ISLOGIN',
      description: '로그인 여부',
      category: 'user_info',
      judgment_type: 'channel_based',
      allowed_values: ['Y', 'N'],
      na_when_no_login: false,
      condition_description: 'login채널→"Y", no_login채널→"N". Y일 때 GCID+CID cross-check',
    },
    // 11~19: 사용자 변수 (비로그인 시 N/A)
    {
      variable_name: 'AP_DATA_GCID',
      description: '통합회원 ID (SHA512)',
      category: 'user_info',
      judgment_type: 'pattern_match',
      pattern: '^[a-fA-F0-9]{128}$',
      na_when_no_login: true,
      condition_description: 'SHA512 128자 hex. ISLOGIN=Y일 때 필수',
    },
    {
      variable_name: 'AP_DATA_CID',
      description: '고객 ID (SHA512)',
      category: 'user_info',
      judgment_type: 'pattern_match',
      pattern: '^[a-fA-F0-9]{128}$',
      na_when_no_login: true,
      condition_description: 'SHA512 128자 hex. 비통합회원 → undefined OK',
    },
    {
      variable_name: 'AP_DATA_ISMEMBER',
      description: '회원 여부',
      category: 'user_info',
      judgment_type: 'allowed_values',
      allowed_values: ['Y', 'N'],
      na_when_no_login: true,
    },
    {
      variable_name: 'AP_DATA_CG',
      description: '성별',
      category: 'user_info',
      judgment_type: 'allowed_values',
      allowed_values: ['F', 'M'],
      na_when_no_login: true,
      condition_description: '정보 없으면 undefined OK',
    },
    {
      variable_name: 'AP_DATA_CD',
      description: '생년',
      category: 'user_info',
      judgment_type: 'pattern_match',
      pattern: '^\\d{4}$',
      na_when_no_login: true,
      condition_description: 'YYYY 형식 (4자리 숫자). 정보 없으면 undefined OK',
    },
    {
      variable_name: 'AP_DATA_LOGINTYPE',
      description: '로그인 유형',
      category: 'user_info',
      judgment_type: 'allowed_values',
      allowed_values: ['NORMAL', 'MOBILE', 'AUTO', 'ORDER_NUMBER'],
      na_when_no_login: true,
      condition_description: '정보 없으면 undefined OK',
    },
    {
      variable_name: 'AP_DATA_CT',
      description: '회원 등급',
      category: 'user_info',
      judgment_type: 'existence_check',
      na_when_no_login: true,
      condition_description: '값 존재 체크. 등급 없으면 undefined OK',
    },
    {
      variable_name: 'AP_DATA_BEAUTYCT',
      description: '뷰티 포인트 등급',
      category: 'user_info',
      judgment_type: 'allowed_values',
      allowed_values: ['FAMILY', 'GREEN', 'SILVER', 'GOLD', 'PLATINUM'],
      na_when_no_login: true,
      condition_description: '비통합회원 → undefined OK',
    },
    {
      variable_name: 'AP_DATA_ISEMPLOYEE',
      description: '임직원 여부',
      category: 'user_info',
      judgment_type: 'allowed_values',
      allowed_values: ['Y', 'N'],
      na_when_no_login: true,
      condition_description: '정보 없으면 undefined OK',
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────
// URL별 기대값 계산
// ─────────────────────────────────────────────────────────────────────

export function buildURLSpecs(
  excelURLs: ExcelURLEntry[],
  siteMappings: SiteMapping[],
  channel: 'pc_login' | 'pc_no_login' | 'mo_login' | 'mo_no_login',
  isProduction = false,
): URLVariableSpec[] {
  const isLogin = channel.includes('login') && !channel.includes('no_login');
  const isPC = channel.startsWith('pc');
  const unmappedDomains = new Map<string, number>();

  const specs = excelURLs
    .filter(entry => entry.channels[channel])
    .map(entry => {
      // URL에서 도메인 추출
      let domain = '';
      try {
        domain = new URL(entry.url).hostname.replace(/^www\./, '');
      } catch {
        domain = entry.url;
      }

      // 사이트 매핑 조회
      const mapping = siteMappings.find(m => domain.includes(m.domain) || m.domain.includes(domain));

      // 매핑 누락 추적
      if (!mapping) {
        unmappedDomains.set(domain, (unmappedDomains.get(domain) || 0) + 1);
      }

      const expected: Record<string, ExpectedValue> = {};

      // 1. SITENAME
      expected['AP_DATA_SITENAME'] = {
        value: mapping?.site_name || domain.split('.')[0].toUpperCase(),
        source: 'pdf_appendix',
      };

      // 2. COUNTRY
      expected['AP_DATA_COUNTRY'] = {
        value: mapping?.country || 'UNKNOWN',
        source: 'pdf_appendix',
      };

      // 3. LANG
      expected['AP_DATA_LANG'] = {
        value: mapping?.language || 'UNKNOWN',
        source: 'pdf_appendix',
      };

      // 4. ENV
      expected['AP_DATA_ENV'] = {
        value: isProduction ? 'PRD' : '≠PRD',
        source: 'env_rule',
      };

      // 5. CHANNEL
      expected['AP_DATA_CHANNEL'] = {
        value: isPC ? 'PC' : 'MOBILE',
        source: 'channel_rule',
      };

      // 6. BREAD
      expected['AP_DATA_BREAD'] = {
        value: entry.page_bread || null,
        source: 'excel',
      };

      // 7. PAGETYPE
      expected['AP_DATA_PAGETYPE'] = {
        value: entry.page_type || null,
        source: 'excel',
      };

      // 8. PROMO_ID (조건부)
      expected['AP_PROMO_ID'] = {
        value: entry.page_type === 'EVENT_DETAIL' ? 'MUST_EXIST' : 'OPTIONAL',
        source: 'conditional',
      };

      // 9. PROMO_NAME (조건부)
      expected['AP_PROMO_NAME'] = {
        value: entry.page_type === 'EVENT_DETAIL' ? 'MUST_EXIST' : 'OPTIONAL',
        source: 'conditional',
      };

      // 10. ISLOGIN
      expected['AP_DATA_ISLOGIN'] = {
        value: isLogin ? 'Y' : 'N',
        source: 'channel_rule',
      };

      // 11~19: 사용자 변수 (비로그인 시 N/A)
      const userVars = [
        'AP_DATA_GCID', 'AP_DATA_CID', 'AP_DATA_ISMEMBER',
        'AP_DATA_CG', 'AP_DATA_CD', 'AP_DATA_LOGINTYPE',
        'AP_DATA_CT', 'AP_DATA_BEAUTYCT', 'AP_DATA_ISEMPLOYEE',
      ];
      for (const v of userVars) {
        expected[v] = {
          value: isLogin ? 'CHECK_BY_RULE' : 'N/A',
          source: isLogin ? 'login_cross_check' : 'channel_rule',
        };
      }

      return {
        url: entry.url,
        page_type: entry.page_type,
        page_bread: entry.page_bread,
        channel,
        expected_values: expected,
      };
    });

  // 매핑 누락 경고 출력
  if (unmappedDomains.size > 0) {
    console.warn('');
    console.warn('  ⚠️  사이트 매핑 누락 경고:');
    for (const [domain, count] of unmappedDomains) {
      console.warn(`     ${domain} → COUNTRY/LANG = UNKNOWN (${count}개 URL)`);
    }
    console.warn('     → --domain-map 옵션 또는 --config 파일 확인 필요');
    console.warn('');
  }

  return specs;
}

// ─────────────────────────────────────────────────────────────────────
// Parser Agent 메인 함수
// ─────────────────────────────────────────────────────────────────────

export interface ParserInput {
  guidePdfPath: string;
  appendixPdfPath: string;
  excelPath: string;
  channel: 'pc_login' | 'pc_no_login' | 'mo_login' | 'mo_no_login';
  /** PRD 환경 테스트 여부 */
  isProduction?: boolean;
}

export function runParser(input: ParserInput): GlobalVariableParserOutput {
  const warnings: string[] = [];

  // 1. PDF 파싱
  const pdfResult = parsePDFs(input.guidePdfPath, input.appendixPdfPath);
  warnings.push(...pdfResult.warnings);

  // 2. Excel 파싱
  const excelResult = parseExcel(input.excelPath);
  warnings.push(...excelResult.warnings);

  // 3. 판정 규칙 생성
  const judgmentRules = buildJudgmentRules(pdfResult.variables);

  // 4. URL별 기대값 계산
  const urlSpecs = buildURLSpecs(excelResult.urls, pdfResult.site_mappings, input.channel, input.isProduction);

  return {
    url_specs: urlSpecs,
    judgment_rules: judgmentRules,
    site_mappings: pdfResult.site_mappings,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────
// 멀티채널 공유 파서 (PDF/Excel 1회 파싱, 채널별 URL 스펙만 재생성)
// ─────────────────────────────────────────────────────────────────────

export type ChannelType = 'pc_login' | 'pc_no_login' | 'mo_login' | 'mo_no_login';

export interface SharedParserResult {
  pdfVariables: PDFVariableDefinition[];
  siteMappings: SiteMapping[];
  excelURLs: ExcelURLEntry[];
  judgmentRules: VariableJudgmentRule[];
  warnings: string[];
  /** 채널별 URL 스펙 생성 함수 (PDF/Excel 재파싱 없이 호출 가능) */
  buildSpecsForChannel: (channel: ChannelType, isProduction?: boolean) => URLVariableSpec[];
}

export function runParserShared(input: Omit<ParserInput, 'channel'>): SharedParserResult {
  const warnings: string[] = [];

  // 1. PDF 파싱 (1회)
  const pdfResult = parsePDFs(input.guidePdfPath, input.appendixPdfPath);
  warnings.push(...pdfResult.warnings);

  // 2. Excel 파싱 (1회)
  const excelResult = parseExcel(input.excelPath);
  warnings.push(...excelResult.warnings);

  // 3. 판정 규칙 (1회)
  const judgmentRules = buildJudgmentRules(pdfResult.variables);

  return {
    pdfVariables: pdfResult.variables,
    siteMappings: pdfResult.site_mappings,
    excelURLs: excelResult.urls,
    judgmentRules,
    warnings,
    buildSpecsForChannel: (channel: ChannelType, isProduction?: boolean) =>
      buildURLSpecs(excelResult.urls, pdfResult.site_mappings, channel, isProduction),
  };
}

// CLI 단독 실행
if (require.main === module) {
  const args = process.argv.slice(2);
  const guidePath = args.find((_, i) => args[i - 1] === '--guide') || '';
  const appendixPath = args.find((_, i) => args[i - 1] === '--appendix') || '';
  const excelPath = args.find((_, i) => args[i - 1] === '--excel') || '';
  const channel = (args.find((_, i) => args[i - 1] === '--channel') || 'pc_no_login') as ParserInput['channel'];

  if (!guidePath || !appendixPath || !excelPath) {
    console.error('Usage: ts-node index.ts --guide <path> --appendix <path> --excel <path> [--channel <channel>]');
    process.exit(1);
  }

  const output = runParser({ guidePdfPath: guidePath, appendixPdfPath: appendixPath, excelPath, channel });
  console.log(JSON.stringify(output, null, 2));
}

export { type SiteMapping, type PDFVariableDefinition } from './pdf-parser';
export { type ExcelURLEntry } from './excel-parser';

// 2차 QA: GTM Parser
export {
  parseGTMContainer,
  type GTMParserOutput,
  type GTMParserOptions,
  type ContentGroupRule,
  type ActionEventRule,
} from './gtm-parser';

// 2차 QA: Dev Guide PDF Parser
export {
  parseDevGuidePDF,
} from './devguide-parser';
