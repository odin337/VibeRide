import { Address, Cell } from '@ton/core';
import { describe, expect, it } from 'vitest';

import {
  buildCommentPayload,
  buildJettonTransferPayload,
  buildNftTransferPayload,
  cellToBase64,
  COMMENT_OP,
  fromNano,
  JETTON_TRANSFER_OP,
  NFT_TRANSFER_OP,
  toNano,
} from './payloads';

const recipient = Address.parseRaw(`0:${'11'.repeat(32)}`);
const responder = Address.parseRaw(`0:${'22'.repeat(32)}`);

describe('buildCommentPayload', () => {
  it('stores op 0 followed by the tail string', () => {
    const slice = buildCommentPayload('gg wp').beginParse();
    expect(slice.loadUint(32)).toBe(COMMENT_OP);
    expect(slice.loadStringTail()).toBe('gg wp');
  });

  it('round-trips comments longer than one cell (snake encoding)', () => {
    const long = 'viberide-'.repeat(40);
    const slice = buildCommentPayload(long).beginParse();
    expect(slice.loadUint(32)).toBe(COMMENT_OP);
    expect(slice.loadStringTail()).toBe(long);
  });

  it('round-trips an empty comment', () => {
    const slice = buildCommentPayload('').beginParse();
    expect(slice.loadUint(32)).toBe(COMMENT_OP);
    expect(slice.loadStringTail()).toBe('');
  });
});

describe('buildJettonTransferPayload', () => {
  it('produces a TEP-74 transfer body with all fields set', () => {
    const cell = buildJettonTransferPayload({
      amount: 123_456_789n,
      toAddress: recipient.toString(),
      responseAddress: responder.toString(),
      forwardTonAmount: 1n,
      comment: 'skin trade',
    });

    const slice = cell.beginParse();
    expect(slice.loadUint(32)).toBe(JETTON_TRANSFER_OP);
    expect(slice.loadUintBig(64)).toBe(0n);
    expect(slice.loadCoins()).toBe(123_456_789n);
    expect(slice.loadAddress().equals(recipient)).toBe(true);
    expect(slice.loadAddress().equals(responder)).toBe(true);
    expect(slice.loadMaybeRef()).toBeNull();
    expect(slice.loadCoins()).toBe(1n);
    expect(slice.loadBit()).toBe(true);

    const forward = slice.loadRef().beginParse();
    expect(forward.loadUint(32)).toBe(COMMENT_OP);
    expect(forward.loadStringTail()).toBe('skin trade');
    slice.endParse();
  });

  it('defaults forward amount to 0 and stores an empty inline forward payload', () => {
    const cell = buildJettonTransferPayload({
      amount: 5n,
      toAddress: recipient.toString(),
      responseAddress: responder.toString(),
    });

    const slice = cell.beginParse();
    expect(slice.loadUint(32)).toBe(JETTON_TRANSFER_OP);
    expect(slice.loadUintBig(64)).toBe(0n);
    expect(slice.loadCoins()).toBe(5n);
    slice.loadAddress();
    slice.loadAddress();
    expect(slice.loadMaybeRef()).toBeNull();
    expect(slice.loadCoins()).toBe(0n);
    expect(slice.loadBit()).toBe(false);
    slice.endParse();
  });

  it('rejects malformed addresses', () => {
    expect(() =>
      buildJettonTransferPayload({
        amount: 1n,
        toAddress: 'not-an-address',
        responseAddress: responder.toString(),
      }),
    ).toThrow();
  });
});

describe('buildNftTransferPayload', () => {
  it('produces a TEP-62 transfer body with a comment forward payload', () => {
    const cell = buildNftTransferPayload({
      newOwnerAddress: recipient.toString(),
      responseAddress: responder.toString(),
      forwardTonAmount: 10_000_000n,
      comment: 'enjoy the skin',
    });

    const slice = cell.beginParse();
    expect(slice.loadUint(32)).toBe(NFT_TRANSFER_OP);
    expect(slice.loadUintBig(64)).toBe(0n);
    expect(slice.loadAddress().equals(recipient)).toBe(true);
    expect(slice.loadAddress().equals(responder)).toBe(true);
    expect(slice.loadMaybeRef()).toBeNull();
    expect(slice.loadCoins()).toBe(10_000_000n);
    expect(slice.loadBit()).toBe(true);

    const forward = slice.loadRef().beginParse();
    expect(forward.loadUint(32)).toBe(COMMENT_OP);
    expect(forward.loadStringTail()).toBe('enjoy the skin');
    slice.endParse();
  });

  it('defaults forward amount to 0 without a comment', () => {
    const cell = buildNftTransferPayload({
      newOwnerAddress: recipient.toString(),
      responseAddress: responder.toString(),
    });

    const slice = cell.beginParse();
    expect(slice.loadUint(32)).toBe(NFT_TRANSFER_OP);
    expect(slice.loadUintBig(64)).toBe(0n);
    slice.loadAddress();
    slice.loadAddress();
    expect(slice.loadMaybeRef()).toBeNull();
    expect(slice.loadCoins()).toBe(0n);
    expect(slice.loadBit()).toBe(false);
    slice.endParse();
  });
});

describe('nano conversions', () => {
  it('toNano converts TON decimal strings and numbers deterministically', () => {
    expect(toNano('0.05')).toBe(50_000_000n);
    expect(toNano('1')).toBe(1_000_000_000n);
    expect(toNano(2)).toBe(2_000_000_000n);
    expect(toNano('0.000000001')).toBe(1n);
  });

  it('fromNano is the inverse of toNano', () => {
    expect(fromNano(50_000_000n)).toBe('0.05');
    expect(fromNano(1_500_000_000n)).toBe('1.5');
    expect(fromNano(toNano('123.456789'))).toBe('123.456789');
  });
});

describe('cellToBase64', () => {
  it('serialises to a BOC that parses back to an identical cell', () => {
    const cell = buildCommentPayload('mint:Neon Rider');
    const restored = Cell.fromBase64(cellToBase64(cell));
    expect(restored.equals(cell)).toBe(true);
    expect(restored.hash().toString('hex')).toBe(cell.hash().toString('hex'));
  });
});
