import type { EngineMockSource, MockReply } from '@mayacardio/engine';
import { crc32 } from '@mayacardio/engine';

export interface MockFaultConfig {
  stallMs?: number;
  corruptCrc?: boolean;
  duplicateReply?: boolean;
  silenceSensor?: 1 | 2 | null;
  corruptCount?: number;
  duplicateCount?: number;
}

export type MockGeneratorMode = 'ramp' | 'signal';

/**
 * Deterministic PRNG for signal mode
 */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Ground truth generator for ramp and signal modes
 */
export function generateGroundTruth(
  mode: MockGeneratorMode,
  sensor: 1 | 2,
  startIndex: number,
  count: number,
  seed = 42
): number[][] {
  const rows: number[][] = [];
  const channels = sensor === 1 ? 3 : 2;

  if (mode === 'ramp') {
    for (let i = 0; i < count; i++) {
      const idx = startIndex + i;
      const row: number[] = [];
      for (let c = 0; c < channels; c++) {
        if (sensor === 1) {
          row.push((3 * idx + c) % 8388608);
        } else {
          row.push((2 * idx + c) % 8388608);
        }
      }
      rows.push(row);
    }
  } else {
    // Synthetic ECG signal mode
    // Segments: 0-10s (60bpm), 10-20s (90bpm), 20-30s (72bpm)
    const gaussian = (x: number, mu: number, sigma: number) =>
      1000 * Math.exp(-0.5 * ((x - mu) / sigma) ** 2);

    for (let i = 0; i < count; i++) {
      const idx = startIndex + i;
      const tSec = idx / 400;
      let bpm = 60;
      if (tSec >= 10 && tSec < 20) bpm = 90;
      else if (tSec >= 20) bpm = 72;

      const interval = Math.round((400 * 60) / bpm);
      const phase = idx % interval;
      // QRS peak at phase == 100
      const ecgCh1 = Math.round(gaussian(phase, 100, 8));

      if (sensor === 1) {
        // ch0: baseline ramp, ch1: ECG waveform, ch2: inverted ECG
        rows.push([idx % 400, ecgCh1, -ecgCh1]);
      } else {
        // Sensor 2: accelerometer magnitude channels
        const angle = (idx * 2 * Math.PI) / 800;
        const x = Math.round(500 * Math.cos(angle));
        const y = Math.round(500 * Math.sin(angle));
        rows.push([x, y]);
      }
    }
  }

  return rows;
}

export class BrowserMock implements EngineMockSource {
  private sessionId: string;
  private mode: MockGeneratorMode;
  private seed: number;
  private headIndex: Record<1 | 2, number> = { 1: 0, 2: 0 };
  private BUFFER_CAPACITY = 4000; // 10 seconds at 400 Hz
  private faultConfig: MockFaultConfig = {};
  private activeStallPromise: Promise<void> | null = null;

  constructor(sessionId = 'lab_sess_' + Date.now(), mode: MockGeneratorMode = 'ramp', seed = 42) {
    this.sessionId = sessionId;
    this.mode = mode;
    this.seed = seed;
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public setMode(mode: MockGeneratorMode): void {
    this.mode = mode;
  }

  public restart(newSessionId?: string): void {
    this.sessionId = newSessionId || 'lab_sess_' + Date.now();
    this.headIndex = { 1: 0, 2: 0 };
    this.faultConfig = {};
  }

  public getHeadIndex(): Record<1 | 2, number> {
    return { ...this.headIndex };
  }

  public setHeadIndex(head: Record<1 | 2, number>): void {
    this.headIndex = { ...head };
  }

  public setFaults(config: MockFaultConfig): void {
    this.faultConfig = { ...this.faultConfig, ...config };
  }

  public clearFaults(): void {
    this.faultConfig = {};
  }

  public async read(sensor: 1 | 2, fromIndex?: number): Promise<MockReply> {
    // 1. Fault: Stall
    if (this.faultConfig.stallMs && this.faultConfig.stallMs > 0) {
      await new Promise((r) => setTimeout(r, this.faultConfig.stallMs));
    }

    // 2. Fault: Silence sensor
    if (this.faultConfig.silenceSensor === sensor) {
      // simulate sensor drop / timeout
      await new Promise((r) => setTimeout(r, 8000));
      throw new Error(`Sensor ${sensor} is silenced by fault injection`);
    }

    const currentHead = this.headIndex[sensor];
    let requestFirstIndex = fromIndex !== undefined ? fromIndex : currentHead;

    const lost: Array<{ from_index: number; to_index: number | null; reason: string }> = [];

    // Check 10s buffer boundary
    const oldestAvailable = Math.max(0, currentHead - this.BUFFER_CAPACITY);
    if (requestFirstIndex < oldestAvailable) {
      lost.push({
        from_index: requestFirstIndex,
        to_index: oldestAvailable,
        reason: 'mock_buffer_overflow_10s_exceeded',
      });
      requestFirstIndex = oldestAvailable;
    }

    // Batch size: 400 samples (1 second)
    const count = 400;
    const data = generateGroundTruth(this.mode, sensor, requestFirstIndex, count, this.seed);

    // Compute exact CRC32 over the data JSON substring
    const dataJson = JSON.stringify(data);
    let replyCrc = crc32(dataJson);

    // 3. Fault: Corrupt CRC
    if (this.faultConfig.corruptCrc) {
      replyCrc = (replyCrc ^ 0xdeadbeef) >>> 0;
      if (this.faultConfig.corruptCount !== undefined) {
        this.faultConfig.corruptCount--;
        if (this.faultConfig.corruptCount <= 0) {
          this.faultConfig.corruptCrc = false;
        }
      }
    }

    // Advance head if we are at the forward edge
    if (requestFirstIndex + count > this.headIndex[sensor]) {
      this.headIndex[sensor] = requestFirstIndex + count;
    }

    const reply: MockReply = {
      session_id: this.sessionId,
      sensor,
      first_index: requestFirstIndex,
      count,
      lost,
      session_end: false,
      crc32: replyCrc,
      data,
      rawString: dataJson,
    };

    return reply;
  }
}
