// streams.ts — viem-based contract interaction utilities for the Xylkstream client (no React imports)

import {
  createPublicClient,
  http,
  hexToBigInt,
  type PublicClient,
  type Chain,
} from "viem";
export {
  addressDriverAbi,
  dripsFacetAAbi,
  dripsFacetBAbi,
  dripsRouterAbi,
  erc20Abi,
  iDripsAbi,
  zwerc20Abi,
} from "@/contracts/generated";

// --- constants ---

export const AMT_PER_SEC_MULTIPLIER = 10n ** 9n;
export const TOTAL_SPLITS_WEIGHT = 1_000_000n;
export const DRIVER_ID_OFFSET = 224n;

// --- viem public client ---

export function getPublicClient(chain: Chain): PublicClient {
  return createPublicClient({
    chain,
    transport: http(),
  }) as PublicClient;
}

// --- helper functions ---

/**
 * Calculate streaming rate in internal units (tokens/sec * 10^decimals * AMT_PER_SEC_MULTIPLIER).
 */
export function calcAmtPerSec(tokensPerSec: number, decimals = 18): bigint {
  return BigInt(Math.floor(tokensPerSec * 10 ** decimals)) * AMT_PER_SEC_MULTIPLIER;
}

/**
 * Derive a Drips account ID from a driver ID and an Ethereum address.
 * Layout: driverId (32 bits) | addr (160 bits) packed into uint256.
 */
export function calcAccountId(driverId: bigint, addr: string): bigint {
  return (driverId << DRIVER_ID_OFFSET) | hexToBigInt(addr as `0x${string}`);
}

/**
 * Pack stream config into a single uint256.
 * Layout: streamId (32 bits) | amtPerSec (160 bits) | start (32 bits) | duration (32 bits)
 */
export function packStreamConfig(
  streamId: number,
  amtPerSec: bigint,
  start: number,
  duration: number,
): bigint {
  let config = BigInt(streamId);
  config = (config << 160n) | amtPerSec;
  config = (config << 32n) | BigInt(start);
  config = (config << 32n) | BigInt(duration);
  return config;
}

/**
 * Calculate how much has been streamed and how much remains in a stream position.
 */
export function calcStreamed(
  balance: bigint,
  updateTime: number,
  maxEnd: number,
  amtPerSec: bigint,
  now?: number,
): { streamed: bigint; remaining: bigint; timeLeft: number } {
  const currentTime = now ?? Math.floor(Date.now() / 1000);
  const effectiveEnd = Math.min(currentTime, maxEnd);
  const elapsed = Math.max(0, effectiveEnd - updateTime);
  // amtPerSec already includes AMT_PER_SEC_MULTIPLIER; divide back out for actual token amount
  const streamed = (amtPerSec * BigInt(elapsed)) / AMT_PER_SEC_MULTIPLIER;
  const remaining = balance > streamed ? balance - streamed : 0n;
  const timeLeft = maxEnd > currentTime ? maxEnd - currentTime : 0;
  return { streamed, remaining, timeLeft };
}
