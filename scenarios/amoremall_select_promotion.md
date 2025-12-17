# select_promotion 테스트 시나리오
## 대상 사이트: https://amoremall.com/kr/ko

---

## 사이트 분석 결과

### 프로모션 영역 식별

#### 1. 메인 히어로 배너 (Key Visual)
- **위치**: 페이지 최상단
- **형태**: 대형 슬라이드 캐러셀 (약 24개 배너 순환)
- **크기**: 750x570px (모바일 최적화)
- **콘텐츠 예시**:
  - VOD(비디오) 배너
  - 이미지 기반 프로모션 배너
  - 메인 텍스트 + 서브 텍스트 구조

#### 2. 브랜드/기획전 배너
- **위치**: 메인 페이지 중간 영역
- **식별된 프로모션**:
  - "홀리추얼" 브랜드 기획전
  - "프리퀀시" 브랜드 기획전
  - "설화수" 브랜드 기획전

#### 3. 이벤트 프로모션 배너
- **식별된 이벤트**:
  - "끝없는 신규고객 혜택" (시간제 프로모션)
  - "E등급 체험기회" (등급별 혜택)
  - "1천만원 주인공 찾기" (경품 이벤트)

#### 4. 퀵메뉴 배너
- **위치**: 메인 페이지 상단
- **형태**: 300x300px 정사각형 배너 8개
- **용도**: 빠른 카테고리/이벤트 접근

---

## 테스트 시나리오

### Scenario 1: 메인 히어로 배너 클릭
```
테스트 ID: SP-001
영역: 메인 페이지 최상단 히어로 배너
```

| 단계 | 액션 | 예상 결과 |
|-----|------|----------|
| 1 | amoremall.com/kr/ko 접속 | 메인 페이지 로드, 히어로 배너 표시 |
| 2 | 첫 번째 히어로 배너 이미지 확인 | 대형 프로모션 이미지, 마케팅 문구 표시 |
| 3 | 히어로 배너 클릭 | 이벤트 상세 페이지로 이동 |
| 4 | GTM 이벤트 확인 | `select_promotion` 이벤트 발생 확인 |

**검증 포인트**:
- [ ] `<a>` 태그에 `ap-data-promotion` 속성 존재
- [ ] `promotion_name` 값이 배너명과 일치
- [ ] `creative_slot` 값이 위치 정보 포함 (예: "main_hero_1")
- [ ] 클릭 후 dataLayer에 이벤트 push 확인

---

### Scenario 2: 슬라이드 배너 전환 후 클릭
```
테스트 ID: SP-002
영역: 메인 히어로 배너 (2번째 이후 슬라이드)
```

| 단계 | 액션 | 예상 결과 |
|-----|------|----------|
| 1 | 메인 페이지 접속 | 첫 번째 슬라이드 표시 |
| 2 | 슬라이드 인디케이터(dot) 또는 화살표로 2번째 배너로 이동 | 2번째 배너 표시 |
| 3 | 2번째 히어로 배너 클릭 | 해당 이벤트 페이지로 이동 |
| 4 | GTM 이벤트 확인 | `select_promotion` 이벤트 발생, index 값 확인 |

**검증 포인트**:
- [ ] 각 슬라이드별로 `ap-data-promotion` 속성 존재
- [ ] `index` 파라미터가 슬라이드 순서와 일치 (2번째 = index: 1 또는 2)
- [ ] 다른 슬라이드 클릭 시 다른 `promotion_name` 전송

---

### Scenario 3: 브랜드 기획전 배너 클릭
```
테스트 ID: SP-003
영역: 브랜드별 기획전 배너 (홀리추얼, 프리퀀시, 설화수 등)
```

| 단계 | 액션 | 예상 결과 |
|-----|------|----------|
| 1 | 메인 페이지 스크롤 | 브랜드 기획전 섹션 노출 |
| 2 | "설화수" 기획전 배너 시각적 확인 | 브랜드 비주얼, 기획전 문구 표시 |
| 3 | 기획전 배너 클릭 | 설화수 기획전 페이지로 이동 |
| 4 | GTM 이벤트 확인 | `select_promotion` 이벤트 발생 |

**검증 포인트**:
- [ ] 기획전 배너에 `ap-data-promotion` 속성 존재
- [ ] `promotion_name`에 "설화수" 또는 기획전명 포함
- [ ] `creative_slot`에 위치 정보 포함 (예: "brand_promotion")

---

### Scenario 4: 이벤트 프로모션 배너 클릭
```
테스트 ID: SP-004
영역: 이벤트 배너 (신규고객 혜택, 경품 이벤트 등)
```

| 단계 | 액션 | 예상 결과 |
|-----|------|----------|
| 1 | "끝없는 신규고객 혜택" 또는 "1천만원 주인공 찾기" 배너 찾기 | 이벤트 배너 표시 |
| 2 | 이벤트 배너 클릭 | 이벤트 상세 페이지로 이동 |
| 3 | GTM 이벤트 확인 | `select_promotion` 이벤트 발생 |

**검증 포인트**:
- [ ] 이벤트 배너에 `ap-data-promotion` 속성 존재
- [ ] `promotion_id` 또는 URL에 planDisplaySn 파라미터 포함
- [ ] 이벤트 참여 페이지로 정상 이동

---

### Scenario 5: 퀵메뉴 배너 클릭
```
테스트 ID: SP-005
영역: 퀵메뉴 영역 (300x300px 정사각형 배너)
```

| 단계 | 액션 | 예상 결과 |
|-----|------|----------|
| 1 | 퀵메뉴 영역 확인 (8개 정사각형 배너) | 카테고리/이벤트 아이콘 배너 표시 |
| 2 | 퀵메뉴 배너 중 하나 클릭 | 해당 페이지로 이동 |
| 3 | GTM 이벤트 확인 | `select_promotion` 또는 관련 이벤트 발생 |

**검증 포인트**:
- [ ] 퀵메뉴가 프로모션인지 카테고리 링크인지 구분
- [ ] 프로모션성 퀵메뉴에만 `select_promotion` 발생

---

## Should NOT Fire 시나리오

### Scenario 6: 상품 카드 클릭 (select_item 대상)
```
테스트 ID: SP-006-NEG
영역: 상품 목록 영역
```

| 단계 | 액션 | 예상 결과 |
|-----|------|----------|
| 1 | 메인 페이지에서 상품 카드 영역 찾기 | 상품 이미지 + 가격 + 상품명 |
| 2 | 상품 카드 클릭 | 상품 상세 페이지로 이동 |
| 3 | GTM 이벤트 확인 | `select_item` 발생, `select_promotion` 미발생 |

**확인 포인트**:
- [ ] 상품 카드에 `ap-data-promotion` 속성 없음
- [ ] `select_item` 이벤트만 발생

---

### Scenario 7: 네비게이션 메뉴 클릭
```
테스트 ID: SP-007-NEG
영역: 헤더 네비게이션
```

| 단계 | 액션 | 예상 결과 |
|-----|------|----------|
| 1 | 헤더의 카테고리 메뉴 클릭 (스킨케어, 메이크업 등) | 카테고리 페이지로 이동 |
| 2 | GTM 이벤트 확인 | `select_promotion` 미발생 |

---

### Scenario 8: 로고/검색창 클릭
```
테스트 ID: SP-008-NEG
영역: 헤더 영역
```

| 단계 | 액션 | 예상 결과 |
|-----|------|----------|
| 1 | 아모레몰 로고 클릭 | 메인 페이지로 이동 |
| 2 | 검색창 클릭 | 검색 UI 활성화 |
| 3 | GTM 이벤트 확인 | `select_promotion` 미발생 |

---

## 구현 Gap 확인 시나리오

### Scenario 9: 트래킹 속성 누락 확인
```
테스트 ID: SP-009-GAP
목적: 프로모션 배너에 트래킹 코드가 누락된 경우 식별
```

| 단계 | 액션 | 확인 사항 |
|-----|------|----------|
| 1 | 개발자 도구(F12) 열기 | Elements 탭 선택 |
| 2 | 히어로 배너 요소 검사 | `<a>` 태그 확인 |
| 3 | `ap-data-promotion` 속성 확인 | 속성 존재 여부 |
| 4 | 속성 값 JSON 유효성 확인 | JSON 파싱 가능 여부 |

**Gap 판단 기준**:
- 시각적으로 프로모션 배너이지만 `ap-data-promotion` 속성 없음 → **구현 필요**
- `<a>` 태그 대신 `<div>`로 구현됨 → **태그 변경 필요**
- 속성 값이 빈 문자열이거나 JSON 오류 → **값 수정 필요**

---

## GTM 트리거 및 변수 구조

### 트리거 방식
```
트리거 타입: LINK_CLICK (링크 클릭)
CSS Selector: a[ap-data-promotion]
이벤트 발생: 링크 클릭 시 GTM이 자동으로 GA4 이벤트 전송
```

**중요**: dataLayer.push로 이벤트를 발생시키는 것이 아니라,
GTM의 LINK_CLICK 트리거가 `a[ap-data-promotion]` 요소 클릭을 감지하여 이벤트를 발생시킴

### GTM 변수 구조
```
변수명: JS - Select Promotion DataLayer
타입: Custom JavaScript Variable
역할: 클릭된 요소에서 프로모션 정보 추출하여 GA4 파라미터로 전달
```

### 변수가 추출하는 정보
```javascript
// JS - Select Promotion DataLayer 변수가 반환하는 구조
{
  items: [{
    promotion_id: "PROMO_2024_SUMMER",      // URL pathname + search에서 추출
    promotion_name: "여름 세일 기획전",       // ap-data-promotion.promotion_name
    creative_slot: "main_hero_1",            // ap-data-promotion.creative_slot
    index: 1                                 // data-swiper-slide-index + 1
  }]
}
```

### GTM 태그 구성
| 구성 요소 | 설정 |
|----------|------|
| 태그 타입 | GA4 Event |
| 이벤트명 | select_promotion |
| 트리거 | Link Click - a[ap-data-promotion] |
| 파라미터 | JS - Select Promotion DataLayer 변수 참조 |

### 파라미터 매핑
| GA4 파라미터 | 출처 | 설명 |
|------------|------|------|
| promotion_id | Click URL pathname + search | 클릭된 링크의 href에서 추출 |
| promotion_name | ap-data-promotion.promotion_name | 요소 속성에서 추출 |
| creative_slot | ap-data-promotion.creative_slot | 요소 속성에서 추출 |
| index | data-swiper-slide-index + 1 | 슬라이드 인덱스 (1부터 시작) |

---

## 테스트 체크리스트

### 필수 확인 항목
- [ ] 모든 히어로 배너 슬라이드에 트래킹 적용
- [ ] 브랜드 기획전 배너 트래킹 적용
- [ ] 이벤트 프로모션 배너 트래킹 적용
- [ ] 퀵메뉴 중 프로모션 성격 배너 트래킹 적용
- [ ] 상품 카드는 select_promotion 미발생 (select_item 사용)
- [ ] 네비게이션/검색은 select_promotion 미발생

### 파라미터 검증
- [ ] promotion_name이 배너 식별 가능한 값
- [ ] creative_slot이 위치 구분 가능한 값
- [ ] index가 슬라이드 순서와 일치
- [ ] JSON 속성값 파싱 오류 없음

---

## 작성일: 2024-12-14
## 대상 이벤트: select_promotion
## 트리거 조건: a[ap-data-promotion] 링크 클릭
