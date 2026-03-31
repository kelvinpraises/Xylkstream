// chains.ts — multichain registry. All contracts default to shared CREATE2 addresses.
// Per-chain definitions only override what's actually different.

import { localhost as _localhost } from "viem/chains";
import { defineChain, type Chain } from "viem";

const paseo = defineChain({
  id: 420420417,
  name: "Paseo",
  nativeCurrency: { name: "PAS", symbol: "PAS", decimals: 18 },
  rpcUrls: { default: { http: ["https://eth-rpc-testnet.polkadot.io"] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://blockscout-testnet.polkadot.io" },
  },
  testnet: true,
});

const flowTestnet = defineChain({
  id: 545,
  name: "Flow EVM Testnet",
  nativeCurrency: { name: "FLOW", symbol: "FLOW", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet.evm.nodes.onflow.org"] } },
  blockExplorers: {
    default: { name: "Flowscan", url: "https://evm-testnet.flowscan.io" },
  },
  testnet: true,
});

// Anvil uses chainId 31337, but viem's localhost defaults to 1337
const localhost = defineChain({
  ..._localhost,
  id: 31337,
  name: "Localhost",
});

// --- shared defaults (CREATE2 deterministic — same on every EVM chain) ---

const DEFAULTS = {
  // ERC-4337
  entryPoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",

  // protocol (from deploy/output — same on localhost + paseo)
  dripsProxy: "0x6000b3f7c52233a82f99a1c37dcf4ed00a6aaf46",
  addressDriver: "0x7f1d8081c5d1a25ae989424635d55309009b3d68",

  // privacy
  zwUsdc: "0xf0007693eba473191416c55fbb7a487bb4a4dadf",
  zwUsdt: "0x740cc0ec24eb667605e444e2fccb4bf46014c22b",
  privacyRouter: "0x0000000000000000000000000000000000000001",

  // Safe 4337 modules
  safeSingleton: "0x1cf8d29422e1264787cba22589fc77f420fdb048",
  safeProxyFactory: "0xa9a878ece38017405daa6fef6f55372a3774e981",
  safe4337Module: "0xa8faf83e7dec6beec5cf460aa2a4433964f99887",
  safeModuleSetup: "0x0a506308777a2b272fa78c95720e17530bbab1d9",
  multiSend: "0x24f5b0ebb7742a074e7d9127d55733ea61cf22bf",
  multiSendCallOnly: "0x1a5519bda3b677d1030af5ce471986f33f8e8b66",
  fallbackHandler: "0x99f2a318aeb900c9c00d36e54fd9a0f1b520e847",
  signMessageLib: "0x3fd2ed43201105763ddcf55ec1ecaac5c846f20c",
  createCall: "0xac9d3fceac5703242663a434f5c8aa6c213ab967",
  simulateTxAccessor: "0x2979b39572fd8e47168e2aa7caed7df46b609327",

  // tokens
  mockUsdc: "0xbd5406cb7e46347d76c4b1963496c1365767d78c",
  mockUsdt: "0xe81a302fe5a58000452e2fca3ae9edd154df6c92",
} as const satisfies Record<string, `0x${string}`>;

export type Contracts = typeof DEFAULTS;

// --- types ---

/**
 * Minimum gas floors passed to GenericFeeEstimator. Only needed for chains
 * where Alto's eth_estimateUserOperationGas returns underestimates (e.g.
 * Substrate/Polkadot chains with proof_size weight limits, or zkEVM chains
 * with different gas metering). If a new chain's UserOps fail with
 * "arithmetic underflow" or "ExecutionFailed" during handleOps, add
 * gasOverrides here — the estimator will use whichever value is higher
 * (estimated vs override).
 */
export interface GasOverrides {
  verificationGasLimit?: bigint;
  callGasLimit?: bigint;
  preVerificationGas?: bigint;
}

export interface ChainConfig {
  chain: Chain;
  contracts: Contracts;
  bundlerUrl: string;
  paymasterUrl: string;
  gasOverrides?: GasOverrides;
}

// --- chain registry ---

function define(
  chain: Chain,
  bundlerUrl: string,
  paymasterUrl: string,
  opts?: { contracts?: Partial<Contracts>; gasOverrides?: GasOverrides },
): ChainConfig {
  return {
    chain,
    bundlerUrl,
    paymasterUrl,
    contracts: { ...DEFAULTS, ...opts?.contracts },
    gasOverrides: opts?.gasOverrides,
  };
}

export const supportedChains: Record<number, ChainConfig> = {
  [localhost.id]: define(
    localhost,
    "http://localhost:4848/bundler/localhost",
    "http://localhost:4848/paymaster/localhost",
  ),

  [paseo.id]: define(
    paseo,
    `${import.meta.env.VITE_API_URL}/bundler/paseo`,
    `${import.meta.env.VITE_API_URL}/paymaster/paseo`,
    {
      // Substrate proof_size limits cause Alto's estimation to underreport gas
      gasOverrides: {
        verificationGasLimit: 500_000n,
        callGasLimit: 200_000n,
        preVerificationGas: 100_000n,
      },
    },
  ),

  [flowTestnet.id]: define(
    flowTestnet,
    `${import.meta.env.VITE_API_URL}/bundler/flow-testnet`,
    `${import.meta.env.VITE_API_URL}/paymaster/flow-testnet`,
    {
      // Safe's canonical deployments on Flow differ from our CREATE2 defaults
      contracts: {
        safeSingleton: "0x41675C099F32341bf84BFc5382aF534df5C7461a",
        safeProxyFactory: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
        safe4337Module: "0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226",
      },
    },
  ),
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
    { symbol: "USDT", address: contracts.mockUsdt, contractKey: "mockUsdt" },
    { symbol: "USDC", address: contracts.mockUsdc, contractKey: "mockUsdc" },
  ];
}
