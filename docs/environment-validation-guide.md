# 환경별 검증 가이드

모든 GA4 이벤트에 공통으로 적용되는 환경별 검증 기준입니다.
각 이벤트 가이드에서 이 문서를 참조합니다.

---

## 0. 전역변수 사전 검증 (이벤트 발생 전 필수 확인)

**모든 이벤트가 발생하기 전에 dataLayer에 공통 전역변수가 정상적으로 선언되어 있는지 먼저 확인해야 합니다.**

> **중요**: 전역변수 목록은 사이트별 GTM 설정에 따라 다릅니다.
> 각 사이트의 `sites/{site}/site-config.json` → `globalVariables` 섹션을 참조하세요.

### 전역변수 체크 시점

```
1. 페이지 최초 로드 시 (DOM Ready 전)
2. SPA 페이지 전환 시
3. 로그인/로그아웃 상태 변경 시
4. 사용자 속성 변경 시 (회원등급 변경 등)
```

---

### Step 1: GTM에서 공통 전역변수 식별하기

사이트별 GTM을 분석하여 어떤 변수가 공통으로 수집되는지 파악합니다.

#### 1-1) GTM에서 Data Layer Variables 추출

GTM 컨테이너에서 Variables 섹션을 확인하여 dataLayer에서 읽어오는 변수 목록을 추출합니다.

```
GTM 확인 경로:
1. GTM 컨테이너 접속
2. Variables → User-Defined Variables
3. Variable Type이 "Data Layer Variable"인 항목 모두 확인
4. 각 변수의 Data Layer Variable Name 기록
```

#### 1-2) GA4 태그에서 공통 파라미터 확인

GA4 Configuration 태그와 Event 태그에서 공통으로 설정된 파라미터를 확인합니다.

```
GTM 확인 경로:
1. Tags → GA4 Configuration 태그 선택
2. Fields to Set, User Properties 확인
3. 모든 GA4 Event 태그에서 공통으로 사용되는 파라미터 확인
```

#### 1-3) 공통 변수 판별 기준

```
공통 전역변수로 분류되는 조건:
□ GA4 Configuration 태그에서 설정됨 (모든 이벤트에 적용)
□ 여러 GA4 Event 태그에서 반복적으로 사용됨
□ User Properties로 설정됨
□ 페이지 로드 시 초기화되어야 하는 값
```

---

### Step 2: site-config.json에 전역변수 설정

GTM 분석 결과를 각 사이트의 site-config.json에 기록합니다.

#### site-config.json 구조

```json
{
  "globalVariables": {
    "_note": "GTM에서 추출한 공통 전역변수",
    "_extractedFrom": "GTM 변수(Variables) 및 GA4 태그 설정에서 추출",

    "required": [
      "변수명1",
      "변수명2"
    ],
    "optional": [
      "변수명3",
      "변수명4"
    ],
    "userScoped": [
      "user_id",
      "membership_level"
    ],
    "pageScoped": [
      "page_type",
      "page_category"
    ],
    "_rawVariablesFromGTM": [
      "DLV - user_id",
      "DLV - page_type"
    ]
  }
}
```

#### 변수 분류 기준

| 분류 | 설명 | 예시 |
|-----|------|------|
| `required` | 모든 이벤트에 필수로 포함되어야 하는 변수 | - |
| `optional` | 있으면 좋지만 없어도 이벤트 발생에 문제없는 변수 | - |
| `userScoped` | 사용자 단위로 수집되는 변수 (로그인 상태에 따라 변경) | - |
| `pageScoped` | 페이지 단위로 수집되는 변수 (페이지 전환 시 변경) | - |

---

### Step 3: 사이트별 전역변수 검증

#### 3-1) 동적 검증 스크립트 (site-config 기반)

```javascript
// 사이트별 전역변수 검증 (site-config.json 로드 후 사용)
function checkGlobalVariables(siteConfig) {
  const globalVars = siteConfig.globalVariables;

  console.log('=== 전역변수 검증: ' + siteConfig.siteInfo.name + ' ===');

  // 필수 변수 체크
  console.log('\n[필수 변수]');
  globalVars.required.forEach(v => {
    const found = dataLayer.find(d => d[v] !== undefined);
    const status = found ? '✅ ' + found[v] : '❌ NOT SET';
    console.log(v + ': ' + status);
  });

  // 선택 변수 체크
  console.log('\n[선택 변수]');
  globalVars.optional.forEach(v => {
    const found = dataLayer.find(d => d[v] !== undefined);
    const status = found ? '✅ ' + found[v] : '⚠️ NOT SET';
    console.log(v + ': ' + status);
  });
}
```

#### 3-2) dataLayer에서 공통 변수 자동 탐지

GTM 분석 전에 현재 dataLayer에서 어떤 변수들이 공통으로 사용되는지 탐지합니다.

```javascript
// dataLayer에서 이벤트 간 공통 변수 탐지
(function detectCommonVariables() {
  // 이벤트가 있는 push만 필터링
  const eventPushes = dataLayer.filter(d => d.event);

  if (eventPushes.length < 2) {
    console.log('이벤트가 2개 이상 발생해야 공통 변수를 탐지할 수 있습니다.');
    return;
  }

  // 모든 이벤트에서 사용된 키 수집
  const keyCount = {};
  eventPushes.forEach(push => {
    Object.keys(push).forEach(key => {
      if (key !== 'event' && key !== 'gtm.uniqueEventId') {
        keyCount[key] = (keyCount[key] || 0) + 1;
      }
    });
  });

  // 50% 이상 이벤트에서 사용된 변수 = 공통 변수 후보
  const threshold = eventPushes.length * 0.5;
  const commonVars = Object.keys(keyCount).filter(k => keyCount[k] >= threshold);

  console.log('=== 공통 전역변수 후보 ===');
  console.log('총 이벤트 수:', eventPushes.length);
  console.log('공통 변수 후보:', commonVars);

  commonVars.forEach(v => {
    const lastValue = dataLayer.filter(d => d[v] !== undefined).pop();
    console.log(v + ':', lastValue ? lastValue[v] : 'N/A', '(사용 빈도: ' + keyCount[v] + '/' + eventPushes.length + ')');
  });
})();
```

#### 3-3) 이벤트별 전역변수 포함 여부 모니터링

```javascript
// 실시간 이벤트 전역변수 모니터링
(function monitorGlobalVarsInEvents(expectedVars) {
  // expectedVars가 없으면 빈 배열로 초기화
  expectedVars = expectedVars || [];

  dataLayer.push = (function(original) {
    return function(obj) {
      if (obj.event && obj.event.indexOf('gtm.') !== 0) {
        console.log('\n=== Event: ' + obj.event + ' ===');

        if (expectedVars.length > 0) {
          console.log('[전역변수 포함 여부]');
          expectedVars.forEach(v => {
            const included = obj[v] !== undefined;
            console.log(v + ': ' + (included ? '✅ ' + obj[v] : '❌ 미포함'));
          });
        }

        console.log('[전체 데이터]', obj);
      }
      return original.apply(this, arguments);
    };
  })(dataLayer.push);

  console.log('전역변수 모니터링 시작. 예상 변수:', expectedVars);
})(['user_id', 'page_type']);  // site-config에서 가져온 변수 목록으로 교체
```

---

### Step 4: 전역변수 검증 체크리스트

```
## 사전 준비 (QA 시작 전)
□ 해당 사이트의 site-config.json에서 globalVariables 확인
□ GTM에서 정의된 Data Layer Variables 목록 확보
□ GA4 태그에서 공통으로 사용되는 파라미터 확인

## 페이지 로드 시
□ 페이지 로드 완료 후 dataLayer에 전역변수 존재 확인
□ site-config의 required 변수가 모두 선언됨
□ 각 변수의 값이 현재 페이지/상태와 일치함

## 페이지 전환 시 (SPA)
□ pageScoped 변수가 새 페이지에 맞게 갱신됨
□ 이전 페이지의 값이 잘못 유지되지 않음

## 로그인/로그아웃 시
□ userScoped 변수가 로그인 상태에 맞게 갱신됨
□ 로그아웃 시 사용자 정보 변수 초기화됨

## 이벤트 발생 시
□ 각 이벤트에 전역변수가 정상적으로 포함됨
□ GTM 태그 설정과 실제 발생 데이터 일치
```

---

### 흔한 전역변수 오류

| 문제 | 증상 | 해결 방법 |
|-----|------|----------|
| 전역변수 미선언 | 이벤트에 공통 변수 누락 | 페이지 로드 시 dataLayer.push 추가 |
| 전역변수 지연 선언 | 첫 이벤트에만 전역변수 누락 | GTM 로드 전에 dataLayer 초기화 |
| SPA 미갱신 | 페이지 전환 후 이전 값 유지 | 라우트 변경 시 pageScoped 변수 갱신 |
| 로그인 상태 불일치 | 로그인했는데 user 변수 없음 | 로그인 완료 후 userScoped 변수 갱신 |
| 값 형식 불일치 | 동일 변수가 숫자/문자열 혼용 | 일관된 형식으로 통일 |
| GTM 변수명 불일치 | dataLayer 키와 GTM 변수명 다름 | GTM Data Layer Variable 설정 확인 |

---

### GTM 전역변수 추출 가이드

GTM JSON 파일에서 전역변수를 추출하는 방법:

```
1. GTM 컨테이너 JSON 내보내기
   - GTM Admin → Export Container

2. Variables 섹션에서 Data Layer Variable 찾기
   - type: "v" (Data Layer Variable)
   - parameter에서 name 확인

3. GA4 Configuration 태그에서 공통 설정 확인
   - fieldsToSet
   - userProperties

4. site-config.json의 globalVariables에 기록
```

---

## 1. PC / Mobile 환경 검증

### 기본 검증 매트릭스

| 검증 항목 | PC | Mobile | 검증 방법 |
|----------|-----|--------|----------|
| **이벤트 발생 여부** | O | O | 양쪽 환경에서 동일하게 발생 |
| **파라미터 수집** | 동일 | 동일 | 필수 파라미터가 누락 없이 수집 |
| **데이터 정확성** | 동일 | 동일 | item_id, price 등 값 일치 |
| **UI 인터랙션** | 클릭 | 탭/스와이프 | 각 환경의 인터랙션 방식에서 정상 발생 |

### PC 환경 특이 케이스

```
□ 마우스 호버 → 클릭: 호버만으로 이벤트 미발생, 클릭 시 발생
□ 우클릭 → 새 탭에서 열기: 새 탭에서 이벤트 발생
□ Ctrl+클릭 (새 탭): 새 탭에서 이벤트 발생
□ 드래그 앤 드롭: 의도치 않은 이벤트 미발생
□ 키보드 네비게이션 (Tab+Enter): 클릭과 동일하게 발생
```

### Mobile 환경 특이 케이스

```
□ 탭: 클릭과 동일하게 발생
□ 더블 탭: 중복 발생 방지 확인
□ 롱 프레스: 컨텍스트 메뉴만 열리고 이벤트 미발생
□ 스와이프: 슬라이드 UI에서 적절한 이벤트 발생
□ 앱 내 웹뷰: 일반 브라우저와 동일하게 발생
□ Pull-to-refresh: 페이지 새로고침 시 page_view 재발생
□ 화면 회전: 이벤트 미발생 (회전만으로는 트리거 안 됨)
```

### 반응형 웹 검증

```
□ 뷰포트 크기 변경만으로 이벤트 미발생
□ PC/Mobile 전용 UI 요소 각각 테스트
□ 터치/마우스 이벤트 모두 지원 확인
□ 모바일 전용 URL (m.도메인) 있는 경우 별도 테스트
```

---

## 2. 로그인 / 비로그인 상태 검증

### 기본 검증 매트릭스

| 검증 항목 | 비로그인 | 로그인 | 검증 방법 |
|----------|---------|-------|----------|
| **이벤트 발생 여부** | O | O | 양쪽 상태에서 동일하게 발생 |
| **user_id 수집** | 없음/null | 사용자 ID | 로그인 시 user_id 포함 확인 |
| **user_properties** | 기본값 | 회원 속성 | 회원 등급, 가입일 등 |
| **이커머스 파라미터** | 동일 | 동일 | item_id, price 등 동일 |

### 로그인 상태 전환 시나리오

#### 비로그인 → 로그인 전환
```
1. 비로그인 상태에서 이벤트 발생
   → user_id 없음

2. 로그인 진행

3. 로그인 후 동일 행동
   → user_id 포함

검증 항목:
□ 로그인 직후 이벤트에 user_id 포함
□ 세션 유지 중 모든 이벤트에 user_id 포함
□ user_properties (회원등급 등) 정상 수집
```

#### 로그인 → 로그아웃 전환
```
1. 로그인 상태에서 이벤트 발생
   → user_id 포함

2. 로그아웃 진행

3. 로그아웃 후 동일 행동
   → user_id 없음

검증 항목:
□ 로그아웃 직후 이벤트에서 user_id 제거
□ 이전 세션의 user_id가 남아있지 않음
```

#### 세션 만료
```
1. 로그인 상태에서 장시간 미사용
2. 세션 만료
3. 페이지 이동 또는 행동 시도

검증 항목:
□ 세션 만료 후 이벤트에서 user_id 제거
□ 재로그인 후 user_id 다시 수집
```

### 회원 전용 기능 검증

```
□ 위시리스트 담기: 비로그인 시 로그인 유도 → 로그인 후 이벤트 발생
□ 장바구니: 비로그인도 가능한 경우 user_id 없이 이벤트 발생
□ 결제: 로그인 필수인 경우 로그인 후 이벤트 발생
□ 마이페이지: 로그인 필수, 비로그인 시 접근 불가
```

---

## 3. 브라우저별 검증

### 테스트 대상 브라우저

#### PC
| 브라우저 | 우선순위 | 비고 |
|---------|---------|------|
| Chrome | 필수 | 가장 높은 점유율 |
| Safari | 필수 | Mac 사용자 |
| Firefox | 권장 | |
| Edge | 권장 | Windows 기본 |

#### Mobile
| 브라우저 | 우선순위 | 비고 |
|---------|---------|------|
| Chrome (Android) | 필수 | Android 기본 |
| Safari (iOS) | 필수 | iOS 기본 |
| Samsung Internet | 권장 | 삼성 기기 |
| 인앱 브라우저 | 권장 | 카카오톡, 네이버 앱 등 |

### 브라우저별 특이사항

```
□ Safari ITP (Intelligent Tracking Prevention): 쿠키 제한 확인
□ Firefox ETP (Enhanced Tracking Protection): 트래커 차단 확인
□ Chrome 시크릿 모드: 이벤트 정상 발생 확인
□ 광고 차단기 활성화: GTM 차단 여부 확인
```

---

## 4. 네트워크 환경 검증

### 네트워크 상태별 검증

| 상태 | 검증 항목 | 예상 동작 |
|-----|----------|----------|
| **정상 연결** | 이벤트 즉시 전송 | GA4로 데이터 전송 |
| **느린 연결 (3G)** | 이벤트 지연 전송 | 큐에 저장 후 전송 |
| **오프라인** | 이벤트 저장 | 재연결 시 전송 (구현에 따라) |
| **연결 불안정** | 재시도 | 중복 발생 방지 확인 |

---

## 5. 환경별 검증 체크리스트

### 필수 검증 (모든 이벤트)

```
## PC 환경
□ Chrome에서 이벤트 발생 확인
□ Safari에서 이벤트 발생 확인
□ 마우스 클릭으로 정상 트리거
□ 키보드 네비게이션으로 정상 트리거

## Mobile 환경
□ iOS Safari에서 이벤트 발생 확인
□ Android Chrome에서 이벤트 발생 확인
□ 탭으로 정상 트리거
□ 앱 내 웹뷰에서 정상 발생

## 로그인 상태
□ 비로그인 상태에서 이벤트 발생
□ 로그인 상태에서 user_id 포함
□ 로그아웃 후 user_id 제거
□ 이커머스 파라미터는 로그인 여부와 무관하게 동일
```

### 권장 검증 (주요 이벤트)

```
## 크로스 환경
□ PC에서 로그인 → Mobile에서 세션 유지 확인
□ Mobile에서 장바구니 담기 → PC에서 view_cart 확인

## 엣지 케이스
□ 시크릿/프라이빗 모드에서 이벤트 발생
□ 광고 차단기 환경에서 이벤트 발생 여부
□ 느린 네트워크에서 이벤트 전송 지연 허용
```

---

## 6. 이벤트별 환경 특이사항

일부 이벤트는 환경에 따라 추가 고려사항이 있습니다.

| 이벤트 | PC 특이사항 | Mobile 특이사항 | 로그인 특이사항 |
|-------|------------|----------------|----------------|
| `page_view` | History Change (SPA) | 딥링크 유입 | user_id 포함 |
| `view_item` | - | 앱에서 웹뷰 열기 | 최근 본 상품 연동 |
| `add_to_cart` | 호버 후 퀵카트 | 스와이프 담기 | 비로그인 장바구니 |
| `begin_checkout` | - | 간편결제 앱 호출 | 로그인 필수 확인 |
| `purchase` | - | 앱 결제 후 복귀 | user_id 필수 |
| `select_item` | 호버 vs 클릭 구분 | 탭 vs 스와이프 | - |
| `select_promotion` | 배너 호버 | 배너 스와이프 | - |

---

## 7. 문제 발생 시 디버깅

### 환경별 미발생 시 체크

```
1. 특정 브라우저에서만 미발생
   → 브라우저 호환성 이슈, polyfill 확인

2. Mobile에서만 미발생
   → 터치 이벤트 핸들러 확인, viewport 이슈

3. 로그인 시에만 미발생
   → 로그인 리다이렉션 중 이벤트 손실, 타이밍 이슈

4. 앱 내 웹뷰에서만 미발생
   → 웹뷰 JavaScript 제한, GTM 로드 실패
```

### 데이터 불일치 시 체크

```
1. user_id 누락
   → 로그인 상태 체크 로직 확인, 데이터 레이어 타이밍

2. 파라미터 값 다름
   → PC/Mobile 별도 구현 여부, API 응답 차이

3. 중복 발생
   → 터치/클릭 이벤트 중복 바인딩, SPA 라우터 이슈
```
