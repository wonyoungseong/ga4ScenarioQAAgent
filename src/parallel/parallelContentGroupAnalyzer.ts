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
import { edgeCaseLoader, EdgeCase } from '../config/siteEdgeCases';

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
  sessionOnceSkipped: string[];  // SESSION_ONCE 이벤트 (정확도 계산 제외)
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
  /** GA4 Property ID (Edge Case 적용용) */
  ga4PropertyId?: string;
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

// Vision AI 필터링 스킵 이벤트 (거의 모든 페이지에서 발생하는 범용 클릭 이벤트)
// 이 이벤트들은 GTM 분석을 통과하면 Vision AI 결과와 상관없이 예측에 포함
const VISION_FILTER_SKIP_EVENTS = [
  'ap_click',  // 일반 클릭 추적 - 모든 페이지에 클릭 가능한 요소 존재
];

// 페이지 타입별 필수 이벤트 (개발가이드 기준)
// Vision AI 필터링 무시 - GTM 분석 통과 시 무조건 예측에 포함
// ⚠️ 주의: GA4 수집 데이터가 아닌 개발가이드 기준으로 설정
// SPA로 인해 잘못 수집된 이벤트는 제외 (예: view_promotion이 MY에서 5.73% 수집되나 개발가이드상 MAIN만)
const PAGE_TYPE_REQUIRED_EVENTS: Record<string, string[]> = {
  'MAIN': ['click_with_duration', 'select_promotion', 'login', 'view_promotion', 'scroll'],
  'PRODUCT_DETAIL': ['add_to_cart', 'view_item', 'scroll', 'click_with_duration', 'begin_checkout'],
  'SEARCH_RESULT': ['select_item', 'view_item_list', 'view_search_results'],
  'EVENT_DETAIL': ['click_with_duration', 'video_start', 'video_progress', 'scroll', 'view_promotion_detail'],
  'BRAND_MAIN': ['brand_product_click', 'click_with_duration', 'scroll'],
  'BRAND_PRODUCT_LIST': ['brand_product_click', 'click_with_duration'],
  'BRAND_EVENT_LIST': [],
  'BRAND_CUSTOM_ETC': ['click_with_duration'],
  'BRAND_LIST': [],  // 개발가이드: view_promotion은 MAIN에서만
  'MY': [],  // 개발가이드: view_promotion, add_to_cart은 SPA 노이즈
  'HISTORY': ['click_with_duration', 'login', 'custom_event'],  // view_promotion 제거 (SPA 노이즈)
  'CART': ['begin_checkout'],
  'LIVE_DETAIL': ['live'],
  'LIVE_LIST': [],  // 개발가이드: view_promotion은 MAIN에서만
  'CATEGORY_LIST': [],  // 개발가이드: view_promotion, select_promotion은 MAIN에서만
  'MEMBERSHIP': [],
  'EVENT_LIST': [],  // 개발가이드: view_promotion은 MAIN에서만
  'AMORESTORE': [],  // 개발가이드: view_promotion은 MAIN에서만
  'BEAUTYFEED': [],  // 개발가이드: view_search_results는 SEARCH_RESULT에서만
  'CUSTOMER': [],
};

export class ParallelContentGroupAnalyzer {
  private browserPool: BrowserPoolManager;
  private visionProcessor: VisionBatchProcessor;
  private screenshotManager: ScreenshotManager;
  private configLoader: GTMConfigLoader;
  private preloadedConfig: PreloadedGTMConfig | null = null;
  private analyzer: IntegratedEventAnalyzer | null = null;
  private readonly apiKey: string;
  private readonly options: Required<ParallelAnalysisOptions>;
  private edgeCases: EdgeCase[] = [];

  constructor(apiKey: string, options: ParallelAnalysisOptions = {}) {
    this.apiKey = apiKey;
    this.options = {
      maxBrowserConcurrency: options.maxBrowserConcurrency ?? 4,
      maxVisionConcurrency: options.maxVisionConcurrency ?? 4,
      skipVision: options.skipVision ?? false,
      pageWaitTime: options.pageWaitTime ?? 3000,
      ga4PropertyId: options.ga4PropertyId ?? '',
    };

    // Edge Cases 로드
    if (this.options.ga4PropertyId) {
      this.edgeCases = edgeCaseLoader.getEdgeCasesForProperty(this.options.ga4PropertyId);
      console.log(`📌 Edge Cases loaded: ${this.edgeCases.length} cases for property ${this.options.ga4PropertyId}`);
    }

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
   * skipVision 옵션으로 Vision AI 호출을 건너뛰어 토큰 절약
   */
  private async runNonVisionAnalysis(
    url: string,
    pageType: PageType,
    page: Page,
    screenshotPath: string
  ): Promise<string[]> {
    if (!this.analyzer) return [];

    try {
      // skipVision: true로 Vision AI 호출을 건너뜀 (토큰 절약)
      // Vision AI 검증은 visionBatchProcessor에서 별도로 수행
      const result = await this.analyzer.analyzeEventsForPage(
        url,
        screenshotPath,
        page,
        { skipVision: true }
      );

      // actuallyCanFire에서 이벤트명 추출 (skipVision 시 모든 이벤트가 여기에 포함됨)
      const allEvents = result.actuallyCanFire.map(e => e.eventName);

      return [...new Set(allEvents)];
    } catch (error: any) {
      console.error(`Non-Vision analysis failed for ${url}:`, error.message);
      return [];
    }
  }

  /**
   * Edge Case 적용하여 예측 필터링
   * @param predictions 원본 예측 이벤트 목록
   * @param pageType 페이지 타입
   * @returns Edge Case가 적용된 예측 이벤트 목록
   */
  private applyEdgeCases(predictions: string[], pageType: string): {
    filtered: string[];
    appliedCases: { eventName: string; type: string; reason: string }[];
  } {
    if (this.edgeCases.length === 0) {
      return { filtered: predictions, appliedCases: [] };
    }

    const appliedCases: { eventName: string; type: string; reason: string }[] = [];
    const filtered = predictions.filter(eventName => {
      const edgeCase = this.edgeCases.find(ec => ec.eventName === eventName);

      if (!edgeCase) {
        return true; // Edge Case 없으면 통과
      }

      switch (edgeCase.type) {
        case 'PAGE_RESTRICTION':
          // 허용된 페이지 타입에 없으면 제외
          if (edgeCase.allowedPageTypes && !edgeCase.allowedPageTypes.includes(pageType)) {
            appliedCases.push({
              eventName,
              type: edgeCase.type,
              reason: `Only allowed on ${edgeCase.allowedPageTypes.join(', ')}`
            });
            return false;
          }
          break;

        case 'PAGE_EXCLUSION':
          // 제외된 페이지 타입이면 제외
          if (edgeCase.excludedPageTypes && edgeCase.excludedPageTypes.includes(pageType)) {
            appliedCases.push({
              eventName,
              type: edgeCase.type,
              reason: `Excluded from ${pageType}`
            });
            return false;
          }
          break;

        case 'NOT_IMPLEMENTED':
        case 'DEPRECATED':
          // 미구현 또는 폐지된 이벤트 제외
          appliedCases.push({
            eventName,
            type: edgeCase.type,
            reason: edgeCase.description
          });
          return false;

        case 'NOISE_EXPECTED':
          // 노이즈 예상 이벤트는 해당 페이지에서 예측에서 제외
          if (edgeCase.affectedPageTypes?.includes(pageType)) {
            appliedCases.push({
              eventName,
              type: edgeCase.type,
              reason: `Noise expected on ${pageType} (${edgeCase.expectedNoisePercent}%)`
            });
            return false;
          }
          break;
      }

      return true;
    });

    return { filtered, appliedCases };
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
          // 페이지 타입별 필수 이벤트 목록
          const requiredEvents = PAGE_TYPE_REQUIRED_EVENTS[pd.pageType] || [];

          predicted = predicted.filter(eventName => {
            // Vision AI 필터링 스킵 이벤트는 무조건 포함
            if (VISION_FILTER_SKIP_EVENTS.includes(eventName)) {
              return true;
            }
            // 페이지 타입별 필수 이벤트는 무조건 포함
            if (requiredEvents.includes(eventName)) {
              return true;
            }
            const vr = visionResult.find(v => v.eventName === eventName);
            // Vision AI가 hasUI: false로 판단한 이벤트 제외
            return vr?.hasUI !== false;
          });
        }
      }

      // Edge Case 적용 (Vision AI 필터링 후 적용)
      const edgeCaseResult = this.applyEdgeCases(predicted, pd.pageType);
      predicted = edgeCaseResult.filtered;

      // Edge Case 적용 로깅
      if (edgeCaseResult.appliedCases.length > 0) {
        console.log(`   🔧 ${config.contentGroup}: Edge Cases applied:`);
        for (const ec of edgeCaseResult.appliedCases) {
          console.log(`      - ${ec.eventName} [${ec.type}]: ${ec.reason}`);
        }
      }

      // 자동 수집 이벤트 제외
      predicted = predicted.filter(e => !AUTO_COLLECTED_EVENTS.includes(e));
      const ga4Actual = config.ga4TopEvents.filter(e => !AUTO_COLLECTED_EVENTS.includes(e));

      // SESSION_ONCE 이벤트 목록 (세션당 1회만 발생하므로 정확도 계산에서 제외)
      const sessionOnceEvents = this.edgeCases
        .filter(ec => ec.type === 'SESSION_ONCE')
        .map(ec => ec.eventName);

      // 정확도 계산
      const correct = predicted.filter(p => ga4Actual.includes(p));
      const missed = ga4Actual.filter(a => !predicted.includes(a));
      // SESSION_ONCE 이벤트는 "잘못된 예측"에서 제외 (세션 내 다른 페이지에서 이미 발생했을 수 있음)
      const wrong = predicted.filter(p => !ga4Actual.includes(p) && !sessionOnceEvents.includes(p));
      const sessionOnceSkipped = predicted.filter(p => !ga4Actual.includes(p) && sessionOnceEvents.includes(p));
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
        sessionOnceSkipped,
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
