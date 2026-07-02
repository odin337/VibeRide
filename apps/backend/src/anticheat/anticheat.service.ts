import { Injectable } from '@nestjs/common';
import {
  CHECKPOINT_INTERVAL_TICKS,
  COLLECT_RADIUS_M,
  FINISH_SCORE,
  PLAYER,
  SCORE_CEILING_FACTOR,
  seedFromHash,
  SIM_DT,
  SIM_TICK_HZ,
  WORLD_SPEED_BASE,
} from '@viberide/shared';
import type { LevelDefinition, ScoreSubmission } from '@viberide/shared';
import { GEM_SCORE } from '@viberide/track-generator';

import type { StoredTrack } from '../tracks/tracks.repository';

export type AnticheatResult =
  { readonly valid: true } | { readonly valid: false; readonly violations: readonly string[] };

/**
 * THE MUSIC LOCK IS THE ANTI-CHEAT. Horizontal speed is a simulation
 * constant, so a legitimate rider's X is the exact function
 * `x = tick × SIM_DT × WORLD_SPEED_BASE` (clamped at the finish line).
 * Every checkpoint is checked against that closed form — there is no
 * speed "budget" to abuse, any off-path position is an instant violation.
 */
const POSITION_EPS_M = 1e-6;

/** A run cannot outlive the song by more than one checkpoint interval. */
const MAX_TICK_SLACK = CHECKPOINT_INTERVAL_TICKS;

/** durationMs may not exceed this multiple of the track length. */
const MAX_DURATION_FACTOR = 3;

/** `finished` tolerance: the final checkpoint may trail the line slightly. */
const FINISH_TOLERANCE_M = 5;

/** Seconds between checkpoints (2 s at 60 Hz). */
const CHECKPOINT_INTERVAL_SEC = CHECKPOINT_INTERVAL_TICKS / SIM_TICK_HZ;

/**
 * Pickups can straddle a checkpoint boundary by up to the widest possible
 * reach — half the collider plus the fever-magnet radius — so per-interval
 * score windows are widened by this margin on both sides.
 */
const COLLECT_WINDOW_MARGIN_M = PLAYER.widthM / 2 + COLLECT_RADIUS_M * PLAYER.feverMagnetMultiplier;

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

    // Per-pickup ceiling: the priciest pickup at max combo during fever.
    const collectibleScoreCeiling =
      submission.collectiblesTaken * GEM_SCORE * SCORE_CEILING_FACTOR + FINISH_SCORE;
    if (submission.score > collectibleScoreCeiling) {
      violations.push(
        `score ${submission.score} exceeds the collectible score bound ` +
          `collectiblesTaken * ${GEM_SCORE} * ${SCORE_CEILING_FACTOR} + ${FINISH_SCORE} ` +
          `= ${collectibleScoreCeiling}`,
      );
    }

    if (submission.collectiblesTaken > level.collectibles.length) {
      violations.push(
        `collectiblesTaken ${submission.collectiblesTaken} exceeds the ` +
          `${level.collectibles.length} collectibles present in the level`,
      );
    }

    // Crashing early is always legitimate (one-touch death), so there is
    // no lower duration bound — the final-checkpoint consistency check
    // below pins durationMs to the tick count anyway.
    const levelDurationMs = level.durationSec * 1000;
    if (submission.durationMs > levelDurationMs * MAX_DURATION_FACTOR) {
      violations.push(
        `durationMs ${submission.durationMs} above the plausible maximum ` +
          `${levelDurationMs * MAX_DURATION_FACTOR} for a ${level.durationSec} s track`,
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
    const maxTick = Math.ceil(level.durationSec * SIM_TICK_HZ) + MAX_TICK_SLACK;
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
      if (checkpoint.tick > maxTick) {
        violations.push(
          `checkpoint[${index}] tick ${checkpoint.tick} rides past the end of the ` +
            `${level.durationSec} s track (max ${maxTick})`,
        );
      }

      // The music lock: X must sit exactly on the constant-speed path.
      const expectedX = Math.min(checkpoint.tick * SIM_DT * WORLD_SPEED_BASE, level.finishX);
      if (Math.abs(checkpoint.x - expectedX) > POSITION_EPS_M) {
        violations.push(
          `checkpoint[${index}] x ${checkpoint.x} is off the music-locked path ` +
            `(tick ${checkpoint.tick} ⇒ x ${expectedX})`,
        );
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
          ) *
            SCORE_CEILING_FACTOR +
          (crossedFinish ? FINISH_SCORE : 0);
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
    // checkpoint — at the CONSTANT world speed, nothing faster exists.
    const maxTrailingDistance = WORLD_SPEED_BASE * CHECKPOINT_INTERVAL_SEC;
    if (
      submission.distanceM < last.x - POSITION_EPS_M ||
      submission.distanceM > last.x + maxTrailingDistance + POSITION_EPS_M
    ) {
      violations.push(
        `distanceM ${submission.distanceM} inconsistent with the final checkpoint x ${last.x}`,
      );
    }

    if (submission.finished && last.x < finishThresholdX - POSITION_EPS_M) {
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
