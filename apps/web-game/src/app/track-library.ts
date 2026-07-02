import type { Beat, BeatMap, EnergyPoint, Onset } from '@viberide/shared';

/**
 * Built-in, pre-tuned track library (Piano-Tiles style): every entry is a
 * deterministic synthesized composition — a BeatMap that drives level
 * generation AND a PatternSpec the playback layer performs live through
 * Web Audio voices. The two are built from the same rhythm knobs, so what
 * you hear is exactly what you ride.
 *
 * NFT tracks: entries with `nftItemName` are gated by ownership of the
 * matching item in the skin collection (TonModule.getOwnedSkins).
 * TODO(manual): point `skinCollectionAddress`/a dedicated track collection
 * at the real minted collection to sell tracks as NFTs.
 */

/** Live-synth performance spec for a library track. */
export interface PatternSpec {
  /** Scale root, Hz (the bass plays an octave below). */
  readonly rootHz: number;
  /** Scale degrees as semitone offsets from the root (pentatonic-ish). */
  readonly scaleSemitones: readonly number[];
  /** Bass degree per bar (semitone offsets), cycled. */
  readonly bassSemitones: readonly number[];
  /** Kick voice: start/end pitch sweep, decay and gain. */
  readonly kick: {
    readonly startHz: number;
    readonly endHz: number;
    readonly decaySec: number;
    readonly gain: number;
  };
  /** Hi-hat subdivision per beat (2 = eighths) — arrangement layer 1. */
  readonly hatSubdivision: number;
  /** Waveform of the chord-stab voice — arrangement layer 2. */
  readonly stabType: 'square' | 'sawtooth' | 'triangle';
}

/** Rhythm knobs shared by the BeatMap generator and the descriptions. */
interface RhythmSpec {
  /** A strong (obstacle-spawning) bass onset every N bars. */
  readonly obstacleEveryBars: number;
  /** Also hit a strong bass on beat 3 (hardcore double-kick). */
  readonly doubleKick: boolean;
  /** A gem-strength high onset every N bars. */
  readonly gemEveryBars: number;
}

export interface LibraryTrack {
  readonly id: string;
  readonly title: string;
  readonly bpm: number;
  readonly durationSec: number;
  /** 1 = cruise, 3 = Geometry-Dash-grade. */
  readonly difficulty: 1 | 2 | 3;
  /**
   * Stable synthetic identity — NOT a digest of real bytes, just a fixed
   * well-formed sha-256 hex so each track gets its own deterministic seed
   * and its own leaderboard.
   */
  readonly audioHash: string;
  readonly pattern: PatternSpec;
  readonly rhythm: RhythmSpec;
  /** Owning this NFT item (skin collection) unlocks the track. */
  readonly nftItemName?: string;
}

const MINOR_PENTATONIC: readonly number[] = [0, 3, 5, 7, 10];
const MAJOR_PENTATONIC: readonly number[] = [0, 2, 4, 7, 9];

export const TRACK_LIBRARY: readonly LibraryTrack[] = [
  {
    id: 'sunset-cruise',
    title: 'Sunset Cruise',
    bpm: 100,
    durationSec: 45,
    difficulty: 1,
    audioHash: '1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809',
    pattern: {
      rootHz: 220, // A3
      scaleSemitones: MAJOR_PENTATONIC,
      bassSemitones: [0, 0, -3, -5],
      kick: { startHz: 130, endHz: 48, decaySec: 0.16, gain: 0.5 },
      hatSubdivision: 2,
      stabType: 'triangle',
    },
    rhythm: { obstacleEveryBars: 2, doubleKick: false, gemEveryBars: 4 },
  },
  {
    id: 'neon-runner',
    title: 'Neon Runner',
    bpm: 128,
    durationSec: 60,
    difficulty: 2,
    audioHash: '2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a',
    pattern: {
      rootHz: 233.08, // A#3
      scaleSemitones: MINOR_PENTATONIC,
      bassSemitones: [0, -2, -4, -5],
      kick: { startHz: 150, endHz: 50, decaySec: 0.13, gain: 0.55 },
      hatSubdivision: 2,
      stabType: 'square',
    },
    rhythm: { obstacleEveryBars: 1, doubleKick: false, gemEveryBars: 4 },
  },
  {
    id: 'bass-hammer',
    title: 'Bass Hammer',
    bpm: 150,
    durationSec: 60,
    difficulty: 3,
    audioHash: '3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b',
    pattern: {
      rootHz: 196, // G3
      scaleSemitones: MINOR_PENTATONIC,
      bassSemitones: [0, 0, -5, -7],
      kick: { startHz: 170, endHz: 55, decaySec: 0.11, gain: 0.6 },
      hatSubdivision: 4,
      stabType: 'sawtooth',
    },
    rhythm: { obstacleEveryBars: 1, doubleKick: true, gemEveryBars: 3 },
  },
  {
    id: 'midnight-drift',
    title: 'Midnight Drift (NFT)',
    bpm: 118,
    durationSec: 50,
    difficulty: 2,
    audioHash: '4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c',
    pattern: {
      rootHz: 246.94, // B3
      scaleSemitones: MINOR_PENTATONIC,
      bassSemitones: [0, -4, -2, -7],
      kick: { startHz: 140, endHz: 45, decaySec: 0.18, gain: 0.5 },
      hatSubdivision: 2,
      stabType: 'sawtooth',
    },
    rhythm: { obstacleEveryBars: 1, doubleKick: false, gemEveryBars: 2 },
    nftItemName: 'Midnight Drift',
  },
];

/** The track loadDemo() rides — the first (easiest) library entry. */
export const DEFAULT_LIBRARY_TRACK = TRACK_LIBRARY[0] as LibraryTrack;

export function findLibraryTrack(id: string): LibraryTrack | null {
  return TRACK_LIBRARY.find((track) => track.id === id) ?? null;
}

const BEATS_PER_BAR = 4;

/**
 * Deterministic BeatMap for a library track. Mirrors what analyzePcm
 * produces for real audio: bass onsets on downbeats (obstacles, strength
 * follows the rhythm knobs), high onsets on beat 2 (gems when strong),
 * mid onsets on beat 3 (note arcs), plus a gentle energy swell so the
 * terrain rolls. Same input → byte-identical output, always.
 */
export function generateLibraryBeatMap(track: LibraryTrack): BeatMap {
  const beatInterval = 60 / track.bpm;
  const beatCount = Math.floor(track.durationSec / beatInterval);
  const beats: Beat[] = [];
  const onsets: Onset[] = [];
  const energy: EnergyPoint[] = [];
  const { obstacleEveryBars, doubleKick, gemEveryBars } = track.rhythm;

  for (let i = 0; i < beatCount; i += 1) {
    const time = i * beatInterval;
    const indexInBar = (i % BEATS_PER_BAR) + 1;
    const bar = Math.floor(i / BEATS_PER_BAR);
    beats.push({ time, indexInBar });

    if (indexInBar === 1) {
      // Above the generator's 0.6 threshold only on "obstacle bars".
      const strong = bar % obstacleEveryBars === 0;
      onsets.push({ time, strength: strong ? 0.72 : 0.5, band: 'bass' });
    } else if (indexInBar === 3 && doubleKick) {
      // Hardcore double-kick: extra obstacles on beat 3 of odd bars.
      onsets.push({ time, strength: bar % 2 === 1 ? 0.68 : 0.5, band: 'bass' });
    } else if (indexInBar === 2) {
      const gem = bar % gemEveryBars === gemEveryBars - 1;
      onsets.push({ time, strength: gem ? 0.85 : 0.45, band: 'high' });
    } else if (indexInBar === 3) {
      onsets.push({ time, strength: 0.5, band: 'mid' });
    } else {
      onsets.push({ time, strength: 0.4, band: 'mid' });
    }
  }

  for (let t = 0; t <= Math.floor(track.durationSec); t += 1) {
    energy.push({
      time: t,
      energy: 0.5 + 0.3 * Math.sin((2 * Math.PI * t) / track.durationSec) + 0.05 * track.difficulty,
    });
  }

  return {
    version: 1,
    audioHash: track.audioHash,
    durationSec: track.durationSec,
    sampleRate: 44100,
    bpm: track.bpm,
    beats,
    onsets,
    energy,
  };
}
