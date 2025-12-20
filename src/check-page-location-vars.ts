/**
 * GTM에서 page_location 변수가 실제로 어떤 값을 참조하는지 확인
 */

import * as fs from 'fs';

const gtm = JSON.parse(fs.readFileSync('./GTM-5FK5X5C4_workspace112.json', 'utf-8'));
const container = gtm.containerVersion || gtm;
const variables = container.variable || [];

console.log('=== page_location 관련 GTM 변수 분석 ===\n');

// Page Location 변수 찾기
const pageLocVars = variables.filter((v: any) =>
  v.name.includes('Page Location') || v.name.includes('Breadcrumb')
);

console.log(`총 ${pageLocVars.length}개 변수 발견\n`);

for (const v of pageLocVars) {
  console.log(`[${v.name}]`);
  console.log(`  타입: ${v.type}`);

  const params = v.parameter || [];
  for (const p of params) {
    if (p.key === 'javascript') {
      console.log(`  JavaScript:`);
      // 코드를 줄바꿈으로 분리해서 보여주기
      const lines = p.value.split('\n').slice(0, 10);
      for (const line of lines) {
        console.log(`    ${line.trim()}`);
      }
      if (p.value.split('\n').length > 10) {
        console.log('    ...(생략)');
      }
    }
  }
  console.log('');
}

// GT - Event Settings에서 page_location 파라미터 확인
console.log('\n=== GT - Event Settings의 page_location 파라미터 ===\n');

const eventSettings = variables.find((v: any) => v.name === 'GT - Event Settings');
if (eventSettings) {
  const params = eventSettings.parameter || [];
  const settingsTable = params.find((p: any) => p.key === 'eventSettingsTable');

  if (settingsTable && settingsTable.list) {
    const pageLocParams = settingsTable.list.filter((item: any) => {
      const map = item.map || [];
      const paramName = map.find((m: any) => m.key === 'parameter')?.value || '';
      return paramName.includes('page_location') || paramName.includes('breadcrumb');
    });

    for (const item of pageLocParams) {
      const map = item.map || [];
      const paramName = map.find((m: any) => m.key === 'parameter')?.value || '';
      const paramValue = map.find((m: any) => m.key === 'parameterValue')?.value || '';
      console.log(`  ${paramName}: ${paramValue}`);
    }
  }
}
