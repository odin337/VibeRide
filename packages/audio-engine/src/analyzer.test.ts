import { describe, expect, it } from 'vitest';
import { FREQUENCY_BANDS } from '@viberide/shared';

import { analyzePcm } from './analyzer';
import { clickTrack } from './testing/signals';

const SAMPLE_RATE = 44100;
const AUDIO_HASH = 'a'.repeat(64);

function makeTrack(): Float32Array {
  return clickTrack({
    intervalSec: 0.5,
    durationSec: 6,
    sampleRate: SAMPLE_RATE,
    startSec: 0.25,
    seed: 11,
  });
}

describe('analyzePcm', () => {
  it('rejects empty PCM', () => {
    expect(() => analyzePcm(new Float32Array(0), SAMPLE_RATE, AUDIO_HASH)).toThrow(/empty/);
  });

  it('rejects invalid sample rates', () => {
    const pcm = new Float32Array(1024);
    expect(() => analyzePcm(pcm, 0, AUDIO_HASH)).toThrow(RangeError);
    expect(() => analyzePcm(pcm, -44100, AUDIO_HASH)).toThrow(RangeError);
    expect(() => analyzePcm(pcm, Number.NaN, AUDIO_HASH)).toThrow(RangeError);
  });

  it('rejects malformed audio hashes', () => {
    const pcm = new Float32Array(1024);
    expect(() => analyzePcm(pcm, SAMPLE_RATE, 'not-a-hash')).toThrow(/sha-256/);
    expect(() => analyzePcm(pcm, SAMPLE_RATE, 'A'.repeat(64))).toThrow(/sha-256/);
    expect(() => analyzePcm(pcm, SAMPLE_RATE, '')).toThrow(/sha-256/);
  });

  it('produces a structurally complete BeatMap', () => {
    const pcm = makeTrack();
    const beatMap = analyzePcm(pcm, SAMPLE_RATE, AUDIO_HASH);

    expect(beatMap.version).toBe(1);
    expect(beatMap.audioHash).toBe(AUDIO_HASH);
    expect(beatMap.sampleRate).toBe(SAMPLE_RATE);
    expect(beatMap.durationSec).toBeCloseTo(6, 6);
    expect(Math.abs(beatMap.bpm - 120)).toBeLessThanOrEqual(2);
    expect(beatMap.beats.length).toBeGreaterThan(0);
    expect(beatMap.onsets.length).toBeGreaterThan(0);
    expect(beatMap.energy.length).toBeGreaterThan(0);
  });

  it('emits onsets sorted by time with normalized strengths in every band', () => {
    const beatMap = analyzePcm(makeTrack(), SAMPLE_RATE, AUDIO_HASH);
    for (let i = 1; i < beatMap.onsets.length; i += 1) {
      expect(beatMap.onsets[i]!.time).toBeGreaterThanOrEqual(beatMap.onsets[i - 1]!.time);
    }
    for (const band of FREQUENCY_BANDS) {
      const bandOnsets = beatMap.onsets.filter((onset) => onset.band === band);
      expect(bandOnsets.length).toBeGreaterThan(0);
      expect(Math.max(...bandOnsets.map((onset) => onset.strength))).toBe(1);
    }
  });

  it('cycles indexInBar 1..4 across the beat grid', () => {
    const beatMap = analyzePcm(makeTrack(), SAMPLE_RATE, AUDIO_HASH);
    beatMap.beats.forEach((beat, i) => {
      expect(beat.indexInBar).toBe((i % 4) + 1);
    });
  });

  it('is deterministic: the same PCM twice yields a deep-equal BeatMap', () => {
    const pcm = makeTrack();
    const first = analyzePcm(pcm, SAMPLE_RATE, AUDIO_HASH);
    const second = analyzePcm(pcm, SAMPLE_RATE, AUDIO_HASH);
    expect(second).toEqual(first);
    // Serialized forms match bit-for-bit too.
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('is deterministic across an independent copy of the samples', () => {
    const pcm = makeTrack();
    const copy = new Float32Array(pcm);
    expect(analyzePcm(copy, SAMPLE_RATE, AUDIO_HASH)).toEqual(
      analyzePcm(pcm, SAMPLE_RATE, AUDIO_HASH),
    );
  });

  it('analyzes silence without producing onsets or beats-breaking values', () => {
    const beatMap = analyzePcm(new Float32Array(SAMPLE_RATE * 2), SAMPLE_RATE, AUDIO_HASH);
    expect(beatMap.onsets).toEqual([]);
    expect(beatMap.bpm).toBeGreaterThan(0);
    for (const point of beatMap.energy) {
      expect(point.energy).toBe(0);
    }
  });
});
