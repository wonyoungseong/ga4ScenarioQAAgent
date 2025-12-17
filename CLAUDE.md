# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Vision AI 기반 QA 자동화 시나리오 생성 에이전트**

Playwright로 웹 페이지 스크린샷을 캡처하고, Gemini Vision AI가 화면을 시각적으로 분석하여 이벤트 시나리오를 자동 생성합니다. Rule-based가 아닌, AI가 사람처럼 화면을 보고 판단합니다.

## Setup

```bash
# 의존성 설치
npm install

# .env 파일 생성 (GEMINI_API_KEY 필수)
cp .env.example .env
# .env 파일 편집하여 API 키 입력

# Playwright 브라우저 설치 (최초 1회)
npx playwright install chromium
```

## Commands

```bash
# 페이지 분석 (Vision AI)
npx ts-node src/cli.ts analyze --url <URL> --event <EVENT_NAME>

# 사용 가능한 이벤트 목록
npx ts-node src/cli.ts events

# 새 이벤트 가이드 템플릿 생성
npx ts-node src/cli.ts init <EVENT_NAME>

# 예시: SELECT_ITEM 분석
npx ts-node src/cli.ts analyze -u https://betc.co.kr/ecommerceMpaIndex.html -e SELECT_ITEM
```

## Architecture

```
src/
├── cli.ts                      # CLI 진입점
├── agent.ts                    # 메인 에이전트 (오케스트레이션)
├── analyzers/
│   ├── pageAnalyzer.ts         # Playwright 기반 페이지/스크린샷
│   └── visionAnalyzer.ts       # Gemini Vision AI 분석
└── index.ts                    # 모듈 exports

guides/                         # 이벤트별 가이드 문서 (System Prompt)
├── SELECT_ITEM.md
├── SELECT_PROMOTION.md
├── ADD_TO_CART.md
└── VIEW_ITEM.md

output/                         # 분석 결과 출력
├── screenshot_*.png
├── result_*.json
└── report_*.txt
```

## Core Flow

1. **PageAnalyzer**: Playwright로 페이지 방문 → 스크린샷 캡처
2. **GeminiVisionAnalyzer**: 스크린샷 + 가이드 문서를 Gemini에 전달
3. **AI 분석**: 화면을 시각적으로 분석하여 시나리오 생성
4. **결과**: shouldFire/shouldNotFire 시나리오 + 보고서

## Adding New Events

1. `npx ts-node src/cli.ts init NEW_EVENT` 실행
2. `guides/NEW_EVENT.md` 파일 편집
3. 이벤트 정의, 시각적 판단 기준, 예시 작성

## Key Files

- `guides/*.md`: 이벤트별 가이드 (AI system prompt로 사용)
- `src/analyzers/visionAnalyzer.ts`: Gemini Vision API 연동
- `.env`: GEMINI_API_KEY 설정

---

## 시나리오 검수 시스템 개발 현황 (2024-12)

### 완료된 기능

#### 1. GTM 분석 시스템
- `src/analyzers/gtmAnalyzer.ts`: GTM JSON 파싱 및 이벤트/트리거/태그 분석
- `src/analyzers/filterEvaluator.ts`: GTM 필터 조건 평가 (URL, 페이지 타입 등)
- CSS Selector 기반 트리거 조건 추출

#### 2. 종합 페이지 타입 감지
- `src/types/pageContext.ts`: 다중 신호 기반 페이지 타입 감지
  - URL 패턴 (70% 신뢰도)
  - Query Parameter (85-90% 신뢰도)
  - 전역변수 AP_PAGE_TYPE (95% 신뢰도)
  - dataLayer 내용 (70-90% 신뢰도)
  - DOM 요소 (50-60% 신뢰도)
- 신뢰도 가중치 기반 최종 페이지 타입 결정

#### 3. 통합 이벤트 분석기
- `src/analyzers/integratedEventAnalyzer.ts`
  - GTM 분석 + Vision AI + 개발가이드 파싱 + CSS Selector 검증 통합
  - Playwright로 실제 CSS Selector 존재 여부 검증
  - 연결 이벤트 로직 (login ↔ sign_up 동일 진입점)

#### 4. 개발 가이드 PDF 파서
- `src/parsers/developmentGuideParser.ts`: PDF 개발가이드에서 이벤트 정의 추출

#### 5. 이벤트 UI 요구사항
- `src/types/eventUIRequirements.ts`: 이벤트별 필요 UI 요소 정의
  - autoFire: 페이지 로드 시 자동 발생 이벤트
  - requiresUserAction: 사용자 액션 필요 이벤트

#### 6. Vision AI 폴백 로직 개선
- API 오류 시 이벤트 특성에 따른 분기 처리:
  - autoFire 이벤트 → hasUI: true (자동 발생)
  - requiresUserAction 이벤트 → hasUI: false (검증 불가 시 보수적 처리)

#### 7. GA4 Data API 연동 (OAuth 2.0)
- `src/ga4/ga4Client.ts`: GA4 Data API 클라이언트
  - OAuth 2.0 브라우저 인증 플로우
  - 토큰 자동 저장/갱신
  - 이벤트 목록, 페이지별 이벤트, 실시간 조회

### CLI 명령어

```bash
# GA4 설정 가이드
npx ts-node src/cli.ts ga4 setup

# GA4 OAuth 로그인
npx ts-node src/cli.ts ga4 login

# 이벤트 조회
npx ts-node src/cli.ts ga4 events
npx ts-node src/cli.ts ga4 events --ecommerce
npx ts-node src/cli.ts ga4 events --custom

# 페이지별 이벤트 조회
npx ts-node src/cli.ts ga4 page-events
npx ts-node src/cli.ts ga4 page-events --path /product/

# 실시간 이벤트 조회
npx ts-node src/cli.ts ga4 realtime
```

---

## 이벤트 예측 vs 실제 데이터 분석 가이드라인

### 분석 원칙

**중요**: 예측한 것과 실제 GA4 데이터가 다를 때, 무조건 데이터가 맞다고 판단하면 안 됩니다.
데이터 수집 자체에 오류가 있을 수 있으므로, 다음 기준으로 판단해야 합니다.

### 1. Verdict 분류 체계

| Verdict | 설명 | 조치 |
|---------|------|------|
| `CORRECT` | 예측과 실제가 일치 | 정상 |
| `FALSE_POSITIVE` | 발생 예측했으나 수집 안됨 | 트리거 구현 확인 필요 |
| `FALSE_NEGATIVE` | 발생 안할거라 예측했으나 수집됨 | 예측 로직 또는 트리거 검토 |
| `NOISE_COLLECTED` | 발생 안해야 하는데 노이즈로 수집 | 데이터 품질 이슈 |
| `EXPECTED_NOISE` | 발생 예측했으나 노이즈 수준만 수집 | 트리거 문제 가능성 |

### 2. 노이즈 판단 기준

```
비중 기준:
- 0.01% 미만: 확실한 노이즈 (테스트 트래픽, 봇, 오류)
- 0.01% ~ 0.1%: 낮은 유의성 (주의 필요)
- 0.1% 이상: 유의미한 이벤트
```

### 3. 노이즈 발생 원인 분석

| 원인 | 증상 | 해결방안 |
|------|------|----------|
| 잘못된 트리거 조건 | 특정 페이지에서 발생하면 안 되는 이벤트가 소량 발생 | GTM 트리거 조건 수정 |
| 페이지 타입 미감지 | AP_DATA_PAGETYPE 변수 누락 | 변수 설정 확인 |
| 테스트 트래픽 | QA/개발 환경 데이터 혼입 | GA4 필터 적용 |
| SPA 페이지 전환 이슈 | 이전 페이지 이벤트가 현재 페이지로 기록 | 이벤트 타이밍 조정 |

### 4. 이벤트 관계 기반 검증

이벤트 간의 논리적 관계로 데이터 품질 검증:

```
view_item → add_to_cart
  - view_item 없이 add_to_cart만 발생하면 비정상

view_item_list → select_item
  - 리스트 조회 없이 선택만 발생하면 비정상

begin_checkout → purchase
  - checkout 없이 purchase만 발생하면 비정상
```

### 5. 페이지-이벤트 정합성 검증

| 페이지 타입 | 허용 이벤트 | 비허용 이벤트 |
|------------|-------------|---------------|
| MAIN | page_view, view_promotion, select_promotion, scroll | view_item, add_to_cart, purchase |
| PRODUCT_DETAIL | view_item, add_to_cart | view_item_list |
| PRODUCT_LIST | view_item_list, select_item | view_item, begin_checkout |
| CART | view_cart, remove_from_cart | purchase |
| ORDER | begin_checkout | - |

### 6. GA4 자동 수집 이벤트 (예측 대상 아님)

다음 이벤트는 GA4가 자동으로 수집하므로 예측에서 제외:

```
- screen_view (모바일 앱 또는 SPA)
- session_start
- first_visit
- user_engagement
- scroll (Enhanced Measurement)
- click (Enhanced Measurement)
- file_download
- video_start, video_progress, video_complete
```

### 7. MAIN 페이지 실제 분석 결과 (2025-12-17)

```
📊 GA4 데이터 (7일간):
총 이벤트: 4,212,782건

✅ 정확한 예측:
- page_view (6.61%) - 예측 정확
- view_promotion (16.21%) - 예측 정확
- select_promotion (2.12%) - 예측 정확
- scroll (5.52%) - 예측 정확
- login (0.60%) - 예측 정확
- ap_click (24.14%) - 예측 정확
- custom_event (0.38%) - 예측 정확
- select_item (0%) - 발생 안함 예측 정확
- add_to_cart (0%) - 발생 안함 예측 정확
- purchase (0%) - 발생 안함 예측 정확

⚠️ 주의 필요:
- view_item_list: 예측했으나 노이즈 수준 (0.0019%) - 트리거 검토 필요
- sign_up: 예측했으나 수집 안됨 - 트리거 구현 확인

🔇 노이즈 수집 (데이터 품질 이슈):
- view_item (0.0005%) - MAIN에서 발생하면 안 됨
- view_search_results (0.0037%)
- live (0.0014%)
- video_progress (0.0002%)

📌 GA4 자동 수집 (예측 대상 아님):
- screen_view (37.08%)
- session_start (1.85%)
- first_visit (0.95%)
- user_engagement (0.76%)
```

### 8. 분석 도구

```bash
# MAIN 페이지 이벤트 분석
npx ts-node src/analyze-main-page-events.ts

# 페이지별 이벤트 조회
npx ts-node src/check-page-events.ts --url <URL>
```

---

## 사이트별 Edge Case 관리

### 개요

사이트마다 이벤트 구현 방식이 다를 수 있습니다. Edge Case 시스템은 GA4 Property ID 기준으로 사이트별 특이사항을 관리합니다.

### Edge Case 타입

| 타입 | 아이콘 | 설명 |
|------|--------|------|
| `PAGE_RESTRICTION` | 📍 | 특정 페이지에서만 발생 |
| `PAGE_EXCLUSION` | 🚫 | 특정 페이지에서 발생 안함 |
| `CONDITIONAL_FIRE` | ⚡ | 조건부 발생 |
| `CUSTOM_TRIGGER` | 🔧 | 커스텀 트리거 조건 |
| `DATA_LAYER_ALIAS` | 🏷️ | dataLayer 이벤트명이 다름 |
| `NOISE_EXPECTED` | 🔇 | 노이즈 수집 예상됨 |
| `NOT_IMPLEMENTED` | ⏸️ | 미구현 상태 |
| `DEPRECATED` | ❌ | 더 이상 사용 안함 |

### Edge Case 관리 CLI

```bash
# 전체 Edge Case 조회
npx ts-node src/manage-edge-cases.ts list

# 특정 Property의 Edge Case 조회
npx ts-node src/manage-edge-cases.ts list 416629733

# 이벤트 허용 여부 확인
npx ts-node src/manage-edge-cases.ts check 416629733 sign_up MAIN

# 새 사이트 설정 초기화
npx ts-node src/manage-edge-cases.ts init <propertyId> <siteName> <domain>

# Edge Case 추가 (대화형)
npx ts-node src/manage-edge-cases.ts add 416629733 <eventName>
```

### 파일 구조

```
config/
└── edge-cases.json    # GA4 Property ID별 Edge Case 정의

src/config/
└── siteEdgeCases.ts   # Edge Case 로더 및 유틸리티
```

### Edge Case JSON 구조

```json
{
  "schemaVersion": "1.0.0",
  "sites": {
    "416629733": {
      "propertyId": "416629733",
      "siteName": "아모레몰 KR",
      "domain": "amoremall.com",
      "edgeCases": [
        {
          "eventName": "sign_up",
          "type": "PAGE_RESTRICTION",
          "description": "회원가입 완료 전용 페이지에서만 발생",
          "allowedPageTypes": ["SIGNUP_COMPLETE"],
          "createdAt": "2025-12-17",
          "source": "GA4 데이터 분석"
        }
      ]
    }
  }
}
```

### 아모레몰 Edge Case 예시 (2025-12-17 기준)

| 이벤트 | 타입 | 설명 |
|--------|------|------|
| sign_up | PAGE_RESTRICTION | 회원가입 완료 페이지에서만 발생 |
| login | PAGE_RESTRICTION | 로그인 페이지 또는 ALL (리다이렉트 후) |
| view_item_list | CONDITIONAL_FIRE | MAIN에서 뷰포트 노출 시만 발생 |
| view_item | NOISE_EXPECTED | MAIN에서 0.001% 이하 노이즈 |
| select_item | PAGE_EXCLUSION | MAIN, CART, ORDER, MY 제외 |
| purchase | PAGE_RESTRICTION | ORDER_COMPLETE에서만 발생 |

---
