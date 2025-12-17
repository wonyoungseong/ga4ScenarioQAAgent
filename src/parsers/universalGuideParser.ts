/**
 * 범용 개발가이드 PDF 파서
 *
 * 어떤 개발가이드 PDF가 오더라도 AI를 사용해 필요한 정보를 추출합니다.
 * 누락된 정보는 자동으로 감지하여 유저에게 확인 요청합니다.
 */

import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';

// @ts-ignore
import pdf from 'pdf-parse';
import {
  ScenarioGuideRequirements,
  EventDefinitionRequirement,
  EventParameterRequirement,
  PageTypeRequirement,
  MissingInfoItem,
  ValidationResult,
  REQUIRED_FIELDS,
  GA4_STANDARD_EVENTS,
  DEFAULT_PAGE_TYPES,
} from '../schemas/scenarioGuideRequirements';

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * AI 추출 프롬프트 - 이벤트 정의 추출용
 */
const EVENT_EXTRACTION_PROMPT = `
당신은 GA4/GTM 개발가이드 문서 분석 전문가입니다.
주어진 PDF 텍스트에서 이벤트 정의 정보를 추출해주세요.

## 추출해야 할 정보

각 이벤트에 대해:
1. eventName: 이벤트 이름 (예: view_item, select_item, purchase)
2. description: 이벤트 설명/목적
3. firingCondition: 이벤트 전송 시점 (언제 이 이벤트가 발생하는지)
4. allowedPageTypes: 발생 가능한 페이지 타입 목록
5. requiresUserAction: 사용자 액션이 필요한지 (클릭, 스크롤 등)
6. requiredUIElements: 필요한 UI 요소 (버튼, 배너 등)
7. required: 개발 필수 여부

## 출력 형식

JSON 배열로 출력해주세요:
\`\`\`json
[
  {
    "eventName": "view_item",
    "description": "상품 상세 페이지 조회",
    "firingCondition": "상품 상세 페이지가 로드되었을 시",
    "allowedPageTypes": ["PRODUCT_DETAIL"],
    "requiresUserAction": false,
    "requiredUIElements": ["상품 상세 정보"],
    "required": true
  }
]
\`\`\`

## 주의사항

- 문서에 명시된 정보만 추출하세요
- 추측하지 마세요. 정보가 없으면 해당 필드를 비워두세요
- 페이지 타입은 가능한 영문 대문자로 변환하세요 (예: 메인 페이지 → MAIN)
- "이벤트 전송 시점" 또는 유사한 표현을 찾아 firingCondition에 넣으세요

## PDF 텍스트:
`;

/**
 * AI 추출 프롬프트 - 파라미터 정의 추출용
 */
const PARAMETER_EXTRACTION_PROMPT = `
당신은 GA4/GTM 개발가이드 문서 분석 전문가입니다.
주어진 PDF 텍스트에서 이벤트별 파라미터 정의를 추출해주세요.

## 추출해야 할 정보

각 이벤트의 파라미터:
1. eventName: 이벤트 이름
2. eventParameters: Event-level 파라미터 목록
   - key: 파라미터 키
   - description: 설명
   - dataType: 데이터 타입 (string/number/boolean)
   - required: 필수 여부
   - example: 예시 값
3. itemParameters: Item-level 파라미터 (items 배열 내부)

## 출력 형식

JSON 배열로 출력해주세요:
\`\`\`json
[
  {
    "eventName": "purchase",
    "eventParameters": [
      {"key": "transaction_id", "description": "거래 ID", "dataType": "string", "required": true},
      {"key": "value", "description": "거래 금액", "dataType": "number", "required": true}
    ],
    "itemParameters": [
      {"key": "item_id", "description": "상품 ID", "dataType": "string", "required": true},
      {"key": "item_name", "description": "상품명", "dataType": "string", "required": true}
    ]
  }
]
\`\`\`

## 주의사항

- items 배열 내부 파라미터와 이벤트 레벨 파라미터를 구분하세요
- GA4 표준 파라미터(item_id, item_name 등)와 커스텀 파라미터를 모두 포함하세요
- 문서에 명시된 정보만 추출하세요

## PDF 텍스트:
`;

/**
 * AI 추출 프롬프트 - 페이지 타입 추출용
 */
const PAGE_TYPE_EXTRACTION_PROMPT = `
당신은 GA4/GTM 개발가이드 문서 분석 전문가입니다.
주어진 PDF 텍스트에서 페이지 타입 정의를 추출해주세요.

## 추출해야 할 정보

각 페이지 타입에 대해:
1. pageType: 페이지 타입 코드 (영문 대문자, 예: MAIN, PRODUCT_DETAIL)
2. description: 페이지 설명
3. urlPatterns: URL 패턴 (있는 경우)
4. apDataPageType: AP_DATA_PAGETYPE 변수 값 (있는 경우)

## 출력 형식

JSON 배열로 출력해주세요:
\`\`\`json
[
  {
    "pageType": "PRODUCT_DETAIL",
    "description": "상품 상세 페이지",
    "urlPatterns": ["/product/", "/goods/"],
    "apDataPageType": "PRODUCT_DETAIL"
  }
]
\`\`\`

## PDF 텍스트:
`;

export class UniversalGuideParser {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor() {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
    }
    this.genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  }

  /**
   * PDF 파일에서 모든 필요한 정보를 추출합니다.
   */
  async parseGuide(pdfPath: string): Promise<ScenarioGuideRequirements> {
    console.log(`\n📄 개발가이드 파싱 시작: ${path.basename(pdfPath)}`);

    // 1. PDF 텍스트 추출
    const pdfText = await this.extractPdfText(pdfPath);
    console.log(`   ✓ PDF 텍스트 추출 완료 (${pdfText.length} chars)`);

    // 2. 병렬로 정보 추출
    console.log('   🤖 AI 분석 중...');
    const [events, parameters, pageTypes] = await Promise.all([
      this.extractEvents(pdfText),
      this.extractParameters(pdfText),
      this.extractPageTypes(pdfText),
    ]);

    console.log(`   ✓ 이벤트 ${events.length}개, 파라미터 ${parameters.length}개, 페이지 타입 ${pageTypes.length}개 추출`);

    // 3. 누락 정보 감지
    const missingInfo = this.detectMissingInfo(events, parameters, pageTypes);
    console.log(`   ✓ 누락 정보 ${missingInfo.length}개 감지`);

    // 4. 검증
    const validation = this.validate(events, parameters, pageTypes, missingInfo);

    return {
      metadata: {
        source: path.basename(pdfPath),
        parsedAt: new Date().toISOString(),
        parseSuccess: validation.isValid,
      },
      events,
      parameters,
      pageTypes,
      missingInfo,
      validation,
    };
  }

  /**
   * PDF에서 텍스트 추출
   */
  private async extractPdfText(pdfPath: string): Promise<string> {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);
    return data.text;
  }

  /**
   * AI를 사용해 이벤트 정의 추출
   */
  private async extractEvents(pdfText: string): Promise<EventDefinitionRequirement[]> {
    try {
      const prompt = EVENT_EXTRACTION_PROMPT + pdfText.substring(0, 50000); // 토큰 제한
      const result = await this.model.generateContent(prompt);
      const response = result.response.text();

      const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }

      // JSON 블록 없이 직접 파싱 시도
      const directMatch = response.match(/\[[\s\S]*\]/);
      if (directMatch) {
        return JSON.parse(directMatch[0]);
      }

      return [];
    } catch (error: any) {
      console.error('   ⚠️ 이벤트 추출 실패:', error.message);
      return [];
    }
  }

  /**
   * AI를 사용해 파라미터 정의 추출
   */
  private async extractParameters(pdfText: string): Promise<EventParameterRequirement[]> {
    try {
      const prompt = PARAMETER_EXTRACTION_PROMPT + pdfText.substring(0, 50000);
      const result = await this.model.generateContent(prompt);
      const response = result.response.text();

      const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }

      const directMatch = response.match(/\[[\s\S]*\]/);
      if (directMatch) {
        return JSON.parse(directMatch[0]);
      }

      return [];
    } catch (error: any) {
      console.error('   ⚠️ 파라미터 추출 실패:', error.message);
      return [];
    }
  }

  /**
   * AI를 사용해 페이지 타입 추출
   */
  private async extractPageTypes(pdfText: string): Promise<PageTypeRequirement[]> {
    try {
      const prompt = PAGE_TYPE_EXTRACTION_PROMPT + pdfText.substring(0, 30000);
      const result = await this.model.generateContent(prompt);
      const response = result.response.text();

      const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }

      const directMatch = response.match(/\[[\s\S]*\]/);
      if (directMatch) {
        return JSON.parse(directMatch[0]);
      }

      return [];
    } catch (error: any) {
      console.error('   ⚠️ 페이지 타입 추출 실패:', error.message);
      return [];
    }
  }

  /**
   * 누락된 정보 감지
   */
  private detectMissingInfo(
    events: EventDefinitionRequirement[],
    parameters: EventParameterRequirement[],
    pageTypes: PageTypeRequirement[]
  ): MissingInfoItem[] {
    const missing: MissingInfoItem[] = [];

    // 1. 이벤트 필수 필드 확인
    for (const event of events) {
      if (!event.firingCondition || event.firingCondition.trim() === '') {
        missing.push({
          type: 'firingCondition',
          relatedTo: event.eventName,
          missingField: 'firingCondition',
          severity: 'critical',
          userQuestion: `"${event.eventName}" 이벤트는 언제 전송되나요? (이벤트 전송 시점)`,
          suggestedDefault: GA4_STANDARD_EVENTS.includes(event.eventName)
            ? `GA4 표준: ${event.eventName} 이벤트 발생 시`
            : undefined,
        });
      }

      if (!event.allowedPageTypes || event.allowedPageTypes.length === 0) {
        missing.push({
          type: 'event',
          relatedTo: event.eventName,
          missingField: 'allowedPageTypes',
          severity: 'critical',
          userQuestion: `"${event.eventName}" 이벤트는 어떤 페이지에서 발생하나요?`,
          suggestedDefault: this.suggestPageTypesForEvent(event.eventName),
        });
      }
    }

    // 2. 파라미터 없는 이벤트 확인
    const eventsWithParams = new Set(parameters.map(p => p.eventName));
    for (const event of events) {
      if (!eventsWithParams.has(event.eventName)) {
        missing.push({
          type: 'parameter',
          relatedTo: event.eventName,
          missingField: 'parameters',
          severity: 'warning',
          userQuestion: `"${event.eventName}" 이벤트에 전송되는 파라미터가 있나요?`,
        });
      }
    }

    // 3. 페이지 타입 정의 확인
    const definedPageTypes = new Set(pageTypes.map(p => p.pageType));
    const usedPageTypes = new Set<string>();
    for (const event of events) {
      for (const pt of event.allowedPageTypes || []) {
        usedPageTypes.add(pt);
      }
    }

    for (const pt of usedPageTypes) {
      if (!definedPageTypes.has(pt) && !DEFAULT_PAGE_TYPES.includes(pt)) {
        missing.push({
          type: 'pageType',
          relatedTo: pt,
          missingField: 'definition',
          severity: 'info',
          userQuestion: `"${pt}" 페이지 타입의 정의가 없습니다. 어떤 페이지인가요?`,
        });
      }
    }

    return missing;
  }

  /**
   * 이벤트 이름으로 페이지 타입 제안
   */
  private suggestPageTypesForEvent(eventName: string): string | undefined {
    const suggestions: Record<string, string> = {
      'view_item': 'PRODUCT_DETAIL',
      'select_item': 'PRODUCT_LIST, SEARCH_RESULT',
      'add_to_cart': 'PRODUCT_DETAIL, PRODUCT_LIST',
      'view_cart': 'CART',
      'begin_checkout': 'CART',
      'purchase': 'ORDER',
      'view_promotion': 'MAIN, EVENT_LIST',
      'select_promotion': 'MAIN, EVENT_LIST',
      'search': 'SEARCH_RESULT',
      'page_view': 'ALL',
      'login': 'ALL',
      'sign_up': 'ALL',
    };
    return suggestions[eventName];
  }

  /**
   * 전체 검증
   */
  private validate(
    events: EventDefinitionRequirement[],
    parameters: EventParameterRequirement[],
    pageTypes: PageTypeRequirement[],
    missingInfo: MissingInfoItem[]
  ): ValidationResult {
    const critical = missingInfo.filter(m => m.severity === 'critical');
    const warnings = missingInfo.filter(m => m.severity === 'warning');
    const info = missingInfo.filter(m => m.severity === 'info');

    // 완료율 계산
    const totalEvents = events.length;
    const eventsWithFiringCondition = events.filter(e => e.firingCondition && e.firingCondition.trim() !== '').length;
    const eventsWithPageTypes = events.filter(e => e.allowedPageTypes && e.allowedPageTypes.length > 0).length;

    const completeness = totalEvents > 0
      ? Math.round(((eventsWithFiringCondition + eventsWithPageTypes) / (totalEvents * 2)) * 100)
      : 0;

    return {
      isValid: critical.length === 0,
      completeness,
      issues: {
        critical: critical.map(m => `${m.relatedTo}: ${m.missingField} 누락`),
        warnings: warnings.map(m => `${m.relatedTo}: ${m.missingField} 누락`),
        info: info.map(m => `${m.relatedTo}: ${m.missingField} 누락`),
      },
      canGenerateScenario: critical.length === 0 && completeness >= 50,
    };
  }
}

/**
 * 파서 인스턴스 생성 헬퍼
 */
export function createUniversalGuideParser(): UniversalGuideParser {
  return new UniversalGuideParser();
}
