/*
 * Iterative radix-2 FFT for real-valued input, returning the one-sided
 * magnitude spectrum.
 *
 * Typed-array reads below use `as number` casts: every index is in-bounds by
 * construction, and noUncheckedIndexedAccess would otherwise force per-sample
 * undefined handling inside the hot loops (same pattern as fnv1a32 in
 * @viberide/shared).
 */

function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}

export class RealFft {
  readonly size: number;
  /** Number of one-sided spectrum bins: size / 2 + 1. */
  readonly binCount: number;

  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly cosTable: Float64Array;
  private readonly sinTable: Float64Array;
  private readonly bitReversal: Uint32Array;

  constructor(size: number) {
    if (!isPowerOfTwo(size) || size < 2) {
      throw new RangeError(`RealFft: size must be a power of two >= 2, got ${size}`);
    }
    this.size = size;
    this.binCount = size / 2 + 1;
    this.re = new Float64Array(size);
    this.im = new Float64Array(size);

    const half = size / 2;
    this.cosTable = new Float64Array(half);
    this.sinTable = new Float64Array(half);
    for (let i = 0; i < half; i += 1) {
      const angle = (2 * Math.PI * i) / size;
      this.cosTable[i] = Math.cos(angle);
      this.sinTable[i] = Math.sin(angle);
    }

    this.bitReversal = new Uint32Array(size);
    const bits = Math.log2(size);
    for (let i = 0; i < size; i += 1) {
      let reversed = 0;
      for (let bit = 0; bit < bits; bit += 1) {
        reversed = (reversed << 1) | ((i >>> bit) & 1);
      }
      this.bitReversal[i] = reversed;
    }
  }

  /**
   * Computes the magnitude spectrum of one real-valued frame. All scratch
   * buffers are reused between calls; pass `out` (length >= binCount) to make
   * the call fully allocation-free.
   */
  magnitudeSpectrum(input: ArrayLike<number>, out?: Float64Array): Float64Array {
    const n = this.size;
    if (input.length !== n) {
      throw new RangeError(`RealFft: expected input of length ${n}, got ${input.length}`);
    }
    const target = out ?? new Float64Array(this.binCount);
    if (target.length < this.binCount) {
      throw new RangeError(
        `RealFft: out buffer needs at least ${this.binCount} slots, got ${target.length}`,
      );
    }

    const { re, im, cosTable, sinTable, bitReversal } = this;
    for (let i = 0; i < n; i += 1) {
      re[i] = input[bitReversal[i] as number] as number;
      im[i] = 0;
    }

    // Iterative Cooley-Tukey, decimation in time.
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const tableStep = n / len;
      for (let start = 0; start < n; start += len) {
        for (let k = 0; k < half; k += 1) {
          const tableIndex = k * tableStep;
          const wRe = cosTable[tableIndex] as number;
          const wIm = -(sinTable[tableIndex] as number);
          const evenIndex = start + k;
          const oddIndex = evenIndex + half;
          const oddSrcRe = re[oddIndex] as number;
          const oddSrcIm = im[oddIndex] as number;
          const oddRe = oddSrcRe * wRe - oddSrcIm * wIm;
          const oddIm = oddSrcRe * wIm + oddSrcIm * wRe;
          const evenRe = re[evenIndex] as number;
          const evenIm = im[evenIndex] as number;
          re[oddIndex] = evenRe - oddRe;
          im[oddIndex] = evenIm - oddIm;
          re[evenIndex] = evenRe + oddRe;
          im[evenIndex] = evenIm + oddIm;
        }
      }
    }

    for (let bin = 0; bin < this.binCount; bin += 1) {
      const binRe = re[bin] as number;
      const binIm = im[bin] as number;
      target[bin] = Math.sqrt(binRe * binRe + binIm * binIm);
    }
    return target;
  }
}
