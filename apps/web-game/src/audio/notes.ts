/**
 * Pure note-selection and envelope data for the synthesized SFX. The
 * Web Audio glue in sfx.ts reads these; keeping them here makes the
 * musical behaviour unit-testable without an AudioContext.
 */

/** C-major pentatonic (C5 D5 E5 G5 A5) — collect plucks cycle through it. */
export const PENTATONIC_HZ: readonly number[] = [523.25, 587.33, 659.25, 783.99, 880];

/** Equal-temperament transposition: `rootHz` shifted by `semitones`. */
export function transposeHz(rootHz: number, semitones: number): number {
  return rootHz * 2 ** (semitones / 12);
}

/**
 * Frequency of the Nth collect pluck (0-based), cycling the pentatonic.
 * Every full combo octave (16+) lifts the melody an octave — the streak
 * is audible, Piano-Tiles style.
 */
export function collectNoteHz(pickupIndex: number, combo = 0): number {
  const size = PENTATONIC_HZ.length;
  const index = ((pickupIndex % size) + size) % size;
  const base = PENTATONIC_HZ[index] ?? 523.25;
  return combo >= 16 ? base * 2 : base;
}

export interface BlipSpec {
  readonly startHz: number;
  readonly endHz: number;
  readonly durationSec: number;
  readonly peakGain: number;
}

/** Rising blip played on jump. */
export const JUMP_BLIP: BlipSpec = { startHz: 320, endHz: 720, durationSec: 0.12, peakGain: 0.25 };

/** Short pluck envelope used for collect notes. */
export const COLLECT_PLUCK = { durationSec: 0.18, peakGain: 0.3 } as const;

/** Noise burst played on crash. */
export const CRASH_BURST = { durationSec: 0.4, peakGain: 0.5 } as const;

/** Filtered saw drone sustained while boost is active. */
export const BOOST_DRONE = { frequencyHz: 92, filterHz: 900, gain: 0.12 } as const;

/** Low thump accenting a landing, quantized to the sixteenth grid. */
export const LAND_THUMP: BlipSpec = { startHz: 180, endHz: 70, durationSec: 0.1, peakGain: 0.3 };

/** Short falling scratch marking a missed note. */
export const MISS_SCRATCH: BlipSpec = {
  startHz: 420,
  endHz: 140,
  durationSec: 0.14,
  peakGain: 0.18,
};

/** SFX quantization grid: subdivisions per beat (4 = sixteenths). */
export const SFX_GRID_SUBDIVISIONS = 4;
