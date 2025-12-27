/**
 * Orchestrator Types
 *
 * Multi-agent 테스트 오케스트레이션 관련 타입 정의
 */

import { ContentGroup, BranchConfig, ReportFormat } from '../branch/types';

/**
 * Orchestrator 설정
 */
export interface OrchestratorConfig {
  /** 최대 동시 실행 agent 수 */
  maxConcurrency: number;

  /** 테스트할 Branch 목록 */
  branches: BranchConfig[];

  /** GA4 Property ID */
  ga4PropertyId: string;

  /** 날짜 범위 */
  dateRange: {
    startDate: string;
    endDate: string;
  };

  /** Vision AI 설정 */
  visionConfig: {
    enabled: boolean;
    maxConcurrency: number;
    modelName?: string;
    apiKey?: string;
  };

  /** 리포트 설정 */
  reportConfig: {
    outputDir: string;
    formats: ReportFormat[];
    gitPush: boolean;
    includeScreenshots: boolean;
  };

  /** 재시도 설정 */
  retryConfig?: {
    maxRetries: number;
    retryDelayMs: number;
    exponentialBackoff: boolean;
  };

  /** 타임아웃 설정 (ms) */
  timeoutConfig?: {
    pageLoadTimeout: number;
    visionApiTimeout: number;
    ga4ApiTimeout: number;
  };
}

/**
 * Agent 태스크
 */
export interface AgentTask {
  /** 태스크 ID */
  taskId: string;

  /** Branch ID */
  branchId: string;

  /** Content Group */
  contentGroup: ContentGroup;

  /** 테스트할 URL */
  url: string;

  /** 테스트할 이벤트 목록 */
  events: string[];

  /** 우선순위 (낮을수록 먼저) */
  priority: number;

  /** 생성 시간 */
  createdAt: Date;

  /** 메타데이터 */
  metadata?: Record<string, any>;
}

/**
 * Agent 상태
 */
export type AgentStatus = 'idle' | 'running' | 'error' | 'completed';

/**
 * Agent 상태 정보
 */
export interface AgentState {
  /** Agent ID */
  agentId: string;

  /** 현재 상태 */
  status: AgentStatus;

  /** 현재 실행 중인 태스크 */
  currentTask?: AgentTask;

  /** 완료된 태스크 수 */
  completedTasks: number;

  /** 에러 발생 횟수 */
  errors: number;

  /** 마지막 활동 시간 */
  lastActivityAt: Date;

  /** 총 실행 시간 (ms) */
  totalRunTimeMs: number;
}

/**
 * 진행 상황
 */
export interface OrchestratorProgress {
  /** 전체 Branch 수 */
  totalBranches: number;

  /** 완료된 Branch 수 */
  completedBranches: number;

  /** 진행 중인 Branch 수 */
  inProgressBranches: number;

  /** 실패한 Branch 수 */
  failedBranches: number;

  /** 전체 태스크 수 */
  totalTasks: number;

  /** 완료된 태스크 수 */
  completedTasks: number;

  /** 진행 중인 태스크 수 */
  inProgressTasks: number;

  /** Agent 상태들 */
  agents: AgentState[];

  /** 예상 남은 시간 (초) */
  estimatedRemainingTime: number;

  /** 경과 시간 (초) */
  elapsedTime: number;

  /** 현재 진행률 (0-100) */
  progressPercent: number;

  /** 현재 단계 설명 */
  currentPhase: string;
}

/**
 * 태스크 결과
 */
export interface TaskResult {
  /** 태스크 ID */
  taskId: string;

  /** 성공 여부 */
  success: boolean;

  /** 실행 시간 (ms) */
  durationMs: number;

  /** 수집된 데이터 */
  data?: any;

  /** 에러 정보 */
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };

  /** 스크린샷 경로 */
  screenshotPath?: string;

  /** 메타데이터 */
  metadata?: Record<string, any>;

  /** Vision AI 예측 결과 (기획자/마케터 관점 요소 분석 포함) */
  visionPrediction?: {
    elementAnomalies?: {
      missingElements: Array<{
        element: string;
        severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
        reason: string;
        relatedEvent: string | null;
        businessImpact: string;
        possibleCause: string;
      }>;
      presentElements: string[];
      overallAssessment: '정상' | '주의필요' | '심각';
    };
  };
}

/**
 * 진행 이벤트 타입
 */
export type ProgressEventType =
  | 'started'
  | 'branch_started'
  | 'branch_completed'
  | 'branch_failed'
  | 'task_started'
  | 'task_completed'
  | 'task_failed'
  | 'agent_idle'
  | 'agent_error'
  | 'completed'
  | 'error';

/**
 * 진행 이벤트
 */
export interface ProgressEvent {
  /** 이벤트 타입 */
  type: ProgressEventType;

  /** 타임스탬프 */
  timestamp: Date;

  /** 관련 Branch ID */
  branchId?: string;

  /** 관련 태스크 ID */
  taskId?: string;

  /** 관련 Agent ID */
  agentId?: string;

  /** 이벤트 메시지 */
  message: string;

  /** 추가 데이터 */
  data?: any;
}

/**
 * 진행 콜백 함수
 */
export type ProgressCallback = (event: ProgressEvent) => void;

/**
 * 오케스트레이터 옵션
 */
export interface RunOptions {
  /** 특정 Content Group만 실행 */
  contentGroups?: ContentGroup[];

  /** 특정 Branch ID만 실행 */
  branchIds?: string[];

  /** Dry run (실제 실행 없이 계획만) */
  dryRun?: boolean;

  /** 진행 콜백 */
  onProgress?: ProgressCallback;

  /** 실패 시 계속 진행 */
  continueOnError?: boolean;

  /** 최대 실행 시간 (ms) */
  maxRunTimeMs?: number;
}

/**
 * 큐 우선순위 설정
 */
export interface QueuePriority {
  /** Content Group별 우선순위 (낮을수록 먼저) */
  contentGroupPriority: Record<ContentGroup, number>;

  /** 이벤트별 우선순위 */
  eventPriority?: Record<string, number>;
}

/**
 * 태스크 필터
 */
export interface TaskFilter {
  contentGroups?: ContentGroup[];
  events?: string[];
  status?: AgentStatus[];
}
