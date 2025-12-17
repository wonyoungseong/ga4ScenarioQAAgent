/**
 * Vision Batch Processor
 *
 * Gemini Vision AI 배치 처리
 * - Rate limiting 적용
 * - 최적화된 프롬프트
 * - 병렬 처리 with 동시성 제한
 */
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import { RateLimiter } from './rateLimiter';
import { Semaphore } from './semaphore';
import { PageType } from '../types/pageContext';
import { EVENT_UI_REQUIREMENTS } from '../types/eventUIRequirements';

export interface ScreenshotWithContext {
  id: string;
  path: string;
  events: string[];
  pageType: PageType;
}

export interface UIVerificationResult {
  eventName: string;
  hasUI: boolean;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  foundUIElements?: string;
}

export interface VisionBatchOptions {
  /** 동시 API 요청 수 (기본: 4) */
  maxConcurrency?: number;
  /** 분당 요청 제한 (기본: 50) */
  requestsPerMinute?: number;
  /** 모델명 (기본: gemini-2.0-flash) */
  modelName?: string;
}

export class VisionBatchProcessor {
  private readonly model: GenerativeModel;
  private readonly rateLimiter: RateLimiter;
  private readonly semaphore: Semaphore;

  constructor(apiKey: string, options: VisionBatchOptions = {}) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = options.modelName ?? 'gemini-2.0-flash';
    this.model = genAI.getGenerativeModel({ model: modelName });

    this.rateLimiter = new RateLimiter({
      requestsPerMinute: options.requestsPerMinute ?? 50,
    });

    this.semaphore = new Semaphore(options.maxConcurrency ?? 4);
  }

  /**
   * 여러 스크린샷을 배치로 처리
   */
  async processScreenshots(
    screenshots: ScreenshotWithContext[]
  ): Promise<Map<string, UIVerificationResult[]>> {
    const results = new Map<string, UIVerificationResult[]>();

    // 병렬 처리 with semaphore
    const tasks = screenshots.map(screenshot =>
      this.processWithConcurrencyControl(screenshot)
    );

    const processed = await Promise.allSettled(tasks);

    processed.forEach((result, index) => {
      const screenshot = screenshots[index];
      if (result.status === 'fulfilled') {
        results.set(screenshot.id, result.value);
      } else {
        console.error(`Vision processing failed for ${screenshot.id}:`, result.reason);
        // 실패 시 기본 결과 반환
        results.set(screenshot.id, this.getDefaultResults(screenshot.events));
      }
    });

    return results;
  }

  /**
   * 동시성 제어와 함께 단일 스크린샷 처리
   */
  private async processWithConcurrencyControl(
    screenshot: ScreenshotWithContext
  ): Promise<UIVerificationResult[]> {
    await this.semaphore.acquire();
    try {
      await this.rateLimiter.waitIfNeeded();
      return await this.analyzeSingleScreenshot(screenshot);
    } finally {
      this.semaphore.release();
    }
  }

  /**
   * 단일 스크린샷 분석
   */
  private async analyzeSingleScreenshot(
    screenshot: ScreenshotWithContext
  ): Promise<UIVerificationResult[]> {
    const imageBase64 = await this.imageToBase64(screenshot.path);
    const mimeType = this.getMimeType(screenshot.path);

    // 자동 발생 이벤트 필터링
    const eventsToCheck = screenshot.events.filter(name => {
      const req = EVENT_UI_REQUIREMENTS[name];
      return !req?.autoFire;
    });

    if (eventsToCheck.length === 0) {
      return [];
    }

    const prompt = this.buildOptimizedPrompt(eventsToCheck, screenshot.pageType);

    try {
      const result = await this.model.generateContent([
        {
          inlineData: {
            mimeType,
            data: imageBase64,
          },
        },
        { text: prompt },
      ]);

      const response = result.response;
      const text = response.text();

      return this.parseResponse(text, eventsToCheck);
    } catch (error: any) {
      console.error(`Vision API error for ${screenshot.id}:`, error.message);
      return this.getDefaultResults(eventsToCheck);
    }
  }

  /**
   * 최적화된 프롬프트 생성 (토큰 절약)
   */
  private buildOptimizedPrompt(events: string[], pageType: PageType): string {
    // 이벤트별 필요 UI를 컴팩트하게 구성
    const eventChecks = events.map(name => {
      const req = EVENT_UI_REQUIREMENTS[name];
      const ui = req?.requiredUI || 'clickable element';
      return `${name}:${ui}`;
    }).join('|');

    return `Page: ${pageType}
Verify UI elements for events: ${eventChecks}

Check if required UI exists for each event.
Return JSON only:
{"results":[{"event":"name","hasUI":true/false,"reason":"brief reason","confidence":"high/medium/low"}]}`;
  }

  /**
   * Vision AI 응답 파싱
   */
  private parseResponse(text: string, events: string[]): UIVerificationResult[] {
    try {
      // JSON 블록 추출
      const jsonMatch = text.match(/\{[\s\S]*"results"[\s\S]*\}/);
      if (!jsonMatch) {
        return this.getDefaultResults(events);
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const results: UIVerificationResult[] = [];

      for (const event of events) {
        const found = parsed.results?.find(
          (r: any) => r.event === event || r.eventName === event
        );

        if (found) {
          results.push({
            eventName: event,
            hasUI: found.hasUI ?? false,
            reason: found.reason || 'No reason provided',
            confidence: found.confidence || 'medium',
            foundUIElements: found.foundUIElements,
          });
        } else {
          // 응답에 없는 이벤트는 기본값
          results.push({
            eventName: event,
            hasUI: false,
            reason: 'Not found in Vision AI response',
            confidence: 'low',
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Failed to parse Vision AI response:', error);
      return this.getDefaultResults(events);
    }
  }

  /**
   * 실패 시 기본 결과 생성
   */
  private getDefaultResults(events: string[]): UIVerificationResult[] {
    return events.map(event => {
      const req = EVENT_UI_REQUIREMENTS[event];

      // autoFire 이벤트는 UI 없이도 발생 가능
      if (req?.autoFire) {
        return {
          eventName: event,
          hasUI: true,
          reason: 'Auto-fire event, no UI verification needed',
          confidence: 'medium' as const,
        };
      }

      return {
        eventName: event,
        hasUI: false,
        reason: 'Vision AI verification failed',
        confidence: 'low' as const,
      };
    });
  }

  /**
   * 이미지를 Base64로 변환
   */
  private async imageToBase64(imagePath: string): Promise<string> {
    const absolutePath = path.resolve(imagePath);
    const imageBuffer = await fs.promises.readFile(absolutePath);
    return imageBuffer.toString('base64');
  }

  /**
   * 파일 확장자로 MIME 타입 결정
   */
  private getMimeType(imagePath: string): string {
    const ext = path.extname(imagePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };
    return mimeTypes[ext] || 'image/png';
  }
}
