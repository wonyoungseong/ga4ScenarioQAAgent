/**
 * GTM 태그 상세 분석 - 이커머스 이벤트 포함
 */

import * as fs from 'fs';
import * as path from 'path';

const GTM_FILE = path.join(process.cwd(), 'GTM-5FK5X5C4_workspace112.json');

function main() {
  const gtm = JSON.parse(fs.readFileSync(GTM_FILE, 'utf-8'));
  const container = gtm.containerVersion || gtm;
  const tags = container.tag || [];

  console.log('='.repeat(80));
  console.log(' GTM 태그 상세 분석');
  console.log('='.repeat(80));

  // GA4 이벤트 태그 필터
  const ga4EventTags = tags.filter((t: any) => t.type === 'gaawe');

  // 주요 이벤트 태그 상세 분석
  const importantEvents = [
    'page_view', 'view_item', 'view_item_list', 'add_to_cart',
    'begin_checkout', 'purchase', 'select_item', 'view_promotion',
    'select_promotion', 'login', 'sign_up', 'view_search_results',
    'scroll', 'ap_click', 'custom_event'
  ];

  for (const eventName of importantEvents) {
    const matchingTags = ga4EventTags.filter((t: any) => {
      const params = t.parameter || [];
      const ep = params.find((p: any) => p.key === 'eventName');
      return ep?.value === eventName;
    });

    if (matchingTags.length === 0) continue;

    console.log(`\n${'─'.repeat(80)}`);
    console.log(`📌 ${eventName} (${matchingTags.length}개 태그)`);
    console.log('─'.repeat(80));

    for (const tag of matchingTags) {
      console.log(`\n태그명: ${tag.name}`);

      const params = tag.parameter || [];

      // Event Settings Variable
      const settings = params.find((p: any) => p.key === 'eventSettingsVariable');
      if (settings) {
        console.log(`공통 파라미터: ${settings.value}`);
      }

      // Event Parameters (개별)
      const eventParams = params.find((p: any) => p.key === 'eventParameters');
      if (eventParams?.list && eventParams.list.length > 0) {
        console.log(`개별 Event Parameters (${eventParams.list.length}개):`);
        for (const item of eventParams.list) {
          if (item.map) {
            const name = item.map.find((m: any) => m.key === 'name')?.value;
            const value = item.map.find((m: any) => m.key === 'value')?.value;
            console.log(`   - ${name}: ${value?.slice(0, 50) || '(empty)'}`);
          }
        }
      }

      // User Properties (개별)
      const userProps = params.find((p: any) => p.key === 'userProperties');
      if (userProps?.list && userProps.list.length > 0) {
        console.log(`개별 User Properties (${userProps.list.length}개):`);
        for (const item of userProps.list) {
          if (item.map) {
            const name = item.map.find((m: any) => m.key === 'name')?.value;
            const value = item.map.find((m: any) => m.key === 'value')?.value;
            console.log(`   - ${name}: ${value?.slice(0, 50) || '(empty)'}`);
          }
        }
      }

      // E-commerce 관련 파라미터
      const ecommParam = params.find((p: any) =>
        p.key === 'ecommerce' || p.key === 'enableEcommerce' || p.key === 'ecommerceDataLayerVariable'
      );
      if (ecommParam) {
        console.log(`이커머스 설정: ${ecommParam.key} = ${ecommParam.value}`);
      }

      // Items 파라미터
      const itemsParam = params.find((p: any) => p.key === 'items');
      if (itemsParam) {
        console.log(`Items: ${itemsParam.value}`);
      }

      // 모든 파라미터 키 출력 (디버그용)
      const allKeys = params.map((p: any) => p.key).join(', ');
      console.log(`[모든 파라미터 키: ${allKeys}]`);
    }
  }

  // Event Settings 내용 상세 분석
  console.log('\n');
  console.log('='.repeat(80));
  console.log(' GT - Event Settings 변수 상세 분석');
  console.log('='.repeat(80));

  const variables = container.variable || [];
  const eventSettingsVar = variables.find((v: any) =>
    v.name === 'GT - Event Settings' || v.type === 'gtes'
  );

  if (eventSettingsVar) {
    console.log(`\n변수명: ${eventSettingsVar.name}`);
    console.log(`타입: ${eventSettingsVar.type}`);

    const params = eventSettingsVar.parameter || [];

    // eventSettingsTable (Event Parameters)
    const eventTable = params.find((p: any) => p.key === 'eventSettingsTable');
    if (eventTable?.list) {
      console.log(`\nEvent Parameters (${eventTable.list.length}개):`);

      // 중복 제거하여 출력
      const seen = new Set<string>();
      for (const item of eventTable.list) {
        if (item.map) {
          const param = item.map.find((m: any) => m.key === 'parameter')?.value;
          const value = item.map.find((m: any) => m.key === 'parameterValue')?.value;
          if (param && !seen.has(param)) {
            seen.add(param);
            console.log(`   ${param.padEnd(25)}: ${value?.slice(0, 40) || ''}`);
          }
        }
      }
    }

    // userProperties
    const userPropsTable = params.find((p: any) => p.key === 'userProperties');
    if (userPropsTable?.list) {
      console.log(`\nUser Properties (${userPropsTable.list.length}개):`);

      const seen = new Set<string>();
      for (const item of userPropsTable.list) {
        if (item.map) {
          const name = item.map.find((m: any) => m.key === 'name')?.value;
          const value = item.map.find((m: any) => m.key === 'value')?.value;
          if (name && !seen.has(name)) {
            seen.add(name);
            console.log(`   ${name.padEnd(25)}: ${value?.slice(0, 40) || ''}`);
          }
        }
      }
    }
  }

  // 이벤트 목록 요약
  console.log('\n');
  console.log('='.repeat(80));
  console.log(' 전체 이벤트 목록');
  console.log('='.repeat(80));

  const eventNames = new Set<string>();
  for (const tag of ga4EventTags) {
    const params = tag.parameter || [];
    const ep = params.find((p: any) => p.key === 'eventName');
    if (ep?.value) {
      eventNames.add(ep.value);
    }
  }

  console.log(`\n총 ${eventNames.size}개 이벤트:`);
  const sortedEvents = Array.from(eventNames).sort();
  for (const e of sortedEvents) {
    console.log(`   - ${e}`);
  }
}

main();
