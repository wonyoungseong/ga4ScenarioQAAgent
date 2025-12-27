/**
 * Spec Data Loader
 *
 * ga4-event-parameters.json 스펙 파일을 로드하고 파싱합니다.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  EventParameterSpec,
  EventDefinition,
  SpecParameterDefinition,
  SpecLoadOptions,
  DataLoadResult
} from './types';
import { ContentGroup, SpecParameter, BranchConfig } from '../branch/types';

/**
 * 기본 스펙 파일 경로
 */
const DEFAULT_SPEC_PATH = path.join(process.cwd(), 'config', 'ga4-event-parameters.json');

/**
 * Spec Data Loader 클래스
 */
export class SpecDataLoader {
  private spec: EventParameterSpec | null = null;
  private specPath: string;
  private loadedAt: Date | null = null;

  constructor(specPath?: string) {
    this.specPath = specPath || DEFAULT_SPEC_PATH;
  }

  /**
   * 스펙 파일 로드
   */
  async load(options?: Partial<SpecLoadOptions>): Promise<DataLoadResult<EventParameterSpec>> {
    const specPath = options?.specPath || this.specPath;

    try {
      if (!fs.existsSync(specPath)) {
        return {
          success: false,
          error: `Spec file not found: ${specPath}`,
          source: 'spec',
          loadedAt: new Date()
        };
      }

      const content = fs.readFileSync(specPath, 'utf-8');
      this.spec = JSON.parse(content) as EventParameterSpec;
      this.loadedAt = new Date();

      if (options?.validateSchema) {
        const validation = this.validateSchema();
        if (!validation.valid) {
          return {
            success: false,
            error: `Schema validation failed: ${validation.errors.join(', ')}`,
            source: 'spec',
            loadedAt: this.loadedAt
          };
        }
      }

      return {
        success: true,
        data: this.spec,
        source: 'spec',
        loadedAt: this.loadedAt
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to load spec: ${error.message}`,
        source: 'spec',
        loadedAt: new Date()
      };
    }
  }

  /**
   * 스키마 유효성 검증
   */
  private validateSchema(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.spec) {
      errors.push('Spec is null');
      return { valid: false, errors };
    }

    if (!this.spec.schemaVersion) {
      errors.push('Missing schemaVersion');
    }

    if (!this.spec.events || typeof this.spec.events !== 'object') {
      errors.push('Missing or invalid events object');
    }

    if (!this.spec.commonParameters) {
      errors.push('Missing commonParameters');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 스펙이 로드되었는지 확인
   */
  isLoaded(): boolean {
    return this.spec !== null;
  }

  /**
   * 로드된 스펙 반환
   */
  getSpec(): EventParameterSpec | null {
    return this.spec;
  }

  /**
   * 모든 Content Group 목록 반환
   */
  getAllContentGroups(): ContentGroup[] {
    if (!this.spec?.commonParameters?.parameters?.content_group) {
      return [];
    }

    return (this.spec.commonParameters.parameters.content_group.values || []) as ContentGroup[];
  }

  /**
   * 모든 이벤트 이름 목록 반환
   */
  getAllEventNames(): string[] {
    if (!this.spec?.events) return [];
    return Object.keys(this.spec.events);
  }

  /**
   * 특정 이벤트 정의 반환
   */
  getEventDefinition(eventName: string): EventDefinition | null {
    if (!this.spec?.events) return null;
    return this.spec.events[eventName] || null;
  }

  /**
   * 특정 Content Group에서 발생해야 할 이벤트 목록
   */
  getEventsForContentGroup(contentGroup: ContentGroup): EventDefinition[] {
    if (!this.spec?.events) return [];

    return Object.values(this.spec.events).filter(event => {
      const allowed = event.allowedPageTypes;
      if (allowed.includes('ALL')) return true;
      return (allowed as ContentGroup[]).includes(contentGroup);
    });
  }

  /**
   * 특정 Content Group의 이벤트 이름 목록
   */
  getEventNamesForContentGroup(contentGroup: ContentGroup): string[] {
    return this.getEventsForContentGroup(contentGroup).map(e => e.ga4EventName);
  }

  /**
   * 이벤트의 스펙 파라미터 목록 반환
   */
  getEventParameters(eventName: string): SpecParameter[] {
    const event = this.getEventDefinition(eventName);
    if (!event) return [];

    const params: SpecParameter[] = [];

    // 이벤트 레벨 파라미터
    for (const p of event.parameters.event) {
      params.push({
        ga4Key: p.ga4Key,
        displayName: p.displayName || p.ga4Key,
        dataLayerVar: p.dataLayerVar,
        required: p.required,
        description: p.description,
        values: p.values,
        example: p.example
      });
    }

    // Item 레벨 파라미터
    for (const p of event.parameters.item) {
      params.push({
        ga4Key: `items.${p.ga4Key}`,
        displayName: `items.${p.ga4Key}`,
        dataLayerVar: p.dataLayerVar,
        required: p.required,
        description: p.description
      });
    }

    return params;
  }

  /**
   * 공통 파라미터 목록 반환
   */
  getCommonParameters(): SpecParameter[] {
    if (!this.spec?.commonParameters?.parameters) return [];

    return Object.entries(this.spec.commonParameters.parameters).map(([key, p]) => ({
      ga4Key: p.ga4Key,
      displayName: p.displayName,
      dataLayerVar: p.dataLayerVar,
      required: p.required,
      description: p.description,
      values: p.values,
      example: p.example
    }));
  }

  /**
   * 필수 파라미터만 반환
   */
  getRequiredParameters(eventName: string): SpecParameter[] {
    return this.getEventParameters(eventName).filter(p => p.required);
  }

  /**
   * Content Group별 Branch 설정 생성
   */
  generateBranchConfigs(): BranchConfig[] {
    const contentGroups = this.getAllContentGroups();

    return contentGroups.map((cg, index) => ({
      id: `test/${cg}`,
      contentGroup: cg,
      testUrls: [],  // GA4 API에서 채워질 예정
      gitBranch: `test-results/${cg}`,
      enabled: true,
      priority: index,
      expectedEvents: this.getEventNamesForContentGroup(cg)
    }));
  }

  /**
   * 이벤트가 특정 Content Group에서 허용되는지 확인
   */
  isEventAllowedForContentGroup(eventName: string, contentGroup: ContentGroup): boolean {
    const event = this.getEventDefinition(eventName);
    if (!event) return false;

    const allowed = event.allowedPageTypes;
    if (allowed.includes('ALL')) return true;
    return (allowed as ContentGroup[]).includes(contentGroup);
  }

  /**
   * 트리거 타입별 이벤트 분류
   */
  getEventsByTriggerType(): Record<string, string[]> {
    if (!this.spec?.events) return {};

    const result: Record<string, string[]> = {};

    for (const [eventName, event] of Object.entries(this.spec.events)) {
      const type = event.triggerType || 'custom';
      if (!result[type]) {
        result[type] = [];
      }
      result[type].push(eventName);
    }

    return result;
  }

  /**
   * 자동 발생 이벤트 목록 (pageLoad 트리거)
   */
  getAutoFireEvents(): string[] {
    return this.getEventsByTriggerType()['pageLoad'] || [];
  }

  /**
   * 사용자 액션 필요 이벤트 목록 (click, submit 등)
   */
  getUserActionEvents(): string[] {
    const byType = this.getEventsByTriggerType();
    return [
      ...(byType['click'] || []),
      ...(byType['submit'] || []),
      ...(byType['scroll'] || [])
    ];
  }

  /**
   * 스펙 요약 정보 반환
   */
  getSummary(): {
    version: string;
    lastUpdated: string;
    totalEvents: number;
    contentGroups: number;
    commonParams: number;
  } {
    return {
      version: this.spec?.schemaVersion || 'unknown',
      lastUpdated: this.spec?.lastUpdated || 'unknown',
      totalEvents: Object.keys(this.spec?.events || {}).length,
      contentGroups: this.getAllContentGroups().length,
      commonParams: Object.keys(this.spec?.commonParameters?.parameters || {}).length
    };
  }
}

/**
 * 싱글톤 인스턴스 생성 헬퍼
 */
export async function loadSpec(specPath?: string): Promise<SpecDataLoader> {
  const loader = new SpecDataLoader(specPath);
  await loader.load({ validateSchema: true });
  return loader;
}
