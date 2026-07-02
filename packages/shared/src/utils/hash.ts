const FNV_OFFSET_32 = 0x811c9dc5;
const FNV_PRIME_32 = 0x01000193;

/** FNV-1a 32-bit hash of a string or byte array. Deterministic, sync. */
export function fnv1a32(data: string | Uint8Array): number {
  let hash = FNV_OFFSET_32;
  if (typeof data === 'string') {
    for (let i = 0; i < data.length; i += 1) {
      hash ^= data.charCodeAt(i);
      hash = Math.imul(hash, FNV_PRIME_32);
    }
  } else {
    for (let i = 0; i < data.length; i += 1) {
      hash ^= data[i] as number;
      hash = Math.imul(hash, FNV_PRIME_32);
    }
  }
  return hash >>> 0;
}

/**
 * Derives the deterministic 32-bit level seed from an audio content hash
 * (or any string). Same audio → same seed → same level, everywhere.
 */
export function seedFromHash(audioHash: string): number {
  return fnv1a32(audioHash.toLowerCase());
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * sha-256 hex digest via WebCrypto — available in browsers and
 * Node.js ≥ 20 without imports.
 */
export async function sha256Hex(data: Uint8Array | ArrayBuffer): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', copy.buffer);
  return toHex(new Uint8Array(digest));
}

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

export function isSha256Hex(value: string): boolean {
  return SHA256_HEX_PATTERN.test(value);
}
