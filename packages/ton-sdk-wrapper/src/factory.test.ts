import { describe, expect, it } from 'vitest';

import { DisabledTonModule } from './disabled';
import { createTonModule } from './factory';
import { MockTonModule } from './mock';
import { TonConnectModule } from './tonconnect';
import type { TonModuleConfig } from './types';

const config: TonModuleConfig = {
  network: 'testnet',
  manifestUrl: 'https://viberide.example.com/tonconnect-manifest.json',
};

describe('createTonModule', () => {
  it('returns DisabledTonModule when the feature flag is off, whatever the kind', () => {
    expect(createTonModule(false, config)).toBeInstanceOf(DisabledTonModule);
    expect(createTonModule(false, config, 'mock')).toBeInstanceOf(DisabledTonModule);
    expect(createTonModule(false, config, 'tonconnect')).toBeInstanceOf(DisabledTonModule);
  });

  it('returns MockTonModule for kind "mock"', () => {
    expect(createTonModule(true, config, 'mock')).toBeInstanceOf(MockTonModule);
  });

  it('returns TonConnectModule for kind "tonconnect"', () => {
    expect(createTonModule(true, config, 'tonconnect')).toBeInstanceOf(TonConnectModule);
  });

  it('defaults to the tonconnect kind', () => {
    expect(createTonModule(true, config)).toBeInstanceOf(TonConnectModule);
  });

  it('constructing the tonconnect module stays inert (no SDK, no wallet)', () => {
    const module = createTonModule(true, config);
    expect(module.getWallet()).toBeNull();
  });
});
