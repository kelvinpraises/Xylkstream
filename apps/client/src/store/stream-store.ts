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
  status?: "ACTIVE" | "PAUSED" | "CANCELLED";
  /** Seconds remaining when stream was paused (used to calculate new duration on resume) */
  pausedRemainingDuration?: number;
  /** Original total amount minus what was already streamed when paused */
  pausedRemainingAmount?: string;
  /** Claim page ID for generating shareable claim links */
  claimId?: string;
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

export function updateStream(chainId: number, id: string, patch: Partial<LocalStream>): void {
  const streams = readRaw(chainId);
  const idx = streams.findIndex((s) => s.id === id);
  if (idx === -1) return;
  streams[idx] = { ...streams[idx], ...patch };
  writeRaw(chainId, streams);
}

export function clearStreams(chainId: number): void {
  try {
    localStorage.removeItem(storageKey(chainId));
  } catch {
    // ignore
  }
}

/** Remove completed streams older than `olderThanDays` from localStorage */
export function cleanupCompletedStreams(chainId: number, olderThanDays = 30): void {
  const nowSecs = Math.floor(Date.now() / 1000);
  const cutoff = nowSecs - olderThanDays * 86400;
  const streams = readRaw(chainId);
  const kept = streams.filter(
    (s) =>
      s.status === "PAUSED" ||
      s.endTimestamp > nowSecs ||
      s.endTimestamp > cutoff,
  );
  if (kept.length < streams.length) {
    writeRaw(chainId, kept);
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
