/**
 * Branch Management Types
 *
 * Content Group 기반 multi-branch 테스트 시스템의 타입 정의
 */

/**
 * Content Group 타입 (ga4-event-parameters.json 기준)
 */
export type ContentGroup =
  | 'MAIN'
  | 'PRODUCT_DETAIL'
  | 'PRODUCT_LIST'
  | 'SEARCH_RESULT'
  | 'CART'
  | 'ORDER'
  | 'ORDER_COMPLETE'
  | 'MY'
  | 'EVENT_LIST'
  | 'EVENT_DETAIL'
  | 'BRAND_MAIN'
  | 'LIVE_LIST'
  | 'LIVE_DETAIL'
  | 'OTHERS';

/**
 * Branch 상태
 */
export type BranchStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

/**
 * Branch 설정
 */
export interface BranchConfig {
  /** Branch ID (e.g., 'test/MAIN', 'test/PRODUCT_DETAIL') */
  id: string;

  /** Content Group */
  contentGroup: ContentGroup;

  /** 테스트할 URL 목록 */
  testUrls: string[];

  /** 결과 저장용 Git branch 이름 */
  gitBranch?: string;

  /** Branch 활성화 여부 */
  enabled: boolean;

  /** 우선순위 (낮을수록 먼저 실행) */
  priority: number;

  /** 해당 Content Group에서 발생해야 할 이벤트 목록 */
  expectedEvents: string[];
}

/**
 * 예측된 파라미터 (Vision AI, URL, GTM 등에서 추출)
 */
export interface PredictedParameter {
  name: string;
  value: string | number | null;
  source: 'VISION' | 'URL' | 'GTM' | 'CONSTANT' | 'COMPUTED' | 'DATALAYER';
  confidence: 'high' | 'medium' | 'low';
  extractionReason: string;
}

/**
 * GA4 API에서 가져온 실제 파라미터
 */
export interface GA4Parameter {
  name: string;
  value: string | number | null;
  eventCount: number;
  lastSeen: Date;
  sampleValues?: string[];
}

/**
 * 스펙 문서 기반 파라미터 정의
 */
export interface SpecParameter {
  ga4Key: string;
  displayName: string;
  dataLayerVar?: string;
  required: boolean;
  description?: string;
  values?: string[];
  example?: string;
}

/**
 * 개발 계획 파라미터 (PDF 가이드 등)
 */
export interface PlannedParameter {
  name: string;
  source: string;
  plannedValue?: string;
  implementationStatus: 'implemented' | 'planned' | 'deprecated';
  notes?: string;
}

/**
 * Branch 내 이벤트별 데이터
 */
export interface BranchEventData {
  eventName: string;
  contentGroup: ContentGroup;
  pageUrl: string;

  /** Vision AI 등에서 예측한 파라미터 */
  predictedParams: PredictedParameter[];

  /** GA4 API에서 가져온 실제 파라미터 */
  actualParams: GA4Parameter[];

  /** ga4-event-parameters.json 스펙 */
  specParams: SpecParameter[];

  /** 개발 가이드 문서 기반 계획 파라미터 */
  plannedParams: PlannedParameter[];

  /** 수집 시간 */
  collectedAt: Date;
}

/**
 * 비교 Verdict
 */
export type ComparisonVerdict =
  | 'MATCH'                  // 예측 = 실제 = 스펙
  | 'PREDICTED_CORRECT'      // 예측 = 실제 (스펙과 다를 수 있음)
  | 'ACTUAL_MISSING'         // 예측했으나 GA4에서 수집 안됨
  | 'PREDICTION_WRONG'       // 예측 != 실제
  | 'SPEC_VIOLATION'         // 실제가 스펙 위반
  | 'NOT_IMPLEMENTED'        // 스펙에 있으나 수집 안됨
  | 'NOISE'                  // 노이즈 수집 (<0.01%)
  | 'EXTRA_COLLECTED'        // 스펙에 없는데 수집됨
  | 'UNKNOWN';

/**
 * 파라미터 비교 결과
 */
export interface ParameterComparison {
  parameterName: string;

  predicted: string | number | null;
  actual: string | number | null;
  spec: SpecParameter | null;
  planned: string | null;

  verdict: ComparisonVerdict;
  confidence: 'high' | 'medium' | 'low';

  details: {
    normalizedPredicted?: string;
    normalizedActual?: string;
    matchType?: 'exact' | 'normalized' | 'partial' | 'mismatch' | 'both_null' | 'one_null';
    discrepancyReason?: string;
  };
}

/**
 * 비교 이슈
 */
export interface ComparisonIssue {
  severity: 'critical' | 'warning' | 'info';
  type: 'missing_required' | 'wrong_value' | 'noise_collected' | 'not_in_spec' | 'spec_violation';
  parameter: string;
  eventName: string;
  message: string;
  suggestion?: string;
}

/**
 * 이벤트별 비교 결과
 */
export interface EventComparison {
  eventName: string;
  contentGroup: ContentGroup;
  url: string;

  parameters: ParameterComparison[];

  summary: {
    totalParams: number;
    matchedParams: number;
    predictionAccuracy: number;
    specCompliance: number;
    coverageRate: number;
  };

  issues: ComparisonIssue[];

  /** 이벤트 발생 예측 상세 */
  eventPrediction?: {
    prediction: 'AUTO_FIRE' | 'CONDITIONAL' | 'FORBIDDEN' | null;
    actualOccurred: boolean;
    actualCount: number;
    verdict: string;
  };
}

/**
 * Branch별 비교 결과
 */
export interface BranchComparisonResult {
  branchId: string;
  contentGroup: ContentGroup;

  events: EventComparison[];

  overall: {
    totalEvents: number;
    avgPredictionAccuracy: number;
    avgSpecCompliance: number;
    criticalIssues: number;
    warnings: number;
  };
}

/**
 * 테스트 에러
 */
export interface TestError {
  type: 'network' | 'timeout' | 'vision_api' | 'ga4_api' | 'parse' | 'unknown';
  message: string;
  stack?: string;
  timestamp: Date;
  recoverable: boolean;
}

/**
 * Branch 테스트 결과
 */
export interface BranchTestResult {
  branchId: string;
  contentGroup: ContentGroup;
  status: BranchStatus;

  startTime: Date;
  endTime?: Date;
  durationMs?: number;

  /** 테스트한 URL들 */
  testedUrls: string[];

  /** 수집된 이벤트 데이터 */
  events: BranchEventData[];

  /** 비교 결과 */
  comparison: BranchComparisonResult;

  /** 발생한 에러 */
  errors: TestError[];

  /** 스크린샷 경로들 */
  screenshots: string[];
}

/**
 * 전체 테스트 리포트
 */
export interface TestReport {
  metadata: {
    generatedAt: Date;
    ga4PropertyId: string;
    dateRange: { startDate: string; endDate: string };
    totalDurationMs: number;
    branchCount: number;
  };

  branches: BranchTestResult[];

  summary: {
    overallAccuracy: number;
    branchAccuracies: Record<ContentGroup, number>;
    topIssues: ComparisonIssue[];
    recommendations: string[];

    totalEvents: number;
    totalParameters: number;
    matchedParameters: number;

    byStatus: {
      completed: number;
      failed: number;
      skipped: number;
    };
  };

  /** HTML 대시보드용 차트 데이터 */
  charts?: {
    accuracyByBranch: ChartData;
    issuesBySeverity: ChartData;
    parameterCoverage: ChartData;
  };
}

/**
 * 차트 데이터
 */
export interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor?: string[];
    borderColor?: string[];
  }[];
}

/**
 * 리포트 형식
 */
export type ReportFormat = 'markdown' | 'json' | 'console' | 'html';

/**
 * 리포트 설정
 */
export interface ReportConfig {
  outputDir: string;
  formats: ReportFormat[];
  gitPush: boolean;
  includeScreenshots: boolean;
  includeCharts: boolean;
}
