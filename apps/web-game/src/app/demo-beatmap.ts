import type { Beat, BeatMap, EnergyPoint, Onset } from '@viberide/shared';

/**
 * Pure generator for the built-in demo ride: a synthesized ~20 s BeatMap
 * (no audio file — the playback module lays an oscillator backing over
 * its beat grid). Fully deterministic and valid against beatMapSchema,
 * so generateLevel treats it exactly like an analyzed track.
 */

/**
 * Stable synthetic identity for the demo "track". Not the digest of any
 * real bytes — just a fixed, well-formed sha-256 hex string so the demo
 * gets its own seed and its own leaderboard.
 */
export const DEMO_AUDIO_HASH = 'aa11bb22cc33dd44ee55ff6600718293a4b5c6d7e8f9021324354657687980ab';

export const DEMO_TRACK_TITLE = 'VibeRide Demo Loop';
export const DEMO_DURATION_SEC = 20;
export const DEMO_BPM = 120;
export const DEMO_SAMPLE_RATE = 44100;

/** 120 BPM → one beat every 0.5 s, 4 beats per bar. */
const BEAT_INTERVAL_SEC = 60 / DEMO_BPM;

export function generateDemoBeatMap(): BeatMap {
  const beats: Beat[] = [];
  const onsets: Onset[] = [];
  const energy: EnergyPoint[] = [];

  const beatCount = Math.floor(DEMO_DURATION_SEC / BEAT_INTERVAL_SEC);
  for (let i = 0; i < beatCount; i += 1) {
    const time = i * BEAT_INTERVAL_SEC;
    const indexInBar = (i % 4) + 1;
    beats.push({ time, indexInBar });

    const bar = Math.floor(i / 4);
    if (indexInBar === 1) {
      // Strong bass hit every second bar → an obstacle roughly every 32 m,
      // giving the rider comfortable reaction time. Odd bars stay below
      // the generator's 0.6 obstacle threshold.
      onsets.push({ time, strength: bar % 2 === 0 ? 0.7 : 0.5, band: 'bass' });
    } else if (indexInBar === 2) {
      // Every fourth bar peaks above the gem threshold (0.8).
      onsets.push({ time, strength: bar % 4 === 3 ? 0.85 : 0.45, band: 'high' });
    } else if (indexInBar === 3) {
      // Mid onsets → three-note arcs.
      onsets.push({ time, strength: 0.5, band: 'mid' });
    }
  }

  // Gentle loudness swell so the terrain rolls instead of staying flat.
  for (let t = 0; t <= DEMO_DURATION_SEC; t += 1) {
    energy.push({ time: t, energy: 0.5 + 0.35 * Math.sin((2 * Math.PI * t) / DEMO_DURATION_SEC) });
  }

  return {
    version: 1,
    audioHash: DEMO_AUDIO_HASH,
    durationSec: DEMO_DURATION_SEC,
    sampleRate: DEMO_SAMPLE_RATE,
    bpm: DEMO_BPM,
    beats,
    onsets,
    energy,
  };
}
