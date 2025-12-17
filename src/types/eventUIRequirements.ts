/**
 * 이벤트별 필요한 UI 요소 정의
 *
 * Vision AI가 페이지 스크린샷을 분석할 때
 * 각 이벤트가 발생하려면 어떤 UI 요소가 필요한지 정의합니다.
 */

export interface EventUIRequirement {
  /** 이벤트명 */
  eventName: string;
  /** 이벤트 설명 (한글) */
  description: string;
  /** 필요한 UI 요소 설명 */
  requiredUI: string;
  /** Vision AI에게 물어볼 질문 */
  visionQuestion: string;
  /** 이벤트 카테고리 */
  category: 'auto' | 'click' | 'scroll' | 'form' | 'ecommerce' | 'engagement' | 'video';
  /** 사용자 액션 필요 여부 */
  requiresUserAction: boolean;
  /** 자동 발생 이벤트 여부 (페이지 로드 시 자동) */
  autoFire: boolean;
}

/**
 * GA4 E-commerce 및 일반 이벤트별 UI 요구사항
 */
export const EVENT_UI_REQUIREMENTS: Record<string, EventUIRequirement> = {
  // ========================================
  // 자동 발생 이벤트 (페이지 로드 시)
  // ========================================
  'page_view': {
    eventName: 'page_view',
    description: '페이지 조회',
    requiredUI: '없음 (페이지 로드 시 자동)',
    visionQuestion: '페이지가 정상적으로 로드되었나요?',
    category: 'auto',
    requiresUserAction: false,
    autoFire: true,
  },
  'view_promotion': {
    eventName: 'view_promotion',
    description: '프로모션 노출',
    requiredUI: '프로모션 배너, 이벤트 배너, 광고 영역',
    visionQuestion: '페이지에 프로모션 배너나 이벤트 배너가 보이나요? (슬라이드 배너, 팝업 배너, 기획전 배너 등)',
    category: 'auto',
    requiresUserAction: false,
    autoFire: true,
  },
  'view_item_list': {
    eventName: 'view_item_list',
    description: '상품 목록 노출',
    requiredUI: '상품 목록, 상품 그리드, 상품 캐러셀',
    visionQuestion: '페이지에 상품 목록이 보이나요? (상품 카드들이 그리드나 캐러셀 형태로 나열된 영역)',
    category: 'auto',
    requiresUserAction: false,
    autoFire: true,
  },
  'view_promotion_detail': {
    eventName: 'view_promotion_detail',
    description: '프로모션 상세 조회',
    requiredUI: '프로모션/이벤트 상세 페이지 콘텐츠',
    visionQuestion: '이 페이지가 특정 프로모션이나 이벤트의 상세 페이지인가요? (이벤트 제목, 기간, 상세 내용이 있는 페이지)',
    category: 'auto',
    requiresUserAction: false,
    autoFire: true,
  },
  'view_item': {
    eventName: 'view_item',
    description: '상품 상세 조회',
    requiredUI: '상품 상세 정보 (상품명, 가격, 이미지, 옵션 등)',
    visionQuestion: '이 페이지가 특정 상품의 상세 페이지인가요? (상품명, 가격, 상품 이미지, 구매 버튼이 있는 페이지)',
    category: 'auto',
    requiresUserAction: false,
    autoFire: true,
  },
  'scroll': {
    eventName: 'scroll',
    description: '스크롤',
    requiredUI: '스크롤 가능한 콘텐츠',
    visionQuestion: '페이지에 스크롤할 수 있는 콘텐츠가 있나요? (화면 아래로 더 많은 콘텐츠가 있는지)',
    category: 'scroll',
    requiresUserAction: false,
    autoFire: true,
  },
  'page_load_time': {
    eventName: 'page_load_time',
    description: '페이지 로드 시간',
    requiredUI: '없음 (자동 측정)',
    visionQuestion: '페이지가 정상적으로 로드되었나요?',
    category: 'auto',
    requiresUserAction: false,
    autoFire: true,
  },

  // ========================================
  // 클릭 이벤트
  // ========================================
  'select_promotion': {
    eventName: 'select_promotion',
    description: '프로모션 클릭',
    requiredUI: '클릭 가능한 프로모션 배너, 이벤트 배너 링크',
    visionQuestion: '클릭할 수 있는 프로모션 배너나 이벤트 배너가 있나요? (링크가 걸린 배너 이미지, "자세히 보기" 버튼 등)',
    category: 'click',
    requiresUserAction: true,
    autoFire: false,
  },
  'select_item': {
    eventName: 'select_item',
    description: '상품 선택/클릭',
    requiredUI: '클릭 가능한 상품 카드, 상품 링크',
    visionQuestion: '클릭할 수 있는 상품 카드나 상품 링크가 있나요? (상품 이미지, 상품명을 클릭하면 상세 페이지로 이동)',
    category: 'click',
    requiresUserAction: true,
    autoFire: false,
  },
  'ap_click': {
    eventName: 'ap_click',
    description: 'AP 클릭 (일반 클릭 추적)',
    requiredUI: '클릭 가능한 요소 (버튼, 링크, 메뉴 등)',
    visionQuestion: '페이지에 클릭할 수 있는 버튼, 링크, 메뉴가 있나요?',
    category: 'click',
    requiresUserAction: true,
    autoFire: false,
  },
  'click_with_duration': {
    eventName: 'click_with_duration',
    description: '클릭 시간 측정',
    requiredUI: '클릭 가능한 요소',
    visionQuestion: '페이지에 클릭할 수 있는 요소가 있나요?',
    category: 'click',
    requiresUserAction: true,
    autoFire: false,
  },
  'brand_product_click': {
    eventName: 'brand_product_click',
    description: '브랜드샵 상품 클릭',
    requiredUI: '브랜드샵 내 상품 링크',
    visionQuestion: '브랜드샵 페이지에서 클릭할 수 있는 상품이 있나요?',
    category: 'click',
    requiresUserAction: true,
    autoFire: false,
  },

  // ========================================
  // 이커머스 이벤트
  // ========================================
  'add_to_cart': {
    eventName: 'add_to_cart',
    description: '장바구니 추가',
    requiredUI: '"장바구니 담기", "카트에 추가", "ADD TO CART" 버튼',
    visionQuestion: '"장바구니 담기", "장바구니", "카트", "ADD TO CART" 등의 버튼이 있나요?',
    category: 'ecommerce',
    requiresUserAction: true,
    autoFire: false,
  },
  'remove_from_cart': {
    eventName: 'remove_from_cart',
    description: '장바구니 삭제',
    requiredUI: '장바구니 페이지의 삭제 버튼',
    visionQuestion: '장바구니에서 상품을 삭제할 수 있는 버튼(X, 삭제, 제거)이 있나요?',
    category: 'ecommerce',
    requiresUserAction: true,
    autoFire: false,
  },
  'begin_checkout': {
    eventName: 'begin_checkout',
    description: '결제 시작',
    requiredUI: '"구매하기", "결제하기", "주문하기" 버튼',
    visionQuestion: '"구매하기", "결제하기", "주문하기", "BUY NOW" 등의 버튼이 있나요?',
    category: 'ecommerce',
    requiresUserAction: true,
    autoFire: false,
  },
  'purchase': {
    eventName: 'purchase',
    description: '구매 완료',
    requiredUI: '주문 완료 페이지, 결제 완료 메시지',
    visionQuestion: '이 페이지가 주문/결제 완료 페이지인가요? ("주문이 완료되었습니다", "결제 완료" 등의 메시지)',
    category: 'ecommerce',
    requiresUserAction: false,
    autoFire: true,
  },
  'view_cart': {
    eventName: 'view_cart',
    description: '장바구니 조회',
    requiredUI: '장바구니 페이지',
    visionQuestion: '이 페이지가 장바구니 페이지인가요? (담긴 상품 목록, 총 금액, 결제 버튼이 있는 페이지)',
    category: 'ecommerce',
    requiresUserAction: false,
    autoFire: true,
  },
  'add_to_wishlist': {
    eventName: 'add_to_wishlist',
    description: '위시리스트 추가',
    requiredUI: '찜하기, 좋아요, 하트 버튼',
    visionQuestion: '"찜하기", "좋아요", 하트(♥) 아이콘 버튼이 있나요?',
    category: 'ecommerce',
    requiresUserAction: true,
    autoFire: false,
  },

  // ========================================
  // 검색 이벤트
  // ========================================
  'view_search_results': {
    eventName: 'view_search_results',
    description: '검색 결과 조회',
    requiredUI: '검색 결과 페이지',
    visionQuestion: '이 페이지가 검색 결과 페이지인가요? (검색어, 검색 결과 개수, 검색된 상품 목록이 있는 페이지)',
    category: 'engagement',
    requiresUserAction: false,
    autoFire: true,
  },
  'search': {
    eventName: 'search',
    description: '검색 실행',
    requiredUI: '검색창, 검색 버튼',
    visionQuestion: '검색창과 검색 버튼(돋보기 아이콘)이 있나요?',
    category: 'engagement',
    requiresUserAction: true,
    autoFire: false,
  },

  // ========================================
  // 인증/계정 이벤트
  // ========================================
  'login': {
    eventName: 'login',
    description: '로그인',
    requiredUI: '로그인 버튼, 로그인 폼',
    visionQuestion: '"로그인", "LOGIN", "Sign In" 버튼이나 로그인 폼(아이디/비밀번호 입력)이 있나요?',
    category: 'engagement',
    requiresUserAction: true,
    autoFire: false,
  },
  'sign_up': {
    eventName: 'sign_up',
    description: '회원가입',
    requiredUI: '회원가입 버튼, 회원가입 폼',
    visionQuestion: '"회원가입", "SIGN UP", "가입하기" 버튼이나 회원가입 폼이 있나요?',
    category: 'engagement',
    requiresUserAction: true,
    autoFire: false,
  },
  'withdrawal': {
    eventName: 'withdrawal',
    description: '회원 탈퇴',
    requiredUI: '회원 탈퇴 버튼',
    visionQuestion: '"회원 탈퇴", "계정 삭제" 버튼이 있나요?',
    category: 'engagement',
    requiresUserAction: true,
    autoFire: false,
  },

  // ========================================
  // 기타 이벤트
  // ========================================
  'write_review': {
    eventName: 'write_review',
    description: '리뷰 작성',
    requiredUI: '리뷰 작성 버튼, 리뷰 입력 폼',
    visionQuestion: '"리뷰 작성", "후기 작성", "리뷰 쓰기" 버튼이나 리뷰 입력 폼이 있나요?',
    category: 'engagement',
    requiresUserAction: true,
    autoFire: false,
  },
  'naverpay': {
    eventName: 'naverpay',
    description: '네이버페이 결제',
    requiredUI: '네이버페이 버튼',
    visionQuestion: '네이버페이 결제 버튼이 있나요? (초록색 N Pay 로고)',
    category: 'ecommerce',
    requiresUserAction: true,
    autoFire: false,
  },
  'beauty_tester': {
    eventName: 'beauty_tester',
    description: '뷰티 테스터',
    requiredUI: '뷰티 테스터, AR 메이크업 기능',
    visionQuestion: '"뷰티 테스터", "가상 메이크업", "AR 체험" 버튼이 있나요?',
    category: 'engagement',
    requiresUserAction: true,
    autoFire: false,
  },
  'brand_store': {
    eventName: 'brand_store',
    description: '브랜드 스토어',
    requiredUI: '브랜드 스토어 페이지',
    visionQuestion: '이 페이지가 특정 브랜드의 스토어 페이지인가요? (브랜드 로고, 브랜드명이 크게 표시된 페이지)',
    category: 'engagement',
    requiresUserAction: false,
    autoFire: true,
  },
  'live': {
    eventName: 'live',
    description: '라이브 방송',
    requiredUI: '라이브 방송 영역, 라이브 버튼',
    visionQuestion: '"LIVE", "라이브", 실시간 방송 버튼이나 라이브 방송 영역이 있나요?',
    category: 'engagement',
    requiresUserAction: true,
    autoFire: false,
  },
  'qualified_visit': {
    eventName: 'qualified_visit',
    description: '적격 방문',
    requiredUI: '없음 (조건 충족 시 자동)',
    visionQuestion: '페이지가 정상적으로 로드되었나요?',
    category: 'auto',
    requiresUserAction: false,
    autoFire: true,
  },
  'custom_event': {
    eventName: 'custom_event',
    description: '커스텀 이벤트',
    requiredUI: '다양함 (이벤트에 따라 다름)',
    visionQuestion: '페이지에 특별한 인터랙션 요소가 있나요?',
    category: 'engagement',
    requiresUserAction: true,
    autoFire: false,
  },
};

/**
 * 이벤트명으로 UI 요구사항을 조회합니다.
 */
export function getEventUIRequirement(eventName: string): EventUIRequirement | undefined {
  return EVENT_UI_REQUIREMENTS[eventName];
}

/**
 * 자동 발생 이벤트 목록을 반환합니다.
 */
export function getAutoFireEvents(): string[] {
  return Object.values(EVENT_UI_REQUIREMENTS)
    .filter(e => e.autoFire)
    .map(e => e.eventName);
}

/**
 * 사용자 액션이 필요한 이벤트 목록을 반환합니다.
 */
export function getUserActionEvents(): string[] {
  return Object.values(EVENT_UI_REQUIREMENTS)
    .filter(e => e.requiresUserAction)
    .map(e => e.eventName);
}

/**
 * Vision AI에게 전달할 UI 체크 프롬프트를 생성합니다.
 */
export function generateUICheckPrompt(eventNames: string[]): string {
  const lines: string[] = [];

  lines.push('다음 이벤트들이 이 페이지에서 발생할 수 있는지 화면을 보고 판단해주세요.');
  lines.push('각 이벤트별로 필요한 UI 요소가 화면에 있는지 확인해주세요.\n');

  for (const eventName of eventNames) {
    const req = EVENT_UI_REQUIREMENTS[eventName];
    if (req) {
      lines.push(`### ${eventName} (${req.description})`);
      lines.push(`- 필요한 UI: ${req.requiredUI}`);
      lines.push(`- 확인 질문: ${req.visionQuestion}`);
      lines.push('');
    }
  }

  lines.push('\n응답 형식:');
  lines.push('각 이벤트에 대해 다음 형식으로 답변해주세요:');
  lines.push('- 이벤트명: [가능/불가능] - [이유]');
  lines.push('\n예시:');
  lines.push('- add_to_cart: 불가능 - 장바구니 담기 버튼이 보이지 않습니다.');
  lines.push('- select_promotion: 가능 - 상단에 클릭 가능한 프로모션 배너가 있습니다.');

  return lines.join('\n');
}
