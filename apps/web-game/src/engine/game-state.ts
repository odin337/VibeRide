import type { Unsubscribe } from '@viberide/shared';

/** Top-level UI/game flow states. */
export type GamePhase =
  'menu' | 'analyzing' | 'ready' | 'playing' | 'paused' | 'crashed' | 'finished';

/**
 * Explicit transition table — the single source of truth for the game
 * flow. Anything not listed here is a programming error and throws.
 */
export const PHASE_TRANSITIONS: Readonly<Record<GamePhase, readonly GamePhase[]>> = {
  menu: ['analyzing'],
  analyzing: ['ready', 'menu'],
  ready: ['playing', 'menu'],
  playing: ['paused', 'crashed', 'finished'],
  paused: ['playing', 'menu'],
  crashed: ['ready', 'menu'],
  finished: ['ready', 'menu'],
};

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: GamePhase,
    public readonly to: GamePhase,
  ) {
    super(`invalid game state transition: ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export class GameStateMachine {
  private current: GamePhase;
  private readonly listeners = new Set<(phase: GamePhase) => void>();

  constructor(initial: GamePhase = 'menu') {
    this.current = initial;
  }

  get phase(): GamePhase {
    return this.current;
  }

  canTransition(to: GamePhase): boolean {
    return PHASE_TRANSITIONS[this.current].includes(to);
  }

  /** Moves to `to`, notifying subscribers; throws InvalidTransitionError otherwise. */
  transition(to: GamePhase): void {
    if (!this.canTransition(to)) {
      throw new InvalidTransitionError(this.current, to);
    }
    this.current = to;
    for (const listener of [...this.listeners]) {
      listener(to);
    }
  }

  subscribe(listener: (phase: GamePhase) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
