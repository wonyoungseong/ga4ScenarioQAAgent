/**
 * Parallel Content Group Analyzer
 *
 * GA4 컨텐츠 그룹별 이벤트 예측을 병렬로 수행
 * - 브라우저 풀링으로 페이지 캡처 병렬화
 * - Vision AI 배치 처리
 * - 결과 병합 및 정확도 계산
 */
import { Page } from 'playwright';
import { BrowserPoolManager } from './browserPoolManager';
import { VisionBatchProcessor, ScreenshotWithContext, UIVerificationResult } from './visionBatchProcessor';
import { ScreenshotManager } from './screenshotManager';
import { GTMConfigLoader, createDefaultGTMConfigLoader, PreloadedGTMConfig } from '../config/gtmConfigLoader';
import { IntegratedEventAnalyzer } from '../analyzers/integratedEventAnalyzer';
import { PageType, detectPageTypeComprehensive, ComprehensivePageTypeResult } from '../types/pageContext';

export interface ContentGroupConfig {
  contentGroup: string;
  pagePath: string;
  url: string;
  ga4TopEvents: string[];
}

export interface ParallelAnalysisResult {
  contentGroup: string;
  url: string;
  pageType: string;
  pageTypeConfidence: number;
  predicted: string[];
  ga4Actual: string[];
  correct: string[];
  missed: string[];
  wrong: string[];
  accuracy: number;
  processingTimeMs: number;
}

export interface ParallelAnalysisOptions {
  /** 동시 브라우저 컨텍스트 수 (기본: 4) */
  maxBrowserConcurrency?: number;
  /** 동시 Vision API 요청 수 (기본: 4) */
  maxVisionConcurrency?: number;
  /** Vision AI 스킵 여부 (기본: false) */
  skipVision?: boolean;
  /** 페이지 로드 대기 시간 ms (기본: 3000) */
  pageWaitTime?: number;
}

interface PageCaptureData {
  config: ContentGroupConfig;
  screenshotPath: string;
  pageType: PageType;
  pageTypeConfidence: number;
  pageTypeSignals: string[];
  gtmPossibleEvents: string[];
  startTime: number;
}

// 자동 수집 이벤트 (예측에서 제외)
const AUTO_COLLECTED_EVENTS = [
  'page_view', 'screen_view', 'session_start', 'first_visit', 'user_engagement'
];

export class ParallelContentGroupAnalyzer {
  private browserPool: BrowserPoolManager;
  private visionProcessor: VisionBatchProcessor;
  private screenshotManager: ScreenshotManager;
  private configLoader: GTMConfigLoader;
  private preloadedConfig: PreloadedGTMConfig | null = null;
  private analyzer: IntegratedEventAnalyzer | null = null;
  private readonly apiKey: string;
  private readonly options: Required<ParallelAnalysisOptions>;

  constructor(apiKey: string, options: ParallelAnalysisOptions = {}) {
    this.apiKey = apiKey;
    this.options = {
      maxBrowserConcurrency: options.maxBrowserConcurrency ?? 4,
      maxVisionConcurrency: options.maxVisionConcurrency ?? 4,
      skipVision: options.skipVision ?? false,
      pageWaitTime: options.pageWaitTime ?? 3000,
    };

    this.browserPool = new BrowserPoolManager({
      maxConcurrency: this.options.maxBrowserConcurrency,
    });

    this.visionProcessor = new VisionBatchProcessor(apiKey, {
      maxConcurrency: this.options.maxVisionConcurrency,
    });

    this.screenshotManager = new ScreenshotManager({
      tempDir: './output/parallel_temp',
    });

    this.configLoader = createDefaultGTMConfigLoader();
  }

  /**
   * 초기화 - GTM 설정 로드 및 브라우저 시작
   */
  async initialize(): Promise<void> {
    console.log('📦 Initializing parallel analyzer...');
    const startTime = Date.now();

    // GTM 설정 로드 (1회)
    this.preloadedConfig = await this.configLoader.preload();

    // 통합 분석기 생성
    this.analyzer = IntegratedEventAnalyzer.fromConfigLoader(this.apiKey, this.configLoader);

    // 브라우저 풀 초기화
    await this.browserPool.initialize();

    console.log(`✅ Initialization complete (${Date.now() - startTime}ms)`);
  }

  /**
   * 모든 컨텐츠 그룹 병렬 분석
   */
  async analyzeAll(configs: ContentGroupConfig[]): Promise<ParallelAnalysisResult[]> {
    if (!this.analyzer) {
      throw new Error('Analyzer not initialized. Call initialize() first.');
    }

    const totalStartTime = Date.now();
    console.log(`\n🚀 Starting parallel analysis of ${configs.length} pages...`);

    // Phase 1: 병렬 페이지 캡처 및 Non-Vision 분석
    console.log(`\n📸 Phase 1: Capturing pages (${this.options.maxBrowserConcurrency} concurrent)...`);
    const pageDataList = await this.captureAllPages(configs);
    console.log(`   ✅ Captured ${pageDataList.length} pages`);

    // Phase 2: Vision AI 배치 처리
    let visionResults: Map<string, UIVerificationResult[]> | null = null;
    if (!this.options.skipVision) {
      console.log(`\n🔍 Phase 2: Vision AI batch processing (${this.options.maxVisionConcurrency} concurrent)...`);
      const screenshots: ScreenshotWithContext[] = pageDataList.map(pd => ({
        id: pd.config.contentGroup,
        path: pd.screenshotPath,
        events: pd.gtmPossibleEvents,
        pageType: pd.pageType,
      }));
      visionResults = await this.visionProcessor.processScreenshots(screenshots);
      console.log(`   ✅ Vision AI processing complete`);
    } else {
      console.log(`\n⏭️ Phase 2: Vision AI skipped`);
    }

    // Phase 3: 결과 병합 및 정확도 계산
    console.log(`\n📊 Phase 3: Merging results...`);
    const results = this.mergeResults(pageDataList, visionResults, configs);

    const totalTime = Date.now() - totalStartTime;
    console.log(`\n⏱️ Total processing time: ${totalTime}ms (${(totalTime / 1000).toFixed(1)}s)`);

    return results;
  }

  /**
   * 모든 페이지 병렬 캡처
   */
  private async captureAllPages(configs: ContentGroupConfig[]): Promise<PageCaptureData[]> {
    const tasks = configs.map(config => this.captureSinglePage(config));
    const results = await Promise.allSettled(tasks);

    const pageDataList: PageCaptureData[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        pageDataList.push(result.value);
      } else {
        console.error(`Failed to capture ${configs[index].contentGroup}:`, result.reason);
      }
    });

    return pageDataList;
  }

  /**
   * 단일 페이지 캡처 및 분석
   */
  private async captureSinglePage(config: ContentGroupConfig): Promise<PageCaptureData> {
    const startTime = Date.now();
    const { context, page, release } = await this.browserPool.acquireContext();

    try {
      // 페이지 이동
      await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(this.options.pageWaitTime);

      // 팝업 닫기 시도
      try {
        await page.click('[class*="close"]', { timeout: 2000 });
        await page.waitForTimeout(1000);
      } catch {
        // 팝업 없음
      }

      // 스크린샷 캡처
      const screenshot = await this.screenshotManager.capture(
        page,
        config.contentGroup.toLowerCase()
      );

      // 페이지 타입 감지
      const pageTypeResult = await detectPageTypeComprehensive(page, config.url);

      // Non-Vision GTM 분석
      const gtmPossibleEvents = await this.runNonVisionAnalysis(
        config.url,
        pageTypeResult.pageType,
        page,
        screenshot.path
      );

      // 로깅
      console.log(`   📍 ${config.contentGroup}: ${pageTypeResult.pageType} (confidence: ${pageTypeResult.confidence}%)`);

      return {
        config,
        screenshotPath: screenshot.path,
        pageType: pageTypeResult.pageType,
        pageTypeConfidence: pageTypeResult.confidence,
        pageTypeSignals: pageTypeResult.signals.map(s => s.detail),
        gtmPossibleEvents,
        startTime,
      };
    } finally {
      await release();
    }
  }

  /**
   * Vision AI 없이 GTM 기반 분석만 수행
   */
  private async runNonVisionAnalysis(
    url: string,
    pageType: PageType,
    page: Page,
    screenshotPath: string
  ): Promise<string[]> {
    if (!this.analyzer) return [];

    try {
      // 전체 분석 결과에서 이벤트 목록만 추출
      const result = await this.analyzer.analyzeEventsForPage(url, screenshotPath, page);

      // actuallyCanFire + noUIEvents에서 이벤트명 추출
      const allEvents = [
        ...result.actuallyCanFire.map(e => e.eventName),
        ...result.noUIEvents.map(e => e.eventName),
      ];

      return [...new Set(allEvents)];
    } catch (error: any) {
      console.error(`Non-Vision analysis failed for ${url}:`, error.message);
      return [];
    }
  }

  /**
   * 결과 병합 및 정확도 계산
   */
  private mergeResults(
    pageDataList: PageCaptureData[],
    visionResults: Map<string, UIVerificationResult[]> | null,
    configs: ContentGroupConfig[]
  ): ParallelAnalysisResult[] {
    return pageDataList.map(pd => {
      const config = pd.config;
      let predicted = [...pd.gtmPossibleEvents];

      // Vision AI 결과로 필터링
      if (visionResults) {
        const visionResult = visionResults.get(config.contentGroup);
        if (visionResult) {
          predicted = predicted.filter(eventName => {
            const vr = visionResult.find(v => v.eventName === eventName);
            // Vision AI가 hasUI: false로 판단한 이벤트 제외
            return vr?.hasUI !== false;
          });
        }
      }

      // 자동 수집 이벤트 제외
      predicted = predicted.filter(e => !AUTO_COLLECTED_EVENTS.includes(e));
      const ga4Actual = config.ga4TopEvents.filter(e => !AUTO_COLLECTED_EVENTS.includes(e));

      // 정확도 계산
      const correct = predicted.filter(p => ga4Actual.includes(p));
      const missed = ga4Actual.filter(a => !predicted.includes(a));
      const wrong = predicted.filter(p => !ga4Actual.includes(p));
      const accuracy = correct.length / (correct.length + wrong.length) * 100 || 0;

      return {
        contentGroup: config.contentGroup,
        url: config.url,
        pageType: pd.pageType,
        pageTypeConfidence: pd.pageTypeConfidence,
        predicted,
        ga4Actual,
        correct,
        missed,
        wrong,
        accuracy,
        processingTimeMs: Date.now() - pd.startTime,
      };
    });
  }

  /**
   * 정리 - 스크린샷 삭제 및 브라우저 종료
   */
  async cleanup(): Promise<void> {
    await this.screenshotManager.cleanupAll();
    await this.browserPool.close();
  }
}
