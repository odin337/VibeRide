import type { TonTransactionRequest } from '@viberide/shared';
import { describe, expect, it, vi } from 'vitest';

import { DisabledTonModule } from './disabled';
import { TonDisabledError } from './errors';

const request: TonTransactionRequest = {
  toAddress: 'EQ-any',
  amountNano: '1000000000',
  validUntil: 1_900_000_000,
};

describe('DisabledTonModule', () => {
  const module = new DisabledTonModule();

  it('rejects connect with TonDisabledError', async () => {
    await expect(module.connect()).rejects.toBeInstanceOf(TonDisabledError);
    await expect(module.connect()).rejects.toMatchObject({ code: 'TON_DISABLED' });
  });

  it('rejects disconnect with TonDisabledError', async () => {
    await expect(module.disconnect()).rejects.toBeInstanceOf(TonDisabledError);
  });

  it('rejects sendTransaction with TonDisabledError', async () => {
    await expect(module.sendTransaction(request)).rejects.toBeInstanceOf(TonDisabledError);
  });

  it('rejects getOwnedSkins with TonDisabledError', async () => {
    await expect(module.getOwnedSkins('EQ-owner')).rejects.toBeInstanceOf(TonDisabledError);
  });

  it('rejects requestSkinMint with TonDisabledError', async () => {
    await expect(module.requestSkinMint('Neon Rider')).rejects.toBeInstanceOf(TonDisabledError);
  });

  it('reports no wallet', () => {
    expect(module.getWallet()).toBeNull();
  });

  it('returns a no-op unsubscribe from onWalletChange and never notifies', () => {
    const callback = vi.fn();
    const unsubscribe = module.onWalletChange(callback);
    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
    expect(callback).not.toHaveBeenCalled();
  });
});
