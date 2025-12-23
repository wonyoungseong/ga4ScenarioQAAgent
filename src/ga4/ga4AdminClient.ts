/**
 * GA4 Admin API Client
 *
 * GA4 계정 및 속성 목록을 조회합니다.
 * OAuth 2.0 Access Token 또는 서비스 계정 인증을 지원합니다.
 */

import { AnalyticsAdminServiceClient } from '@google-analytics/admin';
import { GoogleAuth, OAuth2Client, JWT } from 'google-auth-library';
import { ServiceAccountAuth, ServiceAccountConfig } from './serviceAccountAuth';

export interface GA4Account {
  name: string;        // accounts/123456
  accountId: string;   // 123456
  displayName: string;
}

export interface GA4Property {
  name: string;        // properties/123456789
  propertyId: string;  // 123456789
  displayName: string;
  account: string;     // accounts/123456
  timeZone: string;
  currencyCode: string;
  industryCategory: string;
}

export type AuthType = 'oauth' | 'service_account';

export interface GA4AdminClientConfig {
  /** 인증 타입 */
  authType: AuthType;
  /** OAuth Access Token (authType: 'oauth' 일 때) */
  accessToken?: string;
  /** 서비스 계정 설정 (authType: 'service_account' 일 때) */
  serviceAccountConfig?: ServiceAccountConfig;
}

export class GA4AdminClient {
  private client: AnalyticsAdminServiceClient | null = null;
  private config: GA4AdminClientConfig;
  private serviceAccountAuth: ServiceAccountAuth | null = null;

  /**
   * @param configOrAccessToken - 설정 객체 또는 레거시 Access Token 문자열
   */
  constructor(configOrAccessToken: GA4AdminClientConfig | string) {
    // 레거시 지원: 문자열이면 OAuth access token으로 처리
    if (typeof configOrAccessToken === 'string') {
      this.config = {
        authType: 'oauth',
        accessToken: configOrAccessToken,
      };
    } else {
      this.config = configOrAccessToken;
    }
  }

  /**
   * 클라이언트 초기화
   */
  async initialize(): Promise<void> {
    if (this.config.authType === 'service_account') {
      await this.initializeWithServiceAccount();
    } else {
      await this.initializeWithOAuth();
    }
  }

  /**
   * OAuth Access Token으로 초기화
   */
  private async initializeWithOAuth(): Promise<void> {
    if (!this.config.accessToken) {
      throw new Error('OAuth 인증에는 accessToken이 필요합니다.');
    }

    const oauth2Client = new OAuth2Client();
    oauth2Client.setCredentials({
      access_token: this.config.accessToken,
    });

    this.client = new AnalyticsAdminServiceClient({
      authClient: oauth2Client,
    });
  }

  /**
   * 서비스 계정으로 초기화
   */
  private async initializeWithServiceAccount(): Promise<void> {
    if (!this.config.serviceAccountConfig) {
      this.config.serviceAccountConfig = {}; // 기본 경로 사용
    }

    this.serviceAccountAuth = new ServiceAccountAuth({
      ...this.config.serviceAccountConfig,
      scopes: [
        'https://www.googleapis.com/auth/analytics.readonly',
        'https://www.googleapis.com/auth/analytics.manage.users.readonly',
      ],
    });

    await this.serviceAccountAuth.initialize();

    // GoogleAuth를 사용하여 클라이언트 생성
    const googleAuth = this.serviceAccountAuth.createGoogleAuth();

    this.client = new AnalyticsAdminServiceClient({
      auth: googleAuth,
    });
  }

  /**
   * 계정 목록 조회
   */
  async listAccounts(): Promise<GA4Account[]> {
    if (!this.client) {
      throw new Error('클라이언트가 초기화되지 않았습니다.');
    }

    const accounts: GA4Account[] = [];

    try {
      const [response] = await this.client.listAccounts({});

      for (const account of response || []) {
        if (account.name && account.displayName) {
          accounts.push({
            name: account.name,
            accountId: account.name.replace('accounts/', ''),
            displayName: account.displayName,
          });
        }
      }
    } catch (error: any) {
      throw new Error(`계정 목록 조회 실패: ${error.message}`);
    }

    return accounts;
  }

  /**
   * 특정 계정의 속성 목록 조회
   */
  async listProperties(accountId?: string): Promise<GA4Property[]> {
    if (!this.client) {
      throw new Error('클라이언트가 초기화되지 않았습니다.');
    }

    const properties: GA4Property[] = [];

    try {
      // 특정 계정 또는 전체 계정의 속성 조회
      const filter = accountId
        ? `parent:accounts/${accountId}`
        : undefined;

      const [response] = await this.client.listProperties({
        filter,
        showDeleted: false,
      });

      for (const property of response || []) {
        if (property.name && property.displayName) {
          properties.push({
            name: property.name,
            propertyId: property.name.replace('properties/', ''),
            displayName: property.displayName,
            account: property.account || '',
            timeZone: property.timeZone || '',
            currencyCode: property.currencyCode || '',
            industryCategory: property.industryCategory?.toString() || '',
          });
        }
      }
    } catch (error: any) {
      throw new Error(`속성 목록 조회 실패: ${error.message}`);
    }

    return properties;
  }

  /**
   * 모든 계정과 속성 조회 (계층 구조)
   */
  async listAccountsWithProperties(): Promise<Map<GA4Account, GA4Property[]>> {
    const result = new Map<GA4Account, GA4Property[]>();

    const accounts = await this.listAccounts();

    for (const account of accounts) {
      const properties = await this.listProperties(account.accountId);
      result.set(account, properties);
    }

    return result;
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
  getAuthType(): AuthType {
    return this.config.authType;
  }
}
