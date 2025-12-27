/**
 * GA4 Parameter Collector
 *
 * GA4 API에서 실제 수집된 파라미터 값을 가져옵니다.
 * Custom Dimension으로 등록된 파라미터만 조회 가능합니다.
 *
 * 서비스 계정 인증을 사용하여 Admin API와 Data API 모두 일관되게 접근합니다.
 */

import { GA4Client, GA4ClientConfig } from '../ga4/ga4Client';
import { GA4AdminClient } from '../ga4/ga4AdminClient';
import { GA4Parameter } from '../branch/types';
import * as fs from 'fs';
import * as path from 'path';

export interface CustomDimension {
  name: string;           // properties/xxx/customDimensions/xxx
  parameterName: string;  // 파라미터 이름
  displayName: string;    // 표시 이름
  scope: 'EVENT' | 'USER' | 'ITEM';
  description?: string;
}

export interface CollectedParameterValue {
  eventName: string;
  parameterName: string;
  values: {
    value: string;
    eventCount: number;
    proportion: number;
  }[];
  totalCount: number;
  collectedAt: Date;
}

export interface EventParameterSnapshot {
  eventName: string;
  contentGroup: string;
  parameters: CollectedParameterValue[];
  snapshotAt: Date;
}

/**
 * GA4 파라미터 수집기
 */
export class GA4ParameterCollector {
  private ga4Client: GA4Client | null = null;
  private adminClient: GA4AdminClient | null = null;
  private customDimensions: CustomDimension[] = [];
  private propertyId: string;
  private cacheDir: string;

  constructor(propertyId: string, cacheDir: string = './cache/ga4') {
    this.propertyId = propertyId;
    this.cacheDir = cacheDir;

    // 캐시 디렉토리 생성
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
  }

  /**
   * 초기화 - GA4 클라이언트 및 Custom Dimension 로드
   * 서비스 계정 인증을 사용하여 Admin API와 Data API 모두 접근합니다.
   */
  async initialize(): Promise<void> {
    // GA4 Data API 클라이언트 초기화 (서비스 계정 사용)
    try {
      this.ga4Client = new GA4Client({
        propertyId: this.propertyId,
        authType: 'service_account',
      });
      await this.ga4Client.initialize();
      console.log(`   ✅ GA4 Data API 초기화 완료 (서비스 계정)`);
    } catch (error: any) {
      console.warn(`⚠️ GA4 Data API 초기화 실패: ${error.message}`);
      // Data API 실패해도 Admin API로 Custom Dimension은 로드 가능
    }

    // GA4 Admin API 클라이언트 초기화 (서비스 계정 사용)
    try {
      this.adminClient = new GA4AdminClient({
        authType: 'service_account',
      });
      await this.adminClient.initialize();

      // Custom Dimension 목록 로드
      await this.loadCustomDimensions();
    } catch (error: any) {
      console.warn(`⚠️ Admin API 초기화 실패: ${error.message}`);
      console.warn('   캐시된 Custom Dimension 목록을 사용합니다.');
      this.loadCachedCustomDimensions();
    }

    console.log(`✅ GA4 Parameter Collector 초기화 완료`);
    console.log(`   Property ID: ${this.propertyId}`);
    console.log(`   Custom Dimensions: ${this.customDimensions.length}개`);
    console.log(`   Data API: ${this.ga4Client ? '활성' : '비활성'}`);
  }

  /**
   * Custom Dimension 목록 로드
   */
  private async loadCustomDimensions(): Promise<void> {
    if (!this.adminClient) return;

    try {
      const dimensions = await this.adminClient.listCustomDimensions(this.propertyId);

      this.customDimensions = dimensions.map((d: any) => ({
        name: d.name || '',
        parameterName: d.parameterName || '',
        displayName: d.displayName || d.parameterName || '',
        scope: d.scope === 'USER' ? 'USER' : d.scope === 'ITEM' ? 'ITEM' : 'EVENT',
        description: d.description,
      }));

      // 캐시에 저장
      this.cacheCustomDimensions();

      console.log(`   📊 Custom Dimensions 로드됨: ${this.customDimensions.length}개`);
    } catch (error: any) {
      console.warn(`Custom Dimension 로드 실패: ${error.message}`);
      this.loadCachedCustomDimensions();
    }
  }

  /**
   * Custom Dimension 캐시 저장
   */
  private cacheCustomDimensions(): void {
    const cachePath = path.join(this.cacheDir, `custom_dimensions_${this.propertyId}.json`);
    fs.writeFileSync(cachePath, JSON.stringify({
      propertyId: this.propertyId,
      updatedAt: new Date().toISOString(),
      dimensions: this.customDimensions,
    }, null, 2));
  }

  /**
   * 캐시된 Custom Dimension 로드
   */
  private loadCachedCustomDimensions(): void {
    const cachePath = path.join(this.cacheDir, `custom_dimensions_${this.propertyId}.json`);
    if (fs.existsSync(cachePath)) {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      this.customDimensions = data.dimensions || [];
      console.log(`   📦 캐시된 Custom Dimensions 로드됨: ${this.customDimensions.length}개`);
    }
  }

  /**
   * 이벤트별 파라미터 값 수집
   */
  async collectEventParameters(
    eventName: string,
    contentGroup: string,
    parameterNames?: string[]
  ): Promise<CollectedParameterValue[]> {
    if (!this.ga4Client) {
      console.warn(`   ⚠️ GA4 Data API가 비활성화되어 파라미터 수집을 건너뜁니다.`);
      return [];
    }

    const results: CollectedParameterValue[] = [];

    // 수집할 파라미터 목록 결정
    const paramsToCollect = parameterNames
      ? parameterNames.filter(p => this.isCustomDimension(p))
      : this.customDimensions
          .filter(d => d.scope === 'EVENT')
          .map(d => d.parameterName);

    if (paramsToCollect.length === 0) {
      console.log(`   ℹ️ ${eventName}: 수집할 Custom Dimension 파라미터 없음`);
      return results;
    }

    console.log(`   🔍 ${eventName} 파라미터 수집 중... (${paramsToCollect.length}개)`);

    // 핵심 파라미터만 우선 수집 (성능 최적화)
    const priorityParams = [
      'content_group', 'page_type', 'item_name', 'item_id',
      'item_category', 'item_brand', 'promotion_name', 'promotion_id',
    ];
    const sortedParams = paramsToCollect.sort((a, b) => {
      const aIdx = priorityParams.indexOf(a);
      const bIdx = priorityParams.indexOf(b);
      if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
      if (aIdx >= 0) return -1;
      if (bIdx >= 0) return 1;
      return 0;
    });

    // 최대 20개 파라미터만 수집 (성능/비용 고려)
    const limitedParams = sortedParams.slice(0, 20);

    for (const paramName of limitedParams) {
      try {
        const values = await this.ga4Client.getEventParameterValues(eventName, paramName, {
          startDate: '7daysAgo',
          endDate: 'today',
          limit: 20,
          contentGroup: contentGroup || undefined,  // 컨텐츠 그룹 필터 (비어있으면 전체)
        });

        if (values.length > 0) {
          const totalCount = values.reduce((sum, v) => sum + v.eventCount, 0);
          results.push({
            eventName,
            parameterName: paramName,
            values: values.map(v => ({
              value: v.value,
              eventCount: v.eventCount,
              proportion: v.proportion,
            })),
            totalCount,
            collectedAt: new Date(),
          });
        }
      } catch (error: any) {
        // 개별 파라미터 오류는 무시하고 계속 진행
        if (!error.message.includes('not found') && !error.message.includes('UNAUTHENTICATED')) {
          console.warn(`     ⚠️ ${paramName}: ${error.message}`);
        }
      }
    }

    console.log(`   ✅ ${eventName}: ${results.length}개 파라미터 수집 완료`);
    return results;
  }

  /**
   * 컨텐츠 그룹별 모든 이벤트 파라미터 수집
   */
  async collectAllEventParameters(
    contentGroup: string,
    eventNames: string[]
  ): Promise<EventParameterSnapshot[]> {
    const snapshots: EventParameterSnapshot[] = [];

    for (const eventName of eventNames) {
      const parameters = await this.collectEventParameters(eventName, contentGroup);
      if (parameters.length > 0) {
        snapshots.push({
          eventName,
          contentGroup,
          parameters,
          snapshotAt: new Date(),
        });
      }
    }

    return snapshots;
  }

  /**
   * 파라미터가 Custom Dimension인지 확인
   */
  isCustomDimension(parameterName: string): boolean {
    return this.customDimensions.some(d => d.parameterName === parameterName);
  }

  /**
   * Custom Dimension 목록 반환
   */
  getCustomDimensions(): CustomDimension[] {
    return this.customDimensions;
  }

  /**
   * GA4Parameter 형식으로 변환
   */
  convertToGA4Parameters(collected: CollectedParameterValue[]): GA4Parameter[] {
    return collected.map(c => ({
      name: c.parameterName,
      value: c.values[0]?.value || null,  // 가장 많이 수집된 값
      eventCount: c.totalCount,
      lastSeen: c.collectedAt,
      sampleValues: c.values.slice(0, 5).map(v => v.value),
    }));
  }

  /**
   * 스냅샷 저장
   */
  saveSnapshot(snapshots: EventParameterSnapshot[], filename: string): void {
    const outputPath = path.join(this.cacheDir, filename);
    fs.writeFileSync(outputPath, JSON.stringify(snapshots, null, 2));
    console.log(`   💾 스냅샷 저장됨: ${outputPath}`);
  }

  /**
   * 스냅샷 로드
   */
  loadSnapshot(filename: string): EventParameterSnapshot[] | null {
    const filePath = path.join(this.cacheDir, filename);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    return null;
  }
}

/**
 * 기본 GA4 Parameter Collector 생성
 */
export function createGA4ParameterCollector(): GA4ParameterCollector | null {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) {
    console.error('❌ GA4_PROPERTY_ID 환경변수가 설정되지 않았습니다.');
    return null;
  }
  return new GA4ParameterCollector(propertyId);
}
