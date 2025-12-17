import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import { SpecLoader } from '../loaders/specLoader';

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
}
