import { describe, test, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { SessionDO } from '../src/session-do.js';
import { signLabToken, verifyLabToken } from '../src/token.js';
import worker from '../src/index.js';
import { packRows } from '../src/payload.js';

describe('Cloud Lab Token, Abuse Protection & Budget Tests', () => {
  const SECRET = 'test-secret-key-12345';

  test('1. Minted lab token is valid and scoped to labs/ namespace', async () => {
    const sessionId = 'labs/user-abc';
    const expiresAt = Date.now() + 10_000;
    const token = await signLabToken(SECRET, sessionId, expiresAt);

    expect(token).toContain('labs/user-abc');
    const result = await verifyLabToken(SECRET, token, sessionId);
    expect(result.valid).toBe(true);
    expect(result.sessionId).toBe(sessionId);

    // Mismatched session rejection
    const wrongSession = await verifyLabToken(SECRET, token, 'labs/other-session');
    expect(wrongSession.valid).toBe(false);

    // Non-lab session rejection
    const nonLabToken = await signLabToken(SECRET, 'device-session-1', expiresAt);
    const nonLabRes = await verifyLabToken(SECRET, nonLabToken, 'device-session-1');
    expect(nonLabRes.valid).toBe(false);
  });

  test('2. Tampered or expired token is strictly rejected', async () => {
    const sessionId = 'labs/user-123';
    const expiresAt = Date.now() - 1000; // already expired
    const expiredToken = await signLabToken(SECRET, sessionId, expiresAt);

    const expRes = await verifyLabToken(SECRET, expiredToken, sessionId);
    expect(expRes.valid).toBe(false);
    expect(expRes.expired).toBe(true);

    // Tampered signature
    const validToken = await signLabToken(SECRET, sessionId, Date.now() + 10_000);
    const tampered = validToken.slice(0, -4) + '0000';
    const tampRes = await verifyLabToken(SECRET, tampered, sessionId);
    expect(tampRes.valid).toBe(false);
  });

  test('3. Budget threshold (>=80%) returns budget_exceeded', async () => {
    // In-memory SQLite for budget DO
    const db = new Database(':memory:');
    const budgetDO = new SessionDO(null, {});
    budgetDO.initDb(db);

    // Mock DO environment
    const env: any = {
      SHARED_SECRET: SECRET,
      SESSION_DO: {
        idFromName: (name: string) => name,
        get: (id: string) => ({
          fetch: (req: Request) => budgetDO.fetch(req),
        }),
      },
    };

    // Before exhaustion
    const normalReq = new Request('http://localhost/api/lab/token');
    const normalRes = await worker.fetch(normalReq, env, null);
    const normalJson = (await normalRes.json()) as any;
    expect(normalRes.status).toBe(200);
    expect(normalJson.status).toBe('ok');
    expect(normalJson.sessionId.startsWith('labs/')).toBe(true);
    expect(normalJson.token).toBeDefined();

    // Trigger simulation of exhaustion
    const exhReq = new Request('http://localhost/api/lab/token?simulate_exhausted=1');
    const exhRes = await worker.fetch(exhReq, env, null);
    const exhJson = (await exhRes.json()) as any;
    expect(exhJson.status).toBe('budget_exceeded');
    expect(exhJson.message).toBe('cloud budget exhausted today');
    expect(exhJson.budget.exhausted).toBe(true);
  });

  test('4. SessionDO caps lab sessions at 90s (36,000 samples)', async () => {
    const db = new Database(':memory:');
    const session = new SessionDO(null, {});
    session.initDb(db);
    session.sessionId = 'labs/test-cap';

    // Ingest block up to 35,900 (under cap)
    const rows1 = Array.from({ length: 100 }, (_, i) => [i, i, i]);
    const payload1 = packRows(1, rows1);
    session.ingestBlock({
      sensor: 1,
      firstIndex: 35800,
      count: 100,
      crc32: 0,
      payload: payload1,
    });

    const state1 = session.getState();
    expect(state1[1].length).toBe(1);
    expect(state1[1][0]).toEqual({ from: 35800, to: 35900 });

    // Ingest block crossing 36,000 (from 35,900 to 36,200) -> should clamp to 36,000
    const rows2 = Array.from({ length: 300 }, (_, i) => [i, i, i]);
    const payload2 = packRows(1, rows2);
    session.ingestBlock({
      sensor: 1,
      firstIndex: 35900,
      count: 300,
      crc32: 0,
      payload: payload2,
    });

    const state2 = session.getState();
    expect(state2[1][0]).toEqual({ from: 35800, to: 36000 });

    // Ingest block starting at or after 36,000 -> dropped completely
    session.ingestBlock({
      sensor: 1,
      firstIndex: 36000,
      count: 100,
      crc32: 0,
      payload: payload1,
    });
    const state3 = session.getState();
    expect(state3[1][0]).toEqual({ from: 35800, to: 36000 });
  });

  test('5. Differential verification marks offline batches as MATCH', async () => {
    const db = new Database(':memory:');
    const session = new SessionDO(null, {});
    session.initDb(db);
    session.sessionId = 'labs/test-diff';

    const dummyOfflineResult: any = {
      window: 0,
      missing_1: 0,
      missing_2: 0,
      complete: true,
      mean_1: [1, 2, 3],
      min_1: [1, 2, 3],
      max_1: [1, 2, 3],
      mean_2: [1, 2],
      min_2: [1, 2],
      max_2: [1, 2],
      magnitude: 2.2,
      heart_rate: null,
      mode: 'offline',
    };

    // Sync offline result
    session.handleSync({
      offlineResults: [dummyOfflineResult],
    });

    // Run alarm to perform differential check
    await session.alarm();

    const results = (db.query('SELECT window, mode, differential_match FROM results').all() as any[])[0];
    expect(results.window).toBe(0);
    expect(results.mode).toBe('offline');
    expect(results.differential_match).toBe(1);
  });
});
