import { createGameEventBus } from '@viberide/shared';
import type { GameEventMap } from '@viberide/shared';
import { describe, expect, it } from 'vitest';

import {
  controlForKeyCode,
  GAMEPAD_BOOST_BUTTON,
  GAMEPAD_JUMP_BUTTON,
  InputController,
  isBoostHold,
  KEY_BINDINGS,
  POINTER_HOLD_BOOST_MS,
  readGamepadButtons,
} from './input-controller';
import type { GamepadLike } from './input-controller';

function pad(pressed: number[]): GamepadLike {
  const buttons = Array.from({ length: 10 }, (_, index) => ({
    pressed: pressed.includes(index),
  }));
  return { buttons };
}

describe('controlForKeyCode', () => {
  it.each([
    ['Space', 'jump'],
    ['ArrowUp', 'jump'],
    ['ShiftLeft', 'boost'],
    ['ArrowRight', 'boost'],
    ['ArrowLeft', 'lean'],
    ['ArrowDown', 'lean'],
  ] as const)('maps %s to %s', (code, control) => {
    expect(controlForKeyCode(code)).toBe(control);
  });

  it('returns null for unbound keys', () => {
    expect(controlForKeyCode('KeyQ')).toBeNull();
    expect(controlForKeyCode('Escape')).toBeNull();
    expect(Object.keys(KEY_BINDINGS)).toHaveLength(6);
  });
});

describe('isBoostHold', () => {
  it('is false without an active press', () => {
    expect(isBoostHold(null, 1000)).toBe(false);
  });

  it('flips exactly at the threshold', () => {
    expect(isBoostHold(1000, 1000 + POINTER_HOLD_BOOST_MS - 1)).toBe(false);
    expect(isBoostHold(1000, 1000 + POINTER_HOLD_BOOST_MS)).toBe(true);
  });
});

describe('readGamepadButtons', () => {
  it('reads jump (0) and boost (7) across pads, tolerating nulls', () => {
    expect(readGamepadButtons([])).toEqual({ jumpHeld: false, boostHeld: false });
    expect(readGamepadButtons([null, pad([GAMEPAD_JUMP_BUTTON])])).toEqual({
      jumpHeld: true,
      boostHeld: false,
    });
    expect(readGamepadButtons([pad([GAMEPAD_BOOST_BUTTON]), null])).toEqual({
      jumpHeld: false,
      boostHeld: true,
    });
    expect(readGamepadButtons([pad([]), pad([0, 7])])).toEqual({
      jumpHeld: true,
      boostHeld: true,
    });
  });

  it('handles pads with too few buttons', () => {
    expect(readGamepadButtons([{ buttons: [] }])).toEqual({ jumpHeld: false, boostHeld: false });
  });
});

describe('InputController', () => {
  function makeController(): {
    controller: InputController;
    actions: GameEventMap['game:action'][];
    setNow(ms: number): void;
  } {
    const bus = createGameEventBus();
    const actions: GameEventMap['game:action'][] = [];
    bus.on('game:action', (payload) => {
      actions.push(payload);
    });
    let now = 0;
    let tick = 0;
    const controller = new InputController({
      bus,
      now: () => now,
      getTick: () => tick,
    });
    return {
      controller,
      actions,
      setNow(ms: number): void {
        now = ms;
        tick = Math.floor((ms / 1000) * 60);
      },
    };
  }

  function key(type: 'keydown' | 'keyup', code: string, repeat = false): KeyboardEvent {
    return new KeyboardEvent(type, { code, repeat, cancelable: true });
  }

  it('queues a jump on Space and consumes it exactly once', () => {
    const { controller, actions } = makeController();
    controller.attach(window);
    window.dispatchEvent(key('keydown', 'Space'));
    expect(controller.consume(0)).toEqual({ jumpQueued: true, boostHeld: false, lean: 0 });
    expect(controller.consume(0).jumpQueued).toBe(false);
    expect(actions).toEqual([{ action: 'jump', tick: 0 }]);
    controller.detach();
  });

  it('ignores key auto-repeat', () => {
    const { controller, actions } = makeController();
    controller.attach(window);
    window.dispatchEvent(key('keydown', 'Space'));
    controller.consume(0);
    window.dispatchEvent(key('keydown', 'Space', true));
    expect(controller.consume(0).jumpQueued).toBe(false);
    expect(actions).toHaveLength(1);
    controller.detach();
  });

  it('holds boost while a boost key is down and emits one edge event', () => {
    const { controller, actions } = makeController();
    controller.attach(window);
    window.dispatchEvent(key('keydown', 'ShiftLeft'));
    window.dispatchEvent(key('keydown', 'ArrowRight'));
    expect(controller.consume(0).boostHeld).toBe(true);
    window.dispatchEvent(key('keyup', 'ShiftLeft'));
    expect(controller.consume(0).boostHeld).toBe(true);
    window.dispatchEvent(key('keyup', 'ArrowRight'));
    expect(controller.consume(0).boostHeld).toBe(false);
    expect(actions.filter((action) => action.action === 'boost')).toHaveLength(1);
    controller.detach();
  });

  it('maps lean keys to lean=-1 and emits a leanBack edge', () => {
    const { controller, actions } = makeController();
    controller.attach(window);
    window.dispatchEvent(key('keydown', 'ArrowLeft'));
    expect(controller.consume(0).lean).toBe(-1);
    window.dispatchEvent(key('keyup', 'ArrowLeft'));
    expect(controller.consume(0).lean).toBe(0);
    expect(actions).toEqual([{ action: 'leanBack', tick: 0 }]);
    controller.detach();
  });

  it('treats a pointer tap as jump and a long hold as boost', () => {
    const { controller, actions, setNow } = makeController();
    controller.attach(window);

    setNow(1000);
    window.dispatchEvent(new Event('pointerdown'));
    expect(controller.consume(1000)).toEqual({ jumpQueued: true, boostHeld: false, lean: 0 });

    // Held but still under the threshold.
    expect(controller.consume(1000 + POINTER_HOLD_BOOST_MS - 1).boostHeld).toBe(false);
    // Threshold crossed → boost, announced once.
    expect(controller.consume(1000 + POINTER_HOLD_BOOST_MS).boostHeld).toBe(true);
    expect(controller.consume(1000 + POINTER_HOLD_BOOST_MS + 50).boostHeld).toBe(true);

    window.dispatchEvent(new Event('pointerup'));
    expect(controller.consume(2000).boostHeld).toBe(false);

    const kinds = actions.map((action) => action.action);
    expect(kinds).toEqual(['jump', 'boost']);
    controller.detach();
  });

  it('tags emitted actions with the supplied tick', () => {
    const { controller, actions, setNow } = makeController();
    controller.attach(window);
    setNow(2000); // tick 120
    window.dispatchEvent(key('keydown', 'Space'));
    expect(actions).toEqual([{ action: 'jump', tick: 120 }]);
    controller.detach();
  });

  it('rises gamepad jump edges and holds gamepad boost', () => {
    const { controller, actions } = makeController();
    controller.updateGamepads([pad([GAMEPAD_JUMP_BUTTON, GAMEPAD_BOOST_BUTTON])]);
    expect(controller.consume(0)).toEqual({ jumpQueued: true, boostHeld: true, lean: 0 });

    // Still held: no new jump, boost persists.
    controller.updateGamepads([pad([GAMEPAD_JUMP_BUTTON, GAMEPAD_BOOST_BUTTON])]);
    expect(controller.consume(0)).toEqual({ jumpQueued: false, boostHeld: true, lean: 0 });

    controller.updateGamepads([pad([])]);
    expect(controller.consume(0)).toEqual({ jumpQueued: false, boostHeld: false, lean: 0 });

    // Released then pressed again: a fresh edge.
    controller.updateGamepads([pad([GAMEPAD_JUMP_BUTTON])]);
    expect(controller.consume(0).jumpQueued).toBe(true);
    expect(actions.map((action) => action.action)).toEqual(['jump', 'boost', 'jump']);
  });

  it('clears all held state on blur', () => {
    const { controller } = makeController();
    controller.attach(window);
    window.dispatchEvent(key('keydown', 'ShiftLeft'));
    window.dispatchEvent(key('keydown', 'ArrowLeft'));
    window.dispatchEvent(new Event('blur'));
    expect(controller.consume(0)).toEqual({ jumpQueued: false, boostHeld: false, lean: 0 });
    controller.detach();
  });

  it('stops listening after detach', () => {
    const { controller } = makeController();
    controller.attach(window);
    controller.detach();
    window.dispatchEvent(key('keydown', 'Space'));
    expect(controller.consume(0).jumpQueued).toBe(false);
  });

  it('works without a bus or tick supplier', () => {
    const controller = new InputController();
    controller.updateGamepads([pad([GAMEPAD_JUMP_BUTTON])]);
    expect(controller.consume(0)).toEqual({ jumpQueued: true, boostHeld: false, lean: 0 });
  });
});
