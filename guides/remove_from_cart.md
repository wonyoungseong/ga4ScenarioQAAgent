# remove_from_cart 이벤트 가이드

## 이벤트 정의
**장바구니에서 상품을 제거했을 때** 발생하는 이벤트입니다.
사용자가 장바구니에 담긴 상품을 삭제하는 행동을 추적합니다.
**삭제 버튼 클릭 후 실제 제거 완료 시** 발생합니다.

---

## 1. 시각적 판단 기준 (Primary - 화면에서 찾기)

### 삭제 버튼의 시각적 특징

#### 1) 개별 상품 삭제 버튼
- **위치**: 각 상품 카드/행의 우측
- **형태**:
  - X 아이콘
  - 휴지통 아이콘
  - "삭제" 텍스트 버튼
- **특징**: 호버 시 색상 변화

#### 2) 선택 삭제 버튼
- **위치**: 상품 목록 상단
- **형태**: "선택 삭제", "선택 상품 삭제" 버튼
- **조건**: 체크박스 선택 후 활성화

#### 3) 전체 삭제 버튼
- **위치**: 상품 목록 상단
- **형태**: "전체 삭제", "장바구니 비우기" 버튼

#### 4) 수량 0으로 변경
- **형태**: 수량 감소 시 0이 되면 자동 삭제
- **특징**: 일부 사이트에서 구현

### 삭제 버튼이 아닌 영역 (시각적 구분)

| 영역 | 특징 | 해당 이벤트 |
|-----|------|--------------|
| 장바구니 담기 버튼 | 상품 추가 | `add_to_cart` |
| 수량 감소 (-) | 수량만 줄임 (삭제 아님) | 없음 |
| 결제하기 버튼 | 결제 페이지로 이동 | `begin_checkout` |
| 찜하기로 이동 | 위시리스트로 이동 | 별도 이벤트 |

---

## 2. GTM 트리거 조건 (검증용)

### 현재 구현된 조건
```
트리거 타입: CUSTOM_EVENT (dataLayer push)
Custom Event: [사이트별 상이 - site-config.json 참조]
발생 시점: 삭제 API 응답 성공 시
```

### 사이트별 dataLayer event명 예시
| 사이트 | dataLayer event | GA4 이벤트 | 설정 파일 |
|-------|-----------------|-----------|----------|
| Amoremall | `removecart` | `remove_from_cart` | `sites/amoremall-kr/site-config.json` |
| Innisfree Shopify | `removecart` | `remove_from_cart` | `sites/innisfree-shopify/site-config.json` |

### 발생 조건
```
- 개별 상품 삭제 버튼 클릭 후 성공
- 선택 삭제로 여러 상품 제거 후 성공
- 전체 삭제로 모든 상품 제거 후 성공
```

### dataLayer 구조

**참고**: 실제 `event` 값은 사이트마다 다릅니다. `sites/{site}/site-config.json`의 `eventMapping.remove_from_cart` 값을 확인하세요.

```javascript
// GA4 이벤트: remove_from_cart
// dataLayer event명은 사이트별 설정 참조
dataLayer.push({
  event: "[eventMapping.remove_from_cart]",  // 예: "removecart"
  ecommerce: {
    currency: "KRW",
    value: 25000,
    items: [{
      item_id: "SKU_12345",
      item_name: "수분 크림",
      price: 25000,
      quantity: 1
    }]
  }
});
```

---

## 3. 분석 판단 프로세스

### Step 1: 시각적으로 삭제 버튼 식별
화면에서 다음 특징을 가진 요소를 찾습니다:
- X 아이콘 또는 휴지통 아이콘
- "삭제" 텍스트
- 상품 행의 우측에 위치

### Step 2: 삭제 완료 확인
다음 기준으로 확인합니다:
- **삭제 전**: 상품이 목록에 있음
- **삭제 후**: 상품이 목록에서 사라짐, 총액 변경

### Step 3: 트래킹 확인
- 삭제 성공 시 dataLayer에 `removecart` 이벤트 push 여부
- 삭제된 상품 정보 포함 여부

### Step 4: 결과 분류

#### Case A: 삭제 완료 + 트래킹 있음
→ **Should Fire**: 삭제 성공 후 이벤트 발생

#### Case B: 삭제 완료 + 트래킹 없음
→ **구현 누락**: 삭제 성공 콜백에 dataLayer push 추가 필요

#### Case C: 수량 감소만 (삭제 아님)
→ **Should NOT Fire**: 상품이 여전히 장바구니에 있음

---

## 4. 구현 검증 포인트

### 필수 확인 사항
1. **모든 삭제 방식에서 트래킹**
   - 개별 상품 삭제
   - 선택 삭제
   - 전체 삭제

2. **발생 시점**
   - 버튼 클릭 시점이 아닌 삭제 성공 후
   - 삭제 실패 시 미발생

3. **삭제된 상품 정보**
   - 삭제된 상품의 정보가 items에 포함
   - 여러 상품 삭제 시 모든 상품 포함

### 흔한 구현 오류
| 문제 | 증상 | 해결 방법 |
|-----|------|----------|
| 클릭 시 발생 | 취소해도 이벤트 발생 | 성공 콜백에서 push |
| 선택 삭제 누락 | 개별만 트래킹 | 모든 삭제 방식에 적용 |
| items 누락 | 어떤 상품인지 모름 | 삭제 상품 정보 수집 |

---

## 5. 수집 파라미터

> **중요**: 아래 파라미터는 대표 예시입니다.
> 실제 구현은 사이트별 GTM 설정에 따라 다르므로, **시나리오 설계 시 반드시 GTM 파싱을 통해 실제 파라미터를 확인**해야 합니다.
> GTM 파싱 방법: [docs/gtm-parsing-guide.md](../docs/gtm-parsing-guide.md) 참조

### 이벤트 레벨 파라미터

| 파라미터 | 설명 | 예시 |
|---------|------|------|
| event_category | 이벤트 카테고리 | "ecommerce" |
| event_action | 이벤트 액션 | "remove from cart" |
| currency | 통화 | "KRW" |
| value | 삭제된 상품 금액 | 25000 |
| items | 상품 배열 | [{...}] |

### items 배열 파라미터

| 파라미터 | 설명 | 예시 | 필수 |
|---------|------|------|-----|
| item_id | 상품 고유 ID | "SKU_12345" | O |
| item_name | 상품명 | "수분 크림" | O |
| item_brand | 브랜드명 | "설화수" | O |
| item_category | 대분류 | "스킨케어" | O |
| price | 단가 | 25000 | O |
| quantity | 삭제된 수량 | 1 | O |

---

## 6. 관련 이벤트

| 이벤트 | 발생 시점 | 구분 |
|-------|----------|------|
| `add_to_cart` | 장바구니에 상품 추가 | 담기 클릭 |
| `view_cart` | 장바구니 페이지 로드 | 페이지 로드 |
| `remove_from_cart` | 장바구니에서 상품 제거 | 삭제 클릭 |
| `begin_checkout` | 결제 시작 | 결제하기 클릭 |

---

## 7. 시나리오 예시

### Should Fire (삭제 성공 시)
```
- 상품 옆 X 버튼 클릭으로 개별 상품 삭제
- 체크박스 선택 후 "선택 삭제" 클릭
- "전체 삭제" 또는 "장바구니 비우기" 클릭
- 삭제 확인 팝업에서 "확인" 클릭 후 삭제 완료
```

### Should NOT Fire
```
- 삭제 버튼 클릭 후 확인 팝업에서 "취소"
- 수량을 1에서 0으로 변경 시도 (구현에 따라)
- 수량 감소 (1 → 0 외)
- 삭제 실패 (서버 에러)
- 장바구니 담기 → add_to_cart
```

### 구현 필요 (Gap)
```
- 삭제해도 dataLayer push 없음
- 삭제 버튼 클릭 시점에 발생 (확인 전)
- 선택 삭제 시 삭제된 상품 중 일부만 items에 포함
- items 배열이 비어있어 어떤 상품인지 알 수 없음
```

---

## 8. 시나리오 작성 지침

### 트리거 타입: CUSTOM_EVENT (dataLayer.push)

이 이벤트는 **dataLayer.push로 발생**합니다.
장바구니 삭제 성공 시 프론트엔드에서 dataLayer.push를 호출하여 이벤트를 발생시킵니다.

### 시나리오에 포함할 내용
```
O 포함해야 함:
- 예상 dataLayer 구조 (dataLayer.push 코드)
- event 이름 ("removecart" → GA4에서 remove_from_cart로 매핑)
- ecommerce 객체 구조
- items 배열 내 삭제된 상품 정보

X 포함하지 않음:
- GTM LINK_CLICK 트리거 관련 내용
- DOM 속성에서 데이터 추출하는 방식
```

### 예상 dataLayer 구조 (시나리오에 포함)
```javascript
dataLayer.push({
  event: "removecart",
  ecommerce: {
    currency: "KRW",
    value: 25000,
    items: [{
      item_id: "SKU_12345",
      item_name: "수분 크림",
      price: 25000,
      quantity: 1
    }]
  }
});
```

### 검증 포인트
```
1. dataLayer 확인:
   - 개발자도구 Console에서 dataLayer 배열 확인
   - removecart 이벤트 객체가 push되는지 확인

2. 발생 시점 확인:
   - 삭제 버튼 클릭이 아닌 삭제 성공 후 발생
   - 삭제 취소/실패 시 미발생
   - 개별/선택/전체 삭제 모두에서 발생
```

---

## 9. 퍼널 데이터 일관성 검증

### 이 이벤트의 퍼널 위치

remove_from_cart는 퍼널에서 이탈하는 이벤트이지만, 삭제되는 상품 데이터가 **이전 이벤트와 일관성**을 유지해야 합니다.

```
select_item → view_item → add_to_cart → view_cart → begin_checkout → purchase
                                            ↓
                                    remove_from_cart (이탈)
```

### 일관성 검증 항목

삭제되는 상품은 **add_to_cart, view_cart의 상품 데이터와 일치**해야 합니다.

| 파라미터 | 일치 대상 이벤트 | 검증 기준 |
|---------|----------------|----------|
| `item_id` | add_to_cart, view_cart | 동일 상품은 항상 동일 ID |
| `item_name` | add_to_cart, view_cart | 정확히 일치 |
| `price` | add_to_cart, view_cart | 일치 |
| `quantity` | view_cart | 삭제 시점의 수량 |

### 불일치 위험 케이스

| 상황 | 위험 | 검증 방법 |
|-----|------|----------|
| 수량 변경 후 삭제 | quantity 불일치 | 수량 변경 후 삭제 테스트 |
| 옵션 변경 후 삭제 | item_variant 불일치 | 옵션 변경 후 삭제 테스트 |
| 가격 변동 후 삭제 | price 불일치 | 시간 경과 후 삭제 테스트 |
| 선택 삭제 시 | 일부 상품 데이터 누락 | 다중 선택 삭제 테스트 |

### 검증 체크리스트
```
□ remove_from_cart의 item_id가 add_to_cart와 일치
□ remove_from_cart의 item_name이 view_cart와 일치
□ remove_from_cart의 price가 view_cart와 일치
□ 삭제 시점의 quantity가 정확히 반영
□ 선택 삭제 시 모든 삭제 상품이 items에 포함
```

---

## 10. 삭제 방식별 검증

### 삭제 발생 가능 방식

이 이벤트는 **여러 삭제 방식**에서 발생하며, 모든 방식에서 일관된 데이터를 수집해야 합니다.

| 삭제 방식 | 트리거 UI | 특징 |
|---------|----------|------|
| 개별 삭제 | X 버튼, 휴지통 아이콘 | 단일 상품 삭제 |
| 선택 삭제 | "선택 삭제" 버튼 | 체크된 상품 일괄 삭제 |
| 전체 삭제 | "전체 삭제" 버튼 | 모든 상품 삭제 |
| 수량 0 삭제 | 수량 감소로 0 | 일부 사이트만 |

### 삭제 방식별 데이터 수집

```javascript
// 개별 삭제 (1개 상품)
{
  event: "removecart",
  ecommerce: {
    items: [{ item_id: "SKU_12345", quantity: 1 }]
  }
}

// 선택 삭제 (3개 상품)
{
  event: "removecart",
  ecommerce: {
    items: [
      { item_id: "SKU_12345", quantity: 1 },
      { item_id: "SKU_12346", quantity: 2 },
      { item_id: "SKU_12347", quantity: 1 }
    ]
  }
}

// 전체 삭제 (모든 상품)
{
  event: "removecart",
  ecommerce: {
    items: [/* 장바구니의 모든 상품 */]
  }
}
```

### 삭제 방식별 검증 체크리스트
```
□ 개별 삭제 시 해당 상품만 items에 포함
□ 선택 삭제 시 체크된 모든 상품이 items에 포함
□ 전체 삭제 시 장바구니의 모든 상품이 items에 포함
□ 수량 0 삭제 시 해당 상품만 items에 포함 (구현된 경우)
```

---

## 11. 환경별 검증

> **공통 가이드 참조**: [docs/environment-validation-guide.md](../docs/environment-validation-guide.md)
>
> PC/Mobile, 로그인/비로그인 환경별 검증은 공통 가이드를 참조하세요.

### remove_from_cart 특화 환경 검증

| 환경 | 특이사항 |
|-----|---------|
| Mobile | 스와이프 삭제 UI 지원 시 스와이프로 삭제 이벤트 발생 확인 |
| PC | 호버 시 나타나는 삭제 버튼 클릭 테스트 |
| 비로그인 | 비로그인 장바구니에서 삭제 시 이벤트 발생 확인 |
