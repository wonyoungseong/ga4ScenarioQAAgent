/**
 * GA4 Dimension Registry
 *
 * 새 사이트 설정 시 GA4 API를 호출하여 Custom Dimension 등록 상태를 확인합니다.
 * GTM 파라미터와 GA4 Custom Dimension 매핑을 자동으로 검증합니다.
 */

import * as fs from 'fs';
import { GA4Client } from '../ga4/ga4Client';

export interface GA4DimensionInfo {
  apiName: string;        // customEvent:site_name
  uiName: string;         // 사이트_이름
  parameterName: string;  // site_name
  scope: 'event' | 'user' | 'item';
  description?: string;
}

export interface GA4MappingResult {
  gtmParam: string;
  ga4Dimension: string | null;
  isRegistered: boolean;
  scope: 'event' | 'user' | 'item' | null;
  uiName: string | null;
  alternativeDimension?: string;  // 표준 Dimension으로 대체 가능한 경우
}

export interface GA4RegistryState {
  propertyId: string;
  initialized: boolean;
  lastUpdated: Date | null;
  eventDimensions: Map<string, GA4DimensionInfo>;
  userDimensions: Map<string, GA4DimensionInfo>;
  itemDimensions: Map<string, GA4DimensionInfo>;
  standardDimensions: string[];
}

const state: GA4RegistryState = {
  propertyId: '',
  initialized: false,
  lastUpdated: null,
  eventDimensions: new Map(),
  userDimensions: new Map(),
  itemDimensions: new Map(),
  standardDimensions: [],
};

// 표준 Dimension 대체 매핑
const STANDARD_DIMENSION_ALTERNATIVES: Record<string, string> = {
  'content_group': 'contentGroup',
  'page_referrer': 'pageReferrer',
  'page_location': 'pageLocation',
  'page_location_1': 'pageLocation',
  'page_location_2': 'pageLocation',
  'page_location_3': 'pageLocation',
  'page_location_4': 'pageLocation',
  'page_location_5': 'pageLocation',
};

/**
 * GA4 Dimension Registry 초기화
 * GA4 API에서 등록된 모든 Custom Dimension을 조회합니다.
 */
export async function initializeGA4DimensionRegistry(options: {
  propertyId: string;
  accessToken?: string;
  tokenPath?: string;
}): Promise<{
  success: boolean;
  eventCount: number;
  userCount: number;
  itemCount: number;
  error?: string;
}> {
  state.propertyId = options.propertyId;

  // 토큰 확인
  let accessToken = options.accessToken;
  if (!accessToken && options.tokenPath) {
    if (fs.existsSync(options.tokenPath)) {
      const tokens = JSON.parse(fs.readFileSync(options.tokenPath, 'utf-8'));
      accessToken = tokens.access_token;
    }
  }

  if (!accessToken) {
    return {
      success: false,
      eventCount: 0,
      userCount: 0,
      itemCount: 0,
      error: 'Access token not provided',
    };
  }

  try {
    const ga4 = new GA4Client({ propertyId: options.propertyId, accessToken });
    await ga4.initialize();

    const client = (ga4 as any).client;
    const [metadata] = await client.getMetadata({
      name: `properties/${options.propertyId}/metadata`,
    });

    // Custom Dimensions 파싱
    state.eventDimensions.clear();
    state.userDimensions.clear();
    state.itemDimensions.clear();
    state.standardDimensions = [];

    for (const dim of (metadata.dimensions || [])) {
      const apiName = dim.apiName || '';

      if (apiName.startsWith('customEvent:')) {
        const paramName = apiName.replace('customEvent:', '');
        state.eventDimensions.set(paramName, {
          apiName,
          uiName: dim.uiName || '',
          parameterName: paramName,
          scope: 'event',
          description: dim.description,
        });
      } else if (apiName.startsWith('customUser:')) {
        const paramName = apiName.replace('customUser:', '');
        state.userDimensions.set(paramName, {
          apiName,
          uiName: dim.uiName || '',
          parameterName: paramName,
          scope: 'user',
          description: dim.description,
        });
      } else if (apiName.startsWith('customItem:')) {
        const paramName = apiName.replace('customItem:', '');
        state.itemDimensions.set(paramName, {
          apiName,
          uiName: dim.uiName || '',
          parameterName: paramName,
          scope: 'item',
          description: dim.description,
        });
      } else {
        state.standardDimensions.push(apiName);
      }
    }

    state.initialized = true;
    state.lastUpdated = new Date();

    return {
      success: true,
      eventCount: state.eventDimensions.size,
      userCount: state.userDimensions.size,
      itemCount: state.itemDimensions.size,
    };

  } catch (error: any) {
    return {
      success: false,
      eventCount: 0,
      userCount: 0,
      itemCount: 0,
      error: error.message,
    };
  }
}

/**
 * GTM 파라미터의 GA4 등록 상태 확인
 */
export function checkParameterMapping(
  paramName: string,
  scope: 'event' | 'user' | 'item' = 'event'
): GA4MappingResult {
  const result: GA4MappingResult = {
    gtmParam: paramName,
    ga4Dimension: null,
    isRegistered: false,
    scope: null,
    uiName: null,
  };

  // 표준 Dimension 대체 확인
  if (STANDARD_DIMENSION_ALTERNATIVES[paramName]) {
    result.alternativeDimension = STANDARD_DIMENSION_ALTERNATIVES[paramName];
  }

  // Custom Dimension 확인
  let dimInfo: GA4DimensionInfo | undefined;

  if (scope === 'event') {
    dimInfo = state.eventDimensions.get(paramName);
  } else if (scope === 'user') {
    dimInfo = state.userDimensions.get(paramName);
  } else if (scope === 'item') {
    dimInfo = state.itemDimensions.get(paramName);
  }

  if (dimInfo) {
    result.ga4Dimension = dimInfo.apiName;
    result.isRegistered = true;
    result.scope = dimInfo.scope;
    result.uiName = dimInfo.uiName;
  }

  return result;
}

/**
 * 여러 파라미터의 매핑 상태 일괄 확인
 */
export function checkMultipleParameterMappings(
  params: Array<{ name: string; scope: 'event' | 'user' | 'item' }>
): {
  results: GA4MappingResult[];
  summary: {
    total: number;
    registered: number;
    notRegistered: number;
    hasAlternative: number;
  };
} {
  const results: GA4MappingResult[] = [];
  let registered = 0;
  let notRegistered = 0;
  let hasAlternative = 0;

  for (const param of params) {
    const result = checkParameterMapping(param.name, param.scope);
    results.push(result);

    if (result.isRegistered) {
      registered++;
    } else {
      notRegistered++;
      if (result.alternativeDimension) {
        hasAlternative++;
      }
    }
  }

  return {
    results,
    summary: {
      total: params.length,
      registered,
      notRegistered,
      hasAlternative,
    },
  };
}

/**
 * GTM 파라미터 목록과 GA4 Custom Dimension 매핑 검증
 * 새 사이트 설정 시 호출하여 매핑 상태 리포트 생성
 */
export async function validateGTMtoGA4Mapping(options: {
  propertyId: string;
  gtmEventParams: Array<{ name: string; variable?: string }>;
  gtmUserProps: Array<{ name: string; variable?: string }>;
  tokenPath?: string;
}): Promise<{
  success: boolean;
  eventMappings: GA4MappingResult[];
  userMappings: GA4MappingResult[];
  summary: {
    totalParams: number;
    registered: number;
    notRegistered: number;
    registrationRate: number;
  };
  notRegisteredList: string[];
  report: string;
}> {
  // Registry 초기화
  const initResult = await initializeGA4DimensionRegistry({
    propertyId: options.propertyId,
    tokenPath: options.tokenPath || './credentials/ga4_tokens.json',
  });

  if (!initResult.success) {
    return {
      success: false,
      eventMappings: [],
      userMappings: [],
      summary: { totalParams: 0, registered: 0, notRegistered: 0, registrationRate: 0 },
      notRegisteredList: [],
      report: `GA4 API 조회 실패: ${initResult.error}`,
    };
  }

  // Event Parameters 매핑 확인
  const eventMappings: GA4MappingResult[] = [];
  for (const param of options.gtmEventParams) {
    eventMappings.push(checkParameterMapping(param.name, 'event'));
  }

  // User Properties 매핑 확인
  const userMappings: GA4MappingResult[] = [];
  for (const param of options.gtmUserProps) {
    userMappings.push(checkParameterMapping(param.name, 'user'));
  }

  // 요약 계산
  const allMappings = [...eventMappings, ...userMappings];
  const registered = allMappings.filter(m => m.isRegistered).length;
  const notRegistered = allMappings.filter(m => !m.isRegistered).length;
  const notRegisteredList = allMappings
    .filter(m => !m.isRegistered && !m.alternativeDimension)
    .map(m => m.gtmParam);

  // 리포트 생성
  let report = `
================================================================================
 GA4 Custom Dimension 매핑 검증 리포트
 Property ID: ${options.propertyId}
 검증 시간: ${new Date().toISOString()}
================================================================================

📊 요약:
   - GTM 파라미터 총 개수: ${allMappings.length}개
   - GA4에 등록됨: ${registered}개
   - GA4에 미등록: ${notRegistered}개
   - 매핑률: ${((registered / allMappings.length) * 100).toFixed(1)}%

`;

  // Event Parameters 테이블
  report += `
================================================================================
 Event Parameters (${eventMappings.length}개)
================================================================================
| GTM 파라미터 | GA4 등록 | API Dimension | UI 이름 |
|--------------|----------|---------------|---------|
`;

  for (const m of eventMappings) {
    const status = m.isRegistered ? '✅' : (m.alternativeDimension ? '🔄' : '❌');
    const dim = m.ga4Dimension || m.alternativeDimension || '(미등록)';
    const ui = m.uiName || (m.alternativeDimension ? '표준 Dimension' : '-');
    report += `| ${m.gtmParam.padEnd(20)} | ${status}       | ${dim.padEnd(30)} | ${ui.padEnd(20)} |\n`;
  }

  // User Properties 테이블
  report += `
================================================================================
 User Properties (${userMappings.length}개)
================================================================================
| GTM 파라미터 | GA4 등록 | API Dimension | UI 이름 |
|--------------|----------|---------------|---------|
`;

  for (const m of userMappings) {
    const status = m.isRegistered ? '✅' : '❌';
    const dim = m.ga4Dimension || '(미등록)';
    const ui = m.uiName || '-';
    report += `| ${m.gtmParam.padEnd(20)} | ${status}       | ${dim.padEnd(30)} | ${ui.padEnd(20)} |\n`;
  }

  // 미등록 목록
  if (notRegisteredList.length > 0) {
    report += `
================================================================================
 ⚠️ GA4 Custom Dimension 등록 필요 (API 조회 불가)
================================================================================
`;
    for (const p of notRegisteredList) {
      report += `   - ${p}\n`;
    }

    report += `
💡 등록 방법:
   1. GA4 관리자 페이지 접속
   2. 데이터 표시 > 맞춤 정의 > 맞춤 측정기준
   3. "맞춤 측정기준 만들기" 클릭
   4. 이벤트 매개변수 이름 입력 (예: ${notRegisteredList[0]})
`;
  }

  return {
    success: true,
    eventMappings,
    userMappings,
    summary: {
      totalParams: allMappings.length,
      registered,
      notRegistered,
      registrationRate: (registered / allMappings.length) * 100,
    },
    notRegisteredList,
    report,
  };
}

/**
 * 레지스트리 상태 조회
 */
export function getGA4RegistryStatus(): {
  initialized: boolean;
  propertyId: string;
  lastUpdated: Date | null;
  eventDimensionCount: number;
  userDimensionCount: number;
  itemDimensionCount: number;
} {
  return {
    initialized: state.initialized,
    propertyId: state.propertyId,
    lastUpdated: state.lastUpdated,
    eventDimensionCount: state.eventDimensions.size,
    userDimensionCount: state.userDimensions.size,
    itemDimensionCount: state.itemDimensions.size,
  };
}

/**
 * 등록된 모든 Custom Dimensions 조회
 */
export function getAllRegisteredDimensions(): {
  event: GA4DimensionInfo[];
  user: GA4DimensionInfo[];
  item: GA4DimensionInfo[];
} {
  return {
    event: Array.from(state.eventDimensions.values()),
    user: Array.from(state.userDimensions.values()),
    item: Array.from(state.itemDimensions.values()),
  };
}

/**
 * GA4 API로 실제 값 조회
 */
export async function queryGA4DimensionValue(options: {
  propertyId: string;
  dimension: string;
  filters?: {
    eventName?: string;
    pagePath?: string;
  };
  tokenPath?: string;
}): Promise<{
  success: boolean;
  values: Array<{ value: string; count: number }>;
  error?: string;
}> {
  const tokenPath = options.tokenPath || './credentials/ga4_tokens.json';
  if (!fs.existsSync(tokenPath)) {
    return { success: false, values: [], error: 'Token not found' };
  }

  try {
    const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
    const ga4 = new GA4Client({ propertyId: options.propertyId, accessToken: tokens.access_token });
    await ga4.initialize();

    const client = (ga4 as any).client;

    const request: any = {
      property: `properties/${options.propertyId}`,
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: options.dimension }],
      metrics: [{ name: 'eventCount' }],
      limit: 10,
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    };

    // 필터 추가
    if (options.filters) {
      const expressions: any[] = [];
      if (options.filters.eventName) {
        expressions.push({
          filter: { fieldName: 'eventName', stringFilter: { value: options.filters.eventName } }
        });
      }
      if (options.filters.pagePath) {
        expressions.push({
          filter: { fieldName: 'pagePath', stringFilter: { matchType: 'CONTAINS', value: options.filters.pagePath } }
        });
      }
      if (expressions.length > 0) {
        request.dimensionFilter = expressions.length === 1
          ? expressions[0]
          : { andGroup: { expressions } };
      }
    }

    const [response] = await client.runReport(request);

    const values = (response.rows || []).map((row: any) => ({
      value: row.dimensionValues?.[0]?.value || '',
      count: parseInt(row.metricValues?.[0]?.value || '0'),
    }));

    return { success: true, values };

  } catch (error: any) {
    return { success: false, values: [], error: error.message };
  }
}
