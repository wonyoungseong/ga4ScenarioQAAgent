# GTM 제약조건 검증 프로세스

## 0. 빠른 시작 (LLM/개발자용)

### ⚠️ 새 이벤트 추가 시 필수 체크

**CUSTOM_EVENT 트리거인 경우 반드시 의존성 체인 분석을 실행하세요!**

```typescript
// ✅ 권장: EventMetadataFactory 사용 (자동 검증)
import { EventMetadataFactory } from './config/eventMetadataFactory';

const factory = new EventMetadataFactory('./GTM-5FK5X5C4_workspace112.json');
const result = factory.createEventMetadata({
  eventName: 'new_custom_event',
  displayName: '새 커스텀 이벤트',
  description: '설명',
  fireType: 'userAction',
  // pageTypes를 지정하지 않으면 자동 감지 시도!
});

// 결과 확인
console.log(result.validation);  // 검증 결과
console.log(result.warnings);    // 경고 메시지
console.log(result.metadata.pageTypes);  // 자동 감지된 pageTypes
```

### 왜 이게 중요한가?

```
CUSTOM_EVENT 트리거의 함정:

GTM 트리거 (직접 분석)     숨겨진 제약조건 (놓치기 쉬움)
┌─────────────────────┐    ┌─────────────────────────────┐
│ _event = "xxx"      │    │ HTML 태그 → window 변수     │
│ 페이지 필터: 없음   │ → │ → window 변수 생성 태그     │
│                     │    │   → 여기에 PAGE_TYPE 조건!  │
└─────────────────────┘    └─────────────────────────────┘
        ↓                              ↓
  "모든 페이지 발생"으로    실제로는 특정 페이지에서만 발생
  잘못 판단할 수 있음
```

---

## 1. 개요

GTM 태그/트리거 분석 시 누락될 수 있는 제약조건을 자동으로 감지하고 관리하는 프로세스입니다.

### 문제점

GTM에서 CUSTOM_EVENT 트리거는 `dataLayer.push({event: "xxx"})` 발생만 확인하고, **어떤 페이지에서 해당 이벤트가 push되는지는 GTM 자체에서 알 수 없습니다**.

예시:
```javascript
// GTM 트리거: _event = "click_with_duration"
// → GTM은 이 이벤트가 어디서 발생하는지 모름

// 실제 개발 코드 (GTM 외부)
if (pageType === 'PRODUCT_DETAIL') {
  dataLayer.push({event: 'click_with_duration', ...});
}
```

### 해결 방안

1. **자동 감지**: GTM 분석 시 제약조건 누락 가능성 자동 경고
2. **수동 오버라이드**: 알려진 제약조건을 설정 파일로 관리
3. **검증 워크플로우**: 시나리오 생성 전 제약조건 검토 프로세스

---

## 2. 자동 감지 규칙

### 2.1 검사 항목

| 규칙 ID | 검사 항목 | 심각도 | 설명 |
|---------|----------|--------|------|
| R001 | CUSTOM_EVENT 페이지 제한 | MEDIUM | CUSTOM_EVENT 트리거에 페이지 필터 없음 |
| R002 | 클릭 트리거 셀렉터 | MEDIUM | 클릭 트리거에 CSS 셀렉터 조건 없음 |
| R003 | Duration 이벤트 조건 | LOW | 시간 측정 이벤트의 발생 조건 미확인 |
| R004 | 캠페인 이벤트 기간 | MEDIUM | 캠페인 한정 이벤트의 활성 기간 미확인 |
| R005 | 페이지 특정 이벤트 | HIGH | view_item 등 페이지 특정 이벤트에 제한 없음 |

### 2.2 실행 방법

```bash
# 특정 이벤트 검증
npx ts-node src/analyzers/gtmConstraintValidator.ts

# 전체 이벤트 검증 (추후 구현)
npx ts-node src/analyzers/gtmConstraintValidator.ts --all
```

---

## 3. 수동 오버라이드 관리

### 3.1 설정 파일 위치

```
config/event-constraints-override.json
```

### 3.2 설정 구조

```json
{
  "eventConstraints": [
    {
      "eventName": "click_with_duration",
      "constraint": {
        "type": "PAGE_TYPE_RESTRICTION",
        "allowedPageTypes": ["PRODUCT_DETAIL", "EVENT_DETAIL"],
        "excludedPageTypes": ["CART", "ORDER"],
        "description": "상품/이벤트 상세 페이지에서만 발생"
      },
      "source": "manual_review",
      "reviewStatus": "CONFIRMED",
      "reviewNote": "개발팀 확인 완료 (2025-12-26)",
      "createdAt": "2025-12-26"
    }
  ]
}
```

### 3.3 reviewStatus 값

| 상태 | 설명 |
|------|------|
| `PENDING` | 검토 대기 중 |
| `CONFIRMED` | 확인 완료 |
| `REJECTED` | 제약조건 불필요 확인 |
| `NEEDS_UPDATE` | 업데이트 필요 |

---

## 4. 검증 워크플로우

### 4.1 시나리오 생성 전 검증

```
1. GTM 분석
   ↓
2. 자동 제약조건 감지 (gtmConstraintValidator)
   ↓
3. 경고 항목 확인
   ├─ 심각도 HIGH → 즉시 검토 필요
   ├─ 심각도 MEDIUM → 오버라이드 설정 확인
   └─ 심각도 LOW → 노트 기록
   ↓
4. 오버라이드 설정 적용
   ↓
5. 시나리오 생성
```

### 4.2 새 이벤트 추가 시 체크리스트

- [ ] GTM 트리거 타입 확인 (CUSTOM_EVENT, CLICK, etc.)
- [ ] 페이지 타입 제한 조건 확인
- [ ] dataLayer 이벤트가 어디서 push되는지 개발 코드 확인
- [ ] 쿠키/사용자 상태 조건 확인
- [ ] 캠페인/시간 제한 여부 확인
- [ ] 오버라이드 설정 파일에 기록

---

## 5. 통합 예시

### 5.1 click_with_duration 분석 사례

**GTM 분석 결과:**
```
트리거: CE - Click with Duration Trigger (ID: 212)
조건: _event = "click_with_duration"
페이지 필터: 없음
```

**자동 감지 경고:**
```
⚠️ [MEDIUM] 이벤트 'click_with_duration'에 페이지 타입 제한이 없습니다.
   → dataLayer.push가 어디서 발생하는지 개발 코드 확인 필요
```

**개발 코드 확인 후:**
```javascript
// 실제로는 상품 상세 페이지에서만 push됨
if (AP_DATA_PAGETYPE === 'PRODUCT_DETAIL') {
  dataLayer.push({event: 'click_with_duration', ...});
}
```

**오버라이드 설정:**
```json
{
  "eventName": "click_with_duration",
  "constraint": {
    "type": "PAGE_TYPE_RESTRICTION",
    "allowedPageTypes": ["PRODUCT_DETAIL"],
    "description": "상품 상세 페이지에서만 dataLayer push 발생"
  },
  "reviewStatus": "CONFIRMED"
}
```

---

## 6. 메타데이터 반영

오버라이드 설정이 확인되면 `amoremallEventMetadata.ts`에 반영:

```typescript
// click_with_duration
events.push({
  eventName: 'click_with_duration',
  fireType: 'userAction',
  pageTypes: ['PRODUCT_DETAIL'],  // ← 오버라이드에서 확인된 제한
  // ...
});
```

---

## 7. 정기 검토

### 주기
- GTM 업데이트 시 (버전 변경 감지)
- 월 1회 정기 검토
- 새 이벤트 추가 시

### 검토 항목
1. 오버라이드 설정의 유효성 확인
2. GTM 트리거 변경 여부 확인
3. 개발 코드 변경으로 인한 제약조건 변경 여부
