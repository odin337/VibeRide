import { describe, expect, it } from 'vitest';

import { chance, createPrng, nextInt, nextRange, pick } from './prng';

describe('createPrng', () => {
  it('is deterministic for equal seeds', () => {
    const a = createPrng(123456);
    const b = createPrng(123456);
    for (let i = 0; i < 100; i += 1) {
      expect(a()).toBe(b());
    }
  });

  it('produces different sequences for different seeds', () => {
    const a = createPrng(1);
    const b = createPrng(2);
    const sequenceA = Array.from({ length: 10 }, () => a());
    const sequenceB = Array.from({ length: 10 }, () => b());
    expect(sequenceA).not.toEqual(sequenceB);
  });

  it('stays within [0, 1)', () => {
    const rng = createPrng(42);
    for (let i = 0; i < 1000; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('has a roughly uniform mean', () => {
    const rng = createPrng(7);
    let sum = 0;
    const n = 10_000;
    for (let i = 0; i < n; i += 1) {
      sum += rng();
    }
    expect(sum / n).toBeGreaterThan(0.45);
    expect(sum / n).toBeLessThan(0.55);
  });
});

describe('nextRange', () => {
  it('respects bounds', () => {
    const rng = createPrng(9);
    for (let i = 0; i < 500; i += 1) {
      const value = nextRange(rng, -5, 5);
      expect(value).toBeGreaterThanOrEqual(-5);
      expect(value).toBeLessThan(5);
    }
  });

  it('throws when max < min', () => {
    expect(() => nextRange(createPrng(1), 2, 1)).toThrow(RangeError);
  });
});

describe('nextInt', () => {
  it('covers the inclusive range', () => {
    const rng = createPrng(11);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i += 1) {
      seen.add(nextInt(rng, 1, 4));
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
  });

  it('throws on non-integer bounds', () => {
    expect(() => nextInt(createPrng(1), 0.5, 2)).toThrow(RangeError);
  });

  it('throws when max < min', () => {
    expect(() => nextInt(createPrng(1), 3, 2)).toThrow(RangeError);
  });
});

describe('pick', () => {
  it('picks only existing elements', () => {
    const rng = createPrng(21);
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 100; i += 1) {
      expect(items).toContain(pick(rng, items));
    }
  });

  it('throws on an empty array', () => {
    expect(() => pick(createPrng(1), [])).toThrow(RangeError);
  });
});

describe('chance', () => {
  it('always true at p=1 and false at p=0', () => {
    const rng = createPrng(31);
    for (let i = 0; i < 50; i += 1) {
      expect(chance(rng, 1)).toBe(true);
      expect(chance(rng, 0)).toBe(false);
    }
  });
});
