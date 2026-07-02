import { DEFAULT_FLAGS } from '@viberide/shared';
import type { FeatureFlags, PlatformAdapter, RunResult, SaveStorage } from '@viberide/shared';
import { describe, expect, it, vi } from 'vitest';

import { generateDemoBeatMap } from '../app/demo-beatmap';
import type { ApiClient } from './client';
import { DEVICE_ID_KEY } from './session';
import { submitRunResult, toScoreSubmission } from './submit-flow';

const UUID = '3f6f2f04-8c2d-4d5e-9b1a-7c0a4a1b2c3d';
const beatMap = generateDemoBeatMap();

const RUN: RunResult = {
  audioHash: beatMap.audioHash,
  seed: 42,
  score: 1035,
  distanceM: 160,
  finished: true,
  durationMs: 20000,
  collectiblesTaken: 2,
  checkpoints: [
    { tick: 0, x: 0, y: 0, score: 0 },
    { tick: 120, x: 16, y: 0, score: 10 },
  ],
};

const TRACK = { title: 'Demo', beatMap };

const ENTRY = {
  rank: 2,
  playerId: 'guest:1',
  displayName: 'Rider',
  score: 1035,
  audioHash: beatMap.audioHash,
  achievedAt: '2026-07-02T15:00:00.000Z',
};

const PAGE = { audioHash: beatMap.audioHash, entries: [ENTRY], total: 3 };

const FLAGS: FeatureFlags = { ...DEFAULT_FLAGS, leaderboardEnabled: true };

function storage(): SaveStorage {
  const data = new Map<string, string>([[DEVICE_ID_KEY, UUID]]);
  return {
    get: (key) => Promise.resolve(data.get(key) ?? null),
    set: (key, value) => {
      data.set(key, value);
      return Promise.resolve();
    },
    remove: (key) => {
      data.delete(key);
      return Promise.resolve();
    },
  };
}

const platform: PlatformAdapter = {
  kind: 'web',
  storage: storage(),
  getAuthPayload: () => Promise.resolve(null),
};

function makeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    authGuest: vi.fn().mockResolvedValue({
      ok: true,
      value: { token: 't', player: { id: 'guest:1', displayName: 'Rider', kind: 'guest' } },
    }),
    authTelegram: vi.fn(),
    registerTrack: vi.fn().mockResolvedValue({ ok: true, value: {} }),
    submitScore: vi.fn().mockResolvedValue({ ok: true, value: ENTRY }),
    getLeaderboard: vi.fn().mockResolvedValue({ ok: true, value: PAGE }),
    getToken: () => null,
    ...overrides,
  };
}

describe('toScoreSubmission', () => {
  it('carries every RunResult field over unchanged', () => {
    expect(toScoreSubmission(RUN)).toEqual({ ...RUN, checkpoints: [...RUN.checkpoints] });
  });
});

describe('submitRunResult', () => {
  it('skips entirely when the leaderboard flag is off', async () => {
    const client = makeClient();
    const outcome = await submitRunResult(
      { client, platform, flags: { ...FLAGS, leaderboardEnabled: false } },
      RUN,
      TRACK,
    );
    expect(outcome.status).toBe('skipped');
    expect(client.authGuest).not.toHaveBeenCalled();
    expect(client.submitScore).not.toHaveBeenCalled();
  });

  it('authenticates, registers the track, submits and fetches the board', async () => {
    const client = makeClient();
    const outcome = await submitRunResult({ client, platform, flags: FLAGS }, RUN, TRACK);

    expect(outcome).toEqual({ status: 'submitted', entry: ENTRY, page: PAGE });
    expect(client.registerTrack).toHaveBeenCalledWith({
      metadata: {
        audioHash: beatMap.audioHash,
        title: 'Demo',
        durationSec: beatMap.durationSec,
        bpm: beatMap.bpm,
      },
      beatMap,
    });
    expect(client.submitScore).toHaveBeenCalledWith(toScoreSubmission(RUN));
    expect(client.getLeaderboard).toHaveBeenCalledWith(beatMap.audioHash);
  });

  it('fails soft when authentication fails', async () => {
    const client = makeClient({
      authGuest: vi.fn().mockResolvedValue({
        ok: false,
        error: { kind: 'network', message: 'offline' },
      }),
    });
    const outcome = await submitRunResult({ client, platform, flags: FLAGS }, RUN, TRACK);
    expect(outcome.status).toBe('failed');
    expect(outcome.message).toContain('offline');
    expect(client.submitScore).not.toHaveBeenCalled();
  });

  it('continues past a 409 registration conflict', async () => {
    const client = makeClient({
      registerTrack: vi.fn().mockResolvedValue({
        ok: false,
        error: { kind: 'http', status: 409, message: 'conflict' },
      }),
    });
    const outcome = await submitRunResult({ client, platform, flags: FLAGS }, RUN, TRACK);
    expect(outcome.status).toBe('submitted');
    expect(client.submitScore).toHaveBeenCalled();
  });

  it('reports a rejected score but still returns the leaderboard page', async () => {
    const client = makeClient({
      submitScore: vi.fn().mockResolvedValue({
        ok: false,
        error: { kind: 'http', status: 422, message: 'anti-cheat rejection' },
      }),
    });
    const outcome = await submitRunResult({ client, platform, flags: FLAGS }, RUN, TRACK);
    expect(outcome.status).toBe('failed');
    expect(outcome.message).toContain('anti-cheat rejection');
    expect(outcome.page).toEqual(PAGE);
  });

  it('omits the page when the leaderboard fetch also fails', async () => {
    const client = makeClient({
      getLeaderboard: vi.fn().mockResolvedValue({
        ok: false,
        error: { kind: 'network', message: 'offline' },
      }),
    });
    const outcome = await submitRunResult({ client, platform, flags: FLAGS }, RUN, TRACK);
    expect(outcome.status).toBe('submitted');
    expect(outcome.page).toBeUndefined();
  });
});
