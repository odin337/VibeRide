import { describe, expect, it } from 'vitest';

import { DEFAULT_FLAGS, parseBooleanFlag, resolveFeatureFlags } from './feature-flags';

describe('parseBooleanFlag', () => {
  it.each([
    ['1', true],
    ['true', true],
    ['YES', true],
    [' on ', true],
    ['0', false],
    ['false', false],
    ['No', false],
    ['off', false],
  ])('parses %j as %j', (raw, expected) => {
    expect(parseBooleanFlag(raw, !expected)).toBe(expected);
  });

  it('returns the fallback for undefined and garbage', () => {
    expect(parseBooleanFlag(undefined, true)).toBe(true);
    expect(parseBooleanFlag('maybe', false)).toBe(false);
  });
});

describe('resolveFeatureFlags', () => {
  it('returns defaults for an empty environment', () => {
    expect(resolveFeatureFlags({})).toEqual(DEFAULT_FLAGS);
  });

  it('reads Vite-prefixed variables', () => {
    const flags = resolveFeatureFlags({
      VITE_FEATURE_TON: 'true',
      VITE_FEATURE_NFT_SKINS: 'true',
    });
    expect(flags.tonEnabled).toBe(true);
    expect(flags.nftSkinsEnabled).toBe(true);
  });

  it('reads plain-prefixed variables', () => {
    const flags = resolveFeatureFlags({ FEATURE_LEADERBOARD: 'off', FEATURE_TELEGRAM: 'on' });
    expect(flags.leaderboardEnabled).toBe(false);
    expect(flags.telegramEnabled).toBe(true);
  });

  it('forces nftSkinsEnabled off when TON is disabled', () => {
    const flags = resolveFeatureFlags({
      VITE_FEATURE_TON: 'false',
      VITE_FEATURE_NFT_SKINS: 'true',
    });
    expect(flags.nftSkinsEnabled).toBe(false);
  });

  it('prefers the Vite-prefixed variable when both exist', () => {
    const flags = resolveFeatureFlags({ VITE_FEATURE_TON: 'true', FEATURE_TON: 'false' });
    expect(flags.tonEnabled).toBe(true);
  });
});
