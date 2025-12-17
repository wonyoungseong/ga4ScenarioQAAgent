# view_cart 이벤트 가이드

## 이벤트 정의
**장바구니 페이지가 로드될 때** 발생하는 이벤트입니다.
사용자가 장바구니에 담긴 상품을 확인하는 행동을 추적합니다.
**클릭이 아닌 페이지 로드 시 자동 발생**합니다.

---

## 1. 시각적 판단 기준 (Primary - 화면에서 찾기)

### 장바구니 페이지의 시각적 특징

#### 1) 장바구니 상품 목록
- **위치**: 페이지 중앙
- **형태**: 세로 목록 레이아웃
- **구성 요소**:
  - 상품 이미지 (썸네일)
  - 상품명
  - 옵션 정보
  - 수량 조절 UI (+/- 버튼)
  - 개별 가격
  - 삭제 버튼 (X 아이콘)

#### 2) 전체 선택/삭제 영역
- **위치**: 상품 목록 상단
- **구성 요소**:
  - 전체 선택 체크박스
  - "선택 삭제" 버튼
  - 상품 개수 표시

#### 3) 결제 금액 요약
- **위치**: 우측 또는 하단
- **구성 요소**:
  - 상품 금액 합계
  - 할인 금액
  - 배송비
  - **총 결제 예정 금액** (강조)

#### 4) 결제 버튼
- **텍스트**: "결제하기", "주문하기", "구매하기"
- **특징**: 대형 CTA 버튼, 브랜드 컬러

### 장바구니 페이지가 아닌 화면 (시각적 구분)

| 화면 | 특징 | 해당 이벤트 |
|-----|------|--------------|
| 상품 상세 | 단일 상품 정보 + 담기 버튼 | `view_item` |
| 주문서 페이지 | 배송지/결제수단 입력 | `begin_checkout` |
| 주문 완료 | 주문 번호 + 완료 메시지 | `purchase` |
| 위시리스트 | 찜한 상품 목록 (결제 버튼 없음) | 별도 이벤트 |

---

## 2. GTM 트리거 조건 (검증용)

### 현재 구현된 조건
```
트리거 타입: CUSTOM_EVENT (dataLayer push)
Custom Event: [사이트별 상이 - site-config.json 참조]
발생 시점: 장바구니 페이지 로드 시
```

### 사이트별 dataLayer event명 예시
| 사이트 | dataLayer event | GA4 이벤트 | 설정 파일 |
|-------|-----------------|-----------|----------|
| Amoremall | `view_cart` | `view_cart` | `sites/amoremall-kr/site-config.json` |
| Innisfree Shopify | `view_cart` | `view_cart` | `sites/innisfree-shopify/site-config.json` |

### 발생 조건
```
- 장바구니 페이지 직접 접근
- 헤더의 장바구니 아이콘 클릭으로 이동
- 상품 담기 후 장바구니로 이동
```

### dataLayer 구조

**참고**: 실제 `event` 값은 사이트마다 다릅니다. `sites/{site}/site-config.json`의 `eventMapping.view_cart` 값을 확인하세요.

```javascript
// GA4 이벤트: view_cart
// dataLayer event명은 사이트별 설정 참조
dataLayer.push({
  event: "[eventMapping.view_cart]",  // 예: "view_cart"
  ecommerce: {
    currency: "KRW",
    value: 75000,
    items: [
      {
        item_id: "SKU_12345",
        item_name: "수분 크림",
        price: 25000,
        quantity: 2
      },
      {
        item_id: "SKU_12346",
        item_name: "에센스",
        price: 35000,
        quantity: 1
      }
    ]
  }
});
```

---

## 3. 분석 판단 프로세스

### Step 1: 페이지 타입 식별
화면의 구조를 분석합니다:
- 담긴 상품 목록 + 수량 조절 + 결제 버튼 = **장바구니 페이지**
- 배송지/결제수단 입력 = **주문서 페이지**
- 단일 상품 상세 정보 = **상품 상세 페이지**

### Step 2: 장바구니 페이지 필수 요소 확인
- 담긴 상품 목록 (수량 조절 가능)
- 전체 선택/삭제 옵션
- 결제 금액 요약
- 결제하기 버튼

### Step 3: 트래킹 확인
- 페이지 로드 시 dataLayer에 `view_cart` push 여부
- items 배열에 담긴 상품 정보 포함 여부

### Step 4: 결과 분류

#### Case A: 장바구니 페이지 + 트래킹 있음
→ **Should Fire**: 페이지 로드 시 이벤트 발생

#### Case B: 장바구니 페이지 + 트래킹 없음
→ **구현 누락**: dataLayer push 코드 추가 필요

#### Case C: 주문서/완료 페이지
→ **Should NOT Fire**: 다른 이벤트 대상

---

## 4. 구현 검증 포인트

### 필수 확인 사항
1. **장바구니 페이지에서 발생**
   - 모든 진입 경로에서 발생
   - 빈 장바구니에서도 발생

2. **담긴 상품 정보 수집**
   - items 배열에 모든 담긴 상품
   - 각 상품의 수량 정확히 반영

3. **금액 정확성**
   - value는 담긴 상품 총액

### 흔한 구현 오류
| 문제 | 증상 | 해결 방법 |
|-----|------|----------|
| 빈 장바구니 미처리 | 0건일 때 미발생 | 빈 상태도 발생 |
| items 누락 | 상품 정보 없음 | 담긴 상품 정보 수집 |
| 중복 발생 | 새로고침 시 중복 | 중복 방지 확인 |

---

## 5. 수집 파라미터

> **중요**: 아래 파라미터는 대표 예시입니다.
> 실제 구현은 사이트별 GTM 설정에 따라 다르므로, **시나리오 설계 시 반드시 GTM 파싱을 통해 실제 파라미터를 확인**해야 합니다.
> GTM 파싱 방법: [docs/gtm-parsing-guide.md](../docs/gtm-parsing-guide.md) 참조

### 이벤트 레벨 파라미터

| 파라미터 | 설명 | 예시 |
|---------|------|------|
| event_category | 이벤트 카테고리 | "ecommerce" |
| event_action | 이벤트 액션 | "view cart" |
| currency | 통화 | "KRW" |
| value | 총 금액 | 75000 |
| items | 상품 배열 | [{...}] |

### items 배열 파라미터

| 파라미터 | 설명 | 예시 | 필수 |
|---------|------|------|-----|
| item_id | 상품 고유 ID | "SKU_12345" | O |
| item_name | 상품명 | "수분 크림" | O |
| item_brand | 브랜드명 | "설화수" | O |
| item_category | 대분류 | "스킨케어" | O |
| item_category2~5 | 중/소분류 | "크림" | △ |
| price | 단가 | 25000 | O |
| quantity | 수량 | 2 | O |

---

## 6. 관련 이벤트

| 이벤트 | 발생 시점 | 구분 |
|-------|----------|------|
| `add_to_cart` | 장바구니에 상품 추가 | 담기 클릭 |
| `view_cart` | 장바구니 페이지 로드 | 페이지 로드 |
| `remove_from_cart` | 장바구니에서 상품 제거 | 삭제 클릭 |
| `begin_checkout` | 결제 시작 | 결제하기 클릭 |

### 구매 퍼널
```
add_to_cart → view_cart → begin_checkout → purchase
```

---

## 7. 시나리오 예시

### Should Fire (페이지 로드 시)
```
- 헤더 장바구니 아이콘 클릭으로 장바구니 페이지 이동
- 상품 담기 후 "장바구니로 이동" 선택
- URL로 장바구니 페이지 직접 접근
- 빈 장바구니 페이지 로드 (담긴 상품 없음)
- 장바구니 페이지 새로고침
```

### Should NOT Fire
```
- 상품 상세 페이지 로드 → view_item
- 주문서 페이지 로드 → begin_checkout
- 주문 완료 페이지 → purchase
- 위시리스트 페이지 로드
- 장바구니에 상품 담기 → add_to_cart
```

### 구현 필요 (Gap)
```
- 장바구니 페이지인데 dataLayer push 없음
- 빈 장바구니일 때 이벤트 미발생
- items 배열이 비어있거나 부정확함
- value가 실제 총액과 다름
```

---

## 8. 시나리오 작성 지침

### 트리거 타입: CUSTOM_EVENT (dataLayer.push)

이 이벤트는 **dataLayer.push로 발생**합니다.
장바구니 페이지 로드 시 프론트엔드에서 dataLayer.push를 호출하여 이벤트를 발생시킵니다.

### 시나리오에 포함할 내용
```
O 포함해야 함:
- 예상 dataLayer 구조 (dataLayer.push 코드)
- event 이름 (view_cart)
- ecommerce 객체 구조
- items 배열 내 담긴 상품 정보

X 포함하지 않음:
- GTM LINK_CLICK 트리거 관련 내용
- DOM 속성에서 데이터 추출하는 방식
```

### 예상 dataLayer 구조 (시나리오에 포함)
```javascript
dataLayer.push({
  event: "view_cart",
  ecommerce: {
    currency: "KRW",
    value: 75000,
    items: [
      {
        item_id: "SKU_12345",
        item_name: "수분 크림",
        price: 25000,
        quantity: 2
      },
      {
        item_id: "SKU_12346",
        item_name: "에센스",
        price: 35000,
        quantity: 1
      }
    ]
  }
});
```

### 검증 포인트
```
1. dataLayer 확인:
   - 개발자도구 Console에서 dataLayer 배열 확인
   - view_cart 이벤트 객체가 push되는지 확인

2. 발생 시점 확인:
   - 장바구니 페이지 로드 시 발생
   - 빈 장바구니에서도 발생 (items 빈 배열)
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

view_cart의 items는 **add_to_cart로 담긴 상품들의 누적**이며, 이후 begin_checkout, purchase와 일치해야 합니다.

| 파라미터 | 일치 대상 이벤트 | 검증 기준 |
|---------|----------------|----------|
| `items[].item_id` | add_to_cart, begin_checkout, purchase | 동일 상품은 항상 동일 ID |
| `items[].item_name` | 모든 퍼널 이벤트 | 정확히 일치 |
| `items[].price` | 모든 퍼널 이벤트 | 일치 |
| `items[].quantity` | add_to_cart 합계 | 담긴 수량 총합 |
| `value` | items 합계 | price × quantity 합계 |

### 불일치 위험 케이스

| 상황 | 위험 | 검증 방법 |
|-----|------|----------|
| 수량 변경 후 | quantity 불일치 | 수량 변경 후 새로고침 |
| 상품 삭제 후 | 삭제된 상품 포함 | 삭제 후 이벤트 확인 |
| 가격 변동 | price 불일치 | 시간 경과 후 확인 |
| 옵션 변경 | item_variant 불일치 | 옵션 변경 후 확인 |

### 이전/이후 이벤트와 비교

| 비교 | 검증 항목 | 예상 결과 |
|-----|----------|----------|
| add_to_cart → view_cart | item_id, item_name | 일치 |
| view_cart → begin_checkout | 모든 items | 선택 상품만 일치 |
| view_cart → purchase | items | 결제 상품만 일치 |

### 검증 체크리스트
```
□ view_cart의 items가 add_to_cart로 담긴 상품들과 일치
□ view_cart의 각 item의 quantity가 담긴 수량과 일치
□ view_cart의 value가 items의 price × quantity 합계와 일치
□ 수량 변경 시 view_cart의 quantity 반영 확인
□ 상품 삭제 시 view_cart의 items에서 제외 확인
```

---

## 10. 타이밍/중복 발생 위험

### 중복 발생 시나리오

| 상황 | 위험 | 검증 방법 |
|-----|------|----------|
| 새로고침 | 중복 발생 | 새로고침 테스트 |
| 뒤로가기 | 중복 발생 | 히스토리 네비게이션 테스트 |
| 수량 변경 후 | 재발생 여부 | 수량 변경 후 이벤트 확인 |
| 상품 삭제 후 | 재발생 여부 | 삭제 후 이벤트 확인 |

### 타이밍 검증 체크리스트
```
□ 페이지 로드 시 1회만 발생
□ 새로고침 시 중복 발생 처리 확인
□ 수량 변경 시 view_cart 재발생 여부 확인
□ 상품 삭제 시 view_cart 재발생 여부 확인
□ 빈 장바구니에서도 발생 (items 빈 배열)
```

---

## 11. 환경별 검증

> **공통 가이드 참조**: [docs/environment-validation-guide.md](../docs/environment-validation-guide.md)
>
> PC/Mobile, 로그인/비로그인 환경별 검증은 공통 가이드를 참조하세요.

### view_cart 특화 환경 검증

| 환경 | 특이사항 |
|-----|---------|
| 비로그인 | 비로그인 장바구니 지원 시 user_id 없이 items 수집 확인 |
| 로그인 전환 | 비로그인 장바구니 → 로그인 후 병합 시 items 일관성 |
| Mobile | 미니 장바구니(드로어) vs 장바구니 페이지 구분 |
