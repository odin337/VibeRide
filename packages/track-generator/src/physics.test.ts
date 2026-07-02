import { GRAVITY, PLAYER, WORLD_SPEED_BASE } from '@viberide/shared';
import { describe, expect, it } from 'vitest';

import {
  clearanceWidthAtHeight,
  isObstacleClearable,
  JUMP_AIRTIME_SEC,
  MAX_JUMP_DISTANCE_M,
  MAX_JUMP_HEIGHT_M,
  MIN_OBSTACLE_SPACING_M,
} from './physics';

const g = Math.abs(GRAVITY);

describe('jump envelope constants', () => {
  it('derives the apex height from v²/(2g)', () => {
    expect(MAX_JUMP_HEIGHT_M).toBeCloseTo(PLAYER.jumpVelocity ** 2 / (2 * g), 12);
  });

  it('derives the airtime from 2v/g', () => {
    expect(JUMP_AIRTIME_SEC).toBeCloseTo((2 * PLAYER.jumpVelocity) / g, 12);
  });

  it('derives the jump distance from base speed × airtime', () => {
    expect(MAX_JUMP_DISTANCE_M).toBeCloseTo(WORLD_SPEED_BASE * JUMP_AIRTIME_SEC, 12);
  });

  it('adds one player length of recovery to the spacing bound', () => {
    expect(MIN_OBSTACLE_SPACING_M).toBeCloseTo(MAX_JUMP_DISTANCE_M + PLAYER.widthM, 12);
  });
});

describe('clearanceWidthAtHeight', () => {
  it('equals the full jump distance at ground level', () => {
    expect(clearanceWidthAtHeight(0)).toBeCloseTo(MAX_JUMP_DISTANCE_M, 12);
  });

  it('shrinks monotonically as the height grows', () => {
    expect(clearanceWidthAtHeight(0.5)).toBeGreaterThan(clearanceWidthAtHeight(1));
    expect(clearanceWidthAtHeight(1)).toBeGreaterThan(clearanceWidthAtHeight(1.5));
    expect(clearanceWidthAtHeight(1.5)).toBeGreaterThan(0);
  });

  it('is zero at and beyond the jump apex', () => {
    expect(clearanceWidthAtHeight(MAX_JUMP_HEIGHT_M)).toBe(0);
    expect(clearanceWidthAtHeight(MAX_JUMP_HEIGHT_M + 1)).toBe(0);
  });
});

describe('isObstacleClearable', () => {
  it('accepts gaps narrower than the safety-scaled jump distance', () => {
    expect(isObstacleClearable('gap', 4, 2)).toBe(true);
  });

  it('rejects gaps as wide as the full jump distance', () => {
    expect(isObstacleClearable('gap', MAX_JUMP_DISTANCE_M, 2)).toBe(false);
  });

  it('accepts modest solid obstacles', () => {
    expect(isObstacleClearable('block', 1.2, 1)).toBe(true);
    expect(isObstacleClearable('spike', 0.8, 1.2)).toBe(true);
    expect(isObstacleClearable('movingPlatform', 2, 0.5)).toBe(true);
  });

  it('rejects solids taller than the safety-scaled apex', () => {
    expect(isObstacleClearable('block', 1, 3)).toBe(false);
  });

  it('rejects solids too wide for the arc window at their height', () => {
    expect(isObstacleClearable('block', 5, 1)).toBe(false);
  });

  it('rejects degenerate sizes', () => {
    expect(isObstacleClearable('block', 0, 1)).toBe(false);
    expect(isObstacleClearable('gap', 2, -1)).toBe(false);
  });
});
