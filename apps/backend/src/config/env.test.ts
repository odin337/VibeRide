import { describe, expect, it } from 'vitest';

import { DEV_JWT_SECRET, loadEnv } from './env';

const STRONG_SECRET = 's'.repeat(32);

describe('loadEnv', () => {
  it('applies documented defaults on an empty environment', () => {
    const env = loadEnv({});
    expect(env.nodeEnv).toBe('development');
    expect(env.port).toBe(3000);
    expect(env.host).toBe('0.0.0.0');
    expect(env.jwtExpiresIn).toBe(3600);
    expect(env.telegramBotToken).toBeUndefined();
    expect(env.corsOrigins).toEqual(['http://localhost:5173', 'http://localhost:5174']);
    expect(env.throttleTtlSec).toBe(60);
    expect(env.throttleLimit).toBe(60);
    expect(env.logLevel).toBe('info');
  });

  it('falls back to the dev secret outside production and flags it', () => {
    const env = loadEnv({ NODE_ENV: 'development' });
    expect(env.jwtSecret).toBe(DEV_JWT_SECRET);
    expect(env.jwtSecretIsFallback).toBe(true);
  });

  it('uses the provided JWT secret and clears the fallback flag', () => {
    const env = loadEnv({ JWT_SECRET: STRONG_SECRET });
    expect(env.jwtSecret).toBe(STRONG_SECRET);
    expect(env.jwtSecretIsFallback).toBe(false);
  });

  it('refuses to boot production without JWT_SECRET', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET is required/);
  });

  it('treats a blank JWT_SECRET as unset', () => {
    expect(() => loadEnv({ NODE_ENV: 'production', JWT_SECRET: '   ' })).toThrow(
      /JWT_SECRET is required/,
    );
  });

  it('accepts production with a strong secret', () => {
    const env = loadEnv({ NODE_ENV: 'production', JWT_SECRET: STRONG_SECRET });
    expect(env.nodeEnv).toBe('production');
    expect(env.jwtSecretIsFallback).toBe(false);
  });

  it('rejects a too-short JWT_SECRET', () => {
    expect(() => loadEnv({ JWT_SECRET: 'short' })).toThrow(/JWT_SECRET.*32/);
  });

  it('parses and trims comma-separated CORS origins', () => {
    const env = loadEnv({ CORS_ORIGINS: ' https://a.example , https://b.example ,' });
    expect(env.corsOrigins).toEqual(['https://a.example', 'https://b.example']);
  });

  it('coerces numeric variables and rejects invalid ones', () => {
    const env = loadEnv({ PORT: '8080', THROTTLE_TTL_SEC: '30', THROTTLE_LIMIT: '10' });
    expect(env.port).toBe(8080);
    expect(env.throttleTtlSec).toBe(30);
    expect(env.throttleLimit).toBe(10);
    expect(() => loadEnv({ PORT: 'not-a-port' })).toThrow(/PORT/);
    expect(() => loadEnv({ PORT: '70000' })).toThrow(/PORT/);
    expect(() => loadEnv({ THROTTLE_LIMIT: '-1' })).toThrow(/THROTTLE_LIMIT/);
  });

  it('rejects unknown NODE_ENV and LOG_LEVEL values', () => {
    expect(() => loadEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
    expect(() => loadEnv({ LOG_LEVEL: 'trace' })).toThrow(/LOG_LEVEL/);
  });

  it('captures the Telegram bot token when present', () => {
    const env = loadEnv({ TELEGRAM_BOT_TOKEN: '123456:ABC-token' });
    expect(env.telegramBotToken).toBe('123456:ABC-token');
  });

  it('resolves feature flags from FEATURE_* variables with defaults', () => {
    expect(loadEnv({}).flags).toEqual({
      tonEnabled: false,
      nftSkinsEnabled: false,
      leaderboardEnabled: true,
      telegramEnabled: false,
    });
    const env = loadEnv({ FEATURE_LEADERBOARD: 'off', FEATURE_TELEGRAM: 'yes' });
    expect(env.flags.leaderboardEnabled).toBe(false);
    expect(env.flags.telegramEnabled).toBe(true);
  });
});
