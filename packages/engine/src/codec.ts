// Pure int24 big-endian signed packing and unpacking
export function packRows(sensor: 1 | 2, rows: number[][]): Uint8Array {
  const channels = sensor === 1 ? 3 : 2;
  const count = rows.length;
  const buf = new Uint8Array(count * channels * 3);
  let offset = 0;

  for (let i = 0; i < count; i++) {
    const row = rows[i]!;
    for (let c = 0; c < channels; c++) {
      const val = row[c] ?? 0;
      const v = val & 0xffffff;
      buf[offset] = (v >> 16) & 0xff;
      buf[offset + 1] = (v >> 8) & 0xff;
      buf[offset + 2] = v & 0xff;
      offset += 3;
    }
  }
  return buf;
}

export function unpackRows(sensor: 1 | 2, buf: Uint8Array, count: number): number[][] {
  const channels = sensor === 1 ? 3 : 2;
  const rows: number[][] = [];
  let offset = 0;

  for (let i = 0; i < count; i++) {
    const row: number[] = [];
    for (let c = 0; c < channels; c++) {
      const b0 = buf[offset]!;
      const b1 = buf[offset + 1]!;
      const b2 = buf[offset + 2]!;
      let v = (b0 << 16) | (b1 << 8) | b2;
      if (v >= 0x800000) v -= 0x01000000;
      row.push(v);
      offset += 3;
    }
    rows.push(row);
  }
  return rows;
}
