import { Address, beginCell } from '@ton/core';
import type { Builder, Cell } from '@ton/core';

/** Deterministic TON ⇄ nanoton conversions, re-exported from @ton/core. */
export { fromNano, toNano } from '@ton/core';

/** TEP-74 `transfer#0f8a7ea5` opcode. */
export const JETTON_TRANSFER_OP = 0x0f8a7ea5;

/** TEP-62 `transfer#5fcc3d14` opcode. */
export const NFT_TRANSFER_OP = 0x5fcc3d14;

/** Plain-text comment opcode (op 0 followed by a snake-encoded string tail). */
export const COMMENT_OP = 0;

/** All payloads use query_id 0 — the game never correlates contract responses. */
const QUERY_ID = 0;

/** Serialises a cell into a base64 BOC, the format TonTransactionRequest expects. */
export function cellToBase64(cell: Cell): string {
  return cell.toBoc().toString('base64');
}

/** Builds a plain-text comment payload (op 0, tail string). */
export function buildCommentPayload(text: string): Cell {
  return beginCell().storeUint(COMMENT_OP, 32).storeStringTail(text).endCell();
}

/**
 * Stores a TL-B `forward_payload:(Either Cell ^Cell)`: bit 0 with an empty
 * inline payload, or bit 1 with the comment carried in a reference cell.
 */
function storeForwardPayload(builder: Builder, comment: string | undefined): Builder {
  if (comment !== undefined) {
    return builder.storeBit(1).storeRef(buildCommentPayload(comment));
  }
  return builder.storeBit(0);
}

export interface JettonTransferParams {
  /** Jetton amount in the token's base (indivisible) units. */
  readonly amount: bigint;
  /** Recipient owner address (not their jetton wallet address). */
  readonly toAddress: string;
  /** Where excess TON and the transfer notification response are sent. */
  readonly responseAddress: string;
  /** Nanotons forwarded to the recipient with the notification (default 0). */
  readonly forwardTonAmount?: bigint;
  /** Optional plain-text comment delivered as the forward payload. */
  readonly comment?: string;
}

/**
 * Builds a TEP-74 jetton `transfer#0f8a7ea5` message body.
 * custom_payload is always empty — the game has no use for it.
 */
export function buildJettonTransferPayload(params: JettonTransferParams): Cell {
  const builder = beginCell()
    .storeUint(JETTON_TRANSFER_OP, 32)
    .storeUint(QUERY_ID, 64)
    .storeCoins(params.amount)
    .storeAddress(Address.parse(params.toAddress))
    .storeAddress(Address.parse(params.responseAddress))
    .storeMaybeRef(null)
    .storeCoins(params.forwardTonAmount ?? 0n);
  return storeForwardPayload(builder, params.comment).endCell();
}

export interface NftTransferParams {
  /** Address ownership of the NFT item is transferred to. */
  readonly newOwnerAddress: string;
  /** Where excess TON and the ownership-assigned response are sent. */
  readonly responseAddress: string;
  /** Nanotons forwarded to the new owner with the notification (default 0). */
  readonly forwardTonAmount?: bigint;
  /** Optional plain-text comment delivered as the forward payload. */
  readonly comment?: string;
}

/**
 * Builds a TEP-62 NFT `transfer#5fcc3d14` message body.
 * custom_payload is always empty — the game has no use for it.
 */
export function buildNftTransferPayload(params: NftTransferParams): Cell {
  const builder = beginCell()
    .storeUint(NFT_TRANSFER_OP, 32)
    .storeUint(QUERY_ID, 64)
    .storeAddress(Address.parse(params.newOwnerAddress))
    .storeAddress(Address.parse(params.responseAddress))
    .storeMaybeRef(null)
    .storeCoins(params.forwardTonAmount ?? 0n);
  return storeForwardPayload(builder, params.comment).endCell();
}
