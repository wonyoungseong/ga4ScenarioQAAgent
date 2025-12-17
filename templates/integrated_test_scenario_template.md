# 통합 테스트 시나리오 템플릿

## 대상 사이트: [사이트 URL]
## 사이트 설정: [sites/{site-id}/site-config.json]
## 작성일: [YYYY-MM-DD]

---

## 사이트별 설정 참조

**중요**: dataLayer event명, CSS Selector, DOM 속성은 사이트마다 다릅니다.
테스트 전 `sites/{site-id}/site-config.json` 파일에서 실제 값을 확인하세요.

---

## 테스트 개요

이 시나리오는 하나의 테스트 플로우에서 **여러 GA4 이벤트의 발생/미발생을 동시에 검증**합니다.
각 액션마다 발생해야 하는 이벤트와 발생하면 안 되는 이벤트를 함께 확인하여 테스트 효율을 높입니다.

---

## 테스트 플로우 1: 메인 → 상품 목록 → 상품 상세 → 장바구니

### Step 1: 메인 페이지 접속
```
액션: [사이트 URL] 접속
```

| 이벤트 | 발생 여부 | 검증 포인트 |
|-------|----------|------------|
| `page_view` | O 발생 | page_location, page_title 확인 |
| `view_promotion` | O 발생 | 히어로 배너 프로모션 정보 확인 |
| `view_item` | X 미발생 | 상품 상세 페이지 아님 |
| `view_item_list` | X 미발생 | 상품 목록 페이지 아님 |
| `view_cart` | X 미발생 | 장바구니 페이지 아님 |

**dataLayer 확인:**
```javascript
// view_promotion 예상 구조
// event명은 site-config.json의 eventMapping.view_promotion 참조
{
  event: "[eventMapping.view_promotion]",
  ecommerce: {
    items: [{
      promotion_name: "[배너명]",
      creative_slot: "[위치]"
    }]
  }
}
```

---

### Step 2: 히어로 배너 클릭
```
액션: 메인 페이지 히어로 배너 클릭
```

| 이벤트 | 발생 여부 | 검증 포인트 |
|-------|----------|------------|
| `select_promotion` | O 발생 | ap-data-promotion에서 정보 추출 |
| `select_item` | X 미발생 | 상품 카드 아님 |
| `add_to_cart` | X 미발생 | 장바구니 담기 아님 |

**DOM 속성 확인:**
```html
<!-- DOM 속성은 site-config.json의 domAttributes.selectPromotion 참조 -->
<a href="[이벤트 URL]" [domAttributes.selectPromotion.cssSelector]='{"promotion_name":"[배너명]","creative_slot":"[위치]"}'>
```

---

### Step 3: 카테고리 페이지 이동
```
액션: 네비게이션에서 카테고리 메뉴 클릭 (예: 스킨케어)
```

| 이벤트 | 발생 여부 | 검증 포인트 |
|-------|----------|------------|
| `page_view` | O 발생 | 새 페이지 로드 |
| `view_item_list` | O 발생 | item_list_name, items 확인 |
| `select_promotion` | X 미발생 | 프로모션 배너 클릭 아님 |
| `view_item` | X 미발생 | 상품 상세 아님 |
| `view_search_results` | X 미발생 | 검색 결과 아님 |

**dataLayer 확인:**
```javascript
// view_item_list 예상 구조
// event명은 site-config.json의 eventMapping.view_item_list 참조
{
  event: "[eventMapping.view_item_list]",
  ecommerce: {
    item_list_name: "[카테고리명]",
    items: [
      { item_id: "[SKU]", item_name: "[상품명]", price: [가격] },
      // ...
    ]
  }
}
```

---

### Step 4: 상품 카드 클릭
```
액션: 상품 목록에서 첫 번째 상품 카드 클릭
```

| 이벤트 | 발생 여부 | 검증 포인트 |
|-------|----------|------------|
| `select_item` | O 발생 | 클릭된 상품 정보 포함 |
| `select_promotion` | X 미발생 | 프로모션 배너 아님 |
| `add_to_cart` | X 미발생 | 장바구니 담기 아님 |

**DOM 속성 확인:**
```html
<!-- DOM 속성은 site-config.json의 domAttributes.selectItem 참조 -->
<a href="[상품 URL]" [domAttributes.selectItem.cssSelector]='{"item_id":"[SKU]","item_name":"[상품명]"}'>
```

---

### Step 5: 상품 상세 페이지 로드
```
액션: Step 4 이후 자동 페이지 로드
```

| 이벤트 | 발생 여부 | 검증 포인트 |
|-------|----------|------------|
| `page_view` | O 발생 | 새 페이지 로드 |
| `view_item` | O 발생 | 상품 상세 정보 포함 |
| `view_item_list` | X 미발생 | 목록 페이지 아님 |
| `add_to_cart` | X 미발생 | 아직 담기 전 |
| `select_item` | X 미발생 | 이미 상세 페이지 진입 |

**dataLayer 확인:**
```javascript
// view_item 예상 구조
// event명은 site-config.json의 eventMapping.view_item 참조
{
  event: "[eventMapping.view_item]",  // 예: "product"
  ecommerce: {
    currency: "KRW",
    value: [가격],
    items: [{
      item_id: "[SKU]",
      item_name: "[상품명]",
      item_brand: "[브랜드]",
      price: [가격]
    }]
  }
}
```

---

### Step 6: 장바구니 담기 클릭
```
액션: 옵션 선택 후 "장바구니 담기" 버튼 클릭
조건: API 성공 응답 후
```

| 이벤트 | 발생 여부 | 검증 포인트 |
|-------|----------|------------|
| `add_to_cart` | O 발생 | 추가된 상품, 수량, 옵션 포함 |
| `select_item` | X 미발생 | 상품 선택이 아닌 담기 |
| `begin_checkout` | X 미발생 | 결제 시작 아님 |
| `view_cart` | X 미발생 | 장바구니 페이지 이동 아님 |

**dataLayer 확인:**
```javascript
// add_to_cart 예상 구조
// event명은 site-config.json의 eventMapping.add_to_cart 참조
{
  event: "[eventMapping.add_to_cart]",  // 예: "addcart"
  ecommerce: {
    currency: "KRW",
    value: [총액],
    items: [{
      item_id: "[SKU]",
      item_name: "[상품명]",
      item_variant: "[옵션]",
      price: [단가],
      quantity: [수량]
    }]
  }
}
```

---

### Step 7: 장바구니 페이지 이동
```
액션: 헤더의 장바구니 아이콘 클릭
```

| 이벤트 | 발생 여부 | 검증 포인트 |
|-------|----------|------------|
| `page_view` | O 발생 | 새 페이지 로드 |
| `view_cart` | O 발생 | 담긴 상품 목록 포함 |
| `add_to_cart` | X 미발생 | 이미 담기 완료 |
| `begin_checkout` | X 미발생 | 결제 시작 전 |

**dataLayer 확인:**
```javascript
// view_cart 예상 구조
// event명은 site-config.json의 eventMapping.view_cart 참조
{
  event: "[eventMapping.view_cart]",  // 예: "view_cart"
  ecommerce: {
    currency: "KRW",
    value: [총액],
    items: [
      { item_id: "[SKU]", item_name: "[상품명]", price: [단가], quantity: [수량] }
    ]
  }
}
```

---

## 테스트 플로우 2: 장바구니 → 결제 → 주문완료

### Step 1: 장바구니에서 결제하기 클릭
```
액션: "결제하기" 버튼 클릭
```

| 이벤트 | 발생 여부 | 검증 포인트 |
|-------|----------|------------|
| `add_to_cart` | X 미발생 | 담기가 아님 |
| `remove_from_cart` | X 미발생 | 삭제가 아님 |

---

### Step 2: 주문서 페이지 로드
```
액션: Step 1 이후 자동 페이지 로드
```

| 이벤트 | 발생 여부 | 검증 포인트 |
|-------|----------|------------|
| `page_view` | O 발생 | 새 페이지 로드 |
| `begin_checkout` | O 발생 | 결제 대상 상품 포함 |
| `view_cart` | X 미발생 | 장바구니 페이지 아님 |
| `purchase` | X 미발생 | 결제 완료 전 |

**dataLayer 확인:**
```javascript
// begin_checkout 예상 구조
// event명은 site-config.json의 eventMapping.begin_checkout 참조
{
  event: "[eventMapping.begin_checkout]",  // 예: "checkout"
  ecommerce: {
    currency: "KRW",
    value: [결제 예정 금액],
    items: [...]
  }
}
```

---

### Step 3: 결제 완료 후 주문완료 페이지
```
액션: 결제 수단 선택 → 결제 완료
```

| 이벤트 | 발생 여부 | 검증 포인트 |
|-------|----------|------------|
| `page_view` | O 발생 | 새 페이지 로드 |
| `purchase` | O 발생 | transaction_id 필수, 결제 상품 포함 |
| `begin_checkout` | X 미발생 | 결제 이미 완료 |
| `view_cart` | X 미발생 | 장바구니 아님 |

**dataLayer 확인:**
```javascript
// purchase 예상 구조
// event명은 site-config.json의 eventMapping.purchase 참조
{
  event: "[eventMapping.purchase]",  // 예: "purchase"
  ecommerce: {
    transaction_id: "[주문번호]",
    currency: "KRW",
    value: [최종 결제 금액],
    tax: [세금],
    shipping: [배송비],
    items: [...]
  }
}
```

---

## 테스트 플로우 3: 검색 → 상품 선택

### Step 1: 검색 실행
```
액션: 검색창에 "[검색어]" 입력 후 검색
```

| 이벤트 | 발생 여부 | 검증 포인트 |
|-------|----------|------------|
| `page_view` | O 발생 | 검색 결과 페이지 로드 |
| `view_search_results` | O 발생 | search_term 포함 |
| `view_item_list` | X/O | 사이트 구현에 따라 다름 |
| `view_item` | X 미발생 | 상품 상세 아님 |

---

## 테스트 플로우 4: 로그인/회원가입

### Step 1: 로그인 성공
```
액션: 이메일/비밀번호 입력 후 로그인 (인증 성공)
```

| 이벤트 | 발생 여부 | 검증 포인트 |
|-------|----------|------------|
| `login` | O 발생 | method: "email" |
| `sign_up` | X 미발생 | 기존 회원 로그인 |

---

### Step 2: 회원가입 완료
```
액션: 회원가입 폼 작성 → 가입 완료
```

| 이벤트 | 발생 여부 | 검증 포인트 |
|-------|----------|------------|
| `sign_up` | O 발생 | method 포함 |
| `login` | O/X | 자동 로그인 설정에 따라 |

---

## 테스트 체크리스트

### 페이지별 이벤트 검증

- [ ] 메인 페이지: page_view, view_promotion
- [ ] 카테고리 페이지: page_view, view_item_list
- [ ] 검색 결과: page_view, view_search_results
- [ ] 상품 상세: page_view, view_item
- [ ] 장바구니: page_view, view_cart
- [ ] 주문서: page_view, begin_checkout
- [ ] 주문 완료: page_view, purchase

### 클릭 이벤트 검증

- [ ] 프로모션 배너 클릭: select_promotion
- [ ] 상품 카드 클릭: select_item
- [ ] 장바구니 담기: add_to_cart
- [ ] 장바구니 삭제: remove_from_cart

### 사용자 이벤트 검증

- [ ] 로그인 성공: login
- [ ] 회원가입 완료: sign_up
- [ ] 리뷰 작성 완료: write_review

### 미발생 확인 (중요)

- [ ] 상품 카드 클릭 시 select_promotion 미발생
- [ ] 프로모션 배너 클릭 시 select_item 미발생
- [ ] 장바구니 담기 시 begin_checkout 미발생
- [ ] 페이지 로드 시 클릭 이벤트 미발생

---

## 트리거 타입 참조

**참고**: dataLayer event명은 사이트마다 다릅니다. 아래는 Amoremall (amoremall-kr) 기준 예시입니다.
실제 값은 `sites/{site-id}/site-config.json`의 `eventMapping` 값을 확인하세요.

| GA4 이벤트 | 트리거 타입 | dataLayer event명 (예시) | site-config 키 |
|-----------|-----------|------------------------|----------------|
| select_promotion | LINK_CLICK | - | domAttributes.selectPromotion |
| select_item | LINK_CLICK | - | domAttributes.selectItem |
| add_to_cart | CUSTOM_EVENT | addcart | eventMapping.add_to_cart |
| remove_from_cart | CUSTOM_EVENT | removecart | eventMapping.remove_from_cart |
| view_item | CUSTOM_EVENT | product | eventMapping.view_item |
| view_item_list | CUSTOM_EVENT | view_item_list | eventMapping.view_item_list |
| view_cart | CUSTOM_EVENT | view_cart | eventMapping.view_cart |
| begin_checkout | CUSTOM_EVENT | checkout | eventMapping.begin_checkout |
| purchase | CUSTOM_EVENT | purchase | eventMapping.purchase |
| login | CUSTOM_EVENT | login_complete | eventMapping.login |
| sign_up | CUSTOM_EVENT | sign_up_complete | eventMapping.sign_up |
| view_search_results | CUSTOM_EVENT | search | eventMapping.view_search_results |
| write_review | CUSTOM_EVENT | review | eventMapping.write_review |
| view_promotion | DOM_READY/CUSTOM | view_promotion | eventMapping.view_promotion |
| page_view | PAGEVIEW/HISTORY | page_view | - |
| scroll | SCROLL_DEPTH | scroll | - |
