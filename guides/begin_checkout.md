# begin_checkout 이벤트 가이드

## 이벤트 정의
**결제 프로세스가 시작되었을 때** 발생하는 이벤트입니다.
사용자가 구매를 위해 결제 단계로 진입하는 행동을 추적합니다.
**주문서 작성 페이지 로드 시 또는 결제 버튼 클릭 시** 발생합니다.

---

## 1. 시각적 판단 기준 (Primary - 화면에서 찾기)

### 결제 페이지(주문서)의 시각적 특징

#### 1) 배송지 정보 영역
- **위치**: 페이지 상단 또는 좌측
- **구성 요소**:
  - 이름/연락처 입력 필드
  - 주소 입력/검색 필드
  - 배송 요청사항
  - 저장된 배송지 선택

#### 2) 결제 수단 선택 영역
- **형태**: 라디오 버튼 또는 탭 형태
- **옵션 예시**:
  - 신용카드/체크카드
  - 간편결제 (카카오페이, 네이버페이)
  - 무통장입금
  - 휴대폰결제

#### 3) 주문 상품 요약
- **위치**: 우측 또는 하단
- **구성 요소**:
  - 상품 이미지/이름
  - 수량, 옵션
  - 개별 금액

#### 4) 결제 금액 요약
- **구성 요소**:
  - 상품 금액
  - 할인 금액
  - 쿠폰/포인트 적용
  - 배송비
  - **최종 결제 금액** (강조)

#### 5) 최종 결제 버튼
- **텍스트**: "결제하기", "주문 완료", "OO원 결제하기"
- **특징**: 대형 CTA 버튼, 브랜드 컬러

### 결제 버튼의 시각적 특징 (장바구니에서)

#### 1) 장바구니 결제 버튼
- **위치**: 장바구니 페이지 하단/우측
- **텍스트**: "결제하기", "주문하기", "구매하기"
- **특징**: 강조색 대형 버튼

#### 2) 바로 구매 버튼
- **위치**: 상품 상세 페이지
- **텍스트**: "바로 구매", "지금 구매", "즉시 구매"
- **특징**: 장바구니 버튼과 함께 위치

### 결제 페이지가 아닌 화면 (시각적 구분)

| 화면 | 특징 | 해당 이벤트 |
|-----|------|--------------|
| 장바구니 | 담긴 상품 목록 + 수량 조절 | `view_cart` |
| 상품 상세 | 단일 상품 정보 + 담기 버튼 | `view_item` |
| 주문 완료 | 주문 번호 + 완료 메시지 | `purchase` |
| 마이페이지 주문 내역 | 과거 주문 목록 | 별도 이벤트 |

---

## 2. GTM 트리거 조건 (검증용)

### 현재 구현된 조건
```
트리거 타입: CUSTOM_EVENT (dataLayer push)
Custom Event: [사이트별 상이 - site-config.json 참조]
발생 시점: 주문서 페이지 로드 시 또는 결제 버튼 클릭 시
```

### 사이트별 dataLayer event명 예시
| 사이트 | dataLayer event | GA4 이벤트 | 설정 파일 |
|-------|-----------------|-----------|----------|
| Amoremall | `checkout`, `cart`, `purchasecartbtn`, `order` 등 | `begin_checkout` | `sites/amoremall-kr/site-config.json` |
| Innisfree Shopify | `cart`, `purchasecartbtn`, `purchaseprdbtn`, `order` | `begin_checkout` | `sites/innisfree-shopify/site-config.json` |

**참고**: `begin_checkout`은 여러 dataLayer event에서 트리거될 수 있습니다. GTM에서 정규식으로 매칭하는 경우가 많습니다.

### 발생 조건
```
- 장바구니에서 "결제하기" 클릭 → 주문서 페이지 로드
- 상품 상세에서 "바로 구매" 클릭 → 주문서 페이지 로드
- 주문서 작성 페이지 진입 시
```

### dataLayer 구조

**참고**: 실제 `event` 값은 사이트마다 다릅니다. `sites/{site}/site-config.json`의 `eventMapping.begin_checkout` 값을 확인하세요.

```javascript
// GA4 이벤트: begin_checkout
// dataLayer event명은 사이트별 설정 참조
dataLayer.push({
  event: "[eventMapping.begin_checkout]",  // 예: "checkout", "cart", "order" 등
  ecommerce: {
    currency: "KRW",
    value: 75000,
    coupon: "WELCOME10",
    items: [{
      item_id: "SKU_12345",
      item_name: "수분 크림",
      price: 25000,
      quantity: 2
    }]
  }
});
```

---

## 3. 분석 판단 프로세스

### Step 1: 페이지 타입 식별
화면의 구조를 분석합니다:
- 배송지 + 결제수단 + 주문요약 = **주문서 페이지**
- 상품 목록 + 수량 조절 = **장바구니 페이지**
- 주문 번호 + 완료 메시지 = **주문 완료 페이지**

### Step 2: 결제 시작 페이지 필수 요소 확인
- 배송지 정보 입력 영역
- 결제 수단 선택 영역
- 최종 결제 금액 표시
- "결제하기" 최종 CTA

### Step 3: 트래킹 확인
- 페이지 로드 시 dataLayer에 `checkout` 이벤트 push 여부
- items 배열에 결제 대상 상품 포함 여부

### Step 4: 결과 분류

#### Case A: 주문서 페이지 + 트래킹 있음
→ **Should Fire**: 페이지 로드 시 이벤트 발생

#### Case B: 주문서 페이지 + 트래킹 없음
→ **구현 누락**: dataLayer push 코드 추가 필요

#### Case C: 장바구니/완료 페이지
→ **Should NOT Fire**: 다른 이벤트 대상

---

## 4. 구현 검증 포인트

### 필수 확인 사항
1. **모든 결제 진입 경로에서 발생**
   - 장바구니 → 결제
   - 바로 구매 → 결제
   - 원클릭 결제

2. **한 번만 발생**
   - 동일 세션에서 주문서 재방문 시 중복 방지

3. **필수 파라미터**
   - value: 결제 예상 금액
   - items: 결제 대상 상품 목록

### 흔한 구현 오류
| 문제 | 증상 | 해결 방법 |
|-----|------|----------|
| 바로 구매 누락 | 장바구니 경유만 트래킹 | 바로 구매 경로도 적용 |
| 중복 발생 | 페이지 새로고침 시 재발생 | 중복 방지 로직 |
| items 누락 | 상품 정보 없음 | 결제 상품 정보 수집 |
| **dataLayer 중복 push** | 동일 주문 begin_checkout 2회 발생 | dataLayer push 호출 지점 확인 |

---

## 5. 수집 파라미터

> **중요**: 아래 파라미터는 **대표 예시**입니다.
> 실제 구현은 사이트별 GTM 설정에 따라 다르므로, **시나리오 설계 시 반드시 GTM 파싱을 통해 실제 파라미터를 확인**해야 합니다.
>
> ⚠️ **필수 확인 사항**: 없는 파라미터나 추가해야 하는 파라미터는 항상 **GTM parser를 통해 확인**이 필요합니다.
> GTM 파싱 방법: [docs/gtm-parsing-guide.md](../docs/gtm-parsing-guide.md) 참조

### GTM Variable 참조 (Amoremall 기준)

| 파라미터 | GTM Variable | 설명 |
|---------|--------------|------|
| event_category | (하드코딩) | "ecommerce" |
| event_action | "begin checkout" + `{{LT - Checkout Sequence}}` | 체크아웃 액션 |
| event_label | `{{LT - Checkout Step}}` | 체크아웃 단계명 |
| items | `{{JS - Begin Checkout DataLayer}}` | 상품 배열 (**dataLayer variable에서 확인**) |
| checkout_seq | `{{LT - Checkout Sequence}}` | 체크아웃 단계 번호 |
| checkout_step | `{{LT - Checkout Step}}` | 체크아웃 단계명 |
| currency | `{{JS - Currency}}` | 통화 코드 |

> 💡 **items 확인 방법**: GTM 변수 `{{JS - Begin Checkout DataLayer}}`의 정의를 확인하면 items 배열의 구조를 파악할 수 있습니다.
> dataLayer에서 직접 확인: `dataLayer.filter(e => e.ecommerce?.items)`

### 이벤트 레벨 파라미터

| 파라미터 | 설명 | 예시 |
|---------|------|------|
| event_category | 이벤트 카테고리 | "ecommerce" |
| event_action | 이벤트 액션 | "begin checkout" + checkout_seq |
| event_label | 이벤트 라벨 | checkout_step 값 |
| currency | 통화 | "KRW" |
| checkout_seq | 체크아웃 단계 번호 | "1", "2", "3", "4" |
| checkout_step | 체크아웃 단계명 | "cart", "order" 등 |
| items | 상품 배열 | [{...}] |

### items 배열 파라미터

| 파라미터 | 설명 | 예시 | 필수 |
|---------|------|------|-----|
| item_id | 상품 고유 ID | "SKU_12345" | O |
| item_name | 상품명 | "수분 크림" | O |
| item_brand | 브랜드명 | "설화수" | O |
| item_category | 대분류 | "스킨케어" | O |
| item_category2 | 중분류 | "크림" | △ |
| item_category3 | 소분류 | "수분크림" | △ |
| item_category4 | 세분류 4 | - | △ |
| item_category5 | 세분류 5 | - | △ |
| item_variant | 옵션/용량 | "50ml" | △ |
| price | 판매 단가 | 25000 | O |
| quantity | 수량 | 2 | O |
| discount | 할인금액 | 5000 | △ |
| original_price | 정가 | 30000 | △ |

### 사이트별 추가 파라미터 (Amoremall 예시)

| 파라미터 | 설명 | GTM 변수 |
|---------|------|----------|
| apg_brand_code | APG 브랜드 코드 | item.apg_brand_code |
| internal_brand_code | 내부 브랜드 코드 | item.internal_brand_code |

### checkout_seq 값 매핑 (Amoremall 기준)

| dataLayer event | checkout_seq | checkout_step | 설명 |
|----------------|--------------|---------------|------|
| cart | 1 | cart | 장바구니 페이지 |
| purchasecartbtn | 2 | purchasecartbtn | 장바구니에서 구매하기 클릭 |
| purchaseprdbtn | 2 | purchaseprdbtn | 상품상세에서 바로구매 클릭 |
| purchaseplpbtn | 2 | purchaseplpbtn | 상품목록에서 구매하기 클릭 |
| order | 3 | order | 주문서 페이지 |
| orderbtn | 4 | orderbtn | 주문서에서 결제하기 클릭 |

---

## 6. 관련 이벤트

| 이벤트 | 발생 시점 | 구분 |
|-------|----------|------|
| `view_cart` | 장바구니 페이지 로드 | 페이지 로드 이벤트 |
| `begin_checkout` | 주문서 페이지 로드 | 페이지 로드 이벤트 |
| `add_shipping_info` | 배송지 입력 완료 | 선택 이벤트 |
| `add_payment_info` | 결제수단 선택 | 선택 이벤트 |
| `purchase` | 결제 완료 | 완료 이벤트 |

### 체크아웃 퍼널
```
view_cart → begin_checkout → add_shipping_info → add_payment_info → purchase
```

---

## 7. 시나리오 예시

### Should Fire (페이지 로드 시)
```
- 장바구니에서 "결제하기" 클릭 후 주문서 페이지 로드
- 상품 상세에서 "바로 구매" 클릭 후 주문서 페이지 로드
- 주문서 작성 페이지 직접 접근
- 빠른 결제 모달 열림
```

### Should NOT Fire
```
- "장바구니 담기" 버튼 클릭 → add_to_cart
- 장바구니 페이지 진입 → view_cart
- 상품 상세 페이지 진입 → view_item
- 결제 완료 페이지 로드 → purchase
- 주문서에서 배송지/결제수단만 변경 (재발생 X)
```

### 구현 필요 (Gap)
```
- 주문서 페이지인데 dataLayer push 없음
- 바로 구매 경로에서 이벤트 미발생
- 결제 버튼 클릭 시점에 발생 (페이지 로드가 아닌)
- 간편결제 앱 연동 시 트래킹 누락
```

### 상세 시나리오 매트릭스

| 시나리오 | 진행방법 | 발생해야 하는 상황 | 발생하면 안 되는 상황 | 주요 검수 포인트 |
|---------|---------|------------------|---------------------|----------------|
| **장바구니 페이지 로드** | 카트페이지 진입 | 장바구니 페이지가 처음 로드될 때 한 번만 발생해야 함 | 1. 페이지를 새로 고침할 때마다 이벤트가 발생함 2. 페이지를 뒤로 가기로 접근할 때 이벤트가 재발생함 | 중복 이벤트 발생 방지 로직 검토, 페이지 로드 이벤트와 사용자 인터랙션 이벤트 구분 |
| **구매 버튼 클릭** | 카트페이지 버튼 클릭, 제품 상세페이지 바로 구매하기 클릭 | 1. 장바구니 페이지에서 '구매하기' 버튼 클릭 후 주문서 페이지로 이동할 때 한 번만 발생 2. 제품 리스트 영역에서 '구매하기' 버튼 클릭시 주문서 페이지로 이동 시 한번 발생 | 버튼 클릭 실패 또는 페이지 이동 실패 시 이벤트가 발생함 | 클릭 이벤트와 페이지 이동 이벤트의 연결 상태 확인, 유효성 검사 통과 후 이벤트 발생 로직 확인 |
| **주문서 페이지 로드** | 주문서 페이지 로드 | 주문서 페이지가 로드될 때 한 번만 발생해야 함 | 1. 페이지 로드 실패 또는 중단될 때 이벤트가 발생함 2. 페이지를 새로 고침하거나 뒤로 가기로 접근했을 때 중복으로 발생함 | SPA 또는 동적 로드 환경에서의 페이지 이벤트 처리 검증, 중복 이벤트 발생 방지를 위한 페이지 상태 관리 로직 확인 |
| **결제하기 버튼 클릭** | 주문서에서 결제하기 버튼 클릭 | 결제하기 버튼 클릭 후 결제 페이지(PG사)로 이동하는 순간 한 번만 발생해야 함 | 1. 결제 페이지로 이동 실패 시 이벤트가 발생함 2. 클릭 후 네트워크 지연이나 오류로 인한 페이지 이동 실패 시 발생함 | 클릭 이벤트와 결제 페이지로의 이동 상태 확인, 네트워크 상태와 비동기 호출 처리 검증 |

### 시나리오별 상세 검증 항목

#### 1) 장바구니 페이지 로드
```
진행 방법:
1. 장바구니 페이지에 진입
2. 페이지 로드 완료 확인
3. dataLayer에서 begin_checkout 이벤트 확인

검증 항목:
□ 장바구니 페이지가 처음 로드될 때 한 번만 begin_checkout 발생
□ 페이지를 새로 고침할 때마다 이벤트 중복 발생 방지
□ 페이지를 뒤로 가기로 접근할 때 이벤트 재발생 방지
□ 중복 이벤트 발생을 방지하기 위한 로직 검토
□ 페이지 로드 이벤트와 사용자 인터랙션 이벤트 구분 확인
□ items 배열에 장바구니 상품 정보 정확히 포함
```

#### 2) 구매 버튼 클릭 (장바구니, 제품 리스트, 제품 상세)
```
진행 방법:
1. 장바구니 페이지에서 '구매하기' 버튼 클릭
2. 또는 제품 상세페이지에서 '바로 구매하기' 버튼 클릭
3. 주문서 페이지로 이동 확인
4. dataLayer에서 begin_checkout 이벤트 확인

검증 항목:
□ 장바구니에서 '구매하기' 버튼 클릭 후 주문서 페이지 이동 시 한 번만 발생
□ 제품 리스트/상세 영역에서 '구매하기' 버튼 클릭 시 주문서 이동 시 한 번만 발생
□ 버튼 클릭 실패 또는 페이지 이동 실패 시 이벤트 미발생
□ 클릭 이벤트와 페이지 이동 이벤트의 연결 상태 확인
□ 유효성 검사 통과 후 이벤트 발생 로직 확인
□ items 배열에 구매 대상 상품 정보 정확히 포함
```

#### 3) 주문서 페이지 로드
```
진행 방법:
1. 장바구니 또는 바로 구매를 통해 주문서 페이지 진입
2. 주문서 페이지 로드 완료 확인
3. dataLayer에서 begin_checkout 이벤트 확인

검증 항목:
□ 주문서 페이지가 로드될 때 한 번만 begin_checkout 발생
□ 페이지 로드 실패 또는 중단될 때 이벤트 미발생
□ 페이지를 새로 고침할 때 중복 발생 방지
□ 뒤로 가기로 접근했을 때 중복 발생 방지
□ SPA 또는 동적 로드 환경에서의 페이지 이벤트 처리 검증
□ 중복 이벤트 발생 방지를 위한 페이지 상태 관리 로직 확인
□ items, value, currency 등 데이터 정확성 확인
```

#### 4) 결제하기 버튼 클릭
```
진행 방법:
1. 주문서 페이지에서 배송지, 결제수단 입력
2. '결제하기' 버튼 클릭
3. 결제 페이지(PG사)로 이동 확인
4. dataLayer에서 이벤트 확인

검증 항목:
□ 결제하기 버튼 클릭 후 결제 페이지(PG사)로 이동하는 순간 한 번만 발생
□ 결제 페이지로 이동 실패 시 이벤트 미발생
□ 클릭 후 네트워크 지연이나 오류로 인한 페이지 이동 실패 시 이벤트 미발생
□ 클릭 이벤트와 결제 페이지로의 이동 상태 확인
□ 네트워크 상태와 비동기 호출 처리 검증
□ 유효성 검사 (배송지, 결제수단 등) 통과 후에만 이벤트 발생
```

#### 5) dataLayer 중복 push로 인한 중복 발생 (주의 케이스)
```
발생 상황:
- 주문서 페이지 진입 시 begin_checkout(checkout) 이벤트가 2회 이상 발생
- 동일한 결제 건인데 이벤트가 중복으로 수집됨

원인 분석 방법:
1. 개발자 도구 Console에서 dataLayer 확인
2. dataLayer.filter(e => e.event === 'checkout') 실행 (사이트별 event명 확인)
3. checkout 이벤트가 몇 번 push되었는지 확인

일반적인 중복 push 원인:
□ 프론트엔드 코드에서 dataLayer.push가 2회 호출됨
□ 장바구니 페이지 로드와 주문서 페이지 로드에서 각각 push
□ 페이지 로드 + SPA 라우팅 이벤트 중복
□ GTM 태그 설정에서 중복 트리거 적용
□ 바로 구매와 장바구니 구매 로직에서 각각 push

검증 항목:
□ dataLayer에서 checkout 이벤트 push 횟수 확인 (1회만 되어야 함)
□ 중복 발생 시 두 이벤트의 데이터가 동일한지 비교
□ 발생 시점(timestamp) 확인하여 어느 지점에서 중복되는지 분석
□ 개발팀에 중복 push 지점 수정 요청

디버깅 코드 (Console에서 실행):
dataLayer.filter(e => e.event === 'checkout').forEach((e, i) => {
  console.log('checkout push #' + (i+1), e);
});
```

---

## 8. 시나리오 작성 지침

### 트리거 타입: CUSTOM_EVENT (dataLayer.push)

이 이벤트는 **dataLayer.push로 발생**합니다.
주문서 페이지 로드 시 프론트엔드에서 dataLayer.push를 호출하여 이벤트를 발생시킵니다.

### 시나리오에 포함할 내용
```
O 포함해야 함:
- 예상 dataLayer 구조 (dataLayer.push 코드)
- event 이름 ("checkout" → GA4에서 begin_checkout으로 매핑)
- ecommerce 객체 구조
- items 배열 내 파라미터

X 포함하지 않음:
- GTM LINK_CLICK 트리거 관련 내용
- DOM 속성에서 데이터 추출하는 방식
```

### 예상 dataLayer 구조 (시나리오에 포함)

**사이트별 event명 확인 필수**: `sites/{site}/site-config.json` → `eventMapping.begin_checkout`

```javascript
// 예시: Amoremall (event: "checkout" 또는 "cart" 등)
dataLayer.push({
  event: "checkout",  // site-config.json에서 확인, 여러 이벤트 중 하나
  ecommerce: {
    currency: "KRW",
    value: 75000,
    coupon: "WELCOME10",
    items: [{
      item_id: "SKU_12345",
      item_name: "수분 크림",
      price: 25000,
      quantity: 2
    }]
  }
});
```

### 검증 포인트
```
1. dataLayer 확인:
   - 개발자도구 Console에서 dataLayer 배열 확인
   - checkout 이벤트 객체가 push되는지 확인

2. 발생 시점 확인:
   - 주문서 페이지 로드 시 발생
   - 장바구니 → 결제, 바로구매 → 결제 모든 경로에서 발생
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

begin_checkout의 items는 **결제 대상 상품**이며, 이후 purchase와 일치해야 합니다.

| 파라미터 | 일치 대상 이벤트 | 검증 기준 |
|---------|----------------|----------|
| `items[].item_id` | view_cart, purchase | 동일 상품은 항상 동일 ID |
| `items[].item_name` | 모든 퍼널 이벤트 | 정확히 일치 |
| `items[].price` | 모든 퍼널 이벤트 | 일치 |
| `items[].quantity` | view_cart, purchase | 결제 수량과 일치 |
| `value` | purchase | 결제 금액과 일치 (할인 전) |

### 불일치 위험 케이스

| 상황 | 위험 | 검증 방법 |
|-----|------|----------|
| 부분 결제 | 장바구니 일부만 결제 | 선택 상품만 items에 포함 확인 |
| 쿠폰 적용 | value 불일치 | 쿠폰 적용 전후 value 확인 |
| 바로 구매 | 장바구니 미경유 | 상품 데이터 완전성 확인 |
| 옵션 변경 | item_variant 불일치 | 주문서에서 옵션 변경 확인 |

### 이전/이후 이벤트와 비교

| 비교 | 검증 항목 | 예상 결과 |
|-----|----------|----------|
| view_cart → begin_checkout | items | 선택 상품만 일치 |
| begin_checkout → purchase | items | 완전 일치 |
| add_to_cart → begin_checkout | item_id, item_name | 일치 |

### 검증 체크리스트
```
□ begin_checkout의 items가 결제 대상 상품과 일치
□ begin_checkout의 items가 이후 purchase와 일치
□ begin_checkout의 value가 결제 예정 금액과 일치
□ 바로 구매 시 상품 데이터가 add_to_cart와 동일
□ 쿠폰/할인 적용 시 value 반영 확인
```

---

## 10. 진입 경로별 검증

### begin_checkout 진입 가능 경로

이 이벤트는 **여러 경로에서 진입**할 수 있으며, 모든 경로에서 일관된 데이터를 수집해야 합니다.

| 진입 경로 | 특징 | 검증 포인트 |
|---------|------|-----------|
| 장바구니 → 결제 | 여러 상품 가능 | 선택 상품만 items |
| 바로 구매 | 단일 상품 | 옵션/수량 반영 |
| 원클릭 결제 | 빠른 결제 | 기본 옵션 반영 |
| 재주문 | 과거 주문 반복 | 현재 가격 반영 |

### 경로별 데이터 검증

```javascript
// 장바구니 → 결제 (2개 상품 선택)
{
  event: "checkout",
  ecommerce: {
    value: 50000,
    items: [
      { item_id: "SKU_12345", quantity: 1 },
      { item_id: "SKU_12346", quantity: 1 }
    ]
  }
}

// 바로 구매 (1개 상품)
{
  event: "checkout",
  ecommerce: {
    value: 25000,
    items: [
      { item_id: "SKU_12345", quantity: 1, item_variant: "50ml" }
    ]
  }
}
```

### 경로별 검증 체크리스트
```
□ 장바구니 → 결제: 선택 상품만 items에 포함
□ 바로 구매: 선택 옵션과 수량 정확히 반영
□ 원클릭 결제: 기본 옵션으로 정확히 반영
□ 재주문: 현재 가격으로 반영
□ 모든 경로에서 item_id, item_name 일관성 유지
```

---

## 11. 환경별 검증

> **공통 가이드 참조**: [docs/environment-validation-guide.md](../docs/environment-validation-guide.md)
>
> PC/Mobile, 로그인/비로그인 환경별 검증은 공통 가이드를 참조하세요.

### begin_checkout 특화 환경 검증

| 환경 | 특이사항 |
|-----|---------|
| Mobile | 간편결제 앱 호출 전 이벤트 발생 확인 |
| 비로그인 | 비회원 결제 지원 시 guest checkout 플로우 확인 |
| 로그인 필수 | 로그인 리다이렉션 후 결제 페이지 진입 시 발생 확인 |
