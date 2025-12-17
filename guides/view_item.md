# view_item 이벤트 가이드

## 이벤트 정의
**상품 상세 페이지가 로드되었을 때** 발생하는 이벤트입니다.
특정 제품에 대한 상세 정보를 조회하는 행동을 추적합니다.
**클릭이 아닌 페이지 로드 시 자동 발생**합니다.

---

## 1. 시각적 판단 기준 (Primary - 화면에서 찾기)

### 상품 상세 페이지(PDP)의 시각적 특징

#### 1) 메인 제품 이미지 영역
- **위치**: 페이지 좌측 또는 상단
- **형태**: 대형 제품 이미지
- **특징**:
  - 단일 제품 사진이 크게 표시
  - 이미지 갤러리/슬라이드 (썸네일 목록)
  - 줌 기능이 있는 경우 있음
  - 다양한 각도의 제품 사진

#### 2) 제품 정보 영역
- **위치**: 이미지 옆 또는 아래
- **필수 구성 요소**:
  - 제품명 (크게 표시)
  - 가격 (정가/할인가)
  - 브랜드명
- **선택 구성 요소**:
  - 할인율 뱃지
  - 별점/리뷰 수
  - 재고 상태

#### 3) 구매 옵션 영역
- 옵션 선택 UI (사이즈, 색상, 용량)
- 수량 선택
- **CTA 버튼**: "장바구니 담기", "바로 구매"

#### 4) 상세 정보 탭
- 상품 상세 설명
- 성분 정보
- 사용법
- 리뷰/Q&A

### 상품 상세 페이지가 아닌 화면 (시각적 구분)

| 화면 | 특징 | 해당 이벤트 |
|-----|------|-----------|
| 상품 목록 (그리드) | 여러 상품 카드가 나열 | `view_item_list` |
| 검색 결과 | 검색어 + 상품 목록 | `view_item_list` |
| 장바구니 | 담긴 상품 목록 + 결제 버튼 | 별도 이벤트 |
| 결제 페이지 | 주문서 양식 | `begin_checkout` |
| 메인 페이지 | 히어로 배너 + 섹션들 | 별도 이벤트 |

---

## 2. GTM 트리거 조건 (검증용)

### 현재 구현된 조건
```
트리거 타입: CUSTOM_EVENT (dataLayer push)
Custom Event: [사이트별 상이 - site-config.json 참조]
```

### 사이트별 dataLayer event명 예시
| 사이트 | dataLayer event | GA4 이벤트 | 설정 파일 |
|-------|-----------------|-----------|----------|
| Amoremall | `product` | `view_item` | `sites/amoremall-kr/site-config.json` |
| Innisfree Shopify | `product` | `view_item` | `sites/innisfree-shopify/site-config.json` |

### 페이지 URL 패턴
```
/product/detail/* 또는 유사한 URL 구조
```

### dataLayer 구조

**참고**: 실제 `event` 값은 사이트마다 다릅니다. `sites/{site}/site-config.json`의 `eventMapping.view_item` 값을 확인하세요.

```javascript
// GA4 이벤트: view_item
// dataLayer event명은 사이트별 설정 참조
dataLayer.push({
  event: "[eventMapping.view_item]",  // 예: "product"
  // ... 상품 정보
});
```

---

## 3. 분석 판단 프로세스

### Step 1: 페이지 타입 식별
화면의 구조를 분석합니다:
- 단일 상품 대형 이미지 + 상세 정보 = **상품 상세 페이지**
- 여러 상품 카드 그리드 = **상품 목록 페이지**

### Step 2: PDP 필수 요소 확인
- 대형 제품 이미지
- 제품명 + 가격
- 장바구니/구매 버튼

### Step 3: 트래킹 확인
- URL이 상품 상세 패턴인지
- dataLayer에 `product` 이벤트 push 여부

### Step 4: 결과 분류

#### Case A: PDP + 트래킹 있음
→ **Should Fire**: 페이지 로드 시 이벤트 발생해야 함

#### Case B: PDP + 트래킹 없음
→ **구현 누락**: dataLayer push 코드 추가 필요

#### Case C: 목록 페이지
→ **Should NOT Fire**: `view_item_list` 이벤트 대상

---

## 4. 구현 검증 포인트

### 필수 확인 사항
1. **모든 상품 상세 페이지에서 발생**
   - 일반 상품
   - 할인 상품
   - 품절 상품

2. **필수 파라미터 수집**
   - item_id: 상품 코드
   - item_name: 상품명
   - price: 가격
   - currency: 통화

3. **발생 시점**
   - 페이지 로드 완료 시 (DOM Ready 또는 dataLayer push)

### 흔한 구현 오류
| 문제 | 증상 | 해결 방법 |
|-----|------|----------|
| 일부 상품 누락 | 특정 카테고리 상품만 트래킹 | 전체 PDP에 적용 |
| 가격 오류 | 할인가가 아닌 정가 수집 | 실제 판매가 수집 |
| 중복 발생 | 페이지 새로고침 시 중복 | 중복 방지 로직 |
| **dataLayer 중복 push** | 동일 페이지에서 view_item 2회 발생 | dataLayer push 호출 지점 확인 |

---

## 5. 수집 파라미터

> **중요: 아래 파라미터는 **대표적인 예시**입니다.**
>
> 실제 구현은 사이트별 GTM 설정에 따라 다릅니다.
> **시나리오 설계 시 반드시 해당 사이트의 GTM을 파싱하여 실제 파라미터를 확인**하세요.
>
> ⚠️ **필수 확인 사항**: 없는 파라미터나 추가해야 하는 파라미터는 항상 **GTM parser를 통해 확인**이 필요합니다.
> 참조: [GTM 파싱 가이드](../docs/gtm-parsing-guide.md) → "이벤트별 파라미터 추출" 섹션

### GTM Variable 참조 (Amoremall 기준)

| 파라미터 | GTM Variable | 설명 |
|---------|--------------|------|
| event_category | (하드코딩) | "ecommerce" |
| event_action | (하드코딩) | "view item" |
| items | `{{JS - View Item DataLayer}}` | 상품 배열 (**dataLayer variable에서 확인**) |
| currency | `{{JS - Currency}}` | 통화 코드 |
| product_id | `{{JS - Product Id with View Item}}` | 상품 코드 |
| product_name | `{{JS - Product Name with View Item}}` | 상품명 |
| product_category | `{{JS - Product Category with View Item}}` | 상품 카테고리 |
| product_brandname | `{{JS - Product Brandname with View Item}}` | 브랜드명 |
| product_brandcode | `{{JS - Product Brandcode with View Item}}` | 브랜드 코드 |
| product_pagecode | `{{JS - Product Pagecode with View Item}}` | 페이지 코드 |
| product_is_stock | `{{JS - Product Is Stock with View Item}}` | 재고 여부 |
| product_is_pacific | `{{JS - Product Is Pacific with View Item}}` | 퍼시픽 여부 |
| product_sn | `{{JS - Product Sn with View Item}}` | 상품 SN |

> 💡 **items 확인 방법**: GTM 변수 `{{JS - View Item DataLayer}}`의 정의를 확인하면 items 배열의 구조를 파악할 수 있습니다.
> dataLayer에서 직접 확인: `dataLayer.filter(e => e.ecommerce?.items)`

### 이벤트 레벨 파라미터

| 파라미터 | 설명 | 예시 |
|---------|------|------|
| event_category | 이벤트 카테고리 | "ecommerce" |
| event_action | 이벤트 액션 | "view item" |
| event_label | 이벤트 라벨 | "수분 크림" |
| currency | 통화 코드 | "KRW" |
| product_id | 상품 코드 | "SKU_12345" |
| product_name | 상품명 | "수분 크림" |
| product_category | 상품 카테고리 | "스킨케어/크림" |
| product_brandname | 브랜드명 | "설화수" |
| product_brandcode | 브랜드 코드 | "SWS" |
| product_is_stock | 재고 여부 | "Y" / "N" |

### items 배열 파라미터

| 파라미터 | 설명 | 예시 |
|---------|------|------|
| items[].item_id | 상품 고유 ID (SKU) | "SKU_12345" |
| items[].item_name | 상품명 | "수분 크림" |
| items[].item_brand | 브랜드명 | "설화수" |
| items[].item_category | 대분류 | "스킨케어" |
| items[].item_category2 | 중분류 | "크림" |
| items[].item_category3 | 소분류 | "수분크림" |
| items[].price | 판매가 | 25000 |
| items[].original_price | 정가 | 30000 |
| items[].discount | 할인금액 | 5000 |
| items[].apg_brand_code | APG 브랜드 코드 (사이트별) | "BR001" |
| items[].internal_brand_code | 내부 브랜드 코드 (사이트별) | "SWS" |

---

## 6. 관련 이벤트

| 이벤트 | 발생 시점 | 구분 |
|-------|----------|------|
| `select_item` | 목록에서 상품 클릭 | 클릭 이벤트 |
| `view_item` | 상세 페이지 로드 | 페이지 로드 이벤트 |
| `add_to_cart` | 장바구니 담기 클릭 | 클릭 이벤트 |

---

## 7. 시나리오 예시

### Should Fire (페이지 로드 시)
```
- 상품 목록에서 상품 클릭 → 상세 페이지 도착
- URL 직접 입력으로 상세 페이지 진입
- 뒤로가기로 상세 페이지 복귀
- 퀵뷰 모달이 열릴 때 (구현에 따라)
```

### Should NOT Fire
```
- 메인 페이지 로드
- 카테고리 목록 페이지 로드 → view_item_list
- 검색 결과 페이지 로드 → view_item_list
- 장바구니 페이지 로드
```

### 구현 필요 (Gap)
```
- 상품 상세 페이지인데 dataLayer push 없음
- 일부 상품 유형(세트, 기획)에서 이벤트 미발생
- 모바일 웹에서만 트래킹 누락
```

### 상세 시나리오 매트릭스

| 시나리오 | 진행방법 | 발생해야 하는 상황 | 발생하면 안 되는 상황 | 주요 검수 포인트 |
|---------|---------|------------------|---------------------|----------------|
| **상품 상세 페이지 로드 (클릭 이동)** | 클릭해서 이동 | 사용자가 상품 목록에서 특정 상품을 선택하여 상세 페이지로 넘어갔을 때 | 상품 상세 페이지가 아직 로드되지 않았거나 로딩 중일 때 이벤트가 발생하는 경우 | 페이지 로드 완료 후 이벤트 발생 확인, 로딩 상태의 정확한 추적 |
| **상품 상세 페이지 로드 (직접 이동)** | 직접 이동 | 사용자가 URL 직접 입력 또는 링크를 통해 상세 페이지로 넘어갔을 때 | 상품 상세 페이지가 아직 로드되지 않았거나 로딩 중일 때 이벤트가 발생하는 경우 | 페이지 로드 완료 후 이벤트 발생 확인, 로딩 상태의 정확한 추적 |
| **dataLayer 중복 push로 인한 중복 발생** | 상세 페이지 진입 | view_item 이벤트 1회만 발생 | dataLayer에 product 이벤트가 2회 이상 push되어 중복 발생 | **dataLayer에서 product 이벤트 push 횟수 확인**, 중복 push 원인 분석 |

### 시나리오별 상세 검증 항목

#### 1) 상품 상세 페이지 로드 (클릭 이동)
```
진행 방법:
1. 검색 결과 또는 카테고리 페이지 접근
2. 상품 카드 클릭하여 상세 페이지로 이동
3. 상품 상세 페이지 로드 완료 확인
4. dataLayer에서 view_item 이벤트 확인

검증 항목:
□ 상품 목록에서 특정 상품 선택하여 상세 페이지로 넘어갔을 때 view_item 발생
□ 상품 상세 페이지가 아직 로드되지 않았을 때 미발생
□ 로딩 중일 때 이벤트 미발생
□ 페이지 로드 완료 후 이벤트 발생 확인
□ 로딩 상태의 정확한 추적
□ item_id, item_name, price 등 상품 정보가 정확히 전달되는지 확인
□ currency가 올바르게 설정되는지 확인
```

#### 2) 상품 상세 페이지 로드 (직접 이동)
```
진행 방법:
1. 브라우저 주소창에 상품 상세 페이지 URL 직접 입력
2. 또는 외부 링크(이메일, SNS 등)를 통해 상세 페이지 접근
3. 상품 상세 페이지 로드 완료 확인
4. dataLayer에서 view_item 이벤트 확인

검증 항목:
□ URL 직접 입력으로 상세 페이지 진입 시 view_item 발생
□ 외부 링크를 통한 접근 시에도 정상 발생
□ 상품 상세 페이지가 아직 로드되지 않았을 때 미발생
□ 로딩 중일 때 이벤트 미발생
□ 페이지 로드 완료 후 이벤트 발생 확인
□ 클릭 이동과 동일한 데이터 구조로 발생하는지 확인
□ item_id, item_name, price 등 상품 정보가 정확히 전달되는지 확인
```

#### 3) dataLayer 중복 push로 인한 중복 발생 (주의 케이스)
```
발생 상황:
- 상품 상세 페이지 진입 시 view_item(product) 이벤트가 2회 이상 발생
- 동일한 상품인데 이벤트가 중복으로 수집됨

원인 분석 방법:
1. 개발자 도구 Console에서 dataLayer 확인
2. dataLayer.filter(e => e.event === 'product') 실행
3. product 이벤트가 몇 번 push되었는지 확인

일반적인 중복 push 원인:
□ 프론트엔드 코드에서 dataLayer.push가 2회 호출됨
□ 컴포넌트 렌더링 시 중복 실행 (React 등 SPA에서 발생 가능)
□ 페이지 로드 + SPA 라우팅 이벤트 중복
□ GTM 태그 설정에서 중복 트리거 적용
□ 페이지 로드 시점과 데이터 로드 시점에 각각 push

검증 항목:
□ dataLayer에서 product 이벤트 push 횟수 확인 (1회만 되어야 함)
□ 중복 발생 시 두 이벤트의 데이터가 동일한지 비교
□ 발생 시점(timestamp) 확인하여 어느 지점에서 중복되는지 분석
□ 개발팀에 중복 push 지점 수정 요청

디버깅 코드 (Console에서 실행):
dataLayer.filter(e => e.event === 'product').forEach((e, i) => {
  console.log('product push #' + (i+1), e);
});
```

---

## 8. 시나리오 작성 지침

### 트리거 타입: CUSTOM_EVENT (dataLayer.push)

이 이벤트는 **dataLayer.push로 발생**합니다.
페이지 로드 시 프론트엔드에서 dataLayer.push를 호출하여 이벤트를 발생시킵니다.

### 시나리오에 포함할 내용
```
O 포함해야 함:
- 예상 dataLayer 구조 (dataLayer.push 코드)
- event 이름 ("product" → GA4에서 view_item으로 매핑 확인 필요)
- ecommerce 객체 구조
- items 배열 내 파라미터

X 포함하지 않음:
- GTM LINK_CLICK 트리거 관련 내용
- DOM 속성에서 데이터 추출하는 방식
```

### 예상 dataLayer 구조 (시나리오에 포함)
```javascript
dataLayer.push({
  event: "product",
  ecommerce: {
    currency: "KRW",
    value: 25000,
    items: [{
      item_id: "SKU_12345",
      item_name: "수분 크림",
      item_brand: "설화수",
      item_category: "스킨케어",
      price: 25000
    }]
  }
});
```

### 검증 포인트
```
1. dataLayer 확인:
   - 개발자도구 Console에서 dataLayer 배열 확인
   - product 이벤트 객체가 push되는지 확인

2. 발생 시점 확인:
   - 페이지 로드 완료 시 발생
   - 상품 상세 페이지에서만 발생
```

---

## 9. 퍼널 데이터 일관성 검증

### 이 이벤트의 퍼널 위치
```
select_item → view_item → add_to_cart → view_cart → begin_checkout → purchase
                  ↑
              현재 위치
```

### 일관성 검증 항목

view_item은 **상품 상세 정보의 기준점**으로, 가장 정확한 상품 데이터를 수집합니다.

| 파라미터 | 일치 대상 이벤트 | 검증 기준 |
|---------|----------------|----------|
| `item_id` | select_item, add_to_cart, view_cart, begin_checkout, purchase | 동일 상품은 항상 동일 ID |
| `item_name` | 모든 퍼널 이벤트 | 정확히 일치 (풀네임 기준) |
| `item_brand` | 모든 퍼널 이벤트 | 정확히 일치 |
| `item_category` | 모든 퍼널 이벤트 | 정확히 일치 |
| `price` | add_to_cart, view_cart, begin_checkout, purchase | 기본 옵션 기준 가격 |

### 불일치 위험 케이스

| 상황 | 위험 | 검증 방법 |
|-----|------|----------|
| select_item의 축약 데이터 | select_item과 item_name 불일치 | 목록 → 상세 이동 후 비교 |
| 옵션별 가격 차이 | 기본 옵션 vs 선택 옵션 가격 | 옵션 선택 전후 확인 |
| 할인 적용 시점 | 정가 vs 할인가 | price 값 기준 확인 |
| 세트 상품 | 단품 vs 세트 item_id | 세트 상품 상세 확인 |

### 이전/이후 이벤트와 비교

| 이벤트 | 비교 항목 | 예상 결과 |
|-------|----------|----------|
| select_item → view_item | item_id, item_name | 일치 |
| view_item → add_to_cart | item_id, item_name, price | 일치 (옵션 제외) |
| view_item → purchase | item_id | 일치 |

### 검증 체크리스트
```
□ select_item의 item_id와 view_item의 item_id 일치
□ view_item의 item_name이 이후 이벤트와 일치
□ view_item의 price가 add_to_cart의 price와 일치
□ view_item의 item_brand, item_category가 모든 이벤트에서 일치
```

---

## 10. 타이밍 이슈 검증

### 발생 시점 관련 위험

이 이벤트는 **페이지 로드 시** 발생하므로 타이밍 관련 이슈가 있을 수 있습니다.

| 상황 | 위험 | 검증 방법 |
|-----|------|----------|
| API 응답 전 발생 | 상품 데이터 누락 | 데이터 로드 완료 후 발생 확인 |
| SPA 라우팅 | 히스토리 변경 시 미발생 | SPA 네비게이션 테스트 |
| 새로고침 중복 | 동일 상품 중복 수집 | 새로고침 테스트 |
| 캐시된 페이지 | 오래된 가격 정보 | 캐시 무효화 후 확인 |
| **dataLayer 중복 push** | 동일 상품 view_item 2회 발생 | `dataLayer.filter(e => e.event === 'product')` 로 push 횟수 확인 |

### 타이밍 검증 체크리스트
```
□ 페이지 로드 완료 후 이벤트 발생 (데이터 완전성)
□ SPA 라우트 변경 시 이벤트 발생
□ 뒤로가기로 복귀 시 이벤트 발생
□ 새로고침 시 중복 발생 처리 확인
□ dataLayer에서 product 이벤트 push 횟수 확인 (1회만 되어야 함)
```

---

## 11. 환경별 검증

> **공통 가이드 참조**: [docs/environment-validation-guide.md](../docs/environment-validation-guide.md)
>
> PC/Mobile, 로그인/비로그인 환경별 검증은 공통 가이드를 참조하세요.

### view_item 특화 환경 검증

| 환경 | 특이사항 |
|-----|---------|
| Mobile 웹뷰 | 앱에서 상품 상세 웹뷰 열기 시 발생 확인 |
| 로그인 상태 | 최근 본 상품 기능 연동 시 user_id 포함 확인 |
| SPA | 상품 간 이동 시 History Change 트리거 동작 확인 |
