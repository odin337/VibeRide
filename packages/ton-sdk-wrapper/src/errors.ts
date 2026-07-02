export type TonErrorCode =
  'TON_DISABLED' | 'TON_NOT_CONNECTED' | 'TON_TX_REJECTED' | 'TON_API_ERROR';

/** Base class for every error thrown by this package — catch this to handle them all. */
export abstract class TonError extends Error {
  constructor(
    message: string,
    public readonly code: TonErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** Thrown by DisabledTonModule: the TON feature flag is off. */
export class TonDisabledError extends TonError {
  constructor(message = 'TON integration is disabled by feature flag', options?: ErrorOptions) {
    super(message, 'TON_DISABLED', options);
    this.name = 'TonDisabledError';
  }
}

/** Thrown when an operation requires a connected wallet and there is none. */
export class TonNotConnectedError extends TonError {
  constructor(message = 'No TON wallet is connected', options?: ErrorOptions) {
    super(message, 'TON_NOT_CONNECTED', options);
    this.name = 'TonNotConnectedError';
  }
}

/** Thrown when the user rejects a transaction in their wallet. */
export class TonTransactionRejectedError extends TonError {
  constructor(message = 'Transaction was rejected in the wallet', options?: ErrorOptions) {
    super(message, 'TON_TX_REJECTED', options);
    this.name = 'TonTransactionRejectedError';
  }
}

/** Thrown when the TON HTTP API is unreachable or returns an unusable response. */
export class TonApiError extends TonError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'TON_API_ERROR', options);
    this.name = 'TonApiError';
  }
}
