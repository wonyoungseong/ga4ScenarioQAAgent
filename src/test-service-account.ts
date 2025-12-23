/**
 * 서비스 계정 인증 테스트
 */

import {
  ServiceAccountAuth,
  hasServiceAccountKey,
  printServiceAccountSetupGuide
} from './ga4/serviceAccountAuth';
import { GA4AdminClient } from './ga4/ga4AdminClient';
import { GA4Client } from './ga4/ga4Client';

async function main() {
  console.log('═'.repeat(60));
  console.log(' 서비스 계정 인증 테스트');
  console.log('═'.repeat(60));

  // 서비스 계정 키 파일 확인
  const hasKey = hasServiceAccountKey();
  console.log(`\n서비스 계정 키 파일 존재: ${hasKey ? '✅ 있음' : '❌ 없음'}`);

  if (!hasKey) {
    console.log('\n⚠️ 서비스 계정 키 파일이 없습니다.');
    printServiceAccountSetupGuide();
    return;
  }

  // 서비스 계정 인증 테스트
  console.log('\n📦 서비스 계정 인증 테스트...');

  try {
    const auth = new ServiceAccountAuth();
    await auth.initialize();

    console.log(`✅ 서비스 계정: ${auth.getServiceAccountEmail()}`);
    console.log(`   프로젝트 ID: ${auth.getProjectId()}`);

    // GA4 Admin API 테스트
    console.log('\n📋 GA4 계정 목록 조회...');
    const adminClient = new GA4AdminClient({
      authType: 'service_account',
    });
    await adminClient.initialize();

    const accounts = await adminClient.listAccounts();
    console.log(`   발견된 계정: ${accounts.length}개`);

    for (const account of accounts) {
      console.log(`   - ${account.displayName} (${account.accountId})`);
    }

    console.log('\n✅ 서비스 계정 인증 테스트 완료!');

  } catch (error: any) {
    console.error(`\n❌ 오류: ${error.message}`);
  }
}

main().catch(console.error);
