/**
 * GA4 Service Account Authentication Module
 *
 * 서비스 계정 기반 인증을 제공합니다.
 * - 서비스 계정 JSON 키 파일 사용
 * - 도메인 전체 위임(Domain-Wide Delegation)을 통한 사용자 가장(impersonation) 지원
 */

import { GoogleAuth, JWT, Impersonated } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';

// GA4 API 스코프
export const GA4_SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/analytics.edit',
];

// GA4 Admin API 스코프
export const GA4_ADMIN_SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/analytics.manage.users.readonly',
];

export interface ServiceAccountConfig {
  /** 서비스 계정 JSON 키 파일 경로 */
  keyFilePath?: string;
  /** 서비스 계정 JSON 키 내용 (파일 대신 직접 전달) */
  credentials?: ServiceAccountCredentials;
  /** 가장할 사용자 이메일 (도메인 전체 위임 사용 시) */
  impersonateUser?: string;
  /** 사용할 스코프 */
  scopes?: string[];
}

export interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
  universe_domain?: string;
}

const DEFAULT_KEY_FILE_PATH = './credentials/service-account.json';

/**
 * 서비스 계정 인증 클래스
 */
export class ServiceAccountAuth {
  private config: ServiceAccountConfig;
  private credentials: ServiceAccountCredentials | null = null;
  private authClient: JWT | Impersonated | null = null;

  constructor(config: ServiceAccountConfig = {}) {
    this.config = {
      keyFilePath: config.keyFilePath || DEFAULT_KEY_FILE_PATH,
      scopes: config.scopes || GA4_SCOPES,
      ...config,
    };
  }

  /**
   * 서비스 계정 자격증명 로드
   */
  private loadCredentials(): ServiceAccountCredentials {
    if (this.config.credentials) {
      return this.config.credentials;
    }

    const keyFilePath = this.config.keyFilePath!;

    if (!fs.existsSync(keyFilePath)) {
      throw new Error(
        `서비스 계정 키 파일을 찾을 수 없습니다: ${keyFilePath}\n` +
        `Google Cloud Console에서 서비스 계정을 생성하고 JSON 키를 다운로드하세요.\n` +
        `https://console.cloud.google.com/iam-admin/serviceaccounts`
      );
    }

    try {
      const content = fs.readFileSync(keyFilePath, 'utf-8');
      const credentials = JSON.parse(content) as ServiceAccountCredentials;

      if (credentials.type !== 'service_account') {
        throw new Error('유효한 서비스 계정 키 파일이 아닙니다.');
      }

      return credentials;
    } catch (error: any) {
      if (error.message.includes('유효한 서비스 계정')) {
        throw error;
      }
      throw new Error(`서비스 계정 키 파일 파싱 실패: ${error.message}`);
    }
  }

  /**
   * JWT 클라이언트 생성 (서비스 계정 직접 인증)
   */
  private createJWTClient(credentials: ServiceAccountCredentials): JWT {
    return new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: this.config.scopes,
      subject: this.config.impersonateUser, // 도메인 전체 위임 시 가장할 사용자
    });
  }

  /**
   * 인증 클라이언트 초기화
   */
  async initialize(): Promise<void> {
    this.credentials = this.loadCredentials();
    this.authClient = this.createJWTClient(this.credentials);

    // 토큰 가져오기 테스트
    try {
      await this.authClient.authorize();
      console.log(`✅ 서비스 계정 인증 성공: ${this.credentials.client_email}`);
      if (this.config.impersonateUser) {
        console.log(`   가장 사용자: ${this.config.impersonateUser}`);
      }
    } catch (error: any) {
      throw new Error(
        `서비스 계정 인증 실패: ${error.message}\n` +
        `서비스 계정에 GA4 접근 권한이 있는지 확인하세요.`
      );
    }
  }

  /**
   * 인증 클라이언트 반환
   */
  getAuthClient(): JWT | Impersonated {
    if (!this.authClient) {
      throw new Error('인증 클라이언트가 초기화되지 않았습니다. initialize()를 먼저 호출하세요.');
    }
    return this.authClient;
  }

  /**
   * Access Token 반환
   */
  async getAccessToken(): Promise<string> {
    if (!this.authClient) {
      throw new Error('인증 클라이언트가 초기화되지 않았습니다.');
    }

    const token = await this.authClient.getAccessToken();
    if (!token.token) {
      throw new Error('Access Token을 가져올 수 없습니다.');
    }
    return token.token;
  }

  /**
   * 서비스 계정 이메일 반환
   */
  getServiceAccountEmail(): string {
    if (!this.credentials) {
      throw new Error('자격증명이 로드되지 않았습니다.');
    }
    return this.credentials.client_email;
  }

  /**
   * 프로젝트 ID 반환
   */
  getProjectId(): string {
    if (!this.credentials) {
      throw new Error('자격증명이 로드되지 않았습니다.');
    }
    return this.credentials.project_id;
  }

  /**
   * GoogleAuth 객체 생성 (일부 라이브러리에서 필요)
   */
  createGoogleAuth(): GoogleAuth {
    if (!this.credentials) {
      this.credentials = this.loadCredentials();
    }

    return new GoogleAuth({
      credentials: this.credentials,
      scopes: this.config.scopes,
      clientOptions: this.config.impersonateUser
        ? { subject: this.config.impersonateUser }
        : undefined,
    });
  }
}

/**
 * 서비스 계정 키 파일 존재 여부 확인
 */
export function hasServiceAccountKey(keyFilePath?: string): boolean {
  const filePath = keyFilePath || DEFAULT_KEY_FILE_PATH;
  return fs.existsSync(filePath);
}

/**
 * 서비스 계정 설정 가이드 출력
 */
export function printServiceAccountSetupGuide(): void {
  console.log(`
═══════════════════════════════════════════════════════════════════════════════
 서비스 계정 설정 가이드
═══════════════════════════════════════════════════════════════════════════════

1. Google Cloud Console 접속
   https://console.cloud.google.com/iam-admin/serviceaccounts

2. 서비스 계정 생성
   - "서비스 계정 만들기" 클릭
   - 이름: ga4-scenario-agent (또는 원하는 이름)
   - 설명: GA4 QA 자동화 에이전트

3. JSON 키 생성
   - 생성된 서비스 계정 클릭
   - "키" 탭 → "키 추가" → "새 키 만들기"
   - JSON 형식 선택 → 다운로드

4. 키 파일 저장
   - 다운로드한 JSON 파일을 아래 경로에 저장:
   - ${DEFAULT_KEY_FILE_PATH}

5. GA4 속성에 서비스 계정 권한 부여
   - GA4 Admin → 속성 설정 → 속성 액세스 관리
   - 서비스 계정 이메일 추가 (예: ga4-scenario-agent@project.iam.gserviceaccount.com)
   - 역할: "뷰어" 또는 "분석가"

6. (선택) 도메인 전체 위임 설정 (Google Workspace 사용 시)
   - Google Cloud Console → API 및 서비스 → 사용자 인증 정보
   - 서비스 계정 → 도메인 전체 위임 활성화
   - Google Workspace Admin → 보안 → API 제어 → 도메인 전체 위임 관리
   - 클라이언트 ID와 스코프 추가

═══════════════════════════════════════════════════════════════════════════════
`);
}
