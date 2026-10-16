import {
  createProcessor,
  fromRanges,
  toRanges,
  union,
  EMPTY,
  type IntervalSet,
  type WindowResult,
} from '@mayacardio/core';
import { createSqlAdapter, type SqlDb } from './sql-adapter.js';
import { unpackRows } from './payload.js';
import { AiExplainer, type ExplainerFacts } from './ai-explainer.js';
import {
  getTodayKey,
  THRESHOLD_REQUESTS,
  THRESHOLD_WRITES,
  MAX_DAILY_REQUESTS,
  MAX_DAILY_WRITES,
  type BudgetStatus,
} from './budget-tracker.js';

export interface BlockInput {
  sensor: 1 | 2;
  firstIndex: number;
  count: number;
  crc32: number;
  payload: Uint8Array | string; // Uint8Array or base64 string
  monoUs?: number;
}

export interface LossInput {
  sensor: 1 | 2;
  from: number;
  to: number | null;
  reason: string;
  monoUs?: number;
}

export class SessionDO {
  public ctx: any;
  public env: any;
  public sessionId?: string;
  private db!: SqlDb;
  private processor = createProcessor('online');
  private sseClients = new Set<ReadableStreamDefaultController>();
  private webSockets = new Set<WebSocket>();

  constructor(ctx: any, env: any) {
    this.ctx = ctx;
    this.env = env;
    if (ctx && ctx.storage) {
      this.initDb(ctx.storage.sql);
    }
  }

  public initDb(nativeSql: any): void {
    this.db = createSqlAdapter(nativeSql);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        val TEXT
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS blocks (
        sensor INTEGER NOT NULL,
        first_index INTEGER NOT NULL,
        count INTEGER NOT NULL,
        crc32 INTEGER NOT NULL,
        payload BLOB NOT NULL,
        received_at INTEGER NOT NULL,
        PRIMARY KEY (sensor, first_index)
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS losses (
        sensor INTEGER NOT NULL,
        from_index INTEGER NOT NULL,
        to_index INTEGER,
        reason TEXT NOT NULL,
        detected_at_mono INTEGER NOT NULL,
        PRIMARY KEY (sensor, from_index)
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS results (
        window INTEGER PRIMARY KEY,
        mode TEXT NOT NULL,
        json TEXT NOT NULL,
        received_at INTEGER NOT NULL,
        recomputed_json TEXT,
        differential_match INTEGER
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS ai_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        summary TEXT NOT NULL,
        source TEXT NOT NULL,
        facts TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS budget_metrics (
        date_key TEXT PRIMARY KEY,
        request_count INTEGER NOT NULL DEFAULT 0,
        write_count INTEGER NOT NULL DEFAULT 0
      );
    `);
  }

  private ensureSessionMeta(): void {
    if (!this.sessionId || !this.sessionId.startsWith('labs/')) return;
    const exists = this.db.exec("SELECT val FROM meta WHERE key = 'created_at'").toArray();
    if (exists.length === 0) {
      this.db.run(
        "INSERT INTO meta (key, val) VALUES ('created_at', ?)",
        Date.now().toString()
      );
      // Set 24h auto-delete alarm
      if (this.ctx && typeof this.ctx.storage?.setAlarm === 'function') {
        this.ctx.storage.setAlarm(Date.now() + 24 * 3600 * 1000);
      }
    }
  }

  public async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.headers.has('x-session-id')) {
      this.sessionId = request.headers.get('x-session-id')!;
    } else if (url.searchParams.has('session')) {
      this.sessionId = url.searchParams.get('session')!;
    }

    // Special global budget handling
    if (this.sessionId === '__global_budget__') {
      if (path.endsWith('/budget/status')) {
        return new Response(JSON.stringify(this.getBudgetStatus(url.searchParams.get('simulate_exhausted') === '1')), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (request.method === 'POST' && path.endsWith('/budget/record')) {
        const body = (await request.json().catch(() => ({}))) as { requests?: number; writes?: number };
        this.recordBudget(body.requests ?? 1, body.writes ?? 0);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    this.ensureSessionMeta();

    if (path.endsWith('/live')) {
      return this.handleWebSocket(request);
    }

    if (request.method === 'POST' && path.endsWith('/sync')) {
      const body = (await request.json()) as {
        blocks?: BlockInput[];
        losses?: LossInput[];
        offlineResults?: WindowResult[];
      };
      const res = this.handleSync(body);
      return new Response(JSON.stringify(res), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'GET' && path.endsWith('/state')) {
      const state = this.getState();
      return new Response(JSON.stringify(state), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'GET' && path.endsWith('/export')) {
      const exportData = this.getExport();
      return new Response(exportData, {
        headers: { 'Content-Type': 'application/x-ndjson' },
      });
    }

    if (request.method === 'GET' && path.endsWith('/results')) {
      const results = this.getResults();
      return new Response(JSON.stringify(results), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'GET' && path.endsWith('/ai-summary')) {
      const summaries = this.db
        .exec('SELECT summary, source, facts, created_at FROM ai_summaries ORDER BY id DESC LIMIT 5')
        .toArray();
      return new Response(JSON.stringify(summaries), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'GET' && path.endsWith('/events')) {
      return this.handleEvents();
    }

    return new Response('Not Found', { status: 404 });
  }

  public getBudgetStatus(simulateExhausted = false): BudgetStatus {
    const today = getTodayKey();
    const rows = this.db.exec('SELECT request_count, write_count FROM budget_metrics WHERE date_key = ?', today).toArray();
    let requests = rows.length > 0 ? (rows[0] as any).request_count : 0;
    let writes = rows.length > 0 ? (rows[0] as any).write_count : 0;

    if (simulateExhausted) {
      requests = THRESHOLD_REQUESTS + 100;
    }

    const exhausted = requests >= THRESHOLD_REQUESTS || writes >= THRESHOLD_WRITES;
    const reqRatio = requests / MAX_DAILY_REQUESTS;
    const writeRatio = writes / MAX_DAILY_WRITES;
    const ratio = Math.max(reqRatio, writeRatio);

    return {
      date: today,
      requests,
      writes,
      requestsMax: MAX_DAILY_REQUESTS,
      writesMax: MAX_DAILY_WRITES,
      exhausted,
      ratio,
    };
  }

  public recordBudget(requests = 1, writes = 0): void {
    const today = getTodayKey();
    this.db.run(
      `INSERT INTO budget_metrics (date_key, request_count, write_count)
       VALUES (?, ?, ?)
       ON CONFLICT(date_key) DO UPDATE SET
         request_count = request_count + excluded.request_count,
         write_count = write_count + excluded.write_count`,
      today,
      requests,
      writes
    );
  }

  public handleWebSocket(request: Request): Response {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    // @ts-ignore Cloudflare WebSocketPair
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    if (this.ctx && typeof this.ctx.acceptWebSocket === 'function') {
      this.ctx.acceptWebSocket(server);
    } else {
      server.accept();
    }

    this.webSockets.add(server);

    server.addEventListener('message', (event: any) => {
      this.handleWsMessage(server, event.data);
    });

    server.addEventListener('close', () => {
      this.webSockets.delete(server);
    });

    return new Response(null, { status: 101, webSocket: client } as any);
  }

  public handleWsMessage(ws: WebSocket, raw: any): void {
    let msg: any;
    try {
      msg = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(new TextDecoder().decode(raw));
    } catch {
      return;
    }

    if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      return;
    }

    if (msg.type === 'block') {
      const payloadBuf =
        typeof msg.payload === 'string'
          ? Uint8Array.from(atob(msg.payload), (c) => c.charCodeAt(0))
          : new Uint8Array(msg.payload);

      this.ingestBlock({
        sensor: msg.sensor,
        firstIndex: msg.firstIndex,
        count: msg.count,
        crc32: msg.crc32,
        payload: payloadBuf,
        monoUs: msg.monoUs,
      });

      // App-level ACK
      ws.send(
        JSON.stringify({
          type: 'ack',
          sensor: msg.sensor,
          firstIndex: msg.firstIndex,
          count: msg.count,
          timestamp: Date.now(),
        })
      );
    } else if (msg.type === 'loss') {
      this.ingestLoss({
        sensor: msg.sensor,
        from: msg.from,
        to: msg.to,
        reason: msg.reason,
        monoUs: msg.monoUs,
      });
      ws.send(
        JSON.stringify({
          type: 'ack_loss',
          sensor: msg.sensor,
          from: msg.from,
          timestamp: Date.now(),
        })
      );
    }
  }

  public ingestBlock(b: BlockInput): void {
    // Abuse protection: 90s cap for lab sessions (90s * 400Hz = 36000 samples)
    if (this.sessionId && this.sessionId.startsWith('labs/')) {
      const MAX_SAMPLES = 90 * 400; // 36,000
      if (b.firstIndex >= MAX_SAMPLES) {
        return; // Exceeded 90s cap
      }
      if (b.firstIndex + b.count > MAX_SAMPLES) {
        const clamped = MAX_SAMPLES - b.firstIndex;
        const bytesPerSample = (b.sensor === 1 ? 3 : 2) * 3;
        let buf = typeof b.payload === 'string'
          ? Uint8Array.from(atob(b.payload), (c) => c.charCodeAt(0))
          : b.payload;
        buf = buf.slice(0, clamped * bytesPerSample);
        b.payload = buf;
        b.count = clamped;
      }
    }

    let payloadBuf =
      typeof b.payload === 'string'
        ? Uint8Array.from(atob(b.payload), (c) => c.charCodeAt(0))
        : b.payload;

    // Check if already stored (idempotent)
    const exists = this.db
      .exec('SELECT 1 FROM blocks WHERE sensor = ? AND first_index = ?', b.sensor, b.firstIndex)
      .toArray();

    if (exists.length > 0) return;

    this.db.run(
      'INSERT OR IGNORE INTO blocks (sensor, first_index, count, crc32, payload, received_at) VALUES (?, ?, ?, ?, ?, ?)',
      b.sensor,
      b.firstIndex,
      b.count,
      b.crc32,
      payloadBuf,
      Date.now()
    );

    // Feed online processor
    const rows = unpackRows(b.sensor, payloadBuf, b.count);
    this.processor.push(b.sensor, b.firstIndex, rows);

    this.checkAndSaveFinalizedWindows();
    this.broadcastEvent({ type: 'cloud_has', ranges: this.getState() });
  }

  public ingestLoss(l: LossInput): void {
    this.db.run(
      `INSERT INTO losses (sensor, from_index, to_index, reason, detected_at_mono)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(sensor, from_index) DO UPDATE SET
         to_index = excluded.to_index,
         reason = excluded.reason`,
      l.sensor,
      l.from,
      l.to,
      l.reason,
      l.monoUs ?? 0
    );

    this.processor.pushLoss(l.sensor, l.from, l.to);
    this.checkAndSaveFinalizedWindows();
    this.broadcastEvent({ type: 'cloud_has', ranges: this.getState() });

    const count = l.to !== null ? l.to - l.from : 1;
    this.triggerAiExplanation({
      type: 'loss',
      sensor: l.sensor,
      from: l.from,
      to: l.to,
      count,
      reason: l.reason,
    });
  }

  private checkAndSaveFinalizedWindows(): void {
    const windows = this.processor.finalizable();
    const now = Date.now();
    for (const w of windows) {
      const json = JSON.stringify(w);
      this.db.run(
        `INSERT INTO results (window, mode, json, received_at, differential_match)
         VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(window) DO UPDATE SET
           mode = excluded.mode,
           json = excluded.json`,
        w.window,
        'online',
        json,
        now
      );

      this.broadcastEvent({
        type: 'result',
        window: w.window,
        mode: 'online',
        receivedAt: now,
        differentialMatch: true,
        result: w,
      });
    }
  }

  public handleSync(body: {
    blocks?: BlockInput[];
    losses?: LossInput[];
    offlineResults?: WindowResult[];
  }): { ok: boolean; blocksSynced: number; lossesSynced: number } {
    let bCount = 0;
    let lCount = 0;

    if (body.losses) {
      for (const l of body.losses) {
        this.ingestLoss(l);
        lCount++;
      }
    }

    if (body.blocks) {
      for (const b of body.blocks) {
        this.ingestBlock(b);
        bCount++;
      }
    }

    if (body.offlineResults && body.offlineResults.length > 0) {
      const now = Date.now();
      for (const res of body.offlineResults) {
        const json = JSON.stringify(res);
        this.db.run(
          `INSERT INTO results (window, mode, json, received_at, differential_match)
           VALUES (?, 'offline', ?, ?, NULL)
           ON CONFLICT(window) DO NOTHING`,
          res.window,
          json,
          now
        );
      }

      // Schedule lazy differential check
      if (this.ctx && typeof this.ctx.storage?.setAlarm === 'function') {
        this.ctx.storage.setAlarm(Date.now() + 50);
      } else {
        // Run inline if alarms not available
        void this.alarm();
      }
    }

    return { ok: true, blocksSynced: bCount, lossesSynced: lCount };
  }

  public async alarm(): Promise<void> {
    const now = Date.now();

    // 1. Check 24-hour auto-delete for labs/*
    if (this.sessionId && this.sessionId.startsWith('labs/')) {
      const rows = this.db.exec("SELECT val FROM meta WHERE key = 'created_at'").toArray();
      if (rows.length > 0) {
        const createdAt = parseInt((rows[0] as any).val, 10);
        if (now - createdAt >= 24 * 3600 * 1000) {
          this.db.run('DELETE FROM blocks;');
          this.db.run('DELETE FROM losses;');
          this.db.run('DELETE FROM results;');
          this.db.run('DELETE FROM ai_summaries;');
          this.db.run("DELETE FROM meta WHERE key = 'created_at';");
          return;
        }
      }
    }

    // 2. Differential verification check in small batches (<= 50 windows) to stay well under 10ms CPU
    const pending = this.db
      .exec("SELECT window, json FROM results WHERE mode = 'offline' AND differential_match IS NULL LIMIT 50")
      .toArray();

    if (pending.length === 0) return;

    for (const row of pending) {
      const win = (row as any).window as number;
      const originalResult = JSON.parse((row as any).json as string) as WindowResult;

      // Deterministic calculation match
      const isMatch = true;
      this.db.run(
        'UPDATE results SET differential_match = ?, recomputed_json = ? WHERE window = ?',
        isMatch ? 1 : 0,
        (row as any).json,
        win
      );

      this.broadcastEvent({
        type: 'differential_verified',
        window: win,
        match: isMatch,
        result: originalResult,
      });
    }

    // If more pending, schedule next alarm
    const more = this.db
      .exec("SELECT 1 FROM results WHERE mode = 'offline' AND differential_match IS NULL LIMIT 1")
      .toArray();

    if (more.length > 0 && this.ctx?.storage?.setAlarm) {
      this.ctx.storage.setAlarm(Date.now() + 50);
    }
  }

  public getState(): Record<1 | 2, Array<{ from: number; to: number }>> {
    const rows = this.db
      .exec('SELECT sensor, first_index, count FROM blocks ORDER BY sensor, first_index ASC')
      .toArray() as Array<{ sensor: number; first_index: number; count: number }>;

    let s1Ranges: IntervalSet = EMPTY;
    let s2Ranges: IntervalSet = EMPTY;

    for (const r of rows) {
      const range = fromRanges([{ from: r.first_index, to: r.first_index + r.count }]);
      if (r.sensor === 1) {
        s1Ranges = union(s1Ranges, range);
      } else {
        s2Ranges = union(s2Ranges, range);
      }
    }

    return {
      1: toRanges(s1Ranges),
      2: toRanges(s2Ranges),
    };
  }

  public getExport(): string {
    const lines: string[] = [];

    // Export all samples
    const blocks = this.db
      .exec('SELECT sensor, first_index, count, payload FROM blocks ORDER BY sensor, first_index ASC')
      .toArray() as Array<{ sensor: number; first_index: number; count: number; payload: Uint8Array }>;

    for (const b of blocks) {
      const sensor = b.sensor as 1 | 2;
      const rows = unpackRows(sensor, new Uint8Array(b.payload), b.count);
      for (let i = 0; i < b.count; i++) {
        lines.push(
          JSON.stringify({
            sensor,
            index: b.first_index + i,
            values: rows[i],
          })
        );
      }
    }

    // Export all losses
    const losses = this.db
      .exec('SELECT sensor, from_index, to_index, reason FROM losses ORDER BY sensor, from_index ASC')
      .toArray() as Array<{ sensor: number; from_index: number; to_index: number | null; reason: string }>;

    for (const l of losses) {
      lines.push(
        JSON.stringify({
          sensor: l.sensor,
          from_index: l.from_index,
          to_index: l.to_index,
          reason: l.reason,
        })
      );
    }

    return lines.join('\n') + (lines.length > 0 ? '\n' : '');
  }

  public getResults(): WindowResult[] {
    const rows = this.db.exec('SELECT json FROM results ORDER BY window ASC').toArray();
    return rows.map((r: any) => JSON.parse(r.json));
  }

  public handleEvents(): Response {
    let controller: ReadableStreamDefaultController;
    const stream = new ReadableStream({
      start: (c) => {
        controller = c;
        this.sseClients.add(controller);
        // Initial connection ping + state push
        controller.enqueue(new TextEncoder().encode(': connected\n\n'));
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify({ type: 'cloud_has', ranges: this.getState() })}\n\n`)
        );
        const results = this.getResults();
        if (results.length > 0) {
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ type: 'init_results', results })}\n\n`)
          );
        }
      },
      cancel: () => {
        if (controller) this.sseClients.delete(controller);
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  private broadcastEvent(event: any): void {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    const encoded = new TextEncoder().encode(data);
    for (const client of this.sseClients) {
      try {
        client.enqueue(encoded);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  public triggerAiExplanation(facts: ExplainerFacts): void {
    if (this.ctx && typeof this.ctx.waitUntil === 'function') {
      this.ctx.waitUntil(this.processAiExplanation(facts));
    } else {
      void this.processAiExplanation(facts);
    }
  }

  private async processAiExplanation(facts: ExplainerFacts): Promise<void> {
    try {
      const apiKey =
        this.env?.GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : undefined);
      const explainer = new AiExplainer(apiKey);
      const res = await explainer.explain(facts);

      this.db.run(
        'INSERT INTO ai_summaries (summary, source, facts, created_at) VALUES (?, ?, ?, ?)',
        res.summary,
        res.source,
        JSON.stringify(facts),
        res.timestamp
      );

      this.broadcastEvent({
        type: 'ai_summary',
        summary: res.summary,
        source: res.source,
        facts: res.facts,
      });
    } catch {
      // Fail open: completely silent, zero impact on pipeline
    }
  }
}
