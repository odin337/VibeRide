import {
  CHECKPOINT_INTERVAL_TICKS,
  FINISH_SCORE,
  seedFromHash,
  SIM_DT,
  SIM_TICK_HZ,
  WORLD_SPEED_BASE,
} from '@viberide/shared';
import type {
  LevelDefinition,
  ReplayCheckpoint,
  ScoreSubmission,
  TrackMetadata,
} from '@viberide/shared';

import type { StoredTrack } from '../tracks/tracks.repository';

/**
 * Test-support builders for synthetic-but-legitimate run submissions: a
 * base-speed rider that collects every collectible it passes and (when the
 * run reaches the end) the finish bonus. Excluded from the production
 * build (tsconfig.build.json), fully executed by the test suite.
 */
export interface RunOptions {
  /** Last checkpoint tick; defaults to the full track length. */
  readonly endTick?: number;
  /** Defaults to true exactly when the run spans the full track. */
  readonly finished?: boolean;
}

export function buildRun(level: LevelDefinition, options: RunOptions = {}): ScoreSubmission {
  const totalTicks = Math.round(level.durationSec * SIM_TICK_HZ);
  const endTick = options.endTick ?? totalTicks;
  const finished = options.finished ?? endTick === totalTicks;

  const collectibles = [...level.collectibles].sort((a, b) => a.x - b.x);
  const checkpoints: ReplayCheckpoint[] = [];
  let score = 0;
  let taken = 0;
  let nextCollectible = 0;

  for (let tick = CHECKPOINT_INTERVAL_TICKS; tick <= endTick; tick += CHECKPOINT_INTERVAL_TICKS) {
    // The exact music-locked path the simulation produces (see physics.ts).
    const x = Math.min(tick * SIM_DT * WORLD_SPEED_BASE, level.finishX);
    for (; nextCollectible < collectibles.length; nextCollectible += 1) {
      const collectible = collectibles[nextCollectible];
      if (!collectible || collectible.x > x) {
        break;
      }
      score += collectible.score;
      taken += 1;
    }
    if (finished && tick === endTick) {
      score += FINISH_SCORE;
    }
    checkpoints.push({ tick, x, y: 0, score });
  }

  const last = checkpoints[checkpoints.length - 1];
  if (!last) {
    throw new Error('buildRun: endTick shorter than one checkpoint interval');
  }
  return {
    audioHash: level.audioHash,
    seed: seedFromHash(level.audioHash),
    score: last.score,
    distanceM: last.x,
    finished,
    durationMs: Math.round((last.tick / SIM_TICK_HZ) * 1000),
    collectiblesTaken: taken,
    checkpoints,
  };
}

/** Wraps a level as the StoredTrack shape the anti-cheat service consumes. */
export function asStoredTrack(level: LevelDefinition): StoredTrack {
  const metadata: TrackMetadata = {
    audioHash: level.audioHash,
    title: 'Fixture track',
    durationSec: level.durationSec,
    bpm: level.bpm,
  };
  return {
    metadata,
    beatMap: {
      version: 1,
      audioHash: level.audioHash,
      durationSec: level.durationSec,
      sampleRate: 44100,
      bpm: level.bpm,
      beats: [],
      onsets: [],
      energy: [],
    },
    level,
  };
}
