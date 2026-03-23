// stream-store.ts — localStorage-backed store for created streams (Drips has no on-chain enumeration)

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useChain } from "@/providers/chain-provider";

const STORAGE_PREFIX = "xylkstream_streams";

function storageKey(chainId: number): string {
  return `${STORAGE_PREFIX}_${chainId}`;
}

export interface LocalStream {
  id: string;
  chainId: number;
  accountId: string;
  recipientAddress: string;
  recipientAccountId: string;
  tokenAddress: string;
  tokenSymbol: string;
  totalAmount: string;
  amtPerSec: string;
  startTimestamp: number;
  endTimestamp: number;
  dripsStreamId?: number;
  isPrivate: boolean;
  walletIndex?: number;
  walletAddress?: string;
  txHash?: string;
  createdAt: string;
}

function readRaw(chainId: number): LocalStream[] {
  try {
    const raw = localStorage.getItem(storageKey(chainId));
    if (!raw) return [];
    return JSON.parse(raw) as LocalStream[];
  } catch {
    return [];
  }
}

function writeRaw(chainId: number, streams: LocalStream[]): void {
  try {
    localStorage.setItem(storageKey(chainId), JSON.stringify(streams));
  } catch {
    // Silently ignore storage quota errors
  }
}

export function getStreams(chainId: number): LocalStream[] {
  return readRaw(chainId);
}

export function addStream(stream: LocalStream): void {
  const streams = readRaw(stream.chainId);
  streams.unshift(stream);
  writeRaw(stream.chainId, streams);
}

export function removeStream(chainId: number, id: string): void {
  writeRaw(chainId, readRaw(chainId).filter((s) => s.id !== id));
}

export function clearStreams(chainId: number): void {
  try {
    localStorage.removeItem(storageKey(chainId));
  } catch {
    // ignore
  }
}

// --- React Query hook ---

export function useLocalStreams() {
  const { chainId } = useChain();
  const queryClient = useQueryClient();

  const { data: streams = [] } = useQuery({
    queryKey: ["localStreams", chainId],
    queryFn: () => getStreams(chainId),
    staleTime: Infinity, // only refetch on manual invalidation
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["localStreams"] }),
    [queryClient],
  );

  return { streams, invalidate };
}
