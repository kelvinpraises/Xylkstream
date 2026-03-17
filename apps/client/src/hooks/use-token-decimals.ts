// use-token-decimals.ts — queries ERC-20 decimals on-chain with caching

import { useQuery } from "@tanstack/react-query";
import { getPublicClient, erc20Abi } from "@/utils/streams";
import { useChain } from "@/providers/chain-provider";

export function useTokenDecimals(tokenAddress: `0x${string}` | undefined) {
  const { chainConfig, chainId } = useChain();

  return useQuery({
    queryKey: ["tokenDecimals", chainId, tokenAddress],
    queryFn: async () => {
      const client = getPublicClient(chainConfig.chain);
      return client.readContract({
        address: tokenAddress!,
        abi: erc20Abi,
        functionName: "decimals",
      });
    },
    enabled: !!tokenAddress,
    staleTime: Infinity, // decimals never change
  });
}
