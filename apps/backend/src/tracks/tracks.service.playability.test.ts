import type { TrackMetadata } from '@viberide/shared';
import { FIXTURE_AUDIO_HASH } from '@viberide/track-generator';
import type * as trackGenerator from '@viberide/track-generator';
import { describe, expect, it, vi } from 'vitest';

import { InMemoryTracksRepository } from './tracks.repository';
import { TracksService } from './tracks.service';

// The playability guard in TracksService.register is unreachable by
// construction — generateLevel is deterministic and always playable for
// canonical beat maps — so the only way to exercise the "generation
// invariant broken" branch is to stub the validator itself.
vi.mock('@viberide/track-generator', async (importOriginal) => {
  const actual = await importOriginal<typeof trackGenerator>();
  return {
    ...actual,
    validatePlayability: () => ({ ok: false, issues: ['forced failure for tests'] }),
  };
});

describe('TracksService.register — generation invariant', () => {
  it('surfaces an unplayable generated level as a server bug, not a client error', async () => {
    const repository = new InMemoryTracksRepository();
    const service = new TracksService(repository);
    const metadata: TrackMetadata = {
      audioHash: FIXTURE_AUDIO_HASH,
      title: 'Broken Generator',
      durationSec: 30,
      bpm: 120,
    };
    await expect(service.register(metadata)).rejects.toThrow(/failed playability/);
    await expect(service.register(metadata)).rejects.toThrow(/forced failure for tests/);
    // Nothing may be persisted for a track that failed generation.
    await expect(repository.list()).resolves.toEqual([]);
  });
});
