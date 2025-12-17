import { chromium, Browser, Page } from 'playwright';
import * as path from 'path';
import { ClickableElement, EVENT_CONFIGS } from '../types';

export interface MatchedElement {
  selector: string;
  cssSelector: string;  // GTM에서 매칭된 CSS selector
  tagName: string;
  text: string;
  href?: string;
  className: string;
  attributes: Record<string, string>;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  location: string;  // 화면에서의 위치 설명
}

export class PageAnalyzer {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async init(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true
    });
    const context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });
    this.page = await context.newPage();
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async navigateTo(url: string): Promise<void> {
    if (!this.page) throw new Error('Browser not initialized');
    await this.page.goto(url, { waitUntil: 'networkidle' });
    // 추가 로딩 대기
    await this.page.waitForTimeout(2000);
  }

  async captureScreenshot(outputPath: string): Promise<string> {
    if (!this.page) throw new Error('Browser not initialized');
    const screenshotPath = path.resolve(outputPath, `screenshot_${Date.now()}.png`);
    await this.page.screenshot({ path: screenshotPath, fullPage: true });
    return screenshotPath;
  }

  async findClickableElements(): Promise<ClickableElement[]> {
    if (!this.page) throw new Error('Browser not initialized');

    const elements = await this.page.evaluate(() => {
      const clickableSelectors = [
        'a',
        'button',
        '[onclick]',
        '[role="button"]',
        '[role="link"]',
        '.product',
        '.item',
        '.card',
        '[class*="product"]',
        '[class*="item"]',
        '[class*="card"]',
        '[class*="promo"]',
        '[class*="banner"]',
        '[data-click]',
        '[data-action]'
      ];

      const allElements: any[] = [];
      const seen = new Set<Element>();

      clickableSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          if (seen.has(el)) return;
          seen.add(el);

          const rect = el.getBoundingClientRect();
          const computedStyle = window.getComputedStyle(el);

          // 보이지 않는 요소 제외
          if (rect.width === 0 || rect.height === 0) return;
          if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') return;

          // 이벤트 리스너 확인 (간접적 방법)
          const hasClickAttr = el.hasAttribute('onclick') ||
                              el.hasAttribute('data-click') ||
                              el.hasAttribute('data-action') ||
                              el.tagName === 'A' ||
                              el.tagName === 'BUTTON';

          const element = el as HTMLElement;

          allElements.push({
            selector: getUniqueSelector(el),
            tagName: el.tagName.toLowerCase(),
            text: (element.innerText || '').trim().substring(0, 100),
            href: (el as HTMLAnchorElement).href || undefined,
            className: el.className,
            id: el.id,
            boundingBox: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            },
            hasClickListener: hasClickAttr,
            elementType: 'other'
          });
        });
      });

      function getUniqueSelector(el: Element): string {
        if (el.id) return `#${el.id}`;

        let path = [];
        let current: Element | null = el;

        while (current && current !== document.body) {
          let selector = current.tagName.toLowerCase();

          if (current.id) {
            selector = `#${current.id}`;
            path.unshift(selector);
            break;
          }

          if (current.className && typeof current.className === 'string') {
            const classes = current.className.trim().split(/\s+/).slice(0, 2).join('.');
            if (classes) selector += `.${classes}`;
          }

          const parent = current.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter(c => c.tagName === current!.tagName);
            if (siblings.length > 1) {
              const index = siblings.indexOf(current) + 1;
              selector += `:nth-of-type(${index})`;
            }
          }

          path.unshift(selector);
          current = current.parentElement;
        }

        return path.join(' > ');
      }

      return allElements;
    });

    // 요소 타입 분류
    return elements.map(el => ({
      ...el,
      elementType: this.classifyElementType(el)
    }));
  }

  private classifyElementType(element: any): ClickableElement['elementType'] {
    const text = (element.text || '').toLowerCase();
    const className = (element.className || '').toLowerCase();
    const id = (element.id || '').toLowerCase();
    const href = (element.href || '').toLowerCase();

    const combined = `${text} ${className} ${id} ${href}`;

    // 프로모션 체크
    const promoKeywords = EVENT_CONFIGS.SELECT_PROMOTION.keywords;
    if (promoKeywords.some(kw => combined.includes(kw))) {
      return 'promotion';
    }

    // 제품 체크
    const productKeywords = EVENT_CONFIGS.SELECT_ITEM.keywords;
    if (productKeywords.some(kw => combined.includes(kw))) {
      return 'product';
    }

    // 네비게이션 체크
    if (combined.includes('nav') || combined.includes('menu') || combined.includes('header')) {
      return 'navigation';
    }

    // 버튼 체크
    if (element.tagName === 'button' || combined.includes('btn') || combined.includes('button')) {
      return 'button';
    }

    // 링크 체크
    if (element.tagName === 'a') {
      return 'link';
    }

    return 'other';
  }

  async getPageInfo(): Promise<{ title: string; url: string }> {
    if (!this.page) throw new Error('Browser not initialized');
    return {
      title: await this.page.title(),
      url: this.page.url()
    };
  }

  async highlightElements(elements: ClickableElement[], type: 'shouldFire' | 'shouldNotFire'): Promise<void> {
    if (!this.page) throw new Error('Browser not initialized');

    const color = type === 'shouldFire' ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.3)';
    const borderColor = type === 'shouldFire' ? 'green' : 'red';

    for (const element of elements) {
      try {
        await this.page.evaluate(({ selector, color, borderColor }) => {
          const el = document.querySelector(selector);
          if (el) {
            (el as HTMLElement).style.backgroundColor = color;
            (el as HTMLElement).style.border = `3px solid ${borderColor}`;
          }
        }, { selector: element.selector, color, borderColor });
      } catch (e) {
        // 요소를 찾지 못한 경우 무시
      }
    }
  }

  async captureHighlightedScreenshot(outputPath: string, filename: string): Promise<string> {
    if (!this.page) throw new Error('Browser not initialized');
    const screenshotPath = path.resolve(outputPath, filename);
    await this.page.screenshot({ path: screenshotPath, fullPage: true });
    return screenshotPath;
  }

  /**
   * GTM 트리거 조건에 해당하는 CSS Selector로 요소를 찾습니다.
   */
  async findElementsBySelector(cssSelector: string): Promise<MatchedElement[]> {
    if (!this.page) throw new Error('Browser not initialized');

    const viewportHeight = 1080;

    const elements = await this.page.evaluate(({ selector, viewportHeight }) => {
      const matchedElements: any[] = [];

      try {
        const els = document.querySelectorAll(selector);

        els.forEach((el, index) => {
          const rect = el.getBoundingClientRect();
          const computedStyle = window.getComputedStyle(el);

          // 보이지 않는 요소 제외
          if (rect.width === 0 || rect.height === 0) return;
          if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') return;

          // 속성 수집
          const attributes: Record<string, string> = {};
          for (const attr of Array.from(el.attributes)) {
            attributes[attr.name] = attr.value;
          }

          // 위치 설명 생성
          let location = '';
          const scrollY = window.scrollY || 0;
          const absoluteY = rect.y + scrollY;

          if (absoluteY < viewportHeight * 0.3) {
            location = '페이지 상단';
          } else if (absoluteY < viewportHeight * 0.7) {
            location = '페이지 중간';
          } else {
            location = '페이지 하단';
          }

          if (rect.x < window.innerWidth * 0.3) {
            location += ' 좌측';
          } else if (rect.x < window.innerWidth * 0.7) {
            location += ' 중앙';
          } else {
            location += ' 우측';
          }

          // 부모 요소의 클래스를 통해 영역 추정
          let parent = el.parentElement;
          let depth = 0;
          while (parent && depth < 5) {
            const parentClass = parent.className?.toLowerCase() || '';
            if (parentClass.includes('hero') || parentClass.includes('main-banner')) {
              location = '메인 히어로 배너 영역';
              break;
            }
            if (parentClass.includes('banner')) {
              location = '배너 영역';
              break;
            }
            if (parentClass.includes('product')) {
              location = '상품 영역';
              break;
            }
            parent = parent.parentElement;
            depth++;
          }

          const element = el as HTMLElement;

          matchedElements.push({
            selector: getUniqueSelector(el),
            cssSelector: selector,
            tagName: el.tagName.toLowerCase(),
            text: (element.innerText || '').trim().substring(0, 200),
            href: (el as HTMLAnchorElement).href || undefined,
            className: el.className,
            attributes,
            boundingBox: {
              x: rect.x,
              y: absoluteY,
              width: rect.width,
              height: rect.height
            },
            location
          });
        });
      } catch (e) {
        // Selector 오류 무시
      }

      function getUniqueSelector(el: Element): string {
        if (el.id) return `#${el.id}`;

        let path = [];
        let current: Element | null = el;

        while (current && current !== document.body) {
          let selector = current.tagName.toLowerCase();

          if (current.id) {
            selector = `#${current.id}`;
            path.unshift(selector);
            break;
          }

          if (current.className && typeof current.className === 'string') {
            const classes = current.className.trim().split(/\s+/).slice(0, 2).join('.');
            if (classes) selector += `.${classes}`;
          }

          const parent = current.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter(c => c.tagName === current!.tagName);
            if (siblings.length > 1) {
              const index = siblings.indexOf(current) + 1;
              selector += `:nth-of-type(${index})`;
            }
          }

          path.unshift(selector);
          current = current.parentElement;
        }

        return path.join(' > ');
      }

      return matchedElements;
    }, { selector: cssSelector, viewportHeight });

    return elements;
  }

  /**
   * 여러 CSS Selector로 요소를 찾고 결과를 통합합니다.
   */
  async findElementsBySelectors(cssSelectors: string[]): Promise<Map<string, MatchedElement[]>> {
    const result = new Map<string, MatchedElement[]>();

    for (const selector of cssSelectors) {
      const elements = await this.findElementsBySelector(selector);
      result.set(selector, elements);
    }

    return result;
  }

  /**
   * DOM 분석 결과를 사람이 읽을 수 있는 형태로 변환합니다.
   */
  formatMatchedElements(elements: MatchedElement[]): string {
    if (elements.length === 0) {
      return '해당 조건에 맞는 요소를 찾을 수 없습니다.';
    }

    const lines: string[] = [];
    lines.push(`총 ${elements.length}개의 요소를 찾았습니다:\n`);

    elements.forEach((el, index) => {
      lines.push(`[${index + 1}] ${el.location}`);
      lines.push(`    태그: <${el.tagName}>`);
      lines.push(`    클래스: ${el.className || '(없음)'}`);
      if (el.text) {
        lines.push(`    텍스트: "${el.text.substring(0, 50)}${el.text.length > 50 ? '...' : ''}"`);
      }
      if (el.href) {
        lines.push(`    링크: ${el.href}`);
      }
      lines.push(`    위치: (${Math.round(el.boundingBox.x)}, ${Math.round(el.boundingBox.y)}) - ${Math.round(el.boundingBox.width)}x${Math.round(el.boundingBox.height)}`);
      lines.push('');
    });

    return lines.join('\n');
  }
}
