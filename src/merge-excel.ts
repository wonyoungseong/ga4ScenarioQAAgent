/**
 * 4채널 개별 JSON 결과를 하나의 Excel 파일로 합치기
 *
 * 사용법:
 *   npx ts-node src/merge-excel.ts \
 *     --config "./ref - for QA Agent/innisfree-jp.qa.json" \
 *     --pc-no-login "./output/innisfree_jp_pc_no_login/qa_global_pc_no_login_*.json" \
 *     --mo-no-login "./output/innisfree_jp_mo_no_login/qa_global_mo_no_login_*.json" \
 *     --pc-login    "./output/innisfree_jp_pc_login/qa_global_pc_login_*.json" \
 *     --mo-login    "./output/innisfree_jp_mo_login/qa_global_mo_login_*.json" \
 *     --output      "./output/innisfree_jp_merged"
 */

import * as fs from 'fs';
import * as path from 'path';
import { runParserShared, type ChannelType, type URLVariableSpec } from './agents/parser';
import type { GlobalVariableValidationOutput } from './agents/validator';
import type { GlobalVariableCollectedData, CollectedVariableValue } from './agents/collector';
import { generateExcelReport, type ExcelReportInput } from './agents/reporter';

// ─────────────────────────────────────────────────────────────────────
// CLI 인자 파싱
// ─────────────────────────────────────────────────────────────────────

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

interface QAConfigFile {
  site_id: string;
  guide_pdf: string;
  appendix_pdf: string;
  excel: string;
  domain_map?: { from: string; to: string };
  production?: boolean;
  output_dir?: string;
}

// ─────────────────────────────────────────────────────────────────────
// JSON 로드 (glob 지원)
// ─────────────────────────────────────────────────────────────────────

function loadLatestJson(dirOrFile: string): GlobalVariableValidationOutput | null {
  const resolved = path.resolve(dirOrFile);

  // 정확한 파일 경로인 경우
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    const content = fs.readFileSync(resolved, 'utf-8');
    console.log(`  로드: ${path.basename(resolved)}`);
    return JSON.parse(content) as GlobalVariableValidationOutput;
  }

  // 디렉토리인 경우 최신 JSON 파일 찾기
  const dir = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved);
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.json') && f.startsWith('qa_global_'))
    .map(f => path.join(dir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  if (files.length === 0) return null;

  const content = fs.readFileSync(files[0], 'utf-8');
  console.log(`  로드: ${path.basename(files[0])}`);
  return JSON.parse(content) as GlobalVariableValidationOutput;
}

// ─────────────────────────────────────────────────────────────────────
// Validation → CollectedData 재구성
// ─────────────────────────────────────────────────────────────────────

function reconstructCollectedData(
  validation: GlobalVariableValidationOutput,
): GlobalVariableCollectedData[] {
  type ChannelLiteral = 'pc_login' | 'pc_no_login' | 'mo_login' | 'mo_no_login';
  return validation.url_results.map(urlResult => {
    const variables: Record<string, CollectedVariableValue> = {};

    for (const judgment of urlResult.judgments) {
      if (judgment.status === '-' && judgment.reason?.includes('리다이렉트')) continue;

      const actualVal = judgment.actual_value;
      if (actualVal && actualVal !== '-' && actualVal !== 'undefined') {
        const displayVal = actualVal.includes('...') ? actualVal : actualVal;
        variables[judgment.variable_name] = {
          value: displayVal,
          source: judgment.source as 'window' | 'dataLayer' | 'both',
        };
      }
    }

    const finalUrl = urlResult.final_url || urlResult.url;
    const errors: string[] = [];

    return {
      url: urlResult.url,
      final_url: finalUrl,
      channel: urlResult.channel as ChannelLiteral,
      collected_at: urlResult.collected_at,
      variables,
      errors,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const configPath = getArg(args, '--config');
  if (!configPath) {
    console.error('필수: --config <path>');
    process.exit(1);
  }

  const configContent = fs.readFileSync(path.resolve(configPath), 'utf-8');
  const config: QAConfigFile = JSON.parse(configContent);

  const outputDir = getArg(args, '--output') || config.output_dir || './output/merged';

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     멀티채널 Excel 리포트 병합                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // 1. Parser 실행 (URL 스펙 생성용)
  console.log('[1/3] Parser Agent (URL 스펙 생성)...');
  const shared = runParserShared({
    guidePdfPath: config.guide_pdf,
    appendixPdfPath: config.appendix_pdf,
    excelPath: config.excel,
    isProduction: config.production || false,
  });

  // 도메인 변환
  if (config.domain_map) {
    for (const entry of shared.excelURLs) {
      entry.url = entry.url.replace(config.domain_map.from, config.domain_map.to);
    }
  }

  // 2. JSON 로드
  console.log('\n[2/3] 채널별 JSON 결과 로드...');

  const CHANNELS: ChannelType[] = ['pc_login', 'pc_no_login', 'mo_login', 'mo_no_login'];
  const CHANNEL_FLAGS: Record<string, string> = {
    pc_no_login: '--pc-no-login',
    mo_no_login: '--mo-no-login',
    pc_login: '--pc-login',
    mo_login: '--mo-login',
  };

  const results: Record<string, GlobalVariableValidationOutput | null> = {};
  const collectedDataMap: Record<string, GlobalVariableCollectedData[]> = {};
  const urlSpecsMap: Record<string, URLVariableSpec[]> = {};

  for (const channel of CHANNELS) {
    const jsonPath = getArg(args, CHANNEL_FLAGS[channel]);
    if (!jsonPath) {
      console.log(`  [${channel}] JSON 경로 미지정 - 건너뜀`);
      results[channel] = null;
      collectedDataMap[channel] = [];
      urlSpecsMap[channel] = [];
      continue;
    }

    const validation = loadLatestJson(jsonPath);
    if (!validation) {
      console.log(`  [${channel}] 파일 없음 - 건너뜀`);
      results[channel] = null;
      collectedDataMap[channel] = [];
      urlSpecsMap[channel] = [];
      continue;
    }

    results[channel] = validation;
    collectedDataMap[channel] = reconstructCollectedData(validation);

    // URL 스펙 생성
    const specs = shared.buildSpecsForChannel(channel, config.production || false);
    if (channel.includes('login') && !channel.includes('no_login')) {
      const noLoginChannel = channel.replace('_login', '_no_login') as ChannelType;
      const noLoginSpecs = shared.buildSpecsForChannel(noLoginChannel, config.production || false);
      const loginUrls = new Set(specs.map(s => s.url));
      for (const nlSpec of noLoginSpecs) {
        if (!loginUrls.has(nlSpec.url)) {
          specs.push({ ...nlSpec, channel });
        }
      }
    }
    urlSpecsMap[channel] = specs;
  }

  // 3. Excel 생성
  console.log('\n[3/3] Excel 리포트 생성...');

  const excelInput: ExcelReportInput = {
    results,
    collectedData: collectedDataMap,
    urlSpecs: urlSpecsMap,
    outputDir,
  };

  const excelPath = await generateExcelReport(excelInput);
  console.log(`\n  Excel 리포트 생성 완료: ${excelPath}`);

  // 요약
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║           병합 결과 요약                                        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  for (const channel of CHANNELS) {
    const v = results[channel];
    if (v) {
      const s = v.overall_summary;
      console.log(`  [${channel}] URL: ${s.total_urls} | O: ${s.passed} | △: ${s.partial} | X: ${s.failed} | 통과율: ${s.pass_rate}%`);
    } else {
      console.log(`  [${channel}] 건너뜀`);
    }
  }
  console.log('');
}

main().catch(e => {
  console.error('병합 실패:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
