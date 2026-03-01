/**
 * GTM Container Export JSON 타입 정의 (GTM Container Types)
 *
 * Google Tag Manager 컨테이너 내보내기 JSON 파일의 구조를 정의합니다.
 * 2차 QA에서 검증 대상 이벤트/파라미터 목록을 GTM에서 추출합니다.
 *
 * @description
 * - 용도: 2차 QA 검증 대상 이벤트/파라미터 목록 추출
 * - 입력: GTM Container Export JSON
 * - 출력: GTMParsedData (parsed-inputs.ts)
 *
 * @version 1.0
 */

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: GTM Container Root Structure
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GTM Container Export JSON 루트 구조
 */
export interface GTMContainer {
  /** Export 형식 버전 */
  exportFormatVersion: number;
  /** Export 시간 (ISO 8601) */
  exportTime: string;
  /** 컨테이너 버전 정보 */
  containerVersion: GTMContainerVersion;
}

/**
 * GTM 컨테이너 버전 정보
 */
export interface GTMContainerVersion {
  /** 계정 ID */
  accountId: string;
  /** 컨테이너 ID */
  containerId: string;
  /** 컨테이너 버전 ID */
  containerVersionId: string;
  /** 컨테이너 메타정보 */
  container: GTMContainerMeta;
  /** 태그 목록 */
  tag?: GTMTag[];
  /** 트리거 목록 */
  trigger?: GTMTrigger[];
  /** 변수 목록 */
  variable?: GTMVariable[];
  /** 내장 변수 목록 */
  builtInVariable?: GTMBuiltInVariable[];
  /** 폴더 목록 */
  folder?: GTMFolder[];
  /** 커스텀 템플릿 목록 */
  customTemplate?: GTMCustomTemplate[];
  /** 수정 시간 */
  fingerprint: string;
  /** 태그 매니저 URL */
  tagManagerUrl: string;
}

/**
 * GTM 컨테이너 메타정보
 */
export interface GTMContainerMeta {
  /** 계정 ID */
  accountId: string;
  /** 컨테이너 ID */
  containerId: string;
  /** 컨테이너 이름 */
  name: string;
  /** 공개 ID (GTM-XXXXXX) */
  publicId: string;
  /** 사용 컨텍스트 */
  usageContext: GTMUsageContext[];
  /** 수정 시간 */
  fingerprint: string;
  /** 태그 매니저 URL */
  tagManagerUrl: string;
  /** 기능 플래그 */
  features?: GTMFeatures;
  /** 태그 ID 목록 */
  tagIds?: string[];
}

/**
 * GTM 사용 컨텍스트
 */
export type GTMUsageContext = 'WEB' | 'ANDROID' | 'IOS' | 'AMP' | 'SERVER';

/**
 * GTM 기능 플래그
 */
export interface GTMFeatures {
  /** GA4 자동 이벤트 수집 활성화 */
  supportBuiltInVariables?: boolean;
  /** User-Agent 감소 지원 */
  supportReducedUserAgentClientHints?: boolean;
  /** 버전 헤더 지원 */
  supportVersionHeader?: boolean;
  /** 미리보기 헤더 지원 */
  supportPreviewHeader?: boolean;
  /** 샘플링 지원 */
  supportSamplingRates?: boolean;
  /** 향상된 Link 속성 지원 */
  supportEnhancedLinkAttribution?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: GTM Tag Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GTM 태그
 */
export interface GTMTag {
  /** 계정 ID */
  accountId: string;
  /** 컨테이너 ID */
  containerId: string;
  /** 태그 ID */
  tagId: string;
  /** 태그 이름 */
  name: string;
  /** 태그 타입 */
  type: GTMTagType;
  /** 파라미터 목록 */
  parameter?: GTMParameter[];
  /** 수정 시간 */
  fingerprint: string;
  /** 발화 트리거 ID 목록 */
  firingTriggerId?: string[];
  /** 차단 트리거 ID 목록 */
  blockingTriggerId?: string[];
  /** 설정 태그 ID (GA4 Config 참조) */
  setupTag?: GTMSetupTag[];
  /** 폴더 ID */
  parentFolderId?: string;
  /** 태그 매니저 URL */
  tagManagerUrl: string;
  /** 태그 발화 옵션 */
  tagFiringOption?: GTMTagFiringOption;
  /** 모니터링 메타데이터 */
  monitoringMetadata?: GTMMonitoringMetadata;
  /** 동의 설정 */
  consentSettings?: GTMConsentSettings;
  /** 일시 중지 여부 */
  paused?: boolean;
  /** 설명 (노트) */
  notes?: string;
  /** 우선순위 */
  priority?: GTMParameter;
  /** 일정 시작/종료 */
  scheduleStartMs?: string;
  scheduleEndMs?: string;
}

/**
 * GTM 태그 타입 (주요)
 */
export type GTMTagType =
  | 'gaawe'           // GA4 Event Tag
  | 'gaawc'           // GA4 Configuration Tag
  | 'googtag'         // Google Tag (GA4 Config, 신규 형식)
  | 'ua'              // Universal Analytics
  | 'html'            // Custom HTML
  | 'img'             // Custom Image
  | 'cvt_XXXXX'       // Custom Template
  | 'gclidw'          // Google Ads Conversion Linker
  | 'awct'            // Google Ads Conversion Tracking
  | 'flc'             // Floodlight Counter
  | 'fls'             // Floodlight Sales
  | 'sp'              // Facebook Pixel (Legacy)
  | string;           // Other custom types

/**
 * GTM 태그 발화 옵션
 */
export type GTMTagFiringOption =
  | 'UNLIMITED'
  | 'ONCE_PER_EVENT'
  | 'ONCE_PER_LOAD';

/**
 * GTM Setup 태그 참조
 */
export interface GTMSetupTag {
  /** 참조 태그 이름 */
  tagName: string;
  /** 발화 후 정지 여부 */
  stopOnSetupFailure?: boolean;
}

/**
 * GTM 모니터링 메타데이터
 */
export interface GTMMonitoringMetadata {
  type: 'MAP';
}

/**
 * GTM 동의 설정
 */
export interface GTMConsentSettings {
  /** 동의 상태 */
  consentStatus: 'NOT_SET' | 'NOT_NEEDED' | 'NEEDED';
  /** 동의 타입 */
  consentType?: GTMParameter;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: GTM Parameter Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GTM 파라미터
 */
export interface GTMParameter {
  /** 파라미터 타입 */
  type: GTMParameterType;
  /** 파라미터 키 */
  key: string;
  /** 단일 값 (TEMPLATE 타입) */
  value?: string;
  /** 리스트 값 (LIST 타입) */
  list?: GTMParameter[];
  /** 맵 값 (MAP 타입) */
  map?: GTMParameter[];
  /** 불리언 값 (BOOLEAN 타입) */
  isWeakReference?: boolean;
}

/**
 * GTM 파라미터 타입
 */
export type GTMParameterType =
  | 'TEMPLATE'     // 단일 값 (문자열, 변수 참조)
  | 'LIST'         // 배열
  | 'MAP'          // 객체/키-값 쌍
  | 'INTEGER'      // 정수
  | 'BOOLEAN'      // 불리언
  | 'TAG_REFERENCE'; // 태그 참조

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: GTM Trigger Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GTM 트리거
 */
export interface GTMTrigger {
  /** 계정 ID */
  accountId: string;
  /** 컨테이너 ID */
  containerId: string;
  /** 트리거 ID */
  triggerId: string;
  /** 트리거 이름 */
  name: string;
  /** 트리거 타입 */
  type: GTMTriggerType;
  /** 커스텀 이벤트 필터 */
  customEventFilter?: GTMCondition[];
  /** 필터 (조건) */
  filter?: GTMCondition[];
  /** 수정 시간 */
  fingerprint: string;
  /** 폴더 ID */
  parentFolderId?: string;
  /** 태그 매니저 URL */
  tagManagerUrl: string;
  /** 파라미터 */
  parameter?: GTMParameter[];
  /** 자동 이벤트 필터 */
  autoEventFilter?: GTMCondition[];
  /** 대기 태그 */
  waitForTags?: GTMParameter;
  /** 대기 태그 타임아웃 */
  waitForTagsTimeout?: GTMParameter;
  /** Check Validation 여부 */
  checkValidation?: GTMParameter;
  /** 고유 트리거 ID */
  uniqueTriggerId?: GTMParameter;
  /** 이벤트 이름 (커스텀 이벤트) */
  eventName?: GTMParameter;
  /** 간격 (타이머/스크롤) */
  interval?: GTMParameter;
  /** 제한 (타이머) */
  limit?: GTMParameter;
  /** 세로 스크롤 백분율 */
  verticalScrollPercentageList?: GTMParameter;
  /** 가로 스크롤 백분율 */
  horizontalScrollPercentageList?: GTMParameter;
  /** 가시성 셀렉터 */
  visibilitySelector?: GTMParameter;
  /** 가시성 최소 표시 시간 */
  visiblePercentageMin?: GTMParameter;
  /** 가시성 지속 시간 */
  visiblePercentageMax?: GTMParameter;
}

/**
 * GTM 트리거 타입
 */
export type GTMTriggerType =
  | 'PAGEVIEW'              // 페이지뷰 (DOM Ready, Window Load 포함)
  | 'DOM_READY'             // DOM Ready
  | 'WINDOW_LOADED'         // Window Loaded
  | 'CUSTOM_EVENT'          // Custom Event (dataLayer push)
  | 'CLICK'                 // All Clicks
  | 'LINK_CLICK'            // Link Clicks
  | 'FORM_SUBMIT'           // Form Submission
  | 'HISTORY_CHANGE'        // History Change (SPA)
  | 'JAVASCRIPT_ERROR'      // JavaScript Error
  | 'TIMER'                 // Timer
  | 'SCROLL_DEPTH'          // Scroll Depth
  | 'ELEMENT_VISIBILITY'    // Element Visibility
  | 'YOUTUBE_VIDEO'         // YouTube Video
  | 'TRIGGER_GROUP'         // Trigger Group
  | 'INIT'                  // Initialization
  | 'CONSENT_INIT'          // Consent Initialization
  | 'ALWAYS'                // Always (모든 이벤트)
  | string;                 // Custom trigger types

/**
 * GTM 조건 (필터)
 */
export interface GTMCondition {
  /** 조건 타입 */
  type: GTMConditionType;
  /** 파라미터 (변수, 값) */
  parameter: GTMParameter[];
}

/**
 * GTM 조건 타입
 */
export type GTMConditionType =
  | 'EQUALS'
  | 'CONTAINS'
  | 'STARTS_WITH'
  | 'ENDS_WITH'
  | 'MATCH_REGEX'
  | 'GREATER'
  | 'GREATER_OR_EQUALS'
  | 'LESS'
  | 'LESS_OR_EQUALS'
  | 'CSS_SELECTOR'
  | 'URL_MATCHES';

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: GTM Variable Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GTM 변수
 */
export interface GTMVariable {
  /** 계정 ID */
  accountId: string;
  /** 컨테이너 ID */
  containerId: string;
  /** 변수 ID */
  variableId: string;
  /** 변수 이름 */
  name: string;
  /** 변수 타입 */
  type: GTMVariableType;
  /** 파라미터 */
  parameter?: GTMParameter[];
  /** 수정 시간 */
  fingerprint: string;
  /** 폴더 ID */
  parentFolderId?: string;
  /** 태그 매니저 URL */
  tagManagerUrl: string;
  /** 형식 값 */
  formatValue?: GTMFormatValue;
}

/**
 * GTM 변수 타입 (주요)
 */
export type GTMVariableType =
  | 'v'              // Data Layer Variable
  | 'jsm'            // Custom JavaScript
  | 'j'              // JavaScript Variable (window.*)
  | 'k'              // First Party Cookie
  | 'c'              // Constant
  | 'u'              // URL
  | 'e'              // Custom Event
  | 'f'              // HTTP Referrer
  | 'd'              // DOM Element
  | 'aev'            // Auto-Event Variable
  | 'vis'            // Element Visibility
  | 'gas'            // Google Analytics Settings
  | 'gtcs'           // Google Tag: Configuration Settings
  | 'gtes'           // Google Tag: Event Settings
  | 'remm'           // RegEx Table
  | 'smm'            // Lookup Table
  | 'ctv'            // Container Version Number
  | 'dbg'            // Debug Mode
  | 'env'            // Environment Name
  | 'r'              // Random Number
  | 'cid'            // Container ID
  | string;          // Custom variable types

/**
 * GTM 내장 변수
 */
export interface GTMBuiltInVariable {
  /** 계정 ID */
  accountId: string;
  /** 컨테이너 ID */
  containerId: string;
  /** 변수 타입 */
  type: GTMBuiltInVariableType;
  /** 변수 이름 */
  name: string;
}

/**
 * GTM 내장 변수 타입
 */
export type GTMBuiltInVariableType =
  | 'PAGE_URL'
  | 'PAGE_HOSTNAME'
  | 'PAGE_PATH'
  | 'REFERRER'
  | 'EVENT'
  | 'CLICK_ID'
  | 'CLICK_URL'
  | 'CLICK_TEXT'
  | 'CLICK_CLASSES'
  | 'CLICK_TARGET'
  | 'CLICK_ELEMENT'
  | 'FORM_ID'
  | 'FORM_URL'
  | 'FORM_TEXT'
  | 'FORM_CLASSES'
  | 'FORM_TARGET'
  | 'FORM_ELEMENT'
  | 'ERROR_MESSAGE'
  | 'ERROR_URL'
  | 'ERROR_LINE'
  | 'DEBUG_MODE'
  | 'RANDOM_NUMBER'
  | 'CONTAINER_ID'
  | 'CONTAINER_VERSION'
  | 'HTML_ID'
  | 'HISTORY_SOURCE'
  | 'NEW_HISTORY_FRAGMENT'
  | 'NEW_HISTORY_STATE'
  | 'OLD_HISTORY_FRAGMENT'
  | 'OLD_HISTORY_STATE'
  | 'SCROLL_DEPTH_THRESHOLD'
  | 'SCROLL_DEPTH_UNITS'
  | 'SCROLL_DEPTH_DIRECTION'
  | 'VIDEO_PROVIDER'
  | 'VIDEO_URL'
  | 'VIDEO_TITLE'
  | 'VIDEO_DURATION'
  | 'VIDEO_PERCENT'
  | 'VIDEO_VISIBLE'
  | 'VIDEO_STATUS'
  | 'VIDEO_CURRENT_TIME'
  | 'ELEMENT_VISIBILITY_RATIO'
  | 'ELEMENT_VISIBILITY_FIRST_TIME'
  | 'ELEMENT_VISIBILITY_RECENT_TIME'
  | string;

/**
 * GTM 형식 값
 */
export interface GTMFormatValue {
  /** 대소문자 변환 */
  caseConversionType?: 'NONE' | 'LOWERCASE' | 'UPPERCASE';
  /** undefined를 값으로 변환 */
  convertUndefinedToValue?: GTMParameter;
  /** null을 값으로 변환 */
  convertNullToValue?: GTMParameter;
  /** true를 값으로 변환 */
  convertTrueToValue?: GTMParameter;
  /** false를 값으로 변환 */
  convertFalseToValue?: GTMParameter;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: GTM Folder & Custom Template
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GTM 폴더
 */
export interface GTMFolder {
  /** 계정 ID */
  accountId: string;
  /** 컨테이너 ID */
  containerId: string;
  /** 폴더 ID */
  folderId: string;
  /** 폴더 이름 */
  name: string;
  /** 수정 시간 */
  fingerprint: string;
}

/**
 * GTM 커스텀 템플릿
 */
export interface GTMCustomTemplate {
  /** 계정 ID */
  accountId: string;
  /** 컨테이너 ID */
  containerId: string;
  /** 템플릿 ID */
  templateId: string;
  /** 템플릿 이름 */
  name: string;
  /** 수정 시간 */
  fingerprint: string;
  /** 템플릿 데이터 */
  templateData?: string;
  /** 갤러리 참조 */
  galleryReference?: GTMGalleryReference;
}

/**
 * GTM 갤러리 참조
 */
export interface GTMGalleryReference {
  /** 호스트 */
  host: string;
  /** 저장소 */
  repository: string;
  /** 서명 */
  signature: string;
  /** 버전 */
  version: string;
  /** 소유자 */
  owner?: string;
  /** 이름 */
  templateDataName?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7: GA4 Specific Extraction Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GA4 이벤트 정보 (GTM에서 추출)
 */
export interface GTMExtractedGA4Event {
  /** 태그 ID */
  tag_id: string;
  /** 태그 이름 */
  tag_name: string;
  /** 이벤트 이름 */
  event_name: string;
  /** 설정 태그 (Configuration Tag) 참조 */
  config_tag_name?: string;
  /** Measurement ID */
  measurement_id?: string;
  /** 파라미터 목록 */
  parameters: GTMExtractedParameter[];
  /** User Properties */
  user_properties?: GTMExtractedParameter[];
  /** 발화 트리거 이름 목록 */
  firing_triggers: string[];
  /** 차단 트리거 이름 목록 */
  blocking_triggers?: string[];
  /** 이벤트 설명 (노트) */
  notes?: string;
  /** 일시 중지 여부 */
  paused?: boolean;
}

/**
 * GTM에서 추출한 파라미터
 */
export interface GTMExtractedParameter {
  /** 파라미터 키 (GA4 파라미터명) */
  key: string;
  /** 파라미터 값 (리터럴 또는 GTM 변수 참조) */
  value: string;
  /** GTM 변수 참조 여부 */
  is_variable_reference: boolean;
  /** 참조된 GTM 변수명 ({{변수명}} 형태에서 추출) */
  referenced_variable?: string;
}

/**
 * GA4 Configuration 정보 (GTM에서 추출)
 */
export interface GTMExtractedGA4Config {
  /** 태그 ID */
  tag_id: string;
  /** 태그 이름 */
  tag_name: string;
  /** Measurement ID */
  measurement_id: string;
  /** Fields to Set */
  fields_to_set?: GTMExtractedParameter[];
  /** User Properties */
  user_properties?: GTMExtractedParameter[];
  /** 발화 트리거 이름 목록 */
  firing_triggers: string[];
  /** 디버그 모드 여부 */
  debug_mode?: boolean;
  /** 페이지뷰 전송 여부 */
  send_page_view?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 8: GTM Parsing Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GTM 파싱 결과
 */
export interface GTMParseResult {
  /** 성공 여부 */
  success: boolean;
  /** 원본 컨테이너 */
  container?: GTMContainer;
  /** 추출된 GA4 이벤트 목록 */
  ga4_events?: GTMExtractedGA4Event[];
  /** 추출된 GA4 설정 목록 */
  ga4_configs?: GTMExtractedGA4Config[];
  /** 오류 메시지 */
  errors?: string[];
  /** 경고 메시지 */
  warnings?: string[];
  /** 파싱 통계 */
  stats?: {
    total_tags: number;
    ga4_event_tags: number;
    ga4_config_tags: number;
    total_triggers: number;
    total_variables: number;
    parse_duration_ms: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 9: Helper Types & Constants
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GA4 이벤트 태그 타입 상수
 */
export const GA4_EVENT_TAG_TYPE = 'gaawe' as const;

/**
 * GA4 설정 태그 타입 상수
 */
export const GA4_CONFIG_TAG_TYPE = 'gaawc' as const;

/**
 * Google Tag 타입 상수 (GA4 Config 신규 형식)
 */
export const GOOGLE_TAG_TYPE = 'googtag' as const;

/**
 * GTM 변수 참조 패턴 ({{변수명}})
 */
export const GTM_VARIABLE_REFERENCE_PATTERN = /\{\{([^}]+)\}\}/g;

/**
 * GA4 이벤트 태그에서 이벤트 이름을 찾는 파라미터 키
 */
export const GA4_EVENT_NAME_PARAM_KEY = 'eventName';

/**
 * GA4 이벤트 태그에서 이벤트 파라미터를 찾는 파라미터 키
 */
export const GA4_EVENT_PARAMS_KEY = 'eventParameters';

/**
 * GA4 이벤트 태그에서 User Properties를 찾는 파라미터 키
 */
export const GA4_USER_PROPERTIES_KEY = 'userProperties';

/**
 * GA4 설정 태그에서 Measurement ID를 찾는 파라미터 키
 */
export const GA4_MEASUREMENT_ID_KEY = 'measurementId';

/**
 * 태그 ID → 태그 맵
 */
export type GTMTagMap = Map<string, GTMTag>;

/**
 * 트리거 ID → 트리거 맵
 */
export type GTMTriggerMap = Map<string, GTMTrigger>;

/**
 * 변수 이름 → 변수 맵
 */
export type GTMVariableMap = Map<string, GTMVariable>;

/**
 * 트리거 ID → 트리거 이름 맵
 */
export type GTMTriggerNameMap = Map<string, string>;
