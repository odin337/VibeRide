import type { PlatformAdapter, SaveStorage } from '@viberide/shared';
import { describe, expect, it, vi } from 'vitest';

import type { ApiClient, ApiResult, AuthResponse } from './client';
import { authenticate, createSession, DEVICE_ID_KEY, getOrCreateDeviceId } from './session';

const UUID = '3f6f2f04-8c2d-4d5e-9b1a-7c0a4a1b2c3d';

interface MemoryStorage extends SaveStorage {
  readonly data: Map<string, string>;
}

function memoryStorage(initial: Record<string, string> = {}): MemoryStorage {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get: (key) => Promise.resolve(data.get(key) ?? null),
    set: (key, value) => {
      data.set(key, value);
      return Promise.resolve();
    },
    remove: (key) => {
      data.delete(key);
      return Promise.resolve();
    },
  };
}

function makePlatform(
  storage: SaveStorage = memoryStorage(),
  authPayload: string | null = null,
): PlatformAdapter {
  return {
    kind: 'web',
    storage,
    getAuthPayload: () => Promise.resolve(authPayload),
  };
}

const OK_AUTH: ApiResult<AuthResponse> = {
  ok: true,
  value: { token: 't', player: { id: 'p', displayName: 'Rider', kind: 'guest' } },
};

function makeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    authGuest: vi.fn().mockResolvedValue(OK_AUTH),
    authTelegram: vi.fn().mockResolvedValue(OK_AUTH),
    registerTrack: vi.fn(),
    submitScore: vi.fn(),
    getLeaderboard: vi.fn(),
    getToken: () => null,
    ...overrides,
  };
}

describe('getOrCreateDeviceId', () => {
  it('returns an existing valid uuid untouched', async () => {
    const storage = memoryStorage({ [DEVICE_ID_KEY]: UUID });
    await expect(getOrCreateDeviceId(makePlatform(storage))).resolves.toBe(UUID);
    expect(storage.data.get(DEVICE_ID_KEY)).toBe(UUID);
  });

  it('mints and persists a fresh uuid when the stored value is corrupt', async () => {
    const storage = memoryStorage({ [DEVICE_ID_KEY]: 'not-a-uuid' });
    const id = await getOrCreateDeviceId(makePlatform(storage), () => UUID);
    expect(id).toBe(UUID);
    expect(storage.data.get(DEVICE_ID_KEY)).toBe(UUID);
  });

  it('still returns an id when storage is broken', async () => {
    const broken: SaveStorage = {
      get: () => Promise.reject(new Error('nope')),
      set: () => Promise.reject(new Error('nope')),
      remove: () => Promise.reject(new Error('nope')),
    };
    await expect(getOrCreateDeviceId(makePlatform(broken), () => UUID)).resolves.toBe(UUID);
  });
});

describe('authenticate', () => {
  it('uses Telegram auth when the platform supplies initData', async () => {
    const client = makeClient();
    const result = await authenticate(client, makePlatform(memoryStorage(), 'init-data-string'));
    expect(result).toEqual(OK_AUTH);
    expect(client.authTelegram).toHaveBeenCalledWith({ initData: 'init-data-string' });
    expect(client.authGuest).not.toHaveBeenCalled();
  });

  it('falls back to guest auth with the persisted device id', async () => {
    const storage = memoryStorage({ [DEVICE_ID_KEY]: UUID });
    const client = makeClient();
    await authenticate(client, makePlatform(storage));
    expect(client.authGuest).toHaveBeenCalledWith({ deviceId: UUID, displayName: 'Rider' });
  });

  it('treats a rejecting getAuthPayload as guest', async () => {
    const client = makeClient();
    const platform: PlatformAdapter = {
      kind: 'telegram',
      storage: memoryStorage({ [DEVICE_ID_KEY]: UUID }),
      getAuthPayload: () => Promise.reject(new Error('sdk broke')),
    };
    await authenticate(client, platform);
    expect(client.authGuest).toHaveBeenCalled();
  });
});

describe('createSession', () => {
  it('authenticates once and short-circuits when a token exists', async () => {
    let issuedToken: string | null = null;
    const client = makeClient({
      authGuest: vi.fn().mockImplementation(() => {
        issuedToken = 't';
        return Promise.resolve(OK_AUTH);
      }),
      getToken: () => issuedToken,
    });
    const ensure = createSession(client, makePlatform(memoryStorage({ [DEVICE_ID_KEY]: UUID })));

    await ensure();
    await ensure();
    expect(client.authGuest).toHaveBeenCalledTimes(1);
  });
});
