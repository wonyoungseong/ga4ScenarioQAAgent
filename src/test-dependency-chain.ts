/**
 * GTM Analyzer 의존성 체인 분석 테스트
 *
 * 이 스크립트는 GTM Analyzer에 통합된 의존성 체인 분석 기능을 테스트합니다.
 */

import { GTMAnalyzer } from './analyzers/gtmAnalyzer';

const gtmPath = './GTM-5FK5X5C4_workspace112.json';
const analyzer = new GTMAnalyzer(gtmPath);

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║       GTM Analyzer 의존성 체인 분석 테스트                          ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

// 테스트할 이벤트 목록
const testEvents = ['click_with_duration', 'login', 'custom_event', 'qualified_visit'];

console.log('=== 개별 이벤트 의존성 체인 분석 ===\n');

for (const eventName of testEvents) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📌 ${eventName}`);
  console.log('─'.repeat(60));

  const analysis = analyzer.analyzeDependencyChain(eventName);

  console.log(`\n의존성 체인 존재: ${analysis.hasDependencyChain ? '✅ 예' : '❌ 아니오'}`);

  if (analysis.detectedPageTypes.length > 0) {
    console.log(`\n📍 탐지된 페이지 타입 제한:`);
    console.log(`   ${analysis.detectedPageTypes.join(', ')}`);
  }

  if (analysis.detectedConstraints.length > 0) {
    console.log(`\n🔒 탐지된 제약조건:`);
    for (const c of analysis.detectedConstraints) {
      console.log(`   - [${c.type}] ${c.source}`);
      console.log(`     조건: ${c.condition}`);
      console.log(`     값: ${c.value}`);
    }
  }

  if (analysis.sourceTags.length > 0) {
    console.log(`\n🏷️ 소스 태그:`);
    for (const tag of analysis.sourceTags) {
      console.log(`   - [${tag.tagId}] ${tag.tagName}`);
      for (const trigger of tag.triggerConditions) {
        console.log(`     트리거: ${trigger.triggerName} (${trigger.triggerType})`);
      }
    }
  }

  if (analysis.windowVariableDependency) {
    console.log(`\n🔧 window 변수 의존성:`);
    console.log(`   변수명: window.${analysis.windowVariableDependency.variableName}`);
    if (analysis.windowVariableDependency.creatorTagId) {
      console.log(`   생성 태그: [${analysis.windowVariableDependency.creatorTagId}] ${analysis.windowVariableDependency.creatorTagName}`);
      for (const cond of analysis.windowVariableDependency.creatorConditions) {
        console.log(`   조건: ${cond.condition}`);
      }
    }
  }

  console.log(`\n📝 검증 노트:`);
  for (const note of analysis.validationNotes) {
    console.log(`   ${note}`);
  }
}

// 제약조건 검증 요약
console.log('\n\n=== 제약조건 검증 요약 ===\n');

for (const eventName of testEvents) {
  const summary = analyzer.validateEventConstraints(eventName);

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📌 ${eventName}`);

  console.log(`   직접 제약조건: ${summary.hasDirectConstraints ? '✅ 있음' : '❌ 없음'}`);
  console.log(`   의존성 체인 제약조건: ${summary.hasDependencyChainConstraints ? '✅ 있음' : '❌ 없음'}`);

  if (summary.recommendedPageTypes.length > 0) {
    console.log(`   권장 페이지 타입: ${summary.recommendedPageTypes.join(', ')}`);
  }

  if (summary.missingConstraintWarnings.length > 0) {
    console.log(`\n   ⚠️ 누락 경고 (${summary.missingConstraintWarnings.length}개):`);
    for (const warning of summary.missingConstraintWarnings) {
      const icon = warning.severity === 'HIGH' ? '🔴' : warning.severity === 'MEDIUM' ? '🟡' : '🟢';
      console.log(`      ${icon} [${warning.severity}] ${warning.type}: ${warning.message}`);
    }
  }
}

// 전체 CUSTOM_EVENT 이벤트 분석
console.log('\n\n=== 전체 CUSTOM_EVENT 이벤트 의존성 체인 분석 ===\n');

const allChains = analyzer.analyzeAllDependencyChains();
console.log(`분석된 이벤트: ${allChains.size}개\n`);

for (const [eventName, analysis] of allChains) {
  if (analysis.detectedPageTypes.length > 0 || analysis.windowVariableDependency) {
    console.log(`📌 ${eventName}`);
    if (analysis.detectedPageTypes.length > 0) {
      console.log(`   페이지 제한: ${analysis.detectedPageTypes.join(', ')}`);
    }
    if (analysis.windowVariableDependency) {
      console.log(`   window 변수 의존: ${analysis.windowVariableDependency.variableName}`);
    }
    console.log('');
  }
}

console.log('\n✅ 테스트 완료');
