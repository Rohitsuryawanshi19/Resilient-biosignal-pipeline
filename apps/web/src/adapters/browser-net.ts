import type { EngineNet, BlockRecord, LossRecord } from '@mayacardio/engine';

export class BrowserNet implements EngineNet {
  private connected = true;
  private ackListeners: Array<(ack: { sensor: 1 | 2; firstIndex: number }) => void> = [];
  private ackInterval: any = null;

  constructor() {
    this.startHeartbeat();
  }

  private startHeartbeat(): void {
    if (typeof setInterval !== 'undefined') {
      this.ackInterval = setInterval(() => {
        if (this.connected) {
          // Emit heartbeat ack
          for (const l of this.ackListeners) {
            l({ sensor: 1, firstIndex: 0 });
          }
        }
      }, 1500);
    }
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public cut(): void {
    this.connected = false;
  }

  public restore(): void {
    this.connected = true;
  }

  public async sendLiveBlock(block: BlockRecord): Promise<boolean> {
    if (!this.connected) return false;
    // Simulated cloud receipt & ack
    for (const l of this.ackListeners) {
      l({ sensor: block.sensor, firstIndex: block.firstIndex });
    }
    return true;
  }

  public async sendSyncBatch(blocks: BlockRecord[], losses: LossRecord[]): Promise<{ ok: boolean; count: number }> {
    if (!this.connected) return { ok: false, count: 0 };
    return { ok: true, count: blocks.length + losses.length };
  }

  public onAck(listener: (ack: { sensor: 1 | 2; firstIndex: number }) => void): void {
    this.ackListeners.push(listener);
  }

  public destroy(): void {
    if (this.ackInterval) clearInterval(this.ackInterval);
  }
}
