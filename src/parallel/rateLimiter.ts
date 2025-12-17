/**
 * Token Bucket Rate Limiter
 *
 * Gemini API 레이트 제한을 위한 토큰 버킷 알고리즘 구현
 * - 분당 요청 수 제한 (RPM)
 * - 자동 토큰 리필
 */
export interface RateLimiterOptions {
  /** 분당 최대 요청 수 (기본: 50) */
  requestsPerMinute?: number;
  /** 버스트 허용량 (기본: requestsPerMinute의 20%) */
  burstLimit?: number;
}

export class RateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms
  private lastRefill: number;
  private waiting: (() => void)[] = [];

  constructor(options: RateLimiterOptions = {}) {
    const rpm = options.requestsPerMinute ?? 50;
    this.maxTokens = options.burstLimit ?? Math.ceil(rpm * 0.2);
    this.tokens = this.maxTokens;
    this.refillRate = rpm / 60000; // tokens per millisecond
    this.lastRefill = Date.now();
  }

  /**
   * 토큰을 리필합니다 (시간 경과에 따라)
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = elapsed * this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }

  /**
   * 요청 실행 전 호출. 토큰이 없으면 대기합니다.
   */
  async waitIfNeeded(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens--;
      return;
    }

    // 토큰이 없으면 대기
    const waitTime = Math.ceil((1 - this.tokens) / this.refillRate);
    await this.sleep(waitTime);
    this.refill();
    this.tokens--;
  }

  /**
   * 여러 요청을 배치로 실행할 때 사용
   */
  async waitForBatch(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      await this.waitIfNeeded();
    }
  }

  /**
   * 현재 사용 가능한 토큰 수
   */
  get availableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  /**
   * 다음 토큰까지 대기 시간 (ms)
   */
  get timeUntilNextToken(): number {
    this.refill();
    if (this.tokens >= 1) return 0;
    return Math.ceil((1 - this.tokens) / this.refillRate);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
