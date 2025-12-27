/**
 * Page Context Extractor
 *
 * Playwright 페이지에서 동적 값을 추출하여 파라미터 예측 정확도를 향상시킵니다.
 * - dataLayer에서 ecommerce 데이터 추출
 * - 전역 변수에서 페이지 타입 및 상품/이벤트 정보 추출
 * - DOM에서 페이지 제목 등 추출
 */

import { Page } from 'playwright';

/**
 * 추출된 페이지 컨텍스트
 */
export interface ExtractedPageContext {
  /** 실제 AP_DATA_PAGETYPE 값 */
  actualPageType?: string;

  /** 상품 정보 (상품 상세 페이지용) */
  productId?: string;
  productName?: string;
  productPrice?: number;
  productBrand?: string;
  productCategory?: string;

  /** 프로모션 정보 (이벤트/프로모션 상세 페이지용) */
  promotionId?: string;
  promotionName?: string;
  creativeName?: string;

  /** 라이브 정보 (라이브 상세 페이지용) */
  liveTitle?: string;
  liveId?: string;

  /** 검색 정보 (검색 결과 페이지용) */
  searchTerm?: string;

  /** 페이지 제목 */
  pageTitle?: string;

  /** 원본 dataLayer (디버깅용) */
  rawDataLayer?: any[];
}

/**
 * Playwright 페이지에서 컨텍스트 추출
 */
export async function extractPageContext(page: Page): Promise<ExtractedPageContext> {
  try {
    const extracted = await page.evaluate(() => {
      const result: any = {};

      // 1. 전역 변수에서 추출
      const globalVars: Record<string, string[]> = {
        'actualPageType': ['AP_DATA_PAGETYPE', 'AP_PAGE_TYPE', 'pageType', 'PAGE_TYPE'],
        'productId': ['AP_PRODUCT_ID', 'AP_DATA_PRODUCT_ID', 'product_id', 'productId'],
        'productName': ['AP_PRODUCT_NAME', 'AP_DATA_PRODUCT_NAME', 'product_name', 'productName'],
        'productBrand': ['AP_BRAND_NAME', 'AP_DATA_BRAND_NAME', 'brand_name', 'brandName'],
        'promotionId': ['AP_PROMOTION_ID', 'AP_EVENT_ID', 'promotion_id', 'eventId'],
        'promotionName': ['AP_PROMOTION_NAME', 'AP_EVENT_NAME', 'promotion_name', 'eventName'],
        'searchTerm': ['AP_SEARCH_KEYWORD', 'AP_DATA_SEARCH_TERM', 'search_term', 'searchKeyword'],
      };

      for (const [key, varNames] of Object.entries(globalVars)) {
        for (const varName of varNames) {
          // @ts-ignore
          const value = window[varName];
          if (value !== undefined && value !== null && value !== '') {
            result[key] = String(value);
            break;
          }
        }
      }

      // 2. dataLayer에서 추출
      // @ts-ignore
      if (window.dataLayer && Array.isArray(window.dataLayer)) {
        // @ts-ignore
        const dataLayer: any[] = window.dataLayer;

        // 최근 dataLayer 항목을 역순으로 검색
        for (let i = dataLayer.length - 1; i >= 0; i--) {
          const item = dataLayer[i];
          if (!item) continue;

          // ecommerce 데이터에서 상품 정보 추출
          if (item.ecommerce) {
            const ecom = item.ecommerce;

            // items 배열에서 첫 번째 상품 정보
            if (ecom.items && Array.isArray(ecom.items) && ecom.items.length > 0) {
              const firstItem = ecom.items[0];
              if (!result.productId && firstItem.item_id) {
                result.productId = String(firstItem.item_id);
              }
              if (!result.productName && firstItem.item_name) {
                result.productName = String(firstItem.item_name);
              }
              if (!result.productPrice && firstItem.price) {
                result.productPrice = Number(firstItem.price);
              }
              if (!result.productBrand && firstItem.item_brand) {
                result.productBrand = String(firstItem.item_brand);
              }
              if (!result.productCategory && firstItem.item_category) {
                result.productCategory = String(firstItem.item_category);
              }
            }

            // 프로모션 정보
            if (ecom.promotion_name && !result.promotionName) {
              result.promotionName = String(ecom.promotion_name);
            }
            if (ecom.promotion_id && !result.promotionId) {
              result.promotionId = String(ecom.promotion_id);
            }
            if (ecom.creative_name && !result.creativeName) {
              result.creativeName = String(ecom.creative_name);
            }
          }

          // 라이브 정보 추출
          if (item.event === 'live' || item.live_title || item.liveTitle) {
            if (!result.liveTitle) {
              result.liveTitle = item.live_title || item.liveTitle || item.title;
            }
            if (!result.liveId && (item.live_id || item.liveId)) {
              result.liveId = String(item.live_id || item.liveId);
            }
          }

          // view_promotion_detail 이벤트에서 프로모션 정보
          if (item.event === 'view_promotion_detail') {
            if (!result.promotionName && item.event_label) {
              result.promotionName = String(item.event_label);
            }
          }
        }

        // 최근 10개 항목 저장 (디버깅용)
        result.rawDataLayer = dataLayer.slice(-10);
      }

      // 3. DOM에서 추출
      result.pageTitle = document.title;

      // 상품 상세 페이지에서 상품명 추출
      if (!result.productName) {
        const productNameEl = document.querySelector(
          '[class*="product-name"], [class*="product_name"], [class*="productName"], ' +
          '[class*="item-name"], [class*="item_name"], h1[class*="title"], ' +
          '.pdp-name, .goods-name, .product-title'
        );
        if (productNameEl) {
          result.productName = productNameEl.textContent?.trim();
        }
      }

      // 이벤트 상세 페이지에서 제목 추출
      if (!result.promotionName) {
        const promotionNameEl = document.querySelector(
          '[class*="event-title"], [class*="promotion-title"], ' +
          '[class*="event-name"], [class*="promotion-name"], ' +
          '.event-detail-title, h1.title'
        );
        if (promotionNameEl) {
          result.promotionName = promotionNameEl.textContent?.trim();
        }
      }

      // 라이브 상세 페이지에서 제목 추출
      if (!result.liveTitle) {
        const liveTitleEl = document.querySelector(
          '[class*="live-title"], [class*="live-name"], ' +
          '.live-detail-title, .live-info-title'
        );
        if (liveTitleEl) {
          result.liveTitle = liveTitleEl.textContent?.trim();
        }
      }

      return result;
    });

    return extracted as ExtractedPageContext;
  } catch (error: any) {
    console.warn(`페이지 컨텍스트 추출 실패: ${error.message}`);
    return {};
  }
}

/**
 * 추출된 컨텍스트를 ParameterValuePredictor용 pageContext로 변환
 */
export function toPageContext(extracted: ExtractedPageContext): {
  productId?: string;
  productName?: string;
  promotionName?: string;
  searchTerm?: string;
  liveTitle?: string;
  actualPageType?: string;
} {
  return {
    productId: extracted.productId,
    productName: extracted.productName,
    promotionName: extracted.promotionName,
    searchTerm: extracted.searchTerm,
    liveTitle: extracted.liveTitle,
    actualPageType: extracted.actualPageType,
  };
}
