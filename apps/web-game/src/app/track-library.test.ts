import { isSha256Hex } from '@viberide/shared';
import { generateLevel } from '@viberide/track-generator';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LIBRARY_TRACK,
  findLibraryTrack,
  generateLibraryBeatMap,
  TRACK_LIBRARY,
} from './track-library';

describe('TRACK_LIBRARY', () => {
  it('has unique ids and audio hashes', () => {
    const ids = TRACK_LIBRARY.map((track) => track.id);
    const hashes = TRACK_LIBRARY.map((track) => track.audioHash);
    expect(new Set(ids).size).toBe(TRACK_LIBRARY.length);
    expect(new Set(hashes).size).toBe(TRACK_LIBRARY.length);
    for (const hash of hashes) {
      expect(isSha256Hex(hash)).toBe(true);
    }
  });

  it('offers a free default track and at least one NFT track', () => {
    expect(DEFAULT_LIBRARY_TRACK.nftItemName).toBeUndefined();
    expect(TRACK_LIBRARY.some((track) => track.nftItemName !== undefined)).toBe(true);
  });

  it('finds tracks by id and returns null for unknown ids', () => {
    expect(findLibraryTrack(DEFAULT_LIBRARY_TRACK.id)).toBe(DEFAULT_LIBRARY_TRACK);
    expect(findLibraryTrack('nope')).toBeNull();
  });
});

describe('generateLibraryBeatMap', () => {
  it('is deterministic', () => {
    for (const track of TRACK_LIBRARY) {
      expect(generateLibraryBeatMap(track)).toEqual(generateLibraryBeatMap(track));
    }
  });

  it('produces beat maps that generate playable levels with obstacles and notes', () => {
    for (const track of TRACK_LIBRARY) {
      const beatMap = generateLibraryBeatMap(track);
      expect(beatMap.bpm).toBe(track.bpm);
      expect(beatMap.durationSec).toBe(track.durationSec);
      expect(beatMap.beats.length).toBeGreaterThan(0);
      const level = generateLevel(beatMap);
      expect(level.obstacles.length).toBeGreaterThan(0);
      expect(level.collectibles.length).toBeGreaterThan(0);
      expect(level.finishX).toBeCloseTo(track.durationSec * 8, 9);
    }
  });

  it('makes harder tracks denser', () => {
    const easy = generateLevel(generateLibraryBeatMap(TRACK_LIBRARY[0]!));
    const hard = generateLevel(
      generateLibraryBeatMap(TRACK_LIBRARY.find((track) => track.difficulty === 3)!),
    );
    // Obstacles per second of ride — the hardcore track must be denser.
    const easyDensity = easy.obstacles.length / easy.durationSec;
    const hardDensity = hard.obstacles.length / hard.durationSec;
    expect(hardDensity).toBeGreaterThan(easyDensity);
  });
});
