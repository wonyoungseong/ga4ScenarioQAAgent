/**
 * 4채널 이벤트 QA JSON 결과를 종합 Excel 리포트로 병합
 *
 * 사용법:
 *   npx ts-node src/merge-event-excel.ts \
 *     --gtm "./GTM.json" \
 *     --excel "./Pre_Requirement.xlsx" \
 *     --pc-no-login "./output/pc_no_login/event-qa-result_*.json" \
 *     --pc-login "./output/pc_login/event-qa-result_*.json" \
 *     --mo-no-login "./output/mo_no_login/event-qa-result_*.json" \
 *     --mo-login "./output/mo_login/event-qa-result_*.json" \
 *     --output "./output/report"
 *
 * 단일 채널도 지원: JSON 1개만 제공하면 해당 채널만 포함
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseGTMContainer } from './agents/parser/gtm-parser';
import type { GTMParserOutput } from './types/content-group';
import type { GTMContainer } from './types/gtm-container';
import type { EventValidationResult } from './types/event-validation-result';
import type { ChannelCombination } from './types/common';
import type { MultiChannelEventResult } from './types/qa-report';
import { generateComprehensiveEventExcelReport } from './agents/reporter/comprehensive-event-reporter';

// ─────────────────────────────────────────────────────────────────────
// CLI Argument Parsing
// ─────────────────────────────────────────────────────────────────────

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

// ─────────────────────────────────────────────────────────────────────
// JSON Loading
// ─────────────────────────────────────────────────────────────────────

function loadLatestEventJson(dirOrFile: string): EventValidationResult | null {
  const resolved = path.resolve(dirOrFile);

  // Exact file path
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    const content = fs.readFileSync(resolved, 'utf-8');
    console.log(`  로드: ${path.basename(resolved)}`);
    return JSON.parse(content) as EventValidationResult;
  }

  // Directory: find latest event-qa-result_*.json
  const dir = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()
    ? resolved
    : path.dirname(resolved);
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.json') && f.startsWith('event-qa-result_'))
    .map(f => path.join(dir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  if (files.length === 0) return null;

  const content = fs.readFileSync(files[0], 'utf-8');
  console.log(`  로드: ${path.basename(files[0])}`);
  return JSON.parse(content) as EventValidationResult;
}

// ─────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const gtmPath = getArg(args, '--gtm');
  const excelPath = getArg(args, '--excel');

  if (!gtmPath || !excelPath) {
    console.error('필수: --gtm <GTM JSON path> --excel <Pre-Requirement Excel path>');
    process.exit(1);
  }

  const outputDir = getArg(args, '--output') || './output/report';

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     GA4 QA 종합 Excel 리포트 생성기                            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // ── Step 1: GTM Parser 실행 (raw_container 확보) ──
  console.log('[1/3] GTM Parser 실행...');

  let parserOutput: GTMParserOutput;

  try {
    parserOutput = parseGTMContainer(gtmPath, excelPath);
  } catch (e) {
    console.error('GTM Parser 실패:', e instanceof Error ? e.message : String(e));
    process.exit(1);
  }

  // raw_container 직접 로드 (Parser 반환에 포함되지 않는 경우)
  if (!parserOutput.raw_container) {
    const gtmRaw = fs.readFileSync(path.resolve(gtmPath), 'utf-8');
    parserOutput.raw_container = JSON.parse(gtmRaw) as GTMContainer;
  }

  console.log(`  이벤트: ${parserOutput.scenario_spec.total_events}개`);
  console.log(`  시나리오: ${parserOutput.scenario_spec.total_scenarios}개`);

  // ── Step 2: 채널별 JSON 로드 ──
  console.log('\n[2/3] 채널별 JSON 결과 로드...');

  const CHANNELS: ChannelCombination[] = ['pc_no_login', 'pc_login', 'mo_no_login', 'mo_login'];
  const CHANNEL_FLAGS: Record<ChannelCombination, string> = {
    pc_no_login: '--pc-no-login',
    pc_login: '--pc-login',
    mo_no_login: '--mo-no-login',
    mo_login: '--mo-login',
  };

  const channelResults: Partial<Record<ChannelCombination, EventValidationResult>> = {};

  for (const channel of CHANNELS) {
    const jsonPath = getArg(args, CHANNEL_FLAGS[channel]);
    if (!jsonPath) {
      console.log(`  [${channel}] JSON 경로 미지정 - 건너뜀`);
      continue;
    }

    const result = loadLatestEventJson(jsonPath);
    if (!result) {
      console.log(`  [${channel}] 파일 없음 - 건너뜀`);
      continue;
    }

    channelResults[channel] = result;
    console.log(`  [${channel}] 시나리오: ${result.scenario_results.length}개, 이벤트 통과율: ${result.summary.event_pass_rate}%`);
  }

  const activeChannelCount = Object.keys(channelResults).length;
  if (activeChannelCount === 0) {
    console.error('\n하나 이상의 채널 JSON이 필요합니다.');
    process.exit(1);
  }

  // ── Step 3: MultiChannelEventResult 구성 + 리포트 생성 ──
  console.log(`\n[3/3] 종합 Excel 리포트 생성 (${activeChannelCount}개 채널)...`);

  // 이벤트 리스트 동적 추출
  const allEventNames = parserOutput.scenario_spec.events.map(e => e.event_name);

  // 채널별 이벤트/URL 동적 추출
  const eventsByChannel: Partial<Record<ChannelCombination, string[]>> = {};
  const urlsByChannel: Partial<Record<ChannelCombination, string[]>> = {};

  for (const [channel, result] of Object.entries(channelResults)) {
    if (!result) continue;
    const ch = channel as ChannelCombination;

    const events = new Set<string>();
    const urls = new Set<string>();
    for (const sr of result.scenario_results) {
      urls.add(sr.validated_url);
      for (const er of sr.event_results) {
        events.add(er.event_name);
      }
    }
    eventsByChannel[ch] = Array.from(events);
    urlsByChannel[ch] = Array.from(urls);
  }

  const multiChannelData: MultiChannelEventResult = {
    channel_results: channelResults,
    parser_output: parserOutput,
    all_event_names: allEventNames,
    events_by_channel: eventsByChannel,
    urls_by_channel: urlsByChannel,
  };

  const excelFilePath = await generateComprehensiveEventExcelReport(multiChannelData, outputDir);
  console.log(`\n  Excel 리포트 생성 완료: ${excelFilePath}`);

  // ── Summary ──
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║           종합 리포트 요약                                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`  이벤트 총 수: ${allEventNames.length}개`);
  console.log(`  활성 채널: ${activeChannelCount}개`);

  for (const [channel, result] of Object.entries(channelResults)) {
    if (!result) continue;
    const s = result.summary;
    console.log(`  [${channel}] 시나리오: ${s.passed_scenarios}/${s.total_scenarios} 통과 | 이벤트 통과율: ${s.event_pass_rate}%`);
  }

  const totalSheets = 2 + activeChannelCount + allEventNames.length;
  console.log(`  생성된 탭 수: ${totalSheets}개 (Overview + Review + ${activeChannelCount} 채널 + ${allEventNames.length} 이벤트)`);
  console.log('');
}

main().catch(e => {
  console.error('종합 리포트 생성 실패:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
