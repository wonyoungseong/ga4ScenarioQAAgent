/**
 * 파라미터 값 예측 테스트
 *
 * Vision AI가 스크린샷에서 추출한 파라미터 값과
 * dataLayer에서 캡처한 실제 값을 비교하여 정확도를 측정합니다.
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { chromium, Browser, Page } from 'playwright';
import { GeminiVisionAnalyzer } from './analyzers/visionAnalyzer';
import {
  DataLayerCapture,
  captureGlobalVariables,
  extractProductFromDOM,
  GlobalVariableCapture,
} from './capture/dataLayerCapture';
import {
  ParameterValidator,
  FeedbackAnalyzer,
  parameterValidator,
  feedbackAnalyzer,
} from './validation/parameterValidator';
import {
  ParameterValuePrediction,
  DataLayerEvent,
  ValidationReport,
  ParameterExtractionContext,
} from './types/parameterPrediction';
import {
  getScreenExtractableParameters,
  getHiddenParameters,
  getCommonVariablesForEvent,
  generateExtractionPrompt,
} from './types/commonVariable';
import {
  GA4_PARAMETERS,
  getParametersForEvent,
  getScreenExtractableParams,
  generateVisionPromptForEvent,
  validateParameterValue,
  getParameterByKey,
  GA4ParameterDefinition,
  EVENT_PARAMETER_REQUIREMENTS,
} from './config/ga4ParameterConfig';

dotenv.config();

// ═══════════════════════════════════════════════════════════════════════════
// 테스트 설정
// ═══════════════════════════════════════════════════════════════════════════

interface TestConfig {
  url: string;
  eventName: string;
  pageType: string;
  description: string;
}

const TEST_CONFIGS: TestConfig[] = [
  {
    url: 'https://www.amoremall.com/kr/ko/product/detail?onlineProdSn=65121&onlineProdCode=111170002462',
    eventName: 'view_item',
    pageType: 'PRODUCT_DETAIL',
    description: '상품 상세 페이지 - view_item 파라미터 추출',
  },
  // 추가 테스트 케이스는 여기에 추가
];

// ═══════════════════════════════════════════════════════════════════════════
// 메인 테스트 클래스
// ═══════════════════════════════════════════════════════════════════════════

interface GA4NetworkRequest {
  url: string;
  params: Record<string, string>;
  ecommerce?: Record<string, unknown>;
}

class ParameterPredictionTester {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private visionAnalyzer: GeminiVisionAnalyzer;
  private dataLayerCapture: DataLayerCapture;
  private outputDir: string;
  private ga4Requests: GA4NetworkRequest[] = [];
  private isHeadless: boolean = false;
  private waitForDebugView: boolean = true; // GA4 DebugView 확인 대기 여부

  constructor(apiKey: string) {
    this.visionAnalyzer = new GeminiVisionAnalyzer(apiKey, './guides');
    this.dataLayerCapture = new DataLayerCapture();
    this.outputDir = './output/parameter-prediction';

    // 출력 디렉토리 생성
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async initialize(options?: { headless?: boolean; waitForDebugView?: boolean }): Promise<void> {
    const headless = options?.headless ?? false; // 기본값: 실제 브라우저 (GA4 DebugView 확인용)
    this.isHeadless = headless;
    this.waitForDebugView = options?.waitForDebugView ?? !headless; // 기본값: 실제 브라우저일 때만 대기

    console.log(`🚀 브라우저 초기화 중... (headless: ${headless})`);
    if (!headless) {
      console.log('   💡 GA4 DebugView 확인을 위해 실제 브라우저로 실행됩니다.');
      console.log('   💡 크롬 확장 프로그램 "Google Analytics Debugger"를 설치하세요.');
      if (this.waitForDebugView) {
        console.log('   💡 각 페이지에서 30초간 대기하여 GA4 DebugView를 확인할 수 있습니다.');
      }
    }

    this.browser = await chromium.launch({
      headless,
      args: headless ? [] : [
        '--auto-open-devtools-for-tabs', // DevTools 자동 열기
      ],
    });
    const context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    this.page = await context.newPage();

    // GA4 네트워크 요청 캡처
    this.ga4Requests = [];
    this.page.on('request', request => {
      const url = request.url();
      // GA4 Measurement Protocol 또는 gtag.js 요청 캡처
      if (url.includes('google-analytics.com/g/collect') ||
          url.includes('analytics.google.com/g/collect') ||
          url.includes('/gtag/')) {
        const parsedUrl = new URL(url);
        const params: Record<string, string> = {};
        parsedUrl.searchParams.forEach((value, key) => {
          params[key] = value;
        });
        this.ga4Requests.push({ url, params });
      }
    });

    // dataLayer 캡처 초기화
    await this.dataLayerCapture.initialize(this.page);
    console.log('✅ 초기화 완료');
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async runTest(config: TestConfig): Promise<{
    prediction: ParameterValuePrediction;
    actual: DataLayerEvent | null;
    report: ValidationReport;
  }> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🧪 테스트: ${config.description}`);
    console.log(`   URL: ${config.url}`);
    console.log(`   이벤트: ${config.eventName}`);
    console.log(`${'═'.repeat(60)}`);

    // 이벤트별 파라미터 정보 출력
    this.printParameterInfo(config.eventName);

    // GA4 요청 초기화
    this.ga4Requests = [];

    // 1. 페이지 이동
    console.log('\n📄 페이지 로드 중...');
    await this.page.goto(config.url, { waitUntil: 'networkidle' });
    await this.page.waitForTimeout(5000); // 비동기 데이터 로드 대기 시간 증가

    // dataLayer 재초기화 (페이지 이동 후)
    await this.dataLayerCapture.reinitialize();

    // 2. 스크린샷 캡처
    const screenshotPath = path.join(
      this.outputDir,
      `screenshot_${config.eventName}_${Date.now()}.png`
    );
    await this.page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`📸 스크린샷 저장: ${screenshotPath}`);

    // 3. Vision AI 파라미터 값 예측
    console.log('\n🤖 Vision AI 파라미터 값 예측 중...');
    const extractionContext = this.visionAnalyzer.getDefaultExtractionContext(
      config.eventName,
      config.pageType
    );

    // URL에서 item_id 힌트 추가
    const urlParams = new URL(config.url).searchParams;
    const productCode = urlParams.get('onlineProdCode');
    if (productCode) {
      extractionContext.siteSpecificRules = [
        {
          rule: 'item_id 추출',
          description: `URL의 onlineProdCode 파라미터 값 사용: ${productCode}`,
        },
      ];
    }

    const prediction = await this.visionAnalyzer.extractParameterValues(
      screenshotPath,
      extractionContext,
      config.url
    );

    console.log('\n📊 예측 결과:');
    this.printPrediction(prediction);

    // 4. dataLayer 캡처
    console.log('\n📥 dataLayer 캡처 중...');
    const events = await this.dataLayerCapture.getCapturedEvents();
    console.log(`   총 ${events.length}개 이벤트 캡처됨`);

    // 4.1 전역변수 캡처 (GTM JS 변수가 참조하는 데이터 소스)
    console.log('\n🌐 전역 JavaScript 변수 캡처 중...');
    const globalVars = await captureGlobalVariables(this.page!);
    this.printGlobalVariables(globalVars);

    // 4.2 DOM에서 상품 정보 추출 (JSON-LD, meta 태그 등)
    console.log('\n📑 DOM에서 상품 정보 추출 중...');
    const domData = await extractProductFromDOM(this.page!);
    if (domData) {
      this.printDOMData(domData);
    } else {
      console.log('   DOM에서 상품 정보를 찾을 수 없습니다.');
    }

    // 해당 이벤트 찾기 (view_item의 경우 product 이벤트)
    const eventMapping: Record<string, string[]> = {
      view_item: ['product', 'view_item'],
      add_to_cart: ['addcart', 'add_to_cart'],
    };

    const targetEventNames = eventMapping[config.eventName] || [config.eventName];
    let targetEvent = events.find(
      e => targetEventNames.includes(e.event || '') || e.ecommerce?.items
    );

    // 전역변수에서 실제 데이터 구성
    const actualData = this.buildActualDataFromSources(globalVars, domData, targetEvent);

    if (targetEvent) {
      console.log('\n📦 캡처된 dataLayer 이벤트:');
      this.printDataLayerEvent(targetEvent);
    }

    // 4.3 GA4 네트워크 요청 확인
    console.log('\n📡 GA4 네트워크 요청 캡처:');
    this.printGA4Requests();

    // 4.4 GA4 DebugView 확인 대기 (실제 브라우저 모드에서만)
    if (!this.isHeadless && this.waitForDebugView) {
      console.log('\n⏸️  GA4 DebugView 확인을 위해 30초 대기합니다...');
      console.log('   💡 GA4 > Configure > DebugView에서 이벤트를 확인하세요.');
      console.log('   💡 https://analytics.google.com/analytics/web/#/m/p<PROPERTY_ID>/debugview');
      await this.page.waitForTimeout(30000); // 30초 대기
    }

    if (actualData.items && Array.isArray(actualData.items) && actualData.items.length > 0) {
      console.log('\n✅ 실제 GA4 전송 데이터 (전역변수/DOM 기반):');
      this.printActualData(actualData);

      // targetEvent에 실제 데이터 병합
      targetEvent = {
        timestamp: targetEvent?.timestamp || Date.now(),
        event: 'view_item',
        data: actualData,
        ecommerce: actualData,
      };
    } else {
      console.log('\n⚠️ 전역변수/DOM에서 상품 데이터를 찾을 수 없습니다.');
    }

    // 5. GA4 Config 기반 예측값 검증
    console.log('\n🔍 GA4 Config 기반 예측값 검증...');
    this.validatePredictionWithConfig(prediction, config.eventName);

    // 6. 예측 vs 실제 비교 검증
    console.log('\n🔍 예측 vs 실제 비교 검증...');
    const report = parameterValidator.validate(prediction, targetEvent || {
      timestamp: Date.now(),
      data: {},
    });
    report.url = config.url;

    parameterValidator.printValidationReport(report);

    // 피드백 분석기에 결과 추가
    feedbackAnalyzer.addValidationResult(report, config.url);

    // 7. 결과 저장 (GA4 Config 정보 포함)
    const { required, optional, item } = getParametersForEvent(config.eventName);
    const screenParams = getScreenExtractableParams(config.eventName);

    const resultPath = path.join(
      this.outputDir,
      `result_${config.eventName}_${Date.now()}.json`
    );
    fs.writeFileSync(
      resultPath,
      JSON.stringify(
        {
          config,
          ga4Config: {
            eventName: config.eventName,
            requiredParams: required.map(p => p.key),
            optionalParams: optional.map(p => p.key),
            itemParams: item.map(p => p.key),
            screenExtractableParams: screenParams.map(p => ({
              key: p.key,
              displayName: p.displayName,
              visionHint: p.visionHint,
            })),
          },
          prediction,
          actual: targetEvent,
          report,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );
    console.log(`\n💾 결과 저장: ${resultPath}`);

    return { prediction, actual: targetEvent || null, report };
  }

  /**
   * 이벤트별 파라미터 정보 출력 (GA4 Parameter Config 기반)
   */
  private printParameterInfo(eventName: string): void {
    console.log('\n📋 GA4 파라미터 설정 (ga4ParameterConfig 기준):');

    // 이벤트 요구사항 가져오기
    const eventReq = EVENT_PARAMETER_REQUIREMENTS.find(r => r.eventName === eventName);
    if (eventReq) {
      console.log(`   📌 이벤트: ${eventReq.displayName}`);
      console.log(`   📝 설명: ${eventReq.description}`);
    }

    // 새로운 GA4 config에서 파라미터 가져오기
    const { required, optional, item } = getParametersForEvent(eventName);

    console.log('\n   ✅ 필수 파라미터 (Required):');
    for (const param of required) {
      const visionIcon = param.visionHint ? '👁️' : '  ';
      console.log(`      ${visionIcon} ${param.key} - ${param.description.substring(0, 40)}...`);
    }

    console.log('\n   📋 선택 파라미터 (Optional):');
    for (const param of optional.slice(0, 5)) {
      const visionIcon = param.visionHint ? '👁️' : '  ';
      console.log(`      ${visionIcon} ${param.key} - ${param.description.substring(0, 40)}...`);
    }
    if (optional.length > 5) {
      console.log(`      ... 외 ${optional.length - 5}개`);
    }

    console.log('\n   📦 아이템 파라미터 (Item-level):');
    for (const param of item) {
      const visionIcon = param.visionHint ? '👁️' : '  ';
      const gtmIcon = param.gtmMapping ? '🏷️' : '  ';
      console.log(`      ${visionIcon}${gtmIcon} ${param.key}`);
    }

    // Vision AI 추출 가능한 파라미터
    const screenParams = getScreenExtractableParams(eventName);
    console.log(`\n   👁️ Vision AI 추출 가능: ${screenParams.length}개`);
    for (const param of screenParams.slice(0, 5)) {
      if (param.visionHint) {
        console.log(`      - ${param.key}: ${param.visionHint.locationHint}`);
      }
    }
    if (screenParams.length > 5) {
      console.log(`      ... 외 ${screenParams.length - 5}개`);
    }

    // 공통 변수 (기존 호환성 유지)
    const commonVars = getCommonVariablesForEvent(eventName);
    if (commonVars.length > 0) {
      console.log(`\n   🌐 공통 GTM 변수: ${commonVars.length}개`);
    }
  }

  /**
   * GA4 Config를 사용하여 예측값 검증
   */
  private validatePredictionWithConfig(prediction: ParameterValuePrediction, eventName: string): void {
    const { required, optional, item } = getParametersForEvent(eventName);
    const allParams = [...required, ...optional];

    let validCount = 0;
    let invalidCount = 0;
    const errors: string[] = [];

    console.log('\n   📊 Event-level 파라미터 검증:');

    // Event params 검증
    for (const [key, predValue] of Object.entries(prediction.eventParams)) {
      if (predValue && predValue.value !== null && predValue.value !== undefined) {
        const result = validateParameterValue(key, predValue.value);
        const status = result.valid ? '✅' : '❌';
        const paramDef = getParameterByKey(key);
        const displayName = paramDef?.displayName || key;

        if (result.valid) {
          validCount++;
          console.log(`      ${status} ${key}="${predValue.value}" (${displayName})`);
        } else {
          invalidCount++;
          console.log(`      ${status} ${key}="${predValue.value}" - ${result.errors[0]}`);
          errors.push(`${key}: ${result.errors[0]}`);
        }
      }
    }

    // Item params 검증
    if (prediction.items && prediction.items.length > 0) {
      console.log('\n   📦 Item-level 파라미터 검증:');

      for (let i = 0; i < prediction.items.length; i++) {
        const itemPred = prediction.items[i];
        console.log(`      [Item ${i}]`);

        for (const [key, predValue] of Object.entries(itemPred)) {
          if (predValue && predValue.value !== null && predValue.value !== undefined) {
            const result = validateParameterValue(key, predValue.value);
            const status = result.valid ? '✅' : '❌';

            if (result.valid) {
              validCount++;
            } else {
              invalidCount++;
              errors.push(`items[${i}].${key}: ${result.errors[0]}`);
            }

            const valueStr = String(predValue.value).substring(0, 30);
            console.log(`        ${status} ${key}="${valueStr}${String(predValue.value).length > 30 ? '...' : ''}"`);
          }
        }
      }
    }

    // 필수 파라미터 누락 체크
    console.log('\n   📌 필수 파라미터 체크:');
    for (const param of required) {
      const hasPrediction = prediction.eventParams[param.key]?.value !== undefined &&
                           prediction.eventParams[param.key]?.value !== null;
      const status = hasPrediction ? '✅' : '⚠️';
      console.log(`      ${status} ${param.key} (${param.displayName}): ${hasPrediction ? '예측됨' : '누락'}`);
      if (!hasPrediction) {
        errors.push(`필수 파라미터 누락: ${param.key}`);
      }
    }

    // 요약
    const total = validCount + invalidCount;
    const validPercent = total > 0 ? ((validCount / total) * 100).toFixed(1) : '0';

    console.log('\n   ═══════════════════════════════════════════════════════');
    console.log(`   📈 GA4 Config 검증 결과: ${validPercent}% 유효`);
    console.log(`      (${validCount}/${total} 파라미터 유효)`);

    if (errors.length > 0) {
      console.log('\n   ⚠️ 검증 오류:');
      for (const err of errors.slice(0, 5)) {
        console.log(`      - ${err}`);
      }
      if (errors.length > 5) {
        console.log(`      ... 외 ${errors.length - 5}개 오류`);
      }
    }
    console.log('   ═══════════════════════════════════════════════════════');
  }

  private printPrediction(prediction: ParameterValuePrediction): void {
    console.log(`   이벤트: ${prediction.eventName}`);

    if (Object.keys(prediction.eventParams).length > 0) {
      console.log('   Event Params:');
      for (const [key, val] of Object.entries(prediction.eventParams)) {
        if (val) {
          console.log(`     - ${key}: ${val.value} (${val.confidence})`);
        }
      }
    }

    if (prediction.items && prediction.items.length > 0) {
      console.log('   Items:');
      prediction.items.forEach((item, index) => {
        console.log(`     [${index}]`);
        for (const [key, val] of Object.entries(item)) {
          if (val) {
            console.log(`       - ${key}: ${val.value} (${val.confidence})`);
          }
        }
      });
    }
  }

  private printDataLayerEvent(event: DataLayerEvent): void {
    console.log(`   Event: ${event.event || '(no event name)'}`);

    if (event.ecommerce) {
      if (event.ecommerce.currency) {
        console.log(`   Currency: ${event.ecommerce.currency}`);
      }
      if (event.ecommerce.value !== undefined) {
        console.log(`   Value: ${event.ecommerce.value}`);
      }
      if (event.ecommerce.items && event.ecommerce.items.length > 0) {
        console.log('   Items:');
        event.ecommerce.items.forEach((item, index) => {
          console.log(`     [${index}]`);
          for (const [key, val] of Object.entries(item)) {
            if (val !== undefined && val !== null) {
              console.log(`       - ${key}: ${val}`);
            }
          }
        });
      }
    }
  }

  private printGlobalVariables(globalVars: GlobalVariableCapture): void {
    const keys = Object.keys(globalVars.customVariables);
    if (keys.length === 0 && !globalVars.productInfo && !globalVars.digitalData) {
      console.log('   전역변수에서 상품 데이터를 찾을 수 없습니다.');
      return;
    }

    if (globalVars.productInfo) {
      console.log('   📦 productInfo:');
      this.printObjectPreview(globalVars.productInfo, '     ');
    }

    if (globalVars.digitalData) {
      console.log('   📦 digitalData:');
      this.printObjectPreview(globalVars.digitalData, '     ');
    }

    for (const [key, value] of Object.entries(globalVars.customVariables)) {
      console.log(`   📦 ${key}:`);
      if (typeof value === 'object') {
        this.printObjectPreview(value as Record<string, unknown>, '     ');
      } else {
        console.log(`     ${value}`);
      }
    }
  }

  private printObjectPreview(obj: Record<string, unknown>, indent: string, maxDepth: number = 2): void {
    const entries = Object.entries(obj).slice(0, 10); // 최대 10개 항목
    for (const [key, value] of entries) {
      if (value === null || value === undefined) continue;

      if (typeof value === 'object' && maxDepth > 0) {
        console.log(`${indent}${key}:`);
        if (Array.isArray(value)) {
          console.log(`${indent}  (배열, ${value.length}개 항목)`);
          if (value.length > 0 && typeof value[0] === 'object') {
            this.printObjectPreview(value[0] as Record<string, unknown>, indent + '    ', maxDepth - 1);
          }
        } else {
          this.printObjectPreview(value as Record<string, unknown>, indent + '  ', maxDepth - 1);
        }
      } else {
        const strValue = String(value).substring(0, 50);
        console.log(`${indent}${key}: ${strValue}${String(value).length > 50 ? '...' : ''}`);
      }
    }
    if (Object.keys(obj).length > 10) {
      console.log(`${indent}... (${Object.keys(obj).length - 10}개 더 있음)`);
    }
  }

  private printDOMData(domData: Record<string, unknown>): void {
    console.log('   추출된 DOM 데이터:');
    for (const [key, value] of Object.entries(domData)) {
      if (key === 'jsonLd' && typeof value === 'object') {
        console.log('   📑 JSON-LD (Product Schema):');
        const ld = value as Record<string, unknown>;
        if (ld.name) console.log(`     name: ${ld.name}`);
        if (ld.brand) console.log(`     brand: ${JSON.stringify(ld.brand)}`);
        if (ld.offers) console.log(`     offers: ${JSON.stringify(ld.offers)}`);
      } else {
        console.log(`   ${key}: ${value}`);
      }
    }
  }

  private printGA4Requests(): void {
    if (this.ga4Requests.length === 0) {
      console.log('   GA4 요청이 캡처되지 않았습니다.');
      return;
    }

    console.log(`   총 ${this.ga4Requests.length}개 GA4 요청 캡처됨`);

    // view_item 이벤트 찾기
    const viewItemRequests = this.ga4Requests.filter(req =>
      req.params.en === 'view_item' || req.url.includes('en=view_item')
    );

    if (viewItemRequests.length > 0) {
      console.log(`   📦 view_item 요청 (${viewItemRequests.length}개):`);
      for (const req of viewItemRequests) {
        console.log('   Parameters:');
        // 주요 파라미터만 출력
        const importantParams = ['en', 'pr1', 'pr1nm', 'pr1id', 'pr1br', 'pr1ca', 'pr1pr', 'cu', 'ep.currency', 'ep.value'];
        for (const key of importantParams) {
          if (req.params[key]) {
            console.log(`     ${key}: ${req.params[key]}`);
          }
        }
        // items 파라미터 (JSON encoded) 찾기
        for (const [key, value] of Object.entries(req.params)) {
          if (key.startsWith('ep.') || key.startsWith('pr') || key.startsWith('items')) {
            if (!importantParams.includes(key)) {
              console.log(`     ${key}: ${value.substring(0, 100)}${value.length > 100 ? '...' : ''}`);
            }
          }
        }
      }
    } else {
      console.log('   view_item 이벤트 요청을 찾을 수 없습니다.');
      console.log('   캡처된 이벤트:');
      const eventNames = [...new Set(this.ga4Requests.map(r => r.params.en || '(unknown)'))];
      console.log(`     ${eventNames.join(', ')}`);
    }
  }

  private printActualData(data: Record<string, unknown>): void {
    if (data.currency) console.log(`   currency: ${data.currency}`);
    if (data.value !== undefined) console.log(`   value: ${data.value}`);

    if (data.items && Array.isArray(data.items)) {
      console.log('   items:');
      (data.items as Record<string, unknown>[]).forEach((item, index) => {
        console.log(`     [${index}]`);
        for (const [key, val] of Object.entries(item)) {
          if (val !== undefined && val !== null) {
            console.log(`       - ${key}: ${val}`);
          }
        }
      });
    }
  }

  /**
   * 전역변수, DOM, dataLayer에서 실제 GA4 데이터를 구성합니다.
   */
  private buildActualDataFromSources(
    globalVars: GlobalVariableCapture,
    domData: Record<string, unknown> | null,
    dataLayerEvent: DataLayerEvent | undefined
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {
      items: [] as Record<string, unknown>[],
    };

    // 1. __NUXT__ 또는 다른 SSR 데이터에서 추출
    if (globalVars.customVariables.__NUXT__) {
      const nuxt = globalVars.customVariables.__NUXT__ as Record<string, unknown>;
      const productData = this.findProductInNuxtState(nuxt);
      if (productData) {
        (result.items as Record<string, unknown>[]).push(productData);
      }
    }

    // 2. JSON-LD에서 추출
    if (domData?.jsonLd) {
      const jsonLd = domData.jsonLd as Record<string, unknown>;
      const item: Record<string, unknown> = {};

      if (jsonLd.name) item.item_name = jsonLd.name;
      if (jsonLd.sku) item.item_id = jsonLd.sku;
      if (jsonLd.brand) {
        const brand = jsonLd.brand as Record<string, unknown>;
        item.item_brand = brand.name || brand;
      }
      if (jsonLd.offers) {
        const offers = jsonLd.offers as Record<string, unknown>;
        if (offers.price) item.price = Number(offers.price);
        if (offers.priceCurrency) result.currency = offers.priceCurrency;
      }

      if (Object.keys(item).length > 0) {
        const existingItems = result.items as Record<string, unknown>[];
        if (existingItems.length === 0) {
          existingItems.push(item);
        } else {
          // 기존 아이템에 병합
          Object.assign(existingItems[0], item);
        }
      }
    }

    // 3. meta 태그에서 추출
    if (domData) {
      if (domData.item_name) {
        const items = result.items as Record<string, unknown>[];
        if (items.length === 0) items.push({});
        items[0].item_name = items[0].item_name || domData.item_name;
      }
      if (domData.price) {
        const items = result.items as Record<string, unknown>[];
        if (items.length === 0) items.push({});
        items[0].price = items[0].price || Number(domData.price);
      }
      if (domData.currency) {
        result.currency = result.currency || domData.currency;
      }
    }

    // 4. dataLayer에서 ecommerce 데이터 추출
    if (dataLayerEvent?.ecommerce?.items) {
      const items = result.items as Record<string, unknown>[];
      if (items.length === 0) {
        result.items = dataLayerEvent.ecommerce.items;
      }
      if (dataLayerEvent.ecommerce.currency) {
        result.currency = result.currency || dataLayerEvent.ecommerce.currency;
      }
      if (dataLayerEvent.ecommerce.value !== undefined) {
        result.value = result.value || dataLayerEvent.ecommerce.value;
      }
    }

    // 5. value 계산 (items의 price 합계)
    const items = result.items as Record<string, unknown>[];
    if (items.length > 0 && result.value === undefined) {
      const totalValue = items.reduce((sum, item) => {
        const price = Number(item.price) || 0;
        const qty = Number(item.quantity) || 1;
        return sum + price * qty;
      }, 0);
      if (totalValue > 0) {
        result.value = totalValue;
      }
    }

    return result;
  }

  /**
   * Nuxt 상태에서 상품 정보를 찾습니다.
   */
  private findProductInNuxtState(nuxt: Record<string, unknown>): Record<string, unknown> | null {
    // Nuxt 상태 구조 탐색
    const searchForProduct = (obj: unknown, depth: number = 0): Record<string, unknown> | null => {
      if (depth > 5 || !obj || typeof obj !== 'object') return null;

      const o = obj as Record<string, unknown>;

      // 상품 정보로 보이는 필드 탐색
      if (o.productName || o.product_name || o.itemName || o.item_name) {
        return {
          item_name: o.productName || o.product_name || o.itemName || o.item_name,
          item_id: o.productId || o.product_id || o.itemId || o.item_id || o.prodCode || o.onlineProdCode,
          price: o.price || o.salePrice || o.sellPrice,
          item_brand: o.brandName || o.brand_name || o.brandNm,
          item_category: o.categoryName || o.category_name || o.categoryNm,
        };
      }

      // 재귀 탐색
      for (const value of Object.values(o)) {
        if (typeof value === 'object' && value !== null) {
          const result = searchForProduct(value, depth + 1);
          if (result) return result;
        }
      }

      return null;
    };

    return searchForProduct(nuxt);
  }

  async runAllTests(): Promise<void> {
    const results: ValidationReport[] = [];

    for (const config of TEST_CONFIGS) {
      try {
        const { report } = await this.runTest(config);
        results.push(report);
      } catch (error: any) {
        console.error(`\n❌ 테스트 실패 (${config.eventName}): ${error.message}`);
      }
    }

    // 전체 요약
    this.printSummary(results);

    // 피드백 분석
    this.printFeedbackAnalysis();
  }

  private printSummary(results: ValidationReport[]): void {
    console.log('\n' + '═'.repeat(70));
    console.log('📊 전체 테스트 요약');
    console.log('═'.repeat(70));

    let totalParams = 0;
    let matchedParams = 0;

    for (const report of results) {
      totalParams += report.accuracy.totalParams;
      matchedParams += report.accuracy.matchedParams;

      console.log(`\n${report.eventName}: ${report.accuracy.accuracyPercent}%`);
      console.log(
        `  (${report.accuracy.matchedParams}/${report.accuracy.totalParams} 파라미터 일치)`
      );

      if (report.accuracy.mismatches.length > 0) {
        console.log('  불일치:');
        for (const m of report.accuracy.mismatches) {
          console.log(`    - ${m.param}: "${m.predicted}" ≠ "${m.actual}"`);
        }
      }
    }

    const overallAccuracy =
      totalParams > 0 ? ((matchedParams / totalParams) * 100).toFixed(1) : '0';

    console.log('\n' + '─'.repeat(70));
    console.log(`📈 전체 정확도: ${overallAccuracy}%`);
    console.log(`   (${matchedParams}/${totalParams} 파라미터 일치)`);
  }

  private printFeedbackAnalysis(): void {
    console.log('\n' + '═'.repeat(70));
    console.log('📝 피드백 분석 (가이드 개선 제안)');
    console.log('═'.repeat(70));

    const patterns = feedbackAnalyzer.analyzePatterns();

    if (patterns.length === 0) {
      console.log('\n✅ 모든 파라미터가 일치합니다. 가이드 개선이 필요하지 않습니다.');
      return;
    }

    console.log('\n🔍 발견된 불일치 패턴:');
    for (const pattern of patterns) {
      console.log(`\n  [${pattern.pattern}] (${pattern.occurrences}회 발생)`);
      console.log(`    제안: ${pattern.suggestedFix}`);
      if (pattern.examples.length > 0) {
        console.log('    예시:');
        for (const ex of pattern.examples) {
          console.log(`      - "${ex.predicted}" → "${ex.actual}" (${ex.event})`);
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 메인 실행
// ═══════════════════════════════════════════════════════════════════════════

function parseArgs(): { headless: boolean; waitForDebugView: boolean } {
  const args = process.argv.slice(2);
  return {
    headless: args.includes('--headless') || args.includes('-h'),
    waitForDebugView: !args.includes('--no-wait') && !args.includes('-n'),
  };
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY가 설정되지 않았습니다.');
    process.exit(1);
  }

  const { headless, waitForDebugView } = parseArgs();

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     GA4 파라미터 값 예측 테스트                            ║');
  console.log('║     Vision AI vs dataLayer 비교 검증                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('사용법:');
  console.log('  npx ts-node src/test-parameter-prediction.ts');
  console.log('    기본: 실제 브라우저 + GA4 DebugView 30초 대기');
  console.log('');
  console.log('  npx ts-node src/test-parameter-prediction.ts --headless');
  console.log('    헤드리스 모드 (빠른 테스트, DebugView 확인 불가)');
  console.log('');
  console.log('  npx ts-node src/test-parameter-prediction.ts --no-wait');
  console.log('    실제 브라우저 + DebugView 대기 없이 빠르게 진행');
  console.log('');

  const tester = new ParameterPredictionTester(apiKey);

  try {
    await tester.initialize({ headless, waitForDebugView });
    await tester.runAllTests();
  } catch (error: any) {
    console.error('❌ 오류 발생:', error.message);
    throw error;
  } finally {
    await tester.cleanup();
    console.log('\n=== 테스트 완료 ===');
  }
}

main().catch(console.error);
