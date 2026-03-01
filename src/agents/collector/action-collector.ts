/**
 * Action Collector - 시나리오 기반 이벤트 수집 (액션 시뮬레이션)
 *
 * Phase 1의 event-collector.ts 네트워크 인터셉트를 재사용하면서
 * 사용자 액션 시뮬레이션을 추가하여 이벤트를 수집합니다.
 *
 * 수집 흐름:
 * 1. Stealth 브라우저 실행
 * 2. 시나리오별 루프:
 *    a. 네트워크 인터셉터 설정 (parseGA4Request 재사용)
 *    b. 페이지 네비게이션 → auto_fire 이벤트 캡처
 *    c. content_group 실제값 확인
 *    d. 시나리오의 user_action 실행
 *    e. 각 액션 후 캡처된 이벤트 분리
 * 3. ScenarioCollectedData 반환
 */

import type { Browser, Page } from 'playwright';
import {
  launchStealthBrowser,
  createStealthContext,
  type CollectorConfig,
} from './browser-collector';
import { setupGA4Interceptor, getContentGroup, waitForExpectedEvents } from './ga4-interceptor';
import type {
  ScenarioDefinition,
  UserAction,
} from '../../types/event-scenario';
import type { PageTypeEnum } from '../../types/common';

// Re-export shared types for backward compatibility
export type {
  ScenarioCollectedData,
  ActionCollectionResult,
} from '../../types/collected-data';

import type {
  ScenarioCollectedData,
  ActionCollectionResult,
} from '../../types/collected-data';

// ─────────────────────────────────────────────────────────────────────
// Types (local only)
// ─────────────────────────────────────────────────────────────────────

export interface ActionCollectorOptions {
  /** 기본 이벤트 캡처 대기 시간 (ms) */
  waitMs?: number;
  /** 액션 전후 스크린샷 */
  screenshotOnAction?: boolean;
  /** 액션 실패 시 건너뛰기 */
  skipActionOnError?: boolean;
}

// setupGA4Interceptor, getContentGroup는 ga4-interceptor.ts에서 import


// ─────────────────────────────────────────────────────────────────────
// Popup Overlay Dismissal
// ─────────────────────────────────────────────────────────────────────

/**
 * Shopify 사이트의 팝업 오버레이를 제거
 * pop-convert-app 등 pointer event를 가로채는 요소를 DOM에서 완전 제거
 */
async function dismissPopupOverlays(page: Page): Promise<void> {
  await page.evaluate(() => {
    // pop-convert-app: 완전 제거 (style 변경만으로는 부족 - 재생성됨)
    const popConvert = document.getElementById('pop-convert-app');
    if (popConvert) {
      popConvert.remove();
    }
    // needsclick 클래스를 가진 pop-convert 요소도 제거
    document.querySelectorAll('.needsclick[id*="pop-convert"]').forEach(el => el.remove());

    // Shopify 카트 드로어 강제 닫기 (add_to_cart 후 열려있으면 다른 액션 차단)
    const cartDrawer = document.getElementById('CartDrawer');
    if (cartDrawer) {
      cartDrawer.removeAttribute('open');
      cartDrawer.classList.remove('is-open', 'active', 'animate', 'drawer--is-open');
      cartDrawer.setAttribute('aria-hidden', 'true');
      cartDrawer.style.display = 'none';
    }
    // 카트 드로어 오버레이/백드롭 제거
    document.querySelectorAll('.drawer__overlay, .cart-drawer__overlay').forEach(el => {
      (el as HTMLElement).style.display = 'none';
    });
    // body scroll 잠금 해제 (드로어가 body에 overflow: hidden 적용하는 경우)
    document.body.classList.remove('overflow-hidden', 'js-drawer-open', 'drawer-open');
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';

    // Quick-add 모달: 이미 열려있는 것만 닫기 (display:none은 하지 않음 - 새로 열 때 방해됨)
    document.querySelectorAll('quick-add-modal[open], [id*="QuickAdd"][open]').forEach(el => {
      (el as HTMLElement).removeAttribute('open');
      (el as HTMLElement).classList.remove('is-open', 'active');
    });

    // 일반적인 팝업 오버레이 패턴
    const overlaySelectors = [
      '.popup-overlay',
      '.modal-backdrop',
      '[class*="popup"][class*="overlay"]',
      '[id*="popup"][id*="overlay"]',
    ];
    for (const sel of overlaySelectors) {
      const els = document.querySelectorAll<HTMLElement>(sel);
      els.forEach(el => {
        if (el.style.position === 'fixed' || getComputedStyle(el).position === 'fixed') {
          el.remove();
        }
      });
    }
  });
}

/**
 * 페이지에 MutationObserver를 설치하여 pop-convert-app이 재생성되면 자동 제거.
 * 페이지 네비게이션마다 호출해야 함.
 */
async function installOverlayKiller(page: Page): Promise<void> {
  await page.evaluate(() => {
    // 이미 설치된 경우 스킵
    if ((window as any).__overlayKillerInstalled) return;
    (window as any).__overlayKillerInstalled = true;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        Array.from(mutation.addedNodes).forEach(node => {
          if (node instanceof HTMLElement) {
            if (node.id === 'pop-convert-app' || node.classList?.contains('needsclick')) {
              node.remove();
            }
          }
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // 기존 요소도 즉시 제거
    const existing = document.getElementById('pop-convert-app');
    if (existing) existing.remove();
  });
}

// ─────────────────────────────────────────────────────────────────────
// Action Executor
// ─────────────────────────────────────────────────────────────────────

async function executePrerequisiteSteps(
  page: Page,
  steps: NonNullable<UserAction['prerequisite_actions']>,
): Promise<void> {
  for (const step of steps) {
    // 매 스텝 전 팝업 제거
    await dismissPopupOverlays(page);

    switch (step.action_type) {
      case 'click':
        if (step.selector) {
          const selectors = step.selector.split(',').map(s => s.trim());
          let clicked = false;
          for (const sel of selectors) {
            if (clicked) break;
            try {
              const el = page.locator(sel).first();
              const count = await el.count().catch(() => 0);
              if (count > 0) {
                // 1차: visible 요소 직접 클릭 (전제조건은 빠른 실패 필요 → timeout 짧게)
                const isVisible = await el.isVisible({ timeout: 2000 }).catch(() => false);
                if (isVisible) {
                  try {
                    await el.scrollIntoViewIfNeeded();
                    // noWaitAfter: 모달/드로어 열기 같은 비동기 작업에서 navigation 대기 방지
                    await el.click({ timeout: 3000, noWaitAfter: true });
                    clicked = true;
                    break;
                  } catch {
                    // native click 실패 시 force click으로 폴백
                    try {
                      await el.click({ force: true, timeout: 3000, noWaitAfter: true });
                      clicked = true;
                      break;
                    } catch { /* fall through */ }
                  }
                } else {
                  // 2차: invisible 요소 force click
                  try {
                    await el.click({ force: true, timeout: 3000, noWaitAfter: true });
                    clicked = true;
                    break;
                  } catch { /* fall through */ }
                }
              }
              // 3차: page.evaluate() 로 visible 요소 클릭
              const evalClicked = await page.evaluate((s) => {
                const els = Array.from(document.querySelectorAll(s));
                for (let i = 0; i < els.length; i++) {
                  const h = els[i] as HTMLElement;
                  if (h.offsetParent !== null || h.getClientRects().length > 0) {
                    h.scrollIntoView({ block: 'center' });
                    h.click();
                    return true;
                  }
                }
                if (els.length > 0) {
                  (els[0] as HTMLElement).click();
                  return true;
                }
                return false;
              }, sel);
              if (evalClicked) {
                clicked = true;
                break;
              }
            } catch {
              continue;
            }
          }
          if (!clicked) {
            throw new Error(`전제조건 클릭 실패: ${step.selector} (${step.description})`);
          }
        }
        break;
      case 'wait':
        await page.waitForTimeout(step.wait_ms ?? 1000);
        break;
      case 'navigate':
        if (step.url) {
          await page.goto(step.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await installOverlayKiller(page);
        }
        break;
      case 'hover':
        if (step.selector) {
          const selectors = step.selector.split(',').map(s => s.trim());
          let hovered = false;
          for (const sel of selectors) {
            try {
              const el = page.locator(sel).first();
              const count = await el.count().catch(() => 0);
              if (count === 0) continue;
              await el.scrollIntoViewIfNeeded();
              await el.hover({ timeout: 5000 });
              hovered = true;
              break;
            } catch {
              continue;
            }
          }
          if (!hovered) {
            // fallback: page.evaluate로 visible 요소에 마우스 이벤트 발생
            const allSelectors = step.selector.split(',').map(s => s.trim());
            await page.evaluate((sels) => {
              for (let si = 0; si < sels.length; si++) {
                const els = Array.from(document.querySelectorAll(sels[si]));
                for (let ei = 0; ei < els.length; ei++) {
                  const h = els[ei] as HTMLElement;
                  if (h.offsetParent !== null || h.getClientRects().length > 0) {
                    h.scrollIntoView({ block: 'center' });
                    h.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                    h.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                    return;
                  }
                }
              }
              // 첫 번째 요소에라도 이벤트 발생
              const fallback = document.querySelector(sels[0]);
              if (fallback) {
                fallback.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                fallback.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
              }
            }, allSelectors);
          }
          // hover 후 요소 출현 대기
          await page.waitForTimeout(step.wait_ms ?? 500);
        }
        break;
      case 'scroll':
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        break;
    }
  }
}

/**
 * begin_checkout 전에 카트가 비어있으면 /cart/add API로 상품 추가.
 * 카트에 상품이 없으면 checkout 버튼이 비활성화되거나 begin_checkout 이벤트가 발화하지 않음.
 */
async function ensureCartHasItems(page: Page): Promise<void> {
  const cartEmpty = await page.evaluate(async () => {
    try {
      const res = await fetch('/cart.js');
      const cart = await res.json();
      return cart.item_count === 0;
    } catch {
      return true; // 에러 시 비어있다고 가정
    }
  });
  if (cartEmpty) {
    // 페이지에서 첫 번째 상품 variant ID를 찾아서 카트에 추가
    const added = await page.evaluate(async () => {
      // 1차: product JSON에서 variant ID 추출
      try {
        const productLinks = Array.from(document.querySelectorAll('a[href*="/products/"]'));
        for (let i = 0; i < productLinks.length; i++) {
          const href = (productLinks[i] as HTMLAnchorElement).href;
          if (!href.includes('/products/')) continue;
          const productUrl = href.split('?')[0] + '.js';
          try {
            const res = await fetch(productUrl);
            const product = await res.json();
            if (product.variants && product.variants.length > 0) {
              const variantId = product.variants[0].id;
              const addRes = await fetch('/cart/add.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: [{ id: variantId, quantity: 1 }] }),
              });
              return addRes.ok;
            }
          } catch { continue; }
        }
      } catch { /* fall through */ }
      return false;
    });
    if (added) {
      // 카트 추가 후 잠시 대기 (GTM 이벤트 처리)
      await page.waitForTimeout(1000);
    }
  }
}

async function executeAction(page: Page, action: UserAction): Promise<void> {
  // 팝업 오버레이 제거 (액션 전 매번 실행)
  await dismissPopupOverlays(page);

  // 전제조건 액션 실행 (멀티스텝 플로우)
  if (action.prerequisite_actions && action.prerequisite_actions.length > 0) {
    await dismissPopupOverlays(page);
    await executePrerequisiteSteps(page, action.prerequisite_actions);
  }

  const actionType = action.action_type;

  switch (actionType) {
    case 'page_load':
      // 이미 로드됨 (auto_fire에서 처리)
      break;

    case 'scroll':
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      break;

    case 'click':
      if (!action.target_selector) {
        throw new Error(
          `target_selector 미정의: [${action.action_type}] ${action.description || ''} ` +
          `(Site Recon 실행 또는 수동 셀렉터 입력 필요)`,
        );
      }
      {
        // 팝업 오버레이 제거 (매 클릭 액션 전)
        await dismissPopupOverlays(page);

        // 여러 셀렉터가 쉼표로 구분된 경우 첫 번째 매칭 요소 사용
        const selectors = action.target_selector.split(',').map(s => s.trim());
        let clicked = false;
        for (const selector of selectors) {
          if (clicked) break;
          try {
            // 0차: 속성 셀렉터인 경우 waitForSelector로 동적 로딩 대기
            const isAttrSelector = /^\[[\w-]+\]$/.test(selector);
            if (isAttrSelector) {
              await page.waitForSelector(selector, { state: 'attached', timeout: 8000 }).catch(() => null);
            }

            // 1차: Playwright native click (trusted event → form submit 정상 동작)
            // hasText 필터 제거: icon-only 버튼(SVG, 카트 아이콘)도 매칭
            const element = page.locator(selector).first();
            const count = await element.count().catch(() => 0);
            if (count > 0) {
              const isVis = await element.isVisible({ timeout: 2000 }).catch(() => false);
              if (isVis) {
                try {
                  await element.scrollIntoViewIfNeeded();
                  // noWaitAfter: 모달/드로어 열기 등 비동기 작업에서 navigation 대기 방지
                  await element.click({ timeout: 5000, noWaitAfter: true });
                  clicked = true;
                  break;
                } catch { /* fall through */ }
              }

              // 2차: force click (DOM에 존재하지만 Playwright 기준 invisible)
              try {
                await element.click({ force: true, timeout: 5000, noWaitAfter: true });
                clicked = true;
                break;
              } catch { /* fall through to page.evaluate */ }
            }

            // 3차: page.evaluate()로 VISIBLE 요소 찾아서 클릭
            // form submit 버튼이면 requestSubmit()으로 폼 제출 (Shopify add-to-cart 등)
            const evalClicked = await page.evaluate((sel) => {
              const els = Array.from(document.querySelectorAll(sel));
              for (let i = 0; i < els.length; i++) {
                const htmlEl = els[i] as HTMLElement;
                const isVis = htmlEl.offsetParent !== null
                  || htmlEl.getClientRects().length > 0
                  || getComputedStyle(htmlEl).display !== 'none';
                if (isVis) {
                  htmlEl.scrollIntoView({ block: 'center' });
                  // form submit 버튼이면 requestSubmit()으로 폼 제출
                  const form = htmlEl.closest('form');
                  if (form && htmlEl instanceof HTMLButtonElement && htmlEl.type === 'submit') {
                    try {
                      form.requestSubmit(htmlEl);
                      return true;
                    } catch {
                      htmlEl.click();
                      return true;
                    }
                  }
                  htmlEl.click();
                  return true;
                }
              }
              // 모든 요소가 hidden이면 첫 번째라도 클릭 시도
              if (els.length > 0) {
                const first = els[0] as HTMLElement;
                const form = first.closest('form');
                if (form && first instanceof HTMLButtonElement && first.type === 'submit') {
                  try { form.requestSubmit(first); return true; } catch { /* fall through */ }
                }
                first.click();
                return true;
              }
              return false;
            }, selector);
            if (evalClicked) {
              clicked = true;
              break;
            }
          } catch {
            continue;
          }
        }
        if (!clicked) {
          throw new Error(`클릭 대상을 찾을 수 없습니다: ${action.target_selector}`);
        }
      }
      break;

    case 'submit':
      if (!action.target_selector) {
        throw new Error(
          `target_selector 미정의: [${action.action_type}] ${action.description || ''} ` +
          `(Site Recon 실행 또는 수동 셀렉터 입력 필요)`,
        );
      }
      await page.click(action.target_selector, { force: true, timeout: 5000 });
      break;

    case 'view':
      if (action.target_selector) {
        const selectors = action.target_selector.split(',').map(s => s.trim());
        for (const selector of selectors) {
          try {
            const element = page.locator(selector).first();
            if (await element.isVisible({ timeout: 3000 }).catch(() => false)) {
              await element.scrollIntoViewIfNeeded();
              break;
            }
          } catch {
            continue;
          }
        }
      }
      break;

    case 'input':
      if (!action.target_selector) {
        throw new Error(
          `target_selector 미정의: [${action.action_type}] ${action.description || ''} ` +
          `(Site Recon 실행 또는 수동 셀렉터 입력 필요)`,
        );
      }
      if (action.action_data?.value) {
        await page.fill(action.target_selector, String(action.action_data.value));
      }
      break;

    case 'hover':
      if (!action.target_selector) {
        throw new Error(
          `target_selector 미정의: [${action.action_type}] ${action.description || ''} ` +
          `(Site Recon 실행 또는 수동 셀렉터 입력 필요)`,
        );
      }
      await page.hover(action.target_selector, { timeout: 5000 });
      break;

    case 'select':
      if (!action.target_selector) {
        throw new Error(
          `target_selector 미정의: [${action.action_type}] ${action.description || ''} ` +
          `(Site Recon 실행 또는 수동 셀렉터 입력 필요)`,
        );
      }
      if (action.action_data?.value) {
        await page.selectOption(action.target_selector, String(action.action_data.value));
      }
      break;

    case 'navigate_back':
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 });
      break;

    case 'custom':
      // Custom actions - just wait
      break;
  }

  // 액션 후 이벤트 캡처 대기
  await page.waitForTimeout(action.wait_after_ms ?? 3000);
}

// getContentGroup는 ga4-interceptor.ts에서 import

// ─────────────────────────────────────────────────────────────────────
// Scenario Collection (URL 그룹별)
// ─────────────────────────────────────────────────────────────────────

interface URLScenarioGroup {
  url: string;
  page_type: PageTypeEnum;
  scenarios: ScenarioDefinition[];
}

/**
 * 이벤트 실행 우선순위: add_to_cart → begin_checkout 순서 보장
 * (begin_checkout은 카트에 상품이 있어야 동작하므로 add_to_cart가 먼저 실행되어야 함)
 */
const EVENT_EXECUTION_PRIORITY: Record<string, number> = {
  'page_view': 0,
  'view_item_list': 1,
  'view_item': 1,
  'view_promotion': 1,
  'add_to_cart': 2,       // 카트에 상품 추가 (select_item 전에 실행 - PLP 페이지 유지 필요)
  'select_promotion': 3,
  'select_item': 4,       // 상품 클릭 → PDP 이동 (페이지 이탈 발생!)
  'remove_from_cart': 5,
  'begin_checkout': 6,    // 카트에 상품이 있어야 동작
  'write_review': 7,
  'ap_click': 99,         // 마지막: 링크 클릭으로 페이지 이탈 가능
};

function getEventPriority(scenario: ScenarioDefinition): number {
  const eventName = scenario.expected_events[0]?.event_name ?? '';
  return EVENT_EXECUTION_PRIORITY[eventName] ?? 5;
}

function groupScenariosByURL(scenarios: ScenarioDefinition[]): URLScenarioGroup[] {
  const urlMap = new Map<string, URLScenarioGroup>();

  for (const scenario of scenarios) {
    const url = scenario.test_urls?.[0] || scenario.page_url_pattern || '';
    if (!url) continue;

    if (!urlMap.has(url)) {
      urlMap.set(url, {
        url,
        page_type: scenario.page_type,
        scenarios: [],
      });
    }
    urlMap.get(url)!.scenarios.push(scenario);
  }

  // URL 그룹 내에서 이벤트 실행 우선순위로 정렬
  // add_to_cart → begin_checkout 순서 보장 (카트에 상품이 있어야 checkout 동작)
  for (const group of urlMap.values()) {
    group.scenarios.sort((a, b) => getEventPriority(a) - getEventPriority(b));
  }

  return Array.from(urlMap.values());
}

// ─────────────────────────────────────────────────────────────────────
// Main Collection Function
// ─────────────────────────────────────────────────────────────────────

export async function collectEventsWithActions(
  scenarios: ScenarioDefinition[],
  config: CollectorConfig,
  options?: ActionCollectorOptions,
): Promise<ScenarioCollectedData[]> {
  const results: ScenarioCollectedData[] = [];
  const waitMs = options?.waitMs ?? 5000;
  const skipOnError = options?.skipActionOnError ?? true;

  let browser: Browser | null = null;

  try {
    browser = await launchStealthBrowser({ headless: config.headless });
    const context = await createStealthContext(browser, config);

    // URL별 시나리오 그룹화
    const urlGroups = groupScenariosByURL(scenarios);
    const totalGroups = urlGroups.length;

    for (let gi = 0; gi < urlGroups.length; gi++) {
      const group = urlGroups[gi];
      const progress = Math.round(((gi + 1) / totalGroups) * 100);
      const bar = '\u2588'.repeat(Math.floor(progress / 5)) + '\u2591'.repeat(20 - Math.floor(progress / 5));
      console.log(`  [${gi + 1}/${totalGroups}] ${bar} ${progress}% | ${group.url}`);

      const page: Page = await context.newPage();
      const startTime = Date.now();
      const errors: string[] = [];

      try {
        // 네트워크 인터셉터 설정
        const allCaptured = setupGA4Interceptor(page);

        // 페이지 네비게이션: domcontentloaded로 빠르게 진입
        // networkidle는 광고/분석 스크립트가 많은 페이지에서 타임아웃 발생
        await page.goto(group.url, {
          waitUntil: 'domcontentloaded',
          timeout: config.timeout_ms,
        });

        // window.onload 대기 (GTM WINDOW_LOADED 트리거에 필요)
        // view_promotion은 DOM_READY, view_promotion_detail은 WINDOW_LOADED에서 발화
        await page.waitForLoadState('load').catch(() => {});

        // 팝업 오버레이 제거 (pop-convert-app 등)
        await dismissPopupOverlays(page);
        await installOverlayKiller(page);

        // 이 URL 그룹에서 예상되는 auto-fire 이벤트명 추출
        const expectedAutoFireEvents = [
          ...new Set(
            group.scenarios
              .filter(s => !s.user_action) // auto-fire 시나리오만
              .flatMap(s => s.expected_events.map(e => e.ga4_event_name))
          ),
        ];

        // 스마트 대기: 예상 이벤트가 모두 캡처되면 즉시 다음으로 이동
        const waitResult = await waitForExpectedEvents(page, allCaptured, expectedAutoFireEvents, {
          maxWaitMs: Math.max(waitMs, 10000),
          minWaitMs: 3000,
          pollIntervalMs: 500,
        });

        if (waitResult.allFound) {
          console.log(`    ✅ 모든 예상 이벤트 캡처 완료 (${(waitResult.waitedMs / 1000).toFixed(1)}s)`);
        } else {
          console.log(`    ⏳ 대기 종료 (${(waitResult.waitedMs / 1000).toFixed(1)}s) | 미캡처: [${waitResult.missingEvents.join(', ')}]`);
        }

        // Content Group 확인
        const actualContentGroup = await getContentGroup(page);

        // auto_fire 이벤트 = 현재까지 캡처된 이벤트
        const autoFireEvents = [...allCaptured];

        // 시나리오별 처리
        for (const scenario of group.scenarios) {
          const actionResults: ActionCollectionResult[] = [];

          // user_action이 있는 시나리오 → 액션 실행
          if (scenario.user_action) {
            const action = scenario.user_action;

            // begin_checkout 시나리오: 카트에 상품이 있어야 동작
            const eventName = scenario.expected_events[0]?.event_name ?? '';
            if (eventName === 'begin_checkout') {
              await ensureCartHasItems(page);
            }

            // add_to_cart: /cart/add 응답 대기 리스너 사전 설정
            // GA4 이벤트는 /cart/add AJAX 응답 후에 발화하므로, 응답을 기다려야 캡처 가능
            let cartResponsePromise: Promise<any> | null = null;
            if (eventName === 'add_to_cart') {
              cartResponsePromise = page.waitForResponse(
                resp => (resp.url().includes('/cart/add') || resp.url().includes('/cart/change'))
                  && resp.status() < 400,
                { timeout: 8000 },
              ).catch(() => null);
            }

            // select_item / click_with_duration: 링크 클릭 시 페이지 이탈 방지
            // a 태그 클릭 → 네비게이션이 시작되면 GA4 beacon이 소실됨
            // preventDefault()로 네비게이션만 차단 (stopPropagation 하지 않음 → GTM 클릭 리스너 정상 동작)
            const needsNavIntercept = (eventName === 'select_item' || eventName === 'click_with_duration') && action.target_selector;
            if (needsNavIntercept && action.target_selector) {
              const selectorArg = action.target_selector;
              await page.evaluate((selectors: string) => {
                const sels = selectors.split(',').map(s => s.trim());
                for (const sel of sels) {
                  const els = document.querySelectorAll(sel);
                  els.forEach(el => {
                    el.addEventListener('click', (e) => {
                      e.preventDefault();
                      // stopPropagation 하지 않음: GTM의 click listener가 이벤트를 감지해야 함
                    }, { once: true, capture: false });
                  });
                }
              }, selectorArg);
            }

            const beforeCount = allCaptured.length;
            const actionStart = Date.now();

            try {
              await executeAction(page, action);

              // select_item / click_with_duration: GA4 /g/collect 요청 대기 (링크 네비게이션 차단했으므로 페이지 유지)
              if (eventName === 'select_item' || eventName === 'click_with_duration') {
                try {
                  await page.waitForResponse(
                    r => r.url().includes('/g/collect'),
                    { timeout: 5000 },
                  );
                  await page.waitForTimeout(1000);
                } catch { /* GA4 요청 타임아웃 → 이벤트 미발화 */ }
              }

              // add_to_cart: /cart/add 응답 기반 스마트 대기
              if (eventName === 'add_to_cart' && cartResponsePromise) {
                const resp = await cartResponsePromise;
                if (resp) {
                  // /cart/add 응답 수신 → GTM 'addcart' dataLayer push → GA4 발화 대기
                  await page.waitForTimeout(4000);
                } else {
                  // /cart/add 응답 없음 → form.requestSubmit() 폴백 시도
                  // 원인: 네이티브 클릭이 form submit을 트리거하지 못한 경우
                  const fallbackSubmitted = await page.evaluate(() => {
                    // PDP: form[action*="/cart/add"] 내부 submit 버튼
                    const forms = document.querySelectorAll('form[action*="/cart/add"]');
                    for (let i = 0; i < forms.length; i++) {
                      const form = forms[i] as HTMLFormElement;
                      const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
                      if (btn) {
                        try { form.requestSubmit(btn); return 'requestSubmit'; }
                        catch { btn.click(); return 'click'; }
                      }
                    }
                    // PLP 모달: quick-add-modal 내부 form
                    const modalForms = document.querySelectorAll(
                      'quick-add-modal form[action*="/cart/add"], [id*="QuickAdd"] form[action*="/cart/add"]',
                    );
                    for (let i = 0; i < modalForms.length; i++) {
                      const form = modalForms[i] as HTMLFormElement;
                      const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
                      if (btn) {
                        try { form.requestSubmit(btn); return 'modal-requestSubmit'; }
                        catch { btn.click(); return 'modal-click'; }
                      }
                    }
                    return null;
                  });
                  if (fallbackSubmitted) {
                    // 폴백 form submit 후 /cart/add 응답 + GA4 대기
                    try {
                      await page.waitForResponse(
                        r => (r.url().includes('/cart/add') || r.url().includes('/cart/change'))
                          && r.status() < 400,
                        { timeout: 5000 },
                      );
                      await page.waitForTimeout(4000);
                    } catch { /* 응답 없음 - GA4도 발화하지 않음 */ }
                  }
                }
              }

              // add_to_cart 완료 후: 페이지 리로드로 깨끗한 DOM 상태 복구
              // Shopify 카트 드로어가 /cart/add 응답 후 JS로 자동 열리며,
              // z-index:110 fixed 포지션으로 상품 카드 링크를 완전히 가림
              // → select_item native 클릭 실패 → GTM click trigger 미발화
              // 리로드하면 DOM은 초기화되지만 카트 세션은 유지됨 (begin_checkout 정상 동작)
              if (eventName === 'add_to_cart') {
                await page.goto(group.url, {
                  waitUntil: 'domcontentloaded',
                  timeout: config.timeout_ms,
                });
                await page.waitForLoadState('load').catch(() => {});
                await dismissPopupOverlays(page);
                await installOverlayKiller(page);
              }

              const newEvents = allCaptured.slice(beforeCount);

              actionResults.push({
                action,
                success: true,
                events_captured: newEvents,
                duration_ms: Date.now() - actionStart,
              });
            } catch (e) {
              const errMsg = e instanceof Error ? e.message : String(e);
              errors.push(`액션 실패 [${action.action_type}]: ${errMsg}`);
              actionResults.push({
                action,
                success: false,
                events_captured: [],
                error_message: errMsg,
                duration_ms: Date.now() - actionStart,
              });

              if (!skipOnError) {
                throw e;
              }
            }
          }

          results.push({
            scenario_id: scenario.scenario_id,
            url: group.url,
            page_type: group.page_type,
            channel: config.channel,
            action_id: scenario.channel_action_ids?.[config.channel] ?? '',
            auto_fire_events: scenario.user_action ? [] : autoFireEvents,
            action_results: actionResults,
            all_events: [...allCaptured],
            actual_content_group: actualContentGroup,
            errors: [...errors],
            collection_duration_ms: Date.now() - startTime,
          });

          // 페이지 이탈 복구: 액션 후 URL이 변경되면 원래 URL로 복귀
          // (begin_checkout → checkout 페이지 이동 후 ap_click 실행 불가 방지)
          if (scenario.user_action) {
            try {
              const currentUrl = page.url();
              const originalHost = new URL(group.url).hostname;
              const currentHost = new URL(currentUrl).hostname;
              const originalPath = new URL(group.url).pathname;
              const currentPath = new URL(currentUrl).pathname;
              if (currentHost === originalHost && currentPath !== originalPath) {
                await page.goto(group.url, {
                  waitUntil: 'domcontentloaded',
                  timeout: config.timeout_ms,
                });
                await page.waitForLoadState('load').catch(() => {});
                await dismissPopupOverlays(page);
                await installOverlayKiller(page);
              }
            } catch { /* 복구 실패 시 무시 */ }
          }
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        errors.push(`페이지 수집 실패: ${errMsg}`);

        // 실패한 시나리오들에 대해 빈 결과 생성
        for (const scenario of group.scenarios) {
          if (!results.some(r => r.scenario_id === scenario.scenario_id)) {
            results.push({
              scenario_id: scenario.scenario_id,
              url: group.url,
              page_type: group.page_type,
              channel: config.channel,
              action_id: scenario.channel_action_ids?.[config.channel] ?? '',
              auto_fire_events: [],
              action_results: [],
              all_events: [],
              errors: [...errors],
              collection_duration_ms: Date.now() - startTime,
            });
          }
        }
      } finally {
        await page.close();
      }
    }

    await context.close();
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return results;
}
