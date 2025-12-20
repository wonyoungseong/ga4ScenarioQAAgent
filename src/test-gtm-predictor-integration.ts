/**
 * GTM 파서 ↔ 예측 시스템 통합 테스트
 *
 * GTM 변수 체인 파서가 예측 시스템과 올바르게 통합되었는지 테스트합니다.
 */

import { createDefaultGTMConfigLoader, GTMConfigLoader } from './config/gtmConfigLoader';
import { ParameterPredictor } from './predictors/parameterPredictor';
import * as path from 'path';

async function main() {
  console.log('═'.repeat(80));
  console.log(' GTM 파서 ↔ 예측 시스템 통합 테스트');
  console.log('═'.repeat(80));
  console.log();

  // 1. GTM 설정 로더 초기화
  console.log('📦 GTM 설정 로더 초기화 중...');
  const loader = createDefaultGTMConfigLoader();

  try {
    await loader.preload();
  } catch (e) {
    console.error('❌ GTM 설정 로드 실패:', e);
    return;
  }

  console.log('\n✅ GTM 설정 로드 완료!\n');

  // 2. GTM 변수 체인 정보 조회 테스트
  console.log('─'.repeat(80));
  console.log('🔗 GTM 변수 체인 정보 조회 테스트');
  console.log('─'.repeat(80));

  const testParams = [
    'site_name',
    'site_country',
    'site_language',
    'site_env',
    'content_group',
    'channel',
    'login_is_login',
    'login_id_gcid',
    'login_id_cid',
    'login_gender',
    'page_location_1',
    'user_agent',
  ];

  console.log('\n📊 파라미터별 GTM 소스 정보:\n');

  for (const param of testParams) {
    const info = loader.getParameterGTMInfo(param);

    if (info) {
      console.log(`✅ ${param.padEnd(20)}`);
      console.log(`   GTM Variable: ${info.gtmVariable}`);
      console.log(`   Type: ${info.variableType}`);
      console.log(`   Description: ${info.description}`);
      console.log(`   Data Sources:`);
      for (const ds of info.dataSources) {
        console.log(`     - ${ds.type}: ${ds.name}${ds.fallback ? ` (fallback: "${ds.fallback}")` : ''}`);
      }
      console.log();
    } else {
      console.log(`❌ ${param.padEnd(20)} - GTM 정보 없음\n`);
    }
  }

  // 3. 전역변수 조회 테스트
  console.log('─'.repeat(80));
  console.log('🌐 전역변수 → GA4 파라미터 매핑 테스트');
  console.log('─'.repeat(80));

  const testGlobalVars = [
    'AP_DATA_SITENAME',
    'AP_DATA_GCID',
    'AP_DATA_CID',
    'AP_DATA_ISLOGIN',
    'AP_DATA_PAGETYPE',
    'AP_DATA_CHANNEL',
  ];

  console.log('\n📊 전역변수별 관련 GA4 파라미터:\n');

  for (const gv of testGlobalVars) {
    const params = loader.findParamsByGlobalVar(gv);
    console.log(`${gv}:`);
    if (params.length > 0) {
      for (const p of params) {
        console.log(`   → ${p}`);
      }
    } else {
      console.log(`   (사용하는 파라미터 없음)`);
    }
    console.log();
  }

  // 4. Measurement ID 설정 테스트
  console.log('─'.repeat(80));
  console.log('🎯 Measurement ID 설정 테스트');
  console.log('─'.repeat(80));

  const measurementConfig = loader.getMeasurementIdConfig();
  if (measurementConfig) {
    console.log(`\n변수: ${measurementConfig.variableName}`);
    console.log('조건별 Measurement ID:');
    for (const cond of measurementConfig.conditions) {
      console.log(`   "${cond.pattern}" → ${cond.measurementId} (${cond.environment || '-'})`);
    }
  } else {
    console.log('\n❌ Measurement ID 설정을 찾지 못했습니다.');
  }

  // 5. ParameterPredictor 통합 테스트
  console.log('\n');
  console.log('─'.repeat(80));
  console.log('🔮 ParameterPredictor 통합 테스트 (GTM 소스 정보 포함)');
  console.log('─'.repeat(80));

  const testUrl = 'https://www.amoremall.com/kr/ko/main';
  console.log(`\n테스트 URL: ${testUrl}\n`);

  const predictor = new ParameterPredictor(testUrl, null, loader);

  // GTM 로더 없이 예측한 경우와 비교
  const predictions = {
    site_name: predictor.predictSiteName(),
    site_country: predictor.predictSiteCountry(),
    site_env: predictor.predictSiteEnv(),
    content_group: predictor.predictContentGroup(),
  };

  console.log('📊 예측 결과 (GTM 소스 정보 포함):\n');

  for (const [param, result] of Object.entries(predictions)) {
    console.log(`${param}:`);
    console.log(`   예측값: ${result.value || '(없음)'}`);
    console.log(`   소스: ${result.source}`);
    console.log(`   신뢰도: ${result.confidence}`);

    if (result.gtmInfo) {
      console.log(`   📌 GTM 정보:`);
      console.log(`      - GTM Variable: ${result.gtmInfo.gtmVariable}`);
      console.log(`      - Type: ${result.gtmInfo.variableType}`);
      console.log(`      - ${result.gtmInfo.description}`);
    } else {
      console.log(`   ⚠️  GTM 정보 없음`);
    }
    console.log();
  }

  // 6. 전체 요약 출력
  console.log('─'.repeat(80));
  console.log('📋 전체 요약');
  console.log('─'.repeat(80));
  loader.printSummary();

  console.log('\n');
  console.log('═'.repeat(80));
  console.log(' 통합 테스트 완료!');
  console.log('═'.repeat(80));
}

main().catch(console.error);
