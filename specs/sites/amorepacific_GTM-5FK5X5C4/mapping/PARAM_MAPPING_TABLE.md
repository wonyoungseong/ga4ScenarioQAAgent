# 파라미터 매핑 테이블

> **개발 가이드 변수 → GTM Variable → GA4 파라미터** 매핑 문서

이 문서는 시나리오 에이전트가 이벤트 파라미터를 검증할 때 참조하는 매핑 테이블입니다.

---

## 목차

1. [데이터 흐름 개요](#데이터-흐름-개요)
2. [공통 변수](#공통-변수)
3. [E-Commerce 이벤트별 매핑](#e-commerce-이벤트별-매핑)
4. [사용자 이벤트 매핑](#사용자-이벤트-매핑)
5. [콘텐츠/인터랙션 이벤트 매핑](#콘텐츠인터랙션-이벤트-매핑)
6. [커스텀/기타 이벤트 매핑](#커스텀기타-이벤트-매핑)
7. [GTM Variable 참조 테이블](#gtm-variable-참조-테이블)
8. [주의사항](#주의사항)

---

## 데이터 흐름 개요

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│   개발 가이드 변수    │ ──→ │    GTM Variable     │ ──→ │   GA4 파라미터      │
│  (Dev Guide Var)    │     │  (GTM Parsing)      │     │   (Final Param)     │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
     AP_PRD_CODE            {{JS - Product Id}}           item_id
     AP_PRD_NAME            {{JS - Product Name}}         item_name
     AP_PRD_BRAND           {{JS - Product Brand}}        item_brand
```

**중요**:
- 개발 가이드의 변수는 웹 개발자가 선언하는 값입니다.
- GTM에서 해당 변수를 파싱하여 GA4로 전송합니다.
- 시나리오 검증 시 **GTM parser를 통해 실제 매핑을 확인**해야 합니다.

---

## 공통 변수

> ⚠️ **GTM 실제 구성 기준** (GT - Event Settings 변수 분석 결과)

### 페이지 정보 변수 (Event Parameters)

| 개발 가이드 변수 | GTM Variable | GA4 파라미터 | 설명 | 예시 |
|----------------|--------------|-------------|------|------|
| `AP_DATA_SITENAME` | `{{JS - Site Name}}` | site_name | 사이트 이름 | APMALL |
| `AP_DATA_COUNTRY` | `{{JS - Site Country}}` | site_country | 국가코드 (ISO 3166-1) | KR |
| `AP_DATA_LANG` | `{{JS - Site Language}}` | site_language | 페이지 언어 (ISO 639-1) | KO |
| `AP_DATA_ENV` | `{{JS - Site Env}}` | site_env | 개발환경 | PRD |
| `AP_DATA_CHANNEL` | `{{JS - Channel}}` | channel | 접속 채널 | MOBILE |
| `AP_DATA_PAGETYPE` | `{{LT - Content Group}}` | content_group | 페이지 타입 (Content Group) | PRODUCT_DETAIL |
| `AP_DATA_ISLOGIN` | `{{JS - Login Is Login}}` | login_is_login | 로그인 여부 | Y / N |
| (브라우저) | `{{JS - User Agent}}` | user_agent | User-Agent 문자열 | Mozilla/5.0... |
| (내부) | `{{JS - Internal Traffic Type}}` | traffic_type | 내부/외부 트래픽 구분 | internal / external |
| (브라우저) | `{{JS - Page Referrer}}` | page_referrer | 이전 페이지 URL | https://... |

### 페이지 위치 변수 (breadcrumb 대체)

| GTM Variable | GA4 파라미터 | 설명 | 예시 |
|--------------|-------------|------|------|
| `{{JS - Page Location 1}}` | page_location_1 | 1뎁스 | 베스트 |
| `{{JS - Page Location 2}}` | page_location_2 | 2뎁스 | 스킨케어 |
| `{{JS - Page Location 3}}` | page_location_3 | 3뎁스 | 토너 |
| `{{JS - Page Location 4}}` | page_location_4 | 4뎁스 | - |
| `{{JS - Page Location 5}}` | page_location_5 | 5뎁스 | - |

### 사용자 ID 변수 (Event Parameters)

| 개발 가이드 변수 | GTM Variable | GA4 파라미터 | 설명 | 예시 |
|----------------|--------------|-------------|------|------|
| `AP_DATA_GCID` | `{{JS - Login Id Gcid}}` | login_id_gcid | 회원ID SHA512 해시 (128자) | aa47d4859ab... |
| `AP_DATA_CID` | `{{JS - Login Id Cid}}` | login_id_cid | 통합회원번호 SHA512 해시 (128자) | f9b7cc17e2c... |
| (분할) | `{{JS - Login Id Gcid 1}}` | login_id_gcid_1 | 회원ID 해시 전반부 (64자) | aa47d4859ab... |
| (분할) | `{{JS - Login Id Gcid 2}}` | login_id_gcid_2 | 회원ID 해시 후반부 (64자) | ...9agkcudj |
| (분할) | `{{JS - Login Id Cid 1}}` | login_id_cid_1 | 통합회원번호 해시 전반부 (64자) | f9b7cc17e2c... |
| (분할) | `{{JS - Login Id Cid 2}}` | login_id_cid_2 | 통합회원번호 해시 후반부 (64자) | ...4kkc9fl4 |

> ℹ️ GA4 Custom Dimension은 최대 100자 제한이 있어 128자 해시를 2개로 분할하여 전송

### 사용자 속성 변수 (User Properties)

| 개발 가이드 변수 | GTM Variable | GA4 User Property | 설명 | 예시 |
|----------------|--------------|-------------------|------|------|
| `AP_DATA_GCID` | `{{JS - Login Id Gcid}}` | user_id | 사용자 식별자 | aa47d4859ab... |
| `AP_DATA_ISSSO` | `{{JS - Login Is SSO}}` | login_is_sso | SSO 로그인 여부 | Y / N |
| `AP_DATA_CG` | `{{JS - Login Gender}}` | login_gender | 성별 | F / M |
| `AP_DATA_CD` | `{{JS - Login Birth (year)}}` | login_birth | 생년 | 1980 |
| `AP_DATA_AGE` | `{{JS - Login Age}}` | login_age | 연령대 | 30 |
| `AP_DATA_CT` | `{{JS - Login Level (internal)}}` | login_level | 회원등급 (내부) | WELCOME |
| `AP_DATA_BEAUTYCT` | `{{JS - Login Beauty Level}}` | login_beauty_level | 뷰티포인트 등급 | FAMILY |
| `AP_DATA_ISEMPLOYEE` | `{{JS - Login is Member (employee)}}` | login_is_member | 임직원 여부 | Y / N |
| `AP_DATA_LOGINTYPE` | `{{JS - Login Method}}` | login_method | 로그인 방법 | NORMAL / KAKAO |
| `AP_DATA_ISSUBSCRIPTION` | `{{JS - Login Is Subscription}}` | login_is_subscription | 정기배송 구독 여부 | Y / N |

### 조건부 파라미터 (content_group 기반)

#### PRODUCT_DETAIL 페이지 전용

| GTM Variable | GA4 파라미터 | 설명 |
|--------------|-------------|------|
| `{{JS - Product Id with View Item}}` | product_id | 상품 ID |
| `{{JS - Product Name with View Item}}` | product_name | 상품명 |
| `{{JS - Product Category with View Item}}` | product_category | 상품 카테고리 |
| `{{JS - Product Brandname with View Item}}` | product_brandname | 브랜드명 |
| `{{JS - Product Brandcode with View Item}}` | product_brandcode | 브랜드 코드 |
| `{{JS - Product Is Stock with View Item}}` | product_is_stock | 재고 여부 |

#### EVENT_DETAIL 페이지 전용

| GTM Variable | GA4 파라미터 | 설명 |
|--------------|-------------|------|
| `{{JS - Promotion Code on Detail Page}}` | view_event_code | 이벤트/프로모션 코드 |
| `{{JS - Promotion Name on Detail Page}}` | view_event_name | 이벤트/프로모션명 |

#### BRAND_MAIN 페이지 전용

| GTM Variable | GA4 파라미터 | 설명 |
|--------------|-------------|------|
| `{{JS - Brandshop Code}}` | brandshop_code | 브랜드샵 코드 |
| `{{JS - Brandshop Name}}` | brandshop_name | 브랜드샵명 |

#### 매장 관련 페이지 전용

| GTM Variable | GA4 파라미터 | 설명 |
|--------------|-------------|------|
| `{{JS - Store Code from URL}}` | page_store_code | 매장 코드 |
| `{{JS - Store Name from URL}}` | page_store_name | 매장명 |

#### SEARCH_RESULT 페이지 전용

| GTM Variable | GA4 파라미터 | 설명 |
|--------------|-------------|------|
| `{{JS - Search Brandshop Code}}` | search_brand_code | 검색 브랜드 코드 |
| `{{JS - Search Brandshop Name}}` | search_brand | 검색 브랜드명 |

---

## E-Commerce 이벤트별 매핑

### view_item (상품 상세 조회)

| 개발 가이드 변수 | GTM Variable | GA4 파라미터 | 설명 |
|----------------|--------------|-------------|------|
| `AP_ECOMM_CURRENCY` | `{{JS - Currency}}` | currency | 통화 코드 |
| `AP_PRD_CODE` | `{{JS - Product Id with View Item}}` | item_id | 상품 ID (SKU) |
| `AP_PRD_NAME` | `{{JS - Product Name}}` | item_name | 상품 이름 |
| `AP_PRD_BRAND` | `{{JS - Product Brand}}` | item_brand | 상품 브랜드 |
| `AP_PRD_CATEGORY` | `{{JS - Product Category}}` | item_category | 상품 카테고리 |
| `AP_PRD_APGBRCODE` | `{{JS - Product APG Brand Code}}` | apg_brand_code | APG 브랜드 코드 |
| `AP_PRD_ISTOCK` | `{{JS - Product In Stock}}` | in_stock | 재고 여부 (Y/N) |
| `AP_PRD_PRICE` | `{{JS - Product Price}}` | price | 할인 적용 가격 |
| `AP_PRD_DISCOUNT` | `{{JS - Product Discount}}` | discount | 할인 금액 |
| `AP_PRD_PRDPRICE` | `{{JS - Product Original Price}}` | prdprice | 정가 |

**items 배열**: `{{JS - View Item DataLayer}}`

---

### select_item (상품 선택)

| 개발 가이드 변수 | GTM Variable | GA4 파라미터 | 설명 |
|----------------|--------------|-------------|------|
| `AP_ECOMM_CURRENCY` | `{{JS - Currency}}` | currency | 통화 코드 |
| `code` | (items 배열 내) | item_id | 상품 ID |
| `name` | (items 배열 내) | item_name | 상품 이름 |
| `brand` | (items 배열 내) | item_brand | 상품 브랜드 |
| `cate` | (items 배열 내) | item_category | 상품 카테고리 |
| `apg_brand_code` | (items 배열 내) | apg_brand_code | APG 브랜드 코드 |
| `index` | (items 배열 내) | index | 리스트 내 위치 |
| `item_list_name` | (items 배열 내) | item_list_name | 노출 영역 |
| `price` | (items 배열 내) | price | 할인 적용 가격 |
| `discount` | (items 배열 내) | discount | 할인 금액 |
| `prdprice` | (items 배열 내) | prdprice | 정가 |

**items 배열**: `{{JS - Select Item DataLayer}}`

---

### view_item_list (상품 리스트 조회)

| 개발 가이드 변수 | GTM Variable | GA4 파라미터 | 설명 |
|----------------|--------------|-------------|------|
| `AP_SEARCH_TERM` | `{{JS - Search Term}}` | search_term | 검색어 |
| `AP_SEARCH_TYPE` | `{{JS - Search Type}}` | search_type | 검색 유형 |
| `AP_SEARCH_ITEMS_NUM` | `{{JS - Search Result Count}}` | search_resultcount | 상품 개수 |
| `AP_SEARCH_NUM` | `{{JS - Search Total Count}}` | search_total_count | 전체 개수 |
| `AP_SEARCH_RESULT` | `{{JS - Search Result}}` | search_result | 검색 성공 (Y/N) |
| `AP_ECOMM_CURRENCY` | `{{JS - Currency}}` | currency | 통화 코드 |
| `AP_SEARCH_PRDRESULT` | (상위 10개 상품 배열) | items | 상품 배열 |

**items 배열**: `{{JS - View Item List DataLayer}}`

---

### add_to_cart (장바구니 추가)

| 개발 가이드 변수 | GTM Variable | GA4 파라미터 | 설명 |
|----------------|--------------|-------------|------|
| `AP_ECOMM_CURRENCY` | `{{JS - Currency}}` | currency | 통화 코드 |
| `code` | (items 배열 내) | item_id | 상품 ID |
| `name` | (items 배열 내) | item_name | 상품 이름 |
| `brand` | (items 배열 내) | item_brand | 상품 브랜드 |
| `cate` | (items 배열 내) | item_category | 상품 카테고리 |
| `variant` | (items 배열 내) | item_variant | 상품 옵션 |
| `apg_brand_code` | (items 배열 내) | apg_brand_code | APG 브랜드 코드 |
| `quantity` | (items 배열 내) | quantity | 수량 |
| `price` | (items 배열 내) | price | 할인 적용 가격 |
| `discount` | (items 배열 내) | discount | 할인 금액 |
| `prdprice` | (items 배열 내) | prdprice | 정가 |

**items 배열**: `{{JS - Add to Cart DataLayer}}`

---

### begin_checkout (결제 시작)

| 개발 가이드 변수 | GTM Variable | GA4 파라미터 | 설명 |
|----------------|--------------|-------------|------|
| `AP_ECOMM_CURRENCY` | `{{JS - Currency}}` | currency | 통화 코드 |
| `(GTM 내부 로직)` | `{{LT - Checkout Sequence}}` | checkout_seq | 체크아웃 단계 |
| `AP_CART_PRDS` / `AP_ORDER_PRDS` | (상품 배열) | items | 상품 배열 |

**items 배열**: `{{JS - Begin Checkout DataLayer}}`

**dataLayer event 구분**:
| 발생 시점 | dataLayer event |
|----------|-----------------|
| 장바구니 페이지 로드 | `cart` |
| 장바구니 구매 버튼 클릭 | `purchasecartbtn` |
| 상품상세 구매 버튼 클릭 | `purchaseprdbtn` |
| 주문서 페이지 로드 | `order` |
| 결제하기 버튼 클릭 | `orderbtn` |

---

### select_promotion (프로모션 선택)

| 개발 가이드 변수 | GTM Variable | GA4 파라미터 | 설명 |
|----------------|--------------|-------------|------|
| `promotion_id` | (HTML 속성) | promotion_id | 프로모션 ID |
| `promotion_name` | (HTML 속성) | promotion_name | 프로모션 이름 |
| `creative_slot` | (HTML 속성) | creative_slot | 게재 위치 |

**items 배열**: `{{JS - Select Promotion DataLayer}}`

---

### login (로그인)

| 개발 가이드 변수 | GTM Variable | GA4 파라미터 | 설명 |
|----------------|--------------|-------------|------|
| `event` | `{{_event}}` | (trigger) | login_complete |
| `event_category` | `{{DL - Event Category}}` | event_category | login |
| `event_action` | `{{DL - Event Action}}` | event_action | login complete |
| `event_label` | `{{DL - Event Label with customEvent}}` | event_label | 로그인 방법 |
| `(GTM 내부 로직)` | `{{JS - Event Time KST}}` | event_time_kst | 이벤트 시간 |

---

### remove_from_cart (장바구니 삭제)

| 개발 가이드 변수 | GTM Variable | GA4 파라미터 | 설명 |
|----------------|--------------|-------------|------|
| `AP_ECOMM_CURRENCY` | `{{JS - Currency}}` | currency | 통화 코드 |
| `code` | (items 배열 내) | item_id | 상품 ID |
| `name` | (items 배열 내) | item_name | 상품 이름 |
| `brand` | (items 배열 내) | item_brand | 상품 브랜드 |
| `cate` | (items 배열 내) | item_category | 상품 카테고리 |
| `variant` | (items 배열 내) | item_variant | 상품 옵션 |
| `apg_brand_code` | (items 배열 내) | apg_brand_code | APG 브랜드 코드 |
| `quantity` | (items 배열 내) | quantity | 수량 |
| `price` | (items 배열 내) | price | 할인 적용 가격 |
| `discount` | (items 배열 내) | discount | 할인 금액 |
| `prdprice` | (items 배열 내) | prdprice | 정가 |

**items 배열**: `{{JS - Remove From Cart DataLayer}}`

---

### purchase (구매 완료)

| 개발 가이드 변수 | GTM Variable | GA4 파라미터 | 설명 |
|----------------|--------------|-------------|------|
| `AP_ECOMM_CURRENCY` | `{{JS - Currency}}` | currency | 통화 코드 |
| `AP_PURCHASE_ORDERNUM` | `{{JS - Purchase Order Number}}` | transaction_id | 주문번호 |
| `AP_PURCHASE_PRICE` | `{{JS - Purchase Value}}` | value | 주문 금액 (할인 반영) |
| `AP_PURCHASE_TAX` | `{{JS - Purchase Tax}}` | tax | 세금 |
| `AP_PURCHASE_SHIPPING` | `{{JS - Purchase Shipping}}` | shipping | 배송비 |
| `AP_PURCHASE_COUPONNAME` | `{{JS - Purchase Coupon Name}}` | coupon | 쿠폰 이름 |
| `AP_PURCHASE_COUPONNO` | `{{JS - Purchase Coupon Code}}` | coupon_code | 쿠폰 코드 |
| `AP_PURCHASE_TYPE` | `{{JS - Purchase Payment Type}}` | payment_type | 결제 방법 |
| `AP_PURCHASE_DCTOTAL` | `{{JS - Purchase Discount Total}}` | discount_total | 총 할인금액 |
| `AP_PURCHASE_PRDPRICE` | `{{JS - Purchase Original Price}}` | original_price_total | 총 주문금액 (정가) |
| `AP_PURCHASE_PRDS` | `{{JS - Purchase DataLayer}}` | items | 구매 상품 배열 |

**items 배열**: `{{JS - Purchase DataLayer}}`

**items 배열 내 추가 파라미터**:
- `coupon_name`: 상품 쿠폰 이름
- `coupon_no`: 상품 쿠폰 코드

---

### view_promotion (프로모션 노출)

| 개발 가이드 변수 | GTM Variable | GA4 파라미터 | 설명 |
|----------------|--------------|-------------|------|
| `ap-data-promotion` | `{{DL - Promotion ID}}` | promotion_id | 프로모션 ID |
| `ap-data-promotion-nm` | `{{DL - Promotion Name}}` | promotion_name | 프로모션 이름 |
| `ap-data-cslot` | `{{DL - Creative Slot}}` | creative_slot | 게재 위치 |

**트리거**: HTML 속성 기반 자동 감지 (Element Visibility)

---

### view_promotion_detail (프로모션 상세 조회)

| 개발 가이드 변수 | GTM Variable | GA4 파라미터 | 설명 |
|----------------|--------------|-------------|------|
| `AP_PROMO_ID` | `{{JS - Promo ID}}` | promotion_id | 프로모션 ID |
| `AP_PROMO_NAME` | `{{JS - Promo Name}}` | promotion_name | 프로모션 이름 |
| `AP_DATA_PAGETYPE` | `{{JS - Content Group}}` | content_group | 페이지 타입 (EVENT_DETAIL) |

**트리거**: `AP_DATA_PAGETYPE === 'EVENT_DETAIL'` 조건 (content_group = EVENT_DETAIL)

---

## 사용자 이벤트 매핑

### page_view (페이지 조회)

| 개발 가이드 변수 | GTM Variable | GA4 파라미터 | 설명 |
|----------------|--------------|-------------|------|
| `AP_DATA_SITENAME` | `{{JS - Site Name}}` | site_name | 사이트 이름 |
| `AP_DATA_COUNTRY` | `{{JS - Site Country}}` | site_country | 국가코드 |
| `AP_DATA_LANG` | `{{JS - Site Language}}` | site_language | 페이지 언어 |
| `AP_DATA_ENV` | `{{JS - Site Env}}` | site_env | 개발환경 |
| `AP_DATA_PAGETYPE` | `{{JS - Content Group}}` | content_group | 페이지 타입 (Content Group) |
| `AP_DATA_BREAD` | `{{JS - Breadcrumb}}` | breadcrumb | Breadcrumb |
| `AP_DATA_ISLOGIN` | `{{JS - Login Is Login}}` | login_is_login | 로그인 여부 |
| `AP_DATA_CHANNEL` | `{{JS - Channel}}` | channel | 접속 채널 |

**dataLayer event**: `ap_page_view`

---

### sign_up (회원가입)

| 개발 가이드 변수 | GTM Variable | GA4 파라미터 | 설명 |
|----------------|--------------|-------------|------|
| `event` | `{{_event}}` | (trigger) | sign_up_complete |
| `event_category` | `{{DL - Event Category}}` | event_category | sign_up |
| `event_action` | `{{DL - Event Action}}` | event_action | sign_up complete |
| `event_label` | `{{DL - Event Label with customEvent}}` | event_label | 가입 방법 |
| `(GTM 내부 로직)` | `{{JS - Event Time KST}}` | event_time_kst | 이벤트 시간 |

**트리거**: `sign_up_complete` dataLayer event

---

### withdrawal (회원탈퇴)

| 개발 가이드 변수 | GTM Variable | GA4 파라미터 | 설명 |
|----------------|--------------|-------------|------|
| `event` | `{{_event}}` | (trigger) | withdrawal_complete |
| `event_category` | `{{DL - Event Category}}` | event_category | withdrawal |
| `event_action` | `{{DL - Event Action}}` | event_action | withdrawal complete |
| `event_label` | `{{DL - Event Label with customEvent}}` | event_label | 탈퇴 사유 (선택) |
| `(GTM 내부 로직)` | `{{JS - Event Time KST}}` | event_time_kst | 이벤트 시간 |

**트리거**: `withdrawal_complete` dataLayer event

---

## 콘텐츠/인터랙션 이벤트 매핑

### write_review (리뷰 작성)

| 개발 가이드 변수 | GTM Variable | GA4 파라미터 | 설명 |
|----------------|--------------|-------------|------|
| `AP_ECOMM_CURRENCY` | `{{JS - Currency}}` | currency | 통화 코드 |
| `AP_PRD_CODE` | `{{JS - Product Id}}` | item_id | 상품 ID |
| `AP_PRD_NAME` | `{{JS - Product Name}}` | item_name | 상품 이름 |
| `AP_PRD_BRAND` | `{{JS - Product Brand}}` | item_brand | 상품 브랜드 |
| `AP_PRD_CATEGORY` | `{{JS - Product Category}}` | item_category | 상품 카테고리 |
| `review_type` | `{{DL - Review Type}}` | review_type | 리뷰 유형 (text/photo/video) |

**dataLayer event**: `review`

---

### ap_click (클릭 추적)

| 개발 가이드 변수 | GTM Variable | GA4 파라미터 | 설명 |
|----------------|--------------|-------------|------|
| `ap-click-area` | `{{DL - Click Area}}` | click_area | 클릭 영역 |
| `ap-click-name` | `{{DL - Click Name}}` | click_name | 클릭 이름 |
| `ap-click-text` | `{{DL - Click Text}}` | click_text | 클릭 텍스트 |
| `ap-click-url` | `{{DL - Click URL}}` | click_url | 클릭 URL |

**트리거**: HTML 속성 기반 자동 감지 (Click)

---

### scroll (스크롤 추적)

| 개발 가이드 변수 | GTM Variable | GA4 파라미터 | 설명 |
|----------------|--------------|-------------|------|
| `(GTM 내장)` | `{{Scroll Depth Threshold}}` | percent_scrolled | 스크롤 비율 (%) |
| `(GTM 내장)` | `{{Scroll Direction}}` | scroll_direction | 스크롤 방향 |

**트리거**: GTM 내장 스크롤 트리거 (25%, 50%, 75%, 90%)

---

### view_search_results (검색 결과 조회)

| 개발 가이드 변수 | GTM Variable | GA4 파라미터 | 설명 |
|----------------|--------------|-------------|------|
| `AP_SEARCH_TERM` | `{{JS - Search Term}}` | search_term | 검색어 |
| `AP_SEARCH_RESULT` | `{{JS - Search Result}}` | search_result | 검색 성공 여부 (Y/N) |
| `AP_SEARCH_NUM` | `{{JS - Search Total Count}}` | search_result_count | 검색 결과 개수 |

**트리거**: 검색 결과 페이지 로드 시

---

## 커스텀/기타 이벤트 매핑

### custom_event (커스텀 이벤트)

| 개발 가이드 변수 | GTM Variable | GA4 파라미터 | 설명 |
|----------------|--------------|-------------|------|
| `event_category` | `{{DL - Event Category}}` | event_category | 이벤트 카테고리 |
| `event_action` | `{{DL - Event Action}}` | event_action | 이벤트 액션 |
| `event_label` | `{{DL - Event Label}}` | event_label | 이벤트 라벨 |
| `value` | `{{DL - Event Value}}` | value | 이벤트 값 |

**용도**: 표준 이벤트로 분류되지 않는 다양한 추적

---

### naverpay (네이버페이)

| 개발 가이드 변수 | GTM Variable | GA4 파라미터 | 설명 |
|----------------|--------------|-------------|------|
| `AP_ECOMM_CURRENCY` | `{{JS - Currency}}` | currency | 통화 코드 |
| `AP_PRD_NAVERPAY_OPTIONS` | `{{JS - Naverpay Options}}` | naverpay_options | 네이버페이 옵션 배열 |
| `(GTM 계산)` | `{{JS - Naverpay Total Quantity}}` | total_quantity | 총 수량 |
| `(GTM 계산)` | `{{JS - Naverpay Total Price}}` | total_price | 총 금액 |
| `AP_PRD_PRICE` | `{{JS - Product Price}}` | product_price | 상품 가격 |

**트리거**: `naverpay_purchase_confirm` dataLayer event

---

### live (라이브 방송)

| 개발 가이드 변수 | GTM Variable | GA4 파라미터 | 설명 |
|----------------|--------------|-------------|------|
| `live_id` | `{{DL - Live ID}}` | live_id | 라이브 방송 ID |
| `live_title` | `{{DL - Live Title}}` | live_title | 라이브 방송 제목 |
| `live_action` | `{{DL - Live Action}}` | live_action | 라이브 액션 (view/click/purchase/chat/like) |
| `live_brand` | `{{DL - Live Brand}}` | live_brand | 라이브 방송 브랜드 |
| `product_id` | `{{DL - Live Product ID}}` | product_id | 클릭/구매 상품 ID |

**트리거**: 라이브 관련 이벤트 발생 시

---

## GTM Variable 참조 테이블

### 이벤트별 주요 GTM Variable

| 이벤트 | items 배열 | 주요 Variable |
|-------|-----------|--------------|
| view_item | `{{JS - View Item DataLayer}}` | `{{JS - Product Id with View Item}}` |
| select_item | `{{JS - Select Item DataLayer}}` | - |
| add_to_cart | `{{JS - Add to Cart DataLayer}}` | - |
| remove_from_cart | `{{JS - Remove From Cart DataLayer}}` | - |
| view_item_list | `{{JS - View Item List DataLayer}}` | `{{JS - Search Term}}`, `{{JS - Search Result Count}}` |
| begin_checkout | `{{JS - Begin Checkout DataLayer}}` | `{{LT - Checkout Sequence}}` |
| purchase | `{{JS - Purchase DataLayer}}` | `{{JS - Purchase Order Number}}`, `{{JS - Purchase Value}}` |
| view_promotion | - | `{{DL - Promotion ID}}`, `{{DL - Promotion Name}}` |
| select_promotion | `{{JS - Select Promotion DataLayer}}` | - |
| view_promotion_detail | - | `{{JS - Promo ID}}`, `{{JS - Promo Name}}` |
| page_view | - | `{{JS - Site Name}}`, `{{JS - Content Group}}` |
| login | - | `{{DL - Event Label with customEvent}}`, `{{JS - Event Time KST}}` |
| sign_up | - | `{{DL - Event Label with customEvent}}`, `{{JS - Event Time KST}}` |
| withdrawal | - | `{{DL - Event Label with customEvent}}`, `{{JS - Event Time KST}}` |
| write_review | - | `{{JS - Product Id}}`, `{{DL - Review Type}}` |
| ap_click | - | `{{DL - Click Area}}`, `{{DL - Click Name}}` |
| scroll | - | `{{Scroll Depth Threshold}}`, `{{Scroll Direction}}` |
| view_search_results | - | `{{JS - Search Term}}`, `{{JS - Search Total Count}}` |
| custom_event | - | `{{DL - Event Category}}`, `{{DL - Event Action}}` |
| naverpay | - | `{{JS - Naverpay Options}}`, `{{JS - Product Price}}` |
| live | - | `{{DL - Live ID}}`, `{{DL - Live Action}}` |

---

## 주의사항

### 1. GTM Parser 확인 필수
```
⚠️ 이 매핑 테이블은 대표적인 예시입니다.
   실제 파라미터는 항상 GTM parser를 통해 확인해야 합니다.
```

### 2. items 배열 확인 방법
```javascript
// 브라우저 콘솔에서 확인
console.log(dataLayer.filter(d => d.event === 'product'));
```

### 3. 제품 정보 일관성
- `code`, `name`, `brand`, `cate`, `apg_brand_code`는 **모든 전자상거래 단계에서 동일해야 함**
- view_item → select_item → add_to_cart → begin_checkout → purchase

### 4. 가격 정보
- `price`: 할인이 적용된 최종 가격 (Unit Price)
- `discount`: 할인 금액
- `prdprice`: 정가 (할인 전)
- **모든 가격은 1개당 가격(Unit Price)으로 전송**

### 5. item_list_name 값
```
SEARCH       - 검색 결과
PRODUCT_LIST - 상품 카테고리
MAIN         - 메인 페이지
```

---

## 참조 문서

- `specs/events/*.yaml` - 이벤트별 상세 스펙
- `specs/mapping/param-mapping.yaml` - 전체 매핑 (YAML 형식)
- `guides/*.md` - 이벤트별 시나리오 가이드

---

*최종 수정: 2024-12-18 (GA4 파라미터명 실제 GTM 설정과 동기화: page_type→content_group, country→site_country, language→site_language, environment→site_env, is_login→login_is_login)*
