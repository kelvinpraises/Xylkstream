/**
 * use-collect.ts — 3-step Drips collection pipeline hook
 *
 * Pipeline: receiveStreams → split → collect
 *
 *   Step 1 receiveStreams  — dripsProxy  — permissionless, pulls streamed funds into splittable
 *   Step 2 split           — dripsProxy  — permissionless, moves splittable → collectable
 *   Step 3 collect         — addressDriver — sends collectable to transferTo address
 *
 * useForceCollect handles the alternative path where a specific sender's yield
 * position is force-unwound via AddressDriver.forceCollect.
 */

import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallets } from '@privy-io/react-auth';
import { createWalletClient, custom } from 'viem';
import {
  DRIPS_ABI,
  ADDRESS_DRIVER_ABI,
  getContractAddresses,
  getPublicClient,
  bsc,
} from '@/lib/drips';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CollectStep = 'idle' | 'receiveStreams' | 'split' | 'collect' | 'completed' | 'error';

export interface CollectParams {
  /** The collector's Drips account ID (uint256 derived from driver + address). */
  accountId: bigint;
  tokenAddress: `0x${string}`;
  /** Wallet address that will receive the collected tokens. */
  transferTo: `0x${string}`;
  /** Max stream-accounting cycles to process in receiveStreams (default 100). */
  maxCycles?: number;
  /**
   * Split receivers to honour before collecting.
   * Pass an empty array (default) to route 100 % of splittable → collectable.
   */
  splitReceivers?: Array<{ accountId: bigint; weight: number }>;
}

export interface CollectResult {
  receiveTxHash: `0x${string}`;
  splitTxHash: `0x${string}`;
  collectTxHash: `0x${string}`;
  step: 'completed';
}

export type ForceCollectStep = 'idle' | 'forceCollect' | 'completed' | 'error';

export interface ForceCollectParams {
  tokenAddress: `0x${string}`;
  /** The sender account whose yield position is being force-collected. */
  senderAccountId: bigint;
  /** Wallet address that will receive the collected tokens. */
  transferTo: `0x${string}`;
  /**
   * YieldManager address.  Falls back to the zero address if omitted, which
   * is valid when no yield strategy is attached to the sender's position.
   */
  yieldManagerAddress?: `0x${string}`;
  /** ABI-encoded extra data forwarded to the yield strategy (default 0x). */
  data?: `0x${string}`;
}

export interface ForceCollectResult {
  collectTxHash: `0x${string}`;
  step: 'completed';
}

// ---------------------------------------------------------------------------
// useCollect
// ---------------------------------------------------------------------------

/**
 * Mutation hook that runs the full 3-step Drips collection pipeline.
 *
 * Exposes `currentStep` (via a ref updated during the mutation) so callers
 * can display per-step progress without triggering re-renders on every
 * intermediate state change.  For a live reactive value, use the
 * `onStepChange` callback in the mutation options instead.
 */
export function useCollect() {
  const queryClient = useQueryClient();
  const { wallets } = useWallets();

  /** Tracks the active pipeline step — updated synchronously during mutationFn. */
  const currentStep = useRef<CollectStep>('idle');

  const mutation = useMutation<CollectResult, Error, CollectParams>({
    mutationFn: async (params) => {
      const {
        accountId,
        tokenAddress,
        transferTo,
        maxCycles = 100,
        splitReceivers = [],
      } = params;

      const addresses = getContractAddresses();
      const publicClient = getPublicClient();

      // ── Wallet client setup ────────────────────────────────────────────────
      const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
      if (!embeddedWallet) throw new Error('No Privy embedded wallet found. Make sure you are logged in.');

      const provider = await embeddedWallet.getEthereumProvider();
      const walletClient = createWalletClient({
        account: embeddedWallet.address as `0x${string}`,
        chain: bsc,
        transport: custom(provider),
      });

      // ── Step 1: receiveStreams ─────────────────────────────────────────────
      // Permissionless — pulls all accrued stream cycles into the splittable
      // balance.  Called on dripsProxy (NOT on AddressDriver).
      currentStep.current = 'receiveStreams';

      const receiveTxHash = await walletClient.writeContract({
        address: addresses.dripsProxy,
        abi: DRIPS_ABI,
        functionName: 'receiveStreams',
        args: [accountId, tokenAddress, maxCycles],
      });
      await publicClient.waitForTransactionReceipt({ hash: receiveTxHash });

      // ── Step 2: split ─────────────────────────────────────────────────────
      // Permissionless — moves splittable → collectable.
      // An empty splitReceivers array means 100 % flows into collectable with
      // nothing routed to third-party accounts.
      currentStep.current = 'split';

      const splitTxHash = await walletClient.writeContract({
        address: addresses.dripsProxy,
        abi: DRIPS_ABI,
        functionName: 'split',
        args: [accountId, tokenAddress, splitReceivers],
      });
      await publicClient.waitForTransactionReceipt({ hash: splitTxHash });

      // ── Step 3: collect ───────────────────────────────────────────────────
      // Must be called by the account owner via AddressDriver — the driver
      // verifies msg.sender, then calls drips.collect and transfers the tokens.
      currentStep.current = 'collect';

      const collectTxHash = await walletClient.writeContract({
        address: addresses.addressDriver,
        abi: ADDRESS_DRIVER_ABI,
        functionName: 'collect',
        args: [tokenAddress, transferTo],
      });
      await publicClient.waitForTransactionReceipt({ hash: collectTxHash });

      currentStep.current = 'completed';

      return {
        receiveTxHash,
        splitTxHash,
        collectTxHash,
        step: 'completed' as const,
      };
    },

    onError: () => {
      currentStep.current = 'error';
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['splittable'] });
      queryClient.invalidateQueries({ queryKey: ['collectable'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-balances'] });
    },
  });

  return { ...mutation, currentStep };
}

// ---------------------------------------------------------------------------
// useForceCollect
// ---------------------------------------------------------------------------

/**
 * Mutation hook for force-collecting from a specific sender's yield position.
 *
 * Calls `AddressDriver.forceCollect(erc20, yieldManager, senderAccountId,
 * transferTo, data)`.  Use this when a sender's YieldManager position needs
 * to be unwound on behalf of the receiver (e.g. the sender is no longer
 * active and funds are stuck in a yield strategy).
 */
export function useForceCollect() {
  const queryClient = useQueryClient();
  const { wallets } = useWallets();

  const currentStep = useRef<ForceCollectStep>('idle');

  const mutation = useMutation<ForceCollectResult, Error, ForceCollectParams>({
    mutationFn: async (params) => {
      const {
        tokenAddress,
        senderAccountId,
        transferTo,
        yieldManagerAddress = '0x0000000000000000000000000000000000000000',
        data = '0x',
      } = params;

      const addresses = getContractAddresses();
      const publicClient = getPublicClient();

      // ── Wallet client setup ────────────────────────────────────────────────
      const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
      if (!embeddedWallet) throw new Error('No Privy embedded wallet found. Make sure you are logged in.');

      const provider = await embeddedWallet.getEthereumProvider();
      const walletClient = createWalletClient({
        account: embeddedWallet.address as `0x${string}`,
        chain: bsc,
        transport: custom(provider),
      });

      // ── forceCollect ──────────────────────────────────────────────────────
      // Single call on AddressDriver — internally unwinds the yield position
      // for the given senderAccountId and transfers collectable to transferTo.
      currentStep.current = 'forceCollect';

      const collectTxHash = await walletClient.writeContract({
        address: addresses.addressDriver,
        abi: ADDRESS_DRIVER_ABI,
        functionName: 'forceCollect',
        args: [tokenAddress, yieldManagerAddress, senderAccountId, transferTo, data],
      });
      await publicClient.waitForTransactionReceipt({ hash: collectTxHash });

      currentStep.current = 'completed';

      return {
        collectTxHash,
        step: 'completed' as const,
      };
    },

    onError: () => {
      currentStep.current = 'error';
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['splittable'] });
      queryClient.invalidateQueries({ queryKey: ['collectable'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-balances'] });
    },
  });

  return { ...mutation, currentStep };
}
