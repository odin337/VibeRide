/** Frequency bands used across audio analysis and gameplay reactions. */
export type FrequencyBand = 'bass' | 'mid' | 'high';

export const FREQUENCY_BANDS: readonly FrequencyBand[] = ['bass', 'mid', 'high'];

/** Band boundaries in Hz used by the analyzer. */
export interface BandRange {
  readonly lowHz: number;
  readonly highHz: number;
}

export const BAND_RANGES: Readonly<Record<FrequencyBand, BandRange>> = {
  bass: { lowHz: 20, highHz: 250 },
  mid: { lowHz: 250, highHz: 2000 },
  high: { lowHz: 2000, highHz: 8000 },
};

/** A detected transient (drum hit, note attack) in one frequency band. */
export interface Onset {
  /** Seconds from track start. */
  readonly time: number;
  /** Normalized strength in [0, 1]. */
  readonly strength: number;
  readonly band: FrequencyBand;
}

/** A metrical beat inferred from the BPM grid. */
export interface Beat {
  /** Seconds from track start. */
  readonly time: number;
  /** 1-based position within a 4/4 bar (1..4). */
  readonly indexInBar: number;
}

/** Loudness envelope sample. */
export interface EnergyPoint {
  /** Seconds from track start. */
  readonly time: number;
  /** Normalized RMS energy in [0, 1]. */
  readonly energy: number;
}

/**
 * The complete, serializable result of analyzing one audio file.
 * Deterministic: the same audio bytes always produce the same BeatMap.
 */
export interface BeatMap {
  readonly version: 1;
  /** sha-256 hex digest of the source audio bytes. */
  readonly audioHash: string;
  readonly durationSec: number;
  readonly sampleRate: number;
  /** Estimated tempo, beats per minute. */
  readonly bpm: number;
  readonly beats: readonly Beat[];
  readonly onsets: readonly Onset[];
  readonly energy: readonly EnergyPoint[];
}
