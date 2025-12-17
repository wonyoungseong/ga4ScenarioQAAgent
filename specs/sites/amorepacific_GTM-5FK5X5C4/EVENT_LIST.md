# 전체 이벤트 리스트 및 매핑

> 개발 가이드 + GTM 이벤트 통합 리스트

---

## 이벤트 분류

### 1. E-Commerce 핵심 이벤트 (GA4 표준)

| GA4 이벤트명 | dataLayer 이벤트 | 개발 가이드 | GTM 태그 | 필수 여부 | 스펙 파일 |
|------------|----------------|-----------|---------|---------|---------|
| `view_item` | `product` | O | O | Required | `view_item.yaml` |
| `select_item` | `select_item` | O | O | Required | `select_item.yaml` |
| `view_item_list` | `ap_search` | O | O | Required | `view_item_list.yaml` |
| `add_to_cart` | `addcart` | O | O | Required | `add_to_cart.yaml` |
| `remove_from_cart` | `removeCart` | O | - | Optional | `remove_from_cart.yaml` |
| `begin_checkout` | `cart`, `order`, `orderbtn` 등 | O | O | Required | `begin_checkout.yaml` |
| `purchase` | `purchase` | O | O | Required | `purchase.yaml` |

### 2. 프로모션 이벤트

| GA4 이벤트명 | dataLayer 이벤트 | 개발 가이드 | GTM 태그 | 필수 여부 | 스펙 파일 |
|------------|----------------|-----------|---------|---------|---------|
| `view_promotion` | (HTML 속성) | O | O | Required* | `view_promotion.yaml` |
| `select_promotion` | (HTML 속성) | O | O | Required* | `select_promotion.yaml` |
| `view_promotion_detail` | - | - | O | - | `view_promotion_detail.yaml` |

*메인 key visual 영역에 프로모션이 노출되는 사이트만 해당

### 3. 사용자 이벤트 (인증/계정)

| GA4 이벤트명 | dataLayer 이벤트 | 개발 가이드 | GTM 태그 | 필수 여부 | 스펙 파일 |
|------------|----------------|-----------|---------|---------|---------|
| `page_view` | `ap_page_view` | O | - | Required | `page_view.yaml` |
| `login` | `login_complete` | O | O | Required* | `login.yaml` |
| `sign_up` | `sign_up_complete` | O | O | Required* | `sign_up.yaml` |
| `withdrawal` | `withdrawal_complete` | O | O | Required* | `withdrawal.yaml` |

*로그인 기능이 있는 사이트만 해당

### 4. 콘텐츠/인터랙션 이벤트

| GA4 이벤트명 | dataLayer 이벤트 | 개발 가이드 | GTM 태그 | 필수 여부 | 스펙 파일 |
|------------|----------------|-----------|---------|---------|---------|
| `write_review` | `review` | O | O | Required* | `write_review.yaml` |
| `ap_click` | (HTML 속성) | O | O | Optional | `ap_click.yaml` |
| `scroll` | - | - | O | - | `scroll.yaml` |
| `view_search_results` | - | - | O | - | `view_search_results.yaml` |

*리뷰 작성 기능이 있는 사이트만 해당

### 5. 기타/커스텀 이벤트 (GTM 전용)

| GA4 이벤트명 | 설명 | GTM 태그 | 스펙 파일 |
|------------|------|---------|---------|
| `screen_view` | 앱 화면 조회 | O | - |
| `click_with_duration` | 클릭 지속시간 측정 | O | - |
| `custom_event` | 커스텀 이벤트 (다양한 용도) | O | `custom_event.yaml` |
| `naverpay` | 네이버페이 관련 | O | `naverpay.yaml` |
| `page_load_time` | 페이지 로드 시간 | O | - |
| `campaign_details` | 캠페인 상세 | O | - |
| `beauty_tester` | 뷰티 테스터 | O | - |
| `brand_store` | 브랜드 스토어 | O | - |
| `live` | 라이브 방송 | O | `live.yaml` |
| `brand_product_click` | 브랜드 상품 클릭 | O | - |
| `qualified_visit` | 자격 방문 | O | - |

---

## 이벤트별 파라미터 요약

### E-Commerce 이벤트 공통 파라미터

| 파라미터 | 개발 가이드 변수 | 설명 | 필수 |
|---------|---------------|------|-----|
| `currency` | `AP_ECOMM_CURRENCY` | 통화 코드 (KRW) | O |
| `items` | 이벤트별 상이 | 상품 배열 | O |

### items 배열 내 상품 파라미터

| GA4 파라미터 | 개발 가이드 변수 | 설명 |
|------------|---------------|------|
| `item_id` | `code` / `AP_PRD_CODE` | 상품 ID (SKU) |
| `item_name` | `name` / `AP_PRD_NAME` | 상품 이름 |
| `item_brand` | `brand` / `AP_PRD_BRAND` | 상품 브랜드 |
| `item_category` | `cate` / `AP_PRD_CATEGORY` | 상품 카테고리 |
| `item_variant` | `variant` | 상품 옵션 |
| `apg_brand_code` | `apg_brand_code` / `AP_PRD_APGBRCODE` | APG 브랜드 코드 |
| `index` | `index` | 리스트 내 위치 |
| `item_list_name` | `item_list_name` | 노출 영역 |
| `quantity` | `quantity` | 수량 |
| `price` | `price` / `AP_PRD_PRICE` | 할인 적용 가격 |
| `discount` | `discount` / `AP_PRD_DISCOUNT` | 할인 금액 |
| `prdprice` | `prdprice` / `AP_PRD_PRDPRICE` | 정가 |

---

## dataLayer 이벤트 → GA4 이벤트 매핑

| dataLayer event | GA4 event | 트리거 시점 |
|-----------------|-----------|-----------|
| `ap_page_view` | `page_view` | 페이지 로드 완료 |
| `product` | `view_item` | 상품 상세 페이지 로드 |
| `select_item` | `select_item` | 상품 리스트에서 상품 클릭 |
| `ap_search` | `view_item_list` | 검색 결과/상품 리스트 로드 |
| `addcart` | `add_to_cart` | 장바구니 추가 |
| `removeCart` | `remove_from_cart` | 장바구니 삭제 |
| `cart` | `begin_checkout` | 장바구니 페이지 로드 |
| `purchasecartbtn` | `begin_checkout` | 장바구니 구매 버튼 클릭 |
| `purchaseprdbtn` | `begin_checkout` | 상품상세 구매 버튼 클릭 |
| `order` | `begin_checkout` | 주문서 페이지 로드 |
| `orderbtn` | `begin_checkout` | 결제하기 버튼 클릭 |
| `purchase` | `purchase` | 구매 완료 페이지 로드 |
| `login_complete` | `login` | 로그인 완료 |
| `sign_up_complete` | `sign_up` | 회원가입 완료 |
| `withdrawal_complete` | `withdrawal` | 회원탈퇴 완료 |
| `review` | `write_review` | 리뷰 작성 완료 |

---

## 스펙 파일 생성 현황 (21개 완료)

### E-Commerce 핵심 (7개)
- [x] `view_item.yaml` - 상품 상세 조회
- [x] `select_item.yaml` - 상품 선택 (클릭)
- [x] `view_item_list.yaml` - 상품 리스트 조회
- [x] `add_to_cart.yaml` - 장바구니 추가
- [x] `remove_from_cart.yaml` - 장바구니 삭제
- [x] `begin_checkout.yaml` - 결제 시작
- [x] `purchase.yaml` - 구매 완료

### 프로모션 (3개)
- [x] `view_promotion.yaml` - 프로모션 노출
- [x] `select_promotion.yaml` - 프로모션 클릭
- [x] `view_promotion_detail.yaml` - 프로모션 상세 조회

### 사용자 이벤트 (4개)
- [x] `page_view.yaml` - 페이지 조회
- [x] `login.yaml` - 로그인
- [x] `sign_up.yaml` - 회원가입
- [x] `withdrawal.yaml` - 회원탈퇴

### 콘텐츠/인터랙션 (4개)
- [x] `write_review.yaml` - 리뷰 작성
- [x] `ap_click.yaml` - 클릭 추적
- [x] `scroll.yaml` - 스크롤 추적
- [x] `view_search_results.yaml` - 검색 결과 조회

### 기타/커스텀 (3개)
- [x] `custom_event.yaml` - 커스텀 이벤트
- [x] `naverpay.yaml` - 네이버페이
- [x] `live.yaml` - 라이브 방송

---

*최종 수정: 2024-12-15*
