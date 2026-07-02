import { createPrng, nextRange, PLAYER, WORLD_SPEED_BASE } from '@viberide/shared';
import type { BeatMap, Obstacle, ObstacleKind, Prng } from '@viberide/shared';

import {
  clearanceWidthAtHeight,
  GAP_WIDTH_SAFETY,
  MAX_JUMP_DISTANCE_M,
  MIN_OBSTACLE_SPACING_M,
  SOLID_CLEARANCE_SAFETY,
} from './physics';

/** Only bass onsets at least this strong spawn an obstacle. */
export const BASS_ONSET_THRESHOLD = 0.6;

/** No obstacle may start before this X — the player needs a run-up. */
export const OBSTACLE_MIN_X_M = 15;

/** No obstacle may end within this distance of the finish line. */
export const FINISH_CLEARANCE_M = 5;

export interface WeightedEntry<T> {
  readonly item: T;
  readonly weight: number;
}

/**
 * Picks one entry with probability proportional to its weight,
 * consuming exactly one PRNG value. Throws on empty input, negative or
 * non-finite weights, and an all-zero total.
 */
export function weightedPick<T>(rng: Prng, entries: readonly WeightedEntry<T>[]): T {
  let total = 0;
  for (const entry of entries) {
    if (!Number.isFinite(entry.weight) || entry.weight < 0) {
      throw new RangeError(`weightedPick: weights must be finite and >= 0, got ${entry.weight}`);
    }
    total += entry.weight;
  }
  if (total <= 0) {
    throw new RangeError('weightedPick: total weight must be positive');
  }
  let remaining = rng() * total;
  let selected: T | undefined;
  for (const entry of entries) {
    if (entry.weight <= 0) {
      continue;
    }
    selected = entry.item;
    remaining -= entry.weight;
    if (remaining < 0) {
      break;
    }
  }
  // `total > 0` guarantees at least one positively-weighted entry, so
  // `selected` is always set; the throw is a defensive type guard.
  if (selected === undefined) {
    throw new RangeError('weightedPick: no positively-weighted entry');
  }
  return selected;
}

const KIND_WEIGHTS: readonly WeightedEntry<ObstacleKind>[] = [
  { item: 'spike', weight: 0.35 },
  { item: 'block', weight: 0.3 },
  { item: 'gap', weight: 0.2 },
  { item: 'movingPlatform', weight: 0.15 },
];

interface SolidSizeSpec {
  readonly minW: number;
  readonly maxW: number;
  readonly minH: number;
  readonly maxH: number;
}

/**
 * Base size ranges per solid kind. All maxH values sit safely below
 * MAX_JUMP_HEIGHT_M · SOLID_HEIGHT_SAFETY, and rollSize additionally
 * caps the width by the physics clearance at the rolled height, so
 * every generated solid is clearable by construction.
 */
const SOLID_SIZES: Readonly<Record<Exclude<ObstacleKind, 'gap'>, SolidSizeSpec>> = {
  spike: { minW: 0.6, maxW: 1.6, minH: 0.7, maxH: 1.4 },
  block: { minW: 1, maxW: 2.4, minH: 0.6, maxH: 1.5 },
  movingPlatform: { minW: 1.8, maxW: 3, minH: 0.4, maxH: 0.6 },
};

const GAP_MIN_WIDTH_M = 2;
const GAP_MAX_WIDTH_M = MAX_JUMP_DISTANCE_M * GAP_WIDTH_SAFETY;
const GAP_MIN_DEPTH_M = 1.5;
const GAP_MAX_DEPTH_M = 2.5;

function rollSize(rng: Prng, kind: ObstacleKind): { width: number; height: number } {
  if (kind === 'gap') {
    return {
      width: nextRange(rng, GAP_MIN_WIDTH_M, GAP_MAX_WIDTH_M),
      height: nextRange(rng, GAP_MIN_DEPTH_M, GAP_MAX_DEPTH_M),
    };
  }
  const spec = SOLID_SIZES[kind];
  const height = nextRange(rng, spec.minH, spec.maxH);
  // Physics bound: travelling `width + player width` must fit into the
  // (safety-scaled) window the jump arc spends above `height`.
  const physicsMaxW = clearanceWidthAtHeight(height) * SOLID_CLEARANCE_SAFETY - PLAYER.widthM;
  const maxW = Math.max(spec.minW, Math.min(spec.maxW, physicsMaxW));
  return { width: nextRange(rng, spec.minW, maxW), height };
}

/**
 * Places one obstacle per strong bass onset (strength ≥
 * BASS_ONSET_THRESHOLD) at x = onsetTime · WORLD_SPEED_BASE, skipping
 * candidates that would start before OBSTACLE_MIN_X_M, end after
 * finishX − FINISH_CLEARANCE_M, or violate the jump-recovery spacing
 * (MIN_OBSTACLE_SPACING_M between the previous right edge and the next
 * left edge). Ids are sequential "obs-0", "obs-1", … in track order.
 * Deterministic: a pure function of (beatMap, seed, finishX).
 */
export function generateObstacles(beatMap: BeatMap, seed: number, finishX: number): Obstacle[] {
  const rng = createPrng(seed);
  const candidates = beatMap.onsets
    .filter((onset) => onset.band === 'bass' && onset.strength >= BASS_ONSET_THRESHOLD)
    .sort((a, b) => a.time - b.time);

  const obstacles: Obstacle[] = [];
  let lastRightEdge = Number.NEGATIVE_INFINITY;
  for (const onset of candidates) {
    // Kind and size are rolled for every candidate so the PRNG stream
    // stays aligned with the onset list regardless of placement skips.
    const kind = weightedPick(rng, KIND_WEIGHTS);
    const { width, height } = rollSize(rng, kind);
    const x = onset.time * WORLD_SPEED_BASE;
    if (x < OBSTACLE_MIN_X_M) {
      continue;
    }
    if (x + width > finishX - FINISH_CLEARANCE_M) {
      continue;
    }
    if (x - lastRightEdge < MIN_OBSTACLE_SPACING_M) {
      continue;
    }
    obstacles.push({
      id: `obs-${obstacles.length}`,
      kind,
      x,
      width,
      height,
      beatTime: onset.time,
    });
    lastRightEdge = x + width;
  }
  return obstacles;
}
