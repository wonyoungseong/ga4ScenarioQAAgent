/**
 * ap_click 이벤트 지식
 *
 * 페이지 내 클릭 가능한 대부분의 영역에서 발생.
 * dataLayer event: commonEvent → GA4 event: ap_click
 *
 * 핵심 규칙:
 * - AP 속성 기반: ap-click-area (카테고리), ap-click-name (액션), ap-click-data (라벨)
 * - GTM 트리거: CSS Selector [ap-click-area], [ap-click-area] *
 * - JS 변수가 el.getAttribute() → el.querySelector() → el.closest()로 버블업
 * - 버블링 중복 발생 주의: 부모-자식 모두 ap-click-area가 있으면 1클릭에 2회 이상 발생 가능
 * - customEvent 트리거 대체: 일부 영역은 click 리스너가 정상 동작하지 않아
 *   commonEvent 대신 customEvent 트리거로 ap_click을 수집하는 케이스 존재
 * - 50개 이상의 카테고리 (영역)가 존재하며, 모든 페이지 타입에 분포
 * - 팝업/모달이 활성화되면 해당 요소를 제거/닫고 확인하는 것이 좋음
 *
 * @source GA4 ap_click 이벤트 610건 실 데이터 분석 (2026-02-19)
 * @source GTM Container GTM-WDWNGWDB (innisfree-jp-gtm) Tag ID 854
 * @source QA 도메인 지식 (2026-02-20)
 */

import type { EventScenarioKnowledge } from '../../types/event-scenario-knowledge';

/**
 * ap_click 카테고리별 화면 위치 매핑
 *
 * ap-click-area 값 → 화면에서 확인해야 할 위치
 * 610건 실 데이터에서 추출한 50개 카테고리 분류
 */
export const AP_CLICK_AREA_MAP: Record<string, {
  page_context: string;
  ui_location: string;
  description: string;
  sample_actions: string[];
}> = {
  // ═══ 공통 영역 (모든 페이지) ═══
  '공통': {
    page_context: 'ALL',
    ui_location: 'Header / Action Bar / Footer',
    description: '모든 페이지에 존재하는 공통 UI 요소',
    sample_actions: [
      'Header: Back 버튼, 검색 버튼, 장바구니 버튼, 홈 버튼, 로고 버튼',
      'Action bar: 홈, 카테고리, 쇼핑히스토리, 마이, 브랜드, Top 버튼',
      'Footer: 로그아웃, 임직원서비스, 공지사항, 고객센터',
      '리스트 내 좋아요 아이콘',
    ],
  },
  'GNB': {
    page_context: 'ALL',
    ui_location: '글로벌 네비게이션 바 (상단 탭)',
    description: '상단 메뉴 탭: 홈, 퍼시픽샵, 베스트, 이벤트, 라이브, 선물하기 + 상시이슈탭',
    sample_actions: [
      'GNB_홈, GNB_퍼시픽샵, GNB_베스트, GNB_이벤트, GNB_라이브',
      'GNB_상시이슈탭1 (설선물특집, 연휴쇼핑, 멤버십위크)',
      'GNB_상시이슈탭2 (새해굿즈, 오픈런, 샤워타임)',
      'TopBanner',
    ],
  },
  'MARKETING': {
    page_context: 'ALL',
    ui_location: '마케팅 동의 팝업',
    description: '마케팅 수신 동의 팝업 (CONSENT TRUE/FALSE)',
    sample_actions: ['CONSENT TRUE', 'CONSENT FALSE', 'MARKETING_CONSENT TRUE/FALSE'],
  },

  // ═══ MAIN 페이지 ═══
  'MAIN': {
    page_context: 'MAIN',
    ui_location: '메인 페이지 전체',
    description: '메인 배너, 퀵메뉴, 팝업, 랭킹, 카테고리 영역',
    sample_actions: [
      'MAIN_메인배너 (배너 슬라이드 클릭)',
      'MAIN_QuickMenu (상단 퀵메뉴 아이콘)',
      'MAIN_[팝업]Popup 닫기 / 오늘그만보기',
      'MAIN_실시간랭킹_상품_더보기',
      'MAIN_카테고리랭킹_[버튼]순위상품더보기',
      'MAIN_메인배너 더보기',
    ],
  },

  // ═══ 상품상세 (PDP) - 최다 164건 ═══
  '상품상세': {
    page_context: 'PRODUCT_DETAIL',
    ui_location: '상품 상세 페이지 전체',
    description: '상품 이미지, 구매 액션바, 리뷰, 혜택, 옵션 선택 등',
    sample_actions: [
      '상품썸네일 스와이프 (이미지 캐러셀)',
      '하단액션바: 구매하기, 장바구니, 선물하기, N Pay, 좋아요, 재입고알림',
      '하단액션바_[팝업]옵션 선택 → 선택 후 장바구니/구매하기',
      '최대혜택: 쿠폰받기 (단일/전체 다운로드), 상세조회',
      '전체리뷰: 정렬(최신순, 별점낮은순), 필터(포토리뷰), 옵션별보기',
      '리뷰탭 / 상품상세탭 (탭 전환)',
      '상품상세 이미지 더보기/접기/확대보기',
      '컬러칩 옵션, 사은품 더보기, 관련이벤트',
      '[팝업]로그인: 노출, 카카오로그인, 로그인, 닫기, 회원가입',
      '배송비절약추천레이어_닫기',
      'PLCC카드혜택 배너, 멤버십가입유도배너',
      '공유하기, 결제혜택 자세히, 브랜드관 바로가기',
    ],
  },

  // ═══ 검색 (SEARCH) ═══
  '검색': {
    page_context: 'SEARCH',
    ui_location: '검색 모달 및 검색 결과 페이지',
    description: '검색 입력, 카테고리 필터, 결과 정렬, 자동완성',
    sample_actions: [
      '검색_입력창_Header: 키워드입력시작, Back키',
      '검색_카테고리_1depth: 스킨케어, 메이크업, 향수, 남성, 생활용품 등',
      '검색_카테고리_2depth: 클렌징, 모이스처라이징, 페이스, 립, 헤어 등',
      '검색_결과_정렬상세: 낮은가격순, 랭킹순, 판매순',
      '검색_결과_정렬/필터 전체',
      '검색_입력창_인기검색어: 헤라, 설화수, 에스트라',
      '검색_입력창_최근검색어: 클릭_한율, 클릭_설화수',
      '검색_검색창_자동완성: 브랜드관',
      '검색_결과_브랜드관, 검색_결과_카테고리',
    ],
  },

  // ═══ 장바구니 (CART) ═══
  '장바구니': {
    page_context: 'CART',
    ui_location: '장바구니 페이지',
    description: '주문, 쿠폰, 상품관리, 멤버십, 프로모션',
    sample_actions: [
      '장바구니_주문하기 (결제 진행)',
      '장바구니_바로구매',
      '장바구니_결제수단 할인 배너 / 결제수단할인배너_선택',
      '장바구니_쿠폰다운로드배너 / 전체받기',
      '장바구니_상품삭제 / 복수선택삭제 / 좋아요전환',
      '장바구니_옵션/수량변경',
      '장바구니_전체선택',
      '장바구니_선택프로모션 / 제외하고주문하기',
      '장바구니_멤버십배너',
      '장바구니_선물하기',
      '장바구니_사은품 자세히 보기',
    ],
  },
  '빈장바구니': {
    page_context: 'CART',
    ui_location: '빈 장바구니 페이지',
    description: '장바구니가 비어있을 때 표시되는 추천상품, 배너',
    sample_actions: [
      '빈장바구니_결제수단할인배너',
      '빈장바구니_추천상품 (Y/N, Y/Y, N/Y)',
    ],
  },

  // ═══ 주문서 (CHECKOUT) ═══
  'N주문서': {
    page_context: 'CHECKOUT',
    ui_location: '주문서 (결제) 페이지',
    description: '결제수단, 쿠폰, 포인트, 배송지, 사은품, 특가 등',
    sample_actions: [
      'N주문서_결제하기 (최종 결제 버튼)',
      'N주문서_일반결제: 신용카드, 네이버페이, 토스페이, 카카오페이, 무통장입금, 휴대폰결제, 스마일페이, 페이코',
      'N주문서_신용카드_카드사: 삼성, 국민, 현대, 신한, 우리, BC, 롯데',
      'N주문서_상품_쿠폰변경 / 쿠폰조회_장바구니 / 최대혜택_적용/해제',
      'N주문서_자산/포인트: 뷰티포인트_모두사용, 기프트카드_모두사용/조회/등록',
      'N주문서_배송지정보_등록/변경 / 신규등록',
      'N주문서_선택사은품_선택하기 / 선택팝업_선택완료',
      'N주문서_멤플사은품_선택하기',
      'N주문서_특가구매_선택하기 / 제외하고구매',
      'N주문서_선물하기_장바구니쿠폰조회/적용/결제하기/문자로선물하기',
      'N주문서_아모레페이이용유도팝업 / 이용유도_닫기/가입',
    ],
  },

  // ═══ 마이페이지 영역 ═══
  '마이파우치': {
    page_context: 'MY_PAGE',
    ui_location: '마이페이지 (마이파우치)',
    description: '주문조회, 알림, 멤버십, 쿠폰, 포인트, 퀵메뉴 등',
    sample_actions: [
      '[알림]추천제안_노출: 용기수거, AIBC챗봇, 프로필설정, 승급유도, 페이백유도, 소멸포인트, 앱설치유도, 첫구매혜택, 마케팅수신',
      '[알림]최근주문_노출: 구매확정, 배송완료, 주문완료, 배송중, 상품준비중, 주문대기',
      '주문배송조회: 전체보기, 배송완료, 구매확정, 주문완료, 배송중, 상품준비중',
      '[퀵메뉴]: 쿠폰존, 영수증복권, 구매리뷰, VIP라운지',
      '[배너]멤버십가입유도_노출',
      '쇼핑멤버십 (E/A/R/M 등급)',
      '뷰티포인트, 기프트카드, 쿠폰, 멤버십플러스',
      '회원정보확인/관리, 1:1문의, 취소반품조회',
      '[탭]내쇼핑 / [탭]프로필',
    ],
  },

  // ═══ 상품리스트 (PLP) 영역 ═══
  '카테고리': {
    page_context: 'PRODUCT_LIST',
    ui_location: '카테고리 목록 페이지',
    description: '정렬, 필터, 1depth 카테고리',
    sample_actions: [
      '카테고리_정렬: 낮은가격순, Ranking, 랭킹순',
      '카테고리_필터: 브랜드, 퍼시픽샵',
      '카테고리_1depth: 생활용품',
    ],
  },
  'NEW브랜드관': {
    page_context: 'PRODUCT_LIST',
    ui_location: '브랜드관 페이지',
    description: '브랜드별 상품 목록, GNB, 배너',
    sample_actions: [
      'NEW브랜드관_GNB: 설화수/헤라/한율 + 전체상품/FACE',
      'NEW브랜드관_전체상품컴포넌트_[버튼]더보기 / 낮은가격순',
      'NEW브랜드관_카테고리리스트: 카테고리선택, 낮은가격순',
      'NEW브랜드관_Header: 브랜드검색, 장바구니',
      'NEW브랜드관_베스트상품, 자유상품컴포넌트, 메인배너',
    ],
  },
  '퍼시픽샵': {
    page_context: 'PRODUCT_LIST',
    ui_location: '퍼시픽샵 페이지',
    description: '퍼시픽샵(오프라인 채널) 상품, 카테고리, 필터',
    sample_actions: [
      '퍼시픽샵_카테고리탭: 스킨케어, 생활용품, 메이크업, 뷰티푸드, 향수, 남성, 헤어, 소품&도구, 모이스처라이징',
      '퍼시픽샵_상품, 필터(브랜드), 공지사항, 상단배너',
    ],
  },
  'BEST': {
    page_context: 'PRODUCT_LIST',
    ui_location: '베스트 상품 페이지',
    description: '베스트 탭 및 필터',
    sample_actions: [
      'BEST_탭: 많이 클릭한, 많이 구매한',
      'BEST_많이구매한_필터: 카테고리, 연령대',
    ],
  },
  '액션바_브랜드': {
    page_context: 'PRODUCT_LIST',
    ui_location: '상품 리스트 내 브랜드 바로가기 바',
    description: '브랜드관 바로가기 + 전체보기',
    sample_actions: [
      '액션바_브랜드_브랜드관바로가기: 설화수, 헤라, 한율, 아이오페, 프리메라, 에스트라',
      '액션바_브랜드_브랜드전체보기',
    ],
  },

  // ═══ 이벤트 ═══
  '이벤트상세': {
    page_context: 'EVENT',
    ui_location: '이벤트 상세 페이지',
    description: '이벤트 상품, 정렬, 로그인 유도 팝업, 쿠폰',
    sample_actions: [
      '이벤트상세_이벤트 상품 보기',
      '이벤트상세_정렬 / 낮은가격순',
      '이벤트상세_[팝업]로그인: 노출, 카카오로그인, 로그인, 닫기',
      '이벤트상세_앱전용쿠폰, 좋아요아이콘, 상품클릭',
      '이벤트상세_[팝업]멤버십플러스쿠폰_[버튼]닫기',
    ],
  },
  '이벤트매장': {
    page_context: 'EVENT',
    ui_location: '이벤트 매장 (목록) 페이지',
    description: '이벤트 목록, 서브탭',
    sample_actions: [
      '이벤트매장_서브탭: 이벤트, 체험단',
      '이벤트매장_이벤트 더보기 / 상세보기',
    ],
  },

  // ═══ LIVE ═══
  'LIVE': {
    page_context: 'LIVE',
    ui_location: '라이브 커머스 플레이어',
    description: '라이브/VOD 플레이어 내 상품, PIP, 쿠폰, 채팅',
    sample_actions: [
      'LIVE_플레이어(라이브): 상품더보기, PIP_크게보기/닫기, 좋아요, 쿠폰, 배너, 채팅, 닫기, 방송혜택',
      'LIVE_플레이어(VOD): 상품더보기, 닫기',
    ],
  },

  // ═══ 주문완료 / 배송 ═══
  '주문완료': {
    page_context: 'ORDER_COMPLETE',
    ui_location: '주문 완료 페이지',
    description: '주문완료 후 브랜드 좋아요, 배송조회, 쇼핑계속하기',
    sample_actions: [
      'N주문완료_브랜드좋아요_노출: 헤라, 설화수, 한율, 아이오페, 일리윤, 에스트라, 프리메라',
      'N주문완료_주문배송조회_버튼',
      'N주문완료_쇼핑계속하기_버튼',
    ],
  },
  '주문배송조회': {
    page_context: 'ORDER_TRACKING',
    ui_location: '주문/배송 조회 페이지',
    description: '배송조회, 주문취소, 리뷰작성',
    sample_actions: [
      '주문배송조회_상세보기',
      '주문배송조회_배송조회: 배송중, 배송완료',
      '주문배송조회_주문취소: 결제완료',
      '주문배송조회_적립안내팝업 / 적립안내팝업_리뷰작성',
      '주문배송조회_주문더보기',
      '주문배송조회_배송조회_택배사로이동',
    ],
  },

  // ═══ 앱 전용 ═══
  '앱종료팝업': {
    page_context: 'APP_ONLY',
    ui_location: '앱 종료 시 팝업',
    description: '앱 종료 유도 팝업 (쿠폰/이벤트 유도)',
    sample_actions: [
      '[팝업]앱종료: 강제종료, 노출',
      '[팝업]쿠폰유도: 노출, 강제닫기, [버튼]닫기, [버튼]더보기',
      '[팝업]이벤트유도: 노출, 강제닫기, [버튼]닫기',
    ],
  },
  '앱진입': {
    page_context: 'APP_ONLY',
    ui_location: '앱 최초 진입 시',
    description: '알림 수신 동의 팝업',
    sample_actions: ['앱진입_알림수신거절', '앱진입_알림수신확인', '알림수신거절_PUSH알림거절버튼'],
  },
};

export const AP_CLICK_KNOWLEDGE: EventScenarioKnowledge = {
  event_name: 'ap_click',
  should_fire_rules: [
    '클릭 가능한 UI 요소에 ap-click-area 속성이 있으면 클릭 시 ap_click 이벤트 발생',
    'GTM 트리거: CSS Selector [ap-click-area], [ap-click-area] * → 하위 요소 클릭도 버블업으로 캐치',
    '50개 이상의 카테고리(영역)가 존재하며 모든 페이지 타입에 분포',
    'ap-click-area → event_category, ap-click-name → event_action, ap-click-data → event_label',
    '추가 파라미터: ap-click-param1, ap-click-param2, ap-click-param3',
    '일부 영역은 commonEvent 트리거 대신 customEvent 트리거로 ap_click을 수집할 수 있음 (click 리스너 미작동 영역 대체)',
  ],
  should_not_fire_rules: [
    'ap-click-area 속성이 없는 요소 클릭 시 미발생 (단, customEvent 트리거 예외 가능)',
    '팝업/모달이 활성화되어 뒤쪽 요소를 가리고 있으면 뒤쪽 요소 클릭 불가 → 미발생',
    'event_category, event_action이 (not set)인 경우 속성 누락 의심 → 개발 오류 가능',
    '버블링으로 인한 중복 발생: 부모-자식 요소 모두 ap-click-area가 있으면 1클릭에 2회 이상 ap_click 발생 가능 → 의도된 것인지 중복 오류인지 확인 필요',
  ],
  test_scenarios: [
    // ── 공통 영역 확인 ──
    {
      index: 1,
      scenario: '공통 Header 영역 클릭 이벤트 확인',
      procedure: '아무 페이지에서 Header의 Back, 검색, 장바구니, 홈, 로고 버튼 클릭',
      should_fire: '각 버튼 클릭 시 ap_click 발생 (category: 공통, action: 공통_Header)',
      should_not_fire: '버튼이 아닌 빈 영역 클릭 시',
      check_points: 'ap-click-area="공통" 속성 존재 확인, event_action에 버튼명 포함, label에 "Back 버튼", "검색 버튼" 등',
      automation: {
        automatable: true,
        action_type: 'click',
        target_selector: '[ap-click-area="공통"]',
        scope: 'all_urls',
      },
    },
    {
      index: 2,
      scenario: '하단 Action Bar 클릭 이벤트 확인',
      procedure: '아무 페이지에서 하단 네비게이션 바의 홈, 카테고리, 마이 등 버튼 클릭',
      should_fire: '각 탭 클릭 시 ap_click 발생 (action: 공통_Action bar)',
      should_not_fire: 'Action bar가 없는 팝업/모달 내에서',
      check_points: 'event_label에 "홈 버튼", "카테고리 버튼", "마이 버튼" 등 구분값 확인',
      automation: {
        automatable: false,
        skip_reason: '하단 Action bar 셀렉터는 사이트별 상이 (수동 확인)',
      },
    },
    // ── 상품상세 (PDP) ──
    {
      index: 3,
      scenario: 'PDP 하단 액션바 구매 영역 클릭',
      procedure: 'PDP 진입 → 하단 고정 액션바에서 구매하기/장바구니/선물하기 클릭',
      should_fire: '각 버튼 클릭 시 ap_click 발생 (category: 상품상세)',
      should_not_fire: '옵션 팝업이 활성화된 상태에서 뒤쪽 액션바 직접 클릭 시',
      check_points: 'action: 상품상세_하단액션바_구매하기 / _[팝업]옵션 선택 후 장바구니 등 정확한 매핑',
      automation: {
        automatable: false,
        skip_reason: '옵션 팝업 상호작용 필요 (수동 테스트)',
      },
    },
    {
      index: 4,
      scenario: 'PDP 이미지 썸네일 스와이프',
      procedure: 'PDP 진입 → 상품 이미지 좌우 스와이프',
      should_fire: '스와이프 시 ap_click 발생 (action: 상품상세_상품썸네일 스와이프)',
      should_not_fire: '이미지 로딩 전 스와이프 시',
      check_points: 'event_label에 상품명 포함 여부, 스와이프마다 중복 발생 체크',
      automation: {
        automatable: false,
        skip_reason: '스와이프 제스처 제어 필요 (수동 테스트)',
      },
    },
    // ── 검색 ──
    {
      index: 5,
      scenario: '검색 모달 내 카테고리/필터 클릭',
      procedure: '검색 모달 → 카테고리 1depth/2depth 클릭, 정렬 변경',
      should_fire: '각 필터/카테고리 클릭 시 ap_click 발생 (category: 검색)',
      should_not_fire: '검색 모달 미오픈 상태에서',
      check_points: 'action: 검색_카테고리_1depth/2depth, label: 카테고리명',
      automation: {
        automatable: false,
        skip_reason: '검색 모달 오픈 → 카테고리 클릭 멀티스텝 (수동 테스트)',
      },
    },
    // ── DOM 속성 스캔 ──
    {
      index: 6,
      scenario: '페이지 내 ap-click-area 속성 전체 스캔',
      procedure: '대상 페이지 로드 → document.querySelectorAll("[ap-click-area]")로 모든 ap-click-area 요소 수집',
      should_fire: '각 페이지 타입별 예상 카테고리가 존재하는지 확인',
      should_not_fire: 'ap-click-area 속성이 전혀 없는 페이지 (비정상)',
      check_points: '팝업/모달 제거 후 스캔 권장. 각 요소의 ap-click-area, ap-click-name 값 수집하여 카테고리-액션 매핑 정확성 확인',
      automation: {
        automatable: true,
        action_type: 'page_load',
        target_selector: '[ap-click-area]',
        scope: 'all_urls',
      },
    },
    // ── 팝업/모달 간섭 ──
    {
      index: 7,
      scenario: '팝업/모달 활성화 시 ap-click-area 간섭 확인',
      procedure: '페이지 로드 → 팝업/모달 활성화 → 팝업 내 ap-click-area 확인 → 팝업 닫기 → 뒤쪽 영역 ap-click-area 확인',
      should_fire: '팝업 내부 요소에도 ap-click-area가 있으면 팝업 클릭 시 발생',
      should_not_fire: '팝업이 가리는 뒤쪽 요소 클릭 시 (이벤트 전파 차단)',
      check_points: '팝업/모달 제거 후 DOM 스캔하여 실제 페이지 영역의 ap-click-area 정확히 파악',
      automation: {
        automatable: false,
        skip_reason: '팝업/모달 상태 관리 필요 (수동 테스트)',
      },
    },
    // ── 버블링 중복 발생 ──
    {
      index: 8,
      scenario: '버블링으로 인한 ap_click 중복 발생 검증',
      procedure: '버튼 영역 클릭 → dataLayer에서 ap_click 이벤트 발생 횟수 확인',
      should_fire: '1클릭에 ap_click 1회 발생이 정상',
      should_not_fire: '부모-자식 요소에 ap-click-area가 중첩되어 1클릭에 2회 이상 발생 (버블링 중복)',
      check_points: 'GTM 트리거가 [ap-click-area], [ap-click-area] *로 되어있어 하위 요소 클릭 시 부모까지 매칭 → 중복 가능. DOM 구조에서 ap-click-area가 중첩된 영역 식별 필요. 특히 버튼 내부에 아이콘/텍스트 요소가 별도 ap-click-area를 가진 경우 주의',
      automation: {
        automatable: false,
        skip_reason: '버블링 중복은 DOM 구조 분석 + 이벤트 횟수 카운팅 필요 (수동 검증)',
      },
    },
    // ── customEvent 트리거 대체 수집 ──
    {
      index: 9,
      scenario: 'customEvent 트리거로 수집되는 ap_click 영역 확인',
      procedure: '일부 영역에서 클릭 시 commonEvent가 아닌 customEvent 트리거로 ap_click 발생 여부 확인',
      should_fire: 'click 리스너가 정상 동작하지 않는 영역에서 customEvent 트리거로 ap_click 수집',
      should_not_fire: 'commonEvent + customEvent 동시 발생으로 이중 수집',
      check_points: 'GTM에서 ap_click 태그에 customEvent 트리거가 추가 연결되어 있는지 확인. 일부 영역은 click 리스너가 안 먹히는 케이스 존재 (동적 렌더링, Shadow DOM, iframe 등) → customEvent로 dataLayer.push 직접 호출하여 수집하는 패턴. commonEvent와 customEvent 양쪽 모두 발생하면 이중 수집 오류',
      automation: {
        automatable: false,
        skip_reason: 'customEvent 트리거 여부는 GTM 컨테이너 분석 + 실제 클릭 테스트 필요 (수동 검증)',
      },
    },
    // ── (not set) 검증 ──
    {
      index: 10,
      scenario: 'event_category 또는 event_action이 (not set)인 경우',
      procedure: '수집된 ap_click 데이터에서 (not set) 값 필터링',
      should_fire: '이 시나리오에서는 발생하면 안 됨',
      should_not_fire: 'event_category=(not set)이면 ap-click-area 속성 누락, event_action=(not set)이면 ap-click-name 누락',
      check_points: '(not set) 발견 시 해당 요소의 DOM 구조 확인 → ap-click-area/name 속성 누락 여부 개발팀 리포트',
      automation: {
        automatable: false,
        skip_reason: '수집 데이터 후처리 분석 (수동 검증)',
      },
    },
  ],
  check_points: [
    // ── AP 속성 기반 ──
    'ap-click-area 속성이 있는 요소 클릭 시 commonEvent → ap_click 이벤트 발생',
    'GTM JS 변수가 el.getAttribute() → el.querySelector() → el.closest()로 속성 탐색 (버블업)',
    '50개 이상의 카테고리(영역)가 존재: 상품상세(164), N주문서(62), 마이파우치(52), 검색(40), MAIN(30), 장바구니(26) 순',
    // ── 버블링 중복 발생 ──
    '버블링 중복 주의: [ap-click-area], [ap-click-area] * 트리거 특성상 부모-자식에 ap-click-area가 중첩되면 1클릭에 2회 이상 ap_click 발생 가능',
    'DOM 구조에서 ap-click-area가 중첩된 영역(버튼 내부 아이콘 등)을 식별하여 의도된 중복인지 오류인지 판단',
    // ── customEvent 대체 수집 ──
    '일부 영역은 click 리스너가 정상 동작하지 않아 customEvent 트리거로 ap_click을 수집하는 케이스 존재',
    'customEvent 트리거: 동적 렌더링, Shadow DOM, iframe 등 click 이벤트가 안 먹히는 영역에서 dataLayer.push 직접 호출',
    'commonEvent + customEvent 양쪽 모두 발생하면 이중 수집 오류 → 트리거 충돌 여부 확인',
    // ── 팝업/모달 주의 ──
    '팝업/모달이 활성화되면 해당 요소를 제거/닫고 확인하는 것이 좋음 (뒤쪽 영역 가림)',
    '팝업 내부에도 ap-click-area 존재 가능: [팝업]앱종료, [팝업]로그인, [팝업]멤버십플러스쿠폰 등',
    // ── 네이밍 규칙 ──
    'Action 네이밍: {카테고리}_{컴포넌트}_{인터랙션} 형식',
    '[팝업] 접두사: 팝업/모달 관련 인터랙션 (49건)',
    '[알림] 접두사: 알림/추천 영역 (18건, 주로 마이파우치)',
    '_노출: 뷰 이벤트 (영역이 화면에 노출됨) - 클릭이 아닌 노출 이벤트도 ap_click으로 수집',
    // ── 검증 ──
    '(not set) 값: event_category 또는 event_action이 (not set)이면 속성 누락 → 개발 오류 리포트 대상',
    'DOM 스캔: document.querySelectorAll("[ap-click-area]")로 페이지별 전체 ap-click-area 수집 가능',
  ],
};
