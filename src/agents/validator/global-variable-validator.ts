/**
 * Global Variable Validator - 19개 변수 판정 규칙 + Cross-Check
 *
 * 판정 상태 코드:
 * O  - 정상: 기대값과 일치
 * △  - 부분: 형식 불일치 또는 대소문자 차이
 * -  - N/A: 해당 채널/조건에서 검증 불필요
 * X  - 실패: 값 누락, 불일치, 미선언
 */

import type { GlobalVariableCollectedData, CollectedVariableValue } from '../collector';
import type { URLVariableSpec, VariableJudgmentRule } from '../parser';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export type JudgmentStatus = 'O' | '△' | '-' | 'X';

/** 개별 변수 판정 결과 */
export interface VariableJudgment {
  variable_name: string;
  description: string;
  source: 'window' | 'dataLayer' | 'both' | 'not_found';
  expected_value: string;
  actual_value: string;
  status: JudgmentStatus;
  reason?: string;
}

/** URL 단위 판정 결과 */
export interface URLValidationResult {
  url: string;
  final_url?: string;
  redirect_detected?: boolean;
  channel: string;
  page_type: string;
  page_bread: string;
  collected_at: string;
  judgments: VariableJudgment[];
  summary: {
    total: number;
    passed: number;      // O
    partial: number;     // △
    not_applicable: number; // -
    failed: number;      // X
    pass_rate: number;
  };
  cross_check_results: CrossCheckResult[];
}

/** Cross-check 결과 */
export interface CrossCheckResult {
  rule: string;
  status: JudgmentStatus;
  description: string;
}

/** 전체 Validation 결과 */
export interface GlobalVariableValidationOutput {
  channel: string;
  validated_at: string;
  url_results: URLValidationResult[];
  overall_summary: {
    total_urls: number;
    total_variables: number;
    passed: number;
    partial: number;
    not_applicable: number;
    failed: number;
    pass_rate: number;
  };
}

// ─────────────────────────────────────────────────────────────────────
// 개별 변수 판정 로직
// ─────────────────────────────────────────────────────────────────────

function judgeVariable(
  rule: VariableJudgmentRule,
  collected: CollectedVariableValue | undefined,
  urlSpec: URLVariableSpec,
): VariableJudgment {
  const isNoLogin = urlSpec.channel.includes('no_login');
  const source = collected?.source || 'not_found';
  const actualRaw = collected?.value;
  const actualStr = actualRaw !== undefined && actualRaw !== null ? String(actualRaw) : '';
  const expectedSpec = urlSpec.expected_values[rule.variable_name];
  const expectedStr = expectedSpec ? String(expectedSpec.value) : '';

  // 비로그인 채널에서 사용자 변수는 N/A
  if (rule.na_when_no_login && isNoLogin) {
    return {
      variable_name: rule.variable_name,
      description: rule.description,
      source,
      expected_value: '-',
      actual_value: actualStr || '-',
      status: '-',
      reason: '비로그인 채널 - N/A',
    };
  }

  // 값이 수집되지 않은 경우
  if (source === 'not_found' || actualRaw === undefined || actualRaw === null) {
    // 일부 변수는 undefined 허용
    if (isOptionalWhenUndefined(rule)) {
      return {
        variable_name: rule.variable_name,
        description: rule.description,
        source,
        expected_value: expectedStr,
        actual_value: '-',
        status: 'O',
        reason: '선택적 변수 - undefined 허용',
      };
    }
    // BREAD/PAGETYPE: Excel에 기대값이 없거나 placeholder이면 미선언 OK
    if ((rule.variable_name === 'AP_DATA_BREAD' || rule.variable_name === 'AP_DATA_PAGETYPE') &&
        (!expectedStr || expectedStr === 'null' || isPlaceholderExpected(expectedStr))) {
      return {
        variable_name: rule.variable_name,
        description: rule.description,
        source,
        expected_value: '(기대값 없음)',
        actual_value: 'undefined',
        status: 'O',
        reason: 'Excel 기대값 없음 + 미선언 → 정상',
      };
    }
    return {
      variable_name: rule.variable_name,
      description: rule.description,
      source,
      expected_value: expectedStr,
      actual_value: 'undefined',
      status: 'X',
      reason: '변수 미선언 또는 값 없음',
    };
  }

  // 변수별 판정
  switch (rule.variable_name) {
    case 'AP_DATA_SITENAME':
      return judgeSiteName(rule, actualStr, expectedStr, source);

    case 'AP_DATA_COUNTRY':
      return judgeCountry(rule, actualStr, expectedStr, source);

    case 'AP_DATA_LANG':
      return judgeLang(rule, actualStr, expectedStr, source);

    case 'AP_DATA_ENV':
      return judgeEnv(rule, actualStr, expectedStr, source);

    case 'AP_DATA_CHANNEL':
      return judgeChannel(rule, actualStr, urlSpec.channel, source);

    case 'AP_DATA_BREAD':
      return judgeBread(rule, actualStr, expectedStr, source);

    case 'AP_DATA_PAGETYPE':
      return judgePageType(rule, actualStr, expectedStr, source);

    case 'AP_PROMO_ID':
    case 'AP_PROMO_NAME':
      return judgePromo(rule, actualStr, urlSpec.page_type, source);

    case 'AP_DATA_ISLOGIN':
      return judgeIsLogin(rule, actualStr, urlSpec.channel, source);

    case 'AP_DATA_GCID':
      return judgeGCID(rule, actualStr, source);

    case 'AP_DATA_CID':
      return judgeCID(rule, actualStr, source);

    case 'AP_DATA_ISMEMBER':
      return judgeAllowedValues(rule, actualStr, ['Y', 'N'], source);

    case 'AP_DATA_CG':
      return judgeAllowedValues(rule, actualStr, ['F', 'M'], source, true);

    case 'AP_DATA_CD':
      return judgePattern(rule, actualStr, /^\d{4}$/, source, true);

    case 'AP_DATA_LOGINTYPE':
      return judgeAllowedValues(rule, actualStr, ['NORMAL', 'MOBILE', 'AUTO', 'ORDER_NUMBER'], source, true);

    case 'AP_DATA_CT':
      return judgeExistence(rule, actualStr, source);

    case 'AP_DATA_BEAUTYCT':
      return judgeAllowedValues(rule, actualStr, ['FAMILY', 'GREEN', 'SILVER', 'GOLD', 'PLATINUM'], source, true);

    case 'AP_DATA_ISEMPLOYEE':
      return judgeAllowedValues(rule, actualStr, ['Y', 'N'], source, true);

    default:
      return {
        variable_name: rule.variable_name,
        description: rule.description,
        source,
        expected_value: expectedStr,
        actual_value: actualStr,
        status: '△',
        reason: '판정 규칙 미정의',
      };
  }
}

// ─────────────────────────────────────────────────────────────────────
// 개별 판정 함수들
// ─────────────────────────────────────────────────────────────────────

function judgeSiteName(
  rule: VariableJudgmentRule, actual: string, expected: string, source: string
): VariableJudgment {
  if (actual === expected) {
    return makeJudgment(rule, expected, actual, 'O', source);
  }
  if (actual.toUpperCase() === expected.toUpperCase()) {
    return makeJudgment(rule, expected, actual, '△', source, '대소문자 차이');
  }
  return makeJudgment(rule, expected, actual, 'X', source, `기대값 "${expected}" ≠ 실제값 "${actual}"`);
}

function judgeCountry(
  rule: VariableJudgmentRule, actual: string, expected: string, source: string
): VariableJudgment {
  if (actual.toUpperCase() === expected.toUpperCase()) {
    return makeJudgment(rule, expected, actual, actual === expected ? 'O' : '△', source,
      actual !== expected ? '대소문자 차이' : undefined);
  }
  return makeJudgment(rule, expected, actual, 'X', source, `국가 코드 불일치`);
}

function judgeLang(
  rule: VariableJudgmentRule, actual: string, expected: string, source: string
): VariableJudgment {
  if (actual.toUpperCase() === expected.toUpperCase()) {
    return makeJudgment(rule, expected, actual, actual === expected ? 'O' : '△', source,
      actual !== expected ? '대소문자 차이' : undefined);
  }
  return makeJudgment(rule, expected, actual, 'X', source, `언어 코드 불일치`);
}

function judgeEnv(
  rule: VariableJudgmentRule, actual: string, expected: string, source: string
): VariableJudgment {
  if (expected === 'PRD') {
    // PRD 환경 테스트: PRD가 정상
    if (actual.toUpperCase() === 'PRD') {
      return makeJudgment(rule, 'PRD', actual, 'O', source);
    }
    return makeJudgment(rule, 'PRD', actual, 'X', source, `PRD 환경에서 "${actual}" 감지`);
  }
  // 테스트 환경: PRD가 아니어야 함
  if (actual.toUpperCase() === 'PRD') {
    return makeJudgment(rule, '≠PRD', actual, 'X', source, '테스트 환경에서 PRD 값 감지');
  }
  return makeJudgment(rule, '≠PRD', actual, 'O', source);
}

function judgeChannel(
  rule: VariableJudgmentRule, actual: string, channel: string, source: string
): VariableJudgment {
  const expected = channel.startsWith('pc') ? 'PC' : 'MOBILE';
  if (actual === expected) {
    return makeJudgment(rule, expected, actual, 'O', source);
  }
  if (actual.toUpperCase() === expected) {
    return makeJudgment(rule, expected, actual, '△', source, '대소문자 차이');
  }
  return makeJudgment(rule, expected, actual, 'X', source, `채널 불일치: 기대 "${expected}"`);
}

/** Excel에서 "미노출", "확인중" 등 기대값이 확정되지 않은 placeholder인지 확인 */
function isPlaceholderExpected(value: string): boolean {
  const placeholders = ['미노출', '확인중', '확인 중', '-', 'N/A', 'n/a', 'TBD', 'tbd'];
  return placeholders.includes(value.trim());
}

function judgeBread(
  rule: VariableJudgmentRule, actual: string, expected: string, source: string
): VariableJudgment {
  if (!expected || expected === 'null' || isPlaceholderExpected(expected)) {
    // Excel에 기대값이 없거나 placeholder이면 값 존재 시 O, 미선언 시에도 O
    if (actual.length > 0) {
      return makeJudgment(rule, '(값 존재 또는 미선언)', actual, 'O', source);
    }
    return makeJudgment(rule, '(값 존재 또는 미선언)', 'undefined', 'O', source, '브레드크럼 미선언 (페이지 특성상 정상)');
  }
  if (actual === expected) {
    return makeJudgment(rule, expected, actual, 'O', source);
  }
  if (actual.trim() === expected.trim()) {
    return makeJudgment(rule, expected, actual, '△', source, '공백 차이');
  }
  return makeJudgment(rule, expected, actual, 'X', source, `브레드크럼 불일치`);
}

function judgePageType(
  rule: VariableJudgmentRule, actual: string, expected: string, source: string
): VariableJudgment {
  if (!expected || expected === 'null' || isPlaceholderExpected(expected)) {
    return actual.length > 0
      ? makeJudgment(rule, '(값 존재)', actual, 'O', source)
      : makeJudgment(rule, '(값 존재)', actual, 'X', source, '빈 값');
  }
  if (actual === expected) {
    return makeJudgment(rule, expected, actual, 'O', source);
  }
  if (actual.toUpperCase() === expected.toUpperCase()) {
    return makeJudgment(rule, expected, actual, '△', source, '대소문자 차이');
  }
  return makeJudgment(rule, expected, actual, 'X', source, `페이지 타입 불일치`);
}

function judgePromo(
  rule: VariableJudgmentRule, actual: string, pageType: string, source: string
): VariableJudgment {
  if (pageType === 'EVENT_DETAIL') {
    return actual.length > 0
      ? makeJudgment(rule, '(값 존재)', actual, 'O', source)
      : makeJudgment(rule, '(값 존재)', '', 'X', source, 'EVENT_DETAIL 페이지에서 프로모션 값 필수');
  }
  // EVENT_DETAIL이 아니면 undefined OK
  return makeJudgment(rule, 'OPTIONAL', actual || 'undefined', 'O', source, 'EVENT_DETAIL 아님 - undefined OK');
}

function judgeIsLogin(
  rule: VariableJudgmentRule, actual: string, channel: string, source: string
): VariableJudgment {
  const expected = channel.includes('no_login') ? 'N' : 'Y';
  if (actual === expected) {
    return makeJudgment(rule, expected, actual, 'O', source);
  }
  return makeJudgment(rule, expected, actual, 'X', source, `로그인 상태 불일치: 기대 "${expected}"`);
}

function judgeGCID(
  rule: VariableJudgmentRule, actual: string, source: string
): VariableJudgment {
  if (actual.length === 0) {
    return makeJudgment(rule, '암호화된 해시값', '(빈값)', 'X', source, 'ISLOGIN=Y일 때 GCID 필수');
  }
  // 32자 이상 hex 문자열이면 암호화된 해시로 판정 (SHA256=64자, SHA512=128자 등)
  const hashPattern = /^[a-fA-F0-9]{32,}$/;
  if (hashPattern.test(actual)) {
    return makeJudgment(rule, '암호화된 해시값', actual.substring(0, 20) + `... (${actual.length}자)`, 'O', source);
  }
  return makeJudgment(rule, '암호화된 해시값', `${actual.substring(0, 20)}... (${actual.length}자)`, '△', source,
    `해시 패턴 불일치 (hex가 아니거나 길이 부족: ${actual.length}자)`);
}

function judgeCID(
  rule: VariableJudgmentRule, actual: string, source: string
): VariableJudgment {
  if (actual.length === 0 || actual === 'undefined') {
    return makeJudgment(rule, '암호화된 해시값 또는 undefined', actual || 'undefined', 'O', source, '비통합회원 → undefined OK');
  }
  const hashPattern = /^[a-fA-F0-9]{32,}$/;
  if (hashPattern.test(actual)) {
    return makeJudgment(rule, '암호화된 해시값', actual.substring(0, 20) + `... (${actual.length}자)`, 'O', source);
  }
  return makeJudgment(rule, '암호화된 해시값', `${actual.substring(0, 20)}... (${actual.length}자)`, '△', source,
    `해시 패턴 불일치 (hex가 아니거나 길이 부족)`);
}

function judgeAllowedValues(
  rule: VariableJudgmentRule, actual: string, allowed: string[], source: string, undefinedOk = false
): VariableJudgment {
  if (undefinedOk && (actual.length === 0 || actual === 'undefined')) {
    return makeJudgment(rule, allowed.join('|'), 'undefined', 'O', source, 'undefined 허용');
  }
  if (allowed.includes(actual)) {
    return makeJudgment(rule, allowed.join('|'), actual, 'O', source);
  }
  if (allowed.some(a => a.toUpperCase() === actual.toUpperCase())) {
    return makeJudgment(rule, allowed.join('|'), actual, '△', source, '대소문자 차이');
  }
  return makeJudgment(rule, allowed.join('|'), actual, 'X', source,
    `허용값 [${allowed.join(', ')}]에 포함되지 않음`);
}

function judgePattern(
  rule: VariableJudgmentRule, actual: string, pattern: RegExp, source: string, undefinedOk = false
): VariableJudgment {
  if (undefinedOk && (actual.length === 0 || actual === 'undefined')) {
    return makeJudgment(rule, pattern.source, 'undefined', 'O', source, 'undefined 허용');
  }
  if (pattern.test(actual)) {
    return makeJudgment(rule, pattern.source, actual, 'O', source);
  }
  return makeJudgment(rule, pattern.source, actual, 'X', source, `패턴 불일치: ${pattern.source}`);
}

function judgeExistence(
  rule: VariableJudgmentRule, actual: string, source: string
): VariableJudgment {
  if (actual.length === 0 || actual === 'undefined') {
    // 등급 없으면 undefined OK
    return makeJudgment(rule, '(값 존재 또는 undefined)', 'undefined', 'O', source, 'undefined 허용');
  }
  return makeJudgment(rule, '(값 존재)', actual, 'O', source);
}

function isOptionalWhenUndefined(rule: VariableJudgmentRule): boolean {
  // 로그인 상태에서도 undefined 허용되는 변수들
  const optionalVars = [
    'AP_DATA_CID',        // 비통합회원 → undefined
    'AP_DATA_CG',         // 정보 없으면 undefined
    'AP_DATA_CD',         // 정보 없으면 undefined
    'AP_DATA_LOGINTYPE',  // 정보 없으면 undefined
    'AP_DATA_CT',         // 등급 없으면 undefined
    'AP_DATA_BEAUTYCT',   // 비통합회원 → undefined
    'AP_DATA_ISEMPLOYEE', // 정보 없으면 undefined
    'AP_PROMO_ID',        // page_type에 따라
    'AP_PROMO_NAME',      // page_type에 따라
  ];
  return optionalVars.includes(rule.variable_name);
}

function makeJudgment(
  rule: VariableJudgmentRule,
  expected: string,
  actual: string,
  status: JudgmentStatus,
  source: string,
  reason?: string,
): VariableJudgment {
  return {
    variable_name: rule.variable_name,
    description: rule.description,
    source: source as VariableJudgment['source'],
    expected_value: expected,
    actual_value: actual,
    status,
    reason,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Cross-Check 로직
// ─────────────────────────────────────────────────────────────────────

function runCrossChecks(
  collected: Record<string, CollectedVariableValue>,
  channel: string,
): CrossCheckResult[] {
  const results: CrossCheckResult[] = [];
  const isNoLogin = channel.includes('no_login');

  const isLoginVal = collected['AP_DATA_ISLOGIN']?.value;
  const gcidVal = collected['AP_DATA_GCID']?.value;

  if (!isNoLogin && String(isLoginVal) === 'Y') {
    // ISLOGIN=Y → GCID 필수
    if (!gcidVal || String(gcidVal).length === 0) {
      results.push({
        rule: 'ISLOGIN=Y → GCID 필수',
        status: 'X',
        description: 'AP_DATA_ISLOGIN="Y"이지만 AP_DATA_GCID가 없음',
      });
    } else {
      const gcidStr = String(gcidVal);
      if (/^[a-fA-F0-9]{32,}$/.test(gcidStr)) {
        results.push({
          rule: 'ISLOGIN=Y → GCID 필수',
          status: 'O',
          description: `AP_DATA_ISLOGIN="Y" + GCID 정상 존재 (${gcidStr.length}자 hex)`,
        });
      } else {
        results.push({
          rule: 'ISLOGIN=Y → GCID 형식',
          status: '△',
          description: `GCID 존재하지만 해시 패턴 불일치 (${gcidStr.length}자)`,
        });
      }
    }
  }

  if (isNoLogin) {
    // ISLOGIN=N → 사용자 변수 모두 N/A
    const userVars = [
      'AP_DATA_GCID', 'AP_DATA_CID', 'AP_DATA_ISMEMBER',
      'AP_DATA_CG', 'AP_DATA_CD', 'AP_DATA_LOGINTYPE',
      'AP_DATA_CT', 'AP_DATA_BEAUTYCT', 'AP_DATA_ISEMPLOYEE',
    ];
    const unexpectedUserVars = userVars.filter(v => {
      const val = collected[v]?.value;
      return val !== undefined && val !== null && String(val).length > 0;
    });

    if (unexpectedUserVars.length > 0) {
      results.push({
        rule: 'ISLOGIN=N → 사용자 변수 N/A',
        status: '△',
        description: `비로그인 채널에서 사용자 변수 발견: ${unexpectedUserVars.join(', ')}`,
      });
    } else {
      results.push({
        rule: 'ISLOGIN=N → 사용자 변수 N/A',
        status: 'O',
        description: '비로그인 채널에서 사용자 변수 정상적으로 없음',
      });
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────
// 리다이렉트 감지
// ─────────────────────────────────────────────────────────────────────

function isRedirected(originalUrl: string, finalUrl?: string): boolean {
  if (!finalUrl) return false;
  try {
    return new URL(originalUrl).pathname !== new URL(finalUrl).pathname;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────
// 메인 검증 함수
// ─────────────────────────────────────────────────────────────────────

export function validateURL(
  collectedData: GlobalVariableCollectedData,
  urlSpec: URLVariableSpec,
  rules: VariableJudgmentRule[],
): URLValidationResult {
  const judgments: VariableJudgment[] = [];

  // 리다이렉트 감지
  const redirected = isRedirected(collectedData.url, collectedData.final_url);
  let redirectSuffix = '';
  if (redirected) {
    try {
      const origPath = new URL(collectedData.url).pathname;
      const finalPath = new URL(collectedData.final_url!).pathname;
      redirectSuffix = ` [리다이렉트: ${origPath} → ${finalPath}]`;
    } catch {
      redirectSuffix = ' [리다이렉트 감지]';
    }
  }

  for (const rule of rules) {
    if (redirected) {
      // 리다이렉트된 페이지: 수집 데이터가 다른 페이지 것이므로 판정 스킵
      judgments.push({
        variable_name: rule.variable_name,
        description: rule.description,
        source: 'not_found',
        expected_value: '-',
        actual_value: '-',
        status: '-',
        reason: `리다이렉트 페이지 - 판정 스킵${redirectSuffix}`,
      });
    } else {
      const collected = collectedData.variables[rule.variable_name];
      const judgment = judgeVariable(rule, collected, urlSpec);
      judgments.push(judgment);
    }
  }

  // Cross-check
  const crossCheckResults = runCrossChecks(collectedData.variables, collectedData.channel);

  // 리다이렉트 cross-check 추가
  if (redirected) {
    let origPath = collectedData.url;
    let finalPath = collectedData.final_url || '';
    try {
      origPath = new URL(collectedData.url).pathname;
      finalPath = new URL(collectedData.final_url!).pathname;
    } catch { /* use full URLs */ }
    crossCheckResults.push({
      rule: 'URL 리다이렉트 감지',
      status: '△',
      description: `원래 URL(${origPath})이 다른 페이지(${finalPath})로 리다이렉트됨 - 수집 데이터 재평가 필요`,
    });
  }

  // 요약 계산
  const total = judgments.length;
  const passed = judgments.filter(j => j.status === 'O').length;
  const partial = judgments.filter(j => j.status === '△').length;
  const notApplicable = judgments.filter(j => j.status === '-').length;
  const failed = judgments.filter(j => j.status === 'X').length;
  const applicable = total - notApplicable;
  const passRate = applicable > 0 ? Math.round((passed / applicable) * 100) : 100;

  return {
    url: collectedData.url,
    final_url: collectedData.final_url,
    redirect_detected: redirected || undefined,
    channel: collectedData.channel,
    page_type: urlSpec.page_type,
    page_bread: urlSpec.page_bread,
    collected_at: collectedData.collected_at,
    judgments,
    summary: { total, passed, partial, not_applicable: notApplicable, failed, pass_rate: passRate },
    cross_check_results: crossCheckResults,
  };
}

export function validateAll(
  collectedDataList: GlobalVariableCollectedData[],
  urlSpecs: URLVariableSpec[],
  rules: VariableJudgmentRule[],
): GlobalVariableValidationOutput {
  const urlResults: URLValidationResult[] = [];

  for (const collected of collectedDataList) {
    // URL에 매칭되는 spec 찾기
    const spec = urlSpecs.find(s => s.url === collected.url && s.channel === collected.channel);
    if (!spec) {
      console.warn(`  URL 스펙을 찾을 수 없음: ${collected.url} (${collected.channel})`);
      continue;
    }
    urlResults.push(validateURL(collected, spec, rules));
  }

  // 전체 요약
  const allJudgments = urlResults.flatMap(r => r.judgments);
  const total = allJudgments.length;
  const passed = allJudgments.filter(j => j.status === 'O').length;
  const partial = allJudgments.filter(j => j.status === '△').length;
  const notApplicable = allJudgments.filter(j => j.status === '-').length;
  const failed = allJudgments.filter(j => j.status === 'X').length;
  const applicable = total - notApplicable;

  return {
    channel: collectedDataList[0]?.channel || 'unknown',
    validated_at: new Date().toISOString(),
    url_results: urlResults,
    overall_summary: {
      total_urls: urlResults.length,
      total_variables: total,
      passed,
      partial,
      not_applicable: notApplicable,
      failed,
      pass_rate: applicable > 0 ? Math.round((passed / applicable) * 100) : 100,
    },
  };
}
