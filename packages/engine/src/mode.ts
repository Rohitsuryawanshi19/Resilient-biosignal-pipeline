export type Mode = 'online' | 'offline';

export interface ModeChangeEvent {
  from: Mode;
  to: Mode;
  timestampMono: number; // performance.now()
}

export interface ModeControllerConfig {
  ackTimeoutMs?: number;      // Default 4000ms (~4s)
  hysteresisAcks?: number;    // Default 2 consecutive acks
  onModeChange?: (event: ModeChangeEvent) => void;
  getNowMono?: () => number;  // Default performance.now
}

export class ModeController {
  private currentMode: Mode = 'offline';
  private consecutiveGoodAcks = 0;
  private lastAckMono = -Infinity;
  private ackTimeoutMs: number;
  private hysteresisAcks: number;
  private onModeChange?: (event: ModeChangeEvent) => void;
  private getNowMono: () => number;

  constructor(config: ModeControllerConfig = {}) {
    this.ackTimeoutMs = config.ackTimeoutMs ?? 4000;
    this.hysteresisAcks = config.hysteresisAcks ?? 2;
    this.onModeChange = config.onModeChange;
    this.getNowMono = config.getNowMono ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  }

  public getMode(): Mode {
    return this.currentMode;
  }

  public getLastAckTime(): number {
    return this.lastAckMono;
  }

  public recordAck(nowMono?: number): void {
    const now = nowMono ?? this.getNowMono();
    this.lastAckMono = now;
    this.consecutiveGoodAcks++;

    if (this.currentMode === 'offline' && this.consecutiveGoodAcks >= this.hysteresisAcks) {
      this.setMode('online', now);
    }
  }

  public tick(nowMono?: number): void {
    const now = nowMono ?? this.getNowMono();

    if (this.currentMode === 'online') {
      const elapsedSinceAck = now - this.lastAckMono;
      if (elapsedSinceAck >= this.ackTimeoutMs) {
        this.consecutiveGoodAcks = 0;
        this.setMode('offline', now);
      }
    }
  }

  public forceOffline(nowMono?: number): void {
    const now = nowMono ?? this.getNowMono();
    this.consecutiveGoodAcks = 0;
    if (this.currentMode === 'online') {
      this.setMode('offline', now);
    }
  }

  private setMode(newMode: Mode, nowMono: number): void {
    if (this.currentMode === newMode) return;
    const oldMode = this.currentMode;
    this.currentMode = newMode;
    if (this.onModeChange) {
      this.onModeChange({
        from: oldMode,
        to: newMode,
        timestampMono: nowMono,
      });
    }
  }
}
