import type { PlatformAdapter } from '@viberide/shared';

import type { ApiClient, ApiResult, AuthResponse } from './client';

/** Storage key for the persistent guest device id. */
export const DEVICE_ID_KEY = 'viberide:deviceId';

/** Display name used for guest sessions until profiles exist. */
export const GUEST_DISPLAY_NAME = 'Rider';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Loads the device UUID from platform storage, minting and persisting a
 * fresh one on first run (or when the stored value is corrupt).
 */
export async function getOrCreateDeviceId(
  platform: PlatformAdapter,
  randomUuid: () => string = () => globalThis.crypto.randomUUID(),
): Promise<string> {
  let stored: string | null = null;
  try {
    stored = await platform.storage.get(DEVICE_ID_KEY);
  } catch {
    stored = null;
  }
  if (stored !== null && UUID_PATTERN.test(stored)) {
    return stored;
  }
  const fresh = randomUuid();
  try {
    await platform.storage.set(DEVICE_ID_KEY, fresh);
  } catch {
    // Storage may be unavailable (private mode); a per-session id still works.
  }
  return fresh;
}

/**
 * Authenticates against the backend using the platform's identity:
 * Telegram initData when the platform provides one, guest otherwise.
 * Returns the ApiResult unchanged — callers decide how to degrade.
 */
export async function authenticate(
  client: ApiClient,
  platform: PlatformAdapter,
): Promise<ApiResult<AuthResponse>> {
  let initData: string | null = null;
  try {
    initData = await platform.getAuthPayload();
  } catch {
    initData = null;
  }
  if (initData !== null && initData.length > 0) {
    return client.authTelegram({ initData });
  }
  const deviceId = await getOrCreateDeviceId(platform);
  return client.authGuest({ deviceId, displayName: GUEST_DISPLAY_NAME });
}

/**
 * Ensures the client holds a token, authenticating on first need. Safe to
 * call repeatedly; concurrent callers share one in-flight attempt.
 */
export function createSession(
  client: ApiClient,
  platform: PlatformAdapter,
): () => Promise<ApiResult<AuthResponse> | { ok: true; value: null }> {
  let inFlight: Promise<ApiResult<AuthResponse>> | null = null;
  return () => {
    if (client.getToken() !== null) {
      return Promise.resolve({ ok: true as const, value: null });
    }
    inFlight ??= authenticate(client, platform).finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
