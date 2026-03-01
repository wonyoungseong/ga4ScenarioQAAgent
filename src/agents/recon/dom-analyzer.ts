/**
 * DOM Analyzer - 이벤트명 → DOM 셀렉터 후보 추출
 *
 * 이벤트별 키워드(일본어/영어)를 기반으로 페이지 DOM에서
 * 클릭 가능한 요소를 탐색하여 CSS 셀렉터 후보를 반환합니다.
 *
 * 셀렉터 발견 전략 (우선순위순):
 * 1. data-attribute: [data-action="add-to-cart"] 등
 * 2. aria-label: [aria-label*="カートに入れる"] 등
 * 3. semantic text match: 키워드 → 텍스트 검색
 * 4. form role: form[action*="cart"], button[type="submit"]
 * 5. class/id heuristic: .add-to-cart, #checkout-button
 */

import type { Page } from 'playwright';
import type { PageTypeEnum } from '../../types/common';
import type { SelectorCandidate, SelectorDiscoveryMethod } from '../../types/recon';
import type { TesterInsight, PrerequisiteAction } from '../../types/knowledge-state';

// ─────────────────────────────────────────────────────────────────────
// DOM 검색 힌트 정의
// ─────────────────────────────────────────────────────────────────────

export interface DOMSearchHint {
  /** 일본어 키워드 */
  keywords_ja: string[];
  /** 영어 키워드 */
  keywords_en: string[];
  /** 우선 탐색 HTML 태그 */
  tag_hints: string[];
  /** data-* 속성 후보 */
  data_attrs: string[];
  /** class/id 패턴 후보 */
  class_patterns?: string[];
  /** 보충 설명 */
  notes?: string;
}

/** 이벤트별 DOM 검색 키워드 */
export const EVENT_DOM_KEYWORDS: Record<string, DOMSearchHint> = {
  add_to_cart: {
    keywords_ja: ['カートに入れる', 'カートに追加', 'カート', 'バッグに追加'],
    keywords_en: ['add to cart', 'add to bag', 'add to basket'],
    tag_hints: ['button', 'a', 'input[type="submit"]'],
    data_attrs: ['data-action', 'data-event', 'data-add-to-cart', 'data-testid'],
    class_patterns: ['add-to-cart', 'add-cart', 'product-form__submit', 'btn-cart', 'AddToCart'],
  },
  select_item: {
    keywords_ja: ['商品', '詳細を見る'],
    keywords_en: ['product', 'item', 'view detail'],
    tag_hints: ['a', '.product-card', '.product-link'],
    data_attrs: ['data-product-id', 'data-item-id', 'data-product-handle'],
    class_patterns: ['product-card', 'product-item', 'product-link', 'product-title'],
    notes: 'PLP/検索ページで商品カードクリック',
  },
  begin_checkout: {
    keywords_ja: ['購入手続き', 'ご購入', 'レジに進む', '注文', '購入する', 'ご注文手続きへ'],
    keywords_en: ['checkout', 'proceed', 'buy now', 'place order'],
    tag_hints: ['button', 'a', 'input[type="submit"]'],
    data_attrs: ['data-checkout', 'data-action'],
    class_patterns: ['checkout', 'checkout-button', 'btn-checkout'],
  },
  remove_from_cart: {
    keywords_ja: ['削除', '取り消す', '除去'],
    keywords_en: ['remove', 'delete'],
    tag_hints: ['button', 'a'],
    data_attrs: ['data-action', 'data-remove'],
    class_patterns: ['cart-remove', 'remove-item', 'btn-remove'],
  },
  select_promotion: {
    keywords_ja: ['バナー', 'キャンペーン', 'お得', 'セール'],
    keywords_en: ['banner', 'promotion', 'campaign', 'sale'],
    tag_hints: ['a', '.swiper-slide a', '.banner a', '.carousel a'],
    data_attrs: ['data-promotion-id', 'data-creative-slot', 'data-banner-id'],
    class_patterns: ['banner', 'promotion', 'campaign', 'hero-banner', 'swiper-slide'],
  },
  view_promotion: {
    keywords_ja: ['バナー', 'プロモーション'],
    keywords_en: ['banner', 'promotion'],
    tag_hints: ['.swiper-slide', '.banner', '.carousel-item', '.hero'],
    data_attrs: ['data-promotion-id', 'data-creative-slot'],
    class_patterns: ['banner', 'promotion', 'hero', 'carousel'],
    notes: 'スクロールで露出 (クリック不要)',
  },
  add_to_wishlist: {
    keywords_ja: ['お気に入り', 'ウィッシュリスト', 'ほしい物'],
    keywords_en: ['wishlist', 'favorite', 'heart', 'save'],
    tag_hints: ['button', 'a', 'span'],
    data_attrs: ['data-wishlist', 'data-favorite'],
    class_patterns: ['wishlist', 'favorite', 'heart', 'btn-wishlist'],
  },
  search: {
    keywords_ja: ['検索', '探す'],
    keywords_en: ['search', 'find'],
    tag_hints: ['input[type="search"]', 'input[name*="q"]', 'form[role="search"]'],
    data_attrs: ['data-search'],
    class_patterns: ['search', 'search-input', 'search-form'],
  },
  write_review: {
    keywords_ja: ['レビュー', '口コミ', '評価を書く'],
    keywords_en: ['review', 'write review', 'rate'],
    tag_hints: ['button', 'a'],
    data_attrs: ['data-action', 'data-review'],
    class_patterns: ['review', 'write-review', 'btn-review'],
  },
};

// ─────────────────────────────────────────────────────────────────────
// 셀렉터 발견 엔진
// ─────────────────────────────────────────────────────────────────────

/** page.evaluate 내에서 실행될 DOM 탐색 스크립트 파라미터 */
interface DOMSearchParams {
  keywords_ja: string[];
  keywords_en: string[];
  tag_hints: string[];
  data_attrs: string[];
  class_patterns: string[];
  event_name: string;
}

/** page.evaluate 결과 아이템 */
interface RawCandidate {
  selector: string;
  text_content: string;
  tag_name: string;
  match_count: number;
  method: string;
}

/**
 * 페이지 DOM에서 이벤트 트리거를 위한 셀렉터 후보를 탐색합니다.
 *
 * @param page - Playwright Page 객체
 * @param eventName - GA4 이벤트명 (예: add_to_cart, select_item)
 * @param _pageType - 현재 페이지 타입 (참고용)
 * @param insight - 테스터 사전 인터뷰 인사이트 (선택)
 * @returns 셀렉터 후보 목록 (신뢰도 내림차순)
 */
export async function findSelectorCandidates(
  page: Page,
  eventName: string,
  _pageType: PageTypeEnum,
  insight?: TesterInsight,
): Promise<SelectorCandidate[]> {
  // 1. 테스터가 셀렉터를 직접 제공한 경우 → 최우선 후보
  if (insight?.known_selector) {
    console.log(`      테스터 제공 셀렉터 사용: ${insight.known_selector}`);
    return [{
      selector: insight.known_selector,
      text_content: insight.trigger_text ?? '',
      tag_name: '',
      match_count: 1,
      confidence: 0.95,
      discovery_method: 'tester_pre_interview',
    }];
  }

  // 2. 멀티스텝: 전제조건 실행 후 DOM 탐색
  if (insight?.is_multi_step && insight.prerequisite_actions.length > 0) {
    console.log('      멀티스텝 플로우: 전제조건 실행 중...');
    await executePrerequisiteActions(page, insight.prerequisite_actions);
  }

  const hint = EVENT_DOM_KEYWORDS[eventName];
  if (!hint) {
    return [];
  }

  // 3. 테스터 trigger_text로 키워드 오버라이드
  const keywords_ja = insight?.trigger_text
    ? [insight.trigger_text, ...hint.keywords_ja]
    : [...hint.keywords_ja];

  const searchParams: DOMSearchParams = {
    keywords_ja,
    keywords_en: hint.keywords_en,
    tag_hints: hint.tag_hints,
    data_attrs: hint.data_attrs,
    class_patterns: hint.class_patterns || [],
    event_name: eventName,
  };

  // page.evaluate 내에서 DOM 탐색 실행
  const rawCandidates = await page.evaluate((params: DOMSearchParams) => {
    const results: RawCandidate[] = [];
    const seen = new Set<string>();

    function addCandidate(el: Element, selector: string, method: string): void {
      if (seen.has(selector)) return;
      seen.add(selector);

      const text = (el.textContent || '').trim().substring(0, 100);
      const count = document.querySelectorAll(selector).length;

      results.push({
        selector,
        text_content: text,
        tag_name: el.tagName.toLowerCase(),
        match_count: count,
        method,
      });
    }

    function buildUniqueSelector(el: Element): string {
      // Try ID first
      if (el.id) {
        return `#${CSS.escape(el.id)}`;
      }

      // Try data attributes
      const attrs = Array.from(el.attributes);
      for (let ai = 0; ai < attrs.length; ai++) {
        const attr = attrs[ai];
        if (attr.name.startsWith('data-') && attr.value) {
          const sel = `${el.tagName.toLowerCase()}[${attr.name}="${CSS.escape(attr.value)}"]`;
          if (document.querySelectorAll(sel).length <= 3) {
            return sel;
          }
        }
      }

      // Try class combination
      if (el.classList.length > 0) {
        const classes = Array.from(el.classList).slice(0, 3);
        const sel = el.tagName.toLowerCase() + '.' + classes.map(c => CSS.escape(c)).join('.');
        if (document.querySelectorAll(sel).length <= 5) {
          return sel;
        }
      }

      // Fallback: nth-child path
      const path: string[] = [];
      let current: Element | null = el;
      while (current && current !== document.body) {
        const parent: Element | null = current.parentElement;
        if (!parent) break;
        const children = Array.from(parent.children);
        const idx = children.indexOf(current) + 1;
        path.unshift(`${current.tagName.toLowerCase()}:nth-child(${idx})`);
        current = parent;
        if (path.length >= 3) break;
      }
      return path.join(' > ');
    }

    // Strategy 1: data-attribute search
    for (const attr of params.data_attrs) {
      const elements = Array.from(document.querySelectorAll(`[${attr}]`));
      for (const el of elements) {
        const val = el.getAttribute(attr);
        if (val) {
          addCandidate(el, `[${attr}="${CSS.escape(val)}"]`, 'data_attr');
        } else {
          addCandidate(el, `[${attr}]`, 'data_attr');
        }
      }
    }

    // Strategy 2: aria-label search
    const allKeywords = [...params.keywords_ja, ...params.keywords_en];
    for (const keyword of allKeywords) {
      const kw = keyword.toLowerCase();
      const ariaElements = Array.from(document.querySelectorAll('[aria-label]'));
      for (const el of ariaElements) {
        const label = (el.getAttribute('aria-label') || '').toLowerCase();
        if (label.includes(kw)) {
          addCandidate(el, `[aria-label*="${keyword}"]`, 'aria');
        }
      }
    }

    // Strategy 3: text content matching
    const interactiveTags = ['button', 'a', 'input[type="submit"]', 'input[type="button"]'];
    for (const tagSelector of interactiveTags) {
      const elements = Array.from(document.querySelectorAll(tagSelector));
      for (const el of elements) {
        const text = (el.textContent || '').trim().toLowerCase();
        if (!text) continue;

        for (const keyword of allKeywords) {
          if (text.includes(keyword.toLowerCase())) {
            const sel = buildUniqueSelector(el);
            addCandidate(el, sel, 'semantic');
            break;
          }
        }
      }
    }

    // Strategy 4: form role matching
    if (params.event_name === 'add_to_cart' || params.event_name === 'begin_checkout') {
      const forms = Array.from(document.querySelectorAll('form[action*="cart"], form[action*="checkout"]'));
      for (const form of forms) {
        const submitBtn = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
        if (submitBtn) {
          const sel = buildUniqueSelector(submitBtn);
          addCandidate(submitBtn, sel, 'form_role');
        }
      }
    }

    // Strategy 5: class/id heuristic
    for (const pattern of params.class_patterns) {
      // Try class selector
      const classEls = Array.from(document.querySelectorAll(`[class*="${pattern}"]`));
      for (const el of classEls) {
        // Only interactive elements
        const tag = el.tagName.toLowerCase();
        if (['button', 'a', 'input'].includes(tag) || el.getAttribute('role') === 'button') {
          const sel = buildUniqueSelector(el);
          addCandidate(el, sel, 'heuristic');
        }
      }

      // Try id selector
      const idEls = Array.from(document.querySelectorAll(`[id*="${pattern}"]`));
      for (const el of idEls) {
        const tag = el.tagName.toLowerCase();
        if (['button', 'a', 'input'].includes(tag) || el.getAttribute('role') === 'button') {
          addCandidate(el, `#${CSS.escape(el.id)}`, 'heuristic');
        }
      }
    }

    return results;
  }, searchParams);

  // confidence 점수 계산 및 SelectorCandidate 변환
  let candidates: SelectorCandidate[] = rawCandidates.map(raw => ({
    selector: raw.selector,
    text_content: raw.text_content,
    tag_name: raw.tag_name,
    match_count: raw.match_count,
    confidence: calculateConfidence(raw.method, raw.match_count),
    discovery_method: raw.method as SelectorDiscoveryMethod,
  }));

  // 4. 위치 기반 필터링 (TesterInsight)
  if (insight?.element_location && insight.element_location !== 'unknown') {
    const beforeCount = candidates.length;
    candidates = await filterByLocation(page, candidates, insight.element_location);
    if (candidates.length < beforeCount) {
      console.log(`      위치 필터링 (${insight.element_location}): ${beforeCount} → ${candidates.length}개`);
    }
  }

  // 5. Shopify 표준 form 사용 시 form_role 전략 우선
  if (insight?.uses_standard_form === true) {
    candidates = boostFormRoleCandidates(candidates);
  }

  // 신뢰도 내림차순 정렬
  candidates.sort((a, b) => b.confidence - a.confidence);

  // 상위 10개만 반환
  return candidates.slice(0, 10);
}

/**
 * 발견 방법과 매칭 수에 따른 신뢰도 계산
 */
function calculateConfidence(method: string, matchCount: number): number {
  // 기본 점수: 발견 방법에 따라
  const baseScores: Record<string, number> = {
    data_attr: 0.90,
    aria: 0.85,
    form_role: 0.80,
    semantic: 0.75,
    text_match: 0.70,
    heuristic: 0.55,
    manual: 1.0,
  };

  let score = baseScores[method] ?? 0.5;

  // 매칭 수 보정: 1개면 최적, 많을수록 감점
  if (matchCount === 1) {
    score += 0.05; // 유일한 요소 보너스
  } else if (matchCount > 10) {
    score -= 0.15; // 너무 많은 매칭 감점
  } else if (matchCount > 3) {
    score -= 0.05; // 약간 감점
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * 특정 이벤트에 대해 검색 힌트가 있는지 확인
 */
export function hasSearchHint(eventName: string): boolean {
  return eventName in EVENT_DOM_KEYWORDS;
}

// ─────────────────────────────────────────────────────────────────────
// TesterInsight 기반 필터링/실행 헬퍼
// ─────────────────────────────────────────────────────────────────────

/**
 * 멀티스텝 플로우의 전제조건 액션을 실행합니다.
 */
async function executePrerequisiteActions(
  page: Page,
  actions: PrerequisiteAction[],
): Promise<void> {
  for (const action of actions) {
    try {
      switch (action.action_type) {
        case 'click':
          if (action.selector) {
            const selectors = action.selector.split(', ');
            let clicked = false;
            for (const sel of selectors) {
              const el = page.locator(sel.trim()).first();
              const isVisible = await el.isVisible({ timeout: 3000 }).catch(() => false);
              if (isVisible) {
                await el.click({ timeout: 5000 });
                clicked = true;
                console.log(`        전제조건 실행: ${action.description} (${sel.trim()})`);
                break;
              }
            }
            if (!clicked) {
              console.log(`        전제조건 스킵 (셀렉터 미발견): ${action.description}`);
            }
          }
          break;

        case 'wait':
          await page.waitForTimeout(action.wait_ms ?? 2000);
          console.log(`        전제조건 실행: ${action.description} (${action.wait_ms ?? 2000}ms 대기)`);
          break;

        case 'navigate':
          if (action.url) {
            const baseUrl = new URL(page.url()).origin;
            const targetUrl = action.url.startsWith('http') ? action.url : `${baseUrl}${action.url}`;
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            console.log(`        전제조건 실행: ${action.description} (${targetUrl})`);
          }
          break;

        case 'scroll':
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
          console.log(`        전제조건 실행: ${action.description}`);
          break;
      }

      // 액션 간 짧은 대기
      if (action.action_type !== 'wait') {
        await page.waitForTimeout(500);
      }
    } catch (e) {
      console.log(`        전제조건 실패: ${action.description} - ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

/**
 * 위치 기반 필터링.
 * 헤더 영역의 요소를 제외하거나, 특정 위치의 요소만 포함합니다.
 */
async function filterByLocation(
  page: Page,
  candidates: SelectorCandidate[],
  targetLocation: string,
): Promise<SelectorCandidate[]> {
  if (candidates.length === 0) return candidates;

  // 각 후보의 DOM 위치를 확인
  const locationResults = await page.evaluate(
    (selectors: string[]) => {
      return selectors.map(sel => {
        try {
          const el = document.querySelector(sel);
          if (!el) return { selector: sel, location: 'unknown' };

          // 헤더 내부인지 확인
          const isInHeader = !!el.closest('header, [role="banner"], .header, #header, .site-header');
          if (isInHeader) return { selector: sel, location: 'header' };

          // 모달/드로어 내부인지 확인
          const isInModal = !!el.closest('[role="dialog"], .modal, .drawer, [class*="drawer"], [class*="modal"]');
          if (isInModal) return { selector: sel, location: 'modal' };

          // 푸터 내부인지 확인
          const isInFooter = !!el.closest('footer, [role="contentinfo"], .footer, #footer');
          if (isInFooter) return { selector: sel, location: 'footer' };

          // 사이드바 내부인지 확인
          const isInSidebar = !!el.closest('aside, .sidebar, [role="complementary"]');
          if (isInSidebar) return { selector: sel, location: 'sidebar' };

          // form 내부인지 확인
          const isInForm = !!el.closest('form[action*="cart"], .product-form, [data-product-form]');
          if (isInForm) return { selector: sel, location: 'product_form' };

          return { selector: sel, location: 'main_content' };
        } catch {
          return { selector: sel, location: 'unknown' };
        }
      });
    },
    candidates.map(c => c.selector),
  );

  // 위치별 매핑
  const locationMap = new Map<string, string>();
  for (const result of locationResults) {
    locationMap.set(result.selector, result.location);
  }

  // 필터링 전략
  return candidates.filter(c => {
    const elemLocation = locationMap.get(c.selector) ?? 'unknown';

    switch (targetLocation) {
      case 'product_form':
        // 상품 폼 내부: 헤더/푸터 제외
        return elemLocation !== 'header' && elemLocation !== 'footer';
      case 'main_content':
        // 메인 콘텐츠: 헤더/푸터/사이드바 제외
        return elemLocation !== 'header' && elemLocation !== 'footer' && elemLocation !== 'sidebar';
      case 'cart_drawer':
        // 카트 드로어: 모달/드로어 내부 또는 메인 콘텐츠 (전제조건 실행 후)
        return elemLocation === 'modal' || elemLocation === 'main_content' || elemLocation === 'unknown';
      case 'cart_page':
        return elemLocation !== 'header' && elemLocation !== 'footer';
      case 'header':
        return elemLocation === 'header';
      default:
        return true;
    }
  });
}

/**
 * form_role 발견 방법의 후보 신뢰도를 부스트합니다.
 * Shopify 표준 form submit 사용 시 적용.
 */
function boostFormRoleCandidates(candidates: SelectorCandidate[]): SelectorCandidate[] {
  return candidates.map(c => {
    if (c.discovery_method === 'form_role') {
      return { ...c, confidence: Math.min(0.95, c.confidence + 0.1) };
    }
    return c;
  });
}
