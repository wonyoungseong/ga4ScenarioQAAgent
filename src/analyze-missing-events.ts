/**
 * 누락된 이벤트 GTM 분석
 */

import * as fs from 'fs';

const gtm = JSON.parse(fs.readFileSync('./GTM-5FK5X5C4_workspace112.json', 'utf-8'));

const targetEvents = ['click_with_duration', 'qualified_visit', 'login', 'custom_event', 'login_complete'];

console.log('=== GTM 누락 이벤트 분석 ===\n');

// 1. 태그에서 이벤트 찾기
console.log('=' .repeat(80));
console.log('1. 관련 TAG 분석');
console.log('='.repeat(80));

for (const tag of gtm.containerVersion.tag || []) {
  const tagName = (tag.name || '').toLowerCase();
  const eventParam = tag.parameter?.find((p: any) => p.key === 'eventName');
  const eventName = (eventParam?.value || '').toLowerCase();

  const isTarget = targetEvents.some(e =>
    tagName.includes(e.replace('_', '')) ||
    tagName.includes(e) ||
    eventName.includes(e.replace('_', '')) ||
    eventName.includes(e)
  );

  if (isTarget) {
    console.log('\n' + '-'.repeat(60));
    console.log(`📌 Tag: ${tag.name}`);
    console.log(`   Tag ID: ${tag.tagId}`);
    console.log(`   Type: ${tag.type}`);

    // Event Name
    if (eventParam) {
      console.log(`   Event Name: ${eventParam.value}`);
    }

    // Event Parameters
    const eventParams = tag.parameter?.find((p: any) => p.key === 'eventParameters');
    if (eventParams?.list) {
      console.log('   Event Parameters:');
      for (const param of eventParams.list) {
        const map = param.map || [];
        const name = map.find((m: any) => m.key === 'name')?.value || '';
        const value = map.find((m: any) => m.key === 'value')?.value || '';
        if (name) {
          console.log(`     - ${name}: ${value}`);
        }
      }
    }

    // User Properties
    const userProps = tag.parameter?.find((p: any) => p.key === 'userProperties');
    if (userProps?.list) {
      console.log('   User Properties:');
      for (const prop of userProps.list) {
        const map = prop.map || [];
        const name = map.find((m: any) => m.key === 'name')?.value || '';
        const value = map.find((m: any) => m.key === 'value')?.value || '';
        if (name) {
          console.log(`     - ${name}: ${value}`);
        }
      }
    }

    // Trigger IDs
    if (tag.firingTriggerId) {
      console.log(`   Firing Trigger IDs: ${tag.firingTriggerId.join(', ')}`);
    }
  }
}

// 2. 트리거 분석
console.log('\n\n' + '='.repeat(80));
console.log('2. 관련 TRIGGER 분석');
console.log('='.repeat(80));

const triggerKeywords = ['click', 'duration', 'qualified', 'login', 'custom'];
const triggerMap: Record<string, any> = {};

for (const trigger of gtm.containerVersion.trigger || []) {
  triggerMap[trigger.triggerId] = trigger;

  const triggerName = (trigger.name || '').toLowerCase();
  const isTarget = triggerKeywords.some(k => triggerName.includes(k));

  if (isTarget) {
    console.log('\n' + '-'.repeat(60));
    console.log(`📍 Trigger: ${trigger.name}`);
    console.log(`   Trigger ID: ${trigger.triggerId}`);
    console.log(`   Type: ${trigger.type}`);

    // Custom Event Filter
    if (trigger.customEventFilter) {
      console.log('   Custom Event Filter:');
      for (const f of trigger.customEventFilter) {
        const type = f.type;
        const arg0 = f.parameter?.find((p: any) => p.key === 'arg0')?.value || '';
        const arg1 = f.parameter?.find((p: any) => p.key === 'arg1')?.value || '';
        console.log(`     ${type}: ${arg0} = "${arg1}"`);
      }
    }

    // General Filter
    if (trigger.filter) {
      console.log('   Filter:');
      for (const f of trigger.filter) {
        const type = f.type;
        const arg0 = f.parameter?.find((p: any) => p.key === 'arg0')?.value || '';
        const arg1 = f.parameter?.find((p: any) => p.key === 'arg1')?.value || '';
        console.log(`     ${type}: ${arg0} = "${arg1}"`);
      }
    }

    // Auto Event Filter (for clicks)
    if (trigger.autoEventFilter) {
      console.log('   Auto Event Filter:');
      for (const f of trigger.autoEventFilter) {
        const type = f.type;
        const arg0 = f.parameter?.find((p: any) => p.key === 'arg0')?.value || '';
        const arg1 = f.parameter?.find((p: any) => p.key === 'arg1')?.value || '';
        console.log(`     ${type}: ${arg0} = "${arg1}"`);
      }
    }
  }
}

// 3. 변수 분석 (AP_ 변수)
console.log('\n\n' + '='.repeat(80));
console.log('3. 관련 VARIABLE 분석 (AP_ 변수)');
console.log('='.repeat(80));

const varKeywords = ['login', 'click', 'duration', 'qualified', 'visit'];
for (const variable of gtm.containerVersion.variable || []) {
  const varName = (variable.name || '').toLowerCase();
  const isTarget = varKeywords.some(k => varName.includes(k));

  if (isTarget && variable.name.startsWith('AP_')) {
    console.log(`\n📊 Variable: ${variable.name}`);
    console.log(`   Type: ${variable.type}`);

    // JavaScript variable
    if (variable.type === 'jsm') {
      const code = variable.parameter?.find((p: any) => p.key === 'javascript')?.value || '';
      console.log(`   JS Code: ${code.substring(0, 100)}...`);
    }

    // Data Layer Variable
    if (variable.type === 'v') {
      const dataLayerVersion = variable.parameter?.find((p: any) => p.key === 'dataLayerVersion')?.value;
      const name = variable.parameter?.find((p: any) => p.key === 'name')?.value;
      console.log(`   DataLayer Name: ${name}`);
    }
  }
}

// 4. login 관련 상세 분석
console.log('\n\n' + '='.repeat(80));
console.log('4. LOGIN 이벤트 상세 분석');
console.log('='.repeat(80));

for (const tag of gtm.containerVersion.tag || []) {
  const tagName = (tag.name || '').toLowerCase();
  if (tagName.includes('login') && !tagName.includes('logout')) {
    console.log(`\n📌 ${tag.name}`);
    console.log(`   Type: ${tag.type}`);

    // 모든 파라미터 출력
    if (tag.parameter) {
      for (const param of tag.parameter) {
        if (param.key === 'eventName') {
          console.log(`   Event: ${param.value}`);
        }
        if (param.key === 'eventParameters' && param.list) {
          console.log('   Parameters:');
          for (const p of param.list) {
            const map = p.map || [];
            const name = map.find((m: any) => m.key === 'name')?.value;
            const value = map.find((m: any) => m.key === 'value')?.value;
            if (name) console.log(`     ${name}: ${value}`);
          }
        }
      }
    }

    // 트리거 정보
    if (tag.firingTriggerId) {
      for (const tid of tag.firingTriggerId) {
        const t = triggerMap[tid];
        if (t) {
          console.log(`   Trigger: ${t.name} (${t.type})`);
          if (t.customEventFilter) {
            for (const f of t.customEventFilter) {
              const arg1 = f.parameter?.find((p: any) => p.key === 'arg1')?.value;
              console.log(`     Custom Event: ${arg1}`);
            }
          }
        }
      }
    }
  }
}

// 5. custom_event 분석
console.log('\n\n' + '='.repeat(80));
console.log('5. CUSTOM_EVENT 분석');
console.log('='.repeat(80));

for (const tag of gtm.containerVersion.tag || []) {
  const eventParam = tag.parameter?.find((p: any) => p.key === 'eventName');
  const eventName = eventParam?.value || '';

  if (eventName === 'custom_event' || (tag.name || '').toLowerCase().includes('custom_event')) {
    console.log(`\n📌 ${tag.name}`);
    console.log(`   Event: ${eventName}`);

    const eventParams = tag.parameter?.find((p: any) => p.key === 'eventParameters');
    if (eventParams?.list) {
      console.log('   Parameters:');
      for (const p of eventParams.list) {
        const map = p.map || [];
        const name = map.find((m: any) => m.key === 'name')?.value;
        const value = map.find((m: any) => m.key === 'value')?.value;
        if (name) console.log(`     ${name}: ${value}`);
      }
    }
  }
}

// 6. qualified_visit 분석
console.log('\n\n' + '='.repeat(80));
console.log('6. QUALIFIED_VISIT 분석');
console.log('='.repeat(80));

for (const tag of gtm.containerVersion.tag || []) {
  const tagName = (tag.name || '').toLowerCase();
  const eventParam = tag.parameter?.find((p: any) => p.key === 'eventName');
  const eventName = (eventParam?.value || '').toLowerCase();

  if (tagName.includes('qualified') || eventName.includes('qualified')) {
    console.log(`\n📌 ${tag.name}`);
    console.log(`   Event: ${eventParam?.value || 'N/A'}`);

    const eventParams = tag.parameter?.find((p: any) => p.key === 'eventParameters');
    if (eventParams?.list) {
      console.log('   Parameters:');
      for (const p of eventParams.list) {
        const map = p.map || [];
        const name = map.find((m: any) => m.key === 'name')?.value;
        const value = map.find((m: any) => m.key === 'value')?.value;
        if (name) console.log(`     ${name}: ${value}`);
      }
    }

    // 트리거
    if (tag.firingTriggerId) {
      for (const tid of tag.firingTriggerId) {
        const t = triggerMap[tid];
        if (t) {
          console.log(`   Trigger: ${t.name} (${t.type})`);
        }
      }
    }
  }
}
