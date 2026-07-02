import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { TrackMetadata } from '@viberide/shared';
import {
  ALT_AUDIO_HASH,
  FIXTURE_AUDIO_HASH,
  generateLevel,
  MIN_DURATION_SEC,
} from '@viberide/track-generator';
import { beforeEach, describe, expect, it } from 'vitest';

import { canonicalBeatMap } from './canonical-beat-map';
import { InMemoryTracksRepository } from './tracks.repository';
import { MAX_TRACK_DURATION_SEC, TracksService } from './tracks.service';

const METADATA: TrackMetadata = {
  audioHash: FIXTURE_AUDIO_HASH,
  title: 'Fixture Song',
  durationSec: 30,
  bpm: 120,
};

let repository: InMemoryTracksRepository;
let service: TracksService;

beforeEach(() => {
  repository = new InMemoryTracksRepository();
  service = new TracksService(repository);
});

describe('TracksService.register', () => {
  it('stores the canonical beat map and its regenerated level', async () => {
    await expect(service.register(METADATA)).resolves.toEqual(METADATA);
    const stored = await repository.findByAudioHash(METADATA.audioHash);
    expect(stored).toBeDefined();
    expect(stored!.metadata).toEqual(METADATA);
    const expectedBeatMap = canonicalBeatMap(METADATA);
    expect(stored!.beatMap).toEqual(expectedBeatMap);
    expect(stored!.level).toEqual(generateLevel(expectedBeatMap));
  });

  it('is idempotent for byte-identical metadata', async () => {
    await service.register(METADATA);
    await expect(service.register({ ...METADATA })).resolves.toEqual(METADATA);
    await expect(service.list()).resolves.toHaveLength(1);
  });

  it('rejects re-registration under the same hash with different metadata', async () => {
    await service.register(METADATA);
    await expect(service.register({ ...METADATA, title: 'Renamed' })).rejects.toThrow(
      ConflictException,
    );
    await expect(service.register({ ...METADATA, bpm: 90 })).rejects.toThrow(
      /already registered with different metadata/,
    );
  });

  it('rejects tracks too short to fit a playable level', async () => {
    const tooShort = { ...METADATA, durationSec: MIN_DURATION_SEC - 1 };
    await expect(service.register(tooShort)).rejects.toThrow(BadRequestException);
    await expect(service.register(tooShort)).rejects.toThrow(/at least/);
  });

  it('rejects tracks beyond the level-size safety bound', async () => {
    const tooLong = { ...METADATA, durationSec: MAX_TRACK_DURATION_SEC + 1 };
    await expect(service.register(tooLong)).rejects.toThrow(BadRequestException);
    await expect(service.register(tooLong)).rejects.toThrow(/at most/);
  });
});

describe('TracksService.getByAudioHash', () => {
  it('returns the registered metadata', async () => {
    await service.register(METADATA);
    await expect(service.getByAudioHash(METADATA.audioHash)).resolves.toEqual(METADATA);
  });

  it('responds 404 for unregistered hashes', async () => {
    await expect(service.getByAudioHash(ALT_AUDIO_HASH)).rejects.toThrow(NotFoundException);
    await expect(service.getByAudioHash(ALT_AUDIO_HASH)).rejects.toThrow(/not registered/);
  });
});

describe('TracksService.list', () => {
  it('lists the metadata of every registered track', async () => {
    await expect(service.list()).resolves.toEqual([]);
    await service.register(METADATA);
    const second: TrackMetadata = {
      audioHash: ALT_AUDIO_HASH,
      title: 'Second Song',
      durationSec: 45,
      bpm: 100,
    };
    await service.register(second);
    await expect(service.list()).resolves.toEqual([METADATA, second]);
  });
});
