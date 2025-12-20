/**
 * GTM custom_event 태그 분석
 *
 * custom_event를 사용하는 태그들을 태그명 기준으로 분리 분석합니다.
 */

import * as fs from 'fs';
import * as path from 'path';

const GTM_FILE = path.join(process.cwd(), 'GTM-5FK5X5C4_workspace112.json');

interface TagParam {
  name: string;
  value: string;
}

interface CustomEventTag {
  tagId: string;
  tagName: string;
  eventName: string;
  params: TagParam[];
  trigger?: string;
}

function main() {
  const gtm = JSON.parse(fs.readFileSync(GTM_FILE, 'utf-8'));
  const container = gtm.containerVersion || gtm;
  const tags = container.tag || [];
  const triggers = container.trigger || [];

  // Trigger ID to Name 매핑
  const triggerMap: Record<string, string> = {};
  for (const t of triggers) {
    triggerMap[t.triggerId] = t.name;
  }

  // custom_event 태그만 필터링
  const customEventTags: CustomEventTag[] = [];

  for (const tag of tags) {
    const params = tag.parameter || [];
    const eventNameParam = params.find((p: any) => p.key === 'eventName');

    if (eventNameParam && eventNameParam.value === 'custom_event') {
      const eventParams: TagParam[] = [];

      // eventData 파라미터 추출
      const eventDataParam = params.find((p: any) => p.key === 'eventData');
      if (eventDataParam && eventDataParam.list) {
        for (const item of eventDataParam.list) {
          const map = item.map || [];
          const paramName = map.find((m: any) => m.key === 'eventParam')?.value || '';
          const paramValue = map.find((m: any) => m.key === 'eventValue')?.value || '';
          if (paramName) {
            eventParams.push({ name: paramName, value: paramValue });
          }
        }
      }

      // 트리거 정보
      const triggerIds = tag.firingTriggerId || [];
      const triggerNames = triggerIds.map((id: string) => triggerMap[id] || id).join(', ');

      customEventTags.push({
        tagId: tag.tagId,
        tagName: tag.name,
        eventName: 'custom_event',
        params: eventParams,
        trigger: triggerNames,
      });
    }
  }

  console.log('='.repeat(100));
  console.log(' GTM custom_event 태그 분석');
  console.log('='.repeat(100));
  console.log(`\n총 custom_event 태그: ${customEventTags.length}개\n`);

  // 태그별 상세 출력
  for (const tag of customEventTags) {
    console.log('-'.repeat(100));
    console.log(`📌 ${tag.tagName}`);
    console.log(`   Tag ID: ${tag.tagId}`);
    console.log(`   트리거: ${tag.trigger || '-'}`);
    console.log(`   파라미터: ${tag.params.length}개`);

    if (tag.params.length > 0) {
      for (const p of tag.params) {
        const displayValue = p.value.length > 50
          ? p.value.substring(0, 50) + '...'
          : p.value;
        console.log(`     - ${p.name.padEnd(30)}: ${displayValue}`);
      }
    }
    console.log('');
  }

  // 태그명 기준 그룹화 제안
  console.log('\n');
  console.log('='.repeat(100));
  console.log(' 태그명 기반 이벤트 분류 제안');
  console.log('='.repeat(100));

  // 태그명에서 이벤트 유형 추출
  const eventTypes: Record<string, CustomEventTag[]> = {};

  for (const tag of customEventTags) {
    // 태그명에서 키워드 추출
    let eventType = 'unknown';

    const tagNameLower = tag.tagName.toLowerCase();

    if (tagNameLower.includes('skinnote') || tagNameLower.includes('skin note')) {
      eventType = 'skinnote';
    } else if (tagNameLower.includes('beauty tester') || tagNameLower.includes('beautytester')) {
      eventType = 'beauty_tester';
    } else if (tagNameLower.includes('beauty club') || tagNameLower.includes('beautyclub')) {
      eventType = 'beauty_club';
    } else if (tagNameLower.includes('membership') || tagNameLower.includes('mbrs')) {
      eventType = 'membership';
    } else if (tagNameLower.includes('coupon')) {
      eventType = 'coupon';
    } else if (tagNameLower.includes('wishlist') || tagNameLower.includes('wish')) {
      eventType = 'wishlist';
    } else if (tagNameLower.includes('share')) {
      eventType = 'share';
    } else if (tagNameLower.includes('subscribe') || tagNameLower.includes('subscription')) {
      eventType = 'subscription';
    } else {
      // 파라미터 기반 분류
      const paramNames = tag.params.map(p => p.name);
      if (paramNames.some(n => n.startsWith('skinnote_'))) {
        eventType = 'skinnote';
      } else if (paramNames.some(n => n.startsWith('bt_'))) {
        eventType = 'beauty_tester';
      } else if (paramNames.some(n => n.startsWith('bc_'))) {
        eventType = 'beauty_club';
      } else {
        eventType = 'general';
      }
    }

    if (!eventTypes[eventType]) {
      eventTypes[eventType] = [];
    }
    eventTypes[eventType].push(tag);
  }

  // 분류 결과 출력
  for (const [eventType, tags] of Object.entries(eventTypes)) {
    console.log(`\n### ${eventType} (${tags.length}개)`);

    // 해당 그룹의 고유 파라미터 수집
    const uniqueParams = new Set<string>();
    for (const tag of tags) {
      for (const p of tag.params) {
        uniqueParams.add(p.name);
      }
    }

    console.log(`   태그:`);
    for (const tag of tags) {
      console.log(`     - ${tag.tagName}`);
    }

    console.log(`   고유 파라미터 (${uniqueParams.size}개):`);
    const sortedParams = Array.from(uniqueParams).sort();
    for (const p of sortedParams) {
      console.log(`     - ${p}`);
    }
  }

  // 코드 생성
  console.log('\n');
  console.log('='.repeat(100));
  console.log(' EVENT_SPECIFIC_PARAMS 분리 코드');
  console.log('='.repeat(100));

  for (const [eventType, tags] of Object.entries(eventTypes)) {
    if (eventType === 'general') continue;

    const uniqueParams = new Set<string>();
    for (const tag of tags) {
      for (const p of tag.params) {
        // event_category, event_action, event_label은 공통이므로 제외
        if (!['event_category', 'event_action', 'event_label'].includes(p.name)) {
          uniqueParams.add(p.name);
        }
      }
    }

    if (uniqueParams.size > 0) {
      console.log(`\n'custom_event_${eventType}': [`);
      console.log(`  // 공통`);
      console.log(`  { ga4Param: 'event_category', description: '이벤트 카테고리', gtmVariable: '{{DL - Event Category}}', sourceType: 'datalayer', sourcePath: 'event_category' },`);
      console.log(`  { ga4Param: 'event_action', description: '이벤트 액션', gtmVariable: '{{DL - Event Action}}', sourceType: 'datalayer', sourcePath: 'event_action' },`);
      console.log(`  { ga4Param: 'event_label', description: '이벤트 라벨', gtmVariable: '{{DL - Event Label}}', sourceType: 'datalayer', sourcePath: 'event_label' },`);
      console.log(`  // ${eventType} 전용`);

      const sortedParams = Array.from(uniqueParams).sort();
      for (const param of sortedParams) {
        console.log(`  { ga4Param: '${param}', description: '${param}', gtmVariable: '{{DL - ${param}}}', sourceType: 'datalayer', sourcePath: '${param}' },`);
      }
      console.log(`],`);
    }
  }
}

main();
