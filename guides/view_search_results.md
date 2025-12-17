# view_search_results 이벤트 가이드

## 이벤트 정의
**검색 결과 페이지가 로드될 때** 발생하는 이벤트입니다.
사용자가 검색을 수행하고 결과가 표시되는 시점을 추적합니다.
**클릭이 아닌 검색 결과 페이지 로드 시 자동 발생**합니다.

---

## 1. 시각적 판단 기준 (Primary - 화면에서 찾기)

### 검색 결과 페이지의 시각적 특징

#### 1) 검색어 표시 영역
- **위치**: 페이지 상단
- **형태**: 검색어가 강조되어 표시
- **예시**:
  - "'수분 크림' 검색 결과"
  - "수분 크림에 대한 검색 결과"
  - "검색어: 수분 크림"

#### 2) 검색 결과 개수
- **위치**: 검색어 근처
- **형태**: "총 120개 상품", "120개의 결과"

#### 3) 검색 결과 목록
- **형태**: 그리드 또는 리스트 레이아웃
- **구성**: 상품 카드 (이미지 + 상품명 + 가격)
- **특징**:
  - 검색어와 연관된 상품 표시
  - 정렬/필터 옵션

#### 4) 검색 결과 없음
- **형태**: "검색 결과가 없습니다" 메시지
- **추가 요소**: 추천 검색어, 인기 상품

### 검색 결과 페이지가 아닌 화면 (시각적 구분)

| 화면 | 특징 | 해당 이벤트 |
|-----|------|--------------|
| 카테고리 페이지 | 카테고리명 표시, 검색어 없음 | `view_item_list` |
| 메인 페이지 | 히어로 배너, 추천 섹션 | `view_promotion` |
| 상품 상세 | 단일 상품 정보 | `view_item` |

---

## 2. GTM 트리거 조건 (검증용)

### 현재 구현된 조건
```
트리거 타입: CUSTOM_EVENT (dataLayer push)
Custom Event: [사이트별 상이 - site-config.json 참조]
발생 시점: 검색 결과 페이지 로드 시
```

### 발생 조건
```
- 검색창에서 검색어 입력 후 검색 실행
- 검색 결과 페이지 직접 접근 (/search?q=...)
- 검색어 변경 시 (새 검색)
```

### dataLayer 구조

**참고**: 실제 `event` 값은 사이트마다 다릅니다. `sites/{site}/site-config.json`의 `eventMapping.view_search_results` 값을 확인하세요.

```javascript
// GA4 이벤트: view_search_results
// dataLayer event명은 사이트별 설정 참조
dataLayer.push({
  event: "[eventMapping.view_search_results]",  // 예: "search", "view_search_results" 등
  search_term: "수분 크림",
  items: [
    { item_id: "SKU_001", item_name: "수분 크림", price: 25000 },
    { item_id: "SKU_002", item_name: "수분 에센스", price: 35000 }
  ]
});
```

### 사이트별 dataLayer event명 예시
| 사이트 | dataLayer event | 설정 파일 |
|-------|-----------------|----------|
| Amoremall | `search` | `sites/amoremall-kr/site-config.json` |
| Innisfree Shopify | `view_search_results` | `sites/innisfree-shopify/site-config.json` |

---

## 3. 분석 판단 프로세스

### Step 1: 페이지 타입 식별
화면의 구조를 분석합니다:
- 검색어가 표시됨 = **검색 결과 페이지**
- 카테고리명만 표시됨 = **카테고리 페이지**
- URL에 search, query, q 파라미터 포함 = **검색 결과**

### Step 2: 검색 결과 페이지 필수 요소 확인
- 검색어 표시
- 검색 결과 개수
- 상품 목록 또는 "결과 없음" 메시지

### Step 3: 트래킹 확인
- 페이지 로드 시 dataLayer에 `view_search_results` push 여부
- search_term 파라미터 포함 여부

### Step 4: 결과 분류

#### Case A: 검색 결과 페이지 + 트래킹 있음
→ **Should Fire**: 페이지 로드 시 이벤트 발생

#### Case B: 검색 결과 페이지 + 트래킹 없음
→ **구현 누락**: dataLayer push 코드 추가 필요

#### Case C: 카테고리/메인 페이지
→ **Should NOT Fire**: 검색 결과가 아님

---

## 4. 구현 검증 포인트

### 필수 확인 사항
1. **검색 결과 페이지에서 발생**
   - 모든 검색어에 대해 발생
   - 검색 결과가 없어도 발생 (0건)

2. **search_term 수집**
   - 사용자가 입력한 검색어 수집
   - 특수문자, 공백 처리

3. **검색 결과 상품 정보**
   - items 배열에 검색 결과 상품 포함
   - 결과 없으면 빈 배열

### 흔한 구현 오류
| 문제 | 증상 | 해결 방법 |
|-----|------|----------|
| 검색어 누락 | search_term 없음 | 검색어 파라미터 추가 |
| 결과 없음 미처리 | 0건일 때 미발생 | 결과 없어도 발생 |
| view_item_list와 혼동 | 카테고리에서도 발생 | 검색 페이지만 적용 |
| **필터 클릭 시 오발생** | 검색어 입력 없이 필터만 변경해도 search 이벤트 발생 | 검색어 입력 시에만 발생하도록 트리거 조건 수정 |
| **검색 이벤트 중복 발생** | 검색어 입력 시점 + 결과 페이지 로드 시점에 각각 발생 | 한 시점에서만 발생하도록 통합 |
| **검색 진입점별 불일치** | 특정 검색바에서만 발생, 다른 위치 검색바에서 미발생 | 모든 검색 진입점 테스트 필요 |
| **검색 결과 0건 시 미발생** | 결과 없을 때 이벤트 미발생 | 결과 유무와 관계없이 발생 필요 |
| **search_term/items 불일치** | 실제 검색어 또는 노출 상품 수와 이벤트 데이터가 다름 | 화면 표시 데이터와 이벤트 데이터 비교 검증 |

---

## 5. 수집 파라미터

> **중요**: 아래 파라미터는 대표 예시입니다.
> 실제 구현은 사이트별 GTM 설정에 따라 다르므로, **시나리오 설계 시 반드시 GTM 파싱을 통해 실제 파라미터를 확인**해야 합니다.
> GTM 파싱 방법: [docs/gtm-parsing-guide.md](../docs/gtm-parsing-guide.md) 참조

### 이벤트 레벨 파라미터

| 파라미터 | 설명 | 예시 |
|---------|------|------|
| event_category | 이벤트 카테고리 | "search" |
| event_action | 이벤트 액션 | "view search results" |
| search_term | 검색어 | "수분 크림" |
| search_result | 검색 결과 유무 | "Y" 또는 "N" |
| search_resultcount | 검색 결과 수 | 120 |
| items | 상품 배열 | [{...}] |

### items 배열 파라미터

| 파라미터 | 설명 | 예시 | 필수 |
|---------|------|------|-----|
| item_id | 상품 고유 ID | "SKU_12345" | O |
| item_name | 상품명 | "수분 크림" | O |
| item_brand | 브랜드명 | "설화수" | O |
| item_category | 대분류 | "스킨케어" | O |
| price | 가격 | 25000 | O |
| index | 검색 결과 순위 | 0 | △ |

---

## 6. 관련 이벤트

| 이벤트 | 발생 시점 | 구분 |
|-------|----------|------|
| `view_search_results` | 검색 결과 로드 | 검색 결과 페이지 |
| `view_item_list` | 상품 목록 로드 | 카테고리 페이지 |
| `select_item` | 상품 클릭 | 검색 결과에서 상품 선택 |

---

## 7. 시나리오 예시

### Should Fire (검색 결과 로드 시)
```
- 검색창에서 "수분 크림" 검색 후 결과 페이지 로드
- URL로 검색 결과 페이지 직접 접근 (/search?q=에센스)
- 검색어 변경하여 새로운 검색 수행
- 검색 결과가 0건이어도 발생
```

### Should NOT Fire
```
- 카테고리 페이지 로드 → view_item_list
- 메인 페이지 로드
- 검색창 클릭/포커스 (검색 실행 전)
- 검색어 입력 중 (아직 검색 전)
- 검색 결과에서 상품 클릭 → select_item
```

### 구현 필요 (Gap)
```
- 검색 결과 페이지인데 dataLayer push 없음
- search_term이 누락되어 검색어 분석 불가
- 검색 결과 0건일 때 이벤트 미발생
- view_item_list만 발생하고 view_search_results 없음
```

### 시나리오별 상세 검증 항목

#### 1) 필터 클릭 시 오발생 (주의 케이스)
```
발생 상황:
- 검색어 입력 없이 필터(카테고리, 가격대, 정렬 등)만 변경해도 search 이벤트 발생
- 필터 변경 시마다 search 이벤트가 중복 발생

원인 분석:
□ 필터 변경 이벤트와 검색 이벤트가 동일한 트리거 조건 사용
□ URL 파라미터 변경 시 무조건 search 이벤트 발생하도록 구현
□ 검색어 유무 조건 없이 페이지 로드마다 발생

검증 방법:
1. 검색어 입력하여 검색 결과 페이지 진입
2. 검색어 변경 없이 필터만 클릭 (정렬 변경, 카테고리 필터 등)
3. dataLayer에서 search 이벤트 발생 여부 확인
4. 필터 클릭 시 search 이벤트 미발생해야 정상

디버깅 코드 (Console에서 실행):
// 검색 이벤트 발생 시점 모니터링
dataLayer.push = (function(original) {
  return function(obj) {
    if (obj.event === 'search') {  // 사이트별 event명 확인
      console.log('[SEARCH EVENT]', new Date().toISOString(), obj);
    }
    return original.apply(this, arguments);
  };
})(dataLayer.push);
```

#### 2) 검색 이벤트 중복 발생 (주의 케이스)
```
발생 상황:
- 검색어 입력 시점에 search 이벤트 1회 발생
- 검색 결과 페이지 로드 시점에 search 이벤트 또 1회 발생
- 동일 검색에 대해 2회 이상 이벤트 수집됨

원인 분석:
□ 검색 버튼 클릭 핸들러에서 dataLayer.push
□ 검색 결과 페이지 로드 시 dataLayer.push
□ SPA에서 라우트 변경 시 + 컴포넌트 마운트 시 각각 push
□ 자동완성 선택 시 + 페이지 로드 시 각각 push

검증 방법:
1. 검색창에 검색어 입력 후 Enter 또는 검색 버튼 클릭
2. 검색 결과 페이지 완전히 로드될 때까지 대기
3. dataLayer에서 search 이벤트 횟수 확인

디버깅 코드 (Console에서 실행):
// 검색 이벤트 발생 횟수 확인
const searchEvents = dataLayer.filter(e => e.event === 'search');
console.log('검색 이벤트 발생 횟수:', searchEvents.length);
searchEvents.forEach((e, i) => {
  console.log('search push #' + (i+1), e);
});

기대 결과:
□ 1회 검색에 대해 search 이벤트 1회만 발생해야 함
□ 중복 발생 시 두 이벤트의 search_term이 동일한지 확인
```

#### 3) 검색 진입점별 불일치 (주의 케이스)
```
발생 상황:
- 특정 위치의 검색바에서만 search 이벤트 발생
- 다른 위치(헤더, 모바일 메뉴, 푸터 등) 검색바에서 미발생
- GNB 검색 vs 검색 페이지 내 검색바 동작 불일치

테스트 필수 진입점:
□ PC GNB(Global Navigation Bar) 검색바
□ Mobile 햄버거 메뉴 내 검색바
□ Mobile 상단 검색 아이콘 클릭 후 검색바
□ 검색 결과 페이지 내 재검색 입력창
□ 검색 결과 없음 페이지 내 검색창
□ 푸터 검색바 (있는 경우)

검색 타입별 테스트 (각 진입점에서 모두 확인):
□ 직접 키워드 입력 후 Enter/검색 버튼
□ 자동완성 추천 키워드 클릭
□ 유사/연관 키워드 클릭 (검색 결과 페이지 내)
□ 인기 검색어 클릭
□ 최근 검색어 클릭
□ 검색 결과 없음 시 추천 키워드 클릭

검증 방법:
1. 각 진입점에서 동일한 검색어로 검색 실행
2. 각각 dataLayer에서 search 이벤트 발생 확인
3. 모든 진입점에서 동일하게 이벤트 발생해야 함

종합 체크리스트 (PC):
| 진입점 | 검색 타입 | 이벤트 발생 | search_term | items |
|-------|----------|------------|-------------|-------|
| PC GNB | 직접 입력 (Enter) | □ | □ | □ |
| PC GNB | 직접 입력 (버튼) | □ | □ | □ |
| PC GNB | 자동완성 추천 키워드 클릭 | □ | □ | □ |
| PC GNB | 인기 검색어 클릭 | □ | □ | □ |
| PC GNB | 최근 검색어 클릭 | □ | □ | □ |
| 결과 페이지 | 재검색 (직접 입력) | □ | □ | □ |
| 결과 페이지 | 유사/연관 키워드 클릭 | □ | □ | □ |
| 결과 없음 | 추천 키워드 클릭 | □ | □ | □ |

종합 체크리스트 (Mobile):
| 진입점 | 검색 타입 | 이벤트 발생 | search_term | items |
|-------|----------|------------|-------------|-------|
| Mobile 검색 아이콘 | 직접 입력 (Enter) | □ | □ | □ |
| Mobile 검색 아이콘 | 직접 입력 (버튼) | □ | □ | □ |
| Mobile 검색 아이콘 | 자동완성 추천 키워드 클릭 | □ | □ | □ |
| Mobile 검색 아이콘 | 인기 검색어 클릭 | □ | □ | □ |
| Mobile 검색 아이콘 | 최근 검색어 클릭 | □ | □ | □ |
| Mobile 햄버거 메뉴 | 직접 입력 | □ | □ | □ |
| Mobile 햄버거 메뉴 | 추천 키워드 클릭 | □ | □ | □ |
| Mobile 결과 페이지 | 유사/연관 키워드 클릭 | □ | □ | □ |
| Mobile 결과 없음 | 추천 키워드 클릭 | □ | □ | □ |

주의사항:
□ 추천/유사/인기/최근 키워드 클릭 시 search_term이 클릭한 키워드와 일치하는지 확인
□ 직접 입력과 키워드 클릭의 이벤트 발생 타이밍이 동일한지 확인
□ 키워드 클릭 시 이벤트 중복 발생 여부 확인 (클릭 시 + 페이지 로드 시)
```

#### 4) 검색 결과 0건 시 미발생 (주의 케이스)
```
발생 상황:
- 검색 결과가 있을 때는 search 이벤트 정상 발생
- 검색 결과 0건일 때 search 이벤트 미발생
- "검색 결과 없음" 페이지에서 이벤트 누락

원인 분석:
□ 검색 결과 상품 렌더링 후 이벤트 push하는 로직
□ items 배열이 비어있으면 push 스킵하는 조건문
□ 검색 결과 없음 페이지가 별도 템플릿이라 이벤트 코드 누락

검증 방법:
1. 존재하지 않는 검색어로 검색 (예: "asdfghjkl1234567")
2. "검색 결과가 없습니다" 메시지 확인
3. dataLayer에서 search 이벤트 발생 여부 확인

기대 결과:
□ 검색 결과 0건이어도 search 이벤트 발생해야 함
□ search_term에 검색어 포함
□ items는 빈 배열 [] 또는 미포함 가능
```

#### 5) search_term/items 데이터 불일치 (주의 케이스)
```
발생 상황:
- search_term이 실제 입력한 검색어와 다름
- items 배열의 상품 수가 화면에 노출된 상품 수와 불일치
- items 배열의 상품이 실제 검색 결과와 다름

주요 확인 포인트:
□ search_term: 화면에 표시된 검색어와 일치하는지
□ items 개수: 화면 노출 상품 수와 일치하는지 (페이지네이션 고려)
□ items 순서: 화면 노출 순서와 index 값이 일치하는지
□ 특수문자/공백: 검색어에 특수문자나 공백 포함 시 처리

검증 방법:
1. 검색 실행 후 화면의 검색어 표시 확인
2. 화면에 노출된 상품 개수 확인
3. dataLayer의 search 이벤트 데이터와 비교

디버깅 코드 (Console에서 실행):
// 가장 최근 search 이벤트의 데이터 확인
const lastSearch = dataLayer.filter(e => e.event === 'search').pop();
if (lastSearch) {
  console.log('search_term:', lastSearch.search_term);
  console.log('items 개수:', lastSearch.items?.length || 0);
  console.log('items:', lastSearch.items);
}

체크리스트:
□ search_term이 URL의 q 파라미터 또는 화면 표시와 일치
□ items 개수가 "총 N개 상품" 표시와 일치 (1페이지 기준)
□ items[].item_id가 실제 상품 ID와 일치
□ items[].index가 0부터 순차적으로 할당됨
□ 특수문자 검색어 (&, %, # 등) 정상 수집 확인
□ 한글/영문/숫자 혼합 검색어 정상 수집 확인
```

---

## 8. 시나리오 작성 지침

### 트리거 타입: CUSTOM_EVENT (dataLayer.push)

이 이벤트는 **dataLayer.push로 발생**합니다.
검색 결과 페이지 로드 시 프론트엔드에서 dataLayer.push를 호출하여 이벤트를 발생시킵니다.

### 시나리오에 포함할 내용
```
O 포함해야 함:
- 예상 dataLayer 구조 (dataLayer.push 코드)
- event 이름 (사이트별 site-config.json에서 확인)
- search_term 파라미터 (검색어)
- items 배열 내 검색 결과 상품

X 포함하지 않음:
- GTM LINK_CLICK 트리거 관련 내용
- DOM 속성에서 데이터 추출하는 방식
```

### 예상 dataLayer 구조 (시나리오에 포함)

**사이트별 event명 확인 필수**: `sites/{site}/site-config.json` → `eventMapping.view_search_results`

```javascript
// 예시: Amoremall (event: "search")
dataLayer.push({
  event: "search",  // site-config.json에서 확인
  search_term: "수분 크림",
  items: [
    { item_id: "SKU_001", item_name: "수분 크림", price: 25000 },
    { item_id: "SKU_002", item_name: "수분 에센스", price: 35000 }
  ]
});
```

### 검증 포인트
```
1. dataLayer 확인:
   - 개발자도구 Console에서 dataLayer 배열 확인
   - view_search_results 이벤트 객체가 push되는지 확인

2. 필수 파라미터 확인:
   - search_term에 사용자 검색어 포함
   - 검색 결과 0건이어도 이벤트 발생

3. view_item_list와 구분:
   - 검색 페이지에서만 발생 (카테고리 페이지는 view_item_list)
```

---

## 9. 환경별 검증

> **공통 가이드 참조**: [docs/environment-validation-guide.md](../docs/environment-validation-guide.md)
>
> PC/Mobile, 로그인/비로그인 환경별 검증은 공통 가이드를 참조하세요.

### view_search_results 특화 환경 검증

| 환경 | 특이사항 |
|-----|---------|
| Mobile | 음성 검색, 자동완성 선택 시에도 이벤트 발생 확인 |
| PC | Enter 키, 검색 버튼 클릭 모두 이벤트 발생 확인 |
| 로그인 상태 | 개인화 검색 결과의 경우 user_id 포함 확인 |
