import { FINISH_SCORE, HEIGHTFIELD_STEP_M } from '@viberide/shared';
import { validatePlayability } from '@viberide/track-generator';
import { describe, expect, it } from 'vitest';

import { makeCollectible, makeFlatLevel, makeLevel, makeObstacle } from './levels';

describe('level fixtures', () => {
  it('builds a flat level that satisfies the generator playability rules', () => {
    const level = makeFlatLevel({ lengthM: 80 });
    const report = validatePlayability(level);
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
    expect(level.heightfield[0]).toEqual({ x: 0, y: 0 });
    expect(level.finishX).toBe(80);
    expect(level.maxScore).toBe(FINISH_SCORE);
  });

  it('samples heightAt on the fixed grid and sums collectible scores', () => {
    const level = makeLevel({
      lengthM: 40,
      heightAt: (x) => (x >= 20 ? 1 : 0),
      collectibles: [makeCollectible({ x: 15, y: 0.5, score: 10 })],
      obstacles: [makeObstacle({ kind: 'block', x: 22 })],
    });
    expect(level.heightfield).toHaveLength(40 / HEIGHTFIELD_STEP_M + 1);
    expect(level.maxScore).toBe(FINISH_SCORE + 10);
    expect(level.obstacles[0]?.id).toContain('block');
    expect(level.collectibles[0]?.kind).toBe('note');
  });
});
