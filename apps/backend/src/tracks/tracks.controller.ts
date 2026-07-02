import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { sha256HexSchema, trackMetadataSchema } from '@viberide/shared';
import type { TrackMetadata } from '@viberide/shared';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TRACKS_SERVICE } from '../common/tokens';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { TracksService } from './tracks.service';

/**
 * Track registry (docs/API.md "Tracks"): POST is authenticated, reads are
 * public. The list endpoint is an additive convenience on top of the
 * documented surface (see notes in the task summary).
 */
@Controller('api/tracks')
export class TracksController {
  constructor(@Inject(TRACKS_SERVICE) private readonly tracks: TracksService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  register(
    @Body(new ZodValidationPipe(trackMetadataSchema)) metadata: TrackMetadata,
  ): Promise<TrackMetadata> {
    return this.tracks.register(metadata);
  }

  @Get()
  list(): Promise<TrackMetadata[]> {
    return this.tracks.list();
  }

  @Get(':audioHash')
  get(
    @Param('audioHash', new ZodValidationPipe(sha256HexSchema)) audioHash: string,
  ): Promise<TrackMetadata> {
    return this.tracks.getByAudioHash(audioHash);
  }
}
