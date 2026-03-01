/**
 * Collector Agent - 진입점
 */

// 1차 QA: 전역변수 수집
export {
  collectFromURL,
  collectFromURLs,
  collectFromURLsBatch,
  collectWithLogin,
  type GlobalVariableCollectedData,
  type CollectedVariableValue,
  type CollectorConfig,
  type VariableSourceStatus,
} from './browser-collector';

// 2차 QA: GA4 이벤트 네트워크 수집
export {
  parseGA4Request,
  collectEventsFromURL,
  collectEventsFromURLsBatch,
  collectEventsWithLogin,
  printCollectedEvents,
  GA4_COLLECT_PATTERN,
  type GA4Parameter,
  type GA4ProductParam,
  type CapturedGA4Event,
  type EventCollectedData,
} from './event-collector';

// 2차 QA: 액션 시뮬레이션 + 이벤트 수집
export {
  collectEventsWithActions,
  type ScenarioCollectedData,
  type ActionCollectionResult,
  type ActionCollectorOptions,
} from './action-collector';
