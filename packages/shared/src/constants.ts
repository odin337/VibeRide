/**
 * Simulation constants shared by the client game engine and the backend
 * anti-cheat validator. Changing any value is a breaking change for
 * replay validation — bump LevelDefinition/BeatMap versions accordingly.
 */

/** Fixed simulation rate, ticks per second. */
export const SIM_TICK_HZ = 60;

/** Fixed simulation step, seconds. */
export const SIM_DT = 1 / SIM_TICK_HZ;

/** Gravity, m/s² (game-tuned, not physical). */
export const GRAVITY = -22;

/** Base horizontal cruising speed, m/s. */
export const WORLD_SPEED_BASE = 8;

/** Horizontal distance between heightfield samples, metres. */
export const HEIGHTFIELD_STEP_M = 0.5;

/** A replay checkpoint is recorded every N ticks (2 seconds at 60 Hz). */
export const CHECKPOINT_INTERVAL_TICKS = 120;

export const PLAYER = {
  /** Collider width, metres. */
  widthM: 1.2,
  /** Collider height, metres. */
  heightM: 0.8,
  /** Instant vertical velocity applied on jump, m/s. */
  jumpVelocity: 9.5,
  /** Speed multiplier while boosting. */
  boostMultiplier: 1.6,
  /** Maximum continuous boost duration, seconds. */
  maxBoostSec: 2,
} as const;

/** Score for reaching the finish line. */
export const FINISH_SCORE = 1000;

/** Storage keys used with SaveStorage implementations. */
export const STORAGE_KEYS = {
  settings: 'viberide:settings',
  progress: 'viberide:progress',
} as const;
