import { beatMapSchema, parseBeatMap, serializeBeatMap } from '@viberide/audio-engine';
import { generateLevel, validatePlayability } from '@viberide/track-generator';
import { describe, expect, it } from 'vitest';

import { DEMO_AUDIO_HASH, DEMO_BPM, DEMO_DURATION_SEC, generateDemoBeatMap } from './demo-beatmap';

describe('generateDemoBeatMap', () => {
  it('satisfies the shared BeatMap schema and round-trips through IO', () => {
    const demo = generateDemoBeatMap();
    expect(beatMapSchema.safeParse(demo).success).toBe(true);
    expect(parseBeatMap(serializeBeatMap(demo))).toEqual(demo);
  });

  it('is deterministic', () => {
    expect(generateDemoBeatMap()).toEqual(generateDemoBeatMap());
  });

  it('describes a ~20 s ride at 120 BPM', () => {
    const demo = generateDemoBeatMap();
    expect(demo.durationSec).toBe(DEMO_DURATION_SEC);
    expect(demo.bpm).toBe(DEMO_BPM);
    expect(demo.audioHash).toBe(DEMO_AUDIO_HASH);
    expect(demo.beats).toHaveLength(40);
    expect(demo.beats[0]).toEqual({ time: 0, indexInBar: 1 });
    expect(demo.beats[5]?.indexInBar).toBe(2);
    // Onsets on beats 1-3 of each bar; beat 4 stays quiet.
    expect(demo.onsets.length).toBe(30);
  });

  it('generates a playable level with obstacles and collectibles', () => {
    const demo = generateDemoBeatMap();
    const level = generateLevel(demo);
    const report = validatePlayability(level);
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
    expect(level.obstacles.length).toBeGreaterThan(0);
    expect(level.collectibles.length).toBeGreaterThan(0);
    expect(level.finishX).toBe(DEMO_DURATION_SEC * 8);
  });
});
