# GTM JSON 파싱 가이드

## 개요

이 문서는 GTM (Google Tag Manager) JSON 내보내기 파일을 파싱하여 사이트별 설정을 추출하는 방법을 설명합니다.

---

## GTM JSON 내보내기 방법

### 1. GTM 콘솔에서 내보내기

1. [GTM 콘솔](https://tagmanager.google.com/) 접속
2. 해당 컨테이너 선택
3. **관리** > **컨테이너 내보내기** 클릭
4. 버전 또는 작업공간 선택
5. JSON 파일 다운로드

### 2. 파일명 규칙

```
GTM-{컨테이너ID}_workspace{번호}.json
예: GTM-5FK5X5C4_workspace112.json
```

---

## GTM JSON 구조

### 최상위 구조

```json
{
  "exportFormatVersion": 2,
  "exportTime": "2024-12-15 00:00:00",
  "containerVersion": {
    "container": { ... },
    "tag": [ ... ],
    "trigger": [ ... ],
    "variable": [ ... ],
    "folder": [ ... ]
  }
}
```

### 주요 섹션

| 섹션 | 설명 | 추출 대상 |
|-----|------|----------|
| `tag` | GA4 이벤트 태그 | 이벤트명, 파라미터 매핑 |
| `trigger` | 트리거 조건 | CSS Selector, Custom Event명 |
| `variable` | 변수 정의 | DOM 속성 추출 로직 |

---

## 트리거 타입별 파싱

### CUSTOM_EVENT 트리거 파싱

**목표**: dataLayer.push의 event명 추출

**GTM JSON 구조:**
```json
{
  "type": "CUSTOM_EVENT",
  "name": "login_complete",
  "customEventFilter": [
    {
      "type": "EQUALS",
      "parameter": [
        { "type": "TEMPLATE", "key": "arg0", "value": "{{_event}}" },
        { "type": "TEMPLATE", "key": "arg1", "value": "login_complete" }
      ]
    }
  ]
}
```

**추출 방법:**
```typescript
function extractCustomEventName(trigger: any): string | undefined {
  if (trigger.type !== 'CUSTOM_EVENT') return undefined;

  const filter = trigger.customEventFilter?.[0];
  if (!filter) return undefined;

  const params = filter.parameter || [];
  const valueParam = params.find((p: any) => p.key === 'arg1');

  return valueParam?.value;
}
```

**추출 결과:**
```json
{
  "eventMapping": {
    "login": "login_complete"
  }
}
```

### LINK_CLICK 트리거 파싱

**목표**: CSS Selector 추출

**GTM JSON 구조:**
```json
{
  "type": "LINK_CLICK",
  "name": "ap-click",
  "filter": [
    {
      "type": "CSS_SELECTOR",
      "parameter": [
        { "type": "TEMPLATE", "key": "arg0", "value": "{{Click Element}}" },
        { "type": "TEMPLATE", "key": "arg1", "value": "[ap-click-area], [ap-click-area] *" }
      ]
    }
  ]
}
```

**추출 방법:**
```typescript
function extractCssSelector(trigger: any): string | undefined {
  if (trigger.type !== 'LINK_CLICK' && trigger.type !== 'CLICK') {
    return undefined;
  }

  const filters = trigger.filter || [];
  const cssFilter = filters.find((f: any) => f.type === 'CSS_SELECTOR');

  if (!cssFilter) return undefined;

  const params = cssFilter.parameter || [];
  const valueParam = params.find((p: any) => p.key === 'arg1');

  return valueParam?.value;
}
```

**추출 결과:**
```json
{
  "domAttributes": {
    "apClick": {
      "cssSelector": "[ap-click-area], [ap-click-area] *"
    }
  }
}
```

### REGEX 필터 파싱

일부 트리거는 정규식으로 여러 이벤트를 매칭합니다.

**GTM JSON 구조:**
```json
{
  "type": "CUSTOM_EVENT",
  "customEventFilter": [
    {
      "type": "MATCH_REGEX",
      "parameter": [
        { "type": "TEMPLATE", "key": "arg0", "value": "{{_event}}" },
        { "type": "TEMPLATE", "key": "arg1", "value": "^cart$|purchasecartbtn|checkout" }
      ]
    }
  ]
}
```

**추출 방법:**
```typescript
function extractRegexPattern(trigger: any): string | undefined {
  const filter = trigger.customEventFilter?.[0];
  if (filter?.type !== 'MATCH_REGEX') return undefined;

  const params = filter.parameter || [];
  const valueParam = params.find((p: any) => p.key === 'arg1');

  return valueParam?.value;
}
```

---

## 태그에서 이벤트 매핑 추출

### GA4 이벤트 태그 구조

**GTM JSON 구조:**
```json
{
  "type": "gaawe",
  "name": "GA4 - login",
  "parameter": [
    { "type": "TEMPLATE", "key": "eventName", "value": "login" },
    { "type": "TEMPLATE", "key": "measurementIdOverride", "value": "{{GA4 ID}}" }
  ],
  "firingTriggerId": ["123"]
}
```

**추출 방법:**
```typescript
function extractGA4EventName(tag: any): string | undefined {
  if (tag.type !== 'gaawe') return undefined;

  const params = tag.parameter || [];
  const eventNameParam = params.find((p: any) => p.key === 'eventName');

  return eventNameParam?.value;
}
```

### 트리거-태그 연결

```typescript
function mapTriggerToGA4Event(
  triggers: any[],
  tags: any[]
): Record<string, string> {
  const mapping: Record<string, string> = {};

  for (const tag of tags) {
    if (tag.type !== 'gaawe') continue;

    const ga4EventName = extractGA4EventName(tag);
    const triggerIds = tag.firingTriggerId || [];

    for (const triggerId of triggerIds) {
      const trigger = triggers.find(t => t.triggerId === triggerId);
      if (!trigger) continue;

      const dataLayerEvent = extractCustomEventName(trigger);
      if (dataLayerEvent && ga4EventName) {
        mapping[ga4EventName] = dataLayerEvent;
      }
    }
  }

  return mapping;
}
```

---

## 변수에서 DOM 속성 추출

### Custom JavaScript Variable 구조

**GTM JSON 구조:**
```json
{
  "type": "jsm",
  "name": "JS - Select Promotion DataLayer",
  "parameter": [
    {
      "type": "TEMPLATE",
      "key": "javascript",
      "value": "function() {\n  var el = {{Click Element}};\n  var data = el.getAttribute('ap-click-data');\n  return JSON.parse(data);\n}"
    }
  ]
}
```

**속성명 추출:**
```typescript
function extractDomAttribute(variable: any): string | undefined {
  if (variable.type !== 'jsm') return undefined;

  const params = variable.parameter || [];
  const jsParam = params.find((p: any) => p.key === 'javascript');

  if (!jsParam?.value) return undefined;

  // getAttribute('속성명') 패턴 찾기
  const match = jsParam.value.match(/getAttribute\(['"]([^'"]+)['"]\)/);
  return match?.[1];
}
```

---

## GTM Config Extractor 사용법

### 기본 사용

```typescript
import { GTMConfigExtractor } from './src/parsers/gtmConfigExtractor';
import * as fs from 'fs';

// GTM JSON 로드
const gtmJson = JSON.parse(
  fs.readFileSync('GTM-5FK5X5C4_workspace112.json', 'utf-8')
);

// Extractor 생성 및 실행
const extractor = new GTMConfigExtractor(gtmJson);
const config = extractor.extract();

console.log(config);
```

### 추출 결과 구조

```typescript
interface ExtractedGTMConfig {
  containerId: string;
  containerName: string;
  triggers: {
    name: string;
    type: string;
    customEvent?: string;
    cssSelector?: string;
    regexPattern?: string;
  }[];
  eventMapping: Record<string, string>;
  domAttributes: Record<string, {
    cssSelector?: string;
    dataAttribute?: string;
  }>;
}
```

### 추출 결과 예시

```json
{
  "containerId": "GTM-5FK5X5C4",
  "containerName": "amoremall.com",
  "triggers": [
    {
      "name": "login_complete",
      "type": "CUSTOM_EVENT",
      "customEvent": "login_complete"
    },
    {
      "name": "ap-click",
      "type": "LINK_CLICK",
      "cssSelector": "[ap-click-area], [ap-click-area] *"
    }
  ],
  "eventMapping": {
    "login": "login_complete",
    "sign_up": "sign_up_complete",
    "view_search_results": "search",
    "write_review": "review",
    "add_to_cart": "addcart",
    "begin_checkout": "checkout"
  },
  "domAttributes": {
    "apClick": {
      "cssSelector": "[ap-click-area], [ap-click-area] *",
      "dataAttribute": "ap-click-data"
    }
  }
}
```

---

## site-config.json 생성

### 추출 결과를 site-config.json으로 변환

```typescript
function createSiteConfig(
  extractedConfig: ExtractedGTMConfig,
  siteInfo: { id: string; name: string; domain: string }
): SiteConfig {
  return {
    siteInfo: {
      id: siteInfo.id,
      name: siteInfo.name,
      domain: siteInfo.domain,
      gtmContainerId: extractedConfig.containerId
    },
    eventMapping: extractedConfig.eventMapping,
    domAttributes: {
      apClick: extractedConfig.domAttributes.apClick,
      selectPromotion: extractedConfig.domAttributes.selectPromotion,
      selectItem: extractedConfig.domAttributes.selectItem
    },
    variableNaming: {
      // GTM 변수명 (수동 확인 필요)
    },
    pageTypes: {
      // URL 패턴 (수동 설정 필요)
    }
  };
}
```

---

## 수동 확인이 필요한 항목

GTM JSON에서 자동 추출이 어려운 항목들:

### 1. GA4 이벤트와 dataLayer 이벤트 매핑

트리거와 태그의 연결이 복잡한 경우 수동 확인 필요:

```
GTM 콘솔 > 태그 > [GA4 태그] > 트리거 확인
```

### 2. 변수의 파라미터 매핑

Custom JavaScript 변수가 복잡한 경우:

```
GTM 콘솔 > 변수 > [변수명] > 코드 확인
```

### 3. 페이지 타입별 URL 패턴

URL 패턴은 사이트 구조에 따라 다름:

```json
{
  "pageTypes": {
    "main": "/",
    "category": "/category/*",
    "product": "/product/detail/*",
    "cart": "/cart",
    "checkout": "/order/*"
  }
}
```

---

## 검증 방법

### 1. 브라우저에서 dataLayer 확인

```javascript
// 개발자도구 Console에서 실행
dataLayer.filter(d => d.event).map(d => d.event)
```

### 2. GTM Preview 모드

1. GTM 콘솔 > **미리보기** 클릭
2. 사이트 URL 입력
3. Tag Assistant에서 이벤트 확인

### 3. GA4 DebugView

1. GA4 콘솔 > **관리** > **DebugView**
2. 실시간 이벤트 수신 확인

---

## 트러블슈팅

### 문제: 추출된 이벤트명이 실제와 다름

**원인**: 트리거 조건이 복잡하거나 여러 트리거가 조합됨

**해결**:
1. GTM Preview 모드로 실제 동작 확인
2. 해당 태그의 모든 트리거 확인
3. 트리거 그룹 (All/Some) 조건 확인

### 문제: CSS Selector가 추출되지 않음

**원인**: 트리거가 다른 필터 타입 사용

**해결**:
1. GTM 콘솔에서 트리거 조건 직접 확인
2. `CONTAINS`, `STARTS_WITH` 등 다른 필터 타입 확인

### 문제: DOM 속성명을 찾을 수 없음

**원인**: JavaScript 변수가 복잡한 로직 사용

**해결**:
1. GTM 변수의 JavaScript 코드 직접 분석
2. 브라우저에서 실제 DOM 요소 검사

---

## 이벤트별 파라미터 추출

### 중요 원칙

> **가이드 파일의 파라미터는 대표 예시입니다.**
>
> 각 이벤트 가이드에 명시된 파라미터는 일반적인 GA4 Ecommerce 표준을 기반으로 한 **대표적인 예시**입니다.
> 실제 구현은 사이트별 GTM 설정에 따라 다르므로, **시나리오 설계 시 반드시 GTM 파싱을 통해 실제 파라미터를 확인**해야 합니다.

### GTM에서 파라미터 확인 방법

#### 1) 태그에서 이벤트 파라미터 확인

```
GTM 콘솔 경로:
Tags → [GA4 이벤트 태그] → Event Parameters 섹션
```

GTM JSON에서 추출:
```json
{
  "type": "gaawe",
  "name": "GA4 - Ecommerce - View Item",
  "parameter": [
    {
      "type": "LIST",
      "key": "eventSettingsTable",
      "list": [
        {
          "type": "MAP",
          "map": [
            { "key": "parameter", "value": "currency" },
            { "key": "parameterValue", "value": "{{JS - Currency}}" }
          ]
        },
        {
          "key": "parameter", "value": "items" },
          { "key": "parameterValue", "value": "{{JS - View Item DataLayer}}" }
        }
      ]
    }
  ]
}
```

#### 2) 변수에서 items 구조 확인

```
GTM 콘솔 경로:
Variables → [JS - View Item DataLayer] 등 DataLayer 관련 변수 확인
```

### items 배열 구조 추출

GTM 변수의 JavaScript 코드에서 items 객체 구조를 확인합니다.

**예시: JS - View Item DataLayer (Amoremall)**
```javascript
function() {
  var items = [];
  var itemObj = {};

  itemObj.item_id = window.AP_PRD_CODE;
  itemObj.item_name = window.AP_PRD_NAME;
  itemObj.item_brand = window.AP_PRD_BRAND;
  itemObj.item_category = window.AP_PRD_CATEGORY.split("/")[0];
  itemObj.item_category2 = window.AP_PRD_CATEGORY.split("/")[1];
  itemObj.item_category3 = window.AP_PRD_CATEGORY.split("/")[2];
  itemObj.price = parseInt(window.AP_PRD_PRICE);
  itemObj.discount = parseInt(window.AP_PRD_PRDPRICE) - parseInt(window.AP_PRD_PRICE);
  itemObj.original_price = parseInt(window.AP_PRD_PRDPRICE);
  itemObj.apg_brand_code = window.AP_PRD_APGBRCODE;
  itemObj.internal_brand_code = window.AP_PRD_INTERBRCODE;

  items.push(itemObj);
  return items;
}
```

**추출된 items 파라미터:**
| 파라미터 | 출처 변수 | 설명 |
|---------|----------|------|
| item_id | AP_PRD_CODE | 상품 코드 |
| item_name | AP_PRD_NAME | 상품명 |
| item_brand | AP_PRD_BRAND | 브랜드명 |
| item_category | AP_PRD_CATEGORY (1번째) | 대분류 |
| item_category2 | AP_PRD_CATEGORY (2번째) | 중분류 |
| item_category3 | AP_PRD_CATEGORY (3번째) | 소분류 |
| price | AP_PRD_PRICE | 판매가 |
| original_price | AP_PRD_PRDPRICE | 정가 |
| discount | 정가 - 판매가 | 할인금액 |
| apg_brand_code | AP_PRD_APGBRCODE | APG 브랜드 코드 |
| internal_brand_code | AP_PRD_INTERBRCODE | 내부 브랜드 코드 |

---

## 이벤트별 대표 파라미터 (Amoremall 기준)

> **주의**: 아래는 Amoremall GTM 기준 대표 예시입니다.
> 다른 사이트는 해당 사이트의 GTM을 분석하여 파라미터를 확인하세요.

### view_item

| 파라미터 | 변수 | 설명 |
|---------|------|------|
| event_category | 고정값 | "ecommerce" |
| event_action | 고정값 | "view item" |
| event_label | JS - Item Name | 상품명 |
| currency | JS - Currency | 통화 코드 |
| items | JS - View Item DataLayer | 상품 배열 |
| product_id | JS - Product Id with View Item | 상품 ID |
| product_name | JS - Product Name with View Item | 상품명 |
| product_category | JS - Product Category with View Item | 상품 카테고리 |
| product_brandname | JS - Product Brandname with View Item | 브랜드명 |
| product_brandcode | JS - Product Brandcode with View Item | 브랜드 코드 |
| product_is_stock | JS - Product Is Stock with View Item | 재고 여부 |

### add_to_cart

| 파라미터 | 변수 | 설명 |
|---------|------|------|
| event_category | 고정값 | "ecommerce" |
| event_action | 고정값 | "add to cart" |
| currency | JS - Currency | 통화 코드 |
| items | JS - Add to Cart DataLayer | 장바구니 상품 배열 |

**items 내부 구조 (add_to_cart):**
| 파라미터 | 출처 | 설명 |
|---------|------|------|
| item_id | item.code | 상품 코드 |
| item_name | item.name | 상품명 |
| item_brand | item.brand | 브랜드명 |
| item_category~5 | item.cate (split) | 카테고리 |
| item_variant | item.variant | 옵션 |
| quantity | item.quantity | 수량 |
| price | item.price | 판매가 |
| original_price | item.prdprice | 정가 |

### purchase

| 파라미터 | 변수 | 설명 |
|---------|------|------|
| event_category | 고정값 | "ecommerce" |
| event_action | 고정값 | "purchase" |
| transaction_id | JS - Purchase Transaction Id | 주문번호 |
| value | JS - Purchase Value | 결제 금액 |
| currency | JS - Currency | 통화 코드 |
| coupon | JS - Purchase Coupon | 쿠폰명 |
| items | JS - Purchase DataLayer | 구매 상품 배열 |
| purchase_method | JS - Purchase Method | 결제 수단 |
| giftcard_discount | JS - Purchase Giftcard Discount | 상품권 할인 |
| beauty_discount | JS - Purchase Beauty Discount | 뷰티포인트 할인 |
| coupon_discount | JS - Purchase Coupon Discount | 쿠폰 할인 |
| mobile_discount | JS - Purchase Mobile Discount | 모바일 할인 |
| member_discount | JS - Purchase Member Discount | 회원 할인 |
| total_discount | JS - Purchase Total Discount | 총 할인 |
| total_amount | JS - Purchase Total Amount | 총 상품가 |
| shipping | JS - Purchase Shipping | 배송비 |

### view_item_list / view_search_results

| 파라미터 | 변수 | 설명 |
|---------|------|------|
| event_category | 고정값 | "ecommerce" |
| event_action | 고정값 | "view item list" |
| items | JS - View Item List DataLayer | 상품 목록 배열 |
| search_result | 조건값 | 검색 결과 유무 (Y/N) |
| search_resultcount | 상품 수 | 검색 결과 개수 |
| search_term | 검색어 | 검색 키워드 |

---

## 시나리오 설계 시 GTM 파싱 필수 체크리스트

```
## GTM 분석 필수 항목

□ 1. 이벤트 태그에서 전달하는 파라미터 목록 확인
   - GTM > Tags > [이벤트 태그] > Event Parameters

□ 2. items 배열 생성 변수 확인
   - GTM > Variables > JS - [이벤트명] DataLayer
   - items 내부 속성 목록 추출

□ 3. 각 파라미터의 출처 변수 확인
   - GTM 변수가 읽어오는 전역 변수 (AP_*, dataLayer 등)
   - 변수 값의 형식 (문자열, 숫자, 배열 등)

□ 4. site-config.json에 파라미터 목록 기록
   - 해당 사이트의 실제 파라미터로 업데이트
   - 가이드 파일과 차이점 문서화

□ 5. 누락/추가 파라미터 확인
   - 가이드에 없는 사이트 고유 파라미터
   - 가이드에 있지만 구현 안 된 파라미터
```

---

## 참조

| 자료 | 링크/위치 |
|-----|----------|
| GTM 공식 문서 | [developers.google.com/tag-manager](https://developers.google.com/tag-manager) |
| GA4 이벤트 레퍼런스 | [support.google.com/analytics](https://support.google.com/analytics/answer/9267735) |
| GTM Config Extractor | `src/parsers/gtmConfigExtractor.ts` |
| site-config 타입 정의 | `src/types/siteConfig.ts` |
