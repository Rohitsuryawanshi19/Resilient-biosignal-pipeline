export function rampData(numSamples: number) {
  const s1 = new Map<number, number[]>();
  const s2 = new Map<number, number[]>();
  for (let i = 0; i < numSamples; i++) {
    s1.set(i, [i, i, i]);
    s2.set(i, [i, i]);
  }
  return { s1, s2 };
}

// Synthetic ECG: sensor1 ch1 has gaussian peaks at given BPM segments
// ch0 = ch2 = 0; sensor2 = [i,i]
export function ecgData(numSamples: number) {
  const s1 = new Map<number, number[]>();
  const s2 = new Map<number, number[]>();

  // BPM segments: [startSample, endSample, bpm]
  const segments: Array<[number, number, number]> = [
    [0, 4000, 60], // 10s at 60bpm = peak every 400 samples
    [4000, 8000, 90], // 10s at 90bpm = peak every 267 samples
    [8000, 12000, 72], // 10s at 72bpm = peak every 333 samples
  ];

  // Generate peak positions
  const peakPositions = new Set<number>();
  for (const [start, end, bpm] of segments) {
    const interval = Math.round((400 * 60) / bpm);
    for (let p = start + interval; p < end; p += interval) {
      peakPositions.add(p);
    }
  }

  // Gaussian bump function
  const gaussian = (x: number, mu: number, sigma: number) =>
    1000 * Math.exp(-0.5 * ((x - mu) / sigma) ** 2);

  for (let i = 0; i < numSamples; i++) {
    let ecgVal = 0;
    for (const p of peakPositions) {
      ecgVal += gaussian(i, p, 10);
    }
    ecgVal += (Math.random() - 0.5) * 20; // ±10 noise
    s1.set(i, [0, Math.round(ecgVal), 0]);
    s2.set(i, [i, i]);
  }

  return { s1, s2 };
}

export function mapsToSets(losses: Array<{ from: number; to: number }>) {
  const s = new Set<number>();
  for (const { from, to } of losses) {
    for (let i = from; i < to; i++) s.add(i);
  }
  return s;
}
