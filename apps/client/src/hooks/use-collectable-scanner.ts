// use-collectable-scanner.ts — polls on-chain every 60s for collectable Drips balances
// Scans main stealth address + all derived wallets from the registry

import { useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { getPublicClient, iDripsAbi, addressDriverAbi, erc20Abi } from "@/utils/streams";
import { useChain } from "@/providers/chain-provider";
import { useStealthWallet } from "@/providers/stealth-wallet-provider";
import { getSendableTokens } from "@/config/chains";
import { getRegistry } from "@/store/wallet-registry";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

export interface CollectableToken {
  symbol: string;
  address: `0x${string}`;
  amount: number;
  splittable: bigint;
  collectable: bigint;
  erc20Balance: bigint;
}

export interface CollectableAddress {
  address: `0x${string}`;
  label: string;
  index: number; // -1 = main
  tokens: CollectableToken[];
}

export interface CollectableScanResult {
  addresses: CollectableAddress[];
}

async function scanAddress(
  client: ReturnType<typeof getPublicClient>,
  contracts: { addressDriver: `0x${string}`; dripsProxy: `0x${string}` },
  address: `0x${string}`,
  tokens: Array<{ symbol: string; address: `0x${string}` }>,
  index: number,
): Promise<CollectableToken[]> {
  const accountId = await client.readContract({
    address: contracts.addressDriver,
    abi: addressDriverAbi,
    functionName: "calcAccountId",
    args: [address],
  });

  const isDerived = index !== -1;

  const results = await Promise.all(
    tokens.map(async (token) => {
      const [splittable, collectable, erc20Balance] = await Promise.all([
        client.readContract({
          address: contracts.dripsProxy,
          abi: iDripsAbi,
          functionName: "splittable",
          args: [accountId, token.address],
        }),
        client.readContract({
          address: contracts.dripsProxy,
          abi: iDripsAbi,
          functionName: "collectable",
          args: [accountId, token.address],
        }),
        isDerived
          ? client.readContract({
              address: token.address,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [address],
            })
          : Promise.resolve(0n),
      ]);

      const totalRaw = splittable + collectable + erc20Balance;
      const amount = parseFloat(formatUnits(totalRaw, 18));

      return {
        symbol: token.symbol,
        address: token.address,
        amount,
        splittable,
        collectable,
        erc20Balance,
      } satisfies CollectableToken;
    }),
  );

  return results.filter((t) => t.amount > 0);
}

export function useCollectableScanner() {
  const { chainConfig, chainId } = useChain();
  const { stealthAddress, isReady } = useStealthWallet();
  const navigate = useNavigate();
  const prevTotalRef = useRef<number>(0);

  const enabled = isReady && !!stealthAddress;

  // Include registry length in query key so we re-scan when wallets are added/removed
  const registry = getRegistry(chainId);
  const registryLen = registry.length;

  const { data, isFetching } = useQuery({
    queryKey: ["collectable-scanner", chainId, stealthAddress, registryLen],
    queryFn: async (): Promise<CollectableScanResult> => {
      const client = getPublicClient(chainConfig.chain);
      const tokens = getSendableTokens(chainConfig.contracts);

      // Build address list: main + all derived
      const currentRegistry = getRegistry(chainId);
      const allAddresses: Array<{ address: `0x${string}`; label: string; index: number }> = [
        { address: stealthAddress as `0x${string}`, label: "main", index: -1 },
        ...currentRegistry.map((w) => ({
          address: w.address as `0x${string}`,
          label: w.label ?? `derived-${w.index}`,
          index: w.index,
        })),
      ];

      const results = await Promise.all(
        allAddresses.map(async ({ address, label, index }) => {
          const tokenResults = await scanAddress(client, chainConfig.contracts, address, tokens, index);
          return { address, label, index, tokens: tokenResults } satisfies CollectableAddress;
        }),
      );

      return { addresses: results.filter((a) => a.tokens.length > 0) };
    },
    enabled,
    staleTime: 55_000,
    refetchInterval: 60_000,
  });

  // Flatten for backward compatibility: aggregate across all addresses per token symbol
  const collectableTokens = useMemo(() => {
    if (!data) return [];
    const bySymbol = new Map<string, CollectableToken>();
    for (const addr of data.addresses) {
      for (const t of addr.tokens) {
        const existing = bySymbol.get(t.symbol);
        if (existing) {
          existing.amount += t.amount;
          existing.splittable += t.splittable;
          existing.collectable += t.collectable;
          existing.erc20Balance += t.erc20Balance;
        } else {
          bySymbol.set(t.symbol, { ...t });
        }
      }
    }
    return Array.from(bySymbol.values());
  }, [data]);

  const totalCollectable = useMemo(
    () => collectableTokens.reduce((sum, t) => sum + t.amount, 0),
    [collectableTokens],
  );

  // Toast notification when new collectable funds are detected
  useEffect(() => {
    if (totalCollectable > 0 && totalCollectable > prevTotalRef.current) {
      const increase = totalCollectable - prevTotalRef.current;
      if (prevTotalRef.current > 0) {
        // Only toast on increases after initial load
        toast.info(`${increase.toFixed(2)} new tokens available to collect`, {
          action: { label: "Collect", onClick: () => navigate({ to: "/wallet" }) },
        });
      }
    }
    prevTotalRef.current = totalCollectable;
  }, [totalCollectable, navigate]);

  return {
    collectableTokens,
    totalCollectable,
    isScanning: isFetching,
    scanResult: data ?? { addresses: [] },
  };
}
