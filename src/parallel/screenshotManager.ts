/**
 * Screenshot Manager
 *
 * 스크린샷 캡처 및 임시 파일 관리
 * - 병렬 캡처 지원
 * - 자동 cleanup
 */
import * as fs from 'fs';
import * as path from 'path';
import { Page } from 'playwright';

export interface ScreenshotOptions {
  /** 스크린샷 저장 디렉토리 (기본: ./output/parallel_temp) */
  tempDir?: string;
  /** 전체 페이지 캡처 여부 (기본: false) */
  fullPage?: boolean;
}

export interface CapturedScreenshot {
  id: string;
  path: string;
  timestamp: number;
}

export class ScreenshotManager {
  private readonly tempDir: string;
  private readonly fullPage: boolean;
  private activeScreenshots: Map<string, CapturedScreenshot> = new Map();

  constructor(options: ScreenshotOptions = {}) {
    this.tempDir = options.tempDir ?? './output/parallel_temp';
    this.fullPage = options.fullPage ?? false;
    this.ensureDir();
  }

  /**
   * 디렉토리 존재 확인 및 생성
   */
  private ensureDir(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * 스크린샷 캡처 및 저장
   */
  async capture(page: Page, id: string): Promise<CapturedScreenshot> {
    const timestamp = Date.now();
    const filename = `${id}_${timestamp}.png`;
    const filePath = path.join(this.tempDir, filename);

    await page.screenshot({
      path: filePath,
      fullPage: this.fullPage,
    });

    const screenshot: CapturedScreenshot = {
      id,
      path: filePath,
      timestamp,
    };

    this.activeScreenshots.set(id, screenshot);
    return screenshot;
  }

  /**
   * 특정 스크린샷 삭제
   */
  async cleanup(id: string): Promise<void> {
    const screenshot = this.activeScreenshots.get(id);
    if (screenshot && fs.existsSync(screenshot.path)) {
      await fs.promises.unlink(screenshot.path);
      this.activeScreenshots.delete(id);
    }
  }

  /**
   * 모든 스크린샷 삭제
   */
  async cleanupAll(): Promise<void> {
    const promises = Array.from(this.activeScreenshots.keys()).map(id =>
      this.cleanup(id)
    );
    await Promise.all(promises);
  }

  /**
   * 스크린샷 경로 조회
   */
  getPath(id: string): string | null {
    return this.activeScreenshots.get(id)?.path ?? null;
  }

  /**
   * 모든 활성 스크린샷 목록
   */
  getAllScreenshots(): CapturedScreenshot[] {
    return Array.from(this.activeScreenshots.values());
  }

  /**
   * 활성 스크린샷 수
   */
  get count(): number {
    return this.activeScreenshots.size;
  }
}
