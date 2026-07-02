import type { Beat, BeatMap, EnergyPoint, Onset } from '@viberide/shared';

/**
 * Deterministic synthetic BeatMap builders for tests — here and in
 * downstream packages (game engine, backend anti-cheat). No randomness:
 * the same overrides always produce a structurally identical BeatMap.
 */

/** Default fixture hash — a valid lowercase sha-256 hex digest. */
export const FIXTURE_AUDIO_HASH = '0123456789abcdef'.repeat(4);

/** A second valid hash for "different audio → different level" tests. */
export const ALT_AUDIO_HASH = 'fedcba9876543210'.repeat(4);

function buildBeats(durationSec: number, beatIntervalSec: number): Beat[] {
  const beats: Beat[] = [];
  for (let i = 0; i * beatIntervalSec < durationSec; i += 1) {
    beats.push({ time: i * beatIntervalSec, indexInBar: (i % 4) + 1 });
  }
  return beats;
}

/**
 * Onset pattern per 4/4 bar (one bar = 4 beats):
 * - beat 1: bass, strength cycling 0.5 → 0.95 across bars (bars with
 *   strength 0.5 stay below the obstacle threshold on purpose);
 * - beat 2: high 0.45 (note arcs);
 * - beat 3: mid 0.5, every 4th bar 0.85 (gems);
 * - beat 4: high 0.2 — below the collectible threshold on purpose.
 */
function buildOnsets(durationSec: number, beatIntervalSec: number): Onset[] {
  const onsets: Onset[] = [];
  for (let i = 0; i * beatIntervalSec < durationSec; i += 1) {
    const time = i * beatIntervalSec;
    const positionInBar = i % 4;
    if (positionInBar === 0) {
      const bar = i / 4;
      onsets.push({ time, strength: 0.5 + 0.45 * ((bar % 5) / 4), band: 'bass' });
    } else if (positionInBar === 1) {
      onsets.push({ time, strength: 0.45, band: 'high' });
    } else if (positionInBar === 2) {
      onsets.push({ time, strength: i % 16 === 6 ? 0.85 : 0.5, band: 'mid' });
    } else {
      onsets.push({ time, strength: 0.2, band: 'high' });
    }
  }
  return onsets;
}

/** Slow sinusoidal loudness envelope sampled once per second, within [0.05, 0.95]. */
function buildEnergy(durationSec: number): EnergyPoint[] {
  const points: EnergyPoint[] = [];
  for (let t = 0; t <= durationSec; t += 1) {
    points.push({ time: t, energy: 0.5 + 0.45 * Math.sin((2 * Math.PI * t) / 30) });
  }
  return points;
}

/**
 * Builds a consistent synthetic BeatMap: 120 BPM, 60 s, beats every
 * 0.5 s and onsets locked to the beat grid. When durationSec/bpm are
 * overridden, beats/onsets/energy are re-derived from them unless those
 * arrays are overridden explicitly (explicit overrides always win).
 */
export function makeBeatMap(overrides: Partial<BeatMap> = {}): BeatMap {
  const durationSec = overrides.durationSec ?? 60;
  const bpm = overrides.bpm ?? 120;
  const derivable = Number.isFinite(bpm) && bpm > 0 && Number.isFinite(durationSec);
  const beatIntervalSec = derivable ? 60 / bpm : Number.POSITIVE_INFINITY;
  return {
    version: 1,
    audioHash: FIXTURE_AUDIO_HASH,
    durationSec,
    sampleRate: 44100,
    bpm,
    beats: buildBeats(durationSec, beatIntervalSec),
    onsets: buildOnsets(durationSec, beatIntervalSec),
    energy: buildEnergy(Number.isFinite(durationSec) ? durationSec : 0),
    ...overrides,
  };
}
