/**
 * Test Orchestrator
 *
 * Multi-agent 테스트를 조율하는 메인 오케스트레이터입니다.
 */

import { chromium, Browser, BrowserContext } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import {
  OrchestratorConfig,
  OrchestratorProgress,
  ProgressCallback,
  RunOptions,
  TaskResult
} from './types';
import { TaskQueue } from './TaskQueue';
import { AgentWorker, AgentWorkerConfig } from './AgentWorker';
import { ProgressTracker } from './ProgressTracker';
import {
  BranchConfig,
  BranchTestResult,
  BranchEventData,
  TestReport,
  ContentGroup
} from '../branch/types';
import { BranchManager } from '../branch/BranchManager';
import { SpecDataLoader } from '../data/SpecDataLoader';
import { GA4DataFetcher } from '../data/GA4DataFetcher';
import {
  applyStealthToContext,
  STEALTH_LAUNCH_OPTIONS,
  STEALTH_CONTEXT_OPTIONS
} from '../utils/playwrightStealth';

/**
 * Test Orchestrator 클래스
 */
export class TestOrchestrator {
  private config: OrchestratorConfig;
  private branchManager: BranchManager;
  private taskQueue: TaskQueue;
  private progressTracker: ProgressTracker;
  private specLoader: SpecDataLoader;
  private ga4Fetcher: GA4DataFetcher | null = null;

  private browser: Browser | null = null;
  private contexts: BrowserContext[] = [];
  private workers: AgentWorker[] = [];

  private isRunning: boolean = false;
  private shouldCancel: boolean = false;

  private branchResults: Map<string, BranchTestResult> = new Map();

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.branchManager = new BranchManager({
      stateDir: config.reportConfig.outputDir,
      gitEnabled: config.reportConfig.gitPush,
      ga4PropertyId: config.ga4PropertyId
    });
    this.taskQueue = new TaskQueue();
    this.progressTracker = new ProgressTracker();
    this.specLoader = new SpecDataLoader();
  }

  /**
   * 초기화
   */
  async initialize(): Promise<void> {
    // 출력 디렉토리 생성
    const outputDir = this.config.reportConfig.outputDir;
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 스크린샷 디렉토리 생성
    const screenshotDir = path.join(outputDir, 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    // 스펙 로드
    await this.specLoader.load();

    // Branch Manager 초기화
    await this.branchManager.initialize();

    // GA4 Fetcher 초기화
    if (this.config.ga4PropertyId) {
      this.ga4Fetcher = new GA4DataFetcher({
        propertyId: this.config.ga4PropertyId,
        useCache: true
      });
      try {
        await this.ga4Fetcher.initialize();
      } catch (error: any) {
        console.warn(`GA4 초기화 실패: ${error.message}`);
        this.ga4Fetcher = null;
      }
    }

    // 브라우저 시작 (Stealth 모드)
    this.browser = await chromium.launch(STEALTH_LAUNCH_OPTIONS);

    // Worker 생성
    await this.createWorkers();
  }

  /**
   * Worker 생성
   */
  private async createWorkers(): Promise<void> {
    const screenshotDir = path.join(this.config.reportConfig.outputDir, 'screenshots');

    for (let i = 0; i < this.config.maxConcurrency; i++) {
      // Stealth 컨텍스트 생성
      const context = await this.browser!.newContext(STEALTH_CONTEXT_OPTIONS);

      // Stealth 스크립트 적용 (navigator.webdriver 숨기기 등)
      await applyStealthToContext(context);

      this.contexts.push(context);

      const workerConfig: AgentWorkerConfig = {
        agentId: `worker-${i}`,
        visionApiKey: this.config.visionConfig.apiKey,
        visionEnabled: this.config.visionConfig.enabled,
        screenshotDir,
        pageLoadTimeout: this.config.timeoutConfig?.pageLoadTimeout || 30000,
        visionApiTimeout: this.config.timeoutConfig?.visionApiTimeout || 60000
      };

      const worker = new AgentWorker(
        workerConfig,
        this.specLoader,
        this.ga4Fetcher || undefined
      );

      if (this.config.visionConfig.enabled) {
        await worker.initVisionAnalyzer();
      }

      this.workers.push(worker);
      this.progressTracker.registerAgent(`worker-${i}`);
    }
  }

  /**
   * 전체 Branch 테스트 실행
   */
  async runAllBranches(options?: RunOptions): Promise<TestReport> {
    return this.runBranches(undefined, options);
  }

  /**
   * 특정 Branch들 테스트 실행
   */
  async runBranches(
    contentGroups?: ContentGroup[],
    options?: RunOptions
  ): Promise<TestReport> {
    if (this.isRunning) {
      throw new Error('Orchestrator is already running');
    }

    this.isRunning = true;
    this.shouldCancel = false;
    this.branchResults.clear();

    try {
      // 테스트할 Branch 결정
      let branches = this.config.branches;
      if (contentGroups) {
        branches = branches.filter(b => contentGroups.includes(b.contentGroup));
      }
      if (options?.branchIds) {
        branches = branches.filter(b => options.branchIds!.includes(b.id));
      }

      // Dry run 모드
      if (options?.dryRun) {
        return this.generateDryRunReport(branches);
      }

      // 태스크 생성
      const tasks = this.taskQueue.createTasksFromBranches(branches);

      // 진행 추적 시작
      this.progressTracker.start(branches.length, tasks.length);

      // 콜백 등록
      if (options?.onProgress) {
        this.progressTracker.onProgress(options.onProgress);
      }

      // 병렬 실행
      await this.executeParallel(branches, options);

      // 진행 추적 완료
      this.progressTracker.complete();

      // 리포트 생성
      return this.generateReport();

    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 병렬 실행
   */
  private async executeParallel(
    branches: BranchConfig[],
    options?: RunOptions
  ): Promise<void> {
    const workerPromises: Promise<void>[] = [];

    for (let i = 0; i < this.workers.length; i++) {
      workerPromises.push(
        this.runWorkerLoop(this.workers[i], this.contexts[i], options)
      );
    }

    await Promise.all(workerPromises);
  }

  /**
   * Worker 루프 실행
   */
  private async runWorkerLoop(
    worker: AgentWorker,
    context: BrowserContext,
    options?: RunOptions
  ): Promise<void> {
    while (!this.shouldCancel && !this.taskQueue.isEmpty()) {
      const task = this.taskQueue.dequeue();
      if (!task) break;

      const agentId = worker.getAgentId();

      // Branch 시작 추적
      this.progressTracker.branchStarted(task.branchId, task.contentGroup);
      this.progressTracker.taskStarted(task.taskId, agentId);

      try {
        const result = await worker.executeTask(task, context);

        if (result.success) {
          this.progressTracker.taskCompleted(task.taskId, agentId, result.durationMs);

          // 결과 저장
          this.addTaskResult(task, result);

        } else {
          this.progressTracker.taskFailed(task.taskId, agentId, result.error?.message || 'Unknown error');

          if (!options?.continueOnError) {
            // Branch 실패로 처리
            this.progressTracker.branchFailed(
              task.branchId,
              task.contentGroup,
              result.error?.message || 'Task failed'
            );
          }
        }

        // Branch 완료 확인
        this.checkBranchCompletion(task.branchId, task.contentGroup);

      } catch (error: any) {
        this.progressTracker.taskFailed(task.taskId, agentId, error.message);

        if (!options?.continueOnError) {
          this.progressTracker.branchFailed(task.branchId, task.contentGroup, error.message);
        }
      }
    }
  }

  /**
   * 태스크 결과 추가
   */
  private addTaskResult(task: any, result: TaskResult): void {
    let branchResult = this.branchResults.get(task.branchId);

    if (!branchResult) {
      branchResult = {
        branchId: task.branchId,
        contentGroup: task.contentGroup,
        status: 'in_progress',
        startTime: new Date(),
        testedUrls: [],
        events: [],
        comparison: {
          branchId: task.branchId,
          contentGroup: task.contentGroup,
          events: [],
          overall: {
            totalEvents: 0,
            avgPredictionAccuracy: 0,
            avgSpecCompliance: 0,
            criticalIssues: 0,
            warnings: 0
          }
        },
        errors: [],
        screenshots: []
      };
    }

    branchResult.testedUrls.push(task.url);

    if (result.data) {
      branchResult.events.push(...result.data);
    }

    if (result.screenshotPath) {
      branchResult.screenshots.push(result.screenshotPath);
    }

    // Vision AI 예측 결과가 있으면 저장 (기획자/마케터 관점 요소 분석 포함)
    if (result.visionPrediction) {
      branchResult.visionPrediction = result.visionPrediction;
    }

    this.branchResults.set(task.branchId, branchResult);
  }

  /**
   * Branch 완료 확인
   */
  private checkBranchCompletion(branchId: string, contentGroup: ContentGroup): void {
    const pendingTasks = this.taskQueue.getTaskCountByBranch()[branchId] || 0;

    if (pendingTasks === 0) {
      const result = this.branchResults.get(branchId);
      if (result) {
        result.status = 'completed';
        result.endTime = new Date();
        result.durationMs = result.endTime.getTime() - result.startTime.getTime();
        this.branchResults.set(branchId, result);

        // 이벤트별 상세 분석 출력
        this.printEventAnalysis(result);

        // 기획자/마케터 관점 요소 이상 분석 출력
        this.printElementAnomalies(result);
      }

      this.progressTracker.branchCompleted(branchId, contentGroup);
    }
  }

  /**
   * 리포트 생성
   */
  private generateReport(): TestReport {
    const progress = this.progressTracker.getProgress();
    const branches = Array.from(this.branchResults.values());

    // 정확도 계산
    let totalAccuracy = 0;
    const branchAccuracies: Partial<Record<ContentGroup, number>> = {};

    for (const branch of branches) {
      const accuracy = this.calculateBranchAccuracy(branch);
      branchAccuracies[branch.contentGroup] = accuracy;
      totalAccuracy += accuracy;
    }

    const overallAccuracy = branches.length > 0 ? totalAccuracy / branches.length : 0;

    return {
      metadata: {
        generatedAt: new Date(),
        ga4PropertyId: this.config.ga4PropertyId,
        dateRange: this.config.dateRange,
        totalDurationMs: progress.elapsedTime * 1000,
        branchCount: branches.length
      },
      branches,
      summary: {
        overallAccuracy,
        branchAccuracies: branchAccuracies as Record<ContentGroup, number>,
        topIssues: [],
        recommendations: [],
        totalEvents: branches.reduce((sum, b) => sum + b.events.length, 0),
        totalParameters: 0,
        matchedParameters: 0,
        byStatus: {
          completed: branches.filter(b => b.status === 'completed').length,
          failed: branches.filter(b => b.status === 'failed').length,
          skipped: branches.filter(b => b.status === 'skipped').length
        }
      }
    };
  }

  /**
   * Branch 정확도 계산
   * Vision AI 예측 vs GA4 실제 데이터 비교
   *
   * 정확도 계산 방식:
   * - AUTO_FIRE: 실제로 발생해야 정확 (100% 또는 0%)
   * - FORBIDDEN: 발생하지 않거나 노이즈(<1000건)여야 정확
   * - CONDITIONAL: 실제 발생률에 따라 평가 (발생하면 정확, 미발생도 정확)
   */
  private calculateBranchAccuracy(branch: BranchTestResult): number {
    if (branch.events.length === 0) return 0;

    let correctPredictions = 0;
    let totalPredictions = 0;

    // 전체 이벤트 수 계산 (비율 계산용)
    let totalEventCount = 0;
    for (const event of branch.events) {
      const occurrenceParam = event.actualParams.find(p => p.name === '_event_occurred');
      totalEventCount += occurrenceParam?.eventCount || 0;
    }

    for (const event of branch.events) {
      // Vision AI 이벤트 발생 예측 확인
      const predictionParam = event.predictedParams.find(p => p.name === '_event_prediction');
      const prediction = predictionParam?.value as string | undefined;

      // GA4 실제 이벤트 발생 여부 확인
      const occurrenceParam = event.actualParams.find(p => p.name === '_event_occurred');
      const eventCount = occurrenceParam?.eventCount || 0;
      const actualOccurred = eventCount > 0;
      const eventRatio = totalEventCount > 0 ? (eventCount / totalEventCount) * 100 : 0;

      if (prediction === 'AUTO_FIRE') {
        totalPredictions++;
        // 자동 발생 예측: 실제로 발생했으면 정확
        if (actualOccurred) {
          correctPredictions++;
        }
      } else if (prediction === 'FORBIDDEN') {
        totalPredictions++;
        // 금지 예측: 발생하지 않았거나 노이즈 수준(<1000건)이면 정확
        if (!actualOccurred || eventCount < 1000) {
          correctPredictions++;
        }
      } else if (prediction === 'CONDITIONAL') {
        totalPredictions++;
        // 조건부 예측: 발생해도 정확, 미발생해도 정확 (조건에 따라 달라지므로)
        correctPredictions++;
      }
    }

    return totalPredictions > 0 ? (correctPredictions / totalPredictions) * 100 : 0;
  }

  /**
   * 이벤트별 상세 분석 출력
   */
  private printEventAnalysis(branch: BranchTestResult): void {
    console.log(`\n📊 [${branch.contentGroup}] 이벤트별 상세 분석:`);
    console.log('─'.repeat(70));
    console.log('이벤트명'.padEnd(25) + '예측'.padEnd(15) + '발생건수'.padEnd(15) + '비율'.padEnd(10) + '결과');
    console.log('─'.repeat(70));

    // 전체 이벤트 수 계산
    let totalEventCount = 0;
    for (const event of branch.events) {
      const occurrenceParam = event.actualParams.find(p => p.name === '_event_occurred');
      totalEventCount += occurrenceParam?.eventCount || 0;
    }

    for (const event of branch.events) {
      const predictionParam = event.predictedParams.find(p => p.name === '_event_prediction');
      const prediction = predictionParam?.value as string || 'NONE';

      const occurrenceParam = event.actualParams.find(p => p.name === '_event_occurred');
      const eventCount = occurrenceParam?.eventCount || 0;
      const ratio = totalEventCount > 0 ? (eventCount / totalEventCount) * 100 : 0;

      let result = '';
      let icon = '';

      if (prediction === 'AUTO_FIRE') {
        if (eventCount > 0) {
          result = '✅ 정확';
          icon = '🔥';
        } else {
          result = '❌ 미발생';
          icon = '⚠️';
        }
      } else if (prediction === 'FORBIDDEN') {
        if (eventCount === 0 || eventCount < 1000) {
          result = '✅ 정확';
          icon = '🚫';
        } else {
          result = `❌ 발생(${eventCount.toLocaleString()})`;
          icon = '⚠️';
        }
      } else if (prediction === 'CONDITIONAL') {
        if (eventCount > 0) {
          result = `✅ 발생`;
          icon = '⚡';
        } else {
          result = '➖ 미발생';
          icon = '💤';
        }
      }

      const eventName = event.eventName.padEnd(23);
      const predStr = `${icon} ${prediction}`.padEnd(13);
      const countStr = eventCount > 0 ? eventCount.toLocaleString().padStart(12) : '-'.padStart(12);
      const ratioStr = ratio > 0 ? `${ratio.toFixed(2)}%`.padStart(8) : '-'.padStart(8);

      console.log(`${eventName} ${predStr} ${countStr} ${ratioStr}  ${result}`);
    }
    console.log('─'.repeat(70));
  }

  /**
   * 기획자/마케터 관점 요소 이상 분석 출력
   */
  private printElementAnomalies(branch: BranchTestResult): void {
    // elementAnomalies가 visionPrediction에 포함되어 있는지 확인
    if (!branch.visionPrediction?.elementAnomalies) {
      return;
    }

    const anomalies = branch.visionPrediction.elementAnomalies;

    // 누락된 요소가 있을 때만 출력
    if (!anomalies.missingElements || anomalies.missingElements.length === 0) {
      console.log(`\n✅ [${branch.contentGroup}] 모든 기대 요소가 정상적으로 발견됨`);
      if (anomalies.presentElements && anomalies.presentElements.length > 0) {
        console.log(`   발견된 요소: ${anomalies.presentElements.join(', ')}`);
      }
      return;
    }

    console.log(`\n⚠️ [${branch.contentGroup}] 기획자/마케터 관점 이상 분석:`);
    console.log('═'.repeat(70));

    // 심각도별 아이콘
    const severityIcons: Record<string, string> = {
      'CRITICAL': '🔴',
      'HIGH': '🟠',
      'MEDIUM': '🟡'
    };

    // 누락된 요소 출력
    console.log(`\n📋 누락된 기대 요소 (${anomalies.missingElements.length}개):`);
    console.log('─'.repeat(70));

    for (const missing of anomalies.missingElements) {
      const icon = severityIcons[missing.severity] || '⚪';
      console.log(`\n${icon} [${missing.severity}] ${missing.element}`);
      console.log(`   📌 이유: ${missing.reason}`);
      if (missing.relatedEvent) {
        console.log(`   🎯 관련 이벤트: ${missing.relatedEvent}`);
      }
      console.log(`   💼 비즈니스 영향: ${missing.businessImpact}`);
      console.log(`   🔍 가능한 원인: ${missing.possibleCause}`);
    }

    // 발견된 요소 출력
    if (anomalies.presentElements && anomalies.presentElements.length > 0) {
      console.log(`\n✅ 발견된 기대 요소: ${anomalies.presentElements.join(', ')}`);
    }

    // 전반적 평가
    const assessmentIcon = anomalies.overallAssessment === '정상' ? '✅' :
                          anomalies.overallAssessment === '주의필요' ? '⚠️' : '🚨';
    console.log(`\n${assessmentIcon} 전반적 평가: ${anomalies.overallAssessment}`);
    console.log('═'.repeat(70));
  }

  /**
   * Dry run 리포트 생성
   */
  private generateDryRunReport(branches: BranchConfig[]): TestReport {
    return {
      metadata: {
        generatedAt: new Date(),
        ga4PropertyId: this.config.ga4PropertyId,
        dateRange: this.config.dateRange,
        totalDurationMs: 0,
        branchCount: branches.length
      },
      branches: branches.map(b => ({
        branchId: b.id,
        contentGroup: b.contentGroup,
        status: 'pending' as const,
        startTime: new Date(),
        testedUrls: b.testUrls,
        events: [],
        comparison: {
          branchId: b.id,
          contentGroup: b.contentGroup,
          events: [],
          overall: {
            totalEvents: b.expectedEvents.length,
            avgPredictionAccuracy: 0,
            avgSpecCompliance: 0,
            criticalIssues: 0,
            warnings: 0
          }
        },
        errors: [],
        screenshots: []
      })),
      summary: {
        overallAccuracy: 0,
        branchAccuracies: {} as Record<ContentGroup, number>,
        topIssues: [],
        recommendations: [],
        totalEvents: 0,
        totalParameters: 0,
        matchedParameters: 0,
        byStatus: {
          completed: 0,
          failed: 0,
          skipped: 0
        }
      }
    };
  }

  /**
   * 진행 상황 조회
   */
  getProgress(): OrchestratorProgress {
    return this.progressTracker.getProgress();
  }

  /**
   * 진행 콜백 등록
   */
  onProgress(callback: ProgressCallback): void {
    this.progressTracker.onProgress(callback);
  }

  /**
   * 실행 취소
   */
  cancel(): void {
    this.shouldCancel = true;
  }

  /**
   * 정리
   */
  async cleanup(): Promise<void> {
    for (const context of this.contexts) {
      await context.close().catch(() => {});
    }
    this.contexts = [];

    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }

    this.workers = [];
  }

  /**
   * 실행 중 여부
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }
}

/**
 * 편의 함수: Orchestrator 생성 및 초기화
 */
export async function createOrchestrator(
  config: OrchestratorConfig
): Promise<TestOrchestrator> {
  const orchestrator = new TestOrchestrator(config);
  await orchestrator.initialize();
  return orchestrator;
}
