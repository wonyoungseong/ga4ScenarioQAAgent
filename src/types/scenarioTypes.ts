/**
 * 시나리오 Agent의 최종 출력 형식
 * Vision AI가 GTM 기반으로 분석한 결과를 담는 구조
 */

// ═══════════════════════════════════════════════════════════════════════════
// 이벤트 트리거 유형
// ═══════════════════════════════════════════════════════════════════════════

export type TriggerType =
  | 'CLICK'              // 모든 요소 클릭
  | 'LINK_CLICK'         // <a> 태그 클릭
  | 'CUSTOM_EVENT'       // dataLayer.push 이벤트
  | 'PAGEVIEW'           // 페이지 로드
  | 'DOM_READY'          // DOM 준비
  | 'WINDOW_LOADED'      // 완전 로드
  | 'SCROLL'             // 스크롤 (일반)
  | 'SCROLL_DEPTH'       // 스크롤 깊이 (GTM)
  | 'VISIBILITY'         // 요소 노출 (일반)
  | 'ELEMENT_VISIBILITY' // 요소 노출 (GTM)
  | 'FORM_SUBMIT'        // 폼 제출
  | 'FORM_SUBMISSION'    // 폼 제출 (GTM)
  | 'YOUTUBE_VIDEO';     // 유튜브 비디오

// ═══════════════════════════════════════════════════════════════════════════
// 이벤트 카테고리 (Vision AI 분석 전략이 다름)
// ═══════════════════════════════════════════════════════════════════════════

export type EventCategory =
  | 'CLICK_BASED'     // 클릭 트리거 - 화면에서 클릭 요소 식별 필요
  | 'VIEW_BASED'      // 노출 트리거 - 화면에서 노출 요소 식별 필요
  | 'PAGE_BASED'      // 페이지 트리거 - 페이지 컨텍스트 필요
  | 'ACTION_BASED'    // 사용자 행동 - dataLayer를 통한 이벤트
  | 'SCROLL_BASED'    // 스크롤 트리거 - 스크롤 위치 필요
  | 'VIDEO_BASED';    // 비디오 트리거 - 비디오 요소 필요

// ═══════════════════════════════════════════════════════════════════════════
// Vision AI 입력 컨텍스트
// ═══════════════════════════════════════════════════════════════════════════

export interface VisionInputContext {
  // GTM 문서 기반 정보
  eventName: string;
  eventDescription: string;
  eventCategory: EventCategory;

  // 트리거 조건
  trigger: {
    type: TriggerType;
    typeDescription: string;
    conditions: TriggerCondition[];
  };

  // DOM 매칭 결과
  domMatching: {
    selector: string;
    matchedElements: MatchedDomElement[];
    explanation: string;
  };

  // 수집할 파라미터 정보
  expectedParameters: ExpectedParameter[];

  // 연관 이벤트 (혼동 방지)
  relatedEvents: RelatedEventInfo[];

  // 원본 JavaScript 코드 (AI 분석용)
  extractionLogic?: JavaScriptCode[];
}

export interface TriggerCondition {
  type: 'CSS_SELECTOR' | 'REGEX' | 'CONTAINS' | 'EQUALS' | 'CUSTOM_EVENT';
  target: string;  // {{Click Element}}, {{Page URL}} 등
  value: string;   // 실제 조건 값
  explanation: string;  // 사람이 읽을 수 있는 설명
}

export interface MatchedDomElement {
  selector: string;
  tagName: string;
  attributes: Record<string, string>;
  text: string;
  location: {
    description: string;  // "페이지 상단 좌측", "메인 배너 영역" 등
    boundingBox?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
}

export interface ExpectedParameter {
  name: string;
  type: 'string' | 'number' | 'array' | 'object';
  source: 'attribute' | 'dataLayer' | 'computed' | 'constant';
  sourceDetail: string;  // 구체적인 추출 방법
  example?: string;
  required: boolean;
}

export interface RelatedEventInfo {
  eventName: string;
  difference: string;  // 이 이벤트와의 차이점
  commonMistake?: string;  // 흔히 혼동하는 경우
}

export interface JavaScriptCode {
  variableName: string;
  code: string;
  purpose: string;  // 이 코드가 하는 일
}

// ═══════════════════════════════════════════════════════════════════════════
// 시나리오 Agent 출력
// ═══════════════════════════════════════════════════════════════════════════

export interface ScenarioAgentOutput {
  // 메타 정보
  meta: {
    url: string;
    timestamp: string;
    screenshotPath: string;
    eventName: string;
    eventCategory: EventCategory;
    analysisMethod: 'GTM_DOM_VISION' | 'VISION_ONLY';
  };

  // GTM 기반 분석 결과 (있는 경우)
  gtmAnalysis?: {
    triggerType: TriggerType;
    triggerDescription: string;
    cssSelectors: string[];
    matchedElementCount: number;
  };

  // 발생해야 하는 시나리오
  shouldFire: Scenario[];

  // 발생하면 안 되는 시나리오
  shouldNotFire: Scenario[];

  // 확인 불가 시나리오 (추가 정보 필요)
  uncertain: UncertainScenario[];

  // AI 분석 요약
  summary: {
    reasoning: string;
    gtmToVisualMapping: string;  // GTM 조건이 화면에서 어떻게 보이는지
    keyFindings: string[];
    recommendations: string[];
  };

  // 예상 파라미터 수집 정보
  expectedData: ExpectedDataCollection[];
}

export interface Scenario {
  id: string;

  // 시각적 설명
  visual: {
    elementDescription: string;  // "빨간색 프로모션 배너"
    location: string;            // "페이지 상단 중앙"
    screenshot?: {               // 요소의 스크린샷 좌표
      boundingBox: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    };
  };

  // 사용자 행동
  action: {
    type: 'click' | 'view' | 'scroll' | 'submit' | 'play' | 'input';
    description: string;  // "배너를 클릭한다"
    preconditions?: string[];  // 선행 조건 (예: "로그인 상태여야 함")
  };

  // 판단 근거
  reasoning: {
    gtmBased: string;    // GTM 트리거 조건 기반 판단
    visualBased: string; // 시각적 분석 기반 판단
    domBased?: string;   // DOM 구조 기반 판단
  };

  // 확신도
  confidence: 'high' | 'medium' | 'low';
  confidenceReason: string;

  // 예상 파라미터
  expectedParameters?: {
    name: string;
    expectedValue: string;
    source: string;
  }[];
}

export interface UncertainScenario {
  elementDescription: string;
  location: string;
  reason: string;  // 왜 확실하지 않은지
  additionalInfoNeeded: string[];  // 추가로 필요한 정보
}

export interface ExpectedDataCollection {
  parameterName: string;
  collectionMethod: string;
  sourceElement: string;
  sampleValue?: string;
  validationRule?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 이벤트별 설정 (확장 가능)
// ═══════════════════════════════════════════════════════════════════════════

export const EVENT_CATEGORY_MAP: Record<string, EventCategory> = {
  // Click-based events
  'select_promotion': 'CLICK_BASED',
  'select_item': 'CLICK_BASED',
  'ap_click': 'CLICK_BASED',
  'click_with_duration': 'CLICK_BASED',
  'brand_product_click': 'CLICK_BASED',

  // View-based events
  'view_promotion': 'VIEW_BASED',
  'view_item': 'VIEW_BASED',
  'view_item_list': 'VIEW_BASED',
  'view_promotion_detail': 'VIEW_BASED',
  'view_search_results': 'VIEW_BASED',

  // Page-based events
  'page_view': 'PAGE_BASED',
  'screen_view': 'PAGE_BASED',
  'page_load_time': 'PAGE_BASED',

  // Action-based events
  'add_to_cart': 'ACTION_BASED',
  'remove_from_cart': 'ACTION_BASED',
  'begin_checkout': 'ACTION_BASED',
  'purchase': 'ACTION_BASED',
  'login': 'ACTION_BASED',
  'sign_up': 'ACTION_BASED',
  'write_review': 'ACTION_BASED',

  // Scroll-based events
  'scroll': 'SCROLL_BASED',

  // Video-based events
  'video_start': 'VIDEO_BASED',
  'video_progress': 'VIDEO_BASED',
  'video_complete': 'VIDEO_BASED',
};

// ═══════════════════════════════════════════════════════════════════════════
// 분석 전략 (이벤트 카테고리별)
// ═══════════════════════════════════════════════════════════════════════════

export interface AnalysisStrategy {
  category: EventCategory;
  primaryFocus: string;
  domRequirements: string[];
  visualCues: string[];
  parameterSources: string[];
}

export const ANALYSIS_STRATEGIES: Record<EventCategory, AnalysisStrategy> = {
  'CLICK_BASED': {
    category: 'CLICK_BASED',
    primaryFocus: 'CSS Selector로 지정된 클릭 가능한 요소 식별',
    domRequirements: ['CSS Selector 매칭', 'data-* 속성 확인', 'href 속성'],
    visualCues: ['버튼 스타일', '링크 텍스트', '배너 이미지', '카드 레이아웃'],
    parameterSources: ['요소 속성', 'closest() 부모 요소', 'data-* 속성']
  },
  'VIEW_BASED': {
    category: 'VIEW_BASED',
    primaryFocus: '화면에 노출된 요소 식별',
    domRequirements: ['visibility 상태', 'viewport 내 위치'],
    visualCues: ['상품 목록', '프로모션 영역', '검색 결과'],
    parameterSources: ['요소 속성', 'dataLayer', 'URL 파라미터']
  },
  'PAGE_BASED': {
    category: 'PAGE_BASED',
    primaryFocus: '페이지 전체 컨텍스트 분석',
    domRequirements: ['페이지 URL', 'Content Group'],
    visualCues: ['페이지 레이아웃', '헤더/푸터', '네비게이션'],
    parameterSources: ['URL', 'document 속성', '메타 태그']
  },
  'ACTION_BASED': {
    category: 'ACTION_BASED',
    primaryFocus: '사용자 액션을 트리거하는 요소 식별',
    domRequirements: ['버튼 요소', '폼 요소', '액션 트리거'],
    visualCues: ['CTA 버튼', '장바구니 아이콘', '결제 버튼'],
    parameterSources: ['dataLayer.push', '폼 데이터', 'API 응답']
  },
  'SCROLL_BASED': {
    category: 'SCROLL_BASED',
    primaryFocus: '스크롤 깊이 및 위치 분석',
    domRequirements: ['페이지 높이', '스크롤 위치'],
    visualCues: ['콘텐츠 섹션', '스크롤 영역'],
    parameterSources: ['스크롤 %', '체류 시간', '노출 섹션']
  },
  'VIDEO_BASED': {
    category: 'VIDEO_BASED',
    primaryFocus: '비디오 플레이어 요소 식별',
    domRequirements: ['video 태그', 'iframe (YouTube)'],
    visualCues: ['비디오 썸네일', '플레이 버튼'],
    parameterSources: ['비디오 ID', '재생 시간', '진행률']
  }
};
