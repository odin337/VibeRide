import { CHECKPOINT_INTERVAL_TICKS, seedFromHash, SIM_TICK_HZ } from '@viberide/shared';
import type { ReplayCheckpoint, ScoreSubmission } from '@viberide/shared';
import { generateLevel, makeBeatMap } from '@viberide/track-generator';
import { beforeAll, describe, expect, it } from 'vitest';

import { asStoredTrack, buildRun } from '../testing/runs';
import type { StoredTrack } from '../tracks/tracks.repository';
import { AnticheatService } from './anticheat.service';

const service = new AnticheatService();

let track: StoredTrack;
let legitimate: ScoreSubmission;

beforeAll(() => {
  // Deterministic fixture: 60 s, 120 BPM synthetic BeatMap with onsets on
  // the beat grid — the level carries obstacles and collectibles.
  track = asStoredTrack(generateLevel(makeBeatMap()));
  legitimate = buildRun(track.level);
});

function expectViolation(submission: ScoreSubmission, pattern: RegExp): void {
  const result = service.validateSubmission(submission, track);
  expect(result.valid).toBe(false);
  if (!result.valid) {
    expect(result.violations.some((violation) => pattern.test(violation))).toBe(true);
  }
}

function withLastCheckpoint(
  submission: ScoreSubmission,
  patch: Partial<ReplayCheckpoint>,
): ScoreSubmission {
  const checkpoints = [...submission.checkpoints];
  const last = checkpoints[checkpoints.length - 1];
  if (!last) {
    throw new Error('fixture run has no checkpoints');
  }
  checkpoints[checkpoints.length - 1] = { ...last, ...patch };
  return { ...submission, checkpoints };
}

describe('AnticheatService — legitimate submissions', () => {
  it('accepts a full finished run', () => {
    expect(track.level.collectibles.length).toBeGreaterThan(0);
    expect(legitimate.finished).toBe(true);
    expect(service.validateSubmission(legitimate, track)).toEqual({ valid: true });
  });

  it('accepts an unfinished partial run', () => {
    const partial = buildRun(track.level, {
      endTick: CHECKPOINT_INTERVAL_TICKS * 20,
      finished: false,
    });
    expect(service.validateSubmission(partial, track)).toEqual({ valid: true });
  });
});

describe('AnticheatService — violation classes', () => {
  it('detects a wrong seed', () => {
    expectViolation(
      { ...legitimate, seed: legitimate.seed + 1 },
      /seed .* does not match seedFromHash/,
    );
  });

  it('detects a score above the level maxScore', () => {
    const score = track.level.maxScore + 1;
    expectViolation(
      withLastCheckpoint(
        { ...legitimate, score, collectiblesTaken: track.level.collectibles.length },
        { score },
      ),
      /exceeds the level maxScore/,
    );
  });

  it('detects a score above the collectiblesTaken bound', () => {
    // Claim a real-looking score while claiming zero pickups.
    expectViolation({ ...legitimate, collectiblesTaken: 0 }, /exceeds the collectible score bound/);
  });

  it('detects more collectibles than the level contains', () => {
    expectViolation(
      { ...legitimate, collectiblesTaken: track.level.collectibles.length + 1 },
      /exceeds the .* collectibles present/,
    );
  });

  it('detects an implausible duration', () => {
    const levelMs = track.level.durationSec * 1000;
    expectViolation({ ...legitimate, durationMs: Math.floor(levelMs / 4) }, /durationMs/);
    expectViolation({ ...legitimate, durationMs: levelMs * 4 }, /durationMs/);
  });

  it('detects misaligned checkpoint ticks', () => {
    const checkpoints = legitimate.checkpoints.map((checkpoint, index) =>
      index === 1 ? { ...checkpoint, tick: checkpoint.tick + 7 } : checkpoint,
    );
    expectViolation({ ...legitimate, checkpoints }, /not aligned to CHECKPOINT_INTERVAL_TICKS/);
  });

  it('detects non-increasing ticks', () => {
    const checkpoints = legitimate.checkpoints.map((checkpoint, index) =>
      index === 2 ? { ...checkpoint, tick: 0 } : checkpoint,
    );
    expectViolation({ ...legitimate, checkpoints }, /not strictly increasing/);
  });

  it('detects a wrong tick gap', () => {
    // Drop one checkpoint from the middle: the next gap doubles.
    const checkpoints = legitimate.checkpoints.filter((_, index) => index !== 1);
    expectViolation({ ...legitimate, checkpoints }, /tick gap/);
  });

  it('detects x moving backwards', () => {
    const checkpoints = legitimate.checkpoints.map((checkpoint, index) =>
      index === 3 ? { ...checkpoint, x: 0 } : checkpoint,
    );
    expectViolation({ ...legitimate, checkpoints }, /decreases/);
  });

  it('detects teleport-grade speed between checkpoints', () => {
    // 100 m in one 2 s interval = 50 m/s, far above 16 m/s boosted.
    const checkpoints = legitimate.checkpoints.map((checkpoint, index) =>
      index === 1 ? { ...checkpoint, x: checkpoint.x + 100 } : checkpoint,
    );
    expectViolation({ ...legitimate, checkpoints }, /above the physical bound/);
  });

  it('detects a decreasing score', () => {
    // Index 5 (x = 96 m): by then the collect-everything run has banked
    // several pickups, so zeroing this checkpoint is a real decrease.
    const fifth = legitimate.checkpoints[4];
    expect(fifth && fifth.score > 0).toBe(true);
    const checkpoints = legitimate.checkpoints.map((checkpoint, index) =>
      index === 5 ? { ...checkpoint, score: 0 } : checkpoint,
    );
    expectViolation({ ...legitimate, checkpoints }, /not non-decreasing/);
  });

  it('detects a score gain unobtainable within one interval', () => {
    // +500 in the first interval, where at most a couple of pickups exist.
    const checkpoints = legitimate.checkpoints.map((checkpoint, index) =>
      index === 0 ? { ...checkpoint, score: checkpoint.score + 500 } : checkpoint,
    );
    const last = checkpoints[checkpoints.length - 1];
    expectViolation(
      { ...legitimate, checkpoints, score: last ? last.score : legitimate.score },
      /score gain .* exceeds/,
    );
  });

  it('detects a final checkpoint inconsistent with the claimed score', () => {
    expectViolation(
      { ...legitimate, score: legitimate.score - 5 },
      /final checkpoint score .* does not match the claimed score/,
    );
  });

  it('detects durationMs inconsistent with the final tick', () => {
    const lastTick = legitimate.checkpoints[legitimate.checkpoints.length - 1]?.tick ?? 0;
    const skewedMs = Math.round((lastTick / SIM_TICK_HZ) * 1000) + 10_000;
    expectViolation(
      { ...legitimate, durationMs: skewedMs },
      /inconsistent with the final checkpoint tick/,
    );
  });

  it('detects distanceM inconsistent with the final checkpoint x', () => {
    expectViolation(
      { ...legitimate, distanceM: legitimate.distanceM + 200 },
      /distanceM .* inconsistent/,
    );
  });

  it('detects finished=true when the run never reached the finish line', () => {
    const partial = buildRun(track.level, {
      endTick: CHECKPOINT_INTERVAL_TICKS * 10,
      finished: false,
    });
    expectViolation({ ...partial, finished: true }, /short of the finish line/);
  });

  it('collects ALL violations instead of failing fast', () => {
    const result = service.validateSubmission(
      {
        ...legitimate,
        seed: seedFromHash(track.level.audioHash) + 1,
        collectiblesTaken: track.level.collectibles.length + 1,
        durationMs: 1,
      },
      track,
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.violations.length).toBeGreaterThanOrEqual(3);
    }
  });
});
