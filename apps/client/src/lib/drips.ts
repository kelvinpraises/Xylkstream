/**
 * drips.ts — contract interaction library for Xylkstream client
 * Browser-side, viem-based. No React imports.
 */

import {
  createPublicClient,
  http,
  defineChain,
  hexToBigInt,
  type PublicClient,
} from "viem";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const AMT_PER_SEC_MULTIPLIER = 10n ** 9n;
export const TOTAL_SPLITS_WEIGHT = 1_000_000n;
export const DRIVER_ID_OFFSET = 224n;

// ---------------------------------------------------------------------------
// Chain definitions
// ---------------------------------------------------------------------------

export const bsc = defineChain({
  id: 56,
  name: "BNB Smart Chain",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://bsc-dataseed.binance.org"] },
  },
  blockExplorers: {
    default: { name: "BscScan", url: "https://bscscan.com" },
  },
});

export const polkadotHub = defineChain({
  id: 420420421,
  name: "Polkadot Hub",
  nativeCurrency: { name: "DOT", symbol: "DOT", decimals: 10 },
  rpcUrls: {
    default: { http: ["https://westend-asset-hub-eth-rpc.polkadot.io"] },
  },
});

// ---------------------------------------------------------------------------
// Contract addresses
// ---------------------------------------------------------------------------

export interface ContractAddresses {
  dripsProxy: `0x${string}`;
  addressDriver: `0x${string}`;
  zwUSDC?: `0x${string}`;
  zwUSDT?: `0x${string}`;
  privacyRouter?: `0x${string}`;
}

export function getContractAddresses(): ContractAddresses {
  return {
    dripsProxy: (import.meta.env.VITE_DRIPS_PROXY ||
      "0x0000000000000000000000000000000000000000") as `0x${string}`,
    addressDriver: (import.meta.env.VITE_ADDRESS_DRIVER ||
      "0x0000000000000000000000000000000000000000") as `0x${string}`,
    zwUSDC: import.meta.env.VITE_ZW_USDC as `0x${string}` | undefined,
    zwUSDT: import.meta.env.VITE_ZW_USDT as `0x${string}` | undefined,
    privacyRouter: import.meta.env.VITE_PRIVACY_ROUTER as
      | `0x${string}`
      | undefined,
  };
}

// ---------------------------------------------------------------------------
// Viem public client
// ---------------------------------------------------------------------------

export function getPublicClient(rpcUrl?: string): PublicClient {
  const url =
    rpcUrl ||
    import.meta.env.VITE_RPC_URL ||
    "https://bsc-dataseed.binance.org";
  return createPublicClient({
    chain: bsc,
    transport: http(url),
  }) as PublicClient;
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ABIs
// ---------------------------------------------------------------------------

export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
] as const;

export const ADDRESS_DRIVER_ABI = [
  {
    type: "function",
    name: "setStreams",
    inputs: [
      { name: "erc20", type: "address" },
      {
        name: "currReceivers",
        type: "tuple[]",
        components: [
          { name: "accountId", type: "uint256" },
          { name: "config", type: "uint256" },
        ],
      },
      { name: "balanceDelta", type: "int128" },
      {
        name: "newReceivers",
        type: "tuple[]",
        components: [
          { name: "accountId", type: "uint256" },
          { name: "config", type: "uint256" },
        ],
      },
      { name: "maxEndHint1", type: "uint32" },
      { name: "maxEndHint2", type: "uint32" },
      { name: "transferTo", type: "address" },
    ],
    outputs: [{ name: "realBalanceDelta", type: "int128" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "collect",
    inputs: [
      { name: "erc20", type: "address" },
      { name: "transferTo", type: "address" },
    ],
    outputs: [{ name: "amt", type: "uint128" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "calcAccountId",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "accountId", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "give",
    inputs: [
      { name: "receiver", type: "uint256" },
      { name: "erc20", type: "address" },
      { name: "amt", type: "uint128" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setSplits",
    inputs: [
      {
        name: "receivers",
        type: "tuple[]",
        components: [
          { name: "accountId", type: "uint256" },
          { name: "weight", type: "uint32" },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "DRIVER_ID",
    inputs: [],
    outputs: [{ name: "", type: "uint32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "forceCollect",
    inputs: [
      { name: "erc20", type: "address" },
      { name: "yieldManager", type: "address" },
      { name: "senderAccountId", type: "uint256" },
      { name: "transferTo", type: "address" },
      { name: "data", type: "bytes" },
    ],
    outputs: [{ name: "amt", type: "uint128" }],
    stateMutability: "nonpayable",
  },
] as const;

export const DRIPS_ABI = [
  {
    type: "function",
    name: "receiveStreams",
    inputs: [
      { name: "accountId", type: "uint256" },
      { name: "erc20", type: "address" },
      { name: "maxCycles", type: "uint32" },
    ],
    outputs: [{ name: "receivedAmt", type: "uint128" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "streamsState",
    inputs: [
      { name: "accountId", type: "uint256" },
      { name: "erc20", type: "address" },
    ],
    outputs: [
      { name: "streamsHash", type: "bytes32" },
      { name: "streamsHistoryHash", type: "bytes32" },
      { name: "updateTime", type: "uint32" },
      { name: "balance", type: "uint128" },
      { name: "maxEnd", type: "uint32" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "splittable",
    inputs: [
      { name: "accountId", type: "uint256" },
      { name: "erc20", type: "address" },
    ],
    outputs: [{ name: "amt", type: "uint128" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "split",
    inputs: [
      { name: "accountId", type: "uint256" },
      { name: "erc20", type: "address" },
      {
        name: "currReceivers",
        type: "tuple[]",
        components: [
          { name: "accountId", type: "uint256" },
          { name: "weight", type: "uint32" },
        ],
      },
    ],
    outputs: [
      { name: "collectableAmt", type: "uint128" },
      { name: "splitAmt", type: "uint128" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "collectable",
    inputs: [
      { name: "accountId", type: "uint256" },
      { name: "erc20", type: "address" },
    ],
    outputs: [{ name: "amt", type: "uint128" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "collect",
    inputs: [
      { name: "accountId", type: "uint256" },
      { name: "erc20", type: "address" },
    ],
    outputs: [{ name: "amt", type: "uint128" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balances",
    inputs: [{ name: "erc20", type: "address" }],
    outputs: [
      { name: "streamsBalance", type: "uint128" },
      { name: "splitsBalance", type: "uint128" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "give",
    inputs: [
      { name: "accountId", type: "uint256" },
      { name: "receiver", type: "uint256" },
      { name: "erc20", type: "address" },
      { name: "amt", type: "uint128" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "registerDriver",
    inputs: [{ name: "driverAddr", type: "address" }],
    outputs: [{ name: "driverId", type: "uint32" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "driverAddress",
    inputs: [{ name: "driverId", type: "uint32" }],
    outputs: [{ name: "driverAddr", type: "address" }],
    stateMutability: "view",
  },
] as const;

export const ZWERC20_ABI = [
  {
    type: "function",
    name: "deposit",
    inputs: [
      { name: "to", type: "address" },
      { name: "id", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [
      { name: "to", type: "address" },
      { name: "id", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "remint",
    inputs: [
      { name: "to", type: "address" },
      { name: "id", type: "uint256" },
      { name: "amount", type: "uint256" },
      {
        name: "remintData",
        type: "tuple",
        components: [
          { name: "commitment", type: "bytes32" },
          { name: "nullifiers", type: "bytes32[]" },
          { name: "proof", type: "bytes" },
          { name: "redeem", type: "bool" },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getLeafCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getCommitLeaves",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "start", type: "uint256" },
      { name: "count", type: "uint256" },
    ],
    outputs: [
      { name: "commitments", type: "bytes32[]" },
      { name: "addresses", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "root",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isKnownRoot",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nullifierUsed",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getFilledSubtree",
    inputs: [{ name: "level", type: "uint256" }],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "UNDERLYING",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getCommitLeafCount",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;
