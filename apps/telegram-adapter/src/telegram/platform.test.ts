import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTelegramPlatform } from './platform';

const sdk = vi.hoisted(() => ({
  hapticIsSupported: vi.fn(() => true),
  impactOccurred: vi.fn<(style: string) => void>(),
  notificationOccurred: vi.fn<(type: string) => void>(),
  retrieveRawInitData: vi.fn<() => string | undefined>(),
  cloudIsSupported: vi.fn(() => false),
}));

vi.mock('@telegram-apps/sdk', () => ({
  hapticFeedback: {
    isSupported: sdk.hapticIsSupported,
    impactOccurred: sdk.impactOccurred,
    notificationOccurred: sdk.notificationOccurred,
  },
  retrieveRawInitData: sdk.retrieveRawInitData,
  cloudStorage: {
    isSupported: sdk.cloudIsSupported,
    getItem: vi.fn(),
    setItem: vi.fn(),
    deleteItem: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  sdk.hapticIsSupported.mockReturnValue(true);
  sdk.cloudIsSupported.mockReturnValue(false);
  window.localStorage.clear();
});

describe('createTelegramPlatform', () => {
  it('is a telegram platform with a working storage', async () => {
    const platform = createTelegramPlatform();

    expect(platform.kind).toBe('telegram');
    await platform.storage.set('slot', 'v');
    await expect(platform.storage.get('slot')).resolves.toBe('v');
  });

  describe('getAuthPayload', () => {
    it('returns the raw init data string', async () => {
      sdk.retrieveRawInitData.mockReturnValue('user=%7B%22id%22%3A1%7D&hash=abc');

      await expect(createTelegramPlatform().getAuthPayload()).resolves.toBe(
        'user=%7B%22id%22%3A1%7D&hash=abc',
      );
    });

    it('returns null when init data is absent', async () => {
      sdk.retrieveRawInitData.mockReturnValue(undefined);

      await expect(createTelegramPlatform().getAuthPayload()).resolves.toBeNull();
    });

    it('returns null when retrieval throws', async () => {
      sdk.retrieveRawInitData.mockImplementation(() => {
        throw new Error('unknown env');
      });

      await expect(createTelegramPlatform().getAuthPayload()).resolves.toBeNull();
    });
  });

  describe('haptic', () => {
    it('maps impact to impactOccurred(medium)', () => {
      const platform = createTelegramPlatform();
      expect(platform.haptic).toBeDefined();

      platform.haptic?.('impact');

      expect(sdk.impactOccurred).toHaveBeenCalledWith('medium');
      expect(sdk.notificationOccurred).not.toHaveBeenCalled();
    });

    it('maps success and error to notificationOccurred', () => {
      const platform = createTelegramPlatform();

      platform.haptic?.('success');
      platform.haptic?.('error');

      expect(sdk.notificationOccurred).toHaveBeenNthCalledWith(1, 'success');
      expect(sdk.notificationOccurred).toHaveBeenNthCalledWith(2, 'error');
      expect(sdk.impactOccurred).not.toHaveBeenCalled();
    });

    it('does nothing when haptics are unsupported', () => {
      sdk.hapticIsSupported.mockReturnValue(false);
      const platform = createTelegramPlatform();

      platform.haptic?.('impact');
      platform.haptic?.('success');

      expect(sdk.impactOccurred).not.toHaveBeenCalled();
      expect(sdk.notificationOccurred).not.toHaveBeenCalled();
    });

    it('swallows SDK errors instead of breaking the caller', () => {
      sdk.impactOccurred.mockImplementation(() => {
        throw new Error('not initialized');
      });
      const platform = createTelegramPlatform();

      expect(() => {
        platform.haptic?.('impact');
      }).not.toThrow();
    });
  });
});
