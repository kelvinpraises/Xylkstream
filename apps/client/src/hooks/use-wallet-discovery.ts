// use-wallet-discovery.ts — scans on-chain for orphaned/stranded derived wallets
// Wraps discoverWallets in a React Query with manual invalidation.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChain } from "@/providers/chain-provider";
import { useStealthWallet } from "@/providers/stealth-wallet-provider";
import { getSendableTokens } from "@/config/chains";
import { getPublicClient } from "@/utils/streams";
import { discoverWallets } from "@/utils/wallet-scanner";
import { registerIfAbsent, removeEmptyWallets } from "@/store/wallet-registry";
import { useCallback } from "react";

export function useWalletDiscovery() {
  const { chainConfig, chainId } = useChain();
  const { stealthAddress, isReady, getAccountAtIndex } = useStealthWallet();
  const queryClient = useQueryClient();

  const enabled = isReady && !!stealthAddress;

  const { data, isFetching } = useQuery({
    queryKey: ["wallet-discovery", chainId, stealthAddress],
    queryFn: async () => {
      const publicClient = getPublicClient(chainConfig.chain);
      const tokens = getSendableTokens(chainConfig.contracts);

      const getAccount = async (index: number) => {
        const { address } = await getAccountAtIndex(index);
        return { address };
      };

      const wallets = await discoverWallets(
        getAccount,
        publicClient,
        chainConfig.contracts,
        tokens,
        chainId,
      );

      // Auto-register orphaned wallets (on-chain state but not in registry)
      for (const w of wallets) {
        if (!w.isRegistered) {
          registerIfAbsent(chainId, {
            index: w.index,
            address: w.address,
            type: "stream",
            entityId: `orphan-${w.index}`,
            label: `Recovered wallet #${w.index}`,
            createdAt: new Date().toISOString(),
            isOrphan: true,
          });
        }
      }

      // Prune empty wallets from registry
      const activeIndices = new Set(wallets.map((w) => w.index));
      removeEmptyWallets(chainId, activeIndices);

      // Invalidate registry query so UI picks up changes
      queryClient.invalidateQueries({ queryKey: ["wallet-registry"] });

      return wallets;
    },
    enabled,
    staleTime: Infinity, // expensive scan — manual invalidation only
  });

  const wallets = data ?? [];
  const strandedWallets = wallets.filter(
    (w) => w.erc20Balances.length > 0 && !w.hasStreams,
  );

  const rescan = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["wallet-discovery"] });
  }, [queryClient]);

  return {
    wallets,
    strandedWallets,
    isScanning: isFetching,
    rescan,
  };
}
