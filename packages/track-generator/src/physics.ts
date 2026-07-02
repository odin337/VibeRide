import { GRAVITY, PLAYER, WORLD_SPEED_BASE } from '@viberide/shared';
import type { ObstacleKind } from '@viberide/shared';

/**
 * Jump-physics envelope derived from the shared simulation constants.
 * All obstacle/collectible placement bounds are computed from these
 * values so a change in PLAYER or GRAVITY automatically tightens or
 * relaxes generation — the level can never outrun the physics.
 *
 * Ballistics with initial vertical velocity v and gravity magnitude g:
 *   apex height      h_max = v² / (2g)
 *   total airtime    t_air = 2v / g
 *   time above h     t(h)  = 2·√(v² − 2gh) / g
 */
const GRAVITY_MAG = Math.abs(GRAVITY);

/** Highest point of a jump above the launch surface, metres (≈ 2.05 m). */
export const MAX_JUMP_HEIGHT_M = PLAYER.jumpVelocity ** 2 / (2 * GRAVITY_MAG);

/** Total airtime of a flat-ground jump, seconds (≈ 0.86 s). */
export const JUMP_AIRTIME_SEC = (2 * PLAYER.jumpVelocity) / GRAVITY_MAG;

/**
 * Horizontal distance covered during a full jump at base speed,
 * metres (≈ 6.91 m). Boost extends this, but clearability must never
 * depend on boost being available.
 */
export const MAX_JUMP_DISTANCE_M = WORLD_SPEED_BASE * JUMP_AIRTIME_SEC;

/**
 * Jump-recovery distance: minimum free run between the right edge of
 * one obstacle and the left edge of the next. A full jump arc plus one
 * player length guarantees the car has landed and settled before it
 * must jump again (≈ 8.11 m).
 */
export const MIN_OBSTACLE_SPACING_M = MAX_JUMP_DISTANCE_M + PLAYER.widthM;

/** Gaps may use at most this fraction of the max jump distance. */
export const GAP_WIDTH_SAFETY = 0.8;

/** Solid obstacles may use at most this fraction of the max jump height. */
export const SOLID_HEIGHT_SAFETY = 0.85;

/** Solid obstacles may use at most this fraction of the clearance width. */
export const SOLID_CLEARANCE_SAFETY = 0.9;

/**
 * Horizontal distance available while the jump arc is above `heightM`,
 * at base speed. Zero when the height is at or beyond the jump apex.
 */
export function clearanceWidthAtHeight(heightM: number): number {
  const discriminant = PLAYER.jumpVelocity ** 2 - 2 * GRAVITY_MAG * heightM;
  if (discriminant <= 0) {
    return 0;
  }
  return WORLD_SPEED_BASE * ((2 * Math.sqrt(discriminant)) / GRAVITY_MAG);
}

/**
 * True when an obstacle of the given kind and size can always be
 * cleared with a single well-timed jump at base speed (no boost):
 * - gap: width must fit inside the safety-scaled jump distance;
 * - solid kinds: the player must fit `width + player width` of travel
 *   into the safety-scaled window the arc spends above the obstacle.
 */
export function isObstacleClearable(kind: ObstacleKind, widthM: number, heightM: number): boolean {
  if (widthM <= 0 || heightM <= 0) {
    return false;
  }
  if (kind === 'gap') {
    return widthM <= MAX_JUMP_DISTANCE_M * GAP_WIDTH_SAFETY;
  }
  if (heightM > MAX_JUMP_HEIGHT_M * SOLID_HEIGHT_SAFETY) {
    return false;
  }
  return widthM + PLAYER.widthM <= clearanceWidthAtHeight(heightM) * SOLID_CLEARANCE_SAFETY;
}
