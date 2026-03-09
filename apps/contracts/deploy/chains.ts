export const defaultChains = [
  { name: "localhost", rpc: "http://127.0.0.1:8545" },
  // { name: "paseo", rpc: "https://eth-rpc-testnet.polkadot.io/" },
] as const satisfies readonly { name: string; rpc: string }[];
