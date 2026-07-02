import { FINISH_SCORE, HEIGHTFIELD_STEP_M, seedFromHash, WORLD_SPEED_BASE } from '@viberide/shared';
import type { Collectible, LevelDefinition, Obstacle, TrackPoint } from '@viberide/shared';
import { FIXTURE_AUDIO_HASH } from '@viberide/track-generator';

/**
 * Hand-built deterministic LevelDefinition fixtures for the engine test
 * suite (mirrors packages/track-generator/src/testing/fixtures.ts). No
 * randomness: the same options always produce a deep-equal level.
 */

export interface TestLevelOptions {
  readonly lengthM?: number;
  /** Terrain height at X; defaults to a perfectly flat 0. */
  readonly heightAt?: (x: number) => number;
  readonly obstacles?: readonly Obstacle[];
  readonly collectibles?: readonly Collectible[];
  readonly audioHash?: string;
}

export function makeLevel(options: TestLevelOptions = {}): LevelDefinition {
  const lengthM = options.lengthM ?? 80;
  const heightAt = options.heightAt ?? ((): number => 0);
  const audioHash = options.audioHash ?? FIXTURE_AUDIO_HASH;
  const obstacles = options.obstacles ?? [];
  const collectibles = options.collectibles ?? [];

  const sampleCount = Math.floor(lengthM / HEIGHTFIELD_STEP_M) + 1;
  const heightfield: TrackPoint[] = Array.from({ length: sampleCount }, (_, i) => {
    const x = i * HEIGHTFIELD_STEP_M;
    return { x, y: heightAt(x) };
  });

  const collectibleScore = collectibles.reduce((sum, item) => sum + item.score, 0);
  return {
    version: 1,
    seed: seedFromHash(audioHash),
    audioHash,
    bpm: 120,
    durationSec: lengthM / WORLD_SPEED_BASE,
    lengthM,
    heightfield,
    obstacles,
    collectibles,
    maxScore: collectibleScore + FINISH_SCORE,
    finishX: lengthM,
  };
}

export function makeFlatLevel(options: Omit<TestLevelOptions, 'heightAt'> = {}): LevelDefinition {
  return makeLevel(options);
}

export function makeObstacle(
  overrides: Partial<Obstacle> & Pick<Obstacle, 'kind' | 'x'>,
): Obstacle {
  return {
    id: `obs-${overrides.kind}-${overrides.x}`,
    width: 1,
    height: 1,
    beatTime: overrides.x / WORLD_SPEED_BASE,
    ...overrides,
  };
}

export function makeCollectible(
  overrides: Partial<Collectible> & Pick<Collectible, 'x' | 'y'>,
): Collectible {
  return {
    id: `col-${overrides.x}-${overrides.y}`,
    kind: 'note',
    beatTime: overrides.x / WORLD_SPEED_BASE,
    score: 10,
    ...overrides,
  };
}
