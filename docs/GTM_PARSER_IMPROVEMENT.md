# GTM Parser 개선 방안

> 📘 상세 변수 타입 설명: [GTM_VARIABLE_TYPES.md](./GTM_VARIABLE_TYPES.md)

## 문제점 분석

### 현재 상황
- PARAM_MAPPING_TABLE.md 문서가 GTM 실제 구성과 **26개 파라미터 차이**
- User Property 네이밍이 **6개 불일치**
- 수동 문서화로 인한 동기화 문제 지속 발생

### 근본 원인
1. GTM JSON 파싱 시 `GT - Event Settings` 변수를 분석하지 않음
2. eventSettingsTable과 userProperties 구분 파싱 미구현
3. 개발가이드 변수 ↔ GTM Variable ↔ GA4 파라미터 3단계 매핑 누락
4. **변수 체인 추적 미구현** (Lookup Table → Custom JS → 전역변수/DataLayer)
5. **데이터 소스 구분 미구현** (전역변수 vs DataLayer)

---

## 개선 방안

### 1. GTM Event Settings 자동 파싱

```typescript
interface EventSettingsVariable {
  name: string;                    // "GT - Event Settings"
  type: 'gtes';                    // Google Tag Event Settings
  eventSettingsTable: EventParam[];
  userProperties: UserProperty[];
}

interface EventParam {
  parameter: string;       // GA4 파라미터명 (예: "site_name")
  parameterValue: string;  // GTM Variable 참조 (예: "{{JS - Site Name}}")
}

interface UserProperty {
  name: string;            // GA4 User Property명 (예: "login_gender")
  value: string;           // GTM Variable 참조
}
```

**파싱 로직:**
```typescript
function parseEventSettings(gtmJson: any): EventSettingsVariable[] {
  const variables = gtmJson.containerVersion.variable || [];

  return variables
    .filter(v => v.type === 'gtes')
    .map(v => ({
      name: v.name,
      type: v.type,
      eventSettingsTable: extractEventParams(v.parameter),
      userProperties: extractUserProperties(v.parameter)
    }));
}

function extractEventParams(params: any[]): EventParam[] {
  const table = params.find(p => p.key === 'eventSettingsTable');
  if (!table?.list) return [];

  return table.list.map(item => ({
    parameter: getMapValue(item.map, 'parameter'),
    parameterValue: getMapValue(item.map, 'parameterValue')
  }));
}
```

---

### 2. GTM Variable 역추적

GTM Variable 이름에서 개발가이드 변수를 유추:

```typescript
const gtmToDevGuideMapping: Record<string, string> = {
  // 패턴 기반 매핑
  '{{JS - Site Name}}': 'AP_DATA_SITENAME',
  '{{JS - Site Country}}': 'AP_DATA_COUNTRY',
  '{{JS - Site Language}}': 'AP_DATA_LANG',
  '{{JS - Site Env}}': 'AP_DATA_ENV',
  '{{JS - Channel}}': 'AP_DATA_CHANNEL',
  '{{JS - Login Is Login}}': 'AP_DATA_ISLOGIN',
  '{{JS - Login Id Gcid}}': 'AP_DATA_GCID',
  '{{JS - Login Id Cid}}': 'AP_DATA_CID',
  '{{JS - Login Gender}}': 'AP_DATA_CG',
  '{{JS - Login Birth (year)}}': 'AP_DATA_CD',
  '{{JS - Login Level (internal)}}': 'AP_DATA_CT',
  '{{JS - Login Beauty Level}}': 'AP_DATA_BEAUTYCT',
  '{{JS - Login Method}}': 'AP_DATA_LOGINTYPE',
  '{{JS - Login is Member (employee)}}': 'AP_DATA_ISEMPLOYEE',
  // ...
};

function inferDevGuideVar(gtmVar: string): string | undefined {
  // 1. 직접 매핑 확인
  if (gtmToDevGuideMapping[gtmVar]) {
    return gtmToDevGuideMapping[gtmVar];
  }

  // 2. 패턴 기반 유추
  const match = gtmVar.match(/\{\{JS - (.+)\}\}/);
  if (match) {
    const name = match[1]
      .replace(/\s+/g, '')
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .toUpperCase();
    return `AP_${name}`;
  }

  return undefined;
}
```

---

### 3. 3단계 매핑 구조

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│   개발 가이드 변수    │ ←── │    GTM Variable     │ ←── │   GA4 파라미터      │
│  (Dev Guide Var)    │     │  (Source)           │     │   (Target)          │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
     AP_DATA_CG        ←──   {{JS - Login Gender}}  ←──     login_gender
```

**매핑 테이블 자동 생성:**
```typescript
interface ParameterMapping {
  ga4Param: string;
  gtmVariable: string;
  devGuideVar?: string;
  scope: 'event' | 'user';
  condition?: string;  // content_group 조건
}

function generateMappingTable(eventSettings: EventSettingsVariable): ParameterMapping[] {
  const mappings: ParameterMapping[] = [];

  // Event Parameters
  for (const param of eventSettings.eventSettingsTable) {
    mappings.push({
      ga4Param: param.parameter,
      gtmVariable: param.parameterValue,
      devGuideVar: inferDevGuideVar(param.parameterValue),
      scope: 'event',
      condition: inferCondition(param.parameter)
    });
  }

  // User Properties
  for (const prop of eventSettings.userProperties) {
    mappings.push({
      ga4Param: prop.name,
      gtmVariable: prop.value,
      devGuideVar: inferDevGuideVar(prop.value),
      scope: 'user'
    });
  }

  return mappings;
}
```

---

### 4. 조건부 파라미터 자동 분류

GTM Variable 이름 패턴으로 content_group 조건 유추:

```typescript
function inferCondition(paramName: string): string | undefined {
  const conditionalPatterns: Record<string, string[]> = {
    'PRODUCT_DETAIL': [
      'product_id', 'product_name', 'product_category',
      'product_brandname', 'product_brandcode', 'product_is_stock'
    ],
    'EVENT_DETAIL': ['view_event_code', 'view_event_name'],
    'BRAND_MAIN': ['brandshop_code', 'brandshop_name'],
    'STORE_*': ['page_store_code', 'page_store_name'],
    'SEARCH_RESULT': ['search_brand_code', 'search_brand']
  };

  for (const [condition, params] of Object.entries(conditionalPatterns)) {
    if (params.includes(paramName)) {
      return condition;
    }
  }

  return undefined;
}
```

---

### 5. 자동 문서 생성

파싱 결과로 PARAM_MAPPING_TABLE.md 자동 생성:

```typescript
async function generateMappingDoc(mappings: ParameterMapping[]): Promise<string> {
  let md = '# 파라미터 매핑 테이블\n\n';
  md += '> ⚠️ 이 문서는 GTM JSON에서 자동 생성되었습니다.\n\n';

  // 공통 파라미터
  md += '## 공통 파라미터\n\n';
  const commonParams = mappings.filter(m => !m.condition);
  md += generateTable(commonParams);

  // 조건부 파라미터
  md += '## 조건부 파라미터\n\n';
  const conditions = [...new Set(mappings.filter(m => m.condition).map(m => m.condition))];
  for (const condition of conditions) {
    md += `### ${condition}\n\n`;
    const condParams = mappings.filter(m => m.condition === condition);
    md += generateTable(condParams);
  }

  return md;
}
```

---

## 구현 우선순위

| 순서 | 작업 | 복잡도 | 효과 |
|-----|------|-------|------|
| 1 | GTM 변수 타입별 파싱 | 중 | 높음 |
| 2 | GT - Event Settings 파싱 | 중 | 높음 |
| 3 | 변수 체인 추적 | 높음 | 높음 |
| 4 | 데이터 소스 구분 | 중 | 높음 |
| 5 | 개발가이드 변수 매핑 | 중 | 중 |
| 6 | 조건부 파라미터 분류 | 낮 | 중 |
| 7 | Measurement ID 분기 분석 | 중 | 중 |
| 8 | 자동 문서 생성 | 중 | 높음 |

---

## 핵심 개선: 변수 체인 추적

### 문제
GA4 파라미터 하나가 여러 GTM 변수를 거쳐 최종 값이 결정됨:

```
GA4 Parameter: site_name
    └── {{JS - Site Name}} (jsm)
            └── window.AP_DATA_SITENAME (전역변수)
            └── fallback: "APMALL"

GA4 Parameter: content_group
    └── {{LT - Content Group}} (smm - Lookup Table)
            └── input: {{JS - Page Type}} (jsm)
                        └── window.AP_DATA_PAGETYPE (전역변수)
```

### 해결: 재귀적 변수 추적

```typescript
interface VariableChain {
  ga4Param: string;
  gtmVariable: string;
  variableType: 'jsm' | 'v' | 'smm' | 'remm' | 'c' | 'gtes';
  dataSources: DataSource[];
  dependencies: VariableChain[];  // 다른 GTM 변수 참조
}

interface DataSource {
  type: 'global_variable' | 'datalayer' | 'constant' | 'url' | 'dom';
  name: string;
  path?: string;       // DataLayer: "ecommerce.items.0.item_id"
  selector?: string;   // DOM: "meta[name='page-type']"
  fallback?: string;   // 기본값
}

function buildVariableChain(
  ga4Param: string,
  gtmVariableName: string,
  allVariables: Map<string, GTMVariable>
): VariableChain {
  const variable = allVariables.get(gtmVariableName);
  if (!variable) throw new Error(`Variable not found: ${gtmVariableName}`);

  const chain: VariableChain = {
    ga4Param,
    gtmVariable: gtmVariableName,
    variableType: variable.type,
    dataSources: [],
    dependencies: []
  };

  switch (variable.type) {
    case 'jsm':
      // Custom JavaScript - 코드에서 소스 추출
      const jsCode = getJSCode(variable);
      chain.dataSources = extractDataSourcesFromJS(jsCode);

      // 다른 GTM 변수 참조 추적
      const refs = extractGTMReferences(jsCode);
      for (const ref of refs) {
        chain.dependencies.push(
          buildVariableChain(ga4Param, ref, allVariables)
        );
      }
      break;

    case 'v':
      // DataLayer Variable
      const dlName = getDataLayerName(variable);
      chain.dataSources.push({
        type: 'datalayer',
        name: dlName,
        path: dlName
      });
      break;

    case 'smm':
    case 'remm':
      // Lookup Table - input 변수 추적
      const input = getLookupInput(variable);
      const inputRef = extractGTMReferences(input);
      for (const ref of inputRef) {
        chain.dependencies.push(
          buildVariableChain(ga4Param, ref, allVariables)
        );
      }
      // 매핑 테이블도 저장
      chain.dataSources.push({
        type: 'constant',
        name: 'lookup_table',
        fallback: JSON.stringify(getLookupMap(variable))
      });
      break;

    case 'c':
      // Constant
      chain.dataSources.push({
        type: 'constant',
        name: gtmVariableName,
        fallback: getConstantValue(variable)
      });
      break;
  }

  return chain;
}
```

---

## 핵심 개선: 데이터 소스 구분

### 전역변수 vs DataLayer

| 구분 | 전역변수 | DataLayer |
|------|---------|-----------|
| 선언 위치 | `<script>window.AP_*=...</script>` | `dataLayer.push({...})` |
| GTM 변수 타입 | `jsm` (Custom JavaScript) | `v` (Data Layer Variable) |
| 네이밍 | `JS - *` | `DL - *` |
| 사용 시점 | 페이지 로드 시 | 이벤트 발생 시 |
| 예시 | `AP_DATA_SITENAME` | `event: 'product'` |

### 하이브리드 패턴 감지

일부 Custom JavaScript는 두 소스 모두 확인:

```javascript
function() {
  // 1차: DataLayer 확인
  var dlValue = {{DL - ap_data_sitename}};
  if (dlValue) return dlValue;

  // 2차: 전역변수 확인
  try {
    return window.AP_DATA_SITENAME;
  } catch(e) {
    return 'APMALL';  // fallback
  }
}
```

파서는 이 패턴을 감지하여 두 소스 모두 기록해야 함.

---

## Measurement ID 분기 처리

### 구조

```
RT - GA4 MeasurementId Table (remm)
    ├── input: {{JS - Site MeasurementId By Env}}
    └── map:
        ├── "true"  → G-FZGDPV2WNV (운영)
        ├── "false" → G-8NQQDY31FN (개발)
        └── "App"   → (앱 전용 ID)

{{JS - Site MeasurementId By Env}} (jsm)
    ├── {{JS - Site Env}} == "PRD" && {{Debug Mode}} == false → true
    ├── {{RT - Host by Env}} == "PRD" && {{Debug Mode}} == false → true
    ├── 앱 환경 (AnalyticsWebInterface) → "App"
    └── 기타 → false
```

### 파싱 결과

```typescript
interface MeasurementIdConfig {
  conditions: {
    id: string;           // "G-FZGDPV2WNV"
    environment: string;  // "PRD" | "DEV" | "App"
    debugMode: boolean;
    hostPattern?: string;
  }[];
  defaultId?: string;
}
```

이 정보를 파악해야 **어떤 GA4 Property로 데이터가 전송되는지** 시나리오에서 검증 가능

---

## 예상 효과

1. **동기화 문제 해결**: GTM JSON 변경 시 자동 반영
2. **정확도 향상**: 수동 입력 오류 제거
3. **유지보수 비용 절감**: 문서 업데이트 자동화
4. **검증 가능**: GTM 설정과 문서 일치 여부 자동 검증

---

## 참고: GT - Event Settings 구조

```json
{
  "name": "GT - Event Settings",
  "type": "gtes",
  "parameter": [
    {
      "type": "LIST",
      "key": "eventSettingsTable",
      "list": [
        {
          "type": "MAP",
          "map": [
            { "key": "parameter", "value": "site_name" },
            { "key": "parameterValue", "value": "{{JS - Site Name}}" }
          ]
        }
      ]
    },
    {
      "type": "LIST",
      "key": "userProperties",
      "list": [
        {
          "type": "MAP",
          "map": [
            { "key": "name", "value": "login_gender" },
            { "key": "value", "value": "{{JS - Login Gender}}" }
          ]
        }
      ]
    }
  ]
}
```
