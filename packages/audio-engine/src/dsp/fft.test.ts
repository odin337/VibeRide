import { describe, expect, it } from 'vitest';

import { RealFft } from './fft';

describe('RealFft', () => {
  it('rejects non-power-of-two sizes with a clear error', () => {
    expect(() => new RealFft(1000)).toThrow(/power of two/);
    expect(() => new RealFft(3)).toThrow(RangeError);
    expect(() => new RealFft(0)).toThrow(RangeError);
    expect(() => new RealFft(-8)).toThrow(RangeError);
    expect(() => new RealFft(1)).toThrow(RangeError);
    expect(() => new RealFft(2.5)).toThrow(RangeError);
  });

  it('exposes the one-sided bin count', () => {
    expect(new RealFft(1024).binCount).toBe(513);
    expect(new RealFft(8).binCount).toBe(5);
  });

  it('rejects input frames of the wrong length', () => {
    const fft = new RealFft(1024);
    expect(() => fft.magnitudeSpectrum(new Float64Array(512))).toThrow(/length 1024/);
  });

  it('produces a flat magnitude spectrum for an impulse', () => {
    const fft = new RealFft(1024);
    const impulse = new Float64Array(1024);
    impulse[0] = 1;
    const magnitudes = fft.magnitudeSpectrum(impulse);
    expect(magnitudes).toHaveLength(513);
    for (const magnitude of magnitudes) {
      expect(magnitude).toBeCloseTo(1, 9);
    }
  });

  it('concentrates a bin-aligned sine into a single dominant bin', () => {
    const size = 1024;
    const bin = 8;
    const fft = new RealFft(size);
    const signal = new Float64Array(size);
    for (let i = 0; i < size; i += 1) {
      signal[i] = Math.sin((2 * Math.PI * bin * i) / size);
    }
    const magnitudes = fft.magnitudeSpectrum(signal);
    // A unit sine at an exact bin frequency has magnitude N/2 in that bin.
    expect(magnitudes[bin]).toBeCloseTo(size / 2, 6);
    for (let k = 0; k < magnitudes.length; k += 1) {
      if (k !== bin) {
        expect(magnitudes[k]).toBeLessThan(1e-6);
      }
    }
  });

  it('maps a constant signal onto the DC bin only', () => {
    const fft = new RealFft(1024);
    const magnitudes = fft.magnitudeSpectrum(new Float64Array(1024).fill(1));
    expect(magnitudes[0]).toBeCloseTo(1024, 6);
    for (let k = 1; k < magnitudes.length; k += 1) {
      expect(magnitudes[k]).toBeLessThan(1e-6);
    }
  });

  it('reuses a caller-provided output buffer', () => {
    const fft = new RealFft(8);
    const out = new Float64Array(5);
    const impulse = new Float64Array(8);
    impulse[0] = 1;
    const result = fft.magnitudeSpectrum(impulse, out);
    expect(result).toBe(out);
    expect(out[0]).toBeCloseTo(1, 12);
  });

  it('rejects an undersized output buffer', () => {
    const fft = new RealFft(8);
    expect(() => fft.magnitudeSpectrum(new Float64Array(8), new Float64Array(2))).toThrow(
      /at least 5/,
    );
  });

  it('is deterministic across repeated calls on reused buffers', () => {
    const fft = new RealFft(1024);
    const signal = new Float64Array(1024);
    for (let i = 0; i < 1024; i += 1) {
      signal[i] = Math.sin(0.05 * i) + 0.5 * Math.cos(0.11 * i);
    }
    const first = Array.from(fft.magnitudeSpectrum(signal));
    const second = Array.from(fft.magnitudeSpectrum(signal));
    expect(second).toEqual(first);
  });
});
