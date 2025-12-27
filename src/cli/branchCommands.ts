/**
 * Branch CLI Commands
 *
 * branch init, branch list, branch status 등 Branch 관리 명령어
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'path';
import { BranchManager, createBranchManager } from '../branch/BranchManager';
import { SpecDataLoader } from '../data/SpecDataLoader';
import { GA4DataFetcher, createGA4DataFetcher } from '../data/GA4DataFetcher';

/**
 * Branch 명령어 그룹 생성
 */
export function createBranchCommands(): Command {
  const branch = new Command('branch')
    .description('Content Group 기반 Branch 관리');

  // branch init
  branch
    .command('init')
    .description('ga4-event-parameters.json에서 Branch 초기화')
    .option('--spec <path>', '스펙 파일 경로', './config/ga4-event-parameters.json')
    .option('--output <dir>', '출력 디렉토리', './output/branches')
    .option('--ga4-property <id>', 'GA4 Property ID')
    .option('--base-url <url>', '기본 URL (상대 경로 변환용)')
    .action(async (options) => {
      console.log(chalk.cyan('\n📂 Branch 초기화\n'));

      try {
        const manager = await createBranchManager({
          specPath: options.spec,
          stateDir: options.output,
          ga4PropertyId: options.ga4Property,
          baseUrl: options.baseUrl
        });

        const branches = await manager.initializeFromSpec();

        console.log(chalk.green(`✅ ${branches.length}개 Branch 생성됨:\n`));

        for (const branch of branches) {
          console.log(`   ${chalk.yellow(branch.contentGroup)}`);
          console.log(chalk.gray(`      ID: ${branch.id}`));
          console.log(chalk.gray(`      Events: ${branch.expectedEvents.length}개`));
        }

        // GA4에서 URL 채우기 시도
        if (options.ga4Property) {
          console.log(chalk.cyan('\n📊 GA4에서 URL 조회 중...\n'));

          try {
            const ga4Fetcher = await createGA4DataFetcher(options.ga4Property);

            await manager.populateUrlsFromGA4(ga4Fetcher, {
              startDate: '7daysAgo',
              endDate: 'today'
            });

            const summary = manager.getSummary();
            console.log(chalk.green(`✅ ${summary.withUrls}개 Branch에 URL 추가됨`));
          } catch (err: any) {
            console.log(chalk.yellow(`⚠️ GA4 URL 조회 실패: ${err.message}`));
          }
        }

        console.log(chalk.gray(`\n📁 상태 저장 위치: ${options.output}`));
        console.log(chalk.blue('\n💡 다음 단계: npx ts-node src/cli.ts branch list'));

      } catch (error: any) {
        console.error(chalk.red(`❌ 오류: ${error.message}`));
        process.exit(1);
      }
    });

  // branch list
  branch
    .command('list')
    .description('모든 Branch 목록 표시')
    .option('--output <dir>', '상태 디렉토리', './output/branches')
    .option('--spec <path>', '스펙 파일 경로', './config/ga4-event-parameters.json')
    .action(async (options) => {
      console.log(chalk.cyan('\n📂 Branch 목록\n'));

      try {
        const manager = await createBranchManager({
          specPath: options.spec,
          stateDir: options.output
        });

        const branches = manager.getAllBranches();

        if (branches.length === 0) {
          console.log(chalk.yellow('Branch가 없습니다. 먼저 초기화하세요:'));
          console.log(chalk.gray('   npx ts-node src/cli.ts branch init'));
          return;
        }

        const summary = manager.getSummary();

        console.log(chalk.white(`총 ${summary.total}개 Branch (활성: ${summary.enabled})\n`));

        console.log(chalk.gray('  Content Group'.padEnd(20) + 'Status'.padEnd(15) + 'URLs'.padEnd(8) + 'Events'));
        console.log(chalk.gray('  ' + '-'.repeat(55)));

        for (const branch of branches) {
          const status = manager.getBranchStatus(branch.id);
          const statusColor = status === 'completed' ? chalk.green :
                             status === 'failed' ? chalk.red :
                             status === 'in_progress' ? chalk.yellow : chalk.gray;

          const enabledMark = branch.enabled ? '✓' : '✗';
          console.log(
            `  ${enabledMark} ${branch.contentGroup.padEnd(18)} ` +
            `${statusColor(status.padEnd(13))} ` +
            `${branch.testUrls.length.toString().padEnd(6)} ` +
            `${branch.expectedEvents.length}`
          );
        }

        console.log('');
        console.log(chalk.gray(`  완료: ${summary.completed} | 진행: ${summary.inProgress} | 대기: ${summary.pending} | 실패: ${summary.failed}`));

      } catch (error: any) {
        console.error(chalk.red(`❌ 오류: ${error.message}`));
        process.exit(1);
      }
    });

  // branch status
  branch
    .command('status')
    .description('Branch 상태 요약')
    .option('--output <dir>', '상태 디렉토리', './output/branches')
    .option('--spec <path>', '스펙 파일 경로', './config/ga4-event-parameters.json')
    .action(async (options) => {
      console.log(chalk.cyan('\n📊 Branch 상태 요약\n'));

      try {
        const manager = await createBranchManager({
          specPath: options.spec,
          stateDir: options.output
        });

        const summary = manager.getSummary();
        const storeInfo = manager.getStateStore().getSummary();

        console.log(chalk.white('Branch 상태:'));
        console.log(`  총 Branch: ${summary.total}`);
        console.log(`  활성화: ${summary.enabled}`);
        console.log(`  URL 설정됨: ${summary.withUrls}`);
        console.log('');

        console.log(chalk.white('테스트 상태:'));
        console.log(`  완료: ${chalk.green(summary.completed.toString())}`);
        console.log(`  진행 중: ${chalk.yellow(summary.inProgress.toString())}`);
        console.log(`  대기: ${chalk.gray(summary.pending.toString())}`);
        console.log(`  실패: ${chalk.red(summary.failed.toString())}`);
        console.log('');

        if (storeInfo.lastRun) {
          console.log(chalk.white('마지막 실행:'));
          console.log(`  시간: ${storeInfo.lastRun}`);
          console.log(`  총 실행 횟수: ${storeInfo.totalRuns}`);
        }

      } catch (error: any) {
        console.error(chalk.red(`❌ 오류: ${error.message}`));
        process.exit(1);
      }
    });

  // branch set-url
  branch
    .command('set-url')
    .description('Branch에 테스트 URL 설정')
    .requiredOption('-c, --content-group <group>', 'Content Group 이름')
    .requiredOption('-u, --urls <urls>', 'URL 목록 (쉼표 구분)')
    .option('--output <dir>', '상태 디렉토리', './output/branches')
    .option('--spec <path>', '스펙 파일 경로', './config/ga4-event-parameters.json')
    .action(async (options) => {
      console.log(chalk.cyan(`\n🔗 Branch URL 설정: ${options.contentGroup}\n`));

      try {
        const manager = await createBranchManager({
          specPath: options.spec,
          stateDir: options.output
        });

        const branch = manager.getBranchByContentGroup(options.contentGroup);
        if (!branch) {
          console.error(chalk.red(`❌ Branch를 찾을 수 없습니다: ${options.contentGroup}`));
          process.exit(1);
        }

        const urls = options.urls.split(',').map((u: string) => u.trim());

        manager.setBranchUrls(branch.id, urls);

        console.log(chalk.green(`✅ ${urls.length}개 URL 설정됨`));
        urls.forEach((url: string) => {
          console.log(chalk.gray(`   - ${url}`));
        });

      } catch (error: any) {
        console.error(chalk.red(`❌ 오류: ${error.message}`));
        process.exit(1);
      }
    });

  // branch enable/disable
  branch
    .command('enable')
    .description('Branch 활성화')
    .requiredOption('-c, --content-group <group>', 'Content Group 이름')
    .option('--output <dir>', '상태 디렉토리', './output/branches')
    .option('--spec <path>', '스펙 파일 경로', './config/ga4-event-parameters.json')
    .action(async (options) => {
      await toggleBranch(options, true);
    });

  branch
    .command('disable')
    .description('Branch 비활성화')
    .requiredOption('-c, --content-group <group>', 'Content Group 이름')
    .option('--output <dir>', '상태 디렉토리', './output/branches')
    .option('--spec <path>', '스펙 파일 경로', './config/ga4-event-parameters.json')
    .action(async (options) => {
      await toggleBranch(options, false);
    });

  return branch;
}

async function toggleBranch(options: any, enabled: boolean): Promise<void> {
  const action = enabled ? '활성화' : '비활성화';
  console.log(chalk.cyan(`\n${enabled ? '✓' : '✗'} Branch ${action}: ${options.contentGroup}\n`));

  try {
    const manager = await createBranchManager({
      specPath: options.spec,
      stateDir: options.output
    });

    const branch = manager.getBranchByContentGroup(options.contentGroup);
    if (!branch) {
      console.error(chalk.red(`❌ Branch를 찾을 수 없습니다: ${options.contentGroup}`));
      process.exit(1);
    }

    manager.setBranchEnabled(branch.id, enabled);
    console.log(chalk.green(`✅ ${options.contentGroup} Branch ${action}됨`));

  } catch (error: any) {
    console.error(chalk.red(`❌ 오류: ${error.message}`));
    process.exit(1);
  }
}
