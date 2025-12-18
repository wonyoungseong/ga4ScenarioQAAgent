/**
 * GA4 파라미터 표준 설정
 *
 * 아모레퍼시픽 전사 표준 GA4 파라미터 가이드 기반
 * - 시나리오 생성, 크롤링, 검증, Vision AI 추출, GTM 매핑에 활용
 *
 * @version 1.0.0
 * @lastUpdated 2024-12
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 타입 정의
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 파라미터 데이터 타입
 */
export type ParameterDataType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'hash'      // SHA512 해싱된 값
  | 'iso_code'  // ISO 표준 코드 (국가, 언어, 통화)
  | 'url'
  | 'datetime';

/**
 * 파라미터 Scope (GA4 기준)
 */
export type ParameterScope = 'event' | 'user' | 'item';

/**
 * 파라미터 타입 (GA4 기준)
 * - D: 기본 제공 Dimension
 * - CD: 커스텀 Dimension
 * - M: 기본 제공 Metric (전자상거래 관련)
 * - CM: 커스텀 Metric
 */
export type ParameterType = 'D' | 'CD' | 'M' | 'CM';

/**
 * 사이트 타입
 */
export type SiteType = 'E' | 'B' | 'O'; // E-commerce, Brand, Others

/**
 * 파라미터 값 추출 방법
 */
export type ExtractionMethod =
  | 'SCREEN_OCR'           // 화면에서 텍스트 추출 (Vision AI)
  | 'SCREEN_ELEMENT'       // 화면 요소 존재 여부 확인
  | 'URL_PARAMETER'        // URL 파라미터에서 추출
  | 'URL_PATH'             // URL 경로에서 추출
  | 'DATA_LAYER'           // dataLayer에서 추출
  | 'GLOBAL_VARIABLE'      // 전역 JavaScript 변수에서 추출
  | 'DOM_ATTRIBUTE'        // DOM 요소 속성에서 추출
  | 'DOM_META'             // meta 태그에서 추출
  | 'JSON_LD'              // JSON-LD 스키마에서 추출
  | 'COOKIE'               // 쿠키에서 추출
  | 'LOCAL_STORAGE'        // 로컬 스토리지에서 추출
  | 'COMPUTED'             // 다른 값들로부터 계산
  | 'AUTO_COLLECTED'       // GA4 자동 수집
  | 'GTM_VARIABLE'         // GTM 변수에서 추출
  | 'INFERENCE'            // 추론 (사이트 언어, 통화 등)
  | 'USER_ACTION';         // 사용자 액션 기반

/**
 * 검증 규칙 타입
 */
export interface ValidationRule {
  type: 'required' | 'pattern' | 'enum' | 'range' | 'length' | 'custom';
  value?: string | number | string[] | [number, number];
  message?: string;
}

/**
 * Vision AI 추출 힌트
 */
export interface VisionExtractionHint {
  /** 화면에서 찾을 위치 힌트 */
  locationHint: string;
  /** 찾을 텍스트 패턴 (정규식) */
  textPattern?: string;
  /** 주변 컨텍스트 (예: "가격 옆에", "브랜드 로고 아래") */
  contextHint?: string;
  /** 추출 우선순위 (1이 가장 높음) */
  priority?: number;
  /** 대체 추출 위치 */
  fallbackLocations?: string[];
}

/**
 * GTM 변수 매핑 정보
 */
export interface GTMVariableMapping {
  /** GTM 변수 이름 */
  variableName: string;
  /** GTM 변수 타입 (jsm, v, k, u, smm 등) */
  variableType: 'jsm' | 'v' | 'k' | 'u' | 'smm' | 'remm' | 'gtes' | 'cvt';
  /** 값 소스 설명 */
  valueSource?: string;
}

/**
 * 크롤링 설정
 */
export interface CrawlingConfig {
  /** CSS 선택자 */
  selector?: string;
  /** XPath */
  xpath?: string;
  /** 속성명 (없으면 textContent) */
  attribute?: string;
  /** 값 변환 함수 */
  transform?: 'number' | 'trim' | 'lowercase' | 'uppercase' | 'removeComma' | 'extractNumber';
  /** 다중 값 구분자 */
  delimiter?: string;
}

/**
 * 파라미터 정의
 */
export interface GA4ParameterDefinition {
  /** 파라미터 고유 ID (행 번호) */
  id: number;

  /** 파라미터 키 (빅쿼리, GTM, 앱 데이터 전송에 활용) */
  key: string;

  /** GA4 Report에서 표시되는 이름 */
  displayName: string;

  /** 파라미터 설명 */
  description: string;

  /** 예시 값 */
  examples: string[];

  /** Scope (event, user, item) */
  scope: ParameterScope;

  /** 타입 (D, CD, M, CM) */
  type: ParameterType;

  /** 데이터 타입 */
  dataType: ParameterDataType;

  /** 적용 가능한 사이트 타입 */
  siteTypes: SiteType[];

  /** 수집되는 이벤트 목록 ('*' = 모든 이벤트) */
  eventsWith: string[];

  /** 수집 조건 (예: "로그인 상태에서만") */
  condition?: string;

  /** 추출 방법 (우선순위 순) */
  extractionMethods: ExtractionMethod[];

  /** Vision AI 추출 힌트 (화면에서 추출 가능한 경우) */
  visionHint?: VisionExtractionHint;

  /** GTM 변수 매핑 */
  gtmMapping?: GTMVariableMapping;

  /** 크롤링 설정 */
  crawlingConfig?: CrawlingConfig;

  /** 검증 규칙 */
  validationRules?: ValidationRule[];

  /** 자동 수집 여부 */
  isAutoCollected?: boolean;

  /** 비고 */
  notes?: string;
}

/**
 * 이벤트별 필수/선택 파라미터 정의
 */
export interface EventParameterRequirement {
  eventName: string;
  displayName: string;
  description: string;
  requiredParams: string[];
  optionalParams: string[];
  itemParams?: string[];
  siteTypes: SiteType[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// 상수 정의
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Content Group (페이지 타입) 값 목록
 */
export const CONTENT_GROUP_VALUES = [
  'MAIN',
  'BRAND_MAIN',
  'PRODUCT_DETAIL',
  'PRODUCT_LIST',
  'SEARCH_RESULT',
  'CART',
  'ORDER',
  'MY',
  'EVENT_LIST',
  'EVENT_DETAIL',
  'LIVE_LIST',
  'LIVE_DETAIL',
  'OTHERS',
] as const;

export type ContentGroupType = typeof CONTENT_GROUP_VALUES[number];

/**
 * 사이트 이름 목록
 */
export const SITE_NAMES = [
  'INNISFREE',
  'APMALL',
  'SULWHASOO',
  'LANEIGE',
  'HERA',
  'IOPE',
  'MAMONDE',
  'ETUDE',
  'ESPOIR',
  'PRIMERA',
  'VITALBEAUTIE',
  'AESTURA',
  'ILLIYOON',
  'HAPPY BATH',
  'MISE EN SCENE',
  'REDDENIM',
  'AMOREPACIFIC',
] as const;

/**
 * 채널 타입
 */
export const CHANNEL_TYPES = ['PC', 'MOBILE', 'APP'] as const;

/**
 * 환경 타입
 */
export const ENVIRONMENT_TYPES = ['PRD', 'DEV', 'STG', 'LOCAL'] as const;

/**
 * 뷰티포인트 등급
 */
export const BEAUTY_LEVELS = ['FAMILY', 'GREEN', 'SILVER', 'GOLD', 'PLATINUM'] as const;

/**
 * 로그인 방법
 */
export const LOGIN_METHODS = ['NORMAL', 'MOBILE', 'ORDER_NUMBER', 'AUTO'] as const;

/**
 * 체크아웃 단계
 */
export const CHECKOUT_STEPS = {
  1: 'cartpage',    // 장바구니 페이지 로드
  2: 'cartbtn',     // 장바구니 구매 버튼 or 상품상세 구매 버튼 or 상품리스트 구매 버튼
  3: 'orderpage',   // 주문서 페이지 로드
  4: 'orderbtn',    // 주문서 결제하기 버튼
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// GA4 파라미터 정의 (PDF 기반)
// ═══════════════════════════════════════════════════════════════════════════════

export const GA4_PARAMETERS: GA4ParameterDefinition[] = [
  // ─────────────────────────────────────────────────────────────────────────────
  // 자동 수집 파라미터 (1-11)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 1,
    key: 'language',
    displayName: '언어, 언어 코드',
    description: '웹 또는 앱의 언어 및 언어코드',
    examples: ['English', 'en-us', 'ko-kr'],
    scope: 'event',
    type: 'D',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    extractionMethods: ['AUTO_COLLECTED'],
    isAutoCollected: true,
  },
  {
    id: 2,
    key: 'page_location',
    displayName: '페이지 위치',
    description: '웹페이지 URL',
    examples: ['https://www.amoremall.com/kr/ko/display/main'],
    scope: 'event',
    type: 'D',
    dataType: 'url',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    extractionMethods: ['AUTO_COLLECTED', 'URL_PATH'],
    isAutoCollected: true,
  },
  {
    id: 3,
    key: 'page_referrer',
    displayName: '페이지 리퍼러',
    description: '이전 웹페이지 URL',
    examples: ['https://www.amoremall.com/kr/ko/display/rank', 'https://www.google.com'],
    scope: 'event',
    type: 'D',
    dataType: 'url',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    extractionMethods: ['AUTO_COLLECTED'],
    isAutoCollected: true,
  },
  {
    id: 4,
    key: 'page_title',
    displayName: '페이지 제목',
    description: '웹페이지 제목',
    examples: ['아모레퍼시픽 공식 온라인 쇼핑몰 - 신규고객 10% 추가할인'],
    scope: 'event',
    type: 'D',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    extractionMethods: ['AUTO_COLLECTED', 'DOM_META'],
    isAutoCollected: true,
    crawlingConfig: {
      selector: 'title',
    },
  },
  {
    id: 5,
    key: 'screen_resolution',
    displayName: '화면 해상도',
    description: '화면 해상도(WEB 접속 시 수집)',
    examples: ['1920x1080', '1440x900'],
    scope: 'event',
    type: 'D',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    extractionMethods: ['AUTO_COLLECTED'],
    isAutoCollected: true,
  },
  {
    id: 6,
    key: 'screen_class',
    displayName: '화면 클래스',
    description: '앱 화면 클래스 - UIViewController 또는 Activity의 클래스 이름',
    examples: ['MainActivity', 'ProductDetailActivity'],
    scope: 'event',
    type: 'D',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    extractionMethods: ['AUTO_COLLECTED'],
    isAutoCollected: true,
    notes: 'APP에서만 수집',
  },
  {
    id: 7,
    key: 'geo',
    displayName: '대륙, 국가, 시/군/구, 지역',
    description: '사용자 지리 정보(IP 기반) - 대륙, 국가, 시/도',
    examples: ['Asia', 'South Korea', 'Gyeongsangnam-do', 'Jinju-si'],
    scope: 'event',
    type: 'D',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    extractionMethods: ['AUTO_COLLECTED'],
    isAutoCollected: true,
  },
  {
    id: 8,
    key: 'device',
    displayName: '기기 카테고리, 기기 브랜드, 기기 모델',
    description: '접속한 기기 정보 - 기기 카테고리, 브랜드, 모델',
    examples: ['mobile', 'Samsung', 'SM-S901N'],
    scope: 'event',
    type: 'D',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    extractionMethods: ['AUTO_COLLECTED'],
    isAutoCollected: true,
  },
  {
    id: 9,
    key: 'browser',
    displayName: '브라우저, 브라우저 버전',
    description: '브라우저 및 버전',
    examples: ['Chrome', '119.0.0.0'],
    scope: 'event',
    type: 'D',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    extractionMethods: ['AUTO_COLLECTED'],
    isAutoCollected: true,
  },
  {
    id: 10,
    key: 'os',
    displayName: '운영체제, 운영체제 및 버전',
    description: '운영체제 및 버전',
    examples: ['Windows', '10', 'iOS', '17.0'],
    scope: 'event',
    type: 'D',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    extractionMethods: ['AUTO_COLLECTED'],
    isAutoCollected: true,
  },
  {
    id: 11,
    key: 'app_version',
    displayName: '앱 버전',
    description: '앱 버전',
    examples: ['1.0', '2.3.1'],
    scope: 'event',
    type: 'D',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    extractionMethods: ['AUTO_COLLECTED'],
    isAutoCollected: true,
    notes: 'APP에서만 수집',
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 공통 사이트 파라미터 (12-18)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 12,
    key: 'content_group',
    displayName: '콘텐츠 그룹',
    description: '페이지 타입 전송, 공통 변수 appendix 참고',
    examples: ['MAIN', 'BRAND_MAIN', 'PRODUCT_DETAIL', 'PRODUCT_LIST', 'SEARCH_RESULT', 'CART', 'ORDER', 'MY', 'EVENT_LIST', 'EVENT_DETAIL', 'LIVE_LIST', 'LIVE_DETAIL', 'OTHERS'],
    scope: 'event',
    type: 'D',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    extractionMethods: ['GTM_VARIABLE', 'URL_PATH', 'INFERENCE'],
    gtmMapping: {
      variableName: 'JS - Content Group',
      variableType: 'jsm',
      valueSource: '페이지 타입/콘텐츠 그룹 반환',
    },
    validationRules: [
      { type: 'enum', value: CONTENT_GROUP_VALUES as unknown as string[] },
    ],
    visionHint: {
      locationHint: '페이지 레이아웃/구조로 추론',
      contextHint: 'URL 패턴과 페이지 구조를 통해 페이지 타입 파악',
    },
  },
  {
    id: 13,
    key: 'site_name',
    displayName: '사이트_이름',
    description: '사이트 이름 - 공통 변수 appendix 참고',
    examples: ['INNISFREE', 'APMALL', 'SULWHASOO'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    extractionMethods: ['GTM_VARIABLE', 'DOM_META', 'INFERENCE'],
    gtmMapping: {
      variableName: 'JS - Site Name',
      variableType: 'jsm',
      valueSource: '사이트 도메인/설정 기반',
    },
    visionHint: {
      locationHint: '헤더 로고 영역',
      contextHint: '브랜드 로고나 사이트 타이틀에서 추출',
    },
  },
  {
    id: 14,
    key: 'site_country',
    displayName: '사이트_국가',
    description: '국가코드 - 접속한 국가가 아닌, 사이트가 대상으로 하는 국가. ISO 3166-1 Alpha-2 적용',
    examples: ['KR', 'US', 'JP', 'CN'],
    scope: 'event',
    type: 'CD',
    dataType: 'iso_code',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    extractionMethods: ['URL_PATH', 'GTM_VARIABLE', 'INFERENCE'],
    gtmMapping: {
      variableName: 'JS - Site Country',
      variableType: 'jsm',
      valueSource: 'URL 경로에서 국가 코드 추출 (/kr/, /us/ 등)',
    },
    validationRules: [
      { type: 'pattern', value: '^[A-Z]{2}$', message: 'ISO 3166-1 Alpha-2 형식이어야 합니다' },
    ],
    visionHint: {
      locationHint: 'URL 또는 국가 선택 영역',
      contextHint: 'URL의 /kr/, /us/ 패턴이나 국가 선택 드롭다운에서 추출',
    },
  },
  {
    id: 15,
    key: 'site_language',
    displayName: '사이트_언어',
    description: '페이지 언어 - 번역 여부와 상관 없이 해당 사이트가 원래 작성된 언어나 주로 사용된 언어. ISO 639-1 코드를 대문자로 전송',
    examples: ['KO', 'EN', 'JA', 'ZH'],
    scope: 'event',
    type: 'CD',
    dataType: 'iso_code',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    extractionMethods: ['URL_PATH', 'GTM_VARIABLE', 'DOM_ATTRIBUTE', 'INFERENCE'],
    gtmMapping: {
      variableName: 'JS - Site Language',
      variableType: 'jsm',
      valueSource: 'URL 경로에서 언어 코드 추출 (/ko/, /en/ 등)',
    },
    validationRules: [
      { type: 'pattern', value: '^[A-Z]{2}$', message: 'ISO 639-1 형식이어야 합니다' },
    ],
    crawlingConfig: {
      selector: 'html',
      attribute: 'lang',
      transform: 'uppercase',
    },
    visionHint: {
      locationHint: 'URL 또는 언어 선택 영역',
      contextHint: 'URL의 /ko/, /en/ 패턴이나 언어 선택 드롭다운에서 추출',
    },
  },
  {
    id: 16,
    key: 'site_env',
    displayName: '사이트_환경',
    description: '개발환경 - 예시 값과 같이 전송',
    examples: ['PRD', 'DEV', 'STG', 'LOCAL'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    extractionMethods: ['GTM_VARIABLE', 'URL_PATH', 'INFERENCE'],
    gtmMapping: {
      variableName: 'JS - Site Env',
      variableType: 'jsm',
      valueSource: 'URL 도메인 기반 환경 판별',
    },
    validationRules: [
      { type: 'enum', value: ENVIRONMENT_TYPES as unknown as string[] },
    ],
  },
  {
    id: 17,
    key: 'channel',
    displayName: '사이트_채널 유형',
    description: 'PCWEB접속 시: "PC" 전송, MOWEB접속 시: "MOBILE" 전송, APP접속 시: "APP" 전송',
    examples: ['PC', 'MOBILE', 'APP'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    extractionMethods: ['GTM_VARIABLE', 'GLOBAL_VARIABLE', 'INFERENCE'],
    gtmMapping: {
      variableName: 'JS - Channel',
      variableType: 'jsm',
      valueSource: 'User Agent 및 뷰포트 크기 기반',
    },
    validationRules: [
      { type: 'enum', value: CHANNEL_TYPES as unknown as string[] },
    ],
  },
  {
    id: 18,
    key: 'page_bread',
    displayName: '페이지_Breadcrumb',
    description: 'Breadcrumb 전송 - 구분자는 " > " 로 전송',
    examples: ['베스트 > 스킨케어 > 상품상세', '홈 > 브랜드 > 설화수'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    extractionMethods: ['SCREEN_OCR', 'DOM_ATTRIBUTE', 'GTM_VARIABLE'],
    crawlingConfig: {
      selector: '[class*="breadcrumb"], nav[aria-label="breadcrumb"], .gnb-breadcrumb',
      delimiter: ' > ',
    },
    visionHint: {
      locationHint: '상단 네비게이션 아래, 콘텐츠 영역 위',
      textPattern: '.+ > .+',
      contextHint: '페이지 상단의 경로 표시 영역 (예: 홈 > 카테고리 > 상품)',
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 로그인/사용자 파라미터 (19-28)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 19,
    key: 'login_is_login',
    displayName: '고객_로그인여부',
    description: '로그인 여부 - 로그인 상태인 경우: "Y" 전송, 비로그인 상태인 경우: "N" 전송',
    examples: ['Y', 'N'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    extractionMethods: ['GTM_VARIABLE', 'GLOBAL_VARIABLE', 'COOKIE', 'SCREEN_ELEMENT'],
    gtmMapping: {
      variableName: 'JS - Login Is Login',
      variableType: 'jsm',
      valueSource: '로그인 상태 확인',
    },
    validationRules: [
      { type: 'enum', value: ['Y', 'N'] },
    ],
    visionHint: {
      locationHint: '헤더 우측 상단',
      contextHint: '로그인/로그아웃 버튼, 마이페이지 아이콘, 사용자 이름 표시 여부로 판단',
    },
  },
  {
    id: 20,
    key: 'login_id_gcid',
    displayName: '고객_아이디',
    description: '회원 아이디(서비스 로그인 ID)를 SHA512 해싱한 값 (128자)',
    examples: ['f9b7cc17e2c394141a85dfdd332e3243bid09agkcudjankxlkx5rdffi4kkcf9b7cc17e2c394141a85dfdd332e3243bid09agkcudjankxlkx5rdffi4kkc9fl4b5'],
    scope: 'event',
    type: 'CD',
    dataType: 'hash',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    condition: '로그인 상태에서만 전송',
    extractionMethods: ['GTM_VARIABLE', 'GLOBAL_VARIABLE'],
    gtmMapping: {
      variableName: 'JS - Login ID GCID',
      variableType: 'jsm',
      valueSource: 'user-id로 전송',
    },
    validationRules: [
      { type: 'length', value: [128, 128], message: 'SHA512 해시는 128자여야 합니다' },
    ],
    notes: 'user-id로 전송',
  },
  {
    id: 21,
    key: 'login_id_cid',
    displayName: '고객_통합회원번호',
    description: '통합 회원번호(뷰티포인트 회원번호)를 SHA512 해싱한 값 (128자) - 일반 로그인인 경우 undefined 처리',
    examples: ['di0f8e27e2c394141a85dfdd332e3243bid09agkcudjankxlkx5rdffi4kkcf9b7cc17e2c394141a85dfdd332e3243bid09agkcudjankxlkx5rdffi4kkc9fl4b5'],
    scope: 'event',
    type: 'CD',
    dataType: 'hash',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    condition: '로그인 상태에서만 전송',
    extractionMethods: ['GTM_VARIABLE', 'GLOBAL_VARIABLE'],
    gtmMapping: {
      variableName: 'JS - Login ID CID',
      variableType: 'jsm',
      valueSource: '통합회원번호 해싱',
    },
    validationRules: [
      { type: 'length', value: [128, 128], message: 'SHA512 해시는 128자여야 합니다' },
    ],
  },
  {
    id: 22,
    key: 'login_is_sso',
    displayName: '고객_통합회원구분',
    description: '통합회원여부 - 통합회원인 경우: "Y" 전송, 통합회원이 아닌 경우: "N" 전송',
    examples: ['Y', 'N'],
    scope: 'user',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    condition: '로그인 상태에서만 전송',
    extractionMethods: ['GTM_VARIABLE', 'GLOBAL_VARIABLE'],
    validationRules: [
      { type: 'enum', value: ['Y', 'N'] },
    ],
  },
  {
    id: 23,
    key: 'login_gender',
    displayName: '고객_성별',
    description: '성별 - 여성인 경우: "F" 전송, 남성인 경우: "M" 전송, 알 수 없는 경우: undefined 처리',
    examples: ['F', 'M'],
    scope: 'user',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    condition: '로그인 상태에서만 전송',
    extractionMethods: ['GTM_VARIABLE', 'GLOBAL_VARIABLE'],
    gtmMapping: {
      variableName: 'JS - Login Gender',
      variableType: 'jsm',
      valueSource: '사용자 성별',
    },
    validationRules: [
      { type: 'enum', value: ['F', 'M'] },
    ],
  },
  {
    id: 24,
    key: 'login_birth',
    displayName: '고객_생년',
    description: '생년 - "YYYY" 형태로 전송, 알 수 없는 경우: undefined 처리',
    examples: ['1980', '2000', '1995'],
    scope: 'user',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    condition: '로그인 상태에서만 전송',
    extractionMethods: ['GTM_VARIABLE', 'GLOBAL_VARIABLE'],
    validationRules: [
      { type: 'pattern', value: '^\\d{4}$', message: 'YYYY 형식이어야 합니다' },
      { type: 'range', value: [1900, 2024], message: '유효한 연도여야 합니다' },
    ],
  },
  {
    id: 25,
    key: 'login_method',
    displayName: '고객_로그인유형',
    description: '로그인 방법 - 대문자로 전송',
    examples: ['NORMAL', 'MOBILE', 'ORDER_NUMBER', 'AUTO'],
    scope: 'user',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    condition: '로그인 상태에서만 전송',
    extractionMethods: ['GTM_VARIABLE', 'GLOBAL_VARIABLE'],
    validationRules: [
      { type: 'enum', value: LOGIN_METHODS as unknown as string[] },
    ],
  },
  {
    id: 26,
    key: 'login_level',
    displayName: '고객_등급',
    description: '사이트 내부적으로 사용하는 회원등급 - 값이 영문인 경우 대문자로 전송, 사이트 내부 회원등급이 없는 경우: undefined 처리',
    examples: ['WELCOME', 'A 등급', '그린티클럽', 'VIP'],
    scope: 'user',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    condition: '로그인 상태에서만 전송',
    extractionMethods: ['GTM_VARIABLE', 'GLOBAL_VARIABLE', 'SCREEN_OCR'],
    visionHint: {
      locationHint: '마이페이지 또는 헤더 사용자 정보 영역',
      contextHint: '회원 등급 배지나 텍스트',
    },
  },
  {
    id: 27,
    key: 'login_beauty_level',
    displayName: '고객_통합회원등급',
    description: '뷰티포인트 회원 등급 - 통합 로그인이 아닌 경우: undefined 처리',
    examples: ['FAMILY', 'GREEN', 'SILVER', 'GOLD', 'PLATINUM'],
    scope: 'user',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    condition: '로그인 상태에서만 전송',
    extractionMethods: ['GTM_VARIABLE', 'GLOBAL_VARIABLE'],
    gtmMapping: {
      variableName: 'JS - Login Beauty Level',
      variableType: 'jsm',
      valueSource: '뷰티포인트 등급',
    },
    validationRules: [
      { type: 'enum', value: BEAUTY_LEVELS as unknown as string[] },
    ],
  },
  {
    id: 28,
    key: 'login_is_member',
    displayName: '고객_임직원유무',
    description: '임직원 여부 - 임직원: "Y" 전송, 일반회원: "N" 전송, 알 수 없는 경우: undefined 처리',
    examples: ['Y', 'N'],
    scope: 'user',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    condition: '로그인 상태에서만 전송',
    extractionMethods: ['GTM_VARIABLE', 'GLOBAL_VARIABLE'],
    validationRules: [
      { type: 'enum', value: ['Y', 'N'] },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 이벤트 메타데이터 파라미터 (29-36)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 29,
    key: 'event_category',
    displayName: '이벤트_카테고리',
    description: '이벤트 카테고리',
    examples: ['ecommerce', 'engagement', 'navigation'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    condition: 'page_view, screen_view 제외',
    extractionMethods: ['DATA_LAYER', 'GTM_VARIABLE'],
    gtmMapping: {
      variableName: 'DL - Event Category with customEvent',
      variableType: 'v',
      valueSource: 'dataLayer.eventCategory',
    },
  },
  {
    id: 30,
    key: 'event_action',
    displayName: '이벤트_액션',
    description: '이벤트 액션',
    examples: ['view item', 'add to cart', 'click'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    condition: 'page_view, screen_view 제외',
    extractionMethods: ['DATA_LAYER', 'GTM_VARIABLE'],
    gtmMapping: {
      variableName: 'DL - Event Action with customEvent',
      variableType: 'v',
      valueSource: 'dataLayer.eventAction',
    },
  },
  {
    id: 31,
    key: 'event_label',
    displayName: '이벤트_라벨',
    description: '이벤트 라벨',
    examples: ['설화수 자음생크림', '메인 배너 클릭'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    condition: 'page_view, screen_view 제외',
    extractionMethods: ['DATA_LAYER', 'GTM_VARIABLE'],
    gtmMapping: {
      variableName: 'DL - Event Label with customEvent',
      variableType: 'v',
      valueSource: 'dataLayer.eventLabel',
    },
  },
  {
    id: 32,
    key: 'event_param1',
    displayName: '이벤트_맞춤변수1',
    description: '이벤트 추가 데이터 1 - 미 수집 시 undefined',
    examples: ['custom_value_1'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['ap_click', 'custom_event', 'experience'],
    extractionMethods: ['DATA_LAYER', 'GTM_VARIABLE'],
  },
  {
    id: 33,
    key: 'event_param2',
    displayName: '이벤트_맞춤변수2',
    description: '이벤트 추가 데이터 2 - 미 수집 시 undefined',
    examples: ['custom_value_2'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['ap_click', 'custom_event', 'experience'],
    extractionMethods: ['DATA_LAYER', 'GTM_VARIABLE'],
  },
  {
    id: 34,
    key: 'event_param3',
    displayName: '이벤트_맞춤변수3',
    description: '이벤트 추가 데이터 3 - 미 수집 시 undefined',
    examples: ['custom_value_3'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['ap_click', 'custom_event', 'experience'],
    extractionMethods: ['DATA_LAYER', 'GTM_VARIABLE'],
  },
  {
    id: 35,
    key: 'click_css_selector',
    displayName: 'click_css_selector',
    description: '요소 클릭 시, 해당 링크 요소의 CSS Selector 값',
    examples: ['body > container > a', '#main-nav > ul > li:nth-child(2) > a'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['ap_click', 'click_with_duration'],
    extractionMethods: ['GTM_VARIABLE', 'DOM_ATTRIBUTE'],
  },
  {
    id: 36,
    key: 'click_text',
    displayName: 'click_text',
    description: '요소 클릭 시, 해당 링크의 텍스트',
    examples: ['아모레몰', '장바구니', '구매하기'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['ap_click', 'click_with_duration'],
    extractionMethods: ['GTM_VARIABLE', 'DOM_ATTRIBUTE', 'SCREEN_OCR'],
    visionHint: {
      locationHint: '클릭된 요소',
      contextHint: '버튼이나 링크의 텍스트 내용',
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 검색 파라미터 (37-40, 109)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 37,
    key: 'search_term',
    displayName: '검색_검색어',
    description: '검색에 사용한 키워드',
    examples: ['스킨케어', '설화수 크림', '선크림'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['view_item_list', 'view_search_results'],
    extractionMethods: ['URL_PARAMETER', 'SCREEN_OCR', 'DATA_LAYER'],
    crawlingConfig: {
      selector: 'input[type="search"], input[name="keyword"], input[name="q"]',
      attribute: 'value',
    },
    visionHint: {
      locationHint: '검색창 또는 검색 결과 페이지 상단',
      textPattern: '검색어|keyword|search',
      contextHint: '검색 입력창에 입력된 텍스트 또는 검색 결과 제목',
    },
  },
  {
    id: 38,
    key: 'search_type',
    displayName: '검색_검색유형',
    description: '해쉬태그, 직접검색 등',
    examples: ['직접검색', '해시태그', '추천검색어'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['view_item_list', 'view_search_results'],
    extractionMethods: ['DATA_LAYER', 'GTM_VARIABLE', 'INFERENCE'],
  },
  {
    id: 39,
    key: 'search_resultcount',
    displayName: '검색_검색결과수',
    description: '검색결과 페이지에 노출된 콘텐츠 개수',
    examples: ['5', '120', '0'],
    scope: 'event',
    type: 'CD',
    dataType: 'number',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['view_item_list', 'view_search_results'],
    extractionMethods: ['SCREEN_OCR', 'DATA_LAYER', 'DOM_ATTRIBUTE'],
    crawlingConfig: {
      selector: '[class*="result-count"], [class*="total-count"]',
      transform: 'extractNumber',
    },
    visionHint: {
      locationHint: '검색 결과 상단',
      textPattern: '\\d+\\s*(개|건|results?)',
      contextHint: '"총 123개 상품" 또는 "123 results" 형태의 텍스트',
    },
  },
  {
    id: 40,
    key: 'search_result',
    displayName: '검색_검색결과',
    description: '정상적으로 검색이 되었는지',
    examples: ['Y', 'N'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['view_item_list', 'view_search_results'],
    extractionMethods: ['COMPUTED', 'SCREEN_ELEMENT'],
    validationRules: [
      { type: 'enum', value: ['Y', 'N'] },
    ],
    visionHint: {
      locationHint: '검색 결과 영역',
      contextHint: '검색 결과가 있으면 Y, "검색 결과 없음" 메시지가 있으면 N',
    },
  },
  {
    id: 109,
    key: 'search_item_resultcount',
    displayName: '검색_상품검색결과수',
    description: '검색결과 페이지에 노출된 상품 개수 (게시글 수량 미 포함)',
    examples: ['5', '48', '0'],
    scope: 'event',
    type: 'CD',
    dataType: 'number',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['view_item_list', 'view_search_results'],
    extractionMethods: ['SCREEN_OCR', 'DATA_LAYER', 'DOM_ATTRIBUTE'],
    notes: '게시글 수량 미 포함',
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 이벤트/프로모션 상세 파라미터 (41-42)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 41,
    key: 'view_event_code',
    displayName: '이벤트상세_이벤트 코드',
    description: '조회한 이벤트/프로모션 ID',
    examples: ['EVT202312001', 'PROMO_HOLIDAY_2023'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    condition: '이벤트 상세 페이지 내 모든 이벤트',
    extractionMethods: ['URL_PARAMETER', 'DATA_LAYER', 'GTM_VARIABLE'],
  },
  {
    id: 42,
    key: 'view_event_name',
    displayName: '이벤트상세_이벤트 이름',
    description: '조회한 이벤트/프로모션명',
    examples: ['연말 특별 할인전', '신규 회원 웰컴 혜택'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    condition: '이벤트 상세 페이지 내 모든 이벤트',
    extractionMethods: ['SCREEN_OCR', 'DATA_LAYER', 'DOM_META'],
    visionHint: {
      locationHint: '이벤트 페이지 상단 제목 영역',
      contextHint: '이벤트/프로모션 제목 텍스트',
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 상품 상세 파라미터 (43-48)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 43,
    key: 'product_id',
    displayName: '제품상세_제품 코드',
    description: '조회한 상품상세 페이지 내 상품 ID',
    examples: ['110640000675', '111170002462'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    condition: '상품 상세 페이지 내 모든 이벤트',
    extractionMethods: ['URL_PARAMETER', 'DATA_LAYER', 'GTM_VARIABLE', 'DOM_ATTRIBUTE'],
    gtmMapping: {
      variableName: 'JS - Product Id with View Item',
      variableType: 'jsm',
      valueSource: 'URL 또는 전역 변수에서 상품 ID 추출',
    },
    crawlingConfig: {
      selector: '[data-product-id], [data-sku]',
      attribute: 'data-product-id',
    },
    visionHint: {
      locationHint: 'URL 파라미터 (onlineProdCode)',
      contextHint: 'URL에서 상품 코드 추출',
    },
  },
  {
    id: 44,
    key: 'product_name',
    displayName: '제품상세_제품 이름',
    description: '조회한 상품상세 페이지 내 상품 이름',
    examples: ['설화수 자음생크림', '[아세페 ONLY] 탄력크림 단품세트'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    condition: '상품 상세 페이지 내 모든 이벤트',
    extractionMethods: ['SCREEN_OCR', 'DATA_LAYER', 'DOM_META', 'JSON_LD'],
    gtmMapping: {
      variableName: 'JS - Product Name with View Item',
      variableType: 'jsm',
      valueSource: '상품명 추출',
    },
    crawlingConfig: {
      selector: 'h1[class*="product-name"], [class*="product-title"], [itemprop="name"]',
    },
    visionHint: {
      locationHint: '상품 이미지 우측 또는 하단, 큰 글씨로 표시된 상품명',
      textPattern: '.+',
      contextHint: '가장 눈에 띄는 상품 제목 텍스트',
      priority: 1,
    },
  },
  {
    id: 45,
    key: 'product_category',
    displayName: '제품상세_제품 카테고리',
    description: '조회한 상품상세 페이지 내 상품 카테고리 - 구분자는 "/" 사용',
    examples: ['스킨케어/크림', '메이크업/립/립스틱'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    condition: '상품 상세 페이지 내 모든 이벤트',
    extractionMethods: ['DATA_LAYER', 'GTM_VARIABLE', 'SCREEN_OCR', 'DOM_ATTRIBUTE'],
    gtmMapping: {
      variableName: 'JS - Product Category with View Item',
      variableType: 'jsm',
      valueSource: '상품 카테고리 추출',
    },
    crawlingConfig: {
      selector: '[class*="breadcrumb"] a, [itemprop="category"]',
      delimiter: '/',
    },
    visionHint: {
      locationHint: '브레드크럼 영역 또는 상품 정보 내 카테고리 표시',
      textPattern: '.+/.+',
      contextHint: '홈 > 스킨케어 > 크림 형태의 경로에서 추출',
    },
  },
  {
    id: 46,
    key: 'product_brandname',
    displayName: '제품상세_제품 브랜드',
    description: '조회한 상품상세 페이지 내 상품 브랜드 이름',
    examples: ['설화수', '헤라', '라네즈', 'SULWHASOO'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    condition: '상품 상세 페이지 내 모든 이벤트',
    extractionMethods: ['SCREEN_OCR', 'DATA_LAYER', 'GTM_VARIABLE', 'JSON_LD'],
    gtmMapping: {
      variableName: 'JS - Product Brandname with View Item',
      variableType: 'jsm',
      valueSource: '브랜드명 추출',
    },
    crawlingConfig: {
      selector: '[class*="brand-name"], [itemprop="brand"] [itemprop="name"], a[href*="/brand/"]',
    },
    visionHint: {
      locationHint: '상품명 위 또는 옆의 브랜드 로고/텍스트',
      contextHint: '브랜드 로고 이미지나 브랜드명 링크',
      priority: 2,
    },
  },
  {
    id: 47,
    key: 'product_brandcode',
    displayName: '제품상세_제품 브랜드코드',
    description: '조회한 상품상세 페이지 내 상품 브랜드 코드',
    examples: ['11117', '11107'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    condition: '상품 상세 페이지 내 모든 이벤트',
    extractionMethods: ['DATA_LAYER', 'GTM_VARIABLE', 'GLOBAL_VARIABLE'],
    gtmMapping: {
      variableName: 'JS - Product Brandcode with View Item',
      variableType: 'jsm',
      valueSource: '브랜드 코드 추출',
    },
  },
  {
    id: 48,
    key: 'product_is_stock',
    displayName: '제품상세_재고유무',
    description: '조회한 상품상세 페이지 내 상품 재고 여부',
    examples: ['Y', 'N'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    condition: '상품 상세 페이지 내 모든 이벤트',
    extractionMethods: ['SCREEN_ELEMENT', 'DATA_LAYER', 'GTM_VARIABLE'],
    gtmMapping: {
      variableName: 'JS - Product Is Stock with View Item',
      variableType: 'jsm',
      valueSource: '재고 상태 확인',
    },
    validationRules: [
      { type: 'enum', value: ['Y', 'N'] },
    ],
    visionHint: {
      locationHint: '구매 버튼 영역 또는 상품 정보 영역',
      contextHint: '"품절", "일시품절", "SOLD OUT" 텍스트가 있으면 N, 없으면 Y',
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 리뷰 파라미터 (49-53)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 49,
    key: 'review_product_name',
    displayName: '리뷰_제품 이름',
    description: '리뷰한 제품명',
    examples: ['설화수 자음생크림', '라네즈 워터뱅크 크림'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['write_review'],
    extractionMethods: ['DATA_LAYER', 'SCREEN_OCR'],
  },
  {
    id: 50,
    key: 'review_product_code',
    displayName: '리뷰_제품 코드',
    description: '리뷰한 제품 코드',
    examples: ['110640000675'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['write_review'],
    extractionMethods: ['DATA_LAYER', 'URL_PARAMETER'],
  },
  {
    id: 51,
    key: 'review_product_rating',
    displayName: '리뷰_제품 평점',
    description: '리뷰한 제품 점수',
    examples: ['5', '4', '3'],
    scope: 'event',
    type: 'CD',
    dataType: 'number',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['write_review'],
    extractionMethods: ['DATA_LAYER', 'SCREEN_OCR', 'DOM_ATTRIBUTE'],
    validationRules: [
      { type: 'range', value: [1, 5], message: '평점은 1-5 사이여야 합니다' },
    ],
    visionHint: {
      locationHint: '별점 표시 영역',
      contextHint: '채워진 별의 개수 또는 숫자 평점',
    },
  },
  {
    id: 52,
    key: 'review_product_picture',
    displayName: '리뷰_제품사진 유무',
    description: '리뷰 때 업로드한 이미지 개수',
    examples: ['0', '1', '3'],
    scope: 'event',
    type: 'CD',
    dataType: 'number',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['write_review'],
    extractionMethods: ['DATA_LAYER', 'COMPUTED'],
  },
  {
    id: 53,
    key: 'review_product_content',
    displayName: '리뷰_리뷰 내용',
    description: '리뷰 내용',
    examples: ['정말 좋은 제품이에요. 피부가 촉촉해졌어요.'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['write_review'],
    extractionMethods: ['DATA_LAYER'],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 기타 공통 파라미터 (54-55)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 54,
    key: 'user_agent',
    displayName: '고객_유저에이전트',
    description: '유저 에이전트 값',
    examples: ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    condition: '웹/웹뷰에서만 전송',
    extractionMethods: ['AUTO_COLLECTED', 'GLOBAL_VARIABLE'],
  },
  {
    id: 55,
    key: 'is_hybrid',
    displayName: '페이지_웹뷰유무',
    description: '하이브리드 웹뷰에서 전송된 이벤트인 경우 "Y" 전송, 네이티브 영역에서 전송된 이벤트인 경우 "N" 전송',
    examples: ['Y', 'N'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    condition: '웹뷰에서만 전송',
    extractionMethods: ['GTM_VARIABLE', 'GLOBAL_VARIABLE'],
    validationRules: [
      { type: 'enum', value: ['Y', 'N'] },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 체크아웃 파라미터 (56-57)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 56,
    key: 'checkout_seq',
    displayName: '체크아웃_단계순서',
    description: '체크아웃 순서 - 1: 장바구니 로드, 2: 구매버튼 클릭, 3: 주문서 로드, 4: 결제하기 클릭',
    examples: ['1', '2', '3', '4'],
    scope: 'event',
    type: 'CD',
    dataType: 'number',
    siteTypes: ['E'],
    eventsWith: ['begin_checkout'],
    extractionMethods: ['DATA_LAYER', 'GTM_VARIABLE', 'INFERENCE'],
    validationRules: [
      { type: 'enum', value: ['1', '2', '3', '4'] },
    ],
    visionHint: {
      locationHint: '페이지 타입으로 추론',
      contextHint: '장바구니=1, 구매버튼=2, 주문서=3, 결제=4',
    },
  },
  {
    id: 57,
    key: 'checkout_step',
    displayName: '체크아웃_단계명',
    description: '체크아웃 옵션 - cartpage/cartbtn/prdbtn/plpbtn/orderpage/orderbtn',
    examples: ['cartpage', 'cartbtn', 'prdbtn', 'plpbtn', 'orderpage', 'orderbtn'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E'],
    eventsWith: ['begin_checkout'],
    extractionMethods: ['DATA_LAYER', 'GTM_VARIABLE', 'INFERENCE'],
    validationRules: [
      { type: 'enum', value: ['cartpage', 'cartbtn', 'prdbtn', 'plpbtn', 'orderpage', 'orderbtn'] },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 결제/주문 파라미터 (58-66, 85-92)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 58,
    key: 'order_method',
    displayName: '결제_결제수단',
    description: '주문 시 선택한 결제 방법',
    examples: ['신용카드', 'AMORE Pay', '간편결제', '무통장입금', '휴대폰 결제'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E'],
    eventsWith: ['purchase'],
    extractionMethods: ['DATA_LAYER', 'SCREEN_OCR'],
    visionHint: {
      locationHint: '결제 수단 선택 영역',
      contextHint: '선택된 결제 방법 텍스트',
    },
  },
  {
    id: 59,
    key: 'order_coupon_code',
    displayName: '결제_쿠폰코드',
    description: '장바구니 쿠폰 코드 - 복수 쿠폰 사용 시, "|" 구분자 사용',
    examples: ['1233', '1233|4453'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E'],
    eventsWith: ['purchase'],
    extractionMethods: ['DATA_LAYER'],
  },
  {
    id: 62,
    key: 'currency',
    displayName: 'Currency',
    description: '통화 코드 (ISO)',
    examples: ['KRW', 'USD', 'JPY', 'CNY'],
    scope: 'event',
    type: 'D',
    dataType: 'iso_code',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['view_item', 'add_to_cart', 'begin_checkout', 'purchase', 'view_item_list', 'select_item'],
    condition: 'view_promotion, select_promotion 제외',
    extractionMethods: ['GTM_VARIABLE', 'INFERENCE', 'GLOBAL_VARIABLE'],
    gtmMapping: {
      variableName: 'JS - Currency',
      variableType: 'jsm',
      valueSource: '사이트 국가/언어 기반 통화 코드',
    },
    validationRules: [
      { type: 'pattern', value: '^[A-Z]{3}$', message: 'ISO 4217 형식이어야 합니다' },
    ],
    visionHint: {
      locationHint: '가격 표시 영역',
      textPattern: '₩|\\$|¥|원|USD|KRW',
      contextHint: '가격 앞의 통화 기호로 추론 (₩ → KRW, $ → USD)',
    },
  },
  {
    id: 63,
    key: 'transaction_id',
    displayName: 'Transaction ID',
    description: '거래 ID',
    examples: ['230913235089241', 'ORD-2023-12345'],
    scope: 'event',
    type: 'D',
    dataType: 'string',
    siteTypes: ['E'],
    eventsWith: ['purchase'],
    extractionMethods: ['DATA_LAYER', 'SCREEN_OCR', 'URL_PARAMETER'],
    visionHint: {
      locationHint: '주문 완료 페이지',
      textPattern: '주문번호|Order\\s*(ID|Number)',
      contextHint: '주문 완료 후 표시되는 주문번호',
    },
  },
  {
    id: 64,
    key: 'value',
    displayName: 'Value',
    description: '주문 금액 - 할인이 반영된 실제 주문 금액 전송',
    examples: ['26000', '150000', '88000'],
    scope: 'event',
    type: 'M',
    dataType: 'number',
    siteTypes: ['E'],
    eventsWith: ['view_item', 'add_to_cart', 'begin_checkout', 'purchase'],
    extractionMethods: ['DATA_LAYER', 'SCREEN_OCR', 'COMPUTED'],
    visionHint: {
      locationHint: '가격 표시 영역 (할인가 우선)',
      textPattern: '[\\d,]+\\s*(원|₩)',
      contextHint: '할인이 적용된 최종 가격 (빨간색 또는 강조된 가격)',
      priority: 1,
    },
  },
  {
    id: 65,
    key: 'coupon',
    displayName: 'Order coupon',
    description: '장바구니 쿠폰 이름 - 복수 쿠폰 사용 시, "|" 구분자 사용',
    examples: ['[아모레퍼시픽] 빈티지 5%|11월APP 5% 할인'],
    scope: 'event',
    type: 'D',
    dataType: 'string',
    siteTypes: ['E'],
    eventsWith: ['purchase'],
    extractionMethods: ['DATA_LAYER', 'SCREEN_OCR'],
  },
  {
    id: 66,
    key: 'shipping',
    displayName: 'Shipping amount',
    description: '배송비 - 결제 시 결제된 실제 배송비',
    examples: ['0', '2500', '3000'],
    scope: 'event',
    type: 'M',
    dataType: 'number',
    siteTypes: ['E'],
    eventsWith: ['purchase'],
    extractionMethods: ['DATA_LAYER', 'SCREEN_OCR'],
    visionHint: {
      locationHint: '주문 요약 영역',
      textPattern: '배송비|Shipping',
      contextHint: '배송비 금액 (무료배송이면 0)',
    },
  },
  {
    id: 85,
    key: 'order_giftcard_discount',
    displayName: '결제_기프트카드할인금액',
    description: '주문에 사용한 기프트카드 사용금액',
    examples: ['1000', '5000'],
    scope: 'event',
    type: 'CM',
    dataType: 'number',
    siteTypes: ['E'],
    eventsWith: ['purchase'],
    extractionMethods: ['DATA_LAYER'],
  },
  {
    id: 86,
    key: 'order_beauty_discount',
    displayName: '결제_뷰티포인트할인금액',
    description: '주문에 사용한 뷰티포인트 할인금액',
    examples: ['1000', '5000'],
    scope: 'event',
    type: 'CM',
    dataType: 'number',
    siteTypes: ['E'],
    eventsWith: ['purchase'],
    extractionMethods: ['DATA_LAYER'],
  },
  {
    id: 87,
    key: 'order_coupon_discount',
    displayName: '결제_쿠폰할인금액',
    description: '주문에 사용한 쿠폰할인금액',
    examples: ['1000', '10000'],
    scope: 'event',
    type: 'CM',
    dataType: 'number',
    siteTypes: ['E'],
    eventsWith: ['purchase'],
    extractionMethods: ['DATA_LAYER'],
  },
  {
    id: 88,
    key: 'order_mobile_discount',
    displayName: '결제_모바일상품권할인금액',
    description: '주문에 사용한 모바일 상품권 할인금액',
    examples: ['1000', '10000'],
    scope: 'event',
    type: 'CM',
    dataType: 'number',
    siteTypes: ['E'],
    eventsWith: ['purchase'],
    extractionMethods: ['DATA_LAYER'],
  },
  {
    id: 89,
    key: 'order_member_discount',
    displayName: '결제_임직원 할인금액',
    description: '주문에 사용한 임직원 할인금액',
    examples: ['1000', '5000'],
    scope: 'event',
    type: 'CM',
    dataType: 'number',
    siteTypes: ['E'],
    eventsWith: ['purchase'],
    extractionMethods: ['DATA_LAYER'],
  },
  {
    id: 90,
    key: 'order_total_discount',
    displayName: '결제_총할인금액',
    description: '주문에 적용된 총 할인금액',
    examples: ['1000', '15000'],
    scope: 'event',
    type: 'CM',
    dataType: 'number',
    siteTypes: ['E'],
    eventsWith: ['purchase'],
    extractionMethods: ['DATA_LAYER', 'COMPUTED'],
  },
  {
    id: 91,
    key: 'order_total_amount',
    displayName: '결제_총결제금액',
    description: '총 주문금액(할인을 적용하지 않은)',
    examples: ['50000', '150000'],
    scope: 'event',
    type: 'CM',
    dataType: 'number',
    siteTypes: ['E'],
    eventsWith: ['purchase'],
    extractionMethods: ['DATA_LAYER', 'COMPUTED'],
  },
  {
    id: 92,
    key: 'order_beauty_accumulated',
    displayName: '결제_뷰티포인트 적립금',
    description: '뷰티포인트 적립금액',
    examples: ['1000', '3000'],
    scope: 'event',
    type: 'CM',
    dataType: 'number',
    siteTypes: ['E'],
    eventsWith: ['purchase'],
    extractionMethods: ['DATA_LAYER', 'SCREEN_OCR'],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 아이템 파라미터 (60-61, 67-84, 93-94)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 60,
    key: 'apg_brand_code',
    displayName: '제품_APG그룹코드',
    description: '아모레퍼시픽 그룹 차원에서 사용하는 브랜드 코드로써 SAP에서 사용하는 SKU 코드의 앞 5자리',
    examples: ['11117', '11107', '11176'],
    scope: 'item',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['view_item', 'add_to_cart', 'begin_checkout', 'purchase', 'view_item_list', 'select_item'],
    condition: 'view_promotion, select_promotion 제외',
    extractionMethods: ['DATA_LAYER', 'GTM_VARIABLE', 'COMPUTED'],
    validationRules: [
      { type: 'pattern', value: '^\\d{5}$', message: '5자리 숫자여야 합니다' },
    ],
  },
  {
    id: 61,
    key: 'coupon_code',
    displayName: '제품_쿠폰코드',
    description: '상품 쿠폰 코드 - 결제 시 사용된 상품 쿠폰 코드 전송. 복수 쿠폰 사용 시, "|" 구분자 사용',
    examples: ['1233', '1233|4453'],
    scope: 'item',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E'],
    eventsWith: ['purchase'],
    extractionMethods: ['DATA_LAYER'],
  },
  {
    id: 67,
    key: 'promotion_id',
    displayName: 'Item promotion ID',
    description: '프로모션 ID',
    examples: ['9674', 'PROMO_2023_HOLIDAY'],
    scope: 'item',
    type: 'D',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['view_promotion', 'select_promotion'],
    extractionMethods: ['DATA_LAYER', 'DOM_ATTRIBUTE'],
  },
  {
    id: 68,
    key: 'promotion_name',
    displayName: 'Item promotion name',
    description: '프로모션 이름',
    examples: ['쇼핑홀리데이 in 아모레몰 (9.22~9.24)', '연말 특별 할인전'],
    scope: 'item',
    type: 'D',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['view_promotion', 'select_promotion'],
    extractionMethods: ['DATA_LAYER', 'SCREEN_OCR'],
    visionHint: {
      locationHint: '배너 또는 프로모션 영역',
      contextHint: '프로모션/이벤트 제목 텍스트',
    },
  },
  {
    id: 69,
    key: 'creative_slot',
    displayName: 'Item promotion creative slot',
    description: '프로모션 게재 위치',
    examples: ['메인 배너', 'GNB 배너', '상품 상세 배너'],
    scope: 'item',
    type: 'D',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['view_promotion', 'select_promotion'],
    extractionMethods: ['DATA_LAYER', 'INFERENCE'],
    visionHint: {
      locationHint: '배너 위치',
      contextHint: '배너가 표시된 페이지 영역 (메인, GNB, 사이드바 등)',
    },
  },
  {
    id: 70,
    key: 'item_id',
    displayName: 'Item Id',
    description: '상품 ID (SKU)',
    examples: ['110640000675', '111170002462'],
    scope: 'item',
    type: 'D',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['view_item', 'add_to_cart', 'begin_checkout', 'purchase', 'view_item_list', 'select_item'],
    condition: 'view_promotion, select_promotion 제외',
    extractionMethods: ['URL_PARAMETER', 'DATA_LAYER', 'DOM_ATTRIBUTE', 'JSON_LD'],
    crawlingConfig: {
      selector: '[data-product-id], [data-sku], [itemprop="sku"]',
      attribute: 'data-product-id',
    },
    visionHint: {
      locationHint: 'URL 파라미터 (onlineProdCode, productId 등)',
      contextHint: 'URL에서 상품 코드/ID 추출',
      priority: 1,
    },
  },
  {
    id: 71,
    key: 'item_name',
    displayName: 'Item Name',
    description: '상품 이름',
    examples: ['탄력케어 에센셜 리추얼(탄력에센셜3종)', '설화수 자음생크림'],
    scope: 'item',
    type: 'D',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['view_item', 'add_to_cart', 'begin_checkout', 'purchase', 'view_item_list', 'select_item'],
    condition: 'view_promotion, select_promotion 제외',
    extractionMethods: ['SCREEN_OCR', 'DATA_LAYER', 'JSON_LD', 'DOM_META'],
    crawlingConfig: {
      selector: 'h1[class*="product"], [itemprop="name"], .product-name',
    },
    visionHint: {
      locationHint: '상품 정보 영역의 제목',
      textPattern: '.+',
      contextHint: '가장 눈에 띄는 상품명 텍스트',
      priority: 1,
    },
  },
  {
    id: 72,
    key: 'quantity',
    displayName: 'Item quantity',
    description: '상품 수량',
    examples: ['1', '2', '5'],
    scope: 'item',
    type: 'M',
    dataType: 'number',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['view_item', 'add_to_cart', 'begin_checkout', 'purchase', 'view_item_list', 'select_item'],
    condition: 'view_promotion, select_promotion 제외',
    extractionMethods: ['SCREEN_OCR', 'DATA_LAYER', 'DOM_ATTRIBUTE'],
    crawlingConfig: {
      selector: 'input[name="quantity"], [class*="quantity"] input',
      attribute: 'value',
      transform: 'number',
    },
    visionHint: {
      locationHint: '수량 선택 영역',
      textPattern: '\\d+',
      contextHint: '- / + 버튼 사이의 숫자 또는 수량 입력창',
    },
  },
  {
    id: 73,
    key: 'price',
    displayName: 'Item revenue',
    description: '단일 상품 가격',
    examples: ['88000', '150000', '32000'],
    scope: 'item',
    type: 'M',
    dataType: 'number',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['view_item', 'add_to_cart', 'begin_checkout', 'purchase', 'view_item_list', 'select_item'],
    condition: 'view_promotion, select_promotion 제외',
    extractionMethods: ['SCREEN_OCR', 'DATA_LAYER', 'JSON_LD'],
    crawlingConfig: {
      selector: '[class*="price"]:not([class*="original"]), [itemprop="price"]',
      transform: 'extractNumber',
    },
    visionHint: {
      locationHint: '가격 표시 영역 (할인가 우선)',
      textPattern: '[\\d,]+\\s*(원|₩)',
      contextHint: '빨간색 또는 강조된 현재 판매가',
      priority: 1,
    },
  },
  {
    id: 74,
    key: 'item_brand',
    displayName: 'Item Brand',
    description: '상품 브랜드 이름',
    examples: ['설화수', '헤라', '라네즈', 'SULWHASOO'],
    scope: 'item',
    type: 'D',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['view_item', 'add_to_cart', 'begin_checkout', 'purchase', 'view_item_list', 'select_item'],
    condition: 'view_promotion, select_promotion 제외',
    extractionMethods: ['SCREEN_OCR', 'DATA_LAYER', 'JSON_LD', 'DOM_ATTRIBUTE'],
    crawlingConfig: {
      selector: '[itemprop="brand"] [itemprop="name"], .brand-name, a[href*="/brand/"]',
    },
    visionHint: {
      locationHint: '상품명 위 또는 옆의 브랜드 영역',
      contextHint: '브랜드 로고나 브랜드명 텍스트 링크',
      priority: 2,
    },
  },
  {
    id: 75,
    key: 'item_variant',
    displayName: 'Item variant',
    description: '상품 옵션',
    examples: ['50ml', '100ml', '21호 바닐라', 'Red'],
    scope: 'item',
    type: 'D',
    dataType: 'string',
    siteTypes: ['E'],
    eventsWith: ['begin_checkout', 'purchase'],
    extractionMethods: ['SCREEN_OCR', 'DATA_LAYER', 'DOM_ATTRIBUTE'],
    crawlingConfig: {
      selector: 'select[name*="option"] option:checked, [class*="selected-option"]',
    },
    visionHint: {
      locationHint: '옵션 선택 영역',
      contextHint: '선택된 옵션 값 (사이즈, 색상 등)',
    },
  },
  {
    id: 76,
    key: 'item_category',
    displayName: 'Item category',
    description: '상품 카테고리 1DEPTH',
    examples: ['메이크업', '스킨케어', '바디케어'],
    scope: 'item',
    type: 'D',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['view_item', 'add_to_cart', 'begin_checkout', 'purchase', 'view_item_list', 'select_item'],
    condition: 'view_promotion, select_promotion 제외',
    extractionMethods: ['DATA_LAYER', 'GTM_VARIABLE', 'SCREEN_OCR'],
    visionHint: {
      locationHint: '브레드크럼 또는 카테고리 영역',
      contextHint: '1차 카테고리 (가장 상위 카테고리)',
    },
  },
  {
    id: 77,
    key: 'item_category2',
    displayName: 'Item category2',
    description: '상품 카테고리 2DEPTH',
    examples: ['립', '스페셜케어', '핸드케어'],
    scope: 'item',
    type: 'D',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['view_item', 'add_to_cart', 'begin_checkout', 'purchase', 'view_item_list', 'select_item'],
    condition: 'view_promotion, select_promotion 제외',
    extractionMethods: ['DATA_LAYER', 'GTM_VARIABLE'],
  },
  {
    id: 78,
    key: 'item_category3',
    displayName: 'Item category3',
    description: '상품 카테고리 3DEPTH',
    examples: ['립스틱', '마스크 & 팩', '핸드크림'],
    scope: 'item',
    type: 'D',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['view_item', 'add_to_cart', 'begin_checkout', 'purchase', 'view_item_list', 'select_item'],
    condition: 'view_promotion, select_promotion 제외',
    extractionMethods: ['DATA_LAYER', 'GTM_VARIABLE'],
  },
  {
    id: 79,
    key: 'item_category4',
    displayName: 'Item category4',
    description: '상품 카테고리 4DEPTH',
    examples: ['시트마스크', '워시오프팩'],
    scope: 'item',
    type: 'D',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['view_item', 'add_to_cart', 'begin_checkout', 'purchase', 'view_item_list', 'select_item'],
    condition: 'view_promotion, select_promotion 제외',
    extractionMethods: ['DATA_LAYER', 'GTM_VARIABLE'],
  },
  {
    id: 80,
    key: 'item_category5',
    displayName: 'Item category5',
    description: '상품 카테고리 5DEPTH',
    examples: ['-'],
    scope: 'item',
    type: 'D',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['view_item', 'add_to_cart', 'begin_checkout', 'purchase', 'view_item_list', 'select_item'],
    condition: 'view_promotion, select_promotion 제외',
    extractionMethods: ['DATA_LAYER', 'GTM_VARIABLE'],
  },
  {
    id: 81,
    key: 'item_coupon',
    displayName: 'Item coupon',
    description: '상품 쿠폰 이름 - 결제 시 사용된 상품 쿠폰 이름 전송. 복수 쿠폰 사용 시, "|" 구분자 사용',
    examples: ['상품쿠폰이름1|상품쿠폰이름2'],
    scope: 'item',
    type: 'D',
    dataType: 'string',
    siteTypes: ['E'],
    eventsWith: ['purchase'],
    extractionMethods: ['DATA_LAYER'],
  },
  {
    id: 82,
    key: 'discount',
    displayName: 'Item discount amount',
    description: '상품 할인 금액',
    examples: ['0', '4000', '10000'],
    scope: 'item',
    type: 'M',
    dataType: 'number',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['view_item', 'add_to_cart', 'begin_checkout', 'purchase', 'view_item_list', 'select_item'],
    condition: 'view_promotion, select_promotion 제외',
    extractionMethods: ['COMPUTED', 'DATA_LAYER', 'SCREEN_OCR'],
    visionHint: {
      locationHint: '할인 정보 영역',
      textPattern: '-?[\\d,]+\\s*(원|₩)|\\d+%',
      contextHint: '정가 - 판매가 = 할인금액, 또는 할인율/할인금액 표시',
    },
  },
  {
    id: 83,
    key: 'index',
    displayName: 'Item list position',
    description: 'item_list 영역 내에서 상품이 노출 또는 클릭된 위치',
    examples: ['1', '2', '9', '10'],
    scope: 'item',
    type: 'D',
    dataType: 'number',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['view_item_list', 'select_item'],
    extractionMethods: ['DATA_LAYER', 'DOM_ATTRIBUTE', 'COMPUTED'],
    validationRules: [
      { type: 'range', value: [1, 1000], message: '유효한 위치 값이어야 합니다' },
    ],
  },
  {
    id: 84,
    key: 'item_list_name',
    displayName: 'Item list name',
    description: '상품이 노출 또는 클릭된 영역',
    examples: ['SEARCH', 'BEST_SELLER', 'RECOMMENDATION', 'CATEGORY'],
    scope: 'item',
    type: 'D',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['view_item_list', 'select_item'],
    extractionMethods: ['DATA_LAYER', 'INFERENCE'],
    visionHint: {
      locationHint: '상품 목록 영역',
      contextHint: '상품 목록의 제목이나 영역 이름',
    },
  },
  {
    id: 93,
    key: 'item_beauty_acc',
    displayName: '제품_뷰티포인트 적립금액',
    description: '상품 단위 뷰티포인트 적립 금액',
    examples: ['1000', '500'],
    scope: 'item',
    type: 'CM',
    dataType: 'number',
    siteTypes: ['E'],
    eventsWith: ['purchase'],
    extractionMethods: ['DATA_LAYER'],
    notes: '현재는 item 범위 custom metric이 지원되지 않음',
  },
  {
    id: 94,
    key: 'original_price',
    displayName: '제품_정상가',
    description: '할인이 반영되지 않은 상품 금액',
    examples: ['50000', '135000'],
    scope: 'item',
    type: 'CM',
    dataType: 'number',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['view_item', 'add_to_cart', 'begin_checkout', 'purchase', 'view_item_list', 'select_item'],
    condition: 'view_promotion, select_promotion 제외',
    extractionMethods: ['SCREEN_OCR', 'DATA_LAYER'],
    crawlingConfig: {
      selector: '[class*="original-price"], [class*="regular-price"], del',
      transform: 'extractNumber',
    },
    visionHint: {
      locationHint: '가격 영역 (취소선이 있는 가격)',
      textPattern: '[\\d,]+\\s*(원|₩)',
      contextHint: '취소선이 그어진 원래 가격',
    },
    notes: '현재는 item 범위 custom metric이 지원되지 않음',
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 클릭 체류시간 파라미터 (95-105)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 95,
    key: 'click_duration_0',
    displayName: '클릭_체류시간_0',
    description: '해당 스크롤 위치에서 머문 시간(초 단위) - 0% 구간',
    examples: ['0', '1', '2', '3'],
    scope: 'event',
    type: 'CM',
    dataType: 'number',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['click_with_duration'],
    extractionMethods: ['DATA_LAYER'],
  },
  // ... 96-105는 유사한 패턴 (click_duration_10 ~ click_duration_100)

  // ─────────────────────────────────────────────────────────────────────────────
  // 기타 파라미터 (106, 108)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 106,
    key: 'loading_time_sec',
    displayName: '페이지_로딩시간',
    description: '페이지 로드 시간(초 단위)',
    examples: ['1.14', '2.5', '0.8'],
    scope: 'event',
    type: 'CM',
    dataType: 'number',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['page_load_time'],
    extractionMethods: ['AUTO_COLLECTED', 'COMPUTED'],
  },
  {
    id: 108,
    key: 'removal_type',
    displayName: '장바구니_제품제거_타입',
    description: '삭제 선택 범위 (일부 / 전체)',
    examples: ['partial', 'all'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E'],
    eventsWith: ['remove_from_cart'],
    extractionMethods: ['DATA_LAYER', 'USER_ACTION'],
    validationRules: [
      { type: 'enum', value: ['partial', 'all'] },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 동영상 파라미터 (110-112)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 110,
    key: 'video_url',
    displayName: '동영상 URL',
    description: '재생 동영상 URL',
    examples: ['https://www.youtube.com/watch?list=TLGGX....'],
    scope: 'event',
    type: 'CD',
    dataType: 'url',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['video_start', 'video_progress', 'video_complete'],
    extractionMethods: ['DATA_LAYER', 'DOM_ATTRIBUTE'],
    crawlingConfig: {
      selector: 'video source, iframe[src*="youtube"], iframe[src*="vimeo"]',
      attribute: 'src',
    },
  },
  {
    id: 111,
    key: 'video_title',
    displayName: '동영상 제목',
    description: '재생 동영상 제목',
    examples: ['저스트 메이크업 | 티저 예고편 |쿠팡플레이 | 쿠팡'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['video_start', 'video_progress', 'video_complete'],
    extractionMethods: ['DATA_LAYER', 'DOM_ATTRIBUTE', 'SCREEN_OCR'],
    visionHint: {
      locationHint: '동영상 플레이어 하단 또는 상단',
      contextHint: '동영상 제목 텍스트',
    },
  },
  {
    id: 112,
    key: 'video_provider',
    displayName: '동영상 제공업체',
    description: '재생 동영상 제공업체',
    examples: ['youtube', 'vimeo', 'self-hosted'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['video_start', 'video_progress', 'video_complete'],
    extractionMethods: ['DATA_LAYER', 'INFERENCE'],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 피부 고민 파라미터 (107) - BTS 에스트라 한정
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 107,
    key: 'skin_concerns',
    displayName: '사이트_피부고민',
    description: '피부 고민',
    examples: ['모공탄력', '눈가주름', '건조함'],
    scope: 'event',
    type: 'CD',
    dataType: 'string',
    siteTypes: ['E', 'B', 'O'],
    eventsWith: ['*'],
    extractionMethods: ['DATA_LAYER', 'SCREEN_OCR'],
    notes: 'BTS 에스트라에 한정됨',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// 이벤트별 파라미터 요구사항
// ═══════════════════════════════════════════════════════════════════════════════

export const EVENT_PARAMETER_REQUIREMENTS: EventParameterRequirement[] = [
  {
    eventName: 'view_item',
    displayName: '상품 상세 보기',
    description: '사용자가 상품 상세 페이지를 조회할 때 발생',
    requiredParams: ['currency', 'value'],
    optionalParams: ['event_category', 'event_action', 'event_label', 'product_id', 'product_name', 'product_category', 'product_brandname', 'product_brandcode', 'product_is_stock'],
    itemParams: ['item_id', 'item_name', 'item_brand', 'price', 'item_category', 'item_category2', 'item_category3', 'item_category4', 'item_category5', 'apg_brand_code', 'discount', 'original_price'],
    siteTypes: ['E', 'B'],
  },
  {
    eventName: 'add_to_cart',
    displayName: '장바구니 담기',
    description: '사용자가 상품을 장바구니에 추가할 때 발생',
    requiredParams: ['currency', 'value'],
    optionalParams: ['event_category', 'event_action', 'event_label'],
    itemParams: ['item_id', 'item_name', 'item_brand', 'price', 'quantity', 'item_category', 'item_category2', 'item_category3', 'item_category4', 'item_category5', 'item_variant', 'apg_brand_code', 'discount', 'original_price'],
    siteTypes: ['E'],
  },
  {
    eventName: 'view_item_list',
    displayName: '상품 목록 보기',
    description: '사용자가 상품 목록을 조회할 때 발생',
    requiredParams: [],
    optionalParams: ['search_term', 'search_type', 'search_resultcount', 'search_result', 'search_item_resultcount', 'item_list_name'],
    itemParams: ['item_id', 'item_name', 'item_brand', 'price', 'index', 'item_category', 'apg_brand_code'],
    siteTypes: ['E', 'B'],
  },
  {
    eventName: 'select_item',
    displayName: '상품 선택',
    description: '사용자가 목록에서 상품을 선택(클릭)할 때 발생',
    requiredParams: [],
    optionalParams: ['item_list_name'],
    itemParams: ['item_id', 'item_name', 'item_brand', 'price', 'index', 'item_category', 'apg_brand_code'],
    siteTypes: ['E', 'B'],
  },
  {
    eventName: 'begin_checkout',
    displayName: '결제 시작',
    description: '사용자가 결제 프로세스를 시작할 때 발생',
    requiredParams: ['currency', 'value'],
    optionalParams: ['checkout_seq', 'checkout_step', 'event_category', 'event_action'],
    itemParams: ['item_id', 'item_name', 'item_brand', 'price', 'quantity', 'item_variant', 'item_category', 'item_category2', 'item_category3', 'item_category4', 'item_category5', 'apg_brand_code', 'discount'],
    siteTypes: ['E'],
  },
  {
    eventName: 'purchase',
    displayName: '구매 완료',
    description: '사용자가 구매를 완료했을 때 발생',
    requiredParams: ['currency', 'value', 'transaction_id'],
    optionalParams: ['coupon', 'shipping', 'order_method', 'order_coupon_code', 'order_giftcard_discount', 'order_beauty_discount', 'order_coupon_discount', 'order_mobile_discount', 'order_member_discount', 'order_total_discount', 'order_total_amount', 'order_beauty_accumulated'],
    itemParams: ['item_id', 'item_name', 'item_brand', 'price', 'quantity', 'item_variant', 'item_category', 'item_category2', 'item_category3', 'item_category4', 'item_category5', 'item_coupon', 'coupon_code', 'apg_brand_code', 'discount', 'item_beauty_acc', 'original_price'],
    siteTypes: ['E'],
  },
  {
    eventName: 'view_promotion',
    displayName: '프로모션 노출',
    description: '프로모션이 사용자에게 노출될 때 발생',
    requiredParams: [],
    optionalParams: [],
    itemParams: ['promotion_id', 'promotion_name', 'creative_slot'],
    siteTypes: ['E', 'B', 'O'],
  },
  {
    eventName: 'select_promotion',
    displayName: '프로모션 선택',
    description: '사용자가 프로모션을 클릭할 때 발생',
    requiredParams: [],
    optionalParams: [],
    itemParams: ['promotion_id', 'promotion_name', 'creative_slot'],
    siteTypes: ['E', 'B', 'O'],
  },
  {
    eventName: 'remove_from_cart',
    displayName: '장바구니에서 제거',
    description: '사용자가 장바구니에서 상품을 제거할 때 발생',
    requiredParams: ['currency', 'value'],
    optionalParams: ['removal_type'],
    itemParams: ['item_id', 'item_name', 'item_brand', 'price', 'quantity'],
    siteTypes: ['E'],
  },
  {
    eventName: 'view_search_results',
    displayName: '검색 결과 보기',
    description: '사용자가 검색 결과를 조회할 때 발생',
    requiredParams: ['search_term'],
    optionalParams: ['search_type', 'search_resultcount', 'search_result', 'search_item_resultcount'],
    itemParams: ['item_id', 'item_name', 'item_brand', 'price', 'index'],
    siteTypes: ['E', 'B'],
  },
  {
    eventName: 'write_review',
    displayName: '리뷰 작성',
    description: '사용자가 상품 리뷰를 작성할 때 발생',
    requiredParams: ['review_product_code'],
    optionalParams: ['review_product_name', 'review_product_rating', 'review_product_picture', 'review_product_content'],
    siteTypes: ['E', 'B'],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// 헬퍼 함수
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 파라미터 키로 정의 찾기
 */
export function getParameterByKey(key: string): GA4ParameterDefinition | undefined {
  return GA4_PARAMETERS.find(p => p.key === key);
}

/**
 * 이벤트명으로 필요한 파라미터 목록 가져오기
 */
export function getParametersForEvent(eventName: string): {
  required: GA4ParameterDefinition[];
  optional: GA4ParameterDefinition[];
  item: GA4ParameterDefinition[];
} {
  const requirement = EVENT_PARAMETER_REQUIREMENTS.find(r => r.eventName === eventName);

  if (!requirement) {
    // 공통 파라미터만 반환
    const commonParams = GA4_PARAMETERS.filter(p => p.eventsWith.includes('*'));
    return {
      required: [],
      optional: commonParams,
      item: [],
    };
  }

  return {
    required: requirement.requiredParams.map(key => getParameterByKey(key)).filter(Boolean) as GA4ParameterDefinition[],
    optional: requirement.optionalParams.map(key => getParameterByKey(key)).filter(Boolean) as GA4ParameterDefinition[],
    item: (requirement.itemParams || []).map(key => getParameterByKey(key)).filter(Boolean) as GA4ParameterDefinition[],
  };
}

/**
 * 화면에서 추출 가능한 파라미터 필터링
 */
export function getScreenExtractableParams(eventName: string): GA4ParameterDefinition[] {
  const { required, optional, item } = getParametersForEvent(eventName);
  const allParams = [...required, ...optional, ...item];

  return allParams.filter(p =>
    p.extractionMethods.includes('SCREEN_OCR') ||
    p.extractionMethods.includes('SCREEN_ELEMENT')
  );
}

/**
 * Vision AI 프롬프트용 파라미터 힌트 생성
 */
export function generateVisionPromptForEvent(eventName: string): string {
  const screenParams = getScreenExtractableParams(eventName);

  const lines: string[] = [
    `## ${eventName} 이벤트 파라미터 추출 가이드`,
    '',
    '### 화면에서 추출해야 할 파라미터:',
    '',
  ];

  for (const param of screenParams) {
    if (param.visionHint) {
      lines.push(`**${param.key}** (${param.displayName})`);
      lines.push(`  - 설명: ${param.description}`);
      lines.push(`  - 위치: ${param.visionHint.locationHint}`);
      if (param.visionHint.contextHint) {
        lines.push(`  - 힌트: ${param.visionHint.contextHint}`);
      }
      if (param.visionHint.textPattern) {
        lines.push(`  - 패턴: ${param.visionHint.textPattern}`);
      }
      lines.push(`  - 예시: ${param.examples.slice(0, 3).join(', ')}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * 특정 스코프의 파라미터만 필터링
 */
export function getParametersByScope(scope: ParameterScope): GA4ParameterDefinition[] {
  return GA4_PARAMETERS.filter(p => p.scope === scope);
}

/**
 * 사이트 타입별 파라미터 필터링
 */
export function getParametersForSiteType(siteType: SiteType): GA4ParameterDefinition[] {
  return GA4_PARAMETERS.filter(p => p.siteTypes.includes(siteType));
}

/**
 * 검증 규칙 적용
 */
export function validateParameterValue(
  paramKey: string,
  value: unknown
): { valid: boolean; errors: string[] } {
  const param = getParameterByKey(paramKey);
  if (!param) {
    return { valid: false, errors: [`Unknown parameter: ${paramKey}`] };
  }

  const errors: string[] = [];

  if (!param.validationRules) {
    return { valid: true, errors: [] };
  }

  for (const rule of param.validationRules) {
    switch (rule.type) {
      case 'required':
        if (value === undefined || value === null || value === '') {
          errors.push(rule.message || `${paramKey} is required`);
        }
        break;

      case 'enum':
        if (Array.isArray(rule.value)) {
          const enumValues = rule.value as string[];
          if (!enumValues.includes(String(value))) {
            errors.push(rule.message || `${paramKey} must be one of: ${enumValues.join(', ')}`);
          }
        }
        break;

      case 'pattern':
        if (typeof rule.value === 'string') {
          const regex = new RegExp(rule.value);
          if (!regex.test(String(value))) {
            errors.push(rule.message || `${paramKey} does not match pattern: ${rule.value}`);
          }
        }
        break;

      case 'range':
        if (Array.isArray(rule.value) && rule.value.length === 2) {
          const numValue = Number(value);
          const [min, max] = rule.value as [number, number];
          if (isNaN(numValue) || numValue < min || numValue > max) {
            errors.push(rule.message || `${paramKey} must be between ${min} and ${max}`);
          }
        }
        break;

      case 'length':
        if (Array.isArray(rule.value) && rule.value.length === 2) {
          const strValue = String(value);
          const [min, max] = rule.value as [number, number];
          if (strValue.length < min || strValue.length > max) {
            errors.push(rule.message || `${paramKey} length must be between ${min} and ${max}`);
          }
        }
        break;
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 크롤링 설정이 있는 파라미터 가져오기
 */
export function getCrawlableParameters(): GA4ParameterDefinition[] {
  return GA4_PARAMETERS.filter(p => p.crawlingConfig !== undefined);
}

/**
 * GTM 매핑이 있는 파라미터 가져오기
 */
export function getGTMMappedParameters(): GA4ParameterDefinition[] {
  return GA4_PARAMETERS.filter(p => p.gtmMapping !== undefined);
}
