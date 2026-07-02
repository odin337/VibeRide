import { describe, expect, it } from 'vitest';

import {
  TonApiError,
  TonDisabledError,
  TonError,
  TonNotConnectedError,
  TonTransactionRejectedError,
} from './errors';

describe('errors', () => {
  it.each([
    [new TonDisabledError(), 'TonDisabledError', 'TON_DISABLED'],
    [new TonNotConnectedError(), 'TonNotConnectedError', 'TON_NOT_CONNECTED'],
    [new TonTransactionRejectedError(), 'TonTransactionRejectedError', 'TON_TX_REJECTED'],
    [new TonApiError('boom'), 'TonApiError', 'TON_API_ERROR'],
  ] as const)('%s has name %s and code %s', (error, name, code) => {
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(TonError);
    expect(error.name).toBe(name);
    expect(error.code).toBe(code);
    expect(error.message.length).toBeGreaterThan(0);
  });

  it('carries default messages', () => {
    expect(new TonDisabledError().message).toBe('TON integration is disabled by feature flag');
    expect(new TonNotConnectedError().message).toBe('No TON wallet is connected');
    expect(new TonTransactionRejectedError().message).toBe(
      'Transaction was rejected in the wallet',
    );
  });

  it('accepts custom messages', () => {
    expect(new TonDisabledError('nope').message).toBe('nope');
    expect(new TonNotConnectedError('connect first').message).toBe('connect first');
    expect(new TonTransactionRejectedError('user said no').message).toBe('user said no');
    expect(new TonApiError('http 502').message).toBe('http 502');
  });

  it('preserves the cause chain', () => {
    const cause = new Error('socket hang up');
    const error = new TonApiError('TonAPI request failed', { cause });
    expect(error.cause).toBe(cause);

    const rejected = new TonTransactionRejectedError(undefined, { cause });
    expect(rejected.cause).toBe(cause);
    expect(rejected.message).toBe('Transaction was rejected in the wallet');
  });

  it('supports discrimination by code across the hierarchy', () => {
    const errors: TonError[] = [new TonDisabledError(), new TonApiError('x')];
    const codes = errors.map((error) => error.code);
    expect(codes).toEqual(['TON_DISABLED', 'TON_API_ERROR']);
  });
});
