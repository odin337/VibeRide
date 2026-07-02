import { Address } from '@ton/core';
import type * as TonConnectUiModule from '@tonconnect/ui';
import type {
  Account,
  ConnectedWallet,
  SendTransactionRequest,
  TonConnectUI,
} from '@tonconnect/ui';
import type {
  Logger,
  NftSkin,
  TonNetwork,
  TonTransactionRequest,
  TonTransactionResult,
  Unsubscribe,
  WalletInfo,
} from '@viberide/shared';
import { noopLogger } from '@viberide/shared';

import { TonNotConnectedError, TonTransactionRejectedError } from './errors';
import { fetchOwnedSkins } from './nft-indexer';
import { buildCommentPayload, cellToBase64, toNano } from './payloads';
import type { TonModule, TonModuleConfig } from './types';

/**
 * Thin browser glue over @tonconnect/ui. Everything unit-testable lives
 * in payloads.ts, nft-indexer.ts and errors.ts; this file only adapts the
 * TON Connect SDK to the TonModule interface, so it is excluded from unit
 * coverage (see vitest.config.ts) and exercised by e2e tests instead.
 */

type TonConnectSdk = typeof TonConnectUiModule;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Price attached to a skin mint request. */
const SKIN_MINT_AMOUNT_NANO = toNano('0.05');

/** Mint requests expire after five minutes. */
const MINT_VALID_FOR_SEC = 300;

export class TonConnectModule implements TonModule {
  /**
   * TON Connect allows one TonConnectUI per page; the instance is created
   * lazily on first use, so merely constructing this module (e.g. from
   * createTonModule) never loads the SDK or touches the DOM. Construct at
   * most one TonConnectModule per page.
   */
  private uiPromise: Promise<TonConnectUI> | null = null;
  private ui: TonConnectUI | null = null;
  private sdk: TonConnectSdk | null = null;
  private wallet: WalletInfo | null = null;
  private readonly listeners = new Set<(wallet: WalletInfo | null) => void>();
  private readonly logger: Logger;

  constructor(
    private readonly config: TonModuleConfig,
    logger: Logger = noopLogger,
  ) {
    this.logger = logger.child({ module: 'ton-connect' });
  }

  async connect(): Promise<WalletInfo> {
    const ui = await this.ensureUi();
    const account = ui.account;
    if (account) {
      return this.mapAccount(account);
    }
    return new Promise<WalletInfo>((resolve, reject) => {
      const cleanups: (() => void)[] = [];
      const cleanup = (): void => {
        for (const dispose of cleanups.splice(0)) {
          dispose();
        }
      };
      cleanups.push(
        ui.onStatusChange((status) => {
          if (status) {
            cleanup();
            resolve(this.mapAccount(status.account));
          }
        }),
        ui.onModalStateChange((state) => {
          if (state.status === 'closed' && state.closeReason === 'action-cancelled') {
            cleanup();
            reject(new TonNotConnectedError('Wallet connection was cancelled'));
          }
        }),
      );
      ui.openModal().catch((error: unknown) => {
        cleanup();
        reject(error instanceof Error ? error : new TonNotConnectedError(describeError(error)));
      });
    });
  }

  async disconnect(): Promise<void> {
    if (!this.ui?.connected) {
      return;
    }
    await this.ui.disconnect();
  }

  getWallet(): WalletInfo | null {
    const account = this.ui?.account;
    return account ? this.mapAccount(account) : this.wallet;
  }

  onWalletChange(callback: (wallet: WalletInfo | null) => void): Unsubscribe {
    this.listeners.add(callback);
    // Kick off lazy initialisation so a session restored by the SDK is
    // surfaced through this callback without an explicit connect() call.
    this.ensureUi().catch((error: unknown) => {
      this.logger.error('TonConnect UI initialisation failed', { error: describeError(error) });
    });
    return () => {
      this.listeners.delete(callback);
    };
  }

  async sendTransaction(request: TonTransactionRequest): Promise<TonTransactionResult> {
    const ui = await this.ensureUi();
    if (!ui.connected) {
      throw new TonNotConnectedError();
    }
    const sendRequest: SendTransactionRequest = {
      validUntil: request.validUntil,
      messages: [
        {
          address: request.toAddress,
          amount: request.amountNano,
          payload: request.payloadBase64,
        },
      ],
    };
    try {
      const result = await ui.sendTransaction(sendRequest);
      this.logger.info('transaction sent');
      return { boc: result.boc };
    } catch (error) {
      if (this.sdk !== null && error instanceof this.sdk.UserRejectsError) {
        throw new TonTransactionRejectedError(undefined, { cause: error });
      }
      throw error;
    }
  }

  async getOwnedSkins(ownerAddress: string): Promise<NftSkin[]> {
    const collectionAddress = this.config.skinCollectionAddress;
    if (collectionAddress === undefined || collectionAddress === '') {
      this.logger.warn('skinCollectionAddress is not configured; returning no skins');
      return [];
    }
    const skins = await fetchOwnedSkins({
      ownerAddress,
      collectionAddress,
      network: this.config.network,
      apiBaseUrl: this.config.apiBaseUrl,
      fetchImpl: this.config.fetchImpl,
    });
    return skins;
  }

  async requestSkinMint(skinName: string): Promise<TonTransactionResult> {
    const collectionAddress = this.config.skinCollectionAddress;
    if (collectionAddress === undefined || collectionAddress === '') {
      throw new Error('TonModuleConfig.skinCollectionAddress is required to mint skins');
    }
    // TODO(manual): replace this comment-based mint request with the real
    // collection mint message schema (opcode, item content, price) once the
    // skin NFT contract is deployed.
    const result = await this.sendTransaction({
      toAddress: collectionAddress,
      amountNano: SKIN_MINT_AMOUNT_NANO.toString(),
      payloadBase64: cellToBase64(buildCommentPayload(`mint:${skinName}`)),
      validUntil: Math.floor(Date.now() / 1000) + MINT_VALID_FOR_SEC,
    });
    return result;
  }

  private ensureUi(): Promise<TonConnectUI> {
    this.uiPromise ??= this.initUi().catch((error: unknown) => {
      // Allow a retry on the next call instead of caching the failure.
      this.uiPromise = null;
      throw error;
    });
    return this.uiPromise;
  }

  private async initUi(): Promise<TonConnectUI> {
    // Loaded on demand so builds with crypto disabled never pull in the SDK.
    const sdk = await import('@tonconnect/ui');
    this.sdk = sdk;
    const ui = new sdk.TonConnectUI({ manifestUrl: this.config.manifestUrl });
    ui.onStatusChange(
      (status) => {
        this.handleStatusChange(status);
      },
      (error) => {
        this.logger.error('TonConnect status subscription failed', {
          error: describeError(error),
        });
      },
    );
    this.ui = ui;
    return ui;
  }

  private handleStatusChange(status: ConnectedWallet | null): void {
    const wallet = status ? this.mapAccount(status.account) : null;
    this.wallet = wallet;
    this.logger.info('wallet status changed', { connected: wallet !== null });
    for (const listener of [...this.listeners]) {
      try {
        listener(wallet);
      } catch (error) {
        this.logger.error('wallet change listener threw', { error: describeError(error) });
      }
    }
  }

  private mapAccount(account: Account): WalletInfo {
    // this.sdk is always set before any code path can produce an Account;
    // the fallback only satisfies the type system (CHAIN.TESTNET === '-3').
    const testnetChainId: string = this.sdk?.CHAIN.TESTNET ?? '-3';
    const network: TonNetwork = account.chain === testnetChainId ? 'testnet' : 'mainnet';
    const address = Address.parseRaw(account.address).toString({
      testOnly: network === 'testnet',
      bounceable: false,
    });
    return { address, network, publicKey: account.publicKey };
  }
}
