/**
 * Branch Manager
 *
 * Content Group 기반 Branch를 관리합니다.
 * 논리적 테스트 단위 + Git branch 관리를 담당합니다.
 */

import * as path from 'path';
import { execSync } from 'child_process';
import {
  BranchConfig,
  BranchTestResult,
  BranchStatus,
  ContentGroup
} from './types';
import { BranchStateStore } from './BranchStateStore';
import { SpecDataLoader } from '../data/SpecDataLoader';
import { GA4DataFetcher } from '../data/GA4DataFetcher';

/**
 * Branch Manager 설정
 */
export interface BranchManagerConfig {
  /** 상태 저장 디렉토리 */
  stateDir?: string;
  /** Git branch 사용 여부 */
  gitEnabled?: boolean;
  /** Git remote 이름 */
  gitRemote?: string;
  /** Spec 파일 경로 */
  specPath?: string;
  /** GA4 Property ID */
  ga4PropertyId?: string;
  /** 기본 URL (상대 경로 변환용) */
  baseUrl?: string;
}

const DEFAULT_CONFIG: Required<BranchManagerConfig> = {
  stateDir: './output/branches',
  gitEnabled: false,
  gitRemote: 'origin',
  specPath: './config/ga4-event-parameters.json',
  ga4PropertyId: '',
  baseUrl: ''
};

/**
 * Branch Manager 클래스
 */
export class BranchManager {
  private config: Required<BranchManagerConfig>;
  private stateStore: BranchStateStore;
  private specLoader: SpecDataLoader;
  private branches: Map<string, BranchConfig> = new Map();
  private initialized: boolean = false;

  constructor(config?: BranchManagerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stateStore = new BranchStateStore({ stateDir: this.config.stateDir });
    this.specLoader = new SpecDataLoader(this.config.specPath);
  }

  /**
   * 초기화 - 스펙 로드 및 기존 상태 복원
   */
  async initialize(): Promise<void> {
    // 스펙 파일 로드
    const loadResult = await this.specLoader.load();
    if (!loadResult.success) {
      throw new Error(`스펙 로드 실패: ${loadResult.error}`);
    }

    // 저장된 상태 복원
    const savedBranches = this.stateStore.loadBranches();
    if (savedBranches.length > 0) {
      for (const branch of savedBranches) {
        this.branches.set(branch.id, branch);
      }
    }

    this.initialized = true;
  }

  /**
   * 스펙에서 Branch 설정 자동 생성
   */
  async initializeFromSpec(): Promise<BranchConfig[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const branchConfigs = this.specLoader.generateBranchConfigs();

    for (const config of branchConfigs) {
      this.branches.set(config.id, config);
    }

    // 상태 저장
    this.stateStore.saveBranches(Array.from(this.branches.values()));

    return branchConfigs;
  }

  /**
   * GA4 API에서 URL 채우기
   */
  async populateUrlsFromGA4(
    ga4Fetcher: GA4DataFetcher,
    dateRange: { startDate: string; endDate: string }
  ): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    const result = await ga4Fetcher.getAllContentGroupUrls({
      propertyId: this.config.ga4PropertyId,
      dateRange
    });

    if (!result.success || !result.data) {
      console.warn('GA4 URL 조회 실패:', result.error);
      return;
    }

    const urlMap = result.data;

    for (const [id, branch] of this.branches) {
      const urls = urlMap.get(branch.contentGroup);
      if (urls && urls.length > 0) {
        branch.testUrls = urls.slice(0, 10).map(url => {
          // 상대 경로를 절대 경로로 변환
          if (url.startsWith('/') && this.config.baseUrl) {
            return this.config.baseUrl + url;
          }
          return url;
        });
        this.branches.set(id, branch);
      }
    }

    // 상태 저장
    this.stateStore.saveBranches(Array.from(this.branches.values()));
  }

  /**
   * Branch 생성
   */
  createBranch(config: BranchConfig): void {
    this.branches.set(config.id, config);
    this.stateStore.saveBranches(Array.from(this.branches.values()));
  }

  /**
   * Branch 조회
   */
  getBranch(branchId: string): BranchConfig | undefined {
    return this.branches.get(branchId);
  }

  /**
   * Content Group으로 Branch 조회
   */
  getBranchByContentGroup(contentGroup: ContentGroup): BranchConfig | undefined {
    for (const branch of this.branches.values()) {
      if (branch.contentGroup === contentGroup) {
        return branch;
      }
    }
    return undefined;
  }

  /**
   * 모든 활성화된 Branch 반환
   */
  getEnabledBranches(): BranchConfig[] {
    return Array.from(this.branches.values()).filter(b => b.enabled);
  }

  /**
   * 모든 Branch 반환
   */
  getAllBranches(): BranchConfig[] {
    return Array.from(this.branches.values());
  }

  /**
   * Branch 상태 업데이트
   */
  updateBranchStatus(branchId: string, status: BranchStatus): boolean {
    return this.stateStore.updateBranchStatus(branchId, status);
  }

  /**
   * Branch 상태 조회
   */
  getBranchStatus(branchId: string): BranchStatus {
    return this.stateStore.loadStatus(branchId);
  }

  /**
   * 테스트 결과 저장
   */
  saveTestResult(result: BranchTestResult): void {
    this.stateStore.saveTestResult(result);

    // Git branch에 저장 (활성화된 경우)
    if (this.config.gitEnabled) {
      this.saveToGitBranch(result);
    }
  }

  /**
   * Git branch에 결과 저장
   */
  private saveToGitBranch(result: BranchTestResult): void {
    const branchName = `test-results/${result.contentGroup}`;

    try {
      // 현재 branch 저장
      const currentBranch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();

      // 결과 branch로 체크아웃 (없으면 생성)
      try {
        execSync(`git checkout ${branchName}`, { stdio: 'ignore' });
      } catch {
        // orphan branch 생성
        execSync(`git checkout --orphan ${branchName}`, { stdio: 'ignore' });
        execSync('git rm -rf .', { stdio: 'ignore' });
      }

      // 결과 파일 저장
      const resultPath = path.join(process.cwd(), 'result.json');
      const fs = require('fs');
      fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));

      // Git에 추가 및 커밋
      execSync('git add result.json', { stdio: 'ignore' });
      execSync(`git commit -m "Update ${result.contentGroup} test result"`, { stdio: 'ignore' });

      // 원래 branch로 복귀
      execSync(`git checkout ${currentBranch}`, { stdio: 'ignore' });

    } catch (error: any) {
      console.warn(`Git branch 저장 실패: ${error.message}`);
    }
  }

  /**
   * 특정 Content Group의 최신 결과 조회
   */
  getLatestResult(contentGroup: ContentGroup): BranchTestResult | null {
    return this.stateStore.loadLatestResult(contentGroup);
  }

  /**
   * 결과 히스토리 조회
   */
  getResultHistory(contentGroup: ContentGroup, limit: number = 10): BranchTestResult[] {
    return this.stateStore.getResultHistory(contentGroup, limit);
  }

  /**
   * Branch 활성화/비활성화
   */
  setBranchEnabled(branchId: string, enabled: boolean): boolean {
    const branch = this.branches.get(branchId);
    if (!branch) return false;

    branch.enabled = enabled;
    this.branches.set(branchId, branch);
    this.stateStore.saveBranches(Array.from(this.branches.values()));
    return true;
  }

  /**
   * Branch URL 업데이트
   */
  setBranchUrls(branchId: string, urls: string[]): boolean {
    const branch = this.branches.get(branchId);
    if (!branch) return false;

    branch.testUrls = urls;
    this.branches.set(branchId, branch);
    this.stateStore.saveBranches(Array.from(this.branches.values()));
    return true;
  }

  /**
   * 우선순위로 정렬된 Branch 목록
   */
  getBranchesByPriority(): BranchConfig[] {
    return Array.from(this.branches.values())
      .filter(b => b.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * 모든 Branch 상태 요약
   */
  getSummary(): {
    total: number;
    enabled: number;
    pending: number;
    inProgress: number;
    completed: number;
    failed: number;
    withUrls: number;
  } {
    const branches = Array.from(this.branches.values());

    let pending = 0, inProgress = 0, completed = 0, failed = 0, withUrls = 0;

    for (const branch of branches) {
      const status = this.stateStore.loadStatus(branch.id);
      switch (status) {
        case 'pending': pending++; break;
        case 'in_progress': inProgress++; break;
        case 'completed': completed++; break;
        case 'failed': failed++; break;
      }
      if (branch.testUrls.length > 0) withUrls++;
    }

    return {
      total: branches.length,
      enabled: branches.filter(b => b.enabled).length,
      pending,
      inProgress,
      completed,
      failed,
      withUrls
    };
  }

  /**
   * Content Group별 이벤트 목록 반환
   */
  getExpectedEvents(contentGroup: ContentGroup): string[] {
    const branch = this.getBranchByContentGroup(contentGroup);
    return branch?.expectedEvents || [];
  }

  /**
   * 모든 데이터 초기화
   */
  clear(): void {
    this.branches.clear();
    this.stateStore.clear();
  }

  /**
   * Spec Loader 반환 (외부에서 스펙 조회 필요시)
   */
  getSpecLoader(): SpecDataLoader {
    return this.specLoader;
  }

  /**
   * 상태 저장소 반환
   */
  getStateStore(): BranchStateStore {
    return this.stateStore;
  }
}

/**
 * 편의 함수: BranchManager 생성 및 초기화
 */
export async function createBranchManager(
  config?: BranchManagerConfig
): Promise<BranchManager> {
  const manager = new BranchManager(config);
  await manager.initialize();
  return manager;
}
