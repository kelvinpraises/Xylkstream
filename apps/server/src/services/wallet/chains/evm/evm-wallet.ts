import { PrivyClient } from "@privy-io/server-auth";
import {
  defineChain,
  encodeFunctionData,
  erc20Abi,
  parseUnits,
  type Address,
  type Chain,
} from "viem";

import { validateAccountId } from "@/services/wallet/shared/providers/base-provider";
import { getAuthConfig } from "@/services/wallet/shared/providers/privy-provider";
import {
  WalletGenerationError,
  TransactionSigningError,
} from "@/services/wallet/shared/errors";
import type {
  IEVMTransactionRequest,
  IEVMTransferRequest,
  ISignatureResult,
} from "@/types/account";

const tempo = defineChain({
  id: 42431,
  name: "Tempo",
  nativeCurrency: { name: "Tempo", symbol: "TEMPO", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.moderato.tempo.xyz"] },
  },
});

export function getEVMChain(): Chain {
  return tempo;
}

export async function generateEVMWallet(
  accountId: number,
  privyClient: PrivyClient,
): Promise<{ address: string; privyWalletId: string }> {
  validateAccountId(accountId);

  try {
    const { authKeyId } = getAuthConfig();

    const wallet = await privyClient.walletApi.createWallet({
      chainType: "ethereum",
      owner: {
        publicKey: authKeyId,
      },
    });

    return {
      address: wallet.address,
      privyWalletId: wallet.id,
    };
  } catch (error) {
    throw new WalletGenerationError(
      `Failed to generate EVM wallet for account ${accountId}: ${error}`,
      accountId,
      "tempo",
    );
  }
}

export async function getEVMWalletAddress(
  accountId: number,
  privyWalletId: string,
  privyClient: PrivyClient,
): Promise<string> {
  validateAccountId(accountId);

  try {
    const wallet = await privyClient.walletApi.getWallet({ id: privyWalletId });
    return wallet.address;
  } catch (error) {
    throw new Error(`Failed to get EVM wallet address: ${error}`);
  }
}

export async function signEVMTransaction(
  accountId: number,
  transaction: IEVMTransactionRequest,
  privyWalletId: string,
  privyClient: PrivyClient,
): Promise<ISignatureResult> {
  validateAccountId(accountId);

  try {
    const result = await privyClient.walletApi.ethereum.signTransaction({
      walletId: privyWalletId,
      transaction: {
        to: transaction.to as `0x${string}`,
        value: (transaction.value || "0x0") as `0x${string}`,
        chainId: transaction.chainId,
        data: transaction.data as `0x${string}` | undefined,
        gasLimit: transaction.gasLimit as `0x${string}` | undefined,
        gasPrice: transaction.gasPrice as `0x${string}` | undefined,
        maxFeePerGas: transaction.maxFeePerGas as `0x${string}` | undefined,
        maxPriorityFeePerGas:
          transaction.maxPriorityFeePerGas as `0x${string}` | undefined,
        nonce: transaction.nonce ? Number(transaction.nonce) : undefined,
      },
    });

    return {
      signature: result.signedTransaction,
      encoding: "rlp",
    };
  } catch (error) {
    throw new TransactionSigningError(
      `Failed to sign EVM transaction for account ${accountId}: ${error}`,
      accountId,
      "tempo",
    );
  }
}

export function createEVMTransferRequest(
  transfer: IEVMTransferRequest,
): IEVMTransactionRequest {
  const chain = getEVMChain();

  if (transfer.type === "native") {
    return {
      to: transfer.to,
      value: transfer.value,
      chainId: chain.id,
      gasLimit: transfer.gasLimit,
      gasPrice: transfer.gasPrice,
      maxFeePerGas: transfer.maxFeePerGas,
      maxPriorityFeePerGas: transfer.maxPriorityFeePerGas,
      nonce: transfer.nonce,
    };
  } else {
    if (!transfer.decimals && transfer.decimals !== 0) {
      throw new Error("Token decimals must be specified for ERC-20 transfers");
    }

    const amountInUnits = parseUnits(transfer.amount!, transfer.decimals);
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [transfer.to as Address, amountInUnits],
    });

    return {
      to: transfer.contractAddress!,
      value: "0x0",
      data: data,
      chainId: chain.id,
      gasLimit: transfer.gasLimit,
      gasPrice: transfer.gasPrice,
      maxFeePerGas: transfer.maxFeePerGas,
      maxPriorityFeePerGas: transfer.maxPriorityFeePerGas,
      nonce: transfer.nonce,
    };
  }
}
