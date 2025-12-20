/**
 * page_view 파라미터 완전 분석
 *
 * 예측 → 개발 확인 → GA4 수집 값을 하나의 테이블로 비교
 *
 * URL: https://www.amoremall.com/kr/ko/display/main
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import { GA4Client } from './ga4/ga4Client';

const TARGET_URL = 'https://www.amoremall.com/kr/ko/display/main';
const PROPERTY_ID = '416629733';

// PARAM_MAPPING_TABLE.md 기반 page_view 파라미터 정의
interface ParamMapping {
  ga4Param: string;
  devGuideVar: string;
  gtmVariable: string;
  description: string;
  type: 'event' | 'user_property' | 'conditional';
}

const PAGE_VIEW_PARAMS: ParamMapping[] = [
  // Event Parameters (공통)
  { ga4Param: 'site_name', devGuideVar: 'AP_DATA_SITENAME', gtmVariable: '{{JS - Site Name}}', description: '사이트 이름', type: 'event' },
  { ga4Param: 'site_country', devGuideVar: 'AP_DATA_COUNTRY', gtmVariable: '{{JS - Site Country}}', description: '국가코드', type: 'event' },
  { ga4Param: 'site_language', devGuideVar: 'AP_DATA_LANG', gtmVariable: '{{JS - Site Language}}', description: '페이지 언어', type: 'event' },
  { ga4Param: 'site_env', devGuideVar: 'AP_DATA_ENV', gtmVariable: '{{JS - Site Env}}', description: '개발환경', type: 'event' },
  { ga4Param: 'content_group', devGuideVar: 'AP_DATA_PAGETYPE', gtmVariable: '{{LT - Content Group}}', description: '페이지 타입', type: 'event' },
  { ga4Param: 'channel', devGuideVar: 'AP_DATA_CHANNEL', gtmVariable: '{{JS - Channel}}', description: '접속 채널', type: 'event' },
  { ga4Param: 'login_is_login', devGuideVar: 'AP_DATA_ISLOGIN', gtmVariable: '{{JS - Login Is Login}}', description: '로그인 여부', type: 'event' },
  { ga4Param: 'login_id_gcid', devGuideVar: 'AP_DATA_GCID', gtmVariable: '{{JS - Login Id Gcid}}', description: '회원ID 해시', type: 'event' },
  { ga4Param: 'login_id_cid', devGuideVar: 'AP_DATA_CID', gtmVariable: '{{JS - Login Id Cid}}', description: '통합회원번호 해시', type: 'event' },
  { ga4Param: 'page_referrer', devGuideVar: '(브라우저)', gtmVariable: '{{JS - Page Referrer}}', description: '이전 페이지 URL', type: 'event' },
  { ga4Param: 'user_agent', devGuideVar: '(브라우저)', gtmVariable: '{{JS - User Agent}}', description: 'User-Agent', type: 'event' },
  { ga4Param: 'traffic_type', devGuideVar: '(내부)', gtmVariable: '{{JS - Internal Traffic Type}}', description: '트래픽 구분', type: 'event' },

  // Page Location (breadcrumb 대체)
  { ga4Param: 'page_location_1', devGuideVar: 'AP_DATA_BREAD[0]', gtmVariable: '{{JS - Page Location 1}}', description: '1뎁스', type: 'event' },
  { ga4Param: 'page_location_2', devGuideVar: 'AP_DATA_BREAD[1]', gtmVariable: '{{JS - Page Location 2}}', description: '2뎁스', type: 'event' },
  { ga4Param: 'page_location_3', devGuideVar: 'AP_DATA_BREAD[2]', gtmVariable: '{{JS - Page Location 3}}', description: '3뎁스', type: 'event' },

  // User Properties
  { ga4Param: 'user_id', devGuideVar: 'AP_DATA_GCID', gtmVariable: '{{JS - Login Id Gcid}}', description: '사용자 식별자', type: 'user_property' },
  { ga4Param: 'login_is_sso', devGuideVar: 'AP_DATA_ISSSO', gtmVariable: '{{JS - Login Is SSO}}', description: 'SSO 로그인 여부', type: 'user_property' },
  { ga4Param: 'login_gender', devGuideVar: 'AP_DATA_CG', gtmVariable: '{{JS - Login Gender}}', description: '성별', type: 'user_property' },
  { ga4Param: 'login_birth', devGuideVar: 'AP_DATA_CD', gtmVariable: '{{JS - Login Birth (year)}}', description: '생년', type: 'user_property' },
  { ga4Param: 'login_age', devGuideVar: 'AP_DATA_AGE', gtmVariable: '{{JS - Login Age}}', description: '연령대', type: 'user_property' },
  { ga4Param: 'login_level', devGuideVar: 'AP_DATA_CT', gtmVariable: '{{JS - Login Level (internal)}}', description: '회원등급', type: 'user_property' },
  { ga4Param: 'login_beauty_level', devGuideVar: 'AP_DATA_BEAUTYCT', gtmVariable: '{{JS - Login Beauty Level}}', description: '뷰티포인트 등급', type: 'user_property' },
  { ga4Param: 'login_method', devGuideVar: 'AP_DATA_LOGINTYPE', gtmVariable: '{{JS - Login Method}}', description: '로그인 방법', type: 'user_property' },
];

async function main() {
  console.log('='.repeat(120));
  console.log(' page_view 파라미터 완전 분석: 예측 → 개발 → GA4');
  console.log(' URL:', TARGET_URL);
  console.log('='.repeat(120));

  // ============================================================================
  // 1단계: Playwright로 개발된 값 추출
  // ============================================================================
  console.log('\n📌 1단계: 개발된 값 추출 (Playwright)');
  console.log('-'.repeat(120));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  const page = await context.newPage();

  console.log('  페이지 로딩 중...');
  await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  // 모든 전역변수 추출
  const devValues = await page.evaluate(() => {
    const vars: Record<string, any> = {};

    // AP_DATA_* 변수
    const dataVars = [
      'AP_DATA_SITENAME', 'AP_DATA_COUNTRY', 'AP_DATA_LANG', 'AP_DATA_ENV',
      'AP_DATA_PAGETYPE', 'AP_DATA_CHANNEL', 'AP_DATA_ISLOGIN', 'AP_DATA_BREAD',
      'AP_DATA_GCID', 'AP_DATA_CID', 'AP_DATA_ISSSO', 'AP_DATA_CG', 'AP_DATA_CD',
      'AP_DATA_AGE', 'AP_DATA_CT', 'AP_DATA_BEAUTYCT', 'AP_DATA_LOGINTYPE',
      'AP_DATA_PAGEURL', 'AP_DATA_DOMAIN', 'AP_DATA_FULLURL', 'AP_DATA_PAGETITLE'
    ];

    for (const name of dataVars) {
      vars[name] = (window as any)[name];
    }

    // 브라우저 정보
    vars['_referrer'] = document.referrer || '(없음)';
    vars['_userAgent'] = navigator.userAgent;
    vars['_pageURL'] = window.location.href;

    return vars;
  });

  await browser.close();
  console.log('  ✅ 개발 값 추출 완료\n');

  // ============================================================================
  // 2단계: GA4 API로 수집된 값 조회
  // ============================================================================
  console.log('📌 2단계: GA4 수집 값 조회 (API)');
  console.log('-'.repeat(120));

  let ga4Values: Record<string, string> = {};

  const tokenPath = './credentials/ga4_tokens.json';
  if (fs.existsSync(tokenPath)) {
    try {
      const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
      const accessToken = tokens.access_token;

      const client = new GA4Client({
        propertyId: PROPERTY_ID,
        accessToken,
      });

      await client.initialize();

      // GA4 커스텀 디멘션으로 등록된 파라미터 조회 시도
      // 참고: GA4 Data API는 커스텀 디멘션만 직접 조회 가능
      const customDimensions = [
        'customEvent:site_name',
        'customEvent:content_group',
        'customEvent:site_language',
        'customEvent:site_country',
        'customEvent:channel',
        'customEvent:login_is_login',
      ];

      console.log('  GA4 page_view 파라미터 값 조회 중...');

      // page_view 이벤트의 주요 디멘션별 값 조회
      for (const dim of ['contentGroup', 'language', 'country']) {
        try {
          const [response] = await (client as any).client.runReport({
            property: `properties/${PROPERTY_ID}`,
            dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
            dimensions: [{ name: dim }],
            metrics: [{ name: 'eventCount' }],
            dimensionFilter: {
              andGroup: {
                expressions: [
                  {
                    filter: {
                      fieldName: 'eventName',
                      stringFilter: { value: 'page_view' },
                    },
                  },
                  {
                    filter: {
                      fieldName: 'pagePath',
                      stringFilter: { matchType: 'CONTAINS', value: '/kr/ko/display/main' },
                    },
                  },
                ],
              },
            },
            limit: 5,
            orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
          });

          if (response.rows && response.rows.length > 0) {
            const topValue = response.rows[0].dimensionValues?.[0]?.value || '';
            const count = response.rows[0].metricValues?.[0]?.value || '0';
            ga4Values[dim] = `${topValue} (${parseInt(count).toLocaleString()}건)`;
          }
        } catch (e: any) {
          // 조회 실패 시 무시
        }
      }

      // page_view 전체 카운트 조회
      const pageEvents = await client.getEventsByPage('/kr/ko/display/main', {
        startDate: '7daysAgo',
        endDate: 'today',
        limit: 100,
      });

      const pageViewCount = pageEvents
        .filter(e => e.eventName === 'page_view')
        .reduce((sum, e) => sum + e.eventCount, 0);

      ga4Values['page_view_count'] = pageViewCount.toLocaleString();

      console.log(`  ✅ GA4 조회 완료 (page_view: ${ga4Values['page_view_count']}건)\n`);

    } catch (e: any) {
      console.log(`  ⚠️ GA4 조회 실패: ${e.message}\n`);
    }
  } else {
    console.log('  ⚠️ GA4 토큰 없음 - npx ts-node src/cli.ts ga4 login 필요\n');
  }

  // ============================================================================
  // 3단계: 종합 테이블 출력
  // ============================================================================
  console.log('\n');
  console.log('━'.repeat(120));
  console.log('📊 page_view 파라미터 비교 테이블');
  console.log('━'.repeat(120));

  // 개발 변수 → 값 매핑
  const getDevValue = (devVar: string): string => {
    if (devVar === '(브라우저)') return '-';
    if (devVar === '(내부)') return 'external';
    if (devVar.includes('[')) {
      // 배열 접근 (AP_DATA_BREAD[0])
      const match = devVar.match(/^(.+)\[(\d+)\]$/);
      if (match) {
        const arr = devValues[match[1]];
        if (Array.isArray(arr)) {
          return arr[parseInt(match[2])] || '(없음)';
        }
      }
      return '(없음)';
    }
    const val = devValues[devVar];
    if (val === undefined || val === null || val === '') return '(없음)';
    if (typeof val === 'string' && val.length > 40) return val.substring(0, 37) + '...';
    return String(val);
  };

  // GA4 예상 값 (개발값 기반 예측)
  const getGA4ExpectedValue = (param: ParamMapping, devVal: string): string => {
    if (devVal === '(없음)' || devVal === '-') return '(미수집)';
    return devVal;
  };

  // 테이블 헤더
  console.log('\n### Event Parameters\n');
  console.log('| GA4 파라미터 | 설명 | 개발 변수 | 개발 값 (실제) | GA4 수집 예상 |');
  console.log('|--------------|------|-----------|----------------|---------------|');

  const eventParams = PAGE_VIEW_PARAMS.filter(p => p.type === 'event');
  for (const param of eventParams) {
    const devVal = getDevValue(param.devGuideVar);
    const ga4Expected = getGA4ExpectedValue(param, devVal);

    console.log(`| ${param.ga4Param.padEnd(20)} | ${param.description.padEnd(15)} | ${param.devGuideVar.padEnd(20)} | ${devVal.padEnd(20)} | ${ga4Expected.padEnd(15)} |`);
  }

  console.log('\n### User Properties\n');
  console.log('| GA4 파라미터 | 설명 | 개발 변수 | 개발 값 (실제) | GA4 수집 예상 |');
  console.log('|--------------|------|-----------|----------------|---------------|');

  const userParams = PAGE_VIEW_PARAMS.filter(p => p.type === 'user_property');
  for (const param of userParams) {
    const devVal = getDevValue(param.devGuideVar);
    const ga4Expected = getGA4ExpectedValue(param, devVal);

    console.log(`| ${param.ga4Param.padEnd(20)} | ${param.description.padEnd(15)} | ${param.devGuideVar.padEnd(20)} | ${devVal.padEnd(20)} | ${ga4Expected.padEnd(15)} |`);
  }

  // ============================================================================
  // 4단계: 요약
  // ============================================================================
  console.log('\n');
  console.log('━'.repeat(120));
  console.log('📋 요약');
  console.log('━'.repeat(120));

  const totalParams = PAGE_VIEW_PARAMS.length;
  const filledParams = PAGE_VIEW_PARAMS.filter(p => {
    const val = getDevValue(p.devGuideVar);
    return val !== '(없음)' && val !== '-';
  }).length;

  console.log(`
페이지: ${TARGET_URL}
페이지 타입: ${devValues['AP_DATA_PAGETYPE'] || 'MAIN'}

✅ 개발 확인 결과:
   - 전체 파라미터: ${totalParams}개
   - 값이 있는 파라미터: ${filledParams}개
   - 비로그인 상태: User Properties 대부분 미설정

✅ 주요 값:
   - site_name: ${devValues['AP_DATA_SITENAME']}
   - site_country: ${devValues['AP_DATA_COUNTRY']}
   - site_language: ${devValues['AP_DATA_LANG']}
   - content_group: ${devValues['AP_DATA_PAGETYPE']}
   - channel: ${devValues['AP_DATA_CHANNEL']}
   - login_is_login: ${devValues['AP_DATA_ISLOGIN']}

✅ GA4 수집 현황:
   - page_view 이벤트: ${ga4Values['page_view_count'] || '(조회 필요)'}건 (최근 7일)
   - contentGroup: ${ga4Values['contentGroup'] || '(조회 필요)'}
   - language: ${ga4Values['language'] || '(조회 필요)'}
`);

  // ============================================================================
  // 5단계: 상세 JSON 출력
  // ============================================================================
  console.log('\n');
  console.log('━'.repeat(120));
  console.log('📄 전역변수 상세 (JSON)');
  console.log('━'.repeat(120));
  console.log(JSON.stringify(devValues, null, 2));
}

main().catch(console.error);
