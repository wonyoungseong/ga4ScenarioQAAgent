/**
 * GTM 설정 로더
 *
 * 시나리오 작성 전에 모든 자료를 미리 파싱하여 준비합니다:
 * 1. 개발가이드 PDF - 이벤트 정의, 전송 시점
 * 2. 공통 변수 appendix PDF - 페이지 타입 정의
 * 3. GTM JSON - 트리거 조건, Content Group 매핑
 *
 * 이렇게 미리 준비된 데이터를 사용하면 시나리오 작성이 빨라집니다.
 */

import * as fs from 'fs';
import * as path from 'path';
import { GTMPageMappingExtractor, EventPageMapping, VariablePageMapping } from '../analyzers/gtmPageMappingExtractor';
import {
  DevelopmentGuideParser,
  ParsedEventDefinition,
  parsePageTypeDefinitionsFromAppendix,
  PageTypeDefinition,
  PageTypeDefinitions,
  comparePageTypeMappings,
  PageTypeMismatch
} from '../parsers/developmentGuideParser';
import { PageType } from '../types/pageContext';

/**
 * 미리 로드된 GTM 설정
 */
export interface PreloadedGTMConfig {
  // 소스 파일 경로
  sources: {
    gtmJsonPath: string;
    devGuidePdfPath?: string;
    appendixPdfPath?: string;
  };

  // 페이지 타입 정의 (appendix에서 파싱)
  pageTypeDefinitions: PageTypeDefinition[];

  // GTM Content Group lookup table
  contentGroupLookup: Map<string, string>;

  // GTM에 정의된 페이지 타입 목록
  gtmDefinedPageTypes: string[];

  // 이벤트-페이지 매핑 (GTM 트리거에서 추출)
  eventPageMappings: Map<string, EventPageMapping>;

  // 개발가이드에서 파싱한 이벤트 정의
  eventDefinitions: ParsedEventDefinition[];

  // GA4 표준 이벤트-페이지 매핑
  ga4StandardMappings: Record<string, string[]>;

  // appendix vs GTM 불일치 목록
  pageTypeMismatches: PageTypeMismatch[];

  // 로드 시간
  loadedAt: Date;
}

/**
 * GTM 설정 로더 옵션
 */
export interface GTMConfigLoaderOptions {
  gtmJsonPath: string;
  devGuidePdfPath?: string;
  appendixPdfPath?: string;
}

/**
 * GTM 설정을 미리 로드하는 클래스
 */
export class GTMConfigLoader {
  private config: PreloadedGTMConfig | null = null;
  private options: GTMConfigLoaderOptions;

  constructor(options: GTMConfigLoaderOptions) {
    this.options = options;
  }

  /**
   * 모든 설정을 미리 로드합니다.
   * 이 메소드는 시나리오 작성 전에 한 번만 호출하면 됩니다.
   */
  async preload(): Promise<PreloadedGTMConfig> {
    console.log('📦 GTM 설정 로드 시작...');
    const startTime = Date.now();

    // 1. GTM JSON 파싱
    console.log('  ├─ GTM JSON 파싱 중...');
    const gtmExtractor = new GTMPageMappingExtractor(this.options.gtmJsonPath);
    const contentGroupLookup = gtmExtractor.extractContentGroupLookupTable();
    const gtmDefinedPageTypes = gtmExtractor.getDefinedPageTypesInGTM();
    const eventPageMappings = gtmExtractor.extractEventPageMappings();

    // 2. 공통 변수 appendix PDF 파싱 (있는 경우)
    let pageTypeDefinitions: PageTypeDefinition[] = [];
    if (this.options.appendixPdfPath && fs.existsSync(this.options.appendixPdfPath)) {
      console.log('  ├─ 공통 변수 appendix PDF 파싱 중...');
      const appendixResult = await parsePageTypeDefinitionsFromAppendix(this.options.appendixPdfPath);
      pageTypeDefinitions = appendixResult.pageTypes;
    } else {
      // 기본 페이지 타입 정의 사용
      console.log('  ├─ 기본 페이지 타입 정의 사용');
      pageTypeDefinitions = this.getDefaultPageTypeDefinitions();
    }

    // 3. 개발가이드 PDF 파싱 (있는 경우)
    let eventDefinitions: ParsedEventDefinition[] = [];
    if (this.options.devGuidePdfPath && fs.existsSync(this.options.devGuidePdfPath)) {
      console.log('  ├─ 개발가이드 PDF 파싱 중...');
      const parser = new DevelopmentGuideParser(this.options.devGuidePdfPath);
      const result = await parser.parse();
      if (result.success) {
        eventDefinitions = result.events;
      }
    }

    // 4. GA4 표준 매핑 로드
    console.log('  ├─ GA4 표준 매핑 로드 중...');
    const ga4StandardMappings = DevelopmentGuideParser.getAllGA4StandardMappings();

    // 5. appendix vs GTM 불일치 감지
    console.log('  ├─ 불일치 감지 중...');
    const pageTypeMismatches = comparePageTypeMappings(pageTypeDefinitions, contentGroupLookup);

    const elapsed = Date.now() - startTime;
    console.log(`  └─ ✅ 로드 완료 (${elapsed}ms)`);

    // 불일치 경고 출력
    if (pageTypeMismatches.length > 0) {
      console.log(`\n⚠️  페이지 타입 불일치 ${pageTypeMismatches.length}개 감지:`);
      const appendixOnly = pageTypeMismatches.filter(m => m.inAppendix && !m.inGTM);
      if (appendixOnly.length > 0) {
        console.log(`   GTM에 매핑 없는 타입: ${appendixOnly.map(m => m.pageType).join(', ')}`);
      }
    }

    this.config = {
      sources: {
        gtmJsonPath: this.options.gtmJsonPath,
        devGuidePdfPath: this.options.devGuidePdfPath,
        appendixPdfPath: this.options.appendixPdfPath,
      },
      pageTypeDefinitions,
      contentGroupLookup,
      gtmDefinedPageTypes,
      eventPageMappings,
      eventDefinitions,
      ga4StandardMappings,
      pageTypeMismatches,
      loadedAt: new Date(),
    };

    return this.config;
  }

  /**
   * 미리 로드된 설정을 반환합니다.
   * preload()를 먼저 호출해야 합니다.
   */
  getConfig(): PreloadedGTMConfig {
    if (!this.config) {
      throw new Error('설정이 로드되지 않았습니다. preload()를 먼저 호출하세요.');
    }
    return this.config;
  }

  /**
   * 설정이 로드되었는지 확인합니다.
   */
  isLoaded(): boolean {
    return this.config !== null;
  }

  /**
   * 특정 이벤트가 특정 페이지에서 발생 가능한지 확인합니다.
   * 미리 로드된 데이터를 사용하므로 빠릅니다.
   */
  isEventAllowedOnPage(eventName: string, pageType: PageType): {
    allowed: boolean;
    reason: string;
    confidence: number;
    source: 'gtm' | 'devguide' | 'ga4_standard' | 'default';
  } {
    const config = this.getConfig();

    // 1. GTM 트리거 조건 확인 (가장 높은 우선순위)
    const gtmMapping = config.eventPageMappings.get(eventName);
    if (gtmMapping && gtmMapping.confidence >= 75) {
      if (gtmMapping.allowedPageTypes.includes(pageType)) {
        return {
          allowed: true,
          reason: `GTM 트리거 조건: ${gtmMapping.allowedPageTypes.join(', ')}`,
          confidence: gtmMapping.confidence,
          source: 'gtm'
        };
      } else {
        return {
          allowed: false,
          reason: `GTM 트리거 조건: ${gtmMapping.allowedPageTypes.join(', ')} (현재: ${pageType})`,
          confidence: gtmMapping.confidence,
          source: 'gtm'
        };
      }
    }

    // 2. 개발가이드 확인
    const devGuideEvent = config.eventDefinitions.find(e => e.eventName === eventName);
    if (devGuideEvent && devGuideEvent.allowedPageTypes.length > 0) {
      if (devGuideEvent.allowedPageTypes.includes(pageType) || devGuideEvent.allowedPageTypes.includes('ALL')) {
        return {
          allowed: true,
          reason: `개발가이드: ${devGuideEvent.firingCondition}`,
          confidence: 80,
          source: 'devguide'
        };
      } else {
        return {
          allowed: false,
          reason: `개발가이드: ${devGuideEvent.allowedPageTypes.join(', ')} (현재: ${pageType})`,
          confidence: 80,
          source: 'devguide'
        };
      }
    }

    // 3. GA4 표준 매핑 확인
    const ga4Mapping = config.ga4StandardMappings[eventName];
    if (ga4Mapping) {
      if (ga4Mapping.includes(pageType)) {
        return {
          allowed: true,
          reason: `GA4 표준: ${ga4Mapping.join(', ')}`,
          confidence: 70,
          source: 'ga4_standard'
        };
      } else {
        return {
          allowed: false,
          reason: `GA4 표준: ${ga4Mapping.join(', ')} (현재: ${pageType})`,
          confidence: 70,
          source: 'ga4_standard'
        };
      }
    }

    // 4. 기본: 허용
    return {
      allowed: true,
      reason: '매핑 정보 없음 - 기본 허용',
      confidence: 30,
      source: 'default'
    };
  }

  /**
   * 특정 페이지 타입에서 발생 가능한 이벤트 목록을 반환합니다.
   */
  getEventsForPageType(pageType: PageType): {
    eventName: string;
    source: string;
    confidence: number;
  }[] {
    const config = this.getConfig();
    const events: { eventName: string; source: string; confidence: number }[] = [];

    // GTM 이벤트
    for (const [eventName, mapping] of config.eventPageMappings) {
      if (mapping.allowedPageTypes.includes(pageType)) {
        events.push({
          eventName,
          source: 'gtm',
          confidence: mapping.confidence
        });
      }
    }

    // 개발가이드 이벤트
    for (const event of config.eventDefinitions) {
      if (event.allowedPageTypes.includes(pageType) || event.allowedPageTypes.includes('ALL')) {
        if (!events.find(e => e.eventName === event.eventName)) {
          events.push({
            eventName: event.eventName,
            source: 'devguide',
            confidence: 80
          });
        }
      }
    }

    // GA4 표준 이벤트
    for (const [eventName, pageTypes] of Object.entries(config.ga4StandardMappings)) {
      if (pageTypes.includes(pageType)) {
        if (!events.find(e => e.eventName === eventName)) {
          events.push({
            eventName,
            source: 'ga4_standard',
            confidence: 70
          });
        }
      }
    }

    return events.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 페이지 타입 정의를 반환합니다.
   */
  getPageTypeDefinition(pageType: string): PageTypeDefinition | undefined {
    return this.getConfig().pageTypeDefinitions.find(p => p.pageType === pageType);
  }

  /**
   * AP_DATA_PAGETYPE 값이 GTM에서 어떻게 매핑되는지 확인합니다.
   */
  getMappedContentGroup(apDataPageType: string): string | undefined {
    return this.getConfig().contentGroupLookup.get(apDataPageType);
  }

  /**
   * 요약 정보를 출력합니다.
   */
  printSummary(): void {
    const config = this.getConfig();

    console.log('\n=== GTM 설정 요약 ===');
    console.log(`로드 시간: ${config.loadedAt.toISOString()}`);
    console.log(`\n📄 소스 파일:`);
    console.log(`  - GTM JSON: ${config.sources.gtmJsonPath}`);
    console.log(`  - 개발가이드: ${config.sources.devGuidePdfPath || '없음'}`);
    console.log(`  - Appendix: ${config.sources.appendixPdfPath || '없음'}`);

    console.log(`\n📊 로드된 데이터:`);
    console.log(`  - 페이지 타입 정의: ${config.pageTypeDefinitions.length}개`);
    console.log(`  - GTM Content Group 매핑: ${config.contentGroupLookup.size}개`);
    console.log(`  - GTM 이벤트-페이지 매핑: ${config.eventPageMappings.size}개`);
    console.log(`  - 개발가이드 이벤트 정의: ${config.eventDefinitions.length}개`);
    console.log(`  - GA4 표준 매핑: ${Object.keys(config.ga4StandardMappings).length}개`);

    if (config.pageTypeMismatches.length > 0) {
      console.log(`\n⚠️  불일치: ${config.pageTypeMismatches.length}개`);
      const appendixOnly = config.pageTypeMismatches.filter(m => m.inAppendix && !m.inGTM);
      if (appendixOnly.length > 0) {
        console.log(`  GTM에 매핑 없는 타입: ${appendixOnly.map(m => m.pageType).join(', ')}`);
      }
    }
  }

  /**
   * 기본 페이지 타입 정의
   */
  private getDefaultPageTypeDefinitions(): PageTypeDefinition[] {
    return [
      { pageType: 'MAIN', description: '메인 페이지', note: 'required' },
      { pageType: 'BRAND_MAIN', description: '브랜드 메인 페이지 (AP몰만 해당)', note: 'recommend' },
      { pageType: 'PRODUCT_DETAIL', description: '상품 상세 페이지', note: 'required' },
      { pageType: 'PRODUCT_LIST', description: '상품 리스트 페이지', note: 'recommend' },
      { pageType: 'SEARCH_RESULT', description: '검색 결과 페이지', note: 'required' },
      { pageType: 'CART', description: '장바구니 페이지', note: 'recommend' },
      { pageType: 'ORDER', description: '주문서 페이지', note: 'recommend' },
      { pageType: 'MY', description: '마이 페이지', note: 'recommend' },
      { pageType: 'EVENT_LIST', description: '이벤트 리스트 페이지', note: 'recommend' },
      { pageType: 'EVENT_DETAIL', description: '이벤트 상세 페이지', note: 'required' },
      { pageType: 'LIVE_LIST', description: '라이브 리스트', note: 'recommend' },
      { pageType: 'LIVE_DETAIL', description: '라이브 상세 페이지', note: 'required' },
      { pageType: 'OTHERS', description: '그 외 모두', note: 'recommend' },
    ];
  }
}

/**
 * 기본 경로로 GTM 설정 로더를 생성합니다.
 */
export function createDefaultGTMConfigLoader(): GTMConfigLoader {
  return new GTMConfigLoader({
    gtmJsonPath: path.join(process.cwd(), 'GTM-5FK5X5C4_workspace112.json'),
    devGuidePdfPath: path.join(process.cwd(), '[EC]+WEB+개발+가이드_GTM코드추가(Shopify)1.1.pdf'),
    appendixPdfPath: path.join(process.cwd(), '공통 변수 appendix.pdf'),
  });
}

// 싱글톤 인스턴스 (전역에서 공유)
let globalConfigLoader: GTMConfigLoader | null = null;

/**
 * 전역 GTM 설정 로더를 초기화하고 반환합니다.
 * 한 번만 초기화되며, 이후 호출에서는 캐시된 설정을 반환합니다.
 */
export async function getGlobalGTMConfig(): Promise<PreloadedGTMConfig> {
  if (!globalConfigLoader) {
    globalConfigLoader = createDefaultGTMConfigLoader();
    await globalConfigLoader.preload();
  }
  return globalConfigLoader.getConfig();
}

/**
 * 전역 GTM 설정 로더를 반환합니다.
 * 아직 초기화되지 않았으면 null을 반환합니다.
 */
export function getGlobalGTMConfigLoader(): GTMConfigLoader | null {
  return globalConfigLoader;
}
