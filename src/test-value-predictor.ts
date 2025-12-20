/**
 * Value 예측기 테스트
 */
import {
  ValuePredictor,
  predictPageViewValues,
  PredictionContext,
} from './predictors/valuePredictor';

async function main() {
  console.log('='.repeat(80));
  console.log(' Value 예측기 테스트');
  console.log('='.repeat(80));

  const predictor = new ValuePredictor();

  // 테스트 케이스들
  const testCases: Array<{
    name: string;
    context: PredictionContext;
  }> = [
    {
      name: '아모레몰 메인 페이지 (비로그인, PC)',
      context: {
        url: 'https://www.amoremall.com/kr/ko/display/main',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        isLoggedIn: false,
      },
    },
    {
      name: '아모레몰 상품 상세 (로그인, 모바일)',
      context: {
        url: 'https://www.amoremall.com/kr/ko/product/AP01234567?onlineProdCode=AP01234567',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
        isLoggedIn: true,
        visionPageType: 'PRODUCT_DETAIL',
        visionData: {
          productName: '설화수 윤조에센스',
          productBrand: '설화수',
          productCategory: '스킨케어/에센스',
          isOutOfStock: false,
        },
        pageTitle: '설화수 윤조에센스 - 아모레몰',
      },
    },
    {
      name: '이니스프리 검색 결과',
      context: {
        url: 'https://www.innisfree.com/kr/ko/search?keyword=그린티&brand=innisfree',
        isLoggedIn: false,
        visionPageType: 'SEARCH_RESULT',
        visionData: {
          searchBrand: '이니스프리',
        },
      },
    },
    {
      name: '설화수 브랜드 메인 (개발환경)',
      context: {
        url: 'https://dev.sulwhasoo.com/kr/ko/brand/sulwhasoo-main',
        isLoggedIn: false,
        visionPageType: 'BRAND_MAIN',
        visionData: {
          brandName: '설화수',
        },
        pageTitle: '설화수 - 브랜드 메인',
      },
    },
    {
      name: '아모레몰 이벤트 상세',
      context: {
        url: 'https://www.amoremall.com/kr/ko/event/EVT20231201?eventCode=EVT20231201',
        isLoggedIn: false,
        visionPageType: 'EVENT_DETAIL',
        visionData: {
          eventName: '연말 빅세일 이벤트',
        },
        pageTitle: '연말 빅세일 이벤트 - 아모레몰',
      },
    },
    {
      name: '글로벌 사이트 (INT + EN = GL)',
      context: {
        url: 'https://www.amoremall.com/int/en/display/main',
        isLoggedIn: false,
        htmlLang: 'en',
      },
    },
    {
      name: '긴 URL 테스트 (page_location 분할)',
      context: {
        url: 'https://www.amoremall.com/kr/ko/display/category/10000001?sort=latest&page=1&size=20&filter[brand]=sulwhasoo,laneige,hera&filter[price]=0-50000&filter[category]=skincare,makeup',
        isLoggedIn: false,
      },
    },
  ];

  for (const testCase of testCases) {
    console.log('\n' + '─'.repeat(80));
    console.log(`📋 테스트: ${testCase.name}`);
    console.log(`   URL: ${testCase.context.url}`);
    console.log('─'.repeat(80));

    const results = predictor.predictAll(testCase.context);

    // 주요 결과만 출력
    const keyParams = [
      'site_name', 'site_country', 'site_language', 'site_env',
      'channel', 'content_group', 'login_is_login',
    ];

    console.log('\n[주요 파라미터]');
    for (const key of keyParams) {
      const result = results.find(r => r.key === key);
      if (result) {
        const conf = result.confidence === 'high' ? '🟢' :
          result.confidence === 'medium' ? '🟡' : '🔴';
        console.log(`  ${conf} ${result.key}: ${result.predictedValue || '(null)'}`);
      }
    }

    // 페이지 타입별 조건부 파라미터
    const contentGroup = results.find(r => r.key === 'content_group')?.predictedValue;
    if (contentGroup && contentGroup !== 'MAIN' && contentGroup !== 'OTHERS') {
      console.log(`\n[${contentGroup} 전용 파라미터]`);
      const conditionalParams = results.filter(r =>
        r.predictionType === 'page_conditional' &&
        r.predictedValue !== null
      );
      for (const p of conditionalParams) {
        const conf = p.confidence === 'high' ? '🟢' :
          p.confidence === 'medium' ? '🟡' : '🔴';
        console.log(`  ${conf} ${p.key}: ${p.predictedValue}`);
        if (p.notes) console.log(`     └─ ${p.notes}`);
      }
    }

    // page_location 테스트 (긴 URL인 경우)
    if (testCase.context.url.length > 100) {
      console.log('\n[page_location 분할]');
      for (let i = 1; i <= 5; i++) {
        const loc = results.find(r => r.key === `page_location_${i}`);
        if (loc && loc.predictedValue) {
          console.log(`  page_location_${i}: "${loc.predictedValue}" (${loc.predictedValue.length}자)`);
        }
      }
    }

    // 로그인 상태인 경우 User Properties
    if (testCase.context.isLoggedIn) {
      console.log('\n[로그인 User Properties]');
      const userProps = results.filter(r =>
        r.predictionType === 'login_only' &&
        r.key.startsWith('login_') &&
        !r.key.includes('_id_')
      );
      for (const p of userProps) {
        console.log(`  ${p.key}: ${p.predictedValue || '(null)'}`);
      }
    }
  }

  // 전체 요약
  console.log('\n' + '='.repeat(80));
  console.log(' 전체 파라미터 예측 결과 (첫 번째 테스트 케이스)');
  console.log('='.repeat(80));

  const firstResults = predictor.predictAll(testCases[0].context);
  predictor.printPredictionSummary(firstResults);

  console.log('\n✅ 테스트 완료!');
}

main().catch(console.error);
