import { Address } from '@ton/core';
import type {
  NftSkin,
  TonTransactionRequest,
  TonTransactionResult,
  Unsubscribe,
  WalletInfo,
} from '@viberide/shared';

import { TonNotConnectedError } from './errors';
import type { TonModule } from './types';

/** Derives a deterministic, checksum-valid testnet address from a hex byte. */
function fixtureAddress(byte: string, bounceable: boolean): string {
  return Address.parseRaw(`0:${byte.repeat(32)}`).toString({ testOnly: true, bounceable });
}

/** BOC returned by every mocked sendTransaction call. */
export const MOCK_BOC = 'mock-boc';

/** BOC returned by every mocked requestSkinMint call. */
export const MOCK_MINT_BOC = 'mock-mint-boc';

export const MOCK_WALLET: WalletInfo = {
  address: fixtureAddress('a1', false),
  network: 'testnet',
  publicKey: 'c2'.repeat(32),
};

const MOCK_COLLECTION_ADDRESS = fixtureAddress('b7', true);

export const MOCK_SKINS: readonly NftSkin[] = [
  {
    id: fixtureAddress('01', true),
    name: 'Neon Rider',
    imageUrl: 'https://assets.viberide.example.com/skins/neon-rider.png',
    collectionAddress: MOCK_COLLECTION_ADDRESS,
    itemIndex: 0,
  },
  {
    id: fixtureAddress('02', true),
    name: 'Midnight Drift',
    imageUrl: 'https://assets.viberide.example.com/skins/midnight-drift.png',
    collectionAddress: MOCK_COLLECTION_ADDRESS,
    itemIndex: 1,
  },
];

/**
 * In-memory TonModule for tests and local development: no network, no
 * wallet, fully deterministic. Mirrors the real module's behaviour where
 * it matters — transaction methods require connect() first.
 */
export class MockTonModule implements TonModule {
  private wallet: WalletInfo | null = null;
  private readonly listeners = new Set<(wallet: WalletInfo | null) => void>();
  private readonly requests: TonTransactionRequest[] = [];
  private readonly mints: string[] = [];

  constructor(private readonly fixtureWallet: WalletInfo = MOCK_WALLET) {}

  /** Every request accepted by sendTransaction, oldest first (snapshot copy). */
  get sentRequests(): readonly TonTransactionRequest[] {
    return [...this.requests];
  }

  /** Every skin name accepted by requestSkinMint, oldest first (snapshot copy). */
  get mintedSkinNames(): readonly string[] {
    return [...this.mints];
  }

  connect(): Promise<WalletInfo> {
    this.wallet = this.fixtureWallet;
    this.notify();
    return Promise.resolve(this.fixtureWallet);
  }

  disconnect(): Promise<void> {
    this.wallet = null;
    this.notify();
    return Promise.resolve();
  }

  getWallet(): WalletInfo | null {
    return this.wallet;
  }

  onWalletChange(callback: (wallet: WalletInfo | null) => void): Unsubscribe {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  sendTransaction(request: TonTransactionRequest): Promise<TonTransactionResult> {
    if (this.wallet === null) {
      return Promise.reject(new TonNotConnectedError());
    }
    this.requests.push(request);
    return Promise.resolve({ boc: MOCK_BOC });
  }

  getOwnedSkins(_ownerAddress: string): Promise<NftSkin[]> {
    return Promise.resolve([...MOCK_SKINS]);
  }

  requestSkinMint(skinName: string): Promise<TonTransactionResult> {
    if (this.wallet === null) {
      return Promise.reject(new TonNotConnectedError());
    }
    this.mints.push(skinName);
    return Promise.resolve({ boc: MOCK_MINT_BOC });
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      listener(this.wallet);
    }
  }
}
