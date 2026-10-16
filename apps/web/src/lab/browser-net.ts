import type { EngineNet, BlockRecord, LossRecord } from '@mayacardio/engine';
import { ModeController } from '@mayacardio/engine';

export interface BrowserNetConfig {
  cloudUrl?: string;
  sharedSecret?: string;
  onModeChange?: (mode: 'online' | 'offline') => void;
}

export class BrowserNet implements EngineNet {
  private cloudUrl: string;
  private secret: string;
  private cutFlag = false;
  private ackListeners: Array<(ack: { sensor: 1 | 2; firstIndex: number }) => void> = [];
  private modeController: ModeController;

  constructor(config: BrowserNetConfig = {}) {
    this.cloudUrl = config.cloudUrl || 'http://127.0.0.1:8787';
    this.secret = config.sharedSecret || 'mayacardio-secret-token';

    this.modeController = new ModeController({
      ackTimeoutMs: 4000,
      hysteresisAcks: 2,
      onModeChange: (evt) => {
        if (config.onModeChange) {
          config.onModeChange(evt.to);
        }
      },
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('offline', () => {
        this.cut();
      });
      window.addEventListener('online', () => {
        this.restore();
      });
    }
  }

  public getMode(): 'online' | 'offline' {
    return this.modeController.getMode();
  }

  public isConnected(): boolean {
    if (this.cutFlag) return false;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
    return true;
  }

  public cut(): void {
    this.cutFlag = true;
    this.modeController.forceOffline();
  }

  public restore(): void {
    this.cutFlag = false;
  }

  public onAck(listener: (ack: { sensor: 1 | 2; firstIndex: number }) => void): void {
    this.ackListeners.push(listener);
  }

  public tick(): void {
    this.modeController.tick();
  }

  public async sendLiveBlock(block: BlockRecord): Promise<boolean> {
    if (!this.isConnected()) {
      return false;
    }

    try {
      // In real browser lab, can stream via HTTP / WS to worker if URL reachable
      // We simulate fast cloud ack when reachable
      this.modeController.recordAck();
      for (const listener of this.ackListeners) {
        listener({ sensor: block.sensor, firstIndex: block.firstIndex });
      }
      return true;
    } catch {
      this.modeController.tick();
      return false;
    }
  }

  public async sendSyncBatch(
    blocks: BlockRecord[],
    losses: LossRecord[]
  ): Promise<{ ok: boolean; count: number }> {
    if (!this.isConnected()) {
      return { ok: false, count: 0 };
    }
    return { ok: true, count: blocks.length };
  }
}
