// use-collectable-scanner.ts — polls on-chain every 60s for collectable Drips balances

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { getPublicClient, iDripsAbi, addressDriverAbi } from "@/utils/streams";
import { useChain } from "@/providers/chain-provider";
import { useStealthWallet } from "@/providers/stealth-wallet-provider";
import { getSendableTokens } from "@/config/chains";

export interface CollectableToken {
  symbol: string;
  address: `0x${string}`;
  amount: number;
  splittable: bigint;
  collectable: bigint;
}

export function useCollectableScanner() {
  const { chainConfig, chainId } = useChain();
  const { stealthAddress, isReady } = useStealthWallet();

  const enabled = isReady && !!stealthAddress;

  const { data, isFetching } = useQuery({
    queryKey: ["collectable-scanner", chainId, stealthAddress],
    queryFn: async (): Promise<CollectableToken[]> => {
      const client = getPublicClient(chainConfig.chain);
      const tokens = getSendableTokens(chainConfig.contracts);

      // Resolve the on-chain accountId for the stealth address via addressDriver
      const accountId = await client.readContract({
        address: chainConfig.contracts.addressDriver,
        abi: addressDriverAbi,
        functionName: "calcAccountId",
        args: [stealthAddress as `0x${string}`],
      });

      const results = await Promise.all(
        tokens.map(async (token) => {
          const [splittable, collectable] = await Promise.all([
            client.readContract({
              address: chainConfig.contracts.dripsProxy,
              abi: iDripsAbi,
              functionName: "splittable",
              args: [accountId, token.address],
            }),
            client.readContract({
              address: chainConfig.contracts.dripsProxy,
              abi: iDripsAbi,
              functionName: "collectable",
              args: [accountId, token.address],
            }),
          ]);

          const totalRaw = splittable + collectable;
          const amount = parseFloat(formatUnits(totalRaw, 18));

          return {
            symbol: token.symbol,
            address: token.address,
            amount,
            splittable,
            collectable,
          } satisfies CollectableToken;
        }),
      );

      return results.filter((t) => t.amount > 0);
    },
    enabled,
    staleTime: 55_000,
    refetchInterval: 60_000,
  });

  const collectableTokens = useMemo(() => data ?? [], [data]);

  const totalCollectable = useMemo(
    () => collectableTokens.reduce((sum, t) => sum + t.amount, 0),
    [collectableTokens],
  );

  return {
    collectableTokens,
    totalCollectable,
    isScanning: isFetching,
  };
}
