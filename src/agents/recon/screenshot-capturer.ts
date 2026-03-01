/**
 * Screenshot Capturer - Playwright 스크린샷 캡처
 *
 * 페이지 타입별 대표 URL의 스크린샷을 캡처합니다.
 * Gemini Vision 분석의 입력으로 사용됩니다.
 *
 * @version 1.0
 */

import * as fs from 'fs';
import * as path from 'path';
import type { BrowserContext } from 'playwright';
import type { CollectorConfig } from '../collector/browser-collector';
import type { PageTypeEnum } from '../../types/common';
import type { ScreenshotResult } from '../../types/knowledge-state';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

/** 캡처 대상 */
export interface PageTypeURL {
  page_type: PageTypeEnum;
  url: string;
  expected_cg: string;
}

// ─────────────────────────────────────────────────────────────────────
// Main Function
// ─────────────────────────────────────────────────────────────────────

/**
 * 페이지 타입별 스크린샷을 캡처합니다.
 *
 * 저장 경로: {outputDir}/screenshots/{page_type}_{channel}_{timestamp}.png
 *
 * @param context - Playwright BrowserContext
 * @param urls - 캡처 대상 URL 목록
 * @param config - Collector 설정
 * @param outputDir - 출력 디렉토리
 * @returns ScreenshotResult[]
 */
export async function capturePageScreenshots(
  context: BrowserContext,
  urls: PageTypeURL[],
  config: CollectorConfig,
  outputDir: string,
): Promise<ScreenshotResult[]> {
  const results: ScreenshotResult[] = [];
  const screenshotDir = path.join(outputDir, 'screenshots');

  // 스크린샷 디렉토리 생성
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  console.log(`\n  ── Phase 3: 스크린샷 캡처 (${urls.length}개 페이지) ──`);

  for (let i = 0; i < urls.length; i++) {
    const { url, page_type } = urls[i];
    console.log(`  [${i + 1}/${urls.length}] ${page_type} → ${url}`);

    const timestamp = Date.now();
    const fileName = `${page_type}_${config.channel}_${timestamp}.png`;
    const screenshotPath = path.join(screenshotDir, fileName);

    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.timeout_ms });
      await page.waitForLoadState('load').catch(() => {});
      // 페이지 안정화 대기
      await page.waitForTimeout(2000);

      // 풀페이지 스크린샷
      await page.screenshot({
        path: screenshotPath,
        fullPage: false, // 뷰포트 영역만 (Gemini 분석에 적합)
        type: 'png',
      });

      console.log(`    ✅ 저장: ${fileName}`);

      results.push({
        page_type,
        url,
        screenshot_path: screenshotPath,
        channel: config.channel,
        captured_at: new Date().toISOString(),
        success: true,
      });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.log(`    ❌ 캡처 실패: ${errorMsg}`);

      results.push({
        page_type,
        url,
        screenshot_path: '',
        channel: config.channel,
        captured_at: new Date().toISOString(),
        success: false,
        error: errorMsg,
      });
    } finally {
      await page.close();
    }
  }

  const successCount = results.filter(r => r.success).length;
  console.log(`  스크린샷 캡처 완료: ${successCount}/${urls.length} 성공`);

  return results;
}
