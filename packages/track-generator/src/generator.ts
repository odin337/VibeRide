import {
  FINISH_SCORE,
  isSha256Hex,
  SCORE_CEILING_FACTOR,
  seedFromHash,
  WORLD_SPEED_BASE,
} from '@viberide/shared';
import type { BeatMap, LevelDefinition } from '@viberide/shared';

import { generateCollectibles } from './collectibles';
import { generateObstacles } from './obstacles';
import { generateTerrain } from './terrain';

/**
 * Shortest generatable track, seconds. Anything shorter cannot fit the
 * flat spawn area plus a meaningful ride, so it is rejected with a
 * descriptive error rather than silently producing a degenerate level.
 */
export const MIN_DURATION_SEC = 5;

/**
 * Salts for deriving independent PRNG streams from the level seed, so
 * terrain, obstacle and collectible randomness never interleave — a
 * change in one subsystem's draw count cannot ripple into the others.
 */
const OBSTACLE_STREAM_SALT = 0x9e3779b9;
const COLLECTIBLE_STREAM_SALT = 0x85ebca6b;

function deriveStreamSeed(seed: number, salt: number): number {
  return (seed ^ salt) >>> 0;
}

function assertValidBeatMap(beatMap: BeatMap): void {
  // Widened on purpose: the runtime payload may not honour the type.
  const version: number = beatMap.version;
  if (version !== 1) {
    throw new Error(`generateLevel: unsupported BeatMap version ${version}`);
  }
  if (!isSha256Hex(beatMap.audioHash)) {
    throw new Error('generateLevel: BeatMap.audioHash must be a lowercase sha-256 hex digest');
  }
  if (!Number.isFinite(beatMap.durationSec) || beatMap.durationSec <= 0) {
    throw new Error('generateLevel: BeatMap.durationSec must be a positive finite number');
  }
  if (beatMap.durationSec < MIN_DURATION_SEC) {
    throw new Error(
      `generateLevel: BeatMap.durationSec must be at least ${MIN_DURATION_SEC} s, ` +
        `got ${beatMap.durationSec} s — the track cannot fit a playable level`,
    );
  }
  if (!Number.isFinite(beatMap.bpm) || beatMap.bpm <= 0) {
    throw new Error('generateLevel: BeatMap.bpm must be a positive finite number');
  }
  if (!Number.isFinite(beatMap.sampleRate) || beatMap.sampleRate <= 0) {
    throw new Error('generateLevel: BeatMap.sampleRate must be a positive finite number');
  }
}

/**
 * Converts a BeatMap into a fully deterministic LevelDefinition.
 *
 * Determinism is a hard invariant: the backend regenerates the level
 * from the same BeatMap for anti-cheat validation, so the same input
 * must always yield a byte-identical structure. The seed is derived
 * solely from the audio hash (seedFromHash) and every subsystem uses
 * its own deterministic PRNG stream.
 *
 * A BeatMap with no qualifying onsets (or none at all) still yields a
 * minimum viable level: terrain plus finish line, with maxScore equal
 * to FINISH_SCORE.
 */
export function generateLevel(beatMap: BeatMap): LevelDefinition {
  assertValidBeatMap(beatMap);

  const seed = seedFromHash(beatMap.audioHash);
  const lengthM = beatMap.durationSec * WORLD_SPEED_BASE;
  const finishX = lengthM;

  const heightfield = generateTerrain(beatMap, seed);
  const obstacles = generateObstacles(
    beatMap,
    deriveStreamSeed(seed, OBSTACLE_STREAM_SALT),
    finishX,
  );
  const collectibles = generateCollectibles(
    beatMap,
    deriveStreamSeed(seed, COLLECTIBLE_STREAM_SALT),
    { heightfield, obstacles, finishX },
  );
  // Theoretical ceiling: every pickup taken at max combo during fever.
  const maxScore =
    collectibles.reduce((sum, collectible) => sum + collectible.score, 0) * SCORE_CEILING_FACTOR +
    FINISH_SCORE;

  return {
    version: 1,
    seed,
    audioHash: beatMap.audioHash,
    bpm: beatMap.bpm,
    durationSec: beatMap.durationSec,
    lengthM,
    heightfield,
    obstacles,
    collectibles,
    maxScore,
    finishX,
  };
}
