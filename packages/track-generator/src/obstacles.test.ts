import { seedFromHash, WORLD_SPEED_BASE } from '@viberide/shared';
import type { Onset } from '@viberide/shared';
import { describe, expect, it } from 'vitest';

import {
  BASS_ONSET_THRESHOLD,
  FINISH_CLEARANCE_M,
  generateObstacles,
  OBSTACLE_MIN_X_M,
  weightedPick,
} from './obstacles';
import { isObstacleClearable, MIN_OBSTACLE_SPACING_M } from './physics';
import { FIXTURE_AUDIO_HASH, makeBeatMap } from './testing/fixtures';

const seed = seedFromHash(FIXTURE_AUDIO_HASH);

const bass = (time: number, strength: number): Onset => ({ time, strength, band: 'bass' });

describe('weightedPick', () => {
  const entries = [
    { item: 'a', weight: 1 },
    { item: 'b', weight: 3 },
  ] as const;

  it('picks proportionally to the weights', () => {
    expect(weightedPick(() => 0, entries)).toBe('a');
    expect(weightedPick(() => 0.24, entries)).toBe('a');
    expect(weightedPick(() => 0.26, entries)).toBe('b');
    expect(weightedPick(() => 0.999, entries)).toBe('b');
  });

  it('skips zero-weight entries', () => {
    const withZero = [
      { item: 'never', weight: 0 },
      { item: 'always', weight: 1 },
    ] as const;
    expect(weightedPick(() => 0, withZero)).toBe('always');
  });

  it('throws on an empty entry list', () => {
    expect(() => weightedPick(() => 0, [])).toThrow(RangeError);
  });

  it('throws when every weight is zero', () => {
    expect(() => weightedPick(() => 0, [{ item: 'a', weight: 0 }])).toThrow(RangeError);
  });

  it('throws on negative weights', () => {
    expect(() =>
      weightedPick(
        () => 0,
        [
          { item: 'a', weight: 2 },
          { item: 'b', weight: -1 },
        ],
      ),
    ).toThrow(RangeError);
  });

  it('throws on non-finite weights', () => {
    expect(() => weightedPick(() => 0, [{ item: 'a', weight: Number.NaN }])).toThrow(RangeError);
  });
});

describe('generateObstacles', () => {
  const beatMap = makeBeatMap();
  const finishX = beatMap.durationSec * WORLD_SPEED_BASE;
  const obstacles = generateObstacles(beatMap, seed, finishX);

  it('maps every obstacle to a qualifying bass onset at x = time · speed', () => {
    expect(obstacles.length).toBeGreaterThan(0);
    for (const obstacle of obstacles) {
      const onset = beatMap.onsets.find((candidate) => candidate.time === obstacle.beatTime);
      expect(onset).toBeDefined();
      expect(onset!.band).toBe('bass');
      expect(onset!.strength).toBeGreaterThanOrEqual(BASS_ONSET_THRESHOLD);
      expect(obstacle.x).toBeCloseTo(obstacle.beatTime * WORLD_SPEED_BASE, 12);
    }
  });

  it('places one obstacle per qualifying onset when spacing allows', () => {
    // Fixture: bass onsets on bars 0..29; bars ≡ 0 (mod 5) stay below the
    // threshold on purpose, leaving 24 qualifying onsets spaced 16 m apart —
    // far more than the recovery spacing, so none of them are dropped.
    expect(obstacles).toHaveLength(24);
  });

  it('assigns sequential obs-N ids in ascending track order', () => {
    obstacles.forEach((obstacle, index) => {
      expect(obstacle.id).toBe(`obs-${index}`);
    });
    for (let i = 1; i < obstacles.length; i += 1) {
      expect(obstacles[i]!.x).toBeGreaterThan(obstacles[i - 1]!.x);
    }
  });

  it('only emits obstacles clearable with a base-speed jump', () => {
    for (const obstacle of obstacles) {
      expect(isObstacleClearable(obstacle.kind, obstacle.width, obstacle.height)).toBe(true);
    }
  });

  it('respects the run-up and finish-clearance bounds', () => {
    for (const obstacle of obstacles) {
      expect(obstacle.x).toBeGreaterThanOrEqual(OBSTACLE_MIN_X_M);
      expect(obstacle.x + obstacle.width).toBeLessThanOrEqual(finishX - FINISH_CLEARANCE_M);
    }
  });

  it('keeps at least the jump-recovery spacing between obstacles', () => {
    for (let i = 1; i < obstacles.length; i += 1) {
      const prev = obstacles[i - 1]!;
      const gap = obstacles[i]!.x - (prev.x + prev.width);
      expect(gap).toBeGreaterThanOrEqual(MIN_OBSTACLE_SPACING_M);
    }
  });

  it('varies the obstacle kind across the track', () => {
    expect(new Set(obstacles.map((obstacle) => obstacle.kind)).size).toBeGreaterThanOrEqual(2);
  });

  it('is deterministic for the same inputs and sensitive to the seed', () => {
    const again = generateObstacles(makeBeatMap(), seed, finishX);
    expect(again).toEqual(obstacles);
    expect(JSON.stringify(again)).toBe(JSON.stringify(obstacles));
    const other = generateObstacles(beatMap, (seed + 1) >>> 0, finishX);
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(obstacles));
  });

  it('ignores weak bass onsets and non-bass bands', () => {
    const custom = makeBeatMap({
      onsets: [
        bass(3, BASS_ONSET_THRESHOLD - 0.01),
        { time: 4, strength: 0.95, band: 'mid' },
        { time: 5, strength: 0.95, band: 'high' },
      ],
    });
    expect(generateObstacles(custom, seed, finishX)).toHaveLength(0);
  });

  it('skips onsets that land before the run-up zone', () => {
    const custom = makeBeatMap({ onsets: [bass(1, 0.9), bass(5, 0.9)] });
    const placed = generateObstacles(custom, seed, finishX);
    expect(placed).toHaveLength(1);
    expect(placed[0]!.x).toBe(40);
  });

  it('skips onsets that would crowd the finish line', () => {
    const custom = makeBeatMap({ onsets: [bass(59.5, 0.9)] });
    expect(generateObstacles(custom, seed, finishX)).toHaveLength(0);
  });

  it('drops onsets that violate the jump-recovery spacing', () => {
    const custom = makeBeatMap({ onsets: [bass(3, 0.9), bass(3.5, 0.9)] });
    const placed = generateObstacles(custom, seed, finishX);
    expect(placed).toHaveLength(1);
    expect(placed[0]!.beatTime).toBe(3);
  });

  it('returns an empty list for a BeatMap without onsets', () => {
    expect(generateObstacles(makeBeatMap({ onsets: [] }), seed, finishX)).toHaveLength(0);
  });
});
