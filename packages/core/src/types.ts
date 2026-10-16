export interface Block {
  sensor: 1 | 2;
  firstIndex: number;
  rows: number[][];
}

export interface Loss {
  sensor: 1 | 2;
  from: number;
  to: number | null;
  reason: string;
}

export interface WindowResult {
  window: number;
  missing_1: number;
  missing_2: number;
  complete: boolean;
  mean_1: (number | null)[];
  min_1: (number | null)[];
  max_1: (number | null)[];
  mean_2: (number | null)[];
  min_2: (number | null)[];
  max_2: (number | null)[];
  magnitude: number | null;
  heart_rate: number | null;
  mode: 'online' | 'offline';
}

export interface AuditResult {
  gaps: Array<{ from: number; to: number }>;
  overlaps: Array<{ from: number; to: number }>;
}
