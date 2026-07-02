import type { TrackMetadata } from '@viberide/shared';
import { FIXTURE_AUDIO_HASH } from '@viberide/track-generator';
import { describe, expect, it } from 'vitest';

import { canonicalBeatMap } from './canonical-beat-map';

const METADATA: TrackMetadata = {
  audioHash: FIXTURE_AUDIO_HASH,
  title: 'Canonical Song',
  durationSec: 10,
  bpm: 120,
};

describe('canonicalBeatMap', () => {
  it('derives a plain BPM beat grid with no onsets and no energy envelope', () => {
    const beatMap = canonicalBeatMap(METADATA);
    expect(beatMap.version).toBe(1);
    expect(beatMap.audioHash).toBe(METADATA.audioHash);
    expect(beatMap.durationSec).toBe(10);
    expect(beatMap.sampleRate).toBe(44100);
    expect(beatMap.bpm).toBe(120);
    expect(beatMap.onsets).toEqual([]);
    expect(beatMap.energy).toEqual([]);
  });

  it('places beats every 60/bpm seconds, strictly below the duration', () => {
    const beatMap = canonicalBeatMap(METADATA);
    // 120 BPM → one beat each 0.5 s over 10 s → i*0.5 < 10 → 20 beats.
    expect(beatMap.beats).toHaveLength(20);
    expect(beatMap.beats[0]).toEqual({ time: 0, indexInBar: 1 });
    expect(beatMap.beats[5]).toEqual({ time: 2.5, indexInBar: 2 });
    expect(beatMap.beats.every((beat, index) => beat.indexInBar === (index % 4) + 1)).toBe(true);
  });

  it('re-derives the grid from a different tempo', () => {
    const beatMap = canonicalBeatMap({ ...METADATA, bpm: 60, durationSec: 4 });
    expect(beatMap.beats.map((beat) => beat.time)).toEqual([0, 1, 2, 3]);
  });

  it('is deterministic for identical metadata', () => {
    expect(canonicalBeatMap(METADATA)).toEqual(canonicalBeatMap(METADATA));
  });
});
