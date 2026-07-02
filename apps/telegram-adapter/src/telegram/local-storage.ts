import type { PlatformAdapter, SaveStorage } from '@viberide/shared';

/** Human-readable rendering of an unknown thrown value. */
export function describeCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }
  if (typeof cause === 'string') {
    return cause;
  }
  return 'unknown cause';
}

/** Uniform error wrapper shared by the localStorage and CloudStorage backends. */
export function wrapStorageError(
  backend: string,
  operation: string,
  key: string,
  cause: unknown,
): Error {
  return new Error(`${backend} ${operation} failed for key "${key}": ${describeCause(cause)}`, {
    cause,
  });
}

/**
 * SaveStorage backed by window.localStorage. Used directly when the adapter
 * runs outside Telegram, and as the fallback when Telegram CloudStorage is
 * not supported by the current client.
 */
export function createLocalStorage(): SaveStorage {
  return {
    get(key: string): Promise<string | null> {
      try {
        return Promise.resolve(window.localStorage.getItem(key));
      } catch (cause) {
        return Promise.reject(wrapStorageError('localStorage', 'get', key, cause));
      }
    },
    set(key: string, value: string): Promise<void> {
      try {
        window.localStorage.setItem(key, value);
        return Promise.resolve();
      } catch (cause) {
        return Promise.reject(wrapStorageError('localStorage', 'set', key, cause));
      }
    },
    remove(key: string): Promise<void> {
      try {
        window.localStorage.removeItem(key);
        return Promise.resolve();
      } catch (cause) {
        return Promise.reject(wrapStorageError('localStorage', 'remove', key, cause));
      }
    },
  };
}

/**
 * Platform adapter used when the adapter runs outside Telegram (local dev in
 * a plain browser). Web semantics: guest auth payload, no haptics.
 */
export function createWebLikeFallback(): PlatformAdapter {
  return {
    kind: 'web',
    storage: createLocalStorage(),
    getAuthPayload: () => Promise.resolve(null),
  };
}
