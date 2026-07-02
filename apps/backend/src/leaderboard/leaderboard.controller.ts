import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { leaderboardQuerySchema } from '@viberide/shared';
import type { LeaderboardPage, LeaderboardQuery } from '@viberide/shared';

import { LEADERBOARD_SERVICE } from '../common/tokens';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { LeaderboardEnabledGuard } from './leaderboard-enabled.guard';
import type { LeaderboardService } from './leaderboard.service';

/** Public per-track leaderboard reads (docs/API.md "Leaderboard"). */
@UseGuards(LeaderboardEnabledGuard)
@Controller('api/leaderboard')
export class LeaderboardController {
  constructor(@Inject(LEADERBOARD_SERVICE) private readonly leaderboard: LeaderboardService) {}

  @Get()
  page(
    @Query(new ZodValidationPipe(leaderboardQuerySchema)) query: LeaderboardQuery,
  ): Promise<LeaderboardPage> {
    return this.leaderboard.getPage(query);
  }
}
