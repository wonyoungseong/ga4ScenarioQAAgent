# 업데이트 필요 파일 리스트

## 분석 결과 요약

GTM JSON 분석 결과, 현재 가이드 파일들에 **하드코딩된 dataLayer 이벤트명이 실제 GTM 설정과 불일치**합니다.

### 발견된 불일치 (Amoremall GTM 기준)

| GA4 이벤트 | 가이드 파일 값 | 실제 GTM 값 | 상태 |
|-----------|--------------|------------|------|
| `login` | `login` | `login_complete` | **불일치** |
| `sign_up` | `sign_up` | `sign_up_complete` | **불일치** |
| `view_search_results` | `view_search_results` | `search` | **불일치** |
| `write_review` | `write_review` | `review` | **불일치** |
| `begin_checkout` | `checkout` | `^cart$\|purchasecartbtn\|...` | 부분 일치 |
| `ap_click` | `[ap-data-click]` | `[ap-click-area]` | **불일치** |

---

## 수정 방향

### 옵션 A: 가이드를 GA4 표준 + 사이트 참조 방식으로 변경 (권장)
- 가이드에서 사이트별 구현 세부사항 제거
- `site-config.json` 참조하도록 안내 추가
- GA4 표준 이벤트 정의에 집중

### 옵션 B: 가이드를 Amoremall 기준으로 수정
- 발견된 불일치 값들을 GTM 실제 값으로 수정
- 다른 사이트에는 적용 불가

---

## 파일별 수정 필요 내용

### 1. guides/ 폴더 (17개 파일)

#### 1.1 수정 필수 (4개 파일) - 값 불일치

| 파일 | 현재 값 | 수정 필요 값 | 위치 |
|-----|--------|-------------|------|
| `login.md` | `event: "login"` | `event: "login_complete"` (또는 사이트 참조) | 라인 54, 68, 198 |
| `sign_up.md` | `event: "sign_up"` | `event: "sign_up_complete"` (또는 사이트 참조) | 라인 25, 104 |
| `view_search_results.md` | `event: "view_search_results"` | `event: "search"` (또는 사이트 참조) | 라인 53, 65, 204 |
| `write_review.md` | `event: "write_review"` | `event: "review"` (또는 사이트 참조) | 라인 48, 61, 201 |

#### 1.2 수정 권장 (1개 파일) - CSS Selector 불일치

| 파일 | 현재 값 | 수정 필요 값 |
|-----|--------|-------------|
| `ap_click.md` | `[ap-data-click]` | `[ap-click-area], [ap-click-area] *` |

#### 1.3 구조 변경 권장 (13개 파일) - 사이트 참조 방식 적용

모든 가이드 파일에 다음 섹션 추가 필요:

```markdown
## 사이트별 구현 참조

실제 dataLayer 이벤트명은 사이트마다 다릅니다.
- Amoremall: `sites/amoremall-kr/site-config.json` 참조
- Innisfree Shopify: `sites/innisfree-shopify/site-config.json` 참조
```

#### 대상 파일 목록:
1. `select_promotion.md` - 구조 OK, 사이트 참조 추가
2. `select_item.md` - 구조 OK, 사이트 참조 추가
3. `add_to_cart.md` - `addcart` → 사이트 참조
4. `remove_from_cart.md` - `removecart` → 사이트 참조
5. `view_item.md` - `product` → 사이트 참조
6. `view_item_list.md` - `view_item_list` → 사이트 참조
7. `view_promotion.md` - 사이트 참조 추가
8. `view_cart.md` - `view_cart` → 사이트 참조
9. `begin_checkout.md` - `checkout` → 사이트 참조
10. `purchase.md` - `purchase` → 사이트 참조
11. `page_view.md` - 사이트 참조 추가
12. `scroll.md` - 사이트 참조 추가
13. `integrated_test_matrix.md` - 사이트별 매핑 테이블 추가

---

### 2. scenarios/ 폴더 (1개 파일)

| 파일 | 수정 필요 내용 | 우선순위 |
|-----|--------------|---------|
| `amoremall_select_promotion.md` | 현재 내용 OK (LINK_CLICK 정확) | 낮음 |

**변경 사항**:
- 헤더에 사이트 설정 파일 참조 추가
- GTM 컨테이너 ID 명시

---

### 3. docs/ 폴더 (1개 파일)

| 파일 | 수정 필요 내용 | 우선순위 |
|-----|--------------|---------|
| `multi-site-architecture.md` | 완료됨 (이번에 생성) | - |

**추가 생성 필요**:
- `docs/guide-update-instructions.md` - 가이드 작성/수정 지침
- `docs/gtm-parsing-guide.md` - GTM JSON 파싱 방법

---

### 4. templates/ 폴더 (1개 파일)

| 파일 | 수정 필요 내용 | 우선순위 |
|-----|--------------|---------|
| `integrated_test_scenario_template.md` | dataLayer 이벤트명을 플레이스홀더로 변경 | 중간 |

**변경 예시**:
```javascript
// Before
dataLayer.push({ event: "addcart", ... });

// After
dataLayer.push({ event: "[site-config.eventMapping.add_to_cart]", ... });
```

---

## 우선순위별 수정 작업

### P1: 즉시 수정 필요 (값 불일치) - ✅ 완료
1. ✅ `guides/login.md` - 사이트별 참조 방식으로 수정 완료
2. ✅ `guides/sign_up.md` - 사이트별 참조 방식으로 수정 완료
3. ✅ `guides/view_search_results.md` - 사이트별 참조 방식으로 수정 완료
4. ✅ `guides/write_review.md` - 사이트별 참조 방식으로 수정 완료
5. ✅ `guides/ap_click.md` - CSS Selector 사이트별 참조 방식으로 수정 완료

### P2: 구조 개선 (사이트 참조 방식) - ✅ 완료
1. ✅ 모든 가이드에 "사이트별 구현 참조" 섹션 추가 완료
2. ✅ 하드코딩된 이벤트명을 사이트 설정 참조로 변경 완료
3. ✅ 템플릿 파일 업데이트 완료

**수정된 가이드 파일 (총 16개):**
- ✅ login.md
- ✅ sign_up.md
- ✅ view_search_results.md
- ✅ write_review.md
- ✅ ap_click.md
- ✅ add_to_cart.md
- ✅ begin_checkout.md
- ✅ view_item.md
- ✅ purchase.md
- ✅ remove_from_cart.md
- ✅ view_cart.md
- ✅ view_item_list.md
- ✅ select_item.md
- ✅ view_promotion.md
- ✅ select_promotion.md
- ✅ templates/integrated_test_scenario_template.md

### P3: 문서 보완 - ✅ 완료
1. ✅ `docs/guide-update-instructions.md` 생성 완료
2. ✅ `docs/gtm-parsing-guide.md` 생성 완료

---

## 수정하지 않아도 되는 파일

| 파일/폴더 | 이유 |
|----------|------|
| `src/types/siteConfig.ts` | 이번에 새로 생성 |
| `src/parsers/gtmConfigExtractor.ts` | 이번에 새로 생성 |
| `sites/amoremall-kr/site-config.json` | 이번에 새로 생성 |
| `sites/innisfree-shopify/site-config.json` | 이번에 새로 생성 |
| `scenarios/amoremall_select_promotion.md` | 내용 정확함 |

---

## 권장 수정 방식

### 가이드 파일 수정 패턴

**Before (하드코딩):**
```javascript
dataLayer.push({
  event: "login",  // 하드코딩
  method: "email"
});
```

**After (사이트 참조 방식):**
```javascript
// 실제 event 값은 사이트 설정에 따라 다름
// Amoremall: "login_complete"
// Shopify: "login_complete"
dataLayer.push({
  event: "[사이트별 eventMapping.login 참조]",
  method: "email"
});
```

또는

```markdown
### dataLayer 구조

실제 event 이름은 `sites/{site}/site-config.json`의 `eventMapping.login` 값을 사용합니다.

**예시 (Amoremall):**
\`\`\`javascript
dataLayer.push({
  event: "login_complete",  // site-config.json에서 확인
  method: "email"
});
\`\`\`
```
