import { createProcessor, type Processor, type WindowResult } from '@mayacardio/core';
import { crc32 } from './crc32.js';
import { packRows } from './codec.js';

export interface MockReply {
  session_id: string;
  sensor: 1 | 2;
  first_index: number;
  count: number;
  lost: Array<{ from_index: number; to_index: number | null; reason: string }>;
  session_end: boolean;
  crc32: number;
  data: number[][];
  rawString?: string;
}

export function extractRawDataSubstring(rawLine: string): string | null {
  const dataKeyIdx = rawLine.indexOf('"data"');
  if (dataKeyIdx === -1) return null;
  const start = rawLine.indexOf('[', dataKeyIdx);
  if (start === -1) return null;
  let depth = 0;
  let end = -1;
  for (let i = start; i < rawLine.length; i++) {
    const ch = rawLine[i];
    if (ch === '[') {
      depth++;
    } else if (ch === ']') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) return null;
  return rawLine.slice(start, end);
}

export function findUnreportedGaps(
  expectedFrom: number,
  firstIndex: number,
  reportedLost: Array<{ from_index: number; to_index: number | null }>
): Array<{ from: number; to: number }> {
  let gaps: Array<{ from: number; to: number }> = [{ from: expectedFrom, to: firstIndex }];

  for (const item of reportedLost) {
    const lFrom = item.from_index;
    const lTo = item.to_index ?? firstIndex;
    if (lFrom >= lTo) continue;

    const nextGaps: Array<{ from: number; to: number }> = [];
    for (const g of gaps) {
      if (lTo <= g.from || lFrom >= g.to) {
        nextGaps.push(g);
      } else {
        if (lFrom > g.from) {
          nextGaps.push({ from: g.from, to: lFrom });
        }
        if (lTo < g.to) {
          nextGaps.push({ from: lTo, to: g.to });
        }
      }
    }
    gaps = nextGaps;
  }

  return gaps;
}
