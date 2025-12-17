/**
 * GA4 Admin API Client
 *
 * GA4 계정 및 속성 목록을 조회합니다.
 */

import { AnalyticsAdminServiceClient } from '@google-analytics/admin';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';

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

export class GA4AdminClient {
  private client: AnalyticsAdminServiceClient | null = null;
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  /**
   * 클라이언트 초기화
   */
  async initialize(): Promise<void> {
    // OAuth2Client를 사용하여 Access Token 인증
    const oauth2Client = new OAuth2Client();
    oauth2Client.setCredentials({
      access_token: this.accessToken,
    });

    this.client = new AnalyticsAdminServiceClient({
      authClient: oauth2Client,
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
}
