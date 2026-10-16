import type { AuditReport } from '../../../apps/device/src/audit.js';

export interface GroundTruthRow {
  sensor: 1 | 2;
  index: number;
  values: number[];
}

export function expectedRampValue(sensor: 1 | 2, channel: number, index: number): number {
  const mult = sensor === 1 ? 3 : 2;
  const raw = (mult * index + channel) % 8388608;
  // Signed 24-bit integer
  return raw >= 0x800000 ? raw - 0x01000000 : raw;
}

export interface VerificationResult {
  ok: boolean;
  errors: string[];
  totalSamplesChecked: number;
  totalLossesChecked: number;
  timings?: {
    timeToSwitchMs?: number;
    resultLatencyMs?: number;
    catchupDurationMs?: number;
  };
}

export function verifyGroundTruth(
  samples: Array<{ sensor: 1 | 2; index: number; values: number[] }>
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const s of samples) {
    const channels = s.sensor === 1 ? 3 : 2;
    if (s.values.length !== channels) {
      errors.push(`Sensor ${s.sensor} sample ${s.index} has ${s.values.length} channels, expected ${channels}`);
      continue;
    }

    for (let c = 0; c < channels; c++) {
      const expected = expectedRampValue(s.sensor, c, s.index);
      if (s.values[c] !== expected) {
        errors.push(`Value mismatch sensor ${s.sensor} index ${s.index} ch ${c}: expected ${expected}, got ${s.values[c]}`);
        if (errors.length > 20) return { ok: false, errors };
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export function verifyInvariants(params: {
  auditReports: AuditReport[];
  deviceExportLines: string[];
  cloudExportLines?: string[];
  maxPowerCutLossSamples?: number;
  actualPowerCutLossSamples?: number;
}): VerificationResult {
  const errors: string[] = [];
  let totalSamples = 0;
  let totalLosses = 0;

  // 1. Audit reports: stored ∩ lost = ∅ and no uncovered gaps
  for (const rep of params.auditReports) {
    if (!rep.ok) {
      if (rep.gaps.length > 0) {
        errors.push(`Session ${rep.sessionId} sensor ${rep.sensor} has uncovered gaps: ${JSON.stringify(rep.gaps)}`);
      }
      if (rep.overlaps.length > 0) {
        errors.push(`Session ${rep.sessionId} sensor ${rep.sensor} has overlaps: ${JSON.stringify(rep.overlaps)}`);
      }
    }
  }

  // 2. Parse device export lines
  const parsedSamples: Array<{ sensor: 1 | 2; index: number; values: number[] }> = [];
  for (const line of params.deviceExportLines) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if ('values' in obj) {
        parsedSamples.push(obj);
        totalSamples++;
      } else if ('from_index' in obj) {
        totalLosses++;
      }
    } catch (e) {
      errors.push(`Invalid JSON line in export: ${line}`);
    }
  }

  // 3. Verify ground truth values
  const gt = verifyGroundTruth(parsedSamples);
  if (!gt.ok) {
    errors.push(...gt.errors);
  }

  // 4. If cloud export lines provided, assert device export == cloud export
  if (params.cloudExportLines) {
    if (params.deviceExportLines.length !== params.cloudExportLines.length) {
      errors.push(
        `Export length mismatch: device has ${params.deviceExportLines.length} lines, cloud has ${params.cloudExportLines.length}`
      );
    } else {
      for (let i = 0; i < params.deviceExportLines.length; i++) {
        if (params.deviceExportLines[i] !== params.cloudExportLines[i]) {
          errors.push(`Export line ${i} mismatch between device and cloud`);
          break;
        }
      }
    }
  }

  // 5. Power cut loss bound check
  if (params.maxPowerCutLossSamples !== undefined && params.actualPowerCutLossSamples !== undefined) {
    if (params.actualPowerCutLossSamples > params.maxPowerCutLossSamples) {
      errors.push(
        `Power cut loss (${params.actualPowerCutLossSamples}) exceeded stated bound (${params.maxPowerCutLossSamples})`
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    totalSamplesChecked: totalSamples,
    totalLossesChecked: totalLosses,
  };
}
