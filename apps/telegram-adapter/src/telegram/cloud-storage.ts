import { cloudStorage } from '@telegram-apps/sdk';
import type { SaveStorage } from '@viberide/shared';

import { createLocalStorage, wrapStorageError } from './local-storage';

/**
 * SaveStorage over Telegram CloudStorage.
 *
 * Note: CloudStorage cannot distinguish a missing key from an empty string —
 * getItem returns '' for keys that were never written. The game persists
 * JSON documents (never empty strings), so '' is mapped to null here.
 */
export function createCloudSaveStorage(): SaveStorage {
  return {
    async get(key: string): Promise<string | null> {
      try {
        const value = await cloudStorage.getItem(key);
        return value === '' ? null : value;
      } catch (cause) {
        throw wrapStorageError('CloudStorage', 'get', key, cause);
      }
    },
    async set(key: string, value: string): Promise<void> {
      try {
        await cloudStorage.setItem(key, value);
      } catch (cause) {
        throw wrapStorageError('CloudStorage', 'set', key, cause);
      }
    },
    async remove(key: string): Promise<void> {
      try {
        await cloudStorage.deleteItem(key);
      } catch (cause) {
        throw wrapStorageError('CloudStorage', 'remove', key, cause);
      }
    },
  };
}

/**
 * Storage for the Telegram platform: CloudStorage when the client supports
 * it (Bot API 6.9+), otherwise the localStorage fallback so saves still work
 * on old clients.
 */
export function createTelegramStorage(): SaveStorage {
  return cloudStorage.isSupported() ? createCloudSaveStorage() : createLocalStorage();
}
