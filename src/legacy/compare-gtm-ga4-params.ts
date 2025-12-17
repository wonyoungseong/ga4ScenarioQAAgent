/**
 * GTM vs GA4 파라미터 비교 (로컬 파일 기반)
 *
 * 이전에 저장한 GA4 맞춤 측정기준 파일과 GTM 파서 결과를 비교합니다.
 * - output/ga4_custom_definitions.json (GA4 Admin API 조회 결과)
 * - GTM JSON 파서 결과
 *
 * 사용법: npx ts-node src/compare-gtm-ga4-params.ts
 */

import * as fs from 'fs';
import { createDefaultGTMEventParameterExtractor } from './config/gtmEventParameterExtractor';

interface GA4CustomDef {
  parameterName: string;
  displayName: string;
  scope?: string;
}

interface GA4Definitions {
  customDimensions: {
    eventScope: GA4CustomDef[];
    itemScope: GA4CustomDef[];
    userScope: GA4CustomDef[];
  };
  customMetrics: GA4CustomDef[];
}

function loadGA4Definitions(): GA4Definitions | null {
  const path = './output/ga4_custom_definitions.json';
  if (!fs.existsSync(path)) {
    console.error('❌ GA4 맞춤 측정기준 파일이 없습니다.');
    console.log('   먼저 실행하세요: npx ts-node src/check-ga4-custom-dimensions.ts');
    return null;
  }
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     GTM vs GA4 커스텀 파라미터 비교                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  // 1. GTM에서 파라미터 추출
  console.log('\n📦 GTM JSON 분석 중...');
  const gtmExtractor = createDefaultGTMEventParameterExtractor();
  const allEvents = gtmExtractor.extractAllEvents();
  const gtmCustomEventParams = gtmExtractor.getAllCustomEventParameters();
  const gtmCustomItemParams = gtmExtractor.getAllCustomItemParameters();

  console.log(`   - 총 이벤트: ${allEvents.length}개`);
  console.log(`   - 커스텀 Event 파라미터: ${gtmCustomEventParams.length}개`);
  console.log(`   - 커스텀 Item 파라미터: ${gtmCustomItemParams.length}개`);

  // 2. GA4 맞춤 측정기준 로드
  console.log('\n📄 GA4 맞춤 측정기준 로드 중...');
  const ga4Defs = loadGA4Definitions();
  if (!ga4Defs) return;

  const ga4EventDimensions = ga4Defs.customDimensions.eventScope || [];
  const ga4ItemDimensions = ga4Defs.customDimensions.itemScope || [];
  const ga4EventMetrics = ga4Defs.customMetrics || [];

  console.log(`   - Event 범위 측정기준: ${ga4EventDimensions.length}개`);
  console.log(`   - Item 범위 측정기준: ${ga4ItemDimensions.length}개`);
  console.log(`   - Event 범위 측정항목: ${ga4EventMetrics.length}개`);

  // 3. 비교 분석
  console.log('\n' + '═'.repeat(100));
  console.log('📊 비교 분석 결과');
  console.log('═'.repeat(100));

  // Event 범위 파라미터
  const ga4EventParamSet = new Set([
    ...ga4EventDimensions.map(d => d.parameterName),
    ...ga4EventMetrics.map(m => m.parameterName),
  ]);

  const eventRegistered = gtmCustomEventParams.filter(p => ga4EventParamSet.has(p));
  const eventMissing = gtmCustomEventParams.filter(p => !ga4EventParamSet.has(p));
  const eventExtra = Array.from(ga4EventParamSet).filter(p => !gtmCustomEventParams.includes(p));

  console.log(`\n┌─ Event 범위 커스텀 파라미터 ─────────────────────────────────┐`);
  console.log(`│ GTM에서 추출: ${gtmCustomEventParams.length}개`);
  console.log(`│ GA4에 등록: ${ga4EventParamSet.size}개`);
  console.log(`│`);
  console.log(`│ ✅ 등록 완료: ${eventRegistered.length}개`);
  console.log(`│ ❌ 미등록: ${eventMissing.length}개`);
  console.log(`└${'─'.repeat(62)}┘`);

  // Item 범위 파라미터
  const ga4ItemParamSet = new Set(ga4ItemDimensions.map(d => d.parameterName));

  const itemRegistered = gtmCustomItemParams.filter(p => ga4ItemParamSet.has(p));
  const itemMissing = gtmCustomItemParams.filter(p => !ga4ItemParamSet.has(p));
  const itemExtra = Array.from(ga4ItemParamSet).filter(p => !gtmCustomItemParams.includes(p));

  console.log(`\n┌─ Item 범위 커스텀 파라미터 ──────────────────────────────────┐`);
  console.log(`│ GTM에서 추출: ${gtmCustomItemParams.length}개`);
  console.log(`│ GA4에 등록: ${ga4ItemParamSet.size}개`);
  console.log(`│`);
  console.log(`│ ✅ 등록 완료: ${itemRegistered.length}개`);
  console.log(`│ ❌ 미등록: ${itemMissing.length}개`);
  console.log(`└${'─'.repeat(62)}┘`);

  // 상세 결과
  console.log('\n' + '═'.repeat(100));
  console.log('📌 상세 비교 결과');
  console.log('═'.repeat(100));

  // Event 범위 - 등록된 파라미터
  if (eventRegistered.length > 0) {
    console.log('\n✅ Event 범위 - GA4 등록 완료:');
    console.log('┌────────────────────────────┬────────────────────────────────────────┐');
    console.log('│ GTM Parameter              │ GA4 Display Name                       │');
    console.log('├────────────────────────────┼────────────────────────────────────────┤');
    for (const param of eventRegistered) {
      const ga4Def = ga4EventDimensions.find(d => d.parameterName === param)
        || ga4EventMetrics.find(m => m.parameterName === param);
      const gtmParam = param.padEnd(26);
      const displayName = (ga4Def?.displayName || '-').substring(0, 38).padEnd(38);
      console.log(`│ ${gtmParam} │ ${displayName} │`);
    }
    console.log('└────────────────────────────┴────────────────────────────────────────┘');
  }

  // Event 범위 - 미등록 파라미터
  if (eventMissing.length > 0) {
    console.log('\n❌ Event 범위 - GA4 미등록 (등록 필요):');
    const columns = 3;
    for (let i = 0; i < eventMissing.length; i += columns) {
      const row = eventMissing.slice(i, i + columns).map(p => p.padEnd(30)).join('');
      console.log(`   ${row}`);
    }
  }

  // Item 범위 - 등록된 파라미터
  if (itemRegistered.length > 0) {
    console.log('\n✅ Item 범위 - GA4 등록 완료:');
    console.log('┌────────────────────────────┬────────────────────────────────────────┐');
    console.log('│ GTM Parameter              │ GA4 Display Name                       │');
    console.log('├────────────────────────────┼────────────────────────────────────────┤');
    for (const param of itemRegistered) {
      const ga4Def = ga4ItemDimensions.find(d => d.parameterName === param);
      const gtmParam = param.padEnd(26);
      const displayName = (ga4Def?.displayName || '-').substring(0, 38).padEnd(38);
      console.log(`│ ${gtmParam} │ ${displayName} │`);
    }
    console.log('└────────────────────────────┴────────────────────────────────────────┘');
  }

  // Item 범위 - 미등록 파라미터
  if (itemMissing.length > 0) {
    console.log('\n❌ Item 범위 - GA4 미등록 (등록 필요):');
    for (const param of itemMissing) {
      console.log(`   - ${param}`);
    }
  }

  // GA4에만 있는 파라미터 (GTM에서 미사용)
  if (itemExtra.length > 0) {
    console.log('\n⚠️ Item 범위 - GA4에만 있음 (GTM에서 미사용):');
    for (const param of itemExtra) {
      const ga4Def = ga4ItemDimensions.find(d => d.parameterName === param);
      console.log(`   - ${param} (${ga4Def?.displayName || '-'})`);
    }
  }

  // 요약
  console.log('\n' + '═'.repeat(100));
  console.log('📋 요약');
  console.log('═'.repeat(100));

  const totalGTM = gtmCustomEventParams.length + gtmCustomItemParams.length;
  const totalRegistered = eventRegistered.length + itemRegistered.length;
  const totalMissing = eventMissing.length + itemMissing.length;
  const coverageRate = (totalRegistered / totalGTM * 100).toFixed(1);

  console.log(`\n총 GTM 커스텀 파라미터: ${totalGTM}개`);
  console.log(`GA4 등록 완료: ${totalRegistered}개`);
  console.log(`GA4 미등록: ${totalMissing}개`);
  console.log(`등록률: ${coverageRate}%`);

  if (itemMissing.length > 0) {
    console.log('\n⚠️ Item 범위 미등록 파라미터 등록 방법:');
    console.log('   1. GA4 관리 > 속성 설정 > 데이터 표시 > 맞춤 정의');
    console.log('   2. "새 맞춤 측정기준" 클릭');
    console.log('   3. 범위: "항목" 선택');
    console.log('   4. 이벤트 매개변수: 아래 값 입력');
    for (const param of itemMissing) {
      console.log(`      - ${param}`);
    }
  }

  // 결과 저장
  const output = {
    comparedAt: new Date().toISOString(),
    summary: {
      gtmEventParams: gtmCustomEventParams.length,
      gtmItemParams: gtmCustomItemParams.length,
      ga4EventParams: ga4EventParamSet.size,
      ga4ItemParams: ga4ItemParamSet.size,
      eventRegistered: eventRegistered.length,
      eventMissing: eventMissing.length,
      itemRegistered: itemRegistered.length,
      itemMissing: itemMissing.length,
      coverageRate: parseFloat(coverageRate),
    },
    details: {
      eventRegistered,
      eventMissing,
      itemRegistered,
      itemMissing,
      itemExtra,
    },
    gtmEvents: allEvents,
  };

  fs.writeFileSync(
    './output/gtm_ga4_comparison.json',
    JSON.stringify(output, null, 2)
  );
  console.log('\n✅ 결과 저장됨: ./output/gtm_ga4_comparison.json');
}

main();
