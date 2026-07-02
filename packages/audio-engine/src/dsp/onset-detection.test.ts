import { describe, expect, it } from 'vitest';
import { FREQUENCY_BANDS } from '@viberide/shared';

import { clickTimes, clickTrack } from '../testing/signals';
import { detectOnsets } from './onset-detection';
import { computeBandNoveltyCurves } from './spectral-flux';

const SAMPLE_RATE = 44100;

describe('detectOnsets', () => {
  it('rejects invalid hopSec and windowFrames', () => {
    const curve = new Float64Array(10);
    expect(() => detectOnsets(curve, 0, 'bass')).toThrow(RangeError);
    expect(() => detectOnsets(curve, -0.01, 'bass')).toThrow(RangeError);
    expect(() => detectOnsets(curve, Number.NaN, 'bass')).toThrow(RangeError);
    expect(() => detectOnsets(curve, 0.01, 'bass', { windowFrames: 0 })).toThrow(RangeError);
    expect(() => detectOnsets(curve, 0.01, 'bass', { windowFrames: 2.5 })).toThrow(RangeError);
  });

  it('returns nothing for empty, silent, or constant curves', () => {
    expect(detectOnsets(new Float64Array(0), 0.01, 'mid')).toEqual([]);
    expect(detectOnsets(new Float64Array(100), 0.01, 'mid')).toEqual([]);
    expect(detectOnsets(new Float64Array(100).fill(0.5), 0.01, 'mid')).toEqual([]);
  });

  it('detects every click of a broadband click track within ±30 ms, in every band', () => {
    const options = {
      intervalSec: 0.5,
      durationSec: 5,
      sampleRate: SAMPLE_RATE,
      startSec: 0.25,
      seed: 7,
    };
    const pcm = clickTrack(options);
    const expected = clickTimes(options);
    const { curves, hopSec } = computeBandNoveltyCurves(pcm, SAMPLE_RATE);

    for (const band of FREQUENCY_BANDS) {
      const onsets = detectOnsets(curves[band], hopSec, band);
      expect(onsets).toHaveLength(expected.length);
      for (const clickTime of expected) {
        const nearest = Math.min(...onsets.map((onset) => Math.abs(onset.time - clickTime)));
        expect(nearest).toBeLessThanOrEqual(0.03);
      }
      for (const onset of onsets) {
        expect(onset.band).toBe(band);
        expect(onset.strength).toBeGreaterThan(0);
        expect(onset.strength).toBeLessThanOrEqual(1);
      }
    }
  });

  it('detects peaks at the very edges of the curve', () => {
    const curve = new Float64Array(200);
    curve[0] = 1.0; // no left neighbour
    curve[199] = 0.8; // no right neighbour
    const onsets = detectOnsets(curve, 0.01, 'bass');
    expect(onsets.map((onset) => onset.time)).toEqual([0, 1.99]);
    expect(onsets.map((onset) => onset.strength)).toEqual([1, 0.8]);
  });

  it('normalizes the strongest onset to exactly 1', () => {
    const curve = new Float64Array(200);
    curve[50] = 0.4;
    curve[150] = 0.8;
    const onsets = detectOnsets(curve, 0.01, 'high');
    expect(onsets.map((onset) => onset.strength)).toEqual([0.5, 1]);
  });

  it('merges peaks closer than the minimum spacing, keeping the stronger one', () => {
    const curve = new Float64Array(200);
    curve[50] = 0.6;
    curve[53] = 1.0; // 30 ms after the first — within the 100 ms default spacing
    curve[150] = 0.9;
    const onsets = detectOnsets(curve, 0.01, 'mid');
    expect(onsets).toHaveLength(2);
    expect(onsets[0]!.time).toBeCloseTo(0.53, 9);
    expect(onsets[0]!.strength).toBe(1);
    expect(onsets[1]!.time).toBeCloseTo(1.5, 9);
  });

  it('drops the weaker rival when the earlier peak is stronger', () => {
    const curve = new Float64Array(200);
    curve[50] = 1.0;
    curve[53] = 0.6;
    const onsets = detectOnsets(curve, 0.01, 'mid');
    expect(onsets).toHaveLength(1);
    expect(onsets[0]!.time).toBeCloseTo(0.5, 9);
  });

  it('honours custom detection options', () => {
    const curve = new Float64Array(200);
    curve[50] = 0.6;
    curve[53] = 1.0;
    // With a 10 ms minimum spacing the two peaks 30 ms apart both survive.
    const onsets = detectOnsets(curve, 0.01, 'bass', {
      windowFrames: 15,
      thresholdK: 1.0,
      minSpacingSec: 0.01,
    });
    expect(onsets.map((onset) => onset.time)).toEqual([0.5, 0.53]);
  });

  it('enforces the minimum inter-onset spacing in the result', () => {
    const options = {
      intervalSec: 0.5,
      durationSec: 5,
      sampleRate: SAMPLE_RATE,
      startSec: 0.25,
      seed: 5,
    };
    const { curves, hopSec } = computeBandNoveltyCurves(clickTrack(options), SAMPLE_RATE);
    const onsets = detectOnsets(curves.mid, hopSec, 'mid');
    for (let i = 1; i < onsets.length; i += 1) {
      expect(onsets[i]!.time - onsets[i - 1]!.time).toBeGreaterThanOrEqual(0.1);
    }
  });
});
