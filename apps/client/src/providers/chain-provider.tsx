// chain-provider.tsx — provides the active chain config to all downstream hooks and services

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { config } from "@/config";
import { getChainConfig, getSupportedChainIds, type ChainConfig } from "@/config/chains";

const STORAGE_KEY = "xylkstream_chain_id";

function getInitialChainId(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const id = Number(stored);
      // validate it's still supported
      if (getSupportedChainIds().includes(id)) return id;
    }
  } catch {
    // ignore
  }
  return config.DEFAULT_CHAIN_ID;
}

interface ChainContextValue {
  chainConfig: ChainConfig;
  chainId: number;
  switchChain: (chainId: number) => void;
  supportedChainIds: number[];
}

const ChainContext = createContext<ChainContextValue | null>(null);

export function ChainProvider({ children }: { children: ReactNode }) {
  const [chainId, setChainId] = useState(getInitialChainId);

  const switchChain = useCallback((newChainId: number) => {
    // validate before switching
    getChainConfig(newChainId);
    setChainId(newChainId);
    try {
      localStorage.setItem(STORAGE_KEY, String(newChainId));
    } catch {
      // ignore
    }
  }, []);

  const chainConfig = getChainConfig(chainId);

  return (
    <ChainContext.Provider
      value={{
        chainConfig,
        chainId,
        switchChain,
        supportedChainIds: getSupportedChainIds(),
      }}
    >
      {children}
    </ChainContext.Provider>
  );
}

export function useChain(): ChainContextValue {
  const ctx = useContext(ChainContext);
  if (!ctx) throw new Error("useChain must be used within a ChainProvider");
  return ctx;
}
