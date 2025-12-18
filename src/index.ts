export { ScenarioAgent, AnalysisResult } from './agent';
export { PageAnalyzer } from './analyzers/pageAnalyzer';
export { GeminiVisionAnalyzer, VisionAnalysisResult, VisionScenario } from './analyzers/visionAnalyzer';
export {
  GTMAnalyzer,
  GTMTrigger,
  GTMFilter,
  GTMTag,
  GTMAnalysisResult,
  EventPlatform,
  PageEventAnalysisResult,
  GA4_AUTO_COLLECTED_EVENTS
} from './analyzers/gtmAnalyzer';
export {
  FilterEvaluator,
  FilterEvaluationResult,
  TriggerEvaluationResult,
  EventEvaluationResult
} from './analyzers/filterEvaluator';
export {
  PageType,
  PageContext,
  PageTypeDetectionRule,
  PageTypeSignal,
  ComprehensivePageTypeResult,
  VARIABLE_PAGE_MAPPING,
  PAGE_TYPE_DETECTION_RULES,
  detectPageTypeFromUrl,
  detectPageTypeFromGlobalVariable,
  detectPageTypeComprehensive,
  isVariableDeclaredOnPage,
  getDeclaredVariablesForPage,
  getPageTypeDescription,
  ALL_PAGE_TYPES
} from './types/pageContext';
export {
  EVENT_UI_REQUIREMENTS,
  EventUIRequirement,
  getEventUIRequirement,
  getAutoFireEvents,
  getUserActionEvents,
  generateUICheckPrompt
} from './types/eventUIRequirements';
export {
  IntegratedEventAnalyzer,
  UIVerificationResult,
  IntegratedEventAnalysisResult,
  ActualEventResult,
  SelectorVerificationResult
} from './analyzers/integratedEventAnalyzer';
export {
  DevelopmentGuideParser,
  ParsedEventDefinition,
  DevelopmentGuideParseResult,
  parseDevGuide,
  parseDefaultDevGuide
} from './parsers/developmentGuideParser';
export {
  GA4Client,
  GA4Event,
  GA4EventParameter,
  GA4PageEvent,
  GA4QueryOptions,
  GA4ClientConfig,
  GA4OAuthConfig,
  createGA4ClientFromEnv,
} from './ga4';

// Parameter Value Prediction
export {
  ParameterValuePrediction,
  PredictedParameterValue,
  PredictedItemParameter,
  DataLayerEvent,
  DataLayerItem,
  ParameterValidationResult,
  ItemValidationResult,
  ValidationReport,
  ConfidenceLevel,
  MatchType,
  MismatchPattern,
  GuideFeedback,
  ParameterExtractionContext,
  ParameterScenarioGuide,
  // Funnel Consistency
  ECOMMERCE_FUNNEL_ORDER,
  EcommerceFunnelEvent,
  FunnelTrackedItem,
  FunnelConsistencyResult,
  FunnelValidationReport,
} from './types/parameterPrediction';

export {
  DataLayerCapture,
  dataLayerCapture,
  extractParameterValue,
  extractItemParameterValues,
  compareEventParameters,
  captureGlobalVariables,
  extractProductFromDOM,
  GlobalVariableCapture,
} from './capture/dataLayerCapture';

export {
  ParameterValidator,
  FeedbackAnalyzer,
  FunnelConsistencyValidator,
  parameterValidator,
  feedbackAnalyzer,
  funnelConsistencyValidator,
} from './validation/parameterValidator';

// Common GTM Variables
export {
  CommonEventParameters,
  CommonItemParameters,
  GTMVariableType,
  GTMVariableDefinition,
  EventParameterMapping,
  COMMON_GTM_VARIABLES,
  VIEW_ITEM_PARAMETERS,
  ADD_TO_CART_PARAMETERS,
  EVENT_PARAMETER_MAPPINGS,
  getScreenExtractableParameters,
  getHiddenParameters,
  getParameterSource,
  generateExtractionPrompt,
  getCommonVariablesForEvent,
} from './types/commonVariable';

// Unified Parameter Store (SSOT from PARAM_MAPPING_TABLE.md)
export {
  // Types
  ParameterDefinition,
  EventParameterConfig,
  UnifiedParameterStore,
  // Parser
  ParamMappingParser,
  // Query Service
  ParameterQueryService,
  // Helper Functions
  loadParameterStore,
  getParameterQueryService,
  getEventParams,
  getGA4ApiDimension,
} from './parsers/paramMappingParser';

// Parameter Registry (Agent용 단일 진입점)
export {
  initializeParameterRegistry,
  getEventParameters,
  getEventParamsBasic,
  findParameterByKey,
  findParameterByDevGuideVar,
  getEventList,
  getCommonParameters,
  getApiDimension,
  reloadIfChanged,
  forceReload,
  getRegistryStatus,
  printRegistrySummary,
} from './config/parameterRegistry';

// GA4 Parameter Configuration (Standard)
export {
  // Types
  ParameterDataType,
  ParameterScope,
  ParameterType,
  SiteType,
  ExtractionMethod,
  ValidationRule,
  VisionExtractionHint,
  GTMVariableMapping,
  CrawlingConfig,
  GA4ParameterDefinition,
  EventParameterRequirement,
  ContentGroupType,
  // Constants
  CONTENT_GROUP_VALUES,
  SITE_NAMES,
  CHANNEL_TYPES,
  ENVIRONMENT_TYPES,
  BEAUTY_LEVELS,
  LOGIN_METHODS,
  CHECKOUT_STEPS,
  GA4_PARAMETERS,
  EVENT_PARAMETER_REQUIREMENTS,
  // Helper Functions
  getParameterByKey,
  getParametersForEvent,
  getScreenExtractableParams,
  generateVisionPromptForEvent,
  getParametersByScope,
  getParametersForSiteType,
  validateParameterValue,
  getCrawlableParameters,
  getGTMMappedParameters,
} from './config/ga4ParameterConfig';
