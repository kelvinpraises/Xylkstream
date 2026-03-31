export const defaultChains = [
  { name: "localhost", rpc: "http://127.0.0.1:8545" },
  {
    name: "paseo",
    rpc: "https://eth-rpc-testnet.polkadot.io",
    chainId: 420420417,
    currency: "PAS",
    explorer: "https://blockscout-testnet.polkadot.io",
  },
  {
    name: "flow-testnet",
    rpc: "https://testnet.evm.nodes.onflow.org",
    chainId: 545,
    currency: "FLOW",
    explorer: "https://evm-testnet.flowscan.io",
  },
] as const satisfies readonly { name: string; rpc: string; chainId?: number; currency?: string; explorer?: string }[];
