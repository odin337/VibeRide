import { describe, expect, it } from 'vitest';

import {
  CHECKPOINT_INTERVAL_TICKS,
  FINISH_SCORE,
  GRAVITY,
  HEIGHTFIELD_STEP_M,
  PLAYER,
  SIM_DT,
  SIM_TICK_HZ,
  STORAGE_KEYS,
  WORLD_SPEED_BASE,
} from './constants';

describe('simulation constants', () => {
  it('keeps SIM_DT consistent with SIM_TICK_HZ', () => {
    expect(SIM_DT * SIM_TICK_HZ).toBeCloseTo(1, 10);
  });

  it('uses physically coherent signs and magnitudes', () => {
    expect(GRAVITY).toBeLessThan(0);
    expect(WORLD_SPEED_BASE).toBeGreaterThan(0);
    expect(HEIGHTFIELD_STEP_M).toBeGreaterThan(0);
    expect(CHECKPOINT_INTERVAL_TICKS).toBeGreaterThan(0);
    expect(FINISH_SCORE).toBeGreaterThan(0);
  });

  it('defines a player that can actually jump, dive and fever', () => {
    expect(PLAYER.jumpVelocity).toBeGreaterThan(0);
    expect(PLAYER.feverMagnetMultiplier).toBeGreaterThan(1);
    expect(PLAYER.diveAccel).toBeGreaterThan(0);
    expect(PLAYER.maxBoostSec).toBeGreaterThan(0);
    expect(PLAYER.widthM).toBeGreaterThan(0);
    expect(PLAYER.heightM).toBeGreaterThan(0);
  });

  it('namespaces storage keys', () => {
    expect(STORAGE_KEYS.settings).toMatch(/^viberide:/);
    expect(STORAGE_KEYS.progress).toMatch(/^viberide:/);
  });
});
