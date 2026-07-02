import type { PlatformAdapter, SaveStorage } from '@viberide/shared';

/**
 * PlatformAdapter for the standalone web build: window.localStorage
 * behind the async SaveStorage interface, guest auth (null payload),
 * no haptics.
 */

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'unknown cause';
}

export function createLocalStorageSaveStorage(): SaveStorage {
  return {
    get(key: string): Promise<string | null> {
      try {
        return Promise.resolve(window.localStorage.getItem(key));
      } catch (cause) {
        return Promise.reject(
          new Error(`localStorage get failed for key "${key}": ${describeCause(cause)}`, {
            cause,
          }),
        );
      }
    },
    set(key: string, value: string): Promise<void> {
      try {
        window.localStorage.setItem(key, value);
        return Promise.resolve();
      } catch (cause) {
        return Promise.reject(
          new Error(`localStorage set failed for key "${key}": ${describeCause(cause)}`, {
            cause,
          }),
        );
      }
    },
    remove(key: string): Promise<void> {
      try {
        window.localStorage.removeItem(key);
        return Promise.resolve();
      } catch (cause) {
        return Promise.reject(
          new Error(`localStorage remove failed for key "${key}": ${describeCause(cause)}`, {
            cause,
          }),
        );
      }
    },
  };
}

export function createWebPlatform(): PlatformAdapter {
  return {
    kind: 'web',
    storage: createLocalStorageSaveStorage(),
    getAuthPayload: () => Promise.resolve(null),
  };
}
