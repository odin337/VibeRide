export type PlayerAction = 'jump' | 'boost' | 'leanForward' | 'leanBack';

/** Periodic snapshot of the simulation used for server-side replay validation. */
export interface ReplayCheckpoint {
  /** Fixed-step simulation tick (SIM_TICK_HZ per second). */
  readonly tick: number;
  /** Player X position, metres. */
  readonly x: number;
  /** Player Y position, metres. */
  readonly y: number;
  /** Accumulated score at this tick. */
  readonly score: number;
}

/** Outcome of a single run, submitted to the backend leaderboard. */
export interface RunResult {
  readonly audioHash: string;
  readonly seed: number;
  readonly score: number;
  readonly distanceM: number;
  readonly finished: boolean;
  /** Wall-clock duration of the run in milliseconds. */
  readonly durationMs: number;
  readonly collectiblesTaken: number;
  readonly checkpoints: readonly ReplayCheckpoint[];
}

export interface GameSettings {
  /** Master volume in [0, 1]. */
  readonly volume: number;
  readonly reducedMotion: boolean;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  volume: 0.8,
  reducedMotion: false,
};
