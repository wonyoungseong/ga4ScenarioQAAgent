/**
 * JSON Reporter - JSON 파일 저장
 */

import * as fs from 'fs';
import * as path from 'path';
import type { GlobalVariableValidationOutput } from '../validator';

export function saveJsonReport(
  output: GlobalVariableValidationOutput,
  outputDir: string = './output',
): string {
  // output 디렉토리 생성
  const absoluteDir = path.resolve(outputDir);
  if (!fs.existsSync(absoluteDir)) {
    fs.mkdirSync(absoluteDir, { recursive: true });
  }

  // 파일명 생성 (채널_날짜시간)
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const fileName = `qa_global_${output.channel}_${dateStr}.json`;
  const filePath = path.join(absoluteDir, fileName);

  // JSON 저장
  const jsonContent = JSON.stringify(output, null, 2);
  fs.writeFileSync(filePath, jsonContent, 'utf-8');

  console.log(`JSON 리포트 저장: ${filePath}`);
  return filePath;
}
