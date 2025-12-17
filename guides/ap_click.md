# ap_click 이벤트 가이드

## 이벤트 정의
**특정 요소를 클릭했을 때** 발생하는 일반 클릭 이벤트입니다.
Amorepacific 사이트에서 트래킹이 필요한 다양한 클릭 액션을 추적합니다.
**사용자 클릭 시** 발생합니다.

---

## 1. 시각적 판단 기준 (Primary - 화면에서 찾기)

### ap_click 대상 요소의 시각적 특징

#### 1) 버튼/링크 요소
- **형태**: 텍스트 링크, 버튼, 아이콘 버튼
- **특징**:
  - 클릭 가능해 보이는 스타일
  - 호버 시 커서 변경
  - 밑줄, 색상 변화 등 인터랙션 힌트

#### 2) 네비게이션 요소
- **위치**: 헤더, 푸터, 사이드바
- **형태**: 메뉴, 카테고리 링크, 탭

#### 3) 기능 버튼
- **예시**:
  - 필터/정렬 옵션
  - 더보기 버튼
  - 공유 버튼
  - 다운로드 버튼

#### 4) 컨텐츠 링크
- **예시**:
  - 이벤트 페이지 링크
  - 고객센터 링크
  - 약관 링크

### ap_click이 아닌 클릭 (전용 이벤트 사용)

| 클릭 요소 | 전용 이벤트 |
|---------|------------|
| 프로모션 배너 | `select_promotion` |
| 상품 카드 | `select_item` |
| 장바구니 담기 | `add_to_cart` |
| 구매하기 | `begin_checkout` |
| 로그인 버튼 | `login` (성공 시) |

---

## 2. GTM 트리거 조건 (검증용)

### 현재 구현된 조건
```
트리거 타입: CLICK 또는 LINK_CLICK
CSS Selector: [사이트별 상이 - site-config.json 참조]
발생 시점: 요소 클릭 시
```

**참고**: CSS Selector는 사이트마다 다릅니다. `sites/{site}/site-config.json`의 `domAttributes` 또는 `eventTriggers.ap_click` 값을 확인하세요.

### 사이트별 CSS Selector 예시
| 사이트 | CSS Selector | 설정 파일 |
|-------|-------------|----------|
| Amoremall | `[ap-click-area], [ap-click-area] *` | `sites/amoremall-kr/site-config.json` |
| Innisfree Shopify | `[ap-data-click]` | `sites/innisfree-shopify/site-config.json` |

### 속성 구조
```html
<!-- ap-click-area 방식 (Amoremall) -->
<button ap-click-area ap-click-name="filter_apply">
  가격순 정렬
</button>

<!-- ap-data-click 방식 (Shopify) -->
<button ap-data-click='{"action":"filter_apply","label":"가격순"}'>
  가격순 정렬
</button>
```

### dataLayer 구조
```javascript
dataLayer.push({
  event: "ap_click",
  click_action: "filter_apply",
  click_label: "가격순",
  click_location: "product_list"
});
```

---

## 3. 분석 판단 프로세스

### Step 1: 시각적으로 클릭 가능 요소 식별
화면에서 다음 특징을 가진 요소를 찾습니다:
- 버튼 스타일 요소
- 링크 텍스트 (밑줄, 색상)
- 아이콘 버튼

### Step 2: 전용 이벤트 여부 확인
다음 요소는 전용 이벤트 사용:
- 프로모션 배너 → select_promotion
- 상품 카드 → select_item
- 장바구니 버튼 → add_to_cart

### Step 3: 트래킹 확인
- 요소에 `ap-data-click` 속성 또는 클릭 트래킹 존재 여부
- 클릭 시 dataLayer push 여부

### Step 4: 결과 분류

#### Case A: 클릭 가능 요소 + 트래킹 있음
→ **Should Fire**: 클릭 시 이벤트 발생

#### Case B: 클릭 가능 요소 + 트래킹 없음
→ **구현 누락**: ap-data-click 속성 또는 트래킹 코드 추가 필요

#### Case C: 전용 이벤트 대상
→ **Should NOT Fire**: select_promotion, select_item 등 사용

---

## 4. 구현 검증 포인트

### 필수 확인 사항
1. **트래킹 대상 요소 식별**
   - 분석에 필요한 클릭 요소 정의
   - 전용 이벤트와 중복되지 않도록 구분

2. **클릭 정보 수집**
   - action: 클릭 액션 유형
   - label: 클릭된 요소 식별 정보
   - location: 클릭 위치 (페이지 영역)

3. **일관된 명명 규칙**
   - action, label 값의 일관성 유지

### 흔한 구현 오류
| 문제 | 증상 | 해결 방법 |
|-----|------|----------|
| 속성 누락 | 클릭 트래킹 안 됨 | ap-data-click 속성 추가 |
| 전용 이벤트와 중복 | 동일 클릭에 두 이벤트 발생 | 전용 이벤트만 사용 |
| 불명확한 label | 클릭 요소 식별 불가 | 명확한 label 값 설정 |

---

## 5. 수집 파라미터

> **중요**: 아래 파라미터는 대표 예시입니다.
> 실제 구현은 사이트별 GTM 설정에 따라 다르므로, **시나리오 설계 시 반드시 GTM 파싱을 통해 실제 파라미터를 확인**해야 합니다.
> GTM 파싱 방법: [docs/gtm-parsing-guide.md](../docs/gtm-parsing-guide.md) 참조

### 이벤트 레벨 파라미터

| 파라미터 | 설명 | 예시 | 필수 |
|---------|------|------|-----|
| click_action | 클릭 액션 유형 | "filter_apply", "share" | O |
| click_label | 클릭 요소 식별자 | "가격순", "카카오톡" | O |
| click_location | 페이지 내 위치 | "header", "product_list" | △ |
| click_url | 이동 URL (링크인 경우) | "/event/summer" | △ |

### DOM 속성 기반 파라미터 (GTM CLICK 트리거)

| 속성 | 설명 | 예시 |
|------|------|------|
| ap-click-area | 클릭 영역 식별자 | "header_menu" |
| ap-click-name | 클릭 이름 | "filter_apply" |
| ap-data-click | JSON 형태 클릭 정보 | '{"action":"filter","label":"가격순"}' |

### 사이트별 추가 파라미터 (Amoremall 기준)

| 파라미터 | 설명 | 예시 |
|---------|------|------|
| page_type | 현재 페이지 타입 | "PRODUCT_LIST", "MAIN" |
| click_text | 클릭된 요소의 텍스트 | "가격순 정렬" |
| click_element | 클릭된 요소 유형 | "button", "link", "icon" |
| click_index | 동일 요소 내 순서 (목록 등) | 1, 2, 3 |

---

## 6. 관련 이벤트

| 이벤트 | 용도 | 구분 |
|-------|------|------|
| `ap_click` | 일반 클릭 트래킹 | 범용 클릭 |
| `select_promotion` | 프로모션 클릭 | 배너 전용 |
| `select_item` | 상품 클릭 | 상품 카드 전용 |
| `add_to_cart` | 장바구니 담기 | 장바구니 전용 |

---

## 7. 시나리오 예시

### Should Fire (클릭 시)
```
- 네비게이션 메뉴 클릭
- 필터/정렬 옵션 클릭
- 더보기 버튼 클릭
- 공유 버튼 클릭 (카카오, 페이스북 등)
- 고객센터/FAQ 링크 클릭
- 푸터 링크 클릭
- 탭 전환 클릭
```

### Should NOT Fire
```
- 프로모션 배너 클릭 → select_promotion
- 상품 카드 클릭 → select_item
- 장바구니 담기 버튼 → add_to_cart
- 결제하기 버튼 → begin_checkout
- 텍스트 선택/드래그 (클릭 아님)
```

### 구현 필요 (Gap)
```
- 클릭 가능 요소인데 트래킹 속성 없음
- 중요한 사용자 액션이지만 클릭 트래킹 누락
- ap-data-click 속성이 있지만 값이 누락됨
- label이 불명확하여 분석 어려움
```

---

## 8. 시나리오 작성 지침

### 트리거 타입: CLICK 또는 LINK_CLICK (DOM 요소 클릭 감지)

이 이벤트는 **GTM의 클릭 트리거**로 발생합니다.
요소에 `ap-data-click` 속성이 있으면 GTM이 클릭을 감지하여 이벤트를 발생시킵니다.

### 시나리오에 포함할 내용
```
O 포함해야 함:
- GTM 트리거 조건 (CSS Selector)
- DOM 속성 구조 (ap-data-click)
- 예상 dataLayer 구조 (트리거에 따라 다름)
- 클릭 파라미터 (action, label, location)

X 포함하지 않음:
- 전용 이벤트 대상 (select_promotion, select_item 등) 혼동
```

### DOM 속성 구조

**사이트별 속성명 확인 필수**: `sites/{site}/site-config.json` → `domAttributes`

```html
<!-- Amoremall 방식 -->
<button ap-click-area ap-click-name="filter_apply">
  가격순 정렬
</button>

<!-- Shopify 방식 -->
<button ap-data-click='{"action":"filter_apply","label":"가격순"}'>
  가격순 정렬
</button>
```

### 예상 dataLayer 구조 (시나리오에 포함)
```javascript
dataLayer.push({
  event: "ap_click",
  click_action: "filter_apply",
  click_label: "가격순",
  click_location: "product_list"
});
```

### 검증 포인트
```
1. DOM 요소 확인:
   - 클릭 대상 요소에 ap-data-click 속성 존재 여부
   - 속성값의 JSON 유효성

2. 전용 이벤트와 구분:
   - 프로모션 배너 → select_promotion (ap-data-promotion)
   - 상품 카드 → select_item (ap-data-item)
   - 장바구니 버튼 → add_to_cart
   - 일반 클릭만 ap_click 사용
```

---

## 9. 이벤트 버블링 위험

### 버블링 발생 시나리오

이 이벤트는 **CLICK/LINK_CLICK 트리거**를 사용하므로, 중첩된 DOM 구조에서 버블링 이슈가 발생할 수 있습니다.

```html
<!-- 중첩 구조 예시 -->
<button ap-click-area ap-click-name="filter_toggle" class="filter-btn">
  <span class="icon">🔽</span>
  <span class="text">필터</span>
</button>

<!-- 드롭다운 메뉴 구조 -->
<div class="dropdown" ap-click-area ap-click-name="menu_open">
  <button class="trigger">메뉴</button>
  <ul class="menu">
    <li ap-click-area ap-click-name="menu_item_1">옵션1</li>
    <li ap-click-area ap-click-name="menu_item_2">옵션2</li>
  </ul>
</div>
```

### 버블링 위험 케이스

| 상황 | 위험 | 검증 방법 |
|-----|------|----------|
| 아이콘 영역 클릭 | 버튼 + 아이콘 중복 발생 | 아이콘만 클릭 테스트 |
| 드롭다운 메뉴 항목 클릭 | 메뉴 항목 + 드롭다운 동시 발생 | 메뉴 항목 클릭 테스트 |
| 중첩된 클릭 요소 | 자식 + 부모 이벤트 동시 발생 | 계층별 클릭 테스트 |
| 텍스트 영역 클릭 | 정상 발생 확인 | 텍스트만 클릭 테스트 |

### 중첩 요소 클릭 시 예상 결과

| 클릭 위치 | 예상 결과 | 위험 |
|---------|----------|------|
| 버튼 아이콘 | ap_click 1회 | 정상 |
| 버튼 텍스트 | ap_click 1회 | 정상 |
| 드롭다운 메뉴 항목 | menu_item만 (menu_open X) | 2회 발생 위험 |
| 중첩 버튼 내부 요소 | 해당 버튼만 | 부모도 발생 위험 |

### 전용 이벤트와 충돌 케이스

| 상황 | 위험 | 올바른 동작 |
|-----|------|-----------|
| 상품 카드 내 "더보기" 버튼 | ap_click + select_item 동시 발생 | ap_click만 발생 |
| 배너 내 "닫기" 버튼 | ap_click + select_promotion 동시 발생 | ap_click만 발생 |
| 장바구니 팝업 내 링크 | ap_click + add_to_cart 혼동 | 명확한 구분 필요 |

### 버블링 검증 체크리스트
```
□ 버튼 아이콘 클릭 시 ap_click 1회만 발생
□ 버튼 텍스트 클릭 시 ap_click 1회만 발생
□ 중첩 요소 클릭 시 가장 구체적인 요소만 발생
□ 드롭다운 메뉴 항목 클릭 시 해당 항목만 발생
□ 전용 이벤트 영역 내 클릭 시 ap_click 미발생
□ 빠른 연속 클릭 시 중복 발생 방지
```

---

## 10. 전용 이벤트 충돌 방지

### ap_click vs 전용 이벤트 구분

이 이벤트는 **범용 클릭 이벤트**이므로, 전용 이벤트와 명확히 구분되어야 합니다.

| 클릭 요소 | 전용 이벤트 | ap_click 사용 여부 |
|---------|------------|------------------|
| 프로모션 배너 | select_promotion | X (전용 이벤트만) |
| 상품 카드 | select_item | X (전용 이벤트만) |
| 장바구니 담기 | add_to_cart | X (전용 이벤트만) |
| 필터/정렬 버튼 | 없음 | O (ap_click 사용) |
| 메뉴/탭 전환 | 없음 | O (ap_click 사용) |
| 공유 버튼 | 없음 | O (ap_click 사용) |

### 충돌 방지 검증 체크리스트
```
□ 프로모션 배너 클릭 시 ap_click 미발생
□ 상품 카드 클릭 시 ap_click 미발생
□ 장바구니 담기 시 ap_click 미발생
□ 결제 버튼 클릭 시 ap_click 미발생
□ 일반 UI 요소만 ap_click 발생
```

---

## 11. 환경별 검증

> **공통 가이드 참조**: [docs/environment-validation-guide.md](../docs/environment-validation-guide.md)
>
> PC/Mobile, 로그인/비로그인 환경별 검증은 공통 가이드를 참조하세요.

### ap_click 특화 환경 검증

| 환경 | 특이사항 |
|-----|---------|
| Mobile | 탭 영역과 클릭 영역 일치 확인, 터치 타겟 크기 검증 |
| PC | 호버 상태에서 나타나는 UI 요소 클릭 테스트 |
| 키보드 접근성 | Tab+Enter로 클릭 시 동일하게 이벤트 발생 확인 |
