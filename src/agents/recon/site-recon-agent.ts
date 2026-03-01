/**
 * Site Recon Agent - 동적 페이지 탐사 및 셀렉터 발견
 *
 * 7 Phase로 실제 페이지를 방문하여:
 * Phase 1: Content Group (AP_DATA_PAGETYPE) 검증
 * Phase 2: Auto-Fire 이벤트 매칭
 * Phase 3: 스크린샷 캡처 (NEW)
 * Phase 4: Gemini 시각 분석 (NEW)
 * Phase 5: 가설 생성 + 테스터 확인 (NEW)
 * Phase 6: 액션 셀렉터 동적 발견 + Trial Click (기존 Phase 3)
 * Phase 7: Recon Report 생성 (기존 Phase 4)
 *
 * 각 Phase 종료 시 사용자 확인 Checkpoint를 출력합니다.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Browser, BrowserContext } from 'playwright';
import {
  launchStealthBrowser,
  createStealthContext,
  type CollectorConfig,
} from '../collector/browser-collector';
import { setupGA4Interceptor, getContentGroup, waitForExpectedEvents } from '../collector/ga4-interceptor';
import type { ScenarioDefinition } from '../../types/event-scenario';
import type { ContentGroupRule } from '../../types/content-group';
import type { PageTypeEnum } from '../../types/common';
import { CONTENT_GROUP_TO_PAGE_TYPE } from '../../knowledge/source-authority';
import type {
  ContentGroupCheck,
  ContentGroupStatus,
  AutoFireDiscovery,
  ActionSelectorDiscovery,
  SiteReconReport,
  ReconOptions,
  ReconSummary,
} from '../../types/recon';
import type { ScreenshotResult, VisualPageAnalysis, EventHypothesis } from '../../types/knowledge-state';
import { findSelectorCandidates, hasSearchHint } from './dom-analyzer';
import { getActionSafetyLevel, canTrialClick, getSafetyIcon } from './action-safety';
import { capturePageScreenshots } from './screenshot-capturer';
import { analyzeMultipleScreenshots, type VisualAnalyzerConfig } from './visual-analyzer';
import { generateHypotheses, printHypotheses } from './hypothesis-generator';
import { presentHypothesesForConfirmation } from './tester-interaction';
import { executePreInterview } from './tester-pre-interview';
import { loadKnowledgeStore, saveKnowledgeStore, saveTesterInsight, loadTesterInsight } from '../../knowledge/knowledge-store';
import type { KnowledgeStore, TesterInsight, PreInterviewResult } from '../../types/knowledge-state';

// CONTENT_GROUP_TO_PAGE_TYPE는 source-authority.ts에서 import합니다 (단일 진실 소스)

// setupGA4Interceptor, getContentGroup는 ga4-interceptor.ts에서 import

// ─────────────────────────────────────────────────────────────────────
// Phase 1: Content Group 검증
// ─────────────────────────────────────────────────────────────────────

interface PageTypeURL {
  page_type: PageTypeEnum;
  url: string;
  expected_cg: string;
}

/**
 * 시나리오에서 page_type별 대표 URL 추출
 */
function extractRepresentativeURLs(
  scenarios: ScenarioDefinition[],
  contentGroupRules: ContentGroupRule[],
): PageTypeURL[] {
  const pageTypeURLs = new Map<PageTypeEnum, PageTypeURL>();

  // ContentGroupRule에서 기대값 매핑
  const cgMap = new Map<PageTypeEnum, string>();
  for (const rule of contentGroupRules) {
    cgMap.set(rule.page_type, rule.content_group_value);
  }

  for (const scenario of scenarios) {
    const url = scenario.test_urls?.[0] || scenario.page_url_pattern;
    if (!url || pageTypeURLs.has(scenario.page_type)) continue;

    pageTypeURLs.set(scenario.page_type, {
      page_type: scenario.page_type,
      url,
      expected_cg: cgMap.get(scenario.page_type) || scenario.page_type,
    });
  }

  return Array.from(pageTypeURLs.values());
}

async function verifyContentGroups(
  context: BrowserContext,
  urls: PageTypeURL[],
  config: CollectorConfig,
  waitMs: number,
): Promise<ContentGroupCheck[]> {
  const results: ContentGroupCheck[] = [];

  console.log('\n  ── Phase 1: Content Group 검증 ──');

  for (let i = 0; i < urls.length; i++) {
    const { url, page_type, expected_cg } = urls[i];
    console.log(`  [${i + 1}/${urls.length}] ${page_type} → ${url}`);

    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.timeout_ms });
      await page.waitForLoadState('load').catch(() => {});
      await page.waitForTimeout(waitMs);

      const actualCG = await getContentGroup(page);
      const matchedPageType = actualCG ? CONTENT_GROUP_TO_PAGE_TYPE[actualCG] : undefined;

      let status: ContentGroupStatus;
      if (!actualCG) {
        status = 'missing';
      } else if (matchedPageType === page_type) {
        status = 'match';
      } else {
        status = 'mismatch';
      }

      const statusIcon = status === 'match' ? '✅' : status === 'mismatch' ? '❌' : '⚠️';
      console.log(`    기대: ${expected_cg} → 실제: ${actualCG ?? 'undefined'} ${statusIcon}`);

      results.push({
        url,
        expected_page_type: page_type,
        actual_content_group: actualCG,
        matched_page_type: matchedPageType,
        status,
      });
    } catch (e) {
      console.log(`    ❌ 페이지 로드 실패: ${e instanceof Error ? e.message : String(e)}`);
      results.push({
        url,
        expected_page_type: page_type,
        actual_content_group: undefined,
        matched_page_type: undefined,
        status: 'missing',
      });
    } finally {
      await page.close();
    }
  }

  return results;
}

function printCheckpoint1(checks: ContentGroupCheck[]): void {
  console.log('\n  ┌──────────────────────────────────────────────────────────┐');
  console.log('  │  Checkpoint 1: Content Group 검증 결과                    │');
  console.log('  └──────────────────────────────────────────────────────────┘');

  const matched = checks.filter(c => c.status === 'match').length;
  const mismatched = checks.filter(c => c.status === 'mismatch').length;
  const missing = checks.filter(c => c.status === 'missing').length;

  for (const check of checks) {
    const icon = check.status === 'match' ? '✅' : check.status === 'mismatch' ? '❌' : '⚠️';
    console.log(`  ${icon} [${check.expected_page_type}] ${check.url}`);
    console.log(`     기대 CG: ${check.expected_page_type}`);
    console.log(`     실제 CG: ${check.actual_content_group ?? 'undefined'}`);
    if (check.status === 'mismatch' && check.matched_page_type) {
      console.log(`     매칭된 PT: ${check.matched_page_type} (불일치)`);
    }
  }

  console.log(`\n  요약: ✅ ${matched} 일치 | ❌ ${mismatched} 불일치 | ⚠️ ${missing} 미설정`);

  if (mismatched > 0 || missing > 0) {
    console.log('\n  💡 불일치/미설정 페이지:');
    console.log('     - 개발팀에 AP_DATA_PAGETYPE 수정 요청 필요');
    console.log('     - 또는 --auto-confirm으로 현재 상태로 계속 진행');
  }
}

// ─────────────────────────────────────────────────────────────────────
// Phase 2: Auto-Fire 이벤트 발견
// ─────────────────────────────────────────────────────────────────────

async function discoverAutoFireEvents(
  context: BrowserContext,
  urls: PageTypeURL[],
  contentGroupRules: ContentGroupRule[],
  config: CollectorConfig,
  waitMs: number,
): Promise<AutoFireDiscovery[]> {
  const results: AutoFireDiscovery[] = [];

  // ContentGroupRule에서 auto_fire 기대값 추출
  const autoFireMap = new Map<PageTypeEnum, string[]>();
  for (const rule of contentGroupRules) {
    autoFireMap.set(rule.page_type, rule.auto_fire_events);
  }

  console.log('\n  ── Phase 2: Auto-Fire 이벤트 발견 ──');

  for (let i = 0; i < urls.length; i++) {
    const { url, page_type } = urls[i];
    const expectedEvents = autoFireMap.get(page_type) || [];

    console.log(`  [${i + 1}/${urls.length}] ${page_type} → ${url}`);
    console.log(`    기대: [${expectedEvents.join(', ')}]`);

    const page = await context.newPage();
    try {
      const captured = setupGA4Interceptor(page);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.timeout_ms });

      // window.onload 대기 (GTM WINDOW_LOADED 트리거에 필요)
      await page.waitForLoadState('load').catch(() => {});

      // 스마트 대기: 예상 이벤트가 모두 캡처되면 즉시 다음으로 이동
      const waitResult = await waitForExpectedEvents(page, captured, expectedEvents, {
        maxWaitMs: Math.max(waitMs, 10000),
        minWaitMs: 3000,
        pollIntervalMs: 500,
      });

      if (waitResult.allFound) {
        console.log(`    ✅ 모든 예상 이벤트 캡처 완료 (${(waitResult.waitedMs / 1000).toFixed(1)}s)`);
      } else {
        console.log(`    ⏳ 대기 종료 (${(waitResult.waitedMs / 1000).toFixed(1)}s) | 미캡처: [${waitResult.missingEvents.join(', ')}]`);
      }

      const actualEvents = [...new Set(captured.map(e => e.event_name))];

      const matched = expectedEvents.filter(e => actualEvents.includes(e));
      const missing = expectedEvents.filter(e => !actualEvents.includes(e));
      const extra = actualEvents.filter(e => !expectedEvents.includes(e));

      console.log(`    실제: [${actualEvents.join(', ')}]`);
      if (matched.length > 0) console.log(`    ✅ 일치: [${matched.join(', ')}]`);
      if (missing.length > 0) console.log(`    ❌ 누락: [${missing.join(', ')}]`);
      if (extra.length > 0) console.log(`    ℹ️  추가: [${extra.join(', ')}]`);

      results.push({
        url,
        page_type,
        expected_events: expectedEvents,
        actual_events: actualEvents,
        matched,
        missing,
        extra,
      });
    } catch (e) {
      console.log(`    ❌ 수집 실패: ${e instanceof Error ? e.message : String(e)}`);
      results.push({
        url,
        page_type,
        expected_events: expectedEvents,
        actual_events: [],
        matched: [],
        missing: expectedEvents,
        extra: [],
      });
    } finally {
      await page.close();
    }
  }

  return results;
}

function printCheckpoint2(discoveries: AutoFireDiscovery[]): void {
  console.log('\n  ┌──────────────────────────────────────────────────────────┐');
  console.log('  │  Checkpoint 2: Auto-Fire 이벤트 매칭 결과                 │');
  console.log('  └──────────────────────────────────────────────────────────┘');

  let totalExpected = 0;
  let totalMatched = 0;

  for (const d of discoveries) {
    totalExpected += d.expected_events.length;
    totalMatched += d.matched.length;

    const allMatch = d.missing.length === 0;
    const icon = allMatch ? '✅' : '❌';
    console.log(`  ${icon} [${d.page_type}] ${d.url}`);
    console.log(`     예상: [${d.expected_events.join(', ')}]`);
    console.log(`     실제: [${d.actual_events.join(', ')}]`);
    if (d.missing.length > 0) {
      console.log(`     ❌ 누락: [${d.missing.join(', ')}]`);
    }
    if (d.extra.length > 0) {
      console.log(`     ℹ️  추가: [${d.extra.join(', ')}]`);
    }
  }

  const rate = totalExpected > 0 ? ((totalMatched / totalExpected) * 100).toFixed(1) : '0';
  console.log(`\n  요약: ${totalMatched}/${totalExpected} 이벤트 일치 (${rate}%)`);
}

// ─────────────────────────────────────────────────────────────────────
// Phase 3: 액션 셀렉터 발견
// ─────────────────────────────────────────────────────────────────────

interface ActionTarget {
  event_name: string;
  page_type: PageTypeEnum;
  url: string;
}

/**
 * 시나리오에서 액션 이벤트 + target URL 추출
 */
function extractActionTargets(
  scenarios: ScenarioDefinition[],
): ActionTarget[] {
  const targets: ActionTarget[] = [];
  const seen = new Set<string>();

  for (const scenario of scenarios) {
    if (!scenario.user_action || scenario.user_action.action_type === 'page_load') continue;

    const url = scenario.test_urls?.[0] || scenario.page_url_pattern;
    if (!url) continue;

    for (const expectedEvent of scenario.expected_events) {
      const key = `${expectedEvent.event_name}:${scenario.page_type}:${url}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // DOM 검색 힌트가 있는 이벤트만 탐색
      if (hasSearchHint(expectedEvent.event_name)) {
        targets.push({
          event_name: expectedEvent.event_name,
          page_type: scenario.page_type,
          url,
        });
      }
    }
  }

  return targets;
}

async function discoverActionSelectors(
  context: BrowserContext,
  targets: ActionTarget[],
  config: CollectorConfig,
  waitMs: number,
  autoConfirm: boolean,
  preInterviewInsights?: Record<string, TesterInsight>,
): Promise<ActionSelectorDiscovery[]> {
  const results: ActionSelectorDiscovery[] = [];

  console.log('\n  ── Phase 3: 액션 셀렉터 발견 ──');

  // URL별 그룹화하여 페이지 방문 최소화
  const urlGroups = new Map<string, ActionTarget[]>();
  for (const target of targets) {
    if (!urlGroups.has(target.url)) {
      urlGroups.set(target.url, []);
    }
    urlGroups.get(target.url)!.push(target);
  }

  let groupIdx = 0;
  const totalGroups = urlGroups.size;

  for (const [url, groupTargets] of urlGroups) {
    groupIdx++;
    console.log(`\n  [${groupIdx}/${totalGroups}] ${url}`);

    const page = await context.newPage();
    try {
      const captured = setupGA4Interceptor(page);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.timeout_ms });
      await page.waitForTimeout(waitMs);

      for (const target of groupTargets) {
        const safetyLevel = getActionSafetyLevel(target.event_name);
        const safetyIcon = getSafetyIcon(safetyLevel);

        console.log(`\n    ${safetyIcon} [${target.event_name}] (${safetyLevel})`);

        // DOM에서 셀렉터 후보 탐색 (TesterInsight 적용)
        const insightKey = `${target.event_name}:${target.page_type}`;
        const insight = preInterviewInsights?.[insightKey];
        if (insight) {
          console.log(`      테스터 인사이트 적용: ${insightKey}`);
        }
        const candidates = await findSelectorCandidates(page, target.event_name, target.page_type, insight);

        if (candidates.length === 0) {
          console.log('      ❌ 후보를 찾지 못했습니다');
          results.push({
            event_name: target.event_name,
            page_type: target.page_type,
            url: target.url,
            candidates: [],
            selected: null,
            safety_level: safetyLevel,
          });
          continue;
        }

        // 후보 출력
        for (let i = 0; i < Math.min(candidates.length, 5); i++) {
          const c = candidates[i];
          const recommend = i === 0 ? ' ← 추천' : '';
          console.log(
            `      ${i + 1}. ${c.selector} (텍스트: "${c.text_content.substring(0, 40)}", ` +
            `${c.match_count}개 매칭, 신뢰도: ${(c.confidence * 100).toFixed(0)}%)${recommend}`,
          );
        }

        const selected = candidates[0]; // 최고 신뢰도 후보 추천

        // Trial click (safe 이벤트만)
        let trialResult: ActionSelectorDiscovery['trial_click_result'] | undefined;

        if (canTrialClick(target.event_name) && selected) {
          try {
            // 팝업 오버레이 제거 (pop-convert-app 등)
            await page.evaluate(() => {
              const el = document.getElementById('pop-convert-app');
              if (el) { el.style.display = 'none'; el.style.pointerEvents = 'none'; }
            });

            const beforeCount = captured.length;
            const element = page.locator(selected.selector).first();
            const isVisible = await element.isVisible({ timeout: 3000 }).catch(() => false);

            if (isVisible) {
              console.log(`      🔬 Trial click 실행 중...`);
              await element.scrollIntoViewIfNeeded();
              await element.click({ timeout: 5000 });
              await page.waitForTimeout(3000);

              const newEvents = captured.slice(beforeCount).map(e => e.event_name);
              const triggered = newEvents.includes(target.event_name);

              trialResult = {
                triggered_event: triggered,
                events_captured: [...new Set(newEvents)],
              };

              if (triggered) {
                console.log(`      ✅ Trial click 성공: ${target.event_name} 이벤트 발생!`);
              } else {
                console.log(`      ℹ️  Trial click: ${target.event_name} 미발생 (캡처: [${newEvents.join(', ')}])`);
              }

              // safe 이벤트는 뒤로가기로 복구
              await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
              await page.waitForTimeout(1000);
            } else {
              console.log(`      ⚠️  셀렉터가 보이지 않음 (trial click 스킵)`);
            }
          } catch (e) {
            console.log(`      ⚠️  Trial click 실패: ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        const discovery: ActionSelectorDiscovery = {
          event_name: target.event_name,
          page_type: target.page_type,
          url: target.url,
          candidates,
          selected,
          safety_level: safetyLevel,
          trial_click_result: trialResult,
        };

        // 자동 승인 모드에서는 추천 셀렉터를 자동으로 확정
        if (autoConfirm && selected) {
          discovery.user_confirmed = selected.selector;
        }

        results.push(discovery);
      }
    } catch (e) {
      console.log(`    ❌ 페이지 처리 실패: ${e instanceof Error ? e.message : String(e)}`);
      for (const target of groupTargets) {
        results.push({
          event_name: target.event_name,
          page_type: target.page_type,
          url: target.url,
          candidates: [],
          selected: null,
          safety_level: getActionSafetyLevel(target.event_name),
        });
      }
    } finally {
      await page.close();
    }
  }

  return results;
}

function printCheckpoint3(discoveries: ActionSelectorDiscovery[]): void {
  console.log('\n  ┌──────────────────────────────────────────────────────────┐');
  console.log('  │  Checkpoint 3: 발견된 셀렉터 검증 결과                    │');
  console.log('  └──────────────────────────────────────────────────────────┘');

  const found = discoveries.filter(d => d.selected !== null).length;
  const trialSuccess = discoveries.filter(d => d.trial_click_result?.triggered_event).length;
  const notFound = discoveries.filter(d => d.selected === null).length;

  for (const d of discoveries) {
    const icon = d.selected ? '✅' : '❌';
    const safeIcon = getSafetyIcon(d.safety_level);
    console.log(`  ${icon} [${d.event_name}] ${d.page_type} ${safeIcon}`);

    if (d.selected) {
      console.log(`     추천: ${d.selected.selector}`);
      console.log(`     텍스트: "${d.selected.text_content.substring(0, 50)}"`);
      console.log(`     신뢰도: ${(d.selected.confidence * 100).toFixed(0)}%`);
      if (d.user_confirmed) {
        console.log(`     ✅ 확정: ${d.user_confirmed}`);
      }
      if (d.trial_click_result) {
        const trialIcon = d.trial_click_result.triggered_event ? '✅' : '❌';
        console.log(`     Trial: ${trialIcon} [${d.trial_click_result.events_captured.join(', ')}]`);
      }
    } else {
      console.log(`     후보 없음 - 수동 셀렉터 입력 필요`);
    }
  }

  console.log(`\n  요약: ✅ ${found} 발견 | 🔬 ${trialSuccess} trial 성공 | ❌ ${notFound} 미발견`);
}

// ─────────────────────────────────────────────────────────────────────
// Phase 4: Recon Report 생성
// ─────────────────────────────────────────────────────────────────────

function generateReconReport(
  contentGroupChecks: ContentGroupCheck[],
  autoFireDiscoveries: AutoFireDiscovery[],
  selectorDiscoveries: ActionSelectorDiscovery[],
  screenshots?: ScreenshotResult[],
  visualAnalyses?: VisualPageAnalysis[],
  hypotheses?: EventHypothesis[],
  preInterviewInsights?: Record<string, TesterInsight>,
): SiteReconReport {
  const cgMatched = contentGroupChecks.filter(c => c.status === 'match').length;
  const cgTotal = contentGroupChecks.length;

  let afExpected = 0;
  let afMatched = 0;
  for (const d of autoFireDiscoveries) {
    afExpected += d.expected_events.length;
    afMatched += d.matched.length;
  }

  const selectorsFound = selectorDiscoveries.filter(d => d.selected !== null && d.user_confirmed === undefined).length;
  const selectorsManual = selectorDiscoveries.filter(d => d.user_confirmed !== undefined && d.selected?.discovery_method === 'manual').length;
  const selectorsMissing = selectorDiscoveries.filter(d => d.selected === null && !d.user_confirmed).length;
  const selectorsAutoConfirmed = selectorDiscoveries.filter(d => d.user_confirmed !== undefined).length;

  const summary: ReconSummary = {
    pages_visited: cgTotal,
    cg_match_rate: cgTotal > 0 ? cgMatched / cgTotal : 0,
    auto_fire_match_rate: afExpected > 0 ? afMatched / afExpected : 0,
    selectors_found: selectorsFound + selectorsAutoConfirmed,
    selectors_manual: selectorsManual,
    selectors_missing: selectorsMissing,
  };

  return {
    project_id: 'site-recon',
    recon_timestamp: new Date().toISOString(),
    content_group_checks: contentGroupChecks,
    auto_fire_discoveries: autoFireDiscoveries,
    selector_discoveries: selectorDiscoveries,
    summary,
    screenshots,
    visual_analyses: visualAnalyses,
    hypotheses,
    pre_interview_insights: preInterviewInsights,
  };
}

function printCheckpoint4(report: SiteReconReport): void {
  console.log('\n  ┌──────────────────────────────────────────────────────────┐');
  console.log('  │  Checkpoint 4: 최종 Recon Report                         │');
  console.log('  └──────────────────────────────────────────────────────────┘');

  const s = report.summary;
  console.log(`  📊 전체 탐사 결과:`);
  console.log(`     방문 페이지:        ${s.pages_visited}`);
  console.log(`     CG 일치율:          ${(s.cg_match_rate * 100).toFixed(1)}%`);
  console.log(`     Auto-fire 일치율:   ${(s.auto_fire_match_rate * 100).toFixed(1)}%`);
  console.log(`     셀렉터 발견:        ${s.selectors_found}개 (자동)`);
  console.log(`     셀렉터 수동:        ${s.selectors_manual}개`);
  console.log(`     셀렉터 미발견:      ${s.selectors_missing}개`);

  const readyRate = s.selectors_found + s.selectors_manual;
  const totalSelectors = readyRate + s.selectors_missing;
  if (totalSelectors > 0) {
    console.log(`\n     파이프라인 준비율:   ${readyRate}/${totalSelectors} (${((readyRate / totalSelectors) * 100).toFixed(0)}%)`);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Recon → Pipeline Enrichment
// ─────────────────────────────────────────────────────────────────────

/**
 * Recon 결과로 시나리오의 target_selector를 업데이트합니다.
 *
 * 순수 함수: 원본 배열을 수정하지 않고 새 배열을 반환합니다.
 * (YELLOW 3 수정: in-place mutation → immutable)
 */
export function enrichScenariosWithRecon(
  scenarios: readonly ScenarioDefinition[],
  report: SiteReconReport,
): ScenarioDefinition[] {
  // 셀렉터 발견 결과를 event_name + page_type 키로 인덱싱
  const selectorMap = new Map<string, string>();
  for (const discovery of report.selector_discoveries) {
    const confirmedSelector = discovery.user_confirmed || discovery.selected?.selector;
    if (confirmedSelector) {
      const key = `${discovery.event_name}:${discovery.page_type}`;
      selectorMap.set(key, confirmedSelector);
    }
  }

  // TesterInsight에서 prerequisite_actions 인덱싱
  const insightMap = report.pre_interview_insights ?? {};

  let enrichedNew = 0;
  let enrichedOverride = 0;

  const enriched = scenarios.map(scenario => {
    if (!scenario.user_action) return { ...scenario };

    for (const expected of scenario.expected_events) {
      const key = `${expected.event_name}:${scenario.page_type}`;
      const reconSelector = selectorMap.get(key);

      if (reconSelector) {
        const existing = scenario.user_action.target_selector;
        if (existing) {
          console.log(`  🔄 [${expected.event_name}] 기존 셀렉터 → Recon 셀렉터로 교체`);
          console.log(`     기존: ${existing}`);
          console.log(`     Recon: ${reconSelector}`);
          enrichedOverride++;
        } else {
          enrichedNew++;
        }

        // TesterInsight에서 prerequisite_actions 가져오기
        const insight = insightMap[key];
        const prerequisiteActions = insight?.is_multi_step
          ? insight.prerequisite_actions.map(pa => ({
              action_type: pa.action_type,
              selector: pa.selector,
              wait_ms: pa.wait_ms,
              url: pa.url,
              description: pa.description,
            }))
          : undefined;

        if (prerequisiteActions && prerequisiteActions.length > 0) {
          console.log(`     📋 전제조건: ${prerequisiteActions.length}단계 (멀티스텝)`);
        }

        return {
          ...scenario,
          user_action: {
            ...scenario.user_action,
            target_selector: reconSelector,
            prerequisite_actions: prerequisiteActions,
          },
        };
      }
    }

    return { ...scenario };
  });

  const total = enrichedNew + enrichedOverride;
  if (total > 0) {
    console.log(`  ✅ Recon 결과로 ${total}개 시나리오의 target_selector 업데이트 완료`);
    if (enrichedNew > 0) console.log(`     신규: ${enrichedNew}개`);
    if (enrichedOverride > 0) console.log(`     교체: ${enrichedOverride}개 (Recon 동적 발견 우선)`);
  }

  return enriched;
}

// ─────────────────────────────────────────────────────────────────────
// 메인 Recon 실행 함수
// ─────────────────────────────────────────────────────────────────────

/**
 * Site Recon Agent 실행.
 *
 * 4 Phase를 순차 실행하며, 각 Phase 종료 시 사용자 확인 Checkpoint를 출력합니다.
 *
 * @param scenarios - Parser가 생성한 시나리오 목록
 * @param contentGroupRules - Content Group 규칙
 * @param config - Collector 설정
 * @param options - Recon 옵션
 * @returns SiteReconReport
 */
export async function runSiteRecon(
  scenarios: ScenarioDefinition[],
  contentGroupRules: ContentGroupRule[],
  config: CollectorConfig,
  options: ReconOptions,
): Promise<SiteReconReport> {
  const waitMs = options.waitMs ?? 5000;
  const autoConfirm = options.autoConfirm ?? false;

  // 캐시가 있으면 재사용
  if (options.cachePath && fs.existsSync(options.cachePath)) {
    console.log(`  ℹ️  Recon 캐시 로드: ${options.cachePath}`);
    try {
      const cached = JSON.parse(fs.readFileSync(options.cachePath, 'utf-8')) as SiteReconReport;
      console.log(`  캐시 생성 시점: ${cached.recon_timestamp}`);
      printCheckpoint4(cached);
      return cached;
    } catch (e) {
      console.log(`  ⚠️  캐시 로드 실패: ${e instanceof Error ? e.message : String(e)}`);
      console.log('  새로운 Recon 실행...');
    }
  }

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║     Site Recon Agent - 동적 페이지 탐사                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  let browser: Browser | null = null;

  try {
    browser = await launchStealthBrowser({ headless: config.headless });
    const context = await createStealthContext(browser, config);

    // ── 대표 URL 추출 ──
    const representativeURLs = extractRepresentativeURLs(scenarios, contentGroupRules);
    console.log(`\n  탐사 대상: ${representativeURLs.length}개 페이지 타입`);
    for (const u of representativeURLs) {
      console.log(`    ${u.page_type} → ${u.url}`);
    }

    // ━━━━ Phase 1: Content Group 검증 ━━━━
    const cgChecks = await verifyContentGroups(context, representativeURLs, config, waitMs);
    printCheckpoint1(cgChecks);

    // ━━━━ Phase 2: Auto-Fire 이벤트 발견 ━━━━
    const afDiscoveries = await discoverAutoFireEvents(
      context, representativeURLs, contentGroupRules, config, waitMs,
    );
    printCheckpoint2(afDiscoveries);

    // ━━━━ Phase 2.5: 테스터 사전 인터뷰 (NEW) ━━━━
    let preInterviewResult: PreInterviewResult | undefined;
    const knowledgeStorePath = options.knowledgeStorePath;
    let knowledgeStore: KnowledgeStore | null = null;
    if (knowledgeStorePath) {
      knowledgeStore = loadKnowledgeStore(knowledgeStorePath);
    }

    if (options.enablePreInterview && !autoConfirm) {
      // 액션 이벤트와 페이지타입 매핑 추출
      const actionTargetsForInterview = extractActionTargets(scenarios);
      const eventNames = [...new Set(actionTargetsForInterview.map(t => t.event_name))];
      const eventPageTypes: Record<string, PageTypeEnum[]> = {};
      for (const target of actionTargetsForInterview) {
        if (!eventPageTypes[target.event_name]) {
          eventPageTypes[target.event_name] = [];
        }
        if (!eventPageTypes[target.event_name].includes(target.page_type)) {
          eventPageTypes[target.event_name].push(target.page_type);
        }
      }

      try {
        preInterviewResult = await executePreInterview(
          eventNames,
          eventPageTypes,
          knowledgeStore,
        );

        // Knowledge Store에 인사이트 저장
        if (knowledgeStorePath && knowledgeStore) {
          for (const [key, insight] of Object.entries(preInterviewResult.insights)) {
            const [eventName, pageType] = key.split(':');
            saveTesterInsight(knowledgeStore, eventName, pageType, insight);
          }
          saveKnowledgeStore(knowledgeStore, knowledgeStorePath);
        }
      } catch (e) {
        console.warn(`  ⚠️ 사전 인터뷰 실패 (계속 진행): ${e instanceof Error ? e.message : String(e)}`);
      }
    } else if (options.enablePreInterview && autoConfirm) {
      console.log('\n  ℹ️  --auto-confirm 모드: 사전 인터뷰 스킵');
    }

    // ━━━━ Phase 2.5b: Knowledge Store에서 기존 TesterInsight 자동 로드 ━━━━
    // --enable-pre-interview 없이도, Knowledge Store에 저장된 인사이트가 있으면 활용
    if (!preInterviewResult && knowledgeStore) {
      const actionTargetsForKS = extractActionTargets(scenarios);
      const loadedInsights: Record<string, TesterInsight> = {};
      let loadedCount = 0;

      for (const target of actionTargetsForKS) {
        const key = `${target.event_name}:${target.page_type}`;
        if (loadedInsights[key]) continue;

        const stored = loadTesterInsight(knowledgeStore, target.event_name, target.page_type);
        if (stored) {
          loadedInsights[key] = stored;
          loadedCount++;
        }
      }

      if (loadedCount > 0) {
        console.log(`\n  ── Knowledge Store: ${loadedCount}개 TesterInsight 로드 ──`);
        preInterviewResult = {
          interviewed_events: [],
          skipped_events: [...new Set(Object.values(loadedInsights).map(i => i.event_name))],
          insights: loadedInsights,
          interviewed_at: new Date().toISOString(),
        };
      }
    }

    // ━━━━ Phase 3: 스크린샷 캡처 (NEW) ━━━━
    let screenshots: ScreenshotResult[] | undefined;
    let visualAnalyses: VisualPageAnalysis[] | undefined;
    let hypotheses: EventHypothesis[] | undefined;

    const outputDir = options.outputDir ?? '.';

    if (options.enableVisualAnalysis && options.geminiApiKey) {
      console.log('\n  ── Phase 3: 스크린샷 캡처 ──');
      try {
        screenshots = await capturePageScreenshots(
          context,
          representativeURLs,
          config,
          outputDir,
        );
        console.log(`  ✅ ${screenshots.length}개 스크린샷 캡처 완료`);
      } catch (e) {
        console.warn(`  ⚠️ 스크린샷 캡처 실패 (계속 진행): ${e instanceof Error ? e.message : String(e)}`);
      }

      // ━━━━ Phase 4: Gemini 시각 분석 (NEW) ━━━━
      if (screenshots && screenshots.length > 0) {
        const screenshotsForAnalysis = screenshots
          .filter(s => s.success && s.screenshot_path)
          .map(s => ({
            screenshotPath: s.screenshot_path!,
            pageType: s.page_type,
            url: s.url,
          }));

        if (screenshotsForAnalysis.length > 0) {
          // page_type별 known events 매핑 구축
          const knownEventsMap = new Map<PageTypeEnum, string[]>();
          for (const rule of contentGroupRules) {
            const events = [
              ...rule.auto_fire_events,
              ...rule.action_events.map(ae => ae.event_name),
            ];
            knownEventsMap.set(rule.page_type, events);
          }

          const analyzerConfig: VisualAnalyzerConfig = {
            apiKey: options.geminiApiKey,
          };

          try {
            visualAnalyses = await analyzeMultipleScreenshots(
              screenshotsForAnalysis,
              knownEventsMap,
              analyzerConfig,
            );
          } catch (e) {
            console.warn(`  ⚠️ Gemini 분석 실패 (계속 진행): ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }

      // ━━━━ Phase 5: 가설 생성 (NEW) ━━━━
      if (visualAnalyses && visualAnalyses.length > 0) {
        // 이벤트 상태 구축 (간략 버전 - assessor 결과 없이도 동작)
        const { assessKnowledgeReadiness } = await import('../../knowledge/knowledge-assessor');
        const eventStates = assessKnowledgeReadiness(
          scenarios,
          contentGroupRules,
          knowledgeStore,
        ).event_states;

        hypotheses = generateHypotheses(
          eventStates,
          visualAnalyses,
          knowledgeStore,
        );
        printHypotheses(hypotheses);
      }
    } else {
      if (options.enableVisualAnalysis && !options.geminiApiKey) {
        console.log('\n  ⚠️ Visual Analysis 활성화되었지만 Gemini API Key 없음 → 스킵');
      }
    }

    // ━━━━ Phase 5.5: 가설 확인 (FIX - presentHypothesesForConfirmation 연결) ━━━━
    if (hypotheses && hypotheses.length > 0 && !autoConfirm) {
      try {
        await presentHypothesesForConfirmation(hypotheses, {
          autoConfirm,
          knowledgeStore,
        });
      } catch (e) {
        console.warn(`  ⚠️ 가설 확인 실패 (계속 진행): ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // ━━━━ Phase 6: 액션 셀렉터 발견 (기존 Phase 3, TesterInsight 적용) ━━━━
    const actionTargets = extractActionTargets(scenarios);
    console.log(`\n  액션 이벤트 탐색 대상: ${actionTargets.length}개`);
    for (const t of actionTargets) {
      console.log(`    ${t.event_name} @ ${t.page_type} → ${t.url}`);
    }

    const selectorDiscoveries = await discoverActionSelectors(
      context, actionTargets, config, waitMs, autoConfirm,
      preInterviewResult?.insights,
    );
    printCheckpoint3(selectorDiscoveries);

    // ━━━━ Phase 7: Report 생성 (기존 Phase 4) ━━━━
    const report = generateReconReport(
      cgChecks, afDiscoveries, selectorDiscoveries,
      screenshots, visualAnalyses, hypotheses,
      preInterviewResult?.insights,
    );
    printCheckpoint4(report);

    await context.close();

    // 캐시 저장
    if (options.cachePath) {
      const cacheDir = path.dirname(options.cachePath);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      fs.writeFileSync(options.cachePath, JSON.stringify(report, null, 2), 'utf-8');
      console.log(`\n  💾 Recon 결과 캐시 저장: ${options.cachePath}`);
    }

    return report;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
