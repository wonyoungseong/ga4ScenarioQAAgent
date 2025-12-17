# purchase 이벤트 가이드

## 이벤트 정의
**구매가 완료되었을 때** 발생하는 이벤트입니다.
결제가 성공적으로 처리되어 주문이 확정된 시점을 추적합니다.
**결제 버튼 클릭이 아닌, 실제 결제 완료 후 확인 페이지에서** 발생합니다.

---

## 1. 시각적 판단 기준 (Primary - 화면에서 찾기)

### 주문 완료 페이지의 시각적 특징

#### 1) 완료 확인 메시지 영역
- **위치**: 페이지 상단 중앙
- **시각 요소**:
  - 체크마크/완료 아이콘 (녹색 또는 브랜드 컬러)
  - "주문이 완료되었습니다" 메시지
  - "Thank you for your order" 문구
  - 환영/감사 일러스트

#### 2) 주문 정보 영역
- **필수 구성 요소**:
  - **주문 번호** (강조 표시)
  - 주문 일시
  - 결제 금액
- **선택 구성 요소**:
  - 배송 예정일
  - 결제 수단 정보
  - 적립 예정 포인트

#### 3) 주문 상품 요약
- **위치**: 주문 정보 아래
- **구성**: 상품 이미지, 상품명, 수량, 금액

#### 4) CTA 버튼
- **텍스트**: "주문 내역 보기", "쇼핑 계속하기"
- **특징**: 다음 행동 유도

### 주문 완료 페이지가 아닌 화면 (시각적 구분)

| 화면 | 특징 | 해당 이벤트 |
|-----|------|--------------|
| 주문서 페이지 | 배송지/결제수단 입력 | `begin_checkout` |
| 결제 중 로딩 | 로딩 스피너, 처리 중 메시지 | 없음 |
| 결제 실패 | 에러 메시지, 재시도 버튼 | 없음 |
| 장바구니 | 상품 목록 + 결제 버튼 | `view_cart` |
| 주문 취소 완료 | 취소 확인 메시지 | `refund` |

---

## 2. GTM 트리거 조건 (검증용)

### 현재 구현된 조건
```
트리거 타입: CUSTOM_EVENT (dataLayer push)
Custom Event: [사이트별 상이 - site-config.json 참조]
발생 시점: 주문 완료 페이지 로드 시 (결제 성공 후)
```

### 사이트별 dataLayer event명 예시
| 사이트 | dataLayer event | GA4 이벤트 | 설정 파일 |
|-------|-----------------|-----------|----------|
| Amoremall | `purchase` | `purchase` | `sites/amoremall-kr/site-config.json` |
| Innisfree Shopify | `purchase` | `purchase` | `sites/innisfree-shopify/site-config.json` |

### 발생 조건
```
- 카드 결제 승인 완료 → 완료 페이지 로드
- 간편결제 승인 완료 → 리다이렉트 후 완료 페이지 로드
- 무통장입금 주문 확정 → 완료 페이지 로드
```

### dataLayer 구조

**참고**: 실제 `event` 값은 사이트마다 다릅니다. `sites/{site}/site-config.json`의 `eventMapping.purchase` 값을 확인하세요.

```javascript
// GA4 이벤트: purchase
// dataLayer event명은 사이트별 설정 참조
dataLayer.push({
  event: "[eventMapping.purchase]",  // 예: "purchase"
  ecommerce: {
    transaction_id: "ORDER_20241215_001234",  // 필수
    currency: "KRW",
    value: 67500,
    tax: 6136,
    shipping: 3000,
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
- 완료 아이콘 + 주문 번호 = **주문 완료 페이지**
- 배송지/결제수단 입력 = **주문서 페이지**
- 로딩 스피너 = **결제 처리 중**
- 에러 메시지 = **결제 실패 페이지**

### Step 2: 주문 완료 페이지 필수 요소 확인
- 완료 확인 메시지/아이콘
- 주문 번호 표시
- 결제 금액 확인
- "주문 내역 보기" 등 다음 행동 버튼

### Step 3: 트래킹 확인
- 페이지 로드 시 dataLayer에 `purchase` 이벤트 push 여부
- transaction_id 포함 여부 (필수)
- items 배열에 결제된 상품 포함 여부

### Step 4: 결과 분류

#### Case A: 주문 완료 페이지 + 트래킹 있음
→ **Should Fire**: 페이지 로드 시 이벤트 발생

#### Case B: 주문 완료 페이지 + 트래킹 없음
→ **구현 누락**: dataLayer push 코드 추가 필요 (매출 추적 불가)

#### Case C: 주문서/처리중/실패 페이지
→ **Should NOT Fire**: 결제 미완료

---

## 4. 구현 검증 포인트

### 필수 확인 사항
1. **결제 성공 후에만 발생**
   - 결제 버튼 클릭 시점이 아님
   - 결제 처리 중 페이지에서 발생하면 안 됨
   - 결제 실패 시 발생하면 안 됨

2. **필수 파라미터**
   - transaction_id: 고유 주문 번호 (필수)
   - value: 최종 결제 금액
   - items: 결제된 상품 목록

3. **단일 발생**
   - 동일 주문에 대해 한 번만 발생
   - 페이지 새로고침 시 중복 방지

### 흔한 구현 오류
| 문제 | 증상 | 해결 방법 |
|-----|------|----------|
| 중복 발생 | 새로고침 시 재발생 | 발생 여부 체크 로직 |
| transaction_id 누락 | 주문 식별 불가 | 주문 번호 필수 전달 |
| 간편결제 누락 | 외부 앱 연동 후 미발생 | 리다이렉트 후 처리 |
| **dataLayer 중복 push** | 동일 주문 purchase 2회 발생 (매출 중복) | dataLayer push 호출 지점 확인, 발생 여부 체크 로직 |

---

## 5. 수집 파라미터

> **중요: 아래 파라미터는 대표적인 예시입니다.**
>
> 실제 구현은 사이트별 GTM 설정에 따라 다릅니다.
> **시나리오 설계 시 반드시 해당 사이트의 GTM을 파싱하여 실제 파라미터를 확인**하세요.
>
> 참조: [GTM 파싱 가이드](../docs/gtm-parsing-guide.md) → "이벤트별 파라미터 추출" 섹션

### 이벤트 레벨 파라미터 (GA4 표준)

| 파라미터 | 필수 | 설명 | 예시 |
|---------|-----|------|------|
| event_category | 권장 | 이벤트 카테고리 | "ecommerce" |
| event_action | 권장 | 이벤트 액션 | "purchase" |
| transaction_id | **필수** | 주문 번호 | "ORDER_20241215_001234" |
| value | 권장 | 최종 결제 금액 | 67500 |
| currency | 권장 | 통화 | "KRW" |
| tax | 선택 | 세금 | 6136 |
| shipping | 선택 | 배송비 | 3000 |
| coupon | 선택 | 적용 쿠폰명 | "WELCOME10" |

### 사이트별 추가 파라미터 (Amoremall 예시)

| 파라미터 | 설명 | 예시 |
|---------|------|------|
| purchase_method | 결제 수단 | "CARD" / "BANK" / "KAKAO" |
| giftcard_discount | 상품권 할인 | 5000 |
| beauty_discount | 뷰티포인트 할인 | 3000 |
| coupon_discount | 쿠폰 할인 | 10000 |
| mobile_discount | 모바일 할인 | 2000 |
| member_discount | 회원 할인 | 1500 |
| total_discount | 총 할인금액 | 21500 |
| total_amount | 총 상품가 (할인 전) | 89000 |
| coupon_code | 사용 쿠폰 코드 | "SUMMER2024" |
| beauty_accumulated | 적립 뷰티포인트 | 1000 |

### items 배열 파라미터

| 파라미터 | 필수 | 설명 | 예시 |
|---------|-----|------|------|
| items[].item_id | 권장 | 상품 ID | "SKU_12345" |
| items[].item_name | 권장 | 상품명 | "수분 크림" |
| items[].item_brand | 권장 | 브랜드명 | "설화수" |
| items[].item_category | 권장 | 대분류 | "스킨케어" |
| items[].price | 권장 | 단가 | 25000 |
| items[].quantity | 권장 | 수량 | 2 |
| items[].item_variant | 선택 | 옵션 | "50ml" |
| items[].discount | 선택 | 상품별 할인 | 5000 |
| items[].original_price | 선택 | 정가 | 30000 |

---

## 6. 관련 이벤트

| 이벤트 | 발생 시점 | 구분 |
|-------|----------|------|
| `begin_checkout` | 주문서 페이지 로드 | 결제 시작 |
| `add_shipping_info` | 배송지 입력 완료 | 선택 |
| `add_payment_info` | 결제수단 선택 | 선택 |
| `purchase` | 결제 완료 | 구매 완료 |
| `refund` | 주문 취소/환불 | 취소 시 |

### 전체 구매 퍼널
```
view_item_list → select_item → view_item → add_to_cart →
view_cart → begin_checkout → purchase
```

---

## 7. 시나리오 예시

### Should Fire (결제 완료 후)
```
- 카드 결제 완료 후 주문 완료 페이지 로드
- 카카오페이/네이버페이 승인 후 완료 페이지 리다이렉트
- 무통장입금 주문 확정 후 완료 페이지 로드
- 주문 번호가 발급된 완료 화면 표시
```

### Should NOT Fire
```
- 주문서 작성 페이지 → begin_checkout
- 결제 처리 중 로딩 화면
- 카드 승인 거절 에러 페이지
- 결제 취소 완료 페이지 → refund
- 장바구니 페이지 → view_cart
- "결제하기" 버튼 클릭 시점 (결제 완료 전)
```

### 구현 필요 (Gap)
```
- 주문 완료 페이지인데 dataLayer push 없음
- transaction_id가 누락되어 주문 식별 불가
- 간편결제 앱 복귀 후 이벤트 미발생
- 새로고침 시 중복 발생하여 매출 중복 집계
- value가 할인 전 금액으로 잘못 전달
```

### 상세 시나리오 매트릭스

| 시나리오 | 진행방법 | 발생해야 하는 상황 | 발생하면 안 되는 상황 | 주요 검수 포인트 |
|---------|---------|------------------|---------------------|----------------|
| **Purchase (최종 구매)** | 최종 구매 | 1. 최종 결제 완료 후, 주문 완료(결제 성공) 페이지가 로드된 시점 2. PG사로부터 결제 성공 응답을 받은 뒤, '주문이 정상적으로 생성'되었다는 로직이 확인되는 순간 | 1. 결제 승인 실패, 카드 승인 거절 등 실제로 결제가 완료되지 않은 경우 2. 주문 완료 페이지가 아닌 중간 로딩/에러 페이지에서 발생 | 이중 호출 방지: 결제 완료 페이지 로드와 결제 완료 모달 표시 시 중복 발생 방지 |
| **Purchase (Refresh)** | Refresh | PG사로부터 결제 성공 응답을 받은 뒤, '주문이 정상적으로 생성'되었다는 로직이 확인되는 순간 | 1. 주문 완료 페이지가 아닌 중간 로딩/에러 페이지에서 발생 2. 새로고침 시 중복 발생 | 실패 케이스 관리: 결제 실패인 경우 이벤트가 발생하지 않도록 처리 확인, 비동기 처리 검증: 결제 완료 콜백과 WebView 로딩이 각각 이벤트를 호출하지 않도록 관리 |

### 시나리오별 상세 검증 항목

#### 1) Purchase (최종 구매)
```
진행 방법:
1. 주문서 작성 완료
2. 결제 수단 선택 및 결제 진행
3. 결제 승인 완료
4. 주문 완료 페이지 로드

검증 항목:
□ 최종 결제 완료 후, 주문 완료(결제 성공) 페이지가 로드된 시점에 purchase 발생
□ PG사로부터 결제 성공 응답을 받은 뒤, 주문이 정상적으로 생성되었을 때 발생
□ 결제 승인 실패, 카드 승인 거절 등 실제로 결제가 완료되지 않은 경우 미발생
□ 주문 완료 페이지가 아닌 중간 로딩/에러 페이지에서 미발생
□ 이중 호출 방지: 결제 완료 페이지 로드와 결제 완료 모달 표시 시 중복 발생 방지
□ transaction_id가 주문번호와 일치
□ value가 실제 결제 금액과 일치
□ items 배열이 결제 상품과 일치
```

#### 2) Purchase (Refresh - 새로고침)
```
진행 방법:
1. 주문 완료 페이지에서 새로고침 (F5)
2. 뒤로가기 후 다시 완료 페이지 접근
3. 완료 페이지 URL 직접 접근

검증 항목:
□ PG사로부터 결제 성공 응답을 받은 뒤, 주문이 정상적으로 생성되었을 때만 발생
□ 주문 완료 페이지가 아닌 중간 로딩/에러 페이지에서 미발생
□ 새로고침 시 중복 발생 방지
□ 실패 케이스 관리: 결제 실패인 경우 이벤트가 발생하지 않도록 처리 확인
□ 비동기 처리 검증: 결제 완료 콜백과 WebView 로딩이 각각 이벤트를 호출하지 않도록 관리
□ 동일 transaction_id로 재방문 시 미발생
□ 다른 주문 완료 시에는 정상 발생
```

#### 3) dataLayer 중복 push로 인한 중복 발생 (주의 케이스)
```
발생 상황:
- 주문 완료 페이지 로드 시 purchase 이벤트가 2회 이상 발생
- 동일한 주문인데 이벤트가 중복으로 수집됨 (매출 중복 집계)

원인 분석 방법:
1. 개발자 도구 Console에서 dataLayer 확인
2. dataLayer.filter(e => e.event === 'purchase') 실행
3. purchase 이벤트가 몇 번 push되었는지 확인
4. 각 이벤트의 transaction_id 비교

일반적인 중복 push 원인:
□ 프론트엔드 코드에서 dataLayer.push가 2회 호출됨
□ 결제 완료 콜백과 페이지 로드 이벤트에서 각각 push
□ PG사 콜백과 리다이렉트 페이지에서 각각 push
□ GTM 태그 설정에서 중복 트리거 적용
□ 간편결제 앱 복귀 후 중복 push

검증 항목:
□ dataLayer에서 purchase 이벤트 push 횟수 확인 (1회만 되어야 함)
□ 중복 발생 시 두 이벤트의 transaction_id가 동일한지 비교
□ 발생 시점(timestamp) 확인하여 어느 지점에서 중복되는지 분석
□ 개발팀에 중복 push 지점 수정 요청 (매출 중복 집계 위험)

디버깅 코드 (Console에서 실행):
dataLayer.filter(e => e.event === 'purchase').forEach((e, i) => {
  console.log('purchase push #' + (i+1), e?.ecommerce?.transaction_id, e);
});
```

---

## 8. 결제 수단별 고려사항

| 결제 수단 | 발생 시점 | 주의사항 |
|---------|---------|---------|
| 신용카드 | 카드 승인 완료 후 | 승인 거절 시 미발생 |
| 간편결제 | 앱에서 승인 후 리다이렉트 시 | 외부 앱 연동 처리 필요 |
| 무통장입금 | 주문 확정 후 | 입금 전이라도 발생 |
| 휴대폰결제 | SMS 인증 완료 후 | 인증 실패 시 미발생 |

---

## 9. 시나리오 작성 지침

### 트리거 타입: CUSTOM_EVENT (dataLayer.push)

이 이벤트는 **dataLayer.push로 발생**합니다.
주문 완료 페이지 로드 시 프론트엔드에서 dataLayer.push를 호출하여 이벤트를 발생시킵니다.

### 시나리오에 포함할 내용
```
O 포함해야 함:
- 예상 dataLayer 구조 (dataLayer.push 코드)
- event 이름 (purchase)
- transaction_id (필수 파라미터)
- ecommerce 객체 구조
- items 배열 내 파라미터

X 포함하지 않음:
- GTM LINK_CLICK 트리거 관련 내용
- DOM 속성에서 데이터 추출하는 방식
```

### 예상 dataLayer 구조 (시나리오에 포함)
```javascript
dataLayer.push({
  event: "purchase",
  ecommerce: {
    transaction_id: "ORDER_20241215_001234",
    currency: "KRW",
    value: 67500,
    tax: 6136,
    shipping: 3000,
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
   - purchase 이벤트 객체가 push되는지 확인

2. 필수 파라미터 확인:
   - transaction_id 필수 포함 (주문 번호)
   - 결제 완료 후에만 발생

3. 중복 방지 확인:
   - 페이지 새로고침 시 중복 발생 방지
```

---

## 10. 퍼널 데이터 일관성 검증

### 이 이벤트의 퍼널 위치
```
select_item → view_item → add_to_cart → view_cart → begin_checkout → purchase
                                                                        ↑
                                                                    현재 위치 (퍼널 종료)
```

### 일관성 검증 항목

purchase는 **퍼널의 종료점**으로, 이전 모든 이벤트의 상품 데이터와 일관성을 유지해야 합니다.

| 파라미터 | 일치 대상 이벤트 | 검증 기준 |
|---------|----------------|----------|
| `items[].item_id` | 모든 이전 이벤트 | 동일 상품은 항상 동일 ID |
| `items[].item_name` | 모든 이전 이벤트 | 정확히 일치 |
| `items[].item_brand` | 모든 이전 이벤트 | 정확히 일치 |
| `items[].item_category` | 모든 이전 이벤트 | 정확히 일치 |
| `items[].price` | 모든 이전 이벤트 | 일치 (할인 전 단가) |
| `items[].quantity` | begin_checkout | 결제된 수량 |
| `value` | begin_checkout | 최종 결제 금액 |

### 전체 퍼널 일관성 매트릭스

**동일 상품(SKU_12345)의 퍼널 전체 데이터**:

```javascript
// select_item
{ item_id: "SKU_12345", item_name: "수분 크림", price: 25000 }

// view_item
{ item_id: "SKU_12345", item_name: "수분 크림", price: 25000, item_brand: "설화수" }

// add_to_cart
{ item_id: "SKU_12345", item_name: "수분 크림", price: 25000, quantity: 2 }

// view_cart
{ item_id: "SKU_12345", item_name: "수분 크림", price: 25000, quantity: 2 }

// begin_checkout
{ item_id: "SKU_12345", item_name: "수분 크림", price: 25000, quantity: 2 }

// purchase (최종)
{ item_id: "SKU_12345", item_name: "수분 크림", price: 25000, quantity: 2 }
```

**모든 이벤트에서 item_id, item_name, price가 일치해야 함**

### 불일치 위험 케이스

| 상황 | 위험 | 검증 방법 |
|-----|------|----------|
| 결제 중 가격 변동 | price 불일치 | begin_checkout과 비교 |
| 결제 중 수량 변경 | quantity 불일치 | begin_checkout과 비교 |
| 쿠폰/포인트 적용 | value 불일치 | 최종 결제 금액 확인 |
| 부분 결제 취소 | items 불일치 | 실제 결제 상품만 포함 확인 |

### 검증 체크리스트
```
□ purchase의 items가 begin_checkout과 완전 일치
□ purchase의 각 item_id가 전체 퍼널에서 일관됨
□ purchase의 각 item_name이 전체 퍼널에서 일관됨
□ purchase의 value가 실제 결제 금액과 일치
□ purchase의 transaction_id가 고유하고 유효함
```

---

## 11. 결제 수단별 일관성 검증

### 결제 수단에 따른 데이터 검증

| 결제 수단 | 위험 요소 | 검증 포인트 |
|---------|----------|-----------|
| 카드 결제 | 즉시 완료 | 표준 검증 |
| 간편결제 | 외부 앱 리다이렉트 | 복귀 후 데이터 유지 확인 |
| 무통장입금 | 주문만 확정 | 입금 전 발생 확인 |
| 분할 결제 | 여러 수단 조합 | value 합산 확인 |

### 간편결제 특수 케이스

```
사이트 → 카카오페이 앱 → 사이트 (주문완료)
         ↓
   데이터 유실 위험
```

### 결제 수단별 검증 체크리스트
```
□ 카드 결제: 승인 완료 후 정상 발생
□ 간편결제: 앱 복귀 후 데이터 유지 확인
□ 무통장입금: 주문 확정 시점에 발생
□ 복합 결제: 최종 결제 금액으로 value 반영
```

---

## 12. 중복 발생 방지 검증

### 중복 발생 시나리오

| 상황 | 위험 | 검증 방법 |
|-----|------|----------|
| 완료 페이지 새로고침 | 매출 중복 | 새로고침 테스트 |
| 뒤로가기 후 다시 진입 | 매출 중복 | 히스토리 네비게이션 |
| 동일 주문번호 재방문 | 매출 중복 | URL 직접 접근 |

### 중복 방지 구현 확인

```javascript
// 중복 방지 로직 예시
if (!sessionStorage.getItem('purchase_' + transaction_id)) {
  dataLayer.push({ event: 'purchase', ... });
  sessionStorage.setItem('purchase_' + transaction_id, 'true');
}
```

### 중복 방지 검증 체크리스트
```
□ 완료 페이지 새로고침 시 purchase 미발생
□ 뒤로가기 후 재진입 시 purchase 미발생
□ 동일 transaction_id로 재방문 시 purchase 미발생
□ 다른 주문 완료 시 정상 발생 확인
```

---

## 13. 환경별 검증

> **공통 가이드 참조**: [docs/environment-validation-guide.md](../docs/environment-validation-guide.md)
>
> PC/Mobile, 로그인/비로그인 환경별 검증은 공통 가이드를 참조하세요.

### purchase 특화 환경 검증

| 환경 | 특이사항 |
|-----|---------|
| Mobile 간편결제 | 외부 앱(카카오페이, 네이버페이) 결제 후 복귀 시 데이터 유지 |
| Mobile 웹뷰 | 앱 내 결제 완료 후 웹뷰에서 이벤트 발생 확인 |
| 로그인 필수 | user_id가 반드시 포함되어야 함 |
| 비회원 결제 | guest checkout 시 user_id 없이 발생 (사이트 정책에 따라) |
