# GTM 이벤트 파라미터 정의

> 추출일시: 2025-12-17T06:36:36.326Z
> GTM 소스: 2025-12-04 13:40:49

---

## add_to_cart

**태그**: GA4 - Ecommerce - Add to Cart, GA4 - Ecommerce - Add to Cart (for App)

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|
| currency | `{{JS - Currency}}` | ✅ |
| event_action | `add to cart` | ✅ |
| event_category | `ecommerce` | ✅ |
| items | `{{JS - Add to Cart DataLayer}}` | ✅ |

### Items Array Parameters

| GTM Key | GA4 API Dimension | 설명 |
|---------|-------------------|------|
| item_id | `itemId` | 상품 코드 |
| item_name | `itemName` | 상품명 |
| item_brand | `itemBrand` | 브랜드명 |
| item_category | `itemCategory` | 카테고리 1 |
| item_category2 | `itemCategory2` | 카테고리 2 |
| item_category3 | `itemCategory3` | 카테고리 3 |
| item_category4 | `itemCategory4` | 카테고리 4 |
| item_category5 | `itemCategory5` | 카테고리 5 |
| item_variant | `itemVariant` | 상품 옵션 (색상/용량) |
| apg_brand_code | `customItem:apg_brand_code` | APG 브랜드 코드 |
| quantity | `quantity` | 수량 |
| price | `price` | 판매가 |
| discount | `discount` | 할인금액 |
| original_price | `customItem:original_price` | 원가 |
| internal_brand_code | `customItem:internal_brand_code` | 내부 브랜드 코드 |

## ap_click

**태그**: GA4 - Basic Event - Ap Click, GA4 - Basic Event - Ap Click (for App)

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|
| event_action | `{{JS - Event Action with Ap Click}}` | ✅ |
| event_category | `{{JS - Event Category with Ap Click}}` | ✅ |
| event_label | `{{JS - Event Label with Ap Click}}` | ✅ |
| event_param1 | `{{JS - Event Param 1 with Ap Click}}` | ✅ |
| event_param2 | `{{JS - Event Param 2 with Ap Click}}` | ✅ |
| event_param3 | `{{JS - Event Param 3 with Ap Click}}` | ✅ |

## beauty_tester

**태그**: GA4 - Basic Event - Beauty Tester, GA4 - Basic Event - Beauty Tester (for App)

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|
| event_action | `registration` | ✅ |
| event_category | `beauty_tester` | ✅ |
| event_label | `{{JS - Beauty Tester Product}}` | ✅ |

## begin_checkout

**태그**: GA4 - Ecommerce - Begin Checkout (for App), GA4 - Ecommerce - Begin Checkout

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|
| checkout_seq | `{{LT - Checkout Sequence}}` | ✅ |
| checkout_step | `{{LT - Checkout Step}}` | ✅ |
| currency | `{{JS - Currency}}` | ✅ |
| event_action | `begin checkout{{LT - Checkout Sequence}}` | ✅ |
| event_category | `ecommerce` | ✅ |
| event_label | `{{LT - Checkout Step}}` | ✅ |
| items | `{{JS - Begin Checkout DataLayer}}` | ✅ |

### Items Array Parameters

| GTM Key | GA4 API Dimension | 설명 |
|---------|-------------------|------|
| item_id | `itemId` | 상품 코드 |
| item_name | `itemName` | 상품명 |
| item_brand | `itemBrand` | 브랜드명 |
| item_category | `itemCategory` | 카테고리 1 |
| item_category2 | `itemCategory2` | 카테고리 2 |
| item_category3 | `itemCategory3` | 카테고리 3 |
| item_category4 | `itemCategory4` | 카테고리 4 |
| item_category5 | `itemCategory5` | 카테고리 5 |
| item_variant | `itemVariant` | 상품 옵션 (색상/용량) |
| apg_brand_code | `customItem:apg_brand_code` | APG 브랜드 코드 |
| quantity | `quantity` | 수량 |
| price | `price` | 판매가 |
| discount | `discount` | 할인금액 |
| original_price | `customItem:original_price` | 원가 |
| internal_brand_code | `customItem:internal_brand_code` | 내부 브랜드 코드 |

## brand_product_click

**태그**: GA4 - Basic Event - BrandShop Product Click, GA4 - Basic Event - BrandShop Product Click (for App)

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|
| event_action | `click` | ✅ |
| event_category | `PRDS` | ✅ |
| event_label | `{{JS - Product List Name in Brandshop}}` | ✅ |
| product_brandname | `{{JS - Product Brand in Brandshop}}` | ✅ |
| product_id | `{{JS - Product ID in Brandshop}}` | ✅ |
| product_name | `{{JS - Product Name in Brandshop}}` | ✅ |

## brand_store

**태그**: GA4 - Basic Event - Brand Store, GA4 - Basic Event - Brand Store (for App)

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|
| event_action | `detail` | ✅ |
| event_category | `brandstore` | ✅ |
| event_label | `{{JS - Brand Name on Brand Store}}` | ✅ |

## campaign_details

**태그**: GA4 - Basic Event - Campaign Details (for App)

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|
| campaign | `{{URL - utm_campaign}}` | ✅ |
| campaign_id | `{{URL - utm_id}}` | ✅ |
| content | `{{URL - utm_content}}` | ✅ |
| medium | `{{URL - utm_medium}}` | ✅ |
| source | `{{URL - utm_source}}` | ✅ |
| term | `{{JS - UTM Term}}` | ✅ |

## click_with_duration

**태그**: GA4 - Basic Event - Click with Duration (for App), GA4 - Basic Event - Click with Duration

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|
| click_duration_0 | `{{DL - Duration at 0%}}` | ✅ |
| click_duration_10 | `{{DL - Duration at 10%}}` | ✅ |
| click_duration_100 | `{{DL - Duration at 100%}}` | ✅ |
| click_duration_20 | `{{DL - Duration at 20%}}` | ✅ |
| click_duration_30 | `{{DL - Duration at 30%}}` | ✅ |
| click_duration_40 | `{{DL - Duration at 40%}}` | ✅ |
| click_duration_50 | `{{DL - Duration at 50%}}` | ✅ |
| click_duration_60 | `{{DL - Duration at 60%}}` | ✅ |
| click_duration_70 | `{{DL - Duration at 70%}}` | ✅ |
| click_duration_80 | `{{DL - Duration at 80%}}` | ✅ |
| click_duration_90 | `{{DL - Duration at 90%}}` | ✅ |

## custom_event

**태그**: GA4 - Basic Event - Custom Event (for App), GA4 - Basic Event - Custom Event, GA4 - Basic Event - SN Start Screen, GA4 - Basic Event - SN Main, GA4 - Basic Event - SN Start Camera, GA4 - Basic Event - SN Diagnosis Camera, GA4 - Basic Event - SN Diagnosis Note Complete, GA4 - Basic Event - SN Diagnosis Note Start, GA4 - Basic Event - SN Diagnosis Paper, GA4 - Basic Event - SN Diagnosis Paper Go Note, GA4 - Basic Event - SN Diagnosis Paper Start, GA4 - Basic Event - SN Diagnosis Result, GA4 - Basic Event - SN Diagnosis Change Report, GA4 - Basic Event - SN Diagnosis Paper Go Result, GA4 - Basic Event - SN Diagnosis Paper Quit Login, GA4 - Basic Event - SN Diagnosis Paper Sync, GA4 - Basic Event - SN Skinnote Level, GA4 - Basic Event - SN Skinnote Ranking, GA4 - Basic Event - SN Product Click, GA4 - Basic Event - SN Product Imp, GA4 - Basic Event - SN Diagnosis Camera (for App), GA4 - Basic Event - SN Diagnosis Change Report (for App), GA4 - Basic Event - SN Diagnosis Note Complete (for App), GA4 - Basic Event - SN Diagnosis Note Start (for App), GA4 - Basic Event - SN Diagnosis Paper (for App), GA4 - Basic Event - SN Diagnosis Paper Go Note (for App), GA4 - Basic Event - SN Diagnosis Paper Go Result (for App), GA4 - Basic Event - SN Diagnosis Paper Quit Login (for App), GA4 - Basic Event - SN Diagnosis Paper Start (for App), GA4 - Basic Event - SN Diagnosis Paper Sync (for App), GA4 - Basic Event - SN Diagnosis Result (for App), GA4 - Basic Event - SN Main (for App), GA4 - Basic Event - SN Product Click (for App), GA4 - Basic Event - SN Product Imp (for App), GA4 - Basic Event - SN Skinnote Level (for App), GA4 - Basic Event - SN Skinnote Ranking (for App), GA4 - Basic Event - SN Start Camera (for App), GA4 - Basic Event - SN Start Screen (for App), GA4 - ETC - Omnichannel Acquisition Time Tag

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|
| bc_mission | `{{JS - SN Beauty Mission}}` | ✅ |
| bt_answer | `{{JS - SKINNOTE Answer}}` | ✅ |
| bt_product_list | `{{JS - SN Product List Click}}` | ✅ |
| bt_question | `{{JS - SKINNOTE Question}}` | ✅ |
| bt_result_date | `{{JS - SN Note Date}}` | ✅ |
| bt_step | `{{JS - SKINNOTE Step}}` | ✅ |
| event_action | `{{DL - Event Action with customEvent}}` | ✅ |
| event_category | `{{DL - Event Category with customEvent}}` | ✅ |
| event_label | `{{DL - Event Label with customEvent}}` | ✅ |
| event_param1 | `{{DL - Event Param1}}` | ✅ |
| event_param2 | `{{DL - Event Param2}}` | ✅ |
| event_param3 | `{{DL - Event Param3}}` | ✅ |
| event_time_kst | `{{JS - Event Time KST}}` | ✅ |
| page_referrer | `{{JS - Page Referrer}}` | ✅ |
| skinnote_answer | `{{JS - SKINNOTE Answer}}` | ✅ |
| skinnote_intake_count | `{{JS - SKINNOTE Result Eaten Product}}` | ✅ |
| skinnote_note_date | `{{JS - SKINNOTE Note Date}}` | ✅ |
| skinnote_question | `{{JS - SKINNOTE Question}}` | ✅ |
| skinnote_result_diagnosis | `{{JS - SKINNOTE Result Diagnosis}}` | ✅ |
| skinnote_result_menstruation | `{{JS - SKINNOTE Result Menstruation}}` | ✅ |
| skinnote_result_mood | `{{JS - SKINNOTE Result Mood}}` | ✅ |
| skinnote_result_score | `{{JS - SKINNOTE Result Score}}` | ✅ |
| skinnote_result_skintype | `{{JS - SKINNOTE Result Skintype}}` | ✅ |
| skinnote_result_sleep | `{{JS - SKINNOTE Result Sleep}}` | ✅ |
| skinnote_result_water | `{{JS - SKINNOTE Result Water}}` | ✅ |
| skinnote_selfcare_count | `{{JS - SKINNOTE Result Selfcare}}` | ✅ |
| skinnote_step | `{{JS - SKINNOTE Step}}` | ✅ |
| skinnote_use_count | `{{JS - SKINNOTE Result Used Product}}` | ✅ |
| sn_mission | `{{JS - SN Skinnote Mission}}` | ✅ |

## live

**태그**: GA4 - Basic Event - Live Access, GA4 - Basic Event - Live Access (for App)

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|
| event_action | `live_access` | ✅ |
| event_category | `live` | ✅ |
| event_label | `{{JS - Page Title}}` | ✅ |
| live_id | `{{URL - Live ID}}` | ✅ |
| live_name | `{{JS - Page Title}}` | ✅ |
| live_type | `{{JS - Live Type}}` | ✅ |

## login

**태그**: GA4 - Basic Event - Login, GA4 - Basic Event - Login (for App)

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|
| event_action | `login complete` | ✅ |
| event_category | `login` | ✅ |
| event_label | `{{DL - Event Label with customEvent}}` | ✅ |
| event_time_kst | `{{JS - Event Time KST}}` | ✅ |

## naverpay

**태그**: GA4 - Basic Event - Naverpay, GA4 - Basic Event - Naverpay (for App)

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|
| event_action | `{{Event}}` | ✅ |
| event_category | `naverpay` | ✅ |
| event_label | `{{JS - Naverpay Event Label}}` | ✅ |
| naverpay_option | `{{JS - Naverpay Purchase Options}}` | ✅ |
| naverpay_quantity | `{{JS - Naverpay Purchase Total Quantity}}` | ✅ |
| naverpay_revenue | `{{JS - Naverpay Purchase Total Price}}` | ✅ |
| order_method | `{{JS - Naverpay Purchase Method}}` | ✅ |

## page_load_time

**태그**: GA4 - Basic Event - Page Load Time, GA4 - Basic Event - Page Load Time (for App)

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|
| loading_time_sec | `{{JS - Page Load Time}}` | ✅ |

## purchase

**태그**: GA4 - Ecommerce - Purchase (for App), GA4 - Ecommerce - Purchase

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|
| coupon | `{{JS - Purchase Coupon}}` | ✅ |
| currency | `{{JS - Currency}}` | ✅ |
| event_action | `purchase` | ✅ |
| event_category | `ecommerce` | ✅ |
| items | `{{JS - Purchase DataLayer}}` | ✅ |
| order_beauty_accumulated | `{{JS - Purchase Beauty Accumulated}}` | ✅ |
| order_beauty_discount | `{{JS - Purchase Beauty Discount}}` | ✅ |
| order_coupon_code | `{{JS - Purchase Coupon Code}}` | ✅ |
| order_coupon_discount | `{{JS - Purchase Coupon Discount}}` | ✅ |
| order_giftcard_amount | `{{JS - Purchase Giftcard Discount}}` | ✅ |
| order_giftcard_discount | `{{JS - Purchase Giftcard Discount}}` | ✅ |
| order_member_discount | `{{JS - Purchase Member Discount}}` | ✅ |
| order_method | `{{JS - Purchase Method}}` | ✅ |
| order_mobile_discount | `{{JS - Purchase Mobile Discount}}` | ✅ |
| order_total_amount | `{{JS - Purchase Total Amount}}` | ✅ |
| order_total_discount | `{{JS - Purchase Total Discount}}` | ✅ |
| shipping | `{{JS - Purchase Shipping}}` | ✅ |
| transaction_id | `{{JS - Transaction ID}}` | ✅ |
| value | `{{JS - Purchase Value}}` | ✅ |

### Items Array Parameters

| GTM Key | GA4 API Dimension | 설명 |
|---------|-------------------|------|
| item_id | `itemId` | 상품 코드 |
| item_name | `itemName` | 상품명 |
| item_brand | `itemBrand` | 브랜드명 |
| item_category | `itemCategory` | 카테고리 1 |
| item_category2 | `itemCategory2` | 카테고리 2 |
| item_category3 | `itemCategory3` | 카테고리 3 |
| item_category4 | `itemCategory4` | 카테고리 4 |
| item_category5 | `itemCategory5` | 카테고리 5 |
| item_variant | `itemVariant` | 상품 옵션 (색상/용량) |
| apg_brand_code | `customItem:apg_brand_code` | APG 브랜드 코드 |
| coupon | `coupon` | 쿠폰/프로모션 코드 |
| quantity | `quantity` | 수량 |
| price | `price` | 판매가 |
| discount | `discount` | 할인금액 |
| original_price | `customItem:original_price` | 원가 |
| item_beauty_acc | `customItem:item_beauty_acc` | 뷰티포인트 적립 |
| is_giftprd | `customItem:is_giftprd` | 사은품 여부 |
| internal_brand_code | `customItem:internal_brand_code` | 내부 브랜드 코드 |

## qualified_visit

**태그**: GA4 - ETC - Qualified Visit Event

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|
| event_action | `{{DL - Event Action with customEvent}}` | ✅ |
| event_category | `qualified_visit` | ✅ |
| event_label | `{{DL - Event Label with customEvent}}` | ✅ |

## screen_view

**태그**: GA4 - Basic Event - Screen View (for App)

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|

## scroll

**태그**: GA4 - Basic Event - Scroll (for App), GA4 - Basic Event - Scroll

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|
| event_action | `{{Scroll Depth Threshold}}%` | ✅ |
| event_category | `scroll` | ✅ |
| event_label | `{{LT - Content Group}}` | ✅ |
| percent_scrolled | `{{Scroll Depth Threshold}}` | ✅ |

## select_item

**태그**: GA4 - Ecommerce - Select Item (for App), GA4 - Ecommerce - Select Item, GA4 - Ecommerce Event - Select Item on SKINNOTE, GA4 - Ecommerce Event - Select Item on SKINNOTE (for App)

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|
| bt_note_date | `{{JS - SN Note Date}}` | ✅ |
| currency | `{{JS - Currency}}` | ✅ |
| event_action | `select item` | ✅ |
| event_category | `ecommerce` | ✅ |
| event_label | `{{JS - Select Item Event Label}}` | ✅ |
| items | `{{JS - Select Item DataLayer}}` | ✅ |

### Items Array Parameters

| GTM Key | GA4 API Dimension | 설명 |
|---------|-------------------|------|
| item_id | `itemId` | 상품 코드 |
| item_name | `itemName` | 상품명 |
| item_brand | `itemBrand` | 브랜드명 |
| item_category | `itemCategory` | 카테고리 1 |
| item_category2 | `itemCategory2` | 카테고리 2 |
| item_category3 | `itemCategory3` | 카테고리 3 |
| item_category4 | `itemCategory4` | 카테고리 4 |
| item_category5 | `itemCategory5` | 카테고리 5 |
| apg_brand_code | `customItem:apg_brand_code` | APG 브랜드 코드 |
| index | `index` | 상품 순서 |
| item_list_name | `itemListName` | 상품 리스트명 |
| price | `price` | 판매가 |
| discount | `discount` | 할인금액 |
| original_price | `customItem:original_price` | 원가 |
| internal_brand_code | `customItem:internal_brand_code` | 내부 브랜드 코드 |

## select_promotion

**태그**: GA4 - Ecommerce - Select Promotion, GA4 - Ecommerce - Select Promotion (for App)

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|
| event_action | `select promotion` | ✅ |
| event_category | `ecommerce` | ✅ |
| event_label | `{{JS - Select Promotion Event Label}}` | ✅ |
| items | `{{JS - Select Promotion DataLayer}}` | ✅ |

### Items Array Parameters

| GTM Key | GA4 API Dimension | 설명 |
|---------|-------------------|------|
| promotion_id | `itemPromotionId` | 프로모션 ID |
| promotion_name | `itemPromotionName` | 프로모션명 |
| creative_slot | `itemPromotionCreativeSlot` | 크리에이티브 슬롯 |
| index | `index` | 상품 순서 |

## sign_up

**태그**: GA4 - Basic Event - Sign Up (for App), GA4 - Basic Event - Sign Up

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|
| event_action | `sign up complete` | ✅ |
| event_category | `sign up` | ✅ |
| event_label | `{{DL - Event Label with customEvent}}` | ✅ |

## video_start|video_progress|video_complete

**태그**: GA4 - Basic Event - Video(YouTube) (for App), GA4 - Basic Event - Video(YouTube)

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|
| event_action | `youtube - {{JS - YouTube Status}}` | ✅ |
| event_category | `video` | ✅ |
| event_label | `{{Video Title}}` | ✅ |
| video_current_time | `{{Video Current Time}}` | ✅ |
| video_duration | `{{Video Duration}}` | ✅ |
| video_percent | `{{Video Percent}}` | ✅ |
| video_provider | `{{Video Provider}}` | ✅ |
| video_title | `{{Video Title}}` | ✅ |
| video_url | `{{Video URL}}` | ✅ |

## view_item

**태그**: GA4 - Ecommerce - View Item (for App), GA4 - Ecommerce - View Item

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|
| currency | `{{JS - Currency}}` | ✅ |
| event_action | `view item` | ✅ |
| event_category | `ecommerce` | ✅ |
| event_label | `{{JS - Item Name}}` | ✅ |
| items | `{{JS - View Item DataLayer}}` | ✅ |
| product_brandcode | `{{JS - Product Brandcode with View Item}}` | ✅ |
| product_brandname | `{{JS - Product Brandname with View Item}}` | ✅ |
| product_category | `{{JS - Product Category with View Item}}` | ✅ |
| product_id | `{{JS - Product Id with View Item}}` | ✅ |
| product_is_pacific | `{{JS - Product Is Pacific with View Item}}` | ✅ |
| product_is_stock | `{{JS - Product Is Stock with View Item}}` | ✅ |
| product_name | `{{JS - Product Name with View Item}}` | ✅ |
| product_pagecode | `{{JS - Product Pagecode with View Item}}` | ✅ |
| product_sn | `{{JS - Product Sn with View Item}}` | ✅ |

### Items Array Parameters

| GTM Key | GA4 API Dimension | 설명 |
|---------|-------------------|------|
| item_id | `itemId` | 상품 코드 |
| item_name | `itemName` | 상품명 |
| item_brand | `itemBrand` | 브랜드명 |
| item_category | `itemCategory` | 카테고리 1 |
| item_category2 | `itemCategory2` | 카테고리 2 |
| item_category3 | `itemCategory3` | 카테고리 3 |
| item_category4 | `itemCategory4` | 카테고리 4 |
| item_category5 | `itemCategory5` | 카테고리 5 |
| apg_brand_code | `customItem:apg_brand_code` | APG 브랜드 코드 |
| price | `price` | 판매가 |
| discount | `discount` | 할인금액 |
| original_price | `customItem:original_price` | 원가 |
| internal_brand_code | `customItem:internal_brand_code` | 내부 브랜드 코드 |

## view_item_list

**태그**: GA4 - Ecommerce - View Item List on SERP, GA4 - Ecommerce - View Item List on SERP (for App), GA4 - Ecommerce Event - SN View Item List(view_item_list), GA4 - Ecommerce Event - SN View Item List(view_item_list) (for App)

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|
| currency | `{{JS - Currency}}` | ✅ |
| event_action | `view item list` | ✅ |
| event_category | `ecommerce` | ✅ |
| items | `{{JS - View Item List DataLayer}}` | ✅ |
| search_mod_result | `{{JS - Modified Search Result}}` | ✅ |
| search_mod_term | `{{JS - Modified Search Term}}` | ✅ |
| search_result | `{{JS - Search Result}}` | ✅ |
| search_resultcount | `{{JS - Search Result Count}}` | ✅ |
| search_term | `{{JS - Search Term}}` | ✅ |
| search_type | `{{JS - Search Type}}` | ✅ |

### Items Array Parameters

| GTM Key | GA4 API Dimension | 설명 |
|---------|-------------------|------|
| item_id | `itemId` | 상품 코드 |
| item_name | `itemName` | 상품명 |
| item_brand | `itemBrand` | 브랜드명 |
| item_category | `itemCategory` | 카테고리 1 |
| item_category2 | `itemCategory2` | 카테고리 2 |
| item_category3 | `itemCategory3` | 카테고리 3 |
| item_category4 | `itemCategory4` | 카테고리 4 |
| item_category5 | `itemCategory5` | 카테고리 5 |
| index | `index` | 상품 순서 |
| item_list_name | `itemListName` | 상품 리스트명 |
| apg_brand_code | `customItem:apg_brand_code` | APG 브랜드 코드 |
| price | `price` | 판매가 |
| discount | `discount` | 할인금액 |
| original_price | `customItem:original_price` | 원가 |
| internal_brand_code | `customItem:internal_brand_code` | 내부 브랜드 코드 |

## view_promotion

**태그**: GA4 - Ecommerce - View Promotion (for App), GA4 - Ecommerce - View Promotion

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|
| event_action | `view promotion` | ✅ |
| event_category | `ecommerce` | ✅ |
| items | `{{JS - View Promotion DataLayer}}` | ✅ |

### Items Array Parameters

| GTM Key | GA4 API Dimension | 설명 |
|---------|-------------------|------|
| promotion_id | `itemPromotionId` | 프로모션 ID |
| promotion_name | `itemPromotionName` | 프로모션명 |
| creative_slot | `itemPromotionCreativeSlot` | 크리에이티브 슬롯 |
| index | `index` | 상품 순서 |

## view_promotion_detail

**태그**: GA4 - Basic Event - View Promotion Detail, GA4 - Basic Event - View Promotion Detail (for App)

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|
| event_action | `view promotion detail` | ✅ |
| event_category | `promotion` | ✅ |
| event_label | `{{JS - Promotion Name on Detail Page}}` | ✅ |
| view_event_brand | `{{JS - Promotion Brand on Detail Page}}` | ✅ |
| view_event_code | `{{JS - Promotion Code on Detail Page}}` | ✅ |
| view_event_name | `{{JS - Promotion Name on Detail Page}}` | ✅ |

## view_search_results

**태그**: GA4 - Basic Event - View Search Results (for App), GA4 - Basic Event - View Search Results

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|
| event_action | `search complete` | ✅ |
| event_category | `search` | ✅ |
| event_label | `{{JS - Search Term}}` | ✅ |
| search_mod_result | `{{JS - Modified Search Result}}` | ✅ |
| search_mod_term | `{{JS - Modified Search Term}}` | ✅ |
| search_result | `{{JS - Search Result}}` | ✅ |
| search_resultcount | `{{JS - Search Result Count}}` | ✅ |
| search_term | `{{JS - Search Term}}` | ✅ |
| search_type | `{{JS - Search Type}}` | ✅ |

## withdrawal

**태그**: GA4 - Basic Event - Withdrawal, GA4 - Basic Event - Withdrawal (for App)

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|
| event_action | `withdrawal complete` | ✅ |
| event_category | `withdrawal` | ✅ |
| event_label | `{{DL - Event Label with customEvent}}` | ✅ |

## write_review

**태그**: GA4 - Basic Event - Write Review, GA4 - Basic Event - Write Review (for App)

### Event Parameters

| Parameter Key | Value Source | Required |
|--------------|--------------|----------|
| event_action | `write review` | ✅ |
| event_category | `review` | ✅ |
| event_label | `{{JS - Review Product Name}}` | ✅ |
| review_product_code | `{{JS - Review Product Code}}` | ✅ |
| review_product_content | `{{JS - Review Product Content}}` | ✅ |
| review_product_name | `{{JS - Review Product Name}}` | ✅ |
| review_product_picture | `{{JS - Review Product Picture}}` | ✅ |
| review_product_rating | `{{JS - Review Product Rating}}` | ✅ |
