/**
 * Branch State Store
 *
 * Branch 상태를 파일 시스템에 저장하고 로드합니다.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  BranchConfig,
  BranchTestResult,
  BranchStatus,
  ContentGroup
} from './types';

/**
 * 저장된 Branch 상태
 */
export interface StoredBranchState {
  branches: BranchConfig[];
  lastUpdated: string;
  version: string;
}

/**
 * 저장된 테스트 결과
 */
export interface StoredTestResults {
  results: Record<string, BranchTestResult>;
  lastRun: string;
  totalRuns: number;
}

/**
 * Branch State Store 설정
 */
export interface BranchStateStoreConfig {
  stateDir: string;
  stateFileName?: string;
  resultsFileName?: string;
}

const DEFAULT_STATE_DIR = './output/branches';
const DEFAULT_STATE_FILE = 'branch-state.json';
const DEFAULT_RESULTS_FILE = 'test-results.json';
const STATE_VERSION = '1.0.0';

/**
 * Branch State Store 클래스
 */
export class BranchStateStore {
  private stateDir: string;
  private stateFilePath: string;
  private resultsFilePath: string;

  constructor(config?: Partial<BranchStateStoreConfig>) {
    this.stateDir = config?.stateDir || DEFAULT_STATE_DIR;
    this.stateFilePath = path.join(this.stateDir, config?.stateFileName || DEFAULT_STATE_FILE);
    this.resultsFilePath = path.join(this.stateDir, config?.resultsFileName || DEFAULT_RESULTS_FILE);

    this.ensureDirectoryExists();
  }

  /**
   * 디렉토리 존재 확인 및 생성
   */
  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.stateDir)) {
      fs.mkdirSync(this.stateDir, { recursive: true });
    }
  }

  /**
   * Branch 설정 저장
   */
  saveBranches(branches: BranchConfig[]): void {
    const state: StoredBranchState = {
      branches,
      lastUpdated: new Date().toISOString(),
      version: STATE_VERSION
    };

    fs.writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2));
  }

  /**
   * Branch 설정 로드
   */
  loadBranches(): BranchConfig[] {
    if (!fs.existsSync(this.stateFilePath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(this.stateFilePath, 'utf-8');
      const state: StoredBranchState = JSON.parse(content);
      return state.branches || [];
    } catch (error) {
      console.error('Branch 상태 로드 실패:', error);
      return [];
    }
  }

  /**
   * Branch 상태 업데이트
   */
  updateBranchStatus(branchId: string, status: BranchStatus): boolean {
    const branches = this.loadBranches();
    const branch = branches.find(b => b.id === branchId);

    if (!branch) {
      return false;
    }

    // 별도의 상태 저장
    this.saveStatus(branchId, status);
    return true;
  }

  /**
   * 개별 Branch 상태 저장
   */
  private saveStatus(branchId: string, status: BranchStatus): void {
    const statusPath = path.join(this.stateDir, `${branchId.replace(/\//g, '_')}_status.json`);
    const statusData = {
      branchId,
      status,
      updatedAt: new Date().toISOString()
    };

    const dir = path.dirname(statusPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(statusPath, JSON.stringify(statusData, null, 2));
  }

  /**
   * 개별 Branch 상태 로드
   */
  loadStatus(branchId: string): BranchStatus {
    const statusPath = path.join(this.stateDir, `${branchId.replace(/\//g, '_')}_status.json`);

    if (!fs.existsSync(statusPath)) {
      return 'pending';
    }

    try {
      const content = fs.readFileSync(statusPath, 'utf-8');
      const data = JSON.parse(content);
      return data.status || 'pending';
    } catch {
      return 'pending';
    }
  }

  /**
   * 테스트 결과 저장
   */
  saveTestResult(result: BranchTestResult): void {
    const results = this.loadAllTestResults();
    results.results[result.branchId] = result;
    results.lastRun = new Date().toISOString();
    results.totalRuns += 1;

    fs.writeFileSync(this.resultsFilePath, JSON.stringify(results, null, 2));

    // 개별 결과도 저장
    this.saveIndividualResult(result);
  }

  /**
   * 개별 테스트 결과 저장
   */
  private saveIndividualResult(result: BranchTestResult): void {
    const branchDir = path.join(this.stateDir, result.contentGroup);
    if (!fs.existsSync(branchDir)) {
      fs.mkdirSync(branchDir, { recursive: true });
    }

    // 최신 결과
    const latestPath = path.join(branchDir, 'latest.json');
    fs.writeFileSync(latestPath, JSON.stringify(result, null, 2));

    // 히스토리에 추가
    const historyDir = path.join(branchDir, 'history');
    if (!fs.existsSync(historyDir)) {
      fs.mkdirSync(historyDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const historyPath = path.join(historyDir, `${timestamp}.json`);
    fs.writeFileSync(historyPath, JSON.stringify(result, null, 2));
  }

  /**
   * 모든 테스트 결과 로드
   */
  loadAllTestResults(): StoredTestResults {
    if (!fs.existsSync(this.resultsFilePath)) {
      return {
        results: {},
        lastRun: '',
        totalRuns: 0
      };
    }

    try {
      const content = fs.readFileSync(this.resultsFilePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {
        results: {},
        lastRun: '',
        totalRuns: 0
      };
    }
  }

  /**
   * 특정 Branch의 최신 결과 로드
   */
  loadLatestResult(contentGroup: ContentGroup): BranchTestResult | null {
    const latestPath = path.join(this.stateDir, contentGroup, 'latest.json');

    if (!fs.existsSync(latestPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(latestPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Branch 결과 히스토리 조회
   */
  getResultHistory(contentGroup: ContentGroup, limit: number = 10): BranchTestResult[] {
    const historyDir = path.join(this.stateDir, contentGroup, 'history');

    if (!fs.existsSync(historyDir)) {
      return [];
    }

    try {
      const files = fs.readdirSync(historyDir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, limit);

      return files.map(f => {
        const content = fs.readFileSync(path.join(historyDir, f), 'utf-8');
        return JSON.parse(content);
      });
    } catch {
      return [];
    }
  }

  /**
   * 모든 데이터 초기화
   */
  clear(): void {
    if (fs.existsSync(this.stateFilePath)) {
      fs.unlinkSync(this.stateFilePath);
    }
    if (fs.existsSync(this.resultsFilePath)) {
      fs.unlinkSync(this.resultsFilePath);
    }
  }

  /**
   * 특정 Branch 데이터 삭제
   */
  clearBranch(contentGroup: ContentGroup): void {
    const branchDir = path.join(this.stateDir, contentGroup);
    if (fs.existsSync(branchDir)) {
      fs.rmSync(branchDir, { recursive: true });
    }
  }

  /**
   * 상태 디렉토리 경로 반환
   */
  getStateDir(): string {
    return this.stateDir;
  }

  /**
   * 상태 파일 존재 여부
   */
  hasState(): boolean {
    return fs.existsSync(this.stateFilePath);
  }

  /**
   * 요약 정보 반환
   */
  getSummary(): {
    branchCount: number;
    hasResults: boolean;
    lastRun: string | null;
    totalRuns: number;
  } {
    const branches = this.loadBranches();
    const results = this.loadAllTestResults();

    return {
      branchCount: branches.length,
      hasResults: Object.keys(results.results).length > 0,
      lastRun: results.lastRun || null,
      totalRuns: results.totalRuns
    };
  }
}
