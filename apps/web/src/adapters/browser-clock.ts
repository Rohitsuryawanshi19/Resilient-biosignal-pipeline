import type { EngineClock } from '@mayacardio/engine';

export class BrowserClock implements EngineClock {
  public wallOffsetMs = 0;

  public nowMonoMs(): number {
    return performance.now();
  }

  public nowWallMs(): number {
    return Date.now() + this.wallOffsetMs;
  }

  public sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
