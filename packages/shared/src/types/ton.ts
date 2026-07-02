export type TonNetwork = 'mainnet' | 'testnet';

export interface WalletInfo {
  /** User-friendly (EQ…/UQ…) address. */
  readonly address: string;
  readonly network: TonNetwork;
  readonly publicKey?: string;
}

export interface NftSkin {
  readonly id: string;
  readonly name: string;
  readonly imageUrl: string;
  readonly collectionAddress: string;
  readonly itemIndex: number;
}

export interface TonTransactionRequest {
  readonly toAddress: string;
  /** Amount in nanotons as a decimal string. */
  readonly amountNano: string;
  /** Optional BOC payload, base64. */
  readonly payloadBase64?: string;
  /** Unix seconds after which the request expires. */
  readonly validUntil: number;
}

export interface TonTransactionResult {
  /** Signed BOC returned by the wallet. */
  readonly boc: string;
}
