export class WalletError extends Error {
  constructor(
    message: string,
    public code: string,
    public accountId?: number,
    public chainId?: string
  ) {
    super(message);
    this.name = 'WalletError';
  }
}

export class WalletGenerationError extends WalletError {
  constructor(message: string, accountId: number, chainId: string) {
    super(message, 'WALLET_GENERATION_ERROR', accountId, chainId);
    this.name = 'WalletGenerationError';
  }
}

export class TransactionSigningError extends WalletError {
  constructor(message: string, accountId: number, chainId: string) {
    super(message, 'TRANSACTION_SIGNING_ERROR', accountId, chainId);
    this.name = 'TransactionSigningError';
  }
}

export class WalletNotFoundError extends WalletError {
  constructor(accountId: number, chainId: string) {
    super(
      `No wallet found for account ${accountId} on chain ${chainId}`,
      'WALLET_NOT_FOUND',
      accountId,
      chainId
    );
    this.name = 'WalletNotFoundError';
  }
}

export class InsufficientGasError extends WalletError {
  constructor(accountId: number, chainId: string) {
    super(
      `Insufficient gas on chain ${chainId} for account ${accountId}`,
      'INSUFFICIENT_GAS',
      accountId,
      chainId
    );
    this.name = 'InsufficientGasError';
  }
}
