/**
 * QA Orchestrator - 파이프라인 실행기
 *
 * Parser → Collector → Validator → Reporter
 * 단일 채널 모드 (runQAPipeline) + 멀티 채널 모드 (runMultiChannelQA) 지원
 */

import { runParser, runParserShared, type GlobalVariableParserOutput, type ChannelType, type URLVariableSpec } from './agents/parser';
import { collectFromURLs, collectFromURLsBatch, collectWithLogin, type CollectorConfig, type GlobalVariableCollectedData } from './agents/collector';
import { validateAll, type GlobalVariableValidationOutput } from './agents/validator';
import { printFullReport, saveJsonReport, generateExcelReport, type ExcelReportInput } from './agents/reporter';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface QAConfig {
  guidePdfPath: string;
  appendixPdfPath: string;
  excelPath: string;
  url?: string;
  channel: 'pc_login' | 'pc_no_login' | 'mo_login' | 'mo_no_login';
  headless: boolean;
  timeout: number;
  outputDir: string;
  /** PRD 환경 테스트 여부 (true이면 ENV=PRD를 정상으로 판정) */
  isProduction: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// 파이프라인 실행
// ─────────────────────────────────────────────────────────────────────

export async function runQAPipeline(config: QAConfig): Promise<GlobalVariableValidationOutput> {
  const startTime = Date.now();

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 1: Parser
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n[1/4] Parser Agent 실행 중...');

  let parserOutput: GlobalVariableParserOutput;
  try {
    parserOutput = runParser({
      guidePdfPath: config.guidePdfPath,
      appendixPdfPath: config.appendixPdfPath,
      excelPath: config.excelPath,
      channel: config.channel,
      isProduction: config.isProduction,
    });
  } catch (e) {
    console.error('Parser 실패:', e instanceof Error ? e.message : String(e));
    throw e;
  }

  if (parserOutput.warnings.length > 0) {
    console.log('  경고:');
    for (const w of parserOutput.warnings) {
      console.log(`    - ${w}`);
    }
  }

  console.log(`  변수 규칙: ${parserOutput.judgment_rules.length}개`);
  console.log(`  URL 스펙: ${parserOutput.url_specs.length}개`);
  console.log(`  사이트 매핑: ${parserOutput.site_mappings.length}개`);

  // URL 필터링 (특정 URL만 검증하는 경우)
  let targetURLs: string[];
  if (config.url) {
    targetURLs = [config.url];
    // URL 스펙이 없는 경우 기본 스펙 생성
    if (!parserOutput.url_specs.some(s => s.url === config.url)) {
      parserOutput.url_specs.push(createDefaultURLSpec(
        config.url,
        config.channel,
        parserOutput.site_mappings,
        config.isProduction,
      ));
    }
  } else {
    targetURLs = parserOutput.url_specs.map(s => s.url);
  }

  if (targetURLs.length === 0) {
    throw new Error('검증할 URL이 없습니다');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 2: Collector
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n[2/4] Collector Agent 실행 중...');
  console.log(`  대상 URL: ${targetURLs.length}개`);
  console.log(`  채널: ${config.channel}`);

  const collectorConfig: CollectorConfig = {
    channel: config.channel,
    timeout_ms: config.timeout,
    headless: config.headless,
    viewport: config.channel.startsWith('pc')
      ? { width: 1920, height: 1080 }
      : { width: 375, height: 812 },
  };

  let collectedDataList: GlobalVariableCollectedData[];
  try {
    collectedDataList = await collectFromURLs(targetURLs, collectorConfig);
  } catch (e) {
    console.error('Collector 실패:', e instanceof Error ? e.message : String(e));
    throw e;
  }

  console.log(`  수집 완료: ${collectedDataList.length}개 URL`);

  // 수집 오류 보고
  for (const d of collectedDataList) {
    if (d.errors.length > 0) {
      console.log(`  [경고] ${d.url}:`);
      for (const err of d.errors) {
        console.log(`    - ${err}`);
      }
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 3: Validator
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n[3/4] Validator Agent 실행 중...');

  const validationOutput = validateAll(
    collectedDataList,
    parserOutput.url_specs,
    parserOutput.judgment_rules,
  );

  console.log(`  검증 완료: ${validationOutput.url_results.length}개 URL`);
  console.log(`  통과율: ${validationOutput.overall_summary.pass_rate}%`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 4: Reporter
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n[4/4] Reporter Agent 실행 중...');

  // 콘솔 출력
  printFullReport(validationOutput);

  // JSON 저장
  const jsonPath = saveJsonReport(validationOutput, config.outputDir);
  console.log(`  JSON 리포트: ${jsonPath}`);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n전체 소요 시간: ${elapsed}초`);

  return validationOutput;
}

// ─────────────────────────────────────────────────────────────────────
// 기본 URL 스펙 생성 (Excel 없이 URL만 지정한 경우)
// ─────────────────────────────────────────────────────────────────────

import type { ExpectedValue, SiteMapping } from './agents/parser';

function createDefaultURLSpec(
  url: string,
  channel: 'pc_login' | 'pc_no_login' | 'mo_login' | 'mo_no_login',
  siteMappings: SiteMapping[],
  isProduction = false,
): URLVariableSpec {
  const isLogin = channel.includes('login') && !channel.includes('no_login');
  const isPC = channel.startsWith('pc');

  let domain = '';
  try {
    domain = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    domain = url;
  }

  const mapping = siteMappings.find(m => domain.includes(m.domain) || m.domain.includes(domain));

  if (!mapping) {
    console.warn(`  ⚠️  사이트 매핑 누락: ${domain} → COUNTRY/LANG = UNKNOWN`);
    console.warn(`     → --domain-map 옵션 또는 --config 파일 확인 필요`);
  }

  const expected: Record<string, ExpectedValue> = {
    'AP_DATA_SITENAME': { value: mapping?.site_name || domain.split('.')[0].toUpperCase(), source: 'pdf_appendix' },
    'AP_DATA_COUNTRY': { value: mapping?.country || 'UNKNOWN', source: 'pdf_appendix' },
    'AP_DATA_LANG': { value: mapping?.language || 'UNKNOWN', source: 'pdf_appendix' },
    'AP_DATA_ENV': { value: isProduction ? 'PRD' : '≠PRD', source: 'env_rule' },
    'AP_DATA_CHANNEL': { value: isPC ? 'PC' : 'MOBILE', source: 'channel_rule' },
    'AP_DATA_BREAD': { value: null, source: 'excel' },
    'AP_DATA_PAGETYPE': { value: null, source: 'excel' },
    'AP_PROMO_ID': { value: 'OPTIONAL', source: 'conditional' },
    'AP_PROMO_NAME': { value: 'OPTIONAL', source: 'conditional' },
    'AP_DATA_ISLOGIN': { value: isLogin ? 'Y' : 'N', source: 'channel_rule' },
  };

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
    url,
    page_type: '',
    page_bread: '',
    channel,
    expected_values: expected,
  };
}

// ─────────────────────────────────────────────────────────────────────
// 멀티채널 QA 파이프라인
// ─────────────────────────────────────────────────────────────────────

export interface MultiChannelQAConfig {
  guidePdfPath: string;
  appendixPdfPath: string;
  excelPath: string;
  channels: ChannelType[];
  headless: boolean;
  timeout: number;
  outputDir: string;
  isProduction: boolean;
  domainMapping?: { from: string; to: string };
  excelReport: boolean;
}

export interface MultiChannelQAResult {
  results: Record<string, GlobalVariableValidationOutput | null>;
  skippedChannels: string[];
  totalElapsedSeconds: number;
  excelReportPath?: string;
}

/**
 * URL의 도메인을 치환 (staging → PRD 변환)
 */
function replaceDomain(url: string, from: string, to: string): string {
  return url.replace(from, to);
}

/**
 * 멀티채널 QA 파이프라인 실행
 *
 * 1. PDF/Excel 1회 파싱
 * 2. 도메인 변환 적용
 * 3. no_login 채널 → 병렬 배치 수집+검증
 * 4. login 채널 → Human-in-the-Loop 순차 수집+검증
 * 5. Excel 리포트 생성
 */
export async function runMultiChannelQA(config: MultiChannelQAConfig): Promise<MultiChannelQAResult> {
  const startTime = Date.now();
  const results: Record<string, GlobalVariableValidationOutput | null> = {};
  const collectedDataMap: Record<string, GlobalVariableCollectedData[]> = {};
  const urlSpecsMap: Record<string, URLVariableSpec[]> = {};
  const skippedChannels: string[] = [];

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 1: Parser (1회만 실행)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n[1/5] Parser Agent 실행 중 (공유 파싱)...');

  const shared = runParserShared({
    guidePdfPath: config.guidePdfPath,
    appendixPdfPath: config.appendixPdfPath,
    excelPath: config.excelPath,
    isProduction: config.isProduction,
  });

  if (shared.warnings.length > 0) {
    console.log('  경고:');
    for (const w of shared.warnings) {
      console.log(`    - ${w}`);
    }
  }

  console.log(`  판정 규칙: ${shared.judgmentRules.length}개`);
  console.log(`  사이트 매핑: ${shared.siteMappings.length}개`);
  console.log(`  Excel URL: ${shared.excelURLs.length}개`);

  // 도메인 변환: Excel URL을 먼저 치환 (사이트 매핑 조회가 올바른 도메인으로 수행되도록)
  if (config.domainMapping) {
    for (const entry of shared.excelURLs) {
      entry.url = replaceDomain(entry.url, config.domainMapping.from, config.domainMapping.to);
    }
    console.log(`  도메인 변환 적용: ${config.domainMapping.from} → ${config.domainMapping.to}`);
  }

  // 채널별 URL 스펙 생성 (도메인 변환 적용된 URL 기준)
  // 로그인 채널은 no_login URL도 포함하여 전체 URL을 로그인 상태로 크롤링
  for (const channel of config.channels) {
    const specs = shared.buildSpecsForChannel(channel, config.isProduction);

    if (channel.includes('login') && !channel.includes('no_login')) {
      // 로그인 채널: 대응하는 no_login 채널의 URL도 포함
      const noLoginChannel = channel.replace('_login', '_no_login') as ChannelType;
      const noLoginSpecs = shared.buildSpecsForChannel(noLoginChannel, config.isProduction);

      // no_login URL 중 login 스펙에 없는 것을 login 채널용으로 변환하여 추가
      const loginUrls = new Set(specs.map(s => s.url));
      for (const nlSpec of noLoginSpecs) {
        if (!loginUrls.has(nlSpec.url)) {
          specs.push({ ...nlSpec, channel });
        }
      }
    }

    urlSpecsMap[channel] = specs;
    console.log(`  [${channel}] URL 스펙: ${specs.length}개`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 2: no_login 채널 병렬 수집
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const noLoginChannels = config.channels.filter(ch => ch.includes('no_login'));
  const loginChannels = config.channels.filter(ch => ch.includes('login') && !ch.includes('no_login'));

  if (noLoginChannels.length > 0) {
    console.log(`\n[2/5] Collector Agent - 비로그인 채널 (${noLoginChannels.join(', ')})...`);

    const noLoginPromises = noLoginChannels.map(async (channel) => {
      const specs = urlSpecsMap[channel];
      if (!specs || specs.length === 0) {
        console.log(`  [${channel}] URL 없음 - 건너뜀`);
        skippedChannels.push(channel);
        return;
      }

      const urls = specs.map(s => s.url);
      const collectorConfig: CollectorConfig = {
        channel,
        timeout_ms: config.timeout,
        headless: config.headless,
        viewport: channel.startsWith('pc')
          ? { width: 1920, height: 1080 }
          : { width: 375, height: 812 },
      };

      console.log(`  [${channel}] ${urls.length}개 URL 수집 시작...`);
      const collected = await collectFromURLsBatch(urls, collectorConfig);
      collectedDataMap[channel] = collected;
      console.log(`  [${channel}] 수집 완료: ${collected.length}개`);
    });

    await Promise.all(noLoginPromises);
  } else {
    console.log('\n[2/5] 비로그인 채널 없음 - 건너뜀');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 3: login 채널 병렬 수집 (Human-in-the-Loop)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (loginChannels.length > 0) {
    console.log(`\n[3/5] Collector Agent - 로그인 채널 (${loginChannels.join(', ')}) 병렬 실행...`);
    console.log('  각 채널별 브라우저가 열립니다. 모든 브라우저에서 로그인해주세요.');

    const loginPromises = loginChannels.map(async (channel) => {
      const specs = urlSpecsMap[channel];
      if (!specs || specs.length === 0) {
        console.log(`  [${channel}] URL 없음 - 건너뜀`);
        skippedChannels.push(channel);
        return;
      }

      const urls = specs.map(s => s.url);

      // 메인 사이트 URL 추출
      let siteUrl = urls[0];
      try {
        const parsed = new URL(urls[0]);
        siteUrl = `${parsed.protocol}//${parsed.host}`;
      } catch {
        // fallback
      }

      const collectorConfig: CollectorConfig = {
        channel,
        timeout_ms: config.timeout,
        headless: false, // 로그인 채널은 항상 visible
        viewport: channel.startsWith('pc')
          ? { width: 1920, height: 1080 }
          : { width: 375, height: 812 },
      };

      console.log(`\n  [${channel}] ${urls.length}개 URL 로그인 수집 시작...`);
      const collected = await collectWithLogin(urls, collectorConfig, siteUrl);
      collectedDataMap[channel] = collected;
      console.log(`  [${channel}] 수집 완료: ${collected.length}개`);
    });

    await Promise.all(loginPromises);
  } else {
    console.log('\n[3/5] 로그인 채널 없음 - 건너뜀');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 4: 채널별 검증
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n[4/5] Validator Agent 실행 중...');

  for (const channel of config.channels) {
    const collected = collectedDataMap[channel];
    const specs = urlSpecsMap[channel];

    if (!collected || collected.length === 0) {
      results[channel] = null;
      continue;
    }

    const validation = validateAll(collected, specs, shared.judgmentRules);
    results[channel] = validation;

    console.log(`  [${channel}] 검증 완료: ${validation.url_results.length}개 URL, 통과율 ${validation.overall_summary.pass_rate}%`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 5: Reporter
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n[5/5] Reporter Agent 실행 중...');

  // 채널별 콘솔 리포트
  for (const channel of config.channels) {
    const validation = results[channel];
    if (validation) {
      console.log(`\n${'━'.repeat(72)}`);
      console.log(`채널: ${channel}`);
      printFullReport(validation);
    }
  }

  // 채널별 JSON 리포트
  for (const channel of config.channels) {
    const validation = results[channel];
    if (validation) {
      saveJsonReport(validation, config.outputDir);
    }
  }

  // Excel 리포트
  let excelReportPath: string | undefined;
  if (config.excelReport) {
    console.log('\n  Excel 리포트 생성 중...');
    const excelInput: ExcelReportInput = {
      results,
      collectedData: collectedDataMap,
      urlSpecs: urlSpecsMap,
      outputDir: config.outputDir,
    };
    excelReportPath = await generateExcelReport(excelInput);
    console.log(`  Excel 리포트: ${excelReportPath}`);
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\n전체 소요 시간: ${elapsed.toFixed(1)}초`);

  // 전체 요약
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║           멀티채널 QA 전체 요약                                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  for (const channel of config.channels) {
    const v = results[channel];
    if (v) {
      const s = v.overall_summary;
      console.log(`  [${channel}] URL: ${s.total_urls} | O: ${s.passed} | △: ${s.partial} | X: ${s.failed} | 통과율: ${s.pass_rate}%`);
    } else {
      console.log(`  [${channel}] 건너뜀`);
    }
  }
  console.log('');

  return {
    results,
    skippedChannels,
    totalElapsedSeconds: elapsed,
    excelReportPath,
  };
}
