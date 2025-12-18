/**
 * Funnel Scenario Designer
 *
 * Vision AI와 GA4 config를 활용하여 이커머스 퍼널 시나리오를 설계합니다.
 * 핵심: 퍼널 전체에서 동일한 item 파라미터가 일관되게 유지되어야 함
 */

import {
  getParametersForEvent,
  getScreenExtractableParams,
  GA4ParameterDefinition,
  EVENT_PARAMETER_REQUIREMENTS,
} from '../config/ga4ParameterConfig';
import {
  ECOMMERCE_FUNNEL_ORDER,
} from '../types/parameterPrediction';

// ═══════════════════════════════════════════════════════════════════════════
// 시나리오 타입 정의
// ═══════════════════════════════════════════════════════════════════════════

/** 퍼널 단계별 시나리오 */
export interface FunnelStepScenario {
  /** 이벤트 이름 */
  eventName: string;

  /** 페이지 타입 */
  pageType: string;

  /** 액션 설명 */
  action: string;

  /** Vision AI로 추출할 파라미터 */
  visionExtractParams: {
    key: string;
    displayName: string;
    extractionHint: string;
  }[];

  /** 이 단계에서 필수로 전송되어야 할 item 파라미터 */
  requiredItemParams: string[];

  /** 이전 단계와 동일해야 할 파라미터 (일관성 체크) */
  mustMatchPreviousStep: string[];
}

/** 전체 퍼널 시나리오 */
export interface FunnelScenario {
  /** 시나리오 이름 */
  name: string;

  /** 설명 */
  description: string;

  /** 퍼널 단계 순서 */
  steps: FunnelStepScenario[];

  /** 퍼널 전체에서 일관되어야 할 핵심 파라미터 */
  consistencyRules: {
    /** 절대 변경 불가 (CRITICAL) */
    immutable: string[];

    /** 일관성 권장 (WARNING) */
    recommended: string[];

    /** 변경 허용 (INFO) */
    allowChange: string[];
  };

  /** 검증 규칙 */
  validationRules: {
    param: string;
    rule: string;
    severity: 'CRITICAL' | 'WARNING' | 'INFO';
  }[];
}

// ═══════════════════════════════════════════════════════════════════════════
// 시나리오 디자이너
// ═══════════════════════════════════════════════════════════════════════════

export class FunnelScenarioDesigner {
  /**
   * 기본 이커머스 퍼널 시나리오를 생성합니다.
   */
  static createDefaultEcommerceFunnel(): FunnelScenario {
    return {
      name: 'Standard Ecommerce Funnel',
      description: 'view_item → add_to_cart → begin_checkout → purchase 표준 퍼널',

      steps: [
        {
          eventName: 'view_item',
          pageType: 'PRODUCT_DETAIL',
          action: '상품 상세 페이지 조회',
          visionExtractParams: [
            { key: 'item_name', displayName: '상품명', extractionHint: '상품 제목 영역의 큰 글씨' },
            { key: 'item_id', displayName: '상품코드', extractionHint: 'URL의 상품코드 또는 페이지 내 SKU' },
            { key: 'item_brand', displayName: '브랜드', extractionHint: '상품명 위/옆의 브랜드 로고나 텍스트' },
            { key: 'price', displayName: '가격', extractionHint: '현재 판매가 (할인가 우선)' },
            { key: 'item_category', displayName: '카테고리', extractionHint: '브레드크럼의 카테고리 경로' },
          ],
          requiredItemParams: ['item_id', 'item_name', 'price'],
          mustMatchPreviousStep: [], // 첫 단계
        },
        {
          eventName: 'add_to_cart',
          pageType: 'PRODUCT_DETAIL',
          action: '장바구니 추가 버튼 클릭',
          visionExtractParams: [
            { key: 'item_name', displayName: '상품명', extractionHint: '장바구니에 담긴 상품명' },
            { key: 'quantity', displayName: '수량', extractionHint: '수량 선택 영역의 숫자' },
          ],
          requiredItemParams: ['item_id', 'item_name', 'price', 'quantity'],
          mustMatchPreviousStep: ['item_id', 'item_name', 'item_brand', 'price', 'item_category'],
        },
        {
          eventName: 'begin_checkout',
          pageType: 'CHECKOUT',
          action: '결제 페이지 진입',
          visionExtractParams: [
            { key: 'item_name', displayName: '상품명', extractionHint: '주문 상품 목록의 상품명' },
            { key: 'quantity', displayName: '수량', extractionHint: '주문 수량' },
            { key: 'price', displayName: '가격', extractionHint: '상품 가격' },
          ],
          requiredItemParams: ['item_id', 'item_name', 'price', 'quantity'],
          mustMatchPreviousStep: ['item_id', 'item_name', 'item_brand', 'price', 'item_category', 'quantity'],
        },
        {
          eventName: 'purchase',
          pageType: 'ORDER_COMPLETE',
          action: '구매 완료',
          visionExtractParams: [
            { key: 'item_name', displayName: '상품명', extractionHint: '주문 완료 페이지의 상품명' },
            { key: 'transaction_id', displayName: '주문번호', extractionHint: '주문번호/결제번호' },
          ],
          requiredItemParams: ['item_id', 'item_name', 'price', 'quantity'],
          mustMatchPreviousStep: ['item_id', 'item_name', 'item_brand', 'price', 'item_category', 'quantity'],
        },
      ],

      consistencyRules: {
        // 절대 변경 불가 - 변경 시 다른 상품으로 인식됨
        immutable: [
          'item_id',
          'item_name',
          'item_brand',
        ],
        // 일관성 권장 - 변경 시 경고
        recommended: [
          'item_category',
          'item_category2',
          'item_category3',
          'item_variant',
          'price',  // 할인 적용으로 변경 가능하나 일관성 권장
        ],
        // 변경 허용 - 정상적인 변경
        allowChange: [
          'quantity',   // 수량 변경 가능
          'discount',   // 쿠폰 적용으로 추가 가능
          'coupon',     // 쿠폰 적용 시 추가
          'index',      // 목록 위치는 변경 가능
        ],
      },

      validationRules: [
        { param: 'item_id', rule: 'MUST_NOT_CHANGE', severity: 'CRITICAL' },
        { param: 'item_name', rule: 'MUST_NOT_CHANGE', severity: 'CRITICAL' },
        { param: 'item_brand', rule: 'MUST_NOT_CHANGE', severity: 'CRITICAL' },
        { param: 'price', rule: 'SHOULD_NOT_CHANGE', severity: 'WARNING' },
        { param: 'item_category', rule: 'SHOULD_NOT_CHANGE', severity: 'WARNING' },
        { param: 'quantity', rule: 'CAN_CHANGE', severity: 'INFO' },
      ],
    };
  }

  /**
   * Vision AI 프롬프트용 시나리오 설명을 생성합니다.
   */
  static generateVisionPromptForScenario(scenario: FunnelScenario): string {
    let prompt = `# ${scenario.name}\n\n`;
    prompt += `${scenario.description}\n\n`;

    prompt += `## 퍼널 단계별 추출 가이드\n\n`;

    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      prompt += `### Step ${i + 1}: ${step.eventName} (${step.pageType})\n`;
      prompt += `**액션**: ${step.action}\n\n`;
      prompt += `**추출할 파라미터**:\n`;

      for (const param of step.visionExtractParams) {
        prompt += `- **${param.key}** (${param.displayName}): ${param.extractionHint}\n`;
      }

      if (step.mustMatchPreviousStep.length > 0) {
        prompt += `\n**⚠️ 이전 단계와 일치해야 함**:\n`;
        for (const param of step.mustMatchPreviousStep) {
          prompt += `- ${param}\n`;
        }
      }

      prompt += `\n`;
    }

    prompt += `## 일관성 규칙\n\n`;
    prompt += `### 🔴 절대 변경 불가 (CRITICAL)\n`;
    prompt += `${scenario.consistencyRules.immutable.join(', ')}\n\n`;
    prompt += `### 🟡 일관성 권장 (WARNING)\n`;
    prompt += `${scenario.consistencyRules.recommended.join(', ')}\n\n`;
    prompt += `### 🟢 변경 허용 (INFO)\n`;
    prompt += `${scenario.consistencyRules.allowChange.join(', ')}\n`;

    return prompt;
  }

  /**
   * GA4 config에서 이벤트별 파라미터 정보를 가져와 시나리오에 매핑합니다.
   */
  static enrichScenarioWithGA4Config(scenario: FunnelScenario): FunnelScenario {
    const enrichedSteps = scenario.steps.map(step => {
      const { required, optional, item } = getParametersForEvent(step.eventName);
      const screenExtractable = getScreenExtractableParams(step.eventName);

      // Vision AI로 추출 가능한 파라미터 추가
      const visionParams = screenExtractable.map(param => ({
        key: param.key,
        displayName: param.displayName,
        extractionHint: param.visionHint?.locationHint || param.description,
      }));

      return {
        ...step,
        visionExtractParams: [
          ...step.visionExtractParams,
          ...visionParams.filter(vp =>
            !step.visionExtractParams.some(existing => existing.key === vp.key)
          ),
        ],
        requiredItemParams: [
          ...step.requiredItemParams,
          ...item.filter(p => p.key).map(p => p.key),
        ].filter((v, i, a) => a.indexOf(v) === i), // 중복 제거
      };
    });

    return {
      ...scenario,
      steps: enrichedSteps,
    };
  }

  /**
   * 시나리오 기반 검증 체크리스트를 생성합니다.
   */
  static generateValidationChecklist(scenario: FunnelScenario): string {
    let checklist = `# ${scenario.name} 검증 체크리스트\n\n`;

    checklist += `## 퍼널 단계별 체크\n\n`;

    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      checklist += `### ☐ Step ${i + 1}: ${step.eventName}\n`;
      checklist += `- 페이지: ${step.pageType}\n`;
      checklist += `- 액션: ${step.action}\n`;
      checklist += `- 필수 파라미터:\n`;
      for (const param of step.requiredItemParams) {
        checklist += `  - ☐ ${param}\n`;
      }
      if (i > 0 && step.mustMatchPreviousStep.length > 0) {
        checklist += `- 이전 단계와 일치 확인:\n`;
        for (const param of step.mustMatchPreviousStep) {
          checklist += `  - ☐ ${param} === Step ${i}의 ${param}\n`;
        }
      }
      checklist += `\n`;
    }

    checklist += `## 일관성 검증\n\n`;
    checklist += `### CRITICAL (반드시 확인)\n`;
    for (const param of scenario.consistencyRules.immutable) {
      checklist += `- ☐ ${param}: 모든 단계에서 동일한가?\n`;
    }

    checklist += `\n### WARNING (권장 확인)\n`;
    for (const param of scenario.consistencyRules.recommended) {
      checklist += `- ☐ ${param}: 변경 시 의도된 것인가?\n`;
    }

    return checklist;
  }

  /**
   * 시나리오 요약을 출력합니다.
   */
  static printScenarioSummary(scenario: FunnelScenario): void {
    console.log('\n' + '═'.repeat(70));
    console.log(`📋 시나리오: ${scenario.name}`);
    console.log('═'.repeat(70));
    console.log(`\n${scenario.description}\n`);

    console.log('📍 퍼널 단계:');
    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      console.log(`   ${i + 1}. ${step.eventName} (${step.pageType})`);
      console.log(`      액션: ${step.action}`);
      console.log(`      Vision 추출: ${step.visionExtractParams.map(p => p.key).join(', ')}`);
      console.log(`      필수 item: ${step.requiredItemParams.join(', ')}`);
      if (step.mustMatchPreviousStep.length > 0) {
        console.log(`      ⚠️ 일치 필요: ${step.mustMatchPreviousStep.join(', ')}`);
      }
    }

    console.log('\n🔒 일관성 규칙:');
    console.log(`   🔴 절대 불변: ${scenario.consistencyRules.immutable.join(', ')}`);
    console.log(`   🟡 권장 일관: ${scenario.consistencyRules.recommended.join(', ')}`);
    console.log(`   🟢 변경 허용: ${scenario.consistencyRules.allowChange.join(', ')}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 시나리오 템플릿
// ═══════════════════════════════════════════════════════════════════════════

/** 미리 정의된 시나리오 템플릿 */
export const SCENARIO_TEMPLATES = {
  /** 기본 구매 퍼널 */
  STANDARD_PURCHASE: FunnelScenarioDesigner.createDefaultEcommerceFunnel(),

  /** 상품 목록 → 상세 → 구매 퍼널 */
  LIST_TO_PURCHASE: {
    name: 'Product List to Purchase Funnel',
    description: 'select_item → view_item → add_to_cart → purchase',
    steps: [
      {
        eventName: 'select_item',
        pageType: 'PRODUCT_LIST',
        action: '상품 목록에서 상품 클릭',
        visionExtractParams: [
          { key: 'item_name', displayName: '상품명', extractionHint: '클릭한 상품의 이름' },
          { key: 'item_list_name', displayName: '목록명', extractionHint: '상품 목록/카테고리 이름' },
          { key: 'index', displayName: '위치', extractionHint: '목록에서의 순서 (1부터)' },
        ],
        requiredItemParams: ['item_id', 'item_name', 'item_list_name', 'index'],
        mustMatchPreviousStep: [],
      },
      {
        eventName: 'view_item',
        pageType: 'PRODUCT_DETAIL',
        action: '상품 상세 페이지 조회',
        visionExtractParams: [
          { key: 'item_name', displayName: '상품명', extractionHint: '상품 제목' },
          { key: 'price', displayName: '가격', extractionHint: '판매가' },
        ],
        requiredItemParams: ['item_id', 'item_name', 'price'],
        mustMatchPreviousStep: ['item_id', 'item_name'],
      },
      {
        eventName: 'add_to_cart',
        pageType: 'PRODUCT_DETAIL',
        action: '장바구니 추가',
        visionExtractParams: [],
        requiredItemParams: ['item_id', 'item_name', 'price', 'quantity'],
        mustMatchPreviousStep: ['item_id', 'item_name', 'item_brand', 'price'],
      },
      {
        eventName: 'purchase',
        pageType: 'ORDER_COMPLETE',
        action: '구매 완료',
        visionExtractParams: [],
        requiredItemParams: ['item_id', 'item_name', 'price', 'quantity'],
        mustMatchPreviousStep: ['item_id', 'item_name', 'item_brand', 'price', 'quantity'],
      },
    ],
    consistencyRules: {
      immutable: ['item_id', 'item_name', 'item_brand'],
      recommended: ['price', 'item_category'],
      allowChange: ['quantity', 'index', 'item_list_name'],
    },
    validationRules: [],
  } as FunnelScenario,
};

export default FunnelScenarioDesigner;
