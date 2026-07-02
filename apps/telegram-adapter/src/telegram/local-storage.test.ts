import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createLocalStorage,
  createWebLikeFallback,
  describeCause,
  wrapStorageError,
} from './local-storage';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createLocalStorage', () => {
  it('round-trips values through window.localStorage', async () => {
    const storage = createLocalStorage();

    await storage.set('viberide:test', 'payload');
    expect(window.localStorage.getItem('viberide:test')).toBe('payload');

    await expect(storage.get('viberide:test')).resolves.toBe('payload');

    await storage.remove('viberide:test');
    expect(window.localStorage.getItem('viberide:test')).toBeNull();
  });

  it('resolves null for keys that were never written', async () => {
    await expect(createLocalStorage().get('missing')).resolves.toBeNull();
  });

  it('wraps set failures with a descriptive error', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    await expect(createLocalStorage().set('save', 'x')).rejects.toThrow(
      'localStorage set failed for key "save": quota exceeded',
    );
  });

  it('wraps get failures with a descriptive error', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('access denied');
    });

    await expect(createLocalStorage().get('save')).rejects.toThrow(
      'localStorage get failed for key "save": access denied',
    );
  });

  it('wraps remove failures with a descriptive error', async () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('access denied');
    });

    await expect(createLocalStorage().remove('save')).rejects.toThrow(
      'localStorage remove failed for key "save": access denied',
    );
  });
});

describe('wrapStorageError / describeCause', () => {
  it('uses the message of Error causes and preserves the cause', () => {
    const cause = new Error('boom');
    const wrapped = wrapStorageError('CloudStorage', 'set', 'save', cause);

    expect(wrapped.message).toBe('CloudStorage set failed for key "save": boom');
    expect(wrapped.cause).toBe(cause);
  });

  it('uses string causes verbatim', () => {
    expect(describeCause('plain failure')).toBe('plain failure');
  });

  it('falls back to a generic label for exotic causes', () => {
    const wrapped = wrapStorageError('localStorage', 'get', 'k', 42);
    expect(wrapped.message).toBe('localStorage get failed for key "k": unknown cause');
  });
});

describe('createWebLikeFallback', () => {
  it('is a web platform backed by localStorage with guest auth', async () => {
    const platform = createWebLikeFallback();

    expect(platform.kind).toBe('web');
    expect(platform.haptic).toBeUndefined();

    await platform.storage.set('slot', 'v1');
    expect(window.localStorage.getItem('slot')).toBe('v1');
    await expect(platform.storage.get('slot')).resolves.toBe('v1');

    await expect(platform.getAuthPayload()).resolves.toBeNull();
  });
});
