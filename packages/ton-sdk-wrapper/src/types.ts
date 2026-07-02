import type {
  NftSkin,
  TonNetwork,
  TonTransactionRequest,
  TonTransactionResult,
  Unsubscribe,
  WalletInfo,
} from '@viberide/shared';

/**
 * The single interface behind which ALL TON functionality lives. The game
 * only ever talks to a TonModule — never to TON Connect or @ton/core
 * directly — so the app runs with crypto disabled (DisabledTonModule) and
 * tests never touch a network (MockTonModule).
 */
export interface TonModule {
  /** Opens the wallet connection flow and resolves once a wallet is connected. */
  connect(): Promise<WalletInfo>;
  /** Ends the current wallet session (no-op when not connected). */
  disconnect(): Promise<void>;
  /** Currently connected wallet, or null. */
  getWallet(): WalletInfo | null;
  /** Subscribes to wallet session changes; returns an unsubscribe function. */
  onWalletChange(callback: (wallet: WalletInfo | null) => void): Unsubscribe;
  /** Asks the wallet to sign and send a transaction. */
  sendTransaction(request: TonTransactionRequest): Promise<TonTransactionResult>;
  /** Lists skin NFTs owned by the given address. */
  getOwnedSkins(ownerAddress: string): Promise<NftSkin[]>;
  /** Sends a mint-request transaction for the named skin. */
  requestSkinMint(skinName: string): Promise<TonTransactionResult>;
}

export interface TonModuleConfig {
  readonly network: TonNetwork;
  /** Publicly reachable TON Connect manifest URL. */
  readonly manifestUrl: string;
  /** Overrides the default TonAPI base URL (useful for tests/proxies). */
  readonly apiBaseUrl?: string;
  /** NFT collection holding the skins; unset disables collection filtering. */
  readonly skinCollectionAddress?: string;
  /** Injectable fetch for tests; defaults to globalThis.fetch. */
  readonly fetchImpl?: typeof fetch;
}
