// use-stream-actions.ts — on-chain stream mutation hooks (pause, resume, edit, cancel)

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, encodeFunctionData, parseUnits } from "viem";
import {
  addressDriverAbi,
  erc20Abi,
  packStreamConfig,
  getPublicClient,
  AMT_PER_SEC_MULTIPLIER,
  calcAmtPerSec,
} from "@/utils/streams";
import { useChain } from "@/providers/chain-provider";
import { getStreams, updateStream } from "@/store/stream-store";
import type { LocalStream } from "@/store/stream-store";
import { useStealthWallet } from "@/providers/stealth-wallet-provider";
import { toast } from "sonner";
import { friendlyTxError } from "@/utils";

// --- helpers ---

/**
 * Build on-chain receiver set from localStorage for a given sender + token.
 * Excludes PAUSED and CANCELLED streams (they've already been removed on-chain).
 */
function buildCurrReceiversForAccount(
  chainId: number,
  senderAccountId: string,
  tokenAddress: string,
): Array<{ accountId: bigint; config: bigint }> {
  const existing = getStreams(chainId).filter(
    (s) =>
      s.accountId.toLowerCase() === senderAccountId.toLowerCase() &&
      s.tokenAddress.toLowerCase() === tokenAddress.toLowerCase() &&
      s.status !== "PAUSED" &&
      s.status !== "CANCELLED",
  );
  return sortReceivers(
    existing.map((s) => ({
      accountId: BigInt(s.recipientAccountId),
      config: packStreamConfig(
        s.dripsStreamId ?? 1,
        BigInt(s.amtPerSec),
        0,
        s.endTimestamp - s.startTimestamp,
      ),
    })),
  );
}

/** Sort receivers ascending by (accountId, config) — Drips enforces this. */
function sortReceivers(
  receivers: Array<{ accountId: bigint; config: bigint }>,
): Array<{ accountId: bigint; config: bigint }> {
  return [...receivers].sort((a, b) => {
    if (a.accountId < b.accountId) return -1;
    if (a.accountId > b.accountId) return 1;
    if (a.config < b.config) return -1;
    if (a.config > b.config) return 1;
    return 0;
  });
}

/** Build the packed config for a given stream's current state. */
function streamReceiverConfig(stream: LocalStream): bigint {
  return packStreamConfig(
    stream.dripsStreamId ?? 1,
    BigInt(stream.amtPerSec),
    0,
    stream.endTimestamp - stream.startTimestamp,
  );
}

// --- types ---

export interface PauseStreamParams {
  stream: LocalStream;
}

export interface ResumeStreamParams {
  stream: LocalStream;
}

export interface CancelStreamParams {
  stream: LocalStream;
}

export interface EditStreamParams {
  stream: LocalStream;
  newTotalAmount: string;
  newDurationSeconds: number;
  newTokenDecimals: number;
}

// --- hooks ---

export function usePauseStream() {
  const queryClient = useQueryClient();
  const { wallets } = useWallets();
  const { chainConfig, chainId } = useChain();
  const stealthWallet = useStealthWallet();

  return useMutation<void, Error, PauseStreamParams>({
    mutationFn: async ({ stream }) => {
      const nowSecs = Math.floor(Date.now() / 1000);
      const remainingDuration = stream.endTimestamp - nowSecs;
      if (remainingDuration <= 0) throw new Error("Stream already completed.");

      const remainingAmount =
        (remainingDuration / (stream.endTimestamp - stream.startTimestamp)) *
        parseFloat(stream.totalAmount);

      const { contracts } = chainConfig;

      // currReceivers includes the target stream (it's ACTIVE on-chain)
      const currReceivers = buildCurrReceiversForAccount(
        chainId,
        stream.accountId,
        stream.tokenAddress,
      );

      // Remove the target receiver
      const targetConfig = streamReceiverConfig(stream);
      const targetAccountId = BigInt(stream.recipientAccountId);
      const newReceivers = sortReceivers(
        currReceivers.filter(
          (r) => !(r.accountId === targetAccountId && r.config === targetConfig),
        ),
      );

      const transferTo = stream.accountId as `0x${string}`;

      if (stream.isPrivate && stream.walletIndex !== undefined) {
        // Private path: UserOp via derived wallet
        const calldata = encodeFunctionData({
          abi: addressDriverAbi,
          functionName: "setStreams",
          args: [
            stream.tokenAddress as `0x${string}`,
            currReceivers,
            0n,
            newReceivers,
            0,
            0,
            transferTo,
          ],
        });
        const result = await stealthWallet.sendTransactionFrom(stream.walletIndex, {
          to: contracts.addressDriver,
          data: calldata,
          value: 0n,
        });
        await stealthWallet.waitForUserOp(result.hash as string);
      } else {
        // Public path: Privy embedded wallet
        const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
        if (!embeddedWallet) throw new Error("No Privy embedded wallet found.");

        const provider = await embeddedWallet.getEthereumProvider();
        const walletClient = createWalletClient({
          account: stream.accountId as `0x${string}`,
          chain: chainConfig.chain,
          transport: custom(provider),
        });

        const publicClient = getPublicClient(chainConfig.chain);
        const hash = await walletClient.writeContract({
          address: contracts.addressDriver,
          abi: addressDriverAbi,
          functionName: "setStreams",
          args: [
            stream.tokenAddress as `0x${string}`,
            currReceivers,
            0n,
            newReceivers,
            0,
            0,
            transferTo,
          ],
        });
        await publicClient.waitForTransactionReceipt({ hash });
      }

      updateStream(chainId, stream.id, {
        status: "PAUSED",
        pausedRemainingDuration: remainingDuration,
        pausedRemainingAmount: remainingAmount.toString(),
      });

      // Immediately flush to UI so card shows PAUSED without waiting for onSuccess
      queryClient.invalidateQueries({ queryKey: ["localStreams"] });
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tokenBalance"] });
      toast.success("Stream paused");
    },
    onError: (error) => {
      toast.error(friendlyTxError(error));
    },
  });
}

export function useResumeStream() {
  const queryClient = useQueryClient();
  const { wallets } = useWallets();
  const { chainConfig, chainId } = useChain();
  const stealthWallet = useStealthWallet();

  return useMutation<void, Error, ResumeStreamParams>({
    mutationFn: async ({ stream }) => {
      if (stream.status !== "PAUSED") throw new Error("Stream is not paused.");
      const remaining = stream.pausedRemainingDuration;
      if (!remaining || remaining <= 0) throw new Error("No remaining duration to resume.");

      const { contracts } = chainConfig;

      // currReceivers excludes the paused stream (status is PAUSED)
      const currReceivers = buildCurrReceiversForAccount(
        chainId,
        stream.accountId,
        stream.tokenAddress,
      );

      // Re-add the receiver with start=0 (immediately) and remaining duration
      const newEntry = {
        accountId: BigInt(stream.recipientAccountId),
        config: packStreamConfig(stream.dripsStreamId ?? 1, BigInt(stream.amtPerSec), 0, remaining),
      };
      const newReceivers = sortReceivers([...currReceivers, newEntry]);

      const transferTo = stream.accountId as `0x${string}`;

      if (stream.isPrivate && stream.walletIndex !== undefined) {
        const calldata = encodeFunctionData({
          abi: addressDriverAbi,
          functionName: "setStreams",
          args: [
            stream.tokenAddress as `0x${string}`,
            currReceivers,
            0n,
            newReceivers,
            0,
            0,
            transferTo,
          ],
        });
        const result = await stealthWallet.sendTransactionFrom(stream.walletIndex, {
          to: contracts.addressDriver,
          data: calldata,
          value: 0n,
        });
        await stealthWallet.waitForUserOp(result.hash as string);
      } else {
        const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
        if (!embeddedWallet) throw new Error("No Privy embedded wallet found.");

        const provider = await embeddedWallet.getEthereumProvider();
        const walletClient = createWalletClient({
          account: stream.accountId as `0x${string}`,
          chain: chainConfig.chain,
          transport: custom(provider),
        });

        const publicClient = getPublicClient(chainConfig.chain);
        const hash = await walletClient.writeContract({
          address: contracts.addressDriver,
          abi: addressDriverAbi,
          functionName: "setStreams",
          args: [
            stream.tokenAddress as `0x${string}`,
            currReceivers,
            0n,
            newReceivers,
            0,
            0,
            transferTo,
          ],
        });
        await publicClient.waitForTransactionReceipt({ hash });
      }

      const nowSecs = Math.floor(Date.now() / 1000);
      // Backdate startTimestamp so that elapsed time reflects what was already
      // delivered before the pause — keeps progress & streamed amount continuous.
      const originalDuration = stream.endTimestamp - stream.startTimestamp;
      const alreadyElapsed = originalDuration - remaining;
      updateStream(chainId, stream.id, {
        status: "ACTIVE",
        startTimestamp: nowSecs - alreadyElapsed,
        endTimestamp: nowSecs + remaining,
        pausedRemainingDuration: undefined,
        pausedRemainingAmount: undefined,
      });

      queryClient.invalidateQueries({ queryKey: ["localStreams"] });
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tokenBalance"] });
      toast.success("Stream resumed");
    },
    onError: (error) => {
      toast.error(friendlyTxError(error));
    },
  });
}

export function useCancelStream() {
  const queryClient = useQueryClient();
  const { wallets } = useWallets();
  const { chainConfig, chainId } = useChain();
  const stealthWallet = useStealthWallet();

  return useMutation<void, Error, CancelStreamParams>({
    mutationFn: async ({ stream }) => {
      const nowSecs = Math.floor(Date.now() / 1000);
      const { contracts } = chainConfig;
      const isPaused = stream.status === "PAUSED";

      // Compute remaining balance to withdraw
      let remainingSecs: number;
      if (isPaused) {
        remainingSecs = stream.pausedRemainingDuration ?? 0;
      } else {
        remainingSecs = Math.max(0, stream.endTimestamp - nowSecs);
      }

      if (remainingSecs <= 0 && !isPaused) {
        throw new Error("Stream already completed. Nothing to cancel.");
      }

      const withdrawAmount =
        (BigInt(stream.amtPerSec) * BigInt(remainingSecs)) / AMT_PER_SEC_MULTIPLIER;

      // Build receiver sets based on current on-chain state
      const currReceivers = buildCurrReceiversForAccount(
        chainId,
        stream.accountId,
        stream.tokenAddress,
      );

      let newReceivers: Array<{ accountId: bigint; config: bigint }>;
      if (isPaused) {
        // Stream was already removed on-chain during pause, no receiver change needed
        newReceivers = currReceivers;
      } else {
        // Remove the target receiver
        const targetConfig = streamReceiverConfig(stream);
        const targetAccountId = BigInt(stream.recipientAccountId);
        newReceivers = sortReceivers(
          currReceivers.filter(
            (r) => !(r.accountId === targetAccountId && r.config === targetConfig),
          ),
        );
      }

      // Negative balanceDelta to withdraw remaining funds
      const balanceDelta = withdrawAmount > 0n ? -withdrawAmount : 0n;
      const transferTo = stream.accountId as `0x${string}`;

      if (stream.isPrivate && stream.walletIndex !== undefined) {
        const calldata = encodeFunctionData({
          abi: addressDriverAbi,
          functionName: "setStreams",
          args: [
            stream.tokenAddress as `0x${string}`,
            currReceivers,
            balanceDelta,
            newReceivers,
            0,
            0,
            transferTo,
          ],
        });
        const result = await stealthWallet.sendTransactionFrom(stream.walletIndex, {
          to: contracts.addressDriver,
          data: calldata,
          value: 0n,
        });
        await stealthWallet.waitForUserOp(result.hash as string);

        // Sweep: transfer withdrawn tokens from derived wallet back to main stealth wallet
        if (withdrawAmount > 0n && stealthWallet.stealthAddress) {
          const sweepCalldata = encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: [
              stealthWallet.stealthAddress as `0x${string}`,
              withdrawAmount,
            ],
          });
          const sweepResult = await stealthWallet.sendTransactionFrom(stream.walletIndex, {
            to: stream.tokenAddress,
            data: sweepCalldata,
            value: 0n,
          });
          await stealthWallet.waitForUserOp(sweepResult.hash as string);
        }
      } else {
        const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
        if (!embeddedWallet) throw new Error("No Privy embedded wallet found.");

        const provider = await embeddedWallet.getEthereumProvider();
        const walletClient = createWalletClient({
          account: stream.accountId as `0x${string}`,
          chain: chainConfig.chain,
          transport: custom(provider),
        });

        const publicClient = getPublicClient(chainConfig.chain);
        const hash = await walletClient.writeContract({
          address: contracts.addressDriver,
          abi: addressDriverAbi,
          functionName: "setStreams",
          args: [
            stream.tokenAddress as `0x${string}`,
            currReceivers,
            balanceDelta,
            newReceivers,
            0,
            0,
            transferTo,
          ],
        });
        await publicClient.waitForTransactionReceipt({ hash });
      }

      updateStream(chainId, stream.id, { status: "CANCELLED" });

      queryClient.invalidateQueries({ queryKey: ["localStreams"] });
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tokenBalance"] });
      toast.success("Stream cancelled. Remaining funds returned.");
    },
    onError: (error) => {
      toast.error(friendlyTxError(error));
    },
  });
}

export function useEditStream() {
  const queryClient = useQueryClient();
  const { wallets } = useWallets();
  const { chainConfig, chainId } = useChain();
  const stealthWallet = useStealthWallet();

  return useMutation<void, Error, EditStreamParams>({
    mutationFn: async ({ stream, newTotalAmount, newDurationSeconds, newTokenDecimals }) => {
      const nowSecs = Math.floor(Date.now() / 1000);
      const { contracts } = chainConfig;
      const isPaused = stream.status === "PAUSED";

      // Compute old remaining balance (still in protocol)
      let oldRemainingSecs: number;
      if (isPaused) {
        oldRemainingSecs = stream.pausedRemainingDuration ?? 0;
      } else {
        oldRemainingSecs = Math.max(0, stream.endTimestamp - nowSecs);
      }
      const oldRemainingWei =
        (BigInt(stream.amtPerSec) * BigInt(oldRemainingSecs)) / AMT_PER_SEC_MULTIPLIER;

      // Compute new stream parameters
      const newTokensPerSec = parseFloat(newTotalAmount) / newDurationSeconds;
      const newAmtPerSec = calcAmtPerSec(newTokensPerSec, newTokenDecimals);
      const newRequiredWei = parseUnits(newTotalAmount, newTokenDecimals);

      // Balance delta: positive = need to deposit more, negative = refund excess
      const balanceDelta = newRequiredWei - oldRemainingWei;

      // Build receiver sets
      const currReceivers = buildCurrReceiversForAccount(
        chainId,
        stream.accountId,
        stream.tokenAddress,
      );

      let baseReceivers: Array<{ accountId: bigint; config: bigint }>;
      if (isPaused) {
        // Paused stream is already removed on-chain; currReceivers doesn't include it
        baseReceivers = currReceivers;
      } else {
        // Remove the old receiver entry
        const oldConfig = streamReceiverConfig(stream);
        const targetAccountId = BigInt(stream.recipientAccountId);
        baseReceivers = currReceivers.filter(
          (r) => !(r.accountId === targetAccountId && r.config === oldConfig),
        );
      }

      // Add the new receiver entry
      const newEntry = {
        accountId: BigInt(stream.recipientAccountId),
        config: packStreamConfig(stream.dripsStreamId ?? 1, newAmtPerSec, 0, newDurationSeconds),
      };
      const newReceivers = sortReceivers([...baseReceivers, newEntry]);

      const transferTo = stream.accountId as `0x${string}`;

      if (stream.isPrivate && stream.walletIndex !== undefined) {
        const txs: Array<{ to: string; data: string; value?: bigint }> = [];

        // If we need more tokens, fund the derived wallet first
        if (balanceDelta > 0n) {
          await stealthWallet.fundDerivedWallet(
            stream.walletIndex,
            stream.tokenAddress,
            balanceDelta,
          );
          // Approve the additional tokens
          const approveCalldata = encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [contracts.addressDriver, balanceDelta],
          });
          txs.push({ to: stream.tokenAddress, data: approveCalldata });
        }

        const setStreamsCalldata = encodeFunctionData({
          abi: addressDriverAbi,
          functionName: "setStreams",
          args: [
            stream.tokenAddress as `0x${string}`,
            currReceivers,
            balanceDelta,
            newReceivers,
            0,
            0,
            transferTo,
          ],
        });
        txs.push({ to: contracts.addressDriver, data: setStreamsCalldata, value: 0n });

        const result = await stealthWallet.sendTransactionFrom(
          stream.walletIndex,
          txs.length === 1 ? txs[0] : txs,
        );
        await stealthWallet.waitForUserOp(result.hash as string);

        // If excess was returned (negative delta), sweep back to main wallet
        if (balanceDelta < 0n && stealthWallet.stealthAddress) {
          const excessAmount = -balanceDelta;
          const sweepCalldata = encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: [stealthWallet.stealthAddress as `0x${string}`, excessAmount],
          });
          const sweepResult = await stealthWallet.sendTransactionFrom(stream.walletIndex, {
            to: stream.tokenAddress,
            data: sweepCalldata,
            value: 0n,
          });
          await stealthWallet.waitForUserOp(sweepResult.hash as string);
        }
      } else {
        const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
        if (!embeddedWallet) throw new Error("No Privy embedded wallet found.");

        const provider = await embeddedWallet.getEthereumProvider();
        const publicClient = getPublicClient(chainConfig.chain);
        const walletClient = createWalletClient({
          account: stream.accountId as `0x${string}`,
          chain: chainConfig.chain,
          transport: custom(provider),
        });

        // If we need more tokens, approve the additional amount
        if (balanceDelta > 0n) {
          const approveHash = await walletClient.writeContract({
            address: stream.tokenAddress as `0x${string}`,
            abi: erc20Abi,
            functionName: "approve",
            args: [contracts.addressDriver, balanceDelta],
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }

        const hash = await walletClient.writeContract({
          address: contracts.addressDriver,
          abi: addressDriverAbi,
          functionName: "setStreams",
          args: [
            stream.tokenAddress as `0x${string}`,
            currReceivers,
            balanceDelta,
            newReceivers,
            0,
            0,
            transferTo,
          ],
        });
        await publicClient.waitForTransactionReceipt({ hash });
      }

      updateStream(chainId, stream.id, {
        status: "ACTIVE",
        amtPerSec: newAmtPerSec.toString(),
        totalAmount: newTotalAmount,
        startTimestamp: nowSecs,
        endTimestamp: nowSecs + newDurationSeconds,
        pausedRemainingDuration: undefined,
        pausedRemainingAmount: undefined,
      });

      queryClient.invalidateQueries({ queryKey: ["localStreams"] });
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tokenBalance"] });
      toast.success("Stream updated");
    },
    onError: (error) => {
      toast.error(friendlyTxError(error));
    },
  });
}
