import { describe, expect, it } from 'vitest';

import { generateDemoBeatMap } from '../app/demo-beatmap';
import { createApiClient } from './client';

const HASH = 'a'.repeat(64);

const AUTH_BODY = {
  token: 'jwt-token',
  player: { id: 'guest:123', displayName: 'Rider', kind: 'guest' },
};

const ENTRY = {
  rank: 1,
  playerId: 'guest:123',
  displayName: 'Rider',
  score: 1200,
  audioHash: HASH,
  achievedAt: '2026-07-02T14:31:07.000Z',
};

interface Captured {
  url: string;
  init: RequestInit | undefined;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeFetch(
  responder: (url: string, init: RequestInit | undefined) => Response | Promise<Response>,
): { fetchImpl: typeof fetch; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return Promise.resolve(responder(url, init));
  };
  return { fetchImpl, calls };
}

const GUEST_REQUEST = {
  deviceId: '3f6f2f04-8c2d-4d5e-9b1a-7c0a4a1b2c3d',
  displayName: 'Rider',
};

describe('createApiClient', () => {
  it('authenticates a guest and remembers the token', async () => {
    const { fetchImpl, calls } = makeFetch(() => jsonResponse(AUTH_BODY, 201));
    const client = createApiClient({ baseUrl: 'http://api.test', fetchImpl });

    const result = await client.authGuest(GUEST_REQUEST);
    expect(result).toEqual({ ok: true, value: AUTH_BODY });
    expect(client.getToken()).toBe('jwt-token');
    expect(calls[0]?.url).toBe('http://api.test/api/auth/guest');
    expect(calls[0]?.init?.method).toBe('POST');
    const sentBody: unknown = JSON.parse(calls[0]?.init?.body as string);
    expect(sentBody).toEqual(GUEST_REQUEST);
  });

  it('sends the bearer token on requests after auth', async () => {
    const { fetchImpl, calls } = makeFetch((url) =>
      url.includes('/auth/')
        ? jsonResponse(AUTH_BODY, 201)
        : jsonResponse({ audioHash: HASH, entries: [], total: 0 }),
    );
    const client = createApiClient({ baseUrl: 'http://api.test', fetchImpl });
    await client.authTelegram({ initData: 'query_id=1&hash=abc' });
    await client.getLeaderboard(HASH, 10);

    const headers = calls[1]?.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer jwt-token');
    expect(calls[1]?.url).toBe(`http://api.test/api/leaderboard?audioHash=${HASH}&limit=10`);
  });

  it('maps a 401 to an http error with status', async () => {
    const { fetchImpl } = makeFetch(() =>
      jsonResponse({ statusCode: 401, message: 'invalid token', error: 'Unauthorized' }, 401),
    );
    const client = createApiClient({ baseUrl: 'http://api.test', fetchImpl });

    const result = await client.submitScore({
      audioHash: HASH,
      seed: 1,
      score: 10,
      distanceM: 5,
      finished: false,
      durationMs: 1000,
      collectiblesTaken: 0,
      checkpoints: [{ tick: 0, x: 0, y: 0, score: 0 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('http');
      expect(result.error.status).toBe(401);
      expect(result.error.message).toBe('invalid token');
    }
  });

  it('joins array messages from the NestJS validation envelope', async () => {
    const { fetchImpl } = makeFetch(() =>
      jsonResponse({ statusCode: 400, message: ['a: bad', 'b: worse'], error: 'Bad Request' }, 400),
    );
    const client = createApiClient({ fetchImpl });
    const result = await client.getLeaderboard(HASH);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('a: bad; b: worse');
    }
  });

  it('rejects a schema-invalid success response as a validation error', async () => {
    const { fetchImpl } = makeFetch(() =>
      jsonResponse({ token: 42, player: { id: '', displayName: 1, kind: 'alien' } }, 201),
    );
    const client = createApiClient({ fetchImpl });
    const result = await client.authGuest(GUEST_REQUEST);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('validation');
      expect(result.error.message).toContain('token');
    }
    expect(client.getToken()).toBeNull();
  });

  it('returns a network error when fetch rejects', async () => {
    const fetchImpl: typeof fetch = () => Promise.reject(new Error('offline'));
    const client = createApiClient({ fetchImpl });
    const result = await client.getLeaderboard(HASH);
    expect(result).toEqual({
      ok: false,
      error: { kind: 'network', message: 'offline' },
    });
  });

  it('validates leaderboard pages', async () => {
    const page = { audioHash: HASH, entries: [ENTRY], total: 57 };
    const { fetchImpl } = makeFetch(() => jsonResponse(page));
    const client = createApiClient({ fetchImpl });
    const result = await client.getLeaderboard(HASH);
    expect(result).toEqual({ ok: true, value: page });
  });

  it('registers a track with its serialized beat map', async () => {
    const beatMap = generateDemoBeatMap();
    const metadata = {
      audioHash: beatMap.audioHash,
      title: 'Demo',
      durationSec: beatMap.durationSec,
      bpm: beatMap.bpm,
    };
    const { fetchImpl, calls } = makeFetch(() => jsonResponse(metadata, 201));
    const client = createApiClient({ baseUrl: 'http://api.test/', fetchImpl });

    const result = await client.registerTrack({ metadata, beatMap });
    expect(result).toEqual({ ok: true, value: metadata });
    // Trailing slash on baseUrl must not produce a double slash.
    expect(calls[0]?.url).toBe('http://api.test/api/tracks');
    const sent = JSON.parse(calls[0]?.init?.body as string) as Record<string, unknown>;
    expect(sent.audioHash).toBe(beatMap.audioHash);
    expect(typeof sent.beatMap).toBe('string');
  });

  it('submits a score and returns the accepted entry', async () => {
    const { fetchImpl } = makeFetch(() => jsonResponse(ENTRY, 201));
    const client = createApiClient({ fetchImpl });
    const result = await client.submitScore({
      audioHash: HASH,
      seed: 7,
      score: 1200,
      distanceM: 160,
      finished: true,
      durationMs: 20000,
      collectiblesTaken: 3,
      checkpoints: [{ tick: 0, x: 0, y: 0, score: 0 }],
    });
    expect(result).toEqual({ ok: true, value: ENTRY });
  });

  it('tolerates non-JSON error bodies', async () => {
    const { fetchImpl } = makeFetch(() => new Response('boom', { status: 500 }));
    const client = createApiClient({ fetchImpl });
    const result = await client.getLeaderboard(HASH);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ kind: 'http', status: 500, message: 'HTTP 500' });
    }
  });
});
