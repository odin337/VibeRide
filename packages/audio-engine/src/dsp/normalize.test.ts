import { describe, expect, it } from 'vitest';

import { normalizeInPlace } from './normalize';

describe('normalizeInPlace', () => {
  it('scales the maximum to exactly 1 and preserves ratios', () => {
    const values = new Float64Array([1, 2, 4]);
    normalizeInPlace(values);
    expect(Array.from(values)).toEqual([0.25, 0.5, 1]);
  });

  it('leaves an all-zero curve untouched (division-by-zero guard)', () => {
    const values = new Float64Array(8);
    normalizeInPlace(values);
    expect(Array.from(values)).toEqual(new Array<number>(8).fill(0));
  });

  it('handles an empty curve', () => {
    const values = new Float64Array(0);
    expect(() => normalizeInPlace(values)).not.toThrow();
    expect(values).toHaveLength(0);
  });

  it('is idempotent once normalized', () => {
    const values = new Float64Array([0.2, 1, 0.6]);
    normalizeInPlace(values);
    const snapshot = Array.from(values);
    normalizeInPlace(values);
    expect(Array.from(values)).toEqual(snapshot);
  });
});
