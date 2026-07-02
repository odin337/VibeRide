/** Key-value persistence abstraction: localStorage on web, CloudStorage in Telegram. */
export interface SaveStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export type PlatformKind = 'web' | 'telegram';

export type HapticKind = 'impact' | 'success' | 'error';

/**
 * Everything the game needs from its host platform. The game core never
 * imports platform SDKs directly — it only talks to this adapter.
 */
export interface PlatformAdapter {
  readonly kind: PlatformKind;
  readonly storage: SaveStorage;
  /**
   * Auth payload for the backend: raw Telegram initData string inside
   * Telegram, or null for a guest web session.
   */
  getAuthPayload(): Promise<string | null>;
  haptic?(kind: HapticKind): void;
}
