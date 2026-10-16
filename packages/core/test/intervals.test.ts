import { describe, test, expect } from 'bun:test';
import * as I from '../src/intervals.js';

describe('intervals', () => {
  test('EMPTY is an empty array', () => {
    expect(I.EMPTY).toEqual([]);
    expect(I.coverage(I.EMPTY)).toBe(0);
  });

  test('fromRanges normalizes, sorts, and merges adjacent/overlapping ranges', () => {
    expect(I.fromRanges([])).toEqual([]);
    expect(I.fromRanges([{ from: 5, to: 5 }])).toEqual([]);
    expect(I.fromRanges([{ from: 8, to: 3 }])).toEqual([]);

    // Adjacent ranges merge
    expect(I.fromRanges([{ from: 0, to: 5 }, { from: 5, to: 10 }])).toEqual([
      { from: 0, to: 10 },
    ]);

    // Overlapping ranges merge
    expect(I.fromRanges([{ from: 0, to: 7 }, { from: 4, to: 10 }])).toEqual([
      { from: 0, to: 10 },
    ]);

    // Unsorted ranges get sorted and merged
    expect(
      I.fromRanges([
        { from: 20, to: 30 },
        { from: 0, to: 5 },
        { from: 4, to: 10 },
      ])
    ).toEqual([
      { from: 0, to: 10 },
      { from: 20, to: 30 },
    ]);
  });

  test('toRanges returns a clone of the ranges', () => {
    const set = I.fromRanges([{ from: 0, to: 10 }]);
    const ranges = I.toRanges(set);
    expect(ranges).toEqual([{ from: 0, to: 10 }]);
    expect(ranges).not.toBe(set as unknown as I.Range[]);
  });

  test('union combines interval sets', () => {
    const a = I.fromRanges([{ from: 0, to: 10 }, { from: 20, to: 30 }]);
    const b = I.fromRanges([{ from: 5, to: 25 }]);
    expect(I.union(a, b)).toEqual([{ from: 0, to: 30 }]);

    expect(I.union(I.EMPTY, a)).toEqual(I.toRanges(a));
    expect(I.union(a, I.EMPTY)).toEqual(I.toRanges(a));
  });

  test('subtract removes sub-intervals cleanly', () => {
    const a = I.fromRanges([{ from: 0, to: 100 }]);

    // Middle clip
    const subMid = I.subtract(a, I.fromRanges([{ from: 30, to: 70 }]));
    expect(subMid).toEqual([
      { from: 0, to: 30 },
      { from: 70, to: 100 },
    ]);

    // Start clip
    const subStart = I.subtract(a, I.fromRanges([{ from: 0, to: 25 }]));
    expect(subStart).toEqual([{ from: 25, to: 100 }]);

    // End clip
    const subEnd = I.subtract(a, I.fromRanges([{ from: 75, to: 100 }]));
    expect(subEnd).toEqual([{ from: 0, to: 75 }]);

    // Total subtraction
    const subAll = I.subtract(a, I.fromRanges([{ from: 0, to: 100 }]));
    expect(subAll).toEqual([]);

    // Subtracting non-overlapping leaves untouched
    const subNone = I.subtract(a, I.fromRanges([{ from: 200, to: 300 }]));
    expect(subNone).toEqual([{ from: 0, to: 100 }]);

    // Subtraction from EMPTY
    expect(I.subtract(I.EMPTY, a)).toEqual([]);
    expect(I.subtract(a, I.EMPTY)).toEqual(I.toRanges(a));
  });

  test('intersect computes overlapping intervals', () => {
    const a = I.fromRanges([{ from: 0, to: 10 }, { from: 20, to: 30 }]);
    const b = I.fromRanges([{ from: 5, to: 25 }]);
    expect(I.intersect(a, b)).toEqual([
      { from: 5, to: 10 },
      { from: 20, to: 25 },
    ]);

    expect(I.intersect(a, I.EMPTY)).toEqual([]);
    expect(I.intersect(I.EMPTY, b)).toEqual([]);

    // Disjoint
    const c = I.fromRanges([{ from: 50, to: 60 }]);
    expect(I.intersect(a, c)).toEqual([]);
  });

  test('contains tests half-open interval membership', () => {
    const set = I.fromRanges([{ from: 10, to: 20 }, { from: 30, to: 40 }]);

    expect(I.contains(set, 9)).toBe(false);
    expect(I.contains(set, 10)).toBe(true);
    expect(I.contains(set, 15)).toBe(true);
    expect(I.contains(set, 19)).toBe(true);
    expect(I.contains(set, 20)).toBe(false); // half-open: upper bound not included

    expect(I.contains(set, 25)).toBe(false); // gap
    expect(I.contains(set, 30)).toBe(true);
    expect(I.contains(set, 40)).toBe(false);
    expect(I.contains(I.EMPTY, 10)).toBe(false);
  });

  test('complement subtracts intervals from given range', () => {
    const set = I.fromRanges([{ from: 20, to: 30 }, { from: 40, to: 50 }]);
    expect(I.complement(set, 10, 60)).toEqual([
      { from: 10, to: 20 },
      { from: 30, to: 40 },
      { from: 50, to: 60 },
    ]);

    expect(I.complement(set, 10, 10)).toEqual([]);
  });

  test('coverage sums length of all intervals', () => {
    const set = I.fromRanges([{ from: 0, to: 10 }, { from: 20, to: 35 }]);
    expect(I.coverage(set)).toBe(25);
    expect(I.coverage(I.EMPTY)).toBe(0);
  });
});
