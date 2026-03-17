// chains.ts — multichain registry. All contracts default to shared CREATE2 addresses.
// Per-chain definitions only override what's actually different.

import { localhost } from "viem/chains";
import type { Chain } from "viem";

// --- shared defaults (CREATE2 deterministic — same on every EVM chain) ---

const DEFAULTS = {
  // ERC-4337
  entryPoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",

  // protocol
  dripsProxy: "0x59b670e9fa9d0a427751af201d676719a970857b",
  addressDriver: "0x09635f643e140090a9a8dcd712ed6285858cebef",

  // privacy
  zwUsdc: "0x0b306bf915c4d645ff596e518faf3f9669b97016",
  zwUsdt: "0x959922be3caee4b8cd9a407cc3ac1c251c2007b1",
  privacyRouter: "0x0000000000000000000000000000000000000001",

  // Safe 4337 modules
  safeSingleton: "0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0",
  safeProxyFactory: "0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9",
  safe4337Module: "0x5fc8d32690cc91d4c39d9d3abcbd16989f875707",
  safeModuleSetup: "0xdc64a140aa3e981100a9beca4e685f962f0cf6c9",
  multiSend: "0x0165878a594ca255338adfa4d48449f69242eb8f",
  multiSendCallOnly: "0xa513e6e4b8f2a923d98304ec87f64353c4d5c853",
  fallbackHandler: "0x2279b7a0a67db372996a5fab50d91eaa73d2ebe6",
  signMessageLib: "0x8a791620dd6260079bf849dc5567adc3f2fdc318",
  createCall: "0x610178da211fef7d417bc0e6fed39f05609ad788",
  simulateTxAccessor: "0xb7f8bc63bbcad18155201308c8f3540b07f84f5e",

  // tokens
  mockUsdc: "0x0dcd1bf9a1b36ce34237eeafef220932846bcd82",
  mockUsdt: "0x9a676e781a523b5d0c0e43731313a708cb607508",
} as const satisfies Record<string, `0x${string}`>;

export type Contracts = typeof DEFAULTS;

// --- types ---

export interface ChainConfig {
  chain: Chain;
  contracts: Contracts;
  bundlerUrl: string;
}

// --- chain registry ---

function define(
  chain: Chain,
  bundlerUrl: string,
  overrides?: Partial<Contracts>,
): ChainConfig {
  return {
    chain,
    bundlerUrl,
    contracts: { ...DEFAULTS, ...overrides },
  };
}

export const supportedChains: Record<number, ChainConfig> = {
  [localhost.id]: define(localhost, "http://localhost:4848/bundler"),

  // Adding a new chain where everything is the same:
  //   [bscTestnet.id]: define(bscTestnet, "https://api.xylkstream.xyz/bundler"),
  //
  // If one contract differs on a chain:
  //   [bsc.id]: define(bsc, "https://api.xylkstream.xyz/bundler", {
  //     privacyRouter: "0xDIFFERENT_ON_THIS_CHAIN",
  //   }),
};

// --- accessors ---

export function getChainConfig(chainId: number): ChainConfig {
  const cfg = supportedChains[chainId];
  if (!cfg) {
    throw new Error(
      `Unsupported chain ID: ${chainId}. Supported: ${Object.keys(supportedChains).join(", ")}`,
    );
  }
  return cfg;
}

export function getSupportedChainIds(): number[] {
  return Object.keys(supportedChains).map(Number);
}

/** Known sendable tokens derived from contract addresses. */
export interface KnownToken {
  symbol: string;
  address: `0x${string}`;
  contractKey: keyof Contracts;
}

export function getSendableTokens(contracts: Contracts): KnownToken[] {
  return [
    { symbol: "USDC", address: contracts.mockUsdc, contractKey: "mockUsdc" },
    { symbol: "USDT", address: contracts.mockUsdt, contractKey: "mockUsdt" },
  ];
}
