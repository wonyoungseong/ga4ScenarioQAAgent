/**
 * 이벤트 파라미터 상세 분석
 */

import * as fs from 'fs';

const gtm = JSON.parse(fs.readFileSync('./GTM-5FK5X5C4_workspace112.json', 'utf-8'));

// 특정 태그의 상세 파라미터 분석
const targetTagIds = ['336', '338', '347', '599']; // login, click_with_duration, custom_event, qualified_visit

console.log('=== 이벤트 파라미터 상세 분석 ===\n');

for (const tag of gtm.containerVersion.tag || []) {
  if (targetTagIds.includes(tag.tagId)) {
    console.log('='.repeat(70));
    console.log(`Tag: ${tag.name}`);
    console.log(`Tag ID: ${tag.tagId}`);
    console.log('='.repeat(70));

    for (const param of tag.parameter || []) {
      console.log(`\nParameter Key: ${param.key}`);
      if (param.value) {
        console.log(`  Value: ${param.value}`);
      }
      if (param.list) {
        console.log('  List Items:');
        for (const item of param.list) {
          if (item.map) {
            const name = item.map.find((m: any) => m.key === 'name')?.value || '';
            const value = item.map.find((m: any) => m.key === 'value')?.value || '';
            console.log(`    - ${name}: ${value}`);
          }
        }
      }
    }
    console.log('\n');
  }
}

// AP_ 변수 분석 (login 관련)
console.log('\n=== AP_ 변수 분석 ===\n');

const loginVars = ['AP_DATA_LOGINTYPE', 'AP_DATA_ISLOGIN', 'AP_DATA_ISSSO', 'AP_DATA_ISEMPLOYEE'];

for (const variable of gtm.containerVersion.variable || []) {
  if (loginVars.includes(variable.name) ||
      variable.name.includes('LOGIN') ||
      variable.name.includes('Click') ||
      variable.name.includes('Duration')) {
    console.log(`📊 ${variable.name}`);
    console.log(`   Type: ${variable.type}`);

    if (variable.type === 'v') {
      const name = variable.parameter?.find((p: any) => p.key === 'name')?.value;
      console.log(`   DataLayer Key: ${name}`);
    }

    if (variable.type === 'jsm') {
      const code = variable.parameter?.find((p: any) => p.key === 'javascript')?.value || '';
      console.log(`   JS Code Preview: ${code.substring(0, 80)}...`);
    }
    console.log('');
  }
}

// click_with_duration 관련 변수
console.log('\n=== Click/Duration 관련 변수 ===\n');

for (const variable of gtm.containerVersion.variable || []) {
  const name = variable.name.toLowerCase();
  if (name.includes('duration') || name.includes('click_area') || name.includes('click_name')) {
    console.log(`📊 ${variable.name}`);
    console.log(`   Type: ${variable.type}`);

    if (variable.type === 'v') {
      const dlName = variable.parameter?.find((p: any) => p.key === 'name')?.value;
      console.log(`   DataLayer Key: ${dlName}`);
    }
    console.log('');
  }
}
