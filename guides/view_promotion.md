# view_promotion 이벤트 가이드

## 이벤트 정의
**프로모션 배너가 화면에 노출될 때** 발생하는 이벤트입니다.
사용자의 클릭 없이, 페이지 로드 시 프로모션이 화면에 보이면 자동으로 발생합니다.
**클릭이 아닌 노출 시 자동 발생**합니다.

---

## 1. 시각적 판단 기준 (Primary - 화면에서 찾기)

### 프로모션 노출 영역의 시각적 특징

#### 1) 메인 히어로 배너 (Key Visual)
- **위치**: 페이지 최상단, 전체 너비 차지
- **형태**: 대형 이미지 배너, 캐러셀/슬라이드
- **시각 요소**:
  - 고해상도 캠페인 이미지
  - 마케팅 문구 ("~% 할인", "SALE", "신제품")
  - CTA 버튼 ("자세히 보기", "SHOP NOW")
  - 슬라이드 인디케이터 (dot navigation)

#### 2) 프로모션 배너 카드
- **위치**: 메인 페이지 중간 영역
- **형태**: 기획전/이벤트 배너
- **시각 요소**:
  - 캠페인 비주얼
  - 이벤트명/기획전명
  - 기간 정보

#### 3) 팝업/모달 프로모션
- **형태**: 화면 중앙 팝업
- **시각 요소**:
  - 프로모션 이미지
  - 닫기 버튼
  - "오늘 하루 보지 않기" 옵션

### 프로모션 영역이 아닌 화면 (시각적 구분)

| 화면 | 특징 | 해당 이벤트 |
|-----|------|--------------|
| 상품 카드 영역 | 상품 이미지 + 가격 | `view_item_list` |
| 상품 상세 페이지 | 단일 상품 정보 | `view_item` |
| 카테고리 메뉴 | 네비게이션 링크 | 없음 |

---

## 2. GTM 트리거 조건 (검증용)

### 현재 구현된 조건
```
트리거 타입: CUSTOM_EVENT (dataLayer push) 또는 DOM_READY
Custom Event: [사이트별 상이 - site-config.json 참조]
발생 시점: 페이지 DOM 로드 완료 시 자동 발생
측정 대상: 메인 페이지 Key Visual 영역
```

### 사이트별 dataLayer event명 예시
| 사이트 | dataLayer event | GA4 이벤트 | 설정 파일 |
|-------|-----------------|-----------|----------|
| Amoremall | `view_promotion` | `view_promotion` | `sites/amoremall-kr/site-config.json` |
| Innisfree Shopify | `view_promotion` | `view_promotion` | `sites/innisfree-shopify/site-config.json` |

**참고**: 실제 `event` 값은 사이트마다 다를 수 있습니다. `sites/{site}/site-config.json`의 `eventMapping.view_promotion` 값을 확인하세요.

### 발생 조건
```
- 메인 페이지 로드 완료 시
- Key Visual (히어로 배너)이 viewport에 노출될 때
- 프로모션 슬라이드가 화면에 보일 때
```

### dataLayer 구조

**참고**: 실제 `event` 값은 사이트마다 다릅니다. `sites/{site}/site-config.json`의 `eventMapping.view_promotion` 값을 확인하세요.

```javascript
// GA4 이벤트: view_promotion
// dataLayer event명은 사이트별 설정 참조
dataLayer.push({
  event: "[eventMapping.view_promotion]",  // 예: "view_promotion"
  ecommerce: {
    items: [{
      promotion_id: "PROMO_001",
      promotion_name: "여름 세일",
      creative_slot: "main_hero"
    }]
  }
});
```

---

## 3. 분석 판단 프로세스

### Step 1: 시각적으로 프로모션 영역 식별
화면에서 다음 특징을 가진 영역을 찾습니다:
- 대형 배너 이미지
- 마케팅/캠페인 문구
- 전체 너비 또는 강조된 영역

### Step 2: 페이지 타입 확인
다음 기준으로 확인합니다:
- **메인 페이지**: 프로모션 배너 위주
- **카테고리 페이지**: 상품 목록 위주
- **상품 상세 페이지**: 단일 상품 위주

### Step 3: 트래킹 확인
- 페이지 로드 시 dataLayer에 `view_promotion` push 여부
- 프로모션 정보 포함 여부

### Step 4: 결과 분류

#### Case A: 프로모션 노출 + 트래킹 있음
→ **Should Fire**: 페이지 로드 시 자동 이벤트 발생

#### Case B: 프로모션 노출 + 트래킹 없음
→ **구현 누락**: dataLayer push 코드 추가 필요

#### Case C: 상품 목록/상세 페이지
→ **Should NOT Fire**: 다른 이벤트 대상

---

## 4. 구현 검증 포인트

### 필수 확인 사항
1. **메인 페이지 프로모션 노출**
   - 히어로 배너 노출 시 발생
   - 여러 슬라이드가 있으면 현재 보이는 슬라이드

2. **발생 시점**
   - 페이지 로드 완료 시 자동
   - 사용자 클릭 불필요

3. **슬라이드 배너 처리**
   - 자동 전환 시 각 슬라이드별 발생 여부 확인

### 흔한 구현 오류
| 문제 | 증상 | 해결 방법 |
|-----|------|----------|
| 노출 트래킹 없음 | 클릭만 트래킹 | view_promotion 추가 |
| 슬라이드 누락 | 첫 슬라이드만 트래킹 | 자동 전환 시에도 발생 |
| 페이지 타입 혼동 | 모든 페이지에서 발생 | 메인 페이지만 적용 |
| **dataLayer 중복 push** | 동일 프로모션 view_promotion 2회 발생 | dataLayer push 호출 지점 확인 |

---

## 5. 수집 파라미터

> **중요**: 아래 파라미터는 대표 예시입니다.
> 실제 구현은 사이트별 GTM 설정에 따라 다르므로, **시나리오 설계 시 반드시 GTM 파싱을 통해 실제 파라미터를 확인**해야 합니다.
> GTM 파싱 방법: [docs/gtm-parsing-guide.md](../docs/gtm-parsing-guide.md) 참조

### 이벤트 레벨 파라미터

| 파라미터 | 설명 | 예시 |
|---------|------|------|
| event_category | 이벤트 카테고리 | "ecommerce" |
| event_action | 이벤트 액션 | "view promotion" |
| items | 프로모션 배열 | [{...}] |

### items 배열 파라미터

| 파라미터 | 설명 | 예시 | 필수 |
|---------|------|------|-----|
| promotion_id | 프로모션 고유 ID | "PROMO_001" | O |
| promotion_name | 프로모션명 | "여름 세일" | O |
| creative_slot | 배너 위치 | "main_hero" | △ |
| creative_name | 크리에이티브명 | "summer_sale_v1" | △ |
| index | 슬라이드 순서 | 0 | △ |

### 사이트별 추가 파라미터 (Amoremall 예시)

| 파라미터 | 설명 | GTM 변수 |
|---------|------|----------|
| apg_brand_code | APG 브랜드 코드 | item.apg_brand_code |
| internal_brand_code | 내부 브랜드 코드 | item.internal_brand_code |

---

## 6. 관련 이벤트

| 이벤트 | 발생 시점 | 구분 |
|-------|----------|------|
| `view_promotion` | 프로모션 노출 | 자동 발생 (노출) |
| `select_promotion` | 프로모션 클릭 | 사용자 클릭 필요 |

---

## 7. 시나리오 예시

### Should Fire (페이지 로드 시)
```
- 메인 페이지 로드 시 히어로 배너 노출
- 프로모션 슬라이드 자동 전환 시 새 배너 노출
- 프로모션 팝업 표시 시
- 스크롤하여 프로모션 영역이 viewport에 들어올 때 (구현에 따라)
```

### Should NOT Fire
```
- 상품 상세 페이지 로드 → view_item
- 카테고리 페이지 로드 → view_item_list
- 프로모션 배너 클릭 → select_promotion
- 로그인/마이페이지 로드
```

### 구현 필요 (Gap)
```
- 메인 페이지 히어로 배너인데 노출 트래킹 없음
- select_promotion만 있고 view_promotion 없음
- 슬라이드 배너 자동 전환 시 트래킹 누락
- 프로모션 팝업 노출 시 트래킹 없음
```

### 상세 시나리오 매트릭스

| 시나리오 | 진행방법 | 발생해야 하는 상황 | 발생하면 안 되는 상황 | 주요 검수 포인트 |
|---------|---------|------------------|---------------------|----------------|
| **프로모션 노출 확인** | 페이지 랜딩시 프로모션 확인 | 사용자가 페이지나 앱 섹션에 진입하여 프로모션 콘텐츠가 화면에 표시될 때 | 프로모션 콘텐츠가 아직 로드되지 않았거나 전혀 보이지 않을 때 프로모션 뷰 이벤트가 발생하는 경우 | 프로모션 콘텐츠의 가시성 확인, 이벤트 발생 타이밍 확인 |
| **스크롤에 의한 프로모션 뷰** | 스크롤 내려서 프로모션 확인 | 사용자가 스크롤을 내려 특정 프로모션을 뷰포트 내에서 처음 보게 될 때 | 스크롤 없이 페이지 로드와 동시에 이벤트가 발생하는 경우 | 스크롤 감지 기능 검증, 스크롤 위치에서의 이벤트 발생 확인 |
| **동적 콘텐츠 로드 시** | 팝업 콘텐츠 노출 확인 | AJAX나 다른 비동기 방식으로 페이지 콘텐츠가 로드되면서 프로모션 콘텐츠가 로드될 때 | 동적 콘텐츠 로딩 중이거나 실패했을 때 이벤트가 발생하는 경우 | 비동기 로딩 메커니즘의 정확성, 로드 완료 후 이벤트 발생 검증 |
| **다중 프로모션 페이지** | 미적용 | 페이지 내에 여러 프로모션이 있을 경우 각각의 프로모션이 사용자에게 노출될 때 | 한 프로모션의 뷰 이벤트가 다른 프로모션에 대해서도 잘못 발생하는 경우 | 각 프로모션 별 이벤트 독립성 검증, 프로모션 식별자의 정확성 확인 |

### 시나리오별 상세 검증 항목

#### 1) 프로모션 노출 확인
```
진행 방법:
1. 프로모션이 있는 페이지에 접근
2. 페이지 로드 완료 후 프로모션 배너 확인
3. dataLayer에서 view_promotion 이벤트 확인

검증 항목:
□ 사용자가 페이지에 진입하여 프로모션 콘텐츠가 화면에 표시될 때 view_promotion 발생
□ 프로모션 콘텐츠가 아직 로드되지 않았을 때 미발생
□ 프로모션 콘텐츠가 전혀 보이지 않을 때 미발생
□ 프로모션 콘텐츠의 가시성 확인
□ 이벤트 발생 타이밍이 노출 시점과 일치하는지 확인
□ promotion_id, promotion_name 등 파라미터 정확성 확인
```

#### 2) 스크롤에 의한 프로모션 뷰
```
진행 방법:
1. 프로모션이 스크롤 아래에 위치한 페이지 접근
2. 페이지 로드 시점에 dataLayer 확인 (미발생 확인)
3. 스크롤하여 프로모션 영역이 뷰포트에 진입
4. 뷰포트 진입 시 dataLayer 확인

검증 항목:
□ 스크롤을 내려 프로모션을 뷰포트 내에서 처음 보게 될 때 view_promotion 발생
□ 스크롤 없이 페이지 로드와 동시에 이벤트 미발생 (하단 프로모션의 경우)
□ 스크롤 감지 기능이 정상 작동하는지 검증
□ 스크롤 위치에서 정확한 타이밍에 이벤트 발생 확인
□ 동일 프로모션 재노출 시 중복 발생 여부 확인 (정책에 따라)
```

#### 3) 동적 콘텐츠 로드 시
```
진행 방법:
1. 팝업 또는 모달로 프로모션이 표시되는 페이지 접근
2. 팝업 트리거 동작 수행 (버튼 클릭 등)
3. 프로모션 팝업 로드 완료 확인
4. dataLayer에서 view_promotion 이벤트 확인

검증 항목:
□ AJAX/비동기 방식으로 프로모션 콘텐츠가 로드될 때 view_promotion 발생
□ 동적 콘텐츠 로딩 중일 때 미발생
□ 로드 실패했을 때 이벤트 미발생
□ 비동기 로딩 메커니즘의 정확성 확인
□ 로드 완료 후 적절한 시점에 이벤트 발생 검증
□ 팝업 닫기 후 재오픈 시 이벤트 발생 여부 확인 (정책에 따라)
```

#### 4) 다중 프로모션 페이지
```
진행 방법:
1. 여러 프로모션이 있는 페이지 접근
2. 각 프로모션이 순차적으로 뷰포트에 노출되도록 스크롤
3. 각 프로모션별 view_promotion 이벤트 확인

검증 항목:
□ 페이지 내 여러 프로모션이 있을 경우 각각 노출 시 개별 view_promotion 발생
□ 한 프로모션의 뷰 이벤트가 다른 프로모션에 대해 잘못 발생하지 않음
□ 각 프로모션 별 이벤트 독립성 검증
□ promotion_id, promotion_name 등 식별자가 각 프로모션과 정확히 매칭
□ 슬라이드 배너의 경우 각 슬라이드별 개별 이벤트 발생 확인
□ items 배열에 각 프로모션 정보가 정확히 포함되는지 확인
```

#### 5) dataLayer 중복 push로 인한 중복 발생 (주의 케이스)
```
발생 상황:
- 프로모션 노출 시 view_promotion 이벤트가 2회 이상 발생
- 동일한 프로모션인데 이벤트가 중복으로 수집됨

원인 분석 방법:
1. 개발자 도구 Console에서 dataLayer 확인
2. dataLayer.filter(e => e.event === 'view_promotion') 실행
3. view_promotion 이벤트가 몇 번 push되었는지 확인

일반적인 중복 push 원인:
□ 프론트엔드 코드에서 dataLayer.push가 2회 호출됨
□ DOM Ready + 슬라이드 초기화 시 각각 push
□ 컴포넌트 렌더링 시 중복 실행 (React 등 SPA에서 발생 가능)
□ GTM 태그 설정에서 중복 트리거 적용
□ 페이지 로드와 슬라이드 자동 전환에서 동일 배너 중복 push

검증 항목:
□ dataLayer에서 view_promotion 이벤트 push 횟수 확인
□ 동일 promotion_id에 대해 중복 발생하는지 확인
□ 발생 시점(timestamp) 확인하여 어느 지점에서 중복되는지 분석
□ 개발팀에 중복 push 지점 수정 요청

디버깅 코드 (Console에서 실행):
dataLayer.filter(e => e.event === 'view_promotion').forEach((e, i) => {
  console.log('view_promotion push #' + (i+1), e);
});
```

---

## 8. 시나리오 작성 지침

### 트리거 타입: DOM_READY 또는 CUSTOM_EVENT

이 이벤트는 **페이지 로드 시 자동 발생**하거나 **dataLayer.push로 발생**합니다.
프로모션 영역이 화면에 노출되면 GTM이 자동으로 이벤트를 전송합니다.

### 시나리오에 포함할 내용
```
O 포함해야 함:
- 예상 dataLayer 구조 (dataLayer.push 코드)
- event 이름 (view_promotion)
- ecommerce 객체 구조
- items 배열 내 프로모션 파라미터

X 포함하지 않음:
- 클릭 트리거 관련 내용 (view_promotion은 노출 이벤트)
- select_promotion과 혼동하지 않도록 주의
```

### 예상 dataLayer 구조 (시나리오에 포함)
```javascript
dataLayer.push({
  event: "view_promotion",
  ecommerce: {
    items: [{
      promotion_id: "PROMO_001",
      promotion_name: "여름 세일",
      creative_slot: "main_hero",
      index: 0
    }]
  }
});
```

### 검증 포인트
```
1. dataLayer 확인:
   - 개발자도구 Console에서 dataLayer 배열 확인
   - view_promotion 이벤트 객체가 push되는지 확인

2. 발생 시점 확인:
   - 페이지 로드 시 자동 발생 (클릭 없이)
   - 프로모션 배너가 viewport에 노출될 때
   - select_promotion (클릭)과 구분
```

---

## 9. 프로모션 퍼널 데이터 일관성 검증

### 프로모션 퍼널 구조

프로모션 이벤트도 **노출 → 클릭** 퍼널 구조를 가집니다.

```
view_promotion → select_promotion → (이벤트/기획전 페이지)
      ↑
  현재 위치 (노출)
```

### 일관성 검증 항목

view_promotion에서 수집된 프로모션 데이터는 **이후 select_promotion과 일치**해야 합니다.

| 파라미터 | 일치 대상 이벤트 | 검증 기준 |
|---------|----------------|----------|
| `promotion_id` | select_promotion | 동일 프로모션은 동일 ID |
| `promotion_name` | select_promotion | 정확히 일치 |
| `creative_slot` | select_promotion | 위치 정보 일치 |
| `index` | select_promotion | 슬라이드 순서 일치 |

### 불일치 위험 케이스

| 상황 | 위험 | 검증 방법 |
|-----|------|----------|
| 슬라이드 자동 전환 | 노출된 슬라이드 vs 클릭된 슬라이드 | index 값 비교 |
| 여러 프로모션 노출 | items 배열 순서 불일치 | 클릭 시 해당 프로모션만 포함 확인 |
| 프로모션 데이터 변경 | promotion_name 불일치 | 노출 vs 클릭 시점 비교 |
| 동적 배너 | 페이지 로드 후 변경 | 최종 노출 데이터 확인 |

### 검증 체크리스트
```
□ view_promotion의 promotion_id가 select_promotion과 일치
□ view_promotion의 promotion_name이 select_promotion과 일치
□ view_promotion의 creative_slot이 select_promotion과 일치
□ 슬라이드 배너의 경우 index 값 일치 확인
```

---

## 10. 다중 프로모션 노출 검증

### 여러 프로모션 동시 노출 시나리오

페이지에 여러 프로모션이 노출되는 경우, items 배열에 모든 프로모션이 포함되어야 합니다.

```javascript
// 메인 페이지 - 히어로 배너 + 하단 기획전 배너
{
  event: "view_promotion",
  ecommerce: {
    items: [
      { promotion_id: "HERO_001", promotion_name: "여름 세일", creative_slot: "main_hero" },
      { promotion_id: "EVENT_001", promotion_name: "신제품 출시", creative_slot: "main_event" }
    ]
  }
}
```

### 슬라이드 배너 처리

| 상황 | 예상 동작 | 검증 방법 |
|-----|----------|----------|
| 첫 슬라이드 노출 | view_promotion 발생 (index: 0) | 페이지 로드 시 확인 |
| 자동 전환 | 각 슬라이드마다 view_promotion 발생 | 자동 전환 대기 후 확인 |
| 수동 전환 | 새 슬라이드 view_promotion 발생 | 화살표 클릭 후 확인 |

### 다중 노출 검증 체크리스트
```
□ 페이지의 모든 프로모션이 items에 포함
□ 각 프로모션의 creative_slot이 구분됨
□ 슬라이드 자동 전환 시 새 슬라이드 이벤트 발생
□ 중복 노출 방지 (동일 프로모션 재전송 여부)
```

---

## 11. 환경별 검증

> **공통 가이드 참조**: [docs/environment-validation-guide.md](../docs/environment-validation-guide.md)
>
> PC/Mobile, 로그인/비로그인 환경별 검증은 공통 가이드를 참조하세요.

### view_promotion 특화 환경 검증

| 환경 | 특이사항 |
|-----|---------|
| Mobile | 슬라이드 스와이프 시 새 배너 노출 이벤트 발생 확인 |
| PC | 자동 슬라이드 전환 시 각 배너별 이벤트 발생 확인 |
| 팝업 차단 | 팝업 프로모션이 차단된 경우 이벤트 미발생 확인 |
