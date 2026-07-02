import type {
  NftSkin,
  TonTransactionRequest,
  TonTransactionResult,
  Unsubscribe,
  WalletInfo,
} from '@viberide/shared';

import { TonDisabledError } from './errors';
import type { TonModule } from './types';

/**
 * Bound when the ton feature flag is off. The game keeps its TonModule
 * wiring untouched, but every operation fails fast with TonDisabledError
 * and no TON SDK code path is ever exercised.
 */
export class DisabledTonModule implements TonModule {
  connect(): Promise<WalletInfo> {
    return Promise.reject(new TonDisabledError());
  }

  disconnect(): Promise<void> {
    return Promise.reject(new TonDisabledError());
  }

  getWallet(): WalletInfo | null {
    return null;
  }

  onWalletChange(_callback: (wallet: WalletInfo | null) => void): Unsubscribe {
    return () => undefined;
  }

  sendTransaction(_request: TonTransactionRequest): Promise<TonTransactionResult> {
    return Promise.reject(new TonDisabledError());
  }

  getOwnedSkins(_ownerAddress: string): Promise<NftSkin[]> {
    return Promise.reject(new TonDisabledError());
  }

  requestSkinMint(_skinName: string): Promise<TonTransactionResult> {
    return Promise.reject(new TonDisabledError());
  }
}
