export const MAX_DAILY_REQUESTS = 100_000;
export const MAX_DAILY_WRITES = 1_000_000;
export const THRESHOLD_RATIO = 0.8; // 80%
export const THRESHOLD_REQUESTS = Math.floor(MAX_DAILY_REQUESTS * THRESHOLD_RATIO); // 80,000
export const THRESHOLD_WRITES = Math.floor(MAX_DAILY_WRITES * THRESHOLD_RATIO); // 800,000

export interface BudgetStatus {
  date: string;
  requests: number;
  writes: number;
  requestsMax: number;
  writesMax: number;
  exhausted: boolean;
  ratio: number;
}

export function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
