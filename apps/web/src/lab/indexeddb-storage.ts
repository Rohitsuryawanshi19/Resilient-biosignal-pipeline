import { createLedger, type AuditResult, type WindowResult } from '@mayacardio/core';
import { unpackRows, type EngineStorage, type BlockRecord, type LossRecord, type ResumePoint } from '@mayacardio/engine';

export interface AuditBootReport {
  sessionId: string;
  sensor: 1 | 2;
  gaps: Array<{ from: number; to: number }>;
  overlaps: Array<{ from: number; to: number }>;
  totalStored: number;
  totalLost: number;
  ok: boolean;
}

export class IndexedDbStorage implements EngineStorage {
  private dbName: string;
  private db: IDBDatabase | null = null;
  private bootAuditReports: AuditBootReport[] = [];

  constructor(dbName = 'mayacardio_pipeline_lab') {
    this.dbName = dbName;
  }

  public async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: ['sessionId', 'sensor'] });
        }
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
      req.onsuccess = async () => {
        this.db = req.result;
        try {
          await this.runBootAudit();
        } catch (e) {
          console.error('[IndexedDbStorage] Boot audit error:', e);
        }
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  public getBootAuditReports(): AuditBootReport[] {
    return this.bootAuditReports;
  }

  private async runBootAudit(): Promise<void> {
    if (!this.db) return;
    const resumePts = await this.getResumePts();
    const sessions = new Set<string>();
    for (const pt of resumePts) sessions.add(pt.sessionId);

    this.bootAuditReports = [];
    for (const sid of sessions) {
      for (const sensor of [1, 2] as const) {
        const blocks = await this.getBlocks(sid, sensor);
        const losses = await this.getLosses(sid, sensor);

        const ledger = createLedger();
        let totalStored = 0;
        let totalLost = 0;
        let expectedEnd = 0;

        for (const b of blocks) {
          ledger.pushStored(b.firstIndex, b.firstIndex + b.count);
          totalStored += b.count;
          expectedEnd = Math.max(expectedEnd, b.firstIndex + b.count);
        }
        for (const l of losses) {
          if (l.to !== null) {
            ledger.pushLost(l.from, l.to);
            totalLost += l.to - l.from;
            expectedEnd = Math.max(expectedEnd, l.to);
          }
        }

        const auditRes = ledger.audit(expectedEnd);
        this.bootAuditReports.push({
          sessionId: sid,
          sensor,
          gaps: auditRes.gaps,
          overlaps: auditRes.overlaps,
          totalStored,
          totalLost,
          ok: auditRes.gaps.length === 0 && auditRes.overlaps.length === 0,
        });
      }
    }
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
    return new Promise((resolve, reject) => {
      // Single transaction covering blocks, losses, and sessions with durability: "strict"
      const tx = (this.db as any).transaction(['blocks', 'losses', 'sessions'], 'readwrite', {
        durability: 'strict',
      });
      const blockStore = tx.objectStore('blocks');
      const lossStore = tx.objectStore('losses');
      const sessionStore = tx.objectStore('sessions');

      const checkReq = blockStore.get([record.sessionId, record.sensor, record.firstIndex]);
      checkReq.onsuccess = () => {
        if (checkReq.result) {
          resolve('duplicate');
          return;
        }

        // Put block
        blockStore.put(record);

        // Put any accompanying losses
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

        // Update sessions store
        const sessionReq = sessionStore.get([record.sessionId, record.sensor]);
        sessionReq.onsuccess = () => {
          const current = sessionReq.result || {
            sessionId: record.sessionId,
            sensor: record.sensor,
            startedSeq: record.firstIndex,
            lastIndex: record.firstIndex + record.count,
          };
          current.lastIndex = Math.max(current.lastIndex || 0, record.firstIndex + record.count);
          sessionStore.put(current);
        };
      };

      tx.oncomplete = () => resolve('ok');
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error('Transaction aborted'));
    });
  }

  public async writeLoss(record: LossRecord): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const tx = (this.db as any).transaction('losses', 'readwrite', { durability: 'strict' });
      tx.objectStore('losses').put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
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

  public async getBlocks(
    sessionId: string,
    sensor: 1 | 2
  ): Promise<Array<{ firstIndex: number; count: number; payload: Uint8Array }>> {
    if (!this.db) return [];
    return new Promise((resolve) => {
      const tx = this.db!.transaction('blocks', 'readonly');
      const req = tx.objectStore('blocks').getAll();
      req.onsuccess = () => {
        const blocks = (req.result as BlockRecord[]).filter(
          (b) => b.sessionId === sessionId && b.sensor === sensor
        );
        blocks.sort((a, b) => a.firstIndex - b.firstIndex);
        resolve(
          blocks.map((b) => ({
            firstIndex: b.firstIndex,
            count: b.count,
            payload: b.payload,
          }))
        );
      };
      req.onerror = () => resolve([]);
    });
  }

  public async getLosses(
    sessionId: string,
    sensor: 1 | 2
  ): Promise<Array<{ from: number; to: number | null; reason: string }>> {
    if (!this.db) return [];
    return new Promise((resolve) => {
      const tx = this.db!.transaction('losses', 'readonly');
      const req = tx.objectStore('losses').getAll();
      req.onsuccess = () => {
        const losses = (req.result as LossRecord[]).filter(
          (l) => l.sessionId === sessionId && l.sensor === sensor
        );
        losses.sort((a, b) => a.from - b.from);
        resolve(
          losses.map((l) => ({
            from: l.from,
            to: l.to,
            reason: l.reason,
          }))
        );
      };
      req.onerror = () => resolve([]);
    });
  }

  public async audit(
    sessionId: string
  ): Promise<AuditResult & { totalStored: number; totalLost: number; ok: boolean }> {
    const s1Blocks = await this.getBlocks(sessionId, 1);
    const s1Losses = await this.getLosses(sessionId, 1);
    const s2Blocks = await this.getBlocks(sessionId, 2);
    const s2Losses = await this.getLosses(sessionId, 2);

    const ledger1 = createLedger();
    let totalStored1 = 0;
    let totalLost1 = 0;
    let max1 = 0;
    for (const b of s1Blocks) {
      ledger1.pushStored(b.firstIndex, b.firstIndex + b.count);
      totalStored1 += b.count;
      max1 = Math.max(max1, b.firstIndex + b.count);
    }
    for (const l of s1Losses) {
      if (l.to !== null) {
        ledger1.pushLost(l.from, l.to);
        totalLost1 += l.to - l.from;
        max1 = Math.max(max1, l.to);
      }
    }

    const ledger2 = createLedger();
    let totalStored2 = 0;
    let totalLost2 = 0;
    let max2 = 0;
    for (const b of s2Blocks) {
      ledger2.pushStored(b.firstIndex, b.firstIndex + b.count);
      totalStored2 += b.count;
      max2 = Math.max(max2, b.firstIndex + b.count);
    }
    for (const l of s2Losses) {
      if (l.to !== null) {
        ledger2.pushLost(l.from, l.to);
        totalLost2 += l.to - l.from;
        max2 = Math.max(max2, l.to);
      }
    }

    const a1 = ledger1.audit(max1);
    const a2 = ledger2.audit(max2);

    const gaps = [...a1.gaps, ...a2.gaps];
    const overlaps = [...a1.overlaps, ...a2.overlaps];
    const totalStored = totalStored1 + totalStored2;
    const totalLost = totalLost1 + totalLost2;

    return {
      gaps,
      overlaps,
      totalStored,
      totalLost,
      ok: gaps.length === 0 && overlaps.length === 0,
    };
  }

  public async getExport(sessionId: string): Promise<string> {
    const lines: string[] = [];
    for (const sensor of [1, 2] as const) {
      const blocks = await this.getBlocks(sessionId, sensor);
      for (const b of blocks) {
        const rows = unpackRows(sensor, b.payload, b.count);
        for (let i = 0; i < b.count; i++) {
          lines.push(
            JSON.stringify({
              sensor,
              index: b.firstIndex + i,
              values: rows[i],
            })
          );
        }
      }
    }
    for (const sensor of [1, 2] as const) {
      const losses = await this.getLosses(sessionId, sensor);
      for (const l of losses) {
        lines.push(
          JSON.stringify({
            sensor,
            from_index: l.from,
            to_index: l.to,
            reason: l.reason,
          })
        );
      }
    }
    return lines.join('\n') + (lines.length > 0 ? '\n' : '');
  }

  public async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  public async clear(): Promise<void> {
    await this.close();
    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(this.dbName);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

/**
 * QuotaStorage wrapper:
 * Simulates bounded storage quota and 64 MB reserve space release behaviour.
 */
export class QuotaStorage implements EngineStorage {
  private inner: EngineStorage;
  private maxBytes: number;
  private currentBytes = 0;
  private reserveBytes: number;
  private reserveActive = true;
  private diskFull = false;

  constructor(inner: EngineStorage, maxBytes = 1024 * 1024, reserveBytes = 64 * 1024) {
    this.inner = inner;
    this.maxBytes = maxBytes;
    this.reserveBytes = reserveBytes;
  }

  public isDiskFull(): boolean {
    return this.diskFull;
  }

  public isReserveActive(): boolean {
    return this.reserveActive;
  }

  public async init(): Promise<void> {
    await this.inner.init();
    const pts = await this.inner.getResumePts();
    let bytes = 0;
    for (const pt of pts) {
      const blocks = await this.inner.getBlocks(pt.sessionId, pt.sensor);
      for (const b of blocks) {
        bytes += b.payload.byteLength + 128;
      }
    }
    this.currentBytes = bytes;
  }

  public async getResumePts(): Promise<ResumePoint[]> {
    return this.inner.getResumePts();
  }

  public async writeBlock(record: BlockRecord): Promise<'ok' | 'duplicate' | 'disk_full'> {
    const recordBytes = record.payload.byteLength + 128;

    if (this.currentBytes + recordBytes > this.maxBytes) {
      if (this.reserveActive) {
        // Free reserve space to allow writing honest loss records
        this.reserveActive = false;
        this.diskFull = true;
        this.maxBytes += this.reserveBytes;
      }
      this.diskFull = true;
      // Disk full: attempt to write loss record only
      await this.inner.writeLoss({
        sessionId: record.sessionId,
        sensor: record.sensor,
        from: record.firstIndex,
        to: record.firstIndex + record.count,
        reason: 'disk_full',
        monoUs: record.monoUs,
      });
      return 'disk_full';
    }

    const res = await this.inner.writeBlock(record);
    if (res === 'ok') {
      this.currentBytes += recordBytes;
    }
    return res;
  }

  public async writeLoss(record: LossRecord): Promise<void> {
    await this.inner.writeLoss(record);
  }

  public async writeResult(sessionId: string, result: WindowResult): Promise<void> {
    await this.inner.writeResult(sessionId, result);
  }

  public async getBlocks(sessionId: string, sensor: 1 | 2) {
    return this.inner.getBlocks(sessionId, sensor);
  }

  public async getLosses(sessionId: string, sensor: 1 | 2) {
    return this.inner.getLosses(sessionId, sensor);
  }

  public async audit(sessionId: string) {
    return this.inner.audit(sessionId);
  }

  public async close(): Promise<void> {
    await this.inner.close();
  }

  public resetQuota(): void {
    this.currentBytes = 0;
    this.reserveActive = true;
    this.diskFull = false;
  }

  public simulateDiskFull(): void {
    this.currentBytes = this.maxBytes;
    this.reserveActive = false;
    this.diskFull = true;
  }
}
