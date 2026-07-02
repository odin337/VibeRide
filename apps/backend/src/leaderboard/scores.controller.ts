import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { scoreSubmissionSchema } from '@viberide/shared';
import type { LeaderboardEntry, ScoreSubmission } from '@viberide/shared';

import type { AuthenticatedPlayer } from '../auth/auth.service';
import { CurrentPlayer } from '../auth/current-player.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LEADERBOARD_SERVICE } from '../common/tokens';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { LeaderboardEnabledGuard } from './leaderboard-enabled.guard';
import type { LeaderboardService } from './leaderboard.service';

/**
 * Score submission (docs/API.md "Scores"): authenticated, anti-cheat
 * validated, throttled to 10 requests / 60 s per client.
 */
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@UseGuards(LeaderboardEnabledGuard, JwtAuthGuard)
@Controller('api/scores')
export class ScoresController {
  constructor(@Inject(LEADERBOARD_SERVICE) private readonly leaderboard: LeaderboardService) {}

  @Post()
  submit(
    @Body(new ZodValidationPipe(scoreSubmissionSchema)) submission: ScoreSubmission,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<LeaderboardEntry> {
    return this.leaderboard.submitScore(submission, player);
  }
}
