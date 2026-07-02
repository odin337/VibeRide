import { noopLogger } from '@viberide/shared';
import type {
  BeatMap,
  FeatureFlags,
  LeaderboardEntry,
  LeaderboardPage,
  Logger,
  PlatformAdapter,
  RunResult,
  ScoreSubmission,
} from '@viberide/shared';

import type { ApiClient } from './client';
import { authenticate } from './session';

/**
 * End-of-run leaderboard flow: authenticate → register track → submit
 * score → fetch leaderboard page. Every step degrades gracefully — a
 * failing backend can only ever cost the player the leaderboard panel,
 * never the game.
 */

export interface TrackInfo {
  readonly title: string;
  readonly beatMap: BeatMap;
}

export type SubmitStatus = 'submitted' | 'skipped' | 'failed';

export interface SubmitOutcome {
  readonly status: SubmitStatus;
  readonly entry?: LeaderboardEntry;
  readonly page?: LeaderboardPage;
  readonly message?: string;
}

/** RunResult and ScoreSubmission share the same field contract. */
export function toScoreSubmission(result: RunResult): ScoreSubmission {
  return {
    audioHash: result.audioHash,
    seed: result.seed,
    score: result.score,
    distanceM: result.distanceM,
    finished: result.finished,
    durationMs: result.durationMs,
    collectiblesTaken: result.collectiblesTaken,
    checkpoints: [...result.checkpoints],
  };
}

export interface SubmitFlowDeps {
  readonly client: ApiClient;
  readonly platform: PlatformAdapter;
  readonly flags: FeatureFlags;
  readonly logger?: Logger;
}

export async function submitRunResult(
  deps: SubmitFlowDeps,
  result: RunResult,
  track: TrackInfo,
): Promise<SubmitOutcome> {
  const logger = deps.logger ?? noopLogger;
  if (!deps.flags.leaderboardEnabled) {
    return { status: 'skipped', message: 'leaderboard disabled' };
  }

  const auth = await authenticate(deps.client, deps.platform);
  if (!auth.ok) {
    logger.warn('leaderboard auth failed', { message: auth.error.message });
    return { status: 'failed', message: `sign-in failed: ${auth.error.message}` };
  }

  const registration = await deps.client.registerTrack({
    metadata: {
      audioHash: result.audioHash,
      title: track.title,
      durationSec: track.beatMap.durationSec,
      bpm: track.beatMap.bpm,
    },
    beatMap: track.beatMap,
  });
  if (!registration.ok && registration.error.status !== 409) {
    // 409 = already registered (possibly by another player) — expected and
    // harmless. Anything else is logged, but submission is still attempted:
    // the backend answers 404 authoritatively if the track truly is unknown.
    logger.warn('track registration failed', { message: registration.error.message });
  }

  const submitted = await deps.client.submitScore(toScoreSubmission(result));
  const page = await deps.client.getLeaderboard(result.audioHash);

  if (!submitted.ok) {
    return {
      status: 'failed',
      message: `score rejected: ${submitted.error.message}`,
      page: page.ok ? page.value : undefined,
    };
  }
  return {
    status: 'submitted',
    entry: submitted.value,
    page: page.ok ? page.value : undefined,
  };
}
