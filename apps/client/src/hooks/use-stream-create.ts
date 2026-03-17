// use-stream-create.ts — on-chain stream creation hook (public path via Privy, private path via stealth ERC-4337 Safe)

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, encodeFunctionData, parseUnits } from "viem";
import {
  addressDriverAbi,
  erc20Abi,
  calcAmtPerSec,
  packStreamConfig,
  getPublicClient,
} from "@/utils/streams";
import { useChain } from "@/providers/chain-provider";
import { addStream } from "@/store/stream-store";
import { useStealthWallet } from "./use-stealth-wallet";

// --- types ---

export interface SendStreamParams {
  tokenAddress: `0x${string}`;
  recipientAddress: `0x${string}`;
  totalAmount: string;
  tokenDecimals: number;
  durationSeconds: number;
  streamId?: number;
  usePrivacy?: boolean;
  tokenSymbol?: string;
  startTimestamp?: number;
}

export interface SendStreamResult {
  txHash: `0x${string}`;
  receiverAccountId: bigint;
}

// --- hook ---

export function useCreateStream() {
  const queryClient = useQueryClient();
  const { wallets } = useWallets();
  const { chainConfig, chainId } = useChain();
  const stealthWallet = useStealthWallet();

  return useMutation<SendStreamResult, Error, SendStreamParams>({
    mutationFn: async (params) => {
      const {
        tokenAddress,
        recipientAddress,
        totalAmount,
        tokenDecimals,
        durationSeconds,
        streamId = 1,
        usePrivacy = false,
        tokenSymbol = "TOKEN",
        startTimestamp,
      } = params;

      const nowSecs = Math.floor(Date.now() / 1000);
      const streamStart = startTimestamp ?? nowSecs;
      const streamEnd = streamStart + durationSeconds;

      const publicClient = getPublicClient(chainConfig.chain);
      const { contracts } = chainConfig;

      const totalAmountWei = parseUnits(totalAmount, tokenDecimals);
      const tokensPerSec = Number(totalAmount) / durationSeconds;
      const amtPerSec = calcAmtPerSec(tokensPerSec, tokenDecimals);
      const config = packStreamConfig(streamId, amtPerSec, 0, durationSeconds);

      const receiverAccountId = await publicClient.readContract({
        address: contracts.addressDriver,
        abi: addressDriverAbi,
        functionName: "calcAccountId",
        args: [recipientAddress],
      });

      // --- public path: privy embedded wallet ---

      if (!usePrivacy) {
        const embeddedWallet = wallets.find(
          (w) => w.walletClientType === "privy",
        );
        if (!embeddedWallet) {
          throw new Error("No Privy embedded wallet found. Make sure you are logged in.");
        }

        const provider = await embeddedWallet.getEthereumProvider();
        const senderAddress = embeddedWallet.address as `0x${string}`;

        const walletClient = createWalletClient({
          account: senderAddress,
          chain: chainConfig.chain,
          transport: custom(provider),
        });

        const approveHash = await walletClient.writeContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "approve",
          args: [contracts.addressDriver, totalAmountWei],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });

        const setStreamsHash = await walletClient.writeContract({
          address: contracts.addressDriver,
          abi: addressDriverAbi,
          functionName: "setStreams",
          args: [
            tokenAddress,
            [],
            totalAmountWei as unknown as bigint,
            [{ accountId: receiverAccountId, config }],
            0,
            0,
            senderAddress,
          ],
        });
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: setStreamsHash,
        });

        addStream({
          id: crypto.randomUUID(),
          chainId,
          accountId: senderAddress,
          recipientAddress,
          recipientAccountId: receiverAccountId.toString(),
          tokenAddress,
          tokenSymbol,
          totalAmount,
          amtPerSec: amtPerSec.toString(),
          startTimestamp: streamStart,
          endTimestamp: streamEnd,
          isPrivate: false,
          txHash: receipt.transactionHash,
          createdAt: new Date().toISOString(),
        });

        return {
          txHash: receipt.transactionHash,
          receiverAccountId,
        };
      }

      // --- private path: stealth ERC-4337 Safe via WDK UserOperation ---

      if (!stealthWallet.isReady) {
        throw new Error(
          "Stealth wallet is not initialised. Call deriveWallet() before streaming privately.",
        );
      }

      await stealthWallet.approve({
        token: tokenAddress,
        spender: contracts.addressDriver,
        amount: totalAmountWei,
      });

      const stealthAddress = stealthWallet.stealthAddress as `0x${string}`;

      const setStreamsCalldata = encodeFunctionData({
        abi: addressDriverAbi,
        functionName: "setStreams",
        args: [
          tokenAddress,
          [],
          totalAmountWei as unknown as bigint,
          [{ accountId: receiverAccountId, config }],
          0,
          0,
          stealthAddress,
        ],
      });

      const result = await stealthWallet.sendTransaction({
        to: contracts.addressDriver,
        data: setStreamsCalldata,
        value: 0n,
      });

      addStream({
        id: crypto.randomUUID(),
        chainId,
        accountId: stealthAddress,
        recipientAddress,
        recipientAccountId: receiverAccountId.toString(),
        tokenAddress,
        tokenSymbol,
        totalAmount,
        amtPerSec: amtPerSec.toString(),
        startTimestamp: streamStart,
        endTimestamp: streamEnd,
        isPrivate: true,
        txHash: result.hash as string,
        createdAt: new Date().toISOString(),
      });

      return {
        txHash: result.hash as `0x${string}`,
        receiverAccountId,
      };
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["streams"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-balances"] });
    },
  });
}
