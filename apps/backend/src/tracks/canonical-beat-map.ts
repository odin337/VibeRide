import type { Beat, BeatMap, TrackMetadata } from '@viberide/shared';

/**
 * Derives the canonical server-side BeatMap for a registered track.
 *
 * docs/API.md registers tracks by metadata only (audioHash, title,
 * durationSec, bpm) — the client's analyzed BeatMap never crosses the wire.
 * The anti-cheat pipeline still needs a level to regenerate, so the backend
 * builds this deterministic placeholder: a plain BPM beat grid with no
 * onsets and no energy envelope. generateLevel turns it into the minimum
 * viable level (terrain + finish line, maxScore = FINISH_SCORE), giving
 * anti-cheat a conservative but fully deterministic model of the track.
 * When persistent BeatMap storage lands (see TracksRepository), the stored
 * analyzer output replaces this derivation without touching callers.
 */
export function canonicalBeatMap(metadata: TrackMetadata): BeatMap {
  const beatIntervalSec = 60 / metadata.bpm;
  const beats: Beat[] = [];
  for (let i = 0; i * beatIntervalSec < metadata.durationSec; i += 1) {
    beats.push({ time: i * beatIntervalSec, indexInBar: (i % 4) + 1 });
  }
  return {
    version: 1,
    audioHash: metadata.audioHash,
    durationSec: metadata.durationSec,
    sampleRate: 44100,
    bpm: metadata.bpm,
    beats,
    onsets: [],
    energy: [],
  };
}
