# 다중 사이트 지원 아키텍처

## 현재 문제점 분석

### 1. Hardcoded 값들의 문제
현재 가이드 파일들에 다음과 같은 사이트별 구현 세부사항이 하드코딩되어 있습니다:

| 항목 | Amoremall 값 | Shopify (Innisfree) 값 |
|-----|-------------|----------------------|
| 장바구니 담기 이벤트 | `addcart` | `cart` |
| 결제 시작 이벤트 | `checkout` | `purchasecartbtn`, `purchaseprdbtn`, `order` |
| 로그인 이벤트 | `login` | `login_complete` |
| 회원가입 이벤트 | `sign_up` | `sign_up_complete` |
| 상품 조회 이벤트 | `product` | `product` |
| DOM 속성 | `ap-data-promotion` | `ap-data-promotion` |

### 2. 세 가지 레이어의 혼재
현재 가이드는 다음 세 가지가 구분 없이 섞여 있습니다:
1. **GA4 표준 이벤트** (고정) - `select_promotion`, `add_to_cart`, `view_item` 등
2. **사이트 구현 방식** (가변) - dataLayer 이벤트명, DOM 속성명
3. **GTM 설정** (가변) - 트리거 타입, CSS Selector

---

## 새로운 아키텍처 제안

### 레이어 분리 구조

```
┌─────────────────────────────────────────────────────────────┐
│                    Layer 1: GA4 Standard                     │
│  (고정 - 모든 사이트 공통)                                      │
│  - GA4 이벤트 명세 (select_promotion, add_to_cart 등)          │
│  - 필수/권장 파라미터 정의                                      │
│  - 이벤트 발생 조건의 비즈니스 로직                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 Layer 2: Site Configuration                  │
│  (가변 - 사이트마다 다름, 개발가이드 PDF에서 추출)                 │
│  - dataLayer 이벤트명 매핑                                     │
│  - DOM 속성명 (ap-data-promotion, ap-click-area 등)           │
│  - 변수명 규칙 (AP_DATA_*, AP_PRD_* 등)                        │
│  - 페이지 타입 정의                                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Layer 3: GTM Configuration                 │
│  (가변 - GTM JSON에서 자동 추출)                                │
│  - 트리거 타입 (LINK_CLICK, CUSTOM_EVENT 등)                   │
│  - CSS Selector 조건                                          │
│  - 커스텀 이벤트 필터 조건                                      │
│  - 변수 정의 및 매핑                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 파일 구조 제안

```
createSenarioAgent/
├── guides/
│   └── ga4-standard/              # Layer 1: GA4 표준 (변경 불필요)
│       ├── select_promotion.md
│       ├── add_to_cart.md
│       ├── view_item.md
│       └── ...
│
├── sites/                          # Layer 2 & 3: 사이트별 설정
│   ├── amoremall-kr/
│   │   ├── site-config.json       # 개발가이드에서 추출한 설정
│   │   ├── gtm-config.json        # GTM JSON에서 추출한 설정
│   │   └── source/
│   │       ├── dev-guide.pdf
│   │       └── GTM-XXXXXX.json
│   │
│   ├── innisfree-kr/
│   │   ├── site-config.json
│   │   ├── gtm-config.json
│   │   └── source/
│   │
│   └── laneige-us/
│       └── ...
│
├── src/
│   ├── parsers/
│   │   ├── devGuideParser.ts      # PDF 개발가이드 파서
│   │   └── gtmConfigParser.ts     # GTM JSON 파서
│   │
│   ├── generators/
│   │   └── scenarioGenerator.ts   # 시나리오 생성 (3개 레이어 병합)
│   │
│   └── types/
│       ├── ga4Events.ts           # GA4 표준 이벤트 타입
│       ├── siteConfig.ts          # 사이트 설정 타입
│       └── gtmConfig.ts           # GTM 설정 타입
│
└── templates/
    └── scenario-template.md        # 시나리오 출력 템플릿
```

---

## Site Configuration Schema (site-config.json)

```typescript
interface SiteConfig {
  // 사이트 기본 정보
  siteInfo: {
    name: string;           // "아모레몰 KR"
    domain: string;         // "amoremall.com"
    platform: string;       // "custom" | "shopify" | "cafe24"
    country: string;        // "KR"
  };

  // dataLayer 이벤트명 매핑
  // GA4 표준 이벤트 → 사이트 dataLayer 이벤트명
  eventMapping: {
    add_to_cart: string;      // "addcart" or "cart"
    remove_from_cart: string; // "removecart"
    view_item: string;        // "product"
    view_item_list: string;   // "view_item_list" or "ap_search"
    begin_checkout: string;   // "checkout" or "cart|purchasecartbtn|order"
    purchase: string;         // "purchase"
    login: string;            // "login" or "login_complete"
    sign_up: string;          // "sign_up" or "sign_up_complete"
    view_search_results: string;
    write_review: string;     // "write_review" or "review"
  };

  // DOM 속성명
  domAttributes: {
    promotion: string;        // "ap-data-promotion"
    item: string;             // "ap-data-item"
    click: string;            // "ap-data-click"
    clickArea: string;        // "ap-click-area"
    clickName: string;        // "ap-click-name"
  };

  // 변수 네이밍 규칙
  variableNaming: {
    prefix: string;           // "AP_"
    product: string;          // "PRD" → AP_PRD_CODE
    cart: string;             // "CART" → AP_CART_TOTAL
    purchase: string;         // "PURCHASE" → AP_PURCHASE_TOTAL
    data: string;             // "DATA" → AP_DATA_SITENAME
  };

  // 페이지 타입 매핑
  pageTypes: {
    main: string[];           // ["MAIN", "main"]
    category: string[];       // ["CATEGORY", "category", "collection"]
    product: string[];        // ["PRODUCT", "product", "PDP"]
    cart: string[];           // ["CART", "cart"]
    checkout: string[];       // ["CHECKOUT", "checkout", "order"]
    search: string[];         // ["SEARCH", "search"]
    mypage: string[];         // ["MYPAGE", "mypage", "account"]
  };
}
```

---

## GTM Configuration Schema (gtm-config.json)

GTM JSON에서 자동 추출되는 설정:

```typescript
interface GTMConfig {
  containerId: string;        // "GTM-5FK5X5C4"
  containerName: string;      // "[EC] AMOREMALL - KR"

  // 이벤트별 트리거 정보
  eventTriggers: {
    [ga4EventName: string]: {
      triggerType: "LINK_CLICK" | "CLICK" | "CUSTOM_EVENT" | "PAGEVIEW" | "DOM_READY" | "SCROLL_DEPTH";
      triggerId: string;
      triggerName: string;

      // LINK_CLICK/CLICK인 경우
      cssSelector?: string;

      // CUSTOM_EVENT인 경우
      customEventName?: string;    // dataLayer event명
      customEventFilter?: string;  // regex 패턴

      // 추가 필터 조건
      filters?: Array<{
        variable: string;
        condition: string;
        value: string;
      }>;
    };
  };

  // 변수 정의
  variables: {
    [variableName: string]: {
      type: string;             // "jsm" (JavaScript 변수), "v" (데이터 레이어 변수)
      source?: string;          // 데이터 소스
    };
  };
}
```

---

## 워크플로우

### 1. 새 사이트 추가 시

```
Input:
  - 개발가이드 PDF
  - GTM JSON export

Process:
  1. devGuideParser.ts → PDF 분석 → site-config.json 생성
  2. gtmConfigParser.ts → GTM JSON 분석 → gtm-config.json 생성
  3. 수동 검토 및 보정

Output:
  - sites/{site-name}/site-config.json
  - sites/{site-name}/gtm-config.json
```

### 2. 시나리오 생성 시

```
Input:
  - 대상 사이트 지정
  - 테스트할 페이지 URL
  - 스크린샷/DOM 정보

Process:
  1. GA4 표준 가이드 로드 (guides/ga4-standard/)
  2. 사이트 설정 로드 (sites/{site}/site-config.json)
  3. GTM 설정 로드 (sites/{site}/gtm-config.json)
  4. 3개 레이어 병합하여 시나리오 생성

Output:
  - 사이트별 맞춤 시나리오 문서
```

---

## 마이그레이션 계획

### Phase 1: 구조 분리
1. 현재 `guides/*.md` → `guides/ga4-standard/*.md` 이동
2. 사이트별 하드코딩 내용 제거
3. `sites/` 디렉토리 구조 생성

### Phase 2: Parser 개발
1. `gtmConfigParser.ts` - GTM JSON 파싱 (기존 gtmAnalyzer.ts 확장)
2. `devGuideParser.ts` - PDF 개발가이드 파싱 (신규)

### Phase 3: 사이트 설정 생성
1. Amoremall KR site-config.json 생성
2. Innisfree (Shopify) site-config.json 생성

### Phase 4: 시나리오 생성기 수정
1. 3개 레이어 병합 로직 구현
2. 템플릿 기반 시나리오 출력

---

## 장점

1. **확장성**: 새 사이트 추가 시 설정 파일만 추가
2. **유지보수성**: GA4 표준은 한 곳에서 관리
3. **자동화**: GTM JSON에서 트리거 정보 자동 추출
4. **일관성**: 같은 GA4 이벤트에 대해 일관된 테스트 기준
5. **추적성**: 사이트별 차이점 명확하게 문서화

---

## GTM JSON에서 추출 가능한 정보

| 정보 | GTM JSON 위치 | 활용 |
|-----|--------------|------|
| 트리거 타입 | `trigger[].type` | 이벤트 발생 방식 판단 |
| CSS Selector | `trigger[].filter[].value` | 클릭 대상 요소 식별 |
| 커스텀 이벤트명 | `trigger[].customEventFilter[].value` | dataLayer 이벤트 매핑 |
| GA4 이벤트명 | `tag[].parameter[eventName]` | GA4 이벤트 식별 |
| 변수 정의 | `variable[]` | 데이터 추출 방식 이해 |

---

## 개발가이드 PDF에서 추출 필요한 정보

| 정보 | 추출 방식 | 활용 |
|-----|----------|------|
| dataLayer 이벤트명 | 텍스트 파싱/테이블 | eventMapping 생성 |
| DOM 속성명 | 텍스트 파싱/예제 코드 | domAttributes 생성 |
| 변수명 규칙 | 테이블/코드 예제 | variableNaming 생성 |
| 페이지 타입 | 텍스트/테이블 | pageTypes 생성 |
