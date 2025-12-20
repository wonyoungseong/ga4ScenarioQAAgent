/**
 * GTM Event Settings vs 문서화된 파라미터 비교 분석
 */

// GTM "GT - Event Settings" 변수에서 추출한 파라미터
const gtmEventParameters = [
  // 기본 사이트 정보
  { param: 'site_env', gtmVar: '{{JS - Site Env}}' },
  { param: 'site_name', gtmVar: '{{JS - Site Name}}' },
  { param: 'user_agent', gtmVar: '{{JS - User Agent}}' },
  { param: 'site_language', gtmVar: '{{JS - Site Language}}' },
  { param: 'site_country', gtmVar: '{{JS - Site Country}}' },
  { param: 'content_group', gtmVar: '{{LT - Content Group}}' },
  { param: 'channel', gtmVar: '{{JS - Channel}}' },

  // 로그인 정보
  { param: 'login_id_gcid', gtmVar: '{{JS - Login Id Gcid}}' },
  { param: 'login_id_cid', gtmVar: '{{JS - Login Id Cid}}' },
  { param: 'login_is_login', gtmVar: '{{JS - Login Is Login}}' },

  // 트래픽 타입
  { param: 'traffic_type', gtmVar: '{{JS - Internal Traffic Type}}' },

  // 상품 정보 (PRODUCT_DETAIL 페이지)
  { param: 'product_id', gtmVar: '{{JS - Product Id with View Item}}' },
  { param: 'product_name', gtmVar: '{{JS - Product Name with View Item}}' },
  { param: 'product_category', gtmVar: '{{JS - Product Category with View Item}}' },
  { param: 'product_brandname', gtmVar: '{{JS - Product Brandname with View Item}}' },
  { param: 'product_brandcode', gtmVar: '{{JS - Product Brandcode with View Item}}' },
  { param: 'product_is_stock', gtmVar: '{{JS - Product Is Stock with View Item}}' },

  // 이벤트/프로모션 정보 (EVENT_DETAIL 페이지)
  { param: 'view_event_code', gtmVar: '{{JS - Promotion Code on Detail Page}}' },
  { param: 'view_event_name', gtmVar: '{{JS - Promotion Name on Detail Page}}' },

  // 매장 정보
  { param: 'page_store_code', gtmVar: '{{JS - Store Code from URL}}' },
  { param: 'page_store_name', gtmVar: '{{JS - Store Name from URL}}' },

  // 페이지 위치 정보 (breadcrumb 대체)
  { param: 'page_location_1', gtmVar: '{{JS - Page Location 1}}' },
  { param: 'page_location_2', gtmVar: '{{JS - Page Location 2}}' },
  { param: 'page_location_3', gtmVar: '{{JS - Page Location 3}}' },
  { param: 'page_location_4', gtmVar: '{{JS - Page Location 4}}' },
  { param: 'page_location_5', gtmVar: '{{JS - Page Location 5}}' },

  // 페이지 참조
  { param: 'page_referrer', gtmVar: '{{JS - Page Referrer}}' },

  // 분할된 ID (GA4 100자 제한 대응)
  { param: 'login_id_gcid_1', gtmVar: '{{JS - Login Id Gcid 1}}' },
  { param: 'login_id_gcid_2', gtmVar: '{{JS - Login Id Gcid 2}}' },
  { param: 'login_id_cid_1', gtmVar: '{{JS - Login Id Cid 1}}' },
  { param: 'login_id_cid_2', gtmVar: '{{JS - Login Id Cid 2}}' },

  // 브랜드샵 정보
  { param: 'brandshop_code', gtmVar: '{{JS - Brandshop Code}}' },
  { param: 'brandshop_name', gtmVar: '{{JS - Brandshop Name}}' },

  // 검색 브랜드 정보
  { param: 'search_brand_code', gtmVar: '{{JS - Search Brandshop Code}}' },
  { param: 'search_brand', gtmVar: '{{JS - Search Brandshop Name}}' },
];

// GTM User Properties
const gtmUserProperties = [
  { param: 'login_is_sso', gtmVar: '{{JS - Login Is SSO}}' },
  { param: 'login_gender', gtmVar: '{{JS - Login Gender}}' },
  { param: 'login_birth', gtmVar: '{{JS - Login Birth (year)}}' },
  { param: 'login_level', gtmVar: '{{JS - Login Level (internal)}}' },
  { param: 'login_beauty_level', gtmVar: '{{JS - Login Beauty Level}}' },
  { param: 'login_is_member', gtmVar: '{{JS - Login is Member (employee)}}' },
  { param: 'login_method', gtmVar: '{{JS - Login Method}}' },
  { param: 'user_id', gtmVar: '{{JS - Login Id Gcid}}' },
  { param: 'login_is_subscription', gtmVar: '{{JS - Login Is Subscription}}' },
  { param: 'login_age', gtmVar: '{{JS - Login Age}}' },
];

// PARAM_MAPPING_TABLE.md에 문서화된 page_view 파라미터
const documentedPageViewParams = [
  'site_name',
  'site_country',
  'site_language',
  'site_env',
  'content_group',
  'breadcrumb',
  'login_is_login',
  'channel',
];

// PARAM_MAPPING_TABLE.md에 문서화된 사용자 정보 파라미터
const documentedUserParams = [
  { doc: 'login_id_gcid', devGuide: 'AP_DATA_GCID' },
  { doc: 'login_id_cid', devGuide: 'AP_DATA_CID' },
  { doc: 'is_member', devGuide: 'AP_DATA_ISMEMBER' },
  { doc: 'gender', devGuide: 'AP_DATA_CG' },
  { doc: 'birth_year', devGuide: 'AP_DATA_CD' },
  { doc: 'login_type', devGuide: 'AP_DATA_LOGINTYPE' },
  { doc: 'customer_tier', devGuide: 'AP_DATA_CT' },
  { doc: 'beauty_tier', devGuide: 'AP_DATA_BEAUTYCT' },
  { doc: 'is_employee', devGuide: 'AP_DATA_ISEMPLOYEE' },
];

console.log('═'.repeat(80));
console.log(' GTM Event Settings vs 문서화된 파라미터 비교 분석');
console.log('═'.repeat(80));
console.log();

// 1. Event Parameters 비교
console.log('▶ 1. Event Parameters 비교');
console.log('─'.repeat(80));

const gtmEventParamNames = gtmEventParameters.map(p => p.param);
const allDocumentedParams = [...documentedPageViewParams, ...documentedUserParams.map(p => p.doc)];

// GTM에는 있지만 문서에는 없는 파라미터
const missingInDoc = gtmEventParamNames.filter(p => !allDocumentedParams.includes(p));
console.log('\n📌 GTM에는 있지만 문서에 없는 파라미터 (' + missingInDoc.length + '개):');
missingInDoc.forEach(p => {
  const gtmInfo = gtmEventParameters.find(g => g.param === p);
  console.log(`   - ${p} (GTM: ${gtmInfo?.gtmVar})`);
});

// 문서에는 있지만 GTM에는 없는 파라미터
const missingInGtm = allDocumentedParams.filter(p => !gtmEventParamNames.includes(p));
console.log('\n📌 문서에는 있지만 GTM Event Settings에 없는 파라미터 (' + missingInGtm.length + '개):');
missingInGtm.forEach(p => {
  console.log(`   - ${p}`);
});

// 2. User Properties 비교
console.log('\n▶ 2. User Properties (GA4 사용자 속성) 비교');
console.log('─'.repeat(80));

// 네이밍 매핑 관계
const namingMapping = [
  { gtm: 'login_gender', doc: 'gender', devGuide: 'AP_DATA_CG' },
  { gtm: 'login_birth', doc: 'birth_year', devGuide: 'AP_DATA_CD' },
  { gtm: 'login_level', doc: 'customer_tier', devGuide: 'AP_DATA_CT' },
  { gtm: 'login_beauty_level', doc: 'beauty_tier', devGuide: 'AP_DATA_BEAUTYCT' },
  { gtm: 'login_method', doc: 'login_type', devGuide: 'AP_DATA_LOGINTYPE' },
  { gtm: 'login_is_member', doc: 'is_employee', devGuide: 'AP_DATA_ISEMPLOYEE', note: 'GTM 주석에 employee 언급' },
];

console.log('\n📌 네이밍 불일치 (문서 vs GTM 실제):');
console.log('   문서 파라미터명      → GTM User Property명     개발가이드 변수');
namingMapping.forEach(m => {
  const note = m.note ? ` (${m.note})` : '';
  console.log(`   ${m.doc.padEnd(18)} → ${m.gtm.padEnd(22)} ${m.devGuide}${note}`);
});

// GTM User Properties에만 있는 파라미터
const gtmOnlyUserProps = gtmUserProperties.filter(p =>
  !namingMapping.some(m => m.gtm === p.param) &&
  !['user_id'].includes(p.param)
);
console.log('\n📌 GTM User Properties에만 있는 파라미터 (문서 누락):');
gtmOnlyUserProps.forEach(p => {
  console.log(`   - ${p.param} (GTM: ${p.gtmVar})`);
});

// 3. 정리
console.log('\n▶ 3. 분석 요약');
console.log('─'.repeat(80));

console.log(`
┌────────────────────────────────────────────────────────────────────────────┐
│ 구분                    │ GTM 실제 │ 문서화 │ 차이                        │
├────────────────────────────────────────────────────────────────────────────┤
│ Event Parameters        │ ${gtmEventParamNames.length.toString().padStart(8)} │ ${allDocumentedParams.length.toString().padStart(6)} │ +${missingInDoc.length} 누락, -${missingInGtm.length} 불필요          │
│ User Properties         │ ${gtmUserProperties.length.toString().padStart(8)} │ ${documentedUserParams.length.toString().padStart(6)} │ 네이밍 불일치 ${namingMapping.length}개             │
└────────────────────────────────────────────────────────────────────────────┘
`);

// 4. 조건부 파라미터 분류
console.log('\n▶ 4. 조건부 파라미터 (content_group 기반)');
console.log('─'.repeat(80));

const conditionalParams = {
  'PRODUCT_DETAIL': ['product_id', 'product_name', 'product_category', 'product_brandname', 'product_brandcode', 'product_is_stock'],
  'EVENT_DETAIL': ['view_event_code', 'view_event_name'],
  'STORE_*': ['page_store_code', 'page_store_name'],
  'SEARCH_RESULT': ['search_brand_code', 'search_brand'],
  'BRAND_MAIN': ['brandshop_code', 'brandshop_name'],
};

Object.entries(conditionalParams).forEach(([contentGroup, params]) => {
  console.log(`\n   ${contentGroup}:`);
  params.forEach(p => console.log(`      - ${p}`));
});

// 5. 공통 파라미터 (모든 페이지)
console.log('\n▶ 5. 공통 파라미터 (모든 페이지에서 수집)');
console.log('─'.repeat(80));

const commonParams = [
  'site_env', 'site_name', 'site_language', 'site_country',
  'content_group', 'channel', 'user_agent', 'traffic_type',
  'login_is_login', 'login_id_gcid', 'login_id_cid',
  'login_id_gcid_1', 'login_id_gcid_2', 'login_id_cid_1', 'login_id_cid_2',
  'page_location_1', 'page_location_2', 'page_location_3', 'page_location_4', 'page_location_5',
  'page_referrer'
];

console.log('\n   공통 파라미터 (' + commonParams.length + '개):');
commonParams.forEach(p => console.log(`      - ${p}`));

// 6. 결론 및 권장사항
console.log('\n▶ 6. 권장 조치사항');
console.log('─'.repeat(80));

console.log(`
   ⚠️  주요 이슈:

   1. breadcrumb 파라미터가 GTM에 없음
      → page_location_1 ~ page_location_5로 대체됨
      → 문서 수정 필요

   2. User Property 네이밍 불일치
      → 문서: gender, birth_year, customer_tier, beauty_tier, login_type
      → GTM:  login_gender, login_birth, login_level, login_beauty_level, login_method
      → GTM 실제 값으로 문서 수정 필요

   3. 신규 파라미터 문서화 필요
      → user_agent, traffic_type, page_referrer
      → login_id_gcid_1/2, login_id_cid_1/2 (128자 해시 분할)
      → login_is_sso, login_is_subscription, login_age

   4. 조건부 파라미터 명시 필요
      → content_group별 추가 파라미터 정의
      → PRODUCT_DETAIL: product_* 파라미터
      → EVENT_DETAIL: view_event_* 파라미터

   ✅ 파서 개선 방안:

   1. GTM JSON에서 "GT - Event Settings" 변수 자동 파싱
   2. eventSettingsTable과 userProperties 분리 추출
   3. GTM Variable 이름에서 개발가이드 변수 매핑 유추
   4. content_group 기반 조건부 파라미터 분류
`);

console.log('═'.repeat(80));
