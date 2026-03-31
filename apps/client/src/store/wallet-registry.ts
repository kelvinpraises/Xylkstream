// wallet-registry.ts — localStorage-backed registry for derived wallets + privacy mode setting

import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface WalletEntry {
  index: number;
  address: string;
  type: "stream" | "circle";
  entityId: string;
  label?: string;
  createdAt: string;
  isOrphan?: boolean;
}

export interface MainWalletConfig {
  index: number;
  address: string;
}

const REGISTRY_KEY = (chainId: number) => `xylkstream_wallet_registry_${chainId}`;
const MAIN_WALLET_KEY = (chainId: number) => `xylkstream_main_wallet_${chainId}`;
const PRIVACY_MODE_KEY = "xylkstream_privacy_mode";

// --- Registry CRUD ---

export function getRegistry(chainId: number): WalletEntry[] {
  const raw = localStorage.getItem(REGISTRY_KEY(chainId));
  return raw ? JSON.parse(raw) : [];
}

function saveRegistry(chainId: number, entries: WalletEntry[]) {
  localStorage.setItem(REGISTRY_KEY(chainId), JSON.stringify(entries));
}

export function getMainWallet(chainId: number): MainWalletConfig | null {
  const raw = localStorage.getItem(MAIN_WALLET_KEY(chainId));
  return raw ? JSON.parse(raw) : null;
}

export function setMainWallet(chainId: number, config: MainWalletConfig) {
  localStorage.setItem(MAIN_WALLET_KEY(chainId), JSON.stringify(config));
}

export function getNextIndex(chainId: number): number {
  const entries = getRegistry(chainId);
  const main = getMainWallet(chainId);
  const allIndices = entries.map((e) => e.index);
  if (main) allIndices.push(main.index);
  return allIndices.length === 0 ? 1 : Math.max(...allIndices) + 1;
}

export function registerWallet(chainId: number, entry: WalletEntry) {
  const entries = getRegistry(chainId);
  entries.push(entry);
  saveRegistry(chainId, entries);
}

export function removeEntry(chainId: number, entityId: string) {
  const entries = getRegistry(chainId).filter((e) => e.entityId !== entityId);
  saveRegistry(chainId, entries);
}

/** Insert only if no entry with the same index already exists. */
export function registerIfAbsent(chainId: number, entry: WalletEntry) {
  const entries = getRegistry(chainId);
  if (entries.some((e) => e.index === entry.index)) return;
  entries.push(entry);
  saveRegistry(chainId, entries);
}

/** Remove entries whose index is NOT in the active set. */
export function removeEmptyWallets(chainId: number, activeIndices: Set<number>) {
  const entries = getRegistry(chainId).filter((e) => activeIndices.has(e.index));
  saveRegistry(chainId, entries);
}

export function getEntryByEntity(chainId: number, entityId: string): WalletEntry | undefined {
  return getRegistry(chainId).find((e) => e.entityId === entityId);
}

// --- Privacy mode ---

export function getPrivacyMode(): boolean {
  const stored = localStorage.getItem(PRIVACY_MODE_KEY);
  if (stored === null) return true;
  return stored === "true";
}

export function setPrivacyMode(enabled: boolean) {
  localStorage.setItem(PRIVACY_MODE_KEY, String(enabled));
}

// --- React Query hooks ---

export function useWalletRegistry(chainId: number) {
  return useQuery({
    queryKey: ["wallet-registry", chainId],
    queryFn: () => getRegistry(chainId),
    staleTime: Infinity,
  });
}

export function usePrivacyMode() {
  const qc = useQueryClient();

  const { data: enabled = true } = useQuery({
    queryKey: ["privacy-mode"],
    queryFn: () => getPrivacyMode(),
    staleTime: Infinity,
  });

  const toggle = (value: boolean) => {
    setPrivacyMode(value);
    qc.setQueryData(["privacy-mode"], value);
  };

  return { enabled, toggle };
}
