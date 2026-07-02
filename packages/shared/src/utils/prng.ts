/** Deterministic pseudo-random generator returning floats in [0, 1). */
export type Prng = () => number;

/**
 * mulberry32 — fast, high-quality 32-bit PRNG. Deterministic across
 * platforms (only uses integer ops and Math.fround-safe arithmetic),
 * which the track generator and anti-cheat validator depend on.
 */
export function createPrng(seed: number): Prng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform float in [min, max). */
export function nextRange(rng: Prng, min: number, max: number): number {
  if (max < min) {
    throw new RangeError(`nextRange: max (${max}) must be >= min (${min})`);
  }
  return min + rng() * (max - min);
}

/** Uniform integer in [min, max] inclusive. */
export function nextInt(rng: Prng, min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new RangeError('nextInt: bounds must be integers');
  }
  if (max < min) {
    throw new RangeError(`nextInt: max (${max}) must be >= min (${min})`);
  }
  return min + Math.floor(rng() * (max - min + 1));
}

/** Uniformly picks one element; throws on an empty array. */
export function pick<T>(rng: Prng, items: readonly T[]): T {
  const item = items[nextInt(rng, 0, items.length - 1)];
  if (item === undefined && items.length === 0) {
    throw new RangeError('pick: cannot pick from an empty array');
  }
  return item as T;
}

/** Bernoulli trial with probability p. */
export function chance(rng: Prng, p: number): boolean {
  return rng() < p;
}
