import { FINISH_SCORE, HEIGHTFIELD_STEP_M, SCORE_CEILING_FACTOR } from '@viberide/shared';
import type { LevelDefinition, Obstacle, TrackPoint } from '@viberide/shared';

import { FINISH_CLEARANCE_M, OBSTACLE_MIN_X_M } from './obstacles';
import { isObstacleClearable, MAX_JUMP_HEIGHT_M, MIN_OBSTACLE_SPACING_M } from './physics';
import {
  MAX_TERRAIN_SLOPE,
  SPAWN_FLAT_M,
  TERRAIN_MAX_Y,
  TERRAIN_MIN_Y,
  terrainHeightAt,
} from './terrain';

const EPS = 1e-6;

export interface PlayabilityReport {
  readonly ok: boolean;
  readonly issues: readonly string[];
}

function checkTerrain(level: LevelDefinition, issues: string[]): void {
  const first = level.heightfield[0];
  if (!first || level.heightfield.length < 2) {
    issues.push(`heightfield must contain at least 2 samples, got ${level.heightfield.length}`);
    return;
  }
  if (Math.abs(first.x) > EPS) {
    issues.push(`heightfield must start at x=0, starts at x=${first.x}`);
  }

  let prev: TrackPoint = first;
  let index = 0;
  for (const point of level.heightfield) {
    if (point.y < TERRAIN_MIN_Y - EPS || point.y > TERRAIN_MAX_Y + EPS) {
      issues.push(
        `heightfield[${index}] y=${point.y} outside playable range ` +
          `[${TERRAIN_MIN_Y}, ${TERRAIN_MAX_Y}]`,
      );
    }
    if (point.x <= SPAWN_FLAT_M + EPS && Math.abs(point.y) > EPS) {
      issues.push(`spawn area not flat: heightfield[${index}] (x=${point.x}) has y=${point.y}`);
    }
    if (index > 0) {
      const dx = point.x - prev.x;
      if (Math.abs(dx - HEIGHTFIELD_STEP_M) > EPS) {
        issues.push(
          `heightfield spacing broken at index ${index}: dx=${dx}, ` +
            `expected ${HEIGHTFIELD_STEP_M}`,
        );
      }
      if (dx > 0 && Math.abs(point.y - prev.y) > MAX_TERRAIN_SLOPE * dx + EPS) {
        issues.push(
          `slope bound exceeded at index ${index}: |dy/dx|=` +
            `${Math.abs((point.y - prev.y) / dx)} > ${MAX_TERRAIN_SLOPE}`,
        );
      }
    }
    prev = point;
    index += 1;
  }
  if (prev.x < level.finishX - HEIGHTFIELD_STEP_M - EPS) {
    issues.push(`heightfield ends at x=${prev.x}, before the finish line at x=${level.finishX}`);
  }
}

function checkObstacles(level: LevelDefinition, issues: string[]): void {
  const sorted = [...level.obstacles].sort((a, b) => a.x - b.x);
  let prev: Obstacle | undefined;
  for (const obstacle of sorted) {
    if (!isObstacleClearable(obstacle.kind, obstacle.width, obstacle.height)) {
      issues.push(
        `obstacle ${obstacle.id} (${obstacle.kind}, ${obstacle.width}×${obstacle.height} m) ` +
          'is not clearable with a base-speed jump',
      );
    }
    if (obstacle.x < OBSTACLE_MIN_X_M - EPS) {
      issues.push(
        `obstacle ${obstacle.id} starts at x=${obstacle.x}, before the minimum ` +
          `x=${OBSTACLE_MIN_X_M}`,
      );
    }
    if (obstacle.x + obstacle.width > level.finishX - FINISH_CLEARANCE_M + EPS) {
      issues.push(
        `obstacle ${obstacle.id} ends at x=${obstacle.x + obstacle.width}, within ` +
          `${FINISH_CLEARANCE_M} m of the finish at x=${level.finishX}`,
      );
    }
    if (prev) {
      const gap = obstacle.x - (prev.x + prev.width);
      if (gap < MIN_OBSTACLE_SPACING_M - EPS) {
        issues.push(
          `obstacles ${prev.id} and ${obstacle.id} are only ${gap} m apart, minimum ` +
            `jump-recovery spacing is ${MIN_OBSTACLE_SPACING_M} m`,
        );
      }
    }
    prev = obstacle;
  }
}

function checkCollectibles(level: LevelDefinition, issues: string[]): void {
  for (const collectible of level.collectibles) {
    const terrainY = terrainHeightAt(level.heightfield, collectible.x);
    if (collectible.y <= terrainY + EPS) {
      issues.push(
        `collectible ${collectible.id} at y=${collectible.y} is not above the terrain ` +
          `surface (y=${terrainY}) at x=${collectible.x}`,
      );
    }
    if (collectible.y > terrainY + MAX_JUMP_HEIGHT_M + EPS) {
      issues.push(
        `collectible ${collectible.id} at y=${collectible.y} is beyond jump reach ` +
          `(terrain ${terrainY} + max jump height ${MAX_JUMP_HEIGHT_M}) at x=${collectible.x}`,
      );
    }
    for (const obstacle of level.obstacles) {
      if (collectible.x >= obstacle.x - EPS && collectible.x <= obstacle.x + obstacle.width + EPS) {
        issues.push(`collectible ${collectible.id} overlaps obstacle ${obstacle.id}`);
      }
    }
  }
}

function checkScore(level: LevelDefinition, issues: string[]): void {
  // Theoretical ceiling: every pickup at max combo during fever.
  const expected =
    level.collectibles.reduce((sum, collectible) => sum + collectible.score, 0) *
      SCORE_CEILING_FACTOR +
    FINISH_SCORE;
  if (level.maxScore !== expected) {
    issues.push(
      `maxScore ${level.maxScore} does not equal collectible scores × SCORE_CEILING_FACTOR ` +
        `+ FINISH_SCORE (${expected})`,
    );
  }
}

/**
 * Re-checks every gameplay invariant the generator promises:
 * - heightfield starts at x=0, uniform HEIGHTFIELD_STEP_M spacing,
 *   heights within the playable range, slope within MAX_TERRAIN_SLOPE,
 *   flat spawn area, coverage up to the finish line;
 * - every obstacle clearable with a base-speed jump, inside
 *   [OBSTACLE_MIN_X_M, finishX − FINISH_CLEARANCE_M] (which also puts
 *   the finish beyond the last obstacle), jump-recovery spacing kept;
 * - every collectible strictly above the terrain, within jump reach,
 *   and not overlapping any obstacle;
 * - maxScore equals the collectible score sum × SCORE_CEILING_FACTOR
 *   (max combo during fever) plus FINISH_SCORE.
 *
 * Levels produced by generateLevel always pass; the backend also runs
 * this on regenerated levels as an anti-cheat sanity check.
 */
export function validatePlayability(level: LevelDefinition): PlayabilityReport {
  const issues: string[] = [];
  if (!(level.finishX > 0)) {
    issues.push(`finishX must be positive, got ${level.finishX}`);
  }
  checkTerrain(level, issues);
  checkObstacles(level, issues);
  checkCollectibles(level, issues);
  checkScore(level, issues);
  return { ok: issues.length === 0, issues };
}
