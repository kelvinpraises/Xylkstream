// use-stream-reads.ts — React Query hooks for reading on-chain Drips protocol state (polling, no auth)

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getPublicClient,
  iDripsAbi,
  erc20Abi,
  zwerc20Abi,
  calcAccountId,
} from "@/utils/streams";
import { useChain } from "@/providers/chain-provider";

// --- useSplittable ---

export function useSplittable(
  accountId: bigint | undefined,
  tokenAddress: `0x${string}` | undefined,
) {
  const { chainConfig, chainId } = useChain();
  return useQuery({
    queryKey: ["splittable", chainId, accountId?.toString(), tokenAddress],
    queryFn: async () => {
      const client = getPublicClient(chainConfig.chain);
      return client.readContract({
        address: chainConfig.contracts.dripsProxy,
        abi: iDripsAbi,
        functionName: "splittable",
        args: [accountId!, tokenAddress!],
      });
    },
    enabled: !!accountId && !!tokenAddress,
    staleTime: 10_000,
    refetchInterval: 10_000,
  });
}

// --- useCollectable ---

export function useCollectable(
  accountId: bigint | undefined,
  tokenAddress: `0x${string}` | undefined,
) {
  const { chainConfig, chainId } = useChain();
  return useQuery({
    queryKey: ["collectable", chainId, accountId?.toString(), tokenAddress],
    queryFn: async () => {
      const client = getPublicClient(chainConfig.chain);
      return client.readContract({
        address: chainConfig.contracts.dripsProxy,
        abi: iDripsAbi,
        functionName: "collectable",
        args: [accountId!, tokenAddress!],
      });
    },
    enabled: !!accountId && !!tokenAddress,
    staleTime: 10_000,
    refetchInterval: 10_000,
  });
}

// --- useStreamsState ---

export function useStreamsState(
  accountId: bigint | undefined,
  tokenAddress: `0x${string}` | undefined,
) {
  const { chainConfig, chainId } = useChain();
  return useQuery({
    queryKey: ["streamsState", chainId, accountId?.toString(), tokenAddress],
    queryFn: async () => {
      const client = getPublicClient(chainConfig.chain);
      const result = await client.readContract({
        address: chainConfig.contracts.dripsProxy,
        abi: iDripsAbi,
        functionName: "streamsState",
        args: [accountId!, tokenAddress!],
      });
      const [streamsHash, streamsHistoryHash, updateTime, balance, maxEnd] = result;
      return { streamsHash, streamsHistoryHash, updateTime, balance, maxEnd };
    },
    enabled: !!accountId && !!tokenAddress,
    staleTime: 10_000,
    refetchInterval: 10_000,
  });
}

// --- useTokenBalance ---

export function useTokenBalance(
  address: `0x${string}` | undefined,
  tokenAddress: `0x${string}` | undefined,
) {
  const { chainConfig, chainId } = useChain();
  return useQuery({
    queryKey: ["tokenBalance", chainId, address, tokenAddress],
    queryFn: async () => {
      const client = getPublicClient(chainConfig.chain);
      return client.readContract({
        address: tokenAddress!,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address!],
      });
    },
    enabled: !!address && !!tokenAddress,
    staleTime: 10_000,
    refetchInterval: 10_000,
  });
}

// --- useZwTokenBalance ---

export function useZwTokenBalance(
  address: `0x${string}` | undefined,
  zwTokenAddress: `0x${string}` | undefined,
) {
  const { chainConfig, chainId } = useChain();
  return useQuery({
    queryKey: ["zwTokenBalance", chainId, address, zwTokenAddress],
    queryFn: async () => {
      const client = getPublicClient(chainConfig.chain);
      return client.readContract({
        address: zwTokenAddress!,
        abi: zwerc20Abi,
        functionName: "balanceOf",
        args: [address!],
      });
    },
    enabled: !!address && !!zwTokenAddress,
    staleTime: 10_000,
    refetchInterval: 10_000,
  });
}

// --- useProtocolBalances ---

export function useProtocolBalances(tokenAddress: `0x${string}` | undefined) {
  const { chainConfig, chainId } = useChain();
  return useQuery({
    queryKey: ["protocolBalances", chainId, tokenAddress],
    queryFn: async () => {
      const client = getPublicClient(chainConfig.chain);
      const result = await client.readContract({
        address: chainConfig.contracts.dripsProxy,
        abi: iDripsAbi,
        functionName: "balances",
        args: [tokenAddress!],
      });
      const [streamsBalance, splitsBalance] = result;
      return { streamsBalance, splitsBalance };
    },
    enabled: !!tokenAddress,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

// --- useAccountId ---

export function useAccountId(
  driverId: bigint | undefined,
  address: `0x${string}` | undefined,
): bigint | undefined {
  return useMemo(() => {
    if (driverId === undefined || !address) return undefined;
    return calcAccountId(driverId, address);
  }, [driverId, address]);
}

// --- useMerkleState ---

export function useMerkleState(zwTokenAddress: `0x${string}` | undefined) {
  const { chainConfig, chainId } = useChain();
  return useQuery({
    queryKey: ["merkleState", chainId, zwTokenAddress],
    queryFn: async () => {
      const client = getPublicClient(chainConfig.chain);
      const [root, leafCount] = await Promise.all([
        client.readContract({
          address: zwTokenAddress!,
          abi: zwerc20Abi,
          functionName: "root",
          args: [],
        }),
        client.readContract({
          address: zwTokenAddress!,
          abi: zwerc20Abi,
          functionName: "getLeafCount",
          args: [],
        }),
      ]);
      return { root, leafCount };
    },
    enabled: !!zwTokenAddress,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
}

// --- useAllowance ---

export function useAllowance(
  owner: `0x${string}` | undefined,
  spender: `0x${string}` | undefined,
  tokenAddress: `0x${string}` | undefined,
) {
  const { chainConfig, chainId } = useChain();
  return useQuery({
    queryKey: ["allowance", chainId, owner, spender, tokenAddress],
    queryFn: async () => {
      const client = getPublicClient(chainConfig.chain);
      return client.readContract({
        address: tokenAddress!,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner!, spender!],
      });
    },
    enabled: !!owner && !!spender && !!tokenAddress,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}
