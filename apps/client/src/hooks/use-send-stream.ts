/**
 * use-send-stream.ts — on-chain stream creation hook
 *
 * Two execution paths:
 *   • Public  — Privy embedded wallet signs ERC-20 approve + setStreams directly
 *   • Private — Stealth ERC-4337 Safe approves + calls setStreams via UserOperation
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, encodeFunctionData, parseUnits } from "viem";
import {
  ADDRESS_DRIVER_ABI,
  ERC20_ABI,
  calcAmtPerSec,
  calcAccountId,
  packStreamConfig,
  getContractAddresses,
  getPublicClient,
  bsc,
} from "@/lib/drips";
import { useStealthWallet } from "./use-stealth-wallet";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SendStreamParams {
  /** ERC-20 token contract address */
  tokenAddress: `0x${string}`;
  /** Recipient's Ethereum address */
  recipientAddress: `0x${string}`;
  /** Human-readable total token amount, e.g. "1000" */
  totalAmount: string;
  /** Token decimals (e.g. 18 for USDT on BSC) */
  tokenDecimals: number;
  /** Total stream duration in seconds */
  durationSeconds: number;
  /** Stream slot ID — must be unique per sender+receiver pair; defaults to 1 */
  streamId?: number;
  /** When true, routes through the stealth ERC-4337 Safe (privacy path) */
  usePrivacy?: boolean;
}

export interface SendStreamResult {
  /** Transaction hash of the setStreams call (or UserOp hash for private path) */
  txHash: `0x${string}`;
  /** Drips account ID derived for the recipient */
  receiverAccountId: bigint;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSendStream() {
  const queryClient = useQueryClient();
  const { wallets } = useWallets();
  const stealthWallet = useStealthWallet();

  return useMutation<SendStreamResult, Error, SendStreamParams>({
    mutationFn: async (params) => {
      const {
        tokenAddress,
        recipientAddress,
        totalAmount,
        tokenDecimals,
        durationSeconds,
        streamId = 1,
        usePrivacy = false,
      } = params;

      const addresses = getContractAddresses();
      const publicClient = getPublicClient();

      // -----------------------------------------------------------------------
      // Shared stream-parameter calculations
      // -----------------------------------------------------------------------

      const totalAmountWei = parseUnits(totalAmount, tokenDecimals);
      const tokensPerSec = Number(totalAmount) / durationSeconds;
      const amtPerSec = calcAmtPerSec(tokensPerSec, tokenDecimals);
      const config = packStreamConfig(streamId, amtPerSec, 0, durationSeconds);

      // Derive the recipient's Drips account ID via the AddressDriver on-chain
      // helper (avoids duplicating the driver-ID lookup in the client).
      const receiverAccountId = await publicClient.readContract({
        address: addresses.addressDriver,
        abi: ADDRESS_DRIVER_ABI,
        functionName: "calcAccountId",
        args: [recipientAddress],
      });

      // -----------------------------------------------------------------------
      // PUBLIC PATH — Privy embedded wallet
      // -----------------------------------------------------------------------

      if (!usePrivacy) {
        const embeddedWallet = wallets.find(
          (w) => w.walletClientType === "privy",
        );
        if (!embeddedWallet) {
          throw new Error("No Privy embedded wallet found. Make sure you are logged in.");
        }

        const provider = await embeddedWallet.getEthereumProvider();
        const senderAddress = embeddedWallet.address as `0x${string}`;

        const walletClient = createWalletClient({
          account: senderAddress,
          chain: bsc,
          transport: custom(provider),
        });

        // Step 1 — ERC-20 approve: let AddressDriver pull the streaming deposit
        const approveHash = await walletClient.writeContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [addresses.addressDriver, totalAmountWei],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });

        // Step 2 — setStreams: create the stream on-chain
        const setStreamsHash = await walletClient.writeContract({
          address: addresses.addressDriver,
          abi: ADDRESS_DRIVER_ABI,
          functionName: "setStreams",
          args: [
            tokenAddress,
            [],                                             // currReceivers — empty for a brand-new stream
            totalAmountWei as unknown as bigint,            // balanceDelta (int128 positive = deposit)
            [{ accountId: receiverAccountId, config }],     // newReceivers
            0,                                              // maxEndHint1 — 0 = let contract compute
            0,                                              // maxEndHint2
            senderAddress,                                  // transferTo — refund address on top-up/withdrawal
          ],
        });
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: setStreamsHash,
        });

        return {
          txHash: receipt.transactionHash,
          receiverAccountId,
        };
      }

      // -----------------------------------------------------------------------
      // PRIVATE PATH — Stealth ERC-4337 Safe via WDK UserOperation
      // -----------------------------------------------------------------------

      if (!stealthWallet.isReady) {
        throw new Error(
          "Stealth wallet is not initialised. Call deriveWallet() before streaming privately.",
        );
      }

      // Step 1 — Approve from the Safe via UserOperation
      await stealthWallet.approve({
        token: tokenAddress,
        spender: addresses.addressDriver,
        amount: totalAmountWei,
      });

      // Step 2 — setStreams via UserOperation
      const stealthAddress = stealthWallet.stealthAddress as `0x${string}`;

      const setStreamsCalldata = encodeFunctionData({
        abi: ADDRESS_DRIVER_ABI,
        functionName: "setStreams",
        args: [
          tokenAddress,
          [],
          totalAmountWei as unknown as bigint,
          [{ accountId: receiverAccountId, config }],
          0,
          0,
          stealthAddress,
        ],
      });

      const result = await stealthWallet.sendTransaction({
        to: addresses.addressDriver,
        data: setStreamsCalldata,
        value: 0n,
      });

      return {
        txHash: result.hash as `0x${string}`,
        receiverAccountId,
      };
    },

    onSuccess: () => {
      // Refresh stream list and balances after a successful stream creation.
      queryClient.invalidateQueries({ queryKey: ["streams"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-balances"] });
    },
  });
}
