export const TOKENS = {
  USDC: {
    symbol: 'USDC',
    decimals: 6,
    name: 'USD Coin',
    address: '0x0000000000000000000000000000000000000834' as `0x${string}`,
  },
  USDT: {
    symbol: 'USDT',
    decimals: 6,
    name: 'Tether USD',
    address: '0x0000000000000000000000000000000000000835' as `0x${string}`,
  },
  TEMPO: {
    symbol: 'TEMPO',
    decimals: 18,
    name: 'Tempo',
    address: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  },
} as const;

export type SupportedToken = keyof typeof TOKENS;
