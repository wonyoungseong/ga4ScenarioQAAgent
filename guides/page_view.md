# page_view 이벤트 가이드

## 이벤트 정의
**페이지가 로드될 때** 발생하는 이벤트입니다.
사용자가 새로운 페이지에 진입할 때마다 자동으로 발생하는 기본 이벤트입니다.
**모든 페이지에서 자동 발생**합니다.

---

## 1. 시각적 판단 기준 (Primary - 화면에서 찾기)

### 페이지 로드의 시각적 특징

#### 1) 모든 페이지
- **특징**: 브라우저에 새로운 콘텐츠가 표시됨
- **URL 변경**: 주소창의 URL이 변경됨
- **화면 전환**: 이전 페이지에서 새 페이지로 전환

#### 2) 페이지 타입 예시
- 메인 페이지 (/)
- 상품 목록 페이지 (/category/*)
- 상품 상세 페이지 (/product/*)
- 검색 결과 페이지 (/search?q=*)
- 마이페이지 (/mypage/*)

### page_view 외 추가 이벤트가 필요한 페이지

| 페이지 타입 | page_view | 추가 이벤트 |
|-----------|-----------|------------|
| 메인 페이지 | O | `view_promotion` |
| 상품 목록 | O | `view_item_list` |
| 상품 상세 | O | `view_item` |
| 검색 결과 | O | `view_search_results` |
| 장바구니 | O | `view_cart` |
| 결제 페이지 | O | `begin_checkout` |
| 주문 완료 | O | `purchase` |

---

## 2. GTM 트리거 조건 (검증용)

### 현재 구현된 조건
```
트리거 타입: PAGEVIEW (All Pages) 또는 HISTORY_CHANGE
발생 시점: 페이지 로드 완료 시 자동
```

### 트리거 타입별 발생 조건

| 트리거 타입 | 발생 상황 | 확인 방법 |
|-----------|---------|----------|
| **dom.ready** | 일반 페이지 로드 (MPA) | DOM 로드 완료 시 자동 발생 |
| **custom history change** | SPA 라우트 변경 | History API 변경 감지, old url ↔ new url 비교 |
| **ap_page_view** | iframe 내부 페이지 | iframe에서 별도 GTM 로드 시 발생 |

### 발생 조건
```
- 새 페이지로 이동 시
- 브라우저 새로고침 시
- 뒤로가기/앞으로가기 시
- SPA에서 라우트 변경 시 (History Change)
```

### SPA 이벤트 발생 검증 로직

SPA에서 page_view 이벤트 발생 시 다음 값들을 비교하여 검증:

```
검증 항목:
1. old url vs new url 비교
   - old url: 이전 페이지 URL (gtm.oldUrl)
   - new url: 현재 페이지 URL (gtm.newUrl)
   - 두 값이 다를 때만 page_view 발생해야 함

2. referrer 값 확인
   - page_referrer가 old url과 일치하는지 확인
   - 일치하지 않으면 referrer 설정 오류

3. History Change 트리거 동작 확인
   - pushState, replaceState, popstate 이벤트 감지
   - URL 변경 없이 hash만 변경되는 경우 정책 확인
```

### 실제 GTM 구현 (참고)

**GTM 변수 구성:**
| 변수명 | 타입 | 값 | 설명 |
|--------|------|-----|------|
| DL - History Old URL | dataLayer Variable | `gtm.oldUrl` | 이전 페이지 URL |
| DL - History New URL | dataLayer Variable | `gtm.newUrl` | 현재 페이지 URL |
| JS - History Change Flag | Custom JavaScript | old != new 비교 | URL 변경 여부 플래그 |

**JS - History Change Flag 로직:**
```javascript
function() {
  var result;
  if ({{DL - History Old URL}} != {{DL - History New URL}}) {
    result = true;
  } else {
    result = false;
  }
  return result;
}
```

**Delayed History Change 로직:**
```javascript
// URL이 다를 때만 실행
if ({{DL - History Old URL}} != {{DL - History New URL}}) {
  var oldUrl = {{DL - History Old URL}};
  var newUrl = {{DL - History New URL}};
  var timeout = 1000; // 1초 지연

  window.setTimeout(function() {
    // sessionStorage에 URL 저장 (디버깅용)
    sessionStorage.setItem('gtm_previous_url', oldUrl);
    sessionStorage.setItem('gtm_current_url', newUrl);

    // custom.historyChange 이벤트 발생
    window.dataLayer.push({
      event: 'custom.historyChange',
      custom: {
        oldUrl: oldUrl,
        newUrl: newUrl,
        historyChangeSource: {{History Source}},
        newHistoryState: {{New History State}},
        oldHistoryState: {{Old History State}},
        newHistoryFragment: {{New History Fragment}},
        oldHistoryFragment: {{Old History Fragment}}
      }
    });
  }, timeout);
}
```

**트리거 구성:**
| 트리거명 | 이벤트 | 설명 |
|---------|--------|------|
| CE - History Change Trigger | `gtm.historyChange-v2` | GTM 기본 History Change |
| HC - History Change Trigger | `custom.historyChange` | 커스텀 History Change (1초 딜레이) |

**SPA page_view 미발생 시 확인사항:**
```
□ sessionStorage에서 gtm_previous_url, gtm_current_url 값 확인
□ 두 URL이 동일한 경우 → 이벤트가 정상적으로 차단됨 (오류 아님)
□ URL이 다른데 미발생 → 트리거 설정 또는 1초 딜레이 전 페이지 이탈 확인
□ History Source 값 확인 (pushState, popstate, replaceState 등)
```

### 이벤트 미발생 시 디버깅 체크리스트

page_view가 발생하지 않는 경우 다음 항목을 확인:

```
□ dom.ready 트리거가 설정되어 있는지 확인
□ SPA의 경우 custom history change 트리거 설정 확인
□ old url과 new url이 동일하여 이벤트가 차단되었는지 확인
□ referrer 값이 올바르게 설정되었는지 확인
□ GTM 컨테이너가 해당 페이지에 로드되었는지 확인
□ 트리거 조건에 필터가 적용되어 특정 페이지가 제외되었는지 확인
□ iframe 내부의 경우 ap_page_view 트리거 설정 확인
```

### dataLayer 구조
```javascript
// 기본 page_view
dataLayer.push({
  event: "page_view",
  page_location: "https://example.com/category/skincare",
  page_title: "스킨케어 | 브랜드명"
});

// SPA에서 History Change 시
dataLayer.push({
  event: "page_view",
  page_location: "https://example.com/product/12345",  // new url
  page_title: "상품명 | 브랜드명",
  page_referrer: "https://example.com/category/skincare"  // old url
});
```

---

## 3. 분석 판단 프로세스

### Step 1: 페이지 로드 확인
다음 상황에서 발생해야 합니다:
- URL이 변경됨
- 새로운 콘텐츠가 화면에 표시됨
- 브라우저 히스토리에 추가됨

### Step 2: SPA 여부 확인
- **일반 웹**: 페이지 로드 시 자동 발생
- **SPA**: History Change 트리거로 처리 필요

### Step 3: 트래킹 확인
- 페이지 로드 시 GTM이 page_view 이벤트를 발생시키는지 확인
- GA4로 데이터가 전송되는지 확인

### Step 4: 결과 분류

#### Case A: 페이지 로드 + 트래킹 있음
→ **Should Fire**: 정상 동작

#### Case B: 페이지 로드 + 트래킹 없음
→ **구현 누락**: GTM 기본 설정 필요

#### Case C: SPA 라우트 변경 + 트래킹 없음
→ **구현 누락**: History Change 트리거 추가 필요

---

## 4. 구현 검증 포인트

### 필수 확인 사항
1. **모든 페이지에서 발생**
   - 메인, 카테고리, 상품, 검색, 마이페이지 등

2. **SPA 지원**
   - 라우트 변경 시에도 발생
   - 히스토리 변경 감지

3. **중복 방지**
   - 한 페이지 로드에 한 번만 발생

### 흔한 구현 오류
| 문제 | 증상 | 해결 방법 |
|-----|------|----------|
| SPA 미지원 | 라우트 변경 시 미발생 | History Change 트리거 추가 |
| 중복 발생 | 한 페이지에 여러 번 발생 | 트리거 조건 확인 |
| 누락 페이지 | 특정 페이지에서 미발생 | 모든 페이지 트리거 확인 |

---

## 5. 수집 파라미터

> **중요**: 아래 파라미터는 대표 예시입니다.
> 실제 구현은 사이트별 GTM 설정에 따라 다르므로, **시나리오 설계 시 반드시 GTM 파싱을 통해 실제 파라미터를 확인**해야 합니다.
> GTM 파싱 방법: [docs/gtm-parsing-guide.md](../docs/gtm-parsing-guide.md) 참조

### 기본 파라미터

| 파라미터 | 설명 | 예시 | 필수 |
|---------|------|------|-----|
| page_location | 페이지 URL | "https://example.com/product/123" | O |
| page_title | 페이지 제목 | "수분 크림 \| 브랜드명" | O |
| page_referrer | 이전 페이지 URL | "https://example.com/category" | O |

### SPA History Change 파라미터 (SPA 전용)

| 파라미터 | 설명 | 예시 |
|---------|------|------|
| gtm.oldUrl | 이전 페이지 URL | "https://example.com/category" |
| gtm.newUrl | 현재 페이지 URL | "https://example.com/product/123" |
| historyChangeSource | URL 변경 방식 | "pushState", "popstate", "replaceState" |

### 사이트별 추가 파라미터 (Amoremall 기준)

| 파라미터 | 설명 | 예시 |
|---------|------|------|
| page_path | 페이지 경로 | "/product/12345" |
| page_type | 페이지 타입 | "MAIN", "PRODUCT_DETAIL", "CATEGORY" |
| login_status | 로그인 상태 | "logged_in", "logged_out" |
| user_id | 사용자 ID (로그인 시) | "user_12345" |

---

## 6. 관련 이벤트

| 이벤트 | 발생 시점 | 관계 |
|-------|----------|------|
| `page_view` | 모든 페이지 로드 | 기본 이벤트 |
| `screen_view` | 모바일 앱 화면 전환 | 앱용 |
| `view_item` | 상품 상세 페이지 | page_view와 함께 |
| `view_item_list` | 상품 목록 페이지 | page_view와 함께 |

---

## 7. 시나리오 예시

### Should Fire (모든 페이지 로드)
```
- 메인 페이지 진입
- 카테고리 페이지 이동
- 상품 상세 페이지 이동
- 검색 결과 페이지 로드
- 장바구니 페이지 이동
- 결제 페이지 이동
- 브라우저 뒤로가기/앞으로가기
- 페이지 새로고침
```

### Should NOT Fire
```
- 동일 페이지 내 탭 전환 (URL 변경 없음)
- 모달/팝업 열기 (페이지 이동 아님)
- AJAX로 콘텐츠만 변경 (URL 변경 없음)
```

### 구현 필요 (Gap)
```
- SPA 앱에서 라우트 변경 시 page_view 미발생
- 특정 페이지에서만 트래킹 누락
- page_location, page_title 파라미터 누락
```

---

## 8. 시나리오 작성 지침

### 트리거 타입: PAGEVIEW 또는 HISTORY_CHANGE (GTM 내장 트리거)

이 이벤트는 **GTM의 기본 트리거**로 발생합니다.
페이지 로드 시 GTM이 자동으로 page_view 이벤트를 발생시킵니다. SPA의 경우 History Change 트리거 사용.

### 시나리오에 포함할 내용
```
O 포함해야 함:
- 예상 dataLayer 구조 (dataLayer.push 코드)
- event 이름 (page_view)
- page_location, page_title 파라미터

X 포함하지 않음:
- GTM LINK_CLICK/CLICK 트리거 관련 내용
- 클릭 기반 DOM 속성 추출
```

### 예상 dataLayer 구조 (시나리오에 포함)
```javascript
dataLayer.push({
  event: "page_view",
  page_location: "https://example.com/category/skincare",
  page_title: "스킨케어 | 브랜드명"
});
```

### 검증 포인트
```
1. GTM 트리거 확인:
   - All Pages 트리거 또는 History Change 트리거 설정
   - SPA 라우트 변경 시에도 발생하는지 확인

2. 발생 시점 확인:
   - 모든 페이지 로드 시 발생
   - URL 변경 시마다 발생
   - 동일 페이지 내 탭 전환은 미발생 (URL 변경 없음)
```

---

## 9. 상세 시나리오 매트릭스

### 페이지 로딩 시나리오별 검증

| 시나리오 | 진행방법 | 발생해야 하는 상황 | 발생하면 안 되는 상황 | 주요 검수 포인트 |
|---------|---------|------------------|---------------------|----------------|
| **페이지 첫 로딩 시** | URL 입력 | 사용자가 URL을 입력하거나 링크를 클릭하여 새 페이지로 이동했을 때 | 동일 페이지 내에서 AJAX로 콘텐츠만 변경될 때 (URL 변경 없음) | GTM 기본 내장 변수(Page Path, Page URL, Page Title)가 정상적으로 수집되어야 함 |
| **내부 링크 클릭 시** | 링크 클릭 | 사이트 내 다른 페이지로 이동하는 링크를 클릭했을 때 | 외부 링크 클릭이나 파일 다운로드 링크 클릭 시 | SPA의 경우 History Change 트리거 사용 여부 확인 |
| **리다이렉션 후 로딩 시** | 로그인 등 | 서버 사이드 리다이렉션 또는 클라이언트 사이드 리다이렉션 후 최종 페이지가 로드될 때 | 리다이렉션 중간 단계의 빈 페이지나 로딩 화면 | 최종 목적지 페이지에서만 page_view 발생, 중간 페이지는 미발생 |
| **브라우저 뒤로가기/앞으로가기** | 히스토리 네비게이션 | 브라우저의 뒤로가기/앞으로가기 버튼을 클릭하여 이전/다음 페이지로 이동할 때 | 동일 페이지에서 해시(#) 변경만 있는 경우 (구현에 따라 다름) | SPA에서는 History Change 트리거가 정상 작동하는지 확인 |
| **SPA에서의 페이지 전환** | 라우트 변경 | SPA(Single Page Application)에서 클라이언트 사이드 라우팅으로 페이지가 전환될 때 | 모달/팝업 열기, 탭 전환 등 실제 페이지 전환이 아닌 경우 | History Change 트리거 설정 필수, 중복 발생 방지 확인 |
| **팝업/모달에서의 링크 클릭** | 팝업 내 링크 | 팝업/모달 내 링크를 클릭하여 새 페이지로 이동할 때 (팝업이 닫히고 페이지 전환) | 팝업/모달이 열릴 때 (URL 변경 없음), 팝업 내 탭 전환 | 팝업 닫힘 후 실제 페이지 이동 시에만 발생 |
| **iframe으로 인한 중복 page_view** | iframe 포함 페이지 | 메인 페이지에서 page_view 1회만 발생 | iframe 내부에서 별도의 page_view가 발생하여 중복처럼 보이는 경우 | **page_url 비교 필수**: 2개 이상 발생 시 page_url이 다른지 확인하여 iframe 여부 판별 |

### 시나리오별 상세 검증 항목

#### 1) 페이지 첫 로딩 시 (URL 직접 입력)
```
진행 방법:
1. 브라우저 주소창에 URL 직접 입력
2. 북마크에서 페이지 접근
3. 외부 사이트에서 링크로 유입

검증 항목:
□ page_view 이벤트 1회 발생
□ page_location이 현재 URL과 일치
□ page_title이 <title> 태그와 일치
□ page_referrer가 이전 페이지 URL (또는 빈 값)
□ 추가 이커머스 이벤트 동시 발생 확인 (view_item, view_item_list 등)
```

#### 2) 내부 링크 클릭 시
```
진행 방법:
1. 네비게이션 메뉴 클릭
2. 상품 카드 클릭
3. 푸터 링크 클릭
4. 배너/프로모션 클릭

검증 항목:
□ 이전 페이지에서 page_view 미발생 (이미 발생한 상태)
□ 새 페이지 로드 시 page_view 1회 발생
□ page_referrer가 이전 페이지 URL
□ SPA: History Change 이벤트 정상 감지
```

#### 3) 리다이렉션 후 로딩 시
```
진행 방법:
1. 로그인 후 리다이렉션
2. 회원가입 완료 후 리다이렉션
3. 결제 완료 후 리다이렉션
4. 외부 인증 (OAuth) 후 복귀

검증 항목:
□ 중간 리다이렉션 페이지에서 page_view 미발생 또는 최소 발생
□ 최종 목적지 페이지에서 page_view 1회 발생
□ 리다이렉션 체인에서 중복 발생 방지 확인
□ page_referrer 정확성 (리다이렉션 전 페이지)
```

#### 4) 브라우저 뒤로가기/앞으로가기
```
진행 방법:
1. 브라우저 뒤로가기 버튼 클릭
2. 브라우저 앞으로가기 버튼 클릭
3. 키보드 단축키 (Alt+←, Alt+→)
4. 마우스 제스처

검증 항목:
□ 뒤로가기 시 page_view 발생
□ 앞으로가기 시 page_view 발생
□ SPA: History Change 트리거 정상 작동
□ BF Cache(Back-Forward Cache) 환경에서 발생 여부 확인
```

#### 5) SPA에서의 페이지 전환
```
진행 방법:
1. React Router, Vue Router 등 클라이언트 라우팅
2. Next.js, Nuxt.js 페이지 전환
3. Hash 기반 라우팅 (#/page)
4. History API 기반 라우팅

검증 항목:
□ 라우트 변경 시 page_view 발생
□ History Change 트리거 설정 확인
□ 중복 발생 방지 (페이지당 1회)
□ URL 변경 없는 동작에서는 미발생
```

#### 6) 팝업/모달에서의 링크 클릭
```
진행 방법:
1. 로그인 모달 내 회원가입 링크
2. 프로모션 팝업 내 상세보기 링크
3. 장바구니 미니 모달 내 장바구니 페이지 링크
4. 검색 모달 내 검색 결과 페이지 이동

검증 항목:
□ 팝업/모달 열기 시 page_view 미발생
□ 팝업 내 링크 클릭으로 실제 페이지 이동 시 page_view 발생
□ 팝업 닫기만 하는 경우 미발생
□ 새 탭으로 열리는 경우 해당 탭에서 page_view 발생
```

#### 7) iframe으로 인한 중복 page_view (주의 케이스)
```
진행 방법:
1. iframe이 포함된 페이지 접근 (광고 배너, 결제 모듈, 외부 위젯 등)
2. dataLayer에서 page_view 이벤트 발생 횟수 확인
3. 2개 이상 발생 시 각 이벤트의 page_url 비교

검증 항목:
□ page_view가 2개 이상 발생하면 즉시 "중복 오류"로 판단하지 않음
□ 각 page_view의 page_url 값을 비교하여 동일한지 확인
□ page_url이 서로 다르면 → iframe으로 인한 별도 이벤트 (오류 아님, 확인 필요)
□ page_url이 동일하면 → 진짜 중복 발생 (오류)

iframe 판별 방법:
□ 메인 페이지 URL과 다른 page_url이 있는지 확인
□ iframe 내부 URL 패턴 확인 (광고 도메인, 결제사 도메인 등)
□ iframe에서 GTM이 로드되어 별도 page_view가 발생하는지 확인

일반적인 iframe 발생 케이스:
- 광고 배너 (Google Ads, 네이버 광고 등)
- 결제 모듈 (PG사 iframe)
- 소셜 플러그인 (페이스북 좋아요, 카카오 공유 등)
- 외부 채팅 위젯
- 유튜브/비메오 임베드 영상
- 지도 임베드 (Google Maps, 네이버 지도)

검증 결과 분류:
□ 메인 페이지 page_view 1개 + iframe page_view N개 → 정상 (iframe 확인됨)
□ 메인 페이지 page_view 2개 이상 (동일 URL) → 중복 발생 오류
□ iframe page_view가 메인 도메인과 동일 → GTM 설정 검토 필요
```

---

## 10. 환경별 검증

> **공통 가이드 참조**: [docs/environment-validation-guide.md](../docs/environment-validation-guide.md)
>
> PC/Mobile, 로그인/비로그인 환경별 검증은 공통 가이드를 참조하세요.

### page_view 특화 환경 검증

| 환경 | 특이사항 |
|-----|---------|
| SPA + Mobile | History Change 트리거가 모바일 스와이프 네비게이션에서도 작동하는지 확인 |
| 딥링크 유입 | 앱에서 웹으로 딥링크 유입 시 page_view 발생 및 page_referrer 확인 |
| 로그인 리다이렉션 | 로그인 후 원래 페이지로 리다이렉션 시 page_view에 user_id 포함 확인 |

---

## 11. 타이밍 및 중복 발생 검증

### 중복 발생 위험 시나리오

| 상황 | 위험 | 검증 방법 |
|-----|------|----------|
| 새로고침 | 중복 발생 (정상) | 새로고침 시 1회만 발생 |
| 뒤로가기/앞으로가기 | 중복 발생 (정상) | 히스토리 네비게이션 시 1회만 발생 |
| SPA 초기 로드 | All Pages + History Change 중복 | 트리거 설정 확인 |
| 리다이렉션 체인 | 중간 페이지 중복 | 최종 페이지만 발생 확인 |
| BF Cache | 캐시 복원 시 미발생 | pageshow 이벤트 확인 |
| **iframe 포함 페이지** | 중복처럼 보이지만 다른 URL | **page_url 비교 필수** - URL이 다르면 iframe으로 인한 정상 발생 |

### SPA 중복 발생 방지
```javascript
// 잘못된 설정 - 중복 발생
// All Pages 트리거: 활성화
// History Change 트리거: 활성화
// 결과: 초기 로드 시 2회 발생

// 올바른 설정 - 방법 1
// All Pages 트리거: 활성화
// History Change 트리거: 초기 로드 제외 조건 추가
// 조건: {{History Source}} != 'page_load'

// 올바른 설정 - 방법 2
// All Pages 트리거: 비활성화
// History Change 트리거만 사용
// 모든 페이지 전환을 History Change로 처리
```

### 타이밍 검증 체크리스트
```
□ 초기 페이지 로드 시 page_view 1회만 발생
□ SPA 라우트 변경 시 1회만 발생 (중복 방지)
□ 새로고침 시 1회만 발생
□ 뒤로가기/앞으로가기 시 각각 1회만 발생
□ 리다이렉션 시 최종 페이지에서만 발생
□ 동일 URL 내 해시 변경은 설정에 따라 처리
```
