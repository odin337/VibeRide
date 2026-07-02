import { describe, expect, it } from 'vitest';
import type { Onset } from '@viberide/shared';

import { clickTrack } from '../testing/signals';
import { buildBeatGrid, DEFAULT_BPM, deriveBeatPhase, estimateTempo } from './bpm';
import { detectOnsets } from './onset-detection';
import { computeBandNoveltyCurves, sumCurves } from './spectral-flux';

const SAMPLE_RATE = 44100;

interface TrackFixture {
  readonly pcm: Float32Array;
  readonly novelty: Float64Array;
  readonly hopSec: number;
  readonly curves: ReturnType<typeof computeBandNoveltyCurves>['curves'];
  readonly durationSec: number;
}

function makeClickFixture(
  intervalSec: number,
  durationSec: number,
  amplitudes?: readonly number[],
): TrackFixture {
  const pcm = clickTrack({
    intervalSec,
    durationSec,
    sampleRate: SAMPLE_RATE,
    startSec: 0.25,
    seed: 3,
    amplitudes,
  });
  const { curves, hopSec } = computeBandNoveltyCurves(pcm, SAMPLE_RATE);
  return { pcm, novelty: sumCurves(curves), hopSec, curves, durationSec };
}

describe('estimateTempo', () => {
  it('rejects invalid hopSec', () => {
    expect(() => estimateTempo(new Float64Array(100), 0)).toThrow(RangeError);
    expect(() => estimateTempo(new Float64Array(100), Number.NaN)).toThrow(RangeError);
  });

  it('estimates a 120 BPM click track within ±2 BPM', () => {
    const { novelty, hopSec } = makeClickFixture(0.5, 8);
    const { bpm, periodSec } = estimateTempo(novelty, hopSec);
    expect(Math.abs(bpm - 120)).toBeLessThanOrEqual(2);
    expect(periodSec).toBeCloseTo(60 / bpm, 12);
  });

  it('estimates a 90 BPM click track within ±2 BPM', () => {
    const { novelty, hopSec } = makeClickFixture(60 / 90, 8);
    const { bpm } = estimateTempo(novelty, hopSec);
    expect(Math.abs(bpm - 90)).toBeLessThanOrEqual(2);
  });

  it('octave-corrects a 200 BPM click train down into the preferred 90-180 range', () => {
    const { novelty, hopSec } = makeClickFixture(0.3, 8);
    const { bpm } = estimateTempo(novelty, hopSec);
    expect(Math.abs(bpm - 100)).toBeLessThanOrEqual(2);
  });

  it('octave-corrects an 80 BPM strong/weak pattern up to 160 BPM', () => {
    // Alternating strong/weak clicks every 0.375 s: raw autocorrelation peaks
    // at the 0.75 s strong-click period (80 BPM), but the half-lag candidate
    // is comparably strong and inside 90-180, so 160 BPM wins.
    const { novelty, hopSec } = makeClickFixture(0.375, 9, [1, 0.45]);
    const { bpm } = estimateTempo(novelty, hopSec);
    expect(Math.abs(bpm - 160)).toBeLessThanOrEqual(3);
  });

  it('keeps a true 60 BPM track at 60 (no support for the double tempo)', () => {
    const { novelty, hopSec } = makeClickFixture(1.0, 10);
    const { bpm } = estimateTempo(novelty, hopSec);
    expect(Math.abs(bpm - 60)).toBeLessThanOrEqual(2);
  });

  it('falls back to the default tempo for flat or too-short curves', () => {
    const hopSec = 512 / SAMPLE_RATE;
    expect(estimateTempo(new Float64Array(1000), hopSec).bpm).toBe(DEFAULT_BPM);
    expect(estimateTempo(new Float64Array(10).fill(0.5), hopSec).bpm).toBe(DEFAULT_BPM);
  });

  it('is deterministic', () => {
    const { novelty, hopSec } = makeClickFixture(0.5, 6);
    expect(estimateTempo(novelty, hopSec)).toEqual(estimateTempo(novelty, hopSec));
  });
});

describe('deriveBeatPhase', () => {
  it('rejects an invalid period', () => {
    expect(() => deriveBeatPhase([], 0)).toThrow(RangeError);
    expect(() => deriveBeatPhase([], Number.NaN)).toThrow(RangeError);
  });

  it('returns phase 0 when there are no onsets', () => {
    expect(deriveBeatPhase([], 0.5)).toBe(0);
  });

  it('locks onto the common offset of periodic onsets', () => {
    const onsets: Onset[] = [0.26, 0.76, 1.26, 1.76].map((time) => ({
      time,
      strength: 1,
      band: 'bass',
    }));
    const phase = deriveBeatPhase(onsets, 0.5);
    expect(Math.abs(phase - 0.26)).toBeLessThanOrEqual(0.01);
  });
});

describe('buildBeatGrid', () => {
  it('rejects invalid inputs', () => {
    expect(() => buildBeatGrid(0, 0, 10)).toThrow(RangeError);
    expect(() => buildBeatGrid(0, Number.NaN, 10)).toThrow(RangeError);
    expect(() => buildBeatGrid(-0.1, 0.5, 10)).toThrow(RangeError);
  });

  it('emits beats at phase + k * period with indexInBar cycling 1..4', () => {
    const beats = buildBeatGrid(0.1, 0.5, 4.85);
    expect(beats).toHaveLength(10);
    beats.forEach((beat, i) => {
      expect(beat.time).toBeCloseTo(0.1 + i * 0.5, 10);
      expect(beat.indexInBar).toBe((i % 4) + 1);
    });
  });

  it('returns an empty grid when the phase lies past the duration', () => {
    expect(buildBeatGrid(1.0, 0.5, 0.5)).toEqual([]);
  });
});

describe('beat grid end-to-end alignment', () => {
  it('aligns beats to a 120 BPM click track within ±40 ms', () => {
    const { novelty, hopSec, curves, durationSec } = makeClickFixture(0.5, 8);
    const { bpm, periodSec } = estimateTempo(novelty, hopSec);
    const bassOnsets = detectOnsets(curves.bass, hopSec, 'bass');
    const phase = deriveBeatPhase(bassOnsets, periodSec);
    const beats = buildBeatGrid(phase, periodSec, durationSec);

    expect(Math.abs(bpm - 120)).toBeLessThanOrEqual(2);
    expect(beats.length).toBeGreaterThanOrEqual(14);
    for (const beat of beats) {
      // Clicks sit on the grid 0.25 + k * 0.5; measure against the nearest one.
      const offset = (beat.time - 0.25) % 0.5;
      const distance = Math.min(Math.abs(offset), Math.abs(0.5 - Math.abs(offset)));
      expect(distance).toBeLessThanOrEqual(0.04);
    }
    beats.forEach((beat, i) => {
      expect(beat.indexInBar).toBe((i % 4) + 1);
    });
  });
});
