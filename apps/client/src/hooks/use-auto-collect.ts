// use-auto-collect.ts — watches collectable balances and auto-collects when enabled

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { useStealthWallet } from "@/providers/stealth-wallet-provider";
import { useChain } from "@/providers/chain-provider";
import { useCollectableScanner } from "@/hooks/use-collectable-scanner";
import { useCollectStream } from "@/hooks/use-stream-collect";
import { getPublicClient, addressDriverAbi } from "@/utils/streams";

const AUTO_COLLECT_KEY = "xylkstream_auto_collect";

// --- useAutoCollectSetting ---

export function useAutoCollectSetting() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(AUTO_COLLECT_KEY);
      if (stored === null) return true;
      return stored === "true";
    } catch {
      return true;
    }
  });

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(AUTO_COLLECT_KEY, String(next));
      } catch {
        // storage unavailable — state still updates in memory
      }
      return next;
    });
  }, []);

  const set = useCallback((value: boolean) => {
    setEnabled(value);
    try {
      localStorage.setItem(AUTO_COLLECT_KEY, String(value));
    } catch {
      // ignore
    }
  }, []);

  return { enabled, toggle, set };
}

// --- useAutoCollect ---

export function useAutoCollect() {
  const { enabled } = useAutoCollectSetting();
  const { collectableTokens } = useCollectableScanner();
  const { stealthAddress, isReady } = useStealthWallet();
  const { chainConfig } = useChain();
  const { mutateAsync: collectStream } = useCollectStream();

  useEffect(() => {
    if (!enabled) return;
    if (!isReady || !stealthAddress) return;
    if (collectableTokens.length === 0) return;

    let cancelled = false;

    async function runAutoCollect() {
      const client = getPublicClient(chainConfig.chain);

      // Resolve accountId once
      const accountId = await client.readContract({
        address: chainConfig.contracts.addressDriver,
        abi: addressDriverAbi,
        functionName: "calcAccountId",
        args: [stealthAddress as `0x${string}`],
      });

      for (const token of collectableTokens) {
        if (cancelled) break;

        const label = `${token.amount.toFixed(4)} ${token.symbol}`;
        toast.loading(`Collecting ${label}...`, { id: `auto-collect-${token.address}` });

        try {
          await collectStream({
            accountId,
            tokenAddress: token.address,
            transferTo: stealthAddress as `0x${string}`,
            usePrivacy: true,
          });

          if (!cancelled) {
            toast.success(`Collected ${label}`, { id: `auto-collect-${token.address}` });
          }
        } catch (err) {
          if (!cancelled) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            toast.error(`Failed to collect ${token.symbol}: ${msg}`, {
              id: `auto-collect-${token.address}`,
            });
          }
        }
      }
    }

    runAutoCollect();

    return () => {
      cancelled = true;
    };
  }, [enabled, collectableTokens, isReady, stealthAddress, chainConfig, collectStream]);
}
