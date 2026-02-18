export interface IAccountData {
  id: number;
  chain: string; // e.g., "base", "ethereum", "arbitrum"
  privy_wallet_id?: string;
}

export interface IWalletGenerationResult {
  address: string;
  chain: string;
  publicKey: string;
}

export interface ISignatureResult {
  signature: string;
  encoding: "rlp" | "base64";
}

export interface IEVMTransactionRequest {
  to: string;
  value?: string;
  data?: string;
  chainId: number;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: number;
}

export interface IEVMTransferRequest {
  type: "native" | "erc20";
  to: string;
  value?: string; // For native transfers (in hex)
  amount?: string; // For ERC-20 transfers (in token units)
  contractAddress?: string; // For ERC-20 transfers
  decimals?: number; // For ERC-20 transfers
  chainId?: number;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: number;
}

export interface WalletError {
  code: string;
  chain: string;
  accountId: number;
}
