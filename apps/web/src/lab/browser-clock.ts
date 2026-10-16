import type { EngineClock } from '@mayacardio/engine';

export class SkewableClock implements EngineClock {
  private skewMs = 0;
  private startMono = typeof performance !== 'undefined' ? performance.now() : 0;

  public nowMonoMs(): number {
    return typeof performance !== 'undefined' ? performance.now() - this.startMono : Date.now();
  }

  public nowWallMs(): number {
    return Date.now() + this.skewMs;
  }

  public setSkewHours(hours: number): void {
    this.skewMs = hours * 3600 * 1000;
  }

  public addSkewHours(hours: number): void {
    this.skewMs += hours * 3600 * 1000;
  }

  public getSkewHours(): number {
    return this.skewMs / (3600 * 1000);
  }

  public resetSkew(): void {
    this.skewMs = 0;
  }

  public async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
