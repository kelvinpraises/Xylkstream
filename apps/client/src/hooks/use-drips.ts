/**
 * use-drips.ts — React hooks for reading on-chain Drips protocol state.
 * All hooks use TanStack Query with polling. No auth required — public chain reads.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getPublicClient,
  getContractAddresses,
  DRIPS_ABI,
  ADDRESS_DRIVER_ABI,
  ERC20_ABI,
  ZWERC20_ABI,
  calcAccountId,
} from "@/lib/drips";

// ---------------------------------------------------------------------------
// useSplittable
// ---------------------------------------------------------------------------

/**
 * Read the splittable balance for an account (tokens received from streams
 * that have been received but not yet split).
 */
export function useSplittable(
  accountId: bigint | undefined,
  tokenAddress: `0x${string}` | undefined,
) {
  return useQuery({
    queryKey: ["splittable", accountId?.toString(), tokenAddress],
    queryFn: async () => {
      const client = getPublicClient();
      const { dripsProxy } = getContractAddresses();
      return client.readContract({
        address: dripsProxy,
        abi: DRIPS_ABI,
        functionName: "splittable",
        args: [accountId!, tokenAddress!],
      });
    },
    enabled: !!accountId && !!tokenAddress,
    staleTime: 10_000,
    refetchInterval: 10_000,
  });
}

// ---------------------------------------------------------------------------
// useCollectable
// ---------------------------------------------------------------------------

/**
 * Read the collectable balance for an account (tokens that have been split
 * and are ready to collect).
 */
export function useCollectable(
  accountId: bigint | undefined,
  tokenAddress: `0x${string}` | undefined,
) {
  return useQuery({
    queryKey: ["collectable", accountId?.toString(), tokenAddress],
    queryFn: async () => {
      const client = getPublicClient();
      const { dripsProxy } = getContractAddresses();
      return client.readContract({
        address: dripsProxy,
        abi: DRIPS_ABI,
        functionName: "collectable",
        args: [accountId!, tokenAddress!],
      });
    },
    enabled: !!accountId && !!tokenAddress,
    staleTime: 10_000,
    refetchInterval: 10_000,
  });
}

// ---------------------------------------------------------------------------
// useStreamsState
// ---------------------------------------------------------------------------

/**
 * Read the full streams state for an account and token.
 * Returns: { streamsHash, streamsHistoryHash, updateTime, balance, maxEnd }
 */
export function useStreamsState(
  accountId: bigint | undefined,
  tokenAddress: `0x${string}` | undefined,
) {
  return useQuery({
    queryKey: ["streamsState", accountId?.toString(), tokenAddress],
    queryFn: async () => {
      const client = getPublicClient();
      const { dripsProxy } = getContractAddresses();
      const result = await client.readContract({
        address: dripsProxy,
        abi: DRIPS_ABI,
        functionName: "streamsState",
        args: [accountId!, tokenAddress!],
      });
      const [streamsHash, streamsHistoryHash, updateTime, balance, maxEnd] =
        result;
      return { streamsHash, streamsHistoryHash, updateTime, balance, maxEnd };
    },
    enabled: !!accountId && !!tokenAddress,
    staleTime: 10_000,
    refetchInterval: 10_000,
  });
}

// ---------------------------------------------------------------------------
// useTokenBalance
// ---------------------------------------------------------------------------

/**
 * Read the ERC20 token balance for any address.
 */
export function useTokenBalance(
  address: `0x${string}` | undefined,
  tokenAddress: `0x${string}` | undefined,
) {
  return useQuery({
    queryKey: ["tokenBalance", address, tokenAddress],
    queryFn: async () => {
      const client = getPublicClient();
      return client.readContract({
        address: tokenAddress!,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address!],
      });
    },
    enabled: !!address && !!tokenAddress,
    staleTime: 10_000,
    refetchInterval: 10_000,
  });
}

// ---------------------------------------------------------------------------
// useZwTokenBalance
// ---------------------------------------------------------------------------

/**
 * Read the ZWERC20 (privacy token) balance for an address.
 * Semantically separate from useTokenBalance for clarity at call sites.
 */
export function useZwTokenBalance(
  address: `0x${string}` | undefined,
  zwTokenAddress: `0x${string}` | undefined,
) {
  return useQuery({
    queryKey: ["zwTokenBalance", address, zwTokenAddress],
    queryFn: async () => {
      const client = getPublicClient();
      return client.readContract({
        address: zwTokenAddress!,
        abi: ZWERC20_ABI,
        functionName: "balanceOf",
        args: [address!],
      });
    },
    enabled: !!address && !!zwTokenAddress,
    staleTime: 10_000,
    refetchInterval: 10_000,
  });
}

// ---------------------------------------------------------------------------
// useProtocolBalances
// ---------------------------------------------------------------------------

/**
 * Read the protocol-level aggregate balances for a token.
 * Returns: { streamsBalance, splitsBalance }
 */
export function useProtocolBalances(tokenAddress: `0x${string}` | undefined) {
  return useQuery({
    queryKey: ["protocolBalances", tokenAddress],
    queryFn: async () => {
      const client = getPublicClient();
      const { dripsProxy } = getContractAddresses();
      const result = await client.readContract({
        address: dripsProxy,
        abi: DRIPS_ABI,
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

// ---------------------------------------------------------------------------
// useAccountId
// ---------------------------------------------------------------------------

/**
 * Derive a Drips account ID from a driver ID and address.
 * Pure computation — no network request, memoized.
 */
export function useAccountId(
  driverId: bigint | undefined,
  address: `0x${string}` | undefined,
): bigint | undefined {
  return useMemo(() => {
    if (!driverId || !address) return undefined;
    return calcAccountId(driverId, address);
  }, [driverId, address]);
}

// ---------------------------------------------------------------------------
// useMerkleState
// ---------------------------------------------------------------------------

/**
 * Read the Merkle tree state from a ZWERC20 contract (for the privacy engine).
 * Returns: { root, leafCount }
 */
export function useMerkleState(zwTokenAddress: `0x${string}` | undefined) {
  return useQuery({
    queryKey: ["merkleState", zwTokenAddress],
    queryFn: async () => {
      const client = getPublicClient();
      const [root, leafCount] = await Promise.all([
        client.readContract({
          address: zwTokenAddress!,
          abi: ZWERC20_ABI,
          functionName: "root",
          args: [],
        }),
        client.readContract({
          address: zwTokenAddress!,
          abi: ZWERC20_ABI,
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

// ---------------------------------------------------------------------------
// useAllowance
// ---------------------------------------------------------------------------

/**
 * Read the ERC20 allowance granted by owner to spender.
 */
export function useAllowance(
  owner: `0x${string}` | undefined,
  spender: `0x${string}` | undefined,
  tokenAddress: `0x${string}` | undefined,
) {
  return useQuery({
    queryKey: ["allowance", owner, spender, tokenAddress],
    queryFn: async () => {
      const client = getPublicClient();
      return client.readContract({
        address: tokenAddress!,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [owner!, spender!],
      });
    },
    enabled: !!owner && !!spender && !!tokenAddress,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}
