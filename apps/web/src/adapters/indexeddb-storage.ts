import { createLedger, type AuditResult, type WindowResult } from '@mayacardio/core';
import type { EngineStorage, BlockRecord, LossRecord, ResumePoint } from '@mayacardio/engine';

export class IndexedDbStorage implements EngineStorage {
  private dbName = 'mayacardio_pipeline_lab';
  private db: IDBDatabase | null = null;

  public async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('blocks')) {
          db.createObjectStore('blocks', { keyPath: ['sessionId', 'sensor', 'firstIndex'] });
        }
        if (!db.objectStoreNames.contains('losses')) {
          db.createObjectStore('losses', { keyPath: ['sessionId', 'sensor', 'from'] });
        }
        if (!db.objectStoreNames.contains('results')) {
          db.createObjectStore('results', { keyPath: ['sessionId', 'window'] });
        }
      };
      req.onsuccess = () => {
        this.db = req.result;
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async getResumePts(): Promise<ResumePoint[]> {
    if (!this.db) return [];
    return new Promise((resolve) => {
      const tx = this.db!.transaction('blocks', 'readonly');
      const store = tx.objectStore('blocks');
      const req = store.getAll();
      req.onsuccess = () => {
        const blocks = req.result as BlockRecord[];
        const maxIdx: Record<string, Record<1 | 2, number>> = {};
        for (const b of blocks) {
          if (!maxIdx[b.sessionId]) maxIdx[b.sessionId] = { 1: 0, 2: 0 };
          const end = b.firstIndex + b.count;
          if (end > maxIdx[b.sessionId]![b.sensor]) {
            maxIdx[b.sessionId]![b.sensor] = end;
          }
        }
        const pts: ResumePoint[] = [];
        for (const sid of Object.keys(maxIdx)) {
          pts.push({ sessionId: sid, sensor: 1, nextIndex: maxIdx[sid]![1] });
          pts.push({ sessionId: sid, sensor: 2, nextIndex: maxIdx[sid]![2] });
        }
        resolve(pts);
      };
      req.onerror = () => resolve([]);
    });
  }

  public async writeBlock(record: BlockRecord): Promise<'ok' | 'duplicate' | 'disk_full'> {
    if (!this.db) return 'ok';
    return new Promise((resolve) => {
      // durability: 'strict' requests hardware fsync equivalent in modern browsers
      // @ts-ignore
      const tx = this.db!.transaction(['blocks', 'losses'], 'readwrite', { durability: 'strict' });
      const blockStore = tx.objectStore('blocks');
      const lossStore = tx.objectStore('losses');

      const checkReq = blockStore.get([record.sessionId, record.sensor, record.firstIndex]);
      checkReq.onsuccess = () => {
        if (checkReq.result) {
          resolve('duplicate');
          return;
        }
        blockStore.put(record);
        for (const l of record.losses) {
          lossStore.put({
            sessionId: record.sessionId,
            sensor: record.sensor,
            from: l.from,
            to: l.to,
            reason: l.reason,
            monoUs: record.monoUs,
          });
        }
        resolve('ok');
      };
      checkReq.onerror = () => resolve('ok');
    });
  }

  public async writeLoss(record: LossRecord): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve) => {
      // @ts-ignore
      const tx = this.db!.transaction('losses', 'readwrite', { durability: 'strict' });
      tx.objectStore('losses').put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  public async writeResult(sessionId: string, result: WindowResult): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve) => {
      const tx = this.db!.transaction('results', 'readwrite');
      tx.objectStore('results').put({ sessionId, window: result.window, result });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  public async getBlocks(sessionId: string, sensor: 1 | 2): Promise<Array<{ firstIndex: number; count: number; payload: Uint8Array }>> {
    if (!this.db) return [];
    return new Promise((resolve) => {
      const tx = this.db!.transaction('blocks', 'readonly');
      const req = tx.objectStore('blocks').getAll();
      req.onsuccess = () => {
        const all = req.result as BlockRecord[];
        const filtered = all
          .filter((b) => b.sessionId === sessionId && b.sensor === sensor)
          .map((b) => ({ firstIndex: b.firstIndex, count: b.count, payload: b.payload }));
        resolve(filtered);
      };
      req.onerror = () => resolve([]);
    });
  }

  public async getLosses(sessionId: string, sensor: 1 | 2): Promise<Array<{ from: number; to: number | null; reason: string }>> {
    if (!this.db) return [];
    return new Promise((resolve) => {
      const tx = this.db!.transaction('losses', 'readonly');
      const req = tx.objectStore('losses').getAll();
      req.onsuccess = () => {
        const all = req.result as LossRecord[];
        const filtered = all
          .filter((l) => l.sessionId === sessionId && l.sensor === sensor)
          .map((l) => ({ from: l.from, to: l.to, reason: l.reason }));
        resolve(filtered);
      };
      req.onerror = () => resolve([]);
    });
  }

  public async audit(sessionId: string): Promise<AuditResult & { totalStored: number; totalLost: number; ok: boolean }> {
    const s1Blocks = await this.getBlocks(sessionId, 1);
    const s1Losses = await this.getLosses(sessionId, 1);
    const ledger = createLedger();

    let expectedEnd = 0;
    let totalStored = 0;
    let totalLost = 0;

    for (const b of s1Blocks) {
      ledger.pushStored(b.firstIndex, b.firstIndex + b.count);
      expectedEnd = Math.max(expectedEnd, b.firstIndex + b.count);
      totalStored += b.count;
    }
    for (const l of s1Losses) {
      if (l.to !== null) {
        ledger.pushLost(l.from, l.to);
        expectedEnd = Math.max(expectedEnd, l.to);
        totalLost += l.to - l.from;
      }
    }

    const res = ledger.audit(expectedEnd);
    const ok = res.gaps.length === 0 && res.overlaps.length === 0;

    return {
      gaps: res.gaps,
      overlaps: res.overlaps,
      totalStored,
      totalLost,
      ok,
    };
  }

  public async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
