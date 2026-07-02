import { Address } from '@ton/core';
import type { TonTransactionRequest, WalletInfo } from '@viberide/shared';
import { describe, expect, it, vi } from 'vitest';

import { TonNotConnectedError } from './errors';
import { MOCK_BOC, MOCK_MINT_BOC, MOCK_SKINS, MOCK_WALLET, MockTonModule } from './mock';

const request: TonTransactionRequest = {
  toAddress: MOCK_SKINS[0]?.collectionAddress ?? '',
  amountNano: '50000000',
  validUntil: 1_900_000_000,
};

describe('MockTonModule', () => {
  it('connect resolves the fixture testnet wallet and stores it', async () => {
    const module = new MockTonModule();
    expect(module.getWallet()).toBeNull();

    const wallet = await module.connect();
    expect(wallet).toEqual(MOCK_WALLET);
    expect(wallet.network).toBe('testnet');
    expect(() => Address.parse(wallet.address)).not.toThrow();
    expect(module.getWallet()).toEqual(MOCK_WALLET);
  });

  it('accepts a custom fixture wallet', async () => {
    const custom: WalletInfo = { address: 'EQ-custom', network: 'mainnet' };
    const module = new MockTonModule(custom);
    await expect(module.connect()).resolves.toEqual(custom);
    expect(module.getWallet()).toEqual(custom);
  });

  it('notifies wallet change subscribers on connect and disconnect', async () => {
    const module = new MockTonModule();
    const listener = vi.fn();
    module.onWalletChange(listener);

    await module.connect();
    expect(listener).toHaveBeenLastCalledWith(MOCK_WALLET);

    await module.disconnect();
    expect(listener).toHaveBeenLastCalledWith(null);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(module.getWallet()).toBeNull();
  });

  it('stops notifying after unsubscribe', async () => {
    const module = new MockTonModule();
    const listener = vi.fn();
    const unsubscribe = module.onWalletChange(listener);
    unsubscribe();

    await module.connect();
    expect(listener).not.toHaveBeenCalled();
  });

  it('rejects sendTransaction while disconnected and records nothing', async () => {
    const module = new MockTonModule();
    await expect(module.sendTransaction(request)).rejects.toBeInstanceOf(TonNotConnectedError);
    expect(module.sentRequests).toHaveLength(0);
  });

  it('records sent transactions and resolves the mock BOC', async () => {
    const module = new MockTonModule();
    await module.connect();

    const result = await module.sendTransaction(request);
    expect(result).toEqual({ boc: MOCK_BOC });

    const second: TonTransactionRequest = { ...request, amountNano: '1' };
    await module.sendTransaction(second);
    expect(module.sentRequests).toEqual([request, second]);
  });

  it('exposes sentRequests as a snapshot copy', async () => {
    const module = new MockTonModule();
    const before = module.sentRequests;

    await module.connect();
    await module.sendTransaction(request);

    expect(before).toHaveLength(0);
    expect(module.sentRequests).toHaveLength(1);
    expect(module.sentRequests).not.toBe(module.sentRequests);
  });

  it('returns the two fixture skins from getOwnedSkins', async () => {
    const module = new MockTonModule();
    const skins = await module.getOwnedSkins('EQ-anyone');
    expect(skins).toHaveLength(2);
    expect(skins).toEqual([...MOCK_SKINS]);
    expect(skins.map((skin) => skin.itemIndex)).toEqual([0, 1]);

    const again = await module.getOwnedSkins('EQ-anyone');
    expect(again).not.toBe(skins);
  });

  it('rejects requestSkinMint while disconnected', async () => {
    const module = new MockTonModule();
    await expect(module.requestSkinMint('Neon Rider')).rejects.toBeInstanceOf(TonNotConnectedError);
    expect(module.mintedSkinNames).toHaveLength(0);
  });

  it('records mint requests and resolves the mock mint BOC', async () => {
    const module = new MockTonModule();
    await module.connect();

    await expect(module.requestSkinMint('Neon Rider')).resolves.toEqual({ boc: MOCK_MINT_BOC });
    await expect(module.requestSkinMint('Midnight Drift')).resolves.toEqual({
      boc: MOCK_MINT_BOC,
    });
    expect(module.mintedSkinNames).toEqual(['Neon Rider', 'Midnight Drift']);
  });
});
