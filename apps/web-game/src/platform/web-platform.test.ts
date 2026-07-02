import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLocalStorageSaveStorage, createWebPlatform } from './web-platform';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createLocalStorageSaveStorage', () => {
  it('round-trips values through window.localStorage', async () => {
    const storage = createLocalStorageSaveStorage();

    await storage.set('viberide:test', 'payload');
    expect(window.localStorage.getItem('viberide:test')).toBe('payload');
    await expect(storage.get('viberide:test')).resolves.toBe('payload');

    await storage.remove('viberide:test');
    expect(window.localStorage.getItem('viberide:test')).toBeNull();
  });

  it('resolves null for keys that were never written', async () => {
    await expect(createLocalStorageSaveStorage().get('missing')).resolves.toBeNull();
  });

  it('wraps set failures with a descriptive error', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    await expect(createLocalStorageSaveStorage().set('save', 'x')).rejects.toThrow(
      'localStorage set failed for key "save": quota exceeded',
    );
  });

  it('wraps get failures with a descriptive error', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('access denied');
    });
    await expect(createLocalStorageSaveStorage().get('save')).rejects.toThrow(
      'localStorage get failed for key "save": access denied',
    );
  });

  it('wraps remove failures with a descriptive error', async () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('access denied');
    });
    await expect(createLocalStorageSaveStorage().remove('save')).rejects.toThrow(
      'localStorage remove failed for key "save": access denied',
    );
  });
});

describe('createWebPlatform', () => {
  it('is a guest web platform without haptics', async () => {
    const platform = createWebPlatform();
    expect(platform.kind).toBe('web');
    expect(platform.haptic).toBeUndefined();
    await expect(platform.getAuthPayload()).resolves.toBeNull();
  });

  it('persists through its SaveStorage', async () => {
    const platform = createWebPlatform();
    await platform.storage.set('viberide:settings', '{"volume":0.5}');
    await expect(platform.storage.get('viberide:settings')).resolves.toBe('{"volume":0.5}');
  });
});
