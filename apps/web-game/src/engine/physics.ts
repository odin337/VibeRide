import {
  CHECKPOINT_INTERVAL_TICKS,
  FINISH_SCORE,
  GRAVITY,
  HEIGHTFIELD_STEP_M,
  PLAYER,
  SIM_DT,
  WORLD_SPEED_BASE,
} from '@viberide/shared';
import type { LevelDefinition, Obstacle, ReplayCheckpoint, RunResult } from '@viberide/shared';

/**
 * Pure fixed-timestep simulation. Zero DOM, zero randomness, zero wall
 * clock — the state after N ticks is a pure function of (level, action
 * log), which is what the backend's checkpoint replay validation and the
 * determinism unit tests rely on.
 */

/** Input consumed by one simulation tick. */
export interface ActionState {
  /** One queued jump; consumed by the tick (executes only when grounded). */
  readonly jumpQueued: boolean;
  /** Boost button currently held. */
  readonly boostHeld: boolean;
  /** Lean axis in [-1, 1]: negative = lean back (slower), positive = forward. */
  readonly lean: number;
}

export const IDLE_ACTIONS: ActionState = { jumpQueued: false, boostHeld: false, lean: 0 };

/** How far below the terrain surface a car inside a gap counts as fallen in. */
export const GAP_CRASH_EPSILON_M = 0.05;

/** Speed delta applied per unit of lean (lean back = brake, forward = push). */
export const LEAN_SPEED_DELTA = 0.15;

/** Lower bound of the horizontal speed factor (full lean back). */
export const MIN_SPEED_FACTOR = 0.5;

/** Boost meter refill rate while grounded with the button released, sec/sec. */
export const BOOST_REFILL_PER_SEC = 1;

/** Vertical travel of a moving platform around its base, metres. */
export const MOVING_PLATFORM_AMPLITUDE_M = 0.3;

/** Full oscillation period of a moving platform, seconds. */
export const MOVING_PLATFORM_PERIOD_SEC = 2;

/** Pickup reach around the player collider, metres. */
export const COLLECT_RADIUS_M = 0.6;

/** scoreSubmissionSchema caps checkpoints at 600 (20 minutes of play). */
export const MAX_CHECKPOINTS = 600;

export interface SimState {
  tick: number;
  /** Player collider center X, metres. */
  x: number;
  /** Player collider bottom Y, metres. */
  y: number;
  /** Vertical velocity, m/s. */
  vy: number;
  grounded: boolean;
  boostSecLeft: number;
  /** True when boost was active during the last tick. */
  boosting: boolean;
  crashed: boolean;
  finished: boolean;
  score: number;
  collectiblesTaken: number;
  readonly collected: Set<string>;
  readonly checkpoints: ReplayCheckpoint[];
}

export interface Simulation {
  readonly level: LevelDefinition;
  readonly state: SimState;
}

export interface SimEventCollision {
  readonly kind: 'collision';
  readonly obstacleId: string;
}

export interface SimEventCollect {
  readonly kind: 'collect';
  readonly collectibleId: string;
  /** Points awarded by this pickup. */
  readonly score: number;
}

export interface SimEventFinish {
  readonly kind: 'finish';
}

export type SimEvent = SimEventCollision | SimEventCollect | SimEventFinish;

/**
 * Terrain height at world X via linear interpolation over the level
 * heightfield. Uses the fixed HEIGHTFIELD_STEP_M spacing for O(1) segment
 * lookup, with a local scan correction so hand-built fixtures with
 * irregular spacing still resolve correctly. Clamps outside the range.
 */
export function sampleTerrainHeight(level: LevelDefinition, x: number): number {
  const points = level.heightfield;
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) {
    return 0;
  }
  if (x <= first.x) {
    return first.y;
  }
  if (x >= last.x) {
    return last.y;
  }
  let index = Math.floor((x - first.x) / HEIGHTFIELD_STEP_M);
  index = Math.min(Math.max(index, 0), points.length - 2);
  // Correct the guess when the spacing is not exactly HEIGHTFIELD_STEP_M.
  while (index > 0 && (points[index]?.x ?? Number.NEGATIVE_INFINITY) > x) {
    index -= 1;
  }
  while (index < points.length - 2 && (points[index + 1]?.x ?? Number.POSITIVE_INFINITY) < x) {
    index += 1;
  }
  const p0 = points[index];
  const p1 = points[index + 1];
  if (!p0 || !p1 || p1.x === p0.x) {
    return last.y;
  }
  const t = (x - p0.x) / (p1.x - p0.x);
  return p0.y + (p1.y - p0.y) * t;
}

/**
 * Vertical offset of a moving platform at `timeSec` (= tick × SIM_DT).
 * Phased against the obstacle's beatTime so the platform crosses its base
 * exactly on the beat — deterministic, driven by ticks only.
 */
export function movingPlatformOffsetY(obstacle: Obstacle, timeSec: number): number {
  const phase = ((timeSec - obstacle.beatTime) / MOVING_PLATFORM_PERIOD_SEC) * 2 * Math.PI;
  return MOVING_PLATFORM_AMPLITUDE_M * Math.sin(phase);
}

/** The gap obstacle whose span contains world X, or null. */
export function gapAt(level: LevelDefinition, x: number): Obstacle | null {
  for (const obstacle of level.obstacles) {
    if (obstacle.kind === 'gap' && x >= obstacle.x && x <= obstacle.x + obstacle.width) {
      return obstacle;
    }
  }
  return null;
}

export function createSimulation(level: LevelDefinition): Simulation {
  const y = sampleTerrainHeight(level, 0);
  return {
    level,
    state: {
      tick: 0,
      x: 0,
      y,
      vy: 0,
      grounded: true,
      boostSecLeft: PLAYER.maxBoostSec,
      boosting: false,
      crashed: false,
      finished: false,
      score: 0,
      collectiblesTaken: 0,
      collected: new Set<string>(),
      // Tick 0 is recorded up front so even a run that ends before the
      // first interval still satisfies scoreSubmissionSchema's min-1
      // checkpoint requirement (0 is aligned to the interval).
      checkpoints: [{ tick: 0, x: 0, y, score: 0 }],
    },
  };
}

function findSolidCollision(
  level: LevelDefinition,
  state: SimState,
  timeSec: number,
): Obstacle | null {
  const halfW = PLAYER.widthM / 2;
  const playerTop = state.y + PLAYER.heightM;
  for (const obstacle of level.obstacles) {
    if (obstacle.kind === 'gap') {
      continue;
    }
    if (state.x + halfW <= obstacle.x || state.x - halfW >= obstacle.x + obstacle.width) {
      continue;
    }
    let baseY = sampleTerrainHeight(level, obstacle.x + obstacle.width / 2);
    if (obstacle.kind === 'movingPlatform') {
      baseY += movingPlatformOffsetY(obstacle, timeSec);
    }
    if (state.y < baseY + obstacle.height && playerTop > baseY) {
      return obstacle;
    }
  }
  return null;
}

function collectPickups(level: LevelDefinition, state: SimState, events: SimEvent[]): void {
  const halfW = PLAYER.widthM / 2;
  for (const collectible of level.collectibles) {
    if (state.collected.has(collectible.id)) {
      continue;
    }
    const inReachX = Math.abs(collectible.x - state.x) <= halfW + COLLECT_RADIUS_M;
    const inReachY =
      collectible.y >= state.y - COLLECT_RADIUS_M &&
      collectible.y <= state.y + PLAYER.heightM + COLLECT_RADIUS_M;
    if (inReachX && inReachY) {
      state.collected.add(collectible.id);
      state.score += collectible.score;
      state.collectiblesTaken += 1;
      events.push({ kind: 'collect', collectibleId: collectible.id, score: collectible.score });
    }
  }
}

/**
 * Advances the simulation by exactly one fixed step (SIM_DT). Returns the
 * gameplay events produced by this tick; a crashed or finished simulation
 * ignores further steps.
 */
export function stepSimulation(sim: Simulation, input: ActionState): SimEvent[] {
  const { level, state } = sim;
  const events: SimEvent[] = [];
  if (state.crashed || state.finished) {
    return events;
  }

  state.tick += 1;
  const timeSec = state.tick * SIM_DT;

  // --- boost meter: drains while active, refills only grounded + released ---
  const boosting = input.boostHeld && state.boostSecLeft > 0;
  state.boosting = boosting;
  if (boosting) {
    state.boostSecLeft = Math.max(0, state.boostSecLeft - SIM_DT);
  } else if (!input.boostHeld && state.grounded) {
    state.boostSecLeft = Math.min(
      PLAYER.maxBoostSec,
      state.boostSecLeft + BOOST_REFILL_PER_SEC * SIM_DT,
    );
  }

  // --- horizontal motion (capped at the anti-cheat kinematic ceiling) ---
  const lean = Math.min(1, Math.max(-1, input.lean));
  const rawFactor = (boosting ? PLAYER.boostMultiplier : 1) * (1 + LEAN_SPEED_DELTA * lean);
  const factor = Math.min(PLAYER.boostMultiplier, Math.max(MIN_SPEED_FACTOR, rawFactor));
  state.x += WORLD_SPEED_BASE * factor * SIM_DT;

  const terrainY = sampleTerrainHeight(level, state.x);
  const gap = gapAt(level, state.x);

  // Ground support is removed inside a gap — and with it, the ability to jump.
  if (gap) {
    state.grounded = false;
  }
  if (input.jumpQueued && state.grounded) {
    state.grounded = false;
    state.vy = PLAYER.jumpVelocity;
  }

  // --- vertical motion: terrain-following when grounded, ballistic in air ---
  if (state.grounded) {
    state.y = terrainY;
    state.vy = 0;
  } else {
    state.vy += GRAVITY * SIM_DT;
    state.y += state.vy * SIM_DT;
    if (!gap && state.vy <= 0 && state.y <= terrainY) {
      state.y = terrainY;
      state.vy = 0;
      state.grounded = true;
    }
  }

  // --- crash: fell into a gap ---
  if (gap && state.y < terrainY - GAP_CRASH_EPSILON_M) {
    state.crashed = true;
    events.push({ kind: 'collision', obstacleId: gap.id });
  }

  // --- crash: hit a solid obstacle ---
  if (!state.crashed) {
    const hit = findSolidCollision(level, state, timeSec);
    if (hit) {
      state.crashed = true;
      events.push({ kind: 'collision', obstacleId: hit.id });
    }
  }

  // --- pickups and finish line ---
  if (!state.crashed) {
    collectPickups(level, state, events);
    if (state.x >= level.finishX) {
      state.finished = true;
      state.x = level.finishX;
      state.score += FINISH_SCORE;
      events.push({ kind: 'finish' });
    }
  }

  // --- replay checkpoint ---
  if (state.tick % CHECKPOINT_INTERVAL_TICKS === 0 && state.checkpoints.length < MAX_CHECKPOINTS) {
    state.checkpoints.push({ tick: state.tick, x: state.x, y: state.y, score: state.score });
  }

  return events;
}

/**
 * Assembles the RunResult submitted to the leaderboard. `durationMs` is
 * wall-clock time measured by the caller (run-controller) via its injected
 * clock — the simulation itself never reads one.
 */
export function buildRunResult(sim: Simulation, durationMs: number): RunResult {
  const { level, state } = sim;
  return {
    audioHash: level.audioHash,
    seed: level.seed,
    score: state.score,
    distanceM: Math.min(state.x, level.finishX),
    finished: state.finished,
    durationMs: Math.max(1, Math.round(durationMs)),
    collectiblesTaken: state.collectiblesTaken,
    checkpoints: [...state.checkpoints],
  };
}
