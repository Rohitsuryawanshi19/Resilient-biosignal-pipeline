import { round1 } from '../src/windows.js';
import type { WindowResult } from '../src/types.js';

const SPW = 400;
const CH1 = 3;
const CH2 = 2;
const PEAK_LOOKBACK = 800;
const PEAK_MIN_GAP = 100;
const PEAK_THRESHOLD_RATIO = 0.5;
const HR_SPAN = 5;

export function oracleProcess(
  s1Data: Map<number, number[]>,
  s1Losses: Set<number>, // set of lost indices for sensor1
  s2Data: Map<number, number[]>,
  s2Losses: Set<number>,
  maxWindow: number,
  mode: 'online' | 'offline' = 'online'
): WindowResult[] {
  // Find all peaks greedily from index 0
  const allIndices1 = new Set([...s1Data.keys()]);
  const maxIdx1 = Math.max(...allIndices1, ...[...s1Losses], 0);

  const peaks: number[] = [];
  let lastPeak = -Infinity;

  for (let i = PEAK_LOOKBACK; i <= maxIdx1 - 1; i++) {
    // Need i-800..i-1, i, i+1 all stored (not lost)
    if (s1Losses.has(i) || s1Losses.has(i + 1) || s1Losses.has(i - 1)) continue;
    if (!s1Data.has(i) || !s1Data.has(i + 1) || !s1Data.has(i - 1)) continue;

    // Check all 800 lookback stored
    let allLBAvail = true;
    let maxLB = -Infinity;
    for (let j = i - PEAK_LOOKBACK; j < i; j++) {
      if (s1Losses.has(j) || !s1Data.has(j)) {
        allLBAvail = false;
        break;
      }
      maxLB = Math.max(maxLB, s1Data.get(j)![1]!);
    }
    if (!allLBAvail) continue;

    const vPrev = s1Data.get(i - 1)![1]!;
    const vCurr = s1Data.get(i)![1]!;
    const vNext = s1Data.get(i + 1)![1]!;

    if (
      vCurr > vPrev &&
      vCurr > vNext &&
      vCurr > PEAK_THRESHOLD_RATIO * maxLB &&
      i >= lastPeak + PEAK_MIN_GAP
    ) {
      peaks.push(i);
      lastPeak = i;
    }
  }

  const results: WindowResult[] = [];
  for (let w = 0; w <= maxWindow; w++) {
    const wStart = w * SPW;
    const wEnd = wStart + SPW;

    let m1 = 0,
      m2 = 0;
    for (let i = wStart; i < wEnd; i++) {
      if (!s1Data.has(i)) m1++;
      if (!s2Data.has(i)) m2++;
    }

    const sum1 = [0, 0, 0];
    const min1 = [Infinity, Infinity, Infinity];
    const max1 = [-Infinity, -Infinity, -Infinity];
    let c1 = 0;
    const sum2 = [0, 0];
    const min2 = [Infinity, Infinity];
    const max2 = [-Infinity, -Infinity];
    let c2 = 0;
    let magSum = 0;

    for (let i = wStart; i < wEnd; i++) {
      const r1 = s1Data.get(i);
      if (r1) {
        c1++;
        for (let c = 0; c < CH1; c++) {
          const val = r1[c]!;
          sum1[c]! += val;
          min1[c] = Math.min(min1[c]!, val);
          max1[c] = Math.max(max1[c]!, val);
        }
      }
      const r2 = s2Data.get(i);
      if (r2) {
        c2++;
        for (let c = 0; c < CH2; c++) {
          const val = r2[c]!;
          sum2[c]! += val;
          min2[c] = Math.min(min2[c]!, val);
          max2[c] = Math.max(max2[c]!, val);
        }
        magSum += Math.sqrt(r2[0]! ** 2 + r2[1]! ** 2);
      }
    }

    let hr: number | null = null;
    if (w >= 4) {
      const hrStart = (w - HR_SPAN + 1) * SPW;
      const hrEnd = (w + 1) * SPW;
      let anyMissing = false;
      for (let i = hrStart; i < hrEnd; i++) {
        if (!s1Data.has(i) || s1Losses.has(i)) {
          anyMissing = true;
          break;
        }
      }
      if (!anyMissing) {
        const rPeaks = peaks.filter((p) => p >= hrStart && p < hrEnd);
        if (rPeaks.length >= 2) {
          const gaps = rPeaks.slice(1).map((p, idx) => (p - rPeaks[idx]!) / 400);
          hr = round1(60 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
        }
      }
    }

    results.push({
      window: w,
      missing_1: m1,
      missing_2: m2,
      complete: m1 === 0 && m2 === 0,
      mean_1: c1 > 0 ? sum1.map((s) => round1(s / c1)) : [null, null, null],
      min_1: c1 > 0 ? min1.map((m) => round1(m)) : [null, null, null],
      max_1: c1 > 0 ? max1.map((m) => round1(m)) : [null, null, null],
      mean_2: c2 > 0 ? sum2.map((s) => round1(s / c2)) : [null, null],
      min_2: c2 > 0 ? min2.map((m) => round1(m)) : [null, null],
      max_2: c2 > 0 ? max2.map((m) => round1(m)) : [null, null],
      magnitude: c2 > 0 ? round1(magSum / c2) : null,
      heart_rate: hr,
      mode,
    });
  }
  return results;
}
