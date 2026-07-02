import { describe, expect, it } from 'vitest';
import type { BeatMap } from '@viberide/shared';

import { analyzePcm } from './analyzer';
import { parseBeatMap, serializeBeatMap } from './beatmap-io';
import { clickTrack } from './testing/signals';

const AUDIO_HASH = 'b'.repeat(64);

function makeBeatMap(): BeatMap {
  const pcm = clickTrack({
    intervalSec: 0.5,
    durationSec: 4,
    sampleRate: 44100,
    startSec: 0.25,
    seed: 5,
  });
  return analyzePcm(pcm, 44100, AUDIO_HASH);
}

describe('serializeBeatMap / parseBeatMap', () => {
  it('roundtrips a real analyzer BeatMap losslessly', () => {
    const beatMap = makeBeatMap();
    const json = serializeBeatMap(beatMap);
    expect(parseBeatMap(json)).toEqual(beatMap);
  });

  it('serialization is deterministic', () => {
    const beatMap = makeBeatMap();
    expect(serializeBeatMap(beatMap)).toBe(serializeBeatMap(beatMap));
  });

  it('refuses to serialize an invalid BeatMap', () => {
    const broken: BeatMap = { ...makeBeatMap(), bpm: -5 };
    expect(() => serializeBeatMap(broken)).toThrow(/invalid BeatMap/);
  });

  it('rejects non-JSON input with a descriptive error', () => {
    expect(() => parseBeatMap('definitely not json')).toThrow(/not valid JSON/);
  });

  it('rejects JSON that is not an object', () => {
    expect(() => parseBeatMap('42')).toThrow(/invalid BeatMap/);
    expect(() => parseBeatMap('null')).toThrow(/invalid BeatMap/);
  });

  it('rejects a wrong version', () => {
    const tampered = { ...(JSON.parse(serializeBeatMap(makeBeatMap())) as object), version: 2 };
    expect(() => parseBeatMap(JSON.stringify(tampered))).toThrow(/version/);
  });

  it('rejects a tampered audioHash', () => {
    const tampered = {
      ...(JSON.parse(serializeBeatMap(makeBeatMap())) as object),
      audioHash: 'Z'.repeat(64),
    };
    expect(() => parseBeatMap(JSON.stringify(tampered))).toThrow(/audioHash/);
  });

  it('rejects out-of-range onset strengths', () => {
    const raw = JSON.parse(serializeBeatMap(makeBeatMap())) as {
      onsets: { time: number; strength: number; band: string }[];
    };
    const firstOnset = raw.onsets[0];
    expect(firstOnset).toBeDefined();
    firstOnset!.strength = 1.5;
    expect(() => parseBeatMap(JSON.stringify(raw))).toThrow(/onsets\.0\.strength/);
  });

  it('rejects an out-of-range indexInBar', () => {
    const raw = JSON.parse(serializeBeatMap(makeBeatMap())) as {
      beats: { time: number; indexInBar: number }[];
    };
    const firstBeat = raw.beats[0];
    expect(firstBeat).toBeDefined();
    firstBeat!.indexInBar = 5;
    expect(() => parseBeatMap(JSON.stringify(raw))).toThrow(/beats\.0\.indexInBar/);
  });

  it('rejects missing fields', () => {
    const { energy: _energy, ...withoutEnergy } = JSON.parse(
      serializeBeatMap(makeBeatMap()),
    ) as Record<string, unknown>;
    expect(() => parseBeatMap(JSON.stringify(withoutEnergy))).toThrow(/energy/);
  });
});
