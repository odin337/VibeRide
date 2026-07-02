import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryLeaderboardRepository } from './leaderboard.repository';
import type { ScoreRecord } from './leaderboard.repository';

const HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);

function record(overrides: Partial<ScoreRecord> = {}): ScoreRecord {
  return {
    playerId: 'guest:p1',
    displayName: 'Player One',
    score: 100,
    audioHash: HASH,
    achievedAt: '2026-07-01T10:00:00.000Z',
    ...overrides,
  };
}

let repository: InMemoryLeaderboardRepository;

beforeEach(() => {
  repository = new InMemoryLeaderboardRepository();
});

describe('InMemoryLeaderboardRepository.upsertBest', () => {
  it('creates the first entry at rank 1', async () => {
    await expect(repository.upsertBest(record())).resolves.toEqual({
      rank: 1,
      playerId: 'guest:p1',
      displayName: 'Player One',
      score: 100,
      audioHash: HASH,
      achievedAt: '2026-07-01T10:00:00.000Z',
    });
  });

  it('replaces the stored best only with a strictly higher score', async () => {
    await repository.upsertBest(record({ score: 100 }));
    const improved = await repository.upsertBest(
      record({ score: 150, achievedAt: '2026-07-01T11:00:00.000Z' }),
    );
    expect(improved.score).toBe(150);

    const worse = await repository.upsertBest(
      record({ score: 90, achievedAt: '2026-07-01T12:00:00.000Z' }),
    );
    expect(worse.score).toBe(150);
    expect(worse.achievedAt).toBe('2026-07-01T11:00:00.000Z');

    const equal = await repository.upsertBest(
      record({ score: 150, achievedAt: '2026-07-01T13:00:00.000Z' }),
    );
    // An equal score never displaces the earlier identical run.
    expect(equal.achievedAt).toBe('2026-07-01T11:00:00.000Z');
  });

  it('returns the submitting player rank among all entries', async () => {
    await repository.upsertBest(record({ playerId: 'guest:top', score: 500 }));
    const entry = await repository.upsertBest(record({ playerId: 'guest:low', score: 10 }));
    expect(entry.rank).toBe(2);
  });

  it('keeps boards independent per track', async () => {
    await repository.upsertBest(record({ score: 100 }));
    const other = await repository.upsertBest(record({ audioHash: OTHER_HASH, score: 5 }));
    expect(other.rank).toBe(1);
    const page = await repository.getPage(OTHER_HASH, 10);
    expect(page.total).toBe(1);
    expect(page.entries[0]!.score).toBe(5);
  });
});

describe('InMemoryLeaderboardRepository.getPage', () => {
  it('orders by score desc, then earlier achievedAt, then playerId', async () => {
    await repository.upsertBest(
      record({ playerId: 'guest:mid', score: 150, achievedAt: '2026-07-01T09:00:00.000Z' }),
    );
    await repository.upsertBest(
      record({ playerId: 'guest:top', score: 200, achievedAt: '2026-07-01T09:30:00.000Z' }),
    );
    await repository.upsertBest(
      record({ playerId: 'guest:late', score: 150, achievedAt: '2026-07-01T09:45:00.000Z' }),
    );
    await repository.upsertBest(
      record({ playerId: 'guest:tie-b', score: 100, achievedAt: '2026-07-01T09:15:00.000Z' }),
    );
    await repository.upsertBest(
      record({ playerId: 'guest:tie-a', score: 100, achievedAt: '2026-07-01T09:15:00.000Z' }),
    );

    const page = await repository.getPage(HASH, 10);
    expect(page.audioHash).toBe(HASH);
    expect(page.total).toBe(5);
    expect(page.entries.map((entry) => entry.playerId)).toEqual([
      'guest:top',
      'guest:mid',
      'guest:late',
      'guest:tie-a',
      'guest:tie-b',
    ]);
    expect(page.entries.map((entry) => entry.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it('slices to the limit while total counts every entry', async () => {
    await repository.upsertBest(record({ playerId: 'guest:one', score: 10 }));
    await repository.upsertBest(record({ playerId: 'guest:two', score: 20 }));
    await repository.upsertBest(record({ playerId: 'guest:three', score: 30 }));
    const page = await repository.getPage(HASH, 2);
    expect(page.entries).toHaveLength(2);
    expect(page.entries.map((entry) => entry.score)).toEqual([30, 20]);
    expect(page.total).toBe(3);
  });

  it('returns an empty page for a track nobody played', async () => {
    await expect(repository.getPage(HASH, 10)).resolves.toEqual({
      audioHash: HASH,
      entries: [],
      total: 0,
    });
  });
});
