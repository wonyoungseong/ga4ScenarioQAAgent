/**
 * 예측 검증 실행 스크립트
 *
 * Account 293457213의 모든 Property를 분석하고
 * 예측 규칙을 학습/개선합니다.
 *
 * 인증 우선순위:
 * 1. 서비스 계정 (./credentials/service-account.json)
 * 2. OAuth 토큰 (./credentials/ga4_tokens.json) - 폴백
 */

import * as fs from 'fs';
import * as path from 'path';
import { PredictionValidator } from './validation/predictionValidator';
import { GA4AdminClient } from './ga4/ga4AdminClient';
import { ServiceAccountAuth, hasServiceAccountKey } from './ga4/serviceAccountAuth';

// Account ID
const ACCOUNT_ID = '293457213';

// Property ID → 도메인 매핑 (수동 설정 또는 자동 감지)
const PROPERTY_DOMAIN_MAP: Record<string, string> = {
  // 아모레퍼시픽 주요 사이트들
  '416629733': 'www.amoremall.com',
  // 추가 Property는 여기에 등록 또는 자동 감지
};

// 서비스 계정 인스턴스 (전역)
let serviceAccountAuth: ServiceAccountAuth | null = null;

/**
 * Access Token 가져오기 (서비스 계정 우선)
 */
async function getAccessToken(): Promise<string | null> {
  // 1. 서비스 계정 우선 시도
  if (hasServiceAccountKey()) {
    try {
      if (!serviceAccountAuth) {
        serviceAccountAuth = new ServiceAccountAuth();
        await serviceAccountAuth.initialize();
      }
      const token = await serviceAccountAuth.getAccessToken();
      console.log('✅ 서비스 계정으로 인증됨');
      return token;
    } catch (error: any) {
      console.warn(`⚠️ 서비스 계정 인증 실패: ${error.message}`);
      console.log('OAuth 토큰으로 폴백합니다...');
    }
  }

  // 2. OAuth 토큰 폴백
  return loadOAuthToken();
}

/**
 * OAuth 토큰 로드 (폴백용)
 */
function loadOAuthToken(): string | null {
  const tokenPath = './credentials/ga4_tokens.json';
  try {
    if (fs.existsSync(tokenPath)) {
      const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
      console.log('✅ OAuth 토큰 로드됨');
      return tokens.access_token;
    }
  } catch (error) {
    console.error('OAuth 토큰 로드 실패:', error);
  }
  return null;
}

/**
 * Property의 도메인 자동 감지
 */
async function detectPropertyDomains(
  accessToken: string,
  accountId: string
): Promise<Map<string, string>> {
  const domainMap = new Map<string, string>();

  // 미리 등록된 매핑 추가
  for (const [propId, domain] of Object.entries(PROPERTY_DOMAIN_MAP)) {
    domainMap.set(propId, domain);
  }

  console.log('\n🔍 Property 도메인 감지 중...');

  const adminClient = new GA4AdminClient(accessToken);
  await adminClient.initialize();

  const properties = await adminClient.listProperties(accountId);

  for (const prop of properties) {
    if (domainMap.has(prop.propertyId)) {
      console.log(`  ✅ ${prop.displayName}: ${domainMap.get(prop.propertyId)} (등록됨)`);
      continue;
    }

    // Property 이름에서 도메인 추론 시도
    const name = prop.displayName.toLowerCase();
    let domain: string | null = null;

    if (name.includes('amoremall') || name.includes('아모레몰')) {
      domain = 'www.amoremall.com';
    } else if (name.includes('innisfree') || name.includes('이니스프리')) {
      domain = 'www.innisfree.com';
    } else if (name.includes('sulwhasoo') || name.includes('설화수')) {
      domain = 'www.sulwhasoo.com';
    } else if (name.includes('laneige') || name.includes('라네즈')) {
      domain = 'www.laneige.com';
    } else if (name.includes('hera') || name.includes('헤라')) {
      domain = 'www.hera.com';
    } else if (name.includes('etude') || name.includes('에뛰드')) {
      domain = 'www.etudehouse.com';
    } else if (name.includes('iope') || name.includes('아이오페')) {
      domain = 'www.iope.com';
    } else if (name.includes('mamonde') || name.includes('마몽드')) {
      domain = 'www.mamonde.com';
    } else if (name.includes('espoir') || name.includes('에스쁘아')) {
      domain = 'www.espoir.com';
    } else if (name.includes('aritaum') || name.includes('아리따움')) {
      domain = 'www.aritaum.com';
    } else if (name.includes('osulloc') || name.includes('오설록')) {
      domain = 'www.osulloc.com';
    }

    if (domain) {
      domainMap.set(prop.propertyId, domain);
      console.log(`  🔮 ${prop.displayName}: ${domain} (추론됨)`);
    } else {
      console.log(`  ⚠️ ${prop.displayName}: 도메인 감지 실패`);
    }
  }

  return domainMap;
}

/**
 * 메인 실행
 */
async function main() {
  console.log('═'.repeat(80));
  console.log(' 예측 검증 시스템 - Account 293457213 전체 분석');
  console.log('═'.repeat(80));

  // 1. Access Token 확인 (서비스 계정 우선)
  const accessToken = await getAccessToken();
  if (!accessToken) {
    console.error('\n❌ 인증 정보가 없습니다.');
    console.log('\n다음 중 하나를 설정하세요:');
    console.log('  1. 서비스 계정: ./credentials/service-account.json');
    console.log('  2. OAuth 로그인: npx ts-node src/cli.ts ga4 login\n');
    process.exit(1);
  }

  // 2. Property 도메인 매핑 확인/감지
  const domainMap = await detectPropertyDomains(accessToken, ACCOUNT_ID);

  if (domainMap.size === 0) {
    console.error('\n❌ 분석할 Property가 없습니다.');
    process.exit(1);
  }

  // 3. Validator 초기화
  const validator = new PredictionValidator(accessToken);
  await validator.initialize();

  try {
    // 4. 전체 분석 실행
    const result = await validator.analyzeAccount(ACCOUNT_ID, domainMap);

    // 5. 결과 요약 출력
    console.log('\n' + '█'.repeat(80));
    console.log(' 분석 완료');
    console.log('█'.repeat(80));

    console.log(`\n📊 전체 정확도: ${result.aggregateAccuracy.toFixed(1)}%`);
    console.log(`📋 분석된 Property: ${result.properties.length}개`);

    const totalPages = result.properties.reduce(
      (sum, p) => sum + p.pageAnalyses.length, 0
    );
    console.log(`📄 분석된 페이지: ${totalPages}개`);

    if (result.commonIssues.length > 0) {
      console.log('\n[공통 이슈 Top 5]');
      for (const issue of result.commonIssues.slice(0, 5)) {
        console.log(`  - ${issue.issue} (${issue.count}회)`);
      }
    }

    if (result.ruleUpdates.length > 0) {
      console.log('\n[규칙 업데이트 제안]');
      for (const update of result.ruleUpdates.slice(0, 5)) {
        console.log(`  - ${update.paramKey}: ${update.suggestedRule}`);
      }
    }

    // 6. 학습 시스템 호출
    await applyLearnings(result);

  } finally {
    await validator.close();
  }
}

/**
 * 학습 결과 적용
 */
async function applyLearnings(result: any): Promise<void> {
  console.log('\n📚 학습 결과 적용 중...');

  const learningsPath = path.join(process.cwd(), 'output/validation/learnings.json');
  let learnings: any = { updates: [], history: [] };

  // 기존 학습 데이터 로드
  if (fs.existsSync(learningsPath)) {
    try {
      learnings = JSON.parse(fs.readFileSync(learningsPath, 'utf-8'));
    } catch {
      // 무시
    }
  }

  // 새로운 학습 추가
  learnings.history.push({
    date: new Date().toISOString(),
    accountId: result.accountId,
    accuracy: result.aggregateAccuracy,
    properties: result.properties.length,
    issues: result.commonIssues.length,
  });

  // 규칙 업데이트 제안 병합
  for (const update of result.ruleUpdates) {
    const existing = learnings.updates.find(
      (u: any) => u.paramKey === update.paramKey
    );

    if (existing) {
      existing.occurrences = (existing.occurrences || 1) + 1;
      existing.latestSuggestion = update.suggestedRule;
      existing.evidence.push(...update.evidence);
    } else {
      learnings.updates.push({
        ...update,
        occurrences: 1,
        firstSeen: new Date().toISOString(),
      });
    }
  }

  // 저장
  const dir = path.dirname(learningsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(learningsPath, JSON.stringify(learnings, null, 2));

  console.log(`  💾 학습 데이터 저장됨: ${learningsPath}`);
  console.log(`  📈 누적 분석 횟수: ${learnings.history.length}회`);
  console.log(`  🔧 발견된 업데이트 제안: ${learnings.updates.length}개`);

  // 자동 규칙 업데이트 (3회 이상 동일 제안 시)
  const confirmedUpdates = learnings.updates.filter(
    (u: any) => u.occurrences >= 3
  );

  if (confirmedUpdates.length > 0) {
    console.log('\n✨ 확정된 규칙 업데이트 (3회 이상 검증됨):');
    for (const update of confirmedUpdates) {
      console.log(`  - ${update.paramKey}: ${update.latestSuggestion}`);
    }

    // YAML 규칙 파일 업데이트 제안
    await suggestYamlUpdates(confirmedUpdates);
  }
}

/**
 * YAML 규칙 업데이트 제안
 */
async function suggestYamlUpdates(confirmedUpdates: any[]): Promise<void> {
  const yamlPath = path.join(
    process.cwd(),
    'specs/sites/amorepacific_GTM-5FK5X5C4/rules/value_prediction_rules.yaml'
  );

  const suggestionsPath = path.join(
    process.cwd(),
    'output/validation/yaml_update_suggestions.md'
  );

  let suggestions = `# YAML 규칙 업데이트 제안\n\n`;
  suggestions += `생성 시간: ${new Date().toISOString()}\n\n`;

  for (const update of confirmedUpdates) {
    suggestions += `## ${update.paramKey}\n\n`;
    suggestions += `- **현재 규칙**: ${update.currentRule}\n`;
    suggestions += `- **제안**: ${update.latestSuggestion}\n`;
    suggestions += `- **검증 횟수**: ${update.occurrences}회\n`;
    suggestions += `- **근거**:\n`;
    for (const evidence of update.evidence.slice(0, 5)) {
      suggestions += `  - ${evidence}\n`;
    }
    suggestions += '\n';
  }

  fs.writeFileSync(suggestionsPath, suggestions);
  console.log(`\n📝 YAML 업데이트 제안: ${suggestionsPath}`);
}

/**
 * 빠른 테스트 모드
 */
async function quickTest(pageUrl: string): Promise<void> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    console.error('❌ 인증 정보 없음. 서비스 계정 또는 OAuth 설정을 확인하세요.');
    process.exit(1);
  }

  const validator = new PredictionValidator(accessToken);
  await validator.initialize();

  try {
    await validator.quickTest(pageUrl);
  } finally {
    await validator.close();
  }
}

// CLI 처리
const args = process.argv.slice(2);

if (args[0] === 'quick' && args[1]) {
  quickTest(args[1]).catch(console.error);
} else if (args[0] === 'help') {
  console.log(`
사용법:
  npx ts-node src/run-prediction-validation.ts          전체 분석 실행
  npx ts-node src/run-prediction-validation.ts quick <URL>  단일 페이지 빠른 테스트
  npx ts-node src/run-prediction-validation.ts help     도움말
`);
} else {
  main().catch(console.error);
}
