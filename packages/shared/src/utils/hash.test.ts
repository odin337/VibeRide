import { describe, expect, it } from 'vitest';

import { fnv1a32, isSha256Hex, seedFromHash, sha256Hex } from './hash';

describe('fnv1a32', () => {
  it('matches known FNV-1a vectors', () => {
    // Reference values for the 32-bit FNV-1a algorithm.
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });

  it('hashes byte arrays identically to equivalent strings', () => {
    const text = 'viberide';
    // ASCII-only input, so UTF-8 bytes equal the charCodeAt values used
    // by the string code path.
    const bytes = new TextEncoder().encode(text);
    expect(fnv1a32(bytes)).toBe(fnv1a32(text));
  });

  it('is deterministic', () => {
    expect(fnv1a32('same-input')).toBe(fnv1a32('same-input'));
  });
});

describe('seedFromHash', () => {
  it('is case-insensitive over hex digests', () => {
    expect(seedFromHash('ABCDEF')).toBe(seedFromHash('abcdef'));
  });

  it('yields an unsigned 32-bit integer', () => {
    const seed = seedFromHash('deadbeef'.repeat(8));
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xffffffff);
  });
});

describe('sha256Hex', () => {
  it('matches the canonical digest of "abc"', async () => {
    const bytes = new TextEncoder().encode('abc');
    await expect(sha256Hex(bytes)).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('accepts an ArrayBuffer', async () => {
    const bytes = new TextEncoder().encode('abc');
    const buffer = bytes.buffer.slice(0);
    await expect(sha256Hex(buffer)).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('isSha256Hex', () => {
  it('accepts a valid digest', () => {
    expect(isSha256Hex('a'.repeat(64))).toBe(true);
  });

  it('rejects wrong length and uppercase', () => {
    expect(isSha256Hex('abc')).toBe(false);
    expect(isSha256Hex('A'.repeat(64))).toBe(false);
  });
});
