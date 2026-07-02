import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  LeaderboardEntry,
  LeaderboardPage,
  LeaderboardQuery,
  ScoreSubmission,
} from '@viberide/shared';

import type { AnticheatService } from '../anticheat/anticheat.service';
import type { AuthenticatedPlayer } from '../auth/auth.service';
import { ANTICHEAT_SERVICE, LEADERBOARD_REPOSITORY, TRACKS_REPOSITORY } from '../common/tokens';
import type { TracksRepository } from '../tracks/tracks.repository';
import type { LeaderboardRepository } from './leaderboard.repository';

@Injectable()
export class LeaderboardService {
  constructor(
    @Inject(TRACKS_REPOSITORY) private readonly tracks: TracksRepository,
    @Inject(LEADERBOARD_REPOSITORY) private readonly board: LeaderboardRepository,
    @Inject(ANTICHEAT_SERVICE) private readonly anticheat: AnticheatService,
  ) {}

  /**
   * Full submission pipeline per docs/API.md POST /api/scores: unknown
   * track → 404; any anti-cheat violation → 422 whose message names every
   * failed check; accepted scores upsert the player's best and return the
   * ranked entry.
   */
  async submitScore(
    submission: ScoreSubmission,
    player: AuthenticatedPlayer,
  ): Promise<LeaderboardEntry> {
    const track = await this.tracks.findByAudioHash(submission.audioHash);
    if (!track) {
      throw new NotFoundException(
        `track ${submission.audioHash} was never registered via POST /api/tracks`,
      );
    }
    const verdict = this.anticheat.validateSubmission(submission, track);
    if (!verdict.valid) {
      throw new UnprocessableEntityException(verdict.violations.join('; '));
    }
    return this.board.upsertBest({
      playerId: player.id,
      displayName: player.displayName,
      score: submission.score,
      audioHash: submission.audioHash,
      achievedAt: new Date().toISOString(),
    });
  }

  getPage(query: LeaderboardQuery): Promise<LeaderboardPage> {
    return this.board.getPage(query.audioHash, query.limit);
  }
}
