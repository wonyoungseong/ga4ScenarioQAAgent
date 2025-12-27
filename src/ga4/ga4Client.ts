/**
 * GA4 Data API Client
 *
 * Google Analytics 4에서 실제 수집된 이벤트와 파라미터를 조회합니다.
 * OAuth 2.0 또는 서비스 계정 인증을 지원합니다.
 */

import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { OAuth2Client, Credentials, GoogleAuth } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as url from 'url';
import { ServiceAccountAuth, ServiceAccountConfig, GA4_SCOPES } from './serviceAccountAuth';

export interface GA4Event {
  eventName: string;
  eventCount: number;
  totalUsers: number;
}

export interface GA4EventParameter {
  eventName: string;
  parameterName: string;
  parameterCount: number;
}

export interface GA4PageEvent {
  pagePath: string;
  eventName: string;
  eventCount: number;
}

/**
 * 페이지별 이벤트 비중 분석 결과
 */
export interface GA4PageEventWithProportion extends GA4PageEvent {
  proportion: number;        // 전체 대비 비중 (0~1)
  percentString: string;     // 비중 문자열 (예: "12.34%")
  isNoise: boolean;          // 노이즈 여부 (0.01% 미만)
  isLowSignificance: boolean; // 낮은 유의성 (0.1% 미만)
}

/**
 * 페이지 이벤트 분석 결과
 */
export interface GA4PageEventAnalysis {
  pagePath: string;
  totalEventCount: number;
  events: GA4PageEventWithProportion[];
  significantEvents: string[];   // 유의미한 이벤트 목록
  noiseEvents: string[];         // 노이즈 이벤트 목록
}

export interface GA4QueryOptions {
  startDate?: string;  // YYYY-MM-DD 또는 'yesterday', '7daysAgo', '30daysAgo'
  endDate?: string;    // YYYY-MM-DD 또는 'today', 'yesterday'
  limit?: number;
}

export interface GA4OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
}

export type GA4AuthType = 'oauth' | 'service_account';

export interface GA4ClientConfig {
  propertyId: string;
  /** 인증 타입 (기본값: 'oauth') */
  authType?: GA4AuthType;
  /** 직접 Access Token 전달 (OAuth) */
  accessToken?: string;
  /** Refresh Token (OAuth) */
  refreshToken?: string;
  /** OAuth 설정 */
  oauthConfig?: GA4OAuthConfig;
  /** 토큰 저장 경로 (OAuth) */
  tokenPath?: string;
  /** 서비스 계정 설정 (authType: 'service_account' 일 때) */
  serviceAccountConfig?: ServiceAccountConfig;
}

const SCOPES = ['https://www.googleapis.com/auth/analytics.readonly'];
const DEFAULT_TOKEN_PATH = './credentials/ga4_tokens.json';

export class GA4Client {
  private client: BetaAnalyticsDataClient | null = null;
  private oauth2Client: OAuth2Client | null = null;
  private serviceAccountAuth: ServiceAccountAuth | null = null;
  private propertyId: string;
  private tokenPath: string;
  private authType: GA4AuthType;

  constructor(private config: GA4ClientConfig) {
    this.propertyId = config.propertyId;
    this.tokenPath = config.tokenPath || DEFAULT_TOKEN_PATH;
    this.authType = config.authType || 'oauth';
  }

  /**
   * OAuth2 클라이언트 초기화
   */
  private async initOAuth2Client(): Promise<void> {
    if (!this.config.oauthConfig) {
      throw new Error('OAuth 설정이 필요합니다. oauthConfig를 제공하거나 accessToken을 직접 전달하세요.');
    }

    const { clientId, clientSecret, redirectUri } = this.config.oauthConfig;
    this.oauth2Client = new OAuth2Client(
      clientId,
      clientSecret,
      redirectUri || 'http://localhost:3000/oauth2callback'
    );
  }

  /**
   * 저장된 토큰 로드
   */
  private loadSavedTokens(): Credentials | null {
    try {
      if (fs.existsSync(this.tokenPath)) {
        const tokens = JSON.parse(fs.readFileSync(this.tokenPath, 'utf-8'));
        return tokens;
      }
    } catch (error) {
      console.error('저장된 토큰 로드 실패:', error);
    }
    return null;
  }

  /**
   * 토큰 저장
   */
  private saveTokens(tokens: Credentials): void {
    const dir = path.dirname(this.tokenPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.tokenPath, JSON.stringify(tokens, null, 2));
    console.log(`✅ 토큰 저장됨: ${this.tokenPath}`);
  }

  /**
   * 브라우저에서 OAuth 인증 URL 생성
   */
  getAuthUrl(): string {
    if (!this.oauth2Client) {
      throw new Error('OAuth2 클라이언트가 초기화되지 않았습니다.');
    }

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent', // 항상 refresh token을 받기 위해
    });
  }

  /**
   * Authorization code로 토큰 교환
   */
  async exchangeCodeForTokens(code: string): Promise<Credentials> {
    if (!this.oauth2Client) {
      throw new Error('OAuth2 클라이언트가 초기화되지 않았습니다.');
    }

    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    this.saveTokens(tokens);
    return tokens;
  }

  /**
   * 로컬 서버를 통한 OAuth 인증 플로우
   */
  async authenticateWithBrowser(): Promise<Credentials> {
    await this.initOAuth2Client();

    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        try {
          const queryParams = new url.URL(req.url!, `http://localhost:3000`).searchParams;
          const code = queryParams.get('code');

          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>인증 완료!</h1><p>이 창을 닫아도 됩니다.</p><script>window.close();</script>');

            const tokens = await this.exchangeCodeForTokens(code);
            server.close();
            resolve(tokens);
          } else {
            res.writeHead(400);
            res.end('Authorization code가 없습니다.');
          }
        } catch (error) {
          res.writeHead(500);
          res.end('오류가 발생했습니다.');
          server.close();
          reject(error);
        }
      });

      server.listen(3000, () => {
        const authUrl = this.getAuthUrl();
        console.log('\n🔐 브라우저에서 다음 URL을 열어 인증하세요:\n');
        console.log(authUrl);
        console.log('\n(또는 자동으로 열리면 로그인 후 권한을 승인하세요)\n');

        // 브라우저 자동 열기 시도
        const { exec } = require('child_process');
        const startCmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
        exec(`${startCmd} "${authUrl}"`);
      });
    });
  }

  /**
   * GA4 클라이언트 초기화 (인증 포함)
   */
  async initialize(): Promise<void> {
    // 서비스 계정 인증
    if (this.authType === 'service_account') {
      await this.initializeWithServiceAccount();
      return;
    }

    // OAuth 인증
    await this.initializeWithOAuth();
  }

  /**
   * 서비스 계정으로 초기화
   */
  private async initializeWithServiceAccount(): Promise<void> {
    this.serviceAccountAuth = new ServiceAccountAuth({
      ...this.config.serviceAccountConfig,
      scopes: GA4_SCOPES,
    });

    await this.serviceAccountAuth.initialize();

    // GoogleAuth를 사용하여 클라이언트 생성
    const googleAuth = this.serviceAccountAuth.createGoogleAuth();

    this.client = new BetaAnalyticsDataClient({
      auth: googleAuth,
    });
  }

  /**
   * OAuth로 초기화
   */
  private async initializeWithOAuth(): Promise<void> {
    // 1. 직접 Access Token이 제공된 경우
    if (this.config.accessToken) {
      const oauth2Client = new OAuth2Client();
      oauth2Client.setCredentials({
        access_token: this.config.accessToken,
      });

      this.client = new BetaAnalyticsDataClient({
        authClient: oauth2Client,
      });
      return;
    }

    // 2. 저장된 토큰이 있는 경우
    const savedTokens = this.loadSavedTokens();
    if (savedTokens && savedTokens.access_token) {
      const oauth2Client = new OAuth2Client();
      oauth2Client.setCredentials({
        access_token: savedTokens.access_token,
      });

      this.client = new BetaAnalyticsDataClient({
        authClient: oauth2Client,
      });
      return;
    }

    // 3. 새로운 인증 필요
    if (this.config.oauthConfig) {
      await this.authenticateWithBrowser();
      this.client = new BetaAnalyticsDataClient({
        authClient: this.oauth2Client!,
      });
      return;
    }

    throw new Error('인증 방법이 제공되지 않았습니다. accessToken 또는 oauthConfig를 설정하세요.');
  }

  /**
   * 서비스 계정 이메일 반환 (서비스 계정 인증 시)
   */
  getServiceAccountEmail(): string | null {
    return this.serviceAccountAuth?.getServiceAccountEmail() || null;
  }

  /**
   * 현재 인증 타입 반환
   */
  getAuthType(): GA4AuthType {
    return this.authType;
  }

  /**
   * 클라이언트 초기화 확인
   */
  private ensureInitialized(): void {
    if (!this.client) {
      throw new Error('GA4 클라이언트가 초기화되지 않았습니다. initialize()를 먼저 호출하세요.');
    }
  }

  /**
   * 수집된 이벤트 목록 조회
   */
  async getEvents(options: GA4QueryOptions = {}): Promise<GA4Event[]> {
    this.ensureInitialized();
    const { startDate = '30daysAgo', endDate = 'today', limit = 100 } = options;

    const [response] = await this.client!.runReport({
      property: `properties/${this.propertyId}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'eventName' }],
      metrics: [
        { name: 'eventCount' },
        { name: 'totalUsers' },
      ],
      limit,
      orderBys: [
        { metric: { metricName: 'eventCount' }, desc: true },
      ],
    });

    const events: GA4Event[] = [];
    if (response.rows) {
      for (const row of response.rows) {
        events.push({
          eventName: row.dimensionValues?.[0]?.value || '',
          eventCount: parseInt(row.metricValues?.[0]?.value || '0', 10),
          totalUsers: parseInt(row.metricValues?.[1]?.value || '0', 10),
        });
      }
    }

    return events;
  }

  /**
   * 특정 이벤트의 파라미터 목록 조회
   */
  async getEventParameters(eventName: string, options: GA4QueryOptions = {}): Promise<GA4EventParameter[]> {
    this.ensureInitialized();
    const { startDate = '30daysAgo', endDate = 'today', limit = 100 } = options;

    // 커스텀 이벤트 파라미터들 조회
    const [response] = await this.client!.runReport({
      property: `properties/${this.propertyId}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [
        { name: 'eventName' },
        { name: 'customEvent:parameter_name' },
      ],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          stringFilter: { value: eventName },
        },
      },
      limit,
    });

    const parameters: GA4EventParameter[] = [];
    if (response.rows) {
      for (const row of response.rows) {
        const paramName = row.dimensionValues?.[1]?.value;
        if (paramName && paramName !== '(not set)') {
          parameters.push({
            eventName: row.dimensionValues?.[0]?.value || '',
            parameterName: paramName,
            parameterCount: parseInt(row.metricValues?.[0]?.value || '0', 10),
          });
        }
      }
    }

    return parameters;
  }

  /**
   * 페이지별 이벤트 수집 현황 조회
   */
  async getEventsByPage(pagePath?: string, options: GA4QueryOptions = {}): Promise<GA4PageEvent[]> {
    this.ensureInitialized();
    const { startDate = '7daysAgo', endDate = 'today', limit = 500 } = options;

    const request: any = {
      property: `properties/${this.propertyId}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [
        { name: 'pagePath' },
        { name: 'eventName' },
      ],
      metrics: [{ name: 'eventCount' }],
      limit,
      orderBys: [
        { dimension: { dimensionName: 'pagePath' } },
        { metric: { metricName: 'eventCount' }, desc: true },
      ],
    };

    if (pagePath) {
      request.dimensionFilter = {
        filter: {
          fieldName: 'pagePath',
          stringFilter: {
            matchType: 'CONTAINS',
            value: pagePath
          },
        },
      };
    }

    const [response] = await this.client!.runReport(request);

    const pageEvents: GA4PageEvent[] = [];
    if (response.rows) {
      for (const row of response.rows) {
        pageEvents.push({
          pagePath: row.dimensionValues?.[0]?.value || '',
          eventName: row.dimensionValues?.[1]?.value || '',
          eventCount: parseInt(row.metricValues?.[0]?.value || '0', 10),
        });
      }
    }

    return pageEvents;
  }

  /**
   * E-commerce 이벤트 조회
   */
  async getEcommerceEvents(options: GA4QueryOptions = {}): Promise<GA4Event[]> {
    this.ensureInitialized();
    const ecommerceEvents = [
      'view_item',
      'view_item_list',
      'select_item',
      'add_to_cart',
      'remove_from_cart',
      'view_cart',
      'begin_checkout',
      'add_shipping_info',
      'add_payment_info',
      'purchase',
      'refund',
      'view_promotion',
      'select_promotion',
    ];

    const { startDate = '30daysAgo', endDate = 'today' } = options;

    const [response] = await this.client!.runReport({
      property: `properties/${this.propertyId}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'eventName' }],
      metrics: [
        { name: 'eventCount' },
        { name: 'totalUsers' },
      ],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          inListFilter: { values: ecommerceEvents },
        },
      },
      orderBys: [
        { metric: { metricName: 'eventCount' }, desc: true },
      ],
    });

    const events: GA4Event[] = [];
    if (response.rows) {
      for (const row of response.rows) {
        events.push({
          eventName: row.dimensionValues?.[0]?.value || '',
          eventCount: parseInt(row.metricValues?.[0]?.value || '0', 10),
          totalUsers: parseInt(row.metricValues?.[1]?.value || '0', 10),
        });
      }
    }

    return events;
  }

  /**
   * 커스텀 이벤트 목록 조회
   */
  async getCustomEvents(options: GA4QueryOptions = {}): Promise<GA4Event[]> {
    const autoCollectedEvents = [
      'first_visit',
      'session_start',
      'page_view',
      'scroll',
      'click',
      'view_search_results',
      'file_download',
      'video_start',
      'video_progress',
      'video_complete',
      'user_engagement',
    ];

    const allEvents = await this.getEvents(options);

    return allEvents.filter(e => !autoCollectedEvents.includes(e.eventName));
  }

  /**
   * 실시간 이벤트 조회
   */
  async getRealtimeEvents(): Promise<GA4Event[]> {
    this.ensureInitialized();

    const [response] = await this.client!.runRealtimeReport({
      property: `properties/${this.propertyId}`,
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
    });

    const events: GA4Event[] = [];
    if (response.rows) {
      for (const row of response.rows) {
        events.push({
          eventName: row.dimensionValues?.[0]?.value || '',
          eventCount: parseInt(row.metricValues?.[0]?.value || '0', 10),
          totalUsers: 0,
        });
      }
    }

    return events;
  }

  /**
   * 연결 테스트
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.initialize();

      const [response] = await this.client!.runReport({
        property: `properties/${this.propertyId}`,
        dateRanges: [{ startDate: 'yesterday', endDate: 'today' }],
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }],
        limit: 1,
      });

      console.log('✅ GA4 연결 성공!');
      console.log(`   Property ID: ${this.propertyId}`);
      return true;
    } catch (error: any) {
      console.error('❌ GA4 연결 실패:', error.message);
      return false;
    }
  }

  /**
   * 페이지별 이벤트 비중 분석 (노이즈 판단 포함)
   *
   * @param pagePath 페이지 경로 (예: '/kr/ko/display/event_detail')
   * @param options 쿼리 옵션
   * @returns 이벤트 비중 분석 결과
   */
  async analyzePageEvents(pagePath: string, options: GA4QueryOptions = {}): Promise<GA4PageEventAnalysis> {
    const pageEvents = await this.getEventsByPage(pagePath, {
      ...options,
      limit: options.limit || 200,
    });

    // 총 이벤트 수 계산
    let totalEventCount = 0;
    const eventCounts = new Map<string, number>();

    for (const e of pageEvents) {
      totalEventCount += e.eventCount;
      const current = eventCounts.get(e.eventName) || 0;
      eventCounts.set(e.eventName, current + e.eventCount);
    }

    // 비중 계산 및 노이즈 판단
    const eventsWithProportion: GA4PageEventWithProportion[] = [];
    const significantEvents: string[] = [];
    const noiseEvents: string[] = [];
    const processedEvents = new Set<string>();

    for (const [eventName, count] of eventCounts.entries()) {
      if (processedEvents.has(eventName)) continue;
      processedEvents.add(eventName);

      const proportion = totalEventCount > 0 ? count / totalEventCount : 0;
      const percentValue = proportion * 100;
      const isNoise = percentValue < 0.01;           // 0.01% 미만 = 노이즈
      const isLowSignificance = percentValue < 0.1;  // 0.1% 미만 = 낮은 유의성

      eventsWithProportion.push({
        pagePath,
        eventName,
        eventCount: count,
        proportion,
        percentString: `${percentValue.toFixed(4)}%`,
        isNoise,
        isLowSignificance,
      });

      if (isNoise) {
        noiseEvents.push(eventName);
      } else {
        significantEvents.push(eventName);
      }
    }

    // 비중 순으로 정렬
    eventsWithProportion.sort((a, b) => b.proportion - a.proportion);

    return {
      pagePath,
      totalEventCount,
      events: eventsWithProportion,
      significantEvents,
      noiseEvents,
    };
  }

  /**
   * 이벤트가 노이즈인지 확인
   *
   * @param pagePath 페이지 경로
   * @param eventName 이벤트 이름
   * @param options 쿼리 옵션
   * @returns 노이즈 여부 및 상세 정보
   */
  async isEventNoise(
    pagePath: string,
    eventName: string,
    options: GA4QueryOptions = {}
  ): Promise<{ isNoise: boolean; proportion: number; eventCount: number; totalCount: number; reason: string }> {
    const analysis = await this.analyzePageEvents(pagePath, options);
    const event = analysis.events.find(e => e.eventName === eventName);

    if (!event) {
      return {
        isNoise: true,
        proportion: 0,
        eventCount: 0,
        totalCount: analysis.totalEventCount,
        reason: '해당 페이지에서 이벤트가 수집되지 않음',
      };
    }

    let reason = '';
    if (event.isNoise) {
      reason = `비중 ${event.percentString} (0.01% 미만) - 오류/테스트 트래픽 가능성`;
    } else if (event.isLowSignificance) {
      reason = `비중 ${event.percentString} (0.1% 미만) - 낮은 유의성`;
    } else {
      reason = `비중 ${event.percentString} - 유의미한 수집`;
    }

    return {
      isNoise: event.isNoise,
      proportion: event.proportion,
      eventCount: event.eventCount,
      totalCount: analysis.totalEventCount,
      reason,
    };
  }

  /**
   * 시나리오 에이전트 예측과 실제 GA4 데이터 비교
   *
   * @param pagePath 페이지 경로
   * @param predictedEvents 에이전트가 예측한 이벤트 목록
   * @param options 쿼리 옵션
   */
  async compareWithPredictions(
    pagePath: string,
    predictedEvents: string[],
    options: GA4QueryOptions = {}
  ): Promise<{
    correctPredictions: string[];      // 정확히 예측한 이벤트
    missedEvents: string[];            // 예측 못한 유의미 이벤트 (에이전트 개선 필요)
    missedAutoEvents: string[];        // 예측 못한 GA4 자동 수집 이벤트 (정상)
    missedNoiseEvents: string[];       // 예측 못한 노이즈 이벤트 (정상)
    falsePredictions: string[];        // 잘못 예측한 이벤트 (수집 안됨)
    analysis: GA4PageEventAnalysis;
  }> {
    // GA4 자동 수집 이벤트 - 에이전트가 예측할 필요 없음
    const autoCollectedEvents = new Set([
      'first_visit',
      'session_start',
      'page_view',
      'scroll',
      'click',
      'view_search_results',
      'file_download',
      'video_start',
      'video_progress',
      'video_complete',
      'user_engagement',
      'screen_view',
    ]);

    const analysis = await this.analyzePageEvents(pagePath, options);
    const actualSignificant = new Set(analysis.significantEvents);
    const actualNoise = new Set(analysis.noiseEvents);
    const predicted = new Set(predictedEvents);

    const correctPredictions: string[] = [];
    const missedEvents: string[] = [];
    const missedAutoEvents: string[] = [];
    const missedNoiseEvents: string[] = [];
    const falsePredictions: string[] = [];

    // 예측한 이벤트 검증
    for (const event of predictedEvents) {
      if (actualSignificant.has(event)) {
        correctPredictions.push(event);
      } else if (actualNoise.has(event)) {
        // 노이즈를 예측한 경우 - 틀린 건 아니지만 노이즈임
        correctPredictions.push(event);
      } else {
        falsePredictions.push(event);
      }
    }

    // 실제 수집되었지만 예측 못한 이벤트
    for (const event of analysis.significantEvents) {
      if (!predicted.has(event)) {
        if (autoCollectedEvents.has(event)) {
          // GA4 자동 수집 이벤트는 별도 분류 (미예측이 정상)
          missedAutoEvents.push(event);
        } else {
          // 에이전트가 예측했어야 하는 이벤트
          missedEvents.push(event);
        }
      }
    }

    // 노이즈지만 언급할 가치 있는 것들
    for (const event of analysis.noiseEvents) {
      if (!predicted.has(event)) {
        missedNoiseEvents.push(event);
      }
    }

    return {
      correctPredictions,
      missedEvents,
      missedAutoEvents,
      missedNoiseEvents,
      falsePredictions,
      analysis,
    };
  }

  /**
   * 이벤트별 페이지-ContentGroup 분석
   *
   * 특정 이벤트가 어떤 content_group에서 주로 발생하는지 분석합니다.
   * 대표 페이지 선정에 사용됩니다.
   */
  async getEventPagesByContentGroup(
    eventName: string,
    options: GA4QueryOptions = {}
  ): Promise<{
    contentGroup: string;
    pagePath: string;
    eventCount: number;
    proportion: number;
  }[]> {
    this.ensureInitialized();
    const { startDate = '7daysAgo', endDate = 'today', limit = 500 } = options;

    // content_group과 pagePath를 같이 조회
    const [response] = await this.client!.runReport({
      property: `properties/${this.propertyId}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [
        { name: 'pagePath' },
        { name: 'customEvent:content_group' },
      ],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          stringFilter: { value: eventName },
        },
      },
      limit,
      orderBys: [
        { metric: { metricName: 'eventCount' }, desc: true },
      ],
    });

    const results: Array<{
      contentGroup: string;
      pagePath: string;
      eventCount: number;
      proportion: number;
    }> = [];

    let totalCount = 0;

    if (response.rows) {
      // 먼저 총 카운트 계산
      for (const row of response.rows) {
        totalCount += parseInt(row.metricValues?.[0]?.value || '0', 10);
      }

      // 결과 생성
      for (const row of response.rows) {
        const pagePath = row.dimensionValues?.[0]?.value || '';
        const contentGroup = row.dimensionValues?.[1]?.value || 'OTHERS';
        const eventCount = parseInt(row.metricValues?.[0]?.value || '0', 10);

        results.push({
          pagePath,
          contentGroup: contentGroup === '(not set)' ? 'OTHERS' : contentGroup,
          eventCount,
          proportion: totalCount > 0 ? eventCount / totalCount : 0,
        });
      }
    }

    return results;
  }

  /**
   * URL별 파라미터 값 변동성 분석
   *
   * 동일 URL(pagePath)에서 파라미터 값이 일관되는지 확인합니다.
   */
  async analyzeParameterByUrl(
    eventName: string,
    parameterName: string,
    options: GA4QueryOptions = {}
  ): Promise<{
    pagePath: string;
    uniqueValues: number;
    totalEvents: number;
    topValues: Array<{ value: string; count: number; percentage: number }>;
    urlConsistency: 'URL_FIXED' | 'URL_LOW_VAR' | 'URL_VARIABLE';
  }[]> {
    this.ensureInitialized();
    const { startDate = '7daysAgo', endDate = 'today', limit = 1000 } = options;

    const dimensionName = parameterName.startsWith('customEvent:')
      ? parameterName
      : `customEvent:${parameterName}`;

    const [response] = await this.client!.runReport({
      property: `properties/${this.propertyId}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [
        { name: 'pagePath' },
        { name: dimensionName },
      ],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          stringFilter: { value: eventName, matchType: 'EXACT' },
        },
      },
      limit,
      orderBys: [
        { metric: { metricName: 'eventCount' }, desc: true },
      ],
    });

    if (!response.rows) {
      return [];
    }

    // pagePath별로 그룹화
    const byPath = new Map<string, Map<string, number>>();
    for (const row of response.rows) {
      const pagePath = row.dimensionValues?.[0]?.value || '';
      const paramValue = row.dimensionValues?.[1]?.value || '';
      const count = parseInt(row.metricValues?.[0]?.value || '0');

      if (paramValue === '(not set)') continue;

      if (!byPath.has(pagePath)) {
        byPath.set(pagePath, new Map());
      }
      const existing = byPath.get(pagePath)!.get(paramValue) || 0;
      byPath.get(pagePath)!.set(paramValue, existing + count);
    }

    // 결과 생성
    const results: Array<{
      pagePath: string;
      uniqueValues: number;
      totalEvents: number;
      topValues: Array<{ value: string; count: number; percentage: number }>;
      urlConsistency: 'URL_FIXED' | 'URL_LOW_VAR' | 'URL_VARIABLE';
    }> = [];

    for (const [pagePath, values] of byPath.entries()) {
      const totalEvents = [...values.values()].reduce((s, c) => s + c, 0);
      const uniqueValues = values.size;

      const sortedValues = [...values.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({
          value: value.length > 40 ? value.substring(0, 37) + '...' : value,
          count,
          percentage: (count / totalEvents) * 100,
        }));

      let urlConsistency: 'URL_FIXED' | 'URL_LOW_VAR' | 'URL_VARIABLE';
      if (uniqueValues === 1) {
        urlConsistency = 'URL_FIXED';
      } else if (sortedValues[0]?.percentage >= 90) {
        urlConsistency = 'URL_LOW_VAR';
      } else {
        urlConsistency = 'URL_VARIABLE';
      }

      results.push({
        pagePath,
        uniqueValues,
        totalEvents,
        topValues: sortedValues.slice(0, 5),
        urlConsistency,
      });
    }

    // 이벤트 수 기준 정렬
    results.sort((a, b) => b.totalEvents - a.totalEvents);

    return results;
  }

  /**
   * 이벤트별 파라미터 값 조회
   *
   * 특정 이벤트의 특정 파라미터가 어떤 값으로 수집되었는지 조회합니다.
   */
  async getEventParameterValues(
    eventName: string,
    parameterName: string,
    options: GA4QueryOptions & { contentGroup?: string } = {}
  ): Promise<{
    value: string;
    eventCount: number;
    proportion: number;
  }[]> {
    this.ensureInitialized();
    const { startDate = '7daysAgo', endDate = 'today', limit = 100, contentGroup } = options;

    // customEvent: prefix로 파라미터 조회
    const dimensionName = parameterName.startsWith('customEvent:')
      ? parameterName
      : `customEvent:${parameterName}`;

    // 필터 구성 - eventName 필터 + content_group 필터 (있는 경우)
    let dimensionFilter: any;
    if (contentGroup) {
      // content_group 필터 추가
      dimensionFilter = {
        andGroup: {
          expressions: [
            {
              filter: {
                fieldName: 'eventName',
                stringFilter: { value: eventName },
              },
            },
            {
              filter: {
                fieldName: 'customEvent:content_group',
                stringFilter: {
                  matchType: 'EXACT',
                  value: contentGroup,
                },
              },
            },
          ],
        },
      };
    } else {
      dimensionFilter = {
        filter: {
          fieldName: 'eventName',
          stringFilter: { value: eventName },
        },
      };
    }

    try {
      const [response] = await this.client!.runReport({
        property: `properties/${this.propertyId}`,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: dimensionName }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter,
        limit,
        orderBys: [
          { metric: { metricName: 'eventCount' }, desc: true },
        ],
      });

      const results: Array<{
        value: string;
        eventCount: number;
        proportion: number;
      }> = [];

      let totalCount = 0;

      if (response.rows) {
        for (const row of response.rows) {
          totalCount += parseInt(row.metricValues?.[0]?.value || '0', 10);
        }

        for (const row of response.rows) {
          const value = row.dimensionValues?.[0]?.value || '';
          const eventCount = parseInt(row.metricValues?.[0]?.value || '0', 10);

          if (value && value !== '(not set)') {
            results.push({
              value,
              eventCount,
              proportion: totalCount > 0 ? eventCount / totalCount : 0,
            });
          }
        }
      }

      return results;
    } catch (error: any) {
      // 파라미터가 Custom Dimension으로 등록되지 않은 경우
      console.warn(`파라미터 조회 실패 (${parameterName}): ${error.message}`);
      return [];
    }
  }
}

/**
 * 환경변수에서 GA4 클라이언트 생성
 */
export function createGA4ClientFromEnv(): GA4Client | null {
  const propertyId = process.env.GA4_PROPERTY_ID;
  const clientId = process.env.GA4_CLIENT_ID;
  const clientSecret = process.env.GA4_CLIENT_SECRET;

  if (!propertyId) {
    console.error('❌ GA4_PROPERTY_ID 환경변수가 설정되지 않았습니다.');
    return null;
  }

  const config: GA4ClientConfig = { propertyId };

  if (clientId && clientSecret) {
    config.oauthConfig = {
      clientId,
      clientSecret,
    };
  }

  return new GA4Client(config);
}
