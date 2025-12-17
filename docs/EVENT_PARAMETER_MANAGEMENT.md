# 이벤트 파라미터 관리 가이드

## 개요

GTM 태그에서 추출한 이벤트별 파라미터 키를 관리하는 방법과 권장 아키텍처를 설명합니다.

## 현재 구현된 기능

### 1. 자동 추출 (`EventParameterExtractor`)

GTM JSON 파일에서 모든 GA4 이벤트 태그를 파싱하여 파라미터 키를 자동 추출합니다.

```bash
# 실행 방법
npx ts-node src/extract-event-parameters.ts
```

**생성 파일:**
- `output/event_parameters.json` - 프로그래밍용 JSON
- `guides/EVENT_PARAMETERS.md` - 시나리오 가이드 작성 참조용 Markdown

### 2. GTMConfigLoader 통합

GTM 설정 로드 시 이벤트 파라미터도 함께 로드됩니다.

```typescript
const loader = createDefaultGTMConfigLoader();
const config = await loader.preload();

// 특정 이벤트의 파라미터 조회
const viewItemParams = config.eventParameters.get('view_item');
console.log(viewItemParams?.parameters.map(p => p.key));
// ['currency', 'event_action', 'event_category', 'items', 'product_id', ...]

// 모든 이벤트의 파라미터 키 목록
const allParams = loader.getAllEventParameterKeys();
```

---

## 권장 관리 방법

### 옵션 1: 자동 추출 + Markdown 문서 (권장)

**장점:**
- GTM 변경 시 스크립트 재실행으로 자동 업데이트
- Markdown 문서로 시나리오 작성자가 쉽게 참조 가능
- JSON 파일로 프로그래밍 연동 용이

**사용 방법:**
1. GTM JSON 파일이 업데이트되면 추출 스크립트 실행
2. `guides/EVENT_PARAMETERS.md`를 시나리오 가이드 작성 시 참조
3. 시나리오 검증 시 `event_parameters.json` 활용

### 옵션 2: 이벤트별 가이드 파일에 파라미터 섹션 추가

각 이벤트 가이드 파일(`guides/SELECT_ITEM.md` 등)에 파라미터 정보 포함.

**장점:**
- 이벤트별로 모든 정보 한 곳에서 관리
- 시나리오 작성자가 이벤트 가이드만 보면 됨

**단점:**
- GTM 변경 시 수동 업데이트 필요
- 중복 관리 가능성

### 옵션 3: 중앙 설정 파일 (`config/events.yaml`)

YAML 파일로 이벤트-파라미터 매핑을 중앙 관리.

```yaml
events:
  view_item:
    description: "상품 상세 페이지 조회"
    allowedPageTypes: [PRODUCT_DETAIL]
    parameters:
      - key: items
        required: true
        description: "상품 정보 배열"
      - key: currency
        required: true
        description: "통화 코드 (KRW)"
```

**장점:**
- 버전 관리 용이
- 개발가이드와 GTM 정보 통합 가능

**단점:**
- 수동 업데이트 필요

---

## 권장 아키텍처

```
┌─────────────────────────────────────────────────────┐
│                  GTM JSON 파일                       │
│            GTM-5FK5X5C4_workspace112.json           │
└───────────────────┬─────────────────────────────────┘
                    │ 자동 추출
                    ▼
┌─────────────────────────────────────────────────────┐
│              EventParameterExtractor                │
│         src/config/eventParameterConfig.ts          │
└───────────────────┬─────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
┌───────────┐ ┌───────────┐ ┌───────────────┐
│   JSON    │ │ Markdown  │ │ GTMConfigLoader│
│  output/  │ │  guides/  │ │ (런타임 연동) │
└───────────┘ └───────────┘ └───────────────┘
      │             │               │
      ▼             ▼               ▼
  프로그래밍     시나리오 가이드    시나리오 검증
   연동          작성 참조         자동화
```

---

## 시나리오 가이드 작성 시 활용

### 예시: `view_item` 이벤트 시나리오 가이드

```markdown
# VIEW_ITEM 이벤트 시나리오 가이드

## 이벤트 정의
- **이벤트명**: view_item
- **발생 시점**: 상품 상세 페이지 로드 완료 시
- **허용 페이지**: PRODUCT_DETAIL

## 확인해야 할 파라미터

| Parameter | 확인 항목 |
|-----------|----------|
| items | 상품 정보 배열 (item_id, item_name, price 포함 확인) |
| currency | KRW 값 확인 |
| product_id | 상품 코드 값 확인 |
| product_name | 상품명 값 확인 |
| product_brandname | 브랜드명 값 확인 |

## 테스트 시나리오

### shouldFire
1. 상품 상세 페이지 직접 접근
2. 검색 결과에서 상품 클릭하여 상세 페이지 이동
3. 장바구니에서 상품 클릭하여 상세 페이지 이동

### shouldNotFire
1. 상품 목록 페이지에서 이미지만 보기 (상세 미이동)
```

---

## 운영 프로세스

### GTM 업데이트 시

1. **GTM JSON 내보내기**
   - GTM 관리자 화면에서 컨테이너 JSON 내보내기
   - 프로젝트 루트에 저장

2. **파라미터 추출 실행**
   ```bash
   npx ts-node src/extract-event-parameters.ts
   ```

3. **변경 사항 확인**
   - `output/event_parameters.json` diff 확인
   - 새로운 이벤트/파라미터 추가 여부 확인

4. **시나리오 가이드 업데이트**
   - 새로운 파라미터에 대한 검증 항목 추가
   - 기존 시나리오 영향 확인

---

## API 사용 예시

### 특정 이벤트의 파라미터 조회

```typescript
import { createDefaultGTMConfigLoader } from './config/gtmConfigLoader';

async function getEventParams(eventName: string) {
  const loader = createDefaultGTMConfigLoader();
  await loader.preload();

  const params = loader.getEventParameters(eventName);
  if (params) {
    console.log(`Event: ${params.eventName}`);
    console.log(`Tags: ${params.tagNames.join(', ')}`);
    console.log(`Parameters:`);
    params.parameters.forEach(p => {
      console.log(`  - ${p.key}: ${p.valueSource}`);
    });
  }
}

getEventParams('add_to_cart');
```

### 시나리오 검증 시 파라미터 체크

```typescript
async function validateEventParameters(
  eventName: string,
  capturedParams: Record<string, any>
) {
  const loader = createDefaultGTMConfigLoader();
  await loader.preload();

  const expectedParams = loader.getEventParameters(eventName);
  if (!expectedParams) {
    return { valid: false, reason: 'Unknown event' };
  }

  const missingParams = expectedParams.parameters
    .filter(p => p.required && !capturedParams[p.key])
    .map(p => p.key);

  if (missingParams.length > 0) {
    return {
      valid: false,
      reason: `Missing required params: ${missingParams.join(', ')}`
    };
  }

  return { valid: true };
}
```

---

## 결론

**권장 관리 방법:**

1. **자동 추출 우선** - GTM JSON에서 자동 추출하여 항상 최신 상태 유지
2. **Markdown 문서 생성** - 시나리오 작성자를 위한 참조 문서 자동 생성
3. **런타임 연동** - GTMConfigLoader를 통해 시나리오 검증 시 파라미터 확인
4. **버전 관리** - JSON/MD 파일을 Git으로 관리하여 변경 이력 추적

이 방식으로 GTM 설정 변경 시에도 빠르게 파라미터 정보를 업데이트하고, 시나리오 가이드 작성과 자동 검증에 활용할 수 있습니다.
