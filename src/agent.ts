import * as fs from 'fs';
import * as path from 'path';
import { PageAnalyzer, MatchedElement } from './analyzers/pageAnalyzer';
import { GeminiVisionAnalyzer, VisionAnalysisResult, GTMContext } from './analyzers/visionAnalyzer';
import { GTMAnalyzer, GTMTrigger } from './analyzers/gtmAnalyzer';
import { GTMDocumentGenerator, GTMEventDocument } from './analyzers/gtmDocumentGenerator';
import { SpecLoader, LoadedSpecs, EventSpec } from './loaders/specLoader';
import { ScenarioGenerator, ScenarioGeneratorInput } from './generators/scenarioGenerator';
import { EventScenario } from './types/scenario';
import { initializeJourneyRegistry, journeyRegistry } from './config/journeyRegistry';

export interface ParameterValidation {
  requiredParams: Array<{name: string; devVar: string; description: string}>;
  optionalParams: Array<{name: string; devVar: string; description: string}>;
  dataLayerEvent: string;
  variablePrefix: string;
}

export interface AnalysisResult {
  url: string;
  timestamp: string;
  screenshotPath: string;
  eventName: string;
  siteId?: string;  // 사이트 ID
  visionAnalysis: VisionAnalysisResult;
  gtmTriggers?: string[];  // 사용된 GTM 트리거 조건
  parameterValidation?: ParameterValidation;  // 파라미터 검증 정보
  /** 구조화된 시나리오 (Crawler/Validation Agent용) */
  scenario?: EventScenario;
}

export class ScenarioAgent {
  private pageAnalyzer: PageAnalyzer;
  private visionAnalyzer: GeminiVisionAnalyzer | null = null;
  private gtmAnalyzer: GTMAnalyzer | null = null;
  private gtmDocGenerator: GTMDocumentGenerator | null = null;
  private specLoader: SpecLoader;
  private scenarioGenerator: ScenarioGenerator;
  private outputDir: string;
  private guidesDir: string;
  private specsDir: string;
  private gtmPath: string | null = null;
  private currentSiteId: string | null = null;

  constructor(options: {
    outputDir?: string;
    guidesDir?: string;
    specsDir?: string;  // 스펙 폴더 경로
    geminiApiKey?: string;
    gtmJsonPath?: string;  // GTM JSON 파일 경로
    siteId?: string;  // 사이트 ID (예: "amorepacific_GTM-5FK5X5C4")
  } = {}) {
    this.outputDir = options.outputDir || './output';
    this.guidesDir = options.guidesDir || './guides';
    this.specsDir = options.specsDir || './specs';
    this.pageAnalyzer = new PageAnalyzer();
    this.specLoader = new SpecLoader(this.specsDir);
    this.scenarioGenerator = new ScenarioGenerator(this.specLoader);

    // 사이트 ID 저장
    if (options.siteId) {
      this.currentSiteId = options.siteId;
    }

    // Gemini API 키가 있으면 Vision 분석기 초기화
    const apiKey = options.geminiApiKey || process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.visionAnalyzer = new GeminiVisionAnalyzer(apiKey, this.guidesDir, this.specLoader);
    }

    // GTM JSON 파일이 있으면 GTM 분석기 초기화 + Journey Registry 초기화
    if (options.gtmJsonPath && fs.existsSync(options.gtmJsonPath)) {
      this.gtmAnalyzer = new GTMAnalyzer(options.gtmJsonPath);
      this.gtmDocGenerator = new GTMDocumentGenerator(options.gtmJsonPath);
      this.gtmPath = options.gtmJsonPath;

      // GTM JSON 기반으로 Journey Registry 초기화
      initializeJourneyRegistry(options.gtmJsonPath);
      console.log(`📊 Journey Registry 초기화 완료 (${journeyRegistry.getAllJourneys().length}개 Journey 생성)`);
    }

    // 출력 디렉토리 생성
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * 사용 가능한 사이트 목록 반환
   */
  getAvailableSites(): string[] {
    return this.specLoader.getAvailableSites();
  }

  /**
   * 현재 사이트 ID 설정
   */
  setSiteId(siteId: string): void {
    this.currentSiteId = siteId;
  }

  async analyze(url: string, eventName: string, siteId?: string): Promise<AnalysisResult> {
    // siteId가 파라미터로 전달되면 사용, 아니면 constructor에서 설정된 값 사용
    const effectiveSiteId = siteId || this.currentSiteId;

    console.log(`\n🔍 분석 시작: ${url}`);
    console.log(`📋 대상 이벤트: ${eventName}`);
    if (effectiveSiteId) {
      console.log(`🏢 사이트: ${effectiveSiteId}`);
    }

    if (!this.visionAnalyzer) {
      throw new Error(
        'GEMINI_API_KEY가 설정되지 않았습니다.\n' +
        '환경 변수를 설정하거나 .env 파일에 GEMINI_API_KEY를 추가하세요.'
      );
    }

    // 가이드 파일 존재 확인
    const guidePath = path.join(this.guidesDir, `${eventName}.md`);
    if (!fs.existsSync(guidePath)) {
      const available = this.getAvailableEvents();
      throw new Error(
        `알 수 없는 이벤트: ${eventName}\n` +
        `사용 가능한 이벤트: ${available.join(', ')}\n` +
        `새 이벤트를 추가하려면 guides/${eventName}.md 파일을 생성하세요.`
      );
    }

    let gtmTriggers: string[] = [];
    let matchedElements: MatchedElement[] = [];
    let gtmTriggerObjects: GTMTrigger[] = [];
    let eventSpec: EventSpec | undefined;

    try {
      // 브라우저 초기화
      console.log('\n🌐 브라우저 시작...');
      await this.pageAnalyzer.init();

      // 페이지 이동
      console.log('📄 페이지 로딩...');
      await this.pageAnalyzer.navigateTo(url);

      // 스크린샷 캡처
      console.log('📸 스크린샷 캡처...');
      const screenshotPath = await this.pageAnalyzer.captureScreenshot(this.outputDir);
      console.log(`   저장 위치: ${screenshotPath}`);

      let visionAnalysis: VisionAnalysisResult;

      // GTM 분석기가 있으면 GTM 기반 분석 수행
      if (this.gtmAnalyzer && this.gtmDocGenerator) {
        console.log('\n📊 GTM 트리거 분석 중...');

        // GTM 문서 생성
        const gtmDoc = this.gtmDocGenerator.generateEventDocument(eventName);
        if (gtmDoc) {
          console.log(`   이벤트 카테고리: ${gtmDoc.eventCategory}`);
          console.log(`   트리거 타입: ${gtmDoc.trigger.typeDescription}`);
        }

        const triggers = this.gtmAnalyzer.getEventTriggers(eventName);
        gtmTriggerObjects = triggers; // 트리거 객체 저장

        if (triggers.length > 0 || gtmDoc) {
          // CSS Selector 추출 (GTM 문서 또는 트리거에서)
          let cssSelectors: string[] = [];

          if (gtmDoc?.domElements.selector) {
            cssSelectors = [gtmDoc.domElements.selector];
          } else {
            cssSelectors = triggers
              .filter(t => t.cssSelector)
              .map(t => t.cssSelector as string);
          }

          gtmTriggers = cssSelectors;

          console.log(`   트리거 조건: ${cssSelectors.join(', ') || '(없음)'}`);

          // DOM에서 해당 요소 찾기
          console.log('\n🔎 DOM에서 매칭 요소 검색 중...');
          let matchedElementsDesc = '해당 조건에 맞는 요소를 찾을 수 없습니다.';

          if (cssSelectors.length > 0) {
            for (const selector of cssSelectors) {
              const elements = await this.pageAnalyzer.findElementsBySelector(selector);
              matchedElements.push(...elements); // 매칭 요소 저장
            }

            if (matchedElements.length > 0) {
              matchedElementsDesc = this.pageAnalyzer.formatMatchedElements(matchedElements);
              console.log(`   ${matchedElements.length}개의 매칭 요소 발견`);
            } else {
              console.log('   매칭 요소 없음');
            }
          }

          // GTM Context 생성 (문서 기반 향상된 컨텍스트)
          let triggerDescription = this.gtmAnalyzer.getEventTriggerDescription(eventName);

          // GTM 문서가 있으면 더 풍부한 컨텍스트 제공
          if (gtmDoc) {
            triggerDescription = this.gtmDocGenerator.formatAsReadableDocument(gtmDoc);
          }

          const gtmContext: GTMContext = {
            triggerDescription,
            cssSelectors,
            matchedElements: matchedElementsDesc
          };

          // GTM 기반 Vision AI 분석
          console.log('\n🤖 Gemini Vision AI 분석 중...');
          console.log('   (GTM 문서 + DOM 매칭 + 스크린샷 종합 분석)');

          visionAnalysis = await this.visionAnalyzer.analyzeWithGTMContext(
            screenshotPath,
            eventName,
            url,
            gtmContext,
            effectiveSiteId || undefined
          );
        } else {
          console.log('   GTM에서 트리거 조건을 찾을 수 없음, 시각적 분석만 수행');
          visionAnalysis = await this.visionAnalyzer.analyzeScreenshot(
            screenshotPath,
            eventName,
            url,
            effectiveSiteId || undefined
          );
        }
      } else if (this.gtmAnalyzer) {
        // GTM 문서 생성기 없이 기존 GTM 분석기만 사용
        console.log('\n📊 GTM 트리거 분석 중...');
        const triggers = this.gtmAnalyzer.getEventTriggers(eventName);

        if (triggers.length > 0) {
          const cssSelectors = triggers
            .filter(t => t.cssSelector)
            .map(t => t.cssSelector as string);

          gtmTriggers = cssSelectors;
          console.log(`   트리거 조건: ${cssSelectors.join(', ') || '(없음)'}`);

          let matchedElementsDesc = '해당 조건에 맞는 요소를 찾을 수 없습니다.';
          if (cssSelectors.length > 0) {
            const allMatched: any[] = [];
            for (const selector of cssSelectors) {
              const elements = await this.pageAnalyzer.findElementsBySelector(selector);
              allMatched.push(...elements);
            }
            if (allMatched.length > 0) {
              matchedElementsDesc = this.pageAnalyzer.formatMatchedElements(allMatched);
              console.log(`   ${allMatched.length}개의 매칭 요소 발견`);
            }
          }

          const gtmContext: GTMContext = {
            triggerDescription: this.gtmAnalyzer.getEventTriggerDescription(eventName),
            cssSelectors,
            matchedElements: matchedElementsDesc
          };

          console.log('\n🤖 Gemini Vision AI 분석 중...');
          visionAnalysis = await this.visionAnalyzer.analyzeWithGTMContext(
            screenshotPath,
            eventName,
            url,
            gtmContext,
            effectiveSiteId || undefined
          );
        } else {
          visionAnalysis = await this.visionAnalyzer.analyzeScreenshot(
            screenshotPath,
            eventName,
            url,
            effectiveSiteId || undefined
          );
        }
      } else {
        // GTM 분석기가 없으면 기존 시각적 분석만 수행
        console.log('\n🤖 Gemini Vision AI 분석 중...');
        console.log('   (스크린샷을 AI가 시각적으로 분석합니다)');

        visionAnalysis = await this.visionAnalyzer.analyzeScreenshot(
          screenshotPath,
          eventName,
          url,
          effectiveSiteId || undefined
        );
      }

      console.log(`\n   ✅ 발생해야 하는 시나리오: ${visionAnalysis.shouldFire.length}개`);
      console.log(`   ❌ 발생하면 안 되는 시나리오: ${visionAnalysis.shouldNotFire.length}개`);

      // 파라미터 검증 정보 생성
      let parameterValidation: ParameterValidation | undefined;
      if (effectiveSiteId) {
        parameterValidation = this.specLoader.generateValidationInfo(effectiveSiteId, eventName) || undefined;
        if (parameterValidation) {
          console.log(`   📋 필수 파라미터: ${parameterValidation.requiredParams.length}개`);
        }
        // 이벤트 스펙 로드
        eventSpec = this.specLoader.getEventSpec(effectiveSiteId, eventName) || undefined;
      }

      // 구조화된 시나리오 생성 (Crawler/Validation Agent용)
      console.log('\n📋 구조화된 시나리오 생성 중...');
      const scenarioInput: ScenarioGeneratorInput = {
        pageUrl: url,
        eventName,
        siteId: effectiveSiteId || 'unknown',
        screenshotPath,
        visionAnalysis,
        gtmTriggers: gtmTriggerObjects.length > 0 ? gtmTriggerObjects : undefined,
        matchedElements: matchedElements.length > 0 ? matchedElements : undefined,
        eventSpec,
        dataLayerEventName: parameterValidation?.dataLayerEvent
      };

      const scenario = this.scenarioGenerator.generate(scenarioInput);
      console.log(`   Whitelist 요소: ${scenario.whitelist.elements.length}개`);
      console.log(`   제외 요소: ${scenario.explicitExclusions.length}개`);
      console.log(`   크롤러 테스트 순서: ${scenario.crawlerGuide.recommendedTestOrder.length}개`);

      const result: AnalysisResult = {
        url,
        timestamp: new Date().toISOString(),
        screenshotPath,
        eventName,
        siteId: effectiveSiteId || undefined,
        visionAnalysis,
        gtmTriggers: gtmTriggers.length > 0 ? gtmTriggers : undefined,
        parameterValidation,
        scenario
      };

      // JSON 결과 저장 (기존 형식)
      const jsonPath = path.join(this.outputDir, `result_${eventName}_${Date.now()}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf-8');
      console.log(`\n💾 결과 저장: ${jsonPath}`);

      // 구조화된 시나리오 별도 저장 (Crawler/Validation용)
      const scenarioPath = path.join(this.outputDir, `scenario_${eventName}_${Date.now()}.json`);
      fs.writeFileSync(scenarioPath, JSON.stringify(scenario, null, 2), 'utf-8');
      console.log(`📋 크롤러용 시나리오: ${scenarioPath}`);

      // 보고서 출력
      const report = this.formatReport(result);
      console.log('\n' + report);

      // 보고서 파일 저장
      const reportPath = path.join(this.outputDir, `report_${eventName}_${Date.now()}.txt`);
      fs.writeFileSync(reportPath, report, 'utf-8');

      return result;
    } finally {
      await this.pageAnalyzer.close();
    }
  }

  private formatReport(result: AnalysisResult): string {
    const lines: string[] = [];
    const va = result.visionAnalysis;

    lines.push('='.repeat(80));
    lines.push('🤖 GTM 기반 시나리오 분석 보고서');
    lines.push('='.repeat(80));
    lines.push('');
    lines.push(`URL: ${result.url}`);
    lines.push(`분석 시간: ${result.timestamp}`);
    lines.push(`대상 이벤트: ${result.eventName}`);
    if (result.siteId) {
      lines.push(`사이트 ID: ${result.siteId}`);
    }
    lines.push(`스크린샷: ${result.screenshotPath}`);

    if (result.gtmTriggers && result.gtmTriggers.length > 0) {
      lines.push(`GTM 트리거: ${result.gtmTriggers.join(', ')}`);
    }
    lines.push('');

    // GTM 분석 결과가 있으면 표시
    if (va.gtmAnalysis) {
      lines.push('-'.repeat(80));
      lines.push('📊 GTM 트리거 분석');
      lines.push('-'.repeat(80));
      lines.push(va.gtmAnalysis);
      lines.push('');
    }

    lines.push('-'.repeat(80));
    lines.push('📋 AI 분석 요약');
    lines.push('-'.repeat(80));
    lines.push(va.reasoning);
    lines.push('');

    lines.push('-'.repeat(80));
    lines.push(`✅ ${result.eventName} 이벤트가 발생해야 하는 시나리오 (${va.shouldFire.length}개)`);
    lines.push('-'.repeat(80));

    if (va.shouldFire.length === 0) {
      lines.push('해당하는 요소가 없습니다.');
    } else {
      va.shouldFire.forEach((scenario, index) => {
        lines.push('');
        lines.push(`[${index + 1}] ${scenario.elementDescription}`);
        lines.push(`    📍 위치: ${scenario.location}`);
        lines.push(`    🖱️ 행동: ${scenario.action}`);
        lines.push(`    💡 이유: ${scenario.reason}`);
        lines.push(`    🎯 확신도: ${scenario.confidence}`);
      });
    }

    lines.push('');
    lines.push('-'.repeat(80));
    lines.push(`❌ ${result.eventName} 이벤트가 발생하면 안 되는 시나리오 (${va.shouldNotFire.length}개)`);
    lines.push('-'.repeat(80));

    if (va.shouldNotFire.length === 0) {
      lines.push('해당하는 요소가 없습니다.');
    } else {
      va.shouldNotFire.forEach((scenario, index) => {
        lines.push('');
        lines.push(`[${index + 1}] ${scenario.elementDescription}`);
        lines.push(`    📍 위치: ${scenario.location}`);
        lines.push(`    🖱️ 행동: ${scenario.action}`);
        lines.push(`    💡 이유: ${scenario.reason}`);
        lines.push(`    🎯 확신도: ${scenario.confidence}`);
      });
    }

    // 파라미터 검증 정보 표시
    if (result.parameterValidation) {
      const pv = result.parameterValidation;
      lines.push('');
      lines.push('-'.repeat(80));
      lines.push('📋 파라미터 검증 정보');
      lines.push('-'.repeat(80));
      lines.push('');
      lines.push(`dataLayer 이벤트: ${pv.dataLayerEvent}`);
      lines.push(`변수 접두사: ${pv.variablePrefix}`);
      lines.push('');

      if (pv.requiredParams.length > 0) {
        lines.push('필수 파라미터:');
        pv.requiredParams.forEach(p => {
          lines.push(`  - ${p.name} (${p.devVar}): ${p.description}`);
        });
        lines.push('');
      }

      if (pv.optionalParams.length > 0) {
        lines.push('선택 파라미터:');
        pv.optionalParams.forEach(p => {
          lines.push(`  - ${p.name} (${p.devVar}): ${p.description}`);
        });
      }
    }

    lines.push('');
    lines.push('='.repeat(80));

    return lines.join('\n');
  }

  getAvailableEvents(): string[] {
    if (this.visionAnalyzer) {
      return this.visionAnalyzer.getAvailableEvents();
    }

    // 가이드 폴더에서 직접 읽기
    if (fs.existsSync(this.guidesDir)) {
      const files = fs.readdirSync(this.guidesDir);
      return files
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace('.md', ''));
    }

    return [];
  }

  /**
   * GTM에서 발견된 모든 이벤트 목록 반환
   */
  getGTMEvents(): string[] {
    if (this.gtmDocGenerator) {
      return this.gtmDocGenerator.getAvailableEvents();
    }
    return [];
  }

  /**
   * GTM 이벤트 요약 보고서 생성
   */
  getGTMEventSummary(): string {
    if (this.gtmDocGenerator) {
      return this.gtmDocGenerator.generateEventSummary();
    }
    return 'GTM 분석기가 초기화되지 않았습니다.';
  }

  /**
   * 특정 이벤트의 GTM 문서 생성
   */
  getGTMEventDocument(eventName: string): GTMEventDocument | null {
    if (this.gtmDocGenerator) {
      return this.gtmDocGenerator.generateEventDocument(eventName);
    }
    return null;
  }

  /**
   * 특정 이벤트의 GTM 문서를 읽을 수 있는 형태로 반환
   */
  getGTMEventDocumentAsText(eventName: string): string {
    if (this.gtmDocGenerator) {
      const doc = this.gtmDocGenerator.generateEventDocument(eventName);
      if (doc) {
        return this.gtmDocGenerator.formatAsReadableDocument(doc);
      }
      return `${eventName} 이벤트를 찾을 수 없습니다.`;
    }
    return 'GTM 분석기가 초기화되지 않았습니다.';
  }

  /**
   * Vision AI 분석용 프롬프트 생성
   */
  getVisionPrompt(eventName: string, pageUrl: string): string | null {
    if (this.gtmDocGenerator) {
      return this.gtmDocGenerator.generateVisionPrompt(eventName, pageUrl);
    }
    return null;
  }
}
