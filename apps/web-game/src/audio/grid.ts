/**
 * Pure beat-grid math for the audio layer: quantization of one-shot SFX
 * to the track's subdivision grid, the "heard" playhead position with
 * output-latency compensation, and the crash beat-repeat (stutter) plan
 * that slices the actual track buffer. No Web Audio — everything here is
 * unit-testable; playback.ts/sfx.ts only translate plans into nodes.
 */

/** Duration of one beat at `bpm`, seconds. */
export function secondsPerBeat(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) {
    throw new RangeError(`secondsPerBeat: bpm must be positive and finite, got ${bpm}`);
  }
  return 60 / bpm;
}

/** Epsilon so a position already ON the grid quantizes to itself. */
const GRID_EPSILON_SEC = 1e-9;

/**
 * Song-time of the next grid line at or after `positionSec`, for a grid
 * of `subdivisionsPerBeat` (4 = sixteenth notes at 4/4).
 */
export function nextGridTimeSec(
  positionSec: number,
  bpm: number,
  subdivisionsPerBeat: number,
): number {
  if (!Number.isFinite(subdivisionsPerBeat) || subdivisionsPerBeat <= 0) {
    throw new RangeError(
      `nextGridTimeSec: subdivisionsPerBeat must be positive, got ${subdivisionsPerBeat}`,
    );
  }
  const step = secondsPerBeat(bpm) / subdivisionsPerBeat;
  const index = Math.ceil(Math.max(0, positionSec) / step - GRID_EPSILON_SEC);
  // `index` can be -0 (ceil of a tiny negative) — normalize to +0.
  return index <= 0 ? 0 : index * step;
}

/**
 * The playhead position the listener actually HEARS: samples scheduled at
 * context time T become audible at T + outputLatency. Clamped at 0.
 */
export function heardPositionSec(
  ctxTimeSec: number,
  startedAtCtxSec: number,
  outputLatencySec: number,
): number {
  return Math.max(0, ctxTimeSec - startedAtCtxSec - Math.max(0, outputLatencySec));
}

/** One slice of the crash beat-repeat: replay of a buffer segment. */
export interface StutterSlice {
  /** When to start the slice, seconds relative to "now". */
  readonly atSec: number;
  /** Buffer offset the slice starts from, seconds. */
  readonly offsetSec: number;
  /** Slice length, seconds. */
  readonly durationSec: number;
  /** Static playback rate; the glue ramps the last slice down to ~0 (tape stop). */
  readonly playbackRate: number;
  readonly gain: number;
  /** True for the final tape-stop tail (rate is ramped toward zero). */
  readonly tapeStop: boolean;
}

/**
 * Crash sound design: the music itself "breaks" — the last 1/8 note of
 * the track is repeated three times, shrinking and slowing (DJ stutter),
 * then a tape-stop tail drags it to silence. Pure plan; deterministic.
 */
export function crashStutterPlan(positionSec: number, bpm: number): readonly StutterSlice[] {
  const eighth = secondsPerBeat(bpm) / 2;
  const offsetSec = Math.max(0, positionSec - eighth);
  return [
    { atSec: 0, offsetSec, durationSec: eighth, playbackRate: 1, gain: 0.9, tapeStop: false },
    {
      atSec: eighth,
      offsetSec,
      durationSec: eighth / 2,
      playbackRate: 0.85,
      gain: 0.7,
      tapeStop: false,
    },
    {
      atSec: eighth * 1.5,
      offsetSec,
      durationSec: eighth / 2,
      playbackRate: 0.7,
      gain: 0.5,
      tapeStop: false,
    },
    {
      atSec: eighth * 2,
      offsetSec,
      durationSec: eighth * 2,
      playbackRate: 0.55,
      gain: 0.4,
      tapeStop: true,
    },
  ];
}

/** Music duck applied when a note is missed — the track "stumbles". */
export const MISS_DUCK = {
  /** Gain the music dips to. */
  dipGain: 0.35,
  /** How fast the dip hits, seconds. */
  attackSec: 0.02,
  /** How long until the music is back at full level, seconds. */
  releaseSec: 0.25,
} as const;

/** Arrangement intensity from the current combo (Piano-Tiles layers). */
export function intensityFromCombo(combo: number): 0 | 1 | 2 {
  if (combo >= 16) {
    return 2;
  }
  return combo >= 8 ? 1 : 0;
}
