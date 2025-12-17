# select_promotion 이벤트 가이드

## 이벤트 정의
**프로모션 배너를 클릭했을 때** 발생하는 이벤트입니다.
마케팅 캠페인, 할인 이벤트, 기획전 등의 프로모션 콘텐츠를 클릭하는 행동을 추적합니다.

---

## 1. 시각적 판단 기준 (Primary - 화면에서 찾기)

### 프로모션 영역의 시각적 특징

#### 1) 메인 히어로 배너 (Key Visual)
- **위치**: 페이지 최상단, 전체 너비 차지
- **형태**: 대형 이미지 배너, 캐러셀/슬라이드
- **시각 요소**:
  - 고해상도 이미지 (모델, 제품, 캠페인 비주얼)
  - 마케팅 문구 ("~% 할인", "SALE", "기획전" 등)
  - CTA 버튼 ("자세히 보기", "SHOP NOW")
  - 슬라이드 인디케이터 (dot navigation)
  - 좌우 화살표 버튼

#### 2) 프로모션 배너/카드
- **형태**: 제품보다 큰 배너 형태
- **시각 요소**:
  - 캠페인/이벤트명이 크게 표시
  - 기간 한정 문구 ("~까지", "D-7")
  - 할인율/혜택 강조
  - 강렬한 색상/그라데이션 배경

#### 3) 이벤트/기획전 섹션
- **위치**: 메인 페이지 중간~하단
- **형태**: 이벤트 참여 유도 영역
- **시각 요소**:
  - "이벤트", "기획전", "SPECIAL" 등 섹션 타이틀
  - 참여 버튼

### 프로모션이 아닌 영역 (시각적 구분)

| 영역 | 특징 | 해당 이벤트 |
|-----|------|-----------|
| 상품 카드 | 제품 이미지 + 가격 + 상품명 | `select_item` |
| 네비게이션 | 메뉴, 카테고리 링크 | 없음 |
| 검색창 | 검색 입력 필드 | 없음 |
| 장바구니/마이페이지 | 기능 아이콘 | 없음 |

---

## 2. GTM 트리거 조건 (검증용)

### 현재 구현된 조건
```
트리거 타입: LINK_CLICK (링크 클릭)
CSS Selector: [사이트별 상이 - site-config.json 참조]
이벤트 발생: 링크 클릭 시 GTM이 자동으로 GA4 이벤트 전송
```

**중요**: dataLayer.push로 이벤트를 발생시키는 것이 아니라,
GTM의 LINK_CLICK 트리거가 요소 클릭을 감지하여 이벤트를 발생시킵니다.

### 사이트별 CSS Selector 예시
| 사이트 | CSS Selector | DOM 속성 | 설정 파일 |
|-------|--------------|----------|----------|
| Amoremall | `a[ap-click-area]` | `ap-click-data` | `sites/amoremall-kr/site-config.json` |
| Innisfree Shopify | `a[data-promotion]` | `data-promotion` | `sites/innisfree-shopify/site-config.json` |

**참고**: 실제 CSS Selector와 DOM 속성은 사이트마다 다릅니다. `sites/{site}/site-config.json`의 `domAttributes.selectPromotion` 값을 확인하세요.

### DOM 속성 구조
```html
<!-- Amoremall 방식 -->
<a href="/event/..." ap-click-area="promotion" ap-click-data='{"promotion_name":"배너명","creative_slot":"위치"}'>
  <img src="banner.jpg" />
</a>

<!-- Shopify 방식 -->
<a href="/collections/..." data-promotion='{"name":"배너명","slot":"위치"}'>
  <img src="banner.jpg" />
</a>
```

### GTM 변수 구조
```
변수명: [사이트별 상이]
타입: Custom JavaScript Variable
역할: 클릭된 요소에서 프로모션 정보 추출하여 GA4 파라미터로 전달
```

### 변수가 반환하는 구조
```javascript
// GTM 변수 반환값
{
  items: [{
    promotion_id: "...",       // URL pathname + search에서 추출
    promotion_name: "배너명",   // DOM 속성에서 추출
    creative_slot: "위치",      // DOM 속성에서 추출
    index: 1                   // 슬라이드 인덱스에서 추출
  }]
}
```

---

## 3. 분석 판단 프로세스

### Step 1: 시각적으로 프로모션 영역 식별
화면에서 다음 특징을 가진 영역을 찾습니다:
- 대형 배너 이미지
- 마케팅 문구
- 캠페인/이벤트 비주얼

### Step 2: DOM에서 트리거 조건 확인
해당 영역의 DOM 구조를 확인합니다:
- `<a>` 태그 존재 여부
- `ap-data-promotion` 속성 존재 여부

### Step 3: 결과 분류

#### Case A: 시각적으로 프로모션 + 속성 있음
→ **Should Fire**: 이벤트가 발생해야 함

#### Case B: 시각적으로 프로모션 + 속성 없음
→ **구현 누락**: 이벤트 추적 코드 삽입 필요
- 히어로 배너인데 `ap-data-promotion` 속성이 없는 경우
- 개발팀에 트래킹 코드 추가 요청 필요

#### Case C: 시각적으로 프로모션 아님 + 속성 없음
→ **Should NOT Fire**: 정상 (이벤트 발생 안 함)

---

## 4. 구현 검증 포인트

### 필수 확인 사항
1. **히어로 배너 영역에 트래킹 적용 여부**
   - 메인 페이지 최상단 캐러셀 배너
   - 각 슬라이드의 `<a>` 태그에 `ap-data-promotion` 속성 필요

2. **속성 값 유효성**
   - `promotion_name`: 배너 식별 가능한 이름
   - `creative_slot`: 배너 위치 정보

3. **클릭 가능 영역**
   - 배너 전체가 클릭 가능해야 함
   - `<a>` 태그가 이미지를 감싸야 함

### 흔한 구현 오류
| 문제 | 증상 | 해결 방법 |
|-----|------|----------|
| 속성 누락 | 히어로 배너 클릭해도 이벤트 없음 | `ap-data-promotion` 속성 추가 |
| 잘못된 태그 | `<div>` 클릭은 트래킹 안 됨 | `<a>` 태그로 변경 |
| JSON 오류 | 속성값 파싱 실패 | JSON 형식 검증 |

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
| event_action | (하드코딩) | "select promotion" |
| event_label | `{{JS - Select Promotion Event Label}}` | 프로모션명 등 |
| items | `{{JS - Select Promotion DataLayer}}` | 프로모션 배열 (**dataLayer variable에서 확인**) |

> 💡 **items 확인 방법**: GTM 변수 `{{JS - Select Promotion DataLayer}}`의 정의를 확인하면 items 배열의 구조를 파악할 수 있습니다.
> dataLayer에서 직접 확인: `dataLayer.filter(e => e.ecommerce?.items)`

### 이벤트 레벨 파라미터

| 파라미터 | 설명 | 예시 |
|---------|------|------|
| event_category | 이벤트 카테고리 | "ecommerce" |
| event_action | 이벤트 액션 | "select promotion" |
| event_label | 이벤트 라벨 | 프로모션명 등 |
| items | 프로모션 배열 | [{...}] |

### items 배열 파라미터

| 파라미터 | 출처 | 설명 |
|---------|------|------|
| promotion_id | URL pathname + search | 프로모션 ID |
| promotion_name | `ap-data-promotion.promotion_name` | 프로모션명 |
| creative_slot | `ap-data-promotion.creative_slot` | 배너 위치 |
| index | `data-swiper-slide-index` + 1 | 슬라이드 순서 |

---

## 6. 관련 이벤트

| 이벤트 | 발생 시점 | 구분 기준 |
|-------|----------|----------|
| `view_promotion` | 프로모션이 화면에 노출 | 클릭 없이 자동 |
| `select_promotion` | 프로모션 클릭 | 클릭 필요 |
| `select_item` | 상품 클릭 | 상품 카드 클릭 |

---

## 7. 시나리오 예시

### Should Fire (정상 발생)
```
- 메인 페이지 히어로 배너 클릭 (ap-data-promotion 속성 있음)
- 기획전 배너 클릭 (ap-data-promotion 속성 있음)
- 슬라이드 배너의 다른 슬라이드 클릭
```

### Should NOT Fire (발생 안 함)
```
- 상품 카드 클릭 → select_item
- 네비게이션 메뉴 클릭
- 검색창 클릭
- 로고 클릭
```

### 구현 필요 (Gap)
```
- 프로모션 배너처럼 보이지만 ap-data-promotion 속성 없음
- 히어로 영역이 <a> 태그가 아닌 <div>로 구현됨
- 이벤트 배너 영역에 트래킹 코드 누락
```

### 상세 시나리오 매트릭스

| 시나리오 | 진행방법 | 발생해야 하는 상황 | 발생하면 안 되는 상황 | 주요 검수 포인트 |
|---------|---------|------------------|---------------------|----------------|
| **프로모션 클릭 확인** | 페이지 랜딩시 프로모션 확인 | 사용자가 프로모션 콘텐츠(예: 배너, 링크)를 클릭할 때 | 사용자가 프로모션 외의 다른 영역을 클릭했을 때 | 클릭 이벤트의 정확한 타겟팅, 이벤트 발생 타이밍 확인 |
| **스크롤 후 프로모션 클릭** | 스크롤 내려서 프로모션 확인 | 사용자가 프로모션 콘텐츠(예: 배너, 링크)를 클릭할 때 | 프로모션 요소가 아닌 페이지의 다른 콘텐츠를 클릭했을 때 | 프로모션 요소의 UI 경계 정의, 인터랙션 요소에 대한 명확한 이벤트 바인딩 확인 |
| **동적 콘텐츠에서 클릭** | 팝업 콘텐츠 노출 확인 | 사용자가 프로모션 콘텐츠(예: 배너, 링크)를 클릭할 때 | 한 프로모션 선택 시, 다른 프로모션에 대해서도 이벤트가 발생하는 경우 | 프로모션 식별자의 정확성, 각 프로모션별 이벤트 독립성 검증 |

### 시나리오별 상세 검증 항목

#### 1) 프로모션 클릭 확인
```
진행 방법:
1. 프로모션 배너가 있는 페이지에 접근
2. 프로모션 배너(히어로 배너, 기획전 배너 등) 클릭
3. dataLayer에서 select_promotion 이벤트 확인

검증 항목:
□ 사용자가 프로모션 콘텐츠(배너, 링크)를 클릭할 때 select_promotion 발생
□ 프로모션 외의 다른 영역을 클릭했을 때 미발생
□ 클릭 이벤트의 정확한 타겟팅 확인
□ 이벤트 발생 타이밍이 클릭 시점과 일치하는지 확인
□ promotion_id, promotion_name 등 파라미터 정확성 확인
□ ap-data-promotion 속성이 있는 요소에서만 발생하는지 확인
```

#### 2) 스크롤 후 프로모션 클릭
```
진행 방법:
1. 프로모션이 스크롤 아래에 위치한 페이지 접근
2. 스크롤하여 프로모션 영역 노출
3. 해당 프로모션 배너 클릭
4. dataLayer에서 select_promotion 이벤트 확인

검증 항목:
□ 스크롤 후 프로모션을 클릭할 때 select_promotion 발생
□ 프로모션 요소가 아닌 다른 콘텐츠 클릭 시 미발생
□ 프로모션 요소의 UI 경계가 정확히 정의되어 있는지 확인
□ 인터랙션 요소에 대한 명확한 이벤트 바인딩 확인
□ 스크롤 위치와 관계없이 클릭 시 정상 작동하는지 확인
```

#### 3) 동적 콘텐츠에서 클릭
```
진행 방법:
1. 팝업 또는 모달로 프로모션이 표시되는 페이지 접근
2. 팝업 내 프로모션 콘텐츠 클릭
3. dataLayer에서 select_promotion 이벤트 확인
4. 다른 프로모션 클릭 시 해당 프로모션 정보만 전송되는지 확인

검증 항목:
□ 동적으로 로드된 프로모션 클릭 시 select_promotion 발생
□ 한 프로모션 선택 시 다른 프로모션에 대해 이벤트 미발생
□ 프로모션 식별자(promotion_id, promotion_name)의 정확성 확인
□ 각 프로모션별 이벤트 독립성 검증
□ 동적 로드된 요소에도 이벤트 바인딩이 정상 작동하는지 확인
□ 슬라이드 배너의 경우 클릭한 슬라이드의 정보만 전송되는지 확인
```

---

## 8. 시나리오 작성 지침

### 트리거 타입: LINK_CLICK (DOM 요소 클릭 감지)

이 이벤트는 **dataLayer.push로 발생하지 않습니다**.
GTM의 LINK_CLICK 트리거가 `a[ap-data-promotion]` 요소 클릭을 감지하여 이벤트를 발생시킵니다.

### 시나리오에 포함할 내용
```
O 포함해야 함:
- GTM 트리거 조건 (CSS Selector)
- DOM 속성 구조 (ap-data-promotion)
- GTM 변수명과 역할 (JS - Select Promotion DataLayer)
- 변수가 반환하는 데이터 구조
- 파라미터 매핑 (어떤 속성에서 어떤 파라미터로)

X 포함하지 않음:
- "예상 dataLayer 구조" 섹션
- dataLayer.push({ event: "select_promotion", ... }) 형태의 코드
```

### 검증 포인트
```
1. DOM 요소 확인:
   - <a> 태그에 ap-data-promotion 속성 존재 여부
   - 속성값의 JSON 유효성

2. GTM 설정 확인:
   - LINK_CLICK 트리거가 CSS Selector와 매칭되는지
   - JS 변수가 속성값을 올바르게 파싱하는지
```

---

## 9. 이벤트 버블링 위험

### 버블링 발생 시나리오

이 이벤트는 **LINK_CLICK 트리거**를 사용하므로, 중첩된 DOM 구조에서 버블링 이슈가 발생할 수 있습니다.

```html
<!-- 중첩 구조 예시 -->
<a href="/event/summer" class="hero-banner" ap-click-area="promotion">
  <img src="banner.jpg" />
  <div class="content">
    <h2>여름 세일</h2>
    <p>최대 50% 할인</p>
    <button class="cta-btn">자세히 보기</button>  <!-- 중첩 요소 -->
  </div>
  <nav class="slide-nav">
    <button class="prev">◀</button>  <!-- 슬라이드 컨트롤 -->
    <button class="next">▶</button>
  </nav>
</a>
```

### 버블링 위험 케이스

| 상황 | 위험 | 검증 방법 |
|-----|------|----------|
| 슬라이드 화살표 클릭 | select_promotion 오발생 | 화살표 클릭 시 이벤트 확인 |
| 인디케이터 점 클릭 | select_promotion 오발생 | 점 클릭 시 이벤트 확인 |
| CTA 버튼 클릭 | 중복 발생 가능 | CTA 클릭 시 이벤트 횟수 확인 |
| 배너 이미지 클릭 | 정상 발생 확인 | 이미지 영역 클릭 테스트 |

### 중첩 요소 클릭 시 예상 결과

| 클릭 위치 | 예상 결과 | 위험 |
|---------|----------|------|
| 배너 이미지 | select_promotion 1회 | 정상 |
| 배너 텍스트 | select_promotion 1회 | 정상 |
| "자세히 보기" 버튼 | select_promotion 1회 | 정상 (동일 링크) |
| 슬라이드 화살표 | 미발생 (슬라이드 전환만) | select_promotion 오발생 위험 |
| 페이지네이션 점 | 미발생 (슬라이드 전환만) | select_promotion 오발생 위험 |

### 슬라이드/캐러셀 특수 케이스

```html
<!-- 캐러셀 구조 예시 -->
<div class="carousel">
  <div class="slides">
    <a href="/event/1" ap-click-area="promotion">배너1</a>
    <a href="/event/2" ap-click-area="promotion">배너2</a>
  </div>
  <button class="nav-prev">◀</button>  <!-- 버블링 방지 필요 -->
  <button class="nav-next">▶</button>  <!-- 버블링 방지 필요 -->
</div>
```

### 버블링 검증 체크리스트
```
□ 배너 이미지 클릭 시 select_promotion 1회만 발생
□ 배너 텍스트 클릭 시 select_promotion 1회만 발생
□ 슬라이드 화살표 클릭 시 select_promotion 미발생
□ 페이지네이션 점 클릭 시 select_promotion 미발생
□ 터치 스와이프 시 select_promotion 미발생
□ 빠른 연속 클릭 시 중복 발생 방지
□ 자동 슬라이드 전환 시 select_promotion 미발생
```

---

## 10. 클릭 영역 모호성 검증

### 비주얼 vs DOM 불일치 케이스

| 시각적 모습 | DOM 구조 | 위험 |
|-----------|---------|------|
| 클릭 가능해 보이는 영역 | `<div>` (링크 아님) | select_promotion 미발생 |
| 배너 전체가 클릭 가능 | 일부만 `<a>` 태그 | 클릭 위치에 따라 불일치 |
| 작은 CTA 버튼만 보임 | 전체가 `<a>` 태그 | 의도치 않은 클릭 |

### 검증 체크리스트
```
□ 시각적으로 클릭 가능한 영역이 실제 <a> 태그인지 확인
□ 배너 전체 영역에서 일관된 이벤트 발생
□ 호버 시 커서 변경 영역과 클릭 영역 일치
□ 모바일 터치 영역과 데스크톱 클릭 영역 일치
```

---

## 11. 프로모션 퍼널 데이터 일관성 검증

### 프로모션 퍼널 구조

프로모션 이벤트는 **노출 → 클릭** 퍼널 구조를 가집니다.

```
view_promotion → select_promotion → (이벤트/기획전 페이지)
                      ↑
                  현재 위치 (클릭)
```

### 일관성 검증 항목

select_promotion은 **이전 view_promotion 데이터와 일치**해야 합니다.

| 파라미터 | 일치 대상 이벤트 | 검증 기준 |
|---------|----------------|----------|
| `promotion_id` | view_promotion | 동일 프로모션은 동일 ID |
| `promotion_name` | view_promotion | 정확히 일치 |
| `creative_slot` | view_promotion | 위치 정보 일치 |
| `index` | view_promotion | 클릭한 슬라이드 index |

### 불일치 위험 케이스

| 상황 | 위험 | 검증 방법 |
|-----|------|----------|
| 슬라이드 전환 후 클릭 | index 불일치 | 현재 슬라이드 index 확인 |
| view_promotion 미발생 | 노출 없이 클릭만 수집 | view_promotion 발생 확인 |
| 동적 배너 변경 | promotion_name 불일치 | 노출 vs 클릭 시점 비교 |
| DOM 속성 변경 | 클릭 시 다른 데이터 수집 | 속성값 확인 |

### 이전 이벤트와 비교

| 비교 | 검증 항목 | 예상 결과 |
|-----|----------|----------|
| view_promotion → select_promotion | promotion_id | 일치 |
| view_promotion → select_promotion | promotion_name | 일치 |
| view_promotion → select_promotion | creative_slot | 일치 |

### 검증 체크리스트
```
□ 클릭 전 view_promotion이 발생했는지 확인
□ select_promotion의 promotion_id가 view_promotion과 일치
□ select_promotion의 promotion_name이 view_promotion과 일치
□ 슬라이드 배너의 경우 클릭한 슬라이드의 index 정확성
□ 다중 프로모션 중 클릭한 프로모션만 items에 포함
```

---

## 12. 발생 페이지별 검증

### select_promotion 발생 가능 페이지

이 이벤트는 **프로모션 배너가 있는 모든 페이지**에서 발생할 수 있습니다.

| 페이지 | 프로모션 위치 | 특징 |
|-------|-------------|------|
| 메인 페이지 | 히어로 배너 | 메인 발생 페이지 |
| 메인 페이지 | 기획전 배너 | 하단 영역 |
| 카테고리 페이지 | 상단 프로모션 | 카테고리별 이벤트 |
| 상품 상세 페이지 | 관련 이벤트 배너 | 하단 영역 |

### 페이지별 일관성 검증

**동일 프로모션이 여러 페이지에 노출될 때**:

```javascript
// 모든 페이지에서 동일한 데이터가 수집되어야 함
{
  promotion_id: "PROMO_001",     // 모든 페이지에서 동일
  promotion_name: "여름 세일",   // 모든 페이지에서 동일
  creative_slot: "main_hero"    // 위치에 따라 다를 수 있음
}
```

### 크로스페이지 검증 체크리스트
```
□ 메인 페이지에서 클릭: 기준 데이터로 활용
□ 카테고리 페이지에서 동일 프로모션 클릭: promotion_id 일치
□ 다른 페이지에서 동일 프로모션 클릭: promotion_name 일치
□ creative_slot은 페이지별로 다를 수 있음 (위치 정보)
```

---

## 13. 환경별 검증

> **공통 가이드 참조**: [docs/environment-validation-guide.md](../docs/environment-validation-guide.md)
>
> PC/Mobile, 로그인/비로그인 환경별 검증은 공통 가이드를 참조하세요.

### select_promotion 특화 환경 검증

| 환경 | 특이사항 |
|-----|---------|
| Mobile | 배너 스와이프 vs 탭 구분 - 스와이프는 슬라이드 전환, 탭만 클릭 이벤트 |
| PC | 배너 호버 vs 클릭 구분 - 호버만으로 이벤트 미발생 |
| 터치 디바이스 | 터치 영역과 클릭 영역 일치 여부 확인 |
