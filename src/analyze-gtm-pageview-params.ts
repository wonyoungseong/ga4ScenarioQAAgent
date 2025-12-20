/**
 * GTM JSON에서 page_view 파라미터 개수 확인
 *
 * GT - Event Settings 변수와 GA4 Config에서 수집되는 전체 파라미터 분석
 */

import * as fs from 'fs';

const GTM_FILE = './GTM-5FK5X5C4_workspace112.json';

interface ParamInfo {
  name: string;
  value: string;
  source: string;
}

function main() {
  const gtm = JSON.parse(fs.readFileSync(GTM_FILE, 'utf-8'));
  const container = gtm.containerVersion || gtm;
  const variables = container.variable || [];
  const tags = container.tag || [];

  console.log('='.repeat(100));
  console.log(' GTM JSON page_view 파라미터 분석');
  console.log('='.repeat(100));

  const allParams: ParamInfo[] = [];
  const userProperties: ParamInfo[] = [];

  // 1. GT - Event Settings 변수 분석
  console.log('\n### 1. GT - Event Settings 변수 분석\n');

  const eventSettings = variables.find((v: any) => v.name === 'GT - Event Settings');

  if (eventSettings) {
    const params = eventSettings.parameter || [];

    // eventSettingsTable (Event Parameters)
    const settingsTable = params.find((p: any) => p.key === 'eventSettingsTable');
    if (settingsTable && settingsTable.list) {
      console.log(`[Event Parameters from GT - Event Settings] ${settingsTable.list.length}개\n`);

      for (const item of settingsTable.list) {
        const map = item.map || [];
        const paramName = map.find((m: any) => m.key === 'parameter')?.value || '';
        const paramValue = map.find((m: any) => m.key === 'parameterValue')?.value || '';

        allParams.push({
          name: paramName,
          value: paramValue,
          source: 'GT - Event Settings'
        });

        console.log(`  ${allParams.length}. ${paramName}`);
        console.log(`     └─ ${paramValue.substring(0, 70)}`);
      }
    }

    // User Properties in Event Settings
    const userPropsTable = params.find((p: any) =>
      p.key === 'userPropertiesForThisEvent' ||
      p.key === 'setUserProperty' ||
      p.key === 'userProperties'
    );

    if (userPropsTable && userPropsTable.list) {
      console.log(`\n[User Properties from GT - Event Settings] ${userPropsTable.list.length}개\n`);

      for (const item of userPropsTable.list) {
        const map = item.map || [];
        const name = map.find((m: any) => m.key === 'name' || m.key === 'parameter')?.value || '';
        const value = map.find((m: any) => m.key === 'value' || m.key === 'parameterValue')?.value || '';

        userProperties.push({
          name: name,
          value: value,
          source: 'GT - Event Settings'
        });

        console.log(`  ${userProperties.length}. ${name}`);
      }
    }
  }

  // 2. GA4 Configuration 태그에서 User Properties 확인
  console.log('\n### 2. GA4 Configuration 태그 분석\n');

  const ga4ConfigTags = tags.filter((t: any) => t.type === 'gaawc');

  for (const tag of ga4ConfigTags) {
    console.log(`[${tag.name}]`);

    const params = tag.parameter || [];
    const userProps = params.find((p: any) => p.key === 'userProperties');

    if (userProps && userProps.list) {
      console.log(`  User Properties: ${userProps.list.length}개`);

      for (const item of userProps.list) {
        const map = item.map || [];
        const name = map.find((m: any) => m.key === 'name')?.value || '';
        const value = map.find((m: any) => m.key === 'value')?.value || '';

        // 중복 체크
        if (!userProperties.find(p => p.name === name)) {
          userProperties.push({
            name: name,
            value: value,
            source: tag.name
          });
        }

        console.log(`    - ${name}`);
      }
    }
  }

  // 3. page_view 전용 태그 확인
  console.log('\n### 3. page_view 관련 태그 확인\n');

  const pageViewTags = tags.filter((t: any) => {
    const tagParams = t.parameter || [];
    const eventName = tagParams.find((p: any) => p.key === 'eventName');
    return (eventName && eventName.value === 'page_view') ||
           t.name.toLowerCase().includes('pageview') ||
           t.name.toLowerCase().includes('page_view');
  });

  if (pageViewTags.length === 0) {
    // page_view는 GA4 Config 태그의 pageview 측정 또는 트리거로 발생
    console.log('  page_view 전용 태그 없음 (GA4 Config에서 자동 발생)');
  } else {
    for (const tag of pageViewTags) {
      console.log(`  태그: ${tag.name}`);
    }
  }

  // 4. 조건부 파라미터 (Content Group 기반)
  console.log('\n### 4. 조건부 파라미터 (페이지 타입별)\n');

  // content_group 조건으로 추가되는 파라미터 찾기
  const conditionalParams: ParamInfo[] = [];

  // PRODUCT_DETAIL 전용 변수
  const productDetailVars = variables.filter((v: any) =>
    v.name.includes('with View Item') ||
    v.name.includes('Product Id with') ||
    v.name.includes('Product Name with')
  );

  if (productDetailVars.length > 0) {
    console.log(`[PRODUCT_DETAIL 전용] ${productDetailVars.length}개`);
    for (const v of productDetailVars) {
      conditionalParams.push({
        name: v.name,
        value: '',
        source: 'PRODUCT_DETAIL 조건'
      });
      console.log(`  - ${v.name}`);
    }
  }

  // 5. 최종 요약
  console.log('\n');
  console.log('='.repeat(100));
  console.log(' 최종 요약');
  console.log('='.repeat(100));

  console.log(`
📊 page_view 파라미터 현황 (GTM 기준):

[Event Parameters]
  - GT - Event Settings: ${allParams.length}개
  - 조건부 파라미터: ${conditionalParams.length}개
  - 소계: ${allParams.length + conditionalParams.length}개

[User Properties]
  - GA4 Config 태그: ${userProperties.length}개

[총합]
  - Event Parameters: ${allParams.length + conditionalParams.length}개
  - User Properties: ${userProperties.length}개
  - 전체: ${allParams.length + conditionalParams.length + userProperties.length}개

⚠️ 파서(paramMappingParser.ts)가 이 개수와 일치해야 합니다.
`);

  // 6. 전체 파라미터 목록 JSON 출력
  console.log('\n### 전체 Event Parameters 목록:\n');
  for (let i = 0; i < allParams.length; i++) {
    console.log(`${(i + 1).toString().padStart(2)}. ${allParams[i].name}`);
  }

  console.log('\n### 전체 User Properties 목록:\n');
  for (let i = 0; i < userProperties.length; i++) {
    console.log(`${(i + 1).toString().padStart(2)}. ${userProperties[i].name}`);
  }
}

main();
