# GTM 변수 타입 상세 가이드

## 데이터 흐름 개요

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           웹사이트 (Data Source)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. 전역 변수 (Global Variable)     │  2. DataLayer                         │
│     window.AP_DATA_SITENAME         │     dataLayer.push({                  │
│     window.AP_PRD_CODE              │       event: 'product',               │
│     window.AP_CART_PRDS (Array)     │       quantity: 2,                    │
│                                     │       ap_data_sitename: 'APMALL'      │
│                                     │     })                                │
└──────────────────┬──────────────────┴────────────────┬────────────────────────┘
                   │                                   │
                   ▼                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              GTM (Processing Layer)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  JS - Site Name (jsm)               │  DL - Quantity (v)                    │
│  ┌─────────────────────────────┐    │  ┌─────────────────────────────┐      │
│  │ function() {                │    │  │ name: "quantity"            │      │
│  │   return AP_DATA_SITENAME;  │    │  │ dataLayerVersion: 2         │      │
│  │ }                           │    │  │                             │      │
│  └─────────────────────────────┘    │  └─────────────────────────────┘      │
│                                                                              │
│  LT - Content Group (smm)           │  RT - MeasurementId (remm)            │
│  ┌─────────────────────────────┐    │  ┌─────────────────────────────┐      │
│  │ Input: {{JS - Page Type}}   │    │  │ Input: {{JS - Env Check}}   │      │
│  │ "main" → "MAIN"             │    │  │ "true" → "G-PROD123"       │      │
│  │ "product" → "PRODUCT_DETAIL"│    │  │ "false" → "G-DEV456"       │      │
│  └─────────────────────────────┘    │  └─────────────────────────────┘      │
└──────────────────────────────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GA4 (Final Destination)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  site_name: "APMALL"                                                        │
│  content_group: "PRODUCT_DETAIL"                                            │
│  Measurement ID: "G-PROD123"                                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## GTM 변수 타입 분류

### 1. `jsm` - Custom JavaScript Variable

**용도**: 전역 변수 읽기 또는 복잡한 로직 처리

**네이밍 규칙**: `JS - *`

**예시**:
```json
{
  "name": "JS - Site Name",
  "type": "jsm",
  "parameter": [{
    "key": "javascript",
    "value": "function() {\n  var result;\n  try {\n    result = AP_DATA_SITENAME ? AP_DATA_SITENAME : undefined;\n  } catch(e) {\n    result = \"APMALL\";\n  }\n  return result;\n}"
  }]
}
```

**데이터 소스**:
- `window.AP_DATA_*` (전역 변수)
- `window.AP_PRD_*` (상품 정보)
- `window.AP_CART_PRDS` (장바구니 배열)
- 다른 GTM 변수 참조 (`{{Event}}`, `{{DL - Quantity}}`)

**파싱 시 주의사항**:
- `try-catch` 내 변수명 추출 필요
- 폴백 값 (fallback) 확인
- 다른 GTM 변수 참조 (`{{...}}`) 추적

---

### 2. `v` - Data Layer Variable

**용도**: dataLayer에서 직접 값 읽기

**네이밍 규칙**: `DL - *`

**예시**:
```json
{
  "name": "DL - Begin Checkout Quantity on PDP",
  "type": "v",
  "parameter": [
    { "key": "dataLayerVersion", "value": "2" },
    { "key": "name", "value": "quantity" }
  ]
}
```

**데이터 소스**:
```javascript
// 웹사이트에서 push
dataLayer.push({
  event: 'product',
  quantity: 2,
  ap_data_sitename: 'APMALL'
});
```

**파싱 시 주의사항**:
- `name` 키에서 dataLayer 속성명 추출
- 중첩 객체 지원: `ecommerce.items.0.item_id`
- 대소문자 구분 여부 확인

---

### 3. `smm` - Simple Lookup Table (Lookup Table)

**용도**: 입력 값을 매핑된 출력 값으로 변환

**네이밍 규칙**: `LT - *`

**예시**:
```json
{
  "name": "LT - Checkout Sequence",
  "type": "smm",
  "parameter": [
    { "key": "input", "value": "{{Event}}" },
    {
      "key": "map",
      "list": [
        { "map": [{ "key": "key", "value": "cart" }, { "key": "value", "value": "1" }] },
        { "map": [{ "key": "key", "value": "order" }, { "key": "value", "value": "2" }] },
        { "map": [{ "key": "key", "value": "orderbtn" }, { "key": "value", "value": "3" }] }
      ]
    }
  ]
}
```

**파싱 시 주의사항**:
- `input`: 입력 소스 (다른 GTM 변수)
- `map`: 키-값 매핑 테이블
- `setDefaultValue`: 기본값 사용 여부
- 변수 체인 추적 필요 (input이 다른 변수 참조 시)

---

### 4. `remm` - RegEx Lookup Table (정규식 매칭)

**용도**: 정규식 패턴으로 입력 값 매핑

**네이밍 규칙**: `RT - *`

**예시 (GA4 Measurement ID 분기)**:
```json
{
  "name": "RT - GA4 MeasurementId Table",
  "type": "remm",
  "notes": "PMO 팀 검수를 위하여 true/false 모두 운영 속성으로 함",
  "parameter": [
    { "key": "input", "value": "{{JS - Site MeasurementId By Env}}" },
    { "key": "ignoreCase", "value": "true" },
    {
      "key": "map",
      "list": [
        { "map": [{ "key": "key", "value": "true" }, { "key": "value", "value": "G-FZGDPV2WNV" }] },
        { "map": [{ "key": "key", "value": "false" }, { "key": "value", "value": "G-8NQQDY31FN" }] }
      ]
    }
  ]
}
```

**변수 체인 분석**:
```
RT - GA4 MeasurementId Table (remm)
    └── input: {{JS - Site MeasurementId By Env}} (jsm)
                    └── {{JS - Site Env}} (jsm)
                            └── window.AP_DATA_ENV
                    └── {{RT - Host by Env}} (remm)
                    └── {{Debug Mode}} (c)
```

**파싱 시 주의사항**:
- 정규식 패턴 매칭 로직 이해
- `ignoreCase` 옵션 확인
- 변수 체인을 끝까지 추적해야 최종 데이터 소스 파악

---

### 5. `gtes` - Google Tag Event Settings

**용도**: GA4 이벤트에 포함될 파라미터/속성 정의

**네이밍 규칙**: `GT - *`

**예시**:
```json
{
  "name": "GT - Event Settings",
  "type": "gtes",
  "parameter": [
    {
      "key": "eventSettingsTable",
      "list": [
        { "map": [{ "key": "parameter", "value": "site_name" }, { "key": "parameterValue", "value": "{{JS - Site Name}}" }] }
      ]
    },
    {
      "key": "userProperties",
      "list": [
        { "map": [{ "key": "name", "value": "login_gender" }, { "key": "value", "value": "{{JS - Login Gender}}" }] }
      ]
    }
  ]
}
```

**구조**:
- `eventSettingsTable`: Event Parameters (이벤트 파라미터)
- `userProperties`: User Properties (사용자 속성)

---

### 6. `c` - Constant

**용도**: 고정 값

**예시**:
```json
{
  "name": "Debug Mode",
  "type": "c",
  "parameter": [{ "key": "value", "value": "false" }]
}
```

---

## 개발가이드 변수 ↔ 데이터 소스 매핑

### 소스 타입별 분류

| 개발가이드 변수 | GTM 변수 타입 | 데이터 소스 | 예시 |
|---------------|--------------|------------|------|
| `AP_DATA_SITENAME` | `jsm` | 전역 변수 | `window.AP_DATA_SITENAME` |
| `AP_DATA_COUNTRY` | `jsm` | 전역 변수 | `window.AP_DATA_COUNTRY` |
| `quantity` | `v` | DataLayer | `dataLayer.push({quantity: 2})` |
| `event` | `v` (built-in) | DataLayer | `dataLayer.push({event: 'product'})` |
| `ecommerce.items` | `v` | DataLayer | 중첩 객체 |

### 하이브리드 케이스

일부 변수는 **두 가지 소스 모두** 지원할 수 있음:

```javascript
// GTM Custom JavaScript 예시
function() {
  // 1차: DataLayer에서 시도
  var dlValue = {{DL - ap_data_sitename}};
  if (dlValue) return dlValue;

  // 2차: 전역 변수에서 시도
  try {
    return window.AP_DATA_SITENAME;
  } catch(e) {
    return 'APMALL';  // 폴백
  }
}
```

---

## 변수 체인 추적 알고리즘

### 목표
GTM 변수에서 **최종 데이터 소스**까지 역추적

### 알고리즘

```typescript
interface VariableSource {
  type: 'global_variable' | 'datalayer' | 'constant' | 'computed';
  name: string;
  path?: string;  // DataLayer 중첩 경로
  fallback?: string;
}

function traceVariableSource(
  variableName: string,
  variables: Map<string, GTMVariable>
): VariableSource[] {
  const sources: VariableSource[] = [];
  const visited = new Set<string>();

  function trace(varName: string) {
    if (visited.has(varName)) return;  // 순환 참조 방지
    visited.add(varName);

    const variable = variables.get(varName);
    if (!variable) return;

    switch (variable.type) {
      case 'jsm':
        // JavaScript 코드에서 소스 추출
        const jsCode = variable.parameter.find(p => p.key === 'javascript')?.value;
        sources.push(...extractSourcesFromJS(jsCode));

        // 다른 GTM 변수 참조 추적
        const refs = extractGTMReferences(jsCode);
        refs.forEach(ref => trace(ref));
        break;

      case 'v':
        // DataLayer 변수
        const dlName = variable.parameter.find(p => p.key === 'name')?.value;
        sources.push({
          type: 'datalayer',
          name: dlName,
          path: dlName
        });
        break;

      case 'smm':
      case 'remm':
        // Lookup Table - input 추적
        const input = variable.parameter.find(p => p.key === 'input')?.value;
        const inputRef = extractGTMReferences(input);
        inputRef.forEach(ref => trace(ref));
        break;

      case 'c':
        sources.push({
          type: 'constant',
          name: varName,
          fallback: variable.parameter.find(p => p.key === 'value')?.value
        });
        break;
    }
  }

  trace(variableName);
  return sources;
}

function extractSourcesFromJS(jsCode: string): VariableSource[] {
  const sources: VariableSource[] = [];

  // window.AP_* 패턴
  const globalVarPattern = /(?:window\.)?AP_[A-Z_]+/g;
  const matches = jsCode.match(globalVarPattern) || [];
  matches.forEach(match => {
    sources.push({
      type: 'global_variable',
      name: match.replace('window.', '')
    });
  });

  return sources;
}

function extractGTMReferences(text: string): string[] {
  const pattern = /\{\{([^}]+)\}\}/g;
  const refs: string[] = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    refs.push(match[1]);
  }
  return refs;
}
```

---

## Measurement ID 분기 로직 분석

### 체인 구조

```
태그: GA4 - Basic Event - Page View (Config)
    └── tagId: {{RT - GA4 MeasurementId Table}}

{{RT - GA4 MeasurementId Table}} (remm)
    └── input: {{JS - Site MeasurementId By Env}}
    └── map:
        "true"  → G-FZGDPV2WNV (운영)
        "false" → G-8NQQDY31FN (개발)

{{JS - Site MeasurementId By Env}} (jsm)
    └── 조건:
        {{JS - Site Env}} == "PRD" && {{Debug Mode}} == false → true
        {{RT - Host by Env}} == "PRD" && {{Debug Mode}} == false → true
        앱 환경 감지 → "App"
        그 외 → false

{{JS - Site Env}} (jsm)
    └── window.AP_DATA_ENV 또는 URL 패턴 분석

{{Debug Mode}} (c)
    └── "false" (상수)

{{RT - Host by Env}} (remm)
    └── hostname 기반 환경 판단
```

### 파싱 결과 구조

```typescript
interface MeasurementIdConfig {
  variableName: string;
  conditions: MeasurementIdCondition[];
}

interface MeasurementIdCondition {
  measurementId: string;
  condition: string;  // "PRD && !Debug", "DEV || Debug", "App"
  dependencies: VariableDependency[];
}

interface VariableDependency {
  variableName: string;
  type: string;
  ultimateSource: VariableSource[];
}
```

---

## 파서 구현 우선순위

| 순서 | 기능 | 복잡도 | 설명 |
|-----|------|-------|------|
| 1 | 변수 타입별 파싱 | 중 | jsm, v, smm, remm, gtes, c 타입 분리 |
| 2 | 변수 체인 추적 | 높음 | `{{...}}` 참조 재귀 추적 |
| 3 | JS 코드 분석 | 높음 | 전역변수명 추출, try-catch 처리 |
| 4 | DataLayer 경로 파싱 | 낮음 | 중첩 경로 지원 |
| 5 | Lookup Table 매핑 | 중 | 조건별 값 매핑 추출 |
| 6 | 최종 데이터 소스 결정 | 중 | 전역변수 vs DataLayer 분류 |

---

## 요약: AI가 이해해야 할 핵심 개념

1. **개발가이드 변수 ≠ GTM 변수 ≠ GA4 파라미터**
   - 개발가이드: 웹 개발자가 선언하는 변수 (AP_DATA_*)
   - GTM 변수: GTM에서 데이터를 읽고 변환하는 중간 레이어
   - GA4 파라미터: 최종적으로 GA4에 전송되는 키-값

2. **데이터 소스는 2가지**
   - 전역 변수: `window.AP_*` (Custom JavaScript로 읽음)
   - DataLayer: `dataLayer.push({...})` (DataLayer Variable로 읽음)

3. **변수 체인이 존재함**
   - 하나의 GA4 파라미터가 여러 GTM 변수를 거쳐 최종 값이 결정됨
   - Lookup Table은 다른 변수의 출력을 입력으로 받음

4. **조건부 분기 존재**
   - 환경(PRD/DEV), 디버그 모드, 앱/웹 등에 따라 다른 값 전송
   - Measurement ID도 조건에 따라 다른 GA4 Property로 전송
