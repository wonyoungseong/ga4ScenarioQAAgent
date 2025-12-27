/**
 * Learning Module
 *
 * GA4 파라미터 수집 및 자동 학습 피드백 시스템
 */

export {
  GA4ParameterCollector,
  CustomDimension,
  CollectedParameterValue,
  EventParameterSnapshot,
  createGA4ParameterCollector,
} from './ga4ParameterCollector';

export {
  AutoLearningFeedback,
  LearnedRule,
  SiteLearningConfig,
  ContentGroupRules,
  ParameterPattern,
  VisionHint,
  LearnedEdgeCase,
  createAutoLearningFeedback,
} from './autoLearningFeedback';

export {
  ParameterValuePredictor,
  ParameterValueType,
  ParameterValueRule,
  createParameterValuePredictor,
} from './parameterValuePredictor';

export {
  extractPageContext,
  toPageContext,
  ExtractedPageContext,
} from './pageContextExtractor';
