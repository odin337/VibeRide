import { FINISH_SCORE, HEIGHTFIELD_STEP_M, seedFromHash, WORLD_SPEED_BASE } from '@viberide/shared';
import type { BeatMap } from '@viberide/shared';
import { describe, expect, it } from 'vitest';

import { generateLevel, MIN_DURATION_SEC } from './generator';
import { validatePlayability } from './playability';
import { ALT_AUDIO_HASH, FIXTURE_AUDIO_HASH, makeBeatMap } from './testing/fixtures';

describe('generateLevel', () => {
  const level = generateLevel(makeBeatMap());

  it('is deterministic: two runs are deep-equal and byte-identical', () => {
    const again = generateLevel(makeBeatMap());
    expect(again).toEqual(level);
    expect(JSON.stringify(again)).toBe(JSON.stringify(level));
  });

  it('derives the seed from the audio hash', () => {
    expect(level.seed).toBe(seedFromHash(FIXTURE_AUDIO_HASH));
  });

  it('produces different geometry for a different audioHash', () => {
    const other = generateLevel(makeBeatMap({ audioHash: ALT_AUDIO_HASH }));
    expect(other.seed).not.toBe(level.seed);
    expect(other.audioHash).toBe(ALT_AUDIO_HASH);
    expect(JSON.stringify(other.heightfield)).not.toBe(JSON.stringify(level.heightfield));
    expect(JSON.stringify(other.obstacles)).not.toBe(JSON.stringify(level.obstacles));
  });

  it('copies BeatMap metadata and derives track length and finish', () => {
    expect(level.version).toBe(1);
    expect(level.audioHash).toBe(FIXTURE_AUDIO_HASH);
    expect(level.bpm).toBe(120);
    expect(level.durationSec).toBe(60);
    expect(level.lengthM).toBe(60 * WORLD_SPEED_BASE);
    expect(level.finishX).toBe(level.lengthM);
  });

  it('populates terrain, obstacles and collectibles for a busy track', () => {
    expect(level.heightfield.length).toBeGreaterThan(2);
    expect(level.obstacles.length).toBeGreaterThan(0);
    expect(level.collectibles.length).toBeGreaterThan(0);
  });

  it('holds the exact maxScore invariant', () => {
    const collectibleSum = level.collectibles.reduce((sum, c) => sum + c.score, 0);
    expect(level.maxScore).toBe(collectibleSum + FINISH_SCORE);
    expect(collectibleSum).toBeGreaterThan(0);
  });

  it('always passes its own playability validation', () => {
    expect(validatePlayability(level)).toEqual({ ok: true, issues: [] });
  });

  it('yields a minimal but valid level for a silent BeatMap', () => {
    const silent = generateLevel(makeBeatMap({ beats: [], onsets: [], energy: [] }));
    expect(silent.obstacles).toEqual([]);
    expect(silent.collectibles).toEqual([]);
    expect(silent.maxScore).toBe(FINISH_SCORE);
    expect(validatePlayability(silent)).toEqual({ ok: true, issues: [] });
  });

  it('handles the shortest allowed track', () => {
    const short = generateLevel(makeBeatMap({ durationSec: MIN_DURATION_SEC }));
    expect(short.lengthM).toBe(MIN_DURATION_SEC * WORLD_SPEED_BASE);
    const last = short.heightfield[short.heightfield.length - 1];
    expect(last!.x).toBeCloseTo(short.lengthM, 9);
    expect(short.heightfield.length).toBe(Math.floor(short.lengthM / HEIGHTFIELD_STEP_M) + 1);
    expect(validatePlayability(short)).toEqual({ ok: true, issues: [] });
  });

  it('rejects an unsupported BeatMap version', () => {
    const bad = { ...makeBeatMap(), version: 2 } as unknown as BeatMap;
    expect(() => generateLevel(bad)).toThrow(/BeatMap version/);
  });

  it('rejects a malformed audio hash', () => {
    expect(() => generateLevel(makeBeatMap({ audioHash: 'not-a-hash' }))).toThrow(/audioHash/);
    expect(() =>
      generateLevel(makeBeatMap({ audioHash: FIXTURE_AUDIO_HASH.toUpperCase() })),
    ).toThrow(/audioHash/);
  });

  it('rejects non-positive or non-finite durations', () => {
    expect(() => generateLevel(makeBeatMap({ durationSec: 0 }))).toThrow(/durationSec/);
    expect(() => generateLevel(makeBeatMap({ durationSec: Number.NaN }))).toThrow(/durationSec/);
  });

  it('rejects tracks shorter than the minimum duration', () => {
    expect(() => generateLevel(makeBeatMap({ durationSec: MIN_DURATION_SEC - 0.1 }))).toThrow(
      /at least/,
    );
  });

  it('rejects invalid bpm and sampleRate values', () => {
    expect(() => generateLevel(makeBeatMap({ bpm: 0 }))).toThrow(/bpm/);
    expect(() => generateLevel(makeBeatMap({ bpm: Number.NaN }))).toThrow(/bpm/);
    expect(() => generateLevel(makeBeatMap({ sampleRate: 0 }))).toThrow(/sampleRate/);
  });
});
