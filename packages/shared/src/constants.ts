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

/**
 * Horizontal world speed, m/s — CONSTANT for the whole run. Player X is
 * the exact function `x = tick × SIM_DT × WORLD_SPEED_BASE`, which is
 * what locks the world to the music: obstacles and collectibles are
 * placed at `x = beatTime × WORLD_SPEED_BASE`, so the player reaches
 * every one exactly when it sounds. Nothing (boost, lean) may scale
 * horizontal speed — that would desynchronize track and music.
 */
export const WORLD_SPEED_BASE = 8;

/** Pickup reach around the player collider, metres. */
export const COLLECT_RADIUS_M = 0.6;

/** Score multiplier applied to pickups collected during fever. */
export const FEVER_SCORE_MULTIPLIER = 2;

/** Every COMBO_STEP consecutive pickups raise the combo multiplier by 1. */
export const COMBO_STEP = 8;

/** Combo multiplier ceiling (×1 … ×MAX_COMBO_MULTIPLIER). */
export const MAX_COMBO_MULTIPLIER = 4;

/**
 * Hard ceiling on the factor any pickup's base score can be multiplied
 * by (max combo × fever). Used by the level generator for maxScore and
 * by the anti-cheat for per-interval score bounds.
 */
export const SCORE_CEILING_FACTOR = FEVER_SCORE_MULTIPLIER * MAX_COMBO_MULTIPLIER;

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
  /**
   * Boost is FEVER, not speed: horizontal speed is constant (see
   * WORLD_SPEED_BASE) so the ride never drifts off the music. While the
   * meter burns, the pickup radius grows by this factor (a "magnet") and
   * the audio layer opens its low-pass filter — boost is heard, not run.
   */
  feverMagnetMultiplier: 2.5,
  /** Extra downward acceleration while diving (lean back airborne), m/s². */
  diveAccel: 30,
  /** Maximum continuous boost (fever) duration, seconds. */
  maxBoostSec: 2,
} as const;

/** Score for reaching the finish line. */
export const FINISH_SCORE = 1000;

/** Storage keys used with SaveStorage implementations. */
export const STORAGE_KEYS = {
  settings: 'viberide:settings',
  progress: 'viberide:progress',
} as const;
