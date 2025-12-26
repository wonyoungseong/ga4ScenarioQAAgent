/**
 * MAIN 페이지 이벤트 시나리오 검증 (GA4 API)
 *
 * 예측한 이벤트가 실제로 GA4에서 수집되고 있는지 확인합니다.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { GA4Client } from './ga4/ga4Client';
import {
  AUTO_FIRE_EVENTS_BY_PAGE,
  USER_ACTION_EVENTS_BY_PAGE,
} from './config/amoremallEventMetadata';

// Property ID
const PROPERTY_ID = process.env.GA4_PROPERTY_ID || '416629733';

// MAIN 페이지 경로 패턴
const MAIN_PAGE_PATHS = ['/kr/ko', '/kr/ko/', '/display/main'];

interface VerificationResult {
  eventName: string;
  predicted: boolean;
  predictedAs: 'autoFire' | 'userAction' | 'shouldNotFire';
  actualEventCount: number;
  proportion: number;
  percentString: string;
  verdict: 'CORRECT' | 'FALSE_POSITIVE' | 'FALSE_NEGATIVE' | 'NOISE';
  note: string;
}

async function verifyMainPageScenario() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║       MAIN 페이지 이벤트 시나리오 GA4 검증                          ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  // GA4 클라이언트 생성 (서비스 계정 사용)
  const ga4Client = new GA4Client({
    propertyId: PROPERTY_ID,
    authType: 'service_account',
    serviceAccountConfig: {
      keyFilePath: './credentials/service-account.json',
    },
  });

  try {
    console.log('🔐 GA4 API 연결 중...');
    await ga4Client.initialize();
    console.log('✅ GA4 API 연결 성공\n');

    // 예측한 이벤트 (업데이트됨: 2025-12-26)
    const predictedAutoFire = AUTO_FIRE_EVENTS_BY_PAGE['MAIN'] || [];
    const predictedUserAction = USER_ACTION_EVENTS_BY_PAGE['MAIN'] || [];

    // 캠페인 한정 이벤트 표시
    const campaignSpecificEvents = ['qualified_visit'];

    // 발생하면 안 되는 이벤트
    const shouldNotFire = [
      'view_item',
      'add_to_cart',
      'view_cart',
      'begin_checkout',
      'purchase',
      'view_search_results',
      'select_item',
    ];

    console.log('📋 예측한 이벤트:');
    console.log(`   자동 발생: ${predictedAutoFire.join(', ')}`);
    console.log(`   사용자 액션: ${predictedUserAction.join(', ')}`);
    console.log(`   발생 금지: ${shouldNotFire.join(', ')}\n`);

    // GA4에서 MAIN 페이지 이벤트 조회
    // 올바른 경로: /kr/ko/display/main (또는 /display/main)
    console.log('📊 GA4 데이터 조회 중 (최근 7일)...');
    console.log('   페이지 경로: /display/main\n');

    const pageAnalysis = await ga4Client.analyzePageEvents('/display/main', {
      startDate: '7daysAgo',
      endDate: 'today',
      limit: 200,
    });

    console.log(`   총 이벤트 수: ${pageAnalysis.totalEventCount.toLocaleString()}건`);
    console.log(`   이벤트 종류: ${pageAnalysis.events.length}개\n`);

    // 검증 결과
    const results: VerificationResult[] = [];

    // 1. 자동 발생 이벤트 검증
    console.log('='.repeat(80));
    console.log('📌 자동 발생 이벤트 검증 (autoFire)');
    console.log('='.repeat(80));

    for (const eventName of predictedAutoFire) {
      const actualEvent = pageAnalysis.events.find(e => e.eventName === eventName);

      let verdict: VerificationResult['verdict'] = 'FALSE_NEGATIVE';
      let note = '';

      if (actualEvent) {
        if (actualEvent.isNoise) {
          verdict = 'NOISE';
          note = '수집되나 노이즈 수준 (< 0.01%)';
        } else if (actualEvent.isLowSignificance) {
          verdict = 'CORRECT';
          note = '수집됨 (낮은 비중)';
        } else {
          verdict = 'CORRECT';
          note = '정상 수집됨';
        }
      } else {
        verdict = 'FALSE_NEGATIVE';
        note = '예측했으나 수집 안됨 - 구현 확인 필요';
      }

      results.push({
        eventName,
        predicted: true,
        predictedAs: 'autoFire',
        actualEventCount: actualEvent?.eventCount || 0,
        proportion: actualEvent?.proportion || 0,
        percentString: actualEvent?.percentString || '0%',
        verdict,
        note,
      });

      const status = verdict === 'CORRECT' ? '✅' : verdict === 'NOISE' ? '⚠️' : '❌';
      console.log(`\n${status} ${eventName}`);
      console.log(`   예측: 자동 발생 (페이지 로드 시)`);
      console.log(`   실제: ${actualEvent ? `${actualEvent.eventCount.toLocaleString()}건 (${actualEvent.percentString})` : '수집 안됨'}`);
      console.log(`   판정: ${verdict} - ${note}`);
    }

    // 2. 사용자 액션 이벤트 검증
    console.log('\n' + '='.repeat(80));
    console.log('👆 사용자 액션 이벤트 검증 (userAction)');
    console.log('='.repeat(80));

    for (const eventName of predictedUserAction) {
      const actualEvent = pageAnalysis.events.find(e => e.eventName === eventName);

      let verdict: VerificationResult['verdict'] = 'FALSE_NEGATIVE';
      let note = '';

      if (actualEvent) {
        if (actualEvent.isNoise) {
          verdict = 'NOISE';
          note = '수집되나 노이즈 수준 - 트리거 확인';
        } else {
          verdict = 'CORRECT';
          note = '정상 수집됨';
        }
      } else {
        // 사용자 액션은 수집 안 될 수도 있음 (사용자가 안 했을 수 있음)
        verdict = 'CORRECT';
        note = '수집 안됨 (사용자 미수행 가능)';
      }

      results.push({
        eventName,
        predicted: true,
        predictedAs: 'userAction',
        actualEventCount: actualEvent?.eventCount || 0,
        proportion: actualEvent?.proportion || 0,
        percentString: actualEvent?.percentString || '0%',
        verdict,
        note,
      });

      const status = verdict === 'CORRECT' ? '✅' : verdict === 'NOISE' ? '⚠️' : '❌';
      console.log(`\n${status} ${eventName}`);
      console.log(`   예측: 사용자 액션 (클릭/스크롤 시)`);
      console.log(`   실제: ${actualEvent ? `${actualEvent.eventCount.toLocaleString()}건 (${actualEvent.percentString})` : '수집 안됨'}`);
      console.log(`   판정: ${verdict} - ${note}`);
    }

    // 3. 발생 금지 이벤트 검증
    console.log('\n' + '='.repeat(80));
    console.log('🚫 발생 금지 이벤트 검증 (shouldNotFire)');
    console.log('='.repeat(80));

    for (const eventName of shouldNotFire) {
      const actualEvent = pageAnalysis.events.find(e => e.eventName === eventName);

      let verdict: VerificationResult['verdict'] = 'CORRECT';
      let note = '';

      if (actualEvent) {
        if (actualEvent.isNoise) {
          verdict = 'NOISE';
          note = '노이즈 수준으로 수집됨 - 정상';
        } else {
          verdict = 'FALSE_POSITIVE';
          note = '발생하면 안 되는데 수집됨 - 트리거 오류';
        }
      } else {
        verdict = 'CORRECT';
        note = '정상 (수집 안됨)';
      }

      results.push({
        eventName,
        predicted: false,
        predictedAs: 'shouldNotFire',
        actualEventCount: actualEvent?.eventCount || 0,
        proportion: actualEvent?.proportion || 0,
        percentString: actualEvent?.percentString || '0%',
        verdict,
        note,
      });

      const status = verdict === 'CORRECT' ? '✅' : verdict === 'NOISE' ? '⚠️' : '❌';
      console.log(`\n${status} ${eventName}`);
      console.log(`   예측: 발생하면 안 됨`);
      console.log(`   실제: ${actualEvent ? `${actualEvent.eventCount.toLocaleString()}건 (${actualEvent.percentString})` : '수집 안됨'}`);
      console.log(`   판정: ${verdict} - ${note}`);
    }

    // 4. 예측하지 않은 이벤트 확인
    console.log('\n' + '='.repeat(80));
    console.log('🔍 예측하지 않은 이벤트 (GA4에서 발견됨)');
    console.log('='.repeat(80));

    const allPredicted = new Set([...predictedAutoFire, ...predictedUserAction, ...shouldNotFire]);
    const ga4AutoEvents = new Set([
      'first_visit', 'session_start', 'page_view', 'scroll', 'click',
      'user_engagement', 'screen_view', 'video_start', 'video_progress', 'video_complete',
    ]);

    const unpredictedEvents = pageAnalysis.events.filter(e =>
      !allPredicted.has(e.eventName) && !ga4AutoEvents.has(e.eventName)
    );

    if (unpredictedEvents.length === 0) {
      console.log('\n✅ 없음 - 모든 유의미한 이벤트가 예측됨');
    } else {
      for (const event of unpredictedEvents) {
        const status = event.isNoise ? '🔇' : event.isLowSignificance ? '⚠️' : '❓';
        console.log(`\n${status} ${event.eventName}`);
        console.log(`   수집: ${event.eventCount.toLocaleString()}건 (${event.percentString})`);
        console.log(`   상태: ${event.isNoise ? '노이즈' : event.isLowSignificance ? '낮은 유의성' : '유의미 - 예측 추가 필요'}`);
      }
    }

    // 5. GA4 자동 수집 이벤트
    console.log('\n' + '='.repeat(80));
    console.log('📊 GA4 자동 수집 이벤트 (예측 대상 아님)');
    console.log('='.repeat(80));

    const autoCollectedInData = pageAnalysis.events.filter(e => ga4AutoEvents.has(e.eventName));
    for (const event of autoCollectedInData.slice(0, 5)) {
      console.log(`   ${event.eventName}: ${event.eventCount.toLocaleString()}건 (${event.percentString})`);
    }

    // 6. 요약
    console.log('\n' + '='.repeat(80));
    console.log('📈 검증 요약');
    console.log('='.repeat(80));

    const correct = results.filter(r => r.verdict === 'CORRECT').length;
    const falsePositive = results.filter(r => r.verdict === 'FALSE_POSITIVE').length;
    const falseNegative = results.filter(r => r.verdict === 'FALSE_NEGATIVE').length;
    const noise = results.filter(r => r.verdict === 'NOISE').length;

    console.log(`
   총 검증 항목: ${results.length}개
   ✅ CORRECT: ${correct}개 (예측 정확)
   ❌ FALSE_POSITIVE: ${falsePositive}개 (발생 안해야 하는데 발생)
   ❌ FALSE_NEGATIVE: ${falseNegative}개 (발생해야 하는데 안함)
   ⚠️ NOISE: ${noise}개 (노이즈 수준)

   정확도: ${((correct / results.length) * 100).toFixed(1)}%
`);

    // 문제 있는 항목
    const issues = results.filter(r => r.verdict === 'FALSE_POSITIVE' || r.verdict === 'FALSE_NEGATIVE');
    if (issues.length > 0) {
      console.log('⚠️ 확인 필요 항목:');
      for (const issue of issues) {
        console.log(`   - ${issue.eventName}: ${issue.verdict} - ${issue.note}`);
      }
    }

    // 전체 이벤트 목록 출력
    console.log('\n' + '='.repeat(80));
    console.log('📋 GA4 수집 이벤트 전체 목록 (상위 20개)');
    console.log('='.repeat(80));
    console.log('\n| 순위 | 이벤트명 | 수집 건수 | 비중 | 상태 |');
    console.log('|------|----------|-----------|------|------|');

    for (let i = 0; i < Math.min(20, pageAnalysis.events.length); i++) {
      const e = pageAnalysis.events[i];
      const status = e.isNoise ? '🔇 노이즈' : e.isLowSignificance ? '⚠️ 낮음' : '✅ 유의미';
      console.log(`| ${(i + 1).toString().padStart(4)} | ${e.eventName.padEnd(25)} | ${e.eventCount.toLocaleString().padStart(12)} | ${e.percentString.padStart(8)} | ${status} |`);
    }

  } catch (error: any) {
    console.error(`\n❌ GA4 API 오류: ${error.message}`);
    if (error.message.includes('PERMISSION_DENIED')) {
      console.log('\n💡 권한 오류입니다. OAuth 재인증이 필요할 수 있습니다:');
      console.log('   1. credentials/ga4_tokens.json 삭제');
      console.log('   2. 다시 실행하여 OAuth 인증');
    }
  }
}

// 실행
verifyMainPageScenario().catch(console.error);
