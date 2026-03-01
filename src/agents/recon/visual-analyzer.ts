/**
 * Visual Analyzer - Gemini Vision API 통합
 *
 * 페이지 스크린샷을 Gemini Vision으로 분석하여
 * 인터랙티브 요소, 이커머스 컨텍스트 등을 추출합니다.
 *
 * @version 1.0
 */

import * as fs from 'fs';
import type { PageTypeEnum } from '../../types/common';
import type {
  VisualPageAnalysis,
  VisualElement,
  EcommerceContext,
} from '../../types/knowledge-state';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface VisualAnalyzerConfig {
  /** Gemini API Key */
  apiKey: string;
  /** 모델명 (기본: 'gemini-2.0-flash') */
  model?: string;
  /** 최대 출력 토큰 (기본: 4096) */
  maxOutputTokens?: number;
}

/** Gemini 응답 파싱 결과 */
interface GeminiAnalysisResponse {
  identified_page_type?: string;
  interactive_elements: Array<{
    description: string;
    purpose: string;
    location: string;
    suggested_identifier?: string;
    visible_text?: string;
    likely_events: string[];
    confidence: number;
  }>;
  ecommerce_context?: {
    is_product_page: boolean;
    has_product_options: boolean;
    has_add_to_cart: boolean;
    has_checkout_entry: boolean;
    observed_prerequisites: string[];
  };
}

// ─────────────────────────────────────────────────────────────────────
// Prompt Template
// ─────────────────────────────────────────────────────────────────────

function buildAnalysisPrompt(pageType: PageTypeEnum, knownEvents: string[]): string {
  return `Analyze this screenshot of a ${pageType} page from a Japanese e-commerce website.
Known GA4 events expected on this page type: [${knownEvents.join(', ')}]

Identify all interactive elements (buttons, links, forms) and determine which GA4 events they might trigger.

Respond with JSON only (no markdown, no code blocks):
{
  "identified_page_type": "the page type you observe",
  "interactive_elements": [{
    "description": "brief description of the element",
    "purpose": "what the element does",
    "location": "header|main_content|sidebar|footer|modal|floating",
    "suggested_identifier": "CSS-like identifier guess based on visible structure",
    "visible_text": "exact text on the element if visible",
    "likely_events": ["GA4 event names this might trigger"],
    "confidence": 0.0-1.0
  }],
  "ecommerce_context": {
    "is_product_page": true/false,
    "has_product_options": true/false,
    "has_add_to_cart": true/false,
    "has_checkout_entry": true/false,
    "observed_prerequisites": ["e.g. size selection required"]
  }
}`;
}

// ─────────────────────────────────────────────────────────────────────
// Main Analysis Function
// ─────────────────────────────────────────────────────────────────────

/**
 * 페이지 스크린샷을 Gemini Vision으로 분석합니다.
 *
 * @param screenshotPath - 스크린샷 파일 경로
 * @param pageType - 페이지 타입
 * @param url - 분석 대상 URL
 * @param knownEvents - GTM에서 알려진 이벤트 목록
 * @param config - Gemini 설정
 * @returns VisualPageAnalysis
 */
export async function analyzePageScreenshot(
  screenshotPath: string,
  pageType: PageTypeEnum,
  url: string,
  knownEvents: string[],
  config: VisualAnalyzerConfig,
): Promise<VisualPageAnalysis> {
  const model = config.model ?? 'gemini-2.0-flash';
  const maxOutputTokens = config.maxOutputTokens ?? 4096;

  // 스크린샷 파일 읽기
  if (!fs.existsSync(screenshotPath)) {
    console.log(`    ❌ 스크린샷 파일 없음: ${screenshotPath}`);
    return {
      url,
      screenshot_path: screenshotPath,
      interactive_elements: [],
    };
  }

  const imageData = fs.readFileSync(screenshotPath);
  const base64Image = imageData.toString('base64');
  const prompt = buildAnalysisPrompt(pageType, knownEvents);

  try {
    // Dynamic import for @google/generative-ai (optional dependency)
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(config.apiKey);
    const genModel = genAI.getGenerativeModel({
      model,
      generationConfig: { maxOutputTokens },
    });

    const result = await genModel.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: 'image/png',
          data: base64Image,
        },
      },
    ]);

    const responseText = result.response.text();
    const analysis = parseGeminiResponse(responseText);

    return {
      url,
      screenshot_path: screenshotPath,
      identified_page_type: analysis.identified_page_type,
      interactive_elements: analysis.interactive_elements.map(normalizeVisualElement),
      ecommerce_context: analysis.ecommerce_context
        ? normalizeEcommerceContext(analysis.ecommerce_context)
        : undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`    ❌ Gemini 분석 실패: ${msg}`);
    return {
      url,
      screenshot_path: screenshotPath,
      interactive_elements: [],
    };
  }
}

/**
 * 여러 페이지의 스크린샷을 일괄 분석합니다.
 */
export async function analyzeMultipleScreenshots(
  screenshots: Array<{ screenshotPath: string; pageType: PageTypeEnum; url: string }>,
  knownEventsMap: Map<PageTypeEnum, string[]>,
  config: VisualAnalyzerConfig,
): Promise<VisualPageAnalysis[]> {
  const results: VisualPageAnalysis[] = [];

  console.log(`\n  ── Phase 4: Gemini 시각 분석 (${screenshots.length}개 페이지) ──`);

  for (let i = 0; i < screenshots.length; i++) {
    const { screenshotPath, pageType, url } = screenshots[i];
    const knownEvents = knownEventsMap.get(pageType) ?? [];

    console.log(`  [${i + 1}/${screenshots.length}] ${pageType} → Gemini 분석 중...`);

    const analysis = await analyzePageScreenshot(
      screenshotPath,
      pageType,
      url,
      knownEvents,
      config,
    );

    const elementCount = analysis.interactive_elements.length;
    const ecomInfo = analysis.ecommerce_context
      ? ` | 이커머스: ${analysis.ecommerce_context.is_product_page ? 'PDP' : 'non-PDP'}`
      : '';
    console.log(`    ✅ ${elementCount}개 요소 발견${ecomInfo}`);

    results.push(analysis);
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────
// Response Parsing
// ─────────────────────────────────────────────────────────────────────

/**
 * Gemini 응답 텍스트를 파싱합니다.
 */
function parseGeminiResponse(responseText: string): GeminiAnalysisResponse {
  // JSON 블록 추출 (코드 블록 래핑 처리)
  let jsonText = responseText.trim();

  // ```json ... ``` 패턴 제거
  const jsonBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) {
    jsonText = jsonBlockMatch[1];
  }

  try {
    const parsed = JSON.parse(jsonText) as GeminiAnalysisResponse;
    return {
      identified_page_type: parsed.identified_page_type,
      interactive_elements: Array.isArray(parsed.interactive_elements)
        ? parsed.interactive_elements
        : [],
      ecommerce_context: parsed.ecommerce_context,
    };
  } catch {
    console.warn('    ⚠️ Gemini 응답 JSON 파싱 실패, 빈 결과 반환');
    return {
      interactive_elements: [],
    };
  }
}

/**
 * VisualElement를 정규화합니다.
 */
function normalizeVisualElement(raw: GeminiAnalysisResponse['interactive_elements'][number]): VisualElement {
  const validLocations = ['header', 'main_content', 'sidebar', 'footer', 'modal', 'floating'] as const;
  type LocationType = typeof validLocations[number];

  const location: LocationType = validLocations.includes(raw.location as LocationType)
    ? (raw.location as LocationType)
    : 'main_content';

  return {
    description: raw.description ?? '',
    purpose: raw.purpose ?? '',
    location,
    suggested_identifier: raw.suggested_identifier,
    visible_text: raw.visible_text,
    likely_events: Array.isArray(raw.likely_events) ? raw.likely_events : [],
    confidence: typeof raw.confidence === 'number' ? Math.max(0, Math.min(1, raw.confidence)) : 0.5,
  };
}

/**
 * EcommerceContext를 정규화합니다.
 */
function normalizeEcommerceContext(
  raw: NonNullable<GeminiAnalysisResponse['ecommerce_context']>,
): EcommerceContext {
  return {
    is_product_page: Boolean(raw.is_product_page),
    has_product_options: Boolean(raw.has_product_options),
    has_add_to_cart: Boolean(raw.has_add_to_cart),
    has_checkout_entry: Boolean(raw.has_checkout_entry),
    observed_prerequisites: Array.isArray(raw.observed_prerequisites)
      ? raw.observed_prerequisites
      : [],
  };
}
