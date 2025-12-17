# select_item 이벤트 가이드

## 이벤트 정의
**상품 리스트에서 상품을 클릭했을 때** 발생하는 이벤트입니다.
제품 목록(PLP)에서 특정 제품을 클릭하여 상세 페이지로 이동하려는 행동을 추적합니다.

---

## 1. 시각적 판단 기준 (Primary - 화면에서 찾기)

### 상품 영역의 시각적 특징

#### 1) 상품 카드 (Product Card)
- **형태**: 직사각형/정사각형 카드 형태
- **레이아웃**: 그리드(2열, 3열, 4열) 또는 리스트 배열
- **필수 구성 요소**:
  - 상품 이미지 (제품 사진)
  - 상품명 텍스트
  - 가격 정보 (정가/할인가)
- **선택 구성 요소**:
  - 브랜드명
  - 할인율 뱃지 ("20% OFF", "SALE")
  - 별점/리뷰 수
  - 장바구니/찜하기 아이콘

#### 2) 상품 리스트 영역
- **위치**: 카테고리 페이지, 검색 결과, 베스트/추천 섹션
- **특징**:
  - 동일한 크기의 카드가 반복
  - 필터/정렬 옵션이 상단에 위치
  - 페이지네이션 또는 무한 스크롤

#### 3) 추천 상품 섹션
- **위치**: 메인 페이지, 상품 상세 페이지 하단
- **제목 예시**: "추천 상품", "베스트", "함께 구매하면 좋은 상품"
- **형태**: 가로 스크롤 또는 그리드

### 상품이 아닌 영역 (시각적 구분)

| 영역 | 특징 | 해당 이벤트 |
|-----|------|-----------|
| 히어로 배너 | 전체 너비, 대형 이미지, 마케팅 문구 | `select_promotion` |
| 프로모션 카드 | 제품보다 큰 크기, 캠페인 비주얼 | `select_promotion` |
| 네비게이션 | 메뉴, 카테고리 링크 | 없음 |
| 장바구니 버튼 | "담기", 카트 아이콘 | `add_to_cart` |

---

## 2. GTM 트리거 조건 (검증용)

### 현재 구현된 조건
```
트리거 타입: LINK_CLICK (링크 클릭) 또는 CLICK
CSS Selector: [사이트별 상이 - site-config.json 참조]
이벤트 발생: 상품 링크 클릭 시 GTM이 자동으로 GA4 이벤트 전송
```

**중요**: dataLayer.push로 이벤트를 발생시키는 것이 아니라,
GTM의 LINK_CLICK 트리거가 요소 클릭을 감지하여 이벤트를 발생시킵니다.

### 사이트별 CSS Selector 예시
| 사이트 | CSS Selector | DOM 속성 | 설정 파일 |
|-------|--------------|----------|----------|
| Amoremall | `a[ap-click-area]` | `ap-click-data` | `sites/amoremall-kr/site-config.json` |
| Innisfree Shopify | `a[data-product]` | `data-product` | `sites/innisfree-shopify/site-config.json` |

**참고**: 실제 CSS Selector와 DOM 속성은 사이트마다 다릅니다. `sites/{site}/site-config.json`의 `domAttributes.selectItem` 값을 확인하세요.

### DOM 속성 구조
```html
<!-- Amoremall 방식 -->
<a href="/product/123" ap-click-area="product" ap-click-data='{"item_id":"SKU123","item_name":"상품명"}'>
  <img src="product.jpg" />
  <span>상품명</span>
  <span>25,000원</span>
</a>

<!-- Shopify 방식 -->
<a href="/product/detail/SKU123" data-product='{"id":"SKU123","name":"상품명"}'>
  ...
</a>
```

### GTM 변수 구조
```
변수명: [사이트별 상이]
타입: Custom JavaScript Variable
역할: 클릭된 상품 요소에서 상품 정보 추출하여 GA4 파라미터로 전달
```

---

## 3. 분석 판단 프로세스

### Step 1: 시각적으로 상품 영역 식별
화면에서 다음 특징을 가진 영역을 찾습니다:
- 상품 이미지 + 상품명 + 가격 조합
- 반복되는 카드 패턴
- 그리드/리스트 레이아웃

### Step 2: 프로모션과 구분
다음 기준으로 구분합니다:
- **상품**: 가격 정보 있음, 개별 제품 사진
- **프로모션**: 마케팅 문구, 캠페인 비주얼, 대형 배너

### Step 3: DOM에서 트래킹 확인
- 상품 링크에 트래킹 속성 또는 이벤트 핸들러 존재 여부
- `ap-data-item` 또는 유사 속성 확인

### Step 4: 결과 분류

#### Case A: 상품 카드 + 트래킹 있음
→ **Should Fire**: 이벤트 발생해야 함

#### Case B: 상품 카드 + 트래킹 없음
→ **구현 누락**: 트래킹 코드 추가 필요

#### Case C: 프로모션 영역
→ **Should NOT Fire**: `select_promotion` 이벤트 대상

---

## 4. 구현 검증 포인트

### 필수 확인 사항
1. **상품 카드 클릭 트래킹**
   - 카테고리 페이지 상품 목록
   - 검색 결과 상품 목록
   - 추천 상품 섹션

2. **수집 데이터 유효성**
   - item_id: 상품 고유 ID
   - item_name: 상품명
   - price: 가격

3. **클릭 영역**
   - 상품 카드 전체가 클릭 가능
   - 이미지, 상품명, 가격 모두 클릭 시 이벤트 발생

### 흔한 구현 오류
| 문제 | 증상 | 해결 방법 |
|-----|------|----------|
| 이미지만 클릭 가능 | 상품명 클릭 시 이벤트 없음 | 카드 전체 링크 처리 |
| 추천 섹션 누락 | 메인 페이지 베스트 상품 트래킹 없음 | 모든 상품 리스트에 적용 |
| item_id 누락 | 상품 식별 불가 | 데이터 속성 추가 |

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
| event_action | (하드코딩) | "select item" |
| event_label | `{{JS - Select Item Event Label}}` | 상품명 등 |
| currency | `{{JS - Currency}}` | 통화 코드 |
| items | `{{JS - Select Item DataLayer}}` | 상품 배열 (**dataLayer variable에서 확인**) |

> 💡 **items 확인 방법**: GTM 변수 `{{JS - Select Item DataLayer}}`의 정의를 확인하면 items 배열의 구조를 파악할 수 있습니다.
> dataLayer에서 직접 확인: `dataLayer.filter(e => e.ecommerce?.items)`

### 이벤트 레벨 파라미터

| 파라미터 | 설명 | 예시 |
|---------|------|------|
| event_category | 이벤트 카테고리 | "ecommerce" |
| event_action | 이벤트 액션 | "select item" |
| event_label | 이벤트 라벨 | 상품명 등 |
| currency | 통화 | "KRW" |
| items | 상품 배열 | [{...}] |

### items 배열 파라미터

| 파라미터 | 설명 | 예시 | 필수 |
|---------|------|------|-----|
| item_id | 상품 고유 ID | "SKU_12345" | O |
| item_name | 상품명 | "수분 크림" | O |
| item_brand | 브랜드명 | "설화수" | O |
| item_category | 대분류 | "스킨케어" | O |
| item_category2~5 | 중/소분류 | "크림" | △ |
| price | 가격 | 25000 | O |
| discount | 할인금액 | 5000 | △ |
| index | 리스트 내 위치 | 0 | △ |
| item_list_name | 목록명 | "검색결과" | △ |

---

## 6. 관련 이벤트

| 이벤트 | 발생 시점 | 구분 |
|-------|----------|------|
| `select_item` | 상품 클릭 | 리스트에서 상품 선택 |
| `view_item` | 상품 상세 페이지 로드 | 상세 정보 조회 |
| `view_item_list` | 상품 목록 페이지 로드 | 리스트 노출 |
| `add_to_cart` | 장바구니 담기 클릭 | 구매 의도 |

---

## 7. 시나리오 예시

### Should Fire (정상 발생)
```
- 카테고리 페이지에서 상품 카드 클릭
- 검색 결과에서 상품 이미지 클릭
- "베스트 상품" 섹션에서 상품 클릭
- 상품 상세 페이지의 "추천 상품" 클릭
```

### Should NOT Fire (발생 안 함)
```
- 히어로 배너 클릭 → select_promotion
- 기획전 배너 클릭 → select_promotion
- 장바구니 담기 버튼 클릭 → add_to_cart
- 카테고리 메뉴 클릭
- 필터/정렬 옵션 클릭
```

### 구현 필요 (Gap)
```
- 상품 카드처럼 보이지만 트래킹 속성 없음
- "NEW" 섹션 상품 클릭 시 이벤트 미발생
- 모바일에서만 트래킹 누락
```

### 상세 시나리오 매트릭스

| 시나리오 | 진행방법 | 발생해야 하는 상황 | 발생하면 안 되는 상황 | 주요 검수 포인트 |
|---------|---------|------------------|---------------------|----------------|
| **상품 선택** | 검색 결과 페이지에서 제품 선택 | 사용자가 검색 결과나 상품 목록에서 특정 상품을 클릭하고 해당 상품 상세 페이지로 넘어갈 때 | 상품 이미지 또는 링크 클릭이 아닌 다른 영역 클릭 시 이벤트가 발생하는 경우 | 클릭 대상의 정확성 확인, 클릭 이벤트의 정확한 트리거링 |

### 시나리오별 상세 검증 항목

#### 1) 상품 선택
```
진행 방법:
1. 검색 결과 또는 상품 목록 페이지 접근
2. 상품 카드(이미지, 상품명 등) 클릭
3. 상품 상세 페이지로 이동 확인
4. dataLayer에서 select_item 이벤트 확인

검증 항목:
□ 검색 결과나 상품 목록에서 특정 상품 클릭 시 select_item 발생
□ 상품 상세 페이지로 넘어갈 때 이벤트 발생
□ 상품 이미지/링크가 아닌 다른 영역 클릭 시 미발생
□ 클릭 대상의 정확성 확인 (상품 카드 영역 내)
□ 클릭 이벤트의 정확한 트리거링 확인
□ item_id, item_name 등 상품 정보가 정확히 전달되는지 확인
□ item_list_name이 어떤 목록에서 클릭했는지 식별 가능하도록 설정
□ index 값이 목록 내 상품 위치와 일치하는지 확인
```

---

## 8. 시나리오 작성 지침

### 트리거 타입: LINK_CLICK (DOM 요소 클릭 감지) - 추정

이 이벤트는 select_promotion과 유사하게 **DOM 요소 클릭을 감지하는 방식**일 가능성이 높습니다.
실제 GTM 설정을 확인하여 트리거 타입을 검증해야 합니다.

### LINK_CLICK 방식인 경우 시나리오에 포함할 내용
```
O 포함해야 함:
- GTM 트리거 조건 (CSS Selector)
- DOM 속성 구조 (ap-data-item 등)
- GTM 변수명과 역할
- 변수가 반환하는 데이터 구조
- 파라미터 매핑

X 포함하지 않음:
- "예상 dataLayer 구조" 섹션
- dataLayer.push({ event: "select_item", ... }) 형태의 코드
```

### 검증 포인트
```
1. GTM 트리거 타입 확인:
   - LINK_CLICK인지 CUSTOM_EVENT인지 확인
   - 트리거의 CSS Selector 또는 Custom Event 이름 확인

2. DOM 요소 확인:
   - <a> 태그에 ap-data-item 또는 유사 속성 존재 여부
   - 속성값의 JSON 유효성
```

### 참고
실제 GTM 설정에서 트리거 타입 확인 후 이 가이드 업데이트 필요

---

## 9. 퍼널 데이터 일관성 검증

### 이 이벤트의 퍼널 위치
```
select_item → view_item → add_to_cart → view_cart → begin_checkout → purchase
     ↑
 현재 위치 (퍼널 시작점)
```

### 일관성 검증 항목

select_item은 **퍼널의 시작점**으로, 이후 모든 이벤트의 기준 데이터가 됩니다.

| 파라미터 | 일치 대상 이벤트 | 검증 기준 |
|---------|----------------|----------|
| `item_id` | view_item, add_to_cart, view_cart, begin_checkout, purchase | 동일 상품은 항상 동일 ID |
| `item_name` | 모든 퍼널 이벤트 | 정확히 일치 |
| `item_brand` | 모든 퍼널 이벤트 | 정확히 일치 |
| `item_category` | 모든 퍼널 이벤트 | 정확히 일치 |
| `price` | 모든 퍼널 이벤트 | 할인/쿠폰 적용 전 단가 |

### 불일치 위험 케이스

| 상황 | 위험 | 검증 방법 |
|-----|------|----------|
| 목록 페이지 축약 정보 | item_brand, item_category 누락 | 상세 페이지와 비교 |
| 호버 시 표시 가격 | 캐시된 가격 사용 | view_item과 price 비교 |
| 다국어 사이트 | 언어별 item_name 불일치 | 동일 상품 언어별 확인 |
| 검색 결과 | 검색 인덱스 데이터 사용 | 실제 상품 데이터와 비교 |

### 검증 체크리스트
```
□ select_item의 item_id가 이후 view_item과 일치
□ select_item의 item_name이 view_item과 일치
□ select_item의 price가 view_item과 일치
□ 카테고리 페이지/검색 결과 등 모든 목록에서 동일 상품은 동일 데이터
```

---

## 10. 발생 페이지별 검증

### select_item 발생 가능 페이지

이 이벤트는 **상품 목록이 있는 모든 페이지**에서 발생할 수 있습니다.

| 페이지 | 트리거 UI | 특징 |
|-------|----------|------|
| 카테고리 페이지 | 상품 카드 클릭 | 메인 발생 페이지 |
| 검색 결과 페이지 | 상품 카드 클릭 | 검색 인덱스 데이터 |
| 메인 페이지 | 추천/베스트 상품 클릭 | 섹션별 상품 |
| 상품 상세 페이지 | 관련/추천 상품 클릭 | 하단 추천 영역 |
| 기획전 페이지 | 기획전 상품 클릭 | 이벤트 상품 |

### 페이지별 일관성 검증

**동일 상품(SKU_12345)을 각 페이지에서 클릭했을 때**:

```javascript
// 모든 페이지에서 동일한 데이터가 수집되어야 함
{
  item_id: "SKU_12345",      // 모든 페이지에서 동일
  item_name: "수분 크림",    // 모든 페이지에서 동일
  item_brand: "설화수",      // 모든 페이지에서 동일
  item_category: "스킨케어", // 모든 페이지에서 동일
  price: 25000              // 모든 페이지에서 동일
}
```

### 크로스페이지 검증 체크리스트
```
□ 카테고리 페이지에서 클릭: 기준 데이터로 활용
□ 검색 결과에서 클릭: 동일 상품 데이터 일치 확인
□ 메인 페이지 추천 상품 클릭: 동일 상품 데이터 일치 확인
□ 상품 상세 하단 추천에서 클릭: 동일 상품 데이터 일치 확인
□ 모든 페이지의 item_id, item_name, price 일치 여부
```

---

## 11. 환경별 검증

> **공통 가이드 참조**: [docs/environment-validation-guide.md](../docs/environment-validation-guide.md)
>
> PC/Mobile, 로그인/비로그인 환경별 검증은 공통 가이드를 참조하세요.

### select_item 특화 환경 검증

| 환경 | 특이사항 |
|-----|---------|
| PC 호버 | 호버 vs 클릭 구분 - 호버만으로 이벤트 미발생 |
| Mobile | 탭 vs 스와이프 구분 - 스와이프는 슬라이드용, 탭만 이벤트 발생 |
| 터치 디바이스 | 롱프레스 시 이벤트 미발생 (컨텍스트 메뉴만) |

---

## 12. 이벤트 버블링 위험

### 버블링 발생 시나리오

이 이벤트는 **LINK_CLICK 트리거**를 사용하므로, 중첩된 DOM 구조에서 버블링 이슈가 발생할 수 있습니다.

```html
<!-- 중첩 구조 예시 -->
<a href="/product/123" class="product-card" ap-click-area="product">
  <img src="product.jpg" />
  <div class="info">
    <span class="name">상품명</span>
    <span class="price">25,000원</span>
  </div>
  <button class="quick-cart">담기</button>  <!-- 중첩된 버튼 -->
</a>
```

### 버블링 위험 케이스

| 상황 | 위험 | 검증 방법 |
|-----|------|----------|
| 퀵 카트 버튼 클릭 | select_item + add_to_cart 동시 발생 | 담기 클릭 시 이벤트 확인 |
| 찜하기 버튼 클릭 | select_item + add_to_wishlist 동시 발생 | 하트 클릭 시 이벤트 확인 |
| 이미지 영역 클릭 | 정상 발생 확인 | 이미지만 클릭 테스트 |
| 텍스트 영역 클릭 | 정상 발생 확인 | 상품명만 클릭 테스트 |

### 중첩 요소 클릭 시 예상 결과

| 클릭 위치 | 예상 결과 | 위험 |
|---------|----------|------|
| 상품 이미지 | select_item 1회 | 정상 |
| 상품명 텍스트 | select_item 1회 | 정상 |
| 퀵 카트 버튼 | add_to_cart만 (select_item X) | select_item 동시 발생 위험 |
| 찜하기 하트 | add_to_wishlist만 (select_item X) | select_item 동시 발생 위험 |

### 버블링 방지 확인 사항

```javascript
// GTM CSS Selector가 자식 요소를 제외하는지 확인
// Good: a[ap-click-area="product"]:not(:has(button))
// Risk: a[ap-click-area="product"], a[ap-click-area="product"] *
```

### 버블링 검증 체크리스트
```
□ 상품 이미지 클릭 시 select_item 1회만 발생
□ 상품명 클릭 시 select_item 1회만 발생
□ 퀵 카트 버튼 클릭 시 select_item 미발생 (add_to_cart만)
□ 찜하기 버튼 클릭 시 select_item 미발생
□ 상품 카드 빈 영역 클릭 시 select_item 1회만 발생
□ 빠른 연속 클릭 시 중복 발생 방지
```
