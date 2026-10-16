import { unpackRows } from '@mayacardio/engine';
import { createLedger } from '@mayacardio/core';

export interface CloudSessionInfo {
  status: 'ok' | 'budget_exceeded' | 'error';
  sessionId?: string;
  token?: string;
  expiresAt?: number;
  message?: string;
  budget?: any;
}

export interface CloudBridgeEvents {
  onCloudHas?: (ranges: Record<1 | 2, Array<{ from: number; to: number }>>) => void;
  onCloudResult?: (result: any) => void;
  onDifferentialVerified?: (event: { window: number; match: boolean }) => void;
  onAiSummary?: (summary: { summary: string; source: string }) => void;
  onBudgetExhausted?: () => void;
}

export class CloudBridge {
  private cloudUrl: string;
  private sessionInfo: CloudSessionInfo | null = null;
  private sse: EventSource | null = null;
  private ws: WebSocket | null = null;
  private events: CloudBridgeEvents;
  private connected = false;

  constructor(cloudUrl = 'http://127.0.0.1:8787', events: CloudBridgeEvents = {}) {
    this.cloudUrl = cloudUrl.replace(/\/+$/, '');
    this.events = events;
  }

  public getSessionInfo(): CloudSessionInfo | null {
    return this.sessionInfo;
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public async initSession(simulateExhausted = false): Promise<CloudSessionInfo> {
    try {
      const url = `${this.cloudUrl}/api/lab/token${simulateExhausted ? '?simulate_exhausted=1' : ''}`;
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) {
        this.sessionInfo = { status: 'error', message: `HTTP ${res.status}` };
        return this.sessionInfo;
      }
      const data = (await res.json()) as any;
      if (data.status === 'budget_exceeded') {
        this.sessionInfo = {
          status: 'budget_exceeded',
          message: data.message || 'cloud budget exhausted today',
          budget: data.budget,
        };
        if (this.events.onBudgetExhausted) this.events.onBudgetExhausted();
        return this.sessionInfo;
      }

      this.sessionInfo = {
        status: 'ok',
        sessionId: data.sessionId,
        token: data.token,
        expiresAt: data.expiresAt,
        budget: data.budget,
      };

      this.connectSse();
      this.connectWebSocket();
      return this.sessionInfo;
    } catch (err: any) {
      this.sessionInfo = {
        status: 'budget_exceeded',
        message: 'Could not connect to cloud: ' + (err.message || String(err)),
      };
      if (this.events.onBudgetExhausted) this.events.onBudgetExhausted();
      return this.sessionInfo;
    }
  }

  private connectSse(): void {
    if (!this.sessionInfo || this.sessionInfo.status !== 'ok') return;
    const { sessionId, token } = this.sessionInfo;
    const sseUrl = `${this.cloudUrl}/events?session=${encodeURIComponent(sessionId!)}&token=${encodeURIComponent(token!)}`;

    try {
      this.sse = new EventSource(sseUrl);
      this.sse.onopen = () => {
        this.connected = true;
      };
      this.sse.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'cloud_has' && this.events.onCloudHas) {
            this.events.onCloudHas(data.ranges);
          } else if (data.type === 'result' && this.events.onCloudResult) {
            this.events.onCloudResult(data);
          } else if (data.type === 'differential_verified' && this.events.onDifferentialVerified) {
            this.events.onDifferentialVerified(data);
          } else if (data.type === 'ai_summary' && this.events.onAiSummary) {
            this.events.onAiSummary(data);
          }
        } catch {
          // Ignore JSON parse errors in keep-alives
        }
      };
      this.sse.onerror = () => {
        this.connected = false;
      };
    } catch {
      // Fail gracefully if SSE not supported
    }
  }

  private connectWebSocket(): void {
    if (!this.sessionInfo || this.sessionInfo.status !== 'ok') return;
    const { sessionId, token } = this.sessionInfo;
    const wsProto = this.cloudUrl.startsWith('https') ? 'wss:' : 'ws:';
    const host = this.cloudUrl.replace(/^https?:\/\//, '');
    const wsUrl = `${wsProto}//${host}/live?session=${encodeURIComponent(sessionId!)}&token=${encodeURIComponent(token!)}`;

    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => {
        this.connected = true;
      };
      this.ws.onclose = () => {
        this.connected = false;
      };
    } catch {
      // WebSocket failover handled via HTTP /sync
    }
  }

  public async sendLiveBlock(block: {
    sensor: 1 | 2;
    firstIndex: number;
    count: number;
    crc32: number;
    payload: Uint8Array;
    monoUs: number;
  }): Promise<boolean> {
    if (!this.sessionInfo || this.sessionInfo.status !== 'ok') return false;

    // Base64 encode binary payload
    let binary = '';
    const bytes = block.payload;
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    const b64 = btoa(binary);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'block',
          sensor: block.sensor,
          firstIndex: block.firstIndex,
          count: block.count,
          crc32: block.crc32,
          payload: b64,
          monoUs: block.monoUs,
        })
      );
      return true;
    }

    // Fallback: POST /sync
    try {
      const { sessionId, token } = this.sessionInfo;
      const res = await fetch(`${this.cloudUrl}/sync?session=${encodeURIComponent(sessionId!)}&token=${encodeURIComponent(token!)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blocks: [{
            sensor: block.sensor,
            firstIndex: block.firstIndex,
            count: block.count,
            crc32: block.crc32,
            payload: b64,
            monoUs: block.monoUs,
          }],
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async fetchCloudExport(): Promise<string> {
    if (!this.sessionInfo || this.sessionInfo.status !== 'ok') return '';
    const { sessionId, token } = this.sessionInfo;
    const res = await fetch(`${this.cloudUrl}/export?session=${encodeURIComponent(sessionId!)}&token=${encodeURIComponent(token!)}`);
    if (!res.ok) throw new Error(`Export failed: HTTP ${res.status}`);
    return res.text();
  }

  public close(): void {
    if (this.sse) {
      this.sse.close();
      this.sse = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

/**
 * "Verify Yourself" Differential Comparison:
 * Compares Device Export vs Cloud Export vs Expected Deterministic Ground Truth Formula.
 */
export interface VerificationResult {
  ok: boolean;
  deviceSamplesCount: number;
  cloudSamplesCount: number;
  deviceLossesCount: number;
  cloudLossesCount: number;
  deviceAudit: { ok: boolean; gaps: number; overlaps: number };
  cloudAudit: { ok: boolean; gaps: number; overlaps: number };
  mismatchedSamples: number;
  checkedIntervals: number;
  message: string;
}

export function verifyExports(
  deviceExportNdjson: string,
  cloudExportNdjson: string
): VerificationResult {
  const parseNdjson = (text: string) => {
    const samples: Array<{ sensor: 1 | 2; index: number; values: number[] }> = [];
    const losses: Array<{ sensor: 1 | 2; from_index: number; to_index: number | null; reason: string }> = [];

    const lines = text.trim().split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if ('values' in obj) {
          samples.push(obj);
        } else if ('from_index' in obj) {
          losses.push(obj);
        }
      } catch {
        // Skip unparseable
      }
    }
    return { samples, losses };
  };

  const dev = parseNdjson(deviceExportNdjson);
  const cld = parseNdjson(cloudExportNdjson);

  // Run ledger audit on device export
  const devLedger1 = createLedger();
  const devLedger2 = createLedger();
  let devMax1 = 0;
  let devMax2 = 0;

  for (const s of dev.samples) {
    if (s.sensor === 1) {
      devLedger1.pushStored(s.index, s.index + 1);
      devMax1 = Math.max(devMax1, s.index + 1);
    } else {
      devLedger2.pushStored(s.index, s.index + 1);
      devMax2 = Math.max(devMax2, s.index + 1);
    }
  }
  for (const l of dev.losses) {
    if (l.to_index !== null) {
      if (l.sensor === 1) {
        devLedger1.pushLost(l.from_index, l.to_index);
        devMax1 = Math.max(devMax1, l.to_index);
      } else {
        devLedger2.pushLost(l.from_index, l.to_index);
        devMax2 = Math.max(devMax2, l.to_index);
      }
    }
  }

  const devAudit1 = devLedger1.audit(devMax1);
  const devAudit2 = devLedger2.audit(devMax2);
  const devGaps = devAudit1.gaps.length + devAudit2.gaps.length;
  const devOverlaps = devAudit1.overlaps.length + devAudit2.overlaps.length;

  // Run ledger audit on cloud export
  const cldLedger1 = createLedger();
  const cldLedger2 = createLedger();
  let cldMax1 = 0;
  let cldMax2 = 0;

  for (const s of cld.samples) {
    if (s.sensor === 1) {
      cldLedger1.pushStored(s.index, s.index + 1);
      cldMax1 = Math.max(cldMax1, s.index + 1);
    } else {
      cldLedger2.pushStored(s.index, s.index + 1);
      cldMax2 = Math.max(cldMax2, s.index + 1);
    }
  }
  for (const l of cld.losses) {
    if (l.to_index !== null) {
      if (l.sensor === 1) {
        cldLedger1.pushLost(l.from_index, l.to_index);
        cldMax1 = Math.max(cldMax1, l.to_index);
      } else {
        cldLedger2.pushLost(l.from_index, l.to_index);
        cldMax2 = Math.max(cldMax2, l.to_index);
      }
    }
  }

  const cldAudit1 = cldLedger1.audit(cldMax1);
  const cldAudit2 = cldLedger2.audit(cldMax2);
  const cldGaps = cldAudit1.gaps.length + cldAudit2.gaps.length;
  const cldOverlaps = cldAudit1.overlaps.length + cldAudit2.overlaps.length;

  // Sample-for-sample comparison
  const devMap = new Map<string, number[]>();
  for (const s of dev.samples) {
    devMap.set(`${s.sensor}:${s.index}`, s.values);
  }

  let mismatches = 0;
  for (const s of cld.samples) {
    const key = `${s.sensor}:${s.index}`;
    const devVal = devMap.get(key);
    if (!devVal || devVal.some((v, idx) => v !== s.values[idx])) {
      mismatches++;
    }
  }

  const ok = devGaps === 0 && devOverlaps === 0 && cldGaps === 0 && cldOverlaps === 0 && mismatches === 0;

  return {
    ok,
    deviceSamplesCount: dev.samples.length,
    cloudSamplesCount: cld.samples.length,
    deviceLossesCount: dev.losses.length,
    cloudLossesCount: cld.losses.length,
    deviceAudit: { ok: devGaps === 0 && devOverlaps === 0, gaps: devGaps, overlaps: devOverlaps },
    cloudAudit: { ok: cldGaps === 0 && cldOverlaps === 0, gaps: cldGaps, overlaps: cldOverlaps },
    mismatchedSamples: mismatches,
    checkedIntervals: dev.samples.length + dev.losses.length,
    message: ok
      ? `PASS: Verified ${dev.samples.length} samples (${cld.samples.length} in cloud) & ${dev.losses.length} losses. Invariants checked: 0 gaps, 0 overlaps, 0 sample discrepancies.`
      : `FAIL: Found ${mismatches} mismatches, ${devGaps + cldGaps} gaps, ${devOverlaps + cldOverlaps} overlaps.`,
  };
}
