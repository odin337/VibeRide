import { Module } from '@nestjs/common';

import { AnticheatService } from '../anticheat/anticheat.service';
import { ANTICHEAT_SERVICE, LEADERBOARD_REPOSITORY, LEADERBOARD_SERVICE } from '../common/tokens';
import { TracksModule } from '../tracks/tracks.module';
import { LeaderboardController } from './leaderboard.controller';
import { InMemoryLeaderboardRepository } from './leaderboard.repository';
import { LeaderboardService } from './leaderboard.service';
import { ScoresController } from './scores.controller';

@Module({
  imports: [TracksModule],
  controllers: [ScoresController, LeaderboardController],
  providers: [
    { provide: ANTICHEAT_SERVICE, useClass: AnticheatService },
    { provide: LEADERBOARD_REPOSITORY, useClass: InMemoryLeaderboardRepository },
    { provide: LEADERBOARD_SERVICE, useClass: LeaderboardService },
  ],
})
export class LeaderboardModule {}
