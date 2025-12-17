/**
 * GTM Document Generator 테스트 스크립트
 * 모든 이벤트에 대해 문서 생성을 테스트합니다.
 */

import { GTMDocumentGenerator } from './analyzers/gtmDocumentGenerator';

const GTM_PATH = './GTM-5FK5X5C4_workspace112.json';

async function main() {
  console.log('═'.repeat(70));
  console.log('GTM Document Generator 테스트');
  console.log('═'.repeat(70));
  console.log('');

  const generator = new GTMDocumentGenerator(GTM_PATH);

  // 1. 모든 이벤트 목록 출력
  const events = generator.getAvailableEvents();
  console.log(`총 ${events.length}개의 이벤트 발견:`);
  events.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
  console.log('');

  // 2. 이벤트 요약 보고서 생성
  console.log('이벤트 요약 보고서:');
  console.log(generator.generateEventSummary());
  console.log('');

  // 3. 사용자가 요청한 모든 이벤트 테스트
  const testEvents = [
    'page_view', 'page_load_time', 'screen_view', 'view_search_results',
    'scroll', 'video_start', 'video_progress', 'video_complete',
    'ap_click', 'click_with_duration', 'view_promotion_detail',
    'login', 'sign_up', 'user_process', 'write_review',
    'view_promotion', 'select_promotion', 'view_item_list', 'select_item',
    'view_item', 'add_to_cart', 'begin_checkout', 'purchase', 'remove_from_cart'
  ];

  console.log('═'.repeat(70));
  console.log('개별 이벤트 분석 결과');
  console.log('═'.repeat(70));

  const results: { event: string; status: 'found' | 'not_found'; category?: string; triggerType?: string }[] = [];

  for (const eventName of testEvents) {
    const doc = generator.generateEventDocument(eventName);

    if (doc) {
      results.push({
        event: eventName,
        status: 'found',
        category: doc.eventCategory,
        triggerType: doc.trigger.type
      });
    } else {
      results.push({
        event: eventName,
        status: 'not_found'
      });
    }
  }

  // 결과 테이블 출력
  console.log('\n이벤트 분석 결과:');
  console.log('─'.repeat(70));
  console.log(`${'이벤트명'.padEnd(25)} | ${'상태'.padEnd(10)} | ${'카테고리'.padEnd(15)} | ${'트리거 타입'}`);
  console.log('─'.repeat(70));

  for (const r of results) {
    const status = r.status === 'found' ? '✓ 발견' : '✗ 없음';
    const category = r.category || '-';
    const trigger = r.triggerType || '-';
    console.log(`${r.event.padEnd(25)} | ${status.padEnd(10)} | ${category.padEnd(15)} | ${trigger}`);
  }

  console.log('─'.repeat(70));

  // 4. select_promotion 상세 문서 출력 (예시)
  console.log('\n');
  console.log('═'.repeat(70));
  console.log('SELECT_PROMOTION 상세 문서 예시');
  console.log('═'.repeat(70));

  const selectPromotionDoc = generator.generateEventDocument('select_promotion');
  if (selectPromotionDoc) {
    console.log(generator.formatAsReadableDocument(selectPromotionDoc));
  }

  // 5. view_item 상세 문서 출력 (dataLayer 기반 이벤트 예시)
  console.log('\n');
  console.log('═'.repeat(70));
  console.log('VIEW_ITEM 상세 문서 예시 (dataLayer 기반)');
  console.log('═'.repeat(70));

  const viewItemDoc = generator.generateEventDocument('view_item');
  if (viewItemDoc) {
    console.log(generator.formatAsReadableDocument(viewItemDoc));
  }

  // 6. Vision AI 프롬프트 생성 예시
  console.log('\n');
  console.log('═'.repeat(70));
  console.log('Vision AI 프롬프트 생성 예시 (select_promotion)');
  console.log('═'.repeat(70));

  const prompt = generator.generateVisionPrompt('select_promotion', 'https://amoremall.com/kr/ko/');
  if (prompt) {
    console.log(prompt);
  }

  console.log('\n테스트 완료!');
}

main().catch(console.error);
