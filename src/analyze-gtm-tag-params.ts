/**
 * GTM 태그별 이벤트 파라미터 분석
 *
 * 태그를 분석하여:
 * 1. 공통 파라미터 (Event Settings Variable)
 * 2. 이벤트별 개별 파라미터
 * 를 추출합니다.
 */

import * as fs from 'fs';
import * as path from 'path';

const GTM_FILE = path.join(process.cwd(), 'GTM-5FK5X5C4_workspace112.json');

// Event Settings Table 변수 분석 추가
function analyzeEventSettingsTable(container: any) {
  const variables = container.variable || [];
  const tags = container.tag || [];

  console.log('\n');
  console.log('='.repeat(100));
  console.log(' 전체 GTM 태그/변수 파라미터 분석 (커스텀 템플릿 포함)');
  console.log('='.repeat(100));

  // 1. 모든 변수 타입 확인
  const varTypes = new Set<string>();
  for (const v of variables) {
    varTypes.add(v.type);
  }
  console.log(`\n변수 타입: ${Array.from(varTypes).join(', ')}`);

  // 2. GT - Event Settings 관련 변수 찾기 (이름으로)
  const eventSettingsVars = variables.filter((v: any) =>
    v.name && v.name.includes('GT - Event Settings')
  );
  console.log(`\nGT - Event Settings 변수: ${eventSettingsVars.length}개`);

  for (const esVar of eventSettingsVars) {
    console.log(`\n📌 ${esVar.name} (type: ${esVar.type})`);

    const params = esVar.parameter || [];

    // eventParameters 찾기 (다양한 키 이름 고려)
    for (const p of params) {
      if (p.list && p.list.length > 0) {
        console.log(`   ${p.key} (${p.list.length}개):`);
        for (const item of p.list) {
          const map = item.map || [];
          const paramName = map.find((m: any) => m.key === 'name' || m.key === 'eventParam')?.value || '';
          const paramValue = map.find((m: any) => m.key === 'value' || m.key === 'eventValue')?.value || '';
          if (paramName) {
            const displayValue = paramValue.length > 50 ? paramValue.substring(0, 50) + '...' : paramValue;
            console.log(`     - ${paramName.padEnd(30)}: ${displayValue}`);
          }
        }
      }
    }
  }

  // 3. 모든 태그에서 이벤트별 파라미터 수집
  console.log('\n');
  console.log('='.repeat(100));
  console.log(' 이벤트별 실제 파라미터 (태그에서 추출)');
  console.log('='.repeat(100));

  // 이벤트명별로 파라미터 수집
  const eventParamsCollected: Record<string, Set<string>> = {};

  for (const tag of tags) {
    const params = tag.parameter || [];

    // 이벤트명 추출
    const eventNameParam = params.find((p: any) => p.key === 'eventName');
    const eventName = eventNameParam?.value || '';

    if (!eventName || eventName.startsWith('{{')) continue;

    if (!eventParamsCollected[eventName]) {
      eventParamsCollected[eventName] = new Set();
    }

    // eventData (커스텀 템플릿용) 파라미터 추출
    const eventDataParam = params.find((p: any) => p.key === 'eventData');
    if (eventDataParam && eventDataParam.list) {
      for (const item of eventDataParam.list) {
        const map = item.map || [];
        const paramName = map.find((m: any) => m.key === 'eventParam')?.value || '';
        if (paramName) {
          eventParamsCollected[eventName].add(paramName);
        }
      }
    }

    // eventParameters (표준 GA4용) 파라미터 추출
    const eventParamsParam = params.find((p: any) => p.key === 'eventParameters');
    if (eventParamsParam && eventParamsParam.list) {
      for (const item of eventParamsParam.list) {
        const map = item.map || [];
        const paramName = map.find((m: any) => m.key === 'name')?.value || '';
        if (paramName) {
          eventParamsCollected[eventName].add(paramName);
        }
      }
    }
  }

  // 이벤트별 파라미터 출력
  const sortedEvents = Object.entries(eventParamsCollected).sort((a, b) => a[0].localeCompare(b[0]));

  for (const [eventName, paramsSet] of sortedEvents) {
    const params = Array.from(paramsSet).sort();
    if (params.length > 0) {
      console.log(`\n📊 ${eventName} (${params.length}개 개별 파라미터)`);
      for (const p of params) {
        console.log(`   - ${p}`);
      }
    }
  }

  // 4. 전체 고유 파라미터 수집
  console.log('\n');
  console.log('='.repeat(100));
  console.log(' 전체 고유 파라미터 목록');
  console.log('='.repeat(100));

  const allParams = new Set<string>();
  for (const paramsSet of Object.values(eventParamsCollected)) {
    for (const p of paramsSet) {
      allParams.add(p);
    }
  }

  const sortedParams = Array.from(allParams).sort();
  console.log(`\n총 ${sortedParams.length}개 고유 파라미터:\n`);

  for (const p of sortedParams) {
    // 어떤 이벤트에서 사용되는지 표시
    const usedBy: string[] = [];
    for (const [eventName, paramsSet] of Object.entries(eventParamsCollected)) {
      if (paramsSet.has(p)) {
        usedBy.push(eventName);
      }
    }
    console.log(`  - ${p.padEnd(30)} (${usedBy.join(', ')})`);
  }
}

interface TagParam {
  name: string;
  value: string;
}

interface TagInfo {
  tagName: string;
  tagType: string;
  eventName: string;
  eventSettings: string;
  eventParams: TagParam[];
  userProperties: TagParam[];
}

function getMapValue(map: any[], key: string): string {
  if (!map) return '';
  const item = map.find((m: any) => m.key === key);
  return item?.value || '';
}

function main() {
  console.log('='.repeat(80));
  console.log(' GTM 태그별 이벤트 파라미터 분석');
  console.log('='.repeat(80));

  const gtm = JSON.parse(fs.readFileSync(GTM_FILE, 'utf-8'));
  const container = gtm.containerVersion || gtm;
  const tags = container.tag || [];

  // GA4 이벤트 태그만 필터링 (gaawe: GA4 Event, gaawc: GA4 Config)
  const ga4Tags = tags.filter((t: any) =>
    t.type === 'gaawe' || t.type === 'gaawc' || t.type === 'googtag'
  );

  console.log(`\n총 GA4 관련 태그 수: ${ga4Tags.length}개\n`);

  // 태그별 정보 추출
  const tagInfoList: TagInfo[] = [];

  for (const tag of ga4Tags) {
    const params = tag.parameter || [];

    // 이벤트명 찾기
    let eventName = '';
    const eventParam = params.find((p: any) => p.key === 'eventName');
    if (eventParam) {
      eventName = eventParam.value;
    }

    // eventSettingsVariable 찾기 (공통 파라미터 참조)
    let eventSettings = '';
    const settingsParam = params.find((p: any) => p.key === 'eventSettingsVariable');
    if (settingsParam) {
      eventSettings = settingsParam.value;
    }

    // eventParameters 찾기 (개별 파라미터)
    const eventParams: TagParam[] = [];
    const epParam = params.find((p: any) => p.key === 'eventParameters');
    if (epParam && epParam.list) {
      for (const item of epParam.list) {
        if (item.map) {
          const name = getMapValue(item.map, 'name');
          const value = getMapValue(item.map, 'value');
          if (name) {
            eventParams.push({ name, value });
          }
        }
      }
    }

    // userProperties 찾기
    const userProperties: TagParam[] = [];
    const upParam = params.find((p: any) => p.key === 'userProperties');
    if (upParam && upParam.list) {
      for (const item of upParam.list) {
        if (item.map) {
          const name = getMapValue(item.map, 'name');
          const value = getMapValue(item.map, 'value');
          if (name) {
            userProperties.push({ name, value });
          }
        }
      }
    }

    tagInfoList.push({
      tagName: tag.name,
      tagType: tag.type,
      eventName,
      eventSettings,
      eventParams,
      userProperties,
    });
  }

  // Event Settings Variable 사용 현황
  console.log('-'.repeat(80));
  console.log('1. Event Settings Variable 사용 현황 (공통 파라미터)');
  console.log('-'.repeat(80));

  const settingsUsage = new Map<string, string[]>();
  for (const info of tagInfoList) {
    if (info.eventSettings) {
      if (!settingsUsage.has(info.eventSettings)) {
        settingsUsage.set(info.eventSettings, []);
      }
      settingsUsage.get(info.eventSettings)!.push(info.eventName || info.tagName);
    }
  }

  for (const [settings, events] of settingsUsage) {
    console.log(`\n${settings}`);
    console.log(`   사용 태그 수: ${events.length}개`);
    console.log(`   이벤트: ${events.slice(0, 10).join(', ')}${events.length > 10 ? '...' : ''}`);
  }

  // 이벤트별 개별 파라미터
  console.log('\n');
  console.log('-'.repeat(80));
  console.log('2. 이벤트별 개별 파라미터 (Event Settings 외 추가)');
  console.log('-'.repeat(80));

  // 이벤트명으로 그룹화
  const eventGroups = new Map<string, TagInfo[]>();
  for (const info of tagInfoList) {
    const key = info.eventName || info.tagName;
    if (!eventGroups.has(key)) {
      eventGroups.set(key, []);
    }
    eventGroups.get(key)!.push(info);
  }

  // 이벤트별 파라미터 출력
  const eventParamSummary: { event: string; params: string[]; userProps: string[] }[] = [];

  for (const [eventName, tags] of eventGroups) {
    if (!eventName || eventName.startsWith('GT -')) continue;

    const allParams = new Set<string>();
    const allUserProps = new Set<string>();

    for (const tag of tags) {
      for (const p of tag.eventParams) {
        allParams.add(p.name);
      }
      for (const p of tag.userProperties) {
        allUserProps.add(p.name);
      }
    }

    if (allParams.size > 0 || allUserProps.size > 0) {
      eventParamSummary.push({
        event: eventName,
        params: Array.from(allParams),
        userProps: Array.from(allUserProps),
      });
    }
  }

  // 정렬
  eventParamSummary.sort((a, b) => a.event.localeCompare(b.event));

  for (const item of eventParamSummary) {
    console.log(`\n### ${item.event}`);
    if (item.params.length > 0) {
      console.log(`   Event Params (${item.params.length}개):`);
      for (const p of item.params.sort()) {
        console.log(`      - ${p}`);
      }
    }
    if (item.userProps.length > 0) {
      console.log(`   User Properties (${item.userProps.length}개):`);
      for (const p of item.userProps.sort()) {
        console.log(`      - ${p}`);
      }
    }
  }

  // 공통 파라미터 vs 개별 파라미터 통계
  console.log('\n');
  console.log('-'.repeat(80));
  console.log('3. 파라미터 통계');
  console.log('-'.repeat(80));

  // 모든 개별 파라미터 수집
  const allEventParams = new Set<string>();
  const paramUsageCount = new Map<string, number>();

  for (const item of eventParamSummary) {
    for (const p of item.params) {
      allEventParams.add(p);
      paramUsageCount.set(p, (paramUsageCount.get(p) || 0) + 1);
    }
  }

  console.log(`\n개별 파라미터 총 ${allEventParams.size}개:`);

  // 사용 빈도순 정렬
  const sortedParams = Array.from(paramUsageCount.entries())
    .sort((a, b) => b[1] - a[1]);

  console.log('\n사용 빈도순:');
  for (const [param, count] of sortedParams.slice(0, 20)) {
    console.log(`   ${param.padEnd(30)}: ${count}개 이벤트에서 사용`);
  }

  // 요약 테이블
  console.log('\n');
  console.log('='.repeat(80));
  console.log(' 이벤트-파라미터 매트릭스');
  console.log('='.repeat(80));

  console.log('\n| 이벤트 | 공통(Event Settings) | 개별 파라미터 | User Props |');
  console.log('|--------|---------------------|--------------|------------|');

  for (const info of tagInfoList) {
    if (!info.eventName || info.eventName.startsWith('{{')) continue;

    const hasSettings = info.eventSettings ? 'O' : '-';
    const paramCount = info.eventParams.length;
    const userPropCount = info.userProperties.length;

    console.log(`| ${info.eventName.padEnd(25)} | ${hasSettings.padEnd(19)} | ${String(paramCount).padEnd(12)} | ${String(userPropCount).padEnd(10)} |`);
  }

  // 최종 요약
  console.log('\n');
  console.log('='.repeat(80));
  console.log(' 최종 요약');
  console.log('='.repeat(80));
  console.log(`
총 GA4 태그: ${ga4Tags.length}개
Event Settings Variable: ${settingsUsage.size}종
개별 이벤트: ${eventParamSummary.length}개
개별 파라미터 종류: ${allEventParams.size}개
`);

  // Event Settings Table 상세 분석
  analyzeEventSettingsTable(container);
}

main();
