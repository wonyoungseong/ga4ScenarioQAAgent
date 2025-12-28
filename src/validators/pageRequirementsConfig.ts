/**
 * 페이지 타입별 필수 컴포넌트 요구사항 설정
 *
 * 마케터/기획자 관점에서 각 페이지 타입에 반드시 있어야 할 UI 요소 정의
 */

import { ComponentRequirement, PageTypeRequirement } from '../types/pageValidation';

/**
 * 에러 페이지 감지용 키워드
 */
export const ERROR_KEYWORDS = {
  // 404 관련
  notFound: [
    '404',
    'Page Not Found',
    'Not Found',
    '페이지를 찾을 수 없',
    '존재하지 않는 페이지',
    '요청하신 페이지',
    'The page you requested',
  ],
  // 500 관련
  serverError: [
    '500',
    'Internal Server Error',
    'Server Error',
    '서버 오류',
    '서버 에러',
    '일시적인 오류',
    '잠시 후 다시',
    'Something went wrong',
  ],
  // 접근 제한
  accessDenied: [
    '403',
    'Forbidden',
    'Access Denied',
    '접근할 수 없',
    '접근 권한',
    '접근이 제한',
    'Permission Denied',
  ],
  // 일반 에러
  general: [
    '오류가 발생',
    '문제가 발생',
    'Error occurred',
    '에러가 발생',
    'An error has occurred',
  ],
};

/**
 * 로그인 필요 감지용 키워드
 */
export const LOGIN_KEYWORDS = [
  '로그인이 필요',
  '로그인 후',
  '로그인 해주세요',
  '로그인하세요',
  'Login Required',
  'Please login',
  'Please sign in',
  '회원만 이용',
  '회원 전용',
];

/**
 * 페이지 타입별 필수 컴포넌트 정의
 */
export const PAGE_REQUIREMENTS: Record<string, PageTypeRequirement> = {
  PRODUCT_DETAIL: {
    pageType: 'PRODUCT_DETAIL',
    description: '상품 상세 페이지 (PDP)',
    required: [
      {
        name: '상품 이미지',
        selectors: [
          '[class*="product-image"]',
          '[class*="prd-img"]',
          '[class*="detail-img"]',
          '[class*="goods-image"]',
          '[class*="item-image"]',
          '.product_img',
          '.prd_img',
          'img[alt*="상품"]',
        ],
        visionHint: '큰 상품 사진, 메인 이미지 영역',
        description: '상품의 대표 이미지',
      },
      {
        name: '상품명',
        selectors: [
          '[class*="product-name"]',
          '[class*="prd-name"]',
          '[class*="goods-name"]',
          '[class*="item-name"]',
          '[class*="product-title"]',
          '.prd_name',
          '.goods_name',
          'h1[class*="product"]',
          'h1[class*="prd"]',
        ],
        visionHint: '상품 제목 텍스트, 큰 글씨의 제품명',
        description: '상품 이름',
      },
      {
        name: '가격',
        selectors: [
          '[class*="price"]',
          '[class*="amount"]',
          '[class*="cost"]',
          '.prd_price',
          '.goods_price',
          '[class*="sale-price"]',
        ],
        visionHint: '₩ 또는 원 단위 가격 표시, 숫자와 통화 기호',
        description: '상품 가격',
      },
      {
        name: '구매/장바구니 버튼',
        selectors: [
          '[class*="cart"]',
          '[class*="buy"]',
          '[class*="purchase"]',
          '[class*="order"]',
          'button[type="submit"]',
          '[class*="add-cart"]',
          '[class*="addCart"]',
          '.btn_cart',
          '.btn_buy',
        ],
        visionHint: '장바구니 담기, 구매하기, 바로구매 등의 버튼',
        description: '구매 또는 장바구니 추가 버튼',
      },
    ],
    optional: [
      {
        name: '브랜드명',
        selectors: ['[class*="brand"]', '.prd_brand', '[class*="maker"]'],
        visionHint: '브랜드 로고 또는 브랜드 이름 텍스트',
      },
      {
        name: '리뷰',
        selectors: ['[class*="review"]', '[class*="rating"]', '[class*="star"]'],
        visionHint: '별점, 리뷰 개수, 평점 영역',
      },
      {
        name: '옵션 선택',
        selectors: ['[class*="option"]', 'select', '[class*="variant"]'],
        visionHint: '색상, 사이즈 등 옵션 선택 영역',
      },
    ],
  },

  PRODUCT_LIST: {
    pageType: 'PRODUCT_LIST',
    description: '상품 목록 페이지 (PLP)',
    required: [
      {
        name: '상품 카드',
        selectors: [
          '[class*="product-card"]',
          '[class*="product-item"]',
          '[class*="goods-item"]',
          '[class*="prd-item"]',
          '.product_list li',
          '[class*="item-card"]',
          '[class*="goods-list"] > *',
        ],
        visionHint: '상품 썸네일, 이름, 가격이 있는 카드 형태의 목록',
        description: '상품 카드 (1개 이상)',
      },
    ],
    optional: [
      {
        name: '상품 개수',
        selectors: ['[class*="count"]', '[class*="total"]', '[class*="result-count"]'],
        visionHint: '총 N개, N개의 상품 등 개수 표시',
      },
      {
        name: '정렬/필터',
        selectors: ['[class*="filter"]', '[class*="sort"]', 'select[class*="order"]'],
        visionHint: '정렬 드롭다운, 필터 옵션',
      },
      {
        name: '페이지네이션',
        selectors: ['[class*="paging"]', '[class*="pagination"]', '.page_num'],
        visionHint: '1, 2, 3... 페이지 번호 또는 더보기 버튼',
      },
    ],
  },

  SEARCH_RESULT: {
    pageType: 'SEARCH_RESULT',
    description: '검색 결과 페이지',
    required: [
      {
        name: '검색어 표시',
        selectors: [
          '[class*="search-keyword"]',
          '[class*="search-term"]',
          '[class*="query"]',
          '[class*="keyword"]',
          'input[type="search"]',
          'input[name*="keyword"]',
        ],
        visionHint: '검색어가 표시되는 영역 또는 검색창',
        description: '검색한 키워드 표시',
      },
      {
        name: '검색 결과 목록',
        selectors: [
          '[class*="search-result"]',
          '[class*="result-list"]',
          '[class*="product-list"]',
          '[class*="goods-list"]',
        ],
        visionHint: '검색된 상품 또는 콘텐츠 목록',
        description: '검색 결과 목록',
      },
    ],
    optional: [
      {
        name: '결과 개수',
        selectors: ['[class*="result-count"]', '[class*="total"]'],
        visionHint: '검색 결과 N개, 총 N건 등',
      },
      {
        name: '검색 필터',
        selectors: ['[class*="filter"]', '[class*="refine"]'],
        visionHint: '카테고리, 가격대 등 필터 옵션',
      },
    ],
  },

  CART: {
    pageType: 'CART',
    description: '장바구니 페이지',
    required: [
      {
        name: '장바구니 상품 목록',
        selectors: [
          '[class*="cart-item"]',
          '[class*="cart-product"]',
          '[class*="basket-item"]',
          '.cart_list',
          '[class*="cart-list"]',
        ],
        visionHint: '장바구니에 담긴 상품들의 목록 (이미지, 이름, 가격, 수량)',
        description: '장바구니 상품 목록',
      },
      {
        name: '총 금액',
        selectors: [
          '[class*="total-price"]',
          '[class*="total-amount"]',
          '[class*="order-total"]',
          '[class*="sum"]',
          '.total_price',
        ],
        visionHint: '합계, 총 금액, 결제 예정 금액 등',
        description: '주문 총액',
      },
      {
        name: '결제/주문 버튼',
        selectors: [
          '[class*="checkout"]',
          '[class*="order-btn"]',
          '[class*="buy-btn"]',
          '[class*="payment"]',
          'button[class*="order"]',
        ],
        visionHint: '주문하기, 결제하기, 구매하기 버튼',
        description: '결제 진행 버튼',
      },
    ],
    optional: [
      {
        name: '수량 조절',
        selectors: ['[class*="quantity"]', '[class*="qty"]', 'input[type="number"]'],
        visionHint: '+ - 버튼 또는 수량 입력란',
      },
      {
        name: '삭제 버튼',
        selectors: ['[class*="delete"]', '[class*="remove"]', '[class*="del"]'],
        visionHint: 'X 버튼 또는 삭제 버튼',
      },
    ],
  },

  ORDER: {
    pageType: 'ORDER',
    description: '주문/결제 페이지',
    required: [
      {
        name: '주문 상품 정보',
        selectors: [
          '[class*="order-product"]',
          '[class*="order-item"]',
          '[class*="checkout-item"]',
          '.order_goods',
        ],
        visionHint: '주문할 상품의 이미지, 이름, 가격, 수량',
        description: '주문 상품 정보',
      },
      {
        name: '배송지 입력',
        selectors: [
          '[class*="shipping"]',
          '[class*="delivery"]',
          '[class*="address"]',
          '[name*="addr"]',
          '[name*="receiver"]',
        ],
        visionHint: '받는 사람, 연락처, 주소 입력 영역',
        description: '배송지 정보 입력',
      },
      {
        name: '결제 버튼',
        selectors: [
          '[class*="pay-btn"]',
          '[class*="submit"]',
          '[class*="order-btn"]',
          'button[type="submit"]',
          '[class*="payment-btn"]',
        ],
        visionHint: '결제하기, 주문 완료 버튼',
        description: '최종 결제 버튼',
      },
    ],
    optional: [
      {
        name: '결제 수단',
        selectors: ['[class*="payment-method"]', '[class*="pay-type"]', '[name*="payType"]'],
        visionHint: '신용카드, 계좌이체, 간편결제 등 선택',
      },
      {
        name: '쿠폰/포인트',
        selectors: ['[class*="coupon"]', '[class*="point"]', '[class*="discount"]'],
        visionHint: '쿠폰 적용, 포인트 사용 영역',
      },
    ],
  },

  MAIN: {
    pageType: 'MAIN',
    description: '메인 페이지',
    required: [
      {
        name: '메인 배너',
        selectors: [
          '[class*="main-banner"]',
          '[class*="hero"]',
          '[class*="key-visual"]',
          '[class*="slider"]',
          '[class*="carousel"]',
          '[class*="swiper"]',
        ],
        visionHint: '큰 배너 이미지, 슬라이드 영역, Key Visual',
        description: '메인 비주얼 배너',
      },
      {
        name: 'GNB (네비게이션)',
        selectors: [
          '[class*="gnb"]',
          '[class*="nav"]',
          '[class*="header-menu"]',
          'nav',
          '[role="navigation"]',
        ],
        visionHint: '상단 메뉴, 카테고리 네비게이션',
        description: '글로벌 네비게이션',
      },
    ],
    optional: [
      {
        name: '검색창',
        selectors: ['[class*="search"]', 'input[type="search"]', '[class*="gnb-search"]'],
        visionHint: '검색 입력창, 돋보기 아이콘',
      },
      {
        name: '로그인/회원가입',
        selectors: ['[class*="login"]', '[class*="member"]', '[class*="auth"]'],
        visionHint: '로그인, 회원가입 링크 또는 버튼',
      },
    ],
  },

  EVENT_LIST: {
    pageType: 'EVENT_LIST',
    description: '이벤트 목록 페이지',
    required: [
      {
        name: '이벤트 목록',
        selectors: [
          '[class*="event-list"]',
          '[class*="event-item"]',
          '[class*="promotion-list"]',
          '.event_list',
        ],
        visionHint: '이벤트 배너 또는 카드 목록',
        description: '이벤트 목록',
      },
    ],
    optional: [
      {
        name: '이벤트 탭/필터',
        selectors: ['[class*="tab"]', '[class*="filter"]'],
        visionHint: '진행중/종료 탭 또는 카테고리 필터',
      },
    ],
  },

  EVENT_DETAIL: {
    pageType: 'EVENT_DETAIL',
    description: '이벤트 상세 페이지',
    required: [
      {
        name: '이벤트 제목',
        selectors: [
          '[class*="event-title"]',
          '[class*="promotion-title"]',
          'h1[class*="event"]',
          '.event_title',
        ],
        visionHint: '이벤트 제목, 큰 글씨의 프로모션명',
        description: '이벤트 제목',
      },
      {
        name: '이벤트 내용',
        selectors: [
          '[class*="event-content"]',
          '[class*="event-detail"]',
          '[class*="promotion-content"]',
          '.event_content',
        ],
        visionHint: '이벤트 상세 내용, 이미지 또는 텍스트',
        description: '이벤트 상세 내용',
      },
    ],
    optional: [
      {
        name: '이벤트 기간',
        selectors: ['[class*="period"]', '[class*="date"]', '[class*="duration"]'],
        visionHint: '시작일 ~ 종료일, 기간 표시',
      },
      {
        name: '참여 버튼',
        selectors: ['[class*="apply"]', '[class*="join"]', '[class*="participate"]'],
        visionHint: '이벤트 참여하기, 응모하기 버튼',
      },
    ],
  },

  MY: {
    pageType: 'MY',
    description: '마이페이지',
    required: [
      {
        name: '마이페이지 메뉴',
        selectors: [
          '[class*="mypage-menu"]',
          '[class*="my-menu"]',
          '[class*="aside-menu"]',
          '.my_menu',
          '[class*="lnb"]',
        ],
        visionHint: '주문내역, 배송조회, 쿠폰, 포인트 등 메뉴 목록',
        description: '마이페이지 메뉴',
      },
    ],
    optional: [
      {
        name: '회원 정보',
        selectors: ['[class*="user-info"]', '[class*="member-info"]', '[class*="profile"]'],
        visionHint: '회원 이름, 등급, 포인트 등 정보',
      },
      {
        name: '최근 주문',
        selectors: ['[class*="recent-order"]', '[class*="order-list"]'],
        visionHint: '최근 주문 내역 목록',
      },
    ],
  },

  BRAND_MAIN: {
    pageType: 'BRAND_MAIN',
    description: '브랜드 메인 페이지',
    required: [
      {
        name: '브랜드 정보',
        selectors: [
          '[class*="brand-info"]',
          '[class*="brand-name"]',
          '[class*="brand-logo"]',
          '.brand_info',
        ],
        visionHint: '브랜드 로고, 브랜드 이름, 브랜드 소개',
        description: '브랜드 정보',
      },
    ],
    optional: [
      {
        name: '브랜드 상품',
        selectors: ['[class*="brand-product"]', '[class*="product-list"]'],
        visionHint: '해당 브랜드 상품 목록',
      },
    ],
  },

  LIVE_DETAIL: {
    pageType: 'LIVE_DETAIL',
    description: '라이브 상세 페이지',
    required: [
      {
        name: '라이브 영상',
        selectors: [
          '[class*="live-player"]',
          '[class*="video-player"]',
          'video',
          'iframe[src*="youtube"]',
          'iframe[src*="player"]',
        ],
        visionHint: '라이브 영상 플레이어, 비디오 영역',
        description: '라이브 영상 플레이어',
      },
    ],
    optional: [
      {
        name: '라이브 정보',
        selectors: ['[class*="live-info"]', '[class*="broadcast-info"]'],
        visionHint: '라이브 제목, 시청자 수 등',
      },
      {
        name: '채팅',
        selectors: ['[class*="chat"]', '[class*="comment"]'],
        visionHint: '실시간 채팅 영역',
      },
    ],
  },

  // 기본값 (OTHERS)
  OTHERS: {
    pageType: 'OTHERS',
    description: '기타 페이지',
    required: [
      {
        name: '콘텐츠 영역',
        selectors: ['main', '[class*="content"]', '[class*="container"]', '#content', 'article'],
        visionHint: '페이지의 메인 콘텐츠 영역',
        description: '기본 콘텐츠',
      },
    ],
    optional: [],
  },
};

/**
 * 페이지 타입별 요구사항 가져오기
 */
export function getPageRequirements(pageType: string): PageTypeRequirement {
  return PAGE_REQUIREMENTS[pageType] || PAGE_REQUIREMENTS.OTHERS;
}

/**
 * 모든 페이지 타입 목록
 */
export function getAllPageTypes(): string[] {
  return Object.keys(PAGE_REQUIREMENTS);
}

/**
 * 모든 에러 키워드를 하나의 배열로 합치기
 */
export function getAllErrorKeywords(): string[] {
  return [
    ...ERROR_KEYWORDS.notFound,
    ...ERROR_KEYWORDS.serverError,
    ...ERROR_KEYWORDS.accessDenied,
    ...ERROR_KEYWORDS.general,
  ];
}
