import { Injectable } from '@nestjs/common';
import type { BeatMap, LevelDefinition, TrackMetadata } from '@viberide/shared';

/**
 * Everything the backend keeps per registered track: the public metadata,
 * the canonical BeatMap it was derived into and the regenerated level the
 * anti-cheat validator checks submissions against.
 */
export interface StoredTrack {
  readonly metadata: TrackMetadata;
  readonly beatMap: BeatMap;
  readonly level: LevelDefinition;
}

/** Persistence boundary — injected via the TRACKS_REPOSITORY token. */
export interface TracksRepository {
  save(track: StoredTrack): Promise<void>;
  findByAudioHash(audioHash: string): Promise<StoredTrack | undefined>;
  list(): Promise<TrackMetadata[]>;
}

/**
 * Process-local store, sufficient for a single-instance deployment.
 * TODO(manual): replace with a Postgres-backed implementation before
 * scaling beyond one replica — data is lost on restart.
 */
@Injectable()
export class InMemoryTracksRepository implements TracksRepository {
  private readonly tracks = new Map<string, StoredTrack>();

  save(track: StoredTrack): Promise<void> {
    this.tracks.set(track.metadata.audioHash, track);
    return Promise.resolve();
  }

  findByAudioHash(audioHash: string): Promise<StoredTrack | undefined> {
    return Promise.resolve(this.tracks.get(audioHash));
  }

  list(): Promise<TrackMetadata[]> {
    return Promise.resolve([...this.tracks.values()].map((track) => track.metadata));
  }
}
