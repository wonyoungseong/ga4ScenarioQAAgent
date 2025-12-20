/**
 * GTM 변수 체인 파서 테스트
 */

import {
  parseGTMFile,
  printVariableChain,
  extractUltimateDataSources,
  GTMVariableChainParser,
  loadGTMJson,
  saveMappingTable,
  generateMappingTableMarkdown,
} from './parsers/gtmVariableChainParser';
import * as path from 'path';
import * as fs from 'fs';

const GTM_FILE = path.join(__dirname, '..', 'GTM-5FK5X5C4_workspace112.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'output');

async function main() {
  console.log('═'.repeat(80));
  console.log(' GTM 변수 체인 추적 파서 테스트');
  console.log('═'.repeat(80));
  console.log();

  // 1. GTM 파일 파싱
  console.log('📂 GTM 파일 파싱 중...');
  const config = parseGTMFile(GTM_FILE);

  console.log(`\n✅ 파싱 완료!`);
  console.log(`   - Container ID: ${config.containerId}`);
  console.log(`   - 변수 개수: ${config.variables.size}`);
  console.log(`   - Event Settings 파라미터: ${config.eventSettings.length}`);
  console.log();

  // 2. Event Settings 요약
  console.log('─'.repeat(80));
  console.log('📊 Event Settings 파라미터 (GT - Event Settings)');
  console.log('─'.repeat(80));

  const eventParams = config.eventSettings.filter(p => p.scope === 'event');
  const userProps = config.eventSettings.filter(p => p.scope === 'user');

  console.log(`\n[Event Parameters] (${eventParams.length}개)`);
  for (const param of eventParams.slice(0, 15)) {  // 처음 15개만
    console.log(`   ${param.ga4Param.padEnd(25)} ← ${param.gtmVariable}`);
  }
  if (eventParams.length > 15) {
    console.log(`   ... 외 ${eventParams.length - 15}개`);
  }

  console.log(`\n[User Properties] (${userProps.length}개)`);
  for (const prop of userProps) {
    console.log(`   ${prop.ga4Param.padEnd(25)} ← ${prop.gtmVariable}`);
  }

  // 3. Measurement ID 설정
  console.log();
  console.log('─'.repeat(80));
  console.log('🎯 Measurement ID 설정');
  console.log('─'.repeat(80));

  if (config.measurementIdConfig) {
    console.log(`\n   변수: ${config.measurementIdConfig.variableName}`);
    console.log('   조건별 Measurement ID:');
    for (const cond of config.measurementIdConfig.conditions) {
      const env = cond.environment ? ` (${cond.environment})` : '';
      console.log(`      "${cond.pattern}" → ${cond.measurementId}${env}`);
    }
  } else {
    console.log('\n   Measurement ID 설정을 찾지 못했습니다.');
  }

  // 4. 변수 체인 상세 분석 (샘플)
  console.log();
  console.log('─'.repeat(80));
  console.log('🔗 변수 체인 상세 분석 (샘플)');
  console.log('─'.repeat(80));

  const sampleParams = ['site_name', 'login_id_gcid', 'content_group', 'channel', 'login_is_login'];

  for (const paramName of sampleParams) {
    const chain = config.variableChains.get(paramName);
    if (chain) {
      console.log(`\n📌 ${paramName}`);
      console.log('─'.repeat(40));
      console.log(printVariableChain(chain));

      // 최종 데이터 소스
      const ultimateSources = extractUltimateDataSources(chain);
      console.log('\n   🎯 최종 데이터 소스:');
      for (const source of ultimateSources) {
        let desc = `      - ${source.type}: ${source.name}`;
        if (source.fallback) desc += ` (fallback: "${source.fallback}")`;
        console.log(desc);
      }
    }
  }

  // 5. 변수 타입별 통계
  console.log();
  console.log('─'.repeat(80));
  console.log('📈 변수 타입별 통계');
  console.log('─'.repeat(80));

  const typeStats = new Map<string, number>();
  for (const [, variable] of config.variables) {
    const count = typeStats.get(variable.type) || 0;
    typeStats.set(variable.type, count + 1);
  }

  const typeNames: Record<string, string> = {
    'jsm': 'Custom JavaScript',
    'v': 'DataLayer Variable',
    'smm': 'Simple Lookup Table',
    'remm': 'RegEx Lookup Table',
    'c': 'Constant',
    'gtes': 'Event Settings',
    'gas': 'GA Settings',
    'aev': 'Auto-Event Variable',
    'unknown': 'Unknown',
  };

  console.log();
  for (const [type, count] of Array.from(typeStats.entries()).sort((a, b) => b[1] - a[1])) {
    const name = typeNames[type] || type;
    console.log(`   ${type.padEnd(8)} (${name.padEnd(22)}): ${count}개`);
  }

  // 6. 데이터 소스 통계
  console.log();
  console.log('─'.repeat(80));
  console.log('📊 데이터 소스 타입별 통계');
  console.log('─'.repeat(80));

  const sourceStats = new Map<string, Set<string>>();  // type → names
  for (const [, variable] of config.variables) {
    for (const source of variable.dataSources) {
      if (!sourceStats.has(source.type)) {
        sourceStats.set(source.type, new Set());
      }
      sourceStats.get(source.type)!.add(source.name);
    }
  }

  console.log();
  for (const [type, names] of sourceStats) {
    console.log(`   ${type}:`);
    const nameList = Array.from(names).slice(0, 5);
    for (const name of nameList) {
      console.log(`      - ${name}`);
    }
    if (names.size > 5) {
      console.log(`      ... 외 ${names.size - 5}개`);
    }
  }

  // 7. 전역변수 목록
  console.log();
  console.log('─'.repeat(80));
  console.log('🌐 사용된 전역변수 (AP_*) 목록');
  console.log('─'.repeat(80));

  const globalVars = new Set<string>();
  for (const [, variable] of config.variables) {
    for (const source of variable.dataSources) {
      if (source.type === 'global_variable' && source.name.startsWith('AP_')) {
        globalVars.add(source.name);
      }
    }
  }

  console.log(`\n   총 ${globalVars.size}개의 전역변수 사용:`);
  const sortedGlobals = Array.from(globalVars).sort();
  for (const gv of sortedGlobals) {
    console.log(`      - ${gv}`);
  }

  // 8. DataLayer 변수 목록
  console.log();
  console.log('─'.repeat(80));
  console.log('📥 사용된 DataLayer 변수 목록');
  console.log('─'.repeat(80));

  const dlVars = new Set<string>();
  for (const [, variable] of config.variables) {
    for (const source of variable.dataSources) {
      if (source.type === 'datalayer') {
        dlVars.add(source.name);
      }
    }
  }

  console.log(`\n   총 ${dlVars.size}개의 DataLayer 변수 사용:`);
  const sortedDL = Array.from(dlVars).sort();
  for (const dl of sortedDL) {
    console.log(`      - ${dl}`);
  }

  // 9. 매핑 테이블 자동 생성
  console.log();
  console.log('─'.repeat(80));
  console.log('📝 매핑 테이블 자동 생성');
  console.log('─'.repeat(80));

  // output 디렉토리 생성
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const outputPath = path.join(OUTPUT_DIR, 'PARAM_MAPPING_TABLE_AUTO.md');
  saveMappingTable(config, outputPath);
  console.log(`\n   ✅ 매핑 테이블 생성 완료: ${outputPath}`);

  console.log();
  console.log('═'.repeat(80));
  console.log(' 파싱 완료!');
  console.log('═'.repeat(80));
}

main().catch(console.error);
