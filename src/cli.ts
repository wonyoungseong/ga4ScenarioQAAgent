#!/usr/bin/env node

import { config } from 'dotenv';
config(); // .env 파일 로드

import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { ScenarioAgent } from './agent';
import { GA4Client, GA4AdminClient } from './ga4';
import { GeminiVisionAnalyzer } from './analyzers/visionAnalyzer';
import {
  FunnelScenarioDesigner,
  FunnelScenario,
  SCENARIO_TEMPLATES,
} from './scenario/funnelScenarioDesigner';

const program = new Command();

program
  .name('scenario-agent')
  .description('Vision AI 기반 QA 자동화 시나리오 생성 에이전트')
  .version('2.0.0');

program
  .command('analyze')
  .description('웹 페이지를 Vision AI로 분석하고 이벤트 시나리오를 생성합니다')
  .requiredOption('-u, --url <url>', '분석할 페이지 URL')
  .requiredOption('-e, --event <event>', '분석할 이벤트 이름 (예: select_item, view_item)')
  .option('-s, --site <siteId>', '사이트 ID (예: amorepacific_GTM-5FK5X5C4)')
  .option('-o, --output <dir>', '결과 출력 디렉토리', './output')
  .option('-g, --guides <dir>', '가이드 문서 디렉토리', './guides')
  .option('--specs <dir>', '스펙 문서 디렉토리', './specs')
  .option('-k, --api-key <key>', 'Gemini API 키 (또는 GEMINI_API_KEY 환경변수 사용)')
  .option('--gtm <path>', 'GTM JSON 파일 경로')
  .action(async (options) => {
    console.log(chalk.cyan('\n╔════════════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║') + chalk.yellow.bold('         🤖 Vision AI 시나리오 에이전트 v2.1.0                 ') + chalk.cyan('║'));
    console.log(chalk.cyan('║') + chalk.gray('         Gemini Vision + 사이트별 스펙 기반 QA 자동화          ') + chalk.cyan('║'));
    console.log(chalk.cyan('╚════════════════════════════════════════════════════════════════╝\n'));

    try {
      const agent = new ScenarioAgent({
        outputDir: options.output,
        guidesDir: options.guides,
        specsDir: options.specs,
        geminiApiKey: options.apiKey,
        gtmJsonPath: options.gtm,
        siteId: options.site
      });

      // 사이트 ID가 지정되었으면 표시
      if (options.site) {
        console.log(chalk.blue(`📋 사이트 스펙 사용: ${options.site}`));
      }

      await agent.analyze(options.url, options.event.toLowerCase(), options.site);

      console.log(chalk.green('\n✨ Vision AI 분석 완료!'));
    } catch (error: any) {
      console.error(chalk.red(`\n❌ 오류 발생: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('sites')
  .description('등록된 사이트 목록을 표시합니다')
  .option('--specs <dir>', '스펙 문서 디렉토리', './specs')
  .action((options) => {
    console.log(chalk.cyan('\n🏢 등록된 사이트 목록:\n'));

    const sitesDir = path.join(options.specs, 'sites');
    if (!fs.existsSync(sitesDir)) {
      console.log(chalk.yellow('사이트 디렉토리가 없습니다. specs/sites/ 폴더를 생성하세요.'));
      return;
    }

    const sites = fs.readdirSync(sitesDir).filter(f => {
      const sitePath = path.join(sitesDir, f);
      return fs.statSync(sitePath).isDirectory();
    });

    if (sites.length === 0) {
      console.log(chalk.yellow('등록된 사이트가 없습니다.'));
      return;
    }

    sites.forEach(site => {
      const configPath = path.join(sitesDir, site, 'site_config.yaml');
      let siteName = site;

      if (fs.existsSync(configPath)) {
        try {
          const yaml = require('js-yaml');
          const config = yaml.load(fs.readFileSync(configPath, 'utf-8'));
          siteName = config.site_info?.name || site;
        } catch (e) {
          // ignore
        }
      }

      // 이벤트 수 세기
      const eventsDir = path.join(sitesDir, site, 'events');
      let eventCount = 0;
      if (fs.existsSync(eventsDir)) {
        eventCount = fs.readdirSync(eventsDir).filter(f => f.endsWith('.yaml')).length;
      }

      console.log(chalk.yellow(`  ${site}`));
      console.log(chalk.gray(`    이름: ${siteName}`));
      console.log(chalk.gray(`    이벤트 스펙: ${eventCount}개`));
      console.log('');
    });

    console.log(chalk.gray('사용 방법: npx ts-node src/cli.ts analyze -u <URL> -e <EVENT> -s <SITE_ID>'));
  });

program
  .command('events')
  .description('사용 가능한 이벤트 목록을 표시합니다')
  .option('-g, --guides <dir>', '가이드 문서 디렉토리', './guides')
  .option('-s, --site <siteId>', '사이트 ID (사이트별 이벤트 표시)')
  .option('--specs <dir>', '스펙 문서 디렉토리', './specs')
  .action((options) => {
    console.log(chalk.cyan('\n📋 사용 가능한 이벤트 목록:\n'));

    const guidesDir = options.guides;
    if (!fs.existsSync(guidesDir)) {
      console.log(chalk.yellow('가이드 디렉토리가 없습니다. guides/ 폴더를 생성하세요.'));
      return;
    }

    const files = fs.readdirSync(guidesDir).filter(f => f.endsWith('.md'));

    if (files.length === 0) {
      console.log(chalk.yellow('정의된 이벤트가 없습니다. guides/ 폴더에 이벤트 가이드 파일을 추가하세요.'));
      return;
    }

    files.forEach(file => {
      const eventName = file.replace('.md', '');
      const content = fs.readFileSync(path.join(guidesDir, file), 'utf-8');

      // 첫 번째 ## 이벤트 정의 섹션에서 설명 추출
      const descMatch = content.match(/## 이벤트 정의\n([^\n]+)/);
      const description = descMatch ? descMatch[1].trim() : '설명 없음';

      console.log(chalk.yellow(`  ${eventName}`));
      console.log(chalk.gray(`    ${description}`));
      console.log('');
    });

    console.log(chalk.gray('새 이벤트를 추가하려면 guides/<EVENT_NAME>.md 파일을 생성하세요.'));
  });

program
  .command('init')
  .description('새 이벤트 가이드 템플릿을 생성합니다')
  .argument('<eventName>', '생성할 이벤트 이름')
  .option('-g, --guides <dir>', '가이드 문서 디렉토리', './guides')
  .action((eventName, options) => {
    const guidesDir = options.guides;

    if (!fs.existsSync(guidesDir)) {
      fs.mkdirSync(guidesDir, { recursive: true });
    }

    const filePath = path.join(guidesDir, `${eventName.toUpperCase()}.md`);

    if (fs.existsSync(filePath)) {
      console.log(chalk.yellow(`이미 존재하는 이벤트입니다: ${filePath}`));
      return;
    }

    const template = `# ${eventName.toUpperCase()} 이벤트 가이드

## 이벤트 정의
[이 이벤트가 언제 발생해야 하는지 설명하세요]

## 시각적 판단 기준

### 이벤트가 발생해야 하는 요소 (Should Fire)

1. **요소 유형 1**
   - 설명
   - 시각적 특징

2. **요소 유형 2**
   - 설명
   - 시각적 특징

### 이벤트가 발생하면 안 되는 요소 (Should NOT Fire)

1. **요소 유형 1**
   - 설명
   - 대신 어떤 이벤트가 발생해야 하는지

2. **요소 유형 2**
   - 설명
   - 대신 어떤 이벤트가 발생해야 하는지

## 시각적 특징 (Visual Cues)

이 이벤트의 대상 요소를 식별하는 시각적 단서:
- 특징 1
- 특징 2
- 특징 3

## 예시 시나리오

\`\`\`
✅ Should Fire:
- 예시 1
- 예시 2

❌ Should NOT Fire:
- 예시 1
- 예시 2
\`\`\`

## 데이터 스키마 (참고)

\`\`\`javascript
{
  event: "${eventName.toLowerCase()}",
  // 이벤트 데이터 구조
}
\`\`\`
`;

    fs.writeFileSync(filePath, template, 'utf-8');
    console.log(chalk.green(`✅ 이벤트 가이드 템플릿 생성: ${filePath}`));
    console.log(chalk.gray('\n파일을 열어 이벤트 가이드를 작성하세요.'));
  });

// ========================================
// GA4 Data API Commands
// ========================================

const ga4 = program
  .command('ga4')
  .description('GA4 Data API 관련 명령어');

// GA4 클라이언트 생성 헬퍼 (Access Token 방식)
function createGA4ClientWithToken(propertyId: string, accessToken: string): GA4Client {
  return new GA4Client({
    propertyId,
    accessToken,
  });
}

// 저장된 토큰 또는 환경변수에서 Access Token 가져오기
function getAccessToken(): string | null {
  // 1. 환경변수에서 확인
  if (process.env.GA4_ACCESS_TOKEN) {
    return process.env.GA4_ACCESS_TOKEN;
  }

  // 2. 저장된 토큰 파일에서 확인
  const tokenPath = './credentials/ga4_tokens.json';
  if (fs.existsSync(tokenPath)) {
    try {
      const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
      return tokens.access_token || null;
    } catch {
      return null;
    }
  }

  return null;
}

ga4
  .command('set-token')
  .description('Access Token을 설정합니다 (Google OAuth Playground에서 발급)')
  .requiredOption('-t, --token <accessToken>', 'Access Token')
  .option('-p, --property <id>', 'GA4 Property ID')
  .action(async (options) => {
    console.log(chalk.cyan('\n🔑 GA4 Access Token 설정\n'));

    const tokenPath = './credentials/ga4_tokens.json';
    const dir = path.dirname(tokenPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tokenData = {
      access_token: options.token,
      property_id: options.property || process.env.GA4_PROPERTY_ID,
      saved_at: new Date().toISOString(),
    };

    fs.writeFileSync(tokenPath, JSON.stringify(tokenData, null, 2));
    console.log(chalk.green(`✅ 토큰이 저장되었습니다: ${tokenPath}`));

    if (tokenData.property_id) {
      console.log(chalk.gray(`   Property ID: ${tokenData.property_id}`));
    } else {
      console.log(chalk.yellow('\n⚠️  Property ID가 설정되지 않았습니다.'));
      console.log(chalk.gray('   .env 파일에 GA4_PROPERTY_ID를 추가하거나'));
      console.log(chalk.gray('   명령어 실행 시 -p 옵션을 사용하세요.'));
    }

    console.log(chalk.blue('\n💡 토큰 발급 방법:'));
    console.log(chalk.gray('   1. https://developers.google.com/oauthplayground/ 접속'));
    console.log(chalk.gray('   2. Step 1: Google Analytics Admin API v1 + Data API v1 선택'));
    console.log(chalk.gray('      - https://www.googleapis.com/auth/analytics.readonly'));
    console.log(chalk.gray('      - https://www.googleapis.com/auth/analytics.edit (계정 조회용)'));
    console.log(chalk.gray('   3. Authorize APIs 클릭 → Google 계정 로그인'));
    console.log(chalk.gray('   4. Step 2: Exchange authorization code for tokens'));
    console.log(chalk.gray('   5. Access token 복사'));
  });

ga4
  .command('accounts')
  .description('GA4 계정 목록을 조회합니다')
  .option('-t, --token <accessToken>', 'Access Token')
  .action(async (options) => {
    console.log(chalk.cyan('\n📋 GA4 계정 목록\n'));

    const accessToken = options.token || getAccessToken();
    if (!accessToken) {
      console.error(chalk.red('❌ Access Token이 필요합니다.'));
      console.error(chalk.gray('   먼저 토큰을 설정하세요: npx ts-node src/cli.ts ga4 set-token -t <TOKEN>'));
      process.exit(1);
    }

    try {
      const adminClient = new GA4AdminClient(accessToken);
      await adminClient.initialize();

      const accounts = await adminClient.listAccounts();

      if (accounts.length === 0) {
        console.log(chalk.yellow('조회 가능한 계정이 없습니다.'));
        return;
      }

      console.log(chalk.yellow(`  ${'계정 ID'.padEnd(15)} ${'계정명'}`));
      console.log(chalk.gray('  ' + '-'.repeat(50)));

      for (const account of accounts) {
        console.log(`  ${account.accountId.padEnd(15)} ${account.displayName}`);
      }

      console.log(chalk.gray(`\n  총 ${accounts.length}개 계정`));
      console.log(chalk.blue('\n💡 속성 조회: npx ts-node src/cli.ts ga4 properties -a <ACCOUNT_ID>'));
    } catch (error: any) {
      console.error(chalk.red(`❌ 오류: ${error.message}`));
      process.exit(1);
    }
  });

ga4
  .command('properties')
  .description('GA4 속성 목록을 조회합니다')
  .option('-t, --token <accessToken>', 'Access Token')
  .option('-a, --account <accountId>', '특정 계정 ID로 필터링')
  .action(async (options) => {
    console.log(chalk.cyan('\n🏠 GA4 속성 목록\n'));

    const accessToken = options.token || getAccessToken();
    if (!accessToken) {
      console.error(chalk.red('❌ Access Token이 필요합니다.'));
      process.exit(1);
    }

    try {
      const adminClient = new GA4AdminClient(accessToken);
      await adminClient.initialize();

      const properties = await adminClient.listProperties(options.account);

      if (properties.length === 0) {
        console.log(chalk.yellow('조회 가능한 속성이 없습니다.'));
        return;
      }

      console.log(chalk.yellow(`  ${'Property ID'.padEnd(15)} ${'속성명'.padEnd(30)} ${'시간대'}`));
      console.log(chalk.gray('  ' + '-'.repeat(70)));

      for (const prop of properties) {
        console.log(`  ${prop.propertyId.padEnd(15)} ${prop.displayName.padEnd(30)} ${prop.timeZone}`);
      }

      console.log(chalk.gray(`\n  총 ${properties.length}개 속성`));
      console.log(chalk.blue('\n💡 속성 선택 후 이벤트 조회:'));
      console.log(chalk.gray('   npx ts-node src/cli.ts ga4 set-token -t <TOKEN> -p <PROPERTY_ID>'));
      console.log(chalk.gray('   npx ts-node src/cli.ts ga4 events'));
    } catch (error: any) {
      console.error(chalk.red(`❌ 오류: ${error.message}`));
      process.exit(1);
    }
  });

ga4
  .command('list')
  .description('모든 계정과 속성을 계층 구조로 조회합니다')
  .option('-t, --token <accessToken>', 'Access Token')
  .action(async (options) => {
    console.log(chalk.cyan('\n🌳 GA4 계정 및 속성 목록\n'));

    const accessToken = options.token || getAccessToken();
    if (!accessToken) {
      console.error(chalk.red('❌ Access Token이 필요합니다.'));
      process.exit(1);
    }

    try {
      const adminClient = new GA4AdminClient(accessToken);
      await adminClient.initialize();

      const accountsWithProperties = await adminClient.listAccountsWithProperties();

      if (accountsWithProperties.size === 0) {
        console.log(chalk.yellow('조회 가능한 계정이 없습니다.'));
        return;
      }

      let totalProperties = 0;

      for (const [account, properties] of accountsWithProperties) {
        console.log(chalk.yellow(`\n📁 ${account.displayName} (${account.accountId})`));

        if (properties.length === 0) {
          console.log(chalk.gray('   (속성 없음)'));
        } else {
          for (const prop of properties) {
            console.log(chalk.white(`   └─ 🏠 ${prop.displayName}`));
            console.log(chalk.gray(`      Property ID: ${prop.propertyId} | ${prop.timeZone}`));
            totalProperties++;
          }
        }
      }

      console.log(chalk.gray(`\n총 ${accountsWithProperties.size}개 계정, ${totalProperties}개 속성`));
      console.log(chalk.blue('\n💡 Property ID를 복사하여 이벤트를 조회하세요:'));
      console.log(chalk.gray('   npx ts-node src/cli.ts ga4 events -p <PROPERTY_ID>'));
    } catch (error: any) {
      console.error(chalk.red(`❌ 오류: ${error.message}`));
      process.exit(1);
    }
  });

ga4
  .command('test')
  .description('GA4 연결을 테스트합니다')
  .option('-p, --property <id>', 'GA4 Property ID')
  .option('-t, --token <accessToken>', 'Access Token (또는 저장된 토큰 사용)')
  .action(async (options) => {
    console.log(chalk.cyan('\n🔍 GA4 연결 테스트\n'));

    const propertyId = options.property || process.env.GA4_PROPERTY_ID;
    if (!propertyId) {
      console.error(chalk.red('❌ Property ID가 필요합니다.'));
      console.error(chalk.gray('   -p 옵션 또는 GA4_PROPERTY_ID 환경변수를 설정하세요.'));
      process.exit(1);
    }

    const accessToken = options.token || getAccessToken();
    if (!accessToken) {
      console.error(chalk.red('❌ Access Token이 필요합니다.'));
      console.error(chalk.gray('   먼저 토큰을 설정하세요: npx ts-node src/cli.ts ga4 set-token -t <TOKEN>'));
      process.exit(1);
    }

    try {
      const client = createGA4ClientWithToken(propertyId, accessToken);
      await client.testConnection();
    } catch (error: any) {
      console.error(chalk.red(`❌ 연결 실패: ${error.message}`));
      process.exit(1);
    }
  });

ga4
  .command('events')
  .description('수집된 이벤트 목록을 조회합니다')
  .option('-p, --property <id>', 'GA4 Property ID')
  .option('-t, --token <accessToken>', 'Access Token')
  .option('--start <date>', '시작일 (YYYY-MM-DD 또는 30daysAgo)', '30daysAgo')
  .option('--end <date>', '종료일 (YYYY-MM-DD 또는 today)', 'today')
  .option('-l, --limit <n>', '최대 개수', '50')
  .option('--ecommerce', 'E-commerce 이벤트만 조회')
  .option('--custom', '커스텀 이벤트만 조회 (자동 수집 제외)')
  .action(async (options) => {
    console.log(chalk.cyan('\n📊 GA4 이벤트 조회\n'));

    const propertyId = options.property || process.env.GA4_PROPERTY_ID;
    if (!propertyId) {
      console.error(chalk.red('❌ Property ID가 필요합니다.'));
      process.exit(1);
    }

    const accessToken = options.token || getAccessToken();
    if (!accessToken) {
      console.error(chalk.red('❌ Access Token이 필요합니다.'));
      console.error(chalk.gray('   먼저 토큰을 설정하세요: npx ts-node src/cli.ts ga4 set-token -t <TOKEN>'));
      process.exit(1);
    }

    try {
      const client = createGA4ClientWithToken(propertyId, accessToken);
      await client.initialize();

      const queryOptions = {
        startDate: options.start,
        endDate: options.end,
        limit: parseInt(options.limit, 10),
      };

      let events;
      if (options.ecommerce) {
        console.log(chalk.gray('E-commerce 이벤트만 조회합니다.\n'));
        events = await client.getEcommerceEvents(queryOptions);
      } else if (options.custom) {
        console.log(chalk.gray('커스텀 이벤트만 조회합니다 (자동 수집 제외).\n'));
        events = await client.getCustomEvents(queryOptions);
      } else {
        events = await client.getEvents(queryOptions);
      }

      console.log(chalk.yellow(`  ${'이벤트명'.padEnd(35)} ${'이벤트 수'.padStart(12)} ${'사용자 수'.padStart(12)}`));
      console.log(chalk.gray('  ' + '-'.repeat(60)));

      for (const event of events) {
        console.log(`  ${event.eventName.padEnd(35)} ${event.eventCount.toLocaleString().padStart(12)} ${event.totalUsers.toLocaleString().padStart(12)}`);
      }

      console.log(chalk.gray(`\n  총 ${events.length}개 이벤트`));
    } catch (error: any) {
      console.error(chalk.red(`❌ 오류: ${error.message}`));
      process.exit(1);
    }
  });

ga4
  .command('page-events')
  .description('페이지별 이벤트 수집 현황을 조회합니다')
  .option('-p, --property <id>', 'GA4 Property ID')
  .option('-t, --token <accessToken>', 'Access Token')
  .option('--path <pagePath>', '특정 페이지 경로 필터 (예: /product/)')
  .option('--start <date>', '시작일', '7daysAgo')
  .option('--end <date>', '종료일', 'today')
  .option('-l, --limit <n>', '최대 개수', '100')
  .action(async (options) => {
    console.log(chalk.cyan('\n📄 페이지별 이벤트 조회\n'));

    const propertyId = options.property || process.env.GA4_PROPERTY_ID;
    if (!propertyId) {
      console.error(chalk.red('❌ Property ID가 필요합니다.'));
      process.exit(1);
    }

    const accessToken = options.token || getAccessToken();
    if (!accessToken) {
      console.error(chalk.red('❌ Access Token이 필요합니다.'));
      process.exit(1);
    }

    try {
      const client = createGA4ClientWithToken(propertyId, accessToken);
      await client.initialize();

      const pageEvents = await client.getEventsByPage(options.path, {
        startDate: options.start,
        endDate: options.end,
        limit: parseInt(options.limit, 10),
      });

      // 페이지별로 그룹화
      const byPage = new Map<string, { eventName: string; eventCount: number }[]>();
      for (const pe of pageEvents) {
        if (!byPage.has(pe.pagePath)) {
          byPage.set(pe.pagePath, []);
        }
        byPage.get(pe.pagePath)!.push({
          eventName: pe.eventName,
          eventCount: pe.eventCount,
        });
      }

      for (const [pagePath, events] of byPage) {
        console.log(chalk.yellow(`\n  📍 ${pagePath}`));
        for (const event of events.slice(0, 10)) {  // 상위 10개만
          console.log(chalk.gray(`     ${event.eventName}: ${event.eventCount.toLocaleString()}`));
        }
        if (events.length > 10) {
          console.log(chalk.gray(`     ... 외 ${events.length - 10}개`));
        }
      }

      console.log(chalk.gray(`\n  총 ${byPage.size}개 페이지`));
    } catch (error: any) {
      console.error(chalk.red(`❌ 오류: ${error.message}`));
      process.exit(1);
    }
  });

ga4
  .command('realtime')
  .description('실시간 이벤트를 조회합니다 (최근 30분)')
  .option('-p, --property <id>', 'GA4 Property ID')
  .option('-t, --token <accessToken>', 'Access Token')
  .action(async (options) => {
    console.log(chalk.cyan('\n⚡ GA4 실시간 이벤트\n'));

    const propertyId = options.property || process.env.GA4_PROPERTY_ID;
    if (!propertyId) {
      console.error(chalk.red('❌ Property ID가 필요합니다.'));
      process.exit(1);
    }

    const accessToken = options.token || getAccessToken();
    if (!accessToken) {
      console.error(chalk.red('❌ Access Token이 필요합니다.'));
      process.exit(1);
    }

    try {
      const client = createGA4ClientWithToken(propertyId, accessToken);
      await client.initialize();

      const events = await client.getRealtimeEvents();

      console.log(chalk.yellow(`  ${'이벤트명'.padEnd(35)} ${'이벤트 수'.padStart(12)}`));
      console.log(chalk.gray('  ' + '-'.repeat(48)));

      for (const event of events) {
        console.log(`  ${event.eventName.padEnd(35)} ${event.eventCount.toLocaleString().padStart(12)}`);
      }

      console.log(chalk.gray(`\n  최근 30분간 ${events.length}개 이벤트 유형 발생`));
    } catch (error: any) {
      console.error(chalk.red(`❌ 오류: ${error.message}`));
      process.exit(1);
    }
  });

ga4
  .command('analyze-page')
  .description('페이지별 이벤트 비중을 분석하고 노이즈를 판별합니다')
  .requiredOption('--path <pagePath>', '분석할 페이지 경로 (예: /kr/ko/display/event_detail)')
  .option('-p, --property <id>', 'GA4 Property ID')
  .option('-t, --token <accessToken>', 'Access Token')
  .option('--start <date>', '시작일', '30daysAgo')
  .option('--end <date>', '종료일', 'today')
  .action(async (options) => {
    console.log(chalk.cyan('\n🔍 페이지 이벤트 비중 분석\n'));

    const propertyId = options.property || process.env.GA4_PROPERTY_ID;
    if (!propertyId) {
      console.error(chalk.red('❌ Property ID가 필요합니다.'));
      process.exit(1);
    }

    const accessToken = options.token || getAccessToken();
    if (!accessToken) {
      console.error(chalk.red('❌ Access Token이 필요합니다.'));
      process.exit(1);
    }

    try {
      const client = createGA4ClientWithToken(propertyId, accessToken);
      await client.initialize();

      console.log(chalk.gray(`페이지: ${options.path}`));
      console.log(chalk.gray(`기간: ${options.start} ~ ${options.end}\n`));

      const analysis = await client.analyzePageEvents(options.path, {
        startDate: options.start,
        endDate: options.end,
      });

      console.log(chalk.yellow(`  ${'이벤트명'.padEnd(30)} ${'수집건수'.padStart(14)} ${'비중(%)'.padStart(10)} ${'판정'.padStart(15)}`));
      console.log(chalk.gray('  ' + '-'.repeat(75)));

      for (const event of analysis.events) {
        let status = chalk.green('✅ 유의미');
        if (event.isNoise) {
          status = chalk.red('⚠️  노이즈');
        } else if (event.isLowSignificance) {
          status = chalk.yellow('📊 낮은 유의성');
        }

        console.log(`  ${event.eventName.padEnd(30)} ${event.eventCount.toLocaleString().padStart(14)} ${event.percentString.padStart(10)} ${status}`);
      }

      console.log(chalk.gray('\n' + '-'.repeat(77)));
      console.log(chalk.white(`  총 이벤트: ${analysis.totalEventCount.toLocaleString()}건`));
      console.log(chalk.green(`  유의미한 이벤트: ${analysis.significantEvents.length}개`));
      console.log(chalk.red(`  노이즈 이벤트: ${analysis.noiseEvents.length}개`));

      if (analysis.noiseEvents.length > 0) {
        console.log(chalk.gray(`\n  노이즈 목록: ${analysis.noiseEvents.join(', ')}`));
      }

      console.log(chalk.blue('\n💡 비중 0.01% 미만은 노이즈(오류/테스트)로 판단합니다.'));
    } catch (error: any) {
      console.error(chalk.red(`❌ 오류: ${error.message}`));
      process.exit(1);
    }
  });

ga4
  .command('compare')
  .description('에이전트 예측과 실제 GA4 데이터를 비교합니다')
  .requiredOption('--path <pagePath>', '비교할 페이지 경로')
  .requiredOption('--events <events>', '에이전트가 예측한 이벤트 목록 (쉼표 구분)')
  .option('-p, --property <id>', 'GA4 Property ID')
  .option('-t, --token <accessToken>', 'Access Token')
  .option('--start <date>', '시작일', '30daysAgo')
  .option('--end <date>', '종료일', 'today')
  .action(async (options) => {
    console.log(chalk.cyan('\n📊 에이전트 예측 vs GA4 실제 데이터 비교\n'));

    const propertyId = options.property || process.env.GA4_PROPERTY_ID;
    if (!propertyId) {
      console.error(chalk.red('❌ Property ID가 필요합니다.'));
      process.exit(1);
    }

    const accessToken = options.token || getAccessToken();
    if (!accessToken) {
      console.error(chalk.red('❌ Access Token이 필요합니다.'));
      process.exit(1);
    }

    try {
      const client = createGA4ClientWithToken(propertyId, accessToken);
      await client.initialize();

      const predictedEvents = options.events.split(',').map((e: string) => e.trim());

      console.log(chalk.gray(`페이지: ${options.path}`));
      console.log(chalk.gray(`예측 이벤트: ${predictedEvents.join(', ')}\n`));

      const result = await client.compareWithPredictions(options.path, predictedEvents, {
        startDate: options.start,
        endDate: options.end,
      });

      // 정확히 예측
      console.log(chalk.green(`✅ 정확히 예측한 이벤트 (${result.correctPredictions.length}개):`));
      if (result.correctPredictions.length > 0) {
        result.correctPredictions.forEach(e => console.log(chalk.gray(`   - ${e}`)));
      } else {
        console.log(chalk.gray('   (없음)'));
      }

      // 놓친 유의미 이벤트 (에이전트 개선 필요)
      console.log(chalk.red(`\n❌ 놓친 유의미 이벤트 (${result.missedEvents.length}개) - 에이전트 개선 필요:`));
      if (result.missedEvents.length > 0) {
        result.missedEvents.forEach(e => {
          const ev = result.analysis.events.find(a => a.eventName === e);
          console.log(chalk.gray(`   - ${e} (${ev?.percentString || '?'})`));
        });
      } else {
        console.log(chalk.gray('   (없음) - 모든 커스텀 이벤트 예측 성공!'));
      }

      // 잘못 예측
      console.log(chalk.yellow(`\n⚠️  잘못 예측한 이벤트 (${result.falsePredictions.length}개):`));
      if (result.falsePredictions.length > 0) {
        result.falsePredictions.forEach(e => console.log(chalk.gray(`   - ${e} (수집 안됨)`)));
      } else {
        console.log(chalk.gray('   (없음)'));
      }

      // GA4 자동 수집 이벤트 (미예측이 정상)
      if (result.missedAutoEvents.length > 0) {
        console.log(chalk.blue(`\n📋 GA4 자동 수집 이벤트 (미예측 정상): ${result.missedAutoEvents.join(', ')}`));
      }

      // 노이즈 (미예측이 정상)
      if (result.missedNoiseEvents.length > 0) {
        console.log(chalk.gray(`\n📊 미예측 노이즈 (정상): ${result.missedNoiseEvents.join(', ')}`));
      }

      // 정확도 계산 (자동 수집 이벤트 제외)
      const customSignificant = result.analysis.significantEvents.filter(e =>
        !['first_visit', 'session_start', 'page_view', 'scroll', 'click', 'view_search_results',
          'file_download', 'video_start', 'video_progress', 'video_complete', 'user_engagement', 'screen_view'].includes(e)
      );
      const correctCount = result.correctPredictions.filter(e => customSignificant.includes(e)).length;
      const accuracy = customSignificant.length > 0 ? (correctCount / customSignificant.length * 100).toFixed(1) : 100;

      console.log(chalk.cyan(`\n📈 커스텀 이벤트 예측 정확도: ${accuracy}% (${correctCount}/${customSignificant.length})`));
      console.log(chalk.gray('   (GA4 자동 수집 이벤트는 정확도 계산에서 제외)'));
    } catch (error: any) {
      console.error(chalk.red(`❌ 오류: ${error.message}`));
      process.exit(1);
    }
  });

ga4
  .command('setup')
  .description('GA4 연동 설정 가이드를 표시합니다')
  .action(() => {
    console.log(chalk.cyan('\n📚 GA4 Data API 설정 가이드 (Access Token 방식)\n'));

    console.log(chalk.yellow('1. Google OAuth Playground 접속'));
    console.log(chalk.gray('   https://developers.google.com/oauthplayground/\n'));

    console.log(chalk.yellow('2. Step 1: Select & authorize APIs'));
    console.log(chalk.gray('   다음 2개 API 선택 (계정 조회 + 데이터 조회):'));
    console.log(chalk.white('   ✓ Google Analytics Admin API v1'));
    console.log(chalk.gray('     - https://www.googleapis.com/auth/analytics.readonly'));
    console.log(chalk.white('   ✓ Google Analytics Data API v1'));
    console.log(chalk.gray('     - https://www.googleapis.com/auth/analytics.readonly'));
    console.log(chalk.gray('   → "Authorize APIs" 클릭\n'));

    console.log(chalk.yellow('3. Google 계정으로 로그인'));
    console.log(chalk.gray('   - GA4 속성에 접근 권한이 있는 계정으로 로그인'));
    console.log(chalk.gray('   - 권한 허용\n'));

    console.log(chalk.yellow('4. Step 2: Exchange authorization code for tokens'));
    console.log(chalk.gray('   - "Exchange authorization code for tokens" 클릭'));
    console.log(chalk.gray('   - Access token 복사\n'));

    console.log(chalk.yellow('5. 토큰 설정'));
    console.log(chalk.green('   npx ts-node src/cli.ts ga4 set-token -t <ACCESS_TOKEN>\n'));

    console.log(chalk.yellow('6. 계정/속성 목록 조회'));
    console.log(chalk.gray('   npx ts-node src/cli.ts ga4 list'));
    console.log(chalk.gray('   → Property ID 확인\n'));

    console.log(chalk.yellow('7. 이벤트 조회'));
    console.log(chalk.gray('   npx ts-node src/cli.ts ga4 events -p <PROPERTY_ID>\n'));

    console.log(chalk.blue('💡 토큰은 ./credentials/ga4_tokens.json에 저장됩니다.'));
    console.log(chalk.yellow('⚠️  Access Token은 1시간 후 만료됩니다. 만료 시 다시 발급하세요.\n'));
  });

// ========================================
// Funnel Scenario Commands
// ========================================

const funnel = program
  .command('funnel')
  .description('퍼널 시나리오 분석 관련 명령어');

funnel
  .command('scenarios')
  .description('사용 가능한 퍼널 시나리오 템플릿 목록을 표시합니다')
  .action(() => {
    console.log(chalk.cyan('\n╔════════════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║') + chalk.yellow.bold('              📋 퍼널 시나리오 템플릿 목록                      ') + chalk.cyan('║'));
    console.log(chalk.cyan('╚════════════════════════════════════════════════════════════════╝\n'));

    // 기본 시나리오
    const defaultScenario = FunnelScenarioDesigner.createDefaultEcommerceFunnel();

    console.log(chalk.yellow('📦 STANDARD_PURCHASE (기본)'));
    console.log(chalk.gray(`   ${defaultScenario.description}`));
    console.log(chalk.white(`   단계: ${defaultScenario.steps.map(s => s.eventName).join(' → ')}`));
    console.log(chalk.gray(`   일관성 규칙:`));
    console.log(chalk.red(`     🔴 CRITICAL: ${defaultScenario.consistencyRules.immutable.join(', ')}`));
    console.log(chalk.yellow(`     🟡 WARNING: ${defaultScenario.consistencyRules.recommended.join(', ')}`));
    console.log(chalk.green(`     🟢 INFO: ${defaultScenario.consistencyRules.allowChange.join(', ')}`));

    console.log('');

    // LIST_TO_PURCHASE 시나리오
    const listScenario = SCENARIO_TEMPLATES.LIST_TO_PURCHASE;
    console.log(chalk.yellow('📦 LIST_TO_PURCHASE'));
    console.log(chalk.gray(`   ${listScenario.description}`));
    console.log(chalk.white(`   단계: ${listScenario.steps.map(s => s.eventName).join(' → ')}`));
    console.log(chalk.gray(`   일관성 규칙:`));
    console.log(chalk.red(`     🔴 CRITICAL: ${listScenario.consistencyRules.immutable.join(', ')}`));
    console.log(chalk.yellow(`     🟡 WARNING: ${listScenario.consistencyRules.recommended.join(', ')}`));
    console.log(chalk.green(`     🟢 INFO: ${listScenario.consistencyRules.allowChange.join(', ')}`));

    console.log(chalk.blue('\n💡 사용법:'));
    console.log(chalk.gray('   npx ts-node src/cli.ts funnel prompt --scenario STANDARD_PURCHASE'));
    console.log(chalk.gray('   npx ts-node src/cli.ts funnel analyze --screenshots <paths> --scenario STANDARD_PURCHASE'));
  });

funnel
  .command('prompt')
  .description('시나리오 기반 Vision AI 프롬프트를 생성합니다')
  .option('--scenario <name>', '시나리오 이름 (STANDARD_PURCHASE, LIST_TO_PURCHASE)', 'STANDARD_PURCHASE')
  .option('--enrich', 'GA4 config로 파라미터 강화', true)
  .option('-o, --output <file>', '프롬프트를 파일로 저장')
  .action((options) => {
    console.log(chalk.cyan('\n╔════════════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║') + chalk.yellow.bold('              🤖 Vision AI 프롬프트 생성                        ') + chalk.cyan('║'));
    console.log(chalk.cyan('╚════════════════════════════════════════════════════════════════╝\n'));

    let scenario: FunnelScenario;

    if (options.scenario === 'LIST_TO_PURCHASE') {
      scenario = SCENARIO_TEMPLATES.LIST_TO_PURCHASE;
    } else {
      scenario = FunnelScenarioDesigner.createDefaultEcommerceFunnel();
    }

    // GA4 config로 강화
    if (options.enrich) {
      scenario = FunnelScenarioDesigner.enrichScenarioWithGA4Config(scenario);
      console.log(chalk.gray('✓ GA4 config로 파라미터 강화됨\n'));
    }

    const prompt = FunnelScenarioDesigner.generateVisionPromptForScenario(scenario);

    console.log(prompt);

    if (options.output) {
      fs.writeFileSync(options.output, prompt, 'utf-8');
      console.log(chalk.green(`\n✅ 프롬프트 저장됨: ${options.output}`));
    }
  });

funnel
  .command('checklist')
  .description('시나리오 검증 체크리스트를 생성합니다')
  .option('--scenario <name>', '시나리오 이름', 'STANDARD_PURCHASE')
  .option('-o, --output <file>', '체크리스트를 파일로 저장')
  .action((options) => {
    console.log(chalk.cyan('\n╔════════════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║') + chalk.yellow.bold('              ✅ 검증 체크리스트 생성                           ') + chalk.cyan('║'));
    console.log(chalk.cyan('╚════════════════════════════════════════════════════════════════╝\n'));

    let scenario: FunnelScenario;

    if (options.scenario === 'LIST_TO_PURCHASE') {
      scenario = SCENARIO_TEMPLATES.LIST_TO_PURCHASE;
    } else {
      scenario = FunnelScenarioDesigner.createDefaultEcommerceFunnel();
    }

    scenario = FunnelScenarioDesigner.enrichScenarioWithGA4Config(scenario);

    const checklist = FunnelScenarioDesigner.generateValidationChecklist(scenario);

    console.log(checklist);

    if (options.output) {
      fs.writeFileSync(options.output, checklist, 'utf-8');
      console.log(chalk.green(`\n✅ 체크리스트 저장됨: ${options.output}`));
    }
  });

funnel
  .command('analyze')
  .description('스크린샷들을 분석하여 퍼널 일관성을 검증합니다')
  .requiredOption('--screenshots <paths>', '스크린샷 경로들 (쉼표 구분, 퍼널 순서대로)')
  .requiredOption('--urls <urls>', '각 스크린샷의 페이지 URL (쉼표 구분)')
  .option('--scenario <name>', '시나리오 이름', 'STANDARD_PURCHASE')
  .option('-k, --api-key <key>', 'Gemini API 키 (또는 GEMINI_API_KEY 환경변수)')
  .option('-o, --output <dir>', '결과 출력 디렉토리', './output/funnel')
  .action(async (options) => {
    console.log(chalk.cyan('\n╔════════════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║') + chalk.yellow.bold('              🔍 퍼널 시나리오 분석                             ') + chalk.cyan('║'));
    console.log(chalk.cyan('╚════════════════════════════════════════════════════════════════╝\n'));

    const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error(chalk.red('❌ Gemini API 키가 필요합니다.'));
      console.error(chalk.gray('   -k 옵션 또는 GEMINI_API_KEY 환경변수를 설정하세요.'));
      process.exit(1);
    }

    const screenshotPaths = options.screenshots.split(',').map((s: string) => s.trim());
    const urls = options.urls.split(',').map((u: string) => u.trim());

    if (screenshotPaths.length !== urls.length) {
      console.error(chalk.red('❌ 스크린샷 수와 URL 수가 일치하지 않습니다.'));
      process.exit(1);
    }

    // 스크린샷 파일 확인
    for (const screenshotPath of screenshotPaths) {
      if (!fs.existsSync(screenshotPath)) {
        console.error(chalk.red(`❌ 스크린샷 파일을 찾을 수 없습니다: ${screenshotPath}`));
        process.exit(1);
      }
    }

    // 시나리오 선택
    let scenario: FunnelScenario;
    if (options.scenario === 'LIST_TO_PURCHASE') {
      scenario = SCENARIO_TEMPLATES.LIST_TO_PURCHASE;
    } else {
      scenario = FunnelScenarioDesigner.createDefaultEcommerceFunnel();
    }

    scenario = FunnelScenarioDesigner.enrichScenarioWithGA4Config(scenario);

    // 스크린샷 수와 시나리오 단계 수 확인
    if (screenshotPaths.length !== scenario.steps.length) {
      console.error(chalk.red(`❌ 스크린샷 수(${screenshotPaths.length})와 시나리오 단계 수(${scenario.steps.length})가 일치하지 않습니다.`));
      console.error(chalk.gray(`   시나리오 단계: ${scenario.steps.map(s => s.eventName).join(' → ')}`));
      process.exit(1);
    }

    console.log(chalk.gray(`시나리오: ${scenario.name}`));
    console.log(chalk.gray(`단계: ${scenario.steps.map(s => s.eventName).join(' → ')}`));
    console.log(chalk.gray(`스크린샷: ${screenshotPaths.length}개\n`));

    try {
      const analyzer = new GeminiVisionAnalyzer(apiKey);

      const screenshots = screenshotPaths.map((p: string, i: number) => ({
        path: p,
        pageUrl: urls[i],
      }));

      const result = await analyzer.analyzeFunnelScenario(screenshots, scenario);

      // 결과 출력
      analyzer.printFunnelAnalysisResult(result);

      // 결과 저장
      if (!fs.existsSync(options.output)) {
        fs.mkdirSync(options.output, { recursive: true });
      }

      const outputPath = path.join(options.output, `funnel_analysis_${Date.now()}.json`);

      // Map을 일반 객체로 변환
      const resultForJson = {
        ...result,
        trackedItems: Array.from(result.trackedItems.entries()).map(([id, item]) => ({
          item_id: id,
          valuesByStep: Array.from(item.valuesByStep.entries()),
          consistencyIssues: item.consistencyIssues,
        })),
      };

      fs.writeFileSync(outputPath, JSON.stringify(resultForJson, null, 2));
      console.log(chalk.green(`\n💾 결과 저장됨: ${outputPath}`));

    } catch (error: any) {
      console.error(chalk.red(`\n❌ 분석 오류: ${error.message}`));
      process.exit(1);
    }
  });

funnel
  .command('rules')
  .description('퍼널 일관성 규칙을 상세히 표시합니다')
  .action(() => {
    console.log(chalk.cyan('\n╔════════════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║') + chalk.yellow.bold('              📋 퍼널 일관성 규칙                               ') + chalk.cyan('║'));
    console.log(chalk.cyan('╚════════════════════════════════════════════════════════════════╝\n'));

    console.log(chalk.red('🔴 CRITICAL (절대 변경 불가)'));
    console.log(chalk.gray('   변경 시 퍼널 추적이 끊어집니다. 다른 상품으로 인식됩니다.\n'));
    console.log(chalk.white('   • item_id      - 상품 고유 식별자'));
    console.log(chalk.white('   • item_name    - 상품명 (전체 퍼널에서 동일해야 추적 가능)'));
    console.log(chalk.white('   • item_brand   - 브랜드명'));

    console.log('');

    console.log(chalk.yellow('🟡 WARNING (일관성 권장)'));
    console.log(chalk.gray('   변경 가능하나, 데이터 분석에 혼란을 초래할 수 있습니다.\n'));
    console.log(chalk.white('   • price        - 할인 적용으로 변경 가능하나 권장하지 않음'));
    console.log(chalk.white('   • item_category - 카테고리 변경은 분석에 혼란 초래'));
    console.log(chalk.white('   • item_variant - 옵션 변경 가능하나 기록 필요'));

    console.log('');

    console.log(chalk.green('🟢 INFO (변경 허용)'));
    console.log(chalk.gray('   정상적인 변경입니다.\n'));
    console.log(chalk.white('   • quantity     - 수량은 장바구니에서 변경 가능'));
    console.log(chalk.white('   • discount     - 쿠폰 적용 시 추가됨'));
    console.log(chalk.white('   • coupon       - 결제 단계에서 적용'));
    console.log(chalk.white('   • index        - 목록 위치는 페이지마다 다를 수 있음'));

    console.log('');

    console.log(chalk.blue('💡 예시:'));
    console.log(chalk.gray(`
   view_item:      item_name = "[설화수] 자음생크림 60ml"
   add_to_cart:    item_name = "[설화수] 자음생크림 60ml"  ✅ 일치
   begin_checkout: item_name = "설화수 자음생크림"         ❌ CRITICAL 불일치!
   purchase:       item_name = "[설화수] 자음생크림 60ml"  ✅ 일치

   → begin_checkout 단계에서 item_name 불일치 발생
   → 퍼널 추적이 끊어짐 (3개의 상품으로 분리됨)
`));
  });

funnel
  .command('design')
  .description('퍼널 시나리오 설계 가이드를 표시합니다')
  .action(() => {
    console.log(chalk.cyan('\n╔════════════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║') + chalk.yellow.bold('              📐 퍼널 시나리오 설계 가이드                      ') + chalk.cyan('║'));
    console.log(chalk.cyan('╚════════════════════════════════════════════════════════════════╝\n'));

    console.log(chalk.yellow('Step 1: 퍼널 단계 정의'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.white('   이커머스 표준:'));
    console.log(chalk.gray('   view_item → add_to_cart → begin_checkout → purchase'));
    console.log('');
    console.log(chalk.white('   목록 포함:'));
    console.log(chalk.gray('   select_item → view_item → add_to_cart → purchase'));
    console.log('');
    console.log(chalk.white('   프로모션 포함:'));
    console.log(chalk.gray('   view_promotion → select_promotion → view_item → add_to_cart → purchase'));

    console.log('');

    console.log(chalk.yellow('Step 2: Vision AI 추출 파라미터 정의'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.white('   각 페이지에서 추출할 파라미터와 위치 힌트를 정의합니다.'));
    console.log(chalk.gray(`
   view_item:
     - item_name: "상품 제목 영역의 큰 글씨"
     - price: "현재 판매가 (할인가 우선)"
     - item_brand: "상품명 위/옆의 브랜드 로고나 텍스트"

   add_to_cart:
     - item_name: "장바구니 팝업의 상품명"
     - quantity: "수량 선택 영역의 숫자"
`));

    console.log(chalk.yellow('Step 3: 일관성 규칙 정의'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.white('   어떤 파라미터가 퍼널 전체에서 일관되어야 하는지 정의합니다.'));
    console.log(chalk.gray(`
   🔴 CRITICAL (변경 불가): item_id, item_name, item_brand
   🟡 WARNING (권장 일관): price, item_category
   🟢 INFO (변경 허용): quantity, discount, coupon
`));

    console.log(chalk.yellow('Step 4: 검증 체크리스트 생성'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.white('   각 단계에서 확인해야 할 항목을 체크리스트로 생성합니다.'));
    console.log(chalk.gray(`
   ☐ view_item의 item_id === add_to_cart의 item_id
   ☐ view_item의 item_name === add_to_cart의 item_name
   ☐ add_to_cart의 item_name === begin_checkout의 item_name
   ...
`));

    console.log(chalk.blue('\n💡 명령어:'));
    console.log(chalk.gray('   npx ts-node src/cli.ts funnel scenarios    # 템플릿 목록'));
    console.log(chalk.gray('   npx ts-node src/cli.ts funnel prompt       # Vision AI 프롬프트'));
    console.log(chalk.gray('   npx ts-node src/cli.ts funnel checklist    # 검증 체크리스트'));
    console.log(chalk.gray('   npx ts-node src/cli.ts funnel rules        # 일관성 규칙'));
  });

program.parse();
