// use-stream-collect.ts — 3-step Drips collection pipeline hook (receiveStreams → split → collect)

import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, encodeFunctionData } from "viem";
import {
  iDripsAbi,
  addressDriverAbi,
  getPublicClient,
} from "@/utils/streams";
import { useChain } from "@/providers/chain-provider";
import { useStealthWallet } from "./use-stealth-wallet";

// --- types ---

export type CollectStep =
  | "idle"
  | "receiveStreams"
  | "split"
  | "collect"
  | "completed"
  | "error";

export interface CollectParams {
  accountId: bigint;
  tokenAddress: `0x${string}`;
  transferTo: `0x${string}`;
  maxCycles?: number;
  splitReceivers?: Array<{ accountId: bigint; weight: number }>;
  usePrivacy?: boolean;
}

export interface CollectResult {
  receiveTxHash: `0x${string}`;
  splitTxHash: `0x${string}`;
  collectTxHash: `0x${string}`;
  step: "completed";
}

export type ForceCollectStep = "idle" | "forceCollect" | "completed" | "error";

export interface ForceCollectParams {
  tokenAddress: `0x${string}`;
  senderAccountId: bigint;
  transferTo: `0x${string}`;
  yieldManagerAddress?: `0x${string}`;
  strategyAddress?: `0x${string}`;
  data?: `0x${string}`;
}

export interface ForceCollectResult {
  collectTxHash: `0x${string}`;
  step: "completed";
}

// --- useCollectStream ---

export function useCollectStream() {
  const queryClient = useQueryClient();
  const { wallets } = useWallets();
  const { chainConfig } = useChain();
  const stealthWallet = useStealthWallet();

  const currentStep = useRef<CollectStep>("idle");

  const mutation = useMutation<CollectResult, Error, CollectParams>({
    mutationFn: async (params) => {
      const {
        accountId,
        tokenAddress,
        transferTo,
        maxCycles = 100,
        splitReceivers = [],
        usePrivacy = false,
      } = params;

      const publicClient = getPublicClient(chainConfig.chain);
      const { contracts } = chainConfig;

      const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
      if (!embeddedWallet)
        throw new Error("No Privy embedded wallet found. Make sure you are logged in.");

      const provider = await embeddedWallet.getEthereumProvider();
      const walletClient = createWalletClient({
        account: embeddedWallet.address as `0x${string}`,
        chain: chainConfig.chain,
        transport: custom(provider),
      });

      // step 1: receiveStreams — permissionless
      currentStep.current = "receiveStreams";
      const receiveTxHash = await walletClient.writeContract({
        address: contracts.dripsProxy,
        abi: iDripsAbi,
        functionName: "receiveStreams",
        args: [accountId, tokenAddress, maxCycles],
      });
      await publicClient.waitForTransactionReceipt({ hash: receiveTxHash });

      // step 2: split — permissionless
      currentStep.current = "split";
      const splitTxHash = await walletClient.writeContract({
        address: contracts.dripsProxy,
        abi: iDripsAbi,
        functionName: "split",
        args: [accountId, tokenAddress, splitReceivers],
      });
      await publicClient.waitForTransactionReceipt({ hash: splitTxHash });

      // step 3: collect — must come FROM the account owner
      currentStep.current = "collect";
      let collectTxHash: `0x${string}`;

      if (usePrivacy) {
        if (!stealthWallet.isReady) {
          throw new Error(
            "Stealth wallet is not initialised. Call deriveWallet() before collecting privately.",
          );
        }

        const collectCalldata = encodeFunctionData({
          abi: addressDriverAbi,
          functionName: "collect",
          args: [tokenAddress, transferTo],
        });

        const result = await stealthWallet.sendTransaction({
          to: contracts.addressDriver,
          data: collectCalldata,
          value: 0n,
        });

        collectTxHash = result.hash as `0x${string}`;
      } else {
        collectTxHash = await walletClient.writeContract({
          address: contracts.addressDriver,
          abi: addressDriverAbi,
          functionName: "collect",
          args: [tokenAddress, transferTo],
        });
        await publicClient.waitForTransactionReceipt({ hash: collectTxHash });
      }

      currentStep.current = "completed";

      return {
        receiveTxHash,
        splitTxHash,
        collectTxHash,
        step: "completed" as const,
      };
    },

    onError: () => {
      currentStep.current = "error";
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["splittable"] });
      queryClient.invalidateQueries({ queryKey: ["collectable"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-balances"] });
    },
  });

  return { ...mutation, currentStep };
}

// --- useForceCollectStream ---

export function useForceCollectStream() {
  const queryClient = useQueryClient();
  const { wallets } = useWallets();
  const { chainConfig } = useChain();

  const currentStep = useRef<ForceCollectStep>("idle");

  const mutation = useMutation<ForceCollectResult, Error, ForceCollectParams>({
    mutationFn: async (params) => {
      const {
        tokenAddress,
        senderAccountId,
        transferTo,
        yieldManagerAddress = "0x0000000000000000000000000000000000000000",
        strategyAddress = "0x0000000000000000000000000000000000000000",
        data = "0x",
      } = params;

      const publicClient = getPublicClient(chainConfig.chain);
      const { contracts } = chainConfig;

      const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
      if (!embeddedWallet)
        throw new Error("No Privy embedded wallet found. Make sure you are logged in.");

      const provider = await embeddedWallet.getEthereumProvider();
      const walletClient = createWalletClient({
        account: embeddedWallet.address as `0x${string}`,
        chain: chainConfig.chain,
        transport: custom(provider),
      });

      currentStep.current = "forceCollect";

      const collectTxHash = await walletClient.writeContract({
        address: contracts.addressDriver,
        abi: addressDriverAbi,
        functionName: "forceCollect",
        args: [
          tokenAddress,
          yieldManagerAddress,
          strategyAddress,
          senderAccountId,
          transferTo,
          data,
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash: collectTxHash });

      currentStep.current = "completed";

      return {
        collectTxHash,
        step: "completed" as const,
      };
    },

    onError: () => {
      currentStep.current = "error";
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["splittable"] });
      queryClient.invalidateQueries({ queryKey: ["collectable"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-balances"] });
    },
  });

  return { ...mutation, currentStep };
}
