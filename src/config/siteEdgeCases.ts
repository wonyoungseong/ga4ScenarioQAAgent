/**
 * 사이트별 Edge Case 관리 시스템
 *
 * GA4 Property ID 기준으로 사이트별 특이사항을 관리합니다.
 * - 표준 예측 로직에서 벗어나는 경우
 * - 사이트별 고유한 이벤트 발생 조건
 * - 페이지별 이벤트 허용/비허용 예외
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Edge Case 타입 정의
 */
export type EdgeCaseType =
  | 'PAGE_RESTRICTION'      // 특정 페이지에서만 발생
  | 'PAGE_EXCLUSION'        // 특정 페이지에서 발생 안함
  | 'CONDITIONAL_FIRE'      // 조건부 발생
  | 'CUSTOM_TRIGGER'        // 커스텀 트리거 조건
  | 'DATA_LAYER_ALIAS'      // dataLayer 이벤트명이 다름
  | 'NOISE_EXPECTED'        // 노이즈 수집이 예상됨
  | 'NOT_IMPLEMENTED'       // 미구현 상태
  | 'DEPRECATED'            // 더 이상 사용 안함
  | 'SESSION_ONCE';         // 세션당 1회만 발생 (정확도 계산 제외)

/**
 * 개별 Edge Case 정의
 */
export interface EdgeCase {
  /** 이벤트 이름 */
  eventName: string;

  /** Edge Case 타입 */
  type: EdgeCaseType;

  /** 상세 설명 */
  description: string;

  /** 영향받는 페이지 타입 (해당되는 경우) */
  affectedPageTypes?: string[];

  /** 허용되는 페이지 타입 (PAGE_RESTRICTION인 경우) */
  allowedPageTypes?: string[];

  /** 제외되는 페이지 타입 (PAGE_EXCLUSION인 경우) */
  excludedPageTypes?: string[];

  /** dataLayer 이벤트 별칭 (DATA_LAYER_ALIAS인 경우) */
  dataLayerEventName?: string;

  /** 조건 (CONDITIONAL_FIRE인 경우) */
  condition?: string;

  /** 예상 노이즈 비중 (NOISE_EXPECTED인 경우) */
  expectedNoisePercent?: number;

  /** 등록일 */
  createdAt: string;

  /** 마지막 확인일 */
  lastVerified?: string;

  /** 담당자/출처 */
  source?: string;
}

/**
 * 사이트별 Edge Case 설정
 */
export interface SiteEdgeCaseConfig {
  /** GA4 Property ID */
  propertyId: string;

  /** 사이트 이름 */
  siteName: string;

  /** 사이트 도메인 */
  domain: string;

  /** GTM Container ID */
  gtmContainerId?: string;

  /** Edge Cases 목록 */
  edgeCases: EdgeCase[];

  /** 메타데이터 */
  metadata: {
    createdAt: string;
    updatedAt: string;
    version: string;
  };
}

/**
 * 전체 Edge Case 저장소
 */
export interface EdgeCaseRepository {
  /** 스키마 버전 */
  schemaVersion: string;

  /** Property ID → Config 매핑 */
  sites: Record<string, SiteEdgeCaseConfig>;
}

const EDGE_CASES_PATH = path.join(__dirname, '../../config/edge-cases.json');

/**
 * Edge Case 로더 클래스
 */
export class EdgeCaseLoader {
  private repository: EdgeCaseRepository | null = null;

  /**
   * Edge Case 저장소 로드
   */
  load(): EdgeCaseRepository {
    if (this.repository) {
      return this.repository;
    }

    if (!fs.existsSync(EDGE_CASES_PATH)) {
      // 기본 구조 생성
      this.repository = {
        schemaVersion: '1.0.0',
        sites: {},
      };
      return this.repository;
    }

    this.repository = JSON.parse(fs.readFileSync(EDGE_CASES_PATH, 'utf8'));
    return this.repository!;
  }

  /**
   * 특정 Property ID의 Edge Cases 조회
   */
  getEdgeCasesForProperty(propertyId: string): EdgeCase[] {
    const repo = this.load();
    return repo.sites[propertyId]?.edgeCases || [];
  }

  /**
   * 특정 이벤트의 Edge Case 조회
   */
  getEventEdgeCase(propertyId: string, eventName: string): EdgeCase | undefined {
    const cases = this.getEdgeCasesForProperty(propertyId);
    return cases.find(c => c.eventName === eventName);
  }

  /**
   * 페이지 타입에서 이벤트 허용 여부 확인 (Edge Case 반영)
   */
  isEventAllowedOnPage(
    propertyId: string,
    eventName: string,
    pageType: string,
    defaultAllowed: boolean
  ): { allowed: boolean; reason: string } {
    const edgeCase = this.getEventEdgeCase(propertyId, eventName);

    if (!edgeCase) {
      return { allowed: defaultAllowed, reason: 'No edge case defined' };
    }

    switch (edgeCase.type) {
      case 'PAGE_RESTRICTION':
        if (edgeCase.allowedPageTypes) {
          const allowed = edgeCase.allowedPageTypes.includes(pageType);
          return {
            allowed,
            reason: allowed
              ? `Edge case: Allowed on ${pageType}`
              : `Edge case: Only allowed on ${edgeCase.allowedPageTypes.join(', ')}`,
          };
        }
        break;

      case 'PAGE_EXCLUSION':
        if (edgeCase.excludedPageTypes) {
          const excluded = edgeCase.excludedPageTypes.includes(pageType);
          return {
            allowed: !excluded,
            reason: excluded
              ? `Edge case: Excluded from ${pageType}`
              : 'Edge case: Not in exclusion list',
          };
        }
        break;

      case 'NOT_IMPLEMENTED':
        return {
          allowed: false,
          reason: `Edge case: Not implemented - ${edgeCase.description}`,
        };

      case 'DEPRECATED':
        return {
          allowed: false,
          reason: `Edge case: Deprecated - ${edgeCase.description}`,
        };
    }

    return { allowed: defaultAllowed, reason: 'Edge case exists but no page restriction' };
  }

  /**
   * 노이즈 예상 여부 확인
   */
  isNoiseExpected(propertyId: string, eventName: string, pageType: string): {
    expected: boolean;
    maxPercent: number;
    reason: string;
  } {
    const edgeCase = this.getEventEdgeCase(propertyId, eventName);

    if (edgeCase?.type === 'NOISE_EXPECTED') {
      const affected = !edgeCase.affectedPageTypes ||
        edgeCase.affectedPageTypes.includes(pageType);

      if (affected) {
        return {
          expected: true,
          maxPercent: edgeCase.expectedNoisePercent || 0.01,
          reason: edgeCase.description,
        };
      }
    }

    return { expected: false, maxPercent: 0, reason: '' };
  }

  /**
   * 사이트 설정 저장
   */
  saveSiteConfig(config: SiteEdgeCaseConfig): void {
    const repo = this.load();
    config.metadata.updatedAt = new Date().toISOString();
    repo.sites[config.propertyId] = config;

    const dir = path.dirname(EDGE_CASES_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(EDGE_CASES_PATH, JSON.stringify(repo, null, 2));
    console.log(`✅ Edge cases saved for ${config.siteName} (${config.propertyId})`);
  }

  /**
   * Edge Case 추가
   */
  addEdgeCase(propertyId: string, edgeCase: EdgeCase): void {
    const repo = this.load();

    if (!repo.sites[propertyId]) {
      throw new Error(`Site config not found for property ${propertyId}. Create site config first.`);
    }

    // 기존 Edge Case 업데이트 또는 새로 추가
    const existing = repo.sites[propertyId].edgeCases.findIndex(
      c => c.eventName === edgeCase.eventName && c.type === edgeCase.type
    );

    if (existing >= 0) {
      repo.sites[propertyId].edgeCases[existing] = edgeCase;
    } else {
      repo.sites[propertyId].edgeCases.push(edgeCase);
    }

    repo.sites[propertyId].metadata.updatedAt = new Date().toISOString();
    fs.writeFileSync(EDGE_CASES_PATH, JSON.stringify(repo, null, 2));
  }

  /**
   * 전체 Edge Case 요약 출력
   */
  printSummary(propertyId?: string): void {
    const repo = this.load();

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('📋 Edge Case Summary');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const sites = propertyId
      ? { [propertyId]: repo.sites[propertyId] }
      : repo.sites;

    for (const [propId, config] of Object.entries(sites)) {
      if (!config) continue;

      console.log(`🏢 ${config.siteName} (${propId})`);
      console.log(`   Domain: ${config.domain}`);
      console.log(`   Edge Cases: ${config.edgeCases.length}개\n`);

      for (const ec of config.edgeCases) {
        const typeIcon = {
          'PAGE_RESTRICTION': '📍',
          'PAGE_EXCLUSION': '🚫',
          'CONDITIONAL_FIRE': '⚡',
          'CUSTOM_TRIGGER': '🔧',
          'DATA_LAYER_ALIAS': '🏷️',
          'NOISE_EXPECTED': '🔇',
          'NOT_IMPLEMENTED': '⏸️',
          'DEPRECATED': '❌',
          'SESSION_ONCE': '🔄',
        }[ec.type] || '📌';

        console.log(`   ${typeIcon} ${ec.eventName} [${ec.type}]`);
        console.log(`      ${ec.description}`);
        if (ec.allowedPageTypes) {
          console.log(`      Allowed on: ${ec.allowedPageTypes.join(', ')}`);
        }
        if (ec.excludedPageTypes) {
          console.log(`      Excluded from: ${ec.excludedPageTypes.join(', ')}`);
        }
        console.log('');
      }
    }
  }
}

/**
 * 싱글톤 인스턴스
 */
export const edgeCaseLoader = new EdgeCaseLoader();
