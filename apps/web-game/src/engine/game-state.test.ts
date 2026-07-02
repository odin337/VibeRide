import { describe, expect, it } from 'vitest';

import { GameStateMachine, InvalidTransitionError, PHASE_TRANSITIONS } from './game-state';
import type { GamePhase } from './game-state';

const ALL_PHASES = Object.keys(PHASE_TRANSITIONS) as GamePhase[];

describe('GameStateMachine', () => {
  it('starts in menu by default', () => {
    expect(new GameStateMachine().phase).toBe('menu');
  });

  it.each(ALL_PHASES)('allows exactly the listed transitions from %s', (from) => {
    for (const to of ALL_PHASES) {
      const machine = new GameStateMachine(from);
      const allowed = PHASE_TRANSITIONS[from].includes(to);
      expect(machine.canTransition(to)).toBe(allowed);
      if (allowed) {
        machine.transition(to);
        expect(machine.phase).toBe(to);
      } else {
        expect(() => {
          machine.transition(to);
        }).toThrow(InvalidTransitionError);
        expect(machine.phase).toBe(from);
      }
    }
  });

  it('walks the happy path menu → … → finished → ready', () => {
    const machine = new GameStateMachine();
    for (const phase of ['analyzing', 'ready', 'playing', 'finished', 'ready'] as const) {
      machine.transition(phase);
    }
    expect(machine.phase).toBe('ready');
  });

  it('reports from/to on invalid transitions', () => {
    const machine = new GameStateMachine();
    try {
      machine.transition('playing');
      expect.unreachable('transition should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidTransitionError);
      const typed = error as InvalidTransitionError;
      expect(typed.from).toBe('menu');
      expect(typed.to).toBe('playing');
      expect(typed.message).toContain('menu -> playing');
    }
  });

  it('notifies subscribers and honours unsubscribe', () => {
    const machine = new GameStateMachine();
    const seen: GamePhase[] = [];
    const unsubscribe = machine.subscribe((phase) => seen.push(phase));
    machine.transition('analyzing');
    machine.transition('ready');
    unsubscribe();
    machine.transition('playing');
    expect(seen).toEqual(['analyzing', 'ready']);
  });
});
