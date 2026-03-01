/**
 * Validator Agent - 진입점
 */

// 1차 QA: 전역변수 검증
export {
  validateURL,
  validateAll,
  type JudgmentStatus,
  type VariableJudgment,
  type URLValidationResult,
  type CrossCheckResult,
  type GlobalVariableValidationOutput,
} from './global-variable-validator';

// 2차 QA: 이벤트 발생 + 파라미터 검증
export {
  validateAllEvents,
  type ParameterValidationResult,
  type ParamResult,
  type ContentGroupValidationResult,
} from './event-validator';
