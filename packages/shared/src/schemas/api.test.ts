import { describe, expect, it } from 'vitest';

import {
  guestAuthRequestSchema,
  leaderboardQuerySchema,
  scoreSubmissionSchema,
  telegramAuthRequestSchema,
  trackMetadataSchema,
} from './api';

const validHash = 'a'.repeat(64);

const validSubmission = {
  audioHash: validHash,
  seed: 12345,
  score: 4200,
  distanceM: 512.5,
  finished: true,
  durationMs: 95_000,
  collectiblesTaken: 17,
  checkpoints: [{ tick: 120, x: 16, y: 2.5, score: 100 }],
};

describe('scoreSubmissionSchema', () => {
  it('accepts a valid submission', () => {
    expect(scoreSubmissionSchema.parse(validSubmission)).toEqual(validSubmission);
  });

  it('rejects an invalid audio hash', () => {
    expect(
      scoreSubmissionSchema.safeParse({ ...validSubmission, audioHash: 'not-a-hash' }).success,
    ).toBe(false);
  });

  it('rejects negative scores', () => {
    expect(scoreSubmissionSchema.safeParse({ ...validSubmission, score: -1 }).success).toBe(false);
  });

  it('rejects non-finite coordinates in checkpoints', () => {
    const bad = {
      ...validSubmission,
      checkpoints: [{ tick: 1, x: Number.POSITIVE_INFINITY, y: 0, score: 0 }],
    };
    expect(scoreSubmissionSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects empty and oversized checkpoint arrays', () => {
    expect(scoreSubmissionSchema.safeParse({ ...validSubmission, checkpoints: [] }).success).toBe(
      false,
    );
    const oversized = {
      ...validSubmission,
      checkpoints: Array.from({ length: 601 }, (_, i) => ({ tick: i, x: 0, y: 0, score: 0 })),
    };
    expect(scoreSubmissionSchema.safeParse(oversized).success).toBe(false);
  });
});

describe('telegramAuthRequestSchema', () => {
  it('accepts a non-empty initData string', () => {
    expect(telegramAuthRequestSchema.parse({ initData: 'query_id=1&user=...' })).toBeTruthy();
  });

  it('rejects empty and oversized initData', () => {
    expect(telegramAuthRequestSchema.safeParse({ initData: '' }).success).toBe(false);
    expect(telegramAuthRequestSchema.safeParse({ initData: 'x'.repeat(8193) }).success).toBe(false);
  });
});

describe('guestAuthRequestSchema', () => {
  it('requires a UUID device id', () => {
    expect(
      guestAuthRequestSchema.safeParse({
        deviceId: '123e4567-e89b-42d3-a456-426614174000',
        displayName: 'Rider',
      }).success,
    ).toBe(true);
    expect(
      guestAuthRequestSchema.safeParse({ deviceId: 'nope', displayName: 'Rider' }).success,
    ).toBe(false);
  });
});

describe('trackMetadataSchema', () => {
  it('bounds bpm to a sane range', () => {
    const base = { audioHash: validHash, title: 'Song', durationSec: 180 };
    expect(trackMetadataSchema.safeParse({ ...base, bpm: 128 }).success).toBe(true);
    expect(trackMetadataSchema.safeParse({ ...base, bpm: 10 }).success).toBe(false);
    expect(trackMetadataSchema.safeParse({ ...base, bpm: 999 }).success).toBe(false);
  });
});

describe('leaderboardQuerySchema', () => {
  it('coerces and defaults the limit', () => {
    expect(leaderboardQuerySchema.parse({ audioHash: validHash, limit: '50' }).limit).toBe(50);
    expect(leaderboardQuerySchema.parse({ audioHash: validHash }).limit).toBe(20);
  });

  it('rejects out-of-range limits', () => {
    expect(leaderboardQuerySchema.safeParse({ audioHash: validHash, limit: 1000 }).success).toBe(
      false,
    );
  });
});
