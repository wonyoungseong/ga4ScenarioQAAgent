/**
 * GTM + GA4 병렬 로더
 *
 * GTM JSON 파싱과 GA4 Admin API 호출을 병렬로 수행하여
 * 파라미터 맵핑 사전 자료를 생성합니다.
 */

import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { OAuth2Client } from 'google-auth-library';
import { AnalyticsAdminServiceClient } from '@google-analytics/admin';
import { GTMEventParameterExtractor, GTMEventDefinition } from '../config/gtmEventParameterExtractor';

dotenv.config();

const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID || '416629733';
const TOKEN_PATH = './credentials/ga4_tokens.json';
const GTM_JSON_PATH = './GTM-5FK5X5C4_workspace112.json';
const CACHE_PATH = './output/ga4_custom_definitions.json';

export interface GA4CustomDefinition {
  parameterName: string;
  displayName: string;
  scope: string;
  type: 'dimension' | 'metric';
}

export interface GTMExtractedData {
  events: GTMEventDefinition[];
  customEventParams: string[];
  customItemParams: string[];
}

export interface GA4DefinitionsData {
  eventDimensions: GA4CustomDefinition[];
  itemDimensions: GA4CustomDefinition[];
  userDimensions: GA4CustomDefinition[];
  eventMetrics: GA4CustomDefinition[];
}

export interface ParameterMapping {
  parameterName: string;
  gtmUsed: boolean;
  ga4Registered: boolean;
  ga4DisplayName?: string;
  scope: 'event' | 'item' | 'user';
  usedInEvents?: string[];
}

export interface ParallelLoadResult {
  loadedAt: string;
  loadTimeMs: number;
  gtm: GTMExtractedData;
  ga4: GA4DefinitionsData;
  comparison: {
    eventParams: {
      registered: string[];
      missing: string[];
      extra: string[];
    };
    itemParams: {
      registered: string[];
      missing: string[];
      extra: string[];
    };
    coverageRate: number;
  };
  parameterMappings: ParameterMapping[];
}

export class GTMGa4ParallelLoader {
  private useCache: boolean;

  constructor(options?: { useCache?: boolean }) {
    this.useCache = options?.useCache ?? true;
  }

  /**
   * GTM과 GA4 데이터를 병렬로 로드하고 비교 결과 생성
   */
  async loadAll(): Promise<ParallelLoadResult> {
    const startTime = Date.now();

    console.log('🚀 GTM + GA4 병렬 로딩 시작...');

    // 병렬 실행
    const [gtmData, ga4Data] = await Promise.all([
      this.parseGTMJson(),
      this.fetchGA4Definitions(),
    ]);

    console.log('✅ 병렬 로딩 완료');

    // 비교 및 맵핑 생성
    const comparison = this.compareParameters(gtmData, ga4Data);
    const parameterMappings = this.createParameterMappings(gtmData, ga4Data);

    const loadTimeMs = Date.now() - startTime;
    console.log(`⏱️  총 소요시간: ${loadTimeMs}ms`);

    return {
      loadedAt: new Date().toISOString(),
      loadTimeMs,
      gtm: gtmData,
      ga4: ga4Data,
      comparison,
      parameterMappings,
    };
  }

  /**
   * GTM JSON 파싱 (로컬 파일)
   */
  private async parseGTMJson(): Promise<GTMExtractedData> {
    const start = Date.now();
    console.log('  📦 GTM JSON 파싱 중...');

    const extractor = new GTMEventParameterExtractor(GTM_JSON_PATH);
    const events = extractor.extractAllEvents();
    const customEventParams = extractor.getAllCustomEventParameters();
    const customItemParams = extractor.getAllCustomItemParameters();

    console.log(`  ✓ GTM 완료 (${Date.now() - start}ms) - ${events.length}개 이벤트, ${customEventParams.length}개 Event 파라미터, ${customItemParams.length}개 Item 파라미터`);

    return { events, customEventParams, customItemParams };
  }

  /**
   * GA4 맞춤 측정기준/항목 조회 (캐시 또는 API)
   */
  private async fetchGA4Definitions(): Promise<GA4DefinitionsData> {
    const start = Date.now();
    console.log('  🔍 GA4 정의 로드 중...');

    // 캐시 사용 시
    if (this.useCache && fs.existsSync(CACHE_PATH)) {
      const cached = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
      const result = this.parseGA4CachedData(cached);
      console.log(`  ✓ GA4 완료 (캐시, ${Date.now() - start}ms)`);
      return result;
    }

    // API 호출
    try {
      const result = await this.fetchFromGA4AdminAPI();
      console.log(`  ✓ GA4 완료 (API, ${Date.now() - start}ms)`);
      return result;
    } catch (error: any) {
      console.log(`  ⚠️ GA4 API 실패, 캐시 사용: ${error.message}`);
      if (fs.existsSync(CACHE_PATH)) {
        const cached = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
        return this.parseGA4CachedData(cached);
      }
      throw error;
    }
  }

  /**
   * GA4 Admin API 직접 호출
   */
  private async fetchFromGA4AdminAPI(): Promise<GA4DefinitionsData> {
    if (!fs.existsSync(TOKEN_PATH)) {
      throw new Error('GA4 토큰 파일이 없습니다: ' + TOKEN_PATH);
    }

    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    const oauth2Client = new OAuth2Client();
    oauth2Client.setCredentials({ access_token: tokens.access_token });

    const adminClient = new AnalyticsAdminServiceClient({ authClient: oauth2Client });

    // 병렬로 dimensions와 metrics 조회
    const [dimensionsResponse, metricsResponse] = await Promise.all([
      adminClient.listCustomDimensions({ parent: `properties/${GA4_PROPERTY_ID}` }),
      adminClient.listCustomMetrics({ parent: `properties/${GA4_PROPERTY_ID}` }),
    ]);

    const dimensions = (dimensionsResponse[0] || []).map(d => ({
      parameterName: d.parameterName || '',
      displayName: d.displayName || '',
      scope: String(d.scope || ''),
      type: 'dimension' as const,
    }));

    const metrics = (metricsResponse[0] || []).map(m => ({
      parameterName: m.parameterName || '',
      displayName: m.displayName || '',
      scope: String(m.scope || ''),
      type: 'metric' as const,
    }));

    return {
      eventDimensions: dimensions.filter(d => d.scope === 'EVENT'),
      itemDimensions: dimensions.filter(d => d.scope === 'ITEM'),
      userDimensions: dimensions.filter(d => d.scope === 'USER'),
      eventMetrics: metrics.filter(m => m.scope === 'EVENT'),
    };
  }

  /**
   * 캐시된 GA4 데이터 파싱
   */
  private parseGA4CachedData(cached: any): GA4DefinitionsData {
    const eventDimensions = (cached.customDimensions?.eventScope || []).map((d: any) => ({
      parameterName: d.parameterName,
      displayName: d.displayName,
      scope: 'EVENT',
      type: 'dimension' as const,
    }));

    const itemDimensions = (cached.customDimensions?.itemScope || []).map((d: any) => ({
      parameterName: d.parameterName,
      displayName: d.displayName,
      scope: 'ITEM',
      type: 'dimension' as const,
    }));

    const userDimensions = (cached.customDimensions?.userScope || []).map((d: any) => ({
      parameterName: d.parameterName,
      displayName: d.displayName,
      scope: 'USER',
      type: 'dimension' as const,
    }));

    const eventMetrics = (cached.customMetrics || []).map((m: any) => ({
      parameterName: m.parameterName,
      displayName: m.displayName,
      scope: 'EVENT',
      type: 'metric' as const,
    }));

    return { eventDimensions, itemDimensions, userDimensions, eventMetrics };
  }

  /**
   * GTM vs GA4 파라미터 비교
   */
  private compareParameters(gtm: GTMExtractedData, ga4: GA4DefinitionsData) {
    // Event 파라미터 비교
    const ga4EventParamSet = new Set([
      ...ga4.eventDimensions.map(d => d.parameterName),
      ...ga4.eventMetrics.map(m => m.parameterName),
    ]);

    const eventRegistered = gtm.customEventParams.filter(p => ga4EventParamSet.has(p));
    const eventMissing = gtm.customEventParams.filter(p => !ga4EventParamSet.has(p));
    const eventExtra = Array.from(ga4EventParamSet).filter(p => !gtm.customEventParams.includes(p));

    // Item 파라미터 비교
    const ga4ItemParamSet = new Set(ga4.itemDimensions.map(d => d.parameterName));

    const itemRegistered = gtm.customItemParams.filter(p => ga4ItemParamSet.has(p));
    const itemMissing = gtm.customItemParams.filter(p => !ga4ItemParamSet.has(p));
    const itemExtra = Array.from(ga4ItemParamSet).filter(p => !gtm.customItemParams.includes(p));

    const totalGTM = gtm.customEventParams.length + gtm.customItemParams.length;
    const totalRegistered = eventRegistered.length + itemRegistered.length;
    const coverageRate = totalGTM > 0 ? Math.round((totalRegistered / totalGTM) * 1000) / 10 : 0;

    return {
      eventParams: { registered: eventRegistered, missing: eventMissing, extra: eventExtra },
      itemParams: { registered: itemRegistered, missing: itemMissing, extra: itemExtra },
      coverageRate,
    };
  }

  /**
   * 전체 파라미터 맵핑 테이블 생성
   */
  private createParameterMappings(gtm: GTMExtractedData, ga4: GA4DefinitionsData): ParameterMapping[] {
    const mappings: ParameterMapping[] = [];

    // Event 파라미터 맵핑
    const ga4EventParamMap = new Map<string, GA4CustomDefinition>();
    for (const d of [...ga4.eventDimensions, ...ga4.eventMetrics]) {
      ga4EventParamMap.set(d.parameterName, d);
    }

    for (const param of gtm.customEventParams) {
      const ga4Def = ga4EventParamMap.get(param);
      const usedInEvents = gtm.events
        .filter(e => e.eventParameters.some(p => p.key === param))
        .map(e => e.eventName);

      mappings.push({
        parameterName: param,
        gtmUsed: true,
        ga4Registered: !!ga4Def,
        ga4DisplayName: ga4Def?.displayName,
        scope: 'event',
        usedInEvents,
      });
    }

    // GA4에만 있는 Event 파라미터
    for (const [paramName, def] of ga4EventParamMap) {
      if (!gtm.customEventParams.includes(paramName)) {
        mappings.push({
          parameterName: paramName,
          gtmUsed: false,
          ga4Registered: true,
          ga4DisplayName: def.displayName,
          scope: 'event',
        });
      }
    }

    // Item 파라미터 맵핑
    const ga4ItemParamMap = new Map<string, GA4CustomDefinition>();
    for (const d of ga4.itemDimensions) {
      ga4ItemParamMap.set(d.parameterName, d);
    }

    for (const param of gtm.customItemParams) {
      const ga4Def = ga4ItemParamMap.get(param);
      const usedInEvents = gtm.events
        .filter(e => e.itemParameters.some(p => p.key === param))
        .map(e => e.eventName);

      mappings.push({
        parameterName: param,
        gtmUsed: true,
        ga4Registered: !!ga4Def,
        ga4DisplayName: ga4Def?.displayName,
        scope: 'item',
        usedInEvents,
      });
    }

    // GA4에만 있는 Item 파라미터
    for (const [paramName, def] of ga4ItemParamMap) {
      if (!gtm.customItemParams.includes(paramName)) {
        mappings.push({
          parameterName: paramName,
          gtmUsed: false,
          ga4Registered: true,
          ga4DisplayName: def.displayName,
          scope: 'item',
        });
      }
    }

    return mappings.sort((a, b) => {
      if (a.scope !== b.scope) return a.scope.localeCompare(b.scope);
      return a.parameterName.localeCompare(b.parameterName);
    });
  }

  /**
   * 결과를 JSON 파일로 저장
   */
  saveResult(result: ParallelLoadResult, outputPath = './output/parameter_mapping.json'): void {
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`\n✅ 결과 저장됨: ${outputPath}`);
  }

  /**
   * 결과 요약 출력
   */
  printSummary(result: ParallelLoadResult): void {
    console.log('\n' + '═'.repeat(80));
    console.log('📊 GTM + GA4 파라미터 맵핑 요약');
    console.log('═'.repeat(80));

    console.log(`\n⏱️  로딩 시간: ${result.loadTimeMs}ms`);

    console.log('\n┌─ GTM 추출 결과 ─────────────────────────────────────────┐');
    console.log(`│ 총 이벤트: ${result.gtm.events.length}개`);
    console.log(`│ 커스텀 Event 파라미터: ${result.gtm.customEventParams.length}개`);
    console.log(`│ 커스텀 Item 파라미터: ${result.gtm.customItemParams.length}개`);
    console.log('└─────────────────────────────────────────────────────────┘');

    console.log('\n┌─ GA4 등록 현황 ─────────────────────────────────────────┐');
    console.log(`│ Event 범위 측정기준: ${result.ga4.eventDimensions.length}개`);
    console.log(`│ Item 범위 측정기준: ${result.ga4.itemDimensions.length}개`);
    console.log(`│ Event 범위 측정항목: ${result.ga4.eventMetrics.length}개`);
    console.log('└─────────────────────────────────────────────────────────┘');

    console.log('\n┌─ 비교 결과 ──────────────────────────────────────────────┐');
    console.log(`│ Event 파라미터:`);
    console.log(`│   ✅ 등록됨: ${result.comparison.eventParams.registered.length}개`);
    console.log(`│   ❌ 미등록: ${result.comparison.eventParams.missing.length}개`);
    console.log(`│`);
    console.log(`│ Item 파라미터:`);
    console.log(`│   ✅ 등록됨: ${result.comparison.itemParams.registered.length}개`);
    console.log(`│   ❌ 미등록: ${result.comparison.itemParams.missing.length}개`);
    console.log(`│`);
    console.log(`│ 📈 전체 등록률: ${result.comparison.coverageRate}%`);
    console.log('└─────────────────────────────────────────────────────────┘');

    if (result.comparison.eventParams.missing.length > 0) {
      console.log('\n⚠️ Event 파라미터 미등록:');
      console.log(`   ${result.comparison.eventParams.missing.join(', ')}`);
    }

    if (result.comparison.itemParams.missing.length > 0) {
      console.log('\n⚠️ Item 파라미터 미등록:');
      console.log(`   ${result.comparison.itemParams.missing.join(', ')}`);
    }
  }
}

/**
 * 병렬 로더 인스턴스 생성 헬퍼
 */
export function createGTMGa4ParallelLoader(options?: { useCache?: boolean }): GTMGa4ParallelLoader {
  return new GTMGa4ParallelLoader(options);
}
