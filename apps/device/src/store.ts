import { Database, type Statement } from 'bun:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { WindowResult } from '@mayacardio/core';

export interface StoreConfig {
  dbPath: string;
  reservePath?: string; // 64MB pre-allocated reserve file
  readonly?: boolean;
}

export interface ResumePoint {
  sessionId: string;
  sensor: 1 | 2;
  nextIndex: number; // last stored index + 1, or 0 if fresh
}

export function packInt24(val: number, buf: Uint8Array, offset: number): void {
  const v = val & 0xffffff;
  buf[offset] = (v >> 16) & 0xff;
  buf[offset + 1] = (v >> 8) & 0xff;
  buf[offset + 2] = v & 0xff;
}

export function unpackInt24(buf: Uint8Array, offset: number): number {
  const b0 = buf[offset] ?? 0;
  const b1 = buf[offset + 1] ?? 0;
  const b2 = buf[offset + 2] ?? 0;
  const v = (b0 << 16) | (b1 << 8) | b2;
  return v >= 0x800000 ? v - 0x01000000 : v;
}

export function packRows(sensor: 1 | 2, rows: number[][]): Uint8Array {
  const channels = sensor === 1 ? 3 : 2;
  const buf = new Uint8Array(rows.length * channels * 3);
  let offset = 0;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = 0; c < channels; c++) {
      const val = row[c] ?? 0;
      packInt24(val, buf, offset);
      offset += 3;
    }
  }
  return buf;
}

export function unpackRows(sensor: 1 | 2, buf: Uint8Array, count: number): number[][] {
  const channels = sensor === 1 ? 3 : 2;
  const rows: number[][] = [];
  let offset = 0;
  for (let r = 0; r < count; r++) {
    const row: number[] = [];
    for (let c = 0; c < channels; c++) {
      row.push(unpackInt24(buf, offset));
      offset += 3;
    }
    rows.push(row);
  }
  return rows;
}

export class Store {
  private db: Database;
  private config: StoreConfig;
  public diskFull = false;

  private stmtCheckBlock?: Statement;
  private stmtUpsertSession?: Statement;
  private stmtInsertBlock?: Statement;
  private stmtUpsertLoss?: Statement;
  private stmtInsertResult?: Statement;

  constructor(config: StoreConfig) {
    this.config = config;
    if (config.readonly) {
      this.db = new Database(config.dbPath, { readonly: true });
      this.db.exec('PRAGMA busy_timeout=5000;');
      return;
    }

    if (config.dbPath !== ':memory:') {
      const dbDir = path.dirname(config.dbPath);
      if (dbDir && !fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
    }

    this.db = new Database(config.dbPath, { create: true });
    this.initPragmasAndTables();
    this.initReserveFile();

    this.stmtCheckBlock = this.db.prepare(
      'SELECT 1 FROM blocks WHERE session_id = ? AND sensor = ? AND first_index = ?'
    );
    this.stmtUpsertSession = this.db.prepare(
      'INSERT INTO sessions (session_id, sensor, started_seq, ended, end_index) VALUES (?, ?, ?, 0, NULL) ON CONFLICT(session_id, sensor) DO NOTHING'
    );
    this.stmtInsertBlock = this.db.prepare(
      'INSERT INTO blocks (session_id, sensor, first_index, count, crc32, payload) VALUES (?, ?, ?, ?, ?, ?)'
    );
    this.stmtUpsertLoss = this.db.prepare(`
      INSERT INTO losses (session_id, sensor, from_index, to_index, reason, detected_at_mono)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, sensor, from_index) DO UPDATE SET
        to_index = excluded.to_index,
        reason = excluded.reason,
        detected_at_mono = excluded.detected_at_mono
    `);
    this.stmtInsertResult = this.db.prepare(`
      INSERT INTO results (session_id, window, mode, json, synced)
      VALUES (?, ?, ?, ?, 0)
      ON CONFLICT(session_id, window) DO UPDATE SET
        mode = excluded.mode,
        json = excluded.json
    `);
  }

  private initPragmasAndTables(): void {
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=FULL;
      PRAGMA busy_timeout=5000;
      PRAGMA foreign_keys=ON;

      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT NOT NULL,
        sensor INTEGER NOT NULL,
        started_seq INTEGER NOT NULL DEFAULT 0,
        ended INTEGER NOT NULL DEFAULT 0,
        end_index INTEGER,
        PRIMARY KEY (session_id, sensor)
      );

      CREATE TABLE IF NOT EXISTS blocks (
        session_id TEXT NOT NULL,
        sensor INTEGER NOT NULL,
        first_index INTEGER NOT NULL,
        count INTEGER NOT NULL,
        crc32 INTEGER NOT NULL,
        payload BLOB NOT NULL,
        PRIMARY KEY (session_id, sensor, first_index),
        FOREIGN KEY (session_id, sensor) REFERENCES sessions(session_id, sensor)
      );

      CREATE TABLE IF NOT EXISTS losses (
        session_id TEXT NOT NULL,
        sensor INTEGER NOT NULL,
        from_index INTEGER NOT NULL,
        to_index INTEGER,
        reason TEXT NOT NULL,
        detected_at_mono INTEGER NOT NULL,
        PRIMARY KEY (session_id, sensor, from_index),
        FOREIGN KEY (session_id, sensor) REFERENCES sessions(session_id, sensor)
      );

      CREATE TABLE IF NOT EXISTS results (
        session_id TEXT NOT NULL,
        window INTEGER NOT NULL,
        mode TEXT NOT NULL,
        json TEXT NOT NULL,
        synced INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (session_id, window)
      );

      CREATE TABLE IF NOT EXISTS cloud_acks (
        session_id TEXT NOT NULL,
        sensor INTEGER NOT NULL,
        acked_ranges TEXT NOT NULL,
        PRIMARY KEY (session_id, sensor)
      );
    `);
  }

  public initReserveFile(): void {
    try {
      if (this.config.reservePath && !fs.existsSync(this.config.reservePath)) {
        const dir = path.dirname(this.config.reservePath);
        if (dir && !fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        const fd = fs.openSync(this.config.reservePath, 'w');
        const chunk = Buffer.alloc(1024 * 1024);
        for (let i = 0; i < 64; i++) {
          fs.writeSync(fd, chunk);
        }
        fs.closeSync(fd);
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Warning: failed to init reserve file:`, err);
    }
  }

  private checkDiskRecovery(): void {
    if (!this.diskFull) return;
    try {
      const stats = fs.statfsSync(path.dirname(this.config.dbPath));
      const freeBytes = stats.bavail * stats.bsize;
      if (freeBytes > 128 * 1024 * 1024) {
        this.initReserveFile();
        this.diskFull = false;
      }
    } catch {
      // ignore
    }
  }

  getResumePts(): ResumePoint[] {
    const check = this.db.query('PRAGMA integrity_check').get() as { integrity_check?: string } | null;
    if (check && check.integrity_check !== 'ok') {
      throw new Error(`SQLite integrity check failed: ${check.integrity_check}`);
    }

    const rows = this.db.query<{
      sessionId: string;
      sensor: number;
      nextIndex: number;
    }, []>(`
      SELECT s.session_id AS sessionId, s.sensor, COALESCE(MAX(b.first_index + b.count), 0) AS nextIndex
      FROM sessions s
      LEFT JOIN blocks b ON s.session_id = b.session_id AND s.sensor = b.sensor
      WHERE s.ended = 0
      GROUP BY s.session_id, s.sensor
    `).all();

    return rows.map((r) => ({
      sessionId: r.sessionId,
      sensor: r.sensor as 1 | 2,
      nextIndex: r.nextIndex,
    }));
  }

  writeBlock(params: {
    sessionId: string;
    sensor: 1 | 2;
    firstIndex: number;
    count: number;
    crc32: number;
    payload: Uint8Array;
    losses: Array<{ from: number; to: number | null; reason: string }>;
    monoUs: number;
  }): 'ok' | 'duplicate' | 'disk_full' {
    this.checkDiskRecovery();
    if (this.diskFull) {
      return 'disk_full';
    }

    const tx = this.db.transaction(() => {
      const existing = this.stmtCheckBlock.get(params.sessionId, params.sensor, params.firstIndex);
      if (existing) {
        return 'duplicate';
      }

      this.stmtUpsertSession.run(params.sessionId, params.sensor, params.firstIndex);

      this.stmtInsertBlock.run(
        params.sessionId,
        params.sensor,
        params.firstIndex,
        params.count,
        params.crc32,
        params.payload
      );

      for (const loss of params.losses) {
        this.stmtUpsertLoss.run(
          params.sessionId,
          params.sensor,
          loss.from,
          loss.to,
          loss.reason,
          params.monoUs
        );
      }

      return 'ok';
    });

    try {
      return tx() as 'ok' | 'duplicate';
    } catch (err: unknown) {
      const errMsg = String(err instanceof Error ? err.message : err);
      const isFull =
        errMsg.toLowerCase().includes('full') ||
        errMsg.includes('ENOSPC') ||
        (err as any)?.code === 'SQLITE_FULL';
      if (isFull) {
        try {
          if (fs.existsSync(this.config.reservePath)) {
            fs.unlinkSync(this.config.reservePath);
          }
        } catch {}

        try {
          // If max_page_count was used to simulate disk full, unlinking reserve gives space
          const curLimit = (this.db.query('PRAGMA max_page_count;').get() as any)?.max_page_count;
          if (typeof curLimit === 'number' && curLimit < 1_000_000) {
            this.db.exec(`PRAGMA max_page_count = ${curLimit + 5};`);
          }
        } catch {}

        try {
          this.writeLoss({
            sessionId: params.sessionId,
            sensor: params.sensor,
            from: params.firstIndex,
            to: params.firstIndex + params.count,
            reason: 'disk_full',
            monoUs: params.monoUs,
          });
        } catch (lossErr) {
          console.error(`[${new Date().toISOString()}] Failed to record disk_full loss:`, lossErr);
        }

        this.diskFull = true;
        return 'disk_full';
      }
      throw err;
    }
  }

  writeLoss(params: {
    sessionId: string;
    sensor: 1 | 2;
    from: number;
    to: number | null;
    reason: string;
    monoUs: number;
  }): void {
    this.stmtUpsertSession.run(params.sessionId, params.sensor, params.from);
    this.stmtUpsertLoss.run(
      params.sessionId,
      params.sensor,
      params.from,
      params.to,
      params.reason,
      params.monoUs
    );
  }

  endSession(sessionId: string, sensor: 1 | 2, endIndex: number): void {
    this.stmtUpsertSession.run(sessionId, sensor, 0);
    this.db.prepare(
      'UPDATE sessions SET ended = 1, end_index = ? WHERE session_id = ? AND sensor = ?'
    ).run(endIndex, sessionId, sensor);
  }

  writeResult(sessionId: string, result: WindowResult): void {
    this.stmtInsertResult.run(
      sessionId,
      result.window,
      result.mode,
      JSON.stringify(result)
    );
  }

  getBlocks(sessionId: string, sensor: 1 | 2): Array<{ firstIndex: number; count: number; payload: Uint8Array }> {
    const rows = this.db.query<{ first_index: number; count: number; payload: Uint8Array }, [string, number]>(
      'SELECT first_index, count, payload FROM blocks WHERE session_id = ? AND sensor = ? ORDER BY first_index ASC'
    ).all(sessionId, sensor);

    return rows.map((r) => ({
      firstIndex: r.first_index,
      count: r.count,
      payload: r.payload,
    }));
  }

  getLosses(sessionId: string, sensor: 1 | 2): Array<{ from: number; to: number | null; reason: string }> {
    const rows = this.db.query<{ from_index: number; to_index: number | null; reason: string }, [string, number]>(
      'SELECT from_index, to_index, reason FROM losses WHERE session_id = ? AND sensor = ? ORDER BY from_index ASC'
    ).all(sessionId, sensor);

    return rows.map((r) => ({
      from: r.from_index,
      to: r.to_index,
      reason: r.reason,
    }));
  }

  getSessions(): Array<{ sessionId: string; sensor: 1 | 2; endIndex: number | null }> {
    const rows = this.db.query<{ session_id: string; sensor: number; end_index: number | null }, []>(
      'SELECT session_id, sensor, end_index FROM sessions ORDER BY session_id, sensor'
    ).all();

    return rows.map((r) => ({
      sessionId: r.session_id,
      sensor: r.sensor as 1 | 2,
      endIndex: r.end_index,
    }));
  }

  getStats(): { sessions: number; blocks: number; totalSamples: number; losses: number; backlog: number } {
    const s = this.db.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM sessions').get();
    const b = this.db.query<{ count: number; total: number }, []>(
      'SELECT COUNT(*) AS count, COALESCE(SUM(count), 0) AS total FROM blocks'
    ).get();
    const l = this.db.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM losses').get();
    const r = this.db.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM results WHERE synced = 0').get();

    return {
      sessions: s?.count ?? 0,
      blocks: b?.count ?? 0,
      totalSamples: b?.total ?? 0,
      losses: l?.count ?? 0,
      backlog: r?.count ?? 0,
    };
  }

  getResults(): string[] {
    const rows = this.db.query<{ json: string }, []>(
      'SELECT json FROM results ORDER BY session_id, window ASC'
    ).all();
    return rows.map((r) => r.json);
  }

  getResultsForSession(sessionId: string): string[] {
    const rows = this.db.query<{ json: string }, [string]>(
      'SELECT json FROM results WHERE session_id = ? ORDER BY window ASC'
    ).all(sessionId);
    return rows.map((r) => r.json);
  }

  getLatestSessionId(): string | null {
    const row = this.db.query<{ session_id: string }, []>(
      'SELECT session_id FROM sessions ORDER BY started_seq DESC LIMIT 1'
    ).get();
    return row?.session_id ?? null;
  }

  getSamplesSaved(sessionId?: string): number {
    if (sessionId) {
      const r = this.db.query<{ total: number }, [string]>(
        'SELECT COALESCE(SUM(count), 0) AS total FROM blocks WHERE session_id = ?'
      ).get(sessionId);
      return r?.total ?? 0;
    }
    const r = this.db.query<{ total: number }, []>(
      'SELECT COALESCE(SUM(count), 0) AS total FROM blocks'
    ).get();
    return r?.total ?? 0;
  }

  getBacklogCount(sessionId?: string): number {
    if (sessionId) {
      const r = this.db.query<{ count: number }, [string]>(
        'SELECT COUNT(*) AS count FROM results WHERE session_id = ? AND synced = 0'
      ).get(sessionId);
      return r?.count ?? 0;
    }
    const r = this.db.query<{ count: number }, []>(
      'SELECT COUNT(*) AS count FROM results WHERE synced = 0'
    ).get();
    return r?.count ?? 0;
  }

  *streamExport(sessionId: string): Generator<string> {
    for (const sensor of [1, 2] as const) {
      const blockStmt = this.db.prepare<{ first_index: number; count: number; payload: Uint8Array }, [string, number]>(
        'SELECT first_index, count, payload FROM blocks WHERE session_id = ? AND sensor = ? ORDER BY first_index ASC'
      );
      for (const b of blockStmt.iterate(sessionId, sensor)) {
        const rows = unpackRows(sensor, new Uint8Array(b.payload), b.count);
        for (let i = 0; i < b.count; i++) {
          yield JSON.stringify({
            sensor,
            index: b.first_index + i,
            values: rows[i],
          }) + '\n';
        }
      }

      const lossStmt = this.db.prepare<{ from_index: number; to_index: number | null; reason: string }, [string, number]>(
        'SELECT from_index, to_index, reason FROM losses WHERE session_id = ? AND sensor = ? ORDER BY from_index ASC'
      );
      for (const l of lossStmt.iterate(sessionId, sensor)) {
        yield JSON.stringify({
          sensor,
          from_index: l.from_index,
          to_index: l.to_index,
          reason: l.reason,
        }) + '\n';
      }
    }
  }

  close(): void {
    this.db.close();
  }
}
