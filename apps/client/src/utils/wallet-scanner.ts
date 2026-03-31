// wallet-scanner.ts — shared on-chain scanning for derived stealth wallets
// Pure utility (no React). Used by use-stream-create (index allocation) and
// use-wallet-discovery (orphan recovery + empty cleanup).

import type { PublicClient } from "viem";
import {
  addressDriverAbi,
  erc20Abi,
  iDripsAbi,
} from "@/utils/streams";
import type { KnownToken } from "@/config/chains";
import { getRegistry } from "@/store/wallet-registry";
import { getStreams } from "@/store/stream-store";

const ZERO_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

/** Gap of consecutive empty wallets before we stop scanning. */
const GAP_TOLERANCE = 5;

/** Absolute upper bound to prevent runaway scans. */
const MAX_SCAN = 50;

export interface ScannedWallet {
  index: number;
  address: string;
  hasStreams: boolean;
  erc20Balances: Array<{ token: KnownToken; balance: bigint }>;
  dripsBalances: Array<{
    token: KnownToken;
    splittable: bigint;
    collectable: bigint;
  }>;
  isRegistered: boolean;
}

// ---------------------------------------------------------------------------
// scanWalletAtIndex — reads full on-chain state for a single derivation index
// ---------------------------------------------------------------------------

export async function scanWalletAtIndex(
  getAccount: (index: number) => Promise<{ address: string }>,
  publicClient: PublicClient,
  contracts: { addressDriver: `0x${string}`; dripsProxy: `0x${string}` },
  tokens: KnownToken[],
  index: number,
  registeredIndices: Set<number>,
): Promise<ScannedWallet> {
  const { address } = await getAccount(index);
  const walletAddr = address as `0x${string}`;

  const accountId = await publicClient.readContract({
    address: contracts.addressDriver,
    abi: addressDriverAbi,
    functionName: "calcAccountId",
    args: [walletAddr],
  });

  // Batch all reads for this wallet in parallel
  const [erc20Results, dripsResults] = await Promise.all([
    // ERC20 balances
    Promise.all(
      tokens.map(async (token) => {
        const balance = await publicClient.readContract({
          address: token.address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [walletAddr],
        });
        return { token, balance };
      }),
    ),
    // Drips state per token
    Promise.all(
      tokens.map(async (token) => {
        const [streamsHash] = await publicClient.readContract({
          address: contracts.dripsProxy,
          abi: iDripsAbi,
          functionName: "streamsState",
          args: [accountId, token.address],
        });
        const [splittable, collectable] = await Promise.all([
          publicClient.readContract({
            address: contracts.dripsProxy,
            abi: iDripsAbi,
            functionName: "splittable",
            args: [accountId, token.address],
          }),
          publicClient.readContract({
            address: contracts.dripsProxy,
            abi: iDripsAbi,
            functionName: "collectable",
            args: [accountId, token.address],
          }),
        ]);
        return { token, streamsHash, splittable, collectable };
      }),
    ),
  ]);

  const hasStreams = dripsResults.some((d) => d.streamsHash !== ZERO_HASH);

  return {
    index,
    address,
    hasStreams,
    erc20Balances: erc20Results.filter((r) => r.balance > 0n),
    dripsBalances: dripsResults
      .filter((d) => d.splittable > 0n || d.collectable > 0n)
      .map(({ token, splittable, collectable }) => ({
        token,
        splittable,
        collectable,
      })),
    isRegistered: registeredIndices.has(index),
  };
}

// ---------------------------------------------------------------------------
// discoverWallets — scans indices 1..N looking for any on-chain state
// ---------------------------------------------------------------------------

export async function discoverWallets(
  getAccount: (index: number) => Promise<{ address: string }>,
  publicClient: PublicClient,
  contracts: { addressDriver: `0x${string}`; dripsProxy: `0x${string}` },
  tokens: KnownToken[],
  chainId: number,
): Promise<ScannedWallet[]> {
  const registry = getRegistry(chainId);
  const streams = getStreams(chainId).filter(
    (s) => s.isPrivate && s.walletIndex !== undefined,
  );

  const registeredIndices = new Set(registry.map((e) => e.index));

  // Determine how far to scan: max known index + GAP_TOLERANCE
  const knownIndices = [
    ...registry.map((e) => e.index),
    ...streams.map((s) => s.walletIndex!),
  ];
  const maxKnown = knownIndices.length > 0 ? Math.max(...knownIndices) : 0;
  const scanLimit = Math.min(maxKnown + GAP_TOLERANCE, MAX_SCAN);

  const results: ScannedWallet[] = [];
  let consecutiveEmpty = 0;

  for (let i = 1; i <= scanLimit; i++) {
    const wallet = await scanWalletAtIndex(
      getAccount,
      publicClient,
      contracts,
      tokens,
      i,
      registeredIndices,
    );

    const hasAnything =
      wallet.hasStreams ||
      wallet.erc20Balances.length > 0 ||
      wallet.dripsBalances.length > 0;

    if (hasAnything) {
      results.push(wallet);
      consecutiveEmpty = 0;
    } else {
      consecutiveEmpty++;
      if (consecutiveEmpty >= GAP_TOLERANCE && i > maxKnown) {
        break;
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// findNextUnusedIndex — replacement for the old nextWalletIndex in use-stream-create
// A wallet is unused only if it has zero streamsHash AND zero ERC20 balance.
// ---------------------------------------------------------------------------

export async function findNextUnusedIndex(
  getAccount: (index: number) => Promise<{ address: string }>,
  publicClient: PublicClient,
  contracts: { addressDriver: `0x${string}`; dripsProxy: `0x${string}` },
  tokens: KnownToken[],
  chainId: number,
): Promise<number> {
  // Start from localStorage hint (fast path when storage is intact)
  const existing = getStreams(chainId).filter(
    (s) => s.isPrivate && s.walletIndex !== undefined,
  );
  const registryEntries = getRegistry(chainId);
  const allIndices = [
    ...existing.map((s) => s.walletIndex!),
    ...registryEntries.map((e) => e.index),
  ];
  let candidate =
    allIndices.length === 0 ? 1 : Math.max(...allIndices) + 1;

  for (let i = 0; i < MAX_SCAN; i++) {
    const { address } = await getAccount(candidate);
    const walletAddr = address as `0x${string}`;

    // Check ERC20 balances
    const hasErc20 = await Promise.all(
      tokens.map((token) =>
        publicClient.readContract({
          address: token.address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [walletAddr],
        }),
      ),
    ).then((balances) => balances.some((b) => b > 0n));

    if (hasErc20) {
      candidate++;
      continue;
    }

    // Check streamsHash for each token
    const accountId = await publicClient.readContract({
      address: contracts.addressDriver,
      abi: addressDriverAbi,
      functionName: "calcAccountId",
      args: [walletAddr],
    });

    const hasStreams = await Promise.all(
      tokens.map((token) =>
        publicClient.readContract({
          address: contracts.dripsProxy,
          abi: iDripsAbi,
          functionName: "streamsState",
          args: [accountId, token.address],
        }).then(([hash]) => hash !== ZERO_HASH),
      ),
    ).then((results) => results.some(Boolean));

    if (!hasStreams) {
      return candidate;
    }
    candidate++;
  }

  throw new Error(
    "Could not find an unused derived wallet index within scan limit.",
  );
}
