/**
 * Task Queue
 *
 * 우선순위 기반 태스크 큐를 관리합니다.
 */

import { AgentTask, TaskFilter, QueuePriority } from './types';
import { ContentGroup, BranchConfig } from '../branch/types';

/**
 * 태스크 큐 클래스
 */
export class TaskQueue {
  private tasks: AgentTask[] = [];
  private processedTaskIds: Set<string> = new Set();
  private taskIdCounter: number = 0;

  /**
   * 태스크 추가
   */
  enqueue(task: Omit<AgentTask, 'taskId' | 'createdAt'>): AgentTask {
    const fullTask: AgentTask = {
      ...task,
      taskId: this.generateTaskId(),
      createdAt: new Date()
    };

    this.tasks.push(fullTask);
    this.sortByPriority();

    return fullTask;
  }

  /**
   * 여러 태스크 일괄 추가
   */
  enqueueBatch(tasks: Omit<AgentTask, 'taskId' | 'createdAt'>[]): AgentTask[] {
    const fullTasks = tasks.map(task => ({
      ...task,
      taskId: this.generateTaskId(),
      createdAt: new Date()
    }));

    this.tasks.push(...fullTasks);
    this.sortByPriority();

    return fullTasks;
  }

  /**
   * 다음 태스크 가져오기 (큐에서 제거)
   */
  dequeue(): AgentTask | undefined {
    const task = this.tasks.shift();
    if (task) {
      this.processedTaskIds.add(task.taskId);
    }
    return task;
  }

  /**
   * 다음 태스크 미리보기 (큐에서 제거하지 않음)
   */
  peek(): AgentTask | undefined {
    return this.tasks[0];
  }

  /**
   * 특정 조건의 태스크 가져오기
   */
  dequeueWithFilter(filter: TaskFilter): AgentTask | undefined {
    const index = this.tasks.findIndex(task => {
      if (filter.contentGroups && !filter.contentGroups.includes(task.contentGroup)) {
        return false;
      }
      if (filter.events && !task.events.some(e => filter.events!.includes(e))) {
        return false;
      }
      return true;
    });

    if (index === -1) return undefined;

    const [task] = this.tasks.splice(index, 1);
    this.processedTaskIds.add(task.taskId);
    return task;
  }

  /**
   * Branch 설정에서 태스크 생성
   */
  createTasksFromBranch(branch: BranchConfig): AgentTask[] {
    const tasks: AgentTask[] = [];

    for (const url of branch.testUrls) {
      tasks.push({
        taskId: this.generateTaskId(),
        branchId: branch.id,
        contentGroup: branch.contentGroup,
        url,
        events: branch.expectedEvents,
        priority: branch.priority,
        createdAt: new Date()
      });
    }

    return tasks;
  }

  /**
   * 여러 Branch에서 태스크 생성 및 추가
   */
  createTasksFromBranches(branches: BranchConfig[]): AgentTask[] {
    const allTasks: AgentTask[] = [];

    for (const branch of branches) {
      const branchTasks = this.createTasksFromBranch(branch);
      allTasks.push(...branchTasks);
    }

    this.tasks.push(...allTasks);
    this.sortByPriority();

    return allTasks;
  }

  /**
   * 우선순위로 정렬
   */
  private sortByPriority(): void {
    this.tasks.sort((a, b) => {
      // 우선순위가 같으면 생성 시간순
      if (a.priority === b.priority) {
        return a.createdAt.getTime() - b.createdAt.getTime();
      }
      return a.priority - b.priority;
    });
  }

  /**
   * 태스크 ID 생성
   */
  private generateTaskId(): string {
    return `task-${Date.now()}-${++this.taskIdCounter}`;
  }

  /**
   * 큐 크기
   */
  size(): number {
    return this.tasks.length;
  }

  /**
   * 큐가 비었는지 확인
   */
  isEmpty(): boolean {
    return this.tasks.length === 0;
  }

  /**
   * 특정 태스크 제거
   */
  remove(taskId: string): boolean {
    const index = this.tasks.findIndex(t => t.taskId === taskId);
    if (index !== -1) {
      this.tasks.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 특정 Branch의 태스크들 제거
   */
  removeByBranch(branchId: string): number {
    const beforeCount = this.tasks.length;
    this.tasks = this.tasks.filter(t => t.branchId !== branchId);
    return beforeCount - this.tasks.length;
  }

  /**
   * 특정 Content Group의 태스크들 제거
   */
  removeByContentGroup(contentGroup: ContentGroup): number {
    const beforeCount = this.tasks.length;
    this.tasks = this.tasks.filter(t => t.contentGroup !== contentGroup);
    return beforeCount - this.tasks.length;
  }

  /**
   * 큐 초기화
   */
  clear(): void {
    this.tasks = [];
  }

  /**
   * 처리 기록 초기화
   */
  clearProcessedHistory(): void {
    this.processedTaskIds.clear();
  }

  /**
   * 태스크가 이미 처리되었는지 확인
   */
  isProcessed(taskId: string): boolean {
    return this.processedTaskIds.has(taskId);
  }

  /**
   * 모든 태스크 목록 반환 (읽기 전용)
   */
  getAllTasks(): readonly AgentTask[] {
    return [...this.tasks];
  }

  /**
   * Content Group별 태스크 수
   */
  getTaskCountByContentGroup(): Record<ContentGroup, number> {
    const counts: Partial<Record<ContentGroup, number>> = {};

    for (const task of this.tasks) {
      counts[task.contentGroup] = (counts[task.contentGroup] || 0) + 1;
    }

    return counts as Record<ContentGroup, number>;
  }

  /**
   * Branch별 태스크 수
   */
  getTaskCountByBranch(): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const task of this.tasks) {
      counts[task.branchId] = (counts[task.branchId] || 0) + 1;
    }

    return counts;
  }

  /**
   * 처리된 태스크 수
   */
  getProcessedCount(): number {
    return this.processedTaskIds.size;
  }

  /**
   * 큐 통계
   */
  getStats(): {
    pending: number;
    processed: number;
    total: number;
    byContentGroup: Record<string, number>;
    byBranch: Record<string, number>;
  } {
    return {
      pending: this.tasks.length,
      processed: this.processedTaskIds.size,
      total: this.tasks.length + this.processedTaskIds.size,
      byContentGroup: this.getTaskCountByContentGroup(),
      byBranch: this.getTaskCountByBranch()
    };
  }
}
