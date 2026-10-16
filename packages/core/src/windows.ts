import * as I from './intervals.js';
import type { WindowResult } from './types.js';

const SPW = 400; // samples per window
const CH1 = 3;  // sensor1 channels
const CH2 = 2;  // sensor2 channels
const PEAK_LOOKBACK = 800;
const PEAK_MIN_GAP = 100;
const PEAK_THRESHOLD_RATIO = 0.5;
const HR_SPAN = 5; // windows

/** Half-away-from-zero rounding to 1 decimal place, corrected for float error */
export function round1(x: number): number {
  if (x === 0) return 0;
  const res = (Math.sign(x) * Math.floor(Math.abs(x) * 10 + 0.5)) / 10;
  return res === 0 ? 0 : res;
}

export interface Processor {
  push(sensor: 1 | 2, firstIndex: number, rows: number[][]): void;
  pushLoss(sensor: 1 | 2, from: number, to: number | null): void;
  finalizable(): WindowResult[];
}

export function createProcessor(mode: 'online' | 'offline' = 'online'): Processor {
  // Sparse sample stores — evicted after window finalized
  const s1 = new Map<number, number[]>(); // index -> row
  const s2 = new Map<number, number[]>();

  // Historical s1 channel 1 values needed for peak lookback across evicted windows
  const s1Ch1History = new Map<number, number>();

  // Coverage tracking
  let s1Known: I.IntervalSet = I.EMPTY;
  let s2Known: I.IntervalSet = I.EMPTY;
  let s1Stored: I.IntervalSet = I.EMPTY;
  let s1Lost: I.IntervalSet = I.EMPTY;
  let s2Stored: I.IntervalSet = I.EMPTY;
  let s2Lost: I.IntervalSet = I.EMPTY;

  // Next window to try finalizing
  let nextW = 0;

  // Peak detection state
  // Ring buffer: store last PEAK_LOOKBACK+SPW+2 values of sensor1 ch1
  const RING_SIZE = PEAK_LOOKBACK + SPW + 2;
  const ringVal = new Float64Array(RING_SIZE);
  const ringIdx = new Int32Array(RING_SIZE).fill(-1);
  let ringHead = 0;
  let ringCount = 0;

  function addToRing(idx: number, val: number): void {
    ringVal[ringHead] = val;
    ringIdx[ringHead] = idx;
    ringHead = (ringHead + 1) % RING_SIZE;
    if (ringCount < RING_SIZE) ringCount++;
  }

  function getS1Ch1(index: number): number | undefined {
    const row = s1.get(index);
    if (row && row.length > 1) return row[1];
    const hist = s1Ch1History.get(index);
    if (hist !== undefined) return hist;
    for (let p = 0; p < ringCount; p++) {
      const i = (ringHead - ringCount + p + RING_SIZE * 2) % RING_SIZE;
      if (ringIdx[i] === index) return ringVal[i];
    }
    return undefined;
  }

  let peakDetectedUpTo = -1;
  let lastAcceptedPeak = -Infinity;
  let peaks: number[] = [];

  function isCovered(set: I.IntervalSet, from: number, to: number): boolean {
    if (from >= to) return true;
    return I.coverage(I.intersect(set, I.fromRanges([{ from, to }]))) === to - from;
  }

  function hasLossIn(from: number, to: number): boolean {
    if (from >= to) return false;
    return I.coverage(I.intersect(s1Lost, I.fromRanges([{ from, to }]))) > 0;
  }

  function detectPeaks(): void {
    let i = Math.max(peakDetectedUpTo + 1, PEAK_LOOKBACK);
    while (true) {
      if (!isCovered(s1Known, i - PEAK_LOOKBACK, i + 2)) {
        break;
      }

      const lookbackOk = isCovered(s1Stored, i - PEAK_LOOKBACK, i) && !hasLossIn(i - PEAK_LOOKBACK, i);
      const currOk = I.contains(s1Stored, i) && !I.contains(s1Lost, i);
      const nextOk = I.contains(s1Stored, i + 1) && !I.contains(s1Lost, i + 1);

      if (!lookbackOk || !currOk || !nextOk) {
        peakDetectedUpTo = i;
        i++;
        continue;
      }

      if (i < lastAcceptedPeak + PEAK_MIN_GAP) {
        peakDetectedUpTo = i;
        i++;
        continue;
      }

      const curr = getS1Ch1(i);
      const prev = getS1Ch1(i - 1);
      const next = getS1Ch1(i + 1);

      if (curr === undefined || prev === undefined || next === undefined) {
        peakDetectedUpTo = i;
        i++;
        continue;
      }

      if (curr <= prev || curr <= next) {
        peakDetectedUpTo = i;
        i++;
        continue;
      }

      let maxLB = -Infinity;
      for (let j = i - PEAK_LOOKBACK; j < i; j++) {
        const v = getS1Ch1(j);
        if (v !== undefined && v > maxLB) {
          maxLB = v;
        }
      }

      if (curr > PEAK_THRESHOLD_RATIO * maxLB) {
        peaks.push(i);
        lastAcceptedPeak = i;
      }

      peakDetectedUpTo = i;
      i++;
    }
  }

  function computeWindow(w: number): WindowResult {
    const wStart = w * SPW;
    const wEnd = wStart + SPW;

    let missing1 = 0;
    let missing2 = 0;
    for (let i = wStart; i < wEnd; i++) {
      if (!s1.has(i)) missing1++;
      if (!s2.has(i)) missing2++;
    }

    const sum1 = [0, 0, 0];
    const min1 = [Infinity, Infinity, Infinity];
    const max1 = [-Infinity, -Infinity, -Infinity];
    let count1 = 0;

    const sum2 = [0, 0];
    const min2 = [Infinity, Infinity];
    const max2 = [-Infinity, -Infinity];
    let count2 = 0;
    let magSum = 0;

    for (let i = wStart; i < wEnd; i++) {
      const r1 = s1.get(i);
      if (r1) {
        count1++;
        for (let c = 0; c < CH1; c++) {
          const val = r1[c]!;
          sum1[c]! += val;
          min1[c] = Math.min(min1[c]!, val);
          max1[c] = Math.max(max1[c]!, val);
        }
      }

      const r2 = s2.get(i);
      if (r2) {
        count2++;
        for (let c = 0; c < CH2; c++) {
          const val = r2[c]!;
          sum2[c]! += val;
          min2[c] = Math.min(min2[c]!, val);
          max2[c] = Math.max(max2[c]!, val);
        }
        magSum += Math.sqrt(r2[0]! ** 2 + r2[1]! ** 2);
      }
    }

    const mean1 = count1 > 0 ? sum1.map((s) => round1(s / count1)) : [null, null, null];
    const _min1 = count1 > 0 ? min1.map((m) => round1(m)) : [null, null, null];
    const _max1 = count1 > 0 ? max1.map((m) => round1(m)) : [null, null, null];

    const mean2 = count2 > 0 ? sum2.map((s) => round1(s / count2)) : [null, null];
    const _min2 = count2 > 0 ? min2.map((m) => round1(m)) : [null, null];
    const _max2 = count2 > 0 ? max2.map((m) => round1(m)) : [null, null];

    const magnitude = count2 > 0 ? round1(magSum / count2) : null;

    let heart_rate: number | null = null;
    if (w >= 4) {
      const hrStart = (w - HR_SPAN + 1) * SPW;
      const hrEnd = (w + 1) * SPW;
      const noLoss = !hasLossIn(hrStart, hrEnd);
      const allStored = isCovered(s1Stored, hrStart, hrEnd);

      if (noLoss && allStored) {
        const rangePeaks = peaks.filter((p) => p >= hrStart && p < hrEnd);
        if (rangePeaks.length >= 2) {
          const gaps: number[] = [];
          for (let p = 1; p < rangePeaks.length; p++) {
            gaps.push((rangePeaks[p]! - rangePeaks[p - 1]!) / 400);
          }
          const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
          heart_rate = round1(60 / meanGap);
        }
      }
    }

    return {
      window: w,
      missing_1: missing1,
      missing_2: missing2,
      complete: missing1 === 0 && missing2 === 0,
      mean_1: mean1,
      min_1: _min1,
      max_1: _max1,
      mean_2: mean2,
      min_2: _min2,
      max_2: _max2,
      magnitude,
      heart_rate,
      mode,
    };
  }

  return {
    push(sensor, firstIndex, rows) {
      if (rows.length === 0) return;
      const end = firstIndex + rows.length;
      const newRange = I.fromRanges([{ from: firstIndex, to: end }]);

      if (sensor === 1) {
        s1Known = I.union(s1Known, newRange);
        s1Stored = I.union(s1Stored, newRange);
        for (let i = 0; i < rows.length; i++) {
          const idx = firstIndex + i;
          if (idx < nextW * SPW) continue;
          if (!s1.has(idx)) {
            const row = rows[i]!;
            s1.set(idx, row);
            const ch1Val = row[1] ?? 0;
            s1Ch1History.set(idx, ch1Val);
            addToRing(idx, ch1Val);
          }
        }
        detectPeaks();
      } else {
        s2Known = I.union(s2Known, newRange);
        s2Stored = I.union(s2Stored, newRange);
        for (let i = 0; i < rows.length; i++) {
          const idx = firstIndex + i;
          if (idx < nextW * SPW) continue;
          if (!s2.has(idx)) {
            s2.set(idx, rows[i]!);
          }
        }
      }
    },

    pushLoss(sensor, from, to) {
      const effectiveTo = to !== null ? to : from + 1_000_000;
      if (from >= effectiveTo) return;
      const r = I.fromRanges([{ from, to: effectiveTo }]);

      if (sensor === 1) {
        s1Known = I.union(s1Known, r);
        s1Lost = I.union(s1Lost, r);
        detectPeaks();
      } else {
        s2Known = I.union(s2Known, r);
        s2Lost = I.union(s2Lost, r);
      }
    },

    finalizable() {
      const results: WindowResult[] = [];
      while (true) {
        const w = nextW;
        const wStart = w * SPW;
        const wEnd = (w + 1) * SPW;
        const lookahead = wEnd;

        if (!isCovered(s1Known, wStart, wEnd)) break;
        if (!isCovered(s2Known, wStart, wEnd)) break;
        if (!isCovered(s1Known, lookahead, lookahead + 1)) break;

        detectPeaks();

        results.push(computeWindow(w));

        for (let i = wStart; i < wEnd; i++) {
          s1.delete(i);
          s2.delete(i);
        }

        nextW++;

        const minPeakNeeded = Math.max(0, (nextW - HR_SPAN + 1) * SPW);
        peaks = peaks.filter((p) => p >= minPeakNeeded);

        const minHistoryNeeded = nextW * SPW - PEAK_LOOKBACK;
        for (const idx of s1Ch1History.keys()) {
          if (idx < minHistoryNeeded) {
            s1Ch1History.delete(idx);
          }
        }
      }
      return results;
    },
  };
}
