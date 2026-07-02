import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { CHECKPOINT_INTERVAL_TICKS, FINISH_SCORE } from '@viberide/shared';
import type { LeaderboardEntry, LeaderboardPage, TrackMetadata } from '@viberide/shared';
import { ALT_AUDIO_HASH, FIXTURE_AUDIO_HASH, generateLevel } from '@viberide/track-generator';
import type { FastifyInstance } from 'fastify';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import type { AuthResult } from './auth/auth.service';
import { HEALTH_SERVICE } from './common/tokens';
import { loadEnv } from './config/env';
import type { HealthService } from './health/health.service';
import { buildRun } from './testing/runs';
import { buildInitData } from './testing/telegram';
import { canonicalBeatMap } from './tracks/canonical-beat-map';

/**
 * End-to-end spec over the real HTTP surface: the full AppModule graph on a
 * Fastify adapter driven through app.inject() (light-my-request), with the
 * transport wiring from configureApp — exactly what main.ts boots minus
 * listen(). Auth and scores carry a 10 req/60 s per-client throttle, so
 * each logical group injects from its own remoteAddress.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BOT_TOKEN = '7000000001:AAIntegrationBotTokenFixture1234567890';
const DEVICE_ONE = '11111111-1111-4111-8111-111111111111';
const DEVICE_TWO = '22222222-2222-4222-8222-222222222222';

const TRACK: TrackMetadata = {
  audioHash: FIXTURE_AUDIO_HASH,
  title: 'Integration Anthem',
  durationSec: 60,
  bpm: 120,
};

// The exact level the backend regenerates for anti-cheat: derived from the
// canonical (metadata-only) beat map, not from a client-side analysis.
const serverLevel = generateLevel(canonicalBeatMap(TRACK));

interface ErrorEnvelope {
  readonly statusCode: number;
  readonly error: string;
  readonly message: string | string[];
}

async function createApp(
  envOverrides: Readonly<Record<string, string>> = {},
): Promise<NestFastifyApplication> {
  const env = loadEnv({ NODE_ENV: 'test', ...envOverrides });
  const logger = pino({ level: 'silent' });
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(env, logger)],
  }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ logger: false }),
    { logger: false },
  );
  await configureApp(app);
  await app.init();
  const instance: FastifyInstance = app.getHttpAdapter().getInstance();
  await instance.ready();
  return app;
}

async function guestToken(
  app: NestFastifyApplication,
  deviceId: string,
  displayName: string,
  remoteAddress: string,
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/guest',
    payload: { deviceId, displayName },
    remoteAddress,
  });
  expect(response.statusCode).toBe(201);
  return response.json<AuthResult>().token;
}

describe('backend HTTP surface (integration)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('transport wiring (helmet, CORS, request ids)', () => {
    it('serves JSON with a locked-down CSP and echoes a request id', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        remoteAddress: '10.0.0.2',
      });
      expect(response.statusCode).toBe(200);
      expect(response.json<{ status: string }>()).toEqual({ status: 'ok' });
      expect(response.headers['content-security-policy']).toContain("default-src 'none'");
      expect(String(response.headers['x-request-id'])).toMatch(UUID_PATTERN);
    });

    it('allows the configured browser origins via CORS', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { origin: 'http://localhost:5173' },
        remoteAddress: '10.0.0.2',
      });
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });
  });

  describe('POST /api/auth', () => {
    it('issues a guest session bound to the device id', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/guest',
        payload: { deviceId: DEVICE_ONE, displayName: 'Rider One' },
        remoteAddress: '10.0.0.10',
      });
      expect(response.statusCode).toBe(201);
      const result = response.json<AuthResult>();
      expect(result.player).toEqual({
        id: `guest:${DEVICE_ONE}`,
        displayName: 'Rider One',
        kind: 'guest',
      });
      expect(result.token.split('.')).toHaveLength(3);
    });

    it('rejects an invalid guest body with the documented 400 envelope', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/guest',
        payload: { displayName: '' },
        remoteAddress: '10.0.0.11',
      });
      expect(response.statusCode).toBe(400);
      const envelope = response.json<ErrorEnvelope>();
      expect(envelope.statusCode).toBe(400);
      expect(envelope.error).toBe('Bad Request');
      expect(Array.isArray(envelope.message)).toBe(true);
      expect(envelope.message).toContain('deviceId: Required');
      expect(String(response.headers['x-request-id'])).toMatch(UUID_PATTERN);
    });

    it('responds 503 to Telegram auth while no bot token is configured', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/telegram',
        payload: { initData: 'auth_date=1&hash=abc' },
        remoteAddress: '10.0.0.12',
      });
      expect(response.statusCode).toBe(503);
      const envelope = response.json<ErrorEnvelope>();
      expect(envelope.error).toBe('Service Unavailable');
      expect(envelope.message).toMatch(/TELEGRAM_BOT_TOKEN is not configured/);
    });
  });

  describe('/api/tracks', () => {
    let token: string;

    beforeAll(async () => {
      token = await guestToken(app, DEVICE_ONE, 'Rider One', '10.0.0.20');
    });

    it('requires a Bearer token to register', async () => {
      const bare = await app.inject({
        method: 'POST',
        url: '/api/tracks',
        payload: TRACK,
        remoteAddress: '10.0.0.20',
      });
      expect(bare.statusCode).toBe(401);
      expect(bare.json<ErrorEnvelope>().message).toBe('missing Bearer token');

      const garbage = await app.inject({
        method: 'POST',
        url: '/api/tracks',
        payload: TRACK,
        headers: { authorization: 'Bearer not.a.token' },
        remoteAddress: '10.0.0.20',
      });
      expect(garbage.statusCode).toBe(401);
      expect(garbage.json<ErrorEnvelope>().message).toBe('invalid or expired token');
    });

    it('registers a track and is idempotent for identical metadata', async () => {
      const first = await app.inject({
        method: 'POST',
        url: '/api/tracks',
        payload: TRACK,
        headers: { authorization: `Bearer ${token}` },
        remoteAddress: '10.0.0.20',
      });
      expect(first.statusCode).toBe(201);
      expect(first.json<TrackMetadata>()).toEqual(TRACK);

      const again = await app.inject({
        method: 'POST',
        url: '/api/tracks',
        payload: TRACK,
        headers: { authorization: `Bearer ${token}` },
        remoteAddress: '10.0.0.20',
      });
      expect(again.statusCode).toBe(201);
      expect(again.json<TrackMetadata>()).toEqual(TRACK);
    });

    it('responds 409 when the same hash arrives with different metadata', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tracks',
        payload: { ...TRACK, title: 'Renamed Anthem' },
        headers: { authorization: `Bearer ${token}` },
        remoteAddress: '10.0.0.20',
      });
      expect(response.statusCode).toBe(409);
      expect(response.json<ErrorEnvelope>().error).toBe('Conflict');
    });

    it('rejects a track too short to fit a playable level', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tracks',
        payload: { ...TRACK, audioHash: ALT_AUDIO_HASH, durationSec: 2 },
        headers: { authorization: `Bearer ${token}` },
        remoteAddress: '10.0.0.20',
      });
      expect(response.statusCode).toBe(400);
      expect(response.json<ErrorEnvelope>().message).toMatch(/at least/);
    });

    it('lists and fetches registered tracks publicly', async () => {
      const list = await app.inject({
        method: 'GET',
        url: '/api/tracks',
        remoteAddress: '10.0.0.21',
      });
      expect(list.statusCode).toBe(200);
      expect(list.json<TrackMetadata[]>()).toEqual([TRACK]);

      const single = await app.inject({
        method: 'GET',
        url: `/api/tracks/${TRACK.audioHash}`,
        remoteAddress: '10.0.0.21',
      });
      expect(single.statusCode).toBe(200);
      expect(single.json<TrackMetadata>()).toEqual(TRACK);
    });

    it('responds 404 for an unregistered hash and 400 for a malformed one', async () => {
      const missing = await app.inject({
        method: 'GET',
        url: `/api/tracks/${ALT_AUDIO_HASH}`,
        remoteAddress: '10.0.0.21',
      });
      expect(missing.statusCode).toBe(404);
      expect(missing.json<ErrorEnvelope>().message).toMatch(/not registered/);

      const malformed = await app.inject({
        method: 'GET',
        url: '/api/tracks/not-a-hash',
        remoteAddress: '10.0.0.21',
      });
      expect(malformed.statusCode).toBe(400);
      expect(malformed.json<ErrorEnvelope>().message).toEqual([
        'must be a lowercase sha-256 hex digest',
      ]);
    });
  });

  describe('POST /api/scores and GET /api/leaderboard', () => {
    let tokenOne: string;
    let tokenTwo: string;

    beforeAll(async () => {
      tokenOne = await guestToken(app, DEVICE_ONE, 'Rider One', '10.0.0.30');
      tokenTwo = await guestToken(app, DEVICE_TWO, 'Rider Two', '10.0.0.30');
      // Idempotent (the tracks suite may have registered it already).
      const registered = await app.inject({
        method: 'POST',
        url: '/api/tracks',
        payload: TRACK,
        headers: { authorization: `Bearer ${tokenOne}` },
        remoteAddress: '10.0.0.30',
      });
      expect(registered.statusCode).toBe(201);
    });

    it('accepts a legitimate finished run and ranks it first', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/scores',
        payload: buildRun(serverLevel),
        headers: { authorization: `Bearer ${tokenOne}` },
        remoteAddress: '10.0.0.31',
      });
      expect(response.statusCode).toBe(201);
      const entry = response.json<LeaderboardEntry>();
      expect(entry.rank).toBe(1);
      expect(entry.playerId).toBe(`guest:${DEVICE_ONE}`);
      expect(entry.displayName).toBe('Rider One');
      expect(entry.score).toBe(FINISH_SCORE);
      expect(entry.audioHash).toBe(TRACK.audioHash);
    });

    it('requires authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/scores',
        payload: buildRun(serverLevel),
        remoteAddress: '10.0.0.31',
      });
      expect(response.statusCode).toBe(401);
    });

    it('rejects a schema-violating submission with 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/scores',
        payload: { audioHash: TRACK.audioHash },
        headers: { authorization: `Bearer ${tokenOne}` },
        remoteAddress: '10.0.0.31',
      });
      expect(response.statusCode).toBe(400);
      expect(Array.isArray(response.json<ErrorEnvelope>().message)).toBe(true);
    });

    it('rejects an anti-cheat-violating run with 422 naming the check', async () => {
      const run = buildRun(serverLevel);
      const response = await app.inject({
        method: 'POST',
        url: '/api/scores',
        payload: { ...run, seed: run.seed + 1 },
        headers: { authorization: `Bearer ${tokenOne}` },
        remoteAddress: '10.0.0.31',
      });
      expect(response.statusCode).toBe(422);
      const envelope = response.json<ErrorEnvelope>();
      expect(envelope.error).toBe('Unprocessable Entity');
      expect(envelope.message).toMatch(/seed .* does not match seedFromHash/);
    });

    it('responds 404 for a run on a track that was never registered', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/scores',
        payload: { ...buildRun(serverLevel), audioHash: ALT_AUDIO_HASH },
        headers: { authorization: `Bearer ${tokenOne}` },
        remoteAddress: '10.0.0.31',
      });
      expect(response.statusCode).toBe(404);
      expect(response.json<ErrorEnvelope>().message).toMatch(/never registered/);
    });

    it('ranks a weaker second player below and keeps the stored best on a worse retry', async () => {
      const partial = buildRun(serverLevel, {
        endTick: CHECKPOINT_INTERVAL_TICKS * 20,
        finished: false,
      });
      const second = await app.inject({
        method: 'POST',
        url: '/api/scores',
        payload: partial,
        headers: { authorization: `Bearer ${tokenTwo}` },
        remoteAddress: '10.0.0.31',
      });
      expect(second.statusCode).toBe(201);
      expect(second.json<LeaderboardEntry>().rank).toBe(2);

      const worseRetry = await app.inject({
        method: 'POST',
        url: '/api/scores',
        payload: partial,
        headers: { authorization: `Bearer ${tokenOne}` },
        remoteAddress: '10.0.0.31',
      });
      expect(worseRetry.statusCode).toBe(201);
      const kept = worseRetry.json<LeaderboardEntry>();
      expect(kept.score).toBe(FINISH_SCORE);
      expect(kept.rank).toBe(1);
    });

    it('pages the leaderboard with ranks, limit and total', async () => {
      const page = await app.inject({
        method: 'GET',
        url: `/api/leaderboard?audioHash=${TRACK.audioHash}`,
        remoteAddress: '10.0.0.32',
      });
      expect(page.statusCode).toBe(200);
      const body = page.json<LeaderboardPage>();
      expect(body.audioHash).toBe(TRACK.audioHash);
      expect(body.total).toBe(2);
      expect(body.entries.map((entry) => entry.playerId)).toEqual([
        `guest:${DEVICE_ONE}`,
        `guest:${DEVICE_TWO}`,
      ]);
      expect(body.entries.map((entry) => entry.rank)).toEqual([1, 2]);

      const limited = await app.inject({
        method: 'GET',
        url: `/api/leaderboard?audioHash=${TRACK.audioHash}&limit=1`,
        remoteAddress: '10.0.0.32',
      });
      expect(limited.json<LeaderboardPage>().entries).toHaveLength(1);
      expect(limited.json<LeaderboardPage>().total).toBe(2);
    });

    it('serves an empty page for a track nobody played', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/leaderboard?audioHash=${ALT_AUDIO_HASH}`,
        remoteAddress: '10.0.0.32',
      });
      expect(response.statusCode).toBe(200);
      expect(response.json<LeaderboardPage>()).toEqual({
        audioHash: ALT_AUDIO_HASH,
        entries: [],
        total: 0,
      });
    });

    it('rejects a malformed leaderboard query with 400', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/leaderboard?audioHash=zzz',
        remoteAddress: '10.0.0.32',
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('operational endpoints', () => {
    it('reports readiness while the app is running', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/ready',
        remoteAddress: '10.0.0.40',
      });
      expect(response.statusCode).toBe(200);
      expect(response.json<{ status: string }>()).toEqual({ status: 'ok' });
    });

    it('exposes Prometheus text with the HTTP request counters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
        remoteAddress: '10.0.0.40',
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/plain; version=0.0.4; charset=utf-8');
      expect(response.body).toContain('# HELP http_requests_total Total HTTP requests');
      expect(response.body).toMatch(
        /http_requests_total\{method="GET",path="\/health",status="200"\} \d+/,
      );
      expect(response.body).toContain('http_request_duration_seconds_bucket');
    });

    it('flips the readiness probe to 503 once shutdown begins', async () => {
      app.get<HealthService>(HEALTH_SERVICE).onApplicationShutdown();
      const response = await app.inject({
        method: 'GET',
        url: '/health/ready',
        remoteAddress: '10.0.0.40',
      });
      expect(response.statusCode).toBe(503);
      expect(response.json<{ status: string }>()).toEqual({ status: 'error' });
    });
  });

  describe('throttling', () => {
    it('rate-limits auth to 10 requests per minute per client', async () => {
      for (let i = 0; i < 10; i += 1) {
        const allowed = await app.inject({
          method: 'POST',
          url: '/api/auth/guest',
          payload: { deviceId: DEVICE_ONE, displayName: 'Hammering' },
          remoteAddress: '10.0.9.9',
        });
        expect(allowed.statusCode).toBe(201);
      }
      const blocked = await app.inject({
        method: 'POST',
        url: '/api/auth/guest',
        payload: { deviceId: DEVICE_ONE, displayName: 'Hammering' },
        remoteAddress: '10.0.9.9',
      });
      expect(blocked.statusCode).toBe(429);
      const envelope = blocked.json<ErrorEnvelope>();
      expect(envelope.statusCode).toBe(429);
      expect(envelope.error).toBe('Too Many Requests');
    });
  });
});

describe('backend HTTP surface with Telegram configured and the leaderboard disabled', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp({ TELEGRAM_BOT_TOKEN: BOT_TOKEN, FEATURE_LEADERBOARD: 'off' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('exchanges correctly signed Telegram initData for a session', async () => {
    const initData = buildInitData(BOT_TOKEN, {
      authDate: Math.floor(Date.now() / 1000),
      user: { id: 777, first_name: 'Dana' },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/telegram',
      payload: { initData },
      remoteAddress: '10.1.0.1',
    });
    expect(response.statusCode).toBe(201);
    const result = response.json<AuthResult>();
    expect(result.player).toEqual({ id: 'tg:777', displayName: 'Dana', kind: 'telegram' });
    expect(result.token.split('.')).toHaveLength(3);
  });

  it('rejects initData signed by a different bot with 401', async () => {
    const initData = buildInitData('8000000002:SomeOtherBotTokenEntirely00000000', {
      authDate: Math.floor(Date.now() / 1000),
      user: { id: 777, first_name: 'Dana' },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/telegram',
      payload: { initData },
      remoteAddress: '10.1.0.1',
    });
    expect(response.statusCode).toBe(401);
    expect(response.json<ErrorEnvelope>().message).toMatch(/invalid Telegram initData/);
  });

  it('hides leaderboard reads behind 404 while the flag is off', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/leaderboard?audioHash=${FIXTURE_AUDIO_HASH}`,
      remoteAddress: '10.1.0.2',
    });
    expect(response.statusCode).toBe(404);
    expect(response.json<ErrorEnvelope>().message).toMatch(/FEATURE_LEADERBOARD/);
  });

  it('hides score submission behind 404 before authentication even runs', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/scores',
      payload: {},
      remoteAddress: '10.1.0.2',
    });
    expect(response.statusCode).toBe(404);
  });
});
