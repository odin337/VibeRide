import { createPrng } from '@viberide/shared';

/**
 * Deterministic synthetic-signal factories for the DSP test-suite. Everything
 * here is seeded / closed-form, so the same options always produce the same
 * samples on every platform.
 */

export interface SineOptions {
  readonly frequencyHz: number;
  readonly durationSec: number;
  readonly sampleRate: number;
  /** Peak amplitude, defaults to 1. */
  readonly amplitude?: number;
}

/** Pure sine tone. */
export function sine(options: SineOptions): Float32Array {
  const { frequencyHz, durationSec, sampleRate } = options;
  const amplitude = options.amplitude ?? 1;
  const length = Math.round(durationSec * sampleRate);
  const out = new Float32Array(length);
  const step = (2 * Math.PI * frequencyHz) / sampleRate;
  for (let i = 0; i < length; i += 1) {
    out[i] = amplitude * Math.sin(step * i);
  }
  return out;
}

/** All-zero PCM. */
export function silence(durationSec: number, sampleRate: number): Float32Array {
  return new Float32Array(Math.round(durationSec * sampleRate));
}

export interface ClickTrackOptions {
  /** Seconds between click starts. */
  readonly intervalSec: number;
  readonly durationSec: number;
  readonly sampleRate: number;
  /** Offset of the first click, seconds. Defaults to 0. */
  readonly startSec?: number;
  /** Length of each click burst, seconds. Defaults to 10 ms. */
  readonly clickDurationSec?: number;
  /** PRNG seed for the broadband noise bursts. Defaults to 1. */
  readonly seed?: number;
  /** Per-click peak amplitudes, cycled in order. Defaults to a constant 1. */
  readonly amplitudes?: readonly number[];
}

/** Start times of every click that fits inside the track. */
export function clickTimes(options: ClickTrackOptions): number[] {
  const start = options.startSec ?? 0;
  const times: number[] = [];
  for (let k = 0; ; k += 1) {
    const time = start + k * options.intervalSec;
    if (time >= options.durationSec) {
      return times;
    }
    times.push(time);
  }
}

/**
 * Periodic broadband clicks: short exponentially-decaying white-noise bursts
 * (deterministic via the shared mulberry32 PRNG) over silence. Noise covers
 * all three analysis bands, so every click excites bass, mid and high flux.
 */
export function clickTrack(options: ClickTrackOptions): Float32Array {
  const { sampleRate } = options;
  const clickDurationSec = options.clickDurationSec ?? 0.01;
  const amplitudes = options.amplitudes ?? [1];
  if (amplitudes.length === 0) {
    throw new RangeError('clickTrack: amplitudes must not be empty');
  }
  const length = Math.round(options.durationSec * sampleRate);
  const out = new Float32Array(length);
  const rng = createPrng(options.seed ?? 1);
  const clickSamples = Math.max(1, Math.round(clickDurationSec * sampleRate));
  const decayTau = clickSamples / 4;
  const times = clickTimes(options);
  for (let click = 0; click < times.length; click += 1) {
    const amplitude = amplitudes[click % amplitudes.length] as number;
    const startSample = Math.round((times[click] as number) * sampleRate);
    for (let i = 0; i < clickSamples; i += 1) {
      const index = startSample + i;
      if (index >= length) {
        break;
      }
      out[index] = amplitude * Math.exp(-i / decayTau) * (rng() * 2 - 1);
    }
  }
  return out;
}

export interface SteppedAmplitudeSineOptions {
  readonly frequencyHz: number;
  readonly sampleRate: number;
  /** Length of each constant-amplitude segment, seconds. */
  readonly segmentSec: number;
  /** Peak amplitude of each consecutive segment. */
  readonly segmentAmplitudes: readonly number[];
}

/**
 * Sine carrier whose amplitude steps through `segmentAmplitudes` — an
 * amplitude-modulated tone for energy-envelope tests.
 */
export function steppedAmplitudeSine(options: SteppedAmplitudeSineOptions): Float32Array {
  const { frequencyHz, sampleRate, segmentSec, segmentAmplitudes } = options;
  if (segmentAmplitudes.length === 0) {
    throw new RangeError('steppedAmplitudeSine: segmentAmplitudes must not be empty');
  }
  const segmentSamples = Math.round(segmentSec * sampleRate);
  const length = segmentSamples * segmentAmplitudes.length;
  const out = new Float32Array(length);
  const step = (2 * Math.PI * frequencyHz) / sampleRate;
  for (let i = 0; i < length; i += 1) {
    const segment = Math.min(segmentAmplitudes.length - 1, Math.floor(i / segmentSamples));
    out[i] = (segmentAmplitudes[segment] as number) * Math.sin(step * i);
  }
  return out;
}
