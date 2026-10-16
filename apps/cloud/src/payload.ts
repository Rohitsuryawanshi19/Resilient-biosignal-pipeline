export function packInt24(val: number, buf: Uint8Array, offset: number): void {
  const v = val & 0xffffff;
  buf[offset] = (v >> 16) & 0xff;
  buf[offset + 1] = (v >> 8) & 0xff;
  buf[offset + 2] = v & 0xff;
}

export function packRows(sensor: 1 | 2, rows: number[][]): Uint8Array {
  const channels = sensor === 1 ? 3 : 2;
  const buf = new Uint8Array(rows.length * channels * 3);
  let offset = 0;
  for (const row of rows) {
    for (let c = 0; c < channels; c++) {
      packInt24(row[c] ?? 0, buf, offset);
      offset += 3;
    }
  }
  return buf;
}

export function unpackInt24(buf: Uint8Array, offset: number): number {
  const b0 = buf[offset] ?? 0;
  const b1 = buf[offset + 1] ?? 0;
  const b2 = buf[offset + 2] ?? 0;
  const v = (b0 << 16) | (b1 << 8) | b2;
  return v >= 0x800000 ? v - 0x01000000 : v;
}

export function unpackRows(sensor: 1 | 2, buf: Uint8Array, count: number): number[][] {
  const channels = sensor === 1 ? 3 : 2;
  const rows: number[][] = [];
  let offset = 0;
  for (let r = 0; r < count; r++) {
    const row: number[] = [];
    for (let c = 0; c < channels; c++) {
      row.push(unpackInt24(buf, offset));
      offset += 3;
    }
    rows.push(row);
  }
  return rows;
}

