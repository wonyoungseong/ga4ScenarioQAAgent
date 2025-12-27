/**
 * Test CLI Commands
 *
 * test run, test report 등 테스트 실행 명령어
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createBranchManager } from '../branch/BranchManager';
import { createOrchestrator, TestOrchestrator } from '../orchestrator/TestOrchestrator';
import { OrchestratorConfig } from '../orchestrator/types';
import { ReportGenerator } from '../report/ReportGenerator';
import { ContentGroup, ReportFormat } from '../branch/types';

dotenv.config();

/**
 * Test 명령어 그룹 생성
 */
export function createTestCommands(): Command {
  const test = new Command('test')
    .description('Multi-branch 테스트 실행');

  // test run
  test
    .command('run')
    .description('테스트 실행')
    .option('-c, --concurrency <n>', '동시 실행 수', '4')
    .option('-b, --branches <groups>', 'Content Group 목록 (쉼표 구분)')
    .option('--output <dir>', '출력 디렉토리', './output')
    .option('--spec <path>', '스펙 파일 경로', './config/ga4-event-parameters.json')
    .option('--formats <formats>', '출력 형식 (markdown,json,console,html)', 'console,markdown,json')
    .option('--ga4-property <id>', 'GA4 Property ID')
    .option('--vision-api-key <key>', 'Gemini API 키')
    .option('--dry-run', 'Dry run 모드 (실제 실행 없이 계획만)')
    .option('--continue-on-error', '에러 발생 시 계속 진행')
    .option('--no-vision', 'Vision AI 비활성화')
    .action(async (options) => {
      console.log(chalk.cyan('\n🚀 Multi-Branch 테스트 실행\n'));

      try {
        // Branch Manager 초기화
        const branchManager = await createBranchManager({
          specPath: options.spec,
          stateDir: path.join(options.output, 'branches'),
          ga4PropertyId: options.ga4Property || process.env.GA4_PROPERTY_ID
        });

        // 저장된 branch가 없으면 초기화
        let branches = branchManager.getAllBranches();
        if (branches.length === 0) {
          console.log(chalk.yellow('Branch가 없습니다. 초기화 중...\n'));
          branches = await branchManager.initializeFromSpec();
        }

        // 특정 Content Group 필터링
        let contentGroups: ContentGroup[] | undefined;
        if (options.branches) {
          contentGroups = options.branches.split(',').map((g: string) => g.trim()) as ContentGroup[];
          branches = branches.filter(b => contentGroups!.includes(b.contentGroup));
        }

        // 출력 형식 파싱
        const formats = options.formats.split(',').map((f: string) => f.trim()) as ReportFormat[];

        // Orchestrator 설정
        const config: OrchestratorConfig = {
          maxConcurrency: parseInt(options.concurrency, 10),
          branches,
          ga4PropertyId: options.ga4Property || process.env.GA4_PROPERTY_ID || '',
          dateRange: {
            startDate: '7daysAgo',
            endDate: 'today'
          },
          visionConfig: {
            enabled: options.vision !== false,
            maxConcurrency: 2,
            apiKey: options.visionApiKey || process.env.GEMINI_API_KEY
          },
          reportConfig: {
            outputDir: options.output,
            formats,
            gitPush: false,
            includeScreenshots: true
          },
          timeoutConfig: {
            pageLoadTimeout: 30000,
            visionApiTimeout: 60000,
            ga4ApiTimeout: 30000
          }
        };

        console.log(chalk.white('설정:'));
        console.log(`  Branches: ${branches.length}개`);
        console.log(`  Concurrency: ${config.maxConcurrency}`);
        console.log(`  Vision AI: ${config.visionConfig.enabled ? '활성화' : '비활성화'}`);
        console.log(`  출력 형식: ${formats.join(', ')}`);
        console.log('');

        if (options.dryRun) {
          console.log(chalk.yellow('🔍 Dry Run 모드 - 실제 실행 없이 계획만 표시\n'));
        }

        // Orchestrator 생성 및 실행
        const orchestrator = await createOrchestrator(config);

        // 진행 상황 표시
        orchestrator.onProgress((event) => {
          const icon = event.type.includes('completed') ? '✅' :
                       event.type.includes('failed') ? '❌' :
                       event.type.includes('started') ? '🔄' : 'ℹ️';
          console.log(chalk.gray(`  ${icon} ${event.message}`));
        });

        console.log(chalk.cyan('테스트 시작...\n'));

        const report = await orchestrator.runBranches(contentGroups, {
          dryRun: options.dryRun,
          continueOnError: options.continueOnError
        });

        // 리포트 생성
        const reportGenerator = new ReportGenerator({
          outputDir: options.output,
          formats
        });

        const generatedReports = await reportGenerator.generateReports(report);

        console.log(chalk.cyan('\n📊 테스트 완료\n'));

        // 요약 출력
        console.log(chalk.white('결과 요약:'));
        console.log(`  Overall Accuracy: ${chalk.bold(report.summary.overallAccuracy.toFixed(1) + '%')}`);
        console.log(`  완료: ${chalk.green(report.summary.byStatus.completed.toString())}`);
        console.log(`  실패: ${chalk.red(report.summary.byStatus.failed.toString())}`);
        console.log(`  총 이벤트: ${report.summary.totalEvents}`);
        console.log(`  실행 시간: ${Math.round(report.metadata.totalDurationMs / 1000)}초`);
        console.log('');

        console.log(chalk.white('생성된 리포트:'));
        for (const r of generatedReports.reports) {
          console.log(chalk.gray(`  - ${r.filePath}`));
        }

        // 정리
        await orchestrator.cleanup();

      } catch (error: any) {
        console.error(chalk.red(`❌ 오류: ${error.message}`));
        process.exit(1);
      }
    });

  // test report
  test
    .command('report')
    .description('마지막 테스트 결과 리포트 보기')
    .option('--output <dir>', '출력 디렉토리', './output')
    .option('-c, --content-group <group>', '특정 Content Group')
    .option('--format <format>', '출력 형식', 'console')
    .action(async (options) => {
      console.log(chalk.cyan('\n📊 테스트 리포트\n'));

      try {
        const branchManager = await createBranchManager({
          stateDir: path.join(options.output, 'branches')
        });

        if (options.contentGroup) {
          // 특정 Content Group 결과
          const result = branchManager.getLatestResult(options.contentGroup);

          if (!result) {
            console.log(chalk.yellow(`${options.contentGroup}의 테스트 결과가 없습니다.`));
            return;
          }

          console.log(chalk.white(`Content Group: ${result.contentGroup}`));
          console.log(`Status: ${result.status}`);
          console.log(`테스트 URL: ${result.testedUrls.length}개`);
          console.log(`이벤트: ${result.events.length}개`);
          console.log(`에러: ${result.errors.length}개`);

          if (result.events.length > 0) {
            console.log(chalk.white('\n이벤트 상세:'));
            for (const event of result.events) {
              console.log(`  - ${event.eventName}`);
              console.log(chalk.gray(`    Predicted: ${event.predictedParams.length}개`));
              console.log(chalk.gray(`    Actual: ${event.actualParams.length}개`));
            }
          }

        } else {
          // 전체 요약
          const summary = branchManager.getSummary();
          const storeInfo = branchManager.getStateStore().getSummary();

          console.log(chalk.white('테스트 상태 요약:'));
          console.log(`  총 Branch: ${summary.total}`);
          console.log(`  완료: ${chalk.green(summary.completed.toString())}`);
          console.log(`  실패: ${chalk.red(summary.failed.toString())}`);
          console.log(`  마지막 실행: ${storeInfo.lastRun || '없음'}`);

          // 각 Branch 결과 요약
          console.log(chalk.white('\nBranch별 결과:'));
          for (const branch of branchManager.getAllBranches()) {
            const result = branchManager.getLatestResult(branch.contentGroup);
            if (result) {
              const statusIcon = result.status === 'completed' ? '✅' :
                                result.status === 'failed' ? '❌' : '⏳';
              console.log(`  ${statusIcon} ${branch.contentGroup}: ${result.events.length} events`);
            } else {
              console.log(`  ⏳ ${branch.contentGroup}: 결과 없음`);
            }
          }
        }

      } catch (error: any) {
        console.error(chalk.red(`❌ 오류: ${error.message}`));
        process.exit(1);
      }
    });

  // test history
  test
    .command('history')
    .description('테스트 히스토리 조회')
    .requiredOption('-c, --content-group <group>', 'Content Group')
    .option('-n, --limit <n>', '최대 개수', '5')
    .option('--output <dir>', '출력 디렉토리', './output')
    .action(async (options) => {
      console.log(chalk.cyan(`\n📜 ${options.contentGroup} 테스트 히스토리\n`));

      try {
        const branchManager = await createBranchManager({
          stateDir: path.join(options.output, 'branches')
        });

        const history = branchManager.getResultHistory(
          options.contentGroup,
          parseInt(options.limit, 10)
        );

        if (history.length === 0) {
          console.log(chalk.yellow('히스토리가 없습니다.'));
          return;
        }

        for (let i = 0; i < history.length; i++) {
          const result = history[i];
          const statusIcon = result.status === 'completed' ? '✅' :
                            result.status === 'failed' ? '❌' : '⏳';

          console.log(`${i + 1}. ${statusIcon} ${result.startTime.toLocaleString()}`);
          console.log(chalk.gray(`   Duration: ${result.durationMs ? Math.round(result.durationMs / 1000) + 's' : 'N/A'}`));
          console.log(chalk.gray(`   Events: ${result.events.length}`));
          console.log(chalk.gray(`   Errors: ${result.errors.length}`));
          console.log('');
        }

      } catch (error: any) {
        console.error(chalk.red(`❌ 오류: ${error.message}`));
        process.exit(1);
      }
    });

  return test;
}
