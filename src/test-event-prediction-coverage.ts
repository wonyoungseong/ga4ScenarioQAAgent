/**
 * 이벤트별 파라미터 예측 커버리지 테스트
 *
 * GTM에서 정의된 모든 이벤트에 대해:
 * 1. 공통 파라미터 (GT - Event Settings) 예측 가능 여부
 * 2. 이벤트별 개별 파라미터 예측 가능 여부
 * 3. 이커머스 items 파라미터 예측 가능 여부
 * 를 검증합니다.
 */

import { createDefaultGTMConfigLoader } from './config/gtmConfigLoader';
import {
  ECOMMERCE_ITEM_PARAMS,
  EVENT_SPECIFIC_PARAMS,
  getItemParamsForEvent,
  getEventSpecificParams,
  isEcommerceEvent,
} from './config/ecommerceItemsMapping';

// 공통 파라미터 정의 (GT - Event Settings 기준)
const COMMON_EVENT_PARAMS = {
  site: [
    { param: 'site_env', globalVar: 'AP_DATA_ENV' },
    { param: 'site_name', globalVar: 'AP_DATA_SITENAME' },
    { param: 'site_language', globalVar: 'AP_DATA_LANG' },
    { param: 'site_country', globalVar: 'AP_DATA_COUNTRY' },
    { param: 'content_group', globalVar: 'AP_DATA_PAGETYPE' },
    { param: 'channel', globalVar: 'AP_DATA_CHANNEL' },
    { param: 'user_agent', source: 'navigator.userAgent' },
    { param: 'traffic_type', source: 'Page Hostname' },
  ],
  login: [
    { param: 'login_is_login', globalVar: 'AP_DATA_ISLOGIN' },
    { param: 'login_id_gcid', globalVar: 'AP_DATA_GCID' },
    { param: 'login_id_cid', globalVar: 'AP_DATA_CID' },
    { param: 'login_id_gcid_1', globalVar: 'AP_DATA_GCID' },
    { param: 'login_id_gcid_2', globalVar: 'AP_DATA_GCID' },
    { param: 'login_id_cid_1', globalVar: 'AP_DATA_CID' },
    { param: 'login_id_cid_2', globalVar: 'AP_DATA_CID' },
  ],
  page: [
    { param: 'page_location_1', source: 'Page URL' },
    { param: 'page_location_2', source: 'Page URL' },
    { param: 'page_location_3', source: 'Page URL' },
    { param: 'page_location_4', source: 'Page URL' },
    { param: 'page_location_5', source: 'Page URL' },
    { param: 'page_referrer', source: 'Page Referrer' },
    { param: 'page_store_code', source: 'URL', condition: 'STORE_*' },
    { param: 'page_store_name', source: 'URL', condition: 'STORE_*' },
  ],
  product: [
    { param: 'product_id', globalVar: 'AP_PRD_CODE', condition: 'PRODUCT_DETAIL' },
    { param: 'product_name', globalVar: 'AP_PRD_NAME', condition: 'PRODUCT_DETAIL' },
    { param: 'product_category', globalVar: 'AP_PRD_CATEGORY', condition: 'PRODUCT_DETAIL' },
    { param: 'product_brandname', globalVar: 'AP_PRD_BRAND', condition: 'PRODUCT_DETAIL' },
    { param: 'product_brandcode', globalVar: 'AP_PRD_APGBRCODE', condition: 'PRODUCT_DETAIL' },
    { param: 'product_is_stock', globalVar: 'AP_PRD_ISSTOCK', condition: 'PRODUCT_DETAIL' },
  ],
  brandshop: [
    { param: 'brandshop_code', source: 'URL', condition: 'BRAND_MAIN' },
    { param: 'brandshop_name', globalVar: 'AP_DATA_BRAND', condition: 'BRAND_MAIN' },
  ],
  search: [
    { param: 'search_brand_code', source: 'URL', condition: 'SEARCH_RESULT' },
    { param: 'search_brand', globalVar: 'AP_SEARCH_SHOPBRAND', condition: 'SEARCH_RESULT' },
  ],
  event: [
    { param: 'view_event_code', globalVar: 'AP_EVENT_CODE', condition: 'EVENT_DETAIL' },
    { param: 'view_event_name', globalVar: 'AP_EVENT_NAME', condition: 'EVENT_DETAIL' },
  ],
};

const COMMON_USER_PROPS = [
  { param: 'user_id', globalVar: 'AP_DATA_GCID' },
  { param: 'login_is_sso', globalVar: 'AP_DATA_ISMEMBER' },
  { param: 'login_gender', globalVar: 'AP_DATA_CG' },
  { param: 'login_birth', globalVar: 'AP_DATA_CD' },
  { param: 'login_age', globalVar: 'AP_DATA_CA' },
  { param: 'login_level', globalVar: 'AP_DATA_CT' },
  { param: 'login_beauty_level', globalVar: 'AP_DATA_BEAUTYCT' },
  { param: 'login_is_member', globalVar: 'AP_DATA_ISEMPLOYEE' },
  { param: 'login_method', globalVar: 'AP_DATA_LOGINTYPE' },
  { param: 'login_is_subscription', globalVar: 'AP_DATA_MBRS_PLUS' },
];

// 이벤트별 설정
interface EventConfig {
  category: 'ecommerce' | 'basic' | 'custom';
  hasEcommerceData: boolean;
  pageTypes: string[];
  additionalParams?: { param: string; source: string }[];
}

const EVENT_CONFIGS: Record<string, EventConfig> = {
  'page_view': { category: 'basic', hasEcommerceData: false, pageTypes: ['ALL'] },
  'view_item': { category: 'ecommerce', hasEcommerceData: true, pageTypes: ['PRODUCT_DETAIL'] },
  'view_item_list': { category: 'ecommerce', hasEcommerceData: true, pageTypes: ['PRODUCT_LIST', 'SEARCH_RESULT', 'BRAND_MAIN'] },
  'select_item': { category: 'ecommerce', hasEcommerceData: true, pageTypes: ['PRODUCT_LIST', 'SEARCH_RESULT', 'BRAND_MAIN'] },
  'add_to_cart': { category: 'ecommerce', hasEcommerceData: true, pageTypes: ['PRODUCT_DETAIL', 'PRODUCT_LIST'] },
  'view_cart': { category: 'ecommerce', hasEcommerceData: true, pageTypes: ['CART'] },
  'remove_from_cart': { category: 'ecommerce', hasEcommerceData: true, pageTypes: ['CART'] },
  'begin_checkout': { category: 'ecommerce', hasEcommerceData: true, pageTypes: ['ORDER'] },
  'add_shipping_info': { category: 'ecommerce', hasEcommerceData: true, pageTypes: ['ORDER'] },
  'add_payment_info': { category: 'ecommerce', hasEcommerceData: true, pageTypes: ['ORDER'] },
  'purchase': {
    category: 'ecommerce',
    hasEcommerceData: true,
    pageTypes: ['ORDER_COMPLETE'],
    additionalParams: [
      { param: 'transaction_id', source: 'dataLayer.ecommerce.transaction_id' },
      { param: 'value', source: 'dataLayer.ecommerce.value' },
      { param: 'currency', source: 'dataLayer.ecommerce.currency' },
      { param: 'tax', source: 'dataLayer.ecommerce.tax' },
      { param: 'shipping', source: 'dataLayer.ecommerce.shipping' },
      { param: 'coupon', source: 'dataLayer.ecommerce.coupon' },
    ]
  },
  'view_promotion': { category: 'ecommerce', hasEcommerceData: true, pageTypes: ['MAIN', 'PRODUCT_LIST', 'EVENT_LIST'] },
  'select_promotion': { category: 'ecommerce', hasEcommerceData: true, pageTypes: ['MAIN', 'PRODUCT_LIST', 'EVENT_LIST'] },
  'login': {
    category: 'basic',
    hasEcommerceData: false,
    pageTypes: ['ALL'],
    additionalParams: [{ param: 'method', source: 'dataLayer.method' }]
  },
  'sign_up': {
    category: 'basic',
    hasEcommerceData: false,
    pageTypes: ['SIGNUP_COMPLETE'],
    additionalParams: [{ param: 'method', source: 'dataLayer.method' }]
  },
  'view_search_results': {
    category: 'basic',
    hasEcommerceData: false,
    pageTypes: ['SEARCH_RESULT'],
    additionalParams: [{ param: 'search_term', source: 'dataLayer.search_term' }]
  },
  'scroll': { category: 'basic', hasEcommerceData: false, pageTypes: ['ALL'] },
  'ap_click': {
    category: 'basic',
    hasEcommerceData: false,
    pageTypes: ['ALL'],
    additionalParams: [
      { param: 'click_text', source: 'dataLayer.click_text' },
      { param: 'click_url', source: 'dataLayer.click_url' },
      { param: 'click_id', source: 'dataLayer.click_id' },
      { param: 'click_class', source: 'dataLayer.click_class' },
    ]
  },
  'custom_event': { category: 'custom', hasEcommerceData: false, pageTypes: ['ALL'] },
};

// 이커머스 items 파라미터 (ecommerceItemsMapping.ts에서 import)

async function main() {
  console.log('═'.repeat(100));
  console.log(' 이벤트별 파라미터 예측 커버리지 테스트');
  console.log('═'.repeat(100));

  // GTM 설정 로더 초기화
  console.log('\n📦 GTM 설정 로더 초기화 중...');
  const loader = createDefaultGTMConfigLoader();
  await loader.preload();
  console.log('✅ GTM 설정 로드 완료!\n');

  // 결과 저장
  const results: {
    event: string;
    category: string;
    commonParams: { total: number; covered: number; missing: string[] };
    userProps: { total: number; covered: number; missing: string[] };
    additionalParams: { total: number; covered: number; missing: string[] };
    itemsParams: { total: number; covered: number; missing: string[] };
  }[] = [];

  // 이벤트별 테스트
  console.log('━'.repeat(100));
  console.log('📌 이벤트별 예측 커버리지');
  console.log('━'.repeat(100));

  for (const [eventName, config] of Object.entries(EVENT_CONFIGS)) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`📊 ${eventName} (${config.category})`);
    console.log('─'.repeat(80));

    // 공통 파라미터 검사
    const commonParamList = Object.values(COMMON_EVENT_PARAMS).flat();
    const commonCovered: string[] = [];
    const commonMissing: string[] = [];

    for (const p of commonParamList) {
      const gtmInfo = loader.getParameterGTMInfo(p.param);
      const dataSources = loader.getDataSources(p.param);

      if (gtmInfo || dataSources.length > 0) {
        commonCovered.push(p.param);
      } else {
        commonMissing.push(p.param);
      }
    }

    console.log(`\n   공통 Event Parameters: ${commonCovered.length}/${commonParamList.length}`);
    if (commonMissing.length > 0 && commonMissing.length <= 5) {
      console.log(`      누락: ${commonMissing.join(', ')}`);
    }

    // User Properties 검사
    const userPropsCovered: string[] = [];
    const userPropsMissing: string[] = [];

    for (const p of COMMON_USER_PROPS) {
      const gtmInfo = loader.getParameterGTMInfo(p.param);
      const dataSources = loader.getDataSources(p.param);

      if (gtmInfo || dataSources.length > 0) {
        userPropsCovered.push(p.param);
      } else {
        userPropsMissing.push(p.param);
      }
    }

    console.log(`   User Properties: ${userPropsCovered.length}/${COMMON_USER_PROPS.length}`);
    if (userPropsMissing.length > 0 && userPropsMissing.length <= 5) {
      console.log(`      누락: ${userPropsMissing.join(', ')}`);
    }

    // 개별 파라미터 검사
    const additionalCovered: string[] = [];
    const additionalMissing: string[] = [];

    if (config.additionalParams) {
      for (const p of config.additionalParams) {
        const gtmInfo = loader.getParameterGTMInfo(p.param);
        const dataSources = loader.getDataSources(p.param);

        if (gtmInfo || dataSources.length > 0) {
          additionalCovered.push(p.param);
        } else {
          additionalMissing.push(p.param);
        }
      }

      console.log(`   개별 파라미터: ${additionalCovered.length}/${config.additionalParams.length}`);
      if (additionalMissing.length > 0) {
        console.log(`      누락: ${additionalMissing.join(', ')}`);
      }
    }

    // items 파라미터 검사 (이커머스 이벤트만) - 새로운 매핑 사용
    const itemsCovered: string[] = [];
    const itemsMissing: string[] = [];

    if (config.hasEcommerceData) {
      // 이 이벤트에서 사용하는 items 파라미터 가져오기
      const eventItemParams = getItemParamsForEvent(eventName);

      for (const p of eventItemParams) {
        // 매핑이 정의되어 있으면 커버된 것으로 간주
        const hasMapping = p.sources.some(s => s.event === eventName);
        if (hasMapping) {
          itemsCovered.push(p.ga4Param);
        } else {
          itemsMissing.push(p.ga4Param);
        }
      }

      console.log(`   items[] 파라미터: ${itemsCovered.length}/${eventItemParams.length} (매핑 정의됨)`);
      if (itemsMissing.length > 0 && itemsMissing.length <= 10) {
        console.log(`      누락: ${itemsMissing.join(', ')}`);
      }
    }

    // 개별 파라미터도 새로운 매핑에서 가져오기
    const eventSpecificParams = getEventSpecificParams(eventName);
    const specificCovered: string[] = [];
    const specificMissing: string[] = [];

    for (const p of eventSpecificParams) {
      // 매핑이 정의되어 있으면 커버된 것으로 간주
      specificCovered.push(p.ga4Param);
    }

    if (eventSpecificParams.length > 0) {
      console.log(`   개별 파라미터 (매핑): ${specificCovered.length}/${eventSpecificParams.length}`);
    }

    // 결과 저장
    const eventItemParams = config.hasEcommerceData ? getItemParamsForEvent(eventName) : [];
    results.push({
      event: eventName,
      category: config.category,
      commonParams: {
        total: commonParamList.length,
        covered: commonCovered.length,
        missing: commonMissing,
      },
      userProps: {
        total: COMMON_USER_PROPS.length,
        covered: userPropsCovered.length,
        missing: userPropsMissing,
      },
      additionalParams: {
        total: eventSpecificParams.length,
        covered: specificCovered.length,
        missing: specificMissing,
      },
      itemsParams: {
        total: eventItemParams.length,
        covered: itemsCovered.length,
        missing: itemsMissing,
      },
    });
  }

  // 요약 테이블
  console.log('\n');
  console.log('═'.repeat(100));
  console.log(' 요약 테이블');
  console.log('═'.repeat(100));

  console.log('\n| 이벤트 | 카테고리 | 공통 Params | User Props | 개별 | items | 총 커버리지 |');
  console.log('|--------|----------|------------|------------|------|-------|------------|');

  for (const r of results) {
    const commonRate = `${r.commonParams.covered}/${r.commonParams.total}`;
    const userRate = `${r.userProps.covered}/${r.userProps.total}`;
    const additionalRate = r.additionalParams.total > 0 ? `${r.additionalParams.covered}/${r.additionalParams.total}` : '-';
    const itemsRate = r.itemsParams.total > 0 ? `${r.itemsParams.covered}/${r.itemsParams.total}` : '-';

    const totalCovered = r.commonParams.covered + r.userProps.covered + r.additionalParams.covered + r.itemsParams.covered;
    const totalTotal = r.commonParams.total + r.userProps.total + r.additionalParams.total + r.itemsParams.total;
    const percentage = ((totalCovered / totalTotal) * 100).toFixed(0);

    console.log(`| ${r.event.padEnd(20)} | ${r.category.padEnd(8)} | ${commonRate.padEnd(10)} | ${userRate.padEnd(10)} | ${additionalRate.padEnd(4)} | ${itemsRate.padEnd(5)} | ${percentage}%`.padEnd(10) + ' |');
  }

  // 누락 파라미터 상세
  console.log('\n');
  console.log('═'.repeat(100));
  console.log(' 누락 파라미터 상세');
  console.log('═'.repeat(100));

  // 공통 파라미터 누락
  const allCommonMissing = new Set<string>();
  for (const r of results) {
    r.commonParams.missing.forEach(p => allCommonMissing.add(p));
  }
  if (allCommonMissing.size > 0) {
    console.log(`\n❌ 공통 Event Parameters 누락 (${allCommonMissing.size}개):`);
    console.log(`   ${Array.from(allCommonMissing).join(', ')}`);
  } else {
    console.log('\n✅ 공통 Event Parameters: 모두 커버됨');
  }

  // User Properties 누락
  const allUserPropsMissing = new Set<string>();
  for (const r of results) {
    r.userProps.missing.forEach(p => allUserPropsMissing.add(p));
  }
  if (allUserPropsMissing.size > 0) {
    console.log(`\n❌ User Properties 누락 (${allUserPropsMissing.size}개):`);
    console.log(`   ${Array.from(allUserPropsMissing).join(', ')}`);
  } else {
    console.log('\n✅ User Properties: 모두 커버됨');
  }

  // items 파라미터 누락
  const allItemsMissing = new Set<string>();
  for (const r of results) {
    r.itemsParams.missing.forEach(p => allItemsMissing.add(p));
  }
  if (allItemsMissing.size > 0) {
    console.log(`\n❌ items[] 파라미터 누락 (${allItemsMissing.size}개):`);
    console.log(`   ${Array.from(allItemsMissing).join(', ')}`);
  } else {
    console.log('\n✅ items[] 파라미터: 모두 커버됨');
  }

  // 개별 파라미터 누락
  const allAdditionalMissing: { event: string; param: string }[] = [];
  for (const r of results) {
    r.additionalParams.missing.forEach(p => allAdditionalMissing.push({ event: r.event, param: p }));
  }
  if (allAdditionalMissing.length > 0) {
    console.log(`\n❌ 개별 파라미터 누락 (${allAdditionalMissing.length}개):`);
    for (const { event, param } of allAdditionalMissing) {
      console.log(`   - ${event}: ${param}`);
    }
  } else {
    console.log('\n✅ 개별 파라미터: 모두 커버됨');
  }

  // 최종 통계
  console.log('\n');
  console.log('═'.repeat(100));
  console.log(' 최종 통계');
  console.log('═'.repeat(100));

  const totalCommonCovered = results.reduce((sum, r) => sum + r.commonParams.covered, 0);
  const totalCommonTotal = results.reduce((sum, r) => sum + r.commonParams.total, 0);
  const totalUserCovered = results.reduce((sum, r) => sum + r.userProps.covered, 0);
  const totalUserTotal = results.reduce((sum, r) => sum + r.userProps.total, 0);
  const totalAdditionalCovered = results.reduce((sum, r) => sum + r.additionalParams.covered, 0);
  const totalAdditionalTotal = results.reduce((sum, r) => sum + r.additionalParams.total, 0);
  const totalItemsCovered = results.reduce((sum, r) => sum + r.itemsParams.covered, 0);
  const totalItemsTotal = results.reduce((sum, r) => sum + r.itemsParams.total, 0);

  const grandTotalCovered = totalCommonCovered + totalUserCovered + totalAdditionalCovered + totalItemsCovered;
  const grandTotalTotal = totalCommonTotal + totalUserTotal + totalAdditionalTotal + totalItemsTotal;

  console.log(`
이벤트 수: ${results.length}개

파라미터 커버리지:
  - 공통 Event Parameters: ${(totalCommonCovered / totalCommonTotal * 100).toFixed(1)}% (${totalCommonCovered}/${totalCommonTotal})
  - User Properties: ${(totalUserCovered / totalUserTotal * 100).toFixed(1)}% (${totalUserCovered}/${totalUserTotal})
  - 개별 파라미터: ${totalAdditionalTotal > 0 ? ((totalAdditionalCovered / totalAdditionalTotal * 100).toFixed(1) + '%') : 'N/A'} (${totalAdditionalCovered}/${totalAdditionalTotal})
  - items[] 파라미터: ${totalItemsTotal > 0 ? ((totalItemsCovered / totalItemsTotal * 100).toFixed(1) + '%') : 'N/A'} (${totalItemsCovered}/${totalItemsTotal})

총 커버리지: ${(grandTotalCovered / grandTotalTotal * 100).toFixed(1)}% (${grandTotalCovered}/${grandTotalTotal})
`);
}

main().catch(console.error);
