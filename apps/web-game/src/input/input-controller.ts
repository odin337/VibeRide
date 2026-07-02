import type { GameEventBus, PlayerAction } from '@viberide/shared';

import type { ActionState } from '../engine/physics';

/**
 * Keyboard / pointer / gamepad → ActionState. The pure mapping helpers
 * (key bindings, tap-vs-hold threshold, gamepad button reads) are exported
 * separately so they are testable without any DOM events.
 *
 * The controller emits informational 'game:action' events on the bus at
 * input time (per the architecture event table the Input module is the
 * emitter); the simulation itself consumes only the polled ActionState.
 */

export type InputControl = 'jump' | 'boost' | 'lean';

export const KEY_BINDINGS: Readonly<Record<string, InputControl>> = {
  Space: 'jump',
  ArrowUp: 'jump',
  ShiftLeft: 'boost',
  ArrowRight: 'boost',
  ArrowLeft: 'lean',
  ArrowDown: 'lean',
};

/** Maps a KeyboardEvent.code to its game control, or null when unbound. */
export function controlForKeyCode(code: string): InputControl | null {
  return KEY_BINDINGS[code] ?? null;
}

/** A pointer press held at least this long becomes boost instead of a tap. */
export const POINTER_HOLD_BOOST_MS = 250;

/** Pure tap-vs-hold decision: is a press started at `downAtMs` a boost hold now? */
export function isBoostHold(downAtMs: number | null, nowMs: number): boolean {
  return downAtMs !== null && nowMs - downAtMs >= POINTER_HOLD_BOOST_MS;
}

export const GAMEPAD_JUMP_BUTTON = 0;
export const GAMEPAD_BOOST_BUTTON = 7;

/** Structural subset of Gamepad so tests can pass plain objects. */
export interface GamepadLike {
  readonly buttons: readonly { readonly pressed: boolean }[];
}

export interface GamepadButtonsState {
  readonly jumpHeld: boolean;
  readonly boostHeld: boolean;
}

/** Pure read of the jump/boost buttons across all connected pads. */
export function readGamepadButtons(pads: readonly (GamepadLike | null)[]): GamepadButtonsState {
  let jumpHeld = false;
  let boostHeld = false;
  for (const pad of pads) {
    if (!pad) {
      continue;
    }
    jumpHeld = jumpHeld || (pad.buttons[GAMEPAD_JUMP_BUTTON]?.pressed ?? false);
    boostHeld = boostHeld || (pad.buttons[GAMEPAD_BOOST_BUTTON]?.pressed ?? false);
  }
  return { jumpHeld, boostHeld };
}

export interface InputControllerOptions {
  /** Receives informational 'game:action' events; optional. */
  readonly bus?: GameEventBus;
  /** Supplies the simulation tick attached to emitted events. */
  readonly getTick?: () => number;
  /** Wall clock for the pointer hold threshold; injected for tests. */
  readonly now?: () => number;
}

export class InputController {
  private readonly now: () => number;
  private jumpQueued = false;
  private readonly boostKeys = new Set<string>();
  private readonly leanKeys = new Set<string>();
  private pointerDownAtMs: number | null = null;
  private pointerBoostAnnounced = false;
  private gamepadJumpHeld = false;
  private gamepadBoostHeld = false;
  private target: EventTarget | null = null;

  constructor(private readonly options: InputControllerOptions = {}) {
    this.now = options.now ?? ((): number => performance.now());
  }

  /** Starts listening on `target` (usually window). Idempotent per target. */
  attach(target: EventTarget): void {
    if (this.target) {
      this.detach();
    }
    this.target = target;
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('pointerdown', this.onPointerDown);
    target.addEventListener('pointerup', this.onPointerUp);
    target.addEventListener('pointercancel', this.onPointerUp);
    target.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    const target = this.target;
    if (!target) {
      return;
    }
    target.removeEventListener('keydown', this.onKeyDown);
    target.removeEventListener('keyup', this.onKeyUp);
    target.removeEventListener('pointerdown', this.onPointerDown);
    target.removeEventListener('pointerup', this.onPointerUp);
    target.removeEventListener('pointercancel', this.onPointerUp);
    target.removeEventListener('blur', this.onBlur);
    this.target = null;
    this.reset();
  }

  /** Feeds the current gamepad poll (call once per frame with navigator pads). */
  updateGamepads(pads: readonly (GamepadLike | null)[]): void {
    const { jumpHeld, boostHeld } = readGamepadButtons(pads);
    if (jumpHeld && !this.gamepadJumpHeld) {
      this.queueJump();
    }
    if (boostHeld && !this.gamepadBoostHeld) {
      this.emitAction('boost');
    }
    this.gamepadJumpHeld = jumpHeld;
    this.gamepadBoostHeld = boostHeld;
  }

  /**
   * Returns the ActionState for the next simulation tick and consumes the
   * queued jump (a jump fires at most one tick).
   */
  consume(nowMs: number = this.now()): ActionState {
    const pointerBoost = isBoostHold(this.pointerDownAtMs, nowMs);
    if (pointerBoost && !this.pointerBoostAnnounced) {
      this.pointerBoostAnnounced = true;
      this.emitAction('boost');
    }
    const state: ActionState = {
      jumpQueued: this.jumpQueued,
      boostHeld: this.boostKeys.size > 0 || this.gamepadBoostHeld || pointerBoost,
      lean: this.leanKeys.size > 0 ? -1 : 0,
    };
    this.jumpQueued = false;
    return state;
  }

  private reset(): void {
    this.jumpQueued = false;
    this.boostKeys.clear();
    this.leanKeys.clear();
    this.pointerDownAtMs = null;
    this.pointerBoostAnnounced = false;
    this.gamepadJumpHeld = false;
    this.gamepadBoostHeld = false;
  }

  private queueJump(): void {
    this.jumpQueued = true;
    this.emitAction('jump');
  }

  private emitAction(action: PlayerAction): void {
    this.options.bus?.emit('game:action', { action, tick: this.options.getTick?.() ?? 0 });
  }

  private readonly onKeyDown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent) || event.repeat) {
      return;
    }
    const control = controlForKeyCode(event.code);
    if (control === 'jump') {
      event.preventDefault();
      this.queueJump();
    } else if (control === 'boost') {
      event.preventDefault();
      if (this.boostKeys.size === 0) {
        this.emitAction('boost');
      }
      this.boostKeys.add(event.code);
    } else if (control === 'lean') {
      event.preventDefault();
      if (this.leanKeys.size === 0) {
        this.emitAction('leanBack');
      }
      this.leanKeys.add(event.code);
    }
  };

  private readonly onKeyUp = (event: Event): void => {
    if (!(event instanceof KeyboardEvent)) {
      return;
    }
    this.boostKeys.delete(event.code);
    this.leanKeys.delete(event.code);
  };

  private readonly onPointerDown = (): void => {
    this.pointerDownAtMs = this.now();
    this.pointerBoostAnnounced = false;
    // A tap jumps immediately; keeping the press turns into boost at the
    // POINTER_HOLD_BOOST_MS threshold (evaluated per consumed tick).
    this.queueJump();
  };

  private readonly onPointerUp = (): void => {
    this.pointerDownAtMs = null;
    this.pointerBoostAnnounced = false;
  };

  private readonly onBlur = (): void => {
    this.reset();
  };
}
