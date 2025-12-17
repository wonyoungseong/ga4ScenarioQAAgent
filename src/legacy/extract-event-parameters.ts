/**
 * GTM에서 이벤트 파라미터 추출
 *
 * GTM JSON 파일에서 각 이벤트별로 전송하는 파라미터 키를 추출하여
 * JSON과 Markdown 문서로 저장합니다.
 *
 * 사용법: npx ts-node src/extract-event-parameters.ts
 */

import * as path from 'path';
import { EventParameterExtractor } from './config/eventParameterConfig';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     GTM 이벤트 파라미터 추출                               ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const gtmJsonPath = path.join(process.cwd(), 'GTM-5FK5X5C4_workspace112.json');

  console.log(`\n📂 GTM JSON: ${gtmJsonPath}`);

  const extractor = new EventParameterExtractor(gtmJsonPath);

  // 요약 출력
  extractor.printSummary();

  // JSON 저장
  const jsonOutputPath = path.join(process.cwd(), 'output', 'event_parameters.json');
  extractor.saveToFile(jsonOutputPath);

  // Markdown 저장
  const mdOutputPath = path.join(process.cwd(), 'output', 'EVENT_PARAMETERS.md');
  extractor.saveToMarkdown(mdOutputPath);

  // guides 폴더에도 저장 (시나리오 작성 참조용)
  const guidesMdPath = path.join(process.cwd(), 'guides', 'EVENT_PARAMETERS.md');
  extractor.saveToMarkdown(guidesMdPath);

  console.log('\n✅ 추출 완료!');
  console.log('   - JSON: output/event_parameters.json');
  console.log('   - Markdown: output/EVENT_PARAMETERS.md');
  console.log('   - Markdown: guides/EVENT_PARAMETERS.md');
}

main().catch(console.error);
