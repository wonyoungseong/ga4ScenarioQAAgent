# 통합 테스트 매트릭스

## 개요

하나의 사용자 액션을 테스트할 때, 해당 액션에서 **발생해야 하는 이벤트**와 **발생하면 안 되는 이벤트**를 함께 검증합니다.
이를 통해 동일한 액션을 여러 이벤트 테스트에서 중복으로 수행하는 것을 방지합니다.

---

## 페이지 로드 이벤트 매트릭스

### 메인 페이지 로드

| 구분 | 이벤트 | 검증 포인트 |
|-----|-------|------------|
| **O 발생** | `page_view` | 페이지 로드 시 발생 |
| **O 발생** | `view_promotion` | 히어로 배너 노출 시 발생 |
| **X 미발생** | `view_item` | 상품 상세 페이지 아님 |
| **X 미발생** | `view_item_list` | 상품 목록 페이지 아님 |
| **X 미발생** | `view_cart` | 장바구니 페이지 아님 |
| **X 미발생** | `begin_checkout` | 결제 페이지 아님 |

---

### 카테고리/상품 목록 페이지 로드

| 구분 | 이벤트 | 검증 포인트 |
|-----|-------|------------|
| **O 발생** | `page_view` | 페이지 로드 시 발생 |
| **O 발생** | `view_item_list` | 상품 목록 노출 시 발생 |
| **X 미발생** | `view_item` | 상품 상세 페이지 아님 |
| **X 미발생** | `view_search_results` | 검색 결과 페이지 아님 (URL에 검색어 없음) |
| **X 미발생** | `view_promotion` | 메인 히어로 배너 없음 |

---

### 검색 결과 페이지 로드

| 구분 | 이벤트 | 검증 포인트 |
|-----|-------|------------|
| **O 발생** | `page_view` | 페이지 로드 시 발생 |
| **O 발생** | `view_search_results` | search_term 포함하여 발생 |
| **X 미발생** | `view_item_list` | 검색 결과는 별도 이벤트 사용 (사이트별 상이) |
| **X 미발생** | `view_item` | 상품 상세 페이지 아님 |

---

### 상품 상세 페이지 로드

| 구분 | 이벤트 | 검증 포인트 |
|-----|-------|------------|
| **O 발생** | `page_view` | 페이지 로드 시 발생 |
| **O 발생** | `view_item` | 상품 정보 포함하여 발생 |
| **X 미발생** | `view_item_list` | 목록 페이지 아님 |
| **X 미발생** | `add_to_cart` | 장바구니 담기 클릭 전 |
| **X 미발생** | `select_item` | 이미 상세 페이지 진입 완료 |

---

### 장바구니 페이지 로드

| 구분 | 이벤트 | 검증 포인트 |
|-----|-------|------------|
| **O 발생** | `page_view` | 페이지 로드 시 발생 |
| **O 발생** | `view_cart` | 담긴 상품 정보 포함하여 발생 |
| **X 미발생** | `view_item` | 상품 상세 페이지 아님 |
| **X 미발생** | `begin_checkout` | 결제 버튼 클릭 전 |
| **X 미발생** | `add_to_cart` | 이미 장바구니에 담긴 상태 |

---

### 주문서(결제) 페이지 로드

| 구분 | 이벤트 | 검증 포인트 |
|-----|-------|------------|
| **O 발생** | `page_view` | 페이지 로드 시 발생 |
| **O 발생** | `begin_checkout` | 결제 대상 상품 포함하여 발생 |
| **X 미발생** | `view_cart` | 장바구니 페이지 아님 |
| **X 미발생** | `purchase` | 결제 완료 전 |

---

### 주문 완료 페이지 로드

| 구분 | 이벤트 | 검증 포인트 |
|-----|-------|------------|
| **O 발생** | `page_view` | 페이지 로드 시 발생 |
| **O 발생** | `purchase` | transaction_id 필수 포함 |
| **X 미발생** | `begin_checkout` | 결제 이미 완료 |
| **X 미발생** | `view_cart` | 장바구니 페이지 아님 |

---

## 클릭 이벤트 매트릭스

### 프로모션 배너 클릭

| 구분 | 이벤트 | 검증 포인트 |
|-----|-------|------------|
| **O 발생** | `select_promotion` | ap-data-promotion 속성에서 정보 추출 |
| **X 미발생** | `select_item` | 상품 카드가 아님 |
| **X 미발생** | `add_to_cart` | 장바구니 담기가 아님 |
| **X 미발생** | `ap_click` | 전용 이벤트 사용 |

---

### 상품 카드 클릭 (목록에서 상세로 이동)

| 구분 | 이벤트 | 검증 포인트 |
|-----|-------|------------|
| **O 발생** | `select_item` | 클릭된 상품 정보 포함 |
| **X 미발생** | `select_promotion` | 프로모션 배너가 아님 |
| **X 미발생** | `add_to_cart` | 장바구니 담기가 아님 |
| **X 미발생** | `view_item` | 아직 상세 페이지 로드 전 (이동 후 발생) |

---

### 장바구니 담기 버튼 클릭 (성공 시)

| 구분 | 이벤트 | 검증 포인트 |
|-----|-------|------------|
| **O 발생** | `add_to_cart` | 추가된 상품, 수량 포함 |
| **X 미발생** | `select_item` | 상품 선택이 아닌 담기 액션 |
| **X 미발생** | `begin_checkout` | 결제 시작이 아님 |
| **X 미발생** | `view_cart` | 장바구니 페이지 이동 아님 |

---

### 장바구니 상품 삭제 (성공 시)

| 구분 | 이벤트 | 검증 포인트 |
|-----|-------|------------|
| **O 발생** | `remove_from_cart` | 삭제된 상품 정보 포함 |
| **X 미발생** | `add_to_cart` | 담기가 아닌 삭제 |
| **X 미발생** | `view_cart` | 이미 장바구니 페이지에 있음 |

---

### 결제하기 버튼 클릭 (장바구니에서)

| 구분 | 이벤트 | 검증 포인트 |
|-----|-------|------------|
| **X 미발생** | `add_to_cart` | 담기가 아님 |
| **X 미발생** | `purchase` | 결제 완료 전 |
| **O 다음 페이지** | `begin_checkout` | 주문서 페이지 로드 시 발생 |

---

### 네비게이션 메뉴 클릭

| 구분 | 이벤트 | 검증 포인트 |
|-----|-------|------------|
| **O 가능** | `ap_click` | 트래킹 설정된 경우 |
| **X 미발생** | `select_promotion` | 프로모션이 아님 |
| **X 미발생** | `select_item` | 상품이 아님 |
| **X 미발생** | `add_to_cart` | 담기가 아님 |

---

## 사용자 인증 이벤트 매트릭스

### 로그인 성공

| 구분 | 이벤트 | 검증 포인트 |
|-----|-------|------------|
| **O 발생** | `login` | method 파라미터 포함 |
| **X 미발생** | `sign_up` | 기존 회원 로그인 |

---

### 회원가입 완료

| 구분 | 이벤트 | 검증 포인트 |
|-----|-------|------------|
| **O 발생** | `sign_up` | method 파라미터 포함 |
| **O 가능** | `login` | 가입 후 자동 로그인 시 함께 발생 가능 |

---

## 스크롤 이벤트 매트릭스

### 페이지 스크롤 (50% 도달)

| 구분 | 이벤트 | 검증 포인트 |
|-----|-------|------------|
| **O 발생** | `scroll` | scroll_depth: 50 |
| **X 미발생** | `select_item` | 클릭이 아님 |
| **X 미발생** | `view_item_list` | 페이지 로드 시 이미 발생 |

---

## 통합 테스트 시나리오 예시

### 시나리오: 메인 → 상품 목록 → 상품 상세 → 장바구니 담기

```
Step 1: 메인 페이지 로드
├── O 발생 확인: page_view, view_promotion
└── X 미발생 확인: view_item, view_item_list, view_cart

Step 2: 카테고리 메뉴 클릭
├── O 가능: ap_click (설정된 경우)
└── X 미발생 확인: select_promotion, select_item

Step 3: 카테고리 페이지 로드
├── O 발생 확인: page_view, view_item_list
└── X 미발생 확인: view_item, view_search_results

Step 4: 상품 카드 클릭
├── O 발생 확인: select_item
└── X 미발생 확인: select_promotion, add_to_cart

Step 5: 상품 상세 페이지 로드
├── O 발생 확인: page_view, view_item
└── X 미발생 확인: view_item_list, add_to_cart

Step 6: 장바구니 담기 클릭 (성공)
├── O 발생 확인: add_to_cart
└── X 미발생 확인: select_item, begin_checkout
```

---

## 트리거 타입별 분류

### LINK_CLICK 트리거 이벤트 (DOM 요소 클릭 감지)
- `select_promotion` - a[ap-data-promotion]
- `select_item` - a[ap-data-item] (추정)
- `ap_click` - [ap-data-click]

### CUSTOM_EVENT 트리거 이벤트 (dataLayer.push)
- `add_to_cart` - event: "addcart"
- `remove_from_cart` - event: "removecart"
- `view_item` - event: "product"
- `view_item_list` - event: "view_item_list"
- `view_cart` - event: "view_cart"
- `begin_checkout` - event: "checkout"
- `purchase` - event: "purchase"
- `login` - event: "login"
- `sign_up` - event: "sign_up"
- `view_search_results` - event: "view_search_results"
- `write_review` - event: "write_review"
- `view_promotion` - event: "view_promotion"

### 특수 트리거 이벤트
- `page_view` - PAGEVIEW / HISTORY_CHANGE
- `scroll` - SCROLL_DEPTH

---

## 테스트 효율화 가이드

### 1. 하나의 액션으로 다중 이벤트 검증
각 테스트 액션 수행 시, 발생해야 하는 이벤트와 발생하면 안 되는 이벤트를 **동시에** 검증합니다.

### 2. 중복 테스트 방지
예를 들어 "상품 카드 클릭 시 select_promotion이 발생하지 않아야 한다"는 검증은 **상품 카드 클릭 테스트**에서 한 번만 수행합니다. select_promotion 테스트에서 동일한 검증을 반복하지 않습니다.

### 3. 테스트 우선순위
1. **페이지 로드 이벤트**: 페이지 진입만으로 자동 검증 가능
2. **클릭 이벤트**: 특정 요소 클릭으로 검증
3. **성공 콜백 이벤트**: API 성공 후 발생 확인

### 4. 공통 미발생 확인
- 모든 클릭 액션에서: 해당 클릭과 관련 없는 이벤트 미발생 확인
- 모든 페이지 로드에서: 다른 페이지 타입 이벤트 미발생 확인
