/**
 * Excel Reporter 통합 테스트
 *
 * Mock 데이터로 generateExcelReport()를 실행하여
 * Overview 탭 2-Tier 분류 + 이슈_상세 탭이 정상 생성되는지 검증합니다.
 *
 * 실행: npx ts-node src/__tests__/excel-reporter.test.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import { generateExcelReport, type ExcelReportInput } from '../agents/reporter/excel-reporter';
import type { GlobalVariableValidationOutput, URLValidationResult, VariableJudgment } from '../agents/validator/global-variable-validator';
import type { GlobalVariableCollectedData, CollectedVariableValue } from '../agents/collector/browser-collector';
import type { URLVariableSpec, ExpectedValue } from '../agents/parser';

// ─────────────────────────────────────────────────────────────────────
// 헬퍼: 판정 결과 생성
// ─────────────────────────────────────────────────────────────────────

function makeJudgment(
  name: string,
  status: 'O' | '△' | '-' | 'X',
  expected: string,
  actual: string,
  reason?: string,
): VariableJudgment {
  return {
    variable_name: name,
    description: name,
    source: actual === 'undefined' ? 'not_found' : 'window',
    expected_value: expected,
    actual_value: actual,
    status,
    reason,
  };
}

function makeCollectedVar(value: unknown): CollectedVariableValue {
  return {
    value,
    source: value !== undefined && value !== null ? 'window' : 'not_found',
  };
}

function makeExpected(value: unknown): ExpectedValue {
  return { value, source: 'excel' };
}

// ─────────────────────────────────────────────────────────────────────
// Mock 데이터 구성
// ─────────────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.testbrand.com';

/**
 * 시나리오 1: 페이지 이슈 (핵심 변수 3개 이상 X)
 * URL: /pages/broken → SITENAME, COUNTRY, LANG, ENV, CHANNEL 모두 X
 */
const brokenPageURL = `${BASE_URL}/pages/broken`;
const brokenPageJudgments: VariableJudgment[] = [
  makeJudgment('AP_DATA_SITENAME', 'X', 'TESTBRAND', 'undefined', '변수 미선언'),
  makeJudgment('AP_DATA_COUNTRY', 'X', 'KR', 'undefined', '변수 미선언'),
  makeJudgment('AP_DATA_LANG', 'X', 'KO', 'undefined', '변수 미선언'),
  makeJudgment('AP_DATA_ENV', 'X', '≠PRD', 'undefined', '변수 미선언'),
  makeJudgment('AP_DATA_CHANNEL', 'X', 'PC', 'undefined', '변수 미선언'),
  makeJudgment('AP_DATA_BREAD', 'X', 'HOME>BROKEN', 'undefined', '변수 미선언'),
  makeJudgment('AP_DATA_PAGETYPE', 'X', 'ERROR', 'undefined', '변수 미선언'),
  makeJudgment('AP_DATA_ISLOGIN', 'O', 'Y', 'Y'),
];

/**
 * 시나리오 2: 수집 오류 페이지
 * URL: /pages/error → errors 배열에 오류 메시지
 */
const errorPageURL = `${BASE_URL}/pages/error`;
const errorPageJudgments: VariableJudgment[] = [
  makeJudgment('AP_DATA_SITENAME', 'O', 'TESTBRAND', 'TESTBRAND'),
  makeJudgment('AP_DATA_PAGETYPE', 'O', 'ERROR', 'ERROR'),
];

/**
 * 시나리오 3: 변수 이슈 (BREAD 불일치 - 여러 URL에서 발생)
 */
const breadIssueURLs = [
  `${BASE_URL}/collections/best-sellers`,
  `${BASE_URL}/collections/new`,
  `${BASE_URL}/collections/sale`,
];

function makeBreadIssueJudgments(url: string): VariableJudgment[] {
  const pathName = new URL(url).pathname;
  return [
    makeJudgment('AP_DATA_SITENAME', 'O', 'TESTBRAND', 'TESTBRAND'),
    makeJudgment('AP_DATA_COUNTRY', 'O', 'KR', 'KR'),
    makeJudgment('AP_DATA_LANG', 'O', 'KO', 'KO'),
    makeJudgment('AP_DATA_ENV', 'O', '≠PRD', 'STG'),
    makeJudgment('AP_DATA_CHANNEL', 'O', 'PC', 'PC'),
    makeJudgment('AP_DATA_BREAD', 'X', `COLLECTION>${pathName.split('/').pop()?.toUpperCase()}`, 'undefined', '변수 미선언'),
    makeJudgment('AP_DATA_PAGETYPE', 'O', 'PRODUCT_LIST', 'PRODUCT_LIST'),
    makeJudgment('AP_DATA_ISLOGIN', 'O', 'Y', 'Y'),
  ];
}

/**
 * 시나리오 4: 변수 이슈 (PAGETYPE △ - 대소문자 차이)
 */
const pagetypeIssueURL = `${BASE_URL}/pages/membership`;
const pagetypeIssueJudgments: VariableJudgment[] = [
  makeJudgment('AP_DATA_SITENAME', 'O', 'TESTBRAND', 'TESTBRAND'),
  makeJudgment('AP_DATA_COUNTRY', 'O', 'KR', 'KR'),
  makeJudgment('AP_DATA_LANG', 'O', 'KO', 'KO'),
  makeJudgment('AP_DATA_ENV', 'O', '≠PRD', 'STG'),
  makeJudgment('AP_DATA_CHANNEL', 'O', 'PC', 'PC'),
  makeJudgment('AP_DATA_BREAD', 'O', 'MEMBERSHIP', 'MEMBERSHIP'),
  makeJudgment('AP_DATA_PAGETYPE', '△', 'MEMBERSHIP', 'membership', '대소문자 차이'),
  makeJudgment('AP_DATA_ISLOGIN', 'O', 'Y', 'Y'),
];

/**
 * 시나리오 5: 정상 페이지 (이슈 없음)
 */
const normalURL = `${BASE_URL}/`;
const normalJudgments: VariableJudgment[] = [
  makeJudgment('AP_DATA_SITENAME', 'O', 'TESTBRAND', 'TESTBRAND'),
  makeJudgment('AP_DATA_COUNTRY', 'O', 'KR', 'KR'),
  makeJudgment('AP_DATA_LANG', 'O', 'KO', 'KO'),
  makeJudgment('AP_DATA_ENV', 'O', '≠PRD', 'STG'),
  makeJudgment('AP_DATA_CHANNEL', 'O', 'PC', 'PC'),
  makeJudgment('AP_DATA_BREAD', 'O', 'HOME', 'HOME'),
  makeJudgment('AP_DATA_PAGETYPE', 'O', 'MAIN', 'MAIN'),
  makeJudgment('AP_DATA_ISLOGIN', 'O', 'Y', 'Y'),
];

/**
 * 시나리오 6: 리다이렉트 페이지
 * URL: /account/register → 리다이렉트로 /account 데이터 수집됨
 */
const redirectURL = `${BASE_URL}/account/register`;
const redirectFinalURL = `${BASE_URL}/account`;
const redirectJudgments: VariableJudgment[] = [
  makeJudgment('AP_DATA_SITENAME', '-', '-', '-', '리다이렉트 페이지 - 판정 스킵 [리다이렉트: /account/register → /account]'),
  makeJudgment('AP_DATA_COUNTRY', '-', '-', '-', '리다이렉트 페이지 - 판정 스킵 [리다이렉트: /account/register → /account]'),
  makeJudgment('AP_DATA_LANG', '-', '-', '-', '리다이렉트 페이지 - 판정 스킵 [리다이렉트: /account/register → /account]'),
  makeJudgment('AP_DATA_ENV', '-', '-', '-', '리다이렉트 페이지 - 판정 스킵 [리다이렉트: /account/register → /account]'),
  makeJudgment('AP_DATA_CHANNEL', '-', '-', '-', '리다이렉트 페이지 - 판정 스킵 [리다이렉트: /account/register → /account]'),
  makeJudgment('AP_DATA_BREAD', '-', '-', '-', '리다이렉트 페이지 - 판정 스킵 [리다이렉트: /account/register → /account]'),
  makeJudgment('AP_DATA_PAGETYPE', '-', '-', '-', '리다이렉트 페이지 - 판정 스킵 [리다이렉트: /account/register → /account]'),
  makeJudgment('AP_DATA_ISLOGIN', '-', '-', '-', '리다이렉트 페이지 - 판정 스킵 [리다이렉트: /account/register → /account]'),
];

/**
 * 시나리오 7: 페이지 이슈 - 근본 원인별 버킷 분류 테스트
 * URL: /pages/mixed-issue → BREAD 불일치 + ISLOGIN/GCID 로그인 세션 + 기타 변수
 * 6건 X → 페이지 이슈로 감지, 핵심 변수 정상 → else 블록 진입
 */
const mixedIssueURL = `${BASE_URL}/pages/mixed-issue`;
const mixedIssueJudgments: VariableJudgment[] = [
  makeJudgment('AP_DATA_SITENAME', 'O', 'TESTBRAND', 'TESTBRAND'),
  makeJudgment('AP_DATA_COUNTRY', 'O', 'KR', 'KR'),
  makeJudgment('AP_DATA_LANG', 'O', 'KO', 'KO'),
  makeJudgment('AP_DATA_ENV', 'O', '≠PRD', 'STG'),
  makeJudgment('AP_DATA_CHANNEL', 'O', 'PC', 'PC'),
  makeJudgment('AP_DATA_BREAD', 'X', 'MIXED>PAGE', 'WRONG>PATH', '브레드크럼 불일치'),
  makeJudgment('AP_DATA_PAGETYPE', 'O', 'MIXED', 'MIXED'),
  makeJudgment('AP_DATA_ISLOGIN', 'X', 'Y', 'N', '로그인 상태 미반영'),
  makeJudgment('AP_DATA_GCID', 'X', 'test_gcid', 'undefined', 'GCID 미수집'),
  makeJudgment('AP_DATA_CID', 'X', 'test_cid', 'undefined', 'CID 미수집'),
  makeJudgment('AP_DATA_ISMEMBER', 'X', 'Y', 'undefined', 'ISMEMBER 미수집'),
  makeJudgment('AP_DATA_LOGINTYPE', 'X', 'SSO', 'undefined', 'LOGINTYPE 미수집'),
];

/**
 * 시나리오 8: 변수 이슈 - ISLOGIN/GCID 로그인 채널 전용 실패
 * URL: /pages/login-session → ISLOGIN=N + GCID=undefined (로그인 채널에서만)
 * 2건 X → 페이지 이슈 아님 → 변수 이슈로 분류
 */
const loginSessionURL = `${BASE_URL}/pages/login-session`;
const loginSessionJudgments: VariableJudgment[] = [
  makeJudgment('AP_DATA_SITENAME', 'O', 'TESTBRAND', 'TESTBRAND'),
  makeJudgment('AP_DATA_COUNTRY', 'O', 'KR', 'KR'),
  makeJudgment('AP_DATA_LANG', 'O', 'KO', 'KO'),
  makeJudgment('AP_DATA_ENV', 'O', '≠PRD', 'STG'),
  makeJudgment('AP_DATA_CHANNEL', 'O', 'PC', 'PC'),
  makeJudgment('AP_DATA_BREAD', 'O', 'LOGIN>SESSION', 'LOGIN>SESSION'),
  makeJudgment('AP_DATA_PAGETYPE', 'O', 'LOGIN', 'LOGIN'),
  makeJudgment('AP_DATA_ISLOGIN', 'X', 'Y', 'N', '로그인 상태 미반영'),
  makeJudgment('AP_DATA_GCID', 'X', 'test_gcid', 'undefined', 'GCID 미수집'),
];

// ─────────────────────────────────────────────────────────────────────
// URL Results 조립
// ─────────────────────────────────────────────────────────────────────

function makeURLResult(
  url: string,
  channel: string,
  judgments: VariableJudgment[],
  opts?: { final_url?: string; redirect_detected?: boolean },
): URLValidationResult {
  const total = judgments.length;
  const passed = judgments.filter(j => j.status === 'O').length;
  const partial = judgments.filter(j => j.status === '△').length;
  const na = judgments.filter(j => j.status === '-').length;
  const failed = judgments.filter(j => j.status === 'X').length;
  const applicable = total - na;

  return {
    url,
    final_url: opts?.final_url,
    redirect_detected: opts?.redirect_detected,
    channel,
    page_type: 'TEST',
    page_bread: 'TEST',
    collected_at: new Date().toISOString(),
    judgments,
    summary: {
      total,
      passed,
      partial,
      not_applicable: na,
      failed,
      pass_rate: applicable > 0 ? Math.round((passed / applicable) * 100) : 100,
    },
    cross_check_results: [],
  };
}

// PC_LOGIN validation output
const pcLoginValidation: GlobalVariableValidationOutput = {
  channel: 'pc_login',
  validated_at: new Date().toISOString(),
  url_results: [
    makeURLResult(brokenPageURL, 'pc_login', brokenPageJudgments),
    makeURLResult(errorPageURL, 'pc_login', errorPageJudgments),
    ...breadIssueURLs.map(u => makeURLResult(u, 'pc_login', makeBreadIssueJudgments(u))),
    makeURLResult(pagetypeIssueURL, 'pc_login', pagetypeIssueJudgments),
    makeURLResult(redirectURL, 'pc_login', redirectJudgments, {
      final_url: redirectFinalURL,
      redirect_detected: true,
    }),
    makeURLResult(normalURL, 'pc_login', normalJudgments),
    makeURLResult(mixedIssueURL, 'pc_login', mixedIssueJudgments),
    makeURLResult(loginSessionURL, 'pc_login', loginSessionJudgments),
  ],
  overall_summary: {
    total_urls: 10,
    total_variables: 64,
    passed: 46,
    partial: 1,
    not_applicable: 0,
    failed: 17,
    pass_rate: 72,
  },
};

// MO_LOGIN도 BREAD 이슈 포함 (크로스 채널 테스트)
const moLoginValidation: GlobalVariableValidationOutput = {
  channel: 'mo_login',
  validated_at: new Date().toISOString(),
  url_results: [
    makeURLResult(breadIssueURLs[0], 'mo_login', makeBreadIssueJudgments(breadIssueURLs[0])),
    makeURLResult(redirectURL, 'mo_login', redirectJudgments, {
      final_url: redirectFinalURL,
      redirect_detected: true,
    }),
    makeURLResult(normalURL, 'mo_login', normalJudgments),
    makeURLResult(mixedIssueURL, 'mo_login', mixedIssueJudgments),
    makeURLResult(loginSessionURL, 'mo_login', loginSessionJudgments),
  ],
  overall_summary: {
    total_urls: 5,
    total_variables: 24,
    passed: 20,
    partial: 0,
    not_applicable: 0,
    failed: 3,
    pass_rate: 83,
  },
};

// ─────────────────────────────────────────────────────────────────────
// Collected Data 조립
// ─────────────────────────────────────────────────────────────────────

function makeCollectedData(
  url: string,
  channel: 'pc_login' | 'pc_no_login' | 'mo_login' | 'mo_no_login',
  variables: Record<string, unknown>,
  errors: string[] = [],
  final_url?: string,
): GlobalVariableCollectedData {
  const vars: Record<string, CollectedVariableValue> = {};
  for (const [k, v] of Object.entries(variables)) {
    vars[k] = makeCollectedVar(v);
  }
  return {
    channel,
    url,
    collected_at: new Date().toISOString(),
    variables: vars,
    errors,
    final_url,
  };
}

const pcLoginCollected: GlobalVariableCollectedData[] = [
  // 페이지 이슈: 핵심 변수 모두 미선언
  makeCollectedData(brokenPageURL, 'pc_login', {
    AP_DATA_ISLOGIN: 'Y',
  }),
  // 수집 오류 페이지
  makeCollectedData(errorPageURL, 'pc_login', {
    AP_DATA_SITENAME: 'TESTBRAND',
    AP_DATA_PAGETYPE: 'ERROR',
  }, ['page.goto timeout 30000ms exceeded']),
  // BREAD 미선언 URL들
  ...breadIssueURLs.map(u => makeCollectedData(u, 'pc_login', {
    AP_DATA_SITENAME: 'TESTBRAND',
    AP_DATA_COUNTRY: 'KR',
    AP_DATA_LANG: 'KO',
    AP_DATA_ENV: 'STG',
    AP_DATA_CHANNEL: 'PC',
    AP_DATA_PAGETYPE: 'PRODUCT_LIST',
    AP_DATA_ISLOGIN: 'Y',
  })),
  // PAGETYPE 대소문자 이슈
  makeCollectedData(pagetypeIssueURL, 'pc_login', {
    AP_DATA_SITENAME: 'TESTBRAND',
    AP_DATA_COUNTRY: 'KR',
    AP_DATA_LANG: 'KO',
    AP_DATA_ENV: 'STG',
    AP_DATA_CHANNEL: 'PC',
    AP_DATA_BREAD: 'MEMBERSHIP',
    AP_DATA_PAGETYPE: 'membership',
    AP_DATA_ISLOGIN: 'Y',
  }),
  // 리다이렉트 페이지: /account/register → /account
  makeCollectedData(redirectURL, 'pc_login', {
    AP_DATA_SITENAME: 'TESTBRAND',
    AP_DATA_COUNTRY: 'KR',
    AP_DATA_LANG: 'KO',
    AP_DATA_ENV: 'STG',
    AP_DATA_CHANNEL: 'PC',
    AP_DATA_BREAD: 'MY PAGE',
    AP_DATA_PAGETYPE: 'MYPAGE',
    AP_DATA_ISLOGIN: 'Y',
  }, [], redirectFinalURL),
  // 정상 페이지
  makeCollectedData(normalURL, 'pc_login', {
    AP_DATA_SITENAME: 'TESTBRAND',
    AP_DATA_COUNTRY: 'KR',
    AP_DATA_LANG: 'KO',
    AP_DATA_ENV: 'STG',
    AP_DATA_CHANNEL: 'PC',
    AP_DATA_BREAD: 'HOME',
    AP_DATA_PAGETYPE: 'MAIN',
    AP_DATA_ISLOGIN: 'Y',
  }),
  // 시나리오 7: 페이지 이슈 - BREAD 불일치 + 로그인 세션 + 기타
  makeCollectedData(mixedIssueURL, 'pc_login', {
    AP_DATA_SITENAME: 'TESTBRAND',
    AP_DATA_COUNTRY: 'KR',
    AP_DATA_LANG: 'KO',
    AP_DATA_ENV: 'STG',
    AP_DATA_CHANNEL: 'PC',
    AP_DATA_BREAD: 'WRONG>PATH',
    AP_DATA_PAGETYPE: 'MIXED',
    AP_DATA_ISLOGIN: 'N',
  }),
  // 시나리오 8: 변수 이슈 - ISLOGIN/GCID 로그인 채널 전용
  makeCollectedData(loginSessionURL, 'pc_login', {
    AP_DATA_SITENAME: 'TESTBRAND',
    AP_DATA_COUNTRY: 'KR',
    AP_DATA_LANG: 'KO',
    AP_DATA_ENV: 'STG',
    AP_DATA_CHANNEL: 'PC',
    AP_DATA_BREAD: 'LOGIN>SESSION',
    AP_DATA_PAGETYPE: 'LOGIN',
    AP_DATA_ISLOGIN: 'N',
  }),
];

const moLoginCollected: GlobalVariableCollectedData[] = [
  makeCollectedData(breadIssueURLs[0], 'mo_login', {
    AP_DATA_SITENAME: 'TESTBRAND',
    AP_DATA_COUNTRY: 'KR',
    AP_DATA_LANG: 'KO',
    AP_DATA_ENV: 'STG',
    AP_DATA_CHANNEL: 'PC',
    AP_DATA_PAGETYPE: 'PRODUCT_LIST',
    AP_DATA_ISLOGIN: 'Y',
  }),
  // 리다이렉트 페이지: /account/register → /account
  makeCollectedData(redirectURL, 'mo_login', {
    AP_DATA_SITENAME: 'TESTBRAND',
    AP_DATA_COUNTRY: 'KR',
    AP_DATA_LANG: 'KO',
    AP_DATA_ENV: 'STG',
    AP_DATA_CHANNEL: 'PC',
    AP_DATA_BREAD: 'MY PAGE',
    AP_DATA_PAGETYPE: 'MYPAGE',
    AP_DATA_ISLOGIN: 'Y',
  }, [], redirectFinalURL),
  makeCollectedData(normalURL, 'mo_login', {
    AP_DATA_SITENAME: 'TESTBRAND',
    AP_DATA_COUNTRY: 'KR',
    AP_DATA_LANG: 'KO',
    AP_DATA_ENV: 'STG',
    AP_DATA_CHANNEL: 'PC',
    AP_DATA_BREAD: 'HOME',
    AP_DATA_PAGETYPE: 'MAIN',
    AP_DATA_ISLOGIN: 'Y',
  }),
  // 시나리오 7: 페이지 이슈 - BREAD 불일치 + 로그인 세션 + 기타
  makeCollectedData(mixedIssueURL, 'mo_login', {
    AP_DATA_SITENAME: 'TESTBRAND',
    AP_DATA_COUNTRY: 'KR',
    AP_DATA_LANG: 'KO',
    AP_DATA_ENV: 'STG',
    AP_DATA_CHANNEL: 'MO',
    AP_DATA_BREAD: 'WRONG>PATH',
    AP_DATA_PAGETYPE: 'MIXED',
    AP_DATA_ISLOGIN: 'N',
  }),
  // 시나리오 8: 변수 이슈 - ISLOGIN/GCID 로그인 채널 전용
  makeCollectedData(loginSessionURL, 'mo_login', {
    AP_DATA_SITENAME: 'TESTBRAND',
    AP_DATA_COUNTRY: 'KR',
    AP_DATA_LANG: 'KO',
    AP_DATA_ENV: 'STG',
    AP_DATA_CHANNEL: 'MO',
    AP_DATA_BREAD: 'LOGIN>SESSION',
    AP_DATA_PAGETYPE: 'LOGIN',
    AP_DATA_ISLOGIN: 'N',
  }),
];

// ─────────────────────────────────────────────────────────────────────
// URL Specs 조립
// ─────────────────────────────────────────────────────────────────────

function makeURLSpec(
  url: string,
  channel: 'pc_login' | 'pc_no_login' | 'mo_login' | 'mo_no_login',
  pageType: string,
  pageBread: string,
): URLVariableSpec {
  return {
    url,
    page_type: pageType,
    page_bread: pageBread,
    channel,
    expected_values: {
      'AP_DATA_SITENAME': makeExpected('TESTBRAND'),
      'AP_DATA_COUNTRY': makeExpected('KR'),
      'AP_DATA_LANG': makeExpected('KO'),
      'AP_DATA_ENV': makeExpected('≠PRD'),
      'AP_DATA_CHANNEL': makeExpected('PC'),
      'AP_DATA_BREAD': makeExpected(pageBread),
      'AP_DATA_PAGETYPE': makeExpected(pageType),
    },
  };
}

const pcLoginSpecs: URLVariableSpec[] = [
  makeURLSpec(brokenPageURL, 'pc_login', 'ERROR', 'HOME>BROKEN'),
  makeURLSpec(errorPageURL, 'pc_login', 'ERROR', 'ERROR'),
  ...breadIssueURLs.map(u => {
    const seg = new URL(u).pathname.split('/').pop()?.toUpperCase() || '';
    return makeURLSpec(u, 'pc_login', 'PRODUCT_LIST', `COLLECTION>${seg}`);
  }),
  makeURLSpec(pagetypeIssueURL, 'pc_login', 'MEMBERSHIP', 'MEMBERSHIP'),
  makeURLSpec(redirectURL, 'pc_login', 'REGISTER', 'REGISTER'),
  makeURLSpec(normalURL, 'pc_login', 'MAIN', 'HOME'),
  makeURLSpec(mixedIssueURL, 'pc_login', 'MIXED', 'MIXED>PAGE'),
  makeURLSpec(loginSessionURL, 'pc_login', 'LOGIN', 'LOGIN>SESSION'),
];

const moLoginSpecs: URLVariableSpec[] = [
  makeURLSpec(breadIssueURLs[0], 'mo_login', 'PRODUCT_LIST', 'COLLECTION>BEST-SELLERS'),
  makeURLSpec(redirectURL, 'mo_login', 'REGISTER', 'REGISTER'),
  makeURLSpec(normalURL, 'mo_login', 'MAIN', 'HOME'),
  makeURLSpec(mixedIssueURL, 'mo_login', 'MIXED', 'MIXED>PAGE'),
  makeURLSpec(loginSessionURL, 'mo_login', 'LOGIN', 'LOGIN>SESSION'),
];

// ─────────────────────────────────────────────────────────────────────
// 테스트 실행
// ─────────────────────────────────────────────────────────────────────

const input: ExcelReportInput = {
  results: {
    pc_login: pcLoginValidation,
    pc_no_login: null,
    mo_login: moLoginValidation,
    mo_no_login: null,
  },
  collectedData: {
    pc_login: pcLoginCollected,
    pc_no_login: [],
    mo_login: moLoginCollected,
    mo_no_login: [],
  },
  urlSpecs: {
    pc_login: pcLoginSpecs,
    pc_no_login: [],
    mo_login: moLoginSpecs,
    mo_no_login: [],
  },
  outputDir: path.resolve(__dirname, '../../output/test'),
};

async function runTest(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║        Excel Reporter 통합 테스트 (Overview 재설계)             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string): void {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.log(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // ───── 1. Excel 파일 생성 ─────
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 1: Excel 파일 생성');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const filePath = await generateExcelReport(input);
  assert(fs.existsSync(filePath), `파일 생성됨: ${path.basename(filePath)}`);
  console.log(`  파일 경로: ${filePath}`);

  // ───── 2. 워크북 읽기 ─────
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  // ───── 3. 탭 구조 검증 ─────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 2: 탭 구조 검증');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const sheetNames = workbook.worksheets.map(ws => ws.name);
  console.log(`  탭 목록: ${sheetNames.join(', ')}`);

  assert(sheetNames.length === 6, `6개 탭 생성 (실제: ${sheetNames.length}개)`);
  assert(sheetNames[0] === 'Overview', `첫 번째 탭 = Overview`);
  assert(sheetNames[1] === 'PC_LOGIN', `두 번째 탭 = PC_LOGIN`);
  assert(sheetNames[2] === 'PC_NO_LOGIN', `세 번째 탭 = PC_NO_LOGIN`);
  assert(sheetNames[3] === 'MO_LOGIN', `네 번째 탭 = MO_LOGIN`);
  assert(sheetNames[4] === 'MO_NO_LOGIN', `다섯 번째 탭 = MO_NO_LOGIN`);
  assert(sheetNames[5] === '이슈_상세', `여섯 번째 탭 = 이슈_상세`);

  // ───── 4. Overview 탭 검증 ─────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 3: Overview 탭 검증');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const overview = workbook.getWorksheet('Overview')!;
  const overviewHeaders = overview.getRow(1).values as (string | undefined)[];
  console.log(`  헤더: ${overviewHeaders.filter(Boolean).join(' | ')}`);

  assert(overviewHeaders.includes('타입'), 'Overview 헤더에 "타입" 존재');
  assert(overviewHeaders.includes('이슈사항'), 'Overview 헤더에 "이슈사항" 존재');
  assert(overviewHeaders.includes('Page Path'), 'Overview 헤더에 "Page Path" 존재');
  assert(overviewHeaders.includes('참고 (현재 상태)'), 'Overview 헤더에 "참고 (현재 상태)" 존재');
  assert(overviewHeaders.includes('요청사항'), 'Overview 헤더에 "요청사항" 존재');

  // 데이터 행 수집
  const overviewRows: { type: string; issue: string; pagePath: string; channel: string; note: string; request: string }[] = [];
  overview.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // 헤더 스킵
    overviewRows.push({
      type: String(row.getCell(1).value || ''),
      issue: String(row.getCell(2).value || ''),
      pagePath: String(row.getCell(3).value || ''),
      channel: String(row.getCell(4).value || ''),
      note: String(row.getCell(5).value || ''),
      request: String(row.getCell(6).value || ''),
    });
  });

  console.log(`\n  Overview 데이터 행 수: ${overviewRows.length}`);
  assert(overviewRows.length > 0, 'Overview에 데이터 행이 존재');

  // 페이지 이슈 행 확인
  const pageIssueRows = overviewRows.filter(r => r.type === '페이지');
  console.log(`  페이지 이슈 행 수: ${pageIssueRows.length}`);
  assert(pageIssueRows.length >= 1, '페이지 이슈가 1건 이상 존재');

  // 핵심 변수 미선언 페이지 이슈 확인
  const coreVarIssue = pageIssueRows.find(r => r.issue.includes('핵심 변수 미선언'));
  assert(coreVarIssue !== undefined, '핵심 변수 미선언 페이지 이슈 존재');
  if (coreVarIssue) {
    assert(coreVarIssue.pagePath.includes('/pages/broken'), '핵심 변수 미선언 → /pages/broken 포함');
    assert(coreVarIssue.note.includes('SITENAME'), '참고에 SITENAME 변수 포함');
    console.log(`    이슈: ${coreVarIssue.issue}`);
    console.log(`    경로: ${coreVarIssue.pagePath}`);
    console.log(`    참고: ${coreVarIssue.note}`);
    console.log(`    요청: ${coreVarIssue.request}`);
  }

  // 수집 오류 페이지 이슈 확인
  const errorIssue = pageIssueRows.find(r => r.issue.includes('수집 오류'));
  assert(errorIssue !== undefined, '수집 오류 페이지 이슈 존재');
  if (errorIssue) {
    assert(errorIssue.note.includes('timeout'), '참고에 timeout 오류 포함');
    console.log(`    이슈: ${errorIssue.issue}`);
    console.log(`    참고: ${errorIssue.note}`);
  }

  // 변수 이슈 행 확인
  const varIssueRows = overviewRows.filter(r => r.type === '변수');
  console.log(`\n  변수 이슈 행 수: ${varIssueRows.length}`);
  assert(varIssueRows.length >= 1, '변수 이슈가 1건 이상 존재');

  // BREAD 변수 이슈 확인
  const breadIssue = varIssueRows.find(r => r.issue === 'AP_DATA_BREAD');
  assert(breadIssue !== undefined, 'AP_DATA_BREAD 변수 이슈 존재');
  if (breadIssue) {
    assert(breadIssue.pagePath.includes('/collections/'), 'BREAD 이슈 Page Path에 /collections/ 포함');
    assert(breadIssue.note.includes('미선언'), 'BREAD 참고에 미선언 표시');
    // 여러 채널에서 발생
    assert(
      breadIssue.channel.includes('PC_LOGIN') && breadIssue.channel.includes('MO_LOGIN'),
      'BREAD 이슈가 PC_LOGIN, MO_LOGIN 채널 모두에서 발생',
    );
    console.log(`    이슈: ${breadIssue.issue}`);
    console.log(`    경로: ${breadIssue.pagePath.substring(0, 80)}...`);
    console.log(`    채널: ${breadIssue.channel}`);
    console.log(`    참고: ${breadIssue.note}`);
    console.log(`    요청: ${breadIssue.request}`);
  }

  // PAGETYPE △ 이슈 확인
  const ptIssue = varIssueRows.find(r => r.issue === 'AP_DATA_PAGETYPE');
  assert(ptIssue !== undefined, 'AP_DATA_PAGETYPE 변수 이슈 존재');
  if (ptIssue) {
    assert(ptIssue.pagePath.includes('/pages/membership'), 'PAGETYPE 이슈 Page Path에 /pages/membership 포함');
    console.log(`    이슈: ${ptIssue.issue}`);
    console.log(`    참고: ${ptIssue.note}`);
  }

  // 페이지 이슈가 변수 이슈보다 먼저 나오는지 확인
  if (pageIssueRows.length > 0 && varIssueRows.length > 0) {
    const firstPageIdx = overviewRows.indexOf(pageIssueRows[0]);
    const firstVarIdx = overviewRows.indexOf(varIssueRows[0]);
    assert(firstPageIdx < firstVarIdx, '페이지 이슈가 변수 이슈보다 먼저 표시');
  }

  // ───── 5. 이슈_상세 탭 검증 ─────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 4: 이슈_상세 탭 검증');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const rawSheet = workbook.getWorksheet('이슈_상세')!;
  const rawHeaders = rawSheet.getRow(1).values as (string | undefined)[];
  console.log(`  헤더: ${rawHeaders.filter(Boolean).join(' | ')}`);

  assert(rawHeaders.includes('채널'), '이슈_상세 헤더에 "채널" 존재');
  assert(rawHeaders.includes('변수명'), '이슈_상세 헤더에 "변수명" 존재');
  assert(rawHeaders.includes('상태'), '이슈_상세 헤더에 "상태" 존재');
  assert(rawHeaders.includes('실제값'), '이슈_상세 헤더에 "실제값" 존재');
  assert(rawHeaders.includes('기대값'), '이슈_상세 헤더에 "기대값" 존재');

  let rawRowCount = 0;
  rawSheet.eachRow((_, rowNumber) => {
    if (rowNumber > 1) rawRowCount++;
  });
  console.log(`  이슈_상세 데이터 행 수: ${rawRowCount}`);

  // brokenPage: 7건 X (pc_login) + breadIssue: 3건 X (pc_login) + 1건 X (mo_login)
  // + pagetypeIssue: 1건 △ (pc_login) = 12건
  // (리다이렉트 페이지는 '-' 스킵이므로 이슈_상세 미포함)
  assert(rawRowCount >= 10, `이슈_상세에 10건 이상의 로우 데이터 (실제: ${rawRowCount}건)`);

  // 개별 행 샘플 확인
  const rawRow2 = rawSheet.getRow(2);
  const rawChannel = String(rawRow2.getCell(1).value || '');
  const rawStatus = String(rawRow2.getCell(5).value || '');
  assert(rawChannel.length > 0, '이슈_상세 첫 행에 채널 정보 존재');
  assert(rawStatus === 'X' || rawStatus === '△', `이슈_상세 첫 행 상태가 X 또는 △ (실제: ${rawStatus})`);

  // ───── 6. 리다이렉트 페이지 이슈 검증 ─────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 5: 리다이렉트 페이지 이슈 검증');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const redirectIssue = pageIssueRows.find(r => r.issue.includes('리다이렉트'));
  assert(redirectIssue !== undefined, 'URL 리다이렉트 페이지 이슈 존재');
  if (redirectIssue) {
    assert(redirectIssue.type === '페이지', '리다이렉트 이슈 타입 = 페이지');
    assert(redirectIssue.issue === 'URL 리다이렉트', '이슈사항 = "URL 리다이렉트"');
    assert(redirectIssue.pagePath.includes('/account/register'), 'Page Path에 /account/register 포함');
    assert(redirectIssue.note.includes('/account/register'), '참고에 원래 경로 포함');
    assert(redirectIssue.note.includes('/account'), '참고에 리다이렉트 대상 경로 포함');
    assert(redirectIssue.request.includes('재평가'), '요청사항에 재평가 안내 포함');
    assert(
      redirectIssue.channel.includes('PC_LOGIN') && redirectIssue.channel.includes('MO_LOGIN'),
      '리다이렉트 이슈가 PC_LOGIN, MO_LOGIN 채널 모두에서 발생',
    );
    console.log(`    이슈: ${redirectIssue.issue}`);
    console.log(`    경로: ${redirectIssue.pagePath}`);
    console.log(`    채널: ${redirectIssue.channel}`);
    console.log(`    참고: ${redirectIssue.note}`);
    console.log(`    요청: ${redirectIssue.request}`);
  }

  // ───── 7. 채널 탭 검증 ─────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 6: 채널 탭 검증');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const pcLoginSheet = workbook.getWorksheet('PC_LOGIN')!;
  let pcLoginRowCount = 0;
  pcLoginSheet.eachRow((_, rowNumber) => {
    if (rowNumber > 1) pcLoginRowCount++;
  });
  assert(pcLoginRowCount === pcLoginCollected.length, `PC_LOGIN 탭에 ${pcLoginCollected.length}건의 데이터 (실제: ${pcLoginRowCount}건)`);

  const moLoginSheet = workbook.getWorksheet('MO_LOGIN')!;
  let moLoginRowCount = 0;
  moLoginSheet.eachRow((_, rowNumber) => {
    if (rowNumber > 1) moLoginRowCount++;
  });
  assert(moLoginRowCount === moLoginCollected.length, `MO_LOGIN 탭에 ${moLoginCollected.length}건의 데이터 (실제: ${moLoginRowCount}건)`);

  // ───── 7. 근본 원인별 버킷 분류 검증 ─────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 7: 근본 원인별 버킷 분류 검증 (페이지 이슈)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 브레드크럼 불일치 버킷
  const breadBucketRow = pageIssueRows.find(r => r.issue.includes('브레드크럼 불일치'));
  assert(breadBucketRow !== undefined, '브레드크럼 불일치 페이지 이슈 존재');
  if (breadBucketRow) {
    assert(breadBucketRow.note.includes('WRONG>PATH'), '참고에 실제 값(WRONG>PATH) 포함');
    assert(breadBucketRow.request.includes('Excel 기대값'), '요청에 Excel 기대값 확인 안내');
    console.log(`    이슈: ${breadBucketRow.issue}`);
    console.log(`    참고: ${breadBucketRow.note}`);
    console.log(`    요청: ${breadBucketRow.request}`);
  }

  // 로그인 세션 미반영 버킷
  const loginSessionBucketRow = pageIssueRows.find(r => r.issue.includes('로그인 세션 미반영'));
  assert(loginSessionBucketRow !== undefined, '로그인 세션 미반영 페이지 이슈 존재');
  if (loginSessionBucketRow) {
    assert(loginSessionBucketRow.note.includes('ISLOGIN=N'), '참고에 ISLOGIN=N 포함');
    assert(loginSessionBucketRow.request.includes('세션 유지'), '요청에 세션 유지 확인 안내');
    console.log(`    이슈: ${loginSessionBucketRow.issue}`);
    console.log(`    참고: ${loginSessionBucketRow.note}`);
    console.log(`    요청: ${loginSessionBucketRow.request}`);
  }

  // 나머지 변수 실패 버킷 (mixed-issue 페이지)
  const otherBucketRow = pageIssueRows.find(r =>
    r.issue.includes('다수 변수 실패') && r.pagePath.includes('/pages/mixed-issue'),
  );
  assert(otherBucketRow !== undefined, '다수 변수 실패 (기타) 페이지 이슈 존재');
  if (otherBucketRow) {
    assert(otherBucketRow.request.includes('GTM 태깅 점검'), '요청에 GTM 태깅 점검 안내');
    console.log(`    이슈: ${otherBucketRow.issue}`);
    console.log(`    참고: ${otherBucketRow.note}`);
    console.log(`    요청: ${otherBucketRow.request}`);
  }

  // ───── 8. ISLOGIN/GCID 변수 이슈 특수 케이스 검증 ─────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 8: ISLOGIN/GCID 변수 이슈 특수 케이스 검증');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const isloginIssue = varIssueRows.find(r => r.issue === 'AP_DATA_ISLOGIN');
  assert(isloginIssue !== undefined, 'AP_DATA_ISLOGIN 변수 이슈 존재');
  if (isloginIssue) {
    assert(isloginIssue.note.includes('로그인 채널 전용 실패'), 'ISLOGIN 참고에 로그인 채널 전용 실패 표시');
    assert(isloginIssue.request.includes('세션 유지'), 'ISLOGIN 요청에 세션 유지 확인 안내');
    console.log(`    이슈: ${isloginIssue.issue}`);
    console.log(`    참고: ${isloginIssue.note}`);
    console.log(`    요청: ${isloginIssue.request}`);
  }

  const gcidIssue = varIssueRows.find(r => r.issue === 'AP_DATA_GCID');
  assert(gcidIssue !== undefined, 'AP_DATA_GCID 변수 이슈 존재');
  if (gcidIssue) {
    assert(gcidIssue.note.includes('ISLOGIN=N에 따른 연쇄 실패'), 'GCID 참고에 연쇄 실패 표시');
    assert(gcidIssue.request.includes('ISLOGIN 문제 해결'), 'GCID 요청에 ISLOGIN 연쇄 안내');
    console.log(`    이슈: ${gcidIssue.issue}`);
    console.log(`    참고: ${gcidIssue.note}`);
    console.log(`    요청: ${gcidIssue.request}`);
  }

  // ───── 결과 요약 ─────
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`테스트 결과: ${passed}/${passed + failed} PASSED`);
  if (failed > 0) {
    console.log(`❌ ${failed}건 실패`);
  } else {
    console.log('✅ 모든 테스트 통과');
  }
  console.log('════════════════════════════════════════════════════════════════\n');

  // 실패 시 exit code 1
  if (failed > 0) {
    process.exit(1);
  }
}

runTest().catch(err => {
  console.error('테스트 실행 중 오류:', err);
  process.exit(1);
});
