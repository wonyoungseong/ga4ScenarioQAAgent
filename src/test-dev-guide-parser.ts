/**
 * 개발가이드 파서 테스트 스크립트
 */
import { parseDefaultDevGuide } from './parsers/developmentGuideParser';

async function main() {
  console.log('=== 개발가이드 PDF 파서 테스트 ===\n');

  const result = await parseDefaultDevGuide();

  if (!result.success) {
    console.error('파싱 실패:', result.error);
    return;
  }

  console.log(`소스 파일: ${result.sourceFile}`);
  console.log(`파싱된 이벤트 수: ${result.events.length}\n`);

  for (const event of result.events) {
    console.log('-----------------------------------');
    console.log(`이벤트: ${event.eventName}`);
    console.log(`필수: ${event.required ? '예' : '아니오'}`);
    console.log(`전송 시점: ${event.firingCondition}`);
    console.log(`허용 페이지: ${event.allowedPageTypes.join(', ') || '(미지정)'}`);
    console.log(`사용자 액션 필요: ${event.requiresUserAction ? '예' : '아니오'}`);
    if (event.userActionType) {
      console.log(`액션 타입: ${event.userActionType}`);
    }
    console.log(`필요 UI 요소: ${event.requiredUIElements.join(', ') || '(없음)'}`);
    console.log('');
  }
}

main().catch(console.error);
