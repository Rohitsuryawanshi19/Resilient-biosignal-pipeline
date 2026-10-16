import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IndexedDbStorage, QuotaStorage } from '../src/lab/indexeddb-storage.js';
import { BrowserMock, generateGroundTruth } from '../src/lab/browser-mock.js';
import { packRows } from '@mayacardio/engine';

describe('IndexedDB Crash-Safe Storage & Audit Invariants', () => {
  const dbName = 'test_lab_crash_recovery';

  beforeEach(async () => {
    const storage = new IndexedDbStorage(dbName);
    await storage.init();
    await storage.clear();
  });

  it('1. Boot audit detects zero gaps on normal contiguous writes', async () => {
    const storage = new IndexedDbStorage(dbName);
    await storage.init();

    const sessionId = 'test_sess_01';
    const s1Rows = generateGroundTruth('ramp', 1, 0, 400);
    const s2Rows = generateGroundTruth('ramp', 2, 0, 400);

    // Sensor 1 write
    const r1 = await storage.writeBlock({
      sessionId,
      sensor: 1,
      firstIndex: 0,
      count: 400,
      crc32: 0,
      payload: packRows(1, s1Rows),
      losses: [],
      monoUs: 1000,
    });
    expect(r1).toBe('ok');

    // Sensor 2 write
    const r2 = await storage.writeBlock({
      sessionId,
      sensor: 2,
      firstIndex: 0,
      count: 400,
      crc32: 0,
      payload: packRows(2, s2Rows),
      losses: [],
      monoUs: 1000,
    });
    expect(r2).toBe('ok');

    const auditRes = await storage.audit(sessionId);
    expect(auditRes.ok).toBe(true);
    expect(auditRes.gaps).toHaveLength(0);
    expect(auditRes.overlaps).toHaveLength(0);
    expect(auditRes.totalStored).toBe(800);

    await storage.close();
  });

  it('2. Reload recovery: finds last durable index and audits correctly on reboot', async () => {
    const storage1 = new IndexedDbStorage(dbName);
    await storage1.init();

    const sessionId = 'test_sess_reload';
    for (let b = 0; b < 5; b++) {
      const idx = b * 400;
      await storage1.writeBlock({
        sessionId,
        sensor: 1,
        firstIndex: idx,
        count: 400,
        crc32: 0,
        payload: packRows(1, generateGroundTruth('ramp', 1, idx, 400)),
        losses: [],
        monoUs: 1000 + idx,
      });
    }

    await storage1.close();

    // Reboot: fresh instance
    const storage2 = new IndexedDbStorage(dbName);
    await storage2.init();

    const resumePts = await storage2.getResumePts();
    const s1Pt = resumePts.find((p) => p.sessionId === sessionId && p.sensor === 1);
    expect(s1Pt).toBeDefined();
    expect(s1Pt?.nextIndex).toBe(2000);

    const bootReports = storage2.getBootAuditReports();
    const s1Report = bootReports.find((r) => r.sessionId === sessionId && r.sensor === 1);
    expect(s1Report).toBeDefined();
    expect(s1Report?.ok).toBe(true);
    expect(s1Report?.totalStored).toBe(2000);

    await storage2.close();
  });

  it('3. Audit invariant: detects honest loss intervals with zero overlaps', async () => {
    const storage = new IndexedDbStorage(dbName);
    await storage.init();

    const sessionId = 'test_sess_loss';
    // Write [0, 400)
    await storage.writeBlock({
      sessionId,
      sensor: 1,
      firstIndex: 0,
      count: 400,
      crc32: 0,
      payload: packRows(1, generateGroundTruth('ramp', 1, 0, 400)),
      losses: [],
      monoUs: 1000,
    });

    // Write loss [400, 800)
    await storage.writeLoss({
      sessionId,
      sensor: 1,
      from: 400,
      to: 800,
      reason: 'crc_mismatch_unrecoverable',
      monoUs: 2000,
    });

    // Write [800, 1200)
    await storage.writeBlock({
      sessionId,
      sensor: 1,
      firstIndex: 800,
      count: 400,
      crc32: 0,
      payload: packRows(1, generateGroundTruth('ramp', 1, 800, 400)),
      losses: [],
      monoUs: 3000,
    });

    const auditRes = await storage.audit(sessionId);
    expect(auditRes.ok).toBe(true);
    expect(auditRes.gaps).toHaveLength(0);
    expect(auditRes.overlaps).toHaveLength(0);
    expect(auditRes.totalStored).toBe(800);
    expect(auditRes.totalLost).toBe(400);

    await storage.close();
  });

  it('4. QuotaStorage: engages simulated reserve space and reports disk_full', async () => {
    const baseStorage = new IndexedDbStorage(dbName);
    await baseStorage.init();

    // Max 10 KB quota with 2 KB reserve
    const quotaStorage = new QuotaStorage(baseStorage, 10 * 1024, 2 * 1024);
    await quotaStorage.init();

    const sessionId = 'test_quota_sess';
    let hitFull = false;

    // Push blocks until quota exceeded
    for (let i = 0; i < 20; i++) {
      const idx = i * 400;
      const res = await quotaStorage.writeBlock({
        sessionId,
        sensor: 1,
        firstIndex: idx,
        count: 400,
        crc32: 0,
        payload: packRows(1, generateGroundTruth('ramp', 1, idx, 400)),
        losses: [],
        monoUs: 1000 + idx,
      });

      if (res === 'disk_full') {
        hitFull = true;
        break;
      }
    }

    expect(hitFull).toBe(true);
    expect(quotaStorage.isDiskFull()).toBe(true);

    // Verify losses table recorded disk_full
    const losses = await quotaStorage.getLosses(sessionId, 1);
    const diskFullLoss = losses.find((l) => l.reason === 'disk_full');
    expect(diskFullLoss).toBeDefined();

    await quotaStorage.close();
  });
});
