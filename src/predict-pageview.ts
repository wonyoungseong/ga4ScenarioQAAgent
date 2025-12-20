/**
 * page_view 이벤트 파라미터 예측
 */
import { chromium } from 'playwright';
import ParameterPredictor, { loadSiteConfig } from './predictors/parameterPredictor';

async function main() {
  const url = process.argv[2] || 'https://www.amoremall.com/kr/ko/display/main';

  console.log('========================================================================');
  console.log('     page_view 이벤트 파라미터 예측');
  console.log('========================================================================');
  console.log();
  console.log('URL:', url);
  console.log();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  console.log('페이지 로딩 중...');
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);

  const siteConfig = loadSiteConfig(new URL(url).hostname);
  const predictor = new ParameterPredictor(url, siteConfig);
  const predictions = await predictor.predictPageViewParams(page);

  console.log();
  console.log('[ 예측 결과 ]');
  console.log('------------------------------------------------------------------------');
  console.log();

  const paramDescriptions: Record<string, string> = {
    'site_name': '사이트 이름',
    'site_country': '국가 코드',
    'site_language': '언어 코드',
    'site_env': '환경 (PRD/STG/DEV)',
    'content_group': '페이지 타입',
    'breadcrumb': '탐색 경로',
    'login_is_login': '로그인 여부',
    'channel': '접속 채널'
  };

  for (const [key, pred] of Object.entries(predictions)) {
    const desc = paramDescriptions[key] || key;
    console.log(`${key}`);
    console.log(`  - 설명: ${desc}`);
    console.log(`  - 예측 값: ${pred.value || '(없음)'}`);
    console.log(`  - 신뢰도: ${pred.confidence}`);
    console.log(`  - 근거: ${pred.source}`);
    console.log();
  }

  console.log('========================================================================');
  console.log('예측 완료');

  await browser.close();
}

main().catch(console.error);
