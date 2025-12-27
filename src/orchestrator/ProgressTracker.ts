/**
 * Progress Tracker
 *
 * 테스트 진행 상황을 추적하고 이벤트를 발생시킵니다.
 */

import { EventEmitter } from 'events';
import {
  OrchestratorProgress,
  AgentState,
  AgentStatus,
  ProgressEvent,
  ProgressEventType,
  ProgressCallback
} from './types';
import { ContentGroup } from '../branch/types';

/**
 * Progress Tracker 클래스
 */
export class ProgressTracker extends EventEmitter {
  private startTime: Date | null = null;
  private endTime: Date | null = null;

  private totalBranches: number = 0;
  private completedBranches: Set<string> = new Set();
  private inProgressBranches: Set<string> = new Set();
  private failedBranches: Set<string> = new Set();

  private totalTasks: number = 0;
  private completedTasks: number = 0;
  private inProgressTasks: Set<string> = new Set();

  private agents: Map<string, AgentState> = new Map();

  private eventHistory: ProgressEvent[] = [];
  private maxHistorySize: number = 1000;

  private callbacks: ProgressCallback[] = [];

  /**
   * 시작
   */
  start(totalBranches: number, totalTasks: number): void {
    this.startTime = new Date();
    this.endTime = null;
    this.totalBranches = totalBranches;
    this.totalTasks = totalTasks;

    this.emitEvent('started', `테스트 시작: ${totalBranches} branches, ${totalTasks} tasks`);
  }

  /**
   * 종료
   */
  complete(): void {
    this.endTime = new Date();
    this.emitEvent('completed', '테스트 완료');
  }

  /**
   * Branch 시작
   */
  branchStarted(branchId: string, contentGroup: ContentGroup): void {
    this.inProgressBranches.add(branchId);
    this.emitEvent('branch_started', `Branch 시작: ${contentGroup}`, { branchId });
  }

  /**
   * Branch 완료
   */
  branchCompleted(branchId: string, contentGroup: ContentGroup): void {
    this.inProgressBranches.delete(branchId);
    this.completedBranches.add(branchId);
    this.emitEvent('branch_completed', `Branch 완료: ${contentGroup}`, { branchId });
  }

  /**
   * Branch 실패
   */
  branchFailed(branchId: string, contentGroup: ContentGroup, error: string): void {
    this.inProgressBranches.delete(branchId);
    this.failedBranches.add(branchId);
    this.emitEvent('branch_failed', `Branch 실패: ${contentGroup} - ${error}`, { branchId });
  }

  /**
   * 태스크 시작
   */
  taskStarted(taskId: string, agentId: string): void {
    this.inProgressTasks.add(taskId);
    this.updateAgentTask(agentId, taskId);
    this.emitEvent('task_started', `태스크 시작: ${taskId}`, { taskId, agentId });
  }

  /**
   * 태스크 완료
   */
  taskCompleted(taskId: string, agentId: string, durationMs: number): void {
    this.inProgressTasks.delete(taskId);
    this.completedTasks++;
    this.updateAgentCompleted(agentId, durationMs);
    this.emitEvent('task_completed', `태스크 완료: ${taskId} (${durationMs}ms)`, { taskId, agentId });
  }

  /**
   * 태스크 실패
   */
  taskFailed(taskId: string, agentId: string, error: string): void {
    this.inProgressTasks.delete(taskId);
    this.updateAgentError(agentId);
    this.emitEvent('task_failed', `태스크 실패: ${taskId} - ${error}`, { taskId, agentId });
  }

  /**
   * Agent 등록
   */
  registerAgent(agentId: string): void {
    this.agents.set(agentId, {
      agentId,
      status: 'idle',
      completedTasks: 0,
      errors: 0,
      lastActivityAt: new Date(),
      totalRunTimeMs: 0
    });
  }

  /**
   * Agent 상태 업데이트
   */
  updateAgentStatus(agentId: string, status: AgentStatus): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = status;
      agent.lastActivityAt = new Date();
      this.agents.set(agentId, agent);

      if (status === 'idle') {
        this.emitEvent('agent_idle', `Agent 대기: ${agentId}`, { agentId });
      } else if (status === 'error') {
        this.emitEvent('agent_error', `Agent 에러: ${agentId}`, { agentId });
      }
    }
  }

  /**
   * Agent 태스크 할당
   */
  private updateAgentTask(agentId: string, taskId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'running';
      agent.currentTask = { taskId } as any;
      agent.lastActivityAt = new Date();
      this.agents.set(agentId, agent);
    }
  }

  /**
   * Agent 태스크 완료 업데이트
   */
  private updateAgentCompleted(agentId: string, durationMs: number): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'idle';
      agent.currentTask = undefined;
      agent.completedTasks++;
      agent.totalRunTimeMs += durationMs;
      agent.lastActivityAt = new Date();
      this.agents.set(agentId, agent);
    }
  }

  /**
   * Agent 에러 업데이트
   */
  private updateAgentError(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'idle';
      agent.currentTask = undefined;
      agent.errors++;
      agent.lastActivityAt = new Date();
      this.agents.set(agentId, agent);
    }
  }

  /**
   * 이벤트 발생
   */
  private emitEvent(
    type: ProgressEventType,
    message: string,
    data?: { branchId?: string; taskId?: string; agentId?: string }
  ): void {
    const event: ProgressEvent = {
      type,
      timestamp: new Date(),
      message,
      ...data
    };

    // 히스토리에 추가
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // EventEmitter 이벤트 발생
    this.emit('progress', event);
    this.emit(type, event);

    // 등록된 콜백 호출
    for (const callback of this.callbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error('Progress callback error:', error);
      }
    }
  }

  /**
   * 콜백 등록
   */
  onProgress(callback: ProgressCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * 콜백 제거
   */
  offProgress(callback: ProgressCallback): void {
    const index = this.callbacks.indexOf(callback);
    if (index !== -1) {
      this.callbacks.splice(index, 1);
    }
  }

  /**
   * 현재 진행 상황 반환
   */
  getProgress(): OrchestratorProgress {
    const elapsedTime = this.startTime
      ? Math.floor((Date.now() - this.startTime.getTime()) / 1000)
      : 0;

    const progressPercent = this.totalTasks > 0
      ? Math.round((this.completedTasks / this.totalTasks) * 100)
      : 0;

    // 남은 시간 추정 (완료된 태스크 기반)
    let estimatedRemainingTime = 0;
    if (this.completedTasks > 0 && elapsedTime > 0) {
      const avgTimePerTask = elapsedTime / this.completedTasks;
      const remainingTasks = this.totalTasks - this.completedTasks;
      estimatedRemainingTime = Math.round(avgTimePerTask * remainingTasks);
    }

    return {
      totalBranches: this.totalBranches,
      completedBranches: this.completedBranches.size,
      inProgressBranches: this.inProgressBranches.size,
      failedBranches: this.failedBranches.size,
      totalTasks: this.totalTasks,
      completedTasks: this.completedTasks,
      inProgressTasks: this.inProgressTasks.size,
      agents: Array.from(this.agents.values()),
      estimatedRemainingTime,
      elapsedTime,
      progressPercent,
      currentPhase: this.getCurrentPhase()
    };
  }

  /**
   * 현재 단계 설명
   */
  private getCurrentPhase(): string {
    if (!this.startTime) return 'Initializing';
    if (this.endTime) return 'Completed';
    if (this.inProgressBranches.size === 0 && this.completedBranches.size === 0) {
      return 'Starting';
    }
    if (this.inProgressBranches.size > 0) {
      return `Testing ${this.inProgressBranches.size} branches`;
    }
    return 'Processing';
  }

  /**
   * 이벤트 히스토리 반환
   */
  getEventHistory(limit?: number): ProgressEvent[] {
    if (limit) {
      return this.eventHistory.slice(-limit);
    }
    return [...this.eventHistory];
  }

  /**
   * 특정 타입의 이벤트만 필터링
   */
  getEventsByType(type: ProgressEventType): ProgressEvent[] {
    return this.eventHistory.filter(e => e.type === type);
  }

  /**
   * 실행 시간 반환 (ms)
   */
  getElapsedTimeMs(): number {
    if (!this.startTime) return 0;
    const endTime = this.endTime || new Date();
    return endTime.getTime() - this.startTime.getTime();
  }

  /**
   * 완료 여부
   */
  isCompleted(): boolean {
    return this.endTime !== null;
  }

  /**
   * 실행 중 여부
   */
  isRunning(): boolean {
    return this.startTime !== null && this.endTime === null;
  }

  /**
   * 초기화
   */
  reset(): void {
    this.startTime = null;
    this.endTime = null;
    this.totalBranches = 0;
    this.completedBranches.clear();
    this.inProgressBranches.clear();
    this.failedBranches.clear();
    this.totalTasks = 0;
    this.completedTasks = 0;
    this.inProgressTasks.clear();
    this.agents.clear();
    this.eventHistory = [];
  }
}
