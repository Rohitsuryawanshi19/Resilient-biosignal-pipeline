import * as I from './intervals.js';
import type { AuditResult } from './types.js';

export interface Ledger {
  pushStored(from: number, to: number): 'ok' | 'duplicate';
  pushLost(from: number, to: number | null): void;
  audit(expectedEnd: number): AuditResult;
  storedCoverage(): number;
}

export function createLedger(): Ledger {
  let stored: I.IntervalSet = I.EMPTY;
  let lost: I.IntervalSet = I.EMPTY;

  return {
    pushStored(from, to) {
      if (from >= to) return 'duplicate';
      const r = I.fromRanges([{ from, to }]);
      // Duplicate: already fully covered by stored
      if (I.coverage(I.subtract(r, stored)) === 0) return 'duplicate';
      stored = I.union(stored, r);
      return 'ok';
    },
    pushLost(from, to) {
      if (to === null || from >= to) return; // open-ended or empty: can't track in interval set
      lost = I.union(lost, I.fromRanges([{ from, to }]));
    },
    audit(expectedEnd) {
      const full = I.fromRanges([{ from: 0, to: expectedEnd }]);
      const all = I.union(stored, lost);
      const gaps = I.subtract(full, all);
      const overlaps = I.intersect(stored, lost);
      return {
        gaps: I.toRanges(gaps),
        overlaps: I.toRanges(overlaps),
      };
    },
    storedCoverage() {
      return I.coverage(stored);
    },
  };
}
