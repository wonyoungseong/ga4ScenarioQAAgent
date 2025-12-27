/**
 * Agent Worker
 *
 * 개별 테스트 태스크를 실행하는 worker입니다.
 * VisionAnalyzer와 기존 시나리오 Agent 로직을 통합합니다.
 */

import * as path from 'path';
import { Page, BrowserContext } from 'playwright';
import { AgentTask, TaskResult, OrchestratorConfig } from './types';
import {
  BranchEventData,
  PredictedParameter,
  GA4Parameter,
  SpecParameter,
  ContentGroup
} from '../branch/types';
import { SpecDataLoader } from '../data/SpecDataLoader';
import { GA4DataFetcher } from '../data/GA4DataFetcher';
import { PageVariablePrediction, GeminiVisionAnalyzer } from '../analyzers/visionAnalyzer';
import { isAmoremallUrl, getAccessibleAmoremallUrl } from '../utils/playwrightStealth';

/**
 * Agent Worker 설정
 */
export interface AgentWorkerConfig {
  agentId: string;
  visionApiKey?: string;
  visionEnabled: boolean;
  screenshotDir: string;
  pageLoadTimeout: number;
  visionApiTimeout: number;
}

/**
 * Agent Worker 클래스
 */
/**
 * Vision AI 예측 전체 결과
 */
export interface VisionPredictionResult {
  /** 페이지 타입 */
  pageType: string;
  /** 예측 신뢰도 */
  confidence: 'high' | 'medium' | 'low';
  /** 공통 파라미터 */
  commonParams: PredictedParameter[];
  /** 페이지 타입별 파라미터 */
  conditionalParams: PredictedParameter[];
  /** URL에서 추출된 파라미터 */
  urlParams: PredictedParameter[];
  /** 자동 발생 이벤트 */
  autoFireEvents: string[];
  /** 조건부 이벤트 */
  conditionalEvents: string[];
  /** 발생 금지 이벤트 */
  forbiddenEvents: string[];
  /** 기획자/마케터 관점 요소 이상 분석 */
  elementAnomalies?: {
    missingElements: Array<{
      element: string;
      severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
      reason: string;
      relatedEvent: string | null;
      businessImpact: string;
      possibleCause: string;
    }>;
    presentElements: string[];
    overallAssessment: '정상' | '주의필요' | '심각';
  };
}

export class AgentWorker {
  private config: AgentWorkerConfig;
  private specLoader: SpecDataLoader;
  private ga4Fetcher: GA4DataFetcher | null = null;
  private visionAnalyzer: GeminiVisionAnalyzer | null = null;

  private isRunning: boolean = false;
  private currentTask: AgentTask | null = null;

  constructor(
    config: AgentWorkerConfig,
    specLoader: SpecDataLoader,
    ga4Fetcher?: GA4DataFetcher
  ) {
    this.config = config;
    this.specLoader = specLoader;
    this.ga4Fetcher = ga4Fetcher || null;
  }

  /**
   * Vision Analyzer 설정 (지연 로딩)
   */
  async initVisionAnalyzer(): Promise<void> {
    if (this.config.visionEnabled && this.config.visionApiKey) {
      this.visionAnalyzer = new GeminiVisionAnalyzer(this.config.visionApiKey);
    }
  }

  /**
   * 태스크 실행
   */
  async executeTask(
    task: AgentTask,
    context: BrowserContext
  ): Promise<TaskResult> {
    if (this.isRunning) {
      return {
        taskId: task.taskId,
        success: false,
        durationMs: 0,
        error: { message: 'Worker is already running a task' }
      };
    }

    this.isRunning = true;
    this.currentTask = task;

    const startTime = Date.now();
    let page: Page | null = null;

    try {
      // 1. 페이지 열기
      page = await context.newPage();

      // 아모레몰 특별 처리: 접근 가능한 URL 패턴 사용
      let targetUrl = task.url;
      if (isAmoremallUrl(task.url)) {
        const accessibleUrl = getAccessibleAmoremallUrl(task.contentGroup);
        if (accessibleUrl) {
          console.log(`[Amoremall] ${task.contentGroup}: 접근 가능한 URL 패턴 사용`);
          console.log(`  원본 URL: ${task.url}`);
          console.log(`  변경 URL: ${accessibleUrl}`);
          targetUrl = accessibleUrl;
        } else {
          console.log(`[Amoremall] ${task.contentGroup}: WAF 차단 가능성 있음, 원본 URL 사용`);
        }
      }

      // LIVE 페이지는 networkidle 사용 (더 완전한 로딩 대기)
      const isLivePage = ['LIVE_LIST', 'LIVE_DETAIL'].includes(task.contentGroup);
      await page.goto(targetUrl, {
        waitUntil: isLivePage ? 'networkidle' : 'domcontentloaded',
        timeout: this.config.pageLoadTimeout
      });

      // 팝업 닫기 시도
      await this.closePopups(page);

      // 페이지 타입별 동적 콘텐츠 대기 시간 설정
      const isDynamicContentPage = ['LIVE_LIST', 'LIVE_DETAIL', 'MAIN'].includes(task.contentGroup);
      const baseWaitTime = isDynamicContentPage ? 3000 : 2000;

      // 추가 대기 (동적 컨텐츠 로딩)
      await page.waitForTimeout(baseWaitTime);

      // LIVE 페이지는 스크롤 기반 Lazy Loading 트리거 및 추가 대기
      if (isLivePage) {
        await this.triggerLazyLoadingForLivePage(page, task.contentGroup);
      }

      // 2. 404 체크
      const is404 = await this.check404(page);
      if (is404) {
        return {
          taskId: task.taskId,
          success: false,
          durationMs: Date.now() - startTime,
          error: { message: '404 Not Found' }
        };
      }

      // 3. 스크린샷 캡처
      const screenshotPath = await this.captureScreenshot(page, task);

      // 4. 데이터 수집 (Vision AI 예측 포함)
      const { events: eventData, visionResult } = await this.collectEventData(
        task,
        page,
        screenshotPath
      );

      // TaskResult 생성 (기획자/마케터 관점 요소 분석 포함)
      const taskResult: TaskResult = {
        taskId: task.taskId,
        success: true,
        durationMs: Date.now() - startTime,
        data: eventData,
        screenshotPath
      };

      // Vision AI 예측 결과가 있으면 elementAnomalies 추가
      if (visionResult?.elementAnomalies) {
        taskResult.visionPrediction = {
          elementAnomalies: visionResult.elementAnomalies
        };
      }

      return taskResult;

    } catch (error: any) {
      return {
        taskId: task.taskId,
        success: false,
        durationMs: Date.now() - startTime,
        error: {
          message: error.message,
          stack: error.stack
        }
      };

    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
      this.isRunning = false;
      this.currentTask = null;
    }
  }

  /**
   * 팝업 닫기
   */
  private async closePopups(page: Page): Promise<void> {
    try {
      const selectors = [
        '.popup-close',
        '.modal-close',
        '[class*="close"]',
        '[aria-label="Close"]',
        'button:has-text("닫기")'
      ];

      for (const selector of selectors) {
        const btn = await page.$(selector);
        if (btn) {
          await btn.click().catch(() => {});
          await page.waitForTimeout(500);
        }
      }
    } catch {
      // 팝업 닫기 실패해도 계속 진행
    }
  }

  /**
   * LIVE 페이지 Lazy Loading 트리거
   * 스크롤 기반 콘텐츠 로딩 및 동적 요소 대기
   */
  private async triggerLazyLoadingForLivePage(page: Page, contentGroup: string): Promise<void> {
    console.log(`[${contentGroup}] Lazy Loading 트리거 시작...`);

    try {
      // 1. 페이지 높이 및 콘텐츠 확인
      const pageInfo = await page.evaluate(() => {
        return {
          scrollHeight: document.body.scrollHeight,
          clientHeight: document.documentElement.clientHeight,
          hasVideos: document.querySelectorAll('video, [class*="video"], [class*="shorts"], [class*="play"]').length,
          hasImages: document.querySelectorAll('img[src*="live"], img[src*="thumb"]').length,
          hasLiveElements: document.querySelectorAll('[class*="live"], [class*="highlight"]').length
        };
      });

      console.log(`[${contentGroup}] 초기 상태:`, pageInfo);

      // 2. 콘텐츠가 없으면 스크롤하여 Lazy Loading 트리거
      if (pageInfo.hasVideos === 0 && pageInfo.hasImages === 0 && pageInfo.hasLiveElements === 0) {
        console.log(`[${contentGroup}] 콘텐츠 미감지 - 스크롤 트리거 시작`);

        // 점진적 스크롤 (Lazy Loading 트리거)
        for (let i = 0; i < 3; i++) {
          await page.evaluate((step) => {
            window.scrollTo(0, window.innerHeight * (step + 1) * 0.3);
          }, i);
          await page.waitForTimeout(1000);
        }

        // 다시 맨 위로 스크롤
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(2000);
      }

      // 3. 특정 LIVE 관련 셀렉터 대기 (아모레몰 전용)
      const liveSelectors = [
        '[class*="shortplay"]',       // 숏플레이 영역
        '[class*="highlight"]',       // 하이라이트 영역
        '[class*="live-card"]',       // 라이브 카드
        '[class*="video-thumb"]',     // 영상 썸네일
        'img[alt*="라이브"]',          // 라이브 이미지
        '[class*="shorts"]',          // 숏츠
        '.swiper-slide img'           // 스와이퍼 슬라이드 이미지
      ];

      for (const selector of liveSelectors) {
        try {
          const el = await page.waitForSelector(selector, { timeout: 3000 });
          if (el) {
            console.log(`[${contentGroup}] 셀렉터 발견: ${selector}`);
            break;
          }
        } catch {
          // 해당 셀렉터 없음, 다음으로
        }
      }

      // 4. 최종 상태 확인
      const finalState = await page.evaluate(() => {
        return {
          hasVideos: document.querySelectorAll('video, [class*="video"]').length,
          hasImages: document.querySelectorAll('img').length,
          bodyText: document.body.innerText.substring(0, 500)
        };
      });

      console.log(`[${contentGroup}] 최종 상태: videos=${finalState.hasVideos}, images=${finalState.hasImages}`);

      // 5. 추가 대기 (렌더링 완료)
      await page.waitForTimeout(2000);

    } catch (error: any) {
      console.warn(`[${contentGroup}] Lazy Loading 트리거 실패: ${error.message}`);
    }
  }

  /**
   * 404 체크
   * 실제 404 에러 페이지만 감지 (정상 페이지 오탐 방지)
   */
  private async check404(page: Page): Promise<boolean> {
    const result = await page.evaluate(() => {
      const bodyText = document.body.innerText.toLowerCase();
      const title = document.title.toLowerCase();
      const bodyLength = bodyText.length;

      // 404 전용 페이지 키워드 (더 엄격한 기준)
      const is404Title = title.includes('404') ||
                         title.includes('not found') ||
                         title.includes('페이지를 찾을 수 없습니다');

      // 본문에 404 메시지가 있고, 정상 컨텐츠가 없는 경우만
      const has404Text = bodyText.includes('page not found') ||
                         bodyText.includes('404 error') ||
                         (bodyText.includes('페이지를 찾을 수 없') && bodyLength < 5000);

      // 정상적인 쇼핑몰 요소가 있으면 404 아님
      const productElements = document.querySelectorAll('.product, [class*="product"], .item, [class*="item"]').length;
      const navElements = document.querySelectorAll('nav, header, footer').length;
      const hasNormalContent = productElements > 0 || navElements >= 2;

      return {
        is404: is404Title || (has404Text && !hasNormalContent),
        debug: {
          title: title.substring(0, 50),
          bodyLength,
          is404Title,
          has404Text,
          productElements,
          navElements,
          hasNormalContent
        }
      };
    });

    // 디버그 로그
    console.log(`[404 Check] URL: ${page.url().substring(0, 60)}...`);
    console.log(`[404 Check] Result: ${JSON.stringify(result.debug, null, 2)}`);

    return result.is404;
  }

  /**
   * 스크린샷 캡처
   */
  private async captureScreenshot(page: Page, task: AgentTask): Promise<string> {
    const filename = `${task.contentGroup.toLowerCase()}_${Date.now()}.png`;
    const filepath = path.join(this.config.screenshotDir, filename);

    await page.screenshot({ path: filepath, fullPage: false });

    return filepath;
  }

  /**
   * 이벤트 데이터 수집
   *
   * VisionAnalyzer의 모든 예측 기능을 활용:
   * 1. 공통/조건부/URL 파라미터 예측
   * 2. 이벤트 발생 여부 예측 (autoFire, conditional, forbidden)
   * 3. 스펙 기반 파라미터 정의
   * 4. GA4 실제 데이터
   */
  private async collectEventData(
    task: AgentTask,
    page: Page,
    screenshotPath: string
  ): Promise<{ events: BranchEventData[]; visionResult: VisionPredictionResult | null }> {
    const results: BranchEventData[] = [];

    // Vision AI 예측 (페이지당 1회만 실행)
    let visionResult: VisionPredictionResult | null = null;
    if (this.visionAnalyzer && this.config.visionEnabled) {
      visionResult = await this.predictParameters(
        screenshotPath,
        page.url(),
        task.contentGroup
      );

      // Vision AI가 예측한 이벤트 로깅
      if (visionResult) {
        console.log(`📊 [${task.contentGroup}] Vision AI 페이지 분석 결과:`);
        console.log(`   - 페이지 타입: ${visionResult.pageType} (${visionResult.confidence})`);
        console.log(`   - 자동 발생 이벤트: ${visionResult.autoFireEvents.join(', ') || '없음'}`);
        console.log(`   - 조건부 이벤트: ${visionResult.conditionalEvents.join(', ') || '없음'}`);
        console.log(`   - 발생 금지 이벤트: ${visionResult.forbiddenEvents.join(', ') || '없음'}`);

        // 기획자/마케터 관점 요소 분석 결과 로깅
        if (visionResult.elementAnomalies) {
          const anomalies = visionResult.elementAnomalies;
          if (anomalies.missingElements && anomalies.missingElements.length > 0) {
            console.log(`   ⚠️ 누락된 기대 요소: ${anomalies.missingElements.length}개`);
            for (const missing of anomalies.missingElements) {
              console.log(`      - [${missing.severity}] ${missing.element}`);
            }
          }
          if (anomalies.presentElements && anomalies.presentElements.length > 0) {
            console.log(`   ✅ 발견된 기대 요소: ${anomalies.presentElements.join(', ')}`);
          }
        }
      }
    }

    // GA4에서 페이지 기반 이벤트 발생 데이터 조회 (한 번만)
    let eventOccurrences: Map<string, number> = new Map();
    if (this.ga4Fetcher) {
      try {
        // URL에서 페이지 경로 추출 (예: /product/detail)
        const urlObj = new URL(page.url());
        const pagePath = urlObj.pathname;

        const result = await this.ga4Fetcher.getEventOccurrences(pagePath, {
          propertyId: '',
          dateRange: { startDate: '7daysAgo', endDate: 'today' }
        });

        if (result.success && result.data) {
          eventOccurrences = result.data;
          console.log(`📈 [${task.contentGroup}] GA4 이벤트 발생 데이터 (${pagePath}):`);
          const topEvents = Array.from(eventOccurrences.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
          for (const [evt, count] of topEvents) {
            console.log(`   - ${evt}: ${count.toLocaleString()}건`);
          }
        }
      } catch (error: any) {
        console.warn(`GA4 이벤트 조회 실패: ${error.message}`);
      }
    }

    for (const eventName of task.events) {
      const eventData: BranchEventData = {
        eventName,
        contentGroup: task.contentGroup,
        pageUrl: task.url,
        predictedParams: [],
        actualParams: [],
        specParams: [],
        plannedParams: [],
        collectedAt: new Date()
      };

      // 1. 스펙에서 파라미터 정의 가져오기
      eventData.specParams = this.specLoader.getEventParameters(eventName);

      // 2. Vision AI 예측 결과 적용
      if (visionResult) {
        eventData.predictedParams = this.flattenPredictions(visionResult);

        // 이벤트 발생 여부 예측 추가 (메타데이터로)
        const isAutoFire = visionResult.autoFireEvents.includes(eventName);
        const isConditional = visionResult.conditionalEvents.includes(eventName);
        const isForbidden = visionResult.forbiddenEvents.includes(eventName);

        if (isAutoFire || isConditional) {
          // 이 이벤트가 발생할 것으로 예측됨
          eventData.predictedParams.push({
            name: '_event_prediction',
            value: isAutoFire ? 'AUTO_FIRE' : 'CONDITIONAL',
            source: 'VISION',
            confidence: visionResult.confidence,
            extractionReason: isAutoFire
              ? '페이지 로드 시 자동 발생 예측'
              : '사용자 액션에 의해 발생 가능'
          });
        } else if (isForbidden) {
          // 이 이벤트가 발생하면 안 됨
          eventData.predictedParams.push({
            name: '_event_prediction',
            value: 'FORBIDDEN',
            source: 'VISION',
            confidence: visionResult.confidence,
            extractionReason: '이 페이지에서 발생하면 안 되는 이벤트'
          });
        }
      }

      // 3. GA4 이벤트 발생 데이터 적용
      const eventCount = eventOccurrences.get(eventName) || 0;
      if (eventCount > 0) {
        eventData.actualParams.push({
          name: '_event_occurred',
          value: eventCount,
          eventCount,
          lastSeen: new Date()
        });
      }

      results.push(eventData);
    }

    return { events: results, visionResult };
  }

  /**
   * Vision AI로 파라미터 예측 (전체 예측 결과 반환)
   *
   * 기존 VisionAnalyzer의 모든 기능을 활용:
   * - 공통 변수 (site_name, channel, content_group 등)
   * - 페이지 타입별 조건부 변수 (product_*, search_*, etc.)
   * - URL 파라미터 추출
   * - 이벤트 예측 (autoFire, conditional, forbidden)
   */
  private async predictParameters(
    screenshotPath: string,
    url: string,
    contentGroup: ContentGroup,
    viewport?: { width: number; height: number }
  ): Promise<VisionPredictionResult | null> {
    if (!this.visionAnalyzer) return null;

    try {
      const prediction: PageVariablePrediction = await this.visionAnalyzer.predictPageVariables(
        screenshotPath,
        url,
        { viewport: viewport || { width: 1920, height: 1080 } }
      );

      const result: VisionPredictionResult = {
        pageType: prediction.pageType,
        confidence: prediction.confidence,
        commonParams: [],
        conditionalParams: [],
        urlParams: [],
        autoFireEvents: prediction.events?.autoFire || [],
        conditionalEvents: prediction.events?.conditional || [],
        forbiddenEvents: prediction.events?.forbidden || []
      };

      // 1. 공통 변수를 PredictedParameter로 변환
      if (prediction.variables) {
        const vars = prediction.variables;
        const commonVarMap: Record<string, { value: any; description: string }> = {
          'site_name': { value: vars.site_name, description: '사이트명 (도메인 기반)' },
          'site_country': { value: vars.site_country, description: 'ISO 3166-1 국가 코드' },
          'site_language': { value: vars.site_language, description: 'ISO 639-1 언어 코드' },
          'site_env': { value: vars.site_env, description: '환경 (PRD/STG/DEV)' },
          'channel': { value: vars.channel, description: 'PC/MO 채널' },
          'content_group': { value: vars.content_group, description: '페이지 유형' },
          'login_is_login': { value: vars.login_is_login, description: '로그인 상태 (Y/N)' }
        };

        for (const [key, info] of Object.entries(commonVarMap)) {
          if (info.value !== null && info.value !== undefined && info.value !== '') {
            result.commonParams.push({
              name: key,
              value: info.value,
              source: 'VISION',
              confidence: prediction.confidence,
              extractionReason: info.description
            });
          }
        }
      }

      // 2. 페이지 위치 변수 (breadcrumb)
      if (prediction.pageLocationVariables) {
        for (const [key, value] of Object.entries(prediction.pageLocationVariables)) {
          if (value !== null && value !== undefined && value !== '') {
            result.commonParams.push({
              name: key,
              value: value,
              source: 'VISION',
              confidence: prediction.confidence,
              extractionReason: 'Breadcrumb 경로에서 추출'
            });
          }
        }
      }

      // 3. 조건부 변수 (페이지 타입별)
      if (prediction.conditionalVariables) {
        for (const [key, value] of Object.entries(prediction.conditionalVariables)) {
          if (value !== null && value !== undefined && value !== '') {
            result.conditionalParams.push({
              name: key,
              value: value as string | number,
              source: 'VISION',
              confidence: prediction.confidence,
              extractionReason: `${prediction.pageType} 페이지에서 Vision AI 추출`
            });
          }
        }
      }

      // 4. URL에서 추출된 파라미터
      if (prediction.urlParams) {
        for (const [key, value] of Object.entries(prediction.urlParams)) {
          if (value !== null && value !== undefined) {
            result.urlParams.push({
              name: key,
              value: value as string | number,
              source: 'URL',
              confidence: 'high',
              extractionReason: 'URL 쿼리 파라미터에서 추출'
            });
          }
        }
      }

      // 5. 기획자/마케터 관점 요소 이상 분석 추가
      if (prediction.elementAnomalies) {
        result.elementAnomalies = prediction.elementAnomalies;
      }

      return result;

    } catch (error: any) {
      console.warn(`Vision prediction failed: ${error.message}`);
      return null;
    }
  }

  /**
   * VisionPredictionResult를 PredictedParameter[] 배열로 변환
   */
  private flattenPredictions(prediction: VisionPredictionResult | null): PredictedParameter[] {
    if (!prediction) return [];

    return [
      ...prediction.commonParams,
      ...prediction.conditionalParams,
      ...prediction.urlParams
    ];
  }

  /**
   * GA4 API에서 실제 파라미터 조회
   */
  private async fetchActualParameters(
    eventName: string,
    contentGroup: ContentGroup
  ): Promise<GA4Parameter[]> {
    if (!this.ga4Fetcher) return [];

    try {
      const result = await this.ga4Fetcher.getActualEventParameters(
        eventName,
        contentGroup,
        {
          propertyId: '', // GA4Fetcher 내부에서 처리
          dateRange: { startDate: '7daysAgo', endDate: 'today' }
        }
      );

      return result.success && result.data ? result.data : [];

    } catch (error: any) {
      console.warn(`GA4 parameter fetch failed: ${error.message}`);
      return [];
    }
  }

  /**
   * 현재 실행 중 여부
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * 현재 태스크
   */
  getCurrentTask(): AgentTask | null {
    return this.currentTask;
  }

  /**
   * Agent ID
   */
  getAgentId(): string {
    return this.config.agentId;
  }
}
