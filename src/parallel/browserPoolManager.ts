/**
 * Browser Pool Manager
 *
 * Playwright 브라우저 컨텍스트를 풀링하여 병렬 처리 지원
 * - 동시 컨텍스트 수 제한
 * - acquire/release 패턴
 * - 자동 정리
 */
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { Semaphore } from './semaphore';

export interface BrowserPoolOptions {
  /** 동시 컨텍스트 수 (기본: 4) */
  maxConcurrency?: number;
  /** 뷰포트 너비 (기본: 1920) */
  viewportWidth?: number;
  /** 뷰포트 높이 (기본: 1080) */
  viewportHeight?: number;
  /** headless 모드 (기본: true) */
  headless?: boolean;
}

export interface AcquiredContext {
  context: BrowserContext;
  page: Page;
  release: () => Promise<void>;
}

export class BrowserPoolManager {
  private browser: Browser | null = null;
  private semaphore: Semaphore;
  private activeContexts: Set<BrowserContext> = new Set();
  private readonly options: Required<BrowserPoolOptions>;

  constructor(options: BrowserPoolOptions = {}) {
    this.options = {
      maxConcurrency: options.maxConcurrency ?? 4,
      viewportWidth: options.viewportWidth ?? 1920,
      viewportHeight: options.viewportHeight ?? 1080,
      headless: options.headless ?? true,
    };
    this.semaphore = new Semaphore(this.options.maxConcurrency);
  }

  /**
   * 브라우저 초기화
   */
  async initialize(): Promise<void> {
    if (this.browser) return;
    this.browser = await chromium.launch({ headless: this.options.headless });
  }

  /**
   * 컨텍스트와 페이지를 획득합니다.
   * 사용 후 반드시 release()를 호출해야 합니다.
   */
  async acquireContext(): Promise<AcquiredContext> {
    if (!this.browser) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    await this.semaphore.acquire();

    const context = await this.browser.newContext({
      viewport: {
        width: this.options.viewportWidth,
        height: this.options.viewportHeight,
      },
    });
    const page = await context.newPage();
    this.activeContexts.add(context);

    const release = async () => {
      try {
        this.activeContexts.delete(context);
        await context.close();
      } finally {
        this.semaphore.release();
      }
    };

    return { context, page, release };
  }

  /**
   * 현재 활성 컨텍스트 수
   */
  get activeCount(): number {
    return this.activeContexts.size;
  }

  /**
   * 대기 중인 요청 수
   */
  get waitingCount(): number {
    return this.semaphore.waitingCount;
  }

  /**
   * 모든 컨텍스트와 브라우저 종료
   */
  async close(): Promise<void> {
    // 모든 활성 컨텍스트 종료
    for (const context of this.activeContexts) {
      try {
        await context.close();
      } catch (e) {
        // 이미 종료된 컨텍스트 무시
      }
    }
    this.activeContexts.clear();

    // 브라우저 종료
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
