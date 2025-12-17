/**
 * 각 페이지 타입별 AP_DATA_PAGETYPE 확인
 */
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const pages = [
    { name: '브랜드 페이지', url: 'https://www.amoremall.com/kr/ko/display/brand?brandCd=SULWHASOO' },
    { name: '검색 결과', url: 'https://www.amoremall.com/kr/ko/search?keyword=%EC%84%A4%ED%99%94%EC%88%98' },
    { name: '카테고리 페이지', url: 'https://www.amoremall.com/kr/ko/display/category?ctgrNo=10000003' },
    { name: '메인 페이지', url: 'https://www.amoremall.com/kr/ko/display/main' },
  ];

  for (const p of pages) {
    console.log(`\n=== ${p.name} ===`);
    console.log(`URL: ${p.url}`);

    try {
      await page.goto(p.url, { waitUntil: 'networkidle', timeout: 60000 });

      // 팝업 닫기 시도
      try { await page.click('[class*="close"]', { timeout: 2000 }); } catch {}
      await page.waitForTimeout(2000);

      const data = await page.evaluate(() => {
        const result: any = {
          AP_DATA_PAGETYPE: 'undefined',
          AP_PAGE_TYPE: 'undefined',
          apPrdIdCount: 0,
          productCards: 0
        };

        try {
          // @ts-ignore
          result.AP_DATA_PAGETYPE = typeof AP_DATA_PAGETYPE !== 'undefined' ? AP_DATA_PAGETYPE : 'undefined';
        } catch {}

        try {
          // @ts-ignore
          result.AP_PAGE_TYPE = typeof AP_PAGE_TYPE !== 'undefined' ? AP_PAGE_TYPE : 'undefined';
        } catch {}

        result.apPrdIdCount = document.querySelectorAll('[ap-prd-id]').length;
        result.productCards = document.querySelectorAll('[class*="product"], [class*="prd-"]').length;

        return result;
      });

      console.log('AP_DATA_PAGETYPE:', data.AP_DATA_PAGETYPE);
      console.log('AP_PAGE_TYPE:', data.AP_PAGE_TYPE);
      console.log('[ap-prd-id] 요소:', data.apPrdIdCount);
      console.log('상품 카드 요소:', data.productCards);
    } catch (e: any) {
      console.log('Error:', e.message);
    }
  }

  await browser.close();
}

main().catch(console.error);
