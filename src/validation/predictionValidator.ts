/**
 * 예측 검증기 - GA4 실제 데이터와 예측값 비교
 *
 * 1. GA4 API로 모든 Property의 content_group별 대표 페이지 조회
 * 2. Playwright로 대표 페이지 방문하여 개발가이드 변수 수집
 * 3. 예측값과 실제값 비교
 * 4. 예측 규칙 개선점 도출
 */

import { chromium, Browser, Page } from 'playwright';
import { GA4Client, GA4ClientConfig, GA4PageEvent } from '../ga4/ga4Client';
import { GA4AdminClient, GA4Property } from '../ga4/ga4AdminClient';
import {
  ValuePredictor,
  PredictionContext,
  PredictionResult,
} from '../predictors/valuePredictor';
import * as fs from 'fs';
import * as path from 'path';

/**
 * content_group별 대표 페이지 정보
 */
export interface ContentGroupPage {
  contentGroup: string;
  pagePath: string;
  pageUrl: string;
  pageViewCount: number;
}

/**
 * 개발가이드 변수 수집 결과
 */
export interface DevVariables {
  AP_DATA_SITENAME?: string;
  AP_DATA_COUNTRY?: string;
  AP_DATA_LANG?: string;
  AP_DATA_ENV?: string;
  AP_DATA_CHANNEL?: string;
  AP_DATA_PAGETYPE?: string;
  AP_DATA_ISLOGIN?: string;
  AP_DATA_GCID?: string;
  AP_DATA_CID?: string;
  AP_DATA_ISSSO?: string;
  AP_DATA_CG?: string;
  AP_DATA_CD?: string;
  AP_DATA_AGE?: string;
  AP_DATA_CT?: string;
  AP_DATA_BEAUTYCT?: string;
  AP_DATA_ISEMPLOYEE?: string;
  AP_DATA_LOGINTYPE?: string;
  AP_DATA_ISSUBSCRIPTION?: string;
  [key: string]: string | undefined;
}

/**
 * GA4 실제 파라미터 값
 */
export interface GA4ActualValues {
  [key: string]: string | null;
}

/**
 * 비교 결과
 */
export interface ComparisonResult {
  key: string;
  predictedValue: string | null;
  devValue: string | null;
  ga4Value: string | null;
  match: 'exact' | 'partial' | 'mismatch' | 'na';
  notes: string;
}

/**
 * 페이지 분석 결과
 */
export interface PageAnalysisResult {
  property: GA4Property;
  contentGroup: string;
  pageUrl: string;
  pagePath: string;
  pageViewCount: number;
  devVariables: DevVariables;
  predictions: PredictionResult[];
  ga4Values: GA4ActualValues;
  comparisons: ComparisonResult[];
  accuracy: {
    total: number;
    matched: number;
    mismatched: number;
    percentage: number;
  };
}

/**
 * Property 분석 결과
 */
export interface PropertyAnalysisResult {
  property: GA4Property;
  contentGroups: ContentGroupPage[];
  pageAnalyses: PageAnalysisResult[];
  overallAccuracy: number;
  improvementSuggestions: string[];
}

/**
 * 전체 분석 결과
 */
export interface FullAnalysisResult {
  accountId: string;
  analysisDate: Date;
  properties: PropertyAnalysisResult[];
  aggregateAccuracy: number;
  commonIssues: Array<{ issue: string; count: number; examples: string[] }>;
  ruleUpdates: Array<{
    paramKey: string;
    currentRule: string;
    suggestedRule: string;
    evidence: string[];
  }>;
}

/**
 * 예측 검증기 클래스
 */
export class PredictionValidator {
  private adminClient: GA4AdminClient | null = null;
  private browser: Browser | null = null;
  private predictor: ValuePredictor;
  private accessToken: string;
  private outputDir: string;

  constructor(accessToken: string, outputDir?: string) {
    this.accessToken = accessToken;
    this.predictor = new ValuePredictor();
    this.outputDir = outputDir || path.join(process.cwd(), 'output/validation');
  }

  /**
   * 초기화
   */
  async initialize(): Promise<void> {
    // GA4 Admin Client 초기화
    this.adminClient = new GA4AdminClient(this.accessToken);
    await this.adminClient.initialize();

    // Playwright 브라우저 초기화
    this.browser = await chromium.launch({
      headless: true,
    });

    // 출력 디렉토리 생성
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    console.log('✅ PredictionValidator 초기화 완료');
  }

  /**
   * 종료
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
  }

  /**
   * URL 경로에서 content_group 추론
   */
  private inferContentGroupFromPath(pagePath: string): string | null {
    const path = pagePath.toLowerCase();

    // 아모레몰 URL 패턴
    if (path === '/' || path === '/kr/ko' || path === '/kr/ko/') {
      return 'MAIN';
    }
    if (path.includes('/product/detail')) {
      return 'PRODUCT_DETAIL';
    }
    if (path.includes('/product/list') || path.includes('/category/')) {
      return 'PRODUCT_LIST';
    }
    if (path.includes('/search')) {
      return 'SEARCH_RESULT';
    }
    if (path.includes('/cart')) {
      return 'CART';
    }
    if (path.includes('/order')) {
      return 'ORDER';
    }
    if (path.includes('/mypage') || path.includes('/my/')) {
      return 'MY';
    }
    if (path.includes('/event/') && path.includes('/detail')) {
      return 'EVENT_DETAIL';
    }
    if (path.includes('/event')) {
      return 'EVENT_LIST';
    }
    if (path.includes('/brand/') && path.includes('/main')) {
      return 'BRAND_MAIN';
    }
    if (path.includes('/brand/')) {
      return 'BRAND_PRODUCT_LIST';
    }
    if (path.includes('/live/') && path.includes('/detail')) {
      return 'LIVE_DETAIL';
    }
    if (path.includes('/live')) {
      return 'LIVE_LIST';
    }
    if (path.includes('/login')) {
      return 'LOGIN';
    }
    if (path.includes('/membership')) {
      return 'MEMBERSHIP';
    }

    return null; // 추론 불가
  }

  /**
   * 특정 Account의 모든 Property 조회
   */
  async getProperties(accountId: string): Promise<GA4Property[]> {
    if (!this.adminClient) {
      throw new Error('초기화되지 않았습니다.');
    }

    console.log(`\n📋 Account ${accountId}의 Property 목록 조회 중...`);
    const properties = await this.adminClient.listProperties(accountId);

    console.log(`   발견된 Property: ${properties.length}개`);
    for (const prop of properties) {
      console.log(`   - ${prop.displayName} (${prop.propertyId})`);
    }

    return properties;
  }

  /**
   * Property의 content_group별 대표 페이지 조회
   *
   * 중요: pagePath 대신 pageLocation(완전한 URL)을 사용하여
   * 실제 접근 가능한 URL을 확보합니다.
   */
  async getContentGroupPages(
    propertyId: string,
    domain: string
  ): Promise<ContentGroupPage[]> {
    const ga4Client = new GA4Client({
      propertyId,
      accessToken: this.accessToken,
    });
    await ga4Client.initialize();

    console.log(`\n📊 Property ${propertyId}의 content_group별 페이지 조회 중...`);
    console.log(`   📍 pageLocation(완전한 URL) 기반으로 조회`);

    // 시도할 content_group 차원 이름들 (사이트마다 다를 수 있음)
    const possibleDimensionNames = [
      'customEvent:content_group',
      'customEvent:contentGroup',
      'customEvent:AP_DATA_PAGETYPE',
      'customEvent:page_type',
    ];

    let response: any = null;
    let usedDimensionName = '';

    // 각 차원 이름을 시도 (pageLocation 사용)
    for (const dimName of possibleDimensionNames) {
      try {
        const [resp] = await (ga4Client as any).client.runReport({
          property: `properties/${propertyId}`,
          dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
          dimensions: [
            { name: dimName },
            { name: 'pageLocation' },  // 완전한 URL 사용
          ],
          metrics: [{ name: 'eventCount' }],
          dimensionFilter: {
            filter: {
              fieldName: 'eventName',
              stringFilter: { value: 'page_view' },
            },
          },
          orderBys: [
            { metric: { metricName: 'eventCount' }, desc: true },
          ],
          limit: 500,
        });
        response = resp;
        usedDimensionName = dimName;
        console.log(`   ✅ 차원 발견: ${dimName}`);
        break;
      } catch (error: any) {
        // 이 차원 이름은 실패, 다음 시도
        continue;
      }
    }

    // 모든 차원 이름 실패 시 pageLocation만으로 폴백
    if (!response) {
      console.log(`   ⚠️ content_group 차원 없음, pageLocation으로 폴백`);
      const [fallbackResp] = await (ga4Client as any).client.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'pageLocation' }],  // 완전한 URL 사용
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            stringFilter: { value: 'page_view' },
          },
        },
        orderBys: [
          { metric: { metricName: 'eventCount' }, desc: true },
        ],
        limit: 100,
      });

      // pageLocation에서 content_group 추론
      const contentGroupMap = new Map<string, ContentGroupPage>();
      if (fallbackResp.rows) {
        for (const row of fallbackResp.rows) {
          const pageLocation = row.dimensionValues?.[0]?.value || '';
          const count = parseInt(row.metricValues?.[0]?.value || '0', 10);
          if (!pageLocation) continue;

          // URL에서 pagePath 추출
          const pagePath = this.extractPathFromUrl(pageLocation);

          // URL 패턴에서 content_group 추론
          const inferredCG = this.inferContentGroupFromPath(pagePath);
          if (!inferredCG) continue;

          const existing = contentGroupMap.get(inferredCG);
          if (!existing || count > existing.pageViewCount) {
            // 쿼리 파라미터 제거한 깨끗한 URL 사용
            const cleanUrl = this.cleanPageLocation(pageLocation);
            contentGroupMap.set(inferredCG, {
              contentGroup: inferredCG,
              pagePath,
              pageUrl: cleanUrl,
              pageViewCount: count,
            });
          }
        }
      }
      return Array.from(contentGroupMap.values());
    }

    // content_group별로 가장 많은 page_view를 가진 페이지 추출
    const contentGroupMap = new Map<string, ContentGroupPage>();

    if (response.rows) {
      for (const row of response.rows) {
        const contentGroup = row.dimensionValues?.[0]?.value || '(not set)';
        const pageLocation = row.dimensionValues?.[1]?.value || '';
        const count = parseInt(row.metricValues?.[0]?.value || '0', 10);

        if (contentGroup === '(not set)' || !pageLocation) continue;

        // URL에서 pagePath 추출
        const pagePath = this.extractPathFromUrl(pageLocation);

        // 이미 있는 content_group이면 page_view가 더 많은 것만 업데이트
        const existing = contentGroupMap.get(contentGroup);
        if (!existing || count > existing.pageViewCount) {
          // 쿼리 파라미터 제거한 깨끗한 URL 사용 (검색 페이지 등 제외)
          const cleanUrl = this.cleanPageLocation(pageLocation, contentGroup);
          contentGroupMap.set(contentGroup, {
            contentGroup,
            pagePath,
            pageUrl: cleanUrl,
            pageViewCount: count,
          });
        }
      }
    }

    const result = Array.from(contentGroupMap.values());
    console.log(`   발견된 content_group: ${result.length}개`);
    for (const cg of result) {
      console.log(`   - ${cg.contentGroup}: ${cg.pageUrl} (${cg.pageViewCount.toLocaleString()} views)`);
    }

    return result;
  }

  /**
   * pageLocation에서 경로(path) 추출
   */
  private extractPathFromUrl(pageLocation: string): string {
    try {
      const url = new URL(pageLocation);
      return url.pathname;
    } catch {
      // URL 파싱 실패 시 그대로 반환
      return pageLocation;
    }
  }

  /**
   * pageLocation 정리 (불필요한 쿼리 파라미터 제거)
   * 단, 검색 페이지 등 쿼리가 필수인 경우 유지
   */
  private cleanPageLocation(pageLocation: string, contentGroup?: string): string {
    try {
      const url = new URL(pageLocation);

      // 검색 결과 페이지는 keyword/query 파라미터 유지
      if (contentGroup === 'SEARCH_RESULT' || url.pathname.includes('/search')) {
        const keyword = url.searchParams.get('keyword') || url.searchParams.get('query') || url.searchParams.get('q');
        if (keyword) {
          return `${url.origin}${url.pathname}?keyword=${encodeURIComponent(keyword)}`;
        }
      }

      // 상품 상세 페이지는 상품 ID 파라미터 유지
      if (contentGroup === 'PRODUCT_DETAIL' || url.pathname.includes('/product')) {
        const productId = url.searchParams.get('onlineProdCode') || url.searchParams.get('productId') || url.searchParams.get('id');
        if (productId) {
          const paramName = url.searchParams.has('onlineProdCode') ? 'onlineProdCode' :
                           url.searchParams.has('productId') ? 'productId' : 'id';
          return `${url.origin}${url.pathname}?${paramName}=${encodeURIComponent(productId)}`;
        }
      }

      // 이벤트 상세 페이지는 이벤트 코드 유지
      if (contentGroup === 'EVENT_DETAIL' || url.pathname.includes('/event/')) {
        const eventCode = url.searchParams.get('planDisplaySn') || url.searchParams.get('eventCode');
        if (eventCode) {
          const paramName = url.searchParams.has('planDisplaySn') ? 'planDisplaySn' : 'eventCode';
          return `${url.origin}${url.pathname}?${paramName}=${encodeURIComponent(eventCode)}`;
        }
      }

      // 기타 페이지는 쿼리 파라미터 제거
      return `${url.origin}${url.pathname}`;
    } catch {
      return pageLocation;
    }
  }

  /**
   * 페이지 방문하여 개발가이드 변수 수집 (SPA 지원 강화)
   */
  async collectDevVariables(pageUrl: string): Promise<DevVariables> {
    if (!this.browser) {
      throw new Error('브라우저가 초기화되지 않았습니다.');
    }

    const page = await this.browser.newPage();
    const devVars: DevVariables = {};

    try {
      console.log(`   🌐 방문 중: ${pageUrl}`);

      // dataLayer 이벤트 캡처 설정
      await page.addInitScript(() => {
        (window as any).__capturedDataLayer = [];
        const originalPush = Array.prototype.push;
        (window as any).dataLayer = (window as any).dataLayer || [];
        const dl = (window as any).dataLayer;

        // 기존 항목 복사
        for (const item of dl) {
          (window as any).__capturedDataLayer.push(item);
        }

        // push 오버라이드
        dl.push = function (...args: any[]) {
          for (const arg of args) {
            (window as any).__capturedDataLayer.push(arg);
          }
          return originalPush.apply(this, args);
        };
      });

      await page.goto(pageUrl, { timeout: 60000, waitUntil: 'domcontentloaded' });

      // SPA 로딩 대기 - 여러 전략 사용
      await page.waitForTimeout(3000);

      // AP_DATA 변수가 설정될 때까지 대기 (최대 10초)
      try {
        await page.waitForFunction(
          () => {
            return (window as any).AP_DATA_SITENAME !== undefined ||
                   (window as any).AP_DATA_PAGETYPE !== undefined ||
                   (window as any).dataLayer?.some((item: any) =>
                     item && (item.AP_DATA_SITENAME || item.site_name || item.event === 'page_view')
                   );
          },
          { timeout: 10000 }
        );
      } catch {
        // 타임아웃 무시 - 변수가 없을 수도 있음
      }

      // 추가 대기 (동적 로딩 완료)
      await page.waitForTimeout(2000);

      // 1. window 전역 변수 수집
      const windowVars = await page.evaluate(() => {
        const vars: Record<string, string> = {};
        const varNames = [
          'AP_DATA_SITENAME', 'AP_DATA_COUNTRY', 'AP_DATA_LANG', 'AP_DATA_ENV',
          'AP_DATA_CHANNEL', 'AP_DATA_PAGETYPE', 'AP_DATA_ISLOGIN',
          'AP_DATA_GCID', 'AP_DATA_CID', 'AP_DATA_ISSSO', 'AP_DATA_CG',
          'AP_DATA_CD', 'AP_DATA_AGE', 'AP_DATA_CT', 'AP_DATA_BEAUTYCT',
          'AP_DATA_ISEMPLOYEE', 'AP_DATA_LOGINTYPE', 'AP_DATA_ISSUBSCRIPTION',
        ];

        for (const name of varNames) {
          const value = (window as any)[name];
          if (value !== undefined && value !== null && value !== '') {
            vars[name] = String(value);
          }
        }
        return vars;
      });
      Object.assign(devVars, windowVars);

      // 2. dataLayer에서 추출 (캡처된 모든 이벤트 확인)
      const dataLayerVars = await page.evaluate(() => {
        const vars: Record<string, string> = {};
        const captured = (window as any).__capturedDataLayer || [];
        const dl = (window as any).dataLayer || [];
        const allItems = [...captured, ...dl];

        // AP_DATA_ 변수 찾기
        for (const item of allItems) {
          if (item && typeof item === 'object') {
            for (const [key, value] of Object.entries(item)) {
              if (key.startsWith('AP_DATA_') && value != null && value !== '') {
                vars[key] = String(value);
              }
            }
          }
        }

        // page_view 이벤트에서 파라미터 찾기
        for (const item of allItems) {
          if (item?.event === 'page_view' || item?.event === 'gtm.js') {
            // 매핑: dataLayer 키 → AP_DATA 키
            const mappings: Record<string, string> = {
              'site_name': 'AP_DATA_SITENAME',
              'site_country': 'AP_DATA_COUNTRY',
              'site_language': 'AP_DATA_LANG',
              'site_env': 'AP_DATA_ENV',
              'channel': 'AP_DATA_CHANNEL',
              'content_group': 'AP_DATA_PAGETYPE',
              'login_is_login': 'AP_DATA_ISLOGIN',
            };

            for (const [dlKey, apKey] of Object.entries(mappings)) {
              if (item[dlKey] && !vars[apKey]) {
                vars[apKey] = String(item[dlKey]);
              }
            }
          }
        }

        return vars;
      });

      // dataLayer 값으로 보충
      for (const [key, value] of Object.entries(dataLayerVars)) {
        if (!devVars[key]) {
          devVars[key] = value;
        }
      }

      // 3. GTM 컨테이너 내부 변수 확인 (google_tag_manager)
      const gtmVars = await page.evaluate(() => {
        const vars: Record<string, string> = {};
        const gtm = (window as any).google_tag_manager;
        if (!gtm) return vars;

        // GTM 컨테이너 ID 찾기
        for (const containerId of Object.keys(gtm)) {
          if (containerId.startsWith('GTM-')) {
            const container = gtm[containerId];
            if (container && container.dataLayer) {
              const dl = container.dataLayer;
              // get 메서드로 변수 값 조회
              const varMappings: Record<string, string> = {
                'JS - Site Name': 'AP_DATA_SITENAME',
                'JS - Site Country': 'AP_DATA_COUNTRY',
                'JS - Site Language': 'AP_DATA_LANG',
                'JS - Site Env': 'AP_DATA_ENV',
                'JS - Channel': 'AP_DATA_CHANNEL',
                'JS - Content Group': 'AP_DATA_PAGETYPE',
                'JS - Login Is Login': 'AP_DATA_ISLOGIN',
              };

              for (const [gtmVar, apKey] of Object.entries(varMappings)) {
                try {
                  const value = dl.get(gtmVar);
                  if (value && !vars[apKey]) {
                    vars[apKey] = String(value);
                  }
                } catch {
                  // 무시
                }
              }
            }
          }
        }
        return vars;
      });

      // GTM 값으로 보충
      for (const [key, value] of Object.entries(gtmVars)) {
        if (!devVars[key]) {
          devVars[key] = value;
        }
      }

      console.log(`   ✅ 수집된 변수: ${Object.keys(devVars).length}개`);

      // 변수가 없으면 추가 디버깅 정보
      if (Object.keys(devVars).length === 0) {
        const debugInfo = await page.evaluate(() => {
          return {
            hasDataLayer: Array.isArray((window as any).dataLayer),
            dataLayerLength: (window as any).dataLayer?.length || 0,
            hasGTM: !!(window as any).google_tag_manager,
            windowKeys: Object.keys(window).filter(k => k.startsWith('AP_')).slice(0, 10),
          };
        });
        console.log(`   ⚠️ 디버그 정보:`, debugInfo);
      }

    } catch (error: any) {
      console.error(`   ❌ 페이지 방문 실패: ${error.message}`);
    } finally {
      await page.close();
    }

    return devVars;
  }

  /**
   * GA4에서 실제 파라미터 값 조회
   */
  async getGA4Values(
    propertyId: string,
    pagePath: string
  ): Promise<GA4ActualValues> {
    const ga4Client = new GA4Client({
      propertyId,
      accessToken: this.accessToken,
    });
    await ga4Client.initialize();

    const values: GA4ActualValues = {};

    // page_view 이벤트의 커스텀 파라미터 값 조회
    const customDimensions = [
      'site_name', 'site_country', 'site_language', 'site_env',
      'channel', 'content_group', 'login_is_login', 'traffic_type',
    ];

    try {
      for (const dim of customDimensions) {
        const [response] = await (ga4Client as any).client.runReport({
          property: `properties/${propertyId}`,
          dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
          dimensions: [
            { name: `customEvent:${dim}` },
          ],
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
                    stringFilter: {
                      matchType: 'EXACT',
                      value: pagePath,
                    },
                  },
                },
              ],
            },
          },
          orderBys: [
            { metric: { metricName: 'eventCount' }, desc: true },
          ],
          limit: 1,
        });

        if (response.rows && response.rows.length > 0) {
          const value = response.rows[0].dimensionValues?.[0]?.value;
          if (value && value !== '(not set)') {
            values[dim] = value;
          }
        }
      }
    } catch (error: any) {
      console.error(`   ⚠️ GA4 값 조회 중 오류: ${error.message}`);
    }

    return values;
  }

  /**
   * 예측값과 실제값 비교
   */
  compareValues(
    predictions: PredictionResult[],
    devVars: DevVariables,
    ga4Values: GA4ActualValues
  ): ComparisonResult[] {
    const results: ComparisonResult[] = [];

    // 개발가이드 변수 → GA4 파라미터 매핑
    const devToGa4Map: Record<string, string> = {
      'AP_DATA_SITENAME': 'site_name',
      'AP_DATA_COUNTRY': 'site_country',
      'AP_DATA_LANG': 'site_language',
      'AP_DATA_ENV': 'site_env',
      'AP_DATA_CHANNEL': 'channel',
      'AP_DATA_PAGETYPE': 'content_group',
      'AP_DATA_ISLOGIN': 'login_is_login',
      'AP_DATA_GCID': 'login_id_gcid',
      'AP_DATA_CID': 'login_id_cid',
      'AP_DATA_ISSSO': 'login_is_sso',
      'AP_DATA_CG': 'login_gender',
      'AP_DATA_CD': 'login_birth',
      'AP_DATA_AGE': 'login_age',
      'AP_DATA_CT': 'login_level',
      'AP_DATA_BEAUTYCT': 'login_beauty_level',
      'AP_DATA_ISEMPLOYEE': 'login_is_member',
      'AP_DATA_LOGINTYPE': 'login_method',
      'AP_DATA_ISSUBSCRIPTION': 'login_is_subscription',
    };

    // GA4 파라미터 → 개발가이드 변수 역매핑
    const ga4ToDevMap: Record<string, string> = {};
    for (const [dev, ga4] of Object.entries(devToGa4Map)) {
      ga4ToDevMap[ga4] = dev;
    }

    for (const pred of predictions) {
      const key = pred.key;
      const predictedValue = pred.predictedValue;

      // 개발가이드 변수에서 실제값 찾기
      const devVarName = ga4ToDevMap[key];
      const devValue = devVarName ? devVars[devVarName] || null : null;

      // GA4 실제값
      const ga4Value = ga4Values[key] || null;

      // 매칭 판단
      let match: ComparisonResult['match'] = 'na';
      let notes = '';

      if (pred.confidence === 'skip') {
        match = 'na';
        notes = '브라우저 자동 수집 (비교 대상 아님)';
      } else if (predictedValue === null && devValue === null && ga4Value === null) {
        match = 'exact';
        notes = '모두 null (일치)';
      } else if (predictedValue === devValue && devValue === ga4Value) {
        match = 'exact';
        notes = '완전 일치';
      } else if (predictedValue === devValue || predictedValue === ga4Value) {
        match = 'partial';
        notes = `부분 일치 (예측=${predictedValue}, 개발=${devValue}, GA4=${ga4Value})`;
      } else if (devValue === ga4Value && devValue !== null) {
        match = 'mismatch';
        notes = `예측 불일치 (예측=${predictedValue}, 실제=${devValue})`;
      } else if (predictedValue?.startsWith('[') && predictedValue?.endsWith(']')) {
        // 플레이스홀더 값 (예: [SHA512 해시 128자])
        match = 'na';
        notes = '로그인 필요 - 값 형식만 확인';
      } else {
        match = 'mismatch';
        notes = `불일치 (예측=${predictedValue}, 개발=${devValue}, GA4=${ga4Value})`;
      }

      results.push({
        key,
        predictedValue,
        devValue,
        ga4Value,
        match,
        notes,
      });
    }

    return results;
  }

  /**
   * 단일 페이지 분석
   */
  async analyzePage(
    property: GA4Property,
    contentGroupPage: ContentGroupPage,
    domain: string
  ): Promise<PageAnalysisResult> {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📄 ${property.displayName} - ${contentGroupPage.contentGroup}`);
    console.log(`   URL: ${contentGroupPage.pageUrl}`);

    // 1. 개발가이드 변수 수집
    const devVariables = await this.collectDevVariables(contentGroupPage.pageUrl);

    // 2. 예측 실행
    const context: PredictionContext = {
      url: contentGroupPage.pageUrl,
      isLoggedIn: devVariables.AP_DATA_ISLOGIN === 'Y',
      visionPageType: devVariables.AP_DATA_PAGETYPE,
      htmlLang: devVariables.AP_DATA_LANG?.toLowerCase(),
    };
    const predictions = this.predictor.predictAll(context);

    // 3. GA4 실제값 조회
    const ga4Values = await this.getGA4Values(
      property.propertyId,
      contentGroupPage.pagePath
    );

    // 4. 비교
    const comparisons = this.compareValues(predictions, devVariables, ga4Values);

    // 5. 정확도 계산
    const applicable = comparisons.filter(c => c.match !== 'na');
    const matched = applicable.filter(c => c.match === 'exact' || c.match === 'partial');
    const mismatched = applicable.filter(c => c.match === 'mismatch');

    const accuracy = {
      total: applicable.length,
      matched: matched.length,
      mismatched: mismatched.length,
      percentage: applicable.length > 0 ? (matched.length / applicable.length) * 100 : 0,
    };

    console.log(`   📊 정확도: ${accuracy.matched}/${accuracy.total} (${accuracy.percentage.toFixed(1)}%)`);

    if (mismatched.length > 0) {
      console.log(`   ❌ 불일치 항목:`);
      for (const m of mismatched) {
        console.log(`      - ${m.key}: ${m.notes}`);
      }
    }

    return {
      property,
      contentGroup: contentGroupPage.contentGroup,
      pageUrl: contentGroupPage.pageUrl,
      pagePath: contentGroupPage.pagePath,
      pageViewCount: contentGroupPage.pageViewCount,
      devVariables,
      predictions,
      ga4Values,
      comparisons,
      accuracy,
    };
  }

  /**
   * Property 전체 분석
   */
  async analyzeProperty(
    property: GA4Property,
    domain: string
  ): Promise<PropertyAnalysisResult> {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`🏢 Property: ${property.displayName} (${property.propertyId})`);
    console.log(`${'═'.repeat(70)}`);

    // content_group별 대표 페이지 조회
    const contentGroups = await this.getContentGroupPages(property.propertyId, domain);

    // 각 content_group별 페이지 분석
    const pageAnalyses: PageAnalysisResult[] = [];

    for (const cg of contentGroups) {
      try {
        const analysis = await this.analyzePage(property, cg, domain);
        pageAnalyses.push(analysis);
      } catch (error: any) {
        console.error(`   ❌ ${cg.contentGroup} 분석 실패: ${error.message}`);
      }
    }

    // 전체 정확도 계산
    const totalApplicable = pageAnalyses.reduce((sum, p) => sum + p.accuracy.total, 0);
    const totalMatched = pageAnalyses.reduce((sum, p) => sum + p.accuracy.matched, 0);
    const overallAccuracy = totalApplicable > 0 ? (totalMatched / totalApplicable) * 100 : 0;

    // 개선 제안 도출
    const improvementSuggestions = this.generateImprovementSuggestions(pageAnalyses);

    return {
      property,
      contentGroups,
      pageAnalyses,
      overallAccuracy,
      improvementSuggestions,
    };
  }

  /**
   * 개선 제안 생성
   */
  private generateImprovementSuggestions(analyses: PageAnalysisResult[]): string[] {
    const suggestions: string[] = [];
    const mismatchCounts = new Map<string, number>();
    const mismatchExamples = new Map<string, string[]>();

    // 불일치 항목 집계
    for (const analysis of analyses) {
      for (const comp of analysis.comparisons) {
        if (comp.match === 'mismatch') {
          const count = mismatchCounts.get(comp.key) || 0;
          mismatchCounts.set(comp.key, count + 1);

          const examples = mismatchExamples.get(comp.key) || [];
          examples.push(`${analysis.contentGroup}: ${comp.notes}`);
          mismatchExamples.set(comp.key, examples);
        }
      }
    }

    // 빈도순 정렬하여 제안 생성
    const sorted = Array.from(mismatchCounts.entries())
      .sort((a, b) => b[1] - a[1]);

    for (const [key, count] of sorted) {
      const examples = mismatchExamples.get(key) || [];
      suggestions.push(
        `[${key}] ${count}회 불일치 - 예시: ${examples.slice(0, 2).join('; ')}`
      );
    }

    return suggestions;
  }

  /**
   * Account 전체 분석
   */
  async analyzeAccount(
    accountId: string,
    propertyDomainMap: Map<string, string>
  ): Promise<FullAnalysisResult> {
    console.log('\n' + '█'.repeat(80));
    console.log(` Account ${accountId} 전체 분석 시작`);
    console.log('█'.repeat(80));

    const properties = await this.getProperties(accountId);
    const propertyResults: PropertyAnalysisResult[] = [];

    for (const property of properties) {
      const domain = propertyDomainMap.get(property.propertyId);
      if (!domain) {
        console.log(`\n⚠️ ${property.displayName} - 도메인 매핑 없음, 건너뜀`);
        continue;
      }

      try {
        const result = await this.analyzeProperty(property, domain);
        propertyResults.push(result);
      } catch (error: any) {
        console.error(`\n❌ ${property.displayName} 분석 실패: ${error.message}`);
      }
    }

    // 전체 통계
    const totalApplicable = propertyResults.reduce(
      (sum, p) => sum + p.pageAnalyses.reduce((s, a) => s + a.accuracy.total, 0), 0
    );
    const totalMatched = propertyResults.reduce(
      (sum, p) => sum + p.pageAnalyses.reduce((s, a) => s + a.accuracy.matched, 0), 0
    );
    const aggregateAccuracy = totalApplicable > 0 ? (totalMatched / totalApplicable) * 100 : 0;

    // 공통 이슈 집계
    const issueCounter = new Map<string, { count: number; examples: string[] }>();

    for (const propResult of propertyResults) {
      for (const pageResult of propResult.pageAnalyses) {
        for (const comp of pageResult.comparisons) {
          if (comp.match === 'mismatch') {
            const issue = `${comp.key}: 예측 불일치`;
            const existing = issueCounter.get(issue) || { count: 0, examples: [] };
            existing.count++;
            if (existing.examples.length < 3) {
              existing.examples.push(`${propResult.property.displayName}/${pageResult.contentGroup}`);
            }
            issueCounter.set(issue, existing);
          }
        }
      }
    }

    const commonIssues = Array.from(issueCounter.entries())
      .map(([issue, data]) => ({ issue, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 규칙 업데이트 제안 (공통 이슈 기반)
    const ruleUpdates = this.generateRuleUpdates(propertyResults);

    const result: FullAnalysisResult = {
      accountId,
      analysisDate: new Date(),
      properties: propertyResults,
      aggregateAccuracy,
      commonIssues,
      ruleUpdates,
    };

    // 결과 저장
    await this.saveResults(result);

    return result;
  }

  /**
   * 규칙 업데이트 제안 생성
   */
  private generateRuleUpdates(
    propertyResults: PropertyAnalysisResult[]
  ): FullAnalysisResult['ruleUpdates'] {
    const updates: FullAnalysisResult['ruleUpdates'] = [];

    // 각 파라미터별 불일치 패턴 분석
    const paramPatterns = new Map<string, Array<{
      predicted: string | null;
      actual: string | null;
      context: string;
    }>>();

    for (const propResult of propertyResults) {
      for (const pageResult of propResult.pageAnalyses) {
        for (const comp of pageResult.comparisons) {
          if (comp.match === 'mismatch') {
            const patterns = paramPatterns.get(comp.key) || [];
            patterns.push({
              predicted: comp.predictedValue,
              actual: comp.devValue || comp.ga4Value,
              context: `${propResult.property.displayName}/${pageResult.contentGroup}`,
            });
            paramPatterns.set(comp.key, patterns);
          }
        }
      }
    }

    // 패턴 분석하여 규칙 업데이트 제안
    for (const [key, patterns] of paramPatterns.entries()) {
      if (patterns.length >= 2) {
        // 반복되는 패턴 찾기
        const actualValues = patterns.map(p => p.actual).filter(v => v);
        const uniqueActuals = [...new Set(actualValues)];

        if (uniqueActuals.length === 1) {
          // 모든 실제값이 동일 → 고정값으로 변경 제안
          updates.push({
            paramKey: key,
            currentRule: `예측: ${patterns[0].predicted}`,
            suggestedRule: `고정값: ${uniqueActuals[0]}`,
            evidence: patterns.slice(0, 3).map(p => p.context),
          });
        } else if (uniqueActuals.length <= 3) {
          // 소수의 값 → 조건부 규칙 제안
          updates.push({
            paramKey: key,
            currentRule: `예측: ${patterns[0].predicted}`,
            suggestedRule: `조건부: ${uniqueActuals.join(' | ')}`,
            evidence: patterns.slice(0, 3).map(p => `${p.context}: ${p.actual}`),
          });
        }
      }
    }

    return updates;
  }

  /**
   * 결과 저장
   */
  private async saveResults(result: FullAnalysisResult): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `validation_${result.accountId}_${timestamp}.json`;
    const filepath = path.join(this.outputDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
    console.log(`\n💾 결과 저장됨: ${filepath}`);

    // 요약 보고서도 생성
    const summaryPath = path.join(this.outputDir, `summary_${result.accountId}_${timestamp}.md`);
    const summary = this.generateSummaryReport(result);
    fs.writeFileSync(summaryPath, summary);
    console.log(`📄 요약 보고서: ${summaryPath}`);
  }

  /**
   * 요약 보고서 생성
   */
  private generateSummaryReport(result: FullAnalysisResult): string {
    let report = `# 예측 검증 보고서\n\n`;
    report += `- **Account ID**: ${result.accountId}\n`;
    report += `- **분석 일시**: ${result.analysisDate.toISOString()}\n`;
    report += `- **전체 정확도**: ${result.aggregateAccuracy.toFixed(1)}%\n\n`;

    report += `## Property별 결과\n\n`;
    for (const prop of result.properties) {
      report += `### ${prop.property.displayName} (${prop.property.propertyId})\n\n`;
      report += `- **정확도**: ${prop.overallAccuracy.toFixed(1)}%\n`;
      report += `- **분석된 content_group**: ${prop.contentGroups.length}개\n\n`;

      if (prop.improvementSuggestions.length > 0) {
        report += `**개선 제안**:\n`;
        for (const suggestion of prop.improvementSuggestions.slice(0, 5)) {
          report += `- ${suggestion}\n`;
        }
        report += '\n';
      }
    }

    report += `## 공통 이슈 Top 10\n\n`;
    for (const issue of result.commonIssues) {
      report += `- **${issue.issue}** (${issue.count}회)\n`;
      report += `  - 예시: ${issue.examples.join(', ')}\n`;
    }

    report += `\n## 규칙 업데이트 제안\n\n`;
    for (const update of result.ruleUpdates) {
      report += `### ${update.paramKey}\n\n`;
      report += `- **현재**: ${update.currentRule}\n`;
      report += `- **제안**: ${update.suggestedRule}\n`;
      report += `- **근거**: ${update.evidence.join(', ')}\n\n`;
    }

    return report;
  }

  /**
   * 간편 실행: 단일 페이지 빠른 테스트
   */
  async quickTest(pageUrl: string): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
    }

    console.log(`\n🔍 Quick Test: ${pageUrl}\n`);

    // 개발가이드 변수 수집
    const devVars = await this.collectDevVariables(pageUrl);
    console.log('\n[개발가이드 변수]');
    for (const [key, value] of Object.entries(devVars)) {
      console.log(`  ${key}: ${value}`);
    }

    // 예측 실행
    const context: PredictionContext = {
      url: pageUrl,
      isLoggedIn: devVars.AP_DATA_ISLOGIN === 'Y',
      visionPageType: devVars.AP_DATA_PAGETYPE,
    };
    const predictions = this.predictor.predictAll(context);

    // 주요 파라미터 비교
    console.log('\n[예측 vs 실제 비교]');
    const keyParams = [
      'site_name', 'site_country', 'site_language', 'site_env',
      'channel', 'content_group', 'login_is_login',
    ];

    const devToGa4 = {
      'site_name': 'AP_DATA_SITENAME',
      'site_country': 'AP_DATA_COUNTRY',
      'site_language': 'AP_DATA_LANG',
      'site_env': 'AP_DATA_ENV',
      'channel': 'AP_DATA_CHANNEL',
      'content_group': 'AP_DATA_PAGETYPE',
      'login_is_login': 'AP_DATA_ISLOGIN',
    };

    for (const key of keyParams) {
      const pred = predictions.find(p => p.key === key);
      const devVarName = devToGa4[key as keyof typeof devToGa4];
      const actual = devVars[devVarName];

      const match = pred?.predictedValue === actual ? '✅' : '❌';
      console.log(`  ${match} ${key}: 예측=${pred?.predictedValue || 'null'}, 실제=${actual || 'null'}`);
    }
  }
}

/**
 * 편의 함수: Access Token으로 빠른 검증
 */
export async function runQuickValidation(
  accessToken: string,
  pageUrl: string
): Promise<void> {
  const validator = new PredictionValidator(accessToken);
  await validator.initialize();

  try {
    await validator.quickTest(pageUrl);
  } finally {
    await validator.close();
  }
}
