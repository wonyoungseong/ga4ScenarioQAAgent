/**
 * 페이지 로딩 검증 타입 정의
 *
 * URL 패턴 기반으로 페이지가 제대로 로딩되었는지 검증하는 시스템의 타입 정의
 */

/**
 * 페이지 로딩 상태
 */
export type PageLoadingStatus =
  | 'VALID' // 정상 로딩 - 모든 필수 컴포넌트 확인됨
  | 'PARTIAL' // 부분 로딩 - 일부 컴포넌트 누락
  | 'ERROR_PAGE' // 에러 페이지 (404, 500 등)
  | 'WRONG_TYPE' // 페이지 타입 불일치
  | 'EMPTY' // 빈 페이지
  | 'LOGIN_REQUIRED' // 로그인 필요
  | 'TIMEOUT' // 로딩 타임아웃
  | 'NETWORK_ERROR'; // 네트워크 오류

/**
 * 컴포넌트 검증 결과
 */
export interface ComponentCheck {
  /** 컴포넌트 이름 (예: '상품 이미지', '가격') */
  name: string;
  /** 발견 여부 */
  found: boolean;
  /** DOM에서 찾은 경우 사용된 CSS Selector */
  matchedSelector?: string;
  /** Vision AI에서 감지한 경우 true */
  visionDetected?: boolean;
  /** 감지 신뢰도 */
  confidence?: 'high' | 'medium' | 'low';
  /** 화면 위치 설명 */
  location?: string;
  /** 추가 정보 */
  details?: string;
}

/**
 * 페이지 검증 결과
 */
export interface PageValidationResult {
  /** 검증 상태 */
  status: PageLoadingStatus;
  /** 검증한 URL */
  url: string;
  /** URL 패턴에서 예상한 페이지 타입 */
  expectedPageType: string;
  /** 실제 감지된 페이지 타입 (있는 경우) */
  actualPageType?: string;
  /** HTTP 응답 상태 코드 */
  httpStatus: number;
  /** 필수 컴포넌트 검증 결과 */
  requiredComponents: ComponentCheck[];
  /** 선택 컴포넌트 검증 결과 */
  optionalComponents?: ComponentCheck[];
  /** 누락된 필수 컴포넌트 이름 목록 */
  missingComponents: string[];
  /** 전체 신뢰도 (0-100) */
  confidence: number;
  /** 경고 메시지 목록 */
  warnings: string[];
  /** 에러 타입 (에러인 경우) */
  errorType?: 'HTTP_ERROR' | 'TIMEOUT' | 'NETWORK' | 'EMPTY' | 'BLOCKED' | 'KEYWORD';
  /** 에러 메시지 */
  errorMessage?: string;
  /** 페이지 제목 */
  pageTitle?: string;
  /** 로딩 시간 (ms) */
  loadTimeMs?: number;
  /** 스크린샷 경로 (Vision AI 사용 시) */
  screenshotPath?: string;
  /** Vision AI 분석 결과 */
  visionAnalysis?: VisionPageAnalysis;
}

/**
 * Vision AI 페이지 분석 결과
 */
export interface VisionPageAnalysis {
  /** 레이아웃 상태 */
  layoutStatus: 'normal' | 'broken' | 'partial';
  /** 감지된 컴포넌트 목록 */
  detectedComponents: string[];
  /** 이상 징후 */
  anomalies: string[];
  /** 추가 관찰 사항 */
  observations?: string;
}

/**
 * 컴포넌트 요구사항 정의
 */
export interface ComponentRequirement {
  /** 컴포넌트 이름 */
  name: string;
  /** CSS Selector 목록 (우선순위 순) */
  selectors: string[];
  /** Vision AI 힌트 (시각적으로 어떻게 보이는지) */
  visionHint: string;
  /** 필수 여부 */
  required?: boolean;
  /** 컴포넌트 설명 */
  description?: string;
}

/**
 * 페이지 타입별 요구사항
 */
export interface PageTypeRequirement {
  /** 페이지 타입 */
  pageType: string;
  /** 페이지 설명 */
  description: string;
  /** 필수 컴포넌트 */
  required: ComponentRequirement[];
  /** 선택 컴포넌트 */
  optional?: ComponentRequirement[];
  /** 페이지 타입 감지용 URL 패턴 */
  urlPatterns?: RegExp[];
}

/**
 * 에러 페이지 감지 결과
 */
export interface ErrorPageDetection {
  /** 에러 페이지 여부 */
  isError: boolean;
  /** 에러 타입 */
  errorType?: 'HTTP_ERROR' | 'KEYWORD' | 'EMPTY';
  /** HTTP 상태 코드 */
  httpStatus?: number;
  /** 감지된 에러 키워드 */
  matchedKeyword?: string;
  /** 에러 메시지 */
  message?: string;
}

/**
 * 로그인 필요 감지 결과
 */
export interface LoginRequiredDetection {
  /** 로그인 필요 여부 */
  isLoginRequired: boolean;
  /** 감지된 키워드 */
  matchedKeyword?: string;
  /** 리다이렉트 URL */
  redirectUrl?: string;
}

/**
 * DOM 기반 검증 결과
 */
export interface DOMValidationResult {
  /** HTTP 상태 */
  httpStatus: number;
  /** 에러 페이지 여부 */
  isErrorPage: boolean;
  /** 빈 페이지 여부 */
  isEmpty: boolean;
  /** 로그인 필요 여부 */
  isLoginRequired: boolean;
  /** 컴포넌트 검증 결과 */
  components: ComponentCheck[];
  /** 페이지 제목 */
  pageTitle: string;
  /** 감지된 에러 키워드 */
  errorKeyword?: string;
}

/**
 * Vision AI 검증 결과
 */
export interface VisionValidationResult {
  /** 컴포넌트 검증 결과 */
  components: ComponentCheck[];
  /** 레이아웃 상태 */
  layoutStatus: 'normal' | 'broken' | 'partial';
  /** 감지된 페이지 타입 */
  detectedPageType?: string;
  /** 이상 징후 */
  anomalies: string[];
  /** 전체 신뢰도 */
  confidence: number;
}

/**
 * 검증 옵션
 */
export interface PageValidationOptions {
  /** Vision AI 사용 여부 (기본: true) */
  useVisionAI?: boolean;
  /** Vision AI 사용 조건: 'always' | 'on-missing' | 'never' */
  visionMode?: 'always' | 'on-missing' | 'never';
  /** 타임아웃 (ms) */
  timeout?: number;
  /** 스크린샷 저장 여부 */
  saveScreenshot?: boolean;
  /** 스크린샷 저장 경로 */
  screenshotDir?: string;
  /** 상세 로그 출력 */
  verbose?: boolean;
}
