/**
 * SpecLoader - YAML 스펙 파일 로더
 *
 * specs/sites/{siteId}/ 폴더에서 사이트별 스펙을 로드합니다.
 * - site_config.yaml: 사이트 설정 (변수 규칙, dataLayer 매핑)
 * - events/*.yaml: 이벤트별 파라미터 스펙
 * - mapping/param-mapping.yaml: 전체 파라미터 매핑
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// ============================================
// 타입 정의
// ============================================

export interface SiteConfig {
  site_info: {
    name: string;
    code: string;
    brands?: string[];
  };
  reference_documents: {
    dev_guide: string;
    gtm_container: string;
  };
  variable_naming: {
    prefix: string;
    patterns: Record<string, string>;
  };
  dataLayer_events: Record<string, string | string[]>;
  gtm_variable_patterns: Record<string, string>;
  notes?: string[];
  created_at?: string;
}

export interface EventParameter {
  ga4_param: string;
  dev_guide_var: string;
  gtm_variable?: string;
  data_type: string;
  description: string;
  example?: string | number;
  required: boolean;
  validation?: string;
}

export interface EventSpec {
  event: string;
  ga4_event_name: string;
  dataLayer_event: string;
  trigger_timing: string;
  required: boolean;
  description: string;
  parameters: EventParameter[];
  items_params?: EventParameter[];
  dataLayer_example?: string;
  related_events?: Array<{
    event: string;
    description: string;
  }>;
  verification_notes?: string[];
}

export interface GA4StandardEvent {
  description: string;
  trigger: string;
  required_params?: string[];
  optional_params?: string[];
  items_params?: {
    required?: string[];
    recommended?: string[];
  };
}

export interface LoadedSpecs {
  siteConfig: SiteConfig;
  eventSpecs: Map<string, EventSpec>;
  paramMapping: any;
  ga4Standards: Map<string, GA4StandardEvent>;
}

// ============================================
// SpecLoader 클래스
// ============================================

export class SpecLoader {
  private specsDir: string;
  private sitesDir: string;
  private commonDir: string;
  private cache: Map<string, LoadedSpecs> = new Map();

  constructor(specsDir: string = './specs') {
    this.specsDir = specsDir;
    this.sitesDir = path.join(specsDir, 'sites');
    this.commonDir = path.join(specsDir, 'common');
  }

  /**
   * 사용 가능한 사이트 목록 반환
   */
  getAvailableSites(): string[] {
    if (!fs.existsSync(this.sitesDir)) {
      return [];
    }
    return fs.readdirSync(this.sitesDir).filter(f => {
      const sitePath = path.join(this.sitesDir, f);
      return fs.statSync(sitePath).isDirectory();
    });
  }

  /**
   * 사이트 ID로 스펙 로드
   */
  loadSiteSpecs(siteId: string): LoadedSpecs {
    // 캐시 확인
    if (this.cache.has(siteId)) {
      return this.cache.get(siteId)!;
    }

    const sitePath = path.join(this.sitesDir, siteId);

    if (!fs.existsSync(sitePath)) {
      throw new Error(
        `사이트를 찾을 수 없습니다: ${siteId}\n` +
        `사용 가능한 사이트: ${this.getAvailableSites().join(', ')}`
      );
    }

    // 사이트 설정 로드
    const siteConfig = this.loadSiteConfig(sitePath);

    // 이벤트 스펙 로드
    const eventSpecs = this.loadEventSpecs(sitePath);

    // 파라미터 매핑 로드
    const paramMapping = this.loadParamMapping(sitePath);

    // GA4 표준 이벤트 로드
    const ga4Standards = this.loadGA4Standards();

    const specs: LoadedSpecs = {
      siteConfig,
      eventSpecs,
      paramMapping,
      ga4Standards
    };

    // 캐시 저장
    this.cache.set(siteId, specs);

    return specs;
  }

  /**
   * site_config.yaml 로드
   */
  private loadSiteConfig(sitePath: string): SiteConfig {
    const configPath = path.join(sitePath, 'site_config.yaml');

    if (!fs.existsSync(configPath)) {
      throw new Error(`사이트 설정 파일을 찾을 수 없습니다: ${configPath}`);
    }

    const content = fs.readFileSync(configPath, 'utf-8');
    return yaml.load(content) as SiteConfig;
  }

  /**
   * events/*.yaml 파일들 로드
   */
  private loadEventSpecs(sitePath: string): Map<string, EventSpec> {
    const eventsDir = path.join(sitePath, 'events');
    const specs = new Map<string, EventSpec>();

    if (!fs.existsSync(eventsDir)) {
      console.warn(`이벤트 스펙 폴더가 없습니다: ${eventsDir}`);
      return specs;
    }

    const files = fs.readdirSync(eventsDir).filter(f => f.endsWith('.yaml'));

    for (const file of files) {
      const filePath = path.join(eventsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const spec = yaml.load(content) as EventSpec;

      // 파일명에서 이벤트명 추출 (확장자 제거)
      const eventName = file.replace('.yaml', '');
      specs.set(eventName, spec);
    }

    return specs;
  }

  /**
   * mapping/param-mapping.yaml 로드
   */
  private loadParamMapping(sitePath: string): any {
    const mappingPath = path.join(sitePath, 'mapping', 'param-mapping.yaml');

    if (!fs.existsSync(mappingPath)) {
      console.warn(`파라미터 매핑 파일이 없습니다: ${mappingPath}`);
      return null;
    }

    const content = fs.readFileSync(mappingPath, 'utf-8');
    return yaml.load(content);
  }

  /**
   * common/ga4_standard_events.yaml 로드
   */
  private loadGA4Standards(): Map<string, GA4StandardEvent> {
    const standards = new Map<string, GA4StandardEvent>();
    const standardsPath = path.join(this.commonDir, 'ga4_standard_events.yaml');

    if (!fs.existsSync(standardsPath)) {
      console.warn(`GA4 표준 이벤트 파일이 없습니다: ${standardsPath}`);
      return standards;
    }

    const content = fs.readFileSync(standardsPath, 'utf-8');
    const data = yaml.load(content) as any;

    // ecommerce_events
    if (data.ecommerce_events) {
      for (const [name, spec] of Object.entries(data.ecommerce_events)) {
        standards.set(name, spec as GA4StandardEvent);
      }
    }

    // promotion_events
    if (data.promotion_events) {
      for (const [name, spec] of Object.entries(data.promotion_events)) {
        standards.set(name, spec as GA4StandardEvent);
      }
    }

    // user_events
    if (data.user_events) {
      for (const [name, spec] of Object.entries(data.user_events)) {
        standards.set(name, spec as GA4StandardEvent);
      }
    }

    // content_events
    if (data.content_events) {
      for (const [name, spec] of Object.entries(data.content_events)) {
        standards.set(name, spec as GA4StandardEvent);
      }
    }

    return standards;
  }

  /**
   * 특정 이벤트의 스펙 가져오기
   */
  getEventSpec(siteId: string, eventName: string): EventSpec | null {
    const specs = this.loadSiteSpecs(siteId);
    return specs.eventSpecs.get(eventName.toLowerCase()) || null;
  }

  /**
   * 이벤트의 필수 파라미터 목록 가져오기
   */
  getRequiredParams(siteId: string, eventName: string): EventParameter[] {
    const spec = this.getEventSpec(siteId, eventName);
    if (!spec) return [];

    return spec.parameters.filter(p => p.required);
  }

  /**
   * 이벤트의 전체 파라미터 목록 가져오기
   */
  getAllParams(siteId: string, eventName: string): EventParameter[] {
    const spec = this.getEventSpec(siteId, eventName);
    if (!spec) return [];

    return spec.parameters;
  }

  /**
   * Vision AI 프롬프트에 추가할 파라미터 정보 생성
   */
  generateParamPrompt(siteId: string, eventName: string): string {
    const spec = this.getEventSpec(siteId, eventName);
    if (!spec) {
      return `이벤트 스펙을 찾을 수 없습니다: ${eventName}`;
    }

    const specs = this.loadSiteSpecs(siteId);
    const siteConfig = specs.siteConfig;

    const lines: string[] = [];

    lines.push(`## 이벤트 파라미터 스펙 (${siteConfig.site_info.name})`);
    lines.push('');
    lines.push(`### ${spec.ga4_event_name} 이벤트`);
    lines.push(`- dataLayer 이벤트: \`${spec.dataLayer_event}\``);
    lines.push(`- 트리거 시점: ${spec.trigger_timing}`);
    lines.push('');

    // 필수 파라미터
    const required = spec.parameters.filter(p => p.required);
    if (required.length > 0) {
      lines.push('### 필수 파라미터');
      lines.push('| GA4 파라미터 | 개발가이드 변수 | 설명 | 예시 |');
      lines.push('|------------|---------------|------|------|');
      for (const p of required) {
        lines.push(`| \`${p.ga4_param}\` | \`${p.dev_guide_var}\` | ${p.description} | ${p.example || '-'} |`);
      }
      lines.push('');
    }

    // 선택 파라미터
    const optional = spec.parameters.filter(p => !p.required);
    if (optional.length > 0) {
      lines.push('### 선택 파라미터');
      lines.push('| GA4 파라미터 | 개발가이드 변수 | 설명 |');
      lines.push('|------------|---------------|------|');
      for (const p of optional) {
        lines.push(`| \`${p.ga4_param}\` | \`${p.dev_guide_var}\` | ${p.description} |`);
      }
      lines.push('');
    }

    // 변수 네이밍 규칙
    lines.push('### 변수 네이밍 규칙');
    lines.push(`- 접두사: \`${siteConfig.variable_naming.prefix}\``);
    for (const [key, pattern] of Object.entries(siteConfig.variable_naming.patterns)) {
      lines.push(`- ${key}: \`${pattern}\``);
    }
    lines.push('');

    // 검증 시 주의사항
    if (spec.verification_notes && spec.verification_notes.length > 0) {
      lines.push('### 검증 시 주의사항');
      for (const note of spec.verification_notes) {
        lines.push(`- ${note}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 시나리오 출력에 포함할 파라미터 검증 정보 생성
   */
  generateValidationInfo(siteId: string, eventName: string): {
    requiredParams: Array<{name: string; devVar: string; description: string}>;
    optionalParams: Array<{name: string; devVar: string; description: string}>;
    dataLayerEvent: string;
    variablePrefix: string;
  } | null {
    const spec = this.getEventSpec(siteId, eventName);
    if (!spec) return null;

    const specs = this.loadSiteSpecs(siteId);

    return {
      requiredParams: spec.parameters
        .filter(p => p.required)
        .map(p => ({
          name: p.ga4_param,
          devVar: p.dev_guide_var,
          description: p.description
        })),
      optionalParams: spec.parameters
        .filter(p => !p.required)
        .map(p => ({
          name: p.ga4_param,
          devVar: p.dev_guide_var,
          description: p.description
        })),
      dataLayerEvent: spec.dataLayer_event,
      variablePrefix: specs.siteConfig.variable_naming.prefix
    };
  }

  /**
   * 캐시 클리어
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// 기본 인스턴스 export
export const specLoader = new SpecLoader();
