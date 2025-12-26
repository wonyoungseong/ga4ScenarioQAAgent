/**
 * GTM 이벤트 상세 파라미터 분석
 */

import * as fs from 'fs';

const gtm = JSON.parse(fs.readFileSync('./GTM-5FK5X5C4_workspace112.json', 'utf-8'));

// 대상 이벤트
const targetEvents = [
  { eventName: 'click_with_duration', tagIds: ['338', '326'] },
  { eventName: 'login', tagIds: ['336', '353'] },
  { eventName: 'custom_event', tagIds: ['347', '345'] },
  { eventName: 'qualified_visit', tagIds: ['599'] },
];

// 변수 맵 생성
const variableMap: Record<string, any> = {};
for (const variable of gtm.containerVersion.variable || []) {
  variableMap[variable.name] = variable;
}

// 트리거 맵 생성
const triggerMap: Record<string, any> = {};
for (const trigger of gtm.containerVersion.trigger || []) {
  triggerMap[trigger.triggerId] = trigger;
}

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║       GTM 이벤트 상세 파라미터 분석                                 ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

for (const targetEvent of targetEvents) {
  console.log('\n' + '='.repeat(80));
  console.log(`📌 이벤트: ${targetEvent.eventName.toUpperCase()}`);
  console.log('='.repeat(80));

  for (const tagId of targetEvent.tagIds) {
    const tag = (gtm.containerVersion.tag || []).find((t: any) => t.tagId === tagId);
    if (!tag) continue;

    console.log(`\n[Tag ${tagId}] ${tag.name}`);
    console.log('-'.repeat(60));

    // 1. Event Name
    const eventNameParam = tag.parameter?.find((p: any) => p.key === 'eventName');
    console.log(`\n1. GA4 이벤트명: ${eventNameParam?.value || 'N/A'}`);

    // 2. Event Settings Table (inline parameters)
    const settingsTable = tag.parameter?.find((p: any) => p.key === 'eventSettingsTable');
    if (settingsTable?.list?.length > 0) {
      console.log('\n2. 이벤트 파라미터 (eventSettingsTable):');
      for (const item of settingsTable.list) {
        const map = item.map || [];
        const name = map.find((m: any) => m.key === 'parameter')?.value || '';
        const value = map.find((m: any) => m.key === 'parameterValue')?.value || '';
        if (name) {
          // 변수 참조 해석
          let resolvedValue = value;
          if (value.startsWith('{{') && value.endsWith('}}')) {
            const varName = value.slice(2, -2);
            const variable = variableMap[varName];
            if (variable?.type === 'v') {
              const dlKey = variable.parameter?.find((p: any) => p.key === 'name')?.value;
              resolvedValue = `${value} → dataLayer: "${dlKey}"`;
            } else if (variable?.type === 'jsm') {
              resolvedValue = `${value} → JavaScript Variable`;
            } else if (variable?.type === 'c') {
              const constValue = variable.parameter?.find((p: any) => p.key === 'value')?.value;
              resolvedValue = `${value} → Constant: "${constValue}"`;
            }
          }
          console.log(`   📍 ${name}: ${resolvedValue}`);
        }
      }
    }

    // 3. Event Settings Variable (shared settings)
    const settingsVar = tag.parameter?.find((p: any) => p.key === 'eventSettingsVariable')?.value;
    if (settingsVar) {
      const varName = settingsVar.slice(2, -2);
      const variable = variableMap[varName];
      if (variable?.type === 'gtesv') {
        console.log(`\n3. 공통 이벤트 설정 (${settingsVar}):`);
        const settingsParam = variable.parameter?.find((p: any) => p.key === 'eventSettingsTable');
        if (settingsParam?.list) {
          for (const item of settingsParam.list) {
            const map = item.map || [];
            const name = map.find((m: any) => m.key === 'parameter')?.value || '';
            const value = map.find((m: any) => m.key === 'parameterValue')?.value || '';
            if (name) {
              // 변수 참조 해석
              let resolvedValue = value;
              if (value.startsWith('{{') && value.endsWith('}}')) {
                const innerVarName = value.slice(2, -2);
                const innerVar = variableMap[innerVarName];
                if (innerVar?.type === 'v') {
                  const dlKey = innerVar.parameter?.find((p: any) => p.key === 'name')?.value;
                  resolvedValue = `dataLayer["${dlKey}"]`;
                } else if (innerVar?.type === 'jsm') {
                  resolvedValue = `JS Variable`;
                }
              }
              console.log(`   🔹 ${name}: ${resolvedValue}`);
            }
          }
        }
      }
    }

    // 4. Trigger 정보
    if (tag.firingTriggerId?.length > 0) {
      console.log(`\n4. 트리거:`);
      for (const triggerId of tag.firingTriggerId) {
        const trigger = triggerMap[triggerId];
        if (trigger) {
          console.log(`   📎 [${triggerId}] ${trigger.name} (${trigger.type})`);

          // Custom Event Filter
          if (trigger.customEventFilter) {
            console.log('      조건 (Custom Event Filter):');
            for (const f of trigger.customEventFilter) {
              const type = f.type;
              const arg0 = f.parameter?.find((p: any) => p.key === 'arg0')?.value || '';
              const arg1 = f.parameter?.find((p: any) => p.key === 'arg1')?.value || '';
              console.log(`        - ${type}: ${arg0} = "${arg1}"`);
            }
          }

          // General Filter
          if (trigger.filter) {
            console.log('      조건 (Filter):');
            for (const f of trigger.filter) {
              const type = f.type;
              const arg0 = f.parameter?.find((p: any) => p.key === 'arg0')?.value || '';
              const arg1 = f.parameter?.find((p: any) => p.key === 'arg1')?.value || '';
              console.log(`        - ${type}: ${arg0} = "${arg1}"`);
            }
          }
        }
      }
    }
  }
}

// AP_ 변수 상세 분석
console.log('\n\n' + '='.repeat(80));
console.log('📊 AP_ 변수 상세 분석');
console.log('='.repeat(80));

const apVariables = [
  'AP_DATA_LOGINTYPE', 'AP_DATA_ISLOGIN', 'AP_DATA_ISSSO', 'AP_DATA_ISEMPLOYEE',
  'AP_DATA_PAGETYPE', 'AP_DATA_COUNTRY', 'AP_DATA_USERID',
];

for (const apVarName of apVariables) {
  const variable = (gtm.containerVersion.variable || []).find((v: any) => v.name === apVarName);
  if (variable) {
    console.log(`\n📌 ${variable.name}`);
    console.log(`   타입: ${variable.type}`);

    if (variable.type === 'v') {
      const dataLayerKey = variable.parameter?.find((p: any) => p.key === 'name')?.value;
      console.log(`   DataLayer 키: ${dataLayerKey}`);
    } else if (variable.type === 'jsm') {
      const code = variable.parameter?.find((p: any) => p.key === 'javascript')?.value || '';
      console.log(`   JavaScript: ${code.substring(0, 100)}...`);
    }
  }
}

// Duration 관련 dataLayer 키 정리
console.log('\n\n' + '='.repeat(80));
console.log('⏱️ Duration 관련 DataLayer 키');
console.log('='.repeat(80));

const durationVars = (gtm.containerVersion.variable || []).filter((v: any) =>
  v.name.includes('Duration') && v.type === 'v'
);

for (const v of durationVars) {
  const dlKey = v.parameter?.find((p: any) => p.key === 'name')?.value;
  console.log(`   ${v.name}: dataLayer["${dlKey}"]`);
}

// qualified_visit 상세 분석
console.log('\n\n' + '='.repeat(80));
console.log('🎯 qualified_visit 캠페인 이벤트 분석');
console.log('='.repeat(80));

const qualifiedTag = (gtm.containerVersion.tag || []).find((t: any) => t.tagId === '599');
if (qualifiedTag) {
  console.log('\n태그 정보:');
  console.log(`   이름: ${qualifiedTag.name}`);
  console.log(`   이벤트: qualified_visit`);

  // 트리거 분석
  const triggerId = qualifiedTag.firingTriggerId?.[0];
  const trigger = triggerMap[triggerId];
  if (trigger) {
    console.log(`\n트리거: ${trigger.name}`);
    console.log(`   타입: ${trigger.type}`);

    if (trigger.customEventFilter) {
      console.log('   Custom Event Filter:');
      for (const f of trigger.customEventFilter) {
        const arg1 = f.parameter?.find((p: any) => p.key === 'arg1')?.value;
        console.log(`     - dataLayer event = "${arg1}"`);
      }
    }

    if (trigger.filter) {
      console.log('   조건 필터:');
      for (const f of trigger.filter) {
        const type = f.type;
        const arg0 = f.parameter?.find((p: any) => p.key === 'arg0')?.value || '';
        const arg1 = f.parameter?.find((p: any) => p.key === 'arg1')?.value || '';
        console.log(`     - ${type}: ${arg0} = "${arg1}"`);
      }
    }
  }

  // 파라미터 분석
  const settingsTable = qualifiedTag.parameter?.find((p: any) => p.key === 'eventSettingsTable');
  if (settingsTable?.list?.length > 0) {
    console.log('\n이벤트 파라미터:');
    for (const item of settingsTable.list) {
      const map = item.map || [];
      const name = map.find((m: any) => m.key === 'parameter')?.value || '';
      const value = map.find((m: any) => m.key === 'parameterValue')?.value || '';
      if (name) {
        console.log(`   📍 ${name}: ${value}`);
      }
    }
  }
}

console.log('\n\n✅ 분석 완료');
