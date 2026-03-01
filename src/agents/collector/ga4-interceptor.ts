/**
 * GA4 Interceptor - 공유 GA4 네트워크 인터셉터 유틸리티
 *
 * setupGA4Interceptor와 getContentGroup을 단일 파일에서 관리합니다.
 * event-collector.ts, action-collector.ts, site-recon-agent.ts에서
 * 동일 로직이 3중 복사되어 있던 것을 통합.
 *
 * @version 1.0
 */

import type { Page } from 'playwright';
import { parseGA4Request, GA4_COLLECT_PATTERN } from './event-collector';
import type { CapturedGA4Event } from '../../types/collected-data';

/**
 * 페이지에 GA4 네트워크 인터셉터를 설정하고 캡처된 이벤트 배열을 반환
 *
 * page.on('request')로 /g/collect 요청을 캡처하여 GA4 이벤트를 파싱합니다.
 */
export function setupGA4Interceptor(page: Page): CapturedGA4Event[] {
  const captured: CapturedGA4Event[] = [];

  page.on('request', (request) => {
    const url = request.url();
    if (GA4_COLLECT_PATTERN.test(url)) {
      try {
        const events = parseGA4Request(url, request.postData());
        captured.push(...events);
      } catch {
        // 파싱 실패 시 무시
      }
    }
  });

  return captured;
}

/**
 * 예상 이벤트가 모두 캡처될 때까지 폴링 대기
 *
 * 모든 예상 이벤트가 캡처되면 즉시 반환하여 불필요한 대기를 제거합니다.
 * maxWaitMs 초과 시 타임아웃으로 반환합니다.
 *
 * @param page - Playwright 페이지
 * @param captured - setupGA4Interceptor가 반환한 캡처 배열 (실시간 업데이트됨)
 * @param expectedEventNames - 이 페이지에서 발생해야 하는 이벤트명 목록
 * @param options - 대기 옵션
 */
export async function waitForExpectedEvents(
  page: Page,
  captured: CapturedGA4Event[],
  expectedEventNames: string[],
  options?: {
    /** 최대 대기 시간 (ms). 기본값: 15000 */
    maxWaitMs?: number;
    /** 폴링 간격 (ms). 기본값: 500 */
    pollIntervalMs?: number;
    /** 최소 대기 시간 (ms). GA4 배칭 시작까지 대기. 기본값: 3000 */
    minWaitMs?: number;
  },
): Promise<{
  allFound: boolean;
  foundEvents: string[];
  missingEvents: string[];
  waitedMs: number;
}> {
  const maxWait = options?.maxWaitMs ?? 15000;
  const pollInterval = options?.pollIntervalMs ?? 500;
  const minWait = options?.minWaitMs ?? 3000;

  if (expectedEventNames.length === 0) {
    await page.waitForTimeout(minWait);
    return { allFound: true, foundEvents: [], missingEvents: [], waitedMs: minWait };
  }

  const startTime = Date.now();

  // 최소 대기: GA4 배칭 타이머가 시작될 시간 확보
  await page.waitForTimeout(minWait);

  // 폴링: 예상 이벤트가 모두 캡처될 때까지
  while (Date.now() - startTime < maxWait) {
    const capturedNames = new Set(captured.map(e => e.event_name));
    const missing = expectedEventNames.filter(name => !capturedNames.has(name));

    if (missing.length === 0) {
      const waitedMs = Date.now() - startTime;
      return {
        allFound: true,
        foundEvents: [...expectedEventNames],
        missingEvents: [],
        waitedMs,
      };
    }

    await page.waitForTimeout(pollInterval);
  }

  // 타임아웃: 최종 상태 반환
  const capturedNames = new Set(captured.map(e => e.event_name));
  const found = expectedEventNames.filter(name => capturedNames.has(name));
  const missing = expectedEventNames.filter(name => !capturedNames.has(name));
  const waitedMs = Date.now() - startTime;

  return { allFound: false, foundEvents: found, missingEvents: missing, waitedMs };
}

/**
 * 페이지에서 Content Group (AP_DATA_PAGETYPE) 값을 수집
 *
 * 우선순위:
 * 1. window.AP_DATA_PAGETYPE 전역변수
 * 2. dataLayer에서 ap_data_pagetype / AP_DATA_PAGETYPE
 */
export async function getContentGroup(page: Page): Promise<string | undefined> {
  try {
    const contentGroup = await page.evaluate(() => {
      // AP_DATA_PAGETYPE (window 전역변수)
      const w = window as unknown as Record<string, unknown>;
      if (w.AP_DATA_PAGETYPE) return String(w.AP_DATA_PAGETYPE);
      // dataLayer에서 찾기
      const dl = w.dataLayer as Array<Record<string, unknown>> | undefined;
      if (dl) {
        for (let i = dl.length - 1; i >= 0; i--) {
          const entry = dl[i];
          if (entry?.ap_data_pagetype) return String(entry.ap_data_pagetype);
          if (entry?.AP_DATA_PAGETYPE) return String(entry.AP_DATA_PAGETYPE);
        }
      }
      return undefined;
    });
    return contentGroup || undefined;
  } catch {
    return undefined;
  }
}
