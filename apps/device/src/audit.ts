import { createLedger } from '@mayacardio/core';
import type { Store } from './store.js';

export interface AuditReport {
  sessionId: string;
  sensor: 1 | 2;
  gaps: Array<{ from: number; to: number }>;
  overlaps: Array<{ from: number; to: number }>;
  totalStored: number;
  totalLost: number;
  ok: boolean;
}

export function runAudit(store: Store): AuditReport[] {
  const sessions = store.getSessions();
  const reports: AuditReport[] = [];

  for (const session of sessions) {
    const { sessionId, sensor, endIndex } = session;
    const ledger = createLedger();
    const blocks = store.getBlocks(sessionId, sensor);
    const losses = store.getLosses(sessionId, sensor);

    let maxBlockEnd = 0;
    for (const b of blocks) {
      ledger.pushStored(b.firstIndex, b.firstIndex + b.count);
      const end = b.firstIndex + b.count;
      if (end > maxBlockEnd) {
        maxBlockEnd = end;
      }
    }

    let maxLossEnd = 0;
    let totalLost = 0;
    for (const l of losses) {
      if (l.to !== null) {
        ledger.pushLost(l.from, l.to);
        if (l.to > maxLossEnd) {
          maxLossEnd = l.to;
        }
        if (l.to > l.from) {
          totalLost += l.to - l.from;
        }
      }
    }

    const expectedEnd = Math.max(maxBlockEnd, maxLossEnd, endIndex ?? 0);
    const auditRes = ledger.audit(expectedEnd);
    const totalStored = ledger.storedCoverage();

    reports.push({
      sessionId,
      sensor,
      gaps: auditRes.gaps,
      overlaps: auditRes.overlaps,
      totalStored,
      totalLost,
      ok: auditRes.gaps.length === 0 && auditRes.overlaps.length === 0,
    });
  }

  return reports;
}
