# 이벤트 스펙 문서

> Vision AI 기반 QA 자동화 에이전트를 위한 이벤트 스펙 관리

---

## 폴더 구조

```
specs/
├── README.md                    # 이 문서
├── common/                      # GA4 표준 이벤트 정의 (공통)
│   └── ga4_standard_events.yaml # GA4 표준 이벤트 스펙
│
└── sites/                       # 사이트별 스펙
    └── {site_name}/             # 사이트별 폴더
        ├── site_config.yaml     # 사이트 설정 (참조 문서, 변수 규칙 등)
        ├── EVENT_LIST.md        # 해당 사이트의 이벤트 목록
        ├── events/              # 이벤트별 상세 스펙
        │   ├── view_item.yaml
        │   ├── purchase.yaml
        │   └── ...
        └── mapping/             # 파라미터 매핑 문서
            ├── param-mapping.yaml
            └── PARAM_MAPPING_TABLE.md
```

---

## 에이전트 작동 흐름

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           입력                                          │
├─────────────────────────────────────────────────────────────────────────┤
│  1. URL           - 분석할 웹 페이지 주소                                │
│  2. 개발 가이드    - 사이트별 dataLayer 변수 정의 문서                    │
│  3. GTM .json     - 해당 사이트의 GTM 컨테이너 설정                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Vision AI 분석                                     │
├─────────────────────────────────────────────────────────────────────────┤
│  1. 스크린샷 캡처 (Playwright)                                          │
│  2. 화면 분석 → 필요한 이벤트 판단                                       │
│     - 상품 상세 페이지? → view_item                                     │
│     - 장바구니 버튼 있음? → add_to_cart                                 │
│     - 프로모션 배너 있음? → view_promotion                              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      스펙 참조                                          │
├─────────────────────────────────────────────────────────────────────────┤
│  1. common/ga4_standard_events.yaml                                    │
│     → GA4 표준: 어떤 파라미터가 필수/권장인지                            │
│                                                                         │
│  2. sites/{site_name}/events/*.yaml                                    │
│     → 사이트별 구현: 개발 가이드 변수 ↔ GTM 변수 ↔ GA4 파라미터 매핑     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       출력: 시나리오                                     │
├─────────────────────────────────────────────────────────────────────────┤
│  {                                                                      │
│    "event": "view_item",                                               │
│    "shouldFire": [...],      // 이벤트가 발생해야 하는 조건              │
│    "shouldNotFire": [...],   // 이벤트가 발생하면 안되는 조건            │
│    "parameters": {           // 검증해야 할 파라미터                     │
│      "item_id": "AP_PRD_CODE 값과 일치",                                │
│      "price": "AP_PRD_PRICE 값과 일치"                                  │
│    }                                                                    │
│  }                                                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 파일 설명

### common/ga4_standard_events.yaml

GA4 공식 문서 기반의 **표준 이벤트 스펙**입니다.
- 사이트에 관계없이 동일하게 적용되는 GA4 표준
- 각 이벤트의 필수/권장 파라미터 정의
- items 배열의 표준 파라미터 정의

### sites/{site_name}/site_config.yaml

사이트별 **설정 파일**입니다.
- 참조 문서 (개발 가이드, GTM 컨테이너)
- 변수 네이밍 규칙 (AP_*, 등)
- dataLayer 이벤트명 매핑
- GTM Variable 패턴

### sites/{site_name}/events/*.yaml

사이트별 **이벤트 구현 스펙**입니다.
- 개발 가이드 변수 → GTM Variable → GA4 파라미터 매핑
- 해당 사이트에서의 트리거 조건
- dataLayer 예시 코드
- 검증 시 주의사항

### sites/{site_name}/mapping/

사이트별 **파라미터 매핑 문서**입니다.
- `param-mapping.yaml`: YAML 형식의 전체 매핑
- `PARAM_MAPPING_TABLE.md`: 사람이 읽기 쉬운 테이블 형식

---

## 새 사이트 추가하기

1. **사이트 폴더 생성**
   ```bash
   mkdir -p specs/sites/{new_site_name}/events
   mkdir -p specs/sites/{new_site_name}/mapping
   ```

2. **site_config.yaml 작성**
   - 참조 문서 경로
   - 변수 네이밍 규칙
   - dataLayer 이벤트 매핑

3. **개발 가이드 분석**
   - 변수명 추출 (예: AP_PRD_CODE)
   - 데이터 타입 확인
   - 필수/선택 여부 확인

4. **GTM .json 분석**
   - GTM Variable 이름 추출
   - 트리거 조건 확인
   - 태그-변수 매핑 확인

5. **이벤트 스펙 생성**
   - 각 이벤트별 YAML 파일 생성
   - 개발 가이드 ↔ GTM ↔ GA4 매핑

---

## 현재 등록된 사이트

| 사이트 | 폴더 | 이벤트 수 | 상태 |
|-------|------|----------|------|
| 아모레퍼시픽 | `sites/amorepacific_GTM-5FK5X5C4/` | 21개 | 완료 |

> 폴더명 규칙: `{사이트명}_{GTM컨테이너ID}`

---

## 사용 방법

### 시나리오 에이전트에서 참조

```python
import yaml

# GA4 표준 스펙 로드
with open('specs/common/ga4_standard_events.yaml', 'r', encoding='utf-8') as f:
    ga4_standard = yaml.safe_load(f)

# 사이트별 설정 로드
with open('specs/sites/amorepacific/site_config.yaml', 'r', encoding='utf-8') as f:
    site_config = yaml.safe_load(f)

# 이벤트 스펙 로드
with open('specs/sites/amorepacific/events/view_item.yaml', 'r', encoding='utf-8') as f:
    event_spec = yaml.safe_load(f)
```

---

## 참고 문서

- [GA4 E-Commerce 이벤트](https://developers.google.com/analytics/devguides/collection/ga4/ecommerce)
- [GA4 권장 이벤트](https://developers.google.com/analytics/devguides/collection/ga4/reference/events)
- [GTM 변수 참조](https://support.google.com/tagmanager/answer/7683362)

---

*최종 수정: 2024-12-15*
