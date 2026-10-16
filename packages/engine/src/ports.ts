import type { WindowResult, AuditResult } from '@mayacardio/core';

export interface BlockRecord {
  sessionId: string;
  sensor: 1 | 2;
  firstIndex: number;
  count: number;
  crc32: number;
  payload: Uint8Array;
  losses: Array<{ from: number; to: number | null; reason: string }>;
  monoUs: number;
}

export interface LossRecord {
  sessionId: string;
  sensor: 1 | 2;
  from: number;
  to: number | null;
  reason: string;
  monoUs: number;
}

export interface ResumePoint {
  sessionId: string;
  sensor: 1 | 2;
  nextIndex: number;
}

export interface EngineStorage {
  init(): Promise<void>;
  getResumePts(): Promise<ResumePoint[]>;
  writeBlock(record: BlockRecord): Promise<'ok' | 'duplicate' | 'disk_full'>;
  writeLoss(record: LossRecord): Promise<void>;
  writeResult(sessionId: string, result: WindowResult): Promise<void>;
  getBlocks(sessionId: string, sensor: 1 | 2): Promise<Array<{ firstIndex: number; count: number; payload: Uint8Array }>>;
  getLosses(sessionId: string, sensor: 1 | 2): Promise<Array<{ from: number; to: number | null; reason: string }>>;
  audit(sessionId: string): Promise<AuditResult & { totalStored: number; totalLost: number; ok: boolean }>;
  close(): Promise<void>;
}

export interface EngineClock {
  nowMonoMs(): number;
  nowWallMs(): number;
  sleep(ms: number): Promise<void>;
}

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

export interface EngineMockSource {
  read(sensor: 1 | 2, fromIndex?: number): Promise<MockReply>;
}

export interface EngineNet {
  isConnected(): boolean;
  cut(): void;
  restore(): void;
  sendLiveBlock(block: BlockRecord): Promise<boolean>;
  sendSyncBatch(blocks: BlockRecord[], losses: LossRecord[]): Promise<{ ok: boolean; count: number }>;
  onAck(listener: (ack: { sensor: 1 | 2; firstIndex: number }) => void): void;
}

export interface EngineLogger {
  info(msg: string, meta?: any): void;
  warn(msg: string, meta?: any): void;
  error(msg: string, meta?: any): void;
  event(type: string, meta?: any): void;
}
