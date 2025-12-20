/**
 * GTM 실제 파라미터 vs 현재 매핑 비교 분석
 */

import * as fs from 'fs';
import * as path from 'path';
import { EVENT_SPECIFIC_PARAMS } from './config/ecommerceItemsMapping';

// GTM에서 추출한 이벤트별 파라미터
const GTM_EVENT_PARAMS: Record<string, string[]> = {
  'view_item': ['event_category', 'event_action', 'items', 'currency', 'product_brandcode', 'product_brandname', 'product_category', 'product_id', 'product_is_pacific', 'product_is_stock', 'product_name', 'product_pagecode', 'product_sn'],
  'view_item_list': ['event_category', 'event_action', 'items', 'currency', 'search_mod_result', 'search_mod_term', 'search_result', 'search_resultcount', 'search_term', 'search_type'],
  'select_item': ['event_category', 'event_action', 'items', 'currency', 'bt_note_date'],
  'add_to_cart': ['event_category', 'event_action', 'items', 'currency'],
  'view_cart': [],
  'remove_from_cart': [],
  'begin_checkout': ['event_category', 'event_action', 'event_label', 'items', 'currency', 'checkout_seq', 'checkout_step'],
  'add_shipping_info': [],
  'add_payment_info': [],
  'purchase': ['event_category', 'event_action', 'items', 'currency', 'value', 'shipping', 'coupon', 'transaction_id', 'order_beauty_accumulated', 'order_beauty_discount', 'order_coupon_code', 'order_coupon_discount', 'order_giftcard_amount', 'order_member_discount', 'order_method', 'order_mobile_discount', 'order_total_amount', 'order_total_discount'],
  'view_promotion': ['event_category', 'event_action', 'items'],
  'select_promotion': ['event_category', 'event_action', 'event_label', 'items'],
  'login': ['event_category', 'event_action', 'event_label'],
  'sign_up': ['event_category', 'event_action', 'event_label'],
  'view_search_results': ['event_category', 'event_action', 'event_label', 'search_mod_result', 'search_mod_term', 'search_result', 'search_resultcount', 'search_term', 'search_type'],
  'scroll': ['event_category', 'event_action', 'event_label', 'percent_scrolled'],
  'ap_click': ['event_category', 'event_action', 'event_label', 'event_param1', 'event_param2', 'event_param3'],
  'custom_event': ['event_category', 'event_action', 'event_label', 'bc_mission', 'bt_product_list', 'bt_result_date', 'skinnote_answer', 'skinnote_intake_count', 'skinnote_note_date', 'skinnote_question', 'skinnote_result_diagnosis', 'skinnote_result_menstruation', 'skinnote_result_mood', 'skinnote_result_score', 'skinnote_result_skintype', 'skinnote_result_sleep', 'skinnote_result_water', 'skinnote_selfcare_count', 'skinnote_step', 'skinnote_use_count', 'sn_mission'],
  'write_review': ['event_category', 'event_action', 'event_label', 'review_product_code', 'review_product_content', 'review_product_name', 'review_product_picture', 'review_product_rating'],
  'withdrawal': ['event_category', 'event_action', 'event_label'],
  'naverpay': ['event_category', 'event_action', 'event_label', 'naverpay_option', 'naverpay_quantity', 'naverpay_revenue', 'order_method'],
  'live': ['event_category', 'event_action', 'event_label', 'live_id', 'live_name', 'live_type'],
  'beauty_tester': ['event_category', 'event_action', 'event_label'],
  'brand_store': ['event_category', 'event_action', 'event_label'],
  'brand_product_click': ['event_category', 'event_action', 'event_label', 'product_brandname', 'product_id', 'product_name'],
  'view_promotion_detail': ['event_category', 'event_action', 'event_label', 'view_event_brand', 'view_event_code', 'view_event_name'],
  'click_with_duration': ['click_duration_0', 'click_duration_10', 'click_duration_20', 'click_duration_30', 'click_duration_40', 'click_duration_50', 'click_duration_60', 'click_duration_70', 'click_duration_80', 'click_duration_90', 'click_duration_100'],
  'page_load_time': ['loading_time_sec'],
  'campaign_details': ['campaign', 'campaign_id', 'content', 'medium', 'source', 'term'],
  'qualified_visit': [],
};

// 공통 파라미터 (event_category, event_action, event_label은 GT - Event Settings에서 옴)
const COMMON_PARAMS = ['event_category', 'event_action', 'event_label'];
// items는 별도 매핑이 있으므로 제외
const ITEMS_PARAM = 'items';

function main() {
  console.log('='.repeat(100));
  console.log(' GTM 실제 파라미터 vs 현재 매핑 비교');
  console.log('='.repeat(100));

  // 현재 매핑에서 이벤트별 파라미터 추출
  const currentMappedParams: Record<string, Set<string>> = {};
  for (const [event, params] of Object.entries(EVENT_SPECIFIC_PARAMS)) {
    currentMappedParams[event] = new Set(params.map(p => p.ga4Param));
  }

  console.log('\n### 이벤트별 매핑 상태\n');

  let totalMissing = 0;
  let totalMapped = 0;
  const missingByEvent: Record<string, string[]> = {};
  const newEvents: string[] = [];

  for (const [event, gtmParams] of Object.entries(GTM_EVENT_PARAMS)) {
    // 공통 파라미터와 items 제외한 개별 파라미터만 비교
    const specificParams = gtmParams.filter(p => !COMMON_PARAMS.includes(p) && p !== ITEMS_PARAM);

    if (specificParams.length === 0) continue;

    const mappedParams = currentMappedParams[event] || new Set();
    const missing = specificParams.filter(p => !mappedParams.has(p));
    const mapped = specificParams.filter(p => mappedParams.has(p));

    totalMissing += missing.length;
    totalMapped += mapped.length;

    if (!currentMappedParams[event]) {
      newEvents.push(event);
    }

    if (missing.length > 0) {
      missingByEvent[event] = missing;
    }

    console.log(`📊 ${event}`);
    console.log(`   GTM 파라미터: ${specificParams.length}개`);
    console.log(`   매핑됨: ${mapped.length}개`);
    console.log(`   누락: ${missing.length}개 ${missing.length > 0 ? '⚠️' : '✅'}`);
    if (missing.length > 0) {
      console.log(`   누락 목록: ${missing.join(', ')}`);
    }
    console.log('');
  }

  // 요약
  console.log('\n');
  console.log('='.repeat(100));
  console.log(' 요약');
  console.log('='.repeat(100));

  console.log(`\n총 개별 파라미터: ${totalMapped + totalMissing}개`);
  console.log(`매핑됨: ${totalMapped}개`);
  console.log(`누락됨: ${totalMissing}개`);
  console.log(`커버리지: ${((totalMapped / (totalMapped + totalMissing)) * 100).toFixed(1)}%`);

  console.log(`\n새로 추가해야 할 이벤트: ${newEvents.length}개`);
  if (newEvents.length > 0) {
    console.log(`   ${newEvents.join(', ')}`);
  }

  // 누락 파라미터 상세
  console.log('\n');
  console.log('='.repeat(100));
  console.log(' 누락 파라미터 상세 (추가 필요)');
  console.log('='.repeat(100));

  for (const [event, missing] of Object.entries(missingByEvent)) {
    console.log(`\n### ${event}`);
    for (const param of missing) {
      console.log(`   - ${param}`);
    }
  }

  // 코드 생성 (추가해야 할 매핑)
  console.log('\n');
  console.log('='.repeat(100));
  console.log(' 추가해야 할 코드 (EVENT_SPECIFIC_PARAMS)');
  console.log('='.repeat(100));

  for (const [event, missing] of Object.entries(missingByEvent)) {
    console.log(`\n// ${event}`);
    console.log(`'${event}': [`);
    for (const param of missing) {
      let sourceType = 'datalayer';
      let sourcePath = param;
      let gtmVariable = `{{DL - ${param.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}}}`;

      // 특정 패턴에 따라 추론
      if (param.startsWith('order_') || param.startsWith('naverpay_')) {
        sourceType = 'global_variable';
        sourcePath = `AP_${param.toUpperCase()}`;
        gtmVariable = `{{JS - ${param.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}}}`;
      } else if (param.startsWith('search_')) {
        sourceType = 'global_variable';
        sourcePath = `AP_${param.toUpperCase()}`;
        gtmVariable = `{{JS - ${param.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}}}`;
      } else if (param.startsWith('product_')) {
        sourceType = 'global_variable';
        sourcePath = `AP_PRD_${param.replace('product_', '').toUpperCase()}`;
        gtmVariable = `{{JS - ${param.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}}}`;
      } else if (param.startsWith('review_product_')) {
        sourceType = 'datalayer';
        sourcePath = param;
        gtmVariable = `{{DL - ${param.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}}}`;
      } else if (param.startsWith('click_duration_')) {
        sourceType = 'global_variable';
        sourcePath = `window.durationArray[${param.replace('click_duration_', '')}]`;
        gtmVariable = `{{JS - Duration Array}}`;
      } else if (param.startsWith('skinnote_') || param.startsWith('bt_') || param.startsWith('bc_') || param.startsWith('sn_')) {
        sourceType = 'datalayer';
        sourcePath = param;
        gtmVariable = `{{DL - ${param.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}}}`;
      }

      console.log(`  { ga4Param: '${param}', description: '${param}', gtmVariable: '${gtmVariable}', sourceType: '${sourceType}', sourcePath: '${sourcePath}' },`);
    }
    console.log(`],`);
  }
}

main();
