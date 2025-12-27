/**
 * 시나리오 출력 스키마
 *
 * 이 스키마는 세 가지 목적으로 사용됩니다:
 * 1. Crawler Agent: 어떤 요소를 클릭하고 어떤 이벤트를 기대해야 하는지 가이드
 * 2. Validation Agent: 수집된 이벤트가 올바른지 판단하는 정답지
 * 3. Data Accuracy Agent: 수집된 데이터 값이 화면에 표시된 실제 값과 일치하는지 검증
 */

// ============================================================================
// Test Case Key 체계
// Scenario Agent → Crawler Agent → Validation Agent 간 데이터 연결용
// ============================================================================

/**
 * 테스트 케이스 Key
 *
 * 3개 Agent 간 데이터를 연결하는 고유 식별자
 *
 * 구조: {sessionId}_{eventName}_{elementKey}_{actionIndex}
 * 예시: sess_1734271942_select_promotion_promo_13681_1
 *
 * 흐름:
 * 1. Scenario Agent: testCaseKey 생성하여 whitelist element에 부여
 * 2. Crawler Agent: 클릭 시 testCaseKey 함께 기록
 * 3. Validation Agent: testCaseKey로 시나리오 기대값과 실제값 매칭
 */
export interface TestCaseKey {
  /** 테스트 세션 ID (시나리오 생성 시점의 timestamp) */
  sessionId: string;

  /** 이벤트명 */
  eventName: string;

  /**
   * 요소 식별 키 (expected data 기반)
   * - promotion 이벤트: promo_{promotion_id}
   * - item 이벤트: item_{item_id}
   * - 기타: elem_{index}
   */
  elementKey: string;

  /** 동일 요소에 대한 액션 순서 (1부터 시작) */
  actionIndex: number;

  /** 전체 키 문자열 (위 필드들의 조합) */
  fullKey: string;
}

/**
 * 테스트 실행 결과 (Crawler Agent가 생성)
 *
 * Crawler가 시나리오를 실행하고 생성하는 결과물
 * testCaseKey로 시나리오 요소와 연결됨
 */
export interface TestExecutionResult {
  /** 테스트 케이스 키 (시나리오와 매칭) */
  testCaseKey: TestCaseKey;

  /** 실행 시간 */
  executedAt: string;

  /** 실행 성공 여부 */
  success: boolean;

  /** 클릭한 요소 정보 */
  clickedElement: {
    selector: string;
    boundingBox?: { x: number; y: number; width: number; height: number };
    /** 실제 클릭한 요소의 HTML (디버깅용) */
    outerHTML?: string;
  };

  /** 수집된 이벤트 */
  collectedEvent?: {
    eventName: string;
    timestamp: string;
    /** 이벤트 파라미터 (promotion_id, promotion_name 등) */
    parameters: Record<string, any>;
  };

  /** 수집된 items 배열 (e-commerce 이벤트) */
  collectedItems?: Array<Record<string, any>>;

  /** 스크린샷 경로 (클릭 전/후) */
  screenshots?: {
    before?: string;
    after?: string;
  };

  /** 에러 정보 */
  error?: string;
}

/**
 * 검증 결과 (Validation Agent가 생성)
 *
 * Validation이 시나리오 + 실행결과를 비교하여 생성
 * testCaseKey로 시나리오, 실행결과와 연결됨
 */
export interface ValidationResult {
  /** 테스트 케이스 키 (시나리오 + 실행 결과와 매칭) */
  testCaseKey: TestCaseKey;

  /** 검증 시간 */
  validatedAt: string;

  /** 전체 검증 통과 여부 */
  passed: boolean;

  /** 개별 검증 항목 결과 */
  checkResults: Array<{
    checkId: string;
    category: string;
    passed: boolean;
    /** 시나리오에서 기대한 값 */
    expectedValue?: any;
    /** Crawler가 수집한 실제 값 */
    actualValue?: any;
    message: string;
    severity: 'critical' | 'warning' | 'info';
  }>;

  /** Journey 일관성 검증 결과 */
  journeyConsistency?: {
    passed: boolean;
    relatedEvents: string[];
    /** 불일치 항목 */
    inconsistencies: Array<{
      param: string;
      /** 각 이벤트에서 수집된 값 */
      values: Record<string, any>;  // eventName → value
      message: string;
    }>;
  };

  /** 최종 판정 */
  verdict: 'PASS' | 'FAIL' | 'WARNING';
}

/**
 * 전체 테스트 리포트
 *
 * 하나의 시나리오에 대한 전체 테스트 결과
 */
export interface TestReport {
  /** 리포트 ID */
  reportId: string;

  /** 테스트 세션 ID */
  sessionId: string;

  /** 시나리오 파일 경로 */
  scenarioPath: string;

  /** 테스트 시작/종료 시간 */
  startedAt: string;
  completedAt: string;

  /** 전체 결과 요약 */
  summary: {
    totalTestCases: number;
    passed: number;
    failed: number;
    warnings: number;
    /** Journey 일관성 통과 여부 */
    journeyConsistencyPassed: boolean;
  };

  /** 개별 테스트 결과 */
  results: Array<{
    testCaseKey: TestCaseKey;
    execution: TestExecutionResult;
    validation: ValidationResult;
  }>;

  /** Journey별 결과 (cross-event validation) */
  journeyResults?: Array<{
    journeyId: string;
    journeyName: string;
    events: string[];
    consistencyPassed: boolean;
    details: ValidationResult['journeyConsistency'];
  }>;
}

// ============================================================================
// Journey 컨텍스트
// ============================================================================

/**
 * Journey 컨텍스트
 *
 * 현재 이벤트가 어떤 Journey에 속하는지, 어떤 이벤트들과 함께 테스트해야 하는지 정보
 * Crawler/Validation Agent가 단일 이벤트가 아닌 Journey 단위로 테스트할 수 있게 함
 */
export interface JourneyContext {
  /** 이 이벤트가 Journey에 속하는지 */
  belongsToJourney: boolean;

  /** Journey ID (belongsToJourney가 true인 경우) */
  journeyId?: string;

  /** Journey 이름 */
  journeyName?: string;

  /** Journey 내 이 이벤트의 순서 (1부터 시작) */
  orderInJourney?: number;

  /** Journey 전체 이벤트 시퀀스 */
  fullSequence?: string[];

  /** 이 이벤트가 Journey 진입점인지 (테스트 시작점) */
  isEntryPoint?: boolean;

  /**
   * 이 이벤트 전에 발생해야 하는 필수 이벤트
   * Crawler가 이 이벤트를 테스트하기 전에 확인해야 함
   */
  prerequisiteEvents?: string[];

  /**
   * 이 이벤트 후에 발생해야 하는 이벤트
   * Validation이 후속 이벤트도 검증해야 함
   */
  subsequentEvents?: string[];

  /**
   * Journey 내 일관성 검증 파라미터
   */
  consistencyParams?: {
    exactMatch: string[];
    semanticMatch: string[];
  };

  /** Journey 요약 (사람이 읽기 쉬운 형태) */
  summary?: string;
}

/**
 * 요소의 위치 정보 (시각적 식별용)
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Vision AI가 화면에서 추출한 시각적 콘텐츠
 *
 * 이 정보는 데이터 정확성 검증에 사용됩니다.
 * 예: 화면에 "바나나"가 표시되는데 item_name: "strawberry"로 수집되면 오류
 */
export interface VisualContentExtraction {
  /** 화면에 보이는 제품명/프로모션명 */
  displayedName?: string;

  /** 화면에 보이는 가격 (숫자만, 통화 기호 제외) */
  displayedPrice?: number;

  /** 화면에 보이는 원가 (할인 전 가격) */
  displayedOriginalPrice?: number;

  /** 화면에 보이는 할인율 (예: 20) */
  displayedDiscountRate?: number;

  /** 화면에 보이는 브랜드명 */
  displayedBrand?: string;

  /** 화면에 보이는 카테고리 */
  displayedCategory?: string;

  /** 화면에 보이는 프로모션 문구 */
  displayedPromotionText?: string;

  /** 화면에 보이는 위치/슬롯 정보 (예: "첫 번째 상품", "메인 배너") */
  displayedPosition?: string;

  /** 추가 시각적 정보 (자유 형식) */
  additionalVisualInfo?: Record<string, string>;

  /** Vision AI의 추출 확신도 */
  extractionConfidence: 'high' | 'medium' | 'low';
}

/**
 * 기대되는 데이터 값 (Vision AI 기반)
 *
 * Vision AI가 화면에서 추출한 값을 기반으로
 * 수집되어야 할 데이터의 예상 값을 정의합니다.
 *
 * 주의: 목적은 "픽셀 퍼펙트 매칭"이 아니라 "명백히 잘못된 데이터" 감지입니다.
 * 예: 화면에 "설화수"가 보이는데 "라네즈"로 수집되면 오류
 */
export interface ExpectedDataValue {
  /** GA4 파라미터명 */
  paramName: string;

  /** 화면에서 추출한 예상 값 */
  expectedValue: string | number | boolean;

  /** 값 추출 근거 (화면의 어디에서 추출했는지) */
  extractionSource: string;

  /**
   * 매칭 규칙
   * - exact: 정확히 일치해야 함
   * - contains: 부분 포함 (대소문자 무시)
   * - startsWith: 시작 문자열 일치
   * - regex: 정규식 패턴 매칭
   * - numeric_tolerance: 숫자 오차 허용
   * - semantic: 의미적 유사성 (브랜드, 카테고리 수준 일치 확인)
   * - keyword_overlap: 핵심 키워드가 겹치는지 확인 (예: "설화수", "립스틱")
   */
  matchRule: 'exact' | 'contains' | 'startsWith' | 'regex' | 'numeric_tolerance' | 'semantic' | 'keyword_overlap';

  /** numeric_tolerance인 경우 허용 오차 (%) */
  tolerance?: number;

  /** semantic/keyword_overlap 매칭 시 추출한 핵심 키워드 (브랜드, 카테고리 등) */
  keywords?: string[];

  /** 검증 필수 여부 */
  mustValidate: boolean;

  /**
   * 검증 우선순위
   * - critical: 반드시 일치해야 함 (명백한 오류 감지)
   * - important: 중요하지만 약간의 차이 허용
   * - informational: 참고용 (불일치해도 경고만)
   */
  validationPriority?: 'critical' | 'important' | 'informational';
}

/**
 * 요소 식별 정보
 * Crawler가 정확히 요소를 찾을 수 있도록 다양한 식별자 제공
 */
export interface ElementIdentifier {
  /** CSS Selector (우선 사용) */
  cssSelector: string;

  /** XPath (CSS Selector로 찾기 어려운 경우) */
  xpath?: string;

  /** 요소의 텍스트 내용 (부분 매칭용) */
  textContent?: string;

  /** data 속성 (GTM용) */
  dataAttributes?: Record<string, string>;

  /** 시각적 위치 (Bounding Box) */
  boundingBox?: BoundingBox;

  /** 시각적 설명 (사람용) */
  visualDescription: string;

  /** 화면 내 위치 설명 */
  locationDescription: string;
}

/**
 * 파라미터 검증 규칙
 */
export interface ParamValidationRule {
  /** 파라미터명 (GA4 기준) */
  name: string;

  /** 필수 여부 */
  required: boolean;

  /** 데이터 타입 */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';

  /** 개발가이드 변수명 (매핑 참조용) */
  devGuideVariable?: string;

  /** GTM 변수명 */
  gtmVariable?: string;

  /** 검증 규칙 */
  validation?: {
    /** 정규식 패턴 */
    pattern?: string;
    /** 최소값 (숫자) */
    min?: number;
    /** 최대값 (숫자) */
    max?: number;
    /** 허용 값 목록 */
    enum?: string[];
    /** 비어있으면 안됨 */
    notEmpty?: boolean;
  };

  /**
   * 파라미터 값 예측 (Level 3 정확도 향상용)
   * ParameterValuePredictor에서 생성
   */
  valuePrediction?: {
    /**
     * 예측된 값
     * - VERIFIABLE: 정확한 값 예측 (GA4 비교 가능)
     * - CONTENT_GROUP: 컨텐츠 그룹 기반 예측값
     * - DYNAMIC: null (값 예측 불가, 존재 여부만 확인)
     */
    predictedValue: string | number | null;

    /**
     * 값 유형
     * - VERIFIABLE: GA4 집계 데이터와 비교 가능 (event_category, product_id 등)
     * - CONTENT_GROUP: 컨텐츠 그룹별 다른 값 (scroll.event_label 등)
     * - DYNAMIC: 사용자 행동에 따라 변동 (ap_click.event_label 등)
     */
    valueType: 'VERIFIABLE' | 'CONTENT_GROUP' | 'DYNAMIC';

    /** 예측 신뢰도 (0-100) */
    confidence: number;

    /** 값 추출 소스 (URL, DOM, 고정값 등) */
    source?: 'FIXED' | 'URL_PARAM' | 'DOM_EXTRACT' | 'CONTENT_GROUP' | 'LEARNED';

    /** 예측 실패 시 실제 값과 비교하여 이슈 리포팅 여부 */
    shouldReportMismatch: boolean;
  };

  /** 설명 */
  description: string;
}

/**
 * items 배열 내 아이템 파라미터 검증 규칙
 */
export interface ItemParamValidationRule extends ParamValidationRule {
  /** 아이템 레벨에서 필수 여부 */
  itemRequired: boolean;
}

/**
 * Whitelist 요소 (이벤트가 발생해야 하는 요소)
 */
export interface WhitelistElement {
  /** 요소 ID (시나리오 내 고유 식별자) */
  id: string;

  /**
   * 테스트 케이스 키
   *
   * Scenario → Crawler → Validation 간 데이터 연결용 고유 식별자
   * 이 키로 시나리오의 기대값과 실제 수집값을 매칭
   */
  testCaseKey: TestCaseKey;

  /** 요소 식별 정보 */
  identifier: ElementIdentifier;

  /** 사용자 행동 */
  action: 'click' | 'hover' | 'scroll_into_view' | 'form_submit';

  /** 기대되는 이벤트 파라미터 값 (구조 검증용) */
  expectedParams?: Record<string, any>;

  /**
   * Vision AI가 화면에서 추출한 시각적 콘텐츠
   * 데이터 정확성 검증에 사용
   */
  visualContent?: VisualContentExtraction;

  /**
   * 기대되는 데이터 값 목록 (데이터 정확성 검증용)
   *
   * Vision AI가 화면에서 추출한 값을 기반으로,
   * 이 요소를 클릭했을 때 수집되어야 할 데이터의 예상 값
   *
   * 예: 화면에 "설화수 윤조에센스"가 보이면
   *     expectedDataValues: [{ paramName: "item_name", expectedValue: "설화수 윤조에센스", ... }]
   */
  expectedDataValues?: ExpectedDataValue[];

  /** 확신도 */
  confidence: 'high' | 'medium' | 'low';

  /** 판단 근거 */
  reason: string;

  /** 우선순위 (테스트 순서) */
  priority: number;
}

/**
 * Whitelist 경계 정의
 * 이 조건에 매칭되는 요소만 이벤트가 발생해야 함
 */
export interface WhitelistBoundary {
  /** GTM 트리거에서 추출한 CSS Selector */
  gtmTriggerSelector: string;

  /** 추가 조건 (있는 경우) */
  additionalConditions?: {
    /** URL 패턴 */
    urlPattern?: string;
    /** 페이지 타입 */
    pageType?: string;
    /** dataLayer 조건 */
    dataLayerCondition?: string;
  };

  /** 경계 설명 (사람용) */
  description: string;
}

/**
 * False Positive 감지 규칙
 */
export interface FalsePositiveRule {
  /** 규칙 ID */
  id: string;

  /** 규칙 설명 */
  description: string;

  /** 감지 조건 */
  condition: {
    /** 이벤트가 발생했을 때 */
    eventFired: string;
    /** 클릭된 요소가 이 selector에 매칭되지 않으면 */
    elementNotMatching: string;
  };

  /** 오류 메시지 */
  errorMessage: string;

  /** 심각도 */
  severity: 'critical' | 'warning' | 'info';
}

/**
 * 이벤트 간 일관성 검증 규칙
 *
 * 동일한 프로모션/상품에 대해 연관된 이벤트들이 일관된 값을 가지는지 검증
 * 예: view_promotion(노출) → select_promotion(클릭) → view_promotion_detail(상세)
 *     이 세 이벤트의 promotion_id, promotion_name은 동일해야 함
 */
export interface CrossEventConsistencyRule {
  /** 규칙 ID */
  id: string;

  /** 규칙 설명 */
  description: string;

  /**
   * 연관 이벤트 그룹
   * 이 이벤트들은 같은 엔티티(프로모션/상품)를 추적하므로 값이 일치해야 함
   */
  relatedEvents: string[];

  /**
   * 일치해야 하는 파라미터 목록
   * 예: ['promotion_id', 'promotion_name', 'creative_slot']
   */
  mustMatchParams: string[];

  /**
   * 매칭 규칙
   * - exact: 정확히 일치
   * - semantic: 의미적으로 유사 (브랜드, 카테고리 수준)
   */
  matchRule: 'exact' | 'semantic';

  /** 불일치 시 심각도 */
  severity: 'critical' | 'warning' | 'info';
}

/**
 * 명시적으로 이벤트가 발생하면 안 되는 요소
 * (시각적으로 비슷해서 혼동될 수 있는 요소들)
 */
export interface ExplicitExclusion {
  /** 요소 식별 정보 */
  identifier: ElementIdentifier;

  /** 제외 이유 */
  reason: string;

  /** 대신 발생해야 하는 이벤트 */
  expectedAlternativeEvent?: string;

  /** 확신도 */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * 전체 시나리오 출력 스키마
 */
export interface EventScenario {
  /** 스키마 버전 */
  schemaVersion: '2.0.0';

  /** 메타데이터 */
  metadata: {
    /** 생성 시간 */
    generatedAt: string;
    /** 분석 URL */
    pageUrl: string;
    /** 대상 이벤트 */
    eventName: string;
    /** 사이트 ID */
    siteId: string;
    /** 스크린샷 경로 */
    screenshotPath: string;
    /** 에이전트 버전 */
    agentVersion: string;
  };

  /**
   * Journey 컨텍스트
   *
   * 이 이벤트가 어떤 Journey에 속하는지, 함께 테스트해야 하는 이벤트는 무엇인지 정보
   * Crawler/Validation Agent가 이 정보를 보고 Journey 단위로 테스트 수행
   */
  journeyContext: JourneyContext;

  /** GA4 이벤트 정보 */
  eventInfo: {
    /** GA4 표준 이벤트명 */
    ga4EventName: string;
    /** dataLayer 이벤트명 (사이트별) */
    dataLayerEventName: string;
    /** 이벤트 설명 */
    description: string;
  };

  /**
   * GTM 트리거 정보
   *
   * GTM JSON에서 파싱한 실제 트리거 조건
   * Crawler Agent가 이 정보를 보고 클릭/노출 테스트 방식 결정
   */
  triggerInfo: {
    /**
     * 트리거 타입
     * - CLICK: 모든 요소 클릭
     * - LINK_CLICK: <a> 태그 클릭
     * - CUSTOM_EVENT: dataLayer.push 이벤트
     * - DOM_READY: DOM 준비 완료 시 (페이지 로드)
     * - ELEMENT_VISIBILITY: 요소가 뷰포트에 노출될 때
     * - SCROLL: 스크롤 이벤트
     * - FORM_SUBMIT: 폼 제출
     */
    triggerType: 'CLICK' | 'LINK_CLICK' | 'CUSTOM_EVENT' | 'DOM_READY' | 'ELEMENT_VISIBILITY' | 'SCROLL' | 'FORM_SUBMIT' | 'PAGEVIEW' | 'WINDOW_LOADED';

    /** 트리거 타입 설명 */
    triggerTypeDescription: string;

    /**
     * 이벤트 발생 방식
     * - click: 사용자가 클릭해야 발생 (CLICK, LINK_CLICK)
     * - impression: 화면에 노출되면 자동 발생 (DOM_READY, ELEMENT_VISIBILITY)
     * - dataLayer: dataLayer.push()로 발생 (CUSTOM_EVENT)
     * - page: 페이지 로드 시 발생 (PAGEVIEW, WINDOW_LOADED)
     */
    firingMethod: 'click' | 'impression' | 'dataLayer' | 'page' | 'scroll' | 'form';

    /** GTM 트리거 이름 */
    triggerNames: string[];

    /** CSS Selector 조건 (클릭 기반 이벤트용) */
    cssSelector?: string;

    /** Custom Event 이름 (dataLayer 기반 이벤트용) */
    customEventName?: string;

    /** 추가 필터 조건 */
    filters?: Array<{
      variable: string;
      condition: string;
      value: string;
    }>;

    /**
     * 트리거 타입별 파라미터 (GTM trigger.parameter에서 추출)
     *
     * 트리거 타입에 따라 다양한 파라미터를 포함할 수 있음:
     * - SCROLL_DEPTH: { verticalThresholdsPercent: "10,20,30,...", horizontalThresholdsPercent: "..." }
     * - ELEMENT_VISIBILITY: { selectorType: "CSS_SELECTOR", elementSelector: "...", minimumVisible: "50" }
     * - YOUTUBE_VIDEO: { captureStart: "true", captureComplete: "true", captureProgress: "true" }
     * - FORM_SUBMIT: { waitForTags: "true", checkValidation: "true" }
     *
     * 값은 원본 GTM 형식(문자열)으로 저장됨. 필요시 파싱하여 사용.
     */
    triggerParams?: Record<string, string>;
  };

  /** Whitelist 정의 */
  whitelist: {
    /** 경계 정의 (이 조건에 매칭되는 요소만 valid) */
    boundary: WhitelistBoundary;
    /** 개별 요소 목록 */
    elements: WhitelistElement[];
  };

  /** 명시적 제외 요소 (shouldNotFire) */
  explicitExclusions: ExplicitExclusion[];

  /** 파라미터 검증 규칙 */
  parameterValidation: {
    /** 이벤트 레벨 파라미터 */
    eventParams: ParamValidationRule[];
    /** items 배열 파라미터 */
    itemParams?: ItemParamValidationRule[];
  };

  /** False Positive 감지 규칙 */
  falsePositiveRules: FalsePositiveRule[];

  /**
   * 이벤트 간 일관성 검증 규칙
   *
   * 같은 프로모션/상품에 대한 연관 이벤트들이 일관된 값을 가져야 함
   * 예: view_promotion → select_promotion → view_promotion_detail
   */
  crossEventConsistency?: CrossEventConsistencyRule[];

  /** AI 분석 요약 */
  analysisNotes: {
    /** 전체 분석 요약 */
    summary: string;
    /** GTM 트리거 분석 */
    gtmAnalysis?: string;
    /** 페이지 구조 분석 */
    pageStructure?: string;
    /** 주의사항 */
    warnings?: string[];
  };

  /** 크롤러 가이드 */
  crawlerGuide: CrawlerGuide;

  /** 정답지 가이드 (Validation Agent용) */
  validationGuide: ValidationGuide;
}

/**
 * 정답지 가이드 (Validation Agent용)
 *
 * Validation Agent가 수집된 이벤트를 검증할 때 사용하는 체크리스트와 규칙
 */
export interface ValidationGuide {
  /** 이벤트 발생 검증 */
  eventFiringValidation: EventFiringValidation;

  /** 데이터 정확성 검증 */
  dataAccuracyValidation: DataAccuracyValidation;

  /** 이벤트 간 일관성 검증 */
  crossEventValidation?: CrossEventValidation;

  /**
   * 이벤트 여정 (Event Journey)
   *
   * 단일 이벤트가 아닌 연관 이벤트 시퀀스 전체를 검증
   * 예: view_promotion → select_promotion → view_promotion_detail
   *
   * Validation Agent는 이 Journey를 따라 테스트하고 검증해야 함
   */
  eventJourney?: EventJourney;

  /** 검증 체크리스트 (사람/AI 모두 사용 가능) */
  checklist: ValidationChecklist[];
}

/**
 * 이벤트 발생 검증 규칙
 */
export interface EventFiringValidation {
  /** 이벤트가 발생해야 하는 조건 */
  shouldFireWhen: {
    /** 클릭된 요소가 이 selector에 매칭될 때 */
    elementMatches: string;
    /** 추가 조건 설명 */
    additionalConditions?: string;
  };

  /** 이벤트가 발생하면 안 되는 조건 */
  shouldNotFireWhen: {
    /** 클릭된 요소가 이 selector에 매칭되지 않을 때 */
    elementNotMatches: string;
    /** 예외 케이스 목록 */
    exceptions?: string[];
  };

  /**
   * 검증 방법
   * - selector_match: CSS selector 매칭으로 판단
   * - attribute_check: 특정 속성 존재 여부로 판단
   * - dataLayer_event: dataLayer에서 특정 이벤트 발생 여부로 판단
   */
  validationMethod: 'selector_match' | 'attribute_check' | 'dataLayer_event';

  /** 검증에 사용할 속성명 */
  validationAttribute?: string;
}

/**
 * 데이터 정확성 검증 규칙
 */
export interface DataAccuracyValidation {
  /**
   * 검증 수준
   * - strict: 정확한 값 매칭 (promotion_id 등)
   * - semantic: 의미적 유사성 (브랜드, 카테고리 수준)
   * - keyword: 핵심 키워드 포함 여부
   */
  validationLevel: 'strict' | 'semantic' | 'keyword';

  /** 파라미터별 검증 규칙 */
  parameterRules: ParameterValidationDetail[];

  /**
   * 화면 vs 데이터 비교 가이드
   *
   * 예: 화면에 "설화수 립스틱"이 보이는데 "라네즈 파우더팩"으로 수집되면 오류
   */
  visualComparisonGuide: string;
}

/**
 * 파라미터별 상세 검증 규칙
 */
export interface ParameterValidationDetail {
  /** 파라미터명 */
  paramName: string;

  /** 필수 여부 */
  required: boolean;

  /**
   * 값 추출 소스
   * 어디에서 이 값을 가져오는지 (검증 시 비교 대상)
   */
  valueSource: string;

  /**
   * 검증 방법
   * - exact: 정확히 일치
   * - contains: 포함
   * - regex: 정규식
   * - semantic: 의미적 유사성 (브랜드명 등)
   * - numeric: 숫자 범위
   */
  matchMethod: 'exact' | 'contains' | 'regex' | 'semantic' | 'numeric';

  /** 예상 값 패턴 또는 예시 */
  expectedPattern?: string;

  /** 검증 실패 시 심각도 */
  failureSeverity: 'critical' | 'warning' | 'info';

  /** 검증 설명 */
  description: string;
}

/**
 * 이벤트 간 일관성 검증
 */
export interface CrossEventValidation {
  /** 연관 이벤트 목록 */
  relatedEvents: string[];

  /** 일치해야 하는 파라미터 */
  mustMatchParams: string[];

  /** 검증 설명 */
  description: string;

  /**
   * 검증 예시
   *
   * view_promotion.promotion_id === select_promotion.promotion_id
   */
  examples: string[];
}

/**
 * 이벤트 여정 (Event Journey)
 *
 * 단일 이벤트가 아닌, 연관된 이벤트 시퀀스 전체를 검증
 * 예: view_promotion → select_promotion → view_promotion_detail
 *
 * Validation Agent는 이 Journey를 따라가며:
 * 1. 각 단계에서 올바른 이벤트가 발생하는지 확인
 * 2. 단계 간 파라미터 값이 일관되는지 확인
 */
export interface EventJourney {
  /** Journey ID */
  journeyId: string;

  /** Journey 이름 (예: "프로모션 클릭 Journey") */
  name: string;

  /** Journey 설명 */
  description: string;

  /**
   * 이벤트 발생 순서
   * 이 순서대로 이벤트가 발생해야 함
   */
  steps: EventJourneyStep[];

  /**
   * 단계 간 일관성 규칙
   * 어떤 파라미터가 어떤 단계에서 일치해야 하는지
   */
  consistencyRules: JourneyConsistencyRule[];

  /**
   * Journey 검증 체크리스트
   */
  validationChecklist: JourneyValidationCheck[];
}

/**
 * 이벤트 여정의 개별 단계
 */
export interface EventJourneyStep {
  /** 단계 번호 (1부터 시작) */
  stepNumber: number;

  /** 이 단계에서 발생해야 하는 이벤트명 */
  eventName: string;

  /** 단계 설명 */
  description: string;

  /**
   * 이벤트 트리거 액션
   * - page_load: 페이지 로드 시 자동 발생
   * - scroll_into_view: 요소가 뷰포트에 노출될 때
   * - click: 사용자 클릭 시
   * - navigation: 페이지 이동 후
   */
  triggerAction: 'page_load' | 'scroll_into_view' | 'click' | 'navigation';

  /**
   * 트리거 대상 (click, scroll_into_view인 경우)
   */
  triggerTarget?: {
    /** CSS 셀렉터 */
    selector?: string;
    /** 시각적 설명 */
    visualDescription?: string;
  };

  /**
   * 이 단계에서 캡처해야 할 파라미터 목록
   * 다음 단계와 비교하기 위해 저장
   */
  captureParams: string[];

  /**
   * 이전 단계의 값과 비교해야 하는 파라미터
   * 예: step2에서 step1의 promotion_id와 같아야 함
   */
  mustMatchPreviousStep?: {
    /** 비교 대상 단계 번호 */
    stepNumber: number;
    /** 일치해야 하는 파라미터 목록 */
    params: string[];
  };

  /**
   * 이 단계의 필수 여부
   * - required: 반드시 발생해야 함
   * - optional: 발생하면 좋지만 없어도 됨
   * - conditional: 특정 조건에서만 발생
   */
  requirement: 'required' | 'optional' | 'conditional';

  /** conditional인 경우 조건 설명 */
  conditionDescription?: string;
}

/**
 * Journey 단계 간 일관성 규칙
 */
export interface JourneyConsistencyRule {
  /** 규칙 ID */
  ruleId: string;

  /** 규칙 설명 */
  description: string;

  /**
   * 비교할 단계들
   * 예: [1, 2, 3] = step1, step2, step3의 값이 모두 일치해야 함
   */
  compareSteps: number[];

  /** 일치해야 하는 파라미터 */
  params: string[];

  /**
   * 매칭 방법
   * - exact: 정확히 일치
   * - semantic: 의미적 유사성 (브랜드 수준)
   */
  matchMethod: 'exact' | 'semantic';

  /** 불일치 시 심각도 */
  severity: 'critical' | 'warning' | 'info';

  /** 불일치 시 오류 메시지 */
  failureMessage: string;
}

/**
 * Journey 검증 체크 항목
 */
export interface JourneyValidationCheck {
  /** 체크 ID */
  checkId: string;

  /** 체크 유형 */
  checkType: 'event_sequence' | 'param_consistency' | 'data_accuracy';

  /** 체크 설명 */
  description: string;

  /**
   * 관련 단계
   * 이 체크가 어떤 단계들과 관련되는지
   */
  relatedSteps: number[];

  /** 예상 결과 */
  expectedResult: string;

  /** 실패 시 메시지 */
  failureMessage: string;

  /** 심각도 */
  severity: 'critical' | 'warning' | 'info';
}

/**
 * 검증 체크리스트 항목
 */
export interface ValidationChecklist {
  /** 체크 ID */
  checkId: string;

  /** 체크 카테고리 */
  category: 'event_firing' | 'data_accuracy' | 'cross_event' | 'false_positive';

  /** 체크 내용 */
  description: string;

  /**
   * 검증 조건 (코드/수도코드 형태)
   *
   * 예: "clickedElement.matches('a[ap-data-promotion]') && event.name === 'select_promotion'"
   */
  condition: string;

  /** 예상 결과 */
  expectedResult: string;

  /** 실패 시 오류 메시지 */
  failureMessage: string;

  /** 심각도 */
  severity: 'critical' | 'warning' | 'info';
}

/**
 * 크롤러 가이드 (상세)
 *
 * 크롤러가 어떻게 테스트해야 하는지 구체적인 가이드 제공
 */
export interface CrawlerGuide {
  /** 테스트 순서 권장 (요소 ID 목록) */
  recommendedTestOrder: string[];

  /** 필수 테스트 요소 ID 목록 */
  mustTestElements: string[];

  /** 스크롤 필요 여부 */
  requiresScroll: boolean;

  /** 예상 소요 시간 (초) */
  estimatedDuration: number;

  /**
   * 테스트 전략
   * - exhaustive: 모든 요소 테스트 (시간 소요 많음)
   * - sampling: 유형별 대표 요소만 테스트
   * - priority_based: 우선순위 상위 N개만 테스트
   */
  testStrategy: 'exhaustive' | 'sampling' | 'priority_based';

  /**
   * 샘플링/우선순위 기반 테스트 시 테스트할 요소 수
   */
  sampleSize?: number;

  /**
   * 유형별 그룹 (sampling 전략용)
   * 같은 유형의 요소는 하나만 테스트해도 됨
   */
  elementGroups?: ElementGroup[];

  /**
   * 이벤트 버블링 처리 가이드
   */
  bubbling?: BubblingGuide;

  /**
   * 클릭 전 필요한 사전 조건
   */
  prerequisites?: TestPrerequisite[];
}

/**
 * 요소 그룹 (같은 유형의 요소들)
 */
export interface ElementGroup {
  /** 그룹 ID */
  groupId: string;

  /** 그룹 설명 (예: "메인 캐러셀 배너", "프로모션 카드") */
  description: string;

  /** 그룹에 속한 요소 ID 목록 */
  elementIds: string[];

  /** 그룹 내 대표 요소 ID (이것만 테스트해도 됨) */
  representativeElementId: string;

  /** 그룹의 공통 특성 */
  commonSelector?: string;
}

/**
 * 이벤트 버블링 처리 가이드
 */
export interface BubblingGuide {
  /**
   * 버블링 가능성 여부
   * true: 자식 요소 클릭 시 부모에서 이벤트 발생 가능
   */
  hasBubblingRisk: boolean;

  /**
   * 버블링 발생 시 실제 이벤트 발생 요소 찾는 방법
   * - closest_with_attr: ap-data-promotion 속성을 가진 가장 가까운 조상
   * - click_target: 클릭된 요소 자체
   * - delegated_parent: 이벤트 위임을 받은 부모 요소
   */
  eventSourceStrategy: 'closest_with_attr' | 'click_target' | 'delegated_parent';

  /** 버블링 감지용 속성 (예: "ap-data-promotion") */
  bubbleDetectionAttribute?: string;

  /**
   * 클릭 위치 가이드
   * 정확한 이벤트 발생을 위해 클릭해야 할 위치
   */
  clickLocationAdvice?: string;
}

/**
 * 테스트 사전 조건
 */
export interface TestPrerequisite {
  /** 조건 유형 */
  type: 'scroll_to' | 'wait_for' | 'hover' | 'click_other';

  /** 대상 요소 */
  targetSelector?: string;

  /** 대기 시간 (ms) */
  waitTime?: number;

  /** 설명 */
  description: string;
}

/**
 * 데이터 정확성 검증 결과 (단일 값)
 */
export interface DataAccuracyResult {
  /** 요소 ID */
  elementId: string;

  /** 파라미터명 */
  paramName: string;

  /** 화면에서 추출한 예상 값 */
  expectedValue: string | number | boolean;

  /** 실제 수집된 값 */
  actualValue: string | number | boolean;

  /** 매칭 여부 */
  matched: boolean;

  /** 불일치 사유 (matched가 false인 경우) */
  mismatchReason?: string;

  /** 심각도 */
  severity: 'critical' | 'warning' | 'info';
}

/**
 * 검증 결과 스키마 (Validation Agent용)
 */
export interface ValidationResult {
  /** 시나리오 참조 */
  scenarioRef: {
    eventName: string;
    pageUrl: string;
    generatedAt: string;
  };

  /** 검증 시간 */
  validatedAt: string;

  /** 전체 결과 */
  overallStatus: 'pass' | 'fail' | 'partial';

  /** 개별 요소 검증 결과 (이벤트 발생 여부) */
  elementResults: Array<{
    elementId: string;
    status: 'pass' | 'fail' | 'skipped';
    actualEvent?: any;
    expectedEvent?: any;
    errorMessage?: string;
  }>;

  /** False Positive 감지 결과 (발생하면 안 되는데 발생한 경우) */
  falsePositives: Array<{
    clickedElement: string;
    firedEvent: any;
    ruleId: string;
    errorMessage: string;
  }>;

  /**
   * 데이터 정확성 검증 결과
   *
   * 화면에 표시된 값 vs 실제 수집된 값 비교
   * 예: 화면에 "바나나"인데 "strawberry"로 수집되면 여기에 기록
   */
  dataAccuracyResults: DataAccuracyResult[];

  /** 요약 */
  summary: {
    totalElements: number;
    passed: number;
    failed: number;
    skipped: number;
    falsePositivesDetected: number;
    /** 데이터 정확성 불일치 수 */
    dataAccuracyMismatches: number;
  };
}
