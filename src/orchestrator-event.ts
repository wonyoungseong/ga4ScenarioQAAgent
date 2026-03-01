/**
 * Event QA Orchestrator - 2차 QA 이벤트 검수 파이프라인
 *
 * [0/5] Dev Guide PDF: 이벤트 힌트 + dataLayer 매핑 (optional)
 * [1/5] GTM Parser:  GTM JSON + Excel → EventScenarioSpec + ParameterSpec
 * [2/5] Site Recon:  동적 페이지 탐사 + 셀렉터 발견 (optional)
 * [3/5] Action Collector: 시나리오별 페이지 방문 + 액션 시뮬레이션 + 이벤트 수집
 * [4/5] Event Validator: Layer 1 이벤트 발생 여부 + Layer 2 파라미터 + Content Group
 * [5/5] Event Reporter: 콘솔 + JSON 리포트
 */

import { parseGTMContainer } from './agents/parser/gtm-parser';
import type { GTMParserOutput } from './types/content-group';
import { parseDevGuidePDF } from './agents/parser/devguide-parser';
import type { DevGuideEventHint } from './types/devguide';
import { collectEventsWithActions } from './agents/collector/action-collector';
import type { ScenarioCollectedData } from './types/collected-data';
import { validateAllEvents } from './agents/validator/event-validator';
import {
  printEventReport,
  printEventBasedReport,
  saveEventJsonReport,
  generateEventExcelReport,
  printCustomEventSection,
} from './agents/reporter/event-reporter';
import { observeCustomEvents } from './agents/observer/custom-event-observer';
import type { CollectorConfig } from './agents/collector/browser-collector';
import type { EventValidationResult } from './types/event-validation-result';
import type { ChannelCombination } from './types/common';
import { runSiteRecon, enrichScenariosWithRecon } from './agents/recon/site-recon-agent';
import {
  loadKnowledgeStore,
  saveKnowledgeStore,
  createEmptyStore,
  recordSelectorResult,
} from './knowledge/knowledge-store';
import type { KnowledgeStore } from './types/knowledge-state';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface EventQAConfig {
  gtmJsonPath: string;
  preRequirementExcelPath: string;
  channel: ChannelCombination;
  headless: boolean;
  timeout: number;
  outputDir: string;
  domainMapping?: { from: string; to: string };
  waitMs?: number;
  excelReport?: boolean;
  /** 개발가이드 PDF 경로 (선택) - 이벤트 힌트 추출 */
  devGuidePdfPath?: string;
  /** Site Recon 건너뛰기 */
  skipRecon?: boolean;
  /** Recon 추천 셀렉터 자동 승인 */
  autoConfirm?: boolean;
  /** 이전 Recon 결과 캐시 경로 */
  reconCachePath?: string;
  /** Visual Analysis 활성화 (Gemini Vision) */
  enableVisualAnalysis?: boolean;
  /** Gemini API Key */
  geminiApiKey?: string;
  /** Knowledge Store 경로 */
  knowledgeStorePath?: string;
  /** 테스터 사전 인터뷰 활성화 */
  enablePreInterview?: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// Pipeline
// ─────────────────────────────────────────────────────────────────────

export async function runEventQAPipeline(config: EventQAConfig): Promise<EventValidationResult> {
  const startTime = Date.now();

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 0: Dev Guide PDF 파싱 (optional)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  let devGuideHints: DevGuideEventHint[] | undefined;
  let dataLayerToGA4Map: Record<string, string> | undefined;

  if (config.devGuidePdfPath) {
    console.log('\n[0/5] Dev Guide PDF 파싱 중...');
    try {
      const devGuideOutput = parseDevGuidePDF(config.devGuidePdfPath);
      devGuideHints = devGuideOutput.events;
      dataLayerToGA4Map = devGuideOutput.dataLayer_to_ga4_map;
      if (devGuideOutput.warnings.length > 0) {
        for (const w of devGuideOutput.warnings) {
          console.log(`  경고: ${w}`);
        }
      }
      console.log(`  dataLayer 매핑: ${Object.keys(devGuideOutput.dataLayer_to_ga4_map).length}개`);
    } catch (e) {
      console.warn('Dev Guide PDF 파싱 실패 (계속 진행):', e instanceof Error ? e.message : String(e));
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 1: GTM Parser
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n[1/5] GTM Parser 실행 중...');

  let parserOutput: GTMParserOutput;
  try {
    parserOutput = parseGTMContainer(
      config.gtmJsonPath,
      config.preRequirementExcelPath,
      {
        domainMapping: config.domainMapping,
      },
      devGuideHints,
      dataLayerToGA4Map,
    );
  } catch (e) {
    console.error('GTM Parser 실패:', e instanceof Error ? e.message : String(e));
    throw e;
  }

  if (parserOutput.warnings.length > 0) {
    console.log('  경고:');
    for (const w of parserOutput.warnings) {
      console.log(`    - ${w}`);
    }
  }

  console.log(`  이벤트 정의: ${parserOutput.scenario_spec.total_events}개`);
  console.log(`  시나리오: ${parserOutput.scenario_spec.total_scenarios}개`);
  console.log(`  파라미터 스펙: ${parserOutput.parameter_spec.total_events}개 이벤트, ${parserOutput.parameter_spec.total_parameters}개 파라미터`);
  console.log(`  Content Group 규칙: ${parserOutput.content_group_rules.length}개`);

  // 교차 검증 결과 출력
  if (parserOutput.cross_reference_results && parserOutput.cross_reference_results.length > 0) {
    console.log('\n  [교차 검증 결과]');
    for (const result of parserOutput.cross_reference_results) {
      for (const warning of result.warnings) {
        const icon = warning.severity === 'CRITICAL' ? '!!!'
          : warning.severity === 'WARNING' ? '!!'
          : 'i';
        console.log(`    [${icon}] [${warning.event_name}] ${warning.message}`);
        if (warning.resolution) {
          console.log(`         해결: ${warning.resolution}`);
        }
      }
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 1.5: Knowledge Readiness Assessment (NEW)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const knowledgeStorePath = config.knowledgeStorePath
    ?? `${config.outputDir}/knowledge-store.json`;
  let knowledgeStore: KnowledgeStore | null = loadKnowledgeStore(knowledgeStorePath);
  if (!knowledgeStore) {
    // 새 Knowledge Store 생성
    const siteBaseUrl = parserOutput.scenario_spec.scenarios[0]?.test_urls?.[0] ?? 'unknown';
    knowledgeStore = createEmptyStore(parserOutput.scenario_spec.project_id, siteBaseUrl);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 2: Site Recon
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const collectorConfig: CollectorConfig = {
    channel: config.channel,
    timeout_ms: config.timeout,
    headless: config.headless,
    viewport: config.channel.startsWith('pc')
      ? { width: 1920, height: 1080 }
      : { width: 375, height: 812 },
  };

  if (!config.skipRecon) {
    console.log('\n[2/5] Site Recon Agent 실행 중...');
    try {
      const reconReport = await runSiteRecon(
        parserOutput.scenario_spec.scenarios,
        parserOutput.content_group_rules,
        collectorConfig,
        {
          interactive: !config.autoConfirm,
          autoConfirm: config.autoConfirm,
          cachePath: config.reconCachePath,
          waitMs: config.waitMs,
          knowledgeStorePath,
          outputDir: config.outputDir,
          enableVisualAnalysis: config.enableVisualAnalysis,
          geminiApiKey: config.geminiApiKey,
          enablePreInterview: config.enablePreInterview,
        },
      );

      // Recon 결과로 시나리오 enrichment (순수 함수 → 새 배열 반환)
      parserOutput.scenario_spec = {
        ...parserOutput.scenario_spec,
        scenarios: enrichScenariosWithRecon(parserOutput.scenario_spec.scenarios, reconReport),
      };
    } catch (e) {
      console.warn('Site Recon 실패 (계속 진행):', e instanceof Error ? e.message : String(e));
    }
  } else {
    console.log('\n[2/5] Site Recon 건너뛰기 (--skip-recon)');

    // Recon 스킵 시에도 Knowledge Store에서 셀렉터/인사이트 주입
    if (knowledgeStore) {
      let enrichedCount = 0;
      const originalScenarios = parserOutput.scenario_spec.scenarios;
      const enrichedScenarios = originalScenarios.map(scenario => {
        if (!scenario.user_action) return scenario;

        const eventName = scenario.expected_events[0]?.event_name ?? '';
        const pageType = scenario.page_type;
        const eventKnowledge = knowledgeStore!.events[eventName];
        if (!eventKnowledge) return scenario;

        // 1. 셀렉터 주입 (stored selector 우선, 없으면 insight의 known_selector)
        const storedSelector = eventKnowledge.selectors?.[pageType];
        const insight = eventKnowledge.tester_insights?.[pageType];
        const knowledgeSelector = storedSelector?.selector ?? insight?.known_selector;
        const targetSelector = knowledgeSelector ?? scenario.user_action.target_selector;

        // 2. TesterInsight에서 prerequisite_actions 주입
        const prerequisiteActions = insight?.is_multi_step
          ? insight.prerequisite_actions.map(pa => ({
              action_type: pa.action_type as 'click' | 'wait' | 'navigate' | 'scroll' | 'hover',
              selector: pa.selector,
              wait_ms: pa.wait_ms,
              url: pa.url,
              description: pa.description,
            }))
          : undefined;

        const changed = targetSelector !== scenario.user_action.target_selector
          || (prerequisiteActions && prerequisiteActions.length > 0);
        if (changed) enrichedCount++;

        return {
          ...scenario,
          user_action: {
            ...scenario.user_action,
            target_selector: targetSelector,
            prerequisite_actions: prerequisiteActions,
          },
        };
      });

      parserOutput.scenario_spec = {
        ...parserOutput.scenario_spec,
        scenarios: enrichedScenarios,
      };

      console.log(`  📚 Knowledge Store에서 ${enrichedCount}개 시나리오 셀렉터/인사이트 주입`);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 3: Action Collector
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n[3/5] Action Collector 실행 중...');
  console.log(`  채널: ${config.channel}`);
  console.log(`  시나리오 수: ${parserOutput.scenario_spec.scenarios.length}개`);

  let collectedData: ScenarioCollectedData[];
  try {
    collectedData = await collectEventsWithActions(
      parserOutput.scenario_spec.scenarios,
      collectorConfig,
      { waitMs: config.waitMs, skipActionOnError: true },
    );
  } catch (e) {
    console.error('Action Collector 실패:', e instanceof Error ? e.message : String(e));
    throw e;
  }

  console.log(`  수집 완료: ${collectedData.length}개 시나리오`);

  // 수집 오류 보고
  const errorScenarios = collectedData.filter(d => d.errors.length > 0);
  if (errorScenarios.length > 0) {
    console.log(`  [경고] ${errorScenarios.length}개 시나리오에서 오류 발생:`);
    for (const d of errorScenarios) {
      for (const err of d.errors) {
        console.log(`    - [${d.scenario_id}] ${err}`);
      }
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 4: Event Validator
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n[4/5] Event Validator 실행 중...');

  const validationResult = validateAllEvents(
    collectedData,
    parserOutput.scenario_spec,
    parserOutput.parameter_spec,
    parserOutput.content_group_rules,
    parserOutput.raw_container,
  );

  console.log(`  검증 완료: ${validationResult.scenario_results.length}개 시나리오`);
  console.log(`  시나리오 통과율: ${validationResult.summary.scenario_pass_rate}%`);
  console.log(`  이벤트 통과율: ${validationResult.summary.event_pass_rate}%`);

  // ── Knowledge Store 피드백 루프 ──
  if (knowledgeStore) {
    for (const sr of validationResult.scenario_results) {
      if (sr.user_action_performed) {
        const success = sr.user_action_performed.success;
        // 시나리오에서 이벤트명 추출
        for (const er of sr.event_results) {
          if (er.expected_to_fire) {
            recordSelectorResult(knowledgeStore, er.event_name, sr.page_type, success && er.status === 'PASS');
          }
        }
      }
    }
    saveKnowledgeStore(knowledgeStore, knowledgeStorePath);
    console.log(`  💾 Knowledge Store 업데이트: ${knowledgeStorePath}`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 4.5: Custom Event Observer
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const customEventReport = observeCustomEvents(collectedData);
  if (customEventReport.total_observations > 0) {
    console.log(`\n[4.5] Custom Event Observer: ${customEventReport.total_observations}건 관측`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 5: Event Reporter
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n[5/5] Event Reporter 실행 중...');

  // 콘솔 리포트 (시나리오 기반)
  printEventReport(validationResult);

  // 콘솔 리포트 (이벤트 기반)
  printEventBasedReport(validationResult);

  // 콘솔 리포트 (custom_event 관측)
  printCustomEventSection(customEventReport);

  // JSON 리포트
  const jsonPath = saveEventJsonReport(validationResult, config.outputDir, customEventReport);
  console.log(`  JSON 리포트: ${jsonPath}`);

  // Excel 리포트
  if (config.excelReport) {
    const excelPath = await generateEventExcelReport(validationResult, config.outputDir, customEventReport);
    console.log(`  Excel 리포트: ${excelPath}`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n전체 소요 시간: ${elapsed}초`);

  return validationResult;
}
