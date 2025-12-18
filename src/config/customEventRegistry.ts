/**
 * custom_event 전용 파라미터 레지스트리
 *
 * custom_event는 다양한 목적으로 사용되는 유연한 이벤트입니다.
 * GTM 태그명 또는 event_action 값에 따라 서로 다른 파라미터가 수집됩니다.
 *
 * 관리 방식:
 * 1. event_action 값으로 이벤트 유형 식별
 * 2. 해당 유형에 맞는 파라미터 목록 반환
 */

import { ItemSourceType } from './ecommerceItemsMapping';

// ============================================================================
// 인터페이스 정의
// ============================================================================

export interface CustomEventParam {
  ga4Param: string;
  description: string;
  gtmVariable: string;
  sourceType: ItemSourceType;
  sourcePath: string;
  required?: boolean;  // 필수 파라미터 여부
}

export interface CustomEventType {
  id: string;                    // 이벤트 유형 ID (예: 'skinnote', 'beauty_club')
  name: string;                  // 표시 이름
  description: string;           // 설명
  matchPatterns: {
    eventAction?: string[];      // event_action 값 패턴 (정규식 또는 문자열)
    tagNamePattern?: string;     // GTM 태그명 패턴
  };
  params: CustomEventParam[];    // 해당 유형의 파라미터 목록
}

// ============================================================================
// 공통 파라미터 (모든 custom_event에 포함)
// ============================================================================

export const CUSTOM_EVENT_COMMON_PARAMS: CustomEventParam[] = [
  { ga4Param: 'event_category', description: '이벤트 카테고리', gtmVariable: '{{DL - Event Category}}', sourceType: 'datalayer', sourcePath: 'event_category', required: true },
  { ga4Param: 'event_action', description: '이벤트 액션', gtmVariable: '{{DL - Event Action}}', sourceType: 'datalayer', sourcePath: 'event_action', required: true },
  { ga4Param: 'event_label', description: '이벤트 라벨', gtmVariable: '{{DL - Event Label}}', sourceType: 'datalayer', sourcePath: 'event_label' },
];

// ============================================================================
// custom_event 유형별 정의
// ============================================================================

export const CUSTOM_EVENT_TYPES: CustomEventType[] = [
  // -------------------------------------------------------------------------
  // 스킨노트 (SN) 관련 이벤트
  // -------------------------------------------------------------------------
  {
    id: 'skinnote_diagnosis',
    name: '스킨노트 진단',
    description: '스킨노트 피부 진단 관련 이벤트',
    matchPatterns: {
      eventAction: [
        'diagnosis_camera',
        'diagnosis_paper',
        'diagnosis_paper_start',
        'diagnosis_paper_go_note',
        'diagnosis_paper_go_result',
        'diagnosis_paper_quit_login',
        'diagnosis_paper_sync',
        'diagnosis_result',
        'diagnosis_result_report',
        'diagnosis_note_start',
        'diagnosis_note_complete',
      ],
      tagNamePattern: 'SN Diagnosis',
    },
    params: [
      { ga4Param: 'skinnote_step', description: '스킨노트 단계', gtmVariable: '{{JS - SKINNOTE Step}}', sourceType: 'datalayer', sourcePath: 'skinnote_step' },
      { ga4Param: 'skinnote_question', description: '스킨노트 질문', gtmVariable: '{{JS - SKINNOTE Question}}', sourceType: 'datalayer', sourcePath: 'skinnote_question' },
      { ga4Param: 'skinnote_answer', description: '스킨노트 답변', gtmVariable: '{{JS - SKINNOTE Answer}}', sourceType: 'datalayer', sourcePath: 'skinnote_answer' },
      { ga4Param: 'skinnote_note_date', description: '스킨노트 날짜', gtmVariable: '{{JS - SKINNOTE Note Date}}', sourceType: 'datalayer', sourcePath: 'skinnote_note_date' },
      { ga4Param: 'skinnote_result_score', description: '스킨노트 결과 점수', gtmVariable: '{{JS - SKINNOTE Result Score}}', sourceType: 'datalayer', sourcePath: 'skinnote_result_score' },
      { ga4Param: 'skinnote_result_skintype', description: '스킨노트 피부타입', gtmVariable: '{{JS - SKINNOTE Result Skintype}}', sourceType: 'datalayer', sourcePath: 'skinnote_result_skintype' },
      { ga4Param: 'skinnote_result_diagnosis', description: '스킨노트 진단 결과', gtmVariable: '{{JS - SKINNOTE Result Diagnosis}}', sourceType: 'datalayer', sourcePath: 'skinnote_result_diagnosis' },
      { ga4Param: 'skinnote_result_mood', description: '스킨노트 기분', gtmVariable: '{{JS - SKINNOTE Result Mood}}', sourceType: 'datalayer', sourcePath: 'skinnote_result_mood' },
      { ga4Param: 'skinnote_result_sleep', description: '스킨노트 수면', gtmVariable: '{{JS - SKINNOTE Result Sleep}}', sourceType: 'datalayer', sourcePath: 'skinnote_result_sleep' },
      { ga4Param: 'skinnote_result_water', description: '스킨노트 수분', gtmVariable: '{{JS - SKINNOTE Result Water}}', sourceType: 'datalayer', sourcePath: 'skinnote_result_water' },
      { ga4Param: 'skinnote_result_menstruation', description: '스킨노트 생리주기', gtmVariable: '{{JS - SKINNOTE Result Menstruation}}', sourceType: 'datalayer', sourcePath: 'skinnote_result_menstruation' },
      { ga4Param: 'skinnote_use_count', description: '스킨노트 사용 횟수', gtmVariable: '{{JS - SKINNOTE Result Used Product}}', sourceType: 'datalayer', sourcePath: 'skinnote_use_count' },
      { ga4Param: 'skinnote_intake_count', description: '스킨노트 섭취 횟수', gtmVariable: '{{JS - SKINNOTE Result Eaten Product}}', sourceType: 'datalayer', sourcePath: 'skinnote_intake_count' },
      { ga4Param: 'skinnote_selfcare_count', description: '스킨노트 셀프케어 횟수', gtmVariable: '{{JS - SKINNOTE Result Selfcare}}', sourceType: 'datalayer', sourcePath: 'skinnote_selfcare_count' },
    ],
  },
  {
    id: 'skinnote_main',
    name: '스킨노트 메인',
    description: '스킨노트 메인/레벨/랭킹 관련 이벤트',
    matchPatterns: {
      eventAction: ['skinnote_main', 'skinnote_level', 'skinnote_ranking', 'start_screen', 'start_camera'],
      tagNamePattern: 'SN Main|SN Skinnote|SN Start',
    },
    params: [
      { ga4Param: 'bc_mission', description: '뷰티클럽 미션', gtmVariable: '{{JS - SN Beauty Mission}}', sourceType: 'datalayer', sourcePath: 'bc_mission' },
      { ga4Param: 'sn_mission', description: '스킨노트 미션', gtmVariable: '{{JS - SN Skinnote Mission}}', sourceType: 'datalayer', sourcePath: 'sn_mission' },
    ],
  },
  {
    id: 'skinnote_product',
    name: '스킨노트 상품',
    description: '스킨노트 추천 상품 클릭/노출 이벤트',
    matchPatterns: {
      eventAction: ['diagnosis_result_pdclick', 'diagnosis_result'],
      tagNamePattern: 'SN Product',
    },
    params: [
      { ga4Param: 'bt_product_list', description: '상품 목록', gtmVariable: '{{JS - SN Product List Click}}', sourceType: 'datalayer', sourcePath: 'bt_product_list' },
      { ga4Param: 'bt_result_date', description: '결과 날짜', gtmVariable: '{{JS - SN Note Date}}', sourceType: 'datalayer', sourcePath: 'bt_result_date' },
    ],
  },

  // -------------------------------------------------------------------------
  // 일반 커스텀 이벤트 (기본값)
  // -------------------------------------------------------------------------
  {
    id: 'general',
    name: '일반 커스텀 이벤트',
    description: '분류되지 않은 일반 커스텀 이벤트',
    matchPatterns: {
      eventAction: [], // 빈 배열 = 모든 것에 매칭 (fallback)
    },
    params: [
      { ga4Param: 'event_param1', description: '커스텀 파라미터 1', gtmVariable: '{{DL - Event Param1}}', sourceType: 'datalayer', sourcePath: 'event_param1' },
      { ga4Param: 'event_param2', description: '커스텀 파라미터 2', gtmVariable: '{{DL - Event Param2}}', sourceType: 'datalayer', sourcePath: 'event_param2' },
      { ga4Param: 'event_param3', description: '커스텀 파라미터 3', gtmVariable: '{{DL - Event Param3}}', sourceType: 'datalayer', sourcePath: 'event_param3' },
      { ga4Param: 'value', description: '이벤트 값', gtmVariable: '{{DL - Event Value}}', sourceType: 'datalayer', sourcePath: 'value' },
    ],
  },
];

// ============================================================================
// 유틸리티 함수
// ============================================================================

/**
 * event_action 값으로 custom_event 유형 찾기
 */
export function getCustomEventType(eventAction: string): CustomEventType {
  // 매칭되는 유형 찾기
  for (const eventType of CUSTOM_EVENT_TYPES) {
    if (eventType.id === 'general') continue; // general은 마지막에 처리

    const patterns = eventType.matchPatterns.eventAction || [];
    for (const pattern of patterns) {
      if (eventAction === pattern || eventAction.includes(pattern)) {
        return eventType;
      }
    }
  }

  // 매칭되는 것이 없으면 general 반환
  return CUSTOM_EVENT_TYPES.find(t => t.id === 'general')!;
}

/**
 * GTM 태그명으로 custom_event 유형 찾기
 */
export function getCustomEventTypeByTagName(tagName: string): CustomEventType {
  for (const eventType of CUSTOM_EVENT_TYPES) {
    if (eventType.id === 'general') continue;

    const pattern = eventType.matchPatterns.tagNamePattern;
    if (pattern && new RegExp(pattern, 'i').test(tagName)) {
      return eventType;
    }
  }

  return CUSTOM_EVENT_TYPES.find(t => t.id === 'general')!;
}

/**
 * custom_event의 전체 파라미터 목록 (공통 + 유형별)
 */
export function getCustomEventParams(eventAction: string): CustomEventParam[] {
  const eventType = getCustomEventType(eventAction);
  return [...CUSTOM_EVENT_COMMON_PARAMS, ...eventType.params];
}

/**
 * 모든 custom_event 유형 목록
 */
export function getAllCustomEventTypes(): CustomEventType[] {
  return CUSTOM_EVENT_TYPES;
}

/**
 * 특정 유형의 파라미터 목록
 */
export function getCustomEventParamsByType(typeId: string): CustomEventParam[] {
  const eventType = CUSTOM_EVENT_TYPES.find(t => t.id === typeId);
  if (!eventType) {
    return [...CUSTOM_EVENT_COMMON_PARAMS];
  }
  return [...CUSTOM_EVENT_COMMON_PARAMS, ...eventType.params];
}

/**
 * 모든 custom_event 파라미터 (중복 제거)
 */
export function getAllCustomEventParams(): string[] {
  const params = new Set<string>();

  // 공통 파라미터
  for (const p of CUSTOM_EVENT_COMMON_PARAMS) {
    params.add(p.ga4Param);
  }

  // 유형별 파라미터
  for (const eventType of CUSTOM_EVENT_TYPES) {
    for (const p of eventType.params) {
      params.add(p.ga4Param);
    }
  }

  return Array.from(params).sort();
}

// ============================================================================
// 디버그/출력 유틸리티
// ============================================================================

/**
 * custom_event 레지스트리 요약 출력
 */
export function printCustomEventRegistry(): void {
  console.log('='.repeat(80));
  console.log(' custom_event 파라미터 레지스트리');
  console.log('='.repeat(80));

  console.log('\n### 공통 파라미터');
  for (const p of CUSTOM_EVENT_COMMON_PARAMS) {
    console.log(`  - ${p.ga4Param}: ${p.description}`);
  }

  console.log('\n### 이벤트 유형별 파라미터');
  for (const eventType of CUSTOM_EVENT_TYPES) {
    console.log(`\n📌 ${eventType.name} (${eventType.id})`);
    console.log(`   ${eventType.description}`);
    console.log(`   매칭 패턴: ${eventType.matchPatterns.eventAction?.join(', ') || '-'}`);
    console.log(`   파라미터 (${eventType.params.length}개):`);
    for (const p of eventType.params) {
      console.log(`     - ${p.ga4Param}: ${p.description}`);
    }
  }

  console.log('\n### 전체 고유 파라미터');
  const allParams = getAllCustomEventParams();
  console.log(`   총 ${allParams.length}개: ${allParams.join(', ')}`);
}
