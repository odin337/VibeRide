import { describe, expect, it } from 'vitest';

import { hannWindow } from './window';

describe('hannWindow', () => {
  it('rejects non-positive and non-integer sizes', () => {
    expect(() => hannWindow(0)).toThrow(RangeError);
    expect(() => hannWindow(-4)).toThrow(RangeError);
    expect(() => hannWindow(2.5)).toThrow(RangeError);
    expect(() => hannWindow(Number.NaN)).toThrow(RangeError);
  });

  it('matches the periodic Hann definition for size 8', () => {
    const window = hannWindow(8);
    expect(window).toHaveLength(8);
    // w[n] = 0.5 * (1 - cos(2πn / 8))
    expect(window[0]).toBeCloseTo(0, 12);
    expect(window[2]).toBeCloseTo(0.5, 12);
    expect(window[4]).toBeCloseTo(1, 12);
    expect(window[6]).toBeCloseTo(0.5, 12);
  });

  it('is symmetric around the peak (periodic form)', () => {
    const window = hannWindow(64);
    for (let i = 1; i < 64; i += 1) {
      expect(window[i]).toBeCloseTo(window[64 - i] as number, 12);
    }
  });

  it('stays within [0, 1]', () => {
    const window = hannWindow(1024);
    for (const value of window) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('caches windows per size', () => {
    expect(hannWindow(256)).toBe(hannWindow(256));
    expect(hannWindow(256)).not.toBe(hannWindow(512));
  });
});
