import { describe, expect, it } from 'vitest';

import { clickTimes, clickTrack, silence, sine, steppedAmplitudeSine } from './signals';

const SAMPLE_RATE = 44100;

function countZeroCrossings(pcm: Float32Array): number {
  let crossings = 0;
  for (let i = 1; i < pcm.length; i += 1) {
    const previous = pcm[i - 1] as number;
    const current = pcm[i] as number;
    if ((previous >= 0 && current < 0) || (previous < 0 && current >= 0)) {
      crossings += 1;
    }
  }
  return crossings;
}

describe('sine', () => {
  it('produces the requested length and respects the amplitude bound', () => {
    const pcm = sine({ frequencyHz: 440, durationSec: 0.5, sampleRate: SAMPLE_RATE });
    expect(pcm).toHaveLength(22050);
    for (const sample of pcm) {
      expect(Math.abs(sample)).toBeLessThanOrEqual(1);
    }
  });

  it('oscillates at the requested frequency (zero-crossing count)', () => {
    const pcm = sine({
      frequencyHz: 100,
      durationSec: 1,
      sampleRate: SAMPLE_RATE,
      amplitude: 0.5,
    });
    // A 100 Hz sine crosses zero ~200 times per second.
    expect(Math.abs(countZeroCrossings(pcm) - 200)).toBeLessThanOrEqual(2);
    expect(Math.max(...pcm)).toBeCloseTo(0.5, 3);
  });
});

describe('silence', () => {
  it('is all zeros with the right length', () => {
    const pcm = silence(0.25, SAMPLE_RATE);
    expect(pcm).toHaveLength(11025);
    expect(pcm.every((sample) => sample === 0)).toBe(true);
  });
});

describe('clickTimes', () => {
  it('lists every click start inside the track', () => {
    expect(
      clickTimes({ intervalSec: 0.5, durationSec: 2, sampleRate: SAMPLE_RATE, startSec: 0.25 }),
    ).toEqual([0.25, 0.75, 1.25, 1.75]);
  });

  it('defaults the first click to t = 0', () => {
    expect(clickTimes({ intervalSec: 1, durationSec: 2.5, sampleRate: SAMPLE_RATE })).toEqual([
      0, 1, 2,
    ]);
  });
});

describe('clickTrack', () => {
  it('is deterministic for identical options', () => {
    const options = {
      intervalSec: 0.5,
      durationSec: 2,
      sampleRate: SAMPLE_RATE,
      startSec: 0.25,
      seed: 42,
    };
    expect(clickTrack(options)).toEqual(clickTrack(options));
  });

  it('defaults to seed 1 when no seed is given', () => {
    const options = { intervalSec: 0.5, durationSec: 1, sampleRate: SAMPLE_RATE };
    expect(clickTrack(options)).toEqual(clickTrack({ ...options, seed: 1 }));
  });

  it('places energy only inside click bursts', () => {
    const clickDurationSec = 0.02;
    const pcm = clickTrack({
      intervalSec: 0.5,
      durationSec: 2,
      sampleRate: SAMPLE_RATE,
      startSec: 0.25,
      clickDurationSec,
      seed: 9,
    });
    expect(pcm).toHaveLength(SAMPLE_RATE * 2);
    const clickSamples = Math.round(clickDurationSec * SAMPLE_RATE);
    for (let i = 0; i < pcm.length; i += 1) {
      const sample = pcm[i] as number;
      if (sample === 0) {
        continue;
      }
      const timeSinceStart = (i / SAMPLE_RATE - 0.25) % 0.5;
      const insideBurst = timeSinceStart >= 0 && timeSinceStart <= clickSamples / SAMPLE_RATE;
      expect(insideBurst).toBe(true);
    }
  });

  it('cycles per-click amplitudes', () => {
    const pcm = clickTrack({
      intervalSec: 0.5,
      durationSec: 1,
      sampleRate: SAMPLE_RATE,
      seed: 4,
      amplitudes: [1, 0.2],
    });
    const secondStart = Math.round(0.5 * SAMPLE_RATE);
    const firstClick = pcm.slice(0, 1000);
    const secondClick = pcm.slice(secondStart, secondStart + 1000);
    const peak = (chunk: Float32Array): number => Math.max(...Array.from(chunk).map(Math.abs));
    expect(peak(secondClick)).toBeLessThan(peak(firstClick) * 0.5);
  });

  it('rejects an empty amplitudes list', () => {
    expect(() =>
      clickTrack({
        intervalSec: 0.5,
        durationSec: 1,
        sampleRate: SAMPLE_RATE,
        amplitudes: [],
      }),
    ).toThrow(RangeError);
  });

  it('truncates a click that runs past the end of the track', () => {
    const pcm = clickTrack({
      intervalSec: 0.4,
      durationSec: 1,
      sampleRate: SAMPLE_RATE,
      startSec: 0.995,
      seed: 2,
    });
    expect(pcm).toHaveLength(SAMPLE_RATE);
    // The click started 5 ms before the end, so the tail is cut off cleanly.
    expect(Math.abs(pcm[pcm.length - 1] as number)).toBeGreaterThan(0);
  });
});

describe('steppedAmplitudeSine', () => {
  it('steps through the segment amplitudes', () => {
    const pcm = steppedAmplitudeSine({
      frequencyHz: 220,
      sampleRate: SAMPLE_RATE,
      segmentSec: 0.5,
      segmentAmplitudes: [1, 0.1],
    });
    expect(pcm).toHaveLength(SAMPLE_RATE);
    const loudPeak = Math.max(...Array.from(pcm.slice(0, 22050)).map(Math.abs));
    const quietPeak = Math.max(...Array.from(pcm.slice(22050)).map(Math.abs));
    expect(loudPeak).toBeCloseTo(1, 2);
    expect(quietPeak).toBeCloseTo(0.1, 2);
  });

  it('rejects an empty amplitude list', () => {
    expect(() =>
      steppedAmplitudeSine({
        frequencyHz: 220,
        sampleRate: SAMPLE_RATE,
        segmentSec: 0.5,
        segmentAmplitudes: [],
      }),
    ).toThrow(RangeError);
  });
});
