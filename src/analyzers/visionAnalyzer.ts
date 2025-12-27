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
import { PageTypeDetector, UrlExtractedParams } from './pageTypeDetector';

/**
 * 파라미터 값 예측 결과
 */
export interface PredictedParameter {
  /** 파라미터 이름 */
  name: string;
  /** 예측된 값 */
  value: string | number | null;
  /** 예측 소스 (URL, VISION, CONSTANT 등) */
  source: 'URL' | 'VISION' | 'CONSTANT' | 'COMPUTED' | 'CONTEXT';
  /** 예측 확신도 */
  confidence: 'high' | 'medium' | 'low';
  /** 예측 근거 */
  extractionReason: string;
}

/**
 * items 배열 파라미터 예측
 */
export interface PredictedItem {
  item_id?: string;
  item_name?: string;
  item_brand?: string;
  item_category?: string;
  price?: number;
  quantity?: number;
  index?: number;
  [key: string]: string | number | undefined;
}

export interface VisionAnalysisResult {
  shouldFire: VisionScenario[];
  shouldNotFire: VisionScenario[];
  reasoning: string;
  gtmAnalysis?: string;  // GTM 트리거 분석 결과
  parameterInfo?: string;  // 파라미터 스펙 정보
  /** 예측된 파라미터 값들 */
  predictedParameters?: PredictedParameter[];
  /** 예측된 items 배열 (ecommerce 이벤트) */
  predictedItems?: PredictedItem[];
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
  private predictionRules: any = null;
  private pageTypeDetector: PageTypeDetector;

  constructor(apiKey: string, guidesDir: string = './guides', specLoader?: SpecLoader) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash', // 최신 안정 버전
    });
    this.guidesDir = guidesDir;
    this.specLoader = specLoader || null;
    this.pageTypeDetector = new PageTypeDetector();
    this.loadPredictionRules();
  }

  /**
   * 파라미터 예측 규칙 로드
   */
  private loadPredictionRules(): void {
    try {
      const rulesPath = path.join(process.cwd(), 'config', 'event-prediction-rules.json');
      if (fs.existsSync(rulesPath)) {
        this.predictionRules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
      }
    } catch (e) {
      console.warn('파라미터 예측 규칙 로드 실패:', e);
    }
  }

  /**
   * 이벤트별 파라미터 예측 프롬프트 생성
   */
  private getParameterPredictionPrompt(eventName: string, pageUrl: string): string {
    if (!this.predictionRules?.events?.[eventName]) {
      return '';
    }

    const eventRules = this.predictionRules.events[eventName];
    const params = eventRules.parameters || {};
    const itemsRequired = eventRules.itemsRequired || false;

    let prompt = `\n## 파라미터 값 예측 (필수)\n`;
    prompt += `이 이벤트(${eventName})의 파라미터 값을 예측하세요:\n\n`;

    // 각 파라미터별 예측 지시
    for (const [paramName, paramConfig] of Object.entries(params) as [string, any][]) {
      const source = paramConfig.source || 'VISION';
      const hint = paramConfig.hint || '';
      const patterns = paramConfig.patterns || [];

      prompt += `- **${paramName}**:\n`;
      prompt += `  - 소스: ${source}\n`;
      if (hint) prompt += `  - 힌트: ${hint}\n`;
      if (patterns.length > 0) {
        prompt += `  - URL 패턴: ${patterns.join(', ')}\n`;
        // URL에서 직접 추출 시도
        for (const pattern of patterns) {
          try {
            const regex = new RegExp(pattern);
            const match = pageUrl.match(regex);
            if (match && match[1]) {
              prompt += `  - URL에서 추출: "${match[1]}"\n`;
              break;
            }
          } catch (e) { /* ignore invalid regex */ }
        }
      }
      prompt += '\n';
    }

    // items 배열 필요 시
    if (itemsRequired) {
      prompt += `\n### items 배열 예측\n`;
      prompt += `화면에서 보이는 상품 정보를 items 배열로 추출하세요:\n`;
      prompt += `- item_id: 상품 고유 ID (URL 또는 데이터 속성에서)\n`;
      prompt += `- item_name: 상품명 (화면에서 가장 큰 제목)\n`;
      prompt += `- item_brand: 브랜드명 (상품명 위/옆의 브랜드 로고나 텍스트)\n`;
      prompt += `- price: 판매가격 (숫자만, '원' 제외)\n`;
      prompt += `- quantity: 수량 (기본값 1)\n`;
      if (eventRules.itemsHint) {
        prompt += `\n힌트: ${eventRules.itemsHint}\n`;
      }
    }

    return prompt;
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

    // 파라미터 예측 규칙 추가
    const paramPredictionPrompt = this.getParameterPredictionPrompt(eventName, pageUrl);
    if (paramPredictionPrompt) {
      systemPrompt += paramPredictionPrompt;
    }

    const userPrompt = `## 분석할 페이지
URL: ${pageUrl}

## 요청
이 스크린샷을 분석하여 ${eventName} 이벤트에 대한 시나리오와 **파라미터 값**을 예측해주세요.

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
  "reasoning": "전체적인 분석 요약 및 페이지 구조에 대한 이해",
  "predictedParameters": [
    {
      "name": "파라미터명 (예: item_id, item_name, price)",
      "value": "예측된 값 (문자열 또는 숫자)",
      "source": "URL|VISION|CONSTANT|COMPUTED",
      "confidence": "high|medium|low",
      "extractionReason": "값을 추출한 근거 (예: URL의 onlineProdCode 파라미터에서 추출)"
    }
  ],
  "predictedItems": [
    {
      "item_id": "상품 고유 ID",
      "item_name": "상품명",
      "item_brand": "브랜드명",
      "price": 가격(숫자),
      "quantity": 수량(숫자)
    }
  ]
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

  // ═══════════════════════════════════════════════════════════════════════════
  // 페이지 변수 예측 (Vision AI 기반)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Vision AI가 스크린샷을 보고 페이지 타입과 변수를 즉시 예측
   *
   * 개선된 흐름:
   * 1. URL에서 사이트명, 페이지 타입 감지
   * 2. URL에서 추출 가능한 파라미터 먼저 추출
   * 3. 페이지 타입별 specialized 프롬프트로 Vision AI 호출
   * 4. 결과 병합 후 반환
   */
  async predictPageVariables(
    screenshotPath: string,
    pageUrl: string,
    options?: {
      viewport?: { width: number; height: number };
      userAgent?: string;
    }
  ): Promise<PageVariablePrediction> {
    const imageBase64 = await this.imageToBase64(screenshotPath);
    const mimeType = this.getMimeType(screenshotPath);

    // === 1단계: URL 분석 ===
    const siteName = this.pageTypeDetector.getSiteName(pageUrl);
    const detectedPageType = this.pageTypeDetector.detectPageType(pageUrl, siteName || undefined);
    const urlParams = this.pageTypeDetector.extractParamsFromUrl(pageUrl);
    const pageTypeConfig = this.pageTypeDetector.getPageTypeConfig(detectedPageType);

    // 예측 규칙 로드
    const rulesPath = path.join(process.cwd(), 'config', 'vision-prediction-rules.json');
    let rules: any = {};
    try {
      rules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
    } catch (e) {
      console.warn('vision-prediction-rules.json 로드 실패, 기본값 사용');
    }

    // URL에서 도메인 추출
    const urlDomain = (() => {
      try {
        return new URL(pageUrl).hostname.replace('www.', '');
      } catch {
        return '';
      }
    })();

    // site_name 매핑
    const siteNameMap: Record<string, string> = {
      'amoremall.com': 'APMALL',
      'innisfree.com': 'INNISFREE',
      'osulloc.com': 'OSULLOC',
      'illiyoon.com': 'ILLIYOON',
      'aritaum.com': 'ARITAUM',
      'espoir.com': 'ESPOIR',
      'laboh.co.kr': 'LABOH',
      'aestura.com': 'AESTURA',
      'brdy.co.kr': 'BRDY',
      'ayunche.com': 'AYUNCHE',
      'amospro.com': 'AMOSPRO',
      'makeonshop.co.kr': 'MAKEON',
    };
    const expectedSiteName = siteNameMap[urlDomain] || urlDomain.split('.')[0].toUpperCase();

    // channel 판단 (User-Agent/viewport 기반)
    // viewport가 전달되면 그것으로 판단, 아니면 화면에서 판단
    let expectedChannel: string;
    if (options?.viewport) {
      // viewport 기반 판단 (테스트 환경)
      expectedChannel = options.viewport.width >= 1024 ? 'PC' : 'MO';
    } else {
      // 화면 레이아웃에서 직접 판단
      expectedChannel = 'DETECT_FROM_SCREENSHOT';
    }

    // site_country, site_language 추출
    // - site_country: ISO 3166-1 Alpha-2 국가코드 (KR, US, JP, CN 등)
    // - site_language: ISO 639-1 언어코드 대문자 (KO, EN, JA, ZH 등)
    // 1. URL에서 /kr/ko/ 패턴 확인
    // 2. URL에 없으면 html lang 속성 기준
    // 3. INT 사이트: URL에 /int/ + 영어 → 국가 GL
    const countryMatch = pageUrl.match(/\/([a-z]{2})\/[a-z]{2}\//i);
    const langMatch = pageUrl.match(/\/[a-z]{2}\/([a-z]{2})\//i);
    const isIntSite = /\/int\//i.test(pageUrl);

    let expectedCountry: string;
    let expectedLanguage: string;

    if (countryMatch && langMatch) {
      // URL에 국가/언어 패턴이 있는 경우
      // site_country: ISO 3166-1 Alpha-2 (KR, US, JP 등)
      expectedCountry = countryMatch[1].toUpperCase();
      // site_language: ISO 639-1 대문자 (KO, EN, JA 등)
      expectedLanguage = langMatch[1].toUpperCase();
    } else if (isIntSite) {
      // INT 사이트 (글로벌)
      expectedCountry = 'GL';
      expectedLanguage = 'EN';
    } else {
      // URL에 없으면 html lang에서 추출하도록 Vision AI에 위임
      expectedCountry = 'DETECT_FROM_HTML_LANG';
      expectedLanguage = 'DETECT_FROM_HTML_LANG';
    }

    // site_env 판단 (URL 패턴)
    const expectedEnv = (() => {
      if (/\b(dev|develop)\b/i.test(pageUrl)) return 'DEV';
      if (/\b(stg|staging)\b/i.test(pageUrl)) return 'STG';
      if (/\blocalhost\b/i.test(pageUrl)) return 'LOCAL';
      return 'PRD';
    })();

    // URL 패턴 기반 페이지 타입 힌트
    const urlPageTypeHint = (() => {
      const urlLower = pageUrl.toLowerCase();

      // OTHERS 우선 체크 (FAQ, 공지사항 등)
      if (/\/(faq|notice|board|help|cs|about|article\/faq|consult)/.test(urlLower)) return 'OTHERS';

      // 검색 결과
      if (/\/search|search\.html|\?.*(?:keyword|query|q)=/.test(urlLower)) return 'SEARCH_RESULT';

      // 장바구니
      if (/\/(cart|basket)|order\/basket/.test(urlLower)) return 'CART';

      // 주문 완료
      if (/\/order\/(complete|success)|order_complete/.test(urlLower)) return 'ORDER_COMPLETE';

      // 주문/체크아웃
      if (/\/(order|checkout)\/|order\.html/.test(urlLower)) return 'ORDER';

      // 상품 상세 (Cafe24 패턴 포함: /product/상품명/숫자/)
      if (/\/product\/detail|\/ProductView|\/shop\/item\/|\/goods\/\d|product_no=|onlineProdSn=|onlineProdCode=/.test(urlLower)) return 'PRODUCT_DETAIL';
      if (/\/product\/[^\/]+\/\d+\//.test(urlLower)) return 'PRODUCT_DETAIL'; // Cafe24: /product/상품명/숫자/
      if (/\/prd\/detail\//.test(urlLower)) return 'PRODUCT_DETAIL'; // 아모레몰: /prd/detail/숫자

      // 이벤트 상세
      if (/\/event\/|\/article\/event\/|\/promotion\/|\/event_detail|planDisplaySn=/.test(urlLower)) return 'EVENT_DETAIL';

      // 브랜드 메인
      if (/\/brand\/detail|\/brandshop\/|brandSn=/.test(urlLower)) return 'BRAND_MAIN';

      // 마이페이지
      if (/\/mypage|\/my\/|\/member\/|\/login/.test(urlLower)) return 'MY';

      // 상품 목록 (Cafe24 패턴 포함: /category/숫자/)
      if (/\/category\/|\/shop\/list|\/goods\/catalog/.test(urlLower)) return 'PRODUCT_LIST';
      if (/\/product\/.*\/category\/\d+\//.test(urlLower)) return 'PRODUCT_LIST'; // Cafe24 카테고리
      if (/\/prd\/cate\/list\//.test(urlLower)) return 'PRODUCT_LIST'; // 아모레몰: /prd/cate/list/카테고리ID

      return null; // 판단 불가
    })();

    const systemPrompt = `당신은 웹 페이지 스크린샷을 분석하는 전문가입니다.

## 🔴 핵심 임무: 스크린샷에서 텍스트를 직접 읽어서 추출하세요!

당신의 주요 역할:
1. **스크린샷 이미지를 OCR처럼 읽어서** 화면에 표시된 텍스트를 추출합니다
2. 상품명, 브랜드명, 가격, 검색어 등 **화면에 보이는 모든 텍스트**를 읽으세요
3. 추출한 텍스트를 JSON의 해당 필드에 입력하세요

**예시 - PRODUCT_DETAIL 페이지 스크린샷 분석:**
- 화면 상단에 "설화수" 로고가 보임 → product_brandname: "설화수"
- 큰 글씨로 "윤조에센스 리뉴 90ml"가 보임 → product_name: "윤조에센스 리뉴 90ml"
- "156,000원" 가격이 보임 → product_price: 156000
- breadcrumb에 "스킨케어 > 에센스"가 보임 → product_category: "스킨케어 > 에센스"

**예시 - MAIN 페이지 스크린샷 분석:**
- 메인 배너에 "첫구매 혜택 다드려요" 문구가 보임 → promotion_name: "첫구매 혜택 다드려요"

${urlPageTypeHint ? `## ⚠️ URL 패턴 기반 페이지 타입 힌트
URL 분석 결과: **${urlPageTypeHint}** 페이지로 추정됩니다.
화면 내용과 일치하면 이 타입을 사용하세요. 명백히 다른 경우에만 변경하세요.

` : ''}## 핵심 규칙 (반드시 준수)

### 1. 공통 변수 결정 규칙 (7개)

**site_name** = "${expectedSiteName}" (도메인 매핑, 고정)

**site_env** = "${expectedEnv}" (URL 패턴 기반, dev/stg/local → DEV/STG/LOCAL, 기본값 PRD)

**site_country / site_language**:
${expectedCountry === 'DETECT_FROM_HTML_LANG' ?
`- URL에 국가/언어 패턴 없음 → html lang 속성에서 추출
- site_country: ISO 3166-1 Alpha-2 국가코드 (KR, US, JP, CN 등)
- site_language: ISO 639-1 언어코드 대문자 (KO, EN, JA, ZH 등)
- html lang="ko" → site_country=KR, site_language=KO
- html lang="en" → site_country=US, site_language=EN (단, URL에 /int/ 있으면 GL)
- html lang="ja" → site_country=JP, site_language=JA
- html lang="zh" → site_country=CN, site_language=ZH` :
`- site_country = "${expectedCountry}" (ISO 3166-1 Alpha-2)
- site_language = "${expectedLanguage}" (ISO 639-1 대문자)`}

**channel**:
${expectedChannel !== 'DETECT_FROM_SCREENSHOT'
  ? `= "${expectedChannel}" (viewport ${options?.viewport?.width}x${options?.viewport?.height} 기반, 고정값)`
  : `(화면 레이아웃 기반 판단)
- PC: 넓은 데스크톱 레이아웃, 상단 전체 메뉴 펼침, 다단 컬럼
- MO: 모바일 레이아웃, 햄버거 메뉴(≡), 하단 고정 탭바, 전체 너비 사용`}

### 2. 페이지 위치 변수 (Breadcrumb 기반, 5개)
**중요**: page_location은 화면의 breadcrumb(페이지 경로)를 depth별로 저장합니다.
breadcrumb이 없는 페이지는 모두 null로 설정하세요.

- page_location_1: breadcrumb 1depth (예: "홈", "메인")
- page_location_2: breadcrumb 2depth (예: "스킨케어", "검색결과")
- page_location_3: breadcrumb 3depth (예: "에센스/세럼")
- page_location_4: breadcrumb 4depth (있으면)
- page_location_5: breadcrumb 5depth (있으면)

예시: 화면에 "홈 > 스킨케어 > 에센스" breadcrumb이 있으면
→ page_location_1="홈", page_location_2="스킨케어", page_location_3="에센스", 나머지=null

**breadcrumb이 보이지 않으면 모두 null**

### 3. 페이지 타입 판단 우선순위
${JSON.stringify(rules.step1_pageType?.priority_rules || [], null, 2)}

페이지 타입 기준:
${JSON.stringify(rules.step1_pageType?.rules || {}, null, 2)}

### 4. 조건부 변수 (페이지 타입별 추가 파라미터)

**PRODUCT_DETAIL** 페이지일 때 (10개):
- product_id: URL 쿼리스트링에서 추출 (우선순위: onlineProdCode > onlineProdSn > product_no > productId > /product/숫자)
- product_name: 화면의 큰 상품명 텍스트
- product_brandname: 상품명 위/옆의 브랜드명
- product_brandcode: 브랜드 코드 (URL 또는 화면에서 확인, 없으면 null)
- product_category: 브레드크럼 또는 카테고리 표시
- product_price: 판매가 (숫자만, 예: 45000)
- product_prdprice: 정가/원가 (할인 전 가격, 숫자만)
- product_discount: 할인 금액 (숫자만)
- product_is_stock: 재고 여부 (Y/N) - 구매버튼 활성화=Y, 품절=N
- product_apg_brand_code: APG 브랜드 코드 (없으면 null)

**EVENT_DETAIL** 페이지일 때 (2개):
- view_event_code: URL에서 이벤트 ID 추출 (/event/123 → "123")
- view_event_name: 이벤트 배너/제목 텍스트

**BRAND_MAIN** 페이지일 때 (2개):
- brandshop_code: URL에서 브랜드 코드 추출
- brandshop_name: 브랜드 로고/이름 텍스트

**STORE 페이지일 때 (2개)** (매장 정보 페이지):
- page_store_code: URL에서 매장 코드 추출
- page_store_name: 화면에서 매장명

**SEARCH_RESULT** 페이지일 때 (6개):
- search_term: 검색창에 표시된 검색어
- search_result: 검색 결과 있음 → "Y", 없음 → "N"
- search_result_count: "총 123개" 같은 결과 개수 (숫자만)
- search_type: 검색 유형 (일반검색, 브랜드검색 등)
- search_brand_code: 필터에서 선택된 브랜드 코드 (없으면 null)
- search_brand: 필터에서 선택된 브랜드명 (없으면 null)

**CART** 페이지일 때 (3개):
- cart_item_count: 장바구니에 담긴 상품 수
- cart_total_price: 총 결제 예정 금액 (숫자만)
- checkout_step: begin_checkout 이벤트 파라미터
  - 1: 장바구니 페이지 랜딩 (CART 페이지 진입 시)
  - 2: 바로구매 버튼 클릭 시 (상품상세/장바구니 카드의 바로구매)

**ORDER** 페이지일 때 (3개):
- checkout_step: begin_checkout 이벤트 파라미터
  - 3: 체크아웃(주문서) 페이지 진입 시
  - 4: 체크아웃 페이지 내 결제하기/구매하기 버튼 클릭 시
- payment_type: 선택된 결제 방법 (카드, 무통장 등, 아직 선택 안했으면 null)
- coupon_name: 적용된 쿠폰명 (없으면 null)

**ORDER_COMPLETE** 페이지일 때 (5개):
- transaction_id: 주문번호
- transaction_value: 결제 금액 (숫자만)
- transaction_shipping: 배송비 (숫자만, 무료배송=0)
- coupon_code: 사용된 쿠폰 코드 (없으면 null)
- payment_type: 결제 방법

## 이벤트 예측
페이지 타입별 자동 발생 이벤트:
${JSON.stringify(rules.step3_events?.autoFire || {}, null, 2)}

발생하면 안 되는 이벤트:
${JSON.stringify(rules.step3_events?.forbidden || {}, null, 2)}`;

    // === 2단계: 페이지 타입별 specialized 프롬프트 생성 ===
    const pageTypeHint = detectedPageType;
    const urlPageTypeHintForPrompt = pageTypeHint
      ? `\n⚠️ **URL 패턴 힌트**: 이 URL은 "${pageTypeHint}" 페이지로 추정됩니다. 스크린샷을 확인하여 최종 결정하세요.`
      : '';

    // URL에서 미리 추출된 값 표시
    const urlExtractedInfo = Object.entries(urlParams)
      .filter(([_, v]) => v)
      .map(([k, v]) => `- ${k}: "${v}" (URL에서 추출됨, 이 값 사용)`)
      .join('\n');

    // 페이지 타입별 conditionalVariables 예시 (개선된 버전 - 실제값 강조)
    const conditionalVarsExample = pageTypeHint === 'PRODUCT_DETAIL'
      ? `"product_id": "${urlParams.product_id || '(스크린샷에서 읽은 상품코드)'}",
    "product_name": "(스크린샷에서 읽은 상품명 - 예: 윤조에센스 리뉴 90ml)",
    "product_brandname": "(스크린샷에서 읽은 브랜드명 - 예: 설화수)",
    "product_category": "(스크린샷 breadcrumb - 예: 스킨케어 > 에센스)",
    "product_is_stock": "Y",
    "product_price": "(스크린샷에서 읽은 판매가 숫자 - 예: 156000)",
    "product_prdprice": "(스크린샷에서 읽은 정가 숫자 또는 null)"`
      : pageTypeHint === 'SEARCH_RESULT'
      ? `"search_term": "${urlParams.search_term || '(스크린샷 검색창의 검색어)'}",
    "search_result": "Y",
    "search_result_count": "(스크린샷에서 읽은 결과 수 - 예: 156)"`
      : pageTypeHint === 'PRODUCT_LIST'
      ? `"item_list_name": "(스크린샷에서 읽은 카테고리명 - 예: 스킨케어)"`
      : pageTypeHint === 'CART'
      ? `"cart_item_count": "(스크린샷에서 읽은 상품 수)",
    "cart_total_price": "(스크린샷에서 읽은 총 금액 숫자)"`
      : pageTypeHint === 'EVENT_DETAIL'
      ? `"view_event_name": "(스크린샷에서 읽은 이벤트 제목)",
    "view_event_code": "${urlParams.view_event_code || '(URL에서 추출)'}"`
      : pageTypeHint === 'BRAND_MAIN'
      ? `"brandshop_name": "(스크린샷에서 읽은 브랜드명)",
    "brandshop_code": "(URL에서 추출)"`
      : pageTypeHint === 'MAIN'
      ? `"promotion_name": "(스크린샷 메인배너에서 읽은 프로모션 문구 - 예: 첫구매 혜택 다드려요)",
    "creative_slot": "main_banner_1"`
      : `"// 해당 없음": null`;

    // 사이트명 없을 때 종합 검토 항목
    const comprehensiveCheckPrompt = !siteName ? `

## 📋 종합 검토 항목 (사이트 미식별)
아래 항목들을 모두 확인하여 파라미터를 추출하세요:
${this.pageTypeDetector.getComprehensiveCheckList().map(item => `- ${item}`).join('\n')}
` : '';

    const userPrompt = `## 분석할 페이지
URL: ${pageUrl}
${siteName ? `사이트: ${siteName}` : '⚠️ 사이트 미식별 - 종합 검토 필요'}

## 🔴 URL 패턴 분석 결과 (이 페이지 타입 사용!)
**페이지 타입**: ${pageTypeHint || 'OTHERS'}
**content_group**: ${pageTypeHint || 'OTHERS'}
${pageTypeHint ? `\n⚠️ URL 패턴으로 "${pageTypeHint}" 페이지로 확정되었습니다. 화면이 명백히 다른 경우에만 변경하세요.` : ''}

## 고정값 (URL에서 추출됨 - 그대로 사용)
- site_name: "${siteName || expectedSiteName}"
- site_env: "${urlParams.site_env || expectedEnv}"
${urlParams.site_country ? `- site_country: "${urlParams.site_country}"` : expectedCountry !== 'DETECT_FROM_HTML_LANG' ? `- site_country: "${expectedCountry}"` : ''}
${urlParams.site_language ? `- site_language: "${urlParams.site_language}"` : expectedLanguage !== 'DETECT_FROM_HTML_LANG' ? `- site_language: "${expectedLanguage}"` : ''}
${expectedChannel !== 'DETECT_FROM_SCREENSHOT' ? `- channel: "${expectedChannel}"` : ''}
${urlExtractedInfo ? `\n## URL에서 추출된 파라미터 (이 값 우선 사용)\n${urlExtractedInfo}` : ''}
${comprehensiveCheckPrompt}
## ⚠️ 중요: conditionalVariables 필수 입력
페이지 타입에 따라 conditionalVariables를 **반드시** 채워야 합니다:
- **PRODUCT_DETAIL**: product_id, product_name, product_brandname, product_category, product_is_stock, product_price
- **SEARCH_RESULT**: search_term, search_result, search_result_count
- **PRODUCT_LIST**: item_list_name
- **CART**: cart_item_count, cart_total_price
- **EVENT_DETAIL**: view_event_name, view_event_code
- **BRAND_MAIN**: brandshop_name, brandshop_code

🔴 **화면에서 보이는 텍스트를 그대로 추출하세요. null 최소화!**
🔴 **상품명, 브랜드명, 가격, 검색어 등은 반드시 채워야 합니다.**

## 요청
스크린샷을 분석하여 다음 JSON 형식으로 응답하세요 (전체 45개+ 파라미터 지원):

\`\`\`json
{
  "pageType": "MAIN|PRODUCT_DETAIL|PRODUCT_LIST|SEARCH_RESULT|CART|ORDER|ORDER_COMPLETE|EVENT_DETAIL|BRAND_MAIN|MY|STORE 중 하나",
  "confidence": "high|medium|low",
  "variables": {
    "site_name": "${expectedSiteName}",
    "site_country": "${expectedCountry !== 'DETECT_FROM_HTML_LANG' ? expectedCountry : 'html lang 기반 추출'}",
    "site_language": "${expectedLanguage !== 'DETECT_FROM_HTML_LANG' ? expectedLanguage : 'html lang 기반 추출'}",
    "site_env": "${expectedEnv}",
    "channel": "${expectedChannel !== 'DETECT_FROM_SCREENSHOT' ? expectedChannel : 'PC 또는 MO'}",
    "content_group": "${pageTypeHint || 'pageType과 동일'}",
    "login_is_login": "N (기본값. 아래 조건 충족 시에만 Y)"
  },
  "pageLocationVariables": {
    "page_location_1": "화면 breadcrumb 1depth 텍스트 (없으면 null)",
    "page_location_2": "화면 breadcrumb 2depth 텍스트 (없으면 null)",
    "page_location_3": "화면 breadcrumb 3depth 텍스트 (없으면 null)",
    "page_location_4": "화면 breadcrumb 4depth 텍스트 (없으면 null)",
    "page_location_5": "화면 breadcrumb 5depth 텍스트 (없으면 null)"
  },
  "conditionalVariables": {
    ${conditionalVarsExample}
  },
  "events": {
    "autoFire": ["페이지 타입별 자동 이벤트"],
    "conditional": [],
    "forbidden": ["페이지 타입별 금지 이벤트"]
  },
  "reasoning": "판단 근거"
}
\`\`\`

## conditionalVariables 페이지 타입별 필수 파라미터

**PRODUCT_DETAIL**: product_id, product_name, product_brandname, product_brandcode, product_category, product_price, product_prdprice, product_discount, product_is_stock, product_apg_brand_code

**SEARCH_RESULT**: search_term, search_result, search_result_count, search_type, search_brand_code, search_brand

**CART**: cart_item_count, cart_total_price

**ORDER**: checkout_step, payment_type, coupon_name

**ORDER_COMPLETE**: transaction_id, transaction_value, transaction_shipping, coupon_code, payment_type

**EVENT_DETAIL**: view_event_code, view_event_name

**BRAND_MAIN**: brandshop_code, brandshop_name

**STORE**: page_store_code, page_store_name

## 🚨 중요 - 반드시 따르세요 (위반 시 오류)

### 1. 페이지 타입 및 content_group (필수!)
- **pageType** = "${pageTypeHint || 'URL 패턴 분석 결과'}" (URL 패턴으로 확정됨, 화면이 명백히 다를 때만 변경)
- **content_group** = pageType과 동일 값 (예: PRODUCT_DETAIL → "PRODUCT_DETAIL")

### 2. 고정값 (변경 금지)
- site_name, site_env, site_country, site_language는 위에서 지정한 값 그대로 사용

### 3. pageLocationVariables (breadcrumb)
- 화면에 "홈 > 스킨케어 > 에센스" 같은 breadcrumb이 보이면 각 depth를 분리해서 입력
- **breadcrumb이 없으면 모두 null** (URL을 넣지 마세요!)

### 4. 🔴 conditionalVariables - 가장 중요! (비어있으면 안됨)
**페이지 타입이 ${pageTypeHint || 'MAIN이 아니'}면 conditionalVariables를 반드시 채우세요!**

${pageTypeHint === 'PRODUCT_DETAIL' ? `**PRODUCT_DETAIL 필수 파라미터:**
- product_id: URL의 /prd/detail/ 뒤 숫자 (예: ${urlParams.product_id || 'URL에서 추출'})
- product_name: 화면의 가장 큰 상품명 텍스트 (예: "설화수 윤조에센스 90ml")
- product_brandname: 상품명 위/옆의 브랜드명 (예: "설화수", "헤라")
- product_price: 판매가 숫자만 (예: 45000)
- product_is_stock: "Y" (품절 표시 있으면 "N")
- product_category: breadcrumb 텍스트` : pageTypeHint === 'SEARCH_RESULT' ? `**SEARCH_RESULT 필수 파라미터:**
- search_term: 검색창의 검색어 (예: "${urlParams.search_term || '검색어'}")
- search_result: "Y" (결과 있음) 또는 "N" (결과 없음)
- search_result_count: "총 N개" 텍스트에서 숫자만` : pageTypeHint === 'PRODUCT_LIST' ? `**PRODUCT_LIST 필수 파라미터:**
- item_list_name: 페이지 제목 또는 카테고리명` : `**해당 페이지 타입의 조건부 변수를 모두 채우세요**`}

### 5. 화면에서 보이는 텍스트는 반드시 추출
- 상품명, 브랜드명, 가격, 검색어 등이 화면에 보이면 **반드시** 해당 값을 입력
- **null은 화면에서 정말로 확인 불가능할 때만 사용**

### 6. login_is_login (기본값 N)
- 헤더에 "OOO님" 같은 사용자 이름이나 프로필이 보이면 "Y"
- "로그인" 버튼만 보이면 "N"`;

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
      let prediction: any;
      const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        prediction = JSON.parse(jsonMatch[1]);
      } else {
        // JSON 블록이 없으면 전체 텍스트에서 JSON 찾기
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          prediction = JSON.parse(text.substring(jsonStart, jsonEnd + 1));
        } else {
          throw new Error('응답에서 JSON을 찾을 수 없습니다.');
        }
      }

      // === 후처리: URL 패턴 기반 값으로 교정 ===

      // 1. pageType 교정: URL 패턴 결과가 있으면 우선 사용 (Vision AI가 OTHERS로 잘못 판단한 경우)
      if (pageTypeHint && pageTypeHint !== 'OTHERS' && prediction.pageType === 'OTHERS') {
        prediction.pageType = pageTypeHint;
      }

      // 2. content_group 교정: pageType과 동일하게
      if (prediction.variables) {
        prediction.variables.content_group = prediction.pageType || pageTypeHint || 'OTHERS';
      }

      // 3. conditionalVariables 채우기: URL에서 추출한 값들 추가
      if (!prediction.conditionalVariables) {
        prediction.conditionalVariables = {};
      }

      // URL에서 추출된 파라미터 병합 (Vision AI가 채우지 않은 경우에만)
      if (urlParams.product_id && !prediction.conditionalVariables.product_id) {
        prediction.conditionalVariables.product_id = urlParams.product_id;
      }
      if (urlParams.search_term && !prediction.conditionalVariables.search_term) {
        prediction.conditionalVariables.search_term = urlParams.search_term;
      }
      if (urlParams.view_event_code && !prediction.conditionalVariables.view_event_code) {
        prediction.conditionalVariables.view_event_code = urlParams.view_event_code;
      }
      if (urlParams.site_country && !prediction.variables?.site_country) {
        if (!prediction.variables) prediction.variables = {};
        prediction.variables.site_country = urlParams.site_country;
      }
      if (urlParams.site_language && !prediction.variables?.site_language) {
        if (!prediction.variables) prediction.variables = {};
        prediction.variables.site_language = urlParams.site_language;
      }

      // URL에서 추출된 파라미터 추가 (소스 추적용)
      prediction.urlParams = urlParams as Record<string, string | number | null>;

      return prediction;
    } catch (error: any) {
      console.error('Vision 변수 예측 오류:', error.message);
      throw error;
    }
  }

  /**
   * 스크린샷에서 클릭 가능한 영역을 분석하고
   * 각 영역의 예상 selector와 HTML 속성을 예측합니다.
   *
   * @param screenshotPath 스크린샷 경로
   * @param pageUrl 페이지 URL
   * @param htmlSnippet (선택) 페이지 HTML 일부 (정확도 향상용)
   * @returns 클릭 영역 분석 결과
   */
  async analyzeClickableElements(
    screenshotPath: string,
    pageUrl: string,
    htmlSnippet?: string
  ): Promise<PageClickableAnalysis> {
    const imageBase64 = await this.imageToBase64(screenshotPath);
    const mimeType = this.getMimeType(screenshotPath);

    const systemPrompt = `당신은 웹 페이지의 클릭 가능한 UI 요소를 분석하는 전문가입니다.
스크린샷을 보고 클릭 가능한 모든 영역을 식별하고, 각 영역에 대해 예상되는 HTML 속성과 이벤트를 예측합니다.

## 분석 대상 영역

### 1. GNB/헤더 영역 (headerElements)
- 로고 (홈 링크)
- 메뉴 항목 (카테고리, 브랜드 등)
- 검색 버튼/아이콘
- 장바구니 아이콘
- 마이페이지/로그인 버튼
- 상단 띠배너

### 2. 메인 콘텐츠 영역 (contentElements)
- 배너/슬라이드 (프로모션)
- 상품 카드 (이미지, 이름, 가격)
- 버튼 (장바구니 추가, 구매 등)
- 탭/필터
- 페이지네이션

### 3. 푸터 영역 (footerElements)
- 하단 링크
- SNS 아이콘
- 고객센터 링크

## HTML 속성 예측 규칙

### ap-click-* 속성 (일반 클릭 추적용)
이 속성들은 클릭 이벤트 추적에 사용됩니다:

- **ap-click-area**: 클릭 영역 분류
  - GNB: 상단 네비게이션 메뉴
  - HEADER: 헤더 영역 (로고, 검색, 장바구니 등)
  - MAIN: 메인 컨텐츠 영역
  - FOOTER: 푸터 영역
  - BANNER: 배너/슬라이드
  - PRODUCT: 상품 관련
  - QUICK: 퀵메뉴

- **ap-click-name**: 클릭 요소 세부 분류
  - 메뉴명, 버튼명, 배너명 등
  - 예: "로고 버튼", "검색 버튼", "장바구니", "메인배너_01"

- **ap-click-data**: 클릭 관련 추가 데이터
  - 링크 URL, 상품코드, 이벤트코드 등
  - 예: "/kr/ko/brand/SULWHASOO", "P12345"

### ap-promo-* 속성 (프로모션 추적용)
이 속성들은 배너/프로모션 추적에 사용됩니다:

- **ap-promo-id**: 프로모션 ID (예: "MAIN_BANNER_001")
- **ap-promo-name**: 프로모션 이름 (배너에 표시된 텍스트)
- **ap-promo-slot**: 노출 위치 (예: "main_banner_1", "sub_banner_2")

## 이벤트 예측 규칙

| 요소 타입 | 예상 이벤트 |
|-----------|-------------|
| 상품 카드 클릭 | select_item |
| 장바구니 버튼 | add_to_cart |
| 배너/프로모션 클릭 | select_promotion |
| 일반 링크/버튼 | ap_click |
| 검색 버튼 | ap_click (area=HEADER) |

## selector 예측 규칙

1. 속성 기반: \`[ap-click-area="GNB"]\`, \`[ap-promo-id]\`
2. 클래스 기반: \`.btn-cart\`, \`.product-card\`
3. 태그+역할 기반: \`nav a\`, \`button[type="submit"]\`
4. 위치 기반: \`.header .logo\`, \`.main-banner .slide\``;

    const userPrompt = `## 분석할 페이지
URL: ${pageUrl}

${htmlSnippet ? `## HTML 스니펫 (참고용)
\`\`\`html
${htmlSnippet.substring(0, 2000)}
\`\`\`` : ''}

## 요청
스크린샷을 분석하여 클릭 가능한 모든 영역을 식별하고, 다음 JSON 형식으로 응답하세요:

\`\`\`json
{
  "pageType": "페이지 타입",
  "headerElements": [
    {
      "description": "로고 이미지 (홈 링크)",
      "location": "좌측 상단",
      "predictedSelector": ".header .logo a, [ap-click-area='HEADER'] .logo",
      "predictedAttributes": {
        "ap-click-area": "HEADER",
        "ap-click-name": "로고 버튼",
        "ap-click-data": "/"
      },
      "expectedEvent": "ap_click",
      "expectedGA4Params": {
        "event_category": "HEADER",
        "event_action": "로고 버튼",
        "event_label": "홈으로 이동"
      },
      "elementType": "link",
      "confidence": "high"
    }
  ],
  "contentElements": [
    {
      "description": "메인 배너 슬라이드",
      "location": "화면 중앙 상단",
      "predictedSelector": ".main-banner a, [ap-promo-id] a",
      "predictedAttributes": {
        "ap-promo-id": "MAIN_BANNER_001",
        "ap-promo-name": "배너에 표시된 프로모션 텍스트",
        "ap-promo-slot": "main_banner_1"
      },
      "expectedEvent": "select_promotion",
      "expectedGA4Params": {
        "promotion_id": "MAIN_BANNER_001",
        "promotion_name": "배너 프로모션명",
        "creative_slot": "main_banner_1"
      },
      "elementType": "banner",
      "confidence": "high"
    },
    {
      "description": "상품 카드 (첫 번째 상품)",
      "location": "상품 목록 첫 번째",
      "predictedSelector": ".product-card a, [ap-click-area='PRODUCT'] a",
      "predictedAttributes": {
        "ap-click-area": "PRODUCT",
        "ap-click-name": "상품 클릭",
        "ap-click-data": "상품코드"
      },
      "expectedEvent": "select_item",
      "expectedGA4Params": {
        "event_category": "PRODUCT",
        "event_action": "상품 클릭"
      },
      "elementType": "product",
      "confidence": "high"
    }
  ],
  "footerElements": [],
  "clickableElements": [],
  "reasoning": "분석 근거 설명"
}
\`\`\`

## 중요 지침
1. **실제 화면에 보이는 요소만** 분석하세요
2. 각 영역(header/content/footer)을 구분하여 정리하세요
3. **selector는 범용적으로** 예측하세요 (여러 가능성 포함)
4. **ap-click-area, ap-click-name, ap-click-data** 속성을 반드시 예측하세요
5. 배너/프로모션은 **ap-promo-id, ap-promo-name, ap-promo-slot**도 예측하세요
6. expectedGA4Params에는 클릭 시 전송될 GA4 파라미터를 예측하세요
7. 화면에 텍스트가 있으면 정확히 읽어서 속성값에 반영하세요`;

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
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }

      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        return JSON.parse(text.substring(jsonStart, jsonEnd + 1));
      }

      throw new Error('응답에서 JSON을 찾을 수 없습니다.');
    } catch (error: any) {
      console.error('클릭 영역 분석 오류:', error.message);
      throw error;
    }
  }
}

/**
 * 클릭 가능 요소 예측 결과
 */
export interface ClickableElementPrediction {
  /** 요소 설명 */
  description: string;
  /** 화면상 위치 */
  location: string;
  /** 예상 selector */
  predictedSelector: string;
  /** 예상 HTML 속성 */
  predictedAttributes: {
    'ap-click-area'?: string;
    'ap-click-name'?: string;
    'ap-click-data'?: string;
    'ap-promo-id'?: string;
    'ap-promo-name'?: string;
    'ap-promo-slot'?: string;
    [key: string]: string | undefined;
  };
  /** 예상 이벤트 */
  expectedEvent: string;
  /** 클릭 시 발생할 GA4 파라미터 */
  expectedGA4Params: {
    event_category?: string;
    event_action?: string;
    event_label?: string;
    promotion_id?: string;
    promotion_name?: string;
    creative_slot?: string;
    [key: string]: string | undefined;
  };
  /** 요소 타입 */
  elementType: 'button' | 'link' | 'banner' | 'product' | 'navigation' | 'icon' | 'other';
  /** 확신도 */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * 페이지 클릭 영역 분석 결과
 */
export interface PageClickableAnalysis {
  /** 페이지 타입 */
  pageType: string;
  /** 식별된 클릭 영역 */
  clickableElements: ClickableElementPrediction[];
  /** GNB/헤더 영역 */
  headerElements: ClickableElementPrediction[];
  /** 메인 컨텐츠 영역 */
  contentElements: ClickableElementPrediction[];
  /** 푸터 영역 */
  footerElements: ClickableElementPrediction[];
  /** 분석 근거 */
  reasoning: string;
}

/**
 * Vision AI 페이지 변수 예측 결과 (확장 - 전체 45개+ 파라미터)
 */
export interface PageVariablePrediction {
  /** 판단된 페이지 타입 */
  pageType: string;
  /** 판단 확신도 */
  confidence: 'high' | 'medium' | 'low';
  /** 기본 변수 예측값 */
  variables: {
    // ═══════════════════════════════════════════════════════════
    // 공통 변수 (7개) - 모든 페이지에서 수집
    // ═══════════════════════════════════════════════════════════
    site_name: string;
    site_country: string;
    site_language: string;
    site_env: string;
    channel: 'PC' | 'MO';
    content_group: string;
    login_is_login: 'Y' | 'N';
  };
  /** 페이지 위치 변수 (breadcrumb) */
  pageLocationVariables?: {
    page_location_1?: string;  // 1뎁스 (예: 베스트)
    page_location_2?: string;  // 2뎁스 (예: 스킨케어)
    page_location_3?: string;  // 3뎁스 (예: 토너)
    page_location_4?: string;  // 4뎁스
    page_location_5?: string;  // 5뎁스
  };
  /** 페이지 타입별 조건부 변수 */
  conditionalVariables?: {
    // ═══════════════════════════════════════════════════════════
    // PRODUCT_DETAIL 전용 (10개)
    // ═══════════════════════════════════════════════════════════
    product_id?: string;           // 상품 ID (SKU)
    product_name?: string;         // 상품명
    product_category?: string;     // 상품 카테고리
    product_brandname?: string;    // 브랜드명
    product_brandcode?: string;    // 브랜드 코드
    product_is_stock?: string;     // 재고 여부 (Y/N)
    product_price?: number;        // 판매가 (할인 적용)
    product_discount?: number;     // 할인 금액
    product_prdprice?: number;     // 정가 (할인 전)
    product_apg_brand_code?: string;  // APG 브랜드 코드

    // ═══════════════════════════════════════════════════════════
    // EVENT_DETAIL 전용 (2개)
    // ═══════════════════════════════════════════════════════════
    view_event_code?: string;      // 이벤트/프로모션 코드
    view_event_name?: string;      // 이벤트/프로모션명

    // ═══════════════════════════════════════════════════════════
    // BRAND_MAIN 전용 (2개)
    // ═══════════════════════════════════════════════════════════
    brandshop_code?: string;       // 브랜드샵 코드
    brandshop_name?: string;       // 브랜드샵명

    // ═══════════════════════════════════════════════════════════
    // STORE 페이지 전용 (2개)
    // ═══════════════════════════════════════════════════════════
    page_store_code?: string;      // 매장 코드
    page_store_name?: string;      // 매장명

    // ═══════════════════════════════════════════════════════════
    // SEARCH_RESULT 전용 (6개)
    // ═══════════════════════════════════════════════════════════
    search_brand_code?: string;    // 검색 브랜드 코드
    search_brand?: string;         // 검색 브랜드명
    search_term?: string;          // 검색어
    search_result?: string;        // 검색 성공 여부 (Y/N)
    search_result_count?: number;  // 검색 결과 개수
    search_type?: string;          // 검색 유형

    // ═══════════════════════════════════════════════════════════
    // CART 전용 (3개)
    // ═══════════════════════════════════════════════════════════
    cart_item_count?: number;      // 장바구니 상품 수
    cart_total_price?: number;     // 장바구니 총 금액
    // checkout_step도 CART에서 사용 (1=장바구니 랜딩, 2=바로구매)

    // ═══════════════════════════════════════════════════════════
    // ORDER/ORDER_COMPLETE 전용 (8개)
    // ═══════════════════════════════════════════════════════════
    checkout_step?: number;        // begin_checkout 파라미터: 1=장바구니랜딩, 2=바로구매, 3=체크아웃페이지, 4=결제버튼
    payment_type?: string;         // 결제 방법
    transaction_id?: string;       // 주문번호
    transaction_value?: number;    // 주문 금액
    transaction_shipping?: number; // 배송비
    transaction_tax?: number;      // 세금
    coupon_name?: string;          // 쿠폰명
    coupon_code?: string;          // 쿠폰 코드

    // 기타
    [key: string]: string | number | undefined;
  };
  /** 이벤트 예측 */
  events: {
    autoFire: string[];
    conditional: string[];
    forbidden: string[];
  };
  /** 판단 근거 */
  reasoning: string;
  /** URL에서 추출된 파라미터 (소스 추적용) */
  urlParams?: Record<string, string | number | null>;
}
