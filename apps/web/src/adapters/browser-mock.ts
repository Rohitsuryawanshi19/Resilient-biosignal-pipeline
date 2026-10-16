import type { EngineMockSource, MockReply } from '@mayacardio/engine';
import { crc32 } from '@mayacardio/engine';

export class BrowserMockSource implements EngineMockSource {
  private sessionId = 'lab-session-' + Math.random().toString(36).slice(2, 8);
  private indices: Record<1 | 2, number> = { 1: 0, 2: 0 };

  // Fault injection state
  public corruptNextCrcCount = 0;
  public injectLossNext = false;
  public stallDelayMs = 0;

  public resetSession(): string {
    this.sessionId = 'lab-session-' + Math.random().toString(36).slice(2, 8);
    this.indices = { 1: 0, 2: 0 };
    return this.sessionId;
  }

  public async read(sensor: 1 | 2, fromIndex?: number): Promise<MockReply> {
    if (this.stallDelayMs > 0) {
      await new Promise((r) => setTimeout(r, this.stallDelayMs));
    }

    const firstIndex = fromIndex ?? this.indices[sensor];
    const count = 10;
    const channels = sensor === 1 ? 3 : 2;

    const lost: Array<{ from_index: number; to_index: number | null; reason: string }> = [];
    if (this.injectLossNext) {
      lost.push({
        from_index: firstIndex,
        to_index: firstIndex + count,
        reason: 'simulated_fault_injection',
      });
      this.injectLossNext = false;
    }

    // Generate ECG curve on Sensor 1 Ch 1 (0-based)
    const data: number[][] = [];
    for (let i = 0; i < count; i++) {
      const idx = firstIndex + i;
      const row: number[] = [];
      for (let c = 0; c < channels; c++) {
        if (sensor === 1 && c === 1) {
          // Synthetic ECG at ~72 BPM (period ~333 samples at 400 Hz)
          const phase = idx % 333;
          let ecg = Math.sin(phase / 10) * 80;
          if (phase >= 150 && phase <= 170) {
            // QRS spike
            const dist = Math.abs(phase - 160);
            ecg += 1200 * Math.exp(-0.5 * (dist / 3) ** 2);
          }
          row.push(Math.round(ecg));
        } else {
          // Ramp mode
          const val = sensor === 1 ? (3 * idx + c) % 8388608 : (2 * idx + c) % 8388608;
          row.push(val);
        }
      }
      data.push(row);
    }

    this.indices[sensor] = firstIndex + count;

    const dataStr = JSON.stringify(data);
    let crc = crc32(dataStr);

    if (this.corruptNextCrcCount > 0) {
      crc ^= 0xffffffff;
      this.corruptNextCrcCount--;
    }

    return {
      session_id: this.sessionId,
      sensor,
      first_index: firstIndex,
      count,
      lost,
      session_end: false,
      crc32: crc,
      data,
      rawString: dataStr,
    };
  }
}
