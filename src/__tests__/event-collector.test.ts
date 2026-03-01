/**
 * Event Collector 테스트
 *
 * GA4 네트워크 요청 파싱 로직 검증:
 * 1. URL query string 파싱
 * 2. POST body 파싱 (단일/멀티 이벤트)
 * 3. Event parameter (ep.*, epn.*) 파싱
 * 4. Ecommerce product (pr[N]*) 파싱
 * 5. 혼합 (URL query + POST body) 파싱
 */

import {
  parseGA4Request,
  GA4_COLLECT_PATTERN,
  type CapturedGA4Event,
  type GA4Parameter,
  type GA4ProductParam,
  type EventCollectedData,
} from '../agents/collector/event-collector';

// ═══════════════════════════════════════════════════════════════════════════
// 1. GA4 URL 패턴 매칭
// ═══════════════════════════════════════════════════════════════════════════

function testGA4URLPattern(): void {
  // 매칭해야 하는 URL들
  const shouldMatch = [
    'https://www.google-analytics.com/g/collect?v=2&tid=G-XXXXX',
    'https://analytics.google.com/g/collect?v=2',
    'http://www.google-analytics.com/g/collect',
    'https://region1.google-analytics.com/g/collect?v=2',
  ];

  for (const url of shouldMatch) {
    if (!GA4_COLLECT_PATTERN.test(url)) {
      throw new Error(`GA4_COLLECT_PATTERN should match: ${url}`);
    }
  }

  // 매칭하지 않아야 하는 URL들
  const shouldNotMatch = [
    'https://www.google.com/some-other-path',
    'https://example.com/analytics',
  ];

  for (const url of shouldNotMatch) {
    if (GA4_COLLECT_PATTERN.test(url)) {
      throw new Error(`GA4_COLLECT_PATTERN should NOT match: ${url}`);
    }
  }

  console.log('  ✅ GA4 URL 패턴 매칭 테스트 통과');
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. URL query string만으로 파싱
// ═══════════════════════════════════════════════════════════════════════════

function testQueryStringParsing(): void {
  const url = 'https://www.google-analytics.com/g/collect?v=2&tid=G-TEST123&cid=12345&en=page_view&dl=https%3A%2F%2Fexample.com%2Fproduct&dt=Product%20Page&ul=ja';

  const events = parseGA4Request(url);

  if (events.length !== 1) {
    throw new Error(`Expected 1 event, got ${events.length}`);
  }

  const event = events[0];
  if (event.event_name !== 'page_view') {
    throw new Error(`Expected event_name 'page_view', got '${event.event_name}'`);
  }
  if (event.tracking_id !== 'G-TEST123') {
    throw new Error(`Expected tracking_id 'G-TEST123', got '${event.tracking_id}'`);
  }
  if (event.document_location !== 'https://example.com/product') {
    throw new Error(`Expected dl 'https://example.com/product', got '${event.document_location}'`);
  }
  if (event.document_title !== 'Product Page') {
    throw new Error(`Expected dt 'Product Page', got '${event.document_title}'`);
  }
  if (event.client_id !== '12345') {
    throw new Error(`Expected cid '12345', got '${event.client_id}'`);
  }

  // raw_params 확인
  if (event.raw_params['v'] !== '2') {
    throw new Error(`Expected raw_params v='2', got '${event.raw_params['v']}'`);
  }
  if (event.raw_params['ul'] !== 'ja') {
    throw new Error(`Expected raw_params ul='ja', got '${event.raw_params['ul']}'`);
  }

  console.log('  ✅ URL query string 파싱 테스트 통과');
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Event Parameter (ep.*, epn.*) 파싱
// ═══════════════════════════════════════════════════════════════════════════

function testEventParameterParsing(): void {
  const url = 'https://www.google-analytics.com/g/collect?v=2&tid=G-TEST&en=view_item&ep.page_title=ProductABC&epn.engagement_time=1500&ep.content_group=product_detail';

  const events = parseGA4Request(url);
  const event = events[0];

  // ep.page_title
  const pageTitle = event.parameters.find(p => p.key === 'ep.page_title');
  if (!pageTitle) throw new Error('ep.page_title not found');
  if (pageTitle.value !== 'ProductABC') {
    throw new Error(`Expected ep.page_title 'ProductABC', got '${pageTitle.value}'`);
  }
  if (pageTitle.group !== 'event') {
    throw new Error(`Expected group 'event', got '${pageTitle.group}'`);
  }
  if (!pageTitle.field.includes('page_title')) {
    throw new Error(`Expected field to contain 'page_title', got '${pageTitle.field}'`);
  }

  // epn.engagement_time (numeric)
  const engTime = event.parameters.find(p => p.key === 'epn.engagement_time');
  if (!engTime) throw new Error('epn.engagement_time not found');
  if (engTime.value !== '1500') {
    throw new Error(`Expected epn.engagement_time '1500', got '${engTime.value}'`);
  }
  if (!engTime.field.includes('numeric')) {
    throw new Error(`Expected numeric field indicator, got '${engTime.field}'`);
  }

  console.log('  ✅ Event Parameter (ep.*/epn.*) 파싱 테스트 통과');
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Ecommerce Product (pr[N]*) 파싱
// ═══════════════════════════════════════════════════════════════════════════

function testEcommerceProductParsing(): void {
  const url = 'https://www.google-analytics.com/g/collect?v=2&tid=G-TEST&en=view_item&pr1id=SKU-001&pr1nm=Product%20Alpha&pr1br=BrandA&pr1ca=Skincare&pr1pr=39000&pr1qt=1&pr2id=SKU-002&pr2nm=Product%20Beta&pr2pr=25000';

  const events = parseGA4Request(url);
  const event = events[0];

  if (!event.products || event.products.length !== 2) {
    throw new Error(`Expected 2 products, got ${event.products?.length || 0}`);
  }

  const p1 = event.products[0];
  if (p1.index !== 1) throw new Error(`Expected product 1 index=1, got ${p1.index}`);
  if (p1.id !== 'SKU-001') throw new Error(`Expected id 'SKU-001', got '${p1.id}'`);
  if (p1.name !== 'Product Alpha') throw new Error(`Expected name 'Product Alpha', got '${p1.name}'`);
  if (p1.brand !== 'BrandA') throw new Error(`Expected brand 'BrandA', got '${p1.brand}'`);
  if (p1.category !== 'Skincare') throw new Error(`Expected category 'Skincare', got '${p1.category}'`);
  if (p1.price !== '39000') throw new Error(`Expected price '39000', got '${p1.price}'`);
  if (p1.quantity !== '1') throw new Error(`Expected quantity '1', got '${p1.quantity}'`);

  const p2 = event.products[1];
  if (p2.index !== 2) throw new Error(`Expected product 2 index=2, got ${p2.index}`);
  if (p2.id !== 'SKU-002') throw new Error(`Expected id 'SKU-002', got '${p2.id}'`);
  if (p2.name !== 'Product Beta') throw new Error(`Expected name 'Product Beta', got '${p2.name}'`);
  if (p2.price !== '25000') throw new Error(`Expected price '25000', got '${p2.price}'`);

  // parameters에도 포함되어야 함
  const pr1nmParam = event.parameters.find(p => p.key === 'pr1nm');
  if (!pr1nmParam) throw new Error('pr1nm not found in parameters');
  if (pr1nmParam.group !== 'ecommerce') {
    throw new Error(`Expected group 'ecommerce', got '${pr1nmParam.group}'`);
  }
  if (!pr1nmParam.field.includes('Product 1 Name')) {
    throw new Error(`Expected field 'Product 1 Name', got '${pr1nmParam.field}'`);
  }

  console.log('  ✅ Ecommerce Product (pr[N]*) 파싱 테스트 통과');
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. POST body 단일 이벤트 파싱
// ═══════════════════════════════════════════════════════════════════════════

function testPostDataSingleEvent(): void {
  const url = 'https://www.google-analytics.com/g/collect?v=2&tid=G-TEST&cid=abc';
  const postData = 'en=page_view&ep.page_title=Home&epn.engagement_time=100';

  const events = parseGA4Request(url, postData);

  if (events.length !== 1) {
    throw new Error(`Expected 1 event, got ${events.length}`);
  }

  const event = events[0];
  if (event.event_name !== 'page_view') {
    throw new Error(`Expected event_name 'page_view', got '${event.event_name}'`);
  }
  // base params (URL query) 포함 확인
  if (event.tracking_id !== 'G-TEST') {
    throw new Error(`Expected tid 'G-TEST', got '${event.tracking_id}'`);
  }
  if (event.client_id !== 'abc') {
    throw new Error(`Expected cid 'abc', got '${event.client_id}'`);
  }

  console.log('  ✅ POST body 단일 이벤트 파싱 테스트 통과');
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. POST body 멀티 이벤트 파싱
// ═══════════════════════════════════════════════════════════════════════════

function testPostDataMultiEvents(): void {
  const url = 'https://www.google-analytics.com/g/collect?v=2&tid=G-MULTI&cid=xyz';
  const postData = 'en=page_view&ep.page_title=Home&epn.engagement_time=100\nen=scroll&epn.percent_scrolled=90';

  const events = parseGA4Request(url, postData);

  if (events.length !== 2) {
    throw new Error(`Expected 2 events, got ${events.length}`);
  }

  // 첫 번째 이벤트
  if (events[0].event_name !== 'page_view') {
    throw new Error(`Event[0] expected 'page_view', got '${events[0].event_name}'`);
  }
  if (events[0].tracking_id !== 'G-MULTI') {
    throw new Error(`Event[0] expected tid 'G-MULTI', got '${events[0].tracking_id}'`);
  }

  // 두 번째 이벤트
  if (events[1].event_name !== 'scroll') {
    throw new Error(`Event[1] expected 'scroll', got '${events[1].event_name}'`);
  }
  if (events[1].tracking_id !== 'G-MULTI') {
    throw new Error(`Event[1] expected tid 'G-MULTI' (inherited from URL), got '${events[1].tracking_id}'`);
  }
  if (events[1].raw_params['epn.percent_scrolled'] !== '90') {
    throw new Error(`Event[1] expected percent_scrolled '90'`);
  }

  console.log('  ✅ POST body 멀티 이벤트 파싱 테스트 통과');
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. 빈 POST data / null 처리
// ═══════════════════════════════════════════════════════════════════════════

function testEmptyPostData(): void {
  const url = 'https://www.google-analytics.com/g/collect?v=2&tid=G-TEST&en=page_view';

  // null
  const events1 = parseGA4Request(url, null);
  if (events1.length !== 1) throw new Error('null postData: expected 1 event');
  if (events1[0].event_name !== 'page_view') throw new Error('null postData: expected page_view');

  // undefined
  const events2 = parseGA4Request(url, undefined);
  if (events2.length !== 1) throw new Error('undefined postData: expected 1 event');

  // empty string
  const events3 = parseGA4Request(url, '');
  if (events3.length !== 1) throw new Error('empty postData: expected 1 event');

  // whitespace only
  const events4 = parseGA4Request(url, '   ');
  if (events4.length !== 1) throw new Error('whitespace postData: expected 1 event');

  console.log('  ✅ 빈 POST data / null 처리 테스트 통과');
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. Content Group 파싱
// ═══════════════════════════════════════════════════════════════════════════

function testContentGroupParsing(): void {
  const url = 'https://www.google-analytics.com/g/collect?v=2&tid=G-TEST&en=page_view&cg=product_detail';

  const events = parseGA4Request(url);
  const event = events[0];

  if (event.content_group !== 'product_detail') {
    throw new Error(`Expected content_group 'product_detail', got '${event.content_group}'`);
  }

  const cgParam = event.parameters.find(p => p.key === 'cg');
  if (!cgParam) throw new Error('cg not found in parameters');
  if (!cgParam.field.includes('Content Group')) {
    throw new Error(`Expected field containing 'Content Group', got '${cgParam.field}'`);
  }

  console.log('  ✅ Content Group 파싱 테스트 통과');
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. 타입 정합성 검증
// ═══════════════════════════════════════════════════════════════════════════

function testTypeConsistency(): void {
  // CapturedGA4Event 타입 검증
  const event: CapturedGA4Event = {
    event_name: 'test',
    timestamp: new Date().toISOString(),
    request_url: 'https://example.com',
    tracking_id: 'G-TEST',
    parameters: [],
    raw_params: {},
  };

  // optional 필드 할당
  event.document_location = 'https://example.com';
  event.document_title = 'Test';
  event.content_group = 'test';
  event.user_id = 'uid123';
  event.client_id = 'cid456';
  event.products = [{ index: 1, id: 'SKU-1', name: 'Product', price: '100' }];

  // GA4Parameter 타입 검증
  const param: GA4Parameter = {
    key: 'ep.test',
    field: 'Event Param: test',
    value: 'value',
    group: 'event',
  };
  event.parameters.push(param);

  // GA4ProductParam 타입 검증
  const product: GA4ProductParam = {
    index: 1,
    id: 'SKU',
    name: 'Product',
    brand: 'Brand',
    category: 'Cat',
    variant: 'Var',
    price: '100',
    quantity: '2',
  };
  if (product.index !== 1) throw new Error('Product index check failed');

  // EventCollectedData 타입 검증
  const collected: EventCollectedData = {
    channel: 'pc_no_login',
    url: 'https://example.com',
    collected_at: new Date().toISOString(),
    captured_events: [event],
    errors: [],
    collection_duration_ms: 1000,
  };
  collected.page_title = 'Test Page';
  collected.final_url = 'https://example.com/final';

  if (collected.captured_events.length !== 1) {
    throw new Error('EventCollectedData type check failed');
  }

  console.log('  ✅ 타입 정합성 검증 테스트 통과');
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. URL 인코딩 처리
// ═══════════════════════════════════════════════════════════════════════════

function testURLEncodedValues(): void {
  const url = 'https://www.google-analytics.com/g/collect?v=2&tid=G-TEST&en=page_view&dt=%E5%95%86%E5%93%81%E3%83%9A%E3%83%BC%E3%82%B8&dl=https%3A%2F%2Fexample.com%2F%E5%95%86%E5%93%81';

  const events = parseGA4Request(url);
  const event = events[0];

  // URL-decoded 일본어 값 확인
  if (!event.document_title) {
    throw new Error('document_title should be set');
  }
  // URL 디코딩은 URL 객체의 searchParams가 자동 처리
  if (!event.document_location) {
    throw new Error('document_location should be set');
  }

  console.log('  ✅ URL 인코딩 처리 테스트 통과');
}

// ═══════════════════════════════════════════════════════════════════════════
// Jest Test Suite
// ═══════════════════════════════════════════════════════════════════════════

describe('Event Collector', () => {
  test('GA4 URL 패턴 매칭', () => {
    testGA4URLPattern();
  });

  test('URL query string 파싱', () => {
    testQueryStringParsing();
  });

  test('Event Parameter 파싱', () => {
    testEventParameterParsing();
  });

  test('Ecommerce Product 파싱', () => {
    testEcommerceProductParsing();
  });

  test('POST body 단일 이벤트', () => {
    testPostDataSingleEvent();
  });

  test('POST body 멀티 이벤트', () => {
    testPostDataMultiEvents();
  });

  test('빈 POST data 처리', () => {
    testEmptyPostData();
  });

  test('Content Group 파싱', () => {
    testContentGroupParsing();
  });

  test('타입 정합성 검증', () => {
    testTypeConsistency();
  });

  test('URL 인코딩 처리', () => {
    testURLEncodedValues();
  });
});
