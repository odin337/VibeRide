import type { Logger } from '@viberide/shared';

import { DisabledTonModule } from './disabled';
import { MockTonModule } from './mock';
import { TonConnectModule } from './tonconnect';
import type { TonModule, TonModuleConfig } from './types';

export type TonModuleKind = 'tonconnect' | 'mock';

/**
 * Single composition point for TON functionality. `enabled` comes from
 * FeatureFlags.tonEnabled; when it is off the game gets a module that
 * fails fast and loads no TON code. 'mock' is for tests and local dev.
 */
export function createTonModule(
  enabled: boolean,
  config: TonModuleConfig,
  kind: TonModuleKind = 'tonconnect',
  logger?: Logger,
): TonModule {
  if (!enabled) {
    return new DisabledTonModule();
  }
  if (kind === 'mock') {
    return new MockTonModule();
  }
  return new TonConnectModule(config, logger);
}
