import { createPrng, nextRange, PLAYER, WORLD_SPEED_BASE } from '@viberide/shared';
import type { BeatMap, Collectible, CollectibleKind, Obstacle, TrackPoint } from '@viberide/shared';

import { MAX_JUMP_HEIGHT_M } from './physics';
import { SPAWN_FLAT_M, terrainHeightAt } from './terrain';

/** Only mid/high onsets at least this strong spawn collectibles. */
export const COLLECTIBLE_ONSET_THRESHOLD = 0.35;

/** Onsets at least this strong get a gem instead of a note arc. */
export const GEM_STRENGTH_THRESHOLD = 0.8;

export const NOTE_SCORE = 10;
export const GEM_SCORE = 25;

/** Collectibles start a little after the flat spawn area. */
export const COLLECTIBLE_MIN_X_M = SPAWN_FLAT_M + 2;

/** No collectible within this distance of the finish line. */
export const COLLECTIBLE_FINISH_CLEARANCE_M = 2;

/** Keep-out margin around obstacles so pickups never require a collision course. */
const OBSTACLE_MARGIN_M = PLAYER.widthM;

/** Minimum X gap between consecutive collectibles. */
const MIN_COLLECTIBLE_GAP_M = 0.8;

/** Note arcs span three pickups: edges at ±ARC_HALF_SPAN_M, peak in the middle. */
const ARC_OFFSETS_M: readonly number[] = [-1.2, 0, 1.2];
const ARC_HALF_SPAN_M = 1.2;
const ARC_RISE_M = 0.6;

/** Base height of note-arc edges above the terrain, metres. */
const NOTE_MIN_BASE_M = 0.7;
const NOTE_MAX_BASE_M = 1.1;

/** Gem height above the terrain, metres — near the jump apex. */
const GEM_MIN_OFFSET_M = 1.2;
const GEM_MAX_OFFSET_M = 1.8;

/**
 * Every placement height is capped at this fraction of the jump apex,
 * keeping pickups reachable with margin even on the arc's edges.
 */
const REACHABLE_FRACTION = 0.9;

function overlapsObstacle(x: number, obstacles: readonly Obstacle[]): boolean {
  for (const obstacle of obstacles) {
    const keepOutStart = obstacle.x - OBSTACLE_MARGIN_M;
    const keepOutEnd = obstacle.x + obstacle.width + OBSTACLE_MARGIN_M;
    if (x >= keepOutStart && x <= keepOutEnd) {
      return true;
    }
  }
  return false;
}

export interface CollectibleContext {
  readonly heightfield: readonly TrackPoint[];
  readonly obstacles: readonly Obstacle[];
  readonly finishX: number;
}

/**
 * Places collectibles on mid/high onsets (strength ≥
 * COLLECTIBLE_ONSET_THRESHOLD): the strongest onsets (≥
 * GEM_STRENGTH_THRESHOLD) get a single gem near the jump apex, the rest
 * get a three-note arc following a parabolic jump trajectory above the
 * terrain surface. Positions that would fall outside
 * [COLLECTIBLE_MIN_X_M, finishX − COLLECTIBLE_FINISH_CLEARANCE_M],
 * overlap an obstacle (with margin) or crowd the previous pickup are
 * skipped. Ids are sequential "col-0", "col-1", … in track order.
 * Deterministic: a pure function of (beatMap, seed, context).
 */
export function generateCollectibles(
  beatMap: BeatMap,
  seed: number,
  context: CollectibleContext,
): Collectible[] {
  const rng = createPrng(seed);
  const candidates = beatMap.onsets
    .filter(
      (onset) =>
        (onset.band === 'mid' || onset.band === 'high') &&
        onset.strength >= COLLECTIBLE_ONSET_THRESHOLD,
    )
    .sort((a, b) => a.time - b.time);

  const maxOffsetM = MAX_JUMP_HEIGHT_M * REACHABLE_FRACTION;
  const collectibles: Collectible[] = [];
  let lastX = Number.NEGATIVE_INFINITY;

  const tryPlace = (x: number, offsetY: number, kind: CollectibleKind, beatTime: number): void => {
    if (x < COLLECTIBLE_MIN_X_M || x > context.finishX - COLLECTIBLE_FINISH_CLEARANCE_M) {
      return;
    }
    if (x - lastX < MIN_COLLECTIBLE_GAP_M) {
      return;
    }
    if (overlapsObstacle(x, context.obstacles)) {
      return;
    }
    const y = terrainHeightAt(context.heightfield, x) + Math.min(offsetY, maxOffsetM);
    collectibles.push({
      id: `col-${collectibles.length}`,
      kind,
      x,
      y,
      beatTime,
      score: kind === 'gem' ? GEM_SCORE : NOTE_SCORE,
    });
    lastX = x;
  };

  for (const onset of candidates) {
    const centerX = onset.time * WORLD_SPEED_BASE;
    if (onset.strength >= GEM_STRENGTH_THRESHOLD) {
      const offsetY = nextRange(rng, GEM_MIN_OFFSET_M, GEM_MAX_OFFSET_M);
      tryPlace(centerX, offsetY, 'gem', onset.time);
    } else {
      const base = nextRange(rng, NOTE_MIN_BASE_M, NOTE_MAX_BASE_M);
      for (const arcOffset of ARC_OFFSETS_M) {
        // Parabolic arc: edges sit at `base`, the centre `base + rise`.
        const normalized = arcOffset / ARC_HALF_SPAN_M;
        const offsetY = base + ARC_RISE_M * (1 - normalized * normalized);
        tryPlace(centerX + arcOffset, offsetY, 'note', onset.time);
      }
    }
  }
  return collectibles;
}
