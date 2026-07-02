import { createGameEventBus } from '@viberide/shared';
import type { GameEventMap, RunResult } from '@viberide/shared';
import { describe, expect, it } from 'vitest';

import { IDLE_ACTIONS } from './physics';
import type { ActionState } from './physics';
import { MAX_ADVANCE_MS, RunController } from './run-controller';
import { makeCollectible, makeFlatLevel, makeObstacle } from './testing/levels';

interface Harness {
  readonly controller: RunController;
  readonly events: { [K in keyof GameEventMap]?: GameEventMap[K][] };
  setClock(ms: number): void;
}

function makeHarness(
  level = makeFlatLevel({ lengthM: 200 }),
  getActions: () => ActionState = () => IDLE_ACTIONS,
): Harness {
  const bus = createGameEventBus();
  const events: Harness['events'] = {};
  const record = <K extends keyof GameEventMap>(name: K): void => {
    bus.on(name, (payload) => {
      // TS collapses the union of per-event array types to `never` when
      // pushing through the generic index — safe here by construction.
      (events[name] ??= []).push(payload as never);
    });
  };
  record('game:started');
  record('game:collision');
  record('game:collect');
  record('game:finished');

  let clock = 0;
  const controller = new RunController({ level, bus, clock: () => clock, getActions });
  return {
    controller,
    events,
    setClock(ms: number): void {
      clock = ms;
    },
  };
}

describe('RunController accumulator', () => {
  const CHUNKINGS: readonly (readonly number[])[] = [
    [1000],
    [500, 500],
    Array.from({ length: 100 }, () => 10),
    Array.from({ length: 16 }, () => 62.5),
  ];

  it.each(CHUNKINGS.map((chunks) => [chunks.length, chunks] as const))(
    'produces exactly 60 ticks for 1000 ms delivered in %d chunk(s)',
    (_count, chunks) => {
      const { controller } = makeHarness();
      controller.start();
      expect(controller.advance(0)).toBe(0); // anchor
      let now = 0;
      let ticks = 0;
      for (const chunk of chunks) {
        now += chunk;
        ticks += controller.advance(now);
      }
      expect(ticks).toBe(60);
      expect(controller.currentTick).toBe(60);
    },
  );

  it('clamps one oversized frame delta to MAX_ADVANCE_MS', () => {
    const { controller } = makeHarness();
    controller.start();
    controller.advance(0);
    const ticks = controller.advance(10 * MAX_ADVANCE_MS);
    expect(ticks).toBe(60);
  });

  it('ignores advance before start and after end', () => {
    const { controller } = makeHarness(
      makeFlatLevel({ obstacles: [makeObstacle({ kind: 'spike', x: 20 })] }),
    );
    expect(controller.advance(100)).toBe(0);
    controller.start();
    controller.advance(0);
    controller.advance(1000);
    controller.advance(2000);
    controller.advance(3000);
    expect(controller.status).toBe('ended');
    expect(controller.advance(4000)).toBe(0);
  });
});

describe('RunController events', () => {
  it('emits game:started with the level identity', () => {
    const level = makeFlatLevel();
    const { controller, events } = makeHarness(level);
    controller.start();
    expect(events['game:started']).toEqual([{ audioHash: level.audioHash, seed: level.seed }]);
  });

  it('throws when started twice', () => {
    const { controller } = makeHarness();
    controller.start();
    expect(() => {
      controller.start();
    }).toThrow('run already');
  });

  it('relays collect events with their tick', () => {
    const pickup = makeCollectible({ x: 5, y: 0.3, score: 10 });
    const { controller, events } = makeHarness(
      makeFlatLevel({ lengthM: 200, collectibles: [pickup] }),
    );
    controller.start();
    controller.advance(0);
    controller.advance(1000);
    const collects = events['game:collect'] ?? [];
    expect(collects).toHaveLength(1);
    expect(collects[0]?.collectibleId).toBe(pickup.id);
    expect(collects[0]?.score).toBe(10);
    expect(collects[0]?.tick).toBeGreaterThan(0);
  });

  it('ends a crashed run with game:collision then game:finished', () => {
    const spike = makeObstacle({ kind: 'spike', x: 20 });
    const harness = makeHarness(makeFlatLevel({ obstacles: [spike] }));
    harness.setClock(100);
    harness.controller.start();
    harness.controller.advance(0);
    harness.setClock(3100);
    harness.controller.advance(1000);
    harness.controller.advance(2000);
    harness.controller.advance(3000);

    expect(harness.controller.status).toBe('ended');
    const collisions = harness.events['game:collision'] ?? [];
    expect(collisions).toHaveLength(1);
    expect(collisions[0]?.obstacleId).toBe(spike.id);

    const finished = harness.events['game:finished'] ?? [];
    expect(finished).toHaveLength(1);
    const result: RunResult | undefined = finished[0]?.result;
    expect(result?.finished).toBe(false);
    expect(result?.durationMs).toBe(3000);
    expect(result?.checkpoints.length).toBeGreaterThan(0);
  });

  it('ends a finished run with finished=true and score in the result', () => {
    const level = makeFlatLevel({ lengthM: 40 });
    const { controller, events } = makeHarness(level);
    controller.start();
    controller.advance(0);
    for (let second = 1; second <= 6; second += 1) {
      controller.advance(second * 1000);
    }
    expect(controller.status).toBe('ended');
    const result = (events['game:finished'] ?? [])[0]?.result;
    expect(result?.finished).toBe(true);
    expect(result?.score).toBeLessThanOrEqual(level.maxScore);
    expect(result?.distanceM).toBe(level.finishX);
  });
});

describe('RunController pause/resume', () => {
  it('freezes ticks while paused and re-anchors on resume', () => {
    const { controller } = makeHarness();
    controller.start();
    controller.advance(0);
    controller.advance(500);
    expect(controller.currentTick).toBe(30);

    controller.pause();
    expect(controller.status).toBe('paused');
    expect(controller.advance(5000)).toBe(0);
    expect(controller.currentTick).toBe(30);

    controller.resume();
    expect(controller.status).toBe('running');
    // First advance after resume only re-anchors — no catch-up burst.
    expect(controller.advance(9000)).toBe(0);
    expect(controller.advance(9500)).toBe(30);
    expect(controller.currentTick).toBe(60);
  });

  it('exposes a HUD-ready snapshot', () => {
    const { controller } = makeHarness();
    controller.start();
    controller.advance(0);
    controller.advance(1000);
    const snapshot = controller.snapshot();
    expect(snapshot.tick).toBe(60);
    expect(snapshot.distanceM).toBeCloseTo(8, 3);
    expect(snapshot.boostFraction).toBe(1);
    expect(snapshot.crashed).toBe(false);
    expect(snapshot.finished).toBe(false);
    expect(snapshot.grounded).toBe(true);
  });
});
