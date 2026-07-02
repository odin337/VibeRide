import { FINISH_SCORE, HEIGHTFIELD_STEP_M, WORLD_SPEED_BASE } from '@viberide/shared';
import type { Collectible, LevelDefinition, Obstacle } from '@viberide/shared';
import { describe, expect, it } from 'vitest';

import { generateLevel } from './generator';
import { validatePlayability } from './playability';
import { FIXTURE_AUDIO_HASH, makeBeatMap } from './testing/fixtures';

/** Minimal hand-built level that satisfies every invariant. */
function makeFlatLevel(): LevelDefinition {
  const lengthM = 100;
  const samples = Math.floor(lengthM / HEIGHTFIELD_STEP_M) + 1;
  return {
    version: 1,
    seed: 42,
    audioHash: FIXTURE_AUDIO_HASH,
    bpm: 120,
    durationSec: lengthM / WORLD_SPEED_BASE,
    lengthM,
    heightfield: Array.from({ length: samples }, (_, i) => ({ x: i * HEIGHTFIELD_STEP_M, y: 0 })),
    obstacles: [],
    collectibles: [],
    maxScore: FINISH_SCORE,
    finishX: lengthM,
  };
}

/** A 1.2 × 1 m block — comfortably clearable with a base-speed jump. */
const clearableBlock = (x: number, id: string): Obstacle => ({
  id,
  kind: 'block',
  x,
  width: 1.2,
  height: 1,
  beatTime: x / WORLD_SPEED_BASE,
});

const note = (x: number, y: number): Collectible => ({
  id: 'col-0',
  kind: 'note',
  x,
  y,
  beatTime: x / WORLD_SPEED_BASE,
  score: 10,
});

describe('validatePlayability', () => {
  it('accepts generator output', () => {
    expect(validatePlayability(generateLevel(makeBeatMap()))).toEqual({ ok: true, issues: [] });
  });

  it('accepts a minimal flat level', () => {
    expect(validatePlayability(makeFlatLevel())).toEqual({ ok: true, issues: [] });
  });

  it('accepts well-spaced clearable obstacles', () => {
    const level: LevelDefinition = {
      ...makeFlatLevel(),
      obstacles: [clearableBlock(20, 'obs-0'), clearableBlock(40, 'obs-1')],
    };
    expect(validatePlayability(level)).toEqual({ ok: true, issues: [] });
  });

  it('catches an unclearable obstacle injected into a generated level', () => {
    const level = generateLevel(makeBeatMap());
    const corrupted: LevelDefinition = {
      ...level,
      obstacles: [
        ...level.obstacles,
        // 3 m tall — well above the jump apex, impossible to clear.
        { id: 'obs-evil', kind: 'block', x: level.finishX / 2, width: 4, height: 3, beatTime: 30 },
      ],
    };
    const report = validatePlayability(corrupted);
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.includes('not clearable'))).toBe(true);
  });

  it('flags an unclearable gap', () => {
    const level: LevelDefinition = {
      ...makeFlatLevel(),
      obstacles: [{ id: 'obs-0', kind: 'gap', x: 30, width: 20, height: 2, beatTime: 3.75 }],
    };
    const report = validatePlayability(level);
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.includes('not clearable'))).toBe(true);
  });

  it('flags a non-positive finishX', () => {
    const report = validatePlayability({ ...makeFlatLevel(), finishX: 0 });
    expect(report.ok).toBe(false);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toMatch(/finishX/);
  });

  it('flags a heightfield with fewer than two samples', () => {
    const report = validatePlayability({ ...makeFlatLevel(), heightfield: [{ x: 0, y: 0 }] });
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.includes('at least 2 samples'))).toBe(true);
  });

  it('flags a heightfield that does not start at x=0', () => {
    const flat = makeFlatLevel();
    const shifted = flat.heightfield.map((point) => ({ x: point.x + 1, y: point.y }));
    const report = validatePlayability({ ...flat, heightfield: shifted });
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.includes('must start at x=0'))).toBe(true);
  });

  it('flags heights outside the playable range', () => {
    const flat = makeFlatLevel();
    const spiked = flat.heightfield.map((point, i) => (i === 40 ? { ...point, y: 7 } : point));
    const report = validatePlayability({ ...flat, heightfield: spiked });
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.includes('outside playable range'))).toBe(true);
  });

  it('flags a bumpy spawn area', () => {
    const flat = makeFlatLevel();
    const bumpy = flat.heightfield.map((point, i) => (i === 8 ? { ...point, y: 0.5 } : point));
    const report = validatePlayability({ ...flat, heightfield: bumpy });
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.includes('spawn area not flat'))).toBe(true);
  });

  it('flags broken heightfield spacing', () => {
    const flat = makeFlatLevel();
    const gapped = flat.heightfield.filter((_, i) => i !== 50);
    const report = validatePlayability({ ...flat, heightfield: gapped });
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.includes('spacing broken'))).toBe(true);
  });

  it('reports duplicated samples as spacing issues without a slope check', () => {
    const flat = makeFlatLevel();
    const duplicated = flat.heightfield.map((point, i) =>
      i === 50 ? { x: point.x - HEIGHTFIELD_STEP_M, y: point.y } : point,
    );
    const report = validatePlayability({ ...flat, heightfield: duplicated });
    expect(report.ok).toBe(false);
    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.issues.every((issue) => issue.includes('spacing broken'))).toBe(true);
  });

  it('flags slope violations', () => {
    const flat = makeFlatLevel();
    const steep = flat.heightfield.map((point, i) => (i === 100 ? { ...point, y: 0.4 } : point));
    const report = validatePlayability({ ...flat, heightfield: steep });
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.includes('slope bound exceeded'))).toBe(true);
  });

  it('flags a heightfield that ends before the finish line', () => {
    const flat = makeFlatLevel();
    const truncated = flat.heightfield.slice(0, 100);
    const report = validatePlayability({ ...flat, heightfield: truncated });
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.includes('before the finish line'))).toBe(true);
  });

  it('flags an obstacle inside the run-up zone', () => {
    const level: LevelDefinition = { ...makeFlatLevel(), obstacles: [clearableBlock(10, 'obs-0')] };
    const report = validatePlayability(level);
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.includes('before the minimum'))).toBe(true);
  });

  it('flags an obstacle crowding the finish line', () => {
    const level: LevelDefinition = {
      ...makeFlatLevel(),
      obstacles: [clearableBlock(94.5, 'obs-0')],
    };
    const report = validatePlayability(level);
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.includes('of the finish'))).toBe(true);
  });

  it('flags obstacles packed tighter than the jump-recovery spacing', () => {
    const level: LevelDefinition = {
      ...makeFlatLevel(),
      obstacles: [clearableBlock(20, 'obs-0'), clearableBlock(23, 'obs-1')],
    };
    const report = validatePlayability(level);
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.includes('jump-recovery spacing'))).toBe(true);
  });

  it('flags a collectible at or below the terrain surface', () => {
    const level: LevelDefinition = {
      ...makeFlatLevel(),
      collectibles: [note(30, 0)],
      maxScore: FINISH_SCORE + 10,
    };
    const report = validatePlayability(level);
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.includes('not above the terrain'))).toBe(true);
  });

  it('flags a collectible beyond jump reach', () => {
    const level: LevelDefinition = {
      ...makeFlatLevel(),
      collectibles: [note(30, 3)],
      maxScore: FINISH_SCORE + 10,
    };
    const report = validatePlayability(level);
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.includes('beyond jump reach'))).toBe(true);
  });

  it('flags a collectible overlapping an obstacle', () => {
    const level: LevelDefinition = {
      ...makeFlatLevel(),
      obstacles: [clearableBlock(30, 'obs-0')],
      collectibles: [note(30.5, 1)],
      maxScore: FINISH_SCORE + 10,
    };
    const report = validatePlayability(level);
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.includes('overlaps obstacle'))).toBe(true);
  });

  it('flags a maxScore that breaks the score invariant', () => {
    const report = validatePlayability({ ...makeFlatLevel(), maxScore: 123 });
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.includes('maxScore'))).toBe(true);
  });
});
