export const SUPPORTED_CHAINS = {
  TEMPO: {
    id: 42431,
    name: 'Tempo',
    nativeToken: 'TEMPO',
    rpcUrl: process.env.TEMPO_RPC_URL || 'https://rpc.moderato.tempo.xyz',
    explorer: 'https://explorer.tempo.xyz',
  },
} as const;

export type SupportedChainId = keyof typeof SUPPORTED_CHAINS;
