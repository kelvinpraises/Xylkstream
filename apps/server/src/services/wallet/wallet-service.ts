import {
  IEVMTransactionRequest,
  IEVMTransferRequest,
  ISignatureResult,
} from "@/types/account";

import {
  createEVMTransferRequest,
  signEVMTransaction,
} from "@/services/wallet/chains/evm/evm-wallet";
import { validateAccountId } from "@/services/wallet/shared/providers/base-provider";
import { createPrivyClient } from "@/services/wallet/shared/providers/privy-provider";
import { walletData } from "@/services/wallet/shared/wallet-data";

const client = createPrivyClient();

/**
 * Wallet Service - EVM-only wallet management for Tempo chain
 */
export const walletService = {
  /**
   * Get wallet address for an account
   */
  async getAddress(accountId: number): Promise<string> {
    validateAccountId(accountId);
    return await walletData.getWalletAddressOrThrow(accountId);
  },

  /**
   * Sign a transaction
   */
  async signTransaction(
    accountId: number,
    transaction: IEVMTransactionRequest,
  ): Promise<ISignatureResult> {
    validateAccountId(accountId);

    const privyWalletId = await walletData.getPrivyWalletIdOrThrow(accountId);

    return await signEVMTransaction(
      accountId,
      transaction,
      privyWalletId,
      client,
    );
  },

  /**
   * Transfer tokens or native currency
   */
  async transfer(
    accountId: number,
    transferRequest: IEVMTransferRequest,
  ): Promise<ISignatureResult> {
    validateAccountId(accountId);

    const privyWalletId = await walletData.getPrivyWalletIdOrThrow(accountId);
    const rawTransaction = createEVMTransferRequest(transferRequest);

    return await signEVMTransaction(
      accountId,
      rawTransaction,
      privyWalletId,
      client,
    );
  },
};
