/**
 * Pure note-selection and envelope data for the synthesized SFX. The
 * Web Audio glue in sfx.ts reads these; keeping them here makes the
 * musical behaviour unit-testable without an AudioContext.
 */

/** C-major pentatonic (C5 D5 E5 G5 A5) — collect plucks cycle through it. */
export const PENTATONIC_HZ: readonly number[] = [523.25, 587.33, 659.25, 783.99, 880];

/** Frequency of the Nth collect pluck (0-based), cycling the pentatonic. */
export function collectNoteHz(pickupIndex: number): number {
  const size = PENTATONIC_HZ.length;
  const index = ((pickupIndex % size) + size) % size;
  return PENTATONIC_HZ[index] ?? 523.25;
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
