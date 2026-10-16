export async function signLabToken(secret: string, sessionId: string, expiresAt: number): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const data = enc.encode(`${sessionId}.${expiresAt}`);
  const signature = await crypto.subtle.sign('HMAC', key, data);
  const sigHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${sessionId}.${expiresAt}.${sigHex}`;
}

export async function verifyLabToken(
  secret: string,
  token: string,
  expectedSession?: string
): Promise<{ valid: boolean; sessionId?: string; expired?: boolean }> {
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false };
  const [sessionId, expiresAtStr, sigHex] = parts;
  if (!sessionId || !expiresAtStr || !sigHex) return { valid: false };
  if (!sessionId.startsWith('labs/')) return { valid: false };
  if (expectedSession && expectedSession !== sessionId) return { valid: false };

  const expiresAt = parseInt(expiresAtStr, 10);
  if (isNaN(expiresAt)) return { valid: false };
  if (Date.now() > expiresAt) return { valid: false, expired: true };

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const matchSig = new Uint8Array(sigHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    matchSig,
    enc.encode(`${sessionId}.${expiresAt}`)
  );

  return { valid, sessionId, expired: false };
}
