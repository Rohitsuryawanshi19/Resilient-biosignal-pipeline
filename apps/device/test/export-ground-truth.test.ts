import { describe, test, expect, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Store, packRows } from '../src/store.js';
import { runAudit } from '../src/audit.js';

describe('Export Ground Truth Verification', () => {
  const tmpFiles: string[] = [];

  afterEach(() => {
    for (const f of tmpFiles) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {}
    }
    tmpFiles.length = 0;
  });

  test('Export of ramp session streams correctly and matches ground truth sample-by-sample', async () => {
    const dbPath = path.resolve(`temp_export_test_${Date.now()}.db`);
    tmpFiles.push(dbPath, dbPath + '-wal', dbPath + '-shm', dbPath + '.reserve');

    const store = new Store({ dbPath, reservePath: dbPath + '.reserve' });
    const sessionId = 'ramp-session-3600s';

    // Populate a test ramp session (e.g. 100 blocks = 40,000 samples per sensor)
    const totalBlocks = 100;
    const countPerBlock = 400; // 1 second @ 400 Hz
    const monoUs = 1000;

    for (let b = 0; b < totalBlocks; b++) {
      const firstIndex = b * countPerBlock;

      // Sensor 1: 3 channels [i, i, i]
      const s1Rows: number[][] = [];
      for (let i = 0; i < countPerBlock; i++) {
        const val = firstIndex + i;
        s1Rows.push([val, val, val]);
      }
      store.writeBlock({
        sessionId,
        sensor: 1,
        firstIndex,
        count: countPerBlock,
        crc32: 0,
        payload: packRows(1, s1Rows),
        losses: [],
        monoUs,
      });

      // Sensor 2: 2 channels [i, i]
      const s2Rows: number[][] = [];
      for (let i = 0; i < countPerBlock; i++) {
        const val = firstIndex + i;
        s2Rows.push([val, val]);
      }
      store.writeBlock({
        sessionId,
        sensor: 2,
        firstIndex,
        count: countPerBlock,
        crc32: 0,
        payload: packRows(2, s2Rows),
        losses: [],
        monoUs,
      });
    }

    store.close();

    const cwd = process.cwd().endsWith('device') ? process.cwd() : path.resolve('apps/device');
    const proc = Bun.spawn([
      process.execPath,
      'run',
      'src/main.ts',
      '--db',
      dbPath,
      '--session',
      sessionId,
      'export',
    ], {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const stdoutText = await new Response(proc.stdout).text();
    await proc.exited;

    const lines = stdoutText.trim().split('\n').filter((l) => l.length > 0);
    expect(lines.length).toBe(totalBlocks * countPerBlock * 2);

    // Verify samples ascending by index and matching ground truth exactly
    let currentSensor = 1;
    let expectedIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const obj = JSON.parse(lines[i]!);

      if (obj.sensor === 2 && currentSensor === 1) {
        // Transitioned to sensor 2
        currentSensor = 2;
        expectedIndex = 0;
      }

      expect(obj.sensor).toBe(currentSensor);
      expect(obj.index).toBe(expectedIndex);

      const channels = currentSensor === 1 ? 3 : 2;
      const expectedValues = Array(channels).fill(expectedIndex);
      expect(obj.values).toEqual(expectedValues);

      expectedIndex++;
    }

    // Verify audit
    const readStore = new Store({ dbPath, readonly: true });
    const auditRes = runAudit(readStore);
    expect(auditRes.every((r) => r.ok)).toBe(true);
    readStore.close();
  });
});
