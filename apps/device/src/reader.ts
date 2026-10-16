import * as net from 'node:net';
import { createProcessor, type Processor, type WindowResult } from '@mayacardio/core';
import { crc32 } from './crc32.js';
import { packRows, type Store } from './store.js';

export interface ReaderConfig {
  host: string;
  port: number;
  store: Store;
  onResult?: (sessionId: string, result: WindowResult) => void;
  mode: 'online' | 'offline';
  timeoutMs?: number;
}

import {
  type MockReply,
  extractRawDataSubstring,
  findUnreportedGaps,
} from '@mayacardio/engine';

export {
  type MockReply,
  extractRawDataSubstring,
  findUnreportedGaps,
};

class LineReader {
  private buffer = '';
  private lineQueue: string[] = [];
  private waiter: { resolve: (line: string) => void; reject: (err: Error) => void } | null = null;
  private closed = false;
  private closeError: Error | null = null;

  constructor(socket: net.Socket) {
    socket.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf-8');
      let idx: number;
      while ((idx = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, idx).trim();
        this.buffer = this.buffer.slice(idx + 1);
        if (line.length === 0) continue;
        if (this.waiter) {
          const w = this.waiter;
          this.waiter = null;
          w.resolve(line);
        } else {
          this.lineQueue.push(line);
        }
      }
    });

    socket.on('error', (err) => {
      this.closeError = err;
      if (this.waiter) {
        const w = this.waiter;
        this.waiter = null;
        w.reject(err);
      }
    });

    socket.on('close', () => {
      this.closed = true;
      if (this.waiter) {
        const w = this.waiter;
        this.waiter = null;
        w.reject(new Error('Socket closed'));
      }
    });
  }

  async nextLine(timeoutMs: number, signal?: AbortSignal): Promise<string> {
    const qLine = this.lineQueue.shift();
    if (qLine !== undefined) {
      return qLine;
    }
    if (this.closeError) throw this.closeError;
    if (this.closed) throw new Error('Socket closed');
    if (signal?.aborted) throw new Error('Aborted');

    return new Promise<string>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      let abortHandler: (() => void) | null = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        if (signal && abortHandler) {
          signal.removeEventListener('abort', abortHandler);
        }
      };

      const resolveWrapper = (line: string) => {
        cleanup();
        resolve(line);
      };

      const rejectWrapper = (err: Error) => {
        cleanup();
        reject(err);
      };

      timer = setTimeout(() => {
        cleanup();
        if (this.waiter?.resolve === resolveWrapper) {
          this.waiter = null;
        }
        reject(new Error('Timeout waiting for socket reply'));
      }, timeoutMs);

      if (signal) {
        abortHandler = () => {
          cleanup();
          if (this.waiter?.resolve === resolveWrapper) {
            this.waiter = null;
          }
          reject(new Error('Aborted'));
        };
        signal.addEventListener('abort', abortHandler, { once: true });
      }

      this.waiter = { resolve: resolveWrapper, reject: rejectWrapper };
    });
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onAbort = () => {
      if (timer) clearTimeout(timer);
      resolve();
    };
    timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

function connectSocket(host: string, port: number, signal: AbortSignal): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      return reject(new Error('Aborted'));
    }

    const socket = net.createConnection({ host, port });
    let resolved = false;

    const onConnect = () => {
      cleanup();
      resolved = true;
      resolve(socket);
    };

    const onError = (err: Error) => {
      cleanup();
      if (!resolved) {
        socket.destroy();
        reject(err);
      }
    };

    const onAbort = () => {
      cleanup();
      if (!resolved) {
        socket.destroy();
        reject(new Error('Aborted'));
      }
    };

    const cleanup = () => {
      socket.removeListener('connect', onConnect);
      socket.removeListener('error', onError);
      signal.removeEventListener('abort', onAbort);
    };

    socket.once('connect', onConnect);
    socket.once('error', onError);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function runReader(config: ReaderConfig, signal: AbortSignal): Promise<void> {
  const timeoutMs = config.timeoutMs ?? 10_000;
  let reconnectAttempt = 0;

  let currentSessionId: string | null = null;
  const nextExpectedIndex: Record<1 | 2, number> = { 1: 0, 2: 0 };
  const needResume: Record<1 | 2, boolean> = { 1: false, 2: false };
  const sessionFirstBlock: Record<1 | 2, boolean> = { 1: true, 2: true };

  let processor: Processor = createProcessor(config.mode);

  const resumePts = config.store.getResumePts();
  for (const pt of resumePts) {
    nextExpectedIndex[pt.sensor] = pt.nextIndex;
    currentSessionId = pt.sessionId;
    if (pt.nextIndex > 0) {
      needResume[pt.sensor] = true;
      sessionFirstBlock[pt.sensor] = false;
    }
  }

  let currentSensor: 1 | 2 = 1;

  while (!signal.aborted) {
    let socket: net.Socket | null = null;
    let lineReader: LineReader | null = null;

    try {
      socket = await connectSocket(config.host, config.port, signal);
      lineReader = new LineReader(socket);
      reconnectAttempt = 0;

      while (!signal.aborted) {
        const sensor = currentSensor;
        const reqObj: { cmd: string; sensor: number; from_index?: number } = {
          cmd: 'read',
          sensor,
        };

        if (needResume[sensor] && nextExpectedIndex[sensor] > 0) {
          reqObj.from_index = nextExpectedIndex[sensor];
          needResume[sensor] = false;
        }

        socket.write(JSON.stringify(reqObj) + '\n');

        let rawLine: string;
        try {
          rawLine = await lineReader.nextLine(timeoutMs, signal);
        } catch (err: unknown) {
          if (signal.aborted) break;
          const isTimeout = err instanceof Error && err.message.includes('Timeout');
          if (isTimeout) {
            const monoUs = Math.round(performance.now() * 1000);
            if (currentSessionId) {
              config.store.writeLoss({
                sessionId: currentSessionId,
                sensor,
                from: nextExpectedIndex[sensor],
                to: null,
                reason: 'sensor_timeout',
                monoUs,
              });
              processor.pushLoss(sensor, nextExpectedIndex[sensor], null);
            }
          }
          throw err;
        }

        let reply: MockReply;
        try {
          reply = JSON.parse(rawLine);
        } catch {
          console.error(`[${new Date().toISOString()}] Failed to parse JSON reply:`, rawLine);
          currentSensor = currentSensor === 1 ? 2 : 1;
          continue;
        }

        // a. Verify CRC on raw substring
        const rawDataStr = extractRawDataSubstring(rawLine);
        const computedCrc = rawDataStr !== null ? crc32(rawDataStr) : 0;
        const crcValid =
          rawDataStr !== null &&
          (computedCrc === reply.crc32 || (computedCrc | 0) === (reply.crc32 | 0));

        if (!crcValid) {
          // b. CRC fail: re-read same range with from_index. Retry up to 3 times.
          let recovered = false;
          for (let retry = 1; retry <= 3; retry++) {
            if (signal.aborted) break;
            const retryReq = { cmd: 'read', sensor, from_index: reply.first_index };
            socket.write(JSON.stringify(retryReq) + '\n');

            let retryLine: string;
            try {
              retryLine = await lineReader.nextLine(timeoutMs, signal);
            } catch {
              break;
            }

            try {
              const retryReply: MockReply = JSON.parse(retryLine);
              const retryDataStr = extractRawDataSubstring(retryLine);
              const retryCrc = retryDataStr !== null ? crc32(retryDataStr) : 0;
              if (
                retryDataStr !== null &&
                (retryCrc === retryReply.crc32 || (retryCrc | 0) === (retryReply.crc32 | 0))
              ) {
                reply = retryReply;
                rawLine = retryLine;
                recovered = true;
                break;
              }
            } catch {}
          }

          if (!recovered) {
            // Still failing: writeLoss(reason:'crc_mismatch_unrecoverable'), advance past that range, continue
            const monoUs = Math.round(performance.now() * 1000);
            config.store.writeLoss({
              sessionId: reply.session_id,
              sensor,
              from: reply.first_index,
              to: reply.first_index + reply.count,
              reason: 'crc_mismatch_unrecoverable',
              monoUs,
            });
            processor.pushLoss(sensor, reply.first_index, reply.first_index + reply.count);
            nextExpectedIndex[sensor] = reply.first_index + reply.count;
            currentSensor = currentSensor === 1 ? 2 : 1;
            continue;
          }
        }

        // c. If session_id changed: close old session (write open-ended loss for unread tail), start new session.
        if (currentSessionId !== null && reply.session_id !== currentSessionId) {
          const monoUs = Math.round(performance.now() * 1000);
          for (const s of [1, 2] as const) {
            config.store.writeLoss({
              sessionId: currentSessionId,
              sensor: s,
              from: nextExpectedIndex[s],
              to: null,
              reason: 'session_changed',
              monoUs,
            });
            config.store.endSession(currentSessionId, s, nextExpectedIndex[s]);
          }
          currentSessionId = reply.session_id;
          nextExpectedIndex[1] = 0;
          nextExpectedIndex[2] = 0;
          sessionFirstBlock[1] = true;
          sessionFirstBlock[2] = true;
          processor = createProcessor(config.mode);
        } else if (currentSessionId === null) {
          currentSessionId = reply.session_id;
        }

        const monoUs = Math.round(performance.now() * 1000);
        const lossesToWrite: Array<{ from: number; to: number | null; reason: string }> = [];

        // Check if first block of session
        if (sessionFirstBlock[sensor]) {
          sessionFirstBlock[sensor] = false;
          nextExpectedIndex[sensor] = reply.first_index;
        }

        // d. If first_index != expected (gap not in lost field): write loss
        const expected = nextExpectedIndex[sensor];
        if (reply.first_index > expected) {
          const unreportedGaps = findUnreportedGaps(expected, reply.first_index, reply.lost);
          for (const gap of unreportedGaps) {
            lossesToWrite.push({
              from: gap.from,
              to: gap.to,
              reason: 'gap_not_reported_by_mock (reader_unavailable_or_sensor_stalled)',
            });
          }
        }

        // e. For each entry in lost[]: store.writeLoss()
        for (const l of reply.lost) {
          lossesToWrite.push({
            from: l.from_index,
            to: l.to_index,
            reason: l.reason,
          });
        }

        // f. store.writeBlock() — if 'duplicate', skip; if 'disk_full', pause ingest, continue polling for space.
        const payload = packRows(sensor, reply.data);
        const writeRes = config.store.writeBlock({
          sessionId: reply.session_id,
          sensor,
          firstIndex: reply.first_index,
          count: reply.count,
          crc32: reply.crc32,
          payload,
          losses: lossesToWrite,
          monoUs,
        });

        if (writeRes === 'disk_full') {
          await sleep(500, signal);
          continue;
        }

        if (writeRes === 'ok') {
          nextExpectedIndex[sensor] = Math.max(
            nextExpectedIndex[sensor],
            reply.first_index + reply.count
          );

          // g. Feed to createProcessor() via push() and pushLoss(). Collect finalizable() results, store.writeResult().
          for (const l of lossesToWrite) {
            processor.pushLoss(sensor, l.from, l.to);
          }
          processor.push(sensor, reply.first_index, reply.data);

          const finalResults = processor.finalizable();
          for (const r of finalResults) {
            config.store.writeResult(reply.session_id, r);
            if (config.onResult) {
              config.onResult(reply.session_id, r);
            }
          }

          if (reply.session_end) {
            config.store.endSession(
              reply.session_id,
              sensor,
              reply.first_index + reply.count
            );
          }
        }

        currentSensor = currentSensor === 1 ? 2 : 1;
      }
    } catch {
      if (signal.aborted) break;
      const base = 100 * Math.pow(2, Math.min(reconnectAttempt, 6));
      const capped = Math.min(10000, base);
      const delay = capped + capped * Math.random() * 0.5;
      reconnectAttempt++;
      await sleep(delay, signal);
    } finally {
      if (socket) {
        socket.destroy();
      }
    }
  }
}
