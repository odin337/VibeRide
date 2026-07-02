import type { FrequencyBand, Onset } from '@viberide/shared';

export interface OnsetDetectionOptions {
  /** Length (in frames) of the centered sliding window for mean/std stats. */
  readonly windowFrames?: number;
  /** Multiplier k in the adaptive threshold mean + k * std. */
  readonly thresholdK?: number;
  /** Minimum spacing between reported onsets, seconds. */
  readonly minSpacingSec?: number;
}

const DEFAULT_WINDOW_FRAMES = 21;
const DEFAULT_THRESHOLD_K = 1.5;

/** Default minimum inter-onset spacing (100 ms). */
export const DEFAULT_MIN_ONSET_SPACING_SEC = 0.1;

interface Candidate {
  readonly frame: number;
  readonly value: number;
}

/**
 * Peak-picking over a novelty curve. A frame is reported as an onset when it
 * is a strict local maximum AND exceeds the adaptive threshold
 * movingMean + k * movingStd computed over a centered sliding window. Peaks
 * closer together than `minSpacingSec` are merged, keeping the stronger one.
 * Onset strengths are normalized so the strongest onset is exactly 1.
 */
export function detectOnsets(
  novelty: Float64Array,
  hopSec: number,
  band: FrequencyBand,
  options: OnsetDetectionOptions = {},
): Onset[] {
  if (!Number.isFinite(hopSec) || hopSec <= 0) {
    throw new RangeError(`detectOnsets: hopSec must be a positive finite number, got ${hopSec}`);
  }
  const windowFrames = options.windowFrames ?? DEFAULT_WINDOW_FRAMES;
  if (!Number.isInteger(windowFrames) || windowFrames < 1) {
    throw new RangeError(
      `detectOnsets: windowFrames must be a positive integer, got ${windowFrames}`,
    );
  }
  const thresholdK = options.thresholdK ?? DEFAULT_THRESHOLD_K;
  const minSpacingSec = options.minSpacingSec ?? DEFAULT_MIN_ONSET_SPACING_SEC;

  const frameCount = novelty.length;
  const halfWindow = Math.floor(windowFrames / 2);
  const candidates: Candidate[] = [];

  for (let i = 0; i < frameCount; i += 1) {
    const value = novelty[i] as number;
    if (value <= 0) {
      continue;
    }
    // Strict local maximum (plateaus resolve to their first frame).
    const previous = i > 0 ? (novelty[i - 1] as number) : 0;
    const next = i < frameCount - 1 ? (novelty[i + 1] as number) : 0;
    if (value <= previous || value < next) {
      continue;
    }
    // Adaptive threshold from the surrounding window.
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(frameCount - 1, i + halfWindow);
    let sum = 0;
    let sumSq = 0;
    for (let j = start; j <= end; j += 1) {
      const sample = novelty[j] as number;
      sum += sample;
      sumSq += sample * sample;
    }
    const count = end - start + 1;
    const mean = sum / count;
    const variance = Math.max(0, sumSq / count - mean * mean);
    const threshold = mean + thresholdK * Math.sqrt(variance);
    if (value > threshold) {
      candidates.push({ frame: i, value });
    }
  }

  // Enforce minimum inter-onset spacing, keeping the stronger of two rivals.
  const accepted: Candidate[] = [];
  for (const candidate of candidates) {
    const last = accepted[accepted.length - 1];
    if (last !== undefined && (candidate.frame - last.frame) * hopSec < minSpacingSec) {
      if (candidate.value > last.value) {
        accepted[accepted.length - 1] = candidate;
      }
    } else {
      accepted.push(candidate);
    }
  }

  let maxValue = 0;
  for (const candidate of accepted) {
    if (candidate.value > maxValue) {
      maxValue = candidate.value;
    }
  }
  // maxValue > 0 whenever `accepted` is non-empty: candidates require value > 0.
  return accepted.map((candidate) => ({
    time: candidate.frame * hopSec,
    strength: candidate.value / maxValue,
    band,
  }));
}
