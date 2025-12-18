/**
 * Funnel Consistency Test
 *
 * view_item → add_to_cart 플로우에서 모든 item 파라미터 일관성 검증
 * 실제 사이트의 dataLayer를 캡처하여 검증
 */

import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import {
  DataLayerCapture,
} from './capture/dataLayerCapture';
import {
  DataLayerEvent,
  ECOMMERCE_FUNNEL_ORDER,
} from './types/parameterPrediction';
import {
  FunnelConsistencyValidator,
} from './validation/parameterValidator';

// ═══════════════════════════════════════════════════════════════════════════
// 테스트 설정
// ═══════════════════════════════════════════════════════════════════════════

interface FunnelTestConfig {
  name: string;
  productUrl: string;
  addToCartSelector: string;
  waitAfterClick?: number;
  waitForManualAction?: boolean;
}

const TEST_CONFIGS: FunnelTestConfig[] = [
  {
    name: '아모레몰 상품',
    productUrl: 'https://www.amoremall.com/kr/ko/product/detail?onlineProdSn=65121&onlineProdCode=111170002462',
    addToCartSelector: 'button:has-text("장바구니"), button:has-text("카트담기"), [class*="btnCart"], [class*="add-cart"]',
    waitAfterClick: 3000,
    waitForManualAction: true,  // 수동 클릭 대기 옵션
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// 메인 테스트 클래스
// ═══════════════════════════════════════════════════════════════════════════

class FunnelConsistencyTest {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private dataLayerCapture: DataLayerCapture | null = null;
  private funnelValidator: FunnelConsistencyValidator;
  private outputDir: string;
  private capturedRawEvents: any[] = [];

  constructor() {
    this.funnelValidator = new FunnelConsistencyValidator();
    this.outputDir = path.join(process.cwd(), 'output', 'funnel-consistency');
  }

  async initialize(): Promise<void> {
    console.log('\n🚀 브라우저 초기화 중...');

    // 출력 디렉토리 생성
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    this.browser = await chromium.launch({
      headless: false,
      args: ['--start-maximized']
    });

    const context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    this.page = await context.newPage();
    this.dataLayerCapture = new DataLayerCapture();
    await this.dataLayerCapture.initialize(this.page);

    console.log('✅ 초기화 완료\n');
  }

  /**
   * 직접 dataLayer에서 ecommerce 이벤트를 가져옵니다.
   */
  private async getRawDataLayerEvents(): Promise<any[]> {
    if (!this.page) return [];

    return await this.page.evaluate(() => {
      const dl = (window as any).dataLayer || [];
      return dl.filter((item: any) => {
        // ecommerce 이벤트 필터링
        if (item.ecommerce) return true;
        if (item.event && ['view_item', 'add_to_cart', 'begin_checkout', 'purchase',
                          'select_item', 'view_cart', 'remove_from_cart'].includes(item.event)) {
          return true;
        }
        // items 배열이 있는 이벤트
        if (item.items && Array.isArray(item.items)) return true;
        return false;
      });
    });
  }

  /**
   * dataLayer 이벤트를 DataLayerEvent 형식으로 변환합니다.
   */
  private convertToDataLayerEvent(raw: any): DataLayerEvent {
    // ecommerce.items 또는 items 추출
    let items = raw.ecommerce?.items || raw.items || [];

    // GA4 ecommerce 구조인 경우
    if (raw.ecommerce && !raw.ecommerce.items) {
      // detail, add, purchase 등 하위 구조 확인
      for (const key of ['detail', 'add', 'purchase', 'checkout', 'impressions']) {
        if (raw.ecommerce[key]?.products) {
          items = raw.ecommerce[key].products;
          break;
        }
      }
    }

    return {
      timestamp: Date.now(),
      event: raw.event || 'unknown',
      data: raw,
      ecommerce: {
        items: items,
        currency: raw.ecommerce?.currency || raw.currency,
        value: raw.ecommerce?.value || raw.value,
      }
    };
  }

  async runFunnelTest(config: FunnelTestConfig): Promise<any> {
    if (!this.page || !this.dataLayerCapture) {
      throw new Error('브라우저가 초기화되지 않았습니다.');
    }

    const timestamp = Date.now();

    console.log('═'.repeat(70));
    console.log(`🔄 Funnel Consistency Test: ${config.name}`);
    console.log('   (모든 item 파라미터 검증)');
    console.log('═'.repeat(70));
    console.log(`\n📍 퍼널 순서: view_item → add_to_cart\n`);

    // Step 1: view_item (상품 상세 페이지 방문)
    console.log('━'.repeat(50));
    console.log('📌 Step 1: view_item (상품 상세 페이지)');
    console.log('━'.repeat(50));
    console.log(`   URL: ${config.productUrl}`);

    await this.page.goto(config.productUrl, { waitUntil: 'networkidle' });
    await this.page.waitForTimeout(3000);

    // 스크린샷 저장
    const screenshotPath1 = path.join(this.outputDir, `step1_view_item_${timestamp}.png`);
    await this.page.screenshot({ path: screenshotPath1, fullPage: false });
    console.log(`   📸 스크린샷: ${screenshotPath1}`);

    // dataLayer에서 ecommerce 이벤트 캡처
    const viewItemRawEvents = await this.getRawDataLayerEvents();
    console.log(`   🔍 dataLayer ecommerce 이벤트: ${viewItemRawEvents.length}개`);

    // 이벤트 상세 출력 및 추가
    for (const raw of viewItemRawEvents) {
      const event = this.convertToDataLayerEvent(raw);
      // view_item으로 태깅 (이벤트명이 없거나 다른 경우)
      if (!event.event || event.event === 'unknown') {
        event.event = 'view_item';
      }
      this.funnelValidator.addEvent(event);
      this.capturedRawEvents.push({ step: 'view_item', raw, converted: event });
      this.printEventDetails(event, 'view_item');
    }

    // Step 2: add_to_cart (장바구니 추가)
    console.log('\n' + '━'.repeat(50));
    console.log('📌 Step 2: add_to_cart (장바구니 추가)');
    console.log('━'.repeat(50));

    // 장바구니 클릭 전 dataLayer 상태 기록
    const beforeClickCount = (await this.getRawDataLayerEvents()).length;

    if (config.waitForManualAction) {
      console.log('   💡 장바구니 버튼을 수동으로 클릭해 주세요.');
      console.log('   ⏳ 15초 대기 중... (클릭 후 이벤트 캡처)');
      await this.page.waitForTimeout(15000);
    } else {
      // 자동 클릭 시도
      const addToCartButton = await this.findAddToCartButton(config.addToCartSelector);
      if (addToCartButton) {
        console.log('   🛒 장바구니 버튼 발견, 클릭 중...');
        try {
          await addToCartButton.click();
          await this.page.waitForTimeout(config.waitAfterClick || 3000);
        } catch (error) {
          console.log(`   ⚠️ 자동 클릭 실패, 수동 클릭 대기...`);
          await this.page.waitForTimeout(10000);
        }
      } else {
        console.log('   ⚠️ 장바구니 버튼을 찾을 수 없습니다. 수동 클릭 대기...');
        await this.page.waitForTimeout(10000);
      }
    }

    // 스크린샷 저장
    const screenshotPath2 = path.join(this.outputDir, `step2_add_to_cart_${timestamp}.png`);
    await this.page.screenshot({ path: screenshotPath2, fullPage: false });
    console.log(`   📸 스크린샷: ${screenshotPath2}`);

    // add_to_cart 후 새로운 이벤트 캡처
    const afterClickEvents = await this.getRawDataLayerEvents();
    const newEvents = afterClickEvents.slice(beforeClickCount);
    console.log(`   🔍 새로 발생한 ecommerce 이벤트: ${newEvents.length}개`);

    // add_to_cart 이벤트 필터링 및 추가
    for (const raw of afterClickEvents) {
      // add_to_cart 관련 이벤트만 필터
      const eventName = raw.event?.toLowerCase() || '';
      if (eventName.includes('cart') || eventName.includes('add') ||
          eventName === 'add_to_cart' || eventName === 'addtocart') {
        const event = this.convertToDataLayerEvent(raw);
        event.event = 'add_to_cart';
        this.funnelValidator.addEvent(event);
        this.capturedRawEvents.push({ step: 'add_to_cart', raw, converted: event });
        this.printEventDetails(event, 'add_to_cart');
      }
    }

    // Step 3: 퍼널 일관성 검증 (모든 파라미터)
    console.log('\n' + '━'.repeat(50));
    console.log('📌 Step 3: 퍼널 일관성 검증 (모든 item 파라미터)');
    console.log('━'.repeat(50));

    // 확장된 검증 실행
    const extendedResult = this.funnelValidator.validateAllParams();
    this.funnelValidator.printExtendedReport(extendedResult);

    // 결과 저장
    const resultPath = path.join(this.outputDir, `funnel_report_extended_${timestamp}.json`);
    const fullResult = {
      config,
      timestamp: new Date().toISOString(),
      capturedEvents: this.capturedRawEvents,
      validation: extendedResult,
    };
    fs.writeFileSync(resultPath, JSON.stringify(fullResult, null, 2));
    console.log(`\n💾 결과 저장: ${resultPath}`);

    return extendedResult;
  }

  /**
   * 이벤트 상세 정보를 출력합니다.
   */
  private printEventDetails(event: DataLayerEvent, step: string): void {
    const items = event.ecommerce?.items || [];
    console.log(`\n   📊 [${step}] event: ${event.event}`);

    if (items.length > 0) {
      console.log(`      items (${items.length}개):`);
      for (let i = 0; i < Math.min(items.length, 2); i++) {
        const item = items[i];
        const params = Object.entries(item)
          .filter(([k, v]) => v !== undefined && v !== null)
          .map(([k, v]) => `${k}=${JSON.stringify(v).substring(0, 30)}`);
        console.log(`      [${i}] ${params.slice(0, 5).join(', ')}${params.length > 5 ? '...' : ''}`);
      }
    } else {
      console.log(`      ⚠️ items 배열 없음`);
    }
  }

  private async captureEcommerceEvents(targetEvent: string): Promise<DataLayerEvent[]> {
    if (!this.dataLayerCapture) return [];

    const allEvents = await this.dataLayerCapture.getCapturedEvents();
    console.log(`   📋 전체 dataLayer 이벤트 수: ${allEvents.length}개`);

    // 디버그: 모든 이벤트 이름 출력
    const eventNames = allEvents.map(e => e.event || e.data?.event || '(no event name)');
    const uniqueNames = [...new Set(eventNames)];
    console.log(`   📋 캡처된 이벤트 종류: ${uniqueNames.slice(0, 10).join(', ')}${uniqueNames.length > 10 ? '...' : ''}`);

    // 특정 이벤트 또는 ecommerce 이벤트 필터링
    const filtered = allEvents.filter(event => {
      const eventName = event.event || event.data?.event;
      const hasEcommerce = event.ecommerce || event.data?.ecommerce;

      // 정확한 이벤트 이름 매칭
      if (eventName === targetEvent) return true;

      // 이벤트 이름에 target이 포함된 경우
      if (eventName && String(eventName).toLowerCase().includes(targetEvent.toLowerCase())) return true;

      // ecommerce 데이터가 있는 모든 이벤트 (targetEvent가 포함된 경우만)
      if (hasEcommerce) {
        const ecomItems = event.ecommerce?.items || (event.data?.ecommerce as any)?.items;
        if (ecomItems && Array.isArray(ecomItems) && ecomItems.length > 0) {
          // view_item이나 add_to_cart 관련 이벤트인 경우
          if (targetEvent === 'view_item' || targetEvent === 'add_to_cart') {
            return true;
          }
        }
      }

      // items 배열이 있는 이벤트 (data 안에)
      const items = event.data?.items;
      if (items && Array.isArray(items) && items.length > 0) {
        return true;
      }

      return false;
    });

    console.log(`   📋 필터링 후 ${targetEvent} 관련 이벤트: ${filtered.length}개`);
    return filtered;
  }

  private async findAddToCartButton(selector: string): Promise<any> {
    if (!this.page) return null;

    // 여러 선택자 시도
    const selectors = selector.split(',').map(s => s.trim());

    for (const sel of selectors) {
      try {
        const button = await this.page.$(sel);
        if (button) {
          const isVisible = await button.isVisible();
          if (isVisible) return button;
        }
      } catch (e) {
        // 선택자 실패, 다음 시도
      }
    }

    // 텍스트 기반 검색
    const textPatterns = ['장바구니', '카트에 담기', 'Add to Cart', 'ADD TO CART', '담기'];

    for (const text of textPatterns) {
      try {
        const button = await this.page.$(`button:has-text("${text}")`);
        if (button) {
          const isVisible = await button.isVisible();
          if (isVisible) return button;
        }
      } catch (e) {
        // 실패, 다음 시도
      }
    }

    // 클래스 기반 검색
    const classPatterns = ['btn-cart', 'add-cart', 'addCart', 'cart-btn'];

    for (const cls of classPatterns) {
      try {
        const button = await this.page.$(`[class*="${cls}"]`);
        if (button) {
          const isVisible = await button.isVisible();
          if (isVisible) return button;
        }
      } catch (e) {
        // 실패
      }
    }

    return null;
  }

  private printEventSummary(event: DataLayerEvent): void {
    const eventName = event.event || event.data?.event || 'unknown';
    const items = event.ecommerce?.items || event.data?.items || [];

    console.log(`\n   📊 이벤트: ${eventName}`);

    if (Array.isArray(items) && items.length > 0) {
      console.log(`   📦 Items (${items.length}개):`);
      for (let i = 0; i < Math.min(items.length, 3); i++) {
        const item = items[i];
        console.log(`      [${i}] item_name: ${item.item_name || '(없음)'}`);
        console.log(`          item_id: ${item.item_id || '(없음)'}`);
        console.log(`          price: ${item.price || '(없음)'}`);
      }
      if (items.length > 3) {
        console.log(`      ... 외 ${items.length - 3}개`);
      }
    }
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 메인 실행
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║          Funnel Consistency Test                               ║');
  console.log('║          view_item → add_to_cart 일관성 검증                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const test = new FunnelConsistencyTest();

  try {
    await test.initialize();

    for (const config of TEST_CONFIGS) {
      const report = await test.runFunnelTest(config);

      console.log('\n' + '═'.repeat(70));
      console.log('📈 최종 결과 요약');
      console.log('═'.repeat(70));

      console.log(`\n추적된 이벤트: ${report.trackedEvents.join(' → ')}`);
      console.log(`추적된 아이템: ${report.overallConsistency.totalItems}개`);
      console.log(`일관성 점수: ${report.overallConsistency.consistencyPercent}%`);

      if (report.issues.length > 0) {
        console.log('\n⚠️ 발견된 문제:');
        for (const issue of report.issues) {
          const icon = issue.severity === 'HIGH' ? '🔴' : issue.severity === 'MEDIUM' ? '🟡' : '🟢';
          console.log(`   ${icon} ${issue.type}: ${issue.description}`);
        }
      } else {
        console.log('\n✅ 퍼널 전체에서 item_name 일관성 유지됨');
      }
    }

  } catch (error) {
    console.error('❌ 테스트 실패:', error);
  } finally {
    // 결과 확인을 위해 잠시 대기
    console.log('\n⏳ 5초 후 브라우저 종료...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    await test.cleanup();
    console.log('\n=== 테스트 완료 ===');
  }
}

main().catch(console.error);
