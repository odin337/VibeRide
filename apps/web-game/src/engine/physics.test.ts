import { CHECKPOINT_INTERVAL_TICKS, FINISH_SCORE, GRAVITY, PLAYER, SIM_DT } from '@viberide/shared';
import { generateLevel, makeBeatMap } from '@viberide/track-generator';
import { describe, expect, it } from 'vitest';

import {
  buildRunResult,
  createSimulation,
  gapAt,
  GAP_CRASH_EPSILON_M,
  IDLE_ACTIONS,
  movingPlatformOffsetY,
  MOVING_PLATFORM_AMPLITUDE_M,
  MOVING_PLATFORM_PERIOD_SEC,
  sampleTerrainHeight,
  stepSimulation,
} from './physics';
import type { ActionState, SimEvent, Simulation } from './physics';
import { makeCollectible, makeFlatLevel, makeLevel, makeObstacle } from './testing/levels';

const JUMP: ActionState = { jumpQueued: true, boostHeld: false, lean: 0 };
const BOOST: ActionState = { jumpQueued: false, boostHeld: true, lean: 0 };

/** Steps `sim` up to `maxTicks`, collecting events; stops when the run ends. */
function run(
  sim: Simulation,
  maxTicks: number,
  actionsFor: (sim: Simulation) => ActionState = () => IDLE_ACTIONS,
): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < maxTicks; i += 1) {
    events.push(...stepSimulation(sim, actionsFor(sim)));
    if (sim.state.crashed || sim.state.finished) {
      break;
    }
  }
  return events;
}

describe('sampleTerrainHeight', () => {
  const hill = makeLevel({ heightAt: (x) => Math.min(2, Math.max(0, (x - 20) * 0.5)) });

  it('interpolates linearly between heightfield samples', () => {
    expect(sampleTerrainHeight(hill, 21)).toBeCloseTo(0.5, 6);
    expect(sampleTerrainHeight(hill, 21.25)).toBeCloseTo(0.625, 6);
  });

  it('clamps outside the sampled range', () => {
    expect(sampleTerrainHeight(hill, -10)).toBe(0);
    expect(sampleTerrainHeight(hill, 1e6)).toBe(2);
  });
});

describe('jumping', () => {
  it('reaches an apex close to v^2 / 2|g|', () => {
    const sim = createSimulation(makeFlatLevel());
    stepSimulation(sim, JUMP);
    let apex = 0;
    for (let i = 0; i < 120; i += 1) {
      stepSimulation(sim, IDLE_ACTIONS);
      apex = Math.max(apex, sim.state.y);
      if (sim.state.grounded) {
        break;
      }
    }
    const theoretical = PLAYER.jumpVelocity ** 2 / (2 * Math.abs(GRAVITY));
    expect(apex).toBeGreaterThan(theoretical - 0.12);
    expect(apex).toBeLessThanOrEqual(theoretical);
  });

  it('ignores jump input while airborne (no double jump)', () => {
    const sim = createSimulation(makeFlatLevel());
    stepSimulation(sim, JUMP);
    let apex = 0;
    // Spam jump every airborne tick — the apex must stay a single-jump apex.
    for (let i = 0; i < 120 && !sim.state.grounded; i += 1) {
      stepSimulation(sim, JUMP);
      apex = Math.max(apex, sim.state.y);
    }
    const theoretical = PLAYER.jumpVelocity ** 2 / (2 * Math.abs(GRAVITY));
    expect(apex).toBeLessThanOrEqual(theoretical);
    expect(sim.state.grounded).toBe(true);
  });

  it('lands back on the terrain with zero vertical velocity', () => {
    const sim = createSimulation(makeFlatLevel());
    stepSimulation(sim, JUMP);
    run(sim, 120, () => IDLE_ACTIONS);
    expect(sim.state.grounded).toBe(true);
    expect(sim.state.y).toBe(0);
    expect(sim.state.vy).toBe(0);
  });
});

describe('terrain following', () => {
  it('keeps a grounded car glued to an uphill slope', () => {
    const level = makeLevel({ heightAt: (x) => Math.min(3, Math.max(0, (x - 15) * 0.4)) });
    const sim = createSimulation(level);
    run(sim, 200);
    expect(sim.state.grounded).toBe(true);
    expect(sim.state.y).toBeCloseTo(sampleTerrainHeight(level, sim.state.x), 6);
    expect(sim.state.y).toBeGreaterThan(0.5);
  });
});

describe('boost', () => {
  it('multiplies horizontal speed while held', () => {
    const boosted = createSimulation(makeFlatLevel());
    const base = createSimulation(makeFlatLevel());
    for (let i = 0; i < 60; i += 1) {
      stepSimulation(boosted, BOOST);
      stepSimulation(base, IDLE_ACTIONS);
    }
    expect(boosted.state.x).toBeCloseTo(base.state.x * PLAYER.boostMultiplier, 6);
  });

  it('drains the meter at 1 s/s and cuts out when empty', () => {
    const sim = createSimulation(makeFlatLevel({ lengthM: 200 }));
    for (let i = 0; i < 60; i += 1) {
      stepSimulation(sim, BOOST);
    }
    expect(sim.state.boostSecLeft).toBeCloseTo(PLAYER.maxBoostSec - 1, 6);

    // One extra tick soaks up any accumulated float residue after 2 s.
    for (let i = 0; i < 61; i += 1) {
      stepSimulation(sim, BOOST);
    }
    expect(sim.state.boostSecLeft).toBe(0);

    // Meter empty and still held: no boost, no refill.
    const xBefore = sim.state.x;
    stepSimulation(sim, BOOST);
    expect(sim.state.boosting).toBe(false);
    expect(sim.state.boostSecLeft).toBe(0);
    expect(sim.state.x - xBefore).toBeCloseTo(8 * SIM_DT, 6);
  });

  it('refills only while grounded with the button released, capped at max', () => {
    const sim = createSimulation(makeFlatLevel({ lengthM: 200 }));
    for (let i = 0; i < 120; i += 1) {
      stepSimulation(sim, BOOST);
    }
    expect(sim.state.boostSecLeft).toBeCloseTo(0, 6);

    for (let i = 0; i < 30; i += 1) {
      stepSimulation(sim, IDLE_ACTIONS);
    }
    expect(sim.state.boostSecLeft).toBeCloseTo(0.5, 6);

    for (let i = 0; i < 600; i += 1) {
      stepSimulation(sim, IDLE_ACTIONS);
    }
    expect(sim.state.boostSecLeft).toBe(PLAYER.maxBoostSec);
  });

  it('does not refill while airborne', () => {
    const sim = createSimulation(makeFlatLevel());
    for (let i = 0; i < 30; i += 1) {
      stepSimulation(sim, BOOST);
    }
    stepSimulation(sim, JUMP);
    const drained = sim.state.boostSecLeft;
    for (let i = 0; i < 10 && !sim.state.grounded; i += 1) {
      stepSimulation(sim, IDLE_ACTIONS);
    }
    expect(sim.state.grounded).toBe(false);
    expect(sim.state.boostSecLeft).toBe(drained);
  });
});

describe('lean', () => {
  it('slows the car down when leaning back', () => {
    const leaning = createSimulation(makeFlatLevel());
    const base = createSimulation(makeFlatLevel());
    for (let i = 0; i < 60; i += 1) {
      stepSimulation(leaning, { jumpQueued: false, boostHeld: false, lean: -1 });
      stepSimulation(base, IDLE_ACTIONS);
    }
    expect(leaning.state.x).toBeLessThan(base.state.x);
    expect(leaning.state.x).toBeCloseTo(base.state.x * 0.85, 6);
  });

  it('never exceeds the boost kinematic ceiling', () => {
    const sim = createSimulation(makeFlatLevel());
    stepSimulation(sim, { jumpQueued: false, boostHeld: true, lean: 1 });
    expect(sim.state.x).toBeCloseTo(8 * PLAYER.boostMultiplier * SIM_DT, 6);
  });
});

describe('obstacles', () => {
  it('crashes into a spike when not jumping', () => {
    const spike = makeObstacle({ kind: 'spike', x: 20 });
    const sim = createSimulation(makeFlatLevel({ obstacles: [spike] }));
    const events = run(sim, 400);
    expect(sim.state.crashed).toBe(true);
    expect(events).toContainEqual({ kind: 'collision', obstacleId: spike.id });
    expect(sim.state.x).toBeGreaterThan(19);
    expect(sim.state.x).toBeLessThan(21.5);
  });

  it('clears a spike with a well-timed jump', () => {
    const spike = makeObstacle({ kind: 'spike', x: 20 });
    const sim = createSimulation(makeFlatLevel({ obstacles: [spike] }));
    let jumped = false;
    run(sim, 400, (s) => {
      if (!jumped && s.state.x >= 18 && s.state.grounded) {
        jumped = true;
        return JUMP;
      }
      return IDLE_ACTIONS;
    });
    expect(sim.state.crashed).toBe(false);
    expect(sim.state.x).toBeGreaterThan(25);
  });

  it('freezes the simulation after a crash', () => {
    const sim = createSimulation(
      makeFlatLevel({ obstacles: [makeObstacle({ kind: 'block', x: 20 })] }),
    );
    run(sim, 400);
    const { tick, x } = sim.state;
    expect(stepSimulation(sim, JUMP)).toEqual([]);
    expect(sim.state.tick).toBe(tick);
    expect(sim.state.x).toBe(x);
  });
});

describe('gaps', () => {
  const gap = makeObstacle({ kind: 'gap', x: 20, width: 4, height: 2 });

  it('crashes a car that rolls into a gap', () => {
    const sim = createSimulation(makeFlatLevel({ obstacles: [gap] }));
    const events = run(sim, 400);
    expect(sim.state.crashed).toBe(true);
    expect(events).toContainEqual({ kind: 'collision', obstacleId: gap.id });
    expect(sim.state.y).toBeLessThan(-GAP_CRASH_EPSILON_M);
    expect(gapAt(sim.level, sim.state.x)).toBe(gap);
  });

  it('is cleared by a well-timed jump', () => {
    const sim = createSimulation(makeFlatLevel({ obstacles: [gap] }));
    let jumped = false;
    run(sim, 400, (s) => {
      if (!jumped && s.state.x >= 18 && s.state.grounded) {
        jumped = true;
        return JUMP;
      }
      return IDLE_ACTIONS;
    });
    expect(sim.state.crashed).toBe(false);
    expect(sim.state.x).toBeGreaterThan(24.5);
    expect(sim.state.grounded).toBe(true);
  });

  it('forbids jumping off thin air inside the gap', () => {
    const sim = createSimulation(makeFlatLevel({ obstacles: [gap] }));
    // Always trying to jump: works until the gap swallows the car anyway.
    run(sim, 400, (s) => (gapAt(s.level, s.state.x) ? JUMP : IDLE_ACTIONS));
    expect(sim.state.crashed).toBe(true);
  });
});

describe('moving platforms', () => {
  const platform = makeObstacle({
    kind: 'movingPlatform',
    x: 20,
    width: 2,
    height: 0.5,
    beatTime: 2.5,
  });

  it('oscillates deterministically from beatTime', () => {
    expect(movingPlatformOffsetY(platform, platform.beatTime)).toBeCloseTo(0, 9);
    expect(
      movingPlatformOffsetY(platform, platform.beatTime + MOVING_PLATFORM_PERIOD_SEC / 4),
    ).toBeCloseTo(MOVING_PLATFORM_AMPLITUDE_M, 9);
    expect(
      movingPlatformOffsetY(platform, platform.beatTime + MOVING_PLATFORM_PERIOD_SEC),
    ).toBeCloseTo(0, 9);
    // Same time, same offset — twice.
    expect(movingPlatformOffsetY(platform, 3.21)).toBe(movingPlatformOffsetY(platform, 3.21));
  });

  it('produces identical collisions on identical runs', () => {
    const first = createSimulation(makeFlatLevel({ obstacles: [platform] }));
    const second = createSimulation(makeFlatLevel({ obstacles: [platform] }));
    run(first, 400);
    run(second, 400);
    expect(first.state.crashed).toBe(true);
    expect(first.state.tick).toBe(second.state.tick);
    expect(first.state.x).toBe(second.state.x);
  });
});

describe('collectibles', () => {
  it('awards the score exactly once', () => {
    const pickup = makeCollectible({ x: 20, y: 0.5, score: 10 });
    const sim = createSimulation(makeFlatLevel({ collectibles: [pickup] }));
    const events: SimEvent[] = [];
    for (let i = 0; i < 300; i += 1) {
      events.push(...stepSimulation(sim, IDLE_ACTIONS));
    }
    const collects = events.filter((event) => event.kind === 'collect');
    expect(collects).toEqual([{ kind: 'collect', collectibleId: pickup.id, score: 10 }]);
    expect(sim.state.score).toBe(10);
    expect(sim.state.collectiblesTaken).toBe(1);
  });

  it('ignores pickups out of vertical reach', () => {
    const high = makeCollectible({ x: 20, y: 3, score: 10 });
    const sim = createSimulation(makeFlatLevel({ collectibles: [high] }));
    run(sim, 300);
    expect(sim.state.score).toBe(0);
    expect(sim.state.collectiblesTaken).toBe(0);
  });
});

describe('checkpoints', () => {
  it('records one checkpoint exactly every interval, with monotonic x', () => {
    const sim = createSimulation(makeFlatLevel({ lengthM: 80 }));
    for (let i = 0; i < 3 * CHECKPOINT_INTERVAL_TICKS; i += 1) {
      stepSimulation(sim, IDLE_ACTIONS);
    }
    const ticks = sim.state.checkpoints.map((checkpoint) => checkpoint.tick);
    expect(ticks).toEqual([0, 120, 240, 360]);
    const xs = sim.state.checkpoints.map((checkpoint) => checkpoint.x);
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i] ?? 0).toBeGreaterThan(xs[i - 1] ?? Number.POSITIVE_INFINITY);
    }
  });
});

describe('finish', () => {
  it('finishes at finishX with FINISH_SCORE and a valid RunResult', () => {
    const level = makeFlatLevel({ lengthM: 40 });
    const sim = createSimulation(level);
    const events = run(sim, 400);
    expect(sim.state.finished).toBe(true);
    expect(events).toContainEqual({ kind: 'finish' });
    expect(sim.state.score).toBe(FINISH_SCORE);

    const result = buildRunResult(sim, 5000.4);
    expect(result.finished).toBe(true);
    expect(result.score).toBeLessThanOrEqual(level.maxScore);
    expect(result.distanceM).toBe(level.finishX);
    expect(result.durationMs).toBe(5000);
    expect(result.audioHash).toBe(level.audioHash);
    expect(result.seed).toBe(level.seed);
    expect(result.checkpoints.length).toBeGreaterThan(0);
  });

  it('collects along the way and stays within maxScore', () => {
    const pickups = [
      makeCollectible({ x: 15, y: 0.4, score: 10 }),
      makeCollectible({ x: 25, y: 0.4, score: 25, kind: 'gem' }),
    ];
    const level = makeFlatLevel({ lengthM: 40, collectibles: pickups });
    const sim = createSimulation(level);
    run(sim, 400);
    expect(sim.state.finished).toBe(true);
    expect(sim.state.score).toBe(FINISH_SCORE + 35);
    expect(sim.state.score).toBeLessThanOrEqual(level.maxScore);
  });
});

describe('full determinism', () => {
  it('produces byte-identical RunResults for identical action logs', () => {
    const level = generateLevel(makeBeatMap({ durationSec: 20 }));

    const actionsAt = (tick: number): ActionState => ({
      jumpQueued: tick % 90 === 0,
      boostHeld: tick >= 200 && tick < 320,
      lean: tick >= 500 && tick < 600 ? -1 : 0,
    });

    const play = (): ReturnType<typeof buildRunResult> => {
      const sim = createSimulation(level);
      for (let i = 0; i < 1400; i += 1) {
        stepSimulation(sim, actionsAt(sim.state.tick));
        if (sim.state.crashed || sim.state.finished) {
          break;
        }
      }
      return buildRunResult(sim, 1234);
    };

    const first = play();
    const second = play();
    expect(second).toEqual(first);
    expect(first.checkpoints.length).toBeGreaterThan(0);
    expect(first.score).toBeLessThanOrEqual(level.maxScore);
  });
});
