/**
 * DOM 기반 컴포넌트 검증기
 *
 * Playwright Page 객체를 사용하여 DOM에서 필수 컴포넌트 존재 여부를 빠르게 확인
 */

import { Page, Response } from 'playwright';
import {
  ComponentCheck,
  ComponentRequirement,
  DOMValidationResult,
  ErrorPageDetection,
  LoginRequiredDetection,
} from '../types/pageValidation';
import { ERROR_KEYWORDS, LOGIN_KEYWORDS, getAllErrorKeywords, ERROR_CONTEXT_KEYWORDS } from './pageRequirementsConfig';

/**
 * DOM 기반 컴포넌트 검증기 클래스
 */
export class DOMComponentChecker {
  private lastResponse: Response | null = null;

  /**
   * 페이지 이동 및 응답 캡처
   */
  async navigateAndCapture(page: Page, url: string, timeout: number = 30000): Promise<Response | null> {
    try {
      this.lastResponse = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout,
      });
      // 추가 로딩 대기
      await page.waitForTimeout(2000);
      return this.lastResponse;
    } catch (error: any) {
      if (error.message.includes('timeout')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * HTTP 상태 코드 확인
   */
  getHttpStatus(): number {
    return this.lastResponse?.status() || 0;
  }

  /**
   * HTTP 상태 코드로 에러 여부 확인
   */
  isHttpError(): boolean {
    const status = this.getHttpStatus();
    return status >= 400;
  }

  /**
   * 에러 페이지 키워드 감지 (정밀 감지)
   *
   * 민감도 조정:
   * 1. HTTP 상태 코드 400+ → 확실한 에러
   * 2. 명확한 에러 키워드 발견 → 에러
   * 3. 문맥 키워드 2개 이상 + 콘텐츠 적음 → 에러 가능성
   */
  async detectErrorPage(page: Page): Promise<ErrorPageDetection> {
    try {
      // HTTP 상태 코드 우선 확인
      const httpStatus = this.getHttpStatus();
      if (httpStatus >= 400) {
        return {
          isError: true,
          errorType: 'HTTP_ERROR',
          httpStatus,
          message: `HTTP ${httpStatus}`,
        };
      }

      const result = await page.evaluate(
        (params: { errorKeywords: string[]; contextKeywords: string[] }) => {
          const bodyText = document.body?.innerText || '';
          const title = document.title || '';
          const combinedText = `${title} ${bodyText}`;
          const combinedTextLower = combinedText.toLowerCase();

          // 페이지 콘텐츠 양 확인 (에러 페이지는 보통 콘텐츠가 적음)
          const contentLength = bodyText.trim().length;
          const isLowContent = contentLength < 500;

          // 명확한 에러 키워드 검색
          for (const keyword of params.errorKeywords) {
            if (combinedTextLower.includes(keyword.toLowerCase())) {
              return {
                isError: true,
                matchedKeyword: keyword,
                detectionType: 'EXACT_MATCH',
              };
            }
          }

          // 문맥 키워드 카운트 (복합 조건)
          let contextMatchCount = 0;
          const matchedContextKeywords: string[] = [];

          for (const keyword of params.contextKeywords) {
            if (combinedTextLower.includes(keyword.toLowerCase())) {
              contextMatchCount++;
              matchedContextKeywords.push(keyword);
            }
          }

          // 문맥 키워드 2개 이상 + 콘텐츠 적음 = 에러 가능성 높음
          if (contextMatchCount >= 2 && isLowContent) {
            return {
              isError: true,
              matchedKeyword: matchedContextKeywords.join(', '),
              detectionType: 'CONTEXT_MATCH',
            };
          }

          return { isError: false };
        },
        { errorKeywords: getAllErrorKeywords(), contextKeywords: ERROR_CONTEXT_KEYWORDS }
      );

      if (result.isError) {
        return {
          isError: true,
          errorType: 'KEYWORD',
          matchedKeyword: result.matchedKeyword,
          message:
            result.detectionType === 'EXACT_MATCH'
              ? `에러 키워드 감지: ${result.matchedKeyword}`
              : `에러 문맥 감지: ${result.matchedKeyword}`,
        };
      }

      return { isError: false };
    } catch (error) {
      return { isError: false };
    }
  }

  /**
   * 빈 페이지 감지
   */
  async isEmptyPage(page: Page): Promise<boolean> {
    try {
      const result = await page.evaluate(() => {
        const body = document.body;
        if (!body) return true;

        // body의 텍스트 콘텐츠 확인
        const textContent = body.innerText?.trim() || '';
        if (textContent.length < 50) {
          // 매우 적은 텍스트

          // 이미지나 다른 콘텐츠가 있는지 확인
          const images = document.querySelectorAll('img[src]');
          const videos = document.querySelectorAll('video, iframe');
          const hasVisualContent = images.length > 0 || videos.length > 0;

          if (!hasVisualContent) {
            return true;
          }
        }

        return false;
      });

      return result;
    } catch (error) {
      return false;
    }
  }

  /**
   * 로그인 필요 페이지 감지
   */
  async detectLoginRequired(page: Page): Promise<LoginRequiredDetection> {
    try {
      const result = await page.evaluate((loginKeywords: string[]) => {
        const bodyText = document.body?.innerText || '';
        const title = document.title || '';
        const combinedText = `${title} ${bodyText}`;

        for (const keyword of loginKeywords) {
          if (combinedText.includes(keyword)) {
            return {
              isLoginRequired: true,
              matchedKeyword: keyword,
            };
          }
        }

        // URL에 login이 포함되어 있는지 확인
        if (window.location.href.toLowerCase().includes('/login')) {
          return {
            isLoginRequired: true,
            redirectUrl: window.location.href,
          };
        }

        return { isLoginRequired: false };
      }, LOGIN_KEYWORDS);

      return result;
    } catch (error) {
      return { isLoginRequired: false };
    }
  }

  /**
   * 페이지 제목 가져오기
   */
  async getPageTitle(page: Page): Promise<string> {
    try {
      return await page.title();
    } catch (error) {
      return '';
    }
  }

  /**
   * 단일 컴포넌트 존재 확인
   */
  async checkComponent(page: Page, requirement: ComponentRequirement): Promise<ComponentCheck> {
    try {
      const result = await page.evaluate(
        ({ selectors, name }) => {
          for (const selector of selectors) {
            try {
              const elements = Array.from(document.querySelectorAll(selector));
              for (const el of elements) {
                const rect = (el as HTMLElement).getBoundingClientRect();
                const style = window.getComputedStyle(el as HTMLElement);

                // 보이는 요소인지 확인
                if (
                  rect.width > 0 &&
                  rect.height > 0 &&
                  style.display !== 'none' &&
                  style.visibility !== 'hidden'
                ) {
                  return {
                    found: true,
                    matchedSelector: selector,
                    details: `${elements.length}개 요소 발견`,
                  };
                }
              }
            } catch {
              // 잘못된 selector 무시
            }
          }
          return { found: false };
        },
        { selectors: requirement.selectors, name: requirement.name }
      );

      return {
        name: requirement.name,
        found: result.found,
        matchedSelector: result.matchedSelector,
        details: result.details,
        confidence: result.found ? 'high' : undefined,
      };
    } catch (error) {
      return {
        name: requirement.name,
        found: false,
        details: `검증 실패: ${error}`,
      };
    }
  }

  /**
   * 여러 컴포넌트 존재 확인
   */
  async checkComponents(page: Page, requirements: ComponentRequirement[]): Promise<ComponentCheck[]> {
    const results: ComponentCheck[] = [];

    for (const requirement of requirements) {
      const result = await this.checkComponent(page, requirement);
      results.push(result);
    }

    return results;
  }

  /**
   * 전체 DOM 검증 수행
   */
  async validate(page: Page, requirements: ComponentRequirement[]): Promise<DOMValidationResult> {
    // 에러 페이지 확인
    const errorCheck = await this.detectErrorPage(page);

    // 빈 페이지 확인
    const isEmpty = await this.isEmptyPage(page);

    // 로그인 필요 확인
    const loginCheck = await this.detectLoginRequired(page);

    // 페이지 제목
    const pageTitle = await this.getPageTitle(page);

    // 컴포넌트 검증
    const components = await this.checkComponents(page, requirements);

    return {
      httpStatus: this.getHttpStatus(),
      isErrorPage: errorCheck.isError,
      isEmpty,
      isLoginRequired: loginCheck.isLoginRequired,
      components,
      pageTitle,
      errorKeyword: errorCheck.matchedKeyword,
    };
  }

  /**
   * 특정 텍스트가 페이지에 존재하는지 확인
   */
  async hasText(page: Page, text: string): Promise<boolean> {
    try {
      const result = await page.evaluate((searchText: string) => {
        const bodyText = document.body?.innerText || '';
        return bodyText.toLowerCase().includes(searchText.toLowerCase());
      }, text);

      return result;
    } catch (error) {
      return false;
    }
  }

  /**
   * 특정 요소 개수 확인
   */
  async countElements(page: Page, selector: string): Promise<number> {
    try {
      const count = await page.evaluate((sel: string) => {
        try {
          return document.querySelectorAll(sel).length;
        } catch {
          return 0;
        }
      }, selector);

      return count;
    } catch (error) {
      return 0;
    }
  }

  /**
   * 가격 형식 텍스트 존재 확인
   */
  async hasPriceText(page: Page): Promise<boolean> {
    try {
      const result = await page.evaluate(() => {
        const bodyText = document.body?.innerText || '';
        // 한국 원화 형식: ₩, 원, 숫자+원
        const pricePatterns = [/₩\s*[\d,]+/, /[\d,]+\s*원/, /\d{1,3}(,\d{3})+/];

        for (const pattern of pricePatterns) {
          if (pattern.test(bodyText)) {
            return true;
          }
        }
        return false;
      });

      return result;
    } catch (error) {
      return false;
    }
  }

  /**
   * 이미지 존재 확인
   */
  async hasImages(page: Page, minCount: number = 1): Promise<boolean> {
    try {
      const count = await page.evaluate(() => {
        const images = Array.from(document.querySelectorAll('img[src]'));
        let visibleCount = 0;

        for (const img of images) {
          const rect = (img as HTMLElement).getBoundingClientRect();
          if (rect.width > 50 && rect.height > 50) {
            // 의미있는 크기의 이미지
            visibleCount++;
          }
        }

        return visibleCount;
      });

      return count >= minCount;
    } catch (error) {
      return false;
    }
  }
}
