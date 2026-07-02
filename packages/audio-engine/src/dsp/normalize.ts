/**
 * Scales a non-negative curve so its maximum becomes 1. An all-zero curve is
 * left untouched (division-by-zero guard) — silence stays silent.
 */
export function normalizeInPlace(values: Float64Array): void {
  let max = 0;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i] as number;
    if (value > max) {
      max = value;
    }
  }
  if (max === 0) {
    return;
  }
  for (let i = 0; i < values.length; i += 1) {
    values[i] = (values[i] as number) / max;
  }
}
