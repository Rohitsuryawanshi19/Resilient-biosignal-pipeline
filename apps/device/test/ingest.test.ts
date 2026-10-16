import { describe, test, expect, afterEach } from 'bun:test';
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Store, unpackRows } from '../src/store.js';
import { runReader } from '../src/reader.js';
import { runAudit } from '../src/audit.js';
import { crc32 } from '../src/crc32.js';

interface FakeReplyOptions {
  sessionId?: string;
  sensor?: 1 | 2;
  firstIndex?: number;
  count?: number;
  corruptCrc?: boolean;
  lost?: Array<{ from_index: number; to_index: number | null; reason: string }>;
  sessionEnd?: boolean;
}

function makeReply(opts: FakeReplyOptions): string {
  const sessionId = opts.sessionId ?? 'session-test-1';
  const sensor = opts.sensor ?? 1;
  const firstIndex = opts.firstIndex ?? 0;
  const count = opts.count ?? 10;
  const lost = opts.lost ?? [];
  const sessionEnd = opts.sessionEnd ?? false;

  const channels = sensor === 1 ? 3 : 2;
  const data: number[][] = [];
  for (let i = 0; i < count; i++) {
    const row: number[] = [];
    const val = firstIndex + i;
    for (let c = 0; c < channels; c++) row.push(val);
    data.push(row);
  }

  const dataStr = JSON.stringify(data);
  let crc = crc32(dataStr);
  if (opts.corruptCrc) {
    crc = (crc ^ 0xffffffff) >>> 0;
  }

  const obj = {
    session_id: sessionId,
    sensor,
    first_index: firstIndex,
    count,
    lost,
    session_end: sessionEnd,
    crc32: crc,
    data,
  };

  return JSON.stringify(obj) + '\n';
}

function startServer(handler: (socket: net.Socket) => void): Promise<{ server: net.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo;
      resolve({ server, port: addr.port });
    });
    server.on('error', reject);
  });
}

const TEMP_FILES: string[] = [];
function tmpDbPath(name: string) {
  const p = path.resolve(`temp_${name}_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
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

describe('apps/device ingest tests', () => {
  test('1. Normal ramp ingest matches ground truth and audit passes', async () => {
    const dbPath = tmpDbPath('normal');
    const store = new Store({ dbPath, reservePath: dbPath + '.reserve' });

    let s1Idx = 0;
    let s2Idx = 0;

    const { server, port } = await startServer((socket) => {
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
          const firstIndex = sensor === 1 ? s1Idx : s2Idx;
          const rep = makeReply({
            sensor,
            firstIndex,
            count: 10,
          });
          if (sensor === 1) s1Idx += 10;
          else s2Idx += 10;
          socket.write(rep);
        }
      });
    });

    const ac = new AbortController();
    const runPromise = runReader({ host: '127.0.0.1', port, store, mode: 'online', timeoutMs: 1500 }, ac.signal);

    await Bun.sleep(450);
    ac.abort();
    await runPromise.catch(() => {});
    server.close();

    const reports = runAudit(store);
    expect(reports.length).toBeGreaterThanOrEqual(1);
    for (const r of reports) {
      expect(r.ok).toBe(true);
      expect(r.gaps.length).toBe(0);
      expect(r.overlaps.length).toBe(0);
      expect(r.totalStored).toBeGreaterThan(0);
    }

    // Verify ramp ground truth values for sensor 1
    const s1Blocks = store.getBlocks(reports[0]!.sessionId, 1);
    for (const b of s1Blocks) {
      const rows = unpackRows(1, b.payload, b.count);
      for (let i = 0; i < b.count; i++) {
        const expectedVal = b.firstIndex + i;
        expect(rows[i]).toEqual([expectedVal, expectedVal, expectedVal]);
      }
    }

    store.close();
  });

  test('2. CRC corruption triggers retry and recovers', async () => {
    const dbPath = tmpDbPath('crc-retry');
    const store = new Store({ dbPath, reservePath: dbPath + '.reserve' });

    let attempt = 0;

    const { server, port } = await startServer((socket) => {
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
          attempt++;
          // First attempt corrupt, subsequent retry ok
          const rep = makeReply({
            sensor,
            firstIndex: 0,
            count: 10,
            corruptCrc: attempt === 1,
          });
          socket.write(rep);
        }
      });
    });

    const ac = new AbortController();
    const runPromise = runReader({ host: '127.0.0.1', port, store, mode: 'online', timeoutMs: 500 }, ac.signal);

    await Bun.sleep(150);
    ac.abort();
    await runPromise.catch(() => {});
    server.close();

    const reports = runAudit(store);
    expect(reports.length).toBeGreaterThan(0);
    for (const r of reports) {
      expect(r.ok).toBe(true);
    }
    store.close();
  });

  test('3. CRC corruption unrecoverable records loss and audit passes', async () => {
    const dbPath = tmpDbPath('crc-unrecov');
    const store = new Store({ dbPath, reservePath: dbPath + '.reserve' });

    const { server, port } = await startServer((socket) => {
      let buf = '';
      socket.on('data', (chunk) => {
        buf += chunk.toString();
        while (buf.includes('\n')) {
          const idx = buf.indexOf('\n');
          buf = buf.slice(idx + 1);
          // Always corrupt
          const rep = makeReply({
            sensor: 1,
            firstIndex: 0,
            count: 10,
            corruptCrc: true,
          });
          socket.write(rep);
        }
      });
    });

    const ac = new AbortController();
    const runPromise = runReader({ host: '127.0.0.1', port, store, mode: 'online', timeoutMs: 1500 }, ac.signal);

    await Bun.sleep(450);
    ac.abort();
    await runPromise.catch(() => {});
    server.close();

    const losses = store.getLosses('session-test-1', 1);
    expect(losses.some((l) => l.reason === 'crc_mismatch_unrecoverable')).toBe(true);

    const reports = runAudit(store);
    for (const r of reports) {
      expect(r.ok).toBe(true);
    }
    store.close();
  });

  test('4. Duplicate reply dropped and audit has no overlaps', async () => {
    const dbPath = tmpDbPath('dup');
    const store = new Store({ dbPath, reservePath: dbPath + '.reserve' });

    let sent = 0;
    const { server, port } = await startServer((socket) => {
      let buf = '';
      socket.on('data', (chunk) => {
        buf += chunk.toString();
        while (buf.includes('\n')) {
          const idx = buf.indexOf('\n');
          buf = buf.slice(idx + 1);
          sent++;
          // Send index 0 both times
          const rep = makeReply({
            sensor: 1,
            firstIndex: 0,
            count: 10,
          });
          socket.write(rep);
        }
      });
    });

    const ac = new AbortController();
    const runPromise = runReader({ host: '127.0.0.1', port, store, mode: 'online', timeoutMs: 500 }, ac.signal);

    await Bun.sleep(100);
    ac.abort();
    await runPromise.catch(() => {});
    server.close();

    const reports = runAudit(store);
    for (const r of reports) {
      expect(r.ok).toBe(true);
      expect(r.overlaps.length).toBe(0);
    }
    store.close();
  });

  test('5. Mock-reported loss stored and audit passes', async () => {
    const dbPath = tmpDbPath('mock-loss');
    const store = new Store({ dbPath, reservePath: dbPath + '.reserve' });

    const { server, port } = await startServer((socket) => {
      let buf = '';
      socket.on('data', (chunk) => {
        buf += chunk.toString();
        while (buf.includes('\n')) {
          const idx = buf.indexOf('\n');
          buf = buf.slice(idx + 1);
          const rep = makeReply({
            sensor: 1,
            firstIndex: 20,
            count: 10,
            lost: [{ from_index: 0, to_index: 20, reason: 'mock_buffer_overflow' }],
          });
          socket.write(rep);
        }
      });
    });

    const ac = new AbortController();
    const runPromise = runReader({ host: '127.0.0.1', port, store, mode: 'online', timeoutMs: 500 }, ac.signal);

    await Bun.sleep(100);
    ac.abort();
    await runPromise.catch(() => {});
    server.close();

    const losses = store.getLosses('session-test-1', 1);
    expect(losses.some((l) => l.reason === 'mock_buffer_overflow')).toBe(true);

    const reports = runAudit(store);
    for (const r of reports) {
      expect(r.ok).toBe(true);
      expect(r.gaps.length).toBe(0);
    }
    store.close();
  });

  test('6. Session restart closes old session with unread loss and starts clean', async () => {
    const dbPath = tmpDbPath('session-restart');
    const store = new Store({ dbPath, reservePath: dbPath + '.reserve' });

    let count = 0;
    const { server, port } = await startServer((socket) => {
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
          count++;
          const sessionId = count <= 2 ? 'sess-1' : 'sess-2';
          const rep = makeReply({
            sessionId,
            sensor,
            firstIndex: 0,
            count: 10,
          });
          socket.write(rep);
        }
      });
    });

    const ac = new AbortController();
    const runPromise = runReader({ host: '127.0.0.1', port, store, mode: 'online', timeoutMs: 500 }, ac.signal);

    await Bun.sleep(150);
    ac.abort();
    await runPromise.catch(() => {});
    server.close();

    const sess1Losses = store.getLosses('sess-1', 1);
    expect(sess1Losses.some((l) => l.reason === 'session_changed')).toBe(true);

    const reports = runAudit(store);
    for (const r of reports) {
      expect(r.ok).toBe(true);
    }
    store.close();
  });

  test('7. Unreported gap is recorded with honest reason', async () => {
    const dbPath = tmpDbPath('unreported-gap');
    const store = new Store({ dbPath, reservePath: dbPath + '.reserve' });

    const sIndices = { 1: 0, 2: 0 };
    let s1Replies = 0;

    const { server, port } = await startServer((socket) => {
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
          let firstIndex = sIndices[sensor];
          if (sensor === 1) {
            s1Replies++;
            if (s1Replies === 2) {
              firstIndex = 30; // Jump from 10 to 30 (unreported gap)
            }
          }
          const rep = makeReply({
            sensor,
            firstIndex,
            count: 10,
          });
          sIndices[sensor] = firstIndex + 10;
          socket.write(rep);
        }
      });
    });

    const ac = new AbortController();
    const runPromise = runReader({ host: '127.0.0.1', port, store, mode: 'online', timeoutMs: 500 }, ac.signal);

    await Bun.sleep(150);
    ac.abort();
    await runPromise.catch(() => {});
    server.close();

    const losses = store.getLosses('session-test-1', 1);
    expect(losses.some((l) => l.reason.includes('gap_not_reported_by_mock'))).toBe(true);

    const reports = runAudit(store);
    for (const r of reports) {
      expect(r.ok).toBe(true);
      expect(r.gaps.length).toBe(0);
    }
    store.close();
  });

  test('8. SIGKILL resilience: killed processes leave consistent WAL and audit passes', async () => {
    let sIdx = 0;
    const { server, port } = await startServer((socket) => {
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
          const rep = makeReply({
            sensor,
            firstIndex: sIdx,
            count: 10,
          });
          sIdx += 10;
          socket.write(rep);
        }
      });
    });

    const dbPath = tmpDbPath('sigkill');
    const reservePath = dbPath + '.reserve';

    // Run 10 iterations of spawn child + SIGKILL at random interval
    for (let i = 0; i < 10; i++) {
      const child = Bun.spawn([process.execPath, 'run', 'test/ingest-child.ts', '--db', dbPath, '--reserve', reservePath, '--port', String(port)], {
        cwd: process.cwd(),
        stdout: 'ignore',
        stderr: 'ignore',
      });

      // Kill between 10ms and 60ms
      const delay = 10 + Math.floor(Math.random() * 50);
      await Bun.sleep(delay);
      child.kill('SIGKILL');
      await child.exited;

      // Verify DB can be reopened and integrity check passes
      const reopenStore = new Store({ dbPath, reservePath });
      const reports = runAudit(reopenStore);
      for (const r of reports) {
        expect(r.ok).toBe(true);
        expect(r.overlaps.length).toBe(0);
      }

      // Check ground truth for all stored samples
      for (const r of reports) {
        const blocks = reopenStore.getBlocks(r.sessionId, 1);
        for (const b of blocks) {
          const rows = unpackRows(1, b.payload, b.count);
          for (let j = 0; j < b.count; j++) {
            const expectedVal = b.firstIndex + j;
            expect(rows[j]).toEqual([expectedVal, expectedVal, expectedVal]);
          }
        }
      }

      reopenStore.close();
    }

    server.close();
  });
});
