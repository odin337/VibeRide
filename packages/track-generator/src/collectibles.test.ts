import { seedFromHash, WORLD_SPEED_BASE } from '@viberide/shared';
import type { Collectible, Obstacle, Onset } from '@viberide/shared';
import { describe, expect, it } from 'vitest';

import type { CollectibleContext } from './collectibles';
import {
  COLLECTIBLE_FINISH_CLEARANCE_M,
  COLLECTIBLE_MIN_X_M,
  COLLECTIBLE_ONSET_THRESHOLD,
  GEM_SCORE,
  GEM_STRENGTH_THRESHOLD,
  generateCollectibles,
  NOTE_SCORE,
} from './collectibles';
import { generateObstacles } from './obstacles';
import { MAX_JUMP_HEIGHT_M } from './physics';
import { generateTerrain, terrainHeightAt } from './terrain';
import { FIXTURE_AUDIO_HASH, makeBeatMap } from './testing/fixtures';

const seed = seedFromHash(FIXTURE_AUDIO_HASH);
const beatMap = makeBeatMap();
const finishX = beatMap.durationSec * WORLD_SPEED_BASE;
const heightfield = generateTerrain(beatMap, seed);
const obstacles = generateObstacles(beatMap, (seed ^ 0x5f356495) >>> 0, finishX);
const context: CollectibleContext = { heightfield, obstacles, finishX };
const collectibles = generateCollectibles(beatMap, seed, context);

const onset = (time: number, strength: number, band: Onset['band']): Onset => ({
  time,
  strength,
  band,
});

describe('generateCollectibles', () => {
  it('maps every collectible to a qualifying mid/high onset', () => {
    expect(collectibles.length).toBeGreaterThan(0);
    for (const collectible of collectibles) {
      const source = beatMap.onsets.find((candidate) => candidate.time === collectible.beatTime);
      expect(source).toBeDefined();
      expect(['mid', 'high']).toContain(source!.band);
      expect(source!.strength).toBeGreaterThanOrEqual(COLLECTIBLE_ONSET_THRESHOLD);
    }
  });

  it('assigns sequential col-N ids in ascending track order', () => {
    collectibles.forEach((collectible, index) => {
      expect(collectible.id).toBe(`col-${index}`);
    });
    for (let i = 1; i < collectibles.length; i += 1) {
      expect(collectibles[i]!.x).toBeGreaterThan(collectibles[i - 1]!.x);
    }
  });

  it('keeps every collectible between the terrain surface and jump reach', () => {
    for (const collectible of collectibles) {
      const surface = terrainHeightAt(heightfield, collectible.x);
      expect(collectible.y).toBeGreaterThan(surface);
      expect(collectible.y).toBeLessThanOrEqual(surface + MAX_JUMP_HEIGHT_M);
    }
  });

  it('stays inside the min-x and finish-clearance bounds', () => {
    for (const collectible of collectibles) {
      expect(collectible.x).toBeGreaterThanOrEqual(COLLECTIBLE_MIN_X_M);
      expect(collectible.x).toBeLessThanOrEqual(finishX - COLLECTIBLE_FINISH_CLEARANCE_M);
    }
  });

  it('never places a collectible inside an obstacle span', () => {
    expect(obstacles.length).toBeGreaterThan(0);
    for (const collectible of collectibles) {
      for (const obstacle of obstacles) {
        const inside = collectible.x >= obstacle.x && collectible.x <= obstacle.x + obstacle.width;
        expect(inside).toBe(false);
      }
    }
  });

  it('awards note=10 and gem=25 with gems only on the strongest onsets', () => {
    const gems = collectibles.filter((collectible) => collectible.kind === 'gem');
    const notes = collectibles.filter((collectible) => collectible.kind === 'note');
    expect(gems.length).toBeGreaterThan(0);
    expect(notes.length).toBeGreaterThan(0);
    for (const gem of gems) {
      expect(gem.score).toBe(GEM_SCORE);
      const source = beatMap.onsets.find((candidate) => candidate.time === gem.beatTime);
      expect(source!.strength).toBeGreaterThanOrEqual(GEM_STRENGTH_THRESHOLD);
    }
    for (const note of notes) {
      expect(note.score).toBe(NOTE_SCORE);
      const source = beatMap.onsets.find((candidate) => candidate.time === note.beatTime);
      expect(source!.strength).toBeGreaterThanOrEqual(COLLECTIBLE_ONSET_THRESHOLD);
      expect(source!.strength).toBeLessThan(GEM_STRENGTH_THRESHOLD);
    }
  });

  it('shapes full note arcs with the peak in the middle', () => {
    const notes = collectibles.filter((collectible) => collectible.kind === 'note');
    const groups = new Map<number, Collectible[]>();
    for (const note of notes) {
      const group = groups.get(note.beatTime) ?? [];
      group.push(note);
      groups.set(note.beatTime, group);
    }
    const fullArcs = [...groups.values()].filter((group) => group.length === 3);
    expect(fullArcs.length).toBeGreaterThan(0);
    for (const arc of fullArcs) {
      const sorted = [...arc].sort((a, b) => a.x - b.x);
      const [left, mid, right] = sorted;
      expect(right!.x - left!.x).toBeCloseTo(2.4, 9);
      expect(mid!.x - left!.x).toBeCloseTo(1.2, 9);
      const clearance = (c: Collectible): number => c.y - terrainHeightAt(heightfield, c.x);
      expect(clearance(mid!)).toBeGreaterThan(clearance(left!));
      expect(clearance(mid!)).toBeGreaterThan(clearance(right!));
    }
  });

  it('is deterministic for the same inputs and sensitive to the seed', () => {
    const again = generateCollectibles(makeBeatMap(), seed, context);
    expect(again).toEqual(collectibles);
    expect(JSON.stringify(again)).toBe(JSON.stringify(collectibles));
    const other = generateCollectibles(beatMap, (seed + 1) >>> 0, context);
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(collectibles));
  });

  it('ignores onsets below the strength threshold and bass onsets', () => {
    const custom = makeBeatMap({
      onsets: [onset(20, COLLECTIBLE_ONSET_THRESHOLD - 0.01, 'high'), onset(22, 0.9, 'bass')],
    });
    expect(generateCollectibles(custom, seed, context)).toHaveLength(0);
  });

  it('skips placements before the spawn run-out', () => {
    const arcTooEarly = makeBeatMap({ onsets: [onset(1, 0.5, 'mid')] });
    const gemTooEarly = makeBeatMap({ onsets: [onset(1, 0.9, 'high')] });
    const bare: CollectibleContext = { heightfield, obstacles: [], finishX };
    expect(generateCollectibles(arcTooEarly, seed, bare)).toHaveLength(0);
    expect(generateCollectibles(gemTooEarly, seed, bare)).toHaveLength(0);
  });

  it('skips placements too close to the finish line', () => {
    const arcTooLate = makeBeatMap({ onsets: [onset(59.95, 0.5, 'mid')] });
    const gemTooLate = makeBeatMap({ onsets: [onset(59.9, 0.9, 'high')] });
    const bare: CollectibleContext = { heightfield, obstacles: [], finishX };
    expect(generateCollectibles(arcTooLate, seed, bare)).toHaveLength(0);
    expect(generateCollectibles(gemTooLate, seed, bare)).toHaveLength(0);
  });

  it('skips placements that overlap an obstacle keep-out zone', () => {
    const blocker: Obstacle = {
      id: 'obs-0',
      kind: 'block',
      x: 156,
      width: 8,
      height: 1,
      beatTime: 19.5,
    };
    const custom = makeBeatMap({ onsets: [onset(20, 0.5, 'mid')] });
    const blocked: CollectibleContext = { heightfield, obstacles: [blocker], finishX };
    expect(generateCollectibles(custom, seed, blocked)).toHaveLength(0);
  });

  it('drops pickups that would crowd the previous one', () => {
    const custom = makeBeatMap({
      onsets: [onset(20, 0.5, 'mid'), onset(20.05, 0.5, 'high')],
    });
    const bare: CollectibleContext = { heightfield, obstacles: [], finishX };
    const placed = generateCollectibles(custom, seed, bare);
    expect(placed).toHaveLength(3);
    for (const collectible of placed) {
      expect(collectible.beatTime).toBe(20);
    }
  });

  it('returns an empty list for a BeatMap without onsets', () => {
    expect(generateCollectibles(makeBeatMap({ onsets: [] }), seed, context)).toHaveLength(0);
  });
});
