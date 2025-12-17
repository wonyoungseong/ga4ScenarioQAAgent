/**
 * 이벤트 정의 빌더 테스트 및 문서 생성
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventDefinitionBuilder, buildDefaultEventDefinitions } from './builders/eventDefinitionBuilder';
import { SystemPromptGenerator, eventDefinitionsToMarkdown } from './generators/systemPromptGenerator';

async function main() {
  console.log('=== 이벤트 정의 빌더 테스트 ===\n');

  // 1. 이벤트 정의 빌드
  console.log('【1. 이벤트 정의 빌드】');
  const result = await buildDefaultEventDefinitions();

  if (!result.success) {
    console.error('빌드 실패:', result.errors);
    return;
  }

  console.log(`✅ ${result.events.length}개 이벤트 정의 생성됨`);

  if (result.warnings.length > 0) {
    console.log(`⚠️ 경고 ${result.warnings.length}개:`);
    for (const w of result.warnings.slice(0, 5)) {
      console.log(`   - ${w}`);
    }
  }

  // 2. 카테고리별 통계
  console.log('\n【2. 카테고리별 통계】');
  const categories = new Map<string, number>();
  for (const event of result.events) {
    const cat = event.category;
    categories.set(cat, (categories.get(cat) || 0) + 1);
  }

  for (const [cat, count] of categories) {
    console.log(`   - ${cat}: ${count}개`);
  }

  // 3. 이벤트 목록 출력
  console.log('\n【3. 이벤트 목록】');
  for (const event of result.events) {
    const pages = event.pageTypeRestriction.allowedPageTypes.length > 0
      ? event.pageTypeRestriction.allowedPageTypes.join(', ')
      : '전체';
    const auto = event.firingCondition.autoFire ? '🔄' : '👆';
    const required = event.required ? '(필수)' : '';

    console.log(`   ${auto} ${event.eventName} ${required}`);
    console.log(`      └─ 페이지: ${pages}`);
  }

  // 4. 시스템 프롬프트 생성 테스트
  console.log('\n【4. 시스템 프롬프트 생성】');
  const promptGenerator = new SystemPromptGenerator(result.events);

  // PRODUCT_DETAIL 페이지용 프롬프트
  const productDetailPrompt = promptGenerator.generatePageAnalysisPrompt({
    pageType: 'PRODUCT_DETAIL',
    detailLevel: 'standard',
    includeGTMTriggers: false,
    includeVariables: false,
    includeEdgeCases: true,
  });

  console.log(`✅ PRODUCT_DETAIL 프롬프트 생성됨 (${productDetailPrompt.length} chars)`);

  // 5. Markdown 문서 생성
  console.log('\n【5. 문서 생성】');

  // 이벤트 정의 문서
  const markdownDoc = eventDefinitionsToMarkdown(result.events);
  const docPath = path.join(process.cwd(), 'output', 'event_definitions.md');

  // output 디렉토리 확인
  const outputDir = path.join(process.cwd(), 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(docPath, markdownDoc);
  console.log(`✅ Markdown 문서 저장: ${docPath}`);

  // 이벤트 정의 JSON
  const jsonPath = path.join(process.cwd(), 'output', 'event_definitions.json');
  fs.writeFileSync(jsonPath, JSON.stringify(result.events, null, 2));
  console.log(`✅ JSON 파일 저장: ${jsonPath}`);

  // 시스템 프롬프트 예시
  const promptPath = path.join(process.cwd(), 'output', 'system_prompt_example.md');
  fs.writeFileSync(promptPath, productDetailPrompt);
  console.log(`✅ 시스템 프롬프트 예시 저장: ${promptPath}`);

  // 6. 이벤트 요약
  console.log('\n【6. 이벤트 요약】');
  const summary = promptGenerator.generateEventSummary();
  const summaryPath = path.join(process.cwd(), 'output', 'event_summary.md');
  fs.writeFileSync(summaryPath, summary);
  console.log(`✅ 이벤트 요약 저장: ${summaryPath}`);

  // 7. 페이지 타입별 이벤트 분석
  console.log('\n【7. 페이지 타입별 이벤트 분석】');
  const pageTypes = ['MAIN', 'PRODUCT_DETAIL', 'PRODUCT_LIST', 'CART', 'EVENT_DETAIL'];

  for (const pageType of pageTypes) {
    const eventsForPage = result.events.filter(e => {
      if (e.pageTypeRestriction.allowedPageTypes.length === 0) return true;
      return e.pageTypeRestriction.allowedPageTypes.includes(pageType as any);
    });

    const autoEvents = eventsForPage.filter(e => e.firingCondition.autoFire);
    const userEvents = eventsForPage.filter(e => !e.firingCondition.autoFire);

    console.log(`\n   📄 ${pageType}:`);
    console.log(`      - 자동 발생: ${autoEvents.map(e => e.eventName).join(', ')}`);
    console.log(`      - 사용자 액션: ${userEvents.map(e => e.eventName).join(', ')}`);
  }

  console.log('\n=== 완료 ===');
}

main().catch(console.error);
