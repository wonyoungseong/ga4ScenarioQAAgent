# 이벤트 검증 시나리오 가이드

## 개요

GA4 이벤트 QA는 단순히 "발생/미발생"만 확인하는 것이 아닙니다.
이 문서는 **비주얼 검수 시 고려해야 할 모든 이벤트 시나리오**를 정의합니다.

---

## 이벤트 검증 결과 분류 (6가지)

### 1. 정상 발생 (Normal Fire) ✅
- 예상 시점에 이벤트 발생
- 올바른 파라미터 수집
- 중복 없이 1회만 발생

### 2. 미발생 (No Fire) ❌
- 발생해야 하는 상황에서 이벤트가 발생하지 않음
- **원인**: 트래킹 코드 누락, DOM 속성 누락, 조건 불일치

### 3. 오발생 (Wrong Fire) ⚠️
- 발생하면 안 되는 상황에서 이벤트 발생
- **원인**: 트리거 조건 오류, 이벤트 버블링, 잘못된 CSS Selector

### 4. 중복 발생 (Duplicate Fire) 🔄
- 1회 발생해야 하는데 2회 이상 발생
- **원인**: 이벤트 버블링, 중복 트리거, 새로고침 미처리

### 5. 잘못된 데이터 수집 (Wrong Data) 📊
- 이벤트는 발생하지만 파라미터 값이 잘못됨
- **원인**: DOM 속성 파싱 오류, 잘못된 변수 매핑, 데이터 누락

### 6. 정상 미발생 (Correct No Fire) ✅
- 발생하면 안 되는 상황에서 이벤트가 발생하지 않음
- 정상 동작

---

## 비주얼 vs DOM 검증의 차이

### 핵심 원칙

```
비주얼만 보고 이벤트 발생을 판단하면 안 됨
비주얼 확인 → DOM 속성 확인 → 이벤트 발생 여부 판단
```

### 예시: 체크박스 클릭

**시나리오**: 약관 동의 체크박스 영역

```
┌─────────────────────────────────────────┐
│ ☐ 개인정보 수집 및 이용에 동의합니다    │
│   ↑체크박스    ↑텍스트 영역             │
└─────────────────────────────────────────┘
```

**비주얼 검수 시 확인해야 할 질문:**

| 질문 | 확인 방법 |
|-----|----------|
| 체크박스 클릭 시 이벤트 발생? | DOM 속성 확인 필요 |
| 텍스트 영역 클릭 시 이벤트 발생? | DOM 속성 확인 필요 |
| 어떤 영역에 `ap-click-area` 속성이 있는가? | 개발자도구 Elements 탭 |

**DOM 구조 예시:**

```html
<!-- Case A: 전체 영역에 속성 -->
<label ap-click-area="agree" ap-click-data='{"type":"privacy"}'>
  <input type="checkbox" />
  개인정보 수집 및 이용에 동의합니다
</label>
→ 체크박스, 텍스트 모두 클릭 시 이벤트 발생

<!-- Case B: 체크박스에만 속성 -->
<label>
  <input type="checkbox" ap-click-area="agree" ap-click-data='{"type":"privacy"}'/>
  개인정보 수집 및 이용에 동의합니다
</label>
→ 체크박스 클릭만 이벤트 발생

<!-- Case C: 속성 없음 -->
<label>
  <input type="checkbox" />
  개인정보 수집 및 이용에 동의합니다
</label>
→ 이벤트 미발생 (정상 미발생 또는 구현 누락)
```

---

## 클릭 이벤트 검증 시나리오 상세

### 시나리오 매트릭스

| 상황 | 비주얼 | DOM 속성 | 예상 결과 | 실제 결과 | 판정 |
|-----|-------|---------|----------|----------|------|
| A | 클릭 가능해 보임 | 속성 있음 | Fire | Fire | ✅ 정상 |
| B | 클릭 가능해 보임 | 속성 있음 | Fire | No Fire | ❌ 미발생 버그 |
| C | 클릭 가능해 보임 | 속성 없음 | No Fire | No Fire | ✅ 정상 (또는 구현 누락) |
| D | 클릭 가능해 보임 | 속성 없음 | No Fire | Fire | ⚠️ 오발생 |
| E | 클릭 불가능해 보임 | 속성 있음 | - | Fire | ⚠️ 검토 필요 |
| F | 클릭 불가능해 보임 | 속성 없음 | No Fire | No Fire | ✅ 정상 |

### 이벤트 버블링 시나리오

**문제 상황**: 중첩된 요소에서 클릭 이벤트 전파

```html
<div ap-click-area="banner" ap-click-data='{"promotion":"sale"}'>
  <a href="/event" ap-click-area="link" ap-click-data='{"link":"event"}'>
    <button>자세히 보기</button>
  </a>
</div>
```

**버튼 클릭 시 발생 가능한 시나리오:**

| 시나리오 | 발생 이벤트 | 원인 | 판정 |
|---------|-----------|------|------|
| 1 | `link` 1회 | 정상 (bubbling stop) | ✅ |
| 2 | `link` + `banner` | 이벤트 버블링 | 🔄 중복 |
| 3 | `banner` 1회 | `link` 트리거 누락 | ⚠️ 오발생 |
| 4 | 없음 | 트리거 조건 오류 | ❌ 미발생 |

**검증 포인트:**
```
1. 버튼 클릭 시 몇 개의 이벤트가 발생하는가?
2. 발생한 이벤트의 파라미터가 어떤 요소의 것인가?
3. 가장 안쪽 요소의 이벤트만 발생하는가?
```

---

## 타이밍 이슈 시나리오

### 타이밍 문제 유형

#### 1. 이벤트 선발생 (Premature Fire)
데이터 로드 전에 이벤트가 먼저 발생하는 경우

```
Timeline:
─────────────────────────────────────────────────────────>
     │                    │                    │
  페이지 로드        이벤트 발생           API 응답 도착
  (DOM Ready)     (items: [])         (상품 데이터)
                      ↑
                  문제 발생!
```

**증상:**
- items 배열이 비어있음
- price, item_name 등이 undefined
- value가 0 또는 NaN

**발생 상황:**
- SPA에서 라우트 변경 후 API 호출 전 이벤트 발생
- 상품 상세 페이지에서 상품 정보 API 응답 전 view_item 발생
- 무한 스크롤에서 새 상품 로드 전 이벤트 발생

#### 2. 이벤트 지연발생 (Delayed Fire)
데이터는 있지만 이벤트가 너무 늦게 발생하는 경우

```
Timeline:
─────────────────────────────────────────────────────────>
     │                    │                    │
  페이지 로드        사용자 이탈          이벤트 발생
                   (페이지 떠남)        (발생 안 됨)
```

**증상:**
- 이벤트 자체가 누락
- 빠른 페이지 전환 시 이벤트 손실

#### 3. 데이터 불일치 (Stale Data)
이전 페이지의 데이터가 수집되는 경우

```
Timeline:
─────────────────────────────────────────────────────────>
     │              │                │              │
  상품A 조회    상품B 클릭      이벤트 발생      상품B 렌더링
              (라우트 변경)   (상품A 데이터!)
                                  ↑
                              문제 발생!
```

**증상:**
- 클릭한 상품과 다른 상품 정보 수집
- 이전 페이지의 item_list_name 수집
- 캐시된 가격 정보 수집

#### 4. Race Condition
여러 비동기 작업의 순서가 보장되지 않는 경우

```javascript
// 문제 코드 예시
fetchProductData().then(data => { productData = data; });
dataLayer.push({ event: 'view_item', items: [productData] }); // undefined!
```

### 타이밍 이슈 검증 방법

| 테스트 | 방법 | 확인 사항 |
|-------|-----|----------|
| 빠른 페이지 전환 | 상품 클릭 후 즉시 뒤로가기 | 이벤트 발생 여부, 데이터 정확성 |
| 느린 네트워크 | DevTools에서 Slow 3G 설정 | 이벤트-데이터 동기화 |
| 연속 클릭 | 같은 버튼 빠르게 여러 번 클릭 | 중복 발생, 데이터 일관성 |
| SPA 네비게이션 | 브라우저 뒤로/앞으로 반복 | 올바른 페이지 데이터 수집 |

### 타이밍 이슈 체크리스트

```markdown
### 타이밍 검증

- [ ] 페이지 로드 직후 이벤트의 items가 채워져 있는가?
- [ ] 빠른 페이지 전환 시에도 이벤트가 발생하는가?
- [ ] 수집된 데이터가 현재 페이지의 것인가? (이전 페이지 아님)
- [ ] API 응답 후에 이벤트가 발생하는가?
- [ ] 연속 클릭 시 각 이벤트의 데이터가 정확한가?
```

---

## 파라미터 검증 시나리오

### 파라미터 검증의 중요성

이벤트가 발생해도 **파라미터가 잘못되면 분석에 사용할 수 없습니다**.

```javascript
// 이벤트는 발생했지만...
{
  event: "purchase",
  ecommerce: {
    transaction_id: undefined,  // 🔴 필수값 누락
    value: "25,000원",          // 🔴 문자열 (숫자여야 함)
    items: []                   // 🔴 빈 배열
  }
}
```

### 파라미터 검증 체크리스트

| 검증 항목 | 정상 | 오류 유형 |
|----------|-----|----------|
| item_id | SKU_12345 | null, undefined, 빈 문자열 |
| item_name | 수분 크림 | "undefined", "[object Object]" |
| price | 25000 (숫자) | "25000" (문자열), "25,000" (포맷팅된 문자열) |
| quantity | 1 이상 정수 | 0, 음수, 소수점 |
| index | 0부터 시작 | 1부터 시작, undefined |
| currency | "KRW" | "원", undefined |
| transaction_id | "ORD_123" | undefined, 중복값 |
| value | 총합 금액 | 개별 상품 가격, NaN |

### 파라미터 오류 유형 상세

#### 1. 값 누락 (Missing Values)

```javascript
// 🔴 문제: 필수 파라미터 누락
{
  event: "purchase",
  ecommerce: {
    // transaction_id 누락! - 주문 식별 불가
    value: 50000,
    items: [...]
  }
}
```

**영향:**
- GA4에서 데이터 집계 불가
- 리포트에서 (not set) 표시
- 전환 추적 실패

#### 2. 데이터 타입 오류 (Type Mismatch)

```javascript
// 🔴 문제: 숫자여야 하는데 문자열
{
  items: [{
    price: "25,000",      // 문자열 (숫자여야 함)
    quantity: "2"         // 문자열 (숫자여야 함)
  }]
}

// ✅ 정상
{
  items: [{
    price: 25000,         // 숫자
    quantity: 2           // 숫자
  }]
}
```

**흔한 타입 오류:**
| 파라미터 | 잘못된 값 | 올바른 값 |
|---------|----------|----------|
| price | "25,000원" | 25000 |
| quantity | "2개" | 2 |
| value | "총 50,000원" | 50000 |
| index | "1" | 0 (또는 1, 숫자) |

#### 3. 값 불일치 (Value Mismatch)

화면에 표시된 값과 수집된 값이 다른 경우

```
화면: 수분 크림 - 25,000원 (20% 할인)
     원가: 31,250원

수집된 값:
  price: 31250  ← 🔴 할인가가 아닌 원가 수집
  또는
  price: 25000  ← ✅ 실제 판매가 수집
```

**검증 포인트:**
- [ ] price가 화면의 판매가와 일치하는가?
- [ ] item_name이 화면의 상품명과 일치하는가?
- [ ] quantity가 선택한 수량과 일치하는가?
- [ ] value가 items의 price * quantity 합계와 일치하는가?

#### 4. 배열 오류 (Array Issues)

```javascript
// 🔴 문제: items가 배열이 아님
{
  items: {
    item_id: "SKU123"
  }
}

// 🔴 문제: items가 비어있음
{
  items: []
}

// 🔴 문제: items에 중복 상품
{
  items: [
    { item_id: "SKU123", quantity: 1 },
    { item_id: "SKU123", quantity: 1 }  // 중복!
  ]
}

// ✅ 정상: 같은 상품은 quantity로 합산
{
  items: [
    { item_id: "SKU123", quantity: 2 }
  ]
}
```

#### 5. 인코딩/특수문자 오류

```javascript
// 🔴 문제: HTML 엔티티가 그대로 수집
{
  item_name: "수분 크림 &amp; 에센스"  // &amp; → &
}

// 🔴 문제: 이스케이프 문자
{
  item_name: "수분 크림 \"프리미엄\""  // 따옴표 이스케이프
}

// ✅ 정상
{
  item_name: "수분 크림 & 에센스"
}
```

### 이벤트별 필수/권장 파라미터

#### view_item
| 파라미터 | 필수 | 검증 |
|---------|-----|------|
| currency | 권장 | "KRW" 등 ISO 코드 |
| value | 권장 | 숫자, 0 이상 |
| items[].item_id | **필수** | 비어있지 않은 문자열 |
| items[].item_name | 권장 | 비어있지 않은 문자열 |
| items[].price | 권장 | 숫자, 0 이상 |

#### add_to_cart
| 파라미터 | 필수 | 검증 |
|---------|-----|------|
| currency | 권장 | "KRW" 등 ISO 코드 |
| value | 권장 | items의 price * quantity 합계 |
| items[].item_id | **필수** | 비어있지 않은 문자열 |
| items[].quantity | 권장 | 양의 정수 |
| items[].price | 권장 | 숫자, 0 이상 |

#### purchase
| 파라미터 | 필수 | 검증 |
|---------|-----|------|
| transaction_id | **필수** | 고유한 문자열 |
| currency | 권장 | "KRW" 등 ISO 코드 |
| value | 권장 | 최종 결제 금액 (배송비, 할인 포함) |
| tax | 선택 | 숫자 |
| shipping | 선택 | 숫자 |
| items[] | 권장 | 비어있지 않은 배열 |

### 파라미터 검증 자동화

```javascript
// 파라미터 검증 함수 예시
function validateEcommerceEvent(event) {
  const errors = [];
  const { ecommerce } = event;

  // 필수값 체크
  if (!ecommerce) {
    errors.push('ecommerce 객체 누락');
    return errors;
  }

  // items 배열 체크
  if (!Array.isArray(ecommerce.items)) {
    errors.push('items가 배열이 아님');
  } else if (ecommerce.items.length === 0) {
    errors.push('items 배열이 비어있음');
  } else {
    ecommerce.items.forEach((item, idx) => {
      // item_id 체크
      if (!item.item_id) {
        errors.push(`items[${idx}].item_id 누락`);
      }

      // price 타입 체크
      if (item.price && typeof item.price !== 'number') {
        errors.push(`items[${idx}].price가 숫자가 아님: ${typeof item.price}`);
      }

      // quantity 체크
      if (item.quantity !== undefined) {
        if (typeof item.quantity !== 'number') {
          errors.push(`items[${idx}].quantity가 숫자가 아님`);
        } else if (item.quantity < 1) {
          errors.push(`items[${idx}].quantity가 1 미만: ${item.quantity}`);
        }
      }
    });
  }

  // value 체크
  if (ecommerce.value !== undefined && typeof ecommerce.value !== 'number') {
    errors.push(`value가 숫자가 아님: ${typeof ecommerce.value}`);
  }

  // transaction_id 체크 (purchase 이벤트)
  if (event.event === 'purchase' && !ecommerce.transaction_id) {
    errors.push('purchase 이벤트에 transaction_id 누락');
  }

  return errors;
}
```

---

## 퍼널 데이터 일관성 검증

### 왜 중요한가?

GA4 Ecommerce 이벤트는 **동일 상품에 대해 전체 퍼널에서 일관된 데이터**를 가져야 합니다.
일관성이 깨지면:
- 퍼널 분석 불가 (전환율 계산 오류)
- 상품별 매출 집계 오류
- 어트리뷰션 추적 실패

### Ecommerce 퍼널 구조

```
select_item → view_item → add_to_cart → begin_checkout → purchase
     │            │            │              │              │
     └────────────┴────────────┴──────────────┴──────────────┘
                    동일 item_id, item_name, brand, category
```

### 일관성이 필요한 파라미터

| 파라미터 | 설명 | 일관성 필수 |
|---------|------|-----------|
| item_id | 상품 고유 ID (SKU) | **필수** |
| item_name | 상품명 | **필수** |
| item_brand | 브랜드 코드/명 | **필수** |
| item_category | 대분류 카테고리 | **필수** |
| item_category2 | 중분류 카테고리 | 권장 |
| item_category3 | 소분류 카테고리 | 권장 |
| item_variant | 옵션 (색상, 사이즈) | 선택 후 일관 |
| price | 가격 | **필수** (할인 변동 제외) |

### 퍼널 내 일관성 검증 예시

**시나리오**: 사용자가 "수분 크림"을 검색 → 클릭 → 상세 조회 → 장바구니 → 결제

```javascript
// ✅ 정상: 모든 이벤트에서 동일한 item 정보

// 1. select_item (검색 결과에서 클릭)
{
  event: "select_item",
  items: [{
    item_id: "SKU_12345",
    item_name: "수분 크림",
    item_brand: "SULWHASOO",
    item_category: "스킨케어",
    price: 25000
  }]
}

// 2. view_item (상품 상세 페이지)
{
  event: "view_item",
  items: [{
    item_id: "SKU_12345",      // ✅ 동일
    item_name: "수분 크림",     // ✅ 동일
    item_brand: "SULWHASOO",   // ✅ 동일
    item_category: "스킨케어",  // ✅ 동일
    price: 25000               // ✅ 동일
  }]
}

// 3. add_to_cart
{
  event: "add_to_cart",
  items: [{
    item_id: "SKU_12345",      // ✅ 동일
    item_name: "수분 크림",     // ✅ 동일
    item_brand: "SULWHASOO",   // ✅ 동일
    item_category: "스킨케어",  // ✅ 동일
    price: 25000,              // ✅ 동일
    quantity: 2
  }]
}

// 4. begin_checkout
{
  event: "begin_checkout",
  items: [{
    item_id: "SKU_12345",      // ✅ 동일
    item_name: "수분 크림",     // ✅ 동일
    item_brand: "SULWHASOO",   // ✅ 동일
    item_category: "스킨케어",  // ✅ 동일
    price: 25000,
    quantity: 2
  }]
}

// 5. purchase
{
  event: "purchase",
  transaction_id: "ORD_001",
  items: [{
    item_id: "SKU_12345",      // ✅ 동일
    item_name: "수분 크림",     // ✅ 동일
    item_brand: "SULWHASOO",   // ✅ 동일
    item_category: "스킨케어",  // ✅ 동일
    price: 25000,
    quantity: 2
  }]
}
```

### 🔴 일관성 오류 예시

```javascript
// select_item (검색 페이지)
{
  items: [{
    item_id: "SKU_12345",
    item_name: "수분 크림",
    item_brand: "SULWHASOO",
    item_category: "스킨케어"
  }]
}

// view_item (상품 상세 페이지) - 🔴 불일치!
{
  items: [{
    item_id: "12345",              // 🔴 "SKU_" prefix 누락
    item_name: "설화수 수분 크림",   // 🔴 브랜드명 포함
    item_brand: "설화수",           // 🔴 한글 vs 영문
    item_category: "크림"          // 🔴 대분류 vs 중분류
  }]
}
```

**영향:**
- GA4에서 같은 상품으로 인식 안 됨
- 퍼널 전환율 0%로 표시
- 상품별 매출 분석 불가

---

## 페이지 간 일관성 검증

### 동일 이벤트의 페이지별 일관성

같은 이벤트가 여러 페이지에서 발생할 때, **동일 상품은 동일한 데이터**를 가져야 합니다.

### 이벤트별 발생 가능 페이지

#### select_item 발생 페이지

| 페이지 | 설명 |
|-------|------|
| 검색 결과 페이지 | 검색어로 찾은 상품 클릭 |
| 카테고리 페이지 | 카테고리 목록에서 상품 클릭 |
| 메인 페이지 | 추천/베스트 상품 클릭 |
| 상품 상세 페이지 | "함께 구매하면 좋은 상품" 클릭 |
| 장바구니 페이지 | "추천 상품" 클릭 |

#### add_to_cart 발생 페이지

| 페이지 | 트리거 UI | 설명 |
|-------|----------|------|
| 메인 페이지 | "바로 담기" 버튼 | 추천 상품 퀵 담기 |
| 카테고리 페이지 | "담기" 아이콘 | 목록에서 바로 담기 |
| 검색 결과 페이지 | "담기" 아이콘 | 검색 결과에서 바로 담기 |
| 상품 상세 페이지 | "장바구니 담기" 버튼 | 옵션 선택 후 담기 |
| 장바구니 페이지 | "추천 상품 담기" | 추가 상품 담기 |
| 위시리스트 페이지 | "장바구니로 이동" | 찜한 상품 담기 |
| 퀵뷰 모달 | "담기" 버튼 | 모달에서 담기 |

#### view_item 발생 페이지

| 페이지 | 트리거 | 설명 |
|-------|-------|------|
| 상품 상세 페이지 | 페이지 로드 | 일반적인 PDP 진입 |
| 퀵뷰 모달 | 모달 오픈 | 목록에서 퀵뷰 |
| 앱 딥링크 | 외부 링크 | 앱/이메일에서 진입 |

#### view_item_list 발생 페이지

| 페이지 | 설명 |
|-------|------|
| 카테고리 페이지 | 카테고리별 상품 목록 |
| 검색 결과 페이지 | 검색어 결과 목록 |
| 브랜드 페이지 | 브랜드별 상품 목록 |
| 기획전 페이지 | 프로모션 상품 목록 |
| 메인 페이지 섹션 | "베스트", "신상품" 등 |

---

### add_to_cart 페이지별 일관성 검증

**핵심**: 동일 상품(SKU_12345)을 어느 페이지에서 담든 item 데이터는 동일해야 합니다.

```javascript
// ✅ 정상: 모든 페이지에서 동일한 item 데이터

// 1. 메인 페이지 - "바로 담기" 버튼
{
  event: "add_to_cart",
  ecommerce: {
    items: [{
      item_id: "SKU_12345",
      item_name: "수분 크림",
      item_brand: "SULWHASOO",
      item_category: "스킨케어",
      price: 25000,
      quantity: 1
    }]
  }
}

// 2. 카테고리 페이지 - 목록에서 담기
{
  event: "add_to_cart",
  ecommerce: {
    items: [{
      item_id: "SKU_12345",      // ✅ 동일
      item_name: "수분 크림",     // ✅ 동일
      item_brand: "SULWHASOO",   // ✅ 동일
      item_category: "스킨케어",  // ✅ 동일
      price: 25000,              // ✅ 동일
      quantity: 1
    }]
  }
}

// 3. 상품 상세 페이지 - 옵션 선택 후 담기
{
  event: "add_to_cart",
  ecommerce: {
    items: [{
      item_id: "SKU_12345",      // ✅ 동일
      item_name: "수분 크림",     // ✅ 동일
      item_brand: "SULWHASOO",   // ✅ 동일
      item_category: "스킨케어",  // ✅ 동일
      price: 25000,              // ✅ 동일
      item_variant: "60ml",      // 옵션 추가 가능
      quantity: 2
    }]
  }
}

// 4. 장바구니 페이지 - 추천 상품 담기
{
  event: "add_to_cart",
  ecommerce: {
    items: [{
      item_id: "SKU_12345",      // ✅ 동일
      item_name: "수분 크림",     // ✅ 동일
      item_brand: "SULWHASOO",   // ✅ 동일
      item_category: "스킨케어",  // ✅ 동일
      price: 25000,              // ✅ 동일
      quantity: 1
    }]
  }
}
```

### 🔴 add_to_cart 페이지별 불일치 예시

```javascript
// 메인 페이지 - 바로 담기 (간소화된 데이터)
{
  event: "add_to_cart",
  items: [{
    item_id: "12345",           // 🔴 prefix 누락
    item_name: "수분 크림",
    price: 25000
    // 🔴 brand, category 누락
  }]
}

// 상품 상세 페이지 (상세 데이터)
{
  event: "add_to_cart",
  items: [{
    item_id: "SKU_12345",       // 🔴 형식 다름
    item_name: "설화수 수분 크림 60ml",  // 🔴 형식 다름
    item_brand: "설화수",        // 🔴 한글 vs 영문
    item_category: "크림",       // 🔴 레벨 다름
    price: 25000
  }]
}
```

**원인:**
- 메인/카테고리 페이지: 상품 목록 API 사용 (간소화된 데이터)
- 상품 상세 페이지: 상품 상세 API 사용 (상세 데이터)
- 장바구니 페이지: 장바구니 API 사용 (또 다른 형식)

---

### 페이지별 검증 시나리오

#### select_item 검증

```
동일 상품 "SKU_12345"를 다음에서 클릭:

1. 검색 결과 페이지에서 클릭
   → item_id: "SKU_12345", item_name: "수분 크림", ...

2. 카테고리 페이지에서 클릭
   → item_id: "SKU_12345", item_name: "수분 크림", ...  ← 동일해야 함

3. 메인 페이지 베스트 섹션에서 클릭
   → item_id: "SKU_12345", item_name: "수분 크림", ...  ← 동일해야 함
```

#### add_to_cart 검증

```
동일 상품 "SKU_12345"를 다음에서 담기:

1. 메인 페이지 "바로 담기"
   → item_id: "SKU_12345", item_name: "수분 크림", item_brand: "SULWHASOO"

2. 카테고리 페이지 "담기" 아이콘
   → item_id: "SKU_12345", item_name: "수분 크림", item_brand: "SULWHASOO"  ← 동일

3. 상품 상세 페이지 "장바구니 담기"
   → item_id: "SKU_12345", item_name: "수분 크림", item_brand: "SULWHASOO"  ← 동일

4. 장바구니 추천 상품 "담기"
   → item_id: "SKU_12345", item_name: "수분 크림", item_brand: "SULWHASOO"  ← 동일
```

#### view_item_list 검증

```
동일 카테고리 "스킨케어 > 크림" 상품 목록:

1. 카테고리 페이지
   → item_list_name: "스킨케어 > 크림", items: [...]

2. 검색 결과 "크림" 검색
   → item_list_name: "검색: 크림", items: [...]
   → 동일 상품의 item_id, item_name은 일치해야 함

3. 메인 페이지 "크림 베스트"
   → item_list_name: "크림 베스트", items: [...]
   → 동일 상품의 item_id, item_name은 일치해야 함
```

### 🔴 페이지별 불일치 예시

```javascript
// 검색 결과 페이지 - select_item
{
  items: [{
    item_id: "SKU_12345",
    item_name: "수분 크림",
    item_list_name: "검색결과",
    index: 3
  }]
}

// 카테고리 페이지 - select_item (동일 상품)
{
  items: [{
    item_id: "12345",              // 🔴 SKU prefix 누락
    item_name: "수분크림",          // 🔴 공백 누락
    item_list_name: "스킨케어>크림",
    index: 5
  }]
}
```

**원인:**
- 페이지별로 다른 데이터 소스 사용
- API 응답 구조가 다름
- 프론트엔드 매핑 로직 불일치

---

## 일관성 검증 매트릭스

### 퍼널 이벤트 매트릭스

동일 상품(SKU_12345)에 대해 전체 퍼널 검증:

| 파라미터 | select_item | view_item | add_to_cart | begin_checkout | purchase | 일치 |
|---------|-------------|-----------|-------------|----------------|----------|------|
| item_id | SKU_12345 | SKU_12345 | SKU_12345 | SKU_12345 | SKU_12345 | ✅ |
| item_name | 수분 크림 | 수분 크림 | 수분 크림 | 수분 크림 | 수분 크림 | ✅ |
| item_brand | SULWHASOO | SULWHASOO | SULWHASOO | SULWHASOO | SULWHASOO | ✅ |
| item_category | 스킨케어 | 스킨케어 | 스킨케어 | 스킨케어 | 스킨케어 | ✅ |
| price | 25000 | 25000 | 25000 | 25000 | 25000 | ✅ |

### 페이지별 이벤트 매트릭스

동일 이벤트(select_item)의 페이지별 검증:

| 파라미터 | 검색 페이지 | 카테고리 | 메인 베스트 | 상세 추천 | 일치 |
|---------|-----------|---------|-----------|----------|------|
| item_id | SKU_12345 | SKU_12345 | SKU_12345 | SKU_12345 | ✅ |
| item_name | 수분 크림 | 수분 크림 | 수분 크림 | 수분 크림 | ✅ |
| item_brand | SULWHASOO | SULWHASOO | SULWHASOO | SULWHASOO | ✅ |
| price | 25000 | 25000 | 25000 | 25000 | ✅ |

---

## 일관성 검증 체크리스트

### 퍼널 일관성 체크

```markdown
## 퍼널 데이터 일관성 검증

### 테스트 상품: [상품명] (SKU: [item_id])

### 1. 퍼널 이벤트별 데이터 수집

| 이벤트 | item_id | item_name | item_brand | item_category | price |
|-------|---------|-----------|------------|---------------|-------|
| select_item | | | | | |
| view_item | | | | | |
| add_to_cart | | | | | |
| begin_checkout | | | | | |
| purchase | | | | | |

### 2. 일관성 확인
- [ ] item_id가 전체 퍼널에서 동일한가?
- [ ] item_name이 전체 퍼널에서 동일한가?
- [ ] item_brand가 전체 퍼널에서 동일한가?
- [ ] item_category가 전체 퍼널에서 동일한가?
- [ ] price가 전체 퍼널에서 동일한가? (할인 변동 제외)
```

### 페이지 일관성 체크

```markdown
## 페이지별 데이터 일관성 검증

### 테스트 상품: [상품명] (SKU: [item_id])

---

### 1. select_item 페이지별 검증

| 페이지 | item_id | item_name | item_brand | item_category | price | 일치 |
|-------|---------|-----------|------------|---------------|-------|------|
| 검색 결과 | | | | | | |
| 카테고리 | | | | | | |
| 메인 베스트 | | | | | | |
| 상세 추천 | | | | | | |
| 장바구니 추천 | | | | | | |

---

### 2. add_to_cart 페이지별 검증

| 페이지 | item_id | item_name | item_brand | item_category | price | 일치 |
|-------|---------|-----------|------------|---------------|-------|------|
| 메인 (바로담기) | | | | | | |
| 카테고리 (담기) | | | | | | |
| 검색결과 (담기) | | | | | | |
| 상품상세 (장바구니) | | | | | | |
| 퀵뷰 모달 | | | | | | |
| 장바구니 (추천) | | | | | | |
| 위시리스트 | | | | | | |

---

### 3. view_item_list 페이지별 검증

동일 상품이 여러 목록에 포함된 경우:

| 페이지 | item_list_name | 상품A item_id | 상품A item_name | 일치 |
|-------|---------------|---------------|-----------------|------|
| 카테고리 | | | | |
| 검색결과 | | | | |
| 메인 베스트 | | | | |
| 브랜드 페이지 | | | | |

---

### 4. 일관성 확인 체크리스트
- [ ] 모든 페이지에서 item_id 형식이 동일한가? (prefix, 대소문자)
- [ ] 모든 페이지에서 item_name이 동일한가? (브랜드명 포함 여부, 공백)
- [ ] 모든 페이지에서 item_brand가 동일한가? (한글/영문, 대소문자)
- [ ] 모든 페이지에서 item_category 레벨이 동일한가? (대분류/중분류)
- [ ] 모든 페이지에서 price가 동일한가? (할인가 기준)
```

---

### 전체 일관성 검증 매트릭스

동일 상품(SKU_12345)에 대한 **퍼널 + 페이지** 종합 검증:

```markdown
## 종합 일관성 검증 매트릭스

### 테스트 상품: 수분 크림 (SKU_12345)

| 이벤트 | 발생 페이지 | item_id | item_name | item_brand | item_category |
|-------|-----------|---------|-----------|------------|---------------|
| select_item | 검색결과 | | | | |
| select_item | 카테고리 | | | | |
| select_item | 메인 베스트 | | | | |
| view_item | 상품상세 | | | | |
| add_to_cart | 메인 바로담기 | | | | |
| add_to_cart | 카테고리 담기 | | | | |
| add_to_cart | 상품상세 | | | | |
| add_to_cart | 장바구니 추천 | | | | |
| begin_checkout | 주문서 | | | | |
| purchase | 완료페이지 | | | | |

### 검증 결과
- [ ] 모든 행의 item_id가 동일
- [ ] 모든 행의 item_name이 동일
- [ ] 모든 행의 item_brand가 동일
- [ ] 모든 행의 item_category가 동일
```

---

## 일관성 검증 자동화

### 데이터 수집 및 비교 함수

```javascript
// 퍼널 일관성 검증
function validateFunnelConsistency(events) {
  const funnelEvents = ['select_item', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase'];
  const consistencyFields = ['item_id', 'item_name', 'item_brand', 'item_category'];
  const errors = [];

  // 이벤트별 item 데이터 수집
  const itemDataByEvent = {};
  funnelEvents.forEach(eventName => {
    const event = events.find(e => e.event === eventName);
    if (event?.ecommerce?.items?.[0]) {
      itemDataByEvent[eventName] = event.ecommerce.items[0];
    }
  });

  // 기준값 (첫 번째 이벤트)
  const baseEvent = Object.keys(itemDataByEvent)[0];
  const baseData = itemDataByEvent[baseEvent];

  if (!baseData) {
    errors.push('기준 이벤트 데이터 없음');
    return errors;
  }

  // 일관성 비교
  for (const [eventName, itemData] of Object.entries(itemDataByEvent)) {
    if (eventName === baseEvent) continue;

    for (const field of consistencyFields) {
      if (baseData[field] !== itemData[field]) {
        errors.push(
          `${field} 불일치: ${baseEvent}="${baseData[field]}" vs ${eventName}="${itemData[field]}"`
        );
      }
    }
  }

  return errors;
}

// 사용 예시
const collectedEvents = [
  { event: 'select_item', ecommerce: { items: [{ item_id: 'SKU_12345', item_name: '수분 크림' }] } },
  { event: 'view_item', ecommerce: { items: [{ item_id: 'SKU_12345', item_name: '수분 크림' }] } },
  { event: 'add_to_cart', ecommerce: { items: [{ item_id: '12345', item_name: '수분크림' }] } }  // 불일치!
];

const errors = validateFunnelConsistency(collectedEvents);
// 결과: ["item_id 불일치: select_item="SKU_12345" vs add_to_cart="12345"",
//        "item_name 불일치: select_item="수분 크림" vs add_to_cart="수분크림""]
```

---

## 흔한 일관성 오류 패턴

### 1. ID 형식 불일치

| 페이지/이벤트 | item_id | 문제 |
|-------------|---------|------|
| select_item | "SKU_12345" | - |
| view_item | "12345" | prefix 누락 |
| add_to_cart | "sku_12345" | 대소문자 |
| purchase | "SKU-12345" | 구분자 다름 |

### 2. 이름 형식 불일치

| 페이지/이벤트 | item_name | 문제 |
|-------------|-----------|------|
| select_item | "수분 크림" | - |
| view_item | "설화수 수분 크림" | 브랜드명 포함 |
| add_to_cart | "수분크림" | 공백 누락 |
| purchase | "[설화수] 수분 크림 60ml" | 용량 포함 |

### 3. 브랜드 형식 불일치

| 페이지/이벤트 | item_brand | 문제 |
|-------------|------------|------|
| select_item | "SULWHASOO" | - |
| view_item | "설화수" | 한글 vs 영문 |
| add_to_cart | "sulwhasoo" | 대소문자 |
| purchase | "AP_SULWHASOO" | prefix 추가 |

### 4. 카테고리 레벨 불일치

| 페이지/이벤트 | item_category | 문제 |
|-------------|---------------|------|
| select_item | "스킨케어" | 대분류 |
| view_item | "스킨케어 > 크림" | 경로 형식 |
| add_to_cart | "크림" | 중분류만 |
| purchase | "SKINCARE" | 영문 코드 |

---

## 일관성 확보를 위한 권장 사항

### 데이터 소스 통일

```
권장: 중앙 집중식 상품 데이터 관리

┌─────────────────────────────────────────┐
│         상품 마스터 데이터 (API)          │
│  item_id, item_name, brand, category   │
└─────────────────────────────────────────┘
              │
    ┌─────────┼─────────┐
    ▼         ▼         ▼
 검색 API   카테고리 API  상세 API
    │         │         │
    └─────────┼─────────┘
              ▼
         동일한 형식
```

### 프론트엔드 매핑 함수 통일

```javascript
// 모든 페이지에서 동일한 매핑 함수 사용
function mapProductToGA4Item(product) {
  return {
    item_id: `SKU_${product.id}`,           // 항상 동일한 형식
    item_name: product.name.trim(),          // 항상 trim 처리
    item_brand: product.brandCode.toUpperCase(),  // 항상 대문자
    item_category: product.category1,        // 항상 대분류
    item_category2: product.category2,
    price: Number(product.salePrice)         // 항상 숫자
  };
}
```

### 화면-데이터 일치 검증

비주얼 검수에서 반드시 확인해야 할 사항:

```markdown
## 화면-데이터 일치 검증

### 상품 정보
- [ ] 화면 상품명 = item_name
- [ ] 화면 가격 = price (할인가 기준)
- [ ] 화면 수량 = quantity
- [ ] 화면 브랜드명 = item_brand
- [ ] 화면 카테고리 = item_category

### 금액 정보
- [ ] 화면 총액 = value
- [ ] 화면 배송비 = shipping
- [ ] 화면 할인액과 실제 할인 반영 여부

### 주문 정보 (purchase)
- [ ] 화면 주문번호 = transaction_id
- [ ] 화면 결제금액 = value
```

### 잘못된 데이터 수집 예시

**Case 1: JSON 파싱 실패**
```html
<!-- 잘못된 JSON (따옴표 오류) -->
<a ap-click-data="{'item_id':'SKU123'}">  <!-- 작은따옴표 사용 -->
```
→ 파싱 실패, 파라미터 누락

**Case 2: 데이터 매핑 오류**
```javascript
// GTM 변수
{
  item_id: data.product_id,    // 정상
  item_name: data.title,       // 정상
  price: data.price            // 문자열 "25,000원" 수집됨
}
```
→ price가 숫자가 아닌 문자열

**Case 3: 상위 요소 데이터 수집**
```html
<div ap-click-data='{"item_id":"PARENT"}'>
  <a ap-click-data='{"item_id":"CHILD"}'>클릭</a>
</div>
```
→ CHILD 대신 PARENT 데이터 수집 (버블링)

---

## 페이지 로드 이벤트 검증 시나리오

### view_item, view_item_list 등

| 시나리오 | 상황 | 예상 | 실제 | 판정 |
|---------|-----|-----|------|------|
| 정상 로드 | 페이지 진입 | 1회 발생 | 1회 발생 | ✅ |
| SPA 전환 | 라우트 변경 | 1회 발생 | 미발생 | ❌ |
| 새로고침 | F5 또는 새로고침 | 1회 발생 | 2회 발생 | 🔄 |
| 뒤로가기 | 브라우저 뒤로가기 | 1회 발생 | 미발생 | ❌ |
| 빈 결과 | 검색 결과 0건 | 발생 (빈 items) | 미발생 | ❌ |

### 무한 스크롤 시나리오

```
┌──────────────────────────┐
│ 상품 1-20 (view_item_list) │  ← 최초 로드: 1회 발생
├──────────────────────────┤
│ 상품 21-40                │  ← 스크롤 로드: 추가 발생?
├──────────────────────────┤
│ 상품 41-60                │  ← 스크롤 로드: 추가 발생?
└──────────────────────────┘
```

| 구현 방식 | 이벤트 발생 | 판정 |
|----------|-----------|------|
| 최초 1회만 | 1회 | 구현에 따라 정상 |
| 스크롤마다 추가 상품만 | 여러 회 (신규 items만) | ✅ 권장 |
| 스크롤마다 전체 상품 | 여러 회 (중복 items) | ⚠️ 중복 |

---

## 트랜잭션 이벤트 검증 시나리오

### purchase 이벤트

| 시나리오 | 상황 | 예상 | 위험 |
|---------|-----|-----|------|
| 정상 결제 | 결제 완료 후 | 1회 발생 | - |
| 새로고침 | 완료 페이지 새로고침 | 발생하면 안 됨 | 🔴 매출 중복 |
| 뒤로→앞으로 | 브라우저 히스토리 | 발생하면 안 됨 | 🔴 매출 중복 |
| 결제 실패 | 카드 승인 실패 | 발생하면 안 됨 | 🔴 허위 매출 |
| 간편결제 | 외부 앱 → 리다이렉트 | 1회 발생 | 누락 가능 |

**purchase 중복 방지 검증:**
```javascript
// 정상 구현: transaction_id로 중복 체크
if (sessionStorage.getItem('purchase_' + transactionId)) {
  return; // 이미 발생함
}
sessionStorage.setItem('purchase_' + transactionId, 'true');
dataLayer.push({ event: 'purchase', ... });
```

---

## 비주얼 검수 체크리스트

### 클릭 이벤트 검수

```markdown
## 클릭 영역 검수

### 1. 비주얼 확인
- [ ] 클릭 가능한 요소 식별 (버튼, 링크, 카드 등)
- [ ] 클릭 영역의 범위 확인 (전체 카드? 일부 영역?)

### 2. DOM 속성 확인
- [ ] 클릭 영역에 트래킹 속성 존재 여부 (ap-click-area 등)
- [ ] 속성값의 JSON 유효성
- [ ] 중첩 요소의 속성 배치 확인

### 3. 이벤트 발생 테스트
- [ ] 예상 영역 클릭 → 이벤트 발생 확인
- [ ] 비예상 영역 클릭 → 이벤트 미발생 확인
- [ ] 중첩 영역 클릭 → 중복 발생 확인

### 4. 데이터 검증
- [ ] 발생한 이벤트의 파라미터 확인
- [ ] 파라미터 값이 클릭한 요소와 일치하는지
- [ ] 데이터 타입 확인 (문자열/숫자)
```

### 페이지 로드 이벤트 검수

```markdown
## 페이지 로드 이벤트 검수

### 1. 정상 로드 테스트
- [ ] 직접 URL 접근 시 이벤트 발생
- [ ] 내부 링크로 이동 시 이벤트 발생
- [ ] SPA 라우트 변경 시 이벤트 발생

### 2. 엣지 케이스 테스트
- [ ] 새로고침 시 중복 발생 여부
- [ ] 뒤로가기/앞으로가기 시 발생 여부
- [ ] 빈 결과 시 발생 여부 (빈 items 배열)

### 3. 데이터 검증
- [ ] items 배열에 페이지 내 상품 포함
- [ ] item_list_name 등 컨텍스트 정보 정확성
```

---

## 시나리오 작성 시 포함할 테스트 케이스

### 기존 구조

```markdown
### Should Fire
- ...

### Should NOT Fire
- ...
```

### 개선된 구조

```markdown
### 정상 발생 케이스 (Expected Fire) ✅
- 상황: [구체적 상황]
- 예상 이벤트: [이벤트명]
- 예상 파라미터: [주요 파라미터]

### 정상 미발생 케이스 (Expected No Fire) ✅
- 상황: [구체적 상황]
- 이유: [미발생 사유 - 속성 없음, 다른 이벤트 대상 등]

### 오발생 위험 케이스 (Wrong Fire Risk) ⚠️
- 상황: [이벤트 버블링, 잘못된 셀렉터 등]
- 확인 방법: [검증 방법]

### 중복 발생 위험 케이스 (Duplicate Fire Risk) 🔄
- 상황: [새로고침, 중첩 요소 등]
- 확인 방법: [검증 방법]

### 데이터 오류 위험 케이스 (Wrong Data Risk) 📊
- 상황: [잘못된 요소 데이터 수집, 파싱 오류 등]
- 확인 항목: [파라미터명과 예상값]
```

---

## Gemini Vision API 프롬프트 가이드

비주얼 검수 시 Gemini Vision API에 전달할 프롬프트 예시:

```
이 화면에서 클릭 가능한 요소들을 식별하고, 각 요소에 대해:

1. 요소 설명 (위치, 형태)
2. 클릭 시 예상되는 사용자 행동
3. GA4 이벤트 발생 가능성:
   - 발생해야 함 (Should Fire)
   - 발생하면 안 됨 (Should NOT Fire)
   - DOM 속성 확인 필요 (Need DOM Check)

특히 다음 위험 요소를 확인:
- 중첩된 클릭 영역 (이벤트 버블링 위험)
- 시각적으로 유사하지만 다른 기능의 요소
- 체크박스/라디오 버튼과 레이블 영역
```

---

## 참고: 이벤트별 위험 시나리오 요약

| 이벤트 | 주요 위험 | 검증 포인트 |
|-------|---------|------------|
| select_promotion | 이벤트 버블링 | 중첩 배너 클릭 |
| select_item | 오발생 | 프로모션 vs 상품 구분 |
| add_to_cart | 중복 발생 | 빠른 연속 클릭 |
| view_item_list | 무한 스크롤 중복 | 스크롤 시 items 중복 |
| purchase | 새로고침 중복 | transaction_id 중복 체크 |
| login | 오발생 | 로그인 실패 시에도 발생 |
| ap_click | 버블링 + 데이터 오류 | 중첩 요소, JSON 파싱 |
