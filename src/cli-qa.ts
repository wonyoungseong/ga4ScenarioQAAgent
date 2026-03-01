/**
 * CLI 진입점 - QA 파이프라인
 *
 * 1차 QA (전역변수 검수):
 *   npx ts-node src/cli.ts global-variable \
 *     --guide "./..." --appendix "./..." --excel "./..." \
 *     --channel pc_no_login [--url "..."] [--headless] [--timeout 30000]
 *
 *   npx ts-node src/cli.ts global-variable \
 *     --guide "./..." --appendix "./..." --excel "./..." \
 *     --all-channels --excel-report --prod \
 *     --domain-map "innisfree-japan.myshopify.com:www.innisfree.jp"
 *
 * 2차 QA (이벤트 수집):
 *   npx ts-node src/cli.ts event-collect \
 *     --url "https://www.example.com/product/123" \
 *     --channel pc_no_login [--wait 5000] [--no-headless]
 *
 * 2차 QA (이벤트 검수 파이프라인):
 *   npx ts-node src/cli.ts event-qa \
 *     --gtm "./path/to/GTM.json" --excel "./path/to/Pre_Requirement.xlsx" \
 *     --channel pc_no_login \
 *     --domain-from staging.myshopify.com --domain-to www.example.com \
 *     [--wait 5000] [--no-headless] [--output ./output]
 */

import * as fs from 'fs';
import * as path from 'path';
import { runQAPipeline, runMultiChannelQA, runEventQAPipeline, type QAConfig, type MultiChannelQAConfig, type EventQAConfig } from './orchestrator-qa';
import {
  collectEventsFromURL,
  collectEventsFromURLsBatch,
  collectEventsWithLogin,
  printCollectedEvents,
} from './agents/collector';
import type { ChannelType } from './agents/parser';
import type { CollectorConfig } from './agents/collector';
import type { ChannelCombination } from './types/common';

// ─────────────────────────────────────────────────────────────────────
// CLI 인자 파싱 (공통)
// ─────────────────────────────────────────────────────────────────────

const VALID_CHANNELS: ChannelType[] = ['pc_login', 'pc_no_login', 'mo_login', 'mo_no_login'];

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function printUsage(): void {
  console.error('사용법: npx ts-node src/cli.ts <command> [옵션]');
  console.error('');
  console.error('명령어:');
  console.error('  global-variable       1차 QA: 전역변수 검수');
  console.error('  event-collect         2차 QA: GA4 이벤트 수집 (Phase 1)');
  console.error('  event-qa             2차 QA: 이벤트 검수 파이프라인 (Phase 2)');
  console.error('');
  console.error('── global-variable 옵션 ──');
  console.error('필수:');
  console.error('  --guide <path>        개발가이드 PDF 경로');
  console.error('  --appendix <path>     공통 변수 appendix PDF 경로');
  console.error('  --excel <path>        Pre-Requirement Excel 경로');
  console.error('');
  console.error('단일 채널 모드:');
  console.error('  --channel <ch>        채널: pc_login|pc_no_login|mo_login|mo_no_login (기본: pc_no_login)');
  console.error('  --url <url>           특정 URL만 검증 (선택)');
  console.error('');
  console.error('멀티 채널 모드:');
  console.error('  --all-channels        4채널 모두 실행');
  console.error('  --channels <list>     쉼표 구분 채널 목록 (e.g., pc_no_login,mo_no_login)');
  console.error('  --excel-report        Excel 리포트 생성');
  console.error('  --domain-map <f>:<t>  URL 도메인 변환 (e.g., staging.com:prod.com)');
  console.error('');
  console.error('── event-collect 옵션 ──');
  console.error('필수:');
  console.error('  --url <url>           수집 대상 URL (쉼표 구분으로 여러 개 가능)');
  console.error('선택:');
  console.error('  --channel <ch>        채널 (기본: pc_no_login)');
  console.error('  --wait <ms>           이벤트 수집 대기 시간 (기본: 5000)');
  console.error('  --site-url <url>      로그인 채널용 사이트 기본 URL');
  console.error('  --output <path>       JSON 결과 출력 경로');
  console.error('');
  console.error('── event-qa 옵션 ──');
  console.error('필수:');
  console.error('  --gtm <path>          GTM Container JSON 경로');
  console.error('  --excel <path>        Pre-Requirement Excel 경로');
  console.error('선택:');
  console.error('  --channel <ch>        채널 (기본: pc_no_login)');
  console.error('  --devguide <path>     개발가이드 PDF 경로 (이벤트 힌트 추출)');
  console.error('  --domain-from <d>     URL 도메인 변환 원본');
  console.error('  --domain-to <d>       URL 도메인 변환 대상');
  console.error('  --wait <ms>           액션 후 이벤트 대기 시간 (기본: 3000)');
  console.error('  --excel-report        Excel 리포트 생성');
  console.error('  --skip-recon          Site Recon 단계 건너뛰기');
  console.error('  --auto-confirm        Recon 추천 셀렉터 자동 승인');
  console.error('  --recon-cache <path>  이전 Recon 결과 캐시 재사용');
  console.error('  --knowledge-store <p> Knowledge Store 경로 (기본: {output}/knowledge-store.json)');
  console.error('  --enable-pre-interview 테스터 사전 인터뷰 활성화');
  console.error('  --enable-visual       Gemini Vision 시각 분석 활성화');
  console.error('  --gemini-key <key>    Gemini API Key (또는 GEMINI_API_KEY 환경변수)');
  console.error('');
  console.error('── 공통 옵션 ──');
  console.error('  --headless            헤드리스 모드 (기본: true)');
  console.error('  --no-headless         브라우저 표시 모드');
  console.error('  --prod                PRD 환경 테스트');
  console.error('  --timeout <ms>        타임아웃 (기본: 30000)');
  console.error('  --output <dir>        출력 디렉토리 (기본: ./output)');
  console.error('  --config <path>       .qa.json 설정 파일');
}

// ─────────────────────────────────────────────────────────────────────
// global-variable 서브커맨드
// ─────────────────────────────────────────────────────────────────────

/** .qa.json 설정 파일 스키마 */
interface QAConfigFile {
  site_id: string;
  guide_pdf: string;
  appendix_pdf: string;
  excel: string;
  domain_map?: { from: string; to: string };
  production?: boolean;
  channels?: string[];
  output_dir?: string;
  headless?: boolean;
  timeout?: number;
}

function loadConfigFile(configPath: string): QAConfigFile {
  const absolutePath = path.resolve(configPath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`설정 파일이 존재하지 않습니다: ${absolutePath}`);
    process.exit(1);
  }
  try {
    const content = fs.readFileSync(absolutePath, 'utf-8');
    return JSON.parse(content) as QAConfigFile;
  } catch (e) {
    console.error(`설정 파일 파싱 실패: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

interface ParsedGlobalVariableArgs {
  mode: 'single' | 'multi';
  guidePdfPath: string;
  appendixPdfPath: string;
  excelPath: string;
  url?: string;
  channel: ChannelType;
  channels: ChannelType[];
  excelReport: boolean;
  domainMapping?: { from: string; to: string };
  headless: boolean;
  timeout: number;
  outputDir: string;
  isProduction: boolean;
}

function parseGlobalVariableArgs(args: string[]): ParsedGlobalVariableArgs {
  const configPath = getArg(args, '--config');
  const fileConfig = configPath ? loadConfigFile(configPath) : undefined;

  const guidePath = getArg(args, '--guide') || fileConfig?.guide_pdf;
  const appendixPath = getArg(args, '--appendix') || fileConfig?.appendix_pdf;
  const excelPath = getArg(args, '--excel') || fileConfig?.excel;

  if (!guidePath || !appendixPath || !excelPath) {
    console.error('필수 옵션: --guide, --appendix, --excel (또는 --config 파일에 포함)');
    process.exit(1);
  }

  const isAllChannels = args.includes('--all-channels');
  const channelsArg = getArg(args, '--channels');
  let isMultiMode = isAllChannels || !!channelsArg;

  let channels: ChannelType[] = [];
  if (isAllChannels) {
    channels = [...VALID_CHANNELS];
  } else if (channelsArg) {
    channels = channelsArg.split(',').map(ch => ch.trim()) as ChannelType[];
    for (const ch of channels) {
      if (!VALID_CHANNELS.includes(ch)) {
        console.error(`잘못된 채널: ${ch}. 허용값: ${VALID_CHANNELS.join(', ')}`);
        process.exit(1);
      }
    }
  } else if (fileConfig?.channels && fileConfig.channels.length > 0) {
    channels = fileConfig.channels as ChannelType[];
    for (const ch of channels) {
      if (!VALID_CHANNELS.includes(ch)) {
        console.error(`잘못된 채널 (config): ${ch}. 허용값: ${VALID_CHANNELS.join(', ')}`);
        process.exit(1);
      }
    }
    isMultiMode = true;
  }

  const singleChannel = (getArg(args, '--channel') || 'pc_no_login') as ChannelType;
  if (!isMultiMode && !VALID_CHANNELS.includes(singleChannel)) {
    console.error(`잘못된 채널: ${singleChannel}. 허용값: ${VALID_CHANNELS.join(', ')}`);
    process.exit(1);
  }

  let domainMapping: { from: string; to: string } | undefined;
  const domainMapArg = getArg(args, '--domain-map');
  if (domainMapArg) {
    const parts = domainMapArg.split(':');
    if (parts.length >= 2) {
      domainMapping = { from: parts[0], to: parts.slice(1).join(':') };
    } else {
      console.error('--domain-map 형식: <from>:<to> (e.g., staging.com:prod.com)');
      process.exit(1);
    }
  } else if (fileConfig?.domain_map) {
    domainMapping = fileConfig.domain_map;
  }

  const isProduction = args.includes('--prod') || fileConfig?.production || false;
  const outputDir = getArg(args, '--output') || fileConfig?.output_dir || './output';
  const timeout = parseInt(getArg(args, '--timeout') || String(fileConfig?.timeout || 30000), 10);
  const headless = args.includes('--no-headless') ? false : (fileConfig?.headless ?? true);

  return {
    mode: isMultiMode ? 'multi' : 'single',
    guidePdfPath: guidePath,
    appendixPdfPath: appendixPath,
    excelPath: excelPath,
    url: getArg(args, '--url'),
    channel: singleChannel,
    channels,
    excelReport: args.includes('--excel-report'),
    domainMapping,
    headless,
    timeout,
    outputDir,
    isProduction,
  };
}

async function runGlobalVariable(args: string[]): Promise<void> {
  const parsed = parseGlobalVariableArgs(args);

  if (parsed.mode === 'multi') {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║     1차 QA 전역변수 검수 파이프라인 v1.1 (멀티채널)             ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    console.log('');
    console.log('설정:');
    const configArg = getArg(args, '--config');
    if (configArg) {
      console.log(`  설정 파일:     ${configArg}`);
    }
    console.log(`  개발가이드 PDF: ${parsed.guidePdfPath}`);
    console.log(`  appendix PDF:  ${parsed.appendixPdfPath}`);
    console.log(`  Excel:         ${parsed.excelPath}`);
    console.log(`  채널:          ${parsed.channels.join(', ')}`);
    console.log(`  헤드리스:      ${parsed.headless}`);
    console.log(`  타임아웃:      ${parsed.timeout}ms`);
    console.log(`  출력 디렉토리: ${parsed.outputDir}`);
    console.log(`  환경:          ${parsed.isProduction ? 'PRD' : 'TEST'}`);
    console.log(`  Excel 리포트:  ${parsed.excelReport}`);
    if (parsed.domainMapping) {
      console.log(`  도메인 변환:   ${parsed.domainMapping.from} → ${parsed.domainMapping.to}`);
    }

    const multiConfig: MultiChannelQAConfig = {
      guidePdfPath: parsed.guidePdfPath,
      appendixPdfPath: parsed.appendixPdfPath,
      excelPath: parsed.excelPath,
      channels: parsed.channels,
      headless: parsed.headless,
      timeout: parsed.timeout,
      outputDir: parsed.outputDir,
      isProduction: parsed.isProduction,
      domainMapping: parsed.domainMapping,
      excelReport: parsed.excelReport,
    };

    try {
      const result = await runMultiChannelQA(multiConfig);
      const hasFailures = Object.values(result.results).some(
        v => v && v.overall_summary.failed > 0
      );
      if (hasFailures) {
        process.exit(1);
      }
    } catch (e) {
      console.error('\n파이프라인 실행 실패:', e instanceof Error ? e.message : String(e));
      process.exit(2);
    }
  } else {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║     1차 QA 전역변수 검수 파이프라인 v1.0                        ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    const config: QAConfig = {
      guidePdfPath: parsed.guidePdfPath,
      appendixPdfPath: parsed.appendixPdfPath,
      excelPath: parsed.excelPath,
      url: parsed.url,
      channel: parsed.channel,
      headless: parsed.headless,
      timeout: parsed.timeout,
      outputDir: parsed.outputDir,
      isProduction: parsed.isProduction,
    };

    console.log('');
    console.log('설정:');
    const singleConfigArg = getArg(args, '--config');
    if (singleConfigArg) {
      console.log(`  설정 파일:     ${singleConfigArg}`);
    }
    console.log(`  개발가이드 PDF: ${config.guidePdfPath}`);
    console.log(`  appendix PDF:  ${config.appendixPdfPath}`);
    console.log(`  Excel:         ${config.excelPath}`);
    console.log(`  URL:           ${config.url || '(Excel 기준)'}`);
    console.log(`  채널:          ${config.channel}`);
    console.log(`  헤드리스:      ${config.headless}`);
    console.log(`  타임아웃:      ${config.timeout}ms`);
    console.log(`  출력 디렉토리: ${config.outputDir}`);
    console.log(`  환경:          ${config.isProduction ? 'PRD' : 'TEST'}`);

    try {
      const result = await runQAPipeline(config);
      if (result.overall_summary.failed > 0) {
        process.exit(1);
      }
    } catch (e) {
      console.error('\n파이프라인 실행 실패:', e instanceof Error ? e.message : String(e));
      process.exit(2);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// event-collect 서브커맨드
// ─────────────────────────────────────────────────────────────────────

interface ParsedEventCollectArgs {
  urls: string[];
  channel: ChannelType;
  headless: boolean;
  timeout: number;
  waitMs: number;
  siteUrl?: string;
  outputPath?: string;
}

function parseEventCollectArgs(args: string[]): ParsedEventCollectArgs {
  const urlArg = getArg(args, '--url');
  if (!urlArg) {
    console.error('필수 옵션: --url <url> (쉼표 구분으로 여러 개 가능)');
    process.exit(1);
  }

  const urls = urlArg.split(',').map(u => u.trim()).filter(Boolean);
  if (urls.length === 0) {
    console.error('유효한 URL을 입력해주세요.');
    process.exit(1);
  }

  const channel = (getArg(args, '--channel') || 'pc_no_login') as ChannelType;
  if (!VALID_CHANNELS.includes(channel)) {
    console.error(`잘못된 채널: ${channel}. 허용값: ${VALID_CHANNELS.join(', ')}`);
    process.exit(1);
  }

  const headless = args.includes('--no-headless') ? false : true;
  const timeout = parseInt(getArg(args, '--timeout') || '30000', 10);
  const waitMs = parseInt(getArg(args, '--wait') || '5000', 10);
  const siteUrl = getArg(args, '--site-url');
  const outputPath = getArg(args, '--output');

  return { urls, channel, headless, timeout, waitMs, siteUrl, outputPath };
}

async function runEventCollect(args: string[]): Promise<void> {
  const parsed = parseEventCollectArgs(args);

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     2차 QA 이벤트 수집 (Phase 1: Network Collector)           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  console.log('');
  console.log('설정:');
  console.log(`  URL:           ${parsed.urls.join(', ')}`);
  console.log(`  채널:          ${parsed.channel}`);
  console.log(`  헤드리스:      ${parsed.headless}`);
  console.log(`  타임아웃:      ${parsed.timeout}ms`);
  console.log(`  대기 시간:     ${parsed.waitMs}ms`);
  if (parsed.siteUrl) {
    console.log(`  사이트 URL:    ${parsed.siteUrl}`);
  }
  if (parsed.outputPath) {
    console.log(`  출력 경로:     ${parsed.outputPath}`);
  }

  const config: CollectorConfig = {
    channel: parsed.channel,
    timeout_ms: parsed.timeout,
    headless: parsed.headless,
    viewport: parsed.channel.startsWith('mo')
      ? { width: 375, height: 812 }
      : { width: 1920, height: 1080 },
  };

  const isLoginChannel = parsed.channel.includes('login') && !parsed.channel.includes('no_login');

  try {
    let results;

    if (isLoginChannel) {
      if (!parsed.siteUrl) {
        console.error('로그인 채널은 --site-url 옵션이 필요합니다.');
        process.exit(1);
      }
      results = await collectEventsWithLogin(parsed.urls, config, parsed.siteUrl, parsed.waitMs);
    } else if (parsed.urls.length === 1) {
      const result = await collectEventsFromURL(parsed.urls[0], config, parsed.waitMs);
      results = [result];
    } else {
      results = await collectEventsFromURLsBatch(parsed.urls, config, parsed.waitMs);
    }

    // 콘솔 출력
    printCollectedEvents(results);

    // JSON 출력 (옵션)
    if (parsed.outputPath) {
      const outputDir = path.dirname(parsed.outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(parsed.outputPath, JSON.stringify(results, null, 2), 'utf-8');
      console.log(`\nJSON 결과 저장: ${parsed.outputPath}`);
    }
  } catch (e) {
    console.error('\n이벤트 수집 실패:', e instanceof Error ? e.message : String(e));
    process.exit(2);
  }
}

// ─────────────────────────────────────────────────────────────────────
// event-qa 서브커맨드 (Phase 2: 이벤트 검수 파이프라인)
// ─────────────────────────────────────────────────────────────────────

async function runEventQA(args: string[]): Promise<void> {
  const gtmPath = getArg(args, '--gtm');
  const excelPath = getArg(args, '--excel');

  if (!gtmPath || !excelPath) {
    console.error('필수 옵션: --gtm <path>, --excel <path>');
    process.exit(1);
  }

  const channel = (getArg(args, '--channel') || 'pc_no_login') as ChannelCombination;
  if (!VALID_CHANNELS.includes(channel as ChannelType)) {
    console.error(`잘못된 채널: ${channel}. 허용값: ${VALID_CHANNELS.join(', ')}`);
    process.exit(1);
  }

  const headless = args.includes('--no-headless') ? false : true;
  const timeout = parseInt(getArg(args, '--timeout') || '30000', 10);
  const outputDir = getArg(args, '--output') || './output';
  const waitMs = parseInt(getArg(args, '--wait') || '3000', 10);

  const domainFrom = getArg(args, '--domain-from');
  const domainTo = getArg(args, '--domain-to');
  const domainMapping = domainFrom && domainTo ? { from: domainFrom, to: domainTo } : undefined;
  const devGuidePdfPath = getArg(args, '--devguide');

  const excelReport = args.includes('--excel-report');
  const skipRecon = args.includes('--skip-recon');
  const autoConfirm = args.includes('--auto-confirm');
  const reconCachePath = getArg(args, '--recon-cache');
  const knowledgeStorePath = getArg(args, '--knowledge-store');
  const enablePreInterview = args.includes('--enable-pre-interview');
  const enableVisualAnalysis = args.includes('--enable-visual');
  const geminiApiKey = getArg(args, '--gemini-key') || process.env.GEMINI_API_KEY;

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     2차 QA 이벤트 검수 파이프라인 v2.0 (Site Recon)            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  console.log('');
  console.log('설정:');
  console.log(`  GTM JSON:      ${gtmPath}`);
  console.log(`  Excel:         ${excelPath}`);
  if (devGuidePdfPath) {
    console.log(`  개발가이드:    ${devGuidePdfPath}`);
  }
  console.log(`  채널:          ${channel}`);
  console.log(`  헤드리스:      ${headless}`);
  console.log(`  타임아웃:      ${timeout}ms`);
  console.log(`  대기 시간:     ${waitMs}ms`);
  console.log(`  출력 디렉토리: ${outputDir}`);
  if (domainMapping) {
    console.log(`  도메인 변환:   ${domainMapping.from} → ${domainMapping.to}`);
  }
  console.log(`  Site Recon:    ${skipRecon ? '건너뛰기' : '활성화'}`);
  if (!skipRecon) {
    console.log(`  자동 승인:     ${autoConfirm}`);
    if (reconCachePath) {
      console.log(`  Recon 캐시:    ${reconCachePath}`);
    }
  }
  if (knowledgeStorePath) {
    console.log(`  Knowledge:     ${knowledgeStorePath}`);
  }
  if (enablePreInterview) {
    console.log(`  사전 인터뷰:   활성화`);
  }
  if (enableVisualAnalysis) {
    console.log(`  Visual 분석:   활성화${geminiApiKey ? '' : ' (Gemini API Key 필요!)'}`);
  }

  const config: EventQAConfig = {
    gtmJsonPath: gtmPath,
    preRequirementExcelPath: excelPath,
    channel,
    headless,
    timeout,
    outputDir,
    domainMapping,
    waitMs,
    excelReport,
    devGuidePdfPath,
    skipRecon,
    autoConfirm,
    reconCachePath,
    knowledgeStorePath,
    enableVisualAnalysis,
    geminiApiKey,
    enablePreInterview,
  };

  try {
    const result = await runEventQAPipeline(config);
    if (result.summary.failed_events > 0 || result.summary.missing_events > 0) {
      process.exit(1);
    }
  } catch (e) {
    console.error('\n이벤트 검수 파이프라인 실패:', e instanceof Error ? e.message : String(e));
    process.exit(2);
  }
}

// ─────────────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'global-variable':
      await runGlobalVariable(args);
      break;

    case 'event-collect':
      await runEventCollect(args);
      break;

    case 'event-qa':
      await runEventQA(args);
      break;

    default:
      printUsage();
      process.exit(1);
  }
}

main();
