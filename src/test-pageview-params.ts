/**
 * page_view 이벤트 GA4 파라미터 수집
 */

import { chromium } from 'playwright';

const TARGET_URL = 'https://www.amoremall.com/kr/ko/display/main';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     page_view 이벤트 GA4 파라미터 수집                          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'ko-KR',
  });
  const page = await context.newPage();

  const ga4Requests: { url: string; postData?: string }[] = [];

  // GA4 네트워크 요청 캡처
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('google-analytics.com/g/collect') ||
        url.includes('analytics.google.com/g/collect')) {
      ga4Requests.push({
        url: url,
        postData: request.postData() || undefined,
      });
    }
  });

  console.log(`📍 페이지 로드: ${TARGET_URL}\n`);
  await page.goto(TARGET_URL, {
    waitUntil: 'networkidle',
    timeout: 60000
  });

  // 추가 요청 대기
  await page.waitForTimeout(3000);

  console.log(`📊 GA4 요청 수: ${ga4Requests.length}개\n`);
  console.log('═'.repeat(70));

  // 모든 GA4 요청 분석
  let pageViewFound = false;

  for (let i = 0; i < ga4Requests.length; i++) {
    const req = ga4Requests[i];
    const urlObj = new URL(req.url);
    const eventName = urlObj.searchParams.get('en');

    console.log(`\n[${i + 1}] 이벤트: ${eventName || '(없음)'}`);

    if (eventName === 'page_view') {
      pageViewFound = true;
      console.log('\n' + '='.repeat(70));
      console.log('🎯 page_view 이벤트 파라미터');
      console.log('='.repeat(70));

      // URL 파라미터 파싱
      const params = Object.fromEntries(urlObj.searchParams);

      // 파라미터 카테고리별 분류
      const categories: Record<string, Record<string, string>> = {
        '이벤트 정보': {},
        '페이지 정보': {},
        '사용자 정보': {},
        '세션/클라이언트': {},
        '기술 정보': {},
        '기타': {},
      };

      for (const [key, value] of Object.entries(params)) {
        // 이벤트 정보
        if (['en', 'ep.event_action', 'ep.event_label', 'ep.event_category'].includes(key) || key.startsWith('ep.')) {
          categories['이벤트 정보'][key] = value;
        }
        // 페이지 정보
        else if (['dl', 'dr', 'dt', 'dp'].includes(key) || key.includes('page') || key.includes('title')) {
          categories['페이지 정보'][key] = value;
        }
        // 사용자 정보
        else if (['uid', 'cid', '_fid'].includes(key) || key.includes('user')) {
          categories['사용자 정보'][key] = value;
        }
        // 세션/클라이언트
        else if (['sid', 'sct', '_s', '_ss', '_nsi', 'seg'].includes(key) || key.includes('session')) {
          categories['세션/클라이언트'][key] = value;
        }
        // 기술 정보
        else if (['v', 'tid', 'gtm', 'sr', 'ul', '_p', '_z', '_eu', '_gaz'].includes(key)) {
          categories['기술 정보'][key] = value;
        }
        // 기타
        else {
          categories['기타'][key] = value;
        }
      }

      // 카테고리별 출력
      for (const [category, categoryParams] of Object.entries(categories)) {
        const keys = Object.keys(categoryParams);
        if (keys.length > 0) {
          console.log(`\n【 ${category} 】`);
          for (const [key, value] of Object.entries(categoryParams)) {
            const decodedValue = decodeURIComponent(value);
            console.log(`  ${key}: ${decodedValue.substring(0, 100)}${decodedValue.length > 100 ? '...' : ''}`);
          }
        }
      }

      // 전체 파라미터 키 목록
      console.log('\n' + '-'.repeat(70));
      console.log('📋 전체 파라미터 키 목록:');
      console.log('-'.repeat(70));
      const allKeys = Object.keys(params).sort();
      console.log(allKeys.join(', '));
      console.log(`\n총 ${allKeys.length}개 파라미터`);
    }
  }

  if (!pageViewFound) {
    console.log('\n⚠️ page_view 이벤트가 명시적으로 발견되지 않았습니다.');
    console.log('수집된 이벤트 목록:');
    for (const req of ga4Requests) {
      const urlObj = new URL(req.url);
      const en = urlObj.searchParams.get('en');
      console.log(`  - ${en || '(no event name)'}`);
    }
  }

  await browser.close();
  console.log('\n✅ 완료');
}

main().catch(console.error);
