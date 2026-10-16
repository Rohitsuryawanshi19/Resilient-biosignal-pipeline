import { describe, test, expect, beforeEach } from 'bun:test';
import { createLedger, type Ledger } from '../src/ledger.js';

describe('ledger', () => {
  let ledger: Ledger;

  beforeEach(() => {
    ledger = createLedger();
  });

  test('1. Basic store+loss, audit clean', () => {
    expect(ledger.pushStored(0, 100)).toBe('ok');
    ledger.pushLost(100, 200);

    const result = ledger.audit(200);
    expect(result.gaps).toEqual([]);
    expect(result.overlaps).toEqual([]);
    expect(ledger.storedCoverage()).toBe(100);
  });

  test('2. Duplicate stored range => duplicate', () => {
    expect(ledger.pushStored(0, 50)).toBe('ok');
    expect(ledger.pushStored(10, 40)).toBe('duplicate');
    expect(ledger.pushStored(0, 50)).toBe('duplicate');
    expect(ledger.pushStored(40, 60)).toBe('ok');
    expect(ledger.storedCoverage()).toBe(60);
  });

  test('3. Out-of-order pushes still correct', () => {
    expect(ledger.pushStored(200, 300)).toBe('ok');
    expect(ledger.pushStored(0, 100)).toBe('ok');
    expect(ledger.pushStored(100, 200)).toBe('ok');

    expect(ledger.storedCoverage()).toBe(300);
    const result = ledger.audit(300);
    expect(result.gaps).toEqual([]);
    expect(result.overlaps).toEqual([]);
  });

  test('4. audit() detects gaps', () => {
    ledger.pushStored(0, 100);
    ledger.pushStored(150, 300);

    const result = ledger.audit(300);
    expect(result.gaps).toEqual([{ from: 100, to: 150 }]);
    expect(result.overlaps).toEqual([]);
  });

  test('5. audit() detects overlaps between stored and lost', () => {
    ledger.pushStored(0, 100);
    ledger.pushLost(50, 150);

    const result = ledger.audit(150);
    expect(result.overlaps).toEqual([{ from: 50, to: 100 }]);
    expect(result.gaps).toEqual([]);
  });
});
