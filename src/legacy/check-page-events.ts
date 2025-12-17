/**
 * 페이지별 이벤트 & GA4 파라미터 맵핑 조회
 *
 * URL을 입력하면:
 * 1. 페이지 타입 감지
 * 2. 해당 페이지에서 발생 가능한 이벤트 목록
 * 3. 각 이벤트의 파라미터와 GA4 API dimension 맵핑
 *
 * 사용법: npx ts-node src/check-page-events.ts --url <URL>
 * 예: npx ts-node src/check-page-events.ts --url https://www.amoremall.com/kr/ko/display/main
 */

import * as fs from 'fs';
import { detectPageTypeFromUrl, PageType } from './types/pageContext';
import { createDefaultGTMConfigLoader } from './config/gtmConfigLoader';
import { createGTMToGA4MappingGenerator } from './config/gtmToGa4ParameterMapping';

interface PageEventInfo {
  url: string;
  pageType: PageType;
  pageTypeDescription: string;
  events: EventWithGA4Mapping[];
}

interface EventWithGA4Mapping {
  eventName: string;
  source: string;
  confidence: number;
  ga4Filter: string;
  eventParams: Record<string, string>;  // GTM key → GA4 dimension
  itemParams: Record<string, string>;   // GTM key → GA4 dimension
}

async function checkPageEvents(url: string): Promise<PageEventInfo> {
  // 1. 페이지 타입 감지
  const pageType = detectPageTypeFromUrl(url);

  // 2. GTM Config 로드
  const gtmLoader = createDefaultGTMConfigLoader();
  await gtmLoader.preload();

  // 3. GA4 맵핑 생성기
  const mappingGenerator = createGTMToGA4MappingGenerator();
  const allMappings = mappingGenerator.generateSimpleMappings();

  // 4. 해당 페이지 타입의 이벤트 조회
  const rawEvents = gtmLoader.getEventsForPageType(pageType);

  // 5. 각 이벤트에 GA4 맵핑 정보 추가
  const events: EventWithGA4Mapping[] = rawEvents.map(event => {
    const mapping = allMappings[event.eventName];
    return {
      eventName: event.eventName,
      source: event.source,
      confidence: event.confidence,
      ga4Filter: mapping?.ga4Filter || `eventName == '${event.eventName}'`,
      eventParams: mapping?.eventParams || {},
      itemParams: mapping?.itemParams || {},
    };
  });

  // 페이지 타입 설명
  const pageTypeDescriptions: Record<string, string> = {
    'MAIN': '메인 페이지',
    'BRAND_MAIN': '브랜드 메인 페이지',
    'BRAND_PRODUCT_LIST': '브랜드 상품 목록 페이지',
    'BRAND_EVENT_LIST': '브랜드 이벤트 목록 페이지',
    'BRAND_CUSTOM_ETC': '브랜드 커스텀 기타 페이지',
    'BRAND_LIST': '브랜드 목록 페이지',
    'PRODUCT_DETAIL': '상품 상세 페이지',
    'PRODUCT_LIST': '상품 리스트 페이지',
    'CATEGORY_LIST': '카테고리 메인 페이지',
    'SEARCH': '검색 레이어 페이지',
    'SEARCH_RESULT': '검색 결과 페이지',
    'CART': '장바구니 페이지',
    'ORDER': '주문서 페이지',
    'MY': '마이 페이지',
    'MEMBERSHIP': '멤버십 페이지',
    'CUSTOMER': '고객센터 페이지',
    'EVENT_LIST': '이벤트 리스트 페이지',
    'EVENT_DETAIL': '이벤트 상세 페이지',
    'LIVE_LIST': '라이브 리스트 페이지',
    'LIVE_DETAIL': '라이브 상세 페이지',
    'HISTORY': '히스토리/연혁 페이지',
    'AMORESTORE': '아모레스토어 페이지',
    'BEAUTYFEED': '뷰티피드 페이지',
    'OTHERS': '기타 페이지',
  };

  return {
    url,
    pageType,
    pageTypeDescription: pageTypeDescriptions[pageType] || pageType,
    events,
  };
}

function printResults(info: PageEventInfo): void {
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║     페이지별 이벤트 & GA4 파라미터 맵핑 조회                                   ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

  console.log(`📍 URL: ${info.url}`);
  console.log(`📄 페이지 타입: ${info.pageType} (${info.pageTypeDescription})`);

  // confidence 레벨별 분류
  const highConfidence = info.events.filter(e => e.confidence >= 70);
  const lowConfidence = info.events.filter(e => e.confidence < 70);

  console.log(`📊 예상 이벤트: ${info.events.length}개 (핵심: ${highConfidence.length}개, 기타: ${lowConfidence.length}개)\n`);

  // 핵심 이벤트 (70% 이상)
  console.log('═'.repeat(90));
  console.log('🎯 핵심 이벤트 (Confidence ≥ 70%)');
  console.log('═'.repeat(90));

  if (highConfidence.length === 0) {
    console.log('\n⚠️ 이 페이지에 대한 명확한 이벤트 정의가 없습니다.\n');
  }

  for (const event of highConfidence) {
    printEventDetail(event);
  }

  // 기타 이벤트 (70% 미만) - 요약만 표시
  if (lowConfidence.length > 0) {
    console.log('\n' + '═'.repeat(90));
    console.log('⚠️ 기타 이벤트 (Confidence < 70%) - 매핑 정보 불명확');
    console.log('═'.repeat(90));
    console.log('');

    const columns = 3;
    for (let i = 0; i < lowConfidence.length; i += columns) {
      const row = lowConfidence.slice(i, i + columns)
        .map(e => `${e.eventName} (${e.confidence}%)`.padEnd(30))
        .join('');
      console.log(`   ${row}`);
    }
  }

  // GA4 API 쿼리 예시
  printGA4QueryExample(info.events);
}

function printEventDetail(event: EventWithGA4Mapping): void {
  const hasEventParams = Object.keys(event.eventParams).length > 0;
  const hasItemParams = Object.keys(event.itemParams).length > 0;

  console.log(`\n┌─ ${event.eventName} ${'─'.repeat(Math.max(0, 70 - event.eventName.length))}┐`);
  console.log(`│ Source: ${event.source.padEnd(15)} Confidence: ${event.confidence}%`);
  console.log(`│ GA4 Filter: ${event.ga4Filter}`);

  if (hasEventParams) {
    console.log('│');
    console.log('│ 📤 Event Parameters (GTM → GA4 API Dimension):');
    for (const [gtmKey, ga4Dim] of Object.entries(event.eventParams)) {
      const isCustom = ga4Dim.startsWith('customEvent:');
      const marker = isCustom ? ' [커스텀]' : ' [표준]';
      console.log(`│   ${gtmKey.padEnd(28)} → ${ga4Dim}${marker}`);
    }
  }

  if (hasItemParams) {
    console.log('│');
    console.log('│ 📦 Item Parameters (GTM → GA4 API Dimension):');
    for (const [gtmKey, ga4Dim] of Object.entries(event.itemParams)) {
      const isCustom = ga4Dim.startsWith('customEvent:');
      const marker = isCustom ? ' [커스텀]' : ' [표준]';
      console.log(`│   ${gtmKey.padEnd(28)} → ${ga4Dim}${marker}`);
    }
  }

  console.log(`└${'─'.repeat(75)}┘`);
}

function printGA4QueryExample(events: EventWithGA4Mapping[]): void {
  const highConfidence = events.filter(e => e.confidence >= 70);
  if (highConfidence.length === 0) return;

  const sampleEvent = highConfidence[0];
  const sampleParams = Object.entries(sampleEvent.eventParams).slice(0, 2);
  const sampleItemParams = Object.entries(sampleEvent.itemParams).slice(0, 2);

  console.log('\n' + '═'.repeat(90));
  console.log('🤖 AI 검증용 GA4 Data API 쿼리 예시');
  console.log('═'.repeat(90));

  console.log(`
이벤트: ${sampleEvent.eventName}

GA4 Data API Request:
{
  "dateRanges": [{ "startDate": "7daysAgo", "endDate": "today" }],
  "dimensions": [
    { "name": "eventName" }${sampleParams.map(([, dim]) => `,\n    { "name": "${dim}" }`).join('')}${sampleItemParams.map(([, dim]) => `,\n    { "name": "${dim}" }`).join('')}
  ],
  "metrics": [{ "name": "eventCount" }],
  "dimensionFilter": {
    "filter": {
      "fieldName": "eventName",
      "stringFilter": { "value": "${sampleEvent.eventName}" }
    }
  }
}
`);
}

async function main() {
  const args = process.argv.slice(2);
  let url = 'https://www.amoremall.com/kr/ko/display/main';  // 기본값

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) {
      url = args[i + 1];
    }
  }

  try {
    const info = await checkPageEvents(url);
    printResults(info);

    // JSON 저장
    const outputPath = './output/page_event_mapping.json';
    fs.writeFileSync(outputPath, JSON.stringify(info, null, 2));
    console.log(`\n✅ 결과 저장됨: ${outputPath}`);

  } catch (error: any) {
    console.error('❌ 오류:', error.message);
    process.exit(1);
  }
}

main();
