import { hapticFeedback, retrieveRawInitData } from '@telegram-apps/sdk';
import type { HapticKind, PlatformAdapter } from '@viberide/shared';

import { createTelegramStorage } from './cloud-storage';

/**
 * PlatformAdapter implementation for Telegram Mini Apps. The game core only
 * talks to this object — it never imports the Telegram SDK directly.
 */
export function createTelegramPlatform(): PlatformAdapter {
  return {
    kind: 'telegram',
    storage: createTelegramStorage(),
    getAuthPayload(): Promise<string | null> {
      try {
        return Promise.resolve(retrieveRawInitData() ?? null);
      } catch {
        // Raw init data can be unavailable on exotic clients; treat as guest.
        return Promise.resolve(null);
      }
    },
    haptic(kind: HapticKind): void {
      if (!hapticFeedback.isSupported()) {
        return;
      }
      try {
        if (kind === 'impact') {
          hapticFeedback.impactOccurred('medium');
        } else {
          hapticFeedback.notificationOccurred(kind);
        }
      } catch {
        // Haptics are cosmetic; never let a failed vibration break gameplay.
      }
    },
  };
}
