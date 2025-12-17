/**
 * 시나리오 가이드 준비 스크립트
 *
 * 개발가이드 PDF를 파싱하고, 누락된 정보를 확인한 후,
 * 시나리오 가이드 생성에 필요한 모든 데이터를 준비합니다.
 *
 * 사용법: npx ts-node src/prepare-scenario-guide.ts --pdf <PDF_PATH>
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { createUniversalGuideParser, UniversalGuideParser } from './parsers/universalGuideParser';
import {
  ScenarioGuideRequirements,
  MissingInfoItem,
  EventDefinitionRequirement,
} from './schemas/scenarioGuideRequirements';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function collectMissingInfo(
  requirements: ScenarioGuideRequirements
): Promise<ScenarioGuideRequirements> {
  const criticalMissing = requirements.missingInfo.filter(m => m.severity === 'critical');

  if (criticalMissing.length === 0) {
    console.log('\n✅ 필수 정보가 모두 있습니다.');
    return requirements;
  }

  console.log('\n' + '═'.repeat(80));
  console.log('❓ 누락된 필수 정보 확인');
  console.log('═'.repeat(80));
  console.log(`\n${criticalMissing.length}개의 필수 정보가 누락되었습니다.\n`);

  for (let i = 0; i < criticalMissing.length; i++) {
    const item = criticalMissing[i];

    console.log(`\n[${i + 1}/${criticalMissing.length}] ${item.relatedTo}`);
    console.log(`   질문: ${item.userQuestion}`);

    if (item.suggestedDefault) {
      console.log(`   💡 제안: ${item.suggestedDefault}`);
    }

    const answer = await askQuestion('   답변 (엔터로 제안값 사용): ');

    // 답변 반영
    const finalAnswer = answer || item.suggestedDefault || '';

    if (item.type === 'firingCondition') {
      const event = requirements.events.find(e => e.eventName === item.relatedTo);
      if (event) {
        event.firingCondition = finalAnswer;
      }
    } else if (item.type === 'event' && item.missingField === 'allowedPageTypes') {
      const event = requirements.events.find(e => e.eventName === item.relatedTo);
      if (event) {
        event.allowedPageTypes = finalAnswer.split(',').map(s => s.trim().toUpperCase());
      }
    }

    // missingInfo에서 제거
    const idx = requirements.missingInfo.findIndex(
      m => m.relatedTo === item.relatedTo && m.missingField === item.missingField
    );
    if (idx !== -1) {
      requirements.missingInfo.splice(idx, 1);
    }
  }

  return requirements;
}

function printSummary(requirements: ScenarioGuideRequirements): void {
  console.log('\n' + '═'.repeat(80));
  console.log('📊 파싱 결과 요약');
  console.log('═'.repeat(80));

  console.log(`\n📄 소스: ${requirements.metadata.source}`);
  console.log(`⏰ 파싱 시간: ${requirements.metadata.parsedAt}`);

  console.log(`\n📌 추출된 정보:`);
  console.log(`   - 이벤트 정의: ${requirements.events.length}개`);
  console.log(`   - 파라미터 정의: ${requirements.parameters.length}개`);
  console.log(`   - 페이지 타입: ${requirements.pageTypes.length}개`);

  console.log(`\n📈 검증 결과:`);
  console.log(`   - 완료율: ${requirements.validation.completeness}%`);
  console.log(`   - 시나리오 작성 가능: ${requirements.validation.canGenerateScenario ? '✅' : '❌'}`);

  if (requirements.validation.issues.critical.length > 0) {
    console.log(`\n❌ Critical 이슈:`);
    for (const issue of requirements.validation.issues.critical) {
      console.log(`   - ${issue}`);
    }
  }

  if (requirements.validation.issues.warnings.length > 0) {
    console.log(`\n⚠️ 경고:`);
    for (const issue of requirements.validation.issues.warnings) {
      console.log(`   - ${issue}`);
    }
  }

  // 이벤트별 요약
  console.log('\n' + '═'.repeat(80));
  console.log('📋 이벤트별 정보');
  console.log('═'.repeat(80));

  console.log('\n┌────────────────────────┬────────────────────────────────────────┬─────────────────────┐');
  console.log('│ Event Name             │ Firing Condition                       │ Page Types          │');
  console.log('├────────────────────────┼────────────────────────────────────────┼─────────────────────┤');

  for (const event of requirements.events) {
    const name = event.eventName.substring(0, 22).padEnd(22);
    const condition = (event.firingCondition || '❌ 없음').substring(0, 38).padEnd(38);
    const pages = (event.allowedPageTypes?.join(', ') || '❌ 없음').substring(0, 19).padEnd(19);
    console.log(`│ ${name} │ ${condition} │ ${pages} │`);
  }

  console.log('└────────────────────────┴────────────────────────────────────────┴─────────────────────┘');
}

function mergeWithExisting(
  newRequirements: ScenarioGuideRequirements,
  existingPath: string
): ScenarioGuideRequirements {
  if (!fs.existsSync(existingPath)) {
    return newRequirements;
  }

  console.log(`\n📂 기존 데이터와 병합 중: ${existingPath}`);
  const existing = JSON.parse(fs.readFileSync(existingPath, 'utf8')) as ScenarioGuideRequirements;

  // 이벤트 병합 (새 정보 우선, 기존 정보로 보완)
  const mergedEvents = new Map<string, EventDefinitionRequirement>();

  // 기존 이벤트 먼저
  for (const event of existing.events) {
    mergedEvents.set(event.eventName, event);
  }

  // 새 이벤트로 덮어쓰기 (빈 값은 기존 값 유지)
  for (const event of newRequirements.events) {
    const existingEvent = mergedEvents.get(event.eventName);
    if (existingEvent) {
      mergedEvents.set(event.eventName, {
        ...existingEvent,
        ...event,
        firingCondition: event.firingCondition || existingEvent.firingCondition,
        allowedPageTypes: (event.allowedPageTypes?.length > 0)
          ? event.allowedPageTypes
          : existingEvent.allowedPageTypes,
      });
    } else {
      mergedEvents.set(event.eventName, event);
    }
  }

  newRequirements.events = Array.from(mergedEvents.values());

  console.log(`   ✓ 총 ${newRequirements.events.length}개 이벤트 (병합됨)`);

  return newRequirements;
}

async function main() {
  const args = process.argv.slice(2);
  let pdfPath = '';
  let outputPath = './output/scenario_guide_requirements.json';
  let interactive = true;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pdf' && args[i + 1]) {
      pdfPath = args[i + 1];
    }
    if (args[i] === '--output' && args[i + 1]) {
      outputPath = args[i + 1];
    }
    if (args[i] === '--no-interactive') {
      interactive = false;
    }
  }

  if (!pdfPath) {
    // 기본 PDF 경로
    pdfPath = './[EC]+WEB+개발+가이드_GTM코드추가(Shopify)1.1.pdf';
  }

  if (!fs.existsSync(pdfPath)) {
    console.error(`❌ PDF 파일을 찾을 수 없습니다: ${pdfPath}`);
    process.exit(1);
  }

  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║     시나리오 가이드 준비 시스템                                                ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝');

  try {
    // 1. PDF 파싱
    const parser = createUniversalGuideParser();
    let requirements = await parser.parseGuide(pdfPath);

    // 2. 기존 데이터와 병합
    requirements = mergeWithExisting(requirements, outputPath);

    // 3. 요약 출력
    printSummary(requirements);

    // 4. 누락 정보 수집 (interactive 모드일 때만)
    if (interactive && requirements.missingInfo.some(m => m.severity === 'critical')) {
      const proceed = await askQuestion('\n누락된 정보를 입력하시겠습니까? (y/n): ');
      if (proceed.toLowerCase() === 'y') {
        requirements = await collectMissingInfo(requirements);

        // 재검증
        requirements.validation.completeness = calculateCompleteness(requirements);
        requirements.validation.canGenerateScenario =
          requirements.missingInfo.filter(m => m.severity === 'critical').length === 0 &&
          requirements.validation.completeness >= 50;
      }
    }

    // 5. 결과 저장
    fs.writeFileSync(outputPath, JSON.stringify(requirements, null, 2));
    console.log(`\n✅ 결과 저장됨: ${outputPath}`);

    // 6. 최종 상태
    if (requirements.validation.canGenerateScenario) {
      console.log('\n🎉 시나리오 가이드 생성 준비 완료!');
      console.log('   다음 명령어로 시나리오를 생성할 수 있습니다:');
      console.log('   npx ts-node src/cli.ts analyze --url <URL> --event <EVENT>');
    } else {
      console.log('\n⚠️ 시나리오 가이드 생성을 위해 추가 정보가 필요합니다.');
      console.log('   누락된 정보를 개발가이드에서 확인하거나 직접 입력해주세요.');
    }

  } catch (error: any) {
    console.error('\n❌ 오류:', error.message);
  } finally {
    rl.close();
  }
}

function calculateCompleteness(requirements: ScenarioGuideRequirements): number {
  const total = requirements.events.length;
  if (total === 0) return 0;

  const withCondition = requirements.events.filter(e => e.firingCondition && e.firingCondition.trim() !== '').length;
  const withPages = requirements.events.filter(e => e.allowedPageTypes && e.allowedPageTypes.length > 0).length;

  return Math.round(((withCondition + withPages) / (total * 2)) * 100);
}

main();
