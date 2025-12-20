/**
 * 전체 이벤트별 파라미터 분석
 *
 * GTM 태그에서 모든 이벤트를 추출하고, 각 이벤트별로:
 * 1. 공통 파라미터 (GT - Event Settings)
 * 2. 이벤트별 개별 파라미터
 * 3. 이커머스 데이터 (items)
 * 를 분석합니다.
 */

import * as fs from 'fs';
import * as path from 'path';

const GTM_FILE = path.join(process.cwd(), 'GTM-5FK5X5C4_workspace112.json');

// 공통 파라미터 (GT - Event Settings 기준)
const COMMON_EVENT_PARAMS = {
  site: [
    'site_env', 'site_name', 'site_language', 'site_country',
    'content_group', 'channel', 'user_agent', 'traffic_type'
  ],
  login: [
    'login_is_login', 'login_id_gcid', 'login_id_cid',
    'login_id_gcid_1', 'login_id_gcid_2', 'login_id_cid_1', 'login_id_cid_2'
  ],
  page: [
    'page_location_1', 'page_location_2', 'page_location_3',
    'page_location_4', 'page_location_5', 'page_referrer',
    'page_store_code', 'page_store_name'
  ],
  product: [
    'product_id', 'product_name', 'product_category',
    'product_brandname', 'product_brandcode', 'product_is_stock'
  ],
  brandshop: ['brandshop_code', 'brandshop_name'],
  search: ['search_brand_code', 'search_brand'],
  event: ['view_event_code', 'view_event_name']
};

const COMMON_USER_PROPS = [
  'user_id', 'login_is_sso', 'login_gender', 'login_birth', 'login_age',
  'login_level', 'login_beauty_level', 'login_is_member', 'login_method', 'login_is_subscription'
];

// 이벤트별 발생 조건 및 특성
interface EventConfig {
  name: string;
  category: 'ecommerce' | 'basic' | 'custom';
  hasEcommerceData: boolean;  // sendEcommerceData 사용
  pageTypes?: string[];       // 발생 가능 페이지 타입
  trigger?: string;           // 트리거 조건
  itemsSource?: string;       // items 데이터 소스
  additionalParams?: string[]; // 추가 파라미터
}

const EVENT_CONFIGS: Record<string, EventConfig> = {
  // 이커머스 이벤트 (items 배열 포함)
  'page_view': {
    name: 'page_view',
    category: 'basic',
    hasEcommerceData: false,
    pageTypes: ['ALL'],
    trigger: '모든 페이지 로드 시'
  },
  'view_item': {
    name: 'view_item',
    category: 'ecommerce',
    hasEcommerceData: true,
    pageTypes: ['PRODUCT_DETAIL'],
    trigger: '상품 상세 페이지 진입 시',
    itemsSource: 'dataLayer.ecommerce.items'
  },
  'view_item_list': {
    name: 'view_item_list',
    category: 'ecommerce',
    hasEcommerceData: true,
    pageTypes: ['PRODUCT_LIST', 'SEARCH_RESULT', 'BRAND_MAIN'],
    trigger: '상품 리스트 노출 시',
    itemsSource: 'dataLayer.ecommerce.items'
  },
  'select_item': {
    name: 'select_item',
    category: 'ecommerce',
    hasEcommerceData: true,
    pageTypes: ['PRODUCT_LIST', 'SEARCH_RESULT', 'BRAND_MAIN'],
    trigger: '상품 클릭 시',
    itemsSource: 'dataLayer.ecommerce.items'
  },
  'add_to_cart': {
    name: 'add_to_cart',
    category: 'ecommerce',
    hasEcommerceData: true,
    pageTypes: ['PRODUCT_DETAIL', 'PRODUCT_LIST'],
    trigger: '장바구니 담기 클릭 시',
    itemsSource: 'dataLayer.ecommerce.items'
  },
  'view_cart': {
    name: 'view_cart',
    category: 'ecommerce',
    hasEcommerceData: true,
    pageTypes: ['CART'],
    trigger: '장바구니 페이지 진입 시',
    itemsSource: 'dataLayer.ecommerce.items'
  },
  'remove_from_cart': {
    name: 'remove_from_cart',
    category: 'ecommerce',
    hasEcommerceData: true,
    pageTypes: ['CART'],
    trigger: '장바구니에서 상품 삭제 시',
    itemsSource: 'dataLayer.ecommerce.items'
  },
  'begin_checkout': {
    name: 'begin_checkout',
    category: 'ecommerce',
    hasEcommerceData: true,
    pageTypes: ['ORDER'],
    trigger: '주문서 페이지 진입 시',
    itemsSource: 'dataLayer.ecommerce.items'
  },
  'add_shipping_info': {
    name: 'add_shipping_info',
    category: 'ecommerce',
    hasEcommerceData: true,
    pageTypes: ['ORDER'],
    trigger: '배송 정보 입력 완료 시',
    itemsSource: 'dataLayer.ecommerce.items'
  },
  'add_payment_info': {
    name: 'add_payment_info',
    category: 'ecommerce',
    hasEcommerceData: true,
    pageTypes: ['ORDER'],
    trigger: '결제 정보 입력 완료 시',
    itemsSource: 'dataLayer.ecommerce.items'
  },
  'purchase': {
    name: 'purchase',
    category: 'ecommerce',
    hasEcommerceData: true,
    pageTypes: ['ORDER_COMPLETE'],
    trigger: '구매 완료 시',
    itemsSource: 'dataLayer.ecommerce.items',
    additionalParams: ['transaction_id', 'value', 'currency', 'tax', 'shipping', 'coupon']
  },
  'refund': {
    name: 'refund',
    category: 'ecommerce',
    hasEcommerceData: true,
    pageTypes: ['MY'],
    trigger: '환불 완료 시',
    itemsSource: 'dataLayer.ecommerce.items'
  },
  'view_promotion': {
    name: 'view_promotion',
    category: 'ecommerce',
    hasEcommerceData: true,
    pageTypes: ['MAIN', 'PRODUCT_LIST', 'EVENT_LIST'],
    trigger: '프로모션 배너 노출 시',
    itemsSource: 'dataLayer.ecommerce.items (promotions)'
  },
  'select_promotion': {
    name: 'select_promotion',
    category: 'ecommerce',
    hasEcommerceData: true,
    pageTypes: ['MAIN', 'PRODUCT_LIST', 'EVENT_LIST'],
    trigger: '프로모션 배너 클릭 시',
    itemsSource: 'dataLayer.ecommerce.items (promotions)'
  },

  // 기본 이벤트 (items 없음)
  'login': {
    name: 'login',
    category: 'basic',
    hasEcommerceData: false,
    pageTypes: ['LOGIN', 'ALL'],
    trigger: '로그인 성공 시',
    additionalParams: ['method']
  },
  'sign_up': {
    name: 'sign_up',
    category: 'basic',
    hasEcommerceData: false,
    pageTypes: ['SIGNUP_COMPLETE'],
    trigger: '회원가입 완료 시',
    additionalParams: ['method']
  },
  'view_search_results': {
    name: 'view_search_results',
    category: 'basic',
    hasEcommerceData: false,
    pageTypes: ['SEARCH_RESULT'],
    trigger: '검색 결과 페이지 진입 시',
    additionalParams: ['search_term']
  },
  'scroll': {
    name: 'scroll',
    category: 'basic',
    hasEcommerceData: false,
    pageTypes: ['ALL'],
    trigger: '페이지 스크롤 시 (90% 도달)'
  },
  'ap_click': {
    name: 'ap_click',
    category: 'basic',
    hasEcommerceData: false,
    pageTypes: ['ALL'],
    trigger: '특정 요소 클릭 시',
    additionalParams: ['click_text', 'click_url', 'click_id', 'click_class']
  },

  // 커스텀 이벤트
  'custom_event': {
    name: 'custom_event',
    category: 'custom',
    hasEcommerceData: false,
    pageTypes: ['ALL'],
    trigger: 'dataLayer.push로 발생',
    additionalParams: ['event_category', 'event_label', 'event_action']
  }
};

// 이커머스 items 배열 내 파라미터
const ECOMMERCE_ITEM_PARAMS = [
  'item_id', 'item_name', 'item_brand', 'item_category', 'item_category2',
  'item_category3', 'item_category4', 'item_category5', 'item_variant',
  'price', 'quantity', 'coupon', 'discount', 'index', 'item_list_name', 'item_list_id',
  // 프로모션용
  'promotion_id', 'promotion_name', 'creative_name', 'creative_slot', 'location_id'
];

function main() {
  console.log('═'.repeat(100));
  console.log(' 전체 이벤트별 파라미터 분석');
  console.log('═'.repeat(100));

  // GTM 파일 로드
  const gtm = JSON.parse(fs.readFileSync(GTM_FILE, 'utf-8'));
  const container = gtm.containerVersion || gtm;
  const tags = container.tag || [];

  // GA4 이벤트 태그 추출
  const ga4EventTags = tags.filter((t: any) => t.type === 'gaawe');

  // 이벤트별 태그 정보 수집
  const eventTags: Record<string, any[]> = {};

  for (const tag of ga4EventTags) {
    const params = tag.parameter || [];
    const eventNameParam = params.find((p: any) => p.key === 'eventName');
    if (eventNameParam?.value) {
      const eventName = eventNameParam.value;
      if (!eventTags[eventName]) {
        eventTags[eventName] = [];
      }
      eventTags[eventName].push(tag);
    }
  }

  // 공통 파라미터 요약
  console.log('\n');
  console.log('━'.repeat(100));
  console.log('📌 공통 파라미터 (모든 이벤트에 적용되는 GT - Event Settings)');
  console.log('━'.repeat(100));

  const totalCommonParams = Object.values(COMMON_EVENT_PARAMS).flat().length;
  console.log(`\n총 ${totalCommonParams}개 Event Parameters + ${COMMON_USER_PROPS.length}개 User Properties\n`);

  for (const [category, params] of Object.entries(COMMON_EVENT_PARAMS)) {
    console.log(`  ${category.toUpperCase().padEnd(12)}: ${params.join(', ')}`);
  }
  console.log(`  ${'USER PROPS'.padEnd(12)}: ${COMMON_USER_PROPS.join(', ')}`);

  // 이벤트별 상세 분석
  console.log('\n');
  console.log('━'.repeat(100));
  console.log('📌 이벤트별 상세 분석');
  console.log('━'.repeat(100));

  // 카테고리별 분류
  const ecommerceEvents: string[] = [];
  const basicEvents: string[] = [];
  const customEvents: string[] = [];

  for (const eventName of Object.keys(eventTags).sort()) {
    const config = EVENT_CONFIGS[eventName];
    if (config?.category === 'ecommerce') {
      ecommerceEvents.push(eventName);
    } else if (config?.category === 'basic') {
      basicEvents.push(eventName);
    } else {
      customEvents.push(eventName);
    }
  }

  // 1. 이커머스 이벤트
  console.log('\n');
  console.log('═'.repeat(80));
  console.log(' 1. 이커머스 이벤트 (Ecommerce Events)');
  console.log('═'.repeat(80));

  for (const eventName of ecommerceEvents) {
    const config = EVENT_CONFIGS[eventName];
    const tagCount = eventTags[eventName]?.length || 0;

    console.log(`\n${'─'.repeat(80)}`);
    console.log(`📦 ${eventName} (${tagCount}개 태그)`);
    console.log('─'.repeat(80));

    if (config) {
      console.log(`   발생 조건: ${config.trigger}`);
      console.log(`   발생 페이지: ${config.pageTypes?.join(', ')}`);
      console.log(`   이커머스 데이터: ${config.hasEcommerceData ? '✅ items 포함' : '❌ 없음'}`);
      if (config.itemsSource) {
        console.log(`   items 소스: ${config.itemsSource}`);
      }
      if (config.additionalParams) {
        console.log(`   추가 파라미터: ${config.additionalParams.join(', ')}`);
      }
    }

    console.log(`\n   📊 수집 파라미터:`);
    console.log(`      - 공통 Event Parameters: ${totalCommonParams}개 (GT - Event Settings)`);
    console.log(`      - User Properties: ${COMMON_USER_PROPS.length}개`);
    if (config?.hasEcommerceData) {
      console.log(`      - items[]: ${ECOMMERCE_ITEM_PARAMS.slice(0, 10).join(', ')}...`);
    }
    if (config?.additionalParams) {
      console.log(`      - 개별: ${config.additionalParams.join(', ')}`);
    }
  }

  // 2. 기본 이벤트
  console.log('\n');
  console.log('═'.repeat(80));
  console.log(' 2. 기본 이벤트 (Basic Events)');
  console.log('═'.repeat(80));

  for (const eventName of basicEvents) {
    const config = EVENT_CONFIGS[eventName];
    const tagCount = eventTags[eventName]?.length || 0;

    console.log(`\n${'─'.repeat(80)}`);
    console.log(`📝 ${eventName} (${tagCount}개 태그)`);
    console.log('─'.repeat(80));

    if (config) {
      console.log(`   발생 조건: ${config.trigger}`);
      console.log(`   발생 페이지: ${config.pageTypes?.join(', ')}`);
      if (config.additionalParams) {
        console.log(`   추가 파라미터: ${config.additionalParams.join(', ')}`);
      }
    }

    console.log(`\n   📊 수집 파라미터:`);
    console.log(`      - 공통 Event Parameters: ${totalCommonParams}개 (GT - Event Settings)`);
    console.log(`      - User Properties: ${COMMON_USER_PROPS.length}개`);
    if (config?.additionalParams) {
      console.log(`      - 개별: ${config.additionalParams.join(', ')}`);
    }
  }

  // 3. 커스텀 이벤트
  console.log('\n');
  console.log('═'.repeat(80));
  console.log(' 3. 커스텀 이벤트 (Custom Events)');
  console.log('═'.repeat(80));

  for (const eventName of customEvents) {
    const tagCount = eventTags[eventName]?.length || 0;

    console.log(`\n${'─'.repeat(80)}`);
    console.log(`🔧 ${eventName} (${tagCount}개 태그)`);
    console.log('─'.repeat(80));

    console.log(`   📊 수집 파라미터:`);
    console.log(`      - 공통 Event Parameters: ${totalCommonParams}개 (GT - Event Settings)`);
    console.log(`      - User Properties: ${COMMON_USER_PROPS.length}개`);
  }

  // 요약 테이블
  console.log('\n');
  console.log('═'.repeat(100));
  console.log(' 요약 테이블');
  console.log('═'.repeat(100));

  console.log('\n| 이벤트 | 카테고리 | 페이지 타입 | items | 공통 | 개별 | 총 파라미터 |');
  console.log('|--------|----------|------------|-------|------|------|------------|');

  for (const eventName of [...ecommerceEvents, ...basicEvents]) {
    const config = EVENT_CONFIGS[eventName];
    if (!config) continue;

    const category = config.category === 'ecommerce' ? '이커머스' : '기본';
    const pageTypes = config.pageTypes?.slice(0, 2).join(',') || '-';
    const hasItems = config.hasEcommerceData ? '✅' : '-';
    const commonCount = totalCommonParams + COMMON_USER_PROPS.length;
    const additionalCount = config.additionalParams?.length || 0;
    const itemsCount = config.hasEcommerceData ? '+items' : '';
    const total = `${commonCount + additionalCount}${itemsCount}`;

    console.log(`| ${eventName.padEnd(20)} | ${category.padEnd(8)} | ${pageTypes.padEnd(14)} | ${hasItems.padEnd(5)} | ${String(commonCount).padEnd(4)} | ${String(additionalCount).padEnd(4)} | ${total.padEnd(10)} |`);
  }

  // 최종 요약
  console.log('\n');
  console.log('═'.repeat(100));
  console.log(' 최종 요약');
  console.log('═'.repeat(100));

  console.log(`
📌 공통 파라미터 (모든 이벤트)
   - Event Parameters: ${totalCommonParams}개
   - User Properties: ${COMMON_USER_PROPS.length}개
   - 합계: ${totalCommonParams + COMMON_USER_PROPS.length}개

📦 이커머스 이벤트 (${ecommerceEvents.length}개)
   - items[] 배열 포함 (상품/프로모션 정보)
   - item 파라미터: ${ECOMMERCE_ITEM_PARAMS.length}개
   - 이벤트: ${ecommerceEvents.join(', ')}

📝 기본 이벤트 (${basicEvents.length}개)
   - items 없음
   - 이벤트: ${basicEvents.join(', ')}

🔧 커스텀 이벤트 (${customEvents.length}개)
   - dataLayer.push로 발생
`);

  // 페이지별 예상 이벤트
  console.log('═'.repeat(100));
  console.log(' 페이지별 예상 이벤트');
  console.log('═'.repeat(100));

  const pageTypeEvents: Record<string, string[]> = {
    'MAIN': [],
    'PRODUCT_LIST': [],
    'PRODUCT_DETAIL': [],
    'SEARCH_RESULT': [],
    'BRAND_MAIN': [],
    'EVENT_LIST': [],
    'EVENT_DETAIL': [],
    'CART': [],
    'ORDER': [],
    'ORDER_COMPLETE': [],
    'MY': [],
    'LOGIN': [],
    'SIGNUP_COMPLETE': [],
  };

  for (const [eventName, config] of Object.entries(EVENT_CONFIGS)) {
    if (config.pageTypes) {
      for (const pageType of config.pageTypes) {
        if (pageType === 'ALL') {
          // ALL인 경우 모든 페이지에 추가
          for (const pt of Object.keys(pageTypeEvents)) {
            if (!pageTypeEvents[pt].includes(eventName)) {
              pageTypeEvents[pt].push(eventName);
            }
          }
        } else if (pageTypeEvents[pageType]) {
          pageTypeEvents[pageType].push(eventName);
        }
      }
    }
  }

  for (const [pageType, events] of Object.entries(pageTypeEvents)) {
    if (events.length === 0) continue;
    console.log(`\n📍 ${pageType}`);
    console.log(`   ${events.join(', ')}`);
  }
}

main();
