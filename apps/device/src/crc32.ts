const table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  table[i] = c >>> 0;
}

const encoder = new TextEncoder();

export function crc32(data: Uint8Array | string): number {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data;
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b !== undefined) {
      c = (table[(c ^ b) & 0xFF] ?? 0) ^ (c >>> 8);
    }
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}
