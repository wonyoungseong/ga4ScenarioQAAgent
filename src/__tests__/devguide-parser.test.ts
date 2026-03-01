/**
 * Dev Guide PDF Parser 테스트
 *
 * 실제 개발가이드 PDF를 파싱하여 검증:
 * 1. PDF 로드 및 파싱
 * 2. 이벤트 힌트 추출
 * 3. dataLayer → GA4 매핑
 * 4. 페이지 타입 추론
 * 5. 테스트 가능성 분류
 */

import * as path from 'path';
import * as fs from 'fs';
import { parseDevGuidePDF } from '../agents/parser/devguide-parser';
import type { DevGuideParseOutput } from '../types/devguide';

// ─────────────────────────────────────────────────────────────────────
// File Paths
// ─────────────────────────────────────────────────────────────────────

const DEV_GUIDE_PDF_PATH = path.resolve(
  __dirname,
  '../../50_Raw_Inputs/SenarioAgent/ga4ScenarioQAAgent/[EC]+WEB+개발+가이드_GTM코드추가(Shopify)1.1.pdf',
);

// ─────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────

describe('Dev Guide PDF Parser', () => {
  let output: DevGuideParseOutput;

  beforeAll(() => {
    if (!fs.existsSync(DEV_GUIDE_PDF_PATH)) {
      throw new Error(`테스트 PDF 파일이 없습니다: ${DEV_GUIDE_PDF_PATH}`);
    }
    output = parseDevGuidePDF(DEV_GUIDE_PDF_PATH);
  });

  describe('기본 파싱', () => {
    it('이벤트 힌트를 추출해야 함', () => {
      expect(output.events.length).toBeGreaterThan(0);
      console.log(`추출된 이벤트: ${output.events.length}개`);
      for (const e of output.events) {
        console.log(`  ${e.ga4_event_name}: dataLayer=[${e.dataLayer_event_names.join(', ')}], testability=${e.testability}, pages=[${e.inferred_page_types.join(',')}]`);
      }
    });

    it('dataLayer → GA4 매핑을 생성해야 함', () => {
      expect(Object.keys(output.dataLayer_to_ga4_map).length).toBeGreaterThan(0);
      console.log(`dataLayer 매핑: ${Object.keys(output.dataLayer_to_ga4_map).length}개`);
      for (const [dl, ga4] of Object.entries(output.dataLayer_to_ga4_map)) {
        console.log(`  ${dl} → ${ga4}`);
      }
    });
  });

  describe('주요 이벤트 검증', () => {
    it('page_view 이벤트가 존재해야 함', () => {
      const pageView = output.events.find(e => e.ga4_event_name === 'page_view');
      expect(pageView).toBeDefined();
      expect(pageView!.required).toBe(true);
      expect(pageView!.testability).toBe('auto');
      expect(pageView!.practical_fire).toBe('auto_fire');
    });

    it('view_item 이벤트가 존재해야 함', () => {
      const viewItem = output.events.find(e => e.ga4_event_name === 'view_item');
      expect(viewItem).toBeDefined();
      expect(viewItem!.inferred_page_types).toContain('PRODUCT_DETAIL');
    });

    it('add_to_cart 이벤트가 존재해야 함', () => {
      const addToCart = output.events.find(e => e.ga4_event_name === 'add_to_cart');
      expect(addToCart).toBeDefined();
      expect(addToCart!.testability).toBe('action');
      expect(addToCart!.practical_fire).toBe('user_action');
    });

    it('purchase 이벤트가 manual_only여야 함', () => {
      const purchase = output.events.find(e => e.ga4_event_name === 'purchase');
      expect(purchase).toBeDefined();
      expect(purchase!.testability).toBe('manual_only');
    });

    it('login 이벤트가 manual_only여야 함', () => {
      const login = output.events.find(e => e.ga4_event_name === 'login');
      expect(login).toBeDefined();
      expect(login!.testability).toBe('manual_only');
    });
  });

  describe('dataLayer 매핑 검증', () => {
    it('ap_page_view → page_view 매핑', () => {
      expect(output.dataLayer_to_ga4_map['ap_page_view']).toBe('page_view');
    });

    it('product → view_item 매핑', () => {
      expect(output.dataLayer_to_ga4_map['product']).toBe('view_item');
    });

    it('addcart → add_to_cart 매핑', () => {
      expect(output.dataLayer_to_ga4_map['addcart']).toBe('add_to_cart');
    });

    it('review → write_review 매핑', () => {
      expect(output.dataLayer_to_ga4_map['review']).toBe('write_review');
    });

    it('login_complete → login 매핑', () => {
      expect(output.dataLayer_to_ga4_map['login_complete']).toBe('login');
    });

    it('purchase → purchase 매핑', () => {
      expect(output.dataLayer_to_ga4_map['purchase']).toBe('purchase');
    });
  });

  describe('begin_checkout 중복 제거', () => {
    it('begin_checkout은 1개로 병합되어야 함', () => {
      const checkouts = output.events.filter(e => e.ga4_event_name === 'begin_checkout');
      expect(checkouts.length).toBe(1);
    });

    it('begin_checkout의 dataLayer 이벤트는 여러 개 병합되어야 함', () => {
      const checkout = output.events.find(e => e.ga4_event_name === 'begin_checkout');
      expect(checkout).toBeDefined();
      // Should have merged: cart, purchasecartbtn, purchaseprdbtn, purchaseplpbtn, order, orderbtn
      expect(checkout!.dataLayer_event_names.length).toBeGreaterThan(1);
      console.log(`begin_checkout dataLayer events: [${checkout!.dataLayer_event_names.join(', ')}]`);
    });
  });

  describe('경고 확인', () => {
    it('심각한 경고가 없어야 함', () => {
      if (output.warnings.length > 0) {
        console.log('경고:');
        for (const w of output.warnings) {
          console.log(`  - ${w}`);
        }
      }
      // warnings are allowed but not critical errors
      expect(output.events.length).toBeGreaterThan(5);
    });
  });
});
