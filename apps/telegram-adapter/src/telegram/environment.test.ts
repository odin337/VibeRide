import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isTelegramEnv } from './environment';

const sdk = vi.hoisted(() => ({
  retrieveLaunchParams: vi.fn<() => unknown>(),
}));

vi.mock('@telegram-apps/sdk', () => ({
  retrieveLaunchParams: sdk.retrieveLaunchParams,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isTelegramEnv', () => {
  it('returns true when launch params are retrievable', () => {
    sdk.retrieveLaunchParams.mockReturnValue({
      tgWebAppPlatform: 'tdesktop',
      tgWebAppVersion: '8.0',
    });

    expect(isTelegramEnv()).toBe(true);
    expect(sdk.retrieveLaunchParams).toHaveBeenCalledTimes(1);
  });

  it('returns false when retrieval throws (plain browser)', () => {
    sdk.retrieveLaunchParams.mockImplementation(() => {
      throw new Error('Unable to retrieve launch parameters from any known source.');
    });

    expect(isTelegramEnv()).toBe(false);
  });
});
