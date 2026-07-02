import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { TrackMetadata } from '@viberide/shared';
import { generateLevel, MIN_DURATION_SEC, validatePlayability } from '@viberide/track-generator';

import { TRACKS_REPOSITORY } from '../common/tokens';
import { canonicalBeatMap } from './canonical-beat-map';
import type { TracksRepository } from './tracks.repository';

/**
 * Upper bound on registerable track length. Level size grows linearly with
 * duration (heightfield samples every 0.5 m at 8 m/s ⇒ 16 samples/s), so an
 * unbounded durationSec would let one request allocate arbitrary memory.
 * One hour ≈ 57 600 samples, far beyond any real song.
 */
export const MAX_TRACK_DURATION_SEC = 3600;

@Injectable()
export class TracksService {
  constructor(@Inject(TRACKS_REPOSITORY) private readonly tracks: TracksRepository) {}

  /**
   * Registers a track: idempotent for identical payloads, 409 for a
   * different payload under an already-registered audioHash (docs/API.md).
   * The canonical level is generated eagerly so a track that cannot produce
   * a valid level is rejected at registration time, not at first score.
   */
  async register(metadata: TrackMetadata): Promise<TrackMetadata> {
    const existing = await this.tracks.findByAudioHash(metadata.audioHash);
    if (existing) {
      if (isSameMetadata(existing.metadata, metadata)) {
        return existing.metadata;
      }
      throw new ConflictException(
        `track ${metadata.audioHash} is already registered with different metadata`,
      );
    }

    if (metadata.durationSec < MIN_DURATION_SEC) {
      throw new BadRequestException(
        `durationSec: must be at least ${MIN_DURATION_SEC} s to fit a playable level`,
      );
    }
    if (metadata.durationSec > MAX_TRACK_DURATION_SEC) {
      throw new BadRequestException(`durationSec: must be at most ${MAX_TRACK_DURATION_SEC} s`);
    }

    const beatMap = canonicalBeatMap(metadata);
    const level = generateLevel(beatMap);
    const playability = validatePlayability(level);
    if (!playability.ok) {
      // Generation invariant broken — a bug, not a client error.
      throw new Error(
        `generated level for ${metadata.audioHash} failed playability: ` +
          playability.issues.join('; '),
      );
    }

    await this.tracks.save({ metadata, beatMap, level });
    return metadata;
  }

  async getByAudioHash(audioHash: string): Promise<TrackMetadata> {
    const track = await this.tracks.findByAudioHash(audioHash);
    if (!track) {
      throw new NotFoundException(`track ${audioHash} is not registered`);
    }
    return track.metadata;
  }

  list(): Promise<TrackMetadata[]> {
    return this.tracks.list();
  }
}

function isSameMetadata(a: TrackMetadata, b: TrackMetadata): boolean {
  return (
    a.audioHash === b.audioHash &&
    a.title === b.title &&
    a.durationSec === b.durationSec &&
    a.bpm === b.bpm
  );
}
