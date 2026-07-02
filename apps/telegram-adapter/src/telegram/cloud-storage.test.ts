import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCloudSaveStorage, createTelegramStorage } from './cloud-storage';

const sdk = vi.hoisted(() => ({
  isSupported: vi.fn(() => true),
  getItem: vi.fn<(key: string) => Promise<string>>(),
  setItem: vi.fn<(key: string, value: string) => Promise<void>>(),
  deleteItem: vi.fn<(key: string) => Promise<void>>(),
}));

vi.mock('@telegram-apps/sdk', () => ({
  cloudStorage: {
    isSupported: sdk.isSupported,
    getItem: sdk.getItem,
    setItem: sdk.setItem,
    deleteItem: sdk.deleteItem,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  sdk.isSupported.mockReturnValue(true);
  window.localStorage.clear();
});

describe('createCloudSaveStorage', () => {
  it('reads values through cloudStorage.getItem', async () => {
    sdk.getItem.mockResolvedValue('stored-value');

    await expect(createCloudSaveStorage().get('save')).resolves.toBe('stored-value');
    expect(sdk.getItem).toHaveBeenCalledWith('save');
  });

  it('maps the CloudStorage empty string (missing key) to null', async () => {
    sdk.getItem.mockResolvedValue('');

    await expect(createCloudSaveStorage().get('missing')).resolves.toBeNull();
  });

  it('writes through setItem and removes through deleteItem', async () => {
    sdk.setItem.mockResolvedValue(undefined);
    sdk.deleteItem.mockResolvedValue(undefined);
    const storage = createCloudSaveStorage();

    await storage.set('save', '{"coins":1}');
    expect(sdk.setItem).toHaveBeenCalledWith('save', '{"coins":1}');

    await storage.remove('save');
    expect(sdk.deleteItem).toHaveBeenCalledWith('save');
  });

  it('wraps get errors with key and cause', async () => {
    sdk.getItem.mockRejectedValue(new Error('network down'));

    await expect(createCloudSaveStorage().get('save')).rejects.toThrow(
      'CloudStorage get failed for key "save": network down',
    );
  });

  it('wraps set errors with key and cause', async () => {
    sdk.setItem.mockRejectedValue(new Error('flood limit'));

    await expect(createCloudSaveStorage().set('save', 'v')).rejects.toThrow(
      'CloudStorage set failed for key "save": flood limit',
    );
  });

  it('wraps remove errors with key and cause', async () => {
    sdk.deleteItem.mockRejectedValue(new Error('timeout'));

    await expect(createCloudSaveStorage().remove('save')).rejects.toThrow(
      'CloudStorage remove failed for key "save": timeout',
    );
  });
});

describe('createTelegramStorage', () => {
  it('uses CloudStorage when supported', async () => {
    sdk.isSupported.mockReturnValue(true);
    sdk.setItem.mockResolvedValue(undefined);

    await createTelegramStorage().set('k', 'v');

    expect(sdk.setItem).toHaveBeenCalledWith('k', 'v');
    expect(window.localStorage.getItem('k')).toBeNull();
  });

  it('falls back to real localStorage when unsupported', async () => {
    sdk.isSupported.mockReturnValue(false);
    const storage = createTelegramStorage();

    await storage.set('k', 'v');
    expect(window.localStorage.getItem('k')).toBe('v');
    await expect(storage.get('k')).resolves.toBe('v');

    await storage.remove('k');
    expect(window.localStorage.getItem('k')).toBeNull();
    expect(sdk.setItem).not.toHaveBeenCalled();
    expect(sdk.getItem).not.toHaveBeenCalled();
    expect(sdk.deleteItem).not.toHaveBeenCalled();
  });
});
