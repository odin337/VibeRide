import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';

import { loadEnv } from '../config/env';
import { buildInitData } from '../testing/telegram';
import { AuthService } from './auth.service';

const BOT_TOKEN = '7000000001:AAFakeTestTokenForHmacDerivation123456';
const NOW_SEC = 1_751_443_200;

/** Deterministic stand-in recording the signed payload. */
function fakeJwt(): { service: JwtService; payloads: unknown[] } {
  const payloads: unknown[] = [];
  const service = {
    signAsync: (payload: unknown): Promise<string> => {
      payloads.push(payload);
      return Promise.resolve('signed.jwt.token');
    },
  } as unknown as JwtService;
  return { service, payloads };
}

describe('AuthService.guest', () => {
  it('derives the player id from the device UUID and echoes the display name', async () => {
    const { service, payloads } = fakeJwt();
    const auth = new AuthService(service, loadEnv({}));
    const result = await auth.guest({
      deviceId: '3f6f2f04-8c2d-4d5e-9b1a-7c0a4a1b2c3d',
      displayName: 'RoadRunner',
    });
    expect(result).toEqual({
      token: 'signed.jwt.token',
      player: {
        id: 'guest:3f6f2f04-8c2d-4d5e-9b1a-7c0a4a1b2c3d',
        displayName: 'RoadRunner',
        kind: 'guest',
      },
    });
    expect(payloads).toEqual([
      { sub: 'guest:3f6f2f04-8c2d-4d5e-9b1a-7c0a4a1b2c3d', name: 'RoadRunner', kind: 'guest' },
    ]);
  });
});

describe('AuthService.telegram', () => {
  it('responds 503 with a descriptive message when no bot token is configured', async () => {
    const auth = new AuthService(fakeJwt().service, loadEnv({}));
    await expect(auth.telegram({ initData: 'anything' }, NOW_SEC)).rejects.toThrow(
      ServiceUnavailableException,
    );
    await expect(auth.telegram({ initData: 'anything' }, NOW_SEC)).rejects.toThrow(
      /TELEGRAM_BOT_TOKEN is not configured/,
    );
  });

  it('issues a session for valid initData', async () => {
    const auth = new AuthService(fakeJwt().service, loadEnv({ TELEGRAM_BOT_TOKEN: BOT_TOKEN }));
    const initData = buildInitData(BOT_TOKEN, {
      authDate: NOW_SEC - 5,
      user: { id: 12345, first_name: 'Danila' },
    });
    const result = await auth.telegram({ initData }, NOW_SEC);
    expect(result.player).toEqual({ id: 'tg:12345', displayName: 'Danila', kind: 'telegram' });
    expect(result.token).toBe('signed.jwt.token');
  });

  it('falls back to username, then a generic name, for display', async () => {
    const auth = new AuthService(fakeJwt().service, loadEnv({ TELEGRAM_BOT_TOKEN: BOT_TOKEN }));
    const withUsername = buildInitData(BOT_TOKEN, {
      authDate: NOW_SEC,
      user: { id: 7, username: 'beat_master' },
    });
    expect((await auth.telegram({ initData: withUsername }, NOW_SEC)).player.displayName).toBe(
      'beat_master',
    );
    const bare = buildInitData(BOT_TOKEN, { authDate: NOW_SEC, user: { id: 7 } });
    expect((await auth.telegram({ initData: bare }, NOW_SEC)).player.displayName).toBe('Player 7');
  });

  it('rejects invalid signatures with 401', async () => {
    const auth = new AuthService(fakeJwt().service, loadEnv({ TELEGRAM_BOT_TOKEN: BOT_TOKEN }));
    const initData = buildInitData('8000000002:OtherBotToken', {
      authDate: NOW_SEC,
      user: { id: 1 },
    });
    await expect(auth.telegram({ initData }, NOW_SEC)).rejects.toThrow(UnauthorizedException);
  });
});
