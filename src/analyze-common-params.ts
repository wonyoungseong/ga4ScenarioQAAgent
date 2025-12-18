/**
 * event_category, event_action, event_label 파라미터 분석
 *
 * 이 파라미터들이 어떤 이벤트에서 사용되는지 GTM 태그 분석
 */

import * as fs from 'fs';
import * as path from 'path';
import { EVENT_SPECIFIC_PARAMS } from './config/ecommerceItemsMapping';

const GTM_FILE = path.join(process.cwd(), 'GTM-5FK5X5C4_workspace112.json');

const COMMON_PARAMS = ['event_category', 'event_action', 'event_label'];

interface EventParamInfo {
  eventName: string;
  tagName: string;
  tagId: string;
  hasParams: string[];
}

function main() {
  const gtm = JSON.parse(fs.readFileSync(GTM_FILE, 'utf-8'));
  const container = gtm.containerVersion || gtm;
  const tags = container.tag || [];

  console.log('='.repeat(100));
  console.log(' event_category, event_action, event_label 파라미터 분석');
  console.log('='.repeat(100));

  // 이벤트별로 공통 파라미터 사용 여부 수집
  const eventParamUsage: Record<string, EventParamInfo[]> = {};

  for (const tag of tags) {
    if (tag.type !== 'gaawe' && tag.type !== 'cvt_172990757_195') continue;

    const params = tag.parameter || [];
    const eventNameParam = params.find((p: any) => p.key === 'eventName');
    if (!eventNameParam) continue;

    const eventName = eventNameParam.value;
    const foundParams: string[] = [];

    // eventParameters (standard GA4)
    const eventParams = params.find((p: any) => p.key === 'eventParameters');
    if (eventParams && eventParams.list) {
      for (const item of eventParams.list) {
        const map = item.map || [];
        const paramName = map.find((m: any) => m.key === 'name')?.value || '';
        if (COMMON_PARAMS.includes(paramName)) {
          foundParams.push(paramName);
        }
      }
    }

    // eventData (custom template)
    const eventData = params.find((p: any) => p.key === 'eventData');
    if (eventData && eventData.list) {
      for (const item of eventData.list) {
        const map = item.map || [];
        const paramName = map.find((m: any) => m.key === 'eventParam')?.value || '';
        if (COMMON_PARAMS.includes(paramName)) {
          foundParams.push(paramName);
        }
      }
    }

    if (foundParams.length > 0) {
      if (!eventParamUsage[eventName]) {
        eventParamUsage[eventName] = [];
      }
      eventParamUsage[eventName].push({
        eventName,
        tagName: tag.name,
        tagId: tag.tagId,
        hasParams: [...new Set(foundParams)],
      });
    }
  }

  // 이벤트별 요약
  console.log('\n### 이벤트별 공통 파라미터 사용 현황\n');

  const allEvents = Object.keys(eventParamUsage).sort();

  for (const eventName of allEvents) {
    const tags = eventParamUsage[eventName];
    const allParams = new Set<string>();
    for (const tag of tags) {
      for (const p of tag.hasParams) {
        allParams.add(p);
      }
    }

    // 현재 매핑 확인
    const currentMapping = EVENT_SPECIFIC_PARAMS[eventName] || [];
    const mappedParams = currentMapping.map(p => p.ga4Param);

    const missingParams = [...allParams].filter(p => !mappedParams.includes(p));

    const statusIcon = missingParams.length === 0 ? '✅' : '⚠️';

    console.log(`${statusIcon} ${eventName}`);
    console.log(`   GTM에서 사용: ${[...allParams].join(', ')}`);
    console.log(`   현재 매핑됨: ${mappedParams.filter(p => COMMON_PARAMS.includes(p)).join(', ') || '-'}`);
    if (missingParams.length > 0) {
      console.log(`   누락됨: ${missingParams.join(', ')}`);
    }
    console.log(`   태그 수: ${tags.length}개`);
    console.log('');
  }

  // 요약 통계
  console.log('\n');
  console.log('='.repeat(100));
  console.log(' 요약');
  console.log('='.repeat(100));

  let totalEvents = allEvents.length;
  let completeEvents = 0;
  let incompleteEvents: string[] = [];

  for (const eventName of allEvents) {
    const tags = eventParamUsage[eventName];
    const allParams = new Set<string>();
    for (const tag of tags) {
      for (const p of tag.hasParams) {
        allParams.add(p);
      }
    }
    const currentMapping = EVENT_SPECIFIC_PARAMS[eventName] || [];
    const mappedParams = currentMapping.map(p => p.ga4Param);
    const missingParams = [...allParams].filter(p => !mappedParams.includes(p));

    if (missingParams.length === 0) {
      completeEvents++;
    } else {
      incompleteEvents.push(`${eventName}: ${missingParams.join(', ')}`);
    }
  }

  console.log(`\n공통 파라미터 사용 이벤트: ${totalEvents}개`);
  console.log(`완전히 매핑됨: ${completeEvents}개`);
  console.log(`누락 있음: ${incompleteEvents.length}개`);

  if (incompleteEvents.length > 0) {
    console.log('\n### 누락된 매핑 (추가 필요)\n');
    for (const item of incompleteEvents) {
      console.log(`  - ${item}`);
    }
  }

  // 추가해야 할 코드 생성
  console.log('\n');
  console.log('='.repeat(100));
  console.log(' 추가해야 할 코드');
  console.log('='.repeat(100));

  for (const eventName of allEvents) {
    const tags = eventParamUsage[eventName];
    const allParams = new Set<string>();
    for (const tag of tags) {
      for (const p of tag.hasParams) {
        allParams.add(p);
      }
    }
    const currentMapping = EVENT_SPECIFIC_PARAMS[eventName] || [];
    const mappedParams = currentMapping.map(p => p.ga4Param);
    const missingParams = [...allParams].filter(p => !mappedParams.includes(p));

    if (missingParams.length > 0) {
      console.log(`\n// ${eventName} - 추가할 파라미터`);
      for (const param of missingParams) {
        const description = param === 'event_category' ? '이벤트 카테고리' :
                           param === 'event_action' ? '이벤트 액션' :
                           param === 'event_label' ? '이벤트 라벨' : param;
        console.log(`{ ga4Param: '${param}', description: '${description}', gtmVariable: '{{DL - ${param.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}}}', sourceType: 'datalayer', sourcePath: '${param}' },`);
      }
    }
  }
}

main();
