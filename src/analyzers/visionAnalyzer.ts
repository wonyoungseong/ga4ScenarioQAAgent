import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import { SpecLoader } from '../loaders/specLoader';
import {
  ParameterValuePrediction,
  PredictedParameterValue,
  PredictedItemParameter,
  ParameterExtractionContext,
  ConfidenceLevel,
} from '../types/parameterPrediction';
import {
  FunnelScenarioDesigner,
  FunnelScenario,
  FunnelStepScenario,
  SCENARIO_TEMPLATES,
} from '../scenario/funnelScenarioDesigner';

export interface VisionAnalysisResult {
  shouldFire: VisionScenario[];
  shouldNotFire: VisionScenario[];
  reasoning: string;
  gtmAnalysis?: string;  // GTM 트리거 분석 결과
  parameterInfo?: string;  // 파라미터 스펙 정보
}

export interface GTMContext {
  triggerDescription: string;  // GTM 트리거 조건 설명
  cssSelectors: string[];      // 트리거에 사용된 CSS Selector
  matchedElements: string;     // DOM에서 찾은 요소들 설명
}

/**
 * Vision AI가 화면에서 추출한 시각적 콘텐츠
 */
export interface ExtractedVisualContent {
  /** 화면에 보이는 이름 (제품명/프로모션명) */
  displayedName?: string;
  /** 화면에 보이는 가격 */
  displayedPrice?: number;
  /** 화면에 보이는 원가 (할인 전) */
  displayedOriginalPrice?: number;
  /** 화면에 보이는 할인율 */
  displayedDiscountRate?: number;
  /** 화면에 보이는 브랜드명 */
  displayedBrand?: string;
  /** 화면에 보이는 프로모션 문구 */
  displayedPromotionText?: string;
  /** 화면에 보이는 위치/슬롯 */
  displayedPosition?: string;
  /** 추출 확신도 */
  extractionConfidence: 'high' | 'medium' | 'low';
}

/**
 * 기대되는 데이터 값 (화면 기반)
 */
export interface ExpectedDataFromVision {
  /** GA4 파라미터명 */
  paramName: string;
  /** 화면에서 추출한 예상 값 */
  expectedValue: string | number;
  /** 추출 근거 */
  extractionSource: string;
  /** 검증 필수 여부 */
  mustValidate: boolean;
}

export interface VisionScenario {
  elementDescription: string;
  location: string;
  action: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /**
   * Vision AI가 화면에서 추출한 시각적 콘텐츠
   * 데이터 정확성 검증에 사용
   */
  visualContent?: ExtractedVisualContent;
  /**
   * 기대되는 데이터 값 목록
   * 화면에서 보이는 값을 기반으로 수집되어야 할 데이터의 예상 값
   */
  expectedDataValues?: ExpectedDataFromVision[];
}

// ═══════════════════════════════════════════════════════════════════════════
// 퍼널 시나리오 분석 타입
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 퍼널 단계 분석 결과
 */
export interface FunnelStepAnalysisResult {
  /** 분석한 이벤트 이름 */
  eventName: string;
  /** 페이지 타입 */
  pageType: string;
  /** 분석 타임스탬프 */
  timestamp: string;
  /** 추출된 item 파라미터 */
  extractedItems: ExtractedFunnelItem[];
  /** 퍼널 일관성 체크 결과 (이전 단계와 비교) */
  consistencyCheck?: FunnelConsistencyCheck;
  /** 분석 추론 */
  reasoning: string;
}

/**
 * 퍼널에서 추출된 아이템
 */
export interface ExtractedFunnelItem {
  /** 아이템 파라미터 */
  params: Record<string, {
    value: string | number | null;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    sourceLocation: string;
  }>;
  /** 추출 성공 여부 */
  extractionSuccess: boolean;
  /** 누락된 필수 파라미터 */
  missingRequired: string[];
}

/**
 * 퍼널 일관성 체크 결과
 */
export interface FunnelConsistencyCheck {
  /** 전체 일관성 통과 */
  passed: boolean;
  /** 파라미터별 체크 결과 */
  paramChecks: {
    param: string;
    previousValue: string | number | null;
    currentValue: string | number | null;
    match: boolean;
    severity: 'CRITICAL' | 'WARNING' | 'INFO';
    message: string;
  }[];
  /** CRITICAL 불일치 수 */
  criticalMismatches: number;
  /** WARNING 불일치 수 */
  warningMismatches: number;
}

/**
 * 전체 퍼널 분석 결과
 */
export interface FunnelAnalysisResult {
  /** 시나리오 이름 */
  scenarioName: string;
  /** 분석 시작 시간 */
  startTime: string;
  /** 분석 완료 시간 */
  endTime: string;
  /** 각 단계별 결과 */
  stepResults: FunnelStepAnalysisResult[];
  /** 전체 퍼널 일관성 요약 */
  overallConsistency: {
    passed: boolean;
    totalSteps: number;
    criticalIssues: number;
    warningIssues: number;
    summary: string;
  };
  /** 추적된 아이템 목록 (item_id 기준) */
  trackedItems: Map<string, {
    item_id: string;
    valuesByStep: Map<string, Record<string, any>>;
    consistencyIssues: string[];
  }>;
}

export class GeminiVisionAnalyzer {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private guidesDir: string;
  private specLoader: SpecLoader | null;
  private currentSiteId: string | null = null;

  constructor(apiKey: string, guidesDir: string = './guides', specLoader?: SpecLoader) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash', // 최신 안정 버전
    });
    this.guidesDir = guidesDir;
    this.specLoader = specLoader || null;
  }

  /**
   * 현재 사이트 ID 설정
   */
  setSiteId(siteId: string): void {
    this.currentSiteId = siteId;
  }

  /**
   * 파라미터 스펙 프롬프트 생성
   */
  private getParamSpecPrompt(eventName: string): string {
    if (!this.specLoader || !this.currentSiteId) {
      return '';
    }

    try {
      return this.specLoader.generateParamPrompt(this.currentSiteId, eventName);
    } catch (e) {
      console.warn(`파라미터 스펙 로드 실패: ${e}`);
      return '';
    }
  }

  private loadGuide(eventName: string): string {
    const guidePath = path.join(this.guidesDir, `${eventName}.md`);

    if (!fs.existsSync(guidePath)) {
      throw new Error(`가이드 파일을 찾을 수 없습니다: ${guidePath}`);
    }

    return fs.readFileSync(guidePath, 'utf-8');
  }

  private async imageToBase64(imagePath: string): Promise<string> {
    const imageBuffer = fs.readFileSync(imagePath);
    return imageBuffer.toString('base64');
  }

  private getMimeType(imagePath: string): string {
    const ext = path.extname(imagePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };
    return mimeTypes[ext] || 'image/png';
  }

  async analyzeScreenshot(
    screenshotPath: string,
    eventName: string,
    pageUrl: string,
    siteId?: string
  ): Promise<VisionAnalysisResult> {
    // siteId가 전달되면 설정
    if (siteId) {
      this.currentSiteId = siteId;
    }

    const guide = this.loadGuide(eventName);
    const paramSpec = this.getParamSpecPrompt(eventName);
    const imageBase64 = await this.imageToBase64(screenshotPath);
    const mimeType = this.getMimeType(screenshotPath);

    let systemPrompt = `당신은 QA 자동화를 위한 이벤트 시나리오 분석 전문가입니다.
웹 페이지 스크린샷을 보고, 특정 이벤트가 발생해야 하는 요소와 발생하면 안 되는 요소를 시각적으로 판단합니다.

## 분석 대상 이벤트
${eventName}

## 이벤트 가이드
${guide}

## 분석 규칙
1. 스크린샷을 사람의 눈으로 보듯이 시각적으로 분석하세요.
2. 코드나 DOM 구조가 아닌, 화면에 보이는 요소를 기준으로 판단하세요.
3. 각 요소의 위치를 구체적으로 설명하세요 (예: "상단 중앙", "왼쪽 사이드바", "메인 콘텐츠 영역 첫 번째 행")
4. 판단의 근거를 명확히 설명하세요.
5. 확신도(confidence)를 high/medium/low로 표시하세요.`;

    // 파라미터 스펙이 있으면 추가
    if (paramSpec) {
      systemPrompt += `\n\n${paramSpec}`;
    }

    const userPrompt = `## 분석할 페이지
URL: ${pageUrl}

## 요청
이 스크린샷을 분석하여 ${eventName} 이벤트에 대한 시나리오를 생성해주세요.

다음 JSON 형식으로 응답해주세요:
\`\`\`json
{
  "shouldFire": [
    {
      "elementDescription": "요소에 대한 시각적 설명",
      "location": "화면에서의 위치 (예: 메인 콘텐츠 영역 첫 번째 제품)",
      "action": "사용자 행동 설명 (예: 제품 카드 클릭)",
      "reason": "이 요소가 해당 이벤트를 발생시켜야 하는 이유",
      "confidence": "high|medium|low"
    }
  ],
  "shouldNotFire": [
    {
      "elementDescription": "요소에 대한 시각적 설명",
      "location": "화면에서의 위치",
      "action": "사용자 행동 설명",
      "reason": "이 요소가 해당 이벤트를 발생시키면 안 되는 이유",
      "confidence": "high|medium|low"
    }
  ],
  "reasoning": "전체적인 분석 요약 및 페이지 구조에 대한 이해"
}
\`\`\`

중요:
- 실제로 화면에 보이는 요소만 분석하세요.
- 추측하지 말고, 보이는 것만 판단하세요.
- 각 카테고리에 최소 3개 이상의 시나리오를 포함하세요.`;

    try {
      const result = await this.model.generateContent([
        {
          inlineData: {
            mimeType,
            data: imageBase64,
          },
        },
        { text: systemPrompt + '\n\n' + userPrompt },
      ]);

      const response = result.response;
      const text = response.text();

      // JSON 파싱
      const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/);
      if (!jsonMatch) {
        // JSON 블록이 없으면 전체 텍스트에서 JSON 찾기
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const jsonStr = text.substring(jsonStart, jsonEnd + 1);
          return JSON.parse(jsonStr);
        }
        throw new Error('응답에서 JSON을 찾을 수 없습니다.');
      }

      return JSON.parse(jsonMatch[1]);
    } catch (error: any) {
      console.error('Vision 분석 오류:', error.message);
      throw error;
    }
  }

  getAvailableEvents(): string[] {
    const files = fs.readdirSync(this.guidesDir);
    return files
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''));
  }

  /**
   * GTM 트리거 조건과 DOM 분석 결과를 바탕으로 시나리오를 분석합니다.
   * AI가 GTM → DOM → 화면의 추론 과정을 스스로 수행합니다.
   */
  async analyzeWithGTMContext(
    screenshotPath: string,
    eventName: string,
    pageUrl: string,
    gtmContext: GTMContext,
    siteId?: string
  ): Promise<VisionAnalysisResult> {
    // siteId가 전달되면 설정
    if (siteId) {
      this.currentSiteId = siteId;
    }

    const guide = this.loadGuide(eventName);
    const paramSpec = this.getParamSpecPrompt(eventName);
    const imageBase64 = await this.imageToBase64(screenshotPath);
    const mimeType = this.getMimeType(screenshotPath);

    let systemPrompt = `당신은 QA 자동화를 위한 이벤트 시나리오 분석 전문가입니다.

## 당신의 역할
GTM(Google Tag Manager) 트리거 조건을 분석하고, DOM에서 해당 조건에 맞는 요소를 찾고,
스크린샷에서 그 요소의 위치와 시각적 특징을 설명하는 것입니다.

## 핵심 추론 과정
1. **GTM 트리거 분석**: 어떤 조건에서 이벤트가 발생하는지 이해
2. **DOM 매칭 확인**: 해당 조건에 맞는 요소가 페이지에 존재하는지 확인
3. **시각적 위치 파악**: 스크린샷에서 해당 요소가 어디에 있는지 식별
4. **시나리오 도출**: 이 요소를 클릭했을 때 이벤트가 발생해야 하는지 판단

## 중요한 원칙
- **GTM 트리거 조건이 진실의 기준입니다**
- 시각적으로 프로모션/상품처럼 보여도, GTM 트리거 조건에 해당하지 않으면 이벤트가 발생하지 않습니다
- DOM에서 찾은 요소만이 실제로 이벤트를 발생시킬 수 있습니다`;

    // 파라미터 스펙이 있으면 추가
    if (paramSpec) {
      systemPrompt += `\n\n${paramSpec}`;
    }

    const userPrompt = `## 분석 대상 이벤트
${eventName}

## GTM 트리거 조건 (실제 구현)
${gtmContext.triggerDescription}

### 트리거 CSS Selector
${gtmContext.cssSelectors.map(s => `- \`${s}\``).join('\n')}

## DOM 분석 결과 (위 Selector로 찾은 요소들)
${gtmContext.matchedElements}

## 이벤트 가이드 (참고용)
${guide}

## 분석할 페이지
URL: ${pageUrl}

## 요청
위의 GTM 트리거 조건과 DOM 분석 결과를 바탕으로, 스크린샷을 분석하세요.

### 추론 과정을 보여주세요:
1. GTM 트리거 조건 \`${gtmContext.cssSelectors.join(', ')}\`가 의미하는 것
2. DOM에서 찾은 요소들이 스크린샷 어디에 위치하는지
3. 해당 요소 클릭 시 ${eventName} 이벤트가 발생해야 하는 이유
4. 다른 요소들(시각적으로 비슷해 보여도)은 왜 이벤트가 발생하면 안 되는지

다음 JSON 형식으로 응답해주세요:
\`\`\`json
{
  "shouldFire": [
    {
      "elementDescription": "GTM 조건에 매칭되는 요소의 시각적 설명",
      "location": "스크린샷에서의 정확한 위치",
      "action": "사용자 행동 설명",
      "reason": "GTM 트리거 조건에 해당하는 이유 (CSS Selector 기준)",
      "confidence": "high",
      "visualContent": {
        "displayedName": "화면에 표시된 제품명 또는 프로모션명 (정확히 읽어주세요)",
        "displayedPrice": 숫자만 (예: 45000),
        "displayedOriginalPrice": 할인 전 원가 숫자 (있는 경우),
        "displayedDiscountRate": 할인율 숫자 (예: 20),
        "displayedBrand": "화면에 표시된 브랜드명",
        "displayedPromotionText": "프로모션 문구 (예: '첫 구매 20% 할인')",
        "displayedPosition": "화면에서의 위치 설명 (예: '첫 번째 상품', '메인 배너')",
        "extractionConfidence": "high|medium|low"
      },
      "expectedDataValues": [
        {
          "paramName": "item_name 또는 promotion_name 등 GA4 파라미터명",
          "expectedValue": "화면에서 읽은 실제 값",
          "extractionSource": "화면의 어디에서 추출했는지 (예: '상품 카드 제목')",
          "mustValidate": true
        }
      ]
    }
  ],
  "shouldNotFire": [
    {
      "elementDescription": "GTM 조건에 매칭되지 않는 요소",
      "location": "스크린샷에서의 위치",
      "action": "사용자 행동 설명",
      "reason": "GTM 트리거 조건에 해당하지 않는 이유 (시각적으로 비슷해도)",
      "confidence": "high"
    }
  ],
  "reasoning": "GTM 트리거 분석 → DOM 매칭 → 시각적 위치 파악의 전체 추론 과정",
  "gtmAnalysis": "GTM 트리거 조건에 대한 해석과 이해"
}
\`\`\`

## 중요: 데이터 정확성 검증을 위한 시각적 콘텐츠 추출

**shouldFire 요소에 대해 반드시 visualContent와 expectedDataValues를 포함해주세요.**

이 정보는 나중에 실제 수집된 데이터와 비교하여 데이터 정확성을 검증하는 데 사용됩니다.
예를 들어:
- 화면에 "설화수 윤조에센스"가 표시되면 → item_name은 "설화수 윤조에센스"여야 함
- 화면에 "45,000원"이 표시되면 → price는 45000이어야 함
- 화면에 "20% 할인"이 표시되면 → discount 관련 값이 20이어야 함

만약 데이터가 잘못 선언되어 있다면 (예: 화면에 "바나나"인데 데이터는 "strawberry"),
이 정보를 통해 오류를 감지할 수 있습니다.

중요:
- shouldFire에는 GTM 트리거 조건에 정확히 매칭되는 요소만 포함
- shouldNotFire에는 시각적으로 비슷해 보이지만 GTM 조건에 맞지 않는 요소 포함
- 추론 과정을 reasoning에 명확히 설명
- **화면에 보이는 텍스트, 가격, 브랜드 등을 정확히 읽어서 visualContent에 기록**`;

    try {
      const result = await this.model.generateContent([
        {
          inlineData: {
            mimeType,
            data: imageBase64,
          },
        },
        { text: systemPrompt + '\n\n' + userPrompt },
      ]);

      const response = result.response;
      const text = response.text();

      // JSON 파싱
      const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/);
      if (!jsonMatch) {
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const jsonStr = text.substring(jsonStart, jsonEnd + 1);
          return JSON.parse(jsonStr);
        }
        throw new Error('응답에서 JSON을 찾을 수 없습니다.');
      }

      return JSON.parse(jsonMatch[1]);
    } catch (error: any) {
      console.error('Vision 분석 오류:', error.message);
      throw error;
    }
  }

  /**
   * 스크린샷에서 GA4 파라미터 값을 추출합니다.
   *
   * @param screenshotPath 스크린샷 경로
   * @param context 파라미터 추출 컨텍스트 (이벤트, 페이지 타입, 추출할 파라미터 목록)
   * @param pageUrl 페이지 URL
   * @returns 예측된 파라미터 값
   */
  async extractParameterValues(
    screenshotPath: string,
    context: ParameterExtractionContext,
    pageUrl: string
  ): Promise<ParameterValuePrediction> {
    const imageBase64 = await this.imageToBase64(screenshotPath);
    const mimeType = this.getMimeType(screenshotPath);

    // 파라미터 목록을 프롬프트 형식으로 변환
    const paramsForPrompt = context.parametersToExtract.map(p => {
      let desc = `- ${p.name} (${p.description})`;
      if (p.extractionHint) {
        desc += ` [힌트: ${p.extractionHint}]`;
      }
      if (p.required) {
        desc += ' *필수*';
      }
      return desc;
    }).join('\n');

    // 사이트별 규칙 프롬프트
    const siteRulesPrompt = context.siteSpecificRules
      ? context.siteSpecificRules.map(r => `- ${r.rule}: ${r.description}`).join('\n')
      : '';

    const systemPrompt = `당신은 이커머스 웹페이지 스크린샷에서 GA4 이벤트 파라미터 값을 추출하는 전문가입니다.

## 역할
스크린샷을 시각적으로 분석하여 GA4 이벤트에 전송될 파라미터 값을 정확하게 추출합니다.

## 추출 규칙
1. 스크린샷에서 직접 보이는 텍스트를 그대로 추출하세요.
2. 가격은 숫자만 추출하세요 (₩, 원, 쉼표 제거). 예: "₩180,000" → 180000
3. 브랜드명은 로고나 텍스트에서 추출하세요.
4. 상품명은 표시된 전체 텍스트를 추출하세요 (말줄임 '...' 포함).
5. 각 값의 확신도를 HIGH/MEDIUM/LOW로 표시하세요.
6. 추출 위치(sourceLocation)를 명시하세요.

## 확신도 기준
- HIGH: 화면에 명확하게 표시되어 직접 읽을 수 있음
- MEDIUM: 컨텍스트로 유추 가능 (예: 브랜드명이 로고로만 표시)
- LOW: 불확실하지만 추론 가능

${siteRulesPrompt ? `## 사이트별 특수 규칙\n${siteRulesPrompt}` : ''}`;

    const userPrompt = `## 이벤트 정보
이벤트: ${context.eventName}
페이지 타입: ${context.pageType}
URL: ${pageUrl}

## 추출할 파라미터
${paramsForPrompt}

## 요청
위 스크린샷을 분석하여 각 파라미터의 값을 추출해주세요.

다음 JSON 형식으로 응답해주세요:
\`\`\`json
{
  "eventParams": {
    "currency": {
      "value": "KRW",
      "confidence": "HIGH",
      "source": "INFERENCE",
      "sourceLocation": "한국 사이트이므로 KRW로 추론"
    },
    "value": {
      "value": 180000,
      "confidence": "HIGH",
      "source": "OCR",
      "sourceLocation": "가격 표시 영역"
    }
  },
  "items": [
    {
      "item_name": {
        "value": "설화수 자음생크림",
        "confidence": "HIGH",
        "source": "OCR",
        "sourceLocation": "상품명 영역"
      },
      "item_id": {
        "value": "111070002290",
        "confidence": "HIGH",
        "source": "URL_PARAMETER",
        "sourceLocation": "URL의 onlineProdCode 파라미터"
      },
      "price": {
        "value": 180000,
        "confidence": "HIGH",
        "source": "OCR",
        "sourceLocation": "가격 표시 영역"
      },
      "item_brand": {
        "value": "설화수",
        "confidence": "HIGH",
        "source": "OCR",
        "sourceLocation": "브랜드명 영역"
      }
    }
  ]
}
\`\`\`

중요:
- 화면에 보이지 않는 값은 null로 표시하세요.
- 여러 상품이 보이면 items 배열에 모두 포함하세요.
- 단일 상품 페이지면 items에 하나만 포함하세요.
- source는 OCR(화면에서 직접 읽음), INFERENCE(추론), DOM_STRUCTURE(DOM 구조), URL_PARAMETER(URL에서), META_TAG(메타 태그) 중 하나입니다.`;

    try {
      const result = await this.model.generateContent([
        {
          inlineData: {
            mimeType,
            data: imageBase64,
          },
        },
        { text: systemPrompt + '\n\n' + userPrompt },
      ]);

      const response = result.response;
      const text = response.text();

      // JSON 파싱
      const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/);
      let parsed: any;

      if (!jsonMatch) {
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const jsonStr = text.substring(jsonStart, jsonEnd + 1);
          parsed = JSON.parse(jsonStr);
        } else {
          throw new Error('응답에서 JSON을 찾을 수 없습니다.');
        }
      } else {
        parsed = JSON.parse(jsonMatch[1]);
      }

      // 결과를 ParameterValuePrediction 형식으로 변환
      return this.convertToParameterPrediction(parsed, context.eventName);
    } catch (error: any) {
      console.error('파라미터 값 추출 오류:', error.message);
      throw error;
    }
  }

  /**
   * AI 응답을 ParameterValuePrediction 형식으로 변환합니다.
   */
  private convertToParameterPrediction(
    parsed: any,
    eventName: string
  ): ParameterValuePrediction {
    const result: ParameterValuePrediction = {
      eventName,
      timestamp: new Date().toISOString(),
      eventParams: {},
      items: [],
    };

    // Event-level 파라미터 변환
    if (parsed.eventParams) {
      for (const [key, val] of Object.entries(parsed.eventParams)) {
        if (val && typeof val === 'object') {
          const v = val as any;
          result.eventParams[key] = {
            value: v.value ?? null,
            confidence: this.normalizeConfidence(v.confidence),
            source: v.source || 'INFERENCE',
            sourceLocation: v.sourceLocation,
          };
        }
      }
    }

    // Item-level 파라미터 변환
    if (parsed.items && Array.isArray(parsed.items)) {
      result.items = parsed.items.map((item: any) => {
        const converted: PredictedItemParameter = {};

        for (const [key, val] of Object.entries(item)) {
          if (val && typeof val === 'object') {
            const v = val as any;
            converted[key] = {
              value: v.value ?? null,
              confidence: this.normalizeConfidence(v.confidence),
              source: v.source || 'INFERENCE',
              sourceLocation: v.sourceLocation,
            };
          }
        }

        return converted;
      });
    }

    return result;
  }

  /**
   * 확신도 문자열을 정규화합니다.
   */
  private normalizeConfidence(confidence: string | undefined): ConfidenceLevel {
    if (!confidence) return 'MEDIUM';

    const upper = confidence.toUpperCase();
    if (upper === 'HIGH') return 'HIGH';
    if (upper === 'LOW') return 'LOW';
    return 'MEDIUM';
  }

  /**
   * 이벤트별 기본 파라미터 추출 컨텍스트를 반환합니다.
   */
  getDefaultExtractionContext(eventName: string, pageType: string): ParameterExtractionContext {
    const contextMap: Record<string, ParameterExtractionContext> = {
      'view_item': {
        eventName: 'view_item',
        pageType,
        parametersToExtract: [
          { name: 'currency', description: '통화 코드', type: 'string', required: true },
          { name: 'value', description: '상품 가격', type: 'number', required: true, extractionHint: '숫자만 추출' },
          { name: 'item_name', description: '상품명', type: 'string', required: true },
          { name: 'item_id', description: '상품 ID', type: 'string', required: true, extractionHint: 'URL 또는 data 속성에서' },
          { name: 'item_brand', description: '브랜드명', type: 'string', required: false },
          { name: 'item_category', description: '상품 카테고리', type: 'string', required: false },
          { name: 'price', description: '상품 가격', type: 'number', required: true, extractionHint: '숫자만 추출' },
        ],
      },
      'add_to_cart': {
        eventName: 'add_to_cart',
        pageType,
        parametersToExtract: [
          { name: 'currency', description: '통화 코드', type: 'string', required: true },
          { name: 'value', description: '총 금액', type: 'number', required: true },
          { name: 'item_name', description: '상품명', type: 'string', required: true },
          { name: 'item_id', description: '상품 ID', type: 'string', required: true },
          { name: 'item_brand', description: '브랜드명', type: 'string', required: false },
          { name: 'price', description: '상품 가격', type: 'number', required: true },
          { name: 'quantity', description: '수량', type: 'number', required: true, extractionHint: '기본값 1' },
        ],
      },
      'select_item': {
        eventName: 'select_item',
        pageType,
        parametersToExtract: [
          { name: 'item_list_name', description: '상품 목록 이름', type: 'string', required: false },
          { name: 'item_name', description: '상품명', type: 'string', required: true },
          { name: 'item_id', description: '상품 ID', type: 'string', required: true },
          { name: 'item_brand', description: '브랜드명', type: 'string', required: false },
          { name: 'price', description: '상품 가격', type: 'number', required: false },
          { name: 'index', description: '목록에서의 위치', type: 'number', required: false },
        ],
      },
      'view_promotion': {
        eventName: 'view_promotion',
        pageType,
        parametersToExtract: [
          { name: 'promotion_id', description: '프로모션 ID', type: 'string', required: false },
          { name: 'promotion_name', description: '프로모션 이름', type: 'string', required: true },
          { name: 'creative_name', description: '크리에이티브 이름', type: 'string', required: false },
          { name: 'creative_slot', description: '슬롯 위치', type: 'string', required: false },
        ],
      },
      'select_promotion': {
        eventName: 'select_promotion',
        pageType,
        parametersToExtract: [
          { name: 'promotion_id', description: '프로모션 ID', type: 'string', required: false },
          { name: 'promotion_name', description: '프로모션 이름', type: 'string', required: true },
          { name: 'creative_name', description: '크리에이티브 이름', type: 'string', required: false },
          { name: 'creative_slot', description: '슬롯 위치', type: 'string', required: false },
        ],
      },
      'begin_checkout': {
        eventName: 'begin_checkout',
        pageType,
        parametersToExtract: [
          { name: 'currency', description: '통화 코드', type: 'string', required: true },
          { name: 'value', description: '총 금액', type: 'number', required: true },
          { name: 'coupon', description: '쿠폰 코드', type: 'string', required: false },
          { name: 'item_name', description: '상품명', type: 'string', required: true },
          { name: 'item_id', description: '상품 ID', type: 'string', required: true },
          { name: 'price', description: '상품 가격', type: 'number', required: true },
          { name: 'quantity', description: '수량', type: 'number', required: true },
        ],
      },
      'view_search_results': {
        eventName: 'view_search_results',
        pageType,
        parametersToExtract: [
          { name: 'search_term', description: '검색어', type: 'string', required: true },
        ],
      },
    };

    // 해당 이벤트의 컨텍스트가 있으면 반환, 없으면 기본 컨텍스트 생성
    if (contextMap[eventName]) {
      return contextMap[eventName];
    }

    // 기본 컨텍스트
    return {
      eventName,
      pageType,
      parametersToExtract: [
        { name: 'event_name', description: '이벤트 이름', type: 'string', required: true },
      ],
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 퍼널 시나리오 분석 메서드
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 사전 정의된 시나리오 템플릿을 반환합니다.
   */
  getScenarioTemplates(): Record<string, FunnelScenario> {
    return SCENARIO_TEMPLATES;
  }

  /**
   * 기본 이커머스 퍼널 시나리오를 가져옵니다.
   */
  getDefaultFunnelScenario(): FunnelScenario {
    return FunnelScenarioDesigner.enrichScenarioWithGA4Config(
      FunnelScenarioDesigner.createDefaultEcommerceFunnel()
    );
  }

  /**
   * 퍼널 단계에 대한 Vision AI 프롬프트를 생성합니다.
   */
  generateFunnelStepPrompt(
    step: FunnelStepScenario,
    scenario: FunnelScenario,
    previousStepResult?: FunnelStepAnalysisResult
  ): string {
    let prompt = `## 퍼널 시나리오 분석: ${scenario.name}\n\n`;
    prompt += `### 현재 단계: ${step.eventName} (${step.pageType})\n`;
    prompt += `액션: ${step.action}\n\n`;

    // 추출할 파라미터
    prompt += `## 추출할 파라미터\n`;
    for (const param of step.visionExtractParams) {
      prompt += `- **${param.key}** (${param.displayName}): ${param.extractionHint}\n`;
    }
    prompt += `\n`;

    // 필수 파라미터
    prompt += `## 필수 item 파라미터\n`;
    prompt += `다음 파라미터는 반드시 추출해야 합니다:\n`;
    prompt += step.requiredItemParams.map(p => `- ${p}`).join('\n');
    prompt += `\n\n`;

    // 이전 단계와의 일관성 체크
    if (previousStepResult && step.mustMatchPreviousStep.length > 0) {
      prompt += `## ⚠️ 이전 단계와 일치해야 하는 파라미터\n`;
      prompt += `이전 단계(${previousStepResult.eventName})에서 추출된 값과 일치해야 합니다:\n\n`;

      for (const param of step.mustMatchPreviousStep) {
        const prevItem = previousStepResult.extractedItems[0];
        if (prevItem && prevItem.params[param]) {
          prompt += `- **${param}**: 이전 값 = \`${prevItem.params[param].value}\`\n`;
        } else {
          prompt += `- **${param}**: 이전 값 없음 (새로 추출)\n`;
        }
      }
      prompt += `\n`;
    }

    // 일관성 규칙
    prompt += `## 일관성 규칙\n`;
    prompt += `🔴 **CRITICAL** (절대 변경 불가): ${scenario.consistencyRules.immutable.join(', ')}\n`;
    prompt += `🟡 **WARNING** (권장 일관): ${scenario.consistencyRules.recommended.join(', ')}\n`;
    prompt += `🟢 **INFO** (변경 허용): ${scenario.consistencyRules.allowChange.join(', ')}\n`;

    return prompt;
  }

  /**
   * 스크린샷에서 퍼널 단계의 파라미터를 추출합니다.
   */
  async analyzeFunnelStep(
    screenshotPath: string,
    step: FunnelStepScenario,
    scenario: FunnelScenario,
    pageUrl: string,
    previousStepResult?: FunnelStepAnalysisResult
  ): Promise<FunnelStepAnalysisResult> {
    const imageBase64 = await this.imageToBase64(screenshotPath);
    const mimeType = this.getMimeType(screenshotPath);
    const stepPrompt = this.generateFunnelStepPrompt(step, scenario, previousStepResult);

    const systemPrompt = `당신은 이커머스 퍼널 시나리오 분석 전문가입니다.
스크린샷을 분석하여 GA4 이벤트 파라미터 값을 추출하고, 퍼널 일관성을 검증합니다.

## 핵심 역할
1. 화면에서 상품/주문 정보 추출
2. 이전 단계의 값과 일관성 확인
3. CRITICAL 파라미터(item_id, item_name, item_brand)는 반드시 동일해야 함

## 추출 규칙
- 가격: 숫자만 추출 (₩, 원, 쉼표 제거)
- 상품명: 화면에 표시된 그대로 추출
- 확신도: HIGH(명확히 보임), MEDIUM(컨텍스트로 추론), LOW(불확실)

${stepPrompt}`;

    const userPrompt = `## 분석 대상
URL: ${pageUrl}
이벤트: ${step.eventName}
페이지 타입: ${step.pageType}

## 요청
스크린샷을 분석하여 다음 JSON 형식으로 응답해주세요:

\`\`\`json
{
  "extractedItems": [
    {
      "params": {
        "item_id": {"value": "추출된 값", "confidence": "HIGH", "sourceLocation": "추출 위치"},
        "item_name": {"value": "추출된 값", "confidence": "HIGH", "sourceLocation": "추출 위치"},
        "item_brand": {"value": "추출된 값", "confidence": "MEDIUM", "sourceLocation": "추출 위치"},
        "price": {"value": 숫자, "confidence": "HIGH", "sourceLocation": "추출 위치"}
      },
      "extractionSuccess": true,
      "missingRequired": []
    }
  ],
  "reasoning": "분석 과정 및 추론 설명"
}
\`\`\`

중요:
- 화면에 보이는 모든 상품을 extractedItems 배열에 포함
- 추출하지 못한 필수 파라미터는 missingRequired에 기록
- 각 파라미터의 추출 위치(sourceLocation)를 명시`;

    try {
      const result = await this.model.generateContent([
        { inlineData: { mimeType, data: imageBase64 } },
        { text: systemPrompt + '\n\n' + userPrompt },
      ]);

      const text = result.response.text();
      const parsed = this.parseJsonResponse(text);

      // 일관성 체크 수행
      let consistencyCheck: FunnelConsistencyCheck | undefined;
      if (previousStepResult && step.mustMatchPreviousStep.length > 0) {
        consistencyCheck = this.checkFunnelConsistency(
          parsed.extractedItems,
          previousStepResult.extractedItems,
          step.mustMatchPreviousStep,
          scenario.consistencyRules
        );
      }

      return {
        eventName: step.eventName,
        pageType: step.pageType,
        timestamp: new Date().toISOString(),
        extractedItems: parsed.extractedItems || [],
        consistencyCheck,
        reasoning: parsed.reasoning || '',
      };
    } catch (error: any) {
      console.error(`퍼널 단계 분석 오류 (${step.eventName}):`, error.message);
      throw error;
    }
  }

  /**
   * 퍼널 일관성을 체크합니다.
   */
  private checkFunnelConsistency(
    currentItems: ExtractedFunnelItem[],
    previousItems: ExtractedFunnelItem[],
    paramsToCheck: string[],
    consistencyRules: FunnelScenario['consistencyRules']
  ): FunnelConsistencyCheck {
    const paramChecks: FunnelConsistencyCheck['paramChecks'] = [];
    let criticalMismatches = 0;
    let warningMismatches = 0;

    // 첫 번째 아이템 기준으로 비교 (단일 상품 시나리오 가정)
    const currentItem = currentItems[0];
    const previousItem = previousItems[0];

    if (!currentItem || !previousItem) {
      return {
        passed: false,
        paramChecks: [],
        criticalMismatches: 1,
        warningMismatches: 0,
      };
    }

    for (const param of paramsToCheck) {
      const prevValue = previousItem.params[param]?.value ?? null;
      const currValue = currentItem.params[param]?.value ?? null;

      // 값 비교 (정규화된 비교)
      const match = this.compareValues(prevValue, currValue);

      // 심각도 결정
      let severity: 'CRITICAL' | 'WARNING' | 'INFO' = 'INFO';
      if (consistencyRules.immutable.includes(param)) {
        severity = 'CRITICAL';
        if (!match) criticalMismatches++;
      } else if (consistencyRules.recommended.includes(param)) {
        severity = 'WARNING';
        if (!match) warningMismatches++;
      }

      let message = match
        ? `✅ ${param} 일치`
        : `❌ ${param} 불일치: "${prevValue}" → "${currValue}"`;

      if (!match && severity === 'CRITICAL') {
        message = `🔴 CRITICAL: ${message}`;
      } else if (!match && severity === 'WARNING') {
        message = `🟡 WARNING: ${message}`;
      }

      paramChecks.push({
        param,
        previousValue: prevValue,
        currentValue: currValue,
        match,
        severity,
        message,
      });
    }

    return {
      passed: criticalMismatches === 0,
      paramChecks,
      criticalMismatches,
      warningMismatches,
    };
  }

  /**
   * 값 비교 (정규화 적용)
   */
  private compareValues(prev: any, curr: any): boolean {
    if (prev === null || curr === null) return prev === curr;

    // 숫자 비교
    if (typeof prev === 'number' && typeof curr === 'number') {
      return prev === curr;
    }

    // 문자열 정규화 비교
    const normPrev = String(prev).trim().toLowerCase();
    const normCurr = String(curr).trim().toLowerCase();

    return normPrev === normCurr;
  }

  /**
   * JSON 응답 파싱
   */
  private parseJsonResponse(text: string): any {
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }

    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      return JSON.parse(text.substring(jsonStart, jsonEnd + 1));
    }

    throw new Error('응답에서 JSON을 찾을 수 없습니다.');
  }

  /**
   * 시나리오 기반 Vision AI 프롬프트를 생성합니다.
   */
  generateScenarioPrompt(scenario: FunnelScenario): string {
    return FunnelScenarioDesigner.generateVisionPromptForScenario(scenario);
  }

  /**
   * 시나리오 검증 체크리스트를 생성합니다.
   */
  generateScenarioChecklist(scenario: FunnelScenario): string {
    return FunnelScenarioDesigner.generateValidationChecklist(scenario);
  }

  /**
   * 전체 퍼널을 순차적으로 분석합니다.
   */
  async analyzeFunnelScenario(
    screenshots: { path: string; pageUrl: string }[],
    scenario?: FunnelScenario
  ): Promise<FunnelAnalysisResult> {
    const funnelScenario = scenario || this.getDefaultFunnelScenario();
    const startTime = new Date().toISOString();

    if (screenshots.length !== funnelScenario.steps.length) {
      throw new Error(
        `스크린샷 수(${screenshots.length})와 시나리오 단계 수(${funnelScenario.steps.length})가 일치하지 않습니다.`
      );
    }

    const stepResults: FunnelStepAnalysisResult[] = [];
    const trackedItems = new Map<string, {
      item_id: string;
      valuesByStep: Map<string, Record<string, any>>;
      consistencyIssues: string[];
    }>();

    let totalCriticalIssues = 0;
    let totalWarningIssues = 0;

    // 각 단계 순차 분석
    for (let i = 0; i < funnelScenario.steps.length; i++) {
      const step = funnelScenario.steps[i];
      const screenshot = screenshots[i];
      const previousResult = i > 0 ? stepResults[i - 1] : undefined;

      console.log(`\n📍 분석 중: ${step.eventName} (${i + 1}/${funnelScenario.steps.length})`);

      const result = await this.analyzeFunnelStep(
        screenshot.path,
        step,
        funnelScenario,
        screenshot.pageUrl,
        previousResult
      );

      stepResults.push(result);

      // 일관성 이슈 집계
      if (result.consistencyCheck) {
        totalCriticalIssues += result.consistencyCheck.criticalMismatches;
        totalWarningIssues += result.consistencyCheck.warningMismatches;
      }

      // 아이템 추적
      for (const item of result.extractedItems) {
        const itemId = item.params['item_id']?.value?.toString() || 'unknown';

        if (!trackedItems.has(itemId)) {
          trackedItems.set(itemId, {
            item_id: itemId,
            valuesByStep: new Map(),
            consistencyIssues: [],
          });
        }

        const tracked = trackedItems.get(itemId)!;
        tracked.valuesByStep.set(step.eventName, item.params);

        if (result.consistencyCheck) {
          for (const check of result.consistencyCheck.paramChecks) {
            if (!check.match) {
              tracked.consistencyIssues.push(
                `${step.eventName}: ${check.message}`
              );
            }
          }
        }
      }
    }

    const endTime = new Date().toISOString();

    // 전체 요약 생성
    const passed = totalCriticalIssues === 0;
    let summary = passed
      ? '✅ 퍼널 일관성 검증 통과'
      : `❌ 퍼널 일관성 검증 실패 (${totalCriticalIssues}개 CRITICAL 이슈)`;

    if (totalWarningIssues > 0) {
      summary += ` | ${totalWarningIssues}개 WARNING`;
    }

    return {
      scenarioName: funnelScenario.name,
      startTime,
      endTime,
      stepResults,
      overallConsistency: {
        passed,
        totalSteps: funnelScenario.steps.length,
        criticalIssues: totalCriticalIssues,
        warningIssues: totalWarningIssues,
        summary,
      },
      trackedItems,
    };
  }

  /**
   * 퍼널 분석 결과를 출력합니다.
   */
  printFunnelAnalysisResult(result: FunnelAnalysisResult): void {
    console.log('\n' + '═'.repeat(70));
    console.log(`📋 퍼널 분석 결과: ${result.scenarioName}`);
    console.log('═'.repeat(70));

    for (const stepResult of result.stepResults) {
      console.log(`\n📍 ${stepResult.eventName} (${stepResult.pageType})`);
      console.log(`   추출된 아이템: ${stepResult.extractedItems.length}개`);

      if (stepResult.extractedItems[0]) {
        const params = stepResult.extractedItems[0].params;
        console.log(`   - item_id: ${params['item_id']?.value || 'N/A'}`);
        console.log(`   - item_name: ${params['item_name']?.value || 'N/A'}`);
        console.log(`   - price: ${params['price']?.value || 'N/A'}`);
      }

      if (stepResult.consistencyCheck) {
        const check = stepResult.consistencyCheck;
        const icon = check.passed ? '✅' : '❌';
        console.log(`   ${icon} 일관성: CRITICAL=${check.criticalMismatches}, WARNING=${check.warningMismatches}`);

        for (const paramCheck of check.paramChecks.filter(p => !p.match)) {
          console.log(`      ${paramCheck.message}`);
        }
      }
    }

    console.log('\n' + '─'.repeat(70));
    console.log(`📊 전체 결과: ${result.overallConsistency.summary}`);
    console.log('═'.repeat(70));
  }
}
