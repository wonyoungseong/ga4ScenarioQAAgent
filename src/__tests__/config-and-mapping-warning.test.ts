/**
 * Site Config + UNKNOWN 매핑 경고 테스트
 *
 * 1. buildURLSpecs() 매핑 누락 시 경고 출력 검증
 * 2. QAConfigFile 로드 및 CLI 인자 병합 검증
 *
 * 실행: npx ts-node src/__tests__/config-and-mapping-warning.test.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { buildURLSpecs } from '../agents/parser';
import type { ExcelURLEntry } from '../agents/parser/excel-parser';
import type { SiteMapping } from '../agents/parser/pdf-parser';

// ─────────────────────────────────────────────────────────────────────
// 테스트 헬퍼
// ─────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Mock 데이터
// ─────────────────────────────────────────────────────────────────────

const sampleExcelURLs: ExcelURLEntry[] = [
  {
    url: 'https://innisfree-japan.myshopify.com/collections/all',
    page_type: 'PRODUCT_LIST',
    page_bread: 'ALL',
    channels: { pc_login: true, pc_no_login: true, mo_login: true, mo_no_login: true },
  },
  {
    url: 'https://innisfree-japan.myshopify.com/pages/about',
    page_type: 'ABOUT',
    page_bread: 'ABOUT',
    channels: { pc_login: true, pc_no_login: true, mo_login: true, mo_no_login: true },
  },
  {
    url: 'https://www.innisfree.jp/',
    page_type: 'MAIN',
    page_bread: 'HOME',
    channels: { pc_login: true, pc_no_login: true, mo_login: true, mo_no_login: true },
  },
];

const sampleSiteMappings: SiteMapping[] = [
  {
    domain: 'innisfree.jp',
    site_name: 'INNISFREE',
    country: 'JP',
    language: 'JA',
  },
];

// ─────────────────────────────────────────────────────────────────────
// TEST 1: UNKNOWN 매핑 경고 출력 검증
// ─────────────────────────────────────────────────────────────────────

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║     Site Config + UNKNOWN 매핑 경고 테스트                     ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TEST 1: 매핑 누락 시 UNKNOWN 값 설정 + 경고 출력');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// console.warn 캡처
const originalWarn = console.warn;
const warnMessages: string[] = [];
console.warn = (...args: unknown[]) => {
  warnMessages.push(args.map(String).join(' '));
};

// myshopify.com 도메인은 siteMappings에 없으므로 UNKNOWN이 되어야 함
const specs = buildURLSpecs(sampleExcelURLs, sampleSiteMappings, 'pc_no_login', false);

// 경고 복원
console.warn = originalWarn;

// myshopify URL 2개는 UNKNOWN, innisfree.jp URL 1개는 JP
const myshopifySpecs = specs.filter(s => s.url.includes('myshopify'));
const innisfreeSpecs = specs.filter(s => s.url.includes('innisfree.jp'));

assert(myshopifySpecs.length === 2, `myshopify URL 2개 검출 (실제: ${myshopifySpecs.length})`);
assert(innisfreeSpecs.length === 1, `innisfree.jp URL 1개 검출 (실제: ${innisfreeSpecs.length})`);

// UNKNOWN 값 확인
for (const spec of myshopifySpecs) {
  assert(
    spec.expected_values['AP_DATA_COUNTRY'].value === 'UNKNOWN',
    `${spec.url} → COUNTRY = UNKNOWN`,
  );
  assert(
    spec.expected_values['AP_DATA_LANG'].value === 'UNKNOWN',
    `${spec.url} → LANG = UNKNOWN`,
  );
}

// 매핑 성공 확인
for (const spec of innisfreeSpecs) {
  assert(
    spec.expected_values['AP_DATA_COUNTRY'].value === 'JP',
    `${spec.url} → COUNTRY = JP`,
  );
  assert(
    spec.expected_values['AP_DATA_LANG'].value === 'JA',
    `${spec.url} → LANG = JA`,
  );
}

// 경고 메시지 출력 확인
const warningFound = warnMessages.some(m => m.includes('사이트 매핑 누락 경고'));
assert(warningFound, '⚠️ 사이트 매핑 누락 경고 메시지 출력됨');

const domainWarningFound = warnMessages.some(m => m.includes('innisfree-japan.myshopify.com'));
assert(domainWarningFound, '경고에 누락 도메인명(innisfree-japan.myshopify.com) 포함');

const countWarningFound = warnMessages.some(m => m.includes('2개 URL'));
assert(countWarningFound, '경고에 누락 URL 개수(2개 URL) 포함');

const hintFound = warnMessages.some(m => m.includes('--domain-map') || m.includes('--config'));
assert(hintFound, '경고에 해결 힌트(--domain-map 또는 --config) 포함');

// 경고 내용 출력
console.log('\n  [캡처된 경고 메시지]');
for (const msg of warnMessages) {
  console.log(`  ${msg}`);
}

// ─────────────────────────────────────────────────────────────────────
// TEST 2: 매핑 성공 시 경고 없음
// ─────────────────────────────────────────────────────────────────────

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TEST 2: 매핑 성공 시 경고 없음');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const warnMessages2: string[] = [];
console.warn = (...args: unknown[]) => {
  warnMessages2.push(args.map(String).join(' '));
};

// innisfree.jp URL만 사용 → 모든 매핑 성공
const mappedURLs: ExcelURLEntry[] = [
  {
    url: 'https://www.innisfree.jp/',
    page_type: 'MAIN',
    page_bread: 'HOME',
    channels: { pc_login: true, pc_no_login: true, mo_login: true, mo_no_login: true },
  },
];

const specs2 = buildURLSpecs(mappedURLs, sampleSiteMappings, 'pc_no_login', false);

console.warn = originalWarn;

assert(specs2.length === 1, `매핑 성공 URL 1개 생성`);
assert(warnMessages2.length === 0, '매핑 성공 시 경고 메시지 없음');
assert(
  specs2[0].expected_values['AP_DATA_COUNTRY'].value === 'JP',
  '매핑 성공 시 COUNTRY = JP',
);

// ─────────────────────────────────────────────────────────────────────
// TEST 3: QA Config 파일 스키마 검증
// ─────────────────────────────────────────────────────────────────────

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TEST 3: QA Config 파일 스키마 검증');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const configFilePath = path.resolve(__dirname, '../../ref - for QA Agent/innisfree-jp.qa.json');
const configExists = fs.existsSync(configFilePath);
assert(configExists, `설정 파일 존재: innisfree-jp.qa.json`);

if (configExists) {
  const content = fs.readFileSync(configFilePath, 'utf-8');
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(content);
    assert(true, 'JSON 파싱 성공');
  } catch {
    assert(false, 'JSON 파싱 실패');
    config = {};
  }

  // 필수 필드 확인
  assert(typeof config.site_id === 'string', 'site_id 필드 존재 (string)');
  assert(typeof config.guide_pdf === 'string', 'guide_pdf 필드 존재 (string)');
  assert(typeof config.appendix_pdf === 'string', 'appendix_pdf 필드 존재 (string)');
  assert(typeof config.excel === 'string', 'excel 필드 존재 (string)');

  // 선택 필드 확인
  if (config.domain_map) {
    const dm = config.domain_map as Record<string, string>;
    assert(typeof dm.from === 'string', 'domain_map.from 필드 존재 (string)');
    assert(typeof dm.to === 'string', 'domain_map.to 필드 존재 (string)');
    assert(dm.from.includes('myshopify'), 'domain_map.from에 myshopify 포함');
    assert(dm.to.includes('innisfree.jp'), 'domain_map.to에 innisfree.jp 포함');
  }

  if (config.production !== undefined) {
    assert(typeof config.production === 'boolean', 'production 필드 (boolean)');
  }

  if (config.output_dir !== undefined) {
    assert(typeof config.output_dir === 'string', 'output_dir 필드 (string)');
  }
}

// ─────────────────────────────────────────────────────────────────────
// TEST 4: CLI import 검증 (fs, path)
// ─────────────────────────────────────────────────────────────────────

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TEST 4: CLI 파일 구조 검증');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const cliContent = fs.readFileSync(path.resolve(__dirname, '../cli.ts'), 'utf-8');

assert(cliContent.includes("import * as fs from 'fs'"), 'cli.ts에 fs import 존재');
assert(cliContent.includes("import * as path from 'path'"), 'cli.ts에 path import 존재');
assert(cliContent.includes('interface QAConfigFile'), 'cli.ts에 QAConfigFile 인터페이스 존재');
assert(cliContent.includes('function loadConfigFile'), 'cli.ts에 loadConfigFile 함수 존재');
assert(cliContent.includes("'--config'"), 'cli.ts에 --config 옵션 파싱 존재');
assert(cliContent.includes('fileConfig?.guide_pdf'), 'cli.ts에 config fallback 로직 존재');
assert(cliContent.includes('fileConfig?.domain_map'), 'cli.ts에 domain_map config fallback 존재');
assert(cliContent.includes('fileConfig?.channels'), 'cli.ts에 channels config fallback 존재');
assert(cliContent.includes('.qa.json 설정 파일'), 'printUsage에 --config 설명 존재');

// ─────────────────────────────────────────────────────────────────────
// TEST 5: orchestrator 매핑 경고 코드 검증
// ─────────────────────────────────────────────────────────────────────

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TEST 5: orchestrator 매핑 경고 코드 검증');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const orchContent = fs.readFileSync(path.resolve(__dirname, '../orchestrator.ts'), 'utf-8');

assert(
  orchContent.includes('사이트 매핑 누락'),
  'orchestrator.ts에 사이트 매핑 누락 경고 코드 존재',
);
assert(
  orchContent.includes('COUNTRY/LANG = UNKNOWN'),
  'orchestrator.ts에 UNKNOWN 경고 메시지 존재',
);
assert(
  orchContent.includes('--domain-map'),
  'orchestrator.ts에 해결 힌트 존재',
);

// ─────────────────────────────────────────────────────────────────────
// 결과 요약
// ─────────────────────────────────────────────────────────────────────

console.log('\n════════════════════════════════════════════════════════════════');
console.log(`테스트 결과: ${passed}/${passed + failed} PASSED`);
if (failed > 0) {
  console.log(`❌ ${failed}건 실패`);
} else {
  console.log('✅ 모든 테스트 통과');
}
console.log('════════════════════════════════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
}
