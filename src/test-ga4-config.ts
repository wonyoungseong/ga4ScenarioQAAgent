/**
 * GA4 Parameter Config 테스트
 *
 * view_item 이벤트를 기준으로 새로운 설정 파일 테스트
 */

import {
  GA4_PARAMETERS,
  EVENT_PARAMETER_REQUIREMENTS,
  getParameterByKey,
  getParametersForEvent,
  getScreenExtractableParams,
  generateVisionPromptForEvent,
  validateParameterValue,
  getParametersByScope,
  getCrawlableParameters,
  getGTMMappedParameters,
  CONTENT_GROUP_VALUES,
  SITE_NAMES,
  BEAUTY_LEVELS,
} from './config/ga4ParameterConfig';

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║          GA4 Parameter Config 테스트 (view_item)              ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ═══════════════════════════════════════════════════════════════════════════════
// 1. 기본 통계
// ═══════════════════════════════════════════════════════════════════════════════
console.log('═'.repeat(70));
console.log('📊 기본 통계');
console.log('═'.repeat(70));

console.log(`\n총 파라미터 수: ${GA4_PARAMETERS.length}개`);
console.log(`이벤트 요구사항 정의: ${EVENT_PARAMETER_REQUIREMENTS.length}개 이벤트`);

// Scope별 파라미터 수
const eventParams = getParametersByScope('event');
const userParams = getParametersByScope('user');
const itemParams = getParametersByScope('item');
console.log(`\nScope별 파라미터:`);
console.log(`  - event: ${eventParams.length}개`);
console.log(`  - user: ${userParams.length}개`);
console.log(`  - item: ${itemParams.length}개`);

// GTM 매핑된 파라미터
const gtmMapped = getGTMMappedParameters();
console.log(`\nGTM 변수 매핑된 파라미터: ${gtmMapped.length}개`);

// 크롤링 설정된 파라미터
const crawlable = getCrawlableParameters();
console.log(`크롤링 설정된 파라미터: ${crawlable.length}개`);

// ═══════════════════════════════════════════════════════════════════════════════
// 2. view_item 이벤트 파라미터
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(70));
console.log('🛒 view_item 이벤트 파라미터');
console.log('═'.repeat(70));

const viewItemParams = getParametersForEvent('view_item');

console.log('\n📌 필수 파라미터 (Required):');
for (const param of viewItemParams.required) {
  console.log(`  - ${param.key} (${param.displayName})`);
  console.log(`    설명: ${param.description}`);
  console.log(`    예시: ${param.examples.slice(0, 3).join(', ')}`);
  console.log(`    추출방법: ${param.extractionMethods.join(', ')}`);
}

console.log('\n📋 선택 파라미터 (Optional):');
for (const param of viewItemParams.optional.slice(0, 5)) {
  console.log(`  - ${param.key}: ${param.description.substring(0, 50)}...`);
}
if (viewItemParams.optional.length > 5) {
  console.log(`  ... 외 ${viewItemParams.optional.length - 5}개`);
}

console.log('\n📦 아이템 파라미터 (Item-level):');
for (const param of viewItemParams.item) {
  const visionHint = param.visionHint ? '✅ Vision' : '  ';
  const gtmHint = param.gtmMapping ? '✅ GTM' : '  ';
  console.log(`  ${visionHint} ${gtmHint} ${param.key}: ${param.description.substring(0, 40)}...`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. 화면 추출 가능한 파라미터
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(70));
console.log('👁️ 화면에서 추출 가능한 파라미터 (Vision AI)');
console.log('═'.repeat(70));

const screenParams = getScreenExtractableParams('view_item');
console.log(`\n총 ${screenParams.length}개 파라미터를 화면에서 추출 가능:\n`);

for (const param of screenParams) {
  console.log(`📍 ${param.key} (${param.displayName})`);
  if (param.visionHint) {
    console.log(`   위치: ${param.visionHint.locationHint}`);
    if (param.visionHint.contextHint) {
      console.log(`   힌트: ${param.visionHint.contextHint}`);
    }
    if (param.visionHint.textPattern) {
      console.log(`   패턴: ${param.visionHint.textPattern}`);
    }
  }
  console.log(`   예시: ${param.examples.slice(0, 2).join(', ')}`);
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Vision AI 프롬프트 생성
// ═══════════════════════════════════════════════════════════════════════════════
console.log('═'.repeat(70));
console.log('🤖 Vision AI 프롬프트 (자동 생성)');
console.log('═'.repeat(70));

const visionPrompt = generateVisionPromptForEvent('view_item');
console.log('\n' + visionPrompt);

// ═══════════════════════════════════════════════════════════════════════════════
// 5. 파라미터 값 검증 테스트
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(70));
console.log('✅ 파라미터 값 검증 테스트');
console.log('═'.repeat(70));

const testCases = [
  { key: 'currency', value: 'KRW', expected: true },
  { key: 'currency', value: 'KOREA', expected: false },
  { key: 'site_country', value: 'KR', expected: true },
  { key: 'site_country', value: 'KOREA', expected: false },
  { key: 'login_is_login', value: 'Y', expected: true },
  { key: 'login_is_login', value: 'YES', expected: false },
  { key: 'login_birth', value: '1990', expected: true },
  { key: 'login_birth', value: '90', expected: false },
  { key: 'checkout_seq', value: '1', expected: true },
  { key: 'checkout_seq', value: '5', expected: false },
  { key: 'login_beauty_level', value: 'GOLD', expected: true },
  { key: 'login_beauty_level', value: 'DIAMOND', expected: false },
];

console.log('\n');
for (const tc of testCases) {
  const result = validateParameterValue(tc.key, tc.value);
  const status = result.valid === tc.expected ? '✅' : '❌';
  const validText = result.valid ? 'VALID' : 'INVALID';
  console.log(`${status} ${tc.key}="${tc.value}" → ${validText}`);
  if (!result.valid && result.errors.length > 0) {
    console.log(`   오류: ${result.errors[0]}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. GTM 변수 매핑 정보
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(70));
console.log('🏷️ view_item GTM 변수 매핑');
console.log('═'.repeat(70));

const allViewItemParams = [...viewItemParams.required, ...viewItemParams.optional, ...viewItemParams.item];
const gtmMappedViewItem = allViewItemParams.filter(p => p.gtmMapping);

console.log(`\nGTM 변수 매핑된 파라미터: ${gtmMappedViewItem.length}개\n`);

for (const param of gtmMappedViewItem) {
  if (param.gtmMapping) {
    console.log(`📍 ${param.key}`);
    console.log(`   GTM 변수: ${param.gtmMapping.variableName}`);
    console.log(`   타입: ${param.gtmMapping.variableType}`);
    if (param.gtmMapping.valueSource) {
      console.log(`   소스: ${param.gtmMapping.valueSource}`);
    }
    console.log('');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. 크롤링 설정 정보
// ═══════════════════════════════════════════════════════════════════════════════
console.log('═'.repeat(70));
console.log('🕷️ view_item 크롤링 설정');
console.log('═'.repeat(70));

const crawlableViewItem = allViewItemParams.filter(p => p.crawlingConfig);

console.log(`\n크롤링 설정된 파라미터: ${crawlableViewItem.length}개\n`);

for (const param of crawlableViewItem) {
  if (param.crawlingConfig) {
    console.log(`📍 ${param.key}`);
    if (param.crawlingConfig.selector) {
      console.log(`   선택자: ${param.crawlingConfig.selector}`);
    }
    if (param.crawlingConfig.attribute) {
      console.log(`   속성: ${param.crawlingConfig.attribute}`);
    }
    if (param.crawlingConfig.transform) {
      console.log(`   변환: ${param.crawlingConfig.transform}`);
    }
    console.log('');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. 상수 값 확인
// ═══════════════════════════════════════════════════════════════════════════════
console.log('═'.repeat(70));
console.log('📋 정의된 상수 값');
console.log('═'.repeat(70));

console.log('\n🏠 Content Group (페이지 타입):');
console.log(`   ${CONTENT_GROUP_VALUES.join(', ')}`);

console.log('\n🏪 Site Names:');
console.log(`   ${SITE_NAMES.slice(0, 8).join(', ')}...`);

console.log('\n💎 Beauty Levels (뷰티포인트 등급):');
console.log(`   ${BEAUTY_LEVELS.join(' → ')}`);

// ═══════════════════════════════════════════════════════════════════════════════
// 9. 실제 예측값 시뮬레이션
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(70));
console.log('🎯 실제 예측값 시뮬레이션 (아모레몰 상품 상세)');
console.log('═'.repeat(70));

const simulatedPrediction = {
  // Event-level parameters
  currency: 'KRW',
  value: 111500,
  content_group: 'PRODUCT_DETAIL',
  site_name: 'APMALL',
  site_country: 'KR',
  site_language: 'KO',
  channel: 'PC',
  login_is_login: 'N',

  // Item-level parameters
  items: [{
    item_id: '111170002462',
    item_name: '[아세페 ONLY] 탄력크림 단품세트 75ml',
    item_brand: '설화수',
    price: 111500,
    original_price: 135000,
    discount: 23500,
    item_category: '스킨케어',
    apg_brand_code: '11117',
  }],
};

console.log('\n시뮬레이션 예측값:');
console.log(JSON.stringify(simulatedPrediction, null, 2));

// 검증
console.log('\n검증 결과:');
const keysToValidate = ['currency', 'content_group', 'site_country', 'site_language', 'login_is_login'];
for (const key of keysToValidate) {
  const value = simulatedPrediction[key as keyof typeof simulatedPrediction];
  if (typeof value === 'string' || typeof value === 'number') {
    const result = validateParameterValue(key, value);
    const status = result.valid ? '✅' : '❌';
    console.log(`  ${status} ${key}="${value}"`);
    if (!result.valid) {
      console.log(`     오류: ${result.errors.join(', ')}`);
    }
  }
}

console.log('\n' + '═'.repeat(70));
console.log('테스트 완료');
console.log('═'.repeat(70));
