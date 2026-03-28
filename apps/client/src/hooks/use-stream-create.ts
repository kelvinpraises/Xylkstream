// use-stream-create.ts — on-chain stream creation hook (public path via Privy, private path via stealth ERC-4337 Safe)

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, encodeFunctionData, parseUnits } from "viem";
import {
  addressDriverAbi,
  erc20Abi,
  calcAmtPerSec,
  packStreamConfig,
  getPublicClient,
} from "@/utils/streams";
import { useChain } from "@/providers/chain-provider";
import { addStream, getStreams } from "@/store/stream-store";
import { useStealthWallet } from "@/providers/stealth-wallet-provider";

/**
 * Build the currReceivers array from existing active localStorage streams
 * for a given sender + token. Drips requires the current on-chain receiver set
 * to verify the hash before replacing it.
 */
function buildCurrReceivers(
  chainId: number,
  senderAccountId: string,
  tokenAddress: string,
  _nowSecs: number,
) {
  // Include ALL streams for this sender+token — expired streams remain in the
  // on-chain receiver set until explicitly removed via setStreams.
  const existing = getStreams(chainId).filter(
    (s) =>
      s.accountId.toLowerCase() === senderAccountId.toLowerCase() &&
      s.tokenAddress.toLowerCase() === tokenAddress.toLowerCase(),
  );
  // Must be sorted by (accountId, config) ascending — Drips enforces ordering
  return existing
    .map((s) => ({
      accountId: BigInt(s.recipientAccountId),
      config: packStreamConfig(
        s.dripsStreamId ?? 1,
        BigInt(s.amtPerSec),
        0,
        s.endTimestamp - s.startTimestamp,
      ),
    }))
    .sort((a, b) => {
      if (a.accountId < b.accountId) return -1;
      if (a.accountId > b.accountId) return 1;
      if (a.config < b.config) return -1;
      if (a.config > b.config) return 1;
      return 0;
    });
}

/** Get the next available Drips stream ID for this sender+token. */
function nextStreamId(chainId: number, senderAccountId: string, tokenAddress: string): number {
  const existing = getStreams(chainId).filter(
    (s) =>
      s.accountId.toLowerCase() === senderAccountId.toLowerCase() &&
      s.tokenAddress.toLowerCase() === tokenAddress.toLowerCase(),
  );
  const maxId = existing.reduce((max, s) => Math.max(max, s.dripsStreamId ?? 1), 0);
  return maxId + 1;
}

/** Get the next available wallet derivation index for per-stream wallets. */
function nextWalletIndex(chainId: number): number {
  const existing = getStreams(chainId).filter((s) => s.isPrivate && s.walletIndex !== undefined);
  if (existing.length === 0) return 1; // index 0 is the main stealth wallet
  return Math.max(...existing.map((s) => s.walletIndex!)) + 1;
}

// --- types ---

export interface SendStreamParams {
  tokenAddress: `0x${string}`;
  recipientAddress: `0x${string}`;
  totalAmount: string;
  tokenDecimals: number;
  durationSeconds: number;
  streamId?: number;
  usePrivacy?: boolean;
  tokenSymbol?: string;
  startTimestamp?: number;
}

export interface SendStreamResult {
  txHash: `0x${string}`;
  receiverAccountId: bigint;
}

// --- hook ---

export function useCreateStream() {
  const queryClient = useQueryClient();
  const { wallets } = useWallets();
  const { chainConfig, chainId } = useChain();
  const stealthWallet = useStealthWallet();

  return useMutation<SendStreamResult, Error, SendStreamParams>({
    mutationFn: async (params) => {
      const {
        tokenAddress,
        recipientAddress,
        totalAmount,
        tokenDecimals,
        durationSeconds,
        usePrivacy = false,
        tokenSymbol = "TOKEN",
        startTimestamp,
      } = params;

      const nowSecs = Math.floor(Date.now() / 1000);
      const streamStart = startTimestamp ?? nowSecs;
      const streamEnd = streamStart + durationSeconds;

      const publicClient = getPublicClient(chainConfig.chain);
      const { contracts } = chainConfig;

      const totalAmountWei = parseUnits(totalAmount, tokenDecimals);
      const tokensPerSec = Number(totalAmount) / durationSeconds;
      const amtPerSec = calcAmtPerSec(tokensPerSec, tokenDecimals);

      const receiverAccountId = await publicClient.readContract({
        address: contracts.addressDriver,
        abi: addressDriverAbi,
        functionName: "calcAccountId",
        args: [recipientAddress],
      });

      // Determine sender address early so we can look up existing streams
      const senderAddress = usePrivacy
        ? (stealthWallet.stealthAddress as `0x${string}`)
        : (wallets.find((w) => w.walletClientType === "privy")?.address as `0x${string}`);

      if (!senderAddress) {
        throw new Error(usePrivacy
          ? "Stealth wallet not initialised."
          : "No Privy embedded wallet found.");
      }

      // Build current on-chain receiver set from localStorage
      const currReceivers = buildCurrReceivers(chainId, senderAddress, tokenAddress, nowSecs);

      // Auto-increment stream ID to avoid collisions
      const streamId = params.streamId ?? nextStreamId(chainId, senderAddress, tokenAddress);
      const config = packStreamConfig(streamId, amtPerSec, 0, durationSeconds);

      // New receivers = current + the new one, sorted
      const newReceivers = [...currReceivers, { accountId: receiverAccountId, config }]
        .sort((a, b) => {
          if (a.accountId < b.accountId) return -1;
          if (a.accountId > b.accountId) return 1;
          if (a.config < b.config) return -1;
          if (a.config > b.config) return 1;
          return 0;
        });

      // --- public path: privy embedded wallet ---

      if (!usePrivacy) {
        const embeddedWallet = wallets.find(
          (w) => w.walletClientType === "privy",
        );
        if (!embeddedWallet) {
          throw new Error("No Privy embedded wallet found. Make sure you are logged in.");
        }

        const provider = await embeddedWallet.getEthereumProvider();

        const walletClient = createWalletClient({
          account: senderAddress,
          chain: chainConfig.chain,
          transport: custom(provider),
        });

        const approveHash = await walletClient.writeContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "approve",
          args: [contracts.addressDriver, totalAmountWei],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });

        const setStreamsHash = await walletClient.writeContract({
          address: contracts.addressDriver,
          abi: addressDriverAbi,
          functionName: "setStreams",
          args: [
            tokenAddress,
            currReceivers,
            totalAmountWei as unknown as bigint,
            newReceivers,
            0,
            0,
            senderAddress,
          ],
        });
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: setStreamsHash,
        });

        addStream({
          id: crypto.randomUUID(),
          chainId,
          accountId: senderAddress,
          recipientAddress,
          recipientAccountId: receiverAccountId.toString(),
          tokenAddress,
          tokenSymbol,
          totalAmount,
          amtPerSec: amtPerSec.toString(),
          dripsStreamId: streamId,
          startTimestamp: streamStart,
          endTimestamp: streamEnd,
          isPrivate: false,
          txHash: receipt.transactionHash,
          createdAt: new Date().toISOString(),
        });

        return {
          txHash: receipt.transactionHash,
          receiverAccountId,
        };
      }

      // --- private path: per-stream derived wallet via WDK UserOperation ---

      if (!stealthWallet.isReady) {
        throw new Error(
          "Stealth wallet is not initialised. Call deriveWallet() before streaming privately.",
        );
      }

      // Each stream gets its own derived wallet for isolation
      const walletIndex = nextWalletIndex(chainId);
      const { address: streamWalletAddress } =
        await stealthWallet.getAccountAtIndex(walletIndex);

      // Step 1: Fund the per-stream wallet from the main stealth wallet
      const fundResult = await stealthWallet.fundDerivedWallet(walletIndex, tokenAddress, totalAmountWei);
      await stealthWallet.waitForUserOp(fundResult.hash as string);

      // Step 2: Deploy the sub-wallet Safe (nonce 0 — factory creates it)
      // Kept separate from step 3 to stay under Substrate proof_size weight limits.
      const deployResult = await stealthWallet.sendTransactionFrom(walletIndex, {
        to: streamWalletAddress,
        data: "0x",
        value: 0n,
      });
      await stealthWallet.waitForUserOp(deployResult.hash as string);

      // Step 3: Approve + setStreams (Safe is now deployed, lighter UserOp)
      const approveCalldata = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [contracts.addressDriver, totalAmountWei],
      });

      const setStreamsCalldata = encodeFunctionData({
        abi: addressDriverAbi,
        functionName: "setStreams",
        args: [
          tokenAddress,
          [], // fresh wallet — no existing receivers
          totalAmountWei as unknown as bigint,
          [{ accountId: receiverAccountId, config }],
          0,
          0,
          streamWalletAddress as `0x${string}`,
        ],
      });

      const result = await stealthWallet.sendTransactionFrom(walletIndex, [
        { to: tokenAddress, data: approveCalldata },
        { to: contracts.addressDriver, data: setStreamsCalldata, value: 0n },
      ]);

      addStream({
        id: crypto.randomUUID(),
        chainId,
        accountId: streamWalletAddress,
        recipientAddress,
        recipientAccountId: receiverAccountId.toString(),
        tokenAddress,
        tokenSymbol,
        totalAmount,
        amtPerSec: amtPerSec.toString(),
        dripsStreamId: streamId,
        startTimestamp: streamStart,
        endTimestamp: streamEnd,
        isPrivate: true,
        walletIndex,
        walletAddress: streamWalletAddress,
        txHash: result.hash as string,
        createdAt: new Date().toISOString(),
      });

      return {
        txHash: result.hash as `0x${string}`,
        receiverAccountId,
      };
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["localStreams"] });
      queryClient.invalidateQueries({ queryKey: ["tokenBalance"] });
    },
  });
}
