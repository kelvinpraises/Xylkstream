// deposit-privacy-form.tsx — shields tokens into the privacy pool via approve → deposit → ZK proof → remint pipeline

import { useState, useCallback } from "react";
import {
  createWalletClient,
  custom,
  encodeFunctionData,
  parseUnits,
  formatUnits,
  type WalletClient,
} from "viem";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import {
  ShieldCheck,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Lock,
  Layers,
  Cpu,
  Zap,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/molecules/dialog";
import { Button } from "@/components/atoms/button";
import { toast } from "sonner";
import { useStealthWallet } from "@/providers/stealth-wallet-provider";
import { usePrivacyEngine } from "@/hooks/use-privacy-engine";
import { erc20Abi, zwerc20Abi, getPublicClient } from "@/utils/streams";
import { useChain } from "@/providers/chain-provider";

// --- types ---

export interface DepositPrivacyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TokenChoice = "usdt" | "usdc";

type Step =
  | "enter-amount"
  | "approving"
  | "shielding"
  | "preparing-proof"
  | "reminting"
  | "done";

const STEP_ORDER: Step[] = [
  "enter-amount",
  "approving",
  "shielding",
  "preparing-proof",
  "reminting",
  "done",
];

const STEP_META: Record<
  Step,
  { label: string; description: string; icon: React.ComponentType<{ className?: string }> }
> = {
  "enter-amount": {
    label: "Enter Amount",
    description: "Choose how much to shield",
    icon: Lock,
  },
  approving: {
    label: "Approving",
    description: "Privy wallet approves spend",
    icon: CheckCircle2,
  },
  shielding: {
    label: "Shielding",
    description: "Depositing to privacy pool",
    icon: Layers,
  },
  "preparing-proof": {
    label: "Preparing Proof",
    description: "Generating ZK proof (~2–4s)",
    icon: Cpu,
  },
  reminting: {
    label: "Reminting",
    description: "Sending to stealth wallet",
    icon: Zap,
  },
  done: {
    label: "Done",
    description: "Funds are shielded",
    icon: Sparkles,
  },
};

// Token decimals — 18 for both USDC and USDT
const TOKEN_DECIMALS = 18;
const TOKEN_ID = 0n;

// --- step indicator ---

function StepIndicator({ current }: { current: Step }) {
  const displaySteps: Step[] = [
    "approving",
    "shielding",
    "preparing-proof",
    "reminting",
    "done",
  ];

  return (
    <div className="flex items-center gap-1 mb-6">
      {displaySteps.map((step, idx) => {
        const currentIdx = STEP_ORDER.indexOf(current);
        const stepIdx = STEP_ORDER.indexOf(step);
        const isCompleted = currentIdx > stepIdx;
        const isActive = current === step;

        return (
          <div key={step} className="flex items-center gap-1 flex-1 min-w-0">
            {/* Circle */}
            <div
              className={[
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0 transition-all",
                isCompleted
                  ? "bg-amber-500 text-stone-950"
                  : isActive
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/60 ring-2 ring-amber-500/20"
                    : "bg-stone-800 text-stone-500 border border-stone-700",
              ].join(" ")}
            >
              {isCompleted ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <span>{idx + 1}</span>
              )}
            </div>
            {/* Connector line */}
            {idx < displaySteps.length - 1 && (
              <div
                className={[
                  "h-px flex-1 transition-all",
                  isCompleted ? "bg-amber-500/60" : "bg-stone-700",
                ].join(" ")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- main dialog ---

export function DepositPrivacyDialog({ open, onOpenChange }: DepositPrivacyDialogProps) {
  const { ready } = usePrivy();
  const { wallets } = useWallets();
  const { stealthAddress, sendTransaction, isReady: stealthReady } = useStealthWallet();
  const {
    generateSecret,
    storeSecret,
    syncTree,
    generateRemintProof,
    resolveLeafIndex,
    markSpent,
    proofProgress,
  } = usePrivacyEngine();
  const { chainConfig } = useChain();

  const [step, setStep] = useState<Step>("enter-amount");
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState<TokenChoice>("usdt");
  const [error, setError] = useState<string | null>(null);
  const [stealthBalance, setStealthBalance] = useState<string | null>(null);

  const tokenSymbol = selectedToken === "usdc" ? "USDC" : "USDT";
  const zwTokenSymbol = selectedToken === "usdc" ? "zwUSDC" : "zwUSDT";

  // reset state when dialog closes

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setStep("enter-amount");
        setAmount("");
        setSelectedToken("usdt");
        setError(null);
        setStealthBalance(null);
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  // --- core deposit pipeline ---

  const handleDeposit = useCallback(async () => {
    setError(null);

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Please enter a valid amount.");
      return;
    }
    if (!stealthReady || !stealthAddress) {
      setError("Stealth wallet not ready — unlock it from the dashboard first.");
      return;
    }

    const zwTokenAddress =
      selectedToken === "usdc"
        ? chainConfig.contracts.zwUsdc
        : chainConfig.contracts.zwUsdt;

    const tokenAddress =
      selectedToken === "usdc"
        ? chainConfig.contracts.mockUsdc
        : chainConfig.contracts.mockUsdt;

    const amountWei = parseUnits(amount, TOKEN_DECIMALS);

    // step 2: approve token from the public Privy wallet

    setStep("approving");

    let walletClient: WalletClient;
    try {
      const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
      if (!embeddedWallet) throw new Error("No Privy embedded wallet found — please log in.");

      const provider = await embeddedWallet.getEthereumProvider();
      walletClient = createWalletClient({
        account: embeddedWallet.address as `0x${string}`,
        chain: chainConfig.chain,
        transport: custom(provider),
      });

      await walletClient.writeContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [zwTokenAddress, amountWei],
        account: embeddedWallet.address as `0x${string}`,
        chain: chainConfig.chain,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed.");
      setStep("enter-amount");
      return;
    }

    // step 3: derive privacy address + deposit to zw token

    setStep("shielding");

    let privacySecretData: ReturnType<typeof generateSecret>;
    try {
      privacySecretData = generateSecret(TOKEN_ID);
      storeSecret(privacySecretData);

      const embeddedWallet = wallets.find((w) => w.walletClientType === "privy")!;

      await walletClient.writeContract({
        address: zwTokenAddress,
        abi: zwerc20Abi,
        functionName: "deposit",
        args: [privacySecretData.privacyAddress as `0x${string}`, TOKEN_ID, amountWei, "0x"],
        account: embeddedWallet.address as `0x${string}`,
        chain: chainConfig.chain,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deposit failed.");
      setStep("enter-amount");
      return;
    }

    // step 4: sync Merkle tree + generate ZK proof

    setStep("preparing-proof");

    let remintData: Awaited<ReturnType<typeof generateRemintProof>>["remintData"];
    try {
      // Sync tree to include our new leaf
      await syncTree();

      // Resolve the leaf index by scanning on-chain leaves for our privacy address
      const publicClient = getPublicClient(chainConfig.chain);
      const leafCount = (await publicClient.readContract({
        address: zwTokenAddress,
        abi: zwerc20Abi,
        functionName: "getCommitLeafCount",
        args: [TOKEN_ID],
      })) as bigint;

      if (leafCount > 0n) {
        const [, addresses, amounts] = (await publicClient.readContract({
          address: zwTokenAddress,
          abi: zwerc20Abi,
          functionName: "getCommitLeaves",
          args: [TOKEN_ID, 0n, leafCount],
        })) as [`0x${string}`[], `0x${string}`[], bigint[]];

        const leafIdx = addresses.findIndex(
          (a) =>
            a.toLowerCase() === privacySecretData.privacyAddress.toLowerCase(),
        );
        if (leafIdx !== -1) {
          resolveLeafIndex(privacySecretData.privacyAddress, leafIdx, amounts[leafIdx]);
        }
      }

      // Generate the ZK proof
      const result = await generateRemintProof(
        privacySecretData.privacyAddress,
        stealthAddress as `0x${string}`,
        amountWei,
      );
      remintData = result.remintData;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Proof generation failed.");
      setStep("enter-amount");
      return;
    }

    // step 5: remint to stealth wallet via 4337 UserOp

    setStep("reminting");

    try {
      const calldata = encodeFunctionData({
        abi: zwerc20Abi,
        functionName: "remint",
        args: [
          stealthAddress as `0x${string}`,
          TOKEN_ID,
          amountWei,
          {
            commitment: remintData.commitment,
            nullifiers: remintData.nullifiers,
            proof: remintData.proof,
            redeem: remintData.redeem,
            proverData: remintData.proverData,
            relayerData: remintData.relayerData,
          },
        ],
      });

      await sendTransaction({
        to: zwTokenAddress,
        data: calldata,
      });

      markSpent(privacySecretData.privacyAddress);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remint failed.");
      setStep("enter-amount");
      return;
    }

    // step 6: done — fetch updated stealth balance

    try {
      const publicClient = getPublicClient(chainConfig.chain);
      const bal = (await publicClient.readContract({
        address: zwTokenAddress,
        abi: zwerc20Abi,
        functionName: "balanceOf",
        args: [stealthAddress as `0x${string}`],
      })) as bigint;
      setStealthBalance(formatUnits(bal, TOKEN_DECIMALS));
    } catch {
      // Non-fatal — we can still show done without the balance
    }

    setStep("done");
    toast.success("Funds shielded to your stealth wallet.");
  }, [
    amount,
    selectedToken,
    wallets,
    stealthReady,
    stealthAddress,
    chainConfig,
    generateSecret,
    storeSecret,
    syncTree,
    generateRemintProof,
    resolveLeafIndex,
    markSpent,
    sendTransaction,
  ]);

  // --- derived state ---

  const isAutoStep =
    step === "approving" ||
    step === "shielding" ||
    step === "preparing-proof" ||
    step === "reminting";

  const proofProgressLabel: Record<typeof proofProgress, string> = {
    idle: "Initialising...",
    "building-tree": "Rebuilding Merkle tree...",
    "generating-proof": "Generating Groth16 proof...",
    encoding: "Encoding calldata...",
  };

  // --- render ---

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-400" />
            Shield Funds
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator (shown during/after pipeline) */}
        {step !== "enter-amount" && <StepIndicator current={step} />}

        <div className="space-y-5">
          {/* ── Step 1: Enter amount ── */}
          {step === "enter-amount" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Wrap tokens into their private version and remint to your stealth wallet.
                Your public wallet is used to deposit; the stealth wallet receives the shielded tokens.
              </p>

              {/* Token selector */}
              <div className="flex gap-2">
                {(["usdt", "usdc"] as TokenChoice[]).map((token) => {
                  const isActive = selectedToken === token;
                  return (
                    <button
                      key={token}
                      type="button"
                      onClick={() => setSelectedToken(token)}
                      className={[
                        "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all",
                        isActive
                          ? "bg-amber-500/20 border-amber-500/60 text-amber-400"
                          : "bg-stone-800 border-stone-700 text-stone-500 hover:text-stone-400",
                      ].join(" ")}
                    >
                      {token.toUpperCase()}
                    </button>
                  );
                })}
              </div>

              {/* Amount input */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">
                  Amount
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 focus-within:border-amber-500/50 transition-colors">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="flex-1 bg-transparent text-foreground text-lg font-mono outline-none placeholder:text-muted-foreground/40"
                  />
                  <span className="text-sm text-muted-foreground font-medium shrink-0">
                    {tokenSymbol}
                  </span>
                </div>
              </div>

              {/* Stealth wallet readiness notice */}
              {!stealthReady && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-300/80">
                    Stealth wallet not unlocked — enter your password on the dashboard first.
                  </p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-300">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!ready || !amount || parseFloat(amount) <= 0 || !stealthReady}
                  onClick={handleDeposit}
                  className="bg-gradient-to-r from-amber-600 to-amber-500 text-stone-950 hover:from-amber-500 hover:to-amber-400 border-0"
                >
                  <ShieldCheck className="w-4 h-4 mr-1.5" />
                  Deposit
                </Button>
              </div>
            </div>
          )}

          {/* ── Auto-progress steps 2–5 ── */}
          {isAutoStep && (
            <div className="space-y-4">
              {/* Current step card */}
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3">
                <Loader2 className="w-5 h-5 text-amber-400 animate-spin shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-amber-300">
                    {STEP_META[step].label}
                  </p>
                  <p className="text-xs text-amber-300/60 mt-0.5">
                    {step === "preparing-proof"
                      ? proofProgressLabel[proofProgress]
                      : STEP_META[step].description}
                  </p>
                </div>
              </div>

              {/* Previous steps summary */}
              <div className="space-y-2">
                {STEP_ORDER.slice(1).map((s) => {
                  const currentIdx = STEP_ORDER.indexOf(step);
                  const sIdx = STEP_ORDER.indexOf(s);
                  if (sIdx >= currentIdx || s === "done") return null;
                  const meta = STEP_META[s];
                  const Icon = meta.icon;
                  return (
                    <div key={s} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Icon className="w-3.5 h-3.5 text-amber-500/60 shrink-0" />
                      <span>{meta.label} — done</span>
                    </div>
                  );
                })}
              </div>

              {/* Error (non-fatal mid-pipeline) */}
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-300">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Step 6: Done ── */}
          {step === "done" && (
            <div className="space-y-4">
              {/* Success card */}
              <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-rose-500/5 p-5 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto">
                  <ShieldCheck className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                  <p className="text-foreground font-medium">Funds shielded</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {amount} {tokenSymbol} is now in your stealth wallet as {zwTokenSymbol}
                  </p>
                </div>

                {stealthBalance !== null && (
                  <div className="rounded-lg border border-border bg-card px-4 py-3">
                    <p className="text-xs text-muted-foreground mb-1">Stealth balance</p>
                    <p className="font-mono text-xl text-amber-400 font-light">
                      {parseFloat(stealthBalance).toFixed(4)}{" "}
                      <span className="text-sm text-muted-foreground">{zwTokenSymbol}</span>
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => handleOpenChange(false)}
                >
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
