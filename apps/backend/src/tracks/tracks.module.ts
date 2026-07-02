import { Module } from '@nestjs/common';

import { TRACKS_REPOSITORY, TRACKS_SERVICE } from '../common/tokens';
import { TracksController } from './tracks.controller';
import { InMemoryTracksRepository } from './tracks.repository';
import { TracksService } from './tracks.service';

@Module({
  controllers: [TracksController],
  providers: [
    { provide: TRACKS_REPOSITORY, useClass: InMemoryTracksRepository },
    { provide: TRACKS_SERVICE, useClass: TracksService },
  ],
  // The scores pipeline (LeaderboardModule) resolves tracks for anti-cheat.
  exports: [TRACKS_REPOSITORY],
})
export class TracksModule {}
