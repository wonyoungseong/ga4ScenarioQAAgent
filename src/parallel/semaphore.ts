/**
 * Async Semaphore for concurrency control
 *
 * 동시 실행 가능한 작업 수를 제한합니다.
 */
export class Semaphore {
  private permits: number;
  private waiting: (() => void)[] = [];

  constructor(permits: number) {
    if (permits < 1) {
      throw new Error('Semaphore permits must be at least 1');
    }
    this.permits = permits;
  }

  /**
   * permit을 획득합니다. 사용 가능한 permit이 없으면 대기합니다.
   */
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise<void>(resolve => {
      this.waiting.push(resolve);
    });
  }

  /**
   * permit을 반환합니다. 대기 중인 작업이 있으면 깨웁니다.
   */
  release(): void {
    const next = this.waiting.shift();
    if (next) {
      // 대기 중인 작업에게 permit 전달
      next();
    } else {
      // 대기 중인 작업이 없으면 permit 반환
      this.permits++;
    }
  }

  /**
   * 현재 사용 가능한 permit 수
   */
  get available(): number {
    return this.permits;
  }

  /**
   * 대기 중인 작업 수
   */
  get waitingCount(): number {
    return this.waiting.length;
  }
}
