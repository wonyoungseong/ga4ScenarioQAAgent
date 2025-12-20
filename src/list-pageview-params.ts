/**
 * page_view 파라미터 목록 출력
 */
import { loadParameterStore } from './parsers/paramMappingParser';

const store = loadParameterStore(true);

console.log('='.repeat(80));
console.log(' page_view 파라미터 목록');
console.log('='.repeat(80));

console.log(`\nEvent Parameters: ${store.commonEventParams.length}개`);
console.log(`User Properties: ${store.userProperties.length}개`);
console.log(`총합: ${store.commonEventParams.length + store.userProperties.length}개`);

console.log('\n' + '='.repeat(80));
console.log(' Event Parameters');
console.log('='.repeat(80));
console.log('\n| # | GA4 Key | 개발변수 | 예시 | 카테고리 |');
console.log('|---|---------|----------|------|----------|');

let idx = 1;
for (const p of store.commonEventParams) {
  const example = p.example || '-';
  const category = p.category || '-';
  console.log(`| ${idx} | ${p.ga4Key} | ${p.devGuideVar} | ${example} | ${category} |`);
  idx++;
}

console.log('\n' + '='.repeat(80));
console.log(' User Properties');
console.log('='.repeat(80));
console.log('\n| # | GA4 Key | 개발변수 | 예시 |');
console.log('|---|---------|----------|------|');

idx = 1;
for (const p of store.userProperties) {
  const example = p.example || '-';
  console.log(`| ${idx} | ${p.ga4Key} | ${p.devGuideVar} | ${example} |`);
  idx++;
}
