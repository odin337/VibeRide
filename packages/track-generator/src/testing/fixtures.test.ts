import { isSha256Hex } from '@viberide/shared';
import { describe, expect, it } from 'vitest';

import { ALT_AUDIO_HASH, FIXTURE_AUDIO_HASH, makeBeatMap } from './fixtures';

describe('fixture audio hashes', () => {
  it('are valid lowercase sha-256 hex digests', () => {
    expect(isSha256Hex(FIXTURE_AUDIO_HASH)).toBe(true);
    expect(isSha256Hex(ALT_AUDIO_HASH)).toBe(true);
  });

  it('differ from each other', () => {
    expect(FIXTURE_AUDIO_HASH).not.toBe(ALT_AUDIO_HASH);
  });
});

describe('makeBeatMap', () => {
  it('is deterministic', () => {
    expect(makeBeatMap()).toEqual(makeBeatMap());
    expect(JSON.stringify(makeBeatMap())).toBe(JSON.stringify(makeBeatMap()));
  });

  it('builds a 60 s, 120 BPM map with beats every half second', () => {
    const map = makeBeatMap();
    expect(map.version).toBe(1);
    expect(map.durationSec).toBe(60);
    expect(map.bpm).toBe(120);
    expect(map.sampleRate).toBe(44100);
    expect(map.beats).toHaveLength(120);
    expect(map.beats[0]).toEqual({ time: 0, indexInBar: 1 });
    expect(map.beats[1]!.time).toBeCloseTo(0.5, 12);
    expect(map.beats[5]!.indexInBar).toBe(2);
  });

  it('locks onsets to the beat grid with all three bands represented', () => {
    const map = makeBeatMap();
    const beatTimes = new Set(map.beats.map((beat) => beat.time));
    for (const onset of map.onsets) {
      expect(beatTimes.has(onset.time)).toBe(true);
      expect(onset.strength).toBeGreaterThanOrEqual(0);
      expect(onset.strength).toBeLessThanOrEqual(1);
    }
    const bands = new Set(map.onsets.map((onset) => onset.band));
    expect(bands).toEqual(new Set(['bass', 'mid', 'high']));
  });

  it('includes qualifying and sub-threshold onsets per band by design', () => {
    const map = makeBeatMap();
    const bassOnsets = map.onsets.filter((onset) => onset.band === 'bass');
    expect(bassOnsets.some((onset) => onset.strength >= 0.6)).toBe(true);
    expect(bassOnsets.some((onset) => onset.strength < 0.6)).toBe(true);
    const midOnsets = map.onsets.filter((onset) => onset.band === 'mid');
    expect(midOnsets.some((onset) => onset.strength >= 0.8)).toBe(true);
    const highOnsets = map.onsets.filter((onset) => onset.band === 'high');
    expect(highOnsets.some((onset) => onset.strength < 0.35)).toBe(true);
  });

  it('keeps the energy envelope strictly inside (0, 1)', () => {
    const map = makeBeatMap();
    expect(map.energy).toHaveLength(61);
    for (const point of map.energy) {
      expect(point.energy).toBeGreaterThan(0);
      expect(point.energy).toBeLessThan(1);
    }
  });

  it('re-derives beats and onsets from an overridden duration and bpm', () => {
    const map = makeBeatMap({ durationSec: 10, bpm: 60 });
    expect(map.beats).toHaveLength(10);
    expect(map.beats[1]!.time).toBe(1);
    expect(map.onsets.every((onset) => onset.time < 10)).toBe(true);
    expect(map.energy.every((point) => point.time <= 10)).toBe(true);
  });

  it('lets explicit array overrides win over derivation', () => {
    const map = makeBeatMap({ beats: [], onsets: [] });
    expect(map.beats).toEqual([]);
    expect(map.onsets).toEqual([]);
    expect(map.energy.length).toBeGreaterThan(0);
  });

  it('lets scalar overrides win', () => {
    const map = makeBeatMap({ audioHash: ALT_AUDIO_HASH, sampleRate: 48000 });
    expect(map.audioHash).toBe(ALT_AUDIO_HASH);
    expect(map.sampleRate).toBe(48000);
  });
});
