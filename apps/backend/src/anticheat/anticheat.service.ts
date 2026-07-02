import { Injectable } from '@nestjs/common';
import {
  CHECKPOINT_INTERVAL_TICKS,
  FINISH_SCORE,
  PLAYER,
  seedFromHash,
  SIM_TICK_HZ,
  WORLD_SPEED_BASE,
} from '@viberide/shared';
import type { LevelDefinition, ScoreSubmission } from '@viberide/shared';
import { GEM_SCORE } from '@viberide/track-generator';

import type { StoredTrack } from '../tracks/tracks.repository';

export type AnticheatResult =
  { readonly valid: true } | { readonly valid: false; readonly violations: readonly string[] };

/** Float comparison slack for positions/speeds accumulated over a run. */
const EPS = 1e-6;

/**
 * Nobody moves faster than a permanently-boosting player; the extra 25%
 * absorbs downhill acceleration and integration slack.
 */
const MAX_SPEED_MPS = WORLD_SPEED_BASE * PLAYER.boostMultiplier * 1.25;

/** A run must take at least half and at most triple the track duration. */
const MIN_DURATION_FACTOR = 0.5;
const MAX_DURATION_FACTOR = 3;

/** `finished` tolerance: the final checkpoint may trail the line slightly. */
const FINISH_TOLERANCE_M = 5;

/** Seconds between checkpoints (2 s at 60 Hz). */
const CHECKPOINT_INTERVAL_SEC = CHECKPOINT_INTERVAL_TICKS / SIM_TICK_HZ;

/**
 * Pickups can straddle a checkpoint boundary by up to the collider width,
 * so per-interval score windows are widened by this margin on both sides.
 */
const COLLECT_WINDOW_MARGIN_M = PLAYER.widthM;

interface CheckpointState {
  readonly tick: number;
  readonly x: number;
  readonly score: number;
}

/** Runs start at the origin with zero score — the implicit checkpoint 0. */
const RUN_START: CheckpointState = { tick: 0, x: 0, score: 0 };

/**
 * Server-side anti-cheat: replays the physical and scoring invariants of a
 * submission against the level regenerated for the claimed audioHash
 * (docs/ARCHITECTURE.md "Determinism & anti-cheat"). Collects EVERY
 * violation instead of failing fast so clients (and abuse dashboards) see
 * the full picture in one 422 response.
 */
@Injectable()
export class AnticheatService {
  validateSubmission(submission: ScoreSubmission, track: StoredTrack): AnticheatResult {
    const level = track.level;
    const violations: string[] = [];

    const expectedSeed = seedFromHash(submission.audioHash);
    if (submission.seed !== expectedSeed) {
      violations.push(
        `seed ${submission.seed} does not match seedFromHash(audioHash) = ${expectedSeed}`,
      );
    }

    if (submission.score > level.maxScore) {
      violations.push(
        `score ${submission.score} exceeds the level maxScore ${level.maxScore} for this track`,
      );
    }

    const collectibleScoreCeiling = submission.collectiblesTaken * GEM_SCORE + FINISH_SCORE;
    if (submission.score > collectibleScoreCeiling) {
      violations.push(
        `score ${submission.score} exceeds the collectible score bound ` +
          `collectiblesTaken * ${GEM_SCORE} + ${FINISH_SCORE} = ${collectibleScoreCeiling}`,
      );
    }

    if (submission.collectiblesTaken > level.collectibles.length) {
      violations.push(
        `collectiblesTaken ${submission.collectiblesTaken} exceeds the ` +
          `${level.collectibles.length} collectibles present in the level`,
      );
    }

    const levelDurationMs = level.durationSec * 1000;
    if (
      submission.durationMs < levelDurationMs * MIN_DURATION_FACTOR ||
      submission.durationMs > levelDurationMs * MAX_DURATION_FACTOR
    ) {
      violations.push(
        `durationMs ${submission.durationMs} outside the plausible range ` +
          `[${levelDurationMs * MIN_DURATION_FACTOR}, ${levelDurationMs * MAX_DURATION_FACTOR}] ` +
          `for a ${level.durationSec} s track`,
      );
    }

    this.validateCheckpoints(submission, level, violations);

    return violations.length === 0 ? { valid: true } : { valid: false, violations };
  }

  private validateCheckpoints(
    submission: ScoreSubmission,
    level: LevelDefinition,
    violations: string[],
  ): void {
    const finishThresholdX = level.finishX - FINISH_TOLERANCE_M;
    let previous = RUN_START;

    for (const [index, checkpoint] of submission.checkpoints.entries()) {
      if (checkpoint.tick % CHECKPOINT_INTERVAL_TICKS !== 0) {
        violations.push(
          `checkpoint[${index}] tick ${checkpoint.tick} is not aligned to ` +
            `CHECKPOINT_INTERVAL_TICKS (${CHECKPOINT_INTERVAL_TICKS})`,
        );
      }
      const tickGap = checkpoint.tick - previous.tick;
      if (tickGap <= 0) {
        violations.push(
          `checkpoint[${index}] tick ${checkpoint.tick} is not strictly increasing ` +
            `(previous ${previous.tick})`,
        );
      } else if (tickGap !== CHECKPOINT_INTERVAL_TICKS) {
        violations.push(`checkpoint[${index}] tick gap ${tickGap} != ${CHECKPOINT_INTERVAL_TICKS}`);
      }

      if (checkpoint.x < previous.x - EPS) {
        violations.push(
          `checkpoint[${index}] x ${checkpoint.x} decreases (previous ${previous.x})`,
        );
      } else if (tickGap > 0) {
        const speed = (checkpoint.x - previous.x) / (tickGap / SIM_TICK_HZ);
        if (speed > MAX_SPEED_MPS + EPS) {
          violations.push(
            `checkpoint[${index}] implies speed ${speed.toFixed(3)} m/s over the interval, ` +
              `above the physical bound ${MAX_SPEED_MPS} m/s`,
          );
        }
      }

      const scoreGain = checkpoint.score - previous.score;
      if (scoreGain < 0) {
        violations.push(
          `checkpoint[${index}] score ${checkpoint.score} is not non-decreasing ` +
            `(previous ${previous.score})`,
        );
      } else {
        const crossedFinish = previous.x < finishThresholdX && checkpoint.x >= finishThresholdX;
        const allowedGain =
          this.collectibleScoreBetween(
            level,
            previous.x - COLLECT_WINDOW_MARGIN_M,
            checkpoint.x + COLLECT_WINDOW_MARGIN_M,
          ) + (crossedFinish ? FINISH_SCORE : 0);
        if (scoreGain > allowedGain) {
          violations.push(
            `checkpoint[${index}] score gain ${scoreGain} exceeds the ${allowedGain} ` +
              'obtainable from collectibles (and finish bonus) in the traversed interval',
          );
        }
      }

      previous = checkpoint;
    }

    const last = submission.checkpoints[submission.checkpoints.length - 1];
    if (!last) {
      // Unreachable behind scoreSubmissionSchema (min 1 checkpoint).
      violations.push('submission carries no checkpoints');
      return;
    }

    if (last.score !== submission.score) {
      violations.push(
        `final checkpoint score ${last.score} does not match the claimed score ` +
          `${submission.score}`,
      );
    }

    const expectedDurationMs = (last.tick / SIM_TICK_HZ) * 1000;
    if (Math.abs(submission.durationMs - expectedDurationMs) > CHECKPOINT_INTERVAL_SEC * 1000) {
      violations.push(
        `durationMs ${submission.durationMs} inconsistent with the final checkpoint tick ` +
          `${last.tick} (~${expectedDurationMs} ms)`,
      );
    }

    // The run may continue for at most one more interval past the final
    // checkpoint, so the claimed distance is bounded accordingly.
    const maxTrailingDistance = MAX_SPEED_MPS * CHECKPOINT_INTERVAL_SEC;
    if (
      submission.distanceM < last.x - EPS ||
      submission.distanceM > last.x + maxTrailingDistance + EPS
    ) {
      violations.push(
        `distanceM ${submission.distanceM} inconsistent with the final checkpoint x ${last.x}`,
      );
    }

    if (submission.finished && last.x < finishThresholdX - EPS) {
      violations.push(
        `finished run ends at x ${last.x}, short of the finish line at ` +
          `${level.finishX} (tolerance ${FINISH_TOLERANCE_M} m)`,
      );
    }
  }

  private collectibleScoreBetween(level: LevelDefinition, fromX: number, toX: number): number {
    let sum = 0;
    for (const collectible of level.collectibles) {
      if (collectible.x >= fromX && collectible.x <= toX) {
        sum += collectible.score;
      }
    }
    return sum;
  }
}
