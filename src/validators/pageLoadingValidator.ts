/**
 * 페이지 로딩 검증기 (메인)
 *
 * 하이브리드 방식: DOM Fast Check → Vision AI Deep Check
 * URL 패턴에서 예상되는 필수 컴포넌트가 실제로 존재하는지 검증
 */

import { Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import {
  PageLoadingStatus,
  PageValidationResult,
  PageValidationOptions,
  ComponentCheck,
} from '../types/pageValidation';
import { DOMComponentChecker } from './domComponentChecker';
import { VisionPageValidator } from './visionPageValidator';
import { getPageRequirements, PAGE_REQUIREMENTS } from './pageRequirementsConfig';

/**
 * URL 패턴에서 페이지 타입 감지
 */
const PAGE_TYPE_URL_PATTERNS: Array<{ pattern: RegExp; type: string }> = [
  // PRODUCT_DETAIL
  { pattern: /\/product\/detail/i, type: 'PRODUCT_DETAIL' },
  { pattern: /\/prd\/detail/i, type: 'PRODUCT_DETAIL' },
  { pattern: /\/goods\/\d+/i, type: 'PRODUCT_DETAIL' },
  { pattern: /[?&]onlineProdCode=/i, type: 'PRODUCT_DETAIL' },
  { pattern: /[?&]goodsNo=/i, type: 'PRODUCT_DETAIL' },
  { pattern: /\/ProductView/i, type: 'PRODUCT_DETAIL' },

  // PRODUCT_LIST
  { pattern: /\/category\//i, type: 'PRODUCT_LIST' },
  { pattern: /\/display\/category/i, type: 'PRODUCT_LIST' },
  { pattern: /\/goods\/list/i, type: 'PRODUCT_LIST' },

  // SEARCH_RESULT
  { pattern: /\/search/i, type: 'SEARCH_RESULT' },
  { pattern: /[?&]keyword=/i, type: 'SEARCH_RESULT' },
  { pattern: /[?&]query=/i, type: 'SEARCH_RESULT' },
  { pattern: /[?&]searchKeyword=/i, type: 'SEARCH_RESULT' },

  // CART
  { pattern: /\/cart/i, type: 'CART' },
  { pattern: /\/basket/i, type: 'CART' },

  // ORDER
  { pattern: /\/order\/complete/i, type: 'ORDER_COMPLETE' },
  { pattern: /\/order/i, type: 'ORDER' },
  { pattern: /\/checkout/i, type: 'ORDER' },

  // EVENT
  { pattern: /\/event\/[^/]+\/\d+/i, type: 'EVENT_DETAIL' },
  { pattern: /\/event\/view/i, type: 'EVENT_DETAIL' },
  { pattern: /\/eventView/i, type: 'EVENT_DETAIL' },
  { pattern: /\/event/i, type: 'EVENT_LIST' },
  { pattern: /\/promotion/i, type: 'EVENT_LIST' },

  // MY
  { pattern: /\/mypage/i, type: 'MY' },
  { pattern: /\/my\//i, type: 'MY' },

  // BRAND
  { pattern: /\/brand\/[^/]+\/main/i, type: 'BRAND_MAIN' },
  { pattern: /\/brandstory/i, type: 'BRAND_MAIN' },
  { pattern: /\/display\/brand/i, type: 'BRAND_MAIN' },

  // LIVE
  { pattern: /\/live\/\d+/i, type: 'LIVE_DETAIL' },
  { pattern: /\/live/i, type: 'LIVE_LIST' },

  // MAIN (마지막에 체크)
  { pattern: /\/display\/main/i, type: 'MAIN' },
  { pattern: /^https?:\/\/[^/]+\/?$/i, type: 'MAIN' },
  { pattern: /^https?:\/\/[^/]+\/[a-z]{2}\/[a-z]{2}\/?$/i, type: 'MAIN' }, // /kr/ko/
];

/**
 * 페이지 로딩 검증기 클래스
 */
export class PageLoadingValidator {
  private domChecker: DOMComponentChecker;
  private visionValidator: VisionPageValidator | null = null;
  private options: PageValidationOptions;
  private screenshotDir: string;

  constructor(options: PageValidationOptions = {}) {
    this.options = {
      useVisionAI: true,
      visionMode: 'on-missing', // 누락된 컴포넌트가 있을 때만 Vision AI 사용
      timeout: 30000,
      saveScreenshot: true,
      screenshotDir: './output/validation/screenshots',
      verbose: false,
      ...options,
    };

    this.domChecker = new DOMComponentChecker();
    this.screenshotDir = this.options.screenshotDir || './output/validation/screenshots';

    // Vision AI 초기화 (필요시)
    if (this.options.useVisionAI && this.options.visionMode !== 'never') {
      try {
        this.visionValidator = new VisionPageValidator();
      } catch (error) {
        console.warn('Vision AI 초기화 실패, DOM 전용 모드로 동작합니다.');
        this.visionValidator = null;
      }
    }
  }

  /**
   * URL에서 페이지 타입 예측
   */
  detectPageTypeFromUrl(url: string): string {
    const urlLower = url.toLowerCase();

    for (const { pattern, type } of PAGE_TYPE_URL_PATTERNS) {
      if (pattern.test(urlLower)) {
        return type;
      }
    }

    return 'OTHERS';
  }

  /**
   * 페이지 로딩 검증 (메인 메서드)
   */
  async validate(page: Page, url: string): Promise<PageValidationResult> {
    const startTime = Date.now();
    const warnings: string[] = [];

    // 1. URL에서 페이지 타입 예측
    const expectedPageType = this.detectPageTypeFromUrl(url);
    const requirements = getPageRequirements(expectedPageType);

    if (this.options.verbose) {
      console.log(`   🔍 예상 페이지 타입: ${expectedPageType}`);
    }

    // 2. DOM Fast Check
    const domResult = await this.domChecker.validate(page, requirements.required);
    const httpStatus = domResult.httpStatus;

    // 2.1 HTTP 에러 확인
    if (httpStatus >= 400) {
      return this.buildResult({
        status: 'ERROR_PAGE',
        url,
        expectedPageType,
        httpStatus,
        requiredComponents: [],
        missingComponents: [],
        confidence: 100,
        warnings: [`HTTP 에러: ${httpStatus}`],
        errorType: 'HTTP_ERROR',
        errorMessage: `HTTP ${httpStatus}`,
        loadTimeMs: Date.now() - startTime,
      });
    }

    // 2.2 에러 페이지 키워드 확인
    if (domResult.isErrorPage) {
      return this.buildResult({
        status: 'ERROR_PAGE',
        url,
        expectedPageType,
        httpStatus,
        requiredComponents: [],
        missingComponents: [],
        confidence: 90,
        warnings: [`에러 키워드 감지: ${domResult.errorKeyword}`],
        errorType: 'KEYWORD',
        errorMessage: domResult.errorKeyword,
        pageTitle: domResult.pageTitle,
        loadTimeMs: Date.now() - startTime,
      });
    }

    // 2.3 빈 페이지 확인
    if (domResult.isEmpty) {
      return this.buildResult({
        status: 'EMPTY',
        url,
        expectedPageType,
        httpStatus,
        requiredComponents: [],
        missingComponents: [],
        confidence: 80,
        warnings: ['페이지가 비어있습니다'],
        errorType: 'EMPTY',
        pageTitle: domResult.pageTitle,
        loadTimeMs: Date.now() - startTime,
      });
    }

    // 2.4 로그인 필요 확인
    if (domResult.isLoginRequired) {
      warnings.push('로그인이 필요한 페이지입니다');
    }

    // 3. DOM 컴포넌트 검증 결과 분석
    const foundComponents = domResult.components.filter((c) => c.found);
    const missingComponents = domResult.components.filter((c) => !c.found);

    // 3.1 모든 필수 컴포넌트가 발견됨 → VALID (Fast Exit)
    if (missingComponents.length === 0) {
      return this.buildResult({
        status: 'VALID',
        url,
        expectedPageType,
        httpStatus,
        requiredComponents: domResult.components,
        missingComponents: [],
        confidence: 90,
        warnings,
        pageTitle: domResult.pageTitle,
        loadTimeMs: Date.now() - startTime,
      });
    }

    // 4. 누락된 컴포넌트가 있음 → Vision AI 확인 (옵션에 따라)
    let visionComponents: ComponentCheck[] = [];
    let screenshotPath: string | undefined;

    if (
      this.visionValidator &&
      (this.options.visionMode === 'always' || this.options.visionMode === 'on-missing')
    ) {
      try {
        // 스크린샷 캡처
        screenshotPath = await this.captureScreenshot(page, url);

        // Vision AI 검증
        const visionResult = await this.visionValidator.validateComponents(
          screenshotPath,
          expectedPageType,
          requirements.required
        );

        visionComponents = visionResult.components;

        // Vision AI로 추가 발견된 컴포넌트 병합
        for (const comp of visionComponents) {
          const domComp = domResult.components.find((c) => c.name === comp.name);
          if (domComp && !domComp.found && comp.found) {
            domComp.found = true;
            domComp.visionDetected = true;
            domComp.confidence = comp.confidence;
            domComp.location = comp.location;
          }
        }

        // Vision AI 분석 결과에서 이상 징후 확인
        if (visionResult.anomalies.length > 0) {
          warnings.push(...visionResult.anomalies);
        }

        if (visionResult.layoutStatus === 'broken') {
          warnings.push('레이아웃이 깨진 것으로 보입니다');
        }
      } catch (error: any) {
        warnings.push(`Vision AI 검증 실패: ${error.message}`);
      }
    }

    // 5. 최종 결과 종합
    const finalMissing = domResult.components.filter((c) => !c.found);
    const finalMissingNames = finalMissing.map((c) => c.name);

    let status: PageLoadingStatus;
    let confidence: number;

    if (finalMissing.length === 0) {
      status = 'VALID';
      confidence = 85; // Vision AI로 확인됨
    } else if (finalMissing.length < requirements.required.length / 2) {
      status = 'PARTIAL';
      confidence = 60;
      warnings.push(`누락된 컴포넌트: ${finalMissingNames.join(', ')}`);
    } else {
      // 대부분의 컴포넌트가 누락됨 → 페이지 타입 불일치 가능성
      status = 'WRONG_TYPE';
      confidence = 40;
      warnings.push(`예상 페이지 타입(${expectedPageType})과 다른 페이지일 수 있습니다`);
      warnings.push(`누락된 컴포넌트: ${finalMissingNames.join(', ')}`);
    }

    return this.buildResult({
      status,
      url,
      expectedPageType,
      httpStatus,
      requiredComponents: domResult.components,
      missingComponents: finalMissingNames,
      confidence,
      warnings,
      pageTitle: domResult.pageTitle,
      loadTimeMs: Date.now() - startTime,
      screenshotPath,
    });
  }

  /**
   * 스크린샷 캡처
   */
  private async captureScreenshot(page: Page, url: string): Promise<string> {
    // 디렉토리 생성
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    }

    // 파일명 생성
    const urlHash = Buffer.from(url).toString('base64').substring(0, 20).replace(/[/+=]/g, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `validation_${urlHash}_${timestamp}.png`;
    const filepath = path.join(this.screenshotDir, filename);

    // 스크린샷 캡처
    await page.screenshot({
      path: filepath,
      fullPage: false, // 뷰포트만
    });

    return filepath;
  }

  /**
   * 결과 객체 생성
   */
  private buildResult(params: Partial<PageValidationResult>): PageValidationResult {
    return {
      status: params.status || 'PARTIAL',
      url: params.url || '',
      expectedPageType: params.expectedPageType || 'OTHERS',
      httpStatus: params.httpStatus || 200,
      requiredComponents: params.requiredComponents || [],
      missingComponents: params.missingComponents || [],
      confidence: params.confidence || 50,
      warnings: params.warnings || [],
      errorType: params.errorType,
      errorMessage: params.errorMessage,
      pageTitle: params.pageTitle,
      loadTimeMs: params.loadTimeMs,
      screenshotPath: params.screenshotPath,
    };
  }

  /**
   * 결과 로그 출력
   */
  logResult(result: PageValidationResult): void {
    const statusEmoji = {
      VALID: '✅',
      PARTIAL: '⚠️',
      ERROR_PAGE: '❌',
      WRONG_TYPE: '🔄',
      EMPTY: '📭',
      LOGIN_REQUIRED: '🔒',
      TIMEOUT: '⏱️',
      NETWORK_ERROR: '🌐',
    };

    const emoji = statusEmoji[result.status] || '❓';
    console.log(`   ${emoji} 페이지 검증: ${result.status} (신뢰도: ${result.confidence}%)`);

    if (result.warnings.length > 0) {
      for (const warning of result.warnings) {
        console.log(`      - ${warning}`);
      }
    }
  }
}

/**
 * 편의 함수: 단일 페이지 검증
 */
export async function validatePageLoading(
  page: Page,
  url: string,
  options?: PageValidationOptions
): Promise<PageValidationResult> {
  const validator = new PageLoadingValidator(options);
  return validator.validate(page, url);
}
