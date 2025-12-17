# view_item_list 이벤트 가이드

## 이벤트 정의
**상품 리스트가 로드되었을 때** 발생하는 이벤트입니다.
카테고리 페이지, 검색 결과 페이지 등에서 상품 목록이 표시될 때 추적합니다.
**클릭이 아닌 페이지 로드 시 자동 발생**합니다.

---

## 1. 시각적 판단 기준 (Primary - 화면에서 찾기)

### 상품 목록 페이지(PLP)의 시각적 특징

#### 1) 그리드 레이아웃
- **형태**: 상품 카드가 2열, 3열, 4열 등으로 배열
- **특징**:
  - 동일한 크기의 상품 카드 반복
  - 각 카드에 이미지 + 상품명 + 가격
  - 일정한 간격과 정렬

#### 2) 필터/정렬 영역
- **위치**: 상품 목록 상단
- **구성 요소**:
  - 정렬 옵션 (가격순, 인기순, 신상품순)
  - 필터 옵션 (카테고리, 가격대, 브랜드)
  - 상품 개수 표시 ("총 120개 상품")

#### 3) 페이지 식별 요소
- **브레드크럼**: 카테고리 경로 표시 (홈 > 스킨케어 > 크림)
- **타이틀**: 카테고리명 또는 검색어
- **페이지네이션**: 페이지 번호 또는 "더보기" 버튼

#### 4) 검색 결과 페이지
- **특징**:
  - 검색어 표시 ("'수분 크림' 검색 결과")
  - 검색 결과 개수
  - 연관 검색어/추천 검색어

### 상품 목록 페이지가 아닌 화면 (시각적 구분)

| 화면 | 특징 | 해당 이벤트 |
|-----|------|--------------|
| 상품 상세 (PDP) | 단일 상품 대형 이미지 + 상세 정보 | `view_item` |
| 메인/홈 페이지 | 히어로 배너 + 여러 섹션 | 별도 이벤트 |
| 장바구니 | 담긴 상품 + 결제 버튼 | `view_cart` |
| 결제 페이지 | 주문서 양식 | `begin_checkout` |
| 마이페이지 | 주문 내역, 위시리스트 | 별도 이벤트 |

---

## 2. GTM 트리거 조건 (검증용)

### 현재 구현된 조건
```
트리거 타입: CUSTOM_EVENT (dataLayer push)
Custom Event: [사이트별 상이 - site-config.json 참조]
발생 시점: 페이지 로드 완료 시
```

### 사이트별 dataLayer event명 예시
| 사이트 | dataLayer event | GA4 이벤트 | 설정 파일 |
|-------|-----------------|-----------|----------|
| Amoremall | `view_item_list` | `view_item_list` | `sites/amoremall-kr/site-config.json` |
| Innisfree Shopify | `ap_search` | `view_item_list` | `sites/innisfree-shopify/site-config.json` |

### 발생 조건
```
- 카테고리 페이지 로드
- 검색 결과 페이지 로드
- 무한 스크롤로 추가 상품 로드 시
- 필터 적용 후 상품 목록 갱신 시
```

### dataLayer 구조

**참고**: 실제 `event` 값은 사이트마다 다릅니다. `sites/{site}/site-config.json`의 `eventMapping.view_item_list` 값을 확인하세요.

```javascript
// GA4 이벤트: view_item_list
// dataLayer event명은 사이트별 설정 참조
dataLayer.push({
  event: "[eventMapping.view_item_list]",  // 예: "view_item_list", "ap_search"
  ecommerce: {
    item_list_id: "category_skincare_cream",
    item_list_name: "스킨케어 > 크림",
    items: [
      { item_id: "SKU_12345", item_name: "수분 크림", price: 25000, index: 0 },
      { item_id: "SKU_12346", item_name: "영양 크림", price: 35000, index: 1 }
    ]
  }
});
```

---

## 3. 분석 판단 프로세스

### Step 1: 페이지 타입 식별
화면의 구조를 분석합니다:
- 상품 카드 그리드 레이아웃 = **상품 목록 페이지**
- 단일 상품 상세 정보 = **상품 상세 페이지**
- 프로모션 배너 위주 = **메인 페이지**

### Step 2: PLP 필수 요소 확인
- 그리드 형태의 상품 카드
- 필터/정렬 UI
- 브레드크럼 또는 카테고리 타이틀

### Step 3: 트래킹 확인
- 페이지 로드 시 dataLayer에 `view_item_list` push 여부
- items 배열에 노출된 상품 정보 포함 여부

### Step 4: 결과 분류

#### Case A: PLP + 트래킹 있음
→ **Should Fire**: 페이지 로드 시 이벤트 발생

#### Case B: PLP + 트래킹 없음
→ **구현 누락**: dataLayer push 코드 추가 필요

#### Case C: 메인/상세/장바구니 페이지
→ **Should NOT Fire**: 다른 이벤트 대상

---

## 4. 구현 검증 포인트

### 필수 확인 사항
1. **모든 상품 목록 페이지에서 발생**
   - 카테고리 페이지
   - 검색 결과 페이지
   - 브랜드 페이지
   - 기획전/컬렉션 페이지

2. **무한 스크롤/페이지네이션**
   - 추가 로드 시 신규 상품만 포함하여 재발생
   - 필터 적용 시 필터된 상품으로 재발생

3. **필수 파라미터**
   - item_list_id 또는 item_list_name
   - items 배열에 노출 상품

### 흔한 구현 오류
| 문제 | 증상 | 해결 방법 |
|-----|------|----------|
| 검색 결과 누락 | 검색 페이지에서 미발생 | 검색 결과에도 적용 |
| 무한 스크롤 누락 | 추가 로드 시 미발생 | 로드 콜백에서 push |
| items 누락 | 빈 배열 전송 | 상품 정보 수집 확인 |
| **dataLayer 중복 push** | 동일 페이지 view_item_list 2회 발생 | dataLayer push 호출 지점 확인 |
| **items 개수 불일치** | 화면 노출 상품 수와 items 배열 길이 불일치 | items 배열 생성 로직 확인 |
| **item_id/item_name 불일치** | 화면 상품과 이벤트 데이터 불일치 | 상품 데이터 매핑 확인 |
| **search_result 값 오류** | 검색 결과 유무와 Y/N 값 불일치 | 조건문 로직 확인 |

---

## 4-1. 파라미터 검수 (데이터 정합성)

### 핵심 검증 항목

view_item_list 이벤트의 데이터가 **화면에 실제로 노출된 상품 정보와 일치**하는지 검증합니다.

#### 1) 상품 개수 일치 검증

```
검증 대상:
- 화면에 노출된 상품 개수
- items 배열의 길이 (items.length)

검증 방법:
1. 화면에서 "총 N개 상품" 또는 상품 카드 개수 확인
2. dataLayer에서 items 배열 길이 확인
3. 두 값이 일치하는지 비교

디버깅 코드:
// items 개수 확인
const event = dataLayer.filter(e => e.event === 'view_item_list').pop();
const itemCount = event?.ecommerce?.items?.length || 0;
console.log('items 배열 개수:', itemCount);
console.log('화면 노출 상품 수와 비교하세요');

주의사항:
□ 페이지네이션의 경우: 현재 페이지 상품 수만 포함
□ 무한 스크롤의 경우: 현재까지 로드된 상품 수 또는 새로 로드된 상품만 포함
□ "더보기" 전: 초기 노출 상품만 포함
```

#### 2) 상품 정보 일치 검증 (item_id, item_name)

```
검증 대상:
- 화면에 노출된 각 상품의 상품 코드(SKU)
- 화면에 노출된 각 상품의 상품명
- items 배열 내 item_id, item_name

검증 방법:
1. 화면에서 첫 번째 상품의 상품명 확인
2. dataLayer items[0].item_name과 비교
3. 마지막 상품도 동일하게 확인
4. 상품 코드(item_id)가 실제 SKU와 일치하는지 확인

디버깅 코드:
// 상품 정보 확인
const event = dataLayer.filter(e => e.event === 'view_item_list').pop();
const items = event?.ecommerce?.items || [];

console.log('=== 상품 정보 검증 ===');
items.forEach((item, idx) => {
  console.log(
    'index:', idx,
    '| item_id:', item.item_id,
    '| item_name:', item.item_name,
    '| price:', item.price
  );
});

체크리스트:
□ items[0]이 화면 첫 번째 상품과 일치
□ items[마지막]이 화면 마지막 상품과 일치
□ item_id가 실제 상품 SKU/코드와 일치
□ item_name이 화면에 표시된 상품명과 일치
□ 상품 순서(index)가 화면 노출 순서와 일치
```

#### 3) 상품 목록 순서 검증

```
검증 대상:
- 화면 노출 순서
- items 배열의 index 값

검증 방법:
1. 화면에서 상품 노출 순서 확인 (좌→우, 위→아래)
2. items 배열의 index가 0부터 순차적으로 할당되었는지 확인
3. index 순서가 화면 노출 순서와 일치하는지 확인

디버깅 코드:
// index 순서 확인
const event = dataLayer.filter(e => e.event === 'view_item_list').pop();
const items = event?.ecommerce?.items || [];

const indices = items.map(i => i.index);
console.log('index 값 목록:', indices);

// 순차적인지 확인
const isSequential = indices.every((val, idx) => val === idx);
console.log('순차적 index:', isSequential ? '✅ 정상' : '❌ 비정상');
```

#### 4) search_result 파라미터 검증 (검색 결과 페이지)

```
검증 대상:
- 검색 결과 유무
- search_result 파라미터 값 (Y/N)

값 정의:
| 상황 | search_result 값 |
|-----|-----------------|
| 검색 결과 있음 (1개 이상) | "Y" |
| 검색 결과 없음 (0개) | "N" |

검증 방법:
1. 검색 실행
2. 검색 결과 개수 확인 (화면)
3. dataLayer에서 search_result 값 확인
4. 결과 유무와 Y/N 값 일치 여부 확인

디버깅 코드:
// search_result 검증
const event = dataLayer.filter(e => e.event === 'view_item_list').pop();
const searchResult = event?.search_result;
const itemCount = event?.ecommerce?.items?.length || 0;

console.log('=== search_result 검증 ===');
console.log('items 개수:', itemCount);
console.log('search_result:', searchResult);

const expected = itemCount > 0 ? 'Y' : 'N';
const isCorrect = searchResult === expected;
console.log('예상값:', expected);
console.log('검증 결과:', isCorrect ? '✅ 정상' : '❌ 불일치');

테스트 케이스:
□ 검색 결과 있음 → search_result = "Y" 확인
□ 검색 결과 없음 → search_result = "N" 확인
□ 필터 적용 후 결과 있음 → "Y"
□ 필터 적용 후 결과 없음 → "N"
```

### 종합 파라미터 검수 체크리스트

```
## 상품 개수 검증
□ 화면 노출 상품 개수 = items.length
□ 페이지네이션: 현재 페이지 상품만 포함
□ 무한 스크롤: 로드된 상품만 포함

## 상품 정보 검증
□ 첫 번째 상품: item_id, item_name 화면과 일치
□ 마지막 상품: item_id, item_name 화면과 일치
□ 중간 상품 샘플링: 3~5개 랜덤 확인
□ 가격(price): 화면 표시 가격과 일치

## 상품 순서 검증
□ index가 0부터 시작
□ index가 순차적으로 증가
□ index 순서 = 화면 노출 순서

## 검색 결과 특화 검증
□ search_result: 결과 있음 시 "Y"
□ search_result: 결과 없음 시 "N"
□ search_term: 입력한 검색어와 일치

## 불일치 발견 시 보고 내용
- 화면 노출 상품 수: [N개]
- items 배열 길이: [M개]
- 불일치 항목: [item_id / item_name / price / index]
- 스크린샷 첨부
- dataLayer 전체 출력값 첨부
```

### 파라미터 검수 디버깅 종합 스크립트

```javascript
// view_item_list 파라미터 종합 검수
(function validateViewItemList() {
  const event = dataLayer.filter(e =>
    e.event === 'view_item_list' || e.event === 'ap_search'  // 사이트별 event명
  ).pop();

  if (!event) {
    console.log('❌ view_item_list 이벤트를 찾을 수 없습니다.');
    return;
  }

  const items = event?.ecommerce?.items || [];
  const searchResult = event?.search_result;

  console.log('========================================');
  console.log('view_item_list 파라미터 검수');
  console.log('========================================');

  // 1. 상품 개수
  console.log('\n[1] 상품 개수');
  console.log('items.length:', items.length);
  console.log('→ 화면 노출 상품 수와 비교 필요');

  // 2. search_result 검증
  console.log('\n[2] search_result');
  if (searchResult !== undefined) {
    const expected = items.length > 0 ? 'Y' : 'N';
    console.log('search_result:', searchResult);
    console.log('예상값:', expected);
    console.log('결과:', searchResult === expected ? '✅ 정상' : '❌ 불일치');
  } else {
    console.log('search_result: 미설정 (검색 페이지가 아닐 수 있음)');
  }

  // 3. 상품 정보 요약
  console.log('\n[3] 상품 정보 (처음/마지막)');
  if (items.length > 0) {
    console.log('첫 번째:', items[0]);
    if (items.length > 1) {
      console.log('마지막:', items[items.length - 1]);
    }
  }

  // 4. index 순차 확인
  console.log('\n[4] index 순서');
  const indices = items.map(i => i.index);
  const isSequential = indices.every((val, idx) => val === idx);
  console.log('index 목록:', indices.join(', '));
  console.log('순차 여부:', isSequential ? '✅ 정상' : '❌ 비순차');

  console.log('\n========================================');
  console.log('검수 완료. 화면과 비교하여 최종 확인하세요.');
  console.log('========================================');
})();
```

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
| event_action | (하드코딩) | "view item list" |
| items | `{{JS - View Item List DataLayer}}` | 상품 배열 (**dataLayer variable에서 확인**) |
| currency | `{{JS - Currency}}` | 통화 코드 |
| search_term | `{{JS - Search Term}}` | 검색어 |
| search_type | `{{JS - Search Type}}` | 검색 유형 |
| search_resultcount | `{{JS - Search Result Count}}` | 검색 결과 개수 |
| search_result | `{{JS - Search Result}}` | 검색 결과 유무 |
| search_mod_term | `{{JS - Modified Search Term}}` | 수정된 검색어 |
| search_mod_result | `{{JS - Modified Search Result}}` | 수정된 검색 결과 |

> 💡 **items 확인 방법**: GTM 변수 `{{JS - View Item List DataLayer}}`의 정의를 확인하면 items 배열의 구조를 파악할 수 있습니다.
> dataLayer에서 직접 확인: `dataLayer.filter(e => e.ecommerce?.items)`

### 이벤트 레벨 파라미터

| 파라미터 | 설명 | 예시 |
|---------|------|------|
| event_category | 이벤트 카테고리 | "ecommerce" |
| event_action | 이벤트 액션 | "view item list" |
| item_list_id | 리스트 식별자 | "category_skincare_cream" |
| item_list_name | 리스트 표시명 | "스킨케어 > 크림" |
| search_result | 검색 결과 유무 (Y/N) | "Y" (결과 있음), "N" (결과 없음) |
| search_resultcount | 검색 결과 개수 | 120 |
| search_term | 검색어 (검색 페이지) | "수분 크림" |
| currency | 통화 코드 | "KRW" |

### items 배열 파라미터

| 파라미터 | 설명 | 예시 |
|---------|------|------|
| items[].item_id | 상품 ID (SKU) | "SKU_12345" |
| items[].item_name | 상품명 | "수분 크림" |
| items[].item_brand | 브랜드명 | "설화수" |
| items[].item_category | 대분류 | "스킨케어" |
| items[].item_category2 | 중분류 | "크림" |
| items[].price | 판매가 | 25000 |
| items[].original_price | 정가 | 30000 |
| items[].discount | 할인금액 | 5000 |
| items[].index | 목록 내 위치 (0부터 시작) | 0 |
| items[].apg_brand_code | APG 브랜드 코드 (사이트별) | "BR001" |
| items[].internal_brand_code | 내부 브랜드 코드 (사이트별) | "SWS" |

---

## 6. 관련 이벤트

| 이벤트 | 발생 시점 | 구분 |
|-------|----------|------|
| `view_item_list` | 상품 목록 로드 | 페이지 로드 이벤트 |
| `select_item` | 목록에서 상품 클릭 | 클릭 이벤트 |
| `view_item` | 상품 상세 페이지 로드 | 페이지 로드 이벤트 |

---

## 7. 시나리오 예시

### Should Fire (페이지 로드 시)
```
- "스킨케어 > 크림" 카테고리 페이지 진입
- "수분 크림" 검색 결과 페이지 로드
- "설화수" 브랜드 페이지 진입
- "베스트 셀러" 기획전 페이지 로드
- 무한 스크롤로 추가 상품 로드 시
- 필터 적용 후 상품 목록 갱신 시
```

### Should NOT Fire
```
- 메인 페이지 로드 (추천 섹션이 있어도)
- 상품 상세 페이지 로드 → view_item
- 장바구니 페이지 로드 → view_cart
- 결제 페이지 로드 → begin_checkout
- 마이페이지 로드
```

### 구현 필요 (Gap)
```
- 카테고리 페이지인데 dataLayer push 없음
- 검색 결과 페이지에서 이벤트 미발생
- 무한 스크롤 시 추가 로드된 상품 트래킹 없음
- items 배열이 비어있음
```

### 상세 시나리오 매트릭스

> **참고**: view_item_list는 **검색 페이지**와 **제품 목록 페이지**에서 발생합니다.

| 시나리오 | 진행방법 | 발생해야 하는 상황 | 발생하면 안 되는 상황 | 주요 검수 포인트 |
|---------|---------|------------------|---------------------|----------------|
| **상품 목록 페이지 로드 (검색)** | 검색 페이지 내 검색 | 사용자가 검색 결과나 카테고리 페이지에 진입하면서 상품 목록이 화면에 노출될 때 | 페이지가 로드되었으나 상품 목록이 없거나 아직 로드되지 않았을 때 | 상품 목록의 정확한 노출 확인, 로딩 상태의 정확한 추적, 이벤트 발생 타이밍 |
| **상품 목록 페이지 로드 (검색 결과 없음)** | 검색 결과 없을시 | - | 페이지가 로드되었으나 상품 목록이 없거나 아직 로드되지 않았을 때 | 상품 목록의 정확한 노출 확인, 로딩 상태의 정확한 추적, 이벤트 발생 타이밍 |
| **상품 목록 페이지 로드 (추천 검색어)** | 인기검색어 / 최근 검색어 클릭시 | 사용자가 검색 결과나 카테고리 페이지에 진입하면서 상품 목록이 화면에 노출될 때 | 페이지가 로드되었으나 상품 목록이 없거나 아직 로드되지 않았을 때 | 상품 목록의 정확한 노출 확인, 로딩 상태의 정확한 추적, 이벤트 발생 타이밍 |
| **상품 목록 재검색** | 검색 페이지 내 2차/3차 검색 | 사용자가 검색 결과나 카테고리 페이지에 진입하면서 상품 목록이 화면에 노출될 때 | 페이지가 로드되었으나 상품 목록이 없거나 아직 로드되지 않았을 때 | 상품 목록의 정확한 노출 확인, 로딩 상태의 정확한 추적, 이벤트 발생 타이밍 |
| **필터 적용 후 상품 노출** | 검색 결과에서 필터 적용 | 사용자가 필터 또는 정렬 옵션을 적용한 후 변경된 상품 목록이 정상적으로 노출될 때 | 필터 적용 결과가 반영되기 전에 이벤트가 발생하는 경우 | 필터링 및 정렬 기능의 반응성, 이벤트 발생 조건의 정확한 설정 |

### 시나리오별 상세 검증 항목

#### 1) 상품 목록 페이지 로드 (검색)
```
진행 방법:
1. 검색창에 키워드 입력
2. 검색 실행
3. 검색 결과 페이지 로드 확인
4. dataLayer에서 view_item_list 이벤트 확인

검증 항목:
□ 검색 결과 페이지에 진입하여 상품 목록이 화면에 노출될 때 view_item_list 발생
□ 페이지가 로드되었으나 상품 목록이 아직 로드되지 않았을 때 미발생
□ 상품 목록의 정확한 노출 확인
□ 로딩 상태의 정확한 추적
□ 이벤트 발생 타이밍이 상품 목록 노출 시점과 일치
□ items 배열에 노출된 상품 정보가 정확히 포함되는지 확인
□ item_list_name이 검색 키워드 또는 "검색 결과"로 설정되는지 확인
```

#### 2) 상품 목록 페이지 로드 (검색 결과 없음)
```
진행 방법:
1. 검색창에 결과가 없을 키워드 입력
2. 검색 실행
3. "검색 결과 없음" 페이지 확인
4. dataLayer 확인

검증 항목:
□ 검색 결과가 없을 때 view_item_list 미발생
□ "검색 결과 없음" 상태에서 이벤트가 발생하지 않는지 확인
□ 상품 목록이 없는 경우 이벤트 미발생
□ 로딩 상태와 결과 없음 상태 구분
```

#### 3) 상품 목록 페이지 로드 (추천 검색어)
```
진행 방법:
1. 검색창 클릭하여 추천 검색어 노출
2. 인기검색어 또는 최근 검색어 클릭
3. 검색 결과 페이지 로드 확인
4. dataLayer에서 view_item_list 이벤트 확인

검증 항목:
□ 인기검색어/최근 검색어 클릭 후 상품 목록 노출 시 view_item_list 발생
□ 일반 검색과 동일한 이벤트 구조로 발생하는지 확인
□ 상품 목록이 없는 경우 미발생
□ 이벤트 발생 타이밍이 상품 목록 노출 시점과 일치
```

#### 4) 상품 목록 재검색 (2차/3차 검색)
```
진행 방법:
1. 첫 번째 검색 실행 → view_item_list 발생 확인
2. 검색 결과 페이지 내에서 새로운 키워드로 재검색
3. 새로운 검색 결과 로드 확인
4. dataLayer에서 view_item_list 이벤트 재발생 확인

검증 항목:
□ 재검색 시 새로운 상품 목록 노출 시 view_item_list 발생
□ 이전 검색과 별개의 새로운 이벤트로 발생
□ 상품 목록이 변경될 때마다 이벤트 발생
□ items 배열이 새로운 검색 결과로 갱신되는지 확인
□ 연속 검색 시에도 각각 독립적으로 이벤트 발생
```

#### 5) 필터 적용 후 상품 노출
```
진행 방법:
1. 검색 또는 카테고리 페이지 진입
2. 필터 옵션 적용 (가격대, 브랜드, 정렬 등)
3. 필터링된 상품 목록 로드 확인
4. dataLayer에서 view_item_list 이벤트 확인

검증 항목:
□ 필터 적용 후 변경된 상품 목록이 노출될 때 view_item_list 발생
□ 필터 적용 결과가 반영되기 전에 이벤트 미발생
□ 필터링/정렬 기능의 반응성 확인
□ 이벤트 발생 조건의 정확한 설정
□ items 배열이 필터링된 상품 목록으로 갱신되는지 확인
□ 필터 적용 후 결과가 0건인 경우 이벤트 미발생
```

#### 6) dataLayer 중복 push로 인한 중복 발생 (주의 케이스)
```
발생 상황:
- 상품 목록 페이지 진입 시 view_item_list 이벤트가 2회 이상 발생
- 동일한 페이지인데 이벤트가 중복으로 수집됨

원인 분석 방법:
1. 개발자 도구 Console에서 dataLayer 확인
2. dataLayer.filter(e => e.event === 'view_item_list') 실행 (사이트별 event명 확인)
3. view_item_list 이벤트가 몇 번 push되었는지 확인

일반적인 중복 push 원인:
□ 프론트엔드 코드에서 dataLayer.push가 2회 호출됨
□ 페이지 로드 + SPA 라우팅 이벤트 중복
□ 컴포넌트 렌더링 시 중복 실행 (React 등 SPA에서 발생 가능)
□ GTM 태그 설정에서 중복 트리거 적용
□ 검색 결과 로드와 필터 적용에서 각각 push

검증 항목:
□ dataLayer에서 view_item_list 이벤트 push 횟수 확인 (1회만 되어야 함)
□ 중복 발생 시 두 이벤트의 데이터가 동일한지 비교
□ 발생 시점(timestamp) 확인하여 어느 지점에서 중복되는지 분석
□ 개발팀에 중복 push 지점 수정 요청

디버깅 코드 (Console에서 실행):
dataLayer.filter(e => e.event === 'view_item_list').forEach((e, i) => {
  console.log('view_item_list push #' + (i+1), e);
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
- event 이름 (view_item_list)
- ecommerce 객체 구조
- items 배열 내 파라미터

X 포함하지 않음:
- GTM LINK_CLICK 트리거 관련 내용
- DOM 속성에서 데이터 추출하는 방식
```

### 예상 dataLayer 구조 (시나리오에 포함)
```javascript
dataLayer.push({
  event: "view_item_list",
  ecommerce: {
    item_list_id: "category_skincare_cream",
    item_list_name: "스킨케어 > 크림",
    items: [
      { item_id: "SKU_12345", item_name: "수분 크림", price: 25000, index: 0 },
      { item_id: "SKU_12346", item_name: "영양 크림", price: 35000, index: 1 }
    ]
  }
});
```

### 검증 포인트
```
1. dataLayer 확인:
   - 개발자도구 Console에서 dataLayer 배열 확인
   - view_item_list 이벤트 객체가 push되는지 확인

2. 발생 시점 확인:
   - 페이지 로드 완료 시 발생
   - 카테고리/검색 결과 등 상품 목록 페이지에서 발생
   - 무한 스크롤/페이지네이션 시 추가 발생 가능
```

---

## 9. 퍼널 데이터 일관성 검증

### 이 이벤트의 퍼널 위치

view_item_list는 퍼널 외부에 있지만, items 배열의 상품 데이터가 **이후 퍼널 이벤트와 일관성**을 유지해야 합니다.

```
view_item_list (목록 노출)
      ↓
select_item → view_item → add_to_cart → view_cart → begin_checkout → purchase
```

### 일관성 검증 항목

view_item_list의 items 배열에 있는 각 상품은 **해당 상품의 select_item, view_item과 일치**해야 합니다.

| 파라미터 | 일치 대상 이벤트 | 검증 기준 |
|---------|----------------|----------|
| `items[].item_id` | select_item, view_item | 동일 상품은 항상 동일 ID |
| `items[].item_name` | select_item, view_item | 정확히 일치 |
| `items[].price` | select_item, view_item | 일치 |

### 불일치 위험 케이스

| 상황 | 위험 | 검증 방법 |
|-----|------|----------|
| 축약된 상품명 | item_name 불일치 | view_item과 비교 |
| 목록 가격 vs 상세 가격 | price 불일치 | 상세 페이지 진입 후 비교 |
| 무한 스크롤 | 중복 items 포함 | items 배열 중복 확인 |
| 필터 적용 | 필터된 결과만 포함 | items 배열 완전성 확인 |

### 검증 체크리스트
```
□ view_item_list의 items[].item_id가 select_item과 일치
□ view_item_list의 items[].item_name이 view_item과 일치
□ view_item_list의 items[].price가 view_item과 일치
□ 무한 스크롤 시 기존 items와 중복 없음
```

---

## 10. 발생 페이지별 검증

### view_item_list 발생 가능 페이지

이 이벤트는 **상품 목록을 표시하는 모든 페이지**에서 발생합니다.

| 페이지 | item_list_name 예시 | 특징 |
|-------|-------------------|------|
| 카테고리 페이지 | "스킨케어 > 크림" | 메인 발생 페이지 |
| 검색 결과 페이지 | "검색: 수분 크림" | search_term 포함 |
| 브랜드 페이지 | "설화수" | 브랜드별 상품 |
| 기획전 페이지 | "여름 세일" | 이벤트 상품 |
| 베스트 페이지 | "베스트 셀러" | 인기 상품 |

### 페이지별 데이터 일관성

**동일 상품(SKU_12345)이 여러 목록에 노출될 때**:

```javascript
// 카테고리 페이지의 items 중
{ item_id: "SKU_12345", item_name: "수분 크림", price: 25000 }

// 검색 결과의 items 중
{ item_id: "SKU_12345", item_name: "수분 크림", price: 25000 }

// 베스트 페이지의 items 중
{ item_id: "SKU_12345", item_name: "수분 크림", price: 25000 }
```

### 크로스페이지 검증 체크리스트
```
□ 동일 상품이 여러 목록에 노출 시 item_id 일치
□ 동일 상품이 여러 목록에 노출 시 item_name 일치
□ 동일 상품이 여러 목록에 노출 시 price 일치
□ 검색 결과와 카테고리 페이지의 동일 상품 데이터 비교
```

---

## 11. 타이밍/중복 발생 위험

### 중복 발생 시나리오

| 상황 | 위험 | 검증 방법 |
|-----|------|----------|
| 무한 스크롤 | 스크롤마다 전체 items 재전송 | 신규 로드분만 포함 확인 |
| 필터 변경 | 필터 적용마다 재발생 | 필터 변경 테스트 |
| 새로고침 | 동일 데이터 중복 | 새로고침 테스트 |
| SPA 네비게이션 | 히스토리 변경 시 미발생 | SPA 라우팅 테스트 |

### 타이밍 검증 체크리스트
```
□ 초기 로드 시 노출된 상품만 items에 포함
□ 무한 스크롤 시 새로 로드된 상품만 추가
□ 필터 적용 시 필터된 결과만 items에 포함
□ 페이지네이션 시 해당 페이지 상품만 포함
```

---

## 12. 환경별 검증

> **공통 가이드 참조**: [docs/environment-validation-guide.md](../docs/environment-validation-guide.md)
>
> PC/Mobile, 로그인/비로그인 환경별 검증은 공통 가이드를 참조하세요.

### view_item_list 특화 환경 검증

| 환경 | 특이사항 |
|-----|---------|
| Mobile | 무한 스크롤 UI에서 추가 로드 시 이벤트 발생 확인 |
| PC | 그리드/리스트 뷰 전환 시 이벤트 재발생 여부 확인 |
| 로그인 상태 | 개인화 추천 상품 목록의 데이터 일관성 확인 |
