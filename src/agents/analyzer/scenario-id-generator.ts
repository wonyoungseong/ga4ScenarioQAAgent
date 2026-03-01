/**
 * Scenario ID Generator
 *
 * Scenario Action ID / Event ID 생성기.
 * 같은 URL + 같은 user_action = 같은 Action ID (하나의 행동 -> 여러 이벤트)
 *
 * @version 1.0
 */

import type { ChannelCombination } from '../../types/common';
import type { ScenarioIds } from '../../types/qa-report';

/**
 * ScenarioIdGenerator
 *
 * 동일 채널 + 동일 URL + 동일 액션 = 동일 Action ID
 * Action ID: A{001} 형식
 * Event ID: E{action_number}-{event_seq} 형식
 */
export class ScenarioIdGenerator {
  /** channel+URL+action → action number */
  private actionMap = new Map<string, number>();
  /** action key → event 카운터 */
  private eventCounterMap = new Map<string, number>();
  private nextActionNumber = 1;

  /** 그룹핑 키 생성 (채널 포함) */
  private makeKey(channel: ChannelCombination, url: string, actionDescription: string): string {
    return `${channel}|||${url}|||${actionDescription}`;
  }

  /**
   * Scenario Action ID + Event ID 쌍을 생성합니다.
   *
   * @param channel 채널 조합 (pc_login, mo_no_login 등)
   * @param url 검증 URL
   * @param actionDescription 액션 설명 (user_action 또는 'auto_fire')
   * @returns ScenarioIds { action_id, event_id }
   */
  generate(channel: ChannelCombination, url: string, actionDescription: string): ScenarioIds {
    const key = this.makeKey(channel, url, actionDescription);

    // Action ID 할당 (새로운 URL+action 조합이면 새 번호)
    if (!this.actionMap.has(key)) {
      this.actionMap.set(key, this.nextActionNumber++);
      this.eventCounterMap.set(key, 0);
    }

    const actionNumber = this.actionMap.get(key)!;
    const eventSeq = this.eventCounterMap.get(key)! + 1;
    this.eventCounterMap.set(key, eventSeq);

    const actionId = `A${String(actionNumber).padStart(3, '0')}`;
    const eventId = `E${String(actionNumber).padStart(3, '0')}-${eventSeq}`;

    return { action_id: actionId, event_id: eventId };
  }

  /** 상태 리셋 (새 리포트 생성 시) */
  reset(): void {
    this.actionMap.clear();
    this.eventCounterMap.clear();
    this.nextActionNumber = 1;
  }
}
