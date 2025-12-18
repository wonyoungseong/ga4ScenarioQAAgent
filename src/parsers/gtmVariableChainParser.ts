/**
 * GTM 변수 체인 추적 파서
 *
 * GA4 파라미터 → GTM Variable → 최종 데이터 소스까지 역추적
 *
 * 지원하는 GTM 변수 타입:
 * - jsm: Custom JavaScript (전역변수 읽기)
 * - v: Data Layer Variable
 * - smm: Simple Lookup Table
 * - remm: RegEx Lookup Table
 * - c: Constant
 * - gtes: Google Tag Event Settings
 */

import * as fs from 'fs';

// ============================================================================
// 인터페이스 정의
// ============================================================================

/** GTM 변수 타입 */
export type GTMVariableType = 'jsm' | 'v' | 'smm' | 'remm' | 'c' | 'gtes' | 'gas' | 'aev' | 'cvt' | 'unknown';

/** 데이터 소스 타입 */
export type DataSourceType =
  | 'global_variable'   // window.AP_* 전역변수
  | 'datalayer'         // dataLayer.push({...})
  | 'constant'          // 상수 값
  | 'url'               // URL에서 추출
  | 'dom'               // DOM 요소에서 추출
  | 'cookie'            // 쿠키에서 추출
  | 'computed'          // 계산된 값
  | 'gtm_builtin';      // GTM 내장 변수

/** 데이터 소스 */
export interface DataSource {
  type: DataSourceType;
  name: string;
  path?: string;        // DataLayer 경로: "ecommerce.items.0.item_id"
  selector?: string;    // DOM 셀렉터
  fallback?: string;    // 기본값
  condition?: string;   // 조건 (예: "로그인 시에만")
}

/** Lookup Table 매핑 항목 */
export interface LookupMapping {
  key: string;
  value: string;
}

/** GTM 변수 파싱 결과 */
export interface ParsedGTMVariable {
  id: string;
  name: string;
  type: GTMVariableType;
  dataSources: DataSource[];
  gtmReferences: string[];      // 참조하는 다른 GTM 변수
  lookupMappings?: LookupMapping[];  // Lookup Table인 경우
  lookupInput?: string;         // Lookup Table의 input
  rawCode?: string;             // jsm인 경우 원본 JS 코드
  notes?: string;               // GTM 메모
}

/** 변수 체인 (재귀 구조) */
export interface VariableChain {
  ga4Param?: string;           // 최상위인 경우 GA4 파라미터명
  gtmVariable: string;
  variableType: GTMVariableType;
  dataSources: DataSource[];
  dependencies: VariableChain[];  // 의존하는 다른 변수
  lookupMappings?: LookupMapping[];
  depth: number;                // 체인 깊이
}

/** Event Settings 파라미터 */
export interface EventSettingsParam {
  ga4Param: string;
  gtmVariable: string;
  scope: 'event' | 'user';  // Event Parameter vs User Property
}

/** 파싱된 GTM 설정 전체 */
export interface ParsedGTMConfig {
  containerId: string;
  containerName?: string;
  variables: Map<string, ParsedGTMVariable>;
  eventSettings: EventSettingsParam[];
  measurementIdConfig?: MeasurementIdConfig;
  variableChains: Map<string, VariableChain>;  // GA4 param → chain
}

/** Measurement ID 설정 */
export interface MeasurementIdConfig {
  variableName: string;
  conditions: {
    pattern: string;
    measurementId: string;
    environment?: string;
  }[];
  defaultId?: string;
}

// ============================================================================
// 메인 파서 클래스
// ============================================================================

export class GTMVariableChainParser {
  private variables: Map<string, ParsedGTMVariable> = new Map();
  private rawVariables: Map<string, any> = new Map();
  private visitedInChain: Set<string> = new Set();  // 순환 참조 방지

  constructor(private gtmJson: any) {}

  /**
   * GTM JSON 파싱 실행
   */
  parse(): ParsedGTMConfig {
    const container = this.gtmJson.containerVersion || this.gtmJson;

    // 1. 모든 변수 파싱
    this.parseAllVariables(container.variable || []);

    // 2. Event Settings 파싱
    const eventSettings = this.parseEventSettings();

    // 3. Measurement ID 설정 파싱
    const measurementIdConfig = this.parseMeasurementIdConfig();

    // 4. 변수 체인 구축
    const variableChains = this.buildAllVariableChains(eventSettings);

    return {
      containerId: container.containerId || 'unknown',
      containerName: container.name,
      variables: this.variables,
      eventSettings,
      measurementIdConfig,
      variableChains,
    };
  }

  // ==========================================================================
  // 변수 파싱
  // ==========================================================================

  private parseAllVariables(variables: any[]): void {
    for (const v of variables) {
      const parsed = this.parseVariable(v);
      this.variables.set(parsed.name, parsed);
      this.rawVariables.set(parsed.name, v);
    }
  }

  private parseVariable(v: any): ParsedGTMVariable {
    const name = v.name || `Variable_${v.variableId}`;
    const type = this.normalizeVariableType(v.type);

    const parsed: ParsedGTMVariable = {
      id: v.variableId || '',
      name,
      type,
      dataSources: [],
      gtmReferences: [],
      notes: v.notes,
    };

    switch (type) {
      case 'jsm':
        this.parseCustomJavaScript(v, parsed);
        break;
      case 'v':
        this.parseDataLayerVariable(v, parsed);
        break;
      case 'smm':
        this.parseSimpleLookupTable(v, parsed);
        break;
      case 'remm':
        this.parseRegexLookupTable(v, parsed);
        break;
      case 'c':
        this.parseConstant(v, parsed);
        break;
      case 'gtes':
        this.parseGoogleTagEventSettings(v, parsed);
        break;
      default:
        // 기타 타입은 기본 처리
        this.parseGenericVariable(v, parsed);
    }

    return parsed;
  }

  private normalizeVariableType(type: string): GTMVariableType {
    const typeMap: Record<string, GTMVariableType> = {
      'jsm': 'jsm',
      'v': 'v',
      'smm': 'smm',
      'remm': 'remm',
      'c': 'c',
      'gtes': 'gtes',
      'gas': 'gas',
      'aev': 'aev',
    };
    return typeMap[type] || 'unknown';
  }

  // ==========================================================================
  // 변수 타입별 파싱
  // ==========================================================================

  /**
   * Custom JavaScript 변수 파싱 (jsm)
   */
  private parseCustomJavaScript(v: any, parsed: ParsedGTMVariable): void {
    const jsParam = this.findParam(v.parameter, 'javascript');
    if (!jsParam) return;

    const jsCode = jsParam.value || '';
    parsed.rawCode = jsCode;

    // 1. GTM 변수 참조 추출 ({{...}})
    parsed.gtmReferences = this.extractGTMReferences(jsCode);

    // 2. 전역변수 추출 (window.AP_* 또는 AP_*)
    const globalVars = this.extractGlobalVariables(jsCode);
    for (const gv of globalVars) {
      parsed.dataSources.push({
        type: 'global_variable',
        name: gv.name,
        fallback: gv.fallback,
      });
    }

    // 3. DataLayer 직접 접근 추출
    const dlAccess = this.extractDataLayerAccess(jsCode);
    for (const dl of dlAccess) {
      parsed.dataSources.push({
        type: 'datalayer',
        name: dl,
        path: dl,
      });
    }

    // 4. URL 관련 추출
    if (jsCode.includes('location.') || jsCode.includes('window.location')) {
      parsed.dataSources.push({
        type: 'url',
        name: 'window.location',
      });
    }

    // 5. navigator 관련 추출
    if (jsCode.includes('navigator.userAgent')) {
      parsed.dataSources.push({
        type: 'gtm_builtin',
        name: 'navigator.userAgent',
      });
    }

    // 6. document 관련 추출
    if (jsCode.includes('document.')) {
      const domAccess = this.extractDOMAccess(jsCode);
      for (const dom of domAccess) {
        parsed.dataSources.push({
          type: 'dom',
          name: dom.name,
          selector: dom.selector,
        });
      }
    }
  }

  /**
   * DataLayer 변수 파싱 (v)
   */
  private parseDataLayerVariable(v: any, parsed: ParsedGTMVariable): void {
    const nameParam = this.findParam(v.parameter, 'name');
    const dlName = nameParam?.value || '';

    parsed.dataSources.push({
      type: 'datalayer',
      name: dlName,
      path: dlName,
    });

    // 기본값 확인
    const defaultParam = this.findParam(v.parameter, 'defaultValue');
    if (defaultParam) {
      parsed.dataSources[0].fallback = defaultParam.value;
    }
  }

  /**
   * Simple Lookup Table 파싱 (smm)
   */
  private parseSimpleLookupTable(v: any, parsed: ParsedGTMVariable): void {
    // Input 변수
    const inputParam = this.findParam(v.parameter, 'input');
    if (inputParam) {
      parsed.lookupInput = inputParam.value;
      parsed.gtmReferences = this.extractGTMReferences(inputParam.value);
    }

    // 매핑 테이블
    const mapParam = this.findParam(v.parameter, 'map');
    if (mapParam?.list) {
      parsed.lookupMappings = this.parseLookupMap(mapParam.list);
    }

    // 기본값
    const defaultParam = this.findParam(v.parameter, 'defaultValue');
    if (defaultParam) {
      parsed.dataSources.push({
        type: 'constant',
        name: 'default',
        fallback: defaultParam.value,
      });
    }
  }

  /**
   * RegEx Lookup Table 파싱 (remm)
   */
  private parseRegexLookupTable(v: any, parsed: ParsedGTMVariable): void {
    // smm과 동일한 구조
    this.parseSimpleLookupTable(v, parsed);
  }

  /**
   * Constant 변수 파싱 (c)
   */
  private parseConstant(v: any, parsed: ParsedGTMVariable): void {
    const valueParam = this.findParam(v.parameter, 'value');
    if (valueParam) {
      parsed.dataSources.push({
        type: 'constant',
        name: parsed.name,
        fallback: valueParam.value,
      });
    }
  }

  /**
   * Google Tag Event Settings 파싱 (gtes)
   */
  private parseGoogleTagEventSettings(v: any, parsed: ParsedGTMVariable): void {
    // eventSettingsTable
    const eventTable = this.findParam(v.parameter, 'eventSettingsTable');
    if (eventTable?.list) {
      for (const item of eventTable.list) {
        const param = this.getMapValue(item.map, 'parameter');
        const value = this.getMapValue(item.map, 'parameterValue');
        if (value) {
          parsed.gtmReferences.push(...this.extractGTMReferences(value));
        }
      }
    }

    // userProperties
    const userProps = this.findParam(v.parameter, 'userProperties');
    if (userProps?.list) {
      for (const item of userProps.list) {
        const value = this.getMapValue(item.map, 'value');
        if (value) {
          parsed.gtmReferences.push(...this.extractGTMReferences(value));
        }
      }
    }

    parsed.dataSources.push({
      type: 'computed',
      name: 'event_settings',
    });
  }

  /**
   * 기타 변수 타입 파싱
   */
  private parseGenericVariable(v: any, parsed: ParsedGTMVariable): void {
    // parameter 내에서 GTM 참조 찾기
    const params = v.parameter || [];
    for (const p of params) {
      if (p.value && typeof p.value === 'string') {
        parsed.gtmReferences.push(...this.extractGTMReferences(p.value));
      }
    }
  }

  // ==========================================================================
  // 추출 유틸리티
  // ==========================================================================

  /**
   * GTM 변수 참조 추출 ({{...}})
   */
  private extractGTMReferences(text: string): string[] {
    if (!text) return [];
    const pattern = /\{\{([^}]+)\}\}/g;
    const refs: string[] = [];
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const ref = match[1].trim();
      if (!refs.includes(ref)) {
        refs.push(ref);
      }
    }
    return refs;
  }

  /**
   * 전역변수 추출 (window.AP_* 또는 AP_*)
   */
  private extractGlobalVariables(jsCode: string): { name: string; fallback?: string }[] {
    const results: { name: string; fallback?: string }[] = [];
    const seen = new Set<string>();

    // 패턴 1: window.AP_* 또는 그냥 AP_*
    const globalPattern = /(?:window\.)?([A-Z][A-Z_0-9]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)/g;
    let match;
    while ((match = globalPattern.exec(jsCode)) !== null) {
      const varName = match[1];
      // AP_, ga4 등 알려진 전역변수 패턴만 추출
      if ((varName.startsWith('AP_') || varName.startsWith('GA4_') || varName.startsWith('gtm')) && !seen.has(varName)) {
        seen.add(varName);

        // fallback 값 찾기 (try-catch 패턴)
        let fallback: string | undefined;
        const fallbackPattern = new RegExp(`catch\\s*\\([^)]*\\)\\s*\\{[^}]*(?:result\\s*=\\s*|return\\s+)["']([^"']+)["']`, 'g');
        const fallbackMatch = fallbackPattern.exec(jsCode);
        if (fallbackMatch) {
          fallback = fallbackMatch[1];
        }

        results.push({ name: varName, fallback });
      }
    }

    return results;
  }

  /**
   * DataLayer 직접 접근 추출
   */
  private extractDataLayerAccess(jsCode: string): string[] {
    const results: string[] = [];

    // dataLayer 직접 접근 패턴
    const dlPattern = /dataLayer\s*\[\s*['"]?([^'"}\]]+)['"]?\s*\]/g;
    let match;
    while ((match = dlPattern.exec(jsCode)) !== null) {
      if (!results.includes(match[1])) {
        results.push(match[1]);
      }
    }

    // google_tag_data 접근 패턴
    const gtdPattern = /google_tag_data\.([A-Za-z_][A-Za-z0-9_]*)/g;
    while ((match = gtdPattern.exec(jsCode)) !== null) {
      if (!results.includes(match[1])) {
        results.push(`google_tag_data.${match[1]}`);
      }
    }

    return results;
  }

  /**
   * DOM 접근 추출
   */
  private extractDOMAccess(jsCode: string): { name: string; selector?: string }[] {
    const results: { name: string; selector?: string }[] = [];

    // querySelector 패턴
    const qsPattern = /document\.querySelector(?:All)?\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    let match;
    while ((match = qsPattern.exec(jsCode)) !== null) {
      results.push({ name: 'querySelector', selector: match[1] });
    }

    // getElementById 패턴
    const idPattern = /document\.getElementById\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = idPattern.exec(jsCode)) !== null) {
      results.push({ name: 'getElementById', selector: `#${match[1]}` });
    }

    // getElementsByClassName 패턴
    const classPattern = /document\.getElementsByClassName\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = classPattern.exec(jsCode)) !== null) {
      results.push({ name: 'getElementsByClassName', selector: `.${match[1]}` });
    }

    return results;
  }

  // ==========================================================================
  // Event Settings 파싱
  // ==========================================================================

  private parseEventSettings(): EventSettingsParam[] {
    const results: EventSettingsParam[] = [];

    // GT - Event Settings 변수 찾기
    for (const [name, variable] of this.variables) {
      if (variable.type === 'gtes') {
        const raw = this.rawVariables.get(name);
        if (!raw) continue;

        // eventSettingsTable
        const eventTable = this.findParam(raw.parameter, 'eventSettingsTable');
        if (eventTable?.list) {
          for (const item of eventTable.list) {
            const param = this.getMapValue(item.map, 'parameter');
            const value = this.getMapValue(item.map, 'parameterValue');
            if (param && value) {
              results.push({
                ga4Param: param,
                gtmVariable: value,
                scope: 'event',
              });
            }
          }
        }

        // userProperties
        const userProps = this.findParam(raw.parameter, 'userProperties');
        if (userProps?.list) {
          for (const item of userProps.list) {
            const propName = this.getMapValue(item.map, 'name');
            const value = this.getMapValue(item.map, 'value');
            if (propName && value) {
              results.push({
                ga4Param: propName,
                gtmVariable: value,
                scope: 'user',
              });
            }
          }
        }
      }
    }

    return results;
  }

  // ==========================================================================
  // Measurement ID 설정 파싱
  // ==========================================================================

  private parseMeasurementIdConfig(): MeasurementIdConfig | undefined {
    // RT - GA4 MeasurementId Table 또는 유사 변수 찾기
    for (const [name, variable] of this.variables) {
      if (name.toLowerCase().includes('measurementid') && (variable.type === 'smm' || variable.type === 'remm')) {
        const raw = this.rawVariables.get(name);
        if (!raw) continue;

        const config: MeasurementIdConfig = {
          variableName: name,
          conditions: [],
        };

        // 매핑 테이블 추출
        if (variable.lookupMappings) {
          for (const mapping of variable.lookupMappings) {
            config.conditions.push({
              pattern: mapping.key,
              measurementId: mapping.value,
              environment: this.inferEnvironment(mapping.key),
            });
          }
        }

        // 기본값
        const defaultParam = this.findParam(raw.parameter, 'defaultValue');
        if (defaultParam) {
          config.defaultId = defaultParam.value;
        }

        return config;
      }
    }

    return undefined;
  }

  private inferEnvironment(pattern: string): string | undefined {
    const lower = pattern.toLowerCase();
    if (lower === 'true' || lower.includes('prd') || lower.includes('prod')) return 'PRD';
    if (lower === 'false' || lower.includes('dev') || lower.includes('stg')) return 'DEV';
    if (lower.includes('app')) return 'APP';
    return undefined;
  }

  // ==========================================================================
  // 변수 체인 구축
  // ==========================================================================

  private buildAllVariableChains(eventSettings: EventSettingsParam[]): Map<string, VariableChain> {
    const chains = new Map<string, VariableChain>();

    for (const setting of eventSettings) {
      this.visitedInChain.clear();  // 각 체인마다 방문 초기화

      const gtmVarName = this.extractGTMReferences(setting.gtmVariable)[0];
      if (!gtmVarName) continue;

      const chain = this.buildVariableChain(gtmVarName, 0);
      if (chain) {
        chain.ga4Param = setting.ga4Param;
        chains.set(setting.ga4Param, chain);
      }
    }

    return chains;
  }

  /**
   * 단일 변수에 대한 체인 구축 (재귀)
   */
  buildVariableChain(variableName: string, depth: number): VariableChain | null {
    // 순환 참조 방지
    if (this.visitedInChain.has(variableName)) {
      return {
        gtmVariable: variableName,
        variableType: 'unknown',
        dataSources: [{ type: 'computed', name: '[순환 참조]' }],
        dependencies: [],
        depth,
      };
    }

    // 최대 깊이 제한
    if (depth > 10) {
      return {
        gtmVariable: variableName,
        variableType: 'unknown',
        dataSources: [{ type: 'computed', name: '[최대 깊이 초과]' }],
        dependencies: [],
        depth,
      };
    }

    this.visitedInChain.add(variableName);

    const variable = this.variables.get(variableName);
    if (!variable) {
      // 내장 변수 처리
      return {
        gtmVariable: variableName,
        variableType: 'unknown',
        dataSources: [{ type: 'gtm_builtin', name: variableName }],
        dependencies: [],
        depth,
      };
    }

    const chain: VariableChain = {
      gtmVariable: variableName,
      variableType: variable.type,
      dataSources: [...variable.dataSources],
      dependencies: [],
      lookupMappings: variable.lookupMappings,
      depth,
    };

    // 의존 변수 재귀 추적
    for (const ref of variable.gtmReferences) {
      const depChain = this.buildVariableChain(ref, depth + 1);
      if (depChain) {
        chain.dependencies.push(depChain);
      }
    }

    return chain;
  }

  // ==========================================================================
  // 유틸리티
  // ==========================================================================

  private findParam(params: any[], key: string): any | undefined {
    if (!params) return undefined;
    return params.find(p => p.key === key);
  }

  private getMapValue(map: any[], key: string): string | undefined {
    if (!map) return undefined;
    const item = map.find(m => m.key === key);
    return item?.value;
  }

  private parseLookupMap(list: any[]): LookupMapping[] {
    const mappings: LookupMapping[] = [];
    for (const item of list) {
      if (item.map) {
        const key = this.getMapValue(item.map, 'key');
        const value = this.getMapValue(item.map, 'value');
        if (key !== undefined && value !== undefined) {
          mappings.push({ key, value });
        }
      }
    }
    return mappings;
  }
}

// ============================================================================
// 출력 유틸리티
// ============================================================================

/**
 * 변수 체인을 트리 형태로 출력
 */
export function printVariableChain(chain: VariableChain, indent: string = ''): string {
  const lines: string[] = [];
  const prefix = indent ? indent : '';
  const typeIcon = getTypeIcon(chain.variableType);

  lines.push(`${prefix}${typeIcon} ${chain.gtmVariable} (${chain.variableType})`);

  // 데이터 소스 출력
  for (const source of chain.dataSources) {
    const sourceIcon = getSourceIcon(source.type);
    let sourceStr = `${prefix}    ${sourceIcon} ${source.type}: ${source.name}`;
    if (source.path && source.path !== source.name) {
      sourceStr += ` [path: ${source.path}]`;
    }
    if (source.fallback) {
      sourceStr += ` (fallback: "${source.fallback}")`;
    }
    lines.push(sourceStr);
  }

  // Lookup 매핑 출력
  if (chain.lookupMappings && chain.lookupMappings.length > 0) {
    lines.push(`${prefix}    📋 Lookup Mappings:`);
    for (const mapping of chain.lookupMappings) {
      lines.push(`${prefix}       "${mapping.key}" → "${mapping.value}"`);
    }
  }

  // 의존성 재귀 출력
  for (let i = 0; i < chain.dependencies.length; i++) {
    const dep = chain.dependencies[i];
    const isLast = i === chain.dependencies.length - 1;
    const newIndent = prefix + (isLast ? '    └── ' : '    ├── ');
    const childIndent = prefix + (isLast ? '        ' : '    │   ');

    lines.push(printVariableChain(dep, newIndent.replace(/^    [└├]── /, '')).split('\n').map((line, idx) => {
      if (idx === 0) return `${prefix}    ${isLast ? '└── ' : '├── '}${line.trim()}`;
      return `${prefix}    ${isLast ? '    ' : '│   '}${line.trim()}`;
    }).join('\n'));
  }

  return lines.join('\n');
}

function getTypeIcon(type: GTMVariableType): string {
  const icons: Record<GTMVariableType, string> = {
    'jsm': '📜',    // Custom JavaScript
    'v': '📦',      // DataLayer Variable
    'smm': '🔀',    // Simple Lookup Table
    'remm': '🔀',   // RegEx Lookup Table
    'c': '📌',      // Constant
    'gtes': '⚙️',   // Event Settings
    'gas': '📊',    // GA Settings
    'aev': '🎯',    // Auto-Event Variable
    'cvt': '🔧',    // Custom Template
    'unknown': '❓',
  };
  return icons[type] || '❓';
}

function getSourceIcon(type: DataSourceType): string {
  const icons: Record<DataSourceType, string> = {
    'global_variable': '🌐',
    'datalayer': '📥',
    'constant': '📌',
    'url': '🔗',
    'dom': '🏷️',
    'cookie': '🍪',
    'computed': '⚡',
    'gtm_builtin': '🔧',
  };
  return icons[type] || '❓';
}

/**
 * 체인에서 최종 데이터 소스만 추출
 */
export function extractUltimateDataSources(chain: VariableChain): DataSource[] {
  const sources: DataSource[] = [];

  function traverse(c: VariableChain) {
    // 현재 노드의 데이터 소스 추가 (computed 제외)
    for (const source of c.dataSources) {
      if (source.type !== 'computed') {
        sources.push(source);
      }
    }

    // 의존성 재귀 탐색
    for (const dep of c.dependencies) {
      traverse(dep);
    }
  }

  traverse(chain);

  // 중복 제거
  const unique = sources.filter((source, index, self) =>
    index === self.findIndex(s => s.type === source.type && s.name === source.name)
  );

  return unique;
}

// ============================================================================
// 파일에서 로드
// ============================================================================

export function loadGTMJson(filePath: string): any {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * GTM JSON 파일 파싱 진입점
 */
export function parseGTMFile(filePath: string): ParsedGTMConfig {
  const json = loadGTMJson(filePath);
  const parser = new GTMVariableChainParser(json);
  return parser.parse();
}

// ============================================================================
// 매핑 테이블 자동 생성
// ============================================================================

/**
 * 파싱된 GTM 설정에서 매핑 테이블 마크다운 생성
 */
export function generateMappingTableMarkdown(config: ParsedGTMConfig): string {
  const lines: string[] = [];
  const timestamp = new Date().toISOString().split('T')[0];

  lines.push('# 파라미터 매핑 테이블 (자동 생성)');
  lines.push('');
  lines.push(`> ⚡ 이 문서는 GTM JSON에서 자동 생성되었습니다. (${timestamp})`);
  lines.push(`> Container ID: ${config.containerId}`);
  lines.push('');

  // Event Parameters
  const eventParams = config.eventSettings.filter(p => p.scope === 'event');
  const userProps = config.eventSettings.filter(p => p.scope === 'user');

  // 중복 제거
  const uniqueEventParams = removeDuplicateParams(eventParams);
  const uniqueUserProps = removeDuplicateParams(userProps);

  lines.push('## Event Parameters');
  lines.push('');
  lines.push('| GA4 파라미터 | GTM Variable | 데이터 소스 | 타입 |');
  lines.push('|-------------|--------------|------------|------|');

  for (const param of uniqueEventParams) {
    const chain = config.variableChains.get(param.ga4Param);
    const sources = chain ? extractUltimateDataSources(chain) : [];
    const sourceStr = formatSources(sources);
    const typeStr = chain?.variableType || 'unknown';

    lines.push(`| \`${param.ga4Param}\` | \`${param.gtmVariable}\` | ${sourceStr} | ${typeStr} |`);
  }

  lines.push('');
  lines.push('## User Properties');
  lines.push('');
  lines.push('| GA4 User Property | GTM Variable | 데이터 소스 | 타입 |');
  lines.push('|-------------------|--------------|------------|------|');

  for (const prop of uniqueUserProps) {
    const chain = config.variableChains.get(prop.ga4Param);
    const sources = chain ? extractUltimateDataSources(chain) : [];
    const sourceStr = formatSources(sources);
    const typeStr = chain?.variableType || 'unknown';

    lines.push(`| \`${prop.ga4Param}\` | \`${prop.gtmVariable}\` | ${sourceStr} | ${typeStr} |`);
  }

  // Measurement ID 설정
  if (config.measurementIdConfig) {
    lines.push('');
    lines.push('## Measurement ID 설정');
    lines.push('');
    lines.push(`변수: \`${config.measurementIdConfig.variableName}\``);
    lines.push('');
    lines.push('| 조건 | Measurement ID | 환경 |');
    lines.push('|------|----------------|------|');

    for (const cond of config.measurementIdConfig.conditions) {
      const env = cond.environment || '-';
      lines.push(`| \`${cond.pattern}\` | ${cond.measurementId} | ${env} |`);
    }
  }

  // 전역변수 목록
  lines.push('');
  lines.push('## 사용된 전역변수 (개발가이드 변수)');
  lines.push('');

  const globalVarsByCategory = categorizeGlobalVariables(config);

  for (const [category, vars] of Object.entries(globalVarsByCategory)) {
    lines.push(`### ${category}`);
    lines.push('');
    lines.push('| 전역변수 | 용도 |');
    lines.push('|---------|------|');

    for (const v of vars) {
      const usage = inferVariableUsage(v);
      lines.push(`| \`${v}\` | ${usage} |`);
    }
    lines.push('');
  }

  // DataLayer 변수 목록
  lines.push('## 사용된 DataLayer 변수');
  lines.push('');
  lines.push('| DataLayer 경로 | 용도 |');
  lines.push('|----------------|------|');

  const dlVars = new Set<string>();
  for (const [, variable] of config.variables) {
    for (const source of variable.dataSources) {
      if (source.type === 'datalayer') {
        dlVars.add(source.name);
      }
    }
  }

  for (const dl of Array.from(dlVars).sort()) {
    const usage = inferDataLayerUsage(dl);
    lines.push(`| \`${dl}\` | ${usage} |`);
  }

  return lines.join('\n');
}

function removeDuplicateParams(params: EventSettingsParam[]): EventSettingsParam[] {
  const seen = new Set<string>();
  return params.filter(p => {
    if (seen.has(p.ga4Param)) return false;
    seen.add(p.ga4Param);
    return true;
  });
}

function formatSources(sources: DataSource[]): string {
  if (sources.length === 0) return '-';

  return sources.map(s => {
    if (s.type === 'global_variable') {
      return `\`${s.name}\``;
    } else if (s.type === 'datalayer') {
      return `dataLayer: \`${s.name}\``;
    } else if (s.type === 'constant' && s.fallback) {
      return `상수: "${s.fallback}"`;
    } else if (s.type === 'gtm_builtin') {
      return `GTM: ${s.name}`;
    }
    return s.name;
  }).join(', ');
}

function categorizeGlobalVariables(config: ParsedGTMConfig): Record<string, string[]> {
  const categories: Record<string, string[]> = {
    '사이트 정보 (AP_DATA_*)': [],
    '상품 정보 (AP_PRD_*)': [],
    '장바구니/주문 (AP_CART_*, AP_ORDER_*)': [],
    '구매 정보 (AP_PURCHASE_*)': [],
    '검색 정보 (AP_SEARCH_*)': [],
    '이벤트/프로모션 (AP_EVENT_*)': [],
    '리뷰 (AP_REVIEW_*)': [],
    '기타': [],
  };

  const globalVars = new Set<string>();
  for (const [, variable] of config.variables) {
    for (const source of variable.dataSources) {
      if (source.type === 'global_variable' && source.name.startsWith('AP_')) {
        globalVars.add(source.name.split('.')[0]);  // 메서드 호출 제거
      }
    }
  }

  for (const v of Array.from(globalVars).sort()) {
    if (v.startsWith('AP_DATA_')) {
      categories['사이트 정보 (AP_DATA_*)'].push(v);
    } else if (v.startsWith('AP_PRD_')) {
      categories['상품 정보 (AP_PRD_*)'].push(v);
    } else if (v.startsWith('AP_CART_') || v.startsWith('AP_ORDER_')) {
      categories['장바구니/주문 (AP_CART_*, AP_ORDER_*)'].push(v);
    } else if (v.startsWith('AP_PURCHASE_')) {
      categories['구매 정보 (AP_PURCHASE_*)'].push(v);
    } else if (v.startsWith('AP_SEARCH_')) {
      categories['검색 정보 (AP_SEARCH_*)'].push(v);
    } else if (v.startsWith('AP_EVENT_')) {
      categories['이벤트/프로모션 (AP_EVENT_*)'].push(v);
    } else if (v.startsWith('AP_REVIEW_')) {
      categories['리뷰 (AP_REVIEW_*)'].push(v);
    } else {
      categories['기타'].push(v);
    }
  }

  // 빈 카테고리 제거
  return Object.fromEntries(
    Object.entries(categories).filter(([, vars]) => vars.length > 0)
  );
}

function inferVariableUsage(varName: string): string {
  const usageMap: Record<string, string> = {
    'AP_DATA_SITENAME': '사이트 이름',
    'AP_DATA_COUNTRY': '국가 코드',
    'AP_DATA_LANG': '언어 코드',
    'AP_DATA_ENV': '환경 (PRD/DEV)',
    'AP_DATA_CHANNEL': '채널 (PC/MOBILE)',
    'AP_DATA_PAGETYPE': '페이지 타입',
    'AP_DATA_BREAD': 'Breadcrumb',
    'AP_DATA_ISLOGIN': '로그인 여부',
    'AP_DATA_GCID': '회원 ID (해시)',
    'AP_DATA_CID': '통합회원번호 (해시)',
    'AP_DATA_ISMEMBER': '통합회원 여부',
    'AP_DATA_CG': '성별',
    'AP_DATA_CD': '생년',
    'AP_DATA_CT': '회원등급',
    'AP_DATA_BEAUTYCT': '뷰티포인트 등급',
    'AP_DATA_LOGINTYPE': '로그인 방법',
    'AP_DATA_ISEMPLOYEE': '임직원 여부',
    'AP_PRD_CODE': '상품 코드',
    'AP_PRD_NAME': '상품명',
    'AP_PRD_BRAND': '상품 브랜드',
    'AP_PRD_PRICE': '상품 가격 (할인)',
    'AP_PRD_PRDPRICE': '상품 정가',
    'AP_PRD_CATEGORY': '상품 카테고리',
    'AP_ECOMM_CURRENCY': '통화 코드',
    'AP_CART_PRDS': '장바구니 상품 배열',
    'AP_ORDER_PRDS': '주문 상품 배열',
    'AP_PURCHASE_ORDERNUM': '주문번호',
    'AP_PURCHASE_PRICE': '결제 금액',
    'AP_SEARCH_TERM': '검색어',
    'AP_SEARCH_NUM': '검색 결과 수',
  };

  return usageMap[varName] || '-';
}

function inferDataLayerUsage(dlPath: string): string {
  const usageMap: Record<string, string> = {
    'event': '이벤트명',
    'eventCategory': '이벤트 카테고리',
    'eventAction': '이벤트 액션',
    'eventLabel': '이벤트 라벨',
    'event_category': '이벤트 카테고리',
    'event_action': '이벤트 액션',
    'event_label': '이벤트 라벨',
    'quantity': '수량',
    'prdInfo': '상품 정보',
  };

  if (dlPath.startsWith('duration.')) {
    return '스크롤 깊이 체류시간';
  }

  if (dlPath.startsWith('gtm.')) {
    return 'GTM 내장 변수';
  }

  return usageMap[dlPath] || '-';
}

/**
 * 매핑 테이블을 파일로 저장
 */
export function saveMappingTable(config: ParsedGTMConfig, outputPath: string): void {
  const markdown = generateMappingTableMarkdown(config);
  fs.writeFileSync(outputPath, markdown, 'utf-8');
}
