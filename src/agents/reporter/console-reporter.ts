/**
 * Console Reporter - 콘솔 테이블 출력
 *
 * Source 컬럼 포함, O/△/-/X 상태 코드 표시
 */

import type { URLValidationResult, GlobalVariableValidationOutput } from '../validator';

// ─────────────────────────────────────────────────────────────────────
// 유틸리티
// ─────────────────────────────────────────────────────────────────────

function pad(str: string, len: number): string {
  // 한글 등 멀티바이트 문자 고려
  let displayLen = 0;
  for (const ch of str) {
    displayLen += ch.charCodeAt(0) > 127 ? 2 : 1;
  }
  const padding = Math.max(0, len - displayLen);
  return str + ' '.repeat(padding);
}

function statusIcon(status: string): string {
  switch (status) {
    case 'O': return 'O';
    case '△': return '△';
    case '-': return '-';
    case 'X': return 'X';
    default: return '?';
  }
}

function statusColor(status: string): string {
  // ANSI color codes
  switch (status) {
    case 'O': return `\x1b[32m${status}\x1b[0m`;     // green
    case '△': return `\x1b[33m${status}\x1b[0m`;     // yellow
    case '-': return `\x1b[90m${status}\x1b[0m`;     // gray
    case 'X': return `\x1b[31m${status}\x1b[0m`;     // red
    default: return status;
  }
}

// ─────────────────────────────────────────────────────────────────────
// URL 단위 테이블 출력
// ─────────────────────────────────────────────────────────────────────

export function printURLResult(result: URLValidationResult): void {
  console.log('');
  console.log(`URL: ${result.url}`);
  console.log(`채널: ${result.channel} | 페이지: ${result.page_type} | 브레드: ${result.page_bread}`);
  console.log(`수집 시점: ${result.collected_at}`);
  console.log('');

  // 테이블 헤더
  const colWidths = { name: 22, source: 10, expected: 24, actual: 24, status: 8 };

  console.log('┌' + '─'.repeat(colWidths.name + 2)
    + '┬' + '─'.repeat(colWidths.source + 2)
    + '┬' + '─'.repeat(colWidths.expected + 2)
    + '┬' + '─'.repeat(colWidths.actual + 2)
    + '┬' + '─'.repeat(colWidths.status + 2) + '┐');

  console.log('│ ' + pad('변수명', colWidths.name)
    + ' │ ' + pad('Source', colWidths.source)
    + ' │ ' + pad('기대값', colWidths.expected)
    + ' │ ' + pad('실제값', colWidths.actual)
    + ' │ ' + pad('상태', colWidths.status) + ' │');

  console.log('├' + '─'.repeat(colWidths.name + 2)
    + '┼' + '─'.repeat(colWidths.source + 2)
    + '┼' + '─'.repeat(colWidths.expected + 2)
    + '┼' + '─'.repeat(colWidths.actual + 2)
    + '┼' + '─'.repeat(colWidths.status + 2) + '┤');

  for (const j of result.judgments) {
    const name = pad(j.variable_name, colWidths.name);
    const source = pad(j.source, colWidths.source);
    const expected = pad(truncate(j.expected_value, colWidths.expected), colWidths.expected);
    const actual = pad(truncate(j.actual_value, colWidths.actual), colWidths.actual);
    const status = pad(statusIcon(j.status), colWidths.status);

    console.log(`│ ${name} │ ${source} │ ${expected} │ ${actual} │ ${status} │`);
  }

  console.log('└' + '─'.repeat(colWidths.name + 2)
    + '┴' + '─'.repeat(colWidths.source + 2)
    + '┴' + '─'.repeat(colWidths.expected + 2)
    + '┴' + '─'.repeat(colWidths.actual + 2)
    + '┴' + '─'.repeat(colWidths.status + 2) + '┘');

  // 요약
  console.log('');
  console.log(`  전체: ${result.summary.total}개 | `
    + `${statusColor('O')} ${result.summary.passed} | `
    + `${statusColor('△')} ${result.summary.partial} | `
    + `${statusColor('-')} ${result.summary.not_applicable} | `
    + `${statusColor('X')} ${result.summary.failed} | `
    + `통과율: ${result.summary.pass_rate}%`);

  // Cross-check 결과
  if (result.cross_check_results.length > 0) {
    console.log('');
    console.log('  [Cross-Check]');
    for (const cc of result.cross_check_results) {
      console.log(`    ${statusColor(cc.status)} ${cc.rule}: ${cc.description}`);
    }
  }

  // 실패 상세
  const failures = result.judgments.filter(j => j.status === 'X' || j.status === '△');
  if (failures.length > 0) {
    console.log('');
    console.log('  [상세]');
    for (const f of failures) {
      console.log(`    ${statusColor(f.status)} ${f.variable_name}: ${f.reason || '사유 없음'}`);
    }
  }
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

// ─────────────────────────────────────────────────────────────────────
// 전체 결과 출력
// ─────────────────────────────────────────────────────────────────────

export function printFullReport(output: GlobalVariableValidationOutput): void {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║           1차 QA 전역변수 검수 결과                                     ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`채널: ${output.channel}`);
  console.log(`검증 시점: ${output.validated_at}`);
  console.log(`검증 URL 수: ${output.overall_summary.total_urls}`);

  // 각 URL 결과 출력
  for (const urlResult of output.url_results) {
    console.log('');
    console.log('━'.repeat(72));
    printURLResult(urlResult);
  }

  // 전체 요약
  console.log('');
  console.log('━'.repeat(72));
  console.log('');
  console.log('[전체 요약]');
  console.log(`  URL 수: ${output.overall_summary.total_urls}`);
  console.log(`  전체 판정: ${output.overall_summary.total_variables}건`);
  console.log(`  ${statusColor('O')} 정상: ${output.overall_summary.passed}건`);
  console.log(`  ${statusColor('△')} 부분: ${output.overall_summary.partial}건`);
  console.log(`  ${statusColor('-')} N/A: ${output.overall_summary.not_applicable}건`);
  console.log(`  ${statusColor('X')} 실패: ${output.overall_summary.failed}건`);
  console.log(`  통과율: ${output.overall_summary.pass_rate}%`);

  // 통과율 바
  const rate = output.overall_summary.pass_rate;
  const filled = Math.floor(rate / 5);
  const empty = 20 - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  console.log(`  [${bar}] ${rate}%`);
  console.log('');
}
