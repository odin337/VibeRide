import { PLAYER, SIM_TICK_HZ } from '@viberide/shared';
import type { GameEventBus, LevelDefinition } from '@viberide/shared';

import {
  buildRunResult,
  comboMultiplier,
  createSimulation,
  IDLE_ACTIONS,
  stepSimulation,
} from './physics';
import type { ActionState, Simulation } from './physics';

/**
 * Largest wall-clock delta a single advance() call will simulate. A tab
 * that was hidden for minutes resumes with one bounded catch-up instead
 * of fast-forwarding the whole run into a wall.
 */
export const MAX_ADVANCE_MS = 1000;

/**
 * Largest tick catch-up a single advanceToSongTime() call performs. The
 * audio clock keeps running while rAF is throttled; when frames return,
 * the sim fast-forwards toward the music in bounded chunks (the game
 * controller additionally auto-pauses on tab hide, so real gaps are rare).
 */
export const MAX_CATCHUP_TICKS = 180;

export type RunStatus = 'idle' | 'running' | 'paused' | 'ended';

/** Per-frame view of the simulation for the HUD and the renderer. */
export interface SimSnapshot {
  readonly tick: number;
  readonly x: number;
  readonly y: number;
  readonly score: number;
  readonly distanceM: number;
  readonly boostFraction: number;
  readonly boosting: boolean;
  readonly grounded: boolean;
  readonly crashed: boolean;
  readonly finished: boolean;
  /** Consecutive pickups since the last miss. */
  readonly combo: number;
  /** Score multiplier the NEXT pickup would earn (×1…×4). */
  readonly comboMultiplier: number;
}

export interface RunControllerOptions {
  readonly level: LevelDefinition;
  readonly bus: GameEventBus;
  /** Wall-clock in milliseconds; injected for deterministic tests. */
  readonly clock?: () => number;
  /**
   * Polled once per simulated tick. Must have consume semantics for
   * jumpQueued (the input controller resets it after each read).
   */
  readonly getActions?: () => ActionState;
}

/**
 * Owns one run: the simulation plus the clock mapping that converts a
 * master timeline into exact SIM_TICK_HZ ticks.
 *
 * Two drive modes, both deterministic (the tick sequence is a pure
 * function of the action log — only WHEN ticks execute differs):
 * - advanceToSongTime(songSec): MUSIC-MASTER. The audio clock is the
 *   timeline; tick = floor(songSec × SIM_TICK_HZ). Suspending the
 *   AudioContext freezes the song position and therefore the world.
 * - advance(nowMs): wall-clock fallback for silent rides (audio blocked
 *   or unavailable). Integer targeting over accumulated elapsed time.
 */
export class RunController {
  private readonly sim: Simulation;
  private readonly clock: () => number;
  private status_: RunStatus = 'idle';
  private elapsedMs = 0;
  private lastNowMs: number | null = null;
  private startedAtMs = 0;

  constructor(private readonly options: RunControllerOptions) {
    this.sim = createSimulation(options.level);
    this.clock = options.clock ?? ((): number => performance.now());
  }

  get status(): RunStatus {
    return this.status_;
  }

  get currentTick(): number {
    return this.sim.state.tick;
  }

  /** Starts the run and announces it on the bus. Throws if already started. */
  start(): void {
    if (this.status_ !== 'idle') {
      throw new Error(`run already ${this.status_}`);
    }
    this.status_ = 'running';
    this.startedAtMs = this.clock();
    this.options.bus.emit('game:started', {
      audioHash: this.options.level.audioHash,
      seed: this.options.level.seed,
    });
  }

  /**
   * MUSIC-MASTER drive: advances the simulation to the tick matching the
   * current song position. Never rewinds; catch-up is bounded per call.
   * Returns the number of ticks actually stepped.
   */
  advanceToSongTime(songSec: number): number {
    if (this.status_ !== 'running' || !Number.isFinite(songSec)) {
      return 0;
    }
    const targetTick = Math.min(
      Math.floor(songSec * SIM_TICK_HZ),
      this.sim.state.tick + MAX_CATCHUP_TICKS,
    );
    const steps = this.stepUntil(targetTick);
    // Keep the wall accumulator coherent so a mid-run fallback to
    // advance() (audio device died) resumes from the same timeline.
    this.elapsedMs = (this.sim.state.tick * 1000) / SIM_TICK_HZ;
    this.lastNowMs = null;
    return steps;
  }

  /**
   * Wall-clock fallback: advances the simulation up to `nowMs`. The first
   * call after start, pause or resume only anchors the clock. Returns the
   * number of ticks actually stepped.
   */
  advance(nowMs: number): number {
    if (this.status_ !== 'running') {
      return 0;
    }
    if (this.lastNowMs === null) {
      this.lastNowMs = nowMs;
      return 0;
    }
    const delta = Math.min(Math.max(nowMs - this.lastNowMs, 0), MAX_ADVANCE_MS);
    this.lastNowMs = nowMs;
    this.elapsedMs += delta;
    return this.stepUntil(Math.floor((this.elapsedMs * SIM_TICK_HZ) / 1000));
  }

  /** Suspends the accumulator; advance() becomes a no-op until resume(). */
  pause(): void {
    if (this.status_ === 'running') {
      this.status_ = 'paused';
      this.lastNowMs = null;
    }
  }

  /** Re-arms the accumulator; the next advance() re-anchors, no catch-up burst. */
  resume(): void {
    if (this.status_ === 'paused') {
      this.status_ = 'running';
      this.lastNowMs = null;
    }
  }

  snapshot(): SimSnapshot {
    const { state, level } = this.sim;
    return {
      tick: state.tick,
      x: state.x,
      y: state.y,
      score: state.score,
      distanceM: Math.min(state.x, level.finishX),
      boostFraction: state.boostSecLeft / PLAYER.maxBoostSec,
      boosting: state.boosting,
      grounded: state.grounded,
      crashed: state.crashed,
      finished: state.finished,
      combo: state.combo,
      comboMultiplier: comboMultiplier(state.combo),
    };
  }

  private stepUntil(targetTick: number): number {
    let steps = 0;
    while (this.sim.state.tick < targetTick) {
      const stillRunning = this.stepOnce();
      steps += 1;
      if (!stillRunning) {
        break;
      }
    }
    return steps;
  }

  /** Steps one fixed tick. Returns false when the run ended during the step. */
  private stepOnce(): boolean {
    const actions = this.options.getActions?.() ?? IDLE_ACTIONS;
    const events = stepSimulation(this.sim, actions);
    const tick = this.sim.state.tick;
    for (const event of events) {
      if (event.kind === 'collision') {
        this.options.bus.emit('game:collision', { obstacleId: event.obstacleId, tick });
      } else if (event.kind === 'collect') {
        this.options.bus.emit('game:collect', {
          collectibleId: event.collectibleId,
          score: event.score,
          tick,
        });
      } else if (event.kind === 'noteMiss') {
        this.options.bus.emit('game:noteMiss', { collectibleId: event.collectibleId, tick });
      } else if (event.kind === 'land') {
        this.options.bus.emit('game:landed', { tick });
      }
    }
    if (this.sim.state.crashed || this.sim.state.finished) {
      this.status_ = 'ended';
      const result = buildRunResult(this.sim, this.clock() - this.startedAtMs);
      this.options.bus.emit('game:finished', { result });
      return false;
    }
    return true;
  }
}
