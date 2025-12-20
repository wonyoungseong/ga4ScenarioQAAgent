# page_view 파라미터 Value 예측 규칙

> Vision AI와 시나리오 에이전트가 참조하는 파라미터 값 예측 규칙

---

## 목차

1. [예측 유형 분류](#예측-유형-분류)
2. [고정값 (Static)](#1-고정값-static)
3. [URL 패턴 기반 (URL Pattern)](#2-url-패턴-기반-url-pattern)
4. [브라우저 자동 (Browser Auto)](#3-브라우저-자동-browser-auto)
5. [로그인 상태 기반 (Login Dependent)](#4-로그인-상태-기반-login-dependent)
6. [페이지 데이터 기반 (Page Data)](#5-페이지-데이터-기반-page-data)
7. [내부 로직 (Internal Logic)](#6-내부-로직-internal-logic)

---

## 예측 유형 분류

| 유형 | 설명 | Vision AI 역할 |
|------|------|----------------|
| Static | 항상 같은 값 | 값 확인만 |
| URL Pattern | URL에서 추론 | URL 분석 |
| Browser Auto | 브라우저 자동 | 확인 불필요 |
| Login Dependent | 로그인 여부 | 로그인 UI 감지 |
| Page Data | 페이지별 데이터 | 화면에서 추출 |
| Internal Logic | 내부 로직 | 예측 어려움 |

---

## 1. 고정값 (Static)

> 사이트별로 고정된 값. Vision AI는 값만 확인하면 됨.

| 파라미터 | 예상값 | 설명 |
|----------|--------|------|
| `site_name` | `APMALL` | 아모레몰 고정 |
| `site_country` | `KR` | 한국 고정 |
| `site_language` | `KO` | 한국어 고정 |
| `site_env` | `PRD` | 운영환경 고정 (DEV/STG/PRD) |

**예측 규칙**:
```yaml
site_name:
  type: static
  value: "APMALL"
  validation: exact_match

site_country:
  type: static
  value: "KR"
  validation: exact_match

site_language:
  type: static
  value: "KO"
  validation: exact_match

site_env:
  type: static
  value: "PRD"
  allowed_values: ["DEV", "STG", "PRD"]
```

---

## 2. URL 패턴 기반 (URL Pattern)

> URL 경로에서 값을 추론. Vision AI는 URL을 분석해서 예측.

### 2.1 content_group (페이지 타입)

| URL 패턴 | content_group | 설명 |
|----------|---------------|------|
| `/display/main` | `MAIN` | 메인 페이지 |
| `/product/{code}` | `PRODUCT_DETAIL` | 상품 상세 |
| `/kr/ko/product/` | `PRODUCT_DETAIL` | 상품 상세 |
| `/search` | `SEARCH_RESULT` | 검색 결과 |
| `/brand/{code}` | `BRAND_MAIN` | 브랜드샵 메인 |
| `/cart` | `CART` | 장바구니 |
| `/order` | `ORDER` | 주문서 |
| `/order/complete` | `ORDER_COMPLETE` | 주문 완료 |
| `/event/{code}` | `EVENT_DETAIL` | 이벤트 상세 |
| `/display/category/` | `PRODUCT_LIST` | 카테고리 목록 |
| `/mypage/` | `MY` | 마이페이지 |
| `/auth/login` | `LOGIN` | 로그인 페이지 |
| `/auth/signup` | `SIGNUP` | 회원가입 |

**예측 규칙**:
```yaml
content_group:
  type: url_pattern
  patterns:
    - pattern: "/display/main"
      value: "MAIN"
    - pattern: "/product/"
      value: "PRODUCT_DETAIL"
    - pattern: "/search"
      value: "SEARCH_RESULT"
    - pattern: "/brand/"
      value: "BRAND_MAIN"
    - pattern: "/cart"
      value: "CART"
    - pattern: "/order/complete"
      value: "ORDER_COMPLETE"
    - pattern: "/order"
      value: "ORDER"
    - pattern: "/event/"
      value: "EVENT_DETAIL"
    - pattern: "/display/category/"
      value: "PRODUCT_LIST"
    - pattern: "/mypage/"
      value: "MY"
    - pattern: "/auth/login"
      value: "LOGIN"
    - pattern: "/auth/signup"
      value: "SIGNUP"
  fallback: "OTHER"
```

### 2.2 channel (접속 채널)

| User-Agent 포함 | channel |
|-----------------|---------|
| `Mobile`, `Android`, `iPhone` | `MOBILE` |
| 그 외 | `PC` |

**예측 규칙**:
```yaml
channel:
  type: user_agent_pattern
  patterns:
    - pattern: "Mobile|Android|iPhone|iPad"
      value: "MOBILE"
  fallback: "PC"
```

### 2.3 page_location_1 ~ 5 (브레드크럼)

> URL 경로 또는 페이지 내 breadcrumb에서 추출

| 예시 URL | page_location_1 | page_location_2 | page_location_3 |
|----------|-----------------|-----------------|-----------------|
| `/display/category/10000001` | 스킨케어 | - | - |
| `/brand/hera/skincare` | 헤라 | 스킨케어 | - |
| `/search?keyword=토너` | 검색 | 토너 | - |

**예측 규칙**:
```yaml
page_location_1:
  type: breadcrumb
  source:
    - dom_selector: ".breadcrumb li:nth-child(1)"
    - url_path_segment: 1
  fallback: null

page_location_2:
  type: breadcrumb
  source:
    - dom_selector: ".breadcrumb li:nth-child(2)"
    - url_path_segment: 2
  fallback: null
```

### 2.4 조건부 URL 파라미터

| 파라미터 | 조건 (content_group) | 추출 방법 |
|----------|---------------------|-----------|
| `brandshop_code` | BRAND_MAIN | URL에서 `/brand/{code}` 추출 |
| `brandshop_name` | BRAND_MAIN | 페이지 title 또는 DOM에서 추출 |
| `page_store_code` | STORE 관련 | URL에서 `/store/{code}` 추출 |
| `page_store_name` | STORE 관련 | 페이지 DOM에서 추출 |
| `search_brand_code` | SEARCH_RESULT | URL query `brand=` 추출 |
| `search_brand` | SEARCH_RESULT | URL query 또는 필터 UI에서 추출 |

---

## 3. 브라우저 자동 (Browser Auto)

> 브라우저가 자동으로 수집. Vision AI는 예측할 필요 없음.

| 파라미터 | 소스 | Vision AI 역할 |
|----------|------|----------------|
| `user_agent` | `navigator.userAgent` | 확인 불필요 |
| `page_referrer` | `document.referrer` | 확인 불필요 |

**예측 규칙**:
```yaml
user_agent:
  type: browser_auto
  source: "navigator.userAgent"
  prediction: "skip"

page_referrer:
  type: browser_auto
  source: "document.referrer"
  prediction: "skip"
  note: "직접 접속 시 빈 값"
```

---

## 4. 로그인 상태 기반 (Login Dependent)

> 로그인 여부에 따라 값이 달라짐. Vision AI는 로그인 UI 상태를 감지.

### 4.1 로그인 감지 방법 (Vision AI용)

**로그인 상태 판단 기준**:
1. 헤더에 "로그인" 버튼 → 비로그인
2. 헤더에 "마이페이지" 또는 사용자 이름 → 로그인
3. "로그아웃" 링크 존재 → 로그인

### 4.2 로그인 여부 파라미터

| 파라미터 | 비로그인 | 로그인 |
|----------|----------|--------|
| `login_is_login` | `N` | `Y` |

### 4.3 로그인 시에만 값이 있는 파라미터 (Event Parameters)

| 파라미터 | 비로그인 | 로그인 | 설명 |
|----------|----------|--------|------|
| `login_id_gcid` | (없음) | SHA512 해시 (128자) | 회원 ID 해시 |
| `login_id_cid` | (없음) | SHA512 해시 (128자) | 통합회원번호 해시 |
| `login_id_gcid_1` | (없음) | 해시 전반부 (64자) | 분할 1 |
| `login_id_gcid_2` | (없음) | 해시 후반부 (64자) | 분할 2 |
| `login_id_cid_1` | (없음) | 해시 전반부 (64자) | 분할 1 |
| `login_id_cid_2` | (없음) | 해시 후반부 (64자) | 분할 2 |

### 4.4 User Properties (로그인 시에만)

| 파라미터 | 비로그인 | 로그인 예시 | 설명 |
|----------|----------|-------------|------|
| `user_id` | (없음) | 해시값 | 사용자 식별자 |
| `login_is_sso` | (없음) | `Y` / `N` | SSO 로그인 여부 |
| `login_gender` | (없음) | `M` / `F` | 성별 |
| `login_birth` | (없음) | `1988` | 생년 (YYYY) |
| `login_age` | (없음) | `30` | 연령대 |
| `login_level` | (없음) | `A 등급` / `WELCOME` | 회원등급 |
| `login_beauty_level` | (없음) | `FAMILY` / `PLATINUM` | 뷰티포인트 등급 |
| `login_is_member` | (없음) | `Y` / `N` | 임직원 여부 |
| `login_method` | (없음) | `NORMAL` / `KAKAO` / `AUTO` | 로그인 방법 |
| `login_is_subscription` | (없음) | `Y` / `N` | 정기배송 구독 여부 |

**예측 규칙**:
```yaml
login_is_login:
  type: login_dependent
  logged_out: "N"
  logged_in: "Y"

login_id_gcid:
  type: login_dependent
  logged_out: null
  logged_in:
    format: "sha512_hash"
    length: 128
    example: "54210bb86ed12c44f204d7cce890a96181514bb5..."

login_gender:
  type: login_dependent
  scope: user_property
  logged_out: null
  logged_in:
    allowed_values: ["M", "F"]
```

---

## 5. 페이지 데이터 기반 (Page Data)

> 페이지 종류에 따라 해당 데이터가 있는 경우에만 값이 있음.
> Vision AI는 화면에서 해당 정보를 추출.

### 5.1 PRODUCT_DETAIL 페이지 전용

| 파라미터 | 추출 위치 | Vision AI 추출 방법 |
|----------|-----------|---------------------|
| `product_id` | 상품 코드 | URL 또는 상품 코드 영역 |
| `product_name` | 상품명 | 상품명 제목 영역 |
| `product_category` | 카테고리 | breadcrumb 또는 카테고리 표시 |
| `product_brandname` | 브랜드명 | 브랜드 로고/이름 영역 |
| `product_brandcode` | 브랜드 코드 | (화면에서 추출 어려움) |
| `product_is_stock` | 재고 여부 | "품절" 표시 여부 → N/Y |

**예측 규칙**:
```yaml
product_id:
  type: page_data
  condition: "content_group == PRODUCT_DETAIL"
  extraction:
    - url_pattern: "/product/{product_id}"
    - dom_selector: "[data-product-id]"
  other_pages: null

product_name:
  type: page_data
  condition: "content_group == PRODUCT_DETAIL"
  extraction:
    - dom_selector: ".product-title, h1.product-name"
  other_pages: null

product_is_stock:
  type: page_data
  condition: "content_group == PRODUCT_DETAIL"
  logic:
    - if: "품절 표시 있음"
      value: "N"
    - else:
      value: "Y"
```

### 5.2 EVENT_DETAIL 페이지 전용

| 파라미터 | 추출 위치 | Vision AI 추출 방법 |
|----------|-----------|---------------------|
| `view_event_code` | 이벤트 코드 | URL에서 `/event/{code}` 추출 |
| `view_event_name` | 이벤트명 | 페이지 제목 또는 이벤트 타이틀 |

### 5.3 SEARCH_RESULT 페이지 전용

| 파라미터 | 추출 위치 | Vision AI 추출 방법 |
|----------|-----------|---------------------|
| `search_brand_code` | 브랜드 필터 | URL query 또는 필터 UI |
| `search_brand` | 브랜드명 | 필터 UI에서 선택된 브랜드 |

---

## 6. 내부 로직 (Internal Logic)

> 서버 또는 GTM 내부 로직으로 결정됨. Vision AI가 예측하기 어려움.

| 파라미터 | 결정 로직 | 예측 방법 |
|----------|-----------|-----------|
| `traffic_type` | IP 기반 내부/외부 판별 | 일반적으로 `external` 예측 |

**예측 규칙**:
```yaml
traffic_type:
  type: internal_logic
  logic: "IP 기반 내부망 여부"
  default_prediction: "external"
  note: "일반 사용자는 대부분 external"
```

---

## Vision AI 요약 가이드

### 화면에서 확인해야 할 것

1. **URL 확인** → content_group, product_id, event_code 등 추론
2. **로그인 상태 확인** → 헤더의 로그인/마이페이지 버튼
3. **상품 정보** (상품 페이지) → product_name, product_brandname, 재고 여부
4. **브레드크럼** → page_location_1~5
5. **검색어/필터** (검색 페이지) → search_brand

### 예측하지 않아도 되는 것

1. `user_agent`, `page_referrer` → 브라우저 자동
2. `login_id_gcid`, `login_id_cid` 등 해시값 → 값 형식만 확인
3. `traffic_type` → 대부분 external

---

*최종 수정: 2024-12-19*
