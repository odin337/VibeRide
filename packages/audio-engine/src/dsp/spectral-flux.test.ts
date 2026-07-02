import { describe, expect, it } from 'vitest';
import { FREQUENCY_BANDS } from '@viberide/shared';

import { clickTrack, silence, sine } from '../testing/signals';
import { computeBandNoveltyCurves, FRAME_SIZE, HOP_SIZE, sumCurves } from './spectral-flux';

const SAMPLE_RATE = 44100;

function argmax(values: Float64Array): number {
  let best = 0;
  for (let i = 1; i < values.length; i += 1) {
    if ((values[i] as number) > (values[best] as number)) {
      best = i;
    }
  }
  return best;
}

describe('computeBandNoveltyCurves', () => {
  it('rejects invalid sample rates', () => {
    const pcm = new Float32Array(FRAME_SIZE);
    expect(() => computeBandNoveltyCurves(pcm, 0)).toThrow(RangeError);
    expect(() => computeBandNoveltyCurves(pcm, -44100)).toThrow(RangeError);
    expect(() => computeBandNoveltyCurves(pcm, Number.NaN)).toThrow(RangeError);
  });

  it('returns empty curves when the PCM is shorter than one frame', () => {
    const { curves, hopSec, frameCount } = computeBandNoveltyCurves(
      new Float32Array(FRAME_SIZE - 1),
      SAMPLE_RATE,
    );
    expect(frameCount).toBe(0);
    expect(hopSec).toBeCloseTo(HOP_SIZE / SAMPLE_RATE, 12);
    for (const band of FREQUENCY_BANDS) {
      expect(curves[band]).toHaveLength(0);
    }
  });

  it('keeps every band at zero for silence', () => {
    const { curves } = computeBandNoveltyCurves(silence(2, SAMPLE_RATE), SAMPLE_RATE);
    for (const band of FREQUENCY_BANDS) {
      expect(Math.max(...curves[band])).toBe(0);
    }
  });

  it('normalizes each band of a broadband click track to [0, 1] with max exactly 1', () => {
    const pcm = clickTrack({
      intervalSec: 0.5,
      durationSec: 3,
      sampleRate: SAMPLE_RATE,
      startSec: 0.25,
      seed: 7,
    });
    const { curves, frameCount } = computeBandNoveltyCurves(pcm, SAMPLE_RATE);
    expect(frameCount).toBeGreaterThan(0);
    for (const band of FREQUENCY_BANDS) {
      const curve = curves[band];
      expect(Math.max(...curve)).toBe(1);
      for (const value of curve) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it('places the bass novelty peak at the onset of a 100 Hz tone', () => {
    const pcm = new Float32Array(SAMPLE_RATE * 2);
    pcm.set(
      sine({ frequencyHz: 100, durationSec: 1.5, sampleRate: SAMPLE_RATE, amplitude: 0.8 }),
      Math.round(0.5 * SAMPLE_RATE),
    );
    const { curves, hopSec } = computeBandNoveltyCurves(pcm, SAMPLE_RATE);
    const peakTime = argmax(curves.bass) * hopSec;
    expect(Math.abs(peakTime - 0.5)).toBeLessThanOrEqual(0.03);
  });

  it('shows near-zero flux for the steady-state part of a sustained tone', () => {
    const pcm = new Float32Array(SAMPLE_RATE * 2);
    pcm.set(
      sine({ frequencyHz: 100, durationSec: 1.5, sampleRate: SAMPLE_RATE, amplitude: 0.8 }),
      Math.round(0.5 * SAMPLE_RATE),
    );
    const { curves, hopSec } = computeBandNoveltyCurves(pcm, SAMPLE_RATE);
    const steadyFrame = Math.round(1.5 / hopSec);
    expect(curves.bass[steadyFrame]).toBeLessThan(0.05);
  });

  it('is deterministic for identical PCM', () => {
    const pcm = clickTrack({ intervalSec: 0.5, durationSec: 2, sampleRate: SAMPLE_RATE, seed: 3 });
    const first = computeBandNoveltyCurves(pcm, SAMPLE_RATE);
    const second = computeBandNoveltyCurves(pcm, SAMPLE_RATE);
    for (const band of FREQUENCY_BANDS) {
      expect(Array.from(second.curves[band])).toEqual(Array.from(first.curves[band]));
    }
  });
});

describe('sumCurves', () => {
  it('adds the three bands frame by frame', () => {
    const curves = {
      bass: new Float64Array([1, 0, 0.5]),
      mid: new Float64Array([0, 1, 0.25]),
      high: new Float64Array([0, 0, 0.25]),
    };
    expect(Array.from(sumCurves(curves))).toEqual([1, 1, 1]);
  });

  it('rejects band curves of mismatched length', () => {
    const curves = {
      bass: new Float64Array(3),
      mid: new Float64Array(2),
      high: new Float64Array(3),
    };
    expect(() => sumCurves(curves)).toThrow(/equal length/);
  });
});
