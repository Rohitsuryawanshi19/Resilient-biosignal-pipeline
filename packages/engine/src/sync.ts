import { fromRanges, subtract, toRanges, EMPTY, type IntervalSet, type WindowResult } from '@mayacardio/core';

export interface SyncConfig {
  cloudUrl: string; // e.g. "http://127.0.0.1:8787"
  sharedSecret?: string;
  batchSize?: number; // default 50
}

export interface SyncBlockSource {
  getBlocks(sessionId: string, sensor: 1 | 2): Array<{ firstIndex: number; count: number; payload: Uint8Array }>;
  getLosses(sessionId: string, sensor: 1 | 2): Array<{ from: number; to: number | null; reason: string }>;
}

export function uint8ArrayToBase64(buf: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buf).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < buf.length; i++) {
    binary += String.fromCharCode(buf[i]!);
  }
  return btoa(binary);
}

export class SyncClient {
  private config: SyncConfig;
  private secret: string;
  private batchSize: number;

  constructor(config: SyncConfig) {
    this.config = config;
    this.secret = config.sharedSecret ?? 'mayacardio-secret-token';
    this.batchSize = config.batchSize ?? 50;
  }

  private authHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.secret}`,
      'Content-Type': 'application/json',
    };
  }

  public async getCloudState(sessionId: string): Promise<Record<1 | 2, Array<{ from: number; to: number }>>> {
    const url = `${this.config.cloudUrl}/state?session=${encodeURIComponent(sessionId)}`;
    const res = await fetch(url, { headers: this.authHeaders() });
    if (!res.ok) {
      throw new Error(`Failed to fetch cloud state: ${res.status}`);
    }
    return res.json() as Promise<Record<1 | 2, Array<{ from: number; to: number }>>>;
  }

  public async syncSession(sessionId: string, store: SyncBlockSource): Promise<{ blocksSynced: number; lossesSynced: number }> {
    const cloudState = await this.getCloudState(sessionId);
    let totalBlocks = 0;
    let totalLosses = 0;

    for (const sensor of [1, 2] as const) {
      const localBlocks = store.getBlocks(sessionId, sensor);
      const localLosses = store.getLosses(sessionId, sensor);

      // Build local stored intervals
      let localIntervals: IntervalSet = EMPTY;
      for (const b of localBlocks) {
        localIntervals = fromRanges([...toRanges(localIntervals), { from: b.firstIndex, to: b.firstIndex + b.count }]);
      }

      // Cloud ranges
      const cloudRanges = fromRanges(cloudState[sensor] ?? []);

      // Compute local_stored - cloud_has
      const missingIntervals = subtract(localIntervals, cloudRanges);
      const missingRanges = toRanges(missingIntervals);

      // Filter blocks that fall within missingRanges
      const blocksToSend = localBlocks.filter((b) => {
        const bFrom = b.firstIndex;
        const bTo = b.firstIndex + b.count;
        return missingRanges.some((r) => bFrom < r.to && bTo > r.from);
      });

      // Prepare losses to send
      const lossesToSend = localLosses.map((l) => ({
        sensor,
        from: l.from,
        to: l.to,
        reason: l.reason,
      }));

      // Send in batches
      for (let i = 0; i < blocksToSend.length; i += this.batchSize) {
        const batch = blocksToSend.slice(i, i + this.batchSize);
        const payloadBatch = batch.map((b) => ({
          sensor,
          firstIndex: b.firstIndex,
          count: b.count,
          crc32: 0,
          payload: uint8ArrayToBase64(b.payload),
        }));

        const isLastBatch = i + this.batchSize >= blocksToSend.length;
        const lossesBatch = isLastBatch ? lossesToSend : [];

        const syncRes = await fetch(`${this.config.cloudUrl}/sync?session=${encodeURIComponent(sessionId)}`, {
          method: 'POST',
          headers: this.authHeaders(),
          body: JSON.stringify({
            blocks: payloadBatch,
            losses: lossesBatch,
          }),
        });

        if (!syncRes.ok) {
          throw new Error(`Sync batch failed with HTTP ${syncRes.status}`);
        }

        totalBlocks += batch.length;
        totalLosses += lossesBatch.length;
      }
    }

    return { blocksSynced: totalBlocks, lossesSynced: totalLosses };
  }
}
