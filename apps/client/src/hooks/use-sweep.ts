// use-sweep.ts — transfers token balances from derived wallets back to main stealth wallet

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { encodeFunctionData } from "viem";
import { getPublicClient, erc20Abi } from "@/utils/streams";
import { useChain } from "@/providers/chain-provider";
import { useStealthWallet } from "@/providers/stealth-wallet-provider";
import { getSendableTokens } from "@/config/chains";
import { toast } from "sonner";

interface SweepParams {
  walletIndex: number;
  walletAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
}

interface SweepResult {
  hash: string;
  amount: bigint;
}

export function useSweep() {
  const queryClient = useQueryClient();
  const { chainConfig } = useChain();
  const { stealthAddress, sendTransactionFrom } = useStealthWallet();

  return useMutation<SweepResult, Error, SweepParams>({
    mutationFn: async ({ walletIndex, walletAddress, tokenAddress }) => {
      if (!stealthAddress) throw new Error("Stealth wallet not ready");

      const client = getPublicClient(chainConfig.chain);

      // Read derived wallet's token balance
      const balance = await client.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [walletAddress],
      });

      if (balance === 0n) throw new Error("No balance to sweep");

      // Encode ERC20 transfer to main stealth address
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [stealthAddress as `0x${string}`, balance],
      });

      const result = await sendTransactionFrom(walletIndex, {
        to: tokenAddress,
        data,
      });

      return { hash: result.hash, amount: balance };
    },
    onSuccess: () => {
      toast.success("Funds swept to main wallet");
      queryClient.invalidateQueries({ queryKey: ["tokenBalance"] });
      queryClient.invalidateQueries({ queryKey: ["collectable-scanner"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-discovery"] });
    },
    onError: (err) => {
      toast.error(`Sweep failed: ${err.message}`);
    },
  });
}

interface SweepAllParams {
  wallets: Array<{ index: number; address: `0x${string}` }>;
}

interface SweepAllResult {
  swept: number;
  failed: number;
}

export function useSweepAll() {
  const queryClient = useQueryClient();
  const { chainConfig } = useChain();
  const { stealthAddress, sendTransactionFrom } = useStealthWallet();

  return useMutation<SweepAllResult, Error, SweepAllParams>({
    mutationFn: async ({ wallets }) => {
      if (!stealthAddress) throw new Error("Stealth wallet not ready");

      const client = getPublicClient(chainConfig.chain);
      const tokens = getSendableTokens(chainConfig.contracts);
      let swept = 0;
      let failed = 0;

      for (const wallet of wallets) {
        for (const token of tokens) {
          try {
            const balance = await client.readContract({
              address: token.address,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [wallet.address],
            });

            if (balance === 0n) continue;

            const data = encodeFunctionData({
              abi: erc20Abi,
              functionName: "transfer",
              args: [stealthAddress as `0x${string}`, balance],
            });

            await sendTransactionFrom(wallet.index, {
              to: token.address,
              data,
            });

            swept++;
          } catch {
            failed++;
          }
        }
      }

      return { swept, failed };
    },
    onSuccess: ({ swept, failed }) => {
      if (swept > 0) toast.success(`Swept ${swept} token balance${swept > 1 ? "s" : ""} to main wallet`);
      if (failed > 0) toast.warning(`${failed} sweep${failed > 1 ? "s" : ""} failed`);
      queryClient.invalidateQueries({ queryKey: ["tokenBalance"] });
      queryClient.invalidateQueries({ queryKey: ["collectable-scanner"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-discovery"] });
    },
    onError: (err) => {
      toast.error(`Sweep all failed: ${err.message}`);
    },
  });
}
