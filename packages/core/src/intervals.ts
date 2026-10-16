export type Range = { from: number; to: number };
export type IntervalSet = ReadonlyArray<Range>;

export const EMPTY: IntervalSet = [];

export function fromRanges(ranges: Range[]): IntervalSet {
  const valid = ranges.filter((r) => r.from < r.to);
  if (valid.length === 0) return EMPTY;

  const sorted = [...valid].sort((a, b) => a.from - b.from || a.to - b.to);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.from <= last.to) {
      last.to = Math.max(last.to, r.to);
    } else {
      out.push({ from: r.from, to: r.to });
    }
  }
  return out;
}

export function toRanges(a: IntervalSet): Range[] {
  return a.map((r) => ({ from: r.from, to: r.to }));
}

export function union(a: IntervalSet, b: IntervalSet): IntervalSet {
  if (a.length === 0) return b.length === 0 ? EMPTY : fromRanges(toRanges(b));
  if (b.length === 0) return fromRanges(toRanges(a));
  return fromRanges([...a, ...b]);
}

export function subtract(a: IntervalSet, b: IntervalSet): IntervalSet {
  if (a.length === 0) return EMPTY;
  if (b.length === 0) return fromRanges(toRanges(a));

  const out: Range[] = [];
  for (const r of a) {
    let pieces: Range[] = [{ from: r.from, to: r.to }];
    for (const sub of b) {
      if (pieces.length === 0) break;
      const nextPieces: Range[] = [];
      for (const p of pieces) {
        if (sub.to <= p.from || sub.from >= p.to) {
          nextPieces.push(p);
        } else {
          if (p.from < sub.from) {
            nextPieces.push({ from: p.from, to: sub.from });
          }
          if (sub.to < p.to) {
            nextPieces.push({ from: sub.to, to: p.to });
          }
        }
      }
      pieces = nextPieces;
    }
    out.push(...pieces);
  }
  return fromRanges(out);
}

export function intersect(a: IntervalSet, b: IntervalSet): IntervalSet {
  if (a.length === 0 || b.length === 0) return EMPTY;

  let i = 0;
  let j = 0;
  const out: Range[] = [];

  while (i < a.length && j < b.length) {
    const rA = a[i]!;
    const rB = b[j]!;
    const start = Math.max(rA.from, rB.from);
    const end = Math.min(rA.to, rB.to);
    if (start < end) {
      out.push({ from: start, to: end });
    }
    if (rA.to < rB.to) {
      i++;
    } else if (rB.to < rA.to) {
      j++;
    } else {
      i++;
      j++;
    }
  }
  return out;
}

export function contains(a: IntervalSet, index: number): boolean {
  if (a.length === 0) return false;
  let low = 0;
  let high = a.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const r = a[mid]!;
    if (index < r.from) {
      high = mid - 1;
    } else if (index >= r.to) {
      low = mid + 1;
    } else {
      return true;
    }
  }
  return false;
}

export function complement(a: IntervalSet, from: number, to: number): IntervalSet {
  if (from >= to) return EMPTY;
  return subtract(fromRanges([{ from, to }]), a);
}

export function coverage(a: IntervalSet): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const r = a[i]!;
    sum += r.to - r.from;
  }
  return sum;
}
