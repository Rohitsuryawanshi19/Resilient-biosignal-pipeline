import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import { createProcessor, type Processor } from '../src/windows.js';
import { oracleProcess } from './oracle.js';
import { rampData, ecgData, mapsToSets } from './generators.js';
import type { WindowResult } from '../src/types.js';

function runStreamingComparison(
  s1Data: Map<number, number[]>,
  s1Losses: Array<{ from: number; to: number }>,
  s2Data: Map<number, number[]>,
  s2Losses: Array<{ from: number; to: number }>,
  totalSamples: number,
  chunkSize1: number | number[],
  chunkSize2: number | number[]
): { streamingResults: WindowResult[]; oracleResults: WindowResult[] } {
  const processor = createProcessor('online');
  const streamingResults: WindowResult[] = [];

  // Push losses first
  for (const loss of s1Losses) {
    processor.pushLoss(1, loss.from, loss.to);
    streamingResults.push(...processor.finalizable());
  }
  for (const loss of s2Losses) {
    processor.pushLoss(2, loss.from, loss.to);
    streamingResults.push(...processor.finalizable());
  }

  let cur1 = 0;
  let cur2 = 0;
  let cIdx1 = 0;
  let cIdx2 = 0;

  while (cur1 < totalSamples || cur2 < totalSamples) {
    if (cur1 < totalSamples) {
      const sz1 = Array.isArray(chunkSize1)
        ? chunkSize1[cIdx1 % chunkSize1.length]!
        : chunkSize1;
      cIdx1++;
      const end1 = Math.min(cur1 + sz1, totalSamples);
      const rows1: number[][] = [];
      let startIdx = cur1;
      for (let i = cur1; i < end1; i++) {
        const row = s1Data.get(i);
        if (row) {
          rows1.push(row);
        } else {
          if (rows1.length > 0) {
            processor.push(1, startIdx, rows1);
            streamingResults.push(...processor.finalizable());
            rows1.length = 0;
          }
          startIdx = i + 1;
        }
      }
      if (rows1.length > 0) {
        processor.push(1, startIdx, rows1);
        streamingResults.push(...processor.finalizable());
      }
      cur1 = end1;
    }

    if (cur2 < totalSamples) {
      const sz2 = Array.isArray(chunkSize2)
        ? chunkSize2[cIdx2 % chunkSize2.length]!
        : chunkSize2;
      cIdx2++;
      const end2 = Math.min(cur2 + sz2, totalSamples);
      const rows2: number[][] = [];
      let startIdx = cur2;
      for (let i = cur2; i < end2; i++) {
        const row = s2Data.get(i);
        if (row) {
          rows2.push(row);
        } else {
          if (rows2.length > 0) {
            processor.push(2, startIdx, rows2);
            streamingResults.push(...processor.finalizable());
            rows2.length = 0;
          }
          startIdx = i + 1;
        }
      }
      if (rows2.length > 0) {
        processor.push(2, startIdx, rows2);
        streamingResults.push(...processor.finalizable());
      }
      cur2 = end2;
    }
  }

  streamingResults.push(...processor.finalizable());

  const s1LossSet = mapsToSets(s1Losses);
  const s2LossSet = mapsToSets(s2Losses);
  const maxW = streamingResults.length - 1;
  const oracleResults =
    maxW >= 0
      ? oracleProcess(s1Data, s1LossSet, s2Data, s2LossSet, maxW, 'online')
      : [];

  return { streamingResults, oracleResults };
}

describe('windows streaming processor', () => {
  test('1. streaming==oracle on ramp (1-sample chunks)', () => {
    const totalSamples = 2401; // 6 windows + lookahead
    const { s1, s2 } = rampData(totalSamples);
    const { streamingResults, oracleResults } = runStreamingComparison(
      s1,
      [],
      s2,
      [],
      totalSamples,
      1,
      1
    );

    expect(streamingResults.length).toBeGreaterThan(0);
    expect(streamingResults).toEqual(oracleResults);
  });

  test('2. streaming==oracle on ramp (window-size chunks)', () => {
    const totalSamples = 2401;
    const { s1, s2 } = rampData(totalSamples);
    const { streamingResults, oracleResults } = runStreamingComparison(
      s1,
      [],
      s2,
      [],
      totalSamples,
      400,
      400
    );

    expect(streamingResults.length).toBeGreaterThan(0);
    expect(streamingResults).toEqual(oracleResults);
  });

  test('3. streaming==oracle on ECG', () => {
    const totalSamples = 12001; // 30 windows + lookahead
    const { s1, s2 } = ecgData(totalSamples);
    const { streamingResults, oracleResults } = runStreamingComparison(
      s1,
      [],
      s2,
      [],
      totalSamples,
      400,
      400
    );

    expect(streamingResults.length).toBe(30);
    expect(streamingResults).toEqual(oracleResults);
  });

  test('4. Property: random chunk boundaries => same as oracle', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 500 }), { minLength: 5, maxLength: 20 }),
        fc.array(fc.integer({ min: 1, max: 500 }), { minLength: 5, maxLength: 20 }),
        (chunks1, chunks2) => {
          const totalSamples = 2401;
          const { s1, s2 } = rampData(totalSamples);
          const { streamingResults, oracleResults } = runStreamingComparison(
            s1,
            [],
            s2,
            [],
            totalSamples,
            chunks1,
            chunks2
          );

          expect(streamingResults).toEqual(oracleResults);
        }
      ),
      { numRuns: 10 }
    );
  });

  test('5. Property: random gaps => same as oracle', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            from: fc.integer({ min: 0, max: 2000 }),
            len: fc.integer({ min: 1, max: 50 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (rawGaps) => {
          const totalSamples = 2401;
          const { s1, s2 } = rampData(totalSamples);
          const s1Losses = rawGaps.map((g) => ({
            from: g.from,
            to: Math.min(totalSamples, g.from + g.len),
          }));

          // Remove lost samples from s1Data to match oracle input
          for (const loss of s1Losses) {
            for (let i = loss.from; i < loss.to; i++) {
              s1.delete(i);
            }
          }

          const { streamingResults, oracleResults } = runStreamingComparison(
            s1,
            s1Losses,
            s2,
            [],
            totalSamples,
            200,
            200
          );

          expect(streamingResults).toEqual(oracleResults);
        }
      ),
      { numRuns: 10 }
    );
  });

  test('6. Property: duplicate pushes => idempotent', () => {
    const totalSamples = 1601; // 4 windows + lookahead
    const { s1, s2 } = rampData(totalSamples);
    const processor = createProcessor('online');

    const s1Rows: number[][] = [];
    const s2Rows: number[][] = [];
    for (let i = 0; i < totalSamples; i++) {
      s1Rows.push(s1.get(i)!);
      s2Rows.push(s2.get(i)!);
    }

    // Push once
    processor.push(1, 0, s1Rows);
    processor.push(2, 0, s2Rows);
    // Push exact duplicate
    processor.push(1, 0, s1Rows);
    processor.push(2, 0, s2Rows);

    const streamingResults = processor.finalizable();
    const oracleResults = oracleProcess(
      s1,
      new Set(),
      s2,
      new Set(),
      streamingResults.length - 1,
      'online'
    );

    expect(streamingResults).toEqual(oracleResults);
  });

  test('7. Edge: w<4 => hr null', () => {
    const totalSamples = 2401;
    const { s1, s2 } = ecgData(totalSamples);
    const { streamingResults } = runStreamingComparison(
      s1,
      [],
      s2,
      [],
      totalSamples,
      400,
      400
    );

    for (let w = 0; w < 4; w++) {
      expect(streamingResults[w]?.heart_rate).toBeNull();
    }
  });

  test('8. Edge: gap in HR range => hr null', () => {
    const totalSamples = 2401; // 6 windows
    const { s1, s2 } = ecgData(totalSamples);
    // Lose sample 100 in sensor 1
    const s1Losses = [{ from: 100, to: 101 }];
    s1.delete(100);

    const { streamingResults, oracleResults } = runStreamingComparison(
      s1,
      s1Losses,
      s2,
      [],
      totalSamples,
      400,
      400
    );

    expect(streamingResults).toEqual(oracleResults);
    // Window 4 covers [0, 2000), which contains sample 100
    expect(streamingResults[4]?.heart_rate).toBeNull();
  });

  test('9. Edge: all-missing window => nulls', () => {
    const processor = createProcessor('online');
    // Window 0 is entirely lost
    processor.pushLoss(1, 0, 400);
    processor.pushLoss(2, 0, 400);
    // Lookahead for sensor 1
    processor.pushLoss(1, 400, 401);

    const results = processor.finalizable();
    expect(results.length).toBe(1);
    const w0 = results[0]!;

    expect(w0.window).toBe(0);
    expect(w0.missing_1).toBe(400);
    expect(w0.missing_2).toBe(400);
    expect(w0.complete).toBe(false);
    expect(w0.mean_1).toEqual([null, null, null]);
    expect(w0.min_1).toEqual([null, null, null]);
    expect(w0.max_1).toEqual([null, null, null]);
    expect(w0.mean_2).toEqual([null, null]);
    expect(w0.min_2).toEqual([null, null]);
    expect(w0.max_2).toEqual([null, null]);
    expect(w0.magnitude).toBeNull();
    expect(w0.heart_rate).toBeNull();
  });

  test('10. Edge: <2 peaks => hr null', () => {
    // Ramp data has strictly increasing values (no peaks)
    const totalSamples = 2401;
    const { s1, s2 } = rampData(totalSamples);
    const { streamingResults } = runStreamingComparison(
      s1,
      [],
      s2,
      [],
      totalSamples,
      400,
      400
    );

    // Window 4 has 0 peaks, so HR must be null
    expect(streamingResults[4]?.heart_rate).toBeNull();
  });

  test('11. Chunk invariant: 1-sample, 400, 7-sample chunks all match', () => {
    const totalSamples = 2401;
    const { s1: s1a, s2: s2a } = rampData(totalSamples);
    const { s1: s1b, s2: s2b } = rampData(totalSamples);
    const { s1: s1c, s2: s2c } = rampData(totalSamples);

    const r1 = runStreamingComparison(s1a, [], s2a, [], totalSamples, 1, 1).streamingResults;
    const r400 = runStreamingComparison(s1b, [], s2b, [], totalSamples, 400, 400).streamingResults;
    const r7 = runStreamingComparison(s1c, [], s2c, [], totalSamples, 7, 7).streamingResults;

    expect(r1).toEqual(r400);
    expect(r400).toEqual(r7);
  });
});
