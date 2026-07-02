const windowCache = new Map<number, Float64Array>();

/**
 * Periodic Hann window: w[n] = 0.5 * (1 - cos(2πn / N)). The periodic form is
 * the STFT convention (perfect COLA reconstruction at hop = N/2) and is well
 * defined for every size ≥ 1.
 *
 * Windows are cached per size and shared between callers — treat the returned
 * array as read-only.
 */
export function hannWindow(size: number): Float64Array {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`hannWindow: size must be a positive integer, got ${size}`);
  }
  const cached = windowCache.get(size);
  if (cached !== undefined) {
    return cached;
  }
  const window = new Float64Array(size);
  const step = (2 * Math.PI) / size;
  for (let i = 0; i < size; i += 1) {
    window[i] = 0.5 * (1 - Math.cos(step * i));
  }
  windowCache.set(size, window);
  return window;
}
