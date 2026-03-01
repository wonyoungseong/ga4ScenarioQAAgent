/**
 * Dev Guide PDF Parser
 *
 * 개발가이드 PDF에서 이벤트별 힌트 데이터를 추출합니다.
 * GTM JSON만으로는 알 수 없는 발생 조건, 페이지 타입, dataLayer 매핑 등을 파싱합니다.
 *
 * 파싱 대상:
 * - GA4 이벤트명 (이벤트 이름: xxx)
 * - 개발 필수 여부 (Required / Optional)
 * - 이벤트 전송 시점 (발생 조건 설명)
 * - dataLayer event명 (window.dataLayer.push({event:'xxx'}))
 * - 필수 파라미터 (변수 리스트 테이블)
 *
 * @version 1.0
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import type { PageTypeEnum } from '../../types/common';
import type { UserActionType } from '../../types/event-scenario';
import type { DevGuideEventHint, DevGuideParseOutput } from '../../types/devguide';

// ─────────────────────────────────────────────────────────────────────
// Constants: Fire Timing → Page Type / Action Inference
//
// 중요: fire_timing은 "언제 dataLayer.push가 일어나는가" (앱의 행동)를 의미합니다.
// GTM trigger_type(GTM이 어떤 메커니즘으로 태그를 발생시키는가)과는 다른 개념입니다.
//
// 예: "DOM Ready 시점" → dataLayer.push가 DOM Ready 시 일어남 (앱 행동)
//     GTM은 이것을 CUSTOM_EVENT 'ap_page_view'로 수신 (GTM 메커니즘)
//     → 두 개념이 다른 레이어이므로 혼동하면 안 됩니다.
//
// fire_timing → practical_fire 매핑 규칙:
//   "페이지 로드/DOM/화면 진입" 관련 → auto_fire (자동 발생)
//   "클릭/선택/담기" 관련 → user_action (사용자 액션 필요)
//   "완료" 관련 → manual_only (실제 프로세스 완료 필요)
// ─────────────────────────────────────────────────────────────────────

interface FireTimingRule {
  keywords: string[];
  page_types: PageTypeEnum[];
  action_type: UserActionType;
  testability: 'auto' | 'action' | 'conditional' | 'manual_only';
  practical_fire: 'auto_fire' | 'user_action' | 'manual_only';
}

const FIRE_TIMING_RULES: FireTimingRule[] = [
  // Auto-fire: page load events
  {
    keywords: ['DOM', '모든 페이지', 'HTML 파싱', 'DOM 구조'],
    page_types: ['MAIN', 'PRODUCT_LIST', 'PRODUCT_DETAIL', 'EVENT_LIST', 'EVENT_DETAIL', 'SEARCH', 'CART', 'CHECKOUT', 'ORDER_COMPLETE', 'MY_PAGE', 'OTHERS'],
    action_type: 'page_load',
    testability: 'auto',
    practical_fire: 'auto_fire',
  },
  // Product detail page
  {
    keywords: ['상품 상세', '제품 상세'],
    page_types: ['PRODUCT_DETAIL'],
    action_type: 'page_load',
    testability: 'auto',
    practical_fire: 'auto_fire',
  },
  // Product list / search
  {
    keywords: ['상품 리스트', '상품 카테고리', '검색 결과'],
    page_types: ['PRODUCT_LIST', 'SEARCH'],
    action_type: 'page_load',
    testability: 'auto',
    practical_fire: 'auto_fire',
  },
  // Cart actions
  {
    keywords: ['장바구니에 추가', '장바구니 담기', 'addcart'],
    page_types: ['PRODUCT_DETAIL', 'PRODUCT_LIST'],
    action_type: 'click',
    testability: 'action',
    practical_fire: 'user_action',
  },
  {
    keywords: ['장바구니에서 삭제', '장바구니 삭제', 'removeCart'],
    page_types: ['CART'],
    action_type: 'click',
    testability: 'action',
    practical_fire: 'user_action',
  },
  // Checkout
  {
    keywords: ['구매하기', '주문', '결제', 'checkout'],
    page_types: ['CART', 'PRODUCT_DETAIL', 'PRODUCT_LIST'],
    action_type: 'click',
    testability: 'action',
    practical_fire: 'user_action',
  },
  // Purchase
  {
    keywords: ['구매 완료', '주문 완료', 'purchase'],
    page_types: ['ORDER_COMPLETE'],
    action_type: 'page_load',
    testability: 'manual_only',
    practical_fire: 'manual_only',
  },
  // Login / Sign up / Withdrawal
  {
    keywords: ['로그인을 완료', '로그인 완료'],
    page_types: ['MY_PAGE', 'OTHERS'],
    action_type: 'page_load',
    testability: 'manual_only',
    practical_fire: 'manual_only',
  },
  {
    keywords: ['회원가입을 완료', '회원가입 완료'],
    page_types: ['OTHERS'],
    action_type: 'page_load',
    testability: 'manual_only',
    practical_fire: 'manual_only',
  },
  {
    keywords: ['회원탈퇴를 완료', '회원탈퇴 완료'],
    page_types: ['MY_PAGE'],
    action_type: 'page_load',
    testability: 'manual_only',
    practical_fire: 'manual_only',
  },
  // Promotion
  {
    keywords: ['프로모션', 'key visual', '메인 페이지 로드'],
    page_types: ['MAIN', 'EVENT_LIST'],
    action_type: 'page_load',
    testability: 'auto',
    practical_fire: 'auto_fire',
  },
  // Select item
  {
    keywords: ['상품 클릭', '제품 클릭'],
    page_types: ['PRODUCT_LIST', 'SEARCH'],
    action_type: 'click',
    testability: 'action',
    practical_fire: 'user_action',
  },
  // Review
  {
    keywords: ['리뷰 작성', '리뷰를 완료'],
    page_types: ['PRODUCT_DETAIL'],
    action_type: 'click',
    testability: 'action',
    practical_fire: 'user_action',
  },
];

// ─────────────────────────────────────────────────────────────────────
// PDF → Text
// ─────────────────────────────────────────────────────────────────────

function pdfToText(pdfPath: string): string {
  const absolutePath = path.resolve(pdfPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`PDF 파일이 존재하지 않습니다: ${absolutePath}`);
  }

  try {
    const result = execSync(`pdftotext -layout "${absolutePath}" -`, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return result;
  } catch {
    throw new Error(
      'pdftotext 명령어를 찾을 수 없습니다. poppler를 설치하세요: brew install poppler'
    );
  }
}

// ─────────────────────────────────────────────────────────────────────
// Event Block Extraction
// ─────────────────────────────────────────────────────────────────────

interface RawEventBlock {
  event_names: string[];     // may have multiple (e.g., "view_promotion / select_promotion")
  required_text: string;     // "Required" or "Optional"
  fire_timing: string;       // 이벤트 전송 시점 설명
  dataLayer_events: string[];  // extracted from dataLayer.push
  required_params: string[];   // Required params from variable table
  block_text: string;        // full block text for debugging
}

/**
 * PDF 텍스트를 이벤트 블록으로 분리합니다.
 */
function extractEventBlocks(text: string): RawEventBlock[] {
  const blocks: RawEventBlock[] = [];
  const lines = text.split('\n');

  // Find indices of "이벤트 이름:" lines
  const eventLineIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('이벤트 이름:')) {
      eventLineIndices.push(i);
    }
  }

  for (let idx = 0; idx < eventLineIndices.length; idx++) {
    const startLine = eventLineIndices[idx];
    const endLine = idx + 1 < eventLineIndices.length
      ? eventLineIndices[idx + 1]
      : Math.min(startLine + 100, lines.length);

    const blockLines = lines.slice(startLine, endLine);
    const blockText = blockLines.join('\n');

    // 1. Extract event names
    const eventNameLine = lines[startLine];
    const eventNameMatch = eventNameLine.match(/이벤트\s*이름:\s*(.+)/);
    if (!eventNameMatch) continue;

    const eventNamesRaw = eventNameMatch[1].trim();
    const eventNames = eventNamesRaw.split(/\s*\/\s*/).map(n => n.trim()).filter(Boolean);

    // 2. Extract required/optional
    let requiredText = 'Required';
    for (const line of blockLines) {
      const reqMatch = line.match(/개발\s*필수\s*여부:\s*(Required|Optional)/i);
      if (reqMatch) {
        requiredText = reqMatch[1];
        break;
      }
    }

    // 3. Extract fire timing
    let fireTiming = '';
    for (const line of blockLines) {
      const timingMatch = line.match(/이벤트\s*전송\s*시점:\s*(.+)/);
      if (timingMatch) {
        fireTiming = timingMatch[1].trim();
        break;
      }
    }

    // 4. Extract dataLayer event names
    const dataLayerEvents: string[] = [];
    const dlRegex = /dataLayer\.push\(\s*\{[^}]*?['"]event['"]\s*:\s*['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = dlRegex.exec(blockText)) !== null) {
      const eventName = match[1].trim();
      if (!dataLayerEvents.includes(eventName)) {
        dataLayerEvents.push(eventName);
      }
    }

    // 5. Extract Required params from variable table
    const requiredParams: string[] = [];
    const paramRegex = /Required\s+(AP_\w+|event|event_category|event_action|event_label|code|name|brand|cate|index|item_list_name|price|discount|prdprice|quantity|apg_brand_code|creative_slot|promotion_id|promotion_name)/g;
    let paramMatch: RegExpExecArray | null;
    while ((paramMatch = paramRegex.exec(blockText)) !== null) {
      const paramName = paramMatch[1].trim();
      if (!requiredParams.includes(paramName)) {
        requiredParams.push(paramName);
      }
    }

    blocks.push({
      event_names: eventNames,
      required_text: requiredText,
      fire_timing: fireTiming,
      dataLayer_events: dataLayerEvents,
      required_params: requiredParams,
      block_text: blockText,
    });
  }

  return blocks;
}

// ─────────────────────────────────────────────────────────────────────
// Fire Timing Inference
// ─────────────────────────────────────────────────────────────────────

interface InferredFiring {
  page_types: PageTypeEnum[];
  action_type: UserActionType;
  testability: 'auto' | 'action' | 'conditional' | 'manual_only';
  practical_fire: 'auto_fire' | 'user_action' | 'manual_only';
}

const ALL_PAGE_TYPES: PageTypeEnum[] = [
  'MAIN', 'PRODUCT_LIST', 'PRODUCT_DETAIL', 'EVENT_LIST', 'EVENT_DETAIL',
  'SEARCH', 'CART', 'CHECKOUT', 'ORDER_COMPLETE', 'MY_PAGE', 'OTHERS',
];

function inferFromFireTiming(fireTiming: string, eventName: string): InferredFiring {
  const combined = `${fireTiming} ${eventName}`.toLowerCase();

  for (const rule of FIRE_TIMING_RULES) {
    const matched = rule.keywords.some(kw => combined.includes(kw.toLowerCase()));
    if (matched) {
      return {
        page_types: rule.page_types,
        action_type: rule.action_type,
        testability: rule.testability,
        practical_fire: rule.practical_fire,
      };
    }
  }

  // Default: conditional on all pages
  return {
    page_types: [...ALL_PAGE_TYPES],
    action_type: 'custom',
    testability: 'conditional',
    practical_fire: 'user_action',
  };
}

// ─────────────────────────────────────────────────────────────────────
// Deduplication: merge begin_checkout variants
// ─────────────────────────────────────────────────────────────────────

function deduplicateHints(hints: DevGuideEventHint[]): DevGuideEventHint[] {
  const merged = new Map<string, DevGuideEventHint>();

  for (const hint of hints) {
    const existing = merged.get(hint.ga4_event_name);
    if (!existing) {
      merged.set(hint.ga4_event_name, { ...hint });
    } else {
      // Merge dataLayer event names
      for (const dl of hint.dataLayer_event_names) {
        if (!existing.dataLayer_event_names.includes(dl)) {
          existing.dataLayer_event_names.push(dl);
        }
      }
      // Merge page types
      for (const pt of hint.inferred_page_types) {
        if (!existing.inferred_page_types.includes(pt)) {
          existing.inferred_page_types.push(pt);
        }
      }
      // Merge params
      if (hint.required_params) {
        if (!existing.required_params) existing.required_params = [];
        for (const p of hint.required_params) {
          if (!existing.required_params.includes(p)) {
            existing.required_params.push(p);
          }
        }
      }
      // Keep most restrictive required flag
      if (hint.required) existing.required = true;
    }
  }

  return Array.from(merged.values());
}

// ─────────────────────────────────────────────────────────────────────
// Main Parser
// ─────────────────────────────────────────────────────────────────────

/**
 * 개발가이드 PDF를 파싱하여 이벤트 힌트를 추출합니다.
 */
export function parseDevGuidePDF(pdfPath: string): DevGuideParseOutput {
  const warnings: string[] = [];
  const text = pdfToText(pdfPath);

  // Extract event blocks
  const blocks = extractEventBlocks(text);
  if (blocks.length === 0) {
    warnings.push('개발가이드 PDF에서 이벤트 블록을 찾지 못했습니다');
    return { events: [], dataLayer_to_ga4_map: {}, warnings };
  }

  const allHints: DevGuideEventHint[] = [];
  const dataLayerToGA4Map: Record<string, string> = {};

  for (const block of blocks) {
    for (const eventName of block.event_names) {
      const inferred = inferFromFireTiming(block.fire_timing, eventName);

      const hint: DevGuideEventHint = {
        ga4_event_name: eventName,
        required: block.required_text.toLowerCase() === 'required',
        fire_timing: block.fire_timing,
        dataLayer_event_names: block.dataLayer_events,
        inferred_page_types: inferred.page_types,
        action_type: inferred.action_type,
        testability: inferred.testability,
        practical_fire: inferred.practical_fire,
        required_params: block.required_params.length > 0 ? block.required_params : undefined,
      };

      allHints.push(hint);

      // Build dataLayer → GA4 mapping
      for (const dl of block.dataLayer_events) {
        if (!dataLayerToGA4Map[dl]) {
          dataLayerToGA4Map[dl] = eventName;
        }
      }
    }
  }

  // Deduplicate (e.g., multiple begin_checkout blocks)
  const events = deduplicateHints(allHints);

  console.log(`  개발가이드 PDF 파싱: ${events.length}개 이벤트, ${Object.keys(dataLayerToGA4Map).length}개 dataLayer 매핑`);

  if (events.length === 0) {
    warnings.push('개발가이드 PDF에서 이벤트를 추출하지 못했습니다');
  }

  return { events, dataLayer_to_ga4_map: dataLayerToGA4Map, warnings };
}
