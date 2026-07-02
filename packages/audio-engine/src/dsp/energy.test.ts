import { describe, expect, it } from 'vitest';

import { silence, steppedAmplitudeSine } from '../testing/signals';
import { computeEnergyEnvelope, ENERGY_BLOCK_SEC } from './energy';

const SAMPLE_RATE = 44100;

describe('computeEnergyEnvelope', () => {
  it('rejects invalid sample rates', () => {
    const pcm = new Float32Array(100);
    expect(() => computeEnergyEnvelope(pcm, 0)).toThrow(RangeError);
    expect(() => computeEnergyEnvelope(pcm, -1)).toThrow(RangeError);
    expect(() => computeEnergyEnvelope(pcm, Number.NaN)).toThrow(RangeError);
  });

  it('returns an empty envelope for empty PCM', () => {
    expect(computeEnergyEnvelope(new Float32Array(0), SAMPLE_RATE)).toEqual([]);
  });

  it('tracks amplitude modulation: quiet segments stay below loud segments', () => {
    // 4 one-second segments: loud, quiet, loud, quiet.
    const pcm = steppedAmplitudeSine({
      frequencyHz: 220,
      sampleRate: SAMPLE_RATE,
      segmentSec: 1,
      segmentAmplitudes: [0.9, 0.15, 0.9, 0.15],
    });
    const points = computeEnergyEnvelope(pcm, SAMPLE_RATE);
    expect(points).toHaveLength(16);

    const loud = points.filter((point) => Math.floor(point.time) % 2 === 0);
    const quiet = points.filter((point) => Math.floor(point.time) % 2 === 1);
    expect(loud).toHaveLength(8);
    expect(quiet).toHaveLength(8);
    const minLoud = Math.min(...loud.map((point) => point.energy));
    const maxQuiet = Math.max(...quiet.map((point) => point.energy));
    expect(minLoud).toBeGreaterThan(0.9);
    expect(maxQuiet).toBeLessThan(0.3);
    expect(maxQuiet).toBeLessThan(minLoud);
  });

  it('normalizes the loudest block to exactly 1 and keeps all points in [0, 1]', () => {
    const pcm = steppedAmplitudeSine({
      frequencyHz: 220,
      sampleRate: SAMPLE_RATE,
      segmentSec: 0.5,
      segmentAmplitudes: [0.3, 0.9],
    });
    const points = computeEnergyEnvelope(pcm, SAMPLE_RATE);
    expect(Math.max(...points.map((point) => point.energy))).toBe(1);
    for (const point of points) {
      expect(point.energy).toBeGreaterThanOrEqual(0);
      expect(point.energy).toBeLessThanOrEqual(1);
    }
  });

  it('timestamps points at ~250 ms block centers', () => {
    const pcm = silence(1, SAMPLE_RATE);
    const points = computeEnergyEnvelope(pcm, SAMPLE_RATE);
    expect(points).toHaveLength(4);
    points.forEach((point, i) => {
      expect(point.time).toBeCloseTo((i + 0.5) * ENERGY_BLOCK_SEC, 6);
    });
  });

  it('keeps a fully silent signal at zero energy', () => {
    const points = computeEnergyEnvelope(silence(1, SAMPLE_RATE), SAMPLE_RATE);
    for (const point of points) {
      expect(point.energy).toBe(0);
    }
  });

  it('covers a trailing partial block with its own center timestamp', () => {
    const pcm = silence(0.6, SAMPLE_RATE);
    const points = computeEnergyEnvelope(pcm, SAMPLE_RATE);
    expect(points).toHaveLength(3);
    expect(points[2]!.time).toBeCloseTo(0.55, 6);
  });

  it('clamps the block size to at least one sample for tiny sample rates', () => {
    const points = computeEnergyEnvelope(new Float32Array([0.5, -0.5, 0.5]), 1);
    expect(points).toHaveLength(3);
  });
});
