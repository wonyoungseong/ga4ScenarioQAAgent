/**
 * Reporter Agent - 진입점
 */

// 1차 QA: 전역변수 리포트
export { printURLResult, printFullReport } from './console-reporter';
export { saveJsonReport } from './json-reporter';
export { generateExcelReport, type ExcelReportInput } from './excel-reporter';

// 2차 QA: 이벤트 검수 리포트
export {
  printEventReport,
  printEventBasedReport,
  saveEventJsonReport,
  generateEventExcelReport,
  printCustomEventSection,
} from './event-reporter';
