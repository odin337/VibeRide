export type ObstacleKind = 'spike' | 'gap' | 'block' | 'movingPlatform';

export type CollectibleKind = 'note' | 'gem';

/** A point of the terrain heightfield, world units (metres). */
export interface TrackPoint {
  readonly x: number;
  readonly y: number;
}

export interface Obstacle {
  readonly id: string;
  readonly kind: ObstacleKind;
  /** World-space X of the obstacle's left edge, metres. */
  readonly x: number;
  readonly width: number;
  readonly height: number;
  /** The beat/onset time (seconds) this obstacle is synchronized to. */
  readonly beatTime: number;
}

export interface Collectible {
  readonly id: string;
  readonly kind: CollectibleKind;
  readonly x: number;
  readonly y: number;
  /** The beat/onset time (seconds) this collectible is synchronized to. */
  readonly beatTime: number;
  /** Score awarded on pickup. */
  readonly score: number;
}

/**
 * A fully deterministic level. Regenerating with the same seed and
 * BeatMap must produce a byte-identical structure — the backend relies
 * on this for server-side anti-cheat validation.
 */
export interface LevelDefinition {
  readonly version: 1;
  /** PRNG seed derived from the audio hash. */
  readonly seed: number;
  readonly audioHash: string;
  readonly bpm: number;
  readonly durationSec: number;
  /** Total track length in metres. */
  readonly lengthM: number;
  /** Terrain sampled at fixed X intervals (HEIGHTFIELD_STEP_M). */
  readonly heightfield: readonly TrackPoint[];
  readonly obstacles: readonly Obstacle[];
  readonly collectibles: readonly Collectible[];
  /** Upper bound of achievable score — anti-cheat invariant. */
  readonly maxScore: number;
  /** X coordinate of the finish line, metres. */
  readonly finishX: number;
}
