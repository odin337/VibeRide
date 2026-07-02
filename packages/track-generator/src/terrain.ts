import { createPrng, HEIGHTFIELD_STEP_M, WORLD_SPEED_BASE } from '@viberide/shared';
import type { BeatMap, EnergyPoint, Prng, TrackPoint } from '@viberide/shared';

/** First metres of every track are perfectly flat at y = 0 (safe spawn). */
export const SPAWN_FLAT_M = 10;

/** Noise amplitude fades in over this many metres after the flat spawn. */
export const TERRAIN_FADE_IN_M = 10;

/** Lowest playable terrain height, metres. */
export const TERRAIN_MIN_Y = -3;

/** Highest playable terrain height, metres. */
export const TERRAIN_MAX_Y = 6;

/**
 * Maximum |dy/dx| of the final heightfield (rise over run). 0.6 ≈ 31°:
 * steep enough for dramatic hills yet comfortably below the grade at
 * which the car at WORLD_SPEED_BASE stops making forward progress.
 * Enforced by a deterministic forward clamping pass over the samples
 * (max |Δy| per step = MAX_TERRAIN_SLOPE · HEIGHTFIELD_STEP_M = 0.3 m)
 * and re-checked by validatePlayability.
 */
export const MAX_TERRAIN_SLOPE = 0.6;

/** Energy assumed when a BeatMap carries no energy envelope samples. */
export const DEFAULT_ENERGY = 0.5;

/** Energy 0 keeps this fraction of the base amplitude; energy 1 keeps all of it. */
const ENERGY_AMPLITUDE_FLOOR = 0.25;

interface NoiseOctaveSpec {
  readonly wavelengthM: number;
  readonly amplitudeM: number;
}

/** Layered value-noise octaves; total base amplitude 4.2 m before clamping. */
const OCTAVES: readonly NoiseOctaveSpec[] = [
  { wavelengthM: 32, amplitudeM: 2.4 },
  { wavelengthM: 16, amplitudeM: 1.2 },
  { wavelengthM: 8, amplitudeM: 0.6 },
];

interface NoiseOctave extends NoiseOctaveSpec {
  readonly lattice: readonly number[];
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Precomputes one lattice of uniform values in [-1, 1) per octave.
 * Octaves consume the PRNG in a fixed order, which is what makes the
 * terrain a pure function of (seed, BeatMap).
 */
function buildOctaves(rng: Prng, lengthM: number): NoiseOctave[] {
  return OCTAVES.map((spec) => {
    const latticeSize = Math.ceil(lengthM / spec.wavelengthM) + 2;
    const lattice = Array.from({ length: latticeSize }, () => rng() * 2 - 1);
    return { ...spec, lattice };
  });
}

/** Value noise: smooth interpolation between the two nearest lattice values. */
function sampleOctave(octave: NoiseOctave, x: number): number {
  const u = x / octave.wavelengthM;
  const index = Math.floor(u);
  const t = smoothstep(u - index);
  const v0 = octave.lattice[index] ?? 0;
  const v1 = octave.lattice[index + 1] ?? 0;
  return (v0 + (v1 - v0) * t) * octave.amplitudeM;
}

/**
 * Linearly interpolated energy at `timeSec` over a time-sorted envelope.
 * Clamps to the first/last sample outside the envelope and falls back
 * to DEFAULT_ENERGY for empty envelopes.
 */
export function energyAt(energy: readonly EnergyPoint[], timeSec: number): number {
  const first = energy[0];
  if (!first) {
    return DEFAULT_ENERGY;
  }
  if (timeSec <= first.time) {
    return first.energy;
  }
  let prev = first;
  for (const point of energy) {
    if (point.time >= timeSec) {
      // Loop invariant: prev.time < timeSec ≤ point.time, so the span
      // is strictly positive and the division is safe.
      const span = point.time - prev.time;
      return prev.energy + ((point.energy - prev.energy) * (timeSec - prev.time)) / span;
    }
    prev = point;
  }
  return prev.energy;
}

/**
 * Terrain height at world X via linear interpolation between samples.
 * Clamps outside the sampled range; returns 0 for an empty heightfield.
 */
export function terrainHeightAt(heightfield: readonly TrackPoint[], x: number): number {
  const first = heightfield[0];
  if (!first) {
    return 0;
  }
  if (x <= first.x) {
    return first.y;
  }
  let prev = first;
  for (const point of heightfield) {
    if (point.x >= x) {
      // Loop invariant: prev.x < x ≤ point.x — the span is positive.
      return prev.y + ((point.y - prev.y) * (x - prev.x)) / (point.x - prev.x);
    }
    prev = point;
  }
  return prev.y;
}

/**
 * Generates the heightfield: one sample every HEIGHTFIELD_STEP_M from
 * x = 0 up to lengthM (= durationSec · WORLD_SPEED_BASE). Layered value
 * noise is scaled by the interpolated energy envelope (louder → hillier),
 * kept perfectly flat for the first SPAWN_FLAT_M metres, faded in over
 * TERRAIN_FADE_IN_M, clamped to [TERRAIN_MIN_Y, TERRAIN_MAX_Y] and
 * slope-limited to MAX_TERRAIN_SLOPE. Fully deterministic in (beatMap, seed).
 */
export function generateTerrain(beatMap: BeatMap, seed: number): TrackPoint[] {
  const lengthM = beatMap.durationSec * WORLD_SPEED_BASE;
  const rng = createPrng(seed);
  const octaves = buildOctaves(rng, lengthM);
  const sortedEnergy = [...beatMap.energy].sort((a, b) => a.time - b.time);

  // At least two samples so the engine always has one segment to interpolate.
  const sampleCount = Math.max(Math.floor(lengthM / HEIGHTFIELD_STEP_M + 1e-9) + 1, 2);
  const heights: number[] = [];
  for (let i = 0; i < sampleCount; i += 1) {
    const x = i * HEIGHTFIELD_STEP_M;
    let y = 0;
    if (x > SPAWN_FLAT_M) {
      const fade = smoothstep(Math.min((x - SPAWN_FLAT_M) / TERRAIN_FADE_IN_M, 1));
      const energy = energyAt(sortedEnergy, x / WORLD_SPEED_BASE);
      const energyScale = ENERGY_AMPLITUDE_FLOOR + (1 - ENERGY_AMPLITUDE_FLOOR) * energy;
      let noise = 0;
      for (const octave of octaves) {
        noise += sampleOctave(octave, x);
      }
      y = Math.min(Math.max(noise * energyScale * fade, TERRAIN_MIN_Y), TERRAIN_MAX_Y);
    }
    heights.push(y);
  }

  // Forward slope-limiting pass: clamps each sample relative to the
  // already-fixed previous one, so a single pass enforces the bound
  // everywhere without touching the flat spawn area.
  const maxStepM = MAX_TERRAIN_SLOPE * HEIGHTFIELD_STEP_M;
  let prevY = heights[0] ?? 0;
  for (let i = 1; i < heights.length; i += 1) {
    const current = heights[i] ?? 0;
    const clamped = Math.min(Math.max(current, prevY - maxStepM), prevY + maxStepM);
    heights[i] = clamped;
    prevY = clamped;
  }

  return heights.map((y, i) => ({ x: i * HEIGHTFIELD_STEP_M, y }));
}
