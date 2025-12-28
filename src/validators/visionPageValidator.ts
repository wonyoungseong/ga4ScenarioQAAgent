/**
 * Vision AI 기반 페이지 검증기
 *
 * Gemini Vision API를 사용하여 스크린샷에서 필수 컴포넌트를 시각적으로 확인
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import {
  ComponentCheck,
  ComponentRequirement,
  VisionValidationResult,
} from '../types/pageValidation';

/**
 * Vision AI 페이지 검증기 클래스
 */
export class VisionPageValidator {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY가 필요합니다.');
    }

    this.genAI = new GoogleGenerativeAI(key);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
    });
  }

  /**
   * 스크린샷에서 필수 컴포넌트 시각적 확인
   */
  async validateComponents(
    screenshotPath: string,
    expectedPageType: string,
    requirements: ComponentRequirement[]
  ): Promise<VisionValidationResult> {
    // 스크린샷 로드
    if (!fs.existsSync(screenshotPath)) {
      throw new Error(`스크린샷 파일을 찾을 수 없습니다: ${screenshotPath}`);
    }

    const imageData = fs.readFileSync(screenshotPath);
    const base64Image = imageData.toString('base64');
    const mimeType = this.getMimeType(screenshotPath);

    // 컴포넌트 목록 생성
    const componentsList = requirements
      .map((r, i) => `${i + 1}. ${r.name}: ${r.visionHint}`)
      .join('\n');

    // 프롬프트 생성
    const prompt = this.buildPrompt(expectedPageType, componentsList, requirements);

    try {
      const result = await this.model.generateContent([
        {
          inlineData: {
            mimeType,
            data: base64Image,
          },
        },
        { text: prompt },
      ]);

      const response = result.response.text();
      return this.parseResponse(response, requirements);
    } catch (error: any) {
      console.error('Vision AI 검증 실패:', error.message);

      // 폴백: 모든 컴포넌트를 미확인으로 처리
      return {
        components: requirements.map((r) => ({
          name: r.name,
          found: false,
          visionDetected: false,
          details: 'Vision AI 오류',
        })),
        layoutStatus: 'partial',
        anomalies: ['Vision AI 분석 실패'],
        confidence: 0,
      };
    }
  }

  /**
   * 프롬프트 생성
   */
  private buildPrompt(
    pageType: string,
    componentsList: string,
    requirements: ComponentRequirement[]
  ): string {
    return `당신은 이커머스 웹사이트 QA 전문가입니다.

이 스크린샷은 "${pageType}" 유형의 페이지입니다.
다음 필수 UI 컴포넌트들이 화면에 보이는지 확인해주세요:

${componentsList}

## 분석 규칙
1. 화면에서 직접 보이는 것만 판단하세요
2. 각 컴포넌트에 대해 발견 여부, 위치, 신뢰도를 기록하세요
3. 레이아웃이 깨졌거나 비정상적인 부분이 있으면 기록하세요
4. 에러 메시지나 로딩 실패 표시가 있으면 기록하세요

## 응답 형식 (JSON)
{
  "components": [
    {
      "name": "컴포넌트 이름",
      "found": true/false,
      "location": "화면 위치 설명",
      "confidence": "high" | "medium" | "low"
    }
  ],
  "layoutStatus": "normal" | "broken" | "partial",
  "detectedPageType": "감지된 페이지 유형",
  "anomalies": ["이상 징후 목록"],
  "overallConfidence": 0-100
}

JSON 형식으로만 응답해주세요.`;
  }

  /**
   * Vision AI 응답 파싱
   */
  private parseResponse(
    response: string,
    requirements: ComponentRequirement[]
  ): VisionValidationResult {
    try {
      // JSON 추출
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('JSON 응답을 찾을 수 없습니다');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // 컴포넌트 결과 매핑
      const components: ComponentCheck[] = requirements.map((req) => {
        const found = parsed.components?.find(
          (c: any) => c.name === req.name || c.name?.includes(req.name) || req.name?.includes(c.name)
        );

        return {
          name: req.name,
          found: found?.found ?? false,
          visionDetected: found?.found ?? false,
          confidence: found?.confidence || 'low',
          location: found?.location,
        };
      });

      return {
        components,
        layoutStatus: parsed.layoutStatus || 'partial',
        detectedPageType: parsed.detectedPageType,
        anomalies: parsed.anomalies || [],
        confidence: parsed.overallConfidence || 50,
      };
    } catch (error) {
      console.error('응답 파싱 실패:', error);

      // 폴백
      return {
        components: requirements.map((r) => ({
          name: r.name,
          found: false,
          visionDetected: false,
          details: '파싱 실패',
        })),
        layoutStatus: 'partial',
        anomalies: ['응답 파싱 실패'],
        confidence: 0,
      };
    }
  }

  /**
   * 파일 MIME 타입 결정
   */
  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.png':
        return 'image/png';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.gif':
        return 'image/gif';
      case '.webp':
        return 'image/webp';
      default:
        return 'image/png';
    }
  }

  /**
   * 간단한 페이지 타입 감지
   */
  async detectPageType(screenshotPath: string): Promise<string> {
    if (!fs.existsSync(screenshotPath)) {
      throw new Error(`스크린샷 파일을 찾을 수 없습니다: ${screenshotPath}`);
    }

    const imageData = fs.readFileSync(screenshotPath);
    const base64Image = imageData.toString('base64');
    const mimeType = this.getMimeType(screenshotPath);

    const prompt = `이 스크린샷이 어떤 유형의 이커머스 페이지인지 판단해주세요.

가능한 페이지 유형:
- MAIN: 메인/홈 페이지
- PRODUCT_DETAIL: 상품 상세 페이지 (PDP)
- PRODUCT_LIST: 상품 목록 페이지 (PLP)
- SEARCH_RESULT: 검색 결과 페이지
- CART: 장바구니 페이지
- ORDER: 주문/결제 페이지
- MY: 마이페이지
- EVENT_LIST: 이벤트 목록
- EVENT_DETAIL: 이벤트 상세
- BRAND_MAIN: 브랜드 메인
- ERROR: 에러 페이지 (404, 500 등)
- LOGIN: 로그인 페이지
- OTHERS: 기타

판단 근거와 함께 페이지 유형을 알려주세요.

응답 형식 (JSON):
{
  "pageType": "PRODUCT_DETAIL",
  "confidence": "high",
  "reason": "상품 이미지, 가격, 구매 버튼이 보입니다"
}

JSON 형식으로만 응답해주세요.`;

    try {
      const result = await this.model.generateContent([
        {
          inlineData: {
            mimeType,
            data: base64Image,
          },
        },
        { text: prompt },
      ]);

      const response = result.response.text();
      const jsonMatch = response.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.pageType || 'OTHERS';
      }

      return 'OTHERS';
    } catch (error) {
      console.error('페이지 타입 감지 실패:', error);
      return 'OTHERS';
    }
  }

  /**
   * 에러 페이지 여부 확인
   */
  async isErrorPage(screenshotPath: string): Promise<boolean> {
    if (!fs.existsSync(screenshotPath)) {
      return false;
    }

    const imageData = fs.readFileSync(screenshotPath);
    const base64Image = imageData.toString('base64');
    const mimeType = this.getMimeType(screenshotPath);

    const prompt = `이 스크린샷이 에러 페이지인지 확인해주세요.

에러 페이지 특징:
- 404, 500 등의 숫자
- "페이지를 찾을 수 없습니다", "Page Not Found" 메시지
- "서버 오류", "Server Error" 메시지
- 빈 화면 또는 깨진 레이아웃
- 에러 아이콘이나 경고 이미지

응답 형식 (JSON):
{
  "isError": true/false,
  "errorType": "404" | "500" | "empty" | "broken" | null,
  "reason": "판단 근거"
}

JSON 형식으로만 응답해주세요.`;

    try {
      const result = await this.model.generateContent([
        {
          inlineData: {
            mimeType,
            data: base64Image,
          },
        },
        { text: prompt },
      ]);

      const response = result.response.text();
      const jsonMatch = response.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.isError === true;
      }

      return false;
    } catch (error) {
      console.error('에러 페이지 확인 실패:', error);
      return false;
    }
  }
}
