/**
 * dataLayer 실시간 캡처 시스템
 *
 * Playwright를 사용하여 페이지의 dataLayer.push() 이벤트를 실시간으로 캡처합니다.
 * Vision AI 예측 값과 실제 GA4 전송 값을 비교하는 데 사용됩니다.
 */

import { Page } from 'playwright';
import { DataLayerEvent, DataLayerItem } from '../types/parameterPrediction';

// ═══════════════════════════════════════════════════════════════════════════
// Window 타입 확장 (TypeScript용)
// ═══════════════════════════════════════════════════════════════════════════

declare global {
  interface Window {
    __capturedDataLayer: Array<{
      timestamp: number;
      data: unknown[];
    }>;
    __originalDataLayerPush?: (...args: unknown[]) => number;
    dataLayer?: unknown[];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// dataLayer 캡처 클래스
// ═══════════════════════════════════════════════════════════════════════════

export class DataLayerCapture {
  private page: Page | null = null;
  private isInitialized = false;

  /**
   * 페이지에 dataLayer 캡처 스크립트를 주입합니다.
   * 페이지 로드 전에 호출해야 합니다.
   */
  async initialize(page: Page): Promise<void> {
    this.page = page;

    // 페이지 로드 전에 dataLayer 캡처 설정
    await page.addInitScript(() => {
      // 캡처 배열 초기화
      window.__capturedDataLayer = [];

      // dataLayer가 이미 존재하면 기존 이벤트 캡처
      if (window.dataLayer && Array.isArray(window.dataLayer)) {
        window.dataLayer.forEach((item, index) => {
          window.__capturedDataLayer.push({
            timestamp: Date.now() - (window.dataLayer!.length - index) * 100, // 순서 보정
            data: [JSON.parse(JSON.stringify(item))]
          });
        });
      }

      // dataLayer 배열 초기화 (없는 경우)
      window.dataLayer = window.dataLayer || [];

      // 원본 push 메소드 저장
      const originalPush = Array.prototype.push;

      // push 메소드 오버라이드
      window.dataLayer.push = function(...args: unknown[]): number {
        // 캡처
        window.__capturedDataLayer.push({
          timestamp: Date.now(),
          data: args.map(arg => {
            try {
              return JSON.parse(JSON.stringify(arg));
            } catch {
              return arg;
            }
          })
        });

        // 원본 push 호출
        return originalPush.apply(this, args);
      };

      // 콘솔 로그 (디버깅용)
      console.log('[DataLayerCapture] Initialized');
    });

    this.isInitialized = true;
  }

  /**
   * 페이지 로드 후 dataLayer 캡처를 재설정합니다.
   * 페이지 이동 후 호출해야 합니다.
   */
  async reinitialize(): Promise<void> {
    if (!this.page) {
      throw new Error('DataLayerCapture not initialized with page');
    }

    await this.page.evaluate(() => {
      // 캡처 배열 초기화
      window.__capturedDataLayer = window.__capturedDataLayer || [];

      // 기존 dataLayer 내용 캡처
      if (window.dataLayer && Array.isArray(window.dataLayer)) {
        window.dataLayer.forEach((item, index) => {
          // 이미 캡처된 항목인지 확인
          const alreadyCaptured = window.__capturedDataLayer.some(
            captured => JSON.stringify(captured.data[0]) === JSON.stringify(item)
          );

          if (!alreadyCaptured) {
            window.__capturedDataLayer.push({
              timestamp: Date.now() - (window.dataLayer!.length - index) * 100,
              data: [JSON.parse(JSON.stringify(item))]
            });
          }
        });
      }

      // push 메소드가 오버라이드 되지 않았다면 다시 설정
      if (!window.__originalDataLayerPush && window.dataLayer) {
        const originalPush = Array.prototype.push;
        window.__originalDataLayerPush = window.dataLayer.push;

        window.dataLayer.push = function(...args: unknown[]): number {
          window.__capturedDataLayer.push({
            timestamp: Date.now(),
            data: args.map(arg => {
              try {
                return JSON.parse(JSON.stringify(arg));
              } catch {
                return arg;
              }
            })
          });
          return originalPush.apply(this, args);
        };
      }
    });
  }

  /**
   * 캡처된 모든 dataLayer 이벤트를 가져옵니다.
   */
  async getCapturedEvents(): Promise<DataLayerEvent[]> {
    if (!this.page) {
      throw new Error('DataLayerCapture not initialized with page');
    }

    const raw = await this.page.evaluate(() => {
      return window.__capturedDataLayer || [];
    });

    return raw.map(item => this.parseDataLayerItem(item));
  }

  /**
   * 특정 이벤트 이름에 해당하는 이벤트만 가져옵니다.
   */
  async getEventsByName(eventName: string): Promise<DataLayerEvent[]> {
    const all = await this.getCapturedEvents();
    return all.filter(e => e.event === eventName);
  }

  /**
   * 가장 최근 이벤트를 가져옵니다.
   */
  async getLatestEvent(): Promise<DataLayerEvent | null> {
    const all = await this.getCapturedEvents();
    return all.length > 0 ? all[all.length - 1] : null;
  }

  /**
   * 특정 이벤트 이름의 가장 최근 이벤트를 가져옵니다.
   */
  async getLatestEventByName(eventName: string): Promise<DataLayerEvent | null> {
    const events = await this.getEventsByName(eventName);
    return events.length > 0 ? events[events.length - 1] : null;
  }

  /**
   * 액션 실행 전후의 새 이벤트를 캡처합니다.
   */
  async captureOnAction(
    action: () => Promise<void>,
    waitTime: number = 500
  ): Promise<DataLayerEvent[]> {
    const before = await this.getCapturedEvents();
    const beforeCount = before.length;

    await action();

    // 이벤트 발생 대기
    await this.page?.waitForTimeout(waitTime);

    const after = await this.getCapturedEvents();
    return after.slice(beforeCount);
  }

  /**
   * 특정 이벤트가 발생할 때까지 대기합니다.
   */
  async waitForEvent(
    eventName: string,
    timeout: number = 5000
  ): Promise<DataLayerEvent | null> {
    if (!this.page) {
      throw new Error('DataLayerCapture not initialized with page');
    }

    const startTime = Date.now();
    const startCount = (await this.getEventsByName(eventName)).length;

    while (Date.now() - startTime < timeout) {
      const events = await this.getEventsByName(eventName);
      if (events.length > startCount) {
        return events[events.length - 1];
      }
      await this.page.waitForTimeout(100);
    }

    return null;
  }

  /**
   * 캡처 기록을 초기화합니다.
   */
  async clear(): Promise<void> {
    if (!this.page) {
      throw new Error('DataLayerCapture not initialized with page');
    }

    await this.page.evaluate(() => {
      window.__capturedDataLayer = [];
    });
  }

  /**
   * 현재 dataLayer의 전체 내용을 가져옵니다 (캡처된 것이 아닌 실제 dataLayer).
   */
  async getCurrentDataLayer(): Promise<unknown[]> {
    if (!this.page) {
      throw new Error('DataLayerCapture not initialized with page');
    }

    return await this.page.evaluate(() => {
      try {
        return JSON.parse(JSON.stringify(window.dataLayer || []));
      } catch {
        return [];
      }
    });
  }

  /**
   * ecommerce 이벤트만 필터링합니다.
   */
  async getEcommerceEvents(): Promise<DataLayerEvent[]> {
    const all = await this.getCapturedEvents();
    return all.filter(e => e.ecommerce !== undefined);
  }

  /**
   * Raw dataLayer 아이템을 파싱하여 구조화된 형태로 변환합니다.
   */
  private parseDataLayerItem(raw: { timestamp: number; data: unknown[] }): DataLayerEvent {
    const data = raw.data[0] as Record<string, unknown> || {};

    const event: DataLayerEvent = {
      timestamp: raw.timestamp,
      event: data.event as string | undefined,
      data: data,
    };

    // ecommerce 객체 파싱
    if (data.ecommerce) {
      const ecom = data.ecommerce as Record<string, unknown>;
      event.ecommerce = {
        items: this.parseItems(ecom.items),
        currency: ecom.currency as string | undefined,
        value: ecom.value as number | undefined,
        promotion_id: ecom.promotion_id as string | undefined,
        promotion_name: ecom.promotion_name as string | undefined,
        ...ecom
      };
    }

    return event;
  }

  /**
   * items 배열을 파싱합니다.
   */
  private parseItems(items: unknown): DataLayerItem[] | undefined {
    if (!Array.isArray(items)) {
      return undefined;
    }

    return items.map(item => {
      const i = item as Record<string, unknown>;
      return {
        item_name: i.item_name as string | undefined,
        item_id: i.item_id as string | undefined,
        item_brand: i.item_brand as string | undefined,
        item_category: i.item_category as string | undefined,
        price: i.price as number | undefined,
        quantity: i.quantity as number | undefined,
        item_variant: i.item_variant as string | undefined,
        coupon: i.coupon as string | undefined,
        discount: i.discount as number | undefined,
        index: i.index as number | undefined,
        item_list_id: i.item_list_id as string | undefined,
        item_list_name: i.item_list_name as string | undefined,
        ...i
      } as DataLayerItem;
    });
  }

  /**
   * 디버깅용: 캡처된 이벤트를 콘솔에 출력합니다.
   */
  async printCapturedEvents(): Promise<void> {
    const events = await this.getCapturedEvents();

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`📊 Captured dataLayer Events (${events.length}개)`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    events.forEach((event, index) => {
      console.log(`[${index + 1}] ${event.event || '(no event name)'}`);
      console.log(`    Timestamp: ${new Date(event.timestamp).toISOString()}`);

      if (event.ecommerce) {
        console.log('    Ecommerce:');
        if (event.ecommerce.currency) {
          console.log(`      currency: ${event.ecommerce.currency}`);
        }
        if (event.ecommerce.value !== undefined) {
          console.log(`      value: ${event.ecommerce.value}`);
        }
        if (event.ecommerce.items && event.ecommerce.items.length > 0) {
          console.log(`      items (${event.ecommerce.items.length}개):`);
          event.ecommerce.items.forEach((item, i) => {
            console.log(`        [${i}] ${item.item_name || '(no name)'}`);
            if (item.item_id) console.log(`            id: ${item.item_id}`);
            if (item.price !== undefined) console.log(`            price: ${item.price}`);
            if (item.item_brand) console.log(`            brand: ${item.item_brand}`);
          });
        }
      }
      console.log('');
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 헬퍼 함수
// ═══════════════════════════════════════════════════════════════════════════

/**
 * dataLayer 이벤트에서 특정 파라미터 값을 추출합니다.
 */
export function extractParameterValue(
  event: DataLayerEvent,
  parameterName: string
): unknown {
  // 최상위 레벨에서 찾기
  if (parameterName in event.data) {
    return event.data[parameterName];
  }

  // ecommerce 레벨에서 찾기
  if (event.ecommerce && parameterName in event.ecommerce) {
    return (event.ecommerce as Record<string, unknown>)[parameterName];
  }

  // items[0]에서 찾기 (단일 아이템 이벤트)
  if (event.ecommerce?.items?.[0]) {
    const item = event.ecommerce.items[0] as Record<string, unknown>;
    if (parameterName in item) {
      return item[parameterName];
    }
  }

  return undefined;
}

/**
 * dataLayer 이벤트에서 모든 아이템의 특정 파라미터 값을 추출합니다.
 */
export function extractItemParameterValues(
  event: DataLayerEvent,
  parameterName: string
): unknown[] {
  if (!event.ecommerce?.items) {
    return [];
  }

  return event.ecommerce.items.map(item => {
    const i = item as Record<string, unknown>;
    return i[parameterName];
  }).filter(v => v !== undefined);
}

/**
 * 두 dataLayer 이벤트의 특정 파라미터를 비교합니다.
 */
export function compareEventParameters(
  event1: DataLayerEvent,
  event2: DataLayerEvent,
  parameterNames: string[]
): { parameter: string; value1: unknown; value2: unknown; match: boolean }[] {
  return parameterNames.map(param => {
    const value1 = extractParameterValue(event1, param);
    const value2 = extractParameterValue(event2, param);

    return {
      parameter: param,
      value1,
      value2,
      match: JSON.stringify(value1) === JSON.stringify(value2)
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 전역변수 캡처 인터페이스
// ═══════════════════════════════════════════════════════════════════════════

export interface GlobalVariableCapture {
  productInfo?: Record<string, unknown>;
  digitalData?: Record<string, unknown>;
  pageData?: Record<string, unknown>;
  ecommerceData?: Record<string, unknown>;
  customVariables: Record<string, unknown>;
}

/**
 * 페이지의 전역 JavaScript 변수에서 상품 데이터를 캡처합니다.
 * GTM의 "JS -" 변수들이 참조하는 데이터 소스입니다.
 */
export async function captureGlobalVariables(page: Page): Promise<GlobalVariableCapture> {
  return await page.evaluate(() => {
    const result: GlobalVariableCapture = {
      customVariables: {},
    };

    // 일반적인 전역변수 패턴
    const win = window as unknown as Record<string, unknown>;

    // productInfo 계열
    const productInfoKeys = ['productInfo', 'product_info', 'productData', 'product_data', 'pdInfo'];
    for (const key of productInfoKeys) {
      if (win[key]) {
        result.productInfo = JSON.parse(JSON.stringify(win[key]));
        break;
      }
    }

    // digitalData (Adobe Analytics 호환)
    if (win.digitalData) {
      result.digitalData = JSON.parse(JSON.stringify(win.digitalData));
    }

    // pageData 계열
    const pageDataKeys = ['pageData', 'page_data', 'pageInfo'];
    for (const key of pageDataKeys) {
      if (win[key]) {
        result.pageData = JSON.parse(JSON.stringify(win[key]));
        break;
      }
    }

    // ecommerce 계열
    const ecommerceKeys = ['ecommerceData', 'ecommerce_data', 'ecData'];
    for (const key of ecommerceKeys) {
      if (win[key]) {
        result.ecommerceData = JSON.parse(JSON.stringify(win[key]));
        break;
      }
    }

    // amoremall 전용 변수 (GTM 분석 기반)
    const amoremallKeys = [
      'AP',              // 아모레퍼시픽 글로벌 객체
      'AP_PRODUCT',      // 상품 정보
      'AP_PAGE',         // 페이지 정보
      '__NUXT__',        // Nuxt.js 상태 (SSR 데이터)
      '__NEXT_DATA__',   // Next.js 상태
      'gtmData',         // GTM 전용 데이터
      'ga4Data',         // GA4 전용 데이터
    ];

    for (const key of amoremallKeys) {
      if (win[key]) {
        try {
          result.customVariables[key] = JSON.parse(JSON.stringify(win[key]));
        } catch {
          result.customVariables[key] = `[Circular or non-serializable: ${typeof win[key]}]`;
        }
      }
    }

    // AP 객체에서 상품 상세 데이터 추출 (아모레몰 전용)
    if (win.AP) {
      const AP = win.AP as Record<string, unknown>;
      if (AP.productDetail) {
        const pd = AP.productDetail as Record<string, unknown>;
        // _defaultModel에서 상품 정보 추출
        if (pd._defaultModel) {
          result.customVariables['AP_productDetail_defaultModel'] = JSON.parse(JSON.stringify(pd._defaultModel));
        }
        // 기타 유용한 필드
        const usefulFields = ['productInfo', 'product', 'item', 'price', 'brand', 'category'];
        for (const field of usefulFields) {
          if (pd[field]) {
            try {
              result.customVariables[`AP_productDetail_${field}`] = JSON.parse(JSON.stringify(pd[field]));
            } catch { /* ignore */ }
          }
        }
      }
    }

    // __NEXT_DATA__에서 상품 데이터 추출 (Next.js SSR)
    if (win.__NEXT_DATA__) {
      const nextData = win.__NEXT_DATA__ as Record<string, unknown>;
      if (nextData.props) {
        const props = nextData.props as Record<string, unknown>;
        if (props.pageProps) {
          const pageProps = props.pageProps as Record<string, unknown>;
          // initialState에서 상품 정보 찾기
          if (pageProps.initialState) {
            try {
              const initialState = typeof pageProps.initialState === 'string'
                ? JSON.parse(pageProps.initialState)
                : pageProps.initialState;
              result.customVariables['NEXT_initialState'] = initialState;
            } catch { /* ignore */ }
          }
          // product 또는 productDetail 필드
          const productFields = ['product', 'productDetail', 'item', 'data'];
          for (const field of productFields) {
            if (pageProps[field]) {
              try {
                result.customVariables[`NEXT_pageProps_${field}`] = JSON.parse(JSON.stringify(pageProps[field]));
              } catch { /* ignore */ }
            }
          }
        }
      }
    }

    // dataLayer에서 ecommerce 관련 항목 추출
    if (win.dataLayer && Array.isArray(win.dataLayer)) {
      const ecommerceItems = (win.dataLayer as unknown[]).filter((item: unknown) => {
        if (typeof item === 'object' && item !== null) {
          const obj = item as Record<string, unknown>;
          return obj.ecommerce || obj.items || obj.event === 'product';
        }
        return false;
      });

      if (ecommerceItems.length > 0) {
        result.customVariables['dataLayerEcommerce'] = JSON.parse(JSON.stringify(ecommerceItems));
      }
    }

    return result;
  });
}

/**
 * 상품 상세 페이지에서 상품 정보를 DOM에서 직접 추출합니다.
 */
export async function extractProductFromDOM(page: Page): Promise<Record<string, unknown> | null> {
  return await page.evaluate(() => {
    const result: Record<string, unknown> = {};

    // JSON-LD 스키마에서 추출 (SEO 데이터)
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (let i = 0; i < jsonLdScripts.length; i++) {
      const script = jsonLdScripts[i];
      try {
        const data = JSON.parse(script.textContent || '');
        if (data['@type'] === 'Product') {
          result.jsonLd = data;
          break;
        }
      } catch {
        // ignore parse errors
      }
    }

    // meta 태그에서 추출
    const metaTags = {
      'og:title': 'item_name',
      'product:price:amount': 'price',
      'product:price:currency': 'currency',
      'product:brand': 'item_brand',
      'product:category': 'item_category',
    };

    for (const [property, field] of Object.entries(metaTags)) {
      const meta = document.querySelector(`meta[property="${property}"]`);
      if (meta) {
        result[field] = meta.getAttribute('content');
      }
    }

    // data 속성에서 추출
    const productElement = document.querySelector('[data-product-id], [data-item-id], [ap-prd-id]');
    if (productElement) {
      result.productId = productElement.getAttribute('data-product-id')
        || productElement.getAttribute('data-item-id')
        || productElement.getAttribute('ap-prd-id');
    }

    return Object.keys(result).length > 0 ? result : null;
  });
}

// 기본 인스턴스 export
export const dataLayerCapture = new DataLayerCapture();
