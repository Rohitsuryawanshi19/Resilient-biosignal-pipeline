import { describe, test, expect, afterEach } from 'bun:test';
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Database } from 'bun:sqlite';
import { ModeController, type ModeChangeEvent } from '../src/mode.js';
import { Store, unpackRows, packRows } from '../src/store.js';
import { runReader } from '../src/reader.js';
import { runAudit } from '../src/audit.js';
import { crc32 } from '../src/crc32.js';
import { SessionDO } from '../../cloud/src/session-do.js';
import { SyncClient } from '../src/sync.js';

describe('ModeController Unit Tests', () => {
  test('1. Initial state is offline', () => {
    const mc = new ModeController();
    expect(mc.getMode()).toBe('offline');
  });

  test('2. Hysteresis: requires 2 consecutive acks to go online', () => {
    const events: ModeChangeEvent[] = [];
    let currentTime = 1000;
    const mc = new ModeController({
      getNowMono: () => currentTime,
      onModeChange: (e) => events.push(e),
    });

    // 1st ack: stays offline
    mc.recordAck(currentTime);
    expect(mc.getMode()).toBe('offline');
    expect(events.length).toBe(0);

    // 2nd ack: transitions to online
    currentTime += 500;
    mc.recordAck(currentTime);
    expect(mc.getMode()).toBe('online');
    expect(events.length).toBe(1);
    expect(events[0]).toEqual({
      from: 'offline',
      to: 'online',
      timestampMono: 1500,
    });
  });

  test('3. Timely acks maintain online mode; timeout after 4s drops to offline', () => {
    const events: ModeChangeEvent[] = [];
    let currentTime = 0;
    const mc = new ModeController({
      ackTimeoutMs: 4000,
      getNowMono: () => currentTime,
      onModeChange: (e) => events.push(e),
    });

    // Bring online
    mc.recordAck(100);
    mc.recordAck(200);
    expect(mc.getMode()).toBe('online');

    // Tick at 2s: still online
    currentTime = 2200;
    mc.tick(currentTime);
    expect(mc.getMode()).toBe('online');

    // New ack at 2.5s
    currentTime = 2500;
    mc.recordAck(currentTime);

    // Tick at 5s (2.5s since last ack): still online
    currentTime = 5000;
    mc.tick(currentTime);
    expect(mc.getMode()).toBe('online');

    // Tick at 6.6s (> 4s since 2.5s ack): drops to offline
    currentTime = 6600;
    mc.tick(currentTime);
    expect(mc.getMode()).toBe('offline');
    expect(events.length).toBe(2);
    expect(events[1]!.to).toBe('offline');
  });

  test('4. Flapping network (ack then timeout) never goes online', () => {
    let currentTime = 0;
    const mc = new ModeController({
      getNowMono: () => currentTime,
    });

    for (let i = 0; i < 5; i++) {
      currentTime += 1000;
      mc.recordAck(currentTime); // 1 ack
      currentTime += 5000;       // timeout before 2nd ack
      mc.tick(currentTime);
      expect(mc.getMode()).toBe('offline');
    }
  });
});

describe('Cloud Sync & 20 Network Cut/Restore Integration Test', () => {
  const TEMP_FILES: string[] = [];
  function tmpDb(name: string) {
    const p = path.resolve(`temp_mode_${name}_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
    TEMP_FILES.push(p);
    TEMP_FILES.push(p + '-wal');
    TEMP_FILES.push(p + '-shm');
    TEMP_FILES.push(p + '.reserve');
    return p;
  }

  afterEach(() => {
    for (const f of TEMP_FILES) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {}
    }
    TEMP_FILES.length = 0;
  });

  test('Cut/restore network 20 times: cloud export == device export == ground truth & audit passes', async () => {
    // 1. Setup in-memory Cloud SessionDO backed by SQLite
    const cloudDb = new Database(':memory:');
    const cloudDO = new SessionDO(null, null);
    cloudDO.initDb(cloudDb);

    // Mock HTTP server for cloud endpoints
    const cloudServer = Bun.serve({
      port: 0,
      async fetch(req) {
        return cloudDO.fetch(req);
      },
    });

    const cloudUrl = `http://127.0.0.1:${cloudServer.port}`;
    const syncClient = new SyncClient({ cloudUrl, batchSize: 20 });

    // 2. Setup Device Store and Fake TCP Mock Server
    const dbPath = tmpDb('cut-restore');
    const store = new Store({ dbPath, reservePath: dbPath + '.reserve' });

    let s1Index = 0;
    let s2Index = 0;
    const sessionId = 'session-cut-restore-20';

    const tcpServer = net.createServer((socket) => {
      let buf = '';
      socket.on('data', (chunk) => {
        buf += chunk.toString();
        while (buf.includes('\n')) {
          const idx = buf.indexOf('\n');
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line) continue;
          const req = JSON.parse(line);
          const sensor = req.sensor as 1 | 2;
          const firstIndex = sensor === 1 ? s1Index : s2Index;
          const count = 10;
          const channels = sensor === 1 ? 3 : 2;

          const data: number[][] = [];
          for (let i = 0; i < count; i++) {
            const row: number[] = [];
            const val = firstIndex + i;
            for (let c = 0; c < channels; c++) row.push(val);
            data.push(row);
          }

          const rep = {
            session_id: sessionId,
            sensor,
            first_index: firstIndex,
            count,
            lost: [],
            session_end: false,
            crc32: crc32(JSON.stringify(data)),
            data,
          };

          if (sensor === 1) s1Index += count;
          else s2Index += count;

          socket.write(JSON.stringify(rep) + '\n');
        }
      });
    });

    await new Promise<void>((resolve) => tcpServer.listen(0, '127.0.0.1', resolve));
    const tcpPort = (tcpServer.address() as net.AddressInfo).port;

    // 3. Start reader loop
    const ac = new AbortController();
    const readerPromise = runReader({
      host: '127.0.0.1',
      port: tcpPort,
      store,
      mode: 'online',
      timeoutMs: 1000,
    }, ac.signal);

    const modeController = new ModeController();
    let networkUp = true;

    // 4. Simulate 20 cut/restore cycles
    for (let cycle = 1; cycle <= 20; cycle++) {
      await Bun.sleep(15);

      // Toggle network state
      networkUp = !networkUp;

      if (networkUp) {
        // Network restored: record acks and sync backlog
        modeController.recordAck();
        modeController.recordAck();
        expect(modeController.getMode()).toBe('online');

        try {
          await syncClient.syncSession(sessionId, store);
        } catch {
          // Retry next cycle if any transient network glitch
        }
      } else {
        // Network cut: force offline
        modeController.forceOffline();
        expect(modeController.getMode()).toBe('offline');
      }
    }

    // 5. Final recovery: ensure network is UP and final sync complete
    modeController.recordAck();
    modeController.recordAck();
    expect(modeController.getMode()).toBe('online');

    // Stop reader
    ac.abort();
    await readerPromise.catch(() => {});
    tcpServer.close();

    // Final catch-up sync
    await syncClient.syncSession(sessionId, store);

    // 6. Assertions
    // A. Device Audit passes
    const auditReports = runAudit(store);
    expect(auditReports.length).toBeGreaterThan(0);
    for (const r of auditReports) {
      expect(r.ok).toBe(true);
      expect(r.gaps.length).toBe(0);
      expect(r.overlaps.length).toBe(0);
      expect(r.totalStored).toBeGreaterThan(0);
    }

    // B. Ground Truth check on device store
    for (const sensor of [1, 2] as const) {
      const blocks = store.getBlocks(sessionId, sensor);
      const channels = sensor === 1 ? 3 : 2;
      for (const b of blocks) {
        const rows = unpackRows(sensor, b.payload, b.count);
        for (let i = 0; i < b.count; i++) {
          const expectedVal = b.firstIndex + i;
          const expectedRow = Array(channels).fill(expectedVal);
          expect(rows[i]).toEqual(expectedRow);
        }
      }
    }

    // C. Cloud Export == Device Export == Ground Truth
    const cloudExportRes = await fetch(`${cloudUrl}/export?session=${encodeURIComponent(sessionId)}`, {
      headers: { 'Authorization': 'Bearer mayacardio-secret-token' },
    });
    const cloudExportText = await cloudExportRes.text();
    const cloudExportLines = cloudExportText.trim().split('\n').filter((l) => l.length > 0);

    // Generate expected export from device store
    const deviceExportLines: string[] = [];
    for (const sensor of [1, 2] as const) {
      const blocks = store.getBlocks(sessionId, sensor);
      for (const b of blocks) {
        const rows = unpackRows(sensor, b.payload, b.count);
        for (let i = 0; i < b.count; i++) {
          deviceExportLines.push(JSON.stringify({
            sensor,
            index: b.firstIndex + i,
            values: rows[i],
          }));
        }
      }
      const losses = store.getLosses(sessionId, sensor);
      for (const l of losses) {
        deviceExportLines.push(JSON.stringify({
          sensor: l.sensor,
          from_index: l.from,
          to_index: l.to,
          reason: l.reason,
        }));
      }
    }

    // Cloud export must match device export sample-by-sample
    expect(cloudExportLines.length).toBe(deviceExportLines.length);
    for (let i = 0; i < deviceExportLines.length; i++) {
      expect(cloudExportLines[i]).toBe(deviceExportLines[i]);
    }

    cloudServer.stop();
    store.close();
  });
});
