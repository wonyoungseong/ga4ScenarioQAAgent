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
