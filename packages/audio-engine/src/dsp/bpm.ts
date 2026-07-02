import type { Beat, Onset } from '@viberide/shared';

/** Search range for tempo estimation, BPM. */
export const MIN_BPM = 60;
export const MAX_BPM = 200;

/** Octave-error correction prefers tempi inside this range. */
export const PREFERRED_MIN_BPM = 90;
export const PREFERRED_MAX_BPM = 180;

/** Reported when the novelty curve carries no periodicity at all (silence). */
export const DEFAULT_BPM = 120;

/**
 * An out-of-preferred-range peak is replaced by its half/double-lag neighbour
 * when the neighbour scores at least this fraction of the raw winner.
 */
const OCTAVE_PREFERENCE_RATIO = 0.7;

/** Beat-phase search resolution: candidate phases per beat period. */
const PHASE_SUBDIVISIONS = 64;

/** Alignment kernel half-width as a fraction of the beat period. */
const PHASE_TOLERANCE_FRACTION = 0.125;

export interface TempoEstimate {
  /** Estimated tempo, rounded to 2 decimals. */
  readonly bpm: number;
  /** Beat period in seconds, exactly 60 / bpm. */
  readonly periodSec: number;
}

/** Mean-normalized autocorrelation of `curve` at an integer lag. */
function autocorrelation(curve: Float64Array, lag: number): number {
  const n = curve.length - lag;
  if (n <= 0) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    sum += (curve[i] as number) * (curve[i + lag] as number);
  }
  return sum / n;
}

/**
 * Parabolic interpolation of the peak position from three neighbouring
 * autocorrelation values. Returns a sub-frame offset clamped to [-0.5, 0.5].
 */
function parabolicOffset(left: number, center: number, right: number): number {
  const denominator = left - 2 * center + right;
  if (denominator === 0) {
    return 0;
  }
  const offset = (0.5 * (left - right)) / denominator;
  return Math.min(0.5, Math.max(-0.5, offset));
}

/**
 * Tempo estimation by autocorrelation of the summed novelty curve over lags
 * corresponding to 60-200 BPM.
 *
 * Octave-error correction: when the raw winner falls outside 90-180 BPM but
 * its half/double-lag counterpart lies inside and scores comparably
 * (>= OCTAVE_PREFERENCE_RATIO of the winner), the in-range candidate wins.
 * The final integer lag is refined with parabolic interpolation. Deterministic
 * float math only — no randomness, no environment-dependent operations.
 */
export function estimateTempo(novelty: Float64Array, hopSec: number): TempoEstimate {
  if (!Number.isFinite(hopSec) || hopSec <= 0) {
    throw new RangeError(`estimateTempo: hopSec must be a positive finite number, got ${hopSec}`);
  }
  const minLag = Math.max(1, Math.ceil(60 / (MAX_BPM * hopSec)));
  const maxLag = Math.floor(60 / (MIN_BPM * hopSec));

  const scores = new Map<number, number>();
  const scoreAt = (lag: number): number => {
    let score = scores.get(lag);
    if (score === undefined) {
      score = autocorrelation(novelty, lag);
      scores.set(lag, score);
    }
    return score;
  };

  let bestLag = 0;
  let bestScore = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    const score = scoreAt(lag);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (bestLag === 0 || bestScore <= 0) {
    // Flat novelty curve (silence or too little material): fixed fallback.
    return { bpm: DEFAULT_BPM, periodSec: 60 / DEFAULT_BPM };
  }

  const bpmOf = (lag: number): number => 60 / (lag * hopSec);

  // Octave-error correction toward the preferred 90-180 BPM range.
  if (bpmOf(bestLag) < PREFERRED_MIN_BPM) {
    // Too slow: the half lag doubles the tempo.
    const lower = Math.floor(bestLag / 2);
    const upper = Math.ceil(bestLag / 2);
    let candidate = 0;
    let candidateScore = 0;
    for (const lag of lower === upper ? [lower] : [lower, upper]) {
      if (lag >= minLag && scoreAt(lag) > candidateScore) {
        candidateScore = scoreAt(lag);
        candidate = lag;
      }
    }
    if (candidate !== 0 && candidateScore >= OCTAVE_PREFERENCE_RATIO * bestScore) {
      bestLag = candidate;
    }
  } else if (bpmOf(bestLag) > PREFERRED_MAX_BPM) {
    // Too fast: the double lag halves the tempo.
    const candidate = bestLag * 2;
    if (candidate <= maxLag && scoreAt(candidate) >= OCTAVE_PREFERENCE_RATIO * bestScore) {
      bestLag = candidate;
    }
  }

  // Sub-frame refinement around the final integer lag.
  const offset = parabolicOffset(
    scoreAt(Math.max(1, bestLag - 1)),
    scoreAt(bestLag),
    scoreAt(bestLag + 1),
  );
  const refinedLag = bestLag + offset;
  const bpm = Math.round(bpmOf(refinedLag) * 100) / 100;
  return { bpm, periodSec: 60 / bpm };
}

/**
 * Finds the beat grid phase in [0, periodSec) that maximizes alignment with
 * the given onsets. Each candidate phase is scored by summing onset strengths
 * weighted with a triangular kernel over the circular distance between the
 * onset time (mod period) and the phase. Ties resolve to the smallest phase,
 * keeping the result deterministic.
 */
export function deriveBeatPhase(onsets: readonly Onset[], periodSec: number): number {
  if (!Number.isFinite(periodSec) || periodSec <= 0) {
    throw new RangeError(
      `deriveBeatPhase: periodSec must be a positive finite number, got ${periodSec}`,
    );
  }
  if (onsets.length === 0) {
    return 0;
  }
  const tolerance = periodSec * PHASE_TOLERANCE_FRACTION;
  let bestPhase = 0;
  let bestScore = -1;
  for (let step = 0; step < PHASE_SUBDIVISIONS; step += 1) {
    const phase = (step / PHASE_SUBDIVISIONS) * periodSec;
    let score = 0;
    for (const onset of onsets) {
      const wrapped = (((onset.time - phase) % periodSec) + periodSec) % periodSec;
      const distance = Math.min(wrapped, periodSec - wrapped);
      if (distance < tolerance) {
        score += onset.strength * (1 - distance / tolerance);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestPhase = phase;
    }
  }
  return bestPhase;
}

/**
 * Emits the metrical beat grid: beats at phase + k * period for every k with
 * a time inside [0, durationSec], with indexInBar cycling 1..4 (4/4 assumed).
 * Times are computed as phase + k * period (never accumulated) so no float
 * drift can creep in.
 */
export function buildBeatGrid(phaseSec: number, periodSec: number, durationSec: number): Beat[] {
  if (!Number.isFinite(periodSec) || periodSec <= 0) {
    throw new RangeError(
      `buildBeatGrid: periodSec must be a positive finite number, got ${periodSec}`,
    );
  }
  if (!Number.isFinite(phaseSec) || phaseSec < 0) {
    throw new RangeError(`buildBeatGrid: phaseSec must be non-negative, got ${phaseSec}`);
  }
  const beats: Beat[] = [];
  for (let k = 0; ; k += 1) {
    const time = phaseSec + k * periodSec;
    if (time > durationSec) {
      break;
    }
    beats.push({ time, indexInBar: (k % 4) + 1 });
  }
  return beats;
}
